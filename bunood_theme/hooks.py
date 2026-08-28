# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""App manifest and Frappe integration points.

WHAT
    Declares the app to Frappe: identity, which assets load on which surface, and
    which of our functions Frappe should call.

READ THIS BEFORE EDITING ASSET PATHS
    1. Never let a referenced path contain ``.bundle.``. Frappe's
       ``bundled_asset()`` (``frappe/utils/jinja_globals.py:147``) treats such paths as
       logical bundle names, looks them up in ``sites/assets/assets.json`` — which is
       stale in this deployment — and, on Arabic/Hebrew/Farsi/Pashto sites, prefixes
       them with ``rtl_``. Either behaviour yields a 404, and the RTL one fails for
       Arabic tenants ONLY, which is a live target here (``ksa_compliance``).
       We therefore reference an explicit hashed ``/assets/...`` path, generated into
       :mod:`bunood_theme.assets` by ``build.mjs``.
    2. There is no ``?v=`` cache-buster anywhere. The compiled bundle carries a content
       hash in its filename, and so does the per-site brand sheet. Immutable URLs make
       manual version bumping unnecessary — the previous version of this theme
       maintained 30+ of them by hand.

See ARCHITECTURE.md sections 5, 6 and 7.
"""

from bunood_theme.assets import THEME_CSS, THEME_JS, WEB_CSS

# ── Identity ────────────────────────────────────────────────────────────────────
app_name = "bunood_theme"
app_title = "Bunood Theme"
app_publisher = "Bunood"
app_description = "Modern white-label theme for Frappe/ERPNext v16"
app_email = "main@bunood.co"
app_license = "MIT"
app_version = "0.37.1"

required_apps = []

# ── Desk assets ─────────────────────────────────────────────────────────────────
# Emitted into <head> as render-blocking <link> tags by frappe/www/desk.html, which
# means the tokens are available at first paint. That is the whole reason the theme
# needs no template fork: CSS arrives before the splash screen renders, and JS (which
# Frappe emits at the END of body) never has to prevent a flash.
app_include_css = [THEME_CSS]

# Density override applier + user-menu toggle (checklist item 4). Hashed by
# build.mjs like the CSS.
app_include_js = [THEME_JS]

# RULE: never declare an asset that does not exist yet. The scaffold originally
# listed phantom assets and put four 404/MIME console errors on every page.
# Each entry below is enabled in the commit that ships its file.
#
# app_include_icons = ["/assets/bunood_theme/icons/bunood.svg"]  # when the sprite ships

# ── Website / portal / login assets ─────────────────────────────────────────────
# The login page is a WEBSITE page, not a desk page: it does not get app_include_css,
# and Frappe's own login bundle loads AFTER ours there. Anything in this sheet that
# must beat Frappe needs specificity, not source order.
#
# ENABLED BY ITEM 32, and note where in <head> this lands.
# ``templates/includes/head.html`` emits ``web_include_css`` inside ``{% block head %}``;
# ``www/login.html`` then OVERRIDES ``{% block head_include %}`` with
# ``include_style('login.bundle.css')``. So the order is website.bundle, any app's
# web_include_css (ours), then Frappe's login bundle — ours is NOT last, which is why
# ``web/_login.scss`` sizes every selector against a measured competitor.
#
# The path is the hashed one from assets.py, never a logical bundle name: it starts
# with ``/assets``, so ``bundled_asset()`` skips the ``rtl_`` swap entirely and ONE
# logical-property sheet serves both directions. (Frappe's own login bundle does get
# swapped — an ``ar`` page serves ``dist/css-rtl/login.bundle...css`` — which is the
# constraint GUIDELINES 1.3 puts on us, not a reason to ship a second file.)
web_include_css = [WEB_CSS]

# Still not shipping: there is no web JS and no sprite. RULE, restated because this
# is where it was broken before: never declare an asset that does not exist yet.
# web_include_js = ["/assets/bunood_theme/dist/js/bunood-web.js"]      # when web JS ships
# web_include_icons = ["/assets/bunood_theme/icons/bunood.svg"]        # when the sprite ships

# ── Context augmentation — replaces the www/desk.html fork ───────────────────────
# Called from BaseTemplatePage.post_process_context() AFTER frappe/www/desk.py has
# populated the context, so we can append the per-site brand stylesheet without
# owning the template. The handler guards on context.template because this hook fires
# for every website request. See ARCHITECTURE.md section 4.
update_website_context = "bunood_theme.context.desk_context"

# ── Boot payload ────────────────────────────────────────────────────────────────
# Keep this MINIMAL. Anything that can be expressed as a CSS custom property belongs
# in the brand stylesheet, not in boot: boot data arrives with the HTML but is only
# usable by JS, which runs after first paint.
extend_bootinfo = "bunood_theme.boot.extend_bootinfo"

# ── PDF header/footer direction (item 35, S4) ─────────────────────────────────
# wkhtmltopdf and the chrome generator render a document's header and footer as
# SEPARATE documents through these hooks, whose Frappe implementations compute
# `layout_direction` from an `is_rtl` bound at import time — reachable by the
# rtl_patch only when the apps happen to load first (an import-order accident
# any app-level `import frappe.utils.pdf` flips). `prepare_header_footer` calls
# `get_hooks(...)[-1]` — LAST WINS, measured — so these entries take the slot,
# delegate to Frappe's own implementations, and correct only the emitted `dir`,
# only in the one direction that can be wrong (our language set is a strict
# superset of Frappe's four). The document body's direction is closed
# separately, by `context.py`'s printview branch. See printing/pdf_direction.py.
pdf_header_html = "bunood_theme.printing.pdf_direction.pdf_header_html"
pdf_footer_html = "bunood_theme.printing.pdf_direction.pdf_footer_html"

# ── Lifecycle ───────────────────────────────────────────────────────────────────
after_install = "bunood_theme.setup.after_install"
after_migrate = "bunood_theme.setup.after_migrate"

doc_events = {
    "Theme Settings": {
        # Regenerate the per-site brand stylesheet whenever colours change.
        "on_update": "bunood_theme.setup.on_theme_settings_update",
    },
    "DocType": {
        # The icon inference (item 23) reads each DocType's own icon into a
        # cached map; drop it when a DocType's icon could have changed.
        "on_update": "bunood_theme.api.clear_icon_cache",
    },
}

# ── Print Jinja helpers ─────────────────────────────────────────────────────────
# Whitelisted into every print format's Jinja context, for ANY app's formats:
# ZATCA QR resolution (including ksa_compliance's "Sales Invoice Additional
# Fields" doctype, where the QR actually lives from 0.18 on), VAT-only totals
# (never freight/'Actual' rows), and the per-line VAT map. All defensive: they
# return empty values instead of raising, so a print never breaks because of a
# missing app, field or bad data. The records these feed (Print Style, Print
# Formats, Letter Head) are synced from files in printing/ and letterhead/ by
# bunood_theme.printing.install.sync_print_theme, called from setup.py's
# lifecycle hooks.
#
# The last entry, named "is_rtl", is a corrected drop-in for Frappe's own
# jinja_globals.is_rtl — installed_apps order puts bunood_theme after frappe
# (confirmed live: frappe, erpnext, bunood_theme, ...), so a same-named later
# entry wins in Jinja's globals dict. This closes templates/base.html's
# generic doc-page {{ is_rtl() }} call; the desk shell and bundled_asset()'s
# CSS-bundle selection are closed separately — see bunood_theme/i18n
# /rtl_patch.py for the full picture and why one hook alone isn't enough.
jinja = {
    "methods": [
        "bunood_theme.printing.jinja.bunood_zatca_qr_src",
        "bunood_theme.printing.jinja.bunood_vat_totals",
        "bunood_theme.printing.jinja.bunood_item_vat_map",
        # Item 34: the email stylesheet, substituted per site. Registered here
        # rather than delivered by Frappe's `email_css` hook because that hook is a
        # STATIC file list (so it can never carry a customer's seed) and its
        # `os.path.exists` filter runs CWD-relative in whichever process sends —
        # which silently drops the sheet for scheduler-triggered mail. See
        # `bunood_theme/email.py`.
        "bunood_theme.email.bunood_email_css",
        "bunood_theme.email.bunood_email_class",
        "bunood_theme.email.bunood_email_color_scheme",
        "bunood_theme.email.bunood_email_brand",
        "bunood_theme.email.bunood_email_title",
        "bunood_theme.email.bunood_email_footer",
        "bunood_theme.i18n.rtl_patch.is_rtl",
    ]
}
