# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Render-context augmentation — this file is why the theme has no ``www/`` directory.

WHAT
    A single ``update_website_context`` hook handler that mutates already-built render
    contexts. It answers for THREE surfaces, and since item 33 the last of them is the
    DEFAULT rather than a fourth early return:

    * **the desk** (``www/desk.html``) — appends the per-site brand stylesheet and
      corrects ``layout_direction`` for the RTL languages Frappe's ``is_rtl()`` misses.
    * **the auth templates** (``www/login.html``, ``www/update-password.html``) —
      item 32, and note it is the TEMPLATE and not the route: a guest hitting ``/`` on a
      stock site is served the sign-in page. Sets the
      ``body_class`` that ``web/_login.scss`` scopes to, puts the brand sheet on
      ``web_include_css``, and replaces Frappe's app logo with Theme Settings'.
    * **every other website template** — item 33. Sets the ``body_class`` that the
      website half of ``web/web.scss`` scopes to. See :func:`_is_web_template` for why
      this is a denylist and why it keys on the template rather than the route.

    The last two are the whole delivery mechanism for surface kits that are not on
    the desk: there is no ``frappe.boot`` on a website page and no ``bunood.js``, so a
    server-rendered class on ``<body>`` is the only anchor that is correct at first
    paint. See ``public/scss/web/web.scss``'s header.

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
    * The hook fires for EVERY website request: portal pages, error pages, the site
      root. It guards on ``context.template`` — and since item 33 the guard's default
      branch DRESSES rather than returns, so what needs naming is the set it declines:
      the desk (handled first), the auth templates (handled second),
      :data:`NON_WEB_TEMPLATES`, and anything whose template is not ``.html``.

      (This paragraph has now been wrong twice, in opposite directions, and both times
      it was the WHAT block thirty lines above that contradicted it. It read "does
      nothing except for the desk" after item 32 gave it a second surface — corrected
      by an adversarial release review — and "does nothing for anything that is not one
      of the three templates named above" after item 33 slice 1 inverted the default,
      which is the exact opposite of what the code then did. A constraints block that
      describes control flow has to be edited by the commit that changes the control
      flow; it is not commentary.)
    * It runs inside the website router. An uncaught exception here takes down every
      page on the site, not just the desk. Every branch is wrapped.
    * It runs on every desk request (``frappe/www/desk.py`` sets ``no_cache``, so
      ``@cache_html`` never serves a cached desk page). Keep the work to cached reads.

See ARCHITECTURE.md sections 4, 5 and 3.
"""

import frappe

#: The DESK template. Frappe's ``PathResolver`` hardcodes ``TemplatePage("desk")`` for
#: ``/desk`` and ``/app/*``, and the context carries the template path, so this is a
#: reliable discriminator. (It read "the only template we touch" until item 32 added
#: :data:`AUTH_TEMPLATES`.)
DESK_TEMPLATE = "www/desk.html"

#: The two logged-out surfaces item 32 dresses, BY TEMPLATE. ``/login`` holds four
#: ``<section>``s behind hash routes (``#login``, ``#signup``, ``#forgot``,
#: ``#login-with-email-link``) and the reset screen is a fifth on the same
#: ``login.bundle.css`` — one surface, two templates.
#:
#: MATCHED ON THE TEMPLATE, NOT ON THE REQUEST PATH, and the first cut got this wrong in
#: a way that cost the whole item its most important page. It matched
#: ``frappe.local.request.path`` on the strength of a claim — written into this file —
#: that ``context.path`` is assigned after the hook runs. That is false:
#: ``TemplatePage.get_html()`` calls ``update_context()`` (``template_page.py:95``), which
#: calls ``set_page_properties()`` (``:178-185``) and sets ``path``, ``route`` AND
#: ``template``, all before ``post_process_context()`` (``:99``) reaches us. The desk
#: branch below has always keyed on ``context.template``, which was standing proof.
#:
#: WHAT THAT COST: on a stock site a guest hitting ``/`` is served the sign-in page —
#: ``frappe.website.utils.get_home_page`` sends them to ``me``, whose permission check
#: renders login — and ``request.path`` is then ``""`` while ``context.template`` is
#: ``www/login.html``. So the site ROOT, the address a visitor actually types, got none
#: of this kit: no scope, no anchor, no brand sheet, no logo, and none of the eleven
#: contracts including the focus ring. Measured live, and every one of the 22 login
#: checks missed it because they all navigate to the literal ``/login``.
#:
#: Note the reset template is ``update-password.html`` with a HYPHEN. Resolved through
#: ``PathResolver`` rather than guessed from the route name.
AUTH_TEMPLATES = ("www/login.html", "www/update-password.html")

#: The scope every rule in ``web/_login.scss`` hangs off. Contracts key on this class
#: alone; the anchor and the two axes add ``bnd-auth-<slug>`` beside it.
AUTH_BODY_CLASS = "bnd-auth"

#: The scope for item 33 — every website page that is NOT the desk, NOT the auth
#: templates and NOT printview. Contracts key on this class alone; the anchor and the
#: two axes will add ``bnd-web-<slug>`` beside it, exactly as the auth kit does.
#:
#: MUTUALLY EXCLUSIVE WITH :data:`AUTH_BODY_CLASS` BY CONSTRUCTION, not by convention.
#: The auth branch returns before the web branch is reached, so no page can carry both
#: — which matters more than it sounds, because the site ROOT is served the sign-in
#: template on a stock site and would otherwise be claimed by two kits fighting over
#: one ``<body>``.
WEB_BODY_CLASS = "bnd-web"

#: Templates that render through ``base.html`` but are NOT ours to dress.
#:
#: THIS IS A DENYLIST, AND THAT IS THE INVERSION THAT DEFINES ITEM 33. Item 32 named
#: the two templates it wanted; there is no comparable list here, because the surface
#: is "every website page" and enumerating it would be a second copy of Frappe's own
#: route table — one that goes stale the first time an app ships a page. So the default
#: branch DRESSES, and this names the exceptions.
#:
#: ``printview``/``printpreview`` are excluded BY NAME rather than left to chance: both
#: are standalone ``<!DOCTYPE html>`` documents with their own ``<html>`` element, no
#: ``web_include_css`` loop and no ``body_class``, so dressing them is inert — but they
#: are item 35's ground, and a boundary that exists only in a planning document is not a
#: boundary. Verified in the container, not assumed from the route name.
#:
#: ``robots.txt`` and ``sitemap.xml`` need no entry here: they are real ``TemplatePage``s
#: with non-HTML base templates, and the ``.html`` test in :func:`_is_web_template`
#: excludes them. Checked, because "it is probably not a template" is how the site root
#: was lost once already.
NON_WEB_TEMPLATES = ("www/printview.html", "www/printpreview.html")

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
        # Guard first and cheaply: this hook is called for EVERY website request.
        # THREE surfaces answer here now, and the ORDER IS THE GUARANTEE — each
        # branch returns, so no page can be claimed by two kits. That matters
        # concretely rather than theoretically: on a stock site a guest at ``/`` is
        # served the SIGN-IN template, so without the early return the site root
        # would carry both ``bnd-auth`` and ``bnd-web`` and two stylesheets would
        # fight over one ``<body>``.
        template = context.get("template") or ""

        if template == DESK_TEMPLATE:
            _append_brand_css(context)
            _correct_layout_direction(context)
            return

        if template in AUTH_TEMPLATES:
            _auth_context(context)
            return

        if _is_web_template(template):
            _web_context(context)

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
    url = _brand_css_url()
    if not url:
        return

    # context.app_include_css is a list built by frappe/www/desk.py from the hooks of
    # every installed app. Copy rather than mutate: the same list object can be reused
    # across requests in some Frappe versions, and appending in place would grow it
    # unboundedly.
    context.app_include_css = [*(context.get("app_include_css") or []), url]


def _is_web_template(template):
    """Is this a website page item 33 owns?

    THE DEFAULT ANSWER IS YES, and that inversion is the whole design. Item 32
    asked "is this one of my two templates?"; item 33 asks "is this anybody
    else's?", because its surface is *every* website page and the alternative —
    enumerating them — would be a second copy of Frappe's route table that goes
    stale the first time an app ships a page. Measured on this site: twelve erpnext
    portal routes collapse onto ONE template (``ListPage.render()`` calls
    ``set_standard_path("portal")``), so a route list would also have been the
    wrong shape as well as the wrong size.

    KEYED ON THE TEMPLATE BECAUSE NOTHING ELSE SURVIVES EVERY RENDERER.
    ``TemplatePage.update_context()`` sets ``path``, ``route`` and ``template``
    before the hook runs — but ``DocumentPage.update_context()`` never calls
    ``set_page_properties()`` at all, and ``WebFormPage`` inherits from it. So on
    every Web Page, Help Article and Web Form, ``context.path`` and
    ``context.route`` are EMPTY here while ``context.template`` is populated from
    the document's own ``get_page_info()``. The rendered HTML still carries a
    correct ``data-path`` on those pages, because ``set_missing_values()`` fills it
    in afterwards — so reading the attribute back looks exactly like confirmation
    and proves nothing. See ``docs/upstream/frappe-website.md`` §1.

    The ``.html`` test is not decoration: ``www/robots.txt`` and ``www/sitemap.xml``
    are real ``TemplatePage``s whose base templates are not HTML, and dressing them
    would put a class into a plain-text response.

    THE AUTH AND DESK EXCLUSIONS ARE DEFENDED TWICE, DELIBERATELY. :func:`desk_context`
    already returns before reaching this predicate for both, so the two clauses below
    are unreachable from that caller — and the standing negative check
    (``web: and stops at the surfaces that are not ours``) could not be made to fail by
    deleting the dispatcher's ``return`` alone. It took removing BOTH, and only then
    did the site root come back
    ``bnd-auth bnd-auth-split bnd-auth-action-branded bnd-web`` — two kits on one body.
    Recorded because a reader who finds one of them redundant and removes it will not
    see a test go red, and because the next person to sabotage this needs to know it
    takes two edits.

    The redundancy is not the same-fact-in-two-places trap: both places read the same
    :data:`AUTH_TEMPLATES` and :data:`DESK_TEMPLATE`, so there is one copy of the fact
    and two uses of it. What it buys is a predicate that is correct when called from
    somewhere other than the dispatcher — which slice 2b will do, when ``brand.py``
    needs to know which scopes to emit dark blocks for.

    Args:
        template: ``context.template``, already coerced to ``str``.

    Returns:
        bool: True when this page is item 33's to dress.
    """
    return (
        template.endswith(".html")
        and template != DESK_TEMPLATE
        and template not in AUTH_TEMPLATES
        and template not in NON_WEB_TEMPLATES
    )


def _web_context(context):
    """Dress the website and portal — item 33, slice 1: the scope and nothing else.

    ONE THING ONLY, deliberately. The brand stylesheet, the anchor, the two axes
    and the branding seams all hang off this class, and every one of them is a
    later slice. Landing the scope alone means the commit that adds the first rule
    has a scope that is already proven on six templates through five renderers,
    rather than proving both at once and being unable to say which half was wrong.

    APPENDED, NEVER ASSIGNED, for the reason item 32 recorded: another app or a
    Website Settings value may already have put a class on ``<body>``, and
    clobbering it would be a silent regression on a site we cannot see.

    NO USER STATE HERE, NOW OR EVER. Frappe caches website HTML under a key of
    ``(path, lang)`` and nothing else — not the user, not their roles — so
    anything encoded into ``body_class`` on a cacheable route is served to every
    later visitor for the TTL. Measured: a guest received the Administrator's
    rendered ``/attribution``, and ``/404`` fetched with a valid session returned
    the logged-out render. That is why this class is the same for everyone, why
    ``frappe-session-status`` is refused as a styling discriminator despite being
    rendered for free at ``base.html:57``, and why ``login_theme``'s sibling here
    will default to following the OS rather than to a stored value.
    ``docs/upstream/frappe-website.md`` §2 carries the reproduction.
    """
    classes = (context.get("body_class") or "").split()
    if WEB_BODY_CLASS not in classes:
        classes.append(WEB_BODY_CLASS)
    context.body_class = " ".join(classes)

    _add_brand_sheet(context)


def _add_brand_sheet(context):
    """Append the per-site brand stylesheet to a WEBSITE page's ``web_include_css``.

    Shared by the auth and website branches. Extracted rather than copied for the
    reason item 33 slice 2b existed at all: the brand sheet reached ``/login`` and
    stopped there, because the three lines that put it on ``web_include_css`` lived
    inside ``_auth_context``. Two copies of a three-line append is how a surface
    gets forgotten, and this is the surface that was.

    APPENDED LAST so it wins ties against our compiled sheet — safe for the same
    reason the desk's copy is safe: the brand sheet only ever declares ``--bnd-*``,
    never one of Frappe's own variable names. See ARCHITECTURE.md section 1 for why
    writing Frappe's names at ``:root`` would silently break dark mode.

    A NEW LIST, NEVER AN IN-PLACE APPEND. ``website_settings.py:232`` assigns
    ``context.web_include_css = hooks.web_include_css or []`` — and when the hook
    list is non-empty, which it is (``hooks.py`` ships one entry), that is the HOOK
    CACHE'S OWN LIST OBJECT. Mutating it would grow the cached value by one URL per
    request. The auth branch has always spelled it this way; item 33 multiplies the
    number of requests that reach this line from two routes to every website page,
    which turns a latent bug into a certain one.
    """
    url = _brand_css_url()
    if url:
        context.web_include_css = [*(context.get("web_include_css") or []), url]


def _auth_context(context):
    """Dress ``/login`` and ``/update-password`` — item 32.

    Three things, none of which needs a template fork or a byte of JS:

    1. **The scope.** ``templates/base.html:57`` renders
       ``class="{{ body_class or '' }}"``, and ``body_class`` is an ordinary
       context key. Setting it here is what gives ``web/_login.scss`` something to
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

    _add_brand_sheet(context)

    logo = frappe.get_cached_value("Theme Settings", "Theme Settings", "logo")
    if logo:
        context.logo = logo


def _brand_css_url():
    """The per-site brand stylesheet URL, regenerated if its file has gone.

    Split out of :func:`_append_brand_css` by item 32 so the desk and the auth
    routes share one implementation — including the self-heal below, which is the
    part that would have been quietly forgotten in a second copy.
    """
    import os

    from bunood_theme.brand import HEAL_CACHE_KEY, write_brand_css

    def on_disk(u):
        return os.path.exists(os.path.join(frappe.get_site_path("public"), *u.lstrip("/").split("/")))

    url = frappe.get_cached_value("Theme Settings", "Theme Settings", "brand_css_url")

    # THE STORED VALUE WINS WHENEVER ITS FILE IS THERE, and this ordering is the
    # whole safety argument for the cache below. One stat per desk render is the
    # cost on the happy path, and it is the only cost.
    if url and on_disk(url):
        return url

    # SELF-HEAL BEFORE SERVING. The URL is derived state, and derived state can be
    # restored without the file it derives from: a database-only restore (the smoke
    # suite and the settings sweep both write tabSingles back raw) leaves
    # `brand_css_url` pointing at a hash whose file a later save had reaped. Serving
    # that URL hands every desk a 404-as-HTML stylesheet and the brand colours are
    # simply gone — measured 2026-08-08 as the stale brand CSS console error the
    # suite had been allowlisting.
    #
    # THE REPAIR MAY NOT TOUCH THE DATABASE, AND THE FIRST VERSION DID. This runs in
    # `update_website_context`, i.e. while serving a GET, and Frappe rolls back the
    # transaction at the end of a non-writing request — so `write_brand_css`'s
    # `set_single_value` was discarded every single time. The stored URL stayed
    # stale, the next request found the same missing file, and the heal ran again:
    # a full palette render, a hash, a directory listing and a WRITE LOCK on
    # tabSingles, on every request, forever, to record something immediately thrown
    # away. Concurrent desk loads serialised on that lock in a state whose entire
    # purpose was to be invisible. Found in item 32's release review.
    #
    # `persist=False` writes the FILE — which is not transactional, so it survives
    # the request and is what actually makes this page work — and returns the URL
    # without recording anything.
    if not url:
        return None

    # A repair this process (or another) already made. Checked AFTER the stored
    # value and re-stat'ed, so a key left behind by an earlier heal can neither
    # mask a real save nor outlive its own file being reaped.
    healed = frappe.cache().get_value(HEAL_CACHE_KEY)
    if healed and on_disk(healed):
        return healed

    fresh = write_brand_css(persist=False)
    if fresh:
        # Not the database: the cache is not transactional, so unlike the write
        # this replaces, it is still there on the next request. That is what turns
        # "re-render on every request until someone saves" into "re-render once".
        frappe.cache().set_value(HEAL_CACHE_KEY, fresh)
    return fresh or None


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
