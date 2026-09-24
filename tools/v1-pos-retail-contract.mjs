#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-pos-retail-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-23", "OTC-02", "OTC-04", "FIN-03", "KSA-02", "KSA-04"]);
export const REQUIRED_ROLES = Object.freeze([
	"cashier", "shift-supervisor", "store-manager", "returns-operator",
	"inventory-operator", "finance-reconciler", "pos-administrator", "support-operator",
]);
export const REQUIRED_READINESS_STATES = Object.freeze([
	"not-configured", "profile-incomplete", "user-not-assigned", "device-needs-attention",
	"printer-needs-attention", "payment-needs-attention", "zatca-needs-attention",
	"opening-required", "ready", "degraded-online", "blocked", "closed",
]);
export const REQUIRED_SALE_STATES = Object.freeze([
	"new-cart", "cart-in-progress", "held-draft", "validation-required", "checkout-ready",
	"payment-in-progress", "payment-ambiguous", "payment-failed", "submitted-native",
	"receipt-pending", "receipt-issued", "zatca-pending", "zatca-warning-or-rejected",
	"return-or-refund-in-progress", "returned-or-refunded", "cancelled-before-submit",
]);
export const REQUIRED_SHIFT_STATES = Object.freeze([
	"opening-draft", "open", "active", "handover-pending", "count-in-progress",
	"difference-open", "closing-draft", "closing-submitted", "posting-or-consolidation-pending",
	"posted", "reconciliation-required", "reconciled",
]);
export const REQUIRED_OUTCOME_INVARIANTS = Object.freeze([
	"cashier-must-have-one-authorized-company-profile-warehouse-and-open-session",
	"item-name-price-quantity-and-total-are-primary-while-code-remains-secondary",
	"cart-held-draft-submitted-sale-payment-receipt-zatca-settlement-and-reconciliation-are-distinct",
	"browser-device-or-provider-success-cannot-prove-payment-or-settlement",
	"unknown-timeout-or-duplicate-event-cannot-create-a-second-sale-payment-stock-or-tax-effect",
	"cash-card-wallet-transfer-and-other-tenders-post-to-approved-company-accounts-or-clearing",
	"discount-rate-void-return-refund-and-writeoff-follow-server-permission-and-policy",
	"change-due-cash-count-deposit-and-bank-credit-remain-distinct",
	"offline-capability-cannot-be-claimed-without-durable-queue-conflict-replay-and-reconciliation",
	"return-or-credit-note-links-and-preserves-original-invoice-payment-stock-tax-and-zatca-evidence",
	"shift-close-does-not-mean-ledgers-posted-until-the-pinned-native-posting-model-completes",
	"receipt-print-pdf-xml-qr-and-screen-values-reconcile-to-the-same-native-sale",
	"closing-difference-has-method-category-owner-evidence-approval-and-resolution",
	"support-access-cannot-bypass-cashier-company-profile-warehouse-or-customer-boundaries",
	"ui-device-or-connector-state-cannot-override-stock-payment-tax-zatca-closing-or-gl-truth",
]);
export const REQUIRED_SALE_CHAIN = Object.freeze([
	"cashier-profile-session-and-opening-float", "customer-or-approved-walk-in-context",
	"item-price-stock-tax-discount-and-cart", "tender-authorization-capture-change-and-payment-evidence",
	"native-pos-or-sales-invoice-and-stock-tax-payment-effects", "receipt-pdf-xml-qr-and-zatca-operational-state",
	"return-credit-note-refund-and-original-reference", "shift-closing-native-posting-or-consolidation-and-finance-reconciliation",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"cart-lines-to-native-invoice-item-quantity-uom-price-discount-tax-and-total",
	"native-sale-to-stock-reservation-or-movement-and-stock-ledger-under-pinned-model",
	"tender-lines-to-mode-of-payment-company-account-clearing-and-payment-ledger",
	"cash-opening-sales-refunds-paid-outs-count-variance-handoff-deposit-and-bank-credit",
	"card-or-wallet-capture-refund-chargeback-fee-settlement-clearing-bank-and-gl",
	"native-invoice-to-receivable-income-tax-cogs-stock-payment-and-gl",
	"invoice-to-receipt-pdf-xml-qr-zatca-response-and-customer-output",
	"original-to-return-credit-note-refund-stock-tax-payment-zatca-and-gl",
	"shift-invoices-tenders-refunds-voids-count-difference-closing-and-posting",
	"closing-or-consolidated-documents-to-source-pos-invoices-stock-payment-tax-and-gl",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"profile-company-user-warehouse-price-tax-payment-print-and-zatca-readiness",
	"opening-float-device-printer-network-and-shift-readiness",
	"name-barcode-search-cart-uom-price-stock-and-customer",
	"discount-rate-void-hold-resume-and-supervisor-approval",
	"cash-card-wallet-transfer-mixed-partial-failed-and-ambiguous-payment",
	"native-submit-receipt-print-pdf-xml-qr-and-zatca-state",
	"original-linked-return-credit-note-refund-and-exchange",
	"shift-count-difference-handover-closing-posting-and-reconciliation",
	"offline-or-degraded-queue-conflict-replay-idempotency-and-recovery",
	"role-company-store-profile-warehouse-account-customer-and-support-isolation",
	"arabic-english-touch-keyboard-scanner-screen-reader-and-receipt-usability",
	"performance-observability-incident-device-support-retention-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"approved-profile-company-warehouse-price-tax-payment-print-user-and-zatca-configuration",
	"open-ready-degraded-blocked-handover-and-close-readiness-scenarios",
	"name-code-barcode-uom-price-stock-customer-cart-hold-and-resume-scenarios",
	"permissioned-rate-discount-void-writeoff-and-supervisor-approval-scenarios",
	"cash-card-wallet-transfer-mixed-partial-failed-timeout-duplicate-and-replay-tenders",
	"native-sale-stock-tax-payment-receipt-pdf-xml-qr-and-zatca-reconciliation",
	"full-partial-paid-unpaid-stock-nonstock-return-credit-refund-and-exchange-scenarios",
	"opening-float-tender-refund-variance-handover-deposit-provider-settlement-closing-and-gl-reconciliation",
	"offline-or-degraded-durable-queue-conflict-replay-idempotency-reconnect-and-data-loss-exercise",
	"cashier-supervisor-manager-finance-admin-support-company-store-profile-warehouse-and-customer-negative-tests",
	"arabic-english-accepted-device-width-touch-keyboard-scanner-screen-reader-printer-and-real-qr-scan",
	"candidate-version-load-soak-latency-error-observability-incident-recovery-retention-support-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"company-store-pos-profile-warehouse-user-customer-price-tax-and-dimension-policy",
	"cash-card-wallet-transfer-clearing-change-writeoff-refund-and-settlement-accounts",
	"rate-discount-void-return-refund-exchange-hold-and-supervisor-threshold-policy",
	"opening-float-cash-count-variance-handover-deposit-shift-close-and-review-policy",
	"zatca-standard-simplified-receipt-xml-qr-reporting-and-correction-configuration",
	"supported-device-browser-scanner-printer-drawer-network-and-degraded-operation-matrix",
	"provider-commercial-authorisation-security-settlement-refund-chargeback-and-support-terms",
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

export function validatePosRetailContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not zatca or tax advice", "payment-provider approval", "cashier/device acceptance receipt",
		"reconciled shift", "release acceptance",
	]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the POS retail operations contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.readiness_states, REQUIRED_READINESS_STATES, "readiness_states");
	requireExact(errors, register?.sale_states, REQUIRED_SALE_STATES, "sale_states");
	requireExact(errors, register?.shift_states, REQUIRED_SHIFT_STATES, "shift_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_OUTCOME_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.sale_chain, REQUIRED_SALE_CHAIN, "sale_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-pos-profile-opening-invoice-closing-stock-payment-tax-and-gl") {
		errors.push("native_authority.engine must remain erpnext-native-pos-profile-opening-invoice-closing-stock-payment-tax-and-gl");
	}
	for (const field of [
		"parallel_cart_sale_stock_tender_or_shift_ledger_prohibited", "pinned_erpnext_pos_posting_model_must_be_verified",
		"submitted_documents_remain_immutable", "simple_and_expert_share_records",
		"direct_stock_payment_tax_or_generated_ledger_edit_prohibited",
		"ui_device_or_connector_state_cannot_override_native_financial_truth",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") {
		errors.push(`control_domains.${domain.id}.state must remain planned until controlled-open-to-close acceptance exists`);
	}

	if (register?.acceptance?.minimum_controlled_open_to_close_cycles !== 2) {
		errors.push("acceptance.minimum_controlled_open_to_close_cycles must be 2");
	}
	for (const field of [
		"requires_normal_and_exception_cycle", "requires_exact_sale_stock_tax_payment_zatca_closing_and_gl_reconciliation",
		"requires_cash_and_non_cash_and_mixed_tender", "requires_return_refund_and_ambiguous_payment_recovery",
		"requires_offline_claim_to_pass_durable_replay_conflict_and_reconciliation_if_promoted",
		"requires_real_cashier_supervisor_and_finance_task_acceptance", "requires_physical_receipt_printer_and_real_qr_scan",
		"requires_candidate_bound_bilingual_device_accessibility_and_performance_evidence",
		"requires_qualified_accounting_saudi_tax_and_operations_review",
		"structural_validation_is_not_pos_device_payment_zatca_reconciliation_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		readinessStates: register?.readiness_states?.length || 0,
		saleStates: register?.sale_states?.length || 0,
		shiftStates: register?.shift_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validatePosRetailContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 POS retail register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no device, payment, ZATCA, shift-reconciliation or release acceptance was evaluated.");
		console.log(`controls=${result.controls} readiness_states=${result.readinessStates} sale_states=${result.saleStates} shift_states=${result.shiftStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`POS retail contract check failed: ${error.message}`);
	process.exitCode = 2;
});
