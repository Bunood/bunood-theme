# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Whitelisted endpoints and version-proof wrappers around Frappe internals.

WHAT
    Every call the theme's client code makes to the server, plus every call the theme
    makes into ``frappe.desk.*``.

THE RULE THIS FILE ENFORCES
    **The client never calls a Frappe internal directly; it calls a wrapper here.**

    Frappe renames internal desk APIs between minor versions without deprecation
    shims. The verified case: ``frappe.desk.desktop.get_workspace_sidebar_items`` became
    ``get_workspaces`` somewhere between v16.20 and v16.22 — same function body, pure
    rename. The previous version of this theme called it directly and broke on half of
    v16, loudly: "Failed to get method" popups on every desk screen.

    A wrapper costs ten lines and converts a hard break into a soft one. Every function
    here that touches a Frappe internal therefore:

    1. resolves whichever name exists,
    2. logs when neither does,
    3. returns a valid EMPTY shape rather than raising.

    Returning a well-formed empty result matters more than it looks: the client can then
    render an empty state instead of a stack trace, and a theme that degrades is
    infinitely preferable to a desk that will not load.

See ARCHITECTURE.md section 10.
"""

import frappe

# ── Cache keys ──────────────────────────────────────────────────────────────────
# Namespaced so a bench-wide redis flush of our keys never touches Frappe's.
CACHE_WS_MAP = "bnd_doctype_workspace_map"
CACHE_WS_LINKS = "bnd_workspace_links::"
CACHE_ICON_MAP = "bnd_doctype_icon_map"

#: Workspaces that link to everything and therefore OWN nothing. Excluded from the
#: DocType->Workspace map: they are conveniences, not homes. Without this exclusion,
#: high-traffic doctypes get attributed to "Home" and the sidebar highlights the wrong
#: module everywhere.
LANDING_WORKSPACES = {"home", "welcome workspace"}


# ── Version-proof wrappers ──────────────────────────────────────────────────────


@frappe.whitelist()
def get_workspaces() -> dict:
    """Return the permission-filtered workspace list, whatever Frappe calls it today.

    Frappe exposes no alternative way to obtain this list, so every theme that renders
    navigation depends on this one internal — which is exactly why it is wrapped.

    Returns:
        ``{"pages": [...], "private_pages": [...]}``. Empty lists on any failure, so
        callers can always index both keys.
    """
    try:
        from frappe.desk import desktop

        fn = getattr(desktop, "get_workspaces", None) or getattr(
            desktop, "get_workspace_sidebar_items", None
        )
        if fn is None:
            frappe.log_error(
                "bunood_theme: no workspace-list method found on frappe.desk.desktop. "
                "Frappe has renamed it again; add the new name to api.get_workspaces.",
                "Bunood Theme API drift",
            )
            return {"pages": [], "private_pages": []}
        return fn()
    except Exception:
        frappe.log_error("bunood_theme.api.get_workspaces failed")
        return {"pages": [], "private_pages": []}


# ── DocType -> Workspace ownership ──────────────────────────────────────────────


@frappe.whitelist()
def get_doctype_workspace_map() -> dict:
    """Map every DocType to the workspace that owns it. Cached for an hour.

    WHY THIS EXISTS
        Frappe lights its sidebar only on a workspace *route*. Open any List or Form and
        the sidebar goes blank and the breadcrumb collapses to just the DocType name.
        This map is what lets the theme answer "where am I?" — keep the owning module
        highlighted, and render ``Home > Selling > SINV-0041``.

    Site-wide rather than per-user because workspace contents are not user-specific;
    invalidated by :func:`clear_workspace_cache` on any Workspace change.
    """
    try:
        cached = frappe.cache().get_value(CACHE_WS_MAP)
        if cached:
            return cached
        mapping = _build_doctype_workspace_map()
        frappe.cache().set_value(CACHE_WS_MAP, mapping, expires_in_sec=3600)
        return mapping
    except Exception:
        frappe.log_error("bunood_theme.api.get_doctype_workspace_map failed")
        return {}


def _build_doctype_workspace_map() -> dict:
    """Build ``{doctype: workspace_name}`` by merging three sources, weakest first.

    Frappe has no canonical source for DocType ownership, so this reconstructs it.
    Each pass overwrites the previous, and each is independently guarded because these
    child-table schemas shift between v16 minors — one failing pass should degrade the
    map, not empty it.

    Pass order (this is the hard-won part, do not reorder):

    1. **Module inheritance** — weakest. Every DocType inherits its module's public
       workspace. Broad but coarse.
    2. **Workspace Shortcut** rows — a handful of convenience pointers.
    3. **Workspace Link** rows — STRONGEST. The curated contents of a topic workspace.

    Why links must outrank shortcuts: shortcuts cluster on landing pages, so trusting
    them more attributed Sales Invoice, Customer *and* Item all to "Home". The
    resulting map looks plausible and is wrong on the highest-traffic doctypes.
    """
    mapping: dict[str, str] = {}

    # Pass 1 — module inheritance.
    try:
        ws_by_module: dict[str, str] = {}
        for ws in frappe.get_all("Workspace", fields=["name", "module", "public"]):
            if ws.get("module") and ws.get("public") and ws["module"] not in ws_by_module:
                ws_by_module[ws["module"]] = ws["name"]
        if ws_by_module:
            for dt in frappe.get_all(
                "DocType", filters={"istable": 0, "issingle": 0}, fields=["name", "module"]
            ):
                owner = ws_by_module.get(dt.get("module"))
                if owner:
                    mapping[dt["name"]] = owner
    except Exception:
        frappe.log_error("bunood_theme: module->workspace pass failed")

    # Passes 2 and 3 share their shape, so they share a helper.
    for doctype, type_field in (("Workspace Shortcut", "type"), ("Workspace Link", "link_type")):
        try:
            for row in frappe.get_all(
                doctype, filters={type_field: "DocType"}, fields=["link_to", "parent"]
            ):
                parent = (row.get("parent") or "").strip()
                if not row.get("link_to") or not parent:
                    continue
                if parent.lower() in LANDING_WORKSPACES:
                    continue
                mapping[row["link_to"]] = parent
        except Exception:
            frappe.log_error(f"bunood_theme: {doctype} pass failed")

    return mapping


def get_doctype_icon_map() -> dict:
    """Map every DocType that carries an icon to a verified sprite id. Cached an hour.

    WHY THIS EXISTS
        A DocType's own ``icon`` (168 of them carry one) is the highest-precision,
        language-independent signal for the icon the theme's inference should draw
        on a sidebar link to that doctype — better than a keyword guess. It is the
        one inference signal not already in ``frappe.boot``, so it is read here and
        handed to :func:`bunood_theme.icons.icon_for_item`.

    Site-wide, not per-user; invalidated by :func:`clear_icon_cache` on any DocType
    change. Values are resolved through ``icons.sprite_for_fa`` so every entry is a
    sprite id verified to exist — a wrong id renders an empty box.
    """
    try:
        cached = frappe.cache().get_value(CACHE_ICON_MAP)
        if cached is not None:
            return cached
        mapping = _build_doctype_icon_map()
        frappe.cache().set_value(CACHE_ICON_MAP, mapping, expires_in_sec=3600)
        return mapping
    except Exception:
        frappe.log_error("bunood_theme.api.get_doctype_icon_map failed")
        return {}


def _sprite_ids() -> set:
    """The set of sprite ids the shipped icon sets actually contain, read once
    from the committed manifest (`bunood_theme/data/sprite_ids.json`). This is the
    guard that stops the doctype-icon map from trusting a `DocType.icon` value that
    names a symbol which does not exist — ERPNext stores plenty (`icon-usd`,
    `icon-magic`, ...), and each would render an empty box. Cached on the module so
    the file is read at most once per worker."""
    global _SPRITE_IDS
    if _SPRITE_IDS is None:
        import json
        import os

        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sprite_ids.json")
        try:
            with open(path, encoding="utf-8") as fh:
                _SPRITE_IDS = set(json.load(fh).get("ids") or [])
        except Exception:
            frappe.log_error("bunood_theme: sprite id manifest unreadable")
            _SPRITE_IDS = set()
    return _SPRITE_IDS


_SPRITE_IDS = None


def _build_doctype_icon_map() -> dict:
    """``{doctype: sprite_id}`` from each DocType's ``icon`` field.

    ERPNext stores FontAwesome classes there (``fa fa-truck``) and a few literal
    sprite ids (``icon-list``). ``icons.sprite_for_fa`` maps the FA names it knows,
    resolves an unknown ``fa fa-<x>`` as ``icon-<x>`` only when that id EXISTS, and
    passes a literal ``icon-*`` through only when it exists — the existence set
    (`_sprite_ids`) is what keeps ``icon-usd`` and friends out. An icon it cannot
    verify yields None, leaving that doctype to the keyword pass, which is both
    verified and often better than the record's stray FA choice.
    """
    from bunood_theme import icons

    ids = _sprite_ids()
    out: dict[str, str] = {}
    try:
        for dt in frappe.get_all(
            "DocType", filters={"istable": 0}, fields=["name", "icon"]
        ):
            symbol = icons.sprite_for_fa(dt.get("icon"), ids)
            if symbol:
                out[dt["name"]] = symbol
    except Exception:
        frappe.log_error("bunood_theme: doctype icon map pass failed")
    return out


def clear_icon_cache(doc=None, method=None) -> None:
    """``doc_events`` handler — drop the cached DocType→icon map when a DocType
    changes. Silent on failure: a stale icon map is cosmetic, and raising here
    would block the user's save."""
    try:
        frappe.cache().delete_value(CACHE_ICON_MAP)
    except Exception:
        pass


@frappe.whitelist()
def get_workspace_links(workspace: str) -> list:
    """Return one workspace's links grouped into its own Card Break sections.

    Reuses ERPNext's existing grouping rather than inventing a taxonomy: the Stock
    workspace alone ships 72 links already split across sections like "Stock
    Transactions" and "Settings". Reading that structure means a newly installed app
    appears correctly with no change to this theme.

    Args:
        workspace: the Workspace name.

    Returns:
        ``[{"title": str, "items": [{"label", "link_to", "link_type"}]}]``, or ``[]``.
    """
    if not workspace:
        return []
    try:
        key = CACHE_WS_LINKS + str(workspace)
        cached = frappe.cache().get_value(key)
        if cached is not None:
            return cached

        rows = frappe.get_all(
            "Workspace Link",
            filters={"parent": workspace},
            fields=["type", "label", "link_to", "link_type", "hidden"],
            order_by="idx asc",
        )

        sections: list[dict] = []
        current: dict = {"title": "", "items": []}
        for r in rows:
            if r.get("hidden"):
                continue
            # A Card Break starts a new section. Links before the first break belong to
            # an untitled leading group, which the client labels generically.
            if r.get("type") == "Card Break":
                if current["items"]:
                    sections.append(current)
                current = {"title": r.get("label") or "", "items": []}
                continue
            if not r.get("link_to"):
                continue
            current["items"].append(
                {
                    "label": r.get("label") or r.get("link_to"),
                    "link_to": r.get("link_to"),
                    "link_type": r.get("link_type") or "DocType",
                }
            )
        if current["items"]:
            sections.append(current)

        frappe.cache().set_value(key, sections, expires_in_sec=3600)
        return sections
    except Exception:
        frappe.log_error("bunood_theme.api.get_workspace_links failed")
        return []


DENSITY_VALUES = ("", "Comfortable", "Compact")
"""Valid per-user density choices. Empty string means "follow the site default" —
a real state, not an absence: it is what lets an admin change the default and have
every undecided user follow along."""


@frappe.whitelist()
def set_user_density(density: str = "") -> dict:
    """Persist the current user's density override.

    Stored in ``frappe.defaults`` (per-user server-side storage) rather than
    localStorage — deliberately. The v1 theme kept per-user prefs client-side and the
    result was per-BROWSER preferences that reset on every new machine. User defaults
    ride into boot for free, so the attribute can be applied before first desk render
    with no extra request.

    Not stored on the User doctype: adding custom fields to core doctypes from a theme
    creates migration coupling that outlives the theme.

    Args:
        density: one of :data:`DENSITY_VALUES`. Empty clears the override.

    Returns:
        ``{"density": <stored value>}`` for the client to apply immediately.
    """
    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    if density not in DENSITY_VALUES:
        frappe.throw(f"Invalid density: {density!r}")

    if density:
        frappe.defaults.set_user_default("bnd_density", density)
    else:
        frappe.defaults.clear_default("bnd_density", parent=frappe.session.user)
    # Boot is cached per user; drop it so the next full load sees the new value.
    frappe.cache.hdel("bootinfo", frappe.session.user)
    return {"density": density}


@frappe.whitelist()
def get_sidebar_presets() -> dict:
    """Hand the sidebar preset catalogue to the Theme Settings picker.

    The picker applies a preset by writing its values into the (hidden) style
    fields — the values are the canon, the preset name is a label; see
    :mod:`bunood_theme.presets`.

    Returns:
        ``{"presets": {...}, "fields": [...], "default": str}``.
    """
    from bunood_theme.presets import DEFAULT_SIDEBAR_PRESET, SIDEBAR_FIELDS, SIDEBAR_PRESETS

    return {
        "presets": SIDEBAR_PRESETS,
        "fields": SIDEBAR_FIELDS,
        "default": DEFAULT_SIDEBAR_PRESET,
    }


@frappe.whitelist()
def set_user_sidebar_preset(preset: str = "") -> dict:
    """Persist the current user's sidebar preset override.

    The "personalize" layer: a user picks a whole PRESET (never individual
    options — users always land on designed combinations; option-level
    freedom is the tenant admin's). Empty clears the override and the user
    follows the site's configuration again. Stored in ``frappe.defaults`` for
    the same reasons as density — rides into boot, never localStorage.

    Args:
        preset: a name from :data:`bunood_theme.presets.SIDEBAR_PRESETS`, or
            empty for "follow the site".

    Returns:
        ``{"preset": <stored value>}``.
    """
    from bunood_theme.presets import SIDEBAR_PRESETS

    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    if preset and preset not in SIDEBAR_PRESETS:
        frappe.throw(f"Unknown sidebar preset: {preset!r}")

    if preset:
        frappe.defaults.set_user_default("bnd_sidebar_preset", preset)
    else:
        frappe.defaults.clear_default("bnd_sidebar_preset", parent=frappe.session.user)
    frappe.cache.hdel("bootinfo", frappe.session.user)
    return {"preset": preset}


@frappe.whitelist()
def get_sidebar_counts(labels=None) -> dict:
    """Batched record counts for the sidebar's badge feature.

    The client sends the visible link labels; anything that is not the exact
    name of a countable, readable DocType is silently skipped — sidebar links
    can point at pages, reports or dashboards, and a badge simply does not
    apply to those. One request per sidebar build, capped, never raising:
    badges are decoration.

    Args:
        labels: JSON list of link labels (the client caps at 40).

    Returns:
        ``{label: int}`` for the labels that resolved to DocTypes.
    """
    import json

    if frappe.session.user in ("Guest", None, ""):
        return {}
    if isinstance(labels, str):
        try:
            labels = json.loads(labels)
        except ValueError:
            return {}
    if not isinstance(labels, list):
        return {}

    counts: dict[str, int] = {}
    for label in labels[:40]:
        try:
            if not isinstance(label, str) or not frappe.db.exists("DocType", label):
                continue
            meta = frappe.get_meta(label)
            if meta.istable or meta.issingle:
                continue
            if not frappe.has_permission(label, "read"):
                continue
            counts[label] = frappe.db.count(label)
        except Exception:
            continue  # one bad label must not cost the rest their badges
    return counts


def clear_workspace_cache(doc=None, method=None) -> None:
    """``doc_events`` handler — drop cached workspace data when a Workspace changes.

    Registered on Workspace ``on_update`` and ``after_delete``. Without this, an edited
    workspace keeps serving a stale sidebar for up to an hour.

    Deliberately silent on failure: a stale cache is a cosmetic problem, and raising
    here would block the user's save.
    """
    try:
        frappe.cache().delete_value(CACHE_WS_MAP)
    except Exception:
        pass
    try:
        name = getattr(doc, "name", None) if doc else None
        if name:
            frappe.cache().delete_value(CACHE_WS_LINKS + str(name))
        else:
            # delete_keys is absent on some redis wrappers; the per-workspace entries
            # expire on their own within the hour, so this is best-effort.
            frappe.cache().delete_keys(CACHE_WS_LINKS + "*")
    except Exception:
        pass


#: Frecency store size cap. 100 entries covers months of an accountant's
#: habits; past it the coldest entries are pruned so the boot payload and the
#: per-use write stay small forever.
PALETTE_USAGE_CAP = 100


@frappe.whitelist()
def record_palette_use(keys=None) -> dict:
    """Record a BATCH of palette executions for the user's frecency ranking.

    Stored in ``frappe.defaults`` (per-user, server-side) for the same reason
    density is — localStorage would make ranking per-BROWSER, and item 31's
    rule forbids a parallel client-side preference store. The blob is
    ``{key: [count, last_used_epoch]}``, capped at
    :data:`PALETTE_USAGE_CAP` by evicting the entries with the oldest
    last-use.

    BATCHED BY CONTRACT: ``frappe.defaults.set_default`` clears the user's
    ENTIRE cache — including the cached boot — on every write (verified
    during the v0.8.0 release review), so the client throttles flushes to
    one every ~90s and this endpoint takes a list. In-session ranking never
    depends on these writes; the client merges uses in memory immediately.

    Args:
        keys: JSON array (or list) of option identities, e.g.
            ``["route:List/Item", "label:New Item"]``. Opaque strings,
            length- and count-capped.

    Returns:
        ``{"ok": True, "recorded": <count>}``.
    """
    import time

    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    if isinstance(keys, str):
        try:
            keys = frappe.parse_json(keys)
        except Exception:
            keys = None
    if not isinstance(keys, list) or not keys:
        return {"ok": False, "recorded": 0}
    keys = [str(k)[:140] for k in keys[:50] if k]

    try:
        usage = frappe.parse_json(frappe.defaults.get_user_default("bnd_palette_usage") or "{}")
        if not isinstance(usage, dict):
            usage = {}
    except Exception:
        usage = {}

    now = int(time.time())
    for key in keys:
        count = (usage.get(key) or [0, 0])[0]
        usage[key] = [count + 1, now]
    if len(usage) > PALETTE_USAGE_CAP:
        for cold in sorted(usage, key=lambda k: usage[k][1])[: len(usage) - PALETTE_USAGE_CAP]:
            usage.pop(cold, None)
    frappe.defaults.set_user_default("bnd_palette_usage", frappe.as_json(usage, indent=None))
    return {"ok": True, "recorded": len(keys)}


@frappe.whitelist()
def reset_palette_ranking() -> dict:
    """Clear the current user's palette frecency store (the picker's valve).

    Raycast ships the same escape hatch: learned ranking sometimes learns the
    wrong thing, and a reset is cheaper than fighting it.

    Returns:
        ``{"ok": True}``.
    """
    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    frappe.defaults.clear_default("bnd_palette_usage", parent=frappe.session.user)
    frappe.cache.hdel("bootinfo", frappe.session.user)
    return {"ok": True}


#: Rows per inbox page. Frappe's own dropdown is hard-capped at 20 with no
#: pagination; this endpoint pages properly via ``frappe.db.get_list``.
INBOX_PAGE_SIZE = 30

#: Cap on the per-user "done" list. Done is a triage state, not an archive:
#: past this the oldest entries drop off and those rows simply reappear as
#: ordinary read notifications.
INBOX_DONE_CAP = 400


@frappe.whitelist()
def get_inbox(start: int = 0, limit: int = 0, unread_only: int = 0, kinds: str = "") -> dict:
    """Page through the current user's notifications.

    Deliberately ``frappe.db.get_list`` rather than Frappe's own
    ``get_notification_logs``: that endpoint takes no offset, caps at 20, and
    is ``@http_cache(max_age=60)`` — a burst of arrivals can render the same
    item repeatedly from the browser cache. Notification Log's permission
    query condition scopes rows to ``for_user`` automatically, so no filter
    on the current user is needed (and none is applied here, or Administrator
    — for whom that condition returns no filter at all — would see everyone's
    notifications).

    Args:
        start: offset for paging.
        limit: page size; defaults to :data:`INBOX_PAGE_SIZE`, capped at 100.
        unread_only: 1 to return only unread rows.
        kinds: optional comma-separated Notification Log ``type`` values
            (Mention / Assignment / Share / Energy Point / Alert).

    Returns:
        ``{"rows": [...], "unread": <int>, "has_more": <bool>}``.
    """
    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    start = max(0, int(start or 0))
    limit = min(100, int(limit or INBOX_PAGE_SIZE))

    filters = {"for_user": frappe.session.user}
    if int(unread_only or 0):
        filters["read"] = 0
    kind_list = [k.strip() for k in (kinds or "").split(",") if k.strip()]
    if kind_list:
        filters["type"] = ["in", kind_list]

    rows = frappe.db.get_list(
        "Notification Log",
        fields=[
            "name", "subject", "type", "document_type", "document_name",
            "from_user", "read", "creation", "link",
        ],
        filters=filters,
        order_by="creation desc",
        limit_start=start,
        limit_page_length=limit + 1,
        ignore_permissions=False,
    )
    has_more = len(rows) > limit
    counts = get_inbox_unread()
    return {
        "rows": rows[:limit],
        "unread": counts.get("unread", 0),
        "action": counts.get("action", 0),
        "has_more": has_more,
    }


#: Notification Log types that mean "someone is waiting on you". Mirrored
#: client-side in bunood.js (INBOX_ACTION_TYPES) — the badge's "Action
#: Count" mode counts only these.
INBOX_ACTION_TYPES = ("Assignment", "Mention")


@frappe.whitelist()
def get_inbox_unread() -> dict:
    """Unread counts for the bell badge: total, and action-required only.

    A dedicated endpoint because Frappe ships none, and its client-side badge
    machinery is dead in this version — the selectors ``toggle_notification_icon``
    flips exist in no template, so nothing renders however many unread rows a
    user has. The theme owns the affordance, so it owns the count.

    ``action`` exists because the badge offers an "Action Count" mode: a
    number for what genuinely waits on you (assignments, mentions) while
    shares and system alerts stay silent. Without it that mode had no typed
    count to render and degraded to an undifferentiated dot.

    Returns:
        ``{"unread": <int>, "action": <int>}``.
    """
    if frappe.session.user in ("Guest", None, ""):
        return {"unread": 0, "action": 0}
    base = {"for_user": frappe.session.user, "read": 0}
    return {
        "unread": frappe.db.count("Notification Log", base),
        "action": frappe.db.count(
            "Notification Log", dict(base, type=["in", list(INBOX_ACTION_TYPES)])
        ),
    }


@frappe.whitelist()
def mark_inbox_done(name: str = "", undo: int = 0) -> dict:
    """Flag one notification as handled (or un-flag it), per user.

    Stored in ``frappe.defaults`` rather than on the document because
    Notification Log grants role ``All`` no write permission, ships no
    mark-as-unread endpoint, and adding a custom field to a core doctype
    creates migration coupling that outlives this theme — the same reasoning
    as density and palette frecency.

    Args:
        name: the Notification Log row name.
        undo: 1 to remove it from the done list instead.

    Returns:
        ``{"ok": True, "done": <current list length>}``.
    """
    if frappe.session.user in ("Guest", None, ""):
        frappe.throw("Not permitted")
    name = (name or "")[:140]
    if not name:
        return {"ok": False, "done": 0}

    try:
        done = frappe.parse_json(frappe.defaults.get_user_default("bnd_inbox_done") or "[]")
        if not isinstance(done, list):
            done = []
    except Exception:
        done = []

    if int(undo or 0):
        done = [d for d in done if d != name]
    elif name not in done:
        done.append(name)
    if len(done) > INBOX_DONE_CAP:
        done = done[-INBOX_DONE_CAP:]

    frappe.defaults.set_user_default("bnd_inbox_done", frappe.as_json(done, indent=None))
    return {"ok": True, "done": len(done)}


#: Job statuses worth a status-bar segment. Deliberately NARROW: RQJob's
#: count materialises every matching job id from Redis across the whole
#: BENCH before filtering to this site, so an unfiltered or "finished"
#: count is O(everything). Queued and started are bounded by real work;
#: failed is capped by RQ at 1000.
STATUS_JOB_FILTERS = (("queued", "queued"), ("started", "started"), ("failed", "failed"))


@frappe.whitelist()
def get_status_signals(want_jobs: int = 1, want_errors: int = 1, want_scheduler: int = 1) -> dict:
    """One round trip for everything the status bar shows.

    WHY ONE ENDPOINT
        The bar polls. Three separate calls would triple the request count
        for a strip that is, by design, usually silent.

    WHAT EACH SIGNAL COSTS, AND WHO MAY SEE IT
        * scheduler — ``frappe.utils.scheduler.get_scheduler_status`` is
          whitelisted with NO permission check and reads config plus a
          cached Single. Free, and safe for every user.
        * errors — via ``frappe.desk.notifications.get_notifications``,
          which SELF-GATES: it filters by what the user can read, so a
          non-System-Manager simply gets no Error Log key rather than an
          exception. Redis-cached per user.
        * jobs — System Manager only, and expensive. Gated here on the
          ROLE, never on catching a PermissionError from a probe, and
          always with a narrow status filter.

    Every signal is independently guarded: one failing source degrades to
    ``None`` (rendered as "no data", which is not the same as zero) and
    never takes the whole bar down.

    Returns:
        ``{"scheduler": "active"|"inactive"|None, "errors": int|None,
        "jobs": {"queued": int, "started": int, "failed": int}|None,
        "privileged": 0|1, "at": <epoch seconds>}``
    """
    import time

    out = {"scheduler": None, "errors": None, "jobs": None, "at": int(time.time())}
    if frappe.session.user in ("Guest", None, ""):
        out["privileged"] = 0
        return out

    privileged = "System Manager" in frappe.get_roles() or frappe.session.user == "Administrator"
    out["privileged"] = int(privileged)

    if int(want_scheduler or 0):
        try:
            from frappe.utils.scheduler import get_scheduler_status

            out["scheduler"] = (get_scheduler_status() or {}).get("status")
        except Exception:
            pass

    if int(want_errors or 0):
        try:
            from frappe.desk.notifications import get_notifications

            counts = (get_notifications() or {}).get("open_count_doctype") or {}
            # Absent key = this user may not read Error Log. That is "not
            # applicable", not zero — leave it None so the bar hides the
            # segment instead of claiming a clean system.
            if "Error Log" in counts:
                out["errors"] = int(counts["Error Log"] or 0)
        except Exception:
            pass

    if int(want_jobs or 0) and privileged:
        out["jobs"] = _count_jobs()

    return out


def _count_jobs():
    """Count queued/started/failed background jobs as cheaply as possible.

    Counts job IDS, never job objects: ``RQJob.get_list`` calls RQ's
    ``fetch_many``, which is one Redis hash read PER JOB, while
    ``get_matching_job_ids`` only walks the registries. On a busy bench
    that is the difference between a status bar and an outage.

    Version-proof per this file's rule: the private helper is resolved by
    name and the public ``get_count`` is the fallback, so an upstream
    rename degrades to a missing segment rather than a broken desk.

    Returns:
        ``{"queued": int|None, ...}`` or ``None`` when no source worked.
    """
    try:
        from frappe.core.doctype.rq_job.rq_job import RQJob
    except Exception:
        return None

    # STATIC METHODS ON THE CONTROLLER, not module functions — verified in
    # this fork (rq_job.py:89 get_matching_job_ids, :126 get_count). Both
    # resolved by name so a rename degrades to a missing segment.
    ids = getattr(RQJob, "get_matching_job_ids", None)
    counter = getattr(RQJob, "get_count", None)
    jobs = {}
    for key, status in STATUS_JOB_FILTERS:
        # FOUR-element filters — [doctype, field, operator, value]. Frappe's
        # make_filter_dict reads f[1..3] positionally, so a dict or a
        # 3-element list either raises or silently matches EVERYTHING.
        # Measured on this stack: filtered 1-12ms per status; unfiltered
        # 4,463ms, because it walks every registry for all seven statuses
        # across every queue on the bench. Never let this go unfiltered.
        flt = [["RQ Job", "status", "=", status]]
        try:
            if ids:
                jobs[key] = len(ids(flt))
            elif counter:
                jobs[key] = int(counter(flt))
            else:
                jobs[key] = None
        except Exception:
            jobs[key] = None
    if all(v is None for v in jobs.values()):
        _log_drift_once(
            "rq-job-counter",
            "bunood_theme: no usable RQ Job counter found. Frappe may have renamed "
            "get_matching_job_ids/get_count; update api._count_jobs.",
        )
        return None
    return jobs


def _log_drift_once(key: str, message: str, period: int = 3600) -> None:
    """Log an API-drift warning at most once an hour, per site.

    WHY THIS ONE IS THROTTLED AND THE OTHERS ARE NOT
        Every other drift log in this file sits on a path a user triggers by
        acting. This one sits under a POLLER: the status bar asks every 60
        seconds, per signed-in admin. Unthrottled, a single upstream rename
        would write a row a minute per admin — and since one of the signals
        counts Error Log rows, the bar would end up reporting its own noise
        back as a problem with the system.

    Cache trouble never suppresses the log: the point of the message is that
    something upstream moved, and losing it is worse than repeating it.
    """
    try:
        cache_key = f"bnd-drift-{key}"
        if frappe.cache().get_value(cache_key):
            return
        frappe.cache().set_value(cache_key, 1, expires_in_sec=period)
    except Exception:
        pass
    frappe.log_error(message, "Bunood Theme API drift")


@frappe.whitelist()
def get_shipped_defaults() -> dict:
    """What a fresh install writes, so the settings form can show what changed.

    WHY THE SERVER ANSWERS THIS
        The defaults are composed in Python from :mod:`bunood_theme.presets` —
        the sidebar preset's 22 values plus five per-kit default dicts. Any
        client-side copy is a second statement of the same fact, and this repo's
        every critical defect has traced to one. The form asks instead.

    WHY NOT BOOT
        ``boot.py`` is assembled for every user on every desk page, and this is
        needed by one System-Manager-only form. Sixty-odd keys on every page load
        to serve one screen is the wrong trade — see GUIDELINES on the payload
        budget.

    Returns:
        ``{"defaults": {fieldname: shipped_value}, "layout_chrome": {layout:
        {container: 0|1}}, "toggles": {container: fieldname}}``. Wrapped in a
        dict rather than returned bare so a later addition — the preset
        catalogues, which is exactly what ``layout_chrome`` turned out to be —
        does not change the shape of what callers already destructure.

    WHY THE LAYOUT CATALOGUE RIDES ALONG HERE
        The form has to WRITE it, not just compare against it: since slice 2c a
        layout is a preset, and picking one writes the container fields the same
        way picking a sidebar preset writes its 22. Same reason the defaults are
        served rather than hardcoded — a client-side copy of
        ``registry.LAYOUT_CHROME`` would be a second statement of the fact the
        whole rework exists to have exactly once. Same request, because a form
        that needs both and asks twice can render a moment where it has one.
    """
    from bunood_theme.registry import LAYOUT_CHROME, CONTAINERS
    from bunood_theme.setup import SHIPPED

    return {
        "defaults": dict(SHIPPED),
        "layout_chrome": LAYOUT_CHROME,
        "toggles": {c["key"]: c["toggle"] for c in CONTAINERS},
    }


@frappe.whitelist()
def email_preview() -> str:
    """Render a representative email through the REAL funnel, for the picker.

    THE FIRST KIT IN THIS PROJECT WHOSE PREVIEW IS BOTH POSSIBLE AND HONEST, and
    the two kits before it are why that sentence needs saying. The sign-in kit
    ships none because ``www/login.py:38-46`` redirects an authenticated session
    away, so the only person who can open its picker is the only one who cannot
    load the page. The website kit ships none because an "apply" there is a page
    load in a different document. Neither argument survives here: an email is
    composed on the server, contains no other user's data, and this returns the
    genuine output of ``get_formatted_html`` rather than a mock-up of it.

    Frappe 16.31 fixed the no-outgoing-account path described in
    ``docs/upstream/frappe-email.md`` §7. The preview therefore calls the real
    formatter without a synthetic Email Account; if upstream regresses, this
    endpoint stands down to an empty frame like any other render failure.

    THE SAMPLE IS FIXED AND CARRIES EVERY ELEMENT THE CONTRACTS SPEAK ABOUT — a
    heading, prose, a bold run, the CTA and a bare link. A preview that omits one
    would show an admin a clean design and hide the thing a repair was written
    for, which is the fixture defect this item already shipped once in its own
    test suite.

    Returns:
        The rendered HTML, or ``""`` on any failure — the picker draws nothing
        rather than an error, and the settings page keeps working.
    """
    # `frappe.only_for` rather than a hand-rolled check plus our own "Not
    # permitted" string. The message belongs to the framework and is already
    # translated in every locale it ships; re-stating it here would have added a
    # row to `ar.po` for a sentence this app does not own.
    frappe.only_for("System Manager")

    try:
        from frappe.email.email_body import get_formatted_html

        # COMPLETE PARAMETERISED MESSAGES, never concatenated fragments —
        # GUIDELINES §1.6. The first cut built the closing sentence out of
        # "Or see" + a link + ".", which is three fragments a translator cannot
        # reorder and which falls apart in any language that puts the verb
        # elsewhere. The document code stays OUTSIDE the string for the same
        # reason it is not translated: it is an identifier, not prose.
        body = (
            "<p>" + frappe._("Your invoice is ready.") + "</p>"
            "<p>" + frappe._("The total is {0}.").format("<b>SAR 1,240.00</b>") + "</p>"
            "<a class='btn btn-primary' href='#'>" + frappe._("View invoice") + "</a>"
            "<p>"
            + frappe._("Or see {0}.").format(
                "<a href='#'>" + frappe._("all your invoices") + "</a>"
            )
            + "</p>"
        )
        return get_formatted_html(
            frappe._("Invoice {0}").format("ACC-SINV-0042"),
            body,
            with_container=True,
        )
    except Exception:
        frappe.log_error(title="bunood_theme: email preview stood down")
        return ""


@frappe.whitelist()
def print_presets() -> dict:
    """The named print styles as compositions over the section axes — item 35.

    THE ONE COPY RULE, SERVED. ``presets.PRINT_PRESETS`` is the only statement
    of which axis values each named style writes; the picker fetches it here
    rather than mirroring it in JS, because a second copy is exactly the drift
    the derived label exists to surface ("Custom" the moment values differ —
    the ``bnd_sb_match_preset``/``LAYOUT_CHROME`` pattern, on paper). The axes
    ride along so the client derives the label from the same field list the
    server composed the table over.
    """
    frappe.only_for("System Manager")
    from bunood_theme.presets import PRINT_AXES, PRINT_PRESETS

    return {"axes": PRINT_AXES, "presets": PRINT_PRESETS}


@frappe.whitelist()
def print_preview(shape: str = "document", lang: str = "en") -> str:
    """A printed page, rendered for the picker — the THIRD honest live preview.

    Email's was the first (items 32/33 each refused one for reasons that fail
    here too); this one is MORE honest still: a real ``get_html_and_style``
    render, through the real Print Style record, of a SPECIMEN document — the
    ``?doc=`` inline-dict path the census proved, so no tenant record is ever
    read and nothing needs to exist in the DB. The ``lang`` chip is the one no
    other kit could offer: the same specimen re-rendered in Arabic, showing the
    slice-2 direction closure live where the styles are chosen.

    Returns a WHOLE document (the email preview's iframe argument — a print
    page IS one), or ``""`` on any failure: a failed preview is not a failed
    picker.
    """
    frappe.only_for("System Manager")
    try:
        import json

        shape = shape if shape in ("document", "invoice") else "document"
        lang = lang if lang in ("en", "ar") else "en"
        keep = frappe.local.lang
        frappe.local.lang = lang
        try:
            from frappe.utils.jinja_globals import bundled_asset
            from frappe.www.printview import get_html_and_style

            from bunood_theme.setup import is_rtl as _is_rtl

            frappe.local.form_dict = frappe._dict()
            if shape == "invoice" and frappe.db.exists("DocType", "Sales Invoice"):
                # An invoice-shaped specimen, because a style that reads right
                # on prose can fail on a table — the item-34 fixture lesson,
                # applied to the preview itself. Defensive on erpnext's
                # presence, like every printing/jinja.py helper.
                doc = {
                    "doctype": "Sales Invoice",
                    "name": "BND-PREVIEW-0042",
                    "customer": "Specimen Customer",
                    "customer_name": frappe._("Specimen Customer"),
                    "posting_date": "2026-08-26",
                    "due_date": "2026-09-25",
                    "currency": "SAR",
                    "company": frappe.db.get_default("company") or "Specimen Co",
                    "total": 25760.0,
                    "grand_total": 29624.0,
                    "items": [
                        {"doctype": "Sales Invoice Item", "item_name": frappe._("Site survey"),
                         "qty": 2, "rate": 1500.0, "amount": 3000.0, "idx": 1},
                        {"doctype": "Sales Invoice Item", "item_name": frappe._("Structural design"),
                         "qty": 1, "rate": 8400.0, "amount": 8400.0, "idx": 2},
                    ],
                    "taxes": [],
                }
                r = get_html_and_style(
                    doc=json.dumps(doc), print_format="Sales Invoice Standard", style="Bunood"
                )
            else:
                doc = {
                    "doctype": "ToDo",
                    "name": "BND-PREVIEW-0001",
                    "description": frappe._("A specimen task, rendered through the standard layout."),
                    "status": "Open",
                    "priority": "Medium",
                    "date": "2026-08-26",
                }
                r = get_html_and_style(doc=json.dumps(doc), style="Bunood")

            if not r or not r.get("html"):
                return ""
            direction = "rtl" if _is_rtl(lang) else "ltr"
            bundle = bundled_asset("print.bundle.css")
            return (
                f'<!DOCTYPE html><html lang="{lang}" dir="{direction}"><head>'
                f'<meta charset="utf-8"><link rel="stylesheet" href="{bundle}">'
                f'<style>{r.get("style") or ""}</style></head>'
                f'<body class="print-format-gutter">'
                f'<div class="print-format print-format-preview">{r["html"]}</div>'
                f"</body></html>"
            )
        finally:
            frappe.local.lang = keep
    except Exception:
        frappe.log_error(title="bunood_theme: print preview stood down")
        return ""
