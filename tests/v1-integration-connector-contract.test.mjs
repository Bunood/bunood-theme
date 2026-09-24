import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CATEGORIES,
	REQUIRED_CONNECTOR_STATES,
	REQUIRED_CONTROL_DOMAINS,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_INTEGRATION_CHAIN,
	REQUIRED_INVARIANTS,
	REQUIRED_MESSAGE_STATES,
	REQUIRED_RECONCILIATION_LINKS,
	REQUIRED_WORK_ORDERS,
	readRegister,
	validateIntegrationConnectorContract,
} from "../tools/v1-integration-connector-contract.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("integration and connector operations are a complete planning contract without acceptance claims", () => {
	const register = readRegister();
	const result = validateIntegrationConnectorContract(register);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.controls, REQUIRED_CONTROL_DOMAINS.length);
	assert.equal(result.connectorStates, REQUIRED_CONNECTOR_STATES.length);
	assert.equal(result.messageStates, REQUIRED_MESSAGE_STATES.length);
	assert.equal(result.evidenceGroups, REQUIRED_EVIDENCE_GROUPS.length);
	assert.deepEqual(register.work_orders, [...REQUIRED_WORK_ORDERS]);
	assert.deepEqual(register.connector_categories, [...REQUIRED_CATEGORIES]);
	assert.match(register.disclaimer, /not provider certification/i);
});

test("connector and message states keep authorization delivery settlement and reconciliation distinct", () => {
	const register = readRegister();
	assert.deepEqual(register.connector_states, [...REQUIRED_CONNECTOR_STATES]);
	assert.deepEqual(register.message_states, [...REQUIRED_MESSAGE_STATES]);
	for (const expected of ["authentication-expired", "consent-expired-or-revoked", "message-quarantined", "reconciliation-difference-open"]) assert.ok(register.connector_states.includes(expected), expected);
	for (const expected of ["idempotent-duplicate", "retry-scheduled", "dead-letter-quarantined", "replay-approved"]) assert.ok(register.message_states.includes(expected), expected);
});

test("integration chain and reconciliation link provider events to native truth", () => {
	const register = readRegister();
	assert.deepEqual(register.integration_chain, [...REQUIRED_INTEGRATION_CHAIN]);
	assert.deepEqual(register.reconciliation_links, [...REQUIRED_RECONCILIATION_LINKS]);
	for (const expected of [
		"payment-intent-request-callback-capture-refund-settlement-clearing-bank-and-gl",
		"external-order-line-discount-tax-shipping-currency-and-native-sales-order",
		"bank-consent-account-statement-transaction-match-voucher-bank-gl-and-difference",
	]) assert.ok(register.reconciliation_links.includes(expected), expected);
});

test("native authority idempotency secret and ledger safeguards cannot be weakened", () => {
	const register = clone(readRegister());
	register.native_authority["direct-database-access-prohibited"] = false;
	register.native_authority["least-privilege-dedicated-integration-identity-required"] = false;
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "at-least-once-delivery-and-retry-cannot-create-duplicate-native-business-or-financial-effects");
	register.outcome_invariants = register.outcome_invariants.filter(value => value !== "signature-timestamp-nonce-origin-and-replay-controls-run-before-business-side-effects");
	const result = validateIntegrationConnectorContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("native_authority.direct-database-access-prohibited must remain true"));
	assert.ok(result.errors.includes("native_authority.least-privilege-dedicated-integration-identity-required must remain true"));
	assert.ok(result.errors.some(error => error.startsWith("outcome_invariants must be exactly")));
	for (const invariant of REQUIRED_INVARIANTS) assert.ok(readRegister().outcome_invariants.includes(invariant));
});

test("planned connectors cannot claim acceptance and evidence requirements cannot shrink", () => {
	const register = clone(readRegister());
	register.control_domains[0].state = "verified";
	register.acceptance.minimum_customer_selected_connectors = 1;
	register.acceptance.requires_all_connector_categories = false;
	register.acceptance.requires_exact_external_native_stock_tax_payment_bank_and_gl_reconciliation = false;
	register.acceptance.requires_permission_secret_privacy_and_cross_tenant_negative_tests = false;
	register.acceptance.structural_validation_is_not_provider_bank_payment_open_banking_security_reconciliation_or_release_acceptance = false;
	const result = validateIntegrationConnectorContract(register);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("state must remain planned")));
	assert.ok(result.errors.includes("acceptance.minimum_customer_selected_connectors must be 3"));
	assert.ok(result.errors.includes("acceptance.requires_all_connector_categories must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_exact_external_native_stock_tax_payment_bank_and_gl_reconciliation must remain true"));
	assert.ok(result.errors.includes("acceptance.requires_permission_secret_privacy_and_cross_tenant_negative_tests must remain true"));
	assert.ok(result.errors.includes("acceptance.structural_validation_is_not_provider_bank_payment_open_banking_security_reconciliation_or_release_acceptance must remain true"));
});
