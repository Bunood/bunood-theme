/**
 * Focused rendered acceptance for the two operational role homes.
 *
 * Creates two run-owned temporary users, verifies the shared hierarchy on desktop,
 * verifies the Real Estate home in Arabic at phone width, confirms that
 * infrastructure health is absent for ordinary roles and present for the
 * Administrator, then removes both users.
 */
import { createRequire } from "node:module";
import { benchPy, mintSid, URL_BASE } from "./session.mjs";
import { browserLaunchOptions } from "./browser.mjs";
import { RunOwnedUserFixtures } from "./run-owned-users.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const fixtureUsers = new RunOwnedUserFixtures(benchPy);
const ERP_USER = fixtureUsers.users.erp.email;
const RE_USER = fixtureUsers.users.realEstate.email;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function cleanup() {
	return fixtureUsers.cleanup();
}

function setup() {
	fixtureUsers.preflight();
	fixtureUsers.create(fixtureUsers.users.erp);
	fixtureUsers.create(fixtureUsers.users.realEstate);
}

function setLanguage(user, language) {
	return benchPy([
		"frappe.db.set_value('User', " + JSON.stringify(user) + ", 'language', " + JSON.stringify(language) + ", update_modified=False)",
		"frappe.db.commit()",
		"frappe.clear_cache(user=" + JSON.stringify(user) + ")",
		"print('language')",
	].join("\n") + "\n");
}

async function contextFor(browser, user, viewport) {
	const context = await browser.newContext({ viewport });
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

async function openHome(page, route) {
	await page.goto(URL_BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForSelector(".bnd-home-dashboard .bnd-home-metric", { timeout: 30000 });
	await page.waitForTimeout(700);
}

async function snapshot(page) {
	return page.evaluate(() => {
		const root = document.querySelector(".bnd-home-dashboard");
		const names = [...root.children].map(node => {
			if (node.matches(".bnd-home-intro")) return "intro";
			if (node.matches(".bnd-home-attn-panel")) return "attention";
			if (node.matches(".bnd-home-summary")) return "kpis";
			if (node.matches(".bnd-home-process-panel")) return "process";
			if (node.matches(".bnd-home-actions-panel")) return "actions";
			if (node.matches(".bnd-home-recent-panel")) return "recent";
			if (node.matches(".bnd-home-reports-panel")) return "reports";
			if (node.matches(".bnd-home-setup-panel")) return "setup";
			return node.className;
		});
		return {
			order: names,
			kpis: root.querySelectorAll(".bnd-home-metric").length,
			lanes: [...root.querySelectorAll(".bnd-home-lane-title")].map(node => node.textContent.trim()),
			reports: root.querySelectorAll(".bnd-home-reports-panel .bnd-home-link-actions .bnd-home-action").length,
			allowedReports: Object.keys(frappe.boot.allowed_reports || {}),
			attention: root.querySelector(".bnd-home-attn-list")?.textContent.trim() || "",
			health: root.querySelector(".bnd-home-health")?.textContent.trim() || "",
			direction: getComputedStyle(document.documentElement).direction,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});
}

async function checkOrdinary(browser, user, route, expectedLanes) {
	const context = await contextFor(browser, user, { width: 1440, height: 900 });
	const page = await context.newPage();
	const errors = collectErrors(page);
	try {
		await openHome(page, route);
		const shot = await snapshot(page);
		assert(JSON.stringify(shot.order) === JSON.stringify([
			"intro", "attention", "kpis", "process", "actions", "recent", "reports", "setup",
		]), "wrong role-home order: " + JSON.stringify(shot));
		assert(shot.kpis === 5, "role home must show exactly five KPIs: " + JSON.stringify(shot));
		assert(shot.lanes.length === expectedLanes, "wrong process lane count: " + JSON.stringify(shot));
		assert(shot.reports > 0, "role home has no permission-allowed report action: " + JSON.stringify(shot));
		assert(shot.attention.length > 0, "attention must show work or an explicit success state");
		assert(!shot.health, "ordinary role received infrastructure health: " + JSON.stringify(shot));
		assert(shot.overflow <= 1, "desktop role home overflows horizontally: " + JSON.stringify(shot));
		assert(errors.length === 0, "browser errors: " + JSON.stringify(errors));
	} finally {
		await context.close();
	}
}

async function checkArabicPhone(browser) {
	setLanguage(RE_USER, "ar");
	const context = await contextFor(browser, RE_USER, { width: 430, height: 900 });
	const page = await context.newPage();
	const errors = collectErrors(page);
	try {
		await openHome(page, "/desk/real-estate");
		const shot = await snapshot(page);
		assert(shot.direction === "rtl", "Arabic role home is not RTL: " + JSON.stringify(shot));
		assert(shot.kpis === 5 && shot.lanes.length === 6, "Arabic phone lost operational content: " + JSON.stringify(shot));
		assert(shot.lanes.includes("العقارات والوحدات"), "Arabic process copy did not load: " + JSON.stringify(shot));
		assert(shot.overflow <= 1, "phone role home overflows horizontally: " + JSON.stringify(shot));
		assert(errors.length === 0, "Arabic phone browser errors: " + JSON.stringify(errors));
	} finally {
		await context.close();
		setLanguage(RE_USER, "en");
	}
}

async function checkAdministrator(browser) {
	const context = await contextFor(browser, "Administrator", { width: 1440, height: 900 });
	const page = await context.newPage();
	const errors = collectErrors(page);
	try {
		await openHome(page, "/desk/home");
		const shot = await snapshot(page);
		assert(shot.health.includes("Failed jobs today"), "System Manager health center is missing: " + JSON.stringify(shot));
		assert(errors.length === 0, "Administrator browser errors: " + JSON.stringify(errors));
	} finally {
		await context.close();
	}
}

let browser;
try {
	setup();
	browser = await chromium.launch(browserLaunchOptions());
	await checkOrdinary(browser, ERP_USER, "/desk/selling", 4);
	await checkOrdinary(browser, RE_USER, "/desk/real-estate", 6);
	await checkArabicPhone(browser);
	await checkAdministrator(browser);
	console.log(JSON.stringify({
		status: "passed",
		role_homes: ["ERP", "Real Estate"],
		viewports: ["1440x900", "430x900"],
		languages: ["en", "ar"],
		kpis_per_home: 5,
		ordinary_infrastructure_counters: 0,
	}, null, 2));
} finally {
	if (browser) await browser.close();
	cleanup();
}
