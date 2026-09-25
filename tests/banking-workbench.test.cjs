const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const js = read("bunood_theme/public/js/banking_workbench.js");
const page = read("bunood_theme/bunood_theme/page/bnd_banking/bnd_banking.js");
const pageJson = read("bunood_theme/bunood_theme/page/bnd_banking/bnd_banking.json");
const py = read("bunood_theme/banking.py");
const api = read("bunood_theme/api.py");
const boot = read("bunood_theme/boot.py");
const assets = read("bunood_theme/assets.py");
const build = read("build.mjs");
const workspace = read("bunood_theme/bunood_theme/workspace/reports/reports.json");
const scss = read("bunood_theme/public/scss/surfaces/_banking.scss");
const ar = read("bunood_theme/translations/ar.csv");

test("banking cockpit is a lazy standard Page reachable from Reports", () => {
	assert.match(pageJson, /"name": "bnd-banking"/);
	assert.match(page, /frappe\.boot\.bnd_banking_js/);
	assert.match(build, /key: "bnd-banking", src: "banking_workbench\.js", pyid: "BANKING_JS"/);
	assert.match(boot, /bootinfo\.bnd_banking_js = BANKING_JS/);
	assert.match(assets, /BANKING_JS = "\/assets\/bunood_theme\/dist\/js\/bnd-banking\.[a-f0-9]+\.js"/);
	assert.match(workspace, /"label": "Bank Reconciliation"/);
	assert.match(workspace, /"link_to": "bnd-banking"/);
});

test("all mutations and matching remain in native ERPNext surfaces", () => {
	assert.match(js, /window\.location\.assign\("\/banking"\)/);
	assert.match(js, /\["Form", "Bank Transaction", row\.name\]/);
	assert.match(js, /\["Form", "Bank Statement Import", item\.name\]/);
	assert.match(py, /"doctype": "Bank Statement Import"/);
	assert.match(py, /doc\.insert\(\)/);
	assert.doesNotMatch(py, /ignore_permissions|get_all|db\.sql|set_value|submit\(/);
	assert.doesNotMatch(js, /make_payment|reconcile_entries|add_payment_entries/);
	assert.match(api, /def bank_reconciliation_workbench/);
	assert.match(api, /def create_bank_statement_import/);
});

test("the evidence contract is permission filtered and never claims close approval", () => {
	assert.match(py, /frappe\.get_list\(/);
	assert.match(py, /check_permission\("read"\)/);
	assert.match(py, /"no-open-statement-items"/);
	assert.doesNotMatch(py, /state = "reconciled"|state = "approved"/);
	assert.match(js, /This is not a close approval/);
	assert.match(js, /Debit minus credit; not a reconciliation difference/);
	assert.doesNotMatch(py, /["'](?:bank_account_no|iban)["']/i);
});

test("the owned UI is responsive, logical, accessible and safe for statement text", () => {
	assert.match(js, /setAttribute\("role", "status"\)/);
	assert.match(js, /setAttribute\("aria-live", "polite"\)/);
	assert.match(js, /textContent = text/);
	assert.doesNotMatch(js, /innerHTML/);
	assert.match(scss, /@include bnd-until\(md\)/);
	assert.match(scss, /padding-inline|margin-inline|inset-inline/);
	assert.doesNotMatch(scss, /margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)/);
});

test("operator-facing banking language is present in the Arabic catalogue", () => {
	for (const source of [
		"Bank reconciliation",
		"Import bank statement",
		"Open reconciliation workspace",
		"Open statement amount",
		"Unmatched and partially matched transactions",
		"This is not a close approval. Review book-only entries and complete the native reconciliation before signing off.",
	]) {
		assert.ok(ar.split(/\r?\n/).some((line) => line.startsWith(source + ",")), source);
	}
});
