# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Permission-safe context for Bunood's native bank-reconciliation entry point.

This module deliberately does not reconcile anything. ERPNext's Bank Transaction,
Bank Statement Import and v16 ``/banking`` application remain the accounting
system of record. Bunood adds a bilingual preflight and ageing queue so a user can
understand what needs attention before entering that native workflow.
"""

from __future__ import annotations

from frappe.utils import date_diff, flt, getdate, nowdate

import frappe


MAX_PERIOD_DAYS = 366
QUEUE_LIMIT = 200


def _can(doctype: str, permission: str) -> bool:
    """Return a capability only when the native DocType is installed."""

    return bool(
        frappe.db.exists("DocType", doctype)
        and frappe.has_permission(doctype, permission)
    )


def _period(from_date=None, to_date=None):
    """Validate a bounded inclusive period and return Frappe date objects."""

    end = getdate(to_date or nowdate())
    start = getdate(from_date or end.replace(day=1))
    days = date_diff(end, start)
    if days < 0:
        frappe.throw(frappe._("From date must be before or equal to To date"))
    if days > MAX_PERIOD_DAYS:
        frappe.throw(
            frappe._("Maximum reconciliation period in days: {0}").format(
                MAX_PERIOD_DAYS
            )
        )
    return start, end


def _account_label(row: dict) -> str:
    """Build a useful label without returning an IBAN or account number."""

    parts = [row.get("account_name") or row.get("bank") or row.get("name")]
    if row.get("mask"):
        parts.append(f"•••• {row['mask']}")
    if row.get("currency"):
        parts.append(row["currency"])
    return " · ".join(str(part) for part in parts if part)


def _bank_accounts(company: str, default_currency: str | None = None) -> list[dict]:
    if not _can("Bank Account", "read"):
        return []
    rows = frappe.get_list(
        "Bank Account",
        filters={"company": company, "is_company_account": 1, "disabled": 0},
        fields=["name", "account_name", "bank", "mask", "account"],
        order_by="account_name asc, name asc",
        limit=0,
    )
    linked_accounts = [row.get("account") for row in rows if row.get("account")]
    currencies = {}
    if linked_accounts and _can("Account", "read"):
        currencies = {
            row.get("name"): row.get("account_currency")
            for row in frappe.get_list(
                "Account",
                filters={"name": ["in", linked_accounts], "company": company},
                fields=["name", "account_currency"],
                limit=0,
            )
        }
    return [
        {
            "name": row.get("name"),
            "label": _account_label(
                {
                    **row,
                    "currency": currencies.get(row.get("account"))
                    or default_currency,
                }
            ),
            "ledger_account": row.get("account"),
            "currency": currencies.get(row.get("account")) or default_currency,
        }
        for row in rows
    ]


def _capabilities() -> dict:
    return {
        "can_import": _can("Bank Statement Import", "create"),
        "can_reconcile": _can("Bank Transaction", "write"),
        "can_read_transactions": _can("Bank Transaction", "read"),
        "can_read_gl": _can("GL Entry", "read"),
        "can_create_payment_entry": _can("Payment Entry", "create"),
        "can_create_journal_entry": _can("Journal Entry", "create"),
        "can_create_bank_account": _can("Bank Account", "create"),
    }


def _empty_result(company: str, start, end, accounts: list[dict], capabilities: dict) -> dict:
    return {
        "company": company,
        "from_date": str(start),
        "to_date": str(end),
        "state": "select-bank-account" if accounts else "no-bank-account",
        "bank_accounts": accounts,
        "bank_account": None,
        "capabilities": capabilities,
        "summary": {
            "transaction_count": 0,
            "deposits": 0,
            "withdrawals": 0,
            "statement_net": 0,
            "allocated": 0,
            "open_amount": 0,
            "open_count": 0,
            "older_open_count": 0,
            "book_debit": None,
            "book_credit": None,
            "book_net": None,
        },
        "ageing": {"0_30": 0, "31_60": 0, "61_90": 0, "over_90": 0},
        "queue": [],
        "queue_truncated": False,
        "recent_imports": [],
    }


def _transaction_age(as_of, transaction_date) -> int:
    return max(0, date_diff(as_of, getdate(transaction_date)))


def _age_bucket(age: int) -> str:
    if age <= 30:
        return "0_30"
    if age <= 60:
        return "31_60"
    if age <= 90:
        return "61_90"
    return "over_90"


def _recent_imports(company: str, bank_account: str) -> list[dict]:
    if not _can("Bank Statement Import", "read"):
        return []
    return frappe.get_list(
        "Bank Statement Import",
        filters={"company": company, "bank_account": bank_account},
        fields=["name", "status", "creation", "modified"],
        order_by="creation desc",
        limit=5,
    )


def _book_movement(company: str, account: str | None, start, end, capabilities: dict) -> dict:
    """Return period movement, never a claimed statement-to-book difference."""

    if not account or not capabilities["can_read_gl"]:
        return {"book_debit": None, "book_credit": None, "book_net": None}
    rows = frappe.get_list(
        "GL Entry",
        filters={
            "company": company,
            "account": account,
            "posting_date": ["between", [str(start), str(end)]],
            "is_cancelled": 0,
        },
        fields=["debit", "credit"],
        limit=0,
    )
    debit = sum(flt(row.get("debit")) for row in rows)
    credit = sum(flt(row.get("credit")) for row in rows)
    return {"book_debit": debit, "book_credit": credit, "book_net": debit - credit}


def get_bank_reconciliation_workbench(
    company: str,
    bank_account: str | None = None,
    from_date=None,
    to_date=None,
) -> dict:
    """Return a permission-filtered, non-authoritative reconciliation preflight."""

    if not company:
        frappe.throw(frappe._("Company is required"))
    company_doc = frappe.get_doc("Company", company)
    company_doc.check_permission("read")
    start, end = _period(from_date, to_date)
    capabilities = _capabilities()
    accounts = _bank_accounts(company, company_doc.get("default_currency"))
    result = _empty_result(company, start, end, accounts, capabilities)
    if not bank_account:
        return result

    allowed = {row["name"]: row for row in accounts}
    if bank_account not in allowed:
        frappe.throw(
            frappe._("This bank account is unavailable for the selected company"),
            frappe.PermissionError,
        )
    bank_doc = frappe.get_doc("Bank Account", bank_account)
    bank_doc.check_permission("read")
    if not capabilities["can_read_transactions"]:
        frappe.throw(frappe._("You do not have permission to read bank transactions"))

    fields = [
        "name",
        "date",
        "status",
        "description",
        "reference_number",
        "transaction_type",
        "deposit",
        "withdrawal",
        "allocated_amount",
        "unallocated_amount",
        "party_type",
        "party",
    ]
    rows = frappe.get_list(
        "Bank Transaction",
        filters={
            "bank_account": bank_account,
            "company": company,
            "date": ["between", [str(start), str(end)]],
        },
        fields=fields,
        order_by="date desc, name desc",
        limit=0,
    )
    older_rows = frappe.get_list(
        "Bank Transaction",
        filters={
            "bank_account": bank_account,
            "company": company,
            "date": ["<", str(start)],
            "unallocated_amount": [">", 0],
        },
        fields=["name"],
        limit=0,
    )

    deposits = sum(flt(row.get("deposit")) for row in rows)
    withdrawals = sum(flt(row.get("withdrawal")) for row in rows)
    allocated = sum(flt(row.get("allocated_amount")) for row in rows)
    open_rows = [row for row in rows if abs(flt(row.get("unallocated_amount"))) > 0.000001]
    ageing = {"0_30": 0, "31_60": 0, "61_90": 0, "over_90": 0}
    queue = []
    for row in open_rows[:QUEUE_LIMIT]:
        age = _transaction_age(end, row.get("date"))
        ageing[_age_bucket(age)] += 1
        allocated_amount = flt(row.get("allocated_amount"))
        queue.append(
            {
                "name": row.get("name"),
                "date": str(row.get("date") or ""),
                "description": row.get("description") or "",
                "reference_number": row.get("reference_number") or "",
                "transaction_type": row.get("transaction_type") or "",
                "deposit": flt(row.get("deposit")),
                "withdrawal": flt(row.get("withdrawal")),
                "allocated_amount": allocated_amount,
                "open_amount": abs(flt(row.get("unallocated_amount"))),
                "party_type": row.get("party_type") or "",
                "party": row.get("party") or "",
                "age_days": age,
                "state": "partially-matched" if allocated_amount else "unmatched",
            }
        )
    # Ageing must describe the whole open set even if the display queue is capped.
    for row in open_rows[QUEUE_LIMIT:]:
        ageing[_age_bucket(_transaction_age(end, row.get("date")))] += 1

    imports = _recent_imports(company, bank_account)
    if not rows:
        state = "no-source"
    elif open_rows or older_rows:
        state = "action-needed"
    else:
        # This is intentionally not named "reconciled": book-only transactions
        # can still exist and native ERPNext remains the authoritative close.
        state = "no-open-statement-items"

    result.update(
        state=state,
        bank_account={
            "name": bank_account,
            "label": allowed[bank_account]["label"],
            "ledger_account": allowed[bank_account].get("ledger_account"),
            "currency": allowed[bank_account].get("currency"),
        },
        summary={
            "transaction_count": len(rows),
            "deposits": deposits,
            "withdrawals": withdrawals,
            "statement_net": deposits - withdrawals,
            "allocated": allocated,
            "open_amount": sum(abs(flt(row.get("unallocated_amount"))) for row in open_rows),
            "open_count": len(open_rows),
            "older_open_count": len(older_rows),
            **_book_movement(
                company,
                allowed[bank_account].get("ledger_account"),
                start,
                end,
                capabilities,
            ),
        },
        ageing=ageing,
        queue=queue,
        queue_truncated=len(open_rows) > QUEUE_LIMIT,
        recent_imports=imports,
    )
    return result


def prepare_bank_statement_import(company: str, bank_account: str) -> dict:
    """Create only a native draft import, then hand control back to ERPNext."""

    if not company or not bank_account:
        frappe.throw(frappe._("Company and bank account are required"))
    frappe.get_doc("Company", company).check_permission("read")
    bank_doc = frappe.get_doc("Bank Account", bank_account)
    bank_doc.check_permission("read")
    if bank_doc.get("company") != company or not bank_doc.get("is_company_account"):
        frappe.throw(
            frappe._("This bank account is unavailable for the selected company"),
            frappe.PermissionError,
        )
    if bank_doc.get("disabled"):
        frappe.throw(frappe._("Choose an active company bank account"))
    if not _can("Bank Statement Import", "create"):
        frappe.throw(
            frappe._("You do not have permission to import bank statements"),
            frappe.PermissionError,
        )
    doc = frappe.get_doc(
        {
            "doctype": "Bank Statement Import",
            "company": company,
            "bank_account": bank_account,
        }
    )
    doc.insert()
    return {
        "name": doc.name,
        "route": ["Form", "Bank Statement Import", doc.name],
    }
