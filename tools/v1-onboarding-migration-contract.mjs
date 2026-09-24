#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-onboarding-migration-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-10", "WO-11"]);
export const REQUIRED_ROLES = Object.freeze([
	"business-owner-sponsor", "implementation-lead", "data-owner", "finance-reviewer",
	"inventory-reviewer", "tax-and-zatca-reviewer", "security-and-privacy-reviewer",
	"system-administrator", "support-auditor",
]);
export const REQUIRED_ONBOARDING_STATES = Object.freeze([
	"not-started", "ready", "in-progress", "needs-review", "blocked", "at-risk",
	"complete", "accepted", "not-applicable-with-reason", "reopened",
]);
export const REQUIRED_READINESS_DOMAINS = Object.freeze([
	"company-identity-localisation-and-fiscal-year",
	"chart-dimensions-and-default-accounts",
	"vat-zatca-tax-and-legal-output",
	"warehouse-stock-uom-and-valuation",
	"items-barcodes-pricing-and-commercial-policy",
	"customers-suppliers-terms-and-credit",
	"cash-bank-payment-methods-and-pos",
	"users-roles-scope-approvals-and-segregation",
	"print-numbering-communications-and-language",
	"privacy-backup-security-retention-and-support",
	"integrations-credentials-and-failure-ownership",
	"first-transaction-reversal-and-handoff",
]);
export const REQUIRED_MIGRATION_STATES = Object.freeze([
	"scoped", "source-frozen", "extracted", "profiled", "mapped", "dry-run-validated",
	"approved-for-load", "importing", "exception", "imported-unreconciled", "reconciled",
	"accepted", "rolled-back", "superseded",
]);
export const REQUIRED_DATA_DEPENDENCY_ORDER = Object.freeze([
	"company-fiscal-year-currency-naming-and-legal-identity",
	"chart-dimensions-tax-accounts-and-defaults",
	"uom-groups-warehouses-and-operational-dimensions",
	"customers-suppliers-addresses-contacts-and-terms",
	"items-variants-barcodes-serial-batch-and-bom-dependencies",
	"price-lists-item-prices-and-commercial-policies",
	"opening-stock-through-native-stock-reconciliation-or-approved-stock-documents",
	"opening-ar-ap-through-opening-invoice-tool-or-approved-native-alternative",
	"cash-bank-advances-and-remaining-trial-balance-without-double-counting",
	"assets-and-other-approved-modules",
	"users-permissions-integrations-and-operational-queues",
]);
export const REQUIRED_ROW_STATES = Object.freeze([
	"validated", "warning", "blocked", "duplicate-candidate", "skipped-with-reason",
	"imported", "rejected", "rolled-back", "reconciled",
]);
export const REQUIRED_SAFETY_INVARIANTS = Object.freeze([
	"uploaded-is-not-validated-imported-reconciled-or-accepted",
	"preview-and-dry-run-cannot-mutate-persistent-business-state",
	"rolled-back-rows-cannot-be-reported-as-imported",
	"display-name-alone-cannot-establish-identity",
	"retry-uses-run-row-mapping-and-native-record-identity",
	"changed-source-or-mapping-invalidates-stale-preview",
	"opening-control-accounts-cannot-be-double-counted",
	"record-count-alone-cannot-accept-financial-data",
	"submitted-native-documents-cannot-be-silently-overwritten",
	"production-secrets-and-unrestricted-personal-data-cannot-enter-ordinary-staging",
	"version-upgrade-site-transfer-and-business-data-migration-have-separate-receipts",
	"not-applicable-and-skip-require-reason-owner-and-consequence",
]);
export const REQUIRED_RECONCILIATION_DOMAINS = Object.freeze([
	"customers-and-suppliers", "items-barcodes-and-uom", "prices-and-validity",
	"opening-stock-quantity-and-value", "receivables-invoices-currency-dates-and-ageing",
	"payables-invoices-currency-dates-and-ageing",
	"trial-balance-accounts-dimensions-debits-and-credits",
	"cash-bank-advances-and-open-allocations", "assets-cost-depreciation-and-net-book-value",
	"vat-and-approved-tax-openings", "cross-ledger-document-payment-stock-and-gl-chain",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"job-led-onboarding-readiness-and-first-outcome",
	"configuration-proposals-review-permissions-and-audit",
	"source-scope-freeze-extract-hash-and-archive",
	"profiling-mapping-normalisation-and-duplicate-disposition",
	"dry-run-validation-preview-and-row-error-recovery",
	"dependency-ordered-native-import-and-idempotent-retry",
	"opening-stock-ar-ap-cash-bank-assets-tax-and-trial-balance",
	"cutover-delta-freeze-smoke-go-no-go-and-hypercare",
	"backup-restore-rollback-and-version-upgrade-separation",
	"role-company-site-privacy-retention-and-export-controls",
	"bilingual-accessible-responsive-help-and-support-handoff",
	"candidate-bound-reconciliation-evidence-and-acceptance",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"fresh-admin-arabic-and-english-first-outcome-without-developer",
	"readiness-rule-permission-owner-consequence-and-reopen-evidence",
	"source-scope-snapshot-hash-row-count-archive-and-late-entry-log",
	"mapping-version-identity-duplicate-and-approved-transformation-pack",
	"clean-and-dirty-dry-run-validation-error-and-no-mutation-proof",
	"dependency-ordered-native-load-result-log-and-idempotent-retry",
	"stock-ar-ap-trial-balance-cash-bank-asset-vat-and-cross-ledger-reconciliation",
	"first-invoice-payment-print-statement-reversal-and-native-ledger-trace",
	"role-company-site-import-export-secret-and-personal-data-negative-tests",
	"backup-complete-restore-rollback-rpo-rto-and-version-upgrade-rehearsal",
	"bilingual-mobile-desktop-keyboard-zoom-help-and-support-handoff",
	"immutable-candidate-bound-run-packet-approvals-variance-and-hypercare-close",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"company-legal-identity-language-currency-fiscal-year-and-branches",
	"accounting-policy-chart-dimensions-opening-strategy-and-source-totals",
	"vat-zatca-tax-templates-environment-and-legal-output",
	"warehouses-valuation-uom-serial-batch-and-stock-count",
	"party-item-natural-keys-duplicate-merge-and-history-archive-policy",
	"users-roles-company-warehouse-approvals-and-segregation",
	"privacy-purpose-access-transfer-processors-retention-and-deletion",
	"cutover-freeze-delta-rollback-rpo-rto-hypercare-and-support",
	"final-reconciliation-variances-run-packet-and-production-go-live",
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

function requireOrdered(errors, actual, expected, path) {
	if (JSON.stringify(actual || []) !== JSON.stringify(expected)) {
		errors.push(`${path} must preserve the required dependency order: ${expected.join(" -> ")}`);
	}
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}

function requireTrue(errors, value, path) {
	if (value !== true) errors.push(`${path} must remain true`);
}

export function readRegister(path = DEFAULT_REGISTER) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateOnboardingMigrationContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not an onboarding usability receipt", "data-migration acceptance receipt",
		"accounting approval", "production cutover approval",
	]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the guided onboarding and migration contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.onboarding_states, REQUIRED_ONBOARDING_STATES, "onboarding_states");
	requireExact(errors, register?.readiness_domains, REQUIRED_READINESS_DOMAINS, "readiness_domains");
	requireExact(errors, register?.migration_states, REQUIRED_MIGRATION_STATES, "migration_states");
	requireOrdered(errors, register?.data_dependency_order, REQUIRED_DATA_DEPENDENCY_ORDER, "data_dependency_order");
	requireExact(errors, register?.row_states, REQUIRED_ROW_STATES, "row_states");
	requireExact(errors, register?.safety_invariants, REQUIRED_SAFETY_INVARIANTS, "safety_invariants");
	requireExact(errors, register?.reconciliation_domains, REQUIRED_RECONCILIATION_DOMAINS, "reconciliation_domains");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-documents-ledgers-and-reports") {
		errors.push("native_authority.engine must remain erpnext-native-documents-ledgers-and-reports");
	}
	for (const field of [
		"parallel_staging_ledger_prohibited", "direct_generated_ledger_edit_prohibited",
		"simple_and_expert_share_records", "dry_run_cannot_mutate_business_state",
		"no_import_success_without_commit_and_reconciliation", "skip_is_not_complete",
		"version_upgrade_is_separate_from_business_data_migration",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) {
		if (domain.state !== "planned") {
			errors.push(`control_domains.${domain.id}.state must remain planned until candidate-bound acceptance exists`);
		}
	}

	if (register?.acceptance?.minimum_controlled_migration_rehearsals !== 2) {
		errors.push("acceptance.minimum_controlled_migration_rehearsals must be 2");
	}
	for (const field of [
		"requires_clean_and_dirty_dataset", "requires_fresh_admin_first_outcome_without_developer",
		"requires_exact_applicable_control_reconciliation",
		"requires_idempotent_retry_and_changed-version_diff",
		"requires_distinct_preparer_and_reviewer_for_material_openings",
		"requires_permission_company_and_site_negative_tests",
		"requires_complete_restore_or_approved_native_rollback",
		"requires_candidate_bound_immutable_evidence",
		"structural_validation_is_not_onboarding_or_migration_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		readinessDomains: register?.readiness_domains?.length || 0,
		migrationStates: register?.migration_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateOnboardingMigrationContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 guided onboarding and migration register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no onboarding usability, migration, accounting or cutover acceptance was evaluated.");
		console.log(`controls=${result.controls} readiness_domains=${result.readinessDomains} migration_states=${result.migrationStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Onboarding and migration contract check failed: ${error.message}`);
	process.exitCode = 2;
});
