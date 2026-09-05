import frappe


def execute():
    """Shortcuts are gone; so is every user's pin store.

    Item 40's pinned-and-recent region was retired in v0.42.1 at the user's call.
    Its only persistent state was one DefaultValue row per user (`bnd_sb_pins`,
    a JSON list). Nothing reads it now, and a personal-layer row that no axis
    declares is exactly the orphan `check_personal_partition` exists to refuse
    -- so the rows go with the feature rather than lingering as unowned state.

    Deleted through the table rather than `frappe.defaults`: the build's
    personal-axes guard reads any `frappe.defaults` call naming a key as that
    key being LIVE and demands an AXES row for it, and this key is being retired,
    not declared. The site-wide cache clear is what drops the cached per-user
    defaults the rows used to feed.
    """
    frappe.db.delete("DefaultValue", {"defkey": "bnd_sb_pins"})
    frappe.clear_cache()
