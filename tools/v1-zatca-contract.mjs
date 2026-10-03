#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-zatca-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["KSA-01", "KSA-02", "KSA-03", "KSA-04", "KSA-05"]);
export const REQUIRED_ROLES = Object.freeze([
	"business-owner", "saudi-tax-accounting-reviewer", "compliance-manager",
	"invoice-operator", "system-administrator", "credential-security-administrator",
	"support-operator", "auditor",
]);
export const REQUIRED_READINESS_STATES = Object.freeze([
	"out-of-scope", "phase1-generation", "phase2-notified", "sandbox-configured",
	"compliance-csid-issued", "compliance-checks-passed", "production-csid-issued",
	"active", "expiring", "suspended", "revoked", "error",
]);
export const REQUIRED_DOCUMENT_STATES = Object.freeze([
	"draft", "submitted-native", "generated", "local-validation-failed", "signed",
	"queued", "submission-in-flight", "cleared", "cleared-with-warnings", "reported",
	"reported-with-warnings", "rejected", "delayed", "duplicate-response",
	"correction-required", "corrected-by-note",
]);
export const REQUIRED_OUTCOME_INVARIANTS = Object.freeze([
	"generated-is-not-signed-queued-sent-acknowledged-cleared-or-reported",
	"sdk-valid-is-not-zatca-approval",
	"http-or-api-acknowledgement-is-not-clearance-or-reporting-acceptance",
	"standard-document-is-buyer-deliverable-only-after-authentic-clearance",
	"simplified-document-remains-due-for-reporting-until-authentic-response",
	"accepted-with-warnings-remains-owned-exception-not-clean-success",
	"unknown-timeout-and-temporary-nonresponse-remain-delayed",
	"duplicate-response-requires-exact-prior-success-reconciliation",
	"retry-cannot-change-business-identity-uuid-counter-or-signed-payload",
	"correction-links-and-preserves-original-payload-request-and-response",
	"production-and-sandbox-credentials-counters-artefacts-and-results-cannot-mix",
	"connector-state-cannot-override-native-tax-stock-payment-or-gl-truth",
	"placeholder-or-regenerated-qr-is-not-evidence",
]);
export const REQUIRED_DOCUMENT_CHAIN = Object.freeze([
	"submitted-native-invoice-or-credit-debit-note",
	"native-tax-receivable-stock-and-gl-effect",
	"immutable-regulated-source-snapshot",
	"signed-xml-uuid-counter-and-previous-invoice-hash",
	"environment-egs-and-idempotent-request-attempt",
	"authentic-zatca-response-warnings-errors-and-returned-artefacts",
	"buyer-output-archive-operational-state-and-correction-link",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"seller-buyer-identity-and-standard-simplified-classification",
	"native-document-to-net-discount-charge-tax-gross-and-rounding",
	"native-document-to-signed-xml-elements-uuid-and-payload-hash",
	"egs-counter-and-previous-invoice-hash-continuity",
	"payload-environment-request-correlation-and-authentic-response",
	"response-to-qr-stamp-a4-thermal-and-buyer-delivery",
	"native-tax-accounts-vat-reports-receivable-payment-ledger-and-gl",
	"stock-document-to-stock-ledger-where-applicable",
	"original-to-credit-debit-note-payment-refund-stock-tax-and-gl",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"company-legal-vat-address-phase-and-branch-readiness",
	"vat-classification-tax-templates-rounding-and-native-accounting",
	"egs-compliance-production-csid-key-and-environment-governance",
	"standard-clearance-before-buyer-delivery",
	"simplified-local-issue-reporting-deadline-and-retry",
	"xml-signature-uuid-counter-hash-qr-and-archive-integrity",
	"warning-rejection-delay-duplicate-and-idempotent-recovery",
	"credit-debit-note-original-reference-and-correction-accounting",
	"role-company-branch-egs-secret-and-support-isolation",
	"queue-clock-monitoring-incident-backup-restore-and-upgrade",
	"bilingual-accessible-physical-output-and-operator-experience",
	"official-rule-monitoring-qualified-review-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"current-official-specification-and-qualified-saudi-tax-accounting-compliance-review",
	"owner-confirmed-company-address-vat-branch-egs-phase-and-wave-evidence",
	"sandbox-compliance-production-csid-expiry-renew-revoke-and-clone-restore-isolation",
	"standard-invoice-and-standard-credit-debit-note-clearance-before-delivery",
	"simplified-invoice-and-simplified-credit-debit-note-issue-and-reporting",
	"local-validator-accepted-warning-rejected-delayed-duplicate-and-correction-corpus",
	"idempotent-retry-uuid-counter-hash-request-response-and-environment-binding",
	"native-invoice-xml-qr-a4-thermal-tax-stock-payment-ledger-and-gl-reconciliation",
	"role-company-branch-egs-environment-secret-and-cross-tenant-negative-tests",
	"deadline-queue-worker-clock-credential-and-continuity-monitoring-incident-exercise",
	"bilingual-desktop-narrow-accessible-physical-print-and-real-qr-scan",
	"immutable-candidate-connector-version-evidence-retention-support-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"legal-entity-vat-national-address-branches-egs-and-phase-wave-scope",
	"vat-rates-categories-exemptions-zero-reasons-reverse-charge-and-accounts",
	"standard-simplified-special-self-billing-and-correction-classification-rules",
	"sandbox-production-endpoints-csid-key-custody-expiry-renew-and-revoke",
	"invoice-note-fields-arabic-content-xml-qr-a4-thermal-and-retention",
	"queue-reporting-deadline-clearance-delivery-retry-and-incident-procedures",
	"roles-segregation-company-branch-device-support-and-audit-access",
	"connector-version-security-backup-restore-clone-and-change-management",
	"marketing-claims-evidence-packet-configured-company-and-production-go-live",
]);

function duplicates(values = []) {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

function sameMembers(actual = [], expected = []) {
	return actual.length === expected.length && expected.every(value => actual.includes(value));
}

function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual || [], expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}

function requireTrue(errors, value, path) {
	if (value !== true) errors.push(`${path} must remain true`);
}

export function readRegister(path = DEFAULT_REGISTER) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateZatcaContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not legal or tax advice", "zatca certification", "provider approval",
		"configured-company compliance receipt", "production authorisation",
	]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the Saudi ZATCA operations contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.readiness_states, REQUIRED_READINESS_STATES, "readiness_states");
	requireExact(errors, register?.document_states, REQUIRED_DOCUMENT_STATES, "document_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_OUTCOME_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.document_chain, REQUIRED_DOCUMENT_CHAIN, "document_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-transactions-ledgers-and-pinned-ksa-connector") {
		errors.push("native_authority.engine must remain erpnext-native-transactions-ledgers-and-pinned-ksa-connector");
	}
	for (const field of [
		"parallel_tax_or_accounting_ledger_prohibited",
		"regulated_xml_signing_counter_hash_qr_and_transport_delegated",
		"direct_generated_ledger_edit_prohibited",
		"connector_state_cannot_override_native_financial_truth",
		"simple_and_expert_share_records", "credentials_never_returned_to_browser",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) {
		if (domain.state !== "planned") {
			errors.push(`control_domains.${domain.id}.state must remain planned until configured-company acceptance exists`);
		}
	}

	if (register?.acceptance?.minimum_controlled_environment_cycles !== 2) {
		errors.push("acceptance.minimum_controlled_environment_cycles must be 2");
	}
	for (const field of [
		"requires_sandbox_and_authorised_production_cycle",
		"requires_standard_and_simplified_invoice_and_note_flows",
		"requires_warning_rejection_delay_duplicate_and_correction_recovery",
		"requires_exact_native_xml_output_tax_stock_payment_and_gl_reconciliation",
		"requires_distinct_preparer_reviewer_and_credential_owner",
		"requires_authentic_zatca_response_for_clearance_or_reporting",
		"requires_candidate_and_connector_version_bound_evidence",
		"requires_current_official_and_qualified_review",
		"structural_validation_is_not_zatca_or_tax_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		readinessStates: register?.readiness_states?.length || 0,
		documentStates: register?.document_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateZatcaContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 Saudi ZATCA operations register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no legal, tax, ZATCA, configured-company or production acceptance was evaluated.");
		console.log(`controls=${result.controls} readiness_states=${result.readinessStates} document_states=${result.documentStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Saudi ZATCA contract check failed: ${error.message}`);
	process.exitCode = 2;
});
