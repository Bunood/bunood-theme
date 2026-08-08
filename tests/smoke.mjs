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
		throw new Error(`benchPy failed:\n${stderr || String(err.message).slice(0, 200)}`);
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
	sidebar_icon_style: { "Colored Chips": "chips", "Colored Dots": "dots", "Filled Color": "filled", Duotone: "duotone", "Brand Lines": "brandlines", Monochrome: "mono" },
	sidebar_active_style: { "Solid Pill": "pill", "Soft Pill": "softpill", "Accent Rail": "rail", "Glow Ring": "glow", Outline: "outline", "Dot Marker": "dot", "Folder Tab": "foldertab" },
	sidebar_section_layout: { Plain: "plain", Divided: "divided", "Mini-Cards": "cards", "Accordion Cards": "accordion" },
	sidebar_hue_wash: { Off: "off", Subtle: "subtle", Rich: "rich" },
	sidebar_menu_rail: { "Always Expanded": "expanded", "Manual Collapse": "manual", Rail: "rail" },
};

const ATTR_OF = {
	sidebar_placement: "data-bnd-sb-placement",
	sidebar_material: "data-bnd-sb-material",
	sidebar_color: "data-bnd-sb-color",
	sidebar_icon_style: "data-bnd-sb-icons",
	sidebar_active_style: "data-bnd-sb-active",
	sidebar_section_layout: "data-bnd-sb-sections",
	sidebar_hue_wash: "data-bnd-sb-wash",
	sidebar_menu_rail: "data-bnd-sb-menurail",
};

// All Theme Settings fields the suite may mutate — snapshotted for restore.
const MUTABLE_FIELDS = [
	"desk_layout", "sidebar_preset", "sidebar_placement", "sidebar_material",
	"sidebar_glass_opacity", "sidebar_blur", "sidebar_color", "sidebar_icon_style",
	"sidebar_active_style", "sidebar_section_layout", "sidebar_hue_wash",
	"sidebar_surface_intensity", "sidebar_menu_rail", "sidebar_rail_trigger",
	"sidebar_rail_button", "sidebar_rail_button_shape", "sidebar_rail_button_icon",
	"sidebar_icon_source", "sidebar_pane_width",
	"sidebar_apps_rail", "sidebar_badges", "sidebar_remember_sections",
	"sidebar_scroll_fades",
	// The save round-trip test writes tagline; release review v0.6.2..HEAD
	// caught that leaving it out made every run permanently clobber the field.
	"tagline",
	// Breadcrumb kit (item 11).
	"crumb_style", "crumb_separator", "crumb_icons", "crumb_hover",
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
		for (const [layout, checks] of Object.entries(LAYOUT_CHECKS)) {
			await test(`layout: ${layout}`, async () => {
				// Search placement is a SEPARATE setting since item 14, and these
				// checks assert where search ends up — so they must state it
				// rather than inherit whatever the site happens to hold. Left
				// implicit, a bench sitting on "Sidebar Top" failed Top Bar and
				// Bottom Bar for reasons that were entirely correct behaviour.
				setSettings({ desk_layout: layout, search_placement: "Top Bar Center" });
				await goDesk("/desk/sales-invoice", ".page-head");
				await checks();
			});
		}
		setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });

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
					crumb_style: style, crumb_separator: "Chevron", crumb_icons: "First Crumb",
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
			setSettings({ crumb_style: "Quiet Trail", crumb_icons: "Every Crumb" });
			await goDesk("/desk/item/BND-TEST-001", ".page-head", 3000);
			const chips = await page.evaluate(() => {
				const trail = [...document.querySelectorAll(".page-head .navbar-breadcrumbs")].find((u) => u.offsetParent);
				return trail ? trail.querySelectorAll(".bnd-crumb-chip").length : 0;
			});
			expect(chips >= 2, `at least 2 chips on the form trail (got ${chips})`);
			setSettings({ crumb_icons: "First Crumb" });
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
			await page.click(".bnd-icon-btn[aria-label='Notifications']");
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
			setSettings({ inbox_style: "Original" });
			await goDesk("/desk/item", ".page-head", 2500);
			expectEq(await attr("data-bnd-inbox"), null, "no style attr");
			expect(!(await q(".bnd-inbox-badge:not([hidden])")), "no badge");
			await page.click(".bnd-icon-btn[aria-label='Notifications']");
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
			expect(!(await q(".bnd-icon-btn[aria-label='Notifications']")), "no themed bell in Classic (precondition)");
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
			"Top Bar Center": "topcenter", "Top Bar Edge": "topedge",
			"Sidebar Top": "sbtop", "Sidebar Bottom": "sbbottom",
			"Bottom Bar Center": "botcenter", "Bottom Bar Edge": "botedge",
		};
		for (const [label, slug] of Object.entries(SEARCH_SLOTS)) {
			await test(`search: placed at ${label}`, async () => {
				setSettings({ desk_layout: "Top Bar", search_placement: label, status_style: "Quiet" });
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
			setSettings({ desk_layout: "Dock", search_placement: "Sidebar Top" });
			await goDesk("/desk/item", ".page-head", 4500);
			// Falls back to the DOCK, not the status bar: the pill is the one
			// piece of chrome this layout always has, and it is where the
			// layout's other controls already live.
			expectEq(await attr("data-bnd-search"), "dock", "left the hidden sidebar for the dock");
			expectEq(await visible(".bnd-dock .bnd-search-icon"), true, "search is actually on screen");
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });
		});

		await test("status: Quiet hides healthy signals, Operator shows them", async () => {
			setSettings({ status_style: "Operator", status_interval: "30s" });
			await goDesk("/desk/item", ".page-head", 4500);
			await page.waitForSelector(".bnd-status-seg:not([hidden])", { timeout: 8000 });
			const operator = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-status-seg")].filter((n) => !n.hasAttribute("hidden")).length
			);
			expect(operator >= 2, `Operator shows its segments (${operator})`);
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
			// before auto margins, so a flexing sibling cancels the cluster's
			// `margin-inline-start: auto` and drags the bell and avatar to the
			// leading edge.
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center" });
			await goDesk("/desk/item", ".page-head", 4000);
			const geom = await page.evaluate(() => {
				const bar = document.querySelector(".bnd-topbar");
				const cluster = document.querySelector(".bnd-topbar .bnd-cluster");
				const field = document.querySelector(".bnd-topbar .bnd-search-field");
				if (!bar || !cluster || !field) return null;
				const b = bar.getBoundingClientRect(), c = cluster.getBoundingClientRect(), f = field.getBoundingClientRect();
				return {
					clusterFromEnd: Math.round(b.right - c.right),
					clusterFromStart: Math.round(c.left - b.left),
					offCentre: Math.abs(Math.round((f.left + f.right) / 2 - (b.left + b.right) / 2)),
				};
			});
			expect(geom, "top bar, cluster and search all present");
			expect(geom.clusterFromEnd < geom.clusterFromStart, `cluster sits at the end (${JSON.stringify(geom)})`);
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
			setSettings({ desk_layout: "Dock", status_style: "Operator", search_placement: "Top Bar Center" });
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
			setSettings({ desk_layout: "Top Bar", status_style: "Operator", search_placement: "Top Bar Center" });
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
			setSettings({ status_style: "Operator", search_placement: "Bottom Bar Center" });
			await goDesk("/desk/item", ".page-head", 4500);
			const visiblePrios = async () =>
				page.evaluate(() =>
					[...document.querySelectorAll(".bnd-statusbar [data-bnd-prio]")]
						.filter((n) => getComputedStyle(n).display !== "none")
						.map((n) => parseInt(n.dataset.bndPrio, 10))
				);
			const wide = await visiblePrios();
			await page.setViewportSize({ width: 700, height: 900 });
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

		// ── Sidebar presets: attribute matrix + core mounts ────────────────
		for (const [name, values] of Object.entries(presets)) {
			await test(`preset: ${name}`, async () => {
				setSettings({ ...values, sidebar_preset: name });
				await goDesk("/desk/sales-invoice", ".page-head", 3000);
				for (const [field, attrName] of Object.entries(ATTR_OF)) {
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
			setSettings({ ...presets["Bunood Night"], sidebar_preset: "Bunood Night" });
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
			setSettings({ desk_layout: "Top Bar", inbox_placement: "Side Pane", user_placement: "Top Bar" });
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
			setSettings({ desk_layout: "Top Bar", inbox_placement: "Off", user_placement: "Top Bar" });
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
			setSettings({ inbox_placement: "Top Bar" });
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
				["Top Bar", "topbar"],
				["Bottom Bar", "bottombar"],
				["Page Header", "pagehead"],
				["Dock", "dock"],
				["Side Pane", "sidepane"],
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
				["Top Bar", ".bnd-topbar"],
				["Bottom Bar", ".bnd-statusbar"],
				["Dock", ".bnd-dock"],
			]) {
				setSettings({
					...CHROME_DEFAULTS,
					desk_layout: "Top Bar",
					topbar_enabled: 1,
					bottombar_enabled: 1,
					dock_enabled: 1,
					home_placement: where,
					apps_placement: "Sidebar Top",
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
				home_placement: "Top Bar",
				apps_placement: "Top Bar",
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
				inbox_placement: "Top Bar",
				user_placement: "Top Bar",
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
			["Bottom Bar", "Operator", "Bottom Bar Center", {}],
			// No bar anywhere: everything must fall back to the natives.
			["Classic", "Quiet", "Top Bar Center", { bottombar_enabled: 0, }],
			// Sidebar hidden outright — the natives are NOT available here.
			["Dock", "Quiet", "Sidebar Top", { bottombar_enabled: 0, }],
			["Dock", "Quiet", "Top Bar Center", {}],
			// Compact keeps its native search row; the layout mounts no top bar.
			["Compact", "Minimal", "Top Bar Center", {}],
			// Search asked for a bar that this layout does not mount.
			["Classic", "Quiet", "Bottom Bar Edge", {}],
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
			["Classic", "Quiet", "Top Bar Edge", { bottombar_enabled: 0,  topbar_enabled: 1 }],
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
				crumbs_picker: { cards: 5, toggles: 3, opts: 10 },
				palette_picker: { cards: 4, toggles: 6 },
				// `slots` are desk-diagram targets and `cards` are style
				// thumbnails: different controls, counted apart. Search has only
				// slots now — its six thumbnails became six positions on one
				// shared desk. The bell's `opts` went 7 -> 8 for the "Off" chip,
				// which sits BESIDE the diagram because "not shown" is not a place.
				inbox_picker: { cards: 4, slots: 5, toggles: 4, opts: 8 },
				user_picker: { cards: 0, slots: 5, opts: 1 },
				search_picker: { cards: 0, slots: 6 },
				// 7, not 8: `status_in_classic` was deleted when the status bar stopped
				// being a property of the layout.
				status_picker: { cards: 4, toggles: 7, opts: 7 },
			};
			const got = await page.evaluate(() => {
				const out = {};
				for (const f of Object.keys({
					layout_picker: 1, sidebar_picker: 1, crumbs_picker: 1, palette_picker: 1,
					inbox_picker: 1, user_picker: 1, search_picker: 1, status_picker: 1,
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

			setSettings({ desk_layout: "Top Bar", inbox_placement: "Top Bar", status_style: "Quiet" });
			await goDesk("/desk/theme-settings?shell=1", ".bnd-shell", 4500);
			await page.click('.bnd-shell-item[data-key="inbox"]');
			await page.waitForTimeout(500);
			let s1 = await slots("inbox");
			expect(!!s1 && s1.length === 5, `bell diagram has ${s1 ? s1.length : 0} slots, expected 5`);
			expectEq(s1.filter((x) => x.on).map((x) => x.v).join(","), "Top Bar", "wrong slot marked current");
			// Top Bar layout: no dock, and only Compact fills the title row.
			expectEq(
				s1.filter((x) => x.warn).map((x) => x.v).sort().join(","),
				"Dock,Page Header",
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
			setSettings({ inbox_placement: "Top Bar", user_placement: "Side Pane" });
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
			setSettings({ user_placement: "Top Bar" });
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

			setSettings({ crumb_hover: shipped.crumb_hover });
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
				// The Overview owns no fields — it READS them — so it has no state
				// to report and must stay silent. Saying "Default" under it would
				// claim otherwise, and would go on saying it while every component
				// it displays had been changed.
				const allowed = key === "overview" ? [""] : ["Default", "Changed"];
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
			setSettings({ desk_layout: "Top Bar", status_style: "Operator", search_placement: "Top Bar Center" });
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
				["Top Bar", "Operator"],
				["Bottom Bar", "Operator"],
				["Dock", "Operator"],
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

			setSettings({ desk_layout: "Top Bar", inbox_placement: "Top Bar", user_placement: "Top Bar" });
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

			setSettings({ desk_layout: "Top Bar", user_placement: "Top Bar", inbox_placement: "Top Bar" });
		});

		// ── Console error budget ───────────────────────────────────────────
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
