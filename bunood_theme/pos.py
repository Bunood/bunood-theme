"""Bunood's task-first shell over ERPNext's native point-of-sale engine.

This module deliberately owns orchestration, not accounting.  POS Profile,
POS Opening Entry, POS Invoice/Sales Invoice, their payment rows, stock ledger,
taxes, returns, printing and POS Closing Entry remain native ERPNext records.
The browser sends a small cart intent; every authoritative price, account,
tax, total and posting validation is resolved again on the server.
"""

from __future__ import annotations

import io
import json
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, date_diff, flt, get_url, getdate, now_datetime, nowdate, nowtime


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


def _can_on_own(doctype: str, ptype: str) -> bool:
    """Whether the user may ``ptype`` a ``doctype`` record of their own.

    Without a document Frappe answers for records in general, and refuses
    every right granted only on the user's own records (if_owner) except
    create. The cashier's shifts and receipts are always their own, so a
    capability asks about those; the action itself is checked against the
    document once it exists.
    """
    if frappe.has_permission(doctype, ptype=ptype):
        return True
    if ptype == "submit" and not frappe.get_meta(doctype).is_submittable:
        return False
    from frappe.permissions import get_role_permissions

    return bool(get_role_permissions(doctype, is_owner=True).get("if_owner", {}).get(ptype))


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
        store = _store(profile)
        result.append({**row, "is_default": is_default, "warehouse_name": store["warehouse_name"], "branch": store["branch"]})
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


# ── Counter settings ───────────────────────────────────────────────────────
#
# What the counter does on top of ERPNext, per POS Profile, so it applies to
# everyone selling on it. Native choices (images, rate and discount changes,
# credit, rounding, printing, payment methods) stay on the POS Profile itself;
# these are the counter's own, kept as one JSON value in Frappe's DefaultValue
# table under their own parent (not __default, so they never ride in every
# user's boot). Only values that differ from the defaults are stored, and the
# defaults are the counter's behaviour before the settings page existed.

COUNTER_SETTINGS_PARENT = "bunood_pos_settings"
COUNTER_DEFAULTS: dict[str, Any] = {
    "fbar": False,
    "tiles": "m",
    "customer_screen": True,
    "receipt_qr": True,
    "max_discount": 0,
    "returns": True,
    "new_item": True,
    "cash_exact": True,
    "cash_notes": [10, 50, 100, 200, 500],
    "merge_scans": True,
    "scale_prefix": "21",
    "unknown_barcode": "offer",
    "reason_threshold": 0,
    "held_on_close": "carry",
    "bnpl": {},
    "item_scope": "company",
}
BNPL_PROVIDERS = {"tabby": "Tabby", "tamara": "Tamara"}
CASH_NOTES = (1, 5, 10, 20, 50, 100, 200, 500)
# GS1 keeps 20-29 and 02 for in-store numbers: any other prefix would read
# ordinary product barcodes (628… in Saudi Arabia) as scale labels.
STORE_PREFIXES = frozenset({"02", *(f"2{digit}" for digit in range(10))})
NATIVE_FLAGS = (
    "hide_images",
    "hide_unavailable_items",
    "allow_rate_change",
    "allow_discount_change",
    "allow_partial_payment",
    "disable_rounded_total",
    "print_receipt_on_order_complete",
)


def _counter_label(key: str) -> str:
    """The setting's name for the profile's comment, in the reader's language."""
    return {
        "fbar": _("Supermarket mode"),
        "tiles": _("Item tile size"),
        "customer_screen": _("Customer screen"),
        "receipt_qr": _("Receipt code on the customer screen"),
        "max_discount": _("The counter's maximum discount"),
        "returns": _("Returns at the counter"),
        "new_item": _("New items from the counter"),
        "cash_exact": _("Exact cash button"),
        "cash_notes": _("Suggested cash notes"),
        "merge_scans": _("Merge repeated scans"),
        "item_scope": _("Items shown"),
        "scale_prefix": _("Scale label prefix"),
        "unknown_barcode": _("Unknown barcodes"),
        "reason_threshold": _("Difference that needs a reason"),
        "held_on_close": _("Held sales at closing"),
        "bnpl": _("Buy now, pay later"),
    }.get(key, key)


def _clean_counter(values: Any, strict: bool) -> dict[str, Any]:
    """Known keys only, each checked. ``strict`` refuses a bad value (on save);
    otherwise it is dropped and the default stands (on read)."""
    if not isinstance(values, dict):
        if strict:
            frappe.throw(_("The counter settings are not valid."))
        return {}
    clean: dict[str, Any] = {}

    def bad(key: str) -> None:
        if strict:
            frappe.throw(_("Invalid value for the counter setting: {0}").format(key))

    for key, value in values.items():
        if key not in COUNTER_DEFAULTS:
            continue
        default = COUNTER_DEFAULTS[key]
        if isinstance(default, bool):
            if isinstance(value, bool):
                clean[key] = value
            else:
                bad(key)
        elif key == "tiles":
            if value in ("s", "m", "l"):
                clean[key] = value
            else:
                bad(key)
        elif key == "unknown_barcode":
            if value in ("offer", "alert"):
                clean[key] = value
            else:
                bad(key)
        elif key == "item_scope":
            if value in ITEM_SCOPES:
                clean[key] = value
            else:
                bad(key)
        elif key == "held_on_close":
            if value in ("carry", "block"):
                clean[key] = value
            else:
                bad(key)
        elif key in ("max_discount", "reason_threshold"):
            try:
                number = float(value)
            except (TypeError, ValueError):
                bad(key)
                continue
            ceiling = 100 if key == "max_discount" else 1_000_000
            if 0 <= number <= ceiling:
                clean[key] = flt(number, 2)
            else:
                bad(key)
        elif key == "cash_notes":
            if isinstance(value, list) and all(note in CASH_NOTES for note in value):
                clean[key] = sorted(set(value))
            else:
                bad(key)
        elif key == "bnpl":
            clean_map: dict[str, dict[str, Any]] = {}
            ok = isinstance(value, dict) and len(value) <= 10
            for mode, entry in (value.items() if ok else []):
                provider = (entry or {}).get("provider") if isinstance(entry, dict) else None
                installments = (entry or {}).get("installments") if isinstance(entry, dict) else None
                if (
                    not isinstance(mode, str)
                    or len(mode) > 140
                    or provider not in BNPL_PROVIDERS
                    or not isinstance(installments, int)
                    or isinstance(installments, bool)
                    or not 2 <= installments <= 12
                    or (strict and not frappe.db.exists("Mode of Payment", mode))
                ):
                    ok = False
                    break
                clean_map[mode] = {"provider": provider, "installments": installments}
            if ok:
                clean[key] = clean_map
            else:
                bad(key)
        elif key == "scale_prefix":
            text = str(value or "")
            if text == "" or text in STORE_PREFIXES:
                clean[key] = text
            else:
                bad(key)
    return clean


def _drop_counter_cache() -> None:
    from frappe.cache_manager import clear_defaults_cache

    clear_defaults_cache(COUNTER_SETTINGS_PARENT)


def rename_counter_settings(doc, method=None, old: str = "", new: str = "", merge: bool = False) -> None:
    """POS Profile after_rename: the settings follow the profile's new name."""
    stored = frappe.defaults.get_defaults_for(COUNTER_SETTINGS_PARENT).get(old)
    if isinstance(stored, str) and stored and not merge:
        frappe.defaults.set_default(new, stored, parent=COUNTER_SETTINGS_PARENT)
    frappe.defaults.clear_default(key=old, parent=COUNTER_SETTINGS_PARENT)


def drop_counter_settings(doc, method=None) -> None:
    """POS Profile on_trash: a later profile of the same name starts from the defaults."""
    frappe.defaults.clear_default(key=doc.name, parent=COUNTER_SETTINGS_PARENT)


def _counter_settings(profile_name: str) -> dict[str, Any]:
    stored = frappe.defaults.get_defaults_for(COUNTER_SETTINGS_PARENT).get(profile_name)
    settings = {key: (list(value) if isinstance(value, list) else dict(value) if isinstance(value, dict) else value) for key, value in COUNTER_DEFAULTS.items()}
    if isinstance(stored, str) and stored:
        try:
            settings.update(_clean_counter(json.loads(stored), strict=False))
        except ValueError:
            pass
    return settings


def _profile_payload(profile) -> dict[str, Any]:
    return {
        "name": profile.name,
        "company": profile.company,
        # The customer screen's header: the store's own logo, when it has one.
        "company_logo": frappe.get_cached_value("Company", profile.company, "company_logo") or "",
        "warehouse": profile.warehouse,
        "store": _store(profile),
        "currency": profile.currency,
        "customer": profile.customer,
        "selling_price_list": profile.selling_price_list,
        "hide_images": bool(profile.hide_images),
        "hide_unavailable_items": bool(profile.hide_unavailable_items),
        "allow_discount_change": bool(profile.allow_discount_change),
        "allow_rate_change": bool(profile.allow_rate_change),
        "allow_partial_payment": bool(profile.allow_partial_payment),
        # The counter rounds its own estimate the same way while offline.
        "disable_rounded_total": bool(profile.disable_rounded_total),
        "rounding": _rounding_rule(profile),
        "print_format": profile.print_format or "POS Invoice",
        "print_receipt_on_order_complete": bool(profile.print_receipt_on_order_complete),
        "payments": _payment_methods(profile),
        "taxes": _profile_taxes(profile),
        "counter": _counter_settings(profile.name),
        "can_edit": bool(frappe.has_permission("POS Profile", "write", profile)),
    }


def _rounding_rule(profile) -> dict[str, Any]:
    """How ERPNext will round this counter's totals (round_based_on_smallest_currency_fraction):
    the counter repeats it while offline, so what it collects is what posts.
    A new invoice takes its rounding switch from Global Defaults, as a sale will."""
    probe = frappe.new_doc(_invoice_type())
    currency = profile.currency or frappe.get_cached_value("Company", profile.company, "default_currency")
    return {
        "disabled": bool(cint(probe.is_rounded_total_disabled())),
        "fraction": flt(frappe.db.get_value("Currency", currency, "smallest_currency_fraction_value", cache=True)),
        "method": frappe.get_system_settings("rounding_method") or "Banker's Rounding (legacy)",
        "precision": cint(probe.precision("rounded_total")) or 2,
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


# ── Which items a counter sells, and from where ──────────────────────────
#
# A POS Profile belongs to one company and sells from one warehouse (ERPNext
# requires both). An Item has no company in ERPNext, so ERPNext's own catalogue
# shows every company's items; the counter keeps the profile's company's items
# only, unless its settings say otherwise.

MAX_SCOPE_ROUNDS = 10
ITEM_SCOPES = ("company", "warehouse", "all")


def _company_items(company: str, codes: list[str]) -> set[str]:
    """The items among ``codes`` that belong to ``company``. An item is a
    company's when it has stock records (a Bin) in one of its warehouses, or an
    item default for it; an item with neither for any company belongs to every
    company. ERPNext's own item default does not count: it adds one to every new
    item (Item.update_defaults_from_item_group), whoever's item it is, naming the
    site's default warehouse and nothing else; read by that shape, the rule is
    the same for every user (a user's own default company plays no part)."""
    codes = [code for code in dict.fromkeys(codes) if code]
    if not codes:
        return set()
    automatic = frappe.db.get_single_value("Stock Settings", "default_warehouse")
    details = [field.fieldname for field in frappe.get_meta("Item Default").fields if field.fieldtype == "Link" and field.fieldname not in ("company", "default_warehouse")]
    owners: dict[str, set[str]] = {}
    for row in frappe.get_all(
        "Item Default",
        filters={"parenttype": "Item", "parent": ["in", codes]},
        fields=["parent", "company", "default_warehouse", *details],
    ):
        if automatic and row.default_warehouse == automatic and not any(row.get(field) for field in details):
            continue
        if row.company:
            owners.setdefault(row.parent, set()).add(row.company)
    bins = frappe.get_all("Bin", filters={"item_code": ["in", codes]}, fields=["item_code", "warehouse"], distinct=True)
    places = list({row.warehouse for row in bins})
    companies = dict(frappe.get_all("Warehouse", filters={"name": ["in", places]}, fields=["name", "company"], as_list=True)) if places else {}
    for row in bins:
        if companies.get(row.warehouse):
            owners.setdefault(row.item_code, set()).add(companies[row.warehouse])
    return {code for code in codes if not owners.get(code) or company in owners[code]}


def _sold_here(profile, item_code: str, scope: str) -> bool:
    """Whether this counter sells the item at all: ERPNext's own POS conditions,
    the profile's item groups and stock rule, and the counter's items."""
    from erpnext.accounts.doctype.pos_profile.pos_profile import get_item_groups

    item = frappe.db.get_value(
        "Item", item_code, ["disabled", "has_variants", "is_sales_item", "is_fixed_asset", "item_group", "is_stock_item"], as_dict=True
    )
    if not item or item.disabled or item.has_variants or not item.is_sales_item or item.is_fixed_asset:
        return False
    kept = _scoped_items(profile, [item_code], scope)
    if kept is not None and item_code not in kept:
        return False
    groups = get_item_groups(profile.name)
    if groups and item.item_group not in groups:
        return False
    if cint(profile.hide_unavailable_items) and item.is_stock_item:
        return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": profile.warehouse}, "actual_qty")) > 0
    return True


def _scoped_items(profile, codes: list[str], scope: str | None = None) -> set[str] | None:
    """The items among ``codes`` this counter sells, by its item_scope setting (None: every one).
    "company": the company's items (_company_items). "warehouse": the simple bill's rule
    (api.bill_item_query): stock records in the counter's warehouse, or that warehouse as the
    item's default; a service, which no warehouse holds, keeps to the company rule here, so
    another company's services never show."""
    scope = scope or _counter_settings(profile.name)["item_scope"]
    if scope == "all":
        return None
    own = _company_items(profile.company, codes)
    if scope != "warehouse":
        return own
    codes = [code for code in dict.fromkeys(codes) if code]
    if not codes:
        return set()
    held = set(frappe.get_all("Bin", filters={"warehouse": profile.warehouse, "item_code": ["in", codes]}, pluck="item_code"))
    held |= set(
        frappe.get_all(
            "Item Default",
            filters={"parenttype": "Item", "default_warehouse": profile.warehouse, "parent": ["in", codes]},
            pluck="parent",
        )
    )
    services = set(frappe.get_all("Item", filters={"name": ["in", codes], "is_stock_item": 0}, pluck="name"))
    return held | (services & own)


def _branches(warehouses: list[str]) -> dict[str, str]:
    """bunood_business ties a Branch to its warehouse (Branch.bnd_warehouse)."""
    names = [name for name in warehouses if name]
    if not names or not frappe.get_meta("Branch").has_field("bnd_warehouse"):
        return {}
    found: dict[str, str] = {}
    for row in frappe.get_all("Branch", filters={"bnd_warehouse": ["in", names]}, fields=["name", "bnd_warehouse"], order_by="creation asc, name asc"):
        found.setdefault(row.bnd_warehouse, row.name)
    return found


def _store(profile) -> dict[str, Any]:
    """Where this counter sells from, as the cashier should read it."""
    return {
        "company": profile.company,
        "warehouse": profile.warehouse,
        "warehouse_name": frappe.get_cached_value("Warehouse", profile.warehouse, "warehouse_name") or profile.warehouse,
        "branch": _branches([profile.warehouse]).get(profile.warehouse),
    }


def _known_item(term: str) -> tuple[str | None, bool]:
    """The item a scanned code names, whether or not this counter sells it, and
    whether ERPNext read the code as a barcode, serial or batch number (it then
    answers that one item, whatever the page)."""
    from erpnext.selling.page.point_of_sale.point_of_sale import search_for_serial_or_batch_or_barcode_number

    found = (search_for_serial_or_batch_or_barcode_number(term) or {}).get("item_code")
    if found:
        return found, True
    return frappe.db.get_value("Item", term, "name"), False


def _profile_open_shifts(profile_name: str) -> list[str]:
    """Every cashier's shift still open on this POS Profile."""
    rows = frappe.get_all(
        "POS Opening Entry",
        filters={"pos_profile": profile_name, "docstatus": 1, "pos_closing_entry": ["in", ["", None]]},
        pluck="name",
    )
    if not rows:
        return []
    closed = set(
        frappe.get_all(
            "POS Closing Entry", filters={"pos_opening_entry": ["in", rows], "docstatus": 1}, pluck="pos_opening_entry"
        )
    )
    return [name for name in rows if name not in closed]


def _capabilities(invoice_type: str) -> dict[str, bool]:
    return {
        "can_hold": _can_hold(invoice_type),
        "can_create_invoice": bool(frappe.has_permission(invoice_type, ptype="create")),
        "can_submit_invoice": _can_on_own(invoice_type, "submit"),
        "can_print_invoice": _can_on_own(invoice_type, "print"),
        "can_create_customer": bool(frappe.has_permission("Customer", ptype="create")),
        "can_open_shift": bool(
            frappe.has_permission("POS Opening Entry", ptype="create")
            and _can_on_own("POS Opening Entry", "submit")
        ),
        "can_close_shift": bool(
            frappe.has_permission("POS Closing Entry", ptype="create")
            and _can_on_own("POS Closing Entry", "submit")
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
    # Against the entry itself: a cashier may submit only their own shift, and
    # an owner-only right is refused when no document is named.
    _require("POS Opening Entry", "submit", opening)
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
    """Delegate catalogue search, barcode resolution, pricing and stock to ERPNext,
    then keep to the counter's items (its item_scope setting).
    ERPNext pages before that filter, so ``next_start`` says where the next page
    starts and ``more`` whether there is one. A scanned code of an item this
    counter does not sell answers ``elsewhere``, not an unknown code."""
    profile = _profile(pos_profile)
    _open_entry(profile.name)
    from erpnext.selling.page.point_of_sale.point_of_sale import get_items as native_get_items

    group = item_group or _catalog_root()
    term = (search_term or "").strip()[:140]
    size = min(max(cint(page_length), 1), MAX_PAGE_LENGTH)
    offset = max(cint(start), 0)
    scope = _counter_settings(profile.name)["item_scope"]
    known, resolved = _known_item(term) if term else (None, False)
    items: list[dict[str, Any]] = []
    more = False
    for round_number in range(MAX_SCOPE_ROUNDS):
        # One row past the page: "more" only when a row the counter sells is waiting.
        page = (native_get_items(offset, size + 1, profile.selling_price_list, group, profile.name, term) or {}).get("items") or []
        kept = _scoped_items(profile, [row["item_code"] for row in page], scope)
        taken = 0
        for row in page:
            sold = kept is None or row["item_code"] in kept
            if sold and len(items) == size:
                more = not resolved
                break
            taken += 1
            if sold:
                items.append(row)
        offset += taken
        if more or resolved or len(page) <= size:
            break
        if round_number == MAX_SCOPE_ROUNDS - 1:
            more = True
    return {
        "items": items,
        "item_group": group,
        "next_start": offset,
        "more": more,
        "elsewhere": bool(known)
        and known not in {row["item_code"] for row in items}
        and not _sold_here(profile, known, scope),
    }


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


class NotSoldHere(frappe.ValidationError):
    """An item outside this counter's items (its item_scope setting)."""


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
    # A sale made offline from the device's copy is kept for review instead (sync_offline_sale).
    lifted = frappe.flags.bnd_pos_any_item or item_code in (frappe.flags.bnd_pos_review_items or ())
    kept = None if lifted else _scoped_items(profile, [item_code])
    if kept is not None and item_code not in kept:
        frappe.throw(_("Not sold at this point of sale: {0}").format(item_code), NotSoldHere)
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
            ceiling = flt(_counter_settings(profile.name)["max_discount"])
            if ceiling and child.discount_percentage > ceiling:
                frappe.throw(_("The discount is above this counter's maximum: {0}%").format(f"{ceiling:g}"))
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
    frappe.flags.bnd_pos_review_items = _review_items(invoice_type, draft_name or str(data.get("draft") or ""))
    try:
        _apply_cart(doc, data, profile)
    finally:
        frappe.flags.bnd_pos_review_items = None
    return doc, profile


def _review_items(invoice_type: str, draft_name: str) -> set[str]:
    """The items of a sale made offline and kept for review (this cashier's held
    draft marked as sent from a device): the sale happened, so they stay sellable
    when it is completed, even after the counter's items changed. A line added
    since is checked as any other."""
    if not draft_name:
        return set()
    remarks = frappe.db.get_value(invoice_type, {"name": draft_name, "docstatus": 0, "owner": frappe.session.user}, "remarks")
    if not remarks or OFFLINE_MARK not in remarks:
        return set()
    return set(frappe.get_all(f"{invoice_type} Item", filters={"parent": draft_name, "parenttype": invoice_type}, pluck="item_code"))


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
    # The rest of a sale stays on account only for a named customer; the counter
    # said so, but only the server can make it so (a sale sent from a device
    # kept offline, or any direct call, never passed through the counter's check).
    if paid < total and (not doc.customer or doc.customer == profile.customer):
        frappe.throw(_("The rest can stay on account only for a named customer."))

    bnpl = _counter_settings(profile.name)["bnpl"]
    orders = []
    for mode, amount in amounts.items():
        if amount > 0 and mode in bnpl:
            provider = BNPL_PROVIDERS[bnpl[mode]["provider"]]
            if not references.get(mode):
                frappe.throw(_("Order number required from: {0}").format(provider))
            orders.append(_("Order with {0}: {1}").format(provider, references[mode]))
    if orders:
        doc.remarks = " · ".join(filter(None, [doc.get("remarks"), *orders]))

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
def checkout(payload: Any, payments: Any, draft_name: str | None = None, client_id: str = "") -> dict[str, Any]:
    """Submit one native invoice; repeating a submitted draft, or the same
    ``client_id``, answers with the invoice already made."""
    if client_id:
        sale_id = _offline_id(client_id)
        with _sale_lock(sale_id):
            name, status = _posted_sale(_invoice_type(), sale_id, by_remarks=False)
            if name and status == 1:
                return {**_summary(frappe.get_doc(_invoice_type(), name)), "already_submitted": True}
            result = _checkout(payload, payments, draft_name)
            _remember_sale(sale_id, result["name"])
            return result
    return _checkout(payload, payments, draft_name)


def _checkout(payload: Any, payments: Any, draft_name: str | None = None) -> dict[str, Any]:
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


def _needs_reason(rows: list[dict[str, Any]], threshold: float) -> bool:
    """A difference needs a reason when it is above the counter's threshold
    (0: any difference of a halala or more)."""
    return any(abs(flt(row["difference"])) >= 0.005 and abs(flt(row["difference"])) > flt(threshold) for row in rows)


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
    settings = _counter_settings(profile.name)
    # Only today's shift: an out-of-date one cannot complete a held sale, and
    # blocking it would keep the counter from ever opening again.
    current = getdate(opening.period_start_date) == getdate(nowdate())
    if settings["held_on_close"] == "block" and current and _can_hold(_invoice_type()) and held_carts(profile.name):
        frappe.throw(_("Complete the held sales before closing the shift."))
    closing = _closing_draft(opening, profile)
    rows = _reconcile(closing, _counted(counted))
    reason = (reason or "").strip()[:140]
    if _needs_reason(rows, settings["reason_threshold"]) and not reason:
        frappe.throw(_("Give the reason for the difference before closing the shift."))
    closing.insert()
    # Against the closing itself, as for the opening, and before the note:
    # nothing is written for a shift this user may not close.
    _require("POS Closing Entry", "submit", closing)
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


def _returns_allowed(profile) -> None:
    if not _counter_settings(profile.name)["returns"]:
        frappe.throw(_("This counter takes no returns. Return from the invoice form."))


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
    _returns_allowed(profile)
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
    _returns_allowed(profile)
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


# ── The settings page ──────────────────────────────────────────────────────


def _settings_profile(pos_profile: str):
    # Not _profile(): a manager editing a profile need not be one of its cashiers.
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        frappe.throw(_("Choose an available POS Profile."))
    profile = frappe.get_doc("POS Profile", pos_profile)
    profile.check_permission("read")
    return profile


def _payment_modes(company: str, keep: list[str] | None = None) -> list[dict[str, Any]]:
    """Enabled modes of payment, plus any the profile already carries, and
    whether each has an account for the company (ERPNext refuses a POS payment
    row without one). A disabled one already on the profile stays removable."""
    with_account = set(
        frappe.get_all(
            "Mode of Payment Account",
            filters={"company": company, "parenttype": "Mode of Payment", "default_account": ["is", "set"]},
            pluck="parent",
        )
    )
    rows = frappe.get_all(
        "Mode of Payment",
        or_filters={"enabled": 1, "name": ["in", keep or [""]]},
        fields=["name", "type", "enabled"],
        order_by="name asc",
    )
    return [
        {"mode_of_payment": row.name, "type": row.type or "", "has_account": row.name in with_account, "enabled": bool(row.enabled)}
        for row in rows
    ]


def _store_choices(profile, can_edit: bool) -> dict[str, Any]:
    """What the settings page offers: the company's own warehouses (the one in
    use always among them) and the item tree. Its editors see them all (the
    profile is theirs to set, as ERPNext's own form allows); anyone else what
    their own permissions show."""
    fetch = frappe.get_all if can_edit else frappe.get_list

    def listed(doctype: str, **kwargs) -> list:
        try:
            return fetch(doctype, **kwargs)
        except frappe.PermissionError:
            return []

    warehouses = listed(
        "Warehouse",
        filters={"company": profile.company, "is_group": 0, "disabled": 0},
        fields=["name", "warehouse_name"],
        order_by="warehouse_name asc",
        limit_page_length=500,
    )
    if profile.warehouse and not any(row.name == profile.warehouse for row in warehouses):
        warehouses.append(frappe._dict(name=profile.warehouse, warehouse_name=_store(profile)["warehouse_name"]))
    branches = _branches([row.name for row in warehouses])
    chosen = [row.item_group for row in profile.get("item_groups") or []]
    groups = listed("Item Group", fields=["name", "is_group"], order_by="lft asc", limit_page_length=1000)
    known = {row.name for row in groups}
    groups += [frappe._dict(name=name, is_group=0) for name in chosen if name not in known]
    return {
        "warehouses": [
            {"name": row.name, "label": row.warehouse_name or row.name, "branch": branches.get(row.name)} for row in warehouses
        ],
        "groups": [{"name": row.name, "is_group": bool(cint(row.is_group))} for row in groups],
        "companies": frappe.db.count("Company"),
        "open_shifts": _profile_open_shifts(profile.name),
    }


@frappe.whitelist(methods=["GET"])
def settings_context(pos_profile: str) -> dict[str, Any]:
    profile = _settings_profile(pos_profile)
    invoice_type = _invoice_type()
    can_edit = bool(frappe.has_permission("POS Profile", "write", profile))
    return {
        "profile": profile.name,
        "company": profile.company,
        "warehouse": profile.warehouse,
        "can_edit": can_edit,
        "store": _store_choices(profile, can_edit),
        "native": {
            **{field: bool(cint(profile.get(field))) for field in NATIVE_FLAGS},
            "warehouse": profile.warehouse or "",
            "item_groups": [row.item_group for row in profile.get("item_groups") or []],
            "print_format": profile.print_format or "",
            "payments": [
                {"mode_of_payment": row.mode_of_payment, "default": bool(cint(row.default))}
                for row in profile.get("payments") or []
            ],
        },
        "counter": _counter_settings(profile.name),
        "defaults": COUNTER_DEFAULTS,
        "cash_notes": list(CASH_NOTES),
        "modes": _payment_modes(profile.company, [row.mode_of_payment for row in profile.get("payments") or []]),
        "modified": str(profile.modified),
        "print_formats": frappe.get_all(
            "Print Format", filters={"doc_type": invoice_type, "disabled": 0}, pluck="name", order_by="name asc"
        ),
    }


@frappe.whitelist(methods=["POST"])
def save_settings(pos_profile: str, native: Any = None, counter: Any = None, modified: str = "") -> dict[str, Any]:
    """Save the page: native choices on the POS Profile (ERPNext validates and
    versions it), the counter's own as one value. A comment on the profile says
    what changed and who changed it. ``counter`` carries only the keys the page
    changed, so two people saving different settings keep both."""
    profile = _settings_profile(pos_profile)
    profile.check_permission("write")
    if modified and str(profile.modified) != str(modified):
        frappe.throw(_("The POS Profile changed after these settings were opened. Open them again."))
    native = _json(native, {})
    if not isinstance(native, dict):
        frappe.throw(_("The settings are not valid."))
    changed: list[str] = []

    for field in NATIVE_FLAGS:
        if field in native and bool(native[field]) != bool(cint(profile.get(field))):
            profile.set(field, 1 if native[field] else 0)
            changed.append(profile.meta.get_label(field))

    if "warehouse" in native and (native["warehouse"] or "") != (profile.warehouse or ""):
        warehouse = str(native["warehouse"] or "")
        found = frappe.db.get_value("Warehouse", warehouse, ["company", "is_group", "disabled"], as_dict=True) if warehouse else None
        if not found or found.company != profile.company or cint(found.is_group) or cint(found.disabled):
            frappe.throw(_("Choose one of this company's warehouses: {0}").format(profile.company))
        # A shift's sales come from one warehouse; the change waits for every open shift to close.
        shifts = _profile_open_shifts(profile.name)
        if shifts:
            frappe.throw(_("Close the open shifts on this point of sale before changing its warehouse: {0}").format(", ".join(shifts)))
        profile.warehouse = warehouse
        changed.append(profile.meta.get_label("warehouse"))

    if "item_groups" in native:
        wanted = native["item_groups"]
        if not isinstance(wanted, list) or len(wanted) > 200 or not all(isinstance(name, str) for name in wanted):
            frappe.throw(_("The settings are not valid."))
        wanted = list(dict.fromkeys(wanted))
        missing = next((name for name in wanted if not frappe.db.exists("Item Group", name)), None)
        if missing:
            frappe.throw(_("Item group not found: {0}").format(missing))
        existing = {row.item_group: row for row in profile.get("item_groups") or []}
        if list(existing) != wanted:
            profile.set("item_groups", [existing.get(name) or profile.append("item_groups", {"item_group": name}) for name in wanted])
            # A kept row keeps its old position otherwise, and the table reloads in another order.
            for index, row in enumerate(profile.item_groups, 1):
                row.idx = index
            changed.append(profile.meta.get_label("item_groups"))

    if "print_format" in native and (native["print_format"] or "") != (profile.print_format or ""):
        print_format = str(native["print_format"] or "")
        if print_format and not frappe.db.exists(
            "Print Format", {"name": print_format, "doc_type": _invoice_type(), "disabled": 0}
        ):
            frappe.throw(_("Choose a print format for {0}.").format(_(_invoice_type())))
        profile.print_format = print_format or None
        changed.append(profile.meta.get_label("print_format"))

    if "payments" in native:
        wanted = native["payments"]
        if not isinstance(wanted, list) or not wanted or len(wanted) > 20:
            frappe.throw(_("Keep at least one payment method."))
        existing = {row.mode_of_payment: row for row in profile.get("payments") or []}
        usable = {row["mode_of_payment"]: row for row in _payment_modes(profile.company)}
        picked, defaults = [], 0
        for raw in wanted:
            mode = str((raw or {}).get("mode_of_payment") or "")
            if any(item[0] == mode for item in picked):
                frappe.throw(_("Payment method unavailable in this POS Profile: {0}").format(mode))
            # A method the profile already has may stay as it is; a new one must be usable.
            if mode not in existing:
                if mode not in usable:
                    frappe.throw(_("Payment method unavailable in this POS Profile: {0}").format(mode))
                if not usable[mode]["has_account"]:
                    frappe.throw(_("This payment method has no account for the company yet: {0}").format(mode))
            is_default = 1 if (raw or {}).get("default") else 0
            defaults += is_default
            picked.append((mode, is_default))
        if defaults != 1:
            frappe.throw(_("Choose exactly one default payment method."))
        current = [(row.mode_of_payment, cint(row.default)) for row in profile.get("payments") or []]
        if current != picked:
            # The rows kept are the same documents: every other field on them stays.
            rows = []
            for mode, is_default in picked:
                row = existing.get(mode) or profile.append("payments", {"mode_of_payment": mode})
                row.default = is_default
                rows.append(row)
            profile.set("payments", rows)
            for index, row in enumerate(profile.payments, 1):
                row.idx = index
            changed.append(profile.meta.get_label("payments"))

    if changed:
        profile.save()

    if counter is not None:
        before = _counter_settings(profile.name)
        after = {**before, **_clean_counter(_json(counter, {}), strict=True)}
        if after != before:
            stored = {key: value for key, value in after.items() if value != COUNTER_DEFAULTS[key]}
            if stored:
                value = json.dumps(stored, sort_keys=True)
                frappe.defaults.set_default(profile.name, value, parent=COUNTER_SETTINGS_PARENT)
            else:
                frappe.defaults.clear_default(key=profile.name, parent=COUNTER_SETTINGS_PARENT)
            # set_default drops the cache before this commits; a request in that gap
            # would cache the old value again, so drop it once more after the commit.
            frappe.db.after_commit.add(_drop_counter_cache)
            changed += [_counter_label(key) for key in after if after[key] != before[key]]

    if changed:
        profile.add_comment("Comment", _("Counter settings changed: {0}").format(", ".join(changed)))
    return {**settings_context(profile.name), "changed": changed}


# ── Selling through a lost connection ──────────────────────────────────────
#
# The counter keeps a copy of the catalogue on the device and, while the
# connection is down, keeps each sale there too under its own id. When the
# connection returns it sends them one by one. The server prices each again
# (ERPNext's prices, taxes and validation, as for any sale) and submits it with
# the payments the counter took; a sale it would not submit as it stands is
# kept as a held draft marked for review, so nothing posts at a price or with a
# payment the server would refuse. The id is written in the invoice's remarks,
# so a sale sent twice is found and not posted again.

MAX_OFFLINE_ITEMS = 5000
# ERPNext prices every row it pages before the counter keeps its own: past this many
# rows read, the copy stops (truncated), so one request never prices the whole table.
MAX_OFFLINE_SCAN = 10000
OFFLINE_MARK = "bnd-offline:"
SALE_MEMORY = 30 * 24 * 3600


def _sale_key(sale_id: str) -> str:
    return f"bnd-sale:{frappe.session.user}:{sale_id}"


def _in_request() -> bool:
    return bool(getattr(frappe.local, "request", None))


@contextmanager
def _sale_lock(sale_id: str):
    """Two windows, or a retry while the first request still runs, wait for
    each other instead of both posting. In a web request the lock is held until
    the commit (or the rollback): released earlier, a second request could read
    before the first one's invoice exists for it."""
    lock = frappe.cache.lock(f"{frappe.local.site}:bnd-sale-lock:{sale_id}", timeout=120, blocking_timeout=60)
    if not lock.acquire():
        frappe.throw(_("This sale is being sent from another window. Try again in a moment."))
    released = False

    def release() -> None:
        nonlocal released
        if released:
            return
        released = True
        try:
            lock.release()
        except Exception:
            pass

    try:
        yield
    except BaseException:
        release()
        raise
    if _in_request():
        frappe.db.after_commit.add(release)
        frappe.db.after_rollback.add(release)
    else:
        release()


def _posted_sale(doctype: str, sale_id: str, by_remarks: bool) -> tuple[str | None, int | None]:
    """The invoice already made for this sale id, if any. The remembered name is
    read with a row lock, so a commit still in flight is waited for, not missed."""
    name = frappe.cache.get_value(_sale_key(sale_id))
    if name:
        status = frappe.db.get_value(doctype, name, "docstatus", for_update=True)
        if status is not None and cint(status) < 2:
            return name, cint(status)
    if by_remarks:
        rows = frappe.get_all(
            doctype,
            filters={"owner": frappe.session.user, "remarks": ["like", f"%{OFFLINE_MARK}{sale_id}%"], "docstatus": ["<", 2]},
            fields=["name", "docstatus"],
            limit_page_length=1,
        )
        if rows:
            return rows[0].name, cint(rows[0].docstatus)
    return None, None


def _remember_sale(sale_id: str, name: str) -> None:
    """Only once the invoice is committed: a rolled-back one's name can be given to
    another sale, and must never answer for this one."""

    def remember() -> None:
        frappe.cache.set_value(_sale_key(sale_id), name, expires_in_sec=SALE_MEMORY)

    if _in_request():
        frappe.db.after_commit.add(remember)
    else:
        remember()


def _offline_id(value: str) -> str:
    text = str(value or "").strip()
    if not (8 <= len(text) <= 64) or not text.replace("-", "").isalnum() or not text.isascii():
        frappe.throw(_("The POS request is not valid."))
    return text


@frappe.whitelist(methods=["GET"])
def offline_catalog(pos_profile: str) -> dict[str, Any]:
    """The profile's sellable catalogue, priced by ERPNext, with every barcode."""
    profile = _profile(pos_profile)
    items: list[dict[str, Any]] = []
    start = 0
    truncated = False
    while len(items) < MAX_OFFLINE_ITEMS:
        page = get_items(profile.name, start=start, page_length=MAX_PAGE_LENGTH)
        items.extend(page["items"])
        start = page["next_start"]
        if not page["more"]:
            break
        if start >= MAX_OFFLINE_SCAN:
            truncated = True
            break
    truncated = truncated or len(items) >= MAX_OFFLINE_ITEMS
    items = items[:MAX_OFFLINE_ITEMS]
    codes = [row["item_code"] for row in items] or [""]
    groups = dict(frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "item_group"], as_list=True))
    barcodes: dict[str, list[dict[str, str]]] = {}
    for row in frappe.get_all("Item Barcode", filters={"parent": ["in", codes], "parenttype": "Item"}, fields=["parent", "barcode", "uom"]):
        barcodes.setdefault(row.parent, []).append({"barcode": row.barcode, "uom": row.uom or ""})
    for row in items:
        row["item_group"] = groups.get(row["item_code"], "")
        # A barcode of another unit is left out: its price is not in this row.
        row["barcodes"] = [entry["barcode"] for entry in barcodes.get(row["item_code"], []) if entry["uom"] in ("", row.get("uom"))]
    return {
        "profile": profile.name,
        "items": items,
        "truncated": truncated,
        "generated_at": str(now_datetime()),
    }


@frappe.whitelist(methods=["POST"])
def sync_offline_sale(
    offline_id: str, sold_at: str, payload: Any, payments: Any, collected_total: Any = None
) -> dict[str, Any]:
    """Post one sale the counter kept while offline. Sending it again is safe.

    Everything is decided before anything is written: the server prices the
    sale; if the payments it took do not settle that price exactly as collected
    (a price that changed, a rule the counter could not see), the sale is kept
    as a held draft for review with what was collected, and nothing posts."""
    offline_id = _offline_id(offline_id)
    sold_at = str(sold_at or "")[:32]
    invoice_type = _invoice_type()
    with _sale_lock(offline_id):
        name, status = _posted_sale(invoice_type, offline_id, by_remarks=True)
        if name:
            return {"name": name, "status": "submitted" if status == 1 else "review", "already": True}
        data = _cart(payload)
        tendered = _json(payments, [])
        note = f"{_('Sold offline at {0}').format(sold_at)} · {OFFLINE_MARK}{offline_id}"
        reason = ""
        mark = len(frappe.local.message_log)
        try:
            doc, profile = _new_or_held(data)
        except NotSoldHere as error:
            # The counter's items changed after the device copied the catalogue: the sale
            # happened, so it is kept for review, never lost.
            reason = frappe.utils.strip_html(str(error))[:200]
            del frappe.local.message_log[mark:]
        if not reason:
            try:
                _apply_payments(doc, profile, tendered)
            except frappe.ValidationError as error:
                reason = frappe.utils.strip_html(str(error))[:200]
        if not reason and collected_total not in (None, ""):
            total = flt(doc.rounded_total or doc.grand_total, doc.precision("grand_total"))
            collected = _number(collected_total, _("Total"))
            if abs(total - collected) >= 0.005:
                reason = _("Total now: {0} · Collected: {1}").format(total, collected)
        if reason:
            # A fresh draft without payments: the cashier records what was collected when completing it.
            frappe.flags.bnd_pos_any_item = True
            try:
                doc, profile = _new_or_held(data)
            finally:
                frappe.flags.bnd_pos_any_item = False
            collected_text = ", ".join(
                f"{_(str(row.get('mode_of_payment') or ''))} {flt(row.get('amount'))}" for row in tendered if isinstance(row, dict)
            )
            doc.remarks = f"{note} · {_('Collected: {0}').format(collected_text)} · {_('Needs review: {0}').format(reason)}"
            if _can_hold(invoice_type):
                doc.set(HELD_FIELD, 1)
            doc.insert()
            _remember_sale(offline_id, doc.name)
            return {**_summary(doc), "status": "review", "message": reason, "already": False}
        doc.remarks = " · ".join(filter(None, [note, doc.get("remarks")]))
        doc.set(HELD_FIELD, 0)
        doc.insert()
        doc.check_permission("submit")
        doc.submit()
        _remember_sale(offline_id, doc.name)
        return {**_summary(doc), "status": "submitted", "already": False}


@frappe.whitelist(methods=["POST"])
def offline_sale_state(offline_ids: Any) -> dict[str, Any]:
    """Where each kept sale stands: posted, waiting for review, or gone (cancelled or deleted)."""
    ids = _json(offline_ids, [])
    if not isinstance(ids, list) or len(ids) > 200:
        frappe.throw(_("The POS request is not valid."))
    invoice_type = _invoice_type()
    states: dict[str, Any] = {}
    for raw in ids:
        sale_id = _offline_id(raw)
        name = frappe.cache.get_value(_sale_key(sale_id))
        status = frappe.db.get_value(invoice_type, name, "docstatus") if name else None
        if status is None:
            name, status = _posted_sale(invoice_type, sale_id, by_remarks=True)
        states[sale_id] = {"name": name, "docstatus": None if status is None else cint(status)}
    return states


# ── The customer's e-receipt ───────────────────────────────────────────────
#
# After payment the customer screen shows a QR of the receipt's print view,
# reachable without signing in through ERPNext's own Document Share Key, which
# expires after System Settings' document_share_key_expiry days. The screen
# faces the queue and anyone can scan it, so the link is offered only for a
# walk-in sale: the profile's own customer and no VAT number on the receipt.


def _qr_svg(text: str) -> str:
    try:
        import pyqrcode
    except ImportError:
        return ""
    buffer = io.BytesIO()
    pyqrcode.create(text, error="M").svg(
        buffer, scale=1, quiet_zone=2, xmldecl=False, omithw=True, svgclass=None, lineclass=None
    )
    return buffer.getvalue().decode("ascii")


def _share_key(doc) -> str:
    """A key still valid for this receipt, else ERPNext's own new one.

    get_document_share_key() looks only for a key without expiry, while every
    key it makes gets one, so each call would add a row."""
    key = frappe.db.get_value(
        "Document Share Key",
        {"reference_doctype": doc.doctype, "reference_docname": doc.name, "expires_on": [">", nowdate()]},
        "key",
        order_by="expires_on desc",
    )
    return key or doc.get_document_share_key()


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=600, seconds=60 * 60)
def receipt_link(doctype: str, name: str) -> dict[str, Any]:
    """A share link to a walk-in receipt this cashier has just completed, and its QR.

    An empty link (no error) when the receipt is not one to show the queue,
    or the cashier may not print it: the thanks screen then shows no code.
    """
    if doctype not in INVOICE_TYPES:
        frappe.throw(_("This receipt type cannot be shared."))
    doc = frappe.get_doc(doctype, name)
    none = {"name": doc.name, "url": "", "qr_svg": ""}
    # A boolean check: check_permission would raise a 403, and Frappe answers a
    # 403 with a dialog that routes the cashier out of the counter.
    if not frappe.has_permission(doc.doctype, "print", doc):
        return none
    if doc.docstatus != 1 or not cint(doc.is_pos) or doc.owner != frappe.session.user:
        frappe.throw(_("Only a receipt you completed can be shared."))
    walk_in = doc.pos_profile and doc.customer == frappe.db.get_value("POS Profile", doc.pos_profile, "customer")
    if not walk_in or doc.get("tax_id") or not _counter_settings(doc.pos_profile)["receipt_qr"]:
        return none
    query = {"doctype": doc.doctype, "name": doc.name, "key": _share_key(doc)}
    print_format = frappe.db.get_value("POS Profile", doc.pos_profile, "print_format") if doc.pos_profile else None
    if print_format:
        query["format"] = print_format
    url = get_url(f"/printview?{urlencode(query)}")
    return {"name": doc.name, "url": url, "qr_svg": _qr_svg(url)}


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
