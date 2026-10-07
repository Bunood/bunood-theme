const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bunood_theme/public/js/report_studio.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_studio.scss"), "utf8");
const pilotStyles = fs.readFileSync(
	path.join(root, "bunood_theme/public/scss/surfaces/_studio_editorial_pilot.scss"), "utf8"
);
const cssRules = styles.replace(/\/\/.*$/gm, "");
const page = fs.readFileSync(
	path.join(root, "bunood_theme/bunood_theme/page/bnd_report_studio/bnd_report_studio.js"),
	"utf8"
);
const build = fs.readFileSync(path.join(root, "build.mjs"), "utf8");
const boot = fs.readFileSync(path.join(root, "bunood_theme/boot.py"), "utf8");
const api = fs.readFileSync(path.join(root, "bunood_theme/api.py"), "utf8");
const ar = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");
const translations = import('../tools/i18n.mjs').then(({readTranslations}) =>
    readTranslations(path.join(root, 'bunood_theme/translations/ar.csv')));

test("Report Studio remains a route-scoped presentation over Frappe reports", () => {
	assert.match(build, /key: "bnd-studio", src: "studio\.scss", pyid: "STUDIO_CSS"/);
	assert.match(build, /key: "bnd-studio", src: "report_studio\.js", pyid: "STUDIO_JS"/);
	assert.match(boot, /bootinfo\.bnd_studio_css = STUDIO_CSS/);
	assert.match(boot, /bootinfo\.bnd_studio_js = STUDIO_JS/);
	assert.match(api, /def get_report_studio_assets\(\)/);
	assert.match(api, /return \{"css": STUDIO_CSS, "js": STUDIO_JS\}/);
	assert.match(page, /method: "bunood_theme\.api\.get_report_studio_assets"/);
	assert.match(page, /existing\.sheet/);
	assert.match(page, /node\.addEventListener\("error"/);
	assert.doesNotMatch(page, /frappe\.require\(/);
	assert.match(source, /method: "frappe\.desk\.query_report\.run"/);
	assert.doesNotMatch(source, /frappe\.db\.sql|frappe\.client\.get_list/);
});

test("catalogue discovery is bilingual, counted, and keyboard accessible", () => {
	assert.match(source, /\{ id: "all", label: \(\) => __\("All reports"\)/);
	assert.match(source, /`\$\{report\.name\} \$\{report\.title\(\)\} \$\{report\.desc\(\)\}`/);
	assert.match(source, /galleryCount\.setAttribute\("aria-live", "polite"\)/);
	assert.match(source, /event\.key !== "\/"/);
	assert.match(source, /event\.key !== "Escape"/);
	assert.match(source, /card-go.*aria-hidden/s);
	assert.match(styles, /\.bnd-studio__card-go\s*\{[^}]*opacity: 0\.72/s);
});

test("additional native sales report types stay inside their report, not the gallery", async () => {
	const labels = await translations;
	for (const name of [
		"POS Register", "Sales Payment Summary", "Sales Person Commission Summary",
		"Item-wise Sales History", "Sales Analytics", "Sales Invoice Trends",
		"Customer Ledger Summary", "Customer Acquisition and Loyalty",
		"Customers Without Any Sales Transactions", "Quotation Trends", "Lost Quotations",
		"Delivered Items To Be Billed", "Inactive Sales Items",
	]) {
		assert.match(source, new RegExp(`name: "${name}",[\\s\\S]*?gallery: false`), name);
	}
	assert.match(source, /\.filter\(\(r\) => r\.gallery !== false\)/);
	assert.match(source, /state\.available\.has\(report\.name\)/);
	assert.match(source, /const allowed = frappe\.boot\?\.bnd_navigation_reports/);
	assert.match(source, /!Array\.isArray\(allowed\) \|\| allowed\.includes\(name\)/);
	assert.match(source, /__\("Show report"\)/);
	for (const label of ["POS Register", "Sales Payment Summary", "Inactive Sales Items"]) {
		assert.ok(labels.has(label), `missing Arabic translation: ${label}`);
	}
});

test("pilot Studio guides users from common tasks to scoped, readable results", () => {
	assert.match(source, /domain: "all"/);
	for (const key of ["sales-register", "accounts-receivable", "vat-return"]) {
		assert.ok(source.includes(`key: "${key}"`), `missing shortcut: ${key}`);
	}
	assert.match(source, /state\.available\.has\(item\.report\.name\)/);
	assert.match(source, /bnd-studio__controls-intro/);
	assert.match(source, /bnd-studio__tableheading/);
	assert.match(source, /search\.setAttribute\("aria-label", __\("Search these rows"\)\)/);
	assert.match(pilotStyles, /\.bnd-studio__tablewrap\s*\{[^}]*max-block-size: none/s);
	assert.match(pilotStyles, /\.bnd-studio__start-link:focus-visible/);
	for (const phrase of ["Start with a common task", "Report settings", "Search these rows"]) {
		assert.ok(ar.split(/\r?\n/).some((line) =>
			line.startsWith(`${phrase},`) || line.startsWith(`"${phrase}",`)
		), `missing Arabic label: ${phrase}`);
	}
});

test("comparison periods use the same report-specific filter mapping", () => {
	assert.match(source, /function filtersForRange\(report, state, from, to\)/);
	assert.match(source, /filtersForRange\(report, state, prevFrom, prevTo\)/);
	assert.doesNotMatch(source, /Object\.assign\(\{\}, filters, \{ from_date: prevFrom, to_date: prevTo \}\)/);
	for (const mode of ["asOn", "dateRange", "trialBalance"]) {
		assert.match(source, new RegExp(`case "${mode}"`));
	}
});

test("viewer actions expose loading and recoverable error states", () => {
	assert.match(source, /container\.setAttribute\("aria-busy", "true"\)/);
	assert.match(source, /container\.removeAttribute\("aria-busy"\)/);
	assert.match(source, /resultActions\.forEach\(\(button\) => \{ button\.disabled = true; \}\)/);
	assert.match(source, /alert\.setAttribute\("role", "alert"\)/);
	assert.match(source, /__\("Retry"\)/);
	assert.match(source, /frappe\.set_route\("query-report", report\.name\)/);
	assert.match(source, /state\.viewToken !== viewToken \|\| loadId !== loadSequence/g);
});

test("Studio layout owns its RTL and narrow-width behavior without global selectors", () => {
	assert.match(styles, /^\.bnd-studio\s*\{/m);
	assert.doesNotMatch(styles, /html\[data-theme\] \.bnd-studio/);
	assert.match(styles, /@media \(width < bp\.bnd-bp\(md\)\)/);
	assert.match(styles, /@media \(width < bp\.bnd-bp\(sm\)\)/);
	assert.doesNotMatch(cssRules, /margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)/);
});

test("Studio-owned Arabic labels are explicit and contextual", async () => {
	const labels = await translations;
	for (const [sourceLabel, arabic] of [
		["Period", "الفترة"],
		["Reports: {0}", "التقارير: {0}"],
		["Not installed", "غير مثبّت"],
	]) {
		assert.equal(labels.get(sourceLabel), arabic, sourceLabel);
	}
	assert.doesNotMatch(source, /__\("Custom"\)/);
	assert.match(source, /__\("Custom Period"\)/);
});

test("Arabic Trial Balance and report errors do not leak partial English labels", async () => {
	const labels = await translations;
	for (const [field, phrase] of [
		["opening_debit", "الرصيد الافتتاحي (مدين)"],
		["opening_credit", "الرصيد الافتتاحي (دائن)"],
		["closing_debit", "الرصيد الختامي (مدين)"],
		["closing_credit", "الرصيد الختامي (دائن)"],
	]) {
		assert.match(source, new RegExp(`${field}: \\(\\) => __\\(`));
		assert.ok(ar.includes(phrase), `missing ${field} translation`);
	}
	assert.match(source, /isArabic\(\) && report\.name === "Trial Balance"/);
	assert.match(source, /isArabic\(\) && report\.name === "VAT Summary"/);
	assert.equal(labels.get("Document count"), "عدد المستندات");
	assert.equal(labels.get("Report note"), "ملاحظة");
	assert.match(source, /label: __\(s\.label\)/);
	assert.match(source, /\["entry", "note"\]\.includes\(col\.fieldname\)/);
	assert.doesNotMatch(source, /proof it can be filed/);
	assert.ok(ar.includes("أرقام ضريبة القيمة المضافة وفحوص المطابقة"));
	assert.match(source, /localized_business_value\("Account", value\)/);
	assert.match(source, /const rawMessage = typeof err\?\.message/);
	assert.match(source, /\!\/\[A-Za-z\]\{3\}\/\.test\(translated\)/);
});
