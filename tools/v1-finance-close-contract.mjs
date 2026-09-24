#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-finance-close-control-register.json");

export const REQUIRED_WORK_ORDERS = Object.freeze(
	Array.from({ length: 10 }, (_, index) => `FIN-${String(index + 1).padStart(2, "0")}`),
);
export const REQUIRED_ROLES = Object.freeze([
	"ap-ar-clerk", "staff-accountant", "senior-accountant-controller",
	"finance-manager-cfo", "auditor", "system-administrator",
]);
export const REQUIRED_CLOSE_STATES = Object.freeze([
	"not-started", "ready", "in-progress", "waiting-dependency", "blocked", "at-risk",
	"prepared", "reviewed", "approved", "reopened", "complete",
]);
export const REQUIRED_DEPENDENCY_LEVELS = Object.freeze([
	"transaction-cutoff-and-source-capture",
	"subledger-payment-bank-stock-and-cash-reconciliation",
	"balance-sheet-reconciliation-and-approved-adjustments",
	"tax-supported-consolidation-and-draft-statements",
	"management-review-lock-and-controlled-distribution",
]);
export const REQUIRED_CLOSE_PHASES = Object.freeze([
	"pre-close", "t-plus-1", "t-plus-2", "t-plus-3", "t-plus-4", "t-plus-5",
]);
export const REQUIRED_RECONCILIATION_FAMILIES = Object.freeze([
	"trial-balance-to-general-ledger",
	"accounts-receivable-and-payment-ledger-to-gl",
	"accounts-payable-and-payment-ledger-to-gl",
	"bank-statement-and-bank-transactions-to-vouchers-and-gl",
	"cash-pos-shifts-tenders-deposits-and-clearing",
	"stock-ledger-and-valuation-to-inventory-gl",
	"fixed-asset-register-and-depreciation-to-gl",
	"deferred-accrual-and-prepayment-schedules-to-gl",
	"vat-withholding-zatca-source-to-tax-ledger-and-filing",
	"foreign-currency-subledgers-and-revaluation-to-gl",
	"supported-intercompany-and-elimination",
]);
export const REQUIRED_JOURNAL_INVARIANTS = Object.freeze([
	"debits-equal-credits-in-required-currencies",
	"company-book-date-account-party-dimension-and-rate-validity",
	"purpose-preparer-support-source-and-reversal-are-explicit",
	"maker-checker-separation-when-configured",
	"high-risk-and-top-side-enhanced-review",
	"recurring-or-automatic-creation-does-not-imply-approval",
	"generated-entry-keeps-native-source-link",
	"submitted-source-and-ledger-rows-are-not-edited",
	"duplicate-run-is-idempotent",
	"approval-rejection-amendment-and-reversal-are-auditable",
]);
export const REQUIRED_PERIOD_INVARIANTS = Object.freeze([
	"soft-close-is-not-hard-lock",
	"accounting-period-selectively-restricts-configured-document-types",
	"accounts-frozen-up-to-is-a-separate-broader-posting-control",
	"period-closing-voucher-transfers-profit-and-loss-but-is-not-a-lock",
	"hard-close-requires-reconciliation-review-lock-and-sign-off",
	"late-posting-denial-is-server-enforced",
	"reopen-requires-scope-reason-impact-approval-and-window",
	"reopen-postings-force-affected-work-back-to-review",
	"relock-is-confirmed-and-audited",
	"administrator-is-not-accounting-approver-by-default",
]);
export const REQUIRED_REPORTS = Object.freeze([
	"trial-balance", "general-ledger", "profit-and-loss", "balance-sheet", "cash-flow",
	"accounts-receivable-and-ageing", "accounts-payable-and-ageing", "bank-reconciliation",
	"fixed-asset-and-depreciation", "stock-valuation-to-gl", "tax-vat",
	"budget-versus-actual", "supported-comparative-and-consolidated",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"accounting-authority-and-configuration",
	"roles-permissions-and-segregation",
	"continuous-accounting-queues",
	"close-calendar-dependencies-and-critical-path",
	"reconciliation-and-difference-governance",
	"journal-schedule-and-adjustment-governance",
	"bank-payment-and-cash-control",
	"assets-stock-deferred-fx-and-tax-close",
	"soft-close-lock-reopen-and-relock",
	"statements-variance-drilldown-and-distribution",
	"bilingual-accessible-responsive-expert-ux",
	"evidence-metrics-review-and-retrospective",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"qualified-accountant-policy-framework-and-materiality",
	"role-permission-segregation-and-company-isolation",
	"pre-close-through-t-plus-5-dependency-execution",
	"all-applicable-reconciliation-families",
	"journal-accrual-reversal-recurring-and-generated-entry",
	"bank-import-match-create-unmatch-and-payment-allocation",
	"stock-asset-deferred-fx-tax-and-cash-pos-close",
	"statement-reproduction-drilldown-and-opening-continuity",
	"soft-close-lock-denied-late-posting-reopen-and-relock",
	"late-adjustment-failed-job-stale-rate-duplicate-and-recovery",
	"bilingual-responsive-accessible-keyboard-task-completion",
	"candidate-bound-close-packet-backup-restore-and-cleanup",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"reporting-framework-and-accounting-policies",
	"chart-books-dimensions-and-closing-account",
	"materiality-reconciliation-ageing-and-escalation",
	"close-calendar-cutoff-owners-and-reviewers",
	"journal-thresholds-reversal-and-automation",
	"exchange-rate-source-freshness-revaluation-and-reversal",
	"depreciation-capitalisation-deferred-and-inventory-policy",
	"period-lock-bypass-reopen-and-distribution",
	"saudi-tax-zatca-payroll-and-filing-interpretation",
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

export function validateFinanceCloseContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of ["not accounting advice", "financial-statement acceptance", "acceptance receipt"]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the expert finance and close contract");
	}

	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.close_states, REQUIRED_CLOSE_STATES, "close_states");
	requireExact(errors, register?.dependency_levels, REQUIRED_DEPENDENCY_LEVELS, "dependency_levels");
	requireExact(errors, register?.baseline_close_phases, REQUIRED_CLOSE_PHASES, "baseline_close_phases");
	requireExact(errors, register?.reconciliation_families, REQUIRED_RECONCILIATION_FAMILIES, "reconciliation_families");
	requireExact(errors, register?.journal_invariants, REQUIRED_JOURNAL_INVARIANTS, "journal_invariants");
	requireExact(errors, register?.period_control_invariants, REQUIRED_PERIOD_INVARIANTS, "period_control_invariants");
	requireExact(errors, register?.required_reports, REQUIRED_REPORTS, "required_reports");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.accounting_authority?.engine !== "native-erpnext-documents-and-ledgers") {
		errors.push("accounting_authority.engine must remain native-erpnext-documents-and-ledgers");
	}
	for (const field of [
		"parallel_ledger_prohibited", "generated_ledger_edit_prohibited", "simple_and_expert_share_records",
	]) requireTrue(errors, register?.accounting_authority?.[field], `accounting_authority.${field}`);

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) {
		if (domain.state !== "planned") {
			errors.push(`control_domains.${domain.id}.state must remain planned until an external acceptance receipt exists`);
		}
	}

	if (register?.acceptance?.minimum_consecutive_controlled_closes !== 2) {
		errors.push("acceptance.minimum_consecutive_controlled_closes must be 2");
	}
	for (const field of [
		"requires_normal_and_exception_close", "requires_same_boundary_for_reconciliation",
		"requires_preparer_and_reviewer", "requires_candidate_bound_immutable_evidence",
		"structural_validation_is_not_accounting_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		reconciliations: register?.reconciliation_families?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateFinanceCloseContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 expert finance and close register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no accounting or financial-statement acceptance was evaluated.");
		console.log(`controls=${result.controls} reconciliations=${result.reconciliations} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`Finance close contract check failed: ${error.message}`);
	process.exitCode = 2;
});
