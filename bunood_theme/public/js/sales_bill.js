// Bunood Bill Workbench: the default full-page presentation of the CURRENT
// native Sales/Purchase Invoice. Advanced mode reveals the same frm.doc.
// No separate document, calculation engine, ledger, or persisted state.
// Payment orchestration delegates to ERPNext's native mapper and controllers.
// Native controls + model triggers own all changes. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	const CREDIT_SALE = "On Credit";
	const MIXED_PAYMENT = "Mixed Payment";
	let errorId = 0;
	let controlId = 0;
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", priceList: "selling_price_list",
			paymentMethod: "bunood_settlement_method",
			lineFields: ["qty", "rate", "price_list_rate", "discount_amount", "warehouse"],
			context: ["tax_id", "company", "posting_date", "due_date", "currency", "selling_price_list", "set_warehouse"],
			options: ["posting_date", "due_date", "update_stock", "set_warehouse", "currency", "selling_price_list", "payment_terms_template", "po_no"],
		},
		"Purchase Invoice": {
			party: "supplier", partyDoctype: "Supplier", title: "Purchase bill", priceList: "buying_price_list",
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
	const balancedPaymentPair = (value, total, precision = 2) => {
		const due = Math.max(0, roundMoney(total, precision));
		const requested = roundMoney(value, precision);
		const changed = Math.min(due, Math.max(0, Number.isFinite(requested) ? requested : 0));
		return [changed, roundMoney(due - changed, precision)];
	};
	const fieldStatus = (frm, name) => frm.fields_dict[name]?.get_status?.() || "None";
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
	async function ensureExactHalalas(frm) {
		if (Number(frm.doc.docstatus) !== 0 || Number(frm.doc.disable_rounded_total) ||
			!frm.fields_dict.disable_rounded_total) return false;
		await frm.set_value("disable_rounded_total", 1);
		return true;
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
	function makePaymentEntry(frm) {
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
		return !!(d && p && [0, 1].includes(Number(d.docstatus)) && !d.is_return && !d.is_pos &&
			!d.is_debit_note && !d.is_credit_note && !d.amended_from &&
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
			const toolbar = node("div", "bnd-bill-toolbar", null, intro); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", __("Document actions"));
			const commitActions = node("div", "bnd-bill-action-group bnd-bill-action-group-commit", null, toolbar);
			commitActions.setAttribute("role", "group"); commitActions.setAttribute("aria-label", __("Draft actions"));
			this.railButton = this.action(toolbar, __("Customer & preview"), null, "user", () => this.toggleRail());
			this.railButton.classList.add("bnd-bill-rail-toggle");
			this.railButton.setAttribute("aria-expanded", "false");
			this.railButton.setAttribute("aria-label", __("Customer & preview"));
			this.railButton.setAttribute("title", __("Customer & preview"));
			const tools = node("details", "bnd-bill-tools", null, toolbar);
			const toolsTrigger = node("summary", "", null, tools);
			const toolsIcon = node("span", "bnd-bill-action-icon", null, toolsTrigger);
			toolsIcon.innerHTML = frappe.utils.icon("more-horizontal", "sm");
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
			// Saving a draft remains immediately available from Invoice tools and F2,
			// but it is not a second commitment CTA in the compact bottom bar.
			this.saveButton = this.action(documentActions, __("Save draft"), "F2", "save", () => this.save());
			this.saveButton.classList.add("bnd-bill-action-draft");
			this.saveButton.dataset.bndAction = "save";
			this.submitButton = this.action(commitActions, __("Save and submit"), null, null, () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.submitPrintButton = this.action(commitActions, __("Save, submit and print"), null, "printer", () => this.submitAndPrint());
			this.submitPrintButton.classList.add("bnd-bill-action-submit-print");
			this.submitPrintButton.dataset.bndAction = "submit-print";
			this.saveAndNewButton = this.action(utilityActions, __("Save and create new"), null, null, () => this.saveAndNew());
			this.mobileTotal = node("div", "bnd-bill-mobile-total", null, commitActions);
			node("span", "", __("Total"), this.mobileTotal);
			this.mobileTotalValue = node("strong", "", "", this.mobileTotal);
			this.partyButton = this.action(documentActions, __(this.profile.partyDoctype), "F3", "user", () => this.partyControl?.set_focus());
			this.deleteButton = this.action(documentActions, __("Delete"), "F4", "delete", () => this.removeDocument());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			// Printing is an operational action, not a maintenance tool. Keep it in
			// the visible action group beside Record payment while continuing to use
			// Frappe's native print route.
			this.printButton = this.action(commitActions, __("Print"), null, "printer", () => this.print());
			this.printButton.classList.add("bnd-bill-action-print");
			this.duplicateButton = this.action(documentActions, __("Duplicate"), null, "copy", () => this.duplicateDocument());
			this.cancelButton = this.action(documentActions, __("Cancel document"), null, "close", () => this.cancelDocument());
			this.cancelButton.classList.add("bnd-bill-action-danger");
			this.paymentButton = this.action(commitActions, __("Record payment"), "F7", "coins", () => this.payment(), true);
			this.paymentButton.classList.add("bnd-bill-action-save");
			this.discountButton = this.action(documentActions, __("Discount"), "F10", "percent", () => { this.discount.open = !this.discount.open; this.discount.scrollIntoView({ block: "nearest" }); });
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", "rotate-ccw", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "Alt+I", "search", () => this.focusItemEntry());
			this.status = node("p", "bnd-bill-status", "", this.root);
			this.status.setAttribute("role", "status");
			this.revertButton = button(__("Revert invalid edits"), this.root, () => { for (const key of this.invalid.keys()) this.pending.delete(key); this.invalid.clear(); this.render(); this.message(__("Changes stay in this invoice when you close this view.")); });
			this.revertButton.hidden = true;
			this.editor = node("fieldset", "bnd-bill-editor", null, this.root);
			const layout = node("div", "bnd-bill-layout", null, this.editor);
			const main = node("div", "bnd-bill-main", null, layout);
			const customer = node("section", "bnd-bill-panel bnd-bill-party", null, main);
			const customerHead = node("header", "bnd-bill-section-head", null, customer);
			node("h3", "", __(this.profile.partyDoctype), customerHead);
			if ((frappe.boot.user.can_create || []).includes(this.profile.partyDoctype) && fieldStatus(frm, this.profile.party) === "Write") {
				this.newPartyButton = button(__("New {0}", [__(this.profile.partyDoctype).toLowerCase()]), customerHead, () => this.newParty());
			}
			const essentials = node("div", "bnd-bill-essentials", null, customer);
			this.partyControl = this.bindControl(essentials, frm.fields_dict[this.profile.party], this.doc);
			const primaryFields = ["posting_date", "due_date", ...(this.profile.paymentMethod ? [this.profile.paymentMethod] : []), ...(frm.doctype === "Purchase Invoice" ? ["bill_no", "bill_date"] : [])];
			for (const name of primaryFields) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(essentials, source, this.doc);
			}
			if (frm.doctype === "Sales Invoice") {
				const invoiceNumber = node("div", "frappe-control bnd-bill-static-field bnd-bill-invoice-number", null, essentials);
				invoiceNumber.dataset.fieldname = "bnd_invoice_number";
				node("label", "control-label", __("Invoice number"), invoiceNumber);
				this.invoiceNumberValue = node("output", "bnd-bill-static-value", "", invoiceNumber);
				this.invoiceNumberValue.dir = "auto";
			}
			this.context = node("dl", "bnd-bill-context", null, customer);
			const items = node("section", "bnd-bill-panel bnd-bill-items", null, main);
			node("h3", "", __("Items"), items);
			this.inlineStockOptions = new Set();
			if (frm.doctype === "Sales Invoice") {
				const stockSettings = node("section", "bnd-bill-stock-settings", null, items);
				stockSettings.setAttribute("aria-label", __("Stock movement"));
				const updateSource = frm.fields_dict.update_stock;
				if (updateSource && fieldStatus(frm, "update_stock") !== "None") {
					this.stockUpdateControl = this.bindControl(stockSettings, updateSource, this.doc);
					this.stockUpdateControl?.$wrapper?.[0]?.classList.add("bnd-bill-stock-toggle");
					if (this.stockUpdateControl) this.inlineStockOptions.add("update_stock");
				}
				const warehouseSource = frm.fields_dict.set_warehouse;
				if (warehouseSource) {
					// The native field can be hidden by its `update_stock` dependency while
					// the simple view is mounting. Ignore only that transient dependency flag;
					// the original field's hidden/disabled/permission/docstatus rules still
					// decide whether this native Link control may be shown or edited.
					const warehouseStatus = () => frappe.perm.get_field_display_status(
						{ ...warehouseSource.df, hidden_due_to_dependency: 0 }, this.doc, frm.perm,
					);
					this.stockWarehouseControl = this.bindControl(stockSettings, warehouseSource, this.doc, false, warehouseStatus);
					this.stockWarehouseControl?.$wrapper?.[0]?.classList.add("bnd-bill-stock-source");
					if (this.stockWarehouseControl) this.inlineStockOptions.add("set_warehouse");
				}
				this.stockNote = node("p", "bnd-bill-stock-note", "", stockSettings);
				if (!this.stockUpdateControl) stockSettings.remove(); else this.stockSettings = stockSettings;
			}
			const search = node("div", "bnd-bill-search bnd-bill-draft-only", null, items);
			this.addLineButton = button(__("Add line"), search, () => this.addBlankLine(true), true);
			this.newItemButton = button(__("New item"), search, () => this.newItem());
			this.scanButton = button(__("Scan barcode"), search, () => this.scanItem());
			const lineHint = node("p", "bnd-bill-hint bnd-bill-draft-only", __("Type or search directly in the item column. Use Add line when you need another item."), items);
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
			items.append(this.lines, search, lineHint);
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
			this.railScrim = button("", layout, () => this.toggleRail(false));
			this.railScrim.classList.add("bnd-bill-rail-scrim");
			this.railScrim.setAttribute("aria-label", __("Close customer and preview panel"));
			this.rail = node("aside", "bnd-bill-panel bnd-bill-rail", null, layout);
			this.rail.id = `bnd-bill-rail-${++controlId}`;
			this.railButton.setAttribute("aria-controls", this.rail.id);
			const railHead = node("header", "bnd-bill-rail-head", null, this.rail);
			const railTabs = node("div", "bnd-bill-rail-tabs", null, railHead);
			railTabs.setAttribute("role", "tablist");
			this.customerTab = button(__(this.profile.partyDoctype), railTabs, () => this.selectRailTab("customer"));
			this.customerTab.setAttribute("role", "tab");
			this.previewTab = button(__("Preview"), railTabs, () => this.selectRailTab("preview"));
			this.previewTab.setAttribute("role", "tab");
			this.railClose = button("×", railHead, () => this.toggleRail(false));
			this.railClose.classList.add("bnd-bill-rail-close");
			this.railClose.setAttribute("aria-label", __("Close customer and preview panel"));
			this.customerSummary = node("section", "bnd-bill-customer-summary", null, this.rail);
			this.customerSummary.setAttribute("role", "tabpanel");
			this.preview = node("section", "bnd-bill-preview", null, this.rail);
			this.preview.setAttribute("role", "tabpanel");
			this.preview.setAttribute("aria-live", "polite");
			node("h3", "", __("Bill total"), this.rail);
			this.totals = node("dl", "bnd-bill-totals", null, this.rail);
			if (frm.doctype === "Sales Invoice") {
				this.settlementNote = node("div", "bnd-bill-settlement-note bnd-bill-draft-only", null, this.rail);
			}
			this.stock = node("p", "bnd-bill-hint bnd-bill-draft-only", null, this.rail);
			if (frm.doctype === "Sales Invoice") {
				this.zatca = node("details", "bnd-bill-options", null, this.rail); this.zatca.open = true;
				this.zatca.dataset.bndPart = "zatca-status";
				node("summary", "", __("ZATCA e-invoicing"), this.zatca);
				this.zatcaStatus = node("p", "bnd-bill-hint", __("Checking ZATCA setup…"), this.zatca);
				this.zatcaMeta = node("p", "bnd-bill-hint", "", this.zatca);
				this.zatcaButton = button(__("Refresh status"), this.zatca, () => this.zatcaAction());
				this.zatcaButton.hidden = true;
			}
			const options = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Document options"), options);
			for (const name of this.profile.options) {
				if (primaryFields.includes(name) || this.inlineStockOptions.has(name)) continue;
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(options, source, this.doc);
			}
			this.discount = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Discount and tax"), this.discount);
			for (const name of ["apply_discount_on", "additional_discount_percentage", "discount_amount"]) {
				const source = frm.fields_dict[name]; if (source && fieldStatus(frm, name) !== "None") this.bindControl(this.discount, source, this.doc);
			}
			node("p", "bnd-bill-hint bnd-bill-draft-only", __("A draft does not post accounts, move stock, or record payment. Submission uses the native validation and confirmation flow."), this.rail);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				if (e.key !== "Escape" || popupWasOpen) return;
				e.preventDefault();
				if (this.root.dataset.bndRailOpen === "true") this.toggleRail(false);
				else this.fullInvoice();
			});
			this.root.addEventListener("keydown", e => this.shortcut(e, true), true);
			this.root.dataset.bndRailOpen = "false";
			this.selectRailTab("preview");
			this.setMode(true); this.render(); this.applyDefaultTax(); this.loadVatChoices();
			frappe.after_ajax(() => {
				if (this.active() && this.doc.__islocal && !this.doc[this.profile.party] &&
					!this.root.contains(document.activeElement)) this.partyControl?.set_focus();
			});
		}
		toggleRail(force) {
			const open = typeof force === "boolean" ? force : this.root.dataset.bndRailOpen !== "true";
			this.root.dataset.bndRailOpen = String(open);
			this.railButton?.setAttribute("aria-expanded", String(open));
			if (open) this.railClose?.focus({ preventScroll: true });
			else if (this.rail?.contains(document.activeElement)) this.railButton?.focus({ preventScroll: true });
		}
		selectRailTab(tab) {
			const customer = tab === "customer";
			this.customerSummary.hidden = !customer;
			this.preview.hidden = customer;
			this.customerTab.setAttribute("aria-selected", String(customer));
			this.previewTab.setAttribute("aria-selected", String(!customer));
			this.customerTab.tabIndex = customer ? 0 : -1;
			this.previewTab.tabIndex = customer ? -1 : 0;
		}
		action(parent, label, key, icon, handler, primary = false) {
			const b = button("", parent, handler, primary); b.classList.add("bnd-bill-action");
			return window.bunood_theme.document_actions.decorateAction(b, { label, key, icon });
		}
		shortcut(e, local = false) {
			if (!this.simple || (!local && !this.active()) || e.target?.closest?.(".modal")) return;
			const keys = { F2: () => this.save(), F3: () => this.partyControl?.set_focus(), F4: () => this.removeDocument(), F7: () => this.payment(), F10: () => this.discountButton.click(), F11: () => this.restore() };
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
			for (const action of [this.saveButton, this.submitButton, this.submitPrintButton, this.newButton, this.advancedButton, this.scanButton, this.newPartyButton]) if (action) action.disabled = busy;
			for (const [profileName, action] of [[VAT_STANDARD, this.vatStandardButton], [VAT_STANDARD, this.vatIncludedButton], [VAT_EXEMPT, this.vatExemptButton]]) {
				if (action) action.disabled = busy || Number(this.doc.docstatus) !== 0 || !vatPartyReady(this.frm) || this.vatProfilesLoading || !this.vatProfiles?.[profileName];
			}
			for (const { remove, duplicate } of this.rowViews.values()) {
				if (remove) remove.disabled = busy;
				if (duplicate) duplicate.disabled = busy;
			}
			if (this.zatcaButton) this.zatcaButton.disabled = busy || !!this.zatcaSending;
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
				__("Remove {0} from this invoice?", [label]),
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
		async newItem() {
			if (!(frappe.boot.user.can_create || []).includes("Item")) {
				this.message(__("You do not have permission to create an item."), true);
				return;
			}
			await this.ensureEntryRow();
			const entry = this.entryControl();
			if (!entry) return;
			return frappe.ui.form.make_quick_entry("Item", doc => {
				if (!this.active()) return;
				return entry.control.set_value(doc.name);
			}, quickEntry => this.addItemStockAndPriceFields(quickEntry));
		}
		addItemStockAndPriceFields(entry) {
			if (!entry?.add_fields || !entry.doc || entry.__bnd_item_fields) return;
			entry.__bnd_item_fields = true;
			entry.wrapper?.[0]?.closest(".modal")?.classList.add("bnd-item-quick-entry");
			const permitted = name => {
				const df = frappe.meta.get_docfield("Item", name);
				if (!df || df.read_only) return null;
				// ERPNext hides opening_stock on the full Item form; this quick
				// entry intentionally reveals it. Check actual write permission on
				// a copy with that presentation-only flag cleared.
				const shown = name === "opening_stock" ? { ...df, hidden: 0, hidden_due_to_dependency: 0 } : df;
				const status = frappe.perm.get_field_display_status(shown, entry.doc, frappe.perm.get_perm("Item"));
				return status === "Write" ? df : null;
			};
			const fields = [];
			for (const name of ["standard_rate", "opening_stock", "valuation_rate"]) {
				const df = permitted(name);
				if (df && !entry.fields_dict?.[name]) fields.push({ ...df, hidden: 0, hidden_due_to_dependency: 0 });
			}
			const company = this.doc.company;
			if (company && permitted("opening_stock")) {
				fields.push({
					fieldname: "__bnd_opening_warehouse",
					fieldtype: "Link",
					options: "Warehouse",
					label: __("Warehouse"),
					get_query: () => ({ filters: { company, is_group: 0 } }),
					default: this.doc.set_warehouse || "",
				});
			}
			if (!fields.length) return;
			entry.add_fields(fields);
			const stock = entry.fields_dict?.opening_stock;
			const warehouse = entry.fields_dict?.__bnd_opening_warehouse;
			const cost = entry.fields_dict?.valuation_rate;
			const syncStockFields = () => {
				const hasOpening = Number(stock?.get_value() || 0) > 0;
				if (warehouse) entry.toggle_reqd("__bnd_opening_warehouse", hasOpening);
				if (cost) entry.toggle_reqd("valuation_rate", hasOpening);
			};
			if (stock) {
				const previous = stock.df.onchange;
				stock.df.onchange = function (...args) {
					if (previous) previous.apply(this, args);
					syncStockFields();
				};
			}
			if (warehouse && this.doc.set_warehouse) warehouse.set_value(this.doc.set_warehouse);
			syncStockFields();
			const updateDoc = entry.update_doc.bind(entry);
			entry.update_doc = () => {
				const doc = updateDoc();
				const selected = warehouse?.get_value();
				const sellingPriceList = this.frm.doctype === "Sales Invoice" ? this.doc.selling_price_list : "";
				delete doc.__bnd_opening_warehouse;
				if (company && (selected || sellingPriceList)) {
					doc.item_defaults = [{ doctype: "Item Default", company,
						...(selected ? { default_warehouse: selected } : {}),
						...(sellingPriceList ? { default_price_list: sellingPriceList } : {}),
					}];
				}
				return doc;
			};
		}
		scanItem() {
			if (!window.frappe?.ui?.Scanner) { this.message(__("Camera scanning is not available in this browser. Type the barcode in item search."), true); return; }
			new frappe.ui.Scanner({ dialog: true, multiple: false, on_scan: data => {
				const value = data?.result?.text; if (!value || !this.active()) return;
				this.ensureEntryRow().then(() => {
					const entry = this.entryControl();
					if (entry) entry.control.set_value(value);
				});
			} });
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
		customerAccountKey() {
			if (this.frm.doctype !== "Sales Invoice" || !this.doc.customer || !this.doc.company) return "";
			return `${this.doc.customer}:${this.doc.company}:${this.doc.name || "new"}:${this.doc.docstatus}`;
		}
		loadCustomerAccount() {
			const key = this.customerAccountKey();
			if (!key || key === this.accountSummaryKey) return;
			this.accountSummaryKey = key; this.accountSummary = null; this.accountSummaryLoading = true;
			const request = this.accountSummaryRequest = (this.accountSummaryRequest || 0) + 1;
			frappe.call({
				method: "bunood_theme.api.get_customer_account_summary",
				type: "GET",
				args: { customer: this.doc.customer, company: this.doc.company },
			}).then(response => {
				if (!this.active() || request !== this.accountSummaryRequest || key !== this.customerAccountKey()) return;
				this.accountSummary = response.message || null; this.accountSummaryLoading = false; this.renderCustomerSummary();
			}).catch(() => {
				if (request !== this.accountSummaryRequest) return;
				this.accountSummaryLoading = false; this.accountSummary = { unavailable: true }; this.renderCustomerSummary();
			});
		}
		openCustomerStatement() {
			if (!this.doc.customer || !this.doc.company) return;
			frappe.set_route("query-report", "General Ledger", {
				company: this.doc.company,
				party_type: "Customer",
				party: [this.doc.customer],
			});
		}
		async loadZatca(force = false) {
			if (!this.zatca || !this.active()) return;
			const key = `${this.doc.name || "new"}:${this.doc.docstatus}:${this.doc.company || ""}`;
			if (!force && this.zatcaKey === key) return;
			this.zatcaKey = key;
			const request = this.zatcaRequest = (this.zatcaRequest || 0) + 1;
			this.zatcaStatus.textContent = __("Checking ZATCA setup…");
			try {
				const args = this.doc.__islocal ? { company: this.doc.company } : { invoice_name: this.doc.name, company: this.doc.company };
				const response = await frappe.call({ method: "bunood_theme.zatca.status.get_status", type: "GET", args });
				if (!this.active() || request !== this.zatcaRequest) return;
				this.zatcaData = response.message || {}; this.renderZatca();
			} catch (error) {
				if (request !== this.zatcaRequest) return;
				this.zatcaStatus.textContent = error.message || __("ZATCA status is temporarily unavailable.");
				this.zatcaStatus.classList.add("bnd-bill-error"); this.zatcaButton.hidden = false;
			}
		}
		renderZatca() {
			const data = this.zatcaData || {}, state = data.state || "missing_app";
			const messages = {
				missing_app: __("The ZATCA connector is not installed on this site."),
				needs_settings: __("Create ZATCA Business Settings for this company."),
				disabled: __("ZATCA integration is disabled for this company."),
				needs_onboarding: __("Complete device onboarding with the OTP from Fatoora."),
				needs_csid: __("Run compliance checks, then obtain the production CSID."),
				ready: __("ZATCA is ready. This invoice will be prepared when it is submitted."),
				preparing: __("The signed invoice is being prepared for ZATCA."),
				ready_to_send: __("The signed invoice is ready to send to ZATCA."),
				accepted: __("ZATCA accepted this invoice."),
				accepted_with_warnings: __("ZATCA accepted this invoice with warnings."),
				duplicate_response: __("ZATCA returned a duplicate response. Reconcile it with the original submission before treating this invoice as accepted."),
				rejected: __("ZATCA rejected this invoice. Open the validation record before correcting it."),
				clearance_off: __("ZATCA clearance is switched off. Review the validation record and company settings."),
			};
			this.zatcaStatus.classList.toggle("bnd-bill-error", state === "rejected" || state === "missing_app");
			this.zatcaStatus.classList.toggle("bnd-bill-warning", ["accepted_with_warnings", "duplicate_response", "clearance_off"].includes(state));
			this.zatcaStatus.textContent = messages[state] || __("ZATCA status is temporarily unavailable.");
			const settings = data.settings || {}, invoice = data.invoice || {};
			const operational = ["ready", "preparing", "ready_to_send", "accepted", "accepted_with_warnings", "duplicate_response", "rejected", "clearance_off"].includes(state);
			const technical = (frappe.boot?.user?.roles || []).some(role => ["Accounts Manager", "System Manager"].includes(role));
			this.zatcaMeta.textContent = operational ?
				[technical && settings.server, technical && settings.sync, invoice.integration_status].filter(Boolean).map(value => __(value)).join(" · ") : "";
			let label = "";
			if (["needs_settings", "disabled", "needs_onboarding", "needs_csid", "ready"].includes(state)) label = __("ZATCA settings");
			else if (state === "preparing") label = __("Refresh status");
			else if (state === "ready_to_send" && data.can_queue) label = __("Send to ZATCA");
			else if (invoice.name) label = __("View ZATCA record");
			this.zatcaButton.textContent = label; this.zatcaButton.hidden = !label;
			clearTimeout(this.zatcaTimer);
			if (state === "preparing") this.zatcaTimer = setTimeout(() => this.loadZatca(true), 5000);
		}
		async zatcaAction() {
			if (this.zatcaButton.disabled) return;
			const data = this.zatcaData || {}, state = data.state;
			if (state === "missing_app") {
				frappe.msgprint(__("Install and migrate the KSA Compliance app before configuring ZATCA.")); return;
			}
			if (state === "preparing") return this.loadZatca(true);
			if (state === "ready_to_send" && data.can_queue) {
				this.zatcaSending = true; this.busy();
				try {
					await frappe.call({ method: "bunood_theme.zatca.status.queue_invoice", type: "POST", args: { invoice_name: this.doc.name }, freeze: true, freeze_message: __("Queueing invoice for ZATCA…") });
					this.zatcaStatus.textContent = __("Invoice queued for ZATCA. Status will update automatically.");
					setTimeout(() => this.loadZatca(true), 2500);
				} finally { this.zatcaSending = false; this.busy(); }
				return;
			}
			if (data.invoice?.name) { frappe.set_route("Form", "Sales Invoice Additional Fields", data.invoice.name); return; }
			const route = data.settings?.route;
			if (route?.length) frappe.set_route(...route);
		}
		setExpandedLine(name) {
			this.mobileExpanded = name;
			for (const [rowName, view] of this.rowViews) {
				const expanded = rowName === name;
				view.line.classList.toggle("is-expanded", expanded);
				view.toggle.setAttribute("aria-expanded", String(expanded));
			}
		}
		renderCustomerSummary() {
			const doc = this.doc, summary = this.customerSummary;
			this.loadCustomerAccount();
			summary.replaceChildren();
			node("h3", "", __(this.profile.partyDoctype), summary);
			const name = doc[`${this.profile.party}_name`] || doc[this.profile.party];
			if (!name) {
				node("p", "bnd-bill-preview-empty", __("Choose a {0} to see their document context here.", [__(this.profile.partyDoctype).toLowerCase()]), summary);
				return;
			}
			node("strong", "bnd-bill-customer-name", name, summary);
			const details = node("dl", "bnd-bill-preview-meta", null, summary);
			for (const [label, value] of [
				[__("Tax ID"), doc.tax_id],
				[__("Currency"), doc.currency],
				[__("Price list"), doc[this.profile.priceList]],
				[__("Settlement Method"), __(settlementValue(doc))],
			]) {
				if (!value) continue;
				const pair = node("div", "", null, details);
				node("dt", "", label, pair); node("dd", "", value, pair);
			}
			if (this.frm.doctype === "Sales Invoice") {
				const account = node("div", "bnd-bill-customer-account", null, summary);
				if (this.accountSummaryLoading) {
					node("span", "bnd-bill-hint", __("Loading customer balance…"), account);
				} else if (this.accountSummary && !this.accountSummary.unavailable) {
					const balance = Number(this.accountSummary.balance || 0);
					node("span", "bnd-bill-hint", balance < 0 ? __("Customer credit") : __("Amount due from customer"), account);
					const value = node("strong", "", null, account);
					this.money(value, Math.abs(balance), { fieldtype: "Currency", options: "currency", precision: 2 }, { currency: this.accountSummary.currency || doc.currency });
				}
				const statement = button(__("Open customer statement"), account, () => this.openCustomerStatement());
				statement.classList.add("bnd-bill-customer-statement");
			}
			const focus = button(__("Edit customer fields"), summary, () => {
				this.toggleRail(false); this.partyControl?.set_focus();
			});
			focus.classList.add("bnd-bill-customer-focus");
		}
		renderStockSettings() {
			if (!this.stockSettings) return;
			const enabled = Number(this.doc.update_stock) === 1;
			this.stockSettings.dataset.enabled = String(enabled);
			const warehouse = this.stockWarehouseControl?.$wrapper?.[0];
			if (warehouse) warehouse.hidden = !enabled;
			this.stockNote.textContent = enabled
				? __("On submission, quantities are deducted from stock. The source warehouse is used for every item unless changed on its row.")
				: __("No stock movement will be posted. Turn this on when this invoice also delivers the sold items.");
		}
		renderAmountSummary() {
			const frm = this.frm, doc = this.doc;
			const totalName = totalField(frm);
			const totalDf = frm.fields_dict[totalName]?.df || frappe.meta.get_docfield(frm.doctype, totalName, doc.name);
			this.amountSummary.hidden = !totalDf;
			if (this.amountSummary.hidden) return;
			this.amountBreakdown.replaceChildren();
			const standard = [
				["total", __("Items total")],
				["discount_amount", __("Discount Amount")],
				["net_total", __("Net before VAT")],
				["total_taxes_and_charges", null],
			];
			const optional = ["rounding_adjustment", "paid_amount", "outstanding_amount"];
			for (const [name, fixedLabel] of standard) {
				if (name === "discount_amount" && !Number(doc[name])) continue;
				if (name === "net_total" && roundMoney(doc[name]) === roundMoney(doc.total)) continue;
				const df = frm.fields_dict[name]?.df || frappe.meta.get_docfield(frm.doctype, name, doc.name);
				if (!df) continue;
				const pair = node("div", `bnd-bill-amount-${name.replaceAll("_", "-")}`, null, this.amountBreakdown);
				const label = fixedLabel || taxLabel(doc, __(df.label));
				node("dt", "", label, pair);
				const value = name === "discount_amount" ? -Math.abs(Number(doc[name])) : doc[name] || 0;
				this.money(node("dd", "", null, pair), value, df);
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
			this.context.replaceChildren();
			for (const name of this.profile.context) {
				if (["posting_date", "due_date"].includes(name)) continue;
				const field = frm.fields_dict[name];
				if (!field) continue;
				const isWarehouse = name === "set_warehouse";
				// Stock movement can hide the native Link by dependency. Show the
				// summary without relaxing its actual field permission or editing it.
				const status = isWarehouse
					? frappe.perm.get_field_display_status({ ...field.df, hidden_due_to_dependency: 0 }, doc, frm.perm)
					: fieldStatus(frm, name);
				if (status === "None" || (!isWarehouse && !doc[name])) continue;
				const pair = node("div", "", null, this.context);
				node("dt", "", isWarehouse ? __("Default warehouse") : __(field.df.label), pair);
				node("dd", "", doc[name] ? this.format(doc[name], field.df) : __("Not set"), pair);
			}
			const draft = Number(doc.docstatus) === 0;
			const rows = draft ? (doc.items || []) : (doc.items || []).filter(r => r.item_code);
			for (const [name, view] of this.rowViews) if (!rows.some(r => r.name === name)) { this.forgetRow(name); view.line.remove(); this.rowViews.delete(name); }
			if (!rows.some(row => row.name === this.mobileExpanded)) this.mobileExpanded = rows[0]?.name || "";
			this.lineHead.hidden = !rows.length;
			this.controls = this.controls.filter(c => !c.rowField || rows.some(r => r === c.doc));
			for (const { control, key } of this.controls) {
				this.renderControl(control, key, true);
			}
			this.renderStockSettings();
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
			this.totals.replaceChildren();
			for (const name of ["net_total", "discount_amount", "total_taxes_and_charges", "rounding_adjustment"]) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !showSummary(name, doc)) continue;
				const pair = node("div", "", null, this.totals);
				const label = name === "total_taxes_and_charges" ? taxLabel(doc, __(field.df.label)) : __(field.df.label);
				node("dt", "", label, pair); this.money(node("dd", "", null, pair), doc[name] || 0, field.df);
			}
			const totalName = totalField(frm);
			const totalControl = frm.fields_dict[totalName];
			this.mobileTotalValue.replaceChildren();
			if (totalControl && fieldStatus(frm, totalName) !== "None") {
				const pair = node("div", "bnd-bill-grand", null, this.totals);
				node("dt", "", __("Total"), pair); this.money(node("dd", "", null, pair), doc[totalName], totalControl.df);
				this.money(this.mobileTotalValue, doc[totalName], totalControl.df);
			}
			for (const name of ["paid_amount", "outstanding_amount"]) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || (!doc[name] && draft)) continue;
				const pair = node("div", `bnd-bill-settlement bnd-bill-${name.replace("_", "-")}`, null, this.totals);
				node("dt", "", __(field.df.label), pair);
				this.money(node("dd", "", null, pair), doc[name] || 0, field.df);
			}
			this.stock.textContent = doc.update_stock ? __("Stock will be updated when the invoice is submitted.") : __("Stock is not updated by this invoice.");
			this.renderCustomerSummary();
			this.renderPreview(rows);
			const nativeActions = api.document_actions.actionState(frm, {
				canRecordPayment: typeof frm.cscript?.make_payment_entry === "function",
			});
			const { showSave } = nativeActions;
			const showSubmit = draft && !!frm.meta?.is_submittable && api.document_actions.permitted(frm, "submit");
			this.root.dataset.bndDraft = String(draft); this.searchButton.hidden = !draft;
			this.addLineButton.hidden = !draft; this.newItemButton.hidden = !draft; this.scanButton.hidden = !draft; this.saveButton.hidden = !showSave;
			this.submitButton.hidden = !showSubmit;
			this.submitPrintButton.hidden = !showSubmit;
			this.saveAndNewButton.hidden = !showSave;
			this.newButton.hidden = !nativeActions.showNew;
			this.deleteButton.hidden = !nativeActions.showDelete;
			this.duplicateButton.hidden = !nativeActions.showDuplicate;
			this.cancelButton.hidden = !nativeActions.showCancel;
			this.paymentButton.hidden = !nativeActions.showRecordPayment;
			this.printButton.hidden = !nativeActions.showPrint; this.discountButton.hidden = !draft;
			if (this.settlementNote) {
				this.settlementNote.hidden = !draft;
				this.settlementNote.replaceChildren();
				const settlement = settlementValue(doc);
				const immediate = settlementCreatesPayment(settlement);
				const mixed = mixedPaymentSelected(settlement);
				node("strong", "", mixed ? __("Split payment") : immediate ? __("Payment received now") : __("Credit sale"), this.settlementNote);
				node("small", "", mixed
					? __("Before submission, enter the Cash and Network amounts. ERPNext will post two linked Payment Entries and settle this invoice.")
					: immediate
						? __("After submission, a linked Payment Entry opens with the selected method. Submit that receipt to reduce the customer balance.")
						: __("Submission increases Accounts Receivable. A later receipt reduces the same customer balance."), this.settlementNote);
			}
			this.loadZatca();
			this.busy();
		}
		renderPreview(rows) {
			const doc = this.doc, preview = this.preview;
			preview.replaceChildren();
			const head = node("header", "bnd-bill-preview-head", null, preview);
			node("strong", "", __(this.frm.doctype === "Sales Invoice" ? "Live invoice summary" : "Live bill summary"), head);
			node("span", "", doc.name && !doc.__islocal ? doc.name : __("Draft"), head);
			node("p", "bnd-bill-preview-note", doc.__islocal
				? __("This is a live draft summary, not the final PDF layout.")
				: __("Open print preview for the final A4 or thermal layout."), preview);
			node("div", "bnd-bill-preview-company", doc.company || "Bunood", preview);
			const meta = node("dl", "bnd-bill-preview-meta", null, preview);
			for (const [label, value] of [
				[__(this.profile.partyDoctype), doc[this.profile.party] || "—"],
				[__("Date"), doc.posting_date ? this.format(doc.posting_date, this.frm.fields_dict.posting_date.df) : "—"],
			]) {
				const pair = node("div", "", null, meta);
				node("dt", "", label, pair); node("dd", "", value, pair);
			}
			const table = node("div", "bnd-bill-preview-table", null, preview);
			const tableHead = node("div", "bnd-bill-preview-row bnd-bill-preview-row-head", null, table);
			for (const label of [__("Item"), __("Quantity"), __("Amount")]) node("span", "", label, tableHead);
			for (const row of rows.filter(row => row.item_code)) {
				const line = node("div", "bnd-bill-preview-row", null, table);
				node("span", "", row.item_name || row.item_code, line);
				node("span", "", this.format(row.qty, frappe.meta.get_docfield(row.doctype, "qty", row.name), row), line);
				const amount = node("span", "", null, line);
				this.money(amount, row.amount || 0, frappe.meta.get_docfield(row.doctype, "amount", row.name), row);
			}
			if (!rows.some(row => row.item_code)) {
				node("p", "bnd-bill-preview-empty", __("Your invoice preview will update as you enter items."), table);
			}
			const foot = node("div", "bnd-bill-preview-total", null, preview);
			node("span", "", __("Total"), foot);
			const value = node("strong", "", null, foot);
			const totalName = totalField(this.frm), df = this.frm.fields_dict[totalName]?.df;
			if (df) this.money(value, doc[totalName] || 0, df);
			if (!doc.__islocal) {
				const open = button(__("Open print preview"), preview, () => this.print(), true);
				open.classList.add("bnd-bill-preview-open");
			}
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
			let missing, submitted = false;
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
						if (mixedAmounts) await this.postMixedPayment(mixedAmounts);
						else await makePaymentEntry(this.frm);
					}
					catch (error) {
						this.message(__("Invoice submitted, but payment could not be recorded: {0}", [error.message]), true);
					}
				}
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); if (missing && this.active()) missing.control?.set_focus(); }
			if (submitted && printAfter) this.frm.print_doc();
			return submitted;
		}
		submitAndPrint() { return this.submit({ printAfter: true }); }
		newDocument() { if (this.active() && !this.queue.count && !this.saving && !this.flushing && !this.closing) return frappe.new_doc(this.frm.doctype); }
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		duplicateDocument() { if (!this.doc.__islocal) return this.frm.copy_doc(); }
		cancelDocument() { if (Number(this.doc.docstatus) === 1) return this.frm.savecancel(); }
		print() { if (!this.doc.__islocal) this.frm.print_doc(); }
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
		async postMixedPayment(values) {
			const response = await frappe.call({
				method: "bunood_theme.payments.post_mixed_invoice_payment",
				args: { invoice: this.frm.doc.name, ...values },
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
	function open(frm) {
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
				if (!frm.fields_dict.exempt_from_sales_tax) return;
				frm.set_df_property("exempt_from_sales_tax", "label", __("VAT exempt (0%)"));
				frm.set_df_property("exempt_from_sales_tax", "description", __("Off applies the configured standard VAT. On applies the configured exempt treatment."));
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
	}
	api.sales_bill = { open, newInvoice, eligible, supports, actionState, SerialChanges, saveDraft, submitConfirmed, totalField, ensureExactHalalas, rowFieldStatus, setLineValue, makePaymentEntry, settlementCreatesPayment, mixedPaymentSelected, receiptMethod, settlementValue, roundMoney, balancedPaymentPair, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, loadVatProfiles, vatTreatment, clearItemTaxOverrides, setVatIncludedInPrice, recalculateVatTreatment, applyVatTreatment, profiles: PROFILES };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (!profileFor(frm)) return;
		// Let native refresh_fields finish on the next turn, but do not wait for
		// unrelated desk requests before replacing the visible native form.
		setTimeout(async () => {
			if (window.cur_frm !== frm) return;
			const page = frm.$wrapper?.[0]?.closest(".page-container");
			const release = setTimeout(() => page?.classList.add("bnd-bill-native-ready"), 8000);
			try {
			await ensureExactHalalas(frm);
			if (window.cur_frm !== frm) return;
			if (!supports(frm)) {
				instances.get(frm)?.dispose();
				page?.classList.add("bnd-bill-native-ready");
				return;
			}
			if (instances.has(frm)) instances.get(frm).render(); else open(frm);
			} catch (error) {
				page?.classList.add("bnd-bill-native-ready");
				console.error("Bunood invoice presentation could not mount", error);
			} finally { clearTimeout(release); }
		}, 0);
	});
})();
