// Execute the production sidebar helpers against small Frappe boot fixtures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../bunood_theme/public/js/bunood.js", import.meta.url), "utf8");
const helper = source.slice(source.indexOf("function home_sidebar_item("), source.indexOf("function allowed_report_names("));
const decorator = source.slice(source.indexOf("function prepare_zatca_sidebar()"), source.indexOf("function prepare_home_sidebar()"));
assert.ok(helper.startsWith("function home_sidebar_item("));
assert.ok(decorator.startsWith("function prepare_zatca_sidebar()"));

function prepare(boot) {
	const context = { window: { frappe: { boot } }, __: (value) => value };
	runInNewContext(`${helper}\n${decorator}\nthis.prepare_zatca_sidebar = prepare_zatca_sidebar;`, context);
	return context.prepare_zatca_sidebar;
}

const boot = {
	bnd_report_landing_permitted_pages: ["bnd-zatca"],
	workspace_sidebar_item: { Zatca: { items: [{ type: "Link", link_type: "DocType", link_to: "ZATCA Business Settings" }] } },
};
const decorate = prepare(boot);
assert.equal(decorate(), true);
assert.equal(boot.workspace_sidebar_item.Zatca.items[0].link_to, "bnd-zatca");
assert.equal(boot.workspace_sidebar_item.Zatca.items[0].link_type, "Page");
assert.equal(decorate(), false, "sidebar decoration must be idempotent");
assert.equal(boot.workspace_sidebar_item.Zatca.items.length, 2);

const restricted = { bnd_report_landing_permitted_pages: [],
	workspace_sidebar_item: { Zatca: { items: [] } } };
assert.equal(prepare(restricted)(), false);
assert.equal(restricted.workspace_sidebar_item.Zatca.items.length, 0);

const absent = { bnd_report_landing_permitted_pages: ["bnd-zatca"], workspace_sidebar_item: {} };
assert.equal(prepare(absent)(), false);
console.log("ZATCA sidebar permission, idempotency and connector-absent checks passed");
