"""VAT-inclusive pricing (the pre-merge review of v0.60.0, finding 1): the owner sells with
prices INCLUDING VAT every day, and the prints must be exactly right.

With a tax row «included in the print rate», ERPNext keeps `rate` / `price_list_rate` / `amount`
INCLUDING VAT and only `net_rate` / `net_amount` exclusive. The kit took the unit price and the
"before discount" figure from the inclusive fields and the taxable amount from the exclusive one,
so one item at 115 incl. VAT printed unit 115, a discount of 15 (the VAT), taxable 100, VAT 15.

The documents below carry the figures ERPNext 16.34 computes for them (measured on the lab with
`calculate_taxes_and_totals`, 2026-10-15). Every printed figure must reconcile with ERPNext's own
fields: gross − discount = net_total; net_total + VAT = grand_total.
"""

from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_print_kit import VIEW, VIEW_MODULES, Doc, render  # noqa: E402


def vat_row(amount, after=None, inclusive=1):
    return Doc(name="T1", description="VAT 15%", account_head="VAT 15% - C", rate=15, charge_type="On Net Total",
               included_in_print_rate=inclusive, tax_amount=amount,
               tax_amount_after_discount_amount=amount if after is None else after)


def invoice(items, net_total, vat, grand_total, **over):
    base = dict(doctype="Sales Invoice", name="SINV-INC", company="C", company_tax_id="300000000000003",
                currency="SAR", conversion_rate=1, docstatus=1, net_total=net_total,
                total_taxes_and_charges=vat, grand_total=grand_total, rounded_total=0, rounding_adjustment=0,
                outstanding_amount=0, taxes=[vat_row(vat)], items=items)
    base.update(over)
    return Doc(base)


#: 1 × 115 incl. VAT, no discount.
PLAIN = invoice([Doc(name="R1", item_code="P", item_name="طابعة", qty=1, price_list_rate=115, rate=115, amount=115,
                     net_rate=100, net_amount=100, distributed_discount_amount=0)], 100, 15, 115)
#: The same item with a 10 % line discount: 103.50 incl. VAT.
LINE_DISCOUNT = invoice([Doc(name="R1", item_code="P", item_name="طابعة", qty=1, price_list_rate=115, rate=103.5,
                             amount=103.5, net_rate=90, net_amount=90, distributed_discount_amount=0,
                             discount_percentage=10)], 90, 13.5, 103.5)
#: The same item, 11.50 off the grand total (the counter's «خصم على الفاتورة»): ERPNext spreads 10.00
#: exclusive over the line and keeps the rate inclusive at 115.
INVOICE_DISCOUNT = invoice([Doc(name="R1", item_code="P", item_name="طابعة", qty=1, price_list_rate=115, rate=115,
                                amount=115, net_rate=90, net_amount=90, distributed_discount_amount=10)],
                           90, 13.5, 103.5, apply_discount_on="Grand Total", discount_amount=11.5,
                           taxes=[vat_row(15, after=13.5)])
#: Two lines whose exclusive prices do not end in cents (3 × 10.00 and 7 × 3.33 incl. VAT).
CENTS = invoice([Doc(name="R1", item_code="A", item_name="ورق", qty=3, price_list_rate=10, rate=10, amount=30,
                     net_rate=8.7, net_amount=26.09, distributed_discount_amount=0),
                 Doc(name="R2", item_code="B", item_name="قلم", qty=7, price_list_rate=3.33, rate=3.33, amount=23.31,
                     net_rate=2.9, net_amount=20.27, distributed_discount_amount=0)], 46.36, 6.95, 53.31)
#: Exclusive pricing with a line discount and 10.00 off the net total: unchanged by the fix.
EXCLUSIVE = invoice([Doc(name="R1", item_code="P", item_name="طابعة", qty=2, price_list_rate=100, rate=90, amount=180,
                         net_rate=85, net_amount=170, distributed_discount_amount=10)],
                    170, 25.5, 195.5, apply_discount_on="Net Total", discount_amount=10,
                    taxes=[vat_row(25.5, inclusive=0)])


def figures(doc):
    with patch.dict(sys.modules, VIEW_MODULES):
        items = VIEW.lines(doc)
        return items, VIEW.totals(doc, items)


def money(text):
    return float(str(text).replace(",", "") or 0)


class InclusiveFiguresTests(unittest.TestCase):
    def assertReconciles(self, doc, items, totals):
        """The printed figures add up, line by line and in the totals, to ERPNext's own fields."""
        for line in items:
            self.assertAlmostEqual(money(line["taxable"]) + money(line["vat"]), money(line["total"]), places=2)
        self.assertAlmostEqual(money(totals["gross"]) - money(totals["discount"]), doc.net_total, places=2)
        self.assertEqual(money(totals["taxable"]), doc.net_total)
        self.assertAlmostEqual(money(totals["taxable"]) + money(totals["vat"]) + money(totals.get("rounding")),
                               money(totals["grand"]), places=2)
        self.assertEqual(money(totals["grand"]), doc.grand_total)

    def test_an_inclusive_price_is_not_a_discount(self):
        items, totals = figures(PLAIN)
        line = items[0]
        self.assertEqual((line["unit"], line["rate"], line["discount"]), ("100.00", "100.00", ""),
                         "the unit price is net_rate; nothing was discounted")
        self.assertEqual((line["taxable"], line["vat"], line["total"], line["unit_incl"]),
                         ("100.00", "15.00", "115.00", "115.00"))
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"], totals["vat"], totals["grand"]),
                         ("100.00", "", "100.00", "15.00", "115.00"))
        self.assertReconciles(PLAIN, items, totals)

    def test_a_line_discount_is_exclusive_too(self):
        items, totals = figures(LINE_DISCOUNT)
        line = items[0]
        self.assertEqual((line["unit"], line["rate"], line["discount"], line["taxable"]),
                         ("100.00", "90.00", "10.00", "90.00"), "115 incl. is 100 excl.; 10 % off it is 10")
        self.assertEqual((line["vat"], line["total"], line["unit_incl"]), ("13.50", "103.50", "103.50"))
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"], totals["vat"], totals["grand"]),
                         ("100.00", "10.00", "90.00", "13.50", "103.50"))
        self.assertReconciles(LINE_DISCOUNT, items, totals)

    def test_a_discounted_price_that_does_not_end_in_cents(self):
        # The lab's ACC-SINV-2026-00042 line: 4 × 212.75 incl. VAT, 10 % off -> rate 191.48.
        doc = invoice([Doc(name="R1", item_code="P", item_name="ورق", qty=4, price_list_rate=212.75, rate=191.48,
                           amount=765.92, net_rate=166.5, net_amount=666.02, distributed_discount_amount=0,
                           discount_percentage=10)], 666.02, 99.9, 765.92)
        items, totals = figures(doc)
        line = items[0]
        self.assertEqual((line["unit"], line["rate"], line["discount"], line["taxable"]),
                         ("185.00", "166.505", "73.98", "666.02"), "212.75 incl. is 185.00 excl., not 185.0004")
        self.assertEqual((totals["gross"], totals["discount"]), ("740.00", "73.98"))
        self.assertReconciles(doc, items, totals)

    def test_an_invoice_discount_is_the_lines_share_of_it(self):
        items, totals = figures(INVOICE_DISCOUNT)
        line = items[0]
        self.assertEqual((line["unit"], line["rate"], line["discount"], line["taxable"]),
                         ("100.00", "100.00", "10.00", "90.00"),
                         "the price before the invoice discount; its exclusive share is the discount")
        self.assertEqual((line["vat"], line["total"]), ("13.50", "103.50"))
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"], totals["vat"], totals["grand"]),
                         ("100.00", "10.00", "90.00", "13.50", "103.50"))
        self.assertReconciles(INVOICE_DISCOUNT, items, totals)

    def test_an_invoice_saved_without_the_lines_share_still_prints_it(self):
        legacy = Doc(INVOICE_DISCOUNT, items=[Doc(INVOICE_DISCOUNT["items"][0], distributed_discount_amount=None)])
        items, totals = figures(legacy)
        self.assertEqual((items[0]["unit"], items[0]["discount"]), ("100.00", "10.00"))
        self.assertEqual(totals["discount"], "10.00")

    def test_prices_that_do_not_end_in_cents(self):
        items, totals = figures(CENTS)
        self.assertEqual([line["discount"] for line in items], ["", ""])
        self.assertEqual(items[0]["rate"], "8.6967", "qty × price is the taxable amount, not net_rate's 8.70 × 3")
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"]), ("46.36", "", "46.36"))
        self.assertReconciles(CENTS, items, totals)

    def test_the_cent_erpnext_keeps_out_of_the_tax_rows_prints_as_rounding(self):
        # adjust_grand_total_for_inclusive_tax: grand_total = net_total + taxes + up to 0.05.
        kept = Doc(CENTS, grand_total=53.32)
        items, totals = figures(kept)
        self.assertEqual(totals["rounding"], "0.01")
        self.assertReconciles(kept, items, totals)
        far = Doc(CENTS, grand_total=60)
        self.assertEqual(figures(far)[1]["rounding"], "", "anything larger is not a rounding")

    def test_exclusive_pricing_is_unchanged(self):
        items, totals = figures(EXCLUSIVE)
        line = items[0]
        self.assertEqual((line["unit"], line["rate"], line["discount"], line["taxable"], line["vat"], line["total"]),
                         ("100.00", "90.00", "30.00", "170.00", "25.50", "195.50"))
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"], totals["grand"]),
                         ("200.00", "30.00", "170.00", "195.50"))
        self.assertReconciles(EXCLUSIVE, items, totals)


def kit_page(template, doc, **context):
    """A kit template rendered with the REAL figures (printing/view.py) for `doc`."""
    from bs4 import BeautifulSoup
    import jinja2

    from test_print_kit import BUYER, PROFILE_DATA, ROOT

    def invoice_view(d, simplified=False):
        with patch.dict(sys.modules, VIEW_MODULES):
            return VIEW.invoice_view(d, simplified)

    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
    env.globals.update(
        bunood_print_language=lambda: "ar",
        bunood_print_profile=lambda d: PROFILE_DATA,
        bunood_buyer_profile=lambda d: dict(BUYER, cells=[]),
        bunood_invoice_view=invoice_view,
        bunood_zatca_qr_src=lambda d: "data:image/png;base64,QR",
        bunood_print_kit_css=lambda: "/* kit */",
        bunood_receipt_extras=lambda d: {"customer": "", "service": {}, "barcode": ""},
    )
    values = {"no_letterhead": 0, "print_settings": None, "zo_kind": "standard", "zo_width": 80, "zo_b2b": False}
    values.update(context)
    return BeautifulSoup(env.get_template(template).render(doc=doc, **values), "html.parser")


class InclusivePrintsTests(unittest.TestCase):
    """One inclusive invoice of 1 × 115 through every sales print: nothing says 115 where the
    exclusive price belongs, and no print shows a discount."""

    render = staticmethod(kit_page)

    def receipt_figures(self, page):
        return [[td.get_text(" ", strip=True) for td in tr.select("td.q, td.n")] for tr in page.select(".zo-rcpt-items tbody tr")]

    def totals(self, page, selector):
        return {tr.select_one("td.k").get_text(" ", strip=True): tr.select_one("td.v").get_text(" ", strip=True)
                for tr in page.select(selector + " tr")}

    def test_the_a4_tax_invoice(self):
        page = self.render("templates/print/sales_invoice_a4.html", PLAIN)
        cells = [td.get_text(" ", strip=True) for td in page.select(".zo-items tbody tr")[0].select("td")]
        self.assertEqual(cells[5:], ["100.00", "—", "100.00", "15%", "15.00", "115.00"],
                         "unit excl., no discount, taxable, VAT, total incl.")
        labels = [td.get_text(" ", strip=True) for td in page.select(".zo-totals td.k")]
        self.assertFalse([k for k in labels if k.startswith("الخصم")], "no discount row")
        self.assertIn("115.00", page.select_one(".zo-totals tr.g").get_text())

    def test_the_a4_simplified_invoice(self):
        page = self.render("templates/print/sales_invoice_a4.html", PLAIN, zo_kind="simplified")
        cells = [td.get_text(" ", strip=True) for td in page.select(".zo-items tbody tr")[0].select("td")]
        self.assertEqual(cells[2:], ["1", "115.00", "115.00"], "the lean shape keeps prices incl. VAT")
        self.assertNotIn("الخصم", page.select_one(".zo-totals").get_text(" "))

    def test_the_80mm_and_58mm_receipts(self):
        page = self.render("templates/print/sales_receipt.html", PLAIN)
        self.assertEqual(self.receipt_figures(page), [["1", "115.00", "115.00"]])
        self.assertNotIn("الخصم", page.select_one(".zo-rcpt-tot").get_text(" "))
        narrow = self.render("templates/print/sales_receipt.html", PLAIN, zo_width=58)
        self.assertIn("1 × 115.00", narrow.select_one(".zo-rcpt-items .unit").get_text())
        self.assertNotIn("الخصم", narrow.select_one(".zo-rcpt-tot").get_text(" "))

    def test_the_b2b_thermal_prints_prices_excluding_vat(self):
        page = self.render("templates/print/sales_receipt.html", PLAIN, zo_b2b=True)
        self.assertIn("Prices excl. VAT", page.select_one(".zo-rcpt__note").get_text())
        self.assertEqual(self.receipt_figures(page), [["1", "100.00", "115.00"]], "net_rate under «Prices excl. VAT»")
        self.assertNotIn("الخصم", page.select_one(".zo-rcpt-tot").get_text(" "))



#: 1 × 115 incl. VAT with 10.00 off the grand total as a CASH discount: ERPNext takes it off the
#: grand total after tax and spreads none of it over the line.
CASH_DISCOUNT = Doc(PLAIN, grand_total=105, apply_discount_on="Grand Total", discount_amount=10,
                    is_cash_or_non_trade_discount=1)


def rows(page, selector, label="td.k", value="td.v"):
    out = []
    for tr in page.select_one(selector).select("tr"):
        k, v = tr.select_one(label), tr.select_one(value)
        figure = re.search(r"[\d,]+\.\d{2}", v.get_text(" ", strip=True))
        out.append((k.get_text(" ", strip=True), money(figure.group(0)) if figure else None))
    return out


class TotalsReadDownTests(unittest.TestCase):
    """Top to bottom the totals add up: a discount is shown off the figure it was taken from,
    before the taxable amount — never under it (the receipt printed «قبل الضريبة 90 / الخصم 10 /
    الضريبة 13.50 / الإجمالي 103.50», which reads 90 − 10 + 13.50)."""

    def assertAddsUp(self, figures, labels):
        self.assertEqual([k for k, _v in figures][:len(labels)], labels)
        values = [v for _k, v in figures]
        before, discount, taxable, vat, total = values[:5]
        self.assertAlmostEqual(before - discount, taxable, places=2)
        self.assertAlmostEqual(taxable + vat, total, places=2)

    def test_the_80mm_receipt(self):
        page = kit_page("templates/print/sales_receipt.html", LINE_DISCOUNT)
        self.assertAddsUp(rows(page, ".zo-rcpt-tot"), [
            "الإجمالي قبل الخصم Gross", "الخصم Discount", "الإجمالي قبل الضريبة Subtotal",
            "ضريبة القيمة المضافة 15% VAT", "الإجمالي Total"])

    def test_the_58mm_receipt(self):
        page = kit_page("templates/print/sales_receipt.html", LINE_DISCOUNT, zo_width=58)
        self.assertAddsUp(rows(page, ".zo-rcpt-tot"), ["قبل الخصم", "الخصم", "قبل الضريبة", "الضريبة 15%", "الإجمالي"])

    def test_the_dot_matrix(self):
        page = kit_page("templates/print/matrix.html", LINE_DISCOUNT)
        self.assertAddsUp(rows(page, ".zo-m-tot", label="td:first-child", value="td.n"), [
            "الإجمالي قبل الخصم", "الخصم", "الإجمالي قبل الضريبة", "ضريبة القيمة المضافة 15%",
            "الإجمالي شامل الضريبة (SAR)"])

    def test_a_cash_discount_is_printed_after_tax(self):
        for template, selector, context in (("templates/print/sales_invoice_a4.html", ".zo-totals", {}),
                                            ("templates/print/sales_receipt.html", ".zo-rcpt-tot", {})):
            with self.subTest(template=template):
                figures = dict(rows(kit_page(template, CASH_DISCOUNT, **context), selector))
                cash = next(v for k, v in figures.items() if k.startswith("خصم نقدي"))
                taxable = next(v for k, v in figures.items() if k.startswith(("الإجمالي الخاضع", "الإجمالي قبل الضريبة")))
                vat = next(v for k, v in figures.items() if k.startswith("ضريبة القيمة المضافة"))
                total = next(v for k, v in figures.items() if k.startswith(("الإجمالي شامل", "الإجمالي Total")))
                self.assertEqual((taxable, vat, cash, total), (100, 15, 10, 105), "100 + 15 − 10 = 105")


if __name__ == "__main__":
    unittest.main()
