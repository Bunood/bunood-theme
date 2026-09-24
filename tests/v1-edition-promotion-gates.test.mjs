import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { REQUIRED_WORK_ORDERS } from "../tools/v1-program-authority-map.mjs";
import {
	REQUIRED_EDITIONS,
	REQUIRED_MODEL_INVARIANTS,
	readPromotionGates,
	validateEditionPromotionGates,
} from "../tools/v1-edition-promotion-gates.mjs";

const clone = value => JSON.parse(JSON.stringify(value));

test("Start Operate Control and Connect are complete planning targets without promotion claims", () => {
	const gates = readPromotionGates();
	const result = validateEditionPromotionGates(gates);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.equal(result.editions, REQUIRED_EDITIONS.length);
	assert.equal(result.workOrders, REQUIRED_WORK_ORDERS.length);
	assert.equal(result.promotionEvidenceGroups, 24);
	assert.match(gates.disclaimer, /not implementation evidence/i);
	assert.match(gates.disclaimer, /release decision/i);
});

test("every work order enters one edition and core versus add-on sequencing stays explicit", () => {
	const gates = readPromotionGates();
	const ids = gates.editions.flatMap(edition => edition.introduced_work_orders);
	assert.deepEqual([...ids].sort(), [...REQUIRED_WORK_ORDERS].sort());
	assert.equal(new Set(ids).size, ids.length);
	assert.deepEqual(gates.product_model.core_sequence, ["start", "operate", "control"]);
	assert.deepEqual(gates.product_model.add_on_tracks, ["connect"]);
	assert.deepEqual(gates.editions.find(edition => edition.id === "connect").prerequisite_editions, ["start"]);
});

test("edition changes preserve native truth and require candidate-bound evidence", () => {
	const gates = readPromotionGates();
	for (const invariant of REQUIRED_MODEL_INVARIANTS) assert.equal(gates.product_model[invariant], true, invariant);
	for (const edition of gates.editions) {
		assert.equal(edition.state, "planning-target-only", edition.id);
		assert.ok(edition.primary_users.length, edition.id);
		assert.ok(edition.promotion_evidence.length >= 6, edition.id);
	}
});

test("validator rejects weakened model sequencing duplicate scope and false promotion", () => {
	const gates = clone(readPromotionGates());
	gates.product_model.same_native_documents_permissions_and_ledgers = false;
	gates.product_model.core_sequence = ["start", "control"];
	gates.editions[0].introduced_work_orders.push(gates.editions[0].introduced_work_orders[0]);
	gates.editions[1].prerequisite_editions = [];
	gates.editions[2].promotion_evidence.pop();
	gates.editions[3].state = "accepted";
	const result = validateEditionPromotionGates(gates, { checkFiles: false });
	assert.equal(result.valid, false);
	assert.ok(result.errors.includes("product_model.same_native_documents_permissions_and_ledgers must remain true"));
	assert.ok(result.errors.includes("product_model.core_sequence must be exactly: start, operate, control"));
	assert.ok(result.errors.some(error => error.includes("repeat work order")));
	assert.ok(result.errors.some(error => error.includes("prerequisite_editions must be exactly")));
	assert.ok(result.errors.some(error => error.includes("promotion_evidence must contain at least six")));
	assert.ok(result.errors.some(error => error.includes("state must remain planning-target-only")));
});

test("edition gates fail when the independent status registry loses scope", () => {
	const root = mkdtempSync(join(tmpdir(), "bunood-v1-editions-"));
	try {
		const gates = clone(readPromotionGates());
		const status = JSON.parse(readFileSync(new URL("../quality/v1-work-order-status.json", import.meta.url), "utf8"));
		status.groups[0].ids.pop();
		mkdirSync(join(root, "quality"), { recursive: true });
		writeFileSync(join(root, "quality", "v1-work-order-status.json"), JSON.stringify(status));
		const result = validateEditionPromotionGates(gates, { root, checkFiles: true });
		assert.equal(result.valid, false);
		assert.ok(result.errors.includes("status_registry must cover exactly the same 51 work orders"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
