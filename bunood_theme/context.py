# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Desk context augmentation — this file is why the theme has no ``www/`` directory.

WHAT
    A single ``update_website_context`` hook handler that mutates the already-built
    desk render context: it appends the per-site brand stylesheet and resolves
    Frappe's ``"Automatic"`` theme value into a concrete one.

WHY THIS EXISTS
    To put a stylesheet into the desk ``<head>`` before first paint, the previous
    version of this theme shadowed ``frappe/www/desk.html``. That template has no
    Jinja ``{% block %}`` tags, so shadowing means copying all 77 lines and being
    frozen at that revision. Worse, ``TemplatePage.set_pymodule()`` resolves the
    colocated ``.py`` from *the app that supplied the template*, so the fork also
    forced shipping a ``www/desk.py`` — and that shim omitted Frappe's module-level
    ``no_cache = 1``, leaving ``@cache_html`` one refactor away from caching
    ``frappe.boot`` across users.

    ``update_website_context`` removes the whole problem. Verified call path:

        PathResolver.resolve()                      -> TemplatePage("desk")
        TemplatePage.get_html()   -> update_context()   -> frappe/www/desk.py::get_context
                                  -> post_process_context()
                                       -> BaseTemplatePage.update_website_context()   <-- us
                                  -> render_template()

    (``website/page_renderers/base_template_page.py:32``.) We therefore see a fully
    populated context — ``app_include_css``, ``app_include_js``, ``desk_theme``,
    ``boot`` — and can change it before render, without owning the template.

CONSTRAINTS THAT SHAPE THIS FILE
    * The hook fires for EVERY website request: portal pages, ``/login``, error
      pages. It must therefore guard on ``context.template`` and do nothing
      otherwise.
    * It runs inside the website router. An uncaught exception here takes down every
      page on the site, not just the desk. Every branch is wrapped.
    * It runs on every desk request (``frappe/www/desk.py`` sets ``no_cache``, so
      ``@cache_html`` never serves a cached desk page). Keep the work to cached reads.

See ARCHITECTURE.md sections 4, 5 and 3.
"""

import frappe

#: The only template we touch. Frappe's ``PathResolver`` hardcodes ``TemplatePage("desk")``
#: for ``/desk`` and ``/app/*``, and the context carries the template path, so this is a
#: reliable discriminator.
DESK_TEMPLATE = "www/desk.html"

#: ``User.desk_theme`` is a Literal["Light", "Dark", "Automatic"]. Frappe renders it
#: verbatim into ``data-theme``, and ships no ``prefers-color-scheme`` rules, so
#: ``"automatic"`` matches neither its light nor its dark block. We keep the value (the
#: CSS has an explicit ``html[data-theme="automatic"]`` media block) but the constant is
#: named here so the reason is discoverable.
AUTOMATIC = "Automatic"


def desk_context(context):
    """Append the per-site brand stylesheet to the desk's ``<head>``.

    Registered via the ``update_website_context`` hook in ``hooks.py``.

    Returns ``None`` always. Frappe merges a returned dict into the context, but we
    mutate ``context`` in place instead — the keys we touch already exist, and
    returning a partial dict risks clobbering sibling keys if Frappe's merge
    semantics ever change.

    Args:
        context: the live render context for this request. Mutated in place.
    """
    try:
        # Guard first and cheaply: this hook is called for every portal page and
        # /login too, and none of them should pay for the lookup below.
        if context.get("template") != DESK_TEMPLATE:
            return

        _append_brand_css(context)
        _correct_layout_direction(context)

    except Exception:
        # Never break the website router. A missing brand sheet degrades to the
        # compiled bundle's built-in defaults, which are complete by design.
        frappe.log_error("bunood_theme.context.desk_context failed")


def _append_brand_css(context):
    """Add the hashed per-site brand stylesheet URL to ``app_include_css``.

    The URL is stored on the Theme Settings singleton by
    :func:`bunood_theme.brand.write_brand_css`, which regenerates it on save and on
    migrate. It points at ``/files/bunood/brand_<hash8>.css`` — a real file under the
    site's own ``public/files``, so nginx serves it with no Python on the critical
    path.

    Appended LAST so it wins ties against the compiled bundle. That is safe because
    the brand sheet only ever sets ``--bnd-*`` tokens, never Frappe's own variable
    names — see ARCHITECTURE.md section 1 for why writing Frappe's names at ``:root``
    would silently break dark mode.
    """
    url = frappe.get_cached_value("Theme Settings", "Theme Settings", "brand_css_url")

    # SELF-HEAL BEFORE SERVING. The URL is derived state, and derived state can
    # be restored without the file it derives from: a database-only restore
    # (the smoke suite and the settings sweep both write tabSingles back raw)
    # leaves `brand_css_url` pointing at a hash whose file a later save had
    # reaped. Serving that URL hands every desk a 404-as-HTML stylesheet and
    # the brand colours are simply gone — measured 2026-08-08 as the stale
    # brand CSS console error the suite had been allowlisting. One stat per
    # desk render is the price of never doing that; on the happy path it is
    # the only cost.
    if url:
        import os

        from bunood_theme.brand import write_brand_css

        on_disk = os.path.join(frappe.get_site_path("public"), *url.lstrip("/").split("/"))
        if not os.path.exists(on_disk):
            url = write_brand_css()
    if not url:
        return

    # context.app_include_css is a list built by frappe/www/desk.py from the hooks of
    # every installed app. Copy rather than mutate: the same list object can be reused
    # across requests in some Frappe versions, and appending in place would grow it
    # unboundedly.
    context.app_include_css = [*(context.get("app_include_css") or []), url]


def _correct_layout_direction(context):
    """Overwrite ``layout_direction``, which ``desk.py`` has already computed
    WRONG for every RTL language Frappe's ``is_rtl()`` doesn't exact-match.

    This runs AFTER ``frappe/www/desk.py::get_context`` (see the call-path
    trace in the module docstring), so ``context["layout_direction"]``
    already holds Frappe's verdict — this replaces it with
    :func:`bunood_theme.setup.is_rtl`'s. Safe to do alone, unlike a naive
    "just flip dir": ``bunood_theme.i18n.rtl_patch`` closes the matching
    half — which CSS bundle ``bundled_asset()`` serves — at app load, so the
    two never disagree. See that module for the full reasoning and its
    documented gap (print preview, PDF generation).
    """
    from bunood_theme.setup import is_rtl

    context.layout_direction = "rtl" if is_rtl() else "ltr"
