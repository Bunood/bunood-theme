"""Native cash and card payment setup for Bunood invoices and POS profiles.

The payment methods deliberately post to the appropriate balance-sheet accounts:

* ``Cash`` keeps the company's configured cash account.
* ``Network`` posts to a dedicated Bank-type card-settlement clearing account.
* ERPNext's native ``Credit Card`` mode uses that same clearing account.

The clearing account is preferable to treating a card receipt as physical cash.
It can later be reconciled against the merchant acquirer's bank settlement and
fees without contaminating the cash-on-hand balance.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import frappe
from frappe import _
from frappe.utils import getdate, nowdate


CASH_MODE = "Cash"
NETWORK_MODE = "Network"
CARD_MODE = "Credit Card"
NETWORK_ACCOUNT_NAME = "Network Card Clearing"
NETWORK_ACCOUNT_NUMBER = "1210"


def _money(value: object, precision: int) -> Decimal:
    """Return a user amount rounded exactly like the document currency."""
    try:
        amount = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        frappe.throw(_("Enter valid Cash and Network amounts."))
    quantum = Decimal("1").scaleb(-precision)
    return amount.quantize(quantum, rounding=ROUND_HALF_UP)


def _eligible_early_payment_discount(invoice) -> bool:
    """Avoid applying a native early-payment discount twice across two receipts."""
    today = getdate(nowdate())
    return any(
        row.discount
        and not row.discounted_amount
        and row.discount_date
        and getdate(row.discount_date) >= today
        for row in (invoice.get("payment_schedule") or [])
    )


@frappe.whitelist()
def post_mixed_invoice_payment(
    invoice: str,
    cash_amount: object,
    network_amount: object,
    network_reference_no: str,
    reference_date: str | None = None,
) -> dict[str, object]:
    """Post one mixed receipt through two native Payment Entries.

    This function is orchestration only. ERPNext's own ``get_payment_entry``
    mapper creates each document and the standard Payment Entry controller
    validates, submits, writes the Payment Ledger and posts the GL. Bunood does
    not own a payment table, ledger rule or cancellation path.
    """
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

    sales_invoice = frappe.get_doc("Sales Invoice", invoice)
    sales_invoice.check_permission("read")
    frappe.has_permission("Payment Entry", ptype="create", throw=True)
    frappe.has_permission("Payment Entry", ptype="submit", throw=True)

    if sales_invoice.docstatus != 1:
        frappe.throw(_("Submit the Sales Invoice before recording payment."))
    if sales_invoice.is_return:
        frappe.throw(_("Use the native return and refund workflow for a return invoice."))
    if sales_invoice.is_pos:
        frappe.throw(_("Use the native POS payment rows to split a POS invoice."))

    precision = sales_invoice.precision("outstanding_amount") or 2
    outstanding = _money(sales_invoice.outstanding_amount, precision)
    cash = _money(cash_amount, precision)
    network = _money(network_amount, precision)
    if outstanding <= 0:
        frappe.throw(_("This invoice has no outstanding amount to receive."))
    if cash <= 0 or network <= 0:
        frappe.throw(_("A mixed payment needs a Cash amount and a Network amount above zero."))
    if cash + network != outstanding:
        frappe.throw(
            _("Cash and Network must total the outstanding amount of {0} {1}.").format(
                frappe.format_value(float(outstanding), {"fieldtype": "Currency"}),
                sales_invoice.currency,
            )
        )

    network_reference_no = (network_reference_no or "").strip()
    if not network_reference_no:
        frappe.throw(_("Enter the Network transaction reference number."))
    payment_date = getdate(reference_date or nowdate())
    if _eligible_early_payment_discount(sales_invoice):
        frappe.throw(
            _(
                "This invoice has an available early-payment discount. Use the native Payment Entry workflow so the discount is applied once."
            )
        )

    accounts = {
        CASH_MODE: _mapped_account(frappe.get_doc("Mode of Payment", CASH_MODE), sales_invoice.company),
        NETWORK_MODE: _mapped_account(
            frappe.get_doc("Mode of Payment", NETWORK_MODE), sales_invoice.company
        ),
    }
    if not accounts[CASH_MODE] or not accounts[NETWORK_MODE]:
        frappe.throw(_("Cash and Network must both have a default account for this company."))
    if accounts[CASH_MODE] == accounts[NETWORK_MODE]:
        frappe.throw(_("Cash and Network must post to different accounts."))

    entries = []
    for mode, amount in ((CASH_MODE, cash), (NETWORK_MODE, network)):
        payment = get_payment_entry(
            "Sales Invoice",
            sales_invoice.name,
            party_amount=float(amount),
            bank_account=accounts[mode],
            reference_date=payment_date,
        )
        payment.mode_of_payment = mode
        if mode == NETWORK_MODE:
            payment.reference_no = network_reference_no
            payment.reference_date = payment_date
        payment.insert()
        payment.submit()
        entries.append(
            {
                "doctype": payment.doctype,
                "name": payment.name,
                "mode_of_payment": payment.mode_of_payment,
                "amount": float(amount),
                "account": accounts[mode],
                "docstatus": payment.docstatus,
            }
        )

    sales_invoice.reload()
    if _money(sales_invoice.outstanding_amount, precision) != Decimal("0").quantize(
        Decimal("1").scaleb(-precision)
    ):
        frappe.throw(_("The mixed payment did not fully settle the invoice."))

    return {
        "invoice": sales_invoice.name,
        "currency": sales_invoice.currency,
        "outstanding_amount": sales_invoice.outstanding_amount,
        "entries": entries,
        "engine": "ERPNext Payment Entry",
    }


def _enabled_pos_companies() -> list[str]:
    """Return each company that currently owns an enabled POS Profile."""
    if not frappe.db.exists("DocType", "POS Profile"):
        return []
    return frappe.get_all(
        "POS Profile",
        filters={"disabled": 0},
        distinct=True,
        pluck="company",
        order_by="company asc",
    )


def _mode(name: str, payment_type: str):
    """Create or normalize a Mode of Payment while retaining its mappings."""
    if frappe.db.exists("Mode of Payment", name):
        mode = frappe.get_doc("Mode of Payment", name)
        changed = False
        if mode.type != payment_type:
            mode.type = payment_type
            changed = True
        if not mode.enabled:
            mode.enabled = 1
            changed = True
        if changed:
            mode.save(ignore_permissions=True)
        return mode

    return frappe.get_doc(
        {
            "doctype": "Mode of Payment",
            "mode_of_payment": name,
            "type": payment_type,
            "enabled": 1,
        }
    ).insert(ignore_permissions=True)


def _cash_account(company) -> str:
    """Resolve the company's existing leaf cash account; never invent one."""
    if company.default_cash_account and frappe.db.exists(
        "Account",
        {
            "name": company.default_cash_account,
            "company": company.name,
            "is_group": 0,
            "account_type": "Cash",
        },
    ):
        return company.default_cash_account

    account = frappe.db.get_value(
        "Account",
        {"company": company.name, "is_group": 0, "account_type": "Cash"},
        "name",
        order_by="lft asc",
    )
    if not account:
        frappe.throw(
            f"Company {company.name} needs a leaf Cash account before POS payments can be configured."
        )
    return account


def _bank_parent(company: str) -> str:
    parent = frappe.db.get_value(
        "Account",
        {"company": company, "is_group": 1, "account_type": "Bank"},
        "name",
        order_by="lft asc",
    )
    if not parent:
        frappe.throw(
            f"Company {company} needs a Bank group in its chart of accounts before Network payments can be configured."
        )
    return parent


def _network_account(company) -> str:
    """Return the dedicated leaf clearing account, creating it when missing."""
    existing = frappe.db.get_value(
        "Account",
        {
            "company": company.name,
            "account_name": NETWORK_ACCOUNT_NAME,
            "is_group": 0,
        },
        "name",
    )
    if existing:
        return existing

    number = None
    if not frappe.db.exists(
        "Account", {"company": company.name, "account_number": NETWORK_ACCOUNT_NUMBER}
    ):
        number = NETWORK_ACCOUNT_NUMBER

    account = frappe.get_doc(
        {
            "doctype": "Account",
            "account_name": NETWORK_ACCOUNT_NAME,
            "account_number": number,
            "parent_account": _bank_parent(company.name),
            "company": company.name,
            "root_type": "Asset",
            "report_type": "Balance Sheet",
            "account_type": "Bank",
            "account_currency": company.default_currency,
            "is_group": 0,
        }
    )
    account.insert(ignore_permissions=True)
    return account.name


def _mapped_account(mode, company: str) -> str | None:
    for row in mode.accounts:
        if row.company == company:
            return row.default_account
    return None


def _set_mapping(mode, company: str, account: str, *, replace: bool = False) -> None:
    """Add one company mapping, replacing only an explicitly unsafe mapping."""
    for row in mode.accounts:
        if row.company != company:
            continue
        if replace and row.default_account != account:
            row.default_account = account
            mode.save(ignore_permissions=True)
        return
    mode.append("accounts", {"company": company, "default_account": account})
    mode.save(ignore_permissions=True)


def _set_safe_clearing_mapping(mode, company, cash_account: str, fallback: str) -> str:
    """Retain a valid native mapping; repair only missing/cash/invalid mappings."""
    current = _mapped_account(mode, company.name)
    safe = bool(
        current
        and current != cash_account
        and frappe.db.exists(
            "Account",
            {
                "name": current,
                "company": company.name,
                "root_type": "Asset",
                "is_group": 0,
            },
        )
    )
    account = current if safe else fallback
    _set_mapping(
        mode,
        company.name,
        account,
        replace=bool(current and current != account),
    )
    return _mapped_account(mode, company.name) or account


def _ensure_default_bank_account(company, fallback: str) -> str:
    """Fill only a missing/invalid Company default with a native Bank account.

    ERPNext's standard Bank Balance chart resolves its account from
    ``Company.default_bank_account``. Setup already guarantees a valid native
    Bank-type clearing ledger, so leaving this field blank makes the standard
    dashboard fail even though the accounting ledger exists.
    """
    current = company.default_bank_account
    if current and frappe.db.exists(
        "Account",
        {"name": current, "company": company.name, "is_group": 0, "account_type": "Bank"},
    ):
        return current
    account = frappe.db.get_value(
        "Account",
        {
            "company": company.name,
            "is_group": 0,
            "account_type": "Bank",
            "name": ["!=", fallback],
        },
        "name",
        order_by="lft asc",
    ) or fallback
    company.db_set("default_bank_account", account, update_modified=False)
    company.default_bank_account = account
    return account


def _sync_profile(profile, cash_account: str, network_account: str) -> None:
    """Expose both mapped methods on an active profile and keep one default."""
    methods = {row.mode_of_payment for row in profile.payments}
    has_default = any(row.default for row in profile.payments)
    changed = False

    if CASH_MODE not in methods:
        profile.append(
            "payments",
            {"mode_of_payment": CASH_MODE, "default": int(not has_default)},
        )
        has_default = True
        changed = True
    if NETWORK_MODE not in methods:
        profile.append("payments", {"mode_of_payment": NETWORK_MODE, "default": 0})
        changed = True

    # An invalid legacy profile with no default should become usable. Existing
    # valid defaults are preserved, so this setup does not change cashier flow.
    if not has_default:
        for row in profile.payments:
            if row.mode_of_payment == CASH_MODE:
                row.default = 1
                changed = True
                break

    if changed:
        profile.save(ignore_permissions=True)

    # Fail loudly if a future ERPNext change disconnects the profile from the
    # ledger mappings. This is an accounting invariant, not visual setup.
    if not cash_account or not network_account:
        frappe.throw(f"POS Profile {profile.name} has an incomplete payment ledger mapping.")


def ensure_pos_payment_setup() -> dict[str, object]:
    """Provision native Cash/Network accounting for all active POS companies.

    Safe to run on every migrate. Existing non-cash Network mappings are
    respected; the only mapping replaced automatically is the dangerous case
    where Network points to the same physical-cash account as Cash.
    """
    if not frappe.db.exists("DocType", "Mode of Payment"):
        return {"companies": [], "profiles": [], "network_accounts": {}}

    cash_mode = _mode(CASH_MODE, "Cash")
    network_mode = _mode(NETWORK_MODE, "Bank")
    card_mode = _mode(CARD_MODE, "Bank")
    result: dict[str, object] = {
        "companies": [],
        "profiles": [],
        "network_accounts": {},
    }

    for company_name in _enabled_pos_companies():
        company = frappe.get_doc("Company", company_name)
        cash_account = _cash_account(company)
        _set_mapping(cash_mode, company.name, cash_account)
        network_account = _set_safe_clearing_mapping(
            network_mode, company, cash_account, _network_account(company)
        )
        _set_safe_clearing_mapping(card_mode, company, cash_account, network_account)
        _ensure_default_bank_account(company, network_account)

        profiles = frappe.get_all(
            "POS Profile",
            filters={"company": company.name, "disabled": 0},
            pluck="name",
            order_by="name asc",
        )
        for profile_name in profiles:
            _sync_profile(
                frappe.get_doc("POS Profile", profile_name),
                cash_account,
                network_account,
            )

        result["companies"].append(company.name)
        result["profiles"].extend(profiles)
        result["network_accounts"][company.name] = network_account

    return result
