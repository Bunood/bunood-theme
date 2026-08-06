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
];

// ── Tiny sequential test runner ─────────────────────────────────────────────

const results = [];
let page; // assigned in main()

/** Run one named check. Failures are recorded and printed but never abort
 * the suite — every remaining check still runs, and main() derives the exit
 * status from the collected results. */
async function test(name, fn) {
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
	return execFileSync(
		"docker",
		["exec", "-i", BACKEND, "bash", "-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python -"],
		{ input: wrapped, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
	);
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

/** Write Theme Settings fields + clear cache so boot picks them up. */
function setSettings(values) {
	benchPy(
		`vals = json.loads(${JSON.stringify(JSON.stringify(values))})\n` +
		`for f, v in vals.items():\n` +
		`    frappe.db.set_single_value("Theme Settings", f, v)\n` +
		`frappe.clear_cache()\n` +
		`frappe.db.commit()\n` +
		`print("ok")\n`
	);
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
	"sidebar_icon_source", "sidebar_pane_width", "sidebar_quick_links",
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
	"inbox_placement", "user_placement",
	"search_placement", "status_style", "status_segments_jobs", "status_segments_errors",
	"status_segments_scheduler", "status_segments_connection", "status_segments_density",
	"status_clock", "status_interval", "status_freshness", "status_escalate", "status_in_classic",
];

// ── The suite ───────────────────────────────────────────────────────────────

/** The suite: snapshot settings, run every check sequentially against one
 * authenticated page, then restore settings in `finally` — even on failure. */
async function main() {
	console.log(`Bunood Theme smoke suite — ${URL_BASE} (${SITE})`);

	const sid = process.env.BND_SID || mintSid();
	const snapshot = getSettings(MUTABLE_FIELDS);

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
				expect(await q(".bnd-statusbar:not(.bnd-bottombar)"), "slim statusbar");
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
				expect(!(await q(".bnd-topbar")) && !(await q(".bnd-statusbar")) && !(await q(".bnd-dock")), "no bnd chrome");
				expectEq(await visible(".body-sidebar .sidebar-notification"), true, "sidebar bell kept");
			},
			"Bottom Bar": async () => {
				expect(await q(".bnd-bottombar .bnd-cluster"), "cluster in bottombar");
				// Search is its own setting since item 14, and the DEFAULT asks
				// for a top bar this layout never mounts. So this asserts the
				// fallback, not a layout feature: it must land in the bottom
				// bar promptly rather than vanish or arrive seconds late.
				await page.waitForSelector(".bnd-statusbar.bnd-bottombar .bnd-search-field", { timeout: 2500 });
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
			const texts = await page.evaluate(() =>
				[...document.querySelectorAll(".bnd-palette-row")].map((r) => r.textContent)
			);
			expect(texts.some((t) => /Item List/.test(t)), "Item List row present");
			// "New X" rows ride inside get_doctypes, not get_creatables (which
			// needs a "new " prefix) — the split into Actions must survive.
			expect(texts.some((t) => /New Item/.test(t)), "New Item action present");
			expect(texts[texts.length - 1].includes("Search all documents"), "search-all pinned last");
		});

		await test("palette: execution routes and records frecency", async () => {
			// Clear BEFORE acting, not only after: a leftover blob from an
			// aborted earlier run would make the server-write assertion pass
			// even if the endpoint regressed (release review v0.7.0..HEAD).
			benchPy(
				`frappe.defaults.clear_default("bnd_palette_usage", parent="Administrator")\nfrappe.db.commit()\nprint("ok")\n`
			);
			await page.evaluate(() => {
				const row = [...document.querySelectorAll(".bnd-palette-row")].find((r) =>
					/Item List/.test(r.textContent)
				);
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

			setSettings({ status_style: "Off" });
			await goDesk("/desk/item", ".page-head", 3000);
			expect(!(await q(".bnd-statusbar")), "no status bar at all");
			setSettings({ status_style: "Quiet" });
		});

		await test("status: Off never takes away a layout's own chrome", async () => {
			// Off means "no status bar". In Bottom Bar the strip is not the
			// status bar — it is the layout's only chrome, and the sidebar's
			// bell and user button are hidden by the layout. Skipping it there
			// left a desk with no notifications and no way to log out.
			setSettings({ desk_layout: "Bottom Bar", status_style: "Off" });
			await goDesk("/desk/item", ".page-head", 4000);
			expect(await q(".bnd-bottombar .bnd-cluster"), "bottom bar still carries the cluster");
			expect(await q(".bnd-bottombar .bnd-inbox-bell, .bnd-bottombar .bnd-cluster button"), "bell reachable");
			const segs = await page.evaluate(() => document.querySelectorAll(".bnd-status-seg, .bnd-status-fresh").length);
			expectEq(segs, 0, "but carries no status content");

			// ...while a layout whose bar IS the status bar loses it entirely.
			setSettings({ desk_layout: "Top Bar", status_style: "Off" });
			await goDesk("/desk/item", ".page-head", 3000);
			expect(!(await q(".bnd-statusbar")), "Top Bar drops the strip outright");
			setSettings({ status_style: "Quiet" });
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
				setSettings({ desk_layout: layout, search_placement: "Bottom Bar Center", status_in_classic: 1 });
				await goDesk("/desk/item", ".page-head", 4500);
				const count = await page.evaluate(() => {
					const ours = document.querySelectorAll(".bnd-search-field").length;
					const native = document.querySelector(".body-sidebar .navbar-search-bar");
					return ours + (native && getComputedStyle(native).display !== "none" ? 1 : 0);
				});
				expectEq(count, 1, `${layout}: exactly one search field on screen`);
			}
			setSettings({ desk_layout: "Top Bar", search_placement: "Top Bar Center", status_in_classic: 0 });
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
			// [layout, status_style, status_in_classic, what the layout mounts]
			["Top Bar", "Quiet", 0, ".bnd-statusbar"],
			["Compact", "Quiet", 0, ".bnd-statusbar"],
			["Bottom Bar", "Quiet", 0, ".bnd-statusbar.bnd-bottombar"],
			// Dock mounts a floating pill AND a status bar; the reserve has to
			// clear whichever sits highest, which is the pill.
			["Dock", "Quiet", 0, ".bnd-dock"],
			// Dock with the status bar switched Off: the pill ALONE. Worth its
			// own row because the pill is appended to <body> while the status
			// bar goes into .main-section — so a reserve that only watches
			// .main-section passes the row above (the bar's arrival triggers
			// the re-measure, which then happens to see the pill) and fails
			// this one. It did exactly that; measured in RTL at 430px.
			["Dock", "Off", 0, ".bnd-dock"],
			// Classic mounts nothing by default — but it can opt in, and that
			// opt-in had no reservation at all before this fix.
			["Classic", "Quiet", 1, ".bnd-statusbar"],
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

		for (const [layout, status, inClassic, mounts] of RESERVE_LAYOUTS) {
			await test(`reserve: ${layout} keeps the paging row clear of ${mounts}`, async () => {
				setSettings({
					desk_layout: layout, status_style: status, status_in_classic: inClassic,
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
			setSettings({ desk_layout: "Top Bar", status_style: "Off", status_in_classic: 0 });
			await goDesk("/desk/item", ".frappe-list", 4500);
			const g = await bottomGeometry();
			expectEq(g.barTop, null, "no bottom chrome is mounted");
			expectEq(g.reserve, "0px", "reserve released");
			const vh = await page.evaluate(() => window.innerHeight);
			expectEq(g.mainBottom, vh, ".main-section runs to the viewport edge");
			setSettings({
				desk_layout: "Top Bar", status_style: "Quiet", status_in_classic: 0,
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
			await goDesk("/desk/theme-settings", ".bnd-sbp-presets", 2000);
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

		// ── Live preview ───────────────────────────────────────────────────
		await test("live preview: pane color flips instantly, discard reverts", async () => {
			const before = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			await page.click('.bnd-sbp-opt[data-field="sidebar_color"][data-value="Minimal"]');
			await page.waitForTimeout(700);
			const after = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			expect(before !== after, "background changed live");
			await page.evaluate(() => window.cur_frm.reload_doc());
			await page.waitForTimeout(2000);
			const reverted = await page.evaluate(() => getComputedStyle(document.querySelector(".body-sidebar-container")).backgroundColor);
			expectEq(reverted, before, "discard reverts the desk");
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

		await test("placement: a region this layout lacks changes nothing", async () => {
			// The shipped default is Top Bar, and Bottom Bar has no top bar.
			// "Cannot honour" must not mean "delete" — that is the failure the
			// whole rework exists to remove, and it would arrive via upgrade.
			setSettings({ desk_layout: "Bottom Bar", inbox_placement: "Top Bar", user_placement: "Top Bar" });
			await goDesk("/desk/item", ".page-head", 4500);
			const kept = await page.evaluate(() => ({
				bell: !!document.querySelector(".bnd-bottombar .bnd-bell"),
				user: !!document.querySelector(".bnd-bottombar .bnd-avatar-btn"),
			}));
			expect(kept.bell && kept.user, `bottom bar keeps its chrome (${JSON.stringify(kept)})`);
			setSettings({ desk_layout: "Top Bar" });
		});

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
		const INVARIANT_STATES = [
			["Top Bar", "Quiet", "Top Bar Center"],
			// The critical v0.10.0 defect: this strip IS the layout's only
			// chrome, so "no status bar" must not mean "no logout".
			["Bottom Bar", "Off", "Top Bar Center"],
			["Bottom Bar", "Operator", "Bottom Bar Center"],
			// No bar anywhere: everything must fall back to the natives.
			["Classic", "Off", "Top Bar Center"],
			// Sidebar hidden outright — the natives are NOT available here.
			["Dock", "Off", "Sidebar Top"],
			["Dock", "Quiet", "Top Bar Center"],
			// Compact keeps its native search row; the layout mounts no top bar.
			["Compact", "Minimal", "Top Bar Center"],
			// Search asked for a bar that this layout does not mount.
			["Classic", "Quiet", "Bottom Bar Edge"],
		];

		for (const [layout, style, placement] of INVARIANT_STATES) {
			await test(`invariant: ${layout} · ${style} · search ${placement}`, async () => {
				setSettings({ desk_layout: layout, status_style: style, search_placement: placement });
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

		setSettings({ desk_layout: "Top Bar", status_style: "Quiet", search_placement: "Top Bar Center" });

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
			await goDesk("/desk/theme-settings", ".bnd-srp-slot", 3500);
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
				inbox_picker: { cards: 4, toggles: 4, opts: 7 },
				search_picker: { cards: 6 },
				status_picker: { cards: 4, toggles: 8, opts: 7 },
			};
			const got = await page.evaluate(() => {
				const out = {};
				for (const f of Object.keys({
					layout_picker: 1, sidebar_picker: 1, crumbs_picker: 1, palette_picker: 1,
					inbox_picker: 1, search_picker: 1, status_picker: 1,
				})) {
					const el = document.querySelector(`[data-fieldname="${f}"]`);
					out[f] = el
						? {
								h: Math.round(el.getBoundingClientRect().height),
								cards: el.querySelectorAll(".bnd-cbp-style,.bnd-lp-card,.bnd-sbp-preset,.bnd-srp-slot").length,
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
			setSettings(fixture.state);
			await goDesk("/desk/theme-settings", ".bnd-srp-slot", 3500);
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
		await test("shell: absent unless asked for", async () => {
			await goDesk("/desk/theme-settings", ".bnd-srp-slot", 3500);
			expectEq(await q(".bnd-shell"), false, "shell rendered without ?shell=1");
			// And the legacy form is untouched — the sections still show.
			expect(await visible('[data-fieldname="sidebar_picker"]'), "legacy picker missing");
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
					cards: document.querySelectorAll(".bnd-cbp-opt, .bnd-sbp-card, .bnd-srp-slot").length,
					cardsInShell: inside(".bnd-cbp-opt, .bnd-sbp-card, .bnd-srp-slot"),
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
			// crumb_style or desk_layout print a preset name, which would be a
			// label with no catalogue behind it. Only the side pane has presets.
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
			for (const [key, note] of Object.entries(notes)) {
				if (key === "sidepane") continue;
				expect(
					["Default", "Changed"].includes(note),
					`${key} shows "${note}" — only the side pane has presets, so the rest must be Default/Changed`
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
		await browser.close();
	}

	const failed = results.filter((r) => !r.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed`);
	process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
	console.error("suite crashed:", err);
	process.exit(2);
});
