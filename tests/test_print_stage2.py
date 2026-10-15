"""Stage 2 of the print redesign (2026-10-15), computed and rendered without a site.

The other A4 families (printing/documents.py → trade_a4.html, voucher.html, journal_a4.html), the
receipt family's roll widths and its gift switch, the counter's fallback receipt, the statement's
aging and its route to Chromium. What is pinned is what the brief and the market study ask:
documents that are not invoices never say «فاتورة ضريبية» and never carry a QR, a proforma says
it is not a tax invoice, a purchase return is titled so with its original, goods documents print
quantities, a voucher is A5 landscape, every figure column of a receipt has its own width.
"""

import ast
from datetime import date
import importlib.util
import json
from pathlib import Path
import re
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup
import jinja2

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_print_kit import BUYER, PROFILE_DATA, ROOT, VIEW, VIEW_MODULES, Doc, fake_frappe  # noqa: E402


def load_with_view(name, relative, extra=None):
    """A printing module that imports `bunood_theme.printing.view`, against the fake frappe."""
    frappe, utils = fake_frappe()
    frappe.whitelist = lambda *a, **k: (lambda fn: fn)
    frappe.get_meta = lambda doctype: SimpleNamespace(has_field=lambda field: field == "posting_date")
    utils.now_datetime = lambda: None
    utils.get_url = lambda **k: "http://site"
    utils.cint = lambda value: int(value or 0)
    printing = ModuleType("bunood_theme.printing")
    printing.view = VIEW
    package = ModuleType("bunood_theme")
    package.printing = printing
    modules = {"frappe": frappe, "frappe.utils": utils, "bunood_theme": package, "bunood_theme.printing": printing,
               "bunood_theme.printing.view": VIEW, **(extra or {})}
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module, frappe


DOCS, DOCS_FRAPPE = load_with_view("isolated_print_documents", "printing/documents.py")

PRICED = dict(
    company="C", company_tax_id="3", currency="SAR", conversion_rate=1, docstatus=1,
    net_total=270, total_taxes_and_charges=40.5, grand_total=310.5, rounded_total=0, outstanding_amount=0,
    taxes=[Doc(name="T1", description="VAT 15%", account_head="VAT", rate=15, charge_type="On Net Total",
               tax_amount=40.5, tax_amount_after_discount_amount=40.5)],
    items=[Doc(name="R1", item_code="A", item_name="A", qty=2, rate=90, price_list_rate=100, net_amount=180, amount=180),
           Doc(name="R2", item_code="B", item_name="B", qty=1, rate=90, price_list_rate=0, net_amount=90, amount=90)],
)


def trade(doc, kind):
    with patch.dict(sys.modules, VIEW_MODULES):
        return DOCS.trade_view(doc, kind)


class TradeViewTests(unittest.TestCase):
    def test_no_trade_document_is_a_tax_document(self):
        for kind, spec in DOCS.KINDS.items():
            with self.subTest(kind=kind):
                self.assertFalse(spec[6], "none of these carries our QR")
                self.assertNotIn("ضريبية", spec[1])

    def test_titles_follow_the_document(self):
        self.assertEqual([trade(Doc(name="STE-1", purpose=p, items=[]), "stock_entry")["title_ar"]
                          for p in ("Material Transfer", "Material Issue", "Material Receipt")],
                         ["تحويل مخزني", "صرف مخزني", "استلام مخزني"])
        self.assertEqual(trade(Doc(name="DN-2", is_return=1, items=[]), "delivery_note")["title_ar"], "مرتجع تسليم")
        proforma = trade(Doc(PRICED, name="SO-1"), "proforma")
        self.assertEqual((proforma["title_ar"], proforma["not_invoice"]), ("فاتورة مبدئية", True))
        self.assertFalse(trade(Doc(PRICED, name="QTN-1"), "quotation")["not_invoice"])

    def test_a_purchase_return_names_its_original_once(self):
        doc = Doc(PRICED, name="PINV-2", is_return=1, return_against="PINV-1", bill_no="CN-9",
                  remarks="إرجاع قارئين")
        v = trade(doc, "purchase_invoice")
        self.assertEqual((v["title_ar"], v["title_en"]), ("مرتجع مشتريات", "Purchase Return"))
        self.assertEqual(v["reference"]["originals"], ["PINV-1"], "the supplier's note number is in the meta row")
        self.assertEqual(v["reference"]["reason"], "إرجاع قارئين")
        self.assertIn("CN-9", [m["value"] for m in v["meta"]][1])

    def test_only_a_purchase_invoice_settles(self):
        self.assertEqual(trade(Doc(PRICED, name="QTN-1"), "quotation")["totals"]["paid"], "")
        self.assertEqual(trade(Doc(PRICED, name="PINV-1"), "purchase_invoice")["totals"]["paid"], "310.50")

    def test_goods_documents_print_quantities(self):
        receipt = DOCS.qty_lines(Doc(items=[Doc(item_code="P", item_name="ورق", qty=480, received_qty=500,
                                                warehouse="مخازن", uom="Nos")]), "purchase_receipt")[0]
        self.assertEqual((receipt["received"], receipt["accepted"], receipt["warehouse"]), ("500", "480", "مخازن"))
        delivered = DOCS.qty_lines(Doc(items=[Doc(item_code="P", qty=3)]), "delivery_note")[0]
        self.assertEqual((delivered["ordered"], delivered["delivered"]), ("3", "3"), "no order line: what went")
        moved = DOCS.qty_lines(Doc(items=[Doc(item_code="P", qty=40, s_warehouse="A", t_warehouse="B")]), "stock_entry")[0]
        self.assertEqual((moved["from"], moved["to"]), ("A", "B"))
        entry = trade(Doc(name="STE-1", purpose="Material Transfer", remarks="نقل", items=[]), "stock_entry")
        self.assertEqual(entry["remarks"], "نقل")
        self.assertNotIn("المرجع", [m["ar"] for m in entry["meta"]], "remarks print under the table, not in the grid")


class VoucherTests(unittest.TestCase):
    def test_receipt_and_payment_titles(self):
        with patch.dict(sys.modules, VIEW_MODULES):
            received = DOCS.voucher_view(Doc(name="PE-1", payment_type="Receive", received_amount=8000, paid_amount=8000))
            paid = DOCS.voucher_view(Doc(name="PE-2", payment_type="Pay", paid_amount=500, received_amount=500))
        self.assertEqual((received["title_ar"], received["amount"]), ("سند قبض", "8,000.00"))
        self.assertEqual(paid["title_ar"], "سند صرف")

    def test_erpnexts_generated_remark_is_dropped(self):
        self.assertEqual(DOCS._remarks(Doc(remarks="Amount SAR 100 received from X")), "")
        self.assertEqual(DOCS._remarks(Doc(remarks="دفعة من حساب المشروع")), "دفعة من حساب المشروع")


def env_render(template, doc, **globals_):
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(ROOT)))
    env.globals.update(
        bunood_print_language=lambda: "ar",
        bunood_print_profile=lambda d: dict(PROFILE_DATA, cells=[]),
        bunood_buyer_profile=lambda d: dict(BUYER, cells=[]),
        bunood_party_profile=lambda d, role: dict(BUYER, cells=[]),
        bunood_zatca_qr_src=lambda d: "data:image/png;base64,QR",
        bunood_print_kit_css=lambda: "/* kit */",
        bunood_receipt_extras=lambda d: {"customer": "", "service": {}, "barcode": ""},
        **globals_,
    )
    context = {"no_letterhead": 0, "print_settings": None}
    for key in ("zo_kind", "zo_width", "zo_b2b", "zo_gift", "zo_page"):
        if key in globals_:
            context[key] = globals_[key]
    return BeautifulSoup(env.get_template(template).render(doc=doc, **context), "html.parser")


class TemplateTests(unittest.TestCase):
    def trade_page(self, kind, doc):
        v = trade(doc, kind)
        return env_render("templates/print/trade_a4.html", doc, zo_kind=kind, bunood_trade_view=lambda d, k: v)

    def test_documents_that_are_not_invoices_carry_no_qr(self):
        for kind in ("quotation", "sales_order", "proforma", "purchase_order", "purchase_invoice"):
            with self.subTest(kind=kind):
                page = self.trade_page(kind, Doc(PRICED, name="X-1"))
                self.assertIsNone(page.select_one(".zo-qr img"))
                self.assertIsNotNone(page.select_one(".zo-totals"))
                self.assertNotIn("فاتورة ضريبية |", page.select_one(".zo-title").get_text(" "))
        proforma = self.trade_page("proforma", Doc(PRICED, name="SO-1"))
        self.assertIn("ليست فاتورة ضريبية", proforma.select_one(".zo-notice").get_text())
        self.assertIsNone(self.trade_page("quotation", Doc(PRICED, name="Q-1")).select_one(".zo-notice"))

    def test_a_goods_document_prints_no_prices(self):
        page = self.trade_page("delivery_note", Doc(name="DN-1", items=[Doc(item_code="P", item_name="ورق", qty=3)]))
        self.assertIsNone(page.select_one(".zo-totals"))
        self.assertIn("إجمالي الكمية", page.select_one(".zo-qty-total").get_text())
        heads = [th.contents[0].strip() for th in page.select(".zo-items thead th")]
        self.assertIn("الكمية المسلّمة", heads)

    def test_the_main_voucher_is_a5_landscape(self):
        with patch.dict(sys.modules, VIEW_MODULES):
            v = DOCS.voucher_view(Doc(name="PE-1", payment_type="Receive", received_amount=10, paid_amount=10))
        page = env_render("templates/print/voucher.html", Doc(name="PE-1", docstatus=1), zo_page="A5",
                          bunood_voucher_view=lambda d: v)
        style = " ".join(s.get_text() for s in page.select("style"))
        self.assertIn("page-width: 210mm; page-height: 148mm;", style)
        self.assertIn("سند قبض", page.get_text())

    def receipt(self, width, gift=False, copy=None):
        v = {"title_ar": "فاتورة ضريبية مبسطة", "title_en": "Simplified Tax Invoice", "number": "SINV-1",
             "issued": "2026-10-15 10:42", "cashier": "", "branch": "", "reference": {}, "payments": [],
             "lines": [{"name": "ورق حراري 80×80 — كرتون 50 لفة", "qty": "2", "unit_incl": "212.75", "rate": "185.00",
                        "total": "425.50", "description": ""}],
             "totals": {"taxable": "370.00", "discount": "", "vat": "55.50", "vat_rate": "15", "rounding": "",
                        "grand": "425.50", "currency": "SAR", "paid": "", "change": "", "remaining": ""}}
        doc = Doc(doctype="Sales Invoice", name="SINV-1", docstatus=1)
        return env_render("templates/print/sales_receipt.html", doc, zo_width=width, zo_b2b=False, zo_gift=gift,
                          bunood_invoice_view=lambda d, simplified=False: v, bunood_print_copy=lambda d: copy or {})

    def test_every_figure_column_has_its_own_width(self):
        for width, heads in ((80, ["الصنف", "الكمية", "السعر", "الإجمالي"]), (58, ["الصنف", "الكمية", "الإجمالي"])):
            with self.subTest(width=width):
                page = self.receipt(width)
                ths = page.select(".zo-rcpt-items thead th")
                self.assertEqual([th.contents[0].strip() for th in ths], heads)
                self.assertTrue(all("n" in th.get("class", []) or "q" in th.get("class", []) for th in ths[1:]))
                widths = [int(re.search(r"width:(\d+)%", c["style"]).group(1)) for c in page.select(".zo-rcpt-items col")]
                self.assertEqual(sum(widths), 100)
                self.assertGreaterEqual(min(widths[1:]), 18, "«الكمية» needs its own room")
        self.assertIn("2 × 212.75", self.receipt(58).select_one(".zo-rcpt-items .unit").get_text())

    def test_a_copy_says_so_except_on_a_gift_receipt(self):
        copy = {"number": 2, "at": "2026-10-15 18:20"}
        for width in (80, 58):
            page = self.receipt(width, copy=copy)
            self.assertIn("نسخة مكررة", page.select_one(".zo-rcpt__dup").get_text())
            self.assertIn("2026-10-15 18:20", page.select_one(".zo-rcpt__dup").get_text())
        self.assertIsNone(self.receipt(80).select_one(".zo-rcpt__dup"), "the original")
        self.assertIsNone(self.receipt(80, gift=True, copy=copy).select_one(".zo-rcpt__dup"))

    def test_58mm_totals_carry_short_labels(self):
        labels = [td.get_text(" ", strip=True) for td in self.receipt(58).select(".zo-rcpt-tot td.k")]
        self.assertEqual(labels[:3], ["قبل الضريبة", "الضريبة 15%", "الإجمالي"])
        self.assertIsNone(self.receipt(58).select_one(".zo-rcpt-tot .en"))
        self.assertIsNotNone(self.receipt(80).select_one(".zo-rcpt-tot .en"))

    def test_a_gift_receipt_has_no_prices_and_no_qr(self):
        page = self.receipt(80, gift=True)
        self.assertEqual([th.contents[0].strip() for th in page.select(".zo-rcpt-items thead th")], ["الصنف", "الكمية"])
        self.assertIsNone(page.select_one(".zo-rcpt-tot"))
        self.assertIsNone(page.select_one(".zo-rcpt__qr"))
        self.assertNotIn("425.50", page.get_text())


class ReprintTests(unittest.TestCase):
    """«نسخة مكررة — Copy»: a print raises the document's own count; the first print is the original."""

    def setUp(self):
        self.reprint, self.frappe = load_with_view("isolated_reprint", "printing/reprint.py")
        self.reprint.now_datetime = lambda: SimpleNamespace(strftime=lambda fmt: "2026-10-15 18:20")
        self.stored = {"SINV-1": 0}
        self.log = []
        self.frappe.get_meta = lambda doctype: SimpleNamespace(is_submittable=True, has_field=lambda f: f == "bnd_print_count")
        self.frappe.db = SimpleNamespace(
            db_type="mariadb",
            get_value=lambda doctype, name, field: self.stored.get(name, 0),
            sql=self.sql, commit=lambda: self.log.append("commit"), rollback=lambda: self.log.append("rollback"))
        self.frappe.session = SimpleNamespace(user="cashier@example.com")
        self.warnings = []
        self.frappe.logger = lambda name=None: SimpleNamespace(warning=lambda msg, **k: self.warnings.append(msg))
        self.request("/printview", {})

    def sql(self, query, name):
        self.log.append(query)
        self.stored[name] = self.stored.get(name, 0) + 1

    def request(self, path, form):
        """A new request; its after-response callbacks run when the test says the response is sent."""
        self.callbacks = []
        request = SimpleNamespace(path=path, after_response=SimpleNamespace(add=self.callbacks.append))
        self.frappe.local = SimpleNamespace(request=request, form_dict=form, flags=SimpleNamespace(commit=False))

    def respond(self):
        for callback in self.callbacks:
            callback()

    def doc(self, **over):
        return Doc(dict(doctype="Sales Invoice", name="SINV-1", docstatus=1), **over)

    def test_the_count_is_written_after_the_response_in_its_own_transaction(self):
        """The counter sits on the submitted invoice's row: an UPDATE under the render held that row's
        lock for the whole request (a bulk PDF: minutes) and Payment Entry submits timed out behind
        it (the v0.60.0 review, finding 3)."""
        self.request("/api/method/frappe.utils.print_format.download_multi_pdf", {})
        self.reprint.before_print(self.doc())
        self.reprint.before_print(self.doc(name="SINV-2"))
        self.assertEqual(self.log, [], "nothing is written while the documents render")
        self.assertEqual(self.reprint.mark(self.doc()), {}, "the first print is the original")
        self.respond()
        self.assertEqual(self.stored, {"SINV-1": 1, "SINV-2": 1})
        self.assertEqual(self.log[1::2], ["commit", "commit"], "one short transaction per document")
        self.assertTrue(self.log[0].startswith("SET STATEMENT innodb_lock_wait_timeout=5 FOR update"),
                        "a row another transaction holds is waited for briefly, not for the lock timeout")
        self.assertFalse(self.frappe.local.flags.commit, "the request's own transaction is not kept open for it")

    def test_nothing_in_the_count_stops_a_print(self):
        def locked(query, name):
            raise RuntimeError("Lock wait timeout exceeded")

        self.request("/printview", {"trigger_print": "1"})
        self.frappe.db.sql = locked
        self.reprint.before_print(self.doc())
        self.respond()
        self.assertEqual(self.log, ["rollback"])
        self.assertTrue(self.warnings, "a failed count is logged")
        # Read-only, a missing table, anything: before_print and the copy mark still return.
        self.frappe.db.get_value = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("read-only"))
        self.request("/printview", {"trigger_print": "1"})
        self.assertIsNone(self.reprint.before_print(self.doc(name="SINV-3")))
        self.assertEqual(self.reprint.mark(self.doc(name="SINV-3")), {})

    def test_what_counts_as_a_print(self):
        for path, form, counted in (("/printview", {"trigger_print": "1"}, True), ("/printview", {}, False),
                                    ("/api/method/frappe.utils.print_format.download_pdf", {}, True),
                                    ("/api/method/frappe.utils.print_format.download_multi_pdf", {}, True),
                                    ("/api/method/frappe.www.printview.get_html_and_style", {}, False),
                                    ("/api/method/frappe.core.doctype.communication.email.make", {}, False)):
            with self.subTest(path=path, form=form):
                self.request(path, form)
                self.assertEqual(self.reprint.counted_request(), counted)

    def test_the_first_print_is_the_original_the_second_a_copy(self):
        self.request("/printview", {"trigger_print": "1"})
        self.assertEqual(self.reprint.record(self.doc()), 1)
        self.assertEqual(self.reprint.mark(self.doc()), {}, "the original")
        self.respond()
        self.assertEqual(self.log[-1], "commit", "a GET print commits its count")
        self.request("/printview", {"trigger_print": "1"})
        self.assertEqual(self.reprint.record(self.doc()), 2)
        self.assertEqual(self.reprint.mark(self.doc()), {"number": 2, "at": "2026-10-15 18:20"})
        self.respond()
        # A preview counts nothing and shows what the next print would be.
        self.request("/printview", {})
        self.assertEqual(self.reprint.mark(self.doc()), {"number": 3, "at": "2026-10-15 18:20"})
        self.assertEqual(self.stored["SINV-1"], 2)

    def test_a_draft_is_never_marked_nor_counted(self):
        self.request("/printview", {"trigger_print": "1"})
        self.assertEqual(self.reprint.record(self.doc(docstatus=0)), 0)
        self.assertEqual(self.reprint.mark(self.doc(docstatus=0)), {})
        self.assertEqual(self.stored["SINV-1"], 0)


def function_from(relative, name, namespace):
    """One function's source out of a module too heavy to import here, run against `namespace`."""
    tree = ast.parse((ROOT / relative).read_text(encoding="utf-8"))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), relative, "exec"), namespace)
    return namespace[name]


class CounterFallbackTests(unittest.TestCase):
    def test_a_profile_without_a_format_prints_the_kits_receipt(self):
        names = load_with_view("isolated_names_stage2", "printing/names.py")[0]
        installed = {names.SIMPLIFIED_RECEIPT_80, names.SIMPLIFIED_RECEIPT_80 + names.POS_SUFFIX}
        frappe = SimpleNamespace(db=SimpleNamespace(exists=lambda doctype, name: name in installed))
        printing = ModuleType("bunood_theme.printing")
        with patch.dict(sys.modules, {"bunood_theme.printing.names": names, "bunood_theme.printing": printing}):
            fallback = function_from("pos.py", "receipt_format", {"frappe": frappe, "_invoice_type": lambda: "Sales Invoice"})
            self.assertEqual(fallback("Sales Invoice"), "فاتورة ضريبية مبسطة - حراري 80مم")
            self.assertEqual(fallback("POS Invoice"), "فاتورة ضريبية مبسطة - حراري 80مم - نقطة البيع")
            installed.clear()
            self.assertEqual(fallback("POS Invoice"), "", "not installed: the doctype's own default answers")
        source = (ROOT / "pos.py").read_text(encoding="utf-8")
        self.assertIn('"print_format": profile.print_format or receipt_format()', source)
        self.assertIn("print_format = print_format or receipt_format(doc.doctype)", source)


class StatementTests(unittest.TestCase):
    def test_aging_buckets_by_days_past_due(self):
        rows = [SimpleNamespace(due_date=date(2026, 10, 31), posting_date=None, outstanding_amount=100),
                SimpleNamespace(due_date=date(2026, 10, 1), posting_date=None, outstanding_amount=20),
                SimpleNamespace(due_date=date(2026, 9, 1), posting_date=None, outstanding_amount=30),
                SimpleNamespace(due_date=date(2026, 8, 15), posting_date=None, outstanding_amount=40),
                SimpleNamespace(due_date=date(2026, 6, 1), posting_date=None, outstanding_amount=50)]
        statement, frappe = load_with_view("isolated_statement", "printing/statement.py")
        asked = []
        frappe.get_all = lambda doctype, **k: asked.append((doctype, sorted(k["filters"]))) or rows
        aging = {row["key"]: row["amount"] for row in statement.aging("C", "Customer", "Cust", "2026-10-31")}
        self.assertEqual(aging, {"current": "100.00", "1-30": "20.00", "31-60": "30.00", "61-90": "40.00", "90+": "50.00"})
        # An unapplied credit note keeps its own (negative) outstanding: it counts, in brackets.
        rows.append(SimpleNamespace(due_date=date(2026, 10, 20), posting_date=None, outstanding_amount=-45))
        aging = {row["key"]: row["amount"] for row in statement.aging("C", "Customer", "Cust", "2026-10-31")}
        self.assertEqual(aging["1-30"], "(25.00)")
        # A supplier's statement ages what we owe: its purchase invoices.
        statement.aging("C", "Supplier", "Sup", "2026-10-31")
        self.assertEqual([d for d, _f in asked], ["Sales Invoice", "Sales Invoice", "Purchase Invoice"])
        self.assertIn("supplier", asked[-1][1])

    def test_each_line_names_its_document_and_says_what_it_was(self):
        statement, frappe = load_with_view("isolated_statement_lines", "printing/statement.py")
        frappe.get_meta = lambda doctype: SimpleNamespace(has_field=lambda field: field == "is_debit_note")
        stored = {
            "Sales Invoice": [SimpleNamespace(name="SINV-1", is_return=0, get=lambda f: 0),
                              SimpleNamespace(name="SINV-2", is_return=1, get=lambda f: 0),
                              SimpleNamespace(name="SINV-3", is_return=0, get=lambda f: 1)],
            "Purchase Invoice": [SimpleNamespace(name="PINV-2", is_return=1, get=lambda f: 0)],
            "Payment Entry": [SimpleNamespace(name="PE-1", payment_type="Receive"), SimpleNamespace(name="PE-2", payment_type="Pay")],
        }
        frappe.get_all = lambda doctype, **k: stored.get(doctype, [])
        frappe._ = lambda text, *a, **k: text
        labels = statement.line_labels([
            ["Sales Invoice", "SINV-1", "No Remarks", "Sales Invoice", "SINV-1"],
            ["Sales Invoice", "SINV-2", "", "Sales Invoice", "SINV-1"],
            ["Sales Invoice", "SINV-3", "زيادة سعر\nسطر ثان", "", ""],
            ["Purchase Invoice", "PINV-2", "", "", ""],
            ["Payment Entry", "PE-1", "Amount SAR 8000 received from X", "Sales Invoice", "SINV-1"],
            ["Payment Entry", "PE-2", "No Remarks", "Purchase Invoice", "PINV-2"],
            ["Journal Entry", "JV-1", "x" * 200, "", ""],
        ])
        self.assertEqual([labels[n]["type_ar"] for n in ("SINV-1", "SINV-2", "SINV-3", "PINV-2", "PE-1", "PE-2", "JV-1")],
                         ["فاتورة مبيعات", "إشعار دائن", "إشعار مدين", "مرتجع مشتريات", "سند قبض", "سند صرف", "سند قيد"])
        self.assertEqual(labels["PE-1"]["type_en"], "Receipt voucher")
        self.assertEqual(labels["SINV-1"]["note_ar"], "", "a line settling itself names nothing")
        self.assertEqual((labels["SINV-2"]["note_ar"], labels["SINV-2"]["note_en"], labels["SINV-2"]["note_no"]),
                         ("فاتورة مبيعات", "Sales invoice", "SINV-1"))
        self.assertEqual(labels["SINV-3"]["note_ar"], "زيادة سعر", "the first line only")
        self.assertEqual(labels["PE-1"]["note_ar"], "Amount SAR 8000 received from X")
        self.assertEqual((labels["PE-2"]["note_ar"], labels["PE-2"]["note_no"]), ("مرتجع مشتريات", "PINV-2"),
                         "the against document by its own kind")
        self.assertEqual(len(labels["JV-1"]["note_ar"]), 120)

    def statement_module(self):
        statement, frappe = load_with_view("isolated_statement_render", "printing/statement.py")
        frappe.ValidationError = type("ValidationError", (Exception,), {})
        frappe.PermissionError = type("PermissionError", (Exception,), {})
        frappe.defaults = SimpleNamespace(get_user_default=lambda key: "C")
        frappe._dict = lambda *a, **k: Doc(*a, **k)
        return statement, frappe

    def reports_module(self, statement):
        calls = []
        native = ModuleType("frappe.utils.print_format")
        native.report_to_pdf = lambda html, orientation: calls.append(("native", html, orientation))
        pdf = ModuleType("frappe.utils.pdf")
        pdf.get_chrome_pdf = lambda fmt, html, options, output, engine: calls.append(("chrome", fmt, html, engine)) or b"%PDF"
        access = ModuleType("frappe.core.doctype.access_log.access_log")
        access.make_access_log = lambda **k: None
        assets = ModuleType("bunood_theme.printing.report_assets")
        assets.canonical_print_stylesheet = lambda html, *a: html
        globals_ = ModuleType("frappe.utils.jinja_globals")
        globals_.bundled_asset = lambda name, rtl=False: name
        names = load_with_view("isolated_names_reports", "printing/names.py")[0]
        limited = []
        printing = ModuleType("bunood_theme.printing")
        package = ModuleType("bunood_theme")
        package.printing = printing
        modules = {"frappe.utils.print_format": native, "frappe.utils.jinja_globals": globals_,
                   "bunood_theme": package, "bunood_theme.printing": printing,
                   "bunood_theme.printing.report_assets": assets, "bunood_theme.printing.statement": statement}
        frappe, _utils = fake_frappe()
        frappe.whitelist = lambda *a, **k: (lambda fn: fn)
        frappe.concurrent_limit = lambda *a, **k: (lambda fn: limited.append(fn.__name__) or fn)
        spec = importlib.util.spec_from_file_location("isolated_reports", ROOT / "printing/reports.py")
        reports = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": frappe, "frappe.utils": _utils, **modules}):
            _utils.get_url = lambda **k: "http://site"
            spec.loader.exec_module(reports)
        frappe.request = SimpleNamespace(host_url="http://site/", headers={})
        frappe.local = SimpleNamespace(response=SimpleNamespace())
        run = {"frappe.utils.pdf": pdf, "frappe.core.doctype.access_log.access_log": access,
               "bunood_theme.printing.names": names, "bunood_theme.printing.statement": statement, "frappe": frappe}
        return reports, frappe, calls, limited, run

    def test_a_statement_pdf_never_renders_the_posted_html(self):
        """Any signed-in user can POST to report_to_pdf, and Chromium fetches what a page names: a
        posted statement's HTML is never rendered — only its filters are read, and the statement
        is built again on the server from the report's own data (the v0.60.0 review, finding 2)."""
        statement, _frappe = self.statement_module()
        built = []
        statement.document = lambda filters: built.append(filters) or "<html>the server's statement</html>"
        reports, frappe, calls, limited, run = self.reports_module(statement)
        probes = ('<img src="http://169.254.169.254/latest/meta-data/">'
                  '<link rel="stylesheet" href="http://10.0.0.7:6379/x.css"><iframe src="file:///etc/passwd"></iframe>')
        posted = ('<div class="zo-statement" data-zo-filters="{&quot;company&quot;:&quot;C&quot;,'
                  '&quot;party_type&quot;:&quot;Customer&quot;,&quot;party&quot;:[&quot;Cust&quot;]}">' + probes + "</div>")
        with patch.dict(sys.modules, run):
            reports.report_to_pdf(posted)
            reports.report_to_pdf('<div class="zo-statement">' + probes + "</div>")
            reports.report_to_pdf('<div class="zo-statement" data-zo-filters="not json">' + probes + "</div>")
            reports.report_to_pdf("<table>a ledger</table>", "Portrait")
        self.assertEqual(built, [{"company": "C", "party_type": "Customer", "party": ["Cust"]}])
        chrome = [c for c in calls if c[0] == "chrome"]
        self.assertEqual(len(chrome), 1)
        self.assertEqual(chrome[0][1:], ("كشف حساب - A4", "<html>the server's statement</html>", "chrome"))
        for url in ("169.254.169.254", "10.0.0.7", "file:///etc/passwd"):
            self.assertNotIn(url, chrome[0][2], "Chromium never sees what was posted")
        # No filters to rebuild from: Frappe's own path (wkhtmltopdf behind its dead proxy), never Chromium.
        self.assertEqual([c[0] for c in calls], ["chrome", "native", "native", "native"])
        self.assertEqual(calls[-1][2], "Portrait")
        self.assertEqual(frappe.local.response.type, "pdf")
        self.assertEqual(limited, ["report_to_pdf"], "Frappe's concurrent limit stays on the override")

    def test_the_statement_is_built_from_the_reports_own_rows(self):
        statement, frappe = self.statement_module()
        rows = [
            {"account": "'Opening'", "debit": 1000, "credit": 0, "balance": 1000},
            {"posting_date": "2026-10-01", "voucher_type": "Sales Invoice", "voucher_no": "SINV-1", "debit": 2300,
             "credit": 0, "balance": 3300, "remarks": '<img src="http://evil.example/x.png">'},
            {"posting_date": "2026-10-05", "voucher_type": "Payment Entry", "voucher_no": "PE-1", "debit": 0,
             "credit": 4000, "balance": -700, "remarks": "No Remarks", "against_voucher_type": "Sales Invoice",
             "against_voucher": "SINV-1"},
            {"account": "'Total'", "debit": 2300, "credit": 4000, "balance": -1700},
            {"account": "'Closing (Opening + Total)'", "debit": 3300, "credit": 4000, "balance": -700},
        ]
        asked = []
        report = ModuleType("frappe.desk.query_report")
        report.run = lambda name, filters=None, **k: asked.append((name, filters, k)) or {"result": rows}
        statement.context = lambda **k: {
            "title_ar": "كشف حساب عميل", "party_box": "", "aging": [], "printed_at": "2026-10-15 18:20",
            "printed_by": "Cashier", "lines": statement.line_labels(json.loads(k["lines"]))}
        frappe.get_all = lambda doctype, **k: []
        frappe.get_meta = lambda doctype: SimpleNamespace(has_field=lambda field: False)
        rendered = {}

        def render_template(path, context):
            rendered["path"] = path
            rendered["html"] = env_render(path, context["doc"], s=context["s"]).decode()
            return rendered["html"]

        frappe.render_template = render_template
        filters = '{"company": "C", "party_type": "Customer", "party": ["Cust"], "from_date": "2026-10-01", "to_date": "2026-10-31"}'
        with patch.dict(sys.modules, {**VIEW_MODULES, "frappe.desk": ModuleType("frappe.desk"),
                                      "frappe.desk.query_report": report}):
            html = statement.render(filters)
        self.assertEqual(asked[0][0], "General Ledger", "Frappe's own runner: the Report's roles and permissions")
        self.assertEqual(asked[0][1]["party"], ["Cust"])
        self.assertEqual(rendered["path"], "templates/print/statement.html")
        page = BeautifulSoup(html, "html.parser")
        marker = page.select_one(".zo-statement")
        self.assertEqual(json.loads(marker["data-zo-filters"])["party"], ["Cust"], "the PDF rebuilds from these")
        body = [[td.get_text(" ", strip=True) for td in tr.select("td")] for tr in page.select(".zo-items tbody tr")]
        self.assertEqual(body[0][-3:], ["1,000.00", "", "1,000.00"], "the opening")
        self.assertEqual(body[1][:3], ["2026-10-01", "فاتورة مبيعات", "SINV-1"])
        self.assertEqual(body[2][2:], ["PE-1", "فاتورة مبيعات SINV-1", "—", "4,000.00", "(700.00)"])
        self.assertIsNone(page.select_one(".zo-items img"), "a remark is text, never markup")
        self.assertIn('&lt;img src="http://evil.example/x.png"&gt;', html)
        foot = [td.get_text(" ", strip=True) for td in page.select(".zo-items tfoot tr")[1].select("td")]
        self.assertEqual(foot[-1], "(700.00)", "the closing")


if __name__ == "__main__":
    unittest.main()
