"""Pure, explicit contracts for the operational Home KPIs.

The browser must never infer totals from unrelated cards or divide figures
whose filters differ. This module keeps each metric's population beside its
drill-down filters and can be tested without a Frappe process.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from copy import deepcopy
from datetime import date
from typing import Any


HOME_METRIC_DEFINITIONS = (
    {
        "key": "order_count",
        "label": "Orders",
        "value_type": "count",
        "doctype": "Sales Order",
        "date_field": "transaction_date",
        "period": "month_to_date",
    },
    {
        "key": "booked_value",
        "label": "Booked value",
        "value_type": "currency",
        "doctype": "Sales Order",
        "date_field": "transaction_date",
        "period": "month_to_date",
    },
    {
        "key": "invoiced_value",
        "label": "Invoiced value",
        "value_type": "currency",
        "doctype": "Sales Invoice",
        "date_field": "posting_date",
        "period": "month_to_date",
    },
    {
        "key": "outstanding_value",
        "label": "Outstanding receivables",
        "value_type": "currency",
        "doctype": "Sales Invoice",
        "date_field": None,
        "period": "as_of_today",
    },
    {
        "key": "average_order_value",
        "label": "Average order value",
        "value_type": "currency",
        "doctype": "Sales Order",
        "date_field": "transaction_date",
        "period": "month_to_date",
    },
)


def _iso(value: date | str) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def home_metric_contract(*, company: str, month_start: date | str, as_of: date | str) -> list[dict]:
    """Return the complete metric and drill-down contract for one company.

    Month-to-date deliberately ends at as_of rather than month end, so a
    future-dated order cannot appear in a card labelled as current work.
    """

    start = _iso(month_start)
    end = _iso(as_of)
    order_filters = {
        "company": company,
        "docstatus": 1,
        "transaction_date": ["between", [start, end]],
    }
    invoice_filters = {
        "company": company,
        "docstatus": 1,
        "posting_date": ["between", [start, end]],
    }
    outstanding_filters = {
        "company": company,
        "docstatus": 1,
        "outstanding_amount": ["!=", 0],
    }

    contract = []
    for definition in HOME_METRIC_DEFINITIONS:
        metric = deepcopy(definition)
        metric["currency_basis"] = "company"
        metric["period_label"] = (
            "Month to date" if metric["period"] == "month_to_date" else "As of today"
        )
        metric["period_start"] = start if metric["period"] == "month_to_date" else None
        metric["period_end"] = end
        if metric["doctype"] == "Sales Order":
            metric["filters"] = deepcopy(order_filters)
        elif metric["period"] == "month_to_date":
            metric["filters"] = deepcopy(invoice_filters)
        else:
            metric["filters"] = deepcopy(outstanding_filters)
        contract.append(metric)
    return contract


def _base_total(row: Mapping[str, Any] | Any) -> float:
    if isinstance(row, Mapping):
        return float(row.get("base_grand_total") or 0)
    return float(getattr(row, "base_grand_total", 0) or 0)


def build_home_kpis(
    contract: Iterable[dict],
    *,
    order_rows: Iterable[Mapping[str, Any] | Any],
    invoice_rows: Iterable[Mapping[str, Any] | Any],
    outstanding_value: float,
) -> list[dict]:
    """Attach values to a contract without changing any metric population."""

    orders = list(order_rows)
    invoices = list(invoice_rows)
    order_count = len(orders)
    booked_value = sum(_base_total(row) for row in orders)
    values = {
        "order_count": order_count,
        "booked_value": booked_value,
        "invoiced_value": sum(_base_total(row) for row in invoices),
        "outstanding_value": float(outstanding_value or 0),
        "average_order_value": booked_value / order_count if order_count else 0,
    }
    result = []
    for definition in contract:
        metric = deepcopy(definition)
        metric["value"] = values[metric["key"]]
        result.append(metric)
    return result
