"""Credential-free ZATCA health envelope for a separate Bunood operations site.

Only a site-configured, token-authenticated service user may call this endpoint.
The connector remains responsible for every regulated write and outcome.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils.scheduler import is_scheduler_inactive

from bunood_theme.zatca.monitor import _state
from bunood_theme.zatca.status import (
    INVOICE_DOCTYPES, _installed, _settings, _stored_fields, classify_status,
)


MAX_HEALTH_INVOICES = 2000
HEALTH_WINDOW_DAYS = 30
ISSUE_TYPES = {"01": "standard", "02": "simplified"}
CONFIRMED = {"accepted", "warnings"}
NATIVE_BATCH_JOB = "ksa_compliance.background_jobs.sync_e_invoices"


def _service_company(company: str) -> str:
    user = frappe.session.user
    service_user = frappe.conf.get("bunood_zatca_health_service_user")
    allowed = frappe.conf.get("bunood_zatca_health_companies") or []
    authorization = frappe.request.headers.get("Authorization", "") if frappe.request else ""
    if (
        not service_user or service_user in {"Administrator", "Guest"}
        or user != service_user or not authorization.lower().startswith("token ")
        or not isinstance(allowed, (list, tuple)) or company not in allowed
    ):
        frappe.throw(_("ZATCA health access is not permitted."), frappe.PermissionError)
    if not frappe.db.exists("Company", company):
        frappe.throw(_("ZATCA health access is not permitted."), frappe.PermissionError)
    # The connector's Settings and Additional Fields grant read only to System
    # Manager.  Never give this machine identity that broad role.  This
    # endpoint is the sole privileged read, pinned to a site-config allowlist
    # and returning a versioned aggregate without document IDs or secrets.
    return company


def _invoice_rows(company: str, since: str) -> tuple[list[dict[str, Any]], bool]:
    rows = []
    for doctype in sorted(INVOICE_DOCTYPES):
        meta = frappe.get_meta(doctype)
        fields = ["name", "creation", "posting_date"]
        if meta.get_field("posting_time"):
            fields.append("posting_time")
        if not frappe.db.table_exists(doctype):
            continue
        subset = frappe.get_all(
            doctype,
            filters={"company": company, "docstatus": 1, "posting_date": [">=", since]},
            fields=fields,
            order_by="creation desc, name desc",
            limit_page_length=MAX_HEALTH_INVOICES + 1,
        )
        rows.extend({**dict(row), "doctype": doctype} for row in subset)
    rows.sort(key=lambda row: (str(row["creation"]), row["name"], row["doctype"]), reverse=True)
    return rows[:MAX_HEALTH_INVOICES], len(rows) > MAX_HEALTH_INVOICES


def _health_evidence(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    if not rows or not frappe.db.table_exists("Sales Invoice Additional Fields"):
        return {}
    meta = frappe.get_meta("Sales Invoice Additional Fields")
    if not meta.get_field("invoice_doctype"):
        return {}
    fields = ["name", "sales_invoice", "creation"] + _stored_fields(meta, [
        "invoice_doctype", "integration_status", "invoice_type_transaction", "last_attempt",
    ])
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for doctype in sorted(INVOICE_DOCTYPES):
        names = [row["name"] for row in rows if row["doctype"] == doctype]
        for index in range(0, len(names), 100):
            filters: dict[str, Any] = {"sales_invoice": ["in", names[index:index + 100]],
                                      "invoice_doctype": doctype}
            if meta.get_field("is_latest"):
                filters["is_latest"] = 1
            for record in frappe.get_all(
                "Sales Invoice Additional Fields", filters=filters, fields=fields,
                order_by="creation desc", limit_page_length=300,
            ):
                result.setdefault((doctype, record.sales_invoice), dict(record))
    return result


def _issue_at(row: dict[str, Any]) -> datetime | None:
    posting_date = row.get("posting_date")
    posting_time = row.get("posting_time")
    if not posting_date or not posting_time:
        return None
    try:
        value = str(posting_time).split(".", 1)[0]
        return datetime.fromisoformat(f"{posting_date}T{value}")
    except ValueError:
        return None


def _summary(rows: list[dict[str, Any]], evidence: dict[tuple[str, str], dict[str, Any]],
             now: datetime, saudi_time: bool) -> dict[str, Any]:
    counts = {name: 0 for name in ("accepted", "warnings", "rejected", "duplicate", "pending", "missing_record")}
    counts.update({"standard_blocked": 0, "simplified_near_deadline": 0, "simplified_overdue": 0})
    last_success: datetime | None = None
    oldest_unresolved: datetime | None = None
    deadline_unknown = 0
    for row in rows:
        record = evidence.get((row["doctype"], row["name"]))
        state = _state(record)
        counts[state] += 1
        if state in CONFIRMED:
            attempted = (record or {}).get("last_attempt")
            if attempted:
                try:
                    seen = datetime.fromisoformat(str(attempted))
                    last_success = max(last_success, seen) if last_success else seen
                except ValueError:
                    pass
            continue
        issue_type = ISSUE_TYPES.get(str((record or {}).get("invoice_type_transaction") or "")[:2])
        issued = _issue_at(row) if saudi_time else None
        if issued:
            oldest_unresolved = min(oldest_unresolved, issued) if oldest_unresolved else issued
        if issue_type == "standard":
            counts["standard_blocked"] += 1
        elif issue_type == "simplified":
            if not issued:
                deadline_unknown += 1
            else:
                age = now - issued
                if age >= timedelta(hours=24):
                    counts["simplified_overdue"] += 1
                elif age >= timedelta(hours=18):
                    counts["simplified_near_deadline"] += 1
    def utc(value: datetime | None) -> str | None:
        return value.replace(tzinfo=ZoneInfo("Asia/Riyadh")).astimezone(timezone.utc).isoformat() if value and saudi_time else None

    return {
        "counts": counts,
        "last_confirmed_success": utc(last_success),
        "oldest_unresolved_issued_at": utc(oldest_unresolved),
        "deadline_unknown": deadline_unknown,
    }


def _scheduler_info(saudi_time: bool, now: datetime) -> dict[str, Any]:
    active = not is_scheduler_inactive(verbose=False)
    job = frappe.db.get_value(
        "Scheduled Job Type", {"method": NATIVE_BATCH_JOB},
        ["frequency", "stopped", "last_execution"], as_dict=True,
    ) if frappe.db.table_exists("Scheduled Job Type") else None
    last = None
    if job and job.get("last_execution"):
        try:
            last = datetime.fromisoformat(str(job.get("last_execution")))
        except ValueError:
            pass
    if last and last.tzinfo:
        last = last.astimezone(ZoneInfo("Asia/Riyadh")).replace(tzinfo=None) if saudi_time else None
    return {
        "scheduler_active": active,
        "sync_job_registered": bool(job),
        "sync_job_stopped": bool(job.get("stopped")) if job else None,
        "sync_schedule": job.get("frequency") if job else "unknown",
        "last_sync_job_run": last.replace(tzinfo=ZoneInfo("Asia/Riyadh")).astimezone(timezone.utc).isoformat()
        if last and saudi_time else None,
        "sync_job_stale": bool(now - last > timedelta(hours=3)) if last and saudi_time else None,
    }


@frappe.whitelist(methods=["GET"])
@rate_limit(limit=120, seconds=3600, ip_based=False)
def get_tenant_health(company: str) -> dict[str, Any]:
    """Return only non-secret, company-scoped recent health for the ops poller."""
    company = _service_company(company)
    site_id = frappe.conf.get("bunood_zatca_site_id")
    if not site_id:
        frappe.throw(_("ZATCA health site identity is not configured."), frappe.ValidationError)
    now = frappe.utils.now_datetime()
    since = (now - timedelta(days=HEALTH_WINDOW_DAYS)).date().isoformat()
    rows, partial = _invoice_rows(company, since)
    evidence = _health_evidence(rows)
    saudi_time = frappe.utils.get_system_timezone() == "Asia/Riyadh"
    summary = _summary(rows, evidence, now, saudi_time)
    scheduler = _scheduler_info(saudi_time, now)
    installed = _installed()
    settings = _settings(company) if installed else {}
    enabled = bool(settings.get("enable_zatca_integration"))
    compliance_ready = bool(settings.get("compliance_request_id") and settings.get("security_token") and settings.get("secret"))
    production_ready = bool(settings.get("production_request_id") and settings.get("production_security_token") and settings.get("production_secret"))
    state = classify_status(installed=installed, settings_exists=bool(settings), enabled=enabled,
                            compliance_ready=compliance_ready, production_ready=production_ready)
    frappe.logger("bunood_zatca_health", allow_site=True).info(
        "health_read user=%s site=%s company=%s rows=%s partial=%s",
        frappe.session.user, site_id, company, len(rows), partial,
    )
    return {
        "schema_version": 1,
        "site_id": site_id,
        "company": company,
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "window_start": since,
        "sample_size": len(rows),
        "partial": partial,
        "timezone_verified": saudi_time,
        "connector_installed": installed,
        "state": state,
        "environment": settings.get("fatoora_server") or "unknown",
        "sync_mode": settings.get("sync_with_zatca") or "unknown",
        "enabled": enabled,
        "compliance_ready": compliance_ready,
        "csid_present": production_ready,
        **scheduler,
        **summary,
    }
