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
NAMES = Path(__file__).resolve().parents[1] / "bunood_theme/printing/names.py"
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
		names_spec = importlib.util.spec_from_file_location("isolated_print_names", NAMES)
		self.names = importlib.util.module_from_spec(names_spec)
		names_spec.loader.exec_module(self.names)
		spec = importlib.util.spec_from_file_location("isolated_print_install", SOURCE)
		self.install = importlib.util.module_from_spec(spec)
		with patch.dict(sys.modules, {
			"frappe": self.frappe, "bunood_theme": package,
			"bunood_theme.payments": SimpleNamespace(SETTLEMENT_METHODS=("On Credit", "Cash")),
			"bunood_theme.printing": SimpleNamespace(names=self.names),
			"bunood_theme.printing.names": self.names,
		}):
			spec.loader.exec_module(self.install)

	def test_managed_formats_use_the_release_chromium_generator(self):
		self.install._sync_format(self.install.FORMATS[0])

		payload = self.frappe.get_doc.call_args.args[0]
		self.assertEqual(payload["pdf_generator"], "chrome")
		self.created.insert.assert_called_once_with(ignore_permissions=True, ignore_if_duplicate=True)

	def test_the_kit_formats_are_managed_on_chromium_with_names_that_carry_no_brand(self):
		"""The print redesign (2026-10-15): the three core formats and their POS Invoice twins
		are the kit's, on the release engine; no managed record is named after the product."""
		formats = {spec["name"]: spec for spec in self.install.FORMATS}
		n = self.names
		kit = {
			n.TAX_INVOICE_A4: ("Sales Invoice", "sales_invoice_tax_a4.html"),
			n.SIMPLIFIED_INVOICE_A4: ("Sales Invoice", "sales_invoice_simplified_a4.html"),
			n.SIMPLIFIED_RECEIPT_80: ("Sales Invoice", "sales_invoice_simplified_thermal.html"),
			n.TAX_INVOICE_A4 + n.POS_SUFFIX: ("POS Invoice", "sales_invoice_tax_a4.html"),
			n.SIMPLIFIED_INVOICE_A4 + n.POS_SUFFIX: ("POS Invoice", "sales_invoice_simplified_a4.html"),
			n.SIMPLIFIED_RECEIPT_80 + n.POS_SUFFIX: ("POS Invoice", "sales_invoice_simplified_thermal.html"),
		}
		for name, (doctype, file) in kit.items():
			with self.subTest(name=name):
				self.assertEqual(formats[name], {"name": name, "doctype": doctype, "file": file, "pdf_generator": "chrome"})
		for name in formats:
			self.assertNotRegex(name, r"Bunood|بونود|بنود|زاتكا", name)
		self.assertEqual(len(formats), len(self.install.FORMATS), "no name twice")

	def test_formats_not_yet_redesigned_keep_their_engine(self):
		"""Stage 2 of the redesign: renamed now, their files and engines unchanged."""
		engines = {spec["name"]: spec.get("pdf_generator", "wkhtmltopdf") for spec in self.install.FORMATS}
		n = self.names
		for name in (n.TAX_RECEIPT_80, n.MATRIX_INVOICE, n.VOUCHER_A4, n.JOURNAL_A4):
			self.frappe.get_doc.reset_mock()
			spec = next(item for item in self.install.FORMATS if item["name"] == name)
			self.install._sync_format(spec)
			self.assertEqual(self.frappe.get_doc.call_args.args[0]["pdf_generator"], "wkhtmltopdf", name)
		for name in (n.PURCHASE_INVOICE_A4, n.QUOTATION_A4, n.STATEMENT_A4):
			self.assertEqual(engines[name], "chrome", name)

	def test_the_style_and_the_letter_head_take_their_new_names(self):
		self.assertEqual(self.install.STYLE_NAME, "النمط الرسمي")
		self.assertEqual(self.install.LETTERHEAD_NAME, "الترويسة الرسمية")
		self.assertEqual(self.install.DEFAULT_SALES_FORMAT, "فاتورة ضريبية - A4")

	def test_the_company_print_profile_fields(self):
		fields = {f["fieldname"]: f for f in self.install.PRINT_FIELDS}
		for name in ("bnd_company_name_ar", "bnd_company_name_en", "bnd_mobile", "bnd_instagram",
					 "bnd_x", "bnd_snapchat", "bnd_tiktok", "bnd_print_policy"):
			self.assertIn(name, fields)
		self.assertEqual(fields["bnd_print_policy"]["fieldtype"], "Small Text")
		# The Ministry of Commerce bans the phrase; the policy's hint says so.
		self.assertIn("لا ترد ولا تستبدل", fields["bnd_print_policy"]["description"])
		created = Mock()
		module = SimpleNamespace(create_custom_fields=created)
		with patch.dict(sys.modules, {"frappe.custom.doctype.custom_field.custom_field": module}):
			self.install._company_print_fields()
		created.assert_called_once_with({"Company": self.install.PRINT_FIELDS}, ignore_validate=True, update=True)

	def test_migrate_does_not_run_the_held_tenant_configuration(self):
		"""Integration v0.48.0: engine, default formats and MVP fields are held."""
		for name in ("_sync_style", "_company_cr_field", "_company_print_fields", "_sync_letterhead", "_sync_format"):
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

	def test_the_kit_draws_its_page_chrome_with_css_not_frappes_overlay(self):
		"""Frappe v16's Chromium overlay cannot number pages without print_designer's script,
		and the .print-format margins it reads shift the overlay; the kit's A4 repeats its head
		and foot with CSS and numbers the sheets with an @page margin box."""
		template = (ROOT / "bunood_theme/templates/print/sales_invoice_a4.html").read_text(encoding="utf-8")
		kit = (ROOT / "bunood_theme/templates/print/kit.html").read_text(encoding="utf-8")
		sheet = (ROOT / "bunood_theme/templates/print/print_kit.css").read_text(encoding="utf-8")
		self.assertNotIn('id="header-html"', template)
		self.assertNotIn('id="footer-html"', template)
		self.assertIn('<thead><tr><td><div class="zo-frame__head"></div></td></tr></thead>', template)
		self.assertIn("@top-center", kit)
		self.assertIn("counter(pages)", kit)
		self.assertIn(".zo-chrome-head { position: fixed;", sheet)
		self.assertIn(".print-format .zo-frame > tfoot { display: table-footer-group !important; }", sheet)

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

		# ONE OWNER since the settings audit (decisions ii-2 a, ii-3): the value lives in
		# presets.PRINT_DEFAULTS; the doctype carries no `default` and the form no client
		# copy (build.mjs refuses both), so no shipping surface can disagree with it.
		self.assertIn('"print_letterhead": "Bilingual Split"', presets)
		self.assertNotIn("default", field)
		self.assertNotIn("BND_PRINT_DEFAULTS", settings_js)
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

		# One owner, as above: the catalogue holds the value, the doctype only offers it.
		self.assertIn('"print_title_lang": "Follow print language"', presets)
		self.assertNotIn("default", field)
		self.assertIn("Follow print language", field["options"].splitlines())
		self.assertNotIn("BND_PRINT_DEFAULTS", settings_js)
		self.assertEqual(fixture["state"]["print_title_lang"], "Follow print language")

	def test_managed_customer_documents_declare_language_and_direction(self):
		# The kit's families follow Print Language; each format file only sets switches.
		formats = ROOT / "bunood_theme/printing/formats"
		template = (formats / "quotation_a4.html").read_text(encoding="utf-8")
		self.assertIn("bunood_print_language()", template)
		for filename, family in (
			("sales_invoice_tax_a4.html", "sales_invoice_a4.html"),
			("sales_invoice_simplified_a4.html", "sales_invoice_a4.html"),
			("sales_invoice_simplified_thermal.html", "sales_receipt.html"),
		):
			template = (formats / filename).read_text(encoding="utf-8")
			body = (ROOT / "bunood_theme/templates/print" / family).read_text(encoding="utf-8")
			with self.subTest(filename=filename):
				self.assertIn('{% include "templates/print/' + family + '" %}', template)
				self.assertIn('bunood_print_language() == "ar"', body)
				self.assertIn("lang=\"{{ 'ar' if ar else 'en' }}\"", body)
		# Not redesigned yet (Stage 2): main's Arabic-first layouts, pinned RTL by print.scss.
		for filename in ("payment_entry_voucher.html", "sales_invoice_tax_thermal.html"):
			template = (formats / filename).read_text(encoding="utf-8")
			with self.subTest(filename=filename):
				self.assertIn('<div class="bnd-p bnd-p--', template)
		sheet = (ROOT / "bunood_theme/public/scss/print/print.scss").read_text(encoding="utf-8")
		self.assertRegex(sheet, r"(?m)^\.bnd-p \{\n\tdirection: rtl;\n\}")

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
