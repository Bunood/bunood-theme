"""Small, testable contracts for the operational Home scope and saved views."""

from __future__ import annotations

from datetime import date, timedelta


ALL_COMPANIES = "__all__"
HOME_PERIODS = ("today", "last_7_days", "month_to_date", "last_30_days", "all_time")
HOME_VIEWS = ("overview", "accountant", "sales", "collections", "cashier")


def period_bounds(today: date, period: str) -> tuple[date | None, date]:
    """All Home presets end today; None means no lower date bound."""
    if period == "all_time":
        return None, today
    if period == "today":
        return today, today
    if period == "last_7_days":
        return today - timedelta(days=6), today
    if period == "last_30_days":
        return today - timedelta(days=29), today
    if period == "month_to_date":
        return today.replace(day=1), today
    raise ValueError("Unsupported Home period")


def default_view(roles: set[str], available: set[str], *, administrator: bool = False) -> str:
    """Choose a useful first view without letting a role grant document access."""
    if administrator:
        return "overview"
    for role_names, view in (
        ({"Accounts User", "Accounts Manager"}, "accountant"),
        ({"POS User", "POS Manager", "Cashier", "Bunood Cashier", "Bunood POS Operator"}, "cashier"),
        ({"Sales User", "Sales Manager"}, "sales"),
    ):
        if roles & role_names and view in available:
            return view
    return "overview"
