# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give every existing site the ``pagehead_enabled`` value its layout rendered.

WHY THE FIELD EXISTS
    The page-head cluster used to be a consequence of the LAYOUT: ``mount_chrome``
    read ``desk_layout`` and called ``inject_compact_cluster`` on the one branch
    that said "compact". It is a container now — ``pagehead_enabled`` decides.

WHY IT IS A CONTAINER AT ALL, WHEN registry.py NAMED ONLY FOUR
    Because it is the one thing Compact does. Leaving it out would have left
    ``desk_layout`` still deciding exactly one question after a split whose
    whole purpose is that it decides none — and a layout that still decides can
    never carry a derived "Custom" label, because there would be a part of what
    it does that no field records. It also meets the registry's own definition:
    the cluster it injects is a space other things live in, and ``HOSTS.pagehead``
    in bunood.js has always resolved to precisely that node.

WHAT WOULD BREAK WITHOUT THIS PATCH
    Less than for the top bar, and not nothing. The shipped default is 0, so no
    site grows a cluster it never had — but a **Compact** site would LOSE the one
    piece of chrome its layout exists to provide, which is the more frightening
    direction of the same failure. Compact's controls live in the page title row
    and nowhere else; without this patch an upgrade would leave that row empty
    and every global control back in the sidebar.

WHAT IT DOES
    Writes 1 where the site is on Compact and 0 everywhere else. Nothing more.
"""

import frappe

#: Read straight from tabSingles. ``get_value`` on "Singles" appends
#: ``ORDER BY creation``, a column that table does not have, and raises
#: OperationalError 1054 — invisible under ``bench migrate --skip-failing``,
#: because the patch is still written to the Patch Log and so never runs again.
_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: The one layout that injected the cluster, per `_layouts.scss`'s matrix.
_LAYOUT_WITH_PAGEHEAD = "Compact"

#: What a site with no ``desk_layout`` row yet will be seeded with. Spelt out
#: rather than imported: a patch must go on meaning the same thing years after
#: ``DEFAULT_DESK_LAYOUT`` may have moved.
_SHIPPED_LAYOUT = "Top Bar"


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    # GUARD ON ROW ABSENCE, NOT ON A VALUE — and here the distinction is not
    # academic, it is the whole patch. The shipped default is 0, so "the value
    # is falsy" is true both for a site that has never had this field and for
    # an admin who deliberately switched the cluster off. Testing the value
    # would re-run against the second and hand a Compact site back a cluster it
    # had chosen to remove.
    if _single("pagehead_enabled") is not None:
        return

    layout = _single("desk_layout") or _SHIPPED_LAYOUT
    # update_modified=False: a migration is not a user's edit, and bumping
    # `modified` strands every open Theme Settings form — its next save dies
    # with TimestampMismatchError. See setup._seed_defaults for the full
    # account; reproduced 2026-08-07.
    frappe.db.set_single_value(
        "Theme Settings", "pagehead_enabled", int(layout == _LAYOUT_WITH_PAGEHEAD), update_modified=False
    )
    frappe.db.commit()
