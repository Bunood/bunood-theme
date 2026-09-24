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
	"Invoicing",
	"Your business at a glance", "Financial summary", "Outstanding receivables",
	"Orders", "Booked value", "Invoiced value", "Average order value", "Month to date", "As of today",
	"Outstanding payables", "Needs your attention", "What to deal with today", "Overdue invoices",
	"Bills to pay", "Drafts to finish", "Nothing needs your attention", "No documents you can create yet",
	"Recent activity", "Latest invoices", "No recent activity", "Sales trend", "Last six months",
	"Invoice status", "Current sales invoices", "No invoice data yet", "Could not load dashboard data",
	"Refresh progress", "Refreshing progress", "Progress refreshed", "Setup is complete",
	"Could not refresh progress. Try again.",
	"Unsaved changes", "Discard changes and switch",
	"Sales bill", "Who are you billing?", "What are you selling?",
	"Purchase bill", "Who are you buying from?", "What are you buying?",
	"Notification", "Notifications", "Notification Picker", "Notification Style",
	"Notification settings", "Notifications Placement",
	"Active properties", "Available units", "Active leases", "Billing due", "Overdue collections",
	"Sales drafts", "Purchase drafts", "Overdue receivables", "Payables due soon",
	"Stock below reorder", "VAT and ZATCA exceptions", "Setup gaps", "Leases expiring",
	"Collections overdue", "Deposits needing action", "Ejar exceptions",
	"Owner payouts awaiting release", "Process lanes", "Frequent actions",
	"Open quotations", "Quotation drafts", "Payment drafts", "Quick filters",
	"Awaiting response", "Expiring soon", "This month",
	"Setup and administration", "Latest real estate activity", "Latest invoices and bills",
	"Property operations needing attention", "Leases, billing, collections and owner obligations",
	"Property and lease lifecycle", "Move work from property setup through settlement",
	"Property management setup", "Portfolio rules, accounts and operating defaults",
	"Real estate operations", "Portfolio, leases, billing and collections in one place",
	"Property actions", "Start the property work you do most often", "Portfolio overview",
	"Live operating position across properties and leases", "Property reports",
	"Open portfolio, lease and owner reporting",
];

test("observed Home and invoice labels have shipped Arabic translations", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	const missing = required.filter(key => !/[\u0600-\u06ff]/u.test(translations.get(key) || ""));
	assert.deepEqual(missing, []);
});

test("the Invoicing workspace uses the reviewed Arabic accounting label", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	assert.equal(translations.get("Invoicing"), "الفوترة");
});

test("daily ERP workspaces do not expose untranslated onboarding vocabulary", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	const expected = {
		"Selling Setup": "إعداد المبيعات",
		"Buying Setup": "إعداد المشتريات",
		"Stock Setup": "إعداد المخزون",
		"Accounting Onboarding": "إعداد المحاسبة",
		"Create Customer": "إنشاء عميل",
		"Create supplier": "إنشاء مورد",
		"Create Item": "إنشاء صنف",
		"View Sales Order Analysis": "عرض تحليل أوامر البيع",
		"Review Selling Settings": "مراجعة إعدادات البيع",
		"View Purchase Order Analysis": "عرض تحليل أوامر الشراء",
		"Review Buying Settings": "مراجعة إعدادات الشراء",
		"Setup Warehouse": "إعداد مستودع",
		"Create Purchase Receipt": "إنشاء استلام مشتريات",
		"Create Delivery Note": "إنشاء إشعار تسليم",
		"View Stock Balance Report": "عرض تقرير رصيد المخزون",
		"Review Stock Settings": "مراجعة إعدادات المخزون",
		"Configure Chart of Accounts": "إعداد شجرة الحسابات",
		"Setup Sales Taxes": "إعداد ضرائب المبيعات",
		"View Balance Sheet": "عرض الميزانية العمومية",
		"Review Accounts Settings": "مراجعة إعدادات الحسابات",
		"Reports & Masters": "التقارير والبيانات الرئيسية",
		"Masters & Reports": "البيانات الرئيسية والتقارير",
		"Item Wise Consumption": "استهلاك الأصناف",
		"Tax Template": "قالب الضريبة",
	};
	for (const [source, arabic] of Object.entries(expected)) assert.equal(translations.get(source), arabic, source);
});

test("encoded workspace headings are localized before EditorJS renders them", () => {
	const boot = readFileSync(new URL("../bunood_theme/boot.py", import.meta.url), "utf8");
	const hooks = readFileSync(new URL("../bunood_theme/hooks.py", import.meta.url), "utf8");
	assert.match(boot, /html\.unescape\(strip_html_tags\(text\)\)/);
	assert.match(boot, /html\.escape\(plain, quote=False\)/);
	assert.match(boot, /_localize_workspace_pages\(getattr\(bootinfo, "workspaces", None\)\)/);
	assert.match(boot, /def get_workspaces\(\):[\s\S]+_localize_workspace_pages\(upstream\(\)\)/);
	assert.match(hooks, /"frappe\.desk\.desktop\.get_workspaces": "bunood_theme\.boot\.get_workspaces"/);
});

test("the sales attention panel includes actionable quotation and unsubmitted-document queues", () => {
	const api = readFileSync(new URL("../bunood_theme/api.py", import.meta.url), "utf8");
	const client = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	for (const key of ["quotation_drafts", "payment_drafts", "open_quotations"]) {
		assert.match(api, new RegExp(`"key": "${key}"`));
		assert.match(client, new RegExp(`${key}:`));
	}
	assert.match(api, /"doctype": "Quotation",[\s\S]+"filters": open_quotation_filters/);
	assert.match(api, /\("Payment Entry", "payment"\)/);
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

test("language switching offers an explicit discard-and-switch override", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /async function switch_language\(code, discard_dirty = false\)/);
	assert.match(source, /if \(dirty && !discard_dirty\)/);
	assert.match(source, /label: __\("Discard changes and switch"\)/);
	assert.match(source, /frappe\.hide_msgprint\(\);[\s\S]+switch_language\(code, true\)/);
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

test("closing Getting Started cannot leave an invisible sidebar shield", () => {
	const source = readFileSync(new URL("../bunood_theme/public/scss/surfaces/_coverage.scss", import.meta.url), "utf8");
	const empty = source.match(/\.user-onboarding:empty\s*\{([^}]+)\}/)?.[1] || "";
	assert.match(empty, /display:\s*none\s*;/);
	assert.match(empty, /pointer-events:\s*none\s*;/);
	assert.match(source, /\.user-onboarding\s*\{[^}]*position:\s*static/s);
	assert.match(source, /\.user-onboarding\s*\{[^}]*pointer-events:\s*none/s);
	assert.match(source, /\.user-onboarding \.onb-panel\s*\{[^}]*position:\s*fixed/s);
	assert.match(source, /\.user-onboarding \.onb-panel\s*\{[^}]*inset-block:\s*auto calc\(var\(--bnd-bottom-reserve\) \+ var\(--bnd-sp-5\)\)/s);
	assert.match(source, /\.user-onboarding \.onb-panel\s*\{[^}]*inset-inline:\s*auto var\(--bnd-sp-5\)/s);
	assert.match(source, /\.user-onboarding \.onb-panel\s*\{[^}]*max-block-size:\s*min\(74dvh, 680px\)/s);
	assert.match(source, /\.user-onboarding \.onb-panel\s*\{[^}]*overflow:\s*hidden/s);
	assert.match(source, /\.onb-header-main\s*\{[^}]*position:\s*relative/s);
	assert.match(source, /\.onb-steps\s*\{[^}]*overflow-y:\s*auto/s);
	assert.match(source, /\.onb-header-actions\s*\{[^}]*display:\s*flex/s);
	assert.match(source, /@include bnd-until\(sm\)/);
	assert.match(source, /\.bnd-stock-setup-glyph\s*\{/);
});

test("Real Estate frequent actions follow native permissions and open the real operator doors", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /\["Lease Wizard", __\("Start a lease"\), [^\n]+, "single"\]/);
	assert.match(source, /\["Revenue Line", __\("Prepare billing"\)/);
	assert.doesNotMatch(source, /\["Billing Claim", __\("Prepare billing"\)/);
	assert.match(source, /const can_write = [^\n]+\.can_write \|\| \[\]/);
	assert.match(source, /mode === "single"[\s\S]+can_write\.includes\(doctype\)/);
	assert.match(source, /mode === "single"[\s\S]+frappe\.set_route\("Form", doctype\)/);
});

test("role homes select their own API and Real Estate has a purpose-built portfolio composition", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const render = source.slice(
		source.indexOf("function home_render_dashboard"),
		source.indexOf("function home_render_error"),
	);
	assert.match(render, /profile === "real_estate" \? __\("Property actions"\)/);
	assert.match(render, /const portfolio = home_panel\(/);
	assert.match(render, /portfolio_body\.append\(summary, attention\)/);
	assert.match(render, /root\.appendChild\(portfolio\.panel\)/);
	assert.match(render, /profile === "real_estate" \? __\("Property reports"\)/);
	assert.match(render, /root\.appendChild\(home_process_panel\(profile, data\)\)/);
	assert.match(render, /root\.appendChild\(recent\.panel\)/);
	assert.match(render, /root\.appendChild\(home_setup_panel\(data\)\)/);
	assert.match(source, /bunood_real_estate\.real_estate\.home\.get_operational_home/);
	assert.match(source, /bunood_theme\.api\.get_home_dashboard/);
	assert.match(source, /const profile = home_profile_for_route\(\);/);
	assert.match(source, /if \(!profile\)/);
	assert.match(source, /function home_profile_for_route\(\)/);
	assert.ok(source.includes('/\\/(?:desk|app)\\/real-estate\\/?$/i.test(location.pathname)'));
	assert.match(source, /ws_route\(workspace\) === ws_route\("Real Estate"\)/);
	assert.match(source, /root\.dataset\.bndHomeProfile === profile/);
	assert.match(source, /root\.dataset\.bndHomeProfile = profile/);
	assert.match(source, /home_profile_for_route\(\) !== profile/);
	assert.match(source, /data\.profile && data\.profile !== profile/);
});

test("the pane has one obvious workspace control and the permanent top bar owns global navigation", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const sidebar = readFileSync(new URL("../bunood_theme/public/scss/chrome/_sidebar.scss", import.meta.url), "utf8");
	const navbar = readFileSync(new URL("../bunood_theme/public/scss/chrome/_navbar.scss", import.meta.url), "utf8");
	const cluster = readFileSync(new URL("../bunood_theme/public/scss/chrome/_cluster.scss", import.meta.url), "utf8");
	assert.match(source, /build_language\(in_topbar \? "top-language" : "language"\)/);
	assert.match(source, /function mount_language_beside_bell\(\)/);
	assert.match(source, /bell\.insertAdjacentElement\("afterend", button\)/);
	assert.match(source, /function mount_topbar_route_tools\(\)/);
	assert.match(source, /bnd-topbar-brand/);
	assert.doesNotMatch(source, /bnd-topbar-workspace/);
	assert.match(source, /tools\.appendChild\(build_topbar_brand\(\)\)/);
	assert.doesNotMatch(source, /build_language\("page-language", "bnd-pagehead-language"\)/);
	assert.doesNotMatch(source, /bnd-pane-language/);
	assert.match(source, /home_profile_for_route\(\) === "erp"/);
	assert.match(sidebar, /\.bnd-sb-head\s*\{[\s\S]*background:\s*var\(--bnd-brand-solid\)/);
	assert.match(sidebar, /\.bnd-sb-head-ico\s*\{[\s\S]*color:\s*var\(--bnd-on-brand\);[\s\S]*--icon-stroke:\s*currentColor;/);
	assert.match(sidebar, /\.bnd-sb-head-ico\s*\{[\s\S]*filter:\s*grayscale\(1\) brightness\(0\) invert\(1\);/);
	assert.match(sidebar, /\.bnd-sb-band\s*\{[\s\S]*order:\s*100;[\s\S]*margin-block-start:\s*auto;/);
	assert.match(navbar, /\.bnd-topbar \.bnd-topbar-route-tools\s*\{/);
	assert.match(cluster, /\.bnd-language-beside-bell\s*\{[\s\S]*\.bnd-lang-code \{ display: inline; \}/);
	assert.match(navbar, /data-bnd-role-home\] \.page-head\s*\{\s*display:\s*none/);
	const breadcrumbs = readFileSync(new URL("../bunood_theme/public/scss/chrome/_breadcrumbs.scss", import.meta.url), "utf8");
	assert.match(breadcrumbs, /#page-Workspaces \.title-area\s*\{[^}]*position:\s*absolute;[^}]*inset-inline:\s*0;[^}]*inline-size:\s*fit-content;[^}]*margin:\s*auto;/s);
	assert.match(sidebar, /\.bnd-home-current \.standard-sidebar-item\.active-sidebar/);
});

test("Home content owns only its real height and the Real Estate command center is responsive", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const styles = readFileSync(new URL("../bunood_theme/public/scss/surfaces/_home.scss", import.meta.url), "utf8");
	const layout = readFileSync(new URL("../bunood_theme/public/scss/chrome/_sidebar-layout.scss", import.meta.url), "utf8");
	const chrome = readFileSync(new URL("../bunood_theme/public/scss/chrome/_layouts.scss", import.meta.url), "utf8");
	assert.match(source, /const HOME_LANE_VISUALS = \{/);
	assert.match(source, /home_icon\(HOME_LANE_VISUALS\[doctype\] \|\| "icon-file", "bnd-home-action-icon"\)/);
	assert.match(styles, /\.bnd-home-dashboard\s*\{[^}]*min-block-size:\s*0;/s);
	assert.match(layout, /\.main-section\s*\{[^}]*overflow:\s*auto;/s);
	assert.match(layout, /\[data-bnd-own~="panetoggle"\]:not\(\[data-bnd-narrow\]\) \.page-title > \.sidebar-toggle-btn/);
	assert.match(chrome, /html\[data-bnd-desk\]\s*\{[^}]*overflow:\s*hidden;/s);
	assert.match(styles, /\.page-container:has\(\.bnd-home-dashboard\)[^{]+\{[^}]*block-size:\s*auto;/s);
	assert.match(styles, /\.bnd-re-portfolio-body\s*\{[^}]*grid-template-columns:/s);
	assert.match(styles, /\.bnd-home-status-total\s*\{[^}]*--bnd-home-status-center-block, 50%[^}]*--bnd-home-status-center-inline, 50%/s);
	assert.match(source, /const ring = chart\.querySelector\("\.donut-path"\)\?\.parentElement/);
	assert.doesNotMatch(source, /const slice = chart\.querySelector\("\.donut-path"\)/);
});

test("the compiled theme includes the permanent compact sidebar rail", () => {
	const entry = readFileSync(new URL("../bunood_theme/public/scss/bunood.scss", import.meta.url), "utf8");
	const layout = readFileSync(new URL("../bunood_theme/public/scss/chrome/_sidebar-layout.scss", import.meta.url), "utf8");
	assert.match(entry, /@use "chrome\/sidebar-layout";/);
	assert.match(layout, /\.bnd-compact-nav\s*\{\s*display:\s*none/);
	assert.match(layout, /\.bnd-rail-entry\s*\{/);
	assert.match(layout, /\.bnd-rail-glyph\s*\{[^}]*inline-size:/s);
	assert.match(layout, /\.body-sidebar-top, \.standard-items-sections/);
});

test("home metric icons use a visible fallback instead of an empty sprite well", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /invoiced_value:\s*\[\["icon-invoice", "icon-receipt", "icon-file"\], "brand"\]/);
	assert.match(source, /billing_due:\s*\[\["icon-invoice", "icon-receipt", "icon-file"\], "gold"\]/);
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
	assert.match(source, /setAttribute\("data-bnd-desktop-home", ""\)/);
	assert.match(source, /removeAttribute\("data-bnd-desktop-home"\)/);
	assert.match(source, /brand\.insertAdjacentElement\("afterend", button\)/);
	assert.match(source, /build_quick_link\("home", true\)/);
	assert.match(source, /hasAttribute\("data-bnd-desktop-shell"\)/);
	assert.match(source, /attributeFilter:\s*\["data-bnd-desktop-shell"\]/);
	assert.match(source, /function observe_desktop_shell_home\(\)/);
	assert.match(source, /try_for\(sync_native_desktop_home, 40, 150\)/);
	const styles = readFileSync(new URL("../bunood_theme/public/scss/surfaces/_desktop.scss", import.meta.url), "utf8");
	assert.match(styles, /\[data-bnd-desktop-home\][^{]+\.navbar-home\s*\{\s*display:\s*none/);
	assert.match(styles, /\[data-bnd-desktop-home\][^{]+\[data-bnd-part="home"\]:not\(\.bnd-desktop-native-home\)/);
	assert.match(styles, /:not\(\[data-bnd-narrow\]\)\[data-bnd-desktop-home\][^{]+\[data-bnd-part="home"\]/);
	const shell = source.slice(source.indexOf("function sync_desktop_shell()"), source.indexOf("function desktop_symbol"));
	assert.match(shell, /search && search\.getClientRects\(\)\.length/);
	assert.ok(
		shell.indexOf("sync_native_desktop_home") < shell.indexOf("if (!bar) return"),
		"the native fallback must run even when no Bunood status bar exists",
	);
	const layoutStyles = readFileSync(new URL("../bunood_theme/public/scss/chrome/_layouts.scss", import.meta.url), "utf8");
	assert.doesNotMatch(layoutStyles, /\[data-bnd-own~="(?:search|panesearch)"\][^{]+\.desktop-navbar\s*\{\s*display:\s*none/);
});

test("a personal workspace route runs before the Bunood Home fallback", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	const personal = source.indexOf("if (!apply_home_route()) land_on_home();");
	assert.notEqual(personal, -1, "mount must give the personal route first refusal");
	const mount = source.indexOf("function mount_chrome()");
	const router = source.indexOf('frappe.router.on("change"', mount);
	assert.ok(personal > mount && personal < router, "the ordering guard belongs to initial mount");
	assert.match(source, /queue_home_landing\(\(\) => frappe\.set_route\("Workspaces", home\)\)/);
	assert.match(source, /frappe\.after_ajax\(finish\);[\s\S]*?setTimeout\(finish, 1000\)/);
});

test("Frappe's missing RTL shortcut arrow receives a verified local alias", () => {
	const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
	assert.match(source, /target = "es-line-arrow-up-left"/);
	assert.match(source, /getElementById\("icon-arrow-up-left"\)/);
	assert.match(source, /source\.parentNode\.appendChild\(alias\)/);
	assert.match(source, /if \(!theme_active\(\)\) return;\s*ensure_vendor_symbols\(\);/);
});
