# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Install and migrate lifecycle.

WHAT
    Seeds Theme Settings defaults and regenerates the per-site brand stylesheet.
    Runs on ``after_install`` and on every ``after_migrate``.

WHY after_migrate MATTERS AS MUCH AS after_install
    Two failure modes it repairs, both learned the hard way:

    1. **A field ``default`` only applies to NEW records.** Theme Settings is a Single
       that already exists on every upgraded site, so adding a field with
       ``"default": "C"`` leaves it EMPTY there. The previous version of this theme
       shipped exactly that bug and the value came back blank on the live site. Any new
       field must therefore be seeded here explicitly.

    2. **A database-only restore leaves a stale or absent brand CSS file.** The file
       lives on disk, the URL lives in the database; restoring one without the other
       desynchronises them. Regenerating on migrate makes that self-healing.

    Seeding is idempotent — it only fills values that are currently empty, so a
    customer's choices are never overwritten by an upgrade.
"""

import frappe

from bunood_theme.brand import write_brand_css
from bunood_theme.presets import (
    CRUMB_DEFAULTS,
    DEFAULT_SIDEBAR_PRESET,
    PALETTE_DEFAULTS,
    SIDEBAR_PRESETS,
)

#: Check-type fields whose shipped default is 1. These CANNOT go through the
#: truthiness seeding in :data:`DEFAULTS`: an admin's explicit 0 is falsy and
#: would be flipped back to 1 on every migrate. They are seeded only when the
#: value is ``None`` — i.e. the field has never been written at all.
CHECK_DEFAULTS = {
    field: value
    for defaults in (CRUMB_DEFAULTS, PALETTE_DEFAULTS)
    for field, value in defaults.items()
    if isinstance(value, int)
}
# The palette kit's master gate (item 12). Lived in DEFAULTS since item 4,
# where truthiness seeding would flip an admin's explicit 0 back to 1 on
# every migrate — the tagline bug's exact shape, caught by the v0.8.0
# release review before it could bite.
CHECK_DEFAULTS["enable_command_palette"] = 1

#: Values seeded on install and re-checked on every migrate. Only applied when the
#: current value is empty, so this is safe to re-run forever.
DEFAULTS = {
    "company_name": "Bunood",
    "brand_color": "#4d8756",
    "accent_color": "#4463f0",
    # Density site default (decision "G with C"). Seeded here because a field
    # `default` only applies to NEW records and Theme Settings already exists on
    # every upgraded site — the exact bug v1 shipped with nav_layout.
    "default_density": "Comfortable",
    # Desk layout (checklist item 9). "Top Bar" is the layout the user chose as
    # the default: global bar above the page, breadcrumb title row, slim status
    # bar below. Same seeding rationale as default_density.
    "desk_layout": "Top Bar",
    # Sidebar style kit (item 10): seed the default preset's name and every
    # one of its field values. Values, not the name, are the canon — see
    # bunood_theme/presets.py.
    "sidebar_preset": DEFAULT_SIDEBAR_PRESET,
    **SIDEBAR_PRESETS[DEFAULT_SIDEBAR_PRESET],
    # Breadcrumb (item 11) + palette (item 12) kits: the Select fields only —
    # the Check fields live in CHECK_DEFAULTS above, where None-aware seeding
    # protects an admin's explicit 0.
    **{f: v for f, v in CRUMB_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in PALETTE_DEFAULTS.items() if not isinstance(v, int)},
}

#: Label of the user-menu density toggle. Module-level so the seeder and any
#: future remover agree on the one string that identifies our row.
NAVBAR_DENSITY_LABEL = "Toggle Density"


def after_install() -> None:
    """Seed defaults, the navbar toggle, and the first brand stylesheet."""
    _seed_defaults()
    _seed_navbar_density_item()
    write_brand_css()
    print("\n✅ Bunood Theme installed")
    print("→ Configure at /app/theme-settings\n")


def after_migrate() -> None:
    """Re-seed newly added fields and regenerate the brand stylesheet.

    Both steps are required on every migrate — see the module docstring for why
    neither is redundant with ``after_install``.
    """
    _seed_defaults()
    _seed_navbar_density_item()
    write_brand_css()


def _seed_navbar_density_item() -> None:
    """Put a "Toggle Density" action into Frappe's own user menu, idempotently.

    Navbar Settings is the NATIVE way to add a command to the settings dropdown —
    an ``Action``-type Navbar Item whose ``action`` string is evaluated on click
    (ERPNext seeds "Delete Demo Data" exactly this way). Using it means zero DOM
    manipulation, correct positioning, and Frappe owns the rendering.

    Idempotent by label so migrate can re-run forever; failure never blocks an
    install — a missing menu item degrades to "toggle via console", not a broken
    site.
    """
    try:
        ns = frappe.get_doc("Navbar Settings")
        if any((r.item_label or "") == NAVBAR_DENSITY_LABEL for r in ns.settings_dropdown):
            return
        ns.append(
            "settings_dropdown",
            {
                "item_label": NAVBAR_DENSITY_LABEL,
                "item_type": "Action",
                # bunood.js defines this global; cycles "" -> Comfortable -> Compact.
                "action": "bunood_theme.cycle_density()",
                "is_standard": 0,
                "hidden": 0,
            },
        )
        ns.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(str(e), "Bunood Theme navbar density item")


def on_theme_settings_update(doc, method=None) -> None:
    """``doc_events`` handler — react to a Theme Settings save.

    Two steps, both needed for a save to actually reach users:

    1. Regenerate the brand stylesheet (colours/density travel by CSS). Passes
       ``doc`` through so :func:`write_brand_css` does not re-read the document
       it was just handed.
    2. Clear the site cache. The desk layout travels in ``frappe.boot``, and
       boot payloads are CACHED PER USER — without this, a layout change would
       reach each user only whenever their session cache happened to expire,
       which reads as "the setting is broken". A full clear on a settings save
       is a deliberate, rare cost.
    """
    write_brand_css(doc)
    try:
        frappe.clear_cache()
    except Exception:
        frappe.log_error("bunood_theme: clear_cache after Theme Settings save failed")


def _seed_defaults() -> None:
    """Fill any empty Theme Settings field from :data:`DEFAULTS`.

    Uses ``set_single_value`` rather than ``doc.save()`` deliberately: saving would fire
    ``on_update``, which regenerates the brand CSS, which we are about to do once
    anyway — and during ``after_install`` the document may not be fully constructed.
    """
    try:
        if not frappe.db.exists("DocType", "Theme Settings"):
            return  # pre-migrate; nothing to seed yet
        for field, value in DEFAULTS.items():
            if not frappe.db.get_single_value("Theme Settings", field):
                frappe.db.set_single_value("Theme Settings", field, value)
        # Default-on Checks: seed ONLY the never-written state, so an admin
        # who turned one off stays off across migrates. get_single_value is
        # useless here — it CASTS a missing Check to 0 (verified live), so
        # "never written" must be read as row-absence in tabSingles. Raw SQL
        # because Singles is a bare table, not a DocType.
        stored = {
            row[0]
            for row in frappe.db.sql(
                "select field from tabSingles where doctype=%s", ("Theme Settings",)
            )
        }
        for field, value in CHECK_DEFAULTS.items():
            if field not in stored:
                frappe.db.set_single_value("Theme Settings", field, value)
        frappe.db.commit()
    except Exception as e:
        # Never let seeding block an install or a migrate.
        frappe.log_error(str(e), "Bunood Theme seed defaults")
