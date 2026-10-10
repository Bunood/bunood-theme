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


def refused(call, message: str) -> bool:
    """True only when ``call`` is refused for ``message`` (as translated for this
    user): a refusal for some other reason must not pass for this one."""
    try:
        call()
    except frappe.ValidationError as error:
        head = frappe._(message).split("{0}")[0].strip()
        assert head in str(error), (message, str(error))
        return True
    return False


def run() -> None:
    frappe.set_user("Administrator")
    savepoint = "bunood_pos_live_acceptance"
    frappe.db.savepoint(savepoint)
    result = {}
    context = {}
    used_sale_ids = []

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

        # Phase 3, 2026-10-09: the customer screen's e-receipt is ERPNext's own
        # share link, which printview's own key check accepts for this receipt.
        from urllib.parse import parse_qs, urlparse

        from frappe.www.printview import validate_key

        link = pos.receipt_link(checked_out["doctype"], checked_out["name"])
        query = parse_qs(urlparse(link["url"]).query)
        assert query.get("name") == [checked_out["name"]] and query.get("key"), link["url"]
        receipt = frappe.get_doc(checked_out["doctype"], checked_out["name"])
        assert validate_key(query["key"][0], receipt) is None, "The share key does not open the receipt."
        assert validate_key("not-the-key", receipt) is False, "Any key opens the receipt."
        assert link["qr_svg"].startswith("<svg"), "No QR was drawn."
        # One key per receipt while it is valid, not a new row per call.
        assert pos.receipt_link(checked_out["doctype"], checked_out["name"])["url"] == link["url"], "A second call made a second key."
        # The code faces the queue: a receipt carrying a VAT number gets none.
        frappe.db.set_value(checked_out["doctype"], checked_out["name"], "tax_id", "300000000000003", update_modified=False)
        assert pos.receipt_link(checked_out["doctype"], checked_out["name"])["url"] == "", "A VAT receipt got a public code."

        returned = pos.create_return(checked_out["doctype"], checked_out["name"])
        return_doc = frappe.get_doc(returned["doctype"], returned["name"])
        assert return_doc.docstatus == 0 and return_doc.return_against == checked_out["name"]

        # Phase 2, 2026-10-09. The count is blind: nothing the cashier reads before
        # counting carries an expected figure. close_shift itself is NOT exercised
        # here: ERPNext's POS Closing Entry.on_submit commits (create_merge_logs),
        # so no rollback can undo it; the reason guard refuses before any write.
        closing_context = pos.close_shift_context(profile_name)
        assert "expected" not in json.dumps(closing_context, default=str), "The count context leaks expected figures."
        zero_count = json.dumps([{"mode_of_payment": row["mode_of_payment"], "amount": 0} for row in closing_context["methods"]])
        first_mode = methods[0]["mode_of_payment"]
        expected = lambda result: next(flt(row["expected_amount"]) for row in result["rows"] if row["mode_of_payment"] == first_mode)
        before_close = pos.preview_close(profile_name, zero_count)
        assert any(abs(flt(row["difference"])) >= 0.005 for row in before_close["rows"]), "The sale reached no closing row."
        reason_required = refused(
            lambda: pos.close_shift(profile_name, zero_count, ""),
            "Give the reason for the difference before closing the shift.",
        )
        assert reason_required, "A shift with a difference closed without a reason."

        # A partial return: one of three, ERPNext's own credit note, refunded by
        # the profile's first method, and counted by the shift's closing.
        three = {**payload, "items": [{**payload["items"][0], "qty": 3}]}
        three_total = pos.preview_cart(three)
        three_total = flt(three_total.get("rounded_total") or three_total.get("grand_total"))
        sold = pos.checkout(three, [{"mode_of_payment": first_mode, "amount": three_total}])
        sold_line = pos.return_context(sold["doctype"], sold["name"])["lines"][0]
        assert flt(sold_line["returnable"]) == 3, sold_line
        one = json.dumps([{"row": sold_line["row"], "qty": 1}])
        reason_refused = refused(
            lambda: pos.submit_return(profile_name, sold["doctype"], sold["name"], one, first_mode, ""),
            "Give the reason for the return.",
        )
        assert reason_refused, "A return was issued without a reason."
        request_id = frappe.generate_hash(length=16)
        credit = pos.submit_return(profile_name, sold["doctype"], sold["name"], one, first_mode, "acceptance", request_id)
        assert credit.get("already_issued") is False, credit
        # A retry after a lost answer gets the same credit note back, not a second refund.
        replay = pos.submit_return(profile_name, sold["doctype"], sold["name"], one, first_mode, "acceptance", request_id)
        assert replay.get("already_issued") is True and replay["name"] == credit["name"], replay
        note = frappe.get_doc(credit["doctype"], credit["name"])
        refund = flt(note.rounded_total or note.grand_total)
        assert note.docstatus == 1 and note.is_return and note.return_against == sold["name"]
        assert len(note.items) == 1 and flt(note.items[0].qty) == -1, [(row.item_code, row.qty) for row in note.items]
        assert refund < 0 and abs(flt(note.paid_amount) - refund) < 0.005, (note.paid_amount, refund)
        assert [row.mode_of_payment for row in note.payments if flt(row.amount)] == [first_mode]
        assert flt(pos.return_context(sold["doctype"], sold["name"])["lines"][0]["returnable"]) == 2
        # Refused for the quantity, not by the money cap three units would also hit.
        over_refused = refused(
            lambda: pos.preview_return(profile_name, sold["doctype"], sold["name"], json.dumps([{"row": sold_line["row"], "qty": 3}]), first_mode),
            "Returnable quantity for {0}: {1}",
        )
        assert over_refused, "More than the returnable quantity was accepted."
        walk_in_credit_refused = None
        if customer == profile.get("customer"):
            walk_in_credit_refused = refused(
                lambda: pos.preview_return(profile_name, sold["doctype"], sold["name"], one, "__credit__"),
                "Credit can stay only on a named customer's account.",
            )
            assert walk_in_credit_refused, "Credit was left on the walk-in customer's account."
        after_close = pos.preview_close(profile_name, zero_count)
        assert abs(expected(after_close) - (expected(before_close) + three_total + refund)) < 0.01, (
            expected(before_close), three_total, refund, expected(after_close)
        )
        assert after_close["returns"] == before_close["returns"] + 1

        # Phase 5, 2026-10-10: a sale kept on a device while offline posts once,
        # priced by the server; one the server will not post becomes a held
        # draft for review; a walk-in remainder is refused on the server.
        catalog = pos.offline_catalog(profile_name)
        assert catalog["items"] and all("barcodes" in row for row in catalog["items"]), "The offline catalogue is empty."
        due_now = pos.preview_cart(payload)
        due_now = flt(due_now.get("rounded_total") or due_now.get("grand_total"))
        offline_id = f"acceptance-{frappe.generate_hash(length=12)}"
        used_sale_ids.extend([offline_id, f"{offline_id}-b", f"{offline_id}-c"])
        cash_row = [{"mode_of_payment": first_mode, "amount": due_now}]
        synced = pos.sync_offline_sale(offline_id, "2026-10-10 09:00", json.dumps(payload), json.dumps(cash_row))
        assert synced["status"] == "submitted" and synced["docstatus"] == 1, synced
        again = pos.sync_offline_sale(offline_id, "2026-10-10 09:00", json.dumps(payload), json.dumps(cash_row))
        assert again["already"] and again["name"] == synced["name"], again
        short = pos.sync_offline_sale(f"{offline_id}-b", "2026-10-10 09:01", json.dumps(payload), json.dumps([{"mode_of_payment": first_mode, "amount": 0.01}]))
        assert short["status"] == "review" and short["docstatus"] == 0, short
        # Review 2026-10-10: a total that moved since the device priced it goes to
        # review with what was collected, and nothing posts.
        moved = pos.sync_offline_sale(
            f"{offline_id}-c", "2026-10-10 09:02", json.dumps(payload), json.dumps(cash_row), str(flt(due_now) - 1)
        )
        assert moved["status"] == "review", moved
        assert "bnd-offline:" in frappe.db.get_value(moved["doctype"], moved["name"], "remarks")
        states = pos.offline_sale_state(json.dumps([offline_id, f"{offline_id}-c", f"{offline_id}-zz"]))
        assert states[offline_id]["docstatus"] == 1 and states[f"{offline_id}-c"]["docstatus"] == 0, states
        assert states[f"{offline_id}-zz"]["name"] is None, states
        # One sale id, one invoice: a checkout whose answer was lost and is sent again.
        client_id = f"acceptance-{frappe.generate_hash(length=12)}"
        used_sale_ids.append(client_id)
        first_try = pos.checkout(payload, cash_row, None, client_id)
        second_try = pos.checkout(payload, cash_row, None, client_id)
        assert first_try["name"] == second_try["name"] and second_try["already_submitted"], (first_try, second_try)
        # …and the same id, sent from the device's queue afterwards, finds that invoice too.
        from_queue = pos.sync_offline_sale(client_id, "2026-10-10 09:03", json.dumps(payload), json.dumps(cash_row), str(due_now))
        assert from_queue["already"] and from_queue["name"] == first_try["name"], from_queue
        if customer == profile.get("customer"):
            assert refused(
                lambda: pos.checkout(payload, [{"mode_of_payment": first_mode, "amount": 0.01}]),
                "The rest can stay on account only for a named customer.",
            ) or profile.get("allow_partial_payment") is False

        # Phase 4, 2026-10-10: the settings page. Only the counter's own settings
        # here: a POS Profile save would leave its cached document behind the rollback.
        saved = pos.save_settings(
            profile_name, None, json.dumps({"max_discount": 5, "returns": False, "held_on_close": "block", "reason_threshold": 2})
        )
        assert saved["counter"]["max_discount"] == 5 and saved["counter"]["returns"] is False, saved["counter"]
        assert pos._profile_payload(frappe.get_doc("POS Profile", profile_name))["counter"]["held_on_close"] == "block"
        ceiling_refused = None
        if profile.get("allow_discount_change"):
            ceiling_refused = refused(
                lambda: pos.preview_cart({**payload, "items": [{**payload["items"][0], "discount_percentage": 8}]}),
                "The discount is above this counter's maximum: {0}%",
            )
            assert ceiling_refused, "A discount above the counter's maximum was accepted."
        returns_refused = refused(
            lambda: pos.preview_return(profile_name, sold["doctype"], sold["name"], one, first_mode),
            "This counter takes no returns. Return from the invoice form.",
        )
        assert returns_refused, "A return went through a counter that takes none."
        held_blocks = None
        if pos._can_hold(context["invoice_type"]):
            pos.hold_cart(payload)
            # No reason given: were the block to fail, the reason gate refuses
            # before ERPNext's own commit, and the message check fails this run.
            held_blocks = refused(lambda: pos.close_shift(profile_name, zero_count, ""), "Complete the held sales before closing the shift.")
            assert held_blocks, "A held sale did not block the close."
        assert pos._needs_reason([{"difference": 1.5}], 2) is False and pos._needs_reason([{"difference": 2.5}], 2) is True
        assert refused(lambda: pos.save_settings(profile_name, None, json.dumps({"tiles": "xl"})), "Invalid value for the counter setting: {0}")
        # Review 2026-10-10: only the in-store prefixes (62 would read every Saudi barcode as a label).
        assert refused(lambda: pos.save_settings(profile_name, None, json.dumps({"scale_prefix": "62"})), "Invalid value for the counter setting: {0}")
        assert pos.save_settings(profile_name, None, json.dumps({"scale_prefix": "22"}))["counter"]["scale_prefix"] == "22"
        # A page opened before someone else saved the profile is refused.
        assert refused(
            lambda: pos.save_settings(profile_name, json.dumps({"hide_images": True}), None, "2000-01-01 00:00:00"),
            "The POS Profile changed after these settings were opened. Open them again.",
        )
        # Saving the payment methods keeps each kept row's own fields (Allow In Returns).
        rows = frappe.get_doc("POS Profile", profile_name).payments
        frappe.db.set_value("POS Payment Method", rows[0].name, "allow_in_returns", 1, update_modified=False)
        frappe.clear_document_cache("POS Profile", profile_name)
        reordered = [{"mode_of_payment": row.mode_of_payment, "default": 1 if index == len(rows) - 1 else 0} for index, row in enumerate(rows)]
        pos.save_settings(profile_name, json.dumps({"payments": reordered}), None, pos.settings_context(profile_name)["modified"])
        kept_row = next(row for row in frappe.get_doc("POS Profile", profile_name).payments if row.mode_of_payment == rows[0].mode_of_payment)
        assert kept_row.allow_in_returns == 1, "Saving the payment methods reset Allow In Returns."
        # The settings follow a renamed profile.
        frappe.defaults.set_default("bnd-acceptance-old", '{"tiles": "l"}', parent=pos.COUNTER_SETTINGS_PARENT)
        pos.rename_counter_settings(None, "after_rename", "bnd-acceptance-old", "bnd-acceptance-new")
        moved = frappe.defaults.get_defaults_for(pos.COUNTER_SETTINGS_PARENT)
        assert moved.get("bnd-acceptance-new") == '{"tiles": "l"}' and not moved.get("bnd-acceptance-old"), moved
        # Phase 6: a payment method marked Tabby or Tamara needs the order number
        # from the provider's app; the invoice's remarks keep it.
        card = next((row["mode_of_payment"] for row in methods if row.get("type") != "Cash"), None)
        bnpl_checked = None
        if card:
            pos.save_settings(profile_name, None, json.dumps({"bnpl": {card: {"provider": "tabby", "installments": 4}}}))
            assert refused(lambda: pos.save_settings(profile_name, None, json.dumps({"bnpl": {card: {"provider": "klarna", "installments": 4}}})), "Invalid value for the counter setting: {0}")
            tabby_row = [{"mode_of_payment": card, "amount": due_now}]
            assert refused(lambda: pos.checkout(payload, tabby_row), "Order number required from: {0}")
            tabby_sale = pos.checkout(payload, [{**tabby_row[0], "reference_no": "TBY-ACCEPTANCE-1"}])
            remarks = frappe.db.get_value(tabby_sale["doctype"], tabby_sale["name"], "remarks") or ""
            assert "TBY-ACCEPTANCE-1" in remarks and "Tabby" in remarks, remarks
            bnpl_checked = True

        # 2026-10-10: a counter sells its own company's items, from its own warehouse.
        # Inside this rollback, catalogue items are made another company's or everyone's
        # (their own stock records and item defaults removed first, so each case holds on
        # any data), with no second company: rows alone.
        other_company = "Bunood Acceptance Other Company"
        frappe.db.sql(
            """insert into `tabWarehouse` (name, warehouse_name, company, is_group, disabled, lft, rgt,
            creation, modified, owner, modified_by, docstatus)
            values ('Bunood Acceptance Other Store', 'Bunood Acceptance Other Store', %s, 0, 0, 0, 0,
            now(), now(), 'Administrator', 'Administrator', 0)""",
            (other_company,),
        )

        def strip(code):
            frappe.db.sql("delete from `tabBin` where item_code = %s", (code,))
            frappe.db.sql("delete from `tabItem Default` where parent = %s and parenttype = 'Item'", (code,))

        def item_default(code, company, warehouse=None):
            frappe.db.sql(
                """insert into `tabItem Default` (name, parent, parenttype, parentfield, idx, company, default_warehouse,
                creation, modified, owner, modified_by, docstatus)
                values (%s, %s, 'Item', 'item_defaults', 99, %s, %s, now(), now(), 'Administrator', 'Administrator', 0)""",
                (frappe.generate_hash(length=10), code, company, warehouse),
            )

        not_sold = frappe._("Not sold at this point of sale: {0}").split("{0}")[0].strip()
        spare = [row["item_code"] for row in priced if row["item_code"] != item["item_code"]]
        loose = spare[0] if spare else None
        company_checked = None
        review_checked = None
        if loose:
            strip(loose)
            item_default(loose, other_company)
            listed = [row["item_code"] for row in pos.get_items(profile_name, page_length=60)["items"]]
            assert loose not in listed, "Another company's item is on this counter."
            scanned = pos.get_items(profile_name, search_term=loose)
            assert not scanned["items"] and scanned["elsewhere"], scanned
            assert refused(
                lambda: pos.preview_cart({**payload, "items": [{"item_code": loose, "qty": 1}]}),
                "Not sold at this point of sale: {0}",
            ), "Another company's item was priced at this counter."
            # A neighbour found by its name does not hide that the code itself is sold elsewhere.
            if len(spare) > 1:
                frappe.db.set_value("Item", spare[1], "item_name", f"{loose} neighbour", update_modified=False)
                near = pos.get_items(profile_name, search_term=loose)
                assert spare[1] in [row["item_code"] for row in near["items"]] and near["elsewhere"], near
            # Sold offline before the counter's items changed: kept for review, never lost.
            offline_id = f"acceptance-{frappe.generate_hash(length=12)}"
            used_sale_ids.append(offline_id)
            kept_sale = pos.sync_offline_sale(
                offline_id, "2026-10-10 09:05", json.dumps({**payload, "items": [{"item_code": loose, "qty": 1}]}),
                json.dumps(cash_row), str(due_now),
            )
            kept_remarks = frappe.db.get_value(kept_sale["doctype"], kept_sale["name"], "remarks") or ""
            assert kept_sale["status"] == "review" and not_sold in kept_remarks, (kept_sale, kept_remarks)
            # That held draft completes at the counter, its own items still sellable; once
            # submitted, nothing is exempt any more.
            if pos._can_hold(context["invoice_type"]):
                frappe.db.set_value("Item", loose, "is_stock_item", 0, update_modified=False)
                frappe.clear_cache(doctype="Item")
                review_cart = {**payload, "items": [{"item_code": loose, "qty": 1}], "draft": kept_sale["name"]}
                review_total = pos.preview_cart(review_cart)
                review_due = flt(review_total.get("rounded_total") or review_total.get("grand_total"))
                completed = pos.checkout(review_cart, [{"mode_of_payment": cash_row[0]["mode_of_payment"], "amount": review_due}], kept_sale["name"])
                assert completed["docstatus"] == 1 and completed["name"] == kept_sale["name"], completed
                assert refused(lambda: pos.preview_cart(review_cart), "Not sold at this point of sale: {0}")
                review_checked = True
            pos.save_settings(profile_name, None, json.dumps({"item_scope": "all"}))
            assert loose in [row["item_code"] for row in pos.get_items(profile_name, page_length=60)["items"]]
            pos.save_settings(profile_name, None, json.dumps({"item_scope": "company"}))
            company_checked = True
        # ERPNext's own item default on a new item (the site's default warehouse and nothing
        # else) hands the item to no one, whoever asks; a deliberate one, or stock in a
        # company's warehouse, does.
        site_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
        automatic_checked = None
        if site_warehouse and len(spare) > 2:
            shared = spare[2]
            strip(shared)
            item_default(shared, frappe.db.get_value("Warehouse", site_warehouse, "company"), site_warehouse)
            assert pos._company_items(other_company, [shared]) == {shared}, "ERPNext's own item default made the item its company's."
            frappe.db.sql("update `tabItem Default` set default_price_list = %s where parent = %s", (profile.get("selling_price_list"), shared))
            assert not pos._company_items(other_company, [shared]), "A deliberate item default did not make the item its company's."
            frappe.db.sql("update `tabItem Default` set default_price_list = null where parent = %s", (shared,))
            frappe.db.sql(
                """insert into `tabBin` (name, item_code, warehouse, actual_qty, creation, modified, owner, modified_by, docstatus)
                values (%s, %s, 'Bunood Acceptance Other Store', 1, now(), now(), 'Administrator', 'Administrator', 0)""",
                (frappe.generate_hash(length=10), shared),
            )
            assert pos._company_items(other_company, [shared]) == {shared}
            if profile["company"] != other_company:
                assert not pos._company_items(profile["company"], [shared]), "Stock in another company's warehouse did not make the item that company's."
            automatic_checked = True
        assert refused(lambda: pos.save_settings(profile_name, None, json.dumps({"item_scope": "branch"})), "Invalid value for the counter setting: {0}")
        # This warehouse's items, the simple invoice's rule: a stocked item with no stock record
        # here and another default warehouse (so made inside this rollback) leaves the counter.
        stocked = next(
            (
                row["item_code"]
                for row in catalogue
                if row["item_code"] not in [item["item_code"], *spare[:3]]
                and frappe.db.get_value("Item", row["item_code"], "is_stock_item")
            ),
            None,
        )
        warehouse_checked = None
        if stocked:
            frappe.db.sql("delete from `tabBin` where item_code = %s and warehouse = %s", (stocked, profile["warehouse"]))
            frappe.db.sql(
                "update `tabItem Default` set default_warehouse = null where parent = %s and default_warehouse = %s",
                (stocked, profile["warehouse"]),
            )
            pos.save_settings(profile_name, None, json.dumps({"item_scope": "warehouse"}))
            here = pos.get_items(profile_name, page_length=60)["items"]
            assert stocked not in [row["item_code"] for row in here], "An item this warehouse never held is on its counter."
            for row in here:
                code = row["item_code"]
                held = frappe.db.exists("Bin", {"item_code": code, "warehouse": profile["warehouse"]}) or frappe.db.exists(
                    "Item Default", {"parent": code, "parenttype": "Item", "default_warehouse": profile["warehouse"]}
                )
                assert held or not frappe.db.get_value("Item", code, "is_stock_item"), code
            assert refused(
                lambda: pos.preview_cart({**payload, "items": [{"item_code": stocked, "qty": 1}]}),
                "Not sold at this point of sale: {0}",
            ), "An item this warehouse never held was priced at its counter."
            pos.save_settings(profile_name, None, json.dumps({"item_scope": "company"}))
            assert stocked in [row["item_code"] for row in pos.get_items(profile_name, page_length=60)["items"]]
            warehouse_checked = True
        # Paging past the filter, with hidden items among the rows: page by page, the counter
        # walks the same catalogue one large page shows, without a gap, a repeat or a last
        # empty page announced as more.
        whole = [row["item_code"] for row in pos.get_items(profile_name, page_length=60)["items"]]
        walked, start = [], 0
        for _step in range(60):
            page = pos.get_items(profile_name, start=start, page_length=3)
            walked += [row["item_code"] for row in page["items"]]
            start = page["next_start"]
            assert page["items"] or not _step, "More items were announced and none came."
            if not page["more"]:
                break
        assert walked[: len(whole)] == whole and len(walked) == len(set(walked)), (walked, whole)

        # The warehouse: one of the company's, and never under an open shift.
        store = pos.settings_context(profile_name)
        assert store["native"]["warehouse"] == profile["warehouse"], store["native"]["warehouse"]
        assert context["opening_entry"]["name"] in store["store"]["open_shifts"], store["store"]["open_shifts"]
        other_warehouse = next((row["name"] for row in store["store"]["warehouses"] if row["name"] != profile["warehouse"]), None)
        warehouse_waits = None
        if other_warehouse:
            warehouse_waits = refused(
                lambda: pos.save_settings(profile_name, json.dumps({"warehouse": other_warehouse}), None, store["modified"]),
                "Close the open shifts on this point of sale before changing its warehouse: {0}",
            )
            assert warehouse_waits, "The warehouse changed under an open shift."
        assert refused(
            lambda: pos.save_settings(profile_name, json.dumps({"warehouse": "Bunood Acceptance No Warehouse"}), None, store["modified"]),
            "Choose one of this company's warehouses: {0}",
        )
        # A group warehouse, and another company's (a row made inside this rollback), are refused
        # for what they are: under the open shift, a later guard would refuse them for another reason.
        frappe.db.sql(
            """insert into `tabWarehouse` (name, warehouse_name, company, is_group, disabled, lft, rgt,
            creation, modified, owner, modified_by, docstatus)
            values ('Bunood Acceptance Other Warehouse', 'Bunood Acceptance Other Warehouse',
            'Bunood Acceptance Other Company', 0, 0, 0, 0, now(), now(), 'Administrator', 'Administrator', 0)"""
        )
        for foreign in filter(None, [
            "Bunood Acceptance Other Warehouse",
            frappe.db.get_value("Warehouse", {"company": profile["company"], "is_group": 1}, "name"),
        ]):
            assert refused(
                lambda: pos.save_settings(profile_name, json.dumps({"warehouse": foreign}), None, store["modified"]),
                "Choose one of this company's warehouses: {0}",
            ), f"A warehouse that is not one of the company's was accepted: {foreign}"
        # The item groups: saved on the profile, and the catalogue follows them.
        own_group = frappe.db.get_value("Item", item["item_code"], "item_group")
        before_groups = store["native"]["item_groups"]
        assert refused(
            lambda: pos.save_settings(profile_name, json.dumps({"item_groups": ["Bunood Acceptance No Group"]}), None, store["modified"]),
            "Item group not found: {0}",
        )
        narrowed = pos.save_settings(profile_name, json.dumps({"item_groups": [own_group]}), None, store["modified"])
        assert narrowed["native"]["item_groups"] == [own_group], narrowed["native"]["item_groups"]
        from erpnext.accounts.doctype.pos_profile.pos_profile import get_child_nodes

        allowed = {row.name for row in get_child_nodes("Item Group", own_group)} | {own_group}
        shown = pos.get_items(profile_name, page_length=60)["items"]
        assert shown and all(frappe.db.get_value("Item", row["item_code"], "item_group") in allowed for row in shown), shown
        put_back = pos.save_settings(profile_name, json.dumps({"item_groups": before_groups}), None, narrowed["modified"])
        assert put_back["native"]["item_groups"] == before_groups, put_back["native"]["item_groups"]

        # 2026-10-10 (owner): the restaurant cashier is its own screen. A profile another front
        # end reserves (hook bunood_pos_reserved_profiles) is neither listed nor chosen by
        # default; asked for by name, or holding the user's shift, it comes back marked so the
        # counter points to that screen. Only site paths are kept as routes.
        from unittest.mock import patch as mock_patch

        assert pos._clean_reserved(
            {profile_name: {"title": "X", "route": "javascript:alert(1)"}, 7: {}, "Y": "not a dict"}
        ) == {profile_name: {"title": "X", "route": ""}}
        assert pos._clean_reserved({"P": {"title": "T", "route": "/dining_pos"}})["P"]["route"] == "/dining_pos"
        assert pos._clean_reserved({"P": {"route": "//elsewhere.example"}})["P"]["route"] == ""
        reserved = {profile_name: {"title": "Bunood Acceptance Cashier", "route": "/dining_pos"}}
        with mock_patch.object(pos, "_reserved_profiles", return_value=reserved):
            assert profile_name not in [row["name"] for row in pos._available_profiles()], "A reserved profile is listed."
            asked = pos.get_context(profile_name)
            assert asked["profile"]["name"] == profile_name, asked["profile"]["name"]
            assert asked["profile"]["reserved_for"] == reserved[profile_name], asked["profile"].get("reserved_for")
        assert pos.get_context(profile_name)["profile"]["reserved_for"] is None
        reserved_checked = True

        # Back to the defaults for the checks that follow (a 10% discount among them).
        restored = pos.save_settings(profile_name, None, json.dumps(pos.COUNTER_DEFAULTS))
        assert restored["counter"] == pos.COUNTER_DEFAULTS, restored["counter"]

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
            "receipt_link_opens": True,
            "discount_reaches_rate": discount_checked,
            "other_group_sells": other_group_checked,
            "exact_discount_kept": exact_discount,
            "max_discount_enforced": cap_enforced,
            "box_moves_twelve": box_moves_twelve,
            "blind_count": True,
            "difference_needs_reason": reason_required,
            "partial_return_credit_note": credit["name"],
            "replayed_return_is_the_same_note": True,
            "refund_reaches_closing": True,
            "over_return_refused": over_refused,
            "walk_in_credit_refused": walk_in_credit_refused,
            "offline_sale_posted_once": True,
            "offline_short_sale_held_for_review": True,
            "tabby_needs_its_order_number": bnpl_checked,
            "reserved_profile_points_elsewhere": reserved_checked,
            "company_items_only": company_checked,
            "automatic_default_ignored": automatic_checked,
            "review_draft_completed": review_checked,
            "warehouse_items_only": warehouse_checked,
            "warehouse_waits_for_open_shifts": warehouse_waits,
            "item_groups_saved": True,
            "settings_saved": True,
            "discount_ceiling_refused": ceiling_refused,
            "returns_switched_off": returns_refused,
            "held_sales_block_the_close": held_blocks,
            "stale_shift_detected": stale_detected,
            "rolled_back": True,
        }
        print(json.dumps(result, ensure_ascii=False, default=str))
    finally:
        frappe.db.rollback(save_point=savepoint)
        # preview_close remembers the last checked count outside the database.
        opening = (context or {}).get("opening_entry") or {}
        if opening.get("name"):
            frappe.cache.delete_value(f"bunood_pos_checked_count:{opening['name']}")
        # The counter settings are cached beyond the transaction: drop what it saw.
        from frappe.cache_manager import clear_defaults_cache

        clear_defaults_cache(pos.COUNTER_SETTINGS_PARENT)
        # The sale ids this run used: their remembered invoices were rolled back.
        for sale_id in used_sale_ids:
            frappe.cache.delete_value(pos._sale_key(sale_id))
        if context.get("profile"):
            frappe.clear_document_cache("POS Profile", context["profile"]["name"])
        # Items read through the document cache during the run carry rolled-back values.
        frappe.clear_cache(doctype="Item")


run()
