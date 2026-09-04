"""Live, read-only verification for the two measured report compatibility fixes."""

from __future__ import annotations

import frappe
from frappe.utils import add_years, now_datetime, nowdate

from bunood_theme.report_compat import OBSOLETE_REVIEW_COLUMN, run, sync_report_compatibility


def _check_report(name: str, filters: dict) -> dict:
    result = run(report_name=name, filters=filters, ignore_prepared_report=True)
    rows = result.get("result")
    columns = result.get("columns")
    if not isinstance(rows, list) or not isinstance(columns, list):
        raise AssertionError(f"{name} returned an invalid report shape")
    return {
        "status": "PASS",
        "rows": len(rows),
        "columns": [column.get("fieldname") for column in columns],
    }


@frappe.whitelist()
def run_matrix() -> dict:
    started_at = now_datetime().isoformat()
    sync = sync_report_compatibility()
    query = frappe.db.get_value("Report", "Review", "query") or ""
    if OBSOLETE_REVIEW_COLUMN in query:
        raise AssertionError("Review still references Quality Action.document_type")

    company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
    if not company:
        raise AssertionError("No company is available for the report fixture")

    cases = {
        "F04-review": _check_report("Review", {}),
        "F05-available-serial-no": _check_report(
            "Available Serial No",
            {
                "company": company,
                "from_date": add_years(nowdate(), -1),
                "to_date": nowdate(),
                "valuation_field_type": "Currency",
            },
        ),
    }
    return {
        "started_at": started_at,
        "finished_at": now_datetime().isoformat(),
        "site": frappe.local.site,
        "sync": sync,
        "cases": cases,
        "summary": {"passed": len(cases), "failed": 0, "total": len(cases)},
    }
