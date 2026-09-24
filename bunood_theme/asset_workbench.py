# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Permission-safe context for Bunood's native fixed-asset workbench.

The workbench organises ERPNext's native Asset and lifecycle documents. It
does not calculate depreciation, post to the General Ledger, move, capitalize,
repair, adjust, sell, scrap, approve, or maintain a parallel asset register.
"""

from __future__ import annotations

import frappe
from frappe.utils import date_diff, flt, getdate, now_datetime, nowdate


MAX_PERIOD_DAYS = 366
ASSET_QUERY_LIMIT = 1001
AUXILIARY_QUERY_LIMIT = 201
ASSET_DISPLAY_LIMIT = 100
ACTIVITY_DISPLAY_LIMIT = 30
DISPOSED_STATUSES = {"Sold", "Scrapped"}
SERVICE_STATUSES = {"In Maintenance", "Out of Order"}


def _can(doctype: str, permission: str) -> bool:
    return bool(
        frappe.db.exists("DocType", doctype)
        and frappe.has_permission(doctype, permission)
    )


def _period(from_date=None, to_date=None):
    end = getdate(to_date or nowdate())
    start = getdate(from_date or end.replace(month=1, day=1))
    days = date_diff(end, start)
    if days < 0:
        frappe.throw(frappe._("From date must be before or equal to To date"))
    if days > MAX_PERIOD_DAYS:
        frappe.throw(
            frappe._("Maximum fixed-asset review period in days: {0}").format(
                MAX_PERIOD_DAYS
            )
        )
    return start, end


def _safe_list(
    doctype: str,
    *,
    errors: list[str],
    required: bool = True,
    **kwargs,
) -> list[dict]:
    """Read user-facing evidence only through Frappe's permission query layer."""

    if not _can(doctype, "read"):
        if required:
            errors.append(doctype)
        return []
    try:
        return frappe.get_list(doctype, **kwargs)
    except Exception:
        errors.append(doctype)
        frappe.log_error(
            title=f"bunood_theme: asset workbench {doctype} query stood down"
        )
        return []


def _bounded_list(
    doctype: str,
    *,
    errors: list[str],
    truncated_sources: list[str],
    limit: int,
    required: bool = True,
    **kwargs,
) -> list[dict]:
    rows = _safe_list(
        doctype,
        errors=errors,
        required=required,
        limit_page_length=limit,
        **kwargs,
    )
    if len(rows) >= limit:
        truncated_sources.append(doctype)
        return rows[: limit - 1]
    return rows


def _date_text(value) -> str:
    return str(value or "")


def _is_due(asset: dict, end) -> bool:
    next_date = asset.get("next_depreciation_date")
    if not next_date or not asset.get("calculate_depreciation"):
        return False
    if int(asset.get("docstatus") or 0) != 1:
        return False
    if asset.get("status") in DISPOSED_STATUSES:
        return False
    return getdate(next_date) <= end


def _asset_state(asset: dict, end) -> str:
    status = asset.get("status") or ""
    docstatus = int(asset.get("docstatus") or 0)
    if docstatus == 2 or status == "Cancelled":
        return "cancelled"
    if docstatus == 0 or status == "Draft":
        return "draft-review"
    if status in DISPOSED_STATUSES:
        return "disposed"
    if asset.get("depr_entry_posting_status") == "Failed":
        return "depreciation-failed"
    if _is_due(asset, end):
        return "depreciation-due"
    if status in SERVICE_STATUSES:
        return "service-attention"
    if status == "Fully Depreciated":
        return "fully-depreciated"
    return "in-use"


def _activity_row(doctype: str, row: dict, date_field: str, amount_field=None) -> dict:
    return {
        "doctype": doctype,
        "name": row.get("name"),
        "date": _date_text(row.get(date_field)),
        "docstatus": int(row.get("docstatus") or 0),
        "asset": row.get("asset") or row.get("target_asset") or "",
        "title": row.get("title") or row.get("asset_name") or row.get("purpose") or "",
        "state": row.get("repair_status") or row.get("purpose") or "",
        "amount": flt(row.get(amount_field)) if amount_field else 0,
        "reference_doctype": row.get("reference_doctype") or "",
        "reference_name": row.get("reference_name") or "",
    }


def get_asset_workbench(company: str, from_date=None, to_date=None) -> dict:
    """Return bounded native asset evidence without inferring reconciliation."""

    if not company:
        frappe.throw(frappe._("Company is required"))
    company_doc = frappe.get_doc("Company", company)
    company_doc.check_permission("read")
    start, end = _period(from_date, to_date)
    errors: list[str] = []
    truncated_sources: list[str] = []

    assets = _bounded_list(
        "Asset",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=ASSET_QUERY_LIMIT,
        filters={"company": company},
        fields=[
            "name",
            "asset_name",
            "item_code",
            "item_name",
            "asset_category",
            "status",
            "docstatus",
            "purchase_date",
            "available_for_use_date",
            "calculate_depreciation",
            "next_depreciation_date",
            "depr_entry_posting_status",
            "value_after_depreciation",
            "total_asset_cost",
            "net_purchase_amount",
            "location",
            "custodian",
            "department",
            "disposal_date",
            "maintenance_required",
            "booked_fixed_asset",
            "modified",
        ],
        order_by="modified desc",
    )
    schedules = _bounded_list(
        "Asset Depreciation Schedule",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=AUXILIARY_QUERY_LIMIT,
        filters={"company": company},
        fields=[
            "name",
            "asset",
            "finance_book",
            "depreciation_method",
            "status",
            "docstatus",
            "value_after_depreciation",
            "net_purchase_amount",
            "modified",
        ],
        order_by="modified desc",
    )
    movements = _bounded_list(
        "Asset Movement",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=AUXILIARY_QUERY_LIMIT,
        filters={
            "company": company,
            "transaction_date": [
                "between",
                [f"{start} 00:00:00", f"{end} 23:59:59"],
            ],
        },
        fields=[
            "name",
            "purpose",
            "transaction_date",
            "reference_doctype",
            "reference_name",
            "docstatus",
            "modified",
        ],
        order_by="transaction_date desc, modified desc",
    )
    repairs = _bounded_list(
        "Asset Repair",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=AUXILIARY_QUERY_LIMIT,
        filters={"company": company},
        fields=[
            "name",
            "asset",
            "asset_name",
            "failure_date",
            "completion_date",
            "repair_status",
            "docstatus",
            "capitalize_repair_cost",
            "total_repair_cost",
            "increase_in_asset_life",
            "modified",
        ],
        order_by="failure_date desc, modified desc",
    )
    capitalizations = _bounded_list(
        "Asset Capitalization",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=AUXILIARY_QUERY_LIMIT,
        filters={
            "company": company,
            "posting_date": ["between", [str(start), str(end)]],
        },
        fields=[
            "name",
            "title",
            "target_asset",
            "target_item_code",
            "finance_book",
            "posting_date",
            "total_value",
            "docstatus",
            "modified",
        ],
        order_by="posting_date desc, modified desc",
    )
    adjustments = _bounded_list(
        "Asset Value Adjustment",
        errors=errors,
        truncated_sources=truncated_sources,
        limit=AUXILIARY_QUERY_LIMIT,
        filters={
            "company": company,
            "date": ["between", [str(start), str(end)]],
        },
        fields=[
            "name",
            "asset",
            "finance_book",
            "date",
            "current_asset_value",
            "new_asset_value",
            "difference_amount",
            "journal_entry",
            "docstatus",
            "modified",
        ],
        order_by="date desc, modified desc",
    )

    summary = {
        "observed_assets": len(assets),
        "active_assets": 0,
        "draft_assets": 0,
        "depreciation_due": 0,
        "depreciation_failed": 0,
        "service_attention": 0,
        "disposed_in_period": 0,
        "observed_carrying_value": 0.0,
        "draft_schedules": 0,
        "pending_repairs": 0,
        "lifecycle_drafts": 0,
        "period_activity": len(movements) + len(capitalizations) + len(adjustments),
    }
    presented_assets = []
    for row in assets:
        lifecycle_state = _asset_state(row, end)
        if int(row.get("docstatus") or 0) == 0:
            summary["draft_assets"] += 1
        elif (
            int(row.get("docstatus") or 0) == 1
            and row.get("status") not in DISPOSED_STATUSES
        ):
            summary["active_assets"] += 1
        if lifecycle_state == "depreciation-due":
            summary["depreciation_due"] += 1
        elif lifecycle_state == "depreciation-failed":
            summary["depreciation_failed"] += 1
        if lifecycle_state == "service-attention":
            summary["service_attention"] += 1
        disposal_date = row.get("disposal_date")
        if disposal_date and start <= getdate(disposal_date) <= end:
            summary["disposed_in_period"] += 1
        if int(row.get("docstatus") or 0) == 1 and row.get("status") not in DISPOSED_STATUSES:
            summary["observed_carrying_value"] += flt(
                row.get("value_after_depreciation")
            )
        presented_assets.append(
            {
                "name": row.get("name"),
                "asset_name": row.get("asset_name") or row.get("item_name") or row.get("name"),
                "item_code": row.get("item_code") or "",
                "asset_category": row.get("asset_category") or "",
                "status": row.get("status") or "",
                "state": lifecycle_state,
                "location": row.get("location") or "",
                "custodian": row.get("custodian") or "",
                "department": row.get("department") or "",
                "next_depreciation_date": _date_text(row.get("next_depreciation_date")),
                "depreciation_posting_status": row.get("depr_entry_posting_status") or "",
                "carrying_value": flt(row.get("value_after_depreciation")),
                "total_asset_cost": flt(row.get("total_asset_cost")),
                "purchase_date": _date_text(row.get("purchase_date")),
                "disposal_date": _date_text(row.get("disposal_date")),
            }
        )

    summary["draft_schedules"] = sum(
        1 for row in schedules if int(row.get("docstatus") or 0) == 0
    )
    summary["pending_repairs"] = sum(
        1 for row in repairs if row.get("repair_status") == "Pending"
    )
    summary["lifecycle_drafts"] = sum(
        int(row.get("docstatus") or 0) == 0
        for rows in (movements, repairs, capitalizations, adjustments)
        for row in rows
    )

    priority = {
        "depreciation-failed": 0,
        "depreciation-due": 1,
        "draft-review": 2,
        "service-attention": 3,
        "in-use": 4,
        "fully-depreciated": 5,
        "disposed": 6,
        "cancelled": 7,
    }
    presented_assets.sort(
        key=lambda row: (priority.get(row["state"], 8), row["asset_name"], row["name"])
    )

    activity = []
    activity.extend(
        _activity_row("Asset Movement", row, "transaction_date") for row in movements
    )
    activity.extend(
        _activity_row("Asset Repair", row, "failure_date", "total_repair_cost")
        for row in repairs
        if row.get("repair_status") == "Pending"
        or (row.get("failure_date") and start <= getdate(row.get("failure_date")) <= end)
    )
    activity.extend(
        _activity_row("Asset Capitalization", row, "posting_date", "total_value")
        for row in capitalizations
    )
    activity.extend(
        _activity_row("Asset Value Adjustment", row, "date", "difference_amount")
        for row in adjustments
    )
    activity.sort(key=lambda row: row["date"], reverse=True)

    if errors or truncated_sources:
        state = "incomplete-evidence"
    elif summary["depreciation_failed"] or summary["depreciation_due"] or summary["pending_repairs"]:
        state = "attention-needed"
    elif summary["draft_assets"] or summary["draft_schedules"] or summary["lifecycle_drafts"]:
        state = "review-required"
    else:
        state = "no-exceptions-observed"

    return {
        "company": company,
        "currency": company_doc.get("default_currency"),
        "finance_book": company_doc.get("default_finance_book"),
        "from_date": str(start),
        "to_date": str(end),
        "generated_at": str(now_datetime()),
        "state": state,
        "query_errors": list(dict.fromkeys(errors)),
        "truncated_sources": list(dict.fromkeys(truncated_sources)),
        "evidence_truncated": bool(truncated_sources),
        "summary": summary,
        "capabilities": {
            "can_read_asset": _can("Asset", "read"),
            "can_create_asset": _can("Asset", "create"),
            "can_create_movement": _can("Asset Movement", "create"),
            "can_create_repair": _can("Asset Repair", "create"),
            "can_create_capitalization": _can("Asset Capitalization", "create"),
            "can_create_adjustment": _can("Asset Value Adjustment", "create"),
            "can_read_gl": _can("GL Entry", "read"),
        },
        "assets": presented_assets[:ASSET_DISPLAY_LIMIT],
        "asset_display_truncated": len(presented_assets) > ASSET_DISPLAY_LIMIT,
        "schedules": schedules[:ACTIVITY_DISPLAY_LIMIT],
        "schedule_display_truncated": len(schedules) > ACTIVITY_DISPLAY_LIMIT,
        "activity": activity[:ACTIVITY_DISPLAY_LIMIT],
        "activity_display_truncated": len(activity) > ACTIVITY_DISPLAY_LIMIT,
    }
