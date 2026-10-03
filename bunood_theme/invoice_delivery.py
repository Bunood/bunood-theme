"""Explicit, permission-checked customer invoice delivery.

The pilot's wkhtmltopdf cannot fetch assets from the browser's loopback URL.
Generate the attachment with Frappe's Chrome renderer, then let Frappe create
the linked Communication and queue the email. No public File or invoice link.
"""

from html import escape
from xml.etree import ElementTree

import frappe
from frappe.utils import validate_email_address

from bunood_theme.zatca.delivery import (
    CUSTOMER_FORMATS, _invoice, _latest_record, _settings, _xml_bytes, require_ready,
)


@frappe.whitelist(methods=["POST"])
def send_invoice_email(doctype: str, name: str, recipient: str, subject: str, message: str):
    """Send a permitted invoice; Phase 2 mail includes the validated XML."""

    doc = _invoice(doctype, name)
    doc.check_permission("email")
    context = require_ready(doc)

    recipient = (recipient or "").strip()
    subject = (subject or "").strip()
    message = (message or "").strip()
    if not recipient or "," in recipient or ";" in recipient:
        frappe.throw("Enter one customer email address")
    validate_email_address(recipient, throw=True)
    if not subject or not message:
        frappe.throw("Subject and message are required")
    if len(subject) > 300 or len(message) > 10000:
        frappe.throw("The subject or message is too long")

    pdf = _invoice_pdf(doc, context)
    attachments = [{"fname": f"{name}.pdf", "fcontent": pdf}]
    if context["regulated"]:
        attachments.append({"fname": f"{name}.xml", "fcontent": context["xml"]})
    from frappe.core.doctype.communication.email import make

    result = make(
        doctype=doctype,
        name=name,
        recipients=recipient,
        subject=subject,
        content=f"<p>{escape(message).replace(chr(10), '<br>')}</p>",
        attachments=attachments,
        send_email=1,
    )
    return {"communication": result["name"]}


def _invoice_pdf(doc, context: dict, *, as_pdf: bool = True):
    previous = getattr(frappe.flags, "bnd_zatca_delivery_print", False)
    frappe.flags.bnd_zatca_delivery_print = True
    try:
        return frappe.get_print(
            doc.doctype, doc.name, context["format"], doc=doc,
            as_pdf=as_pdf, pdf_generator="chrome",
        )
    finally:
        frappe.flags.bnd_zatca_delivery_print = previous


@frappe.whitelist(methods=["GET"])
def download_customer_invoice(doctype: str, name: str, file_type: str = "pdf"):
    """Authenticated download for manual WhatsApp handoff; never a public URL."""
    doc = _invoice(doctype, name)
    doc.check_permission("print")
    context = require_ready(doc)
    if file_type == "pdf":
        content, extension = _invoice_pdf(doc, context), "pdf"
    elif file_type == "xml" and context["regulated"]:
        content, extension = context["xml"], "xml"
    else:
        frappe.throw("This invoice file is not available", frappe.PermissionError)
    frappe.response.filename = f"{name}.{extension}"
    frappe.response.filecontent = content
    frappe.response.type = "download"
    frappe.response.display_content_as = "attachment"


@frappe.whitelist(methods=["GET"])
def download_sandbox_invoice(doctype: str, name: str):
    """Internal, visibly labelled PDF from existing native Sandbox artifacts.

    Not a customer delivery path, not a submission, and not a QR generator.
    Production and disabled setups cannot use this preview exception.
    """
    content = _render_sandbox_invoice(doctype, name, as_pdf=True)
    frappe.response.filename = f"{name}.sandbox.pdf"
    frappe.response.filecontent = content
    frappe.response.type = "download"
    frappe.response.display_content_as = "attachment"


@frappe.whitelist(methods=["GET"])
def preview_customer_invoice(doctype: str, name: str):
    """Preview a ready customer invoice under the same native delivery policy."""
    doc = _invoice(doctype, name)
    doc.check_permission("print")
    context = require_ready(doc)
    return {"html": _preview_html(_invoice_pdf(doc, context, as_pdf=False))}


@frappe.whitelist(methods=["GET"])
def preview_sandbox_invoice(doctype: str, name: str):
    """Read-only HTML preview; PDF creation remains an explicit user action."""
    return {"html": _preview_html(_render_sandbox_invoice(doctype, name, as_pdf=False))}


def _preview_html(html: str) -> str:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    # This standalone preview owns its actions in the Desk dialog. The native
    # banner's PDF link cannot carry the narrowly bound Sandbox authorization.
    for element in soup.select("script, .action-banner"):
        element.decompose()
    return str(soup)


def _render_sandbox_invoice(doctype: str, name: str, *, as_pdf: bool):
    from frappe import _

    if not {"Accounts User", "Accounts Manager", "Auditor", "System Manager"}.intersection(frappe.get_roles()):
        frappe.throw(_("You do not have access to the ZATCA workspace."), frappe.PermissionError)
    doc = _invoice(doctype, name)
    doc.check_permission("print")
    settings = _settings(doc.company)
    if not (settings and settings.fatoora_server == "Sandbox"
            and settings.enable_zatca_integration and doc.docstatus == 1):
        frappe.throw(_("This preview is only available for submitted Sandbox invoices."))
    record = _latest_record(doctype, name)
    if record:
        record.check_permission("read")
    xml = _xml_bytes(record.get_signed_xml(), record.uuid) if record and record.uuid else b""
    if not (record and record.uuid and record.qr_code and xml):
        frappe.throw(_("The signed ZATCA XML or QR code is not ready yet."))
    # Display the test invoice's actual signed seller VAT, not today's Company
    # master data. Sandbox may issue a certificate for a fixed test VAT number.
    seller_vat = ElementTree.fromstring(xml).find(
        "cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID",
        {"cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
         "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"},
    )
    if seller_vat is None or not (seller_vat.text or "").strip():
        frappe.throw(_("The signed ZATCA XML or QR code is not ready yet."))
    previous = getattr(frappe.flags, "bnd_zatca_sandbox_preview", None)
    previous_label = getattr(doc, "_bnd_sandbox_preview", False)
    previous_vat = getattr(doc, "_bnd_sandbox_vat", None)
    frappe.flags.bnd_zatca_sandbox_preview = (doctype, name)
    doc._bnd_sandbox_preview = True
    doc._bnd_sandbox_vat = seller_vat.text.strip()
    try:
        content = frappe.get_print(
            doctype, name, CUSTOMER_FORMATS[doctype], doc=doc,
            as_pdf=as_pdf, pdf_generator="chrome", no_letterhead=1,
        )
    finally:
        frappe.flags.bnd_zatca_sandbox_preview = previous
        doc._bnd_sandbox_preview = previous_label
        doc._bnd_sandbox_vat = previous_vat
    return content
