const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const page = JSON.parse(read("bunood_theme/bunood_theme/page/bnd_zatca/bnd_zatca.json"));
const loader = read("bunood_theme/bunood_theme/page/bnd_zatca/bnd_zatca.js");
const ui = read("bunood_theme/public/js/zatca_workspace.js");
const server = read("bunood_theme/zatca/status.py");
const workspace = JSON.parse(read("bunood_theme/bunood_theme/workspace/reports/reports.json"));

test("ZATCA is a permissioned route with isolated, content-hashed assets", () => {
	assert.equal(page.name, "bnd-zatca");
	assert.deepEqual(page.roles.map((row) => row.role).sort(), ["Accounts Manager", "Accounts User", "Auditor", "System Manager"]);
	assert.match(read("build.mjs"), /key: "bnd-zatca", src: "zatca_workspace\.scss", pyid: "ZATCA_CSS"/);
	assert.match(read("build.mjs"), /key: "bnd-zatca", src: "zatca_workspace\.js", pyid: "ZATCA_JS"/);
	assert.match(read("bunood_theme/boot.py"), /bootinfo\.bnd_zatca_css = ZATCA_CSS[\s\S]*bootinfo\.bnd_zatca_js = ZATCA_JS/);
	assert.match(loader, /load\(css, "css"\)\.then\(\(\) => load\(js, "js"\)\)/);
	assert.match(loader, /window\.bunood_theme\.zatca_render/);
});

test("Reports workspace content and shortcut both link to the dedicated Page", () => {
	const blocks = JSON.parse(workspace.content);
	const block = blocks.find((entry) => entry.data?.shortcut_name === "ZATCA workspace");
	assert.equal(block?.type, "shortcut");
	assert.equal(block?.data.col, 12);
	assert.equal(workspace.shortcuts.find((row) => row.label === "ZATCA workspace")?.link_to, "bnd-zatca");
	assert.match(read("bunood_theme/public/js/report_landing.js"), /label: "ZATCA workspace"[\s\S]*route: \["bnd-zatca"\]/);
});

test("workspace is read-only and makes Sandbox versus Production boundary explicit", () => {
	assert.match(server, /@frappe\.whitelist\(methods=\["GET"\]\)\ndef get_workspace/);
	assert.match(server, /frappe\.get_list\(\s*"Company"/);
	assert.match(server, /filters=\{"company": company, "docstatus": 1\}/);
	assert.match(server, /filters\["invoice_doctype"\] = doctype/);
	assert.doesNotMatch(ui, /queue_invoice|submit_to_zatca|\.onboard\(/);
	assert.match(ui, /settings\.server !== "Sandbox"/);
	assert.match(ui, /__\("Sandbox evidence is not Production approval\./);
	assert.match(ui, /const LIST_METHOD = "bunood_theme\.zatca\.monitor\.list_invoices"/);
	assert.match(ui, /if \(data\.can_read_records\) head\.append\(action\(__\("Open native ZATCA records"\)/);
});

test("new operator copy is present in the Arabic catalogue", () => {
	const ar = read("bunood_theme/translations/ar.csv");
	for (const phrase of ["ZATCA workspace", "Sandbox path", "Recent invoice evidence", "Sandbox evidence is not Production approval."]) {
		assert.ok(ar.includes(phrase), `${phrase} must be translated`);
	}
});
