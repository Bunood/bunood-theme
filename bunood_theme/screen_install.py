"""Install only invoice-screen metadata, without changing tenant finance defaults."""

import frappe

from bunood_theme.payments import ensure_payment_origin_field


def install() -> None:
    """Add the optional settlement choice only when the tenant has no such field."""
    ensure_payment_origin_field()
    if not frappe.db.exists("DocType", "Sales Invoice"):
        return
    if frappe.get_meta("Sales Invoice").has_field("bunood_settlement_method"):
        return
    frappe.get_doc({
        "doctype": "Custom Field", "dt": "Sales Invoice",
        "fieldname": "bunood_settlement_method", "label": "Settlement Method",
        "fieldtype": "Select", "options": "On Credit\nCash\nNetwork\nMixed Payment",
        "default": "On Credit", "insert_after": "due_date", "allow_on_submit": 1,
    }).insert(ignore_permissions=True)
    frappe.clear_cache(doctype="Sales Invoice")
