const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const js = read("bunood_theme/public/js/finance_close.js");
const page = read("bunood_theme/bunood_theme/page/bnd_finance_close/bnd_finance_close.js");
const pageJson = read("bunood_theme/bunood_theme/page/bnd_finance_close/bnd_finance_close.json");
const py = read("bunood_theme/finance_close.py");
const api = read("bunood_theme/api.py");
const build = read("build.mjs");
const boot = read("bunood_theme/boot.py");
const assets = read("bunood_theme/assets.py");
const scss = read("bunood_theme/public/scss/surfaces/_finance_close.scss");
const workspace = read("bunood_theme/bunood_theme/workspace/reports/reports.json");
const ar = read("bunood_theme/translations/ar.csv");

test("unavailable native close evidence is never rendered as null, absence or an empty clean queue", () => {
 const vm = require("node:vm");
 const start = js.indexOf("function metric(");
 const end = js.indexOf("function renderPhases(", start);
 assert.ok(start >= 0 && end > start);
 const context = {__:x=>x,el:(tag,cls,text)=>({tag,cls,text,children:[],append(...nodes){this.children.push(...nodes);}})};
 vm.runInNewContext(js.slice(start,end),context);
 const text = node => [node.text,...node.children.flatMap(text)].filter(x=>x!==undefined);
 assert.ok(text(context.metric("Draft",null,"",false)).includes("Unavailable"));
 assert.ok(text(context.metric("Draft",0,"",false)).includes("0"));
 assert.ok(text(context.controlCard("Control","","",null)).includes("Unavailable"));
 assert.ok(!text(context.controlCard("Control","","",null)).includes("Not observed"));
 assert.ok(text(context.controlCard("Control","","",false)).includes("Not observed"));
 assert.deepEqual(text(context.renderAttention({attention:[],summary:{attention_count:null},query_errors:[]})),["Attention now","Unavailable"]);
 assert.deepEqual(text(context.renderAttention({attention:[],summary:{attention_count:0},query_errors:["Sales Invoice"]})),["Attention now","Unavailable"]);
 assert.ok(text(context.renderAttention({attention:[],summary:{attention_count:0},query_errors:[]})).some(value=>value.startsWith("No draft or failed")));
});

test("finance close is a lazy standard Page reachable from Reports", () => {
	assert.match(pageJson, /"name": "bnd-finance-close"/);
	assert.match(page, /frappe\.boot\.bnd_finance_close_js/);
	assert.match(build, /key: "bnd-finance-close", src: "finance_close\.js", pyid: "FINANCE_CLOSE_JS"/);
	assert.match(boot, /bootinfo\.bnd_finance_close_js = FINANCE_CLOSE_JS/);
	assert.match(assets, /FINANCE_CLOSE_JS = "\/assets\/bunood_theme\/dist\/js\/bnd-finance-close\.[a-f0-9]+\.js"/);
	assert.match(workspace, /"label": "Finance and close"/);
	assert.match(workspace, /"link_to": "bnd-finance-close"/);
});

test("close evidence is permission filtered and performs no accounting mutation", () => {
	assert.match(py, /from bunood_theme\.accounting_desk import read_native_rows/);
	assert.match(py, /read_native_rows\(/);
	const reader = fs.readFileSync("bunood_theme/accounting_desk.py", "utf8");
	assert.match(reader, /frappe\.get_list\(/);
	assert.match(reader, /get_permitted_fields/);
	assert.match(reader, /NATIVE_ROW_CAP \+ 1/);
	assert.match(py, /check_permission\("read"\)/);
	assert.doesNotMatch(py, /get_all|db\.sql|ignore_permissions|\.save\(|\.insert\(|\.submit\(|set_value/);
	assert.match(api, /def finance_close_cockpit/);
	assert.match(py, /"protection-present"/);
	assert.doesNotMatch(py, /state = "(?:complete|approved|reconciled)"/);
});

test("the UI distinguishes voucher, period restriction and frozen date", () => {
	assert.match(js, /Transfers Profit and Loss to the selected closing account; it does not lock posting\./);
	assert.match(js, /Restricts configured document types; it does not transfer profit or loss\./);
	assert.match(js, /Broad Company posting cut-off; authorised roles may bypass it\./);
	assert.match(js, /Not evaluated remains different from complete\./);
	assert.doesNotMatch(js, /innerHTML/);
});

test("the close surface is responsive, logical and Arabic-cursive safe", () => {
	assert.match(js, /setAttribute\("role", "status"\)/);
	assert.match(js, /setAttribute\("aria-live", "polite"\)/);
	assert.match(scss, /@include bnd-until\(md\)/);
	assert.match(scss, /padding-inline|margin-inline|border-inline/);
	assert.doesNotMatch(scss, /letter-spacing|margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)/);
});

test("operator-facing close language is present in the generated Arabic catalogue", () => {
	for (const source of [
		"Finance and close",
		"Attention now",
		"Period Closing Voucher",
		"Accounting Period",
		"Accounts frozen through",
		"No draft or failed native records were observed in the selected boundary. This is not close approval.",
	]) {
		assert.ok(ar.split(/\r?\n/).some((line) => line.startsWith(source + ",")), source);
	}
});

test("the first evidence loads once the default company has actually been set", () => {
	// A Link control sets its value only after validating it: reading it right
	// after set_value saw "" and the desk never loaded on arrival.
	assert.match(js, /Promise\.resolve\(company\.set_value\(defaultCompany\)\)\.then\(\(\) => \{\s+if \(company\.get_value\(\)\) load\(\);/);
	assert.doesNotMatch(js, /\n\t\tif \(company\.get_value\(\)\) load\(\);/);
	assert.match(js, /Promise\.resolve\(frappe\.call\(\{\s+method: METHOD,/);
});

test("until the first evidence loads, the desk says what to choose and that nothing is posted", () => {
	assert.match(js, /const prompt = el\("section", "bnd-close__prompt"\);/);
	assert.match(js, /__\("Review the period before closing"\)/);
	assert.match(js, /content\.append\(prompt\);/);
	assert.match(js, /function renderResult\(data, content\) \{\s+content\.replaceChildren\(\);/, "the first result replaces it");
	assert.match(scss, /&__prompt \{[^}]*border-inline-start: 4px solid var\(--bnd-brand\);/s);
	assert.ok(ar.split(/\r?\n/).some((line) => line.startsWith("Review the period before closing,")), "Review the period before closing");
});
