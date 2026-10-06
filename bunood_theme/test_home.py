"""Actual-site Home acceptance. No tenant seeds, finance writes or skips."""

import uuid

import frappe
from frappe.tests import IntegrationTestCase

from bunood_theme import home


class TestHome(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self.previous_user = frappe.session.user
        frappe.set_user("Administrator")
        self.savepoint = "home_" + uuid.uuid4().hex
        frappe.db.savepoint(self.savepoint)

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.db.rollback(save_point=self.savepoint)
        frappe.set_user(self.previous_user)
        super().tearDown()

    def test_page_is_native_and_lazy_assets_exist(self):
        from pathlib import Path
        from bunood_theme.assets import HOME_CSS, HOME_JS
        page = frappe.get_doc("Page", home.PAGE)
        self.assertTrue(page.is_permitted())
        for asset in (HOME_CSS, HOME_JS):
            self.assertTrue(Path(frappe.get_app_path("bunood_theme", "public", asset.split("/assets/bunood_theme/")[1])).is_file())

    def test_guest_cannot_read_home(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            home.read()

    def test_company_query_operators_are_not_scope_values(self):
        for value in (["!=", ""], {"name": ["!=", ""]}, True, 3):
            with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
                home.read(value)

    def test_restricted_staff_cannot_read_company_or_financial_queues(self):
        email = "home-" + uuid.uuid4().hex + "@example.invalid"
        user = frappe.get_doc({"doctype": "User", "email": email, "first_name": "Home acceptance",
                              "user_type": "System User", "send_welcome_email": 0,
                              "roles": [{"role": "Website Manager"}]}).insert(ignore_permissions=True)
        self.assertEqual(user.user_type, "System User")
        companies = frappe.get_list("Company", pluck="name", limit_page_length=1)
        self.assertTrue(companies, "Native ERP acceptance must provide a Company")
        frappe.set_user(email)
        data = home.read()
        self.assertEqual(data["queues"], [])
        self.assertNotIn("Sales Invoice", data["create"])
        with self.assertRaises(frappe.PermissionError):
            home.read(companies[0])

    def test_permitted_queue_counts_match_native_read(self):
        companies = frappe.get_list("Company", pluck="name", limit_page_length=1)
        self.assertTrue(companies)
        data = home.read(companies[0])
        self.assertTrue(data["queues"])
        for row in data["queues"]:
            expected = frappe.get_list(row["doctype"], filters=row["filters"], fields=[{"COUNT":"name", "AS":"count"}], limit_page_length=1)
            self.assertEqual(row["count"], int(expected[0]["count"]))

    def test_navigation_preserves_custom_items_and_is_idempotent(self):
        custom = {"type":"Link", "label":"Custom report", "link_to":"custom-report", "link_type":"Page"}
        boot = frappe._dict(home_page="custom-report", docs=[], allowed_workspaces=[{"name":"Selling"}, {"name":"Custom operations"}], workspace_sidebar_item={"custom":{"items":[custom.copy()]}})
        home.extend_bootinfo(boot)
        home.extend_bootinfo(boot)
        self.assertEqual(boot.home_page, "custom-report")
        self.assertEqual(boot.workspace_sidebar_item["custom"]["items"][1], custom)
        self.assertEqual(sum(row.get("link_to") == home.PAGE for row in boot.workspace_sidebar_item["custom"]["items"]), 1)
        links = [row.get("link_to") for row in boot.workspace_sidebar_item["bunood home"]["items"]]
        self.assertIn("Custom operations", links)
        self.assertNotIn("Buying", links)

    def test_existing_named_sidebar_is_not_replaced(self):
        custom = {"type":"Link", "link_type":"Workspace", "link_to":"Selling", "label":"My sales"}
        boot = frappe._dict(home_page="custom-report", docs=[], workspace_sidebar_item={"bunood home":{"items":[custom.copy()]}}, allowed_workspaces=[])
        home.extend_bootinfo(boot)
        self.assertEqual(boot.workspace_sidebar_item["bunood home"]["items"][1], custom)
