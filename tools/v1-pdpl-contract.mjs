#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-pdpl-control-register.json");

export const REQUIRED_ROLES = Object.freeze([
	"controller-owner", "dpo-or-privacy-owner", "privacy-operator", "data-owner",
	"security-incident-owner", "auditor",
]);
export const REQUIRED_RIGHTS = Object.freeze([
	"informed", "access", "copy", "correction", "destruction", "withdraw-consent",
]);
export const REQUIRED_REQUEST_STATES = Object.freeze([
	"received", "identity-verification", "scoping", "searching", "review-and-redaction",
	"decision", "fulfilment", "quality-check", "responded", "closed",
	"waiting-for-requester", "extension-proposed", "extended-after-notice",
	"partially-fulfilled", "refused-with-reason", "on-legal-hold", "escalated", "overdue",
]);
export const REQUIRED_ROPA_FIELDS = Object.freeze([
	"controller-and-privacy-contact",
	"activity-and-version",
	"purpose-and-reviewed-legal-basis",
	"data-subject-categories",
	"personal-and-sensitive-data-categories",
	"source-and-notice-version",
	"systems-fields-files-exports-logs-and-paper",
	"processors-subprocessors-and-recipients",
	"countries-transfer-route-safeguards-and-risk",
	"retention-trigger-period-source-hold-and-action",
	"security-permissions-impact-assessment-and-residual-risk",
	"owner-reviewer-dates-and-evidence",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"scope-and-role",
	"processing-inventory-and-ropa",
	"purpose-notice-and-consent",
	"data-subject-requests",
	"retention-holds-and-disposition",
	"processor-and-subprocessor",
	"cross-border-transfer",
	"privacy-impact-assessment",
	"personal-data-breach",
	"dpo-assessment-and-governance",
	"security-isolation-and-audit",
	"evidence-review-and-training",
]);
export const REQUIRED_DISPOSITION_INVARIANTS = Object.freeze([
	"no-ledger-stock-tax-payroll-or-audit-corruption",
	"legal-and-dispute-holds-precede-disposition",
	"backups-and-archives-remain-personal-data-when-applicable",
	"pseudonymised-data-remains-personal-data",
	"hidden-or-archived-is-not-destruction",
	"processor-and-downstream-propagation-is-recorded",
	"restored-data-reapplies-approved-tombstones-and-restrictions",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"qualified-legal-privacy-review",
	"versioned-processing-register",
	"six-right-request-journeys",
	"retention-hold-disposition-and-restore",
	"role-tenant-company-and-subject-isolation",
	"processor-activation-change-and-revocation",
	"cross-border-transfer-review",
	"impact-assessment-and-blocked-release",
	"breach-clock-notification-decision-and-recovery",
	"dpo-assessment-contacts-training-and-review",
	"bilingual-accessible-responsive-states",
	"candidate-bound-deidentified-run-packet",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"controller-processor-role",
	"lawful-basis-exception-and-notice",
	"retention-and-holds",
	"dpo-appointment-assessment",
	"processor-and-subprocessor",
	"transfer-route-and-residual-risk",
	"breach-threshold-and-notification",
	"destruction-restriction-or-anonymisation",
]);

function duplicates(values = []) {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

function sameMembers(actual = [], expected = []) {
	return actual.length === expected.length && expected.every(value => actual.includes(value));
}

function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual, expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}

function requireTrue(errors, value, path) {
	if (value !== true) errors.push(`${path} must remain true`);
}

export function readRegister(path = DEFAULT_REGISTER) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validatePdplContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	if (register?.work_order !== "KSA-06") errors.push("work_order must be KSA-06");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of ["not legal advice", "compliance certificate", "acceptance receipt"]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) {
		errors.push("authority must point to the Saudi PDPL operations contract");
	}

	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.data_subject_rights, REQUIRED_RIGHTS, "data_subject_rights");
	requireExact(errors, register?.request_states, REQUIRED_REQUEST_STATES, "request_states");
	requireExact(errors, register?.required_ropa_fields, REQUIRED_ROPA_FIELDS, "required_ropa_fields");
	requireExact(errors, register?.disposition_invariants, REQUIRED_DISPOSITION_INVARIANTS, "disposition_invariants");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");

	if (register?.request_deadlines_days?.standard !== 30) errors.push("request_deadlines_days.standard must be 30");
	if (register?.request_deadlines_days?.maximum_extension !== 30) errors.push("request_deadlines_days.maximum_extension must be 30");
	requireTrue(errors, register?.request_deadlines_days?.extension_requires_prior_notice_and_reason, "request_deadlines_days.extension_requires_prior_notice_and_reason");

	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) {
		if (domain.state !== "planned") errors.push(`control_domains.${domain.id}.state must remain planned until an external acceptance receipt exists`);
	}

	if (register?.breach?.authority_notification_ceiling_hours_when_threshold_met !== 72) {
		errors.push("breach.authority_notification_ceiling_hours_when_threshold_met must be 72");
	}
	for (const field of [
		"clock_starts_at_recorded_awareness",
		"legal_threshold_decision_requires_authorised_owner",
		"draft_is_not_notification",
	]) requireTrue(errors, register?.breach?.[field], `breach.${field}`);

	for (const field of [
		"requires_purpose_and_legal_basis",
		"requires_minimum_necessary_data",
		"requires_location_and_recipient",
		"requires_safeguard_or_reviewed_route",
		"requires_risk_assessment_when_applicable",
		"unknown_or_high_unresolved_risk_blocks_activation",
	]) requireTrue(errors, register?.transfer?.[field], `transfer.${field}`);

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		controls: domains.length,
		rights: register?.data_subject_rights?.length || 0,
		evidenceGroups: register?.required_evidence_groups?.length || 0,
	});
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validatePdplContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 Saudi PDPL control register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no legal or compliance acceptance claim was evaluated.");
		console.log(`rights=${result.rights} controls=${result.controls} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`PDPL contract check failed: ${error.message}`);
	process.exitCode = 2;
});
