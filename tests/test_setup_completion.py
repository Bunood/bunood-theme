from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class SetupCompletionTests(unittest.TestCase):
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
        self.assertIn('DEFAULT_SALES_FORMAT = "بونود - فاتورة ضريبية (A4)"', installer)
        self.assertIn("not setter.is_system_generated", installer)


if __name__ == "__main__":
    unittest.main()
