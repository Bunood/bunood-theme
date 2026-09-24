# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Permission-safe evidence for Bunood's finance-close cockpit.

The cockpit coordinates native ERPNext records. It does not maintain balances,
approve reconciliations, lock periods, or infer that the books are correct.
"""

from __future__ import annotations

from frappe.utils import date_diff, getdate, now_datetime, nowdate

import frappe


MAX_PERIOD_DAYS = 366
QUEUE_LIMIT = 60


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
            frappe._("Maximum close review period in days: {0}").format(
                MAX_PERIOD_DAYS
            )
        )
    return start, end


def _safe_list(doctype: str, *, errors: list[str], **kwargs) -> list[dict]:
    """Query through Frappe permissions and preserve unknown/error as evidence."""

    if not _can(doctype, "read"):
        return []
    try:
        return frappe.get_list(doctype, **kwargs)
    except Exception:
        errors.append(doctype)
        frappe.log_error(title=f"bunood_theme: finance close {doctype} query stood down")
        return []


def _attention_queue(company: str, start, end, errors: list[str]) -> tuple[list[dict], dict]:
    specs = (
        ("Journal Entry", "posting_date"),
        ("Sales Invoice", "posting_date"),
        ("Purchase Invoice", "posting_date"),
        ("Payment Entry", "posting_date"),
    )
    rows = []
    counts = {}
    for doctype, date_field in specs:
        if not _can(doctype, "read"):
            counts[doctype] = None
            continue
        records = _safe_list(
            doctype,
            errors=errors,
            filters={
                "company": company,
                "docstatus": 0,
                date_field: ["between", [str(start), str(end)]],
            },
            fields=["name", date_field, "modified"],
            order_by=f"{date_field} desc, modified desc",
            limit=0,
        )
        counts[doctype] = len(records)
        for record in records[:QUEUE_LIMIT]:
            rows.append(
                {
                    "doctype": doctype,
                    "name": record.get("name"),
                    "date": str(record.get(date_field) or ""),
                    "reason": "draft-source-document",
                }
            )
    rows.sort(key=lambda row: (row.get("date") or "", row.get("name") or ""), reverse=True)
    return rows[:QUEUE_LIMIT], counts


def _covers(row: dict, start, end) -> bool:
    return bool(
        row.get("start_date")
        and row.get("end_date")
        and getdate(row["start_date"]) <= start
        and getdate(row["end_date"]) >= end
    )


def _pcv_covers(row: dict, start, end) -> bool:
    return bool(
        row.get("period_start_date")
        and row.get("period_end_date")
        and getdate(row["period_start_date"]) <= start
        and getdate(row["period_end_date"]) >= end
    )


def get_finance_close_cockpit(company: str, from_date=None, to_date=None) -> dict:
    """Return close evidence without upgrading observations into approval."""

    if not company:
        frappe.throw(frappe._("Company is required"))
    company_doc = frappe.get_doc("Company", company)
    company_doc.check_permission("read")
    start, end = _period(from_date, to_date)
    errors: list[str] = []

    attention, draft_counts = _attention_queue(company, start, end, errors)
    periods = _safe_list(
        "Accounting Period",
        errors=errors,
        filters=[
            ["company", "=", company],
            ["disabled", "=", 0],
            ["start_date", "<=", str(end)],
            ["end_date", ">=", str(start)],
        ],
        fields=["name", "start_date", "end_date", "exempted_role", "modified"],
        order_by="end_date desc, modified desc",
        limit=20,
    )
    vouchers = _safe_list(
        "Period Closing Voucher",
        errors=errors,
        filters=[
            ["company", "=", company],
            ["period_end_date", ">=", str(start)],
            ["period_start_date", "<=", str(end)],
        ],
        fields=[
            "name",
            "docstatus",
            "period_start_date",
            "period_end_date",
            "closing_account_head",
            "gle_processing_status",
            "modified",
        ],
        order_by="period_end_date desc, modified desc",
        limit=20,
    )

    failed_vouchers = [
        row for row in vouchers if row.get("gle_processing_status") == "Failed"
    ]
    for row in failed_vouchers:
        attention.append(
            {
                "doctype": "Period Closing Voucher",
                "name": row.get("name"),
                "date": str(row.get("period_end_date") or ""),
                "reason": "failed-closing-processing",
            }
        )

    frozen_date = company_doc.get("accounts_frozen_till_date")
    frozen_through = bool(frozen_date and getdate(frozen_date) >= end)
    covering_periods = [row for row in periods if _covers(row, start, end)]
    covering_vouchers = [
        row
        for row in vouchers
        if row.get("docstatus") == 1 and _pcv_covers(row, start, end)
    ]
    protection_present = bool(frozen_through or covering_periods)
    draft_total = sum(value for value in draft_counts.values() if value is not None)

    if errors:
        state = "incomplete-evidence"
    elif attention:
        state = "attention-needed"
    elif protection_present:
        state = "protection-present"
    else:
        state = "review-required"

    return {
        "company": company,
        "currency": company_doc.get("default_currency"),
        "finance_book": company_doc.get("default_finance_book"),
        "from_date": str(start),
        "to_date": str(end),
        "generated_at": str(now_datetime()),
        "state": state,
        "query_errors": errors,
        "capabilities": {
            "can_read_gl": _can("GL Entry", "read"),
            "can_create_journal": _can("Journal Entry", "create"),
            "can_create_accounting_period": _can("Accounting Period", "create"),
            "can_create_closing_voucher": _can("Period Closing Voucher", "create"),
            "can_change_company": _can("Company", "write"),
        },
        "summary": {
            "draft_source_count": draft_total,
            "attention_count": len(attention),
            "accounting_period_count": len(covering_periods),
            "submitted_closing_voucher_count": len(covering_vouchers),
        },
        "draft_counts": draft_counts,
        "controls": {
            "accounts_frozen_till_date": str(frozen_date or ""),
            "frozen_through_period": frozen_through,
            "accounting_period_covers_period": bool(covering_periods),
            "closing_voucher_covers_period": bool(covering_vouchers),
            "protection_present": protection_present,
        },
        "attention": attention[:QUEUE_LIMIT],
        "attention_truncated": len(attention) > QUEUE_LIMIT,
        "accounting_periods": periods,
        "closing_vouchers": vouchers,
        "phases": [
            {
                "id": "source-capture",
                "state": "attention-needed" if draft_total else "not-evaluated",
            },
            {"id": "reconciliation", "state": "not-evaluated"},
            {
                "id": "adjustments",
                "state": "attention-needed"
                if (draft_counts.get("Journal Entry") or 0)
                else "not-evaluated",
            },
            {"id": "statements", "state": "not-evaluated"},
            {
                "id": "protection",
                "state": "protection-present" if protection_present else "not-protected",
            },
        ],
    }
