# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Six icon styles become four — item 42, slice I.

    Colored Chips -> Solid Tile      (a filled rounded square, kept square)
    Colored Dots  -> Circle Badge    (a filled round chip, kept round)
    Duotone       -> Filled Color    (it WAS Filled Color at 85% opacity)
    Brand Lines   -> Filled Color    (it WAS Filled Color with the hue swapped
                                      for the brand ink, which is what the hue
                                      already is when no wash is on)
    Monochrome    -> Fill on Active  (muted at rest, and now the current row's
                                      glyph takes its row's ink)
    Filled Color  -> unchanged

CHIPS AND DOTS DIVERGE HERE, and the plan said both should land on Solid Tile. They
differ by one property — `border-radius` — and the catalogue kept both shapes, so
sending the round one to the square tile would change what a site sees for no reason.
The rule this repo follows is that a migration preserves the rendering; Circle Badge
IS Colored Dots with a fill instead of a wash.

WHAT NOBODY GETS BY UPGRADING is a style whose rendering they did not already have.
Duotone's 85% fade and Brand Lines' brand ink are the two things genuinely lost, and
both were measured as differences of one property against Filled Color.

READ THROUGH `tabSingles` DIRECTLY: patches run after the doctype JSON is synced, so
the field's options are already the new four. A raw read cannot be wrong about what is
stored, and a stale Select on a Single fails the NEXT full save of the whole document
— measured 2026-08-08, six unrelated checks red with none naming the cause.
"""

import frappe

#: What each retired style rendered, and therefore what it becomes.
MAP = {
    "Colored Chips": "Solid Tile",
    "Colored Dots": "Circle Badge",
    "Duotone": "Filled Color",
    "Brand Lines": "Filled Color",
    "Monochrome": "Fill on Active",
}


def execute():
    # `frappe.db.sql`, not `get_all`: the query builder adds `ORDER BY creation`
    # and `tabSingles` has no creation column, which raises and takes the whole
    # `bench migrate` down with it.
    rows = frappe.db.sql(
        """SELECT value FROM tabSingles
           WHERE doctype = 'Theme Settings' AND field = 'icon_style'
           LIMIT 1""",
        as_dict=True,
    )
    if not rows:
        # Never written: the doctype default ("Filled Color") is what it
        # rendered, and writing here would invent a choice nobody made.
        return

    stored = (rows[0].get("value") or "").strip()
    if stored not in MAP:
        # Already one of the four, or a spelling this app never shipped —
        # `heal_unknown_placements` runs after this and owns that second case.
        return

    frappe.db.set_single_value("Theme Settings", "icon_style", MAP[stored])
    frappe.db.commit()
    frappe.clear_cache()
