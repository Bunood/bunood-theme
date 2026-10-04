// bunood.js command palette: rows read in the desk's language and run on click.
//
// pal_plain_text and pal_row are lifted out of bunood.js and run in a vm with a
// fake frappe, so the label checks are behaviour, not source text.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");

function rowModel(translate, fuzzy) {
	const start = js.indexOf("\t/** Frappe's presentation tags removed, before our own highlighting. */");
	const end = js.indexOf("\n\t}\n", js.indexOf("\tfunction pal_row(opt, species, txt) {")) + 4;
	assert.ok(start > 0 && end > start, "pal_plain_text and pal_row are found");
	class DOMParser {
		parseFromString(html) {
			return { body: { textContent: String(html).replace(/<[^>]*>/g, "") } };
		}
	}
	const context = {
		DOMParser,
		__: translate,
		frappe: {
			utils: { escape_html: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") },
			search: { utils: { fuzzy_search: fuzzy } },
		},
		pal_frecency: () => 0,
		pal_key: (opt) => "route:" + opt.route,
	};
	vm.runInNewContext(`${js.slice(start, end)}\nthis.pal_row = pal_row;`, context);
	return context.pal_row;
}

test("an Arabic palette shows the translated label, not the English routing value", () => {
	const seen = [];
	const pal_row = rowModel(
		(text) => ({ Item: "الصنف" })[text] || text,
		(txt, against) => { seen.push(against); return null; },
	);
	const row = pal_row({ label: "Item", value: "Item", route: "List/Item" }, "navigate", "ص");
	assert.equal(row.marked, "الصنف");
	assert.deepEqual(seen, ["الصنف"], "the highlight is computed over what the row shows");
});

test("Frappe's presentation markup never reaches the row, and the label is escaped", () => {
	const pal_row = rowModel((text) => text, () => null);
	const row = pal_row({ label: '<span class="bold">Sales</span> & <b>Invoice</b>', value: "Sales Invoice", route: "x" }, "navigate", "");
	assert.equal(row.marked, "Sales &amp; Invoice");
	assert.equal(row.plain, "Sales Invoice");
});

test("a row runs on click; mousedown only keeps focus in the input", () => {
	const element = js.match(/function pal_row_el\(row, flat_index\) \{([\s\S]*?)\n\t\}/)?.[0] || "";
	assert.match(element, /item\.addEventListener\("mousedown", \(ev\) => ev\.preventDefault\(\)\);/);
	assert.match(element, /item\.addEventListener\("click", \(ev\) => \{\s+ev\.preventDefault\(\);\s+pal_execute\(row, ev\.ctrlKey \|\| ev\.metaKey\);/);
	assert.equal((element.match(/pal_execute\(/g) || []).length, 1, "one execution path");
});
