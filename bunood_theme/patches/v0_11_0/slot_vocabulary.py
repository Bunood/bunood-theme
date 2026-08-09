# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Move every placement onto the one slot vocabulary: "<Region> <Zone>".

WHY THE VOCABULARY CHANGED
    Each component spelled the same wall differently. Search said "Sidebar
    Top", the bell said "Side Pane", Home said "Sidebar Top" and meant a
    different node. Worse, only search could say WHERE in a region it sat —
    "Edge" or "Center" — so "put the bell on the left" was not a thing anyone
    could ask for. `registry.slots_for` now derives every value from the
    regions a component may occupy crossed with Start / Center / End.

THE MAPPING IS WHAT EACH VALUE RENDERED, MEASURED
    Not what its name suggests. On 2026-08-07 every placement was driven on a
    live desk with every container switched on and the result read back:

      * the bell and the user menu landed in the TRAILING third of a bar and at
        the BOTTOM of the side pane, so their region-only values become "End";
      * Home and All Apps landed in the LEADING third, so theirs become
        "Start";
      * search's "Edge" landed at the LEADING edge — `mount_search_at` inserts
        before `firstChild` — so "Top Bar Edge" becomes "Top Bar Start", which
        is the one mapping a reader would most likely have guessed wrong.

    Two values also merged, and that is a fix rather than a loss: search's
    "Sidebar Top" and "Sidebar Bottom" both rendered at the same pixel (y 228,
    measured), because they only ever reordered Frappe's own row and the rule
    doing it never applied. They now mean genuinely different places.

WHAT WOULD BREAK WITHOUT THIS PATCH
    Every placement field would hold a value it no longer offers. Frappe does
    not reject an out-of-range Select on read, so nothing would error — the
    desk would simply stop honouring the setting, because `parse_slot` returns
    (None, None) for a label it does not recognise and the tenant falls back to
    "absent". Chrome would drift back to wherever the container put it, on
    upgrade, silently. That is the failure mode this whole rework exists to
    stop.
"""

import frappe

_SQL = "select value from tabSingles where doctype = %s and field = %s"

#: field -> {old value: new value}. Spelt out per field because the same old
#: label means different things on different components — "Top Bar" is the
#: trailing end for the bell and the leading end for Home, which is precisely
#: the inconsistency the new vocabulary removes.
MAPPING = {
    "search_placement": {
        "Sidebar Top": "Side Pane Start",
        "Sidebar Bottom": "Side Pane End",
        "Top Bar Edge": "Top Bar Start",
        "Top Bar Center": "Top Bar Center",
        "Bottom Bar Edge": "Bottom Bar Start",
        "Bottom Bar Center": "Bottom Bar Center",
    },
    "inbox_placement": {
        "Off": "Off",
        "Top Bar": "Top Bar End",
        "Bottom Bar": "Bottom Bar End",
        "Page Header": "Page Header End",
        "Side Pane": "Side Pane End",
        "Dock": "Dock End",
    },
    "home_placement": {
        "Off": "Off",
        "Sidebar Top": "Side Pane Start",
        "Sidebar Bottom": "Side Pane End",
        "Top Bar": "Top Bar Start",
        "Bottom Bar": "Bottom Bar Start",
        "Dock": "Dock Start",
    },
}
#: The user menu moves exactly as the bell does, and All Apps exactly as Home.
#: Aliased rather than copied: two tables that must agree are one table.
MAPPING["user_placement"] = MAPPING["inbox_placement"]
MAPPING["apps_placement"] = MAPPING["home_placement"]


def _single(field: str):
    rows = frappe.db.sql(_SQL, ("Theme Settings", field))
    return rows[0][0] if rows else None


def execute() -> None:
    for field, mapping in MAPPING.items():
        current = _single(field)
        if current is None:
            continue  # never set; the seeder writes a current value
        if current not in mapping:
            # Already migrated, or a value nobody recognises. Either way this
            # patch has nothing true to say about it, and guessing would be
            # worse than leaving it for the seeder.
            continue
        # update_modified=False: a migration is not a user's edit, and bumping
        # `modified` strands every open Theme Settings form — its next save
        # dies with TimestampMismatchError. See setup._seed_defaults.
        frappe.db.set_single_value(
            "Theme Settings", field, mapping[current], update_modified=False
        )
    frappe.db.commit()
