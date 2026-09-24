from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class ExactHalalaContractTests(unittest.TestCase):
    def test_native_rounding_flag_is_enforced_and_migrated(self):
        rounding = (ROOT / "bunood_theme" / "rounding.py").read_text(encoding="utf-8")
        hooks = (ROOT / "bunood_theme" / "hooks.py").read_text(encoding="utf-8")
        patches = (ROOT / "bunood_theme" / "patches.txt").read_text(encoding="utf-8")
        self.assertIn("doc.disable_rounded_total = 1", rounding)
        self.assertIn('frappe.get_single("Global Defaults")', rounding)
        self.assertIn('"POS Invoice"', hooks)
        self.assertIn("v0_46_12.exact_halala_totals", patches)

    def test_submitted_history_is_not_rewritten(self):
        rounding = (ROOT / "bunood_theme" / "rounding.py").read_text(encoding="utf-8")
        self.assertIn("if int(doc.docstatus or 0) == 0", rounding)

    def test_release_verifier_uses_a_half_riyal_total(self):
        verifier = (
            ROOT / "bunood_theme" / "verification" / "rounding_matrix.py"
        ).read_text(encoding="utf-8")
        self.assertIn("_assert_close(invoice.grand_total, 57.50", verifier)
        self.assertIn("_assert_close(invoice.rounding_adjustment, 0", verifier)
        self.assertIn('"gl_balanced": True', verifier)


if __name__ == "__main__":
    unittest.main()
