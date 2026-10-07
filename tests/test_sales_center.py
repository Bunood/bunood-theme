import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


class SalesCenterTests(unittest.TestCase):
    def setUp(self):
        self.frappe = types.ModuleType("frappe")
        self.frappe._ = lambda value: value
        self.frappe.whitelist = lambda **kwargs: lambda fn: fn
        self.frappe.PermissionError = PermissionError
        self.frappe.throw = lambda message, exc=ValueError: (_ for _ in ()).throw(exc(message))
        self.company = Mock()
        self.frappe.get_doc = Mock(return_value=self.company)
        self.frappe.has_permission = Mock(return_value=True)
        self.frappe.get_list = Mock(return_value=[])
        spec = importlib.util.spec_from_file_location(
            "sales_center_tested", Path(__file__).parents[1] / "bunood_theme/sales_center.py"
        )
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": self.frappe}):
            spec.loader.exec_module(self.module)

    def test_company_permission_precedes_native_rows(self):
        self.company.check_permission.side_effect = PermissionError
        with self.assertRaises(PermissionError):
            self.module.read("Private", "Sales Invoice")
        self.frappe.get_list.assert_not_called()

    def test_no_read_permission_never_queries_rows(self):
        self.frappe.has_permission.return_value = False
        with self.assertRaises(PermissionError):
            self.module.read("Bunood", "Sales Invoice")
        self.frappe.get_list.assert_not_called()

    def test_native_permission_query_is_bounded_and_company_scoped(self):
        self.module.read("Bunood", "Sales Order", state="drafts", search="SO-1", start="25")
        doctype = self.frappe.get_list.call_args.args[0]
        options = self.frappe.get_list.call_args.kwargs
        self.assertEqual(doctype, "Sales Order")
        self.assertEqual(options["filters"], {"company": "Bunood", "docstatus": 0})
        self.assertEqual(options["start"], 25)
        self.assertEqual(options["page_length"], 26)
        self.assertNotIn("ignore_permissions", options)
        self.assertNotIn("ignore_user_permissions", options)
        self.assertEqual(options["or_filters"]["customer"], ["like", "%SO-1%"])

    def test_page_lookahead_has_no_global_count_or_extra_record(self):
        self.frappe.get_list.return_value = [{"name": str(n)} for n in range(26)]
        result = self.module.read("Bunood", "Sales Invoice")
        self.assertEqual(len(result["rows"]), 25)
        self.assertTrue(result["has_more"])
        self.assertNotIn("total_count", result)

    def test_payment_rows_are_customer_receipts_only(self):
        self.module.read("Bunood", "Payment Entry")
        self.assertEqual(self.frappe.get_list.call_args.kwargs["filters"], {
            "company": "Bunood", "party_type": "Customer", "payment_type": "Receive"
        })

    def test_invalid_scope_is_rejected_before_any_query(self):
        for options in ({"doctype": "User"}, {"state": "DROP"}, {"start": "-1"},
                        {"start": True}, {"start": "1.5"}, {"search": "x" * 141}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.module.read("Bunood", **options)
        self.frappe.get_list.assert_not_called()


if __name__ == "__main__":
    unittest.main()
