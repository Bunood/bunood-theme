"""Verify credit sale, receipt allocation and customer balance as one flow.

The matrix submits native ERPNext documents and then rolls the transaction
back to its savepoint.  It proves that ``On Credit`` is represented by an
outstanding Sales Invoice, not a synthetic payment mode or shadow balance.
"""

from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import frappe

from bunood_theme.api import get_customer_account_summary
from bunood_theme.payments import CASH_MODE, ensure_pos_payment_setup
from bunood_theme.printing.install import CREDIT_SALE
from bunood_theme.verification.finance_matrix import (
    _assert_close,
    _company_context,
    _decimal,
    _disable_zatca,
    _invoice,
    _temporary_customer,
)


def _signed_gl(voucher_type: str, voucher_no: str, account: str) -> Decimal:
    rows = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": voucher_type,
            "voucher_no": voucher_no,
            "account": account,
            "is_cancelled": 0,
        },
        fields=["debit", "credit"],
    )
    return sum((_decimal(row.debit) - _decimal(row.credit) for row in rows), Decimal("0"))


def run(company: str = "Bunood Development") -> dict[str, Any]:
    """Post a credit invoice and partial receipt, then roll everything back."""
    frappe.set_user("Administrator")
    outer = f"bnd_receivables_{uuid.uuid4().hex[:10]}"
    frappe.db.savepoint(outer)
    before = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "payment_entries": frappe.db.count("Payment Entry"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "site": frappe.local.site,
        "company": company,
        "safety": "database savepoint plus unconditional rollback",
        "status": "FAIL",
    }
    try:
        ensure_pos_payment_setup()
        ctx = _company_context(company)
        _disable_zatca(company)
        ctx["customer"] = _temporary_customer(ctx, ctx["company"].default_currency)
        receivable = ctx["company"].default_receivable_account
        cash = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": CASH_MODE, "company": company},
            "default_account",
        )
        if not receivable or not cash:
            raise AssertionError("Company needs mapped receivable and cash accounts")

        invoice = _invoice(
            ctx,
            qty=1,
            rate=100.50,
            tax_rate=0,
            category="Zero rated goods || Export of services",
            bunood_settlement_method=CREDIT_SALE,
        )
        invoice.insert(ignore_permissions=True)
        invoice.submit()
        invoice.reload()
        _assert_close(invoice.grand_total, 100.50, "credit invoice total")
        _assert_close(invoice.paid_amount, 0, "credit invoice paid amount")
        _assert_close(invoice.outstanding_amount, 100.50, "credit invoice outstanding")
        _assert_close(
            _signed_gl("Sales Invoice", invoice.name, receivable),
            100.50,
            "invoice Accounts Receivable debit",
        )

        payment = frappe.get_doc(
            {
                "doctype": "Payment Entry",
                "company": company,
                "posting_date": frappe.utils.nowdate(),
                "payment_type": "Receive",
                "party_type": "Customer",
                "party": ctx["customer"],
                "mode_of_payment": CASH_MODE,
                "paid_from": receivable,
                "paid_to": cash,
                "paid_amount": 40.25,
                "received_amount": 40.25,
                "references": [
                    {
                        "reference_doctype": "Sales Invoice",
                        "reference_name": invoice.name,
                        "allocated_amount": 40.25,
                    }
                ],
            }
        )
        payment.insert(ignore_permissions=True)
        payment.submit()
        invoice.reload()

        _assert_close(invoice.outstanding_amount, 60.25, "remaining receivable")
        _assert_close(
            _signed_gl("Payment Entry", payment.name, receivable),
            -40.25,
            "receipt Accounts Receivable credit",
        )
        _assert_close(
            _signed_gl("Payment Entry", payment.name, cash),
            40.25,
            "receipt cash debit",
        )

        statement_rows = frappe.get_all(
            "GL Entry",
            filters={
                "company": company,
                "party_type": "Customer",
                "party": ctx["customer"],
                "is_cancelled": 0,
            },
            fields=["voucher_type", "voucher_no", "debit", "credit"],
            order_by="posting_date asc, creation asc",
        )
        statement_balance = sum(
            (_decimal(row.debit) - _decimal(row.credit) for row in statement_rows),
            Decimal("0"),
        )
        _assert_close(statement_balance, 60.25, "customer statement balance")
        account_summary = get_customer_account_summary(ctx["customer"], company)
        _assert_close(account_summary["balance"], 60.25, "invoice balance card")

        result.update(
            status="PASS",
            customer=ctx["customer"],
            invoice={
                "name": invoice.name,
                "grand_total": invoice.grand_total,
                "paid_amount": invoice.paid_amount,
                "outstanding_amount": invoice.outstanding_amount,
                "receivable_account": receivable,
                "receivable_debit": float(_signed_gl("Sales Invoice", invoice.name, receivable)),
            },
            receipt={
                "name": payment.name,
                "amount": payment.received_amount,
                "mode_of_payment": payment.mode_of_payment,
                "cash_account": cash,
                "cash_debit": float(_signed_gl("Payment Entry", payment.name, cash)),
                "receivable_credit": float(-_signed_gl("Payment Entry", payment.name, receivable)),
            },
            customer_statement={
                "debit": float(sum((_decimal(row.debit) for row in statement_rows), Decimal("0"))),
                "credit": float(sum((_decimal(row.credit) for row in statement_rows), Decimal("0"))),
                "balance": float(statement_balance),
                "rows": [dict(row) for row in statement_rows],
            },
            account_summary=account_summary,
        )
    except Exception as exc:
        result["error"] = {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }
    finally:
        frappe.db.rollback(save_point=outer)

    after = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "payment_entries": frappe.db.count("Payment Entry"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result["rollback"] = {"before": before, "after": after, "clean": before == after}
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    if before != after:
        raise AssertionError(f"Rollback verification failed: {before} != {after}")
    return result
