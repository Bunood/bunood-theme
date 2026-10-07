# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""`sidebar_menu_rail` becomes `sidebar_pane_state`, with a third state — item 42.

    Always Expanded -> Open
    Rail            -> Rail
    Hover-Expand    -> Rail     (legacy; the trigger already carries "hover")
    Hover + Pin     -> Rail     (legacy; the trigger already carries "hoverpin")

NOBODY GETS THE NEW STATE BY UPGRADING. "Hidden" removes the pane, and a migration that
handed somebody a desk with no side pane would be a redesign, not a rename. Every stored
value maps to what it already rendered.

READ THROUGH `tabSingles` DIRECTLY, not `get_single_value`: patches run AFTER the doctype
JSON is synced, so the old field is already gone from the meta and `get_single_value`
RAISES for a field the doctype has lost — measured in item 37, and it aborts `bench
migrate` for every later patch on the same run.

THE ROW IS DELETED, not left behind. An orphan `tabSingles` row is not inert: the value
is still served to anything that asks by name, and this project has twice mistaken a
stale row for live behaviour.
"""

import frappe

#: What each stored value rendered, and therefore what it becomes.
MAP = {
    "Always Expanded": "Open",
    "Rail": "Rail",
    "Hover-Expand": "Rail",
    "Hover + Pin": "Rail",
}


def execute():
    # `frappe.db.sql`, not `get_all`: the query builder adds `ORDER BY creation`
    # and `tabSingles` HAS no creation column, so the ordinary read raises
    # (1054, "Unknown column 'creation' in 'ORDER BY'") and takes the whole
    # `bench migrate` down with it -- measured here, on the first run.
    rows = frappe.db.sql(
        """SELECT value FROM tabSingles
           WHERE doctype = 'Theme Settings' AND field = 'sidebar_menu_rail'
           LIMIT 1""",
        as_dict=True,
    )
    if not rows:
        # A site that never wrote the field: the doctype default ("Open") is
        # already what it rendered, and writing anything here would invent a
        # setting the admin never made.
        return

    stored = (rows[0].get("value") or "").strip()
    # An unrecognised value means a spelling this app never shipped. "Open" is
    # the shipped state and the safe landing: it shows MORE, never less, which
    # is the direction a migration is allowed to guess in.
    frappe.db.set_single_value("Theme Settings", "sidebar_pane_state", MAP.get(stored, "Open"))
    frappe.db.delete("Singles", {"doctype": "Theme Settings", "field": "sidebar_menu_rail"})
    frappe.db.commit()
    frappe.clear_cache()
