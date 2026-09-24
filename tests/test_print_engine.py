"""Regression tests for the production PDF-engine contract.

The release image installs Chromium and publishes its path through Bench config.
Managed print formats must therefore select Frappe's ``chrome`` generator rather
than silently falling back to wkhtmltopdf, which cannot resolve the tenant host
inside the isolated backend container.
"""

import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).resolve().parents[1] / "bunood_theme/printing/install.py"
ROOT = SOURCE.parents[2]


class PrintEngineTests(unittest.TestCase):
	def setUp(self):
		self.created = Mock()
		self.created.insert = Mock()
		self.print_settings = SimpleNamespace(
			pdf_generator="wkhtmltopdf",
			repeat_header_footer=1,
			meta=SimpleNamespace(has_field=Mock(return_value=True)),
			save=Mock(),
		)
		self.frappe = SimpleNamespace(
			db=SimpleNamespace(
				exists=Mock(side_effect=lambda doctype, name: doctype in {"DocType", "Module Def"}),
			),
			get_doc=Mock(return_value=self.created),
			get_single=Mock(return_value=self.print_settings),
		)
		package = SimpleNamespace(zatca=SimpleNamespace(FORMATS=[]))
		spec = importlib.util.spec_from_file_location("isolated_print_install", SOURCE)
		self.install = importlib.util.module_from_spec(spec)
		with patch.dict(sys.modules, {"frappe": self.frappe, "bunood_theme": package}):
			spec.loader.exec_module(self.install)

	def test_managed_formats_use_the_release_chromium_generator(self):
		self.install._sync_format(self.install.FORMATS[0])

		payload = self.frappe.get_doc.call_args.args[0]
		self.assertEqual(payload["pdf_generator"], "chrome")
		self.created.insert.assert_called_once_with(ignore_permissions=True, ignore_if_duplicate=True)

	def test_shared_sales_and_purchase_a4_formats_are_managed(self):
		formats = {spec["name"]: spec for spec in self.install.FORMATS}

		self.assertEqual(formats["Bunood Sales Invoice (A4)"], {
			"name": "Bunood Sales Invoice (A4)",
			"doctype": "Sales Invoice",
			"file": "sales_invoice_a4.html",
			"pdf_generator": "chrome",
		})
		self.assertEqual(formats["Bunood Purchase Invoice (A4)"], {
			"name": "Bunood Purchase Invoice (A4)",
			"doctype": "Purchase Invoice",
			"file": "purchase_invoice_a4.html",
			"pdf_generator": "chrome",
		})

	def test_official_formats_keep_mains_wkhtmltopdf_engine(self):
		"""Integration v0.48.0: only the capability's new formats declare chrome."""
		official = [spec for spec in self.install.FORMATS if spec["name"].startswith("بونود - ")]
		self.assertEqual(len(official), 7)
		for spec in official:
			self.frappe.get_doc.reset_mock()
			self.install._sync_format(spec)
			self.assertEqual(self.frappe.get_doc.call_args.args[0]["pdf_generator"], "wkhtmltopdf", spec["name"])
		chrome = {spec["name"] for spec in self.install.FORMATS if spec.get("pdf_generator") == "chrome"}
		self.assertEqual(chrome, {
			"Bunood Purchase Invoice (A4)", "Bunood Sales Invoice (A4)",
			self.install.DEFAULT_QUOTATION_FORMAT, self.install.CUSTOMER_STATEMENT_FORMAT,
		})

	def test_migrate_does_not_run_the_held_tenant_configuration(self):
		"""Integration v0.48.0: engine, default formats and MVP fields are held."""
		for name in ("_sync_style", "_company_cr_field", "_sync_letterhead", "_sync_format"):
			setattr(self.install, name, Mock())
		held = {name: Mock() for name in (
			"_sync_pdf_generator", "adopt_business_print_formats",
			"configure_payment_entry_for_mvp", "configure_sales_invoice_for_mvp",
		)}
		for name, mock in held.items():
			setattr(self.install, name, mock)
		self.install.sync_print_theme()
		for name, mock in held.items():
			mock.assert_not_called()
		self.assertTrue(self.install._sync_format.called)

	def test_print_settings_are_repaired_to_the_release_generator(self):
		self.install._sync_pdf_generator()

		self.assertEqual(self.print_settings.pdf_generator, "chrome")
		self.assertEqual(self.print_settings.repeat_header_footer, 1)
		self.print_settings.save.assert_called_once_with(ignore_permissions=True)

	def test_chrome_enables_the_repeated_managed_letterhead(self):
		self.print_settings.pdf_generator = "chrome"
		self.print_settings.repeat_header_footer = 0

		self.install._sync_pdf_generator()

		self.assertEqual(self.print_settings.repeat_header_footer, 1)
		self.print_settings.save.assert_called_once_with(ignore_permissions=True)

	def test_matching_print_settings_remain_a_no_op(self):
		self.print_settings.pdf_generator = "chrome"
		self.print_settings.repeat_header_footer = 1

		self.install._sync_pdf_generator()

		self.print_settings.save.assert_not_called()

	def test_pdf_regression_tools_exercise_the_release_engine(self):
		for relative in (
			"tools/amount-words-regression.mjs",
			"tools/invoice-pdf-regression.mjs",
			"tools/letterhead-fixtures.mjs",
		):
			source = (ROOT / relative).read_text(encoding="utf-8")
			self.assertIn("pdf_generator='chrome'", source, relative)
			self.assertNotIn("pdf_generator='wkhtmltopdf'", source, relative)

	def test_invoice_footer_stays_on_chromes_static_repeat_path(self):
		"""Frappe v16 drops mixed dynamic footers on later PDF pages.

		The managed invoice must therefore keep the contact footer free of
		wkhtmltopdf page placeholders.  Their presence makes Chromium classify
		the complete footer as dynamic and route it through the broken clone path.
		"""
		template = (ROOT / "bunood_theme/templates/bunood_invoice_a4.html").read_text(
			encoding="utf-8"
		)

		self.assertIn('class="letter-head-footer"', template)
		self.assertNotIn('class="page"', template)
		self.assertNotIn('class="topage"', template)
		self.assertNotIn('class="bnd-inv-page"', template)

	def test_compact_letterhead_default_is_consistent_across_shipping_surfaces(self):
		presets = (ROOT / "bunood_theme/presets.py").read_text(encoding="utf-8")
		settings = json.loads(
			(ROOT / "bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.json").read_text(
				encoding="utf-8"
			)
		)
		settings_js = (
			ROOT / "bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js"
		).read_text(encoding="utf-8")
		fixture = json.loads((ROOT / "tests/fixtures/picker-shape.json").read_text(encoding="utf-8"))
		field = next(item for item in settings["fields"] if item.get("fieldname") == "print_letterhead")

		self.assertIn('"print_letterhead": "Bilingual Split"', presets)
		self.assertEqual(field["default"], "Bilingual Split")
		self.assertIn('print_letterhead: "Bilingual Split"', settings_js)
		self.assertEqual(fixture["state"]["print_letterhead"], "Bilingual Split")
		self.assertIn('or PRINT_DEFAULTS["print_letterhead"]', SOURCE.read_text(encoding="utf-8"))

	def test_print_language_is_the_single_language_default_everywhere(self):
		presets = (ROOT / "bunood_theme/presets.py").read_text(encoding="utf-8")
		settings = json.loads(
			(ROOT / "bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.json")
			.read_text(encoding="utf-8")
		)
		settings_js = (
			ROOT / "bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js"
		).read_text(encoding="utf-8")
		fixture = json.loads((ROOT / "tests/fixtures/picker-shape.json").read_text(encoding="utf-8"))
		field = next(item for item in settings["fields"] if item.get("fieldname") == "print_title_lang")

		self.assertIn('"print_title_lang": "Follow print language"', presets)
		self.assertEqual(field["default"], "Follow print language")
		self.assertIn("Follow print language", field["options"].splitlines())
		self.assertIn('print_title_lang: "Follow print language"', settings_js)
		self.assertEqual(fixture["state"]["print_title_lang"], "Follow print language")

	def test_managed_customer_documents_declare_language_and_direction(self):
		formats = ROOT / "bunood_theme/printing/formats"
		for filename in (
			"quotation_a4.html",
			"payment_entry_voucher.html",
			"sales_invoice_tax_a4.html",
			"sales_invoice_simplified_a4.html",
			"sales_invoice_tax_thermal.html",
			"sales_invoice_simplified_thermal.html",
		):
			template = (formats / filename).read_text(encoding="utf-8")
			with self.subTest(filename=filename):
				self.assertIn("bunood_print_language()", template)
				self.assertIn('dir="{{ \'rtl\' if is_ar else \'ltr\' }}"', template)
				self.assertIn('lang="{{ \'ar\' if is_ar else \'en\' }}"', template)

	def test_report_statement_uses_javascript_language_switch_without_jinja(self):
		template = (
			ROOT / "bunood_theme/printing/formats/customer_statement.html"
		).read_text(encoding="utf-8")

		self.assertIn("bndArabic", template)
		self.assertIn('dir="{%= bndArabic ?', template)
		self.assertIn('lang="{%= bndArabic ?', template)
		self.assertNotIn("{{", template)
		self.assertNotIn("frappe.local.lang", template)


if __name__ == "__main__":
	unittest.main()
