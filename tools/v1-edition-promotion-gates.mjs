#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { REQUIRED_WORK_ORDERS } from "./v1-program-authority-map.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PROMOTION_GATES = resolve(ROOT, "quality", "v1-edition-promotion-gates.json");
export const REQUIRED_EDITIONS = Object.freeze(["start", "operate", "control", "connect"]);
export const REQUIRED_PREREQUISITES = Object.freeze({
	start: Object.freeze([]),
	operate: Object.freeze(["start"]),
	control: Object.freeze(["operate"]),
	connect: Object.freeze(["start"]),
});
export const REQUIRED_MODEL_INVARIANTS = Object.freeze([
	"same_native_documents_permissions_and_ledgers",
	"experience_change_cannot_fork_business_data",
	"experience_change_cannot_require_destructive_migration",
	"simple_mode_cannot_weaken_accounting_stock_tax_or_permission_authority",
	"promotion_requires_candidate_bound_execution_evidence",
	"add_on_requires_relevant_accepted_base_and_domain_dependencies",
]);

const duplicates = (values = []) => {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
};
const sameMembers = (actual = [], expected = []) =>
	actual.length === expected.length && expected.every(value => actual.includes(value));

export function readPromotionGates(path = DEFAULT_PROMOTION_GATES) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateEditionPromotionGates(gates, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (gates?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(gates?.disclaimer || "").toLowerCase();
	for (const phrase of ["planning promotion targets only", "not implementation evidence", "acceptance receipt", "compliance certification", "supported-scope statement", "release decision"]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}

	for (const field of ["authority", "market_evidence", "status_registry"]) {
		if (!gates?.[field] || (checkFiles && !existsSync(resolve(root, gates[field])))) {
			errors.push(`${field} must point to an existing repository file`);
		}
	}

	if (!sameMembers(gates?.product_model?.core_sequence || [], ["start", "operate", "control"])) {
		errors.push("product_model.core_sequence must be exactly: start, operate, control");
	}
	if (!sameMembers(gates?.product_model?.add_on_tracks || [], ["connect"])) {
		errors.push("product_model.add_on_tracks must be exactly: connect");
	}
	for (const invariant of REQUIRED_MODEL_INVARIANTS) {
		if (gates?.product_model?.[invariant] !== true) errors.push(`product_model.${invariant} must remain true`);
	}

	const editions = gates?.editions || [];
	const editionIds = editions.map(edition => edition.id);
	if (!sameMembers(editionIds, REQUIRED_EDITIONS)) errors.push(`editions must be exactly: ${REQUIRED_EDITIONS.join(", ")}`);
	for (const id of duplicates(editionIds)) errors.push(`editions repeats ${id}`);

	const introducedWorkOrders = [];
	for (const edition of editions) {
		const path = `editions.${edition.id || "<missing>"}`;
		if (edition.state !== "planning-target-only") errors.push(`${path}.state must remain planning-target-only`);
		if (!edition.name?.trim()) errors.push(`${path}.name must not be empty`);
		if (!edition.positioning?.trim()) errors.push(`${path}.positioning must not be empty`);
		if (!Array.isArray(edition.primary_users) || !edition.primary_users.length) errors.push(`${path}.primary_users must not be empty`);
		if (!sameMembers(edition.prerequisite_editions || [], REQUIRED_PREREQUISITES[edition.id] || [])) {
			errors.push(`${path}.prerequisite_editions must be exactly: ${(REQUIRED_PREREQUISITES[edition.id] || []).join(", ") || "none"}`);
		}
		if (!Array.isArray(edition.introduced_work_orders) || !edition.introduced_work_orders.length) {
			errors.push(`${path}.introduced_work_orders must not be empty`);
		}
		introducedWorkOrders.push(...(edition.introduced_work_orders || []));
		if (!Array.isArray(edition.promotion_evidence) || edition.promotion_evidence.length < 6) {
			errors.push(`${path}.promotion_evidence must contain at least six evidence groups`);
		}
		for (const evidence of edition.promotion_evidence || []) {
			if (!String(evidence).trim()) errors.push(`${path}.promotion_evidence cannot contain an empty entry`);
		}
	}

	if (!sameMembers(introducedWorkOrders, REQUIRED_WORK_ORDERS)) {
		errors.push(`editions must introduce exactly ${REQUIRED_WORK_ORDERS.length} work orders`);
	}
	for (const id of duplicates(introducedWorkOrders)) errors.push(`editions repeat work order ${id}`);
	for (const id of introducedWorkOrders.filter(id => !REQUIRED_WORK_ORDERS.includes(id))) {
		errors.push(`editions contain unknown work order ${id}`);
	}

	if (checkFiles && gates?.status_registry && existsSync(resolve(root, gates.status_registry))) {
		let status;
		try {
			status = JSON.parse(readFileSync(resolve(root, gates.status_registry), "utf8"));
		} catch (error) {
			errors.push(`status_registry must contain valid JSON: ${error.message}`);
		}
		if (status) {
			const statusIds = (status.groups || []).flatMap(group => group.ids || []);
			if (!sameMembers(statusIds, REQUIRED_WORK_ORDERS)) {
				errors.push(`status_registry must cover exactly the same ${REQUIRED_WORK_ORDERS.length} work orders`);
			}
		}
	}

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		editions: editions.length,
		workOrders: introducedWorkOrders.length,
		promotionEvidenceGroups: editions.reduce((sum, edition) => sum + (edition.promotion_evidence?.length || 0), 0),
	});
}

async function main() {
	const index = process.argv.indexOf("--gates");
	const path = resolve(index === -1 ? DEFAULT_PROMOTION_GATES : process.argv[index + 1]);
	const result = validateEditionPromotionGates(readPromotionGates(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 edition promotion gates: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning targets only — no implementation, compliance, supported-scope, acceptance, or release decision was evaluated.");
		console.log(`editions=${result.editions} work_orders=${result.workOrders} promotion_evidence_groups=${result.promotionEvidenceGroups}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(`Edition promotion gate check failed: ${error.message}`); process.exitCode = 2; });
