const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bunood_theme/public/js/report_studio.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_studio.scss"), "utf8");
const cssRules = styles.replace(/\/\/.*$/gm, "");
const page = fs.readFileSync(
	path.join(root, "bunood_theme/bunood_theme/page/bnd_report_studio/bnd_report_studio.js"),
	"utf8"
);
const build = fs.readFileSync(path.join(root, "build.mjs"), "utf8");
const boot = fs.readFileSync(path.join(root, "bunood_theme/boot.py"), "utf8");
const api = fs.readFileSync(path.join(root, "bunood_theme/api.py"), "utf8");
const ar = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");

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
});

test("Studio layout owns its RTL and narrow-width behavior without global selectors", () => {
	assert.match(styles, /^\.bnd-studio\s*\{/m);
	assert.doesNotMatch(styles, /html\[data-theme\] \.bnd-studio/);
	assert.match(styles, /@media \(width < bp\.bnd-bp\(md\)\)/);
	assert.match(styles, /@media \(width < bp\.bnd-bp\(sm\)\)/);
	assert.doesNotMatch(cssRules, /margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)/);
});

test("Studio-owned Arabic labels are explicit and contextual", () => {
	for (const [sourceLabel, arabic] of [
		["Period", "الفترة"],
		["Reports: {0}", "التقارير: {0}"],
		["Not installed", "غير مثبّت"],
	]) {
		assert.ok(ar.split(/\r?\n/).includes(`${sourceLabel},${arabic},`), sourceLabel);
	}
	assert.doesNotMatch(source, /__\("Custom"\)/);
	assert.match(source, /__\("Custom Period"\)/);
});

test("Arabic Trial Balance and VAT Summary labels come from fieldnames, and served text is translated", () => {
	const rows = ar.split(/\r?\n/);
	for (const [field, msgid, arabic] of [
		["opening_debit", "Opening debit balance", "الرصيد الافتتاحي (مدين)"],
		["opening_credit", "Opening credit balance", "الرصيد الافتتاحي (دائن)"],
		["closing_debit", "Closing debit balance", "الرصيد الختامي (مدين)"],
		["closing_credit", "Closing credit balance", "الرصيد الختامي (دائن)"],
		["documents", "Document count", "عدد المستندات"],
		["note", "Report note", "ملاحظة"],
	]) {
		assert.match(source, new RegExp(`${field}: \\(\\) => __\\("${msgid.replace(/[()]/g, "\\$&")}"\\)`), field);
		assert.ok(rows.some((line) => line.startsWith(`${msgid},${arabic},`) || line.startsWith(`"${msgid}",${arabic},`)), msgid);
	}
	assert.match(source, /function classify\(columns, report\)/);
	assert.match(source, /classify\(data\.columns \|\| \[\], report\)/);
	assert.match(source, /isArabic\(\) && report && report\.name === "Trial Balance"/);
	assert.match(source, /isArabic\(\) && report && report\.name === "VAT Summary"/);
	assert.match(source, /let label = __\(col\.label\)/);
	assert.match(source, /label: __\(s\.label\)/);
	assert.match(source, /agg\.note = agg\.message \? __\(agg\.message\) : null/);
	assert.match(source, /report\.name === "VAT Summary" && typeof raw === "string" &&\s+\["entry", "note"\]\.includes\(col\.fieldname\)\) raw = __\(raw\)/);
});

test("a report response that arrives after its view was replaced draws nothing", () => {
	assert.match(source, /viewToken: 0,/);
	assert.match(source, /function gallery\(\) \{\s+state\.viewToken\+\+;/);
	assert.match(source, /const viewToken = \+\+state\.viewToken;/);
	assert.match(source, /const loadId = \+\+loadSequence;/);
	const guards = source.match(/if \(state\.viewToken !== viewToken \|\| loadId !== loadSequence\) return;/g) || [];
	assert.equal(guards.length, 2, "both the success and the failure path are guarded");
});

test("a point-in-time report reads 'as of' one date in its header, export and custom period", () => {
	assert.match(source, /const asOfDate = \(report\) => report\.filter_mode === "asOn" \|\| report\.filter_mode === "postingDate";/);
	assert.match(source, /chip\(asOfDate\(report\) \? __\("As of"\) : __\("Report period"\),/);
	assert.match(source, /\? \[\{ fieldname: "to", fieldtype: "Date", label: __\("As of"\), reqd: 1, default: state\.custom\.to \}\]/);
	assert.match(source, /state\.custom\.from <= values\.to \? state\.custom\.from : values\.to/);
	assert.match(source, /metaParts\.push\(\(asOfDate\(report\) \? __\("As of"\) : __\("Report period"\)\) \+ ": " \+/);
	assert.match(source, /\(asOfDate\(report\) \? to : from \+ "-" \+ to\) \+ "\.xlsx"/);
	assert.ok(ar.split(/\r?\n/).includes("As of,حتى تاريخ,"), "the label ships its Arabic");
});

test("row filters and the company follow the report and the companies the user can read", () => {
	assert.match(source, /if \(state\.report !== report\) \{\s+state\.query = "";\s+state\.kind = "all";\s+state\.showAllColumns = false;\s+\}\s+state\.report = report;/);
	assert.match(source, /if \(!state\.companies\.includes\(state\.company\)\) state\.company = state\.companies\[0\] \|\| null;/);
	assert.doesNotMatch(source, /if \(!state\.company && state\.companies\.length\) state\.company = state\.companies\[0\];/);
	assert.match(source, /fetchTaxId\(\);[\s\S]{0,200}if \(report\.picker && !state\.entity\) viewer\(\);\s+else load\(\);/);
});

test("the gallery opens on every report, grouped under its area, and keeps the chosen area", () => {
	assert.match(source, /domain: "all",/);
	assert.doesNotMatch(source, /state\.domain = report\.domain_id;/);
	assert.match(source, /if \(!needle && state\.domain === "all" && report\.domain_id !== lastDomain\)/);
	assert.match(source, /grid\.append\(el\("h3", "bnd-studio__group-title", owner\.label\(\)\)\)/);
	assert.match(source, /if \(needle\) \{\s+const owner = DOMAINS\.find/);
	assert.match(styles, /\.bnd-studio__group-title \{[^}]*grid-column: 1 \/ -1;/s);
});

test("the VAT Return card promises a review, not proof that it can be filed", () => {
	assert.doesNotMatch(source, /proof it can be filed/);
	assert.match(source, /desc: \(\) => __\("VAT figures and reconciliation checks to review before filing"\)/);
	assert.ok(
		ar.split(/\r?\n/).some((line) => line.startsWith("VAT figures and reconciliation checks to review before filing,أرقام ضريبة القيمة المضافة")),
		"the new description ships its Arabic"
	);
});
