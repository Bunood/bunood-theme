import assert from "node:assert/strict";
import test from "node:test";

import {
	assertPOSRoleSnapshot,
	buildPermissionSnapshotScript,
	POS_ROLE_CONTRACT,
} from "../tools/pos-role-permission-acceptance.mjs";

function passingSnapshot() {
	const rights = new Set([
		...Object.values(POS_ROLE_CONTRACT.required).flat(),
		...Object.values(POS_ROLE_CONTRACT.forbidden).flat(),
		"read", "write", "create", "submit",
	]);
	const permissions = {};
	for (const doctype of [
		...Object.keys(POS_ROLE_CONTRACT.required),
		...Object.keys(POS_ROLE_CONTRACT.forbidden),
		"Sales Invoice",
	]) permissions[doctype] = Object.fromEntries([...rights].map(right => [right, false]));
	for (const [doctype, required] of Object.entries(POS_ROLE_CONTRACT.required)) {
		for (const right of required) permissions[doctype][right] = true;
	}
	for (const right of ["read", "write", "create", "submit", "print"]) permissions["Sales Invoice"][right] = true;
	const role_permissions = {};
	for (const [doctype, values] of Object.entries(permissions)) {
		const ownerScoped = POS_ROLE_CONTRACT.ownerScopedDoctypes.includes(doctype);
		role_permissions[doctype] = {
			owner: { has_if_owner: ownerScoped, effective: { ...values } },
			non_owner: { has_if_owner: ownerScoped, effective: { ...values } },
		};
		if (ownerScoped) {
			for (const right of ["write", "delete", "submit", "print"]) {
				role_permissions[doctype].non_owner.effective[right] = false;
			}
		}
	}
	return {
		roles: ["All", "Desk User", ...POS_ROLE_CONTRACT.requiredRoles],
		invoice_type: "Sales Invoice",
		permissions,
		role_permissions,
	};
}

test("cashier authority contract is narrow and contains no manager shortcut", () => {
	assert.deepEqual(POS_ROLE_CONTRACT.required["POS Profile"], ["select", "read"]);
	assert.deepEqual(POS_ROLE_CONTRACT.required["POS Opening Entry"], ["select", "read", "write", "create", "submit"]);
	assert.ok(POS_ROLE_CONTRACT.forbidden["POS Opening Entry"].includes("cancel"));
	assert.ok(POS_ROLE_CONTRACT.forbiddenRoles.includes("Sales Manager"));
	assert.ok(POS_ROLE_CONTRACT.forbiddenRoles.includes("Accounts User"));
	assert.ok(POS_ROLE_CONTRACT.forbiddenRoles.includes("Stock User"));
	assert.deepEqual(POS_ROLE_CONTRACT.required.Customer, ["select", "read"]);
	assert.ok(POS_ROLE_CONTRACT.ownerScopedDoctypes.includes("Sales Invoice"));
});

test("permission snapshot uses effective server permission checks", () => {
	const script = buildPermissionSnapshotScript("cashier@example.com");
	assert.match(script, /frappe\.has_permission\(dt, right, user=user\)/);
	assert.match(script, /frappe\.get_roles\(user\)/);
	assert.match(script, /POS Settings/);
	assert.match(script, /get_role_permissions/);
	assert.match(script, /has_if_owner_enabled/);
});

test("passing snapshot accepts POS lifecycle and configured invoice rights", () => {
	assert.equal(assertPOSRoleSnapshot(passingSnapshot()), true);
});

test("manager inheritance and dangerous POS rights fail with evidence", () => {
	const manager = passingSnapshot();
	manager.roles.push("Sales Manager");
	assert.throws(() => assertPOSRoleSnapshot(manager), /forbidden role present: Sales Manager/);

	const cancel = passingSnapshot();
	cancel.role_permissions["POS Closing Entry"].owner.effective.cancel = true;
	assert.throws(() => assertPOSRoleSnapshot(cancel), /unexpected cancel: POS Closing Entry/);

	const broad = passingSnapshot();
	broad.role_permissions["Sales Invoice"].non_owner.effective.submit = true;
	assert.throws(() => assertPOSRoleSnapshot(broad), /unexpected non-owner submit: Sales Invoice/);
});

test("fixture cleanup is unconditional and run-owned", async () => {
	const source = await import("node:fs/promises").then(fs =>
		fs.readFile(new URL("../tools/pos-role-permission-acceptance.mjs", import.meta.url), "utf8")
	);
	assert.match(source, /try \{[\s\S]*finally \{[\s\S]*fixtures\.cleanup\(\)/);
	assert.match(source, /runId: all\.runId, cashier: all\.cashier/);
});
