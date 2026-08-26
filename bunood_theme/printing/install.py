# Bunood Print Theme installer — runs on after_install/after_migrate (hooks.py).
#
# Files in this directory are the SOURCE OF TRUTH:
#   bunood_print_style.css  -> Print Style "Bunood" (set as the system default
#                              ONCE — an admin's later choice is respected)
#   formats/*.html          -> Print Format records (Jinja), created/updated.
#                              Managed: local edits are overwritten on migrate —
#                              duplicate a format to customize (see README.md).
#
# Idempotent and defensive: a failure logs and never blocks bench migrate
# (matching the non-blocking ops policy in bunood_erpnext).

import os
import subprocess

import frappe

STYLE_NAME = "Bunood"
MODULE = "Bunood Theme"
# Company has tax_id for VAT but nothing for the commercial registration;
# printing/install.py adds this one so the letter head has a field to read.
CR_FIELD = "bnd_commercial_registration"
BASE = os.path.dirname(os.path.abspath(__file__))

# Styles we are allowed to displace = the ones an app shipped; anything a
# human built is a real choice and is never overridden. Detected by
# `Print Style.standard`, NOT by name: the name list this replaces named
# "Standard" (absent from this frappe) and missed BOTH "Monochrome" and
# "Redesign" -- and Redesign is the DEFAULT of Print Settings.print_style on
# v16, so the guard never fired on a fresh site and this app's entire print
# theme silently never activated. A name list cannot help but rot; the flag
# tracks whatever frappe ships next.

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
        _company_cr_field()
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


def _sync_style():
    _install_riyal_font()
    css = _read("bunood_print_style.css")
    if frappe.db.exists("Print Style", STYLE_NAME):
        style = frappe.get_doc("Print Style", STYLE_NAME)
        if style.css != css or style.get("disabled"):
            style.css = css
            style.disabled = 0
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

    # Set as the system default ONLY when the site still uses a stock style —
    # a System Manager's deliberate choice of another style is never overridden.
    settings = frappe.get_single("Print Settings")
    current = settings.get("print_style")
    if (
        settings.meta.has_field("print_style")
        and current != STYLE_NAME
        and _is_displaceable(current)
    ):
        settings.print_style = STYLE_NAME
        settings.save(ignore_permissions=True)




# fontconfig reads $XDG_DATA_HOME/fonts. compose points that at the shared sites
# volume so every container that renders a PDF sees the same directory; see
# bunood_erpnext/compose.yaml.
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

    Never fatal: a site that cannot write here still prints, it just prints the
    riyal as a missing glyph under wkhtmltopdf -- exactly today's behaviour.
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

    Unset, or a name that no longer resolves, counts as displaceable: there is
    no admin intent to respect in either case.
    """
    if not current:
        return True
    if not frappe.db.exists("Print Style", current):
        return True
    return bool(frappe.db.get_value("Print Style", current, "standard"))


def _sync_letterhead():
    """Create/refresh the bilingual Letter Head from letterhead/*.html.
    Set as default ONLY when the site has no default letter head (respect
    the admin's choice, same policy as the print style)."""
    lh_dir = os.path.join(os.path.dirname(BASE), "letterhead")
    header = open(os.path.join(lh_dir, "bunood_letterhead_header.html"), encoding="utf-8").read()
    footer = open(os.path.join(lh_dir, "bunood_letterhead_footer.html"), encoding="utf-8").read()

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

    Company ships `tax_id` for VAT and nothing for the CR — only
    `registration_details`, a free-text Code field meant for prose. A KSA
    printout needs the number on its own, so give it somewhere to live. The
    header falls back to registration_details for sites that already typed it
    there, so installing this never orphans existing data.
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

    is_default used to be set on insert only, which loses the race every time:
    the app installs before any Company exists, so we claim it — and then the
    admin creates a Company, ERPNext inserts its own letter head with
    is_default=1, and ours is silently displaced. Measured on a live bench:
    "Company Letterhead - Grey" held the default with a 0-byte footer while ours
    sat unused, so nothing printed a header or footer.

    Only a default that CANNOT satisfy the requirement is displaced — one with
    no footer at all. The owner's spec is address/phone/email on every printout;
    a footerless letter head cannot deliver it. A default that does carry a
    footer is a deliberate choice and is left alone. Discriminating on the
    footer rather than on names like "Company Letterhead%" keeps this from
    rotting when ERPNext renames its template.
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
        # Engine is resolved PER PRINT FORMAT by print_utils.get_print, never
        # from Print Settings, and frappe ships a patch that stamps every format
        # with "wkhtmltopdf" -- so this field is the only place the choice takes
        # effect, and it is managed here so it self-heals on migrate.
        #
        # BACK TO wkhtmltopdf, reversing 17afaa7. That commit moved to chrome for
        # ONE reason: the riyal glyph would not embed under wkhtmltopdf. d205b38
        # then fixed that properly by registering the face with fontconfig, so
        # the reason is gone -- and chrome turns out to carry a cost the letter
        # head cannot pay. Measured on a live bench, same invoice, same company:
        #
        #     wkhtmltopdf   34921 B   riyal YES   footer phone/email YES
        #     chrome       235428 B   riyal YES   footer phone/email NO
        #
        # frappe's chrome generator renders the page HEADER and drops the page
        # FOOTER. Not our markup: the stock "Standard" format loses its footer
        # under chrome too, which is the control that settles it. So chrome means
        # no address, phone or email on any printout.
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
