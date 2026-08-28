/**
 * The second desk user — item 38, slice 0.
 *
 * WHY THIS FILE EXISTS
 *   Every per-user preference this theme ships has been verified as ONE user:
 *   Administrator. The suite mints an Administrator session, drives an
 *   Administrator desk, and asserts the SITE's field. So the entire per-user
 *   layer — four `frappe.defaults` keys and counting — has never once been
 *   observed from a second account, and cross-user leakage has no check at all.
 *
 *   That is not a hypothesis about what might go wrong. It is what the item-37
 *   release review MEASURED: the per-user "personalize" menu was dead for every
 *   non-administrator for an entire release, because it called an endpoint
 *   opening `frappe.only_for("System Manager")`. Three review dimensions found it
 *   by reasoning. No test did, and no test COULD, because
 *   `api.get_theme_sidebar_presets`'s own docstring says it: the suite runs as
 *   Administrator and is structurally blind to this class of defect.
 *
 *   This file ends that. Item 38 makes the desk itself personal, so the blindness
 *   stops being a gap in coverage and becomes a gap in the feature.
 *
 * WHY A SYSTEM USER, WHICH IS THE OPPOSITE OF `portal-fixtures.mjs`
 *   That file deliberately mints a **Website** User, because a System User would
 *   be redirected away from the portal by the same guard that made item 32's kit
 *   unpreviewable. Here the DESK is the surface under test and a Website User
 *   cannot reach it at all — `www/desk.py::get_context` throws
 *   `PermissionError` for `user_type == "Website User"` before a line of ours
 *   runs. So: System User, necessarily.
 *
 * AND DELIBERATELY NOT A SYSTEM MANAGER
 *   The role is the whole point. A System Manager reads every role-gated endpoint
 *   and every privileged boot signal, which is precisely the vantage point that
 *   hid the defect above. This account holds ONE role and it is the least
 *   privileged one that exists.
 *
 * A ROLE-LESS SYSTEM USER CANNOT EXIST, WHICH THE FIRST DRAFT OF THIS FILE
 * ASSUMED IT COULD
 *   Setting `user_type = "System User"` on insert is not a decision, it is a
 *   suggestion: `User.set_system_user` (`user.py:415`) overwrites it with
 *   `"System User" if self.has_desk_access() else "Website User"`, and
 *   `has_desk_access` (`:432`) returns False the moment `self.roles` is empty.
 *   So the first run of `--create` produced a **Website User** — an account that
 *   `www/desk.py` refuses before a line of ours executes. Measured, not read.
 *
 *   The remedy is the role named for the job: `Desk User` is a shipped,
 *   non-custom, enabled role whose only distinction is `desk_access = 1`. It
 *   carries ordinary read permissions and nothing administrative. One role,
 *   asserted exactly, so the account cannot quietly acquire the administrator's
 *   view that this file exists to avoid.
 *
 *   Note what this means for the OTHER throwaway account below: a "role-less
 *   System User" is not what `bnd-status-probe@example.com` is either. It is a
 *   Website User, and its check never noticed because it only ever calls
 *   `frappe.set_user()` server-side and never loads a desk.
 *
 * WHY IT ALSO OWNS THE `frappe.defaults` ROWS
 *   A per-user preference is not a Theme Settings field, so `setSettings`'
 *   `MUTABLE_FIELDS` guard is structurally blind to it, and the `site data:`
 *   hygiene preamble reads six branding VALUES and can never match a stored
 *   preference either. A run that writes a preference and dies before its
 *   `finally` — which has happened twice in this repo for other state — would
 *   leave the Administrator re-skinned for every later check, and the failures
 *   would read as a dozen unrelated kit bugs. So the audit and the purge live
 *   here, next to the user they are about, and the suite calls them.
 *
 * MEASURED BEFORE THIS WAS WRITTEN (2026-08-28, this site)
 *   * `tabDefaultValue` holds `parent` = the user's name, `parenttype`
 *     `__default`, `parentfield` `system_defaults`. A GLOBAL default is the same
 *     table with `parent` = `__default` — which is why `personalRows` reports the
 *     parent rather than filtering to one user, and why writing a preference
 *     without an explicit `parent=` is a bug that reaches every account
 *     including Guest.
 *   * There are **zero** `bnd_*` rows on this site. Nobody has ever set a
 *     per-user preference here, so every branch that reads one is unexercised —
 *     `CLAUDE.md`'s "a branch whose guard is false on the dev site is UNTESTED,
 *     not working", at the scale of a whole layer.
 *   * There is one ORPHAN parent, `bnd_status_probe@example.com` (underscores),
 *     with no matching User; the live probe account spells it with hyphens. Left
 *     alone — it predates this item and carries only a `time_zone` — but it is
 *     why the audit never assumes a parent resolves to an account.
 *
 * NO PASSWORD IS SET, DELIBERATELY
 *   `tests/smoke.mjs` mints a session server-side through `LoginManager.login_as`,
 *   the same mechanism it already uses for Administrator and for the portal
 *   fixture. Nothing here needs a credential, so nothing here stores one.
 *
 * THE OTHER THROWAWAY USER, AND WHY IT IS NOT ABSORBED
 *   `tests/smoke.mjs` creates `bnd-status-probe@example.com` inline, inside the
 *   `status:` check that needs it, and never removes it. That account is a
 *   role-less System User too and this file could have replaced it — but the
 *   check that owns it is green, its user is created inside the assertion that
 *   depends on it, and folding it in would be a behaviour change smuggled into a
 *   fixture commit. Left where it is; recorded so the next reader does not add a
 *   third.
 *
 * USAGE
 *   node tools/desk-fixture.mjs --status
 *   node tools/desk-fixture.mjs --create
 *   node tools/desk-fixture.mjs --audit     # every bnd_* default on the site
 *   node tools/desk-fixture.mjs --clean     # drop bnd_* defaults, keep the user
 *   node tools/desk-fixture.mjs --remove
 *
 *   `--create` is idempotent: run it twice and the second run is a no-op that
 *   reports the same state. `--remove` reverses it and is safe on a site where
 *   the fixture was never made.
 */

import { pathToFileURL } from "node:url";

import { benchPy, SITE } from "./session.mjs";

/** Everything this tool owns. */
export const FIXTURE = {
	user: "bnd-desk-fixture@example.com",
	first_name: "Desk",
	last_name: "Fixture",
	/** The ONE role. See the header: without a desk_access role Frappe rewrites
	 *  the account to a Website User, which cannot reach the desk at all. */
	role: "Desk User",
};

/**
 * The prefix every per-user preference this theme stores shares.
 *
 * Stated here rather than imported from `personal.py` ON PURPOSE: this tool has
 * to be able to find rows written by a version of the app that no longer agrees
 * with the table — a renamed key, a key from a branch, a key a crashed run left
 * behind. An audit that could only see the keys the current code declares would
 * go green on exactly the residue it exists to catch.
 */
export const PERSONAL_PREFIX = "bnd_";

/** Python both `--status` and `--create` need. */
const PRELUDE = `
import json
USER = ${JSON.stringify(FIXTURE.user)}
ROLE = ${JSON.stringify(FIXTURE.role)}
PREFIX = ${JSON.stringify(PERSONAL_PREFIX)}
`;

/** Every `bnd_*` default on the site, whoever it belongs to. */
function auditPy() {
	return `rows = frappe.db.sql(
    "select parent, defkey, defvalue from tabDefaultValue where defkey like %s order by parent, defkey",
    (PREFIX + "%",), as_dict=True)
`;
}

function status() {
	const out = benchPy(
		PRELUDE +
			auditPy() +
			`state = {
    "user": 1 if frappe.db.exists("User", USER) else 0,
    "user_type": frappe.db.get_value("User", USER, "user_type"),
    "enabled": frappe.db.get_value("User", USER, "enabled"),
    "desk_theme": frappe.db.get_value("User", USER, "desk_theme"),
    # The role list must stay EMPTY. A System Manager here would reproduce the
    # exact vantage point that hid item 37's dead menu for a whole release.
    "roles": sorted(r.role for r in frappe.get_all(
        "Has Role", filters={"parent": USER, "parenttype": "User"}, fields=["role"])),
    "own_personal_rows": len([r for r in rows if r.parent == USER]),
    "site_personal_rows": len(rows),
    "global_personal_rows": len([r for r in rows if r.parent == "__default"]),
}
print("BND_STATE=" + json.dumps(state, default=str))
`
	);
	const m = out.match(/BND_STATE=(\{.*\})/);
	if (!m) throw new Error("desk-fixture: could not read state:\n" + out.slice(-800));
	return JSON.parse(m[1]);
}

function create() {
	const out = benchPy(
		PRELUDE +
			`# A SYSTEM USER WITH NO ROLES. Both halves matter — see the file header.
if not frappe.db.exists("User", USER):
    u = frappe.new_doc("User")
    u.email = USER
    u.first_name = ${JSON.stringify(FIXTURE.first_name)}
    u.last_name = ${JSON.stringify(FIXTURE.last_name)}
    u.user_type = "System User"
    u.send_welcome_email = 0
    u.insert(ignore_permissions=True)
else:
    u = frappe.get_doc("User", USER)
    if not u.enabled:
        u.enabled = 1
        u.save(ignore_permissions=True)

# EXACTLY ONE ROLE. Anything the site handed it beyond ROLE is stripped: a role
# acquired from a site default would silently restore the administrator's-eye
# view this account exists to avoid. Removing ROLE itself would be worse — the
# account would drop back to a Website User and stop being able to load a desk.
# Idempotent in both directions.
u = frappe.get_doc("User", USER)
extra = [r.name for r in u.get("roles") or [] if r.role != ROLE]
has_role = any(r.role == ROLE for r in u.get("roles") or [])
if extra or not has_role:
    u.set("roles", [r for r in u.get("roles") or [] if r.role == ROLE])
    if not has_role:
        u.append("roles", {"role": ROLE})
    u.save(ignore_permissions=True)
    frappe.clear_cache(user=USER)

frappe.db.commit()
u.reload()
print("BND_CREATED=" + json.dumps(
    {"user": USER, "roles_stripped": len(extra), "role_added": 0 if has_role else 1,
     "user_type": u.user_type}))
`
	);
	const m = out.match(/BND_CREATED=(\{.*\})/);
	if (!m) throw new Error("desk-fixture: create failed:\n" + out.slice(-1500));
	return JSON.parse(m[1]);
}

/**
 * Every `bnd_*` default on the site, grouped by whose it is.
 *
 * Exported so `tests/smoke.mjs` can run it as a hygiene arm: any row here at the
 * START of a run is residue from a run that died before its `finally`, and it is
 * silently re-skinning whoever owns it for every check that follows.
 */
export function personalRows() {
	const out = benchPy(
		PRELUDE + auditPy() + `print("BND_ROWS=" + json.dumps(rows, default=str))\n`
	);
	const m = out.match(/BND_ROWS=(\[.*\])/);
	if (!m) throw new Error("desk-fixture: audit failed:\n" + out.slice(-800));
	return JSON.parse(m[1]);
}

/**
 * Drop every `bnd_*` default, or only one parent's.
 *
 * Goes through `frappe.defaults.clear_default` rather than a raw DELETE so the
 * framework invalidates its own defaults cache — a raw delete leaves
 * `get_user_default` answering from cache, which is the same class of trap as
 * `get_single_value` reading through a value cache the suite's raw SQL did not
 * invalidate (HANDOVER, item 36). The cached BOOT is dropped separately, because
 * that one is ours to know about.
 *
 * @param {string|null} parent - a user name, or null for every parent.
 */
export function clearPersonal(parent = null) {
	const out = benchPy(
		PRELUDE +
			`WHO = ${parent === null ? "None" : JSON.stringify(parent)}
` +
			auditPy() +
			`targets = [r for r in rows if WHO is None or r.parent == WHO]
for r in targets:
    frappe.defaults.clear_default(r.defkey, parent=r.parent)
    frappe.cache.hdel("bootinfo", r.parent)
frappe.db.commit()
print("BND_CLEARED=" + json.dumps({"rows": len(targets),
                                   "parents": sorted({r.parent for r in targets})}))
`
	);
	const m = out.match(/BND_CLEARED=(\{.*\})/);
	if (!m) throw new Error("desk-fixture: clean failed:\n" + out.slice(-1500));
	return JSON.parse(m[1]);
}

function remove() {
	const cleared = clearPersonal(FIXTURE.user);
	const out = benchPy(
		PRELUDE +
			`removed = {"personal_rows": ${cleared.rows}, "user": 0}
if frappe.db.exists("User", USER):
    # Frappe refuses to delete a User that owns documents; this account is
    # created for reading and owns none. force=True keeps --remove honest on a
    # site where a stray link would otherwise leave a half-removed fixture.
    frappe.delete_doc("User", USER, ignore_permissions=True, force=True)
    removed["user"] = 1
frappe.cache.hdel("bootinfo", USER)
frappe.db.commit()
print("BND_REMOVED=" + json.dumps(removed))
`
	);
	const m = out.match(/BND_REMOVED=(\{.*\})/);
	if (!m) throw new Error("desk-fixture: remove failed:\n" + out.slice(-1500));
	return JSON.parse(m[1]);
}

/**
 * True when the account is present and is the KIND of account the checks need.
 *
 * Exported because `tests/smoke.mjs` asserts it and fails loudly naming this
 * command rather than skipping — the same contract `portal-fixtures.mjs` sets,
 * for the same reason: a per-user suite that skips on a site with no second user
 * is the "green tests that assert existence, not correctness" trap wearing a
 * fixture's hat.
 *
 * The role list is part of READINESS, not a detail, and it is asserted EXACTLY
 * rather than as a floor. One extra role and the account stops standing in for
 * an ordinary employee, and every check driven through it quietly measures the
 * administrator's view again — which is the failure this whole file exists to
 * make visible. `user_type` is asserted too, because Frappe derives it from the
 * roles and a silent demotion to Website User is precisely how the first draft
 * of this tool failed.
 */
export function fixtureReady(state = status()) {
	return Boolean(
		state.user &&
			state.enabled &&
			state.user_type === "System User" &&
			Array.isArray(state.roles) &&
			state.roles.length === 1 &&
			state.roles[0] === FIXTURE.role
	);
}

export { status, create, remove };

// COMPARE RESOLVED URLs, not basenames — `tests/smoke.mjs` imports this module.
// See the same note in `tools/portal-fixtures.mjs`.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const mode = process.argv.find((a) => a.startsWith("--")) || "--status";
	if (mode === "--create") {
		console.log(`desk-fixture: creating on ${SITE}`);
		console.log("  " + JSON.stringify(create()));
	} else if (mode === "--remove") {
		console.log(`desk-fixture: removing from ${SITE}`);
		console.log("  " + JSON.stringify(remove()));
	} else if (mode === "--clean") {
		console.log(`desk-fixture: dropping every ${PERSONAL_PREFIX}* default on ${SITE}`);
		console.log("  " + JSON.stringify(clearPersonal(null)));
	} else if (mode === "--audit") {
		const rows = personalRows();
		console.log(`desk-fixture: ${PERSONAL_PREFIX}* defaults on ${SITE} — ${rows.length} row(s)`);
		for (const r of rows) console.log(`  ${String(r.parent).padEnd(34)} ${r.defkey.padEnd(22)} ${r.defvalue}`);
		process.exit(0);
	} else if (mode !== "--status") {
		console.error(
			`desk-fixture: unknown flag ${mode} — use --status, --create, --audit, --clean or --remove`
		);
		process.exit(2);
	}
	const s = status();
	console.log("desk-fixture: state");
	for (const [k, v] of Object.entries(s)) {
		console.log(`  ${k.padEnd(22)} ${Array.isArray(v) ? JSON.stringify(v) : v}`);
	}
	console.log(`  ${"READY".padEnd(22)} ${fixtureReady(s) ? "yes" : "NO"}`);
	if (mode !== "--remove" && !fixtureReady(s)) process.exit(1);
}
