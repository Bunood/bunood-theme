/**
 * The translation catalogue, and the gate that keeps it honest.
 *
 * WHAT
 *   1. `extractCatalogue()` derives every translatable source string this app
 *      owns, from the two places they actually live: `__()` calls in our JS,
 *      and the DocType JSON (labels, descriptions, Select options).
 *   2. `assertTranslationCoverage()` fails when a source string has no decision
 *      recorded against it — neither a translation nor an explicit exemption.
 *
 * WHY THE CATALOGUE IS DERIVED AND NEVER WRITTEN DOWN
 *   `ROADMAP.md` records item 7 as "356 strings". It is 388 in the JS alone as
 *   of this commit, and that number moved twice in a week. A hand-counted
 *   inventory is the same fact in two places — the defect CLAUDE.md names as
 *   the root cause of every critical failure here. So nothing lists the
 *   strings; the build recomputes them.
 *
 * WHY WE PORT FRAPPE'S DOCTYPE EXTRACTOR RATHER THAN SCANNING FOR `__("...")`
 *   20 call sites pass a VARIABLE: `__(s.value)`, `__(m.value)`, `__(l.value)`.
 *   Those are Select option values, and a literal-only scan sees none of them —
 *   it would report the strings as absent while the desk translates them at
 *   render time. The values come from the DocType JSON, which is why the
 *   doctype half exists. It is a port of
 *   `frappe/gettext/extractors/utils.py::extract_messages_from_docfield`,
 *   including `EXCLUDE_SELECT_OPTIONS` and the empty/numeric-only filtering,
 *   so our idea of "translatable" cannot drift from Frappe's.
 *
 * WHY A REGEX FOR THE JS, AND WHY IT CHECKS ITSELF
 *   Frappe uses a regex here too (`TRANSLATE_PATTERN`). A hand-rolled scanner
 *   tracking string/comment state was tried first and silently lost 152 of 308
 *   call sites in `theme_settings.js`: that file is dense with single-quoted
 *   strings containing double quotes, and one mis-parse flips every quote after
 *   it. A regex has no state to get wrong — but to prove it, `fromJs()` also
 *   counts call sites the crudest possible way and refuses to return if the two
 *   disagree. Silent under-extraction is the only failure mode that matters
 *   here, because it looks exactly like "fully translated".
 *
 * USAGE
 *   npm run i18n:check        # the gate, offline and deterministic
 *   npm run i18n:list         # print the catalogue (debugging)
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "bunood_theme");

/**
 * JS we own. `public/dist` is deliberately absent: it is build output, its
 * filename carries a content hash, and scanning it would add a duplicate of
 * every string plus churn the catalogue on every build.
 */
const JS_SOURCES = [
	join(APP, "public", "js", "bunood.js"),
	join(APP, "public", "js", "sales_bill.js"),
	join(APP, "public", "js", "simple_forms.js"),
	join(APP, "bunood_theme", "doctype", "theme_settings", "theme_settings.js"),
	join(APP, "bunood_theme", "page", "bnd_inbox", "bnd_inbox.js"),
];

/** Frappe's list, restated so the port is auditable against the original. */
const EXCLUDE_SELECT_OPTIONS = new Set([
	"naming_series", "number_format", "float_precision",
	"currency_precision", "minimum_password_score", "icon",
]);

/** `frappe/gettext/extractors/utils.py::is_translatable`, verbatim in effect. */
export function isTranslatable(m) {
	return /[a-zA-Z]/.test(m) && !m.startsWith("fa fa-") && !m.endsWith("px") && !m.startsWith("eval:");
}

/** Every doctype definition we ship, as `<module>/doctype/<name>/<name>.json`. */
function doctypeFiles() {
	const base = join(APP, "bunood_theme", "doctype");
	if (!existsSync(base)) return [];
	const out = [];
	for (const dir of readdirSync(base)) {
		const f = join(base, dir, `${dir}.json`);
		if (existsSync(f) && statSync(f).isFile()) out.push(f);
	}
	return out;
}

/**
 * Port of Frappe's DocType extractor.
 *
 * Note it yields NO msgctxt, exactly as Frappe's does: `doctype.py` emits the
 * funcname `"_"`, not `pgettext`, so a field label's translation key is the
 * bare string. The doctype name survives only in the human-readable comment.
 * That is why colliding with a core string cannot be fixed with a context and
 * has to be fixed by renaming ours — see GUIDELINES on the vocabulary rule.
 */
export function fromDoctype(path) {
	const data = JSON.parse(readFileSync(path, "utf8"));
	const out = [];
	const add = (msg, comment) => {
		if (typeof msg === "string" && isTranslatable(msg)) out.push({ msg, comment });
	};

	add(data.name, "Name of a DocType");
	if (data.description) add(data.description, "Description of a DocType");

	for (const f of data.fields || []) {
		const dt = f.fieldtype;
		if (f.label) add(f.label, `Label of a ${dt} field in DocType '${data.name}'`);
		if (f.description) add(f.description, `Description of a ${dt} field in DocType '${data.name}'`);
		if (!f.options) continue;

		if (dt === "Select" && !EXCLUDE_SELECT_OPTIONS.has(f.fieldname)) {
			for (const raw of String(f.options).split("\n")) {
				const o = raw.trim();
				// Frappe drops empty and numeric-only options. Numeric-only
				// matters here: several pickers offer "1".."5" as counts, and a
				// translated "3" would be a defect, not a feature.
				if (!o || /^\d+$/.test(o)) continue;
				add(o, `Option for '${f.label || f.fieldname}' in DocType '${data.name}'`);
			}
		} else if (dt === "HTML") {
			add(String(f.options), `Content of an HTML field in DocType '${data.name}'`);
		}
	}

	for (const p of data.permissions || []) {
		if (p.role) add(p.role, "Name of a role");
	}
	return out;
}

// Group 1 is the opening quote, group 2 everything up to the matching one.
// [\s\S] so a message may span lines, which Frappe's own pattern also allows.
const CALL = /__\(\s*(["'`])((?:(?!\1)[\s\S])*)\1/g;
const RAW = /__\(\s*["'`]/g;

/** Decode the escapes that actually occur in UI strings. */
function unescape(s) {
	return s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(['"`\\])/g, "$1");
}

/**
 * `__("literal")` call sites, with a self-check.
 *
 * The self-check is not decoration. Under-extraction is indistinguishable from
 * "everything is translated", so the one thing this function must never do is
 * quietly return fewer strings than exist.
 */
export function fromJs(paths = JS_SOURCES) {
	const out = [];
	let raw = 0;
	let matched = 0;

	for (const p of paths) {
		const src = readFileSync(p, "utf8");
		const name = p.split(/[\\/]/).pop();
		raw += (src.match(RAW) || []).length;
		CALL.lastIndex = 0;
		let m;
		while ((m = CALL.exec(src))) {
			matched++;
			const text = unescape(m[2]);
			if (isTranslatable(text)) out.push({ msg: text, comment: `In ${name}` });
		}
	}

	if (raw !== matched) {
		throw new Error(
			`i18n extractor: found ${raw} \`__(\` call sites but parsed ${matched}. ` +
				"The message regex is wrong, or a source file uses a form it does not " +
				"handle. Under-extraction reads as full coverage, so this refuses rather " +
				"than returning a short list."
		);
	}
	return out;
}

// Python's marker is `_(`, not `__(`. The negative lookbehind stops it matching
// the tail of an identifier (`gettext_(`, `__(`) — without it every JS-style
// call in a .py docstring would be counted twice.
const PY_CALL = /(?<![A-Za-z0-9_])_\(\s*(["'])((?:(?!\1)[\s\S])*)\1/g;
const PY_RAW = /(?<![A-Za-z0-9_])_\(\s*["']/g;

/** Every .py file the app ships. */
function pythonFiles(dir = APP, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "__pycache__" || entry.name === "node_modules") continue;
		const p = join(dir, entry.name);
		if (entry.isDirectory()) pythonFiles(p, out);
		else if (entry.name.endsWith(".py")) out.push(p);
	}
	return out;
}

/**
 * `_("literal")` call sites in Python.
 *
 * WHY THIS EXISTS SEPARATELY FROM fromJs
 *   It was missing at first, and that is worth recording rather than quietly
 *   fixing: the contrast-adjustment report was rewritten into seven `_()`
 *   sentences in theme_settings.py, and the coverage gate went on reporting
 *   full coverage because it had never looked at a .py file. A gate that is
 *   blind to a whole language is the "green tests that assert existence"
 *   failure this repo names, wearing a new coat.
 *
 * Same self-check as the JS half, for the same reason.
 */
export function fromPython(paths = pythonFiles()) {
	const out = [];
	let raw = 0;
	let matched = 0;
	for (const p of paths) {
		const src = readFileSync(p, "utf8");
		const name = p.split(/[\\/]/).pop();
		raw += (src.match(PY_RAW) || []).length;
		PY_CALL.lastIndex = 0;
		let m;
		while ((m = PY_CALL.exec(src))) {
			matched++;
			const text = unescape(m[2]);
			if (isTranslatable(text)) out.push({ msg: text, comment: `In ${name}` });
		}
	}
	if (raw !== matched) {
		throw new Error(
			`i18n extractor: found ${raw} python \`_(\` call sites but parsed ${matched}. ` +
				"Under-extraction reads as full coverage, so this refuses."
		);
	}
	return out;
}

/**
 * The whole catalogue: msgid -> the first comment that described it.
 *
 * A Map keyed by msgid, so a string reached from two places is one entry — the
 * runtime dictionary is flat and keyed the same way, and pretending otherwise
 * would make the gate demand two translations for one lookup.
 */
export function extractCatalogue() {
	const cat = new Map();
	for (const f of doctypeFiles()) {
		for (const { msg, comment } of fromDoctype(f)) if (!cat.has(msg)) cat.set(msg, comment);
	}
	for (const { msg, comment } of fromJs()) if (!cat.has(msg)) cat.set(msg, comment);
	for (const { msg, comment } of fromPython()) if (!cat.has(msg)) cat.set(msg, comment);
	return cat;
}

/**
 * Read a Frappe translation CSV: col0 source, col1 translation, col2 context.
 *
 * Deliberately minimal, and deliberately not a dependency: the format is
 * `python csv` defaults — comma separated, `"` quoted, `""` for a literal
 * quote. Rows whose translation is empty count as UNtranslated, because that
 * is exactly how the runtime treats them (`__()` falls back to the source on a
 * falsy value).
 */
export function readTranslations(path) {
	const map = new Map();
	if (!existsSync(path)) return map;
	const text = readFileSync(path, "utf8");
	const rows = [];
	let row = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') { cell += '"'; i++; }
				else quoted = false;
			} else cell += c;
			continue;
		}
		if (c === '"') { quoted = true; continue; }
		if (c === ",") { row.push(cell); cell = ""; continue; }
		if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
		if (c === "\r") continue;
		cell += c;
	}
	if (cell || row.length) { row.push(cell); rows.push(row); }

	for (const r of rows) {
		if (!r.length || !r[0]) continue;
		const source = r[0].replace(/\\n/g, "\n");
		const translated = (r[1] || "").trim();
		if (translated) map.set(source, translated);
	}
	return map;
}

/**
 * Strings upstream already translates, and translates correctly for our sense.
 *
 * WHY THIS FILE EXISTS AT ALL
 *   The runtime dictionary is ONE flat global map shared by every installed
 *   app, so a string frappe or erpnext already translates needs no row from us —
 *   the lookup finds theirs. That is the cheapest and most consistent outcome
 *   available: reuse by OMISSION, which is also the only way the desk speaks one
 *   vocabulary instead of two.
 *
 *   But the coverage gate counts a string as covered only if WE ship it or WE
 *   exempt it, so inheriting would read as a hole. This is the third category,
 *   and it is GENERATED (`npm run i18n:inherited`) from the .po files in the
 *   running containers rather than hand-listed — a hand-listed copy of what
 *   upstream happens to translate would be stale the next time ERPNext ships.
 *
 * WHY IT IS NOT SIMPLY "EVERY COLLISION"
 *   37 of our strings collide; several are false friends where upstream's sense
 *   is wrong for ours ("Operator" is a machine operator in Manufacturing). Those
 *   are NOT inherited — they are renamed, or we ship a row deliberately. This
 *   file records only the ones a human has accepted.
 */
export function readInherited(path) {
	return readExempt(path);
}

/** One msgid per line; `#` comments and blanks ignored. */
export function readExempt(path) {
	const set = new Set();
	if (!existsSync(path)) return set;
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		// `msgid<TAB>reason`, so a reason is recorded beside every exemption.
		set.add(t.split("\t")[0]);
	}
	return set;
}

/**
 * Source strings that may keep a count-governed shape, with the reason.
 *
 * EMPTY, AND IT MUST STAY THAT WAY. It exists so that a future exception is a
 * deliberate, argued act with a name attached, rather than a quiet edit to the
 * regex below. Do not add to it to make a build pass — reshape the string.
 */
const PLURAL_EXCEPTIONS = new Map();

/**
 * Refuse a source string whose placeholder governs a noun.
 *
 * WHY THIS CANNOT BE FIXED IN TRANSLATION
 *   Frappe's dictionary is flat: one key, one string. It carries no plural
 *   forms at all — `get_translations_from_mo` stores `m.string`, which for a
 *   plural message is a tuple, so plurals are broken upstream by construction.
 *   Arabic meanwhile has six plural categories (zero, one, two, few, many,
 *   other). `__("{0} errors")` therefore has no correct Arabic for 1, 2, 3-10
 *   and 11+ simultaneously, and no translator can supply one.
 *
 *   So the fix is string DESIGN, not a plural library: name the label and let
 *   the number follow. "Errors: 3" is grammar-free in every language, and the
 *   status bar already read that way for "Density: {0}" before item 7 made it
 *   uniform.
 *
 * WHAT IT MATCHES
 *   A placeholder followed by whitespace and a lowercase letter — "{0} errors",
 *   "{0} running". Not "{0}s ago" (an abbreviation, no governed noun) and not
 *   "{0} — not available" (punctuation, not a noun).
 */
export function assertNoCountGoverned() {
	const catalogue = extractCatalogue();
	const offenders = [...catalogue.keys()].filter(
		(m) => /\{\d\}\s+[a-z]/.test(m) && !PLURAL_EXCEPTIONS.has(m)
	);
	if (offenders.length) {
		throw new Error(
			`Plural guard: ${offenders.length} source string(s) let a placeholder govern a noun:\n  ` +
				offenders.map((m) => JSON.stringify(m)).join("\n  ") +
				"\nFrappe's translation layer has no plural forms and Arabic has six " +
				"categories, so there is no correct translation for these. Rewrite as " +
				'label + value — "Errors: {0}", not "{0} errors".'
		);
	}
	return offenders.length;
}

/**
 * The gate.
 *
 * Two directions, and the second is what makes the exemption list SHRINK
 * rather than grow: an exemption for a msgid that no longer exists is itself a
 * failure, so deleting a string forces its exemption to be deleted with it.
 * Without that, `untranslatable.txt` becomes a graveyard nobody prunes and the
 * coverage number quietly stops meaning anything — the exact fate `build.mjs`
 * warns about for FIELD_EXCEPTIONS.
 */
export function assertTranslationCoverage(lang = "ar") {
	const catalogue = extractCatalogue();
	const shipped = readTranslations(join(APP, "translations", `${lang}.csv`));
	const exempt = readExempt(join(APP, "locale", "untranslatable.txt"));
	const inherited = readInherited(join(APP, "locale", `inherited.${lang}.txt`));

	const missing = [...catalogue.keys()].filter(
		(m) => !shipped.has(m) && !exempt.has(m) && !inherited.has(m)
	);
	const staleExempt = [...exempt, ...inherited].filter((m) => !catalogue.has(m));
	// A row that duplicates what we already inherit is the second copy of a
	// fact, and it silently overrides upstream desk-wide the moment their
	// wording changes. Cheap to check, so it is checked.
	const redundant = [...shipped.keys()].filter((m) => inherited.has(m));
	// PLACEHOLDERS MUST SURVIVE TRANSLATION. `{0}` and `{details}` are the
	// contract between the string and its call site; a translation that drops
	// or invents one renders "الكثافة: {0}" as a literal or throws at format
	// time. This repo has already shipped that bug once in the other direction
	// — "{0} List" reordered to "قائمة {0}" broke the palette's badge regex —
	// so the SET of tokens is compared, not their order: reordering is what
	// Arabic legitimately does.
	const token = /\{[A-Za-z0-9_]+\}/g;
	const placeholderBroken = [...shipped.entries()]
		.filter(([id]) => catalogue.has(id))
		.filter(([id, str]) => {
			const a = new Set(id.match(token) || []);
			const b = new Set(str.match(token) || []);
			return a.size !== b.size || [...a].some((t) => !b.has(t));
		})
		.map(([id]) => id);

	const problems = [];
	if (missing.length) {
		problems.push(
			`${missing.length} of ${catalogue.size} source strings have no ${lang} translation ` +
				`and no exemption. First 8:\n    ` +
				missing.slice(0, 8).map((m) => JSON.stringify(m)).join("\n    ")
		);
	}
	if (staleExempt.length) {
		problems.push(
			`${staleExempt.length} exemption/inheritance entr(ies) name a string that no ` +
				`longer exists — delete them:\n    ` +
				staleExempt.slice(0, 8).map((m) => JSON.stringify(m)).join("\n    ")
		);
	}
	if (redundant.length) {
		problems.push(
			`${redundant.length} row(s) in ${lang}.csv duplicate a string we already inherit ` +
				`from frappe/erpnext. Delete the row and let the shared dictionary answer, or ` +
				`remove it from inherited.${lang}.txt if we mean to override:\n    ` +
				redundant.slice(0, 8).map((m) => JSON.stringify(m)).join("\n    ")
		);
	}
	if (placeholderBroken.length) {
		problems.push(
			`${placeholderBroken.length} translation(s) drop or invent a {placeholder} — the ` +
				`call site will render a literal or throw at format time:\n    ` +
				placeholderBroken.slice(0, 8).map((m) => JSON.stringify(m)).join("\n    ")
		);
	}
	if (problems.length) {
		throw new Error(
			`Translation coverage (${lang}):\n  ` + problems.join("\n  ") +
				`\n\n  Add the translation to bunood_theme/translations/${lang}.csv, or record it in ` +
				`bunood_theme/locale/untranslatable.txt with a tab-separated reason. ` +
				`That list must shrink; do not grow it to make a build pass.`
		);
	}
	return { total: catalogue.size, translated: catalogue.size - exempt.size, exempt: exempt.size };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const mode = process.argv[2] || "check";
	if (mode === "list") {
		const cat = extractCatalogue();
		for (const [msg, comment] of [...cat].sort(([a], [b]) => (a < b ? -1 : 1))) {
			console.log(`${JSON.stringify(msg)}\t${comment}`);
		}
		console.error(`\n${cat.size} distinct source strings`);
	} else {
		try {
			const r = assertTranslationCoverage(process.argv[3] || "ar");
			console.log(`i18n: ${r.total} source strings, ${r.exempt} exempt — coverage complete`);
		} catch (err) {
			console.error(err.message);
			process.exitCode = 1;
		}
	}
}
