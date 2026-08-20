/**
 * Bunood Theme — end-to-end smoke suite.
 *
 * WHAT
 *   Every behaviour this project has ever verified by hand, encoded so it
 *   re-runs on demand: boot & assets, all five desk layouts, the Desktop-page
 *   chrome guard, all eight sidebar presets (attribute matrix + mounts), the
 *   rail's triggers and expand button, the icon engine, badges, live preview,
 *   and the save round-trip (the TimestampMismatch regression). A release tag
 *   REQUIRES this suite green — see README "Versioning and releases".
 *
 * WHY A SINGLE SEQUENTIAL FILE, NOT A TEST FRAMEWORK
 *   The suite mutates ONE shared dev site (Theme Settings is a Single), so
 *   tests are inherently ordered and cannot parallelise. A framework would
 *   add config surface for no isolation gain. Initial settings are
 *   snapshotted and restored even on failure.
 *
 * REQUIREMENTS
 *   - The local dev stack running (docker: bunood-backend-1 … bunood-frontend-1)
 *     with the site served at BND_URL. The suite talks to the site over HTTP
 *     and flips settings server-side via `docker exec` (boot is cached, so
 *     settings changes need a cache clear — only bench can do that).
 *   - npm i -D playwright  &&  npx playwright install chromium   (one-time)
 *
 * USAGE
 *   npm test                     # BND_URL defaults to http://localhost:8080
 *   BND_URL=... BND_SITE=... BND_BACKEND=... node tests/smoke.mjs
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
// The i18n gates DERIVE their expectation sets from the same tooling the
// build's coverage gate uses — restating "which strings are ours" here would
// be the second copy of the catalogue, and it is the catalogue that moves.
import { extractCatalogue, readExempt, readInherited, readTranslations } from "../tools/i18n.mjs";

const URL_BASE = process.env.BND_URL || "http://localhost:8080";
const SITE = process.env.BND_SITE || "demo.bunood.test";
const BACKEND = process.env.BND_BACKEND || "bunood-backend-1";

// Console errors that are environmental, not theme defects. Anything NOT
// matching one of these fails the error-budget test.
const CONSOLE_ALLOWLIST = [
	/socket\.io/i,
	/Invalid origin/i,
	/\/undefined/,           // Frappe's own stray request, present on stock desks
	/Failed to load resource.*40[34]/, // avatar images etc. on empty dev data
	/impersonate you/i,      // Chrome's own console warning banner
	// A recovered Single-write conflict.
	//
	// Saving Theme Settings writes the WHOLE document (`update_single` deletes
	// every tabSingles row and re-inserts), so a save racing another writer
	// raises MySQL 1020 and Frappe returns 417. This suite provokes that
	// structurally, not in one place: many tests write settings SERVER-side
	// while a browser holds the form open, which no real user does. Autosave
	// then merges and retries, and the click lands.
	//
	// Allowed because the RECOVERY is asserted, repeatedly and by name —
	// "a concurrent write is merged, not clobbered", "a click applies, with no
	// Save", "rapid clicks all land, and none is lost" all fail if a conflict
	// is not recovered. Scoped to the deadlock itself, so an ordinary failed
	// save is still an unexplained error.
	//
	// Tried first as a splice inside the one test that provokes it deliberately;
	// that was wrong, because it is not one test.
	/QueryDeadlockError/,
	/Record has changed since last read in table/,
	/417 \(EXPECTATION FAILED\)[\s\S]*savedocs/,
	// Frappe logs the server traceback to the console as FRAMES ONLY — the
	// exception line the two patterns above look for is not always in the text.
	// `savedocs` is in the frames, and a traceback from the save endpoint is
	// the same recovered conflict by another name.
	/Traceback[\s\S]*savedocs/,
	// A stale BRAND stylesheet link.
	//
	// brand.write_brand_css names the file by a digest of its contents and
	// `_reap_old` deletes the previous one immediately, so any page loaded
	// BEFORE a brand change still points at a filename that no longer exists
	// and gets Frappe's HTML 404 body with the wrong MIME type. Pre-existing —
	// hashed assets plus immediate reaping always had this window — but this
	// suite changes settings constantly with pages open, so it hits it often.
	// The consequence for a real desk is recorded in HANDOVER: an already-open
	// tab loses its brand colours after somebody changes them, until reloaded.
	/Refused to apply style from[\s\S]*brand_[0-9a-f]+\.css/,
];

// ── Tiny sequential test runner ─────────────────────────────────────────────

const results = [];
let page; // assigned in main()

/**
 * Run one named check, unless a filter excludes it.
 *
 * WHY A FILTER EXISTS, AND WHY IT CAN NEVER GATE A COMMIT
 *   The full suite is ~15 minutes of real page loads. That is the right price
 *   for a release gate and the wrong price for "does the line I just wrote
 *   work" — and paying it either way is what pushes a change into batches. You
 *   stop checking after each step because checking costs a quarter of an hour,
 *   so mistakes are found late, together, and then have to be untangled from
 *   each other. `--only` is for the inner loop.
 *
 *   It is deliberately loud about being partial. A filtered run says FILTERED
 *   at the top and in the tally, and never prints the "N/N passed" phrase —
 *   the words that mean green must not be producible by a run that skipped
 *   things. The three release gates (CI, smoke, adversarial review) all mean
 *   the WHOLE suite.
 *
 * The filter is a substring over the test name, or several separated by `|`.
 * `re:<pattern>` takes a raw regular expression.
 *
 * NOT `/pattern/`, and that is not a style choice: Git Bash rewrites any
 * argument beginning with `/` into a Windows path, so `--only "/a|b/"` arrives
 * as `C:/Program Files/Git/a|b/` and silently matches nothing. The run then
 * reports 0 of 0 — honest, but ten minutes of confusion. `|` and `re:` have no
 * leading slash and survive every shell here.
 *
 * Tests are ordered and share one site, so a filtered run is only meaningful
 * for checks that set the state they need. Every `container:` test does; some
 * older ones inherited their page from whichever test ran before them, which
 * is a landmine for whoever inserts the next one — `live preview` is annotated
 * where that bit.
 *
 * Failures are recorded and printed but never abort the suite — every
 * remaining check still runs, and main() derives the exit status from the
 * collected results.
 */
const ONLY = (() => {
	const i = process.argv.indexOf("--only");
	const raw = i !== -1 ? process.argv[i + 1] : process.env.BND_ONLY;
	if (!raw) return null;
	if (raw.startsWith("re:")) return new RegExp(raw.slice(3), "i");
	// Substrings, `|`-separated. Each is escaped, so a name containing regex
	// punctuation ("status: Off never takes away…") matches literally.
	const escaped = raw.split("|").map((s) => s.trim()).filter(Boolean)
		.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	return new RegExp(escaped.join("|"), "i");
})();

/** How many checks the filter skipped, so the tally can say so. */
let skipped = 0;

async function test(name, fn) {
	if (ONLY && !ONLY.test(name)) {
		skipped++;
		return;
	}
	try {
		await fn();
		results.push({ name, ok: true });
		process.stdout.write(`  ok    ${name}\n`);
	} catch (err) {
		results.push({ name, ok: false, err: String(err.message || err) });
		process.stdout.write(`  FAIL  ${name}\n        ${String(err.message || err).slice(0, 300)}\n`);
	}
}

/** Assert a condition; `what` describes what was expected, for the FAIL line. */
function expect(cond, what) {
	if (!cond) throw new Error(`expected: ${what}`);
}

/** Assert strict equality, reporting both values on mismatch. */
function expectEq(actual, wanted, what) {
	if (actual !== wanted) throw new Error(`${what}: wanted ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
}

// ── Server-side helpers (docker exec) ───────────────────────────────────────

/** Run a python snippet inside the backend container against the site. */
function benchPy(code) {
	const wrapped =
		`import frappe, json\n` +
		`frappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\n` +
		`frappe.connect()\n` +
		code;
	// ONE retry, and only for MySQL 1020 on tabSingles. That error is an
	// optimistic-lock conflict whose own text says "try restarting
	// transaction" — Frappe retries it in request handling for the same
	// reason. It became a startup-killer once the apps.json set was installed:
	// seven more apps' scheduler jobs now write their own Singles, and one
	// colliding with the pre-run reset crashed a 25-minute run before the
	// first test (measured 2026-08-10, main() line 730). Retrying ANYTHING
	// else stays wrong: every other failure here is a real defect, and a
	// blanket retry is how one gets papered over.
	for (let attempt = 1; ; attempt++) {
		try {
			return execFileSync(
				"docker",
				["exec", "-i", BACKEND, "bash", "-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python -"],
				{ input: wrapped, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
			);
		} catch (err) {
			// PUT THE TRACEBACK WHERE IT CAN BE READ. `test()` slices a failure
			// message to 300 chars, and execFileSync's default message spends all
			// of them on the docker command line followed by two unavoidable
			// RuntimeWarnings — running `../env/bin/python` from `sites/` makes
			// sys.prefix mismatch, on every single call. The result was a FAIL line
			// that ended mid-warning with the actual Python error never shown, and
			// diagnosing one cost a round-trip.
			const noise = /^<frozen site>:\d+: RuntimeWarning:.*$|^\s*$/;
			const stderr = String(err.stderr || "")
				.split("\n")
				.filter((l) => !noise.test(l))
				.join("\n")
				.trim();
			if (attempt === 1 && /\b1020\b/.test(stderr) && /tabSingles/.test(stderr)) {
				// Synchronous pause — benchPy is sync throughout, and its callers
				// depend on that.
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
				continue;
			}
			throw new Error(`benchPy failed:\n${stderr || String(err.message).slice(0, 200)}`);
		}
	}
}

/** Mint an Administrator sid — same mechanism as ops verification, never
 * `bench browse` (its xdg-open crashes gunicorn; see project memory). */
function mintSid() {
	const out = benchPy(
		`from frappe.auth import CookieManager, LoginManager\n` +
		`frappe.local.cookie_manager = CookieManager()\n` +
		`frappe.local.form_dict = frappe._dict()\n` +
		// Frappe's login path dereferences request.path, .cookies, .headers
		// (and friends) — a bare script has no request, so stub the lot.
		`frappe.local.request = frappe._dict(path="/", method="GET", remote_addr="127.0.0.1", ` +
		`cookies=frappe._dict(), headers=frappe._dict(), environ=frappe._dict())\n` +
		`frappe.local.request_ip = "127.0.0.1"\n` +
		`lm = LoginManager()\n` +
		`lm.login_as("Administrator")\n` +
		`frappe.db.commit()\n` +
		`print("SID=" + frappe.session.sid)\n`
	);
	const m = out.match(/SID=([a-f0-9]+)/);
	if (!m) throw new Error("could not mint sid: " + out.slice(0, 300));
	return m[1];
}

/** Read Theme Settings fields as a dict. */
function getSettings(fields) {
	const out = benchPy(
		`s = frappe.get_single("Theme Settings")\n` +
		`print(json.dumps({f: s.get(f) for f in ${JSON.stringify(fields)}}))\n`
	);
	return JSON.parse(out.trim().split("\n").pop());
}

/**
 * Write Theme Settings fields + clear cache so boot picks them up.
 *
 * REFUSES ANY FIELD THE SUITE DOES NOT RESTORE. `main()` snapshots
 * MUTABLE_FIELDS and writes it back in its `finally`; anything written that is
 * NOT in that list is changed permanently, on whatever site BND_SITE points at.
 *
 * This has now happened twice. The first time it was `tagline`, and the fix was
 * a comment plus an intersection at the one call site that had caused it — which
 * is why the pre-run reset filters and this one did not. The second time it was
 * `company_name`, `brand_color`, `accent_color` and `default_density`, written
 * by `setSettings(fixture.state)` because a fixture's `state` is the whole
 * SHIPPED map and nobody thought of it as a call site at all.
 *
 * So the guard moved from the call sites into here, where it cannot be
 * forgotten: adding a field to a fixture or a new test now fails LOUDLY the
 * first time it runs, instead of quietly destroying somebody's brand colours.
 *
 * The loss was invisible at the moment it happened, which is what made it worth
 * this much prose: `set_single_value` does not fire `on_update`, so
 * `write_brand_css` never ran and the desk kept serving the old stylesheet. The
 * colours only changed at the next migrate, with nothing to connect the two.
 */
function setSettings(values) {
	const unrestorable = Object.keys(values).filter((f) => !MUTABLE_FIELDS.includes(f));
	if (unrestorable.length) {
		throw new Error(
			`setSettings: ${unrestorable.join(", ")} ${unrestorable.length === 1 ? "is" : "are"} ` +
				"not in MUTABLE_FIELDS, so the suite would not restore " +
				(unrestorable.length === 1 ? "it" : "them") +
				". Add to MUTABLE_FIELDS, or do not write " +
				(unrestorable.length === 1 ? "it" : "them") +
				"."
		);
	}
	// WRITING `desk_layout` MEANS "THE ADMIN PICKED THIS LAYOUT", so it applies
	// the layout preset first and the explicit values second.
	//
	// Since slice 2c a layout is a preset that WRITES the container fields
	// (registry.LAYOUT_CHROME); it no longer decides anything at mount time.
	// Setting the Select alone is therefore not a gesture any user can make —
	// the only place it is written is the picker's click handler, which applies
	// the preset in the same breath. A suite that wrote the Select by itself
	// would be testing a state the product cannot reach, and would report the
	// containers as broken every time a test changed layouts.
	//
	// Order is explicit rather than dict order: an explicit value in `values`
	// must always beat the preset, which is what makes a state like
	// {desk_layout: "Top Bar", topbar_enabled: 0} mean what it reads as.
	//
	// The catalogue is read from `registry`, never restated here — the whole
	// point of it being one table.
	//
	// THE PRESET'S OWN WRITES GO THROUGH THE SAME RESTORE GUARD. They are not
	// in `values`, so the check above cannot see them — and each slice of the
	// split adds one more field the preset writes. Left unguarded, the first
	// container whose field nobody remembered to add to MUTABLE_FIELDS would be
	// changed permanently on the operator's site, which is the exact loss this
	// function's guard was moved here to prevent. Python reports what it had to
	// skip; the throw below is loud on purpose.
	const out = benchPy(
		`from bunood_theme.registry import layout_settings\n` +
		`vals = json.loads(${JSON.stringify(JSON.stringify(values))})\n` +
		`restorable = set(json.loads(${JSON.stringify(JSON.stringify(MUTABLE_FIELDS))}))\n` +
		`meta = frappe.get_meta("Theme Settings")\n` +
		`unrestorable = []\n` +
		`if "desk_layout" in vals:\n` +
		`    for f, v in layout_settings(vals["desk_layout"]).items():\n` +
		// Containers whose slice has not landed have no field yet; writing one
		// would leave an orphan tabSingles row that get_single_value refuses to
		// read back. Ask the doctype, so there is no list of landed slices.
		`        if not meta.get_field(f):\n` +
		`            continue\n` +
		`        if f not in restorable:\n` +
		`            unrestorable.append(f)\n` +
		`            continue\n` +
		`        frappe.db.set_single_value("Theme Settings", f, v)\n` +
		`for f, v in vals.items():\n` +
		`    frappe.db.set_single_value("Theme Settings", f, v)\n` +
		`frappe.clear_cache()\n` +
		`frappe.db.commit()\n` +
		`print("BND_UNRESTORABLE=" + json.dumps(unrestorable))\n`
	);
	const skipped = JSON.parse((out.match(/BND_UNRESTORABLE=(\[.*\])/) || [, "[]"])[1]);
	if (skipped.length) {
		throw new Error(
			`setSettings: the layout preset writes ${skipped.join(", ")}, which ` +
				"the suite would not restore. Add to MUTABLE_FIELDS — a container's " +
				"on/off field belongs there the moment its slice lands."
		);
	}
}

// ── Language ────────────────────────────────────────────────────────────────

/**
 * The language the suite's assertions are written against.
 *
 * ~130 checks match rendered English ("Item List" was one until this commit).
 * That is CORRECT for the desk they run on, and making all of them
 * language-independent would be a large refactor to no end: the Arabic checks
 * are a handful of tests that flip the language deliberately, assert, and flip
 * back. This constant is what "flip back" means, and what the pre-run reset
 * forces so an aborted Arabic run cannot poison the next one.
 */
const LANG_DEFAULT = "en";

/**
 * Read the desk language from BOTH places that decide it.
 *
 * `get_user_lang()` reads `User.language` FIRST and only then falls back to the
 * `lang` default that `System Settings` mirrors — so setting one and not the
 * other produces a site that reports Arabic and renders English, or the
 * reverse. Both are snapshotted because both must be put back.
 */
function getLang() {
	const out = benchPy(
		`print(json.dumps({\n` +
		`  "system": frappe.db.get_single_value("System Settings", "language") or "",\n` +
		`  "user": frappe.db.get_value("User", "Administrator", "language") or "",\n` +
		`}))\n`
	);
	return JSON.parse(out.trim().split("\n").pop());
}

/**
 * Set the desk language. Accepts a code, or a snapshot from `getLang()`.
 *
 * WHY THIS IS NOT `setSettings`, AND WHY IT NEEDS ITS OWN GUARD
 *   `setSettings`' restore guard is a membership test against MUTABLE_FIELDS,
 *   which lists THEME SETTINGS fields. Language lives on `System Settings` and
 *   `User` — different doctypes entirely — so that guard is structurally blind
 *   to it and always was. A language flip is therefore the one mutation the
 *   suite could make and not put back, and `HANDOVER.md` already records what
 *   that costs: an aborted run leaves the bench mid-test, and the next run
 *   faithfully restores THAT. Two runs were voided that way on 2026-08-01 and
 *   it happened again on 2026-08-07.
 *
 *   `withLang()` below is the only intended caller, and it restores in a
 *   `finally` so a throwing test cannot leave the desk Arabic.
 */
function setLang(lang) {
	const system = typeof lang === "string" ? lang : lang.system;
	const user = typeof lang === "string" ? lang : lang.user;
	benchPy(
		`frappe.db.set_single_value("System Settings", "language", ${JSON.stringify(system)})\n` +
		// System Settings.on_update mirrors this, but the suite writes the field
		// directly (no doc save, so no hook) — so the default is set explicitly.
		// `get_language()` reads it for logged-out requests and as the last
		// fallback for logged-in ones.
		`frappe.db.set_default("lang", ${JSON.stringify(system)})\n` +
		`frappe.db.set_value("User", "Administrator", "language", ${JSON.stringify(user)})\n` +
		`frappe.db.commit()\n` +
		// Translations are cached under `merged_translations` per language and
		// the whole dict ships in the per-user `bootinfo`. Without this the desk
		// keeps serving the previous language's payload and the flip looks
		// broken rather than uncached.
		`frappe.clear_cache()\n` +
		`print("ok")\n`
	);
}

/**
 * Run `fn` with the desk in `code`, and put the language back no matter what.
 *
 * The restore is in a `finally` because the failure this exists to prevent is
 * exactly the one where an assertion throws — see `setLang`.
 */
async function withLang(code, fn) {
	const before = getLang();
	try {
		setLang(code);
		return await fn();
	} finally {
		setLang(before);
	}
}

// ── Browser helpers ─────────────────────────────────────────────────────────

const consoleErrors = [];

/** Navigate to a desk route and wait for it to be usable. `waitSel` is the
 * readiness selector (pass null/"" to skip); `settle` is a trailing wait in ms
 * for post-render mounts (bars, rail, icons) that attach after the DOM. */
async function goDesk(route, waitSel = ".body-sidebar-container", settle = 2500) {
	// One retry after a pause: Docker Desktop's host-port proxy occasionally
	// drops mid-run (measured: ERR_EMPTY_RESPONSE cascade with healthy
	// containers). A single environmental blip must not fail the matrix; a
	// persistent outage still fails the test.
	try {
		await page.goto(`${URL_BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
	} catch (first) {
		await page.waitForTimeout(4000);
		await page.goto(`${URL_BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
	}
	if (waitSel) await page.waitForSelector(waitSel, { timeout: 30000 });
	await page.waitForTimeout(settle);
}

/** Every settings shell pane, in the order BND_SHELL_GROUPS declares them. */
const SETTINGS_PANE_KEYS = [
	"overview", "topbar", "pagehead", "sidepane", "dock", "status", "search", "mobile",
	"placement", "inbox", "user", "links", "palette", "crumbs", "list", "form",
	"layout", "branding", "colors", "icons", "density", "translations",
];

/**
 * Click every settings pane and run fn(key) against it once the pane has
 * actually rendered. The shell shows ONE pane at a time and hides the rest
 * ([hidden] on every .bnd-shell-pane but the current one), and axe skips
 * hidden subtrees entirely — so a walk that does not wait for content sees
 * roughly one twentieth of the surface and calls that coverage.
 */
async function walkSettingsPanes(fn) {
	for (const key of SETTINGS_PANE_KEYS) {
		await page.click(`.bnd-shell-item[data-key="${key}"]`);
		await page.waitForFunction(
			(k) => {
				const pane = document.querySelector(`.bnd-shell-pane[data-key="${k}"]`);
				if (!pane || pane.hidden || pane.children.length === 0) return false;
				// The Translations pane fills from an xcall and shows this
				// note first — waiting past it is what makes the pane mean
				// something rather than an empty div axe would call clean.
				return pane.textContent.trim() !== "Loading…";
			},
			key,
			{ timeout: 15000 }
		);
		await fn(key);
	}
}

/** Does the selector match anything on the current page? */
const q = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
/** Read an attribute off <html> (where all data-bnd-* state lives). */
const attr = (name) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
/**
 * The side pane container's computed display.
 *
 * Its own helper because the container split turns "is the side pane there"
 * into a question several tests ask, and `visible()` answers a different one:
 * the sidebar ROW can be display:block inside a container that is display:none,
 * which is exactly the Dock case and exactly how a search box once got
 * "placed" somewhere nobody could see it.
 */
const paneHidden = () =>
	page.evaluate(() => {
		const el = document.querySelector(".body-sidebar-container");
		// The QUESTION is "is it hidden", never "is it display:block". Frappe
		// computes this container to `flex` on some routes and `block` on
		// others, and an assertion that named one of them failed on a desk that
		// was perfectly correct. Only `none` means gone.
		return !el || getComputedStyle(el).display === "none";
	});

/** Computed visibility of the first match: true/false, or null if absent. */
const visible = (sel) =>
	page.evaluate((s) => {
		const el = document.querySelector(s);
		return el ? getComputedStyle(el).display !== "none" : null;
	}, sel);

/**
 * Layout invariants — the things that must hold of ANY region of the desk,
 * whatever it contains.
 *
 * WHY A HELPER AND NOT MORE ASSERTIONS
 *   Hand-written checks cover the states somebody thought of. These cover a
 *   CLASS of defect wherever it appears, and two of this release's real bugs
 *   are in that class: the dock painted over the status bar, and a search
 *   field resolved underneath the dock pill. Both are "two interactive things
 *   occupy the same pixels", which nobody would think to assert per-component
 *   — and which is trivially checkable everywhere at once.
 *
 * Deliberately NOT pixel snapshots: heights encode one machine's font
 * rendering. Every rule here is relational and holds on any machine.
 *
 * @param {string} rootSel  region to inspect
 * @param {{allowOverlap?: string[]}} opts  selectors exempt from the overlap
 *   rule — for genuinely stacked UI (a dropdown over its trigger).
 * @returns {Promise<string[]>} human-readable faults; empty means sane.
 */
async function layoutFaults(rootSel, opts = {}) {
	return page.evaluate(
		({ rootSel, allowOverlap }) => {
			const root = document.querySelector(rootSel);
			if (!root) return [`root ${rootSel} not found`];
			const faults = [];
			const box = (el) => el.getBoundingClientRect();
			const shown = (el) => {
				const cs = getComputedStyle(el);
				if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
				const r = box(el);
				return r.width > 0 && r.height > 0;
			};

			// 1. Ragged rows: siblings sharing a line must match heights.
			for (const row of root.querySelectorAll(".bnd-cbp-row, .bnd-sbp-row-wrap, .bnd-cbp-styles")) {
				const lines = new Map();
				for (const k of [...row.children].filter(shown)) {
					const r = box(k);
					const key = Math.round(r.top);
					if (!lines.has(key)) lines.set(key, []);
					lines.get(key).push(Math.round(r.height));
				}
				for (const [top, hs] of lines) {
					if (Math.max(...hs) - Math.min(...hs) > 1) {
						faults.push(`ragged row at y=${top}: heights ${hs.join(",")}`);
					}
				}
			}

			// 2. Horizontal overflow of the region itself.
			if (root.scrollWidth - root.clientWidth > 1) {
				faults.push(`${rootSel} overflows by ${root.scrollWidth - root.clientWidth}px`);
			}

			// 3. Interactive elements that are present but unusable, and pairs
			//    that sit on top of each other. This is the dock-over-bar class.
			//
			//    SCOPED TO THE DOCUMENT, NOT THE ROOT, and that is the whole
			//    point: our chrome is position:fixed and deliberately escapes
			//    any one subtree — the dock is appended to <body> while the
			//    status bar goes into .main-section. Rooting this at
			//    .main-section meant the two were never compared, and the
			//    first version of this helper sailed past the very collision
			//    it was written for (verified by reintroducing that bug).
			// 3a. The REGIONS themselves must not overlap each other. This is
			//     the check the dock-over-statusbar bug needed, and two
			//     earlier versions of this helper missed it: comparing only
			//     interactive descendants finds nothing, because the dock's
			//     buttons sit centred while the bar's controls sit at its
			//     edges. What collides is the dock's opaque pill covering a
			//     band of the bar — an occluder with no button in the overlap.
			const REGIONS = [".bnd-topbar", ".bnd-statusbar", ".bnd-dock", ".bnd-apps-rail"];
			const present = REGIONS.map((s) => [s, document.querySelector(s)])
				.filter(([, el]) => el && shown(el));
			for (let i = 0; i < present.length; i++) {
				for (let j = i + 1; j < present.length; j++) {
					const [sa, a] = present[i], [sb, b] = present[j];
					if (a.contains(b) || b.contains(a)) continue;
					const ra = box(a), rb = box(b);
					const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
					const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
					if (ox > 2 && oy > 2) {
						faults.push(`chrome regions overlap: ${sa} over ${sb} (${Math.round(ox)}x${Math.round(oy)}px)`);
					}
				}
			}

			const OURS = ".bnd-topbar, .bnd-statusbar, .bnd-dock, .bnd-cluster, .bnd-apps-rail";
			const interactive = [...document.querySelectorAll(OURS)]
				.flatMap((region) => [
					...region.querySelectorAll("button, a[href], input, select, [role='button']"),
				])
				.filter((el) => !allowOverlap.some((s) => el.closest(s)));
			const visibleOnes = interactive.filter(shown);
			for (const el of interactive) {
				if (el.disabled || el.hasAttribute("hidden")) continue;
				const r = box(el);
				if (shown(el) && (r.width < 4 || r.height < 4)) {
					faults.push(`interactive element too small to hit: ${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
				}
			}
			for (let i = 0; i < visibleOnes.length; i++) {
				for (let j = i + 1; j < visibleOnes.length; j++) {
					const a = visibleOnes[i], b = visibleOnes[j];
					if (a.contains(b) || b.contains(a)) continue;
					const ra = box(a), rb = box(b);
					const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
					const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
					// A couple of pixels of adjacency is not an overlap.
					if (ox > 2 && oy > 2) {
						faults.push(
							`interactive overlap: ${a.className || a.tagName} over ${b.className || b.tagName} (${Math.round(ox)}x${Math.round(oy)}px)`
						);
					}
				}
			}
			return faults;
		},
		{ rootSel, allowOverlap: opts.allowOverlap || [] }
	);
}

// ── Expected attribute matrix per preset (mirrors bunood.js SB_SLUGS) ───────

const SLUG = {
	sidebar_placement: { Attached: "attached", Floating: "floating" },
	sidebar_material: { Solid: "solid", Glass: "glass" },
	sidebar_color: { "Match Theme": "theme", Minimal: "minimal", "Dark Contrast": "dark", Brand: "brand" },
	icon_style: { "Colored Chips": "chips", "Colored Dots": "dots", "Filled Color": "filled", Duotone: "duotone", "Brand Lines": "brandlines", Monochrome: "mono" },
	sidebar_active_style: { "Solid Pill": "pill", "Soft Pill": "softpill", "Accent Rail": "rail", "Glow Ring": "glow", Outline: "outline", "Dot Marker": "dot", "Folder Tab": "foldertab" },
	sidebar_section_layout: { Plain: "plain", Divided: "divided", "Mini-Cards": "cards", "Accordion Cards": "accordion" },
	sidebar_hue_wash: { Off: "off", Subtle: "subtle", Rich: "rich" },
	sidebar_menu_rail: { "Always Expanded": "expanded", "Manual Collapse": "manual", Rail: "rail" },
};

const ATTR_OF = {
	sidebar_placement: "data-bnd-sb-placement",
	sidebar_material: "data-bnd-sb-material",
	sidebar_color: "data-bnd-sb-color",
	icon_style: "data-bnd-sb-icons",
	sidebar_active_style: "data-bnd-sb-active",
	sidebar_section_layout: "data-bnd-sb-sections",
	sidebar_hue_wash: "data-bnd-sb-wash",
	sidebar_menu_rail: "data-bnd-sb-menurail",
};

// All Theme Settings fields the suite may mutate — snapshotted for restore.
const MUTABLE_FIELDS = [
	"desk_layout", "desk_order", "list_style", "list_hover", "list_selection", "list_checkbox_reveal",
	// Form view kit (item 18).
	"form_style", "form_tabs", "form_sidebar", "form_grid_checkbox_reveal",
	// Workspace tile + chart surfaces (item 25).
	"workspace_style", "workspace_metric", "workspace_rows", "workspace_menu_reveal",
	"chart_grid",
	// Report / datatable surface (item 26).
	"report_style", "report_grain", "report_rows", "report_checkbox_reveal",
	// Alternate views surface (item 27).
	"views_style", "views_band", "views_mark", "views_media", "views_reveal",
	// Overlays surface (item 28). No Check: this kit's repairs are contracts,
	// not options, so there is nothing to toggle.
	"overlay_style", "overlay_scrim", "overlay_menu",
	"sidebar_preset", "sidebar_placement", "sidebar_material",
	"sidebar_glass_opacity", "sidebar_blur", "sidebar_color",
	"sidebar_active_style", "sidebar_section_layout", "sidebar_hue_wash",
	"sidebar_surface_intensity", "sidebar_menu_rail", "sidebar_rail_trigger",
	"sidebar_rail_button", "sidebar_rail_button_shape",
	"sidebar_pane_width",
	"sidebar_apps_rail", "sidebar_badges", "sidebar_remember_sections",
	"sidebar_scroll_fades",
	// Icon system kit (item 23), relocated from the sidebar and breadcrumb kits.
	"icon_style", "icon_weight", "icon_source", "icon_rail_button", "icon_crumbs",
	// The save round-trip test writes tagline; release review v0.6.2..HEAD
	// caught that leaving it out made every run permanently clobber the field.
	"tagline",
	// Breadcrumb kit (item 11).
	"crumb_style", "crumb_separator", "crumb_hover",
	"crumb_copy_link", "crumb_status_pill", "crumb_narrow_collapse",
	// Command palette kit (item 12).
	"palette_style", "palette_frecency", "palette_footer", "palette_newtab",
	"palette_fallbacks", "palette_suggest", "palette_sigils",
	"enable_command_palette",
	// Notification centre kit (item 13).
	"inbox_style", "inbox_badge", "inbox_group", "inbox_chips",
	"inbox_row_actions", "inbox_arrival", "inbox_keyboard",
	// Search placement + status bar (item 14).
	// Component rework, slice 1: the bell and the user menu place themselves.
	// Slice 2: so do Home and All Apps, which used to share one field.
	"inbox_placement", "user_placement", "home_placement", "apps_placement",
	"search_placement", "status_style", "status_segments_jobs", "status_segments_errors",
	"status_segments_scheduler", "status_segments_connection", "status_segments_density",
	"status_clock", "status_interval", "status_freshness", "status_escalate",
	// Slice 2c, the container split: each container gets its own on/off, so
	// `desk_layout` can become a preset that writes them and then stops
	// deciding. One field per container, added as its slice lands.
	"topbar_enabled", "pagehead_enabled", "dock_enabled", "sidebar_enabled",
	"bottombar_enabled",
	// Mobile bar contents (item 24 C2): which tenants join search on a phone.
	"mobile_inbox", "mobile_user", "mobile_apps",
];

/**
 * The container on/off fields, with what a fresh install writes.
 *
 * WHY IT EXISTS AT ALL
 *   Every invariant state must pin EVERY container, not just the one it is
 *   about. A state that leaves a container at whatever the previous state set
 *   is not a state at all — that is how a bench left on Dock voided two runs
 *   (see the reset comment in main()). Spreading this map under each state's
 *   overrides makes "unspecified" mean "shipped", always.
 *
 * WHY IT IS A LITERAL AND HOW THAT IS KEPT HONEST
 *   It is needed at module scope, before `main()` has fetched anything from
 *   the server — so it cannot BE `setup.SHIPPED`. A second statement of a
 *   shipped default is this repo's most expensive habit, so it is not left to
 *   agree by good intentions: the container test below asserts these values
 *   against SHIPPED and fails the moment they diverge.
 */
const CHROME_DEFAULTS = {
	topbar_enabled: 1,
	pagehead_enabled: 0,
	dock_enabled: 0,
	sidebar_enabled: 1,
	bottombar_enabled: 1,
};

// ── The suite ───────────────────────────────────────────────────────────────

/** The suite: snapshot settings, run every check sequentially against one
 * authenticated page, then restore settings in `finally` — even on failure. */
async function main() {
	console.log(`Bunood Theme smoke suite — ${URL_BASE} (${SITE})`);
	if (ONLY) {
		console.log(`FILTERED to ${ONLY} — inner loop only, never a release gate.`);
	}

	// REAP STALE SESSIONS BEFORE MINTING ANOTHER.
	//
	// Every run mints a sid and never cleans up, and so does every ad-hoc probe.
	// They accumulate in `tabSessions` for the life of the dev site, and a
	// bloated session table slows desk boot until timing-sensitive assertions
	// start failing — with ROTATING identity, because it is load rather than
	// logic. That is why two runs of the same tree failed 23 checks each with
	// only 8 in common, and it is the likeliest reason this suite was recorded
	// green on 2026-08-07 and failed 23 the next day with no commit between.
	//
	// Measured 2026-08-08, same tree, deploy and restart before each run:
	//   382 session rows -> 114/137        0 session rows -> 125/137
	// Eleven tests, none of which had anything to do with the code under test.
	//
	// Older than an hour, not "all": someone may be working in the desk right
	// now and their session is minutes old. The debris this reaps is the
	// suite's own.
	benchPy(
		`frappe.db.sql("delete from tabSessions where lastupdate < %s", ` +
		`(frappe.utils.add_to_date(None, hours=-1),))\n` +
		`frappe.db.commit()\n` +
		`print("sessions remaining: %d" % frappe.db.count("Sessions"))\n`
	);

	const sid = process.env.BND_SID || mintSid();
	const snapshot = getSettings(MUTABLE_FIELDS);
	// Language is snapshotted like the settings are, and for the same reason —
	// but it is FORCED to LANG_DEFAULT before the run rather than merely
	// restored after. Restoring protects the operator; forcing protects the run.
	// Most assertions here match rendered English, so a bench left in Arabic by
	// an aborted `withLang` would fail dozens of unrelated checks and read as a
	// broken feature. Cheap insurance: two reads and a cache clear.
	const langSnapshot = getLang();
	setLang(LANG_DEFAULT);

	// RESET BEFORE RUNNING, not just restore after. Restoring protects the
	// operator's settings; resetting protects the RUN. A suite that inherits
	// whatever the bench happens to hold is not reproducible — two runs were
	// voided on 2026-08-01 by a bench left on Dock/Sidebar Top by an aborted
	// run, and the cost was not the wasted minutes, it was mistaking correct
	// behaviour for failure and vice versa.
	//
	// Read from setup.py rather than restating them here, so "shipped default"
	// cannot drift between the installer and the suite. Intersected with
	// MUTABLE_FIELDS deliberately: resetting a field we do not also RESTORE
	// would clobber it permanently — the tagline bug, in a new costume.
	const shipped = JSON.parse(
		benchPy(
			`from bunood_theme.setup import SHIPPED\n` +
			`print(json.dumps(SHIPPED))\n`
		).trim().split("\n").pop()
	);
	setSettings(Object.fromEntries(
		Object.entries(shipped).filter(([field]) => MUTABLE_FIELDS.includes(field))
	));
	const presets = JSON.parse(
		benchPy(`from bunood_theme.presets import SIDEBAR_PRESETS\nprint(json.dumps(SIDEBAR_PRESETS))\n`).trim().split("\n").pop()
	);

	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const host = new URL(URL_BASE).hostname;
	await ctx.addCookies([{ name: "sid", value: sid, domain: host, path: "/" }]);
	page = await ctx.newPage();
	page.on("console", (msg) => {
		// Record the source URL too — "Failed to load resource" without a URL
		// is undiagnosable (learned on this suite's first green-ish run).
		if (msg.type() === "error") {
			const loc = msg.location();
			consoleErrors.push(`${msg.text()} [${loc && loc.url ? loc.url : "?"}]`);
		}
	});
	page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

	// ── Warm the stack before anything is measured ─────────────────────────
	//
	// The FIRST request after a restart or a long idle is slow enough to fail
	// on its own: `bunood_theme.api.get_status_signals` takes ~4,400ms cold
	// against ~10ms warm (measured three times on 2026-08-08), and the desk's
	// own boot is cold too — the first navigation has returned both a 30s
	// selector timeout and a 500. That lands on "desk boots authenticated with
	// theme assets", which is the first test and therefore the one that pays,
	// and its 500 then also breaks the console-error budget at the very end.
	//
	// HANDOVER §8 has carried this as "environmental, recurring, not yet
	// mechanised away". This is the mechanising: one throwaway navigation whose
	// failure is ignored, so the first MEASURED request is a warm one. It
	// asserts nothing and cannot hide a defect — every real check still runs
	// after it, unchanged.
	try {
		await page.goto(`${URL_BASE}/desk/item`, { waitUntil: "domcontentloaded", timeout: 60000 });
		await page.waitForTimeout(6000);
		consoleErrors.length = 0;
	} catch (e) {
		console.log("  (warm-up navigation failed; continuing)");
	}

	try {
		// ── Boot & assets ──────────────────────────────────────────────────
		const assetsPy = readFileSync(new URL("../bunood_theme/assets.py", import.meta.url), "utf8");
		const cssPath = assetsPy.match(/THEME_CSS = "([^"]+)"/)[1];
		const jsPath = assetsPy.match(/THEME_JS = "([^"]+)"/)[1];

		await test("desk boots authenticated with theme assets", async () => {
			await goDesk("/desk/sales-invoice", ".page-head");
			expect(await page.evaluate(() => typeof window.bunood_theme === "object"), "bunood_theme global");
			for (const p of [cssPath, jsPath]) {
				const status = await page.evaluate(async (u) => (await fetch(u)).status, p);
				expectEq(status, 200, `asset ${p}`);
			}
			const brand = await page.evaluate(async () => {
				const link = [...document.querySelectorAll("link")].find((l) => l.href.includes("/files/bunood/brand_"));
				return link ? (await fetch(link.href)).status : "missing";
			});
			expectEq(brand, 200, "brand stylesheet");
		});

		// ── Desk layouts ───────────────────────────────────────────────────
		const LAYOUT_CHECKS = {
			"Top Bar": async () => {
				expect(await q(".main-section > header .bnd-topbar"), "topbar mounted");
				expect(await q(".bnd-statusbar"), "a bottom bar");
				expectEq(await visible(".body-sidebar .navbar-search-bar"), false, "sidebar search hidden");
			},
			"Compact": async () => {
				expect(!(await q(".bnd-topbar")), "no topbar");
				expect(await q(".page-head .bnd-cluster"), "cluster in page head");
				// Compact has no top bar, so the default placement falls back —
				// and its fallback order puts the sidebar first, because growing
				// the slim strip to hold search is the one thing this layout
				// exists to avoid.
				expectEq(await visible(".body-sidebar .navbar-search-bar"), true, "sidebar search kept");
				expectEq(await attr("data-bnd-search"), "sbtop", "fell back to the sidebar, not the strip");
				expectEq(await page.evaluate(() => document.querySelectorAll(".bnd-search-field").length), 0, "no injected field");
			},
			"Classic": async () => {
				// Classic mounts no bars OF ITS OWN — no top bar, no dock. It does
				// now show the status bar, because that stopped being a property of
				// the layout when `status_in_classic` was deleted: it is a
				// component, so `status_style` decides everywhere. The old
				// assertion ("no bnd chrome") encoded the layout-owns-it contract
				// and is deliberately replaced, not relaxed — the Off case below
				// asserts the other direction, which the old one could not.
				expect(!(await q(".bnd-topbar")) && !(await q(".bnd-dock")), "no topbar or dock");
				expect(await q(".bnd-statusbar"), "status bar follows status_style, not the layout");
				expectEq(await visible(".body-sidebar .sidebar-notification"), true, "sidebar bell kept");
			},
			"Bottom Bar": async () => {
				expect(await q(".bnd-statusbar .bnd-cluster"), "cluster in the bottom bar");
				// Search is its own setting since item 14, and the DEFAULT asks
				// for a top bar this layout never mounts. So this asserts the
				// fallback, not a layout feature: it must land in the bottom
				// bar promptly rather than vanish or arrive seconds late.
				await page.waitForSelector(".bnd-statusbar .bnd-search-field", { timeout: 2500 });
			},
			"Dock": async () => {
				expect(await q(".bnd-dock .bnd-dock-brand"), "dock with brand chip");
				expectEq(
					await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).display),
					"none", "sidebar hidden"
				);
			},
		};
		// WHAT "layout: X" MEANS SINCE THE SPLIT: a fresh pick of the layout in
		// the form. Picking one writes `registry.layout_settings(layout)` — the
		// container toggles AND the tenant placements — and then stops deciding.
		// These tests used to set only `desk_layout` and inherit the toggles,
		// which was the layout-decides-mounts contract surviving in the suite
		// after the split deleted it from the code: "Bottom Bar" ran with
		// whatever top bar the previous state left switched on, search resolved
		// into it, and the fallback assertion timed out (2026-08-08, the run
		// after the fingerprint tool re-seeded shipped defaults).
		const layoutSettings = (layout) =>
			JSON.parse(
				benchPy(
					"from bunood_theme.registry import layout_settings\n" +
					`print(json.dumps(layout_settings(${JSON.stringify(layout)})))\n`
				).trim().split("\n").pop()
			);
		for (const [layout, checks] of Object.entries(LAYOUT_CHECKS)) {
			await test(`layout: ${layout}`, async () => {
				// Search placement is a SEPARATE setting since item 14, and these
				// checks assert where search ends up — so it is stated LAST,
				// overriding the preset's own choice: several checks assert the
				// FALLBACK from a top bar the layout does not mount, which the
				// preset's honest placement would never exercise.
				setSettings({
					...layoutSettings(layout),
					desk_layout: layout,
					search_placement: "Top Bar Center",
				});
				await goDesk("/desk/sales-invoice", ".page-head");
				await checks();
			});
		}
		setSettings({ ...layoutSettings("Top Bar"), desk_layout: "Top Bar", search_placement: "Top Bar Center" });

		await test("Desktop page: all theme chrome stands down and returns", async () => {
			await goDesk("/desk", "#page-desktop", 2000);
			expect(await page.evaluate(() => document.documentElement.hasAttribute("data-bnd-desktop")), "desktop attr");
			for (const sel of [".bnd-topbar", ".bnd-statusbar", ".bnd-apps-rail"]) {
				const vis = await visible(sel);
				expect(vis === null || vis === false, `${sel} hidden on Desktop`);
			}
			await page.evaluate(() => window.frappe.set_route("invoicing"));
			await page.waitForTimeout(2500);
			expect(!(await page.evaluate(() => document.documentElement.hasAttribute("data-bnd-desktop"))), "attr cleared on workspace");
			expectEq(await visible(".bnd-topbar"), true, "topbar returns");
		});

		// ── Breadcrumb kit (item 11): styles, Original, icon scope, preview ─
		// The deepest stock trail (form page: home / workspace / doctype /
		// doc) exercises every option. Pages are cached, so assertions always
		// target the VISIBLE trail, never the first match.
		const CRUMB_STYLE_SLUG = {
			"Quiet Trail": "quiet", "Title Fusion": "fusion",
			"Eyebrow Title": "eyebrow", "Crumb Pills": "pills",
		};
		const visibleTrail = (sel) =>
			page.evaluate((s) => {
				const trail = [...document.querySelectorAll(".page-head .navbar-breadcrumbs")].find((u) => u.offsetParent);
				return !!(trail && trail.querySelector(s));
			}, sel);

		for (const [style, slugValue] of Object.entries(CRUMB_STYLE_SLUG)) {
			await test(`crumbs: ${style}`, async () => {
				setSettings({
					crumb_style: style, crumb_separator: "Chevron", icon_crumbs: "First Crumb",
					crumb_hover: "Soft Pill", crumb_copy_link: 1, crumb_status_pill: 0, crumb_narrow_collapse: 1,
				});
				await goDesk("/desk/item/BND-TEST-001", ".page-head", 3000);
				expectEq(await attr("data-bnd-crumbs"), slugValue, "style attr");
				expectEq(await attr("data-bnd-crumb-sep"), "chevron", "separator attr");
				expectEq(await attr("data-bnd-crumb-icons"), "first", "icons attr");
				expectEq(await attr("data-bnd-crumb-hover"), "pill", "hover attr");
				expect(await page.evaluate(() => document.documentElement.hasAttribute("data-bnd-crumb-copy")), "copy flag");
				expect(await page.evaluate(() => document.documentElement.hasAttribute("data-bnd-crumb-collapse")), "collapse flag");
				expect(await visibleTrail(".bnd-crumb-chip"), "module chip in visible trail");
				expect(await visibleTrail("li:last-child .bnd-crumb-copy"), "copy button on last crumb");
			});
		}

		await test("crumbs: Original applies nothing", async () => {
			setSettings({ crumb_style: "Original" });
			await goDesk("/desk/item/BND-TEST-001", ".page-head", 3000);
			expectEq(await attr("data-bnd-crumbs"), null, "no style attr");
			expect(!(await q(".bnd-crumb-chip")), "no chips anywhere");
			expect(!(await q(".bnd-crumb-copy")), "no copy buttons anywhere");
		});

		await test("crumbs: Every Crumb infers a doctype icon too", async () => {
			setSettings({ crumb_style: "Quiet Trail", icon_crumbs: "Every Crumb" });
			await goDesk("/desk/item/BND-TEST-001", ".page-head", 3000);
			const chips = await page.evaluate(() => {
				const trail = [...document.querySelectorAll(".page-head .navbar-breadcrumbs")].find((u) => u.offsetParent);
				return trail ? trail.querySelectorAll(".bnd-crumb-chip").length : 0;
			});
			expect(chips >= 2, `at least 2 chips on the form trail (got ${chips})`);
			setSettings({ icon_crumbs: "First Crumb" });
		});

		await test("crumbs: live preview flips the style instantly and back", async () => {
			await goDesk("/desk/item/BND-TEST-001", ".page-head", 3000);
			await page.evaluate(() => window.bunood_theme.crumb_apply({ crumb_style: "Crumb Pills" }));
			expectEq(await attr("data-bnd-crumbs"), "pills", "preview flips to pills");
			await page.evaluate(() => window.bunood_theme.crumb_apply({ crumb_style: "Quiet Trail" }));
			expectEq(await attr("data-bnd-crumbs"), "quiet", "preview back to quiet");
		});

		// ── Command palette kit (item 12) ───────────────────────────────────
		const PAL_STYLE_SLUG = { "Refined": "refined", "Bunood Palette": "palette", "Palette Pro": "pro" };

		for (const [style, slugValue] of Object.entries(PAL_STYLE_SLUG)) {
			await test(`palette: ${style} attribute`, async () => {
				setSettings({ palette_style: style, enable_command_palette: 1 });
				await goDesk("/desk/item", ".page-head", 2500);
				expectEq(await attr("data-bnd-palette"), slugValue, "style attr");
			});
		}

		await test("palette: Ctrl+K opens our shell with suggestions", async () => {
			setSettings({
				palette_style: "Bunood Palette", palette_frecency: 1, palette_footer: 1,
				palette_newtab: 1, palette_fallbacks: 1, palette_suggest: 1, palette_sigils: 1,
			});
			// NOT /desk/item: the frecency test below executes "Item List"
			// and must prove a REAL route change, not a no-op navigation.
			await goDesk("/desk/sales-invoice", ".page-head", 2500);
			await page.keyboard.press("Control+k");
			await page.waitForSelector(".bnd-palette-backdrop:not([hidden])", { timeout: 5000 });
			expect(await q(".bnd-palette .bnd-palette-input"), "input mounted");
			expect(await q(".bnd-palette .bnd-palette-footer"), "footer hints mounted");
			expect(
				await page.evaluate(() => document.activeElement.classList.contains("bnd-palette-input")),
				"input focused"
			);
		});

		await test("palette: grouped results with the pinned fallback", async () => {
			await page.fill(".bnd-palette-input", "item");
			await page.waitForTimeout(400);
			expect(
				(await page.evaluate(() => document.querySelectorAll(".bnd-palette-group").length)) >= 2,
				"at least two group headings"
			);
			// IDENTITY, NEVER RENDERED TEXT. `row.marked` is __()-translated and
			// carries <mark> tags from fuzzy_search, so asserting on it asserts a
			// rendering — and on an Arabic desk it asserts nothing at all. The
			// rows stamp what they ARE (bunood.js pal_row_el).
			const rows = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-palette-row")].map((r) => ({
					key: r.getAttribute("data-bnd-key"),
					species: r.getAttribute("data-bnd-species"),
					type: r.getAttribute("data-bnd-type"),
				}))
			);
			expect(rows.some((r) => r.key === "route:List/Item"), "Item List row present");
			// "New X" rows ride inside get_doctypes, not get_creatables (which
			// needs a "new " prefix) — the split into Actions must survive.
			// Asserted by species + Frappe's untranslated `type`, not by the
			// words "New Item": a New row carries no route, so pal_key falls
			// back to `label:<translated value>` and is useless as a handle.
			expect(
				rows.some((r) => r.species === "action" && r.type === "New"),
				"a New-doctype row is in the Actions group"
			);
			expect(rows[rows.length - 1].species === "fallback", "search-all pinned last");
		});

		await test("palette: execution routes and records frecency", async () => {
			// Clear BEFORE acting, not only after: a leftover blob from an
			// aborted earlier run would make the server-write assertion pass
			// even if the endpoint regressed (release review v0.7.0..HEAD).
			benchPy(
				`frappe.defaults.clear_default("bnd_palette_usage", parent="Administrator")\nfrappe.db.commit()\nprint("ok")\n`
			);
			// By key, not by label. The old form found the row with
			// /Item List/ and dereferenced it unguarded, so on any desk where
			// that string is translated this THREW — a crash, not a failure,
			// which reads as a broken suite rather than a broken feature.
			await page.evaluate(() => {
				const row = document.querySelector(
					'.bnd-palette-row[data-bnd-key="route:List/Item"]'
				);
				if (!row) throw new Error("no row with data-bnd-key=route:List/Item");
				row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
			});
			await page.waitForTimeout(2500);
			expect(
				await page.evaluate(() => location.pathname.replace(/\/$/, "").endsWith("/item")),
				"routed from the Sales Invoice list to the Item list"
			);
			const usage = benchPy(
				`print(frappe.defaults.get_user_default("bnd_palette_usage", "Administrator") or "{}")\n`
			).trim().split("\n").pop();
			expect(usage.includes("route:List/Item"), "frecency use recorded server-side");
			benchPy(
				`frappe.defaults.clear_default("bnd_palette_usage", parent="Administrator")\nfrappe.db.commit()\nprint("ok")\n`
			);
		});

		await test("palette: no duplicate rows in the empty state", async () => {
			setSettings({ palette_style: "Bunood Palette" });
			await goDesk("/desk/item", ".page-head", 2500);
			// Revisit the same list twice: frappe.route_history appends per
			// navigation without deduping, so a within-group dedupe bug shows
			// up here as the same row twice.
			await page.evaluate(() => window.frappe.set_route(["List", "Sales Invoice"]));
			await page.waitForTimeout(1500);
			await page.evaluate(() => window.frappe.set_route(["List", "Item"]));
			await page.waitForTimeout(1500);
			await page.evaluate(() => window.frappe.set_route(["List", "Sales Invoice"]));
			await page.waitForTimeout(1500);
			await page.keyboard.press("Control+k");
			await page.waitForSelector(".bnd-palette-backdrop:not([hidden])", { timeout: 5000 });
			const labels = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-palette-row-label")].map((n) => n.textContent.trim())
			);
			expectEq(labels.length, new Set(labels).size, `no repeated suggestion (${labels.join(" | ")})`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);
		});

		await test("palette: Ctrl+K over an open dialog lands ABOVE it, once", async () => {
			// The scenario that has broken twice: a Frappe dialog is open and
			// focus sits in one of its inputs, so base_input's own ctrl+k
			// handler jQuery-clicks the native trigger (opening the
			// awesomebar via simulated handlers) before our listener sees the
			// real click. The shell must end up the ONLY search surface, and
			// it must paint above the dialog — Bootstrap clears body's
			// modal-open when we hide the awesomebar, so the lift cannot be
			// keyed on that class.
			setSettings({ palette_style: "Bunood Palette" });
			await goDesk("/desk/item", ".page-head", 2500);
			await page.evaluate(() => {
				window.__bnd_dlg = new frappe.ui.Dialog({
					title: "Probe",
					fields: [{ fieldname: "probe", fieldtype: "Data", label: "Probe" }],
				});
				window.__bnd_dlg.show();
			});
			await page.waitForTimeout(900);
			await page.click(".modal.show input[data-fieldname='probe']");
			await page.keyboard.press("Control+k");
			await page.waitForTimeout(900);
			const state = await page.evaluate(() => {
				const shell = document.querySelector(".bnd-palette-backdrop:not([hidden]) .bnd-palette");
				const box = shell && shell.getBoundingClientRect();
				const hit = box && document.elementFromPoint(box.left + box.width / 2, box.top + 24);
				return {
					shell_open: !!shell,
					native_open: !!document.querySelector(".modal.show #navbar-search"),
					dialog_open: !!document.querySelector(".modal.show"),
					palette_on_top: !!(hit && hit.closest && hit.closest(".bnd-palette")),
				};
			});
			expect(state.shell_open, "shell opened");
			expect(!state.native_open, "native awesomebar did NOT also open");
			expect(state.dialog_open, "the dialog is still open (precondition)");
			expect(state.palette_on_top, "palette paints above the dialog");
			await page.evaluate(() => {
				if (window.__bnd_dlg) window.__bnd_dlg.hide();
				delete window.__bnd_dlg;
			});
			await page.keyboard.press("Escape");
			await page.waitForTimeout(500);
		});

		await test("palette: Global Search hand-off carries its keywords", async () => {
			await goDesk("/desk/item", ".page-head", 2500);
			const opened = await page.evaluate(() => {
				if (!(frappe.searchdialog && frappe.searchdialog.search)) return false;
				frappe.searchdialog.search.init_search("widget", "global_search");
				return true;
			});
			if (opened) {
				await page.waitForTimeout(1200);
				await page.keyboard.press("Control+k");
				await page.waitForTimeout(900);
				const state = await page.evaluate(() => ({
					gs_open: !!document.querySelector(".modal.search-dialog.show"),
					gs_flag: !!(
						frappe.searchdialog.search.search_dialog &&
						frappe.searchdialog.search.search_dialog.is_visible
					),
					seeded: (document.querySelector(".bnd-palette-input") || {}).value || "",
				}));
				expect(!state.gs_open, "Global Search dialog handed off (hidden)");
				expect(!state.gs_flag, "its is_visible flag cleared too");
				expectEq(state.seeded, "widget", "keywords carried into the palette");
				await page.keyboard.press("Escape");
				await page.waitForTimeout(400);
			}
		});

		await test("palette: Original leaves the stock Ctrl+K modal", async () => {
			setSettings({ palette_style: "Original" });
			await goDesk("/desk/item", ".page-head", 2500);
			expectEq(await attr("data-bnd-palette"), null, "no style attr");
			await page.keyboard.press("Control+k");
			await page.waitForSelector(".modal #navbar-search", { timeout: 8000 });
			expect(!(await q(".bnd-palette")), "our shell never built");
			await page.keyboard.press("Escape");
			await page.waitForTimeout(400);
		});

		await test("palette: Refined tags the native modal for the skin", async () => {
			setSettings({ palette_style: "Refined" });
			await goDesk("/desk/item", ".page-head", 2500);
			await page.keyboard.press("Control+k");
			await page.waitForSelector(".modal.bnd-search-modal #navbar-search", { timeout: 8000 });
			await page.keyboard.press("Escape");
			await page.waitForTimeout(400);
		});

		await test("palette: live preview flips the style and back", async () => {
			setSettings({ palette_style: "Bunood Palette" });
			await goDesk("/desk/item", ".page-head", 2500);
			await page.evaluate(() => window.bunood_theme.palette_apply({ palette_style: "Palette Pro" }));
			expectEq(await attr("data-bnd-palette"), "pro", "preview flips to pro");
			await page.evaluate(() => window.bunood_theme.palette_apply({ palette_style: "Bunood Palette" }));
			expectEq(await attr("data-bnd-palette"), "palette", "preview back to palette");
		});

		// ── Notification centre kit (item 13) ───────────────────────────────
		// Seed real Notification Log rows for Administrator. NOTE: Frappe's
		// own get_notification_logs is http-cached for 60s, which is exactly
		// why our panel pages through api.get_inbox instead — but the seed
		// must still exist BEFORE the desk loads for the badge count to be
		// in boot.
		const seedNotifications = () =>
			benchPy(
				`for i in (1, 2):\n` +
				`    frappe.get_doc({\n` +
				`        "doctype": "Notification Log",\n` +
				`        "subject": "<b class='subject-title'>BND-TEST-00%d</b> assigned to you" % i,\n` +
				`        "for_user": "Administrator",\n` +
				`        "type": "Assignment",\n` +
				`        "document_type": "Item",\n` +
				`        "document_name": "BND-TEST-00%d" % i,\n` +
				`        "from_user": "Administrator",\n` +
				`    }).insert(ignore_permissions=True)\n` +
				`frappe.db.commit()\nprint("seeded")\n`
			);
		const clearNotifications = () =>
			benchPy(
				`frappe.db.delete("Notification Log", {"for_user": "Administrator"})\n` +
				`frappe.defaults.clear_default("bnd_inbox_done", parent="Administrator")\n` +
				`frappe.db.commit()\nprint("cleared")\n`
			);

		clearNotifications();
		seedNotifications();

		const INBOX_STYLE_SLUG = { "Refined": "refined", "Bunood Inbox": "inbox", "Inbox + Page": "page" };
		for (const [style, slugValue] of Object.entries(INBOX_STYLE_SLUG)) {
			await test(`inbox: ${style} attribute`, async () => {
				setSettings({ inbox_style: style });
				await goDesk("/desk/item", ".page-head", 2500);
				expectEq(await attr("data-bnd-inbox"), slugValue, "style attr");
			});
		}

		await test("inbox: the bell carries the unread badge ERPNext lacks", async () => {
			setSettings({ inbox_style: "Inbox + Page", inbox_badge: "Count" });
			await goDesk("/desk/item", ".page-head", 3000);
			const badge = await page.evaluate(() => {
				const node = document.querySelector(".bnd-inbox-badge:not([hidden])");
				return node ? node.textContent.trim() : null;
			});
			expectEq(badge, "2", "badge shows the unread count");
		});

		await test("inbox: Action Count shows a NUMBER, not a bare dot", async () => {
			// It shipped permanently degraded to a dot: nothing ever filled
			// the typed count (release review v0.8.0..HEAD). The seeded rows
			// are Assignment + Mention, i.e. all action-required.
			setSettings({ inbox_style: "Inbox + Page", inbox_badge: "Action Count" });
			await goDesk("/desk/item", ".page-head", 3000);
			const state = await page.evaluate(() => {
				const n = document.querySelector(".bnd-inbox-badge:not([hidden])");
				return n ? { text: n.textContent.trim(), dot: n.classList.contains("bnd-inbox-badge-dot") } : null;
			});
			expect(state && !state.dot, "renders as a count, not a dot");
			expectEq(state && state.text, "2", "counts the action-required rows");
			setSettings({ inbox_badge: "Count" });
		});

		await test("inbox: panel opens with tabs, grouping and rows", async () => {
			// BY IDENTITY, NEVER BY ACCESSIBLE NAME. This clicked
			// `[aria-label='Notifications']`, and 34a made the bell's label
			// ANNOUNCE its count — "Notifications — Unread: 2" — so the exact
			// match found nothing for 30s straight, deterministically, because
			// the seed above guarantees unread=2. An accessible name is rendered
			// text: it changes with state and with language, which is exactly
			// why the contract says identity lives in data-bnd-part.
			await page.click('[data-bnd-part="bell"]');
			await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 6000 });
			// Rows arrive from api.get_inbox AFTER the panel paints — wait
			// for content, not just for the shell, or this races the fetch.
			await page.waitForSelector(".bnd-inbox-row", { timeout: 8000 });
			expect(await q(".bnd-inbox .bnd-inbox-tab-on"), "a tab is active");
			const rows = await page.evaluate(() => document.querySelectorAll(".bnd-inbox-row").length);
			expect(rows >= 2, `seeded rows render (got ${rows})`);
			expect(await q(".bnd-inbox-row .bnd-inbox-chip"), "reason chip rendered");
			expect(await q(".bnd-inbox-foot .bnd-inbox-link"), "page link in the footer (Inbox + Page)");
		});

		await test("inbox: marking read updates the server and the badge", async () => {
			await page.evaluate(() => {
				const btns = document.querySelectorAll(".bnd-inbox-row .bnd-inbox-act");
				// Second action in the first row's gutter is "mark done",
				// which also marks read through Frappe's own endpoint.
				if (btns.length > 1) btns[1].click();
			});
			await page.waitForTimeout(1800);
			const unread = benchPy(
				`print(frappe.db.count("Notification Log", {"for_user": "Administrator", "read": 0}))\n`
			).trim().split("\n").pop();
			expectEq(unread, "1", "one row marked read server-side");
			const badge = await page.evaluate(() => {
				const node = document.querySelector(".bnd-inbox-badge:not([hidden])");
				return node ? node.textContent.trim() : null;
			});
			expectEq(badge, "1", "badge decremented");
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);
		});

		await test("inbox: the full page renders its split pane", async () => {
			await goDesk("/desk/bnd-inbox", ".bnd-inbox-page", 3000);
			expect(await q(".bnd-inbox-page-list .bnd-inbox-tabs"), "page tabs");
			expect(await q(".bnd-inbox-page-detail"), "detail pane");
		});

		await test("inbox: Original leaves the stock panel and shows no badge", async () => {
			// The bell's placement is stated because the panel's box now follows
			// the BELL, not the layout: the fixed-position relocation this test
			// measures keys on `data-bnd-bell="topbar"`, which only a bell
			// mounted in the top bar stamps.
			setSettings({ inbox_style: "Original", desk_layout: "Top Bar", topbar_enabled: 1, inbox_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 2500);
			expectEq(await attr("data-bnd-inbox"), null, "no style attr");
			expect(!(await q(".bnd-inbox-badge:not([hidden])")), "no badge");
			// By identity — the accessible name is state- and language-dependent
			// since 34a (see "panel opens" above).
			await page.click('[data-bnd-part="bell"]');
			await page.waitForTimeout(1200);
			expect(!(await q(".bnd-inbox-backdrop:not([hidden])")), "our panel never built");
			// A display check alone is too weak — the stock panel can be
			// display:block and still have no visible box. Measure it.
			const box = await page.evaluate(() => {
				const n = document.querySelector(".dropdown-notifications");
				if (!n) return null;
				const r = n.getBoundingClientRect();
				return { w: Math.round(r.width), h: Math.round(r.height) };
			});
			expect(box && box.w > 200 && box.h > 100, `stock panel has a real box (got ${JSON.stringify(box)})`);
		});

		await test("inbox: Compact keeps the badge painted across route changes", async () => {
			// Compact rebuilds its cluster per route, so each new page gets a
			// fresh hidden badge. The first fix repainted on router change but
			// registered its listener BEFORE the one that rebuilds the
			// cluster, and Frappe fires them in order — so it painted the
			// outgoing page and the incoming one stayed blank forever.
			setSettings({ desk_layout: "Compact", inbox_style: "Inbox + Page", inbox_badge: "Count" });
			await goDesk("/desk/item", ".page-head", 3000);
			// POLL, never sample: a navigation can tear down an in-flight
			// evaluate ("promise was garbage collected"), and a one-shot read
			// also cannot tell "painted late" from "never painted".
			const painted = async (what) => {
				try {
					await page.waitForFunction(
						() => {
							const head = frappe.container && frappe.container.page;
							const n = head && head.querySelector(".bnd-cluster .bnd-inbox-badge");
							return !!(n && !n.hasAttribute("hidden") && n.textContent.trim());
						},
						{ timeout: 8000 }
					);
				} catch (e) {
					throw new Error(`badge never painted ${what}`);
				}
			};
			await painted("on the first page");
			await page.evaluate(() => window.frappe.set_route("List", "User"));
			await painted("after navigating to a list");
			// FORM routes specifically: their page container becomes current
			// AFTER the router fires, so every ordering-based fix painted the
			// outgoing page and left this one blank (measured 15s+).
			await page.evaluate(() => window.frappe.set_route("Form", "System Settings"));
			await painted("on a form route");
			// And a COLD load straight onto a form URL.
			await goDesk("/desk/system-settings", ".page-head", 2500);
			await painted("on a cold form load");
			setSettings({ desk_layout: "Top Bar" });
		});

		await test("status: Classic honours status_style in BOTH directions", async () => {
			// The contract that replaced `status_in_classic`. Asserting only that
			// Classic HAS a bar would pass just as well if the layout had started
			// mounting one unconditionally — which is the bug the deleted field
			// used to prevent. Both directions, or the test says nothing.
			setSettings({ desk_layout: "Classic", status_style: "Quiet" });
			await goDesk("/desk/item", ".body-sidebar-container", 3500);
			expect(await q(".bnd-statusbar"), "Classic + Quiet should mount the bar");

			setSettings({ desk_layout: "Classic", bottombar_enabled: 0 });
			await goDesk("/desk/item", ".body-sidebar-container", 3500);
			expectEq(await q(".bnd-statusbar"), false, "Classic + Off should mount no bar");

			// And the sidebar's own routes survive either way — Classic is the
			// layout that relies on them.
			expectEq(await visible(".body-sidebar .sidebar-notification"), true, "sidebar bell kept");
			expectEq(await visible(".body-sidebar .sidebar-user-button"), true, "sidebar user menu kept");

			setSettings({ desk_layout: "Top Bar", status_style: "Quiet" });
		});

		await test("inbox: works in Classic, which mounts no themed bell", async () => {
			// Classic mounts no cluster, so Frappe's own sidebar row is the
			// ONLY bell. The kit had no badge and no panel there at all,
			// while the picker still advertised both (release review
			// v0.8.0..HEAD). Every other inbox test runs under the ambient
			// layout and cannot see this.
			setSettings({ desk_layout: "Classic", inbox_style: "Inbox + Page" });
			await goDesk("/desk/item", ".page-head", 3000);
			// By identity. The old form matched on the exact accessible name,
			// which 34a suffixes with the unread count — so this precondition
			// had become VACUOUSLY true: it would pass with a themed bell right
			// there on the page, and the test after it would be measuring a desk
			// it had mischaracterised.
			expect(!(await q('[data-bnd-part="bell"]')), "no themed bell in Classic (precondition)");
			const badge = await page.evaluate(() => {
				const n = document.querySelector(".sidebar-notification .bnd-inbox-badge:not([hidden])");
				return n ? n.textContent.trim() : null;
			});
			expect(badge && parseInt(badge, 10) > 0, `native bell carries the badge (got ${badge})`);
			await page.click(".sidebar-notification .item-anchor");
			await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 6000 });
			expect(await q(".bnd-inbox .bnd-inbox-tabs"), "our panel opened from the native bell");
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);

			// Refined must skin the stock panel here too — its selector may
			// not depend on anything JS applies, since nothing mounts.
			setSettings({ inbox_style: "Refined" });
			await goDesk("/desk/item", ".page-head", 3000);
			const skinned = await page.evaluate(() => {
				const n = document.querySelector(".dropdown-notifications .notifications-list");
				if (!n) return null;
				return getComputedStyle(n).borderRadius;
			});
			expect(skinned && skinned !== "0px", `Refined skin applies in Classic (radius ${skinned})`);
			setSettings({ desk_layout: "Top Bar", inbox_style: "Inbox + Page" });
		});

		await test("inbox: live preview flips the style and back", async () => {
			setSettings({ inbox_style: "Inbox + Page" });
			await goDesk("/desk/item", ".page-head", 2500);
			await page.evaluate(() => window.bunood_theme.inbox_apply({ inbox_style: "Bunood Inbox" }));
			expectEq(await attr("data-bnd-inbox"), "inbox", "preview flips");
			await page.evaluate(() => window.bunood_theme.inbox_apply({ inbox_style: "Inbox + Page" }));
			expectEq(await attr("data-bnd-inbox"), "page", "preview back");
		});

		clearNotifications();

		// ── Search placement + status bar (item 14) ─────────────────────────
		const SEARCH_SLOTS = {
			// Every slot `search_placement` offers, and the slug each resolves
			// to. E1 renamed all six; the pairs are what they MEASURED before
			// the rename, taken from patches/v0_11_0/slot_vocabulary.py.
			"Top Bar Start": "topedge", "Top Bar Center": "topcenter",
			"Bottom Bar Start": "botedge", "Bottom Bar Center": "botcenter",
			"Side Pane Start": "sbtop", "Side Pane End": "sbbottom",
		};
		for (const [label, slug] of Object.entries(SEARCH_SLOTS)) {
			await test(`search: placed at ${label}`, async () => {
				// THE CONTAINERS ARE STATED, and they have to be since the split.
				// This used to say only `desk_layout: "Top Bar"`, which was
				// sufficient while the layout DECIDED which containers mounted.
				// Slice 2c gave every container its own switch, so a layout is
				// now a starting point a user can override — and a toggle left
				// off by whatever test ran before is inherited. That is not a
				// hypothetical: these three slots resolved to their FALLBACKS in
				// the full suite (topedge -> topcenter, sbtop -> topcenter,
				// sbbottom -> botcenter) and every one of them passed when run
				// alone, which is precisely the shape of a test asserting a desk
				// it never asked for.
				//
				// Each slot needs its host present: topedge/topcenter a top bar,
				// botedge/botcenter the status bar, sbtop/sbbottom a VISIBLE side
				// pane. All three are switched on, so the fallback chain is
				// never what is being measured here — the tests either side of
				// this loop are the ones that measure fallback.
				setSettings({
					...CHROME_DEFAULTS,
					desk_layout: "Top Bar",
					topbar_enabled: 1,
					bottombar_enabled: 1,
					sidebar_enabled: 1,
					pagehead_enabled: 0,
					dock_enabled: 0,
					search_placement: label,
					status_style: "Quiet",
				});
				await goDesk("/desk/item", ".page-head", 4500);
				expectEq(await attr("data-bnd-search"), slug, "resolved slot");
				const where = await page.evaluate(() => {
					const f = document.querySelector(".bnd-search-field");
					if (f) return f.closest(".bnd-topbar") ? "topbar" : f.closest(".bnd-statusbar") ? "statusbar" : "other";
					const nat = document.querySelector(".body-sidebar .navbar-search-bar");
					return nat && getComputedStyle(nat).display !== "none" ? "sidebar-native" : "none";
				});
				const want = slug.startsWith("top") ? "topbar" : slug.startsWith("bot") ? "statusbar" : "sidebar-native";
				expectEq(where, want, "field lives in the requested bar");
				// Sidebar slots reveal Frappe's OWN row — injecting a second
				// search there would be a duplicate, not a placement.
				const injected = await page.evaluate(() => document.querySelectorAll(".bnd-search-field").length);
				expectEq(injected, slug.startsWith("sb") ? 0 : 1, "exactly one search field");
			});
		}

		await test("search: an unavailable slot falls back, never vanishes", async () => {
			// Classic mounts no bars at all, so a top-bar request cannot be
			// honoured — it must land in the sidebar rather than disappear.
			setSettings({ desk_layout: "Classic", search_placement: "Top Bar Center" });
			await goDesk("/desk/item", ".page-head", 5200);
			expectEq(await attr("data-bnd-search"), "sbtop", "fell back to the sidebar");
			expectEq(
				await visible(".body-sidebar .navbar-search-bar"), true, "native search row is reachable"
			);
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });
		});

		await test("search: a hidden sidebar is not a valid home", async () => {
			// Dock keeps .body-sidebar in the DOM and sets display:none on its
			// container, so an existence check "places" search into a hidden
			// box and it disappears with no error anywhere. Whatever slot is
			// chosen, the field must end up somewhere a user can see.
			setSettings({ desk_layout: "Dock", search_placement: "Side Pane Start" });
			await goDesk("/desk/item", ".page-head", 4500);
			// Falls back to the DOCK, not the status bar: the pill is the one
			// piece of chrome this layout always has, and it is where the
			// layout's other controls already live.
			expectEq(await attr("data-bnd-search"), "dock", "left the hidden sidebar for the dock");
			expectEq(await visible(".bnd-dock .bnd-search-icon"), true, "search is actually on screen");
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });
		});

		await test("status: Quiet hides healthy signals, Always On shows them", async () => {
			setSettings({ status_style: "Always On", status_interval: "30s" });
			await goDesk("/desk/item", ".page-head", 4500);
			await page.waitForSelector(".bnd-status-seg:not([hidden])", { timeout: 8000 });
			const operator = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-status-seg")].filter((n) => !n.hasAttribute("hidden")).length
			);
			expect(operator >= 2, `Always On shows its segments (${operator})`);
			expect(await q(".bnd-status-fresh"), "freshness stamp present");

			setSettings({ status_style: "Quiet" });
			await goDesk("/desk/item", ".page-head", 4500);
			const quiet = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-status-seg")]
					.filter((n) => !n.hasAttribute("hidden"))
					.map((n) => n.textContent.trim())
			);
			// Quiet may legitimately show a real problem (this dev bench has
			// failed jobs); what it must NEVER show is an "all clear".
			expect(
				!quiet.some((t) => /OK|No errors|Scheduler on|^Live$/i.test(t)),
				`Quiet says nothing reassuring (${JSON.stringify(quiet)})`
			);
			// `[hidden]` is the lowest-weight rule there is, and the bar sets
			// display on .bnd-status-item — so hiding anything took a rule of
			// our own. Without it Quiet's whole premise was decorative.
			expectEq(
				await page.evaluate(() => {
					const n = document.querySelector(".bnd-status-seg[hidden], .bnd-conn[hidden]");
					return n ? getComputedStyle(n).display : "none";
				}),
				"none",
				"a hidden item is actually hidden"
			);
		});

		await test("status: Minimal makes no server calls, Off renders nothing", async () => {
			setSettings({ status_style: "Minimal" });
			// Count the signal endpoint for real rather than trusting the DOM:
			// "no server calls" is the whole point of this style, and a silent
			// poller would leave no visible trace to assert on.
			let polls = 0;
			const countPolls = (req) => {
				if (req.url().includes("bunood_theme.api.get_status_signals")) polls += 1;
			};
			page.on("request", countPolls);
			try {
				await goDesk("/desk/item", ".page-head", 3500);
				expect(await q(".bnd-statusbar"), "bar still present in Minimal");
				const segs = await page.evaluate(() => document.querySelectorAll(".bnd-status-seg").length);
				expectEq(segs, 0, "no live segments built");
				// The stamp is poll-driven too: rendering one that can never
				// age would be a lie with a dead refresh button under it.
				expect(!(await q(".bnd-status-fresh")), "no freshness stamp either");
				expectEq(polls, 0, "signal endpoint never called");
			} finally {
				page.off("request", countPolls);
			}

			setSettings({ bottombar_enabled: 0 });
			await goDesk("/desk/item", ".page-head", 3000);
			expect(!(await q(".bnd-statusbar")), "no status bar at all");
			setSettings({ status_style: "Quiet" });
		});

		await test("status: switching the bottom bar off never strands a user", async () => {
			// WAS "Off never takes away a layout's own chrome", and that premise
			// belonged to `status_style: "Off"` — a style that also meant "no
			// bar", except in the Bottom Bar layout where the strip mounted
			// anyway because it was that layout's only chrome. The workaround
			// for the 0.10.0 defect, in other words.
			//
			// `bottombar_enabled: 0` genuinely removes the bar, in every layout,
			// which is what a switch should do. So the thing to assert is no
			// longer "the chrome survives" but the rule that replaced it: a
			// control may be removed only while something else can still reach
			// the same function.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Bottom Bar", bottombar_enabled: 0 });
			await goDesk("/desk/item", ".page-head", 4500);
			expectEq(await q(".bnd-statusbar"), false, "the bar is really gone");
			const reachable = await page.evaluate(() => {
				const vis = (sel) => {
					const el = document.querySelector(sel);
					if (!el) return false;
					const r = el.getBoundingClientRect();
					return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
				};
				return {
					bell: vis(".bnd-bell") || vis(".body-sidebar .sidebar-notification"),
					user: vis(".bnd-avatar-btn") || vis(".body-sidebar .sidebar-user-button"),
				};
			});
			expect(reachable.bell, "notifications are still reachable somewhere");
			expect(reachable.user, "and so is the user menu, and therefore Log Out");
		});

		await test("status: the cluster stays at the bar's trailing edge", async () => {
			// The centre search slot must not flex: flexible lengths resolve
			// before auto margins, so a flexing sibling cancels the trailing
			// zone's `margin-inline-start: auto` and drags the bell and avatar to
			// the leading edge.
			//
			// MEASURED ON THE END ZONE, NOT THE CLUSTER. It used to be the
			// cluster, and E1 made that assertion meaningless without making it
			// fail honestly: the cluster now CARRIES the three zones, so it
			// spans the bar and sits 16px from both edges. "Trailing edge" is a
			// claim about where the tenants land, and after E1 the element that
			// answers that is `.bnd-zone[data-zone="end"]`.
			// The tenants are stated for the same reason the containers are: the
			// end zone can only sit at the trailing edge if something is IN it,
			// and what lands there is inbox_placement / user_placement — which
			// this test inherited from whatever ran before it.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				topbar_enabled: 1,
				search_placement: "Top Bar Center",
				inbox_placement: "Top Bar End",
				user_placement: "Top Bar End",
			});
			await goDesk("/desk/item", ".page-head", 4000);
			const geom = await page.evaluate(() => {
				const bar = document.querySelector(".bnd-topbar");
				const end = document.querySelector('.bnd-topbar .bnd-zone[data-zone="end"]');
				const field = document.querySelector(".bnd-topbar .bnd-search-field");
				if (!bar || !end || !field) return null;
				const b = bar.getBoundingClientRect(), c = end.getBoundingClientRect(), f = field.getBoundingClientRect();
				return {
					zoneEmpty: end.children.length === 0,
					clusters: bar.querySelectorAll(".bnd-cluster").length,
					endZones: bar.querySelectorAll('.bnd-zone[data-zone="end"]').length,
					topbarParts: Array.from(bar.querySelectorAll("[data-bnd-part]"))
						.map((n) => n.getAttribute("data-bnd-part") + "@" + (n.closest(".bnd-zone") ? n.closest(".bnd-zone").getAttribute("data-zone") : "loose"))
						.join(","),
					endFromEnd: Math.round(b.right - c.right),
					endFromStart: Math.round(c.left - b.left),
					offCentre: Math.abs(Math.round((f.left + f.right) / 2 - (b.left + b.right) / 2)),
				};
			});
			expect(geom, "top bar, end zone and search all present");
			// An empty zone collapses to zero width and would hug the trailing
			// edge whatever the rule did, which is a pass that proves nothing.
			expect(!geom.zoneEmpty, `the end zone actually holds something (clusters=${geom.clusters} endZones=${geom.endZones} topbar: ${geom.topbarParts || "nothing"})`);
			expect(geom.endFromEnd < geom.endFromStart, `the end zone sits at the end (${JSON.stringify(geom)})`);
			expect(geom.offCentre <= 8, `search is centred on the bar (off by ${geom.offCentre}px)`);
		});

		await test("search: one field only, never two", async () => {
			// Compact and Classic keep Frappe's own sidebar search row, so a
			// bar placement has to take it away or the user sees two.
			for (const layout of ["Compact", "Classic"]) {
				setSettings({ desk_layout: layout, search_placement: "Bottom Bar Center" });
				await goDesk("/desk/item", ".page-head", 4500);
				const count = await page.evaluate(() => {
					const ours = document.querySelectorAll(".bnd-search-field").length;
					const native = document.querySelector(".body-sidebar .navbar-search-bar");
					return ours + (native && getComputedStyle(native).display !== "none" ? 1 : 0);
				});
				expectEq(count, 1, `${layout}: exactly one search field on screen`);
			}
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });
		});

		await test("status: the dock and the status bar stack, never overlap", async () => {
			setSettings({ desk_layout: "Dock", status_style: "Always On", search_placement: "Top Bar Center" });
			await goDesk("/desk/item", ".page-head", 4500);
			const geom = await page.evaluate(() => {
				const dock = document.querySelector(".bnd-dock");
				const bar = document.querySelector(".bnd-statusbar");
				if (!dock || !bar) return null;
				const d = dock.getBoundingClientRect(), b = bar.getBoundingClientRect();
				return { dockBottom: Math.round(d.bottom), barTop: Math.round(b.top) };
			});
			expect(geom, "dock and bar both mounted");
			expect(geom.dockBottom <= geom.barTop, `dock clears the bar (${JSON.stringify(geom)})`);
			setSettings({ desk_layout: "Top Bar", status_style: "Quiet" });
		});

		await test("status: the bar collapses because IT is narrow, not the window", async () => {
			// The bar starts where the sidebar ends, and the sidebar is
			// user-resizable — so its width is not the viewport's. A media
			// query cannot see that: drag the sidebar out on a wide screen and
			// the bar is cramped while `max-width: 991px` has never fired.
			// Container queries ask the bar itself.
			setSettings({ desk_layout: "Top Bar", status_style: "Always On", search_placement: "Top Bar Center" });
			await page.setViewportSize({ width: 1200, height: 900 });
			await goDesk("/desk/item", ".page-head", 4500);

			const ranks = async () =>
				page.evaluate(() =>
					[...document.querySelectorAll(".bnd-statusbar [data-bnd-prio]")]
						.filter((n) => getComputedStyle(n).display !== "none")
						.map((n) => parseInt(n.dataset.bndPrio, 10))
						.sort((a, b) => a - b)
				);
			const widen = (px) =>
				page.evaluate((w) => {
					document.documentElement.style.setProperty("--bnd-sidebar-live-w", w);
				}, px);

			// WAIT FOR THE DATA, DO NOT SAMPLE FOR IT. The live segments are
			// built hidden and revealed by the poller, and
			// `api.get_status_signals` takes ~5,000ms on its FIRST call after a
			// restart against 8-10ms thereafter (HANDOVER §4). A fixed settle
			// therefore measures an empty bar on a cold stack and this test
			// fails reporting [1,2,3] — freshness, density and clock, the three
			// items that need no server call. Seen repeatedly; it passes on a
			// re-run, which is the signature of a race rather than a defect.
			//
			// This test is about CONTAINER QUERIES, not about whether the poller
			// works, so waiting for its precondition is not weakening it. A poll
			// that genuinely never arrives still fails, and says so.
			try {
				await page.waitForFunction(
					() => document.querySelectorAll(".bnd-statusbar .bnd-status-seg:not([hidden])").length > 0,
					{ timeout: 20000 }
				);
			} catch (e) {
				throw new Error("the status poller never delivered a segment in 20s — nothing to measure");
			}

			const roomy = await ranks();
			expect(roomy.length >= 5, `all ranks fit a 1140px bar (${JSON.stringify(roomy)})`);

			// Same viewport throughout — only the bar changes.
			await widen("400px");
			await page.waitForTimeout(500);
			const squeezed = await ranks();
			await widen("620px");
			await page.waitForTimeout(500);
			const tight = await ranks();
			await widen("");
			await page.setViewportSize({ width: 1920, height: 1080 });

			expect(
				squeezed.length < roomy.length && tight.length < squeezed.length,
				`narrowing the BAR drops ranks (${JSON.stringify([roomy, squeezed, tight])})`
			);
			// And it drops them in the documented order — the least actionable
			// first, so a failure count outlives the clock.
			expect(!squeezed.includes(1) && !squeezed.includes(2), "freshness and density go first");
			expect(tight.includes(5) && tight.includes(6), "jobs and scheduler survive longest");
		});

		await test("status: privileged signals never reach a plain user", async () => {
			// Server-side, because the browser session is Administrator and the
			// interesting case is the one it can never exercise. A throwaway
			// user with no roles stands in for every ordinary employee.
			const out = benchPy(
				`from bunood_theme.api import get_status_signals\n` +
				`u = "bnd-status-probe@example.com"\n` +
				`if not frappe.db.exists("User", u):\n` +
				`    d = frappe.get_doc({"doctype": "User", "email": u, "first_name": "Probe",\n` +
				`                        "send_welcome_email": 0, "user_type": "System User"})\n` +
				`    d.insert(ignore_permissions=True)\n` +
				`    frappe.db.commit()\n` +
				`frappe.set_user(u)\n` +
				`res = get_status_signals(1, 1, 1)\n` +
				`print("BND" + json.dumps({"jobs": res["jobs"], "priv": res["privileged"]}))\n`
			);
			const res = JSON.parse(out.split("BND")[1].trim());
			expectEq(res.priv, 0, "not flagged privileged");
			expectEq(res.jobs, null, "no job counts for an unprivileged session");

			// ...and as Administrator the counter must actually COUNT. Without
			// this the suite stays green while the RQ Job helper drifts away
			// underneath us and the segment is permanently dead — which is
			// exactly how the unfiltered-scan bug survived its first outing.
			const admin = JSON.parse(
				benchPy(
					`from bunood_theme.api import get_status_signals\n` +
					`frappe.set_user("Administrator")\n` +
					`r = get_status_signals(1, 0, 0)\n` +
					`print("BND" + json.dumps({"jobs": r["jobs"], "priv": r["privileged"]}))\n`
				).split("BND")[1].trim()
			);
			expectEq(admin.priv, 1, "Administrator is privileged");
			expect(admin.jobs && typeof admin.jobs === "object", "job counts came back");
			for (const key of ["queued", "started", "failed"]) {
				expect(
					Number.isInteger(admin.jobs[key]),
					`${key} is a real count, not null (${JSON.stringify(admin.jobs)})`
				);
			}
		});

		await test("status: collapses by rank on narrow viewports", async () => {
			setSettings({ status_style: "Always On", search_placement: "Bottom Bar Center" });
			await goDesk("/desk/item", ".page-head", 4500);
			const visiblePrios = async () =>
				page.evaluate(() =>
					[...document.querySelectorAll(".bnd-statusbar [data-bnd-prio]")]
						.filter((n) => getComputedStyle(n).display !== "none")
						.map((n) => parseInt(n.dataset.bndPrio, 10))
				);
			const wide = await visiblePrios();
			// 800, NOT 700: below 768 is Frappe's mobile boundary, where item 24's
			// narrow mode turns the whole bar into the phone nav and hides EVERY
			// signal (that full collapse is asserted by the `responsive:` family).
			// This test is about the viewport-FLOOR rank collapse — the no-container
			// -query fallback — so it must sit in the 768-992 band, where bnd-until
			// (lg) drops ranks 1-2 and the rest survive. (700 used to work; item 24
			// moved the mobile line under it.)
			await page.setViewportSize({ width: 800, height: 900 });
			await page.waitForTimeout(600);
			const narrow = await visiblePrios();
			await page.setViewportSize({ width: 1920, height: 1080 });
			await page.waitForTimeout(400);
			expect(wide.length > narrow.length, `narrow drops items (${wide.length} -> ${narrow.length})`);
			// The point of ranking: what survives is what means trouble.
			expect(
				narrow.every((p) => p >= Math.min(...wide)) && Math.max(...narrow) >= 5,
				`signal ranks survive (${JSON.stringify(narrow)})`
			);
			setSettings({ search_placement: "Top Bar Center", status_style: "Quiet" });
		});

		// ── Bottom reserve: content never hides under the fixed chrome ─────
		// The regression this locks down shipped with the layout kit (item 9)
		// and survived three plausible fixes, so it is worth stating what is
		// actually being measured.
		//
		// The status bar and the dock are position:fixed. Reserving space for
		// them as padding on .main-section does nothing, because Frappe sizes
		// the list from that element's BORDER box:
		//   base_list.js:452  main_rect = $(".main-section").getBoundingClientRect()
		// so the list keeps filling the whole viewport and the paging row —
		// the "20 100 500 2500" buttons — sits under the bar. The fix takes
		// the reserve off .main-section's height instead (chrome/_layouts.scss),
		// with the reserve MEASURED from the rendered chrome (bunood.js
		// observe_bottom_reserve).
		//
		// Two assertions per layout, and the second one matters as much as the
		// first: the paging row must not pass UNDER the bar, and it must not
		// stop short of it either — over-reserving would read as a dead band
		// at the foot of every page, which is what the naive per-layout token
		// matrix did in Dock (76px reserved for 62px of chrome).
		const RESERVE_LAYOUTS = [
			// [layout, status_style, what the layout mounts]
			["Top Bar", "Quiet", ".bnd-statusbar"],
			["Compact", "Quiet", ".bnd-statusbar"],
			["Bottom Bar", "Quiet", ".bnd-statusbar"],
			// Dock mounts a floating pill AND a status bar; the reserve has to
			// clear whichever sits highest, which is the pill.
			["Dock", "Quiet", ".bnd-dock"],
			// Dock with the status bar switched Off: the pill ALONE. Worth its
			// own row because the pill is appended to <body> while the status
			// bar goes into .main-section — so a reserve that only watches
			// .main-section passes the row above (the bar's arrival triggers
			// the re-measure, which then happens to see the pill) and fails
			// this one. It did exactly that; measured in RTL at 430px.
			["Dock", "Quiet", ".bnd-dock"],
			// Classic mounts the bar like every other layout now: the status bar
			// is a component, so `status_style` decides and the layout has no
			// opinion. It used to need `status_in_classic`, and that opt-in had
			// no bottom reservation at all before the clearance fix.
			["Classic", "Quiet", ".bnd-statusbar"],
		];

		/** Geometry of the paging row against the topmost fixed bottom chrome.
		 * Read in ONE evaluate: two reads can straddle a relayout. */
		const bottomGeometry = () =>
			page.evaluate(() => {
				const tops = [...document.querySelectorAll(".bnd-statusbar, .bnd-dock")]
					.filter((el) => getComputedStyle(el).display !== "none")
					.map((el) => el.getBoundingClientRect())
					.filter((r) => r.height > 0)
					.map((r) => r.top);
				const paging = document.querySelector(".list-paging-area");
				const main = document.querySelector(".main-section");
				return {
					barTop: tops.length ? Math.round(Math.min(...tops)) : null,
					bars: tops.length,
					pagingBottom: paging ? Math.round(paging.getBoundingClientRect().bottom) : null,
					mainBottom: main ? Math.round(main.getBoundingClientRect().bottom) : null,
					reserve: getComputedStyle(document.documentElement)
						.getPropertyValue("--bnd-bottom-reserve")
						.trim(),
				};
			});

		for (const [layout, status, mounts] of RESERVE_LAYOUTS) {
			await test(`reserve: ${layout} keeps the paging row clear of ${mounts}`, async () => {
				setSettings({
					desk_layout: layout, status_style: status,
					search_placement: "Top Bar Center",
				});
				await goDesk("/desk/item", ".frappe-list", 4500);
				const g = await bottomGeometry();
				expect(g.barTop !== null, `${mounts} is mounted (found ${g.bars} bars)`);
				expect(g.pagingBottom !== null, "the list rendered its paging row");
				// THE defect: any positive difference is content behind glass.
				expect(
					g.pagingBottom <= g.barTop,
					`paging row clears the bar — bottom ${g.pagingBottom} vs bar top ${g.barTop} ` +
						`(overlap ${g.pagingBottom - g.barTop}px, reserve ${g.reserve})`
				);
				// And no dead band: the list is sized to fill its container, so
				// its foot should land ON the bar, not above it. 2px of slack
				// for sub-pixel rounding in the reserve.
				expect(
					g.barTop - g.pagingBottom <= 2,
					`no dead band above the bar — gap ${g.barTop - g.pagingBottom}px (reserve ${g.reserve})`
				);
			});
		}

		await test("reserve: status style Off reserves nothing at all", async () => {
			// The mirror image of the tests above. With no bar mounted the desk
			// must be stock height — a reserve that outlives its bar is a strip
			// of viewport the user paid for and cannot use.
			setSettings({ desk_layout: "Top Bar", bottombar_enabled: 0 });
			await goDesk("/desk/item", ".frappe-list", 4500);
			const g = await bottomGeometry();
			expectEq(g.barTop, null, "no bottom chrome is mounted");
			expectEq(g.reserve, "0px", "reserve released");
			const vh = await page.evaluate(() => window.innerHeight);
			expectEq(g.mainBottom, vh, ".main-section runs to the viewport edge");
			setSettings({
				desk_layout: "Top Bar", status_style: "Quiet",
				search_placement: "Top Bar Center",
			});
		});

		// ── The report view honours the reserve too (item 26 slice 1) ──────
		// report.scss and frappe_datatable size the report's inner panes from
		// RAW 100vh, which the item-24 `.main-section` shrink never reaches — so
		// before the fix the paging row and the last rows sat under the bottom
		// chrome. Measured against stock on /app/account/view/report at the Top
		// Bar + status defaults: paging bottom 945, dt-scrollable bottom 925,
		// bar top 874 — 71px / 51px unreachable. chrome/_layouts.scss now
		// subtracts the reserve AND, under a sticky in-flow top bar,
		// `--bnd-topbar-h` (Frappe's navbar is fixed and overlays, so its
		// `100vh - page-head` formula never had to count a bar that pushes the
		// page down).
		//
		// Two layouts, because the fix has a topbar-conditional term: Top Bar
		// exercises it, Classic (top bar off, status bar on) the reserve-only
		// branch. The paging row's BOTTOM grazes the bar by ~1px — Frappe's
		// `--page-head-height` (48) trails the rendered `.page-head` (49, its 1px
		// separator border) — so the foot must LAND on the bar within 2px, and
		// the datatable's own scroll box (the rows) must clear it outright.
		const reportFootGeometry = () =>
			page.evaluate(() => {
				const bars = [...document.querySelectorAll(".bnd-statusbar, .bnd-dock")]
					.filter((el) => getComputedStyle(el).display !== "none")
					.map((el) => el.getBoundingClientRect())
					.filter((r) => r.height > 0)
					.map((r) => r.top);
				const rect = (sel) => {
					const el = document.querySelector(sel);
					return el ? el.getBoundingClientRect() : null;
				};
				const paging = rect(".list-paging-area");
				const dts = rect(".dt-scrollable");
				return {
					barTop: bars.length ? Math.round(Math.min(...bars)) : null,
					pagingBottom: paging ? Math.round(paging.bottom) : null,
					dtsBottom: dts ? Math.round(dts.bottom) : null,
					topbar: document.documentElement.hasAttribute("data-bnd-topbar"),
					reserve: getComputedStyle(document.documentElement)
						.getPropertyValue("--bnd-bottom-reserve").trim(),
				};
			});

		for (const [layout, wantTopbar] of [["Top Bar", true], ["Classic", false]]) {
			await test(`reserve: the report view's foot clears the bottom chrome (${layout})`, async () => {
				setSettings({ desk_layout: layout, status_style: "Quiet" });
				await goDesk("/app/account/view/report", ".dt-scrollable .dt-row", 5000);
				const g = await reportFootGeometry();
				expect(g.barTop !== null, `a status bar is mounted (reserve ${g.reserve})`);
				expect(g.pagingBottom !== null, "the report rendered its paging row");
				expectEq(g.topbar, wantTopbar, `top bar ${wantTopbar ? "present" : "absent"} on ${layout}`);
				// The foot LANDS on the bar (within the 1px page-head-border
				// graze): not 71px under it (stock), not short of it (over-reserved).
				expect(
					Math.abs(g.pagingBottom - g.barTop) <= 2,
					`paging row lands on the bar — bottom ${g.pagingBottom} vs bar top ${g.barTop} ` +
						`(delta ${g.pagingBottom - g.barTop}px, reserve ${g.reserve})`
				);
				// The rows clear the bar outright.
				expect(
					g.dtsBottom <= g.barTop,
					`datatable rows clear the bar — dt-scrollable bottom ${g.dtsBottom} vs bar top ${g.barTop}`
				);
			});
		}

		// ── The kanban board's column honours the reserve too (item 27) ────
		// kanban.scss:36 sizes every column from RAW 100vh minus Frappe's OLD
		// fixed --navbar-height — the navbar our sticky top bar replaced. So
		// under the top bar the column over-fills the reserve-shrunk
		// .main-section and its foot spills ~13px past the scroll box: a stray
		// page scroll on the whole board (measured 1440x900 shipped defaults:
		// column foot 887 vs .main-section 874). chrome/_layouts.scss now swaps
		// the phantom navbar for the real --bnd-topbar-h and takes off the
		// reserve, gated on data-bnd-topbar. UNLIKE the report view no content
		// hides — .kanban-cards scrolls internally — so this asserts the column
		// fits its scroll box (no stray scroll), and that the cards still
		// scroll (the reason nothing was ever hidden). The board is the pinned
		// fixture from tools/fixtures-views.mjs.
		await test("reserve: the kanban column fits the scroll box under the top bar", async () => {
			setSettings({ desk_layout: "Top Bar", status_style: "Quiet" });
			await goDesk("/app/todo/view/kanban/Bunood%20Memos", ".kanban-column", 5000);
			const g = await page.evaluate(() => {
				const ms = document.querySelector(".main-section");
				const col = document.querySelector(".kanban-column:not(.add-new-column)");
				const cards = document.querySelector(".kanban-cards");
				const bottom = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : null);
				return {
					topbar: document.documentElement.hasAttribute("data-bnd-topbar"),
					colBottom: bottom(col),
					mainBottom: bottom(ms),
					strayScroll: ms ? ms.scrollHeight - ms.clientHeight : null,
					cardsScroll: cards ? cards.scrollHeight > cards.clientHeight : null,
				};
			});
			expect(g.colBottom !== null, "the kanban board rendered a column (fixture present?)");
			expectEq(g.topbar, true, "the top bar is on — the branch the fix guards");
			// The column foot lands on or above the scroll box: no 13px spill,
			// so no stray page scroll. (<=2 absorbs the 1px sub-pixel graze the
			// report test documents.)
			expect(
				g.colBottom - g.mainBottom <= 2,
				`column fits — foot ${g.colBottom} vs .main-section ${g.mainBottom} ` +
					`(delta ${g.colBottom - g.mainBottom}px, stray scroll ${g.strayScroll}px)`
			);
			// The seeded Open column holds 14 memos, so its cards box scrolls —
			// which is why the column overflow never hid a card in the first
			// place. Pins the "no content hidden" premise the fix rests on.
			expect(g.cardsScroll === true, "the cards box scrolls internally, so every card stays reachable");
		});

		// ── Sidebar presets: attribute matrix + core mounts ────────────────
		for (const [name, values] of Object.entries(presets)) {
			await test(`preset: ${name}`, async () => {
				setSettings({ ...values, sidebar_preset: name });
				await goDesk("/desk/sales-invoice", ".page-head", 3000);
				for (const [field, attrName] of Object.entries(ATTR_OF)) {
					// A preset only drives the fields it sets. icon_style left the
					// preset dicts for the Icons axis (item 23), so it is no longer
					// preset-driven and is asserted by the icon-engine tests instead.
					if (values[field] === undefined) continue;
					expectEq(await attr(attrName), SLUG[field][values[field]], `${attrName}`);
				}
				expect(await q(".bnd-sb-brand .bnd-sb-brand-name"), "brand block");
				expect(await q(".bnd-sb-module"), "module row");
				expect(await q(".bnd-sb-utils"), "quick links mounted");
				if (values.sidebar_menu_rail === "Rail") {
					expect(await page.evaluate(() => document.documentElement.hasAttribute("data-bnd-rail")), "rail attr");
					expectEq(
						await page.evaluate(() => Math.round(document.querySelector(".body-sidebar-container").getBoundingClientRect().width)),
						52, "resting rail width"
					);
				}
				if (values.sidebar_section_layout === "Mini-Cards") {
					expect((await page.evaluate(() => document.querySelectorAll(".bnd-sb-card").length)) > 0, "section cards");
				}
			});
		}

		// ── Rail behaviour (Bunood Night: hover trigger + edge button) ─────
		await test("rail: hover opens (with intent delay), leave closes (with grace)", async () => {
			// "Bunood Light", because it is the preset that HAS a rail. Night
			// was, until the 2026-08-08 re-choice made it attached, solid and
			// always expanded — after which this test was exercising a rail
			// that never mounted and passing on nothing. The behaviour under
			// test did not change; the preset carrying it did.
			setSettings({ ...presets["Bunood Light"], sidebar_preset: "Bunood Light" });
			await goDesk("/desk/sales-invoice", ".page-head", 3000);
			await page.hover(".body-sidebar-container");
			await page.waitForTimeout(300);
			expect(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open")), "opens on hover");
			await page.mouse.move(1400, 500);
			await page.waitForTimeout(150);
			expect(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open")), "grace period holds");
			await page.waitForTimeout(500);
			expect(!(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open"))), "closes after grace");
		});

		await test("rail: edge button pins open and unpins", async () => {
			expect(await q(".bnd-railbtn.bnd-railbtn-edge"), "edge button mounted");
			await page.click(".bnd-railbtn");
			await page.waitForTimeout(300);
			expect(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open")), "pinned open");
			await page.mouse.move(1400, 500);
			await page.waitForTimeout(500);
			expect(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open")), "stays while pinned");
			await page.click(".bnd-railbtn");
			// Soft unpin BY DESIGN: with the pointer still over the pane it
			// stays open until the pointer leaves (v0.6.1 rail-feel fix), so
			// move away before expecting closure.
			await page.mouse.move(1400, 500);
			await page.waitForTimeout(700);
			expect(!(await page.evaluate(() => document.querySelector(".body-sidebar-container").classList.contains("bnd-rail-open"))), "unpins closed after pointer leaves");
		});

		// ── Icon engine ────────────────────────────────────────────────────
		await test("icon engine: every id the module can emit exists in the sprite", async () => {
			// Release review, v0.15.0: tools/icons.mjs's own docstring claimed
			// this gate was "run by CI and npm run verify", and it was wired into
			// neither — CI never touched it and verify.mjs only spawns this file.
			// No browser session needed (icons.py is pure Python over a static
			// manifest), so it runs the same way payload.mjs does below: spawn,
			// assert exit 0. Making the docstring's claim true, not softening it.
			const res = spawnSync(process.execPath, ["tools/icons.mjs"], {
				cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
				encoding: "utf8",
			});
			expectEq(res.status, 0, `icons:check: ${(res.stdout + res.stderr).trim().slice(0, 400)}`);
		});

		await test("icon engine: smart mode leaves no link glyph-less", async () => {
			await page.hover(".body-sidebar-container");
			await page.waitForTimeout(400);
			const counts = await page.evaluate(() => {
				let icons = 0, letters = 0, bare = 0;
				for (const it of document.querySelectorAll("[data-bnd-iconized]")) {
					const span = it.querySelector(".sidebar-item-icon");
					if (!span) continue;
					if (span.querySelector("use")) icons++;
					else if (span.querySelector(".bnd-sb-letter")) letters++;
					else bare++;
				}
				return { icons, letters, bare };
			});
			expect(counts.icons + counts.letters > 0, "links processed");
			expectEq(counts.bare, 0, "bare links");
			await page.mouse.move(1400, 500);
		});

		// The engine test above counts <use> elements and so is blind to a
		// glyph that resolved but renders the wrong SIZE — which is exactly how
		// the 8x15 squash shipped green (measured live 2026-08-13: Frappe's
		// `.item-anchor .sidebar-item-icon` at (0,4,0) wins `display:flex` and
		// `padding:7px` over our (0,3,1), so the box collapses to an 8px content
		// box and the svg, a flex item, is shrunk to 8x15). getComputedStyle
		// reads the cascade's 22px/15px, not the resolved box — the whole
		// suite's ~60 geometry checks would pass — so this measures
		// getBoundingClientRect. Three invariants, one per failure mode the
		// squash produced: the CHIP box (was 8x8) is square, the SVG (was 8x15)
		// is square, and the LETTER (was 8x8 or 0x0) is not collapsed. A letter
		// is a centred character, naturally narrower than tall, so it is checked
		// for collapse, not for squareness.
		await test("icon engine: chip and glyphs render at size, not squashed", async () => {
			await page.hover(".body-sidebar-container");
			await page.waitForTimeout(400);
			const m = await page.evaluate(() => {
				const chips = [], svgs = [], letters = [];
				for (const span of document.querySelectorAll(".body-sidebar .item-anchor .sidebar-item-icon")) {
					const cr = span.getBoundingClientRect();
					if (cr.width === 0) continue; // not visible
					chips.push({ w: Math.round(cr.width), h: Math.round(cr.height) });
					const svg = span.querySelector("svg");
					if (svg) { const r = svg.getBoundingClientRect(); svgs.push({ w: Math.round(r.width), h: Math.round(r.height) }); }
					const lt = span.querySelector(".bnd-sb-letter");
					if (lt) { const r = lt.getBoundingClientRect(); letters.push({ w: Math.round(r.width), h: Math.round(r.height) }); }
				}
				return { chips, svgs, letters };
			});
			// Vacuous-pass guard: an empty pane passes every check below trivially.
			expect(m.chips.length >= 4, `there are visible chips to measure (found ${m.chips.length})`);
			const notSquare = (g) => g.w < 2 || g.h < 2 || Math.abs(g.w - g.h) > 1;
			const chipBad = m.chips.filter(notSquare);
			expectEq(chipBad.length, 0, `every chip box is square (offenders: ${JSON.stringify(chipBad.slice(0, 4))} of ${m.chips.length})`);
			const svgBad = m.svgs.filter(notSquare);
			expectEq(svgBad.length, 0, `every icon glyph is square (offenders: ${JSON.stringify(svgBad.slice(0, 4))} of ${m.svgs.length})`);
			// A collapsed letter is the 0x0 / 8x8 failure; a healthy one is a
			// centred character filling the tile's height.
			const letterBad = m.letters.filter((g) => g.w < 3 || g.h < 14);
			expectEq(letterBad.length, 0, `every letter fallback is uncollapsed (offenders: ${JSON.stringify(letterBad.slice(0, 4))} of ${m.letters.length})`);
			await page.mouse.move(1400, 500);
		});

		// The headline of item 23's engine move: inference runs on the SERVER off
		// `link_to`, which Frappe never translates, so an Arabic desk resolves the
		// SAME icon for a link as an English one. The old client engine keyed off
		// the translated label and drew 0 icons in Arabic against 35 in English —
		// this asserts that gap is closed, by reading the boot payload our
		// `_apply_icon_inference` produces in each language and demanding they
		// agree link-for-link. Reads the payload, not the DOM, so it tests OUR
		// output rather than Frappe's rendering (and dodges sidebar visibility).
		await test("icon engine: inference is language-independent (Arabic parity)", async () => {
			const readIcons = async () => {
				await goDesk("/desk/item", ".page-head", 5000);
				return page.evaluate(() => {
					const wsi = (window.frappe && frappe.boot && frappe.boot.workspace_sidebar_item) || {};
					const out = {};
					for (const sb of Object.values(wsi)) {
						for (const it of (sb.items || [])) {
							if (it.type !== "Link" || !it.link_to) continue;
							const id = it.icon ? (it.icon.startsWith("es-") ? it.icon : "icon-" + it.icon) : null;
							// Record the icon only if it actually resolves — a name
							// that names no symbol is not a resolved icon.
							out[it.link_to] = id && document.getElementById(id) ? it.icon : null;
						}
					}
					return out;
				});
			};
			const en = await readIcons();
			const enCount = Object.values(en).filter(Boolean).length;
			// Baseline guard: if inference produced almost nothing in English the
			// parity check below would pass vacuously (0 === 0).
			expect(enCount > 10, `English inference resolved a healthy set of icons (got ${enCount})`);

			const ar = await withLang("ar", readIcons);
			const arCount = Object.values(ar).filter(Boolean).length;
			// Every link resolves the SAME icon in both languages. A diff here is
			// the exact regression the server move exists to prevent: inference
			// leaking back onto the translated label.
			const diffs = Object.keys(en)
				.filter((k) => en[k] !== ar[k])
				.slice(0, 6)
				.map((k) => ({ link: k, en: en[k], ar: ar[k] }));
			expectEq(
				diffs.length, 0,
				`Arabic resolves every link's icon identically (en=${enCount} ar=${arCount}; diffs: ${JSON.stringify(diffs)})`
			);
		});

		// icon_style relocated to the Icons axis (item 23) but still drives the
		// sidebar chip attribute — coverage the preset test used to give before
		// the field left the preset dicts. Set it, reload (the field applies
		// through boot until the Phase 3 picker adds live preview), read the attr.
		await test("icon engine: icon_style drives the sidebar chip attribute", async () => {
			const want = getSettings(["icon_style"]).icon_style === "Monochrome" ? "Colored Dots" : "Monochrome";
			setSettings({ icon_style: want });
			await goDesk("/desk/item", ".body-sidebar-container", 4000);
			expectEq(await attr("data-bnd-sb-icons"), SLUG.icon_style[want], "data-bnd-sb-icons follows icon_style");
			setSettings({ icon_style: "Colored Chips" });
		});

		// icon_weight (item 23, Phase 3) is the new axis: it stamps
		// data-bnd-icon-weight on <html> and _icons.scss maps it onto the RESOLVED
		// stroke-width of every desk icon — the measured thing, not just the
		// attribute, because Frappe hard-codes 1.5px and this has to WIN.
		await test("icon engine: icon_weight sets the rendered stroke", async () => {
			setSettings({ icon_weight: "2" });
			await goDesk("/desk/item", ".body-sidebar-container", 4000);
			const m = await page.evaluate(() => {
				const html = document.documentElement;
				const icon = document.querySelector(".body-sidebar .item-anchor .sidebar-item-icon svg, .page-head .icon");
				return { attr: html.getAttribute("data-bnd-icon-weight"), stroke: icon ? getComputedStyle(icon).strokeWidth : null };
			});
			expectEq(m.attr, "2", "data-bnd-icon-weight follows icon_weight");
			expectEq(m.stroke, "2px", "the rendered stroke-width is 2px, beating Frappe's 1.5px");
			setSettings({ icon_weight: "1.5" });
		});

		// ── Save round-trip (TimestampMismatch regression, 0.6.2) ──────────
		await test("Theme Settings saves twice in a row without conflict", async () => {
			await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-presets", 2000);
			// Start from the DB's current state: earlier tests write Theme
			// Settings through set_single_value, which bumps `modified`, so
			// without this round 1 can fail on inherited staleness and mask
			// what this test actually guards — that OUR save path does not
			// bump `modified` and break the NEXT save (the v0.6.2 bug).
			await page.evaluate(() => window.cur_frm.reload_doc());
			await page.waitForTimeout(1500);
			for (const round of [1, 2]) {
				await page.evaluate(() => window.cur_frm.set_value("tagline", "smoke-" + Date.now()));
				await page.keyboard.press("Control+s");
				await page.waitForTimeout(3000);
				const err = await page.evaluate(() => {
					const modal = document.querySelector(".modal.show .modal-body");
					return modal ? modal.textContent.slice(0, 120) : "";
				});
				expect(!/modified after/i.test(err), `round ${round} conflict dialog: ${err}`);
				expect(!(await page.evaluate(() => window.cur_frm.is_dirty())), `round ${round} saved`);
			}
		});

		await test("settings: seeding a new field does not kill an open form", async () => {
			// THE BUG THIS ENCODES, reported repeatedly and reproduced 2026-08-07:
			//   "Theme Settings has been modified after you have opened it
			//    (…, …). Please refresh to get the latest document."
			//
			// `frappe.db.set_single_value` bumps `modified` unless told not to,
			// and `setup._seed_defaults` runs on EVERY after_migrate, writing any
			// field that is empty and any Check whose row is absent. So every
			// upgrade that ADDS a field — four of them in the container split
			// alone — invalidated every Theme Settings form that happened to be
			// open, and the user's next save died. The document had changed, but
			// not by them.
			//
			// WHY THE OLD DOUBLE-SAVE TEST NEVER CAUGHT IT: it calls reload_doc()
			// first, which is precisely the workaround the error asks for, and it
			// runs on `?shell=0`. Green throughout.
			//
			// Drives the REAL seeder, not an imitation of it: a Check row is
			// deleted so the seeder has genuine work, exactly as a newly added
			// field gives it work on an upgrade.
			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			const before = await page.evaluate(() => String(window.cur_frm.doc.modified));

			const after = JSON.parse(
				benchPy(
					`frappe.db.sql("delete from tabSingles where doctype='Theme Settings' and field='crumb_copy_link'")\n` +
					`frappe.db.commit()\n` +
					`from bunood_theme.setup import _seed_defaults\n` +
					`_seed_defaults()\n` +
					`row = frappe.db.sql("select value from tabSingles where doctype='Theme Settings' and field='modified'")\n` +
					`seeded = frappe.db.sql("select value from tabSingles where doctype='Theme Settings' and field='crumb_copy_link'")\n` +
					`print(json.dumps({"modified": str(row[0][0]) if row else None,\n` +
					`                  "seeded": str(seeded[0][0]) if seeded else None}))\n`
				).trim().split("\n").pop()
			);

			expectEq(after.seeded, "1", "precondition: the seeder really did write the field back");
			expectEq(after.modified, before, "seeding did NOT bump `modified` and strand the open form");

			// And the form it was open in can still save.
			await page.evaluate(() => window.cur_frm.set_value("tagline", "smoke-seed-" + Date.now()));
			await page.keyboard.press("Control+s");
			// Autosave may already be saving this, and Ctrl+S then defers to it,
			// so "clean within a budget" is the honest question — not "clean
			// after exactly three seconds".
			let saved = true;
			try {
				await page.waitForFunction(() => !window.cur_frm.is_dirty(), { timeout: 15000 });
			} catch (e) {
				saved = false;
			}
			const dialog = await page.evaluate(() => {
				const m = document.querySelector(".modal.show .modal-body, .msgprint");
				return m ? m.textContent.trim().replace(/\s+/g, " ").slice(0, 160) : "";
			});
			expect(!/modified after/i.test(dialog), `save after a seed: ${dialog}`);
			expect(saved, "and it actually saved");
		});

		await test("settings: a click applies, with no Save", async () => {
			// THE CLAIM: touching a control persists it. Not previews it —
			// persists it. Proven the only way that means anything: change it,
			// RELOAD THE PAGE without saving, and read it back from the server.
			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			const start = getSettings(["crumb_separator"]).crumb_separator;
			const want = start === "Chevron" ? "Dot" : "Chevron";

			await page.evaluate(() => {
				// The breadcrumbs entry, so the picker under test is on screen.
				const item = [...document.querySelectorAll(".bnd-shell-item")].find(
					(n) => n.getAttribute("data-key") === "crumbs"
				);
				if (item) item.click();
			});
			await page.waitForTimeout(800);
			await page.click(`[data-field="crumb_separator"][data-value="${want}"]`);
			// Long enough for a debounced save to fire and land, and no longer.
			await page.waitForTimeout(3000);

			expectEq(getSettings(["crumb_separator"]).crumb_separator, want, "the click reached the database");

			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			expectEq(
				await page.evaluate(() => String(window.cur_frm.doc.crumb_separator)),
				want,
				"and survives a reload, so nothing was waiting on a Save"
			);
			expect(
				!(await page.evaluate(() => window.cur_frm.is_dirty())),
				"the form does not sit dirty afterwards"
			);
			setSettings({ crumb_separator: start });
		});

		await test("settings: a container applies to the desk on click, with no reload", async () => {
			// THE GAP CLICK-TO-APPLY EXPOSED. Every style kit — sidebar,
			// breadcrumbs, palette, inbox — re-applies to the live desk the
			// moment it is touched. The five CONTAINERS did not: they were read
			// from boot at page load and nothing re-mounted them, so a change
			// showed up only whenever the user next happened to reload.
			//
			// Survivable while saving meant pressing Save (and usually reloading
			// afterwards anyway). With autosave there is no gesture left that
			// would ever refresh it, so the setting appeared to do nothing at
			// all — reported as "the settings save but nothing is applied in
			// reality", and reproduced exactly: the value reached the database,
			// the form went clean, the desk kept its top bar through a route
			// change and lost it only on a hard reload.
			//
			// Driven from the CONTROL, not from `setSettings`: the whole failure
			// lives between the click and the desk, which a server-side write
			// jumps straight over. That is why the suite was green throughout.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar" });
			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			expect(await q(".bnd-topbar"), "precondition: the desk has a top bar");

			const toggle = async () => {
				await page.evaluate(() => {
					const cb = document.querySelector(
						'.frappe-control[data-fieldname="topbar_enabled"] input[type="checkbox"]'
					);
					if (cb) cb.click();
				});
				await page.waitForTimeout(2500);
			};

			await page.evaluate(() => {
				const item = [...document.querySelectorAll(".bnd-shell-item")].find(
					(n) => n.getAttribute("data-key") === "topbar"
				);
				if (item) item.click();
			});
			await page.waitForTimeout(700);

			await toggle();
			expectEq(await q(".bnd-topbar"), false, "the top bar goes on the click, with no reload");
			await toggle();
			expect(await q(".bnd-topbar"), "and comes back — a one-way apply is half a feature");

			// THE THING THAT MUST NOT BREAK. Tearing a container down takes its
			// tenants with it, and a token left claimed would hide Frappe's own
			// affordance with nothing in its place — the defect class this
			// project has already paid for twice.
			const stranded = await page.evaluate(() => {
				const owned = new Set(
					(document.documentElement.getAttribute("data-bnd-own") || "").split(/\s+/).filter(Boolean)
				);
				const vis = (sel) => {
					const el = sel && document.querySelector(sel);
					if (!el) return false;
					const r = el.getBoundingClientRect();
					return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
				};
				return [
					["bell", ".bnd-bell", ".body-sidebar .sidebar-notification"],
					["user", ".bnd-avatar-btn", ".body-sidebar .sidebar-user-button"],
				]
					.filter(([token, ours, native]) => (owned.has(token) ? !vis(ours) : !vis(native)))
					.map(([token]) => token);
			});
			expectEq(stranded.length, 0, `claimed but absent, or released but hidden: ${stranded.join(",")}`);
		});

		await test("settings: a concurrent write is merged, not clobbered", async () => {
			// THE DEFECT THIS ENCODES, found 2026-08-08 and present in shipped
			// code: saving a Frappe SINGLE writes the WHOLE document.
			// `Document.update_single` deletes every tabSingles row and
			// re-inserts them, so one click on Theme Settings rewrites every
			// field — including ones something else changed a moment earlier.
			//
			// Two harms, both silent. Either the other writer's change
			// disappears, or the two collide and MySQL raises 1020 ("Record has
			// changed since last read... try restarting transaction"), which
			// Frappe returns as a 417 and the click vanishes instead. Four such
			// conflicts in a single hour of suite runs — and it is why full runs
			// gave 20/15/12/9/28/12 failures with a DIFFERENT set every time: a
			// race, losing somewhere new on each pass, on the pushed commit as
			// well as on the working tree.
			//
			// The contract: what THIS edit touched wins; everything else the
			// other writer stored survives it.
			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			const start = getSettings(["crumb_separator", "tagline"]);
			const wantSep = start.crumb_separator === "Chevron" ? "Dot" : "Chevron";
			const wantTag = "concurrent-" + Date.now();

			await page.evaluate(() => {
				const it = [...document.querySelectorAll(".bnd-shell-item")].find(
					(n) => n.getAttribute("data-key") === "crumbs"
				);
				if (it) it.click();
			});
			await page.waitForTimeout(700);

			// Somebody else writes a DIFFERENT field while the form is open — a
			// migration, a second admin, this suite. It bumps `modified`, which
			// is what turns the form's next save into a conflict.
			setSettings({ tagline: wantTag });

			// Now the user clicks. The form's document is already stale.
			await page.evaluate((v) => {
				const o = document.querySelector(`[data-field="crumb_separator"][data-value="${v}"]`);
				if (o) o.click();
			}, wantSep);
			await page.waitForTimeout(7000);

			const after = getSettings(["crumb_separator", "tagline"]);
			expectEq(after.crumb_separator, wantSep, "the click landed");
			expectEq(after.tagline, wantTag, "and the other writer's field survived it");

			setSettings({ crumb_separator: start.crumb_separator, tagline: start.tagline || "" });
		});

		await test("settings: rapid clicks all land, and none is lost", async () => {
			// Autosave without serialisation is worse than no autosave: two
			// saves in flight means the second carries the first's stale
			// `modified` and dies — the very error this session just fixed at
			// the seeding end. Clicking faster than saves complete must still
			// leave the LAST choice stored.
			await goDesk("/desk/theme-settings", ".bnd-shell", 4000);
			await page.evaluate(() => {
				const item = [...document.querySelectorAll(".bnd-shell-item")].find(
					(n) => n.getAttribute("data-key") === "crumbs"
				);
				if (item) item.click();
			});
			await page.waitForTimeout(800);

			for (const v of ["Dot", "Arrow", "Slash", "Chevron"]) {
				await page.click(`[data-field="crumb_separator"][data-value="${v}"]`);
				await page.waitForTimeout(120); // faster than any save can finish
			}
			await page.waitForTimeout(5000);

			expectEq(getSettings(["crumb_separator"]).crumb_separator, "Chevron", "the last click is what is stored");
			const dialog = await page.evaluate(() => {
				const m = document.querySelector(".modal.show .modal-body, .msgprint");
				return m ? m.textContent.trim().replace(/\s+/g, " ").slice(0, 160) : "";
			});
			expect(!/modified after/i.test(dialog), `no conflict from overlapping saves: ${dialog}`);
			expect(!(await page.evaluate(() => window.cur_frm.is_dirty())), "and nothing is left unsaved");
		});

		// ── Live preview ───────────────────────────────────────────────────
		await test("live preview: pane color flips instantly, and stays", async () => {
			// NAVIGATES EXPLICITLY. It used to inherit whatever page the test
			// before it had left open, which happened to be `?shell=0` — so the
			// sidebar picker was on screen and clickable by luck of ordering.
			// Inserting any test in front of it broke it: on the shell the same
			// button exists but sits in an unselected detail pane, and Playwright
			// waited 30s for something it could never click. A test that depends
			// on its predecessor's navigation is a landmine for whoever adds the
			// next one, so this states what it needs.
			await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-presets", 2500);
			const before = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			await page.click('.bnd-sbp-opt[data-field="sidebar_color"][data-value="Minimal"]');
			await page.waitForTimeout(700);
			const after = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			expect(before !== after, "background changed live");

			// THE SECOND HALF USED TO BE "discard reverts the desk", and that
			// premise is gone on purpose: since autosave, a click IS the change,
			// so there is nothing to discard and reload_doc() reloads the value
			// that was already stored. Asserting the old behaviour would be
			// asserting that autosave does not work.
			//
			// What survives is the half that still means something, and it is
			// the stronger claim anyway: reload from the SERVER and the desk
			// still shows it. Preview and persistence are the same act now.
			// WAIT FOR THE SAVE, THEN RELOAD. Autosave is debounced and can
			// retry, so a fixed pause can reload BEFORE the click has landed —
			// and the reload then reverts the very preview just asserted, which
			// reads as "the preview did not stick". Ask the form instead.
			await page.waitForFunction(() => !window.cur_frm.is_dirty(), { timeout: 15000 });
			await page.evaluate(() => window.cur_frm.reload_doc());
			await page.waitForTimeout(2500);
			const reloaded = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			expectEq(reloaded, after, "and a reload from the server shows the same desk");
			setSettings({ sidebar_color: "Dark Contrast" });
		});

		// ── Placement: bell and user menu are their own components ─────────
		await test("placement: the bell and the avatar can be separated", async () => {
			// The whole point of splitting build_cluster: these two were one
			// DOM node with four call sites, so they could never be apart.
			setSettings({ desk_layout: "Top Bar", inbox_placement: "Side Pane End", user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 4500);
			const where = await page.evaluate(() => ({
				bellInSidebar: !!document.querySelector(".body-sidebar .bnd-bell"),
				bellInTopbar: !!document.querySelector(".bnd-topbar .bnd-bell"),
				userInTopbar: !!document.querySelector(".bnd-topbar .bnd-avatar-btn"),
			}));
			expect(where.bellInSidebar, `bell moved to the side pane (${JSON.stringify(where)})`);
			expect(!where.bellInTopbar, "and is not left behind in the top bar");
			expect(where.userInTopbar, "while the avatar stays where it was asked to be");
		});

		await test("placement: Off removes ours and gives ERPNext its own back", async () => {
			setSettings({ desk_layout: "Top Bar", inbox_placement: "Off", user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 4500);
			const state = await page.evaluate(() => {
				const vis = (sel) => {
					const el = document.querySelector(sel);
					if (!el) return false;
					const r = el.getBoundingClientRect();
					return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
				};
				return {
					own: document.documentElement.getAttribute("data-bnd-own") || "",
					ours: !!document.querySelector(".bnd-bell"),
					native: vis(".body-sidebar .sidebar-notification"),
				};
			});
			expect(!state.ours, "our bell is gone");
			expect(!/\bbell\b/.test(state.own), "and the token is released");
			expect(state.native, "so ERPNext's own bell is visible again");
			setSettings({ inbox_placement: "Top Bar End" });
		});

		await test("placement: exactly one of each, wherever it was placed", async () => {
			// THE BUG THE CONTAINER SPLIT CREATED, measured 2026-08-07 with every
			// container on: asking for the bell in the Top Bar produced THREE
			// bells — top bar, page header and dock — because each container's
			// `mount_cluster` built its own bell and avatar. That was safe while
			// exactly one container mounted per layout. It stopped being safe the
			// moment containers became independent, and `mount_placed_tenants`
			// could not clean up after it because it looked at `querySelector`,
			// the FIRST match, and there were now three.
			//
			// So the claim is not "it is in the top bar" — that passed while
			// three existed. It is EXACTLY ONE, and in the right place.
			const ALL_ON = {
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				topbar_enabled: 1, pagehead_enabled: 1, bottombar_enabled: 1,
				sidebar_enabled: 1, dock_enabled: 1,
			};
			const count = (part) =>
				page.evaluate((p) => {
					const all = [...document.querySelectorAll(`[data-bnd-part="${p}"]`)];
					const vis = (n) => {
						const r = n.getBoundingClientRect();
						return getComputedStyle(n).display !== "none" && r.width > 0 && r.height > 0;
					};
					const shown = all.filter(vis);
					const host = (n) =>
						n.closest(".bnd-topbar") ? "topbar"
						: n.closest(".bnd-statusbar") ? "bottombar"
						: n.closest(".bnd-dock") ? "dock"
						: n.closest(".page-head") ? "pagehead"
						: n.closest(".body-sidebar") ? "sidepane"
						: "?";
					return { n: shown.length, at: shown.map(host) };
				}, part);

			for (const [where, host] of [
				["Top Bar End", "topbar"],
				["Bottom Bar End", "bottombar"],
				["Page Header End", "pagehead"],
				["Dock End", "dock"],
				["Side Pane End", "sidepane"],
			]) {
				setSettings({ ...ALL_ON, inbox_placement: where, user_placement: where });
				await goDesk("/desk/item", ".page-head", 4500);
				for (const part of ["bell", "user"]) {
					const got = await count(part);
					expectEq(got.n, 1, `${part} at "${where}": one only, found ${got.n} at ${got.at.join("+")}`);
					expectEq(got.at[0], host, `${part} at "${where}" is in the ${host}`);
				}
			}

			// And "Off" means none of ours anywhere — not "one fewer than before".
			setSettings({ ...ALL_ON, inbox_placement: "Off", user_placement: "Off" });
			await goDesk("/desk/item", ".page-head", 4500);
			for (const part of ["bell", "user"]) {
				expectEq((await count(part)).n, 0, `${part} switched off leaves none of ours`);
			}
			const natives = await page.evaluate(() => {
				const vis = (s) => {
					const n = document.querySelector(s);
					if (!n) return false;
					const r = n.getBoundingClientRect();
					return getComputedStyle(n).display !== "none" && r.width > 0 && r.height > 0;
				};
				return {
					bell: vis(".body-sidebar .sidebar-notification"),
					user: vis(".body-sidebar .sidebar-user-button"),
				};
			});
			expect(natives.bell && natives.user, "and Frappe's own are visible instead");
		});

		await test("slots: every component offers the same vocabulary", async () => {
			// E1. Before this, each component spelled the same wall differently —
			// search said "Sidebar Top", the bell said "Side Pane", and Home said
			// "Sidebar Top" again but meant a different thing. And no component
			// except search could say WHERE in a region it sat, which is what
			// made "put the bell on the left" unaskable.
			//
			// The field options are read from `registry.slots_for` rather than
			// compared against a list here: a list would be the second copy, and
			// the second copy is how "Dock" got onto a field whose runtime
			// dropped it in the sidebar.
			const reg = JSON.parse(
				benchPy(
					"from bunood_theme.registry import slots_for, COMPONENTS\n" +
					"print(json.dumps({c['key']: slots_for(c['key']) for c in COMPONENTS if c['type'] == 'tenant'}))\n"
				).trim().split("\n").pop()
			);
			const FIELD = {
				search: "search_placement", inbox: "inbox_placement", user: "user_placement",
				home: "home_placement", apps: "apps_placement",
			};
			for (const [key, field] of Object.entries(FIELD)) {
				const opts = JSON.parse(
					benchPy(
						`print(json.dumps(frappe.get_meta("Theme Settings").get_field("${field}").options.split("\\n")))\n`
					).trim().split("\n").pop()
				).filter(Boolean);
				expectEq(
					JSON.stringify(opts),
					JSON.stringify(reg[key]),
					`${field} offers exactly what the registry says`
				);
			}
			// Search is the one tenant with no "Off" — a desk nobody can search
			// is not a configuration this theme offers.
			expect(!reg.search.includes("Off"), "search has no Off");
			for (const k of ["inbox", "user", "home", "apps"]) {
				expect(reg[k].includes("Off"), `${k} can be switched off`);
			}
		});

		await test("board: the desk is the form — pick, drop, and it saves", async () => {
			// E2. One board, every control shown where it is, moved by pointing
			// at where it should be. Asserted through the same two gestures a
			// user has: click-to-pick/click-to-drop here, and the drag path in
			// the next test — both end in the same drop_on, but each half's
			// EVENTS can break independently, so each is exercised.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				topbar_enabled: 1,
				bottombar_enabled: 1,
				inbox_placement: "Top Bar End",
				user_placement: "Top Bar End",
			});
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });

			// One chip per tenant, each in the zone its field says.
			const shape = await page.evaluate(() => {
				const bd = document.querySelector(".bnd-bd");
				const chip = bd.querySelector('.bnd-bd-chip[data-tenant="inbox"]');
				return {
					chips: bd.querySelectorAll(".bnd-bd-chip").length,
					bellIn: chip && chip.closest(".bnd-bd-zone").getAttribute("data-slot"),
					zoneH: Math.round(
						bd.querySelector('.bnd-bd-zone[data-slot="Top Bar End"]').getBoundingClientRect().height
					),
				};
			});
			expectEq(shape.chips, 5, "one chip per tenant");
			expectEq(shape.bellIn, "Top Bar End", "the bell chip sits where its field says");
			// A drop target has to be bigger than a pointer. The old thumbnails'
			// slots were ~20px tall, which is what "needs to be bigger" meant.
			expect(shape.zoneH >= 48, `a zone is a real drop target (${shape.zoneH}px tall)`);

			// Pick, drop — the value lands and SAVES, because click-to-apply is
			// the contract of this form since the autosave slice.
			await page.click('.bnd-bd-chip[data-tenant="inbox"]');
			await page.click('.bnd-bd-zone[data-slot="Bottom Bar Start"]');
			// SAVED, not merely set: click-to-apply is this form's contract, so
			// the assertion is against the database, polled — never sampled.
			await page.waitForFunction(() => !window.cur_frm.is_dirty(), { timeout: 15000 });
			expectEq(
				getSettings(["inbox_placement"]).inbox_placement,
				"Bottom Bar Start",
				"the drop wrote and saved inbox_placement"
			);

			// The board re-renders from the saved document: the chip MOVED.
			await page.waitForFunction(
				() => {
					const c = document.querySelector('.bnd-bd-chip[data-tenant="inbox"]');
					const z = c && c.closest(".bnd-bd-zone");
					return z && z.getAttribute("data-slot") === "Bottom Bar Start";
				},
				{ timeout: 8000 }
			);
		});

		await test("board: an illegal zone refuses the drop", async () => {
			// Search has no Off and no page-header slug — the board must refuse
			// those, not accept them and let the runtime fall back silently.
			// This is the board's half of the "nothing ships a value the field
			// will not accept" contract: the OTHER half checks what the code
			// writes, this half checks what a user can ask for.
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });
			const refused = await page.evaluate(() => {
				const bd = document.querySelector(".bnd-bd");
				bd.querySelector('.bnd-bd-chip[data-tenant="search"]').click();
				const no = Array.from(bd.querySelectorAll(".bnd-bd-zone.bnd-bd-no")).map((z) =>
					z.getAttribute("data-slot")
				);
				// Try the illegal drop anyway — the guard is drop_on, not the class.
				const before = cur_frm.doc.search_placement;
				const off = bd.querySelector('.bnd-bd-zone[data-slot="Off"]');
				if (off) off.click();
				bd.querySelector('.bnd-bd-chip[data-tenant="search"]').click(); // disarm if still armed
				return { no: no.sort(), before, after: cur_frm.doc.search_placement };
			});
			expect(refused.no.includes("Off"), "search cannot be dropped on Off");
			expect(
				refused.no.includes("Page Header Start"),
				"search cannot be dropped on a zone it has no slug for"
			);
			expectEq(refused.after, refused.before, "the refused drop wrote nothing");
		});

		await test("board: the drag gesture lands in the same place", async () => {
			// The HTML5 drag path, synthetically: dragstart arms, dragover on a
			// legal zone accepts, drop writes. Synthetic because Playwright's
			// mouse-move drag does not produce HTML5 drag events reliably in
			// headless — and the HANDLERS are what this test owns; the browser's
			// own gesture recognition is not ours to test.
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });
			const result = await page.evaluate(() => {
				const bd = document.querySelector(".bnd-bd");
				const chip = bd.querySelector('.bnd-bd-chip[data-tenant="inbox"]');
				const zone = bd.querySelector('.bnd-bd-zone[data-slot="Top Bar End"]');
				const dt = new DataTransfer();
				chip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
				const armed = bd.getAttribute("data-armed");
				const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
				zone.dispatchEvent(over);
				const accepted = over.defaultPrevented;
				zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
				chip.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
				return { armed, accepted };
			});
			expectEq(result.armed, "inbox_placement", "dragstart arms the board");
			expect(result.accepted, "dragover on a legal zone accepts");
			await page.waitForFunction(() => !window.cur_frm.is_dirty(), { timeout: 15000 });
			expectEq(
				getSettings(["inbox_placement"]).inbox_placement,
				"Top Bar End",
				"the drag-drop wrote and saved inbox_placement"
			);
		});

		// ── E3: order within a zone ────────────────────────────────────────
		await test("order: two tenants in one zone follow desk_order, and flip when it flips", async () => {
			// The claim: sharing a zone is not a coin toss. Before E3 the DOM
			// order was the mount array's order — the bell always led the user
			// menu, and nothing a user did could change it. Asserted as
			// POSITION and as a TRANSITION, the same two rules every placement
			// test follows: a single static pass cannot tell "ordered" from
			// "happened to mount that way".
			const ALL_ON = {
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, inbox_placement: "Top Bar End", user_placement: "Top Bar End",
			};
			const at = (part) =>
				page.evaluate((p) => {
					const el = document.querySelector(`[data-bnd-part="${p}"]`);
					if (!el) return null;
					const r = el.getBoundingClientRect();
					return Math.round(r.left + r.width / 2);
				}, part);

			setSettings({ ...ALL_ON, desk_order: "search,inbox,user,home,apps" });
			await goDesk("/desk/item", ".page-head", 4000);
			let bell = await at("bell"), user = await at("user");
			expect(bell !== null && user !== null, "both tenants mounted in the end zone");
			expect(bell < user, `default order: bell before user (${bell} < ${user})`);

			setSettings({ ...ALL_ON, desk_order: "search,user,inbox,home,apps" });
			await goDesk("/desk/item", ".page-head", 4000);
			bell = await at("bell"); user = await at("user");
			expect(user < bell, `flipped order: user before bell (${user} < ${bell})`);
		});

		await test("order: quick links share the zone system, and order among the tenants", async () => {
			// Home and All Apps used to mount at the bar's literal firstChild
			// while the bell used the cluster's start ZONE — one visual place,
			// two containers, and no order between them was expressible. E3
			// unifies the links into the zone, so this asserts all three
			// tenants in ONE zone holding a chosen order across a flip.
			const state = {
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1,
				inbox_placement: "Top Bar Start", home_placement: "Top Bar Start",
				apps_placement: "Top Bar Start", user_placement: "Top Bar End",
			};
			const xs = () =>
				page.evaluate(() =>
					Object.fromEntries(
						["bell", "home", "apps"].map((p) => {
							const el = document.querySelector(`[data-bnd-part="${p}"]`);
							return [p, el ? Math.round(el.getBoundingClientRect().left) : null];
						})
					)
				);

			setSettings({ ...state, desk_order: "search,inbox,user,home,apps" });
			await goDesk("/desk/item", ".page-head", 4000);
			let m = await xs();
			expect(m.bell !== null && m.home !== null && m.apps !== null, "all three mounted");
			expect(m.bell < m.home && m.home < m.apps, `bell, home, apps in order (${m.bell}, ${m.home}, ${m.apps})`);

			setSettings({ ...state, desk_order: "search,home,apps,inbox,user" });
			await goDesk("/desk/item", ".page-head", 4000);
			m = await xs();
			expect(m.home < m.apps && m.apps < m.bell, `links precede the bell after the flip (${m.home}, ${m.apps}, ${m.bell})`);
		});

		await test("order: the board writes it — a drop before a chip lands before it", async () => {
			// The board's within-zone drop position IS the order control; there
			// is no other. Synthetic drag for the same reason the E2 drag test
			// is synthetic: the handlers are ours, the browser's gesture
			// recognition is not.
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1,
				inbox_placement: "Top Bar End", user_placement: "Top Bar End",
				desk_order: "search,inbox,user,home,apps",
			});
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });
			await page.evaluate(() => {
				const bd = document.querySelector(".bnd-bd");
				const user = bd.querySelector('.bnd-bd-chip[data-tenant="user"]');
				const zone = bd.querySelector('.bnd-bd-zone[data-slot="Top Bar End"]');
				const bell = zone.querySelector('.bnd-bd-chip[data-tenant="inbox"]');
				const dt = new DataTransfer();
				user.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
				// Drop ON the bell chip: "before the chip I was dropped on".
				const r = bell.getBoundingClientRect();
				const drop = new DragEvent("drop", {
					bubbles: true, cancelable: true, dataTransfer: dt,
					clientX: r.left + 2, clientY: r.top + 2,
				});
				bell.dispatchEvent(drop);
				user.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
			});
			await page.waitForFunction(() => !window.cur_frm.is_dirty(), { timeout: 15000 });
			const order = getSettings(["desk_order"]).desk_order;
			expect(
				order.indexOf("user") < order.indexOf("inbox"),
				`user precedes inbox in desk_order after the drop (${order})`
			);
		});

		await test("slots: nothing ships a value the field will not accept", async () => {
			// THE CHECK THAT WAS MISSING, and its absence cost a whole suite run.
			// The vocabulary test above pins the FIELD OPTIONS to the registry.
			// Nothing pinned the values this app WRITES into those fields, so
			// `LAYOUT_TENANTS` kept the old region-only vocabulary through E1 —
			// picking any layout would have written "Top Bar" into a field that
			// now offers "Top Bar End".
			//
			// And an illegal value is not a local failure. Theme Settings is a
			// Single: Frappe validates every Select on save, so one bad value
			// fails validation for the WHOLE document and every later write of
			// every OTHER setting fails with it. Measured 2026-08-08 — the bench
			// held `inbox_placement = "Side Pane Center"` and six checks that
			// never touch placement went red, none of them naming the reason.
			//
			// Both writers are checked here because both are writers: the layout
			// presets, and the shipped defaults the seeder fills empty fields
			// from. `heal_unknown_placements` repairs a site that already holds
			// one; this is what stops us shipping the next one.
			const bad = JSON.parse(
				benchPy(
					"from bunood_theme.registry import slots_for, COMPONENTS, TENANT, LAYOUT_TENANTS\n" +
					"from bunood_theme.setup import SHIPPED\n" +
					"legal = {c['key'] + '_placement': slots_for(c['key']) for c in COMPONENTS if c['type'] == TENANT}\n" +
					"bad = []\n" +
					"for layout, values in LAYOUT_TENANTS.items():\n" +
					"    for field, value in values.items():\n" +
					"        if field in legal and value not in legal[field]:\n" +
					"            bad.append('layout ' + layout + ': ' + field + ' = ' + repr(value))\n" +
					"for field, options in legal.items():\n" +
					"    if field in SHIPPED and SHIPPED[field] not in options:\n" +
					"        bad.append('shipped default: ' + field + ' = ' + repr(SHIPPED[field]))\n" +
					"print(json.dumps(bad))\n"
				).trim().split("\n").pop()
			);
			expectEq(bad.join(" | "), "", "every written placement is one the field offers");

			// E3's order default is pinned the same way: the doctype's literal
			// must equal what the registry derives, or a tenant added to the
			// table would ship ranked by a stale string.
			const orderPin = JSON.parse(
				benchPy(
					"from bunood_theme.registry import default_desk_order\n" +
					"stored = frappe.get_meta('Theme Settings').get_field('desk_order').default\n" +
					"print(json.dumps({'registry': default_desk_order(), 'doctype': stored}))\n"
				).trim().split("\n").pop()
			);
			expectEq(orderPin.doctype, orderPin.registry, "desk_order's default is the registry's");

			// Belt and braces on the live site: whatever it is holding RIGHT NOW
			// must be acceptable too, or the next save of any setting dies. This
			// catches a bench poisoned by an earlier test in this very run, which
			// is how the value above got there.
			const stored = JSON.parse(
				benchPy(
					"from bunood_theme.registry import slots_for, COMPONENTS, TENANT\n" +
					"doc = frappe.get_single('Theme Settings')\n" +
					"bad = [c['key'] + '_placement=' + repr(doc.get(c['key'] + '_placement'))\n" +
					"       for c in COMPONENTS if c['type'] == TENANT\n" +
					"       and doc.get(c['key'] + '_placement') not in slots_for(c['key'])]\n" +
					"print(json.dumps(bad))\n"
				).trim().split("\n").pop()
			);
			expectEq(stored.join(" | "), "", "the site holds no placement its field rejects");
		});

		await test("slots: every zone a region offers is a different place", async () => {
			// The claim the whole slot vocabulary exists for. Asserted as
			// POSITION, not as "it mounted": the old "Top Bar Edge" and
			// "Sidebar Top"/"Sidebar Bottom" both mounted fine and landed in the
			// same pixel, which is how the sidebar pair went unnoticed —
			// measured 2026-08-07, y 228 for both.
			const ALL_ON = {
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, bottombar_enabled: 1, sidebar_enabled: 1,
				pagehead_enabled: 0, dock_enabled: 0,
			};
			const at = (part) =>
				page.evaluate((p) => {
					const el = document.querySelector(`[data-bnd-part="${p}"]`);
					if (!el) return null;
					const r = el.getBoundingClientRect();
					return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
				}, part);

			// A bar runs along the inline axis: start / centre / end must differ in x.
			const bar = {};
			for (const zone of ["Start", "Center", "End"]) {
				setSettings({ ...ALL_ON, inbox_placement: `Top Bar ${zone}` });
				await goDesk("/desk/item", ".page-head", 4000);
				bar[zone] = await at("bell");
				expect(bar[zone], `the bell mounted for "Top Bar ${zone}"`);
			}
			expect(bar.Start.x < bar.Center.x, `start is before centre (${bar.Start.x} < ${bar.Center.x})`);
			expect(bar.Center.x < bar.End.x, `centre is before end (${bar.Center.x} < ${bar.End.x})`);

			// The side pane is a column and offers TWO zones, not three — see
			// registry.ZONES_BY_REGION. Its content fills the column, so a
			// centre could not be made to land anywhere the end did not, and a
			// choice that cannot differ is one this vocabulary exists to delete.
			const pane = {};
			for (const zone of ["Start", "End"]) {
				setSettings({ ...ALL_ON, inbox_placement: `Side Pane ${zone}` });
				await goDesk("/desk/item", ".page-head", 4000);
				pane[zone] = await at("bell");
				expect(pane[zone], `the bell mounted for "Side Pane ${zone}"`);
			}
			expect(pane.Start.y < pane.End.y, `top is above bottom (${pane.Start.y} < ${pane.End.y})`);
		});

		// ── Honest pickers ─────────────────────────────────────────────────
		//
		// A control is DISHONEST when it offers something that does not happen,
		// or stays silent while nothing it offers can happen. `bnd_region_blocker`
		// has covered placement since slice 1c step 3; the rest was unaudited,
		// and these are what the audit found.
		await test("honest: Home and All Apps land where they are placed", async () => {
			// `home_placement` and `apps_placement` had NO coverage at all,
			// which is how "Dock" survived: the field offers it, registry.py
			// says both components may occupy the dock, and `sb_mount_utils`
			// handled Off / Top Bar / Bottom Bar / Sidebar Top / Sidebar Bottom
			// and let everything else fall through to the sidebar. So choosing
			// "Dock" moved the link to the side pane and said nothing.
			//
			// Every region the field offers is walked, so the next one added
			// cannot quietly do the same.
			for (const [where, host] of [
				["Top Bar Start", ".bnd-topbar"],
				["Bottom Bar Start", ".bnd-statusbar"],
				["Dock Start", ".bnd-dock"],
			]) {
				setSettings({
					...CHROME_DEFAULTS,
					desk_layout: "Top Bar",
					topbar_enabled: 1,
					bottombar_enabled: 1,
					dock_enabled: 1,
					home_placement: where,
					apps_placement: "Side Pane Start",
				});
				await goDesk("/desk/item", ".page-head", 4500);
				// BY IDENTITY: in a bar the link is `.bnd-icon-btn.bnd-sb-util`, in
				// the pane it is `.bnd-sb-item`. Asking by class would measure
				// one of the two forms and call the other a failure.
				expect(
					await q(`${host} [data-bnd-part="home"]`),
					`Home placed at "${where}" is inside ${host}`
				);
			}
		});

		await test("honest: a link placed in a bar does not need the side pane", async () => {
			// `sb_mount_utils` is only reached through `mount_sidebar_kit`,
			// which returns early when the pane is hidden — so Home placed in
			// the TOP BAR mounted nowhere at all unless an unrelated container
			// happened to be on. Newly reachable the day the side pane got its
			// own switch, and exactly the shape of coupling the split exists to
			// remove: one setting silently requiring another.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				topbar_enabled: 1,
				sidebar_enabled: 0,
				home_placement: "Top Bar Start",
				apps_placement: "Top Bar Start",
			});
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await q('.bnd-topbar [data-bnd-part="home"]'), "Home is in the top bar with no side pane");
		});

		await test("honest: a picker says so when its own container is off", async () => {
			// The counterpart to `bnd_region_blocker`. That answers "can a tenant
			// go here"; nothing answered "does any of this matter right now".
			// The container split created the gap: switch the side pane off and
			// all 22 sidebar style options are inert, switch the bottom bar off
			// and every status option is. Both kept offering themselves.
			//
			// The status picker had a reason string for exactly this and it had
			// gone dead: it read `status_style === "Off"`, an option removed in
			// slice 2c-4, so the condition could never be true again.
			await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-presets", 3000);

			for (const [field, value, picker, want] of [
				["sidebar_enabled", 0, "sidebar_picker", /side pane/i],
				["bottombar_enabled", 0, "status_picker", /bottom bar/i],
			]) {
				setSettings({ ...CHROME_DEFAULTS, [field]: value });
				await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-presets", 3000);
				const note = await page.evaluate(
					(p) => {
						const host = document.querySelector(`[data-fieldname="${p}"]`);
						return host ? host.textContent.replace(/\s+/g, " ") : "";
					},
					picker
				);
				expect(want.test(note), `${picker} explains that the container is off — got: ${note.slice(0, 160)}`);
			}
			setSettings({ ...CHROME_DEFAULTS });
		});

		await test("placement: a region this desk lacks changes nothing", async () => {
			// The shipped default is Top Bar, and this desk has no top bar.
			// "Cannot honour" must not mean "delete" — that is the failure the
			// whole rework exists to remove, and it would arrive via upgrade.
			//
			// What "leave it alone" LEAVES has changed, and deliberately. The
			// bottom bar used to build a bell and an avatar unconditionally
			// (`global_variant`), so an unhonourable placement left them sitting
			// in that bar — a second answer to a question `inbox_placement`
			// already owned. The bar reserves an empty slot now, so what is left
			// alone is Frappe's own affordance, unclaimed and visible. Same
			// protection, one fewer place for it to live.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Bottom Bar",
				topbar_enabled: 0,
				inbox_placement: "Top Bar End",
				user_placement: "Top Bar End",
			});
			await goDesk("/desk/item", ".page-head", 4500);
			const state = await page.evaluate(() => {
				const vis = (sel) => {
					const el = document.querySelector(sel);
					if (!el) return false;
					const r = el.getBoundingClientRect();
					return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
				};
				const own = document.documentElement.getAttribute("data-bnd-own") || "";
				return {
					claimedBell: /bell/.test(own),
					claimedUser: /user/.test(own),
					nativeBell: vis(".body-sidebar .sidebar-notification"),
					nativeUser: vis(".body-sidebar .sidebar-user-button"),
				};
			});
			expect(!state.claimedBell && !state.claimedUser, `nothing is claimed (${JSON.stringify(state)})`);
			expect(state.nativeBell && state.nativeUser, "so ERPNext's own are left visible");
		});

		// ── The container split (slice 2c) ─────────────────────────────────
		//
		// THE ONE CLAIM: a container mounts because its OWN setting says so,
		// not because of the layout. Both directions have to be asserted,
		// because each fails in a different place — the first would pass on a
		// runtime that still reads `desk_layout` if the layout happened to be
		// Top Bar, and the second would pass on a runtime that mounts nothing
		// at all. Together they pin the setting as the thing that decides.
		//
		// These are deliberately narrow. Whether the desk remains USABLE in
		// these configurations is the invariant matrix's job, and the two
		// states below are added to it for exactly that reason.
		await test("container: the top bar mounts in a layout that never had one", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Classic", topbar_enabled: 1 });
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await visible(".bnd-topbar"), "a top bar on a Classic desk");
		});

		await test("container: the Top Bar layout with the top bar switched off has none", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 0 });
			await goDesk("/desk/item", ".page-head", 4500);
			expectEq(await q(".bnd-topbar"), false, "no top bar once it is switched off");
		});

		await test("container: the page-head cluster mounts in a layout that never had one", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", pagehead_enabled: 1 });
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await visible(".page-head .bnd-cluster"), "a page-head cluster on a Top Bar desk");
		});

		await test("container: the page-head cluster survives a route change, and stops when off", async () => {
			// The page head is REBUILT per page — Frappe swaps the element out
			// from under us — so this container is the only one whose mount runs
			// again on every route change. Both directions have to hold across a
			// navigation, not just on first paint: an "off" that only takes
			// effect until you click something is not off.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Compact", pagehead_enabled: 0 });
			await goDesk("/desk/item", ".page-head", 4500);
			expectEq(await q(".page-head .bnd-cluster"), false, "no cluster once it is switched off");
			await page.evaluate(() => window.frappe.set_route("List", "Sales Invoice"));
			await page.waitForTimeout(3000);
			expectEq(await q(".page-head .bnd-cluster"), false, "and still none after a route change");
		});

		await test("container: a dock and a side pane coexist when both are on", async () => {
			// CONTAINERS ARE INDEPENDENT, and this is the claim that says so.
			// "Dock" used to mean "dock, and therefore no side pane" — one
			// layout, two facts, no way to take them apart. Ask for both and you
			// get both, exactly like any other pair.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				dock_enabled: 1,
				sidebar_enabled: 1,
			});
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await visible(".bnd-dock"), "a dock");
			expect(!(await paneHidden()), "and a side pane, at the same time");
		});

		await test("container: the side pane answers for itself, not to the dock", async () => {
			// The converse, and the half that used to be impossible: no dock,
			// and no side pane either. Nothing hides the pane but its own
			// setting — so the guard has to be what keeps this desk usable, and
			// the invariant matrix walks that state.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				dock_enabled: 0,
				sidebar_enabled: 0,
			});
			await goDesk("/desk/item", ".page-head", 4500);
			expectEq(await q(".bnd-dock"), false, "no dock");
			expect(await paneHidden(), "and no side pane either");
			expect(await visible(".bnd-topbar .bnd-avatar-btn"), "the top bar still carries Log Out");
		});

		await test("container: EVERY container off is refused at the last one", async () => {
			// The configuration the split makes reachable and nothing before it
			// could express. Every container this slice has split out is off,
			// which means no route of OURS to search, notifications or Log Out —
			// and the side pane, where every stock route lives, is off too.
			//
			// Note it has to say so in full. Spreading CHROME_DEFAULTS and then
			// naming only the dock leaves `topbar_enabled: 1` underneath, a top
			// bar mounts, it carries the cluster, and the guard correctly does
			// not fire — a test that would have passed while asserting nothing
			// about the state it was named for.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Dock",
				topbar_enabled: 0,
				pagehead_enabled: 0,
				dock_enabled: 0,
				sidebar_enabled: 0,
			});
			await goDesk("/desk/item", ".page-head", 4500);
			expectEq(await q(".bnd-dock"), false, "no dock");
			expectEq(await q(".bnd-topbar"), false, "no top bar");
			expect(!(await paneHidden()), "the guard gives the side pane back rather than strand the user");
			expect(
				await visible(".body-sidebar .sidebar-user-button"),
				"so ERPNext's own user button — and Log Out — is reachable"
			);
		});

		await test("container: the guard refuses to strand a user, and only then", async () => {
			// Two directions, because a guard that always fires is not a guard.
			//
			// The pane hide is keyed on a DECLARATION rather than on a mount,
			// deliberately: the pane is Frappe's and is on screen from the first
			// paint, so keying it on anything JS stamps later means up to 150ms
			// of visible pane — the interval mount_chrome's poll waits on — and
			// then a vanish. The price of a declaration is that it can be wrong,
			// so it is checked. This drives the check directly, because the
			// state it defends against is a mount FAILURE that no setting can
			// produce.
			setSettings({
				...CHROME_DEFAULTS,
				desk_layout: "Top Bar",
				sidebar_enabled: 0,
				topbar_enabled: 1,
			});
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await paneHidden(), "precondition: the pane is off and stays off while ours is reachable");
			const held = await page.evaluate(() => window.bunood_theme.guard_critical_reach());
			expectEq(held, false, "the guard does NOT fire while the top bar carries everything");

			const released = await page.evaluate(() => {
				// Take away every route of ours, as a failed mount would.
				for (const n of document.querySelectorAll(".bnd-bell, .bnd-avatar-btn, .bnd-search-field, .bnd-search-icon")) {
					n.remove();
				}
				const fired = window.bunood_theme.guard_critical_reach();
				const el = document.querySelector(".body-sidebar-container");
				return { fired, hidden: getComputedStyle(el).display === "none" };
			});
			expect(released.fired, "and DOES fire once nothing of ours is left");
			expect(!released.hidden, "giving the side pane, and every stock affordance in it, back");
		});

		await test("container: the bottom bar mounts in a layout that writes none", async () => {
			// Classic's catalogue row says no bottom bar, so this contradicts its
			// own preset — the same shape as every other container's first check.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Classic", bottombar_enabled: 1 });
			await goDesk("/desk/item", ".page-head", 4500);
			expect(await visible(".bnd-statusbar"), "a bottom bar on a Classic desk");
		});

		await test("container: the status style no longer decides whether the bar exists", async () => {
			// `status_style: "Off"` used to mean "no bottom bar" in four layouts
			// and nothing at all in the fifth, where the strip mounted regardless
			// because it was that layout's only chrome. One fact, two places,
			// disagreeing — which is exactly how "Off" cost the Bottom Bar layout
			// its logout in 0.10.0. The option is gone; the container's own switch
			// is the only answer now, and the style is only ever about content.
			const opts = JSON.parse(
				benchPy(
					`print(json.dumps(frappe.get_meta("Theme Settings").get_field("status_style").options.split("\\n")))\n`
				).trim().split("\n").pop()
			).filter(Boolean);
			expect(!opts.includes("Off"), `status_style offers styles only: ${opts.join(", ")}`);

			// And every surviving style still leaves a bar, because existence is
			// not its job any more.
			for (const style of opts) {
				setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", status_style: style, bottombar_enabled: 1 });
				await goDesk("/desk/item", ".page-head", 4500);
				expect(await visible(".bnd-statusbar"), `style ${style} still has a bar`);
			}
		});

		await test("container: desk_layout decides nothing — it writes, then stops", async () => {
			// THE POINT OF THE WHOLE SPLIT, and the last thing it owed. Apply each
			// layout the way a user can, then read the desk back: what mounted has
			// to be what the catalogue says that layout WRITES. If any branch
			// anywhere still consulted `desk_layout` at mount time, one of these
			// five rows would disagree with its own row in the table.
			const chrome = JSON.parse(
				benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()["layout_chrome"]))\n`)
					.trim().split("\n").pop()
			);
			const SELECTOR = {
				topbar: ".bnd-topbar",
				pagehead: ".page-head .bnd-cluster",
				bottombar: ".bnd-statusbar",
				dock: ".bnd-dock",
			};
			for (const layout of ["Top Bar", "Compact", "Classic", "Bottom Bar", "Dock"]) {
				// Writing desk_layout alone applies the preset — setSettings models
				// the picker, which is the only gesture that can change it.
				setSettings({ desk_layout: layout, status_style: "Quiet", search_placement: "Top Bar Center" });
				await goDesk("/desk/item", ".page-head", 4500);
				for (const [key, sel] of Object.entries(SELECTOR)) {
					expectEq(
						await q(sel),
						!!chrome[layout][key],
						`${layout}: ${key} present, catalogue says ${chrome[layout][key]}`
					);
				}
				expectEq(
					await paneHidden(),
					!chrome[layout].sidepane,
					`${layout}: side pane hidden, catalogue says sidepane ${chrome[layout].sidepane}`
				);
			}
		});

		await test("container: the layout preset writes the containers and then stops deciding", async () => {
			// The catalogue is the thing that lets the derived "Custom" label
			// cover the layout preset at all — until this table existed there
			// was no per-layout statement of what a layout writes anywhere in
			// the repo, only a migration patch recording what 0.10.0 RENDERED.
			// Assert it against the registry rather than restating it here, so
			// this test cannot become the second copy.
			const chrome = JSON.parse(
				benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()["layout_chrome"]))\n`)
					.trim().split("\n").pop()
			);
			const layouts = ["Top Bar", "Compact", "Classic", "Bottom Bar", "Dock"];
			for (const l of layouts) expect(chrome[l], `the catalogue covers ${l}`);
			// One row per split container: the layout it belongs to writes 1 and
			// every other layout writes 0. Stated per container rather than as a
			// whole-table snapshot, so a failure names which cell moved.
			for (const [container, owner] of [
				["topbar", "Top Bar"], ["pagehead", "Compact"], ["dock", "Dock"],
			]) {
				// (the bottom bar is not in this list: more than one layout writes
				// it, so "one owner" is the wrong shape — it is checked below)
				expectEq(chrome[owner][container], 1, `${owner} is the layout that writes a ${container}`);
				for (const l of layouts.filter((x) => x !== owner)) {
					expectEq(chrome[l][container], 0, `${l} writes no ${container}`);
				}
			}
			// The side pane is the other way round: every layout keeps it except
			// Dock, which is how "Dock" goes on meaning what it always meant now
			// that the dock no longer hides the pane by itself.
			for (const l of layouts) {
				expectEq(chrome[l].sidepane, l === "Dock" ? 0 : 1, `${l}'s side pane`);
			}
			// EVERY layout keeps the ambient strip, Classic included. That was
			// settled on 2026-08-06 when `status_in_classic` was deleted to make
			// the status bar a component, and the catalogue states it rather
			// than leaving it to "status_style happens not to be Off". Writing 0
			// for Classic here would reverse a decision a day after it was made,
			// and a user picking Classic cannot tell a preset that removes their
			// status bar from a layout that decides it.
			for (const l of layouts) {
				expectEq(chrome[l].bottombar, 1, `${l} keeps the ambient strip`);
			}
			// Every container the doctype has grown is in every row: a catalogue
			// with a hole in it is how a preset silently stops writing something.
			const toggles = JSON.parse(
				benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()["toggles"]))\n`)
					.trim().split("\n").pop()
			);
			for (const l of layouts) {
				for (const key of Object.keys(toggles)) {
					expect(key in chrome[l], `${l} states a value for ${key}`);
				}
			}

			// CHROME_DEFAULTS is the one hand-written copy of a shipped default
			// in this file, and it exists only because module scope has no
			// server to ask. This is what stops it drifting: every state in the
			// matrix is built on these values, so a stale one would quietly
			// stop testing the configuration its name claims.
			for (const [field, value] of Object.entries(CHROME_DEFAULTS)) {
				expectEq(String(shipped[field]), String(value), `CHROME_DEFAULTS.${field} matches SHIPPED`);
			}
			// And the shipped defaults ARE the catalogue's row for the shipped
			// layout — the derivation presets.py performs, checked end to end
			// rather than trusted. A container whose field the doctype has not
			// grown yet is legitimately absent from SHIPPED and skipped here.
			for (const [key, field] of Object.entries(
				JSON.parse(
					benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()["toggles"]))\n`)
						.trim().split("\n").pop()
				)
			)) {
				if (!(field in shipped)) continue;
				expectEq(
					Number(shipped[field]),
					chrome["Top Bar"][key],
					`SHIPPED.${field} is what the shipped layout's catalogue row says`
				);
			}
		});

		setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar" });

		// ── Invariant matrix ───────────────────────────────────────────────
		//
		// WHY THIS EXISTS, AND WHY IT IS NOT MORE FEATURE TESTS
		//   Every test above pins one state and asserts a feature works in it.
		//   That shape cannot catch the bug this release actually shipped,
		//   because the failure belonged to no feature: status style "Off" in
		//   the Bottom Bar layout left a desk with no notifications and no way
		//   to log out. "There is always a way to log out" is not the
		//   notification kit's job or the layout kit's job, so nobody asserted
		//   it, and 75 passing tests said nothing.
		//
		//   So: walk the state space, and in EVERY state assert the handful of
		//   things that must be true regardless of configuration. The states
		//   come from the settings; the invariants come from registry.py, so a
		//   component added there is covered here the day it is registered
		//   rather than the day someone remembers to write a test.
		const registry = JSON.parse(
			benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()))\n`)
				.trim().split("\n").pop()
		);
		const CRITICAL = registry.components.filter((c) => c.critical);

		// A deliberately AWKWARD sample rather than a full cross product: the
		// full space is 5 layouts x 4 styles x 7 placements = 140 states and
		// ~9 minutes of page loads. These are the corners where the layout
		// system and the component settings disagree — every one of them is a
		// state that has produced a real defect, or is one move away from one.
		//
		// The fourth element is the CONTAINER state (slice 2c), spread over
		// CHROME_DEFAULTS so every state pins every container. Splitting a
		// container off `desk_layout` multiplies this space rather than adding
		// to it, so the states earning a place here are the ones where a
		// container contradicts its layout — that combination did not exist
		// before and no older test can have covered it.
		const INVARIANT_STATES = [
			["Top Bar", "Quiet", "Top Bar Center", {}],
			// The critical v0.10.0 defect: this strip IS the layout's only
			// chrome, so "no status bar" must not mean "no logout".
			["Bottom Bar", "Quiet", "Top Bar Center", { bottombar_enabled: 0, }],
			["Bottom Bar", "Always On", "Bottom Bar Center", {}],
			// No bar anywhere: everything must fall back to the natives.
			["Classic", "Quiet", "Top Bar Center", { bottombar_enabled: 0, }],
			// Sidebar hidden outright — the natives are NOT available here.
			["Dock", "Quiet", "Side Pane Start", { bottombar_enabled: 0, }],
			["Dock", "Quiet", "Top Bar Center", {}],
			// Compact keeps its native search row; the layout mounts no top bar.
			["Compact", "Minimal", "Top Bar Center", {}],
			// Search asked for a bar that this layout does not mount.
			["Classic", "Quiet", "Bottom Bar Start", {}],
			// The layout that always mounted a top bar, with the top bar off,
			// and search still asking for it. Search must fall back rather
			// than vanish — the same failure the placement chain was built for,
			// reachable now by a route that did not exist before the split.
			["Top Bar", "Quiet", "Top Bar Center", { topbar_enabled: 0 }],
			// A top bar on a Dock desk: the one layout that hides the sidebar,
			// so the natives are unreachable and OUR containers are the only
			// route to anything. Two containers where there was one.
			["Dock", "Quiet", "Top Bar Center", { topbar_enabled: 1 }],
			// A top bar on a Classic desk — a container contradicting its
			// layout in the direction nothing else in this list covers.
			["Classic", "Quiet", "Top Bar Start", { bottombar_enabled: 0,  topbar_enabled: 1 }],
			// Compact with its cluster off and no top bar either: the layout
			// defined by NOT growing chrome, now with none of ours at all. Every
			// route to everything is a native one, which is the case the
			// ownership stamps exist to keep working.
			["Compact", "Quiet", "Top Bar Center", { bottombar_enabled: 0,  pagehead_enabled: 0 }],
			// A page-head cluster on a Dock desk. Dock hides the sidebar, so the
			// natives are unreachable and this cluster is a real route — and it
			// is the one container that remounts on every route change, in the
			// layout where losing it would leave nothing.
			["Dock", "Quiet", "Top Bar Center", { pagehead_enabled: 1 }],
			// The Dock layout with no dock — not a state before the split, one
			// keystroke away after it. The Dock preset has already written
			// sidepane 0, so this is EVERY CONTAINER OFF: nothing of ours, and
			// the pane switched off too. The guard is the only thing standing
			// between this state and a desk nobody can log out of.
			["Dock", "Quiet", "Top Bar Center", { bottombar_enabled: 0, 
				topbar_enabled: 0, pagehead_enabled: 0, dock_enabled: 0, sidebar_enabled: 0,
			}],
			// A dock alongside a side pane, which no layout could express.
			["Top Bar", "Quiet", "Top Bar Center", { dock_enabled: 1 }],
			// The side pane off while our own chrome carries everything — the
			// state the guard must NOT fire in, asserted here as an invariant
			// rather than only as a unit check.
			["Top Bar", "Quiet", "Top Bar Center", { sidebar_enabled: 0 }],
		];

		for (const [layout, style, placement, chrome] of INVARIANT_STATES) {
			const label = Object.keys(chrome).length ? ` · ${JSON.stringify(chrome)}` : "";
			await test(`invariant: ${layout} · ${style} · search ${placement}${label}`, async () => {
				setSettings({
					...CHROME_DEFAULTS,
					...chrome,
					desk_layout: layout,
					status_style: style,
					search_placement: placement,
				});
				await goDesk("/desk/item", ".page-head", 4500);

				// Every critical component must be reachable by SOME route —
				// ours or the native one it replaced. Which route is not the
				// invariant; having one is.
				for (const c of CRITICAL) {
					const reachable = await page.evaluate(
						({ ours, native }) => {
							const shown = (sel) => {
								if (!sel) return false;
								const el = document.querySelector(sel);
								if (!el) return false;
								const r = el.getBoundingClientRect();
								return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
							};
							return { ours: shown(ours), native: shown(native) };
						},
						{ ours: c.selector, native: c.native }
					);
					expect(
						reachable.ours || reachable.native,
						`${c.label} reachable — ours:${reachable.ours} native:${reachable.native}`
					);
				}

				// THE OWNERSHIP CONTRACT, both directions. This is what makes a
				// failed mount degrade instead of delete: a token may only be
				// claimed while our replacement is really in the document, and
				// an unclaimed affordance must leave Frappe's own visible.
				const ownership = await page.evaluate(
					(pairs) => {
						const owned = new Set(
							(document.documentElement.getAttribute("data-bnd-own") || "").split(/\s+/).filter(Boolean)
						);
						const vis = (sel) => {
							const el = sel && document.querySelector(sel);
							if (!el) return false;
							const r = el.getBoundingClientRect();
							return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
						};
						return pairs.map(([token, ours, native]) => ({
							token,
							claimed: owned.has(token),
							ours: vis(ours),
							native: vis(native),
						}));
					},
					[
						["search", ".bnd-search-field, .bnd-search-icon", ".body-sidebar .navbar-search-bar"],
						["bell", ".bnd-bell", ".body-sidebar .sidebar-notification"],
						["user", ".bnd-avatar-btn", ".body-sidebar .sidebar-user-button"],
					]
				);
				for (const o of ownership) {
					if (o.claimed) {
						expect(o.ours, `claimed "${o.token}" — our replacement is really mounted`);
					} else {
						expect(o.native, `unclaimed "${o.token}" — Frappe's own is left visible`);
					}
				}

				// Log out specifically, because losing it is the worst outcome
				// in the app and it hides behind two different affordances.
				const canLogOut = await page.evaluate(() => {
					const hit = [...document.querySelectorAll("a,button,li")].some((n) =>
						/log\s?out|sign\s?out|تسجيل الخروج/i.test(n.textContent || "")
					);
					// Our avatar menu builds its items on click, so its mere
					// presence counts as a route to logout.
					return hit || !!document.querySelector(".bnd-avatar-btn, .sidebar-user-button");
				});
				expect(canLogOut, "a route to Log Out exists");

				// Exactly one search affordance — never zero, never two. Two
				// shipped in Compact and Classic before the native-hiding rule
				// was inverted.
				const searches = await page.evaluate(() => {
					// Rect-based, NOT `display !== "none"`. An element can have
					// its own display set while an ANCESTOR is hidden — which is
					// exactly Dock, where the sidebar row is fine and the
					// sidebar container is display:none. Asking the element
					// alone counted a search box nobody could see.
					const vis = (el) => {
						if (!el) return false;
						const r = el.getBoundingClientRect();
						return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
					};
					// Both forms count: the dock and page-head clusters carry
					// search as an icon rather than a field, and an icon the
					// user can click is a search affordance.
					const ours = [...document.querySelectorAll(".bnd-search-field, .bnd-search-icon")]
						.filter(vis).length;
					const nat = vis(document.querySelector(".body-sidebar .navbar-search-bar")) ? 1 : 0;
					return ours + nat;
				});
				expectEq(searches, 1, "exactly one search affordance on screen");
			});
		}

		setSettings({
			...CHROME_DEFAULTS,
			desk_layout: "Top Bar",
			status_style: "Quiet",
			search_placement: "Top Bar Center",
		});

		// ── Settings form geometry ─────────────────────────────────────────
		//
		// The invariant matrix asks whether things are REACHABLE. Nothing asks
		// whether they are laid out correctly, and a settings form is where
		// that shows: moving the pickers' CSS out of three inline <style>
		// strings raised its specificity from (0,1,0) to the house convention
		// (0,2,0), our rules started winning fights they had been losing to
		// Frappe, and one label wrapped to two lines and made its card taller
		// than its neighbours. 86 tests stayed green throughout, because none
		// of them looks at shape.
		//
		// These assert SHAPE, not pixels. Absolute heights would be a snapshot
		// of this machine's font rendering and would fail on anyone else's.
		await test("settings: every picker renders its full complement", async () => {
			await goDesk("/desk/theme-settings?shell=0", ".bnd-dgm-slot", 3500);
			// Structural counts catch a picker that silently rendered nothing —
			// which is what a thrown error inside one render function looks
			// like, since each is called in sequence from refresh().
			const EXPECTED = {
				layout_picker: { cards: 5 },
				// Eight, matching SIDEBAR_PRESETS in presets.py. Worth stating
				// because the first draft of this test said three: it counted
				// `.bnd-sbp-card`, a decorative part INSIDE a preset thumbnail,
				// rather than `.bnd-sbp-preset`, the card itself.
				sidebar_picker: { cards: 8 },
				// opts 10 -> 7: the crumb_icons group (First/Every/Off) left for the
				// Icons axis (item 23). cards and toggles are unchanged, and the
				// sidebar picker's own icon options were .bnd-sbp-opt (not counted
				// here), so its card count holds at 8.
				crumbs_picker: { cards: 5, toggles: 3, opts: 7 },
				palette_picker: { cards: 4, toggles: 6 },
				// `slots` are desk-diagram targets and `cards` are style
				// thumbnails: different controls, counted apart. Search has only
				// slots now — its six thumbnails became six positions on one
				// shared desk. The bell's `opts` went 7 -> 8 for the "Off" chip,
				// which sits BESIDE the diagram because "not shown" is not a place.
				// 14, not 5: E1 replaced five whole-region slots with the same
				// five regions times their zones, minus "Off" which is drawn as
				// a chip beside the diagram rather than as a place on the desk.
				inbox_picker: { cards: 4, slots: 14, toggles: 4, opts: 8 },
				user_picker: { cards: 0, slots: 14, opts: 1 },
				search_picker: { cards: 0, slots: 6 },
				// 7, not 8: `status_in_classic` was deleted when the status bar stopped
				// being a property of the layout.
				// 3, not 4: the "Off" style card is deleted — the option left the
				// FIELD on 2026-08-06 and the surviving card wrote a value the
				// Select refused, wedging every later save of the Single.
				status_picker: { cards: 3, toggles: 7, opts: 7 },
				// List view kit (item 16): 5 style cards (Original + 4), two option
				// groups (2 hover + 3 selection = 5 opts), one reveal toggle.
				// Back-filled here with item 27 — the HANDOVER omission, closed.
				list_picker: { cards: 5, toggles: 1, opts: 5 },
				// Form view kit (item 18): 5 style cards (Original + 4), the two
				// option groups (3 tab markers + 3 sidebar treatments), one toggle.
				form_picker: { cards: 5, toggles: 1, opts: 6 },
				// Workspace tile kit (item 25): 7 style cards (Original + 6), two
				// option groups (5 metric + 3 rows = 8 opts), one menu toggle.
				workspace_picker: { cards: 7, toggles: 1, opts: 8 },
				// Chart surface (item 25): 5 style cards, no Original (the base
				// theming is always on) and no composing groups or toggles — one axis.
				chart_picker: { cards: 5, toggles: 0, opts: 0 },
				// Report / datatable kit (item 26): 5 style cards (Original + 4), two
				// option groups (2 grain + 3 rows = 5 opts), one reveal toggle.
				// Back-filled here with item 27 — never added when the kit shipped.
				report_picker: { cards: 5, toggles: 1, opts: 5 },
				// Alternate views kit (item 27): 5 style cards (Original + 4), three
				// option groups (2 band + 3 mark + 2 media = 7 opts), one reveal toggle.
				views_picker: { cards: 5, toggles: 1, opts: 7 },
				// Overlays kit (item 28): 5 style cards (Original + 4), two option
				// groups (3 scrim + 2 menu = 5 opts), NO toggle — this kit's repairs
				// are contracts, not options, so there is nothing to switch off.
				overlay_picker: { cards: 5, toggles: 0, opts: 5 },
				// Icon system kit (item 23): 6 style cards (the chip looks), and 13
				// option chips across four groups — 4 weights, 3 missing-icon
				// fallbacks, 3 breadcrumb-icon, 3 rail-button. No toggles; the
				// specimen is aria-hidden decoration, not a control.
				icons_picker: { cards: 6, toggles: 0, opts: 13 },
			};
			const got = await page.evaluate(() => {
				const out = {};
				for (const f of Object.keys({
					layout_picker: 1, sidebar_picker: 1, crumbs_picker: 1, palette_picker: 1,
					inbox_picker: 1, user_picker: 1, search_picker: 1, status_picker: 1,
					list_picker: 1, form_picker: 1, workspace_picker: 1, chart_picker: 1,
					report_picker: 1, views_picker: 1, overlay_picker: 1, icons_picker: 1,
				})) {
					const el = document.querySelector(`[data-fieldname="${f}"]`);
					out[f] = el
						? {
								h: Math.round(el.getBoundingClientRect().height),
								cards: el.querySelectorAll(".bnd-cbp-style,.bnd-lp-card,.bnd-sbp-preset").length,
								slots: el.querySelectorAll(".bnd-dgm-slot").length,
								toggles: el.querySelectorAll(".bnd-cbp-toggle,.bnd-sbp-toggle").length,
								opts: el.querySelectorAll(".bnd-cbp-opt").length,
						  }
						: null;
				}
				return out;
			});
			for (const [name, want] of Object.entries(EXPECTED)) {
				expect(got[name], `${name} rendered`);
				expect(got[name].h > 0, `${name} has height`);
				for (const [k, v] of Object.entries(want)) {
					expectEq(got[name][k], v, `${name}.${k}`);
				}
			}
		});

		await test("settings: no unexplained structural drift in any picker", async () => {
			// THE BASELINE IS COMMITTED, so "measure before and after" stops
			// being something to remember around a refactor and becomes
			// something the suite does. Hand-porting the search picker dropped
			// its thumbnail SVGs, and the card count was identical either way —
			// only a structural comparison catches that, and only if somebody
			// runs it at the right moment. Now nobody has to.
			//
			// Structure, never pixels: node sequence, svg count, text length.
			// Heights would encode one machine's font rendering.
			//
			// A DIFF HERE IS NOT AUTOMATICALLY A BUG. Porting a picker to the
			// shared vocabulary legitimately renames classes. The rule is that
			// a change must be LOOKED AT, then the fixture regenerated on
			// purpose:  node tools/fingerprint.mjs tests/fixtures/picker-shape.json
			const fixture = JSON.parse(
				readFileSync(new URL("./fixtures/picker-shape.json", import.meta.url), "utf8")
			);
			const expected = fixture.pickers;
			// PIN THE STATE THE FIXTURE RECORDS. The pickers render what the
			// settings say — the sidebar picker alone shows a preset name or
			// "Custom", one node and 22 characters apart. By this point the
			// suite has mutated settings dozens of times, so a baseline
			// captured in another state reported drift in a picker nobody had
			// touched. A check that cries wolf gets ignored, which is worse
			// than not having one.
			//
			// The state comes FROM the fixture rather than a copy kept here:
			// one fact in two files is the exact defect this codebase keeps
			// producing, and a shape checker built that way would be a poor
			// joke.
			// Intersected with MUTABLE_FIELDS: a fixture's `state` is the whole
			// SHIPPED map, which includes identity and colour fields the suite
			// does not snapshot. Writing them here destroyed them permanently.
			// Safe for this check: the fingerprint is purely structural — node
			// sequence, svg count, text length — and a brand colour or a company
			// name changes none of those.
			setSettings(
				Object.fromEntries(
					Object.entries(fixture.state).filter(([field]) => MUTABLE_FIELDS.includes(field))
				)
			);
			await goDesk("/desk/theme-settings?shell=0", ".bnd-dgm-slot", 3500);
			const actual = await page.evaluate((names) => {
				const out = {};
				for (const f of names) {
					const root = document.querySelector(`[data-fieldname="${f}"]`);
					if (!root) { out[f] = null; continue; }
					const seq = [];
					const walk = (el) => {
						for (const c of el.children) {
							seq.push(
								c.tagName.toLowerCase() + "." +
								(c.getAttribute("class") || "").trim().split(/\s+/).sort().join(".")
							);
							walk(c);
						}
					};
					walk(root);
					out[f] = {
						n: seq.length,
						svgs: root.querySelectorAll("svg").length,
						text: root.textContent.replace(/\s+/g, " ").trim().length,
						seq,
					};
				}
				return out;
			}, Object.keys(expected));

			const drift = [];
			for (const [name, want] of Object.entries(expected)) {
				const got = actual[name];
				if (!got) { drift.push(`${name}: absent`); continue; }
				// SVG and text counts are what catch a silently dropped
				// thumbnail or label — the exact hand-porting failure.
				if (got.svgs !== want.svgs) drift.push(`${name}: svg ${want.svgs} -> ${got.svgs}`);
				if (got.text !== want.text) drift.push(`${name}: text ${want.text} -> ${got.text}`);
				if (got.n !== want.n) drift.push(`${name}: nodes ${want.n} -> ${got.n}`);
				else if (JSON.stringify(got.seq) !== JSON.stringify(want.seq)) {
					const at = got.seq.findIndex((s, i) => s !== want.seq[i]);
					drift.push(`${name}: structure at #${at} "${want.seq[at]}" -> "${got.seq[at]}"`);
				}
			}
			expectEq(drift.length, 0, `structural drift:\n    ${drift.slice(0, 6).join("\n    ")}`);
		});

		await test("settings: no ragged rows — cards on a line match heights", async () => {
			// The fault the CSS move exposed, made permanent. A card whose label
			// wraps must not stand taller than the ones beside it.
			const ragged = await page.evaluate(() => {
				const bad = [];
				for (const row of document.querySelectorAll(".bnd-cbp-row, .bnd-sbp-row-wrap, .bnd-cbp-styles")) {
					const kids = [...row.children].filter((k) => k.getBoundingClientRect().height > 0);
					if (kids.length < 2) continue;
					// Group by top edge: only cards on the SAME line are peers.
					const lines = new Map();
					for (const k of kids) {
						const r = k.getBoundingClientRect();
						const key = Math.round(r.top);
						if (!lines.has(key)) lines.set(key, []);
						lines.get(key).push(Math.round(r.height));
					}
					for (const [top, hs] of lines) {
						if (Math.max(...hs) - Math.min(...hs) > 1) {
							bad.push({ cls: row.className, top, heights: hs });
						}
					}
				}
				return bad;
			});
			expectEq(ragged.length, 0, `ragged rows: ${JSON.stringify(ragged.slice(0, 3))}`);
		});

		// ── Master & detail settings shell (rework slice 1c step 2) ───────
		//
		// The shell is built ALONGSIDE the existing form and gated behind a URL
		// argument, because both surfaces rendering at once would double-bind
		// every picker: two sets of cards writing the same field, each unaware
		// of the other's clicks. These three tests are the whole contract —
		// off by default, exactly one surface when on, and no orphaned copy.
		await test("settings: the primary button is not \"Submit\"", async () => {
			// Theme Settings is a non-submittable Single, so "Submit" is simply
			// wrong on it. The cause is upstream: perm.js grants Administrator
			// every right including `submit`, and toolbar.js `can_submit()` reads
			// that right without ever checking `is_submittable` — so the label
			// comes from a permission, not from the doctype. Asserted on the
			// LABEL rather than on our patch, so this keeps passing if Frappe
			// ever fixes it and our correction becomes a no-op.
			await goDesk("/desk/theme-settings?shell=0", ".bnd-dgm-slot", 4000);
			const seen = await page.evaluate(() => ({
				primary: (document.querySelector(".primary-action") || {}).textContent?.trim() || "",
				submittable: !!(window.cur_frm && window.cur_frm.meta.is_submittable),
				perm: window.cur_frm ? window.cur_frm.perm[0].submit : null,
			}));
			expectEq(seen.submittable, false, "Theme Settings became submittable");
			expect(
				seen.primary !== "Submit",
				`primary action reads "Submit" on a non-submittable Single (perm.submit=${seen.perm})`
			);
		});

		await test("settings: the primary-action fix stays scoped to this doctype", async () => {
			// The correction clears submit/cancel/amend on Theme Settings' own
			// perm. A theme has no business rewriting the desk's permission model,
			// so this fails if the fix ever leaks: another non-submittable doctype
			// must still show whatever stock Frappe shows, untouched by us.
			await goDesk("/desk/item", ".page-head", 3500);
			const elsewhere = await page.evaluate(() =>
				window.frappe && window.frappe.perm && window.frappe.perm.doctype_perm
					? Object.entries(window.frappe.perm.doctype_perm)
							.filter(([dt]) => dt !== "Theme Settings")
							.filter(([, p]) => p && p[0] && p[0].submit === 0)
							.map(([dt]) => dt)
					: []
			);
			expectEq(
				elsewhere.join(","),
				"",
				`the fix cleared submit on other doctypes: ${elsewhere.join(", ")}`
			);
		});

		await test("shell: it IS the settings page, and ?shell=0 still reaches the old form", async () => {
			// The gate inverted once the shell was finished. Both halves matter:
			// the plain URL must show the shell (it shipped invisible behind a
			// query string nobody would guess), and the stacked form must stay
			// reachable for any field the shell has not placed.
			await goDesk("/desk/theme-settings", ".bnd-shell", 4500);
			expectEq(await q(".bnd-shell"), true, "the plain settings URL does not show the shell");

			await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-presets", 4500);
			expectEq(await q(".bnd-shell"), false, "?shell=0 still rendered the shell");
			expect(await visible('[data-fieldname="sidebar_picker"]'), "?shell=0 lost the stacked form");
		});

		await test("shell: exactly one surface renders, never two", async () => {
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			const counts = await page.evaluate(() => {
				const inside = (sel) =>
					[...document.querySelectorAll(sel)].filter((n) => n.closest(".bnd-shell")).length;
				return {
					shells: document.querySelectorAll(".bnd-shell").length,
					// Picker CONTENT, not the field wrapper: the wrapper stays in
					// the DOM (empty) because Frappe owns it. Two copies of the
					// content is the defect this test exists for.
					cards: document.querySelectorAll(".bnd-cbp-opt, .bnd-sbp-card, .bnd-dgm-slot").length,
					cardsInShell: inside(".bnd-cbp-opt, .bnd-sbp-card, .bnd-dgm-slot"),
					legacyVisible: [...document.querySelectorAll('[data-fieldname$="_picker"]')].filter(
						(n) => !n.closest(".bnd-shell") && n.getBoundingClientRect().height > 0
					).length,
				};
			});
			expectEq(counts.shells, 1, "shell root count");
			expect(counts.cards > 0, "shell rendered no picker content at all");
			expectEq(counts.cardsInShell, counts.cards, "picker content exists outside the shell too");
			expectEq(counts.legacyVisible, 0, "legacy picker fields still visible beside the shell");
		});

		await test("diagram: marks the current slot, and warns the ones the layout cannot honour", async () => {
			// The defect: a placement diagram that always looks the same. It has
			// to track the stored value AND react to the layout, because a slot's
			// availability is a property of the layout, not of the picker. Both
			// are asserted as transitions.
			const slots = (key) =>
				page.evaluate((k) => {
					const pane = document.querySelector(`.bnd-shell-pane[data-key="${k}"]`);
					if (!pane) return null;
					return [...pane.querySelectorAll(".bnd-dgm-slot")].map((b) => ({
						v: b.dataset.value,
						on: b.classList.contains("bnd-dgm-on"),
						warn: b.classList.contains("bnd-dgm-warn"),
					}));
				}, key);

			setSettings({ desk_layout: "Top Bar", inbox_placement: "Top Bar End", status_style: "Quiet" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="inbox"]');
			await page.waitForTimeout(500);
			let s1 = await slots("inbox");
			// Counted against the FIELD, not a number typed here: E1 turned five
			// whole-region slots into fifteen zoned ones, and a literal 5 would
			// have had to be found and changed by hand — which is how every
			// other copy of this vocabulary went stale.
			const offered = JSON.parse(
				benchPy(
					"from bunood_theme.registry import slots_for\n" +
					"print(json.dumps([s for s in slots_for('inbox') if s != 'Off']))\n"
				).trim().split("\n").pop()
			);
			expectEq(s1 ? s1.length : 0, offered.length, "bell diagram draws every slot the field offers");
			expectEq(s1.filter((x) => x.on).map((x) => x.v).join(","), "Top Bar End", "wrong slot marked current");
			// Top Bar layout: no dock, and only Compact fills the title row.
			// DERIVED, because the warning is a property of the REGION and E1
			// gave every region three slots — typing the list out again is how
			// the last copy of this vocabulary went stale.
			const unhonoured = offered
				.filter((v) => v.startsWith("Dock") || v.startsWith("Page Header"))
				.sort()
				.join(",");
			expectEq(
				s1.filter((x) => x.warn).map((x) => x.v).sort().join(","),
				unhonoured,
				"wrong slots warned for the Top Bar layout"
			);

			// Change the LAYOUT and the warnings must move with it.
			setSettings({ desk_layout: "Dock" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="inbox"]');
			await page.waitForTimeout(500);
			const s2 = await slots("inbox");
			const warned = s2.filter((x) => x.warn).map((x) => x.v).sort().join(",");
			expect(
				warned.includes("Side Pane") && warned.includes("Top Bar") && !warned.includes("Dock"),
				`Dock layout warned "${warned}" — it hides the sidebar and HAS a dock`
			);
			setSettings({ desk_layout: "Top Bar" });
		});

		await test("overview: one mark per placed component, each a route to its control", async () => {
			setSettings({ inbox_placement: "Top Bar End", user_placement: "Side Pane End" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="overview"]');
			await page.waitForTimeout(600);
			const marks = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-dgm-mark")].map((m) => ({
					goto: m.dataset.goto,
					x: Math.round(m.getBoundingClientRect().left),
				}))
			);
			expectEq(
				marks.map((m) => m.goto).sort().join(","),
				"inbox,search,user",
				"overview does not mark exactly the three placed components"
			);
			// The user menu was moved to the side pane, so its mark must sit to
			// the LEFT of the bell's, which is in the top bar. A diagram whose
			// marks do not move with the setting is a picture, not an overview.
			const user = marks.find((m) => m.goto === "user");
			const bell = marks.find((m) => m.goto === "inbox");
			expect(user.x < bell.x, `user mark at ${user.x} is not left of the bell at ${bell.x}`);

			// And a mark is a route to the control.
			await page.click('.bnd-dgm-mark[data-goto="user"]');
			await page.waitForTimeout(500);
			expectEq(
				await page.evaluate(() =>
					(document.querySelector(".bnd-shell-item.bnd-shell-on") || {}).getAttribute("data-key")
				),
				"user",
				"clicking the user mark did not select the user menu entry"
			);
			setSettings({ user_placement: "Top Bar End" });
		});

		await test("bands: headings appear only where there is more than one", async () => {
			// Three defects in one check. A band with an empty heading (a zone
			// rendered with no title). A picker with ONE zone printing a heading
			// over its entire contents — which says nothing and costs a line, and
			// is why `bnd_bands` counts what actually rendered instead of trusting
			// a per-picker flag. And a group stranded outside every band, which is
			// what happens when a new row is added to a picker table and nobody
			// gives it a `zone`.
			await goDesk("/desk/theme-settings?shell=0", ".bnd-dgm-slot", 4000);
			const report = await page.evaluate(() => {
				const out = {};
				for (const f of [
					"crumbs_picker", "palette_picker", "inbox_picker",
					"status_picker", "search_picker", "sidebar_picker", "layout_picker",
				]) {
					const root = document.querySelector(`[data-fieldname="${f}"]`);
					if (!root) continue;
					const zones = [...root.querySelectorAll(".bnd-cbp-zone")];
					out[f] = {
						zones: zones.length,
						blankTitles: zones.filter(
							(z) => !(z.querySelector(".bnd-cbp-zone-title") || {}).textContent
						).length,
						keys: zones.map((z) => z.dataset.zone).filter(Boolean).length,
						// Groups sitting outside every band, in a picker that has bands.
						stranded: zones.length
							? [...root.querySelectorAll(".bnd-cbp-group")].filter(
									(g) => !g.closest(".bnd-cbp-zone")
							  ).length
							: 0,
					};
				}
				return out;
			});
			for (const [picker, r] of Object.entries(report)) {
				expect(r.zones !== 1, `${picker}: a single band still printed a heading`);
				expectEq(r.blankTitles, 0, `${picker}: ${r.blankTitles} band(s) with an empty heading`);
				expectEq(r.keys, r.zones, `${picker}: a band has no data-zone identity`);
				expectEq(r.stranded, 0, `${picker}: ${r.stranded} group(s) outside every band`);
			}
			// And the two that must stay unbanded, because they have one zone.
			expectEq(report.search_picker.zones, 0, "search grew bands; it is placement-only");
			expect(report.sidebar_picker.zones >= 5, `side pane has only ${report.sidebar_picker.zones} bands`);
		});

		await test("bands: the side pane filter hides a band once it empties", async () => {
			// Filtering every group out of a band used to leave its heading
			// standing over nothing, which reads as a broken filter rather than
			// as no matches.
			await goDesk("/desk/theme-settings?shell=0", ".bnd-sbp-search", 4000);
			const state = async (q) => {
				await page.fill(".bnd-sbp-search", q);
				await page.waitForTimeout(350);
				return page.evaluate(() =>
					[...document.querySelectorAll(".bnd-cbp-zone")]
						.filter((z) => z.offsetParent !== null)
						.map((z) => z.dataset.zone)
				);
			};
			const all = await state("");
			expect(all.length >= 5, `only ${all.length} bands visible unfiltered`);

			// Assert the INVARIANT, not a predicted outcome. The filter matches a
			// group's text as well as its field name, so which bands a given word
			// empties is a property of the copy — an earlier version of this test
			// assumed "rail" appeared only in rail-band groups and failed on a
			// description elsewhere that mentions it. The contract is simply: no
			// visible band is empty.
			for (const q of ["rail", "zzzznomatch", "icon", "glass"]) {
				const orphan = await page.evaluate((query) => {
					const bad = [];
					for (const z of document.querySelectorAll(".bnd-cbp-zone")) {
						if (z.offsetParent === null) continue;
						const groups = z.querySelectorAll(".bnd-sbp-group");
						if (!groups.length) continue; // the preset band holds no groups
						if (![...groups].some((g) => g.offsetParent !== null)) {
							bad.push(`${z.dataset.zone} @ "${query}"`);
						}
					}
					return bad;
				}, q);
				await page.fill(".bnd-sbp-search", q);
				await page.waitForTimeout(350);
				const after = await page.evaluate(() =>
					[...document.querySelectorAll(".bnd-cbp-zone")]
						.filter((z) => z.offsetParent !== null)
						.filter((z) => {
							const g = z.querySelectorAll(".bnd-sbp-group");
							return g.length && ![...g].some((x) => x.offsetParent !== null);
						})
						.map((z) => z.dataset.zone)
				);
				expectEq(after.join(","), "", `bands left standing empty by "${q}"`);
				expectEq(orphan.join(","), "", `pre-existing empty band: ${orphan.join(",")}`);
			}
			await page.fill(".bnd-sbp-search", "");
			await page.waitForTimeout(300);
		});

		await test("shell: the change dot marks the component that actually changed", async () => {
			// The defect this catches is a dot that is always on, always off, or on
			// for the wrong entry — all three of which look like a working feature
			// in a screenshot. So it asserts the TRANSITION, against a value read
			// from the shipped defaults rather than typed here: a hand-written
			// "expected default" is the copy that goes stale, and it already fooled
			// this test's author once ("Soft Tint" is a real option and is NOT the
			// default; "Soft Pill" is, so a restore to the wrong one left the dot
			// correctly lit and looked like a bug).
			const shipped = JSON.parse(
				benchPy(`from bunood_theme.setup import SHIPPED\nprint(json.dumps(SHIPPED))\n`)
					.trim().split("\n").pop()
			);
			const lit = async () => {
				const m = await page.evaluate(() =>
					[...document.querySelectorAll(".bnd-shell-item")]
						.filter(
							(n) =>
								!document
									.querySelector(`[data-bnd-dot="${n.dataset.key}"]`)
									.hasAttribute("hidden")
						)
						.map((n) => n.dataset.key)
				);
				return m.join(",");
			};

			// EVERYTHING mutable is pinned to shipped, not a hand-picked list:
			// "no dot at defaults" is a claim about a desk that IS at defaults,
			// and the hand-picked version was patched twice — first placement
			// (the E3 tests' leavings), then colors lit in a full run for a
			// field nobody listed. Fields outside MUTABLE_FIELDS (colours,
			// branding) are asserted-by-omission: the suite never writes them,
			// so shipped is what they hold, and if that ever stops being true
			// this test failing IS the announcement.
			setSettings(
				Object.fromEntries(
					Object.entries(shipped).filter(([k]) => MUTABLE_FIELDS.includes(k))
				)
			);
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			const entries = await page.evaluate(
				() => document.querySelectorAll(".bnd-shell-item").length
			);
			expect(entries >= 6, `only ${entries} shell entries`);
			expectEq(await lit(), "", "a dot is lit while every setting is at its shipped default");

			const other = shipped.crumb_hover === "Underline" ? "Soft Pill" : "Underline";
			setSettings({ crumb_hover: other });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			expectEq(await lit(), "crumbs", "one crumb field changed; exactly crumbs should be marked");

			setSettings({ crumb_hover: shipped.crumb_hover });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			expectEq(await lit(), "", "the dot did not clear when the value returned to its default");
		});

		await test("shell: the note names a real preset, and never invents one", async () => {
			// The value is the second half: this fails if someone later makes
			// crumb_style or inbox_style print a preset name, which would be a
			// label with no catalogue behind it.
			//
			// TWO entries have a catalogue now. The side pane has had one since
			// item 10 (SIDEBAR_PRESETS, 22 values). The LAYOUT gained one with
			// slice 2c — `registry.LAYOUT_CHROME` — and that is the whole point
			// of the container split: until a table said what a layout writes,
			// there was nothing to compare a desk against and this note could
			// only say "Default" or "Changed". Both are checked the same way,
			// against the server's list, so neither can drift into a label the
			// catalogue does not contain.
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			const notes = await page.evaluate(() =>
				Object.fromEntries(
					[...document.querySelectorAll(".bnd-shell-item")].map((n) => [
						n.dataset.key,
						document.querySelector(`[data-bnd-note="${n.dataset.key}"]`).textContent.trim(),
					])
				)
			);
			const presets = JSON.parse(
				benchPy(
					`from bunood_theme.presets import SIDEBAR_PRESETS\nprint(json.dumps(list(SIDEBAR_PRESETS)))\n`
				).trim().split("\n").pop()
			);
			expect(
				presets.includes(notes.sidepane) || notes.sidepane === "Custom",
				`side pane note "${notes.sidepane}" is neither a real preset name nor "Custom"`
			);

			const layouts = Object.keys(
				JSON.parse(
					benchPy(`from bunood_theme.registry import as_dict\nprint(json.dumps(as_dict()["layout_chrome"]))\n`)
						.trim().split("\n").pop()
				)
			);
			expect(
				layouts.includes(notes.layout) || notes.layout === "Custom",
				`layout note "${notes.layout}" is neither a real layout name nor "Custom"`
			);

			for (const [key, note] of Object.entries(notes)) {
				if (key === "sidepane" || key === "layout") continue;
				// RENDER-ONLY ENTRIES OWN NO FIELDS — they read state or hold it
				// in their own doctypes — so they have no Default/Changed to
				// report and must stay silent. Saying "Default" under the
				// Overview would claim a state it does not own, and go on
				// claiming it while every component it displays had changed;
				// the Translations surface (item 7 part 2) is the same class,
				// its state living in Bunood Translation Scan/Proposal.
				const RENDER_ONLY = ["overview", "translations"];
				const allowed = RENDER_ONLY.includes(key) ? [""] : ["Default", "Changed"];
				expect(
					allowed.includes(note),
					`${key} shows "${note}"; expected one of ${JSON.stringify(allowed)}`
				);
			}
		});

		await test("shell: no section is left stranded outside it", async () => {
			// The shell claims sections by name. Add a section to the doctype and
			// forget to place it and it renders below the shell, looking like a
			// bug in the shell rather than an omission in its table. This is the
			// check that names it. It also catches the opposite error: two entries
			// claiming ONE section, which used to make the loser silently empty —
			// `default_density` and `enable_command_palette` share
			// `section_features`, and that is how it was found.
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			const stranded = await page.evaluate(() =>
				[...document.querySelectorAll(".form-section")]
					.filter((n) => !n.closest(".bnd-shell") && n.getBoundingClientRect().height > 0)
					// The shell's own host section is the one legitimate exception:
					// it is what the shell is rendered INTO.
					.filter((n) => !n.querySelector('[data-fieldname="chrome_shell"]'))
					.map((n) =>
						[...n.querySelectorAll("[data-fieldname]")]
							.map((x) => x.dataset.fieldname)
							.filter((x) => !x.startsWith("__"))
							.slice(0, 3)
							.join(",")
					)
			);
			expectEq(stranded.length, 0, `sections outside the shell: ${JSON.stringify(stranded)}`);
		});

		await test("shell: every group opens and mounts its picker", async () => {
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			const items = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-shell-item")].map((n) => n.dataset.key)
			);
			expect(items.length >= 6, `only ${items.length} shell entries`);
			for (const key of items) {
				await page.click(`.bnd-shell-item[data-key="${key}"]`);
				await page.waitForTimeout(400);
				const ok = await page.evaluate(
					(k) => {
						const pane = document.querySelector(".bnd-shell-detail");
						if (!pane) return "no detail pane";
						const sel = document.querySelector(`.bnd-shell-item[data-key="${k}"].bnd-shell-on`);
						if (!sel) return "selection did not follow the click";
						return pane.textContent.trim().length > 10 ? "" : "detail pane is empty";
					},
					key
				);
				expectEq(ok, "", `${key}: ${ok}`);
			}
		});

		await test("settings: nothing overflows the form horizontally", async () => {
			const overflow = await page.evaluate(() =>
				[...document.querySelectorAll('[data-fieldname$="_picker"]')]
					.map((el) => ({ f: el.getAttribute("data-fieldname"), over: el.scrollWidth - el.clientWidth }))
					.filter((x) => x.over > 1)
			);
			expectEq(overflow.length, 0, `pickers overflowing: ${JSON.stringify(overflow)}`);
		});

		await test("registry: every component is findable by identity, not by class", async () => {
			// Classes answer "how does this look". Four times in one day a
			// class-only query measured a decorative PART instead of the thing
			// itself — the unread badge for the bell, a thumbnail fragment for
			// a preset card, the first option on the page for one in a
			// specific group. `data-bnd-part` answers "what is this", nothing
			// styles it, and the registry is where the answer lives so the
			// desk code and this suite cannot disagree about it.
			setSettings({ desk_layout: "Top Bar", status_style: "Always On", search_placement: "Top Bar Center" });
			await goDesk("/desk/item", ".page-head", 4500);
			const parts = registry.components
				.filter((c) => c.part)
				.map((c) => ({ key: c.key, part: c.part }));
			expect(parts.length >= 3, `registry names identity parts (${parts.length})`);
			const missing = await page.evaluate(
				(ps) => ps.filter((p) => !document.querySelector(`[data-bnd-part="${p.part}"]`)).map((p) => p.key),
				parts
			);
			// Only the ones this layout actually mounts are required; the point
			// is that when a thing IS present it is findable by identity.
			expectEq(
				missing.filter((k) => ["inbox", "user", "search"].includes(k)).length,
				0,
				`mounted components findable by data-bnd-part (missing: ${missing.join(",")})`
			);
		});

		await test("layout invariants hold across the mounted chrome", async () => {
			// One helper, every region, every layout. Catches the class the
			// dock-over-statusbar bug belonged to without anyone having to
			// predict which two components would collide next.
			for (const [layout, style] of [
				["Top Bar", "Always On"],
				["Bottom Bar", "Always On"],
				["Dock", "Always On"],
				["Compact", "Quiet"],
			]) {
				setSettings({ desk_layout: layout, status_style: style, search_placement: "Top Bar Center" });
				await goDesk("/desk/item", ".page-head", 4500);
				const faults = await layoutFaults(".main-section", {
					// Frappe's own page furniture stacks legitimately; we are
					// asserting OUR chrome does not collide with itself.
					allowOverlap: [".page-head", ".frappe-list", ".layout-side-section", ".dropdown-menu"],
				});
				expectEq(faults.length, 0, `${layout}/${style}: ${faults.slice(0, 3).join(" | ")}`);
			}
			setSettings({ desk_layout: "Top Bar", status_style: "Quiet" });
		});

		// ── Contrast, measured on the rendered desk (item 32) ──────────────
		await test("rendered tokens clear WCAG 2.2 AA in both modes", async () => {
			// The contrast gate in CI measures a MODEL of the stylesheet. This
			// measures the desk: it reads what getComputedStyle actually resolved
			// and hands those values to the SAME Python implementation, so the
			// ratios CI enforces are tied to pixels at least once per run. A
			// token shadowed by a Frappe rule, lost to a typo, or one that never
			// reaches the element is invisible to the model and caught here.
			await goDesk("/desk/item", ".page-head", 3000);
			const computed = await page.evaluate(() => {
				const html = document.documentElement;
				const before = html.getAttribute("data-theme");
				// Collect every --bnd-* the theme declares anywhere, then resolve
				// each one per mode against the live element.
				const names = new Set();
				for (const sheet of Array.from(document.styleSheets)) {
					let rules;
					try {
						rules = sheet.cssRules;
					} catch {
						continue; // cross-origin sheet; nothing of ours is there
					}
					const walk = (list) => {
						for (const rule of Array.from(list || [])) {
							for (const prop of Array.from(rule.style || [])) {
								if (prop.startsWith("--bnd-")) names.add(prop);
							}
							if (rule.cssRules) walk(rule.cssRules); // @media
						}
					};
					walk(rules);
				}
				const out = { light: {}, dark: {} };
				for (const mode of ["light", "dark"]) {
					html.setAttribute("data-theme", mode);
					const cs = getComputedStyle(html);
					for (const n of names) out[mode][n] = cs.getPropertyValue(n).trim();
				}
				if (before === null) html.removeAttribute("data-theme");
				else html.setAttribute("data-theme", before);
				return out;
			});

			for (const mode of ["light", "dark"]) {
				const n = Object.values(computed[mode]).filter(Boolean).length;
				expect(n > 20, `${mode}: only ${n} --bnd-* tokens resolved to a value`);
			}

			const gate = spawnSync("node", ["tools/contrast.mjs", "--check-computed"], {
				input: JSON.stringify(computed),
				encoding: "utf8",
			});
			expectEq(gate.status, 0, `contrast on rendered tokens:\n${gate.stdout}${gate.stderr}`);
		});

		// ── Direction (item 7d/7-followup) ──────────────────────────────────
		await test("direction: the desk's dir, CSS bundle and JS agree with the language's script", async () => {
			// The EXPECTATION IS DERIVED, never listed: the browser's own CLDR
			// (Intl.Locale textInfo) says which way a language runs. Restating
			// Frappe's ["ar","he","fa","ps"] here would be a second copy of the
			// exact constant under test — the gate would then agree with the
			// bug by construction, which is how ARCHITECTURE.md came to claim
			// "dir is already correct on <html>" for years of languages it is
			// not correct for.
			const derived = (lang) =>
				page.evaluate((l) => {
					const loc = new Intl.Locale(l);
					return (loc.getTextInfo ? loc.getTextInfo() : loc.textInfo).direction;
				}, lang);

			// Both `ar` (always correct upstream) and `ur` (was broken — see
			// docs/upstream/frappe-is-rtl.md) now go through the SAME path:
			// bunood_theme.i18n.rtl_patch corrects frappe.utils.jinja_globals
			// .is_rtl at the module level, which is what bundled_asset() (same
			// module) reads to pick the stylesheet directory, and
			// context.py::desk_context overwrites layout_direction using the
			// same corrected verdict — so `ur` is no longer a KNOWN_BROKEN
			// special case; it is asserted exactly like `ar`, on THREE
			// things that must move together or not at all:
			//   1. <html dir> — the desk shell's own render.
			//   2. Which directory Frappe's own CSS bundles serve from —
			//      measured live (2026-08-13): RTL swaps every frappe/erpnext
			//      /hrms bundle from `/dist/css/` to `/dist/css-rtl/`, not a
			//      `rtl_` filename prefix as jinja_globals.py's source reads;
			//      trust the measurement, not the source text.
			//   3. frappe.utils.is_rtl() — the INDEPENDENT client-side copy of
			//      the same defect (see bunood.js's patch_is_rtl), with no
			//      shared boot field linking it to #1/#2 other than both being
			//      fed the same corrected answer.
			// This is exactly the "half-flip" check the theme's own docs (and
			// setup.py, before this fix) said a partial correction risked —
			// this test is what proves the fix closes both sides together.
			for (const lang of ["ar", "ur"]) {
				await withLang(lang, async () => {
					await goDesk("/desk/item", ".page-head", 2000);
					const want = await derived(lang);
					const got = await page.evaluate((lang) => {
						const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) =>
							l.getAttribute("href")
						);
						return {
							dir: document.documentElement.dir || "ltr",
							coreBundleDirs: links
								.filter((h) => /\/(frappe|erpnext|hrms)\/dist\/css/.test(h || ""))
								.map((h) => (/\/css-rtl\//.test(h) ? "rtl" : "ltr")),
							jsIsRtl:
								window.frappe && frappe.utils && frappe.utils.is_rtl
									? frappe.utils.is_rtl(lang)
									: null,
						};
					}, lang);
					const wantRtl = want === "rtl";
					expectEq(got.dir, want, `dir for lang=${lang}`);
					expect(got.coreBundleDirs.length > 0, `lang=${lang}: no core CSS bundles found to check`);
					expect(
						got.coreBundleDirs.every((d) => d === (wantRtl ? "rtl" : "ltr")),
						`lang=${lang}: core CSS bundle directories disagree with dir=${want} ` +
							`(${JSON.stringify(got.coreBundleDirs)}) — a half-flipped desk`
					);
					expectEq(got.jsIsRtl, wantRtl, `frappe.utils.is_rtl(${lang}) client-side`);
				});
			}

			// setup.RTL_LANGS is a Python fact table this browser cannot
			// import — so the suite holds it to the same CLDR here: every
			// code that list calls RTL must be RTL per Intl too. A typo in
			// the list fails HERE, not silently at render time.
			const rtlLangs = JSON.parse(
				benchPy(
					`from bunood_theme.setup import RTL_LANGS\n` +
					`print(json.dumps(sorted(RTL_LANGS)))\n`
				).trim().split("\n").pop()
			);
			expect(rtlLangs.length >= 8, `setup.RTL_LANGS looks truncated (${rtlLangs.length} entries)`);
			for (const code of rtlLangs) {
				expectEq(await derived(code), "rtl", `setup.RTL_LANGS lists ${code}, but CLDR says`);
			}
		});

		// ── Item 7(e): the runtime translation gates ───────────────────────
		//
		// COVERAGE IS NOT MEASURED HERE. It is a set property of two files and
		// the BUILD enforces it (tools/i18n.mjs); a DOM render can see ~15% of
		// the catalogue at best — 285 msgids live on one settings page, 18 are
		// aria-labels invisible to innerText, and every toast and empty state
		// is mutually exclusive with a healthy run. These two tests assert the
		// two things only a runtime CAN know: that the merged dictionary the
		// server ships actually carries the decisions, and that what the desk
		// paints agrees with them where we looked.

		await test("i18n: the merged dict serves every decision, none as itself", async () => {
			const shipped = readTranslations("bunood_theme/translations/ar.csv");
			const inherited = readInherited("bunood_theme/locale/inherited.ar.txt");
			await withLang("ar", async () => {
				await goDesk("/desk/item", ".page-head", 2000);
				const probe = await page.evaluate(
					(ids) => {
						const dict = (window.frappe && frappe.boot && frappe.boot.__messages) || {};
						const identity = [];
						const missing = [];
						for (const id of ids) {
							const got = dict[id];
							if (got === undefined) missing.push(id);
							else if (got === id) identity.push(id);
						}
						return { identity, missing, size: Object.keys(dict).length };
					},
					[...new Set([...shipped.keys(), ...inherited])]
				);
				// Sentinels pin EXACT values where collision with another app is
				// implausible — a placeholder and a brand-name preset. These
				// prove OUR file is the one being read, not merely that some
				// translation exists.
				const sentinels = await page.evaluate(() => ({
					density: frappe.boot.__messages["Density: {0}"],
					preset: frappe.boot.__messages["Bunood Night"],
				}));
				expectEq(sentinels.density, "الكثافة: {0}", "sentinel Density: {0}");
				expectEq(sentinels.preset, "بنود ليلي", "sentinel Bunood Night");

				// MISSING means the row never reached the runtime — the exact
				// shape of the crm/helpdesk gap, where a PO existed and its .mo
				// was never compiled, and the desk sat English under a green
				// coverage gate. Inherited entries are held to the same bar for
				// that reason: this is the test that notices a recreated
				// sites/ volume silently dropping every compiled .mo.
				expectEq(probe.missing.join("\n"), "", "decisions absent from the merged dict");
				// IDENTITY means a later app erased a translation with a
				// source-as-translation row (ksa_compliance shipped four such;
				// _defend_identity_overrides now heals them on migrate). A
				// GENUINELY different translation from a later app passes
				// here on purpose — which word wins is a vocabulary question
				// for the human review pass, not for a gate.
				expectEq(probe.identity.join("\n"), "", "decisions erased by identity rows");
			});
		});

		await test("i18n: no visible theme-owned label equals its msgid", async () => {
			// THE HONEST NAME for what a DOM assertion can promise: on the
			// pages this test visited, nothing the theme painted showed a
			// source string that has a translation. Never "the desk is
			// translated" — see the section comment.
			const shipped = readTranslations("bunood_theme/translations/ar.csv");
			const inherited = readInherited("bunood_theme/locale/inherited.ar.txt");
			const exempt = readExempt("bunood_theme/locale/untranslatable.txt");
			const translated = [...new Set([...shipped.keys(), ...inherited])].filter(
				(m) => !exempt.has(m)
			);

			// WHOLE-STRING EQUALITY, never substring: "Price List" contains
			// "List" and is ERPNext's data, not our failure. Attributes are
			// searched too — 18 of our msgids are aria-labels, invisible to
			// innerText, and they are exactly the accessibility strings item 7
			// most owes a translation.
			const collect = () =>
				page.evaluate((ids) => {
					const set = new Set(ids);
					const seen = [];
					const vis = (el) => {
						// The suite's one visibility predicate (rect + display),
						// as used by the critical-reach tests. Do not invent a
						// second; two predicates is how a box gets counted by
						// one test and denied by another.
						const r = el.getBoundingClientRect();
						return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
					};
					// Parts AND classes, because each misses what the other
					// covers: parts miss the palette rows and pickers; classes
					// miss the pagehead cluster, which is stamped onto Frappe's
					// own DOM. Plus the two out-of-tree hosts our toasts and
					// dialogs actually land in.
					const roots = document.querySelectorAll(
						'[data-bnd-part], [class*="bnd-"], .msgprint-dialog, #alert-container'
					);
					const record = (el, text, how) => {
						const t = (text || "").trim();
						if (t && set.has(t)) {
							seen.push(`${how} ${JSON.stringify(t)} in ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]}`);
						}
					};
					for (const root of roots) {
						for (const el of [root, ...root.querySelectorAll("*")]) {
							// Server-supplied record text is whoever created the
							// record's, in whatever language they typed it.
							if (el.closest("[data-doctype], [data-name]")) continue;
							if (!vis(el)) continue;
							if (el.children.length === 0) record(el, el.textContent, "text");
							for (const attr of ["aria-label", "title", "placeholder"]) {
								record(el, el.getAttribute(attr), attr);
							}
						}
					}
					return [...new Set(seen)];
				}, translated);

			await withLang("ar", async () => {
				const offenders = [];
				// The chrome: bars, sidebar utils, crumbs, status segments.
				await goDesk("/desk/item", ".page-head", 2500);
				offenders.push(...(await collect()).map((o) => `desk: ${o}`));
				// The palette, open with its empty-state suggestions.
				setSettings({ palette_style: "Bunood Palette", enable_command_palette: 1 });
				await goDesk("/desk/item", ".page-head", 2500);
				await page.keyboard.press("Control+k");
				await page.waitForSelector(".bnd-palette-backdrop:not([hidden])", { timeout: 6000 }).catch(() => {});
				offenders.push(...(await collect()).map((o) => `palette: ${o}`));
				await page.keyboard.press("Escape");
				// The inbox panel, by identity, tolerating a desk whose bell
				// placement leaves no themed bell — the panel is then not ours
				// to inspect.
				const bell = await q('[data-bnd-part="bell"]');
				if (bell) {
					await page.click('[data-bnd-part="bell"]');
					await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 6000 }).catch(() => {});
					offenders.push(...(await collect()).map((o) => `inbox: ${o}`));
					await page.keyboard.press("Escape");
				}
				// The stacked settings form — the single densest surface: 285
				// of the catalogue's msgids render only here.
				await goDesk("/desk/theme-settings?shell=0", ".bnd-dgm-slot", 3500);
				offenders.push(...(await collect()).map((o) => `settings: ${o}`));

				expectEq(offenders.join("\n"), "", "theme-owned strings rendering untranslated");
			});
		});

		await test("i18n: the Translations surface renders and its manual save lands", async () => {
			// The scan itself is NOT run here — a ten-app sweep is minutes of
			// queue time, and the ledger's arithmetic is held by its own
			// cross-check (scan set == direct measure, verified at build-out).
			// What the suite holds is the click path the plan named as this
			// feature's bar: the shell entry opens, the pane paints from
			// whatever state the server has, and a translation typed into the
			// pane's own inputs reaches the merged dictionary.
			await goDesk("/desk/theme-settings", ".bnd-shell", 2500);
			await page.evaluate(() => {
				const hit = [...document.querySelectorAll('.bnd-shell [data-key="translations"]')][0];
				if (hit) hit.click();
			});
			await page.waitForSelector(".bnd-tc", { timeout: 15000 });
			await page.waitForTimeout(800);
			expect(
				await page.evaluate(() => !!(document.querySelector(".bnd-tc-status") || {}).textContent),
				"the pane paints a status line"
			);
			await page.fill(".bnd-tc-src", "BND Suite Probe");
			await page.fill(".bnd-tc-dst", "تجربة الحزمة");
			await page.click('[data-act="save"]');
			await page.waitForTimeout(1500);
			const served = benchPy(
				`from frappe.translate import get_all_translations\n` +
				`frappe.translate.clear_cache()\n` +
				`print("SERVED=" + get_all_translations("ar").get("BND Suite Probe", "(missing)"))\n` +
				// Reap in the same call: a probe row must not outlive its test,
				// or the next i18n gate counts it as somebody's translation.
				`for n in frappe.get_all("Translation", filters={"language": "ar", "source_text": "BND Suite Probe"}, pluck="name"):\n` +
				`    frappe.delete_doc("Translation", n, force=True, ignore_permissions=True)\n` +
				`frappe.db.commit(); frappe.translate.clear_cache()\n`
			).match(/SERVED=(.*)/)[1];
			expectEq(served, "تجربة الحزمة", "the pane's save reaches the merged dict");
		});

		await test("i18n: import_translations_csv preserves whitespace-bearing sources", async () => {
			// Found auditing the 6,721-row cross-app Arabic fill (2026-08-13): 55 of
			// those rows carried meaningful leading/trailing whitespace (" App Name",
			// help-text blocks with a trailing "\n"). import_translations_csv called
			// `.strip()` on both CSV columns before storing them, so a source of
			// " App Name" landed under the DIFFERENT key "App Name" — Frappe's
			// dictionary is exact-match, so `_(" App Name")` never found it and
			// silently rendered English forever. The scan ledger even reported the
			// string "missing" AFTER a successful-looking import, which is what
			// surfaced this: a re-scan is the only way this class of defect shows.
			const probeSrc = " BND Whitespace Probe ";
			const probeDst = " ترجمة تجريبية ";
			const csv = `"${probeSrc}","${probeDst}"\n`;
			const out = benchPy(
				`import json\n` +
					`from bunood_theme.i18n.apply import import_translations_csv\n` +
					`content = json.loads(${JSON.stringify(JSON.stringify(csv))})\n` +
					`probe_src = json.loads(${JSON.stringify(JSON.stringify(probeSrc))})\n` +
					`counts = import_translations_csv("ar", content)\n` +
					`from frappe.translate import get_all_translations\n` +
					`frappe.translate.clear_cache()\n` +
					`served = get_all_translations("ar").get(probe_src, "(missing)")\n` +
					`print("RESULT=" + json.dumps({"counts": counts, "served": served}))\n` +
					`for n in frappe.get_all("Translation", filters={"language": "ar", "source_text": probe_src}, pluck="name"):\n` +
					`    frappe.delete_doc("Translation", n, force=True, ignore_permissions=True)\n` +
					`frappe.db.commit(); frappe.translate.clear_cache()\n`
			).match(/RESULT=(.*)/)[1];
			const { counts, served } = JSON.parse(out);
			expectEq(counts.created, 1, "the whitespace-bearing probe row must be created");
			expectEq(
				served,
				probeDst,
				"a whitespace-bearing source must round-trip through CSV import under its EXACT key"
			);
		});

		await test("i18n: upsert_translation does not merge across a case collision", async () => {
			// Found in the SAME audit as the whitespace defect above, minutes later:
			// MariaDB's default collation is case-INSENSITIVE, so upsert_translation's
			// lookup filter `{"source_text": "Amber"}` also matched a pre-existing row
			// storing "amber" (lowercase) — and updating THAT row's translated_text
			// left source_text lowercase forever. Frappe's runtime dictionary is a
			// plain, case-SENSITIVE Python dict, so `_("Amber")` never found it: 65 of
			// the 6,721-row fill vanished this way, each looking like a clean
			// "updated" at the time it happened. This probe manufactures the exact
			// collision — a pre-existing lowercase row, then an upsert of the
			// differently-cased source — and requires BOTH a new row AND the old
			// row's untouched survival, because a fix that deletes/merges the
			// lowercase row would break whatever legitimately looks it up.
			const lower = "bnd case probe";
			const upper = "BND Case Probe";
			const out = benchPy(
				`import json\n` +
					`from bunood_theme.i18n.apply import upsert_translation\n` +
					`lower = json.loads(${JSON.stringify(JSON.stringify(lower))})\n` +
					`upper = json.loads(${JSON.stringify(JSON.stringify(upper))})\n` +
					`frappe.get_doc({"doctype": "Translation", "language": "ar", "source_text": lower, "translated_text": "الأصل"}).insert(ignore_permissions=True)\n` +
					`frappe.db.commit()\n` +
					`outcome = upsert_translation("ar", upper, "الصحيح")\n` +
					`frappe.db.commit(); frappe.translate.clear_cache()\n` +
					`from frappe.translate import get_all_translations\n` +
					`d = get_all_translations("ar")\n` +
					// A plain get_value filtered by source_text is ITSELF subject to the
					// same case-insensitive collation this test exists to catch — with
					// both rows now present, MariaDB's LIMIT 1 (no ORDER BY) is free to
					// return either one. The verification has to do exactly what the fix
					// does: pull every case-insensitive match, then keep only the row
					// whose source_text is byte-for-byte the one asked for.
					`candidates = frappe.db.sql("SELECT source_text, translated_text FROM \`tabTranslation\` WHERE language=%s AND source_text=%s", ("ar", lower), as_dict=True)\n` +
					`exact = [r for r in candidates if r.source_text == lower]\n` +
					`lower_row = exact[0].translated_text if exact else "(missing)"\n` +
					`print("RESULT=" + json.dumps({"outcome": outcome, "served_upper": d.get(upper, "(missing)"), "lower_row_survived": lower_row}))\n` +
					`for n in frappe.get_all("Translation", filters={"language": "ar", "source_text": ["in", [lower, upper]]}, pluck="name"):\n` +
					`    frappe.delete_doc("Translation", n, force=True, ignore_permissions=True)\n` +
					`frappe.db.commit(); frappe.translate.clear_cache()\n`
			).match(/RESULT=(.*)/)[1];
			const { outcome, served_upper, lower_row_survived } = JSON.parse(out);
			expectEq(outcome, "created", "a case-different source must CREATE, never merge into the existing row");
			expectEq(served_upper, "الصحيح", "the exact-case key must serve its own translation");
			expectEq(lower_row_survived, "الأصل", "the pre-existing differently-cased row must be untouched");
		});

		await test("placement: Off never removes the LAST route to a critical control", async () => {
			// The Dock layout hides the whole sidebar by layout rule, so the stock
			// bell and user button exist but cannot be clicked. Switching our
			// replacement Off there used to leave a desk with no notifications and
			// no way to log out — the same defect status style "Off" caused in the
			// Bottom Bar layout, which is why this asserts REACHABILITY rather
			// than the presence of any particular node.
			const reachable = (sel) =>
				page.evaluate((s) => {
					const n = document.querySelector(s);
					return !!(n && n.offsetParent !== null);
				}, sel);

			setSettings({ desk_layout: "Dock", inbox_placement: "Off", user_placement: "Off" });
			await goDesk("/desk/item", ".bnd-dock", 4500);
			expect(
				(await reachable(".bnd-avatar-btn")) || (await reachable(".body-sidebar .sidebar-user-button")),
				"Dock + user Off: no reachable route to the user menu (no log out)"
			);
			expect(
				(await reachable(".bnd-bell")) || (await reachable(".body-sidebar .sidebar-notification")),
				"Dock + bell Off: no reachable route to notifications"
			);

			// And where the stock control IS reachable, Off must still work —
			// otherwise the guard above would have turned Off into a no-op.
			setSettings({ desk_layout: "Top Bar", inbox_placement: "Off", user_placement: "Off" });
			await goDesk("/desk/item", ".bnd-topbar", 4500);
			expectEq(await q(".bnd-avatar-btn"), false, "Top Bar + user Off should remove ours");
			expect(
				await reachable(".body-sidebar .sidebar-user-button"),
				"Top Bar + user Off: the stock button must be released, not left hidden"
			);

			setSettings({ desk_layout: "Top Bar", inbox_placement: "Top Bar End", user_placement: "Top Bar End" });
		});

		await test("placement: Compact keeps it across a route change", async () => {
			// Compact rebuilds its cluster on every navigation, because Frappe
			// swaps the page element out. It used to rebuild the bell and avatar
			// unconditionally, so a placement applied on load was undone by the
			// first route change — the setting appeared to work once, then quietly
			// revert. Two routes, because one proves nothing here.
			setSettings({ desk_layout: "Compact", user_placement: "Off", inbox_placement: "Off" });
			await goDesk("/desk/item", ".page-head", 4000);
			const first = await page.evaluate(() => document.querySelectorAll(".bnd-avatar-btn").length);

			await goDesk("/desk/user", ".page-head", 4000);
			const afterRoute = await page.evaluate(() => document.querySelectorAll(".bnd-avatar-btn").length);
			expectEq(afterRoute, first, `route change changed the avatar count (${first} -> ${afterRoute})`);

			// Whatever the count, the route to the user menu must survive both.
			expect(
				await page.evaluate(() => {
					const n = document.querySelector(".bnd-avatar-btn, .body-sidebar .sidebar-user-button");
					return !!(n && n.offsetParent !== null);
				}),
				"Compact lost every reachable route to the user menu after a route change"
			);

			setSettings({ desk_layout: "Top Bar", user_placement: "Top Bar End", inbox_placement: "Top Bar End" });
		});

		// ── Console error budget ───────────────────────────────────────────
		// ── 34a: accessibility contracts ───────────────────────────────────
		//
		// The kits used ARIA and handled Esc from the start; NONE of it was
		// asserted (GUIDELINES §2.3), so every attribute here had already
		// drifted or half-lied somewhere when the 34a audit looked: a tablist
		// with no tabs, a dialog whose focus() was a silent no-op, an Esc
		// behind a preference. These tests are the difference between "uses
		// ARIA" and "keeps its ARIA promises".

		await test("a11y: the palette is a combobox and focus comes back where it left", async () => {
			setSettings({ desk_layout: "Top Bar", topbar_enabled: 1, search_placement: "Top Bar Center", palette_style: "Bunood Palette" });
			await goDesk("/desk/item", ".page-head", 3000);
			// Open FROM the trigger, so "restore" has something real to claim.
			await page.focus(".bnd-search-field");
			await page.keyboard.press("Enter");
			await page.waitForSelector(".bnd-palette-backdrop:not([hidden])", { timeout: 5000 });
			const open = await page.evaluate(() => {
				const input = document.querySelector(".bnd-palette-input");
				return {
					focusInInput: document.activeElement === input,
					role: input.getAttribute("role"),
					expanded: input.getAttribute("aria-expanded"),
					controls: input.getAttribute("aria-controls"),
					listId: (document.querySelector(".bnd-palette-list") || {}).id,
				};
			});
			expect(open.focusInInput, "focus lands in the input");
			expectEq(open.role, "combobox", "the input is a combobox");
			expectEq(open.controls, open.listId, "aria-controls points at the listbox");
			// The selection moves without focus moving — activedescendant is
			// the contract, asserted as a TRANSITION.
			const before = await page.evaluate(() =>
				document.querySelector(".bnd-palette-input").getAttribute("aria-activedescendant")
			);
			await page.keyboard.press("ArrowDown");
			const after = await page.evaluate(() => {
				const input = document.querySelector(".bnd-palette-input");
				const active = input.getAttribute("aria-activedescendant");
				const marked = document.querySelectorAll('.bnd-palette-row[aria-selected="true"]');
				return { active, markedCount: marked.length, markedId: marked.length === 1 ? marked[0].id : null };
			});
			expect(after.active && after.active !== before, "aria-activedescendant moved with the arrow");
			expectEq(after.markedCount, 1, "exactly one option is aria-selected");
			expectEq(after.active, after.markedId, "activedescendant names the selected option");
			// Tab is trapped — aria-modal promised it.
			await page.keyboard.press("Tab");
			expect(
				await page.evaluate(() => document.activeElement === document.querySelector(".bnd-palette-input")),
				"Tab stays inside the dialog"
			);
			// Two-stage Esc, then focus is back on the trigger.
			await page.keyboard.press("Escape");
			// state:"attached", NOT the default: the default wait is for
			// visibility, and a [hidden] element is precisely never visible.
			await page.waitForSelector(".bnd-palette-backdrop[hidden]", { state: "attached", timeout: 5000 });
			const back = await page.evaluate(() => ({
				same: document.activeElement === document.querySelector(".bnd-search-field"),
				at: (document.activeElement.className || document.activeElement.tagName || "").toString().slice(0, 60),
			}));
			expect(back.same, `focus returned to the control that opened it (landed on: ${back.at})`);
		});

		await test("a11y: inbox Esc is not a preference, and focus returns to the bell", async () => {
			// Shortcuts OFF is the state that used to trap users: Esc sat
			// behind the same guard as j/k/e, so the panel could be opened
			// from the bell and never left without a mouse.
			setSettings({
				desk_layout: "Top Bar", topbar_enabled: 1, inbox_style: "Bunood Inbox",
				inbox_placement: "Top Bar End", inbox_keyboard: 0,
			});
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click(".bnd-bell");
			await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 5000 });
			const open = await page.evaluate(() => ({
				focusInPanel: document.activeElement === document.querySelector(".bnd-inbox"),
				modal: document.querySelector(".bnd-inbox").getAttribute("aria-modal"),
				expanded: document.querySelector(".bnd-bell").getAttribute("aria-expanded"),
				closeBtn: !!document.querySelector(".bnd-inbox-close"),
			}));
			expect(open.focusInPanel, "the dialog actually took focus (tabindex was the missing piece)");
			expectEq(open.modal, "true", "the panel says it is modal");
			expectEq(open.expanded, "true", "the bell says its popup is open");
			expect(open.closeBtn, "a visible close control exists");
			await page.keyboard.press("Escape");
			await page.waitForSelector(".bnd-inbox-backdrop[hidden]", { state: "attached", timeout: 5000 });
			const back = await page.evaluate(() => ({
				same: document.activeElement === document.querySelector(".bnd-bell"),
				at: (document.activeElement.className || document.activeElement.tagName || "").toString().slice(0, 60),
			}));
			expect(back.same, `focus returned to the bell (landed on: ${back.at})`);
			expectEq(
				await page.evaluate(() => document.querySelector(".bnd-bell").getAttribute("aria-expanded")),
				"false",
				"the bell says its popup closed"
			);
		});

		await test("a11y: the inbox's filters say which one is on", async () => {
			// Downgraded from role=tablist/tab (item 22): what these filter is
			// a role=listbox a few lines down, which cannot ALSO be a
			// tabpanel, and a tablist promises arrow-key movement that
			// inbox_keydown already owns here for row triage — two arrow
			// contracts in one dialog. aria-pressed is this codebase's
			// existing idiom for an option chip that says its own selection.
			// axe cannot catch a wrong role here — no wcag2a/2aa rule
			// requires a tabpanel, and .bnd-inbox is already in the hard
			// gate and green — so this suite contract is the only mechanism,
			// which is §2.3's whole thesis.
			setSettings({
				desk_layout: "Top Bar", topbar_enabled: 1, inbox_style: "Bunood Inbox",
				inbox_placement: "Top Bar End",
			});
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click(".bnd-bell");
			await page.waitForSelector(".bnd-inbox-tabs", { timeout: 5000 });

			const state = () =>
				page.evaluate(() =>
					[...document.querySelectorAll(".bnd-inbox-tab")].map((b) => ({
						pressed: b.getAttribute("aria-pressed"),
						on: b.classList.contains("bnd-inbox-tab-on"),
					}))
				);
			let s = await state();
			expectEq(s.length, 5, `all five filters are present (found ${s.length})`);
			expect(
				s.every((t) => t.pressed === "true" || t.pressed === "false"),
				"every filter states pressed true or false, never absent"
			);
			expectEq(s.filter((t) => t.pressed === "true").length, 1, "exactly one filter reads pressed");
			expect(s.every((t) => (t.pressed === "true") === t.on), "the attribute agrees with the visual state");

			// Click a different filter, and assert BOTH halves moved together.
			await page.evaluate(() => {
				const btns = [...document.querySelectorAll(".bnd-inbox-tab")];
				const off = btns.find((b) => b.getAttribute("aria-pressed") !== "true");
				if (off) off.click();
			});
			await page.waitForTimeout(500);
			s = await state();
			expectEq(s.filter((t) => t.pressed === "true").length, 1, "still exactly one, after the click");
			expect(s.every((t) => (t.pressed === "true") === t.on), "the attribute and the visual state moved together");
			await page.keyboard.press("Escape");
		});

		await test("a11y: the bell's name and badge agree about unread", async () => {
			// The badge's text is masked by the bell's aria-label under accname
			// rules, so the LABEL carries the count. The two must agree: digits
			// in the label exactly when the badge shows.
			setSettings({ desk_layout: "Top Bar", topbar_enabled: 1, inbox_style: "Bunood Inbox", inbox_placement: "Top Bar End", inbox_badge: "Count" });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click(".bnd-bell");
			await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 5000 });
			await page.waitForFunction(
				() => !document.querySelector(".bnd-inbox-empty") || !/Loading/.test(document.querySelector(".bnd-inbox-empty").textContent),
				{ timeout: 8000 }
			).catch(() => {});
			const state = await page.evaluate(() => {
				const bell = document.querySelector(".bnd-bell");
				const badge = bell.querySelector(".bnd-inbox-badge");
				return {
					label: bell.getAttribute("aria-label") || "",
					badgeShown: !!badge && !badge.hasAttribute("hidden") && badge.textContent.trim() !== "",
				};
			});
			expectEq(
				/\d/.test(state.label),
				state.badgeShown,
				`label "${state.label}" and badge visibility (${state.badgeShown}) tell one story`
			);
			await page.keyboard.press("Escape");
		});

		await test("a11y: the settings rail is a real tablist", async () => {
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			const shape = await page.evaluate(() => {
				const items = [...document.querySelectorAll(".bnd-shell-item")];
				return {
					allTabs: items.every((n) => n.getAttribute("role") === "tab"),
					selected: items.filter((n) => n.getAttribute("aria-selected") === "true").length,
					tabStops: items.filter((n) => n.getAttribute("tabindex") === "0").length,
				};
			});
			expect(shape.allTabs, "every entry is role=tab");
			expectEq(shape.selected, 1, "exactly one entry is selected");
			expectEq(shape.tabStops, 1, "exactly one entry is the Tab stop (roving tabindex)");
			// Arrows move the selection AND the focus — asserted as a transition.
			const moved = await page.evaluate(() => {
				const first = document.querySelector('.bnd-shell-item[tabindex="0"]');
				first.focus();
				const beforeKey = first.getAttribute("data-key");
				first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
				const now = document.activeElement;
				return {
					beforeKey,
					afterKey: now.classList.contains("bnd-shell-item") ? now.getAttribute("data-key") : null,
					afterSelected: now.getAttribute && now.getAttribute("aria-selected"),
				};
			});
			expect(moved.afterKey && moved.afterKey !== moved.beforeKey, "ArrowDown moved to the next entry");
			expectEq(moved.afterSelected, "true", "the focused entry became the selected one");
		});

		await test("a11y: the board reorders without a pointer", async () => {
			// Design pick 1A end to end: arm by click (a keyboard Enter on a
			// button IS a click), nudge with the arrows the armed chip grows,
			// and land on the same desk_order the drag path writes.
			//
			// The zone itself is asserted as role=group, NOT role=button
			// (item 22): role=button gave every chip inside it Children
			// Presentational: True, so the chips that ARE the components
			// could be flattened out of the accessibility tree. It carries
			// no tabindex either — the keyboard route to a DIFFERENT zone is
			// the armed chip's own "Move to…" menu (the next test), never
			// the zone itself.
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1,
				inbox_placement: "Top Bar End", user_placement: "Top Bar End",
				desk_order: "search,inbox,user,home,apps",
			});
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });
			const zoneOk = await page.evaluate(() => {
				const zone = document.querySelector('.bnd-bd-zone[data-slot="Top Bar End"]');
				return { tabindex: zone.getAttribute("tabindex"), role: zone.getAttribute("role"), named: !!zone.getAttribute("aria-label") };
			});
			expectEq(zoneOk.tabindex, null, "drop zones carry no tabindex — nothing about them is a keyboard stop");
			expectEq(zoneOk.role, "group", "drop zones are named groups, not controls");
			expect(zoneOk.named, "drop zones have names");
			await page.click('.bnd-bd-chip[data-tenant="user"]');
			await page.waitForSelector(".bnd-bd-nudge", { timeout: 5000 });
			expectEq(
				await page.evaluate(() => document.querySelector('.bnd-bd-chip[data-tenant="user"]').getAttribute("aria-pressed")),
				"true",
				"the armed chip says it is picked up"
			);
			await page.evaluate(() => {
				const earlier = document.querySelector(".bnd-bd-nudge .bnd-bd-nudge-btn");
				earlier.click();
			});
			await page.waitForFunction(() => window.cur_frm && !window.cur_frm.is_dirty(), { timeout: 20000 });
			const order = getSettings(["desk_order"]).desk_order;
			expect(
				order.indexOf("user") < order.indexOf("inbox"),
				`one nudge moved user before inbox (${order})`
			);
			// And the bar survived its own write — the re-render used to
			// dismantle the control mid-use.
			expect(await q(".bnd-bd-nudge"), "the nudge bar is still there after the write");
			// Focus follows the chip through the re-render (item 22) — every
			// mutation used to drop focus out of the document entirely.
			expect(
				await page.evaluate(
					() => document.activeElement === document.querySelector('.bnd-bd-chip[data-tenant="user"]')
				),
				"focus stayed on the moved chip after the re-render"
			);
		});

		await test("a11y: a chip moves zone without a pointer", async () => {
			// The other half of the split: WHICH zone is now a menu on the
			// armed chip, listing only what bnd_field_slots offers — the
			// 9-of-15-zones-silently-refuse problem search's own narrow slot
			// list used to create (search has no Off, no page header, no `*`
			// End) simply cannot happen when the menu never lists them.
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, bottombar_enabled: 1,
				search_placement: "Top Bar Center",
			});
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="placement"]');
			await page.waitForSelector(".bnd-bd", { timeout: 8000 });

			await page.click('.bnd-bd-chip[data-tenant="search"]');
			await page.waitForSelector(".bnd-bd-move-btn", { timeout: 5000 });
			await page.click(".bnd-bd-move-btn");
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });

			const offered = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-menu .bnd-menu-item")].map((n) => n.textContent.trim())
			);
			expect(offered.length > 0, "the menu lists at least one legal zone");
			expect(
				!offered.some((label) => /off/i.test(label)),
				`search has no Off, so the menu never offers it (offered: ${offered.join(", ")})`
			);
			expect(
				!offered.some((label) => /page header/i.test(label)),
				`search has no page-header slug, so the menu never offers it (offered: ${offered.join(", ")})`
			);

			// Pick the option that is not where search already is.
			await page.evaluate(() => {
				const items = [...document.querySelectorAll(".bnd-menu .bnd-menu-item")];
				const other = items.find((n) => n.textContent.trim() !== "Top Bar · Center") || items[0];
				other.click();
			});
			await page.waitForFunction(() => window.cur_frm && !window.cur_frm.is_dirty(), { timeout: 20000 });
			expect(
				getSettings(["search_placement"]).search_placement !== "Top Bar Center",
				`the menu pick moved search_placement off its starting slot (now: ${getSettings(["search_placement"]).search_placement})`
			);
			// The live region said so, and focus followed the chip.
			const after = await page.evaluate(() => ({
				status: (document.querySelector(".bnd-bd-status") || {}).textContent || "",
				onChip: document.activeElement === document.querySelector('.bnd-bd-chip[data-tenant="search"]'),
			}));
			expect(after.status.length > 0, `the board announced the move (status: "${after.status}")`);
			expect(after.onChip, "focus followed the moved chip");
		});

		await test("a11y: switches say their state, options say their selection", async () => {
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="crumbs"]');
			await page.waitForTimeout(600);
			const shape = await page.evaluate(() => {
				const toggles = [...document.querySelectorAll(".bnd-cbp-toggle")].filter((n) => n.offsetParent);
				const opts = [...document.querySelectorAll(".bnd-cbp-opt")].filter((n) => n.offsetParent);
				return {
					toggleCount: toggles.length,
					allSwitches: toggles.every((n) => n.getAttribute("role") === "switch" && ["true", "false"].includes(n.getAttribute("aria-checked"))),
					knobAgrees: toggles.every((n) => (n.getAttribute("aria-checked") === "true") === !!n.querySelector(".bnd-cbp-knob-on")),
					optCount: opts.length,
					allPressed: opts.every((n) => ["true", "false"].includes(n.getAttribute("aria-pressed"))),
					pressedAgrees: opts.every((n) => (n.getAttribute("aria-pressed") === "true") === n.classList.contains("bnd-cbp-on")),
				};
			});
			expect(shape.toggleCount > 0, "the pane has switches to check");
			expect(shape.allSwitches, "every toggle is role=switch with aria-checked");
			expect(shape.knobAgrees, "aria-checked agrees with the visual knob");
			expect(shape.optCount > 0, "the pane has option chips to check");
			expect(shape.allPressed, "every option chip carries aria-pressed");
			expect(shape.pressedAgrees, "aria-pressed agrees with the visual selection");
		});

		await test("a11y: every icon control has a name", async () => {
			// The regression net: a control whose accessible name is empty (or
			// a bare glyph) is invisible to a screen reader. One contract, two
			// routes — a fully-furnished desk AND every settings pane, not
			// two separate tests, because splitting by route would let one
			// route's failure hide behind the other's name. The settings
			// route is the one that matters here: axe never flags a
			// single-digit aria-label (it IS an accessible name), only this
			// sweep's own stricter length rule does.
			const findNameless = () =>
				page.evaluate(() => {
					const out = [];
					for (const n of document.querySelectorAll('button[class*="bnd-"], [role="button"][class*="bnd-"]')) {
						if (!n.offsetParent) continue;
						const name = (n.getAttribute("aria-label") || n.textContent || "").trim();
						// A one-character name is a glyph, not a name.
						if (name.length < 2) out.push(n.className.split(" ")[0] + (name ? ` ("${name}")` : " (empty)"));
					}
					return out;
				});

			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, bottombar_enabled: 1, sidebar_enabled: 1,
				inbox_placement: "Top Bar End", user_placement: "Top Bar End",
			});
			await goDesk("/desk/item", ".page-head", 4000);
			const nameless = new Set(await findNameless());

			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await walkSettingsPanes(async () => {
				for (const n of await findNameless()) nameless.add(n);
			});

			expectEq([...nameless].join(", "), "", "no visible bnd control is nameless");
		});

		await test("a11y: resting controls are identifiable (the 3B rule)", async () => {
			// Item 32's hand-off, enforced: a control identifies itself at rest
			// by a >=3:1 border OR a fill delta against its host. These two
			// rested on a 1.2-1.5:1 hairline with a near-zero delta; the rule
			// says the delta must be real, so this measures it.
			setSettings({ desk_layout: "Top Bar", topbar_enabled: 1, search_placement: "Top Bar Center" });
			await goDesk("/desk/item", ".page-head", 3000);
			const delta = await page.evaluate(() => {
				const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
				const dist = (a, b) => {
					const pa = parse(a), pb = parse(b);
					return Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]));
				};
				const field = document.querySelector(".bnd-search-field");
				const bar = document.querySelector(".bnd-topbar");
				return dist(getComputedStyle(field).backgroundColor, getComputedStyle(bar).backgroundColor);
			});
			expect(delta >= 5, `the search field's fill differs from the bar (channel delta ${delta})`);
		});

		await test("a11y: the active sidebar pill's label clears AA on its fill", async () => {
			// Item 32's OTHER hand-off, and 34a's own bug: the categorical hues
			// were fitted to be INK on a pane, never a FILL under a label — but
			// Solid Pill used the wash hue as its fill whenever a wash was on,
			// with the label set per colour mode independently, and the two
			// drifted. Three configurations, three different failure families:
			// Match Theme only failed at a mid-luminance seed (#7f7f7f, already
			// a contrast_gate.py seed — not reproduced here without touching
			// brand_color, which is not a suite-mutable field); Dark Contrast
			// failed at every hue regardless of seed (measured live before the
			// fix: 2.40:1); the brand pane failed with the wash OFF, the raw
			// seed under its own brand-solid fill (measured live: 1.07:1).
			const configs = [
				{ label: "Match Theme + Rich wash", settings: {
					sidebar_color: "Match Theme", sidebar_active_style: "Solid Pill",
					sidebar_hue_wash: "Rich", sidebar_section_layout: "Mini-Cards",
				} },
				{ label: "Dark Contrast + Rich wash", settings: {
					sidebar_color: "Dark Contrast", sidebar_active_style: "Solid Pill",
					sidebar_hue_wash: "Rich", sidebar_section_layout: "Mini-Cards",
				} },
				{ label: "Brand pane, wash off", settings: {
					sidebar_color: "Brand", sidebar_active_style: "Solid Pill",
					sidebar_hue_wash: "Off", sidebar_section_layout: "Plain",
				} },
			];
			const pairs = [];
			for (const { label, settings } of configs) {
				setSettings(settings);
				await goDesk("/desk/item", ".body-sidebar-container", 2500);
				// Frappe's own DOM, not ours — no data-bnd-part, so the native
				// marker is the honest selector. Assert it was FOUND before
				// measuring, or a missing element reads as a silent pass.
				const found = await page.evaluate(() => {
					const el = document.querySelector(".body-sidebar .standard-sidebar-item.active-sidebar");
					if (!el) return null;
					const cs = getComputedStyle(el);
					return { color: cs.color, bg: cs.backgroundColor };
				});
				expect(found, `${label}: an active sidebar item exists to measure`);
				pairs.push({ fg: found.color, bg: found.bg, need: 4.5, why: `sidebar pill, ${label}` });
			}
			const gate = spawnSync("node", ["tools/contrast.mjs", "--check-measured"], {
				input: JSON.stringify(pairs),
				encoding: "utf8",
			});
			expectEq(gate.status, 0, `active-pill label contrast:\n${gate.stdout}${gate.stderr}`);
		});

		await test("a11y: the skip link is the first Tab and it skips", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, sidebar_enabled: 1 });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.evaluate(() => document.activeElement && document.activeElement.blur());
			await page.keyboard.press("Tab");
			const hit = await page.evaluate(() => ({
				ok: document.activeElement.classList.contains("bnd-skip-link"),
				at: (document.activeElement.className || document.activeElement.tagName || "").toString().slice(0, 60),
				first: (document.body.firstElementChild.className || "").slice(0, 40),
			}));
			expect(hit.ok, `first Tab lands on the skip link (landed on: ${hit.at}; body first child: ${hit.first})`);
			expect(
				await page.evaluate(() => {
					const cs = getComputedStyle(document.querySelector(".bnd-skip-link"));
					return cs.opacity !== "0";
				}),
				"the focused skip link is visible"
			);
			await page.keyboard.press("Enter");
			expect(
				await page.evaluate(() => !!document.activeElement.closest(".main-section")),
				"activating it moves focus into the page"
			);
		});

		// ── The avatar menu (item 22) ────────────────────────────────────────
		//
		// .bnd-menu is body-appended, outside every axe root, and until now had
		// no focus contract, no keyboard path and no test — despite carrying
		// Log Out, the critical-reach function HANDOVER §7 exists to protect.
		// The avatar's own menu is scanned/driven here because it carries the
		// identity header, the one content-model risk none of the other three
		// show_menu() callers has.

		await test("a11y: the menu takes focus when it opens, and gives it back", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click('[data-bnd-part="user"]');
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });
			const opened = await page.evaluate(() => {
				const active = document.activeElement;
				return {
					insideMenu: !!(active && active.closest(".bnd-menu")),
					isFirstItem: !!(active && active === document.querySelector(".bnd-menu .bnd-menu-item")),
					expanded: document.querySelector('[data-bnd-part="user"]').getAttribute("aria-expanded"),
				};
			});
			expect(opened.insideMenu, "focus moved inside the menu on open");
			expect(opened.isFirstItem, "focus landed on the first menu item");
			expectEq(opened.expanded, "true", "the trigger says it is expanded");

			// Esc: closes, restores focus, must not leave it on <body> — the
			// exact defect e2a4926 fixed for the palette/inbox, by consuming
			// the keypress before Frappe's own document-level handling reacts
			// too. Report where focus actually landed, per that fix's lesson.
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);
			const closed = await page.evaluate(() => ({
				gone: !document.querySelector(".bnd-menu"),
				onTrigger: document.activeElement === document.querySelector('[data-bnd-part="user"]'),
				at: (document.activeElement.className || document.activeElement.tagName || "").toString().slice(0, 60),
				expanded: document.querySelector('[data-bnd-part="user"]').getAttribute("aria-expanded"),
			}));
			expect(closed.gone, "Escape removed the menu");
			expect(closed.onTrigger, `focus returned to the trigger (landed on: ${closed.at})`);
			expectEq(closed.expanded, "false", "the trigger says it is collapsed again");
		});

		await test("a11y: the menu moves on arrows, wraps, and Home/End jump", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click('[data-bnd-part="user"]');
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });

			const label = () =>
				page.evaluate(() => (document.activeElement && document.activeElement.textContent || "").trim());
			const lastLabel = () =>
				page.evaluate(() => {
					const items = [...document.querySelectorAll(".bnd-menu .bnd-menu-item")];
					return (items[items.length - 1].textContent || "").trim();
				});

			const first = await label();
			await page.keyboard.press("ArrowDown");
			const second = await label();
			expect(second !== first, `ArrowDown moved focus (was "${first}", now "${second}")`);

			await page.keyboard.press("ArrowUp");
			expectEq(await label(), first, "ArrowUp moved back to the first item");

			// From the first item, ArrowUp wraps to the LAST — the case a
			// naive index - 1 gets wrong.
			await page.keyboard.press("ArrowUp");
			const last = await lastLabel();
			expectEq(await label(), last, "ArrowUp from the first item wraps to the last");

			await page.keyboard.press("Home");
			expectEq(await label(), first, "Home jumps to the first item");

			await page.keyboard.press("End");
			expectEq(await label(), last, "End jumps to the last item");

			await page.keyboard.press("Escape");
		});

		await test("a11y: Tab leaves the menu — it is a popup, not a modal", async () => {
			// Contrast the palette, which traps Tab on purpose ("a11y: the
			// palette is a combobox and focus comes back where it left").
			// Two overlays, two different correct answers: a dialog earns a
			// trap, a menu anchored to a trigger in the middle of the page
			// does not.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click('[data-bnd-part="user"]');
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });
			await page.keyboard.press("Tab");
			await page.waitForTimeout(300);
			const after = await page.evaluate(() => ({
				gone: !document.querySelector(".bnd-menu"),
				onBody: document.activeElement === document.body,
				at: (document.activeElement.className || document.activeElement.tagName || "").toString().slice(0, 60),
			}));
			expect(after.gone, "Tab closed the menu");
			expect(!after.onBody, `focus did not fall through to <body> (landed on: ${after.at})`);
		});

		await test("a11y: role=menu owns only menuitems and separators", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 3000);
			await page.click('[data-bnd-part="user"]');
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });
			const model = await page.evaluate(() => {
				const list = document.querySelector(".bnd-menu-list");
				const items = [...document.querySelectorAll(".bnd-menu .bnd-menu-item")];
				const header = document.querySelector(".bnd-menu .bnd-menu-header");
				return {
					listRole: list && list.getAttribute("role"),
					menuOwnRole: document.querySelector(".bnd-menu").getAttribute("role"),
					headerOutsideList: !!(header && list && !list.contains(header)),
					childRoles: list ? [...list.children].map((c) => c.getAttribute("role")) : [],
					itemsAreButtons: items.every((n) => n.tagName === "BUTTON"),
					itemsTabindex: items.map((n) => n.getAttribute("tabindex")),
				};
			});
			expectEq(model.listRole, "menu", "the item list carries role=menu");
			expect(!model.menuOwnRole, "the outer popup surface carries no role of its own");
			expect(model.headerOutsideList, "the identity header sits outside role=menu, as its sibling");
			expect(
				model.childRoles.every((r) => r === "menuitem" || r === "separator"),
				`every role=menu child is menuitem or separator (got: ${model.childRoles.join(", ")})`
			);
			expect(model.itemsAreButtons, "every menu item is a real <button>");
			expect(model.itemsTabindex.every((t) => t === "-1"), "every menu item is tabindex=-1, out of the tab order");
			await page.keyboard.press("Escape");
		});

		// ── Landmarks, the open workspace, and honest popup triggers (item 22) ──
		// Three ARIA promises 34a slice 1 made and never asserted: role=
		// navigation landmarks, aria-current on the open workspace, and
		// aria-haspopup on a trigger that has never yet been clicked.

		await test("a11y: every container is a named landmark, and no two share a name", async () => {
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, dock_enabled: 1, bottombar_enabled: 1, pagehead_enabled: 0,
			});
			await goDesk("/desk/item", ".page-head", 3000);
			const landmarks = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-topbar, .bnd-statusbar, .bnd-dock")].map((el) => ({
					role: el.getAttribute("role"),
					label: el.getAttribute("aria-label"),
				}))
			);
			// Count FIRST: every() over an empty list is vacuously true, and a
			// build that mounted nothing would otherwise pass this silently.
			expectEq(landmarks.length, 3, `topbar, statusbar and dock are all mounted (found ${landmarks.length})`);
			expect(
				landmarks.every((l) => l.role === "navigation" || l.role === "region"),
				`every container carries a landmark role (got: ${landmarks.map((l) => l.role).join(", ")})`
			);
			expect(landmarks.every((l) => !!l.label), "every container is named");
			const names = landmarks.map((l) => l.label);
			// landmark-unique is best-practice, not wcag2a/2aa, so the axe
			// gate's tag filter never checks this — it lives here instead.
			expectEq(new Set(names).size, names.length, `no two containers share a name (${names.join(", ")})`);
		});

		await test("a11y: the open workspace says so, in the dock and in the rail", async () => {
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Dock", dock_enabled: 1 });
			await goDesk("/desk/item", ".bnd-dock", 3000);
			// The negative half is the point: update_dock_active REMOVES the
			// attribute, and a positive-only test would pass on a build that
			// never removes it.
			expectEq(
				await page.evaluate(() => document.querySelectorAll("[aria-current]").length),
				0,
				"no dock item claims aria-current on a non-workspace route"
			);
			const dockWs = await page.evaluate(() => {
				const el = document.querySelector(".bnd-dock-item[data-ws]");
				return el ? el.getAttribute("data-ws") : null;
			});
			expect(dockWs, "at least one real workspace is in the dock to click");
			await page.click(`.bnd-dock-item[data-ws="${dockWs}"]`);
			await page.waitForTimeout(1500);
			const dockAfter = await page.evaluate((ws) => {
				const current = [...document.querySelectorAll("[aria-current]")];
				return { count: current.length, onRightOne: current.some((el) => el.getAttribute("data-ws") === ws) };
			}, dockWs);
			expectEq(dockAfter.count, 1, `exactly one dock item claims aria-current after opening ${dockWs}`);
			expect(dockAfter.onRightOne, "aria-current lands on the workspace that was actually opened");
			await goDesk("/desk/item", ".page-head", 2000);
			expectEq(
				await page.evaluate(() => document.querySelectorAll("[aria-current]").length),
				0,
				"aria-current is removed once the route leaves that workspace"
			);

			// The apps rail: a different mount, the same mechanism
			// (sb_update_apps_rail_active mirrors update_dock_active).
			setSettings({ ...CHROME_DEFAULTS, sidebar_apps_rail: 1 });
			await goDesk("/desk/item", ".bnd-apps-rail", 3000);
			const railWs = await page.evaluate(() => {
				const el = document.querySelector(".bnd-apps-rail-item[data-ws]");
				return el ? el.getAttribute("data-ws") : null;
			});
			expect(railWs, "at least one real workspace is in the apps rail to click");
			await page.click(`.bnd-apps-rail-item[data-ws="${railWs}"]`);
			await page.waitForTimeout(1500);
			const railAfter = await page.evaluate((ws) => {
				const current = [...document.querySelectorAll(".bnd-apps-rail-item[aria-current]")];
				return { count: current.length, onRightOne: current.some((el) => el.getAttribute("data-ws") === ws) };
			}, railWs);
			expectEq(railAfter.count, 1, `exactly one rail item claims aria-current after opening ${railWs}`);
			expect(railAfter.onRightOne, "aria-current lands on the workspace that was actually opened");
		});

		await test("a11y: a trigger that opens a popup says so before it is opened", async () => {
			// On a FRESH load, before any menu has ever been clicked — this
			// fails without menu_trigger(), correctly: aria-haspopup used to
			// be stamped inside show_menu() itself, only after a menu had
			// already been opened once.
			setSettings({ ...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1, user_placement: "Top Bar End" });
			await goDesk("/desk/item", ".page-head", 3000);
			const avatar = await page.evaluate(() => {
				const el = document.querySelector('[data-bnd-part="user"]');
				return el ? { haspopup: el.getAttribute("aria-haspopup"), expanded: el.getAttribute("aria-expanded") } : null;
			});
			expect(avatar, "the avatar trigger is mounted");
			expectEq(avatar.haspopup, "menu", "the avatar says it opens a menu before it is ever clicked");
			expectEq(avatar.expanded, "false", "and says it starts collapsed");
		});

		// ── Breadcrumbs are ours (item 22) ──────────────────────────────────
		// GUIDELINES §1.5 names breadcrumbs explicitly as a component this
		// theme owns, yet the kit had no a11y assertion and sat outside the
		// axe hard gate's OURS list.

		await test("a11y: decorating a crumb does not rename it", async () => {
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1,
				crumb_style: "Quiet Trail", icon_crumbs: "Off",
			});
			await goDesk("/desk/item", ".page-head", 3000);
			const original = await page.evaluate(() =>
				[...document.querySelectorAll(".page-head .navbar-breadcrumbs a")].map((a) => a.textContent.trim())
			);
			expect(original.length > 0, "the trail has at least one crumb to decorate");

			setSettings({ icon_crumbs: "Every Crumb" });
			await goDesk("/desk/item", ".page-head", 3000);
			const decorated = await page.evaluate(() => ({
				text: [...document.querySelectorAll(".page-head .navbar-breadcrumbs a")].map((a) => a.textContent.trim()),
				chips: document.querySelectorAll(".bnd-crumb-chip").length,
				// A decorative icon must add no name of its own — sprite_icon()
				// never sets one, asserted here rather than assumed.
				namedIcons: document.querySelectorAll(".bnd-crumb-chip svg title, .bnd-crumb-chip svg[aria-label]").length,
			}));
			// Assert the decoration actually happened FIRST — an undecorated
			// trail would pass "unchanged" trivially.
			expect(decorated.chips > 0, "icons actually decorated the trail");
			expectEq(decorated.text.join("|"), original.join("|"), "the crumbs' own text is unchanged by decoration");
			expectEq(decorated.namedIcons, 0, "the injected icon carries no name of its own");
		});

		await test("a11y: the copy-link button shows itself when focus arrives", async () => {
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar", topbar_enabled: 1,
				crumb_style: "Quiet Trail", crumb_copy_link: 1,
			});
			await goDesk("/desk/item", ".page-head", 3000);
			// crumb_copy_button() fails open with no navigator.clipboard —
			// localhost is a secure context, so it should mount here.
			expect(await q(".bnd-crumb-copy"), "the copy-link button mounted");
			await page.evaluate(() => {
				const links = [...document.querySelectorAll(".page-head .navbar-breadcrumbs a")];
				(links[links.length - 1] || document.body).focus();
			});
			await page.keyboard.press("Tab");
			// The reveal is a CSS transition (--bnd-dur-fast, 120ms) — read
			// the settled value, not a frame mid-fade.
			await page.waitForTimeout(250);
			const after = await page.evaluate(() => {
				const el = document.activeElement;
				return {
					onButton: !!(el && el.classList.contains("bnd-crumb-copy")),
					opacity: el ? getComputedStyle(el).opacity : null,
				};
			});
			expect(after.onButton, "Tab from the last crumb lands on the copy-link button");
			expectEq(after.opacity, "1", "and it is visible once focused, though opacity:0 at rest");
		});

		// ── 34a: axe, scoped honestly ──────────────────────────────────────
		//
		// GUIDELINES §2.3's exact prescription, built as written: a HARD gate
		// over our own components, and a BASELINE-DIFF over Desk pages so only
		// new violations fail. An unscoped axe run over the Frappe Desk drowns
		// in upstream violations and gets abandoned — the scoping is what makes
		// the gate live instead of aspirational.

		await test("a11y: axe finds nothing in our chrome, overlays open", async () => {
			// OUR roots, explicitly listed. `.body-sidebar` would drag Frappe's
			// own rows into the scan; our tenants inside the pane are included
			// by their own selectors instead.
			const OURS = [
				".bnd-skip-link", ".bnd-topbar", ".bnd-statusbar", ".bnd-dock",
				".bnd-apps-rail", ".bnd-sb-utils", ".bnd-sb-brand",
				".bnd-palette", ".bnd-inbox", ".bnd-menu",
				".bnd-crumb-chip", ".bnd-crumb-copy",
			];
			// Deliberate exceptions, each with the reason axe cannot know.
			// The same allowlist contract as CONSOLE_ALLOWLIST: scoped to the
			// exact rule, so anything new still fails.
			const ACCEPTED = [
				// The skip link's tabindex=1 knowingly matches Frappe's own
				// list rows — a positive tabindex is the only thing that can
				// precede one, and ours must be first. See ensure_skip_link.
				{ rule: "tabindex", selectorHas: "bnd-skip-link" },
			];
			// Page-level rules have no meaning inside a scoped include: the
			// scan sees fragments, not the document.
			const PAGE_RULES = ["region", "page-has-heading-one", "landmark-one-main", "bypass"];

			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, bottombar_enabled: 1, sidebar_enabled: 1,
				inbox_placement: "Top Bar End", user_placement: "Top Bar End",
				inbox_style: "Bunood Inbox", palette_style: "Bunood Palette",
				crumb_style: "Quiet Trail", crumb_copy_link: 1, icon_crumbs: "Every Crumb",
				sidebar_apps_rail: 1,
			});
			await goDesk("/desk/item", ".page-head", 4000);

			// Non-matching includes are silently tolerated by axe-core — a
			// selector present in zero of the states below never errors, it
			// just scans nothing (proven: .bnd-palette/.bnd-inbox pass at the
			// very first "desk" scan, before either has ever been opened,
			// because neither exists yet and an absent include is a no-op).
			// That tolerance means a typo in OURS is invisible unless
			// something separately tracks which selectors ever matched.
			const matched = new Set();
			const scan = async (label) => {
				let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(PAGE_RULES);
				for (const root of OURS) builder = builder.include(root);
				const res = await builder.analyze();
				const present = await page.evaluate(
					(sels) => sels.filter((s) => document.querySelector(s)),
					OURS
				);
				for (const s of present) matched.add(s);
				return res.violations
					.filter(
						(v) =>
							!ACCEPTED.some(
								(a) =>
									a.rule === v.id &&
									v.nodes.every((n) => n.target.join(" ").includes(a.selectorHas))
							)
					)
					.map((v) => `${label}: ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
			};

			let bad = await scan("desk");
			// The overlays exist open only while somebody opens them — an
			// end-of-run scan would never see them, which the audit called out.
			await page.keyboard.press("Control+k");
			await page.waitForSelector(".bnd-palette-backdrop:not([hidden])", { timeout: 5000 });
			bad = bad.concat(await scan("palette open"));
			await page.keyboard.press("Escape");
			await page.waitForSelector(".bnd-palette-backdrop[hidden]", { state: "attached", timeout: 5000 });

			await page.click(".bnd-bell");
			await page.waitForSelector(".bnd-inbox-backdrop:not([hidden])", { timeout: 5000 });
			bad = bad.concat(await scan("inbox open"));
			await page.keyboard.press("Escape");

			// The avatar's own menu: body-appended (outside every root above
			// until .bnd-menu joined OURS), never open at rest, and the
			// instance carrying the identity header — the one content-model
			// risk none of the other three show_menu() callers has.
			await page.click('[data-bnd-part="user"]');
			await page.waitForSelector(".bnd-menu", { timeout: 5000 });
			bad = bad.concat(await scan("menu open"));
			await page.keyboard.press("Escape");

			// This pass proves our CHROME is unbroken on a non-list route — it
			// is not settings-surface coverage, which is a different test
			// below with a different root list (P.wrap gives every picker
			// .bnd-cbp, not .bnd-shell).
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			bad = bad.concat(await scan("our chrome on the settings route"));

			// .bnd-dock only exists in the Dock layout, which hides the side pane
			// entirely — mutually exclusive with every state set above, so it
			// gets its own pass rather than a setting flipped in place.
			setSettings({ ...layoutSettings("Dock"), desk_layout: "Dock" });
			await goDesk("/desk/item", ".bnd-dock", 4000);
			bad = bad.concat(await scan("dock layout"));

			expectEq(bad.join("\n"), "", "axe over our chrome, all states");
			const missed = OURS.filter((s) => !matched.has(s));
			expectEq(missed.join(","), "", `every OURS selector matched in some state (missed: ${missed.join(", ")})`);
		});

		await test("a11y: axe over the settings pickers, every pane", async () => {
			// P.wrap gives every picker one root class, .bnd-cbp — except the
			// sidebar picker's own .bnd-sbp — so the SURFACE is three
			// selectors, not .bnd-shell/.bnd-shell-viewport: the shell
			// RELOCATES Frappe's own .form-section nodes into its panes, and
			// including it would drag every stock control along, the exact
			// objection the chrome test's OURS comment makes about
			// .body-sidebar. Panes whose content is only stock Frappe
			// controls stay covered by the baseline-diff test below, not
			// this hard gate — correct by the layer model, not a gap.
			const OURS_SETTINGS = [".bnd-shell-nav", ".bnd-cbp", ".bnd-sbp"];
			const PAGE_RULES = ["region", "page-has-heading-one", "landmark-one-main", "bypass"];

			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);

			const matched = new Set();
			const bad = [];
			await walkSettingsPanes(async (key) => {
				let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(PAGE_RULES);
				for (const root of OURS_SETTINGS) builder = builder.include(root);
				const res = await builder.analyze();
				for (const v of res.violations) {
					bad.push(`${key}: ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
				}
				const present = await page.evaluate(
					(sels) => sels.filter((s) => document.querySelector(s)),
					OURS_SETTINGS
				);
				for (const s of present) matched.add(s);
			});

			expectEq(bad.join("\n"), "", "axe over every settings pane");
			const missed = OURS_SETTINGS.filter((s) => !matched.has(s));
			expectEq(missed.join(","), "", `every settings root matched in some pane (missed: ${missed.join(", ")})`);
		});

		await test("a11y: focus draws a ring on every control that takes it", async () => {
			// build.mjs's assertRingCoverage proves a :focus-visible RULE exists
			// for every control our source constructs. It cannot prove the ring
			// RENDERS — an upstream `outline: none` at higher specificity still
			// wins. This walks the REAL tab order (never element.focus():
			// :focus-visible is a Chromium heuristic a programmatic focus can
			// fail to match) and reads the rendered outline at each stop.
			setSettings({
				...CHROME_DEFAULTS, desk_layout: "Top Bar",
				topbar_enabled: 1, bottombar_enabled: 1, sidebar_enabled: 1,
				inbox_placement: "Top Bar End", user_placement: "Top Bar End",
				crumb_style: "Quiet Trail", crumb_copy_link: 1,
			});
			await goDesk("/desk/item", ".page-head", 4000);
			await page.evaluate(() => {
				document.activeElement && document.activeElement.blur();
				window.__bndPrevFocus = null;
			});

			// Suppressed with reasons, not silently skipped. .bnd-palette-input
			// is the command palette's only tab stop — a caret is the indicator,
			// not a ring, and it is a deliberate trap so it never yields the
			// "moved" assertion below. .bnd-inbox / .bnd-inbox-list are
			// tabindex=-1 containers, never real tab stops themselves.
			const SUPPRESS = [".bnd-palette-input", ".bnd-inbox", ".bnd-inbox-list"];

			const seenClasses = new Set();
			const ringFailures = [];
			const stalls = [];
			// The skip link's tabindex=1 and Frappe's own list rows dominate
			// early tab order — a short walk never reaches our controls and
			// checks nothing, so this walks the whole forward order, stopping
			// only when Tab runs off the end (focus lands on <body>), which is
			// the browser's normal end-of-sequence behaviour, not a stall.
			// "Moved" is real DOM-node identity, stashed on `window` between
			// evaluate calls — a content/class key produces false stalls on
			// Frappe's list rows, several of which render identical text.
			for (let i = 0; i < 90; i++) {
				await page.keyboard.press("Tab");
				const info = await page.evaluate((suppress) => {
					const el = document.activeElement;
					if (!el || el === document.body) return { atEnd: true };
					const moved = el !== window.__bndPrevFocus;
					window.__bndPrevFocus = el;
					const cls = el.className && el.className.toString ? el.className.toString() : "";
					const bndClass = cls.split(/\s+/).find((c) => /^bnd-/.test(c));
					let suppressed = false;
					for (const s of suppress) {
						try {
							if (el.matches(s)) suppressed = true;
						} catch {
							/* not a valid selector for this element — not suppressed */
						}
					}
					const cs = getComputedStyle(el);
					return {
						atEnd: false,
						moved,
						bndClass: bndClass || null,
						suppressed,
						outlineStyle: cs.outlineStyle,
						outlineWidth: parseFloat(cs.outlineWidth) || 0,
						label: cls.split(" ")[0] || el.tagName,
					};
				}, SUPPRESS);

				if (info.atEnd) break;
				if (!info.moved) stalls.push(`step ${i}: ${info.label}`);

				if (info.bndClass && !info.suppressed) {
					seenClasses.add(info.bndClass);
					if (info.outlineStyle === "none" || info.outlineWidth < 2) {
						ringFailures.push(`${info.bndClass}: outline ${info.outlineStyle}/${info.outlineWidth}px`);
					}
				}
			}

			expectEq(stalls.join("\n"), "", "focus moved on every Tab press");
			expect(
				seenClasses.size >= 8,
				`the walk reached our controls (saw ${seenClasses.size} distinct bnd- classes: ${[...seenClasses].sort().join(", ")})`
			);
			expectEq(ringFailures.join("\n"), "", "every reached, unsuppressed control shows a real ring");
		});

		await test("a11y: axe over the Desk only fails on NEW violations", async () => {
			// Upstream's violations are not ours to fix and a gate that fails
			// on them gets deleted. The BASELINE records what the Desk scores
			// today, keyed rule -> count per route; this test fails only when
			// a rule appears that the baseline has never seen, or an existing
			// rule's node count GROWS — either of which means a change on OUR
			// side made the page worse. Regenerate deliberately after reading
			// the diff:  node tools/axe-baseline.mjs
			const baseline = JSON.parse(
				readFileSync(new URL("./fixtures/axe-baseline.json", import.meta.url), "utf8")
			);
			// THE SAME STATE THE BASELINE TOOL PINS — the shipped defaults.
			// Left to inherit, this test measured whatever desk the previous
			// test built, and a state difference read as a phantom regression
			// on its very first run.
			const shippedState = JSON.parse(
				benchPy("from bunood_theme.setup import SHIPPED\nprint(json.dumps(SHIPPED))\n")
					.trim().split("\n").pop()
			);
			// Only the fields the suite may write: SHIPPED also carries
			// branding and colours, which are outside MUTABLE_FIELDS because a
			// restore failure there is permanent damage. The baseline tool
			// pins them too, but it owns its own writes; the suite does not.
			setSettings(
				Object.fromEntries(
					Object.entries(shippedState).filter(([k]) => MUTABLE_FIELDS.includes(k))
				)
			);
			for (const [route, waitFor] of [
				["/desk/item", ".page-head"],
				["/desk/item/BND-TEST-001", ".form-tabs-list"],
				["/desk/theme-settings?shell=1", ".bnd-shell"],
				// Item 25: the workspace and dashboard routes the kits land on.
				["/desk/selling", ".ce-block .widget"],
				["/desk/dashboard-view/Selling", ".widget-group-body"],
				// Item 26: the report view's datatable (captured kit-absent in
				// slice 0). The /app/ form matches the baseline tool's key.
				["/app/account/view/report", ".dt-scrollable .dt-row"],
				// Item 27: the four alternate views, kit ON at SHIPPED here vs the
				// kit-absent baseline (slice 0) — so a NEW violation means the
				// views kit made the page worse (a contrast fail on an event chip,
				// a card, a bar). The pinned fixtures render them.
				["/app/todo/view/kanban/Bunood%20Memos", ".kanban-column"],
				["/app/todo/view/calendar", ".fc"],
				["/app/todo/view/gantt", ".gantt .bar"],
				["/app/item/view/image", ".image-view-container"],
			]) {
				await goDesk(route, waitFor, 4000);
				const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
				const seen = {};
				for (const v of res.violations) seen[v.id] = v.nodes.length;
				const base = baseline[route] || {};
				const worse = [];
				for (const [rule, count] of Object.entries(seen)) {
					if (!(rule in base)) worse.push(`${route}: NEW rule ${rule} (${count} nodes)`);
					else if (count > base[rule]) worse.push(`${route}: ${rule} grew ${base[rule]} -> ${count}`);
				}
				expectEq(worse.join("\n"), "", `no new axe violations on ${route}`);
			}
		});

		// ── List view kit (item 16) — the first surface family ─────────────
		//
		// Picks recorded 2026-08-09: 1C Floating Cards · 2B Edge Rail ·
		// 3C Bold Bar · 4A reveal · +Open Rows from the market-survey round.

		await test("list: density geometry survives the migration", async () => {
			// WRITTEN BEFORE THE MIGRATION and green against _density.scss's
			// rules; the same assertions hold after they move into
			// surfaces/_list.scss — which is what makes the move provably a
			// move and not a rewrite. Density is its own contract: it must
			// hold under Original, so that is the state it is measured in.
			setSettings({ list_style: "Original" });
			await goDesk("/desk/item", ".list-row-container", 3000);
			const geom = await page.evaluate(() => {
				const row = document.querySelector(".list-row");
				const left = document.querySelector(".list-row .level-left");
				const html = getComputedStyle(document.documentElement);
				return {
					minH: getComputedStyle(row).minHeight,
					padY: getComputedStyle(left).paddingBlockStart,
					rowVar: html.getPropertyValue("--bnd-row-h").trim(),
					padVar: html.getPropertyValue("--bnd-pad-y").trim(),
				};
			});
			expectEq(geom.minH, geom.rowVar, "row min-height resolves from --bnd-row-h");
			expectEq(geom.padY, geom.padVar, "level padding resolves from --bnd-pad-y");
		});

		const LIST_STYLE_SLUG = {
			"Hairline Rows": "hairline", "Open Rows": "open",
			"Zebra Stripes": "zebra", "Floating Cards": "cards",
		};
		for (const [label, slug] of Object.entries(LIST_STYLE_SLUG)) {
			await test(`list: ${label}`, async () => {
				setSettings({
					list_style: label, list_hover: "Soft Wash",
					list_selection: "Soft Tint", list_checkbox_reveal: 0,
				});
				await goDesk("/desk/item", ".list-row-container", 3000);
				expectEq(await attr("data-bnd-list"), slug, "style attribute");
				// One computed-pixel proof per style — an attribute alone is a
				// green test that asserts existence, not correctness.
				const px = await page.evaluate(() => {
					// DATA rows only: the first .list-row-container holds the
					// HEADER (probed), and .result can interleave non-row
					// nodes — so "consecutive data rows" is the honest unit
					// for zebra, not raw child positions.
					const rows = [...document.querySelectorAll(".result .list-row-container")]
						.filter((n) => n.querySelector(".list-row-checkbox"));
					const first = getComputedStyle(rows[0]);
					const second = rows[1] ? getComputedStyle(rows[1]) : null;
					return {
						sep: first.borderBlockEndColor,
						sepWidth: first.borderBlockEndWidth,
						firstBg: first.backgroundColor,
						secondBg: second ? second.backgroundColor : null,
						radius: first.borderRadius,
						numeric: getComputedStyle(document.querySelector(".list-row-col")).fontVariantNumeric,
					};
				});
				expectEq(px.numeric, "tabular-nums", "numerals are tabular on screen");
				if (slug === "hairline") {
					expect(px.sepWidth !== "0px", `hairline draws a separator (${px.sepWidth})`);
				}
				if (slug === "open") {
					expect(px.sepWidth === "0px" || px.sep.includes("0)"), "open rows draw no separator");
					expectEq(px.firstBg, px.secondBg, "open rows draw no zebra either");
				}
				if (slug === "zebra") {
					expect(px.firstBg !== px.secondBg, `zebra alternates (${px.firstBg} vs ${px.secondBg})`);
				}
				if (slug === "cards") {
					expect(px.radius !== "0px", `cards are rounded (${px.radius})`);
				}
			});
		}

		await test("list: Original applies nothing at all", async () => {
			setSettings({ list_style: "Original" });
			await goDesk("/desk/item", ".list-row-container", 3000);
			const state = await page.evaluate(() => ({
				attrs: [...document.documentElement.attributes].filter((a) => a.name.startsWith("data-bnd-list")).map((a) => a.name),
				numeric: getComputedStyle(document.querySelector(".list-row-col")).fontVariantNumeric,
			}));
			expectEq(state.attrs.join(","), "", "no list attribute survives Original");
			expectEq(state.numeric, "normal", "even the numeral rule stands down");
		});

		await test("list: live preview flips the style and back", async () => {
			setSettings({ list_style: "Floating Cards", list_hover: "Edge Rail", list_selection: "Bold Bar", list_checkbox_reveal: 1 });
			await goDesk("/desk/item", ".list-row-container", 3000);
			expectEq(await attr("data-bnd-list"), "cards", "boot applied cards");
			await page.evaluate(() => window.bunood_theme.list_apply({ list_style: "Zebra Stripes" }));
			expectEq(await attr("data-bnd-list"), "zebra", "preview flipped to zebra");
			await page.evaluate(() => window.bunood_theme.list_apply({ list_style: "Floating Cards" }));
			expectEq(await attr("data-bnd-list"), "cards", "and back");
		});

		await test("list: selection is never colour alone, and Bold owns the header", async () => {
			setSettings({
				list_style: "Floating Cards", list_selection: "Bold Bar",
				list_checkbox_reveal: 1, list_hover: "Edge Rail",
			});
			await goDesk("/desk/item", ".list-row-container", 3000);
			await page.evaluate(() => {
				const boxes = document.querySelectorAll(".list-row-checkbox");
				boxes[0] && boxes[0].click();
			});
			await page.waitForTimeout(600);
			const sel = await page.evaluate(() => {
				const box = document.querySelector(".list-row-checkbox:checked");
				const row = box && box.closest(".list-row-container");
				const rail = row && getComputedStyle(row, "::before").backgroundColor;
				const head = document.querySelector(".list-row-head");
				return {
					checked: !!box,
					boxVisible: box && getComputedStyle(box).opacity !== "0",
					rowBg: row && getComputedStyle(row).backgroundColor,
					rail,
					headBg: head && getComputedStyle(head).backgroundColor,
					bulk: !!document.querySelector(".checkbox-actions"),
				};
			});
			expect(sel.checked, "a row is checked");
			expect(sel.boxVisible, "the checked mark is visible — selection is never colour alone");
			expect(sel.rail && !sel.rail.includes("0)"), `the rail is painted (${sel.rail})`);
			if (sel.bulk) {
				expect(sel.headBg && sel.headBg !== "rgba(0, 0, 0, 0)", `Bold Bar owns the header (${sel.headBg})`);
			}
			// Uncheck for the tests after this one.
			await page.evaluate(() => {
				const box = document.querySelector(".list-row-checkbox:checked");
				box && box.click();
			});
		});

		await test("list: checkboxes reveal on hover and stand down for touch", async () => {
			setSettings({ list_style: "Hairline Rows", list_checkbox_reveal: 1, list_selection: "Soft Tint", list_hover: "Soft Wash" });
			await goDesk("/desk/item", ".list-row-container", 3000);
			const rest = await page.evaluate(() =>
				getComputedStyle(document.querySelector(".result .list-row-checkbox")).opacity
			);
			expectEq(rest, "0", "checkboxes rest hidden");
			// Hover a DATA row — the first container is the header and holds
			// no checkbox, which made the first cut of this test throw.
			await page.hover(".result .list-row-container:has(.list-row-checkbox)");
			await page.waitForTimeout(300);
			const hovered = await page.evaluate(() => {
				const row = document.querySelector(".result .list-row-container:hover");
				const box = row && row.querySelector(".list-row-checkbox");
				return box ? getComputedStyle(box).opacity : "no hovered checkbox";
			});
			expectEq(hovered, "1", "hover reveals the row's checkbox");
		});

		await test("list: cards keep the paging row clear of the bottom chrome", async () => {
			// The worst-geometry configuration: cards' gaps at compact density
			// over the Top Bar layout's status bar. ARCHITECTURE §11's contract
			// — the kit must not move the paging row under the bar.
			setSettings({
				list_style: "Floating Cards", desk_layout: "Top Bar",
				topbar_enabled: 1, bottombar_enabled: 1, status_style: "Quiet",
			});
			await goDesk("/desk/item", ".frappe-list", 4000);
			const geom = await page.evaluate(() => {
				const paging = document.querySelector(".list-paging-area");
				const bar = document.querySelector(".bnd-statusbar");
				if (!paging || !bar) return null;
				return {
					pagingBottom: Math.round(paging.getBoundingClientRect().bottom),
					barTop: Math.round(bar.getBoundingClientRect().top),
				};
			});
			expect(geom, "paging row and status bar both present");
			expect(
				geom.pagingBottom <= geom.barTop,
				`the paging row clears the bar (${geom.pagingBottom} <= ${geom.barTop})`
			);
		});

		// ── Form view kit (item 18) — the second surface family ─────────────
		//
		// Picks recorded 2026-08-10: 1C Floating Panels · 2C Solid Pill ·
		// 3C Floating Pane · 4A reveal.
		//
		// Every test walks /desk/item/BND-TEST-001 — a doctype with tabs AND a
		// child grid (the uoms table, on the UOM tab). The first test ensures
		// the fixture idempotently: the suite must never assume a hand-made
		// doc survived, and the grid needs two rows so hover exercises a real
		// row set.

		const FORM_ROUTE = "/desk/item/BND-TEST-001";

		await test("form: control height obeys density under Original", async () => {
			// The fixture-ensure. benchPy is idempotent here: an existing doc
			// with two uoms rows is a no-op.
			benchPy(
				'if not frappe.db.exists("Item", "BND-TEST-001"):\n' +
					'    doc = frappe.new_doc("Item")\n' +
					'    doc.item_code = "BND-TEST-001"\n' +
					'    doc.item_group = frappe.get_all("Item Group", limit=1)[0]["name"]\n' +
					'    doc.stock_uom = "Nos"\n' +
					"    doc.insert()\n" +
					'doc = frappe.get_doc("Item", "BND-TEST-001")\n' +
					"if len(doc.uoms) < 2:\n" +
					"    have = {r.uom for r in doc.uoms}\n" +
					'    for u in frappe.get_all("UOM", limit=6):\n' +
					'        if u["name"] not in have:\n' +
					'            doc.append("uoms", {"uom": u["name"], "conversion_factor": 12})\n' +
					'            have.add(u["name"])\n' +
					"        if len(doc.uoms) >= 2:\n" +
					"            break\n" +
					"    doc.save()\n" +
					"frappe.db.commit()\n" +
					'print("ok")\n'
			);
			// Density is its own contract: it must hold under Original, so that
			// is the state it is measured in — which also pins the rule to the
			// html[data-theme] scope, never the kit anchor.
			setSettings({ form_style: "Original" });
			await goDesk(FORM_ROUTE, ".form-section", 3000);
			const geom = await page.evaluate(() => {
				const input = document.querySelector('.frappe-control[data-fieldtype="Data"] input.form-control');
				const html = getComputedStyle(document.documentElement);
				return {
					h: input ? getComputedStyle(input).blockSize : "no data input on the form",
					want: html.getPropertyValue("--bnd-control-h").trim(),
				};
			});
			expectEq(geom.h, geom.want, "input height resolves from --bnd-control-h under Original");
		});

		const FORM_STYLE_SLUG = {
			"Hairline Panels": "hairline", "Open Canvas": "open",
			"Floating Panels": "cards", "Paper Sheet": "sheet",
		};
		for (const [label, slug] of Object.entries(FORM_STYLE_SLUG)) {
			await test(`form: ${label}`, async () => {
				setSettings({
					form_style: label, form_tabs: "Brand Underline",
					form_sidebar: "Hairline Edge", form_grid_checkbox_reveal: 0,
				});
				await goDesk(FORM_ROUTE, ".form-section", 3000);
				expectEq(await attr("data-bnd-form"), slug, "style attribute");
				// One computed-pixel proof per style — an attribute alone is a
				// green test that asserts existence, not correctness.
				const px = await page.evaluate(() => {
					const sec = [...document.querySelectorAll(".form-layout .form-section")]
						.find((s) => getComputedStyle(s).display !== "none");
					const s = getComputedStyle(sec);
					const paper = getComputedStyle(document.querySelector(".std-form-layout > .form-layout > .form-page"));
					return {
						sideWidth: s.borderInlineStartWidth,
						sideColor: s.borderInlineStartColor,
						sep: s.borderBlockEndColor,
						secBg: s.backgroundColor,
						radius: s.borderRadius,
						canvasBg: getComputedStyle(document.querySelector(".layout-main-section")).backgroundColor,
						paperBg: paper.backgroundColor,
						paperShadow: paper.boxShadow,
					};
				});
				if (slug === "hairline") {
					expect(px.sideWidth !== "0px" && px.sideColor !== "rgba(0, 0, 0, 0)",
						`hairline boxes the section (${px.sideWidth} ${px.sideColor})`);
				}
				if (slug === "open") {
					expectEq(px.sep, "rgba(0, 0, 0, 0)", "open erases the separator");
					expectEq(px.secBg, "rgba(0, 0, 0, 0)", "and paints no panel");
				}
				if (slug === "cards") {
					// The canvas is the column; the page sheet steps aside
					// (measured: upstream owns .form-page at (0,3,0)).
					expect(px.canvasBg !== "rgba(0, 0, 0, 0)", `the column canvas is painted (${px.canvasBg})`);
					expectEq(px.paperBg, "rgba(0, 0, 0, 0)", "the page sheet steps aside so the canvas shows");
					expect(px.secBg !== px.canvasBg, `cards float on the tinted canvas (${px.secBg} vs ${px.canvasBg})`);
					expect(px.radius !== "0px", `cards are rounded (${px.radius})`);
				}
				if (slug === "sheet") {
					expect(px.canvasBg !== "rgba(0, 0, 0, 0)", `the column canvas is painted (${px.canvasBg})`);
					expect(px.paperBg !== "rgba(0, 0, 0, 0)", `the paper is opaque (${px.paperBg})`);
					expect(px.paperShadow !== "none", `and elevated (${px.paperShadow.slice(0, 40)}…)`);
					expectEq(px.secBg, "rgba(0, 0, 0, 0)", "sections stay transparent inside it");
				}
			});
		}

		await test("form: Original applies nothing at all", async () => {
			setSettings({ form_style: "Original" });
			await goDesk(FORM_ROUTE, ".form-section", 3000);
			const state = await page.evaluate(() => ({
				attrs: [...document.documentElement.attributes]
					.filter((a) => a.name.startsWith("data-bnd-form")).map((a) => a.name),
				// The stock separator returns whole: 1px, not the kit's
				// --bnd-line half-pixel (probed 2026-08-10) — a kit-owned rule
				// visibly standing down, the list family's numeric analogue.
				sepWidth: (() => {
					const sec = [...document.querySelectorAll(".form-layout .form-section")]
						.find((s) => getComputedStyle(s).display !== "none" && !s.classList.contains("hide-border"));
					return sec ? getComputedStyle(sec).borderBlockEndWidth : "no section";
				})(),
			}));
			expectEq(state.attrs.join(","), "", "no form attribute survives Original");
			expectEq(state.sepWidth, "1px", "the stock separator returns untouched");
		});

		await test("form: live preview flips the style and back", async () => {
			setSettings({
				form_style: "Floating Panels", form_tabs: "Solid Pill",
				form_sidebar: "Floating Pane", form_grid_checkbox_reveal: 1,
			});
			await goDesk(FORM_ROUTE, ".form-section", 3000);
			expectEq(await attr("data-bnd-form"), "cards", "boot applied cards");
			await page.evaluate(() => window.bunood_theme.form_apply({ form_style: "Paper Sheet" }));
			expectEq(await attr("data-bnd-form"), "sheet", "preview flipped to sheet");
			await page.evaluate(() => window.bunood_theme.form_apply({ form_style: "Floating Panels" }));
			expectEq(await attr("data-bnd-form"), "cards", "and back");
		});

		await test("form: the active tab is never colour alone", async () => {
			setSettings({
				form_style: "Floating Panels", form_tabs: "Solid Pill",
				form_sidebar: "Floating Pane", form_grid_checkbox_reveal: 1,
			});
			await goDesk(FORM_ROUTE, ".form-tabs-list", 3000);
			const pill = await page.evaluate(() => {
				const active = document.querySelector(".form-tabs .nav-link.active");
				const other = document.querySelector(".form-tabs .nav-link:not(.active)");
				return {
					activeBg: getComputedStyle(active).backgroundColor,
					activeRadius: getComputedStyle(active).borderRadius,
					activeInk: getComputedStyle(active).color,
					otherBg: other ? getComputedStyle(other).backgroundColor : null,
					otherInk: other ? getComputedStyle(other).color : null,
				};
			});
			expect(pill.activeBg !== "rgba(0, 0, 0, 0)", `Solid Pill fills the active tab (${pill.activeBg})`);
			expect(pill.activeRadius !== "0px", `and rounds it (${pill.activeRadius}) — fill + shape, not hue alone`);
			expectEq(pill.otherBg, "rgba(0, 0, 0, 0)", "inactive tabs stay quiet");
			expect(pill.activeInk !== pill.otherInk, "the ink swaps with the fill");
			// The underline option's channel is the marker bar — drive it
			// through the live hook, which doubles as the hook's second proof.
			await page.evaluate(() => window.bunood_theme.form_apply({ form_tabs: "Brand Underline" }));
			const bar = await page.evaluate(() => ({
				active: getComputedStyle(document.querySelector(".form-tabs .nav-link.active")).borderBlockEndWidth,
				other: getComputedStyle(document.querySelector(".form-tabs .nav-link:not(.active)")).borderBlockEndWidth,
			}));
			expectEq(bar.active, "2px", "the underline is a 2px bar — a width channel, not a hue");
			expectEq(bar.other, "0px", "only under the active tab");
		});

		await test("form: grid rows take the treatment and checkboxes reveal", async () => {
			setSettings({
				form_style: "Floating Panels", form_tabs: "Solid Pill",
				form_sidebar: "Floating Pane", form_grid_checkbox_reveal: 1,
			});
			await goDesk(FORM_ROUTE, ".form-tabs-list", 3000);
			// The uoms grid lives on the UOM tab — activate it first.
			await page.click('.form-tabs .nav-link[data-fieldname="uom_tab"]');
			await page.waitForTimeout(800);
			const g = await page.evaluate(() => {
				// DATA rows only, by [data-idx]: the heading shares .data-row
				// anatomy and even carries its own select-all checkbox (probed
				// 2026-08-10) — the list family's header-row lesson transposed.
				const pane = document.querySelector(".tab-pane.active");
				const heading = pane && pane.querySelector(".grid-heading-row");
				const rows = pane ? [...pane.querySelectorAll(".grid-body .grid-row[data-idx]")] : [];
				const check = rows[0] && rows[0].querySelector(".grid-row-check");
				const headCheck = heading && heading.querySelector(".grid-row-check");
				return {
					rowCount: rows.length,
					headingBg: heading ? getComputedStyle(heading).backgroundColor : null,
					rowBg: rows[0] ? getComputedStyle(rows[0]).backgroundColor : null,
					checkOpacity: check ? getComputedStyle(check).opacity : null,
					headCheckOpacity: headCheck ? getComputedStyle(headCheck).opacity : null,
				};
			});
			expect(g.rowCount >= 2, `the fixture grid has two rows (got ${g.rowCount})`);
			expect(g.headingBg && g.headingBg !== "rgba(0, 0, 0, 0)", `the heading takes the raised fill (${g.headingBg})`);
			expect(g.headingBg !== g.rowBg, "and stays distinct from the rows");
			expectEq(g.checkOpacity, "0", "grid checkboxes rest hidden (4A)");
			expectEq(g.headCheckOpacity, "1", "the heading's select-all stays visible — the discoverable entry (3B)");
			await page.hover('.tab-pane.active .grid-body .grid-row[data-idx="1"]');
			await page.waitForTimeout(300);
			const hovered = await page.evaluate(() => {
				const row = document.querySelector('.tab-pane.active .grid-body .grid-row[data-idx="1"]');
				const box = row && row.querySelector(".grid-row-check");
				return box ? getComputedStyle(box).opacity : "no checkbox";
			});
			expectEq(hovered, "1", "hover reveals the row's checkbox");
		});

		await test("form: the sidebar is a card and clears the bottom chrome", async () => {
			setSettings({
				form_style: "Floating Panels", form_sidebar: "Floating Pane",
				form_tabs: "Solid Pill", form_grid_checkbox_reveal: 1,
				desk_layout: "Top Bar", topbar_enabled: 1, bottombar_enabled: 1,
				status_style: "Quiet",
			});
			await goDesk(FORM_ROUTE, ".form-sidebar", 4000);
			// Measure the PINNED state: the _layouts.scss sizing is written for
			// the stuck column (top: 48px). At natural scroll the column sits
			// ~45px lower (the tab bar's height above it) and tucks under the
			// bar by exactly that much — a pre-existing tabbed-form fact,
			// measured 2026-08-10 and recorded in HANDOVER §8, not a kit
			// regression. Scroll first; the pinned geometry is the contract.
			await page.evaluate(() => {
				const scroller = document.querySelector(".main-section");
				if (scroller) scroller.scrollTop = 400;
			});
			await page.waitForTimeout(400);
			const geom = await page.evaluate(() => {
				const side = document.querySelector(".layout-side-section");
				const pane = document.querySelector(".form-sidebar");
				const bar = document.querySelector(".bnd-statusbar");
				return {
					paneBg: getComputedStyle(pane).backgroundColor,
					paneRadius: getComputedStyle(pane).borderRadius,
					sideBottom: side && Math.round(side.getBoundingClientRect().bottom),
					barTop: bar && Math.round(bar.getBoundingClientRect().top),
				};
			});
			expect(geom.paneBg !== "rgba(0, 0, 0, 0)", `the pane is filled (${geom.paneBg})`);
			expect(geom.paneRadius !== "0px", `and rounded (${geom.paneRadius}) — a sibling card`);
			expect(geom.barTop !== null, "the status bar is present");
			// Riding chrome/_layouts.scss's --bnd-bottom-reserve sizing — the
			// kit paints the column, that rule sizes it; this asserts the two
			// compose instead of fighting.
			expect(
				geom.sideBottom <= geom.barTop,
				`the pinned sidebar clears the bar (${geom.sideBottom} <= ${geom.barTop})`
			);
		});

		await test("form: the grid edit state stays coherent", async () => {
			setSettings({
				form_style: "Floating Panels", form_tabs: "Solid Pill",
				form_sidebar: "Floating Pane", form_grid_checkbox_reveal: 0,
			});
			await goDesk(FORM_ROUTE, ".form-tabs-list", 3000);
			await page.click('.form-tabs .nav-link[data-fieldname="uom_tab"]');
			await page.waitForTimeout(800);
			// The pencil reveals on row hover (probed: an un-hovered click
			// times out on visibility) — hover first, then open.
			await page.hover('.tab-pane.active .grid-body .grid-row[data-idx="1"]');
			await page.click('.tab-pane.active .grid-body .grid-row[data-idx="1"] .btn-open-row');
			await page.waitForTimeout(600);
			const open = await page.evaluate(() => {
				const row = document.querySelector(".grid-row-open");
				return {
					open: !!row,
					editor: !!document.querySelector(".form-in-grid"),
					bg: row ? getComputedStyle(row).backgroundColor : null,
				};
			});
			expect(open.open, "the row editor opened (.grid-row-open)");
			expect(open.editor, "and rendered its form (.form-in-grid)");
			expect(open.bg !== "rgba(0, 0, 0, 0)", `the open row is opaque, no alien slab (${open.bg})`);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(300);
		});

		// ── Workspace tile kit (item 25) ────────────────────────────────────
		//
		// A surface kit: attributes on <html>, a stylesheet over Frappe's own
		// workspace DOM, nothing mounted. Every style ships; the assertions read
		// the RENDERED tile, not just the attribute — an attribute proves it was
		// set, a computed pixel proves it did something.
		const WS_ROUTE = "/desk/selling"; // a workspace with charts, number cards and link cards

		await test("workspace: Original applies nothing at all", async () => {
			setSettings({ workspace_style: "Original" });
			await goDesk(WS_ROUTE, ".widget", 3000);
			const attrs = await page.evaluate(() =>
				[...document.documentElement.attributes].filter((a) => a.name.startsWith("data-bnd-ws")).map((a) => a.name));
			expectEq(attrs.join(","), "", "no workspace attribute survives Original");
		});

		const WS_STYLE_SLUG = {
			"Open Board": "open", "Hairline Grid": "grid", "Soft Tiles": "soft",
			"Headed Panel": "headed", "Floating Cards": "cards", "Mixed Weights": "mixed",
		};
		for (const [label, slug] of Object.entries(WS_STYLE_SLUG)) {
			await test(`workspace: ${label}`, async () => {
				setSettings({ workspace_style: label, workspace_rows: "Plain", workspace_menu_reveal: 0 });
				// editor.js paints the tiles well after the route settles — wait for a
				// widget actually inside a .ce-block, not just any .widget skeleton.
				await goDesk(WS_ROUTE, ".ce-block .widget", 4000);
				expectEq(await attr("data-bnd-ws"), slug, "style attribute");
				const px = await page.evaluate(() => {
					const w = document.querySelector(".ce-block .widget");
					const ce = document.querySelector(".ce-block");
					if (!w || !ce) return { missing: true };
					const cs = getComputedStyle(w);
					// The chart tile's box class — the bare `.chart` type class is NOT
					// stamped on the rendered widget (measured), so key on the box.
					const chart = document.querySelector(".ce-block .widget.dashboard-widget-box");
					const redactor = document.querySelector(".codex-editor__redactor");
					return {
						shadow: cs.boxShadow, radius: cs.borderTopLeftRadius,
						borderColor: cs.borderTopColor,
						bg: cs.backgroundColor,
						chartShadow: chart ? getComputedStyle(chart).boxShadow : null,
						cePad: getComputedStyle(ce).paddingLeft,
						redactorOverflow: redactor ? getComputedStyle(redactor).overflow : null,
					};
				});
				expect(!px.missing, "the workspace rendered a tile in a block");
				// One computed proof per style — an attribute is not correctness.
				if (slug === "grid") {
					expect(px.shadow !== "none", `Hairline Grid draws the shared ring (${px.shadow})`);
					expectEq(px.radius, "0px", "tiles are square — the board carries the outer radius");
					expectEq(px.cePad, "0px", "zero gutter — tiles butt together");
					expectEq(px.redactorOverflow, "hidden", "the board clips its corners (read mode)");
				} else if (slug === "cards") {
					expect(px.shadow !== "none" && px.shadow !== px.chartShadow || px.shadow.includes("px"),
						`Floating Cards lifts the tile (${px.shadow})`);
					expect(px.radius !== "0px", "and keeps a radius");
				} else if (slug === "open") {
					expectEq(px.bg, "rgba(0, 0, 0, 0)", "Open Board has no tile fill");
				} else if (slug === "soft") {
					expect(px.borderColor === "rgba(0, 0, 0, 0)", "Soft Tiles drops the border");
				} else if (slug === "mixed") {
					expect(px.chartShadow && px.chartShadow !== "none", `Mixed Weights lifts the chart tile (${px.chartShadow})`);
				}
			});
		}

		await test("workspace: live preview flips the style and back", async () => {
			setSettings({ workspace_style: "Hairline Grid" });
			await goDesk(WS_ROUTE, ".widget", 3000);
			expectEq(await attr("data-bnd-ws"), "grid", "boot applied grid");
			await page.evaluate(() => window.bunood_theme.workspace_apply({ workspace_style: "Floating Cards" }));
			expectEq(await attr("data-bnd-ws"), "cards", "preview flipped to cards");
			await page.evaluate(() => window.bunood_theme.workspace_apply({ workspace_style: "Hairline Grid" }));
			expectEq(await attr("data-bnd-ws"), "grid", "and back");
		});

		await test("workspace: Edge Rail is a neutral rail on hover, not a chosen state", async () => {
			setSettings({ workspace_style: "Hairline Grid", workspace_rows: "Edge Rail" });
			await goDesk(WS_ROUTE, ".link-item", 3000);
			expectEq(await attr("data-bnd-ws-rows"), "rail", "rows attribute");
			const rail = await page.evaluate(async () => {
				const row = document.querySelector(".ce-block .widget.links .link-item");
				if (!row) return { noRow: true };
				const before = getComputedStyle(row, "::before").backgroundColor;
				return { rest: before, position: getComputedStyle(row).position };
			});
			if (!rail.noRow) {
				// At rest the rail is absent (only paints on hover) and the row is a
				// positioning context for it.
				expectEq(rail.position, "relative", "the row anchors its rail");
			}
		});

		await test("workspace: the number card metric restyles the figure, and numbers are tabular", async () => {
			setSettings({ workspace_style: "Hairline Grid", workspace_metric: "Display" });
			await goDesk(WS_ROUTE, ".number-widget-box .number", 4000);
			expectEq(await attr("data-bnd-ws-metric"), "display", "metric attribute");
			const disp = await page.evaluate(() => {
				const nc = document.querySelector(".ce-block .widget.number-widget-box");
				if (!nc) return { missing: true };
				const num = nc.querySelector(".number");
				const title = nc.querySelector(".widget-title");
				return {
					numFvn: getComputedStyle(num).fontVariantNumeric,
					numSize: parseFloat(getComputedStyle(num).fontSize),
					titleTransform: getComputedStyle(title).textTransform,
					containerType: getComputedStyle(nc).containerType,
				};
			});
			expect(!disp.missing, "a number card rendered");
			// Tabular numerals: the value no longer jitters on refresh.
			expect(/tabular-nums/.test(disp.numFvn), `the value is tabular (${disp.numFvn})`);
			// Display: an eyebrow label and a value larger than the stock 20px.
			expectEq(disp.titleTransform, "uppercase", "the label is an eyebrow");
			expect(disp.numSize > 20, `the value steps up (${disp.numSize}px)`);
			expect(disp.containerType !== "normal", "the card is a query container (value sizes to it)");
			// Live-preview to Headline: the value comes first.
			await page.evaluate(() => window.bunood_theme.workspace_apply({ workspace_metric: "Headline" }));
			await page.waitForTimeout(200);
			const headOrder = await page.evaluate(() => {
				const b = document.querySelector(".ce-block .widget.number-widget-box .widget-body");
				return b ? getComputedStyle(b).order : "none";
			});
			expectEq(headOrder, "-1", "Headline puts the value first");
		});

		// ── Chart series palette (item 25) ─────────────────────────────────
		//
		// A runtime kit, not a settings one: no attribute, no picker — bunood.js
		// wraps frappe.Chart so every chart draws from the contrast-gated
		// --bnd-series-* ramp instead of the vendor's own (unmeasured) palette.
		// Every assertion reads the ramp LIVE from the tokens rather than
		// hardcoding it — the same fact must not live in the test twice — and
		// checks the rendered mark's COMPUTED fill, because the vendor writes it as
		// an inline style attribute a getAttribute would miss. The teeth: a
		// regression that stops the wrap running paints vendor pink (#f683ae),
		// which is not in our ramp, so the equality fails.
		const CHART_ROUTE = "/desk/selling"; // any desk page; frappe.Chart is loaded

		await test("chart: series marks take the derived ramp, not the vendor palette", async () => {
			await goDesk(CHART_ROUTE, ".layout-main-section", 3000);
			const r = await page.evaluate(async () => {
				const html = getComputedStyle(document.documentElement);
				const ramp = [];
				for (let i = 1; i <= 7; i++) ramp.push(html.getPropertyValue("--bnd-series-" + i).trim().toLowerCase());
				const host = document.createElement("div");
				host.style.width = "420px";
				document.body.appendChild(host);
				const chart = new frappe.Chart(host, {
					type: "bar", height: 200, colors: [],
					data: { labels: ["a", "b", "c"], datasets: [
						{ values: [3, 2, 4] }, { values: [2, 4, 3] }, { values: [4, 3, 2] }] },
				});
				await new Promise((res) => setTimeout(res, 700));
				const rgbHex = (s) => { const m = s.match(/(\d+),\s*(\d+),\s*(\d+)/);
					return m ? "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("") : s; };
				const fills = [...new Set([...host.querySelectorAll("rect.bar, .dataset-bars rect")]
					.map((e) => rgbHex(getComputedStyle(e).fill)).filter((f) => f && f !== "none"))];
				host.remove();
				return { ramp, fills, patched: frappe.Chart.name === "BndChart" };
			});
			expect(r.patched, "frappe.Chart is wrapped (BndChart)");
			expect(r.fills.length >= 3, `three datasets give three distinct mark colours (got ${r.fills.join(", ")})`);
			for (const f of r.fills) {
				expect(r.ramp.includes(f), `mark ${f} is a series token (not the vendor palette)`);
			}
			expect(!r.fills.includes("#f683ae"), "no mark is the vendor default pink");
			expectEq(r.fills.slice(0, 3).join(" "), r.ramp.slice(0, 3).join(" "), "series 1-3 map to ramp 1-3 in order");
		});

		await test("chart: an admin colour is kept, an empty slot is filled, no warning", async () => {
			await goDesk(CHART_ROUTE, ".layout-main-section", 3000);
			const r = await page.evaluate(async () => {
				const warns = [];
				const orig = console.warn;
				console.warn = (...a) => { warns.push(a.join(" ")); };
				const html = getComputedStyle(document.documentElement);
				const series1 = html.getPropertyValue("--bnd-series-1").trim().toLowerCase();
				const rgbHex = (s) => { const m = s.match(/(\d+),\s*(\d+),\s*(\d+)/);
					return m ? "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("") : s; };
				const h1 = document.createElement("div"); h1.style.width = "360px"; document.body.appendChild(h1);
				new frappe.Chart(h1, { type: "line", height: 180, colors: ["#123456"],
					data: { labels: ["a", "b"], datasets: [{ values: [1, 2] }] } });
				const h2 = document.createElement("div"); h2.style.width = "360px"; document.body.appendChild(h2);
				new frappe.Chart(h2, { type: "line", height: 180, colors: [[]],
					data: { labels: ["a", "b", "c"], datasets: [{ values: [1, 2, 3] }] } });
				await new Promise((res) => setTimeout(res, 600));
				const admin = rgbHex(getComputedStyle(h1.querySelector(".line-graph-path")).stroke);
				const empty = rgbHex(getComputedStyle(h2.querySelector(".line-graph-path")).stroke);
				console.warn = orig;
				h1.remove(); h2.remove();
				return { admin, empty, series1, colorWarns: warns.filter((w) => /is not a valid color/.test(w)).length };
			});
			expectEq(r.admin, "#123456", "the admin's per-chart colour is kept verbatim");
			expectEq(r.empty, r.series1, "an uncoloured chart takes series 1");
			expectEq(r.colorWarns, 0, "no `is not a valid color` warning — the empty slot is dropped");
		});

		await test("chart: a theme flip repaints the series in place", async () => {
			await goDesk(CHART_ROUTE, ".layout-main-section", 3000);
			const r = await page.evaluate(async () => {
				const rgbHex = (s) => { const m = s.match(/(\d+),\s*(\d+),\s*(\d+)/);
					return m ? "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("") : s; };
				const ramp = () => { const h = getComputedStyle(document.documentElement); const a = [];
					for (let i = 1; i <= 7; i++) a.push(h.getPropertyValue("--bnd-series-" + i).trim().toLowerCase()); return a; };
				const host = document.createElement("div"); host.style.width = "420px"; document.body.appendChild(host);
				new frappe.Chart(host, { type: "bar", height: 200, colors: [],
					data: { labels: ["a", "b"], datasets: [{ values: [3, 2] }, { values: [2, 4] }] } });
				await new Promise((res) => setTimeout(res, 600));
				const before = {
					fills: [...new Set([...host.querySelectorAll("rect.bar, .dataset-bars rect")]
						.map((e) => rgbHex(getComputedStyle(e).fill)))] };
				document.documentElement.setAttribute("data-theme", "dark");
				if (window.bunood_theme && window.bunood_theme.chart_apply) window.bunood_theme.chart_apply();
				await new Promise((res) => setTimeout(res, 900));
				// draw(false,false) rebuilds the chart's own SVG on the SAME instance
				// in the SAME container — the widget holds the instance, not the SVG,
				// so nothing is stranded. The observable proof of "in place" is that
				// the container still holds exactly ONE chart (not 0 = destroyed, not
				// 2 = duplicated), recoloured.
				const after = { ramp: ramp(),
					containers: host.querySelectorAll(".chart-container").length,
					fills: [...new Set([...host.querySelectorAll("rect.bar, .dataset-bars rect")]
						.map((e) => rgbHex(getComputedStyle(e).fill)))] };
				document.documentElement.removeAttribute("data-theme");
				host.remove();
				return { hasHook: !!(window.bunood_theme && window.bunood_theme.chart_apply),
					beforeFills: before.fills, afterFills: after.fills, darkRamp: after.ramp,
					containers: after.containers };
			});
			expect(r.hasHook, "bunood.chart_apply exists (the mandatory live-preview hook)");
			expectEq(r.containers, 1, "the chart repainted in place — one chart in the container, not destroyed or duplicated");
			for (const f of r.afterFills) expect(r.darkRamp.includes(f), `after flip, mark ${f} is a dark-ramp token`);
			expect(r.beforeFills.join() !== r.afterFills.join(), "the flip actually changed the marks");
		});

		await test("chart: the chrome is themed, and chart_grid flips live", async () => {
			setSettings({ chart_grid: "Filled Area" });
			await goDesk(CHART_ROUTE, ".layout-main-section", 3000);
			const r = await page.evaluate(async () => {
				const host = document.createElement("div"); host.style.width = "440px"; document.body.appendChild(host);
				new frappe.Chart(host, { type: "line", height: 220, colors: [],
					data: { labels: ["a", "b", "c", "d"], datasets: [{ values: [3, 5, 2, 8] }] } });
				await new Promise((res) => setTimeout(res, 700));
				const c = host.querySelector(".chart-container");
				const html = getComputedStyle(document.documentElement);
				const read = () => {
					const region = c.querySelector(".region-fill");
					const vgrid = c.querySelector(".line-vertical line, line.line-vertical, .x.axis line");
					const label = c.querySelector(".chart-label, .axis text, text");
					return {
						attr: document.documentElement.getAttribute("data-bnd-chart-grid"),
						regionOpacity: region ? getComputedStyle(region).opacity : "none",
						vgridStroke: vgrid ? getComputedStyle(vgrid).stroke : "none",
						labelFill: label ? getComputedStyle(label).fill : "none",
					};
				};
				const filled = read();
				// Live-preview the axis: Ruled Baseline via the mandatory hook.
				window.bunood_theme.chart_apply({ chart_grid: "Ruled Baseline" });
				await new Promise((res) => setTimeout(res, 200));
				const ruled = read();
				const out = { filled, ruled,
					bndInkMuted: html.getPropertyValue("--bnd-ink-muted").trim(),
					vendorLabel: "rgb(49, 59, 68)" };
				host.remove();
				return out;
			});
			// The base chrome is themed: axis labels take our muted ink, not the vendor #313b44.
			expect(r.filled.labelFill !== r.vendorLabel, `axis labels are themed, not the vendor grey (${r.filled.labelFill})`);
			// Filled Area shows the area fill; Ruled hides it.
			expectEq(r.filled.attr, "filled", "default chart_grid is Filled Area");
			expect(r.filled.regionOpacity !== "0" && r.filled.regionOpacity !== "none",
				`the area fill is visible under Filled Area (${r.filled.regionOpacity})`);
			// The live hook flipped the attribute and the CSS responded.
			expectEq(r.ruled.attr, "ruled", "chart_apply flipped the attribute to ruled");
			expectEq(r.ruled.regionOpacity, "0", "Ruled Baseline hides the area fill");
			expectEq(r.ruled.vgridStroke, "rgba(0, 0, 0, 0)", "Ruled Baseline drops the vertical gridlines");
		});

		// ── Report / datatable kit (item 26) ────────────────────────────────
		//
		// A surface kit: attributes on <html>, a stylesheet over frappe-datatable,
		// nothing mounted. Every style ships; assertions read the RENDERED cell,
		// not just the attribute. Account is the fixture — 98 rows, a tree doctype,
		// on the list-route report view; navigation waits for a datatable row, NOT
		// .list-row-container, which this route never emits (report_view.js:14).
		const RPT_ROUTE = "/app/account/view/report";

		await test("report: Original applies nothing at all", async () => {
			setSettings({ report_style: "Original" });
			await goDesk(RPT_ROUTE, ".dt-row-header", 5000);
			const state = await page.evaluate(() => {
				const attrs = [...document.documentElement.attributes]
					.filter((a) => a.name.startsWith("data-bnd-report")).map((a) => a.name);
				const hc = document.querySelector(".dt-header .dt-cell--header .dt-cell__content");
				return { attrs, numerals: hc ? getComputedStyle(hc).fontVariantNumeric : null };
			});
			expectEq(state.attrs.join(","), "", "no report attribute survives Original");
			// The stand-down is TOTAL: the numerals fix goes too, back to stock's
			// legacy font-feature-settings form, which reads as "normal" here.
			expectEq(state.numerals, "normal", "numerals revert to stock under Original");
		});

		const RPT_STYLE_SLUG = {
			"Ruled Grid": "ruled", "Ledger Rows": "ledger", "Open Sheet": "open", "Pinned Slab": "slab",
		};
		for (const [label, slug] of Object.entries(RPT_STYLE_SLUG)) {
			await test(`report: ${label}`, async () => {
				setSettings({ report_style: label, report_grain: "Plain", report_rows: "Soft Wash", report_checkbox_reveal: 0 });
				await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
				expectEq(await attr("data-bnd-report"), slug, "style attribute");
				const px = await page.evaluate(() => {
					const q = (s) => document.querySelector(s);
					const bodyCell = q(".dt-scrollable .dt-cell");
					const headerBox = q(".dt-header");
					const headerContent = q(".dt-header .dt-cell--header .dt-cell__content");
					if (!bodyCell || !headerBox || !headerContent) return { missing: true };
					const bc = getComputedStyle(bodyCell);
					const hb = getComputedStyle(headerBox);
					return {
						cellBorderInline: bc.borderInlineStartWidth + " " + bc.borderInlineStartColor,
						cellBorderBlock: bc.borderBlockStartWidth + " " + bc.borderBlockStartColor,
						headerBg: getComputedStyle(headerContent).backgroundColor,
						headerSep: hb.borderBlockEndWidth,
						headerShadow: hb.boxShadow,
					};
				});
				expect(!px.missing, "the datatable rendered a header and a body cell");
				// One computed proof per style — an attribute is not correctness.
				const transparent = (s) => /rgba\(0, 0, 0, 0\)/.test(s);
				if (slug === "ruled") {
					expect(!transparent(px.cellBorderInline),
						`Ruled Grid draws vertical column lines (${px.cellBorderInline})`);
				} else if (slug === "ledger") {
					expect(transparent(px.cellBorderInline),
						`Ledger Rows drops the vertical lines (${px.cellBorderInline})`);
					expect(!transparent(px.cellBorderBlock),
						`Ledger Rows keeps the horizontal rules (${px.cellBorderBlock})`);
				} else if (slug === "open") {
					expectEq(px.headerBg, "rgba(0, 0, 0, 0)", "Open Sheet gives the header no fill");
				} else if (slug === "slab") {
					// The slab floats: a boundary AND an elevation, not fill alone.
					expect(px.headerSep !== "0px", `Pinned Slab draws the header boundary (${px.headerSep})`);
					expect(px.headerShadow !== "none", `Pinned Slab lifts the header (${px.headerShadow})`);
				}
			});
		}

		await test("report: numerals cover the whole table — header, filter, body", async () => {
			// Frappe's tnum is body-only AND in the legacy font-feature-settings
			// form that getComputedStyle reads as "normal" (smoke would miss it).
			// The kit sets font-variant-numeric on every .dt-cell__content, so all
			// three rows read tabular — both stock defects fixed in one rule.
			setSettings({ report_style: "Pinned Slab" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			const n = await page.evaluate(() => {
				const fvn = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).fontVariantNumeric : "absent"; };
				return {
					header: fvn(".dt-header .dt-cell--header .dt-cell__content"),
					filter: fvn(".dt-row-filter .dt-cell__content"),
					body: fvn(".dt-scrollable .dt-cell .dt-cell__content"),
				};
			});
			expect(/tabular-nums/.test(n.header), `header cells are tabular (${n.header})`);
			expect(/tabular-nums/.test(n.filter), `filter cells are tabular (${n.filter})`);
			expect(/tabular-nums/.test(n.body), `body cells are tabular (${n.body})`);
		});

		await test("report: the header band has a boundary", async () => {
			// Stock measures 0px border / none shadow / ~1.5% fill delta — the band
			// is invisible AS a header. Pinned Slab makes it a boundary + elevation
			// statement (a border OR a shadow OR a >=3% fill delta each satisfy the
			// resting-identity rule; the slab carries the first two).
			setSettings({ report_style: "Pinned Slab" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			const b = await page.evaluate(() => {
				const cs = getComputedStyle(document.querySelector(".dt-header"));
				return { sep: cs.borderBlockEndWidth, shadow: cs.boxShadow };
			});
			expect(b.sep !== "0px" || b.shadow !== "none",
				`the header band is bounded (border ${b.sep}, shadow ${b.shadow})`);
		});

		await test("report: the focus ring is the accent, and survives Original", async () => {
			// The ring is a CONTRACT, lifted OUT of the anchor (html[data-theme])
			// like _list.scss's density block — so it holds even under Original,
			// where every STYLE rule is gone. frappe-datatable marks the clicked
			// cell .dt-cell--focus and colours its content-box border; we re-colour
			// it --bnd-accent, the theme's one gated focus colour.
			setSettings({ report_style: "Original" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			const box = await page.evaluate(() => {
				const c = document.querySelectorAll(".dt-scrollable .dt-cell")[8];
				if (!c) return null;
				const r = c.getBoundingClientRect();
				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
			});
			expect(box, "a data cell rendered to click");
			await page.mouse.click(box.x, box.y); // a real mouse event — the datatable's own focus path
			await page.waitForTimeout(300);
			const ring = await page.evaluate(() => {
				const f = document.querySelector(".dt-cell--focus .dt-cell__content");
				// Resolve --bnd-accent to rgb the same way the border is computed.
				const probe = document.createElement("span");
				probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--bnd-accent").trim();
				document.body.appendChild(probe);
				const accentRgb = getComputedStyle(probe).color;
				probe.remove();
				return { found: !!f, ringColor: f ? getComputedStyle(f).borderTopColor : null, accentRgb };
			});
			expect(ring.found, "clicking a cell focuses it (.dt-cell--focus)");
			expectEq(ring.ringColor, ring.accentRgb, "the focus ring is --bnd-accent even under Original");
		});

		await test("report: live preview flips the style and back", async () => {
			setSettings({ report_style: "Pinned Slab" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			expectEq(await attr("data-bnd-report"), "slab", "boot applied slab");
			await page.evaluate(() => window.bunood_theme.report_apply({ report_style: "Ruled Grid" }));
			expectEq(await attr("data-bnd-report"), "ruled", "preview flipped to ruled");
			await page.evaluate(() => window.bunood_theme.report_apply({ report_style: "Pinned Slab" }));
			expectEq(await attr("data-bnd-report"), "slab", "and back");
		});

		// ── Slice 3: grain and row feedback ──────────────────────────────────
		// Read the rendered fill of rows BY VISUAL INDEX (data-row-index), never
		// :nth-child — the rows are virtualised, so window position is not data
		// position. `.dt-cell:nth-child(3)` is a data column (past the checkbox
		// and serial gutters); its background is what the row-bg resolves to.
		const rowBgsByIndex = (idxs) =>
			page.evaluate((indices) => {
				const bg = (idx) => {
					const r = document.querySelector(`.dt-scrollable .dt-row[data-row-index='${idx}']`);
					if (!r) return null;
					const c = r.querySelector(".dt-cell:nth-child(3)") || r.querySelector(".dt-cell");
					return getComputedStyle(c).backgroundColor;
				};
				return Object.fromEntries(indices.map((i) => [i, bg(i)]));
			}, idxs);
		const clickCenter = async (sel) => {
			const b = await page.evaluate((s) => {
				const el = document.querySelector(s);
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
			}, sel);
			expect(b, `clickable: ${sel}`);
			await page.mouse.click(b.x, b.y);
			await page.waitForTimeout(300);
		};

		await test("report: grain alternates at page length 100 (real virtualisation)", async () => {
			// The whole point of the grain probe: at the default page length of 20
			// nothing is windowed and :nth-child would LOOK correct; at 100 HyperList
			// virtualises and only data-row-index parity is real. Measure the RENDERED
			// fill of visually-adjacent rows — never a rule's presence.
			setSettings({ report_style: "Pinned Slab", report_grain: "Row Stripes", report_rows: "Soft Wash" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			await page.evaluate(() => {
				const b = [...document.querySelectorAll(".list-paging-area .btn-paging")].find((x) => x.textContent.trim() === "100");
				if (b) b.click();
			});
			await page.waitForTimeout(3500);
			await page.mouse.move(700, 60); // hover must not taint the read
			await page.waitForTimeout(300);
			const g = await rowBgsByIndex([2, 3, 4, 5]);
			expect(g[2] && g[3], "rows rendered at page length 100");
			// Even-top rows match; odd-top rows match; the two differ — the
			// alternation :nth-child would break once rows are windowed.
			expectEq(g[2], g[4], "even rows share the base fill");
			expectEq(g[3], g[5], "odd rows share the stripe fill");
			expect(g[2] !== g[3], `the stripe alternates by visual index (${g[2]} vs ${g[3]})`);
		});

		await test("report: selection beats the stripe on an odd row", async () => {
			// The specificity trap: grain's .dt-row[style*=] is (0,4,1); a bare
			// .dt-row--highlight is (0,3,1) and LOSES, so a selected odd row would
			// show the stripe (measured — it did, before the doubled class).
			setSettings({ report_style: "Pinned Slab", report_grain: "Row Stripes", report_rows: "Edge Rail" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			await clickCenter(".dt-scrollable .dt-row[data-row-index='3'] .dt-cell--col-0 input[type=checkbox]");
			await page.mouse.move(700, 60);
			await page.waitForTimeout(200);
			const g = await rowBgsByIndex([5]); // an odd, unselected stripe row
			const sel = await page.evaluate(() => {
				const row = document.querySelector(".dt-scrollable .dt-row--highlight");
				if (!row) return null;
				const c = row.querySelector(".dt-cell:nth-child(3)") || row.querySelector(".dt-cell");
				return { selBg: getComputedStyle(c).backgroundColor, rail: getComputedStyle(row, "::before").width };
			});
			expect(sel, "a highlighted row rendered");
			expect(sel.selBg !== g[5], `the selected odd row is the selection fill, not the stripe (${sel.selBg} vs ${g[5]})`);
			expectEq(sel.rail, "3px", "Edge Rail draws its rail on the selection");
		});

		await test("report: select-all, then uncheck one — the odd one out is not selected", async () => {
			// .dt-row--unhighlight is the third select-all state: highlight-all is on,
			// this row opted out. It must read as NOT selected (blocker 2).
			//
			// BOLD BAR, and the EFFECTIVE visible layer — the adversarial review's
			// case. During select-all the vendor paints the OPAQUE .dt-cell__content
			// (`.dt-scrollable--highlight-all .dt-cell__content { background: … }`)
			// over the kit's per-row .dt-cell fill. The first cut of this test read
			// .dt-cell and passed green while the visible content box was the vendor
			// wash (masking Bold Bar's brand fill, and the unhighlight carve-out).
			// Read the content box if opaque, else the cell; and pin that the kit
			// CLEARS the content box so its own fill shows through.
			setSettings({ report_style: "Pinned Slab", report_grain: "Plain", report_rows: "Bold Bar" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			await clickCenter(".dt-header input[type=checkbox]"); // select all
			await clickCenter(".dt-scrollable .dt-row[data-row-index='2'] .dt-cell--col-0 input[type=checkbox]"); // uncheck one
			await page.mouse.move(700, 60);
			await page.waitForTimeout(200);
			const s = await page.evaluate(() => {
				const eff = (idx) => {
					const row = document.querySelector(`.dt-scrollable .dt-row[data-row-index='${idx}']`);
					if (!row) return null;
					const cell = row.querySelector(".dt-cell:nth-child(3)") || row.querySelector(".dt-cell");
					const content = cell.querySelector(".dt-cell__content");
					const cbg = content ? getComputedStyle(content).backgroundColor : "rgba(0, 0, 0, 0)";
					const opaque = !/,\s*0\)$/.test(cbg); // rgba(...,0) == transparent
					return { effective: opaque ? cbg : getComputedStyle(cell).backgroundColor, contentBg: cbg };
				};
				return { sel: eff(3), unhl: eff(2) };
			});
			expect(s.sel && s.unhl, "the de-selected row and a selected neighbour both rendered");
			// The fix: the kit clears the vendor's opaque content-box highlight, so
			// the selected row's own brand fill (not the light vendor wash) shows.
			expect(/,\s*0\)$/.test(s.sel.contentBg), `the selected content box is cleared, not the vendor mask (${s.sel.contentBg})`);
			// And the de-selected row is visibly distinct from its selected neighbour.
			expect(s.sel.effective !== s.unhl.effective, `the de-selected row differs from its selected neighbour (${s.unhl.effective} vs ${s.sel.effective})`);
		});

		await test("report: the checkbox reveal rests hidden and opens on hover", async () => {
			// Route-gated to the report view (decision 1): the reveal must never
			// hide a checkbox in a MultiSelectDialog. opacity, not display — the box
			// stays in the tab order. (Door 2 :focus-within shares the selector;
			// the (hover:none) stand-down is covered by the emulated-touch axe run.)
			setSettings({ report_style: "Pinned Slab", report_checkbox_reveal: 1 });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			await page.mouse.move(700, 60); // away from every row
			await page.waitForTimeout(250);
			const rest = await page.evaluate(() => {
				const cb = document.querySelector(".dt-scrollable .dt-cell--col-0 input[type=checkbox]");
				return cb ? getComputedStyle(cb).opacity : "none";
			});
			expectEq(rest, "0", "the checkbox rests hidden");
			const rowBox = await page.evaluate(() => {
				const r = document.querySelector(".dt-scrollable .dt-row[data-row-index='3']");
				const b = r.getBoundingClientRect();
				return { x: Math.round(b.left + 200), y: Math.round(b.top + b.height / 2) };
			});
			await page.mouse.move(rowBox.x, rowBox.y);
			await page.waitForTimeout(250);
			const hover = await page.evaluate(() => {
				const cb = document.querySelector(".dt-scrollable .dt-row[data-row-index='3'] .dt-cell--col-0 input[type=checkbox]");
				return cb ? getComputedStyle(cb).opacity : "none";
			});
			expectEq(hover, "1", "row hover reveals the checkbox");
		});

		await test("report: the query-report summary follows the report kit, not the workspace kit", async () => {
			// The summary strip (#page-query-report .report-summary) was owned by
			// data-bnd-ws with no route gate, so workspace_style:Original stripped its
			// numerals — a row that belongs to the report surface. Item 26 split it by
			// ancestor (disjoint: the dashboard has no .report-summary; the query one
			// is under #page-query-report, not .widget). With the WORKSPACE kit off,
			// the report kit still carries the summary's tabular numerals.
			setSettings({ workspace_style: "Original", report_style: "Pinned Slab" });
			await goDesk("/app/query-report/Balance Sheet", ".report-summary", 6000);
			const s = await page.evaluate(() => {
				const v = document.querySelector(".report-summary .summary-value");
				return { ws: document.documentElement.hasAttribute("data-bnd-ws"), fvn: v ? getComputedStyle(v).fontVariantNumeric : "none" };
			});
			expectEq(s.ws, false, "the workspace kit is off");
			expect(/tabular-nums/.test(s.fvn), `the summary is tabular under the report kit alone (${s.fvn})`);
		});

		// ── The three adversarial-review findings (fixed pre-release) ────────
		await test("report: a discarded live preview reverts to the saved state", async () => {
			// bnd_report_preview was missing from the refresh/discard-revert batch
			// (and the import batch) — the escapee class: a call present for every
			// sibling kit, silently absent for report, no error, not default-state.
			// Preview Original (clears the anchor), then trigger the revert
			// (cur_frm.refresh re-applies every kit's SAVED values); report must be
			// restored to the saved Pinned Slab, not left at the unsaved preview.
			setSettings({ report_style: "Pinned Slab" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			await page.evaluate(() => window.bunood_theme.report_apply({ report_style: "Original" }));
			expectEq(await page.evaluate(() => document.documentElement.getAttribute("data-bnd-report")), null, "the preview cleared the report anchor");
			await page.evaluate(() => cur_frm.refresh());
			await page.waitForTimeout(700);
			expectEq(await page.evaluate(() => document.documentElement.getAttribute("data-bnd-report")), "slab", "the refresh/discard revert restored the saved Pinned Slab");
		});

		await test("report: the focus ring stays visible on a Bold Bar selection", async () => {
			// A Bold Bar selected row fills its cells --bnd-brand-solid; --bnd-accent
			// alone on that measures ~1.07:1 (SC 2.4.11 fail — the review finding,
			// worse than stock's grey). The two-tone ring adds an --bnd-on-brand
			// companion (gated AA vs brand-solid), so at least one tone clears 3:1 on
			// any fill. Measure the real contrast against the fill.
			setSettings({ report_style: "Pinned Slab", report_rows: "Bold Bar" });
			await goDesk(RPT_ROUTE, ".dt-scrollable .dt-row", 5000);
			await clickCenter(".dt-scrollable .dt-row[data-row-index='3'] .dt-cell--col-0 input[type=checkbox]"); // select the row
			const box = await page.evaluate(() => {
				const c = document.querySelector(".dt-scrollable .dt-row[data-row-index='3'] .dt-cell:nth-child(4)");
				if (!c) return null;
				const r = c.getBoundingClientRect();
				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
			});
			expect(box, "a cell in the selected row rendered");
			await page.mouse.click(box.x, box.y); // focus a cell INSIDE the selected row
			await page.waitForTimeout(300);
			const ring = await page.evaluate(() => {
				const lum = (rgb) => {
					const p = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
					return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
				};
				const contrast = (a, b) => { const x = lum(a), y = lum(b); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); };
				const cell = document.querySelector(".dt-cell--focus");
				if (!cell) return { noFocus: true };
				const content = cell.querySelector(".dt-cell__content");
				return {
					rowSelected: !!cell.closest(".dt-row--highlight"),
					fill: getComputedStyle(cell).backgroundColor,
					borderContrast: contrast(getComputedStyle(content).borderTopColor, getComputedStyle(cell).backgroundColor),
					shadowContrast: (() => { const sc = (getComputedStyle(content).boxShadow.match(/rgba?\([^)]+\)/) || [])[0]; return sc ? contrast(sc, getComputedStyle(cell).backgroundColor) : 0; })(),
				};
			});
			expect(!ring.noFocus, "clicking a cell in the selected row focuses it");
			expect(ring.rowSelected, "the focused cell's row is still selected (brand-solid fill)");
			const best = Math.max(ring.borderContrast || 0, ring.shadowContrast || 0);
			expect(best >= 3, `the focus ring clears 3:1 on the Bold Bar fill (best ${best.toFixed(2)}:1; accent ${(ring.borderContrast || 0).toFixed(2)}, companion ${(ring.shadowContrast || 0).toFixed(2)}, fill ${ring.fill})`);
		});

		// ── Alternate views kit (item 27) ──────────────────────────────────
		//
		// ONE surface kit over four vendors — kanban (Frappe DOM), calendar
		// (FullCalendar 6), gantt (frappe-gantt SVG), gallery (a .frappe-list
		// variant). Attributes on <html>, a stylesheet over each vendor's DOM,
		// nothing mounted. Every route needs the seeded fixtures
		// (tools/fixtures-views.mjs) — the pinned board is "Bunood Memos".
		// Assertions read the RENDERED node, not just the attribute. This slice
		// is the anchor + the four repairs; the band/mark/media/reveal axes and
		// the calendar colour wrap are slice 3.
		const VIEWS_KANBAN = "/app/todo/view/kanban/Bunood%20Memos";

		await test("views: Original applies nothing at all", async () => {
			// The stand-down must be total: no attribute survives AND the kanban
			// card returns to Frappe's own 10px radius (--border-radius-md).
			setSettings({ views_style: "Original" });
			await goDesk(VIEWS_KANBAN, ".kanban-column", 5000);
			const g = await page.evaluate(() => {
				const html = document.documentElement;
				const attrs = [...html.attributes].map((a) => a.name).filter((n) => n.startsWith("data-bnd-views"));
				const card = document.querySelector(".kanban-card.content");
				return { attrs, radius: card ? getComputedStyle(card).borderTopLeftRadius : null };
			});
			expectEq(g.attrs.join(","), "", "no data-bnd-views* attribute survives Original");
			expectEq(g.radius, "10px", "the kanban card is back to Frappe's own radius");
			// The calendar's colour wrap is JS, not CSS — it must ALSO stand down
			// under Original, or events keep our accent while the SCSS reverts (an
			// adversarial-review finding: the wrap was ungated). Events must carry
			// NO accent-derived fill.
			await goDesk("/app/todo/view/calendar", ".fc-daygrid-block-event", 6000);
			const cal = await page.evaluate(() => {
				const accent = getComputedStyle(document.documentElement).getPropertyValue("--bnd-accent").trim();
				const h = accent.replace("#", "");
				const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
				const bgs = [...document.querySelectorAll(".fc-daygrid-block-event")].map((e) => getComputedStyle(e).backgroundColor);
				return { rgb, anyAccent: bgs.some((b) => b.includes(rgb)), count: bgs.length };
			});
			expect(cal.count > 0, "the calendar rendered events under Original");
			expect(!cal.anyAccent, `no calendar event carries our accent under Original (stock stands) — accent ${cal.rgb}`);
		});

		await test("views: the anchor dresses the kanban card", async () => {
			// Floating Cards default: the card takes our radius (6px, not stock
			// 10px) AND a real box-shadow (stock is none on the (0,5,0) rule).
			setSettings({ views_style: "Floating Cards" });
			await goDesk(VIEWS_KANBAN, ".kanban-column", 5000);
			const g = await page.evaluate(() => {
				const card = document.querySelector(".kanban-card.content");
				const cs = getComputedStyle(card);
				return { anchor: document.documentElement.getAttribute("data-bnd-views"), radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
			});
			expectEq(g.anchor, "cards", "the anchor slug is 'cards'");
			expect(g.radius !== "10px" && g.radius !== "0px", `the card takes our radius (got ${g.radius})`);
			expect(g.shadow !== "none", "the card takes a real box-shadow, beating Frappe's (0,5,0) none");
		});

		await test("views: the gantt is legible in dark mode", async () => {
			// The repair. Stock paints .bar, .grid-row and .grid-header literal
			// white — invisible on a dark page. Under the anchor they take our
			// theme-aware tokens, which flip dark. Fails against stock: all white.
			setSettings({ views_style: "Floating Cards" });
			await goDesk("/app/todo/view/gantt", ".gantt .bar", 6000);
			const g = await page.evaluate(() => {
				document.documentElement.setAttribute("data-theme", "dark");
				return new Promise((res) =>
					setTimeout(() => {
						const fill = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).fill : null; };
						const plain = [...document.querySelectorAll(".gantt .bar-wrapper")].find((w) => ![...w.classList].some((c) => c.startsWith("color-")));
						res({
							gridRow: fill(".gantt .grid-row"),
							gridHeader: fill(".gantt .grid-header"),
							bar: plain ? getComputedStyle(plain.querySelector(".bar")).fill : null,
							page: getComputedStyle(document.body).backgroundColor,
						});
					}, 500)
				);
			});
			await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
			const white = "rgb(255, 255, 255)";
			expect(g.gridRow !== white, `the gantt grid row is not stock white in dark mode (got ${g.gridRow})`);
			expect(g.gridHeader !== white, `the gantt header is not stock white (got ${g.gridHeader})`);
			expect(g.bar && g.bar !== white, `a plain gantt bar is not stock white (got ${g.bar})`);
		});

		await test("views: an admin's task colour survives the kit", async () => {
			// gantt_view.js injects a <style> giving a task with a `color` field
			// its own .bar-wrapper.color-XXXXXX .bar fill (0,3,0). Our default bar
			// rule needs (0,4,0), which would also beat that — so it carves the
			// admin case out with :not([class*="color-"]). The fixture seeds
			// coloured ToDos so this path is exercised. Fails without the carve-out:
			// the coloured bar would take our brand fill like every other.
			setSettings({ views_style: "Floating Cards" });
			await goDesk("/app/todo/view/gantt", ".gantt .bar", 6000);
			const g = await page.evaluate(() => {
				const admin = [...document.querySelectorAll(".gantt .bar-wrapper")].find((w) => [...w.classList].some((c) => c.startsWith("color-")));
				const plain = [...document.querySelectorAll(".gantt .bar-wrapper")].find((w) => ![...w.classList].some((c) => c.startsWith("color-")));
				return {
					adminClass: admin ? [...admin.classList].find((c) => c.startsWith("color-")) : null,
					adminFill: admin ? getComputedStyle(admin.querySelector(".bar")).fill : null,
					plainFill: plain ? getComputedStyle(plain.querySelector(".bar")).fill : null,
				};
			});
			expect(g.adminClass, "the fixture seeded a colour-classed gantt bar");
			// The admin bar keeps ITS colour, distinct from the bar we paint.
			expect(g.adminFill !== g.plainFill, `the admin bar keeps its own fill (${g.adminFill}), not ours (${g.plainFill})`);
		});

		await test("views: the calendar chrome follows the theme", async () => {
			// FullCalendar's 30 --fc-* vars are re-pointed on .fc, AND Frappe's
			// own calendar.scss !important border rule (reading --gray-300) is
			// beaten by re-pointing THAT var, scoped to .fc (probe A). Fails
			// against stock: --fc-border-color is #ddd and the td keeps it.
			setSettings({ views_style: "Floating Cards" });
			await goDesk("/app/todo/view/calendar", ".fc", 6000);
			const g = await page.evaluate(() => {
				const fc = document.querySelector(".fc");
				const td = document.querySelector(".fc-theme-standard td");
				const our = getComputedStyle(document.documentElement).getPropertyValue("--bnd-border").trim();
				return {
					fcBorder: getComputedStyle(fc).getPropertyValue("--fc-border-color").trim().toLowerCase(),
					tdBorder: td ? getComputedStyle(td).borderTopColor : null,
					ourBorder: our.toLowerCase(),
				};
			});
			expect(g.fcBorder !== "#ddd", `--fc-border-color is re-pointed, not stock #ddd (got ${g.fcBorder})`);
			// The !important td border resolves to our value, not stock's grey.
			expect(g.tdBorder && g.tdBorder !== "rgb(221, 221, 221)", `the !important td border took our token (got ${g.tdBorder})`);
		});

		await test("views: the gallery tile has a boundary or a fill", async () => {
			// The tile is stock transparent with a 0px border (measured). Under
			// the anchor it takes the object fill and boundary — fails against
			// stock, which has neither.
			setSettings({ views_style: "Floating Cards" });
			await goDesk("/app/item/view/image", ".image-view-container", 6000);
			const g = await page.evaluate(() => {
				const tile = document.querySelector(".image-view-item");
				const cs = getComputedStyle(tile);
				return { bg: cs.backgroundColor, borderW: cs.borderTopWidth, borderC: cs.borderTopColor };
			});
			const transparent = g.bg === "rgba(0, 0, 0, 0)" || g.bg === "transparent";
			const noBorder = g.borderW === "0px" || g.borderC === "rgba(0, 0, 0, 0)";
			expect(!transparent || !noBorder, `the tile has a fill or a boundary (bg ${g.bg}, border ${g.borderW} ${g.borderC})`);
		});

		await test("views: live preview flips the style and back", async () => {
			// The mandatory hook (bunood.views_apply), the item-25/26 "escapee"
			// that must never recur. Yields after each mutation — a same-tick
			// getComputedStyle is stale in this headless browser (probe B).
			setSettings({ views_style: "Floating Cards" });
			await goDesk(VIEWS_KANBAN, ".kanban-column", 5000);
			const flip = await page.evaluate(async () => {
				const anchor = () => document.documentElement.getAttribute("data-bnd-views");
				window.bunood_theme.views_apply({ views_style: "Hairline" });
				await new Promise((r) => setTimeout(r, 350));
				const mid = anchor();
				window.bunood_theme.views_apply({ views_style: "Floating Cards" });
				await new Promise((r) => setTimeout(r, 350));
				return { mid, back: anchor() };
			});
			expectEq(flip.mid, "hairline", "live preview flips the anchor to hairline");
			expectEq(flip.back, "cards", "and back to cards");
		});

		// ── The composing axes (slice 3a) ──────────────────────────────────
		await test("views: Plain nulls the kanban column tint, Tinted keeps it", async () => {
			// Frappe tints the column with an inline background-color:
			// var(--bg-{indicator}); Tinted (default) keeps it, Plain nulls it by
			// re-pointing the var (the only way to beat an inline colour without
			// !important). Fails against stock: the column is always tinted.
			setSettings({ views_style: "Floating Cards", views_band: "Plain" });
			await goDesk(VIEWS_KANBAN, ".kanban-column", 5000);
			const plain = await page.evaluate(() => {
				const col = document.querySelector(".kanban-column:not(.add-new-column)");
				return { band: document.documentElement.getAttribute("data-bnd-views-band"), bg: getComputedStyle(col).backgroundColor };
			});
			expectEq(plain.band, "plain", "Plain sets the band attribute");
			expect(plain.bg === "rgba(0, 0, 0, 0)" || plain.bg === "transparent", `Plain nulls the column tint (got ${plain.bg})`);
			setSettings({ views_band: "Tinted" });
			await goDesk(VIEWS_KANBAN, ".kanban-column", 5000);
			const tinted = await page.evaluate(() => {
				const col = document.querySelector(".kanban-column:not(.add-new-column)");
				return { band: document.documentElement.getAttribute("data-bnd-views-band"), bg: getComputedStyle(col).backgroundColor };
			});
			expectEq(tinted.band, null, "Tinted is the neutral — no attribute, the stock tint stays");
			expect(tinted.bg !== "rgba(0, 0, 0, 0)", `Tinted keeps a real column fill (got ${tinted.bg})`);
		});

		await test("views: Contain changes the gallery image fit", async () => {
			// Frappe sets object-fit: cover (image_view.scss:148); Contain shows
			// the whole image. Fails against stock, which is always cover.
			setSettings({ views_style: "Floating Cards", views_media: "Contain" });
			await goDesk("/app/item/view/image", ".image-view-container", 6000);
			const fit = await page.evaluate(() => {
				const img = document.querySelector(".image-view-item .image-view-body img");
				return img ? getComputedStyle(img).objectFit : "no-img";
			});
			expectEq(fit, "contain", "Contain sets object-fit: contain on the tile image");
		});

		await test("views: the gallery controls reveal on hover", async () => {
			// reveal on: the tile header (checkbox + like) rests hidden and
			// appears on hover / :focus-within, stood down on touch. opacity,
			// never display, so it keeps its tab-order place. Fails against stock:
			// the header is always opacity 1.
			setSettings({ views_style: "Floating Cards", views_reveal: 1 });
			await goDesk("/app/item/view/image", ".image-view-container", 6000);
			const atRest = await page.evaluate(() => {
				const h = document.querySelector(".image-view-item .image-view-header");
				return h ? getComputedStyle(h).opacity : null;
			});
			expectEq(atRest, "0", "the tile controls rest hidden with reveal on");
			// Hover the second tile (imaged) and confirm the header comes forward.
			const pt = await page.evaluate(() => {
				const it = [...document.querySelectorAll(".image-view-item")][1];
				it.setAttribute("data-probe", "1");
				const r = it.getBoundingClientRect();
				return { x: r.x + r.width / 2, y: r.y + 24 };
			});
			await page.mouse.move(pt.x, pt.y);
			await page.waitForTimeout(400);
			const onHover = await page.evaluate(() => {
				const h = document.querySelector("[data-probe] .image-view-header");
				return h ? getComputedStyle(h).opacity : null;
			});
			expectEq(onHover, "1", "hover reveals the tile controls");
		});

		// ── The calendar colour wrap and the mark axis (slice 3b) ──────────
		await test("views: calendar events take theme colours, admin colours survive", async () => {
			// A FullCalendar event's fill is inline JS colour (prepare_colors) —
			// item 25's chart problem. The wrap re-hues a DEFAULT event (stock
			// "blue") to our --bnd-accent and KEEPS a category or admin colour.
			// Fails against stock: every default event is #edf6fd-ish blue.
			setSettings({ views_style: "Floating Cards", views_mark: "Chip" });
			await goDesk("/app/todo/view/calendar", ".fc-daygrid-block-event", 6000);
			const g = await page.evaluate(() => {
				const accent = getComputedStyle(document.documentElement).getPropertyValue("--bnd-accent").trim();
				// accent hex -> "r, g, b"
				const h = accent.replace("#", "");
				const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
				const evs = [...document.querySelectorAll(".fc-daygrid-block-event")];
				const bgs = evs.map((e) => getComputedStyle(e).backgroundColor);
				return {
					rgb,
					anyAccent: bgs.some((b) => b.includes(rgb)),
					anyOther: bgs.some((b) => b !== "rgba(0, 0, 0, 0)" && !b.includes(rgb)),
					count: evs.length,
				};
			});
			expect(g.count > 0, "the calendar rendered events");
			expect(g.anyAccent, `a default event took the accent wash (${g.rgb})`);
			expect(g.anyOther, "an admin-coloured event kept its own colour (not re-hued to accent)");
		});

		await test("views: the mark reshapes the calendar event", async () => {
			// Dot: the wrap makes the event transparent and CSS adds a dot in the
			// hue; Outlined: transparent with a coloured border. Both fail against
			// stock, whose events are always filled blocks.
			setSettings({ views_style: "Floating Cards", views_mark: "Dot" });
			await goDesk("/app/todo/view/calendar", ".fc-daygrid-block-event", 6000);
			const dot = await page.evaluate(() => {
				const ev = document.querySelector(".fc-daygrid-block-event");
				const main = ev.querySelector(".fc-event-main");
				return {
					attr: document.documentElement.getAttribute("data-bnd-views-mark"),
					bg: getComputedStyle(ev).backgroundColor,
					dot: main ? getComputedStyle(main, "::before").width : null,
				};
			});
			expectEq(dot.attr, "dot", "Dot sets the mark attribute");
			expectEq(dot.bg, "rgba(0, 0, 0, 0)", "a Dot event is transparent");
			expect(dot.dot && dot.dot !== "auto" && dot.dot !== "0px", `the dot ::before is rendered (width ${dot.dot})`);

			setSettings({ views_mark: "Outlined" });
			await goDesk("/app/todo/view/calendar", ".fc-daygrid-block-event", 6000);
			const outlined = await page.evaluate(() => {
				const ev = document.querySelector(".fc-daygrid-block-event");
				return { bg: getComputedStyle(ev).backgroundColor, border: getComputedStyle(ev).borderInlineStartColor };
			});
			expectEq(outlined.bg, "rgba(0, 0, 0, 0)", "an Outlined event is transparent");
			expect(outlined.border !== "rgba(0, 0, 0, 0)", `an Outlined event has a coloured border (${outlined.border})`);
		});

		await test("views: a theme flip repaints the calendar events", async () => {
			// frappe.ui.color_map is snapshotted once at bundle parse, so without
			// the observer a flip would leave events on light-mode hexes. The wrap's
			// MutationObserver recomputes and refetches. Read a default event's fill
			// before and after a data-theme flip; it must change (accent moves
			// #4463f0 -> #516ef1 in dark).
			setSettings({ views_style: "Floating Cards", views_mark: "Chip" });
			await goDesk("/app/todo/view/calendar", ".fc-daygrid-block-event", 6000);
			const flip = await page.evaluate(async () => {
				const bg = () => {
					const evs = [...document.querySelectorAll(".fc-daygrid-block-event")];
					// pick a default (accent) event: the most common bg
					const counts = {};
					for (const e of evs) { const b = getComputedStyle(e).backgroundColor; counts[b] = (counts[b] || 0) + 1; }
					return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
				};
				const before = bg();
				document.documentElement.setAttribute("data-theme", "dark");
				await new Promise((r) => setTimeout(r, 1200)); // rAF + refetchEvents
				const after = bg();
				document.documentElement.removeAttribute("data-theme");
				return { before, after };
			});
			expect(flip.before !== flip.after, `the events re-coloured on the flip (${flip.before} -> ${flip.after})`);
		});

		await test("views: a discarded live preview reverts to the saved state", async () => {
			// The escapee test (slice 4, now that theme_settings.js's refresh batch
			// calls bnd_views_preview): a previewed-then-discarded change must
			// revert, not stick. bnd_views_preview was wired into the render AND
			// the discard/import batches — the item-25/26 escapee that must never
			// recur. Preview Original on the settings page, then cur_frm.refresh
			// re-applies every kit's SAVED values.
			setSettings({ views_style: "Floating Cards" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			await page.evaluate(() => window.bunood_theme.views_apply({ views_style: "Original" }));
			await page.waitForTimeout(300);
			expectEq(await page.evaluate(() => document.documentElement.getAttribute("data-bnd-views")), null, "the preview cleared the views anchor");
			await page.evaluate(() => cur_frm.refresh());
			await page.waitForTimeout(700);
			expectEq(await page.evaluate(() => document.documentElement.getAttribute("data-bnd-views")), "cards", "the refresh/discard revert restored the saved Floating Cards");
		});

		// ── Overlays (item 28), slice 1: the CONTRACT set ──────────────────
		//
		// These are REPAIRS, not styles, so every rule they check is scoped
		// html[data-theme] and lives OUTSIDE the kit anchor — a contract
		// survives Original, a style does not (GUIDELINES 1.3; the _list
		// density / _report focus-ring / _views focus-ring precedents).
		// Nothing here reads a data-bnd-overlay attribute, on purpose.
		//
		// An overlay has NO ROUTE — it exists only after a gesture. So every
		// check below DRIVES the overlay and reads a computed value off the
		// rendered node. A test that asserted a rule had compiled would pass
		// while every dialog on the desk stayed broken.
		const ovLum = (rgb) => {
			const p = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
			return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
		};
		const ovRatio = (a, b) => { const x = ovLum(a), y = ovLum(b); const [h, l] = x > y ? [x, y] : [y, x]; return (h + 0.05) / (l + 0.05); };

		await test("overlay: a dark dialog takes the theme's border and control tokens", async () => {
			// THE CENTRAL REPAIR. desk/dark.scss:189 emits
			//   [data-theme="dark"] .modal, [data-theme="dark"] .form-in-grid
			//     { --control-bg: var(--gray-800); --border-color: var(--gray-800) }
			// at (0,2,0), which BEATS our bridge's html[data-theme="dark"] (0,1,1).
			// Measured in stock: the header rule resolves #232323 on a #16241F
			// surface = 1.02:1 — no visible line — and every control inside the
			// dialog loses its fill delta. That is item 22's "identifiable at rest"
			// contract failing inside every dialog on the desk, in dark, today.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				document.documentElement.setAttribute("data-theme", "dark");
				const d = new frappe.ui.Dialog({ title: "Contract probe", fields: [{ fieldtype: "Data", label: "A" }] });
				d.show();
				await new Promise((r) => setTimeout(r, 700));
				const modal = document.querySelector(".modal.show");
				const head = modal && modal.querySelector(".modal-header");
				const input = modal && modal.querySelector("input.form-control");
				const content = modal && modal.querySelector(".modal-content");
				const html = getComputedStyle(document.documentElement);
				const out = {
					borderOnModal: modal ? getComputedStyle(modal).getPropertyValue("--border-color").trim() : null,
					controlOnModal: modal ? getComputedStyle(modal).getPropertyValue("--control-bg").trim() : null,
					borderOnHtml: html.getPropertyValue("--border-color").trim(),
					controlOnHtml: html.getPropertyValue("--control-bg").trim(),
					headLine: head ? getComputedStyle(head).borderBottomColor : null,
					inputBg: input ? getComputedStyle(input).backgroundColor : null,
					surface: content ? getComputedStyle(content).backgroundColor : null,
				};
				try { window.jQuery(modal).modal("hide"); } catch (e) { /* the probe must not die on teardown */ }
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expectEq(g.borderOnModal, g.borderOnHtml, "the dialog's --border-color equals the theme's, not Frappe's grey");
			expectEq(g.controlOnModal, g.controlOnHtml, "the dialog's --control-bg equals the theme's, not Frappe's grey");
			const line = ovRatio(g.headLine, g.surface);
			expect(line > 1.15, `the dialog header draws a VISIBLE line in dark (${line.toFixed(2)}:1, stock is 1.02; line ${g.headLine} on ${g.surface})`);
			expect(g.inputBg !== g.headLine, `the control fill is not the same Frappe grey as the line (${g.inputBg})`);
		});

		await test("overlay: the grid-row editor takes them too", async () => {
			// THE OTHER HALF of dark.scss:189. `.form-in-grid` is a dialog in all
			// but name — common/grid.scss:533 makes it position:fixed, z-index 1021,
			// 80% wide, with its own #freeze.grid-form backdrop at 1020. Fixing only
			// `.modal` ships a dialog-shaped surface that is still Frappe grey.
			//
			// SCOPED TO `.grid-row-open` DELIBERATELY: there is one .form-in-grid
			// PER GRID ROW and a bare querySelector returns a CLOSED one. That trap
			// fired during the slice-0 probe and produced an inconsistent reading —
			// "selecting by class measures the wrong element", live, on the very
			// rule this kit exists to fix.
			await goDesk("/app/contact/new", ".form-layout", 6000);
			const g = await page.evaluate(async () => {
				document.documentElement.setAttribute("data-theme", "dark");
				const add = [...document.querySelectorAll(".grid-add-row")].find((b) => b.offsetParent !== null);
				if (!add) return { error: "no visible .grid-add-row" };
				add.click();
				await new Promise((r) => setTimeout(r, 800));
				const open = [...document.querySelectorAll(".grid-body .grid-row .btn-open-row")].find((b) => b.offsetParent !== null);
				if (!open) return { error: "no visible .btn-open-row" };
				open.click();
				await new Promise((r) => setTimeout(r, 900));
				const el = document.querySelector(".grid-row-open .form-in-grid");
				if (!el) return { error: "no OPEN .form-in-grid" };
				const html = getComputedStyle(document.documentElement);
				const out = {
					border: getComputedStyle(el).getPropertyValue("--border-color").trim(),
					control: getComputedStyle(el).getPropertyValue("--control-bg").trim(),
					borderOnHtml: html.getPropertyValue("--border-color").trim(),
					controlOnHtml: html.getPropertyValue("--control-bg").trim(),
				};
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expect(!g.error, `the grid editor opened (${g.error || ""})`);
			expectEq(g.border, g.borderOnHtml, "the grid editor's --border-color equals the theme's");
			expectEq(g.control, g.controlOnHtml, "the grid editor's --control-bg equals the theme's");
		});

		await test("overlay: the toast clears our own bottom chrome", async () => {
			// Frappe's #alert-container is `position: fixed; bottom: 0; right: 20px;
			// z-index: 2000` on <body> — OUTSIDE .main-section, the only box
			// --bnd-bottom-reserve shrinks. Measured in stock: an 11px overlap of
			// .bnd-statusbar at 1440x900 and 36px full-bleed at 375x812, painting
			// OVER our bar because 2000 > 990. The reserve itself is correct; the
			// toast simply never consults it, so the fix makes it read the reserve.
			//
			// Asserts the overlap is GONE, never its magnitude — two independent
			// probe runs disagreed on the toast's bottom edge by 1px.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				// Clear the container and take the NEWEST toast. These checks fire
				// alerts with a long timeout so they stay up long enough to measure,
				// which means they ACCUMULATE — and a bare querySelector returns the
				// FIRST, i.e. a stale one from an earlier check. Same family as the
				// `.form-in-grid`-per-row trap; it has now bitten twice in this kit.
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				frappe.show_alert({ message: "contract probe", indicator: "green" }, 30);
				await new Promise((r) => setTimeout(r, 900));
				const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
				const bar = document.querySelector('[data-bnd-part="bottombar"]');
				if (!t || !bar) return { error: `toast ${!!t}, bottom bar ${!!bar}` };
				const tr = t.getBoundingClientRect(), br = bar.getBoundingClientRect();
				return {
					toastBottom: Math.round(tr.bottom), barTop: Math.round(br.top),
					gapAboveBar: Math.round(br.top - tr.bottom),
					reserve: getComputedStyle(document.documentElement).getPropertyValue("--bnd-bottom-reserve").trim(),
				};
			});
			expect(!g.error, `a toast and our bottom bar both rendered (${g.error || ""})`);
			expect(g.toastBottom <= g.barTop + 1, `the toast clears the status bar (toast bottom ${g.toastBottom}, bar top ${g.barTop}, reserve ${g.reserve}; stock overlaps by ~11px)`);
			// AND THAT THE RESERVE IS WHAT CLEARS IT. The first version asserted
			// only "no overlap", which still passed with --bnd-bottom-reserve
			// deleted from the rule — the toast just has to sit ABOVE the bar, and
			// a fixed inset does that too. Assert the inset actually consults the
			// reserve, which is the fact the repair is about.
			expect(parseFloat(g.reserve) > 0, `the reserve is non-zero on this layout (${g.reserve})`);
			expect(
				g.gapAboveBar >= parseFloat(g.reserve) - 2,
				`the clearance comes FROM the reserve (gap above the bar ${g.gapAboveBar}px vs reserve ${g.reserve})`
			);
		});

		await test("overlay: the toast's inset is logical, so it mirrors", async () => {
			// Frappe is RTL-correct by a BUILD-TIME rtlcss pass over its own bundle
			// (sites/assets/frappe/dist/css-rtl/); we are RTL-correct by logical
			// properties. THE TWO DO NOT COMPOSE: a rule setting only
			// inset-inline-end lands on the same physical side as the vendor's
			// flipped rule in one direction and the opposite side in the other, and
			// physical and logical declarations do not overwrite each other — so the
			// element ends up pinned on BOTH sides and stretches. The rule therefore
			// sets BOTH logical sides, one to a value and one to `auto`.
			// Measured in stock: #alert-container did not move under dir=rtl at all.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				// SET THE DIRECTION, NEVER ASSUME IT. A first version read whatever
				// the desk happened to be in and asserted "LTR: left > vw/2"; in the
				// full suite it measured left=20 of 1920 and failed, because an
				// earlier check had left the desk in RTL. A test that depends on
				// ambient state it does not control fails for a reason that has
				// nothing to do with what it is checking.
				const hadHtml = document.documentElement.getAttribute("dir");
				const hadBody = document.body.getAttribute("dir");
				const setDir = (v) => {
					document.documentElement.setAttribute("dir", v);
					document.body.setAttribute("dir", v);
				};
				const restore = (el, had) => (had === null ? el.removeAttribute("dir") : el.setAttribute("dir", had));
				const read = async () => {
					// Clear first and take the NEWEST — these alerts have a long
					// timeout so they accumulate, and querySelector returns the first.
					document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
					frappe.show_alert({ message: "rtl probe", indicator: "blue" }, 30);
					await new Promise((r) => setTimeout(r, 800));
					const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
					if (!t) return null;
					const r = t.getBoundingClientRect();
					return { left: Math.round(r.left), width: Math.round(r.width) };
				};
				setDir("ltr");
				await new Promise((r) => setTimeout(r, 200));
				const ltr = await read();
				setDir("rtl");
				await new Promise((r) => setTimeout(r, 400));
				const rtl = await read();
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				restore(document.documentElement, hadHtml);
				restore(document.body, hadBody);
				return { ltr, rtl, vw: window.innerWidth };
			});
			expect(g.ltr && g.rtl, "a toast rendered in both directions");
			expect(g.ltr.left > g.vw / 2, `LTR: the toast sits at the inline end (left ${g.ltr.left} of ${g.vw})`);
			expect(g.rtl.left < g.vw / 2, `RTL: the toast MIRRORS to the other side (left ${g.rtl.left} of ${g.vw}; stock does not move at all)`);
			expect(Math.abs(g.rtl.width - g.ltr.width) <= 2, `RTL: it is not pinned on both sides and stretched (width ${g.ltr.width} -> ${g.rtl.width})`);
		});

		await test("overlay: every status dot clears 3:1 in dark", async () => {
			// desk/dark.scss:264-270 re-points every --indicator-dot-* to the
			// matching --bg-*: the dark WASH a pill is filled with, not an ink.
			// Measured in stock, TEN of the twelve hues fail the 3:1 non-text
			// floor and eight are simply invisible (red 6.31:1 in light becomes
			// 1.02:1 in dark). The repair points the dot back at the same var the
			// light-mode base rule uses, so it resolves to Frappe's own light
			// tints — designed to be read.
			//
			// ALL TWELVE are measured, against all three surfaces a dot can sit
			// on. A check that sampled one colour would have passed in stock:
			// yellow and darkgrey already clear the floor.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(() => {
				const C = ["green", "cyan", "blue", "orange", "yellow", "gray", "grey", "red", "pink", "darkgrey", "purple", "light-blue"];
				const host = document.createElement("div");
				host.style.cssText = "position:fixed;left:-9999px;top:0";
				host.innerHTML = C.map((c) => `<span class="indicator ${c}" data-c="${c}">x</span>`).join("");
				document.body.appendChild(host);
				const swatch = (v) => {
					const d = document.createElement("div");
					d.style.cssText = "position:fixed;left:-9999px;top:0;background:" + v;
					document.body.appendChild(d);
					const x = getComputedStyle(d).backgroundColor;
					d.remove();
					return x;
				};
				document.documentElement.setAttribute("data-theme", "dark");
				const grounds = [swatch("var(--bnd-surface)"), swatch("var(--bnd-raised)"), swatch("var(--bnd-page)")];
				const rows = C.map((c) => ({
					c,
					dot: getComputedStyle(host.querySelector(`[data-c="${c}"]`), "::before").backgroundColor,
					grounds,
				}));
				host.remove();
				document.documentElement.removeAttribute("data-theme");
				return rows;
			});
			expectEq(g.length, 12, "all twelve indicator colours were measured");
			const bad = [];
			for (const row of g) {
				const worst = Math.min(...row.grounds.map((b) => ovRatio(row.dot, b)));
				if (worst < 3) bad.push(`${row.c} ${worst.toFixed(2)}:1 (${row.dot})`);
			}
			expectEq(bad.join(" · "), "", "every status dot clears the 3:1 non-text floor in dark");
		});

		await test("overlay: the context menu takes the theme's surface in dark", async () => {
			// `.frappe-menu` (frappe/ui/menu.js, body-appended) paints
			// `background: var(--surface-modal)` — a token our bridge did not map,
			// so it stayed #232323 in dark against our #16241F surface: a 1.02:1
			// delta, a neutral-grey card floating on a green-tinted desk. The token
			// has exactly TWO readers in the whole desk (desk/menu.scss:13 and
			// desk/sidebar_card.scss:31) and both want a raised surface, so the fix
			// is a bridge mapping rather than a scoped override.
			//
			// The menu is built by JS on four surfaces we already own. What decides
			// its paint is the vendor rule on a node carrying the vendor class, and
			// that is what this measures.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(() => {
				document.documentElement.setAttribute("data-theme", "dark");
				const el = document.createElement("div");
				el.className = "frappe-menu";
				el.style.cssText = "position:fixed;left:-9999px;top:0";
				document.body.appendChild(el);
				const surf = document.createElement("div");
				surf.style.cssText = "position:fixed;left:-9999px;top:0;background:var(--bnd-surface)";
				document.body.appendChild(surf);
				const out = { menu: getComputedStyle(el).backgroundColor, surface: getComputedStyle(surf).backgroundColor };
				el.remove(); surf.remove();
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expectEq(g.menu, g.surface, "the context menu paints the theme's surface, not Frappe's #232323");
		});

		await test("overlay: the tooltip follows the theme in both modes", async () => {
			// Frappe overrides every $popover-* SCSS variable and NO $tooltip-* one,
			// so .tooltip-inner compiles to literal `color:#fff; background:#000` —
			// there is no vendor variable to re-point, and a higher-specificity rule
			// is the only lever. Measured in stock: byte-identical in light and dark.
			// The decided treatment is Contrast (an inverted chip) because a
			// transient tip must read instantly over a form, a chart or a dark
			// lightbox — so this asserts it TRACKS THE MODE and clears AA, not that
			// it is any particular colour.
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const g = await page.evaluate(async () => {
				// The host must be VISIBLE — Bootstrap 4 throws "Please use show on
				// visible elements", which is how the first version of this check
				// died rather than measuring anything.
				const visible = (el) => el && el.offsetParent !== null;
				const read = async (mode) => {
					document.documentElement.setAttribute("data-theme", mode);
					const host = [...document.querySelectorAll("[data-toggle='tooltip']")].find(visible)
						|| [...document.querySelectorAll(".page-head, .list-row, .page-title")].find(visible);
					if (!host) return null;
					window.jQuery(host).tooltip({ title: "probe", trigger: "manual" }).tooltip("show");
					await new Promise((r) => setTimeout(r, 400));
					const tip = document.querySelector(".tooltip-inner");
					const out = tip ? { bg: getComputedStyle(tip).backgroundColor, fg: getComputedStyle(tip).color } : null;
					try { window.jQuery(host).tooltip("hide").tooltip("dispose"); } catch (e) { /* teardown must not fail the probe */ }
					await new Promise((r) => setTimeout(r, 200));
					return out;
				};
				const light = await read("light");
				const dark = await read("dark");
				document.documentElement.removeAttribute("data-theme");
				return { light, dark };
			});
			expect(g.light && g.dark, "a tooltip rendered in both modes");
			expect(g.light.bg !== g.dark.bg, `the tooltip TRACKS the mode (light ${g.light.bg}, dark ${g.dark.bg}; stock is rgb(0, 0, 0) in both)`);
			for (const m of ["light", "dark"]) {
				const r = ovRatio(g[m].fg, g[m].bg);
				expect(r >= 4.5, `the tooltip's own text clears AA in ${m} (${r.toFixed(2)}:1)`);
			}
		});

		await test("overlay: the toast subtitle clears AA on every wash", async () => {
			// .desk-alert .alert-subtitle takes --text-light (desk/toast.scss:68).
			// Measured in stock dark: 4.26:1 on the green wash and 3.23:1 on the
			// blue — both under 4.5. These are Frappe-token-on-Frappe-wash pairs and
			// sit OUTSIDE `npm run contrast`, whose 1,656 pairs cover --bnd-* only,
			// so nothing else in this repo would ever catch them.
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				document.documentElement.setAttribute("data-theme", "dark");
				const out = [];
				for (const ind of ["green", "blue", "red", "orange"]) {
					frappe.show_alert({ message: "probe", subtitle: "a subtitle line", indicator: ind }, 30);
					await new Promise((r) => setTimeout(r, 550));
					const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
					const sub = t && t.querySelector(".alert-subtitle");
					if (sub) out.push({ ind, fg: getComputedStyle(sub).color, bg: getComputedStyle(t).backgroundColor });
				}
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expect(g.length >= 2, `subtitles rendered on at least two washes (got ${g.length})`);
			for (const row of g) {
				const r = ovRatio(row.fg, row.bg);
				expect(r >= 4.5, `the toast subtitle clears AA on the ${row.ind} wash in dark (${r.toFixed(2)}:1; stock blue is 3.23)`);
			}
		});

		await test("overlay: menu shortcut text clears AA in both modes", async () => {
			// `.menu-item-shortcut` takes --ink-gray-4 with a literal #999999
			// fallback, from TWO menu families with one rule shape (desk/menu.scss:54
			// and desk/page.scss:187). Measured in stock: 2.85:1 on the light
			// dropdown and 3.29:1 on the dark one. Also unbridged, so also outside
			// the contrast gate.
			// DRIVES THE REAL MENU. A first version of this check built a bare
			// `.dropdown-menu > .menu-item-shortcut` and PASSED BEFORE THE FIX —
			// the vendor rule needs a `.menu-btn-group` (or `.dropdown-menu-item`)
			// ANCESTOR, so the synthetic node never inherited --ink-gray-4 at all.
			// Green, and measuring nothing. Open the page's own Menu instead.
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const g = await page.evaluate(async () => {
				const btn = document.querySelector(".page-actions .menu-btn-group .btn, .menu-btn-group [data-toggle='dropdown']");
				if (!btn) return { error: "no page Menu button on this route" };
				btn.click();
				await new Promise((r) => setTimeout(r, 500));
				const menu = document.querySelector(".menu-btn-group .dropdown-menu");
				const sc = menu && menu.querySelector(".menu-item-shortcut");
				if (!sc) return { error: "the Menu opened with no shortcut row" };
				const out = {};
				for (const mode of ["light", "dark"]) {
					document.documentElement.setAttribute("data-theme", mode);
					out[mode] = { fg: getComputedStyle(sc).color, bg: getComputedStyle(menu).backgroundColor };
				}
				btn.click();
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expect(!g.error, `the page Menu opened with a shortcut row (${g.error || ""})`);
			for (const m of ["light", "dark"]) {
				const r = ovRatio(g[m].fg, g[m].bg);
				expect(r >= 4.5, `the menu shortcut clears AA in ${m} (${r.toFixed(2)}:1; stock is 2.85 light / 3.29 dark)`);
			}
		});

		await test("overlay: the datepicker's out-of-month days stay distinguishable in dark", async () => {
			// air-datepicker paints `.datepicker--cell-day.-other-month-{color:#dedede}`
			// and `.datepicker--nav-action path{stroke:#9c9c9c}` as literals that
			// never flip. Measured in stock dark: out-of-month days read 11.95:1
			// against the panel while in-month days read 13.73:1 — a separation of
			// 1.15x, so the month boundary the greying exists to draw disappears.
			await goDesk("/app/todo/new", ".form-layout", 5000);
			const g = await page.evaluate(async () => {
				document.documentElement.setAttribute("data-theme", "dark");
				const f = document.querySelector('.frappe-control[data-fieldtype="Date"] input, input[data-fieldtype="Date"]');
				if (!f) return { error: "no Date field on this form" };
				f.focus(); f.click();
				await new Promise((r) => setTimeout(r, 1000));
				const dp = document.querySelector(".datepicker.active") || document.querySelector(".datepicker");
				const other = dp && dp.querySelector(".datepicker--cell-day.-other-month-");
				const inm = dp && [...dp.querySelectorAll(".datepicker--cell-day")].find((c) => !c.classList.contains("-other-month-"));
				const out = other && inm
					? { other: getComputedStyle(other).color, inMonth: getComputedStyle(inm).color, panel: getComputedStyle(dp).backgroundColor }
					: { error: "the datepicker rendered no out-of-month cell" };
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expect(!g.error, `the datepicker opened with cells (${g.error || ""})`);
			const ro = ovRatio(g.other, g.panel), ri = ovRatio(g.inMonth, g.panel);
			const sep = ri > ro ? ri / ro : ro / ri;
			expect(sep >= 1.6, `out-of-month days read clearly quieter than in-month ones in dark (separation ${sep.toFixed(2)}x; stock is 1.15x — other ${g.other}, in-month ${g.inMonth})`);
			expect(ro >= 1.8, `out-of-month days are still readable, not erased (${ro.toFixed(2)}:1)`);
		});

		await test("overlay: the calendar popover is legible with the views kit OFF", async () => {
			// FullCalendar's "+N more" popover reads --fc-page-bg-color and
			// --fc-border-color, which item 27 re-points ONLY inside
			// html[data-bnd-views]. Measured both ways: with the anchor present it
			// inherits #16241F / #2A3B35; with it removed they revert to #fff and
			// #ddd, so the popover renders a WHITE card with a #ddd border at
			// z-index 9999 on a dark desk whenever a user picks Original.
			// A popover nobody can read is whether it WORKS, not how it looks, so
			// the repair is a contract at html[data-theme] .fc and survives the
			// stand-down. Item 27 keeps the calendar grid; item 28 owns the popover.
			setSettings({ views_style: "Original" });
			await goDesk("/app/todo/view/calendar", ".fc", 6000);
			const g = await page.evaluate(() => {
				document.documentElement.setAttribute("data-theme", "dark");
				const fc = document.querySelector(".fc");
				const pop = document.createElement("div");
				pop.className = "fc-popover fc-theme-standard";
				pop.innerHTML = '<div class="fc-popover-header">h</div><div class="fc-popover-body">b</div>';
				fc.appendChild(pop);
				const surf = document.createElement("div");
				surf.style.cssText = "position:fixed;left:-9999px;top:0;background:var(--bnd-surface)";
				document.body.appendChild(surf);
				const out = {
					anchor: document.documentElement.getAttribute("data-bnd-views"),
					bg: getComputedStyle(pop).backgroundColor,
					border: getComputedStyle(pop).borderTopColor,
					surface: getComputedStyle(surf).backgroundColor,
				};
				pop.remove(); surf.remove();
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expectEq(g.anchor, null, "the views anchor really is absent (Original)");
			expectEq(g.bg, g.surface, "the calendar popover takes the theme's surface even under Original");
			expect(g.border !== "rgb(221, 221, 221)", `its border is not FullCalendar's #ddd (${g.border})`);
		});

		// ── Overlays (item 28), slice 2: the ANCHOR ────────────────────────
		//
		// One statement of fill + boundary + radius + elevation, reaching every
		// floating thing on the desk. Split into separate fields the picker
		// would permit "no boundary and no shadow" — a panel you cannot find.
		// Picks: Floating (item-28 wireframe round, 2026-08-18).
		//
		// Each check OPENS the overlay. The repairs (slice 1) are contracts and
		// are deliberately NOT asserted here — they must survive Original, and
		// the first check below proves the stand-down does not take them away.

		/** Open a dialog, read its panel, close it. */
		const ovDialog = async () =>
			page.evaluate(async () => {
				const d = new frappe.ui.Dialog({ title: "Anchor probe", fields: [{ fieldtype: "Data", label: "A" }] });
				d.show();
				await new Promise((r) => setTimeout(r, 700));
				const c = document.querySelector(".modal.show .modal-content");
				const cs = c && getComputedStyle(c);
				const out = cs
					? { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, bg: cs.backgroundColor, borderColor: cs.borderTopColor, borderWidth: cs.borderTopWidth }
					: null;
				try { window.jQuery(document.querySelector(".modal.show")).modal("hide"); } catch (e) { /* teardown */ }
				await new Promise((r) => setTimeout(r, 250));
				return out;
			});

		await test("overlay: Original stands the STYLE down and leaves the repairs", async () => {
			// The stand-down must be total for the style — no attribute survives,
			// and the dialog is back to Frappe's own radius and Bootstrap's
			// literal shadow. But Original must NOT take the slice-1 repairs
			// away: those are scoped html[data-theme], outside this anchor,
			// because overlays are on every page and three of them are measured
			// WCAG AA failures. Both halves are asserted together, because it is
			// the pairing that is the decision.
			setSettings({ overlay_style: "Original" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				document.documentElement.setAttribute("data-theme", "dark");
				const attrs = [...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith("data-bnd-overlay"));
				const d = new frappe.ui.Dialog({ title: "Original probe", fields: [{ fieldtype: "Data", label: "A" }] });
				d.show();
				await new Promise((r) => setTimeout(r, 700));
				const modal = document.querySelector(".modal.show");
				const c = modal.querySelector(".modal-content");
				const out = {
					attrs,
					radius: getComputedStyle(c).borderTopLeftRadius,
					shadow: getComputedStyle(c).boxShadow,
					// the slice-1 contract, which must still hold under Original
					borderVar: getComputedStyle(modal).getPropertyValue("--border-color").trim(),
					htmlBorderVar: getComputedStyle(document.documentElement).getPropertyValue("--border-color").trim(),
				};
				try { window.jQuery(modal).modal("hide"); } catch (e) { /* teardown */ }
				document.documentElement.removeAttribute("data-theme");
				return out;
			});
			expectEq(g.attrs.join(","), "", "no data-bnd-overlay* attribute survives Original");
			expectEq(g.shadow, "rgba(0, 0, 0, 0.1) 0px 5px 10px 0px", "the dialog is back to Bootstrap's own literal shadow");
			expectEq(g.borderVar, g.htmlBorderVar, "the dark-dialog REPAIR survives Original (it is a contract, not a style)");
		});

		await test("overlay: the anchor dresses dialog, menu and toast as one object", async () => {
			// ONE anchor, several vendors: a dialog panel (Bootstrap), a page
			// menu (Bootstrap + Popper) and a toast (Frappe) are the same
			// floating object drawn three ways, so they must agree on radius.
			// Splitting the field would permit a floating dialog beside a square
			// menu — item 16's "floating section beside a naked grid".
			setSettings({ overlay_style: "Floating" });
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const g = await page.evaluate(async () => {
				const out = {};
				const d = new frappe.ui.Dialog({ title: "One hand", fields: [{ fieldtype: "Data", label: "A" }] });
				d.show();
				await new Promise((r) => setTimeout(r, 700));
				const c = document.querySelector(".modal.show .modal-content");
				out.dialog = { radius: getComputedStyle(c).borderTopLeftRadius, shadow: getComputedStyle(c).boxShadow };
				try { window.jQuery(document.querySelector(".modal.show")).modal("hide"); } catch (e) { /* teardown */ }
				await new Promise((r) => setTimeout(r, 350));

				const btn = document.querySelector(".page-actions .menu-btn-group .btn, .menu-btn-group [data-toggle='dropdown']");
				if (btn) {
					btn.click();
					await new Promise((r) => setTimeout(r, 450));
					const m = document.querySelector(".menu-btn-group .dropdown-menu");
					if (m) out.menu = { radius: getComputedStyle(m).borderTopLeftRadius, shadow: getComputedStyle(m).boxShadow };
					btn.click();
				}

				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				frappe.show_alert({ message: "one hand", indicator: "green" }, 30);
				await new Promise((r) => setTimeout(r, 800));
				const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
				if (t) out.toast = { radius: getComputedStyle(t).borderTopLeftRadius, bg: getComputedStyle(t).backgroundColor };
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				return out;
			});
			expect(g.menu, "the page Menu opened");
			expect(g.toast, "a toast rendered");
			expectEq(g.dialog.radius, g.menu.radius, "the dialog and the menu carry the same corner");
			expectEq(g.dialog.radius, g.toast.radius, "the toast carries it too — one object, three vendors");
			expect(g.dialog.shadow !== "none", `the panel is elevated under Floating (${g.dialog.shadow})`);
		});

		await test("overlay: the dialog's shadow beats Bootstrap's literal at every width", async () => {
			// Repair 9, which moved here from the contract set because a shadow is
			// how it LOOKS, not whether it WORKS. `.modal-content` carries the
			// literal twice — a base rule AND one inside @media (min-width: 576px)
			// — reading no variable, while --modal-shadow exists and is read only
			// by the toast. A rule at equal specificity outside the media query
			// would be beaten at desktop widths and win at mobile, producing a
			// shadow that changes at 576px. Ours is (0,3,1), so it wins in both
			// contexts; this measures both sides of that boundary.
			setSettings({ overlay_style: "Floating" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const STOCK = "rgba(0, 0, 0, 0.1) 0px 5px 10px 0px";
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.waitForTimeout(300);
			const wide = await ovDialog();
			await page.setViewportSize({ width: 520, height: 800 });
			await page.waitForTimeout(400);
			const narrow = await ovDialog();
			await page.setViewportSize({ width: 1920, height: 1080 });
			await page.waitForTimeout(300);
			expect(wide && narrow, "a dialog rendered at both widths");
			expect(wide.shadow !== STOCK, `above 576 the shadow is ours, not Bootstrap's literal (${wide.shadow})`);
			expect(narrow.shadow !== "none", `below 576 the shadow is still ours (${narrow.shadow})`);
			expectEq(wide.shadow, narrow.shadow, "and it does not change across the 576px boundary");
		});

		await test("overlay: the styles are honestly different from each other", async () => {
			// The "two options, one pixel" guard. Hairline is boundary-only with no
			// elevation; Floating is lifted clear. If a user cannot tell them apart
			// on the same dialog, the axis should not have both.
			setSettings({ overlay_style: "Hairline" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const hairline = await ovDialog();
			setSettings({ overlay_style: "Floating" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const floating = await ovDialog();
			expect(hairline && floating, "a dialog rendered under both styles");
			expect(hairline.radius !== floating.radius, `the corner differs (${hairline.radius} vs ${floating.radius})`);
			expect(hairline.shadow !== floating.shadow, `the elevation differs (${hairline.shadow} vs ${floating.shadow})`);
		});

		await test("overlay: the anchor never repaints a toast's semantic colour", async () => {
			// A toast's fill is its STATUS — .desk-alert.green re-points --toast-bg
			// to --alert-bg-success. The anchor owns shape and elevation, never
			// that hue: painting every toast the panel surface would delete the
			// one thing the colour is for. Item 25's law for admin/semantic data,
			// transposed. Measured against a neutral panel of the same style.
			setSettings({ overlay_style: "Floating" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				const out = {};
				const surf = document.createElement("div");
				surf.style.cssText = "position:fixed;left:-9999px;top:0;background:var(--bnd-surface)";
				document.body.appendChild(surf);
				out.surface = getComputedStyle(surf).backgroundColor;
				surf.remove();
				for (const ind of ["green", "red"]) {
					document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
					frappe.show_alert({ message: "hue", indicator: ind }, 30);
					await new Promise((r) => setTimeout(r, 700));
					const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
					if (t) {
						out[ind] = getComputedStyle(t).backgroundColor;
						out.radius = getComputedStyle(t).borderTopLeftRadius;
					}
				}
				const probe = document.createElement("div");
				probe.style.cssText = "position:fixed;left:-9999px;top:0;border-radius:var(--bnd-ov-radius)";
				document.body.appendChild(probe);
				out.panelRadius = getComputedStyle(probe).borderTopLeftRadius;
				probe.remove();
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				return out;
			});
			expect(g.green && g.red, "both toasts rendered");
			// ANCHORED TO THE KIT. The three hue assertions below all hold on STOCK
			// — measured with the whole bunood sheet disabled — so on their own this
			// check could never fail. Asserting the toast also carries the anchor's
			// corner ties it to something only the kit produces, which makes the
			// hue clauses a real guard rather than a description of Frappe.
			expect(parseFloat(g.radius) > 0 && g.radius === g.panelRadius,
				`the toast carries the anchor's corner (${g.radius} vs panel ${g.panelRadius})`);
			expect(g.green !== g.surface, `the success toast keeps its own wash, not the panel surface (${g.green})`);
			expect(g.green !== g.red, `and the two statuses are still distinguishable (${g.green} vs ${g.red})`);
		});

		await test("overlay: the kit live-previews without a reload", async () => {
			// The mandatory apply hook. Every container and kit must re-apply on
			// click — the status kit's missing-hook failure, and the item-25/26
			// "escapee" where a field was dropped from live preview and export
			// while every test stayed green by driving the apply function
			// directly. This drives the HOOK, the way the settings form does.
			setSettings({ overlay_style: "Floating" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const before = await page.evaluate(() => document.documentElement.getAttribute("data-bnd-overlay"));
			await page.evaluate(() => window.bunood_theme.overlay_apply({ overlay_style: "Hairline" }));
			await page.waitForTimeout(250);
			const after = await page.evaluate(() => document.documentElement.getAttribute("data-bnd-overlay"));
			await page.evaluate(() => window.bunood_theme.overlay_apply({ overlay_style: "Original" }));
			await page.waitForTimeout(250);
			const cleared = await page.evaluate(() => [...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith("data-bnd-overlay")));
			expectEq(before, "floating", "the saved Floating is on <html> at boot");
			expectEq(after, "hairline", "the hook applied Hairline live");
			expectEq(cleared.join(","), "", "and Original clears the anchor and every sibling");
		});

		// ── Overlays (item 28), slice 3: the composing axes ────────────────
		//
		// Two axes over the anchor: the dialog scrim and the menu row. Both are
		// STYLES — they only exist while the anchor does, and Original clears
		// them along with it (asserted by the live-preview check above).

		/** Open a dialog and read its backdrop, then close. */
		const ovBackdrop = async () =>
			page.evaluate(async () => {
				const d = new frappe.ui.Dialog({ title: "Scrim probe", fields: [{ fieldtype: "Data", label: "A" }] });
				d.show();
				await new Promise((r) => setTimeout(r, 750));
				const b = document.querySelector(".modal-backdrop.show");
				const cs = b && getComputedStyle(b);
				const out = cs ? { bg: cs.backgroundColor, opacity: cs.opacity, filter: cs.backdropFilter || cs.webkitBackdropFilter || "none" } : null;
				try { window.jQuery(document.querySelector(".modal.show")).modal("hide"); } catch (e) { /* teardown */ }
				await new Promise((r) => setTimeout(r, 300));
				return out;
			});

		await test("overlay: the scrim is ours, and its alpha lives in ONE place", async () => {
			// Stock is `.modal-backdrop{background-color:var(--gray-800)}` at
			// opacity .8 — a Frappe ramp step the bridge does not map, so it is
			// #383838 / #232323 whatever the palette. Tinted replaces it.
			//
			// THE MULTIPLY TRAP is the real assertion. The vendor carries the
			// alpha in `opacity` while our token carries it in the colour; left
			// alone the two multiply (0.62 x 0.8 = 0.50) and the scrim comes out
			// weaker than either value claims. So opacity must read exactly 1 and
			// the colour must carry the alpha.
			setSettings({ overlay_style: "Floating", overlay_scrim: "Dim" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const dim = await ovBackdrop();
			setSettings({ overlay_scrim: "Tinted" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const tinted = await ovBackdrop();
			expect(dim && tinted, "a backdrop rendered under both settings");
			expect(dim.bg !== tinted.bg, `Tinted is not stock's grey wash (${dim.bg} -> ${tinted.bg})`);
			expectEq(tinted.opacity, "1", "the alpha is in the colour, not multiplied by opacity");
			const alpha = Number((tinted.bg.match(/[\d.]+\s*\)$/) || ["1)"])[0].replace(")", ""));
			expect(alpha > 0.4 && alpha < 0.85, `and the colour carries a real scrim alpha (${alpha})`);
		});

		await test("overlay: the scrim reaches the blocking overlay too", async () => {
			// Three scrims exist on the desk — the modal backdrop, #freeze (the
			// blocking overlay, .main-section > #body) and the grid editor's
			// #freeze.grid-form. One axis governs all three, because three scrims
			// free to disagree is three chances to disagree.
			setSettings({ overlay_style: "Floating", overlay_scrim: "Tinted" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const g = await page.evaluate(async () => {
				frappe.dom.freeze("probe");
				await new Promise((r) => setTimeout(r, 600));
				const f = document.querySelector("#freeze");
				const out = f ? { bg: getComputedStyle(f).backgroundColor, opacity: getComputedStyle(f).opacity, cls: f.className } : null;
				frappe.dom.unfreeze();
				return out;
			});
			expect(g, "the freeze overlay rendered");
			expectEq(g.opacity, "1", "the freeze scrim's alpha is in its colour too");
			expect(!/^rgb\(/.test(g.bg), `and it is a translucent wash, not an opaque fill (${g.bg})`);
		});

		await test("overlay: the freeze scrim is not covered by its own message sheet", async () => {
			// THE CHECK ABOVE PASSES WHILE THE SCRIM IS INVISIBLE, and that is the
			// defect. Stock nests a full-bleed OPAQUE sheet inside the backdrop —
			// `#freeze .freeze-message-container{inset:0;background:var(--bg-light-gray)}`
			// (desk/global.scss:517-527) — so the tint paints correctly and is then
			// covered by its own child. Measured 2026-08-19: scrim rgba(16,26,22,.62)
			// under an opaque rgb(243,243,243) at 1440x900, which means Dim, Tinted and
			// Blurred rendered IDENTICALLY on every document save. The axis was inert on
			// the one overlay this block singles out as "the blocking one".
			//
			// The freeze is HELD across the read: it is refcounted and removes itself at
			// zero, so a probe that unfreezes first measures nothing and null-passes.
			setSettings({ overlay_style: "Floating", overlay_scrim: "Tinted" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const read = () =>
				page.evaluate(async () => {
					frappe.dom.freeze("probe message");
					await new Promise((r) => setTimeout(r, 600));
					const f = document.querySelector("#freeze");
					const box = f && f.querySelector(".freeze-message-container");
					const lead = f && f.querySelector("p.lead");
					const out =
						f && box
							? {
									scrimBg: getComputedStyle(f).backgroundColor,
									boxBg: getComputedStyle(box).backgroundColor,
									boxW: Math.round(box.getBoundingClientRect().width),
									boxH: Math.round(box.getBoundingClientRect().height),
									vpW: window.innerWidth,
									vpH: window.innerHeight,
									leadBg: lead ? getComputedStyle(lead).backgroundColor : null,
									leadText: lead ? lead.textContent.trim() : null,
							  }
							: null;
					frappe.dom.unfreeze();
					return out;
				});

			const g = await read();
			expect(g, "the freeze overlay and its message container rendered");
			// The box must STILL fill the viewport — it is the click target and the
			// centring grid. The repair releases its PAINT, never its geometry.
			expect(g.boxW >= g.vpW - 2 && g.boxH >= g.vpH - 2,
				`the message container still covers the viewport (${g.boxW}x${g.boxH} of ${g.vpW}x${g.vpH})`);
			expect(/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(g.boxBg),
				`and it no longer paints over the scrim (${g.boxBg})`);
			// "Transparent" must not be reachable by hiding everything: the message
			// keeps its text and gains its own ground, so it is legible ON the scrim.
			expect(g.leadText && g.leadText.length > 0, `the message still renders (${JSON.stringify(g.leadText)})`);
			expect(!/^rgba\(0, 0, 0, 0\)$/.test(g.leadBg), `and carries its own ground (${g.leadBg})`);

			// Scoped to the axis, not a global restyle of stock: with the kit off the
			// vendor's own sheet comes back untouched.
			setSettings({ overlay_style: "Original", overlay_scrim: "Tinted" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const o = await read();
			expect(o, "the freeze overlay rendered under Original too");
			expect(/^rgb\(/.test(o.boxBg), `Original leaves stock's opaque sheet alone (${o.boxBg})`);
		});


		await test("overlay: Blurred blurs, and is guarded", async () => {
			// The blur is progressive enhancement — shadcn guards every one of its
			// own with supports-backdrop-filter:, and a full-viewport
			// backdrop-filter over the desk's DOM is the most expensive rule this
			// kit could ship. Without support the tint has already landed, so
			// Blurred degrades to a wash rather than to nothing.
			setSettings({ overlay_style: "Floating", overlay_scrim: "Blurred" });
			await goDesk("/app/todo", ".list-row, .no-result", 3000);
			const b = await ovBackdrop();
			expect(b, "a backdrop rendered");
			expect(/blur/.test(b.filter), `the scrim blurs where supported (${b.filter})`);
			expect(!/^rgba\(0, 0, 0, 0\)/.test(b.bg), `and still carries a tint underneath it (${b.bg})`);
		});

		await test("overlay: the menu rows agree, and Plain squares them", async () => {
			// Stock's hover fill runs edge to edge and squares off against a
			// rounded popup — worst exactly where the anchor's radius is largest.
			// Inset pads the popup and rounds the row inside it. Measured on the
			// page's own Menu, not a synthetic node: the vendor rule needs a
			// .menu-btn-group ancestor, which is how the slice-1 shortcut check
			// managed to pass while measuring nothing.
			const readMenu = async () =>
				page.evaluate(async () => {
					const btn = document.querySelector(".page-actions .menu-btn-group .btn, .menu-btn-group [data-toggle='dropdown']");
					if (!btn) return { error: "no page Menu button" };
					btn.click();
					await new Promise((r) => setTimeout(r, 450));
					const m = document.querySelector(".menu-btn-group .dropdown-menu");
					const row = m && m.querySelector(".dropdown-item");
					const out = m && row
						? { pad: getComputedStyle(m).paddingInlineStart, rowRadius: getComputedStyle(row).borderTopLeftRadius }
						: { error: "menu opened with no row" };
					btn.click();
					await new Promise((r) => setTimeout(r, 200));
					return out;
				});
			setSettings({ overlay_style: "Floating", overlay_menu: "Plain" });
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const plain = await readMenu();
			setSettings({ overlay_menu: "Inset" });
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const inset = await readMenu();
			expect(!plain.error && !inset.error, `the Menu opened under both settings (${plain.error || inset.error || ""})`);
			// MEASUREMENT REVERSED THIS CHECK'S POLARITY. Stock already rounds the
			// Bootstrap row (8px) inside a 4px-padded popup while leaving its own
			// .frappe-menu row square — so "Inset rounds the row" was a no-op here
			// and a real change there, an axis that differs on some menus and not
			// others. The anchor now unifies every row's corner, and this axis
			// offers the honest alternative: Plain SQUARES them, edge to edge.
			expect(parseFloat(inset.rowRadius) > 0, `Inset leaves a real corner on the row (${inset.rowRadius})`);
			expectEq(plain.rowRadius, "0px", "Plain squares it off");
			expect(parseFloat(plain.pad) < parseFloat(inset.pad), `and takes the popup's inline inset out (${inset.pad} -> ${plain.pad})`);
		});

		// ── Overlays: checks the release review said were missing ──────────
		//
		// Every one of these exists because the adversarial pass found a rule
		// with no check behind it, or a check that could not fail.

		await test("overlay: every style gives a panel a findable edge", async () => {
			// THE DEFECT THIS EXISTS FOR. The popup rule set `border-color`
			// without `border-style`/`border-width`, and FOUR of its seven
			// targets ship with no border box at all — `.frappe-menu`,
			// `.popover`, `.duration-picker`, `.dt-dropdown__list`. On those,
			// Hairline painted nothing and removed the vendor's shadow too, so
			// the panel had no boundary AND no elevation: measured 1.07:1 fill
			// against the ground behind it, strictly worse than stock.
			//
			// The old checks all measured the DIALOG or the Bootstrap dropdown,
			// both of which carry a native 1px border — which is exactly why
			// they stayed green. This one measures a borderless vendor.
			for (const style of ["Hairline", "Soft", "Floating", "Solid"]) {
				setSettings({ overlay_style: style });
				await goDesk("/app/todo", ".list-row, .no-result", 3000);
				const g = await page.evaluate(() => {
					document.documentElement.setAttribute("data-theme", "dark");
					const el = document.createElement("div");
					el.className = "frappe-menu";
					el.style.cssText = "position:fixed;left:-9999px;top:0";
					document.body.appendChild(el);
					const cs = getComputedStyle(el);
					const out = {
						width: cs.borderTopWidth, style: cs.borderTopStyle,
						colour: cs.borderTopColor, shadow: cs.boxShadow,
					};
					el.remove();
					document.documentElement.removeAttribute("data-theme");
					return out;
				});
				const hasBorder = parseFloat(g.width) > 0 && g.style !== "none";
				const hasShadow = g.shadow && g.shadow !== "none";
				expect(hasBorder || hasShadow,
					`${style}: a borderless vendor panel still gets a boundary or an elevation ` +
					`(border ${g.width} ${g.style}, shadow ${g.shadow})`);
			}
		});

		await test("overlay: the toast clears the bar on a phone too", async () => {
			// The mobile branch carries the WORST measured stock defect — 36px of
			// overlap across a full-bleed strip, covering the bar's inline-end
			// control — and no check executed it. `@include bnd-until(md)` never
			// fires at the suite's 1920 default, so the rule shipped unmeasured.
			setSettings({ overlay_style: "Floating" });
			await page.setViewportSize({ width: 390, height: 844 });
			await goDesk("/app/todo", ".list-row, .no-result", 4000);
			const g = await page.evaluate(async () => {
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				frappe.show_alert({ message: "phone probe", indicator: "green" }, 30);
				await new Promise((r) => setTimeout(r, 900));
				const t = [...document.querySelectorAll("#alert-container .desk-alert")].pop();
				const bar = document.querySelector('[data-bnd-part="bottombar"]');
				if (!t || !bar) return { error: `toast ${!!t}, bar ${!!bar}` };
				const tr = t.getBoundingClientRect(), br = bar.getBoundingClientRect();
				const out = {
					toastBottom: Math.round(tr.bottom), barTop: Math.round(br.top),
					width: Math.round(tr.width), vw: window.innerWidth,
					reserve: getComputedStyle(document.documentElement).getPropertyValue("--bnd-bottom-reserve").trim(),
				};
				document.querySelectorAll("#alert-container .desk-alert").forEach((n) => n.remove());
				return out;
			});
			await page.setViewportSize({ width: 1920, height: 1080 });
			expect(!g.error, `a toast and the phone bar both rendered (${g.error || ""})`);
			expect(g.toastBottom <= g.barTop + 1,
				`the phone toast clears the bar (bottom ${g.toastBottom}, bar top ${g.barTop}, reserve ${g.reserve}; stock overlaps by ~36px)`);
			expect(g.width >= g.vw - 2, `and it is still the full-bleed strip the vendor intends (${g.width} of ${g.vw})`);
		});

		await test("overlay: a discarded live preview reverts to the saved state", async () => {
			// The item-25/26 "escapee": a field dropped from the preview or the
			// revert path stays green while live preview and export silently lose
			// it. Item 27 carries this check; item 28 shipped without one.
			// Drives the HOOK the settings form drives, not the apply function.
			setSettings({ overlay_style: "Floating", overlay_scrim: "Tinted", overlay_menu: "Inset" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			await page.evaluate(() =>
				window.bunood_theme.overlay_apply({ overlay_style: "Solid", overlay_scrim: "Blurred", overlay_menu: "Plain" }));
			await page.waitForTimeout(300);
			const previewed = await page.evaluate(() => ({
				style: document.documentElement.getAttribute("data-bnd-overlay"),
				scrim: document.documentElement.getAttribute("data-bnd-overlay-scrim"),
				menu: document.documentElement.getAttribute("data-bnd-overlay-menu"),
			}));
			await page.evaluate(() => cur_frm.refresh());
			await page.waitForTimeout(800);
			const after = await page.evaluate(() => ({
				style: document.documentElement.getAttribute("data-bnd-overlay"),
				scrim: document.documentElement.getAttribute("data-bnd-overlay-scrim"),
				menu: document.documentElement.getAttribute("data-bnd-overlay-menu"),
			}));
			expectEq(previewed.style, "solid", "the preview applied the style live");
			expectEq(previewed.scrim, "blurred", "and the scrim");
			expectEq(previewed.menu, "plain", "and the menu row");
			expectEq(after.style, "floating", "the discard restored the saved style");
			expectEq(after.scrim, "tinted", "and the saved scrim");
			expectEq(after.menu, null, "and the saved menu row (Inset is the neutral — no attribute)");
		});

		await test("overlay: an unset field does not strip the style", async () => {
			// bnd_overlay_preview sent raw frm.doc values with no default
			// fallback, so on a site where a field was never written, opening the
			// settings form CLEARED the anchor the boot payload had just set. The
			// renderer two functions above already fell back; the preview did not.
			setSettings({ overlay_style: "Floating" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4000);
			const g = await page.evaluate(async () => {
				// simulate the never-written field the boot payload defaults for
				const before = cur_frm.doc.overlay_scrim;
				cur_frm.doc.overlay_scrim = "";
				window.bunood_theme.overlay_apply({ overlay_style: cur_frm.doc.overlay_style, overlay_scrim: "" });
				await new Promise((r) => setTimeout(r, 250));
				const anchor = document.documentElement.getAttribute("data-bnd-overlay");
				cur_frm.doc.overlay_scrim = before;
				return { anchor };
			});
			expectEq(g.anchor, "floating", "an empty sibling value leaves the anchor standing");
		});

		await test("overlay: the tooltip arrow follows the chip, in both directions", async () => {
			// THE FILE'S OWN "trap of this item" HAD NO CHECK. The arrow is four
			// physical border sides, and Frappe ships a MIRRORED bundle where
			// `.bs-tooltip-right` paints `border-left-color`. The rules write the
			// inline axis logically (`border-inline-end-color`) precisely so they
			// land correctly on BOTH bundles — and nothing measured that, in
			// either direction, until the release review pointed it out.
			//
			// Placement is forced rather than left to Popper: `auto` would pick
			// whatever fits, and a check that measures a different side each run
			// is not a check.
			await goDesk("/app/todo", ".list-row, .no-result", 3500);
			const g = await page.evaluate(async () => {
				const visible = (el) => el && el.offsetParent !== null;
				const read = async (dir, placement) => {
					document.documentElement.setAttribute("dir", dir);
					document.body.setAttribute("dir", dir);
					document.documentElement.setAttribute("data-theme", "dark");
					const host = [...document.querySelectorAll(".page-head, .list-row, .page-title")].find(visible);
					if (!host) return null;
					window.jQuery(host).tooltip({ title: "arrow probe", trigger: "manual", placement }).tooltip("show");
					await new Promise((r) => setTimeout(r, 400));
					const tip = document.querySelector(".tooltip");
					const inner = tip && tip.querySelector(".tooltip-inner");
					const arrow = tip && tip.querySelector(".arrow");
					const out = inner && arrow
						? {
								chip: getComputedStyle(inner).backgroundColor,
								// the placement class Bootstrap actually applied
								cls: [...tip.classList].find((c) => c.startsWith("bs-tooltip-")) || "",
								// every side, so the assertion does not assume which one paints
								sides: ["borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor"]
									.map((k) => getComputedStyle(arrow, "::before")[k]),
						  }
						: null;
					try { window.jQuery(host).tooltip("hide").tooltip("dispose"); } catch (e) { /* teardown */ }
					await new Promise((r) => setTimeout(r, 150));
					return out;
				};
				const hadHtml = document.documentElement.getAttribute("dir");
				const hadBody = document.body.getAttribute("dir");
				const ltr = await read("ltr", "right");
				const rtl = await read("rtl", "right");
				const restore = (el, had) => (had === null ? el.removeAttribute("dir") : el.setAttribute("dir", had));
				restore(document.documentElement, hadHtml);
				restore(document.body, hadBody);
				document.documentElement.removeAttribute("data-theme");
				return { ltr, rtl };
			});
			expect(g.ltr && g.rtl, "a tooltip with an arrow rendered in both directions");
			for (const [dir, m] of [["LTR", g.ltr], ["RTL", g.rtl]]) {
				// Stock paints the arrow #000 while the chip follows the theme, so
				// "some side equals the chip" is exactly what the repair produces
				// and stock does not.
				const painted = m.sides.filter((c) => c === m.chip);
				expect(painted.length >= 1,
					`${dir}: the arrow takes the chip's colour (${m.cls}; chip ${m.chip}, sides ${m.sides.join(" / ")})`);
			}
		});

		// ── Responsive (item 24): the mobile boundary, and what holds below it ──
		//
		// Frappe's desk is "mobile" below 768px — `frappe.is_mobile()` is exactly
		// `window.innerWidth < 768` (utils/common.js). At that width toolbar.js
		// REPLACES the empty <header> that `mount_topbar` needs (desk.html:38
		// renders it at every width; the swap, not the width, is what removes it),
		// so the top-bar cluster does not mount and its tenants fall back. The old
		// ROADMAP text ("~480px, header not rendered") was wrong on both counts;
		// item 24 measured the real mechanism and these tests pin it.
		//
		// THE VIEWPORT IS SET BEFORE NAVIGATION, ON PURPOSE. The <header> swap is
		// a BOOT decision — toolbar.js runs once at construction — so
		// setViewportSize AFTER a load would not re-trigger it (that is the very
		// "nothing re-evaluates on resize" half of the defect). Every test here
		// sizes first, then loads, and restores 1920 before returning.
		{
			const NARROW = { width: 390, height: 844 };
			const wideAgain = () =>
				page.setViewportSize({ width: 1920, height: 1080 }).then(() => page.waitForTimeout(300));
			const topBar = () => ({
				...layoutSettings("Top Bar"),
				desk_layout: "Top Bar",
				search_placement: "Top Bar Center",
			});
			// A tenant is REACHABLE only if some affordance is actually laid out —
			// a node zero-boxed inside Frappe's collapsed (width:0) sidebar is not.
			const visSrc = `(s)=>{const n=document.querySelector(s);if(!n)return false;const r=n.getBoundingClientRect();const c=getComputedStyle(n);return r.width>0&&r.height>0&&c.visibility!=="hidden"&&c.display!=="none";}`;

			await test("responsive: the topbar follows the header's real presence at the 768 boundary", async () => {
				setSettings(topBar());
				// 768 is the first NON-mobile width (`< 768` is the test), so the
				// <header> survives, mount_topbar finds it, and the OUTCOME stamp
				// goes on.
				await page.setViewportSize({ width: 768, height: 1024 });
				await goDesk("/desk/item", ".page-head", 3500);
				const at768 = await page.evaluate(() => ({
					header: !!document.querySelector(".main-section > header"),
					topbar: !!document.querySelector(".bnd-topbar"),
					attr: document.documentElement.hasAttribute("data-bnd-topbar"),
				}));
				// 767 is mobile: toolbar.js has swapped the <header>, the query
				// misses, nothing mounts, and — the whole reason the attribute is
				// keyed on reality — nothing is stamped.
				await page.setViewportSize({ width: 767, height: 1024 });
				await goDesk("/desk/item", ".page-head", 3500);
				const at767 = await page.evaluate(() => ({
					header: !!document.querySelector(".main-section > header"),
					topbar: !!document.querySelector(".bnd-topbar"),
					attr: document.documentElement.hasAttribute("data-bnd-topbar"),
				}));
				await wideAgain();
				expect(at768.header && at768.topbar && at768.attr, `768 mounts the bar (${JSON.stringify(at768)})`);
				expect(!at767.header && !at767.topbar && !at767.attr, `767 mounts nothing, stamps nothing (${JSON.stringify(at767)})`);
			});

			await test("responsive: search reachable, page never scrolls sideways, chrome never overlaps at 390", async () => {
				setSettings(topBar());
				for (const [name, route, sel] of [
					["list", "/desk/item", ".page-head"],
					["form", FORM_ROUTE, ".page-head"],
					["settings", "/desk/theme-settings", ".bnd-shell"],
				]) {
					await page.setViewportSize(NARROW);
					await goDesk(route, sel, 3500);
					const r = await page.evaluate((visStr) => {
						const vis = eval(visStr);
						const de = document.documentElement;
						// Chrome REGIONS must not occupy the same pixels — the
						// "two things, one pixel" class, at a width the invariant
						// matrix has never run at. (main-section's own overflow is
						// Frappe's wide list content, clipped by its overflow-x:
						// hidden — not ours, so we check the PAGE, not that box.)
						const REGIONS = [".bnd-topbar", ".bnd-statusbar", ".bnd-dock", ".bnd-apps-rail"];
						const box = (el) => el.getBoundingClientRect();
						let overlap = null;
						const shown = REGIONS.map((s) => [s, document.querySelector(s)]).filter(([, el]) => el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0);
						for (let i = 0; i < shown.length && !overlap; i++)
							for (let j = i + 1; j < shown.length && !overlap; j++) {
								const a = shown[i][1], b = shown[j][1];
								if (a.contains(b) || b.contains(a)) continue;
								const ra = box(a), rb = box(b);
								const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
								const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
								if (ox > 2 && oy > 2) overlap = `${shown[i][0]} over ${shown[j][0]} ${Math.round(ox)}x${Math.round(oy)}`;
							}
						return {
							search: vis(".bnd-search-field") || vis(".bnd-search-icon") || vis(".body-sidebar .navbar-search-bar"),
							pageScroll: de.scrollWidth - de.clientWidth,
							overlap,
						};
					}, visSrc);
					expect(r.search, `${name}: search reachable at 390`);
					expect(r.pageScroll <= 1, `${name}: page does not scroll sideways at 390 (${r.pageScroll}px)`);
					expect(!r.overlap, `${name}: chrome regions do not overlap at 390 (${r.overlap})`);
				}
				await wideAgain();
			});

			await test("responsive: the bottom bar mounts host-free below the boundary", async () => {
				// mount_statusbar appends to document.body and needs no Frappe
				// host, so it is the one container that survives the mobile
				// <header> swap — which is why item 24 (slice C) routes the phone's
				// bell and user INTO it rather than reviving the top bar.
				setSettings({ ...topBar(), status_style: "Quiet" });
				await page.setViewportSize(NARROW);
				await goDesk("/desk/item", ".page-head", 3500);
				const bar = await visible(".bnd-statusbar");
				await wideAgain();
				expect(bar === true, `bottom bar visible at 390 (${bar})`);
			});

			await test("responsive: the mobile bar carries every critical tenant at a touch size (390)", async () => {
				// The item-24 defect, now closed: below 768 the bell and user were
				// unreachable (zero-boxed in Frappe's collapsed sidebar). The narrow
				// preset routes search / apps / alerts / you into the full-width
				// bottom bar; the status signals stand down; each control clears the
				// 24px touch floor. This assertion was red before slice C.
				setSettings(topBar());
				await page.setViewportSize(NARROW);
				await goDesk("/desk/item", ".page-head", 3500);
				const bar = await page.evaluate((visStr) => {
					const vis = eval(visStr);
					const b = document.querySelector(".bnd-statusbar");
					const t = (s) => {
						const n = b && b.querySelector(s);
						if (!n) return { v: false, min: 0 };
						const r = n.getBoundingClientRect();
						return { v: vis(s), min: Math.round(Math.min(r.width, r.height)) };
					};
					return {
						narrow: document.documentElement.hasAttribute("data-bnd-narrow"),
						start: b ? Math.round(b.getBoundingClientRect().left) : null,
						signals: b ? [...b.querySelectorAll("[data-bnd-prio]")].filter((n) => getComputedStyle(n).display !== "none").length : -1,
						search: t(".bnd-search-field, .bnd-search-icon"),
						bell: t(".bnd-bell"),
						user: t(".bnd-avatar-btn"),
						apps: t('[data-bnd-part="apps"]'),
					};
				}, visSrc);
				await wideAgain();
				expect(bar.narrow, "data-bnd-narrow is stamped at 390");
				expect(bar.start === 0, `the bar spans the viewport, not a stub beside a phantom column (starts at ${bar.start})`);
				expect(bar.signals === 0, `the ranked status signals stand down (${bar.signals} still shown)`);
				for (const name of ["search", "bell", "user", "apps"]) {
					expect(bar[name].v, `${name} is visible in the mobile bar`);
					expect(bar[name].min >= 24, `${name} clears the 24px touch floor (${bar[name].min}px)`);
				}
			});

			await test("responsive: crossing the boundary remounts the chrome both ways", async () => {
				// The "nothing re-evaluates on resize" half of the defect: a desk
				// booted wide and narrowed kept its desktop chrome, and vice versa.
				// matchMedia now remounts on the threshold. Booted at 1920 (the
				// suite's width), so this is the desktop-resize case — the one where
				// Frappe's <header> was never swapped, so the top bar can return.
				setSettings(topBar());
				await goDesk("/desk/item", ".page-head", 3500);
				const wide1 = await page.evaluate(() => ({
					narrow: document.documentElement.hasAttribute("data-bnd-narrow"),
					topbar: !!document.querySelector(".bnd-topbar"),
				}));
				await page.setViewportSize(NARROW);
				await page.waitForTimeout(800);
				const narrow = await page.evaluate(() => ({
					narrow: document.documentElement.hasAttribute("data-bnd-narrow"),
					topbar: !!document.querySelector(".bnd-topbar"),
					bar: !!document.querySelector(".bnd-statusbar"),
				}));
				await page.setViewportSize({ width: 1920, height: 1080 });
				await page.waitForTimeout(800);
				const wide2 = await page.evaluate(() => ({
					narrow: document.documentElement.hasAttribute("data-bnd-narrow"),
					topbar: !!document.querySelector(".bnd-topbar"),
				}));
				expect(wide1.topbar && !wide1.narrow, `wide: top bar up, not narrow (${JSON.stringify(wide1)})`);
				expect(narrow.narrow && !narrow.topbar && narrow.bar, `narrow: top bar down, mobile bar up (${JSON.stringify(narrow)})`);
				expect(wide2.topbar && !wide2.narrow, `widened back: the top bar returns (${JSON.stringify(wide2)})`);
			});

			await test("responsive: the side pane collapses to a drawer, not a column (390)", async () => {
				// The item-24 slice-D fix: our sidebar kit pinned the container to
				// --bnd-sb-w (an inline width), so below 768 the desk was squeezed
				// into a ~150px strip beside a phantom column while Frappe had
				// already collapsed its own pane. Now the resting container is out
				// of flow and the desk fills the viewport; Frappe's drawer still
				// overlays on demand.
				setSettings(topBar());
				await page.setViewportSize(NARROW);
				await goDesk("/desk/item", ".page-head", 3500);
				const rest = await page.evaluate(() => {
					const ms = document.querySelector(".main-section").getBoundingClientRect();
					return { left: Math.round(ms.left), w: Math.round(ms.width), vw: window.innerWidth };
				});
				await page.evaluate(() => {
					const t = document.querySelector(".page-head .sidebar-toggle-btn") || document.querySelector(".sidebar-toggle-btn");
					if (t) t.click();
				});
				await page.waitForTimeout(700);
				const drawer = await page.evaluate(() => {
					const sb = document.querySelector(".body-sidebar");
					return sb ? Math.round(sb.getBoundingClientRect().width) : 0;
				});
				await wideAgain();
				expect(rest.left <= 1, `content starts at the edge, no reserved column (left=${rest.left})`);
				expect(rest.w >= rest.vw - 1, `content fills the viewport (${rest.w}/${rest.vw})`);
				expect(drawer > 100, `the drawer still opens as an overlay (${drawer}px)`);
			});

			await test("responsive: the phone-bar toggles gate their tenants (C2)", async () => {
				// mobile_apps off removes the All Apps button from the narrow bar;
				// on brings it back. Search has no toggle — it is the only search on
				// a phone — so it stays either way.
				const appsVis = () =>
					page.evaluate(() => {
						const n = document.querySelector('.bnd-statusbar [data-bnd-part="apps"]');
						return !!(n && n.getBoundingClientRect().width > 0);
					});
				const searchVis = () =>
					page.evaluate(() => {
						const n = document.querySelector(".bnd-statusbar .bnd-search-field, .bnd-statusbar .bnd-search-icon");
						return !!(n && n.getBoundingClientRect().width > 0);
					});
				setSettings({ ...topBar(), mobile_apps: 0 });
				await page.setViewportSize(NARROW);
				await goDesk("/desk/item", ".page-head", 3500);
				const offApps = await appsVis();
				const offSearch = await searchVis();
				setSettings({ mobile_apps: 1 });
				await goDesk("/desk/item", ".page-head", 3500);
				const onApps = await appsVis();
				await wideAgain();
				expect(!offApps, "apps leaves the mobile bar when mobile_apps is off");
				expect(offSearch, "search stays in the mobile bar regardless of the toggles");
				expect(onApps, "apps returns when mobile_apps is on");
			});

			await test("responsive: axe finds nothing in the mobile nav (390)", async () => {
				// The mobile bottom bar is OUR chrome and renders only below 768, so
				// the 1920 OURS gate never sees it (at 1920 the bar shows the desktop
				// status content, not the phone nav). This gates its a11y at its
				// native width — the contract's gate at the second viewport, done as
				// one scoped scan rather than doubling every Desk axe scan on a host
				// that is already tight on memory.
				setSettings(topBar());
				await page.setViewportSize(NARROW);
				await goDesk("/desk/item", ".page-head", 3500);
				const res = await new AxeBuilder({ page })
					.include(".bnd-statusbar")
					.withTags(["wcag2a", "wcag2aa"])
					// Page-level rules have no meaning in a scoped include.
					.disableRules(["region", "page-has-heading-one", "landmark-one-main", "bypass"])
					.analyze();
				await wideAgain();
				const bad = res.violations.map(
					(v) => `${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`
				);
				expect(bad.length === 0, `mobile nav axe-clean at 390 (${bad.join("; ")})`);
			});
		}

		await test("payload: the bundle is within its budget", async () => {
			// GUIDELINES §2.5, enforced at last: the bundle grew from 78/183 KB
			// raw to 92/247 across five releases with nobody deciding it,
			// because nothing measured it. tools/payload.mjs owns the ledger
			// and the ceilings; this test makes every verify a checkpoint. The
			// gate failing is the process working — raise the ceiling in
			// payload-budget.json in the same commit as the growth, with the
			// why in its message.
			const res = spawnSync(process.execPath, ["tools/payload.mjs", "--check"], {
				cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
				encoding: "utf8",
			});
			expectEq(res.status, 0, `payload check: ${(res.stdout + res.stderr).trim().slice(0, 400)}`);
		});

		await test("console error budget: nothing beyond the allowlist", async () => {
			const unexpected = consoleErrors.filter((e) => !CONSOLE_ALLOWLIST.some((re) => re.test(e)));
			expectEq(unexpected.length, 0, `unexpected console errors:\n${unexpected.slice(0, 5).join("\n")}`);
		});
	} finally {
		// Always restore the site to its pre-suite configuration.
		try {
			setSettings(snapshot);
		} catch (e) {
			console.error("WARNING: settings restore failed — check Theme Settings manually.", e.message);
		}
		// Separately try/caught: a failed SETTINGS restore must not skip the
		// LANGUAGE restore. Leaving the site in Arabic is the more confusing of
		// the two to walk into, because it makes every later run fail on checks
		// that have nothing to do with what broke.
		try {
			setLang(langSnapshot);
		} catch (e) {
			console.error("WARNING: language restore failed — check System Settings manually.", e.message);
		}
		await browser.close();
	}

	const failed = results.filter((r) => !r.ok);
	// A filtered run deliberately does NOT print the phrase "N/M passed". That
	// string is what tools/verify.mjs reports as the verdict and what a reader
	// scans for; a partial run must not be able to produce it. An inner-loop
	// check that reads like a release gate is worse than having no inner loop.
	if (ONLY) {
		console.log(
			`\nFILTERED RUN — ${results.length - failed.length}/${results.length} matched checks ok, ` +
				`${skipped} skipped. NOT a release gate; run the full suite before committing.`
		);
	} else {
		console.log(`\n${results.length - failed.length}/${results.length} passed`);
	}
	process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
	console.error("suite crashed:", err);
	process.exit(2);
});
