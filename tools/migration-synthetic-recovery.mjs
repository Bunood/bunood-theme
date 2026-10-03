/** Failure and correction lineage on the disposable two-site migration clone. */
import assert from "node:assert/strict";
import { benchJson } from "./session.mjs";

assert.equal(process.env.BND_BACKEND, "bunoodpilotverify-backend-1");
const phase = process.argv[2];
const source = "bndsynthetic.localhost";
const target = "rc20.localhost";
const name = "BND Synthetic Recovery Unit";
if (phase?.startsWith("source-")) assert.equal(process.env.BND_SITE, source);
else assert.equal(process.env.BND_SITE, target);

if (phase === "source-duplicate") {
	const result = benchJson([
		"import hashlib",
		"from frappe.utils.file_manager import save_file",
		"from bunood_theme.migration_scope import prepare_native_data_import",
		"frappe.set_user('Administrator')",
		"assert frappe.db.exists('UOM', 'Nos')",
		"content = b'ID,UOM Name,Must be Whole Number\\n,Nos,0\\n'",
		"run = frappe.copy_doc(frappe.get_doc('Bunood Migration Run', 'BND-MIG-2026-00003'))",
		"run.source_system = 'Synthetic Duplicate'",
		"run.scope_reason = 'One existing UOM to verify native failed-row evidence.'",
		"row = run.datasets[0]",
		"row.dataset_name = 'Synthetic duplicate UOM'",
		"row.source_entity = 'synthetic-duplicate-uom-csv'",
		"row.source_snapshot_hash = hashlib.sha256(content).hexdigest()",
		"row.mapping_version = 'synthetic-duplicate-v1'",
		"row.manifest_reference = 'Frozen synthetic duplicate CSV hash'",
		"row.profiling_reference = 'One UOM already present in the target'",
		"run.insert(); run.submit()",
		"prepared = prepare_native_data_import(run.name, run.datasets[0].name)",
		"native = frappe.get_doc('Data Import', prepared['name'])",
		"file = save_file('bnd-synthetic-duplicate.csv', content, 'Data Import', native.name, is_private=1)",
		"native.import_file = file.file_url; native.save(); frappe.db.commit()",
		"print(json.dumps({'run':run.name,'dataset':run.datasets[0].name,'data_import':native.name,'source_hash':row.source_snapshot_hash}))",
	].join("\n") + "\n");
	console.log(`PASS frozen duplicate packet: ${JSON.stringify(result)}`);
} else if (phase === "target-duplicate" || phase === "capture-duplicate") {
	const capture = phase === "capture-duplicate";
	const result = benchJson([
		"from bunood_theme.migration_rehearsal import start_isolated_migration_rehearsal, capture_isolated_migration_rehearsal, download_isolated_migration_failed_rows",
		"from frappe.core.doctype.data_import.data_import import get_import_status",
		"frappe.set_user('Administrator')",
		"runs = frappe.get_all('Bunood Migration Run', filters={'source_system':'Synthetic Duplicate','docstatus':1}, fields=['name'], order_by='creation desc', limit_page_length=1)",
		"run = frappe.get_doc('Bunood Migration Run', runs[0].name)",
		...(capture ? [
			"receipt = frappe.get_last_doc('Bunood Migration Rehearsal')",
			"native = get_import_status(receipt.data_import)",
			"out = capture_isolated_migration_rehearsal(receipt.name)",
			"frappe.response.clear()",
			"download_isolated_migration_failed_rows(receipt.name)",
			"filecontent = frappe.response.get('result') or ''",
			"frappe.db.commit()",
			"print(json.dumps({'status':native,'capture':out,'csv_bytes':len(filecontent),'csv_has_nos':b'Nos' in filecontent if isinstance(filecontent,bytes) else 'Nos' in filecontent,'nos_count':frappe.db.count('UOM',{'name':'Nos'})},default=str))",
		] : [
			"out = start_isolated_migration_rehearsal(run.name, run.datasets[0].name)",
			"frappe.db.commit()",
			"print(json.dumps({'run':run.name,'receipt':out['name'],'enqueued':out['native_job_enqueued']}))",
		]),
	].join("\n") + "\n");
	if (capture) {
		console.log(`Native failed-row export evidence: ${JSON.stringify(result)}`);
		assert.equal(result.capture.control_state, "exception");
		assert.equal(result.csv_has_nos, true);
		assert.ok(result.csv_bytes > 20);
		assert.equal(result.nos_count, 1);
	} else assert.equal(result.enqueued, true);
	console.log(`PASS native duplicate ${capture ? "failed-row receipt/export" : "import enqueued"}: ${JSON.stringify(result)}`);
} else if (phase === "source-failure") {
	const result = benchJson([
		"import hashlib",
		"from frappe.utils.file_manager import save_file",
		"from bunood_theme.migration_scope import prepare_native_data_import",
		"frappe.set_user('Administrator')",
		"content = b'ID,UOM Name,Category\\n,BND Synthetic Recovery Unit,No Such Category\\n'",
		"run = frappe.copy_doc(frappe.get_doc('Bunood Migration Run', 'BND-MIG-2026-00003'))",
		"run.source_system = 'Synthetic Recovery'",
		"run.scope_reason = 'A single intentionally invalid UOM category, followed by a controlled correction.'",
		"row = run.datasets[0]",
		"row.dataset_name = 'Synthetic UOM recovery'",
		"row.source_entity = 'synthetic-recovery-uom-csv'",
		"row.source_snapshot_hash = hashlib.sha256(content).hexdigest()",
		"row.mapping_version = 'synthetic-recovery-v1'",
		"row.manifest_reference = 'Frozen synthetic failure CSV hash'",
		"row.profiling_reference = 'One expected invalid UOM Category link'",
		"run.insert(); run.submit()",
		"prepared = prepare_native_data_import(run.name, run.datasets[0].name)",
		"native = frappe.get_doc('Data Import', prepared['name'])",
		"file = save_file('bnd-synthetic-recovery-bad.csv', content, 'Data Import', native.name, is_private=1)",
		"native.import_file = file.file_url; native.save(); frappe.db.commit()",
		"print(json.dumps({'run':run.name,'dataset':run.datasets[0].name,'data_import':native.name,'source_hash':row.source_snapshot_hash}))",
	].join("\n") + "\n");
	console.log(`PASS frozen failure packet: ${JSON.stringify(result)}`);
} else if (phase === "target-failure" || phase === "target-correction") {
	const corrected = phase === "target-correction";
	const result = benchJson([
		"from bunood_theme.migration_rehearsal import start_isolated_migration_rehearsal",
		"frappe.set_user('Administrator')",
		"runs = frappe.get_all('Bunood Migration Run', filters={'source_system':'Synthetic Recovery','docstatus':1}, fields=['name'], order_by='creation desc', limit_page_length=1)",
		"assert runs",
		"run = frappe.get_doc('Bunood Migration Run', runs[0].name)",
		`assert bool(run.supersedes_migration_run) is ${corrected ? "True" : "False"}`,
		"assert not frappe.db.exists('UOM', 'BND Synthetic Recovery Unit')",
		"out = start_isolated_migration_rehearsal(run.name, run.datasets[0].name)",
		"frappe.db.commit()",
		"print(json.dumps({'run':run.name,'receipt':out['name'],'enqueued':out['native_job_enqueued'],'corrected':bool(run.supersedes_migration_run)}))",
	].join("\n") + "\n");
	assert.equal(result.enqueued, true);
	console.log(`PASS native ${corrected ? "correction" : "failure"} import enqueued: ${JSON.stringify(result)}`);
} else if (phase === "capture-failure" || phase === "capture-correction") {
	const corrected = phase === "capture-correction";
	const result = benchJson([
		"from bunood_theme.migration_rehearsal import capture_isolated_migration_rehearsal",
		"from frappe.core.doctype.data_import.data_import import get_import_status",
		"frappe.set_user('Administrator')",
		"runs = frappe.get_all('Bunood Migration Run', filters={'source_system':'Synthetic Recovery','docstatus':1}, fields=['name'], order_by='creation desc', limit_page_length=1)",
		"run = frappe.get_doc('Bunood Migration Run', runs[0].name)",
		"receipts = frappe.get_all('Bunood Migration Rehearsal', filters={'migration_run':run.name}, fields=['name'], order_by='creation desc', limit_page_length=1)",
		"receipt = frappe.get_doc('Bunood Migration Rehearsal', receipts[0].name)",
		"native = get_import_status(receipt.data_import)",
		"out = capture_isolated_migration_rehearsal(receipt.name)",
		"frappe.db.commit()",
		"receipt.reload()",
		"print(json.dumps({'run':run.name,'status':native,'capture':out,'receipt_digest':receipt.receipt_digest,'prior_digest':run.prior_rehearsal_receipt_digest,'uom_exists':bool(frappe.db.exists('UOM','BND Synthetic Recovery Unit'))},default=str))",
	].join("\n") + "\n");
	assert.equal(result.capture.completed, true);
	assert.equal(result.capture.control_state, corrected ? "dry-run-validated" : "exception");
	assert.equal(result.uom_exists, corrected);
	assert.match(result.receipt_digest, /^[a-f0-9]{64}$/);
	console.log(`PASS ${corrected ? "corrected" : "failed"} native receipt: ${JSON.stringify(result)}`);
} else if (phase === "source-correction") {
	const prior = process.env.BND_PRIOR_RECEIPT || "";
	assert.match(prior, /^[a-f0-9]{64}$/);
	const result = benchJson([
		"import hashlib",
		"from frappe.utils.file_manager import save_file",
		"from bunood_theme.migration_scope import prepare_corrected_migration_packet, prepare_native_data_import",
		"frappe.set_user('Administrator')",
		"runs = frappe.get_all('Bunood Migration Run', filters={'source_system':'Synthetic Recovery','docstatus':1}, fields=['name'], order_by='creation desc', limit_page_length=1)",
		"predecessor = frappe.get_doc('Bunood Migration Run', runs[0].name)",
		"content = b'ID,UOM Name,Category\\n,BND Synthetic Recovery Unit,\\n'",
		`prior = ${JSON.stringify(prior)}`,
		"prepared = prepare_corrected_migration_packet(predecessor.name, prior, 'Remove the invalid UOM Category link; keep the same UOM identity.')",
		"run = frappe.get_doc('Bunood Migration Run', prepared['name'])",
		"run.authority_confirmed = 1",
		"row = run.datasets[0]",
		"row.source_snapshot_hash = hashlib.sha256(content).hexdigest()",
		"row.mapping_version = 'synthetic-recovery-v2'",
		"row.manifest_reference = 'Frozen corrected synthetic CSV hash'",
		"row.profiling_reference = 'Same UOM identity; valid empty optional Category'",
		"run.save(); run.submit()",
		"data_import = prepare_native_data_import(run.name, run.datasets[0].name)",
		"native = frappe.get_doc('Data Import', data_import['name'])",
		"file = save_file('bnd-synthetic-recovery-corrected.csv', content, 'Data Import', native.name, is_private=1)",
		"native.import_file = file.file_url; native.save(); frappe.db.commit()",
		"print(json.dumps({'run':run.name,'supersedes':run.supersedes_migration_run,'prior_digest':run.prior_rehearsal_receipt_digest,'source_hash':row.source_snapshot_hash,'data_import':native.name}))",
	].join("\n") + "\n");
	assert.equal(result.prior_digest, prior);
	console.log(`PASS corrected source packet frozen: ${JSON.stringify(result)}`);
} else {
	throw new Error("Usage: migration-synthetic-recovery.mjs source-failure|target-failure|capture-failure|source-correction|target-correction|capture-correction");
}
