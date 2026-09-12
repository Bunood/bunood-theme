// Bunood Bill Workbench: the default full-page presentation of the CURRENT
// native Sales/Purchase Invoice. Advanced mode reveals the same frm.doc.
// No separate document, calculation engine, posting endpoint, or persisted state.
// Native controls + model triggers own all changes. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	let errorId = 0;
	let controlId = 0;
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", priceList: "selling_price_list",
			lineFields: ["qty", "price_list_rate", "discount_percentage", "rate", "warehouse"],
			context: ["tax_id", "company", "posting_date", "due_date", "currency", "selling_price_list"],
			options: ["posting_date", "due_date", "update_stock", "set_warehouse", "currency", "selling_price_list", "payment_terms_template", "po_no"],
			mapped: ["sales_order", "delivery_note", "so_detail", "dn_detail"],
		},
		"Purchase Invoice": {
			party: "supplier", partyDoctype: "Supplier", title: "Purchase bill", priceList: "buying_price_list",
			lineFields: ["qty", "price_list_rate", "discount_percentage", "rate", "warehouse"],
			context: ["tax_id", "company", "posting_date", "due_date", "currency", "buying_price_list"],
			options: ["bill_no", "bill_date", "posting_date", "due_date", "update_stock", "set_warehouse", "currency", "buying_price_list", "payment_terms_template"],
			mapped: ["purchase_order", "purchase_receipt", "po_detail", "pr_detail"],
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
		warehouse: () => __("Warehouse"),
	};
	const profileFor = frm => PROFILES[frm?.doctype];
	const actionState = (doc, dirty) => {
		const draft = Number(doc.docstatus) === 0;
		const savedDraft = draft && !doc.__islocal && !dirty;
		return { draft, savedDraft, showSave: draft && !savedDraft, showSubmit: savedDraft };
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
	async function setLineValue(doc, name, value, nativeSet, baseStatus = () => "None") {
		if ((name === "qty" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) ||
			(["rate", "price_list_rate"].includes(name) && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
			throw Error(__("Use a quantity above zero and a price of zero or more."));
		}
		// ERPNext percentage discounts require a positive price_list_rate.
		if (name === "discount_percentage" && Number(value) !== 0 &&
			(!Number.isFinite(Number(doc.price_list_rate)) || Number(doc.price_list_rate) <= 0)) {
			throw Error(baseStatus() === "Write" ? __("Enter a price before discount first.") :
				__("Percentage discounts need an item price in the selected price list. Choose a priced item or price list, or set Discount (%) to 0 and use Net unit price."));
		}
		return nativeSet(value);
	}
	function makePaymentEntry(frm) {
		if (Number(frm.doc.docstatus) !== 1) throw Error(__("Submit the document before recording payment."));
		if (typeof frm.cscript?.make_payment_entry !== "function") {
			throw Error(__("Open the advanced form to create this payment."));
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
			fieldStatus(frm, p.party) !== "None" && frm.fields_dict.items?.grid &&
			!(d.items || []).some(r => p.mapped.some(name => r[name])));
	}
	function eligible(frm) {
		return supports(frm) && Number(frm.doc.docstatus) === 0 && !frm.save_disabled &&
			frm.fields_dict.items.grid.is_editable();
	}
	class SerialChanges {
		constructor(active, changed) { this.active = active; this.changed = changed; this.tail = Promise.resolve(); this.count = 0; }
		run(action) {
			this.count++; this.changed();
			const next = this.tail.then(async () => {
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				const result = await action();
				await frappe.after_ajax();
				return result;
			}).finally(() => { this.count--; this.changed(); });
			this.tail = next.catch(() => {});
			return next;
		}
	}
	async function saveDraft(frm) {
		let confirmed = false, failed = false;
		await frm.save("Save", r => { confirmed = !r?.exc; }, null, () => { failed = true; });
		await frappe.after_ajax();
		if (failed || !confirmed || !frm.doc.name || frm.doc.__islocal || frm.is_dirty()) {
			throw Error(__("The draft was not saved. Review the message or open the full invoice."));
		}
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
			const mode = this.mode = node("nav", "bnd-bill-mode"); this.root.before(mode); mode.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = button(__("Simple"), mode, () => this.setMode(true), true);
			this.advancedButton = button(__("Advanced"), mode, () => this.fullInvoice());
			const intro = node("header", "bnd-bill-intro", null, this.root);
			const identity = node("div", "bnd-bill-identity", null, intro);
			node("span", "bnd-bill-seal", "B", identity).setAttribute("aria-hidden", "true");
			const heading = node("div", "", null, identity);
			node("span", "bnd-bill-brand", "Bunood", heading);
			node("h2", "", __(this.profile.title), heading);
			this.documentState = node("p", "bnd-bill-document-state", "", heading);
			const toolbar = node("div", "bnd-bill-toolbar", null, intro); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", __("Document actions"));
			const commitActions = node("div", "bnd-bill-action-group bnd-bill-action-group-commit", null, toolbar);
			commitActions.setAttribute("role", "group"); commitActions.setAttribute("aria-label", __("Draft actions"));
			const tools = node("details", "bnd-bill-tools", null, toolbar);
			const toolsTrigger = node("summary", "", __("Invoice tools"), tools);
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
			this.newButton = this.action(commitActions, __("New"), "F1", null, () => this.newDocument());
			this.newButton.classList.add("bnd-bill-action-new");
			this.saveButton = this.action(commitActions, __("Save draft"), "F2", null, () => this.save(), true);
			this.saveButton.classList.add("bnd-bill-action-save");
			this.saveButton.dataset.bndAction = "save";
			this.submitButton = this.action(commitActions, __("Submit document"), null, null, () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.mobileTotal = node("div", "bnd-bill-mobile-total", null, commitActions);
			node("span", "", __("Total"), this.mobileTotal);
			this.mobileTotalValue = node("strong", "", "", this.mobileTotal);
			this.partyButton = this.action(documentActions, __(this.profile.partyDoctype), "F3", "user", () => this.partyControl?.set_focus());
			this.deleteButton = this.action(documentActions, __("Delete"), "F4", "delete", () => this.removeDocument());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			this.printButton = this.action(documentActions, __("Print"), "F6", "printer", () => this.print());
			this.paymentButton = this.action(documentActions, __("Payment"), "F7", "credit-card", () => this.payment());
			this.discountButton = this.action(documentActions, __("Discount"), "F10", "percent", () => { this.discount.open = !this.discount.open; this.discount.scrollIntoView({ block: "nearest" }); });
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", "rotate-ccw", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "Alt+I", "search", () => this.picker?.set_focus());
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
			const primaryFields = ["posting_date", "due_date", ...(frm.doctype === "Purchase Invoice" ? ["bill_no", "bill_date"] : [])];
			for (const name of primaryFields) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(essentials, source, this.doc);
			}
			this.context = node("dl", "bnd-bill-context", null, customer);
			const items = node("section", "bnd-bill-panel bnd-bill-items", null, main);
			node("h3", "", __("Items"), items);
			const search = node("div", "bnd-bill-search bnd-bill-draft-only", null, items);
			const pickerHost = node("div", "bnd-bill-picker", null, search);
			this.picker = frappe.ui.form.make_control({ parent: pickerHost, render_input: true,
				df: { fieldtype: "Link", fieldname: "quick_bill_item", options: "Item", label: __("Find an item"),
					placeholder: __("Search by item name or code"), only_select: true,
					get_query: () => {
						const source = frm.fields_dict.items.grid.get_field("item_code");
						const query = source.get_query || source.df?.get_query;
						return typeof query === "function" ? query(frm.doc, "Sales Invoice Item", frm.doc.items?.[0]?.name) : query;
					},
				},
			});
			this.picker.$input.attr("aria-label", __("Find an item"));
			this.addButton = button(__("Add item"), search, () => this.addItem(), true);
			this.scanButton = button(__("Scan barcode"), search, () => this.scanItem());
			this.picker.$input.on("keydown.bnd-bill", e => {
				if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.addItem(); }
			});
			node("p", "bnd-bill-hint bnd-bill-draft-only", __("Select an item, then Add item. Ctrl+Enter adds it from search."), items);
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
			this.rail = node("aside", "bnd-bill-panel bnd-bill-rail", null, layout);
			node("h3", "", __("Bill total"), this.rail);
			this.totals = node("dl", "bnd-bill-totals", null, this.rail);
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
				if (primaryFields.includes(name)) continue;
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(options, source, this.doc);
			}
			this.discount = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Discount and tax"), this.discount);
			for (const name of ["apply_discount_on", "additional_discount_percentage", "discount_amount", "taxes_and_charges"]) {
				const source = frm.fields_dict[name]; if (source && fieldStatus(frm, name) !== "None") this.bindControl(this.discount, source, this.doc);
			}
			node("p", "bnd-bill-hint bnd-bill-draft-only", __("A draft does not post accounts, move stock, or record payment. Submission uses the native validation and confirmation flow."), this.rail);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				if (e.key === "Escape" && !popupWasOpen) { e.preventDefault(); this.fullInvoice(); }
			});
			this.root.addEventListener("keydown", e => this.shortcut(e, true), true);
			this.setMode(true); this.render(); this.applyDefaultTax();
			frappe.after_ajax(() => {
				if (this.active() && this.doc.__islocal && !this.doc[this.profile.party] &&
					!this.root.contains(document.activeElement)) this.partyControl?.set_focus();
			});
		}
		action(parent, label, key, icon, handler, primary = false) {
			const b = button("", parent, handler, primary); b.classList.add("bnd-bill-action");
			if (icon) { const i = node("span", "bnd-bill-action-icon", null, b); i.innerHTML = frappe.utils.icon(icon, "sm"); i.setAttribute("aria-hidden", "true"); }
			node("span", "bnd-bill-action-label", label, b);
			if (key) { node("kbd", "", key, b); b.setAttribute("aria-keyshortcuts", key); }
			return b;
		}
		shortcut(e, local = false) {
			if (!this.simple || (!local && !this.active()) || e.target?.closest?.(".modal")) return;
			const keys = { F1: () => this.newDocument(), F2: () => this.save(), F3: () => this.partyControl?.set_focus(), F4: () => this.removeDocument(), F6: () => this.print(), F7: () => this.payment(), F10: () => this.discountButton.click(), F11: () => this.restore() };
			const save = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
			const findItem = e.altKey && e.key.toLowerCase() === "i";
			if (!keys[e.key] && !save && !findItem) return;
			e.preventDefault(); e.stopImmediatePropagation();
			if (save) this.save(); else if (findItem) {
				const focus = () => setTimeout(() => frappe.after_ajax().then(() => {
					const workbench = instances.get(window.cur_frm);
					if (workbench?.active()) workbench.picker?.set_focus();
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
			this.frm.$wrapper?.toggleClass("bnd-bill-simple-active", simple);
			this.simpleButton?.setAttribute("aria-pressed", String(simple));
			this.advancedButton?.setAttribute("aria-pressed", String(!simple));
			this.simpleButton?.setAttribute("aria-current", simple ? "page" : "false");
			this.advancedButton?.setAttribute("aria-current", simple ? "false" : "page");
			this.syncSelectionGuard();
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
		dispose() {
			if (this.closed) return;
			this.closed = true;
			if (instances.get(this.frm) === this) this.setMode(false); else this.syncSelectionGuard();
			for (const timer of this.editTimers.values()) clearTimeout(timer);
			this.editTimers.clear(); this.pending.clear(); this.invalid.clear();
			this.root.remove(); this.mode.remove();
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
			if (this.addButton) this.addButton.disabled = busy || !this.frm.doc[this.profile.party] || !canAdd(this.frm);
			for (const action of [this.saveButton, this.submitButton, this.newButton, this.advancedButton, this.scanButton, this.newPartyButton]) if (action) action.disabled = busy;
			for (const { remove } of this.rowViews.values()) if (remove) remove.disabled = busy;
			if (this.zatcaButton) this.zatcaButton.disabled = busy || !!this.zatcaSending;
			this.root?.setAttribute("aria-busy", String(busy));
		}
		message(text, error = false, action = null) {
			const visible = text === __("Changes stay in this invoice when you close this view.") ? "" : text;
			this.status.replaceChildren(document.createTextNode(visible));
			this.status.classList.toggle("bnd-bill-error", error);
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
		bindControl(parent, source, doc, rowField) {
			const frm = this.frm, name = source.df.fieldname;
			const allowed = () => rowField
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
				this.pending.set(key, raw);
				return this.change(async () => {
				if (this.pending.get(key) !== raw) return;
				if (allowed() !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) throw Error(__("This item is no longer on the invoice."));
				await setLineValue(doc, name, value, nativeSet, () => rowFieldStatus(frm, doc, "price_list_rate"));
				if (this.pending.get(key) !== raw) return;
				this.invalid.delete(key);
				this.renderControl(control, key);
				if (this.pending.get(key) === raw) this.pending.delete(key);
			}).catch(e => {
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) { this.forgetRow(doc.name); return; }
				if (this.pending.get(key) !== raw) return;
				this.invalid.set(key, { raw, message: e.message || __("Could not update the invoice. Open the full invoice to review.") });
				this.renderControl(control, key); this.revertButton.hidden = false;
			});
			};
			control.$input?.on("input.bnd-bill", () => {
				this.pending.set(key, control.$input.val());
				// Keep the total current while entering numbers, using the native
				// parser and triggers. Link fields retain native selection/validation.
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
			control.$input?.attr("aria-label", rowField ? `${__(source.df.label)} · ${doc.item_code}` : __(source.df.label));
			if (this.invalid.has(key)) {
				this.renderControl(control, key, true);
			}
			this.controls.push({ control, rowField, key, doc }); return control;
		}
		focusNextLineControl(control) {
			const editable = this.controls.filter(entry =>
				entry.rowField && entry.control.get_status() === "Write");
			const index = editable.findIndex(entry => entry.control === control);
			const next = index >= 0 ? editable[index + 1] : null;
			if (!next) { this.picker?.set_focus(); return; }
			this.setExpandedLine(next.doc.name);
			next.control.set_focus();
		}
		async addItem() {
			if (this.saving) return;
			if (this.queue.count) await this.queue.tail;
			if (!this.active()) return;
			const code = this.picker.get_value();
			if (!this.frm.doc[this.profile.party]) { this.message(__("Choose the party before adding items."), true); return; }
			if (!code) { this.message(__("Choose an item from the search results."), true); this.picker.set_focus(); return; }
			let addedRow;
			try {
				await this.change(async () => {
					if (!canAdd(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
					// Reuse ONLY the untouched blank native row. Never merge matching SKUs.
					let row = this.frm.doc.items.find(r => !r.item_code && !r.item_name && !r.description && !r.amount);
					if (!row) {
						row = this.frm.add_child("items");
						await this.frm.script_manager.trigger("items_add", row.doctype, row.name);
					}
					this.frm.refresh_field("items");
					const itemDf = frappe.meta.get_docfield(row.doctype, "item_code", row.name);
					if (frappe.perm.get_field_display_status(itemDf, row, this.frm.perm) !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
					this.mobileExpanded = row.name;
					addedRow = row;
					await frappe.model.set_value(row.doctype, row.name, "item_code", code);
					await frappe.after_ajax();
					if (!row.item_code || row.item_code !== code) throw Error(__("The item could not be added. Review the full invoice."));
				});
				await this.picker.set_value("");
				const newLineControl = this.controls.find(entry =>
					entry.doc === addedRow && entry.rowField && entry.control.get_status() === "Write");
				newLineControl?.control.set_focus();
				if (!newLineControl) this.picker.set_focus();
			} catch (_) { /* Native error and inline status retain the draft. */ }
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
			} catch (_) {
				// The visible zero-VAT line and tax selector remain available. Native
				// validation owns the decision when the user saves or submits.
			}
		}
		removeItem(row) {
			if (this.queue.count || this.saving) return;
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
					const grid = this.frm.fields_dict.items.grid;
					const native = grid.grid_rows_by_docname[row.name];
					if (!native || !canRemove(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
					native.remove();
					// Native remove returns void while awaiting before_items_remove hooks.
					// Observe completion, not an arbitrary delay, and never splice the model.
					await new Promise((resolve, reject) => {
						let attempts = 0;
						const check = () => {
							if (!this.frm.doc.items.some(r => r.name === row.name)) return resolve();
							if (++attempts > 100 || !this.active()) return reject(Error(__("The item was not removed. Review the full invoice.")));
							setTimeout(check, 100);
						}; check();
					});
					this.forgetRow(row.name);
				});
			} catch (_) { /* Keep the native row when hooks refuse removal. */ }
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
		scanItem() {
			if (!window.frappe?.ui?.Scanner) { this.message(__("Camera scanning is not available in this browser. Type the barcode in item search."), true); return; }
			new frappe.ui.Scanner({ dialog: true, multiple: false, on_scan: data => {
				const value = data?.result?.text; if (!value || !this.active()) return;
				this.picker.set_value(value).then(() => this.addItem());
			} });
		}
		format(value, df, doc = this.doc) {
			// Native precision/currency formatting; HTML stripped before display.
			return new DOMParser().parseFromString(frappe.format(value, df, { inline: true }, doc), "text/html").body.textContent || "";
		}
		money(parent, value, df, doc = this.doc) {
			const wrap = node("span", "bnd-bill-money", null, parent);
			if (this.doc.currency === "SAR") {
				const symbol = node("span", "bnd-bill-riyal", "", wrap); symbol.setAttribute("aria-label", __("Saudi riyal"));
				node("bdi", "", window.format_number(value, window.get_number_format(this.doc.currency), frappe.meta.get_field_precision(df, doc)), wrap);
			} else node("bdi", "", this.format(value, df, doc), wrap);
			return wrap;
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
				rejected: __("ZATCA rejected this invoice. Open the validation record before correcting it."),
				clearance_off: __("ZATCA clearance is switched off. Review the validation record and company settings."),
			};
			this.zatcaStatus.classList.toggle("bnd-bill-error", state === "rejected" || state === "missing_app");
			this.zatcaStatus.textContent = messages[state] || __("ZATCA status is temporarily unavailable.");
			const settings = data.settings || {}, invoice = data.invoice || {};
			const operational = ["ready", "preparing", "ready_to_send", "accepted", "accepted_with_warnings", "rejected", "clearance_off"].includes(state);
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
		render() {
			if (this.closed || !this.syncDocument()) return;
			this.syncSelectionGuard();
			const frm = this.frm, doc = frm.doc;
			this.documentState.textContent = `${doc.__islocal ? __("New") : doc.name} · ${doc.__islocal || frm.is_dirty() ? __("Not Saved") : __(doc.status || "Draft")}`;
			this.context.replaceChildren();
			for (const name of this.profile.context) {
				if (["posting_date", "due_date"].includes(name)) continue;
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !doc[name]) continue;
				const pair = node("div", "", null, this.context);
				node("dt", "", __(field.df.label), pair); node("dd", "", this.format(doc[name], field.df), pair);
			}
			const rows = (doc.items || []).filter(r => r.item_code);
			for (const [name, view] of this.rowViews) if (!rows.some(r => r.name === name)) { this.forgetRow(name); view.line.remove(); this.rowViews.delete(name); }
			if (!rows.some(row => row.name === this.mobileExpanded)) this.mobileExpanded = rows[0]?.name || "";
			this.lineHead.hidden = !rows.length;
			this.controls = this.controls.filter(c => !c.rowField || rows.some(r => r === c.doc));
			for (const { control, key } of this.controls) {
				this.renderControl(control, key, true);
			}
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
					node("span", "bnd-bill-hint bnd-bill-item-label", __("Item"), info);
					const itemValue = node("div", "bnd-bill-item-value", null, info);
					node("strong", "", row.item_name || row.item_code, itemValue);
					node("bdi", "bnd-bill-hint", `${row.item_code}${row.uom ? " · " + __(row.uom) : ""}`, itemValue);
				for (const name of this.profile.lineFields) {
					const cell = node("div", `bnd-bill-cell bnd-bill-cell-${name}`, null, body);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, {
						df: { ...df, label: LINE_LABELS[name]?.() || __(df.label) },
						get_query: grid.get_field(name)?.get_query,
					}, row, true);
				}
				const amount = node("div", "bnd-bill-line-total", null, body);
					view = { line, toggle, toggleIndex, toggleTitle, toggleAmount, body, rowNumber, info, amount };
					this.rowViews.set(row.name, view);
				}
				const { info, amount } = view;
				const position = rows.indexOf(row) + 1;
				view.rowNumber.textContent = position;
				view.toggleIndex.textContent = position;
				view.toggleTitle.textContent = row.item_name || row.item_code;
				view.toggle.setAttribute("aria-label", `${__("Item")} ${position}: ${row.item_name || row.item_code}`);
				amount.replaceChildren();
				view.toggleAmount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
					this.money(view.toggleAmount, row.amount, df, row);
				}
				if (!view.remove) { view.remove = button(__("Remove"), view.body, () => this.removeItem(row)); view.remove.classList.add("bnd-bill-line-remove"); view.remove.setAttribute("aria-label", `${__("Remove")} · ${row.item_code}`); }
				if (view.remove) view.remove.hidden = !canRemove(frm);
			}
			if (rows.length) this.setExpandedLine(this.mobileExpanded);
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
			this.stock.textContent = doc.update_stock ? __("Stock will be updated when the invoice is submitted.") : __("Stock is not updated by this invoice.");
			const { draft, showSave, showSubmit } = actionState(doc, this.frm.is_dirty());
			this.root.dataset.bndDraft = String(draft); this.searchButton.hidden = !draft;
			this.addButton.hidden = !draft; this.scanButton.hidden = !draft; this.saveButton.hidden = !showSave;
			this.submitButton.hidden = !showSubmit;
			this.deleteButton.hidden = !draft || !!doc.__islocal; this.paymentButton.hidden = Number(doc.docstatus) !== 1;
			this.printButton.hidden = !!doc.__islocal; this.discountButton.hidden = !draft;
			this.loadZatca();
			this.busy();
		}
		async flush() {
			for (const timer of this.editTimers.values()) clearTimeout(timer);
			this.editTimers.clear();
			// Capture before an awaited native trigger can refresh another input.
			// Clicking Save moves focus to the button before this handler runs.
			const edits = this.controls.filter(({control}) => control.get_status() === "Write")
				.map(({control, key}) => ({ control, key, value: control.get_value() }))
				.filter(({control, key, value}) => this.pending.has(key) || this.invalid.has(key) || value !== control.get_model_value());
			this.flushing = true;
			try {
				await this.queue.tail; await frappe.after_ajax();
				for (const { control, key, value } of edits) { await control.set_value(value); if (!this.invalid.has(key)) this.pending.delete(key); }
				await this.queue.tail; await frappe.after_ajax();
			} finally { this.flushing = false; this.render(); }
		}
		async fullInvoice() {
			if (this.closing || this.saving) return;
			this.closing = true; this.busy();
			try {
				if (Number(this.doc.docstatus) === 0) await this.flush();
				if (!this.active()) return;
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); return; }
				this.setMode(false);
			} catch (e) { this.message(e.message || __("Could not update the document. Open the advanced form to review."), true); }
			finally { this.closing = false; this.busy(); }
		}
		missingRequiredField() {
			if (!this.doc[this.profile.party]) return {
				message: this.profile.party === "supplier" ? __("Choose a supplier before continuing.") : __("Choose a customer before continuing."), control: this.partyControl,
			};
			if (!(this.doc.items || []).some(row => row.item_code)) return {
				message: __("Add at least one item before continuing."), control: this.picker,
			};
			return null;
		}
		async save() {
			if (this.saving || this.closing) return;
			let missing;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (this.invalid.size) throw Error(__("Correct the highlighted value before saving."));
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				missing = this.missingRequiredField();
				if (missing) { this.message(missing.message, true); return; }
				const taxIssue = taxConfigurationIssue(this.frm.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				await this.queue.run(() => saveDraft(this.frm));
				frappe.show_alert({ message: __("Draft saved. Submit it when it is ready to affect accounts or stock."), indicator: "green" }); this.render();
			} catch (e) { this.message(e.message || __("The draft was not saved. Review the message or open the advanced form."), true); }
			finally { this.saving = false; this.busy(); if (missing && this.active()) missing.control?.set_focus(); }
		}
		async submit() {
			if (!this.active() || Number(this.doc.docstatus) !== 0 || this.saving) return;
			let missing;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (!this.active()) return;
				if (this.invalid.size) throw Error(__("Correct the highlighted value before saving."));
				missing = this.missingRequiredField();
				if (missing) { this.message(missing.message, true); return; }
				const taxIssue = taxConfigurationIssue(this.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				if (this.doc.__islocal || this.frm.is_dirty()) await saveDraft(this.frm);
				if (!this.active()) return;
				await this.frm.savesubmit();
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); if (missing && this.active()) missing.control?.set_focus(); }
		}
		newDocument() { if (this.active() && !this.queue.count && !this.saving && !this.flushing && !this.closing) return frappe.new_doc(this.frm.doctype); }
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		print() { if (!this.doc.__islocal) this.frm.print_doc(); }
		restore() {
			const reload = () => this.frm.reload_doc().then(() => { this.syncDocument(); this.render(); });
			if (this.frm.is_dirty()) frappe.confirm(__("Discard unsaved changes and reload this document?"), reload); else reload();
		}
		async payment() {
			try { return await makePaymentEntry(this.frm); }
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
	api.sales_bill = { open, newInvoice, eligible, supports, actionState, SerialChanges, saveDraft, totalField, rowFieldStatus, setLineValue, makePaymentEntry, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, profiles: PROFILES };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (!profileFor(frm)) return;
		// form-refresh precedes refresh_fields and native refresh handlers. Wait
		// for that stack and its requests; never judge permissions mid-refresh.
		setTimeout(() => frappe.after_ajax().then(() => {
			if (window.cur_frm !== frm) return;
			if (!supports(frm)) { instances.get(frm)?.dispose(); return; }
			if (instances.has(frm)) instances.get(frm).render(); else open(frm);
		}), 0);
	});
})();
