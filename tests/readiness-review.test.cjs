const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const service = fs.readFileSync("bunood_theme/readiness_review.py", "utf8");
const controller = fs.readFileSync(
  "bunood_theme/bunood_theme/doctype/bunood_readiness_review/bunood_readiness_review.py",
  "utf8"
);
const form = fs.readFileSync(
  "bunood_theme/bunood_theme/doctype/bunood_readiness_review/bunood_readiness_review.js",
  "utf8"
);
const meta = JSON.parse(
  fs.readFileSync(
    "bunood_theme/bunood_theme/doctype/bunood_readiness_review/bunood_readiness_review.json",
    "utf8"
  )
);
const work = fs.readFileSync("bunood_theme/readiness_work.py", "utf8");
const api = fs.readFileSync("bunood_theme/api.py", "utf8");
const roles = fs.readFileSync("bunood_theme/roles.py", "utf8");
const js = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const arabic = fs.readFileSync("bunood_theme/locale/ar.po", "utf8");

test("readiness review is a bounded submit-only receipt, not a second work ledger", () => {
  assert.equal(meta.name, "Bunood Readiness Review");
  assert.equal(meta.is_submittable, 1);
  assert.equal(meta.track_changes, 1);
  assert.equal(meta.allow_rename, 0);
  const fields = new Map(meta.fields.map((field) => [field.fieldname, field]));
  for (const name of [
    "company",
    "project",
    "task",
    "domain",
    "decision",
    "candidate_reference",
    "qualification_basis",
    "decision_reason",
    "evidence_reference",
    "candidate_digest",
    "receipt_digest",
    "supersedes",
    "chain_key",
  ]) assert.ok(fields.has(name), name);
  assert.equal(fields.get("receipt_digest").unique, 1);
  assert.equal(fields.get("chain_key").unique, 1);
  assert.equal(fields.get("decision").reqd, 0);
  assert.match(fields.get("decision").options, /Accepted\nNeeds Work\nNot Applicable\nReopened/);
  assert.ok(meta.permissions.some((row) => row.role === "Bunood Readiness Reviewer" && row.submit));
  assert.match(roles, /READINESS_REVIEWER_ROLE = "Bunood Readiness Reviewer"/);
  assert.doesNotMatch(meta.name, /Task|Project/);
});

test("submitted receipts bind exact candidate inputs and cannot be cancelled", () => {
  for (const term of [
    "candidate_reference",
    "candidate_snapshot",
    "candidate_digest",
    "receipt_digest",
    "THEME_CSS",
    "PRINT_CSS",
    "THEME_JS",
    '_value(task, "modified")',
  ]) assert.ok(service.includes(term), term);
  assert.match(service, /hashlib\.sha256/);
  assert.match(service, /decision_chain_error/);
  assert.match(controller, /def before_submit/);
  assert.match(controller, /def before_cancel/);
  assert.match(controller, /Create a Reopened receipt instead/);
  assert.doesNotMatch(service, /ignore_permissions|frappe\.get_all|frappe\.get_roles|db_set\(/);
});

test("runtime preparation and summaries preserve current-user permissions", () => {
  assert.match(service, /frappe\.has_permission\(REVIEW_DOCTYPE, "create"\)/);
  assert.match(service, /frappe\.get_list\(/);
  assert.match(service, /task\.check_permission\("read"\)/);
  assert.match(service, /project\.check_permission\("read"\)/);
  assert.match(service, /frappe\.get_doc\(values\)\.insert\(\)/);
  assert.match(work, /review_state_for_work/);
  assert.match(api, /@frappe\.whitelist\(\)[\s\S]*def prepare_readiness_decision/);
});

test("Home distinguishes work from candidate-bound review without declaring launch approval", () => {
  for (const copy of [
    "Review needs reopening",
    "Review recorded; evidence is not visible",
    "Review decision: {0}",
    "Open review",
    "Record review",
    "Reopen review",
  ]) assert.ok(js.includes(copy), copy);
  assert.match(js, /bunood_theme\.api\.prepare_readiness_decision/);
  assert.match(js, /domain review receipt are not tax, ZATCA, accounting or whole-launch approval/);
  assert.match(form, /Create reopening review/);
});

test("readiness review business labels and states are complete in Arabic", () => {
  for (const [source, translated] of [
    ["Bunood Readiness Review", "مراجعة جاهزية بنود"],
    ["Readiness domain", "مجال الجاهزية"],
    ["Candidate reference", "مرجع النسخة المرشحة"],
    ["Qualification and authority basis", "أساس التأهيل والصلاحية"],
    ["Reopened", "أُعيد فتحه"],
    ["accounting", "المحاسبة"],
    ["tax_zatca", "الضريبة والفوترة الإلكترونية"],
    ["first_transaction", "المعاملة الأولى"],
  ]) {
    assert.ok(
      arabic.includes(`msgid "${source}"\nmsgstr "${translated}"`),
      `${source} should have a reviewed Arabic label`
    );
  }
});
