// bunood.js inbox_observe: one observer, and a badge for every host that arrives.
//
// The observer is lifted out of bunood.js by its own markers and run in a vm
// with a fake MutationObserver, so this checks behaviour, not source text.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = source.indexOf("\tlet inbox_observer = null;");
const end = source.indexOf("\t// Badge continuity is a DOM lifecycle concern", start);
assert.ok(start > 0 && end > start, "the inbox observer is found in bunood.js");
const block = source.slice(start, end);

function element(matches, contains = []) {
	return {
		nodeType: 1,
		classList: { contains: (name) => matches.includes("." + name) },
		matches: (selector) => selector.split(",").some((part) => matches.includes(part.trim())),
		querySelector: (selector) => (contains.includes(selector) ? {} : null),
	};
}

function harness() {
	const observers = [];
	const frames = [];
	const calls = { ensure: 0 };
	class FakeObserver {
		constructor(callback) { this.callback = callback; observers.push(this); }
		observe(target, options) { this.target = target; this.options = options; }
	}
	const context = {
		window: { MutationObserver: FakeObserver },
		MutationObserver: FakeObserver,
		document: { body: { id: "body" } },
		inbox_state: { style: "Bunood Inbox" },
		inbox_paint_queued: false,
		requestAnimationFrame: (fn) => frames.push(fn),
		inbox_ensure_badges: () => { calls.ensure += 1; },
	};
	vm.createContext(context);
	vm.runInContext(`${block}\nthis.inbox_observe = inbox_observe;`, context);
	return { context, observers, frames, calls };
}

test("one observer however many times the kit asks for it", () => {
	const h = harness();
	h.context.inbox_observe();
	h.context.inbox_observe();
	assert.equal(h.observers.length, 1);
	const { childList, subtree } = h.observers[0].options;
	assert.equal(childList, true);
	assert.equal(subtree, true);
	assert.equal(h.observers[0].target.id, "body");
});

test("a replaced native row, a rebuilt bell or a new badge gets its badge ensured", () => {
	for (const node of [
		element([".sidebar-notification"]),
		element([], [".sidebar-notification .item-anchor"]),
		element([".bnd-bell"]),
		element([".bnd-inbox-badge"]),
	]) {
		const h = harness();
		h.context.inbox_observe();
		h.observers[0].callback([{ addedNodes: [node], removedNodes: [] }]);
		assert.equal(h.frames.length, 1, "one paint is queued");
		h.frames[0]();
		assert.equal(h.calls.ensure, 1);
	}
});

test("unrelated nodes cost nothing", () => {
	const h = harness();
	h.context.inbox_observe();
	h.observers[0].callback([{ addedNodes: [element([".form-control"]), { nodeType: 3 }], removedNodes: [] }]);
	assert.equal(h.frames.length, 0);
});
