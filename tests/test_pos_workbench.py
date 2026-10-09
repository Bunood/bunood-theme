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

    def test_a_line_discount_reaches_the_rate_erpnext_charges(self):
        # ERPNext derives a rate from discount_percentage only when the rate is
        # empty, and every counter line carries one: before this, a 10% discount
        # previewed and posted at full price.
        apply_cart = self.source.split("def _apply_cart", 1)[1].split("\ndef ", 1)[0]
        self.assertIn('child = doc.append("items", row)', apply_cart)
        self.assertIn(
            'child.rate = flt(flt(child.price_list_rate) * (1 - discount / 100), child.precision("rate"))',
            apply_cart,
        )
        self.assertIn("child.discount_percentage = discount", apply_cart)
        self.assertIn("if discount < 0 or discount > 100:", apply_cart)
        self.assertIn("if profile.allow_discount_change and raw.get(\"discount_percentage\")", apply_cart)
        self.assertNotIn('row["discount_percentage"]', apply_cart)

    def test_every_profile_group_is_sellable_not_only_the_first(self):
        # get_parent_item_group() answers the profile's FIRST group; starting a
        # lookup there hid, and refused at checkout, items filed under the others.
        self.assertNotIn("get_parent_item_group", self.source)
        self.assertIn('return get_root_of("Item Group")', self.source)
        self.assertIn("group = item_group or _catalog_root()", self.source)
        native = self.source.split("def _native_catalog_item", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("_catalog_root(),", native)

    def test_vat_rows_reach_the_counter_for_display_only(self):
        taxes = self.source.split("def _profile_taxes", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("frappe.get_all(", taxes)
        self.assertIn('"Sales Taxes and Charges"', taxes)
        self.assertIn('"included": bool(row.included_in_print_rate)', taxes)
        self.assertIn('"taxes": _profile_taxes(profile)', self.source)
        self.assertNotIn("ignore_permissions", taxes)

    def test_holding_is_offered_only_where_the_marker_field_exists(self):
        self.assertIn('"can_hold": _can_hold(invoice_type)', self.source)
        self.assertIn("return bool(frappe.get_meta(invoice_type).has_field(HELD_FIELD))", self.source)
        held = self.source.split("def held_carts", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("if not _can_hold(invoice_type):\n        return []", held)
        hold = self.source.split("def hold_cart", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("if not _can_hold(_invoice_type()):", hold)

    def test_customer_search_says_who_takes_a_tax_invoice(self):
        search = self.source.split("def search_customers", 1)[1].split("\ndef ", 1)[0]
        self.assertIn('"tax_id"', search)
        self.assertIn('"customer_type"', search)

    def test_context_selects_profile_from_mapping_payload(self):
        self.assertIn('row["name"] for row in profiles if row["is_default"]', self.source)
        self.assertIn('profiles[0]["name"]', self.source)


if __name__ == "__main__":
    unittest.main()
