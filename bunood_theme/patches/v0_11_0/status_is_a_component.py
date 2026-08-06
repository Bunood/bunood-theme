# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Retire ``status_in_classic``, preserving what each site currently sees.

WHY THE FIELD IS GONE
    The status bar used to be a consequence of the LAYOUT: four layouts mounted
    it and Classic did not, so Classic needed an opt-in to get one. It is a
    component now — ``status_style`` decides, and the layout has no opinion. A
    per-layout override is the second place the same fact lived, which is the
    defect class this rework exists to remove.

WHAT WOULD BREAK WITHOUT THIS PATCH
    Removing the gate turns the bar ON for every Classic site that never opted
    in. They chose Classic *because* it mounts no bars; a migration that gives
    them one has changed their desk without asking.

WHAT IT DOES
    Exactly one thing: where a site is on Classic and had NOT opted in, it
    writes ``status_style = "Off"``. That is what they see today, expressed in
    the vocabulary that survives.

THE HONEST COST, WRITTEN DOWN
    ``status_style`` is global, so such a site that later switches to Top Bar
    will find the bar off and have to turn it on. That is the real consequence
    of deleting a per-layout override, not a bug — and it is strictly better
    than the alternative, which is silently showing a bar to somebody who had
    switched it off. The setting is now honest about being one setting.
"""

import frappe

#: Read straight from tabSingles, for two reasons. The field no longer exists in
#: the DocType, so the query builder's meta has forgotten it — and get_value on
#: "Singles" appends ``ORDER BY creation``, a column that table does not have,
#: which raises OperationalError 1054. Under ``bench migrate --skip-failing``
#: that failure is INVISIBLE: the patch is still written to the Patch Log, so it
#: never runs again and the migration silently does nothing. That exact mistake
#: shipped in this directory's split_quick_links patch and was caught by
#: reproducing the call, not by reading the migrate output, which said success.
_SQL = "select value from tabSingles where doctype = %s and field = %s"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    opted_in = _single("status_in_classic")
    if opted_in is None:
        # Fresh install: the field never existed here, so there is nothing to
        # preserve. Guarding on ROW ABSENCE rather than on a value matters —
        # `after_migrate` seeds defaults and runs AFTER patches, so "is the
        # value empty" is true on a fresh install too and would not distinguish
        # the two cases at all.
        return

    layout = _single("desk_layout") or "Top Bar"
    if layout == "Classic" and not frappe.utils.cint(opted_in):
        frappe.db.set_single_value("Theme Settings", "status_style", "Off")

    # The old row is left in place: it costs one row and it is the only record
    # of what the site chose. Deleting data in the same patch that replaces it
    # is how a bad migration becomes unrecoverable.
    frappe.db.commit()
