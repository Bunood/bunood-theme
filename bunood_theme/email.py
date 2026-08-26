# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Email theming — the stylesheet that reaches an inbox, and the values in it.

WHY THIS MODULE EXISTS AT ALL
    Frappe themes outgoing mail through an ``email_css`` hook, and that hook is
    disqualified here twice over, both measured rather than assumed:

    1. It is a STATIC file list, so it can never carry a customer's brand seed.
       Every ERPNext site on earth sends the same colours because of this.
    2. ``inline_style_in_html``'s ``os.path.exists`` filter runs in whichever
       process sends, and resolves relative to that process's CWD. The
       queue-short, queue-long and scheduler containers have no ``bunood_theme``
       entry under ``sites/assets``, so a hooked sheet would apply to
       desk-triggered mail and be SILENTLY DROPPED for scheduler-triggered mail.
       Same site, same template, two different emails, no error in either.

    ERPNext is living failure 2 right now: its ``email_css`` names
    ``email_erpnext.bundle.css`` while the built file is
    ``erpnext_email.bundle.css``, so its email stylesheet has never applied
    anywhere, and nothing says so.

    So the CSS travels inside our own ``templates/emails/standard.html`` instead,
    as a ``<style>`` block this module renders. Measured: Premailer inlines an
    in-document ``<style>`` exactly as it inlines an external one, and PRESERVES
    what it cannot inline (media queries, ``:not()``, combinators) into a
    ``<style>`` tag with ``!important`` added — which is what makes a
    ``prefers-color-scheme`` block beat the light value it would otherwise lose
    to.

NO ``var()`` MAY REACH AN INBOX
    Premailer does not resolve custom properties and Outlook's Word engine does
    not support them. But hand-mirroring hexes is the defect
    ``printing/bunood_print_style.css`` already carries — it says to keep five
    brand hexes in sync with ``docs/design-tokens.md`` by hand, and that file
    does not exist.

    So the sheet is authored in ordinary ``var(--bnd-*)`` and SUBSTITUTED here,
    from ``palette.derive()`` — the same function ``brand.py`` formats and
    ``tools/contrast_gate.py`` measures. One derivation, three consumers now.

NEVER RAISES INTO THE MAIL PATH
    Every public entry point catches. An exception here would not produce a
    badly-styled email, it would produce no email — and the caller is often a
    queue worker whose failure a customer discovers by not receiving something.
    The degradation is TOTAL and therefore visible: no ``<style>`` at all, and
    the message renders as stock Frappe.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache

import frappe

from bunood_theme.contrast import composite, parse_color, to_hex
from bunood_theme.palette import derive

#: Colour tokens the email sheet needs that ``palette.derive()`` does NOT return.
#:
#: They are seed-INDEPENDENT — ``--bnd-ink`` is ``#16181d`` at every seed — which
#: is exactly why ``derive()`` has no business fitting them. But an email cannot
#: read ``_tokens.scss``, so the values have to exist as data somewhere.
#:
#: THIS IS A CACHE, NOT A SOURCE. ``_tokens.scss`` is the source, and the suite's
#: ``email: the static token cache still matches _tokens.scss`` parses that file
#: and fails if these drift. That check is the whole reason this dict is allowed
#: to exist: ``contrast_gate.py``'s ``SB_FITS_*`` hand-copy fourteen hexes out of
#: ``_sidebar.scss`` with NO such check, and GUIDELINES §2.2 records that
#: duplication as real debt. This one cannot rot silently.
#:
#: The better answer is codegen — ``build.mjs`` already writes ``assets.py`` from
#: the build and could write these the same way. Swapping it later changes no
#: behaviour, because the gate already proves the two agree.
STATIC_TOKENS = {
    "light": {
        "--bnd-ink": "#16181d",
        "--bnd-border": "rgba(0, 0, 0, 0.09)",
        "--bnd-border-strong": "rgba(0, 0, 0, 0.16)",
    },
    "dark": {
        "--bnd-ink": "#e8eaec",
        "--bnd-border": "rgba(255, 255, 255, 0.1)",
        "--bnd-border-strong": "rgba(255, 255, 255, 0.18)",
    },
}

#: What a translucent token is composited against before it ships.
#:
#: ``rgba()`` borders are this theme's own idiom and they are wrong for email:
#: Outlook's Word engine drops an ``rgba`` colour entirely, which turns a hairline
#: into no line at all — the item-22 "identifiable at rest" contract failing in an
#: inbox, invisibly, on the client with the largest share of business mail. So
#: every translucent value is flattened against the surface it actually sits on.
#: The maths is ``contrast.composite``, the same function the gate uses to score a
#: border, so the number shipped and the number measured are one number.
FLATTEN_AGAINST = {
    "--bnd-border": "--bnd-surface",
    "--bnd-border-strong": "--bnd-surface",
}

SHIPPED_BRAND = "#4d8756"
SHIPPED_ACCENT = "#4463f0"

#: Settings value to CSS class slug. **THIS IS THE ONLY COPY.**
#:
#: `context.py` keeps the same table for the website and login kits and says the
#: same thing about it, for the same reason: there is no `bunood.js` on this
#: surface — indeed no JavaScript at all — so there is no second table to drift
#: against, and there must never be one.
#:
#: A MAP AND NOT A DERIVATION, also for `context.py`'s reason. `"Card"` happens to
#: lowercase into its own slug and `"Original"` does not map to `"original"` at
#: all — it maps to the ABSENCE of a class, which is what makes the stand-down
#: structural rather than a rule that has to remember to do nothing. One axis
#: deriving while another maps reads as a bug later.
#:
#: THE SLUG SHAPE IS `bnd-e--<slug>` AND THE DOUBLE DASH IS DELIBERATE. Every
#: other kit puts its pole on `body` (`body.bnd-web-panel`) where nothing else
#: lives, so `<base>-<slug>` is unambiguous there. Here the pole classes sit on
#: the same elements as the STRUCTURAL ones — `.bnd-e-plate`, `.bnd-e-body`,
#: `.bnd-e-foot` — and `.bnd-e-card` beside `.bnd-e-plate` would give a reader no
#: way to tell a pole from a part.
#: `email_theme` is DELIBERATELY ABSENT from this map, and the asymmetry with
#: `login_theme`/`web_theme` is the point rather than an omission. Those two are
#: body classes because a browser resolves a class-scoped media query. A mail
#: client may not: Gmail strips `<html>` and `<body>` outright, so a preserved
#: rule rooted at a class on either would match nothing. The mode is therefore
#: resolved SERVER-side into which rules `bunood_email_css` emits at all.
EMAIL_CLASSES = {
    "email_style": {
        "Original": "",
        "Card": "card",
        "Letter": "letter",
        "Masthead": "masthead",
    },
    #: `Brand fill` is the neutral here in the sense every neutral in this project
    #: is: the ABSENCE of a class, with the sheet's base rule rendering it. It is
    #: not a stand-down — the base rule is ours and it repaints stock's near-black
    #: button — because this axis COMPOSES with the anchor rather than hanging off
    #: it, exactly as `web_header` does and `login_action` does not. A stock-
    #: composed email still has a button.
    "email_action": {
        "Brand fill": "",
        "Outline": "action-outline",
        "Link": "action-link",
    },
}

_VAR = re.compile(r"var\(\s*(--bnd-[a-z0-9-]+)\s*\)")


def tokens(mode: str, settings=None) -> dict[str, str]:
    """Every token the email sheet may reference, as a concrete literal.

    Args:
        mode: ``"light"`` or ``"dark"``.
        settings: an already-loaded Theme Settings, when the caller has one.

    Returns:
        Token name to a literal ``#rrggbb``. Nothing translucent, nothing
        ``var()``-chained, nothing a mail client has to resolve.
    """
    s = settings or frappe.get_cached_doc("Theme Settings")

    brand = (getattr(s, "brand_color", None) or SHIPPED_BRAND).strip()
    accent = (getattr(s, "accent_color", None) or SHIPPED_ACCENT).strip()
    if mode == "dark":
        # Empty dark seeds fall back to the light ones, exactly as brand.py does.
        # A customer who has not thought about dark mode gets a coherent result
        # rather than an unthemed one.
        brand = (getattr(s, "brand_color_dark", None) or brand).strip()
        accent = (getattr(s, "accent_color_dark", None) or accent).strip()

    out = dict(derive(brand, accent, mode))
    out.update(STATIC_TOKENS[mode])

    # Flatten LAST, so a translucent token composites against the derived surface
    # for THIS seed rather than against a fixed white.
    for token, over in FLATTEN_AGAINST.items():
        if token in out and over in out:
            out[token] = to_hex(composite(parse_color(out[token]), parse_color(out[over])))

    return out


def substitute(css: str, values: dict[str, str]) -> str:
    """Replace every ``var(--bnd-*)`` in ``css`` with a literal.

    THROWS ON AN UNKNOWN TOKEN, deliberately. A helper that guesses at an input it
    does not recognise is how ``triple()`` read ``oklab()`` as near-black and how a
    rule scan reported zero matches from a vendor that had plenty — both recorded
    in CLAUDE.md. Leaving an unresolved ``var()`` in the output would be worse than
    either: a mail client ignores what it cannot parse, so the element would simply
    lose its colour, in an inbox, with every gate green.

    :func:`email_css` catches this and stands the whole sheet down, so the failure
    is total and visible rather than partial and invisible.

    Args:
        css: the compiled email stylesheet.
        values: token name to literal, from :func:`tokens`.

    Returns:
        The same CSS with no ``var(`` remaining.

    Raises:
        KeyError: if the sheet references a token ``values`` does not carry, or if
            any ``var(`` survives in any other form.
    """

    def one(match):
        name = match.group(1)
        if name not in values:
            raise KeyError(
                "email sheet references " + name + ", which palette.derive() and "
                "STATIC_TOKENS do not define — add it to one of them, or stop using it"
            )
        return values[name]

    # No fallback arm is accepted. `var(--x, 4px)` in an email sheet would mean the
    # author expects the token to be absent, and here it never can be: substitution
    # either resolves it or throws. Matching only the bare form is what stops a
    # fallback surviving into the output as a silent second opinion — and the sweep
    # below is what makes that a guarantee rather than a hope.
    out = _VAR.sub(one, css)

    if "var(" in out:
        leftover = re.findall(r"var\([^)]*\)", out)[:3]
        raise KeyError("email sheet still contains var() after substitution: " + repr(leftover))
    return out


@lru_cache(maxsize=4)
def _sheet(path: str, _stamp: float) -> str:
    """Read a compiled sheet, cached on ``(path, mtime)``.

    ``_stamp`` is unused in the body — it is in the signature so a rebuilt file
    invalidates the cache. Reading by filesystem path off the package is the whole
    point: ``bundled_asset()`` plus a CWD-relative ``os.path.exists`` is the trap
    this module's docstring opens with, and it is silent when it fires.
    """
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def sheet_path() -> str:
    """Absolute path to the compiled email stylesheet, resolved off the package."""
    from bunood_theme import assets

    name = os.path.basename(getattr(assets, "EMAIL_CSS", "") or "")
    if not name:
        raise FileNotFoundError("assets.EMAIL_CSS is unset — run `npm run build`")
    return os.path.join(os.path.dirname(__file__), "public", "dist", "css", name)


def email_css(mode: str = "light", settings=None) -> str:
    """The stylesheet for one mode, substituted, ready for a ``<style>`` block.

    Never raises. On any failure the caller gets ``""`` and the email renders as
    stock Frappe — a total, visible degradation rather than a partial one.
    """
    try:
        path = sheet_path()
        css = _sheet(path, os.path.getmtime(path))
        return substitute(css, tokens(mode, settings))
    except Exception:
        frappe.log_error(title="bunood_theme: email stylesheet stood down")
        return ""


def _theme(settings=None) -> str:
    """The stored ``email_theme``, falling back to the shipped default."""
    from bunood_theme.presets import EMAIL_DEFAULTS

    s = settings or frappe.get_cached_doc("Theme Settings")
    value = getattr(s, "email_theme", None)
    return value if value in EMAIL_THEMES else EMAIL_DEFAULTS["email_theme"]


#: The three modes, and what each emits. Not a class map — see below.
EMAIL_THEMES = ("Follow the client", "Always Light", "Always Dark")

#: What the ``color-scheme`` meta declares per theme.
#:
#: ``light only`` is not decoration: it is the one lever that asks a client NOT to
#: run its own inversion algorithm over a design it cannot see. Without it
#: `Always Light` would mean "light, until Gmail on Android decides otherwise",
#: which is not a promise worth offering.
COLOR_SCHEME_META = {
    "Follow the client": "light dark",
    "Always Light": "light only",
    "Always Dark": "dark only",
}


def bunood_email_class(settings=None) -> str:
    """Jinja global. The pole classes for the wrapper element, space-separated.

    Returns ``""`` under ``Original`` and on any failure — the absence of a class
    IS the stand-down, so the degraded path and the neutral pole are the same
    path, and neither can leave a half-dressed email behind.

    An unknown stored value falls back to the shipped default rather than
    emitting an orphan slug, exactly as ``context.py`` does for the two web kits.
    That case is reachable: a Select option removed in a later release leaves the
    old string in the database until something writes the field again.
    """
    try:
        s = settings or frappe.get_cached_doc("Theme Settings")
        from bunood_theme.presets import EMAIL_DEFAULTS

        out = []
        for field, slugs in EMAIL_CLASSES.items():
            value = getattr(s, field, None)
            if value not in slugs:
                value = EMAIL_DEFAULTS[field]
            slug = slugs[value]
            if slug:
                out.append("bnd-e--" + slug)
        return " ".join(out)
    except Exception:
        frappe.log_error(title="bunood_theme: email pole class stood down")
        return ""


#: Hosts whose presence in a footer line means the FRAMEWORK is advertising
#: itself on a customer's mail, rather than an app saying something useful.
#:
#: Deliberately a host list and not a word list. "ERPNext" can legitimately appear
#: in a customer's own footer text; a link to erpnext.com in mail the customer
#: sends to THEIR customers cannot. Item 33 made the same distinction on the
#: website, where the seam was `footer_powered`.
VENDOR_FOOTER_HOSTS = ("frappe.io", "frappeframework.com", "erpnext.com")

#: File extensions a mail client will actually render.
#:
#: SVG IS THE ONE THAT MATTERS AND IT IS ABSENT. Discourse strips `svg` and
#: `img[src$=".svg"]` from outgoing mail outright (`lib/email/styles.rb:70`)
#: because clients do not render it, and this theme's own shipped mark is
#: `bunood-mark.svg` — so the honest consequence is that OUR mark never appears in
#: an email, and the chain falls through to the wordmark instead. Shipping a
#: raster placeholder to fill the gap was considered and refused: the logo is
#: PARKED (HANDOVER, 2026-08-24) and a placeholder that only exists in email would
#: be a second mark to keep in step with the real one when it lands.
RASTER_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def brand(logo_from_account=None, settings=None) -> dict:
    """What the email header should show, resolved once.

    Args:
        logo_from_account: the wrapper's ``brand_logo`` context key, which Frappe
            fills from ``Email Account.brand_logo`` — and only when the caller
            asked for a header or a container (``email_body.py:433``). It is a
            FALLBACK here rather than the source, because relying on it would
            reproduce the defect that gate creates: a Notification email passes
            neither, so stock shows no logo on the commonest message a site sends.
        settings: an already-loaded Theme Settings, when the caller has one.

    Returns:
        ``{"mark": url or "", "name": str, "show_mark": bool, "show_name": bool}``
        — RAW, not escaped. The template escapes at the point of use with ``| e``,
        which is the convention `letterhead/*.html` and `printing/formats/*.html`
        already follow, and it is not optional: Frappe's Jinja has no autoescaping
        anywhere, and ``logo`` is an ``Attach Image``, which
        ``_sanitize_content`` skips entirely.
    """
    from bunood_theme.context import _tenant_branding, _vendor_name
    from bunood_theme.presets import EMAIL_DEFAULTS

    s = settings or frappe.get_cached_doc("Theme Settings")
    form = getattr(s, "email_header", None)
    if form not in EMAIL_HEADER_FORMS:
        form = EMAIL_DEFAULTS["email_header"]

    tenant = _tenant_branding()
    name = tenant["company_name"] or _vendor_name()

    candidate = (tenant["logo"] or logo_from_account or "").strip()
    mark = candidate if candidate.lower().endswith(RASTER_SUFFIXES) else ""

    return {
        "mark": mark,
        "name": name,
        # A form that asks for a mark and has none falls back to the WORDMARK
        # rather than rendering an empty row. "Degrade to something" is the rule
        # GUIDELINES §Design states; an email whose header is a blank 32px band
        # reads as a broken image, which is worse than a name.
        "show_mark": bool(mark) and form in ("Logo", "Logo + wordmark"),
        "show_name": form in ("Wordmark", "Logo + wordmark") or (form == "Logo" and not mark),
    }


#: The four identity forms. Kept beside `brand()` because it is the only consumer.
EMAIL_HEADER_FORMS = ("Logo + wordmark", "Wordmark", "Logo", "None")


def bunood_email_brand(logo_from_account=None, settings=None) -> dict:
    """Jinja global. See :func:`brand`. Never raises."""
    try:
        return brand(logo_from_account, settings)
    except Exception:
        frappe.log_error(title="bunood_theme: email brand stood down")
        return {"mark": "", "name": "", "show_mark": False, "show_name": False}


def bunood_email_title(header_title=None, settings=None) -> str:
    """Jinja global. The header title, with the framework's name substituted out.

    ``get_header`` (``email_body.py:672``) falls back to
    ``frappe.get_hooks("app_title")[-1]`` — the LAST INSTALLED APP — when a caller
    passes a header with no title of its own. On this site that renders
    **"Telephony"**, and installing any app changes the branding of every such
    email. Filed upstream (``docs/upstream/frappe-email.md`` §6).

    THE SUBSTITUTION IS KEYED ON THE FALLBACK VALUE, not on a guess about intent,
    because that value is knowable: it is exactly ``app_title[-1]``. A title equal
    to it did not come from a caller who meant it — no call site passes the name
    of whichever app happens to sort last. A real title passes through untouched.
    """
    try:
        titles = frappe.get_hooks("app_title") or []
        fallback = titles[-1] if titles else None
        if header_title and header_title != fallback:
            return header_title

        from bunood_theme.context import _tenant_branding, _vendor_name

        return _tenant_branding()["company_name"] or _vendor_name()
    except Exception:
        frappe.log_error(title="bunood_theme: email title stood down")
        return header_title or ""


def bunood_email_footer(default_mail_footer=None) -> list:
    """Jinja global. The footer lines, minus the framework advertising itself.

    ``get_footer`` (``email_body.py:557-576``) appends every app's
    ``default_mail_footer`` hook unless System Settings'
    ``disable_standard_email_footer`` is set. On this site that resolves to
    erpnext's *"Sent via ERPNext"* — the framework's name, in mail a customer
    sends to THEIR customers.

    WHY NOT JUST TICK THE SYSTEM SETTING, which is the obvious fix. Two reasons.
    It is site DATA, and this theme changes a tenant's data only through
    ``setup.py``'s seeder where the field is its own; reaching into System
    Settings to switch off a framework feature is a bigger claim than a theme
    should make silently. And it is all-or-nothing: it would also suppress a
    legitimate app's footer, which is not what a white-label theme is for.

    So the filter is narrow and stated: a line is dropped only when it LINKS to a
    vendor host. "ERPNext" as a word in a customer's own footer text survives —
    the customer may well sell it. Item 33 drew the same line on the website.
    """
    try:
        lines = list(default_mail_footer or [])
        return [ln for ln in lines if not any(h in str(ln) for h in VENDOR_FOOTER_HOSTS)]
    except Exception:
        frappe.log_error(title="bunood_theme: email footer filter stood down")
        return list(default_mail_footer or [])


def bunood_email_color_scheme(settings=None) -> str:
    """Jinja global. The ``color-scheme`` meta value for the stored theme."""
    try:
        return COLOR_SCHEME_META[_theme(settings)]
    except Exception:
        frappe.log_error(title="bunood_theme: email color-scheme stood down")
        return "light dark"


def bunood_email_css(settings=None) -> str:
    """Jinja global. The whole ``<style>`` body, with ``email_theme`` resolved.

    Frappe's ``jinja.methods`` hook exposes a function under its own ``__name__``
    into a namespace shared by every installed app, so the helpers this app
    registers are all ``bunood_``-prefixed. A bare ``email_css`` there would sit
    one collision away from Frappe's own ``email_css`` HOOK name, which is a
    different thing entirely — and the two are close enough that someone would
    eventually read one for the other.

    **This is where ``email_theme`` is resolved**, because that axis decides which
    RULES exist rather than which class sits on an element:

    ``Always Light``      the light sheet, and nothing else.
    ``Always Dark``       the dark sheet IN PLACE OF it, not in addition. A reader
                          who asked for dark gets it whatever their client thinks,
                          and one who did not still gets a coherent design rather
                          than a light one with dark patches.
    ``Follow the client`` the light sheet, then the whole sheet again inside
                          ``@media (prefers-color-scheme: dark)``.

    THE SECOND COPY IS THE POINT, AND IT IS CHEAP. Premailer inlines the light
    rules onto the elements and PRESERVES the media block into a ``<style>``,
    adding ``!important`` to every declaration it preserves — which is precisely
    what lets the dark values beat the inlined light ones they would otherwise
    lose to. Measured. Emitting the sheet twice costs ~140 bytes gzipped against
    a 2000 byte ceiling and Gmail's 102 KB clip.
    """
    try:
        s = settings or frappe.get_cached_doc("Theme Settings")
        theme = _theme(s)

        if theme == "Always Dark":
            return email_css("dark", s)

        light = email_css("light", s)
        if not light or theme == "Always Light":
            return light

        # NESTING WOULD BE INVALID, so it is refused rather than emitted. Today
        # the sheet carries no `@media` of its own and `assertEmailSafeCss` allows
        # one, so this becomes reachable the day someone adds a responsive rule.
        # A nested media query is not an error a mail client reports — it drops
        # the block silently, i.e. dark mode would simply stop working with every
        # gate still green.
        if "@media" in light:
            raise ValueError(
                "the email sheet grew an @media of its own; wrapping it in the "
                "prefers-color-scheme block would nest one media query inside "
                "another. Emit the dark rules per-block instead."
            )

        dark = email_css("dark", s)
        if not dark:
            return light

        return light + "\n@media (prefers-color-scheme: dark) {\n" + dark + "\n}\n"
    except Exception:
        frappe.log_error(title="bunood_theme: email stylesheet stood down")
        return ""
