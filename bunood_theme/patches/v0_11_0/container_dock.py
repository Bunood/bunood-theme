# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give every existing site the ``dock_enabled`` value its layout rendered.

WHY THE FIELD EXISTS
    The dock used to be a consequence of the LAYOUT: ``mount_chrome`` read
    ``desk_layout`` and called ``mount_dock`` on the one branch that said
    "dock". It is a container now — ``dock_enabled`` decides.

WHAT THIS ONE CARRIES THAT THE OTHER CONTAINER PATCHES DO NOT
    The dock is the only container whose presence HIDES another. While it is
    shown, ``.body-sidebar-container`` — which carries every stock affordance
    ERPNext has — is display:none. Splitting the dock out therefore splits that
    hide out with it: it follows ``dock_enabled`` now rather than
    ``desk_layout``, so switching the dock off gives the side pane back instead
    of leaving a desk with neither.

WHAT WOULD BREAK WITHOUT THIS PATCH
    The shipped default is 0, so nobody grows a dock they never had. The danger
    is the other direction and it is the worst of the five: a **Dock** site
    would lose its dock on upgrade *and* — because the hide follows the dock —
    get its side pane back. It would still be a usable desk, which is exactly
    why this is worth stating: the failure would not announce itself, it would
    just silently be a different product than the one the customer chose.

WHAT IT DOES
    Writes 1 where the site is on Dock and 0 everywhere else. Nothing more.
"""

import frappe

#: Read straight from tabSingles. ``get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — invisible under ``bench migrate --skip-failing``,
#: because the patch is still written to the Patch Log and so never runs again.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: The one layout that mounted the dock, per `_layouts.scss`'s matrix.
_LAYOUT_WITH_DOCK = "Dock"

#: What a site with no ``desk_layout`` row yet will be seeded with. Spelt out
#: rather than imported: a patch must go on meaning the same thing years after
#: ``DEFAULT_DESK_LAYOUT`` may have moved.
_SHIPPED_LAYOUT = "Top Bar"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    # Guard on ROW ABSENCE, not on a value: the shipped default is 0, so a
    # falsy value means both "never had this field" and "an admin switched the
    # dock off", and only one of those wants writing.
    if _single("dock_enabled") is not None:
        return

    layout = _single("desk_layout") or _SHIPPED_LAYOUT
    # update_modified=False: a migration is not a user's edit, and bumping
    # `modified` strands every open Theme Settings form — its next save dies
    # with TimestampMismatchError. See setup._seed_defaults for the full
    # account; reproduced 2026-08-07.
    frappe.db.set_single_value(
        "Theme Settings", "dock_enabled", int(layout == _LAYOUT_WITH_DOCK), update_modified=False
    )
    frappe.db.commit()
