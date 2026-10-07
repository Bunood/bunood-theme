import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	REQUIRED_AUTHORITY_GROUPS,
	REQUIRED_WORK_ORDERS,
	readAuthorityMap,
	validateProgramAuthorityMap,
} from "../tools/v1-program-authority-map.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("program authority map gives all 51 work orders one planning owner without acceptance claims", () => {
	const authorityMap = readAuthorityMap();
	const result = validateProgramAuthorityMap(authorityMap);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.groups, REQUIRED_AUTHORITY_GROUPS.length);
	assert.equal(result.workOrders, REQUIRED_WORK_ORDERS.length);
	assert.match(authorityMap.disclaimer, /planning authority map only/i);
	assert.match(authorityMap.disclaimer, /not implementation evidence/i);
	assert.match(authorityMap.disclaimer, /acceptance receipt/i);
	assert.match(authorityMap.disclaimer, /release decision/i);
});

test("each work order is mapped exactly once and every authority target exists", () => {
	const authorityMap = readAuthorityMap();
	const ids = authorityMap.authority_groups.flatMap(group => group.work_orders);
	assert.deepEqual([...ids].sort(), [...REQUIRED_WORK_ORDERS].sort());
	assert.equal(new Set(ids).size, ids.length);
	for (const group of authorityMap.authority_groups) {
		assert.equal(group.state, "planning-authority-only", group.id);
		assert.ok(group.authority_docs.length, group.id);
		assert.ok(group.machine_targets.length, group.id);
	}
});

test("primary authorities are consolidated V1 documents rather than superseded audit notes", () => {
	const authorityMap = readAuthorityMap();
	for (const group of authorityMap.authority_groups) {
		for (const document of group.authority_docs) {
			assert.match(document, /^docs\/BUNOOD-V1-/, `${group.id}: ${document}`);
			assert.doesNotMatch(document, /AUDIT|MVP/i, `${group.id}: ${document}`);
		}
	}
});

test("validator rejects missing duplicate unknown unowned or promoted authority", () => {
	const authorityMap = clone(readAuthorityMap());
	authorityMap.authority_groups[0].work_orders.pop();
	authorityMap.authority_groups[0].work_orders.push("NOT-A-WORK-ORDER");
	authorityMap.authority_groups[1].work_orders.push(authorityMap.authority_groups[1].work_orders[0]);
	authorityMap.authority_groups[2].state = "verified";
	authorityMap.authority_groups[3].machine_targets = [];
	const result = validateProgramAuthorityMap(authorityMap, { checkFiles: false });
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.includes("cover exactly 51 work orders")));
	assert.ok(result.errors.some(error => error.includes("repeats work order")));
	assert.ok(result.errors.some(error => error.includes("unknown work order")));
	assert.ok(result.errors.some(error => error.includes("must remain planning-authority-only")));
	assert.ok(result.errors.some(error => error.includes("machine_targets must not be empty")));
});

test("authority map fails when the independent status registry loses a work order", () => {
	const root = mkdtempSync(join(tmpdir(), "bunood-v1-authority-"));
	try {
		const authorityMap = clone(readAuthorityMap());
		const status = JSON.parse(readFileSync(new URL("../quality/v1-work-order-status.json", import.meta.url), "utf8"));
		status.groups[0].ids.pop();
		mkdirSync(join(root, "quality"), { recursive: true });
		writeFileSync(join(root, "quality", "v1-work-order-status.json"), JSON.stringify(status));
		const result = validateProgramAuthorityMap(authorityMap, { root, checkFiles: true });
		assert.equal(result.valid, false);
		assert.ok(result.errors.includes("status_registry must cover exactly the same 51 work orders"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
