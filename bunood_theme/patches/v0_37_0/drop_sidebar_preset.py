# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Delete the stored ``sidebar_preset`` row — item 37.

WHY THE FIELD WENT
    It was the last stored preset NAME in the app, and a preset name is not a
    fact: the settings architecture has said since phase 0 that presets *write
    values and then stop existing*, with the active label DERIVED by comparison.
    Print reached that shape, the layout reached it in item 36, and the sidebar —
    the first preset system here — never did.

    It was also already derived AND stored, which is the same-fact-twice trap in
    one file: ``bnd_sb_match_preset`` computed the name and the form then wrote
    it into a hidden field. One file even contradicted itself about it, excluding
    ``desk_layout`` from the theme export as "a hidden record of the last preset
    applied" and exporting ``sidebar_preset`` three lines later.

WHY DELETING IT IS SAFE, MEASURED RATHER THAN ASSUMED
    ``boot.py`` served it as ``bootinfo.bnd_sidebar.preset`` and NOTHING read it:
    ``bunood.js`` reads ``user_preset`` — a per-user value in ``frappe.defaults``
    under a similar name — and never ``sb_state.preset``. The eighteen sidebar
    style fields are untouched, so every desk renders exactly as it did; only the
    label describing them moves from stored to derived.

WHY A PATCH AND NOT NOTHING
    A Single keeps its values as ``tabSingles`` rows, and a row for a field the
    doctype no longer has is not inert. ``doc.save()`` rewrites the whole rowset,
    so the orphan would vanish on the next save anyway — but only on the next
    save.

    NOT, AS THIS SAID, BECAUSE ``get_single_value`` WOULD KEEP RETURNING IT.
    Measured against frappe v16, that helper consults the doctype meta and
    RAISES for a field the doctype has lost. The orphan is a row no reader can
    reach, and the honest reason to delete it is that a stale row invites
    exactly the mistake its sibling patch made — reading a dead field by name.
"""

import frappe


def execute() -> None:
    frappe.db.sql(
        "delete from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "sidebar_preset"),
    )
    # The doctype has already lost the field by the time patches run (the JSON is
    # synced first), so this only reaps the value.
    frappe.clear_cache(doctype="Theme Settings")
