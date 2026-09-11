"""Regression tests for the production PDF-engine contract.

The release image installs Chromium and publishes its path through Bench config.
Managed print formats must therefore select Frappe's ``chrome`` generator rather
than silently falling back to wkhtmltopdf, which cannot resolve the tenant host
inside the isolated backend container.
"""

import importlib.util
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

	def test_print_settings_are_repaired_to_the_release_generator(self):
		self.install._sync_pdf_generator()

		self.assertEqual(self.print_settings.pdf_generator, "chrome")
		self.assertEqual(self.print_settings.repeat_header_footer, 0)
		self.print_settings.save.assert_called_once_with(ignore_permissions=True)

	def test_chrome_disables_the_clipping_prone_separate_header_merge(self):
		self.print_settings.pdf_generator = "chrome"

		self.install._sync_pdf_generator()

		self.assertEqual(self.print_settings.repeat_header_footer, 0)
		self.print_settings.save.assert_called_once_with(ignore_permissions=True)

	def test_matching_print_settings_remain_a_no_op(self):
		self.print_settings.pdf_generator = "chrome"
		self.print_settings.repeat_header_footer = 0

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


if __name__ == "__main__":
	unittest.main()
