# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Render-context augmentation — this file is why the theme has no ``www/`` directory.

WHAT
    A single ``update_website_context`` hook handler that mutates already-built render
    contexts. It answers for TWO surfaces and returns for everything else:

    * **the desk** (``www/desk.html``) — appends the per-site brand stylesheet and
      corrects ``layout_direction`` for the RTL languages Frappe's ``is_rtl()`` misses.
    * **the auth routes** (``/login``, ``/update-password``) — item 32. Sets the
      ``body_class`` that ``web/login.scss`` scopes to, puts the brand sheet on
      ``web_include_css``, and replaces Frappe's app logo with Theme Settings'.

    The second one is the whole delivery mechanism for a surface kit that is not on
    the desk: there is no ``frappe.boot`` on a website page and no ``bunood.js``, so a
    server-rendered class on ``<body>`` is the only anchor that is correct at first
    paint. See ``public/scss/web/login.scss``'s header.

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

#: The two logged-out routes item 32 dresses. ``/login`` holds four ``<section>``s behind
#: hash routes (``#login``, ``#signup``, ``#forgot``, ``#login-with-email-link``) and
#: ``/update-password`` is a fifth on the same ``login.bundle.css`` — one surface, two
#: routes.
#:
#: MATCHED ON THE REQUEST PATH, NOT ``context.path``, and that is not a style choice:
#: ``BaseTemplatePage.set_missing_values()`` assigns ``context.path`` AFTER
#: ``update_website_context()`` runs (``base_template_page.py:37`` vs ``:32``), so the key
#: is empty at the only moment we can read it. Checked in the source rather than assumed,
#: because the rendered page DOES carry ``data-path="login"`` and reading that back would
#: have looked like confirmation.
AUTH_ROUTES = ("login", "update-password")

#: The scope every rule in ``web/login.scss`` hangs off. Contracts key on this class
#: alone; the anchor and the two axes add ``bnd-auth-<slug>`` beside it.
AUTH_BODY_CLASS = "bnd-auth"

#: Field value → class slug, for the anchor and both axes. ``""`` is the NEUTRAL
#: and emits no class at all, so a neutral costs no rule and cannot be
#: half-applied — the same shape as every other kit's absent ``data-bnd-*``.
#:
#: THIS IS THE ONLY COPY, which is unusual for this codebase and worth saying.
#: Every other kit carries its value→slug map in ``bunood.js`` because the desk
#: applies it client-side on click; this surface is not on the page where it is
#: chosen (an authenticated admin cannot even load ``/login`` — ``www/login.py``
#: redirects them), so there is no client-side apply and therefore no second
#: table to drift from this one.
#:
#: A MAP AND NOT A DERIVATION. ``login_style``'s values happen to lowercase into
#: their slugs, and the first cut did exactly that — but ``login_theme``'s do
#: not ("Always Dark" is not "always dark"), and one axis deriving while another
#: maps is the kind of inconsistency that reads as a bug later. One table.
AUTH_CLASSES = {
    "login_style": {"Original": "", "Panel": "panel", "Split": "split", "Plate": "plate"},
    "login_action": {"Neutral": "", "Branded": "action-branded"},
    "login_theme": {"Follow OS": "", "Always Light": "theme-light", "Always Dark": "theme-dark"},
}

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
        # Guard first and cheaply: this hook is called for EVERY website request —
        # every portal page, every error page — and none of them should pay for a
        # lookup. Two surfaces answer here now, and everything else still returns.
        if context.get("template") == DESK_TEMPLATE:
            _append_brand_css(context)
            _correct_layout_direction(context)
            return

        if _auth_route():
            _auth_context(context)

    except Exception:
        # Never break the website router. A missing brand sheet degrades to the
        # compiled bundle's built-in defaults, which are complete by design.
        frappe.log_error("bunood_theme.context.desk_context failed")


def _auth_route():
    """The auth route being rendered, or ``None``.

    Reads ``frappe.local.request.path`` because ``context.path`` is not populated
    yet — see :data:`AUTH_ROUTES`. Defensive about ``frappe.local.request``
    existing at all: this hook also runs under ``frappe.respond_as_web_page`` and
    in tests, where there may be no request object.
    """
    request = getattr(frappe.local, "request", None)
    path = (getattr(request, "path", "") or "").strip("/")
    return path if path in AUTH_ROUTES else None


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
    url = _brand_css_url()
    if not url:
        return

    # context.app_include_css is a list built by frappe/www/desk.py from the hooks of
    # every installed app. Copy rather than mutate: the same list object can be reused
    # across requests in some Frappe versions, and appending in place would grow it
    # unboundedly.
    context.app_include_css = [*(context.get("app_include_css") or []), url]


def _auth_context(context):
    """Dress ``/login`` and ``/update-password`` — item 32.

    Three things, none of which needs a template fork or a byte of JS:

    1. **The scope.** ``templates/base.html:57`` renders
       ``class="{{ body_class or '' }}"``, and ``body_class`` is an ordinary
       context key. Setting it here is what gives ``web/login.scss`` something to
       hang off, server-rendered and therefore correct at first paint. APPENDED,
       never assigned: another app or a Website Settings value may already have
       put a class there, and clobbering it would be a silent regression on a
       site we cannot see.
    2. **The brand sheet.** ``web_include_css`` is populated from hooks by
       ``website_settings.py:232`` before ``post_process_context`` runs, so it
       exists and can be appended to. Appended LAST so it wins ties against our
       compiled sheet, exactly as the desk does it — safe for the same reason:
       the brand sheet only ever declares ``--bnd-*``.
    3. **The logo.** ``www/login.py:53`` and ``www/update_password.py:12`` both
       set ``context.logo = get_app_logo()``, which reads Website Settings, then
       Navbar Settings, then the ``app_logo_url`` hook — and therefore never sees
       Theme Settings. Because this hook runs AFTER ``get_context``
       (``base_template_page.py:32``), one assignment puts the customer's mark on
       the first screen they see, on both routes, with no hook and no fork. It is
       the only seam ``www/login.html`` leaves open: its title and subtitle are
       literals in the template, which is filed upstream.
    """
    classes = (context.get("body_class") or "").split()
    if AUTH_BODY_CLASS not in classes:
        classes.append(AUTH_BODY_CLASS)

    # THE ANCHOR AND THE TWO AXES. A neutral is the ABSENCE of its class,
    # exactly as every other kit's "Original" is the absence of its `data-bnd-*`
    # attribute — so a stand-down needs no rule of its own and cannot be
    # half-applied.
    #
    # AN UNKNOWN VALUE FALLS BACK TO THE DEFAULT rather than emitting a slug
    # nothing styles. A Single can hold a value its Select no longer offers —
    # `heal_unknown_placements` exists because one such value silently failed
    # every later save of the whole document (E1) — and here the failure would
    # be quieter still: a class with no rules, i.e. a page that renders as
    # Original while the settings form says otherwise.
    from bunood_theme.presets import LOGIN_DEFAULTS

    for field, slugs in AUTH_CLASSES.items():
        value = frappe.get_cached_value("Theme Settings", "Theme Settings", field)
        if value not in slugs:
            value = LOGIN_DEFAULTS[field]
        slug = slugs[value]
        if slug and f"{AUTH_BODY_CLASS}-{slug}" not in classes:
            classes.append(f"{AUTH_BODY_CLASS}-{slug}")

    context.body_class = " ".join(classes)

    url = _brand_css_url()
    if url:
        context.web_include_css = [*(context.get("web_include_css") or []), url]

    logo = frappe.get_cached_value("Theme Settings", "Theme Settings", "logo")
    if logo:
        context.logo = logo


def _brand_css_url():
    """The per-site brand stylesheet URL, regenerated if its file has gone.

    Split out of :func:`_append_brand_css` by item 32 so the desk and the auth
    routes share one implementation — including the self-heal below, which is the
    part that would have been quietly forgotten in a second copy.
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

    return url or None


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
