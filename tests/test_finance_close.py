import importlib
from datetime import date
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parents[1]))

fake_frappe = types.ModuleType("frappe")
fake_frappe.utils = types.ModuleType("frappe.utils")
fake_frappe.utils.getdate = lambda value: value if isinstance(value, date) else date.fromisoformat(str(value))
fake_frappe.utils.date_diff = lambda end, start: (fake_frappe.utils.getdate(end) - fake_frappe.utils.getdate(start)).days
fake_frappe.utils.nowdate = lambda: "2026-09-20"
fake_frappe.utils.now_datetime = lambda: "2026-09-20 12:00:00"
fake_frappe._ = lambda value: value
fake_package = types.ModuleType("bunood_theme")
fake_package.__path__ = [str(Path(__file__).parents[1] / "bunood_theme")]

with patch.dict(
    sys.modules,
    {
        "frappe": fake_frappe,
        "frappe.utils": fake_frappe.utils,
        "bunood_theme": fake_package,
    },
):
    finance_close = importlib.import_module("bunood_theme.finance_close")

sys.modules.pop("bunood_theme.finance_close", None)


class Doc(dict):
    def __init__(self, values=None, name=None):
        super().__init__(values or {})
        self.name = name or self.get("name")
        self.permission_checks = []

    def check_permission(self, permission):
        self.permission_checks.append(permission)


class Database:
    @staticmethod
    def exists(doctype, _name):
        return doctype == "DocType"


class FinanceCloseTests(unittest.TestCase):
    def setUp(self):
        self.company = Doc(
            {
                "default_currency": "SAR",
                "default_finance_book": "Primary",
                "accounts_frozen_till_date": None,
            },
            name="Bunood Development",
        )
        self.calls = []
        self.common = (
            patch.object(finance_close.frappe, "db", Database(), create=True),
            patch.object(finance_close.frappe, "has_permission", lambda *_args: True, create=True),
            patch.object(finance_close.frappe, "get_doc", lambda *_args: self.company, create=True),
            patch.object(finance_close.frappe, "log_error", lambda **_kwargs: None, create=True),
            patch.object(
                finance_close.frappe,
                "throw",
                lambda message, *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(message)),
                create=True,
            ),
        )
        for item in self.common:
            item.start()

    def tearDown(self):
        for item in reversed(self.common):
            item.stop()

    def test_drafts_and_failed_native_voucher_are_attention_not_close_state(self):
        def get_list(doctype, **kwargs):
            self.calls.append((doctype, kwargs))
            if doctype == "Journal Entry":
                return [{"name": "ACC-JV-1", "posting_date": "2026-09-18", "modified": "2026-09-18"}]
            if doctype == "Sales Invoice":
                return [{"name": "SINV-1", "posting_date": "2026-09-17", "modified": "2026-09-17"}]
            if doctype == "Period Closing Voucher":
                return [{
                    "name": "ACC-PCV-1",
                    "docstatus": 1,
                    "period_start_date": "2026-09-01",
                    "period_end_date": "2026-09-30",
                    "gle_processing_status": "Failed",
                }]
            return []

        with patch.object(finance_close.frappe, "get_list", get_list, create=True):
            result = finance_close.get_finance_close_cockpit(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertEqual(result["state"], "attention-needed")
        self.assertEqual(result["summary"]["draft_source_count"], 2)
        self.assertEqual(result["summary"]["attention_count"], 3)
        self.assertEqual(result["summary"]["submitted_closing_voucher_count"], 1)
        self.assertNotIn("complete", repr(result).lower())
        self.assertNotIn("approved", repr(result).lower())
        self.assertTrue(all(call[1].get("limit") in (0, 20) for call in self.calls))

    def test_native_period_and_freeze_are_observations_not_accounting_acceptance(self):
        self.company["accounts_frozen_till_date"] = "2026-09-30"

        def get_list(doctype, **_kwargs):
            if doctype == "Accounting Period":
                return [{
                    "name": "September close",
                    "start_date": "2026-09-01",
                    "end_date": "2026-09-30",
                    "exempted_role": "Accounts Manager",
                }]
            return []

        with patch.object(finance_close.frappe, "get_list", get_list, create=True):
            result = finance_close.get_finance_close_cockpit(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertEqual(result["state"], "protection-present")
        self.assertTrue(result["controls"]["frozen_through_period"])
        self.assertTrue(result["controls"]["accounting_period_covers_period"])
        self.assertFalse(result["controls"]["closing_voucher_covers_period"])
        self.assertEqual(self.company.permission_checks, ["read"])

    def test_closing_voucher_does_not_masquerade_as_a_lock(self):
        def get_list(doctype, **_kwargs):
            if doctype == "Period Closing Voucher":
                return [{
                    "name": "ACC-PCV-2",
                    "docstatus": 1,
                    "period_start_date": "2026-09-01",
                    "period_end_date": "2026-09-30",
                    "gle_processing_status": "Completed",
                }]
            return []

        with patch.object(finance_close.frappe, "get_list", get_list, create=True):
            result = finance_close.get_finance_close_cockpit(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertTrue(result["controls"]["closing_voucher_covers_period"])
        self.assertFalse(result["controls"]["protection_present"])
        self.assertEqual(result["state"], "review-required")

    def test_query_failure_remains_unknown_and_period_is_bounded(self):
        def get_list(doctype, **_kwargs):
            if doctype == "Payment Entry":
                raise ValueError("database stood down")
            return []

        with patch.object(finance_close.frappe, "get_list", get_list, create=True):
            result = finance_close.get_finance_close_cockpit(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )
        self.assertEqual(result["state"], "incomplete-evidence")
        self.assertEqual(result["query_errors"], ["Payment Entry"])

        with self.assertRaisesRegex(RuntimeError, "Maximum close review period"):
            finance_close.get_finance_close_cockpit(
                "Bunood Development", "2025-01-01", "2026-09-20"
            )


if __name__ == "__main__":
    unittest.main()
