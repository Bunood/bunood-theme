import frappe


def execute():
    """The legacy per-user side-pane look retires into the whole-desk look.

    `bnd_sidebar_preset` (v0.6.0) named a side-pane look per user. Item 37
    re-pointed it at the theme catalogue and item 38 added `bnd_look` beside it,
    leaving both. The settings audit of 2026-09-21 measured what that left: the
    "Sidebar Style" menu that wrote the old key was gone for releases, its
    endpoint had no caller anywhere, and yet a stored row still applied twelve
    fields at every boot — including the pane state — with no way for its owner
    to change or clear it (finding a-3, decision i-4 a).

    Carried, not dropped: a person who chose a look and has no whole-desk look
    of their own gets that name as `bnd_look`, so their desk does not change.
    Written through `frappe.defaults` because `bnd_look` is a LIVE axis (the
    build's personal-axes guard demands `parent=` and an AXES row, and both hold).
    The retired key is read and deleted through the TABLE for the opposite
    reason — the same guard reads any `frappe.defaults` call naming a key as that
    key being live, and this one is being retired (the v0.42.1 precedent).

    Named `unreleased` on purpose: whether this work is a new item or a patch
    series on 46.x is the user's call, and a patch directory that assumes the
    next number is a recorded mistake (item 45). Rename the directory with the
    release; the patch is idempotent, so a re-run on the one site that ran it
    under this name costs nothing.
    """
    from bunood_theme.presets import THEME_PRESETS

    rows = frappe.db.sql(
        "select parent, defvalue from `tabDefaultValue` where defkey = 'bnd_sidebar_preset'",
        as_dict=True,
    )
    for row in rows:
        has_look = frappe.db.sql(
            "select 1 from `tabDefaultValue` where parent = %s and defkey = 'bnd_look' limit 1",
            row.parent,
        )
        if not has_look and row.defvalue in THEME_PRESETS:
            frappe.defaults.set_default("bnd_look", row.defvalue, parent=row.parent)
    frappe.db.delete("DefaultValue", {"defkey": "bnd_sidebar_preset"})
    frappe.db.commit()
    frappe.clear_cache()
