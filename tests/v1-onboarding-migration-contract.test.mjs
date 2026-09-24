import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DATA_DEPENDENCY_ORDER,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_MIGRATION_STATES,
	REQUIRED_READINESS_DOMAINS,
	REQUIRED_RECONCILIATION_DOMAINS,
	REQUIRED_SAFETY_INVARIANTS,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateOnboardingMigrationContract,
} from "../tools/v1-onboarding-migration-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("guided onboarding and migration is a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateOnboardingMigrationContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.readinessDomains, REQUIRED_READINESS_DOMAINS.length);
	assert.equal(result.migrationStates, REQUIRED_MIGRATION_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not an onboarding usability receipt/i);
	assert.match(register.disclaimer, /data-migration acceptance receipt/i);
});

test("uploaded validated imported reconciled and accepted remain distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.migration_states, [...REQUIRED_MIGRATION_STATES]);
	for (const state of [
		"dry-run-validated", "approved-for-load", "importing", "imported-unreconciled",
		"reconciled", "accepted", "rolled-back",
	]) assert.ok(register.migration_states.includes(state), state);
	assert.ok(register.safety_invariants.includes("uploaded-is-not-validated-imported-reconciled-or-accepted"));
	assert.equal(register.native_authority.no_import_success_without_commit_and_reconciliation, true);
});

test("native load order and reconciliation preserve opening dependencies", () => {
	const register = readRegister();
	assert.deepEqual(register.data_dependency_order, [...REQUIRED_DATA_DEPENDENCY_ORDER]);
	assert.deepEqual(register.reconciliation_domains, [...REQUIRED_RECONCILIATION_DOMAINS]);
	assert.ok(register.data_dependency_order.indexOf("chart-dimensions-tax-accounts-and-defaults") <
		register.data_dependency_order.indexOf("opening-ar-ap-through-opening-invoice-tool-or-approved-native-alternative"));
	assert.ok(register.data_dependency_order.indexOf("opening-ar-ap-through-opening-invoice-tool-or-approved-native-alternative") <
		register.data_dependency_order.indexOf("cash-bank-advances-and-remaining-trial-balance-without-double-counting"));
});

test("dry run idempotency ledger authority and upgrade separation cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority.parallel_staging_ledger_prohibited = false;
	register.native_authority.dry_run_cannot_mutate_business_state = false;
	register.native_authority.version_upgrade_is_separate_from_business_data_migration = false;
	register.safety_invariants = register.safety_invariants.filter(value => value !== "rolled-back-rows-cannot-be-reported-as-imported");
	register.data_dependency_order.reverse();
	const result = validateOnboardingMigrationContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel_staging_ledger_prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.dry_run_cannot_mutate_business_state must remain true"));
	assert.ok(result.errors.includes("native_authority.version_upgrade_is_separate_from_business_data_migration must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("safety_invariants must be exactly")));
	assert.ok(result.errors.some(error => error.startsWith("data_dependency_order must preserve")));
	for (const invariant of REQUIRED_SAFETY_INVARIANTS) assert.ok(readRegister().safety_invariants.includes(invariant));
});

test("planned controls cannot become verified and acceptance evidence cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_controlled_migration_rehearsals = 1;
	register.acceptance.requires_clean_and_dirty_dataset = false;
	register.acceptance.requires_exact_applicable_control_reconciliation = false;
	register.acceptance.structural_validation_is_not_onboarding_or_migration_acceptance = false;
	const result = validateOnboardingMigrationContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_controlled_migration_rehearsals must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_clean_and_dirty_dataset must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_exact_applicable_control_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_onboarding_or_migration_acceptance must remain true"));
});
