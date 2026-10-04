"""Fail-closed buyer-delivery policy for connector-managed Phase 2 invoices.

KSA Compliance remains the authority for signing, XML and ZATCA transport.
This module only decides whether Bunood may release an existing document.  It
does not onboard a device, submit an invoice, or change business settings.
"""

from __future__ import annotations

import base64
import binascii
import json
from xml.etree import ElementTree

import frappe
from frappe import _


INVOICE_DOCTYPES = frozenset({"Sales Invoice", "POS Invoice"})
PHASE2_FORMATS = {
    "Sales Invoice": "ZATCA Phase 2 Print Format",
    "POS Invoice": "ZATCA Phase 2 Print Format - POS Invoice",
}
CUSTOMER_FORMATS = {
    "Sales Invoice": "Bunood Sales Invoice (A4)",
    "POS Invoice": "Bunood POS Invoice (A4)",
}
ACCEPTED = frozenset({"Accepted", "Accepted with warnings"})


def classify_delivery(*, submitted: bool, regulated: bool, server: str = "",
                      invoice_type: str = "", integration_status: str = "",
                      has_xml: bool = False, has_qr: bool = False,
                      zatca_status: str = "", has_cleared_xml: bool = False) -> str:
    """A testable policy; unknown and ambiguous Phase 2 states never pass."""
    if not submitted:
        return "not_submitted"
    if not regulated:
        return "ready"
    if server != "Production":
        return "sandbox_only"
    if not invoice_type or invoice_type[:2] not in {"01", "02"}:
        return "unknown_type"
    if not has_xml or not has_qr:
        return "not_signed"
    if invoice_type.startswith("01"):
        if (integration_status in ACCEPTED and zatca_status == "CLEARED"
                and has_cleared_xml):
            return "ready"
        return "awaiting_clearance"
    if integration_status == "Ready For Batch":
        return "ready"
    if integration_status in ACCEPTED and zatca_status == "REPORTED":
        return "ready"
    return "reporting_exception"


def _invoice(doctype: str, name: str):
    if doctype not in INVOICE_DOCTYPES:
        frappe.throw(_("Only customer sales and POS invoices can be delivered here."), frappe.PermissionError)
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    return doc


def _settings(company: str):
    if "ksa_compliance" not in frappe.get_installed_apps():
        return None
    if not frappe.db.table_exists("ZATCA Business Settings"):
        return None
    return frappe.db.get_value(
        "ZATCA Business Settings", {"company": company, "status": "Active"},
        ["name", "enable_zatca_integration", "fatoora_server",
         "production_request_id", "production_security_token", "production_secret"], as_dict=True,
    )


def _latest_record(doctype: str, name: str):
    if not frappe.db.table_exists("Sales Invoice Additional Fields"):
        return None
    rows = frappe.get_all(
        "Sales Invoice Additional Fields",
        filters={"sales_invoice": name, "invoice_doctype": doctype, "is_latest": 1},
        fields=["name"], order_by="creation desc", limit=1,
    )
    return frappe.get_doc("Sales Invoice Additional Fields", rows[0].name) if rows else None


def _xml_bytes(value: str | bytes | None, expected_uuid: str = "") -> bytes:
    if not value:
        return b""
    raw = value.encode() if isinstance(value, str) else value
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        return b""
    if root.tag.rsplit("}", 1)[-1] not in {"Invoice", "CreditNote", "DebitNote"}:
        return b""
    if expected_uuid:
        uuid = root.find("{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}UUID")
        if uuid is None or (uuid.text or "").strip() != expected_uuid:
            return b""
    return raw


def _cleared_xml(record) -> tuple[str, bytes]:
    rows = frappe.get_all(
        "ZATCA Integration Log",
        filters={"invoice_additional_fields_reference": record.name},
        fields=["zatca_status", "zatca_message"], order_by="creation desc", limit=1,
    )
    if not rows:
        return "", b""
    log = rows[0]
    if log.zatca_status != "CLEARED":
        return log.zatca_status or "", b""
    try:
        payload = json.loads(log.zatca_message or "{}")
        if payload.get("clearanceStatus") != "CLEARED":
            return "", b""
        encoded = payload.get("clearedInvoice") or ""
        xml = _xml_bytes(base64.b64decode(encoded, validate=True), record.uuid or "")
    except (ValueError, TypeError, binascii.Error):
        return "", b""
    return "CLEARED", xml


def _reported_status(record) -> str:
    rows = frappe.get_all(
        "ZATCA Integration Log",
        filters={"invoice_additional_fields_reference": record.name},
        fields=["zatca_status"], order_by="creation desc", limit=1,
    )
    return rows[0].zatca_status or "" if rows else ""


def delivery_context(doc) -> dict:
    """Internal snapshot; XML stays on the server and is never returned by GET status."""
    settings = _settings(doc.company)
    regulated = bool(settings and settings.enable_zatca_integration)
    context = {
        "regulated": regulated,
        "server": settings.fatoora_server if settings else "",
        "format": PHASE2_FORMATS[doc.doctype] if regulated else CUSTOMER_FORMATS[doc.doctype],
        "record": None,
        "xml": b"",
    }
    if not regulated:
        context["state"] = classify_delivery(submitted=doc.docstatus == 1, regulated=False)
        return context
    record = _latest_record(doc.doctype, doc.name) if doc.docstatus == 1 else None
    context["record"] = record
    signed_xml = _xml_bytes(record.get_signed_xml(), record.uuid or "") if record else b""
    context["has_signed_xml"] = bool(signed_xml)
    invoice_type = record.invoice_type_transaction or "" if record else ""
    zatca_status, cleared_xml = ("", b"")
    if record and invoice_type.startswith("01"):
        zatca_status, cleared_xml = _cleared_xml(record)
    elif record and invoice_type.startswith("02") and record.integration_status in ACCEPTED:
        zatca_status = _reported_status(record)
    context["xml"] = cleared_xml if invoice_type.startswith("01") else signed_xml
    context["state"] = classify_delivery(
        submitted=doc.docstatus == 1,
        regulated=True,
        server=context["server"],
        invoice_type=invoice_type,
        integration_status=record.integration_status or "" if record else "",
        has_xml=bool(signed_xml),
        has_qr=bool(record.qr_code) if record else False,
        zatca_status=zatca_status,
        has_cleared_xml=bool(cleared_xml),
    )
    return context


_REASONS = {
    "not_submitted": "Submit the invoice before sharing or printing it.",
    "sandbox_only": "ZATCA Sandbox documents cannot be delivered to customers.",
    "unknown_type": "The ZATCA invoice type is missing or unrecognized.",
    "not_signed": "The signed ZATCA XML or QR code is not ready yet.",
    "awaiting_clearance": "Wait for ZATCA clearance before delivering this tax invoice.",
    "reporting_exception": "Review the simplified invoice's ZATCA reporting status before delivery.",
}


def require_ready(doc) -> dict:
    context = delivery_context(doc)
    if context["state"] != "ready":
        frappe.throw(_(_REASONS.get(context["state"], "Invoice delivery is not ready.")))
    return context


@frappe.whitelist(methods=["GET"])
def get_delivery_status(doctype: str, name: str) -> dict:
    doc = _invoice(doctype, name)
    context = delivery_context(doc)
    settings = _settings(doc.company) if context["regulated"] else None
    has_csid = bool(settings and all(settings.get(field) for field in (
        "production_request_id", "production_security_token", "production_secret",
    )))
    return {
        "ready": context["state"] == "ready",
        "state": context["state"],
        "reason": _(_REASONS.get(context["state"], "")),
        "regulated": context["regulated"],
        "format": context["format"],
        "has_xml": bool(context["xml"]),
        "record": context["record"].name if context["record"] else "",
        "can_preview_sandbox": bool(
            context["state"] == "sandbox_only" and context["record"]
            and context["record"].uuid and context["record"].qr_code
            and context.get("has_signed_xml")
            and {"Accounts User", "Accounts Manager", "Auditor", "System Manager"}.intersection(frappe.get_roles())
            and context["record"].has_permission("read")
        ),
        "can_queue": bool(
            context["regulated"] and has_csid and context["record"]
            and context["record"].integration_status in {"Ready For Batch", "Resend", "Corrected"}
            and {"Accounts Manager", "System Manager"}.intersection(frappe.get_roles())
        ),
    }


def before_print(doc, method=None, print_settings=None):
    """Protect native printview/download_pdf routes as well as Bunood buttons."""
    if doc.doctype not in INVOICE_DOCTYPES:
        return
    # Only the permission-checked Sandbox preview endpoint sets this binding.
    # A request parameter or a flag for another invoice cannot bypass delivery.
    if (getattr(doc, "_bnd_sandbox_preview", False)
            and getattr(frappe.flags, "bnd_zatca_sandbox_preview", None) == (doc.doctype, getattr(doc, "name", ""))):
        settings = _settings(doc.company)
        if (settings and settings.fatoora_server == "Sandbox"
                and settings.enable_zatca_integration and doc.docstatus == 1):
            return
    context = require_ready(doc)
    if not context["regulated"]:
        return
    request = frappe.form_dict or {}
    selected = request.get("print_format") or request.get("format")
    if selected != context["format"] and not getattr(frappe.flags, "bnd_zatca_delivery_print", False):
        frappe.throw(_("Use the ZATCA Phase 2 print format for this invoice."))
