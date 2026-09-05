# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Carry three option sets onto the vocabulary they should always have had — item 40.

    sidebar_section_style   Mini-Cards -> Cards, Accordion Cards -> Cards
    sidebar_rail_trigger    Button Only -> Click (+ an Edge button, see below)
    sidebar_rail_button     Top -> Header, Bottom -> Edge

WHY "ACCORDION CARDS" WENT
    It was never a style. It is Cards plus a collapse behaviour, and that
    behaviour does not exist anywhere in this app: no rule keys on
    `[data-bnd-sb-sections="accordion"]`, and `sb_wrap_sections` treated it as a
    synonym for `cards`. Two options, one pixel — the defect the picker
    vocabulary exists to prevent, shipped in the picker that names it. Nobody
    loses anything by moving to Cards, because Cards is what they were seeing.

    Collapse arrives as its own field, and it will arrive built.

WHY "BUTTON ONLY" WENT, AND WHY THE MIGRATION WRITES TWO FIELDS
    It was not a trigger. Its implementation read
    `if (trigger === "button" && !pos) pos = "edge"` — ONE PICKER SILENTLY
    OVERWRITING ANOTHER PICKER'S FIELD. A tenant on Button Only with the rail
    button set to None was shown an edge button anyway, and the Rail expand
    button picker said None the whole time.

    So the honest migration writes what they were actually LOOKING AT: the
    trigger becomes Click, and if the button was None it becomes Edge, because
    an edge button is what the old code drew. Preserving the stored None would
    take away the only control that opened their rail.

WHY "BOTTOM" WENT
    At `inset-inline-end: 50%` it sat over the foot's own controls — Frappe's
    collapse link and the resize handle both live there. It moves to Edge, the
    other placement that is not the head.

    "Top" is renamed "Header" for what it is rather than for a compass point;
    the geometry is unchanged, so nobody's button moves.

THESE FIELDS STILL EXIST, so `get_single_value` is the correct reader here —
unlike this release's other patches, which go to `tabSingles` because their
fields had already left the doctype. What matters instead is that an
out-of-range Select on a Single fails validation for the WHOLE document: a site
left on "Accordion Cards" would have every later save of every other setting
refused. That is the 2026-08-08 defect, six unrelated checks red.
"""

import frappe

#: field -> {stored value: what it becomes}
RETUNE = {
    "sidebar_section_style": {"Mini-Cards": "Cards", "Accordion Cards": "Cards"},
    "sidebar_rail_trigger": {"Button Only": "Click"},
    "sidebar_rail_button": {"Top": "Header", "Bottom": "Edge"},
}


def execute() -> None:
    # Captured BEFORE the loop rewrites it: the second half of the Button Only
    # repair depends on where the site WAS, and a site that chose Click and None
    # for itself chose to have no button. Only a tenant the old code was drawing
    # an edge button for gets one back.
    was_button_only = (
        frappe.db.get_single_value("Theme Settings", "sidebar_rail_trigger") or ""
    ).strip() == "Button Only"

    moved = False
    for field, table in RETUNE.items():
        current = (frappe.db.get_single_value("Theme Settings", field) or "").strip()
        landing = table.get(current)
        if landing:
            frappe.db.set_single_value("Theme Settings", field, landing)
            moved = True

    if was_button_only:
        # Read AFTER the loop, so a site that also had to move Top or Bottom is
        # judged on where it landed rather than on where it started.
        button = (frappe.db.get_single_value("Theme Settings", "sidebar_rail_button") or "").strip()
        if button in ("", "None"):
            frappe.db.set_single_value("Theme Settings", "sidebar_rail_button", "Edge")
            moved = True

    if moved:
        frappe.clear_cache(doctype="Theme Settings")
