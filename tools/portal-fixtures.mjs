/**
 * The portal's test data — item 33, slice 0.
 *
 * WHY THIS FILE EXISTS
 *   Item 33 dresses the customer portal, and NOTHING ON THIS SITE COULD RENDER
 *   ONE. Measured 2026-08-22, before a line of the kit was written: 0 Customers,
 *   0 Sales Orders, 0 rows in every other portal doctype, and the only `Has Role`
 *   row for `Customer` belonged to a *report*, not a user. Every portal list
 *   answered "Nothing to show".
 *
 *   That is the trap CLAUDE.md names as "a branch whose guard is false on the dev
 *   site is UNTESTED, not working" — at the scale of a whole surface. Row rules,
 *   the list's own empty state, pagination, the `.result` hover and every
 *   contrast pair that only exists once there is text in a row would all have
 *   shipped on the strength of a page that renders nothing.
 *
 * WHAT IT BUILDS, AND WHY EXACTLY THIS
 *   ERPNext resolves "whose documents are these" through TWO facts, and both are
 *   required — verified in `erpnext/controllers/website_list_for_contact.py`:
 *
 *     1. the user holds the `Customer` role      (`get_customers_suppliers`:238,
 *        `has_common(["Supplier","Customer"], frappe.get_roles(user))`)
 *     2. a `Portal User` child row on the Customer names that user
 *        (`get_parents_for_user`:248-256 — it queries `tabPortal User` by
 *        `user == frappe.session.user`, NOT the Contact link, which is the
 *        obvious guess and the wrong one)
 *
 *   and the list filters `docstatus = 1` (`get_transaction_list`:83), so the
 *   orders must be SUBMITTED. A draft renders exactly like no data at all.
 *
 * WHY A TOOL AND NOT SOMETHING THE SUITE CREATES
 *   Building ERP documents costs seconds per run and would put a submit path in
 *   the way of every portal check. But the alternative — a check that skips when
 *   the data is absent — is the "green tests that assert existence, not
 *   correctness" trap wearing a different hat: the portal suite would go green on
 *   a site where the portal is empty, which is precisely the state this file
 *   exists to end. So: the data is created HERE, and the suite ASSERTS it and
 *   fails loudly naming this command. Never skips.
 *
 * NO PASSWORD IS SET, DELIBERATELY
 *   `tests/smoke.mjs` mints a session server-side through `LoginManager.login_as`,
 *   the same mechanism it already uses for Administrator. Nothing here needs a
 *   credential, so nothing here stores one.
 *
 * USAGE
 *   node tools/portal-fixtures.mjs --status
 *   node tools/portal-fixtures.mjs --create
 *   node tools/portal-fixtures.mjs --remove
 *
 *   `--create` is idempotent: run it twice and the second run is a no-op that
 *   reports the same counts. `--remove` reverses it and is safe on a site where
 *   the fixtures were never made.
 */

import { pathToFileURL } from "node:url";

import { benchPy, SITE } from "./session.mjs";

/** Everything this tool owns. One prefix, so `--remove` can be exact. */
export const FIXTURE = {
	user: "bnd-portal-fixture@example.com",
	customer: "Bunood Portal Fixture",
	orders: 3,
	/** The gallery items item 27 left behind — reused rather than minted, so the
	 *  fixture's footprint is a user, a customer and three orders and nothing else. */
	itemPrefix: "BND-VIEW-",
};

/** Python that both `--create` and `--status` need: resolve the site's masters. */
const PRELUDE = `
import json
company = frappe.get_all("Company", pluck="name")[0]
items = frappe.get_all("Item", filters={"is_sales_item": 1, "name": ("like", ${JSON.stringify(FIXTURE.itemPrefix)} + "%")}, pluck="name", order_by="name")
USER = ${JSON.stringify(FIXTURE.user)}
CUST = ${JSON.stringify(FIXTURE.customer)}
`;

function status() {
	const out = benchPy(
		PRELUDE +
			`state = {
    "user": frappe.db.exists("User", USER) and 1 or 0,
    "user_type": frappe.db.get_value("User", USER, "user_type"),
    "has_customer_role": bool(frappe.db.exists("Has Role", {"parent": USER, "parenttype": "User", "role": "Customer"})),
    "customer": frappe.db.exists("Customer", CUST) and 1 or 0,
    "portal_user_row": bool(frappe.db.exists("Portal User", {"parent": CUST, "parenttype": "Customer", "user": USER})),
    "orders_submitted": frappe.db.count("Sales Order", {"customer": CUST, "docstatus": 1}),
    "orders_any": frappe.db.count("Sales Order", {"customer": CUST}),
    "sales_items": len(items),
    "company": company,
}
print("BND_STATE=" + json.dumps(state))
`
	);
	const m = out.match(/BND_STATE=(\{.*\})/);
	if (!m) throw new Error("portal-fixtures: could not read state:\n" + out.slice(-800));
	return JSON.parse(m[1]);
}

function create() {
	const out = benchPy(
		PRELUDE +
			`if not items:
    raise SystemExit("portal-fixtures: no sales items match " + ${JSON.stringify(FIXTURE.itemPrefix)} + "* — this site is not the one this tool was written for")

# 1. THE USER. A Website User, because a System User would be redirected to /desk
#    by the same guard that made item 32's kit unpreviewable, and would also read
#    every Customer through the permission branch rather than the portal one.
if not frappe.db.exists("User", USER):
    u = frappe.new_doc("User")
    u.email = USER
    u.first_name = "Portal"
    u.last_name = "Fixture"
    u.user_type = "Website User"
    u.send_welcome_email = 0
    u.insert(ignore_permissions=True)
else:
    u = frappe.get_doc("User", USER)
    if not u.enabled:
        u.enabled = 1
        u.save(ignore_permissions=True)

# 2. THE ROLE. Half of erpnext's ownership test; without it get_customers_suppliers
#    falls to the permission branch and the user sees EVERY customer, which would
#    be a green portal list proving the wrong thing.
if not frappe.db.exists("Has Role", {"parent": USER, "parenttype": "User", "role": "Customer"}):
    u = frappe.get_doc("User", USER)
    u.append("roles", {"role": "Customer"})
    u.save(ignore_permissions=True)

# 3. THE CUSTOMER, carrying the Portal User row that is the other half.
if not frappe.db.exists("Customer", CUST):
    c = frappe.new_doc("Customer")
    c.customer_name = CUST
    c.customer_type = "Company"
    c.customer_group = frappe.get_all("Customer Group", filters={"is_group": 0}, pluck="name")[0]
    c.territory = frappe.get_all("Territory", filters={"is_group": 0}, pluck="name")[0]
    c.insert(ignore_permissions=True)
c = frappe.get_doc("Customer", CUST)
if not any(r.user == USER for r in (c.get("portal_users") or [])):
    c.append("portal_users", {"user": USER})
    c.save(ignore_permissions=True)

# 4. THE ORDERS. Submitted — the portal list filters docstatus == 1, so a draft
#    renders identically to no data and would make this whole file pointless.
have = frappe.db.count("Sales Order", {"customer": CUST, "docstatus": 1})
made = 0
for i in range(have, ${FIXTURE.orders}):
    so = frappe.new_doc("Sales Order")
    so.customer = CUST
    so.company = company
    so.transaction_date = frappe.utils.nowdate()
    so.delivery_date = frappe.utils.add_days(frappe.utils.nowdate(), 7 + i)
    so.po_no = "BND-FIXTURE-%02d" % (i + 1)
    for n in range(1 + i):
        so.append("items", {
            "item_code": items[n % len(items)],
            "qty": 2 + n,
            "rate": 125 + (25 * n),
            "delivery_date": so.delivery_date,
        })
    so.insert(ignore_permissions=True)
    so.submit()
    made += 1

frappe.db.commit()
print("BND_MADE=" + json.dumps({"orders_created": made, "company": company, "items": len(items)}))
`
	);
	const m = out.match(/BND_MADE=(\{.*\})/);
	if (!m) throw new Error("portal-fixtures: create failed:\n" + out.slice(-1500));
	return JSON.parse(m[1]);
}

function remove() {
	const out = benchPy(
		PRELUDE +
			`removed = {"orders": 0, "customer": 0, "user": 0}

# Cancel before delete: a submitted document refuses deletion, and the error a
# bare delete raises names the docstatus rather than the fix.
for name in frappe.get_all("Sales Order", filters={"customer": CUST}, pluck="name"):
    d = frappe.get_doc("Sales Order", name)
    if d.docstatus == 1:
        d.cancel()
    d.delete(ignore_permissions=True)
    removed["orders"] += 1

if frappe.db.exists("Customer", CUST):
    frappe.delete_doc("Customer", CUST, ignore_permissions=True, force=True)
    removed["customer"] = 1

if frappe.db.exists("User", USER):
    frappe.delete_doc("User", USER, ignore_permissions=True, force=True)
    removed["user"] = 1

frappe.db.commit()
print("BND_REMOVED=" + json.dumps(removed))
`
	);
	const m = out.match(/BND_REMOVED=(\{.*\})/);
	if (!m) throw new Error("portal-fixtures: remove failed:\n" + out.slice(-1500));
	return JSON.parse(m[1]);
}

/**
 * True when every fact the portal checks depend on is in place.
 *
 * Exported because `tests/smoke.mjs` calls it to FAIL LOUDLY rather than skip —
 * see the header. The four facts are the two halves of erpnext's ownership test
 * plus submitted data to render.
 */
export function fixturesReady(state = status()) {
	return Boolean(
		state.user &&
			state.has_customer_role &&
			state.customer &&
			state.portal_user_row &&
			state.orders_submitted >= 1
	);
}

export { status, create, remove };

// COMPARE RESOLVED URLs, not basenames. `tests/smoke.mjs` imports this module,
// and a basename test would have to be right about Windows separators and about
// every future file that happens to end in the same name; `pathToFileURL` is the
// comparison Node itself would make.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const mode = process.argv.find((a) => a.startsWith("--")) || "--status";
	if (mode === "--create") {
		console.log(`portal-fixtures: creating on ${SITE}`);
		console.log("  " + JSON.stringify(create()));
	} else if (mode === "--remove") {
		console.log(`portal-fixtures: removing from ${SITE}`);
		console.log("  " + JSON.stringify(remove()));
	} else if (mode !== "--status") {
		console.error(`portal-fixtures: unknown flag ${mode} — use --status, --create or --remove`);
		process.exit(2);
	}
	const s = status();
	console.log("portal-fixtures: state");
	for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(18)} ${v}`);
	console.log(`  ${"READY".padEnd(18)} ${fixturesReady(s) ? "yes" : "NO"}`);
	if (mode !== "--remove" && !fixturesReady(s)) process.exit(1);
}
