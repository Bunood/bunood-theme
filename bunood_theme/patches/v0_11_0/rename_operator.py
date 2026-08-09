# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Rename the stored value ``Operator`` — twice, to two different words.

WHY THE NAME HAD TO GO
    Frappe's translation layer is ONE flat global dictionary keyed by the bare
    source string, shared by every installed app. ERPNext already translates
    "Operator" as a MACHINE OPERATOR — a person — in Manufacturing
    (``downtime_entry.json``, ``downtime_analysis.py:85``). We used the same
    word for a sidebar preset and for a status-bar style. One dictionary cannot
    hold both senses: whichever Arabic ships, one of the two reads wrong, and
    because this app is LAST in ``installed_apps`` a row we shipped would
    override ERPNext's everywhere. Renaming ours is the only fix with no blast
    radius. See ``tools/i18n.mjs`` for the collision machinery.

WHY TWO DIFFERENT REPLACEMENTS
    The two settings never meant the same thing; sharing a word hid that.
      * ``sidebar_preset`` -> "Workbench". The preset is Solid, Minimal colour,
        Monochrome icons, no blur, no hue wash — undecorated and dense. It now
        says what it IS, alongside Daylight / Ink / Carbon / Paper / Aurora,
        rather than naming the person it was for.
      * ``status_style`` -> "Always On". ``bunood.js`` already described it in
        exactly those words: Quiet "appears only once it has something to say",
        this one is "always-on".

WHAT BREAKS WITHOUT THIS PATCH, AND IT IS NOT SUBTLE
    Both fields are Selects. An out-of-range Select value on a Single fails
    validation for the WHOLE document, so one stale "Operator" silently breaks
    every later save of every OTHER setting on that site. That is not a
    prediction — ``patches.txt`` records it happening on 2026-08-08, where one
    stale placement turned six unrelated checks red.
"""

import frappe

#: Read straight from tabSingles. ``frappe.db.get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — which under ``bench migrate --skip-failing`` is
#: INVISIBLE, because the patch is still written to the Patch Log and so never
#: runs again. That exact mistake already shipped once in this directory; the
#: sibling patches carry the same note for the same reason.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: field -> (old value, new value). A table, so adding a third rename later is
#: a row rather than another branch.
RENAMES = {
    "sidebar_preset": ("Operator", "Workbench"),
    "status_style": ("Operator", "Always On"),
}


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    changed = False
    for field, (old, new) in RENAMES.items():
        current = _single(field)
        if current is None:
            # Fresh install: the row does not exist yet and `after_migrate`
            # will seed the default. Guarding on row ABSENCE rather than on a
            # value matters — seeding runs after patches, so "is it empty" is
            # true on a fresh install too and would not tell the two apart.
            continue
        if current == old:
            frappe.db.set_single_value("Theme Settings", field, new, update_modified=False)
            changed = True

    if changed:
        frappe.db.commit()
