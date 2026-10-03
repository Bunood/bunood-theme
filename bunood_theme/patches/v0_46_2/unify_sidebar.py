# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Retire the icon-only Rail presentation in favour of one sidebar everywhere.

Rail was not just a collapsed state: it mounted a separate navigation renderer
with different markup, sizing and interactions. That is why saved forms could
look unrelated to their workspace. Existing choices migrate to Open—the safe,
fully visible result—while Hidden remains available as a visibility preference.
"""

import frappe


def execute() -> None:
    if frappe.db.exists("DocType", "Theme Settings"):
        rows = frappe.db.sql(
            """select value from tabSingles
               where doctype = 'Theme Settings'
                 and field = 'sidebar_pane_state'
               limit 1"""
        )
        if rows and (rows[0][0] or "").strip() == "Rail":
            frappe.db.set_single_value(
                "Theme Settings", "sidebar_pane_state", "Open", update_modified=False
            )

    # Personal comfort choices override the site. Migrate every user so an old
    # preference cannot resurrect the retired renderer on one account or route.
    frappe.db.sql(
        """update tabDefaultValue
           set defvalue = 'Open'
           where defkey = 'bnd_pane_state' and defvalue = 'Rail'"""
    )
    frappe.clear_cache()
