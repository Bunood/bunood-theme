"""Official-edition entry to the team's read-only accounting evidence.

Company permission is checked before any evidence query. The existing team reader
retains row permissions and represents unavailable checks explicitly; this facade
never seeds tenant data or performs accounting writes.
"""

import frappe
from frappe import _

from bunood_theme.accounting_desk import get_accounting_desk


@frappe.whitelist(methods=["GET"])
def read(company: str) -> dict:
    if not company:
        frappe.throw(_("Select a company"))
    doc = frappe.get_doc("Company", company)
    doc.check_permission("read")
    if not set(frappe.get_roles()).intersection({"Accounts User", "Accounts Manager", "Auditor", "System Manager"}):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    return get_accounting_desk(company, doc.default_currency)
