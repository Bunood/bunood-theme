const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
	path.join(__dirname, "../bunood_theme/public/js/report_studio.js"), "utf8"
);
const start = source.indexOf("function composeTaxSplit(");
const end = source.indexOf("function composeSignSplit(", start);
assert.ok(start >= 0 && end > start, "sales composers exist");
const { composeTaxSplit, composeTopInvoices, composeInvoiceCount } = vm.runInNewContext(
	`${source.slice(start, end)}; ({ composeTaxSplit, composeTopInvoices, composeInvoiceCount })`,
	{
		__: (value) => value,
		rowValue: (row, _column, index) => row[index],
		isTaxish: () => false,
		frappe: { datetime: { str_to_user: (value) => value } },
	}
);

function aggregate(rows) {
	const all = [
		{ fieldname: "grand_total", fieldtype: "Currency" },
		{ fieldname: "net_total", fieldtype: "Currency" },
		{ fieldname: "tax_total", fieldtype: "Currency" },
	];
	return { shape: { all, currency: all }, primary: all[0], bodyRows: rows, rows: rows.slice() };
}

test("tax split partitions every invoice by computed tax and uses taxable net for the rate", () => {
	const agg = aggregate([[115, 100, 15], [50, 50, 0], [20, 20, 0.004], [57.5, 50, 7.5]]);
	composeTaxSplit(agg, null);
	const tiles = Object.fromEntries(agg.customTiles.map((tile) => [tile.label, tile.value]));
	assert.equal(tiles["Taxable invoices"] + tiles["Non-taxable invoices"], agg.bodyRows.length);
	assert.equal(tiles["Taxable invoices"], 2);
	assert.equal(tiles["Non-taxable invoices"], 2);
	assert.equal(tiles["Tax collected"], 22.5);
	assert.equal(agg.extraTiles[0].value, 15);
});

test("top invoices keep at most 25 rows but calculate tiles over the full period", () => {
	const rows = Array.from({ length: 30 }, (_, index) => [index + 1, index + 1, 0]);
	const agg = aggregate(rows);
	composeTopInvoices(agg, null);
	const tiles = Object.fromEntries(agg.customTiles.map((tile) => [tile.label, tile.value]));
	assert.equal(agg.rows.length, 25);
	assert.equal(agg.rows[0][0], 30);
	assert.equal(agg.rows.at(-1)[0], 6);
	assert.equal(tiles["Invoices in period"], 30);
	assert.ok(tiles["Largest invoice"] >= tiles["Average invoice"]);
});

test("invoice counter preserves real invoice rows while grouping dates for the chart", () => {
	const agg = aggregate([[115, 100, 15, "2026-09-01"], [230, 200, 30, "2026-09-01"], [57.5, 50, 7.5, "2026-09-02"]]);
	const dateColumn = { fieldname: "posting_date", fieldtype: "Date" };
	agg.shape.all.push(dateColumn);
	agg.shape.dates = [dateColumn];
	const originalRows = agg.rows;
	composeInvoiceCount(agg, null);
	const tiles = Object.fromEntries(agg.customTiles.map((tile) => [tile.label, tile.value]));
	assert.equal(tiles.Invoices, 3);
	assert.equal(tiles["Days with sales"], 2);
	assert.equal(tiles["Busiest day"], 2);
	assert.equal(agg.rows, originalRows);
	assert.equal(agg.customSeries.datasets[0].values.join(","), "2,1");
});

test("all five second-wave sales cuts use native reports", () => {
	for (const key of ["tax-split", "top-invoices", "invoice-count", "sales-by-item-group", "sales-by-customer-group"]) {
		assert.ok(source.includes(`key: "${key}"`), key);
	}
	for (const report of ["Sales Register", "Sales Analytics"]) {
		assert.ok(source.includes(`name: "${report}"`), report);
	}
});
