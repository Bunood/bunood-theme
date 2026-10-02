"""Live, rollback-only acceptance test for Bunood's native ERPNext POS flow.

Run this through ``bench --site <site> console``.  It uses the configured POS
Profile and catalogue, exercises the real document lifecycle, then rolls the
database transaction back so no invoice, return, or held cart survives.
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import flt, now_datetime, nowdate

from bunood_theme import pos


def run() -> None:
    frappe.set_user("Administrator")
    savepoint = "bunood_pos_live_acceptance"
    frappe.db.savepoint(savepoint)
    result = {}

    try:
        context = pos.get_context()
        stale_detected = bool(context.get("stale_opening_entry"))
        if not context.get("opening_entry") and context.get("stale_opening_entry"):
            # Temporarily make the configured register current so the native
            # Sales Invoice validator can exercise the full flow. Rollback in
            # the finally block restores the original opening timestamp.
            opening_name = context["stale_opening_entry"]["name"]
            frappe.db.set_value(
                "POS Opening Entry",
                opening_name,
                {"period_start_date": now_datetime(), "posting_date": nowdate()},
                update_modified=False,
            )
            context = pos.get_context(context["stale_opening_entry"]["pos_profile"])
        profile = context.get("profile") or {}
        profile_name = profile.get("name")
        assert profile_name, "No enabled POS Profile is available."
        assert context.get("opening_entry"), "The selected POS Profile has no open shift."

        catalogue = pos.get_items(profile_name, page_length=60).get("items") or []
        priced = [row for row in catalogue if flt(row.get("price_list_rate")) > 0]
        assert priced, "The selected POS Profile has no priced catalogue item."
        item = max(priced, key=lambda row: flt(row.get("actual_qty")))
        # This staging catalogue currently has zero stock and no valuation
        # history. Treat the selected line as non-stock only inside this
        # rollback transaction so submission can exercise accounting/payment
        # orchestration without manufacturing fake stock records.
        frappe.db.set_value(
            "Item", item["item_code"], "is_stock_item", 0, update_modified=False
        )
        frappe.clear_cache(doctype="Item")
        customer = profile.get("customer") or frappe.db.get_value(
            "Customer", {"disabled": 0}, "name", order_by="modified desc"
        )
        assert customer, "No enabled customer is available for the acceptance sale."

        payload = {
            "pos_profile": profile_name,
            "customer": customer,
            "items": [
                {
                    "item_code": item.get("item_code"),
                    "uom": item.get("uom"),
                    "qty": 1,
                }
            ],
        }
        preview = pos.preview_cart(payload)
        assert flt(preview.get("grand_total")) > 0, "Native preview did not calculate a total."

        ordinary_draft, _ = pos._new_or_held(payload)
        ordinary_draft.insert()
        assert not ordinary_draft.get(pos.HELD_FIELD)
        assert ordinary_draft.name not in {row.name for row in pos.held_carts(profile_name)}

        held = pos.hold_cart(payload)
        held_name = held.get("name")
        assert held_name and frappe.db.exists(context["invoice_type"], held_name)
        assert frappe.db.get_value(context["invoice_type"], held_name, pos.HELD_FIELD) == 1
        assert held_name in {row.name for row in pos.held_carts(profile_name)}
        loaded = pos.load_cart(held_name)
        assert loaded.get("name") == held_name and len(loaded.get("items") or []) == 1

        methods = profile.get("payments") or []
        assert methods, "The selected POS Profile has no payment methods."
        payment = {
            "mode_of_payment": methods[0]["mode_of_payment"],
            "amount": preview.get("rounded_total") or preview.get("grand_total"),
            "reference_no": "BND-ROLLBACK-ACCEPTANCE",
        }
        checked_out = pos.checkout(payload, [payment], held_name)
        assert checked_out.get("docstatus") == 1
        assert not checked_out.get("already_submitted")
        assert frappe.db.get_value(context["invoice_type"], held_name, pos.HELD_FIELD) == 0
        assert held_name not in {row.name for row in pos.held_carts(profile_name)}

        repeated = pos.checkout(payload, [payment], held_name)
        assert repeated.get("already_submitted"), "Checkout idempotency did not engage."

        returned = pos.create_return(checked_out["doctype"], checked_out["name"])
        return_doc = frappe.get_doc(returned["doctype"], returned["name"])
        assert return_doc.docstatus == 0 and return_doc.return_against == checked_out["name"]

        result = {
            "engine": context.get("engine"),
            "profile": profile_name,
            "invoice_type": checked_out.get("doctype"),
            "item": item.get("item_code"),
            "total": checked_out.get("grand_total"),
            "held_and_resumed": True,
            "submitted": True,
            "idempotent_checkout": True,
            "return_draft": True,
            "stale_shift_detected": stale_detected,
            "rolled_back": True,
        }
        print(json.dumps(result, ensure_ascii=False, default=str))
    finally:
        frappe.db.rollback(save_point=savepoint)


run()
