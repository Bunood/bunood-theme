# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Permission-safe context for Bunood's native Journal Entry workbench.

The workbench explains and organises native ERPNext accounting records. It does
not post, submit, cancel, reverse, approve, allocate, or maintain a parallel
ledger or journal schedule.
"""

from __future__ import annotations

import frappe
from frappe.utils import date_diff, flt, getdate, now_datetime, nowdate


MAX_PERIOD_DAYS = 93
QUERY_LIMIT = 1001
DISPLAY_LIMIT = 100
AUXILIARY_LIMIT = 60
BALANCE_TOLERANCE = 0.005


def _can(doctype: str, permission: str) -> bool:
    return bool(
        frappe.db.exists("DocType", doctype)
        and frappe.has_permission(doctype, permission)
    )


def _period(from_date=None, to_date=None):
    end = getdate(to_date or nowdate())
    start = getdate(from_date or end.replace(day=1))
    days = date_diff(end, start)
    if days < 0:
        frappe.throw(frappe._("From date must be before or equal to To date"))
    if days > MAX_PERIOD_DAYS:
        frappe.throw(
            frappe._("Maximum journal review period in days: {0}").format(
                MAX_PERIOD_DAYS
            )
        )
    return start, end


def _safe_list(doctype: str, *, errors: list[str], **kwargs) -> list[dict]:
    """Read a user-facing queue through Frappe's permission query layer."""

    if not _can(doctype, "read"):
        return []
    try:
        return frappe.get_list(doctype, **kwargs)
    except Exception:
        errors.append(doctype)
        frappe.log_error(title=f"bunood_theme: journal workbench {doctype} query stood down")
        return []


def _journal_state(row: dict) -> str:
    docstatus = int(row.get("docstatus") or 0)
    if docstatus == 2:
        return "cancelled"
    if docstatus == 0:
        if abs(flt(row.get("difference"))) > BALANCE_TOLERANCE:
            return "unbalanced-draft"
        return "draft-review"
    if row.get("reversal_of"):
        return "submitted-reversal"
    if row.get("is_system_generated"):
        return "system-generated"
    return "submitted"


def _journal_source(row: dict) -> str:
    if row.get("process_deferred_accounting"):
        return "deferred-accounting"
    if row.get("auto_repeat"):
        return "auto-repeat"
    if row.get("from_template"):
        return "template"
    if row.get("reversal_of"):
        return "reversal"
    return "manual-or-native"


def _visible_schedules(company: str, errors: list[str]) -> list[dict]:
    schedules = _safe_list(
        "Auto Repeat",
        errors=errors,
        filters={"reference_doctype": "Journal Entry", "disabled": 0},
        fields=[
            "name",
            "reference_document",
            "frequency",
            "next_schedule_date",
            "status",
            "submit_on_creation",
        ],
        order_by="next_schedule_date asc, modified desc",
        limit_page_length=AUXILIARY_LIMIT,
    )
    references = [row.get("reference_document") for row in schedules if row.get("reference_document")]
    if not references:
        return []

    # Auto Repeat permissions do not prove permission to the referenced Journal
    # Entry. Intersect through Journal Entry's own permission-filtered query and
    # the selected Company before returning any reference identity.
    visible = _safe_list(
        "Journal Entry",
        errors=errors,
        filters={"company": company, "name": ["in", references]},
        fields=["name"],
        limit_page_length=AUXILIARY_LIMIT,
    )
    allowed = {row.get("name") for row in visible}
    return [row for row in schedules if row.get("reference_document") in allowed]


def get_journal_workbench(company: str, from_date=None, to_date=None) -> dict:
    """Return bounded native journal evidence without inferring approval."""

    if not company:
        frappe.throw(frappe._("Company is required"))
    company_doc = frappe.get_doc("Company", company)
    company_doc.check_permission("read")
    start, end = _period(from_date, to_date)
    errors: list[str] = []
    can_read_journal = _can("Journal Entry", "read")
    if not can_read_journal:
        errors.append("Journal Entry")

    records = _safe_list(
        "Journal Entry",
        errors=errors,
        filters={
            "company": company,
            "posting_date": ["between", [str(start), str(end)]],
        },
        fields=[
            "name",
            "posting_date",
            "voucher_type",
            "docstatus",
            "total_debit",
            "total_credit",
            "difference",
            "user_remark",
            "remark",
            "from_template",
            "auto_repeat",
            "process_deferred_accounting",
            "reversal_of",
            "is_system_generated",
            "owner",
            "modified",
        ],
        order_by="posting_date desc, modified desc",
        limit_page_length=QUERY_LIMIT,
    )
    truncated = len(records) >= QUERY_LIMIT
    observed = records[: QUERY_LIMIT - 1] if truncated else records
    journals = []
    counts = {
        "draft": 0,
        "submitted": 0,
        "cancelled": 0,
        "unbalanced_draft": 0,
        "reversal": 0,
        "system_generated": 0,
    }
    for row in observed:
        state = _journal_state(row)
        if int(row.get("docstatus") or 0) == 0:
            counts["draft"] += 1
        elif int(row.get("docstatus") or 0) == 1:
            counts["submitted"] += 1
        else:
            counts["cancelled"] += 1
        if state == "unbalanced-draft":
            counts["unbalanced_draft"] += 1
        if row.get("reversal_of"):
            counts["reversal"] += 1
        if row.get("is_system_generated"):
            counts["system_generated"] += 1
        journals.append(
            {
                "name": row.get("name"),
                "posting_date": str(row.get("posting_date") or ""),
                "voucher_type": row.get("voucher_type") or "Journal Entry",
                "docstatus": int(row.get("docstatus") or 0),
                "state": state,
                "source": _journal_source(row),
                "total_debit": flt(row.get("total_debit")),
                "total_credit": flt(row.get("total_credit")),
                "difference": flt(row.get("difference")),
                "remark": row.get("user_remark") or row.get("remark") or "",
                "owner": row.get("owner") or "",
                "modified": str(row.get("modified") or ""),
                "reversal_of": row.get("reversal_of") or "",
            }
        )

    templates = _safe_list(
        "Journal Entry Template",
        errors=errors,
        filters={"company": company},
        fields=[
            "name",
            "template_title",
            "voucher_type",
            "is_opening",
            "multi_currency",
            "modified",
        ],
        order_by="modified desc",
        limit_page_length=AUXILIARY_LIMIT,
    )
    schedules = _visible_schedules(company, errors)

    if errors or truncated:
        state = "incomplete-evidence"
    elif counts["unbalanced_draft"]:
        state = "attention-needed"
    elif counts["draft"]:
        state = "review-required"
    else:
        state = "no-open-drafts-observed"

    return {
        "company": company,
        "currency": company_doc.get("default_currency"),
        "finance_book": company_doc.get("default_finance_book"),
        "from_date": str(start),
        "to_date": str(end),
        "generated_at": str(now_datetime()),
        "state": state,
        "query_errors": list(dict.fromkeys(errors)),
        "evidence_truncated": truncated,
        "summary": {
            **counts,
            "observed": len(observed),
            "template_count": len(templates),
            "schedule_count": len(schedules),
        },
        "capabilities": {
            "can_read_journal": can_read_journal,
            "can_create_journal": _can("Journal Entry", "create"),
            "can_submit_journal": _can("Journal Entry", "submit"),
            "can_read_gl": _can("GL Entry", "read"),
            "can_create_template": _can("Journal Entry Template", "create"),
            "can_create_auto_repeat": _can("Auto Repeat", "create"),
            "can_run_deferred": _can("Process Deferred Accounting", "create"),
        },
        "journals": journals[:DISPLAY_LIMIT],
        "journal_display_truncated": len(journals) > DISPLAY_LIMIT,
        "templates": templates,
        "schedules": schedules,
    }
