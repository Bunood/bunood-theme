"""The statement of account's server half (the print redesign, Stage 2).

«كشف حساب - A4» is a General Ledger REPORT print format, and a report prints through Frappe's
client-side microtemplates: the template cannot call the kit's Jinja. So it asks this endpoint,
once, synchronously, for what only the server knows — the kit's stylesheet, the page chrome
(head, foot, policy) rendered by the same macros every kit document uses, the party box, and a
customer's aging — and lays out the ledger rows itself.

`report_to_pdf` (printing/reports.py) then renders a kit statement on Chromium, the engine the
kit is written for; every other report keeps Frappe's own path.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, getdate, now_datetime

from bunood_theme.printing import view

#: The marker the template leaves between the page's opening and closing chrome.
CONTENT = "<!--ZO-STATEMENT-CONTENT-->"
#: The class report_to_pdf looks for to send a statement through Chromium.
MARKER = "zo-statement"


@frappe.whitelist(methods=["GET", "POST"])
def context(company: str | None = None, party_type: str | None = None, party: str | None = None,
            from_date: str | None = None, to_date: str | None = None, lines: str | None = None) -> dict:
    """Everything the statement template cannot compute in the browser: the page's opening and
    closing chrome (the kit's stylesheet, head, foot, page number — `open` / `close`), the party
    box, the title, the party's aging, who printed it when, and — for the ledger's lines the
    template sends (`lines`, JSON [voucher_type, voucher_no, remarks, against_type, against_no])
    — each document's name and «البيان» in both languages."""
    if not frappe.has_permission("GL Entry", "read"):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    company = company or frappe.defaults.get_user_default("Company")
    if company and not frappe.has_permission("Company", "read", doc=company):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    from bunood_theme.printing.jinja import bunood_print_language
    from bunood_theme.printing.profile import company_profile

    arabic = bunood_print_language() == "ar"
    doc = frappe._dict(company=company, docstatus=1, doctype="GL Entry")
    party_box = ""
    party_name = party or ""
    if party_type in ("Customer", "Supplier") and party and frappe.db.exists(party_type, party):
        from bunood_theme.printing.profile import party_profile

        field = "customer" if party_type == "Customer" else "supplier"
        profile = party_profile(frappe._dict({field: party, "doctype": "GL Entry"}), party_type, arabic=arabic)
        party_name = profile["name"]
        party_box = frappe.render_template(
            "{% from 'templates/print/kit.html' import party_box %}"
            "{{ party_box(head_ar, head_en, name, sub, cells) }}",
            {"head_ar": "العميل" if party_type == "Customer" else "المورد", "head_en": party_type,
             "name": profile["name"], "sub": profile["name_ar"], "cells": profile["cells"]},
        )
    shell = frappe.render_template("templates/print/statement_shell.html", {"doc": doc, "content": CONTENT})
    head, _sep, foot = shell.partition(CONTENT)
    return {
        "open": head,
        "close": foot,
        "party_box": party_box,
        "party_name": party_name,
        "title_ar": "كشف حساب مورد" if party_type == "Supplier" else ("كشف حساب عميل" if party_type == "Customer" else "كشف حساب"),
        "aging": aging(company, party_type, party, to_date) if party_type in ("Customer", "Supplier") and party else [],
        "lines": line_labels(frappe.parse_json(lines) if lines else []),
        "printed_at": now_datetime().strftime("%Y-%m-%d %H:%M"),
        "printed_by": frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user,
        "profile": {k: v for k, v in company_profile(company, arabic=arabic).items() if k in ("name_ar", "name_en", "vat", "cr")},
    }


#: The aging strip's buckets (the market study): not yet due, then days past due.
BUCKETS = (("current", "غير مستحق", "Current"), ("1-30", "1-30 يوماً", "1-30 days"), ("31-60", "31-60 يوماً", "31-60 days"),
           ("61-90", "61-90 يوماً", "61-90 days"), ("90+", "أكثر من 90", "90+ days"))


def aging(company, party_type, party, to_date) -> list[dict]:
    """A party's outstanding invoices by days past due, as of the statement's end: a customer's
    sales invoices (what is owed to us), a supplier's purchase invoices (what we owe). A credit
    or debit note that keeps its own outstanding (ERPNext's default since v15) counts too,
    negative, so the strip adds up to the balance."""
    as_of = getdate(to_date) if to_date else getdate()
    totals = {key: 0.0 for key, _ar, _en in BUCKETS}
    doctype, field = ("Purchase Invoice", "supplier") if party_type == "Supplier" else ("Sales Invoice", "customer")
    rows = frappe.get_all(
        doctype,
        filters={"company": company, field: party, "docstatus": 1, "outstanding_amount": ["!=", 0],
                 "posting_date": ["<=", as_of]},
        fields=["due_date", "posting_date", "outstanding_amount"],
    )
    for row in rows:
        due = getdate(row.due_date or row.posting_date)
        days = (as_of - due).days
        key = "current" if days <= 0 else "1-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
        totals[key] += flt(row.outstanding_amount)
    # A bucket the credits outweigh prints in brackets, as the ledger prints a credit balance.
    signed = lambda value: f"({view.num(value)})" if value < -0.004 else view.num(value)
    return [{"key": key, "ar": ar, "en": en, "amount": signed(totals[key])} for key, ar, en in BUCKETS]



# --- the ledger's lines: the document's name and «البيان» -----------------------------------------

#: A ledger line's document, named as the business app names it (its accounts and trade screens).
DOC_NAMES = {
    "Sales Invoice": ("فاتورة مبيعات", "Sales invoice"),
    "POS Invoice": ("فاتورة مبيعات", "Sales invoice"),
    "Purchase Invoice": ("فاتورة مشتريات", "Purchase invoice"),
    "Payment Entry": ("سند صرف", "Payment voucher"),
    "Journal Entry": ("سند قيد", "Journal voucher"),
    "Delivery Note": ("تسليم", "Delivery"),
    "Purchase Receipt": ("سند استلام", "Purchase receipt"),
    "Stock Entry": ("حركة مخزون", "Stock movement"),
    "Period Closing Voucher": ("قيد إقفال الفترة", "Period closing voucher"),
}
#: …and by the kind of that document: a return, a debit note, which way a payment went.
KIND_NAMES = {
    ("Sales Invoice", "return"): ("إشعار دائن", "Credit note"),
    ("Sales Invoice", "debit"): ("إشعار مدين", "Debit note"),
    ("POS Invoice", "return"): ("إشعار دائن", "Credit note"),
    ("Purchase Invoice", "return"): ("مرتجع مشتريات", "Purchase return"),
    ("Payment Entry", "Receive"): ("سند قبض", "Receipt voucher"),
    ("Payment Entry", "Pay"): ("سند صرف", "Payment voucher"),
    ("Payment Entry", "Internal Transfer"): ("تحويل داخلي", "Internal transfer"),
}
#: How long «البيان» may run (the business app's ledger: accounts.REMARK_LIMIT).
REMARK_LIMIT = 120
NO_REMARKS = "No Remarks"


def _kinds(pairs) -> dict:
    """{(doctype, name): kind} — "return" / "debit" for an invoice, the payment type for a payment."""
    by_type: dict[str, set] = {}
    for doctype, name in pairs:
        if doctype and name:
            by_type.setdefault(doctype, set()).add(name)
    out = {}
    for doctype, names in by_type.items():
        if doctype in ("Sales Invoice", "POS Invoice", "Purchase Invoice"):
            debit = frappe.get_meta(doctype).has_field("is_debit_note")
            for row in frappe.get_all(doctype, filters={"name": ["in", sorted(names)]},
                                      fields=["name", "is_return"] + (["is_debit_note"] if debit else [])):
                out[(doctype, row.name)] = "return" if row.is_return else ("debit" if row.get("is_debit_note") else "")
        elif doctype == "Payment Entry":
            for row in frappe.get_all(doctype, filters={"name": ["in", sorted(names)]}, fields=["name", "payment_type"]):
                out[(doctype, row.name)] = row.payment_type or ""
    return out


def doc_name(doctype: str, kind: str = "") -> tuple[str, str]:
    """(Arabic, English) for a document of `doctype` and `kind`."""
    names = KIND_NAMES.get((doctype, kind)) or DOC_NAMES.get(doctype)
    if names:
        return names
    return frappe._(doctype, lang="ar") if doctype else "", doctype or ""


def note(remarks: str | None) -> str:
    """The first line of a remark, short; ERPNext's default "No Remarks" (or none) is nothing."""
    first = next((line.strip() for line in str(remarks or "").splitlines() if line.strip()), "")
    text = " ".join(first.split())
    if text == NO_REMARKS:
        return ""
    return text[: REMARK_LIMIT - 1].rstrip() + "…" if len(text) > REMARK_LIMIT else text


def line_labels(lines) -> dict:
    """{voucher_no: {type_ar, type_en, note_ar, note_en, note_no}} for the ledger's lines: the
    document's own name (a credit note, a receipt voucher…), and «البيان» — the line's remark, or,
    where ERPNext wrote none, the document it settles («فاتورة مبيعات» + `note_no`, which the
    template keeps on one line)."""
    rows = [list(row) + [None] * (5 - len(row)) for row in lines or [] if row]
    kinds = _kinds([(row[0], row[1]) for row in rows] + [(row[3], row[4]) for row in rows])
    out = {}
    for doctype, name, remarks, against_type, against_no in (row[:5] for row in rows):
        if not name or name in out:
            continue
        type_ar, type_en = doc_name(doctype, kinds.get((doctype, name), ""))
        text = note(remarks)
        note_ar = note_en = text
        note_no = ""
        if not text and against_no and against_no != name:
            note_ar, note_en = doc_name(against_type, kinds.get((against_type, against_no), ""))
            note_no = against_no
        out[name] = {"type_ar": type_ar, "type_en": type_en, "note_ar": note_ar, "note_en": note_en, "note_no": note_no}
    return out
