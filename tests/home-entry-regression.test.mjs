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
	"Active properties", "Available units", "Active leases", "Billing due", "Overdue collections",
	"Sales drafts", "Purchase drafts", "Overdue receivables", "Payables due soon",
	"Stock below reorder", "VAT and ZATCA exceptions", "Setup gaps", "Leases expiring",
	"Collections overdue", "Deposits needing action", "Ejar exceptions",
	"Owner payouts awaiting release", "Process lanes", "Frequent actions",
	"Setup and administration", "Latest real estate activity", "Latest invoices and bills",
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

test("role homes share the approved operational hierarchy and select their own API", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const render = source.slice(
		source.indexOf("function home_render_dashboard"),
		source.indexOf("function home_render_error"),
	);
	const order = [
		"home_attention_panel(data)",
		'const summary = el("section", "bnd-home-summary"',
		"home_process_panel(profile)",
		'const tasks = home_panel(__("Frequent actions")',
		"root.appendChild(recent.panel)",
		'const reports = home_panel("Reports"',
		"home_setup_panel(data)",
	].map(part => render.indexOf(part));
	assert.ok(order.every(index => index >= 0), "every operational section is rendered");
	assert.deepEqual([...order].sort((a, b) => a - b), order, "operational sections keep the approved order");
	assert.match(source, /bunood_real_estate\.real_estate\.home\.get_operational_home/);
	assert.match(source, /bunood_theme\.api\.get_home_dashboard/);
	assert.match(source, /if \(!on_role_home_route\(\)\)/);
});

test("ordinary home queues route to the exact server-supplied list filters", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /queue\.route[\s\S]+frappe\.set_route\(\.\.\.queue\.route\)[\s\S]+frappe\.set_route\("List", queue\.doctype, queue\.filters \|\| \{\}\)/);
	assert.match(source, /HOME_COPY\[queue\.key\]/);
	assert.match(source, /HOME_COPY\[metric\.key\]/);
});

test("role-home reports preserve Frappe's permission-filtered pre-navigation snapshot", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const capture = source.indexOf("const HOME_ALLOWED_REPORTS = allowed_report_names()");
	const replacement = source.indexOf("prepare_home_sidebar();");
	assert.ok(capture >= 0 && capture < replacement, "report permission snapshot must precede sidebar replacement");
	assert.match(source, /Object\.keys\(boot\?\.allowed_reports \|\| \{\}\)/);
	assert.match(source, /return HOME_ALLOWED_REPORTS\.has\(report\)/);
});

test("ordinary role homes cannot render infrastructure health without the server field", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /if \(data\.admin_health\)/);
	assert.doesNotMatch(source, /frappe\.boot\.(?:scheduler|workers|queues)/);
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
