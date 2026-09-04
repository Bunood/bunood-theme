// Bunood Bill Workbench: the default full-page presentation of the CURRENT
// native Sales/Purchase Invoice. Advanced mode reveals the same frm.doc.
// No separate document, calculation engine, posting endpoint, or persisted state.
// Native controls + model triggers own all changes. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", question: "Who are you billing?",
			itemQuestion: "What are you selling?", priceList: "selling_price_list",
			lineFields: ["qty", "rate", "discount_percentage", "warehouse"],
			context: ["company", "posting_date", "due_date", "currency", "selling_price_list"],
			options: ["posting_date", "due_date", "update_stock", "set_warehouse", "currency", "selling_price_list", "payment_terms_template", "po_no"],
			mapped: ["sales_order", "delivery_note", "so_detail", "dn_detail"],
		},
		"Purchase Invoice": {
			party: "supplier", partyDoctype: "Supplier", title: "Purchase bill", question: "Who are you buying from?",
			itemQuestion: "What are you buying?", priceList: "buying_price_list",
			lineFields: ["qty", "rate", "discount_percentage", "warehouse"],
			context: ["company", "posting_date", "due_date", "currency", "buying_price_list"],
			options: ["bill_no", "bill_date", "posting_date", "due_date", "update_stock", "set_warehouse", "currency", "buying_price_list", "payment_terms_template"],
			mapped: ["purchase_order", "purchase_receipt", "po_detail", "pr_detail"],
		},
	};
	// Keep each source literal inside `__()`. Frappe's extractor cannot discover
	// a label hidden behind `__(LINE_LABELS[name])`, which let Unit price ship in
	// English on the Arabic workbench while the catalogue gate stayed green.
	const LINE_LABELS = {
		qty: () => __("Quantity"),
		rate: () => __("Unit price"),
		discount_percentage: () => __("Discount"),
		warehouse: () => __("Warehouse"),
	};
	const profileFor = frm => PROFILES[frm?.doctype];
	const actionState = (doc, dirty) => {
		const draft = Number(doc.docstatus) === 0;
		const savedDraft = draft && !doc.__islocal && !dirty;
		return { draft, savedDraft, showSave: draft && !savedDraft, showSubmit: savedDraft };
	};
	const fieldStatus = (frm, name) => frm.fields_dict[name]?.get_status?.() || "None";
	const canAdd = frm => {
		const grid = frm.fields_dict.items.grid;
		return grid.is_editable() && !grid.cannot_add_rows && !grid.df.cannot_add_rows;
	};
	const canRemove = frm => frm.fields_dict.items.grid.is_editable() && !frm.fields_dict.items.grid.df.cannot_delete_rows;
	function totalField(frm) { return Number(frm.doc.disable_rounded_total) || !frm.fields_dict.rounded_total ? "grand_total" : "rounded_total"; }
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
			this.frm = frm; this.doc = frm.doc; this.profile = profileFor(frm); this.controls = []; this.closed = false; this.simple = true; this.invalid = new Map(); this.pending = new Map(); this.rowViews = new Map(); this.editTimers = new Map();
			this.queue = new SerialChanges(() => this.active(), () => this.busy());
			this.native = frm.$wrapper?.find(".form-layout").first()?.[0];
			this.host = this.native?.parentElement || frm.$wrapper?.[0] || frm.wrapper;
			this.root = node("section", "bnd-bill", null, null);
			if (this.native?.parentElement) this.native.before(this.root); else this.host?.prepend(this.root);
			this.root.setAttribute("data-bnd-part", "sales-bill");
			this.root.setAttribute("aria-label", __(this.profile.title));
			const mode = node("nav", "bnd-bill-mode"); this.root.before(mode); mode.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = button(__("Simple"), mode, () => this.setMode(true), true);
			this.advancedButton = button(__("Advanced"), mode, () => this.fullInvoice());
			const toolbar = node("div", "bnd-bill-toolbar", null, this.root); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", __("Document actions"));
			const commitActions = node("div", "bnd-bill-action-group bnd-bill-action-group-commit", null, toolbar);
			commitActions.setAttribute("role", "group"); commitActions.setAttribute("aria-label", __("Draft actions"));
			const documentActions = node("div", "bnd-bill-action-group bnd-bill-action-group-document", null, toolbar);
			documentActions.setAttribute("role", "group"); documentActions.setAttribute("aria-label", __("Invoice actions"));
			const utilityActions = node("div", "bnd-bill-action-group bnd-bill-action-group-utility", null, toolbar);
			utilityActions.setAttribute("role", "group"); utilityActions.setAttribute("aria-label", __("Invoice tools"));
			this.newButton = this.action(commitActions, __("New"), "F1", () => this.newDocument());
			this.newButton.classList.add("bnd-bill-action-new");
			this.saveButton = this.action(commitActions, __("Save draft"), "F2", () => this.save(), true);
			this.saveButton.classList.add("bnd-bill-action-save");
			this.saveButton.dataset.bndAction = "save";
			this.submitButton = this.action(commitActions, __("Submit document"), null, () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.partyButton = this.action(documentActions, __(this.profile.partyDoctype), "F3", () => this.partyControl?.set_focus());
			this.deleteButton = this.action(documentActions, __("Delete"), "F4", () => this.removeDocument());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			this.printButton = this.action(documentActions, __("Print"), "F6", () => this.print());
			this.paymentButton = this.action(documentActions, __("Payment"), "F7", () => this.payment());
			this.discountButton = this.action(documentActions, __("Discount"), "F10", () => { this.discount.open = !this.discount.open; this.discount.scrollIntoView({ block: "nearest" }); });
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "F12", () => this.picker?.set_focus());
			const intro = node("header", "bnd-bill-intro", null, this.root);
			node("h2", "", __(this.profile.title), intro);
			node("p", "", __("Choose the party, add items, then save or submit when the document is ready."), intro);
			this.status = node("p", "bnd-bill-status", "", this.root);
			this.status.setAttribute("role", "status");
			this.revertButton = button(__("Revert invalid edits"), this.root, () => { for (const key of this.invalid.keys()) this.pending.delete(key); this.invalid.clear(); this.render(); this.message(__("Changes stay in this invoice when you close this view.")); });
			this.revertButton.hidden = true;
			this.editor = node("fieldset", "bnd-bill-editor", null, this.root);
			const layout = node("div", "bnd-bill-layout", null, this.editor);
			const main = node("div", "bnd-bill-main", null, layout);
			const customer = node("section", "bnd-bill-panel", null, main);
			const customerHead = node("header", "bnd-bill-section-head", null, customer);
			node("h3", "", __(this.profile.question), customerHead);
			if ((frappe.boot.user.can_create || []).includes(this.profile.partyDoctype) && fieldStatus(frm, this.profile.party) === "Write") {
				button(__("New {0}", [__(this.profile.partyDoctype).toLowerCase()]), customerHead, () => this.newParty());
			}
			this.partyControl = this.bindControl(customer, frm.fields_dict[this.profile.party], this.doc);
			this.context = node("dl", "bnd-bill-context", null, customer);
			const items = node("section", "bnd-bill-panel", null, main);
			node("h3", "", __(this.profile.itemQuestion), items);
			const search = node("div", "bnd-bill-search", null, items);
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
			node("p", "bnd-bill-hint", __("Select an item, then Add item. Ctrl+Enter adds it from search."), items);
			this.lines = node("div", "bnd-bill-lines", null, items);
			this.rail = node("aside", "bnd-bill-panel bnd-bill-rail", null, layout);
			node("h3", "", __("Bill total"), this.rail);
			this.totals = node("dl", "bnd-bill-totals", null, this.rail);
			this.stock = node("p", "bnd-bill-hint", null, this.rail);
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
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(options, source, this.doc);
			}
			this.discount = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Discount and tax"), this.discount);
			for (const name of ["apply_discount_on", "additional_discount_percentage", "discount_amount", "taxes_and_charges"]) {
				const source = frm.fields_dict[name]; if (source && fieldStatus(frm, name) !== "None") this.bindControl(this.discount, source, this.doc);
			}
			const footer = node("footer", "bnd-bill-footer", null, this.root);
			this.footerTotal = node("strong", "bnd-bill-footer-total", "", footer);
			const actions = node("div", "bnd-bill-actions", null, footer);
			this.fullButton = button(__("Advanced form"), actions, () => this.fullInvoice());
			node("p", "bnd-bill-hint", __("A draft does not post accounts, move stock, or record payment. Submission uses the native validation and confirmation flow."), this.rail);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				const keys = { F1: () => this.newDocument(), F2: () => this.save(), F3: () => this.partyControl?.set_focus(), F4: () => this.removeDocument(), F6: () => this.print(), F7: () => this.payment(), F10: () => this.discountButton.click(), F11: () => this.restore(), F12: () => this.picker?.set_focus() };
				if (keys[e.key]) { e.preventDefault(); e.stopPropagation(); keys[e.key](); }
				if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); this.save(); }
				if (e.key === "Escape" && !popupWasOpen) { e.preventDefault(); this.fullInvoice(); }
			});
			this.setMode(true); this.render(); this.applyDefaultTax();
		}
		action(parent, label, key, handler, primary = false) {
			const b = button("", parent, handler, primary); b.classList.add("bnd-bill-action");
			node("span", "bnd-bill-action-label", label, b);
			if (key) { node("kbd", "", key, b); b.setAttribute("aria-keyshortcuts", key); }
			return b;
		}
		setMode(simple) {
			this.simple = simple; this.root.hidden = !simple; if (this.native) this.native.hidden = simple;
			this.frm.$wrapper?.toggleClass("bnd-bill-simple-active", simple);
			this.simpleButton?.setAttribute("aria-pressed", String(simple));
			this.advancedButton?.setAttribute("aria-pressed", String(!simple));
			this.simpleButton?.setAttribute("aria-current", simple ? "page" : "false");
			this.advancedButton?.setAttribute("aria-current", simple ? "false" : "page");
		}
		syncDocument() { this.doc = this.frm.doc; }
		show() { this.syncDocument(); this.setMode(true); this.render(); }
		active() { return !this.closed && window.cur_frm === this.frm && this.frm.doc === this.doc && supports(this.frm); }
		busy() {
			const busy = !!this.queue.count || !!this.saving || !!this.closing || !!this.flushing;
			if (this.editor) this.editor.disabled = busy;
			if (this.addButton) this.addButton.disabled = busy || !this.frm.doc[this.profile.party] || !canAdd(this.frm);
			if (this.saveButton) this.saveButton.disabled = busy;
			if (this.submitButton) this.submitButton.disabled = busy;
			if (this.fullButton) this.fullButton.disabled = busy;
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
			try { await this.queue.run(action); if (this.active()) { if (!this.flushing) this.render(); this.message(__("Changes stay in this invoice when you close this view.")); } }
			catch (e) { this.message(e.message || __("Could not update the invoice. Open the full invoice to review."), true); throw e; }
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
			control.get_query = source.get_query;
			const nativeSet = control.set_model_value.bind(control);
			const key = `${doc.name}:${name}`;
			const nativeValidate = control.validate_and_set_in_model.bind(control);
			control.validate_and_set_in_model = (value, ...args) => {
				if (value === doc[name] && this.invalid.has(key)) {
					this.invalid.delete(key); control.$input?.attr("aria-invalid", "false");
					control.$wrapper.removeClass("has-error"); this.revertButton.hidden = !this.invalid.size;
					if (!this.invalid.size) this.message(__("Changes stay in this invoice when you close this view."));
				}
				return nativeValidate(value, ...args);
			};
			control.set_model_value = value => {
				const raw = control.$input?.val();
				this.pending.set(key, raw);
				return this.change(async () => {
				if (allowed() !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) throw Error(__("This item is no longer on the invoice."));
				if ((name === "qty" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) ||
					(name === "rate" && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
					throw Error(__("Use a quantity above zero and a price of zero or more."));
				}
				await nativeSet(value); this.invalid.delete(key);
				if (this.pending.get(key) === raw) this.pending.delete(key);
			}).catch(() => {
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) { this.forgetRow(doc.name); return; }
				this.invalid.set(key, raw); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error"); this.revertButton.hidden = false;
			});
			};
			control.$input?.on("input.bnd-bill", () => {
				this.pending.set(key, control.$input.val());
				// Keep the total current while entering numbers, using the native
				// parser and triggers. Link fields retain native selection/validation.
				if (rowField) {
					clearTimeout(this.editTimers.get(key));
					this.editTimers.set(key, setTimeout(() => {
						this.editTimers.delete(key);
						if (this.active() && this.pending.has(key)) control.set_value(control.get_value()).catch(e => this.message(e.message, true));
					}, 400));
				}
			});
			control.$input?.attr("aria-label", rowField ? `${__(source.df.label)} · ${doc.item_code}` : __(source.df.label));
			if (this.invalid.has(key)) {
				control.set_input(this.invalid.get(key)); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error");
			}
			this.controls.push({ control, rowField, key, doc }); return control;
		}
		async addItem() {
			if (this.queue.count || this.saving) return;
			const code = this.picker.get_value();
			if (!this.frm.doc[this.profile.party]) { this.message(__("Choose the party before adding items."), true); return; }
			if (!code) { this.message(__("Choose an item from the search results."), true); this.picker.set_focus(); return; }
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
					await frappe.model.set_value(row.doctype, row.name, "item_code", code);
					await frappe.after_ajax();
					if (!row.item_code || row.item_code !== code) throw Error(__("The item could not be added. Review the full invoice."));
				});
				await this.picker.set_value(""); this.picker.set_focus();
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
		async removeItem(row) {
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
		}
		newParty() {
			if (this.saving || this.closing || this.queue.count || fieldStatus(this.frm, this.profile.party) !== "Write" || !(frappe.boot.user.can_create || []).includes(this.profile.partyDoctype)) return;
			frappe.ui.form.make_quick_entry(this.profile.partyDoctype, doc => {
				if (this.active()) this.change(() => {
					if (fieldStatus(this.frm, this.profile.party) !== "Write") throw Error(__("This field is not editable. Use the advanced form."));
					return this.frm.set_value(this.profile.party, doc.name);
				}).catch(() => {});
			}, null, null, true);
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
				const response = await frappe.call({ method: "bunood_theme.zatca.get_status", type: "GET", args });
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
			this.zatcaMeta.textContent = [settings.server, settings.sync, invoice.integration_status].filter(Boolean).map(value => __(value)).join(" · ");
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
			const data = this.zatcaData || {}, state = data.state;
			if (state === "missing_app") {
				frappe.msgprint(__("Install and migrate the KSA Compliance app before configuring ZATCA.")); return;
			}
			if (state === "preparing") return this.loadZatca(true);
			if (state === "ready_to_send" && data.can_queue) {
				this.zatcaButton.disabled = true;
				try {
					await frappe.call({ method: "bunood_theme.zatca.queue_invoice", type: "POST", args: { invoice_name: this.doc.name }, freeze: true, freeze_message: __("Queueing invoice for ZATCA…") });
					this.zatcaStatus.textContent = __("Invoice queued for ZATCA. Status will update automatically.");
					setTimeout(() => this.loadZatca(true), 2500);
				} finally { this.zatcaButton.disabled = false; }
				return;
			}
			if (data.invoice?.name) { frappe.set_route("Form", "Sales Invoice Additional Fields", data.invoice.name); return; }
			const route = data.settings?.route;
			if (route?.length) frappe.set_route(...route);
		}
		render() {
			if (this.closed) return;
			this.syncDocument();
			const frm = this.frm, doc = frm.doc;
			this.context.replaceChildren();
			for (const name of this.profile.context) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !doc[name]) continue;
				const pair = node("div", "", null, this.context);
				node("dt", "", __(field.df.label), pair); node("dd", "", this.format(doc[name], field.df), pair);
			}
			const rows = (doc.items || []).filter(r => r.item_code);
			for (const [name, view] of this.rowViews) if (!rows.some(r => r.name === name)) { this.forgetRow(name); view.line.remove(); this.rowViews.delete(name); }
			this.controls = this.controls.filter(c => !c.rowField || rows.some(r => r === c.doc));
			for (const { control, key } of this.controls) {
				control.$input?.attr("aria-invalid", String(this.invalid.has(key)));
				const raw = this.pending.get(key);
				if (control.$input?.[0] === document.activeElement) continue;
				control.refresh();
				if (this.pending.has(key)) control.set_input(raw);
				if (this.invalid.has(key)) { control.set_input(this.invalid.get(key)); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error"); }
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
					const info = node("div", "bnd-bill-item", null, line);
					node("span", "bnd-bill-hint bnd-bill-item-label", __("Item"), info);
					const itemValue = node("div", "bnd-bill-item-value", null, info);
					node("strong", "", row.item_name || row.item_code, itemValue);
					node("bdi", "bnd-bill-hint", `${row.item_code}${row.uom ? " · " + __(row.uom) : ""}`, itemValue);
				for (const name of this.profile.lineFields) {
					const cell = node("div", "bnd-bill-cell", null, line);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, { df: { ...df, label: LINE_LABELS[name]?.() || __(df.label) } }, row, true);
				}
				const amount = node("div", "bnd-bill-line-total", null, line);
					view = { line, info, amount }; this.rowViews.set(row.name, view);
				}
				const { info, amount } = view;
				amount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
				}
				if (!view.remove) { view.remove = button(__("Remove"), view.line, () => this.removeItem(row)); view.remove.classList.add("bnd-bill-line-remove"); view.remove.setAttribute("aria-label", `${__("Remove")} · ${row.item_code}`); }
				if (view.remove) view.remove.hidden = !canRemove(frm);
			}
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
			this.footerTotal.replaceChildren();
			if (totalControl && fieldStatus(frm, totalName) !== "None") {
				const pair = node("div", "bnd-bill-grand", null, this.totals);
				node("dt", "", __("Total"), pair); this.money(node("dd", "", null, pair), doc[totalName], totalControl.df);
				this.money(this.footerTotal, doc[totalName], totalControl.df);
			}
			this.stock.textContent = doc.update_stock ? __("Stock will be updated when the invoice is submitted.") : __("Stock is not updated by this invoice.");
			const { draft, showSave, showSubmit } = actionState(doc, this.frm.is_dirty());
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
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); return; }
				this.setMode(false);
			} catch (e) { this.message(e.message || __("Could not update the document. Open the advanced form to review."), true); }
			finally { this.closing = false; this.busy(); }
		}
		async save() {
			if (this.saving || this.closing) return;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (this.invalid.size) throw Error(__("Correct the highlighted value before saving."));
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				if (!this.frm.doc[this.profile.party] || !this.frm.doc.items.some(r => r.item_code)) throw Error(__("Choose the party and add at least one item."));
				const taxIssue = taxConfigurationIssue(this.frm.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				await this.queue.run(() => saveDraft(this.frm));
				frappe.show_alert({ message: __("Draft saved. Submit it when it is ready to affect accounts or stock."), indicator: "green" }); this.render();
			} catch (e) { this.message(e.message || __("The draft was not saved. Review the message or open the advanced form."), true); }
			finally { this.saving = false; this.busy(); }
		}
		async submit() {
			if (Number(this.doc.docstatus) !== 0 || this.saving) return;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (!this.doc[this.profile.party] || !this.doc.items.some(row => row.item_code)) throw Error(__("Choose the party and add at least one item."));
				const taxIssue = taxConfigurationIssue(this.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				if (this.doc.__islocal || this.frm.is_dirty()) await saveDraft(this.frm);
				await this.frm.savesubmit();
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); }
		}
		newDocument() { return frappe.new_doc(this.frm.doctype); }
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		print() { if (!this.doc.__islocal) this.frm.print_doc(); }
		restore() {
			const reload = () => this.frm.reload_doc().then(() => { this.syncDocument(); this.render(); });
			if (this.frm.is_dirty()) frappe.confirm(__("Discard unsaved changes and reload this document?"), reload); else reload();
		}
		payment() {
			if (Number(this.doc.docstatus) !== 1) { this.message(__("Submit the document before recording payment."), true); return; }
			frappe.model.open_mapped_doc({
				method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", frm: this.frm,
			});
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
	api.sales_bill = { open, newInvoice, eligible, supports, actionState, SerialChanges, saveDraft, totalField, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, profiles: PROFILES };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (!profileFor(frm)) return;
		// form-refresh precedes refresh_fields and native refresh handlers. Wait
		// for that stack and its requests; never judge permissions mid-refresh.
		setTimeout(() => frappe.after_ajax().then(() => {
			if (window.cur_frm !== frm || !supports(frm)) return;
			if (instances.has(frm)) { instances.get(frm).syncDocument(); instances.get(frm).render(); } else open(frm);
		}), 0);
	});
})();
