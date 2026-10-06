"""Read-only, permission-filtered work evidence for the accountant home.

Nothing here reconciles accounts, approves a close, or changes a source record.
An unavailable or failed check is ``None``, never a reassuring zero.
"""

from __future__ import annotations

from datetime import timedelta
import re

import frappe
from frappe.utils import flt, getdate, nowdate


ROW_LIMIT = 5
HOME_LIMIT = 10
BANK_LIMIT = 12
NATIVE_ROW_CAP = 10000


def _can_read(doctype: str) -> bool:
    return bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read"))


def _read(doctype: str, errors: list[str], **kwargs):
    return read_native_rows(doctype, errors, **kwargs)


def read_native_rows(doctype, errors, *, filters=None, fields=None, order_by=None, group_by=None, limit=0):
    """Bounded native populations; never aggregate a hidden or truncated field.

    SUM/COUNT are computed only after native row permissions and exact field
    projection have succeeded. Child joins count each native document once.
    """
    if not _can_read(doctype):
        return None
    try:
        from frappe.model import get_permitted_fields
        fields = fields or ["name"]
        raw = {field for field in fields if isinstance(field, str)} | {"name"}
        aggregates = [field for field in fields if isinstance(field, dict)]
        for field in aggregates:
            operation = next((key for key in ("COUNT", "SUM") if key in field), None)
            if not operation or set(field) != {operation, "AS"}:
                raise ValueError("Unsupported native aggregate")
            raw.add(field[operation])
        groups = [part.strip() for part in (group_by or "").split(",") if part.strip()]
        raw.update(groups)
        filter_fields = set((filters or {}).keys()) if isinstance(filters, dict) else {row[-3] for row in filters or []}
        if any("." in key and key != "sales_team.sales_person" for key in filter_fields):
            raise PermissionError("Unsupported native child scope")
        sort_fields = set()
        for term in (order_by or "").split(","):
            if not term.strip():
                continue
            match = re.fullmatch(r"\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:asc|desc))?\s*", term, re.IGNORECASE)
            if not match:
                raise PermissionError("Unsupported native ordering")
            sort_fields.add(match.group(1))
        permitted = set(get_permitted_fields(doctype, permission_type="read"))
        needed = raw | sort_fields | {key for key in filter_fields if "." not in key}
        if not needed <= permitted:
            raise PermissionError("Unavailable native field")
        if "sales_team.sales_person" in filter_fields:
            meta = frappe.get_meta(doctype)
            table = meta.get_field("sales_team")
            if not table or table.permlevel not in meta.get_permlevel_access("read") or "sales_person" not in get_permitted_fields("Sales Team", parenttype=doctype, permission_type="read"):
                raise PermissionError("Unavailable native child field")
        records = frappe.get_list(doctype, filters=filters or {}, fields=sorted(raw), order_by=order_by, limit=NATIVE_ROW_CAP + 1)
        if len(records) > NATIVE_ROW_CAP or any(not raw <= set(row) for row in records):
            raise ValueError("Incomplete native population")
        records = list({row["name"]: row for row in records}.values())
        if not aggregates:
            projected = [{field: row[field] for field in fields} for row in records]
            return projected[:limit] if limit else projected
        buckets = {}
        for row in records:
            buckets.setdefault(tuple(row[key] for key in groups), []).append(row)
        if not groups and not buckets:
            buckets[()] = []
        result = []
        for key, rows in buckets.items():
            out = dict(zip(groups, key))
            for field in aggregates:
                if "COUNT" in field:
                    out[field["AS"]] = sum(row[field["COUNT"]] is not None for row in rows)
                else:
                    out[field["AS"]] = sum(float(row[field["SUM"]] or 0) for row in rows)
            result.append(out)
        return result[:limit] if limit else result
    except Exception:
        if doctype not in errors:
            errors.append(doctype)
        return None


def _count(doctype: str, filters: dict, errors: list[str]):
    rows = _read(
        doctype, errors, filters=filters,
        fields=[{"COUNT": "name", "AS": "count"}], limit=1,
    )
    return int(rows[0].get("count") or 0) if rows is not None else None


def _base_outstanding(row: dict, company_currency: str) -> float:
    from bunood_theme.home_metrics import base_outstanding
    return base_outstanding(row, company_currency)


def _source_groups(company: str, currency: str, errors: list[str]) -> list[dict]:
    specs = (
        ("Journal Entry", "journal_drafts", "posting_date", None, "total_debit"),
        ("Payment Entry", "payment_drafts", "posting_date", "party", "base_paid_amount"),
        ("Purchase Invoice", "purchase_drafts", "posting_date", "supplier_name", "base_grand_total"),
        ("Sales Invoice", "sales_drafts", "posting_date", "customer_name", "base_grand_total"),
    )
    groups = []
    for doctype, key, date_field, party_field, amount_field in specs:
        filters = {"company": company, "docstatus": 0}
        count = _count(doctype, filters, errors)
        if count is None:
            groups.append({"key": key, "doctype": doctype, "count": None, "filters": filters, "rows": []})
            continue
        fields = ["name", date_field, "owner", amount_field]
        if party_field:
            fields.append(party_field)
        rows = _read(
            doctype, errors, filters=filters, fields=fields,
            order_by="modified desc", limit=ROW_LIMIT,
        )
        groups.append({
            "key": key, "doctype": doctype, "count": count if rows is not None else None,
            "filters": filters,
            "rows": [{
                "doctype": doctype, "name": row.get("name"), "party": row.get(party_field) if party_field else "",
                "date": str(row.get(date_field) or ""), "amount": flt(row.get(amount_field)),
                "currency": currency, "owner": row.get("owner") or "", "reason": "draft",
                "priority": 2,
            } for row in (rows or [])],
        })
    return groups


def _due_group(doctype: str, key: str, company: str, today, currency: str, errors: list[str]) -> dict:
    due = (today + timedelta(days=7)).isoformat()
    date_filter = ["<", today.isoformat()] if key == "overdue_receivables" else ["between", [today.isoformat(), due]]
    filters = {"company": company, "docstatus": 1, "posting_date": ["<=", today.isoformat()], "outstanding_amount": [">", 0], "due_date": date_filter}
    count = _count(doctype, filters, errors)
    if count is None:
        return {"key": key, "doctype": doctype, "count": None, "filters": filters, "rows": []}
    party_field = "customer_name" if doctype == "Sales Invoice" else "supplier_name"
    rows = _read(
        doctype, errors, filters=filters,
        fields=["name", "due_date", party_field, "outstanding_amount", "conversion_rate", "party_account_currency", "currency"],
        order_by="due_date asc, name asc", limit=ROW_LIMIT,
    )
    try:
        for row in rows or []:
            _base_outstanding(row, currency)
    except (TypeError, ValueError):
        if doctype not in errors:
            errors.append(doctype)
        rows = None
    return {
        "key": key, "doctype": doctype, "count": count if rows is not None else None,
        "filters": filters,
        "rows": [{
            "doctype": doctype, "name": row.get("name"), "party": row.get(party_field) or "",
            "date": str(row.get("due_date") or ""),
            "days": (today - getdate(row.get("due_date"))).days if row.get("due_date") else None,
            "amount": _base_outstanding(row, currency), "currency": currency,
            "reason": "overdue" if key == "overdue_receivables" else "due-soon",
            "priority": 0 if key == "overdue_receivables" else 1,
        } for row in (rows or [])],
    }


def _bank_evidence(company: str, errors: list[str]) -> dict:
    accounts = _read(
        "Bank Account", errors,
        filters={"company": company, "is_company_account": 1, "disabled": 0},
        fields=["name", "account_name", "account"], order_by="account_name asc, name asc", limit=BANK_LIMIT + 1,
    )
    if accounts is None:
        return {"available": False, "accounts": [], "truncated": False}
    visible = accounts[:BANK_LIMIT]
    names = [row.get("name") for row in visible if row.get("name")]
    counts = {}
    if names:
        open_rows = _read(
            "Bank Transaction", errors,
            filters={"company": company, "bank_account": ["in", names], "unallocated_amount": ["!=", 0]},
            fields=["bank_account", {"COUNT": "name", "AS": "open_count"}],
            group_by="bank_account", limit=0,
        )
        if open_rows is not None:
            counts = {row.get("bank_account"): int(row.get("open_count") or 0) for row in open_rows}
    else:
        open_rows = []
    return {
        "available": True, "truncated": len(accounts) > BANK_LIMIT,
        "accounts": [{
            "name": row.get("name"), "label": row.get("account_name") or row.get("name"),
            "open_count": counts.get(row.get("name"), 0) if open_rows is not None else None,
            # ERPNext bank transactions alone do not establish a reviewed closing
            # statement balance or a signed reconciliation date.
            "last_reconciled": None, "difference": None,
            "state": "unavailable" if open_rows is None else
                ("needs-review" if counts.get(row.get("name"), 0) else "not-verified"),
        } for row in visible],
    }


def get_accounting_desk(company: str, currency: str, as_of=None) -> dict:
    """The selected company must already have passed the home scope check."""
    today = getdate(as_of or nowdate())
    errors: list[str] = []
    groups = _source_groups(company, currency, errors)
    groups.extend((
        _due_group("Sales Invoice", "overdue_receivables", company, today, currency, errors),
        _due_group("Purchase Invoice", "payables_due", company, today, currency, errors),
    ))
    priority = lambda row: (row["priority"], row.get("date") or "", row.get("name") or "")
    # Reserve one visible record per non-empty category before filling the rest.
    # Otherwise five overdue and five AP rows can hide every draft on Home.
    leaders = sorted((group["rows"][0] for group in groups if group["rows"]), key=priority)
    remainder = sorted((row for group in groups for row in group["rows"][1:]), key=priority)
    queue = (leaders + remainder)[:HOME_LIMIT]
    bank = _bank_evidence(company, errors)
    return {
        "as_of": today.isoformat(), "currency": currency,
        "groups": groups, "queue": queue, "queue_truncated": sum(max(0, (group["count"] or 0) - len(group["rows"])) for group in groups) > 0,
        "checks_incomplete": bool(
            errors or any(group["count"] is None for group in groups)
            or not bank["available"]
            or any(row["open_count"] is None for row in bank["accounts"])
        ),
        "query_errors": errors, "bank": bank,
    }
