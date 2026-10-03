#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-decision-support-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-15", "BI-01", "BI-02", "BI-03", "BI-04", "BI-05", "FIN-09"]);
export const REQUIRED_ROLES = Object.freeze([
	"business-owner", "finance-manager", "accountant", "cashier-supervisor", "sales-manager", "buyer",
	"warehouse-manager", "governed-report-author", "administrator", "auditor-reviewer",
]);
export const REQUIRED_METRIC_STATES = Object.freeze([
	"draft", "accounting-review", "product-review", "approved", "active", "suspended", "superseded", "retired",
]);
export const REQUIRED_RESULT_STATES = Object.freeze([
	"loading", "configured-empty", "current", "stale", "partial", "permission-limited", "source-unavailable",
	"calculation-error", "reconciliation-difference-open", "reconciled",
]);
export const REQUIRED_METRIC_FIELDS = Object.freeze([
	"business-question", "arabic-and-english-label-and-description", "business-owner-and-technical-owner",
	"formula-and-inclusion-exclusion-rules", "native-source-report-document-ledger-and-fields",
	"document-status-and-cancellation-basis", "company-legal-entity-and-consolidation-basis",
	"date-timezone-period-and-as-of-basis", "currency-exchange-rate-and-presentation-basis",
	"cost-center-project-branch-warehouse-and-other-dimensions", "effective-role-user-and-row-permissions",
	"refresh-frequency-freshness-threshold-and-stale-behavior", "comparison-target-trend-and-variance-basis",
	"drill-down-route-filters-and-source-voucher", "rounding-precision-sign-and-display-unit",
	"zero-empty-partial-denied-error-and-unavailable-behavior", "version-effective-date-reviewer-and-change-reason",
]);
export const REQUIRED_INVARIANTS = Object.freeze([
	"one-business-question-has-one-approved-definition-per-effective-context",
	"draft-cancelled-amended-and-submitted-documents-are-treated-explicitly",
	"order-commitment-invoice-revenue-receivable-payment-cash-and-bank-remain-distinct",
	"gross-profit-is-not-promoted-unless-stock-cost-and-return-boundaries-are-reliable",
	"current-stale-partial-permission-limited-empty-and-error-results-remain-distinct",
	"same-company-date-currency-dimension-and-status-filters-reproduce-the-promoted-value",
	"summary-drill-down-export-print-and-scheduled-delivery-reconcile-for-the-same-scope",
	"effective-user-permissions-apply-before-aggregation-export-and-delivery",
	"dashboard-or-custom-report-cannot-mutate-native-documents-or-ledgers",
	"custom-report-publication-requires-owner-review-version-and-recovery-path",
	"metric-cache-cannot-leak-data-across-user-company-customer-or-tenant-boundaries",
	"arabic-and-english-show-equivalent-meaning-state-number-currency-and-date-context",
	"decorative-charts-do-not-replace-owned-exceptions-next-actions-or-source-evidence",
	"financial-tax-and-management-interpretation-requires-qualified-review",
]);
export const REQUIRED_DECISION_CHAIN = Object.freeze([
	"submitted-native-document-ledger-or-approved-operational-source",
	"effective-company-role-user-and-row-permission-filter", "approved-versioned-metric-or-report-definition",
	"explicit-date-currency-dimension-status-and-comparison-context", "calculation-query-cache-and-freshness-result",
	"owner-pulse-role-work-queue-or-question-led-report", "exact-filter-drill-down-to-permitted-source-voucher-or-ledger-row",
	"governed-save-export-print-schedule-and-delivery", "reconciliation-difference-owner-review-and-change-history",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"sales-commitment-delivery-invoice-return-revenue-receivable-and-cash",
	"purchase-order-receipt-bill-return-payable-and-cash", "payment-ledger-payment-entry-provider-settlement-bank-and-gl",
	"stock-ledger-valuation-cogs-gross-profit-count-and-gl", "vat-source-documents-tax-ledgers-return-support-and-gl",
	"trial-balance-general-ledger-financial-statements-and-source-vouchers",
	"company-currency-finance-book-period-cost-center-project-branch-and-dimensions",
	"metric-card-work-queue-report-drill-down-export-print-and-scheduled-copy",
	"definition-version-effective-date-result-snapshot-review-and-change-history",
	"current-result-to-difference-category-amount-age-owner-due-date-and-resolution",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"metric-dictionary-definition-version-owner-review-and-retirement",
	"owner-pulse-cash-sales-margin-receivable-payable-vat-stock-and-trends",
	"cashier-sales-buyer-warehouse-accountant-and-finance-next-action-queues",
	"question-led-report-catalogue-discovery-saved-view-filter-group-and-column",
	"financial-statement-ledger-ageing-tax-stock-and-source-drill-down",
	"company-date-timezone-currency-finance-book-period-dimension-and-status-consistency",
	"role-row-field-export-print-schedule-recipient-and-cross-tenant-permissions",
	"custom-report-request-author-review-test-publish-change-disable-and-recover",
	"arabic-english-rtl-ltr-label-number-date-currency-export-and-print-parity",
	"loading-empty-stale-partial-denied-unavailable-error-difference-and-reconciled-states",
	"query-cache-refresh-schedule-delivery-performance-monitoring-and-isolation",
	"controlled-data-reconciliation-real-role-usability-support-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"signed-metric-dictionary-business-accounting-technical-owner-version-and-change-log",
	"controlled-current-prior-zero-empty-stale-partial-error-return-cancel-and-correction-datasets",
	"owner-cash-sales-margin-receivable-payable-vat-stock-trend-question-and-decision-study",
	"cashier-sales-buyer-warehouse-accountant-finance-queue-question-and-next-action-study",
	"trial-balance-gl-financial-statement-ageing-tax-stock-payment-and-source-reconciliation",
	"company-date-timezone-period-currency-finance-book-cost-center-project-branch-and-dimension-matrix",
	"role-user-row-field-dashboard-report-drill-export-print-schedule-api-and-cross-tenant-negative-tests",
	"custom-report-request-source-query-review-publish-version-disable-rollback-and-audit-scenarios",
	"arabic-english-desktop-tablet-compact-phone-keyboard-screen-reader-export-print-and-email",
	"freshness-cache-refresh-background-job-delivery-retry-duplicate-outage-and-recovery-scenarios",
	"query-dashboard-drill-export-and-schedule-load-latency-resource-and-data-isolation-results",
	"candidate-version-fixture-hash-difference-log-review-signoff-support-runbook-and-retention",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"business-question-metric-definition-target-comparison-owner-and-action-policy",
	"financial-statement-accounting-standard-classification-consolidation-and-disclosure-policy",
	"vat-zakat-tax-period-source-record-return-support-retention-and-review-policy",
	"company-currency-finance-book-dimension-history-and-management-reporting-policy",
	"role-row-export-print-schedule-recipient-sharing-and-confidentiality-policy",
	"custom-report-author-query-code-review-change-publish-disable-and-support-policy",
	"cache-refresh-freshness-performance-monitoring-incident-recovery-and-retention-policy",
	"production-controlled-period-accounting-product-security-privacy-and-owner-signoff",
]);

const duplicates = (values = []) => { const seen = new Set(); return values.filter(value => seen.has(value) || !seen.add(value)); };
const sameMembers = (actual = [], expected = []) => actual.length === expected.length && expected.every(value => actual.includes(value));
function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual || [], expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}
function requireTrue(errors, value, path) { if (value !== true) errors.push(`${path} must remain true`); }

export function readRegister(path = DEFAULT_REGISTER) { return JSON.parse(readFileSync(path, "utf8")); }

export function validateDecisionSupportContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of ["not financial, accounting or tax advice", "approved management report", "reconciled metric", "audit opinion", "release acceptance"]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) errors.push("authority must point to the reporting and decision-support contract");
	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.metric_definition_states, REQUIRED_METRIC_STATES, "metric_definition_states");
	requireExact(errors, register?.result_states, REQUIRED_RESULT_STATES, "result_states");
	requireExact(errors, register?.metric_definition_fields, REQUIRED_METRIC_FIELDS, "metric_definition_fields");
	requireExact(errors, register?.outcome_invariants, REQUIRED_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.decision_chain, REQUIRED_DECISION_CHAIN, "decision_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");
	if (register?.native_authority?.engine !== "erpnext-native-submitted-documents-ledgers-reports-permissions-and-workspaces") errors.push("native_authority.engine must remain erpnext-native-submitted-documents-ledgers-reports-permissions-and-workspaces");
	for (const field of [
		"parallel-kpi-ledger-or-reporting-database-prohibited", "metrics-and-reports-read-permission-filtered-native-sources",
		"dashboards-cannot-create-or-mutate-accounting-stock-tax-payment-truth",
		"saved-scheduled-exported-results-preserve-effective-user-permissions",
		"custom-report-code-data-source-and-change-lifecycle-governed",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);
	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") errors.push(`control_domains.${domain.id}.state must remain planned until controlled-data acceptance exists`);
	if (register?.acceptance?.minimum_controlled_datasets_or_periods !== 2) errors.push("acceptance.minimum_controlled_datasets_or_periods must be 2");
	for (const field of [
		"requires_normal_and_exception_dataset", "requires_exact_metric_report_drill_export_print_and_schedule_reconciliation",
		"requires_permission_and_cross_tenant_negative_tests", "requires_zero_empty_stale_partial_denied_error_and_difference_states",
		"requires_real_owner-and-operational-role_question-task-acceptance",
		"requires_candidate_bound_bilingual_responsive_accessible_and_performance_evidence",
		"requires_qualified_finance_accounting_tax_security_and_privacy_review",
		"structural_validation_is_not_metric_reconciliation_financial_advice_audit_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);
	return Object.freeze({ valid: !errors.length, errors: Object.freeze(errors), controls: domains.length, metricStates: register?.metric_definition_states?.length || 0, resultStates: register?.result_states?.length || 0, evidenceGroups: register?.required_evidence_groups?.length || 0 });
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateDecisionSupportContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 reporting and decision-support register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no metric, management report, accounting, tax, audit or release acceptance was evaluated.");
		console.log(`controls=${result.controls} metric_states=${result.metricStates} result_states=${result.resultStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(`Decision-support contract check failed: ${error.message}`); process.exitCode = 2; });
