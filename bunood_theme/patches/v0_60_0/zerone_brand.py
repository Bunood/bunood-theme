"""The product's name on a site that still carries the OLD SHIPPED one (THE OWNER, 2026-10-15:
the system is renamed Zero One, «زيرو ون»).

WHAT IT MOVES
    Theme Settings ``company_name``, only where the stored value, stripped, is the old shipped
    default "Bunood" or its Arabic «بنود». Both are the vendor's name, never a tenant's:
    ``presets.SITE_DEFAULTS`` seeded "Bunood" on install and on every migrate that found the
    field empty, and the Arabic is how an Arabic-speaking administrator retyped it. A
    tenant's own name (any other value) is never touched, and an empty field stays empty —
    ``setup._seed_defaults`` fills it with the new default right after this patch.

WHY A PATCH AND NOT THE SEEDER
    The seeder writes only an EMPTY field, so a site seeded "Bunood" keeps it forever; and it
    is the field the desk, the sign-in page, the tab title and the website footer all read.

ONE PATCH, RUN ONCE. Released sites record it by module path; a later brand change is a new
patch, not a case added here.
"""

import frappe

#: The old shipped name, as the site may hold it. Compared after ``strip()``.
OLD_NAMES = ("Bunood", "بنود")


def execute():
    from bunood_theme.presets import SITE_DEFAULTS

    changed = _rename_company(SITE_DEFAULTS["company_name"])
    if changed:
        # Commit, then clear: a worker that re-reads the Single between the two would
        # cache the old row behind a clear nobody repeats (CLAUDE.md, the cache trap).
        frappe.db.commit()
        frappe.clear_cache(doctype="Theme Settings")
    print("bunood_theme zerONE brand:", changed or "nothing to rename")


def _rename_company(new_name: str) -> list[str]:
    # Raw tabSingles, so no cached copy answers. `set_single_value` fires no hooks, and none
    # is owed: `company_name` is not in `brand.BRAND_INPUTS`, so the brand sheet is unchanged.
    stored = frappe.db.sql(
        "select value from tabSingles where doctype = 'Theme Settings' and field = 'company_name'"
    )
    value = (stored[0][0] if stored else None) or ""
    if value.strip() not in OLD_NAMES:
        return []
    frappe.db.set_single_value("Theme Settings", "company_name", new_name)
    return [f"company_name: {value.strip()} -> {new_name}"]
