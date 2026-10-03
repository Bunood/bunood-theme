import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DOCUMENT_CHAIN,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_OUTCOME_INVARIANTS,
	REQUIRED_PROCUREMENT_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_STOCK_STATES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateProcurementInventoryContract,
} from "../tools/v1-procurement-inventory-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("procurement and inventory operations are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateProcurementInventoryContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.procurementStates, REQUIRED_PROCUREMENT_STATES.length);
	assert.equal(result.stockStates, REQUIRED_STOCK_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not inventory valuation advice/i);
});

test("need order receipt bill payment and stock states remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.procurement_states, [...REQUIRED_PROCUREMENT_STATES]);
	assert.deepEqual(register.stock_states, [...REQUIRED_STOCK_STATES]);
	assert.ok(register.outcome_invariants.includes("purchase-order-is-a-commitment-not-stock-payable-expense-tax-or-payment"));
	assert.ok(register.outcome_invariants.includes("purchase-receipt-is-physical-receipt-not-supplier-bill-or-payment"));
	assert.ok(register.outcome_invariants.includes("purchase-invoice-is-supplier-bill-and-payable-not-proof-of-physical-receipt"));
	assert.ok(register.outcome_invariants.includes("payment-entry-reduces-payable-without-rebooking-purchase-or-stock"));
});

test("document chain and reconciliation preserve physical financial and correction trace", () => {
	const register = readRegister();
	assert.deepEqual(register.document_chain, [...REQUIRED_DOCUMENT_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"purchase-receipt-to-stock-ledger-warehouse-batch-serial-uom-and-value",
		"purchase-receipt-to-stock-received-but-not-billed-and-inventory-gl",
		"original-to-return-credit-debit-note-stock-tax-payable-payment-and-gl",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("native authority source immutability duplicate and tax safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_purchase_stock_payable_or_valuation_ledger_prohibited = false;
	register.native_authority.submitted_source_documents_remain_immutable = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "duplicate-supplier-invoice-reference-or-receipt-cannot-create-a-second-liability-or-stock-movement");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "tax-recoverability-and-valuation-treatment-require-approved-configuration-and-evidence");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "ui-summary-cannot-override-stock-ledger-payment-ledger-tax-payable-or-gl-truth");
	const result = validateProcurementInventoryContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_purchase_stock_payable_or_valuation_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.submitted_source_documents_remain_immutable must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_OUTCOME_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_end_to_end_controlled_cycles = 1;
	register.acceptance.requires_exact_quantity_value_tax_payable_payment_stock_ledger_and_gl_reconciliation = false;
	register.acceptance.requires_physical_count_and_serial_batch_expiry_evidence_where_applicable = false;
	register.acceptance.requires_qualified_procurement_inventory_accounting_and_saudi_tax_review = false;
	register.acceptance.structural_validation_is_not_inventory_accounting_tax_or_release_acceptance = false;
	const result = validateProcurementInventoryContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_end_to_end_controlled_cycles must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_exact_quantity_value_tax_payable_payment_stock_ledger_and_gl_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_physical_count_and_serial_batch_expiry_evidence_where_applicable must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_qualified_procurement_inventory_accounting_and_saudi_tax_review must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_inventory_accounting_tax_or_release_acceptance must remain true"));
});
