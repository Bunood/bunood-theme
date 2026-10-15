"""The zerONE sign-in page (THE OWNER, 2026-10-15): the logo at the mark's size, «استمر» in the
brand colour, and Frappe's subtitle in Arabic.

Site-free: the patch runs against a recording fake ``frappe`` (the way ``test_zerone_brand.py``
runs its patch); the stylesheet, the catalogue and the compiled sheet are read from their files.
"""

import ast
import csv
import importlib.util
from pathlib import Path
import re
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "bunood_theme"


def constant(path, name):
	for node in ast.parse(path.read_text(encoding="utf-8")).body:
		if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
			return ast.literal_eval(node.value)
	raise AssertionError(f"{name} not found in {path}")


def fake_frappe(stored):
	state = {"value": stored, "writes": [], "log": []}

	def sql(query, values):
		assert "tabSingles" in query and values == ("Theme Settings", "login_action"), (query, values)
		return [] if state["value"] is None else [(state["value"],)]

	def set_single_value(doctype, field, value, update_modified=True):
		assert (doctype, field) == ("Theme Settings", "login_action")
		state["value"] = value
		state["writes"].append((value, update_modified))
		state["log"].append("write")

	frappe = ModuleType("frappe")
	frappe.db = SimpleNamespace(sql=sql, set_single_value=set_single_value, commit=lambda: state["log"].append("commit"))
	frappe.clear_cache = lambda doctype=None: state["log"].append(("clear", doctype))
	return frappe, state


def run_patch(frappe):
	presets = ModuleType("bunood_theme.presets")
	presets.LOGIN_DEFAULTS = constant(APP / "presets.py", "LOGIN_DEFAULTS")
	package = ModuleType("bunood_theme")
	package.presets = presets
	path = APP / "patches" / "v0_60_0" / "sign_in_branded.py"
	with patch.dict(sys.modules, {"frappe": frappe, "bunood_theme": package, "bunood_theme.presets": presets}):
		spec = importlib.util.spec_from_file_location("sign_in_branded_under_test", path)
		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)
		with patch("builtins.print"):
			module.execute()
	return module


class ButtonPatchTests(unittest.TestCase):
	def test_the_shipped_default_is_branded(self):
		self.assertEqual(constant(APP / "presets.py", "LOGIN_DEFAULTS")["login_action"], "Branded")

	def test_neutral_moves_to_branded_then_commits_then_clears(self):
		frappe, state = fake_frappe("Neutral")
		run_patch(frappe)
		self.assertEqual(state["value"], "Branded")
		self.assertEqual(state["writes"], [("Branded", False)], "the vendor's default moved; no person edited the form")
		self.assertEqual(state["log"], ["write", "commit", ("clear", "Theme Settings")])

	def test_anything_else_is_left_alone(self):
		for stored in ("Branded", "", None, "neutral", "Bogus"):
			frappe, state = fake_frappe(stored)
			run_patch(frappe)
			self.assertEqual(state["value"], stored, repr(stored))
			self.assertEqual(state["log"], [], repr(stored))

	def test_registered_after_the_palette_and_before_the_healer(self):
		lines = [l.strip() for l in (APP / "patches.txt").read_text(encoding="utf-8").splitlines()]
		lines = [l for l in lines if l and not l.startswith("#") and not l.startswith("[")]
		here = lines.index("bunood_theme.patches.v0_60_0.sign_in_branded")
		self.assertGreater(here, lines.index("bunood_theme.patches.v0_60_0.zerone_palette"))
		self.assertEqual(lines[-1], "bunood_theme.patches.v0_11_0.heal_unknown_placements")

	def test_branded_paints_the_continue_button_on_every_style(self):
		# The axis is not scoped to a pole, so an "Original" site (as production is) is branded too.
		scss = (APP / "public" / "scss" / "web" / "_login.scss").read_text(encoding="utf-8")
		self.assertRegex(
			scss,
			r"\nbody\.bnd-auth-action-branded \.page-card \.page-card-actions :is\(\.btn-login, \.btn-ldap-login\),"
			r"\n[^{]*\{\n  background: var\(--bnd-brand-solid\);",
		)
		self.assertEqual(constant(APP / "context.py", "AUTH_CLASSES")["login_action"]["Branded"], "action-branded")


class LogoTests(unittest.TestCase):
	RULE = "body.bnd-auth img.app-logo {\n  max-block-size: calc(var(--bnd-sp-7) + var(--bnd-sp-2));\n}"

	def test_the_rule_is_in_the_sign_in_sheet(self):
		scss = (APP / "public" / "scss" / "web" / "_login.scss").read_text(encoding="utf-8")
		self.assertIn(self.RULE, scss)

	def test_the_size_is_56px(self):
		tokens = (APP / "public" / "scss" / "_tokens.scss").read_text(encoding="utf-8")
		rem = lambda name: float(re.search(rf"--{name}: ([\d.]+)rem;", tokens).group(1))  # noqa: E731
		self.assertEqual((rem("bnd-sp-7") + rem("bnd-sp-2")) * 16, 56)

	def test_it_outweighs_frappes_cap(self):
		# Frappe: `.page-card-head img.app-logo { max-height: 32px }` is (0,2,1); ours is (0,2,2).
		def weight(selector):
			classes = len(re.findall(r"\.[\w-]+", selector))
			elements = len(re.findall(r"(?:^|\s)([a-z]+)", selector))
			return (classes, elements)

		self.assertGreater(weight("body.bnd-auth img.app-logo"), weight(".page-card-head img.app-logo"))

	def test_the_compiled_web_sheet_carries_it(self):
		web = constant(APP / "assets.py", "WEB_CSS")
		css = (APP / "public" / web.split("/assets/bunood_theme/", 1)[1]).read_text(encoding="utf-8")
		self.assertIn(self.RULE, css)


class SubtitleTests(unittest.TestCase):
	WANTED = {
		"Welcome! Please sign in to continue.": "مرحباً بك! سجّل الدخول للمتابعة.",
		"Forgot password?": "نسيت كلمة المرور؟",
	}

	def test_the_catalogue_carries_frappes_empty_sign_in_strings(self):
		po = (APP / "locale" / "ar.po").read_text(encoding="utf-8")
		for msgid, msgstr in self.WANTED.items():
			block = re.search(rf'((?:#.*\n)*)msgid "{re.escape(msgid)}"\nmsgstr "(.*)"', po)
			self.assertIsNotNone(block, msgid)
			self.assertEqual(block.group(2), msgstr)
			self.assertNotIn("#, fuzzy", block.group(1), "reviewed, not proposed")

	def test_the_generated_csv_carries_them(self):
		with open(APP / "translations" / "ar.csv", encoding="utf-8", newline="") as handle:
			rows = {row[0]: row[1] for row in csv.reader(handle) if len(row) >= 2 and not (len(row) > 2 and row[2])}
		for msgid, msgstr in self.WANTED.items():
			self.assertEqual(rows.get(msgid), msgstr)


if __name__ == "__main__":
	unittest.main()
