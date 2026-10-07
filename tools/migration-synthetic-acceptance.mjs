/** One-row native Data Import rehearsal on a disposable two-site pilot stack. */
import assert from "node:assert/strict";
import { benchJson } from "./session.mjs";

const phase = process.argv[2];
assert.equal(process.env.BND_BACKEND, "bunoodpilotverify-backend-1", "Never run this fixture outside the disposable verify stack");
const SOURCE = "bndsynthetic.localhost";
const TARGET = "rc20.localhost";
if (phase === "source") {
	assert.equal(process.env.BND_SITE, SOURCE, "Source creation must run on the distinct synthetic site");
	const result = benchJson([
		"import hashlib",
		"from frappe.utils.file_manager import save_file",
		"from bunood_theme.migration_scope import prepare_native_data_import",
		"frappe.set_user('Administrator')",
		"content = b'ID,UOM Name,Must be Whole Number\\n,BND Synthetic Rehearsal Unit,0\\n'",
		"source_hash = hashlib.sha256(content).hexdigest()",
		"assert not frappe.db.exists('UOM', 'BND Synthetic Rehearsal Unit')",
		"run = frappe.get_doc({",
		"  'doctype': 'Bunood Migration Run', 'company': 'Bunood Development',",
		"  'strategy': 'Opening Only', 'source_system': 'Synthetic Acceptance',",
		"  'cutover_at': '2026-09-26 12:00:00', 'source_timezone': 'Africa/Cairo',",
		"  'source_date_convention': 'ISO-8601', 'scope_reason': 'One synthetic UOM; no customer or accounting data.',",
		"  'business_owner': 'Administrator', 'implementation_lead': 'Administrator',",
		"  'security_privacy_reviewer': 'Administrator', 'authority_confirmed': 1,",
		"  'duplicate_policy': 'UOM name is unique; reject existing matches.',",
		"  'late_entry_policy': 'No late entries in this synthetic test.',",
		"  'archive_reference': 'Synthetic in-memory CSV', 'retention_policy': 'Disposable verify stack only',",
		"  'freeze_window_start': '2026-09-26 11:00:00', 'freeze_window_end': '2026-09-26 12:00:00',",
		"  'rollback_method': 'Restore complete pre-run site',",
		"  'rollback_point_reference': 'Verified WO-00 disposable baseline',",
		"  'rollback_owner': 'Administrator', 'backup_reference': 'WO-00 disposable baseline',",
		"  'datasets': [{",
		"    'dependency_stage': '03 — Units, groups, warehouses and dimensions',",
		"    'dataset_name': 'Synthetic UOM', 'load_method': 'Data Import',",
		"    'target_doctype': 'UOM', 'import_type': 'Insert New Records',",
		"    'identity_rule_reference': 'UOM name exact match',",
		"    'duplicate_disposition': 'Reject existing matches',",
		"    'source_entity': 'synthetic-uom-csv', 'source_snapshot_hash': source_hash,",
		"    'source_row_count': 1, 'mapping_version': 'synthetic-v1',",
		"    'source_owner': 'Administrator',",
		"    'manifest_reference': 'One-row synthetic CSV SHA-256',",
		"    'profiling_reference': 'Required UOM Name; one unique row',",
		"  }],",
		"})",
		"run.insert(); run.submit()",
		"dataset = run.datasets[0]",
		"prepared = prepare_native_data_import(run.name, dataset.name)",
		"native = frappe.get_doc('Data Import', prepared['name'])",
		"attachment = save_file('bnd-synthetic-uom.csv', content, 'Data Import', native.name, is_private=1)",
		"native.import_file = attachment.file_url; native.save()",
		"frappe.db.commit()",
		"print(json.dumps({'run': run.name, 'dataset': dataset.name, 'data_import': native.name, 'source_hash': source_hash, 'file_url': attachment.file_url, 'source_site': run.source_site, 'source_database_digest': run.source_database_digest}))",
	].join("\n") + "\n");
	assert.equal(result.source_site, SOURCE);
	console.log(`PASS synthetic source packet frozen: ${JSON.stringify(result)}`);
} else if (phase === "target") {
	assert.equal(process.env.BND_SITE, TARGET, "Rehearsal must run on the isolated target site");
	const result = benchJson([
		"from bunood_theme.migration_rehearsal import start_isolated_migration_rehearsal",
		"frappe.set_user('Administrator')",
		"run = frappe.get_last_doc('Bunood Migration Run')",
		"assert run.source_site == 'bndsynthetic.localhost'",
		"assert not frappe.db.exists('UOM', 'BND Synthetic Rehearsal Unit')",
		"result = start_isolated_migration_rehearsal(run.name, run.datasets[0].name)",
		"frappe.db.commit()",
		"print(json.dumps(result))",
	].join("\n") + "\n");
	assert.equal(result.created, true);
	assert.equal(result.isolated_environment, true);
	assert.equal(result.production_import_authorized, false);
	console.log(`PASS isolated native import started: ${JSON.stringify(result)}`);
} else if (phase === "capture") {
	assert.equal(process.env.BND_SITE, TARGET, "Capture must run on the isolated target site");
	const result = benchJson([
		"from bunood_theme.migration_rehearsal import capture_isolated_migration_rehearsal, start_isolated_migration_rehearsal",
		"frappe.set_user('Administrator')",
		"run = frappe.get_last_doc('Bunood Migration Run')",
		"receipt = frappe.get_last_doc('Bunood Migration Rehearsal')",
		"result = capture_isolated_migration_rehearsal(receipt.name)",
		"replay = start_isolated_migration_rehearsal(run.name, run.datasets[0].name) if result.get('completed') else None",
		"frappe.db.commit()",
		"print(json.dumps({'capture': result, 'replay': replay, 'uom_exists': bool(frappe.db.exists('UOM', 'BND Synthetic Rehearsal Unit'))}, default=str))",
	].join("\n") + "\n");
	assert.equal(result.capture.completed, true, "Native import has not reached a terminal state");
	assert.equal(result.capture.dry_run_validated, true, "Native import did not fully succeed");
	assert.equal(result.replay.created, false, "Replaying the same file created a second import");
	assert.equal(result.uom_exists, true, "Native Data Import did not create the synthetic UOM");
	console.log(`PASS isolated rehearsal receipt and replay protection: ${JSON.stringify(result)}`);
} else {
	throw new Error("Usage: node tools/migration-synthetic-acceptance.mjs source|target|capture");
}
