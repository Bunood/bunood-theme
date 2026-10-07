"""Shared deployment-time installer for Bunood fields on native DocTypes."""

from __future__ import annotations


def fields_installed(frappe, custom_fields: dict) -> bool:
    try:
        return all(
            frappe.get_meta(doctype).has_field(spec["fieldname"])
            for doctype, specs in custom_fields.items()
            for spec in specs
        )
    except Exception:
        return False


def ensure_custom_fields(frappe, custom_fields: dict) -> None:
    """Reconcile field metadata idempotently during install or migration only."""
    for doctype, specs in custom_fields.items():
        if not frappe.db.exists("DocType", doctype):
            continue
        for spec in specs:
            name = frappe.db.exists(
                "Custom Field", {"dt": doctype, "fieldname": spec["fieldname"]}
            )
            if name:
                field = frappe.get_doc("Custom Field", name)
                changed = False
                for key, value in spec.items():
                    if field.get(key) != value:
                        field.set(key, value)
                        changed = True
                if changed:
                    field.save(ignore_permissions=True)
            else:
                frappe.get_doc({"doctype": "Custom Field", "dt": doctype, **spec}).insert(
                    ignore_permissions=True
                )
        frappe.clear_cache(doctype=doctype)
