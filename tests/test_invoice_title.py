"""ZATCA document titles on the shared A4 invoice (v0.48.2).

The template shipped in v0.48.0 titled every sale «فاتورة مبيعات». A sale by a
VAT-registered seller is a tax invoice; the wording follows the official
formats exactly.
"""

from pathlib import Path
import types
import unittest

try:
	import jinja2
except ImportError:  # pragma: no cover - jinja2 ships with Frappe
	jinja2 = None


TEMPLATE = Path(__file__).resolve().parents[1] / "bunood_theme/templates/bunood_invoice_a4.html"


def title(doctype, seller_vat, buyer_vat, is_return, language="ar"):
	source = TEMPLATE.read_text(encoding="utf-8")
	head = source[: source.index('<div class="bnd-invoice"')]
	values = {"doctype": doctype, "company_tax_id": seller_vat, "tax_id": buyer_vat, "is_return": is_return}
	doc = types.SimpleNamespace(doctype=doctype, get=values.get)
	out = jinja2.Environment().from_string(head + "\n@@{{ title_ar }}|{{ title_en }}").render(
		doc=doc, bnd_print_language=language, frappe=None
	)
	return tuple(out.rsplit("@@", 1)[1].strip().split("|"))


@unittest.skipIf(jinja2 is None, "jinja2 not installed")
class InvoiceTitleTests(unittest.TestCase):
	def test_standard_tax_invoice_when_the_buyer_has_a_vat_number(self):
		self.assertEqual(title("Sales Invoice", "300000000000003", "311111111100003", 0), ("فاتورة ضريبية", "Tax Invoice"))

	def test_simplified_tax_invoice_for_a_buyer_without_vat(self):
		self.assertEqual(title("Sales Invoice", "300000000000003", None, 0), ("فاتورة ضريبية مبسطة", "Simplified Tax Invoice"))

	def test_returns_are_credit_notes(self):
		self.assertEqual(title("Sales Invoice", "300000000000003", "311111111100003", 1), ("إشعار دائن", "Credit Note"))
		self.assertEqual(title("Sales Invoice", "300000000000003", None, 1), ("إشعار دائن مبسط", "Simplified Credit Note"))

	def test_a_seller_without_vat_issues_a_plain_sales_invoice(self):
		self.assertEqual(title("Sales Invoice", None, "311111111100003", 0), ("فاتورة مبيعات", "Sales Invoice"))

	def test_purchase_documents_keep_their_own_titles(self):
		self.assertEqual(title("Purchase Invoice", "300000000000003", "311111111100003", 0), ("فاتورة مشتريات", "Purchase Invoice"))
		self.assertEqual(title("Purchase Invoice", "300000000000003", None, 1), ("مرتجع مشتريات", "Purchase Return"))


if __name__ == "__main__":
	unittest.main()
