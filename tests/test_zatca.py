import importlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


def load_module():
    fake = types.ModuleType("frappe")
    fake.whitelist = lambda *args, **kwargs: lambda fn: fn
    fake._ = lambda value: value
    fake.PermissionError = PermissionError
    # Each isolated source-loader test owns its fake.  ``setdefault`` leaked a
    # different test module's partial frappe stub when unittest discovered the
    # whole suite in one process, making otherwise independent tests order
    # dependent.
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "zatca" / "status.py"
    spec = importlib.util.spec_from_file_location("bunood_zatca_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ZatcaStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zatca = load_module()

    def state(self, **changes):
        values = dict(
            installed=True,
            settings_exists=True,
            enabled=True,
            compliance_ready=True,
            production_ready=True,
        )
        values.update(changes)
        return self.zatca.classify_status(**values)

    def test_setup_is_progressive_and_sandbox_safe(self):
        self.assertEqual(self.state(installed=False), "missing_app")
        self.assertEqual(self.state(settings_exists=False), "needs_settings")
        self.assertEqual(self.state(enabled=False), "disabled")
        self.assertEqual(self.state(compliance_ready=False), "needs_onboarding")
        self.assertEqual(self.state(production_ready=False), "needs_csid")
        self.assertEqual(self.state(), "ready")

    def test_invoice_states_do_not_hide_warnings_or_rejections(self):
        self.assertEqual(self.state(submitted=True), "preparing")
        self.assertEqual(self.state(invoice_status="Ready For Batch", submitted=True), "ready_to_send")
        self.assertEqual(self.state(invoice_status="Accepted"), "accepted")
        self.assertEqual(self.state(invoice_status="Duplicate"), "duplicate_response")
        self.assertEqual(self.state(invoice_status="Accepted with warnings"), "accepted_with_warnings")
        self.assertEqual(self.state(invoice_status="Rejected"), "rejected")
        self.assertEqual(self.state(invoice_status="Clearance switched off"), "clearance_off")

    def test_virtual_connector_fields_are_never_selected_from_sql(self):
        class Field:
            def __init__(self, is_virtual=False):
                self.is_virtual = is_virtual

        class Meta:
            fields = {
                "integration_status": Field(),
                "qr_image_src": Field(is_virtual=True),
                "invoice_xml": Field(),
            }

            def get_field(self, name):
                return self.fields.get(name)

        self.assertEqual(
            self.zatca._stored_fields(
                Meta(), ["integration_status", "qr_image_src", "missing", "invoice_xml"]
            ),
            ["integration_status", "invoice_xml"],
        )

    def test_pos_lookup_uses_its_own_invoice_doctype(self):
        fake = self.zatca.frappe
        original_db = getattr(fake, "db", None)
        original_meta = getattr(fake, "get_meta", None)
        original_all = getattr(fake, "get_all", None)
        try:
            fake.db = types.SimpleNamespace(table_exists=Mock(return_value=True))
            fake.get_meta = lambda name: types.SimpleNamespace(
                get_field=lambda field: types.SimpleNamespace(is_virtual=False),
            )
            fake.get_all = Mock(return_value=[])
            self.assertEqual(self.zatca._invoice_record("POS-1", "POS Invoice"), {})
            self.assertEqual(fake.get_all.call_args.kwargs["filters"]["invoice_doctype"], "POS Invoice")
        finally:
            for name, value in (("db", original_db), ("get_meta", original_meta), ("get_all", original_all)):
                if value is None:
                    delattr(fake, name)
                else:
                    setattr(fake, name, value)

    def test_workspace_denies_other_roles_and_inaccessible_companies(self):
        fake = self.zatca.frappe
        deny = lambda message, exception=PermissionError: (_ for _ in ()).throw(exception(message))
        with patch.object(fake, "get_roles", return_value=["Sales User"], create=True), \
             patch.object(fake, "throw", side_effect=deny, create=True):
            with self.assertRaisesRegex(PermissionError, "ZATCA workspace"):
                self.zatca.get_workspace("ACME")
        with patch.object(fake, "get_roles", return_value=["Accounts User"], create=True), \
             patch.object(fake, "get_list", return_value=[types.SimpleNamespace(name="ACME")], create=True), \
             patch.object(fake, "throw", side_effect=deny, create=True):
            with self.assertRaisesRegex(PermissionError, "this company"):
                self.zatca.get_workspace("OTHER")

    def test_workspace_hides_settings_route_without_connector_permission(self):
        fake = self.zatca.frappe
        status = {"installed": True, "settings": {"name": "SECRET-SETTINGS", "route": ["Form", "ZATCA Business Settings", "SECRET-SETTINGS"]}}
        with patch.object(fake, "get_roles", return_value=["Accounts User"], create=True), \
             patch.object(fake, "get_list", return_value=[types.SimpleNamespace(name="ACME")], create=True), \
             patch.object(fake, "defaults", types.SimpleNamespace(get_user_default=lambda key: "ACME"), create=True), \
             patch.object(fake, "db", types.SimpleNamespace(table_exists=lambda doctype: True), create=True), \
             patch.object(fake, "has_permission", return_value=False, create=True), \
             patch.object(self.zatca, "get_status", return_value=status), \
             patch.object(self.zatca, "_recent_evidence", side_effect=AssertionError("must not query restricted evidence")):
            result = self.zatca.get_workspace()
        self.assertEqual(result["company"], "ACME")
        self.assertEqual(result["status"]["settings"]["route"], [])
        self.assertEqual(result["status"]["settings"]["name"], "")
        self.assertEqual(result["evidence"], [])

    def test_recent_evidence_is_scoped_to_permitted_sales_and_pos_invoices(self):
        fake = self.zatca.frappe

        class Row(dict):
            __getattr__ = dict.__getitem__

        class Meta:
            def get_field(self, name):
                return types.SimpleNamespace(is_virtual=False) if name in {"invoice_doctype", "integration_status", "invoice_type_code", "is_latest"} else None

        observed = []

        def get_list(doctype, **kwargs):
            observed.append((doctype, kwargs.get("filters")))
            if doctype == "Sales Invoice":
                return [Row(name="SAME-NAME")]
            if doctype == "POS Invoice":
                return [Row(name="SAME-NAME")]
            return [Row(name="REC-1", sales_invoice="SAME-NAME", creation="2026-09-29 10:00:00",
                        integration_status="Accepted", invoice_type_code="388")]

        with patch.object(fake, "db", types.SimpleNamespace(table_exists=lambda doctype: True), create=True), \
             patch.object(fake, "has_permission", return_value=True, create=True), \
             patch.object(fake, "get_meta", return_value=Meta(), create=True), \
             patch.object(fake, "get_list", side_effect=get_list, create=True):
            result = self.zatca._recent_evidence("ACME")
        self.assertEqual({row["doctype"] for row in result}, {"Sales Invoice", "POS Invoice"})
        native_filters = [filters for doctype, filters in observed if doctype == "Sales Invoice Additional Fields"]
        self.assertEqual({filters["invoice_doctype"] for filters in native_filters}, {"Sales Invoice", "POS Invoice"})
        self.assertTrue(all(filters["sales_invoice"] == ["in", ["SAME-NAME"]] for filters in native_filters))

    def test_the_module_is_read_only(self):
        source = (Path(__file__).parents[1] / "bunood_theme" / "zatca" / "status.py").read_text(encoding="utf-8")
        for absent in ("queue_invoice", "submit_invoice", "submit_to_zatca", "enqueue", "can_queue",
                       'whitelist(methods=["POST"])'):
            self.assertNotIn(absent, source)
        self.assertEqual(source.count("@frappe.whitelist("), 1, "get_workspace is the one endpoint")
        self.assertIn('@frappe.whitelist(methods=["GET"])\ndef get_workspace(', source)


if __name__ == "__main__":
    unittest.main()
