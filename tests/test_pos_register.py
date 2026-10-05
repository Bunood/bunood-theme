"""Read-only contract tests for the POS receipt union."""

import ast
import json
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).parents[1]


def load_register(fake_frappe):
    source = (ROOT / "bunood_theme" / "pos.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    function = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "receipt_register"
    )
    function.decorator_list = []
    namespace = {
        "Any": object,
        "frappe": fake_frappe,
        "_": lambda text: text,
        "cint": int,
        "nowdate": lambda: "2026-09-28",
        "_json": lambda value, fallback: json.loads(value) if value else fallback,
        "_open_entries": lambda: [],
        "_profile": lambda name: SimpleNamespace(name=name),
    }
    exec(compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])),
                 "pos.py", "exec"), namespace)
    return namespace["receipt_register"]


class POSRegisterTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.records = {
            "POS Invoice": [
                {"name": "POS-002", "posting_date": "2026-09-28", "posting_time": "12:00:00", "creation": "2026-09-28 12:00:00", "is_return": 0},
                {"name": "POS-001", "posting_date": "2026-09-27", "posting_time": "12:00:00", "creation": "2026-09-27 12:00:00", "is_return": 0},
            ],
            "Sales Invoice": [
                {"name": "SINV-RETURN", "posting_date": "2026-09-28", "posting_time": "11:00:00", "creation": "2026-09-28 11:00:00", "is_return": 1},
                {"name": "SINV-OLD", "posting_date": "2026-09-26", "posting_time": "12:00:00", "creation": "2026-09-26 12:00:00", "is_return": 0},
            ],
        }
        self.allowed = {"Company", "POS Invoice", "Sales Invoice"}

        def get_list(doctype, **kwargs):
            self.calls.append((doctype, kwargs))
            if doctype == "Company":
                return [SimpleNamespace(name="Bunood Development")]
            rows = self.records[doctype]
            filters = kwargs["filters"]
            if filters.get("posting_date"):
                rows = [row for row in rows if row["posting_date"] == filters["posting_date"]]
            if filters.get("is_return") is not None:
                rows = [row for row in rows if row["is_return"] == filters["is_return"]]
            offset = kwargs.get("limit_start", 0)
            return rows[offset:offset + kwargs["limit_page_length"]]

        fake = SimpleNamespace(
            get_list=get_list,
            has_permission=lambda doctype, ptype: doctype in self.allowed and ptype == "read",
            get_meta=lambda doctype: SimpleNamespace(has_field=lambda field: field == "is_consolidated"),
            db=SimpleNamespace(exists=lambda doctype, name: True),
            session=SimpleNamespace(user="cashier@example.test"),
            PermissionError=PermissionError,
            throw=lambda message, *args: (_ for _ in ()).throw(ValueError(message)),
        )
        self.register = load_register(fake)

    def test_both_original_types_are_paginated_without_double_counting(self):
        first = self.register(mode="all", limit=2)
        self.assertEqual([row["name"] for row in first["rows"]], ["POS-002", "SINV-RETURN"])
        self.assertEqual(first["next_cursor"], {"POS Invoice": 1, "Sales Invoice": 1})
        second = self.register(mode="all", limit=2, cursor=json.dumps(first["next_cursor"]))
        self.assertEqual([row["name"] for row in second["rows"]], ["POS-001", "SINV-OLD"])
        self.assertIsNone(second["next_cursor"])
        sale_filters = [kwargs["filters"] for doctype, kwargs in self.calls if doctype == "Sales Invoice"]
        self.assertTrue(all(filters["is_consolidated"] == 0 for filters in sale_filters))
        self.assertTrue(all(filters["is_pos"] == 1 and filters["docstatus"] == 1 for filters in sale_filters))

    def test_returns_and_permission_filtering(self):
        self.assertEqual([row["name"] for row in self.register(mode="returns")["rows"]], ["SINV-RETURN"])
        self.allowed.remove("Sales Invoice")
        self.calls.clear()
        self.assertEqual([row["name"] for row in self.register(mode="all")["rows"]], ["POS-002", "POS-001"])
        self.assertNotIn("Sales Invoice", [doctype for doctype, _ in self.calls])

    def test_a_shift_view_without_an_open_shift_says_so(self):
        result = self.register(mode="shift")
        self.assertEqual(result["rows"], [])
        self.assertIs(result["has_open_shift"], False)

    def test_an_unknown_view_or_a_forged_cursor_is_refused(self):
        with self.assertRaises(ValueError):
            self.register(mode="everything")
        with self.assertRaises(ValueError):
            self.register(mode="all", cursor=json.dumps({"POS Invoice": -1}))
        with self.assertRaises(ValueError):
            self.register(mode="all", cursor=json.dumps(["POS Invoice"]))

    def test_sale_history_reads_both_types_for_the_profile(self):
        source = (ROOT / "bunood_theme" / "pos.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        history = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "sale_history")
        history.decorator_list = []
        namespace = {"Any": object, "receipt_register": lambda **kwargs: {"rows": [kwargs]}}
        exec(compile(ast.Module(body=[history], type_ignores=[]), "pos.py", "exec"), namespace)
        rows = namespace["sale_history"]("Counter 1", search_term="Ali", limit=10)
        self.assertEqual(rows, [{"mode": "all", "pos_profile": "Counter 1", "search_term": "Ali", "limit": 10}])

    def test_no_dining_fields_are_read(self):
        source = (ROOT / "bunood_theme" / "pos.py").read_text(encoding="utf-8")
        self.assertNotIn("custom_bunood_service_mode", source)


if __name__ == "__main__":
    unittest.main()
