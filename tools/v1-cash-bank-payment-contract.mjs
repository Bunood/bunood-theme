#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-cash-bank-payment-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze([
	"WO-12", "WO-13", "WO-14", "OTC-03", "OTC-04", "FIN-03", "FIN-04",
]);
export const REQUIRED_ROLES = Object.freeze([
	"cashier", "collections-operator", "payables-operator", "treasury-operator",
	"accountant-preparer", "finance-reviewer", "connector-security-administrator", "auditor",
]);
export const REQUIRED_PAYMENT_STATES = Object.freeze([
	"draft", "submitted-unallocated", "submitted-partly-allocated", "submitted-allocated",
	"reconciliation-required", "reconciled", "unreconciled", "reversed-or-refunded", "cancelled",
]);
export const REQUIRED_BANK_TRANSACTION_STATES = Object.freeze([
	"source-received", "validated", "duplicate-quarantined", "imported-unmatched",
	"candidate-match", "partly-matched", "matched", "difference-open", "reconciled",
	"unmatched-after-review", "cancelled",
]);
export const REQUIRED_SETTLEMENT_STATES = Object.freeze([
	"not-applicable", "authorized-not-captured", "captured-unsettled", "settlement-pending",
	"settlement-received", "settlement-partly-received", "settlement-difference",
	"chargeback-or-dispute", "refunded", "reconciled", "reversed", "unknown-delayed",
]);
export const REQUIRED_OUTCOME_INVARIANTS = Object.freeze([
	"payment-entry-is-money-movement-not-revenue-or-expense-rebooking",
	"bank-transaction-import-is-statement-evidence-not-a-gl-posting",
	"payment-reconciliation-allocation-is-not-a-new-bank-movement",
	"bank-reconciliation-match-is-not-party-invoice-allocation",
	"authorization-capture-browser-return-webhook-and-settlement-are-distinct",
	"provider-success-is-not-bank-settlement-or-ledger-reconciliation",
	"unknown-timeout-or-duplicate-callback-cannot-create-a-second-payment",
	"source-transaction-and-settlement-identifiers-remain-immutable-and-unique",
	"fuzzy-or-rule-match-remains-a-proposal-until-controlled-approval",
	"fees-vat-on-fees-refunds-reversals-chargebacks-and-rounding-cannot-be-silently-netted",
	"cash-shift-deposit-in-transit-and-bank-credit-remain-distinct",
	"unreconcile-reverse-cancel-and-refund-use-native-governed-flows",
	"every-difference-has-category-age-owner-due-date-and-resolution",
	"no-account-or-provider-is-called-reconciled-until-adjusted-difference-is-zero-or-approved-under-policy",
	"connector-or-ui-state-cannot-override-payment-ledger-outstanding-bank-or-gl-truth",
]);
export const REQUIRED_MONEY_CHAINS = Object.freeze([
	"customer-invoice-to-receivable-to-payment-entry-to-payment-ledger-to-outstanding-to-gl",
	"supplier-invoice-to-payable-to-payment-entry-to-payment-ledger-to-outstanding-to-gl",
	"cashier-shift-to-tender-to-cash-on-hand-to-deposit-in-transit-to-bank-to-gl",
	"card-or-wallet-capture-to-provider-clearing-to-settlement-batch-to-bank-to-gl",
	"payment-link-request-to-authentic-callback-to-payment-entry-to-allocation-to-settlement",
	"bank-statement-source-to-bank-transaction-to-voucher-match-to-clearance-to-bank-gl",
	"refund-or-chargeback-to-original-payment-to-party-balance-to-provider-clearing-to-bank-and-gl",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"invoice-and-credit-note-to-payment-ledger-allocation-and-party-outstanding",
	"payment-entry-to-bank-or-cash-account-currency-reference-and-gl",
	"statement-row-to-bank-transaction-source-identity-and-import-batch",
	"bank-transaction-to-one-or-many-native-vouchers-and-clearance",
	"provider-transaction-to-order-invoice-payment-and-idempotent-callback",
	"provider-settlement-gross-to-refunds-chargebacks-fees-taxes-adjustments-and-net-bank-credit",
	"pos-shift-tenders-to-closing-difference-cash-deposit-and-provider-settlement",
	"cash-and-bank-subledgers-to-trial-balance-and-financial-statements",
	"unallocated-advances-credits-and-on-account-payments-to-ar-ap-control-accounts",
	"foreign-currency-payment-settlement-and-bank-to-realized-exchange-and-gl",
]);
export const REQUIRED_DIFFERENCE_CATEGORIES = Object.freeze([
	"normal-timing", "deposit-in-transit", "uncleared-payment", "unrecorded-bank-fee-or-interest",
	"provider-fee-tax-or-rounding", "refund-reversal-or-chargeback",
	"amount-date-currency-reference-or-party-mismatch", "duplicate-source-or-book-entry",
	"missing-source-or-book-entry", "classification-or-account-error",
	"foreign-exchange-difference", "unidentified-or-disputed",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"mode-of-payment-bank-cash-clearing-and-company-mapping",
	"customer-receipt-supplier-payment-advance-partial-and-refund",
	"payment-allocation-unallocation-and-party-control-reconciliation",
	"statement-ingestion-schema-source-identity-and-duplicate-control",
	"bank-match-create-voucher-partial-split-merge-and-unmatch",
	"cash-shift-tender-deposit-in-transit-and-bank-credit",
	"provider-capture-callback-clearing-settlement-fee-and-chargeback",
	"saudi-open-banking-consent-licensed-provider-and-conformance",
	"difference-aging-materiality-owner-escalation-and-resolution",
	"segregation-permission-company-account-currency-and-secret-isolation",
	"bilingual-task-first-workbench-drilldown-accessibility-and-export",
	"close-monitoring-recovery-retention-support-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"qualified-finance-review-of-account-mapping-materiality-and-signoff-policy",
	"native-customer-supplier-advance-partial-over-under-refund-and-transfer-scenarios",
	"payment-ledger-ar-ap-outstanding-control-account-and-gl-reconciliation",
	"clean-dirty-duplicate-overlap-and-reimport-statement-ingestion",
	"one-to-one-one-to-many-many-to-one-partial-fee-fx-and-unmatch-bank-cases",
	"cashier-shift-tender-variance-cash-deposit-and-bank-credit-chain",
	"provider-capture-callback-replay-timeout-refund-chargeback-fee-tax-and-settlement-chain",
	"saudi-authorisation-consent-sandbox-conformance-revoke-and-degraded-operation",
	"difference-category-age-owner-escalation-root-cause-and-resolution-history",
	"role-company-account-currency-secret-and-cross-tenant-negative-tests",
	"arabic-english-desktop-narrow-keyboard-screen-reader-export-and-source-drilldown",
	"candidate-version-source-files-hashes-monitoring-incident-recovery-retention-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"chart-of-accounts-bank-cash-clearing-fee-tax-fx-and-writeoff-mapping",
	"mode-of-payment-company-account-currency-reference-and-approval-rules",
	"bank-statement-format-source-identity-duplicate-and-retention-rules",
	"provider-commercial-settlement-fee-refund-chargeback-and-sla-terms",
	"saudi-open-banking-or-payment-provider-licence-authorisation-consent-and-conformance",
	"materiality-aging-escalation-adjustment-writeoff-and-period-close-policy",
	"segregation-permission-secret-support-access-and-cross-company-boundaries",
	"production-cutover-monitoring-incident-recovery-retention-and-support-owner",
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

export function validateCashBankPaymentContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not financial advice", "completed reconciliation", "provider or bank approval",
		"production connector receipt", "release acceptance",
	]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the cash bank payment reconciliation contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.payment_states, REQUIRED_PAYMENT_STATES, "payment_states");
	requireExact(errors, register?.bank_transaction_states, REQUIRED_BANK_TRANSACTION_STATES, "bank_transaction_states");
	requireExact(errors, register?.settlement_states, REQUIRED_SETTLEMENT_STATES, "settlement_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_OUTCOME_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.money_chains, REQUIRED_MONEY_CHAINS, "money_chains");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.difference_categories, REQUIRED_DIFFERENCE_CATEGORIES, "difference_categories");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "erpnext-native-payment-bank-transaction-payment-ledger-and-gl") {
		errors.push("native_authority.engine must remain erpnext-native-payment-bank-transaction-payment-ledger-and-gl");
	}
	for (const field of [
		"parallel_cash_bank_receivable_or_settlement_ledger_prohibited",
		"bank_transaction_import_does_not_post_gl", "payment_reconciliation_does_not_create_bank_movement",
		"bank_reconciliation_does_not_allocate_party_invoices", "simple_and_expert_share_records",
		"direct_generated_ledger_edit_prohibited", "connector_or_ui_state_cannot_override_native_financial_truth",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") {
		errors.push(`control_domains.${domain.id}.state must remain planned until controlled-period acceptance exists`);
	}

	if (register?.acceptance?.minimum_consecutive_controlled_periods !== 2) {
		errors.push("acceptance.minimum_consecutive_controlled_periods must be 2");
	}
	for (const field of [
		"requires_normal_and_exception_period", "requires_distinct_preparer_and_reviewer",
		"requires_exact_payment_ledger_ar_ap_bank_cash_provider_and_gl_reconciliation",
		"requires_duplicate_idempotency_timeout_replay_and_unreconcile_recovery",
		"requires_bank_and_provider_source_evidence", "requires_no_unowned_or_unaged_difference",
		"requires_saudi_connector_authorisation_consent_and_conformance_if_promoted",
		"requires_candidate_bound_bilingual_responsive_accessible_evidence",
		"requires_qualified_finance_review", "structural_validation_is_not_reconciliation_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		paymentStates: register?.payment_states?.length || 0,
		bankTransactionStates: register?.bank_transaction_states?.length || 0,
		settlementStates: register?.settlement_states?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateCashBankPaymentContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 cash bank payment register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no financial, reconciliation, bank/provider, connector or release acceptance was evaluated.");
		console.log(`controls=${result.controls} payment_states=${result.paymentStates} bank_states=${result.bankTransactionStates} settlement_states=${result.settlementStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Cash bank payment contract check failed: ${error.message}`);
	process.exitCode = 2;
});
