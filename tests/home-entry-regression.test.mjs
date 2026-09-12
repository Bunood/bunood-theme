import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readTranslations } from "../tools/i18n.mjs";

// Rendered Home and Bill Workbench labels bypass the literal-only extractor
// through helpers/profile data. Keep this observed regression covered without
// pretending the general catalogue gate sees every dynamically supplied label.
const required = [
	"New sales invoice", "Record a purchase", "Receive payment", "Stock entry", "New customer",
	"Your business at a glance", "Financial summary", "Outstanding receivables",
	"Orders", "Booked value", "Invoiced value", "Average order value", "Month to date", "As of today",
	"Outstanding payables", "Needs your attention", "What to deal with today", "Overdue invoices",
	"Bills to pay", "Drafts to finish", "Nothing needs your attention", "No documents you can create yet",
	"Recent activity", "Latest invoices", "No recent activity", "Sales trend", "Last six months",
	"Invoice status", "Current sales invoices", "No invoice data yet", "Could not load dashboard data",
	"Refresh progress", "Refreshing progress", "Progress refreshed", "Setup is complete",
	"Could not refresh progress. Try again.",
	"Sales bill", "Who are you billing?", "What are you selling?",
	"Purchase bill", "Who are you buying from?", "What are you buying?",
	"Notification", "Notifications", "Notification Picker", "Notification Style",
	"Notification settings", "Notifications Placement",
];

test("observed Home and invoice labels have shipped Arabic translations", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	const missing = required.filter(key => !/[\u0600-\u06ff]/u.test(translations.get(key) || ""));
	assert.deepEqual(missing, []);
});

test("notification labels use consistent Arabic product wording", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	assert.equal(translations.get("Notification"), "إشعار");
	assert.equal(translations.get("Notifications"), "إشعارات");
	assert.equal(translations.get("Notification Picker"), "منتقي الإشعارات");
	assert.equal(translations.get("Notification Style"), "نمط الإشعارات");
	assert.equal(translations.get("Notification settings"), "إعدادات الإشعارات");
	assert.equal(translations.get("Notifications Placement"), "موضع الإشعارات");
});

test("Purchase Invoice does not inherit the incorrect outstanding translation", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	assert.equal(translations.get("Update Outstanding for Self"), "تحديث المتبقي على هذا المستند");
});

test("browser fixture users cannot leave asynchronous Contact jobs behind", () => {
	for (const path of ["../tools/desk-fixture.mjs", "../tools/portal-fixtures.mjs"]) {
		const source = readFileSync(new URL(path, import.meta.url), "utf8");
		assert.match(source, /was_in_test = frappe\.in_test\s+frappe\.in_test = True/);
		assert.match(source, /frappe\.in_test = was_in_test/);
	}
});

test("Home actions can wrap inside their available width", () => {
	const source = readFileSync(new URL("../bunood_theme/public/scss/surfaces/_home.scss", import.meta.url), "utf8");
	const rule = source.match(/\.bnd-home-intro-actions\s*\{([^}]+)\}/)?.[1] || "";
	assert.match(rule, /flex-wrap:\s*wrap\s*;/);
	assert.match(rule, /max-inline-size:\s*100%\s*;/);
	// This guards the source rule only. Real clipping is checked in the browser.
});

test("the native All Apps navbar receives one permanent Home route", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /function sync_native_desktop_home\(\)/);
	assert.match(source, /\.desktop-navbar \.bnd-desktop-native-home/);
	assert.match(source, /data-bnd-part="home".*not\(\.bnd-desktop-native-home\)/);
	assert.match(source, /brand\.insertAdjacentElement\("afterend", button\)/);
	assert.match(source, /build_quick_link\("home", true\)/);
	const shell = source.slice(source.indexOf("function sync_desktop_shell()"), source.indexOf("function desktop_symbol"));
	assert.ok(
		shell.indexOf("sync_native_desktop_home") < shell.indexOf("if (!bar) return"),
		"the native fallback must run even when no Bunood status bar exists",
	);
});

test("a personal workspace route runs before the Bunood Home fallback", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const personal = source.indexOf("if (!apply_home_route()) land_on_home();");
	assert.notEqual(personal, -1, "mount must give the personal route first refusal");
	const mount = source.indexOf("function mount_chrome()");
	const router = source.indexOf('frappe.router.on("change"', mount);
	assert.ok(personal > mount && personal < router, "the ordering guard belongs to initial mount");
	assert.match(source, /frappe\.after_ajax\(\(\) => frappe\.set_route\("Workspaces", home\)\);\s*return true;/);
});

test("Frappe's missing RTL shortcut arrow receives a verified local alias", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /target = "es-line-arrow-up-left"/);
	assert.match(source, /getElementById\("icon-arrow-up-left"\)/);
	assert.match(source, /source\.parentNode\.appendChild\(alias\)/);
	assert.match(source, /if \(!theme_active\(\)\) return;\s*ensure_vendor_symbols\(\);/);
});
