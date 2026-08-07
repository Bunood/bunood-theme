# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Split ``sidebar_quick_links`` into ``home_placement`` and ``apps_placement``.

WHY THIS PATCH EXISTS
    Home and All Apps shared one field, so a site could not put Home in the
    sidebar and All Apps in a bar — and a sidebar STYLE preset decided where
    both lived, because the field rode the sidebar kit. ``registry.py`` has
    always described them as two components; this is where the data catches up.

WHAT IT PRESERVES
    Exactly what the site was rendering. Both new fields take the old value, so
    nothing moves on upgrade; the point of the change is that they *can* now be
    moved apart, not that they start apart.

WHY IT READS tabSingles DIRECTLY
    ``sidebar_quick_links`` no longer exists in the DocType, so
    ``frappe.db.get_single_value`` would consult a meta that has already
    forgotten it (patches run post-model-sync). The value survives as a row in
    ``tabSingles`` until something deletes it, which is what makes this
    recoverable at all.

WHY IT GUARDS ON ROW ABSENCE, NOT ON A VALUE
    ``after_migrate`` seeds defaults, and it runs AFTER patches. Guarding on
    "is the new field empty" would therefore be reading a field nothing has
    written yet on a fresh install — true for both the upgrade and the
    install case, which is not a guard at all. Presence of the OLD row is the
    only signal that means "this site predates the split".
"""

import frappe

#: The old field's four values map onto the new vocabulary unchanged — the two
#: sidebar sub-positions survive, because losing them would silently move every
#: site that had chosen "Sidebar Bottom" up to the top of the pane.
KNOWN = {"Sidebar Top", "Sidebar Bottom", "Top Bar", "Bottom Bar"}


def execute() -> None:
    # RAW SQL, not get_value: the query builder appends `ORDER BY creation` and
    # `tabSingles` has no such column, so get_value raises
    # OperationalError 1054 here. Under `bench migrate --skip-failing` that is
    # invisible — the patch is still written to the Patch Log, so it never runs
    # again and the migration silently does nothing. Caught by reproducing the
    # same call in a probe, not by the migrate output, which said success.
    rows = frappe.db.sql(
        "select value from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "sidebar_quick_links"),
    )
    old = rows[0][0] if rows else None
    if not old:
        # Fresh install, or already migrated. after_migrate seeds the defaults.
        return

    value = old if old in KNOWN else "Sidebar Top"
    for field in ("home_placement", "apps_placement"):
        frappe.db.set_single_value("Theme Settings", field, value, update_modified=False)

    # Leave the old row in place. It costs one row, it is the only record of
    # what the site chose before the split, and deleting data in a patch that
    # has just written its replacement is how a bad migration becomes
    # unrecoverable. A later release can reap it once this one has shipped.
    frappe.db.commit()
