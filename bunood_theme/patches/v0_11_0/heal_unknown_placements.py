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

WHY IT IS SAFE TO RUN FOREVER — AND WHERE IT ACTUALLY DOES
    It is a no-op on a healthy site — every value is already an option — so it
    costs one read per field and writes nothing. This text used to say it
    "stays in patches.txt" so as to run again; Frappe records a patch as run
    and never re-runs it, so on every site that had migrated past 0.11.0 it ran
    exactly once. Since 2026-09-21 (the settings audit, v-8) the body lives in
    ``setup.heal_unknown_selects``, WIDENED from the placement fields to every
    Select, and ``after_migrate`` calls it on every migrate. This module is its
    once-per-site position in the order — LAST, after every patch that writes a
    Select — and delegates.
"""



def execute() -> None:
    from bunood_theme.setup import heal_unknown_selects

    heal_unknown_selects()
