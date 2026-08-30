# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Carry two renamed side-pane settings across — item 40.

    sidebar_section_layout    -> sidebar_section_style
    sidebar_surface_intensity -> sidebar_card_depth

WHY THEY WERE RENAMED
    "Section layout" described a LAYOUT, and one of its four options
    ("Accordion Cards") was never a layout at all — it was Cards plus a
    collapse behaviour that does not exist. Calling the axis a STYLE stops the
    name promising a behaviour, which is what the fourth option has been
    borrowing to look like a real choice.

    "Surface intensity" named nothing a user can see. The control only reaches
    card sections — it is the depth of a card — and a name that does not say
    which surface cannot tell you why it looks inert under Plain.

WHY A PATCH AT ALL, FOR WHAT LOOKS LIKE A NO-OP
    Frappe stores a Single's values in `tabSingles` keyed by FIELDNAME. Rename
    the field in the doctype JSON and the stored row is orphaned: the new field
    reads empty, the boot payload carries "", and the site silently loses a
    setting it had chosen. Nothing errors — which is why this is easy to skip.

    The option VALUES are unchanged in both cases, so this moves rows and
    translates nothing.

READ FROM `tabSingles`, NOT `get_single_value`
    Patches run after the doctype JSON is synced, so the OLD fieldname is
    already gone from the meta by the time this executes, and
    `frappe.db.get_single_value` consults the meta and RAISES for a field the
    doctype has lost. Item 37 measured that; `retire_apps_rail` is the first
    patch that had to read such a field, and this is the second.

    A missing row means the tenant never moved off the shipped default, so
    absence writes nothing and deletes nothing.
"""

import frappe

#: old fieldname -> new fieldname. Values carry across unchanged.
RENAMES = (
    ("sidebar_section_layout", "sidebar_section_style"),
    ("sidebar_surface_intensity", "sidebar_card_depth"),
)


def execute() -> None:
    moved = 0
    for old, new in RENAMES:
        # Raw SQL on purpose: see the module docstring.
        rows = frappe.db.sql(
            "select value from tabSingles where doctype = %s and field = %s",
            ("Theme Settings", old),
        )
        if rows and str(rows[0][0] or "").strip():
            # set_single_value, not a doc save: this migration has no opinion
            # about the document's other fields and must not validate them.
            frappe.db.set_single_value("Theme Settings", new, rows[0][0])
            moved += 1
        frappe.db.sql(
            "delete from tabSingles where doctype = %s and field = %s",
            ("Theme Settings", old),
        )
    if moved:
        frappe.clear_cache(doctype="Theme Settings")
