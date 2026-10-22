// Bunood's current native invoice; controls and ERPNext own all mutations.
// Advanced mode keeps the same frm.doc. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	const printPreviews = new Map();
	const CREDIT_SALE = "On Credit";
	const MIXED_PAYMENT = "Mixed Payment";
	const NETWORK_PAYMENT = "Network";
	const CASH_PAYMENT = "Cash";
	const TRANSFER_PAYMENT = "Bank Transfer";
	let errorId = 0;
	let controlId = 0;
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", priceList: "selling_price_list",
			paymentMethod: "bunood_settlement_method",
			// The owner's sample sheet (2026-10-14): the code (a scanner types into the
			// ready row's), the item, its unit, the quantity, the price, its discount,
			// then the line before VAT, its VAT and its total, each line adding up. The
			// warehouse comes from the branch chip.
			lineFields: ["qty", "price_list_rate", "discount_amount"],
			lineLabels: { price_list_rate: () => __("Price"), discount_amount: () => __("Discount") },
			taxColumns: true,
			codeColumn: true,
			// The price is typed here and the price after discount follows it, so the
			// three always agree (ERPNext's own price_list_rate trigger works the rate).
			priceFirst: true,
			context: ["tax_id", "company", "posting_date", "due_date", "currency", "selling_price_list", "set_warehouse", "amended_from"],
			options: ["posting_date", "due_date", "update_stock", "set_warehouse", "currency", "selling_price_list", "payment_terms_template", "po_no"],
		},
		"Purchase Invoice": {
			party: "supplier", partyDoctype: "Supplier", title: "Purchase bill", priceList: "buying_price_list",
			// New goods arrive on a purchase bill (owner, 2026-10-09): the item is made
			// there with its cost, and the bill's own line brings the stock in.
			newItem: true,
			lineFields: ["qty", "rate", "price_list_rate", "discount_amount", "warehouse"],
			context: ["tax_id", "company", "posting_date", "due_date", "currency", "buying_price_list", "set_warehouse"],
			options: ["bill_no", "bill_date", "posting_date", "due_date", "update_stock", "set_warehouse", "currency", "buying_price_list", "payment_terms_template"],
		},
	};
	// Keep each source literal inside `__()`. Frappe's extractor cannot discover
	// a label hidden behind `__(LINE_LABELS[name])`, which let Unit price ship in
	// English on the Arabic workbench while the catalogue gate stayed green.
	const LINE_LABELS = {
		qty: () => __("Quantity"),
		price_list_rate: () => __("Price before discount"),
		rate: () => __("Unit price"),
		discount_percentage: () => __("Discount (%)"),
		discount_amount: () => __("Discount Amount"),
		warehouse: () => __("Warehouse"),
	};
	const MERGE_LINE_FIELDS = [
		"uom", "conversion_factor", "price_list_rate", "discount_percentage", "discount_amount", "rate",
		"warehouse", "cost_center", "income_account", "expense_account", "item_tax_template",
		"batch_no", "serial_no", "serial_and_batch_bundle", "delivery_date", "is_free_item",
		"margin_type", "margin_rate_or_amount", "project",
	];
	const comparableLineValue = value => value == null ? "" : String(value).trim();
	const mergeableItemLines = (left, right) => !!left?.item_code && left.item_code === right?.item_code &&
		MERGE_LINE_FIELDS.every(name => comparableLineValue(left[name]) === comparableLineValue(right[name]));
	const profileFor = frm => PROFILES[frm?.doctype];
	const actionState = (doc, dirty) => {
		const draft = Number(doc.docstatus) === 0;
		const savedDraft = draft && !doc.__islocal && !dirty;
		return { draft, savedDraft, showSave: draft && !savedDraft, showSubmit: draft };
	};
	const settlementCreatesPayment = value => !!value && value !== CREDIT_SALE;
	const mixedPaymentSelected = value => value === MIXED_PAYMENT;
	const receiptMethod = value => settlementCreatesPayment(value) && !mixedPaymentSelected(value) ? value : "";
	const settlementValue = doc => doc?.bunood_settlement_method || doc?.bunood_payment_method || CREDIT_SALE;
	const roundMoney = (value, precision = 2) => {
		const factor = 10 ** precision;
		return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
	};
	// ERPNext stores row discounts per unit and the invoice discount separately.
	// This is presentation only: the native total and tax engine remains authoritative.
	const discountSummary = doc => {
		const lineDiscount = (doc.items || []).reduce((sum, row) => {
			const perUnit = Number(row.discount_amount || 0);
			const qty = Number(row.qty || 0);
			return row.item_code && Number.isFinite(perUnit) && perUnit > 0 && Number.isFinite(qty)
				? sum + qty * perUnit : sum;
		}, 0);
		const headerAmount = Number(doc.discount_amount || 0);
		const invoiceDiscount = Number.isFinite(headerAmount) ? Math.max(0, headerAmount) : 0;
		const amount = roundMoney(Math.abs(lineDiscount) + invoiceDiscount);
		return amount > 0
			? { before: roundMoney(Number(doc.total || 0) + lineDiscount), amount }
			: null;
	};
	// The bill's foot as the owner's sample reads it (2026-10-14): the items' total, the
	// discount, the amount before VAT, the VAT and the total, and the figures always add
	// up. Where the prices include VAT the first two include it too (total − discount =
	// the total due); otherwise they do not (total − discount = before VAT). Every figure
	// comes from the engine's own totals: the VAT is the posted tax rows, the total the
	// grand total, before VAT what is left of it, and the discount whatever separates the
	// items' prices from that end (the lines' discounts and the invoice's own).
	function billFooter(doc, precision = 2) {
		const items = (doc?.items || []).filter(row => row.item_code);
		const taxes = (doc?.taxes || []).filter(tax => tax.category !== "Valuation");
		// Whether the prices include VAT is the VAT rows' choice; another charge (shipping, say)
		// comes on top either way and is no discount.
		const vatRows = taxes.filter(tax => isVatRow(tax));
		const inclusive = vatRows.length > 0 && vatRows.every(tax => Number(tax.included_in_print_rate));
		const charges = taxes.filter(tax => !isVatRow(tax)).reduce((sum, tax) =>
			sum + Number(tax.tax_amount_after_discount_amount || 0) * (tax.add_deduct_tax === "Deduct" ? -1 : 1), 0);
		const lineDiscount = items.reduce((sum, row) => {
			const perUnit = Number(row.discount_amount || 0), qty = Number(row.qty || 0);
			return Number.isFinite(perUnit) && perUnit > 0 && Number.isFinite(qty) ? sum + qty * perUnit : sum;
		}, 0);
		const total = roundMoney(doc?.grand_total, precision);
		const vat = roundMoney(doc?.total_taxes_and_charges, precision);
		const before = roundMoney(total - vat, precision);
		const gross = roundMoney(Number(doc?.total || 0) + lineDiscount, precision);
		const discount = roundMoney(gross - (inclusive ? total - charges : before), precision);
		const qty = items.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
		return { inclusive, gross, discount, before, vat, total, count: items.length, qty: roundMoney(qty, 3) };
	}
	// A bill can be saved with no due date (owner, 2026-10-14): one paid at the counter is
	// due the day it is made. ERPNext asks for the date on every invoice and works it out
	// only when the party's terms say otherwise; an empty or earlier date becomes the
	// invoice's own date (a purchase's supplier date), or its payment schedule's last. The
	// date is written to the document directly: ERPNext's due_date trigger would clear the
	// payment terms the schedule came from.
	function fillDueDate(frm) {
		const doc = frm?.doc;
		if (!doc || !["Sales Invoice", "Purchase Invoice"].includes(doc.doctype) || Number(doc.docstatus) !== 0 ||
			Number(doc.is_return) || Number(doc.is_pos)) return false;
		const start = doc.doctype === "Purchase Invoice" ? doc.bill_date || doc.posting_date : doc.posting_date;
		if (!start || (doc.due_date && String(doc.due_date) >= String(start))) return false;
		const scheduled = (doc.payment_schedule || []).map(row => String(row.due_date || "")).filter(Boolean).sort().at(-1);
		doc.due_date = scheduled && scheduled >= String(start) ? scheduled : start;
		frm.refresh_field?.("due_date");
		if (!doc.__islocal) frm.dirty?.();
		return true;
	}
	// The checkout says once what happened (owner, 2026-10-14): Frappe's own «تم الحفظ» and
	// «معتمد», and ERPNext's «submitted successfully» box, are held back while it runs;
	// every other message still shows.
	async function quietly(frm, run) {
		const nativeAlert = frappe.show_alert, nativeToast = frappe.toast;
		const muted = new Set(["Saved", "Submitted", __("Saved"), __("Submitted")]);
		const own = Object.prototype.hasOwnProperty.call(frm, "show_success_action");
		const ownAction = frm.show_success_action;
		const filtered = function (message, ...rest) {
			const text = String((typeof message === "string" ? message : message?.message) ?? "").trim();
			if (muted.has(text)) return typeof $ === "function" ? $("<div>") : null;
			return nativeAlert.call(this, message, ...rest);
		};
		if (typeof nativeAlert === "function") { frappe.show_alert = filtered; if (nativeToast) frappe.toast = filtered; }
		frm.show_success_action = () => {};
		try { return await run(); }
		finally {
			frappe.show_alert = nativeAlert;
			if (nativeToast) frappe.toast = nativeToast;
			if (own) frm.show_success_action = ownAction; else delete frm.show_success_action;
		}
	}
	// A sales invoice is never cancelled once submitted (owner, 2026-10-14: ZATCA's rule);
	// the server refuses it too (invoice_rules.refuse_cancel). A purchase bill may still be.
	const neverCancelled = doctype => ["Sales Invoice", "POS Invoice"].includes(doctype);
	function refuseCancel() {
		frappe.msgprint({
			title: __("This invoice cannot be cancelled"),
			message: __("A sales invoice is never cancelled once it is submitted: a ZATCA requirement. To give money or goods back, make a return (a credit note)."),
			indicator: "orange",
		});
	}
	const balancedPaymentPair = (value, total, precision = 2) => {
		const due = Math.max(0, roundMoney(total, precision));
		const requested = roundMoney(value, precision);
		const changed = Math.min(due, Math.max(0, Number.isFinite(requested) ? requested : 0));
		return [changed, roundMoney(due - changed, precision)];
	};
	const fieldStatus = (frm, name) => frm.fields_dict[name]?.get_status?.() || "None";
	// The line fields that say a draft was made from another document.
	const MAPPED_LINE_FIELDS = ["dn_detail", "delivery_note", "so_detail", "sales_order", "pr_detail", "purchase_receipt", "po_detail", "purchase_order"];
	function rowFieldStatus(frm, row, name) {
		const grid = frm.fields_dict.items.grid;
		if (!grid.is_editable()) return "Read";
		const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
		return df ? frappe.perm.get_field_display_status(df, row, frm.perm) : "None";
	}
	const canAdd = frm => {
		const grid = frm.fields_dict.items.grid;
		return grid.is_editable() && !grid.cannot_add_rows && !grid.df.cannot_add_rows;
	};
	const canRemove = frm => frm.fields_dict.items.grid.is_editable() && !frm.fields_dict.items.grid.df.cannot_delete_rows;
	function totalField(frm) { return Number(frm.doc.disable_rounded_total) || !frm.fields_dict.rounded_total ? "grand_total" : "rounded_total"; }
	async function ensureExactHalalas() {
		// Presentation must preserve the official invoice rounding policy.
		return false;
	}

	async function setLineValue(doc, name, value, nativeSet, baseStatus = () => "None") {
		if (name === "discount_amount" && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
			throw Error(__("Use a discount amount of zero or more."));
		}
		if ((name === "qty" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) ||
			(["rate", "price_list_rate"].includes(name) && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
			throw Error(__("Use a quantity above zero and a price of zero or more."));
		}
		// ERPNext line discounts require a positive price_list_rate.
		if (["discount_percentage", "discount_amount"].includes(name) && Number(value) !== 0 &&
			(!Number.isFinite(Number(doc.price_list_rate)) || Number(doc.price_list_rate) <= 0)) {
			throw Error(baseStatus() === "Write" ? __("Enter a price before discount first.") :
				name === "discount_amount" ? __("Discount amounts need an item price in the selected price list. Choose a priced item or price list, or set Discount Amount to 0 and use Net unit price.") :
					__("Percentage discounts need an item price in the selected price list. Choose a priced item or price list, or set Discount (%) to 0 and use Net unit price."));
		}
		return nativeSet(value);
	}
	function makePaymentEntry(frm, atInvoiceCheckout = false) {
		if (Number(frm.doc.docstatus) !== 1) throw Error(__("Submit the document before recording payment."));
		if (mixedPaymentSelected(settlementValue(frm.doc))) {
			throw Error(__("Use Split payment to record the Cash and Network amounts together."));
		}
		if (typeof frm.cscript?.make_payment_entry !== "function") {
			throw Error(__("Open the advanced form to create this payment."));
		}
		const preferred = receiptMethod(settlementValue(frm.doc));
		if (preferred && !frm.cscript.has_discount_in_schedule?.()) {
			return (async () => {
				const response = await frappe.call({
					method: frm.cscript.get_method_for_payment(),
					args: { dt: frm.doc.doctype, dn: frm.doc.name },
				});
				if (response.exc || !response.message) throw Error(__("Could not create the payment entry."));
				const [payment] = frappe.model.sync(response.message);
				if (atInvoiceCheckout && payment.doctype === "Payment Entry") {
					await frappe.model.set_value(payment.doctype, payment.name,
						"custom_bunood_payment_origin", "invoice_checkout");
				}
				await frappe.set_route("Form", payment.doctype, payment.name);
				await frappe.after_ajax();
				if (window.cur_frm?.doctype === "Payment Entry" && window.cur_frm.doc?.name === payment.name) {
					await window.cur_frm.set_value("mode_of_payment", preferred);
				}
				return payment;
			})();
		}
		// Preserve the native dt/dn mapping, early-payment discount prompt and
		// Payment Entry/Journal Entry selection instead of using a generic mapper.
		return frm.cscript.make_payment_entry();
	}
	function hasTaxConfiguration(doc) {
		return !!(doc?.taxes_and_charges || (doc?.taxes || []).length);
	}
	function taxLabel(doc, fallback = __("Taxes and charges")) {
		const rows = (doc?.taxes || []).filter(row => row?.account_head || row?.description || row?.rate != null);
		const vatRows = rows.filter(row => /\bvat\b|value added|ضريبة/i.test(`${row.description || ""} ${row.account_head || ""}`));
		if (!rows.length || vatRows.length === rows.length) {
			const rates = [...new Set(vatRows.map(row => Number(row.rate)).filter(Number.isFinite))];
			return rates.length === 1 ? `${__("VAT")} (${rates[0]}%)` : __("VAT");
		}
		return fallback;
	}
	function showSummary(name, doc) {
		return name === "net_total" || name === "total_taxes_and_charges" || !!doc?.[name];
	}
	const lineLabel = (profile, name) => (profile?.lineLabels?.[name] || LINE_LABELS[name])?.() || __(name);
	function fieldPrecision(row, field, fallback = 2) {
		const df = frappe.meta.get_docfield(row.doctype, field, row.parent || row.name);
		const places = df ? frappe.meta.get_field_precision(df, row) : NaN;
		return Number.isInteger(places) ? places : fallback;
	}
	// Each line's VAT and its total after VAT. Presentation only: the native tax
	// rows stay the figures that post, and the lines always add up to them.
	// - The VAT, as ERPNext's server splits a tax row over the items
	//   (taxes_and_totals.set_item_wise_tax): the engine's own amount for each
	//   item, rounded on the running total, and the last line takes the cent that
	//   keeps the lines equal to the row (adjust_rounding_in_item_wise_tax_details).
	//   The engine taxes an inclusive price on its unrounded net, so the lines'
	//   VAT adds up to the posted row even where each line's amount minus its
	//   rounded net would not (two lines of 10.00 at 15%: 1.30 and 1.31, not 1.30 twice).
	// - The total: what the customer pays for the line when the price includes
	//   VAT, else its net plus its VAT.
	// Null when the engine cannot say for a price VAT is added to; the screen then
	// shows no split.
	function lineTaxes(frm) {
		const doc = frm.doc, engine = frm.cscript;
		const items = (doc.items || []).filter(row => row.item_code);
		const all = doc.taxes || [];
		const taxes = all.filter(tax => tax.category !== "Valuation");
		const headerDiscount = Number(doc.discount_amount || 0) !== 0;
		// A price that includes VAT: the line's total is what the customer pays for it.
		const inclusive = taxes.length > 0 && !headerDiscount && taxes.every(tax => Number(tax.included_in_print_rate));
		const lines = new Map();
		const engineReady = typeof engine?.get_current_tax_amount === "function" && typeof engine?._load_item_tax_rate === "function";
		if (!taxes.length || (inclusive && !engineReady)) {
			for (const row of items) {
				const places = fieldPrecision(row, "amount");
				const total = roundMoney(headerDiscount ? row.net_amount : row.amount, places);
				lines.set(row.name, { tax: taxes.length ? roundMoney(total - Number(row.net_amount || 0), places) : 0, total });
			}
			return lines;
		}
		if (!engineReady) return null;
		// The engine reads the previous row's figures for the current item from the
		// tax rows themselves; they are put back as they were afterwards.
		const saved = all.map(tax => [tax.tax_amount_for_current_item, tax.grand_total_for_current_item]);
		const raw = new Map(all.map(tax => [tax, []]));
		try {
			for (const row of items) {
				const view = { ...row, _unrounded_net_amount: row._unrounded_net_amount ?? null };
				const taxMap = engine._load_item_tax_rate(row.item_tax_rate);
				all.forEach((tax, index) => {
					let [, current] = engine.get_current_tax_amount(view, tax, taxMap);
					if (frappe.flags?.round_row_wise_tax) current = roundMoney(current, fieldPrecision(tax, "tax_amount"));
					tax.tax_amount_for_current_item = current;
					const signed = tax.category === "Valuation" ? 0 : current * (tax.add_deduct_tax === "Deduct" ? -1 : 1);
					tax.grand_total_for_current_item = (index ? all[index - 1].grand_total_for_current_item : Number(row.net_amount || 0)) + signed;
					raw.get(tax).push(signed);
				});
			}
		} catch (_) { return null; }
		finally { all.forEach((tax, index) => { [tax.tax_amount_for_current_item, tax.grand_total_for_current_item] = saved[index]; }); }
		for (const row of items) lines.set(row.name, { tax: 0, total: 0 });
		for (const tax of taxes) {
			const places = fieldPrecision(tax, "tax_amount");
			let running = 0, posted = 0;
			const shares = raw.get(tax).map(value => {
				running += value;
				const next = roundMoney(running, places);
				const share = roundMoney(next - posted, places);
				posted = next;
				return share;
			});
			const expected = roundMoney(Number(tax.tax_amount_after_discount_amount || 0) * (tax.add_deduct_tax === "Deduct" ? -1 : 1), places);
			const gap = roundMoney(expected - posted, places);
			if (shares.length && Math.abs(gap) <= 0.5) shares[shares.length - 1] = roundMoney(shares.at(-1) + gap, places);
			items.forEach((row, index) => { lines.get(row.name).tax = roundMoney(lines.get(row.name).tax + shares[index], places); });
		}
		for (const row of items) {
			const line = lines.get(row.name);
			line.total = roundMoney(inclusive ? row.amount : Number(row.net_amount || 0) + line.tax, fieldPrecision(row, "amount"));
		}
		return lines;
	}
	const RATE_BASED_CHARGE_TYPES = new Set(["On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"]);
	const isVatRow = row => /\bvat\b|value added|ضريبة/i.test(`${row?.description || ""} ${row?.account_head || ""}`);
	const VAT_STANDARD = "standard";
	const VAT_INCLUDED = "included";
	const VAT_EXEMPT = "exempt";
	const vatProfileCache = new Map();
	const vatProfileRequests = new Map();
	const vatInternalUpdates = new WeakSet();
	const vatNormalizationTokens = new WeakMap();
	const vatTransactionType = frm => frm.doctype === "Purchase Invoice" ? "Purchase" : "Sales";
	const vatPartyReady = frm => !!frm.doc[profileFor(frm)?.party];
	const vatPartyPrompt = frm => frm.doctype === "Purchase Invoice"
		? __("Choose a supplier before setting VAT.") : __("Choose a customer before setting VAT.");
	const vatProfileKey = frm => `${vatTransactionType(frm)}:${frm.doc.company || ""}`;
	async function loadVatProfiles(frm) {
		const key = vatProfileKey(frm);
		if (!frm.doc.company) return { standard: null, exempt: null };
		if (vatProfileCache.has(key)) return vatProfileCache.get(key);
		if (!vatProfileRequests.has(key)) {
			vatProfileRequests.set(key, frappe.call({
				type: "GET",
				method: "bunood_theme.vat.get_vat_treatments",
				args: { company: frm.doc.company, transaction_type: vatTransactionType(frm) },
			}).then(response => {
				const profiles = response?.message || { standard: null, exempt: null };
				vatProfileCache.set(key, profiles);
				return profiles;
			}).finally(() => vatProfileRequests.delete(key)));
		}
		return vatProfileRequests.get(key);
	}
	function vatTreatment(doc, profiles, source = "") {
		let fromTemplate = "", fromCategory = "";
		for (const treatment of [VAT_EXEMPT, VAT_STANDARD]) {
			const profile = profiles?.[treatment];
			if (profile?.template && profile.template === doc?.taxes_and_charges) { fromTemplate = treatment; break; }
		}
		for (const treatment of [VAT_EXEMPT, VAT_STANDARD]) {
			const profile = profiles?.[treatment];
			if (profile?.tax_category && profile.tax_category === doc?.tax_category) { fromCategory = treatment; break; }
		}
		const withPriceMode = treatment => treatment === VAT_STANDARD && (doc?.taxes || []).some(
			row => isVatRow(row) && Number(row.included_in_print_rate),
		) ? VAT_INCLUDED : treatment;
		if (source === "taxes_and_charges") return withPriceMode(fromTemplate);
		if (source === "tax_category") return withPriceMode(fromCategory || fromTemplate);
		return withPriceMode(fromTemplate || fromCategory);
	}
	function clearItemTaxOverrides(frm) {
		let changed = false;
		for (const row of frm.doc.items || []) {
			if (row.item_tax_template) { row.item_tax_template = ""; changed = true; }
			if (row.item_tax_rate && row.item_tax_rate !== "{}") { row.item_tax_rate = "{}"; changed = true; }
		}
		if (changed) {
			frm.dirty?.();
			frm.refresh_field?.("items");
		}
		return changed;
	}
	async function recalculateVatTreatment(frm) {
		if (typeof frm.cscript?.update_item_tax_map === "function") {
			await Promise.resolve(frm.cscript.update_item_tax_map());
			await frappe.after_ajax();
		}
		if (typeof frm.cscript?.calculate_taxes_and_totals === "function") {
			await Promise.resolve(frm.cscript.calculate_taxes_and_totals());
		}
		frm.refresh_field?.("items");
		frm.refresh_field?.("taxes");
		frm.refresh_fields?.();
	}
	async function setVatIncludedInPrice(frm, included) {
		const value = included ? 1 : 0;
		const rows = (frm.doc.taxes || []).filter(row =>
			isVatRow(row) && Number(row.included_in_print_rate) !== value,
		);
		for (const row of rows) {
			await frappe.model.set_value(row.doctype, row.name, "included_in_print_rate", value);
		}
		if (rows.length) frm.refresh_field?.("taxes");
		return rows.length;
	}
	async function applyVatTreatment(frm, treatment, knownProfiles = null) {
		if (Number(frm.doc.docstatus) !== 0) throw Error(__("Submitted invoices cannot be changed."));
		if (!vatPartyReady(frm)) throw Error(vatPartyPrompt(frm));
		const profiles = knownProfiles || await loadVatProfiles(frm);
		const profileName = treatment === VAT_INCLUDED ? VAT_STANDARD : treatment;
		const profile = profiles?.[profileName];
		if (!profile?.template || !profile?.tax_category) {
			throw Error(__("VAT setup is incomplete. Configure a standard and exempt tax rule, or use Advanced."));
		}
		vatInternalUpdates.add(frm);
		try {
			// Force ERPNext to re-resolve item taxes for the selected category.
			clearItemTaxOverrides(frm);
			if (frm.doc.tax_category !== profile.tax_category) await frm.set_value("tax_category", profile.tax_category);
			if (frm.doc.taxes_and_charges !== profile.template) await frm.set_value("taxes_and_charges", profile.template);
			await frappe.after_ajax();
			await setVatIncludedInPrice(frm, treatment === VAT_INCLUDED);
			await recalculateVatTreatment(frm);
			if (frm.fields_dict.exempt_from_sales_tax &&
				Number(frm.doc.exempt_from_sales_tax) !== Number(treatment === VAT_EXEMPT)) {
				await frm.set_value("exempt_from_sales_tax", treatment === VAT_EXEMPT ? 1 : 0);
			}
			return profile;
		} finally {
			await frappe.after_ajax();
			vatInternalUpdates.delete(frm);
		}
	}
	function reportVatTreatmentError(error) {
		frappe.msgprint?.({
			title: __("VAT treatment"),
			message: error?.message || __("Could not update VAT. Use Advanced to review the tax settings."),
			indicator: "red",
		});
	}
	function scheduleVatNormalization(frm, source) {
		if (vatInternalUpdates.has(frm) || Number(frm.doc.docstatus) !== 0 || !vatPartyReady(frm)) return;
		const token = (vatNormalizationTokens.get(frm) || 0) + 1;
		vatNormalizationTokens.set(frm, token);
		setTimeout(() => frappe.after_ajax().then(async () => {
			if (vatNormalizationTokens.get(frm) !== token || vatInternalUpdates.has(frm)) return;
			const profiles = await loadVatProfiles(frm);
			const treatment = vatTreatment(frm.doc, profiles, source);
			if (treatment) await applyVatTreatment(frm, treatment, profiles);
			instances.get(frm)?.render();
		}).catch(reportVatTreatmentError), 0);
	}
	function taxConfigurationIssue(doc) {
		const rows = doc?.taxes || [];
		if (doc?.taxes_and_charges && !rows.length) return { code: "empty_template", template: doc.taxes_and_charges, row: 0 };
		const rates = new Map();
		for (let position = 0; position < rows.length; position++) {
			const row = rows[position];
			if (!isVatRow(row) || !row.account_head) continue;
			const rowNumber = Number(row.idx) || position + 1;
			const blank = row.rate == null || (typeof row.rate === "string" && !row.rate.trim());
			const number = Number(row.rate);
			if (RATE_BASED_CHARGE_TYPES.has(row.charge_type) && (blank || !Number.isFinite(number) || number < 0)) {
				return { code: "invalid_rate", account: row.account_head, row: rowNumber };
			}
			if (!blank && Number.isFinite(number) && number >= 0) {
				if (!rates.has(row.account_head)) rates.set(row.account_head, new Map());
				const accountRates = rates.get(row.account_head), key = String(number);
				if (!accountRates.has(key)) accountRates.set(key, []);
				accountRates.get(key).push(rowNumber);
			}
		}
		for (const [account, accountRates] of rates) {
			if (accountRates.size < 2) continue;
			return {
				code: "conflicting_rates", account,
				rates: [...accountRates.keys()].sort((a, b) => Number(a) - Number(b)),
				rows: [...accountRates.values()].flat().sort((a, b) => a - b),
				row: [...accountRates.values()].flat().sort((a, b) => a - b)[0],
			};
		}
		return null;
	}
	function taxIssueMessage(issue) {
		if (issue.code === "empty_template") return __("The selected tax template contains no tax rows. Choose a valid standard, zero-rate, exempt, or out-of-scope template.");
		if (issue.code === "conflicting_rates") return __("Tax issue. Rows: {0}. Conflicting rates: {1}. Use one rate per tax account or separate the rates into different tax accounts.", [issue.rows.join(", "), issue.rates.map(rate => `${rate}%`).join(", ")]);
		return __("Tax issue. Row: {0}. The rate is missing or invalid. Enter a rate, or choose an explicit zero-rate, exempt, or out-of-scope template.", [issue.row]);
	}
	function supports(frm) {
		const d = frm?.doc;
		const p = profileFor(frm);
		return !!(d && p && [0, 1, 2].includes(Number(d.docstatus)) && !d.is_return && !d.is_pos &&
			!d.is_debit_note && !d.is_credit_note &&
			(frm.doctype === "Sales Invoice" || (!d.amended_from && Number(d.docstatus) < 2)) &&
			fieldStatus(frm, p.party) !== "None" && frm.fields_dict.items?.grid);
	}
	function eligible(frm) {
		return supports(frm) && Number(frm.doc.docstatus) === 0 && !frm.save_disabled &&
			frm.fields_dict.items.grid.is_editable();
	}
	class SerialChanges {
		constructor(active, changed) { this.active = active; this.changed = changed; this.tail = Promise.resolve(); this.count = 0; }
		run(action, { settle = true } = {}) {
			this.count++; this.changed();
			const next = this.tail.then(async () => {
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				const result = await action();
				if (settle) await frappe.after_ajax();
				return result;
			}).finally(() => { this.count--; this.changed(); });
			this.tail = next.catch(() => {});
			return next;
		}
	}
	async function saveDraft(frm) {
		// Frappe's Form.save promise does not settle when its native mandatory
		// check returns false. Run the same check first so validation feedback is
		// still native, while callers can always release their busy state.
		fillDueDate(frm);
		if (typeof frappe.ui?.form?.check_mandatory === "function" && !frappe.ui.form.check_mandatory(frm)) {
			throw Error(__("Complete the required fields highlighted in the form, then try again."));
		}
		let confirmed = false, failed = false;
		await frm.save("Save", r => { confirmed = !r?.exc; }, null, () => { failed = true; });
		// frm.save resolves its own lifecycle. Waiting for *all* desk AJAX here
		// also waits for unrelated dashboard, notification and link requests.
		if (failed || !confirmed || !frm.doc.name || frm.doc.__islocal || frm.is_dirty()) {
			throw Error(__("The draft was not saved. Review the message or open the full invoice."));
		}
	}
	function submitConfirmed(frm) {
		// Keep Frappe's complete submit lifecycle (validation, permissions,
		// before_submit, save("Submit"), and on_submit), but make this explicit
		// workbench action the user's confirmation. Only the exact native submit
		// prompt is accepted; every other confirmation still uses Frappe normally.
		const nativeConfirm = frappe.confirm;
		// Frappe's savesubmit promise settles only on success; a refusal (a credit limit, stock that
		// ran out, ZATCA's checks) reaches its on_error, which rejects here, so the bill never hangs.
		const submit = () => new Promise((resolve, reject) => {
			Promise.resolve(frm.savesubmit(null, null, () => reject(Error(__("The invoice was not submitted. Read the message, then try again."))))).then(resolve, reject);
		});
		if (typeof nativeConfirm !== "function") return submit();
		const expectedPrompt = __("Permanently Submit {0}?", [frm.docname]);
		let accepted = false;
		frappe.confirm = function (message, yes, no) {
			if (!accepted && message === expectedPrompt) {
				accepted = true;
				return yes();
			}
			return nativeConfirm.apply(this, arguments);
		};
		try { return submit(); }
		finally { frappe.confirm = nativeConfirm; }
	}
	function node(tag, cls, text, parent) {
		const n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		if (parent) parent.append(n);
		return n;
	}
	function button(text, parent, action, primary = false) {
		const b = node("button", `bnd-bill-button${primary ? " bnd-bill-primary" : ""}`, text, parent);
		b.type = "button"; b.addEventListener("click", action); return b;
	}
	function submittedCustomerInvoice(frm) {
		return ["Sales Invoice", "POS Invoice"].includes(frm?.doctype) &&
			Number(frm.doc?.docstatus) === 1 && !frm.doc.__islocal;
	}
	function invoicePdfUrl(doc) {
		const query = new URLSearchParams({ doctype: doc.doctype, name: doc.name, file_type: "pdf" });
		return `/api/method/bunood_theme.invoice_delivery.download_customer_invoice?${query}`;
	}
	function invoiceXmlUrl(doc) {
		const query = new URLSearchParams({ doctype: doc.doctype, name: doc.name, file_type: "xml" });
		return `/api/method/bunood_theme.invoice_delivery.download_customer_invoice?${query}`;
	}
	async function deliveryStatus(doc) {
		const response = await frappe.call({ method: "bunood_theme.zatca.delivery.get_delivery_status", type: "GET",
			args: { doctype: doc.doctype, name: doc.name } });
		return response.message || {};
	}
	function whatsappNumber(value) {
		const raw = String(value || "").trim().replace(/[\s().-]/g, "");
		const digits = raw.replace(/^\+|^00/, "");
		return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
	}
	// Sending a submitted invoice to its customer, on one screen (owner, 2026-10-14: «ارسال الفاتورة
	// للعميل مباشرة بدون كثرة الشاشات»): WhatsApp to the customer's number, email with the PDF (and
	// the ZATCA XML on a Phase 2 invoice), and the PDF itself to download. `doc` is the invoice as
	// the form has it, or as the bill kept it after moving on to the next one.
	async function sendInvoice(doc, { canEmail = true, justSubmitted = false } = {}) {
		if (!doc?.name || Number(doc.docstatus) !== 1 || !frappe.ui?.Dialog) return;
		let readiness;
		try { readiness = await deliveryStatus(doc); }
		catch (_) { frappe.msgprint(__("Invoice delivery status is unavailable. Try again shortly.")); return; }
		if (!readiness.ready) {
			if (justSubmitted) frappe.show_alert({ message: readiness.reason || __("Invoice delivery is not ready."), indicator: "orange" });
			else frappe.msgprint(readiness.reason || __("Invoice delivery is not ready."));
			return;
		}
		let mobile = doc.contact_mobile || "";
		if (!mobile && doc.customer) {
			try {
				const result = await frappe.db.get_value("Customer", doc.customer, "mobile_no");
				mobile = result?.message?.mobile_no || "";
			} catch (_) { /* The cashier can enter the number without Customer read access. */ }
		}
		const total = new DOMParser().parseFromString(frappe.format(doc.grand_total || 0,
			{ fieldtype: "Currency", options: doc.currency }, { inline: true }), "text/html").body.textContent || "";
		const dialog = new frappe.ui.Dialog({
			title: __("Send to the customer: {0}", [doc.name]),
			fields: [
				{ fieldtype: "Data", fieldname: "phone", label: __("Customer WhatsApp number"), default: mobile,
					description: __("Include the country code, for example +966501234567.") },
				{ fieldtype: "Button", fieldname: "whatsapp", label: __("Open WhatsApp"), click: () => {
					const phone = whatsappNumber(dialog.get_value("phone"));
					if (!phone) { frappe.msgprint(__("Enter a WhatsApp number with its country code.")); return; }
					const message = __("Your invoice is ready. Number: {0}. Total: {1}.", [doc.name, total]);
					window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
				} },
				...(canEmail ? [
					{ fieldtype: "Column Break" },
					{ fieldtype: "Data", fieldname: "recipient", label: __("Customer email"), options: "Email", default: doc.contact_email || "" },
					{ fieldtype: "Button", fieldname: "email", label: readiness.regulated ? __("Email with PDF and XML") : __("Email with PDF"), click: async () => {
						const recipient = String(dialog.get_value("recipient") || "").trim();
						if (!recipient) { frappe.msgprint(__("Enter the customer's email.")); return; }
						const send = dialog.fields_dict.email.$input;
						send?.prop("disabled", true);
						try {
							await frappe.call({ method: "bunood_theme.invoice_delivery.send_invoice_email", type: "POST",
								args: { doctype: doc.doctype, name: doc.name, recipient,
									subject: __("Invoice {0}", [doc.name]), message: __("Please find your invoice attached.") } });
							frappe.show_alert({ message: readiness.regulated
								? __("Invoice email queued with its PDF and ZATCA XML.")
								: __("Invoice email queued with its PDF."), indicator: "green" });
						} catch (_) { /* Frappe displays the server-side error; the screen stays. */ }
						finally { send?.prop("disabled", false); }
					} },
				] : []),
				{ fieldtype: "Section Break" },
				{ fieldtype: "HTML", fieldname: "help" },
			],
			secondary_action_label: __("Download invoice PDF"),
			secondary_action: () => window.open(invoicePdfUrl(doc), "_blank", "noopener"),
		});
		dialog.$wrapper?.addClass("bnd-invoice-send-dialog");
		dialog.$wrapper?.on("hidden.bs.modal", () => dialog.$wrapper.remove());
		const help = dialog.fields_dict.help.$wrapper?.[0];
		if (help) {
			node("p", "bnd-invoice-delivery-help", readiness.regulated
				? __("WhatsApp opens the chat with the customer; attach the ZATCA XML there yourself. The email carries the PDF and the XML.")
				: __("WhatsApp opens the chat with the customer; attach the PDF there yourself. The email carries the PDF."), help);
			if (readiness.regulated) button(__("Download ZATCA XML"), help,
				() => window.open(invoiceXmlUrl(doc), "_blank", "noopener"));
		}
		dialog.show();
	}
	function showInvoiceDelivery(frm, justSubmitted = false) {
		if (!submittedCustomerInvoice(frm)) return;
		const canEmail = !!frm.isPosReceiptHandoff || !frappe.model?.can_email || frappe.model.can_email(frm.doctype, frm);
		return sendInvoice(frm.doc, { canEmail, justSubmitted });
	}
	function previewInvoice(doctype, name, sandbox = true, autoPrint = false, printFormat = "") {
		const key = `${doctype}:${name}:${printFormat}`;
		if (printPreviews.has(key)) { printPreviews.get(key).show(); return; }
		const origin = document.activeElement;
		let active = true, ready = false;
		const frame = document.createElement("iframe");
		frame.title = __("Print preview");
		frame.className = "bnd-invoice-print-preview";
		frame.setAttribute("sandbox", "allow-same-origin allow-modals");
		frame.style.inlineSize = "100%";
		frame.style.blockSize = "65vh";
		frame.style.border = "0";
		frame.hidden = true;
		const dialog = new frappe.ui.Dialog({
			title: __("Print preview"), size: "extra-large", fields: [],
			primary_action_label: __("Print"),
			primary_action() { if (ready) { frame.contentWindow.focus(); frame.contentWindow.print(); } },
			secondary_action_label: __("Download PDF"),
			secondary_action() {
				if (!ready) return;
				const query = new URLSearchParams({ doctype, name });
				if (!sandbox && printFormat) query.set("print_format", printFormat);
				// An attachment is downloaded only after this explicit action, without a blank tab.
				const method = sandbox ? "download_sandbox_invoice" : "download_customer_invoice";
				window.location.assign(`/api/method/bunood_theme.invoice_delivery.${method}?${query}`);
			},
			onhide() { active = false; printPreviews.delete(key); frame.remove(); if (origin?.isConnected) origin.focus(); },
		});
		printPreviews.set(key, dialog);
		const body = dialog.$body?.[0] || dialog.body;
		const status = node("p", "bnd-invoice-print-status", __("Loading print preview..."), body);
		status.setAttribute("role", "status");
		dialog.show();
		dialog.disable_primary_action();
		dialog.get_primary_btn().prop("disabled", true);
		dialog.get_secondary_btn().prop("disabled", true);
		frame.onload = async () => {
			if (!active || !frame.contentDocument?.querySelector(".print-format")) return;
			await frame.contentDocument.fonts?.ready;
			await Promise.all([...frame.contentDocument.images].map(image => image.decode?.().catch(() => {})));
			if (!active) return;
			ready = true; frame.hidden = false; status.remove();
			dialog.enable_primary_action();
			dialog.get_primary_btn().prop("disabled", false);
			dialog.get_secondary_btn().prop("disabled", false);
			if (autoPrint && !sandbox) {
				// Printed straight away, the preview closes once the print dialog does.
				frame.contentWindow.addEventListener("afterprint", () => setTimeout(() => dialog.hide(), 0), { once: true });
				frame.contentWindow.focus(); frame.contentWindow.print();
			}
		};
		const method = sandbox ? "preview_sandbox_invoice" : "preview_customer_invoice";
		const args = { doctype, name, ...(!sandbox && printFormat ? { print_format: printFormat } : {}) };
		void frappe.call({ method: `bunood_theme.invoice_delivery.${method}`, type: "GET", args })
			.then(response => {
				if (!active) return;
				if (!response.message?.html) throw new Error("Empty print preview");
				frame.srcdoc = response.message.html;
				body.append(frame);
			}).catch(() => { if (active) status.textContent = __("Invoice print preview is unavailable. Try again shortly."); });
	}
	api.invoice_print_preview = previewInvoice;
	// A draft as it stands, unsaved, in a print format: Frappe's own print-view
	// rendering of an unsaved document (frappe.www.printview.get_html_and_style),
	// shown read-only. It carries the word "Draft" where the number will be.
	function previewDraft(frm, printFormat = "") {
		const origin = document.activeElement;
		let active = true;
		const frame = document.createElement("iframe");
		frame.title = __("Print preview");
		frame.className = "bnd-invoice-print-preview";
		frame.setAttribute("sandbox", "allow-same-origin");
		frame.style.inlineSize = "100%";
		frame.style.blockSize = "65vh";
		frame.style.border = "0";
		frame.hidden = true;
		const dialog = new frappe.ui.Dialog({
			title: __("Bill preview"), size: "extra-large", fields: [],
			primary_action_label: __("Back to the bill"),
			primary_action() { dialog.hide(); },
			onhide() { active = false; frame.remove(); if (origin?.isConnected) origin.focus(); },
		});
		dialog.$wrapper?.addClass("bnd-bill-preview-dialog");
		dialog.$wrapper?.on("hidden.bs.modal", () => dialog.$wrapper.remove());
		const body = dialog.$body?.[0] || dialog.body;
		node("p", "bnd-bill-hint bnd-bill-preview-note", __("A preview only: the bill is not saved or submitted."), body);
		const status = node("p", "bnd-invoice-print-status", __("Loading print preview..."), body);
		status.setAttribute("role", "status");
		dialog.show();
		const rtl = !!frappe.utils?.is_rtl?.();
		void frappe.call({
			method: "frappe.www.printview.get_html_and_style",
			// The ready row waiting for an item is the screen's, not the bill's.
			args: { doc: { ...frm.doc, name: __("Draft"), items: (frm.doc.items || []).filter(row => row.item_code) },
				...(printFormat ? { print_format: printFormat } : {}) },
		}).then(response => {
			if (!active) return;
			const out = response?.message || {};
			if (!out.html) throw new Error("Empty print preview");
			const css = frappe.assets?.bundled_asset?.("print.bundle.css", rtl);
			frame.onload = () => { if (active) { frame.hidden = false; status.remove(); } };
			frame.srcdoc = `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${frappe.boot?.lang || ""}"><head><meta charset="utf-8">` +
				`<style>${out.style || ""}</style>${css ? `<link href="${css}" rel="stylesheet">` : ""}</head>` +
				`<body><div class="print-format print-format-preview">${out.html}</div></body></html>`;
			body.append(frame);
		}).catch(() => { if (active) status.textContent = __("Invoice print preview is unavailable. Try again shortly."); });
	}
	async function printCustomerInvoice(frm, printFormat = "", autoPrint = false) {
		if (!submittedCustomerInvoice(frm)) return frm.print_doc();
		let readiness;
		try { readiness = await deliveryStatus(frm.doc); }
		catch (_) { frappe.msgprint(__("Invoice delivery status is unavailable. Try again shortly.")); return; }
		if (!readiness.ready) {
			if (readiness.can_preview_sandbox) {
				previewInvoice(frm.doctype, frm.doc.name);
			} else {
				frappe.msgprint(readiness.state === "sandbox_only" ? __("The signed ZATCA XML or QR code is not ready yet.") : (readiness.reason || __("Invoice delivery is not ready.")));
			}
			return;
		}
		// A ZATCA Phase 2 invoice prints only in Phase 2's own format (the server holds to it).
		if (readiness.regulated && printFormat && printFormat !== readiness.format) {
			frappe.show_alert({ message: __("A ZATCA invoice prints in the ZATCA format."), indicator: "blue" });
		}
		previewInvoice(frm.doctype, frm.doc.name, false, autoPrint, printFormat);
	}
	// A bill just saved, as the print helpers read it, once the screen has moved on.
	function savedInvoice(done) {
		return { doctype: done.doctype, doc: { doctype: done.doctype, name: done.name, docstatus: 1 } };
	}
	// One message after «حفظ» or «طباعة» (owner, 2026-10-14): which bill was saved, what was
	// received for it, and the way back to it or to its print.
	function announceSaved(done, payment, printFormat = "") {
		const escape = value => frappe.utils?.escape_html ? frappe.utils.escape_html(String(value ?? "")) : String(value ?? "");
		const amount = (value, currency) => new DOMParser().parseFromString(
			frappe.format(value, { fieldtype: "Currency", options: currency }, { inline: true }), "text/html").body.textContent || "";
		const subtitle = payment?.entries?.length
			? __("Payment recorded: {0}", [payment.entries.map(entry => `${__(entry.mode_of_payment)} ${amount(entry.amount, payment.currency)}`).join(" · ")])
			: done.credit ? __("On credit: the customer owes {0}", [amount(done.total, done.currency)]) : "";
		const sales = done.doctype === "Sales Invoice";
		const actions = `<div class="bnd-bill-saved-actions">` +
			(sales ? `<button type="button" class="btn btn-xs btn-primary" data-action="bnd_send">${escape(__("Send to the customer"))}</button>` : "") +
			`<button type="button" class="btn btn-xs btn-default" data-action="bnd_open">${escape(__("Open the invoice"))}</button>` +
			(sales ? `<button type="button" class="btn btn-xs btn-default" data-action="bnd_print">${escape(__("Print"))}</button>` : "") +
			`</div>`;
		frappe.show_alert({ message: escape(__("Bill saved: {0}", [done.name])), subtitle: escape(subtitle), body: actions, indicator: "green" }, 15, {
			bnd_send: () => void sendInvoice(done.doc),
			bnd_open: () => frappe.set_route("Form", done.doctype, done.name),
			bnd_print: () => void printCustomerInvoice(savedInvoice(done), printFormat),
		});
	}
	class BillWorkbench {
		constructor(frm) {
			this.frm = frm; this.doc = frm.doc; this.docname = frm.doc.name; this.profile = profileFor(frm); this.controls = []; this.closed = false; this.simple = true; this.invalid = new Map(); this.pending = new Map(); this.rowViews = new Map(); this.editTimers = new Map(); this.mobileExpanded = "";
			this.queue = new SerialChanges(() => this.active(), () => this.busy());
			// Frappe's own «إلغاء» (the Advanced form's) asks the same plain question as ours.
			if (typeof frm.savecancel === "function" && !frm.bndNativeCancel) {
				const nativeCancel = frm.bndNativeCancel = frm.savecancel;
				frm.savecancel = function (...args) {
					const workbench = instances.get(frm);
					return workbench && !workbench.closed && workbench.syncDocument() ? workbench.cancelDocument() : nativeCancel.apply(this, args);
				};
			}
			this.native = frm.$wrapper?.find(".form-layout").first()?.[0];
			this.host = this.native?.parentElement || frm.$wrapper?.[0] || frm.wrapper;
			this.root = node("section", "bnd-bill", null, null);
			if (this.native?.parentElement) this.native.before(this.root); else this.host?.prepend(this.root);
			this.root.setAttribute("data-bnd-part", "sales-bill");
			this.root.setAttribute("aria-label", __(this.profile.title));
			this.scrollHost = this.root.closest(".main-section");
			this.handleBillScroll = () => this.closeDetachedAutocomplete();
			this.scrollHost?.addEventListener("scroll", this.handleBillScroll, { passive: true });
			const mode = this.mode = node("nav", "bnd-bill-mode"); this.root.before(mode); mode.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = button(__("Simple"), mode, () => this.setMode(true));
			this.advancedButton = button(__("Advanced"), mode, () => this.fullInvoice());
			const intro = node("header", "bnd-bill-intro", null, this.root);
			const identity = node("div", "bnd-bill-identity", null, intro);
			const seal = node("span", "bnd-bill-seal", null, identity); seal.setAttribute("aria-hidden", "true");
			if (frappe.boot?.bnd_logo) Object.assign(node("img", "", null, seal), { src: frappe.boot.bnd_logo, alt: "" });
			const heading = node("div", "", null, identity);
			node("span", "bnd-bill-brand", frappe.boot?.bnd_company || "", heading);
			const title = node("div", "bnd-bill-title-row", null, heading);
			node("h2", "", __(this.profile.title), title);
			this.stateBadge = node("span", "bnd-document-state", "", title);
			this.stateBadge.setAttribute("role", "status");
			this.documentState = node("p", "bnd-bill-document-state", "", heading);
			// One title per screen: the Simple/Advanced switch rides in this header, and
			// the theme's document band above it is hidden while this view owns the page.
			this.modeSlot = node("div", "bnd-bill-mode-slot", null, identity);
			const toolbar = node("div", "bnd-bill-toolbar", null, intro); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", __("Document actions"));
			const commitActions = node("div", "bnd-bill-action-group bnd-bill-action-group-commit", null, toolbar);
			commitActions.setAttribute("role", "group"); commitActions.setAttribute("aria-label", __("Draft actions"));
			const tools = node("details", "bnd-bill-tools", null, toolbar);
			const toolsTrigger = node("summary", "", null, tools);
			const toolsIcon = node("span", "bnd-bill-action-icon", null, toolsTrigger);
			toolsIcon.innerHTML = frappe.utils.icon("settings", "sm");
			toolsIcon.setAttribute("aria-hidden", "true");
			node("span", "bnd-bill-action-label", __("Invoice tools"), toolsTrigger);
			toolsTrigger.setAttribute("aria-label", __("Invoice tools"));
			toolsTrigger.setAttribute("title", __("Invoice tools"));
			const toolBody = node("div", "bnd-bill-tools-body", null, tools);
			toolBody.id = `bnd-bill-tools-${++controlId}`;
			toolsTrigger.setAttribute("role", "button");
			toolsTrigger.setAttribute("aria-haspopup", "true");
			toolsTrigger.setAttribute("aria-controls", toolBody.id);
			toolsTrigger.setAttribute("aria-expanded", String(tools.open));
			tools.addEventListener("toggle", () => toolsTrigger.setAttribute("aria-expanded", String(tools.open)));
			tools.addEventListener("keydown", e => {
				if (e.key === "Escape" && tools.open) { e.preventDefault(); e.stopPropagation(); tools.open = false; toolsTrigger.focus(); }
			});
			tools.addEventListener("click", e => {
				if (e.target.closest("button")) { const restoreFocus = tools.contains(document.activeElement); tools.open = false; if (restoreFocus) toolsTrigger.focus(); }
			}, true);
			const documentActions = node("div", "bnd-bill-action-group bnd-bill-action-group-document", null, toolBody);
			documentActions.setAttribute("role", "group"); documentActions.setAttribute("aria-label", __("Invoice actions"));
			const utilityActions = node("div", "bnd-bill-action-group bnd-bill-action-group-utility", null, toolBody);
			utilityActions.setAttribute("role", "group"); utilityActions.setAttribute("aria-label", __("Invoice tools"));
			// «جديد» beside «حفظ» and «طباعة» (owner, 2026-10-14), and the bills already made
			// one click away: a draft to finish or print again, or any earlier bill.
			this.newButton = this.action(commitActions, __("New"), null, "file-plus", () => this.newDocument());
			this.newButton.classList.add("bnd-bill-action-new");
			this.newButton.dataset.bndAction = "new";
			this.newButton.setAttribute("aria-label", __("Start a new bill"));
			this.newButton.setAttribute("title", __("Start a new bill"));
			// Saving a draft remains immediately available from Invoice tools and F9,
			// but it is not a second commitment CTA in the compact bottom bar.
			this.saveButton = this.action(documentActions, __("Save draft"), "F9", "save", () => this.save());
			this.saveButton.classList.add("bnd-bill-action-draft");
			this.saveButton.dataset.bndAction = "save";
			// One word on each of the three (owner, 2026-10-12): «حفظ» saves and submits,
			// «طباعة» saves, submits and prints, «عرض» shows the bill before either. The
			// full meaning stays in each button's accessible name and tooltip.
			this.submitButton = this.action(commitActions, __("Save bill"), null, "circle-check", () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.submitButton.setAttribute("aria-label", __("Save and submit"));
			this.submitButton.setAttribute("title", __("Save and submit"));
			this.submitPrintButton = this.action(commitActions, __("Print bill"), null, "printer", () => this.submitAndPrint());
			this.submitPrintButton.classList.add("bnd-bill-action-submit-print");
			this.submitPrintButton.dataset.bndAction = "submit-print";
			this.submitPrintButton.setAttribute("aria-label", __("Save, submit and print"));
			this.submitPrintButton.setAttribute("title", __("Save, submit and print"));
			this.saveAndNewButton = this.action(utilityActions, __("Save and create new"), null, null, () => this.saveAndNew());
			this.mobileTotal = node("div", "bnd-bill-mobile-total", null, commitActions);
			node("span", "", __("Total"), this.mobileTotal);
			this.mobileTotalValue = node("strong", "", "", this.mobileTotal);
			this.partyButton = this.action(documentActions, __(this.profile.partyDoctype), "F3", "user", () => this.partyControl?.set_focus());
			this.deleteButton = this.action(documentActions, __("Delete"), null, "delete", () => this.removeDocument());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			// «عرض» shows the bill in the chosen print format before anything is saved: a
			// draft as it stands, unsaved; a submitted bill in its delivery preview,
			// which prints and downloads it.
			this.previewButton = this.action(commitActions, __("View bill"), null, "eye", () => this.preview());
			this.previewButton.classList.add("bnd-bill-action-print", "bnd-bill-action-preview");
			this.previewButton.dataset.bndAction = "preview";
			this.previewButton.setAttribute("aria-label", __("View the bill before printing or saving"));
			this.previewButton.setAttribute("title", __("View the bill before printing or saving"));
			this.listButton = this.action(commitActions, __("Invoices"), null, "list", () => this.openList());
			this.listButton.classList.add("bnd-bill-action-list");
			this.listButton.dataset.bndAction = "list";
			this.listButton.setAttribute("aria-label", __("Earlier bills: drafts to finish and bills to print again"));
			this.listButton.setAttribute("title", __("Earlier bills: drafts to finish and bills to print again"));
			this.sendButton = this.action(documentActions, __("Send invoice to customer"), null, "send", () => showInvoiceDelivery(this.frm));
			this.sendButton.classList.add("bnd-bill-action-send");
			this.duplicateButton = this.action(documentActions, __("Duplicate"), null, "copy", () => this.duplicateDocument());
			// «إلغاء» alone reads as "close this" (owner, 2026-10-14): the button names what it
			// cancels, and asks in plain words before it does.
			this.cancelButton = this.action(documentActions, __("Cancel the invoice"), null, "close", () => this.cancelDocument());
			this.cancelButton.classList.add("bnd-bill-action-danger");
			this.paymentButton = this.action(commitActions, __("Record payment"), "F7", "coins", () => this.payment(), true);
			this.paymentButton.classList.add("bnd-bill-action-save");
			this.discountButton = this.action(documentActions, __("Discount"), "F10", "percent", () => this.openDetails("discount_amount"));
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", "rotate-ccw", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "Alt+I", "search", () => this.focusItemEntry());
			// The context bar (owner's mock, 2026-10-10): where the bill sells from (the
			// branch, or the company when it has none, and the warehouse the branch is tied
			// to), how it is settled, its currency and its price list, one chip each.
			const context = this.contextBar = node("div", "bnd-bill-context");
			intro.after(context);
			context.setAttribute("role", "group");
			context.setAttribute("aria-label", __("Invoice context"));
			this.chips = {};
			if (this.branches().length) this.chips.branch = this.chip(context, "store", __("Branch"), () => this.branchMenu());
			else this.chips.company = this.chip(context, "building-2", __("Company"));
			if (frm.fields_dict.set_warehouse) this.chips.warehouse = this.chip(context, "warehouse", __("Warehouse"), () => this.warehouseMenu());
			const settlement = this.profile.paymentMethod && frm.fields_dict[this.profile.paymentMethod];
			// «طريقة الدفع», as the owner names it, whatever the settlement field is called.
			if (settlement) this.chips.payment = this.chip(context, "wallet", __("Payment method"), () => this.paymentMenu());
			if (frm.fields_dict.currency) this.chips.currency = this.chip(context, "badge-dollar-sign", __("Currency"), () => this.openDetails("currency"));
			// No price list chip on the sales bill (owner, 2026-10-14: «البيع القياسية لا اريدها»);
			// the list stays in the folded details.
			if (frm.fields_dict[this.profile.priceList] && frm.doctype !== "Sales Invoice") this.chips.priceList = this.chip(context, "tag", __("Price List"), () => this.openDetails(this.profile.priceList));
			const keys = node("div", "bnd-bill-context-keys", null, context);
			keys.setAttribute("aria-hidden", "true");
			for (const [key, label] of [["F2", __("Barcode")], ...(this.profile.newItem ? [["F4", __("New item")]] : []), ["F9", __("Save")]]) {
				const hint = node("span", "", null, keys);
				node("kbd", "", key, hint);
				node("span", "", label, hint);
			}
			this.status = node("p", "bnd-bill-status", "", this.root);
			this.status.setAttribute("role", "status");
			this.revertButton = button(__("Revert invalid edits"), this.root, () => { for (const key of this.invalid.keys()) this.pending.delete(key); this.invalid.clear(); this.render(); this.message(__("Changes stay in this invoice when you close this view.")); });
			this.revertButton.hidden = true;
			this.editor = node("fieldset", "bnd-bill-editor", null, this.root);
			const layout = node("div", "bnd-bill-layout", null, this.editor);
			const main = node("div", "bnd-bill-main", null, layout);
			// The party strip is one row of equal controls: the party, the date, how the
			// bill is settled, the branch when there is more than one, and the details
			// switch. Every cell ends on the same line (align-items: end), so a button
			// never sits higher or lower than the field beside it.
			const customer = this.partySection = node("section", "bnd-bill-panel bnd-bill-party", null, main);
			customer.setAttribute("aria-label", __(this.profile.partyDoctype));
			const essentials = node("div", "bnd-bill-essentials", null, customer);
			this.partyControl = this.bindControl(essentials, frm.fields_dict[this.profile.party], this.doc);
			this.partyControl?.$wrapper?.[0]?.classList.add("bnd-bill-party-field");
			if ((frappe.boot.user.can_create || []).includes(this.profile.partyDoctype) && fieldStatus(frm, this.profile.party) === "Write") {
				const label = __("New {0}", [__(this.profile.partyDoctype).toLowerCase()]);
				this.newPartyButton = button("", essentials, () => this.newParty());
				this.newPartyButton.classList.add("bnd-bill-icon-button", "bnd-bill-new-party");
				this.newPartyButton.innerHTML = frappe.utils.icon("add", "sm");
				this.newPartyButton.setAttribute("aria-label", label);
				this.newPartyButton.title = label;
			}
			// The payment method has its chip in the context bar.
			const primaryFields = ["posting_date", ...(frm.doctype === "Purchase Invoice" ? ["bill_no"] : [])];
			for (const name of primaryFields) {
				const source = frm.fields_dict[name];
				if (!source || fieldStatus(frm, name) === "None") continue;
				// «تاريخ الفاتورة», not ERPNext's «تاريخ القيد» (owner, 2026-10-14).
				if (name === "posting_date" && frm.doctype === "Sales Invoice") {
					this.bindControl(essentials, { df: { ...source.df, label: __("Invoice Date") }, get_status: () => source.get_status() }, this.doc);
				} else this.bindControl(essentials, source, this.doc);
			}
			// The customer, the date, then how the document prints, on one row (owner,
			// 2026-10-12). It starts on the organisation's default print format.
			this.renderPrintFormat(essentials);
			const moreToggle = this.detailsToggle = button(__("Additional details"), essentials, () => this.openDetails());
			moreToggle.classList.add("bnd-bill-more-toggle");
			moreToggle.setAttribute("aria-expanded", "false");
			const moreFields = node("div", "bnd-bill-more-fields", null, customer);
			moreFields.id = `bnd-bill-more-${++controlId}`;
			moreToggle.setAttribute("aria-controls", moreFields.id);
			const extraEssentials = node("div", "bnd-bill-essentials", null, moreFields);
			const detailFields = [
				"due_date",
				...(frm.doctype === "Purchase Invoice" ? ["bill_date"] : []),
				"currency", this.profile.priceList, "payment_terms_template",
				...(frm.doctype === "Sales Invoice" ? ["po_no"] : []),
				"apply_discount_on", "additional_discount_percentage", "discount_amount",
			];
			for (const name of detailFields) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(extraEssentials, source, this.doc);
			}
			if (frm.doctype === "Sales Invoice") {
				const invoiceNumber = node("div", "frappe-control bnd-bill-static-field bnd-bill-invoice-number", null, extraEssentials);
				invoiceNumber.dataset.fieldname = "bnd_invoice_number";
				node("label", "control-label", __("Invoice number"), invoiceNumber);
				this.invoiceNumberValue = node("output", "bnd-bill-static-value", "", invoiceNumber);
				this.invoiceNumberValue.dir = "auto";
			}
			// Another app's sections (bunood_business's «فاتورة مستخلص»), registered on
			// window.bunood_theme.sales_bill_sections: "head" ones after the party strip, "foot"
			// ones after the items. Each draws itself on every render (renderSections).
			this.sectionSlots = { head: node("div", "bnd-bill-sections bnd-bill-sections-head", null, main) };
			const items = node("section", "bnd-bill-panel bnd-bill-items", null, main);
			const itemsHead = node("header", "bnd-bill-items-head", null, items);
			node("h3", "", __("Items"), itemsHead);
			this.itemCount = node("span", "bnd-bill-hint bnd-bill-item-count", "", itemsHead);
			// The scan box sits above the lines: a barcode scanner types into it and
			// presses Enter, and so can a person with an item code. ERPNext's own
			// BarcodeScanner places the item, so a second scan raises the quantity.
			// On a sheet with a code column (the owner's sample, 2026-10-14) the box is the ready
			// row's own code cell, where the next item goes; render() keeps it there.
			const coded = !!this.profile.codeColumn;
			const scan = coded ? null : node("div", "bnd-bill-scan bnd-bill-draft-only", null, items);
			if (scan) {
				scan.setAttribute("role", "search");
				this.scanButton = button("", scan, () => this.focusScan());
				this.scanButton.classList.add("bnd-bill-icon-button", "bnd-bill-scan-icon");
				this.scanButton.innerHTML = frappe.utils.icon("scan", "sm");
				this.scanButton.setAttribute("aria-label", __("Scan barcode"));
				this.scanButton.title = __("Scan barcode");
			}
			this.scanInput = node("input", coded ? "bnd-bill-scan-input bnd-bill-code-input" : "bnd-bill-scan-input", null, scan);
			this.scanInput.type = "text";
			this.scanInput.autocomplete = "off";
			this.scanInput.spellcheck = false;
			this.scanInput.dir = "auto";
			this.scanInput.placeholder = coded ? __("Barcode or code") : __("Scan a barcode or type an item code, then press Enter");
			this.scanInput.setAttribute("aria-label", __("Scan a barcode or type an item code, then press Enter"));
			this.scanInput.addEventListener("keydown", e => {
				if (e.key !== "Enter" || e.isComposing) return;
				e.preventDefault(); e.stopPropagation();
				void this.scanCode(this.scanInput.value);
			});
			if (scan) node("kbd", "bnd-bill-scan-key", "F2", scan).setAttribute("aria-hidden", "true");
			const search = node("div", "bnd-bill-search bnd-bill-draft-only", null, items);
			this.addLineButton = button(__("Add line"), search, () => this.addBlankLine(true), true);
			if (this.profile.newItem && (frappe.boot.user.can_create || []).includes("Item")) {
				this.newItemButton = button(__("New item"), search, () => this.newItem());
				node("kbd", "bnd-bill-search-key", "F4", this.newItemButton).setAttribute("aria-hidden", "true");
			}
			this.lines = node("div", coded ? "bnd-bill-lines bnd-bill-lines-coded" : "bnd-bill-lines", null, items);
			this.lineHead = node("div", "bnd-bill-line-head", null, this.lines);
			const rowHead = node("span", "bnd-bill-head-row", "#", this.lineHead);
			rowHead.setAttribute("aria-label", __("Row"));
			const fieldHeads = this.profile.lineFields.map(name => [lineLabel(this.profile, name), ""]);
			for (const [label, cls] of coded ? [
				[__("Code"), ""], [__("Item"), ""], [__("Unit"), ""], ...fieldHeads,
				[__("Before VAT"), "bnd-bill-head-money"], [__("Line VAT"), "bnd-bill-head-money"],
				[__("Total"), "bnd-bill-head-money"], [__("Delete"), ""],
			] : [
				[__("Item"), ""],
				...fieldHeads,
				...(this.profile.taxColumns
					? [[__("Line VAT"), "bnd-bill-head-money"], [__("Line total after VAT"), "bnd-bill-head-money"]]
					: [[__("Amount"), "bnd-bill-head-money"]]),
				[__("Actions"), ""],
			]) node("span", cls, label, this.lineHead);
			items.append(this.lines, search);
			this.amountSummary = node("section", "bnd-bill-amount-summary", null, items);
			this.amountSummary.setAttribute("aria-label", __("Bill total"));
			this.amountSummary.setAttribute("aria-live", "polite");
			const amountSummaryHead = node("header", "bnd-bill-amount-summary-head", null, this.amountSummary);
			node("h3", "", __("Bill total"), amountSummaryHead);
			if (coded) this.footCounts = node("p", "bnd-bill-foot-counts", null, amountSummaryHead);
			// One box (owner, 2026-10-12): ticked, the prices include VAT; clear, VAT is
			// added to them. There is no exempt choice on this screen.
			this.vatChoice = node("div", "bnd-vat-inclusive bnd-bill-draft-only", null, amountSummaryHead);
			const vatBox = node("label", "bnd-vat-inclusive-box", null, this.vatChoice);
			this.vatInclusiveInput = node("input", "", null, vatBox);
			this.vatInclusiveInput.type = "checkbox";
			this.vatInclusiveText = node("span", "", __("Price includes VAT"), vatBox);
			this.vatInclusiveInput.addEventListener("change", () =>
				this.selectVatTreatment(this.vatInclusiveInput.checked ? VAT_INCLUDED : VAT_STANDARD));
			this.vatChoiceStatus = node("small", "bnd-vat-treatment-status", __("Loading VAT choices…"), this.vatChoice);
			this.vatChoiceStatus.id = `bnd-vat-status-${++controlId}`;
			this.vatInclusiveInput.setAttribute("aria-describedby", this.vatChoiceStatus.id);
			this.vatApplyButton = button(__("Apply VAT"), this.vatChoice, () =>
				this.selectVatTreatment(this.vatInclusiveInput.checked ? VAT_INCLUDED : VAT_STANDARD));
			this.vatApplyButton.hidden = true;
			this.amountBreakdown = node("dl", coded ? "bnd-bill-amount-breakdown bnd-bill-foot" : "bnd-bill-amount-breakdown", null, this.amountSummary);
			this.amountGrand = node("div", "bnd-bill-amount-grand", null, this.amountSummary);
			this.sectionSlots.foot = node("div", "bnd-bill-sections bnd-bill-sections-foot", null, main);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				if (e.key !== "Escape" || popupWasOpen) return;
				e.preventDefault();
				if (this.partySection.classList.contains("is-open")) this.closeDetails();
				else this.fullInvoice();
			});
			this.root.addEventListener("keydown", e => this.shortcut(e, true), true);
			this.setMode(true); this.render(); this.applyDefaultTax(); this.loadVatChoices(); this.applyStockDefault(); this.applyBranchDefault();
			frappe.after_ajax(() => {
				if (this.active() && this.doc.__islocal && !this.doc[this.profile.party] &&
					!this.root.contains(document.activeElement)) this.partyControl?.set_focus();
			});
		}
		openDetails(fieldname) {
			const open = fieldname ? true : !this.partySection.classList.contains("is-open");
			this.partySection.classList.toggle("is-open", open);
			this.detailsToggle?.setAttribute("aria-expanded", String(open));
			if (!open || !fieldname) return;
			const entry = this.controls.find(control => !control.rowField && control.fieldname === fieldname);
			if (!entry) return;
			entry.control.$wrapper?.[0]?.scrollIntoView?.({ block: "nearest" });
			entry.control.set_focus?.();
		}
		closeDetails() {
			this.partySection.classList.remove("is-open");
			this.detailsToggle?.setAttribute("aria-expanded", "false");
			if (this.partySection.contains(document.activeElement)) this.detailsToggle?.focus({ preventScroll: true });
		}
		focusScan() {
			if (!this.scanInput || Number(this.doc.docstatus) !== 0) return;
			this.scanInput.focus({ preventScroll: true });
			this.scanInput.select?.();
		}
		branches() {
			// Published by Bunood Business at boot: [{ name, warehouse, company }].
			const company = this.doc.company;
			return (frappe.boot?.bnd_branches || []).filter(row =>
				row?.name && row.warehouse && (!row.company || !company || row.company === company));
		}
		warehouseStatus() {
			const df = this.frm.fields_dict.set_warehouse?.df;
			// The native Link may be hidden by its update_stock dependency; its real
			// permission and docstatus rules still decide whether it may change.
			return df ? frappe.perm.get_field_display_status({ ...df, hidden_due_to_dependency: 0 }, this.doc, this.frm.perm) : "None";
		}
		branchKey() { return `bnd-bill-branch:${this.frm.doctype}:${this.doc.company || ""}`; }
		rememberedBranch() {
			try { return window.localStorage?.getItem(this.branchKey()) || ""; } catch (_) { return ""; }
		}
		renderBranch() { this.renderContext(); }
		stockBill() {
			return frappe.boot?.bnd_business_type === "Stock" || Number(this.doc.update_stock) === 1;
		}
		chip(parent, icon, label, open = null) {
			const wrap = node("div", "bnd-bill-chip-wrap", null, parent);
			const chip = node("button", "bnd-bill-chip", null, wrap);
			chip.type = "button";
			const tile = node("span", "bnd-bill-chip-icon", null, chip);
			tile.innerHTML = frappe.utils.icon(icon, "sm");
			tile.setAttribute("aria-hidden", "true");
			const text = node("span", "bnd-bill-chip-text", null, chip);
			node("span", "bnd-bill-chip-label", label, text);
			const value = node("strong", "bnd-bill-chip-value", "", text);
			const entry = { wrap, chip, value, icon, label, open };
			if (open) {
				const caret = node("span", "bnd-bill-chip-caret", null, chip);
				caret.innerHTML = frappe.utils.icon("chevron-down", "xs");
				caret.setAttribute("aria-hidden", "true");
				chip.setAttribute("aria-haspopup", "listbox");
				chip.setAttribute("aria-expanded", "false");
				chip.addEventListener("click", () => (this.chipMenu?.entry === entry ? this.closeChipMenu(true) : open()));
			} else chip.classList.add("bnd-bill-chip-static");
			return entry;
		}
		renderContext() {
			const doc = this.doc, chips = this.chips || {};
			const draft = Number(doc.docstatus) === 0;
			const branch = this.currentBranch();
			if (chips.branch) {
				chips.branch.value.textContent = branch ? __(branch.name) : __("Choose a branch");
				chips.branch.chip.disabled = !draft || this.warehouseStatus() !== "Write";
			}
			if (chips.company) chips.company.value.textContent = doc.company || "";
			if (chips.warehouse) {
				chips.warehouse.wrap.hidden = !this.stockBill();
				chips.warehouse.value.textContent = doc.set_warehouse || __("By item");
				chips.warehouse.chip.disabled = !draft || this.warehouseStatus() !== "Write";
			}
			const settlement = this.profile.paymentMethod;
			if (chips.payment) {
				chips.payment.value.textContent = __(this.checkoutDefault()) || "—";
				chips.payment.chip.disabled = !draft || fieldStatus(this.frm, settlement) !== "Write";
			}
			if (chips.currency) chips.currency.value.textContent = doc.currency || "";
			if (chips.priceList) chips.priceList.value.textContent = __(doc[this.profile.priceList] || "") || "—";
		}
		openChipMenu(entry, items, pick) {
			this.closeChipMenu();
			const menu = node("div", "bnd-bill-chip-menu", null, entry.wrap);
			menu.id = `bnd-bill-chip-menu-${++controlId}`;
			menu.setAttribute("role", "listbox");
			menu.setAttribute("aria-label", entry.label);
			node("p", "bnd-bill-chip-menu-title", entry.label, menu).setAttribute("aria-hidden", "true");
			for (const item of items) {
				const option = button("", menu, () => { this.closeChipMenu(true); void pick(item.value); });
				option.classList.add("bnd-bill-chip-option");
				option.setAttribute("role", "option");
				option.setAttribute("aria-selected", String(!!item.current));
				const tile = node("span", "bnd-bill-chip-option-icon", null, option);
				tile.innerHTML = frappe.utils.icon(entry.icon, "sm");
				tile.setAttribute("aria-hidden", "true");
				const text = node("span", "bnd-bill-chip-option-text", null, option);
				node("strong", "", item.label, text);
				if (item.hint) node("span", "", item.hint, text);
				if (item.current) {
					const tick = node("span", "bnd-bill-chip-option-tick", null, option);
					tick.innerHTML = frappe.utils.icon("check", "sm");
					tick.setAttribute("aria-hidden", "true");
				}
			}
			if (!items.length) node("p", "bnd-bill-hint", __("Nothing to choose here."), menu);
			entry.chip.setAttribute("aria-expanded", "true");
			entry.chip.setAttribute("aria-controls", menu.id);
			menu.addEventListener("keydown", e => {
				const options = [...menu.querySelectorAll(".bnd-bill-chip-option")];
				const at = options.indexOf(document.activeElement);
				if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeChipMenu(true); }
				else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
					e.preventDefault();
					const next = options[(at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
					next?.focus();
				}
			});
			this.chipOutside = e => { if (!entry.wrap.contains(e.target)) this.closeChipMenu(); };
			document.addEventListener("pointerdown", this.chipOutside, true);
			this.chipMenu = { menu, entry };
			(menu.querySelector('[aria-selected="true"]') || menu.querySelector(".bnd-bill-chip-option"))?.focus();
		}
		closeChipMenu(focus = false) {
			if (!this.chipMenu) return;
			const { menu, entry } = this.chipMenu;
			this.chipMenu = null;
			menu.remove();
			entry.chip.setAttribute("aria-expanded", "false");
			entry.chip.removeAttribute("aria-controls");
			document.removeEventListener("pointerdown", this.chipOutside, true);
			if (focus) entry.chip.focus({ preventScroll: true });
		}
		branchMenu() {
			const current = this.currentBranch();
			this.openChipMenu(this.chips.branch, this.branches().map(row => ({
				value: row.name,
				label: __(row.name),
				hint: __("Warehouse linked automatically"),
				current: row === current,
			})), name => this.chooseBranch(name));
		}
		async warehouseMenu() {
			const company = this.doc.company;
			this.warehouses = this.warehouses || {};
			if (!this.warehouses[company]) {
				try {
					this.warehouses[company] = await frappe.db.get_list("Warehouse", {
						filters: { company, is_group: 0, disabled: 0 }, fields: ["name"], order_by: "name asc", limit: 200,
					});
				} catch (_) { this.warehouses[company] = []; }
			}
			if (!this.active()) return;
			const tied = Object.fromEntries(this.branches().map(row => [row.warehouse, row.name]));
			this.openChipMenu(this.chips.warehouse, this.warehouses[company].map(row => ({
				value: row.name,
				label: row.name,
				hint: tied[row.name] ? __(tied[row.name]) : "",
				current: row.name === this.doc.set_warehouse,
			})), name => this.chooseWarehouse(name));
		}
		async chooseWarehouse(name) {
			if (this.warehouseStatus() !== "Write" || name === this.doc.set_warehouse) return;
			// A warehouse tied to a branch takes its branch along; any other leaves the branch.
			const branch = this.branches().find(row => row.warehouse === name);
			try { await this.change(() => (branch ? this.setBranch(branch) : this.frm.set_value("set_warehouse", name))); }
			catch (_) { this.renderContext(); }
		}
		paymentMenu() {
			const field = this.profile.paymentMethod;
			const df = this.frm.fields_dict[field]?.df;
			const options = String(df?.options || "").split("\n").map(value => value.trim()).filter(Boolean);
			this.openChipMenu(this.chips.payment, options.map(value => ({
				value, label: __(value), current: value === this.checkoutDefault(),
			})), value => {
				this.settlementChosen = true;
				return this.change(() => this.frm.set_value(field, value)).catch(() => this.renderContext());
			});
		}
		itemQuery(current) {
			// The simple bill searches the items of its branch's warehouse (owner,
			// 2026-10-10): ERPNext's own item search, with the warehouse added as a
			// filter (bunood_theme.api.bill_item_query), on a bill that moves stock.
			// The Advanced form keeps ERPNext's search untouched. ERPNext's search is
			// read when the reader types, not when the line is drawn: ERPNext sets it
			// after the bill's first lines exist, and a line that read it then searched
			// every item, sales or not.
			if (this.frm.doctype !== "Sales Invoice") return current();
			return (doc, cdt, cdn) => {
				const native = current();
				const base = typeof native === "function" ? native(doc, cdt, cdn) : native;
				const warehouse = this.simple && this.stockBill() && this.currentWarehouse();
				if (!warehouse || base?.query !== "erpnext.controllers.queries.item_query") return base;
				return { ...base, query: "bunood_theme.api.bill_item_query", filters: { ...(base.filters || {}), bnd_warehouse: warehouse, bnd_company: this.doc.company } };
			};
		}
		currentBranch(branches = this.branches()) {
			const here = branches.filter(row => row.warehouse === this.doc.set_warehouse);
			return here.find(row => row.name === this.doc.branch) || here[0];
		}
		async chooseBranch(name) {
			const branch = this.branches().find(row => row.name === name);
			if (!branch || this.warehouseStatus() !== "Write") { this.renderBranch(); return; }
			try { window.localStorage?.setItem(this.branchKey(), branch.name); } catch (_) { /* per-viewer convenience only */ }
			try { await this.change(() => this.setBranch(branch)); }
			catch (_) { this.renderBranch(); }
		}
		async setBranch(branch) {
			// The branch's warehouse, and the branch itself where the invoice has the
			// field: ZATCA's branch configuration reads it.
			if (branch.warehouse !== this.doc.set_warehouse) await this.frm.set_value("set_warehouse", branch.warehouse);
			if (this.frm.fields_dict.branch && fieldStatus(this.frm, "branch") === "Write" && this.doc.branch !== branch.name)
				await this.frm.set_value("branch", branch.name);
		}
		applyBranchDefault() {
			// A new, empty draft starts in the user's last branch, or the only one, so
			// the warehouse is never a question on this screen. A draft that already
			// names a warehouse (made from an order or a delivery, say) keeps it.
			if (!this.doc.__islocal || Number(this.doc.docstatus) !== 0 || this.warehouseStatus() !== "Write") return;
			const branches = this.branches();
			if (!branches.length || this.doc.set_warehouse || (this.doc.items || []).some(row => row.item_code && row.warehouse)) return;
			const remembered = this.rememberedBranch();
			const branch = branches.find(row => row.name === remembered) || branches[0];
			this.change(() => this.setBranch(branch)).catch(() => {});
		}
		applyStockDefault() {
			// A stock business's invoice made directly moves stock (Bunood Business's
			// setup). One made from a delivery, a receipt or an order, a return and a
			// till sale are left as ERPNext makes them: their stock moves elsewhere.
			const doc = this.doc;
			if (frappe.boot?.bnd_business_type !== "Stock" || !doc.__islocal || doc.__bnd_stock_default) return;
			if (Number(doc.docstatus) !== 0 || Number(doc.update_stock) === 1 || !this.frm.fields_dict.update_stock) return;
			if (Number(doc.is_return) || doc.return_against || Number(doc.is_pos)) return;
			if ((doc.items || []).some(row => MAPPED_LINE_FIELDS.some(field => row[field]))) return;
			doc.__bnd_stock_default = 1;
			this.change(() => this.frm.set_value("update_stock", 1)).catch(() => {});
		}
		checkoutDefault() {
			// How the checkout opens (owner, 2026-10-12): Network, unless the reader chose
			// otherwise on the chip. The invoice's own field stays ERPNext's default (On
			// Credit) until a payment is recorded, so it never says paid when it was not.
			const field = this.profile.paymentMethod;
			const value = field ? this.doc[field] : "";
			return value && (value !== CREDIT_SALE || this.settlementChosen) ? value : NETWORK_PAYMENT;
		}
		renderPrintFormat(parent) {
			let formats = [];
			try { formats = frappe.meta.get_print_formats(this.frm.doctype) || []; } catch (_) { return; }
			if (!formats.length) return;
			// The organisation's default (the doctype's own default_print_format),
			// else the kit's A4 (tax first), else the first.
			const preferred = [this.frm.meta?.default_print_format, ...formats.filter(n => n.endsWith(" - A4")).sort()];
			const field = node("div", "frappe-control bnd-bill-print-format", null, parent);
			field.dataset.fieldname = "bnd_print_format";
			const label = node("label", "control-label", __("Print format"), field);
			const select = this.printFormatSelect = node("select", "form-control bnd-bill-print-select", null, field);
			select.id = label.htmlFor = `bnd-bill-print-${++controlId}`;
			for (const name of formats) node("option", "", __(name), select).value = name;
			select.value = this.printFormat = this.defaultPrintFormat = preferred.find(name => name && formats.includes(name)) || formats[0];
			select.addEventListener("change", () => { this.printFormat = select.value; this.printFormatChosen = true; });
		}
		// A progress invoice («فاتورة مستخلص», bunood_business) starts on its own format,
		// «مستخلص - فاتورة ضريبية - A4» (printing/names.py, through boot); any other bill on
		// the organisation's default. A format the reader picked stays picked.
		syncPrintFormat() {
			const select = this.printFormatSelect;
			if (!select || this.printFormatChosen) return;
			const progress = !!frappe.meta.has_field?.(this.frm.doctype, "bnd_is_progress") && !!Number(this.doc.bnd_is_progress) && !Number(this.doc.is_return);
			const own = progress ? frappe.boot?.bnd_progress_format : "";
			const target = own && [...select.options].some(option => option.value === own) ? own : this.defaultPrintFormat;
			if (target && select.value !== target) select.value = this.printFormat = target;
		}
		// What another app's section may use of the bill: its form, a native field bound as the
		// bill binds its own, a change queued with the bill's, a re-render and the status line.
		sectionHost(key) {
			this.sectionHosts = this.sectionHosts || new Map();
			if (!this.sectionHosts.has(key)) this.sectionHosts.set(key, {
				key, frm: this.frm,
				field: (parent, fieldname, label) => {
					const source = this.frm.fields_dict[fieldname];
					if (!source) return null;
					return this.bindControl(parent, label ? { df: { ...source.df, label }, get_status: () => source.get_status() } : source, this.doc);
				},
				change: action => this.change(action),
				render: () => this.render(),
				message: (text, error = false) => this.message(text, error),
			});
			return this.sectionHosts.get(key);
		}
		renderSections() {
			const sections = api.sales_bill_sections;
			if (!this.sectionSlots || !sections?.size) return;
			for (const [key, section] of sections) {
				if (section.doctype && section.doctype !== this.frm.doctype) continue;
				const slot = this.sectionSlots[section.place === "foot" ? "foot" : "head"];
				try { section.render?.(this.sectionHost(key), slot); }
				catch (error) { console.error(`sales bill section ${key}`, error); }
			}
		}
		currentWarehouse() {
			return this.doc.set_warehouse || (this.doc.items || []).find(row => row.warehouse)?.warehouse || "";
		}
		action(parent, label, key, icon, handler, primary = false) {
			const b = button("", parent, handler, primary); b.classList.add("bnd-bill-action");
			return window.bunood_theme.document_actions.decorateAction(b, { label, key, icon });
		}
		shortcut(e, local = false) {
			if (!this.simple || (!local && !this.active()) || e.target?.closest?.(".modal")) return;
			// F2 scan · F4 new item · F9 save: the cashier's three, as on the shortcut strip.
			const keys = { F2: () => this.focusScan(), F3: () => this.partyControl?.set_focus(), F4: () => this.newItemButton && this.newItem(), F7: () => this.payment(), F9: () => this.save(), F10: () => this.discountButton.click(), F11: () => this.restore() };
			const save = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
			const findItem = e.altKey && e.key.toLowerCase() === "i";
			if (!keys[e.key] && !save && !findItem) return;
			e.preventDefault(); e.stopImmediatePropagation();
			if (save) this.save(); else if (findItem) {
				const focus = () => setTimeout(() => frappe.after_ajax().then(() => {
					const workbench = instances.get(window.cur_frm);
					if (workbench?.active()) workbench.focusItemEntry();
				}), 0);
				const settle = () => {
					document.activeElement?.blur?.();
					setTimeout(() => { if (this.queue.count) this.queue.tail.then(focus); else focus(); }, 0);
				};
				if (this.queue.count) this.queue.tail.then(settle); else settle();
			} else keys[e.key]();
		}
		setMode(simple) {
			this.simple = simple; this.root.hidden = !simple; if (this.native) this.native.hidden = simple;
			this.host?.closest(".page-container")?.classList.add("bnd-bill-native-ready");
			this.frm.$wrapper?.toggleClass("bnd-bill-simple-active", simple);
			window.bunood_theme?.[simple ? "claim_native" : "release_native"]?.("salesbill");
			this.placeMode(simple);
			this.simpleButton?.classList.toggle("bnd-bill-primary", simple);
			this.advancedButton?.classList.toggle("bnd-bill-primary", !simple);
			this.simpleButton?.setAttribute("aria-pressed", String(simple));
			this.advancedButton?.setAttribute("aria-pressed", String(!simple));
			this.simpleButton?.setAttribute("aria-current", simple ? "page" : "false");
			this.advancedButton?.setAttribute("aria-current", simple ? "false" : "page");
			this.syncSelectionGuard();
		}
		placeMode(simple) {
			if (!this.mode || !this.root) return;
			this.mode.parentElement?.classList?.remove("bnd-bill-mode-row");
			const tabs = !simple && this.native?.querySelector?.(".form-tabs-list");
			if (tabs) {
				tabs.classList.add("bnd-bill-mode-row");
				this.mode.dataset.bndInline = "true";
				tabs.append(this.mode);
			} else if (simple && this.modeSlot) {
				delete this.mode.dataset.bndInline;
				this.modeSlot.append(this.mode);
			} else {
				delete this.mode.dataset.bndInline;
				this.root.before(this.mode);
			}
		}
		syncSelectionGuard() {
			const layout = this.frm.layout, key = "is_numeric_field_active", binding = this.selectionGuard;
			if (binding) {
				if (binding.layout === layout && this.simple && !this.closed) return;
				if (binding.layout[key] === binding.guard) {
					if (binding.descriptor) Object.defineProperty(binding.layout, key, binding.descriptor);
					else delete binding.layout[key];
				} else (this.selectionBlocked ||= new WeakSet()).add(binding.layout);
				this.selectionGuard = null;
			}
			if (!layout || !this.simple || this.closed || this.selectionBlocked?.has(layout)) return;
			const original = layout[key], descriptor = Object.getOwnPropertyDescriptor(layout, key);
			if (typeof original !== "function" || (descriptor ? !descriptor.writable : !Object.isExtensible(layout))) return;
			const workbench = this;
			function guard(...args) {
				// Exclude owned inputs from Layout.refresh's global selection.
				const input = document.activeElement;
				if (this === layout && layout[key] === guard && workbench.frm.layout === layout && workbench.simple && workbench.active()
					&& workbench.root?.isConnected && !workbench.root.hidden && workbench.root.contains(input)
					&& workbench.controls.some(c => c.control.$input?.[0] === input && (c.doc === workbench.doc || workbench.doc.items?.includes(c.doc)))) return false;
				return original.apply(this, args);
			}
			Object.defineProperty(layout, key, descriptor ? { ...descriptor, value: guard } : { value: guard, configurable: true, writable: true });
			this.selectionGuard = { layout, guard, descriptor };
		}
		closeDetachedAutocomplete() {
			if (!this.active() || !this.simple) return false;
			const input = document.activeElement;
			if (!input || !this.root.contains(input) || input.getAttribute("role") !== "combobox" ||
				input.getAttribute("aria-expanded") !== "true") return false;
			const list = document.getElementById(input.getAttribute("aria-owns"));
			const inputBox = input.getBoundingClientRect(), hostBox = this.scrollHost?.getBoundingClientRect?.();
			if (!list || list.hidden || !hostBox) return false;
			const visible = inputBox.top >= hostBox.top && inputBox.bottom <= hostBox.bottom &&
				inputBox.left >= hostBox.left && inputBox.right <= hostBox.right;
			if (visible) return false;
			// Let native Awesomplete close the menu and restore its ARIA state.
			input.blur();
			return true;
		}
		dispose() {
			if (this.closed) return;
			this.closed = true;
			this.closeChipMenu();
			this.scrollHost?.removeEventListener("scroll", this.handleBillScroll);
			if (instances.get(this.frm) === this) this.setMode(false); else this.syncSelectionGuard();
			for (const timer of this.editTimers.values()) clearTimeout(timer);
			this.editTimers.clear(); this.pending.clear(); this.invalid.clear();
			this.root.remove(); this.mode.parentElement?.classList?.remove("bnd-bill-mode-row"); this.mode.remove();
			if (instances.get(this.frm) === this) instances.delete(this.frm);
		}
		syncDocument() {
			if (this.closed) return false;
			if (this.doc === this.frm.doc && this.docname === this.frm.doc.name) return true;
			// Controls close over a document. Never relabel old bindings as new.
			this.dispose();
			if (window.cur_frm === this.frm && supports(this.frm)) open(this.frm);
			return false;
		}
		show() { if (this.syncDocument()) { this.setMode(true); this.render(); } }
		active() { return !this.closed && window.cur_frm === this.frm && this.frm.doc === this.doc && this.docname === this.doc.name && supports(this.frm); }
		busy() {
			const locked = !!this.saving || !!this.closing || !!this.flushing;
			const busy = !!this.queue.count || locked;
			// Recalculation preserves focus; commit/mode transitions lock inputs.
			if (this.editor) this.editor.disabled = locked;
			if (this.addLineButton) this.addLineButton.disabled = busy || !canAdd(this.frm);
			for (const action of [this.saveButton, this.submitButton, this.submitPrintButton, this.sendButton, this.newButton, this.advancedButton, this.scanButton, this.newPartyButton]) if (action) action.disabled = busy;
			if (this.scanInput) this.scanInput.disabled = locked;
			if (this.vatInclusiveInput) this.vatInclusiveInput.disabled = busy || !this.vatChoiceReady();
			for (const { remove, duplicate } of this.rowViews.values()) {
				if (remove) remove.disabled = busy;
				if (duplicate) duplicate.disabled = busy;
			}
			this.root?.setAttribute("aria-busy", String(busy));
		}
		message(text, error = false, action = null) {
			const visible = text === __("Changes stay in this invoice when you close this view.") ? "" : text;
			this.status.replaceChildren(document.createTextNode(visible));
			this.status.classList.toggle("bnd-bill-error", error);
			this.status.setAttribute("role", error ? "alert" : "status");
			if (action) {
				const control = button(action.label, this.status, action.run);
				control.classList.add("bnd-bill-status-action");
			}
		}
		showTaxIssue(issue) {
			this.message(taxIssueMessage(issue), true, {
				label: __("Review tax rows in Advanced"),
				run: () => this.openTaxIssue(issue),
			});
		}
		openTaxIssue(issue) {
			this.setMode(false);
			setTimeout(() => {
				if (!issue.row) {
					this.frm.fields_dict.taxes_and_charges?.set_focus?.();
					this.frm.fields_dict.taxes_and_charges?.$wrapper?.[0]?.scrollIntoView({ block: "center" });
					return;
				}
				const field = this.frm.fields_dict.taxes;
				const gridRow = field?.grid?.grid_rows?.find(row => Number(row.doc?.idx) === Number(issue.row));
				gridRow?.toggle_view?.(true);
				setTimeout(() => {
					const rate = gridRow?.grid_form?.fields_dict?.rate;
					if (rate?.set_focus) rate.set_focus();
					else {
						const target = field?.$wrapper?.[0];
						if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
					}
					field?.$wrapper?.[0]?.scrollIntoView({ block: "center" });
				}, 0);
			}, 0);
		}
		async change(action) {
			this.message(__("Updating invoice…"));
			try { await this.queue.run(action); if (this.active()) { if (!this.flushing) {
				const focus = document.activeElement;
				this.render();
				if (this.root?.contains?.(focus) && focus?.isConnected && document.activeElement !== focus) focus.focus({ preventScroll: true });
			} this.message(__("Changes stay in this invoice when you close this view.")); } }
			catch (e) { this.message(e.message || __("Could not update the invoice. Open the full invoice to review."), true); throw e; }
		}
		renderControl(control, key, refresh = false) {
			const invalid = this.invalid.get(key);
			const wrapper = control.$wrapper[0];
			let input = control.$input?.[0], error = wrapper.querySelector(".bnd-bill-field-error");
			if (error && input) {
				if (error.nativeInvalid == null) input.removeAttribute("aria-invalid"); else input.setAttribute("aria-invalid", error.nativeInvalid);
			}
			const editing = input === document.activeElement && (invalid || this.pending.has(key) || control.get_value() === control.get_model_value());
			if (refresh && !editing) {
				control.refresh();
				if (control.get_status() === "Write") {
					if (invalid) control.set_input(invalid.raw);
					if (this.pending.has(key)) control.set_input(this.pending.get(key));
				}
			}
			input = control.$input?.[0];
			if (!input) return;
			const described = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== error?.id);
			const visible = !!invalid && control.get_status() === "Write";
			if (visible) {
				if (!error) { error = node("p", "bnd-bill-field-error bnd-bill-error", null, wrapper); error.id = `bnd-bill-error-${++errorId}`; }
				error.nativeInvalid = input.getAttribute("aria-invalid");
				input.setAttribute("aria-invalid", "true");
				error.textContent = invalid.message;
				described.push(error.id);
			} else error?.remove();
			if (described.length) input.setAttribute("aria-describedby", described.join(" ")); else input.removeAttribute("aria-describedby");
			wrapper.classList.toggle("bnd-bill-invalid", visible);
		}
		priceStatus(row) {
			// ERPNext locks a line's price unless Selling Settings let it be edited. This
			// screen types the price first and works the rest from it, so it opens the
			// price under the same permission and document-state rules; the price after
			// discount was always editable, so no one gains a power they lacked.
			if (!this.profile?.priceFirst) return rowFieldStatus(this.frm, row, "price_list_rate");
			const grid = this.frm.fields_dict.items.grid;
			if (!grid.is_editable()) return "Read";
			const df = frappe.meta.get_docfield(row.doctype, "price_list_rate", row.name) || grid.get_docfield("price_list_rate");
			return df ? frappe.perm.get_field_display_status({ ...df, read_only: 0 }, row, this.frm.perm) : "None";
		}
		lineStatus(row, name) {
			if (!this.profile?.priceFirst || !["price_list_rate", "rate"].includes(name)) return undefined;
			if (name === "price_list_rate") return () => this.priceStatus(row);
			// The price after discount follows the price whenever the price can be typed.
			return () => {
				const own = rowFieldStatus(this.frm, row, "rate");
				return own === "Write" && this.priceStatus(row) === "Write" ? "Read" : own;
			};
		}
		bindControl(parent, source, doc, rowField, statusOverride) {
			const frm = this.frm, name = source.df.fieldname;
			const allowed = () => statusOverride ? statusOverride() : rowField
				? (frm.fields_dict.items.grid.is_editable() ? frappe.perm.get_field_display_status(source.df, doc, frm.perm) : "Read")
				: source.get_status();
			if (allowed() === "None") return;
			const control = frappe.ui.form.make_control({ parent, render_input: true, frm,
				doctype: doc.doctype || frm.doctype, docname: doc.name, doc,
				df: { ...source.df, get_status: allowed },
			});
			// Child-table Link queries live on grid.fieldinfo, not on the DocField.
			// Forward that configured query when the spreadsheet creates its own
			// control; otherwise Warehouse renders correctly but returns no choices.
			const sourceQuery = source.get_query || source.df?.get_query;
			if (typeof sourceQuery === "function") control.get_query = sourceQuery;
			const nativeSet = control.set_model_value.bind(control);
			const key = `${doc.name}:${name}`;
			const nativeValidate = control.validate_and_set_in_model.bind(control);
			control.validate_and_set_in_model = (value, ...args) => {
				if (value === doc[name]) {
					this.invalid.delete(key); this.pending.delete(key); this.renderControl(control, key);
					this.revertButton.hidden = !this.invalid.size;
					if (!this.invalid.size) this.message(__("Changes stay in this invoice when you close this view."));
				}
				return nativeValidate(value, ...args);
			};
			control.set_model_value = value => {
				const raw = control.$input?.val();
				let completedItem = false, merged = false;
				this.pending.set(key, raw);
				return this.change(async () => {
				if (this.pending.get(key) !== raw) return;
					if (allowed() !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
					if (rowField && !frm.doc.items.some(r => r.name === doc.name)) throw Error(__("This item is no longer on the invoice."));
					await setLineValue(doc, name, value, nativeSet, () => this.priceStatus(doc));
					if (rowField && name === "item_code" && doc.item_code === value) {
						await frappe.after_ajax();
						completedItem = !!doc.item_code;
						merged = !!await this.mergeDuplicateItem(doc);
						if (merged) { this.pending.delete(key); return; }
					}
					if (this.pending.get(key) !== raw) return;
					this.invalid.delete(key);
					this.renderControl(control, key);
					if (this.pending.get(key) === raw) this.pending.delete(key);
				}).then(() => {
					// A completed selection owns the ready-row transition. Keeping this
					// outside `change()` avoids waiting on the queue from inside itself.
					if ((completedItem || merged) && this.active()) return this.ensureEntryRow();
				}).catch(e => {
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) { this.forgetRow(doc.name); return; }
				if (this.pending.get(key) !== raw) return;
				this.invalid.set(key, { raw, message: e.message || __("Could not update the invoice. Open the full invoice to review.") });
				this.renderControl(control, key); this.revertButton.hidden = false;
			});
			};
			control.$input?.on("input.bnd-bill", () => {
				this.pending.set(key, control.$input.val());
				if (rowField && !["Link", "Dynamic Link"].includes(control.df.fieldtype)) {
					clearTimeout(this.editTimers.get(key));
					this.editTimers.set(key, setTimeout(() => {
						this.editTimers.delete(key);
						if (this.active() && this.pending.has(key)) control.set_value(control.get_value()).catch(e => this.message(e.message, true));
					}, 400));
				}
			});
			if (rowField) {
				const inputElement = control.$input?.[0];
				inputElement?.addEventListener?.("keydown", e => {
					if (e.key !== "Enter" || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
					if (control.$wrapper.find(".awesomplete > ul:not([hidden])").length) return;
					e.preventDefault();
					e.stopImmediatePropagation();
					Promise.resolve()
						.then(() => control.set_value(control.get_value()))
						.then(() => { if (!this.invalid.has(key) && document.activeElement === inputElement) this.focusNextLineControl(control); })
						.catch(error => this.message(error.message, true));
				}, true);
				if (["Link", "Dynamic Link"].includes(control.df.fieldtype)) {
					control.$input?.on("awesomplete-selectcomplete.bnd-bill-nav", () => {
						frappe.after_ajax(() => {
							if (this.active() && !this.invalid.has(key) &&
								document.activeElement === inputElement) this.focusNextLineControl(control);
						});
					});
				}
			}
			control.$input?.attr("aria-label", rowField ? `${__(source.df.label)} · ${doc.item_code || __("New line")}` : __(source.df.label));
			if (this.invalid.has(key)) {
				this.renderControl(control, key, true);
			}
			this.controls.push({ control, rowField, key, doc, fieldname: name }); return control;
		}
		entryControl() {
			const rows = this.frm.doc.items || [];
			const row = rows.find(item => !item.item_code) || rows[rows.length - 1];
			return (this.controls || []).find(entry => entry.rowField && entry.doc === row && entry.fieldname === "item_code");
		}
		focusItemEntry() {
			const entry = this.entryControl();
			if (entry) { this.setExpandedLine(entry.doc.name); entry.control.set_focus(); return; }
			this.ensureEntryRow(true);
		}
		focusNextLineControl(control) {
			const editable = this.controls.filter(entry =>
				entry.rowField && entry.control.get_status() === "Write");
			const index = editable.findIndex(entry => entry.control === control);
			const next = index >= 0 ? editable[index + 1] : null;
			if (!next) { this.ensureEntryRow(true); return; }
			this.setExpandedLine(next.doc.name);
			next.control.set_focus();
		}
		async addBlankLine(focus = false) {
			if (this.saving) return;
			if (this.queue.count) await this.queue.tail;
			if (!this.active()) return;
			const existingBlank = (this.frm.doc.items || []).find(row => !row.item_code);
			if (existingBlank) {
				this.setExpandedLine(existingBlank.name);
				const entry = this.controls.find(control => control.doc === existingBlank && control.fieldname === "item_code");
				if (focus) entry?.control.set_focus();
				this.message(__("Choose an item from the search results."));
				return existingBlank;
			}
			let addedRow;
			try {
				await this.change(async () => {
					if (!canAdd(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
					const row = this.frm.add_child("items");
					await this.frm.script_manager.trigger("items_add", row.doctype, row.name);
					this.frm.refresh_field("items");
					this.mobileExpanded = row.name;
					addedRow = row;
				});
				const newLineControl = this.controls.find(entry => entry.doc === addedRow && entry.fieldname === "item_code");
				if (focus) newLineControl?.control.set_focus();
			} catch (_) { /* Native error and inline status retain the draft. */ }
		}
		ensureEntryRow(focus = false) {
			if (!this.active() || Number(this.doc.docstatus) !== 0 || !canAdd(this.frm)) return Promise.resolve();
			const rows = this.frm.doc.items || [];
			const blank = rows.length && !rows[rows.length - 1].item_code ? rows[rows.length - 1] : null;
			if (blank) {
				if (focus) frappe.after_ajax(() => this.focusItemEntry());
				return Promise.resolve(blank);
			}
			if (!this.entryRowPromise) this.entryRowPromise = this.addBlankLine(focus).finally(() => { this.entryRowPromise = null; });
			return this.entryRowPromise;
		}
		async applyDefaultTax() {
			const frm = this.frm, doc = frm.doc;
			const key = `${doc.name || "new"}:${doc.company || ""}`;
			if (this.defaultTaxKey === key || !doc.__islocal || Number(doc.docstatus) !== 0 || !doc.company || hasTaxConfiguration(doc)) return;
			this.defaultTaxKey = key;
			const doctype = frm.doctype === "Purchase Invoice"
				? "Purchase Taxes and Charges Template"
				: "Sales Taxes and Charges Template";
			try {
				const response = await frappe.db.get_value(doctype, { company: doc.company, is_default: 1 }, "name");
				const name = response?.message?.name;
				if (!name || !this.active() || hasTaxConfiguration(frm.doc)) return;
				await this.change(() => frm.set_value("taxes_and_charges", name));
			} catch (_) { /* Native validation owns the save/submit decision. */ }
		}
		async loadVatChoices() {
			const key = vatProfileKey(this.frm);
			if (this.vatProfilesKey === key && (this.vatProfiles || this.vatProfilesLoading)) return;
			if (this.vatProfilesKey !== key) this.vatProfilesRetried = false;
			this.vatProfilesKey = key;
			this.vatProfiles = null;
			this.vatProfilesError = false;
			this.vatProfilesLoading = true;
			this.renderVatTreatment();
			try {
				const profiles = await loadVatProfiles(this.frm);
				if (this.vatProfilesKey === key) this.vatProfiles = profiles;
			} catch (_) {
				if (this.vatProfilesKey === key) this.vatProfilesError = true;
			} finally {
				if (this.vatProfilesKey === key) {
					this.vatProfilesLoading = false;
					if (this.active()) this.renderVatTreatment();
				}
			}
		}
		async selectVatTreatment(treatment) {
			if (this.vatProfilesLoading || this.saving || this.queue.count) return;
			if (!vatPartyReady(this.frm)) {
				this.message(vatPartyPrompt(this.frm), true);
				this.partyControl?.set_focus();
				return;
			}
			try {
				await this.change(() => applyVatTreatment(this.frm, treatment, this.vatProfiles));
			} catch (_) { /* change() keeps the error visible beside the invoice. */ }
		}
		renderVatTreatment() {
			if (!this.vatChoice) return;
			const keyChanged = this.vatProfilesKey !== vatProfileKey(this.frm);
			const retry = !this.vatProfiles && !this.vatProfilesLoading &&
				(!this.vatProfilesError || (vatPartyReady(this.frm) && !this.vatProfilesRetried));
			if (keyChanged || retry) {
				if (this.vatProfilesError) this.vatProfilesRetried = true;
				void this.loadVatChoices();
			}
			const treatment = vatTreatment(this.doc, this.vatProfiles);
			const standardRate = Number(this.vatProfiles?.standard?.rate);
			this.vatInclusiveText.textContent = Number.isFinite(standardRate) && standardRate > 0
				? __("Price includes VAT ({0}%)", [standardRate]) : __("Price includes VAT");
			this.vatInclusiveInput.checked = treatment === VAT_INCLUDED;
			this.vatInclusiveInput.disabled = !!this.queue.count || !!this.saving || !this.vatChoiceReady();
			this.vatChoiceStatus.textContent = !vatPartyReady(this.frm)
				? vatPartyPrompt(this.frm)
				: this.vatProfilesLoading
				? __("Loading VAT choices…")
				: this.vatProfilesError || !this.vatProfiles?.standard
					? __("VAT setup is incomplete. Configure a standard tax rule, or use Advanced.")
					: treatment === VAT_EXEMPT || !treatment
						? __("This invoice has no VAT yet.")
						: "";
			this.vatChoiceStatus.hidden = !this.vatChoiceStatus.textContent;
			// An invoice drafted without VAT (an older draft, or Advanced) gets it
			// back here: the box then says how the prices read.
			this.vatApplyButton.hidden = !(this.vatChoiceReady() && (treatment === VAT_EXEMPT || !treatment));
			this.vatApplyButton.disabled = !!this.queue.count || !!this.saving;
		}
		vatChoiceReady() {
			return Number(this.doc.docstatus) === 0 && vatPartyReady(this.frm) && !this.vatProfilesLoading && !!this.vatProfiles?.standard;
		}
		removeItem(row) {
			if (this.queue.count || this.saving) return;
			if (!row.item_code) { this.deleteItem(row); return; }
			const label = row.item_name || row.item_code || __("this item");
			frappe.confirm(
				__("Remove this item from the invoice? Item: {0}", [label]),
				() => this.deleteItem(row),
			);
		}
		async deleteItem(row) {
			if (this.queue.count || this.saving) return;
			try {
				await this.change(async () => {
					await this.removeNativeRow(row);
				});
			} catch (_) { /* Keep the native row when hooks refuse removal. */ }
		}
		async pruneBlankRows() {
			const blankRows = [...(this.frm.doc.items || [])].filter(row => !row.item_code);
			for (const row of blankRows) await this.removeNativeRow(row);
			if (blankRows.length) { this.frm.refresh_field("items"); this.render(); }
			return blankRows.length;
		}
		async removeNativeRow(row) {
			const native = this.frm.fields_dict.items.grid.grid_rows_by_docname[row.name];
			if (!native || !canRemove(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
			native.remove();
			await new Promise((resolve, reject) => {
				let attempts = 0;
				const check = () => {
					if (!this.frm.doc.items.some(item => item.name === row.name)) return resolve();
					if (++attempts > 100 || !this.active()) return reject(Error(__("The item was not removed. Review the full invoice.")));
					setTimeout(check, 100);
				}; check();
			});
			this.forgetRow(row.name);
		}
		async mergeDuplicateItem(row) {
			const target = (this.frm.doc.items || []).find(item => item !== row && mergeableItemLines(item, row));
			const added = Number(row.qty || 1), current = Number(target?.qty);
			if (!target || !Number.isFinite(added) || added <= 0 || !Number.isFinite(current) || current <= 0 ||
				rowFieldStatus(this.frm, target, "qty") !== "Write" || !canRemove(this.frm)) return null;
			await frappe.model.set_value(target.doctype, target.name, "qty", current + added);
			try { await this.removeNativeRow(row); }
			catch (error) { await frappe.model.set_value(target.doctype, target.name, "qty", current); throw error; }
			this.mobileExpanded = target.name;
			this.frm.refresh_field("items");
			return target;
		}
		forgetRow(name) {
			for (const map of [this.invalid, this.pending, this.editTimers]) for (const key of map.keys()) {
				if (!key.startsWith(`${name}:`)) continue;
				if (map === this.editTimers) clearTimeout(map.get(key));
				map.delete(key);
			}
			if (this.mobileExpanded === name) this.mobileExpanded = "";
		}
		newParty() {
			if (this.saving || this.closing || this.queue.count || fieldStatus(this.frm, this.profile.party) !== "Write" || !(frappe.boot.user.can_create || []).includes(this.profile.partyDoctype)) return;
			frappe.ui.form.make_quick_entry(this.profile.partyDoctype, doc => {
				if (this.active()) this.change(() => {
					if (fieldStatus(this.frm, this.profile.party) !== "Write") throw Error(__("This field is not editable. Use the advanced form."));
					return this.frm.set_value(this.profile.party, doc.name);
				}).catch(() => {});
			}, entry => this.addPartyTaxField(entry), null, true);
		}
		addPartyTaxField(entry) {
			if (!entry?.add_fields || entry.fields_dict?.tax_id) return;
			const df = frappe.meta.get_docfield(this.profile.partyDoctype, "tax_id");
			if (!df || df.hidden || df.read_only || frappe.perm.get_field_display_status(df, entry.doc, frappe.perm.get_perm(this.profile.partyDoctype)) !== "Write") return;
			entry.add_fields([{ ...df, label: __("Tax ID") }]);
		}
		async newItem(prefill = {}) {
			if (!this.profile?.newItem || Number(this.doc.docstatus) !== 0 || this.itemDialog) return;
			if (!(frappe.boot.user.can_create || []).includes("Item")) {
				this.message(__("You do not have permission to create an item."), true);
				return;
			}
			let defaults = {};
			try {
				const response = await frappe.call({ method: "bunood_theme.api.bill_item_defaults", type: "GET", args: { company: this.doc.company || "" } });
				defaults = response.message || {};
			} catch (_) { /* The dialog still works with the site's defaults. */ }
			if (!this.active()) return;
			const groups = defaults.item_groups || [];
			const stockItem = Number(defaults.is_stock_item ?? 1) === 1;
			const dialog = this.itemDialog = new frappe.ui.Dialog({
				title: __("New item"),
				fields: [
					// No code to type (owner, 2026-10-12): the next number, as Bunood Business's
					// Item.before_insert gives one; a code scanned into the bill still goes with it.
					{ fieldname: "item_code", fieldtype: "Data", label: __("Item code"), hidden: 1, default: prefill.item_code || defaults.next_code || "" },
					{ fieldname: "item_name", fieldtype: "Data", label: __("Item name"), reqd: 1, placeholder: __("For example: a can of juice") },
					{ fieldtype: "Section Break", hide_border: 1 },
					{ fieldname: "barcode", fieldtype: "Data", label: __("Barcode"), default: prefill.barcode || "" },
					{ fieldtype: "Column Break" },
					groups.length
						? { fieldname: "item_group", fieldtype: "Select", label: __("Item group"), reqd: 1, options: groups, default: defaults.item_group || groups[0] }
						: { fieldname: "item_group", fieldtype: "Link", options: "Item Group", label: __("Item group"), reqd: 1, default: defaults.item_group || "" },
					{ fieldtype: "Column Break" },
					{ fieldname: "stock_uom", fieldtype: "Link", options: "UOM", label: __("Unit of measure"), reqd: 1, default: defaults.stock_uom || "" },
					{ fieldtype: "Section Break", hide_border: 1 },
					{ fieldname: "buying_rate", fieldtype: "Currency", label: __("Purchase price"), default: 0, non_negative: 1 },
					{ fieldtype: "Column Break" },
					{ fieldname: "selling_rate", fieldtype: "Currency", label: __("Selling price"), default: 0, non_negative: 1 },
					{ fieldtype: "Column Break" },
					{ fieldname: "qty", fieldtype: "Float", label: __("Quantity"), default: 0, non_negative: 1 },
					{ fieldtype: "Section Break", hide_border: 1 },
					{ fieldname: "note", fieldtype: "HTML" },
				],
				primary_action_label: __("Save and add to invoice"),
				primary_action: values => void this.saveQuickItem(values, dialog, stockItem, defaults),
				secondary_action_label: __("Cancel"),
				secondary_action: () => dialog.hide(),
				onhide: () => { if (this.itemDialog === dialog) this.itemDialog = null; if (this.active()) this.focusScan(); },
			});
			dialog.$wrapper?.addClass("bnd-item-quick-entry");
			const note = dialog.fields_dict.note?.$wrapper?.[0];
			if (note) node("p", "bnd-bill-hint", __("Prices and quantity are optional: leave them at 0 if you do not need them. The quantity and the purchase price go on this bill."), note);
			// Enter walks the fields in order and saves from the last one, so a
			// cashier never needs the mouse; an open suggestion list keeps Enter.
			dialog.$wrapper?.[0]?.addEventListener("keydown", e => {
				if (e.key !== "Enter" || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
				const target = e.target;
				if (!target?.matches?.("input, select") || target.closest(".awesomplete")?.querySelector("ul:not([hidden])")) return;
				const inputs = [...dialog.$wrapper[0].querySelectorAll(".modal-body :is(input, select)")]
					.filter(input => !input.disabled && input.type !== "hidden" && input.getClientRects().length);
				const index = inputs.indexOf(target);
				if (index < 0) return;
				e.preventDefault(); e.stopPropagation();
				if (index < inputs.length - 1) { inputs[index + 1].focus(); inputs[index + 1].select?.(); }
				else dialog.get_primary_btn().trigger("click");
			}, true);
			dialog.show();
			setTimeout(() => dialog.fields_dict.item_name?.set_focus?.(), 200);
		}
		async saveQuickItem(values, dialog, stockItem, defaults) {
			if (this.savingItem) return;
			const number = value => Number(value || 0);
			const buying = number(values.buying_rate), selling = number(values.selling_rate), qty = number(values.qty);
			if (![buying, selling, qty].every(value => Number.isFinite(value) && value >= 0)) {
				frappe.msgprint(__("Use zero or more for the prices and the quantity."));
				return;
			}
			const company = this.doc.company, warehouse = this.currentWarehouse();
			const uom = values.stock_uom;
			const sellingList = defaults.selling_price_list;
			const buyingList = this.doc.buying_price_list || defaults.buying_price_list;
			const code = String(values.item_code || "").trim();
			const barcode = String(values.barcode || "").trim();
			// Native Item fields only. The prices go to their lists afterwards, each on its
			// own: a reader without the Item Price right still gets the item (ERPNext's
			// standard_rate would abort the whole insert). The stock arrives through this
			// bill's own line when it is submitted, so no opening stock is recorded twice.
			const doc = {
				doctype: "Item",
				...(code ? { item_code: code } : {}),
				item_name: String(values.item_name || "").trim(),
				item_group: values.item_group,
				stock_uom: uom,
				is_stock_item: stockItem ? 1 : 0,
				...(buying > 0 ? { valuation_rate: buying } : {}),
				barcodes: barcode ? [{ barcode, uom }] : [],
				item_defaults: company ? [{ company, ...(warehouse ? { default_warehouse: warehouse } : {}), ...(sellingList ? { default_price_list: sellingList } : {}) }] : [],
			};
			this.savingItem = true;
			dialog.disable_primary_action();
			let item;
			try {
				const response = await frappe.call({ method: "frappe.client.insert", args: { doc }, freeze: true, freeze_message: __("Saving item…") });
				item = response.message;
			} catch (_) { /* Frappe shows the server's reason; the dialog keeps the values. */ }
			finally { this.savingItem = false; dialog.enable_primary_action(); }
			if (!item?.name) return;
			for (const [rate, list, failed] of [
				[buying, buyingList, __("The item was saved, but its purchase price was not added to the price list.")],
				[selling, sellingList, __("The item was saved, but its selling price was not added to the price list.")],
			]) {
				if (!(rate > 0 && list)) continue;
				try {
					await frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "Item Price", item_code: item.name, price_list: list, price_list_rate: rate, uom } } });
				} catch (_) {
					frappe.show_alert({ message: failed, indicator: "orange" });
				}
			}
			dialog.hide();
			frappe.show_alert({ message: __("Item saved: {0}", [item.item_name || item.name]), indicator: "green" });
			await this.addItemToInvoice(item.name, { qty, rate: buying });
		}
		async addItemToInvoice(itemCode, { qty = 0, rate = 0 } = {}) {
			if (!this.active() || !itemCode) return;
			await this.ensureEntryRow();
			const entry = this.entryControl();
			try {
				if (entry && !entry.doc.item_code) await entry.control.set_value(itemCode);
				else await this.change(() => this.addScanned({ item_code: itemCode }));
				// The line carries what was typed in the dialog: its quantity and cost.
				const row = (this.frm.doc.items || []).filter(item => item.item_code === itemCode).at(-1);
				if (row && (qty > 0 || rate > 0)) await this.change(async () => {
					if (qty > 0 && Number(row.qty) !== qty) await frappe.model.set_value(row.doctype, row.name, "qty", qty);
					if (rate > 0 && Number(row.rate) !== rate) await frappe.model.set_value(row.doctype, row.name, "rate", rate);
				});
			} catch (error) { this.message(error?.message || __("Could not add the item to the invoice."), true); }
			if (this.active()) this.focusScan();
		}
		async scanCode(raw) {
			const value = String(raw || "").trim();
			if (!value || !this.active() || Number(this.doc.docstatus) !== 0 || this.saving || this.closing) return;
			this.scanInput.value = "";
			let data = {};
			try {
				const response = await frappe.call({
					method: "erpnext.stock.utils.scan_barcode",
					args: { search_value: value, ctx: { set_warehouse: this.doc.set_warehouse, company: this.doc.company } },
				});
				data = response.message || {};
				if (!data.item_code) {
					// No barcode, serial or batch: an item code typed by hand.
					const found = (await frappe.db.get_value("Item", { name: value, disabled: 0 }, ["name", "has_batch_no", "has_serial_no"]))?.message;
					if (found?.name) data = { item_code: found.name, has_batch_no: found.has_batch_no, has_serial_no: found.has_serial_no };
				}
			} catch (_) { data = {}; }
			if (!this.active()) return;
			if (!data.item_code) { this.scanNotFound(value); return; }
			try {
				await this.change(() => this.addScanned(data));
				await this.ensureEntryRow();
				this.message("");
			} catch (error) { this.message(error?.message || __("Could not add the item to the invoice."), true); }
			if (this.active()) this.focusScan();
		}
		addScanned(data) {
			const Scanner = window.erpnext?.utils?.BarcodeScanner;
			if (Scanner) {
				const scanner = new Scanner({ frm: this.frm });
				// The scan box is ours; the scanner only places the item on the lines.
				scanner.scan_barcode_field = { value: "", set_value: () => Promise.resolve() };
				// ERPNext marks a saved invoice has_items and then routes every scan through a
				// confirmation dialog whose promise this screen never sees settle; the box
				// would freeze after the first save. The scan only places or raises a line.
				this.frm.has_items = false;
				return scanner.update_table(data);
			}
			const entry = this.entryControl();
			if (!entry || entry.doc.item_code) throw Error(__("Add a line first, then scan again."));
			return entry.control.set_value(data.item_code);
		}
		scanNotFound(value) {
			const canCreate = !!this.profile?.newItem && (frappe.boot.user.can_create || []).includes("Item");
			this.message(__("No item has the code or barcode {0}.", [value]), true, canCreate ? {
				label: __("Add it as a new item"),
				run: () => this.newItem({ barcode: value }),
			} : null);
			this.focusScan();
		}
		format(value, df, doc = this.doc) {
			// Native precision/currency formatting; HTML stripped before display.
			return new DOMParser().parseFromString(frappe.format(value, df, { inline: true }, doc), "text/html").body.textContent || "";
		}
		money(parent, value, df, doc = this.doc) {
			const wrap = node("span", "bnd-bill-money", null, parent);
			const currency = doc?.currency || this.doc.currency;
			if (currency === "SAR") {
				const symbol = node("span", "bnd-bill-riyal", "", wrap); symbol.setAttribute("aria-label", __("Saudi riyal"));
				node("bdi", "", window.format_number(value, window.get_number_format(currency), frappe.meta.get_field_precision(df, doc)), wrap);
			} else node("bdi", "", this.format(value, df, doc), wrap);
			return wrap;
		}
		renderCode(view, row, ready) {
			// The ready row carries the code box; a line with an item shows its code.
			if (ready) {
				if (this.scanInput.parentElement !== view.code) view.code.replaceChildren(this.scanInput);
				return;
			}
			const text = row.item_code || "";
			if (view.code.contains(this.scanInput) || view.code.textContent !== text) {
				const value = node("bdi", "bnd-bill-code-text", text);
				view.code.replaceChildren(value);
			}
		}
		loadUoms(codes) {
			// The units each item sells in (its UOM conversions), asked once per item.
			this.uoms = this.uoms || new Map();
			const missing = [...new Set(codes)].filter(code => !this.uoms.has(code));
			if (!missing.length) return;
			for (const code of missing) this.uoms.set(code, null);
			frappe.call({ method: "bunood_theme.api.item_uoms", type: "GET", args: { items: JSON.stringify(missing) } })
				.then(response => {
					const found = response?.message || {};
					for (const code of missing) this.uoms.set(code, Array.isArray(found[code]) ? found[code] : []);
				}, () => { for (const code of missing) this.uoms.set(code, []); })
				.then(() => { if (this.active()) this.render(); });
		}
		renderUom(view, row) {
			const choices = row.item_code ? this.uoms?.get(row.item_code) : null;
			const current = row.uom || row.stock_uom || "";
			const editable = Number(this.doc.docstatus) === 0 && rowFieldStatus(this.frm, row, "uom") === "Write";
			if (!row.item_code) { if (view.uom.childElementCount) view.uom.replaceChildren(); return; }
			if (editable && choices && choices.length > 1) {
				let select = view.uomSelect;
				const key = `${row.item_code}:${choices.join("\n")}`;
				if (!select) {
					select = view.uomSelect = node("select", "form-control bnd-bill-uom-select");
					const name = row.name;
					select.addEventListener("change", () => this.setUom(name, select.value));
				}
				if (select.dataset.key !== key) {
					select.replaceChildren(...choices.map(uom => { const option = node("option", "", __(uom)); option.value = uom; return option; }));
					select.dataset.key = key;
				}
				if (!choices.includes(current)) {
					const option = node("option", "", __(current), select);
					option.value = current;
					select.dataset.key = "";
				}
				select.value = current;
				select.setAttribute("aria-label", `${__("Unit")} · ${row.item_code}`);
				if (select.parentElement !== view.uom) view.uom.replaceChildren(select);
				return;
			}
			if (view.uom.firstElementChild?.classList.contains("bnd-bill-uom-text") && view.uom.textContent === __(current)) return;
			view.uom.replaceChildren(node("span", "bnd-bill-uom-text", __(current)));
		}
		setUom(name, value) {
			const row = (this.frm.doc.items || []).find(item => item.name === name);
			if (!row || !value || row.uom === value || rowFieldStatus(this.frm, row, "uom") !== "Write") return;
			// ERPNext's own uom trigger brings the conversion factor and the unit's price.
			this.change(() => frappe.model.set_value(row.doctype, row.name, "uom", value)).catch(() => this.render());
		}
		setExpandedLine(name) {
			this.mobileExpanded = name;
			for (const [rowName, view] of this.rowViews) {
				const expanded = rowName === name;
				view.line.classList.toggle("is-expanded", expanded);
				view.toggle.setAttribute("aria-expanded", String(expanded));
			}
		}
		renderAmountSummary() {
			const frm = this.frm, doc = this.doc;
			const totalName = totalField(frm);
			const totalDf = frm.fields_dict[totalName]?.df || frappe.meta.get_docfield(frm.doctype, totalName, doc.name);
			this.amountSummary.hidden = !totalDf;
			if (this.amountSummary.hidden) return;
			this.amountBreakdown.replaceChildren();
			if (this.profile.codeColumn) { this.renderFooter(totalName, totalDf); return; }
			const discount = discountSummary(doc);
			if (discount) {
				const before = node("div", "bnd-bill-amount-before-discount", null, this.amountBreakdown);
				node("dt", "", __("Items before discount"), before);
				this.money(node("dd", "", null, before), discount.before, totalDf);
				const reduction = node("div", "bnd-bill-amount-discount", null, this.amountBreakdown);
				const discountLabel = Number(doc.discount_amount) > 0 && doc.apply_discount_on === "Grand Total"
					? __("Discount Amount (incl. tax)") : __("Discount Amount");
				node("dt", "", discountLabel, reduction);
				this.money(node("dd", "", null, reduction), discount.amount, totalDf);
			}
			const standard = [
				["total", __("Items total")],
				["net_total", __("Net before VAT")],
				["total_taxes_and_charges", null],
			];
			const optional = ["rounding_adjustment", "paid_amount", "outstanding_amount"];
			for (const [name, fixedLabel] of standard) {
				if (name === "total" && discount) continue;
				if (name === "net_total" && roundMoney(doc[name]) === roundMoney(doc.total)) continue;
				const df = frm.fields_dict[name]?.df || frappe.meta.get_docfield(frm.doctype, name, doc.name);
				if (!df) continue;
				const pair = node("div", `bnd-bill-amount-${name.replaceAll("_", "-")}`, null, this.amountBreakdown);
				const label = fixedLabel || taxLabel(doc, __(df.label));
				node("dt", "", label, pair);
				this.money(node("dd", "", null, pair), doc[name] || 0, df);
			}
			for (const name of optional) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !showSummary(name, doc)) continue;
				if (name === "outstanding_amount" && roundMoney(doc[name]) === roundMoney(doc[totalName])) continue;
				const pair = node("div", `bnd-bill-amount-${name.replaceAll("_", "-")}`, null, this.amountBreakdown);
				node("dt", "", __(field.df.label), pair);
				this.money(node("dd", "", null, pair), doc[name] || 0, field.df);
			}
			this.amountGrand.replaceChildren();
			node("span", "", __("Total"), this.amountGrand);
			this.money(node("strong", "", null, this.amountGrand), doc[totalName] || 0, totalDf);
		}
		renderFooter(totalName, totalDf) {
			// The owner's sample (2026-10-14): the items' total, the discount, before VAT,
			// the VAT and the total, side by side, with the count of items and of units.
			const frm = this.frm, doc = this.doc;
			const places = frappe.meta.get_field_precision?.(totalDf, doc);
			const foot = billFooter(doc, Number.isInteger(places) ? places : 2);
			const draft = Number(doc.docstatus) === 0;
			if (this.footCounts) {
				this.footCounts.replaceChildren();
				node("span", "", __("Number of items: {0}", [foot.count]), this.footCounts);
				const decimals = (String(foot.qty).split(".")[1] || "").length;
				node("span", "", __("Total quantity: {0}", [window.format_number?.(foot.qty, null, decimals) ?? String(foot.qty)]), this.footCounts);
			}
			const card = (cls, label, value, df = totalDf) => {
				const pair = node("div", `bnd-bill-foot-card ${cls}`, null, this.amountBreakdown);
				const term = node("dt", "", null, pair);
				node("span", "", label, term);
				this.money(node("dd", "", null, pair), value, df);
				return term;
			};
			card("bnd-bill-foot-gross", foot.inclusive ? __("Subtotal incl. VAT") : __("Subtotal"), foot.gross);
			const discount = card("bnd-bill-foot-discount", foot.inclusive ? __("Discount incl. VAT") : __("Discount"), foot.discount);
			// The invoice's own discount is a click away, as F10 is, beside the word «الخصم»
			// so the foot stays one compact row (owner, 2026-10-14).
			if (draft && fieldStatus(frm, "discount_amount") === "Write") {
				const add = button(__("Discount on the bill"), discount, () => this.openDetails("discount_amount"));
				add.classList.add("bnd-bill-foot-action");
			}
			card("bnd-bill-foot-before", __("Before VAT"), foot.before);
			const taxDf = frm.fields_dict.total_taxes_and_charges?.df || totalDf;
			card("bnd-bill-foot-vat", taxLabel(doc, __("VAT")), foot.vat, taxDf);
			card("bnd-bill-foot-total", __("Total"), doc[totalName] || 0);
			// A rounded total, or what a submitted bill still owes, follows on its own line.
			for (const name of ["rounding_adjustment", "outstanding_amount"]) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !Number(doc[name])) continue;
				if (name === "outstanding_amount" && (draft || roundMoney(doc[name]) === roundMoney(doc[totalName]))) continue;
				card(`bnd-bill-foot-extra bnd-bill-amount-${name.replaceAll("_", "-")}`, __(field.df.label), doc[name], field.df);
			}
			this.amountGrand.hidden = true;
		}
		render() {
			if (this.closed || !this.syncDocument()) return;
			this.syncSelectionGuard();
			const frm = this.frm, doc = frm.doc;
			const documentState = api.document_actions.documentState(frm);
			this.stateBadge.textContent = __(documentState.label);
			this.stateBadge.dataset.tone = documentState.tone;
			this.root.dataset.documentState = documentState.tone;
			this.documentState.textContent = [doc.__islocal ? __("New") : doc.name, doc.__islocal || frm.is_dirty() ? __("Not Saved") : ""].filter(Boolean).join(" · ");
			if (this.invoiceNumberValue) this.invoiceNumberValue.textContent = doc.__islocal ? __("Assigned after saving") : doc.name;
			const draft = Number(doc.docstatus) === 0;
			const rows = draft ? (doc.items || []) : (doc.items || []).filter(r => r.item_code);
			for (const [name, view] of this.rowViews) if (!rows.some(r => r.name === name)) { this.forgetRow(name); view.line.remove(); this.rowViews.delete(name); }
			if (!rows.some(row => row.name === this.mobileExpanded)) this.mobileExpanded = rows[0]?.name || "";
			this.lineHead.hidden = !rows.length;
			this.controls = this.controls.filter(c => !c.rowField || rows.some(r => r === c.doc));
			for (const { control, key } of this.controls) {
				this.renderControl(control, key, true);
			}
			this.renderBranch();
			this.renderVatTreatment();
			this.revertButton.hidden = !this.invalid.size;
			this.lines.querySelector(".bnd-bill-empty")?.remove();
			if (!rows.length) {
				const empty = node("div", "bnd-bill-empty", null, this.lines);
				node("strong", "", __("Your bill starts here"), empty);
				node("p", "", __("Add your first item. Prices and taxes follow your invoice settings."), empty);
			}
			const lineTotals = this.profile.taxColumns ? lineTaxes(frm) : null;
			// The code box rides in the last empty row, the one the next item goes into.
			const coded = !!this.profile.codeColumn;
			const readyRow = coded && draft ? [...rows].reverse().find(row => !row.item_code) || null : null;
			if (coded && !readyRow) this.scanInput?.remove();
			if (coded) this.loadUoms(rows.map(row => row.item_code).filter(Boolean));
			for (const row of rows) {
				let view = this.rowViews.get(row.name);
				const grid = frm.fields_dict.items.grid;
				if (!view) {
					const line = node("article", "bnd-bill-line", null, this.lines);
					line.id = `bnd-bill-line-${++controlId}`;
					const toggle = button("", line, () => this.setExpandedLine(row.name));
					toggle.classList.add("bnd-bill-line-toggle");
					toggle.setAttribute("aria-controls", line.id + "-body");
					const toggleIndex = node("span", "bnd-bill-line-toggle-index", "", toggle);
					const toggleTitle = node("span", "bnd-bill-line-toggle-title", "", toggle);
					const toggleAmount = node("span", "bnd-bill-line-toggle-amount", "", toggle);
					const body = node("div", "bnd-bill-line-body", null, line);
					body.id = line.id + "-body";
					const rowNumber = node("div", "bnd-bill-row-number", "", body);
					const code = coded ? node("div", "bnd-bill-line-code", null, body) : null;
					const info = node("div", "bnd-bill-item", null, body);
					const itemName = node("strong", "bnd-bill-item-name", "", info);
					const itemDf = frappe.meta.get_docfield(row.doctype, "item_code", row.name) || grid.get_docfield("item_code");
					if (itemDf) this.bindControl(info, {
						df: { ...itemDf, label: __("Item"), placeholder: __("Description or search items") },
						get_query: this.itemQuery(() => grid.get_field("item_code")?.get_query),
					}, row, true);
					const itemMeta = node("bdi", "bnd-bill-hint bnd-bill-item-meta", "", info);
					const uom = coded ? node("div", "bnd-bill-line-uom", null, body) : null;
				for (const name of this.profile.lineFields) {
					const cell = node("div", `bnd-bill-cell bnd-bill-cell-${name}`, null, body);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, {
						df: { ...df, label: (this.profile.lineLabels?.[name] || LINE_LABELS[name])?.() || __(df.label),
							...(this.profile.priceFirst && name === "price_list_rate" ? { read_only: 0 } : {}) },
						get_query: grid.get_field(name)?.get_query,
					}, row, true, this.lineStatus(row, name));
				}
				const before = coded ? node("div", "bnd-bill-line-before", null, body) : null;
				const vat = this.profile.taxColumns ? node("div", "bnd-bill-line-vat", null, body) : null;
				const amount = node("div", "bnd-bill-line-total", null, body);
					view = { line, toggle, toggleIndex, toggleTitle, toggleAmount, body, rowNumber, code, info, itemName, itemMeta, uom, before, vat, amount };
					this.rowViews.set(row.name, view);
				}
				const { info, amount } = view;
				const position = rows.indexOf(row) + 1;
				view.rowNumber.textContent = position;
				view.toggleIndex.textContent = position;
				view.toggleTitle.textContent = row.item_name || row.item_code || __("New line");
				view.info.dataset.itemReady = String(!!row.item_code);
				view.line.dataset.itemReady = String(!!row.item_code);
				view.itemName.hidden = !row.item_code;
				view.itemName.textContent = row.item_name || row.item_code || "";
				// The code and the unit have their own columns on a coded sheet.
				view.itemMeta.textContent = coded ? "" : [row.item_code && row.item_code !== row.item_name ? `${__("Item code")}: ${row.item_code}` : "", row.uom ? __(row.uom) : ""].filter(Boolean).join(" · ");
				if (view.code) this.renderCode(view, row, row === readyRow);
				if (view.uom) this.renderUom(view, row);
				view.toggle.setAttribute("aria-label", `${__("Item")} ${position}: ${row.item_name || row.item_code || __("New line")}`);
				amount.replaceChildren();
				view.vat?.replaceChildren();
				view.before?.replaceChildren();
				view.toggleAmount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					if (!this.profile.taxColumns) {
						node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
						this.money(view.toggleAmount, row.amount, df, row);
					} else if (row.item_code) {
						// Without the engine's split (lineTotals null) a dash says so; the
						// bill's totals below are always the engine's own.
						const split = lineTotals?.get(row.name);
						if (view.before) node("span", "bnd-bill-hint", __("Before VAT"), view.before);
						node("span", "bnd-bill-hint", __("Line VAT"), view.vat);
						node("span", "bnd-bill-hint", coded ? __("Total") : __("Line total after VAT"), amount);
						if (split) {
							// Before VAT is what the line's total keeps after its VAT, so the three add up.
							if (view.before) this.money(view.before, roundMoney(split.total - split.tax, fieldPrecision(row, "amount")), df, row);
							this.money(view.vat, split.tax, df, row);
							this.money(amount, split.total, df, row);
							this.money(view.toggleAmount, split.total, df, row);
						} else for (const cell of [view.before, view.vat, amount].filter(Boolean)) node("span", "bnd-bill-line-unknown", "—", cell);
					}
				}
				if (!view.actions) {
					view.actions = node("div", "bnd-bill-line-actions", null, view.body);
					view.remove = button(__("Remove"), view.actions, () => this.removeItem(row));
					view.remove.classList.add("bnd-bill-line-remove");
				}
				view.remove.setAttribute("aria-label", `${__("Remove")} · ${row.item_code || __("New line")}`);
				view.remove.hidden = !canRemove(frm);
			}
			if (rows.length) this.setExpandedLine(this.mobileExpanded);
			this.renderAmountSummary();
			this.renderSections();
			this.syncPrintFormat();
			const totalName = totalField(frm);
			const totalControl = frm.fields_dict[totalName];
			this.mobileTotalValue.replaceChildren();
			if (totalControl && fieldStatus(frm, totalName) !== "None") this.money(this.mobileTotalValue, doc[totalName], totalControl.df);
			const itemCount = rows.filter(row => row.item_code).length;
			this.itemCount.textContent = itemCount ? __("Items: {0}", [itemCount]) : "";
			const nativeActions = api.document_actions.actionState(frm, {
				canRecordPayment: typeof frm.cscript?.make_payment_entry === "function",
			});
			const { showSave } = nativeActions;
			const showSubmit = draft && !!frm.meta?.is_submittable && api.document_actions.permitted(frm, "submit");
			this.root.dataset.bndDraft = String(draft); this.searchButton.hidden = !draft;
			this.addLineButton.hidden = !draft; if (this.newItemButton) this.newItemButton.hidden = !draft; this.saveButton.hidden = !showSave;
			this.submitButton.hidden = !showSubmit;
			this.submitPrintButton.hidden = !showSubmit;
			this.saveAndNewButton.hidden = !showSave;
			this.newButton.hidden = !nativeActions.showNew;
			this.deleteButton.hidden = !nativeActions.showDelete;
			this.duplicateButton.hidden = !nativeActions.showDuplicate;
			this.cancelButton.hidden = !nativeActions.showCancel || neverCancelled(frm.doctype);
			this.paymentButton.hidden = !nativeActions.showRecordPayment;
			this.previewButton.hidden = !nativeActions.showPrint && !draft; this.discountButton.hidden = !draft;
			this.sendButton.hidden = this.frm.doctype !== "Sales Invoice" || !submittedCustomerInvoice(frm);
			this.busy();
		}
		async flush() {
			for (const timer of this.editTimers.values()) clearTimeout(timer);
			this.editTimers.clear();
			// Untouched ready-row zeroes are display defaults, not edits.
			const edits = this.controls.filter(({control, key, rowField, doc}) =>
				control.get_status() === "Write" &&
				!(rowField && !doc.item_code && !this.pending.has(key) && !this.invalid.has(key)))
				.map(({control, key}) => ({ control, key, value: control.get_value() }))
				.filter(({control, key, value}) => this.pending.has(key) || this.invalid.has(key) || value !== control.get_model_value());
			this.flushing = true;
			try {
				await this.queue.tail;
				for (const { control, key, value } of edits) { await control.set_value(value); if (!this.invalid.has(key)) this.pending.delete(key); }
				await this.queue.tail;
			} finally { this.flushing = false; this.render(); }
		}
		async fullInvoice() {
			if (this.closing || this.saving) return;
			this.closing = true; this.busy();
			try {
				if (Number(this.doc.docstatus) === 0) await this.flush();
				if (!this.active()) return;
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); this.focusInvalid(); return; }
				this.setMode(false);
			} catch (e) { this.message(e.message || __("Could not update the document. Open the advanced form to review."), true); }
			finally { this.closing = false; this.busy(); }
		}
		missingRequiredField() {
			if (!this.doc[this.profile.party]) return {
				message: this.profile.party === "supplier" ? __("Choose a supplier before continuing.") : __("Choose a customer before continuing."), control: this.partyControl,
			};
			if (!(this.doc.items || []).some(row => row.item_code)) return {
				message: __("Add at least one item before continuing."), control: this.entryControl()?.control || this.addLineButton,
			};
			return null;
		}
		focusInvalid() {
			const key = this.invalid.keys().next().value;
			const entry = this.controls.find(control => control.key === key);
			if (!entry) return;
			if (entry.rowField) this.setExpandedLine(entry.doc.name);
			entry.control.set_focus?.();
			entry.control.$wrapper?.[0]?.scrollIntoView?.({ block: "center" });
		}
		async save() {
			if (this.saving || this.closing) return;
			let missing, saved = false;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); this.focusInvalid(); return false; }
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				await this.pruneBlankRows();
				missing = this.missingRequiredField();
				if (missing) { this.message(missing.message, true); return false; }
				const taxIssue = taxConfigurationIssue(this.frm.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return false; }
				await this.queue.run(() => saveDraft(this.frm), { settle: false });
				saved = true;
				frappe.show_alert({ message: __("Draft saved. Submit it when it is ready to affect accounts or stock."), indicator: "green" }); this.render();
			} catch (e) { this.message(e.message || __("The draft was not saved. Review the message or open the advanced form."), true); }
			finally {
				this.saving = false;
				if (this.active()) this.render(); else this.busy();
				if (missing && this.active()) missing.control?.set_focus();
			}
			return saved;
		}
		async saveAndNew() { if (await this.save()) return frappe.new_doc(this.frm.doctype); }
		async submit({ printAfter = false } = {}) {
			if (!this.active() || Number(this.doc.docstatus) !== 0 || this.saving) return;
			let missing, submitted = false, paymentFailed = false, payment = null, checkout = null;
			this.saving = true; this.busy();
			this.message(printAfter ? __("Saving and preparing print…") : __("Saving and submitting…"));
			try {
				await this.flush();
				if (!this.active()) return;
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); this.focusInvalid(); return; }
				await this.pruneBlankRows();
				missing = this.missingRequiredField();
				if (missing) { this.message(missing.message, true); return; }
				const taxIssue = taxConfigurationIssue(this.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				// How the bill is paid is asked before anything is committed.
				const field = this.profile.paymentMethod;
				checkout = field ? await this.promptCheckout() : { method: null };
				if (!checkout) { this.message(__("Nothing was submitted. The bill is as you left it.")); return; }
				if (!this.active()) return;
				const createPayment = settlementCreatesPayment(checkout.method);
				// One message says what happened, once it has: the steps' own alerts are held back.
				await quietly(this.frm, async () => {
					// Submitted unpaid, the invoice says On Credit; the payment, once posted,
					// writes how it was paid (payments.post_invoice_payment).
					if (field && this.doc[field] !== CREDIT_SALE && fieldStatus(this.frm, field) === "Write") {
						await this.queue.run(() => this.frm.set_value(field, CREDIT_SALE));
					}
					if (this.doc.__islocal || this.frm.is_dirty()) {
						this.message(__("Saving invoice…"));
						const local = this.doc.__islocal ? this.doc.name : "";
						await saveDraft(this.frm);
						if (!this.active() && !(local && window.cur_frm === this.frm && frappe.model?.new_names?.[local] === this.frm.doc.name)) return;
					} else if (!this.active()) return;
					this.message(__("Submitting invoice…"));
					await submitConfirmed(this.frm);
					submitted = Number(this.frm.doc.docstatus) === 1;
					if (createPayment && submitted) {
						this.message(__("Recording payment…"));
						try { payment = await this.postPayment(checkout, true, { quiet: true }); }
						catch (error) {
							paymentFailed = true;
							this.message(__("Invoice submitted, but payment could not be recorded: {0}", [error.message]), true);
						}
					}
				});
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); if (missing && this.active()) missing.control?.set_focus(); }
			if (!submitted) return submitted;
			// A payment that did not post keeps the bill open, so it can be received from here.
			if (paymentFailed) {
				if (printAfter) void this.printDocument(this.frm);
				return submitted;
			}
			// The counter moves on (owner, 2026-10-14): after «حفظ» or «طباعة» a new bill
			// opens, the one just made is printed over it, and one message says what was saved
			// and paid, with the way back to it.
			const saved = this.frm.doc;
			const done = { doctype: this.frm.doctype, name: saved.name, currency: saved.currency,
				total: saved[totalField(this.frm)], credit: !settlementCreatesPayment(checkout?.method),
				// What sending needs once the screen has moved on to the next bill.
				doc: { doctype: saved.doctype, name: saved.name, docstatus: 1, customer: saved.customer,
					contact_mobile: saved.contact_mobile, contact_email: saved.contact_email,
					grand_total: saved.grand_total, currency: saved.currency } };
			const printFormat = this.printFormat;
			if (printAfter && done.doctype !== "Sales Invoice") { void this.printDocument(this.frm); return submitted; }
			try { await frappe.new_doc(done.doctype); } catch (_) { /* The saved bill stays on screen. */ }
			announceSaved(done, payment, printFormat);
			if (printAfter) void printCustomerInvoice(savedInvoice(done), printFormat, true);
			return submitted;
		}
		printDocument(frm) {
			return submittedCustomerInvoice(frm) ? printCustomerInvoice(frm, this.printFormat) : frm.print_doc();
		}
		submitAndPrint() { return this.submit({ printAfter: true }); }
		newDocument() {
			if (!this.active() || this.queue.count || this.saving || this.flushing || this.closing) return;
			const start = () => frappe.new_doc(this.frm.doctype);
			// A bill with lines not saved yet is not dropped without a word.
			const unsaved = Number(this.doc.docstatus) === 0 && (this.doc.__islocal || this.frm.is_dirty()) &&
				(this.doc.items || []).some(row => row.item_code);
			if (unsaved) frappe.confirm(__("This bill is not saved. Start a new one and leave it?"), start);
			else return start();
		}
		openList() {
			// Earlier bills (owner, 2026-10-14): drafts to finish or print, any bill to find again.
			return frappe.set_route("List", this.frm.doctype);
		}
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		duplicateDocument() { if (!this.doc.__islocal) return this.frm.copy_doc(); }
		async cancelDocument() {
			if (Number(this.doc.docstatus) !== 1 || this.cancelDialog || this.saving) return;
			if (neverCancelled(this.frm.doctype)) { refuseCancel(); return; }
			// One plain question before anything happens (owner, 2026-10-14): Frappe's own pair
			// of prompts ended on «إلغاء الكل», which reads as "close" and cancelled the invoice
			// with the documents linked to it. This one names what is cancelled, and its
			// buttons never read «إلغاء».
			const frm = this.frm, name = frm.doc.name;
			const ignore = frm.ignore_doctypes_on_cancel_all || [];
			let links = [];
			try {
				const response = await frappe.call({ method: "frappe.desk.form.linked_with.get_submitted_linked_docs",
					args: { doctype: frm.doctype, name, ignore_doctypes_on_cancel_all: ignore }, freeze: true });
				links = (response?.message?.docs || []).filter(link => !ignore.includes(link.doctype));
			} catch (_) { return; /* Frappe shows the server's reason. */ }
			if (!this.active() || this.cancelDialog) return;
			const allowed = links.every(link => frappe.model.can_cancel(link.doctype));
			const dialog = this.cancelDialog = new frappe.ui.Dialog({
				title: __("Cancel invoice {0}?", [name]),
				fields: [{ fieldtype: "HTML", fieldname: "note" }],
				...(allowed ? {
					primary_action_label: links.length ? __("Yes, cancel the invoice and these documents") : __("Yes, cancel the invoice"),
					primary_action: () => { dialog.hide(); void this.cancelConfirmed(links); },
				} : {}),
				secondary_action_label: __("Keep the invoice"),
				secondary_action: () => dialog.hide(),
				onhide: () => { if (this.cancelDialog === dialog) this.cancelDialog = null; },
			});
			dialog.$wrapper?.addClass("bnd-bill-cancel-dialog");
			dialog.$wrapper?.on("hidden.bs.modal", () => dialog.$wrapper.remove());
			const note = dialog.fields_dict.note.$wrapper?.[0];
			if (note) {
				node("p", "", __("Cancelling reverses the invoice's accounting and stock entries. This cannot be undone."), note);
				if (links.length) {
					node("p", "", allowed ? __("These documents are linked to it and are cancelled with it:")
						: __("These documents are linked to it, and you may not cancel them, so the invoice stays as it is:"), note);
					const list = node("ul", "bnd-bill-cancel-links", null, note);
					for (const link of links) node("li", "", `${__(link.doctype)}: ${link.name}`, list);
				}
				// ERPNext unlinks the invoice's payments rather than cancel them; the money stays received.
				const total = Number(frm.doc[totalField(frm)] || 0), owed = Number(frm.doc.outstanding_amount || 0);
				if (total > 0 && owed < total) node("p", "", __("What was received for it stays with the customer as an advance: refund it, or use it on another bill."), note);
				node("p", "bnd-bill-hint", __("To give the customer money back or take goods back, make a return instead."), note);
			}
			if (allowed) dialog.get_primary_btn?.().removeClass("btn-primary").addClass("btn-danger");
			dialog.show();
		}
		async cancelConfirmed(links) {
			const frm = this.frm;
			if (Number(frm.doc.docstatus) !== 1) return;
			// The reader confirmed above: Frappe's own steps run without asking again.
			if (typeof frm._cancel !== "function") return (frm.bndNativeCancel || frm.savecancel).call(frm);
			try {
				if (links.length) {
					await frappe.call({ method: "frappe.desk.form.linked_with.cancel_all_linked_docs",
						args: { docs: links, ignore_doctypes_on_cancel_all: frm.ignore_doctypes_on_cancel_all || [] }, freeze: true });
					await frm.reload_doc();
				}
				frm._cancel(null, null, null, true);
			} catch (_) { /* Frappe shows the server's reason; the invoice stays as it was. */ }
		}
		async preview() {
			if (this.saving || this.closing) return;
			// A submitted bill opens its delivery preview, which prints and downloads it.
			if (Number(this.doc.docstatus) !== 0) { void printCustomerInvoice(this.frm, this.printFormat); return; }
			// A draft is shown as it stands: edits still being typed reach the document, nothing is saved.
			try { await this.flush(); } catch (_) { /* The inline errors say what to correct. */ }
			if (!this.active()) return;
			if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); this.focusInvalid(); return; }
			previewDraft(this.frm, this.printFormat);
		}
		restore() {
			const reload = () => this.frm.reload_doc().then(() => { this.syncDocument(); this.render(); });
			if (this.frm.is_dirty()) frappe.confirm(__("Discard unsaved changes and reload this document?"), reload); else reload();
		}
		async promptCheckout({ allowCredit = true, receiving = false } = {}) {
			// The checkout (owner, 2026-10-12): how the bill is paid is asked when it is
			// submitted, Network first, and each choice says what it needs. Nothing is
			// committed until the reader confirms; closing the dialog changes nothing.
			const precision = Number(frappe.boot?.sysdefaults?.currency_precision) || 2;
			const currency = this.doc.currency;
			const outstanding = Number(this.doc.outstanding_amount);
			const due = roundMoney(Number(this.doc.docstatus) === 1 || outstanding > 0 ? outstanding : this.doc[totalField(this.frm)], precision);
			if (!(due > 0)) {
				if (Number(this.doc.docstatus) === 1) throw Error(__("This invoice has no outstanding amount to receive."));
				return { method: null };
			}
			let ready = null;
			try {
				ready = (await frappe.call({ method: "bunood_theme.payments.invoice_payment_methods", type: "GET", args: { company: this.doc.company } })).message || null;
			} catch (_) { ready = null; /* The server still refuses a way it cannot post. */ }
			const choices = [
				{ value: NETWORK_PAYMENT, label: __("Network"), hint: __("Mada or credit card"), icon: "credit-card" },
				{ value: CASH_PAYMENT, label: __("Cash"), hint: __("Works out the change"), icon: "banknote" },
				{ value: TRANSFER_PAYMENT, label: __("Bank Transfer"), hint: __("To the organisation's account"), icon: "landmark" },
				{ value: MIXED_PAYMENT, label: __("Cash and network"), hint: __("Part in cash, the rest by network"), icon: "split" },
				...(allowCredit ? [{ value: CREDIT_SALE, label: __("On Credit"), hint: __("The customer owes the invoice"), icon: "calendar-clock" }] : []),
			].map(choice => ({ ...choice, ready: choice.value === CREDIT_SALE || !ready || !!ready[choice.value]?.ready }));
			const current = this.checkoutDefault();
			const usable = choices.filter(choice => choice.ready);
			// An accounts manager can link the ways of paying from the dialog itself.
			const canLink = !!frappe.user?.has_role?.(["Accounts Manager", "System Manager"]);
			if (!usable.length && !canLink) throw Error(__("No way of paying is linked to an account for this company. Link one in Mode of Payment."));
			let method = (usable.find(choice => choice.value === current) || usable.find(choice => choice.value === NETWORK_PAYMENT) || usable[0] || choices[0]).value;
			const money = value => this.format(value, { fieldtype: "Currency", options: currency });

			return new Promise(resolve => {
				let settled = false;
				const finish = value => { if (!settled) { settled = true; resolve(value); } };
				const dialog = new frappe.ui.Dialog({
					title: Number(this.doc.docstatus) === 1 ? __("Receive payment") : __("Checkout"),
					fields: [
						{ fieldname: "methods", fieldtype: "HTML" },
						{ fieldtype: "Section Break", fieldname: "amounts_section" },
						// A later receipt may take part of what is owed; the checkout takes it all.
						...(receiving ? [{ fieldname: "amount_now", fieldtype: "Currency", label: __("Amount received now"), options: currency, non_negative: 1 }] : []),
						{ fieldname: "received_amount", fieldtype: "Currency", label: __("Amount received"), options: currency, non_negative: 1 },
						{ fieldname: "cash_amount", fieldtype: "Currency", label: __("Cash amount"), options: currency, non_negative: 1 },
						{ fieldtype: "Column Break" },
						{ fieldname: "reference_no", fieldtype: "Data", label: __("Reference number (optional)") },
						{ fieldname: "reference_date", fieldtype: "Date", label: __("Transfer date"), default: frappe.datetime.get_today() },
						{ fieldtype: "Section Break" },
						{ fieldname: "summary", fieldtype: "HTML" },
					],
					primary_action_label: Number(this.doc.docstatus) === 1 ? __("Record payment") : __("Submit invoice"),
					primary_action: () => {
						const outcome = read();
						if (outcome.error) { frappe.msgprint(outcome.error); return; }
						// Resolve before hide: Dialog.onhide is the cancellation path.
						finish(outcome.value);
						dialog.hide();
					},
					onhide: () => finish(null),
				});
				dialog.$wrapper?.addClass("bnd-checkout-dialog");
				dialog.$wrapper?.on("hidden.bs.modal", () => dialog.$wrapper.remove());
				const body = dialog.fields_dict.methods.$wrapper[0];
				const head = node("div", "bnd-checkout-due", null, body);
				node("span", "", __("Amount due"), head);
				this.money(node("strong", "", null, head), due, { fieldtype: "Currency", options: currency, fieldname: "grand_total" });
				const group = node("div", "bnd-checkout-methods", null, body);
				group.setAttribute("role", "radiogroup");
				group.setAttribute("aria-label", __("Payment method"));
				const tiles = choices.map(choice => {
					const tile = button("", group, () => choose(choice.value));
					tile.classList.add("bnd-checkout-method");
					tile.setAttribute("role", "radio");
					tile.dataset.method = choice.value;
					tile.disabled = !choice.ready;
					const icon = node("span", "bnd-checkout-method-icon", null, tile);
					icon.innerHTML = frappe.utils.icon(choice.icon, "md");
					icon.setAttribute("aria-hidden", "true");
					node("strong", "", choice.label, tile);
					node("small", "", choice.ready ? choice.hint : __("Not linked to an account"), tile);
					return tile;
				});
				const linkRow = node("div", "bnd-checkout-link", null, body);
				linkRow.hidden = true;
				node("span", "bnd-bill-hint", __("Some ways of paying are not linked to the company's accounts yet."), linkRow);
				const linkButton = button(__("Link payment methods to accounts"), linkRow, async () => {
					linkButton.disabled = true;
					try {
						const response = await frappe.call({ method: "bunood_theme.payments.setup_invoice_payment_methods", args: { company: this.doc.company }, freeze: true });
						refresh(response.message);
					} catch (_) { /* Frappe shows the server's reason. */ }
					finally { linkButton.disabled = false; }
				});
				const refresh = next => {
					ready = next || ready;
					for (const choice of choices) choice.ready = choice.value === CREDIT_SALE || !ready || !!ready[choice.value]?.ready;
					tiles.forEach((tile, index) => {
						tile.disabled = !choices[index].ready;
						tile.querySelector("small").textContent = choices[index].ready ? choices[index].hint : __("Not linked to an account");
					});
					linkRow.hidden = !canLink || choices.every(choice => choice.ready);
					if (!choices.find(choice => choice.value === method)?.ready) {
						const next = choices.find(choice => choice.ready && choice.value === NETWORK_PAYMENT) || choices.find(choice => choice.ready);
						if (next) choose(next.value);
					}
				};
				group.addEventListener("keydown", e => {
					if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
					e.preventDefault();
					const live = tiles.filter(tile => !tile.disabled);
					const rtl = getComputedStyle(group).direction === "rtl";
					const step = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight") ? 1 : -1;
					const next = live[(live.indexOf(document.activeElement) + step + live.length) % live.length];
					if (next) { choose(next.dataset.method); next.focus(); }
				});
				const summary = dialog.fields_dict.summary.$wrapper[0];
				summary.classList.add("bnd-checkout-summary");
				summary.setAttribute("role", "status");
				summary.setAttribute("aria-live", "polite");
				const show = (name, visible) => dialog.set_df_property(name, "hidden", visible ? 0 : 1);
				const target = () => receiving ? roundMoney(dialog.get_value("amount_now"), precision) : due;
				function read() {
					const amount = target();
					const received = roundMoney(dialog.get_value("received_amount"), precision);
					const cash = roundMoney(dialog.get_value("cash_amount"), precision);
					const reference = String(dialog.get_value("reference_no") || "").trim();
					const value = {
						method, reference_no: reference, reference_date: dialog.get_value("reference_date") || "",
						// What the cashier saw owed: the server refuses when the invoice now owes otherwise.
						expected_outstanding: due, ...(receiving ? { amount } : {}),
					};
					if (!choices.find(choice => choice.value === method)?.ready) return { error: __("Choose a way of paying that is linked to an account.") };
					if (!(amount > 0) || amount > due) return { error: __("Receive an amount above zero and no more than the invoice owes.") };
					if (method === CASH_PAYMENT) {
						if (received < amount) return { error: __("The amount received is less than the amount due.") };
						return { value, change: roundMoney(received - amount, precision), amount };
					}
					if (method === MIXED_PAYMENT) {
						if (!(cash > 0) || cash >= amount) return { error: __("Enter a cash amount above zero and below the amount due; the rest is paid by network.") };
						return { value: { ...value, cash_amount: cash }, network: roundMoney(amount - cash, precision), amount };
					}
					return { value, amount };
				}
				const update = () => {
					const outcome = read();
					summary.replaceChildren();
					const line = (label, amount, tone = "") => {
						const row = node("div", `bnd-checkout-summary-row ${tone}`.trim(), null, summary);
						node("span", "", label, row);
						const strong = node("strong", "", null, row);
						strong.dir = "ltr";
						strong.textContent = money(amount);
					};
					if (outcome.error) node("p", "bnd-checkout-summary-error", outcome.error, summary);
					else if (method === CASH_PAYMENT) line(__("Change to return"), outcome.change, "is-strong");
					else if (method === MIXED_PAYMENT) { line(__("Cash"), outcome.value.cash_amount); line(__("Network"), outcome.network, "is-strong"); }
					else if (method === CREDIT_SALE) node("p", "bnd-bill-hint", __("No payment is recorded now. The invoice stays due from the customer."), summary);
					else line(method === TRANSFER_PAYMENT ? __("Transferred") : __("Paid by network"), outcome.amount, "is-strong");
				};
				function choose(value) {
					method = value;
					for (const tile of tiles) {
						const selected = tile.dataset.method === value;
						tile.classList.toggle("is-selected", selected);
						tile.setAttribute("aria-checked", String(selected));
						tile.tabIndex = selected ? 0 : -1;
					}
					show("received_amount", value === CASH_PAYMENT);
					show("cash_amount", value === MIXED_PAYMENT);
					show("reference_no", [NETWORK_PAYMENT, TRANSFER_PAYMENT, MIXED_PAYMENT].includes(value));
					show("reference_date", value === TRANSFER_PAYMENT);
					dialog.set_df_property("reference_no", "label", value === TRANSFER_PAYMENT
						? __("Transfer number (optional)") : __("Card slip number (optional)"));
					update();
				}
				for (const name of ["received_amount", "cash_amount", ...(receiving ? ["amount_now"] : [])]) dialog.fields_dict[name].$input?.on("input change", () => requestAnimationFrame(update));
				dialog.show();
				// Defaults settle during show: the cash received starts at the amount due.
				requestAnimationFrame(async () => {
					if (receiving) await dialog.set_value("amount_now", due);
					await dialog.set_value("received_amount", due);
					await dialog.set_value("cash_amount", roundMoney(due / 2, precision));
					choose(method);
					refresh(null);
					tiles.find(tile => tile.dataset.method === method)?.focus();
				});
			});
		}
		async postPayment(checkout, atInvoiceCheckout = false, { quiet = false } = {}) {
			const response = await frappe.call({
				method: "bunood_theme.payments.post_invoice_payment",
				args: {
					invoice: this.frm.doc.name, method: checkout.method,
					cash_amount: checkout.cash_amount ?? "", reference_no: checkout.reference_no || "",
					reference_date: checkout.reference_date || "", at_invoice_checkout: atInvoiceCheckout ? 1 : 0,
					amount: checkout.amount ?? "", expected_outstanding: checkout.expected_outstanding ?? "",
				},
				freeze: true,
				freeze_message: __("Recording payment…"),
			});
			if (response.exc || !response.message?.entries?.length) throw Error(__("Could not record the payment."));
			await this.frm.reload_doc();
			const result = response.message;
			const parts = result.entries.map(entry => `${__(entry.mode_of_payment)} ${this.format(entry.amount, { fieldtype: "Currency", options: result.currency })}`);
			if (!quiet) frappe.show_alert({ message: __("Payment recorded: {0}", [parts.join(" · ")]), indicator: "green" }, 8);
			return result;
		}
		async payment() {
			try {
				// An early-payment discount belongs to ERPNext's own Payment Entry flow.
				if (!this.profile.paymentMethod || this.frm.cscript?.has_discount_in_schedule?.()) return await makePaymentEntry(this.frm);
				const checkout = await this.promptCheckout({ allowCredit: false, receiving: true });
				if (checkout?.method) return await this.postPayment(checkout);
			}
			catch (error) { this.message(error.message, true); }
		}
	}
	// Frappe offers «إلغاء» on a submitted document its reader may cancel; a sales invoice
	// never is, so its toolbar never offers it, and any other way in says why.
	function withoutCancel(frm) {
		if (!frm?.toolbar || !neverCancelled(frm.doctype)) return false;
		if (!frm.toolbar.bndNeverCancelled) {
			frm.toolbar.bndNeverCancelled = true;
			frm.toolbar.can_cancel = () => false;
		}
		if (!frm.bndRefuseCancel) {
			frm.bndRefuseCancel = true;
			frm.savecancel = () => refuseCancel();
		}
		return true;
	}
	function visibleInvoiceForm(frm) {
		const route = frappe.get_route?.() || [];
		return window.cur_frm === frm && !!frm?.$wrapper?.[0]?.isConnected &&
			route[0] === "Form" && route[1] === frm.doctype;
	}
	function open(frm) {
		// Embedded native invoice controllers (Fast Sale) own their presentation.
		if (!visibleInvoiceForm(frm)) return;
		if (!supports(frm)) {
			frappe.msgprint(__("Use the advanced form for this document type or permission level."));
			return;
		}
		if (instances.has(frm)) { instances.get(frm).show(); return; }
		instances.set(frm, new BillWorkbench(frm));
	}
	function newInvoice() {
		return frappe.new_doc("Sales Invoice");
	}
	window.addEventListener?.("keydown", e => {
		const frm = window.cur_frm;
		let workbench = instances.get(frm);
		if (workbench && !workbench.syncDocument()) workbench = instances.get(frm);
		workbench?.shortcut(e);
	}, true);
	if (frappe.ui?.form?.on) {
		frappe.ui.form.on("Sales Invoice", {
			validate: frm => { fillDueDate(frm); },
			onload(frm) { withoutCancel(frm); },
			refresh(frm) {
				if (withoutCancel(frm) && Number(frm.doc.docstatus) === 1) frm.page?.clear_secondary_action?.();
				if (submittedCustomerInvoice(frm)) frm.add_custom_button(
					__("Send invoice to customer"), () => showInvoiceDelivery(frm), __("Actions"));
				if (!frm.fields_dict.exempt_from_sales_tax) return;
				frm.set_df_property("exempt_from_sales_tax", "label", __("VAT exempt (0%)"));
				frm.set_df_property("exempt_from_sales_tax", "description", __("Off applies the configured standard VAT. On applies the configured exempt treatment."));
			},
			on_submit(frm) {
				if (!instances.get(frm)?.simple) setTimeout(() => showInvoiceDelivery(frm, true), 0);
			},
			tax_category: frm => scheduleVatNormalization(frm, "tax_category"),
			taxes_and_charges: frm => scheduleVatNormalization(frm, "taxes_and_charges"),
			exempt_from_sales_tax(frm) {
				if (vatInternalUpdates.has(frm)) return;
				applyVatTreatment(frm, Number(frm.doc.exempt_from_sales_tax) ? VAT_EXEMPT : VAT_STANDARD)
					.then(() => instances.get(frm)?.render())
					.catch(reportVatTreatmentError);
			},
		});
		frappe.ui.form.on("Purchase Invoice", {
			validate: frm => { fillDueDate(frm); },
			tax_category: frm => scheduleVatNormalization(frm, "tax_category"),
			taxes_and_charges: frm => scheduleVatNormalization(frm, "taxes_and_charges"),
		});
		frappe.ui.form.on("POS Invoice", {
			onload(frm) { withoutCancel(frm); },
			refresh(frm) {
				if (withoutCancel(frm) && Number(frm.doc.docstatus) === 1) frm.page?.clear_secondary_action?.();
				if (submittedCustomerInvoice(frm)) frm.add_custom_button(
					__("Send invoice to customer"), () => showInvoiceDelivery(frm), __("Actions"));
			},
			on_submit(frm) { setTimeout(() => showInvoiceDelivery(frm, true), 0); },
		});
	}
	api.sales_bill = { open, newInvoice, sendInvoice, billFooter, fillDueDate, quietly, savedInvoice, visibleInvoiceForm, eligible, supports, actionState, SerialChanges, saveDraft, submitConfirmed, totalField, ensureExactHalalas, rowFieldStatus, setLineValue, makePaymentEntry, settlementCreatesPayment, mixedPaymentSelected, lineTaxes, receiptMethod, settlementValue, roundMoney, balancedPaymentPair, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, loadVatProfiles, vatTreatment, clearItemTaxOverrides, setVatIncludedInPrice, recalculateVatTreatment, applyVatTreatment, showInvoiceDelivery, whatsappNumber, invoicePdfUrl, profiles: PROFILES };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (!profileFor(frm)) return;
		// Let native refresh_fields finish on the next turn, but do not wait for
		// unrelated desk requests before replacing the visible native form.
		setTimeout(async () => {
			if (!visibleInvoiceForm(frm)) return;
			const page = frm.$wrapper?.[0]?.closest(".page-container");
			const release = setTimeout(() => page?.classList.add("bnd-bill-native-ready"), 8000);
			try {
			if (!supports(frm)) {
				instances.get(frm)?.dispose();
				page?.classList.add("bnd-bill-native-ready");
				return;
			}
			if (instances.has(frm)) instances.get(frm).render(); else open(frm);
			await ensureExactHalalas(frm);
			if (window.cur_frm === frm) instances.get(frm)?.render();
			} catch (error) {
				page?.classList.add("bnd-bill-native-ready");
				console.error("Bunood invoice presentation could not mount", error);
			} finally { clearTimeout(release); }
		}, 0);
	});
})();
