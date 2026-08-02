/**
 * Build script — compiles SCSS to content-hashed CSS and codegens the paths.
 *
 * WHAT
 *   1. Compiles each SCSS entry point with dart-sass.
 *   2. Hashes the output and writes `dist/css/<name>.<hash8>.css`.
 *   3. Removes stale hashed builds of the same entry.
 *   4. Rewrites `bunood_theme/assets.py` with the hashed URLs, which `hooks.py`
 *      imports so `app_include_css` carries the hash.
 *
 * WHY WE BUILD HERE AND NOT WITH `bench build`
 *   `node` IS present in the runtime container
 *   (`/home/frappe/.nvm/versions/node/v24.12.0/bin/node`) but is absent from the
 *   PATH of non-interactive shells, and more importantly `bench build` writes to
 *   `apps/<app>/<app>/public/dist/` — the container's WRITABLE LAYER, which is
 *   destroyed on `docker compose down` / recreate. Building on the host and
 *   shipping the output makes the asset a durable part of the app.
 *
 * WHY WE HASH THE FILENAME INSTEAD OF USING `?v=`
 *   `app_include_css` is a plain Python list and cannot compute a query string at
 *   request time. v1 hand-maintained 30+ `?v=N` suffixes and they drifted. A
 *   content hash is authoritative and free.
 *
 * WHY THE FILENAME MUST NOT CONTAIN `.bundle.`
 *   `frappe/utils/jinja_globals.py:147` treats any path containing `.bundle.`
 *   that is not under `/assets` as a LOGICAL bundle name: it looks it up in
 *   `sites/assets/assets.json` (stale in this deployment) and, on Arabic, Hebrew,
 *   Farsi or Pashto sites, prefixes it with `rtl_`. Either path yields a 404 —
 *   and the RTL one would fail for Arabic tenants only. See ARCHITECTURE.md §6.
 *
 * USAGE
 *   npm install
 *   npm run build      # once
 *   npm run watch      # rebuild on change
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP = join(ROOT, "bunood_theme");
const SCSS = join(APP, "public", "scss");
const JS = join(APP, "public", "js");
const DIST_CSS = join(APP, "public", "dist", "css");
const DIST_JS = join(APP, "public", "dist", "js");

/**
 * Entry points to compile.
 *
 * `key`  — output basename and the constant name used in assets.py
 * `src`  — SCSS entry, relative to public/scss
 * `pyid` — the constant written into assets.py
 */
const ENTRIES = [
	{ key: "bunood", src: "bunood.scss", pyid: "THEME_CSS" },
	// The web/login sheet is deliberately separate: the login page is a WEBSITE
	// page, gets `web_include_css` rather than `app_include_css`, and Frappe's own
	// login bundle loads AFTER ours there — so it needs its own, smaller sheet.
	// { key: "bunood-web", src: "web/login.scss", pyid: "WEB_CSS" },
];

/** Short content hash. 8 hex chars matches what Frappe's Website Theme uses. */
function hash8(text) {
	return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/**
 * RTL guard — fail the build if compiled CSS contains a physical property.
 *
 * The theme's RTL strategy (ARCHITECTURE.md §9) is logical properties ONLY:
 * one sheet serves LTR and Arabic with no rtlcss pass and no dependency on the
 * stale assets-rtl.json manifest. That strategy holds exactly as long as no
 * `margin-left` ever ships — and a human reviewer will eventually miss one, so
 * the build refuses instead.
 *
 * Checked on the COMPILED output, not the SCSS, so nothing can slip through an
 * import or a mixin. `left`/`right` as *values* (text-align, float) are caught
 * too; `border-radius` corner longhands (`border-top-left-radius`) are the one
 * deliberate allowance — corners flip meaning rarely and Frappe itself uses
 * them; revisit if a corner ever looks wrong in Arabic.
 *
 * @param {string} css - compiled stylesheet text
 * @param {string} name - entry name, for the error message
 */
function assertLogicalOnly(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	const patterns = [
		/(?<!border-top-|border-bottom-)(margin|padding|border|inset)-(left|right)\b/g,
		/(?<![-\w])(left|right)\s*:/g,
		/float\s*:\s*(left|right)/g,
		/text-align\s*:\s*(left|right)/g,
		/clear\s*:\s*(left|right)/g,
	];
	for (const re of patterns) {
		for (const m of stripped.matchAll(re)) offenders.push(m[0]);
	}
	if (offenders.length) {
		throw new Error(
			`RTL guard: ${name} contains physical properties: ${[...new Set(offenders)].join(", ")}. ` +
				"Use logical equivalents (margin-inline-start, inset-inline-end, text-align: start...)."
		);
	}
}

/**
 * Field-naming guard — fail the build if a Theme Settings field for a component
 * is not named `<component>_<property>`.
 *
 * WHY A GUARD AND NOT A CONVENTION
 *   Conventions drift silently, and this one already did: `search_placement` is
 *   filed under the Status Bar section, `enable_command_palette` sits in
 *   "Features" away from its seven `palette_*` siblings, and `default_density`
 *   lives under "Generated" beside a build artefact. Each was defensible on the
 *   day it was written; together they are why the boot payload, the form order
 *   and the stand-down list cannot be generated from one table — a generator
 *   would need a lookup of exceptions, which is the thing being deleted.
 *
 * THE EXCEPTIONS ARE LISTED, NOT PATTERN-MATCHED, AND THE LIST MUST SHRINK.
 *   Renaming a stored Single field needs a patch, so the two real violations
 *   are fixed when the component rework writes one anyway. Until then they are
 *   named here so no NEW drift can enter unnoticed. Do not add to this list to
 *   make a build pass.
 */
const FIELD_PREFIXES = ["crumb", "palette", "inbox", "status", "sidebar", "search", "desk"];
const FIELD_EXCEPTIONS = new Set([
	// Identity and colour are axes, not components — they have no prefix by
	// design and a layout preset must never write them.
	"company_name", "logo", "favicon", "tagline",
	"brand_color", "accent_color", "brand_color_dark", "accent_color_dark",
	// Generated artefact, not a setting.
	"brand_css_url",
	// KNOWN VIOLATIONS, to be renamed by the component rework's patch:
	//   enable_command_palette -> palette_enabled
	//   default_density        -> density_default
	"enable_command_palette", "default_density",
]);

function assertFieldNaming(doctypeJson) {
	const offenders = [];
	for (const f of doctypeJson.fields || []) {
		const name = f.fieldname;
		if (!name || FIELD_EXCEPTIONS.has(name)) continue;
		// Layout furniture carries no data.
		if (["Section Break", "Column Break", "Tab Break", "HTML"].includes(f.fieldtype)) continue;
		if (!FIELD_PREFIXES.some((p) => name.startsWith(p + "_"))) offenders.push(name);
	}
	if (offenders.length) {
		throw new Error(
			`Field-naming guard: ${offenders.join(", ")} — Theme Settings fields must be ` +
				`<component>_<property> using one of: ${FIELD_PREFIXES.join(", ")}. ` +
				"Rename the field, or if it is genuinely not a component setting, add it to " +
				"FIELD_EXCEPTIONS in build.mjs with a comment saying why."
		);
	}
}

/**
 * Compile one entry, write the hashed file, reap older hashes of the same entry.
 * @returns {Promise<{pyid: string, url: string}>}
 */
async function buildEntry({ key, src, pyid }) {
	const inFile = join(SCSS, src);

	// `expanded` rather than `compressed`: this stylesheet is read by whoever
	// debugs the theme in devtools, and gzip on the wire makes the size
	// difference marginal.
	const result = sass.compile(inFile, {
		style: "expanded",
		loadPaths: [SCSS],
		// Frappe's own SCSS is not imported here — we only consume its RUNTIME
		// custom properties, never its SCSS variables. That keeps the bundle
		// independent of Frappe's internal SCSS layout, which moves between
		// versions.
	});

	assertLogicalOnly(result.css, `${key}.css`);

	const digest = hash8(result.css);
	const filename = `${key}.${digest}.css`;

	await mkdir(DIST_CSS, { recursive: true });

	// Reap older builds of THIS entry only. Old hashed files must survive long
	// enough for pages rendered seconds ago to still fetch them, but they are
	// unbounded otherwise.
	for (const existing of await readdir(DIST_CSS).catch(() => [])) {
		if (existing.startsWith(`${key}.`) && existing.endsWith(".css") && existing !== filename) {
			await rm(join(DIST_CSS, existing), { force: true });
		}
	}

	await writeFile(join(DIST_CSS, filename), result.css, "utf8");

	return { pyid, url: `/assets/bunood_theme/dist/css/${filename}` };
}

/**
 * JS entry points. Plain files, hashed and copied — no bundler.
 *
 * Deliberately NOT esbuild: the theme's JS policy (see bunood.js header) keeps
 * scripts tiny, and a copy step has zero dependencies to break. If the JS ever
 * grows enough to want imports, add esbuild THEN, not preemptively.
 */
const JS_ENTRIES = [{ key: "bunood", src: "bunood.js", pyid: "THEME_JS" }];

/**
 * Hash and copy one JS entry to dist, reaping older hashes of the same entry.
 * Mirrors buildEntry() for CSS; kept separate because the compile step differs.
 * @returns {Promise<{pyid: string, url: string}>}
 */
async function buildJsEntry({ key, src, pyid }) {
	// Normalize to LF before hashing: a CRLF Windows checkout and CI's LF
	// checkout must produce the SAME content hash, or the dist-drift gate
	// fails on every push made from Windows (CI run #1 did exactly that).
	const source = (await readFile(join(JS, src), "utf8")).replace(/\r\n/g, "\n");
	const digest = hash8(source);
	const filename = `${key}.${digest}.js`;

	await mkdir(DIST_JS, { recursive: true });
	for (const existing of await readdir(DIST_JS).catch(() => [])) {
		if (existing.startsWith(`${key}.`) && existing.endsWith(".js") && existing !== filename) {
			await rm(join(DIST_JS, existing), { force: true });
		}
	}
	await writeFile(join(DIST_JS, filename), source, "utf8");

	return { pyid, url: `/assets/bunood_theme/dist/js/${filename}` };
}

/**
 * Rewrite assets.py with the freshly hashed paths.
 *
 * Regenerated wholesale rather than patched, so the file can never drift into a
 * half-updated state. The header restates the constraints because this is the
 * file a future reader is most likely to try to "fix" by hand.
 */
async function writeAssetsPy(entries) {
	const lines = [
		"# Copyright (c) 2026, Bunood and contributors",
		"# For license information, please see license.txt",
		'"""Compiled asset paths. **GENERATED BY build.mjs — DO NOT EDIT BY HAND.**',
		"",
		"Rewritten on every ``npm run build``. ``hooks.py`` imports these so the content",
		"hash reaches ``app_include_css`` without anyone maintaining a version string.",
		"",
		"Never hand-edit a path to contain ``.bundle.``: Frappe would treat it as a logical",
		"bundle name, resolve it against a stale ``assets.json``, and prefix it with",
		"``rtl_`` on Arabic sites. See ARCHITECTURE.md section 6.",
		'"""',
		"",
	];
	for (const { pyid, url } of entries) {
		lines.push(`${pyid} = "${url}"`);
	}
	lines.push("");
	await writeFile(join(APP, "assets.py"), lines.join("\n"), "utf8");
}

async function main() {
	// Guard before compiling: a naming violation is cheaper to hear about
	// before the build spends time on Sass than after.
	assertFieldNaming(
		JSON.parse(
			await readFile(
				new URL("./bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.json", import.meta.url),
				"utf8"
			)
		)
	);

	const built = [];
	for (const entry of ENTRIES) {
		const out = await buildEntry(entry);
		built.push(out);
		console.log(`built  ${out.url}`);
	}
	for (const entry of JS_ENTRIES) {
		const out = await buildJsEntry(entry);
		built.push(out);
		console.log(`built  ${out.url}`);
	}
	await writeAssetsPy(built);
	console.log("wrote  bunood_theme/assets.py");
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
