# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Fold ``sidebar_glass_opacity`` and ``sidebar_blur`` into the material — item 40.

WHAT WENT, AND WHY IT WAS NEVER THREE CONTROLS
    material x opacity x blur offered **thirty** combinations, and Solid
    collapses fifteen of them onto one pixel — `presets.py` admitted as much in
    a comment that called the two fields "inert while the material is Solid".
    Of the remaining fifteen, the five alpha stops were parameterised rather
    than drawn: nobody ever chose 55% or 93%, they existed because a 1..5
    stepper was cheap to build. Two of the fifteen were designed, and they are
    the two the shipped looks use.

    So the axis becomes what it always was: **Solid / Glass / Blurred Glass**.

THE TWO SHIPPED GLASS LOOKS KEEP THEIR EXACT PIXELS
    Bunood Light is Glass + Soft blur + opacity 4 (85%); Aurora is Glass + Full
    blur + opacity 3 (75%). Those two numbers become the two materials' fixed
    translucency, so neither look moves by a pixel. Blurred sits lighter on
    purpose - the backdrop blur is already doing the separating, and at the same
    opacity it reads as murk.

WHAT A HAND-TUNED TENANT LOSES, STATED PLAINLY
    Anyone who set opacity 1, 2 or 5 lands on their material's value. That is a
    visible change and it is the point of the merge: five stops nobody drew are
    not worth thirty combinations in a picker. The blur choice is preserved
    exactly, because it is what selects between the two glass materials.

    `Off` blur under Glass maps to Glass, not to Solid. The tenant asked for
    glass; taking the translucency away because they turned the blur down would
    be answering a question they did not ask.

READ FROM `tabSingles`, NEVER `get_single_value`
    Patches run after the doctype JSON is synced, so both source fields are
    already gone from the meta and `get_single_value` raises for a field the
    doctype has lost (measured in item 37). A missing row means the tenant never
    moved off the shipped default, so absence writes nothing.
"""

import frappe


def _raw(field: str):
    """The stored value of one Theme Settings field, or None. Raw by necessity."""
    rows = frappe.db.sql(
        "select value from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", field),
    )
    return rows[0][0] if rows else None


def execute() -> None:
    material = (_raw("sidebar_material") or "").strip()
    blur = (_raw("sidebar_blur") or "").strip()

    # Only Glass can become something else; Solid absorbs both fields by
    # ignoring them, which is what "inert" meant all along.
    if material == "Glass" and blur == "Full":
        frappe.db.set_single_value("Theme Settings", "sidebar_material", "Blurred Glass")

    frappe.db.sql(
        "delete from tabSingles where doctype = %s and field in %s",
        ("Theme Settings", ("sidebar_glass_opacity", "sidebar_blur")),
    )
    frappe.clear_cache(doctype="Theme Settings")
