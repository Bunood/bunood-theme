from pathlib import Path
import re
import unittest


ROOT = Path(__file__).parents[1]


class SetupCompletionTests(unittest.TestCase):
    def test_release_versions_and_changelog_agree(self):
        package = (ROOT / "bunood_theme" / "__init__.py").read_text(encoding="utf-8")
        hooks = (ROOT / "bunood_theme" / "hooks.py").read_text(encoding="utf-8")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        package_version = re.search(r'^__version__ = "([^"]+)"', package, re.MULTILINE)
        hook_version = re.search(r'^app_version = "([^"]+)"', hooks, re.MULTILINE)
        self.assertIsNotNone(package_version)
        self.assertIsNotNone(hook_version)
        self.assertEqual(package_version.group(1), hook_version.group(1))
        self.assertIn(f"## [{package_version.group(1)}]", changelog)

    def test_setup_wizard_reclaims_only_a_stock_print_style(self):
        hooks = (ROOT / "bunood_theme" / "hooks.py").read_text(encoding="utf-8")
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        self.assertIn(
            'setup_wizard_complete = "bunood_theme.setup.after_setup_wizard"', hooks
        )
        self.assertIn("def after_setup_wizard", setup)
        self.assertIn("_is_displaceable", setup)
        self.assertIn("settings.print_style = STYLE_NAME", setup)
        self.assertIn("adopt_sales_invoice_print_format()", setup)
        installer = (ROOT / "bunood_theme" / "printing" / "install.py").read_text(
            encoding="utf-8"
        )
        self.assertIn('DEFAULT_SALES_FORMAT = "بنود - فاتورة ضريبية (A4)"', installer)
        self.assertIn('DEFAULT_QUOTATION_FORMAT = "بنود - عرض سعر (A4)"', installer)
        self.assertIn('DEFAULT_PAYMENT_FORMAT = "بنود - سند قبض-صرف"', installer)
        self.assertIn('CUSTOMER_STATEMENT_FORMAT = "بنود - كشف حساب عميل"', installer)
        self.assertIn('configure_payment_entry_for_mvp()', installer)
        self.assertIn("not setter.is_system_generated", installer)
        self.assertIn('"doctype_or_field": "DocType"', installer)
        self.assertIn('setter.doctype_or_field == "DocType"', installer)

    def test_invoice_print_identity_is_name_first_even_in_standard_format(self):
        installer = (ROOT / "bunood_theme" / "printing" / "install.py").read_text(
            encoding="utf-8"
        )
        macros = (ROOT / "bunood_theme" / "templates" / "bunood_print_macros.html").read_text(
            encoding="utf-8"
        )
        shared = (ROOT / "bunood_theme" / "templates" / "bunood_invoice_a4.html").read_text(
            encoding="utf-8"
        )
        self.assertIn('(("item_name", "0"), ("item_code", "1"))', installer)
        self.assertIn('(row.item_name or row.item_code)', macros)
        self.assertIn('(row.item_name or row.item_code)', shared)
        self.assertIn('Item code', macros)


if __name__ == "__main__":
    unittest.main()
