"""Install only invoice-screen metadata, without changing tenant finance defaults."""

import frappe

from bunood_theme.payments import SETTLEMENT_METHODS, ensure_payment_origin_field

SETTLEMENT_FIELD = "Sales Invoice-bunood_settlement_method"


def install() -> None:
    """Add the optional settlement choice, or bring an existing one's choices up to date."""
    ensure_payment_origin_field()
    if not frappe.db.exists("DocType", "Sales Invoice"):
        return
    options = "\n".join(SETTLEMENT_METHODS)
    if frappe.get_meta("Sales Invoice").has_field("bunood_settlement_method"):
        # Bank Transfer arrived with the checkout dialog (v0.58.0); the value set
        # an invoice already carries stays valid, so only the list grows.
        if frappe.db.get_value("Custom Field", SETTLEMENT_FIELD, "options") not in (None, options):
            frappe.db.set_value("Custom Field", SETTLEMENT_FIELD, "options", options)
            frappe.clear_cache(doctype="Sales Invoice")
        return
    frappe.get_doc({
        "doctype": "Custom Field", "dt": "Sales Invoice",
        "fieldname": "bunood_settlement_method", "label": "Settlement Method",
        "fieldtype": "Select", "options": options,
        "default": "On Credit", "insert_after": "due_date", "allow_on_submit": 1,
    }).insert(ignore_permissions=True)
    frappe.clear_cache(doctype="Sales Invoice")
