"""Read-only Phase 2 Sandbox evidence check for the current test site.

Run with ``bench --site rc20.localhost execute
bunood_theme.acceptance.zatca_sandbox_verify.run``.  Unlike zatca_sandbox.run,
this never creates invoices, changes settings, onboards devices, or contacts
ZATCA.  It reports gaps before a separately approved live Sandbox rehearsal.
"""

from __future__ import annotations

import json

import frappe

from bunood_theme.acceptance.zatca_sandbox import MARKER


def snapshot() -> dict:
    site = frappe.local.site or ""
    if not site.endswith((".test", ".localhost")):
        raise RuntimeError("Sandbox verification is restricted to test sites")
    installed = "ksa_compliance" in frappe.get_installed_apps()
    settings = frappe.db.get_value(
        "ZATCA Business Settings",
        {"fatoora_server": "Sandbox", "status": "Active"},
        ["name", "company", "enable_zatca_integration"], as_dict=True,
    ) if installed and frappe.db.table_exists("ZATCA Business Settings") else None
    result = {
        "site": site,
        "connector_installed": installed,
        "sandbox_settings_present": bool(settings),
        "sandbox_integration_enabled": bool(settings and settings.enable_zatca_integration),
        "standard_documents_cleared": 0,
        "simplified_documents_reported": 0,
        "pos_invoice_evidence": 0,
        "missing_xml_or_qr": 0,
        "validation_error_documents": 0,
        "sales_matrix_mode": "connector compliance endpoint, not production-mode Sandbox",
        "six_document_compliance_matrix_complete": False,
        "pos_sandbox_flow_still_needed": True,
        "production_mode_sandbox_flow_still_needed": True,
    }
    if not installed or not settings:
        return result
    invoices = frappe.get_all(
        "Sales Invoice", filters={"company": settings.company, "remarks": ["like", f"{MARKER}%"]},
        fields=["name"], limit=30,
    )
    for invoice in invoices:
        rows = frappe.get_all(
            "Sales Invoice Additional Fields",
            filters={"sales_invoice": invoice.name, "invoice_doctype": "Sales Invoice", "is_latest": 1},
            fields=["name", "invoice_type_transaction", "invoice_xml", "qr_code", "validation_errors"],
            order_by="creation desc", limit=1,
        )
        if not rows:
            result["missing_xml_or_qr"] += 1
            continue
        row = rows[0]
        if not row.invoice_xml or not row.qr_code:
            result["missing_xml_or_qr"] += 1
        logs = frappe.get_all(
            "ZATCA Integration Log", filters={"invoice_additional_fields_reference": row.name},
            fields=["zatca_status", "zatca_message"], order_by="creation desc", limit=1,
        )
        if not logs:
            continue
        log = logs[0]
        try:
            response = json.loads(log.zatca_message or "{}")
        except (TypeError, ValueError):
            response = {}
        if row.validation_errors or (response.get("validationResults") or {}).get("errorMessages"):
            result["validation_error_documents"] += 1
        invoice_type = row.invoice_type_transaction or ""
        if invoice_type.startswith("01") and log.zatca_status == "CLEARED":
            result["standard_documents_cleared"] += 1
        if invoice_type.startswith("02") and log.zatca_status == "REPORTED":
            result["simplified_documents_reported"] += 1
    result["pos_invoice_evidence"] = frappe.db.count(
        "Sales Invoice Additional Fields", {"invoice_doctype": "POS Invoice", "integration_status": ["in", ["Accepted", "Accepted with warnings"]]}
    )
    result["six_document_compliance_matrix_complete"] = (
        result["standard_documents_cleared"] == 3
        and result["simplified_documents_reported"] == 3
        and result["missing_xml_or_qr"] == 0
        and result["validation_error_documents"] == 0
    )
    result["pos_sandbox_flow_still_needed"] = result["pos_invoice_evidence"] == 0
    result["production_mode_sandbox_flow_still_needed"] = True
    return result


def run() -> None:
    print(json.dumps(snapshot(), ensure_ascii=False, indent=2))
