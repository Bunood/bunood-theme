const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const api = fs.readFileSync("bunood_theme/api.py", "utf8");
const js = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const css = fs.readFileSync("bunood_theme/public/scss/surfaces/_home.scss", "utf8");
const ar = fs.readFileSync("bunood_theme/locale/ar.po", "utf8");

test("pre-live observations remain native permission-filtered facts", () => {
  const start = api.indexOf("def _launch_observations");
  const end = api.indexOf("\ndef _base_outstanding", start);
  const implementation = api.slice(start, end);
  for (const doctype of [
    "Company",
    "Account",
    "Cost Center",
    "Warehouse",
    "Item",
    "Price List",
    "Customer",
    "Supplier",
    "Mode of Payment",
    "POS Profile",
    "User",
    "Sales Taxes and Charges Template",
    "Print Format",
    "Sales Invoice",
    "Payment Entry",
  ]) assert.ok(implementation.includes(`"${doctype}"`), doctype);
  for (const key of [
    "company",
    "accounting",
    "tax_zatca",
    "stock",
    "commercial",
    "parties",
    "payments",
    "access",
    "output",
    "operations",
    "integrations",
    "first_transaction",
  ]) assert.match(implementation, new RegExp(`facts\\[?\\"${key}\\"\\]?|\\"${key}\\":`), key);
  assert.match(implementation, /from bunood_theme\.zatca\.status import get_status/);
  assert.match(implementation, /_combined_native_fact\(/);
  assert.match(implementation, /derive_launch_readiness\(facts\)/);
  assert.match(api, /def _launch_record_fact[\s\S]*include_change=True/);
  assert.match(api, /frappe\.has_permission\(doctype, "write"\)[\s\S]*frappe\.has_permission\(doctype, "create"\)/);
  assert.doesNotMatch(implementation, /frappe\.get_roles|ignore_permissions/);
  assert.doesNotMatch(implementation, /frappe\.get_all|\.insert\(|\.save\(|\.submit\(/);
  assert.match(api, /result\["launch_readiness"\] = _launch_observations\(selected, allowed\.get\(selected\)\)/);
});

test("Home presents pre-live evidence as a disclosure rather than a scorecard", () => {
  const start = js.indexOf("const HOME_LAUNCH_CHECKS");
  const end = js.indexOf("\n\tfunction home_render_dashboard", start);
  const implementation = js.slice(start, end);
  for (const key of [
    "company",
    "accounting",
    "tax_zatca",
    "stock",
    "commercial",
    "parties",
    "payments",
    "access",
    "output",
    "operations",
    "integrations",
    "first_transaction",
  ]) {
    assert.match(implementation, new RegExp(`\\n\\t\\t${key}: \\{`));
  }
  assert.match(implementation, /el\("details", "bnd-launch-review"\)/);
  assert.match(implementation, /const needs_next_review\s*=\s*!work \|\|\s*!work\.review \|\|/s);
  assert.match(implementation, /frappe\.set_route\(\.\.\.route\)/);
  assert.match(implementation, /const HOME_LAUNCH_ROLES/);
  assert.match(implementation, /const HOME_LAUNCH_CONSEQUENCES/);
  assert.match(implementation, /Responsible role: \{0\}/);
  assert.match(implementation, /If unresolved: \{0\}/);
  assert.match(implementation, /check\.action_mode === "change" \? __\("Open setup"\) : __\("View details"\)/);
  assert.match(
    implementation,
    /permission-filtered observations\. Task completion and a domain review receipt are not tax, ZATCA, accounting or whole-launch approval/
  );
  assert.doesNotMatch(implementation, /launch_ready|percent|percentage|score|pill/i);
});

test("pre-live disclosure uses ruled rows neutral findings and responsive focus", () => {
  const start = css.indexOf(".bnd-launch-review");
  const end = css.indexOf(".bnd-home-panel-head", start);
  const implementation = css.slice(start, end);
  for (const selector of [
    ".bnd-launch-summary",
    ".bnd-launch-check",
    ".bnd-launch-check-side",
    ".bnd-launch-finding",
    ".bnd-launch-consequence",
    ".bnd-launch-owner",
    ".bnd-launch-action",
    ".bnd-launch-note",
  ]) {
    assert.match(implementation, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(implementation, /\.bnd-launch-summary:focus-visible/);
  assert.match(implementation, /--bnd-critical/);
  assert.match(implementation, /--bnd-warn/);
  assert.doesNotMatch(implementation, /--bnd-good|--bnd-brand-solid|radius-pill/);
  assert.match(css, /@include bnd-until\(md\)[\s\S]*\.bnd-launch-summary/);
});

test("pre-live operator copy has reviewed Arabic and an explicit non-approval warning", () => {
  const expected = new Map([
    ["Before live sales", "قبل بدء المبيعات الفعلية"],
    ["Company identity and fiscal setup", "هوية الشركة والإعداد المالي"],
    ["Accounts and dimensions", "الحسابات والأبعاد"],
    ["VAT, ZATCA and legal output", "ضريبة القيمة المضافة والفوترة الإلكترونية والمخرجات النظامية"],
    ["Warehouse, stock and valuation", "المستودع والمخزون والتقييم"],
    ["Cash, payments and POS", "النقد والمدفوعات ونقطة البيع"],
    ["Privacy, backup and support", "الخصوصية والنسخ الاحتياطي والدعم"],
    ["First transaction and handoff", "المعاملة الأولى والتسليم"],
    ["Responsible role: {0}", "الدور المسؤول: {0}"],
    ["If unresolved: {0}", "إذا لم تُحل: {0}"],
    ["Open setup", "فتح الإعداد"],
    ["View details", "عرض التفاصيل"],
    [
      "These are permission-filtered observations. Task completion and a domain review receipt are not tax, ZATCA, accounting or whole-launch approval.",
      "هذه ملاحظات تراعي الصلاحيات. إكمال المهمة أو سجل مراجعة مجال واحد ليس اعتمادًا ضريبيًا أو محاسبيًا أو للفوترة الإلكترونية أو للتشغيل الفعلي بأكمله.",
    ],
  ]);
  for (const [source, translation] of expected) {
    assert.ok(ar.includes(`msgid "${source}"\nmsgstr "${translation}"`), source);
  }
  assert.match(ar, /msgid "These are permission-filtered observations[\s\S]*ليس اعتمادًا/);
});
