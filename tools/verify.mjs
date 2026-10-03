#!/usr/bin/env node
/**
 * Run the smoke suite and report it honestly.
 *
 * WHY THIS EXISTS
 *   The suite already exits 0 green / non-zero red. Every time that signal was
 *   corrupted during development it was by the diagnostics bolted on AFTER it
 *   in an ad-hoc shell chain:
 *
 *     npm test > log 2>&1; tail -2 log; grep -c FAIL log
 *
 *   `grep -c` prints 0 and EXITS 1 when it finds nothing — which is the good
 *   outcome here — so a fully green run was reported as a failure (measured
 *   2026-08-02, run 48: `exit: 0`, `92/92 passed`, task marked failed). The
 *   same shape truncated an earlier run: piping through `head` closed the pipe
 *   and killed the suite mid-flight, and the missing lines read as a hang.
 *
 *   So: one command, the suite's own exit code, and the summary printed from
 *   the log rather than by a pipeline that can change the verdict.
 *
 * USAGE
 *   npm run verify                      # log to a temp file, print its path
 *   npm run verify -- --log x           # choose the log path
 *   npm run verify -- --quiet           # summary only, no pass-by-pass output
 *   npm run verify -- --only container: # INNER LOOP: run matching checks only
 *   npm run verify -- --only "a|b"      # several substrings
 *   npm run verify -- --only re:^dock   # a raw regular expression
 *
 * Do NOT use a `/pattern/` form: Git Bash rewrites a leading `/` into a
 * Windows path, so the filter silently matches nothing and the run reports
 * 0 of 0. `|` and `re:` survive every shell used here.
 *
 * WHY `--only` IS REPORTED DIFFERENTLY
 *   A filtered run is for the seconds after writing a line, not for deciding
 *   whether something is done. So it never prints the "N/N passed" verdict
 *   line: that phrase is what a reader — and the release checklist — takes as
 *   green, and it must only ever come out of a run that skipped nothing. The
 *   filtered summary says FILTERED and says what it skipped.
 */

import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const quiet = args.includes("--quiet");
const only = flag("only", null);
const logPath = flag("log", join(tmpdir(), `bnd-smoke-${Date.now()}.log`));

const out = createWriteStream(logPath);
const child = spawn("node", ["tests/smoke.mjs", ...(only ? ["--only", only] : [])], {
	stdio: ["ignore", "pipe", "pipe"],
	shell: false,
});

for (const stream of [child.stdout, child.stderr]) {
	stream.on("data", (chunk) => {
		out.write(chunk);
		if (!quiet) process.stdout.write(chunk);
	});
}

child.on("close", (code) => {
	out.end();
	out.on("finish", () => {
		const log = readFileSync(logPath, "utf8");
		// The FAIL MARKER at the head of a line, not the substring. A message
		// containing "FAILURE" is a detail line, not a second failure —
		// counting it reported one broken test as two, which is the same
		// species of wrong-by-a-little that this whole wrapper exists to stop.
		const fails = log.split("\n").filter((l) => /^\s*FAIL\s/.test(l));
		// Read the suite's own summary line, whichever it printed. The filtered
		// one deliberately does not contain "passed", so a partial run cannot
		// be mistaken for a verdict here or by anyone reading the log.
		const tally =
			(log.match(/FILTERED RUN — .*/g) || []).pop() ||
			(log.match(/\d+\/\d+ passed/g) || []).pop() ||
			"no tally line";

		console.log("\n" + "─".repeat(60));
		console.log(`  ${tally}`);
		if (fails.length) {
			console.log(`  ${fails.length} failing:`);
			for (const f of fails.slice(0, 10)) console.log(`    ${f.trim()}`);
			if (fails.length > 10) console.log(`    …and ${fails.length - 10} more`);
		}
		console.log(`  log: ${logPath}`);
		console.log("─".repeat(60));

		// The SUITE's verdict, never a grep's. This is the whole point.
		process.exit(code === null ? 1 : code);
	});
});
