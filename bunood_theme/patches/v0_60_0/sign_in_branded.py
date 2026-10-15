"""The sign-in page's primary button in the brand colour (THE OWNER, 2026-10-15: «استمر» renders
black; it should be the brand's).

WHAT IT MOVES
    Theme Settings ``login_action`` from "Neutral" to the shipped default
    (``presets.LOGIN_DEFAULTS["login_action"]``, "Branded" since item 32) — only where the stored
    value is exactly "Neutral". "Neutral" is the stand-down pole: contract R7's inverse pair,
    ``--bnd-ink`` under ``--bnd-page``, which is black in light. No look writes it
    (``presets.THEME_PRESETS`` never names ``login_action``), so a site holding it got it from the
    Select's first option or from a hand on the picker, and the owner has now asked for the brand.

    Anything else is left alone: "Branded" is already there; an EMPTY field renders the shipped
    default (``context._auth_context`` falls back to it) and the seeder fills it in
    ``after_migrate``; an unknown value is ``heal_unknown_placements``' business.

    The page reads the field per request (``www/login.py`` is not cached) and ``brand.py``'s sheet
    never depends on it, so nothing is re-rendered here.

ONE PATCH, RUN ONCE: a tenant who picks Neutral after this keeps it.
"""

import frappe

#: The pole that paints the button black in light.
OLD = "Neutral"


def execute():
    from bunood_theme.presets import LOGIN_DEFAULTS

    new = LOGIN_DEFAULTS["login_action"]
    rows = frappe.db.sql(
        "select value from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "login_action"),
    )
    stored = rows[0][0] if rows else None
    if stored != OLD or new == OLD:
        print("bunood_theme sign-in button: kept", repr(stored))
        return
    # update_modified=False, as the seeder writes: no person edited the form.
    frappe.db.set_single_value("Theme Settings", "login_action", new, update_modified=False)
    # Commit, then clear (CLAUDE.md, the cache trap).
    frappe.db.commit()
    frappe.clear_cache(doctype="Theme Settings")
    print("bunood_theme sign-in button: login_action", OLD, "->", new)
