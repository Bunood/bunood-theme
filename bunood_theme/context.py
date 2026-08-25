# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Render-context augmentation — this file is why the theme has no ``www/`` directory.

WHAT
    A single ``update_website_context`` hook handler that mutates already-built render
    contexts. It answers for THREE surfaces, and since item 33 the last of them is the
    DEFAULT rather than a fourth early return:

    * **the desk** (``www/desk.html``) — appends the per-site brand stylesheet,
      corrects ``layout_direction`` for the RTL languages Frappe's ``is_rtl()``
      misses, and (slice 7b) replaces the framework's tab icon, splash logo and
      page title with the tenant's, or failing that with ours.
    * **the auth templates** (``www/login.html``, ``www/update-password.html``) —
      item 32, and note it is the TEMPLATE and not the route: a guest hitting ``/`` on a
      stock site is served the sign-in page. Sets the
      ``body_class`` that ``web/_login.scss`` scopes to, puts the brand sheet on
      ``web_include_css``, and replaces the app logo, tab icon, splash image and
      ``app_name`` — none of which Frappe resolves from Theme Settings, and all of
      which otherwise name whichever app happens to be installed beside us.
    * **every other website template** — item 33. Sets the ``body_class`` that the
      website half of ``web/web.scss`` scopes to, and (slice 7) replaces the four
      branding seams a stranger actually reads: the tab icon, the navbar brand and
      the footer's "Powered by". See :func:`_is_web_template` for why this is a
      denylist and why it keys on the template rather than the route, and
      :func:`_vendor_marks` for the precedence those seams follow.

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
#: that are their OWN base template — measured, both report
#: ``base_template_path == "www/robots.txt"`` / ``"www/sitemap.xml"`` — so the
#: base-template test in :func:`_is_web_template` excludes them. Checked, because
#: "it is probably not a template" is how the site root was lost once already.
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

#: Field value → class slug for the website kit's anchor — item 33, and the same
#: shape as :data:`AUTH_CLASSES` for the same reasons.
#:
#: ``""`` is the NEUTRAL and emits no class at all, so ``Original`` costs no rule and
#: cannot be half-applied. THIS IS THE ONLY COPY: like the auth kit and unlike the
#: nine desk kits, there is no ``bunood.js`` on a website page and therefore no
#: client-side apply to drift from it. The reason differs from item 32's, though —
#: an admin CAN load ``/me`` and ``/orders``, so the exemption is not "the hook could
#: not act" but "the anchor is server-rendered into a DIFFERENT document, so any
#: apply is a reload, and a reload preview is a link". See the picker's docblock.
#:
#: A MAP AND NOT A DERIVATION, for the same reason the auth one is: ``web_style``'s
#: values happen to lowercase into their slugs today, and the moment a pole is named
#: with two words that stops being true. One table, no special cases.
WEB_CLASSES = {
    "web_style": {"Original": "", "Panel": "panel", "Plate": "plate"},
    # The header axis, and it COMPOSES with the anchor rather than riding its
    # stand-down: an `Original` page can still carry `bnd-web-header-branded`,
    # because the navbar is chrome present under every pole. Neutral is the
    # absence of the class, as every neutral in this repo is.
    "web_header": {"Neutral": "", "Branded": "header-branded"},
    # The mode axis. Composes with everything: it decides which palette the page
    # paints in, and both the contracts and the poles paint in whichever it picks.
    "web_theme": {"Follow OS": "", "Always Light": "theme-light", "Always Dark": "theme-dark"},
}

#: ``User.desk_theme`` is a Literal["Light", "Dark", "Automatic"]. Frappe renders it
#: verbatim into ``data-theme``, and ships no ``prefers-color-scheme`` rules, so
#: ``"automatic"`` matches neither its light nor its dark block. We keep the value (the
#: CSS has an explicit ``html[data-theme="automatic"]`` media block) but the constant is
#: named here so the reason is discoverable.
AUTOMATIC = "Automatic"

#: THE VENDOR'S OWN MARK — item 33 slice 7. One file, two uses (the browser-tab
#: favicon and, from slice 7b, the desk splash), because a mark that drifts between
#: the tab and the splash is the same-fact-in-two-places trap with a picture on it.
#:
#: IT IS A REPLACEMENT, NOT A FALLBACK, and that distinction is the slice. Frappe
#: ships ``frappe-favicon.svg`` and erpnext's ``website_context`` hook overrides it
#: with ``erpnext-favicon.svg`` (``erpnext/hooks.py:119``), so a tenant who has
#: configured nothing publishes a site whose tab icon advertises a product they did
#: not buy. This theme is the white-label layer; the last resort is ours, never
#: theirs. Anything the tenant sets still wins — see :func:`_vendor_marks`.
VENDOR_MARK = "/assets/bunood_theme/images/bunood-mark.svg"


def _vendor_name():
    """The name shown when the tenant has not set one — read, never restated.

    ``setup.py``'s ``DEFAULTS`` seeds ``company_name`` on install and on every
    migrate where the field is empty, so on a fresh site the value IS this string
    and the seams below need no fallback at all. The fallback exists for the site
    that has deliberately CLEARED the field: without it a blank ``company_name``
    would drop the navbar back to Frappe's ``_("Home")`` and the footer back to
    erpnext's "Powered by" include, which is the one outcome this slice exists to
    prevent — an empty tenant field must never restore a vendor's mark.

    Derived from the seeder rather than spelled again here: two copies of a brand
    name is the trap this repo names first, and the copy that goes stale is always
    the one nobody is looking at.
    """
    from bunood_theme.setup import DEFAULTS

    return DEFAULTS["company_name"]


def _tenant_branding():
    """The four Theme Settings fields a tenant brands with, read in one place.

    ``company_name``/``logo``/``favicon``/``tagline`` are the Branding section of
    Theme Settings — the surface a tenant is told to use. They are deliberately
    OUTSIDE ``MUTABLE_FIELDS``, because a failed restore of a branding field is
    permanent damage rather than a wrong-looking page, which is also why every
    check that exercises one writes it directly and restores in a ``finally``.

    ``tagline`` is not read here: it is baked into the brand stylesheet by
    ``brand.py`` (it is in ``BRAND_INPUTS``), not injected through the render
    context, and reading it in two places is how it would come to mean two things.
    """
    return {
        field: frappe.get_cached_value("Theme Settings", "Theme Settings", field) or ""
        for field in ("company_name", "logo", "favicon")
    }


def _vendor_marks(context):
    """Replace the framework's identity with ours, wherever the tenant has none.

    ITEM 33 SLICE 7, and the shape of the precedence is the whole design:

        the tenant's Theme Settings value  >  their Website Settings value  >  ours

    The first step is item 32's rule, unchanged: where Theme Settings holds THE SAME
    FACT, it wins outright, because it is the surface this theme tells a tenant to
    brand from and ``get_app_logo``/``get_website_settings`` never look at it. The
    second step is why this is not simply an assignment: Website Settings' own
    ``favicon`` is an explicit choice by the same person, and clobbering it with a
    vendor default would be a regression dressed as a feature.

    THE THIRD STEP IS THE ONE THAT NEEDED WRITING DOWN. By the time this hook runs,
    ``context.favicon`` has already been resolved by ``get_website_settings``
    (``website_settings.py:251-255``): Frappe's default, overridden by any
    ``website_context`` hook — erpnext ships one — overridden by Website Settings'
    field. So the context value cannot tell "the tenant chose this" from "an app we
    happen to be installed beside chose this", and reading it back would look
    exactly like confirmation. The Website Settings field is therefore read
    DIRECTLY, and the vendor's hook value is simply not part of the chain.

    CALLED FROM ALL THREE BRANCHES since slice 7b. The desk, the auth templates and
    the website render the same ``<head>``, and a tenant whose public site carried
    their mark while their staff's desk carried erpnext's would be a stranger sight
    than either alone. ``splash_image`` is read by ``www/desk.html:37`` and by
    ``templates/includes/login/login.js:277``, so it is genuinely live on two of the
    three; on the website branch it is inert and set anyway, because a branch that
    assigns a different set of keys per surface is a branch that will be wrong about
    one of them later.

    ``app_name`` DOES NOT FOLLOW THE THREE-STEP RULE, and the exception is measured
    rather than argued. ``"Frappe"`` is the shipped ``default`` of the field in BOTH
    ``website_settings.json`` and ``system_settings.json`` — so a stored ``"Frappe"``
    is indistinguishable from a deliberate choice, and honouring the middle step
    would keep the vendor's name forever on every site that has never touched it,
    which is every site. It therefore takes ``company_name`` outright, exactly as
    ``favicon`` takes Theme Settings' own field. On a white-label deployment "the
    name of this system" and "the tenant's company" are the same fact; that is what
    white-labelling means. Renders at ``www/desk.py:60`` (the desk page title) and
    ``www/login.py:52``.
    """
    tenant = _tenant_branding()
    site = {
        field: frappe.get_cached_value("Website Settings", "Website Settings", field) or ""
        for field in ("favicon", "splash_image")
    }
    from frappe.utils import escape_html

    context.favicon = tenant["favicon"] or site["favicon"] or VENDOR_MARK
    context.splash_image = tenant["logo"] or site["splash_image"] or VENDOR_MARK
    # ESCAPED, and this line was a stored XSS for exactly as long as it was not.
    # `app_name` renders at `www/desk.html:19` as `<title>{{ app_name }}</title>`,
    # and `<title>` is RCDATA: a `</title>` inside the value ENDS the element and
    # everything after it lands in `<head>`. Frappe's Jinja has no autoescaping
    # (docs/upstream/frappe-website.md §11), so the only guard is the caller's,
    # and `_web_chrome` fifty lines below already applied it to this very field
    # while this line did not.
    #
    # THE DOCTYPE'S OWN SANITISER DOES NOT COVER IT, which is why "a Data field is
    # safe" was the wrong instinct. `_sanitize_content` runs `nh3.clean` on any
    # Data value containing `<` or `>`, so a bare `<script>` is stripped — but nh3
    # KEEPS `<a>` and its `title` attribute, and HTML attribute serialisation
    # escapes only `&` and `"`, never `<` or `>`. So
    # `<a title="</title><script>…</script>">x</a>` survives sanitisation
    # verbatim, and the `</title>` inside the attribute still terminates the
    # element on the way out. Verified end-to-end in a real browser during the
    # v0.33.0 release review: the script ran on every desk load.
    #
    # `company_name` is writable by SYSTEM MANAGER, not only Administrator, so
    # that was a privilege boundary and not merely a broken page.
    context.app_name = escape_html(tenant["company_name"] or _vendor_name())


def _web_chrome(context):
    """The tenant's name and mark in the navbar and the footer — item 33 slice 7.

    THREE SEAMS, ALL OF THEM PLAIN CONTEXT KEYS, all proven by writing Website
    Settings directly and watching the page change before a line of this was
    written:

    * ``banner_image`` — ``navbar.html:8`` renders it as ``<img>``. This is
      Frappe's own seam for an image brand, which is why the logo goes here rather
      than into hand-built ``<img>`` markup in ``brand_html``.
    * ``brand_html`` — ``navbar.html:5``, and it WINS over ``banner_image``, so the
      two are mutually exclusive by construction here exactly as they are in the
      template's own ``if``/``elif``. Set only when there is no logo to show.
    * ``footer_powered`` — ``footer_info.html``. Unset, the template includes
      ``footer_powered.html``, which erpnext shadows with "Powered by ERPNext".
      There is no way to render NOTHING through this seam: an empty string is
      falsy and brings the vendor's include straight back, so the honest options
      are the tenant's name or the vendor's, and this theme picks the tenant's.

    ESCAPING IS OURS, AND THAT IS NOT A STYLE PREFERENCE. Frappe builds its Jinja
    environment as ``FrappeSandboxedEnvironment(loader=…, undefined=DebugUndefined,
    cache_size=32)`` (``frappe/utils/jinja.py``) with no ``autoescape`` argument, so
    autoescaping is OFF site-wide — which is correct for ``brand_html``, a Code
    field whose documented purpose is to hold an ``<img>`` tag, and is why
    ``base.html`` writes ``{{ path | e }}`` and ``me.html`` writes
    ``{{ … full_name | e }}`` by hand. Measured, not inferred: ``footer_powered``
    set to ``ACME <i>Ltd</i>`` rendered an italic "Ltd". ``company_name`` is a Data
    field an administrator types into, so it goes through ``escape_html`` on the way
    out. This is the sibling of ``brand._css_string``, one language over.

    THE ``<span>`` IS DELIBERATE. ``navbar.html``'s own fallback arm wraps the name
    in one, and slice 5's branded-header ink is sized against ``.navbar-brand``; a
    seam that changes the DOM shape underneath a rule that was measured against the
    old one is how a green check starts describing a page that no longer exists.

    WEBSITE SETTINGS WINS OVER THE DERIVATION, unlike the favicon above, and the
    asymmetry is the point rather than an oversight. ``favicon`` is the SAME FACT in
    two places, so the more specific surface takes it. ``brand_html`` is not
    ``company_name``: a tenant who wrote markup into that field expressed something
    strictly more specific than "my company is called X", and overwriting it with a
    name would discard a choice to apply a derivation. A logo, being the same fact
    as the brand image, still wins outright — and then ``brand_html`` must be
    CLEARED, or the template's ``if`` would render their old text over our image.
    """
    from frappe.utils import escape_html

    tenant = _tenant_branding()
    site = {
        field: frappe.get_cached_value("Website Settings", "Website Settings", field) or ""
        for field in ("brand_html", "banner_image", "footer_powered")
    }
    name = escape_html(tenant["company_name"] or _vendor_name())

    if tenant["logo"]:
        context.banner_image = tenant["logo"]
        context.brand_html = ""
    elif not (site["brand_html"] or site["banner_image"]):
        context.brand_html = f"<span>{name}</span>"

    if not site["footer_powered"]:
        context.footer_powered = name


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
            # Slice 7b. The desk is not a "surface kit" and has no census of its
            # own, but it renders the same `<head>` as everything else and it was
            # serving erpnext's favicon, erpnext's splash logo and the page title
            # "Frappe" to a tenant's own staff. Same helper, same precedence.
            _vendor_marks(context)
            return

        if template in AUTH_TEMPLATES:
            _auth_context(context)
            return

        if _is_web_template(template, str(context.get("base_template_path") or "")):
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


def _is_web_template(template, base_template):
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

    IT KEYS ON THE BASE TEMPLATE, NOT THE PAGE'S OWN EXTENSION, and the first cut
    got that wrong in a way that cost the item a whole page FORM. It tested
    ``template.endswith(".html")`` — but Frappe resolves a www route to
    ``<path>``, ``<path>.html``, ``<path>.md``, ``<path>/index.html`` OR
    ``<path>/index.md`` (``template_page.py:77-80``), and a Markdown page's
    ``context.template`` therefore ends ``.md`` while it still renders through
    ``templates/base.html`` — ``set_properties_from_source`` wraps the converted
    HTML in ``{% extends base_template %}``, and ``base.html:57`` even branches on
    ``template.endswith('.md')`` on the same ``<body>`` tag that emits our class.
    So every ``www/*.md`` page — a documented Frappe pattern — got NOTHING: no
    scope, no brand sheet, no focus ring, no contrast repairs, and all three
    vendor marks intact, while still downloading the sheet whose every rule it
    could not match. Measured on the stock ``/_test/_test_folder/index``:
    ``class=""`` and erpnext's favicon, beside a ``/support`` carrying the full kit.

    ``base_template_path`` is the honest discriminator because it IS the question
    being asked — "does this render through an HTML base template" — and Frappe
    assigns it in ``set_base_template_if_missing()``, which
    ``post_process_context`` calls immediately BEFORE this hook
    (``base_template_page.py:29-32``). Measured, rather than assumed: ``/support``
    and ``/404`` and the ``.md`` page all report ``templates/base.html``, while
    ``robots.txt`` and ``sitemap.xml`` report THEMSELVES — they are their own base
    — so the same test that now admits Markdown still excludes them, which is the
    entire job the ``.html`` test was doing. It also survives a document form
    Frappe has not invented yet, where an extension allowlist would repeat this
    exact defect.

    Args:
        template: ``context.template``, already coerced to ``str``.
        base_template: ``context.base_template_path``, already coerced to ``str``.

    Returns:
        bool: True when this page is item 33's to dress.
    """
    return (
        base_template.endswith(".html")
        and template != DESK_TEMPLATE
        and template not in AUTH_TEMPLATES
        and template not in NON_WEB_TEMPLATES
    )


def _web_context(context):
    """Dress the website and portal — item 33: the scope, the anchor, the seams.

    IT LANDED AS THE SCOPE AND NOTHING ELSE (slice 1), deliberately, and everything
    below it arrived one slice at a time: the brand stylesheet, the anchor and its
    two axes, and now the branding seams. Landing the scope alone meant the commit
    that added the first rule had a scope already proven on six templates through
    five renderers, rather than proving both at once and being unable to say which
    half was wrong.

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

    # THE ANCHOR. A neutral is the ABSENCE of its class, exactly as every other kit's
    # "Original" is the absence of its `data-bnd-*` attribute — so a stand-down needs
    # no rule of its own and cannot be half-applied.
    #
    # AN UNKNOWN VALUE FALLS BACK TO THE DEFAULT rather than emitting a slug nothing
    # styles. A Single can hold a value its Select no longer offers, and here the
    # failure would be silent: a class with no rules renders as `Original` while the
    # settings form says otherwise.
    from bunood_theme.presets import WEB_DEFAULTS

    for field, slugs in WEB_CLASSES.items():
        value = frappe.get_cached_value("Theme Settings", "Theme Settings", field)
        if value not in slugs:
            value = WEB_DEFAULTS[field]
        slug = slugs[value]
        if slug and f"{WEB_BODY_CLASS}-{slug}" not in classes:
            classes.append(f"{WEB_BODY_CLASS}-{slug}")

    context.body_class = " ".join(classes)

    _add_brand_sheet(context)

    # THE BRANDING SEAMS (slice 7). Four context keys, none of which this site
    # could exercise without a deliberate write — `logo` and `favicon` are unset
    # here and every Website Settings branding field is empty, so a check that
    # merely loads a page is green whether these lines work or not. That is the
    # trap item 32's logo override sat in for three slices, and every check for
    # these asserts the stock render FIRST.
    _vendor_marks(context)
    _web_chrome(context)


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
       the first screen they see, on both routes, with no hook and no fork.

       SLICE 7b GAVE IT A THIRD ARM. Item 32's version replaced the logo when
       Theme Settings held one and otherwise left it alone — which is correct for
       a tenant who has branded, and leaves erpnext's logo on the sign-in page of
       every tenant who has not, i.e. all of them on day one. See the code below
       for why the fallthrough is DETECTED against the hook list rather than
       re-derived by restating ``get_app_logo``'s settings reads.
    4. **The rest of the framework's identity** (slice 7b): the tab icon, the
       splash image ``login.js:277`` swaps in on submit, and ``app_name``, which
       ``www/login.py:52`` resolves to the literal ``"Frappe"`` on any site that
       has not overridden a field whose shipped default is that same string. All
       three go through :func:`_vendor_marks`, shared with the desk and website
       branches.

    The page's title and subtitle remain literals in ``www/login.html`` with no
    seam at all, which is filed upstream.
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

    _vendor_marks(context)

    # THE LOGO, and slice 7b turned item 32's one-way override into a chain.
    #
    # `www/login.py:51` sets `context.logo = get_app_logo()`, which reads Website
    # Settings' `app_logo`, then Navbar Settings', and — when both are empty —
    # falls through to the `app_logo_url` HOOK, i.e. to whichever app is installed
    # beside us. Here that is erpnext, so an unbranded tenant's sign-in page
    # advertised erpnext's logo. Item 32 replaced it when Theme Settings had one
    # and otherwise left it alone, which is the half that shows on every site
    # nobody has branded yet.
    #
    # THE FALLTHROUGH IS DETECTED RATHER THAN RE-DERIVED. Restating
    # `get_app_logo`'s two settings reads here would be a second copy of the
    # platform's own resolution order, and the copy that goes stale is the one
    # nobody is looking at. Instead: if what it returned is one of the hook
    # values, then both settings were empty and nothing was configured — so the
    # last resort is ours to choose. If a tenant HAS set either field, the value
    # will not be in that list and this leaves it entirely alone.
    tenant = _tenant_branding()
    if tenant["logo"]:
        context.logo = tenant["logo"]
    elif context.get("logo") in (frappe.get_hooks("app_logo_url") or []):
        context.logo = VENDOR_MARK


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
