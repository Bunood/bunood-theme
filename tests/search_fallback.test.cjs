// bunood.js search_fallback_order: a desk no card names falls back by its containers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const tableStart = js.indexOf("\tconst SEARCH_FALLBACKS = {");
const tableEnd = js.indexOf("\n\t};\n", tableStart) + 4;
const fnStart = js.indexOf("\tfunction search_fallback_order() {");
const fnEnd = js.indexOf("\n\t}\n", fnStart) + 4;

function order(shape, containers) {
	const context = { layout: () => shape, container_on: (name) => containers.includes(name) };
	vm.runInNewContext(`${js.slice(tableStart, tableEnd)}\n${js.slice(fnStart, fnEnd)}\nthis.order = search_fallback_order();`, context);
	return [...context.order];
}

test("a named shape keeps its own order", () => {
	assert.ok(tableStart > 0 && fnStart > 0, "the table and the function are found");
	assert.deepEqual(order("taskbar", ["sidepane"]), ["botcenter", "botedge", "sbtop", "sbbottom"]);
});

test("an unnamed desk falls back by the containers it really has", () => {
	assert.deepEqual(order("", ["dock", "sidepane"]), ["dock", "botcenter", "botedge"]);
	assert.deepEqual(order("", ["topbar", "sidepane"])[0], "topcenter");
	assert.deepEqual(order("", ["sidepane"])[0], "sbtop");
	assert.deepEqual(order("", ["bottombar"])[0], "botcenter");
	assert.deepEqual(order("", []), ["topcenter", "topedge", "botcenter", "botedge", "sbtop", "sbbottom"]);
});
