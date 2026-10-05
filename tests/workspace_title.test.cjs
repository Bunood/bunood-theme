// A workspace's title is the record's own name -- English, and the key routes
// and sidebar data are looked up by. What a reader SEES is `__(title)`: Frappe's
// own sidebar header draws `__(workspace_title)`. The pane head drew the raw
// title, so an Arabic desk read "Engineering Office" -- truncated to
// "…eering Office" by the RTL ellipsis -- above a column of Arabic items, while
// the header it replaces said «المكتب الهندسي». Measured on the production-parity
// bench, 2026-09-26: `__("Engineering Office")` served «المكتب الهندسي» and
// `.bnd-sb-head-name` held "Engineering Office".
//
// Every place the theme writes a title a person reads goes through ONE helper,
// so a fourth call site cannot quietly skip the translation. The places that
// use the title as a KEY (sidebar lookups, route matching, icon lookup) keep the
// raw title on purpose, and are not asserted here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");

function body(signature) {
	const at = source.indexOf(signature);
	assert.ok(at >= 0, `${signature} not found`);
	const end = source.indexOf("\n\t}\n", at);
	assert.ok(end > at, `${signature} has no end`);
	return source.slice(at, end);
}

test("one helper says a workspace's title, in the reader's language", () => {
	const helper = body("function ws_label(ws) {");
	assert.match(helper, /__\(/, "the helper does not translate");
});

test("the pane head names the place in the reader's language", () => {
	const head = body("function sb_update_head() {");
	assert.match(head, /ws_label\(ws\)/);
	assert.doesNotMatch(head, /ws\.title/, "the head still reads the raw title");
});

test("the dock's tooltips and its overflow menu say the title in the reader's language", () => {
	const start = source.indexOf("for (const ws of roots.slice(0, DOCK_SLOTS))");
	const end = source.indexOf("dock.appendChild(more);", start);
	assert.ok(start >= 0 && end > start, "the dock's workspace loop not found");
	const dock = source.slice(start, end);
	assert.doesNotMatch(dock, /(title|label): ws\.title/, "the dock still shows a raw title");
	assert.match(dock, /title: ws_label\(ws\)/);
	assert.match(dock, /label: ws_label\(ws\)/);
});
