const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load() {
	const context = {
		window: {},
		frappe: {
			datetime: {
				get_today: () => "2026-09-19",
				add_days: (_date, days) => days === 7 ? "2026-09-26" : "",
			},
		},
		__: value => value,
	};
	vm.runInNewContext(fs.readFileSync("bunood_theme/public/js/list_presets.js", "utf8"), context);
	return context.window.bunood_theme.list_presets;
}

test("Sales Invoice presets cover the production work queues with native fields", () => {
	const api = load();
	const presets = api.presetsFor("Sales Invoice", "2026-09-19");
	assert.deepEqual(Array.from(presets, preset => preset.key), [
		"draft", "unpaid", "partially_paid", "overdue", "paid", "this_month",
	]);
	const values = JSON.parse(JSON.stringify(Object.fromEntries(presets.map(preset => [preset.key, preset.filters]))));
	assert.deepEqual(values.draft, [["docstatus", "=", 0]]);
	assert.deepEqual(values.overdue, [["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", "2026-09-19"]]);
	assert.deepEqual(values.this_month, [["posting_date", "between", ["2026-09-01", "2026-09-19"]]]);
});

test("Quotation presets use native lifecycle and validity fields", () => {
	const api = load();
	const presets = api.presetsFor("Quotation", "2026-09-19");
	assert.deepEqual(Array.from(presets, preset => preset.key), [
		"draft", "awaiting_response", "expiring_soon", "converted", "lost",
	]);
	const values = JSON.parse(JSON.stringify(Object.fromEntries(presets.map(preset => [preset.key, preset.filters]))));
	assert.deepEqual(values.expiring_soon, [
		["docstatus", "=", 1],
		["status", "in", ["Open", "Replied"]],
		["valid_till", "between", ["2026-09-19", "2026-09-26"]],
	]);
	assert.deepEqual(values.converted, [["docstatus", "=", 1], ["status", "in", ["Partially Ordered", "Ordered"]]]);
});

test("active preset detection tolerates the dashboard company scope", () => {
	const api = load();
	const listview = {
		doctype: "Sales Invoice",
		filter_area: { get: () => [
			["Sales Invoice", "company", "=", "Bunood Development"],
			["Sales Invoice", "docstatus", "=", 1],
			["Sales Invoice", "outstanding_amount", ">", 0],
			["Sales Invoice", "due_date", "<", "2026-09-19"],
		] },
	};
	assert.equal(api.activeKey(listview, api.presetsFor("Sales Invoice", "2026-09-19")), "overdue");
});

test("applying and clearing a preset delegates to native FilterArea and ListView", async () => {
	const api = load();
	const calls = [];
	const listview = {
		doctype: "Quotation",
		filter_area: {
			clear: async refresh => calls.push(["clear", refresh]),
			set: async filters => calls.push(["set", JSON.parse(JSON.stringify(filters))]),
		},
		refresh: async () => calls.push(["refresh"]),
	};
	const awaiting = api.presetsFor("Quotation", "2026-09-19").find(item => item.key === "awaiting_response");
	await api.applyPreset(listview, awaiting);
	assert.deepEqual(calls, [
		["clear", false],
		["set", [["Quotation", "docstatus", "=", 1], ["Quotation", "status", "=", "Open"]]],
		["refresh"],
	]);
	calls.length = 0;
	await api.applyPreset(listview, { key: "all", filters: [] });
	assert.deepEqual(calls, [["clear", false], ["refresh"]]);
});
