import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_DECISION_CHAIN,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_INVARIANTS,
	REQUIRED_METRIC_FIELDS,
	REQUIRED_METRIC_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_RESULT_STATES,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateDecisionSupportContract,
} from "../tools/v1-decision-support-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("reporting and decision support are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateDecisionSupportContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.metricStates, REQUIRED_METRIC_STATES.length);
	assert.equal(result.resultStates, REQUIRED_RESULT_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.match(register.disclaimer, /not financial, accounting or tax advice/i);
});

test("metric definitions and result states preserve context freshness and failure meaning", () => {
	const register = readRegister();
	assert.deepEqual(register.metric_definition_fields, [...REQUIRED_METRIC_FIELDS]);
	assert.deepEqual(register.metric_definition_states, [...REQUIRED_METRIC_STATES]);
	assert.deepEqual(register.result_states, [...REQUIRED_RESULT_STATES]);
	for (const expected of ["current", "stale", "partial", "permission-limited", "calculation-error", "reconciliation-difference-open"]) {
		assert.ok(register.result_states.includes(expected), expected);
	}
});

test("decision chain and reconciliation connect summaries to native evidence", () => {
	const register = readRegister();
	assert.deepEqual(register.decision_chain, [...REQUIRED_DECISION_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"trial-balance-general-ledger-financial-statements-and-source-vouchers",
		"stock-ledger-valuation-cogs-gross-profit-count-and-gl",
		"metric-card-work-queue-report-drill-down-export-print-and-scheduled-copy",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("native authority permissions and reporting safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority["parallel-kpi-ledger-or-reporting-database-prohibited"] = false;
	register.native_authority["saved-scheduled-exported-results-preserve-effective-user-permissions"] = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "effective-user-permissions-apply-before-aggregation-export-and-delivery");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "metric-cache-cannot-leak-data-across-user-company-customer-or-tenant-boundaries");
	const result = validateDecisionSupportContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.parallel-kpi-ledger-or-reporting-database-prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.saved-scheduled-exported-results-preserve-effective-user-permissions must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned controls cannot claim acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_controlled_datasets_or_periods = 1;
	register.acceptance.requires_exact_metric_report_drill_export_print_and_schedule_reconciliation = false;
	register.acceptance.requires_permission_and_cross_tenant_negative_tests = false;
	register.acceptance["requires_real_owner-and-operational-role_question-task-acceptance"] = false;
	register.acceptance.structural_validation_is_not_metric_reconciliation_financial_advice_audit_or_release_acceptance = false;
	const result = validateDecisionSupportContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_controlled_datasets_or_periods must be 2"));
	assert.ok(result.errors.includes("acceptance.requires_exact_metric_report_drill_export_print_and_schedule_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_permission_and_cross_tenant_negative_tests must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_real_owner-and-operational-role_question-task-acceptance must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_metric_reconciliation_financial_advice_audit_or_release_acceptance must remain true"));
});
