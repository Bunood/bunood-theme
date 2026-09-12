const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "bunood_theme/public/js/report_workbench.js"), "utf8");
const desk = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");
const build = fs.readFileSync(path.join(root, "build.mjs"), "utf8");
const boot = fs.readFileSync(path.join(root, "bunood_theme/boot.py"), "utf8");
const hooks = fs.readFileSync(path.join(root, "bunood_theme/hooks.py"), "utf8");
const scss = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_report.scss"), "utf8");
const coverage = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_coverage.scss"), "utf8");
const ar = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");

test("the workbench is page scoped to the seven production reports", () => {
	for (const report of [
		"General Ledger", "Accounts Receivable", "Accounts Payable", "VAT Summary",
		"Stock Balance", "Rent Roll", "Owner Ledger",
	]) assert.match(js, new RegExp(`"${report}"`));
	assert.match(build, /key: "bnd-report", src: "report_workbench\.js", pyid: "REPORT_JS"/);
	assert.match(boot, /bootinfo\.bnd_report_js = REPORT_JS/);
	assert.match(desk, /route\[0\] !== "query-report"/);
	assert.match(desk, /frappe\.require\(source\)/);
	assert.match(js, /report_workbench_loaded = true/);
	assert.doesNotMatch(hooks, /page_js\s*=.*report_workbench/);
	assert.doesNotMatch(js, /export_report\s*=/);
	assert.doesNotMatch(js, /ignore_prepared_report\s*=/);
});

test("refresh recovery delegates to the exact live native method", () => {
	assert.match(js, /bndRefresh\._bnd_native\.apply\(this, args\)/);
	assert.match(js, /bindRequest\(this, this\.last_ajax\)/);
	assert.match(js, /setTimeout\(\(\) => afterSuccess\(report\), 0\)/);
	assert.match(js, /result\.then\(\(\) => afterSuccess\(this\)/);
	assert.match(js, /status === "abort"/);
	assert.match(js, /report\.refresh\?\.apply\(report, args\)/);
	assert.match(js, /setAttribute\("role", "alert"\)/);
	assert.match(js, /setAttribute\("aria-live", "assertive"\)/);
});

test("scope, empty, numeric and semantic-row states are explicit", () => {
	for (const token of [
		"bnd-report-scope", "bnd-report-empty-action", "bnd-report-number",
		"bnd-report-total-row", "bnd-report-section-row",
	]) {
		assert.match(js + scss, new RegExp(token));
	}
	assert.match(js, /setAttribute\("dir", "ltr"\)/);
	assert.match(scss, /unicode-bidi: isolate/);
	assert.match(scss, /@media \(width < bp\.bnd-bp\(sm\)\)/);
	assert.match(coverage, /html\[data-bnd-ws\] \.body-sidebar-container \{\s*position: relative;/);
});

test("new user-visible strings have Arabic catalogue entries", () => {
	for (const source of [
		"Report scope",
		"Could not refresh this report. Check your connection and try again.",
		"Review filters",
		"Retrying…",
		"{0} more filters",
	]) {
		assert.ok(ar.split(/\r?\n/).some((line) => line.startsWith(source + ",")), source);
	}
});
