const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const api = fs.readFileSync("bunood_theme/api.py", "utf8");
const js = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const css = fs.readFileSync("bunood_theme/public/scss/surfaces/_home.scss", "utf8");
const ar = fs.readFileSync("bunood_theme/locale/ar.po", "utf8");

test("Start readiness uses native records inside the current permission scope", () => {
  const start = api.indexOf("def _native_record_fact");
  const end = api.indexOf("\ndef _base_outstanding", start);
  const implementation = api.slice(start, end);
  assert.match(implementation, /frappe\.db\.exists\("DocType", doctype\)/);
  assert.match(implementation, /frappe\.has_permission\(doctype, "read"\)/);
  assert.match(implementation, /frappe\.has_permission\(doctype, "create"\)/);
  assert.match(implementation, /frappe\.get_list\([\s\S]*fields=\["name"\][\s\S]*limit=1/);
  assert.match(implementation, /query_error = True/);
  assert.match(implementation, /derive_start_readiness\(facts\)/);
  assert.match(implementation, /"payment_type": "Receive"/);
  assert.doesNotMatch(implementation, /frappe\.get_all|\.insert\(|\.save\(|\.submit\(/);
  assert.match(api, /result\["start_readiness"\] = _start_readiness\(selected\)/);
});

test("Start Home guide exposes one ordered native action without fake progress claims", () => {
  const start = js.indexOf("const HOME_START_STEPS");
  const end = js.indexOf("\n\tfunction home_render_dashboard", start);
  const implementation = js.slice(start, end);
  for (const key of ["company", "customer", "item", "invoice", "payment"]) {
    assert.match(implementation, new RegExp(`\\n\\t\\t${key}: \\{`));
  }
  assert.match(implementation, /data\.state === "first-use-complete"/);
  assert.match(implementation, /aria-current", "step"/);
  assert.match(implementation, /frappe\.new_doc\(meta\.doctype\)/);
  assert.match(implementation, /This guide checks saved records\. Tax, ZATCA, print and launch readiness are reviewed separately\./);
  assert.equal((implementation.match(/el\("button", "bnd-start-action"/g) || []).length, 1);
  assert.doesNotMatch(implementation, /percent|percentage|pill/i);
});

test("Start guide is a responsive linear spine with a visible keyboard action", () => {
  for (const selector of [
    ".bnd-start-guide",
    ".bnd-start-steps",
    ".bnd-start-step",
    ".bnd-start-action",
    ".bnd-start-note",
  ]) assert.match(css, new RegExp(selector.replace(".", "\\.")));
  assert.match(css, /\.bnd-start-step\.is-next/);
  assert.match(css, /\.bnd-start-action:focus-visible/);
  assert.match(css, /@include bnd-until\(md\)[\s\S]*\.bnd-start-step/);
  assert.match(css, /min-block-size: 44px/);
  assert.doesNotMatch(css.slice(css.indexOf(".bnd-start-guide"), css.indexOf(".bnd-home-panel-head")), /radius-pill/);
});

test("Start guide Arabic is deliberate and complete for the operator-facing path", () => {
  const expected = new Map([
    ["Get ready to sell", "استعد للبيع"],
    ["Company details", "بيانات الشركة"],
    ["First customer", "أول عميل"],
    ["First product or service", "أول منتج أو خدمة"],
    ["First submitted invoice", "أول فاتورة معتمدة"],
    ["First recorded payment", "أول دفعة مسجلة"],
    ["Add product or service", "إضافة منتج أو خدمة"],
  ]);
  for (const [source, translation] of expected) {
    assert.ok(ar.includes(`msgid "${source}"\nmsgstr "${translation}"`), source);
  }
  assert.match(ar, /msgid "This guide checks saved records\.[\s\S]*هيئة الزكاة والضريبة والجمارك/);
});
