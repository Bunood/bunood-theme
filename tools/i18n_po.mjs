/**
 * The decisions file and the shipped artifact, kept honest about which is which.
 *
 * TWO FILES, ONE FACT
 *   `locale/ar.po`           — the DECISIONS. Committed, reviewed, hand-editable.
 *                              Carries provenance (`#. src:`), the catalogue's
 *                              own comment for context, and `#, fuzzy` on every
 *                              machine-proposed entry: clearing fuzzy is a HUMAN
 *                              act, and nothing that has lost its fuzzy flag is
 *                              ever machine-rewritten again.
 *   `translations/ar.csv`    — the ARTIFACT Frappe actually reads at runtime
 *                              (`get_translations_from_csv`), regenerated
 *                              WHOLESALE from the PO by `emit`. Never edited:
 *                              the CSV format has no comment syntax, so the
 *                              do-not-edit notice cannot live inside it — it
 *                              lives here and in the PO header instead.
 *
 * WHY PO AND NOT JUST THE CSV
 *   The CSV is a flat pair list: it cannot say who translated a row, whether a
 *   human reviewed it, or why an entry is deliberately empty. PO carries all of
 *   that natively (`#, fuzzy`, `#.` comments, `#~` obsolete), which is exactly
 *   the memory a re-run needs so it never silently re-translates an approved
 *   string. Frappe itself moved to PO in v16 for the same reasons; ours stays
 *   a CSV at runtime only because a CSV needs no compile step and no writable
 *   `sites/` volume — the .mo path dies on a `compose down`.
 *
 * USAGE
 *   node tools/i18n_po.mjs build map1.json [map2.json ...]   # first fill only
 *   node tools/i18n_po.mjs emit                              # ar.po -> ar.csv
 *
 *   `build` REFUSES to overwrite an existing ar.po: the PO accumulates human
 *   decisions, and a rebuild from scratch would throw them away. The merge
 *   flow for later catalogue changes is sync work, not a rebuild.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "bunood_theme");
const PO = join(APP, "locale", "ar.po");
const CSV = join(APP, "translations", "ar.csv");

const { extractCatalogue, readInherited } = await import(
	`file://${join(ROOT, "tools", "i18n.mjs").replace(/\\/g, "/")}`
);

/** PO string escaping: backslash first, then quotes and newlines. */
const poq = (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';

function buildPo(mapFiles) {
	if (existsSync(PO)) {
		console.error(
			"refusing: locale/ar.po already exists. It accumulates HUMAN decisions " +
				"(cleared fuzzy flags), and a rebuild would throw them away. Edit it, " +
				"or delete it deliberately first."
		);
		process.exit(1);
	}
	const catalogue = extractCatalogue();
	const inherited = readInherited(join(APP, "locale", "inherited.ar.txt"));

	const map = {};
	for (const f of mapFiles) Object.assign(map, JSON.parse(readFileSync(f, "utf8")));

	const entries = [];
	let skippedInherited = 0;
	const strays = [];
	for (const [msgid, msgstr] of Object.entries(map)) {
		if (inherited.has(msgid)) {
			// Upstream already answers this one; shipping our row would be the
			// redundant override the gate refuses. The authored Arabic is simply
			// dropped — reuse-by-omission is the whole point of the inherited set.
			skippedInherited++;
			continue;
		}
		if (!catalogue.has(msgid)) {
			strays.push(msgid);
			continue;
		}
		entries.push({ msgid, msgstr, comment: catalogue.get(msgid) });
	}
	const missing = [...catalogue.keys()].filter((m) => !inherited.has(m) && !(m in map));

	entries.sort((a, b) => (a.msgid < b.msgid ? -1 : 1));

	const head = [
		'msgid ""',
		'msgstr ""',
		'"Project-Id-Version: bunood_theme\\n"',
		'"Language: ar\\n"',
		'"MIME-Version: 1.0\\n"',
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Content-Transfer-Encoding: 8bit\\n"',
		'"X-Generator: tools/i18n_po.mjs\\n"',
		"",
		"# THE DECISIONS FILE — translations/ar.csv is GENERATED from this by",
		"# `node tools/i18n_po.mjs emit`; never edit the CSV.",
		"#",
		"# Every machine-proposed entry carries `#, fuzzy`. Reviewing one means",
		"# fixing the Arabic if needed and REMOVING the fuzzy line: that marks it",
		"# human-approved, and no tool will ever rewrite a non-fuzzy entry.",
		"#",
		"# Strings upstream already translates are NOT here — see",
		"# locale/inherited.ar.txt. Strings with no entry at all are the",
		"# still-untranslated tail; `npm run i18n:check` counts them.",
		"",
	];

	const body = entries.flatMap((e) => [
		`#. ${e.comment}`,
		"#. src: ai",
		"#, fuzzy",
		`msgid ${poq(e.msgid)}`,
		`msgstr ${poq(e.msgstr)}`,
		"",
	]);

	mkdirSync(dirname(PO), { recursive: true });
	writeFileSync(PO, head.concat(body).join("\n"), "utf8");
	console.log(`  wrote locale/ar.po: ${entries.length} entries, all fuzzy (machine-proposed)`);
	if (skippedInherited) console.log(`  skipped ${skippedInherited} inherited msgid(s) — upstream answers those`);
	for (const s of strays) console.log(`  WARNING stray (not in catalogue, dropped): ${JSON.stringify(s).slice(0, 80)}`);
	for (const m of missing) console.log(`  WARNING no translation authored for: ${JSON.stringify(m).slice(0, 80)}`);
}

/** msgid/msgstr pairs out of the PO, skipping the header and obsolete entries. */
export function parsePo(text) {
	const out = new Map();
	let id = null, str = null, field = null, ctx = "";
	const unq = (s) => {
		const m = s.match(/"([\s\S]*)"\s*$/);
		return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
	};
	// A `msgctxt` keys the entry as `context\u0004msgid` -- gettext's separator, and
	// the key `tools/i18n.mjs` catalogues a contextual `__()` under.
	const flush = () => {
		if (id) out.set(ctx ? id + "\u0004" + ctx : id, str || "");
		id = null; str = null; field = null; ctx = "";
	};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith("#~") || line === "") { flush(); continue; }
		if (line.startsWith("#")) continue;
		if (line.startsWith("msgctxt")) { flush(); ctx = unq(line.slice(7)); field = "ctx"; continue; }
		if (line.startsWith("msgid")) { const c = ctx; flush(); ctx = c; id = unq(line.slice(5)); str = ""; field = "id"; continue; }
		if (line.startsWith("msgstr")) { str = unq(line.slice(6)); field = "str"; continue; }
		if (line.startsWith('"')) {
			if (field === "id") id += unq(line);
			else if (field === "str") str += unq(line);
		}
	}
	flush();
	out.delete(""); // the header
	return out;
}

/** One CSV cell, python-csv (excel dialect) quoting: quote when needed, "" doubling. */
const csvq = (s) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

function emitCsv() {
	if (!existsSync(PO)) {
		console.error("no locale/ar.po to emit from — run `build` first");
		process.exit(1);
	}
	const po = parsePo(readFileSync(PO, "utf8"));
	const rows = [...po.entries()]
		.filter(([, str]) => str) // an empty msgstr is a decision to fall back, not a row
		.sort(([a], [b]) => (a < b ? -1 : 1))
		// Frappe's reader: col0 source, col1 translation, col2 context. Its loader
		// keys a row with a context as `source:context`, which is what a
		// `__("x", null, "context")` call looks up; every other row keeps the
		// empty third column upstream's files carry.
		.map(([key, str]) => {
			const [id, ctx = ""] = key.split("\u0004");
			return `${csvq(id)},${csvq(str)},${csvq(ctx)}`;
		});
	mkdirSync(dirname(CSV), { recursive: true });
	writeFileSync(CSV, rows.join("\n") + "\n", "utf8");
	console.log(`  wrote translations/ar.csv: ${rows.length} rows (GENERATED — edit the PO, then re-emit)`);
}

const mode = process.argv[2];
if (mode === "build") buildPo(process.argv.slice(3));
else if (mode === "emit") emitCsv();
else {
	console.error("usage: node tools/i18n_po.mjs build <map.json...> | emit");
	process.exit(1);
}
