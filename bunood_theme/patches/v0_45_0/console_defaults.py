# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Move sites that never chose onto Bunood Console's two moved defaults — item 43.

WHAT MOVED
    A10 made Bunood Console the shipped default. Ten of its axes are NEW fields
    (``desk_width``, ``form_fields``, ``form_grid`` …): a site that predates them
    has no row at all, which already reads as the new default — nothing to
    write. Two axes EXISTED and changed their default, and those are this
    patch's whole subject:

        form_sidebar   Floating Pane   ->  Inspector Rail
        list_style     Floating Cards  ->  Zebra Stripes

WHY A PATCH AT ALL
    Both are THEME AXES (``presets.THEME_AXES``), and ``bnd_theme_match``
    compares every axis against each preset's composed values, whose baseline
    is the shipped default. Leave the old value in the row and the site stores
    "Floating Cards" against a baseline that now says "Zebra Stripes": no preset
    matches, and every theme card reads "Custom" on that site, forever. Item 37
    met this first; ``v0_40_0.quick_links_stand_down`` is the copied precedent,
    docstring and limits included.

WHAT IT REFUSES TO MOVE
    ONLY a row still holding the OLD default. A site on Hairline Rows, or on
    Quiet Pane, chose — and this must not overwrite a choice. The honest limit,
    stated because it cannot be fixed: Frappe stores no "was this explicitly
    set" bit, so a tenant who deliberately picked Floating Cards is
    indistinguishable from one who never opened the picker. Both move; the
    setting is one click away in either direction and the picker still offers
    every style. A missing row means the site never had a value, which is
    already the new default.
"""

import frappe

#: field -> (the value that means "never touched" before item 43, the new default)
MOVED = {
    "form_sidebar": ("Floating Pane", "Inspector Rail"),
    "list_style": ("Floating Cards", "Zebra Stripes"),
}


def execute() -> None:
    moved = False
    for field, (old, new) in MOVED.items():
        # Both fields still EXIST, so the ordinary reader is correct here.
        if frappe.db.get_single_value("Theme Settings", field) == old:
            frappe.db.set_single_value("Theme Settings", field, new)
            moved = True
    if moved:
        frappe.clear_cache(doctype="Theme Settings")
