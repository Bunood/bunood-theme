# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Retire ``status_style: "Off"``, and give each site a ``bottombar_enabled``.

WHY THE STYLE LOST ITS "Off"
    ``status_style`` answered two questions at once: what the bottom strip
    SHOWS, and whether it exists at all. The second answer was not even
    consistent — "Off" meant no bar in four layouts, and nothing whatsoever in
    the Bottom Bar layout, where the strip mounted regardless because it was
    that layout's only chrome.

    That disagreement is the defect the whole component rework began with: in
    0.10.0, "Off" on a Bottom Bar desk deleted the bell, the unread badge and
    the avatar menu, leaving a user with no way to log out. It was patched by
    making the strip mount anyway — which fixed the symptom and left one field
    still meaning two things.

    Existence is ``bottombar_enabled``. The style is only ever about content.

WHAT IT DOES
    Two writes, both from what the site renders TODAY:

    * ``bottombar_enabled`` — 0 where the style was "Off", 1 everywhere else.
      Every layout mounted the strip subject to that one field, so the layout
      does not come into it.
    * ``status_style`` — "Off" is no longer an option the field offers, so a
      site left holding it would have an illegal value in a Select. It becomes
      the shipped style. That is not a change to what anyone SEES: the bar is
      switched off, so what it would have shown does not arise.

WHAT WOULD BREAK WITHOUT THIS PATCH
    The shipped default is 1, so every site that had deliberately switched the
    status bar off would find it back on upgrade — including the Classic sites
    that were given ``status_style: "Off"`` by this directory's
    ``status_is_a_component`` patch precisely so their desks would not change.
    Undoing an earlier migration's promise is worse than never having made it.
"""

import frappe

#: Read straight from tabSingles. ``get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — invisible under ``bench migrate --skip-failing``,
#: because the patch is still written to the Patch Log and so never runs again.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: The value that used to mean "no bottom bar".
_RETIRED_STYLE = "Off"

#: What the field falls back to once "Off" is not on offer. Spelt out rather
#: than imported: a patch must go on meaning the same thing years after
#: ``STATUS_DEFAULTS`` may have moved.
_SHIPPED_STYLE = "Quiet"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    # Guard on ROW ABSENCE, not on a value: the shipped default is 1, so a
    # falsy value means both "never had this field" and "an admin switched the
    # bar off", and re-running against the second would give back a strip they
    # had deliberately removed.
    if _single("bottombar_enabled") is not None:
        return

    style = _single("status_style")
    # A site with no row at all has never been seeded; the seeder's answer is
    # the shipped style, which is not "Off", so the bar is on.
    off = style == _RETIRED_STYLE

    # update_modified=False: a migration is not a user's edit, and bumping
    # `modified` strands every open Theme Settings form — its next save dies
    # with TimestampMismatchError. See setup._seed_defaults for the full
    # account; reproduced 2026-08-07.
    frappe.db.set_single_value(
        "Theme Settings", "bottombar_enabled", int(not off), update_modified=False
    )
    if off:
        # Leave the Select holding something it actually offers. The old value
        # is not preserved anywhere, and deliberately so: unlike the fields the
        # other patches in this directory migrate, "Off" carried no information
        # beyond "no bar" — which `bottombar_enabled` now records exactly.
        frappe.db.set_single_value(
            "Theme Settings", "status_style", _SHIPPED_STYLE, update_modified=False
        )
    frappe.db.commit()
