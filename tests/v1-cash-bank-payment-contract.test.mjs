import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_BANK_TRANSACTION_STATES,
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_MONEY_CHAINS,
	REQUIRED_OUTCOME_INVARIANTS,
	REQUIRED_PAYMENT_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_SETTLEMENT_STATES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateCashBankPaymentContract,
} from "../tools/v1-cash-bank-payment-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("cash bank and payment operations are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateCashBankPaymentContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.paymentStates, REQUIRED_PAYMENT_STATES.length);
	assert.equal(result.bankTransactionStates, REQUIRED_BANK_TRANSACTION_STATES.length);
	assert.equal(result.settlementStates, REQUIRED_SETTLEMENT_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not financial advice/i);
});

test("payment bank transaction and provider settlement lifecycles remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.payment_states, [...REQUIRED_PAYMENT_STATES]);
	assert.deepEqual(register.bank_transaction_states, [...REQUIRED_BANK_TRANSACTION_STATES]);
	assert.deepEqual(register.settlement_states, [...REQUIRED_SETTLEMENT_STATES]);
	assert.ok(register.outcome_invariants.includes("bank-transaction-import-is-statement-evidence-not-a-gl-posting"));
	assert.ok(register.outcome_invariants.includes("payment-reconciliation-allocation-is-not-a-new-bank-movement"));
	assert.ok(register.outcome_invariants.includes("bank-reconciliation-match-is-not-party-invoice-allocation"));
	assert.ok(register.outcome_invariants.includes("provider-success-is-not-bank-settlement-or-ledger-reconciliation"));
});

test("money chains and reconciliation links preserve source to ledger trace", () => {
	const register = readRegister();
	assert.deepEqual(register.money_chains, [...REQUIRED_MONEY_CHAINS]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"cashier-shift-to-tender-to-cash-on-hand-to-deposit-in-transit-to-bank-to-gl",
		"card-or-wallet-capture-to-provider-clearing-to-settlement-batch-to-bank-to-gl",
		"provider-settlement-gross-to-refunds-chargebacks-fees-taxes-adjustments-and-net-bank-credit",
	]) assert.ok([...register.money_chains, ...register.reconciliation_links].includes(expected), expected);
});

test("native authority idempotency difference ownership and controlled matching cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_cash_bank_receivable_or_settlement_ledger_prohibited = false;
	register.native_authority.bank_transaction_import_does_not_post_gl = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "unknown-timeout-or-duplicate-callback-cannot-create-a-second-payment");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "fuzzy-or-rule-match-remains-a-proposal-until-controlled-approval");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "every-difference-has-category-age-owner-due-date-and-resolution");
	const result = validateCashBankPaymentContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_cash_bank_receivable_or_settlement_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.bank_transaction_import_does_not_post_gl must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_OUTCOME_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim reconciliation and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_consecutive_controlled_periods = 1;
	register.acceptance.requires_exact_payment_ledger_ar_ap_bank_cash_provider_and_gl_reconciliation = false;
	register.acceptance.requires_no_unowned_or_unaged_difference = false;
	register.acceptance.requires_qualified_finance_review = false;
	register.acceptance.structural_validation_is_not_reconciliation_or_release_acceptance = false;
	const result = validateCashBankPaymentContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_consecutive_controlled_periods must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_exact_payment_ledger_ar_ap_bank_cash_provider_and_gl_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_no_unowned_or_unaged_difference must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_qualified_finance_review must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_reconciliation_or_release_acceptance must remain true"));
});
