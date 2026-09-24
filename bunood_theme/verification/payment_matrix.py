"""Verify Cash, Network and split POS postings without retaining test data."""

from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import frappe

from bunood_theme.payments import (
    CASH_MODE,
    NETWORK_MODE,
    ensure_pos_payment_setup,
    post_mixed_invoice_payment,
)
from bunood_theme.verification.finance_matrix import (
    _assert_close,
    _company_context,
    _decimal,
    _disable_zatca,
    _invoice,
)


def _mapping(mode: str, company: str) -> str:
    account = frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mode, "company": company},
        "default_account",
    )
    if not account:
        raise AssertionError(f"{mode} has no default account for {company}")
    return account


def _account_debit(invoice: str, account: str) -> Decimal:
    rows = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": "Sales Invoice",
            "voucher_no": invoice,
            "account": account,
            "is_cancelled": 0,
        },
        fields=["debit", "credit"],
    )
    return sum((_decimal(row.debit) - _decimal(row.credit) for row in rows), Decimal("0"))


def _payment_entry_debit(payment_entry: str, account: str) -> Decimal:
    rows = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": "Payment Entry",
            "voucher_no": payment_entry,
            "account": account,
            "is_cancelled": 0,
        },
        fields=["debit", "credit"],
    )
    return sum((_decimal(row.debit) - _decimal(row.credit) for row in rows), Decimal("0"))


def _post_case(
    ctx: dict[str, Any],
    profile: str,
    cash_account: str,
    network_account: str,
    *,
    cash: float,
    network: float,
) -> dict[str, Any]:
    total = cash + network
    payments = []
    if cash:
        payments.append({"mode_of_payment": CASH_MODE, "amount": cash})
    if network:
        payments.append({"mode_of_payment": NETWORK_MODE, "amount": network})

    invoice = _invoice(
        ctx,
        qty=1,
        rate=total,
        tax_rate=0,
        category="Zero rated goods || Export of services",
        is_pos=1,
        pos_profile=profile,
        payments=payments,
    )
    invoice.insert(ignore_permissions=True)
    invoice.submit()
    invoice.reload()

    _assert_close(invoice.grand_total, total, "POS grand total")
    _assert_close(invoice.paid_amount, total, "POS paid amount")
    _assert_close(invoice.outstanding_amount, 0, "POS outstanding amount")
    _assert_close(_account_debit(invoice.name, cash_account), cash, "cash ledger debit")
    _assert_close(
        _account_debit(invoice.name, network_account), network, "network ledger debit"
    )

    return {
        "invoice": invoice.name,
        "grand_total": invoice.grand_total,
        "paid_amount": invoice.paid_amount,
        "outstanding_amount": invoice.outstanding_amount,
        "cash": {"account": cash_account, "debit": float(_account_debit(invoice.name, cash_account))},
        "network": {
            "account": network_account,
            "debit": float(_account_debit(invoice.name, network_account)),
        },
    }


def _post_standard_invoice_mixed_case(
    ctx: dict[str, Any], cash_account: str, network_account: str
) -> dict[str, Any]:
    """Prove the simple-invoice handoff creates two native posted receipts."""
    invoice = _invoice(
        ctx,
        qty=1,
        rate=100,
        tax_rate=0,
        category="Zero rated goods || Export of services",
    )
    invoice.insert(ignore_permissions=True)
    invoice.submit()
    invoice.reload()
    _assert_close(invoice.outstanding_amount, 100, "standard invoice outstanding before payment")

    result = post_mixed_invoice_payment(
        invoice.name,
        40,
        60,
        f"BND-VERIFY-{uuid.uuid4().hex[:12]}",
        frappe.utils.nowdate(),
    )
    invoice.reload()
    _assert_close(invoice.outstanding_amount, 0, "standard invoice outstanding after mixed payment")
    if result["engine"] != "ERPNext Payment Entry":
        raise AssertionError("Mixed payment did not report the native Payment Entry engine")
    if len(result["entries"]) != 2:
        raise AssertionError("Mixed payment must create exactly two Payment Entries")

    entries = {row["mode_of_payment"]: row for row in result["entries"]}
    _assert_close(
        _payment_entry_debit(entries[CASH_MODE]["name"], cash_account),
        40,
        "standard invoice cash Payment Entry debit",
    )
    _assert_close(
        _payment_entry_debit(entries[NETWORK_MODE]["name"], network_account),
        60,
        "standard invoice network Payment Entry debit",
    )
    for row in result["entries"]:
        references = frappe.get_all(
            "Payment Entry Reference",
            filters={"parent": row["name"], "reference_doctype": "Sales Invoice"},
            pluck="reference_name",
        )
        if references != [invoice.name]:
            raise AssertionError(f"{row['name']} is not linked to {invoice.name}")

    return {
        "invoice": invoice.name,
        "outstanding_amount": invoice.outstanding_amount,
        "engine": result["engine"],
        "entries": result["entries"],
    }


def run(company: str = "Bunood Development") -> dict[str, Any]:
    """Post POS and standard-invoice payment cases, then roll every write back."""
    frappe.set_user("Administrator")
    outer = f"bnd_payment_matrix_{uuid.uuid4().hex[:10]}"
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
        "cases": [],
    }
    try:
        ensure_pos_payment_setup()
        ctx = _company_context(company)
        _disable_zatca(company)
        profile = frappe.db.get_value(
            "POS Profile", {"company": company, "disabled": 0}, "name"
        )
        if not profile:
            raise AssertionError(f"No enabled POS Profile exists for {company}")
        cash_account = _mapping(CASH_MODE, company)
        network_account = _mapping(NETWORK_MODE, company)
        if cash_account == network_account:
            raise AssertionError("Cash and Network must not post to the same account")

        cases = (
            ("PAY-01", "Cash only", 100.0, 0.0),
            ("PAY-02", "Network only", 0.0, 100.0),
            ("PAY-03", "Mixed Cash and Network", 40.0, 60.0),
        )
        for case_id, title, cash, network in cases:
            savepoint = f"bnd_{case_id.lower().replace('-', '_')}"
            frappe.db.savepoint(savepoint)
            try:
                evidence = _post_case(
                    ctx,
                    profile,
                    cash_account,
                    network_account,
                    cash=cash,
                    network=network,
                )
                result["cases"].append(
                    {"id": case_id, "title": title, "status": "PASS", "evidence": evidence}
                )
            except Exception as exc:
                frappe.db.rollback(save_point=savepoint)
                result["cases"].append(
                    {
                        "id": case_id,
                        "title": title,
                        "status": "FAIL",
                        "error": {
                            "type": type(exc).__name__,
                            "message": str(exc),
                            "traceback": traceback.format_exc(),
                        },
                    }
                )

        savepoint = "bnd_pay_04"
        frappe.db.savepoint(savepoint)
        try:
            result["cases"].append(
                {
                    "id": "PAY-04",
                    "title": "Standard invoice mixed payment through native Payment Entry",
                    "status": "PASS",
                    "evidence": _post_standard_invoice_mixed_case(
                        ctx, cash_account, network_account
                    ),
                }
            )
        except Exception as exc:
            frappe.db.rollback(save_point=savepoint)
            result["cases"].append(
                {
                    "id": "PAY-04",
                    "title": "Standard invoice mixed payment through native Payment Entry",
                    "status": "FAIL",
                    "error": {
                        "type": type(exc).__name__,
                        "message": str(exc),
                        "traceback": traceback.format_exc(),
                    },
                }
            )
    finally:
        frappe.db.rollback(save_point=outer)

    after = {
        "sales_invoices": frappe.db.count("Sales Invoice"),
        "payment_entries": frappe.db.count("Payment Entry"),
        "gl_entries": frappe.db.count("GL Entry"),
    }
    result["rollback"] = {"before": before, "after": after, "clean": before == after}
    result["summary"] = {
        "passed": sum(case["status"] == "PASS" for case in result["cases"]),
        "failed": sum(case["status"] == "FAIL" for case in result["cases"]),
        "total": len(result["cases"]),
    }
    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    if before != after:
        raise AssertionError(f"Rollback verification failed: {before} != {after}")
    return result
