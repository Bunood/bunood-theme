#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-saudi-payroll-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze([
	"HR-01", "HR-02", "HR-03", "HR-04", "HR-05",
]);
export const REQUIRED_ROLES = Object.freeze([
	"employee", "manager", "hr-operator", "time-attendance-operator", "payroll-preparer",
	"payroll-reviewer-approver", "finance-accountant", "compliance-integration-operator",
	"auditor", "system-administrator",
]);
export const REQUIRED_PAYROLL_STATES = Object.freeze([
	"new", "inputs-open", "inputs-frozen", "calculated", "exception", "prepared",
	"reviewed", "approved", "posted", "file-generated", "submitted-external",
	"accepted-external", "rejected-external", "correction-required", "paid",
	"reconciled", "closed", "reopened",
]);
export const REQUIRED_EMPLOYEE_CHAIN = Object.freeze([
	"approved-employment-terms",
	"effective-salary-assignment",
	"approved-time-leave-expense-and-other-inputs",
	"calculated-salary-slip",
	"reviewed-approved-payroll",
	"native-accounting-accrual",
	"bank-wps-output-and-external-response",
	"payment-and-bank-evidence",
	"gosi-wage-contributions-and-liabilities",
	"general-ledger-and-employee-balances",
]);
export const REQUIRED_CALCULATION_INVARIANTS = Object.freeze([
	"employee-population-is-frozen-and-deduplicated",
	"every-component-has-source-rule-version-basis-and-rounding",
	"gross-deductions-additions-and-net-follow-signed-formula-dictionary",
	"employer-contributions-do-not-silently-change-net-pay",
	"component-totals-equal-control-totals-and-native-salary-slips",
	"manual-overrides-require-reason-authority-and-variance",
	"negative-zero-and-material-net-variance-require-disposition",
	"same-snapshot-recalculation-is-deterministic",
	"retry-cannot-duplicate-slips-journals-files-or-submissions",
	"closed-history-is-not-recalculated-by-a-new-rule-version",
]);
export const REQUIRED_GOVERNMENT_INVARIANTS = Object.freeze([
	"generated-is-not-submitted",
	"submitted-is-not-acknowledged-or-accepted",
	"accepted-requires-authentic-response-bound-to-payload",
	"journal-or-bank-file-is-not-payment-evidence",
	"unknown-or-delayed-is-not-success",
	"partial-acceptance-preserves-row-results",
	"correction-supersedes-without-erasing-prior-evidence",
	"retry-is-idempotent",
	"credentials-do-not-confer-payroll-or-legal-approval",
	"manual-upload-remains-governed-when-no-supported-api-exists",
]);
export const REQUIRED_EXTERNAL_INTERFACES = Object.freeze([
	"qiwa-employment-contract-reference-and-status",
	"wage-protection-mudad-file-and-response",
	"gosi-wage-contribution-file-or-authorised-interface",
	"bank-payroll-file-and-payment-evidence",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"contract-to-salary-assignment",
	"approved-inputs-to-payslip-components",
	"components-to-gross-employer-cost-deductions-and-net",
	"payroll-controls-to-submitted-salary-slips",
	"earnings-and-employer-contributions-to-gl",
	"deductions-and-employer-shares-to-liabilities",
	"net-pay-to-payroll-payable-bank-wps-and-clearing",
	"loans-advances-and-expenses-to-employee-balances-and-gl",
	"contributory-wage-and-contributions-to-gosi-output-and-response",
	"external-paid-status-to-bank-liabilities-and-final-gl",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"employment-identity-contract-and-assignment",
	"employee-self-service-manager-and-hr-scope",
	"time-attendance-leave-expense-and-cutoff",
	"effective-dated-rule-pack-and-configuration",
	"gross-to-net-calculation-and-variance",
	"gosi-classification-wage-contribution-and-liability",
	"wage-protection-bank-output-submission-and-payment",
	"final-settlement-end-of-service-and-offboarding",
	"native-payroll-accounting-and-reconciliation",
	"connector-state-retry-security-and-support",
	"privacy-isolation-bilingual-accessible-ux",
	"evidence-regulatory-monitoring-and-acceptance",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"qualified-saudi-hr-payroll-legal-accounting-rule-review",
	"role-permission-segregation-and-employee-company-isolation",
	"employment-qiwa-contract-version-and-employee-decision-bridge",
	"attendance-shift-leave-overtime-expense-and-cutoff-comparison",
	"deterministic-gross-to-net-variance-override-and-idempotent-rerun",
	"gosi-population-wage-basis-transition-rate-and-liability",
	"approved-payroll-to-bank-wps-submission-response-and-payment",
	"native-accrual-payment-balances-liabilities-and-gl",
	"regular-retroactive-off-cycle-and-final-settlement",
	"rejection-partial-delay-correction-supersede-and-revoke-recovery",
	"bilingual-mobile-desktop-accessible-employee-readable-output",
	"candidate-bound-deidentified-run-packet-backup-restore-and-cleanup",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"employment-populations-contract-templates-and-establishment-map",
	"working-time-attendance-leave-overtime-and-cutoff-rules",
	"salary-components-formulas-accounts-dimensions-and-rounding",
	"gosi-coverage-classification-wage-branches-rates-and-transition",
	"wps-bank-schema-channel-identifiers-and-payment-evidence",
	"final-settlement-end-of-service-notice-leave-and-deductions",
	"maker-checker-variance-override-and-reopen-authority",
	"privacy-retention-processors-locations-and-restricted-access",
	"official-interface-authorisation-credentials-support-and-revocation",
]);

function duplicates(values = []) {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

function sameMembers(actual = [], expected = []) {
	return actual.length === expected.length && expected.every(value => actual.includes(value));
}

function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual || [], expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}

function requireTrue(errors, value, path) {
	if (value !== true) errors.push(`${path} must remain true`);
}

export function readRegister(path = DEFAULT_REGISTER) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateSaudiPayrollContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of [
		"not legal", "payroll", "social-insurance advice", "government-interface approval", "acceptance receipt",
	]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the Saudi people and payroll contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.payroll_states, REQUIRED_PAYROLL_STATES, "payroll_states");
	requireExact(errors, register?.employee_chain, REQUIRED_EMPLOYEE_CHAIN, "employee_chain");
	requireExact(errors, register?.calculation_invariants, REQUIRED_CALCULATION_INVARIANTS, "calculation_invariants");
	requireExact(errors, register?.government_state_invariants, REQUIRED_GOVERNMENT_INVARIANTS, "government_state_invariants");
	requireExact(errors, register?.external_interfaces, REQUIRED_EXTERNAL_INTERFACES, "external_interfaces");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.native_authority?.engine !== "frappe-hr-and-erpnext-native-documents-and-ledgers") {
		errors.push("native_authority.engine must remain frappe-hr-and-erpnext-native-documents-and-ledgers");
	}
	for (const field of [
		"parallel_payroll_ledger_prohibited", "generated_ledger_edit_prohibited",
		"simple_and_expert_share_records", "bank_entry_is_not_payment_evidence",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) {
		if (domain.state !== "planned") {
			errors.push(`control_domains.${domain.id}.state must remain planned until an external acceptance receipt exists`);
		}
	}

	if (register?.acceptance?.minimum_controlled_parallel_cycles !== 2) {
		errors.push("acceptance.minimum_controlled_parallel_cycles must be 2");
	}
	for (const field of [
		"requires_normal_and_exception_cycle", "requires_per_employee_and_control_total_reconciliation",
		"requires_distinct_preparer_and_reviewer", "requires_authentic_external_response_for_external_acceptance",
		"requires_candidate_bound_immutable_evidence", "structural_validation_is_not_payroll_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		chainLinks: register?.employee_chain?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateSaudiPayrollContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 Saudi people and payroll register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no legal, payroll, government-interface or financial acceptance was evaluated.");
		console.log(`controls=${result.controls} employee_chain_links=${result.chainLinks} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Saudi payroll contract check failed: ${error.message}`);
	process.exitCode = 2;
});
