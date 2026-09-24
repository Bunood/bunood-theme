"""Rename the Arabic brand and adopt the launch document defaults."""

import frappe


def execute():
    from bunood_theme.printing.install import LEGACY_FORMAT_NAMES

    for old_name, new_name in LEGACY_FORMAT_NAMES.items():
        if not frappe.db.exists("Print Format", old_name):
            continue
        if not frappe.db.exists("Print Format", new_name):
            frappe.rename_doc("Print Format", old_name, new_name, force=True)
        else:
            frappe.db.set_value(
                "Property Setter",
                {"property": "default_print_format", "value": old_name},
                "value",
                new_name,
                update_modified=False,
            )
            frappe.delete_doc("Print Format", old_name, force=True, ignore_permissions=True)

