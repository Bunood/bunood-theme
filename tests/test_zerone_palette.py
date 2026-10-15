"""The zerONE palette (THE OWNER, 2026-10-15): the blue identity is the shipped default.

Approved home designs paint the desk in zerONE blue (#1d55c0). The palette is derived by the
theme's own ``palette.derive`` and held by its own contrast gate; the old green "Bunood" palette
stays in the catalogue, untouched, and a site moves only while it still carries that old default
exactly.

Two halves. The catalogue, the derivation and the gate are site-free. The seeder and the brand
sheet need ``frappe`` importable, so those classes skip on a host without it and run in the bench
env (``env/bin/python -m unittest discover -s tests -p test_zerone_palette.py``).
"""

import ast
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "bunood_theme"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

#: The approved identity's brand blue (scratchpad/home-mock/mock.css, `--brand`).
ZERONE_BLUE = "#1d55c0"
#: What shipped before it, and what the patch moves a site away from.
OLD_GREEN = "#3d8150"

try:
	import frappe  # noqa: F401

	HAVE_FRAPPE = True
except ImportError:
	HAVE_FRAPPE = False


def constant(path, name):
	"""A top-level literal, read from the source without importing the module."""
	for node in ast.parse(path.read_text(encoding="utf-8")).body:
		if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
			return ast.literal_eval(node.value)
	raise AssertionError(f"{name} not found in {path}")


class CatalogueTests(unittest.TestCase):
	def setUp(self):
		from bunood_theme import presets

		self.presets = presets

	def test_zero_one_is_a_palette_seeded_with_the_identity_blue(self):
		p = self.presets.PALETTES.get("Zero One")
		self.assertIsNotNone(p, "the palette is named so a person reads Zero One")
		self.assertEqual(p["brand_color"], ZERONE_BLUE)
		# The shipped accent stays: the gate sweeps every seed against it, and it already
		# clears every floor on the blue page.
		self.assertEqual(p["accent_color"], "#0090ff")
		# Mixed from the brand, as the approved mock's tinted page and nav wash are.
		self.assertIsNone(p["ground"])

	def test_zero_one_is_the_shipped_default(self):
		self.assertEqual(self.presets.DEFAULT_PALETTE, "Zero One")
		base = self.presets._shipped_baseline()
		self.assertEqual(base["brand_color"], ZERONE_BLUE)
		self.assertEqual(base["accent_color"], "#0090ff")

	def test_the_old_green_stays_in_the_catalogue_unrenamed(self):
		self.assertEqual(
			self.presets.PALETTES["Bunood"],
			{"brand_color": OLD_GREEN, "accent_color": "#0090ff", "ground": None},
		)

	def test_the_default_look_is_the_shipped_default_and_paints_blue(self):
		look = self.presets.theme_settings(self.presets.DEFAULT_THEME_PRESET)
		self.assertEqual(look["brand_color"], ZERONE_BLUE, "a fresh site would read Custom otherwise")
		self.assertEqual(look["ground_color"], "")

	def test_the_looks_that_carried_the_shipped_palette_still_carry_it(self):
		# They carried "Bunood" because it was the shipped palette, and the patch moves a site
		# that still holds it: a look left on green would read Custom right after the patch.
		for name in ("Bunood Console", "Bunood Night", "Bunood Day", "Quiet"):
			with self.subTest(look=name):
				self.assertEqual(self.presets.THEME_PRESETS[name]["palette"], self.presets.DEFAULT_PALETTE)


class DerivationTests(unittest.TestCase):
	def test_light_paints_the_seed_verbatim_under_a_white_label(self):
		from bunood_theme import palette

		d = palette.derive(ZERONE_BLUE, "#0090ff", "light")
		self.assertEqual(d["--bnd-brand-solid"], ZERONE_BLUE, "the identity blue needs no correction")
		self.assertEqual(d["--bnd-on-brand"], "#ffffff")
		self.assertEqual(d["--bnd-brand-ink"], ZERONE_BLUE)

	def test_dark_lifts_the_fill_and_keeps_both_floors(self):
		from bunood_theme import palette
		from bunood_theme.contrast import AA_NON_TEXT, AA_TEXT, parse_color, ratio, to_lab

		d = palette.derive(ZERONE_BLUE, "#0090ff", "dark")
		fill, label, page = d["--bnd-brand-solid"], d["--bnd-on-brand"], d["--bnd-page"]
		self.assertNotEqual(fill, ZERONE_BLUE, "a dark desk lifts the blue")
		self.assertGreaterEqual(to_lab(parse_color(fill))[0], palette.DARK_FILL_TARGET_L - 1.0)
		self.assertGreaterEqual(ratio(parse_color(fill), parse_color(page)), AA_NON_TEXT)
		self.assertGreaterEqual(ratio(parse_color(label), parse_color(fill)), AA_TEXT)


class GateTests(unittest.TestCase):
	def setUp(self):
		import contrast_gate

		self.gate = contrast_gate

	def test_the_gate_measures_the_shipped_seed_first(self):
		self.assertEqual(self.gate.SEEDS[0][0], ZERONE_BLUE)
		self.assertIn(OLD_GREEN, {s for s, _ in self.gate.SEEDS}, "the kept palette is still swept")

	def test_the_static_tokens_are_the_blue_derivation(self):
		light, dark = self.gate.read_blocks(self.gate.TOKENS_SCSS)
		self.assertEqual(self.gate.check_defaults_agree(light, dark), [])
		self.assertEqual(light["--bnd-brand"].lower(), ZERONE_BLUE)

	def test_every_shipped_palette_holds_including_zero_one(self):
		self.assertEqual(self.gate.check_palette_catalogue(), [])

	def test_the_default_look_is_still_the_shipped_default(self):
		self.assertEqual(self.gate.check_theme_catalogue(), [])

	def test_both_modes_pass_at_the_shipped_seed(self):
		light, dark = self.gate.read_blocks(self.gate.TOKENS_SCSS)
		for derived in (True, False):
			for mode, defaults in (("light", light), ("dark", dark)):
				rows = self.gate.evaluate(ZERONE_BLUE, defaults, mode, derived=derived)
				bad = [r for r in rows if r[2] is not None and (r[4] is None or r[4] < r[2])]
				with self.subTest(mode=mode, brand_sheet=derived):
					self.assertTrue(rows)
					self.assertEqual(bad, [])


class NoSecondLiteralTests(unittest.TestCase):
	def test_no_runtime_fallback_restates_the_old_green(self):
		for rel in ("brand.py", "email.py", "api.py", "setup.py"):
			with self.subTest(file=rel):
				self.assertFalse(OLD_GREEN in (APP / rel).read_text(encoding="utf-8"), rel)


@unittest.skipUnless(HAVE_FRAPPE, "the seeder and the brand sheet import frappe; run in the bench env")
class SiteDefaultTests(unittest.TestCase):
	def test_the_seeder_seeds_the_zero_one_pair(self):
		from bunood_theme import setup

		self.assertEqual(setup.DEFAULTS["brand_color"], ZERONE_BLUE)
		self.assertEqual(setup.DEFAULTS["accent_color"], "#0090ff")
		self.assertIn("ground_color", setup.SHIPPED_EMPTY, "the ground still ships empty")

	def test_email_and_print_take_the_seeder_pair(self):
		from bunood_theme import email

		self.assertEqual(email.SHIPPED_BRAND, ZERONE_BLUE)
		self.assertEqual(email.tokens("light", frappe._dict(brand_color="", accent_color=""))["--bnd-brand-ink"], ZERONE_BLUE)

	def test_an_empty_seed_renders_the_shipped_blue(self):
		from bunood_theme import brand

		css = brand.render_brand_css(frappe._dict(brand_color="", accent_color=""))
		self.assertIn(f"--bnd-brand: {ZERONE_BLUE};", css)
		self.assertNotIn(OLD_GREEN, css)


if __name__ == "__main__":
	unittest.main()
