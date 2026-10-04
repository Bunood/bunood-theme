// bunood.js studio_report_route: which reports open in Report Studio, for whom.
//
// The function is lifted out of bunood.js by its own markers and run in a vm
// against a fake frappe.boot, so this is behaviour, not a source regex.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const bunood = read("bunood_theme/public/js/bunood.js");

const start = bunood.indexOf("\tconst STUDIO_REPORT_NAMES = new Set([");
const end = bunood.indexOf("\tbunood.studio_report_route = studio_report_route;");
assert.ok(start > 0 && end > start, "the studio route block is found in bunood.js");
const block = bunood.slice(start, end);

function routeFor(boot) {
	return vm.runInNewContext(`${block}\nstudio_report_route`, { window: { frappe: { boot } } });
}

const STUDIO_OPEN = { bnd_report_landing_permitted_pages: ["bnd-report-studio", "bnd-banking"] };

test("a presented report opens in the Studio for a user who may open it and run the report", () => {
	const route = routeFor({ ...STUDIO_OPEN, allowed_reports: { "General Ledger": {}, "VAT Summary": {} } });
	assert.deepEqual([...route("General Ledger")], ["bnd-report-studio", "general-ledger"]);
	assert.deepEqual([...route("VAT Summary")], ["bnd-report-studio", "vat-return"]);
});

test("anything else stays on Frappe's query report", () => {
	const route = routeFor({ ...STUDIO_OPEN, allowed_reports: { "General Ledger": {}, "Cash Flow": {} } });
	assert.deepEqual([...route("Cash Flow")], ["query-report", "Cash Flow"], "not presented by the Studio");
	assert.deepEqual([...route("Trial Balance")], ["query-report", "Trial Balance"], "not runnable for this user");
	const noPage = routeFor({ bnd_report_landing_permitted_pages: ["bnd-banking"], allowed_reports: { "General Ledger": {} } });
	assert.deepEqual([...noPage("General Ledger")], ["query-report", "General Ledger"], "Studio page not permitted");
	const oldBoot = routeFor({ allowed_reports: { "General Ledger": {} } });
	assert.deepEqual([...oldBoot("General Ledger")], ["query-report", "General Ledger"], "no page gate in boot");
});

test("a site's own runnable list wins over Frappe's allowed reports", () => {
	const route = routeFor({ ...STUDIO_OPEN, allowed_reports: { "General Ledger": {} }, bnd_navigation_reports: ["Trial Balance"] });
	assert.deepEqual([...route("General Ledger")], ["query-report", "General Ledger"]);
	assert.deepEqual([...route("Trial Balance")], ["bnd-report-studio", "trial-balance"]);
});

test("every Studio destination is a key report_studio.js serves", () => {
	const studio = read("bunood_theme/public/js/report_studio.js");
	const route = routeFor({ ...STUDIO_OPEN, bnd_navigation_reports: [
		"Sales Register", "Purchase Register", "Gross Profit", "General Ledger", "Accounts Receivable",
		"Accounts Payable", "Trial Balance", "Profit and Loss Statement", "Balance Sheet", "VAT Summary",
	] });
	for (const name of ["Sales Register", "Purchase Register", "Gross Profit", "General Ledger",
		"Accounts Receivable", "Accounts Payable", "Trial Balance", "Profit and Loss Statement",
		"Balance Sheet", "VAT Summary"]) {
		const [page, key] = route(name);
		assert.equal(page, "bnd-report-studio", name);
		// A report either names its key or takes the derived one (report.key ||
		// name lowered and dashed); either way the Studio must carry that report.
		const explicit = new RegExp(`name: "${name}",\\s+key: "${key}"`);
		const derived = new RegExp(`name: "${name}",\\s+(?!key:)`);
		assert.ok(explicit.test(studio) || derived.test(studio), `${name} -> ${key} is not a Studio report`);
	}
});

test("the desks route their report buttons through it and fall back to the native report", () => {
	for (const file of ["finance_close.js", "journal_workbench.js"]) {
		const js = read(`bunood_theme/public/js/${file}`);
		assert.match(js, /const reportRoute = \(name\) => window\.bunood_theme\?\.studio_report_route\?\.\(name\) \|\| \["query-report", name\];/, file);
		assert.match(js, /reportRoute\("General Ledger"\)/, file);
	}
	const banking = read("bunood_theme/public/js/banking_workbench.js");
	assert.match(banking, /studio_report_route\?\.\("General Ledger"\)\?\.\[0\] === "bnd-report-studio"/);
	assert.match(banking, /`account~\$\{state\.data\.bank_account\.ledger_account\}`/);
	assert.match(banking, /\{ bnd_studio_context: 1, company: companyControl\.get_value\(\),/);
	assert.match(banking, /"query-report",\s+"General Ledger",/, "the native ledger stays the fallback");
});
