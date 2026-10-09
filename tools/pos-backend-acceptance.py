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

        # A line discount must reach the rate ERPNext charges: ERPNext derives a
        # rate from discount_percentage only when the rate is empty, and every
        # counter line carries one (2026-10-09: 10% previewed at full price).
        discount_checked = False
        if profile.get("allow_discount_change"):
            discounted = pos.preview_cart(
                {**payload, "items": [{**payload["items"][0], "discount_percentage": 10}]}
            )
            line = discounted["items"][0]
            expected = flt(flt(line.get("price_list_rate")) * 0.9, 2)
            assert abs(flt(line.get("rate")) - expected) <= 0.01, f"Discount not applied: {line}"
            assert flt(discounted.get("net_total")) < flt(preview.get("net_total")), "Discount did not lower the total."
            discount_checked = True

        # Every group of the profile sells, not only the first one.
        groups = [g if isinstance(g, str) else (g.get("name") or g.get("item_group")) for g in context.get("item_groups") or []]
        other_group_checked = False
        if len(groups) > 1:
            others = [
                row for row in (pos.get_items(profile_name, item_group=groups[-1], page_length=5).get("items") or [])
                if flt(row.get("price_list_rate")) > 0
            ]
            if others:
                other = pos.preview_cart(
                    {**payload, "items": [{"item_code": others[0]["item_code"], "uom": others[0].get("uom"), "qty": 1}]}
                )
                assert flt(other.get("grand_total")) > 0, "An item of the profile's last group did not price."
                other_group_checked = True

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

        # Pre-release review, 2026-10-09. ERPNext keeps a cashier's discount only when the line's
        # rate is the one it derives itself (the percentage rounded to its field, the amount
        # rounded, then the rate); on a one-cent difference it treats the rate as typed, sets
        # discount_percentage to 0, and Item.max_discount then checks nothing. 12.25 at 10% is a
        # half-cent tie: the amount rounds one way and a rate computed directly the other.
        code = item["item_code"]
        exact_discount = cap_enforced = False
        if profile.get("allow_discount_change"):
            frappe.db.sql(
                "update `tabItem Price` set price_list_rate = 12.25 where item_code = %s and price_list = %s",
                (code, profile.get("selling_price_list")),
            )
            frappe.db.set_value("Item", code, "max_discount", 10, update_modified=False)
            frappe.clear_document_cache("Item", code)
            frappe.clear_cache(doctype="Item")
            line = {**payload["items"][0], "discount_percentage": 10}
            kept = pos.preview_cart({**payload, "items": [line]})["items"][0]
            assert flt(kept.get("discount_percentage")) == 10, f"ERPNext dropped the 10% discount: {kept}"
            saved, _ = pos._new_or_held({**payload, "items": [line]})
            saved.insert()
            assert flt(saved.items[0].discount_percentage) == 10, "The saved line lost its discount percentage."
            exact_discount = True
            try:
                pos.preview_cart({**payload, "items": [{**line, "discount_percentage": 60.004}]})
            except frappe.ValidationError:
                cap_enforced = True
            assert cap_enforced, "A discount above the item's maximum discount was accepted."

        # Sold by a box of twelve, the line must move twelve stock units: the line carried a
        # conversion factor of 1 whatever unit it was sold in.
        box_moves_twelve = False
        stock_uom = frappe.db.get_value("Item", code, "stock_uom")
        taken = {stock_uom, *frappe.get_all("UOM Conversion Detail", filters={"parent": code, "parenttype": "Item"}, pluck="uom")}
        box = next((uom for uom in ("Box", "Pack", "Carton", "Dozen", "Unit") if uom not in taken and frappe.db.exists("UOM", uom)), None)
        assert box, "No spare unit of measure to sell the item by the box."
        if box:
            frappe.get_doc(
                {"doctype": "UOM Conversion Detail", "parent": code, "parenttype": "Item", "parentfield": "uoms", "uom": box, "conversion_factor": 12, "idx": 99}
            ).db_insert()
            frappe.db.set_value("Item", code, "sales_uom", box, update_modified=False)
            frappe.get_doc(
                {"doctype": "Item Price", "item_code": code, "price_list": profile.get("selling_price_list"), "uom": box, "price_list_rate": 120}
            ).insert(ignore_permissions=True)
            frappe.clear_document_cache("Item", code)
            frappe.clear_cache(doctype="Item")
            boxed, _ = pos._new_or_held({**payload, "items": [{"item_code": code, "uom": box, "qty": 1}]})
            row = boxed.items[0]
            assert row.uom == box, f"The box ({box}) was not sold as a box: {row.uom}"
            assert flt(row.conversion_factor) == 12 and flt(row.stock_qty) == 12, (
                f"A box moved {row.stock_qty} stock units (conversion factor {row.conversion_factor})."
            )
            box_moves_twelve = True

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
            "discount_reaches_rate": discount_checked,
            "other_group_sells": other_group_checked,
            "exact_discount_kept": exact_discount,
            "max_discount_enforced": cap_enforced,
            "box_moves_twelve": box_moves_twelve,
            "stale_shift_detected": stale_detected,
            "rolled_back": True,
        }
        print(json.dumps(result, ensure_ascii=False, default=str))
    finally:
        frappe.db.rollback(save_point=savepoint)


run()
