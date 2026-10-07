const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const pilotCss = fs.readFileSync("bunood_theme/public/scss/surfaces/_editorial_pilot.scss", "utf8");

test("Home renders the backend KPI dictionary instead of recomputing values", () => {
  assert.match(source, /for \(const metric of data\.kpis \|\| \[\]\)/);
  assert.match(source, /metric\.value_type === "count"/);
  assert.match(source, /frappe\.set_route\("List", metric\.doctype, metric\.filters\)/);
  assert.doesNotMatch(source, /metrics\.sales_month/);
});

test("every rendered KPI exposes its period and is a button", () => {
  const start = source.indexOf("function home_metric(");
  const end = source.indexOf("\n\t}", start) + 3;
  const implementation = source.slice(start, end);
  assert.match(implementation, /el\("button", "bnd-home-metric/);
  assert.match(implementation, /metric\.period_label/);
  assert.match(implementation, /type: "button"/);
});

test("sales KPI strip explains each figure and exposes its exact list destination", () => {
  for (const key of ["order_count", "booked_value", "invoiced_value", "outstanding_value", "average_order_value"]) {
    assert.match(source, new RegExp(`${key}: \\[__\\("`));
  }
  assert.match(source, /bnd-home-metric-context/);
  assert.match(source, /bnd-home-metric-destination/);
  assert.match(pilotCss, /\.bnd-home-dashboard:not\(\.is-real-estate\) \.bnd-home-icon \{\s*display: grid;/);
  assert.doesNotMatch(pilotCss, /\.bnd-home-dashboard:not\(\.is-real-estate\) \.bnd-home-icon \{\s*display: none;/);
});

test("Home scope and collections keep the selected filters in native drill-downs", () => {
  assert.match(source, /home_scope_bar\(data, root\)/);
  assert.match(source, /home_mount_tasks\(task_actions, profile, data\.scope\?\.view\)/);
  assert.match(source, /bunood_theme\.api\.save_home_preferences/);
  assert.match(source, /home_collections_panel\(data\)/);
  assert.match(source, /frappe\.set_route\("Form", "Sales Invoice", invoice\.name\)/);
  assert.match(source, /frappe\.set_route\("List", "Sales Invoice", group\.filters \|\| \{\}\)/);
  assert.match(source, /"sales_team\.sales_person": data\.invoice_scope\.sales_person/);
  assert.match(source, /home_money\(invoice\.amount, data\.currency, 2\)/);
  assert.match(pilotCss, /\.bnd-home-collection-row\s*\{/);
});
