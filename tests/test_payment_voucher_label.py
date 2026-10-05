"""The payment voucher names the counterparty line by the payment type.

Renders `printing/formats/payment_entry_voucher.html` with plain Jinja2 (no
Frappe): an Internal Transfer has no payee, so it must not read "Paid To".
"""

from pathlib import Path
import re
import unittest

import jinja2


ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"
SOURCE = (ROOT / "printing/formats/payment_entry_voucher.html").read_text(encoding="utf-8")


class Doc(dict):
	__getattr__ = dict.get

	def get_formatted(self, field):
		return str(self.get(field, ""))


def label(payment_type):
	env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
	env.globals.update(bunood_print_setting=lambda field: "", bunood_print_language=lambda: "ar")
	doc = Doc(payment_type=payment_type, name="ACC-PAY-0001", posting_date="2026-10-03", paid_amount=10, party_name="X")
	html = env.from_string(SOURCE).render(doc=doc, no_letterhead=True, letter_head="", footer="", print_settings=None)
	return re.search(r'bnd-p-amountbox__l">([^<]*)<', html).group(1)


class VoucherLabelTests(unittest.TestCase):
	def test_each_payment_type_names_its_counterparty(self):
		self.assertEqual(label("Receive"), "استلمنا من / Received From")
		self.assertEqual(label("Pay"), "صرفنا إلى / Paid To")
		self.assertEqual(label("Internal Transfer"), "تحويل داخلي / Internal Transfer")


if __name__ == "__main__":
	unittest.main()
