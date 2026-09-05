"""The Phase-1 QR: computed at print time, because Phase 1 stores nothing.

Phase 2 (integration) leaves artefacts a format can read — an image field on
the invoice, or ksa_compliance's "Sales Invoice Additional Fields" record.
Phase 1 (generation), which is every company before its integration wave,
leaves none: the TLV (seller, VAT number, timestamp, grand total, VAT) is
built when the document is rendered, from "ZATCA Phase 1 Business Settings".
``printing.jinja.bunood_zatca_qr_src`` tries the stored artefacts first and
falls through to :func:`phase1_qr_src` last; the order is safe because
ksa_compliance refuses Phase 1 and Phase 2 both Active for one company.
"""

import frappe

from bunood_theme.zatca import PHASE1_DOCTYPE

_INVOICE_DOCTYPES = ("Sales Invoice", "POS Invoice")


def phase1_qr_src(doc):
    """A ``data:`` PNG for the invoice's Phase-1 QR, or ``""``.

    Inert — returns ``""`` without ever importing ksa_compliance — unless the
    Phase-1 doctype exists on the site. ksa_compliance's own generator returns
    nothing for a company with no Active settings row, so a Disabled row
    degrades the same way. Exceptions propagate on purpose: the caller owns
    the never-crash guard and the error log, so a failure is recorded once.
    """
    if not doc.get("name") or doc.get("doctype") not in _INVOICE_DOCTYPES:
        return ""
    if not frappe.db.exists("DocType", PHASE1_DOCTYPE):
        return ""
    from ksa_compliance.jinja import get_zatca_phase_1_qr_for_invoice

    value = get_zatca_phase_1_qr_for_invoice(doc.name)
    return "data:image/png;base64," + value if value else ""
