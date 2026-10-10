"""Actual-site checks for the Bunood POS Operator role.

Two defects found on 2026-10-10 (dining lab): the operator rows were inserted
without the doctype's standard rows, so every other role lost the six POS
doctypes; and the bridge asked for owner-only submit without a document, so an
operator-only cashier could not open a shift. Everything here is rolled back.
"""

import uuid
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from bunood_theme import pos
from bunood_theme.pos_permissions import (
    POS_OPERATOR_PERMISSIONS,
    POS_OPERATOR_ROLE,
    STANDARD_RIGHTS,
    _ensure_role,
    _permission_values,
    ensure_pos_operator_permissions,
)

DOCTYPES = tuple(POS_OPERATOR_PERMISSIONS)


def _rows(table: str, doctype: str) -> set[tuple]:
    rows = frappe.get_all(
        table, filters={"parent": doctype}, fields=["role", "permlevel", "if_owner", *STANDARD_RIGHTS]
    )
    return {
        (row.role, int(row.permlevel or 0), int(row.if_owner or 0), *(int(row.get(r) or 0) for r in STANDARD_RIGHTS))
        for row in rows
    }


class TestPOSOperatorPermissions(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self.previous_user = frappe.session.user
        frappe.set_user("Administrator")
        self.savepoint = "pos_perms_" + uuid.uuid4().hex
        frappe.db.savepoint(self.savepoint)

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.rollback(save_point=self.savepoint)
        # Meta read while the rolled-back rows existed must not outlive them.
        frappe.clear_cache()
        frappe.set_user(self.previous_user)
        super().tearDown()

    # ── fixtures ──────────────────────────────────────────────────────────

    def fresh(self, *doctypes):
        """These doctypes as on a site where nothing has customised them."""
        frappe.db.delete("Custom DocPerm", {"parent": ("in", doctypes)})
        frappe.clear_cache()

    def user(self, *roles) -> str:
        email = f"pos-perms-{uuid.uuid4().hex[:12]}@example.com"
        frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": "POS permissions",
                "send_welcome_email": 0,
                "user_type": "System User",
                "roles": [{"role": role} for role in roles],
            }
        ).insert(ignore_permissions=True)
        return email

    def can(self, user: str, doctype: str, *rights: str) -> dict[str, bool]:
        frappe.local.role_permissions = {}
        return {right: bool(frappe.has_permission(doctype, ptype=right, user=user)) for right in rights}

    def profile_for(self, user: str) -> str:
        company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
        self.assertTrue(company, "The test site needs a company (setup wizard).")
        company = frappe.get_doc("Company", company)
        cash = company.default_cash_account or frappe.db.get_value(
            "Account", {"company": company.name, "account_type": "Cash", "is_group": 0}
        )
        mode = frappe.get_doc("Mode of Payment", "Cash")
        if not any(row.company == company.name for row in mode.accounts):
            mode.append("accounts", {"company": company.name, "default_account": cash})
            mode.save(ignore_permissions=True)
        profile = frappe.get_doc(
            {
                "doctype": "POS Profile",
                "__newname": f"POS permissions {uuid.uuid4().hex[:8]}",
                "company": company.name,
                "warehouse": frappe.db.get_value(
                    "Warehouse", {"company": company.name, "is_group": 0, "disabled": 0}
                ),
                "currency": company.default_currency,
                "selling_price_list": frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}),
                "write_off_account": company.write_off_account
                or frappe.db.get_value("Account", {"company": company.name, "is_group": 0, "root_type": "Expense"}),
                "write_off_cost_center": company.cost_center,
                "payments": [{"mode_of_payment": "Cash", "default": 1}],
                "applicable_for_users": [{"user": user, "default": 1}],
            }
        ).insert(ignore_permissions=True)
        return profile.name

    # ── the operator rows sit beside the standard rows ───────────────────

    def test_operator_rows_are_added_beside_the_standard_rows(self):
        self.fresh(*DOCTYPES)
        result = ensure_pos_operator_permissions()

        for doctype in DOCTYPES:
            custom = _rows("Custom DocPerm", doctype)
            self.assertLessEqual(_rows("DocPerm", doctype), custom, doctype)
            self.assertIn(POS_OPERATOR_ROLE, {row[0] for row in custom}, doctype)
        self.assertEqual(set(result["seeded"]), set(DOCTYPES))
        self.assertEqual(set(result["created"]), set(DOCTYPES))

        # The roles that lost these doctypes on the dining lab keep them.
        manager = self.user("System Manager")
        for doctype in ("POS Opening Entry", "POS Closing Entry"):
            self.assertEqual(
                self.can(manager, doctype, "read", "create", "submit"),
                {"read": True, "create": True, "submit": True},
                doctype,
            )
        sales_manager = self.user("Sales Manager")
        self.assertTrue(all(self.can(sales_manager, "POS Opening Entry", "read", "submit").values()))
        accounts = self.user("Accounts User")
        self.assertTrue(all(self.can(accounts, "Sales Invoice", "read", "create", "submit").values()))
        self.assertTrue(all(self.can(accounts, "POS Invoice", "read", "create", "submit").values()))
        self.assertTrue(self.can(accounts, "POS Profile", "read")["read"])
        sales = self.user("Sales User")
        self.assertTrue(all(self.can(sales, "Customer", "read", "create", "write").values()))

    def test_a_rerun_restores_the_standard_rows_an_earlier_version_dropped(self):
        self.fresh(*DOCTYPES)
        _ensure_role()
        # What v0.55.0 left behind: the operator row alone on each doctype.
        for doctype, (required, owner_only) in POS_OPERATOR_PERMISSIONS.items():
            frappe.get_doc(_permission_values(doctype, required, owner_only)).insert(ignore_permissions=True)
        frappe.clear_cache()
        manager = self.user("System Manager")
        self.assertEqual(
            self.can(manager, "POS Opening Entry", "read", "submit"), {"read": False, "submit": False}
        )

        result = ensure_pos_operator_permissions()
        for doctype in DOCTYPES:
            custom = _rows("Custom DocPerm", doctype)
            self.assertLessEqual(_rows("DocPerm", doctype), custom, doctype)
            self.assertEqual(sum(row[0] == POS_OPERATOR_ROLE for row in custom), 1, doctype)
        self.assertTrue(all(self.can(manager, "POS Opening Entry", "read", "create", "submit").values()))
        self.assertEqual(set(result["seeded"]), set(DOCTYPES))
        self.assertEqual(result["created"], [])

        # Settled: a further run copies nothing again.
        before = {doctype: _rows("Custom DocPerm", doctype) for doctype in DOCTYPES}
        again = ensure_pos_operator_permissions()
        self.assertEqual((again["seeded"], again["created"]), ([], []))
        self.assertEqual({doctype: _rows("Custom DocPerm", doctype) for doctype in DOCTYPES}, before)

    def test_a_rerun_also_repairs_a_doctype_another_app_added_its_role_to(self):
        # Review 2026-10-10: bunood_engineering's add_permission adds its own row beside the
        # operator's (it copies nothing once a custom row exists); that doctype is still broken.
        doctypes = ("Sales Invoice", "Customer")
        self.fresh(*doctypes)
        _ensure_role()
        office = "Bunood Test Office Role"
        if not frappe.db.exists("Role", office):
            frappe.get_doc({"doctype": "Role", "role_name": office}).insert(ignore_permissions=True)
        for doctype in doctypes:
            required, owner_only = POS_OPERATOR_PERMISSIONS[doctype]
            frappe.get_doc(_permission_values(doctype, required, owner_only)).insert(ignore_permissions=True)
            frappe.get_doc(
                {
                    "doctype": "Custom DocPerm",
                    "parent": doctype,
                    "parenttype": "DocType",
                    "parentfield": "permissions",
                    "role": office,
                    "permlevel": 0,
                    "read": 1,
                }
            ).insert(ignore_permissions=True)
        frappe.clear_cache()

        result = ensure_pos_operator_permissions()
        for doctype in doctypes:
            custom = _rows("Custom DocPerm", doctype)
            self.assertLessEqual(_rows("DocPerm", doctype), custom, doctype)
            self.assertIn(office, {row[0] for row in custom}, doctype)
            keys = [row[:3] for row in custom]
            self.assertEqual(len(keys), len(set(keys)), doctype)
        self.assertLessEqual(set(doctypes), set(result["seeded"]))
        accounts = self.user("Accounts User")
        self.assertTrue(all(self.can(accounts, "Sales Invoice", "read", "create", "submit").values()))
        sales = self.user("Sales User")
        self.assertTrue(all(self.can(sales, "Customer", "read", "create", "write").values()))

    def test_a_doctype_customised_for_another_role_is_left_as_it_is(self):
        self.fresh("POS Profile")
        frappe.get_doc(
            {
                "doctype": "Custom DocPerm",
                "parent": "POS Profile",
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Accounts Manager",
                "permlevel": 0,
                "read": 1,
                "write": 1,
            }
        ).insert(ignore_permissions=True)

        result = ensure_pos_operator_permissions()
        roles = {row[0] for row in _rows("Custom DocPerm", "POS Profile")}
        # Accounts User's standard row stays out: that was the customiser's choice.
        self.assertEqual(roles, {"Accounts Manager", POS_OPERATOR_ROLE})
        self.assertNotIn("POS Profile", result["seeded"])

    # ── an operator-only cashier runs their own shift ────────────────────

    def test_an_operator_only_cashier_opens_and_closes_their_own_shift(self):
        ensure_pos_operator_permissions()
        operator = self.user(POS_OPERATOR_ROLE)
        profile = self.profile_for(operator)
        frappe.set_user(operator)
        frappe.local.role_permissions = {}

        # Why the bridge cannot ask without a document: Frappe refuses an
        # owner-only right there, and that was the refusal the cashier saw.
        self.assertFalse(frappe.has_permission("POS Opening Entry", ptype="submit"))
        capabilities = pos.get_context(profile)["capabilities"]
        for capability in ("can_open_shift", "can_close_shift", "can_submit_invoice", "can_print_invoice"):
            self.assertTrue(capabilities[capability], capability)

        opened = pos.open_shift(profile, [{"mode_of_payment": "Cash", "opening_amount": 50}])
        opening = frappe.get_doc("POS Opening Entry", opened["name"])
        self.assertEqual((opening.docstatus, opening.owner, opening.user), (1, operator, operator))

        # ERPNext's closing commits outside tests; refuse any commit here so a
        # change in that path fails this test instead of leaving a closed shift.
        with patch.object(frappe.db, "commit", side_effect=AssertionError("close_shift committed")):
            closed = pos.close_shift(profile, [{"mode_of_payment": "Cash", "amount": 50}])
        closing = frappe.get_doc("POS Closing Entry", closed["name"])
        self.assertEqual((closing.docstatus, closing.owner), (1, operator))

    def test_a_cashier_still_cannot_submit_a_shift_that_is_not_theirs(self):
        ensure_pos_operator_permissions()
        operator = self.user(POS_OPERATOR_ROLE)
        profile = self.profile_for(operator)
        company = frappe.db.get_value("POS Profile", profile, "company")
        # Drafted by someone else (Administrator) for this cashier.
        opening = frappe.get_doc(
            {
                "doctype": "POS Opening Entry",
                "period_start_date": frappe.utils.now_datetime(),
                "posting_date": frappe.utils.nowdate(),
                "user": operator,
                "pos_profile": profile,
                "company": company,
                "balance_details": [{"mode_of_payment": "Cash", "opening_amount": 0}],
            }
        ).insert(ignore_permissions=True)

        frappe.set_user(operator)
        frappe.local.role_permissions = {}
        self.assertFalse(frappe.has_permission("POS Opening Entry", ptype="submit", doc=opening))
        with self.assertRaises(frappe.PermissionError):
            pos._require("POS Opening Entry", "submit", opening)

    def test_a_role_without_shift_rights_is_not_offered_the_shift(self):
        ensure_pos_operator_permissions()
        accounts = self.user("Accounts User")
        frappe.set_user(accounts)
        frappe.local.role_permissions = {}
        capabilities = pos._capabilities("Sales Invoice")
        self.assertFalse(capabilities["can_open_shift"])
        self.assertFalse(capabilities["can_close_shift"])
        # A right that is not owner-only is answered as before.
        self.assertTrue(capabilities["can_submit_invoice"])
