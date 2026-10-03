"""Rehearse Bunood's native quote-to-cash path without retaining test data.

The production acceptance still requires an owner-authorized persistent run.
This verifier closes the software-evidence gap safely: it submits a native
Quotation, maps it with ERPNext's own Quotation mapper, submits the resulting
Sales Invoice, maps a full native Payment Entry, verifies the reconciled
outstanding balance, and unconditionally rolls the whole transaction back.
"""

from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

import frappe
from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
from erpnext.selling.doctype.quotation.quotation import make_sales_invoice

from bunood_theme.payments import CASH_MODE, ensure_pos_payment_setup
from bunood_theme.verification.finance_matrix import (
    _assert_close,
    _company_context,
    _disable_zatca,
)


def _item_codes(limit: int = 3) -> list[str]:
    """Return distinct enabled sales items suitable for the rehearsal."""
    values = frappe.get_all(
        "Item",
        filters={"disabled": 0, "is_sales_item": 1, "has_variants": 0},
        pluck="name",
        order_by="modified desc",
        limit=limit,
    )
    if len(values) < limit:
        raise AssertionError(f"Quote-to-cash rehearsal needs {limit} enabled sales items")
    return values


def _quotation(ctx: dict[str, Any], items: list[str]):
    """Build a two-line customer quotation with a real discount and VAT row."""
    company = ctx["company"]
    today = frappe.utils.nowdate()
    return frappe.get_doc(
        {
            "doctype": "Quotation",
            "quotation_to": "Customer",
            "party_name": ctx["customer"],
            "company": company.name,
            "transaction_date": today,
            "valid_till": frappe.utils.add_days(today, 30),
            "order_type": "Sales",
            "currency": company.default_currency,
            "conversion_rate": 1,
            "apply_discount_on": "Grand Total",
            "discount_amount": 23,
            "items": [
                {
                    "item_code": items[0],
                    "qty": 2,
                    "rate": 100,
                    "price_list_rate": 100,
                    "discount_percentage": 10,
                },
                {
                    "item_code": items[1],
                    "qty": 1,
                    "rate": 80,
                    "price_list_rate": 80,
                },
            ],
            "taxes": [
                {
                    "charge_type": "On Net Total",
                    "account_head": ctx["sales_tax_account"],
                    "description": "Bunood quote-to-cash VAT 15%",
                    "rate": 15,
                    "cost_center": company.cost_center,
                }
            ],
        }
    )


def _append_invoice_lines(invoice, ctx: dict[str, Any], items: list[str]) -> None:
    """Model the launch scenario's third line and one duplicated line."""
    common = {
        "income_account": ctx["company"].default_income_account,
        "cost_center": ctx["company"].cost_center,
    }
    invoice.append(
        "items",
        {
            "item_code": items[2],
            "qty": 1,
            "rate": 40,
            "price_list_rate": 40,
            **common,
        },
    )
    invoice.append(
        "items",
        {
            "item_code": items[0],
            "qty": 1,
            "rate": 50,
            "price_list_rate": 50,
            **common,
        },
    )


def run(company: str = "Bunood Development") -> dict[str, Any]:
    """Execute and roll back one complete native quote-to-cash rehearsal."""
    frappe.set_user("Administrator")
    outer = f"bnd_quote_to_cash_{uuid.uuid4().hex[:10]}"
    frappe.db.savepoint(outer)
    tracked = ("Quotation", "Sales Invoice", "Payment Entry", "GL Entry")
    before = {doctype: frappe.db.count(doctype) for doctype in tracked}
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
        items = _item_codes()

        quotation = _quotation(ctx, items)
        quotation.insert(ignore_permissions=True)
        quotation.submit()
        quotation.reload()
        if len(quotation.items) != 2:
            raise AssertionError("Submitted quotation did not retain both source lines")
        if quotation.discount_amount <= 0:
            raise AssertionError("Submitted quotation did not retain its line discount")
        if quotation.total_taxes_and_charges <= 0:
            raise AssertionError("Submitted quotation did not calculate VAT")

        invoice = make_sales_invoice(quotation.name)
        if not invoice or invoice.doctype != "Sales Invoice":
            raise AssertionError("ERPNext quotation mapper did not return a Sales Invoice")
        invoice.posting_date = frappe.utils.nowdate()
        invoice.due_date = frappe.utils.nowdate()
        invoice.disable_rounded_total = 1
        _append_invoice_lines(invoice, ctx, items)
        invoice.insert(ignore_permissions=True)
        invoice.submit()
        invoice.reload()
        if len(invoice.items) != 4:
            raise AssertionError("Mapped invoice did not retain the two mapped and two added lines")
        mapped_rows = invoice.items[:2]
        source_lines = {(row.item_code, float(row.qty)) for row in quotation.items}
        mapped_lines = {(row.item_code, float(row.qty)) for row in mapped_rows}
        if mapped_lines != source_lines:
            raise AssertionError("Native mapper did not retain the Quotation source lines")
        if invoice.total_taxes_and_charges <= 0:
            raise AssertionError("Mapped invoice did not calculate VAT")
        if invoice.discount_amount <= 0:
            raise AssertionError("Mapped invoice did not retain a discount")
        _assert_close(invoice.paid_amount, 0, "invoice paid amount before receipt")
        _assert_close(invoice.outstanding_amount, invoice.grand_total, "invoice outstanding before receipt")

        cash_account = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": CASH_MODE, "company": company},
            "default_account",
        )
        if not cash_account:
            raise AssertionError(f"{CASH_MODE} has no default account for {company}")
        payment = get_payment_entry(
            "Sales Invoice",
            invoice.name,
            bank_account=cash_account,
        )
        payment.mode_of_payment = CASH_MODE
        payment.insert(ignore_permissions=True)
        payment.submit()
        payment.reload()
        invoice.reload()

        _assert_close(payment.paid_amount, invoice.grand_total, "mapped receipt paid amount")
        _assert_close(payment.received_amount, invoice.grand_total, "mapped receipt received amount")
        _assert_close(invoice.outstanding_amount, 0, "reconciled invoice outstanding")
        references = [
            row
            for row in payment.references
            if row.reference_doctype == "Sales Invoice" and row.reference_name == invoice.name
        ]
        if len(references) != 1:
            raise AssertionError("Native Payment Entry mapper did not retain the invoice reference")
        _assert_close(references[0].allocated_amount, invoice.grand_total, "receipt allocation")

        result.update(
            status="PASS",
            quotation={
                "name": quotation.name,
                "lines": len(quotation.items),
                "discount": quotation.discount_amount,
                "vat": quotation.total_taxes_and_charges,
                "total": quotation.grand_total,
            },
            invoice={
                "name": invoice.name,
                "lines": len(invoice.items),
                "mapped_lines": len(mapped_rows),
                "discount": invoice.discount_amount,
                "vat": invoice.total_taxes_and_charges,
                "total": invoice.grand_total,
                "paid": invoice.paid_amount,
                "outstanding": invoice.outstanding_amount,
            },
            payment={
                "name": payment.name,
                "mode_of_payment": payment.mode_of_payment,
                "paid_amount": payment.paid_amount,
                "received_amount": payment.received_amount,
                "allocated_amount": references[0].allocated_amount,
            },
        )
    except Exception as exc:
        result["error"] = {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }
    finally:
        frappe.db.rollback(save_point=outer)

    after = {doctype: frappe.db.count(doctype) for doctype in tracked}
    result["rollback"] = {"before": before, "after": after, "clean": before == after}
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    if before != after:
        raise AssertionError(f"Rollback verification failed: {before} != {after}")
    return result
