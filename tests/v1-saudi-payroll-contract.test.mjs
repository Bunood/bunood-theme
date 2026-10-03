import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_EMPLOYEE_CHAIN,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_GOVERNMENT_INVARIANTS,
	REQUIRED_PAYROLL_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateSaudiPayrollContract,
} from "../tools/v1-saudi-payroll-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("Saudi people and payroll is a complete planning contract without compliance or payment claims", () => {
	const register = readRegister();
	const result = validateSaudiPayrollContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.chainLinks, REQUIRED_EMPLOYEE_CHAIN.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not legal/i);
	assert.match(register.disclaimer, /not.*government-interface approval/i);
});

test("calculation accounting external and paid states remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.payroll_states, [...REQUIRED_PAYROLL_STATES]);
	for (const state of [
		"calculated", "approved", "posted", "file-generated", "submitted-external",
		"accepted-external", "paid", "reconciled", "closed",
	]) assert.ok(register.payroll_states.includes(state), state);
	assert.ok(register.government_state_invariants.includes("journal-or-bank-file-is-not-payment-evidence"));
	assert.equal(register.native_authority.bank_entry_is_not_payment_evidence, true);
});

test("the employee chain reconciles contract payroll WPS GOSI payment and GL", () => {
	const register = readRegister();
	assert.deepEqual(register.employee_chain, [...REQUIRED_EMPLOYEE_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"contract-to-salary-assignment",
		"net-pay-to-payroll-payable-bank-wps-and-clearing",
		"contributory-wage-and-contributions-to-gosi-output-and-response",
		"external-paid-status-to-bank-liabilities-and-final-gl",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("government outcomes native ledgers and idempotency cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_payroll_ledger_prohibited = false;
	register.native_authority.generated_ledger_edit_prohibited = false;
	register.government_state_invariants = register.government_state_invariants.filter(value => value !== "generated-is-not-submitted");
	register.government_state_invariants = register.government_state_invariants.filter(value => value !== "accepted-requires-authentic-response-bound-to-payload");
	register.calculation_invariants = register.calculation_invariants.filter(value => value !== "retry-cannot-duplicate-slips-journals-files-or-submissions");
	const result = validateSaudiPayrollContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_payroll_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.generated_ledger_edit_prohibited must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("government_state_invariants must be exactly")));
	assert.ok(result.errors.some(error => error.startsWith("calculation_invariants must be exactly")));
	for (const invariant of REQUIRED_GOVERNMENT_INVARIANTS) assert.ok(readRegister().government_state_invariants.includes(invariant));
});

test("planning controls cannot become verified and parallel payroll cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_controlled_parallel_cycles = 1;
	register.acceptance.requires_distinct_preparer_and_reviewer = false;
	register.acceptance.requires_authentic_external_response_for_external_acceptance = false;
	register.acceptance.structural_validation_is_not_payroll_acceptance = false;
	const result = validateSaudiPayrollContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_controlled_parallel_cycles must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_distinct_preparer_and_reviewer must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_authentic_external_response_for_external_acceptance must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_payroll_acceptance must remain true"));
});
