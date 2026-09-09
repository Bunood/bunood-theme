"""Invoice tax invariants shared by native and Simple-mode saves.

ERPNext owns tax calculation and posting. Bunood only rejects configurations
that are ambiguous before those engines run: a selected template with no rows,
a rate-based Tax-account row whose rate is absent/invalid, or two rates posted
to the same Tax account. Zero remains a valid explicit rate.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any, Iterable

import frappe
from frappe import _


RATE_BASED_CHARGE_TYPES = {
    "On Net Total",
    "On Previous Row Amount",
    "On Previous Row Total",
    "On Item Quantity",
}


def _get(row: Any, name: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(name, default)
    getter = getattr(row, "get", None)
    if callable(getter):
        return getter(name, default)
    return getattr(row, name, default)


def _rate(value: Any) -> tuple[str | None, str | None]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "blank"
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None, "invalid"
    if not number.is_finite() or number < 0:
        return None, "invalid"
    normalized = format(number.normalize(), "f")
    return normalized, None


def find_tax_configuration_issues(
    rows: Iterable[Any],
    tax_accounts: Iterable[str],
    *,
    selected_template: str = "",
) -> list[dict[str, Any]]:
    """Return deterministic, user-actionable problems without using Frappe."""
    rows = list(rows or [])
    if selected_template and not rows:
        return [{"code": "empty_template", "template": selected_template, "rows": []}]

    tax_accounts = set(tax_accounts or [])
    issues: list[dict[str, Any]] = []
    rates: dict[str, dict[str, list[int]]] = {}
    for position, row in enumerate(rows, 1):
        account = str(_get(row, "account_head", "") or "").strip()
        if not account or account not in tax_accounts:
            continue
        row_number = int(_get(row, "idx", position) or position)
        rate, problem = _rate(_get(row, "rate"))
        if _get(row, "charge_type") in RATE_BASED_CHARGE_TYPES and problem:
            issues.append(
                {"code": f"{problem}_rate", "account": account, "rows": [row_number]}
            )
            continue
        if rate is not None:
            rates.setdefault(account, {}).setdefault(rate, []).append(row_number)

    for account, grouped in rates.items():
        if len(grouped) < 2:
            continue
        issues.append(
            {
                "code": "conflicting_rates",
                "account": account,
                "rates": sorted(grouped, key=Decimal),
                "rows": sorted(number for numbers in grouped.values() for number in numbers),
            }
        )
    return issues


def _tax_accounts(rows: Iterable[Any]) -> set[str]:
    names = sorted(
        {
            str(_get(row, "account_head", "") or "").strip()
            for row in rows
            if _get(row, "account_head")
        }
    )
    if not names:
        return set()
    accounts = frappe.get_all(
        "Account",
        filters={"name": ["in", names]},
        fields=["name", "account_type"],
    )
    return {row.name for row in accounts if row.account_type == "Tax"}


def _message(issue: dict[str, Any]) -> str:
    if issue["code"] == "empty_template":
        return _(
            "Tax template: {0}. No tax rows are configured. Choose a valid standard, zero-rate, exempt, or out-of-scope template."
        ).format(escape(issue["template"]))
    row_numbers = ", ".join(str(number) for number in issue["rows"])
    account = escape(issue["account"])
    if issue["code"] == "conflicting_rates":
        rates = ", ".join(f"{rate}%" for rate in issue["rates"])
        return _(
            "Tax issue. Rows: {0}. Conflicting rates: {1}. Account: {2}. Use one rate per tax account or separate the rates into different tax accounts."
        ).format(row_numbers, rates, account)
    return _(
        "Tax issue. Row: {0}. Account: {1}. The rate is missing or invalid. Enter a rate, or choose an explicit zero-rate, exempt, or out-of-scope template."
    ).format(row_numbers, account)


def validate_invoice_taxes(doc, method: str | None = None) -> None:
    """Frappe ``validate`` hook for Sales Invoice and Purchase Invoice."""
    del method
    if int(getattr(doc, "docstatus", 0) or 0) > 1:
        return
    rows = list(getattr(doc, "taxes", None) or [])
    issues = find_tax_configuration_issues(
        rows,
        _tax_accounts(rows),
        selected_template=str(getattr(doc, "taxes_and_charges", "") or ""),
    )
    if issues:
        frappe.throw(_message(issues[0]), title=_("Review taxes and charges"))
