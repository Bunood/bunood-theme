import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_OUTCOME_INVARIANTS,
	REQUIRED_READINESS_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_SALE_CHAIN,
	REQUIRED_SALE_STATES,
	REQUIRED_SHIFT_STATES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validatePosRetailContract,
} from "../tools/v1-pos-retail-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("POS retail operations are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validatePosRetailContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.readinessStates, REQUIRED_READINESS_STATES.length);
	assert.equal(result.saleStates, REQUIRED_SALE_STATES.length);
	assert.equal(result.shiftStates, REQUIRED_SHIFT_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not zatca or tax advice/i);
});

test("readiness sale payment receipt zatca closing posting and reconciliation states remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.readiness_states, [...REQUIRED_READINESS_STATES]);
	assert.deepEqual(register.sale_states, [...REQUIRED_SALE_STATES]);
	assert.deepEqual(register.shift_states, [...REQUIRED_SHIFT_STATES]);
	assert.ok(register.outcome_invariants.includes("cart-held-draft-submitted-sale-payment-receipt-zatca-settlement-and-reconciliation-are-distinct"));
	assert.ok(register.outcome_invariants.includes("shift-close-does-not-mean-ledgers-posted-until-the-pinned-native-posting-model-completes"));
	assert.ok(register.outcome_invariants.includes("offline-capability-cannot-be-claimed-without-durable-queue-conflict-replay-and-reconciliation"));
});

test("sale chain reconciles cashier input through closing and finance", () => {
	const register = readRegister();
	assert.deepEqual(register.sale_chain, [...REQUIRED_SALE_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"invoice-to-receipt-pdf-xml-qr-zatca-response-and-customer-output",
		"shift-invoices-tenders-refunds-voids-count-difference-closing-and-posting",
		"closing-or-consolidated-documents-to-source-pos-invoices-stock-payment-tax-and-gl",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("native authority idempotency permissions offline and print safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_cart_sale_stock_tender_or_shift_ledger_prohibited = false;
	register.native_authority.pinned_erpnext_pos_posting_model_must_be_verified = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "unknown-timeout-or-duplicate-event-cannot-create-a-second-sale-payment-stock-or-tax-effect");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "discount-rate-void-return-refund-and-writeoff-follow-server-permission-and-policy");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "receipt-print-pdf-xml-qr-and-screen-values-reconcile-to-the-same-native-sale");
	const result = validatePosRetailContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_cart_sale_stock_tender_or_shift_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.pinned_erpnext_pos_posting_model_must_be_verified must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_OUTCOME_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim POS acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_controlled_open_to_close_cycles = 1;
	register.acceptance.requires_exact_sale_stock_tax_payment_zatca_closing_and_gl_reconciliation = false;
	register.acceptance.requires_real_cashier_supervisor_and_finance_task_acceptance = false;
	register.acceptance.requires_physical_receipt_printer_and_real_qr_scan = false;
	register.acceptance.structural_validation_is_not_pos_device_payment_zatca_reconciliation_or_release_acceptance = false;
	const result = validatePosRetailContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_controlled_open_to_close_cycles must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_exact_sale_stock_tax_payment_zatca_closing_and_gl_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_real_cashier_supervisor_and_finance_task_acceptance must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_physical_receipt_printer_and_real_qr_scan must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_pos_device_payment_zatca_reconciliation_or_release_acceptance must remain true"));
});
