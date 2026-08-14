# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Semantic icon inference — a link's TITLE to a sprite id, on the server.

WHY THIS IS SERVER-SIDE, AND WHY THAT IS THE WHOLE POINT
    The old engine (`sb_fix_icons` in bunood.js) inferred a link's icon in the
    browser from the visible label. Frappe translates that label
    (`frappe/boot.py` runs `_(item.label)`), so on an Arabic desk every English
    keyword misses and every link falls to a letter chip — measured 0 icons / 44
    letters on the Stock workspace, against 35 / 9 in English.

    The fix is to infer from `link_to`, which Frappe never translates, at boot,
    before the sidebar is rendered. `link_to` is "Stock Entry" in every language,
    so the same keys resolve everywhere. `extend_bootinfo` rewrites each item's
    `icon` in place and Frappe's own template draws our choice natively — no DOM
    is touched, and the desk speaks one icon set.

WHAT LIVES HERE
    Pure functions and verified data only: no DB, no `frappe` import at module
    load, so this is unit-testable as plain Python (mirrors `palette.py` /
    `contrast.py`). The one signal that needs a query — a DocType's own icon — is
    passed IN as a pre-built map by the caller (`api.get_doctype_icon_map`), never
    read here.

WHAT STAYS BOUNDED AND HAND-AUTHORED
    Only the concepts no icon library carries: the ERP domain
    (`accounting`, `buying`, `stock`, `equity`, ...) plus the FontAwesome names
    ERPNext still stores on `DocType.icon`. Everything emitted is a sprite id
    VERIFIED to exist in Frappe v16's loaded sets (lucide 1,640 + timeless 141),
    asserted by `tests/test_icons.py` against a snapshot of the live sprite — a
    wrong id renders an empty box, so an unverified guess is worse than a letter.

    The broad long tail (a link whose name matches no rule) is deliberately left
    to the caller's fallback: the workspace's own icon, then a letter chip. The
    tag-index enrichment that would widen coverage is a later, build-time step.
"""

#: `link_to` / DocType-name keyword → sprite id. Matched case-insensitively as a
#: SUBSTRING, most specific first (the first hit wins). This is the shrunk
#: descendant of bunood.js's 14-row SB_ICON_HINTS — every id here is confirmed
#: present in the loaded sprite, unlike the old table's `icon-invoice` /
#: `icon-percentage`, which existed nowhere and silently collapsed onto one file
#: glyph (that is the defect this replaces, on the server where Arabic works).
NAME_HINTS = (
    (("chart of account", "tree", "group of", "hierarch"), "icon-list-tree"),
    (("dashboard", "analytic"), "icon-dashboard"),
    (("report", "statement", "ledger", "trial", "balance sheet"), "icon-table"),
    (("invoice", "bill "), "icon-receipt"),
    (("tax", "charge"), "icon-percent"),
    (("payment", "bank", "cash", "salary", "payroll", "expense", "reconcil"), "icon-money-coins-1"),
    (("customer", "supplier", "employee", "contact", "member", "student", "patient", "party", "lead", "user"), "icon-users"),
    (("item", "product", "stock", "warehouse", "batch", "serial", "inventory", "packing", "delivery", "shipment"), "icon-stock"),
    (("purchase", "buying", "procurement"), "icon-buying"),
    (("sales", "selling", "order", "quotation", "opportunity"), "icon-shopping-cart"),
    (("company", "organization", "branch", "department", "cost center"), "icon-organization"),
    (("project", "task", "timesheet", "activity"), "icon-project"),
    (("journal", "voucher", "entry", "note", "ledger post"), "icon-file-text"),
    (("setting", "setup", "configuration", "defaults", "preference"), "icon-setting-gear"),
    (("tool", "import", "export", "rename", "bulk", "migration"), "icon-tool"),
    (("email", "mail", "newsletter", "notification"), "icon-mail"),
    (("calendar", "schedule", "appointment", "event", "holiday"), "icon-calendar"),
    (("website", "web page", "portal", "blog"), "icon-website"),
)

#: FontAwesome name (ERPNext still writes `fa fa-<name>` into `DocType.icon`) →
#: a verified sprite id. FA3/4 and Lucide are not 1:1, so the ones whose bare
#: name is NOT a valid `icon-*` are mapped by hand here; the rest are resolved by
#: trying `icon-<name>` directly in `sprite_for_fa`. Only names present on this
#: list or confirmed as a direct id are emitted — an unknown fa-name falls
#: through to the keyword pass rather than painting an empty <use>.
FA_ALIAS = {
    "cog": "icon-setting-gear",
    "cogs": "icon-setting-gear",
    "gear": "icon-setting-gear",
    "money": "icon-money-coins-1",
    "money-bill": "icon-money-coins-1",
    "ok": "icon-check",
    "ok-sign": "icon-check",
    "ok-circle": "icon-check",
    "remove": "icon-close",
    "remove-sign": "icon-close",
    "glass": "icon-retail",
    "cutlery": "icon-retail",
    "map-marker": "icon-map-pin",
    "envelope": "icon-mail",
    "comment": "icon-message",
    "comments": "icon-message",
    "font": "icon-text",
    "mobile-phone": "icon-call",
    "mobile": "icon-call",
    "phone": "icon-call",
    "info-sign": "icon-help",
    "question-sign": "icon-help",
    "file-alt": "icon-file-text",
    "file-text-alt": "icon-file-text",
    "random": "icon-change",
    "retweet": "icon-change",
    "bullhorn": "icon-notification",
    "bell": "icon-notification",
    "suitcase": "icon-hr",
    "briefcase": "icon-hr",
    "certificate": "icon-review",
    "sitemap": "icon-list-tree",
    "magic": "icon-tool",
    "wrench": "icon-tool",
    "upload-alt": "icon-upload-lg",
    "download-alt": "icon-upload-lg",
    "shopping-cart": "icon-shopping-cart",
    "truck": "icon-stock",
    "building": "icon-organization",
    "group": "icon-users",
    "user": "icon-customer",
    "flag": "icon-flag",
    "tag": "icon-tag",
    "tags": "icon-tag",
    "calendar": "icon-calendar",
    "list": "icon-list",
    "list-alt": "icon-list-alt",
    "bookmark": "icon-bookmark",
    "print": "icon-printer",
    "copy": "icon-duplicate",
    "edit": "icon-edit",
    "shield": "icon-permission",
    "ticket": "icon-support",
    "gift": "icon-gift",
    "globe": "icon-website",
    "compass": "icon-compass",
    "code": "icon-integration",
    "file-text": "icon-file-text",
    "file": "icon-file",
}


def _norm_fa(icon):
    """Strip a FontAwesome class down to its bare name, or return "" for a
    non-fa value. `"fa fa-file-text"` → `"file-text"`; `"icon-list"` → `""`
    (already a sprite id, handled by `sprite_for_doctype`); `""`/None → `""`."""
    if not icon:
        return ""
    token = str(icon).strip().split()[-1] if str(icon).strip() else ""
    if token.startswith("fa-"):
        return token[3:]
    return ""


def sprite_for_fa(icon, sprite_ids=None):
    """A verified sprite id for a `DocType.icon` value, or None.

    Order: an already-`icon-*` value that exists is kept; a `fa fa-<name>` is
    mapped via FA_ALIAS, then tried as `icon-<name>` directly. `sprite_ids`, when
    given, is the set of ids that actually exist in the target set — the guard
    that keeps a direct `icon-<name>` from emitting a symbol that isn't there.
    Without it (unit tests of the mapping itself) the direct attempt is skipped,
    so only curated ids come back.
    """
    raw = str(icon).strip() if icon else ""
    if raw.startswith("icon-") or raw.startswith("es-"):
        return raw if (sprite_ids is None or raw in sprite_ids) else None
    name = _norm_fa(raw)
    if not name:
        return None
    if name in FA_ALIAS:
        return FA_ALIAS[name]
    direct = "icon-" + name
    if sprite_ids is not None and direct in sprite_ids:
        return direct
    return None


def sprite_for_name(name):
    """A verified sprite id inferred from an UNTRANSLATED link/DocType name, or
    None. This is the language-independent path — `name` is `link_to`, never the
    display label."""
    if not name:
        return None
    low = str(name).lower()
    for words, symbol in NAME_HINTS:
        for w in words:
            if w in low:
                return symbol
    return None


def icon_for_item(item, doctype_icons=None):
    """The full inference for one boot sidebar item — a verified sprite id, or
    None to mean "no better idea, leave the fallback to the caller".

    `item` is a dict from `bootinfo.workspace_sidebar_item[*].items[*]`, carrying
    `link_to`, `link_type` and (for reports) `report.ref_doctype`. Signals run
    strongest-first:

      1. The DocType's OWN icon (highest precision, 168 doctypes carry one),
         reached for a DocType link and for a Report via its `ref_doctype`.
      2. A keyword hit on the untranslated `link_to`.

    `doctype_icons` maps DocType name → already-resolved sprite id (built by
    `api.get_doctype_icon_map`, whose values are verified there). Optional so the
    function stays pure-testable.
    """
    if not isinstance(item, dict):
        return None
    link_type = item.get("link_type")
    link_to = item.get("link_to")

    # 1. The doctype's own icon.
    doctype = None
    if link_type == "DocType" and link_to:
        doctype = link_to
    elif link_type == "Report":
        report = item.get("report") or {}
        doctype = report.get("ref_doctype")
    if doctype and doctype_icons and doctype in doctype_icons:
        return doctype_icons[doctype]

    # 2. Keyword on the untranslated name.
    return sprite_for_name(link_to or item.get("label"))
