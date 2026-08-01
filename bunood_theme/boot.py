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

        # Branding identifiers. The LOGO and FAVICON are handled natively by Frappe
        # (Website Settings / Navbar Settings feed `favicon` and `app_logo` straight
        # into the template), so they are intentionally absent here — setting them
        # from JS is what caused v1's visible flash of the Frappe icon in the tab.
        bootinfo.bnd_company = settings.get("company_name") or ""
        # Branding for the sidebar's brand block (item 10): logo file URL as
        # stored on Theme Settings. The favicon stays with Frappe's native
        # Website Settings handling — see the header comment above.
        bootinfo.bnd_logo = settings.get("logo") or ""

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
        bootinfo.bnd_layout = settings.get("desk_layout") or "Top Bar"

        # Sidebar style kit (item 10). One compact dict; every empty field
        # falls back to the default preset so a half-seeded site still renders
        # a coherent design instead of a mixed one. Same flash exemption: the
        # sidebar is built by Frappe's JS after the splash.
        from bunood_theme.presets import DEFAULT_SIDEBAR_PRESET, SIDEBAR_PRESETS

        preset = SIDEBAR_PRESETS[DEFAULT_SIDEBAR_PRESET]
        get = lambda f: settings.get(f) or preset.get(f)  # noqa: E731
        bootinfo.bnd_sidebar = {
            "preset": settings.get("sidebar_preset") or DEFAULT_SIDEBAR_PRESET,
            "placement": get("sidebar_placement"),
            "material": get("sidebar_material"),
            "glass_opacity": get("sidebar_glass_opacity"),
            "blur": get("sidebar_blur"),
            "color": get("sidebar_color"),
            "icons": get("sidebar_icon_style"),
            "active": get("sidebar_active_style"),
            "sections": get("sidebar_section_layout"),
            "wash": get("sidebar_hue_wash"),
            "intensity": get("sidebar_surface_intensity"),
            "menurail": get("sidebar_menu_rail"),
            "rail_trigger": get("sidebar_rail_trigger"),
            "rail_button": get("sidebar_rail_button"),
            "rail_button_shape": get("sidebar_rail_button_shape"),
            "rail_button_icon": get("sidebar_rail_button_icon"),
            "icon_source": get("sidebar_icon_source"),
            "pane_width": get("sidebar_pane_width"),
            "quick_links": get("sidebar_quick_links"),
            # Checks: 0 is a real choice, so no or-fallback — absent field only.
            "apps_rail": settings.get("sidebar_apps_rail") or 0,
            "badges": get("sidebar_badges"),
            "remember": settings.get("sidebar_remember_sections") or 0,
            "scroll_fades": settings.get("sidebar_scroll_fades") or 0,
        }

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
            "icons": crumb("crumb_icons"),
            "hover": crumb("crumb_hover"),
            "copy_link": crumb("crumb_copy_link"),
            "status_pill": crumb("crumb_status_pill"),
            "narrow_collapse": crumb("crumb_narrow_collapse"),
        }

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
                "sidebar_icon_style": "icons",
                "sidebar_active_style": "active",
                "sidebar_section_layout": "sections",
                "sidebar_hue_wash": "wash",
                "sidebar_surface_intensity": "intensity",
                "sidebar_menu_rail": "menurail",
                "sidebar_rail_trigger": "rail_trigger",
                "sidebar_rail_button": "rail_button",
                "sidebar_rail_button_shape": "rail_button_shape",
                "sidebar_rail_button_icon": "rail_button_icon",
                "sidebar_icon_source": "icon_source",
                "sidebar_pane_width": "pane_width",
                "sidebar_quick_links": "quick_links",
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
