#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateFinanceCloseContract } from "./v1-finance-close-contract.mjs";
import { validateOnboardingMigrationContract } from "./v1-onboarding-migration-contract.mjs";
import { validatePdplContract } from "./v1-pdpl-contract.mjs";
import { validatePerformanceBudget } from "./v1-performance-gate.mjs";
import { validateSaudiPayrollContract } from "./v1-saudi-payroll-contract.mjs";
import { validateZatcaContract } from "./v1-zatca-contract.mjs";
import { validateCashBankPaymentContract } from "./v1-cash-bank-payment-contract.mjs";
import { validateProcurementInventoryContract } from "./v1-procurement-inventory-contract.mjs";
import { validatePosRetailContract } from "./v1-pos-retail-contract.mjs";
import { validateOrderToCashContract } from "./v1-order-to-cash-contract.mjs";
import { validateDecisionSupportContract } from "./v1-decision-support-contract.mjs";
import { validateIntegrationConnectorContract } from "./v1-integration-connector-contract.mjs";
import { validateProductionOperationsContract } from "./v1-production-operations-contract.mjs";
import { validateProgramAuthorityMap } from "./v1-program-authority-map.mjs";
import { validateEditionPromotionGates } from "./v1-edition-promotion-gates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MANIFEST = resolve(ROOT, "quality", "v1-acceptance-manifest.json");

export const REQUIRED_PERSONAS = Object.freeze([
	"cashier", "sales", "buyer", "warehouse", "accountant", "finance", "owner", "administrator",
]);
export const REQUIRED_SURFACES = Object.freeze([
	"canonical-shell", "role-home", "sales-invoice", "purchase-invoice", "stock-entry",
	"payment-entry", "customer", "item", "dense-core-list", "general-ledger-report", "point-of-sale",
]);
export const REQUIRED_SYSTEM_STATES = Object.freeze([
	"loading", "configured-empty", "setup-incomplete", "validation-error", "permission-denied",
	"recoverable-error", "conflict", "partial-success", "offline-delayed-integration", "integration-rejected",
]);
export const REQUIRED_CATALOG_WORK_ORDERS = Object.freeze([
	...Array.from({ length: 5 }, (_, index) => `FND-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `OTC-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 10 }, (_, index) => `FIN-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 7 }, (_, index) => `KSA-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `BI-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `HR-${String(index + 1).padStart(2, "0")}`),
]);
export const REQUIRED_DETAILED_WORK_ORDERS = Object.freeze([
	"WO-00", "WO-01",
	"WO-10", "WO-11", "WO-12", "WO-13", "WO-14", "WO-15",
	"WO-20", "WO-21", "WO-22", "WO-23",
	"WO-30", "WO-31",
]);
export const REQUIRED_ALL_WORK_ORDERS = Object.freeze([
	...REQUIRED_DETAILED_WORK_ORDERS,
	...REQUIRED_CATALOG_WORK_ORDERS,
]);

const FAMILY_CONTRACTS = Object.freeze({
	shell: ["shell", "states", "visual", "i18n", "accessibility", "permissions"],
	"role-home": ["shell", "actions", "states", "visual", "i18n", "accessibility", "permissions", "reconciliation"],
	"transaction-form": ["shell", "form", "actions", "data-entry", "states", "visual", "i18n", "accessibility", "permissions", "reconciliation"],
	"master-form": ["shell", "form", "actions", "states", "visual", "i18n", "accessibility", "permissions"],
	list: ["shell", "actions", "data-entry", "states", "visual", "i18n", "accessibility", "permissions", "reconciliation"],
	report: ["shell", "actions", "states", "visual", "i18n", "accessibility", "permissions", "reconciliation"],
	pos: ["shell", "form", "actions", "data-entry", "states", "visual", "i18n", "accessibility", "permissions", "reconciliation"],
});

function duplicates(values = []) {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

function sameMembers(actual = [], expected = []) {
	return actual.length === expected.length && expected.every(value => actual.includes(value));
}

function requireMembers(errors, actual, expected, path) {
	for (const value of expected) {
		if (!actual?.includes(value)) errors.push(`${path} is missing ${value}`);
	}
}

export function readManifest(path = DEFAULT_MANIFEST) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateManifest(manifest, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	let workOrders = 0;
	let workOrderStates = {};
	if (manifest?.schema_version !== 1) errors.push("schema_version must be 1");
	if (!String(manifest?.disclaimer || "").toLowerCase().includes("not a test receipt")) {
		errors.push("disclaimer must state that the manifest is not a test receipt");
	}
	if (checkFiles) for (const field of [
		"authority", "execution_ledger", "program_authority_map", "saudi_market_research_synthesis", "edition_promotion_gates", "role_matrix", "product_grammar", "terminology_governance", "user_research_protocol",
		"performance_reliability_slo", "performance_budget", "performance_receipt_template",
		"pdpl_operations_contract", "pdpl_control_register",
		"expert_finance_close_contract", "finance_close_control_register",
		"saudi_people_payroll_contract", "saudi_payroll_control_register",
		"onboarding_migration_contract", "onboarding_migration_control_register",
		"saudi_zatca_operations_contract", "zatca_control_register",
		"cash_bank_payment_reconciliation_contract", "cash_bank_payment_control_register",
		"procurement_inventory_operations_contract", "procurement_inventory_control_register",
		"pos_retail_operations_contract", "pos_retail_control_register",
		"order_to_cash_customer_operations_contract", "order_to_cash_control_register",
		"reporting_decision_support_contract", "decision_support_control_register",
		"integration_connector_operations_contract", "integration_connector_control_register",
		"production_operations_support_contract", "production_operations_control_register",
		"work_order_catalog", "detailed_work_orders", "work_order_status",
	]) {
		if (!manifest?.[field] || !existsSync(resolve(root, manifest[field]))) {
			errors.push(`${field} must point to an existing repository file`);
		}
	}
	if (checkFiles && manifest?.program_authority_map && existsSync(resolve(root, manifest.program_authority_map))) {
		let authorityMap;
		try {
			authorityMap = JSON.parse(readFileSync(resolve(root, manifest.program_authority_map), "utf8"));
		} catch (error) {
			errors.push(`program_authority_map must contain valid JSON: ${error.message}`);
		}
		if (authorityMap) {
			const result = validateProgramAuthorityMap(authorityMap, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`program_authority_map: ${error}`);
		}
	}
	if (checkFiles && manifest?.edition_promotion_gates && existsSync(resolve(root, manifest.edition_promotion_gates))) {
		let promotionGates;
		try {
			promotionGates = JSON.parse(readFileSync(resolve(root, manifest.edition_promotion_gates), "utf8"));
		} catch (error) {
			errors.push(`edition_promotion_gates must contain valid JSON: ${error.message}`);
		}
		if (promotionGates) {
			const result = validateEditionPromotionGates(promotionGates, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`edition_promotion_gates: ${error}`);
		}
	}
	if (checkFiles && manifest?.performance_budget && existsSync(resolve(root, manifest.performance_budget))) {
		let budget;
		try {
			budget = JSON.parse(readFileSync(resolve(root, manifest.performance_budget), "utf8"));
		} catch (error) {
			errors.push(`performance_budget must contain valid JSON: ${error.message}`);
		}
		if (budget) {
			const result = validatePerformanceBudget(budget, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`performance_budget: ${error}`);
		}
	}
	if (checkFiles && manifest?.performance_receipt_template && existsSync(resolve(root, manifest.performance_receipt_template))) {
		let template;
		try {
			template = JSON.parse(readFileSync(resolve(root, manifest.performance_receipt_template), "utf8"));
		} catch (error) {
			errors.push(`performance_receipt_template must contain valid JSON: ${error.message}`);
		}
		if (template) {
			if (template.schema_version !== 1) errors.push("performance_receipt_template.schema_version must be 1");
			if (!String(template.disclaimer || "").toLowerCase().includes("not a benchmark receipt")) {
				errors.push("performance_receipt_template must state that it is not a benchmark receipt");
			}
			if (!Array.isArray(template.profile_results) || template.profile_results.length) {
				errors.push("performance_receipt_template must remain empty and cannot contain claimed profile results");
			}
		}
	}
	if (checkFiles && manifest?.pdpl_control_register && existsSync(resolve(root, manifest.pdpl_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.pdpl_control_register), "utf8"));
		} catch (error) {
			errors.push(`pdpl_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validatePdplContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`pdpl_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.finance_close_control_register && existsSync(resolve(root, manifest.finance_close_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.finance_close_control_register), "utf8"));
		} catch (error) {
			errors.push(`finance_close_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateFinanceCloseContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`finance_close_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.saudi_payroll_control_register && existsSync(resolve(root, manifest.saudi_payroll_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.saudi_payroll_control_register), "utf8"));
		} catch (error) {
			errors.push(`saudi_payroll_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateSaudiPayrollContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`saudi_payroll_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.onboarding_migration_control_register && existsSync(resolve(root, manifest.onboarding_migration_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.onboarding_migration_control_register), "utf8"));
		} catch (error) {
			errors.push(`onboarding_migration_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateOnboardingMigrationContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`onboarding_migration_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.zatca_control_register && existsSync(resolve(root, manifest.zatca_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.zatca_control_register), "utf8"));
		} catch (error) {
			errors.push(`zatca_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateZatcaContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`zatca_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.cash_bank_payment_control_register && existsSync(resolve(root, manifest.cash_bank_payment_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.cash_bank_payment_control_register), "utf8"));
		} catch (error) {
			errors.push(`cash_bank_payment_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateCashBankPaymentContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`cash_bank_payment_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.procurement_inventory_control_register && existsSync(resolve(root, manifest.procurement_inventory_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.procurement_inventory_control_register), "utf8"));
		} catch (error) {
			errors.push(`procurement_inventory_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateProcurementInventoryContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`procurement_inventory_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.pos_retail_control_register && existsSync(resolve(root, manifest.pos_retail_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.pos_retail_control_register), "utf8"));
		} catch (error) {
			errors.push(`pos_retail_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validatePosRetailContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`pos_retail_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.order_to_cash_control_register && existsSync(resolve(root, manifest.order_to_cash_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.order_to_cash_control_register), "utf8"));
		} catch (error) {
			errors.push(`order_to_cash_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateOrderToCashContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`order_to_cash_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.decision_support_control_register && existsSync(resolve(root, manifest.decision_support_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.decision_support_control_register), "utf8"));
		} catch (error) {
			errors.push(`decision_support_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateDecisionSupportContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`decision_support_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.integration_connector_control_register && existsSync(resolve(root, manifest.integration_connector_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.integration_connector_control_register), "utf8"));
		} catch (error) {
			errors.push(`integration_connector_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateIntegrationConnectorContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`integration_connector_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.production_operations_control_register && existsSync(resolve(root, manifest.production_operations_control_register))) {
		let register;
		try {
			register = JSON.parse(readFileSync(resolve(root, manifest.production_operations_control_register), "utf8"));
		} catch (error) {
			errors.push(`production_operations_control_register must contain valid JSON: ${error.message}`);
		}
		if (register) {
			const result = validateProductionOperationsContract(register, { root, checkFiles: true });
			for (const error of result.errors) errors.push(`production_operations_control_register: ${error}`);
		}
	}
	if (checkFiles && manifest?.work_order_catalog && existsSync(resolve(root, manifest.work_order_catalog))) {
		const catalog = readFileSync(resolve(root, manifest.work_order_catalog), "utf8");
		for (const id of REQUIRED_CATALOG_WORK_ORDERS) {
			if (!new RegExp(`\\|\\s*${id.replace("-", "\\-")}\\s*\\|`).test(catalog)) {
				errors.push(`work_order_catalog is missing a bounded row for ${id}`);
			}
		}
	}
	if (checkFiles && manifest?.detailed_work_orders && existsSync(resolve(root, manifest.detailed_work_orders))) {
		const detailed = readFileSync(resolve(root, manifest.detailed_work_orders), "utf8");
		for (const id of REQUIRED_DETAILED_WORK_ORDERS) {
			if (!new RegExp(`^###\\s+${id.replace("-", "\\-")}\\b`, "m").test(detailed)) {
				errors.push(`detailed_work_orders is missing a bounded section for ${id}`);
			}
		}
	}
	if (checkFiles && manifest?.work_order_status && existsSync(resolve(root, manifest.work_order_status))) {
		let status;
		try {
			status = JSON.parse(readFileSync(resolve(root, manifest.work_order_status), "utf8"));
		} catch (error) {
			errors.push(`work_order_status must contain valid JSON: ${error.message}`);
		}
		if (status) {
			if (status.schema_version !== 1) errors.push("work_order_status.schema_version must be 1");
			if (!String(status.disclaimer || "").toLowerCase().includes("not a test receipt")) {
				errors.push("work_order_status disclaimer must state that it is not a test receipt");
			}
			const statusIds = (status.groups || []).flatMap(group => group.ids || []);
			workOrders = statusIds.length;
			workOrderStates = (status.groups || []).reduce((counts, group) => {
				counts[group.state] = (counts[group.state] || 0) + (group.ids || []).length;
				return counts;
			}, {});
			if (!sameMembers(statusIds, REQUIRED_ALL_WORK_ORDERS)) {
				errors.push(`work_order_status must cover exactly ${REQUIRED_ALL_WORK_ORDERS.length} work orders`);
			}
			for (const id of duplicates(statusIds)) errors.push(`work_order_status repeats ${id}`);
			for (const group of status.groups || []) {
				if (!group.ids?.length) errors.push("work_order_status group must contain ids");
				if (!["verified", "implemented-acceptance-incomplete", "planned", "external-gate", "blocked"].includes(group.state)) {
					errors.push(`work_order_status group has unsupported state ${group.state}`);
				}
				if (!group.evidence?.trim()) errors.push(`work_order_status ${group.ids?.join(", ") || "group"} needs evidence`);
				if (!group.next_gate?.trim()) errors.push(`work_order_status ${group.ids?.join(", ") || "group"} needs a next_gate`);
			}
		}
	}

	if (!sameMembers(manifest?.personas, REQUIRED_PERSONAS)) {
		errors.push(`personas must be exactly: ${REQUIRED_PERSONAS.join(", ")}`);
	}
	for (const value of duplicates(manifest?.personas)) errors.push(`duplicate persona: ${value}`);

	const languageMap = new Map((manifest?.dimensions?.languages || []).map(item => [item.id, item.direction]));
	if (languageMap.get("en") !== "ltr") errors.push("dimensions.languages must map en to ltr");
	if (languageMap.get("ar") !== "rtl") errors.push("dimensions.languages must map ar to rtl");
	if (!sameMembers(manifest?.dimensions?.themes, ["light", "dark"])) {
		errors.push("dimensions.themes must be exactly light and dark");
	}
	const viewports = manifest?.dimensions?.viewports || [];
	const viewportIds = viewports.map(item => item.id);
	requireMembers(errors, viewportIds, ["desktop", "tablet", "compact", "phone"], "dimensions.viewports");
	if (!viewports.some(item => item.width >= 1440)) errors.push("dimensions.viewports needs a desktop width >= 1440");
	if (!viewports.some(item => item.width <= 430)) errors.push("dimensions.viewports needs a phone width <= 430");
	requireMembers(errors, manifest?.dimensions?.system_states, REQUIRED_SYSTEM_STATES, "dimensions.system_states");

	const contracts = manifest?.contracts || {};
	for (const id of new Set(Object.values(FAMILY_CONTRACTS).flat())) {
		if (!Array.isArray(contracts[id]) || !contracts[id].length || contracts[id].some(rule => !String(rule).trim())) {
			errors.push(`contracts.${id} must contain non-empty rules`);
		}
	}

	const profile = manifest?.coverage_profiles?.["full-bilingual-responsive"];
	if (!profile) errors.push("coverage_profiles.full-bilingual-responsive is required");
	else {
		if (!sameMembers(profile.languages, ["en", "ar"])) errors.push("full coverage profile must include en and ar");
		requireMembers(errors, profile.viewports, ["desktop", "tablet", "compact", "phone"], "full coverage profile viewports");
		if (!sameMembers(profile.themes, ["light", "dark"])) errors.push("full coverage profile must include light and dark");
	}

	const surfaces = manifest?.surfaces || [];
	const ids = surfaces.map(surface => surface.id);
	requireMembers(errors, ids, REQUIRED_SURFACES, "surfaces");
	for (const value of duplicates(ids)) errors.push(`duplicate surface: ${value}`);
	const representedPersonas = new Set();
	let availableGates = 0;
	let plannedGates = 0;
	let targetCombinations = 0;

	for (const surface of surfaces) {
		const path = `surfaces.${surface.id || "<missing>"}`;
		if (!FAMILY_CONTRACTS[surface.family]) errors.push(`${path}.family is unsupported: ${surface.family}`);
		if (!surface.route?.type || !(surface.route.name || surface.route.doctype)) errors.push(`${path}.route is incomplete`);
		if (!surface.personas?.length) errors.push(`${path}.personas must not be empty`);
		for (const persona of surface.personas || []) {
			representedPersonas.add(persona);
			if (!REQUIRED_PERSONAS.includes(persona)) errors.push(`${path}.personas contains unknown persona ${persona}`);
		}
		if (surface.coverage_profile !== "full-bilingual-responsive") errors.push(`${path} must use full-bilingual-responsive`);
		if (!surface.lifecycle_states?.length) errors.push(`${path}.lifecycle_states must not be empty`);
		requireMembers(errors, surface.required_contracts, FAMILY_CONTRACTS[surface.family] || [], `${path}.required_contracts`);
		if (!surface.gates?.length) errors.push(`${path}.gates must not be empty`);
		const gateIds = (surface.gates || []).map(gate => gate.id);
		requireMembers(errors, gateIds, ["structural", "live"], `${path}.gates`);
		for (const gate of surface.gates || []) {
			const gatePath = `${path}.gates.${gate.id || "<missing>"}`;
			if (gate.state === "available") {
				availableGates += 1;
				if (!gate.command?.trim()) errors.push(`${gatePath} available gate needs a command`);
				if (!gate.artifacts?.length) errors.push(`${gatePath} available gate needs artifacts`);
				if (checkFiles) for (const artifact of gate.artifacts || []) {
					if (!existsSync(resolve(root, artifact))) errors.push(`${gatePath} artifact does not exist: ${artifact}`);
				}
			} else if (gate.state === "planned") {
				plannedGates += 1;
				if (!gate.rationale?.trim()) errors.push(`${gatePath} planned gate needs a rationale`);
				if (gate.command || gate.artifacts) errors.push(`${gatePath} planned gate must not imply runnable evidence`);
			} else {
				errors.push(`${gatePath}.state must be available or planned`);
			}
			if (/\bpass(ed)?\b/i.test(JSON.stringify(gate))) errors.push(`${gatePath} must not contain a pass claim`);
		}
		if (profile) targetCombinations += profile.languages.length * profile.viewports.length * profile.themes.length * (surface.lifecycle_states?.length || 0);
	}
	for (const persona of REQUIRED_PERSONAS) {
		if (!representedPersonas.has(persona)) errors.push(`no surface represents persona ${persona}`);
	}

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		surfaces: surfaces.length,
		availableGates,
		plannedGates,
		targetCombinations,
		workOrders,
		workOrderStates: Object.freeze({ ...workOrderStates }),
	});
}

function main() {
	const path = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_MANIFEST;
	const result = validateManifest(readManifest(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify({ manifest: path, ...result }, null, 2));
	else {
		console.log(`V1 acceptance manifest: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Declaration only — this is not execution evidence.");
		console.log(`surfaces=${result.surfaces} target_combinations=${result.targetCombinations} available_gates=${result.availableGates} planned_gates=${result.plannedGates}`);
		console.log(`work_orders=${result.workOrders} implemented_acceptance_incomplete=${result.workOrderStates["implemented-acceptance-incomplete"] || 0} planned=${result.workOrderStates.planned || 0}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	if (!result.valid) process.exitCode = 1;
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
