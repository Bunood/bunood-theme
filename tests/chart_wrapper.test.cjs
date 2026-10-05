// bunood.js chart wrapper: Arabic periods, var() colours, one-period lines,
// and a named, read-out chart. The whole patch_chart_colors IIFE runs in a vm
// over a fake frappe.Chart, so this checks behaviour, not source text.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\t(function patch_chart_colors() {");
const end = js.indexOf("\n\t})();\n", start) + "\n\t})();\n".length;
assert.ok(start > 0 && end > start, "the chart patch is found");

function node(tag) {
	const attrs = {};
	return {
		tag, attrs, children: [], listeners: {}, textContent: "", className: "",
		set id(v) { attrs.id = v; }, get id() { return attrs.id; },
		setAttribute(k, v) { attrs[k] = String(v); if (k === "id") this.id = v; },
		appendChild(child) { this.children.push(child); child.parentElement = this; },
		querySelector(sel) {
			return sel === ":scope > .bnd-chart-announcer"
				? this.children.find((c) => String(c.className).includes("bnd-chart-announcer")) || null : null;
		},
		addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
		dispatch(type, event) { for (const fn of this.listeners[type] || []) fn(event); },
		isConnected: true,
	};
}

function harness(lang = "ar") {
	const made = [];
	function NativeChart(parent, options) {
		this.options = options;
		this.container = node("div");
		parent.appendChild(this.container);
		made.push(this);
	}
	NativeChart.prototype = {};
	const tokens = { "--bnd-brand-solid": "#336699" };
	for (let i = 1; i <= 7; i += 1) tokens[`--bnd-series-${i}`] = `#00000${i}`;
	const context = {
		window: {},
		frappe: { Chart: NativeChart, boot: { lang } },
		document: { documentElement: {}, addEventListener() {} },
		getComputedStyle: () => ({ getPropertyValue: (name) => tokens[name] || "" }),
		__: (text) => text,
		el(tag, cls, attrs) {
			const n = node(tag);
			n.className = cls;
			for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
			return n;
		},
		apply_chart_grid_attr() {},
		bunood: {},
		Intl,
	};
	context.window.frappe = context.frappe;
	vm.runInNewContext(js.slice(start, end), context);
	return { Chart: context.frappe.Chart, made };
}

test("an Arabic desk reads month labels in Arabic; English is left alone", () => {
	const ar = harness("ar");
	const parent = node("div");
	ar.Chart(parent, { type: "bar", data: { labels: ["Jan 2026", "Feb 2026", "Q1"], datasets: [] } });
	const labels = [...ar.made[0].options.data.labels];
	assert.notEqual(labels[0], "Jan 2026");
	assert.match(labels[0], /2026$/);
	assert.equal(labels[2], "Q1");
	const en = harness("en");
	en.Chart(node("div"), { type: "bar", data: { labels: ["Jan 2026"], datasets: [] } });
	assert.equal(en.made[0].options.data.labels[0], "Jan 2026");
});

test("an admin colour given as a token reaches the chart resolved", () => {
	const h = harness("en");
	h.Chart(node("div"), { type: "bar", colors: ["var(--bnd-brand-solid)", "", "teal"], data: { labels: ["a", "b"], datasets: [] } });
	const colors = [...h.made[0].options.colors];
	assert.equal(colors[0], "#336699");
	assert.equal(colors[1], "#000002", "an empty slot takes the ramp");
	assert.equal(colors[2], "teal", "a non-token colour is kept");
});

test("a one-period line is drawn as a bar", () => {
	const h = harness("en");
	h.Chart(node("div"), { type: "line", data: { labels: ["Jan 2026"], datasets: [] } });
	assert.equal(h.made[0].options.type, "bar");
	h.Chart(node("div"), { type: "line", data: { labels: ["a", "b"], datasets: [] } });
	assert.equal(h.made[1].options.type, "line");
});

test("a chart is a named group whose selected point is read out, one announcer per host", () => {
	const h = harness("en");
	const parent = node("div");
	const data = { labels: ["Mon", "Tue"], datasets: [{ name: "Sales", values: [3, 5] }] };
	h.Chart(parent, { type: "bar", title: "Weekly sales", data });
	h.Chart(parent, { type: "bar", title: "Weekly sales", data });
	const container = h.made[1].container;
	assert.equal(container.attrs.role, "group");
	assert.equal(container.attrs["aria-label"], "Weekly sales");
	const announcers = parent.children.filter((c) => String(c.className).includes("bnd-chart-announcer"));
	assert.equal(announcers.length, 1, "a re-created chart reuses its host's announcer");
	assert.equal(container.attrs["aria-describedby"], announcers[0].attrs.id);
	parent.dispatch("data-select", { index: 1 });
	assert.equal(announcers[0].textContent, "Tue. Sales: 5");
	assert.equal(parent.listeners["data-select"].length, 1);
});
