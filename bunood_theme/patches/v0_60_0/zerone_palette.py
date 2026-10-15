"""The shipped palette where a site still carries the OLD SHIPPED one (THE OWNER, 2026-10-15:
the product is Zero One, «زيرو ون», and its desk is the zerONE blue).

WHAT IT MOVES
    Theme Settings ``brand_color`` (and ``accent_color``, should the two palettes ever differ
    there) to ``presets.PALETTES[DEFAULT_PALETTE]`` — ONLY where the site still holds the old
    shipped default exactly: the green "Bunood" palette, nothing of the tenant's own on top of
    it. That is every one of these, after ``strip()`` and case-folding:

      * ``brand_color`` is the old shipped seed;
      * ``accent_color`` is the old shipped accent, or empty (the sheet renders the shipped one);
      * ``brand_color_dark``, ``accent_color_dark`` and ``ground_color`` are empty.

    Anything else is a tenant's colour choice and is never touched — a brand of their own, a
    ring of their own on the green, a dark seed or a ground. An EMPTY ``brand_color`` is not
    touched either: it was never seeded, ``setup._seed_defaults`` fills it with the new default
    right after (``after_migrate``), and an empty seed already renders the shipped one.

WHY A PATCH AND NOT THE SEEDER
    The seeder writes only an EMPTY field, so a site seeded with the green keeps it forever.

WHY IT RE-RENDERS
    ``set_single_value`` fires no ``on_update``, and the colour reaches users through files the
    save would have rewritten: the per-site brand sheet and the print carriers (the Print Style
    and the Letter Head, both substituted from the seeds). ``after_migrate`` rewrites them too,
    but this also runs from ``bench execute``, where nothing else would.

``update_modified=False``, as the seeder writes: the vendor's default moved, no person edited
the form, and a bumped ``modified`` stales every Theme Settings form open anywhere.

ONE PATCH, RUN ONCE, and IDEMPOTENT: once moved, the site no longer holds the old default.
"""

import frappe

#: The old shipped default, as it shipped (presets.PALETTES["Bunood"] then and now). Stated
#: here rather than read from the catalogue: a patch records what it moves FROM, and must
#: still mean it on a site that upgrades long after the catalogue has moved on.
OLD_DEFAULT = {"brand_color": "#3d8150", "accent_color": "#0090ff"}

#: The seeds a tenant can set on top of a palette. All must be empty for the old default.
OWN_FIELDS = ("brand_color_dark", "accent_color_dark", "ground_color")

FIELDS = ("brand_color", "accent_color") + OWN_FIELDS


def execute():
    from bunood_theme.presets import DEFAULT_PALETTE, PALETTES

    new = PALETTES[DEFAULT_PALETTE]
    stored = _stored()
    if not _is_old_default(stored):
        print("bunood_theme zerONE palette: kept (not the old shipped default)")
        return

    writes = {
        field: new[field]
        for field in ("brand_color", "accent_color")
        if _norm(stored.get(field)) != new[field].lower()
    }
    if not writes:
        return
    for field, value in writes.items():
        frappe.db.set_single_value("Theme Settings", field, value, update_modified=False)
    # Commit, then clear: a worker that re-reads the Single between the two would cache the
    # old row behind a clear nobody repeats (CLAUDE.md, the cache trap).
    frappe.db.commit()
    frappe.clear_cache(doctype="Theme Settings")

    from bunood_theme.brand import write_brand_css
    from bunood_theme.printing.install import resync_print_brand

    doc = frappe.get_single("Theme Settings")
    # Both never raise: each logs and stands down on its own failure.
    write_brand_css(doc)
    resync_print_brand(doc)
    frappe.db.commit()
    print("bunood_theme zerONE palette:", ", ".join(f"{f} -> {v}" for f, v in writes.items()))


def _stored() -> dict:
    # Raw tabSingles, so no cached copy answers and an absent row reads as absent.
    rows = frappe.db.sql(
        "select field, value from tabSingles where doctype = %s and field in %s",
        ("Theme Settings", FIELDS),
    )
    return {field: value for field, value in rows}


def _norm(value) -> str:
    return (value or "").strip().lower()


def _is_old_default(stored: dict) -> bool:
    if _norm(stored.get("brand_color")) != OLD_DEFAULT["brand_color"]:
        return False
    if _norm(stored.get("accent_color")) not in ("", OLD_DEFAULT["accent_color"]):
        return False
    return all(not _norm(stored.get(field)) for field in OWN_FIELDS)
