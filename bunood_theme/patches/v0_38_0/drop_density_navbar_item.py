# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Remove the retired "Toggle Density" navbar item — item 38.

WHAT REPLACED IT
    The Appearance dialog. Density was one of three scattered entries for one
    question — Frappe's theme modal, a side-pane-only look menu, and a
    three-state density cycle with a toast — and the dialog is that question's
    single answer. ``bunood_theme.cycle_density()`` still exists and the status
    bar's density segment still calls it; what goes is the menu row.

WHY A PATCH IS REQUIRED, AND WHY IT MUST LAND WITH THE SEEDER CHANGE
    ``_seed_navbar_appearance_item`` (formerly ``_seed_navbar_density_item``) is
    idempotent BY LABEL and runs on every ``after_migrate``. Deleting this row
    while the old seeder survived would put it straight back on the next migrate;
    changing the seeder without deleting the row would leave both. Neither half
    works alone, which is why they are one commit.

    The row is a child of the Navbar Settings Single, so it is a real record and
    not a value that a later save would tidy away on its own.

WHY IT IS KEYED ON THE LABEL
    That is the only thing this app ever knew the row by — the seeder's own
    idempotence check was ``item_label == NAVBAR_DENSITY_LABEL``. Matching the
    action string instead would miss a row whose label an administrator had
    translated or edited while leaving the action intact, and would also delete a
    row somebody had deliberately re-created for themselves.

    A tenant who wants it back can add it in Navbar Settings; nothing here
    prevents that, and this patch will not run again.
"""

import frappe

from bunood_theme.setup import NAVBAR_DENSITY_LABEL


def execute() -> None:
    rows = frappe.get_all(
        "Navbar Item",
        filters={
            "parent": "Navbar Settings",
            "parenttype": "Navbar Settings",
            "item_label": NAVBAR_DENSITY_LABEL,
        },
        pluck="name",
    )
    for name in rows:
        frappe.delete_doc("Navbar Item", name, ignore_permissions=True, force=True)
    if rows:
        # Navbar Settings rides the boot payload, so a stale dropdown would
        # survive in every cached session until it happened to expire.
        frappe.clear_cache()
