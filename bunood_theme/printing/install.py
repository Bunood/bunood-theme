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

# THE NAMES CARRY NO BRAND (the owner, 2026-10-15: «غير اسماء نماذج الطباعه»), so a future
# rebrand never renames a record again. The old names, and what each became, are the single
# mapping in patches/v0_60_0/print_format_names.py (RENAMES); the installer creates ONLY these,
# so a migrate after that patch makes no duplicates. The names themselves are printing/names.py.
from bunood_theme.printing.names import (  # noqa: E402
    DELIVERY_NOTE_A4, GIFT_RECEIPT_80, JOURNAL_A4, LETTERHEAD_NAME, MATRIX_INVOICE, POS_SUFFIX, PROFORMA_A4,
    PURCHASE_INVOICE_A4, PURCHASE_ORDER_A4, PURCHASE_RECEIPT_A4, QUOTATION_A4, SALES_ORDER_A4, SHIFT_REPORT_80,
    SIMPLIFIED_INVOICE_A4, SIMPLIFIED_RECEIPT_58, SIMPLIFIED_RECEIPT_80, STATEMENT_A4, STOCK_ENTRY_A4, STYLE_NAME,
    TAX_INVOICE_A4, TAX_RECEIPT_80, VOUCHER_A4, VOUCHER_A5,
)

MODULE = "Bunood Theme"
DEFAULT_SALES_FORMAT = TAX_INVOICE_A4
DEFAULT_QUOTATION_FORMAT = QUOTATION_A4
DEFAULT_PAYMENT_FORMAT = VOUCHER_A4
JOURNAL_FORMAT = JOURNAL_A4
CUSTOMER_STATEMENT_FORMAT = STATEMENT_A4
CREDIT_SALE = "On Credit"
from bunood_theme.payments import SETTLEMENT_METHODS  # noqa: E402  (one list: the checkout's)
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

#: The kit's formats (the owner's redesign, 2026-10-15). Each family is ONE template under
#: templates/print/ with switches; a format file only sets them. Every one renders on Chromium,
#: the release engine, and carries its own page chrome. The sales receipts and A4s have a POS
#: Invoice twin (« - نقطة البيع») wherever a counter prints that doctype.
_SALES = [
    (TAX_INVOICE_A4, "sales_invoice_tax_a4.html"),
    (SIMPLIFIED_INVOICE_A4, "sales_invoice_simplified_a4.html"),
    (SIMPLIFIED_RECEIPT_80, "sales_invoice_simplified_thermal.html"),
    (SIMPLIFIED_RECEIPT_58, "sales_invoice_simplified_thermal_58.html"),
    (TAX_RECEIPT_80, "sales_invoice_tax_thermal.html"),
    (GIFT_RECEIPT_80, "gift_receipt_thermal.html"),
    (MATRIX_INVOICE, "sales_invoice_matrix.html"),
]
FORMATS = [
    *({"name": name, "doctype": "Sales Invoice", "file": file, "pdf_generator": "chrome"} for name, file in _SALES),
    *({"name": name + POS_SUFFIX, "doctype": "POS Invoice", "file": file, "pdf_generator": "chrome"}
      for name, file in _SALES if name != MATRIX_INVOICE),
    {"name": QUOTATION_A4, "doctype": "Quotation", "file": "quotation_a4.html", "pdf_generator": "chrome"},
    {"name": SALES_ORDER_A4, "doctype": "Sales Order", "file": "sales_order_a4.html", "pdf_generator": "chrome"},
    {"name": PROFORMA_A4, "doctype": "Sales Order", "file": "proforma_a4.html", "pdf_generator": "chrome"},
    {"name": DELIVERY_NOTE_A4, "doctype": "Delivery Note", "file": "delivery_note_a4.html", "pdf_generator": "chrome"},
    {"name": PURCHASE_INVOICE_A4, "doctype": "Purchase Invoice", "file": "purchase_invoice_a4.html", "pdf_generator": "chrome"},
    {"name": PURCHASE_ORDER_A4, "doctype": "Purchase Order", "file": "purchase_order_a4.html", "pdf_generator": "chrome"},
    {"name": PURCHASE_RECEIPT_A4, "doctype": "Purchase Receipt", "file": "purchase_receipt_a4.html", "pdf_generator": "chrome"},
    {"name": STOCK_ENTRY_A4, "doctype": "Stock Entry", "file": "stock_entry_a4.html", "pdf_generator": "chrome"},
    {"name": VOUCHER_A5, "doctype": "Payment Entry", "file": "payment_entry_voucher_a5.html", "pdf_generator": "chrome"},
    {"name": DEFAULT_PAYMENT_FORMAT, "doctype": "Payment Entry", "file": "payment_entry_voucher.html", "pdf_generator": "chrome"},
    {"name": JOURNAL_FORMAT, "doctype": "Journal Entry", "file": "journal_entry_voucher.html", "pdf_generator": "chrome"},
    {"name": SHIFT_REPORT_80, "doctype": "POS Closing Entry", "file": "pos_closing_shift_thermal.html", "pdf_generator": "chrome"},
    {"name": CUSTOMER_STATEMENT_FORMAT, "report": "General Ledger", "file": "customer_statement.html", "pdf_generator": "chrome"},
]


def _read(*parts, base=BASE):
    """A file under this package by default; ``base`` lets a spec that lives in
    another package (``bunood_theme.zatca``) be read from its own directory."""
    with open(os.path.join(base, *parts), encoding="utf-8") as f:
        return f.read()


def sync_print_theme():
    """Create/refresh the Bunood Print Style + Print Formats + Letter Head.

    Integration v0.48.0: the capability's site-wide configuration steps --
    ``_sync_pdf_generator`` (Print Settings engine -> chrome, repeat header),
    ``adopt_business_print_formats`` (default formats), and the two
    ``configure_*_for_mvp`` steps (Payment Entry mode reqd/Cash, Sales Invoice
    settlement field) -- change tenant configuration outside the print theme and
    are HELD pending the owner's approval. They stay defined and can be run
    deliberately with ``bench execute``; migrate does not call them.
    """
    try:
        _sync_style()
    except Exception:
        frappe.log_error(
            title="bunood_theme: print style sync failed"[:140],
            message=frappe.get_traceback(),
        )
    try:
        _company_cr_field()
        _company_print_fields()
        _reprint_fields()
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
PRINT_FONT_FILES = (
    os.path.join("public", "fonts", "riyal", "bunood-riyal.otf"),
    os.path.join("public", "fonts", "tajawal", "Tajawal-Regular.ttf"),
    os.path.join("public", "fonts", "tajawal", "Tajawal-Medium.ttf"),
    os.path.join("public", "fonts", "tajawal", "Tajawal-Bold.ttf"),
    os.path.join("public", "fonts", "tajawal", "Tajawal-ExtraBold.ttf"),
)


def _install_print_fonts():
    """Register the Bunood print faces with fontconfig for wkhtmltopdf.

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
    dest_dir = os.path.join(frappe.utils.get_bench_path(), "sites", FONT_SUBDIR)
    try:
        os.makedirs(dest_dir, exist_ok=True)
        changed = False
        for relative_path in PRINT_FONT_FILES:
            src = os.path.join(os.path.dirname(BASE), relative_path)
            if not os.path.exists(src):
                continue
            with open(src, "rb") as fh:
                want = fh.read()
            dest = os.path.join(dest_dir, os.path.basename(src))
            if os.path.exists(dest):
                with open(dest, "rb") as fh:
                    if fh.read() == want:
                        continue
            with open(dest, "wb") as fh:
                fh.write(want)
            changed = True
        if not changed:
            return
        # Best effort: fontconfig rescans a stale directory on its own, so a
        # missing fc-cache costs a little startup time, not correctness.
        subprocess.run(["fc-cache", "-f", dest_dir], capture_output=True, timeout=60)
    except Exception:
        frappe.log_error(
            title="bunood_theme: print fonts not registered with fontconfig",
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


def _adopt_default_print_format(doctype: str, format_name: str) -> None:
    """Adopt a managed format unless an administrator owns the override."""
    if not frappe.db.exists("Print Format", format_name):
        return
    setter = frappe.db.get_value(
        "Property Setter",
        {"doc_type": doctype, "property": "default_print_format"},
        ["name", "value", "is_system_generated", "doctype_or_field"],
        as_dict=True,
    )
    if setter and not setter.is_system_generated:
        return
    if setter and setter.value == format_name and setter.doctype_or_field == "DocType":
        return
    frappe.make_property_setter(
        {
            "doctype": doctype,
            "doctype_or_field": "DocType",
            "property": "default_print_format",
            "value": format_name,
            "property_type": "Data",
        },
        is_system_generated=True,
    )
    frappe.clear_cache(doctype=doctype)


def adopt_sales_invoice_print_format() -> None:
    """Compatibility entry point retained for the existing v0.44.6 patch.

    The setup wizard installs a system-generated Property Setter pointing to
    ``Sales Invoice with Item Image``. Replacing that stock setter is safe;
    any administrator-created (non-system) setter is preserved. The setter must
    target ``DocType``: an empty-field ``DocField`` setter is persisted but never
    reaches ``frappe.get_meta(...).default_print_format``.
    """
    _adopt_default_print_format("Sales Invoice", DEFAULT_SALES_FORMAT)


def adopt_business_print_formats() -> None:
    """Make every day-one commercial document open on the branded format."""
    _adopt_default_print_format("Sales Invoice", DEFAULT_SALES_FORMAT)
    _adopt_default_print_format("Quotation", DEFAULT_QUOTATION_FORMAT)
    _adopt_default_print_format("Payment Entry", DEFAULT_PAYMENT_FORMAT)


def configure_payment_entry_for_mvp() -> None:
    """Require an explicit payment method and make Cash the safe first choice.

    The account remains ERPNext's responsibility: choosing a mode resolves its
    company mapping, while paid_from/paid_to remain visible in simple mode.
    """
    if not frappe.db.exists("DocType", "Payment Entry"):
        return
    for prop, value, property_type in (("reqd", "1", "Check"), ("default", "Cash", "Text")):
        frappe.make_property_setter(
            {
                "doctype": "Payment Entry",
                "fieldname": "mode_of_payment",
                "property": prop,
                "value": value,
                "property_type": property_type,
            },
            is_system_generated=True,
        )
    frappe.clear_cache(doctype="Payment Entry")


def configure_sales_invoice_for_mvp() -> None:
    """Configure one truthful settlement choice for the invoice workbench.

    ``On Credit`` and ``Mixed Payment`` are workflow choices, deliberately not
    Mode of Payment masters. The first leaves ERPNext's receivable outstanding;
    the second submits one Cash and one Network Payment Entry through the native
    mapper and controller. Cash and Network are the actual payment methods
    provisioned by :mod:`bunood_theme.payments`. A Select keeps unmapped or
    accidental Mode of Payment records out of the sales UI, where they would
    otherwise fail only after the operator tried to post.
    """
    if not frappe.db.exists("DocType", "Sales Invoice"):
        return

    # The stock Standard print format derives its columns from child metadata.
    # Keep the human-facing name as the product identity there too; Bunood's
    # managed formats retain the code as a quieter secondary reference.
    if frappe.db.exists("DocType", "Sales Invoice Item"):
        for fieldname, print_hide in (("item_name", "0"), ("item_code", "1")):
            frappe.make_property_setter(
                {
                    "doctype": "Sales Invoice Item",
                    "fieldname": fieldname,
                    "property": "print_hide",
                    "value": print_hide,
                    "property_type": "Check",
                },
                is_system_generated=True,
            )
        frappe.clear_cache(doctype="Sales Invoice Item")

    legacy_name = "Sales Invoice-bunood_payment_method"
    if frappe.db.exists("Custom Field", legacy_name):
        legacy = frappe.get_doc("Custom Field", legacy_name)
        if not legacy.hidden:
            legacy.hidden = 1
            legacy.save(ignore_permissions=True)

    name = "Sales Invoice-bunood_settlement_method"
    values = {
        "label": "Settlement Method",
        "fieldtype": "Select",
        "options": "\n".join(SETTLEMENT_METHODS),
        "default": CREDIT_SALE,
        "insert_after": "due_date",
        "allow_on_submit": 1,
        "description": "On Credit posts to Accounts Receivable. Cash or Network opens a native Payment Entry. Mixed Payment posts two native Payment Entries after explicit confirmation.",
    }
    if frappe.db.exists("Custom Field", name):
        field = frappe.get_doc("Custom Field", name)
        changed = False
        for key, value in values.items():
            if field.get(key) != value:
                field.set(key, value)
                changed = True
        if changed:
            field.save(ignore_permissions=True)
    else:
        frappe.get_doc(
            {
                "doctype": "Custom Field",
                "dt": "Sales Invoice",
                "fieldname": "bunood_settlement_method",
                **values,
            }
        ).insert(ignore_permissions=True)
    frappe.clear_cache(doctype="Sales Invoice")


def _sync_style(settings=None):
    from bunood_theme.printing.sheet import print_css

    _install_print_fonts()
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
    from bunood_theme.presets import PRINT_DEFAULTS

    doc = settings or frappe.get_cached_doc("Theme Settings")
    pole = doc.get("print_letterhead") or PRINT_DEFAULTS["print_letterhead"]
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

    if frappe.db.exists("Letter Head", LETTERHEAD_NAME):
        lh = frappe.get_doc("Letter Head", LETTERHEAD_NAME)
        if any(lh.get(k) != v for k, v in values.items()):
            lh.update(values)
            lh.save(ignore_permissions=True)
    else:
        lh = frappe.get_doc(
            {"doctype": "Letter Head", "letter_head_name": LETTERHEAD_NAME, **values}
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


#: The print profile's fields on Company (the owner, 2026-10-15: the header names the company
#: in Arabic AND English; the footer carries its address and contact methods; its policy prints
#: under the footer). The theme installs them, like the CR above; the business «المنشأة» screen
#: edits them («بيانات الطباعة»). phone_no, email and website are stock and reused.
POLICY_HINT = (
    "Printed in small type under the footer of every document: a return and exchange policy, "
    "a warranty note, opening hours. The Ministry of Commerce bans the phrase "
    "«البضاعة المباعة لا ترد ولا تستبدل»; write the real return and exchange terms instead."
)
PRINT_FIELDS = [
    {"fieldname": "bnd_print_section", "fieldtype": "Section Break", "label": "Print Profile",
     "insert_after": CR_FIELD, "collapsible": 0},
    {"fieldname": "bnd_company_name_ar", "fieldtype": "Data", "label": "Company Name in Arabic",
     "insert_after": "bnd_print_section", "translatable": 0,
     "description": "The Arabic name in the header of every printed document."},
    {"fieldname": "bnd_company_name_en", "fieldtype": "Data", "label": "Company Name in English",
     "insert_after": "bnd_company_name_ar", "translatable": 0,
     "description": "The English name in the header of every printed document."},
    {"fieldname": "bnd_mobile", "fieldtype": "Data", "label": "Mobile / WhatsApp", "options": "Phone",
     "insert_after": "bnd_company_name_en", "translatable": 0},
    {"fieldname": "bnd_print_cb", "fieldtype": "Column Break", "insert_after": "bnd_mobile"},
    {"fieldname": "bnd_instagram", "fieldtype": "Data", "label": "Instagram", "insert_after": "bnd_print_cb", "translatable": 0},
    {"fieldname": "bnd_x", "fieldtype": "Data", "label": "X (Twitter)", "insert_after": "bnd_instagram", "translatable": 0},
    {"fieldname": "bnd_snapchat", "fieldtype": "Data", "label": "Snapchat", "insert_after": "bnd_x", "translatable": 0},
    {"fieldname": "bnd_tiktok", "fieldtype": "Data", "label": "TikTok", "insert_after": "bnd_snapchat", "translatable": 0},
    {"fieldname": "bnd_print_policy", "fieldtype": "Small Text", "label": "Company Policy",
     "insert_after": "bnd_tiktok", "translatable": 0, "description": POLICY_HINT},
]


#: A printed invoice's own print count (printing/reprint.py): its second and later prints say
#: «نسخة مكررة». Hidden, read-only, never copied to a duplicate, an amendment or a return.
REPRINT_FIELD = {"fieldname": "bnd_print_count", "fieldtype": "Int", "label": "Print Count", "default": "0",
                 "insert_after": "amended_from", "read_only": 1, "hidden": 1, "no_copy": 1, "print_hide": 1,
                 "allow_on_submit": 1, "report_hide": 1}
REPRINT_DOCTYPES = ("Sales Invoice", "POS Invoice")


def _reprint_fields():
    """The print count on the invoices (additive; created and reconciled on every migrate)."""
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

    create_custom_fields({doctype: [dict(REPRINT_FIELD)] for doctype in REPRINT_DOCTYPES if frappe.db.exists("DocType", doctype)},
                         ignore_validate=True, update=True)


def _company_print_fields():
    """Create — and reconcile on every migrate, since the labels are ours — the print profile's
    fields on Company. Additive: nothing is renamed or removed, so no tenant data moves."""
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

    create_custom_fields({"Company": PRINT_FIELDS}, ignore_validate=True, update=True)


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
    if current == LETTERHEAD_NAME:
        return
    if current and (frappe.db.get_value("Letter Head", current, "footer") or "").strip():
        return
    lh = frappe.get_doc("Letter Head", LETTERHEAD_NAME)
    lh.is_default = 1
    # save(), not db.set_value: the controller is what clears the flag on the
    # letter head that held it before.
    lh.save(ignore_permissions=True)


#: A format authored in tokens. Its colours are substituted per site at sync, like the
#: Letter Head's, because a print renders where no desk custom property resolves.
_TOKEN_MARK = "var(--bnd-"


def _format_html(spec) -> str:
    return _read("formats", spec["file"], base=spec.get("dir", BASE))


def _sync_format(spec, settings=None):
    is_report = bool(spec.get("report"))
    target = spec.get("report") if is_report else spec.get("doctype")
    target_type = "Report" if is_report else "DocType"
    if not target or not frappe.db.exists(target_type, target):
        return

    html = _format_html(spec)
    if _TOKEN_MARK in html:
        # The customer statement's colours (zerONE, 2026-10-15): it named a green of its
        # own on every tenant. `substitute` THROWS on a token it cannot resolve, so the
        # caller logs and the record keeps its last good HTML rather than a half-coloured one.
        from bunood_theme.email import substitute, tokens

        html = substitute(html, tokens("light", settings))
    values = {
        "print_format_for": "Report" if is_report else "DocType",
        # Report print formats use Frappe's client-side microtemplate engine;
        # document formats use server-side Jinja. Mixing the two makes report
        # templates fail validation before they ever reach the print dialog.
        "print_format_type": "JS" if is_report else "Jinja",
        # custom_format=1 is REQUIRED: without it Frappe ignores `html` and
        # renders the generic standard layout (frappe/www/printview.py).
        "custom_format": 1,
        "standard": "No",
        "html": html,
        "disabled": 0,
        "default_print_language": "ar",
        # A Print Format overrides Print Settings, so each managed format must
        # repeat the release engine explicitly. The production image includes
        # Chromium and publishes chromium_path; wkhtmltopdf cannot resolve the
        # tenant host inside the isolated backend container and fails downloads.
        # Integration v0.48.0: official formats keep main's engine decision
        # (wkhtmltopdf -- chrome was measured dropping the page footer). Only the
        # capability's NEW formats, designed and regression-tested on chrome,
        # declare it in their spec. Print Settings is not touched.
        "pdf_generator": spec.get("pdf_generator", "wkhtmltopdf"),
    }
    if is_report:
        values["report"] = target
        values["doc_type"] = None
    else:
        values["doc_type"] = target
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


def _sync_pdf_generator():
    """Keep the site-wide fallback aligned with the release PDF engine.

    Frappe uses this value for Standard and for every format without its own
    engine selection. This stack deliberately ships Chromium only; allowing the
    wkhtmltopdf default to survive makes an otherwise valid Print action fail at
    the network-fetch stage. The compact managed letterhead cancels Frappe
    v16's negative isolated-header margin, so the supported repeat mode can
    carry the identity and page footer across every A4 page.
    """
    settings = frappe.get_single("Print Settings")
    changed = False
    if settings.meta.has_field("pdf_generator") and settings.pdf_generator != "chrome":
        settings.pdf_generator = "chrome"
        changed = True
    if settings.meta.has_field("repeat_header_footer") and not settings.repeat_header_footer:
        settings.repeat_header_footer = 1
        changed = True
    if changed:
        settings.save(ignore_permissions=True)


def resync_print_brand(settings=None):
    """Re-substitute the two brand carriers after a Theme Settings save.

    Narrower than :func:`sync_print_theme` on purpose: most format records
    carry no colour (their look lives in the Print Style), so a settings save
    rewrites the style sheet, the letterhead and only the formats authored in
    tokens (the customer statement). Each step keeps the same never-blocks
    guard the full sync has.
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
    # The third carrier: a format authored in tokens holds this site's concrete colours,
    # so a seed change re-papers it too. Formats without tokens carry no colour of the
    # seed's and are left to the full sync.
    for spec in FORMATS + zatca.FORMATS:
        try:
            if _TOKEN_MARK in _format_html(spec):
                _sync_format(spec, settings)
        except Exception:
            frappe.log_error(
                title=("bunood_theme: print format resync failed: " + spec["name"])[:140],
                message=frappe.get_traceback(),
            )
