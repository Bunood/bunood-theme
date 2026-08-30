/**
 * The upstream drift gate — check, and deliberately re-pin.
 *
 * WHAT
 *   `bunood_theme/upstream.py` computes a fingerprint of every Frappe/ERPNext
 *   fact this app is built on. This reads it off the live bench and compares it
 *   against `tests/fixtures/upstream-pins.json`.
 *
 * WHY A GATE AND NOT A REPORT
 *   The failure mode this defends against is silent. When upstream moves a DOM
 *   node, a workspace's block order or a DocType's field order, our rules do not
 *   crash — they compile, pass every other gate, and match nothing. Three of
 *   those shipped in this repo before anyone noticed. A red gate is the cheapest
 *   moment to find out.
 *
 * USAGE
 *   npm run upstream            # check; exit 1 on drift
 *   npm run upstream -- --repin # accept the current state as the new pin
 *
 * RE-PINNING IS A DECISION, NOT A FORMALITY.
 *   `--repin` is not "make the red go away". Read what moved, port what the
 *   change means for our rules, then re-pin IN THE SAME COMMIT and say in the
 *   message what you ported. A pin bumped without reading is worse than no pin:
 *   it converts a loud signal into a silent one and leaves the next person
 *   believing the fact was checked.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DOCKER_BIN, dockerArgv } from "./docker.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PINS = join(ROOT, "tests", "fixtures", "upstream-pins.json");

const SITE = process.env.BND_SITE || "demo.bunood.test";
const BACKEND = process.env.BND_BACKEND || "bunood-backend-1";

const repin = process.argv.includes("--repin");

/** Read the live fingerprint off the bench. */
function live() {
	const code = [
		"import frappe, json",
		`frappe.init(site=${JSON.stringify(SITE)}, sites_path=".")`,
		"frappe.connect()",
		"from bunood_theme.upstream import fingerprint",
		"print(json.dumps(fingerprint()))",
	].join("\n");

	const out = execFileSync(
		DOCKER_BIN,
		dockerArgv("exec", "-i", BACKEND, "bash", "-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python"),
		{ input: code, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
	);
	// bench prints app-load noise before the payload; the last line is ours.
	return JSON.parse(out.trim().split(/\r?\n/).pop());
}

const current = live();

if (repin) {
	writeFileSync(PINS, JSON.stringify(current, null, "\t") + "\n", "utf8");
	console.log(`re-pinned ${PINS}`);
	console.log("Say in the commit message WHAT MOVED and what you ported. A pin");
	console.log("bumped without reading turns a loud signal into a silent one.");
	process.exit(0);
}

let pinned;
try {
	pinned = JSON.parse(readFileSync(PINS, "utf8"));
} catch {
	console.error(`No pin file at ${PINS}. Create it with:  npm run upstream -- --repin`);
	process.exit(1);
}

const drift = [];
for (const section of new Set([...Object.keys(current), ...Object.keys(pinned)])) {
	const now = current[section] || {};
	const was = pinned[section] || {};
	for (const key of new Set([...Object.keys(now), ...Object.keys(was)])) {
		if (now[key] !== was[key]) drift.push({ at: `${section}.${key}`, was: was[key], now: now[key] });
	}
}

if (!drift.length) {
	const counts = Object.entries(current)
		.map(([k, v]) => `${k} ${Object.keys(v).length}`)
		.join(" · ");
	console.log(`upstream: in step with the pins (${counts})`);
	process.exit(0);
}

console.error("UPSTREAM DRIFT — something this app is built on has changed.\n");
for (const d of drift) {
	console.error(`  ${d.at}`);
	console.error(`      pinned ${d.was ?? "(absent)"}`);
	console.error(`      live   ${d.now ?? "(absent)"}`);
}
console.error(`
This is not a bug to silence. Read what moved and decide what it means for the
rules built on it — a renamed DOM node, a reordered workspace, an inserted field.
Port what matters, then re-pin IN THE SAME COMMIT:

    npm run upstream -- --repin

and say in that commit's message what you ported.`);
process.exit(1);
