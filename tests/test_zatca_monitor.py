"""Pure checks for the read-only ZATCA monitor contract."""

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
    fake.ValidationError = ValueError
    fake.throw = lambda message, exception=ValueError: (_ for _ in ()).throw(exception(message))
    sys.modules["frappe"] = fake
    # Isolated source loading avoids importing the full Frappe app initializer.
    package = types.ModuleType("bunood_theme")
    package.__path__ = []
    subpackage = types.ModuleType("bunood_theme.zatca")
    subpackage.__path__ = []
    status = types.ModuleType("bunood_theme.zatca.status")
    status.INVOICE_DOCTYPES = {"Sales Invoice", "POS Invoice"}
    status.WORKSPACE_ROLES = {"Accounts User", "Accounts Manager", "Auditor", "System Manager"}
    status._stored_fields = lambda meta, names: [name for name in names if meta.get_field(name)]
    path = Path(__file__).parents[1] / "bunood_theme" / "zatca" / "monitor.py"
    spec = importlib.util.spec_from_file_location("bunood_zatca_monitor_test", path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"bunood_theme": package, "bunood_theme.zatca": subpackage,
                                  "bunood_theme.zatca.status": status}):
        spec.loader.exec_module(module)
    return module


class MonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.monitor = load_module()

    def context(self):
        fake = self.monitor.frappe
        fake.get_roles = lambda: ["Accounts User"]
        fake.get_list = lambda *args, **kwargs: [{"name": "ACME"}]
        fake.get_doc = lambda *args, **kwargs: types.SimpleNamespace(check_permission=lambda action: None)
        fake.db = types.SimpleNamespace(table_exists=lambda doctype: True)
        fake.has_permission = lambda doctype, action: True
        return fake

    def test_rejects_other_roles_and_inaccessible_companies(self):
        fake = self.context()
        fake.get_roles = lambda: ["Sales User"]
        with self.assertRaises(PermissionError):
            self.monitor.list_invoices("ACME")
        fake.get_roles = lambda: ["Accounts User"]
        fake.get_list = lambda *args, **kwargs: []
        with self.assertRaises(PermissionError):
            self.monitor.list_invoices("OTHER")

    def test_accounting_reader_can_use_safe_status_facade_without_native_evidence_role(self):
        fake = self.context()
        fake.has_permission = lambda doctype, action: doctype != "Sales Invoice Additional Fields"
        with patch.object(self.monitor, "_invoice_batch", return_value=[]):
            result = self.monitor.list_invoices("ACME")
        self.assertEqual(result["rows"], [])
        self.assertTrue(result["evidence_available"])

    def test_evidence_query_is_pinned_to_visible_invoices_and_safe_fields(self):
        fake = self.context()
        fake.has_permission = lambda doctype, action: False
        fake.get_meta = lambda name: types.SimpleNamespace(get_field=lambda field: types.SimpleNamespace(is_virtual=False))
        observed = []
        class Row(dict):
            __getattr__ = dict.get
        def get_all(doctype, **kwargs):
            observed.append(kwargs)
            return [Row(name="E1", sales_invoice="INV-1", integration_status="Rejected")]
        fake.get_all = get_all
        result = self.monitor._evidence([{"doctype": "Sales Invoice", "name": "INV-1"}])
        self.assertEqual(result[("Sales Invoice", "INV-1")]["integration_status"], "Rejected")
        self.assertEqual(observed[0]["filters"]["sales_invoice"], ["in", ["INV-1"]])
        self.assertEqual(observed[0]["filters"]["invoice_doctype"], "Sales Invoice")
        self.assertNotIn("secret", observed[0]["fields"])
        self.assertNotIn("invoice_xml", observed[0]["fields"])

    def test_cursor_does_not_skip_same_named_sales_and_pos_invoices(self):
        self.context()
        rows = [
            {"creation": "2026-09-30 10:00:00", "name": "SAME", "doctype": "Sales Invoice", "grand_total": 10},
            {"creation": "2026-09-30 10:00:00", "name": "SAME", "doctype": "POS Invoice", "grand_total": 20},
            {"creation": "2026-09-29 10:00:00", "name": "OLDER", "doctype": "Sales Invoice", "grand_total": 30},
        ]

        def batch(doctype, company, cursor, limit, *_):
            eligible = (row for row in rows if row["doctype"] == doctype)
            return [row for row in eligible if not cursor or self.monitor._key(row) <
                    (cursor["created"], cursor["name"], cursor["doctype"])][:limit]

        with patch.object(self.monitor, "_invoice_batch", side_effect=batch), \
             patch.object(self.monitor, "_evidence", return_value={}):
            first = self.monitor.list_invoices("ACME", page_size=2)
            second = self.monitor.list_invoices("ACME", page_size=2, cursor=first["next_cursor"])
        self.assertEqual([(r["doctype"], r["name"]) for r in first["rows"]],
                         [("Sales Invoice", "SAME"), ("POS Invoice", "SAME")])
        self.assertEqual([(r["doctype"], r["name"]) for r in second["rows"]],
                         [("Sales Invoice", "OLDER")])
        self.assertIsNone(second["next_cursor"])

    def test_attention_includes_warning_rejection_duplicate_pending_and_missing(self):
        self.context()
        statuses = ["Accepted", "Accepted with warnings", "Rejected", "Duplicate", "Ready For Batch", None]
        rows = [{"creation": f"2026-09-{30 - index:02d} 10:00:00", "name": str(index),
                 "doctype": "Sales Invoice"} for index in range(len(statuses))]
        records = {("Sales Invoice", str(index)): {"integration_status": status}
                   for index, status in enumerate(statuses) if status}
        with patch.object(self.monitor, "_invoice_batch", side_effect=lambda doctype, *args: rows if doctype == "Sales Invoice" else []), \
             patch.object(self.monitor, "_evidence", return_value=records):
            result = self.monitor.list_invoices("ACME", state="attention", page_size=25)
        self.assertEqual([row["name"] for row in result["rows"]], ["1", "2", "3", "4", "5"])

    def test_native_query_keeps_company_scope_and_equal_timestamp_tie(self):
        fake = self.context()
        observed = []
        fake.get_meta = lambda doctype: types.SimpleNamespace(get_field=lambda field: None)

        def get_list(doctype, **kwargs):
            observed.append(kwargs)
            return []

        fake.get_list = get_list
        self.monitor._invoice_batch("POS Invoice", "ACME", {
            "created": "2026-09-30 10:00:00.000000", "name": "SAME", "doctype": "Sales Invoice",
        }, 10, "2026-09-01", "2026-09-30")
        self.assertEqual(observed[0]["filters"]["company"], "ACME")
        self.assertEqual(observed[0]["filters"]["docstatus"], 1)
        self.assertEqual(observed[0]["filters"]["name"], ["<=", "SAME"])
        self.assertEqual(observed[0]["filters"]["posting_date"],
                         ["between", ["2026-09-01", "2026-09-30"]])

    def test_invalid_filters_and_cursor_are_rejected(self):
        self.context()
        with self.assertRaises(ValueError):
            self.monitor.list_invoices("ACME", state="unknown")
        with self.assertRaises(ValueError):
            self.monitor.list_invoices("ACME", invoice_doctype="Purchase Invoice")
        with self.assertRaises(ValueError):
            self.monitor.list_invoices("ACME", cursor="not a cursor")

    def test_detail_requires_invoice_read_access_before_evidence_lookup(self):
        fake = self.context()
        denied = Mock(side_effect=PermissionError("invoice read denied"))
        fake.get_doc = lambda *args, **kwargs: types.SimpleNamespace(check_permission=denied)
        with patch.object(self.monitor, "_evidence", side_effect=AssertionError("must not read evidence")):
            with self.assertRaisesRegex(PermissionError, "invoice read denied"):
                self.monitor.get_invoice_detail("POS Invoice", "POS-1")
        denied.assert_called_once_with("read")

    def test_detail_selects_only_safe_metadata_and_not_signed_payload(self):
        fake = self.context()
        fake.get_doc = lambda *args: types.SimpleNamespace(company="ACME", check_permission=lambda action: None)
        fake.get_meta = lambda name: types.SimpleNamespace(get_field=lambda field: types.SimpleNamespace(is_virtual=False))
        fake.db = types.SimpleNamespace(table_exists=lambda doctype: doctype != "ZATCA Integration Log")
        selected = []

        def get_list(doctype, **kwargs):
            if doctype == "Company":
                return [{"name": "ACME"}]
            return []
        def get_all(doctype, **kwargs):
            selected.extend(kwargs["fields"])
            return [{"name": "EVIDENCE", "uuid": "U1", "validation_errors": "An error"}]

        fake.get_list = get_list
        fake.get_all = get_all
        with patch.object(self.monitor, "_evidence", return_value={
            ("Sales Invoice", "INV-1"): {"name": "EVIDENCE", "integration_status": "Rejected"}
        }):
            detail = self.monitor.get_invoice_detail("Sales Invoice", "INV-1")
        self.assertEqual(detail["state"], "rejected")
        self.assertNotIn("invoice_xml", selected)
        self.assertNotIn("secret", selected)
        self.assertNotIn("security_token", selected)

    def test_diagnostic_redacts_tokens_and_raw_documents(self):
        safe = self.monitor._safe_diagnostic('code=400, "secret": "private-value", Authorization: Bearer abc123', 2000)
        self.assertNotIn("private-value", safe)
        self.assertNotIn("abc123", safe)
        self.assertIn("code=400", safe)
        self.assertNotIn("<Invoice", self.monitor._safe_diagnostic("<Invoice>customer data</Invoice>", 2000))


if __name__ == "__main__":
    unittest.main()
