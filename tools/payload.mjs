/**
 * The payload budget (GUIDELINES §2.5): measure, check, record.
 *
 * WHY IT EXISTS
 *     The CSS and JS grew from 78/183 KB raw to 92/247 KB across five
 *     releases with nobody deciding that — because nothing measured it.
 *     Growth is fine; UNDECIDED growth is how a 78 KB sheet becomes a
 *     400 KB one, one reasonable slice at a time. The ceiling makes the
 *     next kilobyte a decision instead of a drift.
 *
 * THE CONTRACT
 *     --check   compare the built bundle's gzip bytes against the ceiling in
 *               payload-budget.json; exit 1 over it. Run by the suite on
 *               every verify (and intended for build.mjs once item 7's edits
 *               to it land — the gate belongs beside the other build guards).
 *     --record vX.Y.Z
 *               append a history row for a release. Run at tag time, in the
 *               release chain, so every release carries its own numbers.
 *     (no flag) print the current measurement.
 *
 * WHY THE CEILING IS GZIP
 *     The wire is what a first paint waits on. Raw bytes are recorded too —
 *     parse cost is real — but gating on raw would punish comments and
 *     readable class names, which this codebase deliberately keeps.
 *
 * RAISING THE CEILING
 *     Edit payload-budget.json in the same commit as the change that needs
 *     the room, and say why in the message. The gate failing IS the process
 *     working: it is the moment the growth becomes a decision.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "payload-budget.json");

function measure() {
	const out = {};
	for (const [dir, kind] of [
		[join(ROOT, "bunood_theme", "public", "dist", "css"), "css"],
		[join(ROOT, "bunood_theme", "public", "dist", "js"), "js"],
	]) {
		const file = readdirSync(dir).find((f) => f.startsWith("bunood."));
		if (!file) throw new Error(`no built bundle in ${dir} — run the build first`);
		const buf = readFileSync(join(dir, file));
		out[`${kind}_raw`] = buf.length;
		out[`${kind}_gzip`] = gzipSync(buf, { level: 9 }).length;
	}
	return out;
}

const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
const now = measure();
const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`css ${kb(now.css_raw)} raw / ${kb(now.css_gzip)} gzip · js ${kb(now.js_raw)} raw / ${kb(now.js_gzip)} gzip`);

const mode = process.argv[2] || "";

if (mode === "--check") {
	const over = [];
	for (const key of ["css_gzip", "js_gzip"]) {
		if (now[key] > ledger.ceiling[key]) {
			over.push(`${key}: ${now[key]} > ceiling ${ledger.ceiling[key]} (+${now[key] - ledger.ceiling[key]} bytes)`);
		}
	}
	if (over.length) {
		console.error(
			`\nPAYLOAD BUDGET EXCEEDED\n  ${over.join("\n  ")}\n` +
				`\nThis gate failing is the process working: growth is now a decision.\n` +
				`If the bytes are worth it, raise the ceiling in payload-budget.json\n` +
				`IN THE SAME COMMIT and say why in its message. If they are not,\n` +
				`find what grew — compare against the last history row.`
		);
		process.exit(1);
	}
	const headroom = ["css_gzip", "js_gzip"]
		.map((k) => `${k.split("_")[0]} ${ledger.ceiling[k] - now[k]}b free`)
		.join(", ");
	console.log(`within budget (${headroom})`);
	process.exit(0);
}

if (mode === "--record") {
	const version = process.argv[3];
	if (!/^v\d+\.\d+\.\d+$/.test(version || "")) {
		console.error("usage: node tools/payload.mjs --record vX.Y.Z");
		process.exit(1);
	}
	if (ledger.history.some((h) => h.version === version)) {
		console.error(`${version} already recorded — the ledger is append-only, one row per release`);
		process.exit(1);
	}
	const prev = ledger.history[ledger.history.length - 1];
	const row = { version, date: new Date().toISOString().slice(0, 10), ...now };
	if (prev) {
		row.note = `css ${now.css_gzip - prev.css_gzip >= 0 ? "+" : ""}${now.css_gzip - prev.css_gzip}b, js ${now.js_gzip - prev.js_gzip >= 0 ? "+" : ""}${now.js_gzip - prev.js_gzip}b gzip vs ${prev.version}`;
	}
	ledger.history.push(row);
	writeFileSync(LEDGER, JSON.stringify(ledger, null, "\t") + "\n");
	console.log(`recorded ${version}${row.note ? " — " + row.note : ""}`);
	process.exit(0);
}
