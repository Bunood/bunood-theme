# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give every existing site the ``sidebar_enabled`` value its layout rendered.

WHY THE FIELD EXISTS
    The side pane's visibility used to be the DOCK's business: one CSS rule,
    keyed on ``data-bnd-layout="dock"``, hid ``.body-sidebar-container``. So
    "show a dock" and "hide the side pane" were a single choice nobody could
    take apart — you could not have both, and you could not have neither.

    Containers are independent. Turn both on and you get both. The Dock layout
    becomes a preset that writes ``dock: 1, sidepane: 0``, which is the same
    desk arrived at honestly, and either half can then be changed on its own.

WHY IT LANDS WITH THE DOCK RATHER THAN LATER
    Because it is the same change. The moment the dock stops hiding the pane,
    something else has to say whether the pane is shown — and if nothing does,
    every Dock site grows a side pane on upgrade. Splitting those into two
    slices would ship that regression in between. (The same lesson as slice
    2c-1, where "a container has a setting" and "the layout WRITES that
    setting" turned out to be one change and were caught being two.)

WHAT WOULD BREAK WITHOUT THIS PATCH
    The shipped default is 1, so a Dock site would find its side pane back —
    beside the dock, both claiming to be the navigation. Not a broken desk,
    which is precisely the danger: it would not announce itself, it would just
    quietly stop being the product the customer chose.

WHAT IT DOES
    Writes 0 where the site is on Dock and 1 everywhere else — what each site
    renders today, in the vocabulary that survives.

THE GUARD THIS FIELD MADE NECESSARY
    With a side pane that can be switched off, "every container off at once"
    became reachable, and that is a desk with no search, no notifications and
    no way to log out. ``guard_critical_reach`` in bunood.js refuses it: the
    pane comes back when nothing else can reach what ``registry.CRITICAL``
    names. This patch only decides what a site STARTS at; the guard is what
    keeps every later configuration honest.
"""

import frappe

#: Read straight from tabSingles. ``get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — invisible under ``bench migrate --skip-failing``,
#: because the patch is still written to the Patch Log and so never runs again.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: The one layout that hid the side pane, per `_layouts.scss`'s old matrix.
_LAYOUT_WITHOUT_SIDEPANE = "Dock"

#: What a site with no ``desk_layout`` row yet will be seeded with. Spelt out
#: rather than imported: a patch must go on meaning the same thing years after
#: ``DEFAULT_DESK_LAYOUT`` may have moved.
_SHIPPED_LAYOUT = "Top Bar"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    # Guard on ROW ABSENCE, not on a value. The shipped default is 1, so a
    # falsy value means both "never had this field" and "an admin switched the
    # pane off", and re-running against the second would hand back a pane they
    # had deliberately removed.
    if _single("sidebar_enabled") is not None:
        return

    layout = _single("desk_layout") or _SHIPPED_LAYOUT
    frappe.db.set_single_value(
        "Theme Settings", "sidebar_enabled", int(layout != _LAYOUT_WITHOUT_SIDEPANE)
    )
    frappe.db.commit()
