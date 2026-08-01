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

import { execFileSync } from "node:child_process";
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
];

// ── The suite ───────────────────────────────────────────────────────────────

/** The suite: snapshot settings, run every check sequentially against one
 * authenticated page, then restore settings in `finally` — even on failure. */
async function main() {
	console.log(`Bunood Theme smoke suite — ${URL_BASE} (${SITE})`);

	const sid = process.env.BND_SID || mintSid();
	const snapshot = getSettings(MUTABLE_FIELDS);
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
				expectEq(await visible(".body-sidebar .navbar-search-bar"), true, "sidebar search kept");
			},
			"Classic": async () => {
				expect(!(await q(".bnd-topbar")) && !(await q(".bnd-statusbar")) && !(await q(".bnd-dock")), "no bnd chrome");
				expectEq(await visible(".body-sidebar .sidebar-notification"), true, "sidebar bell kept");
			},
			"Bottom Bar": async () => {
				expect(await q(".bnd-statusbar.bnd-bottombar .bnd-search-field"), "bottombar with search");
				expect(await q(".bnd-bottombar .bnd-cluster"), "cluster in bottombar");
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
				setSettings({ desk_layout: layout });
				await goDesk("/desk/sales-invoice", ".page-head");
				await checks();
			});
		}
		setSettings({ desk_layout: "Top Bar" });

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
