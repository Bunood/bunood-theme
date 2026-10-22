"""«مستخلص - فاتورة ضريبية - A4» (the owner's HVAC sample, 2026-10-22), computed and rendered without a
site: printing/progress.py against a fake `frappe`, the template with plain Jinja2 (test_print_kit's
harness). Pinned: the summary in the sample's order, only the rows the invoice carries, the invoice
total last when there is no retention, every business field read through `meta.has_field`, and the
totals on the physical RIGHT with the QR on the physical LEFT.
"""

import importlib.util
import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from test_print_kit import ROOT, VIEW, Doc

FIELDS = {"bnd_is_progress", "bnd_progress_adjustments", "bnd_certificate_no", "bnd_work_description", "bnd_supply_from", "bnd_supply_to"}


def load_progress(fields=FIELDS):
    frappe = ModuleType("frappe")
    utils = ModuleType("frappe.utils")
    utils.flt = lambda value, precision=None: float(value or 0)
    utils.cint = lambda value: int(float(value or 0))
    frappe.utils = utils
    frappe.get_meta = lambda doctype: SimpleNamespace(has_field=lambda name: name in fields)
    frappe.db = SimpleNamespace(get_value=lambda doctype, name, field: "برج التعمير")
    modules = {"frappe": frappe, "frappe.utils": utils, "bunood_theme.printing.view": VIEW}
    spec = importlib.util.spec_from_file_location("isolated_print_progress", ROOT / "printing/progress.py")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


def row(kind, amount, **values):
    return Doc(kind=kind, amount=amount, **values)


def sample(**over):
    doc = Doc(
        doctype="Sales Invoice", name="SINV-9", docstatus=1, currency="SAR", total=58475.0, net_total=45718.49,
        total_taxes_and_charges=6857.77, grand_total=52576.26, total_advance=0, po_no="BPO3246873", project="PRJ-1",
        bnd_is_progress=1, bnd_certificate_no="PC09", bnd_work_description="SUPPLY AND INSTALLATION OF HVAC WORKS",
        bnd_supply_from="2026-09-01", bnd_supply_to="2026-09-30",
        taxes=[Doc(description="VAT 15%", account_head="Output VAT", rate=15)],
        bnd_progress_adjustments=[
            row("Advance Recovery", 5847.50, percent=10, advance_invoice="SINV-1"),
            row("Progress Deduction", 6909.01, reason="Back-charges"),
            row("Performance Retention", 2923.75, percent=5),
        ],
    )
    doc.update(over)
    return doc


class ProgressViewTests(unittest.TestCase):
    def test_the_owners_sample_in_its_order(self):
        view = load_progress().progress_view(sample())
        rows = [(r["en"], r["amount"]) for r in view["rows"]]
        self.assertEqual(rows, [
            ("Certificate value", "58,475.00"),
            ("Advance payment recovery (10% of the value)", "(5,847.50)"),
            ("Deduction", "(6,909.01)"),
            ("Taxable amount", "45,718.49"),
            ("VAT 15%", "6,857.77"),
            ("Invoice total incl. VAT", "52,576.26"),
            ("Performance retention 5%", "(2,923.75)"),
            ("Net payable now", "49,652.51"),
        ])
        self.assertEqual(view["rows"][2]["note"], "Back-charges", "a deduction prints its reason")
        self.assertEqual(view["rows"][6]["note"], "يستحق عند التسليم", "no due date: at handover")
        self.assertEqual([r.get("last") for r in view["rows"]].count(True), 1)
        self.assertTrue(view["rows"][-1]["last"])
        self.assertEqual((view["certificate"], view["po"], view["period"]), ("PC09", "BPO3246873", "2026-09-01 — 2026-09-30"))

    def test_a_row_not_added_is_not_printed_and_the_total_closes_without_a_retention(self):
        doc = sample(bnd_progress_adjustments=[row("Progress Deduction", 1000, reason="Late")], net_total=57475, total_taxes_and_charges=8621.25, grand_total=66096.25)
        rows = load_progress().progress_view(doc)["rows"]
        self.assertEqual([r["en"] for r in rows], ["Certificate value", "Deduction", "Taxable amount", "VAT 15%", "Invoice total incl. VAT"])
        self.assertTrue(rows[-1]["last"], "the invoice total is the last row")
        rows = load_progress().progress_view(sample(bnd_progress_adjustments=[], net_total=58475, grand_total=67246.25, total_taxes_and_charges=8771.25))["rows"]
        self.assertEqual([r["en"] for r in rows], ["Certificate value", "VAT 15%", "Invoice total incl. VAT"])

    def test_the_theme_reads_no_business_field_it_does_not_have(self):
        progress = load_progress(fields=set())
        self.assertFalse(progress.is_progress(sample()))
        view = progress.progress_view(sample())
        self.assertEqual(view["certificate"], "")
        self.assertEqual([r["en"] for r in view["rows"]], ["Certificate value", "VAT 15%", "Invoice total incl. VAT"])


class ProgressTemplateTests(unittest.TestCase):
    def render(self, doc):
        view = load_progress().progress_view(doc)
        import jinja2
        import test_print_kit as kit
        from bs4 import BeautifulSoup

        env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
        env.globals.update(
            bunood_print_language=lambda: "ar",
            bunood_print_profile=lambda d: kit.PROFILE_DATA,
            bunood_buyer_profile=lambda d: kit.BUYER,
            bunood_invoice_view=lambda d, simplified=False: kit.view(),
            bunood_progress_view=lambda d: view,
            bunood_zatca_qr_src=lambda d: "data:image/png;base64,QR",
            bunood_print_kit_css=lambda: "/* kit */",
        )
        html = env.get_template("templates/print/progress_invoice_a4.html").render(doc=doc, no_letterhead=0, print_settings=None)
        return BeautifulSoup(html, "html.parser")

    def test_the_summary_sits_physically_right_and_the_qr_left(self):
        page = self.render(sample())
        cells = page.select_one(".zo-sum").find("tr").find_all("td", recursive=False)
        self.assertEqual([c["class"][0] for c in cells], ["zo-sum__qr", "zo-sum__gap", "zo-sum__tot"])
        self.assertIsNotNone(cells[0].select_one(".zo-qr img"))
        keys = [tr.get("data-row") for tr in cells[2].select(".zo-progress tr")]
        self.assertEqual(keys, ["", "", "", "", "", "total", "", "now"])
        self.assertEqual(cells[2].select(".zo-progress tr")[-1].get("class"), ["g"])
        text = page.get_text(" ")
        for words in ("مستخلص - فاتورة ضريبية", "رقم المستخلص", "رقم أمر الشراء", "فترة التوريد", "وصف الأعمال"):
            self.assertIn(words, text)


if __name__ == "__main__":
    unittest.main()
