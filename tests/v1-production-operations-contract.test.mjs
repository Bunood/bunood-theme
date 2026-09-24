import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_INCIDENT_STATES,
	REQUIRED_INVARIANTS,
	REQUIRED_OPERATIONS_CHAIN,
	REQUIRED_RELEASE_STATES,
	REQUIRED_SERVICE_STATES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateProductionOperationsContract,
} from "../tools/v1-production-operations-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("production operations and support are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateProductionOperationsContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.releaseStates, REQUIRED_RELEASE_STATES.length);
	assert.equal(result.serviceStates, REQUIRED_SERVICE_STATES.length);
	assert.equal(result.incidentStates, REQUIRED_INCIDENT_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not security certification/i);
});

test("release service and incident states keep deployment recovery and acceptance distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.release_states, [...REQUIRED_RELEASE_STATES]);
	assert.deepEqual(register.service_states, [...REQUIRED_SERVICE_STATES]);
	assert.deepEqual(register.support_incident_states, [...REQUIRED_INCIDENT_STATES]);
	for (const state of ["staging-accepted", "production-observing", "production-accepted", "rollback-triggered"]) assert.ok(register.release_states.includes(state), state);
	for (const state of ["backup-failed", "recovery-validation", "data-integrity-review", "unknown-monitoring-gap"]) assert.ok(register.service_states.includes(state), state);
});

test("operations chain binds candidate backup deploy rollback incident and evidence", () => {
	const register = readRegister();
	assert.deepEqual(register.operations_chain, [...REQUIRED_OPERATIONS_CHAIN]);
	for (const expected of [
		"verified-current-backup-restore-point-rollback-plan-trigger-and-on-call-readiness",
		"accept-promote-or-trigger-rollback-with-customer-data-boundary-decision",
		"incident-response-recovery-restore-customer-validation-root-cause-and-prevention",
	]) assert.ok(register.operations_chain.includes(expected), expected);
});

test("backup restore migration rollback access and release safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority["backup-must-cover-database-public-files-private-files-site-config-and-version-manifest"] = false;
	register.native_authority["restore-must-use-isolated-target-before-production-cutover"] = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "backup-created-is-not-restore-proven-and-restore-completed-is-not-business-validated");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "rollback-cannot-discard-post-deploy-business-data-without-an-approved-data-recovery-decision");
	const result = validateProductionOperationsContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.backup-must-cover-database-public-files-private-files-site-config-and-version-manifest must remain true"));
	assert.ok(result.errors.includes("native_authority.restore-must-use-isolated-target-before-production-cutover must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned operations cannot claim acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_isolated_restore_drills = 1;
	register.acceptance.requires_normal_and_failed_deployment_rehearsal = false;
	register.acceptance.requires_migration_and_rollback_with_post_deploy_data_boundary = false;
	register.acceptance.requires_privileged_access_secret_backup_log_ticket_and_privacy_negative_tests = false;
	register.acceptance.structural_validation_is_not_security_business_continuity_disaster_recovery_or_release_acceptance = false;
	const result = validateProductionOperationsContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_isolated_restore_drills must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_normal_and_failed_deployment_rehearsal must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_migration_and_rollback_with_post_deploy_data_boundary must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_privileged_access_secret_backup_log_ticket_and_privacy_negative_tests must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_security_business_continuity_disaster_recovery_or_release_acceptance must remain true"));
});
