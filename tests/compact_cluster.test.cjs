// bunood.js inject_compact_cluster: the page-head cluster on list-to-list hops.
//
// Lifted out of bunood.js and run in a vm against a fake frappe.container and a
// synchronous try_for, so this checks behaviour, not source text.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = source.indexOf("\tfunction inject_compact_cluster() {");
const end = source.indexOf("\t// ── Breadcrumb kit (item 11)", start);
assert.ok(start > 0 && end > start, "inject_compact_cluster is found in bunood.js");
const block = source.slice(start, end);

function pageWith(cluster) {
	const section = {
		children: [],
		querySelector: (sel) => (sel === ".bnd-cluster" ? section.cluster || null : null),
		appendChild(node) { section.children.push(node); },
		cluster: null,
	};
	const page = {
		querySelector(sel) {
			if (sel === ".bnd-cluster") return cluster;
			if (sel === ".page-head .standard-items-section") return section;
			return null;
		},
	};
	return { page, section };
}

function run(container, { attempts = 5, onAttempt = () => {} } = {}) {
	const calls = { mounted: [], placed: 0, badges: 0, reserved: 0 };
	const context = {
		frappe: { container },
		try_for(fn) {
			for (let i = 0; i < attempts; i += 1) {
				onAttempt(i);
				if (fn()) return true;
			}
			return false;
		},
		el: (tag, cls) => ({ tag, cls }),
		reserve_cluster: () => {
			calls.reserved += 1;
			return { setAttribute() {} };
		},
		container_mounted: (name) => calls.mounted.push(name),
		mount_placed_tenants: () => { calls.placed += 1; },
		inbox_ensure_badges: () => { calls.badges += 1; },
	};
	vm.runInNewContext(`${block}\ninject_compact_cluster();`, context);
	return calls;
}

test("a list-to-list hop that reuses the page mounts once the old cluster is detached", () => {
	const outgoingCluster = { isConnected: true };
	const { page } = pageWith(outgoingCluster);
	const container = { page };
	const calls = run(container, {
		onAttempt(i) {
			if (i === 2) {
				// Frappe replaces the head in place: the old cluster detaches, and
				// the same page object now has a fresh head with no cluster.
				outgoingCluster.isConnected = false;
				page.querySelector = (sel) => (sel === ".page-head .standard-items-section"
					? { querySelector: () => null, appendChild() {} } : null);
			}
		},
	});
	assert.equal(calls.reserved, 1, "the reused page gets its cluster");
	assert.deepEqual([...calls.mounted], ["pagehead"]);
});

test("a cached page that still has its cluster re-asserts its stamp, placement and badge", () => {
	const { page, section } = pageWith(null);
	section.cluster = {};
	const calls = run({ page });
	assert.equal(calls.reserved, 0);
	assert.deepEqual([...calls.mounted], ["pagehead"]);
	assert.equal(calls.placed, 1);
	assert.equal(calls.badges, 1);
});
