# Bunood Print Theme installer — runs on after_install/after_migrate (hooks.py),
# and (via setup.on_theme_settings_update -> resync_print_brand) on every Theme
# Settings save, so a changed brand seed re-papers the whole site.
#
# The SOURCE OF TRUTH per record (item 35 rewired the first two onto the
# substitution mechanism — the item-34 pattern, fourth consumer):
#   scss/print/print.scss    -> compiled by build.mjs, substituted per site by
#                               printing/sheet.py::print_css, written into the
#                               Print Style "Bunood" (set as the system default
#                               ONCE — an admin's later choice is respected).
#                               The legacy hand-mirrored bunood_print_style.css
#                               is DELETED; its vocabulary lives in the entry.
#   ../letterhead/*.html     -> authored in var(--bnd-*), substituted the same
#                               way at sync, written into the Letter Head.
#   formats/*.html           -> Print Format records (Jinja), created/updated.
#                               Managed: local edits are overwritten on migrate —
#                               duplicate a format to customize (see README.md).
#   ../zatca/formats/*.html  -> the same, for the ZATCA package's own list
#                               (bunood_theme.zatca.FORMATS, item 41).
#
# Idempotent and defensive: a failure logs and never blocks bench migrate
# (matching the non-blocking ops policy in bunood_erpnext). A substitution
# failure REFUSES TO WRITE rather than writing "" — a stale good sheet beats a
# fresh empty one, and the stand-down is already logged by sheet.print_css.

import os
import re
import subprocess

import frappe

from bunood_theme import zatca

STYLE_NAME = "Bunood"
MODULE = "Bunood Theme"
# Company has tax_id for VAT but nothing for the commercial registration;
# this app adds the dedicated field so the letter head has one to read.
# (Merged from the parallel session, 2026-08-26.)
CR_FIELD = "bnd_commercial_registration"
BASE = os.path.dirname(os.path.abspath(__file__))

# The ONE-TIME claims (after_install, and the v0_35_0 patch for existing
# sites) displace by the `Print Style.standard` FLAG via _is_displaceable —
# the parallel session's insight: "a name list cannot help but rot", and this
# one already had, twice (no "Standard" on this frappe; Redesign/Monochrome
# missing). This tuple survives only as the patch's historical vocabulary;
# the ongoing sync claims true vacancy or a dangling name — see _sync_style.
# "Redesign" and "Monochrome" joined in item 35: v16 ships both and DEFAULTS to
# Redesign, so the vacancy check below had never fired on any v16 site — the
# Bunood style was installed everywhere and applied nowhere (the exact shape of
# ERPNext's never-loading email CSS). This tuple now covers fresh installs; the
# one-time claim for EXISTING sites is patches/v0_35_0/claim_print_style, whose
# honest cost (an admin who deliberately chose Redesign is indistinguishable
# from the default) is recorded there and in the CHANGELOG.
STOCK_STYLES = (None, "", "Modern", "Classic", "Standard", "Redesign", "Monochrome")

FORMATS = [
    {"name": "بونود - فاتورة ضريبية (A4)", "doctype": "Sales Invoice", "file": "sales_invoice_tax_a4.html"},
    {"name": "بونود - فاتورة ضريبية مبسطة (A4)", "doctype": "Sales Invoice", "file": "sales_invoice_simplified_a4.html"},
    {"name": "بونود - فاتورة ضريبية (حراري 80مم)", "doctype": "Sales Invoice", "file": "sales_invoice_tax_thermal.html"},
    {"name": "بونود - فاتورة مبسطة (حراري 80مم)", "doctype": "Sales Invoice", "file": "sales_invoice_simplified_thermal.html"},
    {"name": "بونود - فاتورة (نقطي)", "doctype": "Sales Invoice", "file": "sales_invoice_matrix.html"},
    {"name": "بونود - سند قبض-صرف", "doctype": "Payment Entry", "file": "payment_entry_voucher.html"},
    {"name": "بونود - سند قيد", "doctype": "Journal Entry", "file": "journal_entry_voucher.html"},
]


def _read(*parts, base=BASE):
    """A file under this package by default; ``base`` lets a spec that lives in
    another package (``bunood_theme.zatca``) be read from its own directory."""
    with open(os.path.join(base, *parts), encoding="utf-8") as f:
        return f.read()


def sync_print_theme():
    """Create/refresh the Bunood Print Style + Print Formats + Letter Head."""
    try:
        _sync_style()
    except Exception:
        frappe.log_error(
            title="bunood_theme: print style sync failed"[:140],
            message=frappe.get_traceback(),
        )
    try:
        _company_cr_field()
        _sync_letterhead()
    except Exception:
        frappe.log_error(
            title="bunood_theme: letterhead sync failed"[:140],
            message=frappe.get_traceback(),
        )
    # The ZATCA package ships its own formats (item 41); one loop syncs both.
    for spec in FORMATS + zatca.FORMATS:
        try:
            _sync_format(spec)
        except Exception:
            frappe.log_error(
                title=("bunood_theme: print format sync failed: " + spec["name"])[:140],
                message=frappe.get_traceback(),
            )


# fontconfig reads $XDG_DATA_HOME/fonts. compose points that at the shared
# sites volume so every container that renders a PDF sees the same directory;
# see bunood_erpnext/compose.yaml. (Merged from the parallel session.)
FONT_SUBDIR = os.path.join(".local", "share", "fonts")
RIYAL_OTF = os.path.join("public", "fonts", "riyal", "bunood-riyal.otf")


def _install_riyal_font():
    """Register the riyal face with fontconfig for the wkhtmltopdf path.

    chrome takes the woff2 from the @font-face and needs none of this. Under
    wkhtmltopdf no @font-face can work at all: frappe injects
    --disable-local-file-access (FrappePDFKit), which makes wkhtmltopdf refuse
    the inline data: URI, and it cannot parse woff2 either way. fontconfig is
    the only channel left, and it is the same one the stylesheet already
    prescribes for Cairo/Amiri.

    Never fatal: a site that cannot write here still prints, it just prints
    the riyal as a missing glyph under wkhtmltopdf -- exactly the old
    behaviour.
    """
    src = os.path.join(os.path.dirname(BASE), RIYAL_OTF)
    if not os.path.exists(src):
        return
    dest_dir = os.path.join(frappe.utils.get_bench_path(), "sites", FONT_SUBDIR)
    dest = os.path.join(dest_dir, os.path.basename(src))
    try:
        with open(src, "rb") as fh:
            want = fh.read()
        if os.path.exists(dest):
            with open(dest, "rb") as fh:
                if fh.read() == want:
                    return  # already current; keep this a true no-op
        os.makedirs(dest_dir, exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(want)
        # Best effort: fontconfig rescans a stale directory on its own, so a
        # missing fc-cache costs a little startup time, not correctness.
        subprocess.run(["fc-cache", "-f", dest_dir], capture_output=True, timeout=60)
    except Exception:
        frappe.log_error(
            title="bunood_theme: riyal font not registered with fontconfig",
            message=frappe.get_traceback(),
        )


def _is_displaceable(current):
    """True when the site is still on whatever frappe shipped or defaulted to.

    Flag-based (`Print Style.standard`), NOT name-based — the parallel
    session's fix for the list that had already rotted twice. Unset, or a name
    that no longer resolves, counts as displaceable: there is no admin intent
    to respect in either case. Used by the ONE-TIME claims (after_install and
    the v0_35_0 patch); the ongoing sync deliberately uses only this
    function's first two arms — see _sync_style.
    """
    if not current:
        return True
    if not frappe.db.exists("Print Style", current):
        return True
    return bool(frappe.db.get_value("Print Style", current, "standard"))


def _sync_style(settings=None):
    from bunood_theme.printing.sheet import print_css

    _install_riyal_font()
    css = print_css(settings)
    if not css:
        # Stand-down: sheet.print_css already logged why. Never write emptiness
        # over a record that may still carry a working (if stale) sheet.
        return
    if frappe.db.exists("Print Style", STYLE_NAME):
        style = frappe.get_doc("Print Style", STYLE_NAME)
        if style.get("disabled"):
            # An admin DISABLED our style. That is a choice, and the first cut
            # force-re-enabled it on every migrate and every settings save —
            # the review named it: a stock-style choice could never stick.
            return
        if style.css != css:
            style.css = css
            style.save(ignore_permissions=True)
    else:
        frappe.get_doc(
            {
                "doctype": "Print Style",
                "print_style_name": STYLE_NAME,
                "css": css,
                "standard": 0,
                "disabled": 0,
            }
        ).insert(ignore_permissions=True)

    # Claim the default ONLY from TRUE VACANCY (no style set at all). The
    # one-time displacement of a STOCK style belongs to the v0_35_0 patch and
    # to after_install on a fresh site — an ongoing in-STOCK_STYLES claim here
    # would re-take an admin's deliberate later choice of Redesign/Classic on
    # every migrate and every Theme Settings save, which the review walked and
    # the patch's own "respected forever" promise forbids.
    ps = frappe.get_single("Print Settings")
    current = ps.get("print_style")
    if ps.meta.has_field("print_style") and (
        not current or not frappe.db.exists("Print Style", current)
    ):
        # True vacancy, or a name that no longer resolves — no intent in
        # either. The standard-FLAG displacement stays one-time (the patch).
        ps.print_style = STYLE_NAME
        ps.save(ignore_permissions=True)


#: `print_letterhead` value -> the `<!--BND lh=slug-->` block that composes it.
#: `Frappe's own` is deliberately absent: it is the TRUE stand-down — the sync
#: never touches the record, so a tenant's hand-made letterhead survives.
LETTERHEAD_SLUGS = {
    "Bilingual Split": "split",
    "Centered Mark": "center",
    "Hairline Minimal": "minimal",
}

_LH_BLOCK = re.compile(r"<!--BND lh=([\w-]+)-->(.*?)<!--BND-END-->", re.S)


def _sync_letterhead(settings=None):
    """Create/refresh the bilingual Letter Head from letterhead/*.html.

    THREE SELECTIONS HAPPEN AT SYNC, so the stored record is one concrete
    thing: the COMPOSITION (`print_letterhead` picks a marked block — the
    print sheet's pole mechanism on HTML), the COLOURS (var(--bnd-*)
    substituted through palette.derive(), because a PDF header renders in
    isolation where custom properties never resolve), and the LOGO (the
    theme's own raster logo replaces the `__BND_THEME_LOGO__` placeholder —
    theme wins, Company falls back, SVG never rides: the email RASTER rule).

    Set as default ONLY when the site has no default letter head (respect
    the admin's choice, same policy as the print style). Under `Frappe's own`
    this returns before touching anything.
    """
    from bunood_theme.email import RASTER_SUFFIXES, substitute, tokens

    doc = settings or frappe.get_cached_doc("Theme Settings")
    pole = doc.get("print_letterhead") or "Bilingual Split"
    if pole not in LETTERHEAD_SLUGS:
        # "Frappe's own" — and any future value this table does not know reads
        # as a stand-down rather than a guess, the assembly doctrine.
        return
    slug = LETTERHEAD_SLUGS[pole]

    lh_dir = os.path.join(os.path.dirname(BASE), "letterhead")
    header = open(os.path.join(lh_dir, "bunood_letterhead_header.html"), encoding="utf-8").read()
    footer = open(os.path.join(lh_dir, "bunood_letterhead_footer.html"), encoding="utf-8").read()

    found = {m.group(1) for m in _LH_BLOCK.finditer(header)}
    if slug not in found:
        raise KeyError(
            f"print_letterhead is {pole!r} and the header file has no <!--BND lh={slug}--> block"
        )
    header = _LH_BLOCK.sub(lambda m: m.group(2) if m.group(1) == slug else "", header)

    logo = (doc.get("logo") or "").strip()
    if not logo.lower().endswith(RASTER_SUFFIXES):
        logo = ""
    # ESCAPE FOR THE JINJA STRING LITERAL ONLY — backslash and double-quote,
    # nothing else. The value flows to `{{ logo | e }}` at render, which owns
    # the HTML escaping; the first cut used escape_html here TOO, and the
    # review walked the double-escape end to end: a logo at /files/a&b.png
    # rendered src="/files/a&amp;amp;b.png" and 404'd on every printout.
    literal = logo.replace("\\", "\\\\").replace('"', '\\"')
    header = header.replace("__BND_THEME_LOGO__", literal)

    tok = tokens("light")
    header = substitute(header, tok)
    footer = substitute(footer, tok)

    meta = frappe.get_meta("Letter Head")
    values = {"content": header, "footer": footer, "disabled": 0}
    if meta.has_field("source"):
        values["source"] = "HTML"
    if meta.has_field("footer_source"):
        values["footer_source"] = "HTML"

    if frappe.db.exists("Letter Head", STYLE_NAME):
        lh = frappe.get_doc("Letter Head", STYLE_NAME)
        if any(lh.get(k) != v for k, v in values.items()):
            lh.update(values)
            lh.save(ignore_permissions=True)
    else:
        lh = frappe.get_doc(
            {"doctype": "Letter Head", "letter_head_name": STYLE_NAME, **values}
        )
        lh.insert(ignore_permissions=True, ignore_if_duplicate=True)

    _adopt_letterhead_default()


def _company_cr_field():
    """A dedicated Commercial Registration field on Company.

    (Merged from the parallel session.) Company ships `tax_id` for VAT and
    nothing for the CR — only `registration_details`, a free-text Code field
    meant for prose. A KSA printout needs the number on its own, so give it
    somewhere to live. The header falls back to registration_details for
    sites that already typed it there, so installing this never orphans
    existing data.
    """
    if frappe.db.exists("Custom Field", {"dt": "Company", "fieldname": CR_FIELD}):
        return
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    create_custom_field(
        "Company",
        {
            "fieldname": CR_FIELD,
            "label": "Commercial Registration",
            "fieldtype": "Data",
            "insert_after": "tax_id",
            "translatable": 0,
        },
        ignore_validate=True,
    )


def _adopt_letterhead_default():
    """Claim the default letter head, and RE-claim it when ERPNext takes it.

    (Merged from the parallel session.) is_default used to be set on insert
    only, which loses the race every time: the app installs before any
    Company exists, so we claim it — and then the admin creates a Company,
    ERPNext inserts its own letter head with is_default=1, and ours is
    silently displaced. Measured on a live bench: "Company Letterhead - Grey"
    held the default with a 0-byte footer while ours sat unused, so nothing
    printed a header or footer.

    Only a default that CANNOT satisfy the requirement is displaced — one
    with no footer at all. The owner's spec is address/phone/email on every
    printout; a footerless letter head cannot deliver it. A default that does
    carry a footer is a deliberate choice and is left alone. Discriminating
    on the footer rather than on names like "Company Letterhead%" keeps this
    from rotting when ERPNext renames its template. Reached only through
    _sync_letterhead, so `Frappe's own` (which returns before syncing) also
    never claims — the stand-down stays total.
    """
    current = frappe.db.get_value("Letter Head", {"is_default": 1}, "name")
    if current == STYLE_NAME:
        return
    if current and (frappe.db.get_value("Letter Head", current, "footer") or "").strip():
        return
    lh = frappe.get_doc("Letter Head", STYLE_NAME)
    lh.is_default = 1
    # save(), not db.set_value: the controller is what clears the flag on the
    # letter head that held it before.
    lh.save(ignore_permissions=True)


def _sync_format(spec):
    # Skip formats whose doctype isn't installed on this site (app subsets).
    if not frappe.db.exists("DocType", spec["doctype"]):
        return

    html = _read("formats", spec["file"], base=spec.get("dir", BASE))
    values = {
        "doc_type": spec["doctype"],
        "print_format_type": "Jinja",
        # custom_format=1 is REQUIRED: without it Frappe ignores `html` and
        # renders the generic standard layout (frappe/www/printview.py).
        "custom_format": 1,
        "standard": "No",
        "html": html,
        "disabled": 0,
        "default_print_language": "ar",
        # Engine is resolved PER PRINT FORMAT by print_utils.get_print, never
        # from Print Settings, and frappe ships a patch that stamps every
        # format with "wkhtmltopdf" -- so this field is the only place the
        # choice takes effect, and it is managed here so it self-heals on
        # migrate. (Merged from the parallel session, which measured the
        # chrome generator DROPPING the page footer on the same invoice --
        # stock "Standard" loses its footer under chrome too, the control
        # that settles it -- so chrome means no address, phone or email on
        # any printout. wkhtmltopdf it is.)
        "pdf_generator": "wkhtmltopdf",
    }
    if frappe.db.exists("Module Def", MODULE):
        values["module"] = MODULE

    if frappe.db.exists("Print Format", spec["name"]):
        pf = frappe.get_doc("Print Format", spec["name"])
        # Compare EVERY managed field so drift (incl. custom_format on already-
        # deployed sites) self-heals; second run stays a true no-op.
        if any(pf.get(k) != v for k, v in values.items()):
            pf.update(values)
            pf.save(ignore_permissions=True)
    else:
        pf = frappe.get_doc({"doctype": "Print Format", "name": spec["name"], **values})
        pf.insert(ignore_permissions=True, ignore_if_duplicate=True)


def resync_print_brand(settings=None):
    """Re-substitute the two brand carriers after a Theme Settings save.

    Narrower than :func:`sync_print_theme` on purpose: the format records
    carry no colour (their look lives in the Print Style), so a settings save
    only needs the style sheet and the letterhead rewritten. Each step keeps
    the same never-blocks guard the full sync has.
    """
    try:
        _sync_style(settings)
    except Exception:
        frappe.log_error(
            title="bunood_theme: print style resync failed"[:140],
            message=frappe.get_traceback(),
        )
    try:
        _sync_letterhead(settings)
    except Exception:
        frappe.log_error(
            title="bunood_theme: letterhead resync failed"[:140],
            message=frappe.get_traceback(),
        )
