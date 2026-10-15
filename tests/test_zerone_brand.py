"""The zerONE brand (THE OWNER, 2026-10-15): the vendor mark, the shipped name and the patch.

Site-free: the patch runs against a recording fake ``frappe``, the mark and boot are read
from their files, the way ``test_auth_context.py`` reads context.py. No site, no bench.
"""

import ast
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
	"""A top-level string constant, read from the source without importing the module."""
	for node in ast.parse(path.read_text(encoding="utf-8")).body:
		if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
			return ast.literal_eval(node.value)
	raise AssertionError(f"{name} not found in {path}")


class VendorMarkTests(unittest.TestCase):
	def test_the_vendor_mark_is_the_zero_one_tile(self):
		url = constant(APP / "context.py", "VENDOR_MARK")
		self.assertEqual(url, "/assets/bunood_theme/images/zerone-mark.svg", "a new filename busts cached favicons")
		svg = (APP / "public" / "images" / Path(url).name).read_text(encoding="utf-8")
		self.assertIn('aria-label="Zero One"', svg)
		self.assertIn('viewBox="0 0 512 512"', svg)
		drawing = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
		self.assertNotIn("<text", drawing, "pure paths: a favicon has no fonts")
		self.assertNotIn("<image", drawing)
		self.assertIn('rx="116"', drawing, "the tile is part of the drawing")

	def test_boot_never_serves_an_empty_mark_or_name(self):
		src = (APP / "boot.py").read_text(encoding="utf-8")
		self.assertRegex(src, r'bootinfo\.bnd_logo = _boot_text\(settings\.get\("logo"\)\) or VENDOR_MARK\n')
		self.assertRegex(src, r'bootinfo\.bnd_company = _boot_text\(settings\.get\("company_name"\)\) or _boot_text\(_vendor_name\(\)\)\n')

	def test_no_script_carries_a_brand_literal_for_the_mark_or_the_name(self):
		js = (APP / "public" / "js" / "bunood.js").read_text(encoding="utf-8")
		self.assertNotRegex(js, r'bnd_company \|\| "(B|Bunood)"')
		start = js.index("function mount_dock()")
		dock = js[start:js.index("const slug = (name) =>", start)]
		self.assertIn("bnd-dock-brand", dock, "the dock's brand slice was found")
		self.assertIn("brand.appendChild(brand_mark());", dock, "the dock chip draws the shared mark")
		self.assertNotIn(".charAt(0)", dock, "no initial letter of its own")


class ShippedNameTests(unittest.TestCase):
	def test_the_shipped_name_is_zero_one(self):
		self.assertEqual(constant(APP / "presets.py", "SITE_DEFAULTS")["company_name"], "Zero One")

	def test_the_patch_is_registered_before_the_healer(self):
		lines = [l.strip() for l in (APP / "patches.txt").read_text(encoding="utf-8").splitlines()]
		lines = [l for l in lines if l and not l.startswith("#") and not l.startswith("[")]
		self.assertIn("bunood_theme.patches.v0_60_0.zerone_brand", lines)
		self.assertEqual(lines[-1], "bunood_theme.patches.v0_11_0.heal_unknown_placements")


class FakeField(dict):
	def __init__(self, values):
		super().__init__(values)
		self.name, self.saved = values["name"], 0

	def get(self, key, default=None):
		return dict.get(self, key, default)

	def set(self, key, value):
		self[key] = value

	def save(self, ignore_permissions=False):
		self.saved += 1


def fake_frappe(company, fields=()):
	"""A frappe whose tabSingles holds `company` and whose Custom Fields are `fields`."""
	state = {"company": company, "commits": 0, "cleared": []}
	rows = {f["name"]: FakeField(f) for f in fields}

	def sql(query, *args):
		assert "tabSingles" in query and "company_name" in query, query
		return [] if state["company"] is None else [(state["company"],)]

	def set_single_value(doctype, field, value):
		assert (doctype, field) == ("Theme Settings", "company_name")
		state["company"] = value

	def get_value(doctype, filters, field):
		for row in rows.values():
			if row["dt"] == filters["dt"] and row["fieldname"] == filters["fieldname"]:
				return row.name
		return None

	frappe = ModuleType("frappe")
	frappe.db = SimpleNamespace(
		sql=sql, set_single_value=set_single_value, get_value=get_value,
		commit=lambda: state.__setitem__("commits", state["commits"] + 1),
	)
	frappe.get_doc = lambda doctype, name: rows[name]
	frappe.clear_cache = lambda doctype=None: state["cleared"].append(doctype)
	return frappe, state, rows


def run_patch(frappe):
	presets = ModuleType("bunood_theme.presets")
	presets.SITE_DEFAULTS = constant(APP / "presets.py", "SITE_DEFAULTS")
	package = ModuleType("bunood_theme")
	package.presets = presets
	path = APP / "patches" / "v0_60_0" / "zerone_brand.py"
	with patch.dict(sys.modules, {"frappe": frappe, "bunood_theme": package, "bunood_theme.presets": presets}):
		spec = importlib.util.spec_from_file_location("zerone_brand_under_test", path)
		module = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(module)
		with patch("builtins.print"):
			module.execute()
	return module


class PatchTests(unittest.TestCase):
	def test_the_old_shipped_name_moves_in_either_language(self):
		for stored in ("Bunood", " Bunood ", "بنود", " بنود\n"):
			frappe, state, _ = fake_frappe(stored)
			run_patch(frappe)
			self.assertEqual(state["company"], "Zero One", repr(stored))
			self.assertEqual(state["commits"], 1, "committed before the cache is cleared")
			self.assertIn("Theme Settings", state["cleared"])

	def test_a_tenant_name_or_an_empty_field_is_never_touched(self):
		for stored in ("ACME Trading", "Bunood Trading", "شركة بنود", "bunood", "", None):
			frappe, state, _ = fake_frappe(stored)
			run_patch(frappe)
			self.assertEqual(state["company"], stored, repr(stored))
			self.assertEqual(state["cleared"], [], repr(stored))

	def test_insert_only_field_texts_move_only_from_the_old_shipped_text(self):
		fields = (
			{"name": "PE-origin", "dt": "Payment Entry", "fieldname": "custom_bunood_payment_origin", "label": "Bunood Payment Origin"},
			{"name": "SI-held", "dt": "Sales Invoice", "fieldname": "custom_bunood_is_held", "label": "Held in Bunood POS"},
			{"name": "PI-held", "dt": "POS Invoice", "fieldname": "custom_bunood_is_held", "label": "Our own label"},
			{"name": "SIP-ref", "dt": "Sales Invoice Payment", "fieldname": "custom_bunood_reference_no",
			 "label": "Payment Reference",
			 "description": "Card, network, or external tender reference captured at Bunood POS checkout."},
		)
		frappe, state, rows = fake_frappe("ACME", fields)
		run_patch(frappe)
		self.assertEqual(rows["PE-origin"]["label"], "Zero One Payment Origin")
		self.assertEqual(rows["SI-held"]["label"], "Held in Zero One POS")
		self.assertEqual(rows["PI-held"]["label"], "Our own label", "an edited label is a choice")
		self.assertEqual(rows["PI-held"].saved, 0)
		self.assertEqual(rows["SIP-ref"]["description"],
		                 "Card, network, or external tender reference captured at Zero One POS checkout.")
		self.assertEqual(rows["SIP-ref"]["label"], "Payment Reference")

	def test_the_patch_writes_what_the_installers_now_ship(self):
		module = run_patch(fake_frappe("ACME")[0])
		sources = (APP / "payments.py").read_text(encoding="utf-8") + (APP / "pos.py").read_text(encoding="utf-8")
		for _doctypes, _field, _prop, old, new in module.FIELD_TEXTS:
			self.assertIn(f'"{new}"', sources, "the patch and the installer agree")
			self.assertNotIn(f'"{old}"', sources, "the installer no longer ships the old text")


if __name__ == "__main__":
	unittest.main()
