import frappe


def execute():
    """The rail's always-visible expand button retires; its two fields go.

    `sidebar_rail_button` (None / Edge / Header) mounted a button on the rail
    and `icon_rail_button` (Chevron / Menu / Arrows) chose its glyph. The
    2026-09-02 pane-defaults round said retire (the rail's Header button collided
    with the brand chip; the three-state pane and the rail's trigger are the
    affordance), and the settings audit of 2026-09-21 found both fields still
    present with shipped values (finding D8, decision iv-2 b). The Hover + Pin
    trigger keeps its pin, which is the rail's one control now.

    The stored rows are deleted through the TABLE: the fields are gone from the
    doctype in the same commit, so ``set_single_value`` would refuse them and a
    ``doc.save()`` would silently drop them — the raw delete is the honest form
    for a departed field (the v0_37_0 precedent). Idempotent; nothing to carry.

    Named `unreleased` on purpose, like its neighbour: the release names the
    directory.
    """
    frappe.db.sql(
        "delete from tabSingles where doctype = 'Theme Settings' and field in ('sidebar_rail_button', 'icon_rail_button')"
    )
    frappe.db.commit()
    frappe.clear_cache(doctype="Theme Settings")
