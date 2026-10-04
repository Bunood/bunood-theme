"""Read-only facade over the optional KSA Compliance/ZATCA integration.

The cryptographic and UBL implementation belongs to ``ksa_compliance``; this
module duplicates none of that regulated code. It reads a company's connector
setup and its invoices' native ZATCA records for the ZATCA workspace
(``bnd-zatca``), never returns CSID credentials, never changes a tenant from
Sandbox to Production, and sends nothing: the team's queue/submit endpoints
(release 0a8b549) are not part of this module.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _


ACCEPTED = {"Accepted", "Accepted with warnings"}
SENDABLE = {"Ready For Batch", "Resend", "Corrected"}
INVOICE_DOCTYPES = {"Sales Invoice", "POS Invoice"}
WORKSPACE_ROLES = {"Accounts User", "Accounts Manager", "Auditor", "System Manager"}


def classify_status(
    *,
    installed: bool,
    settings_exists: bool,
    enabled: bool,
    compliance_ready: bool,
    production_ready: bool,
    invoice_status: str = "",
    submitted: bool = False,
) -> str:
    """Return the user-facing integration state without touching Frappe."""
    if not installed:
        return "missing_app"
    if not settings_exists:
        return "needs_settings"
    if not enabled:
        return "disabled"
    if not compliance_ready:
        return "needs_onboarding"
    if not production_ready:
        return "needs_csid"
    if invoice_status in ACCEPTED:
        return "accepted_with_warnings" if invoice_status == "Accepted with warnings" else "accepted"
    if invoice_status == "Duplicate":
        # A duplicate transport result is not proof of the original result.  It
        # must be reconciled to an earlier response for this exact UUID/payload
        # before the UI may call the invoice accepted.
        return "duplicate_response"
    if invoice_status == "Rejected":
        return "rejected"
    if invoice_status == "Clearance switched off":
        return "clearance_off"
    if invoice_status in SENDABLE:
        return "ready_to_send"
    if submitted:
        return "preparing"
    return "ready"


def _installed() -> bool:
    return "ksa_compliance" in frappe.get_installed_apps()


def _invoice_doctype(value: str) -> str:
    if value not in INVOICE_DOCTYPES:
        frappe.throw(_("ZATCA status is only available for sales and POS invoices."), frappe.PermissionError)
    return value


def _permitted_context(invoice_name: str | None, company: str | None, invoice_doctype: str):
    invoice = None
    if invoice_name and frappe.db.exists(invoice_doctype, invoice_name):
        invoice = frappe.get_doc(invoice_doctype, invoice_name)
        invoice.check_permission("read")
        company = invoice.company
    elif company:
        frappe.get_doc("Company", company).check_permission("read")
    return invoice, company


def _settings(company: str | None) -> dict[str, Any]:
    if not company or not frappe.db.table_exists("ZATCA Business Settings"):
        return {}
    name = frappe.db.get_value(
        "ZATCA Business Settings", {"company": company, "status": "Active"}, "name"
    )
    if not name:
        return {}
    row = frappe.db.get_value(
        "ZATCA Business Settings",
        name,
        [
            "name",
            "enable_zatca_integration",
            "fatoora_server",
            "type_of_business_transactions",
            "sync_with_zatca",
            "compliance_request_id",
            "security_token",
            "secret",
            "production_request_id",
            "production_security_token",
            "production_secret",
        ],
        as_dict=True,
    )
    return dict(row or {})


def _stored_fields(meta, names: list[str]) -> list[str]:
    """Return fields that this installed connector persists in SQL.

    KSA Compliance exposes a few calculated fields (currently
    ``qr_image_src``) through DocType metadata with ``is_virtual``. Passing a
    virtual field to ``frappe.get_all`` still adds it to the SQL SELECT and
    fails with ``Unknown column``. Deriving the projection from the installed
    metadata keeps this facade compatible without copying the connector's
    version-specific schema.
    """
    stored = []
    for name in names:
        field = meta.get_field(name)
        if field and not getattr(field, "is_virtual", False):
            stored.append(name)
    return stored


def _invoice_record(invoice_name: str | None, invoice_doctype: str = "Sales Invoice") -> dict[str, Any]:
    if not invoice_name or not frappe.db.table_exists("Sales Invoice Additional Fields"):
        return {}
    meta = frappe.get_meta("Sales Invoice Additional Fields")
    filters = {"sales_invoice": invoice_name}
    if meta.get_field("invoice_doctype"):
        filters["invoice_doctype"] = invoice_doctype
    if meta.get_field("is_latest"):
        filters["is_latest"] = 1
    value_fields = _stored_fields(
        meta,
        [
            "integration_status",
            "last_attempt",
            "uuid",
            "invoice_type_code",
            "invoice_type_transaction",
            "validation_messages",
            "validation_errors",
            "qr_image_src",
            "qr_code_image",
            "qr_code",
            "invoice_xml",
        ],
    )
    rows = frappe.get_all(
        "Sales Invoice Additional Fields",
        filters=filters,
        fields=["name", *value_fields],
        order_by="creation desc",
        limit=1,
    )
    if not rows:
        return {}
    row = dict(rows[0])
    # The form needs presence/status, never the full signed XML or QR payload.
    row["has_xml"] = bool(row.pop("invoice_xml", None))
    row["has_qr"] = any(
        bool(row.pop(name, None)) for name in ("qr_image_src", "qr_code_image", "qr_code")
    )
    row["validation_messages"] = (row.get("validation_messages") or "")[:2000]
    row["validation_errors"] = (row.get("validation_errors") or "")[:4000]
    return row


def get_status(invoice_name: str | None = None, company: str | None = None,
               invoice_doctype: str = "Sales Invoice") -> dict[str, Any]:
    """Return a credential-free ZATCA setup and invoice status snapshot.

    Not an endpoint: the workspace reaches it through :func:`get_workspace`,
    which gates it by role first.
    """
    invoice_doctype = _invoice_doctype(invoice_doctype)
    invoice, company = _permitted_context(invoice_name, company, invoice_doctype)
    installed = _installed()
    settings = _settings(company) if installed else {}
    record = _invoice_record(invoice_name, invoice_doctype) if installed else {}
    compliance_ready = bool(
        settings.get("compliance_request_id") and settings.get("security_token") and settings.get("secret")
    )
    production_ready = bool(
        settings.get("production_request_id")
        and settings.get("production_security_token")
        and settings.get("production_secret")
    )
    state = classify_status(
        installed=installed,
        settings_exists=bool(settings),
        enabled=bool(settings.get("enable_zatca_integration")),
        compliance_ready=compliance_ready,
        production_ready=production_ready,
        invoice_status=record.get("integration_status") or "",
        submitted=bool(invoice and int(invoice.docstatus) == 1),
    )
    settings_name = settings.get("name") or ""
    return {
        "installed": installed,
        "company": company or "",
        "state": state,
        "settings": {
            "name": settings_name,
            "enabled": bool(settings.get("enable_zatca_integration")),
            "server": settings.get("fatoora_server") or "",
            "transactions": settings.get("type_of_business_transactions") or "",
            "sync": settings.get("sync_with_zatca") or "",
            "compliance_ready": compliance_ready,
            "production_ready": production_ready,
            "route": ["Form", "ZATCA Business Settings", settings_name]
            if settings_name
            else ["List", "ZATCA Business Settings"],
        },
        "invoice": record,
    }



@frappe.whitelist(methods=["GET"])
def get_invoice_status(invoice_name: str | None = None, company: str | None = None,
                       invoice_doctype: str = "Sales Invoice") -> dict[str, Any]:
    """Read-only invoice-screen projection; native document permissions are authoritative.

    Unsaved forms require both invoice create/read and Company read permission.
    A supplied missing name never silently falls back to a company-wide lookup.
    The workspace-only helper remains internal; connector payloads/logs are omitted.
    """
    invoice_doctype = _invoice_doctype(invoice_doctype)
    if frappe.session.user == "Guest" or not frappe.has_permission(invoice_doctype, "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if invoice_name:
        invoice = frappe.get_doc(invoice_doctype, invoice_name)
        invoice.check_permission("read")
        company = invoice.company
    elif not frappe.has_permission(invoice_doctype, "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not company:
        frappe.throw(_("Select a company"))
    frappe.get_doc("Company", company).check_permission("read")
    snapshot = get_status(invoice_name, company, invoice_doctype)
    settings = snapshot.get("settings") or {}
    record = snapshot.get("invoice") or {}
    safe_settings = {key: settings.get(key) for key in (
        "enabled", "server", "sync", "compliance_ready", "production_ready"
    )}
    if settings.get("route") and frappe.has_permission("ZATCA Business Settings", "read"):
        safe_settings["route"] = settings.get("route") or []
    safe_invoice = {"integration_status": record.get("integration_status") or ""}
    if record.get("name") and frappe.has_permission("Sales Invoice Additional Fields", "read", doc=record["name"]):
        safe_invoice["name"] = record["name"]
    return {"installed": bool(snapshot.get("installed")), "company": company,
            "state": snapshot.get("state"), "settings": safe_settings, "invoice": safe_invoice}


def _recent_evidence(company: str) -> list[dict[str, Any]]:
    """A bounded, permission-filtered view of native connector records.

    First select invoices the user may read for this company. The connector's
    child records are then filtered by those names and by their actual invoice
    DocType, so a same-named Sales/POS invoice cannot be misattributed.
    """
    if not frappe.db.table_exists("Sales Invoice Additional Fields") or not frappe.has_permission(
        "Sales Invoice Additional Fields", "read"
    ):
        return []
    meta = frappe.get_meta("Sales Invoice Additional Fields")
    typed = bool(meta.get_field("invoice_doctype"))
    fields = ["name", "sales_invoice", "creation"]
    fields += _stored_fields(meta, ["invoice_doctype", "integration_status", "invoice_type_code"])
    evidence = []
    for doctype in ("Sales Invoice", "POS Invoice"):
        if doctype == "POS Invoice" and not typed:
            continue
        if not frappe.db.table_exists(doctype):
            continue
        invoices = frappe.get_list(
            doctype,
            filters={"company": company, "docstatus": 1},
            fields=["name"], order_by="creation desc", limit_page_length=200,
        )
        names = [row.name for row in invoices]
        if not names:
            continue
        filters = {"sales_invoice": ["in", names]}
        if typed:
            filters["invoice_doctype"] = doctype
        if meta.get_field("is_latest"):
            filters["is_latest"] = 1
        for row in frappe.get_list(
            "Sales Invoice Additional Fields", filters=filters, fields=fields,
            order_by="creation desc", limit_page_length=12,
        ):
            evidence.append({
                "name": row.name,
                "invoice": row.sales_invoice,
                "doctype": doctype,
                "status": row.get("integration_status") or "",
                "invoice_type": row.get("invoice_type_code") or "",
                "created": str(row.creation),
            })
    return sorted(evidence, key=lambda row: row["created"], reverse=True)[:12]


@frappe.whitelist(methods=["GET"])
def get_workspace(company: str | None = None) -> dict[str, Any]:
    """Read-only ZATCA control desk. No secrets, onboarding or transmission."""
    if not WORKSPACE_ROLES.intersection(frappe.get_roles()):
        frappe.throw(_("You do not have access to the ZATCA workspace."), frappe.PermissionError)
    companies = [row.name for row in frappe.get_list(
        "Company", fields=["name"], order_by="name asc", limit_page_length=0,
    )]
    if company and company not in companies:
        frappe.throw(_("You do not have access to this company."), frappe.PermissionError)
    default_company = frappe.defaults.get_user_default("Company")
    selected = company or (default_company if default_company in companies else (companies[0] if companies else ""))
    if not selected:
        return {"companies": [], "company": "", "status": None, "evidence": [], "can_open_settings": False, "can_read_records": False}
    status = get_status(company=selected)
    can_read_settings = bool(status["installed"] and frappe.db.table_exists("ZATCA Business Settings")
                             and frappe.has_permission("ZATCA Business Settings", "read"))
    can_read_records = bool(status["installed"] and frappe.db.table_exists("Sales Invoice Additional Fields")
                            and frappe.has_permission("Sales Invoice Additional Fields", "read"))
    if not can_read_settings:
        status["settings"]["name"] = ""
        status["settings"]["route"] = []
    return {
        "companies": companies,
        "company": selected,
        "status": status,
        "evidence": _recent_evidence(selected) if can_read_records else [],
        "can_open_settings": can_read_settings,
        "can_read_records": can_read_records,
    }
