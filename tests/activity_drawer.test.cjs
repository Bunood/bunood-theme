// bunood.js activity drawer: a click outside the panel closes it.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\t// Not modal: a click anywhere outside the panel and its toggle closes it,");
const end = js.indexOf("}, true);", start) + "}, true);".length;

function harness() {
	const listeners = {};
	const footer = { id: "footer" };
	const toggle = { id: "toggle" };
	const state = { open: "open", closed: 0 };
	const context = {
		DRAWER_ATTR: "data-bnd-drawer",
		window: { cur_frm: { footer: { wrapper: [footer] } } },
		document: {
			documentElement: { getAttribute: () => state.open },
			addEventListener: (type, fn) => { listeners[type] = fn; },
		},
		drawer_current_toggle: () => toggle,
		drawer_set_open: (open) => { if (!open) state.closed += 1; },
	};
	vm.runInNewContext(js.slice(start, end), context);
	const click = (pathNodes) => listeners.pointerdown({ composedPath: () => pathNodes });
	return { click, footer, toggle, state };
}

test("a click outside closes the panel; inside it or on its toggle does not", () => {
	assert.ok(start > 0 && end > start, "the outside-click handler is found");
	const h = harness();
	h.click([{ id: "comment" }, h.footer]);
	h.click([h.toggle]);
	assert.equal(h.state.closed, 0);
	h.click([{ id: "list" }]);
	assert.equal(h.state.closed, 1);
	h.state.open = null;
	h.click([{ id: "list" }]);
	assert.equal(h.state.closed, 1, "a closed panel is left alone");
});
