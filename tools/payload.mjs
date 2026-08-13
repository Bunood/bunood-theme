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
 *               every verify, AND by `build.mjs` itself (item 22, commit 1) —
 *               `measure()` and `checkPayload()` below are exported so the
 *               build can call the same check in-process, the way its other
 *               guards (assertFieldNaming, assertRegistryIdentity, ...) work.
 *               Failing at `npm run build` beats failing 25 minutes into a
 *               suite run.
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
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "payload-budget.json");

export function measure() {
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

/**
 * Compare the just-built bundle's gzip bytes against the ceiling. Pure: no
 * process.exit, no console output — so a caller in-process (build.mjs) and
 * a caller over a spawned process (the suite, via the CLI below) can both
 * use it and decide what to do with the answer themselves.
 *
 * @returns {{ok: boolean, now: object, ledger: object, over: string[]}}
 */
export function checkPayload() {
	const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
	const now = measure();
	const over = [];
	for (const key of ["css_gzip", "js_gzip"]) {
		if (now[key] > ledger.ceiling[key]) {
			over.push(`${key}: ${now[key]} > ceiling ${ledger.ceiling[key]} (+${now[key] - ledger.ceiling[key]} bytes)`);
		}
	}
	return { ok: over.length === 0, now, ledger, over };
}

/** The message a failed check prints, shared so build.mjs and this CLI agree word for word. */
export function budgetExceededMessage(over) {
	return (
		`\nPAYLOAD BUDGET EXCEEDED\n  ${over.join("\n  ")}\n` +
			`\nThis gate failing is the process working: growth is now a decision.\n` +
			`If the bytes are worth it, raise the ceiling in payload-budget.json\n` +
			`IN THE SAME COMMIT and say why in its message. If they are not,\n` +
			`find what grew — compare against the last history row.`
	);
}

// ── CLI entry point ──────────────────────────────────────────────────────
// Guarded so `import { measure, checkPayload } from "./tools/payload.mjs"`
// does not also run the CLI branch below. realpath rather than comparing
// import.meta.url to process.argv[1] as strings: a Windows drive letter and
// slash direction can make the same file fail a naive string comparison.
const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
	const now = measure();
	const kb = (n) => (n / 1024).toFixed(1) + " KB";
	console.log(`css ${kb(now.css_raw)} raw / ${kb(now.css_gzip)} gzip · js ${kb(now.js_raw)} raw / ${kb(now.js_gzip)} gzip`);

	const mode = process.argv[2] || "";

	if (mode === "--check") {
		const { ok, over, ledger } = checkPayload();
		if (!ok) {
			console.error(budgetExceededMessage(over));
			process.exit(1);
		}
		const headroom = ["css_gzip", "js_gzip"]
			.map((k) => `${k.split("_")[0]} ${ledger.ceiling[k] - now[k]}b free`)
			.join(", ");
		console.log(`within budget (${headroom})`);
		process.exit(0);
	}

	if (mode === "--record") {
		const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
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
}
