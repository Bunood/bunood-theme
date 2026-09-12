import assert from "node:assert/strict";
import test from "node:test";
import {
	RunOwnedUserFixtures,
	buildCleanupScript,
	makeRoleHomeFixtureUsers,
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
