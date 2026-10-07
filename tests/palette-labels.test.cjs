const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");

test("command palette removes Frappe presentation HTML before rendering labels", () => {
	const plainText = js.match(/function pal_plain_text\(value\) \{([\s\S]*?)\n\t\}/)?.[0] || "";
	const row = js.match(/function pal_row\(opt, species, txt\) \{([\s\S]*?)\n\t\}/)?.[0] || "";

	assert.match(plainText, /new DOMParser\(\)/);
	assert.match(plainText, /\.body\.textContent/);
	assert.match(row, /const display = pal_plain_text\(__\(opt\.label \|\| opt\.value \|\| ""\)\)/);
	assert.match(row, /const plain = pal_plain_text\(opt\.value \|\| opt\.label \|\| ""\)/);
	assert.match(row, /let marked = frappe\.utils\.escape_html\(display\)/);
	assert.doesNotMatch(row, /const display = __\(opt\.label/);
});
