# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give existing sites the placement they were already rendering.

Slice 1 of the component rework makes the notifications bell and the user
menu first-class, each with its own placement field. Before this, both were
welded into ``build_cluster`` and went wherever the layout's branch put them.

WHAT THIS WRITES, AND WHY IT IS NOT THE STORED VALUE
    It writes what each layout ACTUALLY RENDERED on 0.10.0, computed by
    reading the mount ladder — not what the settings happened to say. Those
    are different things, and the difference is the whole risk of this patch:
    a site that upgrades and finds its bell somewhere new has been broken by
    us, however defensible the new position is.

THE ROW THAT BITES
    Bottom Bar mounted its strip even when the status style was "Off", because
    that strip carries the bell, the badge, the avatar and Log Out (bunood.js,
    ``if (off && !global_variant) return;``). A patch that derived placement
    from the status style would hand those sites "Off" and delete exactly the
    chrome that special case exists to protect — reintroducing, via its own
    migration, the critical defect the v0.10.0 release review caught.

IDEMPOTENT BY ROW-ABSENCE, NOT BY VALUE
    ``get_single_value`` casts a missing Check to 0 and an unset Select to
    None, so "has this run" cannot be asked of the value. It is asked of
    ``tabSingles`` row presence, the same lesson already written down in
    setup.py's seeding.
"""

import frappe

#: What 0.10.0 rendered, per desk_layout: (inbox_placement, user_placement).
#:
#: Read off the mount ladder in bunood.js as it stood at v0.10.0:
#:   topbar     mount_topbar()      -> cluster in the top bar
#:   compact    inject_compact_cluster() -> cluster in the page head
#:   classic    nothing of ours     -> the sidebar's own bell and user button
#:   bottombar  mount_statusbar(true) -> cluster in the bottom strip, ALWAYS
#:   dock       mount_dock()        -> cluster in the dock pill
RENDERED = {
    "Top Bar": ("Top Bar", "Top Bar"),
    "Compact": ("Page Header", "Page Header"),
    "Classic": ("Side Pane", "Side Pane"),
    "Bottom Bar": ("Bottom Bar", "Bottom Bar"),
    "Dock": ("Dock", "Dock"),
}

#: What a site with no layout at all gets. No attribute means Classic — the
#: documented failure mode of the whole layout system — so the natives are
#: what such a desk is showing.
FALLBACK = ("Side Pane", "Side Pane")


def execute():
    """Write placement for the layout this site is actually running."""
    if not frappe.db.exists("DocType", "Theme Settings"):
        return

    # Already run? Ask the ROW, not the value.
    stored = {
        row[0]
        for row in frappe.db.sql("select field from tabSingles where doctype=%s", ("Theme Settings",))
    }
    if "inbox_placement" in stored:
        return

    layout = frappe.db.get_single_value("Theme Settings", "desk_layout")
    inbox, user = RENDERED.get(layout, FALLBACK)

    frappe.db.set_single_value("Theme Settings", "inbox_placement", inbox, update_modified=False)
    frappe.db.set_single_value("Theme Settings", "user_placement", user, update_modified=False)
    frappe.db.commit()

    print(f"bunood_theme: placement seeded from layout {layout!r} -> bell {inbox!r}, user {user!r}")
