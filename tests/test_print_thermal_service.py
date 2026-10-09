"""The thermal receipt head prints the restaurant line only when the invoice carries one.

Renders `thermal_head` from `templates/bunood_print_macros.html` with plain Jinja2 and a
stubbed `frappe`, like test_print_thermal_logo.py: «محلي · طاولة 7» for a dine-in sale,
«سفري · رقم الاستلام #214» for a takeaway, and nothing at all for an ordinary invoice.
"""

from pathlib import Path
from types import SimpleNamespace
import unittest

import jinja2


ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"
TITLES = {"dine-in": "محلي", "takeaway": "سفري"}


class Company(dict):
	__getattr__ = dict.get


class Doc(dict):
	__getattr__ = dict.get


def render(doc, *, order_types=True):
	company = Company(company_name="Fixture Co", tax_id="300000000000003")
	env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
	env.globals["frappe"] = SimpleNamespace(
		get_doc=lambda doctype, name: company,
		db=SimpleNamespace(
			exists=lambda doctype, name=None: order_types if name == "Dining Order Type" else True,
			get_value=lambda doctype, name, field: TITLES.get(name),
		),
	)
	template = env.from_string(
		'{% from "templates/bunood_print_macros.html" import thermal_head %}'
		'{{ thermal_head(doc, "فاتورة", "Invoice") }}'
	)
	return template.render(doc=Doc(company="Fixture Co", **doc))


class ThermalServiceLineTests(unittest.TestCase):
	def test_dine_in_prints_type_and_table(self):
		html = render({"custom_bunood_order_type": "dine-in", "custom_bunood_table": "7"})
		self.assertIn("<b>محلي</b>", html)
		self.assertIn('طاولة <b dir="ltr">7</b>', html)
		self.assertNotIn("رقم الاستلام", html)

	def test_takeaway_prints_the_pickup_number(self):
		html = render({"custom_bunood_order_type": "takeaway", "custom_bunood_pickup_no": "214"})
		self.assertIn("<b>سفري</b>", html)
		self.assertIn('رقم الاستلام <b dir="ltr">#214</b>', html)
		self.assertNotIn("طاولة", html)

	def test_an_ordinary_invoice_prints_no_service_line(self):
		html = render({})
		self.assertNotIn("طاولة", html)
		self.assertNotIn("رقم الاستلام", html)
		self.assertNotIn("<b>", html)

	def test_without_the_restaurant_app_the_stored_code_prints(self):
		html = render({"custom_bunood_order_type": "dine-in"}, order_types=False)
		self.assertIn("<b>dine-in</b>", html)

	def test_values_are_escaped(self):
		html = render({"custom_bunood_order_type": "dine-in", "custom_bunood_table": "<i>7</i>"})
		self.assertIn("&lt;i&gt;7&lt;/i&gt;", html)


if __name__ == "__main__":
	unittest.main()
