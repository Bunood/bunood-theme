import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DOCUMENT_CHAIN,
	REQUIRED_DOCUMENT_STATES,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_OUTCOME_INVARIANTS,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateZatcaContract,
} from "../tools/v1-zatca-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("Saudi ZATCA operations are a complete planning contract without approval claims", () => {
	const register = readRegister();
	const result = validateZatcaContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.documentStates, REQUIRED_DOCUMENT_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not legal or tax advice/i);
	assert.match(register.disclaimer, /not.*zatca certification/i);
});

test("standard clearance simplified reporting and uncertain outcomes remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.document_states, [...REQUIRED_DOCUMENT_STATES]);
	for (const state of [
		"cleared", "cleared-with-warnings", "reported", "reported-with-warnings",
		"rejected", "delayed", "duplicate-response", "correction-required",
	]) assert.ok(register.document_states.includes(state), state);
	assert.ok(register.outcome_invariants.includes("standard-document-is-buyer-deliverable-only-after-authentic-clearance"));
	assert.ok(register.outcome_invariants.includes("simplified-document-remains-due-for-reporting-until-authentic-response"));
	assert.ok(register.outcome_invariants.includes("duplicate-response-requires-exact-prior-success-reconciliation"));
});

test("document chain reconciles native accounting regulated payload response and output", () => {
	const register = readRegister();
	assert.deepEqual(register.document_chain, [...REQUIRED_DOCUMENT_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"native-document-to-signed-xml-elements-uuid-and-payload-hash",
		"payload-environment-request-correlation-and-authentic-response",
		"native-tax-accounts-vat-reports-receivable-payment-ledger-and-gl",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("credential native-ledger authentic-response and warning safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_tax_or_accounting_ledger_prohibited = false;
	register.native_authority.credentials_never_returned_to_browser = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "sdk-valid-is-not-zatca-approval");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "accepted-with-warnings-remains-owned-exception-not-clean-success");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "duplicate-response-requires-exact-prior-success-reconciliation");
	const result = validateZatcaContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_tax_or_accounting_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.credentials_never_returned_to_browser must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_OUTCOME_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim compliance and production evidence cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_controlled_environment_cycles = 1;
	register.acceptance.requires_sandbox_and_authorised_production_cycle = false;
	register.acceptance.requires_authentic_zatca_response_for_clearance_or_reporting = false;
	register.acceptance.requires_current_official_and_qualified_review = false;
	register.acceptance.structural_validation_is_not_zatca_or_tax_acceptance = false;
	const result = validateZatcaContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_controlled_environment_cycles must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_sandbox_and_authorised_production_cycle must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_authentic_zatca_response_for_clearance_or_reporting must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_current_official_and_qualified_review must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_zatca_or_tax_acceptance must remain true"));
});
