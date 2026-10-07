# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Retire ``sidebar_apps_rail``, keeping the capability — item 40.

WHY THE FIELD WENT
    It was a Check on the SIDEBAR style kit that mounted a fixed strip onto
    ``document.body`` — outside the pane whose field it was — with no teardown,
    no registry row, a 12-workspace cap, and the same content the dock already
    renders. Its own active-highlight was a copy of ``update_dock_active`` and
    said so in a comment. Two components, one job, and the wrong one carried the
    setting: a vertical strip of apps is a DOCK placement, not a pane style.

    The dock gains that placement in its own slice. This patch is the half that
    must not wait, because the field stops existing in the same release.

WHY THE MIGRATION IS `dock_enabled`, NOT NOTHING
    Every one of the eight shipped sidebar looks ships ``sidebar_apps_rail: 0``,
    so only a tenant who ticked the box by hand has one — and for that tenant the
    rail IS their app switcher. Deleting the field without moving anything would
    take away a navigation surface they chose. Turning the dock on preserves the
    capability with the component that should always have owned it.

    It does not try to preserve the GEOMETRY. The dock is horizontal until its
    placement axis lands, so the strip moves from the inline start to the foot.
    That is a visible change and it is the honest one: the alternative is
    carrying a second app switcher forever so that nobody has to notice.

READ THE OLD VALUE FROM `tabSingles`, NEVER `get_single_value`
    Patches run AFTER the doctype JSON is synced, so by the time this executes
    the field is already gone from the meta — and `frappe.db.get_single_value`
    consults the meta and RAISES for a field the doctype has lost. Item 37's
    `drop_sidebar_preset` measured that against v16 and wrote it down; this is
    the first patch that has to READ such a field rather than only delete it, so
    it goes to the row directly.

    A missing row means the tenant never touched the toggle, which is the
    shipped default and needs no migration — so absence and "0" take the same
    path, and neither writes anything.
"""

import frappe


def execute() -> None:
    # Raw SQL on purpose: see the module docstring. The row may not exist.
    rows = frappe.db.sql(
        "select value from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "sidebar_apps_rail"),
    )
    had_rail = bool(rows) and str(rows[0][0] or "0").strip() not in ("", "0")

    if had_rail:
        # `set_value` on the Singles table rather than a doc save: `dock_enabled`
        # is a live field, and a save here would run validation over a document
        # whose OTHER values this migration has no opinion about.
        frappe.db.set_single_value("Theme Settings", "dock_enabled", 1)

    frappe.db.sql(
        "delete from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "sidebar_apps_rail"),
    )
    frappe.clear_cache(doctype="Theme Settings")
