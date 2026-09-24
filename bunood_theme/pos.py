"""Bunood's task-first shell over ERPNext's native point-of-sale engine.

This module deliberately owns orchestration, not accounting.  POS Profile,
POS Opening Entry, POS Invoice/Sales Invoice, their payment rows, stock ledger,
taxes, returns, printing and POS Closing Entry remain native ERPNext records.
The browser sends a small cart intent; every authoritative price, account,
tax, total and posting validation is resolved again on the server.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate


MAX_CART_LINES = 200
MAX_PAGE_LENGTH = 60
INVOICE_TYPES = frozenset({"POS Invoice", "Sales Invoice"})
HELD_FIELD = "custom_bunood_is_held"


def _json(value: Any, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            frappe.throw(_("The POS request is not valid."))
    return value


def _require(doctype: str, ptype: str, doc=None) -> None:
    frappe.has_permission(doctype, ptype=ptype, doc=doc, throw=True)


def _invoice_type() -> str:
    value = frappe.db.get_single_value("POS Settings", "invoice_type") or "POS Invoice"
    return value if value in INVOICE_TYPES else "POS Invoice"


def _profile(name: str):
    if not name or not frappe.db.exists("POS Profile", name):
        frappe.throw(_("Choose an available POS Profile."))
    doc = frappe.get_doc("POS Profile", name)
    doc.check_permission("read")
    if cint(doc.disabled):
        frappe.throw(_("This POS Profile is disabled."))

    assigned = [row.user for row in (doc.get("applicable_for_users") or []) if row.user]
    if assigned and frappe.session.user not in assigned:
        frappe.throw(_("This POS Profile is not assigned to your user."), frappe.PermissionError)
    return doc


def _available_profiles() -> list[dict[str, Any]]:
    allowed = frappe.get_list(
        "POS Profile",
        filters={"disabled": 0},
        fields=["name", "company", "warehouse", "currency", "customer", "selling_price_list"],
        order_by="company asc, name asc",
        limit_page_length=200,
    )
    result = []
    for row in allowed:
        profile = frappe.get_cached_doc("POS Profile", row.name)
        assigned = [item.user for item in (profile.get("applicable_for_users") or []) if item.user]
        if assigned and frappe.session.user not in assigned:
            continue
        is_default = any(
            item.user == frappe.session.user and cint(item.default)
            for item in (profile.get("applicable_for_users") or [])
        )
        result.append({**row, "is_default": is_default})
    return result


def _unclosed_entries() -> list[dict[str, Any]]:
    return frappe.get_list(
        "POS Opening Entry",
        filters={
            "user": frappe.session.user,
            "docstatus": 1,
            "pos_closing_entry": ["in", ["", None]],
        },
        fields=["name", "company", "pos_profile", "period_start_date", "posting_date"],
        order_by="period_start_date desc",
        limit_page_length=20,
    )


def _open_entries() -> list[dict[str, Any]]:
    """Return only shifts ERPNext will accept for today's POS documents."""
    today = getdate(nowdate())
    return [row for row in _unclosed_entries() if getdate(row.period_start_date) == today]


def _stale_entries() -> list[dict[str, Any]]:
    today = getdate(nowdate())
    return [row for row in _unclosed_entries() if getdate(row.period_start_date) != today]


def _open_entry(profile: str, *, required: bool = True) -> dict[str, Any] | None:
    entry = next((row for row in _open_entries() if row.pos_profile == profile), None)
    if required and not entry:
        frappe.throw(_("Open the POS shift before creating or changing a sale."))
    return entry


def _payment_methods(profile) -> list[dict[str, Any]]:
    rows = []
    for payment in profile.get("payments") or []:
        account, payment_type = frappe.db.get_value(
            "Mode of Payment Account",
            {"parent": payment.mode_of_payment, "company": profile.company},
            ["default_account", "parenttype"],
        ) or (None, None)
        # The child row's parenttype is not the payment type. Resolve that from
        # the native master and keep the account lookup permission-neutral: the
        # caller may use a profile without configuration access.
        payment_type = frappe.db.get_value("Mode of Payment", payment.mode_of_payment, "type")
        rows.append(
            {
                "mode_of_payment": payment.mode_of_payment,
                "default": bool(payment.default),
                "type": payment_type or "",
                "account": account or "",
            }
        )
    return rows


def _profile_payload(profile) -> dict[str, Any]:
    return {
        "name": profile.name,
        "company": profile.company,
        "warehouse": profile.warehouse,
        "currency": profile.currency,
        "customer": profile.customer,
        "selling_price_list": profile.selling_price_list,
        "hide_images": bool(profile.hide_images),
        "hide_unavailable_items": bool(profile.hide_unavailable_items),
        "allow_discount_change": bool(profile.allow_discount_change),
        "allow_rate_change": bool(profile.allow_rate_change),
        "allow_partial_payment": bool(profile.allow_partial_payment),
        "print_format": profile.print_format or "POS Invoice",
        "print_receipt_on_order_complete": bool(profile.print_receipt_on_order_complete),
        "payments": _payment_methods(profile),
    }


def _capabilities(invoice_type: str) -> dict[str, bool]:
    return {
        "can_create_invoice": bool(frappe.has_permission(invoice_type, ptype="create")),
        "can_submit_invoice": bool(frappe.has_permission(invoice_type, ptype="submit")),
        "can_print_invoice": bool(frappe.has_permission(invoice_type, ptype="print")),
        "can_create_customer": bool(frappe.has_permission("Customer", ptype="create")),
        "can_open_shift": bool(
            frappe.has_permission("POS Opening Entry", ptype="create")
            and frappe.has_permission("POS Opening Entry", ptype="submit")
        ),
        "can_close_shift": bool(
            frappe.has_permission("POS Closing Entry", ptype="create")
            and frappe.has_permission("POS Closing Entry", ptype="submit")
        ),
    }


@frappe.whitelist(methods=["GET"])
def get_context(pos_profile: str | None = None) -> dict[str, Any]:
    """Return the permission-filtered data needed for the POS first paint."""
    _require("POS Profile", "read")
    invoice_type = _invoice_type()
    profiles = _available_profiles()
    entries = _open_entries()
    stale_entries = _stale_entries()
    # A cashier can operate only the register already open for that user.  A
    # route/query parameter must never switch the screen to a second profile
    # while a current or stale register still needs to be closed.
    selected = entries[0].pos_profile if entries else None
    if not selected:
        selected = stale_entries[0].pos_profile if stale_entries else pos_profile
    if not selected:
        selected = next((row.name for row in profiles if row.is_default), None)
    if not selected and profiles:
        selected = profiles[0].name

    profile_data = None
    groups = []
    if selected:
        selected_doc = _profile(selected)
        profile_data = _profile_payload(selected_doc)
        from erpnext.accounts.doctype.pos_profile.pos_profile import get_item_groups

        groups = get_item_groups(selected) or []

    return {
        "invoice_type": invoice_type,
        "profiles": profiles,
        "profile": profile_data,
        "item_groups": groups,
        "opening_entries": entries,
        "opening_entry": next((row for row in entries if row.pos_profile == selected), None),
        "stale_opening_entry": next(
            (row for row in stale_entries if row.pos_profile == selected), None
        ),
        "capabilities": _capabilities(invoice_type),
        "online_only": True,
        "engine": "ERPNext POS",
    }


@frappe.whitelist(methods=["POST"])
def open_shift(pos_profile: str, balances: Any = None) -> dict[str, Any]:
    """Submit a native POS Opening Entry for the current cashier."""
    profile = _profile(pos_profile)
    _require("POS Opening Entry", "create")
    _require("POS Opening Entry", "submit")
    existing = _open_entry(profile.name, required=False)
    if existing:
        return existing
    blocking = next(
        (row for row in _unclosed_entries() if row.pos_profile != profile.name), None
    )
    if blocking:
        frappe.throw(
            f"{_('Review and close the current POS shift before opening another POS Profile.')} "
            f"{_('Reference')}: {blocking.name}"
        )
    stale = next((row for row in _stale_entries() if row.pos_profile == profile.name), None)
    if stale:
        frappe.throw(
            f"{_('Review and close the outdated POS shift before opening a new shift.')} "
            f"{_('Reference')}: {stale.name}"
        )

    supplied = _json(balances, [])
    by_mode = {
        str(row.get("mode_of_payment") or ""): flt(row.get("opening_amount"))
        for row in supplied
        if isinstance(row, dict)
    }
    payment_rows = [
        {
            "mode_of_payment": method["mode_of_payment"],
            "opening_amount": by_mode.get(method["mode_of_payment"], 0),
        }
        for method in _payment_methods(profile)
    ]
    if not payment_rows:
        frappe.throw(_("The POS Profile needs at least one payment method."))

    opening = frappe.get_doc(
        {
            "doctype": "POS Opening Entry",
            "period_start_date": now_datetime(),
            "posting_date": nowdate(),
            "user": frappe.session.user,
            "pos_profile": profile.name,
            "company": profile.company,
            "balance_details": payment_rows,
        }
    )
    opening.insert()
    opening.submit()
    return {
        "name": opening.name,
        "company": opening.company,
        "pos_profile": opening.pos_profile,
        "period_start_date": opening.period_start_date,
        "posting_date": opening.posting_date,
    }


@frappe.whitelist(methods=["GET"])
def get_items(
    pos_profile: str,
    start: int = 0,
    page_length: int = 36,
    item_group: str | None = None,
    search_term: str = "",
) -> dict[str, Any]:
    """Delegate catalogue search, barcode resolution, pricing and stock to ERPNext."""
    profile = _profile(pos_profile)
    _open_entry(profile.name)
    from erpnext.selling.page.point_of_sale.point_of_sale import (
        get_items as native_get_items,
        get_parent_item_group,
    )

    group = item_group or get_parent_item_group(profile.name)
    result = native_get_items(
        max(cint(start), 0),
        min(max(cint(page_length), 1), MAX_PAGE_LENGTH),
        profile.selling_price_list,
        group,
        profile.name,
        (search_term or "").strip()[:140],
    ) or {"items": []}
    return {"items": result.get("items") or [], "item_group": group}


@frappe.whitelist(methods=["GET"])
def search_customers(search_term: str = "", limit: int = 20) -> list[dict[str, Any]]:
    _require("Customer", "read")
    term = (search_term or "").strip()[:140]
    filters = {"disabled": 0}
    or_filters = None
    if term:
        like = ["like", f"%{term}%"]
        or_filters = {"name": like, "customer_name": like, "mobile_no": like}
    return frappe.get_list(
        "Customer",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "customer_name", "mobile_no", "customer_group"],
        order_by="customer_name asc",
        limit_page_length=min(max(cint(limit), 1), 40),
    )


def _cart(payload: Any) -> dict[str, Any]:
    data = _json(payload, {})
    if not isinstance(data, dict):
        frappe.throw(_("The POS cart is not valid."))
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        frappe.throw(_("Add at least one item to the cart."))
    if len(items) > MAX_CART_LINES:
        frappe.throw(_("This cart has too many lines. Start a second sale."))
    return data


def _number(value: Any, label: str) -> float:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        frappe.throw(_("Invalid number: {0}").format(label))
    if not number.is_finite():
        frappe.throw(_("Invalid number: {0}").format(label))
    return float(number)


def _native_catalog_item(profile, item_code: str, uom: str | None = None) -> dict[str, Any]:
    from erpnext.selling.page.point_of_sale.point_of_sale import (
        get_items as native_get_items,
        get_parent_item_group,
    )

    result = native_get_items(
        0,
        20,
        profile.selling_price_list,
        get_parent_item_group(profile.name),
        profile.name,
        item_code,
    ) or {"items": []}
    rows = result.get("items") or []
    item = next(
        (
            row
            for row in rows
            if row.get("item_code") == item_code and (not uom or row.get("uom") == uom)
        ),
        None,
    ) or next((row for row in rows if row.get("item_code") == item_code), None)
    if not item:
        frappe.throw(_("Item unavailable in this POS Profile: {0}").format(item_code))
    return item


def _apply_cart(doc, data: dict[str, Any], profile) -> None:
    customer = (data.get("customer") or profile.customer or "").strip()
    if not customer:
        frappe.throw(_("Choose a customer before saving the sale."))
    customer_doc = frappe.get_doc("Customer", customer)
    if not customer_doc.has_permission("read"):
        frappe.throw(_("You cannot use this customer."), frappe.PermissionError)

    doc.customer = customer
    doc.company = profile.company
    doc.pos_profile = profile.name
    doc.is_pos = 1
    doc.set_warehouse = profile.warehouse
    if doc.doctype == "Sales Invoice":
        doc.is_created_using_pos = 1
    doc.set("items", [])

    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            frappe.throw(_("One cart line is not valid."))
        item_code = str(raw.get("item_code") or "").strip()
        if not item_code:
            frappe.throw(_("Every cart line needs an item."))
        qty = _number(raw.get("qty"), _("Quantity"))
        if qty <= 0:
            frappe.throw(_("Quantity must be greater than zero."))
        authoritative = _native_catalog_item(profile, item_code, raw.get("uom"))
        rate = authoritative.get("price_list_rate")
        if rate in (None, ""):
            frappe.throw(_("Selling price missing for item: {0}").format(item_code))
        if profile.allow_rate_change and raw.get("rate") not in (None, ""):
            rate = _number(raw.get("rate"), _("Rate"))
        if flt(rate) < 0:
            frappe.throw(_("Rate cannot be negative."))

        row = {
            "item_code": item_code,
            "qty": qty,
            "uom": authoritative.get("uom") or raw.get("uom"),
            "stock_uom": authoritative.get("stock_uom"),
            "conversion_factor": authoritative.get("conversion_factor") or 1,
            "warehouse": profile.warehouse,
            "price_list_rate": rate,
            "rate": rate,
            "batch_no": raw.get("batch_no") or authoritative.get("batch_no"),
            "serial_no": raw.get("serial_no") or authoritative.get("serial_no"),
            "use_serial_batch_fields": 1,
        }
        if profile.allow_discount_change and raw.get("discount_percentage") not in (None, ""):
            discount = _number(raw.get("discount_percentage"), _("Discount"))
            if discount < 0 or discount > 100:
                frappe.throw(_("Discount must be between 0 and 100."))
            row["discount_percentage"] = discount
        doc.append("items", row)

    # This is ERPNext's own POS initializer. It resolves accounts, price-list
    # context, taxes, warehouse defaults and payment rows from the profile.
    doc.run_method("set_missing_values")
    doc.run_method("calculate_taxes_and_totals")


def _new_or_held(data: dict[str, Any], draft_name: str | None = None):
    invoice_type = _invoice_type()
    profile = _profile(str(data.get("pos_profile") or ""))
    _open_entry(profile.name)
    if draft_name:
        doc = frappe.get_doc(invoice_type, draft_name)
        doc.check_permission("write")
        if doc.docstatus != 0 or not cint(doc.get(HELD_FIELD)) or not cint(doc.is_pos):
            frappe.throw(_("Only a held draft can be changed."))
        if doc.owner != frappe.session.user or doc.pos_profile != profile.name:
            frappe.throw(_("This held sale belongs to another cashier or POS Profile."), frappe.PermissionError)
    else:
        _require(invoice_type, "create")
        doc = frappe.new_doc(invoice_type)
    _apply_cart(doc, data, profile)
    return doc, profile


def _summary(doc) -> dict[str, Any]:
    return {
        "doctype": doc.doctype,
        "name": doc.name,
        "docstatus": doc.docstatus,
        "status": doc.status,
        "customer": doc.customer,
        "currency": doc.currency,
        "net_total": doc.net_total,
        "total_taxes_and_charges": doc.total_taxes_and_charges,
        "grand_total": doc.grand_total,
        "rounded_total": doc.rounded_total,
        "paid_amount": doc.paid_amount,
        "change_amount": doc.change_amount,
        "total_qty": doc.total_qty,
        "print_format": getattr(doc, "select_print_heading", None),
        "items": [
            {
                "item_code": row.item_code,
                "item_name": row.item_name,
                "qty": row.qty,
                "uom": row.uom,
                "rate": row.rate,
                "amount": row.amount,
                "discount_percentage": row.discount_percentage,
            }
            for row in doc.items
        ],
    }


@frappe.whitelist(methods=["POST"])
def preview_cart(payload: Any) -> dict[str, Any]:
    data = _cart(payload)
    doc, _profile_doc = _new_or_held(data)
    return _summary(doc)


@frappe.whitelist(methods=["POST"])
def hold_cart(payload: Any, draft_name: str | None = None) -> dict[str, Any]:
    """Insert or update a native draft; its document name is the resume token."""
    data = _cart(payload)
    doc, _profile_doc = _new_or_held(data, draft_name)
    doc.set(HELD_FIELD, 1)
    if doc.is_new():
        doc.insert()
    else:
        doc.save()
    return _summary(doc)


def _apply_payments(doc, profile, values: Any) -> None:
    supplied = _json(values, [])
    if not isinstance(supplied, list):
        frappe.throw(_("Payment details are not valid."))
    allowed = {row["mode_of_payment"]: row for row in _payment_methods(profile)}
    amounts: dict[str, float] = {}
    references: dict[str, str] = {}
    for raw in supplied:
        if not isinstance(raw, dict):
            continue
        mode = str(raw.get("mode_of_payment") or "")
        if mode not in allowed:
            frappe.throw(_("Payment method unavailable in this POS Profile: {0}").format(mode))
        amount = _number(raw.get("amount"), _("Payment amount"))
        if amount < 0:
            frappe.throw(_("Payment amount cannot be negative."))
        amounts[mode] = amounts.get(mode, 0) + amount
        if raw.get("reference_no"):
            references[mode] = str(raw.get("reference_no")).strip()[:140]

    total = flt(doc.rounded_total or doc.grand_total, doc.precision("grand_total"))
    paid = flt(sum(amounts.values()), doc.precision("paid_amount"))
    if paid <= 0:
        frappe.throw(_("Enter a payment amount."))
    if not profile.allow_partial_payment and paid < total:
        frappe.throw(_("Payment must cover the full sale total."))

    existing = {row.mode_of_payment: row for row in (doc.get("payments") or [])}
    for row in doc.get("payments") or []:
        row.amount = 0
        if row.meta.has_field("custom_bunood_reference_no"):
            row.custom_bunood_reference_no = ""
    for mode, amount in amounts.items():
        row = existing.get(mode)
        if not row:
            row = doc.append(
                "payments",
                {
                    "mode_of_payment": mode,
                    "account": allowed[mode]["account"],
                    "type": allowed[mode]["type"],
                    "default": int(allowed[mode]["default"]),
                },
            )
        row.amount = amount
        if references.get(mode) and row.meta.has_field("custom_bunood_reference_no"):
            row.custom_bunood_reference_no = references[mode]
    doc.run_method("calculate_taxes_and_totals")


@frappe.whitelist(methods=["POST"])
def checkout(payload: Any, payments: Any, draft_name: str | None = None) -> dict[str, Any]:
    """Submit one native invoice; repeating a submitted draft is idempotent."""
    data = _cart(payload)
    invoice_type = _invoice_type()
    if draft_name and frappe.db.exists(invoice_type, draft_name):
        current = frappe.get_doc(invoice_type, draft_name)
        current.check_permission("read")
        if current.docstatus == 1:
            if current.owner != frappe.session.user or not cint(current.is_pos) or current.pos_profile != data.get("pos_profile"):
                frappe.throw(_("This held sale is not available."), frappe.PermissionError)
            return {**_summary(current), "already_submitted": True}

    doc, profile = _new_or_held(data, draft_name)
    _apply_payments(doc, profile, payments)
    doc.set(HELD_FIELD, 0)
    if doc.is_new():
        doc.insert()
    else:
        doc.save()
    doc.check_permission("submit")
    doc.submit()
    return {**_summary(doc), "already_submitted": False}


@frappe.whitelist(methods=["GET"])
def held_carts(pos_profile: str, limit: int = 30) -> list[dict[str, Any]]:
    profile = _profile(pos_profile)
    invoice_type = _invoice_type()
    _require(invoice_type, "read")
    return frappe.get_list(
        invoice_type,
        filters={
            "docstatus": 0,
            "owner": frappe.session.user,
            "pos_profile": profile.name,
            "is_pos": 1,
            HELD_FIELD: 1,
        },
        fields=["name", "customer", "customer_name", "grand_total", "total_qty", "modified"],
        order_by="modified desc",
        limit_page_length=min(max(cint(limit), 1), 100),
    )


@frappe.whitelist(methods=["GET"])
def sale_history(pos_profile: str, search_term: str = "", limit: int = 30) -> list[dict[str, Any]]:
    profile = _profile(pos_profile)
    invoice_type = _invoice_type()
    _require(invoice_type, "read")
    filters: dict[str, Any] = {"docstatus": 1, "pos_profile": profile.name, "is_pos": 1}
    term = (search_term or "").strip()[:140]
    or_filters = None
    if term:
        like = ["like", f"%{term}%"]
        or_filters = {"name": like, "customer": like, "customer_name": like}
    return frappe.get_list(
        invoice_type,
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "customer",
            "customer_name",
            "posting_date",
            "posting_time",
            "grand_total",
            "currency",
            "status",
            "is_return",
            "return_against",
        ],
        order_by="posting_date desc, posting_time desc",
        limit_page_length=min(max(cint(limit), 1), 100),
    )


@frappe.whitelist(methods=["GET"])
def load_cart(name: str) -> dict[str, Any]:
    invoice_type = _invoice_type()
    doc = frappe.get_doc(invoice_type, name)
    doc.check_permission("read")
    if doc.owner != frappe.session.user or doc.docstatus != 0 or not cint(doc.is_pos) or not cint(doc.get(HELD_FIELD)):
        frappe.throw(_("This held sale is not available."), frappe.PermissionError)
    return {**_summary(doc), "pos_profile": doc.pos_profile}


@frappe.whitelist(methods=["POST"])
def create_return(source_doctype: str, source_name: str) -> dict[str, Any]:
    """Create a native return draft from the original submitted receipt."""
    if source_doctype not in INVOICE_TYPES:
        frappe.throw(_("This receipt type cannot be returned."))
    source = frappe.get_doc(source_doctype, source_name)
    source.check_permission("read")
    if source.docstatus != 1 or cint(source.is_return):
        frappe.throw(_("Choose a submitted sale receipt to return."))
    _require(source_doctype, "create")
    if source_doctype == "POS Invoice":
        from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return
    else:
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

    returned = make_sales_return(source.name)
    returned.insert()
    return {
        "doctype": returned.doctype,
        "name": returned.name,
        "route": ["Form", returned.doctype, returned.name],
    }


def ensure_pos_reference_field() -> None:
    """Install one non-financial reference field on native POS payment rows."""
    if not frappe.db.exists("DocType", "Sales Invoice Payment"):
        return
    fieldname = "custom_bunood_reference_no"
    existing = frappe.db.get_value(
        "Custom Field", {"dt": "Sales Invoice Payment", "fieldname": fieldname}, "name"
    )
    values = {
        "label": "Payment Reference",
        "fieldtype": "Data",
        "insert_after": "amount",
        "description": "Card, network, or external tender reference captured at Bunood POS checkout.",
        "no_copy": 1,
        "translatable": 0,
    }
    if existing:
        field = frappe.get_doc("Custom Field", existing)
        changed = False
        for key, value in values.items():
            if field.get(key) != value:
                field.set(key, value)
                changed = True
        if changed:
            field.save(ignore_permissions=True)
        return
    frappe.get_doc(
        {
            "doctype": "Custom Field",
            "dt": "Sales Invoice Payment",
            "fieldname": fieldname,
            **values,
        }
    ).insert(ignore_permissions=True)


def ensure_pos_hold_field() -> None:
    """Mark only explicitly suspended native drafts, without changing their accounting."""
    for doctype in INVOICE_TYPES:
        if not frappe.db.exists("DocType", doctype):
            continue
        if frappe.db.exists("Custom Field", {"dt": doctype, "fieldname": HELD_FIELD}):
            continue
        frappe.get_doc(
            {
                "doctype": "Custom Field",
                "dt": doctype,
                "fieldname": HELD_FIELD,
                "label": "Held in Bunood POS",
                "fieldtype": "Check",
                "insert_after": "is_pos",
                "hidden": 1,
                "read_only": 1,
                "no_copy": 1,
                "default": "0",
            }
        ).insert(ignore_permissions=True)
