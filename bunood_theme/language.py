"""The languages the switch offers (item 44, v0.44.2).

ONE DERIVATION, TWO CONSUMERS: boot serves the list the switch draws from, and
``api.set_language`` validates a switch against the same list, so a stale client
cannot write a code the admin did not offer.

The set is Theme Settings' ``language_choices`` - the user's rule, "only languages
turned on in settings". Frappe's own ``Language.enabled`` flag was the first cut and
it is the wrong fact: Frappe enables seventeen languages at install that nobody
chose, so a switch built from it was a menu of seventeen on a two-language site.
The flag still gates: a chosen language that is disabled in the Language list is
dropped rather than offered, because ``User.language`` cannot usefully hold it.
Empty means the shipped pair (``presets.LANGUAGE_DEFAULTS``).
"""

from __future__ import annotations

import frappe

from bunood_theme.presets import LANGUAGE_DEFAULTS


def chosen_codes(settings=None) -> list[str]:
    """The admin's codes in order, or the shipped pair; never validated here."""
    raw = None
    if settings is not None and hasattr(settings, "get"):
        raw = settings.get("language_choices")
    if raw is None:
        try:
            raw = frappe.db.get_single_value("Theme Settings", "language_choices")
        except Exception:
            raw = None  # the field is not on this site yet (an old bench mid-migrate)
    codes = [c.strip() for c in str(raw or "").split(",") if c.strip()]
    if not codes:
        codes = [c.strip() for c in LANGUAGE_DEFAULTS["language_choices"].split(",") if c.strip()]
    seen: list[str] = []
    for c in codes:
        if c not in seen:
            seen.append(c)
    return seen


def offered_languages(settings=None) -> list[dict]:
    """``[{"code", "name"}]`` in the admin's order, dropping codes the site cannot serve."""
    codes = chosen_codes(settings)
    if not codes:
        return []
    rows = {
        r.name: (r.language_name or r.name)
        for r in frappe.get_all(
            "Language", filters={"name": ["in", codes], "enabled": 1}, fields=["name", "language_name"]
        )
    }
    return [{"code": c, "name": rows[c]} for c in codes if c in rows]
