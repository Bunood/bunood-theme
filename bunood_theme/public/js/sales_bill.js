// Bunood Quick bill: a presentation of the CURRENT native Sales Invoice.
// No separate document, calculation engine, posting endpoint, or persisted state.
// Native controls + model triggers own all changes. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	const fieldStatus = (frm, name) => frm.fields_dict[name]?.get_status?.() || "None";
	const canAdd = frm => {
		const grid = frm.fields_dict.items.grid;
		return grid.is_editable() && !grid.cannot_add_rows && !grid.df.cannot_add_rows;
	};
	const canRemove = frm => frm.fields_dict.items.grid.is_editable() && !frm.fields_dict.items.grid.df.cannot_delete_rows;
	function totalField(frm) { return Number(frm.doc.disable_rounded_total) || !frm.fields_dict.rounded_total ? "grand_total" : "rounded_total"; }
	function eligible(frm) {
		const d = frm?.doc;
		return !!(d && frm.doctype === "Sales Invoice" && Number(d.docstatus) === 0 &&
			!d.is_return && !d.is_pos && !d.is_debit_note && !d.amended_from && !frm.save_disabled &&
			fieldStatus(frm, "customer") !== "None" &&
			frm.fields_dict.items.grid?.is_editable() &&
			!(d.items || []).some(r => r.sales_order || r.delivery_note || r.so_detail || r.dn_detail));
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
	class QuickBill {
		constructor(frm) {
			this.frm = frm; this.doc = frm.doc; this.controls = []; this.closed = false; this.invalid = new Map(); this.pending = new Map(); this.rowViews = new Map(); this.editTimers = new Map();
			this.queue = new SerialChanges(() => this.active(), () => this.busy());
			this.dialog = new frappe.ui.Dialog({ title: __("Quick bill"), size: "extra-large", fields: [], static: true,
				on_hide: () => { this.closed = true; for (const timer of this.editTimers.values()) clearTimeout(timer); instances.delete(frm); },
			});
			this.root = node("section", "bnd-bill", null, this.dialog.body);
			this.root.setAttribute("data-bnd-part", "sales-bill");
			this.root.setAttribute("aria-label", __("Quick bill"));
			const intro = node("header", "bnd-bill-intro", null, this.root);
			node("p", "", __("Choose a customer, add items, then save your draft for review."), intro);
			this.status = node("p", "bnd-bill-status", "", this.root);
			this.status.setAttribute("role", "status");
			this.revertButton = button(__("Revert invalid edits"), this.root, () => { for (const key of this.invalid.keys()) this.pending.delete(key); this.invalid.clear(); this.render(); this.message(__("Changes stay in this invoice when you close this view.")); });
			this.revertButton.hidden = true;
			this.editor = node("fieldset", "bnd-bill-editor", null, this.root);
			const layout = node("div", "bnd-bill-layout", null, this.editor);
			const main = node("div", "bnd-bill-main", null, layout);
			const customer = node("section", "bnd-bill-panel", null, main);
			const customerHead = node("header", "bnd-bill-section-head", null, customer);
			node("h3", "", __("Who are you billing?"), customerHead);
			if ((frappe.boot.user.can_create || []).includes("Customer") && fieldStatus(frm, "customer") === "Write") {
				button(__("New customer"), customerHead, () => this.newCustomer());
			}
			this.bindControl(customer, frm.fields_dict.customer, this.doc);
			this.context = node("dl", "bnd-bill-context", null, customer);
			const items = node("section", "bnd-bill-panel", null, main);
			node("h3", "", __("What are you selling?"), items);
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
			this.picker.$input.on("keydown.bnd-bill", e => {
				if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.addItem(); }
			});
			node("p", "bnd-bill-hint", __("Select an item, then Add item. Ctrl+Enter adds it from search."), items);
			this.lines = node("div", "bnd-bill-lines", null, items);
			this.rail = node("aside", "bnd-bill-panel bnd-bill-rail", null, layout);
			node("h3", "", __("Bill total"), this.rail);
			this.totals = node("dl", "bnd-bill-totals", null, this.rail);
			this.stock = node("p", "bnd-bill-hint", null, this.rail);
			const options = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Dates and stock"), options);
			for (const name of ["due_date", "update_stock", "set_warehouse"]) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(options, source, this.doc);
			}
			const footer = node("footer", "bnd-bill-footer", null, this.root);
			this.footerTotal = node("strong", "bnd-bill-footer-total", "", footer);
			const actions = node("div", "bnd-bill-actions", null, footer);
			this.fullButton = button(__("Full invoice"), actions, () => this.fullInvoice());
			this.saveButton = button(__("Save draft and review"), actions, () => this.save(), true);
			node("p", "bnd-bill-hint", __("Saving a draft does not post accounts, take payment, or issue the invoice."), this.rail);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); this.save(); }
				if (e.key === "Escape" && !popupWasOpen) { e.preventDefault(); this.fullInvoice(); }
			});
			this.render(); this.dialog.show();
		}
		active() { return !this.closed && window.cur_frm === this.frm && this.frm.doc === this.doc && eligible(this.frm); }
		busy() {
			const busy = !!this.queue.count || !!this.saving || !!this.closing || !!this.flushing;
			if (this.editor) this.editor.disabled = busy;
			if (this.addButton) this.addButton.disabled = busy || !this.frm.doc.customer || !canAdd(this.frm);
			if (this.saveButton) this.saveButton.disabled = busy;
			if (this.fullButton) this.fullButton.disabled = busy;
			this.root?.setAttribute("aria-busy", String(busy));
		}
		message(text, error = false) { this.status.textContent = text === __("Changes stay in this invoice when you close this view.") ? "" : text; this.status.classList.toggle("bnd-bill-error", error); }
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
			if (!this.frm.doc.customer) { this.message(__("Choose a customer before adding items."), true); return; }
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
		newCustomer() {
			if (this.saving || this.closing || this.queue.count || fieldStatus(this.frm, "customer") !== "Write" || !(frappe.boot.user.can_create || []).includes("Customer")) return;
			frappe.ui.form.make_quick_entry("Customer", doc => {
				if (this.active()) this.change(() => {
					if (fieldStatus(this.frm, "customer") !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
					return this.frm.set_value("customer", doc.name);
				}).catch(() => {});
			}, null, null, true);
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
		render() {
			if (this.closed) return;
			const frm = this.frm, doc = frm.doc;
			this.context.replaceChildren();
			for (const name of ["company", "posting_date", "currency", "selling_price_list"]) {
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
				node("strong", "", row.item_name || row.item_code, info);
				node("bdi", "bnd-bill-hint", `${row.item_code}${row.uom ? " · " + __(row.uom) : ""}`, info);
				for (const name of ["qty", "rate"]) {
					const cell = node("div", "bnd-bill-cell", null, line);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, { df }, row, true);
				}
				const amount = node("div", "bnd-bill-line-total", null, line);
				view = { line, amount }; this.rowViews.set(row.name, view);
				}
				const { line, amount } = view;
				amount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
				}
				if (!view.remove && canRemove(frm)) { view.remove = button(__("Remove"), line, () => this.removeItem(row)); view.remove.setAttribute("aria-label", `${__("Remove")} · ${row.item_code}`); }
				if (view.remove) view.remove.hidden = !canRemove(frm);
			}
			this.totals.replaceChildren();
			for (const name of ["net_total", "discount_amount", "total_taxes_and_charges", "rounding_adjustment"]) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || (name !== "net_total" && !doc[name])) continue;
				const pair = node("div", "", null, this.totals);
				node("dt", "", __(field.df.label), pair); this.money(node("dd", "", null, pair), doc[name], field.df);
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
				await this.flush();
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); return; }
				this.allowClose = true; this.dialog.hide();
			} catch (e) { this.message(e.message || __("Could not update the invoice. Open the full invoice to review."), true); }
			finally { this.closing = false; this.busy(); }
		}
		async save() {
			if (this.saving || this.closing) return;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (this.invalid.size) throw Error(__("Correct the highlighted value before saving."));
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				if (!this.frm.doc.customer || !this.frm.doc.items.some(r => r.item_code)) throw Error(__("Choose a customer and add at least one item."));
				await this.queue.run(() => saveDraft(this.frm));
				this.allowClose = true; this.dialog.hide(); frappe.show_alert({ message: __("Draft saved. Review the invoice before submitting or taking payment."), indicator: "green" });
			} catch (e) { this.message(e.message || __("The draft was not saved. Review the message or open the full invoice."), true); }
			finally { this.saving = false; this.busy(); }
		}
	}
	function open(frm) {
		if (!eligible(frm)) {
			frappe.msgprint(!frm.fields_dict.items.grid.is_editable()
				? __("Quick bill needs an editable items table. Continue in the full invoice.")
				: __("Use the full invoice for this document type or permission level."));
			return;
		}
		if (instances.has(frm)) { instances.get(frm).dialog.show(); return; }
		instances.set(frm, new QuickBill(frm));
	}
	function newInvoice() {
		const previous = frappe.route_hooks.after_load;
		const afterLoad = frm => {
			previous?.(frm);
			if (frm.doctype === "Sales Invoice" && frm.is_new() && !frm.doc.items.some(r => r.item_code)) open(frm);
		};
		frappe.route_hooks.after_load = afterLoad;
		return frappe.new_doc("Sales Invoice").catch(error => {
			if (frappe.route_hooks.after_load === afterLoad) frappe.route_hooks.after_load = previous;
			throw error;
		});
	}
	api.sales_bill = { open, newInvoice, eligible, SerialChanges, saveDraft, totalField, canAdd, canRemove };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (frm.doctype !== "Sales Invoice") return;
		// form-refresh precedes refresh_fields and native refresh handlers. Wait
		// for that stack and its requests; never judge permissions mid-refresh.
		setTimeout(() => frappe.after_ajax().then(() => {
			if (window.cur_frm === frm && eligible(frm)) frm.add_custom_button(__("Quick bill"), () => open(frm));
		}), 0);
	});
})();
