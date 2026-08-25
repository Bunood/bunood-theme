# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Boot payload — deliberately minimal.

WHAT
    Adds the few values the theme's JavaScript genuinely needs at startup, via the
    ``extend_bootinfo`` hook.

WHY THIS FILE IS SHORT ON PURPOSE
    The previous version of this theme pushed a dozen ``st_*`` keys into boot —
    colours, font sizes, density, theme mode — and then used JavaScript to apply them.
    That was the wrong layer for all of them.

    Frappe emits ``app_include_js`` at the END of ``<body>``, and ``www/desk.html``
    renders a splash screen as the first child of ``<body>`` which JS only removes
    later (``desk.js:374``). So **the first paint has already happened by the time any
    boot value is readable**. Anything visual delivered through boot is guaranteed to
    flash.

    The correct layers are:

    * Anything visual  -> a CSS custom property, delivered in the compiled bundle or
                          the per-site brand stylesheet. Render-blocking, in ``<head>``,
                          therefore correct at first paint.
    * Theme light/dark -> ``User.desk_theme``, which Frappe already renders into
                          ``data-theme`` on ``<html>`` server-side (``sessions.py:182``).
                          We add nothing.
    * Everything else  -> here, but only if JS truly needs it.

    So this file carries behaviour flags and identifiers, never appearance.

See ARCHITECTURE.md sections 3 and 8.
"""

import frappe


def _boot_text(value) -> str:
    """A tenant-controlled string, made safe to serialise into ``frappe.boot``.

    WHY THIS EXISTS. ``frappe.boot`` is emitted inside a ``<script>`` element on
    the desk page. The HTML tokeniser ends that element at the first ``</script``
    followed by whitespace, ``/`` or ``>`` — *inside a JSON string or not*, because
    the tokeniser never sees the JSON. Everything after it is then parsed as HTML,
    so an injected ``<script>`` becomes a real one and executes. Frappe does not
    escape the sequence when serialising boot, so any free-text value we add to
    boot is ours to make safe.

    TWO STEPS, AND THE SECOND IS NOT REDUNDANT. ``strip_html_tags`` removes
    ``<…>`` pairs, which handles every payload seen in practice and leaves
    ordinary names untouched — ``Smith & Co`` and ``شركة بنود`` both survive
    unchanged, which ``escape_html`` would not: it would render as ``Smith &amp;
    Co`` wherever ``bunood.js`` assigns this to ``textContent``. But a lone ``<``
    with no closing ``>`` is not a pair, so ``a </script foo`` would pass straight
    through — and that terminates a script element just as surely. Dropping any
    surviving ``<`` makes the guarantee absolute rather than probable, and costs
    nothing real: ``<`` has no place in a company name or a file path.

    Returns "" for None/empty, so callers keep their ``or ""`` semantics.
    """
    from frappe.utils import strip_html_tags

    if not value:
        return ""
    return strip_html_tags(str(value)).replace("<", "")


def extend_bootinfo(bootinfo):
    """Add the theme's behaviour flags to ``frappe.boot``.

    Registered via the ``extend_bootinfo`` hook. Runs inside
    ``frappe.sessions.get()``, whose result is cached per user — so this must stay
    cheap and must not depend on request-specific state.

    Wrapped entirely in ``try``: a theme must never be able to prevent a user from
    booting the desk. On failure the client sees no ``bnd_*`` keys and every consumer
    is written to fall back to its own default.

    Args:
        bootinfo: the mutable boot payload Frappe is assembling for this user.
    """
    try:
        settings = frappe.get_cached_doc("Theme Settings")

        # RTL language set (item 7 follow-up). A pure constant — no Theme
        # Settings read, no per-user variance — so it is the cheapest thing
        # this function adds. bunood.js reads it to correct
        # frappe.utils.is_rtl(), which independently hardcodes Frappe's own
        # four-language list and is not reachable from the Python-side patch
        # in bunood_theme/i18n/rtl_patch.py (a separate runtime, a separate
        # copy of the same defect). Threaded through boot rather than
        # hand-copied into bunood.js so RTL_LANGS in setup.py stays the one
        # place this list can go stale. Same flash exemption as density and
        # layout: every consumer (toolbar, sidebar, menu, report views) is
        # built by Frappe's JS after the splash.
        from bunood_theme.setup import RTL_LANGS

        bootinfo.bnd_rtl_langs = sorted(RTL_LANGS)

        # Branding identifiers. The LOGO and FAVICON are handled natively by Frappe
        # (Website Settings / Navbar Settings feed `favicon` and `app_logo` straight
        # into the template), so they are intentionally absent here — setting them
        # from JS is what caused v1's visible flash of the Frappe icon in the tab.
        # `_boot_text`, NOT THE RAW FIELD — this was a stored XSS until v0.33.0.
        # `frappe.boot` is serialised into a `<script>` block in the desk page, and
        # a `</script` sequence inside a JSON string TERMINATES that element: the
        # remainder is then parsed as HTML, so an injected `<script>` becomes a
        # real one and runs on every desk load.
        #
        # THE DOCTYPE'S SANITISER DOES NOT STOP IT, which is the part worth
        # keeping. `_sanitize_content` runs `nh3.clean` on a Data field containing
        # `<`, which strips a bare `<script>` — but nh3 KEEPS `<a>` and its `title`
        # attribute, and attribute serialisation never escapes `<` or `>`. So
        # `<a title="</script><script>…</script>">x</a>` is stored VERBATIM by the
        # ordinary settings form, reaches this line intact, and executes. Measured
        # end-to-end in a real browser during the v0.33.0 release review, through
        # the normal `doc.save()` path and by a SYSTEM MANAGER, not only an
        # administrator. It also broke the desk outright — `frappe.boot` never
        # parsed, so nothing booted.
        #
        # Predates item 33: this is item 10's sidebar-brand value, and item 33's
        # own `app_name` seam is the sibling defect that led here.
        bootinfo.bnd_company = _boot_text(settings.get("company_name"))
        # Branding for the sidebar's brand block (item 10): logo file URL as
        # stored on Theme Settings. The favicon stays with Frappe's native
        # Website Settings handling — see the header comment above. Same treatment:
        # an Attach value is still a tenant-controlled string on its way into that
        # same script block.
        bootinfo.bnd_logo = _boot_text(settings.get("logo"))

        # Command palette kit (item 12). A user-invoked overlay is pure
        # "construction" under the flash rule — nothing paints until opened.
        # The legacy visible check is the master gate: 0 forces Original
        # (stock Ctrl+K modal) whatever the picker stored. Selects fall back
        # to the shipped default when empty; Checks only when never written.
        from bunood_theme.presets import PALETTE_DEFAULTS

        def pal(field):
            value = settings.get(field)
            return PALETTE_DEFAULTS[field] if value in (None, "") else value

        gate = settings.get("enable_command_palette")
        bootinfo.bnd_palette = {
            "style": "Original" if gate is not None and not int(gate or 0) else pal("palette_style"),
            "frecency": pal("palette_frecency"),
            "footer": pal("palette_footer"),
            "newtab": pal("palette_newtab"),
            "fallbacks": pal("palette_fallbacks"),
            "suggest": pal("palette_suggest"),
            "sigils": pal("palette_sigils"),
            # Per-user usage blob for frecency (capped server-side in
            # api.record_palette_use): {key: [count, last_used_epoch]}.
            "usage": frappe.parse_json(
                frappe.defaults.get_user_default("bnd_palette_usage") or "{}"
            ),
        }

        # Per-user density override (decision "G with C"). Density is the ONE visual
        # value allowed through boot, because it is exempt from the flash rule: every
        # element it affects (rows, controls, forms) is rendered by JS after the
        # splash, so an attribute applied from boot is applied before anything it
        # changes exists. Empty string = follow the site default, which travels in
        # the brand stylesheet instead.
        bootinfo.bnd_density = frappe.defaults.get_user_default("bnd_density") or ""

        # Desk layout (checklist item 9). Same flash exemption as density: the
        # layout attribute only hides sidebar rows and mounts bars — all elements
        # Frappe's JS builds after the splash — so boot delivery paints nothing
        # stale. Site-wide by design; per-user layouts are a possible later step.
        # bunood.js maps this label to a data-bnd-layout slug; an unknown or
        # missing value degrades to the stock desk (fails open).
        from bunood_theme.presets import CHROME_DEFAULTS, DEFAULT_DESK_LAYOUT

        bootinfo.bnd_layout = settings.get("desk_layout") or DEFAULT_DESK_LAYOUT

        # Which containers this desk mounts (component rework, slice 2c).
        #
        # WHY IT IS A SEPARATE PAYLOAD FROM bnd_layout AND NOT DERIVED FROM IT
        #     That derivation is the thing being removed. `desk_layout` used to
        #     be read at mount time and a ladder of branches decided which
        #     containers appeared; each container is its own setting now, and a
        #     layout is a preset that WRITES them. Deriving here would keep the
        #     layout deciding, one level further down, where it would be harder
        #     to see.
        #
        # Keyed by container key, not fieldname: the client thinks in
        # containers, and registry.py already owns the mapping between the two.
        # Values are ints because CSS and the mount ladder both want a yes/no,
        # and a Check reads back as None on a site whose patch has not run yet
        # — which must mean "the shipped answer", never "off".
        #
        # Same flash exemption as the layout above: every container is built by
        # Frappe's JS or ours after the splash, so a boot-delivered answer
        # paints nothing stale.
        from bunood_theme.registry import CONTAINERS

        def container(field):
            value = settings.get(field)
            return int(CHROME_DEFAULTS[field] if value in (None, "") else value)

        bootinfo.bnd_chrome = {
            c["key"]: container(c["toggle"])
            for c in CONTAINERS
            if c["toggle"] in CHROME_DEFAULTS
        }

        # The components a user must never lose every route to, as the pair of
        # selectors that answers "is there a route to this" — ours, and the
        # stock affordance ours replaced.
        #
        # WHY IT TRAVELS IN BOOT
        #     bunood.js has to answer that question at mount time, to decide
        #     whether switching a container off is honourable or would leave a
        #     desk nobody can log out of. registry.py is where `critical` is
        #     defined and the smoke suite already reads it from there; without
        #     this the desk would carry a fourth hand-written copy of the same
        #     three selectors — and "the same fact in two places" is the defect
        #     class the whole rework exists to remove. Three small strings on a
        #     payload is the cheaper side of that trade.
        from bunood_theme.registry import CRITICAL

        bootinfo.bnd_critical = [
            {"key": c["key"], "selector": c["selector"], "native": c["native"]}
            for c in CRITICAL
        ]

        # Mobile / narrow mode (item 24). What every layout collapses to below
        # Frappe's 768 boundary, applied at runtime and never persisted — see
        # registry.NARROW_CHROME. The client reads these while the viewport is
        # narrow; carrying them in boot keeps the catalogue in registry.py, the
        # one place the desk's shape is defined, rather than a copy in JS.
        from bunood_theme.registry import NARROW_CHROME, NARROW_PLACEMENT

        bootinfo.bnd_narrow_chrome = dict(NARROW_CHROME)
        bootinfo.bnd_narrow_placement = dict(NARROW_PLACEMENT)

        # Which tenants the user keeps in the phone bar (item 24 C2). Search has
        # no toggle — it is the only search on a phone, always present; these
        # three gate what joins it. The client turns a 0 into "Off" for that
        # tenant while narrow, so the toggle is a live preference, not a rebuild.
        from bunood_theme.presets import MOBILE_DEFAULTS

        def mobile(field):
            value = settings.get(field)
            return int(MOBILE_DEFAULTS[field] if value in (None, "") else value)

        bootinfo.bnd_mobile = {
            "inbox": mobile("mobile_inbox"),
            "user": mobile("mobile_user"),
            "apps": mobile("mobile_apps"),
        }

        # Sidebar style kit (item 10). One compact dict; every empty field
        # falls back to the default preset so a half-seeded site still renders
        # a coherent design instead of a mixed one. Same flash exemption: the
        # sidebar is built by Frappe's JS after the splash.
        from bunood_theme.presets import DEFAULT_SIDEBAR_PRESET, ICON_DEFAULTS, SIDEBAR_PRESETS

        preset = SIDEBAR_PRESETS[DEFAULT_SIDEBAR_PRESET]
        get = lambda f: settings.get(f) or preset.get(f)  # noqa: E731
        # Icon fields are an axis now, not sidebar-preset fields, so they fall
        # back to ICON_DEFAULTS. Their VALUES feed the sidebar/crumb payload keys
        # unchanged (item 23 kept the client contract stable across the rename).
        icon = lambda f: ICON_DEFAULTS[f] if settings.get(f) in (None, "") else settings.get(f)  # noqa: E731
        bootinfo.bnd_sidebar = {
            "preset": settings.get("sidebar_preset") or DEFAULT_SIDEBAR_PRESET,
            "placement": get("sidebar_placement"),
            "material": get("sidebar_material"),
            "glass_opacity": get("sidebar_glass_opacity"),
            "blur": get("sidebar_blur"),
            "color": get("sidebar_color"),
            # Icon fields (item 23) moved to their own axis, so they are read
            # with ICON_DEFAULTS as the fallback rather than the sidebar preset
            # — but the PAYLOAD keys stay put ("icons", "rail_button_icon",
            # "icon_source"), so bunood.js and the SCSS are untouched.
            "icons": icon("icon_style"),
            "active": get("sidebar_active_style"),
            "sections": get("sidebar_section_layout"),
            "wash": get("sidebar_hue_wash"),
            "intensity": get("sidebar_surface_intensity"),
            "menurail": get("sidebar_menu_rail"),
            "rail_trigger": get("sidebar_rail_trigger"),
            "rail_button": get("sidebar_rail_button"),
            "rail_button_shape": get("sidebar_rail_button_shape"),
            "rail_button_icon": icon("icon_rail_button"),
            "icon_source": icon("icon_source"),
            "pane_width": get("sidebar_pane_width"),
            # Checks: 0 is a real choice, so no or-fallback — absent field only.
            "apps_rail": settings.get("sidebar_apps_rail") or 0,
            "badges": get("sidebar_badges"),
            "remember": settings.get("sidebar_remember_sections") or 0,
            "scroll_fades": settings.get("sidebar_scroll_fades") or 0,
        }

        # Item 23: give every sidebar link a title-derived icon, on the server,
        # before Frappe renders the sidebar — the one place inference works in
        # Arabic (the label is translated by then; link_to is not). Rewrites
        # bootinfo.workspace_sidebar_item in place; see bunood_theme.icons.
        _apply_icon_inference(bootinfo, bootinfo.bnd_sidebar["icon_source"])

        # The global icon axes (Phase 3): weight applies to EVERY desk icon, not
        # just the sidebar, so it rides its own small payload and the client
        # stamps it on <html> as data-bnd-icon-weight. Same flash exemption.
        bootinfo.bnd_icons = {"weight": icon("icon_weight")}

        # Breadcrumb kit (item 11). Same flash exemption as the sidebar: the
        # trail is rendered by Frappe's JS after the splash, so attributes
        # applied from boot paint nothing stale. Selects fall back to the
        # shipped default when empty (a half-migrated site still renders a
        # coherent trail); Checks fall back only when the field has NEVER
        # been set — 0 is a real choice and must survive migrates.
        from bunood_theme.presets import CRUMB_DEFAULTS

        def crumb(field):
            value = settings.get(field)
            return CRUMB_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_crumbs = {
            "style": crumb("crumb_style"),
            "separator": crumb("crumb_separator"),
            # Moved to the Icons axis (item 23); payload key "icons" unchanged.
            "icons": icon("icon_crumbs"),
            "hover": crumb("crumb_hover"),
            "copy_link": crumb("crumb_copy_link"),
            "status_pill": crumb("crumb_status_pill"),
            "narrow_collapse": crumb("crumb_narrow_collapse"),
        }

        # Search placement + status bar (item 14). Same construction
        # exemption as the other chrome: both are mounted after the splash.
        from bunood_theme.presets import STATUS_DEFAULTS

        def status(field):
            value = settings.get(field)
            return STATUS_DEFAULTS[field] if value in (None, "") else value

        # ── List view kit (item 16) ─────────────────────────────────────
        # Fieldname keys, the status shape — no mirror map to keep in step
        # client-side. Selects fall back to the shipped default when empty (a
        # half-migrated site still renders coherent rows); the Check falls
        # back only when never set, because 0 is a real choice.
        #
        # The no-flash argument this payload owes the file header: list rows
        # are painted by Frappe's base_list.js AFTER boot, so an attribute set
        # from this payload is on <html> before the first row exists — there
        # is nothing stale to repaint. The list CONTAINER is server-rendered,
        # but the kit's container rules key on the same attributes, which are
        # set by bunood.js before DOMContentLoaded, ahead of first paint.
        from bunood_theme.presets import LIST_DEFAULTS

        def list_(field):
            value = settings.get(field)
            if isinstance(LIST_DEFAULTS[field], int):
                return LIST_DEFAULTS[field] if value is None else value
            return LIST_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_list = {f: list_(f) for f in LIST_DEFAULTS}

        # ── Form view kit (item 18) ─────────────────────────────────────
        # Fieldname keys, the list shape — one shape, no resolver ladder.
        # Selects fall back to the shipped default when empty; the Check
        # falls back only when never set, because 0 is a real choice.
        #
        # The no-flash argument this payload owes the file header: form
        # sections, tabs and grids are painted by Frappe's form/layout.js
        # AFTER boot, so an attribute set from this payload is on <html>
        # before the first section exists — there is nothing stale to
        # repaint. Same exemption as the list kit above.
        from bunood_theme.presets import FORM_DEFAULTS

        def form_(field):
            value = settings.get(field)
            if isinstance(FORM_DEFAULTS[field], int):
                return FORM_DEFAULTS[field] if value is None else value
            return FORM_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_form = {f: form_(f) for f in FORM_DEFAULTS}

        # ── Workspace tile surface (item 25) ────────────────────────────
        # No-flash: editor.js paints the widgets after boot, so an attribute
        # set from this payload is on <html> before the first tile exists.
        from bunood_theme.presets import WORKSPACE_DEFAULTS

        def ws_(field):
            value = settings.get(field)
            if isinstance(WORKSPACE_DEFAULTS[field], int):
                return WORKSPACE_DEFAULTS[field] if value is None else value
            return WORKSPACE_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_workspace = {f: ws_(f) for f in WORKSPACE_DEFAULTS}

        # ── Chart surface (item 25) ─────────────────────────────────────
        # One Select (chart_grid). No-flash: charts are constructed by JS well
        # after boot (frappe-charts on data load), so an attribute set from this
        # payload is on <html> before any chart exists.
        from bunood_theme.presets import CHART_DEFAULTS

        def chart_(field):
            value = settings.get(field)
            return CHART_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_chart = {f: chart_(f) for f in CHART_DEFAULTS}

        # ── Report / datatable surface (item 26) ────────────────────────
        # Fieldname keys, the list shape. Selects fall back to the shipped
        # default when empty; the Check falls back only when never set. No-flash:
        # frappe-datatable builds the .dt-cell nodes well after boot (on data
        # load), so an attribute set from this payload is on <html> before any
        # cell exists — nothing stale to repaint. Same exemption as every kit.
        from bunood_theme.presets import REPORT_DEFAULTS

        def report_(field):
            value = settings.get(field)
            if isinstance(REPORT_DEFAULTS[field], int):
                return REPORT_DEFAULTS[field] if value is None else value
            return REPORT_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_report = {f: report_(f) for f in REPORT_DEFAULTS}

        # ── Alternate views surface (item 27) ───────────────────────────
        # Fieldname keys, the list shape. Selects fall back to the shipped
        # default when empty; the Check (views_reveal) falls back only when
        # never set. No-flash: kanban/calendar/gantt/gallery are all built by JS
        # on route entry (their view classes render into .result well after
        # boot), so an attribute set from this payload is on <html> before any
        # card, chip, bar or tile exists — nothing stale to repaint.
        from bunood_theme.presets import VIEWS_DEFAULTS

        def views_(field):
            value = settings.get(field)
            if isinstance(VIEWS_DEFAULTS[field], int):
                return VIEWS_DEFAULTS[field] if value is None else value
            return VIEWS_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_views = {f: views_(f) for f in VIEWS_DEFAULTS}

        # ── Overlays surface (item 28) ──────────────────────────────────
        # Fieldname keys, the list shape. No Check in this kit, so every field
        # is a Select and falls back to the shipped default when empty.
        # No-flash: every overlay is built by JS on a gesture (a dialog, a
        # menu, a toast), all long after boot, so an attribute set from this
        # payload is on <html> before any of them exists.
        from bunood_theme.presets import OVERLAY_DEFAULTS

        def overlay_(field):
            value = settings.get(field)
            return OVERLAY_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_overlay = {f: overlay_(f) for f in OVERLAY_DEFAULTS}

        # ── Empty states surface (item 29) ──────────────────────────────
        # Fieldname keys, the list shape. No Check in this kit, so every field
        # is a Select and falls back to the shipped default when empty.
        # No-flash: an empty state is rendered by the view classes on route
        # entry, long after boot, so an attribute set from this payload is on
        # <html> before any of them exists.
        from bunood_theme.presets import EMPTY_DEFAULTS

        def empty_(field):
            value = settings.get(field)
            return EMPTY_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_empty = {f: empty_(f) for f in EMPTY_DEFAULTS}

        # ── Loading states surface (item 30) ────────────────────────────
        # Fieldname keys, the list shape. No Check in this kit.
        # No-flash matters MORE here than for any other kit: a skeleton is the
        # first thing a route paints, so the attribute must be on <html> before
        # the view classes build anything. This payload is read at parse time.
        from bunood_theme.presets import SKELETON_DEFAULTS

        def skeleton_(field):
            value = settings.get(field)
            return SKELETON_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_skeleton = {f: skeleton_(f) for f in SKELETON_DEFAULTS}

        # ── Filters surface (item 31) ───────────────────────────────────
        # Fieldname keys, the list shape. No Check in this kit.
        # No-flash: the filter strip is built by base_list.js during
        # setup_main_section(), i.e. on route entry, so the attribute must be
        # on <html> before the first navigation paints or the strip flashes
        # stock on every route change. This payload is read at parse time.
        from bunood_theme.presets import FILTERS_DEFAULTS

        def filters_(field):
            value = settings.get(field)
            return FILTERS_DEFAULTS[field] if value in (None, "") else value

        bootinfo.bnd_filters = {f: filters_(f) for f in FILTERS_DEFAULTS}

        bootinfo.bnd_status = {f: status(f) for f in STATUS_DEFAULTS}
        # Whether this user may see the System-Manager-only signals (job
        # counts, scheduler state). Decided SERVER-side: the client must
        # never probe an endpoint it is not allowed to call just to discover
        # that it cannot. The error count is deliberately NOT gated on this —
        # Error Log read is grantable to other roles, and api.py already
        # omits the count for anyone without it.
        bootinfo.bnd_status["privileged"] = int(
            "System Manager" in frappe.get_roles() or frappe.session.user == "Administrator"
        )

        # Notification centre kit (item 13). Same construction exemption as
        # the palette: the panel is user-invoked, so nothing paints until it
        # opens. The unread COUNT rides along so the badge can render on the
        # first paint after boot instead of after a round trip — Frappe's own
        # badge machinery is dead in this version (the selectors it toggles
        # exist in no template), so the theme owns this affordance entirely.
        from bunood_theme.presets import INBOX_DEFAULTS

        def inbox(field):
            value = settings.get(field)
            return INBOX_DEFAULTS[field] if value in (None, "") else value

        # Placement rides in the same dict as the rest of the kit, not in a
        # new one: the client reads a flat blob per kit, and a second payload
        # for "where" would be a second thing to keep in step with "what".
        from bunood_theme.presets import LINKS_DEFAULTS, USER_DEFAULTS

        from bunood_theme.registry import default_desk_order

        bootinfo.bnd_placement = {
            "inbox": inbox("inbox_placement"),
            "user": (settings.get("user_placement") or USER_DEFAULTS["user_placement"]),
            # Home and All Apps place themselves now; they used to ride the
            # sidebar style kit as one shared field.
            "home": (settings.get("home_placement") or LINKS_DEFAULTS["home_placement"]),
            "apps": (settings.get("apps_placement") or LINKS_DEFAULTS["apps_placement"]),
            # E3: the desk order the tenants sort by when they share a zone.
            # Same payload as the placements because it is the same fact —
            # where things sit — split across two keys would be two things to
            # keep in step.
            "order": settings.get("desk_order") or default_desk_order(),
        }

        bootinfo.bnd_inbox = {
            "style": inbox("inbox_style"),
            "badge": inbox("inbox_badge"),
            "arrival": inbox("inbox_arrival"),
            "group": inbox("inbox_group"),
            "chips": inbox("inbox_chips"),
            "row_actions": inbox("inbox_row_actions"),
            "keyboard": inbox("inbox_keyboard"),
            "unread": 0,
            "action": 0,
            "done": [],
        }
        try:
            from bunood_theme.api import INBOX_ACTION_TYPES

            unread_filters = {"for_user": frappe.session.user, "read": 0}
            bootinfo.bnd_inbox["unread"] = frappe.db.count("Notification Log", unread_filters)
            # The "Action Count" badge mode needs this typed count at BOOT,
            # not after the first panel open — otherwise the badge renders a
            # bare dot until something fetches, which is what shipped as an
            # unusable mode (release review v0.8.0..HEAD).
            bootinfo.bnd_inbox["action"] = frappe.db.count(
                "Notification Log",
                dict(unread_filters, type=["in", list(INBOX_ACTION_TYPES)]),
            )
            # "Done" is ours: Notification Log grants role All no write
            # permission and ships no mark-as-unread endpoint, and adding a
            # custom field to a core doctype would outlive this theme. Per
            # user, in frappe.defaults, capped in api.mark_inbox_done.
            bootinfo.bnd_inbox["done"] = frappe.parse_json(
                frappe.defaults.get_user_default("bnd_inbox_done") or "[]"
            )
        except Exception:
            # A missing table pre-migrate must not cost the user their boot.
            pass

        # Per-user preset override (the "personalize" layer): a user-chosen
        # preset REPLACES the style values wholesale — never a field-level
        # merge, so a user always sees a designed combination. Stored in
        # frappe.defaults like density; empty = follow the site.
        user_preset = frappe.defaults.get_user_default("bnd_sidebar_preset") or ""
        if user_preset and user_preset in SIDEBAR_PRESETS:
            chosen = SIDEBAR_PRESETS[user_preset]
            key_map = {
                "sidebar_placement": "placement",
                "sidebar_material": "material",
                "sidebar_glass_opacity": "glass_opacity",
                "sidebar_blur": "blur",
                "sidebar_color": "color",
                # Icon fields left this map with item 23: a per-user SIDEBAR
                # preset no longer reaches across and rewrites the Icons axis
                # (the whole point of moving them out).
                "sidebar_active_style": "active",
                "sidebar_section_layout": "sections",
                "sidebar_hue_wash": "wash",
                "sidebar_surface_intensity": "intensity",
                "sidebar_menu_rail": "menurail",
                "sidebar_rail_trigger": "rail_trigger",
                "sidebar_rail_button": "rail_button",
                "sidebar_rail_button_shape": "rail_button_shape",
                "sidebar_pane_width": "pane_width",
                "sidebar_apps_rail": "apps_rail",
                "sidebar_badges": "badges",
                "sidebar_remember_sections": "remember",
                "sidebar_scroll_fades": "scroll_fades",
            }
            for field, key in key_map.items():
                if field in chosen:
                    bootinfo.bnd_sidebar[key] = chosen[field]
        bootinfo.bnd_sidebar["user_preset"] = user_preset

    except Exception:
        # A missing DocType (pre-migrate) or a locked table must not break boot.
        frappe.log_error("bunood_theme.boot.extend_bootinfo failed")


def _apply_icon_inference(bootinfo, source):
    """Rewrite each sidebar link's icon to a title-derived sprite id.

    WHY HERE, AND WHY IT IS SAFE
        Frappe builds ``bootinfo.workspace_sidebar_item`` in ``load_desktop_data``,
        which runs BEFORE this hook (``frappe/sessions.py`` calls ``extend_bootinfo``
        after ``get_bootinfo``), so every link is present to rewrite. Frappe's own
        sidebar template then draws our ``item.icon`` natively — no DOM is touched,
        and the change cannot flash because it is in the payload the first render
        reads. Guarded and swallowed like the rest of this file: a failure degrades
        the icons, never the boot.

    THE MODE, from the Icon Source setting:
        * ``Original`` — leave every icon as Frappe shipped it.
        * ``Letters``  — clear icons so Frappe renders no glyph and the client draws
                         a letter chip (kept client-side: the letter is the display
                         language's first character, correct only after translation).
        * anything else (``Smart``) — infer from the untranslated ``link_to``,
                         OVERRIDING what the record held wherever we have a better
                         idea, and leaving it untouched where we do not.

    Args:
        bootinfo: the boot payload; its ``workspace_sidebar_item`` is rewritten.
        source: the Icon Source label (``"Smart"`` / ``"Original"`` / ``"Letters"``).
    """
    mode = (source or "").strip().lower()
    if mode == "original":
        return
    sidebars = getattr(bootinfo, "workspace_sidebar_item", None)
    if not isinstance(sidebars, dict):
        return
    try:
        from bunood_theme import icons
        from bunood_theme.api import get_doctype_icon_map

        letters = mode == "letters"
        doctype_icons = {} if letters else get_doctype_icon_map()
        for sidebar in sidebars.values():
            for item in (sidebar or {}).get("items") or []:
                if not isinstance(item, dict) or item.get("type") != "Link":
                    continue
                if letters:
                    # No <use> renders; the client's letter fallback fills it.
                    item["icon"] = None
                    continue
                symbol = icons.icon_for_item(item, doctype_icons)
                if symbol:
                    # item.icon is a BARE name — frappe.utils.icon() prefixes
                    # "#icon-"; an es-* id is left whole (it renders those as-is).
                    item["icon"] = symbol[5:] if symbol.startswith("icon-") else symbol
    except Exception:
        frappe.log_error("bunood_theme.boot._apply_icon_inference failed")
