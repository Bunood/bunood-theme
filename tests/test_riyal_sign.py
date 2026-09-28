"""The Saudi riyal sign on every desk (v0.48.6, THE OWNER 2026-09-28): a source contract.

The behaviour was measured on the isolated P0-07 bench (crm-theme.test): the patch turned SAR's
«ر.س» into U+20C1 and a second run changed nothing; ``fmt_money`` wrote the sign; the brand sheet
led the body stack with "Bunood Riyal"; and in the desk ``frappe.format`` wrote the sign, drawn in
that face with its status "loaded". This file guards the pieces that made it so.
"""

from pathlib import Path
import unittest

ROOT = Path(__file__).parents[1]


class RiyalSignContract(unittest.TestCase):
    def setUp(self):
        self.brand = (ROOT / "bunood_theme" / "brand.py").read_text(encoding="utf-8")
        self.riyal = (ROOT / "bunood_theme" / "riyal.py").read_text(encoding="utf-8")
        self.patches = (ROOT / "bunood_theme" / "patches.txt").read_text(encoding="utf-8")

    def test_the_face_is_the_themes_own_file_for_one_code_point(self):
        self.assertIn("url(/assets/bunood_theme/fonts/riyal/bunood-riyal.woff2)", self.brand)
        self.assertIn("unicode-range: U+20C1;", self.brand)
        self.assertTrue((ROOT / "bunood_theme" / "public" / "fonts" / "riyal" / "bunood-riyal.woff2").is_file())
        self.assertTrue((ROOT / "bunood_theme" / "public" / "fonts" / "riyal" / "Saudi_Riyal_Symbol-official.svg").is_file())

    def test_both_body_stacks_lead_with_the_riyal_face(self):
        # The chosen Arabic face, and "System", which downloads no Arabic face at all.
        self.assertIn('font-family: "{RIYAL_FAMILY}", var(--bnd-font-arabic), var(--font-stack);', self.brand)
        self.assertIn('font-family: "{RIYAL_FAMILY}", var(--font-stack);', self.brand)
        self.assertEqual(self.brand.count("{RIYAL_FACE_CSS}"), 2)

    def test_the_patch_is_registered_and_only_replaces_stock_spellings(self):
        self.assertRegex(self.patches, r"(?m)^bunood_theme\.patches\.v0_48_6\.saudi_riyal_symbol$")
        self.assertIn('RIYAL_SIGN = "\u20c1"', self.riyal)
        self.assertIn('"ر.س"', self.riyal)
        self.assertIn("if current.strip() not in STOCK_SYMBOLS:", self.riyal)


if __name__ == "__main__":
    unittest.main()
