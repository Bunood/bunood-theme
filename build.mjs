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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";
import { pdfMediaCss } from "./tools/print-media.mjs";

// The translation catalogue and its guards. Derived, never listed — see
// tools/i18n.mjs for why the string inventory is recomputed on every build.
import { assertNoCountGoverned, assertTranslationCoverage } from "./tools/i18n.mjs";
// The payload budget (GUIDELINES §2.5), joining the other guards here as of
// item 22 commit 1 — tools/payload.mjs's own header said it belonged beside
// them "once item 7's edits to it land"; item 7 has. Failing here beats
// failing 25 minutes into a suite run.
import { budgetExceededMessage, checkPayload } from "./tools/payload.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP = join(ROOT, "bunood_theme");
const SCSS = join(APP, "public", "scss");
const JS = join(APP, "public", "js");
const DIST_CSS = join(APP, "public", "dist", "css");
const DIST_JS = join(APP, "public", "dist", "js");

// This parser defines the legacy PDF guard's boundary. Its adversarial cases
// run on every build (including CI), not only when somebody remembers to test.
execFileSync(process.execPath, ["--test", join(ROOT, "tests", "print-media.test.mjs")], {
	stdio: "pipe",
});

const FORBIDDEN_ROUTE_ATTRS = ["data-route", "data-page-route"];

/**
 * Blank SCSS comments, preserving line structure so reported line numbers stay
 * true.
 *
 * THE GATE MEASURES CODE, NOT PROSE. A comment that NAMES a retired route
 * selector — to record why it was retired — is documentation. A gate that
 * fails on it teaches the next author to delete the explanation, which is the
 * opposite of what this repo wants.
 */
function stripScssComments(source) {
	let out = "";
	let inBlock = false;
	let inLine = false;
	let inString = null;
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		const d = source[i + 1];
		if (inBlock) {
			if (c === "*" && d === "/") { inBlock = false; out += "  "; i++; continue; }
			out += c === "\n" ? "\n" : " ";
			continue;
		}
		if (inLine) {
			if (c === "\n") { inLine = false; out += "\n"; continue; }
			out += " ";
			continue;
		}
		if (inString) {
			out += c;
			if (c === "\\") { out += d ?? ""; i++; continue; }
			if (c === inString) inString = null;
			continue;
		}
		if (c === '"' || c === "'") { inString = c; out += c; continue; }
		if (c === "/" && d === "*") { inBlock = true; out += "  "; i++; continue; }
		if (c === "/" && d === "/") { inLine = true; out += "  "; i++; continue; }
		out += c;
	}
	return out;
}

/**
 * Route-agnostic styling guard — CSS targets rendered component signatures,
 * never router metadata.
 *
 * Route selectors fail on aliases, standard modules such as `/app/buying`, and
 * custom apps that render the same Frappe component under a different URL. A
 * DOM signature such as `.page-container:has(.frappe-list)` follows what is on
 * screen and therefore applies universally.
 *
 * MATCH THE BRACKET, NOT `attr=`. This gate first shipped looking for the
 * literal strings `data-route=` and `data-page-route=`, and the two rules it
 * was written to prevent — `body[data-route^="Form"]` in `chrome/_layouts.scss`
 * — walked straight past it, because `^=` is not `=`. Anchoring on `[` catches
 * every CSS attribute operator (`=`, `^=`, `*=`, `$=`, `~=`, `|=`) and the bare
 * presence form `[data-route]` with it.
 *
 * @param {{name: string, source: string}[]} sources - SCSS source files
 */
function assertRouteAgnosticScss(sources) {
	const offenders = [];
	const patterns = FORBIDDEN_ROUTE_ATTRS.map((attr) => [attr, new RegExp("\\[\\s*" + attr + "\\b")]);
	for (const { name, source } of sources) {
		const lines = stripScssComments(source).split(/\r?\n/);
		for (let index = 0; index < lines.length; index++) {
			for (const [attr, re] of patterns) {
				if (re.test(lines[index])) offenders.push(`${name}:${index + 1} contains [${attr}`);
			}
		}
	}
	if (offenders.length) {
		throw new Error(
			[
				"Route-agnostic styling gate failed:",
				...offenders.map((item) => `  ${item}`),
				"Route selectors are forbidden in SCSS. Use :has() DOM signatures that target the rendered component instead (for example, .page-container:has(.frappe-list)).",
			].join("\n")
		);
	}
}

/** Recursively read every SCSS source beneath the canonical source directory. */
async function readScssSources(dir = SCSS, prefix = "") {
	const sources = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) sources.push(...(await readScssSources(path, name)));
		else if (entry.isFile() && entry.name.endsWith(".scss")) {
			sources.push({ name, source: await readFile(path, "utf8") });
		}
	}
	return sources;
}

/**
 * Negative-test the guard itself on every build. A guard that silently matches
 * nothing is worse than no guard; every forbidden spelling must be rejected,
 * while the sanctioned DOM-signature form must pass.
 *
 * EVERY OPERATOR, NOT JUST `=`. The first version of this self-test probed only
 * the exact strings the gate searched for, so it agreed with the gate about a
 * hole they shared: `^=`. `chrome/_layouts.scss` carried
 * `body[data-route^="Form"]` through this "passing" self-test. A self-test that
 * reuses the implementation's own assumption measures nothing — so the operator
 * list here is written out by hand, deliberately independent of the gate.
 *
 * The last case is the other half: a route selector NAMED IN A COMMENT is
 * documentation and must NOT fail, or the next author deletes the explanation.
 */
function assertRouteAgnosticGateSelfTest() {
	const OPERATORS = ["=", "^=", "*=", "$=", "~=", "|="];
	for (const attr of FORBIDDEN_ROUTE_ATTRS) {
		for (const op of OPERATORS) {
			let rejected = false;
			try {
				assertRouteAgnosticScss([{ name: "negative-test.scss", source: `html[${attr}${op}"List"] {}` }]);
			} catch (error) {
				rejected = String(error.message).includes(attr) && String(error.message).includes(":has()");
			}
			if (!rejected) throw new Error(`Route-agnostic gate self-test did not reject ${attr}${op}`);
		}
		// the bare presence form, which carries no operator at all
		let presenceRejected = false;
		try {
			assertRouteAgnosticScss([{ name: "negative-test.scss", source: `html[${attr}] {}` }]);
		} catch (error) {
			presenceRejected = String(error.message).includes(attr);
		}
		if (!presenceRejected) throw new Error(`Route-agnostic gate self-test did not reject [${attr}]`);
	}
	assertRouteAgnosticScss([
		{ name: "positive-test.scss", source: ".page-container:has(.frappe-list) {}" },
		{ name: "comment-test.scss", source: `// the retired body[data-route^="Form"] spelling\n.page-container:has(.form-layout) {}` },
		{ name: "block-comment-test.scss", source: `/* was html[data-page-route="List"] */\n.frappe-list {}` },
	]);
}

/**
 * Custom properties `brand.py` declares at RUNTIME, in the per-site stylesheet.
 * Read out of the Python rather than listed here — a hand-kept second copy of
 * this set is the same-fact-in-two-places trap, and it would go stale the first
 * time a token was renamed. See assertTokensDeclared.
 */
const RUNTIME_TOKENS = readRuntimeTokens(
	readFileSync(join(APP, "brand.py"), "utf8"),
	readFileSync(join(APP, "palette.py"), "utf8"),
	// email.py declares the seed-INDEPENDENT tokens palette.derive() has no
	// business fitting (--bnd-ink, --bnd-border, --bnd-border-strong). They are
	// real runtime values, so the email sheet may reference them; without this
	// third source they read as phantoms and fail the build.
	readFileSync(join(APP, "email.py"), "utf8")
);

/** Tokens declared unconditionally in `_tokens.scss`'s base `:root`. */
const BASE_TOKENS = readBaseTokens(readFileSync(join(SCSS, "_tokens.scss"), "utf8"));

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
	{ key: "bunood-web", src: "web/web.scss", pyid: "WEB_CSS" },
	// The email sheet is the third, and it is never fetched by a browser:
	// `bunood_theme/email.py` reads this compiled file off the PACKAGE and renders
	// it into a `<style>` block in our own `templates/emails/standard.html`, with
	// every `var(--bnd-*)` substituted for a literal. It is compiled as an entry
	// rather than authored as a string so that it inherits every guard the other
	// two get — logical-only, cursive-safe, motion-primitive, no authored copy,
	// no phantom tokens — plus the email-safe property allowlist, which only this
	// entry has.
	{ key: "bunood-email", src: "email/email.scss", pyid: "EMAIL_CSS" },
	// The print sheet is the fourth, and the first delivered as a DATABASE
	// RECORD: `bunood_theme/printing/sheet.py` reads this compiled file off the
	// package, substitutes every `var(--bnd-*)` from `palette.derive()` (the
	// item-34 mechanism, fourth consumer) and writes the result into the Print
	// Style "Bunood" — which `frappe/www/printview.py` then inlines into every
	// print view and PDF. Compiled as an entry so it inherits the guards; it is
	// the ONE entry exempt from `assertLogicalOnly` (wkhtmltopdf has no logical
	// properties and nothing rtlcss-processes an inline Print Style), carrying
	// `assertPrintSafeCss` instead — see that guard for the whole argument.
	{ key: "bunood-print", src: "print/print.scss", pyid: "PRINT_CSS" },
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
/**
 * The UNCONDITIONAL token set — the names `_tokens.scss` declares in its base
 * `:root` block, which every page carries no matter which poles are active.
 *
 * The distinction this draws is the whole point of the fallback rule below, and
 * it cannot be made from the compiled sheet: a WORKING-SET variable such as
 * `--bnd-form-sec-bg` is also "declared in bunood.css", but only under a pole
 * selector, so under `Original` it is genuinely absent and its fallback is what
 * renders. Those fallbacks are load-bearing and `_form.scss` argues for them.
 * A base token is never absent, so its fallback is dead.
 */
function readBaseTokens(tokensSrc) {
	const at = tokensSrc.indexOf(":root");
	if (at === -1) throw new Error("_tokens.scss: no :root block found");
	const open = tokensSrc.indexOf("{", at);
	let depth = 0;
	let end = open;
	for (; end < tokensSrc.length; end++) {
		if (tokensSrc[end] === "{") depth++;
		else if (tokensSrc[end] === "}" && --depth === 0) break;
	}
	const names = new Set(
		[...tokensSrc.slice(open, end).matchAll(/(--bnd-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
	);
	if (names.size < 50) {
		throw new Error(
			`Phantom-token guard: only ${names.size} base tokens read from _tokens.scss's :root — ` +
				"the extraction has broken, and an empty set would silently disable the fallback rule."
		);
	}
	return names;
}

/**
 * Phantom-token guard — every `var(--bnd-*)` must name a property something
 * actually declares.
 *
 * WHAT IT CATCHES, AND WHY NOTHING ELSE DOES
 *   `outline: var(--bnd-line-thick, 2px) solid var(--bnd-accent)` shipped in
 *   `web/_login.scss`. `--bnd-line-thick` is declared NOWHERE in this repo, so
 *   the rule always took the fallback — a raw 2px wearing a token's name. It
 *   passed every guard here: the no-raw-px rule cannot see a literal that sits
 *   inside a `var()`, and the token itself is just an identifier, so nothing
 *   was malformed. Found by hand during item 32's release review, and the
 *   first thing this guard did when written was find FIVE MORE in
 *   `chrome/_settings.scss` — `--bnd-hairline`, `--bnd-surface-2`,
 *   `--bnd-surface-3`, `--bnd-accent-wash` and `--bnd-radius`, across eleven
 *   rules of the layout builder, every one of them painted by a Frappe
 *   variable while reading as though a theme token drove it.
 *
 *   The failure mode without a fallback is worse and quieter: a `var()` naming
 *   an undeclared property is Invalid At Computed-Value Time, so the whole
 *   declaration resolves to `unset` — inherited or initial — rather than
 *   erroring. A misspelt token does not break loudly; it silently removes the
 *   property, which is exactly how a missing focus ring or a lost background
 *   reaches production.
 *
 * WHY IT RUNS PER COMPILED SHEET
 *   The two sheets never load on the same page: the desk gets `bunood.css`,
 *   the auth templates get `bunood-web.css`. So "declared somewhere in the
 *   repo" is the wrong test — a token has to be declared in the sheet that
 *   uses it, or the page using it has nothing. Compiled rather than authored
 *   because `@use`, mixins and nesting all have to be resolved first: item
 *   32's `@include dark` proved that reading the source instead of the output
 *   is how a whole block goes missing unnoticed.
 *
 * THE ONE LEGITIMATE EXCEPTION, AND IT IS NOT A LIST OF NAMES
 *   `brand.py` writes a per-site stylesheet that declares tokens the bundle
 *   only consumes — the seed-derived palette, the Arabic face, and the login
 *   tagline. Those are declared at RUNTIME and can never appear in a compiled
 *   sheet. Rather than hand-keep a second copy of that list (the
 *   same-fact-in-two-places trap this repo keeps paying for), the names are
 *   READ OUT OF `brand.py` and `palette.py`. Delete a token there and the
 *   guard starts failing on its consumers, which is the correct direction.
 */
function assertTokensDeclared(css, name, runtimeTokens, baseTokens) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const declared = new Set(
		[...stripped.matchAll(/(--bnd-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
	);
	const used = new Set([...stripped.matchAll(/var\(\s*(--bnd-[a-z0-9-]+)/g)].map((m) => m[1]));
	const phantom = [...used].filter((t) => !declared.has(t) && !runtimeTokens.has(t)).sort();
	if (phantom.length) {
		throw new Error(
			`Phantom-token guard: ${name} reads ${phantom.length} custom ` +
				`propert${phantom.length === 1 ? "y" : "ies"} nothing declares: ${phantom.join(", ")}. ` +
				"A var() naming an undeclared property silently takes its fallback, or resolves the whole " +
				"declaration to unset when it has none. Declare it in _tokens.scss, or write the value it " +
				"was already rendering."
		);
	}

	// AND NO FALLBACK ON A TOKEN THAT IS ALWAYS THERE. A base token is declared
	// unconditionally in `_tokens.scss`'s `:root`, so a `var(--bnd-x, 4px)` on one
	// can never reach the `4px` — it is dead code holding a SECOND COPY of the
	// token's value, and second copies drift. Measured when this rule was written:
	// of 43 such fallbacks, SIX already disagreed with the token they shadowed —
	// `--bnd-topbar-h` said 48px against a real 44px, `--bnd-bottombar-h` 44px
	// against 40px, and three radius sites said 6px against 4px. None of them were
	// rendering; all of them were documentation that was wrong.
	//
	// WORKING-SET VARIABLES ARE NOT BASE TOKENS AND KEEP THEIR FALLBACKS. A pole
	// declares `--bnd-form-sec-bg` under its own selector, so under `Original` the
	// property is genuinely absent and the fallback is what renders — the pattern
	// `_form.scss` argues for. That is why this tests against `_tokens.scss`'s
	// `:root` rather than against everything the compiled sheet declares.
	const shadowed = [
		...new Set(
			[...stripped.matchAll(/var\(\s*(--bnd-[a-z0-9-]+)\s*,/g)]
				.map((m) => m[1])
				.filter((t) => baseTokens.has(t))
		),
	].sort();
	if (shadowed.length) {
		throw new Error(
			`Phantom-token guard: ${name} gives a fallback to ${shadowed.length} token` +
				`${shadowed.length === 1 ? "" : "s"} that is always declared: ${shadowed.join(", ")}. ` +
				"A base token from _tokens.scss's :root can never be missing, so the fallback is dead code " +
				"carrying a second copy of its value — six had already drifted when this rule was added. " +
				"Drop the fallback. (A working-set variable declared under a pole is a different thing and " +
				"keeps its fallback; this rule only covers the unconditional set.)"
		);
	}
}

/**
 * Token names this app declares at RUNTIME rather than in the compiled bundle.
 *
 * Three sources now: `brand.py` and `palette.py` emit the seed-derived set into
 * the per-site stylesheet, and `email.py` declares the seed-INDEPENDENT ones the
 * email sheet substitutes (`--bnd-ink` and the two borders — constant at every
 * seed, which is exactly why `derive()` has no business fitting them).
 *
 * Derived, never listed — see assertTokensDeclared's last paragraph.
 */
function readRuntimeTokens(...sources) {
	const names = new Set();
	for (const src of sources) {
		for (const m of src.matchAll(/["'](--bnd-[a-z0-9-]+)["']/g)) names.add(m[1]);
		for (const m of src.matchAll(/(--bnd-[a-z0-9-]+)\s*:/g)) names.add(m[1]);
	}
	if (names.size < 10) {
		throw new Error(
			`Phantom-token guard: only ${names.size} runtime tokens found in brand.py/palette.py — ` +
				"the extraction has broken, and an empty allowance would fail every consumer."
		);
	}
	return names;
}

function assertLogicalOnly(css, name) {
	const stripped = css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		// Deliberate exception: the Arabic login keeps the surrounding form RTL,
		// while the email value itself is LTR and visually aligned to the field's
		// physical right edge. Keep the allowance bound to this exact selector.
		.replace(
			/(body\.bnd-auth \.page-card \.page-card-body input\[type=["']?email["']?\],\s*body\.bnd-auth \.page-card \.page-card-body input\[type=["']?text["']?\]\[id=["']?login_email["']?\]\s*\{[^{}]*?)text-align\s*:\s*right(\s*;?[^{}]*\})/g,
			"$1$2"
		)
		// Deliberate exception: this exact topbar search host uses physical 50%
		// plus translateX(-50%) as a direction-independent centering pair.
		.replace(
			/(html\[data-theme\] \.bnd-topbar \.bnd-search-center\s*\{[^{}]*?)left\s*:\s*50%(\s*;?[^{}]*\})/g,
			"$1$2"
		);
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
 * Cursive guard — refuse inter-glyph spacing, which breaks Arabic joining.
 *
 * WHAT BREAKS
 *   Arabic is cursive: letters JOIN, and their shape depends on their
 *   neighbours. `letter-spacing` inserts space between every glyph, severing
 *   those joins — CSS Text 3 §7.2.1 says so outright ("in cursive scripts,
 *   letter-spacing may break cursive connections"). The stored string is
 *   correct and only the rendering is wrong, so every unit test passes while
 *   the desk is unreadable.
 *
 * WHAT DOES NOT BREAK, AND IS THEREFORE NOT BANNED
 *   `text-transform: uppercase` is a NO-OP in Arabic — the script has no case.
 *   Banning it would be cargo-cult: it costs a real design choice (the sidebar
 *   section labels, the avatar chip) and buys nothing for i18n. The rule is
 *   about inter-glyph SPACE, not about casing, and saying so precisely is what
 *   keeps the guard honest enough to be obeyed.
 *
 * WHY THE VALUE AND NOT THE SELECTOR
 *   The obvious alternative — allow tracking where the rule cannot match an
 *   Arabic desk — is not expressible. CSS selects on document LANGUAGE
 *   (`:lang`) or DIRECTION (`[dir]`), never on the SCRIPT of the text being
 *   rendered, and `html:not([dir=rtl])` inherits the blind spot in Frappe's
 *   hardcoded `is_rtl()` list. Worse, none of it helps the case that matters
 *   most here: ARABIC DATA ON AN ENGLISH DESK — a workspace named in Arabic in
 *   a `lang=en` site, where the root language is wrong and every selector-based
 *   scope silently permits the damage. Banning the value covers that; scoping
 *   the selector cannot. `_settings.scss` reached the same conclusion by hand
 *   ("Deliberately no letter-spacing…"); this generalises it.
 *
 * Runs on COMPILED css, like assertLogicalOnly, so nothing slips through a
 * mixin or an import.
 */
function assertCursiveSafe(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	for (const m of stripped.matchAll(/letter-spacing\s*:\s*([^;}]+)/g)) {
		const value = m[1].trim().replace(/\s*!important$/, "");
		// `normal` and a bare zero are the only values that add no space.
		if (!/^(normal|0)$/.test(value)) offenders.push(value);
	}
	if (offenders.length) {
		throw new Error(
			`Cursive guard: ${name} sets letter-spacing to ${[...new Set(offenders)].join(", ")}. ` +
				"Inter-glyph spacing severs Arabic's cursive joins (CSS Text 3 §7.2.1), and no " +
				"selector can scope it safely — Arabic DATA renders on English desks too. " +
				"Use word-spacing, padding-inline or font-size for airiness, or drop it: at " +
				"--bnd-text-xs these values are 0.2-0.6px."
		);
	}
}

/**
 * Motion-primitive guard — no literal duration may reach compiled CSS.
 *
 * `_tokens.scss`'s own comment on the reduced-motion block says outright:
 * "Zeroing the duration tokens disables every transition in the theme at
 * once, because nothing hardcodes a duration." That claim was false in
 * three places the day this guard was written — the settings toggle knob
 * (`0.15s` twice) and the placement board's zone hover (`120ms`) each
 * shipped a literal, so both kept animating under
 * `prefers-reduced-motion: reduce` from the day they landed.
 *
 * Scoped to the properties that actually carry timing — `transition`,
 * `animation`, and their `-duration` longhands — so `--bnd-dur-fast: 120ms`
 * itself never matches: it is a custom-property declaration, not a
 * transition/animation property. A bare zero (`0`, `0s`, `0ms`) is always
 * allowed, because that IS the reduced-motion value; any other literal
 * time value fails the build. Checked on COMPILED css, like the RTL and
 * cursive guards, so nothing slips through a mixin or an import.
 */
function assertMotionPrimitive(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	const TIME = /-?\d*\.?\d+(?:ms|s)\b/g;
	for (const m of stripped.matchAll(/\b(transition|animation)(-duration)?\s*:\s*([^;}]+)/g)) {
		const value = m[3].trim();
		for (const t of value.matchAll(TIME)) {
			if (!/^0+(\.0+)?(ms|s)?$/.test(t[0])) {
				offenders.push(`${m[1]}${m[2] || ""}: ${value}`);
				break;
			}
		}
	}
	if (offenders.length) {
		throw new Error(
			`Motion-primitive guard: ${name} hardcodes a duration outside the tokens:\n  ` +
				[...new Set(offenders)].join("\n  ") +
				"\n_tokens.scss's reduced-motion block zeroes --bnd-dur-fast/-base/-slow and " +
				"nothing else — a literal time value here keeps animating under " +
				"prefers-reduced-motion: reduce. Use var(--bnd-dur-fast), var(--bnd-dur-base) " +
				"or var(--bnd-dur-slow)."
		);
	}
}

/**
 * The sanctioned breakpoint values, PARSED from `_breakpoints.scss` — never
 * restated here, the same one-source-of-truth contract `tools/contrast_gate.py`
 * keeps with `_tokens.scss`. Returns two sets of px numbers: viewport values a
 * `@media` may carry, and container values a `@container` may carry.
 */
function parseBreakpointVocabulary() {
	// Strip `//` line comments FIRST: a value's comment may itself contain a
	// `)` (e.g. "drop ranks 1-2 (freshness, density)"), which would end the
	// non-greedy map capture early and silently under-read the scale.
	const text = readFileSync(join(SCSS, "_breakpoints.scss"), "utf8").replace(/\/\/[^\n]*/g, "");
	const grab = (mapName) => {
		const m = text.match(new RegExp(`\\$${mapName}:\\s*\\(([\\s\\S]*?)\\)`));
		if (!m) throw new Error(`_breakpoints.scss: could not find the $${mapName} map`);
		const px = new Set();
		for (const v of m[1].matchAll(/(\d+(?:\.\d+)?)(px|rem)/g)) {
			px.add(v[2] === "rem" ? Number(v[1]) * 16 : Number(v[1]));
		}
		if (!px.size) throw new Error(`_breakpoints.scss: $${mapName} has no px/rem values`);
		return px;
	};
	return { viewport: grab("bnd-bp"), container: grab("bnd-cq") };
}
const BREAKPOINTS = parseBreakpointVocabulary();

/**
 * Breakpoint-vocabulary guard — no raw or off-scale breakpoint may reach
 * compiled CSS. The one dimension GUIDELINES §1.3's "no raw px in a rule" never
 * covered: breakpoints were nine literals in two ad-hoc schemes with no guard,
 * and the cost was a PHANTOM — a `max-width: 480px` and a "~480px" claim in
 * three places, none derived from anything, when Frappe's real mobile boundary
 * is 768 (item 24, measured 2026-08-14).
 *
 * A `@media` width must be one of `$bnd-bp` (the viewport scale = Frappe's own);
 * a `@container` width must be one of `$bnd-cq` (the measured box scale). The
 * two are checked SEPARATELY, structurally enforcing `_breakpoints.scss`'s "do
 * not merge them" — a `@media (width < 900px)` fails even though 900 is a valid
 * container value. At-rules with no width (`print`, `prefers-*`) carry no
 * candidate and are ignored. Values come from `_breakpoints.scss`, so the guard
 * cannot drift from the vocabulary it enforces. Checked on COMPILED css, like
 * the RTL and motion guards, so nothing slips through the mixins or an import.
 */
function assertBreakpointVocabulary(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	for (const at of stripped.matchAll(/@(media|container)\b([^{]*)\{/g)) {
		const kind = at[1];
		const prelude = at[2];
		const allowed = kind === "container" ? BREAKPOINTS.container : BREAKPOINTS.viewport;
		for (const val of prelude.matchAll(/(\d+(?:\.\d+)?)(px|rem)/g)) {
			const px = val[2] === "rem" ? Number(val[1]) * 16 : Number(val[1]);
			if (!allowed.has(px)) {
				offenders.push(`@${kind}(${prelude.trim()}) → ${val[0]}`);
			}
		}
	}
	if (offenders.length) {
		const bp = [...BREAKPOINTS.viewport].sort((a, b) => a - b).join(", ");
		const cq = [...BREAKPOINTS.container].sort((a, b) => a - b).join(", ");
		throw new Error(
			`Breakpoint guard: ${name} carries a breakpoint outside the vocabulary:\n  ` +
				[...new Set(offenders)].join("\n  ") +
				`\nA @media width must be one of $bnd-bp (${bp}); a @container width one of ` +
				`$bnd-cq (${cq}). Use the mixins in _breakpoints.scss (bnd-until, bnd-from, ` +
				`bnd-container-until) — never a raw literal — and if a new value is genuinely ` +
				`needed, add it to the map with a comment saying why.`
		);
	}
}

/**
 * No authored copy in compiled CSS (item 29).
 *
 * `content:` with prose is an i18n hole no other gate covers:
 * assertTranslationCoverage can only see `__()` call sites, so a stylesheet
 * that writes words paints ENGLISH into an Arabic desk with every guard
 * green. The empty-states kit is the surface most tempted to do it — the
 * vendor renders one <p> and the only CSS route to a second line is
 * `content:` — which is exactly why the kit's plan bans copy and this guard
 * enforces the ban (item 29, check 5).
 *
 * Scoped to QUOTED string values inside `content:` declarations, because the
 * keyword values (none, normal, open-quote…) and functions (attr, counter,
 * var) are all letters and all legitimate. Inside a quoted string, escape
 * sequences are stripped first — the breadcrumb separators ship "\203A" and
 * friends, glyphs, not words — and whatever remains fails on two consecutive
 * letters. A single letter stays legal (a glyph like "x" is a mark, not
 * copy). Checked on COMPILED css, like every other guard here, so nothing
 * slips through a mixin.
 */
function assertNoAuthoredCopy(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	for (const decl of stripped.matchAll(/\bcontent\s*:\s*([^;}]+)/g)) {
		for (const q of decl[1].matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
			const text = (q[1] ?? q[2] ?? "").replace(/\\[0-9a-fA-F]{1,6}\s?/g, "").replace(/\\./g, "");
			if (/[A-Za-z]{2,}/.test(text)) offenders.push(`content: ${decl[1].trim()}`);
		}
	}
	if (offenders.length) {
		throw new Error(
			`Authored-copy guard: ${name} writes prose from a stylesheet:\n  ` +
				[...new Set(offenders)].join("\n  ") +
				"\nCSS content: bypasses assertTranslationCoverage — the string would render " +
				"in English on every locale. Put copy in markup behind __(), never in a rule."
		);
	}
}


/**
 * Email-safe CSS guard — an ALLOWLIST, and only for the email entry.
 *
 * WHY THIS EXISTS AND THE OTHER SHEETS DO NOT NEED IT
 *   Every other stylesheet here is verified the same way the product is used: a
 *   browser renders it and the suite reads `getComputedStyle` off real pixels. An
 *   email has no route. Its checks render server-side and measure the result in
 *   Chromium, which is honest about COLOUR and says nothing at all about whether
 *   Outlook's Word engine, Gmail's sanitiser or a ten-year-old client will lay the
 *   thing out. A green gate could sit over an email that is broken for a third of
 *   its readers.
 *
 *   So the risk is bounded structurally instead. This is not a conformance claim
 *   and must never be described as one — it is a regression net, the role
 *   GUIDELINES §1.5 already assigns to axe.
 *
 * AN ALLOWLIST, NOT A DENYLIST, for the reason `assertBreakpointVocabulary` is one:
 *   the failure being prevented is someone reaching for a property nobody thought
 *   about. A denylist answers "is this one of the things we knew to fear"; an
 *   allowlist answers "is this one of the things we checked". Only the second is
 *   safe against a property invented after this file was written.
 *
 * WHAT EARNS A PLACE
 *   Either it works across the mail clients that matter, or its ABSENCE degrades
 *   harmlessly. `box-shadow` is the clearest case of the second kind: Outlook
 *   ignores it and the element simply has no shadow, which costs an elevation cue
 *   and breaks nothing. `display:flex` is the opposite — where it is ignored the
 *   layout collapses to something nobody designed.
 *
 * THE PHYSICAL PROPERTIES ARE ABSENT FROM THIS LIST AND THAT IS NOT AN OVERSIGHT.
 *   `assertLogicalOnly` already refuses them on every entry including this one, and
 *   `email/email.scss` answers direction by SYMMETRY plus the `dir` attribute rather
 *   than by logical properties — which mail clients do not support either. Listing
 *   `padding-left` here as "email-safe" would be true and would still be wrong.
 *
 * @param {string} css - compiled stylesheet text
 * @param {string} name - entry name, for the error message
 */
const EMAIL_SAFE_PROPS = new Set([
	// Box, as a table-based layout uses it.
	"width", "min-width", "max-width", "height", "min-height", "max-height",
	"padding", "margin", "border", "border-width", "border-style", "border-color",
	// THE BLOCK-AXIS LONGHANDS ONLY, and the omission of the inline ones is not an
	// oversight to correct later: `assertLogicalOnly` already refuses
	// `padding-left` and friends on every entry, so listing them here would put
	// two guards in disagreement. Top and bottom have no direction to get wrong,
	// which is why they are safe to name.
	"padding-top", "padding-bottom", "margin-top", "margin-bottom",
	"border-radius", "border-collapse", "border-spacing", "border-top", "border-bottom",
	"vertical-align", "display", "overflow", "box-sizing",
	// Type.
	"color", "font", "font-family", "font-size", "font-style", "font-weight",
	"font-variant-numeric", "line-height", "text-align", "text-decoration",
	"text-transform", "white-space", "word-break", "overflow-wrap", "direction",
	// Paint. `box-shadow` and `opacity` are here on the degradation rule: a client
	// that drops them shows a flatter element, not a broken one.
	"background", "background-color", "background-image", "background-position",
	"background-repeat", "background-size", "box-shadow", "opacity", "color-scheme",
	// Client hints. Not CSS anyone reads, but they are what stop iOS and Windows
	// clients rescaling type out from under the design.
	"-webkit-text-size-adjust", "-ms-text-size-adjust", "-webkit-font-smoothing",
	"mso-table-lspace", "mso-table-rspace", "mso-line-height-rule",
]);

/** At-rules a mail client will either honour or skip without damage. */
const EMAIL_SAFE_AT = new Set(["media", "font-face", "charset"]);

/**
 * `display` is allowed as a property and NOT as a blank cheque, which the first
 * cut of this guard got wrong: `display: flex` passed every check in the build.
 * The property has to be here — a table layout sets `display: block` on images
 * and `none` on preheader text — but `flex` and `grid` are precisely the values
 * whose absence collapses a layout into something nobody designed, which is the
 * line this guard draws. Found by negative-testing rather than by review.
 */
const EMAIL_SAFE_DISPLAY = new Set([
	"block", "inline", "inline-block", "none",
	"table", "table-cell", "table-row", "table-header-group",
]);

/**
 * Phantom Sass function guard — no `bnd-*(...)` call may reach compiled CSS.
 *
 * WHY THIS EXISTS. Sass does not error on an unknown function: anything it does
 * not recognise is passed through as a plain CSS function call. So a typo, or a
 * helper somebody assumed existed, compiles cleanly and ships an INVALID
 * declaration that every browser silently drops.
 *
 * Item 34 shipped exactly that. `margin-block-start: bnd-space(4)` looked like
 * the house idiom and is not one — the spacing scale is `var(--bnd-sp-N)`, and
 * `bnd-space` is defined nowhere in the repo. It compiled, passed every guard,
 * passed the suite, and the email preview simply had no top margin. Item 35 then
 * COPIED the same call into the print preview, so one invented helper became five
 * dead declarations across two kits before the release review found it.
 *
 * The namespace is what makes this checkable: `bnd-` is ours, so a `bnd-…(` in
 * OUTPUT can only be a Sass function that did not resolve. Real CSS functions
 * (`var`, `calc`, `color-mix`, `rgba`) are untouched.
 *
 * @param {string} css - compiled stylesheet text
 * @param {string} name - entry name, for the error message
 */
function assertNoPhantomSassFn(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [
		...new Set([...stripped.matchAll(/\b(bnd-[a-z0-9-]+)\s*\(/g)].map((m) => m[1])),
	];
	if (offenders.length) {
		throw new Error(
			`Phantom Sass function: ${name} contains ${offenders.join(", ")}(...) in COMPILED output. ` +
				"Sass passes an unknown function through as CSS rather than failing, so the declaration " +
				"ships and every browser drops it. Use the token the repo actually has — spacing is " +
				"var(--bnd-sp-N) — or define the function."
		);
	}
}

function assertEmailSafeCss(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const bad = new Set();

	for (const m of stripped.matchAll(/(?:^|[{;])\s*display\s*:\s*([^;}!]+)/g)) {
		const value = m[1].trim().toLowerCase();
		if (!EMAIL_SAFE_DISPLAY.has(value)) bad.add(`display: ${value}`);
	}

	// Declarations only: a property is `name:` at the start of a declaration, so
	// anything inside a selector (`a:not(.btn)`, `::before`) is skipped by
	// requiring the previous non-space character to open or end a declaration.
	for (const m of stripped.matchAll(/(^|[{;])\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:/g)) {
		const prop = m[2].toLowerCase();
		if (prop.startsWith("--")) continue; // custom properties are substituted away
		if (!EMAIL_SAFE_PROPS.has(prop)) bad.add(prop);
	}
	for (const m of stripped.matchAll(/@([-a-zA-Z]+)/g)) {
		const at = m[1].toLowerCase();
		if (!EMAIL_SAFE_AT.has(at)) bad.add("@" + at);
	}

	if (bad.size) {
		throw new Error(
			`Email-safe guard: ${name} uses ${[...bad].join(", ")}, which is outside the ` +
				"checked set. An email is verified in Chromium and read in Outlook, so this " +
				"list is the only thing standing between the two. If the property genuinely " +
				"works in mail clients OR degrades harmlessly when ignored, add it to " +
				"EMAIL_SAFE_PROPS with the reason; if it does not, the layout needs a table."
		);
	}

	// A guard that silently matches nothing is worse than no guard, and this one
	// parses rather than greps. Item 22's axe include-coverage tracking exists for
	// the same reason.
	const seen = [...stripped.matchAll(/(^|[{;])\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:/g)].length;
	if (seen < 3) {
		throw new Error(
			`Email-safe guard: only ${seen} declarations found in ${name} — the extraction ` +
				"has broken, and a guard that inspects nothing reads as coverage."
		);
	}
}

/**
 * Print-safe CSS guard — an ALLOWLIST, and only for the print entry.
 *
 * WHY THIS ENTRY HAS ITS OWN GUARD AND LOSES `assertLogicalOnly`
 *   The compiled print sheet is substituted into the Print Style record and
 *   read by THREE renderers (census 2026-08-26): wkhtmltopdf (Qt-WebKit 534,
 *   the shipped default — no flexbox, no logical properties, no woff2),
 *   headless-chrome PDF, and the browser's own print dialog. A logical-only
 *   sheet is silently direction-broken on the DEFAULT engine, so this entry
 *   answers direction explicitly instead: `.bnd-p` pins `direction: rtl`
 *   (Arabic-first formats, the bilingual-letterhead argument) and physical
 *   `text-align` inside that scope is deliberate. The exemption is a
 *   CONSTRAINT, not a licence — this allowlist is what bounds it, exactly as
 *   `assertEmailSafeCss` bounds the sheet Outlook reads.
 *
 * THE PAIRING RULE IS THE PART THAT IS NEW. Every keep-together declaration
 *   must carry BOTH spellings in the same rule — legacy `page-break-*` for
 *   wkhtml, modern `break-*` for the other two engines. One spelling alone is
 *   a rule that silently skips an engine, which is exactly the class of defect
 *   an allowlist cannot see; so the pairing is enforced mechanically below.
 */
const PRINT_SAFE_PROPS = new Set([
	// Box, as a table-based layout uses it. The physical margin/padding
	// longhands ARE listed here, unlike the email guard: this is the one entry
	// with no `assertLogicalOnly`, and top/bottom/left/right on paper are
	// resolved by the pinned `.bnd-p` direction or the document `dir`.
	"width", "min-width", "max-width", "height", "min-height", "max-height",
	"padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
	"margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
	"-webkit-margin-start", "margin-inline-start",
	"border", "border-width", "border-style", "border-color",
	"border-top", "border-bottom", "border-left", "border-right",
	"border-bottom-width", "border-top-width",
	// The accent override re-points rules the section poles drew — colour
	// longhands every engine has had since CSS1, degrading to the pole's colour.
	"border-top-color", "border-bottom-color", "border-left-color", "border-right-color",
	"border-radius", "border-collapse", "border-spacing",
	"table-layout", "vertical-align", "display", "overflow", "box-sizing",
	// Type.
	"color", "font", "font-family", "font-size", "font-style", "font-weight",
	"font-variant-numeric", "font-display", "line-height", "text-align",
	"text-decoration", "text-transform", "white-space", "word-break",
	// Legacy spelling of overflow-wrap for Qt WebKit. Exercised by the PDF
	// invoice regression's long item code/description on the actual engine.
	"word-wrap", "overflow-wrap", "direction", "unicode-range", "src",
	// Paint. Backgrounds need the color-adjust triple to survive the browsers'
	// default "no background graphics" print setting.
	"background", "background-color",
	"print-color-adjust", "-webkit-print-color-adjust", "color-adjust",
	// Paged media — the reason this sheet exists. Dual spellings enforced below.
	"page-break-inside", "page-break-after", "page-break-before",
	"break-inside", "break-after", "break-before", "orphans", "widows",
]);

/** At-rules the three print engines honour or skip without damage. */
const PRINT_SAFE_AT = new Set(["font-face", "page", "media", "charset"]);

/** `display` values that survive WebKit 534 — flex/grid collapse there. */
const PRINT_SAFE_DISPLAY = new Set([
	"block", "inline", "inline-block", "none",
	"table", "table-cell", "table-row", "table-header-group", "table-footer-group",
]);

function assertPrintSafeCss(css, name) {
	// Preview layout is screen-only. The guard still checks every declaration
	// that can reach paper, including mixed media queries and bare rules.
	const stripped = pdfMediaCss(css);
	const bad = new Set();

	for (const m of stripped.matchAll(/(?:^|[{;])\s*display\s*:\s*([^;}!]+)/g)) {
		const value = m[1].trim().toLowerCase();
		if (!PRINT_SAFE_DISPLAY.has(value)) bad.add(`display: ${value}`);
	}
	for (const m of stripped.matchAll(/(^|[{;])\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:/g)) {
		const prop = m[2].toLowerCase();
		if (prop.startsWith("--")) continue; // substituted away before any engine reads them
		if (!PRINT_SAFE_PROPS.has(prop)) bad.add(prop);
	}
	for (const m of stripped.matchAll(/@([-a-zA-Z]+)/g)) {
		const at = m[1].toLowerCase();
		if (!PRINT_SAFE_AT.has(at)) bad.add("@" + at);
	}

	// THE PAIRING RULE: within each rule block, a modern `break-*` requires its
	// legacy `page-break-*` twin and vice versa — otherwise the declaration
	// silently skips one of the three engines.
	for (const rule of stripped.split("}")) {
		const body = rule.slice(rule.indexOf("{") + 1);
		for (const kind of ["inside", "after", "before"]) {
			const modern = new RegExp(`(^|[{;\\s])break-${kind}\\s*:`).test(body);
			const legacy = body.includes(`page-break-${kind}`);
			if (modern !== legacy) bad.add(`unpaired break-${kind} (needs BOTH spellings in the same rule)`);
		}
	}

	if (bad.size) {
		throw new Error(
			`Print-safe guard: ${name} uses ${[...bad].join(", ")}, which is outside the ` +
				"checked set. The sheet is verified in Chromium and rendered by wkhtmltopdf " +
				"(Qt-WebKit 534), so this list is the only thing standing between the two. " +
				"If the property works across the print engines OR degrades harmlessly, add " +
				"it to PRINT_SAFE_PROPS with the reason; if it does not, the layout needs a table."
		);
	}

	const seen = [...stripped.matchAll(/(^|[{;])\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:/g)].length;
	if (seen < 3) {
		throw new Error(
			`Print-safe guard: only ${seen} declarations found in ${name} — the extraction ` +
				"has broken, and a guard that inspects nothing reads as coverage."
		);
	}
}

/**
 * Automatic-theme parity for the chart series (item 25).
 *
 * WHY ONLY THE SERIES FAMILY, AND WHY IT MATTERS
 *   The `html[data-theme="automatic"]` block is a deliberately CURATED subset of
 *   the dark block — it overrides only what would flash before JS resolves the
 *   theme, and everything else falls through to `:root` (light) by design. That is
 *   fine for CSS-painted tokens. The chart series is the exception: it is the one
 *   family read by RUNTIME JS (`getComputedStyle` in the chart colour hook), and a
 *   chart can construct while the theme is still the unresolved "automatic". Without
 *   these tokens in the automatic block, a dark-OS user's charts would be handed the
 *   LIGHT ramp on dark cards. So every `--bnd-series-*` the dark block declares must
 *   also be declared, identically, in the automatic block. Parsed from
 *   `_tokens.scss` source, so it cannot drift from the values it guards.
 */
function assertAutomaticParity() {
	const src = readFileSync(join(SCSS, "_tokens.scss"), "utf8").replace(/\/\/[^\n]*/g, "");
	const blockAfter = (marker) => {
		const at = src.indexOf(marker);
		if (at === -1) throw new Error(`_tokens.scss: could not find \`${marker}\``);
		let i = src.indexOf("{", at), depth = 0, start = i;
		for (; i < src.length; i++) {
			if (src[i] === "{") depth++;
			else if (src[i] === "}" && --depth === 0) break;
		}
		return src.slice(start + 1, i);
	};
	const series = (body) => {
		const out = {};
		for (const m of body.matchAll(/(--bnd-series-[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
		return out;
	};
	const dark = series(blockAfter('html[data-theme="dark"]'));
	const auto = series(blockAfter('html[data-theme="automatic"]'));
	const problems = [];
	for (const [tok, val] of Object.entries(dark)) {
		if (!(tok in auto)) problems.push(`automatic block is missing ${tok} (dark has ${val})`);
		else if (auto[tok] !== val) problems.push(`${tok}: dark is ${val}, automatic is ${auto[tok]}`);
	}
	if (problems.length) {
		throw new Error(
			"Automatic-parity guard: the chart series must match the dark block in the " +
				"`@media (prefers-color-scheme: dark) html[data-theme=\"automatic\"]` block, " +
				"because JS reads these tokens before the theme resolves:\n  " +
				problems.join("\n  ")
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
// `home` and `apps` joined in slice 2, when Home and All Apps stopped sharing
// `sidebar_quick_links` and became the two components registry.py always said
// they were. This list grows when a component is REGISTERED, never to make a
// build pass — that is what FIELD_EXCEPTIONS below is for, and it shrinks.
// "topbar" and the container prefixes that follow it are here because a
// CONTAINER was registered (registry.py); `list` and `form` because a SURFACE
// was. Those are the only reasons this list is allowed to grow — never to make
// a build pass.
//
// `icon` (item 23) is the first entry earned by neither a component nor a
// surface but by an AXIS with more than one field. Colour and typography are
// axes too and sit in FIELD_EXCEPTIONS below — but each is a SINGLE field, so
// naming it there costs one line. Icons is `icon_set` / `icon_weight` /
// `icon_style` / `icon_source` / … : listing every one in EXCEPTIONS is exactly
// the hand-maintained list a prefix exists to delete. So the axis takes a
// prefix, the same shape a surface does, and this comment is the registration.
const FIELD_PREFIXES = ["crumb", "palette", "inbox", "status", "sidebar", "search", "desk", "user", "home", "apps", "topbar", "pagehead", "dock", "bottombar", "list", "form", "chart", "workspace", "report", "views", "overlay", "empty", "skeleton", "filters", "login", "web", "email", "print", "icon", "mobile", "density"];
const FIELD_EXCEPTIONS = new Set([
	// Identity and colour are axes, not components — they have no prefix by
	// design. Typography joined in item 7(b): a typeface is an axis in exactly
	// the same sense as a colour. This block is PERMANENT; the shrink rule below
	// governs violations only.
	//
	// THIS COMMENT USED TO SAY "and a LAYOUT preset must never write them", which
	// was true and is now half the story. Item 37 gives the desk a THEME preset,
	// and a theme preset writes the colour axis on purpose — that is the whole
	// point of a palette. The layout preset still must not, and no longer can:
	// item 37 retires it into the theme catalogue.
	"company_name", "logo", "favicon", "tagline",
	"brand_color", "accent_color", "brand_color_dark", "accent_color_dark",
	// The GROUND (item 37): what the surfaces are mixed from. Same axis, same
	// reasoning — it is a colour, not a component.
	"ground_color",
	"arabic_font",
	// Generated artefact, not a setting.
	"brand_css_url",
	// The KNOWN VIOLATIONS block that lived here is EMPTY as of item 36: the
	// component rework's promised renames finally ran (enable_command_palette
	// -> palette_enabled, default_density -> density_default, patch
	// v0_36_0/rename_axis_fields), and each new name rides its axis's prefix.
]);

/**
 * Ownership guard — a native affordance may only be hidden from what we
 * MOUNTED, never from what a layout declared it would mount.
 *
 * Fails the build on any rule that hides one of Frappe's own affordances while
 * keyed on `data-bnd-desk` or `data-bnd-search`. Both are declarations made
 * before the DOM is known; hiding from them deletes the affordance whenever
 * the replacement does not arrive, which is how "Off" cost the Bottom Bar
 * layout its logout and how a resolved-but-unmounted search placement hid the
 * sidebar's search row with nothing to replace it.
 *
 * RENAMED WITH THE ATTRIBUTE (item 37). This guard named `data-bnd-layout`; that
 * attribute is `data-bnd-desk` now, and the rename had to come here in the same
 * commit or the guard would have gone on matching a string nothing emits — still
 * green, guarding nothing. That is item 32's `_tokens.scss` lesson exactly: ask
 * who else READS the thing you are renaming.
 *
 * Keyed on `data-bnd-own`, which is stamped after the node is in the document.
 */
const OWNED_NATIVES = ["navbar-search-bar", "sidebar-notification", "sidebar-user-button", "frappe-menu"];

function assertOwnershipPolarity(css, name) {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const offenders = [];
	// Each rule: everything up to `{`, then its body up to `}`.
	for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const [, selector, body] = m;
		if (!/display\s*:\s*none/.test(body)) continue;
		if (!OWNED_NATIVES.some((n) => selector.includes(n))) continue;
		if (/data-bnd-(desk|search)/.test(selector)) {
			offenders.push(selector.trim().slice(0, 120));
		}
	}
	if (offenders.length) {
		throw new Error(
			`Ownership guard: ${name} hides a native affordance from a DECLARATION:\n  ` +
				offenders.join("\n  ") +
				"\nKey it on [data-bnd-own~=\"search|bell|user\"] instead — stamped after the " +
				"replacement is in the DOM, so a failed mount degrades to stock rather than " +
				"deleting the affordance."
		);
	}
}

/**
 * Registry/identity guard — every component is named, and every name is real.
 *
 * Two directions, because both have already gone wrong:
 *   * a registry entry with no `part` is a component nothing can find except
 *     by class, which is how four separate queries ended up measuring a
 *     decorative fragment instead of the thing itself;
 *   * a `data-bnd-part` in the JS that no registry entry claims is drift —
 *     an identity the desk emits and the registry has never heard of, so the
 *     smoke suite cannot know to look for it.
 *
 * Parses the registry as TEXT rather than importing it: it is Python, this is
 * the JS build, and a regex over two well-formed key lines is a smaller price
 * than a language boundary. If registry.py ever stops being a plain literal
 * this guard should be replaced, not patched — it would be lying by then.
 */
function assertRegistryIdentity(registrySrc, deskJs) {
	const problems = [];
	const keys = [...registrySrc.matchAll(/"key":\s*"([a-z]+)"/g)].map((m) => m[1]);
	const parts = [...registrySrc.matchAll(/"part":\s*"([a-z]+)"/g)].map((m) => m[1]);
	if (keys.length !== parts.length) {
		problems.push(
			`registry.py: ${keys.length} components but ${parts.length} parts — every component needs a "part"`
		);
	}
	const known = new Set(parts);
	const emitted = [...deskJs.matchAll(/"data-bnd-part":\s*"([a-z-]+)"/g)].map((m) => m[1]);
	for (const p of new Set(emitted)) {
		if (!known.has(p)) {
			problems.push(`bunood.js emits data-bnd-part="${p}", which registry.py does not define`);
		}
	}
	if (problems.length) {
		throw new Error(
			"Registry identity guard:\n  " + problems.join("\n  ") +
				"\nIdentity lives in registry.py so the desk and the smoke suite cannot disagree about how to find a component."
		);
	}
}

/**
 * Field-mirror guard — a `BND_<X>_FIELDS` JS mirror in theme_settings.js must
 * carry every field its `presets.<X>_FIELDS` source lists.
 *
 * THE ESCAPEE CLASS this closes (item 25's workspace_metric, item 26's report
 * preview, HANDOVER §1): a mirror that silently OMITS a field — the field then
 * never live-previews and is dropped from theme export/import, and the suite
 * stays green because its tests drive the apply path directly, past the mirror.
 * It has bitten twice; item 27 adds a sixth mirror, so the guard lands here.
 *
 * A SUPERSET check (mirror ⊇ source), not equality: a mirror may legitimately
 * carry MORE than its own family (BND_STATUS_FIELDS also lists search_placement),
 * but it must never carry LESS. PLACEMENT_FIELDS is exempt — inbox_placement /
 * user_placement are export-separate via the placement board, with no mirror by
 * design.
 *
 * @param {string} presetsSrc - presets.py text
 * @param {string} jsSrc - theme_settings.js text
 */
function assertFieldMirrors(presetsSrc, jsSrc) {
	const families = (src, re) => {
		const out = {};
		for (const m of src.matchAll(re)) {
			out[m[1]] = [...m[2].matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map((x) => x[1]);
		}
		return out;
	};
	// `[^\]]` matches newlines, so a multi-line list body is captured whole.
	const py = families(presetsSrc, /\b([A-Z][A-Z0-9_]*)_FIELDS\s*=\s*\[([^\]]*)\]/g);
	const js = families(jsSrc, /\bBND_([A-Z][A-Z0-9_]*)_FIELDS\s*=\s*\[([^\]]*)\]/g);
	// The placement fields (inbox_placement / user_placement) ride the placement
	// BOARD's own export, not any component picker's mirror — so a family that
	// lists one (INBOX_FIELDS does) legitimately omits it from its BND mirror.
	// Subtract them everywhere, exactly the case HANDOVER §4.8 verified.
	const placement = new Set(py.PLACEMENT || []);
	const problems = [];
	for (const [name, fields] of Object.entries(py)) {
		if (name === "PLACEMENT" || !(name in js)) continue;
		const mirror = new Set(js[name]);
		const missing = fields.filter((f) => !mirror.has(f) && !placement.has(f));
		if (missing.length) {
			problems.push(`BND_${name}_FIELDS omits ${missing.join(", ")} (present in presets.${name}_FIELDS)`);
		}
	}
	if (problems.length) {
		throw new Error(
			"Field-mirror guard: a JS BND_<X>_FIELDS is out of sync with its presets source:\n  " +
				problems.join("\n  ") +
				"\nA mirror that drops a field silently breaks live preview and theme export/import " +
				"(the item 25/26 escapee)."
		);
	}
}

/**
 * Typography guard — the face table, the picker and the shipped files agree.
 *
 * `typography.py` is the ONE table (key → family, files, fallbacks, leading);
 * the doctype's `arabic_font` Select is a CONSUMER of it, and a consumer that
 * drifts is the same-fact-twice defect this repo keeps paying for — the
 * sidebar picker's preset list has already done exactly that dance. Parsed as
 * TEXT like assertRegistryIdentity parses registry.py, and for the same
 * reason: it is Python, this is the JS build, and a regex over well-formed
 * literal keys is a smaller price than a language boundary.
 *
 * The file check is not decoration. A FACES entry naming a woff2 that is not
 * in public/fonts ships an @font-face whose src 404s — the desk then falls
 * back silently, which looks exactly like "the picker does nothing" and would
 * be hunted in the picker.
 */
function assertTypographySync(typographySrc, doctypeJson, fontFiles) {
	const problems = [];
	const faces = [...typographySrc.matchAll(/^    "([^"]+)":\s*\{/gm)].map((m) => m[1]);
	if (!faces.length) problems.push("typography.py: no FACES entries found — is the table literal still parseable as text?");

	const field = (doctypeJson.fields || []).find((f) => f.fieldname === "arabic_font");
	if (!field) {
		problems.push("theme_settings.json has no arabic_font field");
	} else {
		const options = String(field.options || "").split("\n").map((s) => s.trim()).filter(Boolean);
		const missing = faces.filter((f) => !options.includes(f));
		const stray = options.filter((o) => !faces.includes(o));
		if (missing.length) problems.push(`arabic_font options missing: ${missing.join(", ")}`);
		if (stray.length) problems.push(`arabic_font offers faces typography.py does not define: ${stray.join(", ")}`);
	}

	for (const m of typographySrc.matchAll(/"file":\s*"([^"]+)"/g)) {
		if (!fontFiles.includes(m[1])) problems.push(`FACES names ${m[1]}, which is not in public/fonts`);
	}

	if (problems.length) {
		throw new Error(
			"Typography guard:\n  " + problems.join("\n  ") +
				"\nThe face catalogue lives in typography.py; the Select and the shipped " +
				"woff2 files must match it exactly. Edit the table, then mirror it."
		);
	}
}

/**
 * Focus-ring coverage guard — every control our source constructs must be
 * reachable by a `:focus-visible` rule in compiled CSS, directly or through a
 * co-class it always renders with (`.bnd-bell` ships as class
 * `"bnd-icon-btn bnd-bell"`; `.bnd-icon-btn` carrying the rule covers it).
 *
 * Two sources, parsed as TEXT for the same reason `assertRegistryIdentity`
 * parses registry.py rather than importing it: `el("button", "…", …)` calls
 * in bunood.js, and `<button … class="…">` HTML string literals in
 * theme_settings.js — everywhere either file builds a control. A class
 * fragment produced by string concatenation (`"bnd-railbtn-" + shape`) is
 * filtered out — it ends in `-` and is not a real class name until runtime —
 * but the identity class beside it in the same literal is still checked.
 * A literal that resolves to an empty prefix (the whole class list built
 * from a variable) is invisible to this guard, the same blind spot
 * `assertRegistryIdentity` accepts for the same reason.
 *
 * THIS DOES NOT PROVE A RING RENDERS. It proves a rule EXISTS that could
 * match. An upstream `outline: none` at higher specificity still wins —
 * `a11y: focus draws a ring on every control that takes it` in the smoke
 * suite walks the real tab order and checks the rendered value.
 */
function assertRingCoverage(css, bunoodJs, themeSettingsJs) {
	const groups = [];
	for (const m of bunoodJs.matchAll(/el\(\s*"button"\s*,\s*"([^"]*)"/g)) groups.push(m[1]);
	for (const m of themeSettingsJs.matchAll(/<button\b[^>]*\bclass="([^"'`]*)/g)) groups.push(m[1]);

	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const ringCovered = new Set();
	for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selector = m[1];
		if (!selector.includes(":focus-visible")) continue;
		for (const c of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) ringCovered.add(c[1]);
	}

	const offenders = new Set();
	for (const group of groups) {
		const classes = group.split(/\s+/).filter((c) => /^bnd-[a-z0-9-]*[a-z0-9]$/.test(c));
		if (!classes.length) continue;
		if (classes.some((c) => ringCovered.has(c))) continue;
		for (const c of classes) offenders.add(c);
	}

	if (offenders.size) {
		throw new Error(
			`Focus-ring guard: no :focus-visible rule covers ${[...offenders].sort().join(", ")}.\n` +
				"Every control bunood.js or theme_settings.js constructs needs a ring rule, " +
				"directly on its own class or via a co-class it always renders beside. Add it " +
				"to an html[data-theme] :is(...):focus-visible group — outline: 2px solid " +
				"var(--bnd-accent); outline-offset: 1px matches every existing ring."
		);
	}
}

/**
 * Reset-chip guard — a picker that RENDERS a "reset to default" chip must BIND
 * one.
 *
 * WHY THIS EXISTS. `P.group()` emits a `.bnd-cbp-reset` button for any group
 * given a `field`, so the chip appears without the picker author doing anything.
 * Binding it is a separate line, and `bnd_render_web_picker` — copied from
 * `bnd_render_login_picker`, which has it — was written without one. Item 33
 * therefore shipped two chips that were rendered, enabled, visible and inert:
 * the fixture even banked the two nodes, which made the render look verified.
 * Twelve other pickers carried the binding, so this was the one that got it
 * wrong, which is precisely the shape a guard is for and a test is not.
 *
 * Nothing else could see it. There is no delegated handler — every picker binds
 * inside its own host — and no test, no sweep step and no other guard mentioned
 * `.bnd-cbp-reset` at all. Found by the v0.33.0 release review.
 *
 * MECHANICAL, AND DELIBERATELY CRUDE: split the file on picker function
 * boundaries and require that any body which calls `P.group(` with a `field:`
 * also binds `.bnd-cbp-reset`. It cannot prove the handler is CORRECT — the
 * suite's own settings sweep is what exercises behaviour — only that one exists,
 * which is the failure that actually happened.
 *
 * @param {string} jsSrc - theme_settings.js text
 */
function assertResetChipsBound(jsSrc) {
	const problems = [];
	// Slice on `function bnd_render_*_picker(`, keeping each body up to the next
	// picker declaration. A picker's helpers live between its own boundaries, so
	// a binding in a helper still counts — which is correct: what matters is that
	// something in that picker's scope binds the chip.
	const marks = [...jsSrc.matchAll(/function\s+(bnd_render_[a-z0-9_]*picker)\s*\(/g)];
	for (let i = 0; i < marks.length; i++) {
		const name = marks[i][1];
		const body = jsSrc.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : jsSrc.length);
		// A group with a `field` is what makes `P.group` emit the chip; a group
		// without one (a pure display grouping) legitimately has none.
		const rendersChip = /P\.group\(\s*\{[^}]*field\s*:/.test(body);
		if (!rendersChip) continue;
		// TWO LEGITIMATE WAYS TO BIND IT, and the first draft of this guard knew
		// only one — which made it fire on `bnd_render_inbox_picker`, a picker
		// whose chips have worked all along. `P.group` stamps every chip with the
		// shared `bnd-cbp-reset` AND with an optional per-picker `resetCls`, which
		// exists precisely so the notifications picker can tell its per-group chip
		// apart from its reset-ALL chip. Binding either class is correct, so this
		// accepts either: the shared one, or every `resetCls` the body declares.
		const own = [...body.matchAll(/resetCls:\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1]);
		const bound =
			body.includes('.bnd-cbp-reset")') || (own.length > 0 && own.every((c) => body.includes(`.${c}"`)));
		if (!bound) {
			problems.push(
				`${name} renders a reset chip but binds neither .bnd-cbp-reset nor ` +
					(own.length ? `its own ${own.map((c) => "." + c).join(" / ")}` : "a resetCls of its own")
			);
		}
	}
	if (problems.length) {
		throw new Error(
			[
				"Reset chips rendered but not wired:",
				...problems.map((p) => "  " + p),
				"",
				"P.group() emits the chip for any group with a `field`. Add",
				'  $host.find(".bnd-cbp-reset").on("click", ...)',
				"to that picker, the way the other pickers do.",
			].join("\n")
		);
	}
}

/**
 * Axe-route guard — the two copies of the route list must agree on ROUTE and on
 * CONTEXT.
 *
 * WHY THERE ARE TWO COPIES AT ALL, since `CLAUDE.md` names "the same fact in two
 * places" as this repo's first trap. `tools/axe-baseline.mjs` owns the list it
 * CAPTURES with; the `a11y: axe over the Desk` check owns the list it ENFORCES
 * with. Extraction into one module was the obvious fix and was rejected on
 * reading, for two reasons that are visible in the files:
 *
 *   1. The commentary is load-bearing and DIFFERENT. The tool's explains what a
 *      capture must not get wrong; the suite's explains why each route is banked
 *      kit-on versus kit-absent, which is a gating decision the tool has no
 *      opinion about. Merging them produces one comment addressed to nobody.
 *   2. The metadata legitimately differs. The suite's item-33 entries carry
 *      `bust: true` and the tool's do not, and that is CORRECT rather than
 *      drift: the tool calls `frappe.clear_cache()` immediately before it scans
 *      (`axe-baseline.mjs`), while the suite runs mid-suite where a neighbouring
 *      check can have repopulated Frappe's `(path, lang)` page cache. A shared
 *      array would need per-consumer overrides to express that, which is more
 *      machinery than the duplication it removes.
 *
 * So the fact is allowed to live twice and this makes the copies unable to
 * disagree about the part that can silently corrupt a baseline: WHICH ROUTE and
 * IN WHICH SESSION. `guest` means a cookie-less context, `portal` means the
 * portal fixture's own user, and neither means an Administrator — scan a route
 * in the wrong one and you bank a DOM that looks entirely correct and is not.
 * Slice 0 proved that by sabotage: minting an Administrator for `/orders` left
 * every visible assertion passing because `website_list_for_contact.py` renders
 * a populated list through a different branch.
 *
 * `bust` is deliberately NOT compared, for the reason in (2). Everything else
 * about an entry is.
 *
 * @param {string} toolSrc - tools/axe-baseline.mjs text
 * @param {string} suiteSrc - tests/smoke.mjs text
 */
function assertAxeRoutesAgree(toolSrc, suiteSrc) {
	// Pull `["route", "selector", {opts}]` tuples out of one region of source.
	// Crude on purpose: these are literal arrays, and a parser that understood
	// more would also fail more quietly when the shape changes.
	const parse = (src, startRe, label) => {
		const start = src.search(startRe);
		if (start === -1) throw new Error(`axe routes: could not find the ${label} route list`);
		// Stop at the line that closes the array — `];` for the tool's const,
		// `]) {` for the suite's inline `for (… of [ … ]) {`.
		const rest = src.slice(start);
		const end = rest.search(/\n\s*\]\)?[;\s]/);
		const body = rest.slice(0, end === -1 ? rest.length : end);
		const out = new Map();
		for (const m of body.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]*)"\s*(?:,\s*\{([^}]*)\})?\s*\]/g)) {
			const opts = m[3] || "";
			out.set(m[1], {
				waitFor: m[2],
				guest: /\bguest\s*:\s*true/.test(opts),
				portal: /\bportal\s*:\s*true/.test(opts),
			});
		}
		if (!out.size) throw new Error(`axe routes: parsed zero routes from the ${label} list`);
		return out;
	};

	const tool = parse(toolSrc, /const ROUTES = \[/, "tools/axe-baseline.mjs");
	const suite = parse(suiteSrc, /for \(const \[route, waitFor, opts\] of \[/, "tests/smoke.mjs");

	const problems = [];
	for (const route of tool.keys()) if (!suite.has(route)) problems.push(`${route}: captured by the tool, never gated by the suite`);
	for (const route of suite.keys()) if (!tool.has(route)) problems.push(`${route}: gated by the suite, never captured by the tool`);
	for (const [route, t] of tool) {
		const s = suite.get(route);
		if (!s) continue;
		if (t.waitFor !== s.waitFor) problems.push(`${route}: waits for "${t.waitFor}" in the tool, "${s.waitFor}" in the suite`);
		const ctx = (e) => (e.portal ? "portal user" : e.guest ? "guest" : "Administrator");
		if (ctx(t) !== ctx(s)) problems.push(`${route}: scanned as ${ctx(t)} by the tool, ${ctx(s)} by the suite`);
	}

	if (problems.length) {
		throw new Error(
			[
				"The axe route lists disagree:",
				...problems.map((p) => "  " + p),
				"",
				"tools/axe-baseline.mjs CAPTURES tests/fixtures/axe-baseline.json;",
				"the `a11y: axe over the Desk` check ENFORCES it. A route present in",
				"one and not the other, or scanned in a different session, banks or",
				"gates a DOM that looks correct and is not. Update both.",
			].join("\n")
		);
	}
}

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

	// The print entry is the ONE exemption from logical-only — wkhtmltopdf has
	// no logical properties and nothing rtlcss-processes an inline Print Style,
	// so that sheet answers direction explicitly and `assertPrintSafeCss` bounds
	// what it may use instead. Every other entry keeps the guard.
	if (key === "bunood-print") assertPrintSafeCss(result.css, `${key}.css`);
	else assertLogicalOnly(result.css, `${key}.css`);
	assertTokensDeclared(result.css, `${key}.css`, RUNTIME_TOKENS, BASE_TOKENS);
	assertOwnershipPolarity(result.css, `${key}.css`);
	assertCursiveSafe(result.css, `${key}.css`);
	assertMotionPrimitive(result.css, `${key}.css`);
	assertBreakpointVocabulary(result.css, `${key}.css`);
	assertNoAuthoredCopy(result.css, `${key}.css`);
	assertNoPhantomSassFn(result.css, `${key}.css`);
	if (key === "bunood-email") assertEmailSafeCss(result.css, `${key}.css`);

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

	return { pyid, url: `/assets/bunood_theme/dist/css/${filename}`, css: result.css };
}

/**
 * JS entry points. Plain files, hashed and copied — no bundler.
 *
 * Deliberately NOT esbuild: the theme's JS policy (see bunood.js header) keeps
 * scripts tiny, and a copy step has zero dependencies to break. If the JS ever
 * grows enough to want imports, add esbuild THEN, not preemptively.
 */
const JS_ENTRIES = [{ key: "bunood", src: "bunood.js", pyid: "THEME_JS" }];

// Keep the optional invoice controller separate, but cover it with the same
// identity, focus, translation, immutable hash and payload gates as desk JS.
async function readDeskJs() {
	return (await Promise.all(["bunood.js", "sales_bill.js"].map(src => readFile(join(JS, src), "utf8")))).join("\n").replace(/\r\n/g, "\n");
}

/**
 * Hash and copy one JS entry to dist, reaping older hashes of the same entry.
 * Mirrors buildEntry() for CSS; kept separate because the compile step differs.
 * @returns {Promise<{pyid: string, url: string}>}
 */
async function buildJsEntry({ key, src, pyid }) {
	// Normalize to LF before hashing: a CRLF Windows checkout and CI's LF
	// checkout must produce the SAME content hash, or the dist-drift gate
	// fails on every push made from Windows (CI run #1 did exactly that).
	const source = key === "bunood" ? await readDeskJs() : (await readFile(join(JS, src), "utf8")).replace(/\r\n/g, "\n");
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
	// Reject URL-coupled styling before Sass compilation. The negative self-test
	// proves both forbidden spellings still trip the gate before the real tree is
	// scanned recursively.
	assertRouteAgnosticGateSelfTest();
	assertRouteAgnosticScss(await readScssSources());

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
	assertRegistryIdentity(
		await readFile(new URL("./bunood_theme/registry.py", import.meta.url), "utf8"),
		await readDeskJs()
	);
	assertFieldMirrors(
		await readFile(new URL("./bunood_theme/presets.py", import.meta.url), "utf8"),
		await readFile(
			new URL("./bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js", import.meta.url),
			"utf8"
		)
	);
	assertResetChipsBound(
		await readFile(
			new URL("./bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js", import.meta.url),
			"utf8"
		)
	);
	assertAxeRoutesAgree(
		await readFile(new URL("./tools/axe-baseline.mjs", import.meta.url), "utf8"),
		await readFile(new URL("./tests/smoke.mjs", import.meta.url), "utf8")
	);
	assertTypographySync(
		await readFile(new URL("./bunood_theme/typography.py", import.meta.url), "utf8").catch(() => ""),
		JSON.parse(
			await readFile(
				new URL("./bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.json", import.meta.url),
				"utf8"
			)
		),
		await readdir(new URL("./bunood_theme/public/fonts", import.meta.url)).catch(() => [])
	);
	// Item 7(c). A counted noun has no correct Arabic through a plural-free
	// dictionary, so it is refused at the source rather than left for a
	// translator who cannot fix it.
	assertNoCountGoverned();
	// Item 7(d). Held out of the build while it was red — a red build blocks
	// every deploy — and wired in the moment translations/ar.csv shipped. From
	// here a NEW `__()` string fails the build until someone decides what it
	// says in Arabic (a row in locale/ar.po + emit) or why it says nothing
	// (locale/untranslatable.txt, with a reason). That is the mechanism the
	// roadmap item asked for: coverage is a property the build maintains, not
	// a number that rots in a document.
	assertTranslationCoverage();
	// Item 25. The chart series tokens JS reads must be mode-correct under the
	// unresolved "automatic" theme, or a dark-OS user gets the light ramp.
	assertAutomaticParity();

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

	// Compiled CSS is in hand from the loop above; needs both JS sources too,
	// so it runs here rather than beside the naming/registry/typography/i18n
	// guards, which all run BEFORE compilation on source alone.
	assertRingCoverage(
		built.map((b) => b.css || "").join("\n"),
		await readDeskJs(),
		await readFile(
			new URL("./bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js", import.meta.url),
			"utf8"
		)
	);

	await writeAssetsPy(built);
	console.log("wrote  bunood_theme/assets.py");

	// Measures the dist files just written above, so it must run last, not
	// alongside the naming/registry/typography/i18n guards which all run
	// BEFORE compilation on source rather than output.
	const { ok, over } = checkPayload();
	if (!ok) throw new Error(budgetExceededMessage(over));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
