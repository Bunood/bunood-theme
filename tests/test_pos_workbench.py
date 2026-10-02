import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class POSWorkbenchContractTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "bunood_theme" / "pos.py").read_text(encoding="utf-8")
        self.tree = ast.parse(self.source)

    def decorators_for(self, function_name):
        function = next(
            node
            for node in self.tree.body
            if isinstance(node, ast.FunctionDef) and node.name == function_name
        )
        return function.decorator_list

    def test_every_public_mutation_is_declared_post_only(self):
        for name in ("open_shift", "preview_cart", "hold_cart", "checkout", "create_return"):
            decorators = self.decorators_for(name)
            self.assertTrue(
                any(
                    isinstance(item, ast.Call)
                    and isinstance(item.func, ast.Attribute)
                    and item.func.attr == "whitelist"
                    and any(
                        keyword.arg == "methods"
                        and ast.literal_eval(keyword.value) == ["POST"]
                        for keyword in item.keywords
                    )
                    for item in decorators
                ),
                name,
            )

    def test_native_document_engine_remains_authoritative(self):
        self.assertIn('doc.run_method("set_missing_values")', self.source)
        self.assertIn('doc.run_method("calculate_taxes_and_totals")', self.source)
        self.assertIn("doc.submit()", self.source)
        self.assertIn("make_sales_return", self.source)
        self.assertNotIn("frappe.db.sql", self.source)
        commercial_paths = self.source.split("def ensure_pos_reference_field", 1)[0]
        self.assertNotIn("ignore_permissions=True", commercial_paths)

    def test_inputs_are_bounded_before_native_document_creation(self):
        self.assertIn("MAX_CART_LINES = 200", self.source)
        self.assertIn("MAX_PAGE_LENGTH = 60", self.source)
        self.assertIn("[:140]", self.source)
        self.assertIn("if len(items) > MAX_CART_LINES", self.source)
        self.assertIn("if not number.is_finite()", self.source)

    def test_payment_reference_field_is_non_financial_and_installed_idempotently(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        # Integration v0.48.0: held -- present once, in ensure_pos_retail only.
        self.assertEqual(setup.count("ensure_pos_reference_field()"), 1)
        self.assertIn("ensure_pos_reference_field()", setup.split("def ensure_pos_retail")[1])
        self.assertIn('fieldname = "custom_bunood_reference_no"', self.source)
        self.assertIn('"fieldtype": "Data"', self.source)
        self.assertIn('frappe.db.get_value(\n        "Custom Field"', self.source)

    def test_only_explicitly_held_native_drafts_are_resumable(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        # Integration v0.48.0: held -- present once, in ensure_pos_retail only.
        self.assertEqual(setup.count("ensure_pos_hold_field()"), 1)
        self.assertIn("ensure_pos_hold_field()", setup.split("def ensure_pos_retail")[1])
        self.assertIn('HELD_FIELD = "custom_bunood_is_held"', self.source)
        self.assertIn('doc.set(HELD_FIELD, 1)', self.source)
        self.assertIn('doc.set(HELD_FIELD, 0)', self.source)
        self.assertIn('HELD_FIELD: 1', self.source)
        self.assertIn('not cint(doc.get(HELD_FIELD))', self.source)

    def test_outdated_opening_entries_are_never_treated_as_sellable_shifts(self):
        self.assertIn("def _stale_entries()", self.source)
        self.assertIn("getdate(row.period_start_date) == today", self.source)
        self.assertIn("getdate(row.period_start_date) != today", self.source)
        self.assertIn('"stale_opening_entry"', self.source)


if __name__ == "__main__":
    unittest.main()
