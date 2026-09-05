# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""`sidebar_menu_rail` drops to Expanded / Rail, and the pane's icons lose their
shape — item 40.

WHY MANUAL COLLAPSE WENT (the user's call, 2026-08-29)
    It was the one mode in which the pane's WIDTH had a different owner from
    every other property: `sb_apply_width` deliberately cleared our inline width
    and handed the column to Frappe. That was survivable as one of three modes
    and became indefensible once drag-to-resize was chosen, because a drag wired
    "only in expanded mode" would be dead on FIVE of the eight shipped looks —
    Daylight, Ink, Carbon, Paper and Workbench all ship Manual Collapse, which
    is most sites.

    Frappe's collapse BEHAVIOUR is untouched. The `.collapse-sidebar-link` and
    the resize handle still toggle it, and `sb_apply_width` now reads the
    `expanded` class the toggle flips, so a collapsed pane stops being our width
    wide. What went away is a MODE that made collapse a setting instead of a
    gesture.

WHY THE ICONS LOSE THEIR CHIP
    A chip is a second border inside a row that already has one, and at 15px the
    glyph read as a decoration beside the label rather than as the thing you aim
    at. The dock has drawn the same gesture at 20px, with no shape, since it
    shipped. The pane now matches it, and "Filled Color" keeps the workspace hue
    the chip was carrying by moving it onto the glyph itself.

WHY BOTH NEED A PATCH, AND IT IS THE SAME REASON TWICE
    `sidebar_menu_rail` and `icon_style` are both THEME AXES. `bnd_theme_match`
    compares every axis against each preset's composed values, and a preset that
    does not spell a field takes it from `presets._shipped_baseline()`. Move a
    baseline and leave the stored rows and every site mismatches every preset —
    all twelve theme cards read "Custom", forever. Measured when the quick links
    moved; the same trap, two fields over.

    So each field moves ONLY where the site still holds the value that is going
    away. A site that chose Rail keeps Rail. A site that chose Monochrome keeps
    Monochrome. Only the old default, and the option that no longer exists, move.

    `Manual Collapse` is additionally out-of-range for the Select now, and an
    out-of-range Select on a Single fails validation for the WHOLE document — so
    leaving it would break every later save of every other setting.
"""

import frappe


def execute() -> None:
    moved = False

    # The retired MODE. It has to move on every site that holds it, because the
    # value is no longer in the Select's options.
    rail = (frappe.db.get_single_value("Theme Settings", "sidebar_menu_rail") or "").strip()
    if rail == "Manual Collapse":
        frappe.db.set_single_value("Theme Settings", "sidebar_menu_rail", "Always Expanded")
        moved = True

    # The moved DEFAULT. Only a site still sitting on the old one — anything
    # else is a choice, and a migration that overwrote it would be doing the
    # thing this file exists to avoid.
    icons = (frappe.db.get_single_value("Theme Settings", "icon_style") or "").strip()
    if icons == "Colored Chips":
        frappe.db.set_single_value("Theme Settings", "icon_style", "Filled Color")
        moved = True

    if moved:
        frappe.clear_cache(doctype="Theme Settings")
