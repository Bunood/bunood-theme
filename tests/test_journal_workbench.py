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
fake_frappe.utils.flt = lambda value: float(value or 0)
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
    journal_workbench = importlib.import_module("bunood_theme.journal_workbench")

sys.modules.pop("bunood_theme.journal_workbench", None)


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


class JournalWorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.company = Doc(
            {"default_currency": "SAR", "default_finance_book": "Primary"},
            name="Bunood Development",
        )
        self.calls = []
        self.common = (
            patch.object(journal_workbench.frappe, "db", Database(), create=True),
            patch.object(journal_workbench.frappe, "has_permission", lambda *_args: True, create=True),
            patch.object(journal_workbench.frappe, "get_doc", lambda *_args: self.company, create=True),
            patch.object(journal_workbench.frappe, "log_error", lambda **_kwargs: None, create=True),
            patch.object(
                journal_workbench.frappe,
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

    def test_unbalanced_draft_and_reversal_remain_distinct_native_states(self):
        def get_list(doctype, **kwargs):
            self.calls.append((doctype, kwargs))
            filters = kwargs.get("filters") or {}
            if doctype == "Journal Entry" and "posting_date" in filters:
                return [
                    {
                        "name": "ACC-JV-1",
                        "posting_date": "2026-09-18",
                        "voucher_type": "Journal Entry",
                        "docstatus": 0,
                        "total_debit": 100,
                        "total_credit": 90,
                        "difference": 10,
                        "from_template": "Monthly accrual",
                    },
                    {
                        "name": "ACC-JV-2",
                        "posting_date": "2026-09-17",
                        "voucher_type": "Journal Entry",
                        "docstatus": 1,
                        "total_debit": 100,
                        "total_credit": 100,
                        "difference": 0,
                        "reversal_of": "ACC-JV-OLD",
                    },
                ]
            if doctype == "Journal Entry Template":
                return [{"name": "Monthly accrual", "template_title": "Monthly accrual"}]
            if doctype == "Auto Repeat":
                return [
                    {"name": "AUT-1", "reference_document": "ACC-JV-1", "frequency": "Monthly"},
                    {"name": "AUT-2", "reference_document": "OTHER-COMPANY", "frequency": "Monthly"},
                ]
            if doctype == "Journal Entry" and "name" in filters:
                return [{"name": "ACC-JV-1"}]
            return []

        with patch.object(journal_workbench.frappe, "get_list", get_list, create=True):
            result = journal_workbench.get_journal_workbench(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertEqual(result["state"], "attention-needed")
        self.assertEqual(result["summary"]["draft"], 1)
        self.assertEqual(result["summary"]["submitted"], 1)
        self.assertEqual(result["summary"]["unbalanced_draft"], 1)
        self.assertEqual(result["summary"]["reversal"], 1)
        self.assertEqual(result["journals"][0]["state"], "unbalanced-draft")
        self.assertEqual(result["journals"][0]["source"], "template")
        self.assertEqual(result["journals"][1]["state"], "submitted-reversal")
        self.assertEqual([row["name"] for row in result["schedules"]], ["AUT-1"])
        self.assertEqual(self.company.permission_checks, ["read"])

    def test_balanced_draft_is_review_required_not_approved(self):
        def get_list(doctype, **kwargs):
            if doctype == "Journal Entry" and "posting_date" in (kwargs.get("filters") or {}):
                return [{
                    "name": "ACC-JV-3",
                    "posting_date": "2026-09-20",
                    "docstatus": 0,
                    "total_debit": 75,
                    "total_credit": 75,
                    "difference": 0,
                }]
            return []

        with patch.object(journal_workbench.frappe, "get_list", get_list, create=True):
            result = journal_workbench.get_journal_workbench(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertEqual(result["state"], "review-required")
        self.assertEqual(result["journals"][0]["state"], "draft-review")
        self.assertNotIn("approved", repr(result).lower())
        self.assertNotIn("complete", repr(result).lower())

    def test_truncation_and_query_failure_fail_closed(self):
        rows = [
            {
                "name": f"ACC-JV-{index}",
                "posting_date": "2026-09-20",
                "docstatus": 1,
                "total_debit": 1,
                "total_credit": 1,
                "difference": 0,
            }
            for index in range(journal_workbench.QUERY_LIMIT)
        ]

        def get_list(doctype, **kwargs):
            if doctype == "Journal Entry" and "posting_date" in (kwargs.get("filters") or {}):
                return rows
            if doctype == "Journal Entry Template":
                raise ValueError("query stood down")
            return []

        with patch.object(journal_workbench.frappe, "get_list", get_list, create=True):
            result = journal_workbench.get_journal_workbench(
                "Bunood Development", "2026-09-01", "2026-09-20"
            )

        self.assertEqual(result["state"], "incomplete-evidence")
        self.assertTrue(result["evidence_truncated"])
        self.assertEqual(result["query_errors"], ["Journal Entry Template"])
        self.assertEqual(result["summary"]["observed"], journal_workbench.QUERY_LIMIT - 1)
        self.assertEqual(len(result["journals"]), journal_workbench.DISPLAY_LIMIT)

    def test_period_is_bounded(self):
        with patch.object(journal_workbench.frappe, "get_list", lambda *_args, **_kwargs: [], create=True):
            with self.assertRaisesRegex(RuntimeError, "Maximum journal review period"):
                journal_workbench.get_journal_workbench(
                    "Bunood Development", "2026-01-01", "2026-09-20"
                )

    def test_missing_journal_read_permission_is_incomplete_not_empty_success(self):
        def permission(doctype, permission):
            return not (doctype == "Journal Entry" and permission == "read")

        with patch.object(journal_workbench.frappe, "has_permission", permission, create=True):
            with patch.object(journal_workbench.frappe, "get_list", lambda *_args, **_kwargs: [], create=True):
                result = journal_workbench.get_journal_workbench(
                    "Bunood Development", "2026-09-01", "2026-09-20"
                )

        self.assertEqual(result["state"], "incomplete-evidence")
        self.assertEqual(result["query_errors"], ["Journal Entry"])
        self.assertFalse(result["capabilities"]["can_read_journal"])


if __name__ == "__main__":
    unittest.main()
