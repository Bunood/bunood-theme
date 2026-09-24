import assert from "node:assert/strict";
import test from "node:test";
import {
	RunOwnedUserFixtures,
	buildCleanupScript,
	makeRoleHomeFixtureUsers,
	makeV1RoleFixtureUsers,
} from "../tools/run-owned-users.mjs";

test("role-home fixture identities are unique to each run", () => {
	const first = makeRoleHomeFixtureUsers();
	const second = makeRoleHomeFixtureUsers();
	assert.notEqual(first.runId, second.runId);
	assert.notEqual(first.erp.email, second.erp.email);
	assert.notEqual(first.realEstate.email, second.realEstate.email);
	assert.match(first.erp.email, new RegExp(first.runId));
	assert.equal(first.erp.lastName, first.realEstate.lastName);
});

test("V1 operational fixtures use one least-privilege role basis per job", () => {
	const users = makeV1RoleFixtureUsers("v1-role-matrix-01");
	assert.deepEqual(Object.keys(users), ["runId", "cashier", "sales", "buyer", "warehouse", "accountant", "finance", "owner"]);
	assert.deepEqual(users.cashier.roles, ["Bunood Cashier", "Bunood POS Operator"]);
	assert.deepEqual(users.sales.roles, ["Sales User"]);
	assert.deepEqual(users.buyer.roles, ["Purchase User"]);
	assert.deepEqual(users.warehouse.roles, ["Stock User"]);
	assert.deepEqual(users.accountant.roles, ["Accounts User"]);
	assert.deepEqual(users.finance.roles, ["Accounts Manager", "Accounts User"]);
	assert.deepEqual(users.owner.roles, ["Bunood Owner"]);
	assert.equal(new Set(Object.values(users).filter(value => value?.email).map(value => value.email)).size, 7);
	for (const spec of Object.values(users).filter(value => value?.email)) assert.equal(spec.requireRoles, true);
});

test("V1 fixture preflight checks every run-owned identity before creating any", () => {
	const users = makeV1RoleFixtureUsers("v1-role-matrix-02"), calls = [];
	const fixtures = new RunOwnedUserFixtures(script => { calls.push(script); return "ok"; }, users);
	fixtures.preflight();
	assert.equal(calls.length, 1);
	for (const spec of Object.values(users).filter(value => value?.email)) assert.match(calls[0], new RegExp(spec.email));
	assert.match(calls[0], /Missing required V1 fixture roles/);
	assert.equal(fixtures.attempted.size, 0);
});

test("preflight refuses existing identities before any create is attempted", () => {
	const calls = [];
	const fixtures = new RunOwnedUserFixtures(script => {
		calls.push(script);
		if (script.includes("collisions =")) throw new Error("fixture collision");
	});
	assert.throws(() => fixtures.preflight(), /fixture collision/);
	assert.equal(fixtures.attempted.size, 0);
	assert.equal(fixtures.created.size, 0);
	assert.equal(calls.length, 1);
	assert.match(calls[0], /Refusing role-home fixture collision/);
});

test("successful creates are recorded immediately and cleanup is idempotent", () => {
	const calls = [];
	const fixtures = new RunOwnedUserFixtures(script => {
		calls.push(script);
		return "ok";
	}, makeRoleHomeFixtureUsers("repeatable-run-01"));
	fixtures.preflight();
	fixtures.create(fixtures.users.erp);
	assert.deepEqual([...fixtures.created], [fixtures.users.erp.email]);
	fixtures.cleanup();
	fixtures.cleanup();
	const cleanupCalls = calls.filter(script => script.includes("skipped_not_owned"));
	assert.equal(cleanupCalls.length, 2);
	assert.equal(cleanupCalls[0], cleanupCalls[1]);
});

test("partial setup attempts remain cleanup candidates without claiming success", () => {
	const calls = [];
	const fixtures = new RunOwnedUserFixtures(script => {
		calls.push(script);
		if (script.includes(fixtures.users.realEstate.email) && script.includes("user.insert")) {
			throw new Error("simulated transport failure after an uncertain create");
		}
		return "ok";
	}, makeRoleHomeFixtureUsers("partial-run-001"));
	fixtures.preflight();
	fixtures.create(fixtures.users.erp);
	assert.throws(() => fixtures.create(fixtures.users.realEstate), /transport failure/);
	assert.deepEqual([...fixtures.created], [fixtures.users.erp.email]);
	fixtures.cleanup();
	const cleanup = calls.at(-1);
	assert.match(cleanup, new RegExp(fixtures.users.erp.email));
	assert.match(cleanup, new RegExp(fixtures.users.realEstate.email));
});

test("cleanup deletes only records bearing the exact run ownership marker", () => {
	const users = makeRoleHomeFixtureUsers("ownership-run-01");
	const script = buildCleanupScript([users.erp, users.realEstate]);
	assert.match(script, /existing\.first_name == spec\['firstName'\]/);
	assert.match(script, /existing\.last_name == spec\['lastName'\]/);
	assert.match(script, /existing\.user_type == 'System User'/);
	assert.match(script, /if not owned:\n\s+skipped\.append/);
	assert.match(script, /frappe\.delete_doc\('User', spec\['email'\]/);
	assert.ok(script.indexOf("if not owned:") < script.indexOf("frappe.delete_doc"));
});
