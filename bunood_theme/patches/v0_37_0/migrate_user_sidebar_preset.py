# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Carry each user's per-user side-pane choice into the one catalogue — item 37.

WHAT WOULD HAVE BEEN LOST
    The "personalize" menu stores its choice per user, in ``frappe.defaults``
    under ``bnd_sidebar_preset``, and it used to name one of the EIGHT sidebar
    presets. Item 37 re-pointed the menu at the twelve THEME presets and changed
    both readers to match: ``boot.py`` now applies the override only
    ``if user_preset in THEME_PRESETS``, and ``api.set_user_sidebar_preset``
    rejects anything else outright.

    Five of the eight stored names — Aurora, Bunood Light, Daylight, Ink, Paper —
    are not theme preset names. Without this patch every user who had picked one
    would silently revert to the site's side pane on their next login, with no
    message and nothing in the database to say what they had chosen. Found by the
    adversarial release review; the suite could not see it, because the suite
    never sets a per-user default.

WHY THE MAPPING IS EXACT RATHER THAN A GUESS
    A theme preset NAMES the sidebar preset it carries (``THEME_PRESETS[n]
    ["sidebar"]``), and every one of the eight is named by at least one of the
    twelve. So each stored value has a theme preset whose side pane is the
    IDENTICAL eighteen values — not an approximation of the user's choice, but
    the same pane under the name it now goes by. Nobody's desk changes.

    Where several theme presets carry the same side pane (Ink is both Focus and
    Quiet), the first in catalogue order wins. That is arbitrary between equals
    and cannot be otherwise: the stored value never recorded which, because until
    today it was not a question anyone could ask.

    Derived by comparison against the one catalogue rather than written out as a
    table here — a second copy of this mapping is exactly the drift item 37 spent
    itself closing.
"""

import frappe


def execute() -> None:
    from bunood_theme.presets import THEME_PRESETS

    # sidebar preset name -> the first theme preset that carries it.
    forward: dict[str, str] = {}
    for theme, spec in THEME_PRESETS.items():
        forward.setdefault(spec.get("sidebar", ""), theme)

    rows = frappe.get_all(
        "DefaultValue",
        filters={"defkey": "bnd_sidebar_preset"},
        fields=["name", "defvalue", "parent"],
    )
    for row in rows:
        stored = (row.defvalue or "").strip()
        if not stored or stored in THEME_PRESETS:
            continue
        moved = forward.get(stored)
        if moved:
            frappe.db.set_value("DefaultValue", row.name, "defvalue", moved)
        else:
            # A name neither catalogue knows — a hand-edited or much older value.
            # Clearing it is the honest end state: the reader would ignore it
            # anyway, and leaving it pretends a choice is still in effect.
            frappe.db.delete("DefaultValue", {"name": row.name})

    frappe.clear_cache()
