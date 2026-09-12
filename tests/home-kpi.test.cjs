const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");

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
