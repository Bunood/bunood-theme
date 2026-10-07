#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REGISTER = resolve(ROOT, "quality", "v1-integration-connector-control-register.json");
export const REQUIRED_WORK_ORDERS = Object.freeze(["WO-30", "WO-31"]);
export const REQUIRED_CATEGORIES = Object.freeze([
	"customer-selected-payment-provider", "customer-selected-bank-open-banking-or-statement-source",
	"customer-selected-ecommerce-or-order-source",
]);
export const REQUIRED_ROLES = Object.freeze([
	"business-process-owner", "integration-administrator", "security-owner", "privacy-compliance-reviewer",
	"finance-reconciler", "operations-support-operator", "connector-maintainer", "vendor-partner-owner",
]);
export const REQUIRED_CONNECTOR_STATES = Object.freeze([
	"draft", "awaiting-business-security-and-data-approval", "sandbox-configured", "sandbox-healthy",
	"production-approval-pending", "production-enabled", "healthy", "degraded", "rate-limited",
	"authentication-expired", "consent-expired-or-revoked", "message-retrying", "message-quarantined",
	"reconciliation-difference-open", "suspended", "retired",
]);
export const REQUIRED_MESSAGE_STATES = Object.freeze([
	"received", "authentication-or-signature-verified", "authentication-or-signature-rejected",
	"schema-or-business-validation-failed", "mapped", "idempotent-duplicate", "queued", "processing",
	"delivered", "acknowledged", "retry-scheduled", "dead-letter-quarantined", "replay-approved", "reconciled",
]);
export const REQUIRED_INVARIANTS = Object.freeze([
	"provider-authorization-merchant-contract-consent-and-technical-connectivity-remain-distinct",
	"authenticated-received-accepted-captured-settled-bank-credited-and-reconciled-remain-distinct",
	"external-order-native-order-delivery-invoice-payment-return-and-refund-remain-distinct",
	"every-mapping-has-version-stable-external-id-native-id-and-change-owner",
	"at-least-once-delivery-and-retry-cannot-create-duplicate-native-business-or-financial-effects",
	"out-of-order-late-and-unknown-events-are-held-or-applied-only-by-an-approved-safe-rule",
	"signature-timestamp-nonce-origin-and-replay-controls-run-before-business-side-effects",
	"failed-partial-or-ambiguous-outcome-is-not-reported-as-success",
	"replay-reprocess-remap-or-manual-override-requires-permission-reason-and-audit-history",
	"secret-token-and-consent-rotation-revocation-expiry-and-emergency-disable-are-operable",
	"connector-code-cannot-write-generated-ledgers-or-bypass-native-submit-cancel-amend-and-permission-controls",
	"source-payload-log-and-error-retention-minimizes-personal-confidential-and-payment-data",
	"cache-queue-dead-letter-log-file-and-export-cannot-cross-company-customer-or-tenant-boundaries",
	"provider-api-schema-webhook-and-app-version-compatibility-is-monitored-and-owned",
	"health-lag-backlog-failure-reconciliation-and-support-state-is-visible-without-exposing-secrets",
	"marketplace-certified-approved-supported-or-offline-claims-require-exact-provider-and-scope-evidence",
]);
export const REQUIRED_INTEGRATION_CHAIN = Object.freeze([
	"approved-business-purpose-data-owner-provider-contract-and-support-boundary",
	"sandbox-production-endpoints-authentication-consent-scope-and-secret-lifecycle",
	"versioned-schema-field-enum-currency-timezone-and-identifier-mapping",
	"authenticated-signed-ingress-or-permissioned-egress-request",
	"validation-idempotency-ordering-rate-limit-and-quarantine-decision",
	"durable-queue-background-processing-retry-dead-letter-and-approved-replay",
	"native-api-document-workflow-submit-cancel-amend-or-status-result",
	"provider-acknowledgement-callback-capture-settlement-or-fulfilment-result",
	"native-provider-bank-stock-tax-payment-and-gl-reconciliation",
	"health-alert-support-incident-evidence-retention-revoke-and-retirement",
]);
export const REQUIRED_RECONCILIATION_LINKS = Object.freeze([
	"external-catalog-item-variant-price-tax-uom-and-native-item-price",
	"external-customer-address-contact-consent-tax-identity-and-native-customer",
	"external-order-line-discount-tax-shipping-currency-and-native-sales-order",
	"external-fulfilment-tracking-delivery-return-and-native-stock-ledger",
	"external-refund-credit-note-return-payment-and-native-original-reference",
	"payment-intent-request-callback-capture-refund-settlement-clearing-bank-and-gl",
	"bank-consent-account-statement-transaction-match-voucher-bank-gl-and-difference",
	"tax-zatca-provider-event-native-document-xml-qr-response-output-and-gl",
	"message-attempt-external-id-native-id-state-error-replay-and-final-outcome",
	"connector-health-volume-lag-backlog-failure-quarantine-difference-and-support-ticket",
]);
export const REQUIRED_CONTROL_DOMAINS = Object.freeze([
	"connector-catalogue-business-purpose-owner-provider-scope-and-lifecycle",
	"sandbox-production-identity-secret-token-consent-scope-rotation-and-revoke",
	"schema-field-enum-currency-timezone-external-id-version-and-migration",
	"webhook-signature-origin-timestamp-nonce-replay-size-and-content-validation",
	"idempotency-duplicate-ordering-late-event-conflict-partial-and-ambiguous-outcome",
	"queue-worker-rate-limit-timeout-backoff-retry-dead-letter-and-approved-replay",
	"native-api-permission-document-workflow-submit-cancel-amend-and-ledger-safety",
	"payment-callback-capture-refund-settlement-clearing-bank-and-gl",
	"ecommerce-catalog-customer-order-stock-fulfilment-return-and-tax",
	"bank-open-banking-consent-statement-match-voucher-difference-and-reconciliation",
	"privacy-security-payload-log-file-export-retention-isolation-and-incident",
	"health-lag-backlog-alert-support-slo-load-recovery-upgrade-and-candidate-evidence",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"customer-selected-provider-business-purpose-data-owner-contract-scope-support-and-exit-approval",
	"sandbox-production-identity-permission-secret-token-consent-rotation-revoke-and-emergency-disable",
	"versioned-schema-mapping-external-native-id-enum-currency-timezone-change-and-backfill-scenarios",
	"valid-invalid-missing-expired-signature-origin-timestamp-nonce-replay-oversize-and-malformed-webhooks",
	"duplicate-out-of-order-late-conflict-partial-timeout-ambiguous-retry-quarantine-and-replay-scenarios",
	"worker-backlog-rate-limit-backoff-provider-outage-dead-letter-recovery-and-no-duplicate-side-effects",
	"native-role-user-permission-submit-cancel-amend-api-export-cross-company-and-cross-tenant-negative-tests",
	"payment-intent-callback-capture-refund-settlement-clearing-bank-gl-and-provider-reconciliation",
	"ecommerce-catalog-customer-order-discount-tax-stock-fulfilment-return-refund-and-ledger-reconciliation",
	"bank-consent-account-statement-transaction-match-split-merge-partial-voucher-difference-and-gl-reconciliation",
	"payload-log-file-export-retention-redaction-personal-confidential-payment-data-and-incident-tests",
	"candidate-version-app-api-schema-hash-volume-latency-lag-backlog-alert-support-upgrade-rollback-and-approvals",
]);
export const REQUIRED_EXTERNAL_APPROVALS = Object.freeze([
	"customer-selected-provider-commercial-license-authorization-merchant-and-support-terms",
	"business-purpose-data-owner-source-of-truth-mapping-conflict-and-manual-override-policy",
	"security-authentication-signature-secret-token-network-incident-and-vulnerability-policy",
	"privacy-purpose-notice-consent-minimization-residency-transfer-retention-and-processor-policy",
	"payment-refund-settlement-clearing-fee-difference-reconciliation-and-accounting-policy",
	"bank-open-banking-consent-scope-conformance-statement-transaction-and-revocation-policy",
	"ecommerce-catalog-customer-order-stock-tax-fulfilment-return-and-refund-policy",
	"production-cutover-volume-slo-monitoring-support-change-upgrade-rollback-exit-and-signoff",
]);

const duplicates = (values = []) => { const seen = new Set(); return values.filter(value => seen.has(value) || !seen.add(value)); };
const sameMembers = (actual = [], expected = []) => actual.length === expected.length && expected.every(value => actual.includes(value));
function requireExact(errors, actual, expected, path) {
	if (!sameMembers(actual || [], expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const value of duplicates(actual || [])) errors.push(`${path} repeats ${value}`);
}
function requireTrue(errors, value, path) { if (value !== true) errors.push(`${path} must remain true`); }
export function readRegister(path = DEFAULT_REGISTER) { return JSON.parse(readFileSync(path, "utf8")); }

export function validateIntegrationConnectorContract(register, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (register?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(register?.disclaimer || "").toLowerCase();
	for (const phrase of ["not provider certification", "bank or payment authorization", "open banking conformance", "security approval", "reconciled integration", "release acceptance"]) if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	if (!register?.authority || (checkFiles && !existsSync(resolve(root, register.authority)))) errors.push("authority must point to the integration and connector operations contract");
	requireExact(errors, register?.work_orders, REQUIRED_WORK_ORDERS, "work_orders");
	requireExact(errors, register?.connector_categories, REQUIRED_CATEGORIES, "connector_categories");
	requireExact(errors, register?.operating_roles, REQUIRED_ROLES, "operating_roles");
	requireExact(errors, register?.connector_states, REQUIRED_CONNECTOR_STATES, "connector_states");
	requireExact(errors, register?.message_states, REQUIRED_MESSAGE_STATES, "message_states");
	requireExact(errors, register?.outcome_invariants, REQUIRED_INVARIANTS, "outcome_invariants");
	requireExact(errors, register?.integration_chain, REQUIRED_INTEGRATION_CHAIN, "integration_chain");
	requireExact(errors, register?.reconciliation_links, REQUIRED_RECONCILIATION_LINKS, "reconciliation_links");
	requireExact(errors, register?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");
	requireExact(errors, register?.external_approvals, REQUIRED_EXTERNAL_APPROVALS, "external_approvals");
	if (register?.native_authority?.engine !== "frappe-native-permissioned-api-webhook-background-job-and-erpnext-documents-ledgers") errors.push("native_authority.engine must remain frappe-native-permissioned-api-webhook-background-job-and-erpnext-documents-ledgers");
	for (const field of [
		"parallel-master-order-payment-stock-accounting-or-tax-records-prohibited", "direct-database-access-prohibited",
		"least-privilege-dedicated-integration-identity-required",
		"external-or-connector-state-cannot-override-native-business-or-financial-truth",
		"secrets-tokens-personal-data-and-payloads-cannot-leak-to-client-logs-or-exports",
	]) requireTrue(errors, register?.native_authority?.[field], `native_authority.${field}`);
	const domains = register?.control_domains || [];
	requireExact(errors, domains.map(item => item.id), REQUIRED_CONTROL_DOMAINS, "control_domains");
	for (const domain of domains) if (domain.state !== "planned") errors.push(`control_domains.${domain.id}.state must remain planned until connector acceptance exists`);
	if (register?.acceptance?.minimum_customer_selected_connectors !== 3) errors.push("acceptance.minimum_customer_selected_connectors must be 3");
	for (const field of [
		"requires_all_connector_categories", "requires_sandbox_and_authorized_production_cycles", "requires_normal_and_exception_cycles",
		"requires_exact_external_native_stock_tax_payment_bank_and_gl_reconciliation",
		"requires_duplicate_out_of_order_late_timeout_revoke_outage_replay_and_recovery_scenarios",
		"requires_permission_secret_privacy_and_cross_tenant_negative_tests",
		"requires_real_business_finance_support_and_administrator_task_acceptance",
		"requires_candidate_bound_load_upgrade_rollback_monitoring_and_support_evidence",
		"structural_validation_is_not_provider_bank_payment_open_banking_security_reconciliation_or_release_acceptance",
	]) requireTrue(errors, register?.acceptance?.[field], `acceptance.${field}`);
	return Object.freeze({ valid: !errors.length, errors: Object.freeze(errors), controls: domains.length, connectorStates: register?.connector_states?.length || 0, messageStates: register?.message_states?.length || 0, evidenceGroups: register?.required_evidence_groups?.length || 0 });
}

async function main() {
	const index = process.argv.indexOf("--register");
	const path = resolve(index === -1 ? DEFAULT_REGISTER : process.argv[index + 1]);
	const result = validateIntegrationConnectorContract(readRegister(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 integration and connector register: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning contract only — no provider, payment, bank, Open Banking, security, reconciliation or release acceptance was evaluated.");
		console.log(`controls=${result.controls} connector_states=${result.connectorStates} message_states=${result.messageStates} evidence_groups=${result.evidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(`Integration connector contract check failed: ${error.message}`); process.exitCode = 2; });
