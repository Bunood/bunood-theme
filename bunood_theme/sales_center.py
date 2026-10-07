"""Permission-filtered sales work lists over native ERPNext documents.

This presentation reader creates no business documents, balances or postings.
ERPNext's get_list retains document and user permissions for every page.
"""

import re

import frappe
from frappe import _


DOCUMENTS = {
    "Quotation": ("party_name", "transaction_date", "grand_total"),
    "Sales Order": ("customer", "transaction_date", "grand_total"),
    "Delivery Note": ("customer", "posting_date", "grand_total"),
    "Sales Invoice": ("customer", "posting_date", "grand_total"),
    "Payment Entry": ("party", "posting_date", "paid_amount"),
}
STATES = {"all": None, "drafts": 0, "active": 1, "cancelled": 2}
PAGE_SIZE = 25


@frappe.whitelist(methods=["GET"])
def read(company: str, doctype: str = "Sales Invoice", state: str = "all",
         search: str = "", start: str | int = 0) -> dict:
    if doctype not in DOCUMENTS or state not in STATES:
        frappe.throw(_("Invalid sales list"))
    if isinstance(start, bool) or not re.fullmatch(r"[0-9]{1,6}", str(start)):
        frappe.throw(_("Invalid page"))
    if not isinstance(search, str) or len(search) > 140:
        frappe.throw(_("Search is too long"))
    if not company:
        frappe.throw(_("Select a company"))
    frappe.get_doc("Company", company).check_permission("read")
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    party, date_field, amount = DOCUMENTS[doctype]
    filters = {"company": company}
    if STATES[state] is not None:
        filters["docstatus"] = STATES[state]
    if doctype == "Payment Entry":
        filters.update(party_type="Customer", payment_type="Receive")
    options = {
        "fields": ["name", "docstatus", party, date_field, amount],
        "filters": filters,
        "order_by": "modified desc, name desc",
        "start": int(start),
        "page_length": PAGE_SIZE + 1,
    }
    if search.strip():
        pattern = "%" + search.strip() + "%"
        options["or_filters"] = {"name": ["like", pattern], party: ["like", pattern]}
    if doctype == "Payment Entry":
        options["fields"].append("paid_from_account_currency")
    else:
        options["fields"].extend(["currency", "status"])
    rows = frappe.get_list(doctype, **options)
    return {
        "doctype": doctype,
        "rows": rows[:PAGE_SIZE],
        "has_more": len(rows) > PAGE_SIZE,
        "page_size": PAGE_SIZE,
        "party_field": party,
        "date_field": date_field,
        "amount_field": amount,
        "currency_field": "paid_from_account_currency" if doctype == "Payment Entry" else "currency",
    }
