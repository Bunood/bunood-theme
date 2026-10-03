/**
 * Focused live acceptance for the Bunood navigation state machine.
 *
 * This is an inner-loop gate, not the release smoke suite. It creates one
 * ordinary operational user, exercises desktop LTR/RTL and mobile navigation,
 * proves per-user pane persistence, then removes the fixture.
 */
import { createRequire } from "node:module";
import { benchPy, mintSid, URL_BASE } from "./session.mjs";
import { browserLaunchOptions } from "./browser.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const USER = "bunood-navigation-qa@example.com";
const REAL_ESTATE_USER = "bunood-real-estate-navigation-qa@example.com";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function setup() {
	cleanup();
	return benchPy([
		"roles = [r for r in ('Sales User', 'Purchase User', 'Accounts User') if frappe.db.exists('Role', r)]",
		"if len(roles) != 3:",
		"    raise AssertionError('required operational roles are missing: %s' % roles)",
		"user = frappe.get_doc({'doctype': 'User', 'email': " + JSON.stringify(USER) + ", 'first_name': 'Bunood Navigation QA', 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User', 'language': 'en', 'default_workspace': 'Selling'})",
		"for role in roles:",
		"    user.append('roles', {'role': role})",
		"user.insert(ignore_permissions=True)",
		"frappe.defaults.set_user_default('bnd_home', 'Selling', " + JSON.stringify(USER) + ")",
		"real_estate = frappe.get_doc({'doctype': 'User', 'email': " + JSON.stringify(REAL_ESTATE_USER) + ", 'first_name': 'Bunood Real Estate Navigation QA', 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User', 'language': 'en', 'default_workspace': 'Real Estate'})",
		"real_estate.append('roles', {'role': 'Accounts Manager'})",
		"real_estate.insert(ignore_permissions=True)",
		"frappe.defaults.set_user_default('bnd_home', 'Real Estate', " + JSON.stringify(REAL_ESTATE_USER) + ")",
		"frappe.db.commit()",
		"frappe.clear_cache(user=" + JSON.stringify(USER) + ")",
		"frappe.clear_cache(user=" + JSON.stringify(REAL_ESTATE_USER) + ")",
		"print('ready')",
	].join("\n") + "\n");
}

function cleanup() {
	return benchPy([
		"for user in (" + JSON.stringify(USER) + ", " + JSON.stringify(REAL_ESTATE_USER) + "):",
		"    if frappe.db.exists('User', user):",
		"        frappe.delete_doc('User', user, force=True, ignore_permissions=True)",
		"frappe.db.commit()",
		"frappe.clear_cache()",
		"print('clean')",
	].join("\n") + "\n");
}

function setLanguage(language, user = USER) {
	return benchPy([
		"frappe.db.set_value('User', " + JSON.stringify(user) + ", 'language', " + JSON.stringify(language) + ", update_modified=False)",
		"frappe.db.commit()",
		"frappe.clear_cache(user=" + JSON.stringify(user) + ")",
		"print('language')",
	].join("\n") + "\n");
}

function storedPaneState() {
	return benchPy(
		"print(frappe.defaults.get_user_default('bnd_pane_state', " + JSON.stringify(USER) + ") or '')\n"
	).trim().split(/\r?\n/).pop();
}

async function contextFor(browser, width, height, user = USER) {
	const context = await browser.newContext({ viewport: { width, height } });
	await context.addCookies([
		{ name: "sid", value: mintSid(user), domain: new URL(URL_BASE).hostname, path: "/" },
	]);
	return context;
}

function collectErrors(page) {
	const errors = [];
	const noise = /socket\.io|Invalid origin/i;
	page.on("console", message => {
		if (message.type() === "error" && !noise.test(message.text())) errors.push(message.text());
	});
	page.on("pageerror", error => errors.push("pageerror: " + String(error)));
	return errors;
}

async function openDeskPage(page, route = "/desk/home") {
	await page.goto(URL_BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForSelector("body", { timeout: 30000 });
	await page.waitForFunction(
		() => window.frappe?.boot && window.bunood_theme?.pane_state,
		null,
		{ timeout: 30000 },
	);
	await page.waitForTimeout(1200);
}

async function paneSnapshot(page) {
	return page.evaluate(() => {
		const container = document.querySelector(".body-sidebar-container");
		const toggles = [...document.querySelectorAll(
			".bnd-topbar .bnd-topbar-sidebar-toggle, .page-head .bnd-pagehead-sidebar-toggle"
		)];
		const visible = node => {
			if (!node) return false;
			const style = getComputedStyle(node);
			return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
		};
		return {
			state: document.documentElement.getAttribute("data-bnd-sb-panestate"),
			direction: getComputedStyle(document.documentElement).direction,
			paneVisible: visible(container),
			width: container ? Math.round(container.getBoundingClientRect().width) : 0,
			toggles: toggles.filter(visible).length,
			nativeCompetitors: [...document.querySelectorAll(".body-sidebar-container .collapse-sidebar-link")].filter(visible).length,
			arrow: toggles.find(visible)?.dataset.bndArrow || "",
		};
	});
}

async function clickPaneToggle(page, expected) {
	await page.locator(
		".bnd-topbar .bnd-topbar-sidebar-toggle:visible, .page-head .bnd-pagehead-sidebar-toggle:visible"
	).click();
	await page.waitForFunction(
		state => document.documentElement.getAttribute("data-bnd-sb-panestate") === state,
		expected,
		{ timeout: 10000 },
	);
	await page.waitForTimeout(450);
	return paneSnapshot(page);
}

async function assertDesktopCycle(page, direction) {
	await page.evaluate(() => window.bunood_theme.pane_state("Open"));
	await page.waitForTimeout(350);
	let shot = await paneSnapshot(page);
	assert(shot.direction === direction, "expected " + direction + ", got " + JSON.stringify(shot));
	assert(shot.state === "open" && shot.paneVisible && shot.width > 150, "Open is not a full pane: " + JSON.stringify(shot));
	assert(shot.toggles === 1 && shot.nativeCompetitors === 0, "desktop must expose one control: " + JSON.stringify(shot));
	assert(shot.arrow === "start", "Open arrow must point to logical start: " + JSON.stringify(shot));

	shot = await clickPaneToggle(page, "hidden");
	assert(!shot.paneVisible && shot.toggles === 1, "Hidden must remove the pane and keep one recovery control: " + JSON.stringify(shot));
	assert(shot.arrow === "end", "Hidden arrow must point toward logical end: " + JSON.stringify(shot));

	shot = await clickPaneToggle(page, "open");
	assert(shot.paneVisible && shot.width > 150 && shot.toggles === 1, "cycle did not return to Open: " + JSON.stringify(shot));
}

async function assertAppsHomeHistory(page) {
	await page.evaluate(() => window.bunood_theme.pane_state("Hidden", { persist: true }));
	await page.waitForTimeout(600);
	await page.goto(URL_BASE + "/desk/desktop", { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForSelector('[data-bnd-part="home"]', { timeout: 30000 });
	const homes = page.locator('[data-bnd-part="home"]:visible');
	assert(await homes.count() === 1, "All Apps must expose exactly one visible Home action");
	const privateNavbar = page.locator(".desktop-navbar:visible");
	const navbarHome = page.locator(".desktop-navbar .bnd-desktop-native-home:visible");
	if (await privateNavbar.count()) {
		assert(await navbarHome.count() === 1, "Visible Desktop navbar must own the All Apps Home route");
		assert(await page.locator(".desktop-navbar .navbar-home:visible").count() === 0,
			"Frappe's self-linking cube must stand down after Bunood Home mounts");
	} else {
		assert(await navbarHome.count() === 0 &&
			await page.locator(".bnd-topbar [data-bnd-part='home']:visible, .bnd-statusbar [data-bnd-part='home']:visible, .bnd-dock [data-bnd-part='home']:visible").count() === 1,
			"A Bunood-owned Desktop shell must expose the only Home route");
	}
	const homeGeometry = await homes.evaluate(node => {
		const rect = node.getBoundingClientRect();
		return { y: Math.round(rect.y), width: Math.round(rect.width), label: node.getAttribute("aria-label") || "" };
	});
	assert(homeGeometry.width >= 40 && homeGeometry.label,
		"All Apps Home has wrong geometry or accessible name: " + JSON.stringify(homeGeometry));
	await homes.click();
	await page.waitForURL(/\/desk\/selling(?:[/?#]|$)/, { timeout: 20000 });
	assert((await paneSnapshot(page)).state === "hidden", "Apps to Home lost the per-user pane state");

	await page.goBack({ waitUntil: "domcontentloaded" });
	await page.waitForURL(/\/desk\/desktop(?:[/?#]|$)/, { timeout: 20000 });
	assert(await page.locator('[data-bnd-part="home"]:visible').count() === 1, "Back navigation lost the Home return");
	await page.goForward({ waitUntil: "domcontentloaded" });
	await page.waitForURL(/\/desk\/selling(?:[/?#]|$)/, { timeout: 20000 });
	assert((await paneSnapshot(page)).state === "hidden", "Forward navigation lost sidebar state");
	assert(storedPaneState() === "Hidden", "the settled desktop state was not stored for the fixture user");
}

async function visibleDesktopTiles(page) {
	await page.goto(URL_BASE + "/desk/desktop", { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForSelector(".desktop-wrapper .desktop-icon:visible", { timeout: 30000 });
	await page.waitForTimeout(900);
	return page.locator(".desktop-wrapper .desktop-icon:visible").evaluateAll(nodes =>
		nodes.map(node => node.getAttribute("data-id") || node.textContent.trim())
	);
}

async function assertRoleHomes(browser) {
	const profiles = [
		{ user: USER, route: "selling", workspace: "Selling", required: "Selling", forbidden: ["Real Estate", "Framework", "Build", "Users"] },
		{ user: REAL_ESTATE_USER, route: "real-estate", workspace: "Real Estate", required: "Real Estate", forbidden: ["Selling", "Framework", "Build", "Users"] },
	];
	for (const profile of profiles) {
		const context = await contextFor(browser, 1440, 900, profile.user);
		const page = await context.newPage();
		const errors = collectErrors(page);
		try {
			await openDeskPage(page, "/desk");
			await page.waitForTimeout(1200);
			const landing = new RegExp("/desk/(?:"
				+ profile.route + "|Workspaces/" + profile.workspace.replace(/ /g, "(?:%20| )") + ")(?:[/?#]|$)", "i");
			assert(landing.test(new URL(page.url()).pathname),
				profile.user + " landed on the wrong role Home: " + page.url());
			const tiles = await visibleDesktopTiles(page);
			assert(tiles.includes(profile.required), profile.user + " cannot see its required role workspace: " + JSON.stringify(tiles));
			for (const name of profile.forbidden) {
				assert(!tiles.includes(name), profile.user + " sees out-of-profile or technical workspace " + name + ": " + JSON.stringify(tiles));
			}
			const home = page.locator('[data-bnd-part="home"]:visible');
			assert(await home.count() === 1, profile.user + " does not have one Home action on All Apps");
			await home.click();
			await page.waitForURL(landing, { timeout: 20000 });
			assert(errors.length === 0, profile.user + " browser errors: " + JSON.stringify(errors));
		} finally {
			await context.close();
		}
	}

	const admin = await contextFor(browser, 1440, 900, "Administrator");
	const page = await admin.newPage();
	try {
		const tiles = await visibleDesktopTiles(page);
		assert(tiles.includes("Framework") && tiles.includes("Real Estate"),
			"System Manager must retain technical and product Apps: " + JSON.stringify(tiles));
	} finally {
		await admin.close();
	}
}

async function assertRealEstateOperationalHome(browser) {
	const expected = {
		en: ["Property and unit", "Customer to lease", "Lease to collection", "Deposits", "Owner settlement", "Renewal and termination"],
		ar: ["العقارات والوحدات", "من العميل إلى عقد الإيجار", "من عقد الإيجار إلى التحصيل", "التأمينات", "تسوية مستحقات المُلّاك", "التجديد والإنهاء"],
	};
	for (const [language, labels] of Object.entries(expected)) {
		setLanguage(language, REAL_ESTATE_USER);
		const context = await contextFor(browser, 1440, 900, REAL_ESTATE_USER);
		const page = await context.newPage();
		const errors = collectErrors(page);
		try {
			await openDeskPage(page, "/desk/real-estate");
			await page.waitForSelector(".bnd-home-dashboard .bnd-home-lane-title:visible", { timeout: 30000 });
			const rendered = await page.locator(".bnd-home-dashboard .bnd-home-lane-title:visible").evaluateAll(nodes =>
				nodes.map(node => ({
					text: node.textContent.trim(),
					fits: node.scrollWidth <= node.clientWidth + 1,
				}))
			);
			assert(
				JSON.stringify(rendered.map(item => item.text)) === JSON.stringify(labels),
				language + " Real Estate process-lane order is wrong: " + JSON.stringify(rendered)
			);
			assert(
				rendered.every(item => item.fits),
				language + " Real Estate process-lane label overlaps or truncates: " + JSON.stringify(rendered)
			);
			assert(await page.locator(".editor-js-container:visible").count() === 0,
				language + " legacy Workspace cards compete with the approved operational Home");
			assert(errors.length === 0, language + " Real Estate browser errors: " + JSON.stringify(errors));
		} finally {
			await context.close();
		}
	}
}

async function assertRoleTaskReachability(browser) {
	setLanguage("en", USER);
	const erpContext = await contextFor(browser, 1440, 900, USER);
	const erpPage = await erpContext.newPage();
	const erpErrors = collectErrors(erpPage);
	try {
		await openDeskPage(erpPage, "/desk/selling");
		await erpPage.evaluate(() => window.bunood_theme.pane_state("Open"));
		await erpPage.waitForTimeout(400);
		const labels = await erpPage.locator(".body-sidebar-container a:visible").evaluateAll(nodes =>
			nodes.map(node => node.textContent.replace(/\s+/g, " ").trim())
		);
		for (const task of ["Selling", "Buying", "Stock", "Invoicing"]) {
			assert(labels.some(label => label === task),
				"ERP daily destination is not one click from Home: " + task + " in " + JSON.stringify(labels));
		}
		const reportsOpened = await erpPage.locator(".body-sidebar-container a:visible").evaluateAll(nodes => {
			const node = nodes.find(item => item.textContent.replace(/\s+/g, " ").trim() === "Reports");
			if (!node) return false;
			node.click();
			return true;
		});
		assert(reportsOpened, "ERP Reports group is not one click from Home: " + JSON.stringify(labels));
		await erpPage.waitForTimeout(250);
		const expandedLabels = await erpPage.locator(".body-sidebar-container a:visible").evaluateAll(nodes =>
			nodes.map(node => node.textContent.replace(/\s+/g, " ").trim())
		);
		assert(expandedLabels.includes("Financial Reports"),
			"Financial Reports is not reachable in two clicks through Reports: " + JSON.stringify(expandedLabels));
		assert(erpErrors.length === 0, "ERP task-reachability browser errors: " + JSON.stringify(erpErrors));
	} finally {
		await erpContext.close();
	}

	setLanguage("en", REAL_ESTATE_USER);
	const realEstateContext = await contextFor(browser, 1440, 900, REAL_ESTATE_USER);
	const realEstatePage = await realEstateContext.newPage();
	const realEstateErrors = collectErrors(realEstatePage);
	try {
		await openDeskPage(realEstatePage, "/desk/real-estate");
		await realEstatePage.waitForSelector(".bnd-home-actions-panel .bnd-home-action:visible", { timeout: 30000 });
		const actions = await realEstatePage.locator(".bnd-home-actions-panel .bnd-home-action:visible").evaluateAll(nodes =>
			nodes.map(node => ({
				label: node.textContent.replace(/\s+/g, " ").trim(),
				hasIcon: !!node.querySelector("svg use"),
			}))
		);
		assert(
			JSON.stringify(actions.map(item => item.label)) === JSON.stringify(
				["New property", "New unit", "Start a lease", "Prepare billing", "Record collection"]
			),
			"Real Estate frequent actions are not the five one-click tasks: " + JSON.stringify(actions)
		);
		assert(actions.every(item => item.hasIcon),
			"Real Estate frequent actions are missing icons: " + JSON.stringify(actions));
		assert(realEstateErrors.length === 0,
			"Real Estate task-reachability browser errors: " + JSON.stringify(realEstateErrors));
	} finally {
		await realEstateContext.close();
	}
}

async function assertMobile(browser) {
	const context = await contextFor(browser, 430, 900);
	const page = await context.newPage();
	const errors = collectErrors(page);
	try {
		await openDeskPage(page);
		const state = await page.evaluate(() => {
			const visible = node => {
				if (!node) return false;
				const style = getComputedStyle(node);
				return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
			};
			const mobileCells = [...document.querySelectorAll(
				'.bnd-statusbar [data-bnd-part="home"], .bnd-statusbar [data-bnd-part="apps"], .bnd-statusbar [data-bnd-part="search"], .bnd-statusbar [data-bnd-part="user"]'
			)].filter(visible);
			const widths = mobileCells.map(node => Math.round(node.getBoundingClientRect().width));
			const icons = mobileCells.map(node => {
				const icon = node.querySelector("svg, .avatar");
				if (!icon) return 0;
				const rect = icon.getBoundingClientRect();
				return Math.round(Math.max(rect.width, rect.height));
			});
			return {
				bunoodToggles: document.querySelectorAll(".bnd-pagehead-sidebar-toggle, .bnd-topbar-sidebar-toggle").length,
				nativeToggle: visible(document.querySelector(".page-head .sidebar-toggle-btn")),
				narrow: document.documentElement.hasAttribute("data-bnd-narrow"),
				state: document.documentElement.getAttribute("data-bnd-sb-panestate"),
				mobileCells: mobileCells.length,
				widthSpread: widths.length ? Math.max(...widths) - Math.min(...widths) : null,
				iconSpread: icons.length ? Math.max(...icons) - Math.min(...icons) : null,
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		assert(
			state.narrow && state.bunoodToggles === 0 && !state.nativeToggle,
			"mobile must not expose a competing sidebar toggle: " + JSON.stringify(state)
		);
		assert(
			state.mobileCells === 4 && state.widthSpread <= 2 && state.iconSpread <= 2,
			"mobile navigation cells are not uniform: " + JSON.stringify(state)
		);
		assert(state.overflow <= 1, "mobile shell overflows: " + JSON.stringify(state));
		assert(storedPaneState() === "Hidden", "loading mobile changed the desktop preference");

		// The Apps route has its own native navbar and desktop-home ownership
		// stamps. Those desktop-only rules once hid the mobile Home destination
		// and left a three-cell bar shifted by one sidebar width. Exercise the
		// actual transition rather than accepting only the Home route.
		await page.locator('.bnd-statusbar [data-bnd-part="apps"]:visible').click();
		await page.waitForURL(/\/desk\/desktop(?:[/?#]|$)/, { timeout: 20000 });
		await page.waitForSelector(".desktop-wrapper .desktop-icon:visible", { timeout: 30000 });
		await page.waitForTimeout(600);
		const appsState = await page.evaluate(() => {
			const visible = node => {
				if (!node) return false;
				const style = getComputedStyle(node);
				return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
			};
			const bar = document.querySelector(".bnd-statusbar");
			const barRect = bar?.getBoundingClientRect();
			const cells = [...document.querySelectorAll(
				'.bnd-statusbar [data-bnd-part="home"], .bnd-statusbar [data-bnd-part="apps"], ' +
				'.bnd-statusbar [data-bnd-part="search"], .bnd-statusbar [data-bnd-part="user"]'
			)].filter(visible);
			const widths = cells.map(node => node.getBoundingClientRect().width);
			const main = document.querySelector(".main-section");
			if (main) main.scrollTop = main.scrollHeight;
			const tiles = [...document.querySelectorAll(".desktop-wrapper .desktop-icon")].filter(visible);
			const lastRect = tiles.at(-1)?.getBoundingClientRect();
			return {
				parts: cells.map(node => node.dataset.bndPart).sort(),
				widthSpread: widths.length ? Math.max(...widths) - Math.min(...widths) : null,
				barLeft: barRect?.left,
				barRight: barRect?.right,
				viewportWidth: innerWidth,
				current: document.querySelector('.bnd-statusbar [aria-current="page"]')?.dataset.bndPart || "",
				lastBottom: lastRect?.bottom,
				barTop: barRect?.top,
			};
		});
		assert(
			JSON.stringify(appsState.parts) === JSON.stringify(["apps", "home", "search", "user"]) &&
			appsState.widthSpread <= 2,
			"Apps route lost the four equal mobile destinations: " + JSON.stringify(appsState)
		);
		assert(
			Math.abs(appsState.barLeft) <= 1 && Math.abs(appsState.barRight - appsState.viewportWidth) <= 1,
			"Apps route mobile bar does not span the viewport: " + JSON.stringify(appsState)
		);
		assert(appsState.current === "apps", "Apps route current marker is wrong: " + JSON.stringify(appsState));
		assert(
			appsState.lastBottom <= appsState.barTop + 1,
			"Apps grid cannot scroll its final card above the mobile bar: " + JSON.stringify(appsState)
		);
		assert(errors.length === 0, "mobile browser errors: " + JSON.stringify(errors));
	} finally {
		await context.close();
	}
}

let browser;
try {
	setup();
	browser = await chromium.launch(browserLaunchOptions());

	const english = await contextFor(browser, 1440, 900);
	const page = await english.newPage();
	const errors = collectErrors(page);
	await openDeskPage(page);
	await assertDesktopCycle(page, "ltr");
	await assertAppsHomeHistory(page);
	assert(errors.length === 0, "English desktop browser errors: " + JSON.stringify(errors));
	await english.close();

	setLanguage("ar");
	const arabic = await contextFor(browser, 1024, 800);
	const arabicPage = await arabic.newPage();
	const arabicErrors = collectErrors(arabicPage);
	await openDeskPage(arabicPage);
	await assertDesktopCycle(arabicPage, "rtl");
	await arabicPage.evaluate(() => window.bunood_theme.pane_state("Hidden", { persist: true }));
	await arabicPage.waitForTimeout(600);
	assert(arabicErrors.length === 0, "Arabic desktop browser errors: " + JSON.stringify(arabicErrors));
	await arabic.close();

	await assertMobile(browser);
	await assertRoleHomes(browser);
	await assertRealEstateOperationalHome(browser);
	await assertRoleTaskReachability(browser);
	console.log(JSON.stringify({
		status: "passed",
		user: USER,
		states: ["Open", "Hidden", "Open"],
		directions: ["ltr", "rtl"],
		viewports: ["1440x900", "1024x800", "430x900"],
		apps_home_history: "passed",
		role_homes: ["Selling", "Real Estate"],
		real_estate_process_lanes: ["Property and unit", "Customer to lease", "Lease to collection", "Deposits", "Owner settlement", "Renewal and termination"],
		real_estate_languages: ["en", "ar"],
		top_tasks: { erp: 5, real_estate: 5, maximum_clicks: 2 },
		ordinary_apps: "curated",
		system_manager_apps: "unrestricted",
		persistence: storedPaneState(),
	}, null, 2));
} finally {
	if (browser) await browser.close();
	cleanup();
}
