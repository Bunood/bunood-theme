#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_AUTHORITY_MAP = resolve(ROOT, "quality", "v1-program-authority-map.json");

export const REQUIRED_WORK_ORDERS = Object.freeze([
	"WO-00", "WO-01",
	"WO-10", "WO-11", "WO-12", "WO-13", "WO-14", "WO-15",
	"WO-20", "WO-21", "WO-22", "WO-23", "WO-30", "WO-31",
	...Array.from({ length: 5 }, (_, index) => `FND-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `OTC-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 10 }, (_, index) => `FIN-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 7 }, (_, index) => `KSA-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `BI-${String(index + 1).padStart(2, "0")}`),
	...Array.from({ length: 5 }, (_, index) => `HR-${String(index + 1).padStart(2, "0")}`),
]);

export const REQUIRED_AUTHORITY_GROUPS = Object.freeze([
	"production-release-and-reliability",
	"universal-experience-foundation",
	"guided-onboarding-and-migration",
	"daily-receivables-and-payments",
	"bank-reconciliation",
	"owner-dashboard",
	"procurement-and-inventory",
	"point-of-sale",
	"integrations-and-connectors",
	"order-to-cash",
	"expert-finance-and-close",
	"saudi-vat-and-zatca",
	"saudi-privacy-and-compliance-evidence",
	"reporting-and-decision-support",
	"saudi-people-and-payroll",
]);

const duplicates = (values = []) => {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
};
const sameMembers = (actual = [], expected = []) =>
	actual.length === expected.length && expected.every(value => actual.includes(value));

export function readAuthorityMap(path = DEFAULT_AUTHORITY_MAP) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validateProgramAuthorityMap(authorityMap, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (authorityMap?.schema_version !== 1) errors.push("schema_version must be 1");
	const disclaimer = String(authorityMap?.disclaimer || "").toLowerCase();
	for (const phrase of ["planning authority map only", "not implementation evidence", "acceptance receipt", "release decision"]) {
		if (!disclaimer.includes(phrase)) errors.push(`disclaimer must include ${phrase}`);
	}

	for (const field of ["authority", "execution_ledger", "status_registry"]) {
		if (!authorityMap?.[field] || (checkFiles && !existsSync(resolve(root, authorityMap[field])))) {
			errors.push(`${field} must point to an existing repository file`);
		}
	}

	const groups = authorityMap?.authority_groups || [];
	const groupIds = groups.map(group => group.id);
	if (!sameMembers(groupIds, REQUIRED_AUTHORITY_GROUPS)) {
		errors.push(`authority_groups must be exactly: ${REQUIRED_AUTHORITY_GROUPS.join(", ")}`);
	}
	for (const id of duplicates(groupIds)) errors.push(`authority_groups repeats ${id}`);

	const mappedWorkOrders = [];
	const authorityDocs = [];
	const machineTargets = [];
	for (const group of groups) {
		const path = `authority_groups.${group.id || "<missing>"}`;
		if (group.state !== "planning-authority-only") {
			errors.push(`${path}.state must remain planning-authority-only`);
		}
		if (!Array.isArray(group.work_orders) || !group.work_orders.length) errors.push(`${path}.work_orders must not be empty`);
		if (!Array.isArray(group.authority_docs) || !group.authority_docs.length) errors.push(`${path}.authority_docs must not be empty`);
		if (!Array.isArray(group.machine_targets) || !group.machine_targets.length) errors.push(`${path}.machine_targets must not be empty`);
		mappedWorkOrders.push(...(group.work_orders || []));
		authorityDocs.push(...(group.authority_docs || []));
		machineTargets.push(...(group.machine_targets || []));
		if (checkFiles) {
			for (const file of [...(group.authority_docs || []), ...(group.machine_targets || [])]) {
				if (!file || !existsSync(resolve(root, file))) errors.push(`${path} points to missing repository file ${file || "<empty>"}`);
			}
		}
	}

	if (!sameMembers(mappedWorkOrders, REQUIRED_WORK_ORDERS)) {
		errors.push(`authority_groups must cover exactly ${REQUIRED_WORK_ORDERS.length} work orders`);
	}
	for (const id of duplicates(mappedWorkOrders)) errors.push(`authority_groups repeats work order ${id}`);
	for (const id of mappedWorkOrders.filter(id => !REQUIRED_WORK_ORDERS.includes(id))) {
		errors.push(`authority_groups contains unknown work order ${id}`);
	}

	if (checkFiles && authorityMap?.status_registry && existsSync(resolve(root, authorityMap.status_registry))) {
		let status;
		try {
			status = JSON.parse(readFileSync(resolve(root, authorityMap.status_registry), "utf8"));
		} catch (error) {
			errors.push(`status_registry must contain valid JSON: ${error.message}`);
		}
		if (status) {
			const statusIds = (status.groups || []).flatMap(group => group.ids || []);
			if (!sameMembers(statusIds, REQUIRED_WORK_ORDERS)) {
				errors.push(`status_registry must cover exactly the same ${REQUIRED_WORK_ORDERS.length} work orders`);
			}
			for (const id of duplicates(statusIds)) errors.push(`status_registry repeats work order ${id}`);
		}
	}

	return Object.freeze({
		valid: errors.length === 0,
		errors: Object.freeze(errors),
		groups: groups.length,
		workOrders: mappedWorkOrders.length,
		authorityDocuments: new Set(authorityDocs).size,
		machineTargets: new Set(machineTargets).size,
	});
}

async function main() {
	const index = process.argv.indexOf("--map");
	const path = resolve(index === -1 ? DEFAULT_AUTHORITY_MAP : process.argv[index + 1]);
	const result = validateProgramAuthorityMap(readAuthorityMap(path));
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 program authority map: ${result.valid ? "VALID" : "INVALID"}`);
		console.log("Planning authority only — this is not implementation evidence, an acceptance receipt, or a release decision.");
		console.log(`groups=${result.groups} work_orders=${result.workOrders} authority_documents=${result.authorityDocuments} machine_targets=${result.machineTargets}`);
		for (const error of result.errors) console.error(`- ${error}`);
	}
	process.exitCode = result.valid ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(`Program authority map check failed: ${error.message}`); process.exitCode = 2; });
