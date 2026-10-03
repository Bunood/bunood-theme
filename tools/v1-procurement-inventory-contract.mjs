#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-procurement-inventory-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-20", "WO-21", "WO-22", "OTC-02", "FIN-04", "KSA-02", "KSA-05"]);
export const REQUIRED_ROLES = Object.freeze([
	"requester", "buyer", "purchasing-approver", "receiving-operator", "warehouse-operator",
	"quality-inspector", "payables-operator", "inventory-accountant", "finance-reviewer",
]);
export const REQUIRED_PROCUREMENT_STATES = Object.freeze([
	"need-identified", "request-draft", "request-pending-approval", "request-approved",
	"sourcing-or-quotation", "order-draft", "order-pending-approval", "order-submitted",
	"partly-received", "received-not-billed", "partly-billed", "billed-unpaid",
	"partly-paid", "paid", "returned-or-corrected", "short-closed", "cancelled",
]);
export const REQUIRED_STOCK_STATES = Object.freeze([
	"available", "reserved", "projected", "ordered-not-received", "in-transit",
	"received-pending-inspection", "accepted", "rejected-or-quarantined",
	"batch-or-serial-controlled", "expiring-or-expired", "count-in-progress",
	"difference-pending-approval", "adjusted", "negative-stock-blocked", "cancelled-or-reversed",
]);
export const REQUIRED_OUTCOME_INVARIANTS = Object.freeze([
	"purchase-order-is-a-commitment-not-stock-payable-expense-tax-or-payment",
	"purchase-receipt-is-physical-receipt-not-supplier-bill-or-payment",
	"purchase-invoice-is-supplier-bill-and-payable-not-proof-of-physical-receipt",
	"payment-entry-reduces-payable-without-rebooking-purchase-or-stock",
	"stock-item-service-item-asset-and-expense-purchase-paths-remain-distinct",
	"ordered-received-accepted-rejected-billed-paid-and-returned-quantities-remain-distinct",
	"actual-projected-reserved-and-available-quantity-labels-cannot-be-interchanged",
	"stock-count-entry-does-not-change-stock-until-reviewed-native-submission",
	"serial-batch-expiry-uom-and-inventory-dimension-controls-follow-native-rules",
	"landed-cost-changes-valuation-only-through-supported-native-documents",
	"duplicate-supplier-invoice-reference-or-receipt-cannot-create-a-second-liability-or-stock-movement",
	"returns-credit-debit-notes-and-rate-corrections-link-and-preserve-originals",
	"tax-recoverability-and-valuation-treatment-require-approved-configuration-and-evidence",
	"backdated-cancel-amend-and-repost-impact-is-explicitly-recalculated-and-reconciled",
	"ui-summary-cannot-override-stock-ledger-payment-ledger-tax-payable-or-gl-truth",
]);
export const REQUIRED_DOCUMENT_CHAIN = Object.freeze([
	"approved-need-or-replenishment-signal", "material-request-or-approved-direct-buy",
	"supplier-quotation-and-selection-where-required", "purchase-order-and-commitment",
	"purchase-receipt-quality-acceptance-and-stock-ledger", "purchase-invoice-tax-payable-and-gl",
	"payment-entry-allocation-bank-and-payment-ledger", "return-credit-debit-note-refund-and-original-reference",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"requested-to-ordered-remaining-quantity-and-required-date",
	"ordered-to-received-accepted-rejected-returned-and-short-closed-quantity",
	"purchase-receipt-to-stock-ledger-warehouse-batch-serial-uom-and-value",
	"purchase-receipt-to-stock-received-but-not-billed-and-inventory-gl",
	"supplier-bill-to-purchase-invoice-reference-quantity-rate-tax-and-due-date",
	"purchase-invoice-to-payable-payment-ledger-payment-entry-and-outstanding",
	"input-tax-and-nonrecoverable-tax-to-source-document-tax-report-and-gl",
	"landed-cost-to-source-charge-item-allocation-stock-value-and-gl",
	"stock-balance-and-valuation-to-stock-ledger-and-inventory-gl",
	"physical-count-to-book-quantity-value-approved-difference-and-adjustment",
	"original-to-return-credit-debit-note-stock-tax-payable-payment-and-gl",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"supplier-item-warehouse-uom-tax-account-and-approval-readiness",
	"request-replenishment-quotation-selection-order-and-commitment",
	"receipt-quality-accepted-rejected-partial-over-and-short-close",
	"supplier-bill-reference-three-way-match-tax-payable-and-payment",
	"stock-transfer-issue-receipt-transit-putaway-pick-and-delivery",
	"batch-serial-expiry-uom-barcode-and-inventory-dimension",
	"physical-count-freeze-recount-difference-approval-and-adjustment",
	"valuation-landed-cost-stock-received-not-billed-and-inventory-gl",
	"purchase-return-credit-debit-note-refund-and-original-trace",
	"role-company-warehouse-account-period-and-cross-tenant-isolation",
	"bilingual-mobile-scanning-task-first-forms-lists-and-exceptions",
	"monitoring-cutoff-recovery-retention-support-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"qualified-procurement-inventory-accounting-and-saudi-tax-configuration-review",
	"service-stock-asset-expense-direct-and-order-first-purchase-scenarios",
	"partial-over-under-receipt-quality-rejection-short-close-and-backorder-scenarios",
	"duplicate-reference-three-way-match-partial-bill-tax-credit-and-payment-scenarios",
	"transfer-transit-issue-receipt-putaway-pick-delivery-and-warehouse-permission-scenarios",
	"batch-serial-expiry-uom-barcode-and-inventory-dimension-scenarios",
	"clean-dirty-blind-recount-frozen-cutoff-difference-approval-and-reversal-stock-counts",
	"purchase-receipt-stock-ledger-stock-received-not-billed-valuation-tax-payable-payment-and-gl-reconciliation",
	"full-partial-paid-unpaid-stock-nonstock-return-credit-debit-and-refund-reconciliation",
	"role-company-warehouse-account-period-cross-tenant-and-negative-permission-tests",
	"arabic-english-desktop-phone-keyboard-touch-scanner-screen-reader-print-and-export",
	"candidate-version-fixture-source-hash-monitoring-recovery-retention-support-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"supplier-master-duplicate-tax-bank-and-change-verification-policy",
	"item-type-uom-valuation-batch-serial-expiry-barcode-and-dimension-policy",
	"warehouse-ownership-transit-quality-rejected-negative-stock-and-permission-policy",
	"request-order-receipt-invoice-payment-return-approval-and-materiality-policy",
	"saudi-input-tax-recoverability-nonrecoverable-tax-import-customs-and-document-evidence",
	"inventory-stock-received-not-billed-valuation-landed-cost-variance-and-writeoff-accounts",
	"count-frequency-freeze-recount-difference-escalation-adjustment-and-cutoff-policy",
	"production-cutover-opening-stock-monitoring-recovery-retention-support-and-signoff",
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

export function validateProcurementInventoryContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not inventory valuation advice", "procurement approval", "saudi tax advice",
		"completed stock count", "release acceptance",
	]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the procurement inventory operations contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.procurement_states, REQUIRED_PROCUREMENT_STATES, "procurement_states");
	requireExact(errors, register?.stock_states, REQUIRED_STOCK_STATES, "stock_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_OUTCOME_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.document_chain, REQUIRED_DOCUMENT_CHAIN, "document_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-buying-stock-payment-tax-stock-ledger-and-gl") {
		errors.push("native_authority.engine must remain erpnext-native-buying-stock-payment-tax-stock-ledger-and-gl");
	}
	for (const field of [
		"parallel_purchase_stock_payable_or_valuation_ledger_prohibited",
		"submitted_source_documents_remain_immutable", "stock_and_accounting_effects_use_native_submission_and_reversal",
		"simple_and_expert_share_records", "direct_stock_or_generated_ledger_edit_prohibited",
		"ui_summary_cannot_override_native_quantity_value_tax_payable_or_gl_truth",
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
		"requires_normal_and_exception_cycle", "requires_distinct_request_order_receipt_bill_payment_and_correction_states",
		"requires_exact_quantity_value_tax_payable_payment_stock_ledger_and_gl_reconciliation",
		"requires_partial_duplicate_backdated_and_recovery_scenarios",
		"requires_physical_count_and_serial_batch_expiry_evidence_where_applicable",
		"requires_distinct_preparer_approver_receiver_inspector_and_reviewer_controls",
		"requires_candidate_bound_bilingual_responsive_accessible_operator_evidence",
		"requires_qualified_procurement_inventory_accounting_and_saudi_tax_review",
		"structural_validation_is_not_inventory_accounting_tax_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		procurementStates: register?.procurement_states?.length || 0,
		stockStates: register?.stock_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateProcurementInventoryContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 procurement inventory register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no inventory, procurement, accounting, tax or release acceptance was evaluated.");
		console.log(`controls=${result.controls} procurement_states=${result.procurementStates} stock_states=${result.stockStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Procurement inventory contract check failed: ${error.message}`);
	process.exitCode = 2;
});
