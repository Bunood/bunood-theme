# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Move sites that never chose onto the quick links' new default — item 40.

WHY THE DEFAULT MOVED
    A default pane rendered four rows of navigation furniture before the first
    workspace link: the brand (routes home), a Home quick link (routes home
    too), All Apps (which the dock already offers), and the module row. Three
    of the four were navigation AWAY, and two of them to the same place. The
    Place row replaces all four, and its menu reaches Home, All Apps and the
    workspace cascade — so nothing became unreachable, which is what makes the
    removal legal under this repo's own rule.

WHY A PATCH, WHEN THE PLAN SAID TO LEAVE EXISTING SITES ALONE
    Because `home_placement` and `apps_placement` are THEME AXES, and that was
    measured rather than assumed. `bnd_theme_match` compares every axis in
    `THEME_AXES` against each preset's composed values; those values come from
    `presets._shipped_baseline()`, and the baseline for these two fields comes
    from `LINKS_DEFAULTS` — the only place either name appears. Move the
    default and leave the rows, and every existing site stores "Side Pane
    Start" against a baseline that now says "Off": no preset matches, and
    **all twelve theme cards read "Custom" on every site, forever.**

    That is item 37's own trap verbatim, and it would have been ours.

WHAT IT MOVES, AND WHAT IT REFUSES TO
    ONLY a row that still holds the OLD default. A site that put Home in the
    top bar, or deliberately turned it off, or moved it to the pane's foot,
    is a site that chose — and a migration that overwrote a choice would be
    doing the thing this file exists to avoid.

    The honest limit, stated because it cannot be fixed: Frappe stores no
    "was this explicitly set" bit, so a tenant who deliberately picked
    "Side Pane Start" is indistinguishable from one who never opened the
    picker. Both move. The setting is one click away in either direction and
    the picker still offers all five slots.

    A missing row means the site never had a value at all, which is already
    the new default — nothing to write.
"""

import frappe

#: field -> the value that means "never touched", pre-item-40.
WAS = {
    "home_placement": "Side Pane Start",
    "apps_placement": "Side Pane Start",
}


def execute() -> None:
    moved = False
    for field, old in WAS.items():
        # These two fields still EXIST, so the ordinary reader is correct here
        # — unlike this release's other patches, which read `tabSingles` because
        # their fields had already left the doctype.
        if frappe.db.get_single_value("Theme Settings", field) == old:
            frappe.db.set_single_value("Theme Settings", field, "Off")
            moved = True
    if moved:
        frappe.clear_cache(doctype="Theme Settings")
