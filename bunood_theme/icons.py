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
    asserted by `tools/check_icons.py` (run via `npm run icons:check`, and gated
    in `tests/smoke.mjs`'s "icon engine" family) against a snapshot of the live
    sprite — a wrong id renders an empty box, so an unverified guess is worse
    than a letter.

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
    # THE SALES BUCKET, SPLIT (item 42, slice I). One entry used to answer for
    # quotations, orders and opportunities with a shopping cart, so a Selling
    # workspace drew the same glyph on three sibling rows -- and a row's icon is
    # only worth anything if it tells that row apart from its neighbours. A
    # quotation is a document being written, not a cart. `icon-file-pen` rather
    # than the plan's `icon-file-text`, because that id is already the journal /
    # voucher bucket's and the split would have swapped one collision for another.
    (("quotation", "quote", "proposal", "estimate"), "icon-file-pen"),
    (("sales", "selling", "order", "opportunity"), "icon-shopping-cart"),
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


def sprite_for_item_icon(icon, sprite_ids=None):
    """A verified sprite id for a SIDEBAR ROW's own `icon` value, or None.

    NOT THE SAME VOCABULARY AS `sprite_for_fa`, and that cost a measurement to
    learn. `DocType.icon` still holds FontAwesome (`fa fa-cog`), which is what
    that function reads; a `Workspace Sidebar Item.icon` holds a BARE v16 sprite
    name -- `home`, `chart`, `sell`, `receipt-text` -- because `frappe.utils.icon()`
    prefixes `#icon-` at render time. Handing a bare name to `sprite_for_fa`
    returns None for every row, silently: `_norm_fa` answers "" for anything not
    starting with `fa-`, so the whole signal reads as absent and the keyword
    guess wins again. That is what it did until this function existed, and the
    only reason it was caught is that the audit printed the glyphs rather than a
    pass.

    Accepts all three spellings a row can hold, most literal first, and verifies
    every one against `sprite_ids` -- an id the sprite lacks renders an EMPTY
    BOX, which is worse than the fallback it would displace.
    """
    raw = str(icon).strip() if icon else ""
    if not raw:
        return None
    if raw.startswith("icon-") or raw.startswith("es-"):
        return raw if (sprite_ids is None or raw in sprite_ids) else None
    fa = sprite_for_fa(raw, sprite_ids)
    if fa:
        return fa
    direct = "icon-" + raw.split()[-1]
    if sprite_ids is not None and direct in sprite_ids:
        return direct
    return None


def sprite_ids():
    """The ids in the shipped sprite snapshot, as a set. Cached after the first read.

    ONE SNAPSHOT, THREE CONSUMERS: `tools/check_icons.py` holds this module to it,
    the suite's Smart audit measures against it, and `boot._apply_icon_inference`
    needs it to answer whether a row's OWN icon is usable -- an id the sprite does
    not have renders an empty box, which is worse than the guess it displaced.

    Returns an empty set if the file is missing rather than raising: a degraded
    inference is a worse desk, an exception here is no desk at all.
    """
    global _SPRITE_IDS
    if _SPRITE_IDS is None:
        import json
        import os

        path = os.path.join(os.path.dirname(__file__), "data", "sprite_ids.json")
        try:
            with open(path, encoding="utf-8") as fh:
                _SPRITE_IDS = frozenset(json.load(fh)["ids"])
        except Exception:
            _SPRITE_IDS = frozenset()
    return _SPRITE_IDS


#: Filled on first `sprite_ids()` call; the file ships with the app and never
#: changes at runtime, so one read is one read.
_SPRITE_IDS = None


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


def icon_for_item(item, doctype_icons=None, sprite_ids=None):
    """The full inference for one boot sidebar item — a verified sprite id, or
    None to mean "no better idea, leave the fallback to the caller".

    `item` is a dict from `bootinfo.workspace_sidebar_item[*].items[*]`, carrying
    `link_to`, `link_type` and (for reports) `report.ref_doctype`. Signals run
    strongest-first:

      1. The ROW'S OWN icon, wherever it resolves to a real sprite id.
      2. The DocType's icon (168 doctypes carry one), reached for a DocType
         link and for a Report via its `ref_doctype`.
      3. A keyword hit on the untranslated `link_to`.

    THE ORDER IS ITEM 42's, AND IT IS THE REVERSE OF WHAT SHIPPED. Inference
    used to run the doctype map first and the keyword pass second, overriding
    whatever the row held on the theory that Frappe's shipped icons are generic.
    Measured on this site, over 541 links in 25 sidebars, both halves of that
    were wrong:

      * The KEYWORD pass is a CATEGORY guess and it beat specific icons. On
        Selling, `link_to` is the WORKSPACE name for two link types -- `Home`
        (Workspace -> "Selling") and `Dashboard` (Dashboard -> "Selling") -- so
        both matched the word "selling" and were rewritten from their shipped
        `home` and `chart` to a shopping cart.
      * The DOCTYPE map is not more specific than the row either. Sales Order
        ships `sell` and Sales Invoice ships `receipt` on the ROW, while their
        doctypes both resolve to a generic file -- so six Selling rows wore one
        glyph, and the two that had a good one lost it.

    A row's icon is only worth anything if it tells that row apart from its
    neighbours, and the person who wrote the row is the one who chose for THAT
    row. Everything else is a fallback for rows nobody chose for.

    `sprite_ids` is what makes "usable" checkable: an icon the record holds but
    the sprite does not have renders an EMPTY BOX, which is worse than the
    guess it displaced -- so that case still falls through to the keyword pass.
    Optional, and omitting it means "assume the row's own icon is usable", which
    is the conservative reading for a caller that cannot check.

    `doctype_icons` maps DocType name → already-resolved sprite id (built by
    `api.get_doctype_icon_map`, whose values are verified there). Optional so the
    function stays pure-testable.
    """
    if not isinstance(item, dict):
        return None
    link_type = item.get("link_type")
    link_to = item.get("link_to")

    # 1. The row's own icon, wherever it resolves. `sprite_ids` is what makes
    #    "resolves" checkable: an icon the record holds but the sprite does not
    #    have renders an EMPTY BOX, which is worse than the fallback it would
    #    displace, so that case falls through. Omitting `sprite_ids` means
    #    "assume it is usable" -- the conservative reading for a caller that
    #    cannot check, and what the mapping's own unit tests pass.
    own = sprite_for_item_icon(item.get("icon"), sprite_ids)
    if own:
        return own

    # 2. The doctype's own icon.
    doctype = None
    if link_type == "DocType" and link_to:
        doctype = link_to
    elif link_type == "Report":
        report = item.get("report") or {}
        doctype = report.get("ref_doctype")
    if doctype and doctype_icons and doctype in doctype_icons:
        return doctype_icons[doctype]

    # 3. Keyword on the untranslated name.
    return sprite_for_name(link_to or item.get("label"))
