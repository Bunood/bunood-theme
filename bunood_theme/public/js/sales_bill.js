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
	let errorId = 0;
	let controlId = 0;
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", priceList: "selling_price_list",
			paymentMethod: "bunood_settlement_method",
			lineFields: ["qty", "rate", "price_list_rate", "discount_amount", "warehouse"],
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
		if (typeof nativeConfirm !== "function") return Promise.resolve(frm.savesubmit());
		const expectedPrompt = __("Permanently Submit {0}?", [frm.docname]);
		let accepted = false;
		frappe.confirm = function (message, yes, no) {
			if (!accepted && message === expectedPrompt) {
				accepted = true;
				return yes();
			}
			return nativeConfirm.apply(this, arguments);
		};
		try { return Promise.resolve(frm.savesubmit()); }
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
	function openInvoiceEmail(frm, readiness = {}) {
		if (!submittedCustomerInvoice(frm) || !frappe.ui?.Dialog) return;
		if (!frm.isPosReceiptHandoff && frappe.model?.can_email && !frappe.model.can_email(frm.doctype, frm)) {
			frappe.msgprint(__("You do not have permission to email this invoice."));
			return;
		}
		const doc = frm.doc;
		const dialog = new frappe.ui.Dialog({
			title: readiness.regulated ? __("Email ZATCA invoice with PDF and XML") : __("Email invoice with PDF"),
			fields: [
				{ fieldtype: "Data", fieldname: "recipient", label: __("Customer email"),
					options: "Email", reqd: 1, default: doc.contact_email || "" },
				{ fieldtype: "Data", fieldname: "subject", label: __("Subject"), reqd: 1,
					default: __("Invoice {0}", [doc.name]) },
				{ fieldtype: "Small Text", fieldname: "message", label: __("Message"), reqd: 1,
					default: __("Please find your invoice attached.") },
				{ fieldtype: "HTML", fieldname: "delivery_note" },
			],
			primary_action_label: __("Send email"),
			primary_action: async values => {
				if (!values) return;
				const send = dialog.get_primary_btn();
				send.prop("disabled", true);
				try {
					await frappe.call({ method: "bunood_theme.invoice_delivery.send_invoice_email", type: "POST",
						args: { doctype: doc.doctype, name: doc.name, ...values } });
					dialog.hide();
					frappe.show_alert({ message: readiness.regulated
						? __("Invoice email queued with its PDF and ZATCA XML.")
						: __("Invoice email queued with its PDF."), indicator: "green" });
				} catch (_) { /* Frappe displays the server-side error; keep the form available. */ }
				finally { send.prop("disabled", false); }
			},
		});
		dialog.show();
		dialog.$wrapper?.addClass("bnd-invoice-email-dialog");
		const note = dialog.fields_dict.delivery_note.$wrapper?.[0];
		if (note) node("p", "bnd-invoice-delivery-help",
			readiness.regulated
				? __("Review the address before sending. The ZATCA XML and a PDF reading copy are attached.")
				: __("Review the address before sending. A PDF copy is attached to the email."), note);
	}
	function whatsappNumber(value) {
		const raw = String(value || "").trim().replace(/[\s().-]/g, "");
		const digits = raw.replace(/^\+|^00/, "");
		return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
	}
	async function openInvoiceWhatsApp(frm, readiness = {}) {
		if (!submittedCustomerInvoice(frm) || !frappe.ui?.Dialog) return;
		const doc = frm.doc;
		let mobile = doc.contact_mobile || "";
		if (!mobile && doc.customer) {
			try {
				const result = await frappe.db.get_value("Customer", doc.customer, "mobile_no");
				mobile = result?.message?.mobile_no || "";
			} catch (_) { /* The cashier can enter the number without Customer read access. */ }
		}
		const total = `${doc.grand_total || 0} ${doc.currency || ""}`.trim();
		const dialog = new frappe.ui.Dialog({
			title: __("Share invoice on WhatsApp"),
			fields: [
				{ fieldtype: "Data", fieldname: "phone", label: __("Customer WhatsApp number"),
					reqd: 1, default: mobile, description: __("Include the country code, for example +966501234567.") },
				{ fieldtype: "Small Text", fieldname: "message", label: __("Message"),
					default: __("Your invoice is ready. Number: {0}. Total: {1}.", [doc.name, total]) },
				{ fieldtype: "HTML", fieldname: "attachment_help" },
			],
			primary_action_label: __("Open WhatsApp"),
			primary_action: () => {
				const phone = whatsappNumber(dialog.get_value("phone"));
				if (!phone) {
					frappe.msgprint(__("Enter a WhatsApp number with its country code."));
					return;
				}
				const message = String(dialog.get_value("message") || "").trim();
				window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
			},
			secondary_action_label: __("Download invoice PDF"),
			secondary_action: () => window.open(invoicePdfUrl(doc), "_blank", "noopener"),
		});
		dialog.show();
		dialog.$wrapper?.addClass("bnd-invoice-whatsapp-dialog");
		const help = dialog.fields_dict.attachment_help.$wrapper?.[0];
		if (help) {
			node("p", "bnd-invoice-delivery-help", readiness.regulated
				? __("Attach the ZATCA XML to the WhatsApp chat. The PDF is a reading copy; opening WhatsApp does not send either file automatically.")
				: __("Download the PDF and attach it in WhatsApp. Opening the chat does not send the invoice automatically."), help);
			if (readiness.regulated) button(__("Download ZATCA XML"), help,
				() => window.open(invoiceXmlUrl(doc), "_blank", "noopener"));
		}
	}
	async function showInvoiceDelivery(frm, justSubmitted = false) {
		if (!submittedCustomerInvoice(frm) || !frappe.ui?.Dialog) return;
		let readiness;
		try { readiness = await deliveryStatus(frm.doc); }
		catch (_) { frappe.msgprint(__("Invoice delivery status is unavailable. Try again shortly.")); return; }
		if (!readiness.ready) {
			if (justSubmitted) frappe.show_alert({ message: readiness.reason || __("Invoice delivery is not ready."), indicator: "orange" });
			else frappe.msgprint(readiness.reason || __("Invoice delivery is not ready."));
			return;
		}
		const dialog = new frappe.ui.Dialog({
			title: justSubmitted ? __("Invoice submitted") : __("Send invoice to customer"),
			fields: [{ fieldtype: "HTML", fieldname: "delivery_options" }],
		});
		dialog.show();
		dialog.$wrapper?.addClass("bnd-invoice-delivery-dialog");
		const body = dialog.fields_dict.delivery_options.$wrapper?.[0];
		if (!body) return;
		const intro = node("div", "bnd-invoice-delivery-intro", null, body);
		const mark = node("span", "bnd-invoice-delivery-mark", null, intro);
		mark.innerHTML = frappe.utils.icon("check-circle", "lg");
		mark.setAttribute("aria-hidden", "true");
		node("p", "", justSubmitted
			? __("The invoice is posted. How would you like to share it with the customer?")
			: __("Choose how to share this submitted invoice with the customer."), intro);
		const actions = node("div", "bnd-invoice-delivery-actions", null, body);
		button(readiness.regulated ? __("Email with PDF and XML") : __("Email with PDF"), actions,
			() => { dialog.hide(); openInvoiceEmail(frm, readiness); }, true);
		button(__("WhatsApp"), actions, () => { dialog.hide(); void openInvoiceWhatsApp(frm, readiness); });
		button(__("Later"), actions, () => dialog.hide());
	}
	function previewInvoice(doctype, name, sandbox = true, autoPrint = false) {
		const key = `${doctype}:${name}`;
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
			if (autoPrint && !sandbox) { frame.contentWindow.focus(); frame.contentWindow.print(); }
		};
		const method = sandbox ? "preview_sandbox_invoice" : "preview_customer_invoice";
		void frappe.call({ method: `bunood_theme.invoice_delivery.${method}`, type: "GET", args: { doctype, name } })
			.then(response => {
				if (!active) return;
				if (!response.message?.html) throw new Error("Empty print preview");
				frame.srcdoc = response.message.html;
				body.append(frame);
			}).catch(() => { if (active) status.textContent = __("Invoice print preview is unavailable. Try again shortly."); });
	}
	api.invoice_print_preview = previewInvoice;
	async function printCustomerInvoice(frm) {
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
		previewInvoice(frm.doctype, frm.doc.name, false);
	}
	class BillWorkbench {
		constructor(frm) {
			this.frm = frm; this.doc = frm.doc; this.docname = frm.doc.name; this.profile = profileFor(frm); this.controls = []; this.closed = false; this.simple = true; this.invalid = new Map(); this.pending = new Map(); this.rowViews = new Map(); this.editTimers = new Map(); this.mobileExpanded = "";
			this.queue = new SerialChanges(() => this.active(), () => this.busy());
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
			node("span", "bnd-bill-seal", "B", identity).setAttribute("aria-hidden", "true");
			const heading = node("div", "", null, identity);
			node("span", "bnd-bill-brand", "Bunood", heading);
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
			this.newButton = this.action(utilityActions, __("New"), null, null, () => this.newDocument());
			this.newButton.classList.add("bnd-bill-action-new");
			// Saving a draft remains immediately available from Invoice tools and F9,
			// but it is not a second commitment CTA in the compact bottom bar.
			this.saveButton = this.action(documentActions, __("Save draft"), "F9", "save", () => this.save());
			this.saveButton.classList.add("bnd-bill-action-draft");
			this.saveButton.dataset.bndAction = "save";
			this.submitButton = this.action(commitActions, __("Save and submit"), null, "circle-check", () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.submitPrintButton = this.action(commitActions, __("Save, submit and print"), null, "printer", () => this.submitAndPrint());
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
			// Printing is an operational action, not a maintenance tool. A draft is
			// saved and printed as it stands, without submitting it, so a customer can
			// review it first; a submitted invoice keeps Frappe's native print route.
			this.printButton = this.action(commitActions, __("Print"), null, "printer", () => this.print());
			this.printButton.classList.add("bnd-bill-action-print");
			this.printButton.setAttribute("aria-label", __("Print"));
			this.printButton.setAttribute("title", __("Print"));
			this.sendButton = this.action(documentActions, __("Send invoice to customer"), null, "send", () => showInvoiceDelivery(this.frm));
			this.sendButton.classList.add("bnd-bill-action-send");
			this.duplicateButton = this.action(documentActions, __("Duplicate"), null, "copy", () => this.duplicateDocument());
			this.cancelButton = this.action(documentActions, __("Cancel document"), null, "close", () => this.cancelDocument());
			this.cancelButton.classList.add("bnd-bill-action-danger");
			this.paymentButton = this.action(commitActions, __("Record payment"), "F7", "coins", () => this.payment(), true);
			this.paymentButton.classList.add("bnd-bill-action-save");
			this.discountButton = this.action(documentActions, __("Discount"), "F10", "percent", () => this.openDetails("discount_amount"));
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", "rotate-ccw", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "Alt+I", "search", () => this.focusItemEntry());
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
			const primaryFields = ["posting_date", ...(this.profile.paymentMethod ? [this.profile.paymentMethod] : []), ...(frm.doctype === "Purchase Invoice" ? ["bill_no"] : [])];
			for (const name of primaryFields) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(essentials, source, this.doc);
			}
			// Branch: offered only when the company has more than one; each branch is
			// tied to its warehouse (frappe.boot.bnd_branches), so choosing one is the
			// whole stock decision on this screen.
			this.branchField = node("div", "frappe-control bnd-bill-branch", null, essentials);
			this.branchField.hidden = true;
			const branchLabel = node("label", "control-label", __("Branch"), this.branchField);
			this.branchSelect = node("select", "form-control bnd-bill-branch-select", null, this.branchField);
			this.branchSelect.id = `bnd-bill-branch-${++controlId}`;
			branchLabel.htmlFor = this.branchSelect.id;
			this.branchSelect.addEventListener("change", () => this.chooseBranch(this.branchSelect.value));
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
			// No branch to choose (fewer than two): the warehouse itself stays reachable
			// here, for a business that moves stock. Its native dependency on
			// update_stock would hide it before the stock default below applies.
			const movesStock = frappe.boot?.bnd_business_type === "Stock" || Number(this.doc.update_stock) === 1;
			if (movesStock && this.branches().length < 2 && frm.fields_dict.set_warehouse)
				this.bindControl(extraEssentials, frm.fields_dict.set_warehouse, this.doc, false, () => this.warehouseStatus());
			if (frm.doctype === "Sales Invoice") {
				const invoiceNumber = node("div", "frappe-control bnd-bill-static-field bnd-bill-invoice-number", null, extraEssentials);
				invoiceNumber.dataset.fieldname = "bnd_invoice_number";
				node("label", "control-label", __("Invoice number"), invoiceNumber);
				this.invoiceNumberValue = node("output", "bnd-bill-static-value", "", invoiceNumber);
				this.invoiceNumberValue.dir = "auto";
			}
			const items = node("section", "bnd-bill-panel bnd-bill-items", null, main);
			const itemsHead = node("header", "bnd-bill-items-head", null, items);
			node("h3", "", __("Items"), itemsHead);
			this.itemCount = node("span", "bnd-bill-hint bnd-bill-item-count", "", itemsHead);
			// The scan box sits above the lines: a barcode scanner types into it and
			// presses Enter, and so can a person with an item code. ERPNext's own
			// BarcodeScanner places the item, so a second scan raises the quantity.
			const scan = node("div", "bnd-bill-scan bnd-bill-draft-only", null, items);
			scan.setAttribute("role", "search");
			this.scanButton = button("", scan, () => this.focusScan());
			this.scanButton.classList.add("bnd-bill-icon-button", "bnd-bill-scan-icon");
			this.scanButton.innerHTML = frappe.utils.icon("scan", "sm");
			this.scanButton.setAttribute("aria-label", __("Scan barcode"));
			this.scanButton.title = __("Scan barcode");
			this.scanInput = node("input", "bnd-bill-scan-input", null, scan);
			this.scanInput.type = "text";
			this.scanInput.autocomplete = "off";
			this.scanInput.spellcheck = false;
			this.scanInput.placeholder = __("Scan a barcode or type an item code, then press Enter");
			this.scanInput.setAttribute("aria-label", __("Scan a barcode or type an item code, then press Enter"));
			this.scanInput.addEventListener("keydown", e => {
				if (e.key !== "Enter" || e.isComposing) return;
				e.preventDefault(); e.stopPropagation();
				void this.scanCode(this.scanInput.value);
			});
			node("kbd", "bnd-bill-scan-key", "F2", scan).setAttribute("aria-hidden", "true");
			const search = node("div", "bnd-bill-search bnd-bill-draft-only", null, items);
			this.addLineButton = button(__("Add line"), search, () => this.addBlankLine(true), true);
			if (this.profile.newItem && (frappe.boot.user.can_create || []).includes("Item")) {
				this.newItemButton = button(__("New item"), search, () => this.newItem());
				node("kbd", "bnd-bill-search-key", "F4", this.newItemButton).setAttribute("aria-hidden", "true");
			}
			this.lines = node("div", "bnd-bill-lines", null, items);
			this.lineHead = node("div", "bnd-bill-line-head", null, this.lines);
			const rowHead = node("span", "bnd-bill-head-row", "#", this.lineHead);
			rowHead.setAttribute("aria-label", __("Row"));
			for (const label of [
				__("Item"),
				...this.profile.lineFields.map(name => LINE_LABELS[name]?.() || __(name)),
				__("Amount"),
				__("Actions"),
			]) node("span", "", label, this.lineHead);
			items.append(this.lines, search);
			this.amountSummary = node("section", "bnd-bill-amount-summary", null, items);
			this.amountSummary.setAttribute("aria-label", __("Bill total"));
			this.amountSummary.setAttribute("aria-live", "polite");
			const amountSummaryHead = node("header", "bnd-bill-amount-summary-head", null, this.amountSummary);
			node("h3", "", __("Bill total"), amountSummaryHead);
			this.vatChoice = node("fieldset", "bnd-vat-treatment bnd-bill-draft-only", null, amountSummaryHead);
			node("legend", "", __("VAT treatment"), this.vatChoice);
			const vatOptions = node("div", "bnd-vat-treatment-options", null, this.vatChoice);
			vatOptions.setAttribute("role", "radiogroup");
			vatOptions.setAttribute("aria-label", __("VAT treatment"));
			this.vatStandardButton = button(__("VAT added to price"), vatOptions, () => this.selectVatTreatment(VAT_STANDARD));
			this.vatIncludedButton = button(__("Price includes VAT"), vatOptions, () => this.selectVatTreatment(VAT_INCLUDED));
			this.vatExemptButton = button(__("VAT exempt (0%)"), vatOptions, () => this.selectVatTreatment(VAT_EXEMPT));
			for (const choice of [this.vatStandardButton, this.vatIncludedButton, this.vatExemptButton]) choice.setAttribute("role", "radio");
			this.vatChoiceStatus = node("small", "bnd-vat-treatment-status", __("Loading VAT choices…"), this.vatChoice);
			this.amountBreakdown = node("dl", "bnd-bill-amount-breakdown", null, this.amountSummary);
			this.amountGrand = node("div", "bnd-bill-amount-grand", null, this.amountSummary);
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
		renderBranch() {
			if (!this.branchField) return;
			const branches = this.branches();
			const status = this.warehouseStatus();
			this.branchField.hidden = branches.length < 2 || status === "None";
			if (this.branchField.hidden) return;
			const current = this.currentBranch(branches);
			const options = branches.map(row => [row.name, __(row.label || row.name)]);
			if (!current && this.doc.set_warehouse) options.push(["", this.doc.set_warehouse]);
			const signature = JSON.stringify(options);
			if (this.branchSelect.dataset.options !== signature) {
				this.branchSelect.replaceChildren();
				for (const [value, label] of options) {
					const option = node("option", "", label, this.branchSelect);
					option.value = value;
				}
				this.branchSelect.dataset.options = signature;
			}
			this.branchSelect.value = current ? current.name : "";
			this.branchSelect.disabled = status !== "Write" || Number(this.doc.docstatus) !== 0;
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
			for (const [profileName, action] of [[VAT_STANDARD, this.vatStandardButton], [VAT_STANDARD, this.vatIncludedButton], [VAT_EXEMPT, this.vatExemptButton]]) {
				if (action) action.disabled = busy || Number(this.doc.docstatus) !== 0 || !vatPartyReady(this.frm) || this.vatProfilesLoading || !this.vatProfiles?.[profileName];
			}
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
					await setLineValue(doc, name, value, nativeSet, () => rowFieldStatus(frm, doc, "price_list_rate"));
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
			this.vatStandardButton.textContent = Number.isFinite(standardRate) && standardRate > 0
				? __("VAT added to price ({0}%)", [standardRate]) : __("VAT added to price");
			this.vatIncludedButton.textContent = Number.isFinite(standardRate) && standardRate > 0
				? __("Price includes VAT ({0}%)", [standardRate]) : __("Price includes VAT");
			for (const [name, profileName, choice] of [
				[VAT_STANDARD, VAT_STANDARD, this.vatStandardButton],
				[VAT_INCLUDED, VAT_STANDARD, this.vatIncludedButton],
				[VAT_EXEMPT, VAT_EXEMPT, this.vatExemptButton],
			]) {
				const selected = treatment === name;
				choice.setAttribute("aria-checked", String(selected));
				choice.classList.toggle("is-selected", selected);
				choice.disabled = Number(this.doc.docstatus) !== 0 || !vatPartyReady(this.frm) || this.vatProfilesLoading || !this.vatProfiles?.[profileName];
			}
			this.vatChoiceStatus.textContent = !vatPartyReady(this.frm)
				? vatPartyPrompt(this.frm)
				: this.vatProfilesLoading
				? __("Loading VAT choices…")
				: this.vatProfilesError || !this.vatProfiles?.standard || !this.vatProfiles?.exempt
					? __("VAT setup is incomplete. Configure a standard and exempt tax rule, or use Advanced.")
					: __("Uses ERPNext's configured tax category, template, and inclusive-price setting.");
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
			const byCode = defaults.naming !== "Naming Series";
			const dialog = this.itemDialog = new frappe.ui.Dialog({
				title: __("New item"),
				fields: [
					{ fieldname: "item_code", fieldtype: "Data", label: __("Item code"), reqd: byCode ? 1 : 0, default: prefill.item_code || (byCode ? defaults.next_code || "" : "") },
					{ fieldtype: "Column Break" },
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
			setTimeout(() => dialog.fields_dict[dialog.get_value("item_code") ? "item_name" : "item_code"]?.set_focus?.(), 200);
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
					const info = node("div", "bnd-bill-item", null, body);
					const itemName = node("strong", "bnd-bill-item-name", "", info);
					const itemDf = frappe.meta.get_docfield(row.doctype, "item_code", row.name) || grid.get_docfield("item_code");
					if (itemDf) this.bindControl(info, {
						df: { ...itemDf, label: __("Item"), placeholder: __("Description or search items") },
						get_query: grid.get_field("item_code")?.get_query,
					}, row, true);
					const itemMeta = node("bdi", "bnd-bill-hint bnd-bill-item-meta", "", info);
				for (const name of this.profile.lineFields) {
					const cell = node("div", `bnd-bill-cell bnd-bill-cell-${name}`, null, body);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, {
						df: { ...df, label: LINE_LABELS[name]?.() || __(df.label) },
						get_query: grid.get_field(name)?.get_query,
					}, row, true);
				}
				const amount = node("div", "bnd-bill-line-total", null, body);
					view = { line, toggle, toggleIndex, toggleTitle, toggleAmount, body, rowNumber, info, itemName, itemMeta, amount };
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
				view.itemMeta.textContent = [row.item_code && row.item_code !== row.item_name ? `${__("Item code")}: ${row.item_code}` : "", row.uom ? __(row.uom) : ""].filter(Boolean).join(" · ");
				view.toggle.setAttribute("aria-label", `${__("Item")} ${position}: ${row.item_name || row.item_code || __("New line")}`);
				amount.replaceChildren();
				view.toggleAmount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
					this.money(view.toggleAmount, row.amount, df, row);
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
			this.cancelButton.hidden = !nativeActions.showCancel;
			this.paymentButton.hidden = !nativeActions.showRecordPayment;
			this.printButton.hidden = !nativeActions.showPrint && !showSubmit; this.discountButton.hidden = !draft;
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
			let missing, submitted = false, paymentFailed = false;
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
				const settlement = settlementValue(this.doc);
				const createPayment = settlementCreatesPayment(settlement);
				const mixedAmounts = mixedPaymentSelected(settlement) ? await this.promptMixedPayment() : null;
				if (mixedPaymentSelected(settlement) && !mixedAmounts) return;
				if (this.doc.__islocal || this.frm.is_dirty()) {
					this.message(__("Saving invoice…"));
					const local = this.doc.__islocal ? this.doc.name : "";
					await saveDraft(this.frm);
					if (!this.active() && !(local && window.cur_frm === this.frm && frappe.model?.new_names?.[local] === this.frm.doc.name)) return;
				} else if (!this.active()) return;
				this.message(__("Submitting invoice…"));
				await submitConfirmed(this.frm);
				submitted = Number(this.frm.doc.docstatus) === 1;
				if (createPayment && Number(this.frm.doc.docstatus) === 1) {
					this.message(__("Recording payment…"));
					try {
						if (mixedAmounts) await this.postMixedPayment(mixedAmounts, true);
						else await makePaymentEntry(this.frm, true);
					}
					catch (error) {
						paymentFailed = true;
						this.message(__("Invoice submitted, but payment could not be recorded: {0}", [error.message]), true);
					}
				}
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); if (missing && this.active()) missing.control?.set_focus(); }
			if (submitted && printAfter) void printCustomerInvoice(this.frm);
			if (submitted && !printAfter && !paymentFailed && this.frm.doctype === "Sales Invoice") showInvoiceDelivery(this.frm, true);
			return submitted;
		}
		submitAndPrint() { return this.submit({ printAfter: true }); }
		newDocument() { if (this.active() && !this.queue.count && !this.saving && !this.flushing && !this.closing) return frappe.new_doc(this.frm.doctype); }
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		duplicateDocument() { if (!this.doc.__islocal) return this.frm.copy_doc(); }
		cancelDocument() { if (Number(this.doc.docstatus) === 1) return this.frm.savecancel(); }
		async print() {
			if (this.saving || this.closing) return;
			if (Number(this.doc.docstatus) === 0) {
				// Preview before commitment: save the draft as it stands and open
				// Frappe's print view; nothing is submitted.
				if ((this.doc.__islocal || this.frm.is_dirty()) && !await this.save()) return;
				if (this.active()) this.frm.print_doc();
				return;
			}
			void printCustomerInvoice(this.frm);
		}
		restore() {
			const reload = () => this.frm.reload_doc().then(() => { this.syncDocument(); this.render(); });
			if (this.frm.is_dirty()) frappe.confirm(__("Discard unsaved changes and reload this document?"), reload); else reload();
		}
		async promptMixedPayment() {
			const precision = Number(frappe.boot?.sysdefaults?.currency_precision) || 2;
			const currentOutstanding = Number(this.doc.outstanding_amount);
			const amountDue = roundMoney(currentOutstanding > 0 ? currentOutstanding : this.doc[totalField(this.frm)], precision);
			if (amountDue <= 0) throw Error(__("This invoice has no outstanding amount to receive."));
			const cashDefault = roundMoney(amountDue / 2, precision);
			const networkDefault = roundMoney(amountDue - cashDefault, precision);

			return new Promise(resolve => {
				let settled = false;
				const finish = value => { if (!settled) { settled = true; resolve(value); } };
				const dialog = new frappe.ui.Dialog({
					title: __("Split payment"),
					fields: [
						{ fieldname: "total", label: __("Amount due"), fieldtype: "Currency", options: this.doc.currency, read_only: 1, default: amountDue },
						{ fieldtype: "Column Break" },
						{ fieldname: "remaining", fieldtype: "HTML" },
						{ fieldtype: "Section Break" },
						{ fieldname: "cash_amount", label: __("Cash amount"), fieldtype: "Currency", options: this.doc.currency, reqd: 1, non_negative: 1, default: cashDefault },
						{ fieldtype: "Column Break" },
						{ fieldname: "network_amount", label: __("Network amount"), fieldtype: "Currency", options: this.doc.currency, reqd: 1, non_negative: 1, default: networkDefault },
						{ fieldtype: "Section Break" },
						{ fieldname: "network_reference_no", label: __("Network reference number"), fieldtype: "Data", reqd: 1 },
						{ fieldtype: "Column Break" },
						{ fieldname: "reference_date", label: __("Reference date"), fieldtype: "Date", reqd: 1, default: frappe.datetime.get_today() },
						{ fieldtype: "Section Break" },
						{ fieldname: "native_note", fieldtype: "HTML" },
					],
					primary_action_label: __("Submit invoice and record payments"),
					primary_action: values => {
						const cash = roundMoney(values.cash_amount, precision);
						const network = roundMoney(values.network_amount, precision);
						if (cash <= 0 || network <= 0) {
							frappe.msgprint(__("A mixed payment needs a Cash amount and a Network amount above zero."));
							return;
						}
						if (roundMoney(cash + network, precision) !== amountDue) {
							frappe.msgprint(__("Cash and Network must total the amount due."));
							return;
						}
						// Resolve before hide: Dialog.onhide fires synchronously and is the
						// cancellation path. Hiding first used to settle this Promise with
						// null, so Save and submit silently stopped at a clean draft.
						finish({ cash_amount: cash, network_amount: network, network_reference_no: values.network_reference_no, reference_date: values.reference_date });
						dialog.hide();
					},
					onhide: () => finish(null),
				});
				dialog.$wrapper?.addClass("bnd-mixed-payment-dialog");
				const remaining = dialog.fields_dict.remaining.$wrapper[0];
				remaining.classList.add("bnd-mixed-payment-balance");
				remaining.setAttribute("role", "status");
				remaining.setAttribute("aria-live", "polite");
				const note = dialog.fields_dict.native_note.$wrapper[0];
				node("p", "bnd-bill-hint", __("Two original ERPNext Payment Entries will be posted and linked to this invoice."), note);
				const update = () => {
					const cash = roundMoney(dialog.get_value("cash_amount"), precision);
					const network = roundMoney(dialog.get_value("network_amount"), precision);
					const balance = roundMoney(amountDue - cash - network, precision);
					remaining.replaceChildren();
					const label = node("span", "", balance === 0 ? __("Fully allocated") : __("Remaining"), remaining);
					const value = node("strong", balance === 0 ? "is-balanced" : "is-unbalanced", null, remaining);
					value.dir = "ltr";
					value.textContent = this.format(balance, { fieldtype: "Currency", options: this.doc.currency });
				};
				let balancing = false;
				const rebalance = async source => {
					if (balancing) return;
					balancing = true;
					try {
						const target = source === "cash_amount" ? "network_amount" : "cash_amount";
						const [changed, remainder] = balancedPaymentPair(dialog.get_value(source), amountDue, precision);
						if (roundMoney(dialog.get_value(source), precision) !== changed) await dialog.set_value(source, changed);
						await dialog.set_value(target, remainder);
						update();
					} finally { balancing = false; }
				};
				for (const name of ["cash_amount", "network_amount"]) {
					dialog.fields_dict[name].$input?.on("input change", () => void rebalance(name));
				}
				dialog.show();
				// Dialog defaults settle during show; calculate from their native values on the next paint.
				requestAnimationFrame(update);
			});
		}
		async postMixedPayment(values, atInvoiceCheckout = false) {
			const response = await frappe.call({
				method: "bunood_theme.payments.post_mixed_invoice_payment",
				args: { invoice: this.frm.doc.name, ...values,
					at_invoice_checkout: atInvoiceCheckout ? 1 : 0 },
				freeze: true,
				freeze_message: __("Recording Cash and Network payments…"),
			});
			if (response.exc || !response.message?.entries?.length) throw Error(__("Could not record the mixed payment."));
			await this.frm.reload_doc();
			this.showMixedPaymentResult(response.message);
			return response.message;
		}
		showMixedPaymentResult(result) {
			const dialog = new frappe.ui.Dialog({
				title: __("Payment recorded"),
				primary_action_label: __("Done"),
				primary_action: () => dialog.hide(),
			});
			const body = node("div", "bnd-mixed-payment-result", null, dialog.$body[0]);
			node("p", "", __("The invoice is paid. Both receipts are available in Payment Entry and the General Ledger."), body);
			for (const entry of result.entries) {
				const row = node("div", "bnd-mixed-payment-result-row", null, body);
				const copy = node("div", "", null, row);
				node("strong", "", __(entry.mode_of_payment), copy);
				node("small", "", this.format(entry.amount, { fieldtype: "Currency", options: result.currency }), copy);
				button(entry.name, row, () => { dialog.hide(); frappe.set_route("Form", "Payment Entry", entry.name); });
			}
			dialog.show();
		}
		async payment() {
			try {
				if (mixedPaymentSelected(settlementValue(this.doc))) {
					const amounts = await this.promptMixedPayment();
					if (amounts) return await this.postMixedPayment(amounts);
					return;
				}
				return await makePaymentEntry(this.frm);
			}
			catch (error) { this.message(error.message, true); }
		}
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
			refresh(frm) {
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
			tax_category: frm => scheduleVatNormalization(frm, "tax_category"),
			taxes_and_charges: frm => scheduleVatNormalization(frm, "taxes_and_charges"),
		});
		frappe.ui.form.on("POS Invoice", {
			refresh(frm) {
				if (submittedCustomerInvoice(frm)) frm.add_custom_button(
					__("Send invoice to customer"), () => showInvoiceDelivery(frm), __("Actions"));
			},
			on_submit(frm) { setTimeout(() => showInvoiceDelivery(frm, true), 0); },
		});
	}
	api.sales_bill = { open, newInvoice, visibleInvoiceForm, eligible, supports, actionState, SerialChanges, saveDraft, submitConfirmed, totalField, ensureExactHalalas, rowFieldStatus, setLineValue, makePaymentEntry, settlementCreatesPayment, mixedPaymentSelected, receiptMethod, settlementValue, roundMoney, balancedPaymentPair, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, loadVatProfiles, vatTreatment, clearItemTaxOverrides, setVatIncludedInPrice, recalculateVatTreatment, applyVatTreatment, showInvoiceDelivery, whatsappNumber, invoicePdfUrl, profiles: PROFILES };
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
