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
