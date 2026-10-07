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
fake_frappe.utils.flt = lambda value: float(value or 0)
fake_frappe.utils.nowdate = lambda: "2026-09-20"
fake_frappe._ = lambda value: value
fake_frappe.PermissionError = type("PermissionError", (Exception,), {})
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
    banking = importlib.import_module("bunood_theme.banking")

sys.modules.pop("bunood_theme.banking", None)


class Doc(dict):
    def __init__(self, values=None, name=None):
        super().__init__(values or {})
        self.name = name or self.get("name")
        self.permission_checks = []
        self.insert_args = None

    def check_permission(self, permission):
        self.permission_checks.append(permission)

    def insert(self, *args, **kwargs):
        self.insert_args = (args, kwargs)
        if not self.name:
            self.name = "BSI-0001"
        return self


class Database:
    @staticmethod
    def exists(doctype, _name):
        return doctype == "DocType"


class BankingWorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.company = Doc({"default_currency": "SAR"}, name="Bunood Development")
        self.bank = Doc(
            {
                "company": "Bunood Development",
                "is_company_account": 1,
                "disabled": 0,
            },
            name="Riyadh operating",
        )
        self.inserted = []
        self.calls = []

        def get_doc(*args):
            if len(args) == 1 and isinstance(args[0], dict):
                doc = Doc(args[0])
                self.inserted.append(doc)
                return doc
            doctype, name = args
            if doctype == "Company":
                return self.company
            if doctype == "Bank Account":
                self.assertEqual(name, "Riyadh operating")
                return self.bank
            raise AssertionError((doctype, name))

        self.get_doc = get_doc
        self.common = (
            patch.object(banking.frappe, "db", Database(), create=True),
            patch.object(banking.frappe, "has_permission", lambda *_args: True, create=True),
            patch.object(banking.frappe, "get_doc", get_doc, create=True),
            patch.object(
                banking.frappe,
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

    @staticmethod
    def account_row():
        return {
            "name": "Riyadh operating",
            "account_name": "Operating account",
            "bank": "Saudi Bank",
            "mask": "4321",
            "account": "1110 - Bank - BDEV",
        }

    def test_account_choice_is_permission_filtered_and_does_not_expose_identifiers(self):
        def get_list(doctype, **kwargs):
            self.calls.append((doctype, kwargs))
            if doctype == "Bank Account":
                return [self.account_row()]
            if doctype == "Account":
                return [{"name": "1110 - Bank - BDEV", "account_currency": "SAR"}]
            return []

        with patch.object(banking.frappe, "get_list", get_list, create=True):
            result = banking.get_bank_reconciliation_workbench(
                "Bunood Development", from_date="2026-09-01", to_date="2026-09-20"
            )

        self.assertEqual(result["state"], "select-bank-account")
        self.assertEqual(result["bank_accounts"][0]["label"], "Operating account · •••• 4321 · SAR")
        serialized = repr(result)
        self.assertNotIn("iban", serialized.lower())
        self.assertNotIn("account_number", serialized.lower())
        account_call = next(kwargs for doctype, kwargs in self.calls if doctype == "Bank Account")
        self.assertNotIn("iban", account_call["fields"])
        self.assertNotIn("bank_account_no", account_call["fields"])

    def test_open_queue_ageing_and_book_movement_are_evidence_not_approval(self):
        transactions = [
            {
                "name": "BT-1",
                "date": "2026-09-15",
                "status": "Unreconciled",
                "description": "Card settlement",
                "reference_number": "REF-1",
                "transaction_type": "Credit",
                "deposit": 100,
                "withdrawal": 0,
                "allocated_amount": 40,
                "unallocated_amount": 60,
                "party_type": "Customer",
                "party": "Customer A",
            },
            {
                "name": "BT-2",
                "date": "2026-07-01",
                "status": "Unreconciled",
                "description": "Bank charge",
                "reference_number": "REF-2",
                "transaction_type": "Debit",
                "deposit": 0,
                "withdrawal": 20,
                "allocated_amount": 0,
                "unallocated_amount": 20,
                "party_type": "",
                "party": "",
            },
            {
                "name": "BT-3",
                "date": "2026-09-10",
                "status": "Reconciled",
                "description": "Matched deposit",
                "reference_number": "REF-3",
                "transaction_type": "Credit",
                "deposit": 50,
                "withdrawal": 0,
                "allocated_amount": 50,
                "unallocated_amount": 0,
                "party_type": "Customer",
                "party": "Customer B",
            },
        ]

        def get_list(doctype, **kwargs):
            self.calls.append((doctype, kwargs))
            if doctype == "Bank Account":
                return [self.account_row()]
            if doctype == "Account":
                return [{"name": "1110 - Bank - BDEV", "account_currency": "SAR"}]
            if doctype == "Bank Transaction":
                date_filter = kwargs["filters"]["date"]
                return [{"name": "BT-OLD"}] if date_filter[0] == "<" else transactions
            if doctype == "GL Entry":
                return [{"debit": 150, "credit": 20}]
            if doctype == "Bank Statement Import":
                return [{"name": "BSI-1", "status": "Success", "creation": "2026-09-18"}]
            return []

        with patch.object(banking.frappe, "get_list", get_list, create=True):
            result = banking.get_bank_reconciliation_workbench(
                "Bunood Development",
                "Riyadh operating",
                "2026-07-01",
                "2026-09-20",
            )

        self.assertEqual(result["state"], "action-needed")
        self.assertEqual(result["summary"]["statement_net"], 130)
        self.assertEqual(result["summary"]["open_amount"], 80)
        self.assertEqual(result["summary"]["book_net"], 130)
        self.assertEqual(result["summary"]["older_open_count"], 1)
        self.assertEqual(result["ageing"]["0_30"], 1)
        self.assertEqual(result["ageing"]["61_90"], 1)
        self.assertEqual([row["state"] for row in result["queue"]], ["partially-matched", "unmatched"])
        self.assertNotIn("reconciled", result["state"])
        self.assertTrue(all(call[1].get("limit") == 0 or call[0] == "Bank Statement Import" for call in self.calls))

    def test_zero_open_rows_are_not_upgraded_to_reconciliation_approval(self):
        def get_list(doctype, **kwargs):
            if doctype == "Bank Account":
                return [self.account_row()]
            if doctype == "Account":
                return [{"name": "1110 - Bank - BDEV", "account_currency": "SAR"}]
            if doctype == "Bank Transaction" and kwargs["filters"]["date"][0] == "between":
                return [{
                    "name": "BT-1",
                    "date": "2026-09-15",
                    "deposit": 10,
                    "withdrawal": 0,
                    "allocated_amount": 10,
                    "unallocated_amount": 0,
                }]
            return []

        with patch.object(banking.frappe, "get_list", get_list, create=True):
            result = banking.get_bank_reconciliation_workbench(
                "Bunood Development",
                "Riyadh operating",
                "2026-09-01",
                "2026-09-20",
            )

        self.assertEqual(result["state"], "no-open-statement-items")
        self.assertNotIn("approved", repr(result).lower())
        self.assertNotIn("reconciled", result["state"])

    def test_import_handoff_creates_only_a_native_draft_with_current_permissions(self):
        result = banking.prepare_bank_statement_import(
            "Bunood Development", "Riyadh operating"
        )
        self.assertEqual(result["route"], ["Form", "Bank Statement Import", "BSI-0001"])
        self.assertEqual(self.inserted[0]["doctype"], "Bank Statement Import")
        self.assertEqual(self.inserted[0]["bank_account"], "Riyadh operating")
        self.assertEqual(self.inserted[0].insert_args, ((), {}))
        self.assertEqual(self.company.permission_checks, ["read"])
        self.assertEqual(self.bank.permission_checks, ["read"])

    def test_period_is_bounded_and_account_company_mismatch_stands_down(self):
        with self.assertRaisesRegex(RuntimeError, "Maximum reconciliation period"):
            banking.get_bank_reconciliation_workbench(
                "Bunood Development", from_date="2025-01-01", to_date="2026-09-20"
            )
        self.bank["company"] = "Other Company"
        with self.assertRaisesRegex(RuntimeError, "unavailable for the selected company"):
            banking.prepare_bank_statement_import(
                "Bunood Development", "Riyadh operating"
            )


if __name__ == "__main__":
    unittest.main()
