# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Retire two active-link styles and three dead fields — item 40.

WHY GLOW RING WENT
    It is Outline plus a blur. Both draw a ring in the accent around the active
    row; one of them also spends 12px of shadow saying so. Nobody chooses
    between them by looking, which makes it two options and one decision.
    `Carbon` was the only shipped look standing on it, and it moves to Outline
    in the same commit.

WHY DOT MARKER WENT, AND THIS ONE IS MEASURED
    Its `::after` sits at `inset-inline-end: var(--bnd-sp-2)`. `.bnd-sb-badge`
    sits at `margin-inline-start: auto` — the SAME PIXEL. So Dot Marker with
    badges set to Dots renders two 6px circles in one place, in two colours,
    and the picker offered that combination. No shipped look used it.

    Accent Rail is the migration target: it is the other minimal marker, it
    marks the row's leading edge rather than its trailing one, and it cannot
    collide with anything the badge engine draws.

WHY THE THREE FIELDS WENT
    `sidebar_rail_button_shape` — three shapes of one 24px control, all eight
    looks shipping Circle, and the two survivors rendered through a class built
    by CONCATENATION (`"bnd-railbtn-" + shape`), which the focus-ring guard
    structurally cannot see. Circle is now the shape.

    `sidebar_remember_sections` — a Check with ZERO consumers since v0.6.0.
    Boot emitted it, `sb_apply` copied it forward, and nothing read it: no
    attribute, no rule, no behaviour. Item 38 looked at wiring it and declined
    for a good reason (deciding which sections are open means depending on
    Frappe's own disclosure contract, unmeasured), and Frappe v16 turns out to
    persist exactly that itself, keyed by workspace. So it is not a feature
    waiting to be built; it is a switch that was never connected.

    `sidebar_scroll_fades` — the FIELD goes; the behaviour comes back in this
    same item as an automatic overflow fade. A mask that has to be switched on
    is the wrong shape: it fades a short list for no reason when on, and clips
    nothing when off. What it should do is depend on whether the list overflows,
    which is not a preference.

READ FROM `tabSingles`, NEVER `get_single_value`
    Patches run after the doctype JSON is synced, so all three departed fields
    are gone from the meta by now, and `get_single_value` raises for a field the
    doctype has lost (item 37 measured it). `sidebar_active_style` survives, so
    it is read and written normally.

    An out-of-range Select on a Single fails validation for the WHOLE document,
    so a site left on "Glow Ring" would have every later save of every other
    setting refused. That is the 2026-08-08 defect, six unrelated checks red,
    and it is why this patch runs before anything can save.
"""

import frappe

#: retired option -> what the site gets instead, and why it is that one.
ACTIVE_STYLE = {
    "Glow Ring": "Outline",      # the same ring, minus a blur nobody picked
    "Dot Marker": "Accent Rail",  # the other minimal marker, on the other edge
}

#: fields whose rows are now orphans. Deleting the row matters: a Single's
#: value survives its field, and the next reader by name would still find it.
GONE = (
    "sidebar_rail_button_shape",
    "sidebar_remember_sections",
    "sidebar_scroll_fades",
)


def execute() -> None:
    current = frappe.db.get_single_value("Theme Settings", "sidebar_active_style")
    landing = ACTIVE_STYLE.get((current or "").strip())
    if landing:
        frappe.db.set_single_value("Theme Settings", "sidebar_active_style", landing)

    frappe.db.sql(
        "delete from tabSingles where doctype = %s and field in %s",
        ("Theme Settings", GONE),
    )
    frappe.clear_cache(doctype="Theme Settings")
