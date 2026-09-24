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
        # Integration v0.48.0: the validate hook and the patch are HELD.
        self.assertNotIn('"validate": "bunood_theme.rounding.enforce_exact_halalas"', hooks)
        self.assertIn("enforce_exact_halalas", hooks)  # named in the held note
        self.assertIn("v0_46_12.exact_halala_totals", patches)
        self.assertNotRegex(patches, r"(?m)^bunood_theme\.patches\.v0_46_12\.")

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
