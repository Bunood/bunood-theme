/**
 * Live, self-cleaning acceptance for the Bunood cashier authority boundary.
 *
 * This gate proves that a run-owned cashier can operate the configured POS
 * lifecycle without inheriting Sales Manager, Accounts Manager, System
 * Manager, journal, or settings authority. It does not claim the browser
 * shift-to-close journey; that remains a separate V1 gate.
 */
import { pathToFileURL } from "node:url";

import { benchJson, benchPy } from "./session.mjs";
import { makeV1RoleFixtureUsers, RunOwnedUserFixtures } from "./run-owned-users.mjs";

export const POS_ROLE_CONTRACT = Object.freeze({
	requiredRoles: Object.freeze(["Bunood Cashier", "Bunood POS Operator"]),
	ownerScopedDoctypes: Object.freeze(["POS Invoice", "Sales Invoice", "POS Opening Entry", "POS Closing Entry"]),
	forbiddenRoles: Object.freeze([
		"Administrator", "System Manager", "Sales Manager", "Sales User",
		"Accounts Manager", "Accounts User", "Stock Manager", "Stock User",
	]),
	required: Object.freeze({
		"POS Profile": Object.freeze(["select", "read"]),
		"POS Invoice": Object.freeze(["select", "read", "write", "create", "delete", "submit", "print"]),
		"Sales Invoice": Object.freeze(["select", "read", "write", "create", "delete", "submit", "print"]),
		Customer: Object.freeze(["select", "read"]),
		"POS Opening Entry": Object.freeze(["select", "read", "write", "create", "submit"]),
		"POS Closing Entry": Object.freeze(["select", "read", "write", "create", "submit"]),
	}),
	forbidden: Object.freeze({
		"POS Profile": Object.freeze(["write", "create", "delete", "export", "share"]),
		"POS Invoice": Object.freeze(["cancel", "amend", "email", "report", "import", "export", "share"]),
		"Sales Invoice": Object.freeze(["cancel", "amend", "email", "report", "import", "export", "share"]),
		Customer: Object.freeze(["write", "create", "delete", "email", "report", "import", "export", "share"]),
		"POS Opening Entry": Object.freeze(["delete", "cancel", "amend", "import", "export", "share"]),
		"POS Closing Entry": Object.freeze(["delete", "cancel", "amend", "import", "export", "share"]),
		"Journal Entry": Object.freeze(["create", "write", "submit", "cancel"]),
		"System Settings": Object.freeze(["read", "write"]),
	}),
});

function pythonJson(value) {
	return JSON.stringify(JSON.stringify(value));
}

export function buildPermissionSnapshotScript(user, contract = POS_ROLE_CONTRACT) {
	const doctypes = [...new Set([...Object.keys(contract.required), ...Object.keys(contract.forbidden)])];
	const rights = [...new Set([
		...Object.values(contract.required).flat(),
		...Object.values(contract.forbidden).flat(),
	])];
	return [
		"user = " + JSON.stringify(user),
		"doctypes = json.loads(" + pythonJson(doctypes) + ")",
		"rights = json.loads(" + pythonJson(rights) + ")",
		"frappe.set_user(user)",
		"invoice_type = frappe.db.get_single_value('POS Settings', 'invoice_type') or 'POS Invoice'",
		"checked = list(dict.fromkeys(doctypes + [invoice_type]))",
		"permissions = {dt: {right: bool(frappe.has_permission(dt, right, user=user)) for right in rights} for dt in checked}",
		"from frappe.permissions import get_role_permissions",
		"def effective_role_permissions(dt, is_owner):",
		"    raw = get_role_permissions(dt, user=user, is_owner=is_owner)",
		"    effective = {right: bool(raw.get(right)) for right in rights}",
		"    if is_owner and raw.get('has_if_owner_enabled'):",
		"        effective.update({right: bool(raw.get('if_owner', {}).get(right, effective.get(right))) for right in rights})",
		"    return {'has_if_owner': bool(raw.get('has_if_owner_enabled')), 'effective': effective}",
		"role_permissions = {dt: {'owner': effective_role_permissions(dt, True), 'non_owner': effective_role_permissions(dt, False)} for dt in checked}",
		"snapshot = {'user': user, 'roles': sorted(frappe.get_roles(user)), 'invoice_type': invoice_type, 'permissions': permissions, 'role_permissions': role_permissions}",
		"print(json.dumps(snapshot, sort_keys=True))",
	].join("\n") + "\n";
}

export function assertPOSRoleSnapshot(snapshot, contract = POS_ROLE_CONTRACT) {
	const failures = [];
	const ownerScoped = new Set(contract.ownerScopedDoctypes || []);
	const effective = (doctype, owner = true) => ownerScoped.has(doctype)
		? snapshot.role_permissions?.[doctype]?.[owner ? "owner" : "non_owner"]?.effective
		: snapshot.permissions?.[doctype];
	for (const role of contract.requiredRoles) {
		if (!snapshot.roles.includes(role)) failures.push(`missing role: ${role}`);
	}
	for (const role of contract.forbiddenRoles) {
		if (snapshot.roles.includes(role)) failures.push(`forbidden role present: ${role}`);
	}
	for (const [doctype, rights] of Object.entries(contract.required)) {
		for (const right of rights) {
			if (!effective(doctype)?.[right]) failures.push(`missing ${right}: ${doctype}`);
		}
		if (ownerScoped.has(doctype) && !snapshot.role_permissions?.[doctype]?.owner?.has_if_owner) {
			failures.push(`missing creator-only scope: ${doctype}`);
		}
	}
	for (const [doctype, rights] of Object.entries(contract.forbidden)) {
		for (const right of rights) {
			if (effective(doctype)?.[right]) failures.push(`unexpected ${right}: ${doctype}`);
		}
	}
	for (const doctype of ownerScoped) {
		for (const right of ["write", "delete", "submit", "print"]) {
			if (effective(doctype, false)?.[right]) failures.push(`unexpected non-owner ${right}: ${doctype}`);
		}
	}
	for (const right of ["read", "write", "create", "submit", "print"]) {
		if (!effective(snapshot.invoice_type)?.[right]) {
			failures.push(`missing ${right}: configured invoice type ${snapshot.invoice_type}`);
		}
	}
	if (failures.length) throw new Error("POS role acceptance failed:\n- " + failures.join("\n- "));
	return true;
}

export function runPOSRolePermissionAcceptance() {
	const all = makeV1RoleFixtureUsers();
	const users = Object.freeze({ runId: all.runId, cashier: all.cashier });
	const fixtures = new RunOwnedUserFixtures(benchPy, users);
	let cleanup;
	try {
		fixtures.preflight();
		fixtures.create(users.cashier);
		const snapshot = benchJson(buildPermissionSnapshotScript(users.cashier.email));
		assertPOSRoleSnapshot(snapshot);
		return { status: "PASS", snapshot };
	} finally {
		cleanup = fixtures.cleanup();
		if (cleanup) process.stderr.write(cleanup);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		console.log(JSON.stringify(runPOSRolePermissionAcceptance(), null, 2));
	} catch (error) {
		console.error(error?.stack || error);
		process.exitCode = 1;
	}
}
