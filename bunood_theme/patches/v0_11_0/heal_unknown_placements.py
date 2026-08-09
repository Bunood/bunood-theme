# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Heal any placement holding a value its field no longer offers.

WHY THIS IS NOT PART OF `slot_vocabulary`
    That patch translates the values it KNOWS: it has a table of old label to
    new slot, and it deliberately leaves anything outside that table alone,
    because guessing is worse than not touching. This one is the other half —
    it makes no guess about MEANING, it only refuses to leave a value in place
    that the field will not accept.

    It is a separate patch and not an edit to that one because patches record
    themselves as run. Editing `slot_vocabulary` would heal a fresh install and
    nothing else; a site that is already wedged would stay wedged.

WHAT AN ILLEGAL VALUE ACTUALLY COSTS — MEASURED, NOT FEARED
    Theme Settings is a Single. Frappe validates every Select field on save, so
    ONE out-of-range value does not merely lose its own setting: it fails
    validation for the WHOLE document, and every later write of any other field
    fails with it. On 2026-08-08 the bench held `inbox_placement = "Side Pane
    Center"` — left behind by a test run from before the side pane dropped to
    two zones — and six unrelated checks failed for it: both autosave checks,
    the merge check, the rapid-click check, live preview, and the change dot,
    none of which touch placement at all. Nothing in the failures named the
    cause. That is the shape of this bug, and it is why healing is worth a
    patch of its own rather than a note in the release checklist.

WHERE IT HEALS TO
    `setup.SHIPPED`, which is the one place that says what a fresh install
    gets. Not the layout preset: the user's `desk_layout` may itself be the
    thing that wrote the bad value, and answering a broken table with the same
    broken table is how a heal becomes a loop. The shipped default is a value
    this app is prepared to defend on any desk.

WHY IT IS SAFE TO RUN FOREVER
    It is a no-op on a healthy site — every value is already an option — so it
    costs one read per placement field and writes nothing. It stays in
    `patches.txt` rather than being deleted after one release, because the
    class of fault it repairs is "a slot stopped being offered", and that will
    happen again the next time the vocabulary is narrowed.
"""

import frappe

from bunood_theme.registry import COMPONENTS, TENANT, slots_for

_SQL = "select value from tabSingles where doctype = %s and field = %s"


def execute() -> None:
    from bunood_theme.setup import SHIPPED

    for component in COMPONENTS:
        if component["type"] != TENANT:
            continue
        field = f"{component['key']}_placement"
        rows = frappe.db.sql(_SQL, ("Theme Settings", field))
        if not rows:
            continue  # never set; the seeder writes a current value
        current = rows[0][0]
        legal = slots_for(component["key"])
        if current in legal:
            continue
        fallback = SHIPPED.get(field)
        if fallback not in legal:
            # The shipped default is itself not an option. That is a build
            # fault, not a site fault, and overwriting a user's value with a
            # second illegal one would only move the damage. Say so and leave
            # it: the smoke suite asserts SHIPPED against `slots_for`, so this
            # branch means that assertion has been bypassed.
            frappe.log_error(
                title="bunood_theme: no legal default for " + field,
                message=f"stored {current!r}, shipped {fallback!r}, offered {legal!r}",
            )
            continue
        # update_modified=False: a migration is not a user's edit, and bumping
        # `modified` strands every open Theme Settings form — its next save
        # dies with TimestampMismatchError. See setup._seed_defaults.
        frappe.db.set_single_value(
            "Theme Settings", field, fallback, update_modified=False
        )
        print(f"  bunood_theme: {field} {current!r} is not offered -> {fallback!r}")
    frappe.db.commit()
