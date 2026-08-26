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
#
# Idempotent and defensive: a failure logs and never blocks bench migrate
# (matching the non-blocking ops policy in bunood_erpnext). A substitution
# failure REFUSES TO WRITE rather than writing "" — a stale good sheet beats a
# fresh empty one, and the stand-down is already logged by sheet.print_css.

import os
import re

import frappe

STYLE_NAME = "Bunood"
MODULE = "Bunood Theme"
BASE = os.path.dirname(os.path.abspath(__file__))

# Frappe stock styles the ONE-TIME claim (after_install, and the v0_35_0
# patch for existing sites) may displace; the ongoing sync claims only true
# vacancy — see _sync_style.
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


def _read(*parts):
    with open(os.path.join(BASE, *parts), encoding="utf-8") as f:
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
        _sync_letterhead()
    except Exception:
        frappe.log_error(
            title="bunood_theme: letterhead sync failed"[:140],
            message=frappe.get_traceback(),
        )
    for spec in FORMATS:
        try:
            _sync_format(spec)
        except Exception:
            frappe.log_error(
                title=("bunood_theme: print format sync failed: " + spec["name"])[:140],
                message=frappe.get_traceback(),
            )


def _sync_style(settings=None):
    from bunood_theme.printing.sheet import print_css

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
    if ps.meta.has_field("print_style") and ps.get("print_style") in (None, ""):
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
        if not frappe.db.exists("Letter Head", {"is_default": 1}):
            lh.is_default = 1
        lh.insert(ignore_permissions=True, ignore_if_duplicate=True)


def _sync_format(spec):
    # Skip formats whose doctype isn't installed on this site (app subsets).
    if not frappe.db.exists("DocType", spec["doctype"]):
        return

    html = _read("formats", spec["file"])
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

    Narrower than :func:`sync_print_theme` on purpose: the seven format records
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
