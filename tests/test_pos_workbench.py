import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class POSWorkbenchContractTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "bunood_theme" / "pos.py").read_text(encoding="utf-8")
        self.tree = ast.parse(self.source)

    def decorators_for(self, function_name):
        function = next(
            node
            for node in self.tree.body
            if isinstance(node, ast.FunctionDef) and node.name == function_name
        )
        return function.decorator_list

    def test_every_public_mutation_is_declared_post_only(self):
        for name in (
            "open_shift", "preview_cart", "hold_cart", "checkout", "create_return",
            "preview_close", "close_shift", "preview_return", "submit_return", "receipt_link",
            "sync_offline_sale",
        ):
            decorators = self.decorators_for(name)
            self.assertTrue(
                any(
                    isinstance(item, ast.Call)
                    and isinstance(item.func, ast.Attribute)
                    and item.func.attr == "whitelist"
                    and any(
                        keyword.arg == "methods"
                        and ast.literal_eval(keyword.value) == ["POST"]
                        for keyword in item.keywords
                    )
                    for item in decorators
                ),
                name,
            )

    def body(self, name):
        return self.source.split(f"\ndef {name}(", 1)[1].split("\ndef ", 1)[0]

    def test_phase_two_reads_are_get_only(self):
        for name in ("close_shift_context", "return_context"):
            decorators = self.decorators_for(name)
            self.assertTrue(
                any(
                    isinstance(item, ast.Call)
                    and any(
                        keyword.arg == "methods" and ast.literal_eval(keyword.value) == ["GET"]
                        for keyword in item.keywords
                    )
                    for item in decorators
                ),
                name,
            )

    def test_the_count_context_carries_no_expected_figure(self):
        # The cashier counts before seeing what was expected (owner-approved design).
        context = self.body("close_shift_context")
        for figure in ("expected_amount", "closing_amount", "opening_amount", "difference", "grand_total"):
            self.assertNotIn(figure, context)
        # Names only, from the same draft the closing is built from (review 2026-10-09:
        # the screen and the server listed different methods, so a shift could not close).
        self.assertIn("names = [row.mode_of_payment for row in _closing_draft(opening, profile).payment_reconciliation]", context)
        self.assertIn('"methods": [{"mode_of_payment": mode, "type": _mode_type(mode)} for mode in modes]', context)

    def test_the_closing_is_erpnexts_entry_with_the_float_and_a_reason(self):
        draft = self.body("_closing_draft")
        self.assertIn("closing = make_closing_entry_from_opening(opening)", draft)
        # ERPNext's own form adds the opening float client-side; the server must too.
        self.assertIn("row.expected_amount = flt(flt(row.expected_amount) + row.opening_amount", draft)
        close = self.body("close_shift")
        self.assertIn('_require("POS Closing Entry", "submit")', close)
        self.assertLess(close.index("Give the reason for the difference"), close.index("closing.insert()"))
        # The reason is written before submit: ERPNext commits inside on_submit.
        self.assertLess(close.index('closing.add_comment("Comment"'), close.index("closing.submit()"))
        reconcile = self.body("_reconcile")
        # A card terminal may settle below zero; a drawer may not.
        self.assertIn('if mode_type == "Cash" and amount < 0:', reconcile)
        self.assertNotIn("cannot be negative", self.body("_counted"))
        # A method counted at zero that the shift does not carry is no reason to refuse.
        self.assertIn("mode not in known and abs(flt(amount)) >= 0.005", reconcile)
        # Every distinct count checked against the expected figures is on the record.
        self.assertIn('opening.add_comment(', self.body("preview_close"))

    def test_a_submitted_closing_ends_the_shift_even_while_erpnext_queues_it(self):
        unclosed = self.body("_unclosed_entries")
        self.assertIn('"POS Closing Entry"', unclosed)
        self.assertIn('"pos_opening_entry": ["in", [row.name for row in rows]], "docstatus": 1', unclosed)
        self.assertIn("return [row for row in rows if row.name not in closed]", unclosed)

    def test_a_return_never_exceeds_what_is_left_or_what_was_paid(self):
        partial = self.body("_partial_return")
        self.assertIn("doc = make_sales_return(source.name)", partial)
        self.assertIn("if qty > available + 1e-9:", partial)
        self.assertIn('"docstatus": 1', self.body("_returned_qty"))
        refund = self.body("_apply_refund")
        self.assertIn("refundable = _refundable(source, lock)", refund)
        self.assertIn("if abs(total) > refundable + 0.005:", refund)
        self.assertIn("if not doc.customer or doc.customer == profile.customer:", refund)
        # A money refund is a POS document, so the shift's closing counts it.
        self.assertIn("doc.is_created_using_pos = 1", refund)

    def test_an_invoice_discount_or_a_fixed_charge_comes_back_only_whole(self):
        partial = self.body("_partial_return")
        self.assertIn('if flt(source.get("discount_amount")):', partial)
        self.assertIn('tax.charge_type == "Actual"', partial)
        self.assertLess(partial.index("if not whole:"), partial.index("make_sales_return(source.name)"))

    def test_a_return_needs_an_open_shift_a_reason_and_submit_permission(self):
        submit = self.body("submit_return")
        self.assertIn("_open_entry(profile.name)", submit)
        self.assertIn('frappe.throw(_("Give the reason for the return."))', submit)
        self.assertIn('doc.check_permission("submit")', submit)

    def test_one_credit_note_per_request_and_one_return_at_a_time(self):
        submit = self.body("submit_return")
        lock = submit.index('frappe.db.get_value(source.doctype, source.name, "name", for_update=True)')
        self.assertLess(lock, submit.index("_partial_return(source, profile, lines, refund, reason, lock=True)"))
        self.assertIn('"already_issued": True', submit)
        self.assertLess(submit.index("frappe.cache.get_value(key)"), submit.index("doc.insert()"))
        # Locking reads see a return committed while this request waited.
        self.assertIn("for_update=lock", self.body("_returned_qty"))
        self.assertIn("for_update=lock", self.body("_refundable"))

    def test_returns_stay_in_the_drawers_company_and_off_serials_and_pos_invoice_credit(self):
        partial = self.body("_partial_return")
        self.assertIn("if source.company != profile.company:", partial)
        self.assertIn('"has_serial_no"', partial)
        self.assertIn('if doc.doctype != "Sales Invoice":', self.body("_apply_refund"))
        self.assertIn('"credit_allowed": source.doctype == "Sales Invoice"', self.body("return_context"))

    def test_a_receipt_link_only_for_the_cashiers_own_completed_receipt(self):
        link = self.body("receipt_link")
        # A boolean check: a 403 makes Frappe route the cashier out of the counter.
        self.assertIn('if not frappe.has_permission(doc.doctype, "print", doc):', link)
        self.assertNotIn(".check_permission(", link)
        self.assertIn("if doc.docstatus != 1 or not cint(doc.is_pos) or doc.owner != frappe.session.user:", link)
        # The code faces the queue: walk-in sales without a VAT number only (review 2026-10-09).
        self.assertIn('doc.customer == frappe.db.get_value("POS Profile", doc.pos_profile, "customer")', link)
        self.assertIn('if not walk_in or doc.get("tax_id") or not _counter_settings(doc.pos_profile)["receipt_qr"]:', link)
        self.assertIn("@rate_limit(limit=600, seconds=60 * 60)\ndef receipt_link", self.source)
        # ERPNext's own share key, reused while valid instead of a new row per call.
        self.assertIn('"key": _share_key(doc)', link)
        self.assertIn('"expires_on": [">", nowdate()]', self.body("_share_key"))
        self.assertIn('get_url(f"/printview?{urlencode(query)}")', link)
        self.assertIn("except ImportError:", self.body("_qr_svg"))
        self.assertIn('"company_logo": frappe.get_cached_value("Company", profile.company, "company_logo")', self.source)

    def test_counter_defaults_are_the_counter_before_the_settings_page(self):
        # A profile that never opened the page keeps exactly the old behaviour.
        assignment = next(
            node for node in self.tree.body
            if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == "COUNTER_DEFAULTS"
        )
        self.assertEqual(ast.literal_eval(assignment.value), {
            "fbar": False, "tiles": "m", "customer_screen": True, "receipt_qr": True, "max_discount": 0,
            "returns": True, "new_item": True, "cash_exact": True, "cash_notes": [10, 50, 100, 200, 500],
            "merge_scans": True, "scale_prefix": "21", "unknown_barcode": "offer",
            "reason_threshold": 0, "held_on_close": "carry",
        })

    def test_settings_are_saved_only_with_write_access_and_kept_off_the_boot(self):
        save = self.body("save_settings")
        self.assertLess(save.index('profile.check_permission("write")'), save.index("profile.save()"))
        self.assertIn("_clean_counter(_json(counter, {}), strict=True)", save)
        # Their own DefaultValue parent: a __default row would ride in every user's boot.
        self.assertIn('COUNTER_SETTINGS_PARENT = "bunood_pos_settings"', self.source)
        self.assertIn("frappe.defaults.set_default(profile.name, value, parent=COUNTER_SETTINGS_PARENT)", save)
        self.assertIn("frappe.defaults.get_defaults_for(COUNTER_SETTINGS_PARENT)", self.body("_counter_settings"))
        self.assertIn('profile.add_comment("Comment"', save)
        # Review 2026-10-10: a stale page is refused; kept payment rows are the same
        # documents (Allow In Returns survives); the cache drops again after commit.
        self.assertIn("if modified and str(profile.modified) != str(modified):", save)
        self.assertIn('row = existing.get(mode) or profile.append("payments", {"mode_of_payment": mode})', save)
        self.assertIn("frappe.db.after_commit.add(_drop_counter_cache)", save)
        self.assertIn('STORE_PREFIXES = frozenset({"02", *(f"2{digit}" for digit in range(10))})', self.source)
        hooks = (ROOT / "bunood_theme" / "hooks.py").read_text(encoding="utf-8")
        self.assertIn('"after_rename": "bunood_theme.pos.rename_counter_settings"', hooks)
        self.assertIn('"on_trash": "bunood_theme.pos.drop_counter_settings"', hooks)

    def test_the_settings_that_touch_money_are_enforced_on_the_server(self):
        apply_cart = self.body("_apply_cart")
        self.assertIn('ceiling = flt(_counter_settings(profile.name)["max_discount"])', apply_cart)
        self.assertIn("_returns_allowed(profile)", self.body("preview_return"))
        self.assertIn("_returns_allowed(profile)", self.body("submit_return"))
        close = self.body("close_shift")
        # Only today's shift: an out-of-date one cannot complete a held sale (review 2026-10-10).
        self.assertIn("current = getdate(opening.period_start_date) == getdate(nowdate())", close)
        self.assertIn('if settings["held_on_close"] == "block" and current and _can_hold(_invoice_type()) and held_carts(profile.name):', close)
        self.assertIn('if _needs_reason(rows, settings["reason_threshold"]) and not reason:', close)
        self.assertLess(close.index("held_carts(profile.name)"), close.index("closing.insert()"))

    def test_an_offline_sale_posts_once_and_falls_back_to_review(self):
        sync = self.body("sync_offline_sale")
        # The id is checked before it reaches the LIKE pattern; one lock per sale; a
        # repeat finds the first (the remembered name read with a row lock, then remarks).
        self.assertIn("offline_id = _offline_id(offline_id)", sync)
        self.assertIn('not text.replace("-", "").isalnum() or not text.isascii()', self.body("_offline_id"))
        self.assertIn("with _sale_lock(offline_id):", sync)
        self.assertLess(sync.index("_posted_sale(invoice_type, offline_id, by_remarks=True)"), sync.index("_new_or_held(data)"))
        self.assertIn('status = frappe.db.get_value(doctype, name, "docstatus", for_update=True)', self.body("_posted_sale"))
        # Decided before anything is written (review 2026-10-10: a savepoint retry let a
        # rolled-back attempt's after-commit work run); a total that moved goes to review.
        self.assertNotIn("savepoint", sync)
        self.assertIn("_apply_payments(doc, profile, tendered)", sync)
        self.assertIn("if abs(total - collected) >= 0.005:", sync)
        self.assertLess(sync.index("if reason:"), sync.index("doc.insert()"))

    def test_a_checkout_sent_twice_under_one_id_is_one_invoice(self):
        checkout = self.body("checkout")
        self.assertIn("with _sale_lock(sale_id):", checkout)
        self.assertIn("if name and status == 1:", checkout)
        self.assertIn('_remember_sale(sale_id, result["name"])', checkout)

    def test_a_walk_in_sale_never_leaves_a_remainder_on_account(self):
        payments = self.body("_apply_payments")
        self.assertIn("if paid < total and (not doc.customer or doc.customer == profile.customer):", payments)

    def test_native_document_engine_remains_authoritative(self):
        self.assertIn('doc.run_method("set_missing_values")', self.source)
        self.assertIn('doc.run_method("calculate_taxes_and_totals")', self.source)
        self.assertIn("doc.submit()", self.source)
        self.assertIn("make_sales_return", self.source)
        self.assertNotIn("frappe.db.sql", self.source)
        commercial_paths = self.source.split("def ensure_pos_reference_field", 1)[0]
        self.assertNotIn("ignore_permissions=True", commercial_paths)

    def test_inputs_are_bounded_before_native_document_creation(self):
        self.assertIn("MAX_CART_LINES = 200", self.source)
        self.assertIn("MAX_PAGE_LENGTH = 60", self.source)
        self.assertIn("[:140]", self.source)
        self.assertIn("if len(items) > MAX_CART_LINES", self.source)
        self.assertIn("if not number.is_finite()", self.source)

    def test_payment_reference_field_is_non_financial_and_installed_idempotently(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        # Integration v0.48.0: held -- present once, in ensure_pos_retail only.
        self.assertEqual(setup.count("ensure_pos_reference_field()"), 1)
        self.assertIn("ensure_pos_reference_field()", setup.split("def ensure_pos_retail")[1])
        self.assertIn('fieldname = "custom_bunood_reference_no"', self.source)
        self.assertIn('"fieldtype": "Data"', self.source)
        self.assertIn('frappe.db.get_value(\n        "Custom Field"', self.source)

    def test_only_explicitly_held_native_drafts_are_resumable(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        # Integration v0.48.0: held -- present once, in ensure_pos_retail only.
        self.assertEqual(setup.count("ensure_pos_hold_field()"), 1)
        self.assertIn("ensure_pos_hold_field()", setup.split("def ensure_pos_retail")[1])
        self.assertIn('HELD_FIELD = "custom_bunood_is_held"', self.source)
        self.assertIn('doc.set(HELD_FIELD, 1)', self.source)
        self.assertIn('doc.set(HELD_FIELD, 0)', self.source)
        self.assertIn('HELD_FIELD: 1', self.source)
        self.assertIn('not cint(doc.get(HELD_FIELD))', self.source)

    def test_outdated_opening_entries_are_never_treated_as_sellable_shifts(self):
        self.assertIn("def _stale_entries()", self.source)
        self.assertIn("getdate(row.period_start_date) == today", self.source)
        self.assertIn("getdate(row.period_start_date) != today", self.source)
        self.assertIn('"stale_opening_entry"', self.source)

    def test_a_line_discount_reaches_the_rate_erpnext_charges(self):
        # ERPNext derives a rate from discount_percentage only when the rate is
        # empty, and every counter line carries one: before this, a 10% discount
        # previewed and posted at full price.
        apply_cart = self.source.split("def _apply_cart", 1)[1].split("\ndef ", 1)[0]
        self.assertIn('child = doc.append("items", row)', apply_cart)
        # ERPNext's own steps (calculate_item_rate), or it zeroes the percentage on a
        # one-cent difference and Item.max_discount checks nothing; the live check
        # (tools/pos-backend-acceptance.py) holds the 12.25-at-10% tie and the cap.
        self.assertIn('child.discount_percentage = flt(discount, child.precision("discount_percentage"))', apply_cart)
        self.assertIn("flt(child.price_list_rate) * child.discount_percentage / 100.0", apply_cart)
        self.assertIn('child.rate = flt(flt(child.price_list_rate) - child.discount_amount, child.precision("rate"))', apply_cart)
        self.assertIn("max_discount", apply_cart)
        self.assertIn("if discount < 0 or discount > 100:", apply_cart)
        self.assertIn("if profile.allow_discount_change and raw.get(\"discount_percentage\")", apply_cart)
        self.assertNotIn('row["discount_percentage"]', apply_cart)

    def test_a_line_sold_in_another_unit_carries_its_conversion_factor(self):
        # ERPNext's catalogue row has no conversion_factor: a box of twelve moved
        # one stock unit. The live check sells a box and counts twelve.
        apply_cart = self.source.split("def _apply_cart", 1)[1].split("\ndef ", 1)[0]
        self.assertNotIn('authoritative.get("conversion_factor")', apply_cart)
        self.assertIn("get_conversion_factor(item_code, uom)", apply_cart)

    def test_every_profile_group_is_sellable_not_only_the_first(self):
        # get_parent_item_group() answers the profile's FIRST group; starting a
        # lookup there hid, and refused at checkout, items filed under the others.
        self.assertNotIn("get_parent_item_group", self.source)
        self.assertIn('return get_root_of("Item Group")', self.source)
        self.assertIn("group = item_group or _catalog_root()", self.source)
        native = self.source.split("def _native_catalog_item", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("_catalog_root(),", native)

    def test_vat_rows_reach_the_counter_for_display_only(self):
        taxes = self.source.split("def _profile_taxes", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("frappe.get_all(", taxes)
        self.assertIn('"Sales Taxes and Charges"', taxes)
        self.assertIn('"included": bool(row.included_in_print_rate)', taxes)
        self.assertIn('"taxes": _profile_taxes(profile)', self.source)
        self.assertNotIn("ignore_permissions", taxes)

    def test_holding_is_offered_only_where_the_marker_field_exists(self):
        self.assertIn('"can_hold": _can_hold(invoice_type)', self.source)
        self.assertIn("return bool(frappe.get_meta(invoice_type).has_field(HELD_FIELD))", self.source)
        held = self.source.split("def held_carts", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("if not _can_hold(invoice_type):\n        return []", held)
        hold = self.source.split("def hold_cart", 1)[1].split("\ndef ", 1)[0]
        self.assertIn("if not _can_hold(_invoice_type()):", hold)

    def test_customer_search_says_who_takes_a_tax_invoice(self):
        search = self.source.split("def search_customers", 1)[1].split("\ndef ", 1)[0]
        self.assertIn('"tax_id"', search)
        self.assertIn('"customer_type"', search)

    def test_context_selects_profile_from_mapping_payload(self):
        self.assertIn('row["name"] for row in profiles if row["is_default"]', self.source)
        self.assertIn('profiles[0]["name"]', self.source)


if __name__ == "__main__":
    unittest.main()
