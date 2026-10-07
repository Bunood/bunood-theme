"""Run Bunood's controlled invoice reconciliation matrix on a Frappe site.

The verifier submits real ERPNext documents so that controller, GL and print
behaviour are exercised together.  Every write is enclosed in one database
savepoint and unconditionally rolled back.  ZATCA network integration is
temporarily disabled inside that same transaction; authority acceptance is a
separate, explicitly controlled release gate.
"""

from __future__ import annotations

import io
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable

import frappe
from erpnext.controllers.sales_and_purchase_return import make_return_doc
from pypdf import PdfReader


TOLERANCE = Decimal("0.01")


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _assert_close(actual: Any, expected: Any, label: str) -> None:
    difference = abs(_decimal(actual) - _decimal(expected))
    if difference > TOLERANCE:
        raise AssertionError(f"{label}: {actual} != {expected} (difference {difference})")


def _first(doctype: str, filters: dict[str, Any] | None = None) -> str:
    values = frappe.get_all(doctype, filters=filters or {}, pluck="name", order_by="modified desc", limit=1)
    if not values:
        raise RuntimeError(f"No usable {doctype} fixture exists")
    return values[0]


def _company_context(company_name: str | None) -> dict[str, Any]:
    # Company has no ``disabled`` column in ERPNext 16. Select the most
    # recently used company and let the caller pin a name when a site hosts
    # more than one fixture company.
    company_name = company_name or _first("Company")
    company = frappe.get_doc("Company", company_name)
    tax_accounts = frappe.get_all(
        "Account",
        filters={"company": company.name, "account_type": "Tax", "is_group": 0},
        pluck="name",
    )
    sales_tax_account = next(
        (name for name in tax_accounts if "output" in name.lower()),
        None,
    )
    purchase_tax_account = next(
        (name for name in tax_accounts if "input" in name.lower()),
        None,
    )
    if not sales_tax_account or not purchase_tax_account:
        raise RuntimeError(
            "The company must have distinct Output VAT and Input VAT ledger accounts"
        )
    return {
        "company": company,
        "customer": _first("Customer", {"disabled": 0}),
        "supplier": _first("Supplier", {"disabled": 0}),
        "item": _first("Item", {"disabled": 0, "is_sales_item": 1, "is_purchase_item": 1}),
        "sales_tax_account": sales_tax_account,
        "purchase_tax_account": purchase_tax_account,
    }


def _temporary_receivable_account(ctx: dict[str, Any], currency: str) -> str:
    company = ctx["company"]
    parent = _first(
        "Account",
        {"company": company.name, "root_type": "Asset", "is_group": 1},
    )
    account = frappe.get_doc(
        {
            "doctype": "Account",
            "account_name": f"Bunood Verify {currency} Receivable {uuid.uuid4().hex[:6]}",
            "parent_account": parent,
            "company": company.name,
            "account_type": "Receivable",
            "account_currency": currency,
            "is_group": 0,
        }
    )
    account.insert(ignore_permissions=True)
    return account.name


def _temporary_customer(ctx: dict[str, Any], currency: str) -> str:
    source = frappe.get_doc("Customer", ctx["customer"])
    customer = frappe.get_doc(
        {
            "doctype": "Customer",
            "customer_name": f"Bunood Verify {currency} Customer {uuid.uuid4().hex[:6]}",
            "customer_type": source.customer_type or "Company",
            "customer_group": source.customer_group,
            "territory": source.territory,
        }
    )
    customer.insert(ignore_permissions=True)
    return customer.name


def _disable_zatca(company: str) -> list[dict[str, Any]]:
    if not frappe.db.table_exists("ZATCA Business Settings"):
        return []
    rows = frappe.get_all(
        "ZATCA Business Settings",
        filters={"company": company},
        fields=["name", "enable_zatca_integration", "sync_with_zatca"],
    )
    for row in rows:
        frappe.db.set_value(
            "ZATCA Business Settings",
            row.name,
            {"enable_zatca_integration": 0, "sync_with_zatca": "Batch"},
            update_modified=False,
        )
    return [dict(row) for row in rows]


def _tax_row(
    ctx: dict[str, Any],
    doctype: str,
    rate: float,
    *,
    included: bool = False,
) -> dict[str, Any]:
    return {
        "charge_type": "On Net Total",
        "account_head": (
            ctx["sales_tax_account"]
            if doctype == "Sales Invoice"
            else ctx["purchase_tax_account"]
        ),
        "description": f"Bunood verification VAT {rate}%",
        "rate": rate,
        "included_in_print_rate": int(included),
        "cost_center": ctx["company"].cost_center,
    }


def _item_row(
    ctx: dict[str, Any],
    *,
    qty: float,
    rate: float,
    discount_percentage: float = 0,
    category: str | None = None,
) -> dict[str, Any]:
    effective_rate = rate * (100 - discount_percentage) / 100
    row = {
        "item_code": ctx["item"],
        "qty": qty,
        "rate": effective_rate,
        "price_list_rate": rate,
        "discount_percentage": discount_percentage,
        "income_account": ctx["company"].default_income_account,
        "expense_account": ctx["company"].default_expense_account,
        "cost_center": ctx["company"].cost_center,
    }
    if category and frappe.get_meta("Sales Invoice Item").has_field("custom_zatca_item_tax_category"):
        row["custom_zatca_item_tax_category"] = category
    return row


def _invoice(
    ctx: dict[str, Any],
    doctype: str = "Sales Invoice",
    *,
    qty: float = 2,
    rate: float = 100,
    discount_percentage: float = 0,
    tax_rate: float = 15,
    included: bool = False,
    category: str | None = None,
    currency: str = "SAR",
    conversion_rate: float = 1,
    **values: Any,
):
    company = ctx["company"]
    data: dict[str, Any] = {
        "doctype": doctype,
        "company": company.name,
        "posting_date": frappe.utils.nowdate(),
        "due_date": frappe.utils.nowdate(),
        "bill_date": frappe.utils.nowdate(),
        "set_posting_time": 1,
        "currency": currency,
        "conversion_rate": conversion_rate,
        "cost_center": company.cost_center,
        "disable_rounded_total": 1,
        "items": [
            _item_row(
                ctx,
                qty=qty,
                rate=rate,
                discount_percentage=discount_percentage,
                category=category,
            )
        ],
        "taxes": [_tax_row(ctx, doctype, tax_rate, included=included)],
    }
    if doctype == "Sales Invoice":
        data.update(customer=ctx["customer"], debit_to=company.default_receivable_account)
    else:
        data.update(
            supplier=ctx["supplier"],
            credit_to=company.default_payable_account,
            bill_no=f"BND-VERIFY-{uuid.uuid4().hex[:12]}",
        )
    data.update(values)
    return frappe.get_doc(data)


def _gl_snapshot(doc) -> dict[str, Any]:
    rows = frappe.get_all(
        "GL Entry",
        filters={"voucher_type": doc.doctype, "voucher_no": doc.name, "is_cancelled": 0},
        fields=[
            "account",
            "party_type",
            "party",
            "debit",
            "credit",
            "debit_in_account_currency",
            "credit_in_account_currency",
            "account_currency",
        ],
        order_by="account asc",
    )
    _assert_close(sum(_decimal(row.debit) - _decimal(row.credit) for row in rows), 0, "GL balance")
    return {"count": len(rows), "rows": [dict(row) for row in rows]}


def _assert_tax_gl(doc, ctx: dict[str, Any], expected_base_tax: float) -> None:
    tax_account = (
        ctx["sales_tax_account"]
        if doc.doctype == "Sales Invoice"
        else ctx["purchase_tax_account"]
    )
    rows = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": doc.doctype,
            "voucher_no": doc.name,
            "account": tax_account,
            "is_cancelled": 0,
        },
        fields=["debit", "credit"],
    )
    signed = sum(_decimal(row.credit) - _decimal(row.debit) for row in rows)
    if doc.doctype == "Purchase Invoice":
        signed = -signed
    _assert_close(signed, expected_base_tax, "tax GL")


def _pdf_snapshot(doc) -> dict[str, Any]:
    print_format = (
        "Bunood Sales Invoice (A4)"
        if doc.doctype == "Sales Invoice"
        else "Bunood Purchase Invoice (A4)"
    )
    if not frappe.db.exists("Print Format", print_format):
        raise AssertionError(f"Required print format is missing: {print_format}")
    pdf = frappe.get_print(doc.doctype, doc.name, print_format=print_format, as_pdf=True)
    if not pdf or not bytes(pdf).startswith(b"%PDF"):
        raise AssertionError("Print output is not a PDF")
    reader = PdfReader(io.BytesIO(bytes(pdf)))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if doc.name not in text:
        raise AssertionError("PDF text does not contain the document number")
    return {
        "format": print_format,
        "bytes": len(pdf),
        "pages": len(reader.pages),
        "contains_document_number": True,
    }


def _submitted_snapshot(
    doc,
    ctx: dict[str, Any],
    *,
    net: float,
    tax: float,
    grand: float,
    base_tax: float | None = None,
    outstanding: float | None = None,
) -> dict[str, Any]:
    doc.insert(ignore_permissions=True)
    doc.submit()
    doc.reload()
    _assert_close(doc.net_total, net, "net total")
    _assert_close(doc.total_taxes_and_charges, tax, "tax total")
    _assert_close(doc.grand_total, grand, "grand total")
    _assert_close(doc.outstanding_amount, grand if outstanding is None else outstanding, "outstanding")
    _assert_tax_gl(doc, ctx, tax if base_tax is None else base_tax)
    return {
        "document": {
            "doctype": doc.doctype,
            "name": doc.name,
            "currency": doc.currency,
            "net_total": doc.net_total,
            "tax": doc.total_taxes_and_charges,
            "grand_total": doc.grand_total,
            "base_grand_total": doc.base_grand_total,
            "outstanding": doc.outstanding_amount,
        },
        "gl": _gl_snapshot(doc),
        "pdf": _pdf_snapshot(doc),
    }


def _run_case(case_id: str, title: str, function: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    savepoint = f"bnd_case_{case_id.lower().replace('-', '_')}"
    frappe.db.savepoint(savepoint)
    try:
        evidence = function()
        return {"id": case_id, "title": title, "status": "PASS", "evidence": evidence}
    except Exception as exc:
        frappe.db.rollback(save_point=savepoint)
        return {
            "id": case_id,
            "title": title,
            "status": "FAIL",
            "error": {"type": type(exc).__name__, "message": str(exc), "traceback": traceback.format_exc()},
        }


def run(company: str | None = None) -> dict[str, Any]:
    """Execute the matrix and return JSON-serializable evidence.

    This function never commits.  A failed rollback is raised instead of being
    hidden because persistence safety is part of the release gate.
    """
    frappe.set_user("Administrator")
    outer = f"bnd_finance_matrix_{uuid.uuid4().hex[:10]}"
    frappe.db.savepoint(outer)
    before = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "purchase_invoices": frappe.db.count("Purchase Invoice"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "site": frappe.local.site,
        "safety": {
            "authority_submission": "disabled inside transaction",
            "persistence": "database savepoint plus unconditional rollback",
        },
        "cases": [],
    }
    try:
        ctx = _company_context(company)
        result["company"] = ctx["company"].name
        result["safety"]["zatca_settings"] = _disable_zatca(ctx["company"].name)
        ctx["usd_receivable"] = _temporary_receivable_account(ctx, "USD")
        ctx["usd_customer"] = _temporary_customer(ctx, "USD")

        result["cases"].append(
            _run_case(
                "FIN-01",
                "Exclusive 15% VAT with 10% item discount",
                lambda: _submitted_snapshot(
                    _invoice(ctx, discount_percentage=10), ctx, net=180, tax=27, grand=207
                ),
            )
        )
        result["cases"].append(
            _run_case(
                "FIN-02",
                "VAT included in unit price",
                lambda: _submitted_snapshot(
                    _invoice(ctx, rate=115, included=True), ctx, net=200, tax=30, grand=230
                ),
            )
        )
        result["cases"].append(
            _run_case(
                "FIN-03",
                "Document discount redistributed across net and VAT",
                lambda: _submitted_snapshot(
                    _invoice(ctx, apply_discount_on="Grand Total", discount_amount=23),
                    ctx,
                    net=180,
                    tax=27,
                    grand=207,
                ),
            )
        )
        categories = [
            ("FIN-04", "Zero-rated supply", "Zero rated goods || Export of services"),
            (
                "FIN-05",
                "Exempt supply",
                "Exempt from Tax || Financial services mentioned in Article 29 of the VAT Regulations",
            ),
            (
                "FIN-06",
                "Out-of-scope supply",
                "Services outside scope of tax / Not subject to VAT || {manual entry}",
            ),
        ]
        for case_id, title, category in categories:
            result["cases"].append(
                _run_case(
                    case_id,
                    title,
                    lambda category=category: _submitted_snapshot(
                        _invoice(ctx, tax_rate=0, category=category), ctx, net=200, tax=0, grand=200
                    ),
                )
            )
        result["cases"].append(
            _run_case(
                "FIN-07",
                "Fractional quantity and currency rounding",
                lambda: _submitted_snapshot(
                    _invoice(ctx, qty=0.125, rate=19.99), ctx, net=2.5, tax=0.38, grand=2.88
                ),
            )
        )
        result["cases"].append(
            _run_case(
                "FIN-08",
                "USD invoice conversion at 3.75 SAR",
                lambda: _submitted_snapshot(
                    _invoice(
                        ctx,
                        qty=1,
                        rate=100,
                        currency="USD",
                        conversion_rate=3.75,
                        customer=ctx["usd_customer"],
                        debit_to=ctx["usd_receivable"],
                    ),
                    ctx,
                    net=100,
                    tax=15,
                    grand=115,
                    base_tax=56.25,
                ),
            )
        )

        def sales_return() -> dict[str, Any]:
            original = _invoice(ctx, qty=4, rate=25)
            original_evidence = _submitted_snapshot(original, ctx, net=100, tax=15, grand=115)
            credit = make_return_doc("Sales Invoice", original.name)
            credit.posting_date = frappe.utils.nowdate()
            credit.set_posting_time = 1
            credit.items[0].qty = -4
            credit_evidence = _submitted_snapshot(credit, ctx, net=-100, tax=-15, grand=-115)
            original.reload()
            _assert_close(original.outstanding_amount, 115, "original outstanding before reconciliation")
            _assert_close(
                _decimal(original.outstanding_amount) + _decimal(credit.outstanding_amount),
                0,
                "party net outstanding after full return",
            )
            return {
                "original": original_evidence,
                "credit_note": credit_evidence,
                "original_outstanding_before_reconciliation": original.outstanding_amount,
                "credit_outstanding_before_reconciliation": credit.outstanding_amount,
                "party_net_outstanding": _decimal(original.outstanding_amount)
                + _decimal(credit.outstanding_amount),
                "next_state": "allocate the credit note through Payment Reconciliation",
            }

        result["cases"].append(_run_case("FIN-09", "Full sales return and credit note", sales_return))
        result["cases"].append(
            _run_case(
                "FIN-10",
                "Purchase invoice payable and input VAT",
                lambda: _submitted_snapshot(
                    _invoice(ctx, "Purchase Invoice"), ctx, net=200, tax=30, grand=230
                ),
            )
        )
    finally:
        frappe.db.rollback(save_point=outer)

    after = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "purchase_invoices": frappe.db.count("Purchase Invoice"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result["rollback"] = {"before": before, "after": after, "clean": before == after}
    if before != after:
        raise AssertionError(f"Rollback verification failed: {before} != {after}")
    result["summary"] = {
        "passed": sum(case["status"] == "PASS" for case in result["cases"]),
        "failed": sum(case["status"] == "FAIL" for case in result["cases"]),
        "total": len(result["cases"]),
    }
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    return result
