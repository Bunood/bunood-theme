# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The two glass materials become surfaces that still exist — item 42, slice S.

    Solid         -> Solid          (untouched; it is still the base)
    Glass         -> Elevated
    Blurred Glass -> Elevated

WHY ELEVATED AND NOT SOLID. Both glasses only ever shipped on a FLOATING pane — Bunood
Light and Aurora are the two looks that named them, and both float — so what a site with
glass actually sees is *a card lifted off the page*, not a colour. Solid keeps the colour
and throws away the lift; Elevated keeps the lift and gives up the translucency, which is
the half this catalogue cannot keep. The two looks re-point in the same commit, so a site
on either theme still MATCHES it after the migration rather than quietly reading "Custom".

A stale Select on a Single is not a cosmetic problem. `frappe.db.set_single_value` writes
without validating, but the next full `doc.save()` of Theme Settings validates the WHOLE
document — so one out-of-range material left behind fails every later save of every other
setting. Measured 2026-08-08: six unrelated checks red, none of them naming the cause.

READ THROUGH `tabSingles` DIRECTLY. Patches run after the doctype JSON is synced, so the
field's options are ALREADY the new six; `get_single_value` would return the stale string
happily, but the surrounding pattern (and item 37's measurement) is that a read which
consults the meta is the fragile one. The raw read cannot be wrong about what is stored.
"""

import frappe

#: What each retired value rendered, and therefore what it becomes.
MAP = {
    "Glass": "Elevated",
    "Blurred Glass": "Elevated",
}


def execute():
    # `frappe.db.sql`, not `get_all`: the query builder adds `ORDER BY creation`
    # and `tabSingles` has no creation column, which raises and takes the whole
    # `bench migrate` down with it. The sibling patch measured that first.
    rows = frappe.db.sql(
        """SELECT value FROM tabSingles
           WHERE doctype = 'Theme Settings' AND field = 'sidebar_material'
           LIMIT 1""",
        as_dict=True,
    )
    if not rows:
        # Never written: the doctype default ("Solid") is what it rendered, and
        # writing here would invent a choice the admin never made.
        return

    stored = (rows[0].get("value") or "").strip()
    if stored not in MAP:
        # Already a surviving surface, or a spelling this app never shipped —
        # `heal_unknown_placements` runs after this and owns that second case.
        return

    frappe.db.set_single_value("Theme Settings", "sidebar_material", MAP[stored])
    frappe.db.commit()
    frappe.clear_cache()
