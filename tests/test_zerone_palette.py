"""The zerONE palette (THE OWNER, 2026-10-15): the blue identity is the shipped default.

Approved home designs paint the desk in zerONE blue (#1d55c0). The palette is derived by the
theme's own ``palette.derive`` and held by its own contrast gate; the old green "Bunood" palette
stays in the catalogue, untouched, and a site moves only while it still carries that old default
exactly.

Two halves. The catalogue, the derivation, the gate and the patch are site-free (the patch runs
against a recording fake ``frappe``, the way ``test_zerone_brand.py`` runs its patch). The seeder,
the brand sheet and the print installer need ``frappe`` importable, so those classes skip on a host
without it and run in the bench env (``env/bin/python -m unittest discover -s tests -p
test_zerone_palette.py``).
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

	def test_the_settings_thumbnails_fall_back_to_the_shipped_blue(self):
		js = (APP / "bunood_theme" / "doctype" / "theme_settings" / "theme_settings.js").read_text(encoding="utf-8")
		self.assertNotIn(OLD_GREEN, js)

	def test_the_customer_statement_names_no_colour_of_its_own(self):
		# The print redesign moved the statement into the print kit (the v0.60.0 merge): its chrome
		# and colours come from the kit's sheet (`ctx.open`), substituted per site at render.
		html = (APP / "printing" / "formats" / "customer_statement.html").read_text(encoding="utf-8")
		# `(?<!&)`: an HTML entity (`&#8201;`) is not a colour.
		self.assertNotRegex(html, r"(?<!&)#[0-9a-fA-F]{3,8}\b", "the statement names no colour of its own")
		self.assertNotIn("<style", html, "no sheet of its own: the kit's")
		self.assertIn("ctx.open", html)
		kit = (APP / "templates" / "print" / "print_kit.css").read_text(encoding="utf-8")
		self.assertNotIn(OLD_GREEN, kit)
		self.assertIn("var(--bnd-brand-solid)", kit)


class FakeSingles:
	"""A tabSingles for Theme Settings, recording every write, commit and clear in order."""

	def __init__(self, values):
		self.values = dict(values)
		self.log = []

	def sql(self, query, values=None):
		assert "tabSingles" in query and "Theme Settings" in str(values or query), query
		return [(f, v) for f, v in self.values.items()]

	def set_single_value(self, doctype, field, value, update_modified=True):
		assert doctype == "Theme Settings"
		self.values[field] = value
		self.log.append(("set", field, value, update_modified))

	def commit(self):
		self.log.append(("commit",))


def fake_frappe(values):
	singles = FakeSingles(values)
	frappe = ModuleType("frappe")
	frappe.db = SimpleNamespace(sql=singles.sql, set_single_value=singles.set_single_value, commit=singles.commit)
	frappe.clear_cache = lambda doctype=None: singles.log.append(("clear", doctype))
	frappe.get_single = lambda doctype: SimpleNamespace(**singles.values)
	frappe.log_error = lambda *a, **k: singles.log.append(("error",))
	return frappe, singles


def run_patch(frappe, singles, times=1):
	presets = ModuleType("bunood_theme.presets")
	presets.PALETTES = constant(APP / "presets.py", "PALETTES")
	presets.DEFAULT_PALETTE = constant(APP / "presets.py", "DEFAULT_PALETTE")
	brand = ModuleType("bunood_theme.brand")
	brand.write_brand_css = lambda settings=None: singles.log.append(("brand_css", settings.brand_color))
	install = ModuleType("bunood_theme.printing.install")
	install.resync_print_brand = lambda settings=None: singles.log.append(("print", settings.brand_color))
	printing = ModuleType("bunood_theme.printing")
	printing.install = install
	package = ModuleType("bunood_theme")
	package.presets, package.brand, package.printing = presets, brand, printing
	path = APP / "patches" / "v0_60_0" / "zerone_palette.py"
	modules = {
		"frappe": frappe, "bunood_theme": package, "bunood_theme.presets": presets,
		"bunood_theme.brand": brand, "bunood_theme.printing": printing,
		"bunood_theme.printing.install": install,
	}
	with patch.dict(sys.modules, modules):
		spec = importlib.util.spec_from_file_location("zerone_palette_under_test", path)
		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)
		with patch("builtins.print"):
			for _ in range(times):
				module.execute()
	return module


OLD_DEFAULT = {
	"brand_color": OLD_GREEN, "accent_color": "#0090ff",
	"brand_color_dark": "", "accent_color_dark": "", "ground_color": "",
	"company_name": "ACME",
}


class PatchTests(unittest.TestCase):
	def test_the_old_shipped_palette_moves_to_the_new_default(self):
		for stored in (OLD_GREEN, "#3D8150", f" {OLD_GREEN}\n"):
			with self.subTest(stored=stored):
				frappe, singles = fake_frappe({**OLD_DEFAULT, "brand_color": stored})
				run_patch(frappe, singles)
				self.assertEqual(singles.values["brand_color"], ZERONE_BLUE)
				self.assertEqual(singles.values["accent_color"], "#0090ff")
				sets = [e for e in singles.log if e[0] == "set"]
				self.assertEqual(sets, [("set", "brand_color", ZERONE_BLUE, False)],
				                 "only the seed that differs, and not as a person's edit")
				order = [e[0] for e in singles.log]
				self.assertLess(order.index("commit"), order.index("clear"), "commit, then clear")
				self.assertIn(("brand_css", ZERONE_BLUE), singles.log, "the brand sheet is re-rendered blue")
				self.assertIn(("print", ZERONE_BLUE), singles.log, "the print carriers follow")

	def test_an_empty_accent_is_still_the_old_default(self):
		frappe, singles = fake_frappe({**OLD_DEFAULT, "accent_color": ""})
		run_patch(frappe, singles)
		self.assertEqual(singles.values["brand_color"], ZERONE_BLUE)

	def test_a_tenant_colour_choice_is_never_touched(self):
		cases = {
			"own brand": {"brand_color": "#123456"},
			"own accent on the old green": {"accent_color": "#ab4aba"},
			"own dark brand": {"brand_color_dark": "#55aa66"},
			"own dark accent": {"accent_color_dark": "#7ce2fe"},
			"own ground": {"ground_color": "#8b8d98"},
			"never seeded": {"brand_color": ""},
			"absent row": {"brand_color": None},
		}
		for label, change in cases.items():
			with self.subTest(case=label):
				frappe, singles = fake_frappe({**OLD_DEFAULT, **change})
				before = dict(singles.values)
				run_patch(frappe, singles)
				self.assertEqual(singles.values, before)
				self.assertEqual(singles.log, [], "no write, no commit, no clear, no re-render")

	def test_idempotent(self):
		frappe, singles = fake_frappe(dict(OLD_DEFAULT))
		run_patch(frappe, singles, times=2)
		self.assertEqual(sum(1 for e in singles.log if e[0] == "set"), 1)
		self.assertEqual(sum(1 for e in singles.log if e[0] == "brand_css"), 1)

	def test_the_patch_names_the_old_default_the_catalogue_still_carries(self):
		module = run_patch(*fake_frappe({"brand_color": "#123456"}))
		palettes = constant(APP / "presets.py", "PALETTES")
		self.assertEqual(module.OLD_DEFAULT["brand_color"], palettes["Bunood"]["brand_color"])
		self.assertEqual(module.OLD_DEFAULT["accent_color"], palettes["Bunood"]["accent_color"])

	def test_the_patch_is_registered_after_the_brand_patch_and_before_the_healer(self):
		lines = [l.strip() for l in (APP / "patches.txt").read_text(encoding="utf-8").splitlines()]
		lines = [l for l in lines if l and not l.startswith("#") and not l.startswith("[")]
		here = lines.index("bunood_theme.patches.v0_60_0.zerone_palette")
		self.assertGreater(here, lines.index("bunood_theme.patches.v0_60_0.zerone_brand"))
		self.assertEqual(lines[-1], "bunood_theme.patches.v0_11_0.heal_unknown_placements")


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


@unittest.skipUnless(HAVE_FRAPPE, "the print installer imports frappe; run in the bench env")
class PrintCarrierTests(unittest.TestCase):
	"""The prints' colours come from this site's seeds: the print kit's sheet at render (every kit
	format, the statement included, since the v0.60.0 merge), and a format authored in tokens at
	sync and on a save."""

	def setUp(self):
		from unittest.mock import Mock

		from bunood_theme.printing import install

		self.install = install
		self.inserted = []
		doc = Mock()
		doc.insert = Mock()
		self.fake = SimpleNamespace(
			db=SimpleNamespace(exists=lambda doctype, name=None: doctype in {"Report", "Module Def"}),
			get_doc=lambda values: self.inserted.append(values) or doc,
			log_error=Mock(), get_traceback=lambda: "",
		)
		self.statement = next(s for s in install.FORMATS if s["name"] == install.CUSTOMER_STATEMENT_FORMAT)

	def kit(self, brand):
		# What `printing.jinja._kit_css` hands every kit format, for these seeds.
		from bunood_theme.email import substitute, tokens

		css = (APP / "templates" / "print" / "print_kit.css").read_text(encoding="utf-8")
		return substitute(css, tokens("light", frappe._dict(brand_color=brand, accent_color="#0090ff")))

	def test_the_kit_prints_in_the_shipped_blue(self):
		from bunood_theme import palette

		css = self.kit(ZERONE_BLUE)
		self.assertNotIn("var(--bnd-", css)
		self.assertIn(palette.derive(ZERONE_BLUE, "#0090ff", "light")["--bnd-brand-solid"], css)
		self.assertNotIn(OLD_GREEN, css)

	def test_the_kit_follows_a_tenant_seed(self):
		from bunood_theme import palette

		css = self.kit("#ab4aba")
		self.assertIn(palette.derive("#ab4aba", "#0090ff", "light")["--bnd-brand-solid"], css)
		self.assertNotIn(ZERONE_BLUE, css)

	def test_a_format_in_tokens_is_written_in_the_site_colours(self):
		# No shipped format carries tokens any more; the mechanism stays for one that does.
		from bunood_theme import palette

		settings = frappe._dict(brand_color="#ab4aba", accent_color="#0090ff")
		with patch.object(self.install, "frappe", self.fake), \
			patch.object(self.install, "_format_html", lambda spec: "<style>h1 { color: var(--bnd-brand-ink); }</style>"):
			self.install._sync_format(self.statement, settings)
		ink = palette.derive("#ab4aba", "#0090ff", "light")["--bnd-brand-ink"]
		self.assertEqual(self.inserted[-1]["html"], f"<style>h1 {{ color: {ink}; }}</style>")

	def test_a_settings_save_re_papers_only_the_token_formats(self):
		from unittest.mock import Mock

		real = self.install._format_html
		statement = self.statement
		synced = Mock()
		with patch.object(self.install, "frappe", self.fake), \
			patch.object(self.install, "_sync_style", Mock()), \
			patch.object(self.install, "_sync_letterhead", Mock()), \
			patch.object(self.install, "_format_html", lambda spec: "var(--bnd-ink)" if spec is statement else real(spec)), \
			patch.object(self.install, "_sync_format", synced):
			self.install.resync_print_brand("settings")
		self.assertEqual([c.args for c in synced.call_args_list], [(self.statement, "settings")])

	def test_no_shipped_format_needs_a_re_paper(self):
		# The kit's formats take their colours at render; a save re-papers no format record.
		from unittest.mock import Mock

		synced = Mock()
		with patch.object(self.install, "frappe", self.fake), \
			patch.object(self.install, "_sync_style", Mock()), \
			patch.object(self.install, "_sync_letterhead", Mock()), \
			patch.object(self.install, "_sync_format", synced):
			self.install.resync_print_brand("settings")
		self.assertEqual(synced.call_args_list, [])


if __name__ == "__main__":
	unittest.main()
