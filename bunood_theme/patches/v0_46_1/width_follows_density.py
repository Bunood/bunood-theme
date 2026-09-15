# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Don't put a width icon on a status bar its owner has emptied — item 45.1.

FOUND BEFORE IT SHIPPED, by reading a real tenant's settings rather than a test
site's. Production runs ``status_style: Minimal`` with **every** segment off —
jobs, errors, scheduler, connection, density, freshness, all 0 — so its bar
carries a clock and nothing else. That is a decision somebody made.

``status_segments_width`` is item 45's new Check and its shipped default is 1.
An existing site has no ``tabSingles`` row for a field that did not exist, and
``setup._seed_defaults`` seeds default-on Checks precisely where no row exists —
correctly, because "no row" is how this app records "never chose". The effect on
that tenant is nonetheless a control appearing on a surface they had cleared,
beside a density icon they had switched off.

WHAT THIS ASKS, AND WHY IT IS THE NEIGHBOUR
    The width segment is density's twin: the same comfort question asked of the
    page instead of the row, mounted one place along the same bar (item 45).
    So density is the honest proxy for "did you want controls in this bar" —
    better than ``status_style``, which says how LOUD the bar is rather than
    what is in it, and better than guessing from the other segments, which are
    about signals rather than controls.

    Density off  ->  write 0, so nothing new appears.
    Density on   ->  write NOTHING, so the row stays absent and _seed_defaults
                     seeds it ON. A site that wants controls gets the feature.

WHAT IT REFUSES TO TOUCH
    A site that already has a ``status_segments_width`` row has been through a
    build where the field existed, so the value is a state it has lived with —
    a choice, or at least an inherited one. Only the never-written state is
    filled, which is the rule ``_seed_defaults`` itself follows and the reason
    row-absence has to be read with raw SQL: ``get_single_value`` CASTS a
    missing Check to 0 and would make every site look like it had chosen off.

    A NEW site is untouched: it has no Theme Settings rows at all when this
    runs, density included, so both fields fall to their shipped defaults and
    the bar ships with density and width together.
"""

import frappe


def execute() -> None:
    if not frappe.db.exists("DocType", "Theme Settings"):
        return

    # ROW-ABSENCE, NOT VALUE. Raw SQL because Singles is a bare
    # (doctype, field, value) table and `get_single_value` cannot tell "0" from
    # "never written" for a Check — the distinction this patch turns on.
    written = {
        row[0]
        for row in frappe.db.sql(
            """select field from tabSingles
               where doctype = 'Theme Settings'
                 and field in ('status_segments_width', 'status_segments_density')"""
        )
    }
    if "status_segments_width" in written:
        return  # already lived with a value; not ours to rewrite
    if "status_segments_density" not in written:
        return  # never chose either — a new site, or one that wants the defaults

    if frappe.utils.cint(
        frappe.db.get_single_value("Theme Settings", "status_segments_density")
    ):
        return  # density is on: this site wants controls in the bar

    frappe.db.set_single_value(
        "Theme Settings", "status_segments_width", 0, update_modified=False
    )
    frappe.clear_cache(doctype="Theme Settings")
    frappe.logger().info(
        "bunood_theme: status_segments_width follows density off (item 45.1)"
    )
