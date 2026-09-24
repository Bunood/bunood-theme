import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CLOSE_PHASES,
	REQUIRED_CLOSE_STATES,
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DEPENDENCY_LEVELS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_PERIOD_INVARIANTS,
	REQUIRED_RECONCILIATION_FAMILIES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateFinanceCloseContract,
} from "../tools/v1-finance-close-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("expert finance and close is a complete planning contract without an accounting claim", () => {
	const register = readRegister();
	const result = validateFinanceCloseContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.reconciliations, REQUIRED_RECONCILIATION_FAMILIES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not accounting advice/i);
	assert.match(register.disclaimer, /not.*financial-statement acceptance/i);
});

test("close states phases and dependency levels remain explicit", () => {
	const register = readRegister();
	assert.deepEqual(register.close_states, [...REQUIRED_CLOSE_STATES]);
	assert.deepEqual(register.baseline_close_phases, [...REQUIRED_CLOSE_PHASES]);
	assert.deepEqual(register.dependency_levels, [...REQUIRED_DEPENDENCY_LEVELS]);
	for (const state of ["waiting-dependency", "blocked", "at-risk", "reopened"]) {
		assert.ok(register.close_states.includes(state), state);
	}
});

test("payment bank cash subledger stock and statutory reconciliations stay distinct", () => {
	const register = readRegister();
	for (const family of REQUIRED_RECONCILIATION_FAMILIES) {
		assert.ok(register.reconciliation_families.includes(family), family);
	}
	assert.ok(register.reconciliation_families.includes("bank-statement-and-bank-transactions-to-vouchers-and-gl"));
	assert.ok(register.reconciliation_families.includes("accounts-receivable-and-payment-ledger-to-gl"));
	assert.notEqual(
		register.reconciliation_families.indexOf("bank-statement-and-bank-transactions-to-vouchers-and-gl"),
		register.reconciliation_families.indexOf("accounts-receivable-and-payment-ledger-to-gl"),
	);
});

test("native ledger journal and period controls cannot be weakened", () => {
	const register = clone(readRegister());
	register.accounting_authority.parallel_ledger_prohibited = false;
	register.accounting_authority.generated_ledger_edit_prohibited = false;
	register.journal_invariants = register.journal_invariants.filter(value => value !== "submitted-source-and-ledger-rows-are-not-edited");
	register.period_control_invariants = register.period_control_invariants.filter(value => value !== "period-closing-voucher-transfers-profit-and-loss-but-is-not-a-lock");
	const result = validateFinanceCloseContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("accounting_authority.parallel_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("accounting_authority.generated_ledger_edit_prohibited must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("journal_invariants must be exactly")));
	assert.ok(result.errors.some(error => error.startsWith("period_control_invariants must be exactly")));
	for (const invariant of REQUIRED_PERIOD_INVARIANTS) assert.ok(readRegister().period_control_invariants.includes(invariant));
});

test("planning controls cannot become verified or claim acceptance without external evidence", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_consecutive_controlled_closes = 1;
	register.acceptance.requires_preparer_and_reviewer = false;
	register.acceptance.structural_validation_is_not_accounting_acceptance = false;
	const result = validateFinanceCloseContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_consecutive_controlled_closes must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_preparer_and_reviewer must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_accounting_acceptance must remain true"));
});
