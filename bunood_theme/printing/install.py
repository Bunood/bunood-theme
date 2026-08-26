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

import frappe

STYLE_NAME = "Bunood"
MODULE = "Bunood Theme"
BASE = os.path.dirname(os.path.abspath(__file__))

# Frappe stock styles we are allowed to displace; anything else = admin choice.
STOCK_STYLES = (None, "", "Modern", "Classic", "Standard")

FORMATS = [
    {"name": "بونود - فاتورة ضريبية (A4)", "doctype": "Sales Invoice", "file": "sales_invoice_tax_a4.html"},
    {"name": "بونود - فاتورة ضريبية مبسطة (A4)", "doctype": "Sales Invoice", "file": "sales_invoice_simplified_a4.html"},
    {"name": "بونود - فاتورة ضريبية (حراري 80مم)", "doctype": "Sales Invoice", "file": "sales_invoice_tax_thermal.html"},
    {"name": "بونود - فاتورة مبسطة (حراري 80مم)", "doctype": "Sales Invoice", "file": "sales_invoice_simplified_thermal.html"},
    {"name": "بونود - فاتورة (نقطي)", "doctype": "Sales Invoice", "file": "sales_invoice_matrix.html"},
    {"name": "زاتكا - فاتورة مبسطة (حراري 80مم)", "doctype": "Sales Invoice", "file": "sales_invoice_zatca_thermal.html"},
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


def _sync_style():
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
    if settings.meta.has_field("print_style") and settings.get("print_style") in STOCK_STYLES:
        settings.print_style = STYLE_NAME
        settings.save(ignore_permissions=True)


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
