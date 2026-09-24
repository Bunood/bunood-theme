#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-order-to-cash-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-12", "WO-13", "OTC-01", "OTC-02", "OTC-03", "OTC-04", "OTC-05", "KSA-02", "KSA-04"]);
export const REQUIRED_ROLES = Object.freeze([
	"sales-representative", "sales-manager", "customer-master-steward", "credit-controller",
	"fulfilment-operator", "billing-operator", "collections-operator", "customer-portal-user", "accountant-reviewer",
]);
export const REQUIRED_CUSTOMER_STATES = Object.freeze([
	"lead-new", "lead-qualified", "opportunity-open", "opportunity-won", "opportunity-lost",
	"customer-onboarding-incomplete", "customer-active", "customer-credit-review", "customer-on-hold", "customer-disabled",
]);
export const REQUIRED_COMMERCIAL_STATES = Object.freeze([
	"quotation-draft", "quotation-open", "quotation-accepted", "quotation-lost", "quotation-expired",
	"order-draft", "order-pending-approval", "order-submitted", "order-on-hold", "order-partly-delivered",
	"order-partly-billed", "order-completed", "order-short-closed", "delivery-pending", "delivery-completed",
	"invoice-draft", "invoice-submitted", "invoice-partly-paid", "invoice-paid", "invoice-overdue",
	"invoice-disputed", "return-or-credit-in-progress", "returned-or-credited", "cancelled-or-amended",
]);
export const REQUIRED_OUTCOME_INVARIANTS = Object.freeze([
	"lead-opportunity-customer-quotation-order-delivery-invoice-payment-and-return-remain-distinct",
	"quotation-is-an-offer-not-a-confirmed-order-delivery-invoice-or-payment",
	"sales-order-is-a-commitment-not-stock-movement-income-receivable-tax-or-payment",
	"delivery-note-is-fulfilment-not-billing-or-payment",
	"sales-invoice-is-billing-and-receivable-not-proof-of-delivery-or-payment",
	"payment-request-is-a-request-not-proof-of-money-movement",
	"payment-entry-allocation-settlement-and-bank-reconciliation-remain-distinct",
	"submitted-and-shared-documents-are-revised-through-native-version-amend-or-correction-paths",
	"partial-delivery-billing-payment-return-and-short-close-preserve-remaining-quantities-and-values",
	"duplicate-callback-message-or-user-action-cannot-create-a-second-order-delivery-invoice-payment-or-reminder",
	"customer-credit-tax-price-address-contact-and-identity-changes-are-governed-and-audited",
	"portal-user-can-access-only-explicitly-authorized-customer-records-and-files",
	"customer-facing-screen-email-pdf-thermal-xml-qr-and-portal-values-reconcile",
	"simple-mode-cannot-hide-mandatory-commercial-tax-stock-credit-or-accounting-context",
	"portal-ui-or-connector-state-cannot-override-stock-tax-receivable-payment-or-gl-truth",
]);
export const REQUIRED_DOCUMENT_CHAIN = Object.freeze([
	"lead-or-existing-customer-and-consented-contact", "qualified-opportunity-and-owned-next-action",
	"quotation-version-validity-price-tax-and-terms", "accepted-sales-order-and-commitment",
	"pick-delivery-or-approved-direct-fulfilment", "sales-invoice-tax-receivable-stock-and-gl",
	"payment-request-receipt-allocation-settlement-and-outstanding",
	"statement-reminder-promise-dispute-and-collections-history",
	"return-credit-note-refund-and-original-reference", "customer-portal-and-bilingual-commercial-output",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"lead-opportunity-customer-conversion-source-owner-and-identity",
	"quotation-to-order-item-quantity-price-discount-tax-terms-and-validity",
	"order-to-delivery-remaining-short-close-warehouse-and-stock-ledger",
	"order-or-delivery-to-invoice-quantity-value-tax-and-source-reference",
	"invoice-to-receivable-payment-ledger-payment-entry-credit-and-outstanding",
	"payment-link-provider-callback-settlement-clearing-bank-and-gl",
	"statement-ageing-reminder-promise-dispute-to-native-outstanding-and-history",
	"invoice-to-pdf-thermal-email-portal-xml-qr-and-zatca-response",
	"original-to-return-credit-note-refund-stock-tax-payment-receivable-and-gl",
	"sales-stock-tax-receivable-payment-and-gl-to-governed-metrics-and-reports",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"lead-customer-contact-consent-duplicate-identity-and-owner",
	"opportunity-stage-next-action-forecast-loss-and-conversion",
	"quotation-version-price-tax-validity-terms-share-and-acceptance",
	"order-approval-credit-hold-partial-fulfilment-billing-and-short-close",
	"pick-delivery-proof-direct-stock-sale-and-stock-ledger",
	"invoice-vat-zatca-payment-terms-receivable-print-and-correction",
	"payment-request-link-callback-allocation-settlement-refund-and-reconciliation",
	"ageing-statement-reminder-promise-dispute-credit-and-collections",
	"customer-portal-session-record-file-link-revoke-and-cross-customer-isolation",
	"role-company-territory-team-customer-price-credit-and-data-isolation",
	"bilingual-task-first-responsive-accessible-forms-lists-output-and-portal",
	"performance-delivery-monitoring-recovery-retention-support-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"approved-customer-price-credit-tax-fulfilment-billing-payment-communication-and-portal-policy",
	"new-and-existing-lead-opportunity-customer-duplicate-consent-owner-and-conversion-scenarios",
	"quotation-draft-version-send-expire-lose-accept-amend-and-output-scenarios",
	"order-approval-credit-hold-partial-delivery-billing-close-reopen-cancel-and-amend-scenarios",
	"service-stock-direct-delivery-note-partial-backorder-proof-and-stock-scenarios",
	"invoice-vat-zatca-due-partial-payment-dispute-return-credit-refund-and-correction-scenarios",
	"payment-request-link-expiry-revoke-callback-timeout-replay-allocation-settlement-and-gl-scenarios",
	"ageing-statement-reminder-promise-dispute-optout-duplicate-delivery-and-receivable-reconciliation",
	"portal-login-session-record-file-link-download-payment-revoke-and-cross-customer-negative-tests",
	"role-company-territory-team-customer-price-credit-export-api-and-cross-tenant-negative-tests",
	"arabic-english-desktop-phone-keyboard-touch-screen-reader-email-pdf-thermal-xml-qr-and-portal",
	"candidate-version-fixture-hash-load-latency-monitoring-incident-recovery-retention-support-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"customer-identity-duplicate-contact-consent-privacy-retention-and-change-policy",
	"price-list-discount-margin-tax-currency-terms-validity-and-commercial-approval-policy",
	"credit-limit-hold-release-overdue-dispute-writeoff-and-collections-policy",
	"order-delivery-direct-sale-short-close-return-refund-and-correction-policy",
	"saudi-vat-zatca-customer-classification-invoice-note-output-and-retention-policy",
	"payment-provider-link-callback-settlement-security-commercial-and-support-terms",
	"portal-user-customer-mapping-session-file-link-download-revoke-and-support-access-policy",
	"production-cutover-load-monitoring-incident-recovery-retention-support-and-signoff",
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

export function validateOrderToCashContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not sales-policy approval", "credit advice", "saudi tax or zatca advice",
		"portal-security receipt", "reconciled receivable", "release acceptance",
	]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the order-to-cash and customer operations contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.customer_states, REQUIRED_CUSTOMER_STATES, "customer_states");
	requireExact(errors, register?.commercial_states, REQUIRED_COMMERCIAL_STATES, "commercial_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_OUTCOME_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.document_chain, REQUIRED_DOCUMENT_CHAIN, "document_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-crm-selling-stock-invoice-payment-tax-ledgers-and-portal") {
		errors.push("native_authority.engine must remain erpnext-native-crm-selling-stock-invoice-payment-tax-ledgers-and-portal");
	}
	for (const field of [
		"parallel-customer-order-receivable-or-portal-ledger-prohibited",
		"submitted-commercial-and-accounting-documents-remain-immutable", "simple-and-expert-share-records",
		"direct-stock-payment-tax-or-generated-ledger-edit-prohibited",
		"portal-ui-or-connector-state-cannot-override-native-business-or-financial-truth",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") {
		errors.push(`control_domains.${domain.id}.state must remain planned until controlled-cycle acceptance exists`);
	}

	if (register?.acceptance?.minimum_end_to_end_controlled_cycles !== 2) {
		errors.push("acceptance.minimum_end_to_end_controlled_cycles must be 2");
	}
	for (const field of [
		"requires_normal_and_exception_cycle", "requires_service_stock_partial_return_payment_and_correction_paths",
		"requires_exact_stock_tax_receivable_payment_ledger_settlement_and_gl_reconciliation",
		"requires_cross_customer_portal_and_api_isolation",
		"requires_duplicate_idempotency_delivery_revoke_timeout_and_recovery_scenarios",
		"requires_real_sales_fulfilment_billing_collections_customer_and_accounting_task_acceptance",
		"requires_candidate_bound_bilingual_responsive_accessible_output_and_performance_evidence",
		"requires_qualified_commercial_accounting_saudi_tax_privacy_and_security_review",
		"structural_validation_is_not_sales_credit_tax_zatca_portal_reconciliation_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		customerStates: register?.customer_states?.length || 0,
		commercialStates: register?.commercial_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateOrderToCashContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 order-to-cash register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no sales, credit, tax, ZATCA, portal, reconciliation or release acceptance was evaluated.");
		console.log(`controls=${result.controls} customer_states=${result.customerStates} commercial_states=${result.commercialStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Order-to-cash contract check failed: ${error.message}`);
	process.exitCode = 2;
});
