"""Preflight the known vendor Phase1 template without owning or rewriting it.

The pinned template tuple-unpacks settings/address before its warning branch.
Leave customized/upgraded templates alone, and never change tax configuration.
"""
import hashlib

import frappe
from frappe import _
from frappe.www.printview import get_print_format

FORMAT = "ZATCA Phase 1 Print Format"
TEMPLATE_SHA256 = "df2e9f55fb6a8364eb359aa5091029d24b610f773bbb6b59e495a891097165cc"
SETTINGS = "ZATCA Phase 1 Business Settings"


def before_print(doc, method=None, print_settings=None):
    """Native doc_events handler; return untouched or raise actionable guidance."""
    if doc.doctype != "Sales Invoice":
        return
    request = frappe.form_dict
    if request.get("cmd") == "frappe.www.printview.get_html_and_style":
        selected = request.get("print_format") or request.get("format")
    else:
        selected = request.get("format") or request.get("print_format")
    selected = selected or doc.meta.get("default_print_format")
    if selected != FORMAT:
        return
    # Native renderer hooks can replace even the pinned file/DB template.
    # Do not invoke another app's renderer twice or preflight its replacement.
    if frappe.get_hooks("get_print_format_template"):
        return
    template = frappe.get_cached_doc("Print Format", FORMAT)
    if not template.get("custom_format") or template.get("raw_printing") or template.get("disabled"):
        return
    effective_html = get_print_format(doc.doctype, template)
    if hashlib.sha256(effective_html.encode()).hexdigest() != TEMPLATE_SHA256:
        return
    if not frappe.db.exists("DocType", SETTINGS):
        _setup_required()
    settings = frappe.db.get_value(
        SETTINGS, {"company": doc.get("company")}, ["status", "address"], as_dict=True
    )
    if not settings or settings.get("status") != "Active":
        _setup_required()
    address = settings.get("address")
    if not address or not frappe.db.exists("Address", address):
        frappe.throw(
            _("The seller address is missing. Ask your administrator to complete the company address in ZATCA Phase 1 Business Settings before printing this format."),
            title=_("Print setup required"),
        )


def _setup_required():
    frappe.throw(
        _("This print format requires active ZATCA Phase 1 Business Settings for the invoice company. Ask your administrator to review the company setup before printing this format."),
        title=_("Print setup required"),
    )
