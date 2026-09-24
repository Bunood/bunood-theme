const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const json = (file) => JSON.parse(read(file));

const parentPath = "bunood_theme/bunood_theme/doctype/bunood_migration_run/bunood_migration_run.json";
const childPath = "bunood_theme/bunood_theme/doctype/bunood_migration_dataset/bunood_migration_dataset.json";
const rehearsalPath = "bunood_theme/bunood_theme/doctype/bunood_migration_rehearsal/bunood_migration_rehearsal.json";
const rehearsalResultPath = "bunood_theme/bunood_theme/doctype/bunood_migration_rehearsal_result/bunood_migration_rehearsal_result.json";
const reconciliationPath = "bunood_theme/bunood_theme/doctype/bunood_migration_reconciliation/bunood_migration_reconciliation.json";
const controlResultPath = "bunood_theme/bunood_theme/doctype/bunood_migration_control_result/bunood_migration_control_result.json";

test("migration packet is submittable, tracked and permission-bounded", () => {
	const parent = json(parentPath);
	const child = json(childPath);
	assert.equal(parent.is_submittable, 1);
	assert.equal(parent.track_changes, 1);
	assert.equal(parent.allow_rename, 0);
	assert.equal(child.istable, 1);
	assert.deepEqual(
		parent.permissions.map((row) => row.role).sort(),
		["Bunood Migration Manager", "System Manager"]
	);
	for (const row of parent.permissions) {
		assert.equal(row.submit, 1);
		assert.equal(row.cancel || 0, 0);
		assert.equal(row.amend || 0, 0);
	}
});

test("dataset order and native Data Import options match the governed contract", () => {
	const child = json(childPath);
	const fields = Object.fromEntries(child.fields.map((field) => [field.fieldname, field]));
	assert.equal(fields.dependency_stage.options.split("\n").length, 11);
	assert.deepEqual(fields.import_type.options.split("\n"), [
		"",
		"Insert New Records",
		"Update Existing Records",
		"Insert or Update Records",
	]);
	assert.match(fields.source_snapshot_hash.description, /SHA-256/);
	assert.match(fields.identity_rule_reference.description, /Display names alone/);
	assert.deepEqual(fields.duplicate_disposition.options.split("\n").filter(Boolean), [
		"Reject existing matches",
		"Update approved matches only",
		"Insert unmatched and update approved matches",
	]);
});

test("corrected retries retain immutable lineage and explicit duplicate decisions", () => {
	const parent = json(parentPath);
	const fields = Object.fromEntries(parent.fields.map((field) => [field.fieldname, field]));
	const source = read("bunood_theme/migration_scope.py");
	const api = read("bunood_theme/api.py");
	const form = read("bunood_theme/bunood_theme/doctype/bunood_migration_run/bunood_migration_run.js");
	assert.equal(fields.supersedes_migration_run.options, "Bunood Migration Run");
	assert.match(fields.prior_rehearsal_receipt_digest.description, /SHA-256/);
	assert.match(source, /DUPLICATE_DISPOSITION_BY_IMPORT_TYPE/);
	assert.match(source, /def prepare_corrected_migration_packet/);
	assert.match(source, /requires_material_change/);
	const correctionRuntime = source.slice(
		source.indexOf("def prepare_corrected_migration_packet"),
		source.indexOf("def _doctype_exists")
	);
	assert.doesNotMatch(correctionRuntime, /ignore_permissions/);
	assert.match(api, /def prepare_corrected_migration_packet/);
	assert.match(form, /Create corrected packet/);
	assert.match(form, /duplicate_disposition/);
});

test("native handoff preserves permissions and never starts or claims import", () => {
	const source = read("bunood_theme/migration_scope.py");
	const runtime = source.slice(source.indexOf("def prepare_native_data_import"));
	assert.match(runtime, /check_permission\("read"\)/);
	assert.match(runtime, /has_permission\(DATA_IMPORT_DOCTYPE, "create"\)/);
	assert.match(runtime, /has_permission\(target_doctype, "import"\)/);
	assert.doesNotMatch(runtime, /ignore_permissions/);
	assert.doesNotMatch(runtime, /get_all\(/);
	assert.doesNotMatch(runtime, /start_import\(/);
	assert.match(runtime, /"preview_completed": False/);
	assert.match(runtime, /"import_started": False/);
	assert.match(runtime, /"reconciled": False/);
	assert.match(runtime, /"accepted": False/);
});

test("deployment-only seam and user-facing copy state the claim boundary", () => {
	const setup = read("bunood_theme/setup.py");
	const api = read("bunood_theme/api.py");
	const form = read("bunood_theme/bunood_theme/doctype/bunood_migration_run/bunood_migration_run.js");
	assert.equal((setup.match(/ensure_migration_data_import_fields\(\)/g) || []).length, 2);
	assert.match(api, /@frappe\.whitelist\(\)[\s\S]*def prepare_native_data_import/);
	assert.match(form, /does not validate or import business data/);
	assert.match(form, /no production import, reconciliation or acceptance is authorized/);
	assert.doesNotMatch(form, /start_import/);
});

test("isolated rehearsal receipt is submittable, immutable and role bounded", () => {
	const rehearsal = json(rehearsalPath);
	const result = json(rehearsalResultPath);
	assert.equal(rehearsal.is_submittable, 1);
	assert.equal(rehearsal.track_changes, 1);
	assert.equal(rehearsal.allow_rename, 0);
	assert.equal(result.istable, 1);
	assert.deepEqual(
		rehearsal.permissions.map((row) => row.role).sort(),
		["Bunood Migration Manager", "System Manager"]
	);
	for (const row of rehearsal.permissions) {
		assert.equal(row.submit, 1);
		assert.equal(row.cancel || 0, 0);
		assert.equal(row.amend || 0, 0);
	}
	const fields = Object.fromEntries(rehearsal.fields.map((field) => [field.fieldname, field]));
	assert.equal(fields.rehearsal_identity.unique, 1);
	assert.equal(fields.row_results.options, "Bunood Migration Rehearsal Result");
	assert.match(fields.claim_notice.options, /isolated restored site and database/);
});

test("native rehearsal is blocked on source identity and binds the exact frozen file", () => {
	const source = read("bunood_theme/migration_rehearsal.py");
	const start = source.slice(
		source.indexOf("def start_isolated_migration_rehearsal"),
		source.indexOf("def _native_result")
	);
	assert.match(source, /current\["site"\] == source_site/);
	assert.match(source, /current\["database_digest"\] == source_database_digest/);
	assert.match(source, /bunood_migration_rehearsal/);
	assert.match(start, /actual_hash != expected_hash/);
	assert.match(start, /data_import\.start_import\(\)/);
	assert.match(start, /"production_import_authorized": False/);
	assert.doesNotMatch(start, /ignore_permissions/);
	assert.doesNotMatch(start, /get_all\(/);
});

test("terminal rehearsal copies native outcomes without duplicating error text", () => {
	const source = read("bunood_theme/migration_rehearsal.py");
	const capture = source.slice(source.indexOf("def capture_isolated_migration_rehearsal"));
	const storedRow = source.slice(source.indexOf("        result = {"), source.indexOf("        result[\"result_digest\"]"));
	assert.match(source, /get_import_status/);
	assert.match(source, /get_import_logs/);
	assert.match(source, /"message_digest": message_digest/);
	assert.doesNotMatch(storedRow, /messages|exception/);
	assert.match(storedRow, /target_record_digest/);
	assert.doesNotMatch(storedRow, /\n {12}"target_record":/);
	assert.match(capture, /"dry-run-validated" if fully_successful else "exception"/);
	assert.match(capture, /isolated-rehearsal-only-not-production-imported-reconciled-or-accepted/);
	assert.match(capture, /"reconciled": False/);
	assert.match(capture, /"accepted": False/);
});

test("rehearsal actions are exposed only through guarded API wrappers", () => {
	const api = read("bunood_theme/api.py");
	const runForm = read("bunood_theme/bunood_theme/doctype/bunood_migration_run/bunood_migration_run.js");
	const rehearsalForm = read("bunood_theme/bunood_theme/doctype/bunood_migration_rehearsal/bunood_migration_rehearsal.js");
	assert.match(api, /@frappe\.whitelist\(\)[\s\S]*def start_isolated_migration_rehearsal/);
	assert.match(api, /@frappe\.whitelist\(\)[\s\S]*def capture_isolated_migration_rehearsal/);
	assert.match(runForm, /Start isolated rehearsal/);
	assert.match(runForm, /blocked on the frozen source database/);
	assert.match(rehearsalForm, /Refresh native result/);
	assert.match(rehearsalForm, /No production import is authorized/);
});

test("failed-row recovery delegates to the native exporter behind receipt guards", () => {
	const source = read("bunood_theme/migration_rehearsal.py");
	const api = read("bunood_theme/api.py");
	const rehearsalForm = read("bunood_theme/bunood_theme/doctype/bunood_migration_rehearsal/bunood_migration_rehearsal.js");
	const recovery = source.slice(source.indexOf("def download_isolated_migration_failed_rows"));
	assert.match(source, /from frappe\.core\.doctype\.data_import\.data_import import download_errored_template/);
	assert.match(recovery, /check_permission\("read"\)/);
	assert.match(recovery, /control_state[\s\S]*exception/);
	assert.match(recovery, /failed_records/);
	assert.match(recovery, /runtime_environment_identity/);
	assert.match(recovery, /_file_hash\(data_import\)/);
	assert.doesNotMatch(recovery, /download_import_log/);
	assert.doesNotMatch(recovery, /ignore_permissions|get_all\(/);
	assert.match(api, /def download_isolated_migration_failed_rows/);
	assert.match(rehearsalForm, /Download failed rows/);
	assert.match(rehearsalForm, /docstatus === 1/);
	assert.match(rehearsalForm, /control_state === "exception"/);
	assert.match(rehearsalForm, /open_url_post/);
});

test("migration reconciliation receipt is immutable, complete and permission bounded", () => {
	const reconciliation = json(reconciliationPath);
	const control = json(controlResultPath);
	const fields = Object.fromEntries(reconciliation.fields.map((field) => [field.fieldname, field]));
	assert.equal(reconciliation.is_submittable, 1);
	assert.equal(reconciliation.track_changes, 1);
	assert.equal(reconciliation.allow_rename, 0);
	assert.equal(fields.controls.options, "Bunood Migration Control Result");
	assert.match(fields.claim_notice.options, /not a parallel ledger|never authorizes production cutover/i);
	assert.equal(control.istable, 1);
	for (const fieldname of ["source_value", "native_value", "variance"]) {
		assert.equal(
			control.fields.find((field) => field.fieldname === fieldname).fieldtype,
			"Data",
			`${fieldname} must retain exact decimal text without binary-float drift`
		);
	}
	assert.equal(
		control.fields.find((field) => field.fieldname === "domain").options.split("\n").length,
		11
	);
	assert.deepEqual(
		reconciliation.permissions.map((row) => row.role).sort(),
		["Bunood Migration Manager", "System Manager"]
	);
	for (const row of reconciliation.permissions) {
		assert.equal(row.submit, 1);
		assert.equal(row.cancel || 0, 0);
		assert.equal(row.amend || 0, 0);
	}
});

test("reconciliation binds every successful rehearsal and preserves native ledger authority", () => {
	const source = read("bunood_theme/migration_reconciliation.py");
	const api = read("bunood_theme/api.py");
	const rehearsalForm = read("bunood_theme/bunood_theme/doctype/bunood_migration_rehearsal/bunood_migration_rehearsal.js");
	const controller = read("bunood_theme/bunood_theme/doctype/bunood_migration_reconciliation/bunood_migration_reconciliation.py");
	assert.match(source, /def _successful_rehearsal_snapshot/);
	assert.match(source, /control_state[\s\S]*dry-run-validated/);
	assert.match(source, /Every native Data Import dataset needs a submitted successful rehearsal/);
	assert.match(source, /Stock Balance and Stock Ledger/);
	assert.match(source, /Accounts Receivable and Payment Ledger/);
	assert.match(source, /Trial Balance and General Ledger/);
	assert.match(source, /variance == 0/);
	assert.match(source, /Material opening reconciliation requires a reviewer different from the preparer/);
	assert.match(source, /reconciliation-evidence-only-not-production-cutover-or-migration-acceptance/);
	assert.doesNotMatch(source, /ignore_permissions|get_all\(|frappe\.db\.sql/);
	assert.match(controller, /def before_submit/);
	assert.match(controller, /def before_cancel/);
	assert.match(api, /def prepare_migration_reconciliation/);
	assert.match(rehearsalForm, /Prepare reconciliation/);
	assert.match(rehearsalForm, /control_state === "dry-run-validated"/);
});
