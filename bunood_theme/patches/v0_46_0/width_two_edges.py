# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Carry `desk_width` onto the two-edge catalogue — item 45.

WHAT CHANGED
    Item 43 shipped one measure under four names. Item 45 gives every value TWO
    measures — a reading edge for what you read, a wide edge for what you scan —
    and renames the catalogue to say so:

        Original         ->  Original        (unchanged: the vendor's own 900)
        Narrow Column    ->  Balanced        (1040 reading / 1400 wide)
        Measured Column  ->  Roomy           (1120 / 1600)
        Full Bleed       ->  Full            (both lifted)

WHY A PATCH IS NOT OPTIONAL HERE
    This is a RENAME, not a moved default. `desk_width` is a Select, and its
    options no longer contain the strings a v0.45 site has stored. A row holding
    "Full Bleed" against options that offer "Full" is not merely stale — the
    field is invalid, the kit's value map (`BND_SURFACE_KITS.body`) has no entry
    for it, so `data-bnd-body-width` is never stamped and the site silently
    renders with NO width rule at all. Every surface goes full bleed and the
    setting appears to do nothing. That is worse than the state it replaces.

    Contrast `v0_45_0.console_defaults`, whose subject was two axes that changed
    their DEFAULT while keeping valid values. Nothing there was invalid; this is.

WHAT IT MOVES, AND WHAT IT LEAVES
    Every stored value is remapped, because every old name is now unspellable —
    there is no "did they choose it" question to ask, unlike a moved default.
    A site holding "Original" keeps it: that value survived the rename and still
    means what it meant. A site with no row never had a value and already reads
    the new default.

    The shipped default also moved, Full Bleed -> Balanced, at the user's
    decision. A site that had explicitly stored "Full Bleed" lands on "Full",
    which is the same desk it had — the rename is carried faithfully and the
    default flip reaches only sites that never chose.
"""

import frappe

#: old Select value -> new. "Original" is absent deliberately: it did not move.
RENAMED = {
    "Narrow Column": "Balanced",
    "Measured Column": "Roomy",
    "Full Bleed": "Full",
}


def execute():
    if not frappe.db.exists("DocType", "Theme Settings"):
        return

    # READ AND WRITE THROUGH THE SINGLES API, not the generic document one.
    # `tabSingles` is a bare (doctype, field, value) table with no `creation`
    # column, and `frappe.db.get_value("Singles", {...})` appends
    # `ORDER BY creation` unconditionally — it fails with MySQL 1054 rather than
    # returning anything. Measured on this bench while writing this patch.
    #
    # Loading the DOCUMENT is also wrong here, and for the reason the patch
    # exists: the stored value is by definition no longer a valid Select option.
    stored = frappe.db.get_single_value("Theme Settings", "desk_width")
    if not stored:
        # No row: the site never had a value and already reads the new default.
        return

    new = RENAMED.get(str(stored).strip())
    if not new:
        # Already migrated, or "Original", or something a human typed. Leave it —
        # a value this patch does not recognise is not this patch's to rewrite.
        return

    # `set_single_value` fires no hooks, which is what is wanted: the width is
    # not a brand input, so nothing needs re-papering, and the caches this does
    # invalidate are cleared explicitly below.
    frappe.db.set_single_value("Theme Settings", "desk_width", new)
    frappe.clear_cache(doctype="Theme Settings")

    # The brand sheet does not carry the width, so nothing needs re-papering —
    # but the boot payload does, and it is cached per user.
    frappe.cache.delete_key("bootinfo")
    frappe.logger().info(f"bunood_theme: desk_width {stored!r} -> {new!r} (item 45, two edges)")
