import { randomUUID } from "node:crypto";

function pythonJson(value) {
	return JSON.stringify(JSON.stringify(value));
}

function assertRunId(runId) {
	if (!/^[a-z0-9-]{8,64}$/.test(runId)) {
		throw new Error("fixture run id must contain 8-64 lowercase letters, digits, or hyphens");
	}
}

/**
 * Build identities that can belong to exactly one acceptance run.
 *
 * The generated email prevents ordinary collisions. The marker is also stored
 * in last_name and must match during cleanup; knowing an email alone is never
 * enough authority to delete a User.
 */
export function makeRoleHomeFixtureUsers(runId = randomUUID().replaceAll("-", "")) {
	assertRunId(runId);
	const marker = `bnd-role-home-${runId}`;
	return Object.freeze({
		runId,
		erp: Object.freeze({
			key: "erp",
			email: `bunood-erp-home-qa-${runId}@example.com`,
			firstName: "ERP Home QA",
			lastName: marker,
			defaultWorkspace: "Selling",
			roles: ["Sales User", "Purchase User", "Accounts User", "Stock User"],
		}),
		realEstate: Object.freeze({
			key: "real-estate",
			email: `bunood-real-estate-home-qa-${runId}@example.com`,
			firstName: "Real Estate Home QA",
			lastName: marker,
			defaultWorkspace: "Real Estate",
			roles: ["Accounts Manager"],
		}),
	});
}

/**
 * Least-privilege starting fixtures for the V1 role-navigation matrix.
 *
 * The cashier uses the separate Bunood POS Operator authority role for the
 * complete invoice/opening/closing lifecycle. Bunood Cashier remains an
 * authority-free experience marker. Broad Sales, Stock, Accounts, and Manager
 * roles are deliberately absent. The owner remains a marker-only fixture until
 * its governed read/approve role is designed.
 */
export function makeV1RoleFixtureUsers(runId = randomUUID().replaceAll("-", "")) {
	assertRunId(runId);
	const marker = `bnd-v1-role-${runId}`;
	const spec = (key, label, workspace, roles) => Object.freeze({
		key,
		email: `bunood-v1-${key}-qa-${runId}@example.com`,
		firstName: label,
		lastName: marker,
		defaultWorkspace: workspace,
		roles: Object.freeze([...roles]),
		requireRoles: true,
	});
	return Object.freeze({
		runId,
		cashier: spec("cashier", "V1 Cashier QA", "Selling", ["Bunood Cashier", "Bunood POS Operator"]),
		sales: spec("sales", "V1 Sales QA", "Selling", ["Sales User"]),
		buyer: spec("buyer", "V1 Buyer QA", "Buying", ["Purchase User"]),
		warehouse: spec("warehouse", "V1 Warehouse QA", "Stock", ["Stock User"]),
		accountant: spec("accountant", "V1 Accountant QA", "Invoicing", ["Accounts User"]),
		finance: spec("finance", "V1 Finance QA", "Financial Reports", ["Accounts Manager", "Accounts User"]),
		owner: spec("owner", "V1 Owner QA", "Home", ["Bunood Owner"]),
	});
}

function fixtureSpecs(users) {
	return Object.values(users || {}).filter(value => value && typeof value === "object" && value.email);
}

export function buildPreflightScript(users) {
	return [
		"specs = json.loads(" + pythonJson(users) + ")",
		"collisions = [spec['email'] for spec in specs if frappe.db.exists('User', spec['email'])]",
		"if collisions:",
		"    raise RuntimeError('Refusing role-home fixture collision: ' + ', '.join(collisions))",
		"missing_roles = sorted({role for spec in specs if spec.get('requireRoles') for role in spec['roles'] if not frappe.db.exists('Role', role)})",
		"if missing_roles:",
		"    raise RuntimeError('Missing required V1 fixture roles: ' + ', '.join(missing_roles))",
		"print('clear')",
	].join("\n") + "\n";
}

export function buildCreateScript(spec) {
	return [
		"spec = json.loads(" + pythonJson(spec) + ")",
		"if frappe.db.exists('User', spec['email']):",
		"    raise RuntimeError('Refusing role-home fixture collision: ' + spec['email'])",
		"missing_roles = [role for role in spec['roles'] if spec.get('requireRoles') and not frappe.db.exists('Role', role)]",
		"if missing_roles:",
		"    raise RuntimeError('Missing required V1 fixture roles: ' + ', '.join(missing_roles))",
		"was_in_test = frappe.in_test",
		"frappe.in_test = True",
		"try:",
		"    user = frappe.get_doc({'doctype': 'User', 'email': spec['email'], 'first_name': spec['firstName'], 'last_name': spec['lastName'], 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User', 'language': 'en', 'default_workspace': spec['defaultWorkspace']})",
		"    for role in spec['roles']:",
		"        if frappe.db.exists('Role', role):",
		"            user.append('roles', {'role': role})",
		"    user.insert(ignore_permissions=True)",
		"    frappe.defaults.set_user_default('bnd_home', spec['defaultWorkspace'], spec['email'])",
		"    frappe.db.commit()",
		"finally:",
		"    frappe.in_test = was_in_test",
		"frappe.clear_cache(user=spec['email'])",
		"print('created:' + spec['email'])",
	].join("\n") + "\n";
}

export function buildCleanupScript(users) {
	return [
		"specs = json.loads(" + pythonJson(users) + ")",
		"deleted = []",
		"skipped = []",
		"for spec in specs:",
		"    existing = frappe.db.get_value('User', spec['email'], ['first_name', 'last_name', 'user_type'], as_dict=True)",
		"    if not existing:",
		"        continue",
		"    owned = (existing.first_name == spec['firstName'] and existing.last_name == spec['lastName'] and existing.user_type == 'System User')",
		"    if not owned:",
		"        skipped.append(spec['email'])",
		"        continue",
		"    frappe.delete_doc('User', spec['email'], force=True, ignore_permissions=True)",
		"    deleted.append(spec['email'])",
		"frappe.db.commit()",
		"frappe.clear_cache()",
		"print(json.dumps({'deleted': deleted, 'skipped_not_owned': skipped}))",
	].join("\n") + "\n";
}

/**
 * Owns the lifecycle of temporary User records created by one acceptance run.
 *
 * A create attempt is registered before the database call so cleanup can
 * recover a record committed by a command whose transport subsequently fails.
 * Successfully returned creates are separately recorded immediately. Cleanup
 * only considers attempted identities and still verifies their ownership
 * marker in the database before deleting anything.
 */
export class RunOwnedUserFixtures {
	constructor(runBench, users = makeRoleHomeFixtureUsers()) {
		if (typeof runBench !== "function") throw new TypeError("runBench must be a function");
		this.runBench = runBench;
		this.users = users;
		this.attempted = new Map();
		this.created = new Set();
	}

	preflight() {
		return this.runBench(buildPreflightScript(fixtureSpecs(this.users)));
	}

	create(spec) {
		this.attempted.set(spec.email, spec);
		const result = this.runBench(buildCreateScript(spec));
		this.created.add(spec.email);
		return result;
	}

	cleanup() {
		const candidates = [...this.attempted.values()];
		if (!candidates.length) return undefined;
		return this.runBench(buildCleanupScript(candidates));
	}
}
