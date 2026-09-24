#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-production-operations-control-register.json");
export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-00", "WO-01", "FND-05"]);
export const REQUIRED_ROLES = Object.freeze([
	"product-release-owner", "deployment-operator", "database-backup-operator", "security-owner",
	"support-lead", "on-call-responder", "business-continuity-owner", "customer-acceptance-owner",
]);
export const REQUIRED_RELEASE_STATES = Object.freeze([
	"planned", "change-reviewed", "candidate-built", "staging-deployed", "staging-accepted", "production-authorized",
	"production-deploying", "production-observing", "production-accepted", "rollback-triggered", "rolled-back", "superseded",
]);
export const REQUIRED_SERVICE_STATES = Object.freeze([
	"healthy", "degraded", "partial-outage", "full-outage", "maintenance-planned", "maintenance-active",
	"backup-failed", "restore-in-progress", "recovery-validation", "security-event", "data-integrity-review", "unknown-monitoring-gap",
]);
export const REQUIRED_INCIDENT_STATES = Object.freeze([
	"new", "triaged", "owned", "investigating", "mitigating", "monitoring", "resolved", "customer-validated", "root-cause-review", "closed",
]);
export const REQUIRED_INVARIANTS = Object.freeze([
	"source-commit-app-version-asset-hash-schema-state-config-and-deployed-candidate-are-bound",
	"development-staging-production-and-backup-destinations-remain-isolated",
	"deployment-success-smoke-success-business-acceptance-and-release-promotion-remain-distinct",
	"database-public-files-private-files-site-config-encryption-key-and-app-version-are-one-restore-set",
	"backup-created-is-not-restore-proven-and-restore-completed-is-not-business-validated",
	"migration-failure-cannot-be-skipped-or-presented-as-a-successful-production-upgrade",
	"rollback-trigger-threshold-owner-command-data-boundary-and-validation-are-decided-before-deploy",
	"rollback-cannot-discard-post-deploy-business-data-without-an-approved-data-recovery-decision",
	"web-worker-queue-scheduler-database-cache-socket-storage-certificate-and-provider-health-remain-visible",
	"customer-impact-severity-owner-timeline-mitigation-status-and-next-update-remain-explicit",
	"privileged-emergency-and-support-access-is-least-privilege-time-bounded-and-audited",
	"logs-traces-backups-dumps-screenshots-and-tickets-cannot-expose-secrets-or-unnecessary-personal-data",
	"availability-rpo-rto-support-and-retention-claims-require-measured-customer-approved-evidence",
	"configuration-drift-manual-hotfix-and-uncommitted-production-change-is-detected-and-resolved",
	"upgrade-backup-restore-and-incident-runbooks-are-executable-by-a-second-authorized-operator",
	"release-promotion-requires-accepted-critical-user-flows-and-no-unowned-critical-defect",
]);
export const REQUIRED_OPERATIONS_CHAIN = Object.freeze([
	"approved-change-scope-risk-owner-window-and-customer-communication",
	"versioned-source-dependency-image-config-migration-feature-flag-and-secret-manifest",
	"candidate-build-static-security-contract-migration-and-backup-compatibility-gates",
	"isolated-staging-deploy-migrate-smoke-performance-and-role-language-acceptance",
	"verified-current-backup-restore-point-rollback-plan-trigger-and-on-call-readiness",
	"production-authorization-deploy-migrate-assets-workers-scheduler-and-cache-transition",
	"health-error-latency-job-database-storage-certificate-integration-and-business-flow-observation",
	"accept-promote-or-trigger-rollback-with-customer-data-boundary-decision",
	"post-deploy-reconciliation-release-note-support-handoff-and-evidence-retention",
	"incident-response-recovery-restore-customer-validation-root-cause-and-prevention",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"environment-inventory-isolation-ownership-configuration-secret-and-drift",
	"source-version-dependency-image-asset-schema-config-and-candidate-provenance",
	"database-public-private-file-config-version-encryption-backup-retention-and-offsite-copy",
	"isolated-restore-integrity-permission-attachment-ledger-and-business-validation",
	"migration-patch-fixture-translation-search-index-worker-and-schema-compatibility",
	"predeploy-review-staging-smoke-role-language-width-performance-and-approval",
	"production-deploy-canary-or-window-observation-acceptance-and-communication",
	"rollback-trigger-command-data-boundary-restore-reconcile-and-customer-validation",
	"health-logs-errors-latency-workers-queues-scheduler-db-cache-storage-cert-and-provider-alerts",
	"severity-triage-ownership-escalation-status-incident-recovery-root-cause-and-followup",
	"privileged-support-access-mfa-break-glass-audit-redaction-retention-and-review",
	"sla-slo-rpo-rto-capacity-cost-support-hours-training-runbook-and-customer-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"environment-host-region-owner-version-config-domain-certificate-provider-secret-and-drift-inventory",
	"commit-tag-app-dependency-image-asset-hash-schema-config-migration-build-and-release-manifest",
	"scheduled-success-failure-encryption-retention-offsite-immutability-access-and-restore-point-backups",
	"two-isolated-database-public-private-file-config-version-permission-attachment-ledger-and-business-restore-drills",
	"clean-dirty-pending-job-failed-patch-retry-search-index-translation-worker-and-rollback-migration-scenarios",
	"staging-automated-smoke-critical-role-language-width-accessibility-performance-security-and-owner-approval",
	"production-window-authorization-deploy-observation-critical-flow-reconciliation-and-promotion-record",
	"predefined-error-latency-job-backlog-data-integrity-security-and-critical-flow-rollback-trigger-exercises",
	"web-worker-queue-scheduler-database-cache-socket-storage-certificate-integration-and-business-synthetic-alerts",
	"severity-one-through-four-triage-page-ownership-update-mitigation-recovery-customer-validation-and-postmortem",
	"administrator-support-mfa-least-privilege-time-bound-break-glass-audit-redaction-revoke-and-access-review",
	"candidate-volume-capacity-rpo-rto-support-sla-cost-runbook-training-second-operator-and-customer-signoff",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"supported-hosting-region-residency-network-domain-certificate-backup-and-provider-contract",
	"availability-slo-rpo-rto-backup-retention-offsite-copy-maintenance-window-and-business-continuity-policy",
	"release-change-freeze-approval-migration-feature-flag-rollback-trigger-and-data-recovery-policy",
	"security-mfa-privileged-break-glass-secret-log-vulnerability-incident-and-access-review-policy",
	"privacy-log-ticket-backup-dump-screenshot-retention-redaction-transfer-breach-and-disposition-policy",
	"support-hours-severity-response-update-escalation-customer-communication-training-and-sla-policy",
	"production-capacity-volume-cost-monitoring-alert-oncall-provider-and-renewal-ownership",
	"candidate-bound-deployment-restore-rollback-incident-business-validation-and-release-signoff",
]);

const duplicates = (values = []) => { const seen = new Set(); return values.filter(value => seen.has(value) || !seen.add(value)); };
const sameMembers = (actual = [], expected = []) => actual.length === expected.length && expected.every(value => actual.includes(value));
function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual || [], expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}
function requireTrue(errors, value, path) { if (value !== true) errors.push(`${path} must remain true`); }
export function readRegister(path = DEFAULT_REGISTER) { return JSON.parse(readFileSync(path, "utf8")); }

export function validateProductionOperationsContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of ["not security certification", "business-continuity guarantee", "zero-data-loss guarantee", "completed disaster-recovery exercise", "release acceptance"]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) errors.push("authority must point to the production operations and support contract");
	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.release_states, REQUIRED_RELEASE_STATES, "release_states");
	requireExact(errors, register?.service_states, REQUIRED_SERVICE_STATES, "service_states");
	requireExact(errors, register?.support_incident_states, REQUIRED_INCIDENT_STATES, "support_incident_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.operations_chain, REQUIRED_OPERATIONS_CHAIN, "operations_chain");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");
	if (register?.native_authority?.engine !== "frappe-bench-native-site-app-migration-backup-restore-worker-scheduler-and-release-lifecycle") errors.push("native_authority.engine must remain frappe-bench-native-site-app-migration-backup-restore-worker-scheduler-and-release-lifecycle");
	for (const field of [
		"production-data-or-generated-ledger-direct-edit-prohibited",
		"backup-must-cover-database-public-files-private-files-site-config-and-version-manifest",
		"restore-must-use-isolated-target-before-production-cutover",
		"release-migration-and-rollback-must-preserve-native-document-and-ledger-integrity",
		"secrets-credentials-backups-and-support-evidence-require-restricted-audited-access",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);
	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") errors.push(`control_domains.${domain.id}.state must remain planned until production acceptance exists`);
	if (register?.acceptance?.minimum_isolated_restore_drills !== 2) errors.push("acceptance.minimum_isolated_restore_drills must be 2");
	for (const field of [
		"requires_normal_and_failed_deployment_rehearsal", "requires_migration_and_rollback_with_post_deploy_data_boundary",
		"requires_exact_candidate_version_asset_schema_config_and_evidence_binding",
		"requires_critical_role_language_business_flow_and_ledger_reconciliation",
		"requires_monitoring_alert_incident_oncall_and_customer_communication_exercises",
		"requires_privileged_access_secret_backup_log_ticket_and_privacy_negative_tests",
		"requires_measured_slo_rpo_rto_capacity_and_support_evidence",
		"requires_second_authorized_operator_runbook_execution",
		"structural_validation_is_not_security_business_continuity_disaster_recovery_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);
	return Object.freeze({ valid: !errors.length, errors: Object.freeze(errors), controls: domains.length, releaseStates: register?.release_states?.length || 0, serviceStates: register?.service_states?.length || 0, incidentStates: register?.support_incident_states?.length || 0, evidenceGroups: register?.required_evidence_groups?.length || 0 });
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateProductionOperationsContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 production operations register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no security, continuity, restore, incident, support or release acceptance was evaluated.");
		console.log(`controls=${result.controls} release_states=${result.releaseStates} service_states=${result.serviceStates} incident_states=${result.incidentStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(`Production operations contract check failed: ${error.message}`); process.exitCode = 2; });
