const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const work = fs.readFileSync("bunood_theme/readiness_work.py", "utf8");
const setup = fs.readFileSync("bunood_theme/setup.py", "utf8");
const api = fs.readFileSync("bunood_theme/api.py", "utf8");
const js = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const css = fs.readFileSync("bunood_theme/public/scss/surfaces/_home.scss", "utf8");
const ar = fs.readFileSync("bunood_theme/locale/ar.po", "utf8");

test("readiness work uses native Project Task assignment and attachment records", () => {
  for (const term of [
    '"Project"',
    '"Task"',
    '"File"',
    '"_assign"',
    '"attached_to_doctype": "Task"',
  ]) assert.ok(work.includes(term), term);
  assert.match(work, /PROJECT_IDENTITY_FIELD = "custom_bunood_readiness_identity"/);
  assert.match(work, /TASK_DOMAIN_FIELD = "custom_bunood_readiness_domain"/);
  assert.match(work, /"unique": 1/);
  assert.match(work, /completion_is_approval.*False/);
  assert.doesNotMatch(work, /doctype["']:\s*["']Bunood Readiness/);
});

test("deployment installs the bounded metadata seam while runtime preserves permissions", () => {
  assert.equal((setup.match(/ensure_readiness_work_fields\(\)/g) || []).length, 2);
  const readStart = work.indexOf("def get_readiness_work");
  const readEnd = work.indexOf("\ndef _task_description", readStart);
  const read = work.slice(readStart, readEnd);
  assert.match(read, /frappe\.has_permission/);
  assert.match(read, /frappe\.get_list\(/);
  assert.doesNotMatch(read, /frappe\.get_all|ignore_permissions/);

  const createStart = work.indexOf("def start_readiness_review");
  const create = work.slice(createStart);
  assert.match(create, /frappe\.get_doc\(values\)\.insert\(\)/);
  assert.match(create, /PermissionError/);
  assert.doesNotMatch(create, /ignore_permissions|frappe\.get_roles/);
  assert.match(api, /@frappe\.whitelist\(\)[\s\S]*def start_readiness_review/);
});

test("Home exposes separate setup and native work actions without nested buttons", () => {
  const start = js.indexOf("function home_launch_work_plan");
  const end = js.indexOf("\n\tfunction home_render_dashboard", start);
  const implementation = js.slice(start, end);
  for (const copy of [
    "Create work plan",
    "Open work plan",
    "Open work",
    "Assign in the task",
    "Evidence files: {0}",
  ]) assert.ok(implementation.includes(copy), copy);
  assert.match(implementation, /method: "bunood_theme\.api\.start_readiness_review"/);
  assert.match(implementation, /const content = el\("div", "bnd-launch-check-content"\)/);
  assert.match(implementation, /el\("button", "bnd-launch-action"/);
  assert.doesNotMatch(implementation, /el\(route \? "button"/);
  assert.match(implementation, /Task completion and a domain review receipt are not tax, ZATCA, accounting or whole-launch approval/);

  for (const selector of [
    ".bnd-launch-plan",
    ".bnd-launch-plan-action",
    ".bnd-launch-actions",
    ".bnd-launch-work",
  ]) assert.ok(css.includes(selector), selector);
  assert.doesNotMatch(css, /\.bnd-launch-plan[^\{]*\{[^}]*radius-pill/s);
});

test("readiness work actions and warning have reviewed Arabic", () => {
  const expected = new Map([
    ["Readiness work plan", "خطة أعمال الجاهزية"],
    ["Create work plan", "إنشاء خطة الأعمال"],
    ["Open work plan", "فتح خطة الأعمال"],
    ["Open work", "فتح المهمة"],
    ["Assign in the task", "أسندها من داخل المهمة"],
    ["Work status: {0}", "حالة العمل: {0}"],
  ]);
  for (const [source, translation] of expected) {
    assert.ok(ar.includes(`msgid "${source}"\nmsgstr "${translation}"`), source);
  }
  assert.match(ar, /msgid "Operational work plan only[\s\S]*ليس اعتمادًا/);
});
