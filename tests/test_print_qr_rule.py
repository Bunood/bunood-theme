"""The ZATCA QR macro: when a QR prints, and what the page says when it is absent.

Renders `templates/bunood_print_macros.html`'s `zatca_qr` with plain Jinja2 and
stubbed jinja methods, so it needs no Frappe. The rule (ported from the team's
release 0a8b549 into main's bilingual macros): a seller's tax invoice keeps its
QR whatever `print_qr` says, and a missing QR is explained in both languages.
"""

from pathlib import Path
import unittest

import jinja2


ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"


def render(doc, *, print_qr="Show", qr=None, required=False):
	env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
	env.globals["bunood_print_setting"] = lambda field: {"print_qr": print_qr, "print_qr_size": "Medium"}.get(field, "")
	env.globals["bunood_zatca_qr_src"] = lambda d: qr
	template = env.from_string(
		'{% from "templates/bunood_print_macros.html" import zatca_qr %}'
		"{{ zatca_qr(doc, 110, required=required) }}"
	)
	return template.render(doc=doc, required=required)


SELLER = {"doctype": "Sales Invoice", "company_tax_id": "300000000000003", "docstatus": 1}


class ZatcaQrRuleTests(unittest.TestCase):
	def test_a_tax_invoice_keeps_its_qr_when_the_setting_hides_it(self):
		html = render(SELLER, print_qr="Hide", qr="data:image/png;base64,AAAA")
		self.assertIn('class="bnd-p-qr"', html)
		self.assertIn("Invoice QR code", html)

	def test_hide_is_honoured_without_a_seller_vat_number(self):
		doc = {"doctype": "Sales Invoice", "company_tax_id": "", "docstatus": 1}
		self.assertNotIn("bnd-p-qr", render(doc, print_qr="Hide", qr="data:x"))
		quotation = {"doctype": "Quotation", "company_tax_id": "300000000000003", "docstatus": 1}
		self.assertNotIn("bnd-p-qr", render(quotation, print_qr="Hide", qr="data:x"))

	def test_a_missing_qr_on_a_tax_invoice_says_why_in_both_languages(self):
		draft = render(dict(SELLER, docstatus=0))
		self.assertIn("مسودة", draft)
		self.assertIn("Draft", draft)
		cancelled = render(dict(SELLER, docstatus=2))
		self.assertIn("فاتورة ملغاة", cancelled)
		self.assertIn("Cancelled invoice", cancelled)
		submitted = render(SELLER)
		self.assertIn("راجع إعدادات الربط", submitted)
		self.assertIn("review the connector setup", submitted)

	def test_a_required_qr_keeps_its_simplified_invoice_warning(self):
		doc = {"doctype": "Sales Invoice", "company_tax_id": "", "docstatus": 1}
		html = render(doc, print_qr="Hide", required=True)
		self.assertIn("not valid as a simplified tax invoice", html)

	def test_no_note_where_no_qr_is_expected(self):
		doc = {"doctype": "Sales Invoice", "company_tax_id": "", "docstatus": 1}
		self.assertNotIn("bnd-p-qr-missing", render(doc))


if __name__ == "__main__":
	unittest.main()
