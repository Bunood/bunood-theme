"""The thermal receipt head embeds a private Company logo the PDF engine can read.

Renders `thermal_head` from `templates/bunood_print_macros.html` with plain Jinja2;
`bunood_print_image_src` is stubbed the way printing/jinja.py behaves for a
private file (a data URI), so no Frappe is needed.
"""

from pathlib import Path
from types import SimpleNamespace
import unittest

import jinja2


ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"


class Company(dict):
	__getattr__ = dict.get


def render(logo, *, resolver=True):
	company = Company(company_name="Fixture Co", company_logo=logo, tax_id="300000000000003")
	env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
	env.globals["frappe"] = SimpleNamespace(
		get_doc=lambda doctype, name: company,
		db=SimpleNamespace(exists=lambda *args: True),
	)
	if resolver:
		env.globals["bunood_print_image_src"] = (
			lambda value: "data:image/png;base64,QUJD" if value.startswith("/private/") else value
		)
	template = env.from_string(
		'{% from "templates/bunood_print_macros.html" import thermal_head %}'
		'{{ thermal_head(doc, "فاتورة", "Invoice") }}'
	)
	return template.render(doc={"company": "Fixture Co"})


class ThermalLogoTests(unittest.TestCase):
	def test_a_private_logo_is_embedded(self):
		html = render("/private/files/logo.png")
		self.assertIn('src="data:image/png;base64,QUJD"', html)
		self.assertNotIn("/private/files/logo.png", html)

	def test_a_public_logo_keeps_its_url(self):
		self.assertIn('src="/files/logo.png"', render("/files/logo.png"))

	def test_without_the_resolver_the_stored_url_is_used(self):
		self.assertIn('src="/private/files/logo.png"', render("/private/files/logo.png", resolver=False))

	def test_no_logo_prints_no_image(self):
		self.assertNotIn("bnd-p-th-logo", render(""))


if __name__ == "__main__":
	unittest.main()
