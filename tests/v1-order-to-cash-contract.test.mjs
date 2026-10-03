import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_COMMERCIAL_STATES,
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_CUSTOMER_STATES,
	REQUIRED_DOCUMENT_CHAIN,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_OUTCOME_INVARIANTS,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateOrderToCashContract,
} from "../tools/v1-order-to-cash-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("order-to-cash and customer operations are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateOrderToCashContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.customerStates, REQUIRED_CUSTOMER_STATES.length);
	assert.equal(result.commercialStates, REQUIRED_COMMERCIAL_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not sales-policy approval/i);
});

test("customer quotation order delivery invoice payment and return states remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.customer_states, [...REQUIRED_CUSTOMER_STATES]);
	assert.deepEqual(register.commercial_states, [...REQUIRED_COMMERCIAL_STATES]);
	for (const invariant of [
		"quotation-is-an-offer-not-a-confirmed-order-delivery-invoice-or-payment",
		"sales-order-is-a-commitment-not-stock-movement-income-receivable-tax-or-payment",
		"delivery-note-is-fulfilment-not-billing-or-payment",
		"payment-request-is-a-request-not-proof-of-money-movement",
	]) assert.ok(register.outcome_invariants.includes(invariant), invariant);
});

test("document chain and reconciliation link customer intent through portal and ledgers", () => {
	const register = readRegister();
	assert.deepEqual(register.document_chain, [...REQUIRED_DOCUMENT_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"order-to-delivery-remaining-short-close-warehouse-and-stock-ledger",
		"invoice-to-receivable-payment-ledger-payment-entry-credit-and-outstanding",
		"invoice-to-pdf-thermal-email-portal-xml-qr-and-zatca-response",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("native authority idempotency portal isolation and output safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority["parallel-customer-order-receivable-or-portal-ledger-prohibited"] = false;
	register.native_authority["submitted-commercial-and-accounting-documents-remain-immutable"] = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "duplicate-callback-message-or-user-action-cannot-create-a-second-order-delivery-invoice-payment-or-reminder");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "portal-user-can-access-only-explicitly-authorized-customer-records-and-files");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "customer-facing-screen-email-pdf-thermal-xml-qr-and-portal-values-reconcile");
	const result = validateOrderToCashContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel-customer-order-receivable-or-portal-ledger-prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.submitted-commercial-and-accounting-documents-remain-immutable must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_OUTCOME_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_end_to_end_controlled_cycles = 1;
	register.acceptance.requires_exact_stock_tax_receivable_payment_ledger_settlement_and_gl_reconciliation = false;
	register.acceptance.requires_cross_customer_portal_and_api_isolation = false;
	register.acceptance.requires_real_sales_fulfilment_billing_collections_customer_and_accounting_task_acceptance = false;
	register.acceptance.structural_validation_is_not_sales_credit_tax_zatca_portal_reconciliation_or_release_acceptance = false;
	const result = validateOrderToCashContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_end_to_end_controlled_cycles must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_exact_stock_tax_receivable_payment_ledger_settlement_and_gl_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_cross_customer_portal_and_api_isolation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_real_sales_fulfilment_billing_collections_customer_and_accounting_task_acceptance must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_sales_credit_tax_zatca_portal_reconciliation_or_release_acceptance must remain true"));
});
