# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Delete the stored ``desk_layout`` row — item 37, closing phase 0's last leftover.

WHAT ITEM 36 LEFT, AND WHY IT LEFT IT
    Item 36 hid the field and re-pointed the shell entry at the containers, but
    stopped short of deleting it, recording the reason honestly: boot still
    stamped ``data-bnd-layout`` from the stored name and ~a dozen rules were
    believed to position panels by that attribute, so deleting it would silently
    unstyle every CUSTOM desk.

    MEASURED, THAT WAS TRUE OF EXACTLY ONE RULE. Of fifteen uses in the SCSS
    tree, fourteen were bare ``html[data-bnd-layout]`` presence guards — "our
    chrome system started" — and one read a value: ``_inbox.scss``'s
    ``[data-bnd-layout="bottombar"]``, which pins the notification panel above
    the bottom strip.

    And the obvious re-key of that one would have been a silent regression.
    ``data-bnd-bottombar`` looks equivalent and is not: all five layouts write
    ``bottombar: 1``, so the rule would fire on every desk. What it is about is
    where the BELL mounted, which ``data-bnd-bell`` has carried since item 22 —
    stamped from the mount's outcome, and already the vocabulary three rules
    away in ``_layouts.scss``.

WHAT REPLACED IT
    The presence guards are ``data-bnd-desk`` now, stamped unconditionally,
    which is what they always meant. ``build.mjs``'s ownership guard was renamed
    in the same commit — it matched ``data-bnd-(layout|search)``, and a rename
    without it would have left the guard green and guarding nothing.

    The layout PICKER stays and still works: it writes the containers directly
    through ``registry.layout_settings`` and derives its highlight by comparing
    them, so the five layouts remain one click away. Only the stored NAME is
    gone. That is the settings architecture's own rule — presets write values
    and then stop existing — reaching the last field that had not obeyed it.

WHY A PATCH
    A Single keeps values as ``tabSingles`` rows, and a row for a field the
    doctype no longer has outlives the field until the next ``doc.save()``
    rewrites the rowset. Until then ``get_single_value`` will still return it to
    anything that asks by name. One statement removes the question.
"""

import frappe


def execute() -> None:
    frappe.db.sql(
        "delete from tabSingles where doctype = %s and field = %s",
        ("Theme Settings", "desk_layout"),
    )
    frappe.clear_cache(doctype="Theme Settings")
