"""A sales invoice is never cancelled, nor deleted, once it is submitted.

The owner (2026-10-14): «فاتورة البيع لا تلغى خالص — من شروط هيئة الضريبة أن الفاتورة لا
تلغى ولا تحذف بعد الحفظ». ksa_compliance refuses the cancel only where ZATCA Phase 2 is
switched on for the company, so a Phase 1 or unconfigured company could still cancel; this
holds for every company. Money or goods given back go through a return (a credit note),
which is itself a sales invoice under the same rule.

A draft was never issued: it may still be deleted. Tests of other apps cancel invoices to
clean up after themselves, so the rule stands aside under ``frappe.flags.in_test`` unless a
test asks for it (``frappe.flags.bnd_enforce_invoice_rules``).
"""

import frappe
from frappe import _

def _enforced() -> bool:
    return not frappe.flags.in_test or bool(frappe.flags.bnd_enforce_invoice_rules)


def refuse_cancel(doc, method=None) -> None:
    """Sales Invoice and POS Invoice ``before_cancel``."""
    if not _enforced():
        return
    frappe.throw(
        _("A sales invoice is never cancelled once it is submitted: a ZATCA requirement. To give money or goods back, make a return (a credit note)."),
        title=_("This invoice cannot be cancelled"),
    )


def refuse_delete(doc, method=None) -> None:
    """Sales Invoice and POS Invoice ``on_trash``: an issued invoice stays, a draft may go.

    Frappe already refuses to delete a submitted document; a cancelled one (from before this
    rule) is refused here, so the record of what was issued stays complete."""
    if not _enforced() or not doc.docstatus:
        return
    frappe.throw(
        _("A sales invoice is never deleted once it is submitted: a ZATCA requirement."),
        title=_("This invoice cannot be deleted"),
    )
