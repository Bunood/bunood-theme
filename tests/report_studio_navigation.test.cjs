const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const home = read("bunood_theme/public/js/bunood.js");

function routingWith(allowed, permittedPages, items = []) {
	const source = home.slice(home.indexOf("const STUDIO_REPORT_NAMES ="),
		home.indexOf("function prepare_home_sidebar()"));
	const bunood = {};
	const frappe = { boot: {
		bnd_report_landing_permitted_pages: permittedPages,
		workspace_sidebar_item: { Reports: { items } },
	} };
	return vm.runInNewContext(`${source}\n({ route: studio_report_route, prepare: prepare_studio_sidebar_links })`,
		{ frappe, bunood, HOME_ALLOWED_REPORTS: new Set(allowed) });
}

test("available Studio reports open their exact view, while unsupported or forbidden reports stay native", () => {
	const { route } = routingWith(["General Ledger", "Accounts Receivable", "Cash Flow"],
		["bnd-report-studio"]);
	assert.deepEqual(Array.from(route("General Ledger")), ["bnd-report-studio", "general-ledger"]);
	assert.deepEqual(Array.from(route("Accounts Receivable")), ["bnd-report-studio", "accounts-receivable"]);
	assert.deepEqual(Array.from(route("Cash Flow")), ["query-report", "Cash Flow"]);
	assert.deepEqual(Array.from(route("Accounts Payable")), ["query-report", "Accounts Payable"]);
	const noStudio = routingWith(["General Ledger"], []);
	assert.deepEqual(Array.from(noStudio.route("General Ledger")), ["query-report", "General Ledger"]);
});

test("permission-filtered sidebar report links route to Studio without changing unsupported links", () => {
	const items = [
		{ type: "Link", link_type: "Report", link_to: "General Ledger" },
		{ type: "Link", link_type: "Report", link_to: "Cash Flow" },
		{ type: "Link", link_type: "Report", link_to: "Accounts Payable" },
	];
	const { prepare } = routingWith(["General Ledger", "Cash Flow"], ["bnd-report-studio"], items);
	assert.equal(prepare(), true);
	assert.equal(items[0].link_type, "URL");
	assert.equal(items[0].url, "/desk/bnd-report-studio/general-ledger");
	assert.equal(items[1].link_type, "Report");
	assert.equal(items[2].link_type, "Report");
});

test("Bunood report entry points use the shared route and contextual statements retain their scope", () => {
	assert.match(home, /frappe\.set_route\(\.\.\.studio_report_route\(report\)\)/);
	assert.match(home, /kind === "report" \? studio_report_route\(target\) : route/);
	for (const file of ["finance_close.js", "journal_workbench.js", "asset_workbench.js"]) {
		assert.match(read(`bunood_theme/public/js/${file}`), /studio_report_route\?\.\(name\)/);
	}
	const bank = read("bunood_theme/public/js/banking_workbench.js");
	const bill = read("bunood_theme/public/js/sales_bill.js");
	const studio = read("bunood_theme/public/js/report_studio.js");
	assert.match(bank, /"bnd-report-studio", "account-statement"/);
	assert.match(bank, /bnd_studio_context: 1, company: companyControl\.get_value\(\)/);
	assert.match(bill, /"account-statement", `customer~\$\{this\.doc\.customer\}`/);
	assert.match(bill, /bnd_studio_context: 1, company: this\.doc\.company/);
	assert.match(studio, /context\?\.company && !state\.companies\.includes\(context\.company\)/);
	assert.match(studio, /state\.period = "custom"/);
	assert.match(read("bunood_theme/api.py"), /report_route = "\/desk\/bnd-report-studio\/accounts-receivable"/);
});

test("Studio reference cells resolve native Link and Dynamic Link targets", () => {
	const studio = read("bunood_theme/public/js/report_studio.js");
	const start = studio.indexOf("function referenceTarget(");
	const end = studio.indexOf("function render(", start);
	assert.ok(start >= 0 && end > start);
	const target = vm.runInNewContext(`${studio.slice(start, end)}; referenceTarget`, {
		rowValue: (row, column, index) => Array.isArray(row) ? row[index] : row[column.fieldname],
	});
	const shape = { all: [
		{ fieldname: "voucher_type" },
		{ fieldname: "voucher_no", fieldtype: "Dynamic Link", options: "voucher_type" },
	] };
	assert.equal(JSON.stringify(target(shape, ["Sales Invoice", "ACC-SINV-1"], shape.all[1], "ACC-SINV-1")),
		JSON.stringify({ doctype: "Sales Invoice", name: "ACC-SINV-1" }));
	assert.equal(JSON.stringify(target(shape, {}, { fieldtype: "Link", options: "Customer" }, "CUST-1")),
		JSON.stringify({ doctype: "Customer", name: "CUST-1" }));
	assert.equal(target(shape, ["", "ACC-SINV-1"], shape.all[1], "ACC-SINV-1"), null);
	assert.equal(target(shape, {}, { fieldtype: "Data", options: "Customer" }, "CUST-1"), null);
	assert.match(studio, /link\.href = "\/app\/" \+ frappe\.router\.slug\(target\.doctype\)/);
	assert.match(studio, /rememberReturn\(report\.title\(\)\)/);
	assert.match(studio, /frappe\.router\.on\("change", syncReturnBar\)/);
});
