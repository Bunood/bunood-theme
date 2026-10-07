#!/usr/bin/env node
/**
 * Launcher for the contrast gate, which is Python.
 *
 * WHY A LAUNCHER AND NOT JUST `python3 tools/contrast_gate.py`
 *   The gate has to be Python because it imports `bunood_theme.palette` — the
 *   same module `brand.py` calls at runtime. Measuring a JavaScript reimplementation
 *   would be checking a copy of the design rather than the design, which is the
 *   defect class this repo keeps paying for.
 *
 *   But `python3` does not exist on this project's Windows host: `python` is a
 *   pip-less venv and `py` is the launcher. CI has `python3` and no `py`. Hardcoding
 *   either means the gate silently does not run somewhere, and a gate that does not
 *   run is worse than no gate because it reads as coverage.
 *
 * WHY IT IS NOT PART OF `npm run build`
 *   The build must stay dependency-free — it is what CI runs first and what a
 *   contributor runs to get unstuck. Contrast is a separate gate with its own
 *   interpreter requirement, run by CI and by `npm run verify`.
 *
 * USAGE
 *   npm run contrast
 *   npm run contrast -- --table
 *   npm run contrast -- --seed=#F5C542
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "tools", "contrast_gate.py");
const args = process.argv.slice(2);

// Ordered by how likely each is to be the RIGHT interpreter, not merely present.
const CANDIDATES = [
	["python3", []],
	["py", ["-3"]],
	["python", []],
];

for (const [exe, prefix] of CANDIDATES) {
	// `--version` first: on Windows, `python3` resolves to a Microsoft Store stub
	// that exists, prints an install advert and exits non-zero. Probing separates
	// "absent" from "present but not a Python", and both from a real gate failure —
	// which must be reported as a failure and never skipped past.
	const probe = spawnSync(exe, [...prefix, "--version"], { stdio: "ignore" });
	if (probe.error || probe.status !== 0) continue;

	const run = spawnSync(exe, [...prefix, SCRIPT, ...args], {
		stdio: "inherit",
		cwd: ROOT,
	});
	process.exit(run.status === null ? 1 : run.status);
}

console.error(
	"contrast gate: no working Python found (tried python3, py -3, python).\n" +
		"The gate imports bunood_theme.palette, so it needs the same interpreter the app runs on."
);
process.exit(1);
