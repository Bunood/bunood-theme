import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DISPOSITION_INVARIANTS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_RIGHTS,
	readRegister,
	validatePdplContract,
} from "../tools/v1-pdpl-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("Saudi PDPL operations are a complete planning contract without a compliance claim", () => {
	const register = readRegister();
	const result = validatePdplContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.rights, REQUIRED_RIGHTS.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.match(register.disclaimer, /not legal advice/i);
	assert.match(register.disclaimer, /not.*compliance certificate/i);
});

test("all six official right types and their exception states remain explicit", () => {
	const register = readRegister();
	assert.deepEqual(register.data_subject_rights, [...REQUIRED_RIGHTS]);
	for (const state of ["extended-after-notice", "partially-fulfilled", "refused-with-reason", "on-legal-hold", "overdue"]) {
		assert.ok(register.request_states.includes(state), state);
	}
});

test("request and breach clocks cannot be relaxed by editing the register", () => {
	const register = clone(readRegister());
	register.request_deadlines_days.standard = 45;
	register.request_deadlines_days.maximum_extension = 60;
	register.request_deadlines_days.extension_requires_prior_notice_and_reason = false;
	register.breach.authority_notification_ceiling_hours_when_threshold_met = 96;
	const result = validatePdplContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("request_deadlines_days.standard must be 30"));
	assert.ok(result.errors.includes("request_deadlines_days.maximum_extension must be 30"));
	assert.ok(result.errors.includes("request_deadlines_days.extension_requires_prior_notice_and_reason must remain true"));
	assert.ok(result.errors.includes("breach.authority_notification_ceiling_hours_when_threshold_met must be 72"));
});

test("ledger safety backup handling and pseudonymisation limits cannot disappear", () => {
	const register = clone(readRegister());
	register.disposition_invariants = register.disposition_invariants.filter(value => value !== "no-ledger-stock-tax-payroll-or-audit-corruption");
	register.disposition_invariants = register.disposition_invariants.filter(value => value !== "backups-and-archives-remain-personal-data-when-applicable");
	register.disposition_invariants = register.disposition_invariants.filter(value => value !== "pseudonymised-data-remains-personal-data");
	const result = validatePdplContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.startsWith("disposition_invariants must be exactly")));
	for (const invariant of REQUIRED_DISPOSITION_INVARIANTS) assert.ok(readRegister().disposition_invariants.includes(invariant));
});

test("a planning control cannot be marked verified without an external acceptance receipt", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.data_subject_rights.pop();
	register.transfer.unknown_or_high_unresolved_risk_blocks_activation = false;
	const result = validatePdplContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.some(error => error.startsWith("data_subject_rights must be exactly")));
	assert.ok(result.errors.includes("transfer.unknown_or_high_unresolved_risk_blocks_activation must remain true"));
});
