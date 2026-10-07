const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const client = fs.readFileSync("bunood_theme/public/js/stock_entry_compat.js", "utf8");
const server = fs.readFileSync("bunood_theme/api.py", "utf8");
const hooks = fs.readFileSync("bunood_theme/hooks.py", "utf8");

function harness() {
	const calls = [];
	const native = [];
	const frappe = {
		db: {
			get_value: (...args) => { native.push(["get_value", ...args]); return "native-value"; },
			get_single_value: (...args) => { native.push(["get_single_value", ...args]); return "native-single"; },
		},
		call: options => {
			calls.push(options);
			const response = { message: "Stores - BDEV" };
			options.callback?.(response);
			return response;
		},
		xcall: (method, args) => { calls.push({ method, args }); return Promise.resolve(1); },
	};
	const context = { window: { frappe }, frappe, Set };
	vm.runInNewContext(client, context);
	return { frappe, calls, native };
}

test("Stock Entry compatibility reads only the two upstream fields", async () => {
	const { frappe, calls, native } = harness();
	let callbackValue;
	const valueResponse = frappe.db.get_value(
		"Stock Settings",
		{ name: "Stock Settings" },
		"sample_retention_warehouse",
		value => { callbackValue = value; }
	);
	assert.equal(callbackValue.sample_retention_warehouse, "Stores - BDEV");
	assert.equal(valueResponse.message.sample_retention_warehouse, "Stores - BDEV");
	assert.equal(await frappe.db.get_single_value("Stock Settings", "disable_serial_no_and_batch_selector"), 1);
	assert.equal(calls.length, 2);
	assert.equal(native.length, 0);
});

test("Stock Entry compatibility delegates every unrelated database read", () => {
	const { frappe, calls, native } = harness();
	assert.equal(frappe.db.get_value("Item", "ITEM-1", "item_name"), "native-value");
	assert.equal(frappe.db.get_value("Stock Settings", {}, "default_warehouse"), "native-value");
	assert.equal(frappe.db.get_single_value("Accounts Settings", "allow_stale"), "native-single");
	assert.equal(frappe.db.get_single_value("Stock Settings", "default_warehouse"), "native-single");
	assert.equal(calls.length, 0);
	assert.equal(native.length, 4);
});

test("server read is field-whitelisted permission-checked and route scoped", () => {
	assert.match(server, /STOCK_ENTRY_SETTING_FIELDS\s*=\s*frozenset/);
	assert.match(server, /"sample_retention_warehouse"/);
	assert.match(server, /"disable_serial_no_and_batch_selector"/);
	assert.match(server, /frappe\.has_permission\("Stock Entry", "read"\)/);
	assert.match(server, /value = frappe\.db\.get_single_value\("Stock Settings", fieldname\)/);
	assert.match(server, /frappe\.has_permission\("Warehouse", "read", value\)/);
	assert.doesNotMatch(server, /set_single_value\("Stock Settings"/);
	assert.match(hooks, /"Stock Entry": "public\/js\/stock_entry_compat\.js"/);
});
