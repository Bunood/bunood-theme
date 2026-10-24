"""«فاتورة ضريبية - مقاولات - A4» (the owner's approved mock, 2026-10-22), computed and rendered without a
site: printing/contracting.py against a fake `frappe`, the template with plain Jinja2 (test_print_kit's
harness). Pinned: the title «فاتورة ضريبية — مستخلص رقم (n) / Tax Invoice», no ZATCA word, the ladder in the screen's order with
only the rows the invoice carries, the net payable now in words (Arabic and English), the QR alone on
the physical LEFT and the ladder on the physical RIGHT, the business fields read through
`meta.has_field`, the contracting format's exception to Phase 2's own format, and the kit's larger logo.
"""

import importlib.util
import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import jinja2
from bs4 import BeautifulSoup
from test_print_kit import BUYER, PROFILE_DATA, ROOT, VIEW, Doc

FIELDS = {"bnd_is_progress", "bnd_progress_adjustments", "bnd_certificate_no", "bnd_work_description", "bnd_work_description_en", "bnd_supply_from", "bnd_supply_to", "bnd_project_label"}
WORDS_AR = "فقط تسعة وأربعون ألفًا وستمائة واثنان وخمسون ريالًا سعوديًا وواحد وخمسون هللة لا غير"


def load_contracting(fields=FIELDS, exists=True):
    frappe = ModuleType("frappe")
    utils = ModuleType("frappe.utils")
    utils.flt = lambda value, precision=None: round(float(value or 0), precision) if precision is not None else float(value or 0)
    utils.cint = lambda value: int(float(value or 0))
    frappe.utils = utils
    frappe.get_meta = lambda doctype: SimpleNamespace(has_field=lambda name: name in fields)
    frappe.db = SimpleNamespace(get_value=lambda doctype, name, field: "برج التعمير – الخبر", exists=lambda *a, **k: exists)
    jinja = ModuleType("bunood_theme.printing.jinja")
    jinja.bunood_amount_in_words = lambda amount, currency, precision=2: WORDS_AR.removeprefix("فقط ").removesuffix(" لا غير") + " فقط لا غير"
    names = ModuleType("bunood_theme.printing.names")
    names.CONTRACTING_INVOICE_A4 = "فاتورة ضريبية - مقاولات - A4"
    modules = {"frappe": frappe, "frappe.utils": utils, "bunood_theme.printing.view": VIEW, "bunood_theme.printing.jinja": jinja, "bunood_theme.printing.names": names}
    spec = importlib.util.spec_from_file_location("isolated_print_contracting", ROOT / "printing/contracting.py")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module, modules


def row(label, effect, amount, **values):
    return Doc(label=label, tax_effect=effect, amount=amount, **values)


def sample(**over):
    doc = Doc(
        doctype="Sales Invoice", name="ACC-SINV-2026-00031", docstatus=1, currency="SAR", total=58475.0, net_total=45718.49,
        total_taxes_and_charges=6857.77, grand_total=52576.26, total_advance=0, po_no="BPO3246873", project="PRJ-1",
        posting_date="2026-10-22", posting_time="14:37:05", is_progress=1, bnd_is_progress=1, bnd_certificate_no="PC09",
        bnd_work_description="توريد وتركيب أعمال التكييف", bnd_work_description_en="SUPPLY AND INSTALLATION OF HVAC WORKS",
        bnd_supply_from="2026-09-01", bnd_supply_to="2026-09-30",
        taxes=[Doc(description="VAT 15%", account_head="Output VAT", rate=15)],
        payment_schedule=[Doc(due_date="2026-11-21"), Doc(due_date="2027-03-31")],
        items=[Doc(idx=1, description="توريد وتركيب وحدات تكييف مخفي", bnd_description_en="Supply & installation", qty=6, uom="وحدة", rate=5850, amount=35100),
               Doc(idx=2, description="تمديد مجاري الهواء وعزلها", qty=310, uom="م²", rate=55, amount=17050),
               Doc(idx=3, description="اختبار وتشغيل وموازنة الهواء", qty=1, uom="مقطوعية", rate=6325, amount=6325)],
        bnd_progress_adjustments=[
            row("محتجز ضمان التنفيذ", "After VAT", 2923.75, label_en="Retention", basis="Percent", percent=5, due_date="2027-03-31"),
            row("استرداد دفعة مقدمة", "Before VAT", 5847.50, label_en="Advance recovery", basis="Percent", percent=10),
            row("خصم مخالفات الموقع", "Before VAT", 6909.01, label_en="Site back-charges", basis="Amount"),
        ],
    )
    doc.update(over)
    return doc


class ContractingViewTests(unittest.TestCase):
    def test_the_ladder_in_the_screens_order_whatever_the_entry_order(self):
        view = load_contracting()[0].contracting_view(sample())
        self.assertEqual([(r["en"], r["amount"]) for r in view["ladder"]], [
            ("Gross value of works", "58,475.00"),
            ("Advance recovery 10%", "(5,847.50)"),
            ("Site back-charges", "(6,909.01)"),
            ("Taxable amount", "45,718.49"),
            ("VAT 15%", "6,857.77"),
            ("Invoice total incl. VAT", "52,576.26"),
            ("Retention 5%", "(2,923.75)"),
            ("Net payable now", "49,652.51"),
        ])
        self.assertEqual(view["ladder"][-1]["cls"], "net")
        self.assertEqual((view["certificate"], view["po"], view["due"], view["start"], view["end"]), ("PC09", "BPO3246873", "2026-11-21", "2026-09-01", "2026-09-30"))

    def test_the_net_payable_now_in_words(self):
        view = load_contracting()[0].contracting_view(sample())
        self.assertEqual(view["words_ar"], WORDS_AR)
        self.assertEqual(view["words_en"], "Forty-nine thousand six hundred fifty-two Saudi riyals and fifty-one halalas only")

    def test_a_row_not_added_is_not_printed(self):
        rows = load_contracting()[0].contracting_view(sample(bnd_progress_adjustments=[], net_total=58475, total_taxes_and_charges=8771.25, grand_total=67246.25))["ladder"]
        self.assertEqual([r["en"] for r in rows], ["Gross value of works", "VAT 15%", "Invoice total incl. VAT", "Net payable now"])

    def test_the_theme_reads_no_business_field_it_does_not_have(self):
        contracting = load_contracting(fields=set())[0]
        self.assertFalse(contracting.is_contracting(sample()))
        view = contracting.contracting_view(sample())
        self.assertEqual(view["certificate"], "")
        self.assertEqual([r["en"] for r in view["ladder"]], ["Gross value of works", "VAT 15%", "Invoice total incl. VAT", "Net payable now"])

    def test_a_credit_note_is_not_a_contracting_invoice(self):
        self.assertFalse(load_contracting()[0].is_contracting(sample(is_return=1)))


class ContractingTemplateTests(unittest.TestCase):
    def render(self, doc, qr="data:image/png;base64,QR"):
        view = load_contracting()[0].contracting_view(doc)
        env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
        env.globals.update(
            _=lambda text: text,
            bunood_print_language=lambda: "ar",
            bunood_print_profile=lambda d: PROFILE_DATA,
            bunood_buyer_profile=lambda d: BUYER,
            bunood_contracting_view=lambda d: view,
            bunood_zatca_qr_src=lambda d: qr,
            bunood_print_kit_css=lambda: "/* kit */",
        )
        html = env.get_template("templates/print/contracting_invoice_a4.html").render(doc=doc, no_letterhead=0, print_settings=None)
        return BeautifulSoup(html, "html.parser")

    def test_the_title_is_a_tax_invoice_and_the_qr_stands_alone_on_the_left(self):
        page = self.render(sample())
        self.assertIn("فاتورة ضريبية", page.select_one(".t-name").get_text())
        self.assertIn("Tax Invoice", page.select_one(".t-name").get_text())
        cells = page.select_one(".zoc-sum").find("tr").find_all("td", recursive=False)
        self.assertEqual([c["class"][0] for c in cells], ["s-qr", "s-gap", "s-tot"])
        self.assertEqual(page.select_one(".zoc-sum").get("class"), ["zoc-sum"])
        qr_cell = cells[0]
        self.assertIsNotNone(qr_cell.select_one(".zo-qr img"))
        for words in ("Cleared", "معتمدة", "UUID", "ICV", "وقت الاعتماد"):
            self.assertNotIn(words, qr_cell.get_text(), "nothing beside the QR (the owner, 2026-10-22)")
        self.assertEqual([(tr.get("class") or [""])[0] for tr in cells[2].select(".lad tr")], ["tot", "ded", "ded", "tot", "", "inv", "ded", "net"])

    def test_the_title_names_the_certificate_and_no_zatca_word_prints(self):
        # Owner 2026-10-24: «فاتورة ضريبية — مستخلص رقم (n)», and no ZATCA word on a customer's paper;
        # the QR stays (it is the law), alone, with no caption.
        for qr in ("data:image/png;base64,QR", ""):
            for docstatus in (1, 0):
                page = self.render(sample(docstatus=docstatus), qr=qr)
                title = page.select_one(".t-name").get_text()
                self.assertIn("مستخلص رقم (PC09)", title)
                self.assertIn("Certificate No. (PC09)", title)
                text = page.get_text(" ")
                for word in ("ZATCA", "زاتكا", "Zatca"):
                    self.assertNotIn(word, text)
                self.assertIsNone(page.select_one(".zo-qr__cap"))
        self.assertNotIn("مستخلص رقم", self.render(sample(bnd_certificate_no="")).select_one(".t-name").get_text())

    def test_the_facts_the_works_the_words_and_three_signatures(self):
        page = self.render(sample())
        text = page.get_text(" ")
        for words in ("رقم المستخلص", "PC09", "BPO3246873", "2026-11-21", "توريد وتركيب أعمال التكييف", "SUPPLY AND INSTALLATION OF HVAC WORKS", "Supply & installation", "الصافي المستحق كتابةً", "Net payable now in words"):
            self.assertIn(words, text)
        self.assertEqual(len(page.select(".zoc-works tbody tr")), 3)
        self.assertEqual([td.get_text(strip=True) for td in page.select(".zoc-works tbody tr")[0].select("td")][5], "15%")
        self.assertEqual(len(page.select(".zoc-sign > div")), 3)

    def test_a_draft_says_so_where_the_qr_will_be(self):
        page = self.render(sample(docstatus=0), qr="")
        self.assertIsNone(page.select_one(".zoc-sum .zo-qr img"))
        self.assertIsNotNone(page.select_one(".zoc-sum .zo-qr__missing"))


class QrSourceTests(unittest.TestCase):
    """A contracting invoice prints its own format even under Phase 2, and nothing else does."""

    def load_delivery(self, exists=True):
        contracting, modules = load_contracting(exists=exists)
        frappe = modules["frappe"]
        frappe._ = lambda text: text
        frappe.whitelist = lambda *args, **kwargs: (lambda fn: fn)
        printing = ModuleType("bunood_theme.printing")
        printing.contracting = contracting
        modules = {**modules, "bunood_theme.printing": printing, "bunood_theme.printing.contracting": contracting,
                   "bunood_theme.printing.names": SimpleNamespace(CONTRACTING_INVOICE_A4="فاتورة ضريبية - مقاولات - A4", POS_SUFFIX=" - نقطة البيع", TAX_INVOICE_A4="فاتورة ضريبية - A4")}
        spec = importlib.util.spec_from_file_location("isolated_zatca_delivery", ROOT / "zatca/delivery.py")
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, modules):
            spec.loader.exec_module(module)
            yield module

    def test_the_contracting_format_is_the_exception(self):
        for delivery in self.load_delivery():
            with patch.dict(sys.modules, {"bunood_theme.printing.contracting": load_contracting()[0]}):
                self.assertEqual(delivery.contracting_format(sample()), "فاتورة ضريبية - مقاولات - A4")
                self.assertEqual(delivery.contracting_format(sample(bnd_is_progress=0)), "")
                self.assertEqual(delivery.contracting_format(sample(is_return=1)), "")

    def test_the_qr_source_is_ksa_compliances(self):
        source = (ROOT / "printing/jinja.py").read_text(encoding="utf-8")
        start = source.index("def bunood_zatca_qr_src")
        body = source[start:source.index("\ndef ", start + 10)]
        # Phase 2's stored artefact on «Sales Invoice Additional Fields» first, Phase 1's TLV after.
        self.assertLess(body.index("Sales Invoice Additional Fields"), body.index("phase1_qr_src"))
        template = (ROOT / "templates/print/contracting_invoice_a4.html").read_text(encoding="utf-8")
        self.assertIn("bunood_zatca_qr_src(doc)", template)


class KitLogoTests(unittest.TestCase):
    def test_the_logo_is_larger_in_every_kit_print(self):
        css = (ROOT / "templates/print/print_kit.css").read_text(encoding="utf-8")
        self.assertIn(".zo-head__logo { inline-size: 22%; text-align: center; }", css)
        self.assertIn(".zo-head__logo img { block-size: 28mm; inline-size: auto; max-inline-size: 40mm;", css)
        self.assertIn(".zo-a5 .zo-head__logo img { block-size: 19mm; max-inline-size: 27mm; }", css)
        self.assertIn(".zo-rcpt__logo img { block-size: 20mm; inline-size: auto; max-inline-size: 50mm;", css)
        self.assertIn(".zo-rcpt--58 .zo-rcpt__logo img { block-size: 15mm; max-inline-size: 38mm; }", css)
        # The fixed page head of an A4/A5 print grows with it, so the body never runs under the logo.
        self.assertIn(".zo-chrome-head { position: fixed; inset-block-start: 0; inset-inline: 0; block-size: 34mm;", css)
        self.assertIn(".zo-frame__head { block-size: 36mm; }", css)


if __name__ == "__main__":
    unittest.main()
