// bunood.js sb_head_menu: the pane head's menu lists Home once, in any language.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\tfunction sb_head_menu() {");
const end = js.indexOf("\n\t}\n", start) + 4;
assert.ok(start > 0 && end > start, "sb_head_menu is found in bunood.js");

function menu(translate) {
	const context = {
		__: translate,
		frappe: {
			boot: {
				allowed_workspaces: [
					{ name: "Home", title: "Home" },
					{ name: "Selling", title: "Selling" },
					{ name: "Selling Child", title: "Child", parent_page: "Selling" },
				],
			},
			set_route() {},
		},
		window: { location: {} },
		document: { querySelector: () => null },
		sb_collapse_all() {},
		sb_quick_links: () => [],
		ws_symbol: () => "icon",
		ws_original_icon: () => null,
		ws_route: (name) => name,
	};
	vm.runInNewContext(`${js.slice(start, end)}\nthis.items = sb_head_menu();`, context);
	return [...context.items].filter((item) => item !== "divider").map((item) => item.label);
}

test("an Arabic desk lists Home once, like an English one", () => {
	const arabic = menu((text) => ({ Home: "الرئيسية", "All Apps": "كل التطبيقات", Selling: "البيع" })[text] || text);
	assert.deepEqual(arabic, ["الرئيسية", "كل التطبيقات", "البيع"]);
	assert.deepEqual(menu((text) => text), ["Home", "All Apps", "Selling"]);
});
