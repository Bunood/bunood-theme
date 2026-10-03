"""Permission-checked read views over native ERPNext and KSA Compliance records.

This module deliberately stores no invoices, signs no XML and sends nothing to
ZATCA.  The browser receives only fields needed to find and triage an invoice;
native connector records remain the authority for detailed evidence.
"""

from __future__ import annotations

import base64
from datetime import date, datetime
import json
import re
from typing import Any

import frappe
from frappe import _

from bunood_theme.zatca.status import INVOICE_DOCTYPES, WORKSPACE_ROLES, _stored_fields


MAX_PAGE_SIZE = 50
MAX_SCANNED = 500
FILTER_STATES = {"all", "attention", "accepted", "warnings", "rejected", "pending", "duplicate", "missing_record"}
ATTENTION_STATES = {"pending", "warnings", "rejected", "duplicate", "missing_record"}
SECRET_KEY = re.compile(
    r'(?im)(\b(?:security[_ -]?token|secret|password|private[_ -]?key|authorization|binarysecuritytoken)\b["\']?\s*[=:]\s*)'
    r'([^\r\n,}]+)'
)
RAW_DOCUMENT = re.compile(r"(?i)<\?xml\b|<Invoice\b|<cbc:|<cac:|-----BEGIN [A-Z ]+-----")


def _deny(message: str) -> None:
    frappe.throw(_(message), frappe.PermissionError)


def _company(company: str) -> str:
    if not WORKSPACE_ROLES.intersection(frappe.get_roles()):
        _deny("You do not have access to the ZATCA workspace.")
    if not company or not frappe.get_list(
        "Company", filters={"name": company}, fields=["name"], limit_page_length=1
    ):
        _deny("You do not have access to this company.")
    frappe.get_doc("Company", company).check_permission("read")
    return company


def _iso_date(value: str | None, label: str) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        message = _("Invalid start date.") if label == "start" else _("Invalid end date.")
        frappe.throw(message, frappe.ValidationError)


def _page_size(value: Any) -> int:
    try:
        size = int(value)
    except (TypeError, ValueError):
        size = 25
    return max(1, min(MAX_PAGE_SIZE, size))


def _created(value: Any) -> str:
    return datetime.fromisoformat(str(value)).strftime("%Y-%m-%d %H:%M:%S.%f")


def _key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (_created(row["creation"]), str(row["name"]), str(row["doctype"]))


def _encode_cursor(row: dict[str, Any]) -> str:
    data = {
        "created": _created(row.get("creation") or row["created"]),
        "name": row["name"], "doctype": row["doctype"],
    }
    return base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode()).decode().rstrip("=")


def _decode_cursor(value: str | None) -> dict[str, str] | None:
    if not value:
        return None
    try:
        if len(value) > 512:
            raise ValueError("long cursor")
        data = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if data["doctype"] not in INVOICE_DOCTYPES or not isinstance(data["name"], str):
            raise ValueError("invalid cursor")
        if not data["name"] or len(data["name"]) > 140:
            raise ValueError("invalid name")
        return {"created": _created(data["created"]), "name": data["name"], "doctype": data["doctype"]}
    except (KeyError, TypeError, ValueError, UnicodeDecodeError):
        frappe.throw(_("Invalid invoice page cursor."), frappe.ValidationError)


def _invoice_batch(
    doctype: str, company: str, cursor: dict[str, str] | None,
    limit: int, date_from: str | None, date_to: str | None,
) -> list[dict[str, Any]]:
    """Read a bounded invoice slice through Frappe's permission-aware query.

    The split tie query makes a (creation, name, doctype) cursor exact even when
    two invoice types share a creation timestamp and invoice name.
    """
    if not frappe.db.table_exists(doctype) or not frappe.has_permission(doctype, "read"):
        return []
    fields = ["name", "creation", "posting_date", "grand_total", "currency"]
    meta = frappe.get_meta(doctype)
    fields += _stored_fields(meta, ["posting_time", "is_return"])
    filters: dict[str, Any] = {"company": company, "docstatus": 1}
    if date_from:
        filters["posting_date"] = [">=", date_from]
    if date_to:
        filters["posting_date"] = ["between", [date_from or "1900-01-01", date_to]]
    base = dict(fields=fields, order_by="creation desc, name desc", limit_page_length=limit)
    if not cursor:
        rows = frappe.get_list(doctype, filters=filters, **base)
    else:
        # For an equal timestamp and name, the lower DocType sorts after the
        # cursor in the global descending order.
        tie_operator = "<=" if doctype < cursor["doctype"] else "<"
        ties = frappe.get_list(doctype, filters={**filters, "creation": cursor["created"],
                                                 "name": [tie_operator, cursor["name"]]}, **base)
        earlier = frappe.get_list(doctype, filters={**filters, "creation": ["<", cursor["created"]]},
                                  **{**base, "limit_page_length": max(0, limit - len(ties))}) if len(ties) < limit else []
        rows = [*ties, *earlier]
    return [{**dict(row), "doctype": doctype} for row in rows]


def _evidence(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    if not rows or not frappe.db.table_exists("Sales Invoice Additional Fields"):
        return {}
    meta = frappe.get_meta("Sales Invoice Additional Fields")
    if not meta.get_field("invoice_doctype"):
        # A connector version without the discriminator cannot safely join
        # same-named Sales and POS invoices. Leave their status unknown.
        return {}
    fields = ["name", "sales_invoice", "creation"] + _stored_fields(
        meta, ["invoice_doctype", "integration_status", "invoice_type_code", "last_attempt", "uuid"]
    )
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for doctype in INVOICE_DOCTYPES:
        names = [row["name"] for row in rows if row["doctype"] == doctype]
        if not names:
            continue
        filters: dict[str, Any] = {"sales_invoice": ["in", names], "invoice_doctype": doctype}
        if meta.get_field("is_latest"):
            filters["is_latest"] = 1
        # Rows arrived through permission-aware invoice queries. The native
        # evidence DocType grants only System Manager, so this narrow facade
        # reads only matching evidence and returns a safe projection.
        for record in frappe.get_all(
            "Sales Invoice Additional Fields", filters=filters, fields=fields,
            order_by="creation desc", limit_page_length=max(100, len(names) * 3),
        ):
            key = (doctype, record.sales_invoice)
            result.setdefault(key, dict(record))
    return result


def _state(record: dict[str, Any] | None) -> str:
    if not record:
        return "missing_record"
    status = record.get("integration_status") or ""
    if status == "Accepted":
        return "accepted"
    if status == "Accepted with warnings":
        return "warnings"
    if status == "Rejected":
        return "rejected"
    if status == "Duplicate":
        return "duplicate"
    return "pending"


def _display_row(row: dict[str, Any], record: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "name": row["name"], "doctype": row["doctype"],
        "created": _created(row["creation"]),
        "posting_date": str(row.get("posting_date") or ""),
        "amount": row.get("grand_total"), "currency": row.get("currency") or "",
        "is_return": bool(row.get("is_return")),
        "state": _state(record),
        "native_status": (record or {}).get("integration_status") or "",
        "invoice_type_code": (record or {}).get("invoice_type_code") or "",
        "last_attempt": str((record or {}).get("last_attempt") or ""),
    }


def _safe_diagnostic(value: Any, limit: int) -> str:
    """Keep readable validation text but never return a raw XML/key dump."""
    content = str(value or "")[:limit]
    if RAW_DOCUMENT.search(content):
        return _("Full connector diagnostic is available in the native record.")
    return SECRET_KEY.sub(lambda match: match.group(1) + "[redacted]", content)


@frappe.whitelist(methods=["GET"])
def list_invoices(
    company: str, state: str = "all", invoice_doctype: str = "all",
    date_from: str | None = None, date_to: str | None = None,
    cursor: str | None = None, page_size: int = 25,
) -> dict[str, Any]:
    """Cursor-paginated, company- and permission-scoped invoice monitor."""
    company = _company(company)
    if state not in FILTER_STATES:
        frappe.throw(_("Invalid ZATCA status filter."), frappe.ValidationError)
    if invoice_doctype != "all" and invoice_doctype not in INVOICE_DOCTYPES:
        frappe.throw(_("Invalid invoice type filter."), frappe.ValidationError)
    start = _iso_date(date_from, "start")
    end = _iso_date(date_to, "end")
    if start and end and start > end:
        frappe.throw(_("Start date must not be after end date."), frappe.ValidationError)
    after = _decode_cursor(cursor)
    size = _page_size(page_size)
    doctypes = ("Sales Invoice", "POS Invoice") if invoice_doctype == "all" else (invoice_doctype,)
    result: list[dict[str, Any]] = []
    scanned = 0
    more = False
    while len(result) < size and scanned < MAX_SCANNED:
        batch_size = min(max(50, size * 2), MAX_SCANNED - scanned)
        candidates = []
        for doctype in doctypes:
            candidates.extend(_invoice_batch(doctype, company, after, batch_size, start, end))
        candidates.sort(key=_key, reverse=True)
        batch = candidates[:batch_size]
        if not batch:
            more = False
            break
        evidence = _evidence(batch)
        processed = 0
        for row in batch:
            after = {"created": _created(row["creation"]), "name": row["name"], "doctype": row["doctype"]}
            scanned += 1
            processed += 1
            record = evidence.get((row["doctype"], row["name"]))
            record_state = _state(record)
            if state == "all" or record_state == state or (state == "attention" and record_state in ATTENTION_STATES):
                result.append(_display_row(row, record))
            if len(result) >= size:
                break
        more = processed < len(batch) or len(candidates) > len(batch) or len(batch) == batch_size
        if len(result) >= size or not more:
            break
    return {
        "company": company, "rows": result,
        "next_cursor": _encode_cursor(after) if more and after else None,
        "scanned": scanned,
        "evidence_available": bool(frappe.db.table_exists("Sales Invoice Additional Fields")),
    }


@frappe.whitelist(methods=["GET"])
def get_invoice_detail(invoice_doctype: str, invoice_name: str) -> dict[str, Any]:
    """Return a small diagnostic envelope; full evidence stays in native forms."""
    if invoice_doctype not in INVOICE_DOCTYPES or not invoice_name:
        frappe.throw(_("Invalid invoice."), frappe.ValidationError)
    invoice = frappe.get_doc(invoice_doctype, invoice_name)
    invoice.check_permission("read")
    _company(invoice.company)
    record = _evidence([{"doctype": invoice_doctype, "name": invoice_name}]).get((invoice_doctype, invoice_name))
    if not record:
        return {"invoice": invoice_name, "doctype": invoice_doctype, "state": "missing_record", "evidence": None, "logs": []}
    meta = frappe.get_meta("Sales Invoice Additional Fields")
    fields = ["name"] + _stored_fields(meta, ["integration_status", "uuid", "last_attempt", "validation_messages", "validation_errors"])
    visible = frappe.get_all("Sales Invoice Additional Fields", filters={
        "name": record["name"], "sales_invoice": invoice_name, "invoice_doctype": invoice_doctype,
    }, fields=fields, limit_page_length=1)
    if not visible:
        return {"invoice": invoice_name, "doctype": invoice_doctype, "state": "missing_record", "evidence": None, "logs": []}
    detail = dict(visible[0])
    detail["validation_messages"] = _safe_diagnostic(detail.get("validation_messages"), 2000)
    detail["validation_errors"] = _safe_diagnostic(detail.get("validation_errors"), 4000)
    logs = []
    if frappe.db.table_exists("ZATCA Integration Log"):
        log_meta = frappe.get_meta("ZATCA Integration Log")
        if log_meta.get_field("invoice_doctype"):
            log_filters = {"invoice_reference": invoice_name, "invoice_doctype": invoice_doctype}
            log_fields = ["name", "creation"] + _stored_fields(log_meta, ["status", "zatca_status", "zatca_http_status_code"])
            logs = [dict(row) for row in frappe.get_all("ZATCA Integration Log", filters=log_filters,
                                                       fields=log_fields, order_by="creation desc", limit_page_length=5)]
    return {"invoice": invoice_name, "doctype": invoice_doctype, "state": _state(record),
            "evidence": detail, "logs": logs,
            "can_open_evidence": bool(frappe.has_permission("Sales Invoice Additional Fields", "read")),
            "can_open_logs": bool(frappe.has_permission("ZATCA Integration Log", "read")),
            }
