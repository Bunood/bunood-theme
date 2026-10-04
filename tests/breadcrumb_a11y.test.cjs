// bunood.js decorate_crumbs: the current crumb is announced and bidi-isolated,
// and a hidden cached page cannot rename the pane.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\tfunction decorate_crumbs() {");
const body = js.slice(start, js.indexOf("\n\t}\n", start));

test("the trail's last link is the current page, with its own direction", () => {
	assert.ok(start > 0, "decorate_crumbs is found");
	assert.match(body, /const current_link = trail\.querySelector\("li:last-child > a"\);/);
	assert.match(body, /current_link\.setAttribute\("aria-current", "page"\);/);
	assert.match(body, /current_link\.setAttribute\("dir", "auto"\);/);
});

test("only a visible trail names the pane's workspace", () => {
	assert.match(body, /if \(trail\.closest\("\.page-container"\)\?\.offsetParent != null\) \{\s+sb_current_workspace = ws;\s+sb_update_head\(\);\s+\}/);
	assert.doesNotMatch(body, /ws = hit;\s+sb_current_workspace = ws;/);
});
