"""Submit and roll back one half-riyal invoice to prove exact halala posting."""

from __future__ import annotations

import uuid
from decimal import Decimal

import frappe

from bunood_theme.verification.finance_matrix import (
    _assert_close,
    _company_context,
    _decimal,
    _disable_zatca,
    _invoice,
)


def run(company: str = "Bunood Development") -> dict[str, object]:
    frappe.set_user("Administrator")
    savepoint = f"bnd_halala_{uuid.uuid4().hex[:10]}"
    frappe.db.savepoint(savepoint)
    before = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result: dict[str, object] = {}
    try:
        ctx = _company_context(company)
        _disable_zatca(company)
        invoice = _invoice(ctx, qty=1, rate=50, tax_rate=15)
        invoice.insert(ignore_permissions=True)
        invoice.submit()
        invoice.reload()

        _assert_close(invoice.grand_total, 57.50, "grand total")
        _assert_close(invoice.rounding_adjustment, 0, "rounding adjustment")
        _assert_close(invoice.outstanding_amount, 57.50, "outstanding amount")
        if not invoice.disable_rounded_total:
            raise AssertionError("Exact-total flag was not enforced")

        gl_rows = frappe.get_all(
            "GL Entry",
            filters={
                "voucher_type": "Sales Invoice",
                "voucher_no": invoice.name,
                "is_cancelled": 0,
            },
            fields=["debit", "credit"],
        )
        balance = sum(
            (_decimal(row.debit) - _decimal(row.credit) for row in gl_rows), Decimal("0")
        )
        _assert_close(balance, 0, "GL balance")
        result = {
            "status": "PASS",
            "grand_total": invoice.grand_total,
            "rounding_adjustment": invoice.rounding_adjustment,
            "outstanding_amount": invoice.outstanding_amount,
            "disable_rounded_total": invoice.disable_rounded_total,
            "gl_balanced": True,
        }
    finally:
        frappe.db.rollback(save_point=savepoint)

    after = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result["rollback"] = {"before": before, "after": after, "clean": before == after}
    if before != after:
        raise AssertionError(f"Rollback verification failed: {before} != {after}")
    return result
