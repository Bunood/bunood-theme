"""«فاتورة ضريبية - مقاولات - A4»: what a contracting invoice prints (the owner's approved mock,
2026-10-22): the certificate's facts, the seller and the customer, the scope, the works lines in
Arabic and English with their VAT rate, the ladder in the order the screen shows it, the net payable
now in words (Arabic and English), and the ZATCA QR alone on the physical left.

The ladder: the gross value of works, the before-VAT rows in their entry order, the taxable amount,
the VAT, «إجمالي الفاتورة شامل الضريبة» (what ZATCA's XML and QR carry), the after-VAT rows, then
«الصافي المستحق الآن». A row the invoice does not carry is not printed.

Every figure is ERPNext's own (`total`, `net_total`, the tax rows, `grand_total`); the rows and the
certificate are bunood_business's fields, each read through `meta.has_field` so the theme never
breaks without it.
"""

import frappe
from frappe.utils import cint, flt

from bunood_theme.printing.jinja import bunood_amount_in_words
from bunood_theme.printing.view import _is_vat, date, num, qty

BEFORE, AFTER, PERCENT = "Before VAT", "After VAT", "Percent"


def _field(doc, meta, name):
    return doc.get(name) if meta.has_field(name) else None


def is_contracting(doc) -> bool:
    """A contracting invoice (not its credit note), on a site whose invoices have the field."""
    if not doc or not doc.get("doctype") or cint(doc.get("is_return")):
        return False
    return bool(frappe.get_meta(doc.doctype).has_field("bnd_is_progress") and cint(doc.get("bnd_is_progress")))


def _percent(value) -> str:
    value = flt(value)
    return f"{value:g}%" if value else ""


def _rate(doc) -> str:
    rates = {flt(tax.get("rate")) for tax in doc.get("taxes") or [] if _is_vat(tax) and tax.get("rate")}
    return f"{rates.pop():g}%" if len(rates) == 1 else ""


def _words_en(amount: float, currency: str) -> str:
    """«Forty-nine thousand six hundred fifty-two Saudi riyals and fifty-one halalas only»."""
    try:
        from num2words import num2words
    except ImportError:
        return ""
    whole = int(abs(flt(amount)))
    fraction = round((abs(flt(amount)) - whole) * 100)
    if fraction == 100:
        whole, fraction = whole + 1, 0
    main, small = ("Saudi riyals", "halalas") if (currency or "SAR") == "SAR" else (currency, "cents")
    # As the owner's mock writes it: no commas, no «and» inside a number.
    words = lambda value: num2words(value, lang="en").replace(",", "").replace(" and ", " ")
    text = f"{words(whole)} {main}"
    if fraction:
        text += f" and {words(fraction)} {small}"
    return (text + " only")[:1].upper() + (text + " only")[1:]


def _words_ar(amount: float, currency: str) -> str:
    text = (bunood_amount_in_words(abs(flt(amount)), currency or "SAR", 2) or "").strip()
    tail = " فقط لا غير"
    if text.endswith(tail):
        return "فقط " + text[: -len(tail)] + " لا غير"
    return text


def contracting_view(doc) -> dict:
    meta = frappe.get_meta(doc.doctype)
    rows = _field(doc, meta, "bnd_progress_adjustments") or []
    currency = doc.get("currency") or ""
    rate = _rate(doc)
    grand = abs(flt(doc.get("grand_total")))
    advance_paid = abs(flt(doc.get("total_advance")))

    def label(row, english=False):
        name = (row.get("label_en") if english else row.get("label")) or row.get("label") or ""
        share = _percent(row.get("percent")) if row.get("basis") == PERCENT else ""
        return f"{name} {share}".strip()

    before = [row for row in rows if row.get("tax_effect") == BEFORE and flt(row.get("amount"))]
    after = [row for row in rows if row.get("tax_effect") == AFTER and flt(row.get("amount"))]
    ladder = [{"cls": "tot", "ar": "إجمالي قيمة الأعمال", "en": "Gross value of works", "amount": num(doc.get("total"))}]
    for row in before:
        ladder.append({"cls": "ded", "ar": label(row), "en": label(row, True), "amount": f"({num(row.get('amount'))})", "neg": True})
    if before:
        ladder.append({"cls": "tot", "ar": "الإجمالي الخاضع للضريبة", "en": "Taxable amount", "amount": num(doc.get("net_total"))})
    ladder.append({"cls": "", "ar": f"ضريبة القيمة المضافة {rate}".strip(), "en": f"VAT {rate}".strip(), "amount": num(doc.get("total_taxes_and_charges"))})
    ladder.append({"cls": "inv", "ar": "إجمالي الفاتورة شامل الضريبة", "en": "Invoice total incl. VAT", "amount": num(grand), "key": "total"})
    for row in after:
        due = date(row.get("due_date"))
        sub = (f"يستحق <span class=\"num\">{due}</span>" if due else "يستحق عند التسليم") + " · <span class=\"en\">" + (f"due {due}" if due else "due at handover") + "</span>"
        ladder.append({"cls": "ded", "ar": label(row), "en": label(row, True), "amount": f"({num(row.get('amount'))})", "neg": True, "sub": sub})
    if advance_paid >= 0.005:
        ladder.append({"cls": "ded", "ar": "الدفعات المستلمة مقدماً", "en": "Advance paid", "amount": f"({num(advance_paid)})", "neg": True})
    now = flt(grand - sum(flt(row.get("amount")) for row in after) - advance_paid, 2)
    ladder.append({"cls": "net", "ar": "الصافي المستحق الآن", "en": "Net payable now", "amount": num(now), "key": "now"})

    project = doc.get("project") or ""
    if project:
        project = frappe.db.get_value("Project", project, "project_name") or project
    project = project or _field(doc, meta, "bnd_project_label") or ""
    works = []
    for line in doc.get("items") or []:
        works.append(
            {
                "idx": line.get("idx"),
                "ar": line.get("description") or line.get("item_name") or "",
                "en": line.get("bnd_description_en") or "",
                "qty": qty(line.get("qty")),
                "uom": line.get("uom") or "",
                "rate": num(line.get("rate")),
                "vat": rate,
                "amount": num(line.get("amount")),
            }
        )
    start, end = date(_field(doc, meta, "bnd_supply_from")), date(_field(doc, meta, "bnd_supply_to"))
    issued = " ".join(part for part in (date(doc.get("posting_date")), str(doc.get("posting_time") or "")[:5]) if part)
    return {
        "currency": currency,
        "number": doc.get("name") or "",
        "certificate": _field(doc, meta, "bnd_certificate_no") or "",
        "issued": issued,
        "po": doc.get("po_no") or "",
        "start": start,
        "end": end,
        "project": project,
        "due": date(_first_due(doc)),
        "scope_ar": (_field(doc, meta, "bnd_work_description") or "").strip(),
        "scope_en": (_field(doc, meta, "bnd_work_description_en") or "").strip(),
        "works": works,
        "gross": num(doc.get("total")),
        "ladder": ladder,
        "now": now,
        "words_ar": _words_ar(now, currency),
        "words_en": _words_en(now, currency),
        "draft": doc.get("docstatus") == 0,
    }


def _first_due(doc):
    """«تاريخ الاستحقاق»: when what is due now is due (the schedule's first row), else the invoice's."""
    schedule = doc.get("payment_schedule") or []
    return schedule[0].get("due_date") if schedule else doc.get("due_date")
