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

        # Behaviour flags, not appearance. Each is an int because the client only ever
        # tests truthiness and Frappe's Check fields arrive as 0/1.
        bootinfo.bnd_palette = int(settings.get("enable_command_palette") or 0)

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

    except Exception:
        # A missing DocType (pre-migrate) or a locked table must not break boot.
        frappe.log_error("bunood_theme.boot.extend_bootinfo failed")
