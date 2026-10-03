// The fixed-asset workbench is wired end to end: endpoint, bundle, boot key,
// Page, payload ledger and its entry points.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("a lazy standard Page over one read-only endpoint", () => {
	const js = read("bunood_theme/public/js/asset_workbench.js");
	const page = JSON.parse(read("bunood_theme/bunood_theme/page/bnd_asset_workbench/bnd_asset_workbench.json"));
	const loader = read("bunood_theme/bunood_theme/page/bnd_asset_workbench/bnd_asset_workbench.js");
	assert.match(js, /const METHOD = "bunood_theme\.api\.asset_workbench";/);
	assert.match(read("bunood_theme/api.py"), /def asset_workbench\(company: str, from_date=None, to_date=None\) -> dict:/);
	assert.match(read("build.mjs"), /key: "bnd-asset-workbench", src: "asset_workbench\.js", pyid: "ASSET_WORKBENCH_JS"/);
	assert.match(read("bunood_theme/boot.py"), /bootinfo\.bnd_asset_workbench_js = ASSET_WORKBENCH_JS/);
	assert.match(read("bunood_theme/assets.py"), /ASSET_WORKBENCH_JS = "\/assets\/bunood_theme\/dist\/js\/bnd-asset-workbench\.[a-f0-9]+\.js"/);
	assert.match(read("tools/payload.mjs"), /prefix: "bnd-asset-workbench\.", key: "asset_workbench_js"/);
	assert.ok(Number.isFinite(JSON.parse(read("payload-budget.json")).ceiling.asset_workbench_js_gzip));
	assert.match(loader, /frappe\.boot && frappe\.boot\.bnd_asset_workbench_js/);
	assert.match(loader, /api\.asset_workbench_render\(container, page\)/);
	assert.equal(page.name, "bnd-asset-workbench");
	assert.deepEqual(page.roles.map((row) => row.role).sort(), ["Accounts Manager", "Accounts User", "Auditor", "System Manager"]);
	assert.doesNotMatch(js, /frappe\.call\(\{\s*method: "frappe\.client\.(insert|save|submit|set_value)/);
});

test("the Reports landing and workspace link it, behind the landing's permission gate", () => {
	assert.match(read("bunood_theme/public/js/report_landing.js"), /route: \["bnd-asset-workbench"\], bootAsset: "bnd_asset_workbench_js"/);
	assert.match(read("bunood_theme/boot.py"), /"bnd-asset-workbench"/);
	const workspace = JSON.parse(read("bunood_theme/bunood_theme/workspace/reports/reports.json"));
	assert.equal(workspace.shortcuts.find((row) => row.label === "Fixed asset workbench")?.link_to, "bnd-asset-workbench");
	assert.ok(JSON.parse(workspace.content).some((block) => block.data?.shortcut_name === "Fixed asset workbench"));
});
