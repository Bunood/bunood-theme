# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Carry each site's icon settings across the item-23 field rename.

WHY THIS PATCH EXISTS
    Item 23 moved the icon settings out of the sidebar and breadcrumb kits into
    one Icons axis, which meant renaming the fields:
      sidebar_icon_style       -> icon_style
      sidebar_icon_source      -> icon_source
      sidebar_rail_button_icon -> icon_rail_button
      crumb_icons              -> icon_crumbs
    A rename leaves each existing site's stored value under the OLD fieldname in
    tabSingles, where the doctype — which no longer has that field — will never
    read it again. This copies each value onto its new field so a site keeps the
    icon appearance it had, instead of silently reverting to the shipped default.

WHY IT READS tabSingles DIRECTLY
    `frappe.db.get_value` on a Single appends `ORDER BY creation`, a column
    tabSingles does not have, and raises OperationalError 1054 — which under
    `bench migrate --skip-failing` is INVISIBLE, because the patch is still
    written to the Patch Log and so never runs again. Every sibling patch in this
    app carries the same note for the same reason.

WHY IT GUARDS ON ROW ABSENCE, NOT ON A VALUE
    `after_migrate -> _seed_defaults` runs AFTER patches, so "is the new field
    empty" is true on a fresh install too. Guarding on the OLD row's absence is
    what tells a fresh install (nothing to carry, let seeding do its job) apart
    from an existing one (carry the value).

WHY IT LEAVES THE OLD ROW IN PLACE
    Deleting data in the patch that has just written its replacement is how a bad
    migration becomes unrecoverable. The orphan row costs nothing — get_single_value
    only reads fields the doctype still has — and is the only record of what the
    site chose before the rename. A later release can reap it.
"""

import frappe

_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: old fieldname -> new fieldname. A table, so a fifth rename later is a row
#: rather than another branch.
RENAMES = {
    "sidebar_icon_style": "icon_style",
    "sidebar_icon_source": "icon_source",
    "sidebar_rail_button_icon": "icon_rail_button",
    "crumb_icons": "icon_crumbs",
}


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    changed = False
    for old, new in RENAMES.items():
        value = _single(old)
        if value is None:
            # Fresh install (or a site that never set the old field): nothing to
            # carry, and `after_migrate` will seed the new field's default.
            continue
        frappe.db.set_single_value("Theme Settings", new, value, update_modified=False)
        changed = True

    if changed:
        frappe.db.commit()
