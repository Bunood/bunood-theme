# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""One-time claim of ``Print Settings.print_style`` for existing sites — item 35.

THE DEFECT THIS CORRECTS. The installer's vacancy check
(``printing/install.py::STOCK_STYLES``) predates v16, whose Print Settings
DEFAULTS ``print_style`` to "Redesign" — a name the tuple did not carry. So on
every v16 site the check never fired and the Bunood Print Style sat installed
and unused since 0.13.0: the exact shape of ERPNext's never-loading email CSS
(a delivery registered, never applied, no log). Measured on this stack in the
item-35 census, 2026-08-26.

THE HONEST COST, recorded here the way ``status_in_classic``'s patch recorded
its own: a site whose admin DELIBERATELY chose "Redesign" (or any stock style)
is indistinguishable from a site sitting on the default, and this patch will
displace that choice once. The admin's NEXT choice is respected forever — the
ongoing sync only ever claims from the (now v16-aware) stock set, and this
patch runs exactly once, with Patch Log as the record that it was the patch.
"""

import frappe

#: Kept for the record: the name tuple this patch shipped with. The LIVE
#: predicate below is the parallel session's flag-based one — `Print
#: Style.standard` — because a name list rots (this one already had, twice)
#: and the flag tracks whatever frappe ships next.
CLAIMABLE = (None, "", "Modern", "Classic", "Standard", "Redesign", "Monochrome")


def execute():
    # The record must exist before it can be the default. On an upgrading site
    # it has existed since 0.13.0; a fresh site runs after_install first. The
    # guard is for the odd migration order, not the common path.
    if not frappe.db.exists("Print Style", "Bunood"):
        from bunood_theme.printing.install import sync_print_theme

        sync_print_theme()
        if not frappe.db.exists("Print Style", "Bunood"):
            # The sync stood down (logged there). Do not claim a default that
            # would point at nothing.
            return

    from bunood_theme.printing.install import _is_displaceable

    settings = frappe.get_single("Print Settings")
    if settings.meta.has_field("print_style") and _is_displaceable(settings.get("print_style")):
        settings.print_style = "Bunood"
        settings.save(ignore_permissions=True)
