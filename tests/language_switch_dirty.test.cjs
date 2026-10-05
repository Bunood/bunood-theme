// bunood.js switch_language: unsaved work stops the switch, with a way through.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\tlet language_switch_pending = false;");
const end = js.indexOf("\n\t}\n", js.indexOf("\tasync function switch_language(", start)) + 4;

function harness(locals) {
	const calls = { msgprint: [], call: [], hidden: 0, reloaded: 0 };
	const context = {
		__: (text) => text,
		window: { locals, location: { reload: () => { calls.reloaded += 1; } } },
		document: { querySelectorAll: () => [] },
		frappe: {
			msgprint: (arg) => calls.msgprint.push(arg),
			hide_msgprint: () => { calls.hidden += 1; },
			call: async (args) => { calls.call.push(args); return { message: { language: args.args.code } }; },
		},
	};
	vm.runInNewContext(`${js.slice(start, end)}\nthis.switch_language = switch_language;`, context);
	return { switch_language: context.switch_language, calls };
}

test("unsaved work stops the switch and offers to discard it", async () => {
	assert.ok(start > 0 && end > start, "switch_language is found");
	const h = harness({ "Sales Invoice": { "new-sales-invoice-1": { __unsaved: 1 } } });
	await h.switch_language("ar");
	assert.equal(h.calls.call.length, 0, "nothing is written");
	const prompt = h.calls.msgprint[0];
	assert.equal(prompt.indicator, "orange");
	assert.equal(prompt.primary_action.label, "Discard changes and switch");
	await prompt.primary_action.action();
	assert.equal(h.calls.hidden, 1);
	assert.equal(h.calls.call.length, 1, "the deliberate discard switches");
	assert.equal(h.calls.call[0].args.code, "ar");
});

test("a clean desk switches at once", async () => {
	const h = harness({ "Sales Invoice": { "SINV-1": {} } });
	await h.switch_language("en");
	assert.equal(h.calls.msgprint.length, 0);
	assert.equal(h.calls.call.length, 1);
	assert.equal(h.calls.reloaded, 1);
});
