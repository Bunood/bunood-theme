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
from frappe.utils import cint, date_diff, flt, getdate, now_datetime, nowdate, nowtime


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
    rows = frappe.get_list(
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
    if not rows:
        return rows
    # A submitted closing ends the shift even while ERPNext is still merging
    # ten or more POS Invoices in the background: the opening is marked closed
    # only when that job finishes, and a sale made meanwhile would fall after
    # the closing's period, outside every closing.
    closed = set(
        frappe.get_all(
            "POS Closing Entry",
            filters={"pos_opening_entry": ["in", [row.name for row in rows]], "docstatus": 1},
            pluck="pos_opening_entry",
        )
    )
    return [row for row in rows if row.name not in closed]


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


def _profile_taxes(profile) -> list[dict[str, Any]]:
    """VAT rows for the counter's instant estimate while a preview is in flight.

    Display only: preview_cart and checkout run ERPNext's own tax calculation,
    which stays the authority for every total the cashier collects. Only the
    profile's own template: ERPNext never applies the company's default template
    to a POS invoice (set_taxes_and_charges returns early when is_pos is set), so
    estimating from it would show VAT the sale does not charge.
    """
    template = profile.taxes_and_charges
    if not template:
        return []
    rows = frappe.get_all(
        "Sales Taxes and Charges",
        filters={"parent": template, "parenttype": "Sales Taxes and Charges Template"},
        fields=["charge_type", "rate", "included_in_print_rate"],
        order_by="idx asc",
    )
    return [
        {
            "charge_type": row.charge_type,
            "rate": flt(row.rate),
            "included": bool(row.included_in_print_rate),
        }
        for row in rows
    ]


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
        "taxes": _profile_taxes(profile),
    }


def _can_hold(invoice_type: str) -> bool:
    """Holding needs the hidden marker field that ``setup.ensure_pos_retail`` installs."""
    return bool(frappe.get_meta(invoice_type).has_field(HELD_FIELD))


def _catalog_root() -> str:
    """The top of the item tree. ERPNext's own POS item-group condition still
    confines every lookup to the profile's groups; starting from the profile's
    FIRST group instead would hide, and refuse at checkout, every item filed
    under its other groups."""
    from frappe.utils.nestedset import get_root_of

    return get_root_of("Item Group")


def _capabilities(invoice_type: str) -> dict[str, bool]:
    return {
        "can_hold": _can_hold(invoice_type),
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
        selected = next((row["name"] for row in profiles if row["is_default"]), None)
    if not selected and profiles:
        selected = profiles[0]["name"]

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
    from erpnext.selling.page.point_of_sale.point_of_sale import get_items as native_get_items

    group = item_group or _catalog_root()
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
        fields=["name", "customer_name", "mobile_no", "customer_group", "customer_type", "tax_id"],
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
    from erpnext.selling.page.point_of_sale.point_of_sale import get_items as native_get_items

    result = native_get_items(
        0,
        20,
        profile.selling_price_list,
        _catalog_root(),
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

        uom = authoritative.get("uom") or raw.get("uom")
        stock_uom = authoritative.get("stock_uom") or frappe.get_cached_value("Item", item_code, "stock_uom")
        # ERPNext's catalogue row carries no conversion factor, and ERPNext keeps a
        # factor of 1 on a line whose unit differs from the stock unit: a box of
        # twelve moved one stock unit. The factor comes from the item's own units.
        conversion_factor = 1.0
        if uom and uom != stock_uom:
            from erpnext.stock.get_item_details import get_conversion_factor

            conversion_factor = flt(get_conversion_factor(item_code, uom).get("conversion_factor"))
            if conversion_factor <= 0:
                frappe.throw(_("This unit has no conversion factor. Item: {0} · Unit: {1}").format(item_code, uom))

        row = {
            "item_code": item_code,
            "qty": qty,
            "uom": uom,
            "stock_uom": stock_uom,
            "conversion_factor": conversion_factor,
            "warehouse": profile.warehouse,
            "price_list_rate": rate,
            "rate": rate,
            "batch_no": raw.get("batch_no") or authoritative.get("batch_no"),
            "serial_no": raw.get("serial_no") or authoritative.get("serial_no"),
            "use_serial_batch_fields": 1,
        }
        discount = 0.0
        if profile.allow_discount_change and raw.get("discount_percentage") not in (None, ""):
            discount = _number(raw.get("discount_percentage"), _("Discount"))
            if discount < 0 or discount > 100:
                frappe.throw(_("Discount must be between 0 and 100."))
        child = doc.append("items", row)
        if discount:
            # ERPNext derives the rate from a discount only when the rate is empty
            # (calculate_item_values), and this row always carries one, so the server
            # sets the rate itself, by ERPNext's own steps (calculate_item_rate): the
            # percentage rounded to its field, the amount rounded, then the rate. Any
            # other rate, even a cent apart on a half-cent tie, reads as typed by hand:
            # ERPNext then zeroes discount_percentage and Item.max_discount checks
            # nothing. The cap is checked here too, so the preview refuses it.
            child.discount_percentage = flt(discount, child.precision("discount_percentage"))
            max_discount = flt(frappe.get_cached_value("Item", item_code, "max_discount"))
            if max_discount and child.discount_percentage > max_discount:
                frappe.throw(_("The discount is above the item's maximum. Item: {0} · Maximum discount: {1}%").format(item_code, max_discount))
            child.discount_amount = flt(
                flt(child.price_list_rate) * child.discount_percentage / 100.0, child.precision("discount_amount")
            )
            child.rate = flt(flt(child.price_list_rate) - child.discount_amount, child.precision("rate"))

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
                "price_list_rate": row.price_list_rate,
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
    if not _can_hold(_invoice_type()):
        frappe.throw(_("Holding sales is not set up on this site yet."))
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
    if not _can_hold(invoice_type):
        return []
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
    # The configured invoice type can change. Read both native receipt types
    # so older tickets do not disappear from the in-POS history tab; each row
    # carries its own doctype for Print, Return and Open.
    return receipt_register(
        mode="all", pos_profile=pos_profile, search_term=search_term, limit=limit,
    )["rows"]


@frappe.whitelist(methods=["GET"])
def receipt_register(
    mode: str = "today", company: str = "", pos_profile: str = "",
    search_term: str = "", limit: int = 30, cursor: Any = None,
) -> dict[str, Any]:
    """A permission-filtered, paginated union of actual POS receipts.

    Read-only. Native consolidated Sales Invoices represent POS Invoices that are
    already listed, not additional sales, so they are never shown as receipts of
    their own. Each source goes through ``frappe.get_list``, so row permissions
    hold, and a type the user cannot read is simply not a source.
    """
    modes = {"today", "shift", "mine", "all", "returns"}
    if mode not in modes:
        frappe.throw(_("Choose a valid POS sales filter."))
    selected_profile = _profile(pos_profile).name if pos_profile else ""
    companies = [row.name for row in frappe.get_list(
        "Company", fields=["name"], order_by="name asc", limit_page_length=200,
    )] if frappe.has_permission("Company", "read") else []
    allowed = [doctype for doctype in ("POS Invoice", "Sales Invoice")
               if frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read")]
    if not allowed:
        frappe.throw(_("You cannot view POS receipts."), frappe.PermissionError)
    page_size = min(max(cint(limit), 1), 50)
    position = _json(cursor, {})
    if not isinstance(position, dict):
        frappe.throw(_("The POS request is not valid."))
    offsets = {}
    for doctype in allowed:
        offset = cint(position.get(doctype) or 0)
        if offset < 0 or offset > 100000:
            frappe.throw(_("The POS request is not valid."))
        offsets[doctype] = offset
    shift = None
    if mode == "shift":
        shift = next((row for row in _open_entries()
                      if not company or row.company == company), None)
        if not shift:
            return {"rows": [], "next_cursor": None, "mode": mode,
                    "has_open_shift": False, "sources": allowed, "companies": companies}
    term = (search_term or "").strip()[:100]
    or_filters = None
    if term:
        like = ["like", f"%{term}%"]
        or_filters = {"name": like, "customer": like, "customer_name": like}
    gathered = []
    lengths = {}
    for doctype in allowed:
        meta = frappe.get_meta(doctype)
        filters: dict[str, Any] = {"docstatus": 1, "is_pos": 1}
        if company:
            filters["company"] = company
        if selected_profile:
            filters["pos_profile"] = selected_profile
        if doctype == "Sales Invoice" and meta.has_field("is_consolidated"):
            filters["is_consolidated"] = 0
        if mode == "today":
            filters["posting_date"] = nowdate()
        elif mode == "shift":
            filters.update({"owner": frappe.session.user, "pos_profile": shift.pos_profile,
                            "creation": [">=", str(shift.period_start_date)]})
        elif mode == "mine":
            filters["owner"] = frappe.session.user
        elif mode == "returns":
            filters["is_return"] = 1
        rows = frappe.get_list(
            doctype, filters=filters, or_filters=or_filters,
            fields=[
                "name", "customer", "customer_name", "posting_date", "posting_time", "creation",
                "grand_total", "outstanding_amount", "currency", "status", "is_return",
                "return_against", "owner", "pos_profile",
            ],
            order_by="posting_date desc, posting_time desc, creation desc",
            limit_start=offsets[doctype], limit_page_length=page_size + 1,
        )
        lengths[doctype] = len(rows)
        for row in rows[:page_size]:
            gathered.append({**row, "doctype": doctype})
    gathered.sort(key=lambda row: (
        str(row.get("posting_date") or ""), str(row.get("posting_time") or ""),
        str(row.get("creation") or ""), row["name"], row["doctype"]), reverse=True)
    selected = gathered[:page_size]
    consumed = {doctype: 0 for doctype in allowed}
    for row in selected:
        consumed[row["doctype"]] += 1
    next_cursor = {doctype: offsets[doctype] + consumed[doctype] for doctype in allowed}
    more = any(lengths[doctype] > consumed[doctype] for doctype in allowed)
    return {
        "rows": selected, "next_cursor": next_cursor if more else None,
        "mode": mode, "has_open_shift": bool(shift) if mode == "shift" else None,
        "sources": allowed, "companies": companies,
    }


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


# ── Closing the shift: count first, then see what was expected ─────────────
#
# The closing record is ERPNext's own POS Closing Entry, built by its own
# make_closing_entry_from_opening and submitted through its own lifecycle. This
# shell adds what the native form leaves to a person: the opening float in the
# expected amount (the native form's script adds it client-side), the counted
# amount and the difference per payment method, and a reason when they differ.
# The context call never carries the expected figures, so the count is blind.


def _current_opening(pos_profile: str):
    profile = _profile(pos_profile)
    entry = next((row for row in _unclosed_entries() if row.pos_profile == profile.name), None)
    if not entry:
        frappe.throw(_("There is no open POS shift to close."))
    opening = frappe.get_doc("POS Opening Entry", entry.name)
    opening.check_permission("read")
    return profile, opening


def _counted(values: Any) -> dict[str, float]:
    supplied = _json(values, [])
    if not isinstance(supplied, list):
        frappe.throw(_("The counted amounts are not valid."))
    counted: dict[str, float] = {}
    for raw in supplied:
        if not isinstance(raw, dict):
            continue
        mode = str(raw.get("mode_of_payment") or "")
        amount = _number(raw.get("amount"), _("Counted amount"))
        counted[mode] = counted.get(mode, 0) + amount
    return counted


def _mode_type(mode: str) -> str:
    return frappe.db.get_value("Mode of Payment", mode, "type") or ""


def _closing_draft(opening, profile):
    """ERPNext's closing entry for this shift as it stands now, not saved.

    Every method the shift can count has a row: the ones that took payments
    (ERPNext's own rows), the ones the opening counted, and the profile's, so
    the count screen and the closing record name the same methods.
    """
    from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
        make_closing_entry_from_opening,
    )

    closing = make_closing_entry_from_opening(opening)
    opening_amounts: dict[str, float] = {}
    for row in opening.get("balance_details") or []:
        opening_amounts[row.mode_of_payment] = opening_amounts.get(row.mode_of_payment, 0) + flt(row.opening_amount)
    present = {row.mode_of_payment for row in closing.payment_reconciliation}
    for mode in [*opening_amounts, *(row["mode_of_payment"] for row in _payment_methods(profile))]:
        if mode not in present:
            closing.append("payment_reconciliation", {"mode_of_payment": mode, "opening_amount": 0, "expected_amount": 0})
            present.add(mode)
    for row in closing.payment_reconciliation:
        row.opening_amount = flt(opening_amounts.get(row.mode_of_payment, 0), row.precision("opening_amount"))
        row.expected_amount = flt(flt(row.expected_amount) + row.opening_amount, row.precision("expected_amount"))
    return closing


def _reconcile(closing, counted: dict[str, float]) -> list[dict[str, Any]]:
    known = {row.mode_of_payment for row in closing.payment_reconciliation}
    unknown = sorted(mode for mode, amount in counted.items() if mode not in known and abs(flt(amount)) >= 0.005)
    if unknown:
        frappe.throw(_("Payment method unavailable in this POS Profile: {0}").format(", ".join(unknown)))
    rows = []
    for row in closing.payment_reconciliation:
        mode_type = _mode_type(row.mode_of_payment)
        amount = flt(counted.get(row.mode_of_payment, 0), row.precision("closing_amount"))
        # A card terminal can settle below zero (refunds over sales); a drawer cannot.
        if mode_type == "Cash" and amount < 0:
            frappe.throw(_("Counted cash cannot be negative."))
        row.closing_amount = amount
        row.difference = flt(row.closing_amount - flt(row.expected_amount), row.precision("difference"))
        rows.append(
            {
                "mode_of_payment": row.mode_of_payment,
                "type": mode_type,
                "opening_amount": row.opening_amount,
                "expected_amount": row.expected_amount,
                "closing_amount": row.closing_amount,
                "difference": row.difference,
            }
        )
    return rows


def _closing_summary(closing, rows: list[dict[str, Any]]) -> dict[str, Any]:
    invoices = closing.get("sales_invoices") or closing.get("pos_invoices") or []
    returns = [row for row in invoices if cint(row.get("is_return"))]
    return {
        "opening_entry": closing.pos_opening_entry,
        "period_start_date": closing.period_start_date,
        "period_end_date": closing.period_end_date,
        "rows": rows,
        "invoices": len(invoices) - len(returns),
        "returns": len(returns),
        "returns_total": flt(sum(flt(row.get("grand_total")) for row in returns)),
        "grand_total": closing.grand_total,
        "net_total": closing.net_total,
        "total_taxes_and_charges": closing.total_taxes_and_charges,
        "total_quantity": closing.total_quantity,
    }


@frappe.whitelist(methods=["GET"])
def close_shift_context(pos_profile: str) -> dict[str, Any]:
    """What the cashier counts: method names only. The count is blind."""
    profile, opening = _current_opening(pos_profile)
    # The draft names every method the closing will carry; its figures stay here.
    names = [row.mode_of_payment for row in _closing_draft(opening, profile).payment_reconciliation]
    first = [row["mode_of_payment"] for row in _payment_methods(profile)]
    modes = first + [mode for mode in names if mode not in first]
    invoice_type = _invoice_type()
    held = len(held_carts(profile.name)) if _can_hold(invoice_type) else 0
    return {
        "opening_entry": opening.name,
        "pos_profile": profile.name,
        "period_start_date": opening.period_start_date,
        "methods": [{"mode_of_payment": mode, "type": _mode_type(mode)} for mode in modes],
        "held": held,
        "can_close": _capabilities(invoice_type)["can_close_shift"],
    }


def _checked_count_key(opening) -> str:
    return f"bunood_pos_checked_count:{opening.name}"


@frappe.whitelist(methods=["POST"])
def preview_close(pos_profile: str, counted: Any) -> dict[str, Any]:
    """Expected, counted and difference per method, from the cashier's count.

    It changes no figure. Each distinct count checked here is noted on the
    shift's opening entry, so a recount after seeing the expected figures is
    on the record, not silent.
    """
    profile, opening = _current_opening(pos_profile)
    _require("POS Closing Entry", "create")
    closing = _closing_draft(opening, profile)
    count = _counted(counted)
    rows = _reconcile(closing, count)
    key = _checked_count_key(opening)
    if frappe.cache.get_value(key) != count:
        opening.add_comment(
            "Comment",
            _("Count checked against the expected figures: {0}").format(
                ", ".join(f"{_(row['mode_of_payment'])} {flt(row['closing_amount']):.2f}" for row in rows)
            ),
        )
        frappe.cache.set_value(key, count, expires_in_sec=2 * 24 * 3600)
    return _closing_summary(closing, rows)


@frappe.whitelist(methods=["POST"])
def close_shift(pos_profile: str, counted: Any, reason: str = "") -> dict[str, Any]:
    """Submit ERPNext's POS Closing Entry with the counted amounts."""
    profile, opening = _current_opening(pos_profile)
    _require("POS Closing Entry", "create")
    _require("POS Closing Entry", "submit")
    closing = _closing_draft(opening, profile)
    rows = _reconcile(closing, _counted(counted))
    reason = (reason or "").strip()[:140]
    if any(abs(flt(row["difference"])) >= 0.005 for row in rows) and not reason:
        frappe.throw(_("Give the reason for the difference before closing the shift."))
    closing.insert()
    # Before submit: ERPNext commits inside the closing's on_submit, so a note
    # written after it could be lost while the closing stands.
    if reason:
        closing.add_comment("Comment", _("Count difference at closing: {0}").format(reason))
    closing.submit()
    frappe.cache.delete_value(_checked_count_key(opening))
    closing.reload()
    return {**_closing_summary(closing, rows), "name": closing.name, "status": closing.status}


# ── Returning part of a receipt ────────────────────────────────────────────
#
# The credit note is ERPNext's own: make_sales_return builds it from the
# receipt, every row linked to the row it returns. This shell keeps only the
# rows and quantities the cashier chose, never more than is still returnable,
# sends a damaged row to the company's rejected-goods warehouse, and refunds by
# one of the profile's methods (a negative payment, so the shift's closing
# counts it) or as credit on a named customer's account (no payment, no POS).


def _return_source(source_doctype: str, source_name: str):
    if source_doctype not in INVOICE_TYPES:
        frappe.throw(_("This receipt type cannot be returned."))
    source = frappe.get_doc(source_doctype, source_name)
    source.check_permission("read")
    if source.docstatus != 1 or cint(source.is_return):
        frappe.throw(_("Choose a submitted sale receipt to return."))
    return source


def _return_link(doctype: str) -> str:
    return "sales_invoice_item" if doctype == "Sales Invoice" else "pos_invoice_item"


def _returned_qty(source, lock: bool = False) -> dict[str, float]:
    """Quantities already returned against each receipt row.

    With ``lock`` the read takes row locks, and so sees returns committed while
    this request waited for the receipt's lock; a plain read answers from the
    transaction's snapshot and would miss them.
    """
    link = _return_link(source.doctype)
    rows = frappe.db.get_values(
        f"{source.doctype} Item",
        {link: ["in", [row.name for row in source.items] or [""]], "docstatus": 1},
        [link, "qty"],
        as_dict=True,
        for_update=lock,
    )
    returned: dict[str, float] = {}
    for row in rows:
        returned[row.get(link)] = returned.get(row.get(link), 0) + abs(flt(row.qty))
    return returned


def _damaged_warehouse(company: str) -> str | None:
    rows = frappe.get_all(
        "Warehouse",
        filters={"company": company, "is_rejected_warehouse": 1, "disabled": 0, "is_group": 0},
        pluck="name",
        order_by="name asc",
        limit_page_length=1,
    )
    return rows[0] if rows else None


def _refundable(source, lock: bool = False) -> float:
    """What the receipt took in money, net of change and of refunds already paid out."""
    taken = flt(source.paid_amount) - flt(source.get("change_amount"))
    refunded = frappe.db.get_values(
        source.doctype,
        {"return_against": source.name, "docstatus": 1, "is_return": 1},
        ["paid_amount"],
        as_dict=True,
        for_update=lock,
    )
    return flt(taken - sum(abs(flt(row.paid_amount)) for row in refunded), source.precision("paid_amount"))


@frappe.whitelist(methods=["GET"])
def return_context(source_doctype: str, source_name: str) -> dict[str, Any]:
    source = _return_source(source_doctype, source_name)
    returned = _returned_qty(source)
    lines = []
    for row in source.items:
        already = returned.get(row.name, 0)
        lines.append(
            {
                "row": row.name,
                "item_code": row.item_code,
                "item_name": row.item_name,
                "uom": row.uom,
                "qty": row.qty,
                "rate": row.rate,
                "amount": row.amount,
                "discount_percentage": row.discount_percentage,
                "returned": already,
                "returnable": max(flt(row.qty) - already, 0),
            }
        )
    return {
        "doctype": source.doctype,
        "name": source.name,
        "company": source.company,
        "customer": source.customer,
        "customer_name": source.customer_name,
        "posting_date": source.posting_date,
        "posting_time": source.posting_time,
        "grand_total": source.grand_total,
        "rounded_total": source.rounded_total,
        "currency": source.currency,
        "days": date_diff(nowdate(), source.posting_date),
        "payments": [
            {"mode_of_payment": row.mode_of_payment, "amount": row.amount}
            for row in (source.get("payments") or [])
            if flt(row.amount)
        ],
        "lines": lines,
        "refundable": _refundable(source),
        # A POS Invoice must carry a payment (POSInvoice.validate), so only a
        # Sales Invoice receipt can leave the refund on the customer's account.
        "credit_allowed": source.doctype == "Sales Invoice",
        "damaged_warehouse": _damaged_warehouse(source.company) if cint(source.get("update_stock")) else None,
        # An invoice-level discount or a fixed charge comes back only with the
        # whole receipt (see _partial_return).
        "whole_only": bool(
            flt(source.get("discount_amount"))
            or any(tax.charge_type == "Actual" and flt(tax.tax_amount) for tax in source.get("taxes") or [])
        ),
    }


def _apply_refund(doc, source, profile, refund: str, lock: bool = False) -> None:
    doc.set("payments", [])
    if refund == "__credit__":
        if doc.doctype != "Sales Invoice":
            frappe.throw(_("Credit on account is available for Sales Invoice receipts only."))
        if not doc.customer or doc.customer == profile.customer:
            frappe.throw(_("Credit can stay only on a named customer's account."))
        # A credit note with no payment: the refund stays on the customer's
        # account, so it is not a POS document and no shift counts it.
        doc.is_pos = 0
        doc.is_created_using_pos = 0
        doc.paid_amount = 0
        doc.base_paid_amount = 0
        doc.run_method("calculate_taxes_and_totals")
        return
    allowed = {row["mode_of_payment"]: row for row in _payment_methods(profile)}
    if refund not in allowed:
        frappe.throw(_("Payment method unavailable in this POS Profile: {0}").format(refund))
    doc.is_pos = 1
    if doc.doctype == "Sales Invoice":
        doc.is_created_using_pos = 1
    doc.run_method("calculate_taxes_and_totals")
    total = flt(doc.rounded_total or doc.grand_total, doc.precision("grand_total"))
    # Money goes back only as far as money came in: a sale left partly on the
    # customer's account refunds the rest as credit, never as cash.
    refundable = _refundable(source, lock)
    if abs(total) > refundable + 0.005:
        frappe.throw(_("Paid in money on this receipt: {0}. Choose credit on the customer's account.").format(refundable))
    doc.append(
        "payments",
        {
            "mode_of_payment": refund,
            "account": allowed[refund]["account"],
            "type": allowed[refund]["type"],
            "amount": total,
        },
    )
    doc.run_method("calculate_taxes_and_totals")


def _partial_return(source, profile, lines: Any, refund: str, reason: str, lock: bool = False):
    # The refund leaves this drawer, so the receipt must be this company's.
    if source.company != profile.company:
        frappe.throw(_("This receipt belongs to another company."))
    supplied = _json(lines, [])
    if not isinstance(supplied, list):
        frappe.throw(_("The return lines are not valid."))
    if len(supplied) > MAX_CART_LINES:
        frappe.throw(_("The return lines are not valid."))
    by_row = {row.name: row for row in source.items}
    returned = _returned_qty(source, lock)
    wanted: dict[str, dict[str, Any]] = {}
    for raw in supplied:
        if not isinstance(raw, dict):
            continue
        row_name = str(raw.get("row") or "")
        if row_name not in by_row:
            frappe.throw(_("This line is not on the receipt."))
        qty = _number(raw.get("qty"), _("Quantity"))
        if qty <= 0:
            continue
        available = flt(by_row[row_name].qty) - returned.get(row_name, 0)
        if qty > available + 1e-9:
            frappe.throw(_("Returnable quantity for {0}: {1}").format(by_row[row_name].item_name, available))
        # The counter cannot say which serial numbers come back.
        if qty < available - 1e-9 and frappe.get_cached_value("Item", by_row[row_name].item_code, "has_serial_no"):
            frappe.throw(_("Return part of a serial-numbered item from the invoice form."))
        wanted[row_name] = {"qty": qty, "damaged": bool(raw.get("damaged"))}
    if not wanted:
        frappe.throw(_("Choose at least one item to return."))
    # ERPNext's return negates an invoice-level discount and a fixed charge in
    # full; that is right only when the whole receipt comes back at once.
    whole = not returned and all(
        row.name in wanted and abs(wanted[row.name]["qty"] - flt(row.qty)) <= 1e-9 for row in source.items
    )
    if not whole:
        if flt(source.get("discount_amount")):
            frappe.throw(_("This receipt has a discount on the whole invoice. Return all of it, or return from the invoice form."))
        if any(tax.charge_type == "Actual" and flt(tax.tax_amount) for tax in source.get("taxes") or []):
            frappe.throw(_("This receipt has a fixed charge. Return all of it, or return from the invoice form."))
    damaged_warehouse = None
    if any(pick["damaged"] for pick in wanted.values()):
        damaged_warehouse = _damaged_warehouse(source.company)
        if not damaged_warehouse or not cint(source.get("update_stock")):
            frappe.throw(_("There is no rejected-goods warehouse for damaged items."))

    if source.doctype == "POS Invoice":
        from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return
    else:
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

    doc = make_sales_return(source.name)
    link = _return_link(source.doctype)
    kept = []
    for item in doc.items:
        pick = wanted.get(item.get(link))
        if not pick:
            continue
        item.qty = -pick["qty"]
        item.stock_qty = item.qty * flt(item.conversion_factor or 1)
        if pick["damaged"]:
            item.warehouse = damaged_warehouse
        kept.append(item)
    if len(kept) != len(wanted):
        frappe.throw(_("This line is not on the receipt."))
    doc.set("items", kept)
    doc.pos_profile = profile.name
    doc.posting_date = nowdate()
    doc.posting_time = nowtime()
    doc.set_posting_time = 1
    if reason:
        doc.remarks = reason
        if doc.meta.has_field("custom_return_reason"):
            doc.custom_return_reason = reason
    doc.run_method("calculate_taxes_and_totals")
    _apply_refund(doc, source, profile, refund, lock)
    return doc


def _return_summary(doc) -> dict[str, Any]:
    return {
        **_summary(doc),
        "is_return": 1,
        "return_against": doc.return_against,
        "payments": [
            {"mode_of_payment": row.mode_of_payment, "amount": row.amount}
            for row in (doc.get("payments") or [])
        ],
    }


def _return_request_key(request_id: str) -> str:
    request_id = str(request_id or "").strip()
    if not request_id:
        return ""
    if len(request_id) > 64 or not request_id.replace("-", "").isalnum():
        frappe.throw(_("The POS request is not valid."))
    return f"bunood_pos_return:{frappe.session.user}:{request_id}"


@frappe.whitelist(methods=["POST"])
def preview_return(pos_profile: str, source_doctype: str, source_name: str, lines: Any, refund: str) -> dict[str, Any]:
    """The credit note ERPNext would issue for these lines. Writes nothing."""
    profile = _profile(pos_profile)
    _open_entry(profile.name)
    source = _return_source(source_doctype, source_name)
    _require(source.doctype, "create")
    return _return_summary(_partial_return(source, profile, lines, refund, ""))


@frappe.whitelist(methods=["POST"])
def submit_return(
    pos_profile: str,
    source_doctype: str,
    source_name: str,
    lines: Any,
    refund: str,
    reason: str = "",
    request_id: str = "",
) -> dict[str, Any]:
    """Issue ERPNext's credit note for the chosen lines and refund.

    Repeating a request (a retry after a lost response) answers with the credit
    note it already issued, never a second one.
    """
    profile = _profile(pos_profile)
    _open_entry(profile.name)
    source = _return_source(source_doctype, source_name)
    _require(source.doctype, "create")
    reason = (reason or "").strip()[:140]
    if not reason:
        frappe.throw(_("Give the reason for the return."))
    # One return at a time per receipt: the lock lasts to the end of this
    # request, so a second till waits, then counts this credit note.
    frappe.db.get_value(source.doctype, source.name, "name", for_update=True)
    key = _return_request_key(request_id)
    issued = frappe.cache.get_value(key) if key else None
    if issued and frappe.db.get_value(source.doctype, issued, "docstatus", for_update=True) == 1:
        return {**_return_summary(frappe.get_doc(source.doctype, issued)), "already_issued": True}
    doc = _partial_return(source, profile, lines, refund, reason, lock=True)
    doc.insert()
    doc.check_permission("submit")
    doc.submit()
    if key:
        frappe.cache.set_value(key, doc.name, expires_in_sec=24 * 3600)
    return {**_return_summary(doc), "already_issued": False}


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
