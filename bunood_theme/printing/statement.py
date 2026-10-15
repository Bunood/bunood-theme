"""The statement of account (the print redesign, Stage 2), rendered on the SERVER.

«كشف حساب - A4» is a General Ledger REPORT print format, and a report prints through Frappe's
client-side microtemplates. The template is a thin shell: it sends the report's filters to
`render` once and prints what comes back. `render` runs the General Ledger itself through
Frappe's own report runner (the Report's roles, the doctype's report permission, the ledger's
user permissions) and lays the statement out in Jinja with the kit's macros —
templates/print/statement.html — the same page every kit document prints on.

The PDF (`report_to_pdf`, printing/reports.py) never renders the HTML the browser posts: any
signed-in user can post anything there, and Chromium fetches what a page names (the v0.60.0
review, finding 2). It reads only the filters the statement carries (`data-zo-filters`) and
renders the statement again here, from the report's data.
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import flt, getdate, now_datetime

from bunood_theme.printing import view

#: The marker the template leaves between the page's opening and closing chrome.
CONTENT = "<!--ZO-STATEMENT-CONTENT-->"
#: The class report_to_pdf looks for to send a statement through Chromium.
MARKER = "zo-statement"
#: The attribute on the marker that carries the report's filters, for the PDF.
FILTERS_ATTR = "data-zo-filters"
#: The report the statement prints.
REPORT = "General Ledger"


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


# --- the statement, rendered here from the report's own data ----------------------------------------

def _filters(filters) -> dict:
    """The report's filters as a dict, from the client's JSON or a dict; nothing else is read."""
    if isinstance(filters, str):
        filters = json.loads(filters or "{}")
    if not isinstance(filters, dict):
        raise frappe.ValidationError("filters")
    return dict(filters)


def report_rows(filters: dict) -> list[dict]:
    """The General Ledger's rows for these filters, as the desk shows them: through Frappe's own
    report runner, which refuses a user without the Report's roles or the doctype's report
    permission; the ledger applies the user's permissions to GL Entry."""
    from frappe.desk.query_report import run

    result = run(REPORT, filters=filters, ignore_prepared_report=True, are_default_filters=False)
    if result is None:
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
    return [row for row in result.get("result") or [] if isinstance(row, dict)]


def _parties(filters: dict) -> list[str]:
    party = filters.get("party")
    if isinstance(party, str):
        party = [party] if party else []
    return [p for p in party or [] if p]


def statement_view(filters: dict, rows: list[dict]) -> dict:
    """What the statement prints, from the ledger's rows: the opening, the entries, the totals and
    the closing (the ledger's rows without a posting date are its summary rows: opening first,
    closing last, the totals before it), each entry's document name and «البيان»."""
    summary = [row for row in rows if not row.get("posting_date")]
    entries = [row for row in rows if row.get("posting_date")]
    opening = summary[0] if summary else {}
    closing = summary[-1] if len(summary) > 1 else {}
    total = summary[-2] if len(summary) > 2 else {}
    opening_balance = flt(opening.get("balance")) or (flt(opening.get("debit")) - flt(opening.get("credit")))
    if closing.get("balance") is None:
        closing_balance = opening_balance + flt(total.get("debit")) - flt(total.get("credit"))
    else:
        closing_balance = flt(closing.get("balance"))
    sent, lines = set(), []
    for row in entries:
        if row.get("voucher_no") and row["voucher_no"] not in sent:
            sent.add(row["voucher_no"])
            lines.append([row.get("voucher_type") or "", row["voucher_no"], str(row.get("remarks") or "")[:400],
                          row.get("against_voucher_type") or "", row.get("against_voucher") or ""])
    parties = _parties(filters)
    company = filters.get("company") or frappe.defaults.get_user_default("Company") or ""
    ctx = context(company=company, party_type=filters.get("party_type") or "",
                  party=parties[0] if len(parties) == 1 else "", from_date=filters.get("from_date") or "",
                  to_date=filters.get("to_date") or "", lines=json.dumps(lines))
    named = ctx.get("lines") or {}
    money = lambda value: view.num(value) if flt(value) else ""
    out = []
    for row in entries:
        label = named.get(row.get("voucher_no")) or {}
        out.append({
            "date": view.date(row.get("posting_date")),
            "type_ar": label.get("type_ar") or frappe._(row.get("voucher_type") or "", lang="ar"),
            "type_en": label.get("type_en") or row.get("voucher_type") or "",
            "note_ar": label.get("note_ar") or "",
            "note_en": label.get("note_en") or "",
            "note_no": label.get("note_no") or "",
            "number": row.get("voucher_no") or "",
            "debit": money(row.get("debit")) or "—",
            "credit": money(row.get("credit")) or "—",
            "balance": balance(row.get("balance")),
        })
    return {
        "ctx": ctx,
        "company": company,
        "parties": parties,
        "from_date": view.date(filters.get("from_date")),
        "to_date": view.date(filters.get("to_date")),
        "opening_debit": money(opening.get("debit")),
        "opening_credit": money(opening.get("credit")),
        "opening": balance(opening_balance),
        "closing": balance(closing_balance),
        "total_debit": view.num(total.get("debit")),
        "total_credit": view.num(total.get("credit")),
        "entries": out,
        "filters": json.dumps(filters, separators=(",", ":"), ensure_ascii=False, default=str),
    }


def balance(value) -> str:
    """A balance as the ledger prints it: a credit balance in brackets; nothing when unknown."""
    if value is None or value == "":
        return ""
    return f"({view.num(value)})" if flt(value) < 0 else view.num(value)


@frappe.whitelist(methods=["POST"])
def render(filters: str | None = None) -> str:
    """The statement for these General Ledger filters, as HTML (the print format's shell prints
    it; the PDF renders it again from the same filters)."""
    filters = _filters(filters)
    s = statement_view(filters, report_rows(filters))
    doc = frappe._dict(company=s["company"], docstatus=1, doctype="GL Entry")
    return frappe.render_template("templates/print/statement.html", {"doc": doc, "s": s})


def filters_from(html: str) -> dict | None:
    """The filters a posted statement carries, or None: the only thing the PDF reads from it."""
    from bs4 import BeautifulSoup

    node = BeautifulSoup(html or "", "html.parser").find(class_=MARKER)
    raw = node.get(FILTERS_ATTR) if node else None
    if not raw:
        return None
    try:
        return _filters(raw)
    except Exception:
        return None


def document(filters: dict) -> str:
    """The whole page Chromium prints: Frappe's report print wrapper (its print stylesheet, its
    print style) around the statement rendered from the report's data."""
    from frappe.utils import get_url
    from frappe.utils.jinja_globals import bundled_asset

    from bunood_theme.printing.jinja import bunood_print_language

    ar = bunood_print_language() == "ar"
    try:
        from frappe.www.printview import get_print_style

        print_css = get_print_style()
    except Exception:
        print_css = ""
    sheet = get_url(allow_header_override=False) + bundled_asset("print.bundle.css", rtl=ar)
    body = render(json.dumps(filters, default=str))
    return (
        f'<!DOCTYPE html><html lang="{"ar" if ar else "en"}" dir="{"rtl" if ar else "ltr"}"><head>'
        f'<meta charset="utf-8"><title>{frappe.utils.escape_html(frappe._("Statement of Account"))}</title>'
        f'<link href="{frappe.utils.escape_html(sheet)}" rel="stylesheet"><style>{print_css}</style></head>'
        f'<body><div class="print-format-gutter"><div class="print-format">{body}</div></div></body></html>'
    )
