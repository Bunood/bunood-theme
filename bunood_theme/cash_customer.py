"""A native walk-in customer for quick sales, without inventing accounting defaults.

Customer is site-wide in ERPNext.  The record is created once per installation;
its actual document name is used because some sites use a naming series.
"""

import frappe


CASH_CUSTOMER_NAME = "عميل نقدي"


def _set_field_default(doctype: str, fieldname: str, value: str) -> None:
    """Claim only an unset native default; an administrator's choice wins."""
    if not frappe.db.exists("DocType", doctype):
        return
    field = frappe.get_meta(doctype).get_field(fieldname)
    if not field or field.default:
        return
    if frappe.db.exists(
        "Property Setter",
        {"doc_type": doctype, "field_name": fieldname, "property": "default"},
    ):
        return  # An explicit blank setter is also an administrator choice.
    frappe.make_property_setter(
        {
            "doctype": doctype,
            "fieldname": fieldname,
            "property": "default",
            "value": value,
            "property_type": "Text",
        },
        is_system_generated=False,
    )
    frappe.clear_cache(doctype=doctype)


def ensure_cash_customer_defaults() -> str | None:
    """Provision walk-in sales defaults for this site, preserving existing choices.

    This is intentionally not a default on Quotations, Sales Orders, Payment
    Entries or Purchase documents: those flows require a deliberate party.
    Warehouse, tax and payment accounts continue to follow native company,
    item and profile configuration rather than an unsafe site-wide value.
    """
    # ERPNext's setup wizard may not have created the first Company yet.
    # after_setup_wizard will call us again when the site is ready to sell.
    if (
        not frappe.db.exists("DocType", "Customer")
        or not frappe.db.exists("DocType", "Company")
        or not frappe.db.count("Company")
    ):
        return None

    customer = frappe.db.get_value(
        "Customer", {"customer_name": CASH_CUSTOMER_NAME, "disabled": 0}, "name"
    )
    if not customer:
        # A disabled walk-in customer is an administrator decision. Do not
        # revive it or try to insert a duplicate on Customer Name sites.
        if frappe.db.exists("Customer", {"customer_name": CASH_CUSTOMER_NAME}):
            return None
        doc = frappe.new_doc("Customer")
        doc.customer_name = CASH_CUSTOMER_NAME
        doc.customer_type = "Individual"
        if frappe.db.exists("Customer Group", "Individual"):
            doc.customer_group = "Individual"
        if frappe.db.exists("Territory", "All Territories"):
            doc.territory = "All Territories"
        doc.insert(ignore_permissions=True)
        customer = doc.name

    _set_field_default("Sales Invoice", "customer", customer)
    _set_field_default("POS Profile", "customer", customer)

    # Native POS reads POS Profile.customer, not the field's DocType default.
    # Populate already-created profiles only when they have no customer.
    if frappe.db.exists("DocType", "POS Profile"):
        for name in frappe.get_all(
            "POS Profile", filters={"customer": ["in", ["", None]]}, pluck="name"
        ):
            frappe.db.set_value("POS Profile", name, "customer", customer)
    return customer
