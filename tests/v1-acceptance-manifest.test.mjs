import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_ALL_WORK_ORDERS,
	REQUIRED_CATALOG_WORK_ORDERS,
	REQUIRED_DETAILED_WORK_ORDERS,
	REQUIRED_PERSONAS,
	REQUIRED_SURFACES,
	REQUIRED_SYSTEM_STATES,
	readManifest,
	validateManifest,
} from "../tools/v1-acceptance-manifest.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("V1 acceptance manifest declares the complete representative matrix without claiming execution", () => {
	const manifest = readManifest();
	const result = validateManifest(manifest);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.surfaces, REQUIRED_SURFACES.length);
	assert.ok(result.targetCombinations >= 700, `target matrix is unexpectedly narrow: ${result.targetCombinations}`);
	assert.ok(result.availableGates > 0);
	assert.ok(result.plannedGates > 0, "known V1 gaps must remain explicit until their live gates exist");
	const item = manifest.surfaces.find(surface => surface.id === "item");
	assert.deepEqual(item.gates.find(gate => gate.id === "live"), {
		id: "live",
		state: "available",
		command: "node tools/form-bilingual-acceptance.mjs && node tools/item-live-acceptance.mjs",
		artifacts: ["tools/form-bilingual-acceptance.mjs", "tools/item-live-acceptance.mjs", "tests/item-live-acceptance.test.mjs"],
	});
	const stockEntry = manifest.surfaces.find(surface => surface.id === "stock-entry");
	assert.deepEqual(stockEntry.gates.find(gate => gate.id === "live"), {
		id: "live",
		state: "available",
		command: "node tools/stock-entry-live-acceptance.mjs",
		artifacts: [
			"tools/stock-entry-live-acceptance.mjs",
			"tests/stock-entry-live-acceptance.test.mjs",
			"bunood_theme/public/js/stock_entry_compat.js",
			"tests/stock-entry-settings-compat.test.cjs",
			"bunood_theme/api.py",
			"bunood_theme/hooks.py",
		],
	});
	assert.equal(result.workOrders, 51);
	assert.deepEqual(result.workOrderStates, {
		"implemented-acceptance-incomplete": 34,
		planned: 17,
	});
	assert.deepEqual(manifest.personas, [...REQUIRED_PERSONAS]);
	assert.deepEqual(manifest.dimensions.system_states, [...REQUIRED_SYSTEM_STATES]);
	assert.match(manifest.disclaimer, /not a test receipt/i);
	assert.equal(manifest.product_grammar, "docs/BUNOOD-V1-UNIVERSAL-PRODUCT-GRAMMAR-2026-09-20.md");
	assert.equal(manifest.terminology_governance, "docs/BUNOOD-V1-BILINGUAL-TERMINOLOGY-GOVERNANCE-2026-09-20.md");
	assert.equal(manifest.user_research_protocol, "docs/BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md");
	assert.equal(manifest.performance_reliability_slo, "docs/BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md");
	assert.equal(manifest.performance_budget, "quality/v1-performance-budget.json");
	assert.equal(manifest.performance_receipt_template, "quality/templates/v1-performance-receipt.template.json");
	assert.equal(manifest.pdpl_operations_contract, "docs/BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md");
	assert.equal(manifest.pdpl_control_register, "quality/v1-pdpl-control-register.json");
	assert.equal(manifest.expert_finance_close_contract, "docs/BUNOOD-V1-EXPERT-FINANCE-AND-CLOSE-CONTRACT-2026-09-20.md");
	assert.equal(manifest.finance_close_control_register, "quality/v1-finance-close-control-register.json");
	assert.equal(manifest.saudi_people_payroll_contract, "docs/BUNOOD-V1-SAUDI-PEOPLE-PAYROLL-CONTRACT-2026-09-20.md");
	assert.equal(manifest.saudi_payroll_control_register, "quality/v1-saudi-payroll-control-register.json");
	assert.equal(manifest.onboarding_migration_contract, "docs/BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md");
	assert.equal(manifest.onboarding_migration_control_register, "quality/v1-onboarding-migration-control-register.json");
	assert.equal(manifest.saudi_zatca_operations_contract, "docs/BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md");
	assert.equal(manifest.zatca_control_register, "quality/v1-zatca-control-register.json");
	assert.equal(manifest.reporting_decision_support_contract, "docs/BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md");
	assert.equal(manifest.decision_support_control_register, "quality/v1-decision-support-control-register.json");
	assert.equal(manifest.integration_connector_operations_contract, "docs/BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md");
	assert.equal(manifest.integration_connector_control_register, "quality/v1-integration-connector-control-register.json");
	assert.equal(manifest.production_operations_support_contract, "docs/BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md");
	assert.equal(manifest.production_operations_control_register, "quality/v1-production-operations-control-register.json");
	assert.equal(manifest.work_order_catalog, "docs/BUNOOD-V1-WORK-ORDER-CATALOG-2026-09-20.md");
	assert.equal(manifest.detailed_work_orders, "docs/ERP-MARKET-RECOMMENDATIONS-WORK-ORDERS-2026-09-20.md");
	assert.equal(manifest.work_order_status, "quality/v1-work-order-status.json");
	assert.equal(manifest.program_authority_map, "quality/v1-program-authority-map.json");
	assert.equal(manifest.saudi_market_research_synthesis, "docs/BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md");
	assert.equal(manifest.edition_promotion_gates, "quality/v1-edition-promotion-gates.json");
	assert.equal(REQUIRED_CATALOG_WORK_ORDERS.length, 37);
	assert.equal(REQUIRED_DETAILED_WORK_ORDERS.length, 14);
	assert.equal(REQUIRED_ALL_WORK_ORDERS.length, 51);
	assert.doesNotMatch(JSON.stringify(manifest.surfaces), /\bpass(ed)?\b/i);
});

test("every old and new work-order identifier resolves to one bounded definition", () => {
	const manifest = readManifest();
	const result = validateManifest(manifest);
	assert.deepEqual(result.errors.filter(error => error.includes("work_order")), []);
});

test("every declared runnable gate points to real repository evidence", () => {
	const manifest = readManifest();
	for (const surface of manifest.surfaces) {
		const ids = surface.gates.map(gate => gate.id);
		assert.ok(ids.includes("structural"), `${surface.id} has no structural gate`);
		assert.ok(ids.includes("live"), `${surface.id} has no end-to-end live gate`);
		assert.equal(new Set(ids).size, ids.length, `${surface.id} repeats a gate id`);
		for (const gate of surface.gates.filter(item => item.state === "available")) {
			assert.ok(gate.command.startsWith("node "), `${surface.id}/${gate.id} must be an explicit Node command`);
			assert.ok(gate.artifacts.length, `${surface.id}/${gate.id} has no artifacts`);
		}
	}
});

test("transaction forms keep the native lifecycle and both presentation modes in scope", () => {
	const manifest = readManifest();
	for (const id of ["sales-invoice", "purchase-invoice", "stock-entry", "payment-entry"]) {
		const surface = manifest.surfaces.find(item => item.id === id);
		assert.deepEqual(surface.modes, ["simple", "advanced"], id);
		for (const state of ["new", "draft", "submitted", "cancelled"]) {
			assert.ok(surface.lifecycle_states.includes(state), `${id} missing ${state}`);
		}
		for (const contract of ["form", "actions", "data-entry", "permissions", "reconciliation"]) {
			assert.ok(surface.required_contracts.includes(contract), `${id} missing ${contract}`);
		}
	}
});

test("validator rejects narrowed dimensions, missing contracts, false evidence and missing artifacts", () => {
	const manifest = clone(readManifest());
	manifest.personas.pop();
	manifest.coverage_profiles["full-bilingual-responsive"].languages = ["en"];
	manifest.surfaces[0].required_contracts = ["shell"];
	manifest.surfaces[0].gates[0].artifacts = ["tests/does-not-exist.test.cjs"];
	manifest.surfaces[0].gates[1].state = "planned";
	manifest.surfaces[0].gates[1].rationale = "Passed previously";
	delete manifest.surfaces[0].gates[1].command;
	delete manifest.surfaces[0].gates[1].artifacts;
	const result = validateManifest(manifest);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.startsWith("personas must be exactly")));
	assert.ok(result.errors.some(error => error.includes("full coverage profile must include en and ar")));
	assert.ok(result.errors.some(error => error.includes("required_contracts is missing states")));
	assert.ok(result.errors.some(error => error.includes("artifact does not exist")));
	assert.ok(result.errors.some(error => error.includes("must not contain a pass claim")));
});

test("validator rejects an orphaned work-order catalog", () => {
	const manifest = clone(readManifest());
	manifest.work_order_catalog = "docs/does-not-exist.md";
	delete manifest.detailed_work_orders;
	delete manifest.work_order_status;
	delete manifest.program_authority_map;
	delete manifest.saudi_market_research_synthesis;
	delete manifest.edition_promotion_gates;
	const result = validateManifest(manifest);
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("work_order_catalog must point to an existing repository file"));
	assert.ok(result.errors.includes("detailed_work_orders must point to an existing repository file"));
	assert.ok(result.errors.includes("work_order_status must point to an existing repository file"));
	assert.ok(result.errors.includes("program_authority_map must point to an existing repository file"));
	assert.ok(result.errors.includes("saudi_market_research_synthesis must point to an existing repository file"));
	assert.ok(result.errors.includes("edition_promotion_gates must point to an existing repository file"));
});
