"""The print kit (the owner's redesign, 2026-10-15), rendered and computed without a site.

Templates render with plain Jinja2 and stubbed jinja methods; printing/view.py and
printing/profile.py load against a small fake `frappe`. What is pinned here is what the owner
asked for and what the market study added: the bilingual mirror header, the foot's two things
and the policy under it, the totals on the physical RIGHT and the QR on the physical LEFT, the
lean simplified columns, a credit note's reference strip, no QR and a watermark on a draft,
never «ملغاة» on a tax document, and the arithmetic the tables print.
"""

from datetime import date
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup
import jinja2

ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"


def fake_frappe():
    frappe = ModuleType("frappe")
    utils = ModuleType("frappe.utils")
    utils.flt = lambda value, precision=None: float(value or 0)
    utils.getdate = lambda value: value if isinstance(value, date) else date.fromisoformat(str(value))
    utils.strip_html = lambda text: text
    utils.escape_html = lambda text: text
    frappe.utils = utils
    frappe._ = lambda text, *args, **kwargs: text
    frappe.db = SimpleNamespace(exists=lambda *a, **k: False, get_value=lambda *a, **k: None)
    frappe.get_cached_value = lambda *a, **k: "300000000000003"
    return frappe, utils


def load(name, relative):
    frappe, utils = fake_frappe()
    jinja = ModuleType("bunood_theme.printing.jinja")
    jinja.bunood_item_vat_map = lambda doc: {}
    jinja.bunood_amount_in_words = lambda amount, currency, precision=2: "ألف ريال سعودي فقط لا غير"
    modules = {"frappe": frappe, "frappe.utils": utils, "bunood_theme.printing.jinja": jinja}
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module, modules


VIEW, VIEW_MODULES = load("isolated_print_view", "printing/view.py")
PROFILE, _ = load("isolated_print_profile", "printing/profile.py")
NAMES, _ = load("isolated_print_names", "printing/names.py")


class Doc(dict):
    __getattr__ = dict.get

    def get_formatted(self, field, *args):
        return str(self.get(field) or "")


PROFILE_DATA = {
    "name": "Oasis", "name_ar": "مؤسسة الواحة", "name_en": "Oasis Trading", "display": "مؤسسة الواحة",
    "vat": "300000000000003", "cr": "1010123456", "phone": "+966 11 000 0000",
    "address": {"building": "8228", "street": "طريق الملك فهد", "district": "حي العليا", "city": "الرياض",
                "postal": "12214", "additional": "2121", "country": "Saudi Arabia",
                "line": "8228 طريق الملك فهد، حي العليا، الرياض 12214، الرقم الإضافي 2121"},
    "contacts": [{"key": "phone", "value": "+966 11 000 0000"}, {"key": "instagram", "value": "@oasis"}],
    "policy": "الاستبدال خلال 7 أيام.", "logo": "data:image/png;base64,AAAA", "stamp": "", "signature": "",
    "signatory": "", "bank": {"bank": "مصرف", "iban": "SA0000", "account": "", "name": "الواحة"},
}
BUYER = {"name": "شركة الأفق", "name_ar": "", "vat": "310000000000003", "cr": "4030987654", "ids": [],
         "address": {k: "" for k in ("building", "street", "district", "city", "postal", "additional", "country", "line")},
         "address_text": "", "phone": ""}


def view(**over):
    base = {
        "title_ar": "فاتورة ضريبية", "title_en": "Tax Invoice", "number": "SINV-1", "issued": "2026-10-15 10:42",
        "date": "2026-10-15", "due": "", "terms_template": "", "method": ("آجل", "On credit"), "po": "",
        "po_date": "", "sales_person": "", "branch": "", "currency": "SAR", "foreign": False, "conversion": 1,
        "cashier": "Cashier",
        "lines": [{"idx": 1, "code": "IT-1", "name": "صنف", "description": "", "uom": "عدد", "qty": "2",
                   "unit": "100.00", "rate": "100.00", "discount": "", "taxable": "200.00", "vat_rate": "15%",
                   "vat": "30.00", "total": "230.00", "unit_incl": "115.00", "treatment": ""}],
        "totals": {"gross": "200.00", "discount": "", "taxable": "200.00", "vat": "30.00", "vat_rate": "15",
                   "other": "", "rounding": "", "grand": "230.00", "grand_value": 230.0, "currency": "SAR",
                   "paid": "", "remaining": "", "change": "", "advance": ""},
        "payments": [], "reference": {}, "treatments": [], "words": "فقط مائتان وثلاثون ريالاً سعودياً لا غير",
        "draft": False, "cancelled": False,
    }
    base.update(over)
    return base


def render(template, doc, *, kind="standard", qr="data:image/png;base64,QR", v=None, language="ar", **context):
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
    env.globals.update(
        bunood_print_language=lambda: language,
        bunood_print_profile=lambda d: PROFILE_DATA,
        bunood_buyer_profile=lambda d: BUYER,
        bunood_invoice_view=lambda d, simplified=False: v or view(),
        bunood_zatca_qr_src=lambda d: qr,
        bunood_print_kit_css=lambda: "/* kit */",
        bunood_receipt_extras=lambda d: {"customer": "", "service": {}, "barcode": "<svg></svg>"},
    )
    context = {"no_letterhead": 0, "print_settings": None, **context}
    html = env.get_template(template).render(doc=doc, zo_kind=kind, zo_width=80, zo_b2b=False, **context)
    return BeautifulSoup(html, "html.parser")


SUBMITTED = Doc(doctype="Sales Invoice", name="SINV-1", docstatus=1, company="Oasis", company_tax_id="300000000000003")


class KitTemplateTests(unittest.TestCase):
    def test_header_is_a_physical_bilingual_mirror(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED)
        grid = page.select_one(".zo-head__grid")
        self.assertEqual(grid["dir"], "ltr", "the header's cells are placed physically")
        cells = [td["class"][0] for td in grid.select("td")]
        self.assertEqual(cells, ["zo-head__en", "zo-head__logo", "zo-head__ar"])
        self.assertIn("مؤسسة الواحة", grid.select_one(".zo-head__ar").get_text())
        self.assertIn("السجل التجاري", grid.select_one(".zo-head__ar").get_text())
        self.assertIn("الرقم الضريبي", grid.select_one(".zo-head__ar").get_text())
        self.assertIn("C.R.", grid.select_one(".zo-head__en").get_text())
        self.assertIn("VAT No.", grid.select_one(".zo-head__en").get_text())

    def test_foot_carries_the_address_and_the_contacts_then_the_policy(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED)
        foot = page.select_one(".zo-chrome-foot .zo-foot")
        cells = foot.select(".zo-foot__grid td")
        self.assertEqual([c["class"][0] for c in cells], ["zo-foot__addr", "zo-foot__contacts"])
        self.assertIn("الرقم الإضافي 2121", cells[0].get_text())
        self.assertEqual(len(cells[1].select(".zo-foot__c")), 2)
        self.assertIn("الاستبدال", foot.select_one(".zo-policy").get_text(), "a short policy repeats under the foot")

    def test_totals_sit_physically_right_and_the_qr_left(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED)
        row = page.select_one(".zo-sum")
        self.assertIn("zo-sum", row["class"])
        cells = row.select(":scope > tr > td")
        self.assertEqual([c["class"][0] for c in cells], ["zo-sum__qr", "zo-sum__gap", "zo-sum__tot"])
        self.assertIsNotNone(cells[0].select_one("img"))
        sheet = (ROOT / "templates/print/print_kit.css").read_text(encoding="utf-8")
        self.assertIn(".zo .zo-sum {\n\tdirection: ltr;", sheet, "the row is pinned LTR so the cells stay put")
        self.assertIn("الإجمالي شامل الضريبة", page.select_one(".zo-totals tr.g").get_text())

    def test_standard_has_eleven_columns_and_both_parties(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED)
        self.assertEqual(len(page.select(".zo-items thead th")), 11)
        self.assertEqual(len(page.select(".zo-party")), 2)
        self.assertIsNotNone(page.select_one(".zo-bank"))

    def test_simplified_is_lean(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED, kind="simplified",
                      v=view(title_ar="فاتورة ضريبية مبسطة", title_en="Simplified Tax Invoice"))
        heads = [th.contents[0].strip() for th in page.select(".zo-items thead th")]
        self.assertEqual(heads[0], "م")
        self.assertEqual(len(heads), 5)
        self.assertIn("شامل الضريبة", page.select(".zo-items thead th")[-1].get_text())
        self.assertEqual(page.select(".zo-party"), [], "the customer is one line")
        self.assertIsNotNone(page.select_one(".zo-customer"))

    def test_a_credit_note_carries_its_reference_strip(self):
        doc = Doc(SUBMITTED, is_return=1)
        page = render("templates/print/sales_invoice_a4.html", doc, v=view(
            title_ar="إشعار دائن", title_en="Credit Note",
            reference={"originals": ["SINV-0"], "date": "2026-10-01", "reason": "صنف تالف"}))
        self.assertIn("إشعار دائن", page.select_one(".zo-title").get_text())
        strip = page.select_one(".zo-ref").get_text()
        for part in ("SINV-0", "2026-10-01", "صنف تالف"):
            self.assertIn(part, strip)
        self.assertIsNone(page.select_one(".zo-bank"), "a credit note asks for no transfer")

    def test_a_draft_has_a_watermark_and_no_qr(self):
        doc = Doc(SUBMITTED, docstatus=0)
        page = render("templates/print/sales_invoice_a4.html", doc, qr="data:image/png;base64,QR")
        self.assertIn("مسودة", page.select_one(".zo-wm").get_text())
        self.assertIsNone(page.select_one(".zo-qr img"))
        self.assertIsNotNone(page.select_one(".zo-qr__missing"))

    def test_a_cancelled_tax_document_never_says_cancelled(self):
        page = render("templates/print/sales_invoice_a4.html", Doc(SUBMITTED, docstatus=2))
        self.assertNotIn("ملغاة", page.get_text())
        self.assertNotIn("CANCELLED", page.get_text())

    def test_no_letterhead_drops_the_page_chrome(self):
        page = render("templates/print/sales_invoice_a4.html", SUBMITTED, no_letterhead=1)
        self.assertIsNone(page.select_one(".zo-chrome-head"))
        self.assertIsNone(page.select_one(".zo-chrome-foot"))

    def test_the_receipt_is_tabular_and_sized_for_the_roll(self):
        page = render("templates/print/sales_receipt.html", SUBMITTED, v=view(
            title_ar="فاتورة ضريبية مبسطة", title_en="Simplified Tax Invoice",
            payments=[{"method": "نقد", "amount": "300.00"}],
            totals=dict(view()["totals"], paid="300.00", change="70.00")))
        style = page.select_one("style").get_text()
        self.assertRegex(style, r"\.print-format \{ page-width: 80mm; page-height: \d+mm;")
        heads = [th.contents[0].strip() for th in page.select(".zo-rcpt-items thead th")]
        self.assertEqual(heads, ["الصنف", "الكمية", "السعر", "الإجمالي"])
        self.assertIn("الإجمالي", page.select_one(".zo-rcpt-tot tr.g").get_text())
        self.assertIn("الباقي", page.get_text())
        self.assertIsNotNone(page.select_one(".zo-rcpt__qr img"))
        self.assertIn("شكراً لزيارتكم", page.get_text())

    def test_nothing_shipped_says_the_banned_return_phrase(self):
        for path in (ROOT / "templates/print").iterdir():
            self.assertNotIn("لا ترد ولا تستبدل", path.read_text(encoding="utf-8"), path.name)


class ViewTests(unittest.TestCase):
    def test_numbers_and_dates(self):
        self.assertEqual(VIEW.num(1234.5), "1,234.50")
        self.assertEqual(VIEW.num(-12.345), "12.35", "credit notes print positive, half up")
        self.assertEqual(VIEW.price(12.3456), "12.3456")
        self.assertEqual(VIEW.price(12.5), "12.50")
        self.assertEqual(VIEW.qty(-3), "3")
        self.assertEqual(VIEW.date("2026-10-05"), "2026-10-05")
        self.assertEqual(VIEW.time("09:05:33.1"), "09:05")

    def test_titles(self):
        doc = Doc(company_tax_id="300000000000003")
        self.assertEqual(VIEW.title(doc, False), ("فاتورة ضريبية", "Tax Invoice"))
        self.assertEqual(VIEW.title(doc, True), ("فاتورة ضريبية مبسطة", "Simplified Tax Invoice"))
        self.assertEqual(VIEW.title(Doc(doc, is_return=1), False), ("إشعار دائن", "Credit Note"))
        self.assertEqual(VIEW.title(Doc(doc, is_return=1), True), ("إشعار دائن مبسط", "Simplified Credit Note"))
        self.assertEqual(VIEW.title(Doc(doc, is_debit_note=1), False), ("إشعار مدين", "Debit Note"))

    def test_lines_and_totals_add_up(self):
        doc = Doc(
            company="C", company_tax_id="3", currency="SAR", conversion_rate=1, docstatus=1,
            net_total=270, total_taxes_and_charges=40.5, grand_total=310.5, rounded_total=0,
            outstanding_amount=0,
            taxes=[Doc(name="T1", description="VAT 15%", account_head="VAT", rate=15, charge_type="On Net Total",
                       tax_amount=40.5, tax_amount_after_discount_amount=40.5)],
            items=[Doc(name="R1", item_code="A", item_name="A", qty=2, rate=90, price_list_rate=100, net_amount=180, amount=180),
                   Doc(name="R2", item_code="B", item_name="B", qty=1, rate=90, price_list_rate=0, net_amount=90, amount=90)],
        )
        with patch.dict(sys.modules, VIEW_MODULES):
            lines = VIEW.lines(doc)
            totals = VIEW.totals(doc)
        self.assertEqual((lines[0]["unit"], lines[0]["discount"], lines[0]["taxable"]), ("100.00", "20.00", "180.00"))
        self.assertEqual((lines[0]["vat"], lines[0]["total"], lines[0]["unit_incl"]), ("27.00", "207.00", "103.50"))
        self.assertEqual(lines[1]["discount"], "", "no price list price, no discount")
        self.assertEqual((totals["gross"], totals["discount"], totals["taxable"]), ("290.00", "20.00", "270.00"))
        self.assertEqual((totals["vat"], totals["vat_rate"], totals["grand"]), ("40.50", "15", "310.50"))
        self.assertEqual(totals["paid"], "310.50")

    def test_a_return_settles_nothing(self):
        self.assertEqual(VIEW.method(Doc(is_return=1, bunood_settlement_method="On Credit")), ("", ""))

    def test_code128_checksum_and_shape(self):
        values = VIEW.code128_values("SINV-1")
        self.assertEqual(values[0], 104)
        self.assertEqual(values[-1], 106)
        body = values[1:-2]
        self.assertEqual(values[-2], (104 + sum(i * v for i, v in enumerate(body, start=1))) % 103)
        self.assertEqual(len(VIEW.CODE128), 107)
        self.assertTrue(all(sum(map(int, p)) == 11 for p in VIEW.CODE128[:106]))
        self.assertEqual(VIEW.code128_svg("فاتورة"), "", "set B carries ASCII only")


class ProfileTests(unittest.TestCase):
    def test_social_handles_and_websites_print_tidy(self):
        self.assertEqual(PROFILE.handle("https://www.instagram.com/oasis/"), "@oasis")
        self.assertEqual(PROFILE.handle("@oasis"), "@oasis")
        self.assertEqual(PROFILE.handle(""), "")
        self.assertEqual(PROFILE.website("https://www.oasis.sa/"), "www.oasis.sa")

    def test_names_resolve_by_script(self):
        company = Doc(name="C", company_name="Oasis Trading")
        self.assertEqual(PROFILE.names(company), ("", "Oasis Trading"))
        company = Doc(name="C", company_name="مؤسسة الواحة")
        with patch.object(PROFILE, "_phase2_seller_name", return_value=""):
            self.assertEqual(PROFILE.names(company), ("مؤسسة الواحة", ""))
        company = Doc(name="C", company_name="Oasis", bnd_company_name_ar="الواحة", bnd_company_name_en="Oasis Est.")
        self.assertEqual(PROFILE.names(company), ("الواحة", "Oasis Est."))

    def test_the_national_address_in_one_line(self):
        parts = {"building": "8228", "street": "طريق الملك فهد", "district": "حي العليا", "city": "الرياض",
                 "postal": "12214", "additional": "2121"}
        self.assertEqual(PROFILE.address_line(parts), "8228 طريق الملك فهد، حي العليا، الرياض 12214، الرقم الإضافي 2121")
        self.assertEqual(PROFILE.address_line(parts, arabic=False),
                         "8228 طريق الملك فهد, حي العليا, الرياض 12214, Additional No. 2121")


class NamesTests(unittest.TestCase):
    def test_no_print_record_name_carries_the_brand(self):
        for key in dir(NAMES):
            value = getattr(NAMES, key)
            if key.isupper() and isinstance(value, str):
                self.assertNotRegex(value, r"Bunood|Zero One|بونود|بنود|زيرو ون", key)


if __name__ == "__main__":
    unittest.main()
