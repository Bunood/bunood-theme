const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const js = read("bunood_theme/public/js/journal_workbench.js");
const page = read("bunood_theme/bunood_theme/page/bnd_journal_workbench/bnd_journal_workbench.js");
const pageJson = read("bunood_theme/bunood_theme/page/bnd_journal_workbench/bnd_journal_workbench.json");
const py = read("bunood_theme/journal_workbench.py");
const api = read("bunood_theme/api.py");
const build = read("build.mjs");
const boot = read("bunood_theme/boot.py");
const assets = read("bunood_theme/assets.py");
const workspace = read("bunood_theme/bunood_theme/workspace/reports/reports.json");
const financeClose = read("bunood_theme/public/js/finance_close.js");
const scss = read("bunood_theme/public/scss/surfaces/_finance_close.scss");
const ar = read("bunood_theme/translations/ar.csv");

test("journal workbench is a lazy standard Page reachable from Reports and close", () => {
	assert.match(pageJson, /"name": "bnd-journal-workbench"/);
	assert.match(page, /frappe\.boot\.bnd_journal_workbench_js/);
	assert.match(build, /key: "bnd-journal-workbench", src: "journal_workbench\.js", pyid: "JOURNAL_WORKBENCH_JS"/);
	assert.match(boot, /bootinfo\.bnd_journal_workbench_js = JOURNAL_WORKBENCH_JS/);
	assert.match(assets, /JOURNAL_WORKBENCH_JS = "\/assets\/bunood_theme\/dist\/js\/bnd-journal-workbench\.[a-f0-9]+\.js"/);
	assert.match(workspace, /"label": "Journal workbench"/);
	assert.match(workspace, /"link_to": "bnd-journal-workbench"/);
	assert.match(financeClose, /\["bnd-journal-workbench"\]/);
});

test("journal evidence is permission filtered and does not implement another ledger", () => {
	assert.match(py, /frappe\.get_list\(/);
	assert.match(py, /check_permission\("read"\)/);
	assert.match(py, /frappe\.has_permission\(doctype, permission\)/);
	assert.doesNotMatch(py, /get_all|db\.sql|ignore_permissions|\.save\(|\.insert\(|\.submit\(|\.cancel\(|set_value/);
	assert.match(api, /def journal_workbench/);
	assert.doesNotMatch(py, /state = "(?:complete|approved|reconciled)"/);
});

test("the workbench keeps operational documents, templates, schedules and journals distinct", () => {
	assert.match(js, /Use Payment Entry for bank or cash, party allocation and invoice settlement\./);
	assert.match(js, /Templates prefill structure only\./);
	assert.match(js, /Auto Repeat creates native documents on a schedule\./);
	assert.match(js, /Balanced drafts still require an authorised review and native submission/);
	assert.match(js, /frappe\.new_doc\("Journal Entry"/);
	assert.doesNotMatch(js, /innerHTML/);
});

test("the journal route shares the responsive Arabic-safe finance workbench grammar", () => {
	assert.match(js, /bnd-close bnd-journal/);
	assert.match(js, /setAttribute\("aria-live", "polite"\)/);
	assert.match(scss, /@include bnd-until\(md\)/);
	assert.match(scss, /padding-inline|margin-inline|border-inline/);
	assert.doesNotMatch(scss, /letter-spacing|margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)/);
});

test("operator-facing journal language is present in the generated Arabic catalogue", () => {
	for (const source of [
		"Journal workbench",
		"Choose the correct document first",
		"Unbalanced drafts",
		"Reusable templates",
		"Recurring journal schedules",
		"No open drafts observed",
	]) {
		assert.ok(ar.split(/\r?\n/).some((line) => line.startsWith(source + ",")), source);
	}
});
