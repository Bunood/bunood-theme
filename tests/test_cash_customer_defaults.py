"""Unit coverage for the site-wide, vacancy-only walk-in customer setup."""

import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


MODULE = Path(__file__).parents[1] / "bunood_theme" / "cash_customer.py"


class FakeDatabase:
    def __init__(self):
        self.customer = None
        self.disabled_customer = False
        self.company_count = 1
        self.defaults = {}
        self.profiles = {"configured": "Named Customer", "empty": None}
        self.writes = []

    def exists(self, doctype, name):
        if doctype == "DocType":
            return True
        if doctype == "Customer Group":
            return name == "Individual"
        if doctype == "Territory":
            return name == "All Territories"
        if doctype == "Property Setter":
            return (name["doc_type"], name["field_name"]) in self.defaults
        if doctype == "Customer":
            return self.customer or self.disabled_customer
        return False

    def get_value(self, doctype, filters, field):
        if doctype == "Customer":
            return self.customer
        raise AssertionError(doctype)

    def count(self, doctype):
        if doctype == "Company":
            return self.company_count
        raise AssertionError(doctype)

    def set_value(self, doctype, name, field, value):
        self.writes.append((doctype, name, field, value))
        self.profiles[name] = value


class CashCustomerDefaultsTests(unittest.TestCase):
    def load_module(self, db):
        frappe = types.ModuleType("frappe")
        frappe.db = db
        frappe.clear_cache = lambda **_kwargs: None
        frappe.get_meta = lambda doctype: types.SimpleNamespace(
            get_field=lambda field: types.SimpleNamespace(
                default=db.defaults.get((doctype, field))
            )
        )
        frappe.make_property_setter = lambda args, **_kwargs: db.defaults.__setitem__(
            (args["doctype"], args["fieldname"]), args["value"]
        )
        frappe.get_all = lambda doctype, **_kwargs: [
            name for name, customer in db.profiles.items() if not customer
        ]

        def new_doc(doctype):
            self.assertEqual(doctype, "Customer")
            doc = types.SimpleNamespace(name=None)

            def insert(**_kwargs):
                doc.name = "CUST-00001"  # A site using a naming series.
                db.customer = doc.name

            doc.insert = insert
            return doc

        frappe.new_doc = new_doc
        spec = importlib.util.spec_from_file_location("cash_customer_under_test", MODULE)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": frappe}):
            spec.loader.exec_module(module)
        return module

    def test_uses_actual_customer_id_and_is_idempotent(self):
        db = FakeDatabase()
        module = self.load_module(db)
        self.assertEqual(module.ensure_cash_customer_defaults(), "CUST-00001")
        self.assertEqual(module.ensure_cash_customer_defaults(), "CUST-00001")
        self.assertEqual(db.defaults[("Sales Invoice", "customer")], "CUST-00001")
        self.assertEqual(db.defaults[("POS Profile", "customer")], "CUST-00001")
        self.assertEqual(db.profiles["configured"], "Named Customer")
        self.assertEqual(db.profiles["empty"], "CUST-00001")
        self.assertEqual(len(db.writes), 1)

    def test_existing_invoice_default_is_not_replaced(self):
        db = FakeDatabase()
        db.defaults[("Sales Invoice", "customer")] = "Existing Customer"
        module = self.load_module(db)
        module.ensure_cash_customer_defaults()
        self.assertEqual(db.defaults[("Sales Invoice", "customer")], "Existing Customer")

    def test_waits_for_first_company(self):
        db = FakeDatabase()
        db.company_count = 0
        module = self.load_module(db)
        self.assertIsNone(module.ensure_cash_customer_defaults())
        self.assertIsNone(db.customer)

    def test_does_not_recreate_a_disabled_walk_in_customer(self):
        db = FakeDatabase()
        db.disabled_customer = True
        module = self.load_module(db)
        self.assertIsNone(module.ensure_cash_customer_defaults())
        self.assertIsNone(db.customer)
        self.assertEqual(db.defaults, {})


if __name__ == "__main__":
    unittest.main()
