# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give every existing site the ``topbar_enabled`` value its layout rendered.

WHY THE FIELD EXISTS
    The top bar used to be a consequence of the LAYOUT: ``mount_chrome`` read
    ``desk_layout`` and mounted the strip on the one branch that said "topbar".
    It is a container now — ``topbar_enabled`` decides, and the layout writes
    that setting rather than standing in for it. This is the first of the five
    containers the split covers (ROADMAP phase 0, slice 2c).

WHAT WOULD BREAK WITHOUT THIS PATCH
    The field's shipped default is 1, because a fresh install gets the Top Bar
    layout. Seeding runs on every migrate for any field that has never been
    written, so without this patch every Compact, Classic, Bottom Bar and Dock
    site would grow a top bar it never had, on upgrade, without being asked.
    That is the exact shape of the defect this whole rework exists to remove,
    only arriving through the migration instead of through a setting.

WHAT IT DOES
    Exactly one thing: writes what the site's layout renders TODAY. Top Bar
    gets 1; every other layout gets 0. Nothing else is touched, and no other
    container is guessed at — the remaining four land with their own slices and
    their own patches, each answering only for itself.

WHY IT IS NOT `registry.LAYOUT_CHROME`
    That table says what a layout MEANS going forward, for somebody choosing it
    today. This says what 0.10.0 RENDERED. The two agree on the top bar and are
    still not the same question — reading either as the other is how a
    migration artefact becomes a design, which is the mistake `chrome_placement`
    is annotated against in this same directory.
"""

import frappe

#: Read straight from tabSingles. ``get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — which under ``bench migrate --skip-failing`` is
#: INVISIBLE, because the patch is still written to the Patch Log and so never
#: runs again. That mistake shipped once in this directory (split_quick_links)
#: and was caught by reproducing the call, not by reading the migrate output.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: The one layout that mounted the strip, per `_layouts.scss`'s matrix.
_LAYOUT_WITH_TOPBAR = "Top Bar"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    # GUARD ON ROW ABSENCE, NOT ON A VALUE. `after_migrate` seeds defaults and
    # runs AFTER patches, so "is the value empty" is true on a fresh install
    # too and cannot distinguish "never had this field" from "explicitly 0".
    # Re-running would also stamp on an admin who had already chosen.
    if _single("topbar_enabled") is not None:
        return

    # A site with no `desk_layout` row at all is one the seeder has not reached
    # yet, and the seeder's answer is the shipped default — the same layout
    # this reads. Spelling it out keeps the two in step without importing the
    # constant into a patch, which must go on meaning the same thing years
    # after `DEFAULT_DESK_LAYOUT` may have moved.
    layout = _single("desk_layout") or _LAYOUT_WITH_TOPBAR
    # update_modified=False: a migration is not a user's edit, and bumping
    # `modified` strands every open Theme Settings form — its next save dies
    # with TimestampMismatchError. See setup._seed_defaults for the full
    # account; reproduced 2026-08-07.
    frappe.db.set_single_value(
        "Theme Settings", "topbar_enabled", int(layout == _LAYOUT_WITH_TOPBAR), update_modified=False
    )
    frappe.db.commit()
