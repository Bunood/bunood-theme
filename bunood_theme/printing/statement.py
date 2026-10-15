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
            from_date: str | None = None, to_date: str | None = None) -> dict:
    """Everything the statement template cannot compute in the browser: the page's opening and
    closing chrome (the kit's stylesheet, head, foot, page number — `open` / `close`), the party
    box, the title, a customer's aging, and who printed it when."""
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
        "aging": aging(company, party, to_date) if party_type == "Customer" and party else [],
        "printed_at": now_datetime().strftime("%Y-%m-%d %H:%M"),
        "printed_by": frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user,
        "profile": {k: v for k, v in company_profile(company, arabic=arabic).items() if k in ("name_ar", "name_en", "vat", "cr")},
    }


#: The aging strip's buckets (the market study): not yet due, then days past due.
BUCKETS = (("current", "غير مستحق", "Current"), ("1-30", "1-30 يوماً", "1-30 days"), ("31-60", "31-60 يوماً", "31-60 days"),
           ("61-90", "61-90 يوماً", "61-90 days"), ("90+", "أكثر من 90", "90+ days"))


def aging(company, customer, to_date) -> list[dict]:
    """A customer's outstanding sales invoices by days past due, as of the statement's end."""
    as_of = getdate(to_date) if to_date else getdate()
    totals = {key: 0.0 for key, _ar, _en in BUCKETS}
    rows = frappe.get_all(
        "Sales Invoice",
        filters={"company": company, "customer": customer, "docstatus": 1, "outstanding_amount": [">", 0],
                 "posting_date": ["<=", as_of]},
        fields=["due_date", "posting_date", "outstanding_amount"],
    )
    for row in rows:
        due = getdate(row.due_date or row.posting_date)
        days = (as_of - due).days
        key = "current" if days <= 0 else "1-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
        totals[key] += flt(row.outstanding_amount)
    return [{"key": key, "ar": ar, "en": en, "amount": view.num(totals[key])} for key, ar, en in BUCKETS]

