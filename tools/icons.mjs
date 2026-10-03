#!/usr/bin/env node
/**
 * Launcher for the icon-inference guard, which is Python.
 *
 * WHY A LAUNCHER (see tools/contrast.mjs for the full version of this reasoning)
 *   The guard imports `bunood_theme.icons` — the same module `extend_bootinfo`
 *   runs at boot — so it must be Python, not a JS reimplementation. And
 *   `python3` on this Windows host is a Store stub while CI has no `py`, so the
 *   right interpreter has to be discovered, not hardcoded, or the gate silently
 *   does not run somewhere.
 *
 * WHY NOT PART OF `npm run build`
 *   The build stays Node-only and dependency-free. This is a separate gate with
 *   its own interpreter requirement, run from `tests/smoke.mjs`'s "icon engine:
 *   every id the module can emit exists in the sprite" test — the same
 *   spawn-and-check-exit-0 shape as `tools/payload.mjs`'s wiring in the same
 *   file — so `npm run verify` / `npm test` reaches it. Release review (2026-08-14)
 *   caught this docstring claiming that wiring before it existed; fixed by adding
 *   the wiring, not the claim.
 *
 * USAGE
 *   npm run icons:check
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "tools", "check_icons.py");
const args = process.argv.slice(2);

const CANDIDATES = [
	["python3", []],
	["py", ["-3"]],
	["python", []],
];

for (const [exe, prefix] of CANDIDATES) {
	const probe = spawnSync(exe, [...prefix, "--version"], { stdio: "ignore" });
	if (probe.error || probe.status !== 0) continue;
	const run = spawnSync(exe, [...prefix, SCRIPT, ...args], { stdio: "inherit", cwd: ROOT });
	process.exit(run.status === null ? 1 : run.status);
}

console.error(
	"icon guard: no working Python found (tried python3, py -3, python).\n" +
		"The guard imports bunood_theme.icons, so it needs the same interpreter the app runs on."
);
process.exit(1);
