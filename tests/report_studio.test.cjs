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
