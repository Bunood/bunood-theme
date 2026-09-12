// Progressive disclosure over native Frappe controls; Advanced restores the original layout.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const controllers = new WeakMap();
	const pendingRefresh = new WeakMap();
	function scheduleWorkbenchRefresh(frm) {
		if (!controllers.get(frm)?.workbench) return;
		const doc = frm.doc;
		clearTimeout(pendingRefresh.get(frm));
		const timer = setTimeout(() => {
			frappe.after_ajax().then(() => {
				if (pendingRefresh.get(frm) !== timer) return;
				pendingRefresh.delete(frm);
				if (window.cur_frm === frm && frm.doc === doc) controllers.get(frm)?.refresh();
			});
		}, 0);
		pendingRefresh.set(frm, timer);
	}
	if (!frappe.has_permission && frappe.perm?.has_perm) {
		frappe.has_permission = (doctype, ptype = "read", name) => frappe.perm.has_perm(
			doctype, 0, ptype, typeof name === "string" ? frappe.get_doc?.(doctype, name) : name
		);
	}
	const EXCLUDED_MODULES = new Set(["Core", "Desk", "Email", "Website", "Printing", "Workflow", "Automation"]);
	const PROFILES = {
		Quotation: ["quotation_to", "party_name", "customer_name", "company", "transaction_date", "valid_till", "currency", "selling_price_list", "order_type", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Sales Order": ["customer", "company", "transaction_date", "delivery_date", "currency", "selling_price_list", "set_warehouse", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Delivery Note": ["customer", "company", "posting_date", "posting_time", "set_warehouse", "items", "total_qty", "grand_total"],
		"Purchase Order": ["supplier", "company", "transaction_date", "schedule_date", "currency", "buying_price_list", "set_warehouse", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Purchase Receipt": ["supplier", "company", "posting_date", "posting_time", "set_warehouse", "items", "total_qty", "grand_total"],
		"Material Request": ["material_request_type", "company", "transaction_date", "schedule_date", "set_warehouse", "items", "total_qty"],
		"Stock Entry": ["stock_entry_type", "purpose", "company", "posting_date", "posting_time", "from_warehouse", "to_warehouse", "items", "total_outgoing_value", "total_incoming_value", "value_difference"],
		"Stock Reconciliation": ["company", "purpose", "posting_date", "posting_time", "set_warehouse", "items", "difference_amount"],
		"Pick List": ["purpose", "company", "customer", "parent_warehouse", "locations"],
		"Packing Slip": ["delivery_note", "from_case_no", "to_case_no", "items", "net_weight", "gross_weight"],
		"Payment Entry": ["payment_type", "company", "posting_date", "mode_of_payment", "party_type", "party", "paid_from", "paid_to", "paid_amount", "received_amount", "reference_no", "reference_date", "references", "difference_amount"],
		"Journal Entry": ["voucher_type", "company", "posting_date", "finance_book", "cheque_no", "cheque_date", "accounts", "total_debit", "total_credit", "difference"],
		Customer: ["customer_name", "customer_type", "customer_group", "territory", "tax_id", "mobile_no", "email_id", "default_currency", "default_price_list"],
		Supplier: ["supplier_name", "supplier_group", "supplier_type", "country", "tax_id", "mobile_no", "email_id", "default_currency", "default_price_list"],
		Company: ["company_name", "abbr", "default_currency", "country", "tax_id", "default_letter_head"],
		Item: ["item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "is_sales_item", "is_purchase_item", "standard_rate", "valuation_rate", "description", "barcodes", "item_defaults"],
		Warehouse: ["warehouse_name", "company", "is_group", "parent_warehouse", "warehouse_type", "account", "disabled"],
		Property: ["property_name", "company", "property_kind", "usage_type", "status", "national_address", "address", "land_area", "floor_plan", "deeds", "ownership_shares"],
		"Real Estate Unit": ["unit_name", "property", "parent_real_estate_unit", "unit_kind", "unit_type", "unit_number", "floor_number", "is_group", "is_leasable", "status", "area"],
		Lease: ["company", "property", "contract_type", "contract_form", "our_role", "tenant_type", "tenant", "lessor_type", "lessor", "start_date", "end_date", "renewal_mode", "tenancies", "ejar_status", "ejar_contract_id", "terms_template"],
		BOM: ["item", "company", "quantity", "uom", "is_active", "is_default", "with_operations", "operations", "items", "total_cost"],
		"Work Order": ["production_item", "bom_no", "company", "qty", "planned_start_date", "planned_end_date", "source_warehouse", "wip_warehouse", "fg_warehouse", "operations", "required_items", "produced_qty"],
		"Job Card": ["work_order", "operation", "company", "for_quantity", "workstation", "employee", "time_logs", "total_completed_qty"],
		Asset: ["item_code", "asset_name", "company", "asset_category", "location", "purchase_date", "available_for_use_date", "gross_purchase_amount", "calculate_depreciation", "finance_books"],
		Project: ["project_name", "status", "project_type", "company", "expected_start_date", "expected_end_date", "percent_complete_method", "percent_complete", "customer", "sales_order", "estimated_costing"],
		Task: ["subject", "project", "status", "priority", "exp_start_date", "exp_end_date", "progress", "description", "depends_on"],
		Timesheet: ["company", "employee", "parent_project", "start_date", "end_date", "time_logs", "total_hours", "total_billable_hours", "total_billed_hours"],
		"Expense Claim": ["employee", "company", "posting_date", "approval_status", "expenses", "total_claimed_amount", "total_sanctioned_amount", "payable_account"],
	};
	// [title, start, end, collapsed]. Indices slice the matching profile, so one
	// field list owns both visibility and the order users actually see.
	const COMPOSITIONS = {
		Customer: [["Essentials", 0, 4], ["Contact and tax", 4, 7], ["Defaults", 7, 99, 1]],
		Supplier: [["Essentials", 0, 4], ["Contact and tax", 4, 7], ["Defaults", 7, 99, 1]],
		Company: [["Essentials", 0, 4], ["Tax and branding", 4, 99]],
		Item: [["Essentials", 0, 4], ["Sales and purchasing", 4, 9], ["Description and defaults", 9, 99, 1]],
		Property: [["Essentials", 0, 5], ["Address and area", 5, 8], ["Plans and ownership", 8, 99, 1]],
		"Real Estate Unit": [["Essentials", 0, 5], ["Leasing and status", 5, 10], ["Area", 10, 99]],
		Lease: [["Agreement", 0, 5], ["Parties", 5, 9], ["Term", 9, 13], ["Compliance", 13, 99, 1]],
	};
	const GUIDANCE = {
		"Payment Entry": () => [__("Record a payment"), __("Choose whether money came in, went out, or moved between accounts. Then select the party, amount, accounts, and invoices that apply.")],
		"Stock Entry": () => [__("Move stock"), __("Choose the movement, warehouses, and items. Use Advanced for manufacturing, subcontracting, and accounting options.")],
		"Delivery Note": () => [__("Prepare a delivery"), __("Choose the customer and warehouse, then add the items being delivered. Use Advanced for transport, billing, and accounting details.")],
	};
	function installBomCompatibility() {
		if (!window.frappe?.provide) return;
		frappe.provide("erpnext.bom");
		const scope = window.erpnext.bom;
		const patch = Controller => {
			const proto = Controller?.prototype;
			const original = proto?.plc_conversion_rate;
			if (!original || original._bnd_accepts_missing_doc) return;
			proto.plc_conversion_rate = function (doc, ...args) {
				return original.call(this, doc || this.frm?.doc, ...args);
			};
			proto.plc_conversion_rate._bnd_accepts_missing_doc = true;
		};
		if (scope.BomController) { patch(scope.BomController); return; }
		Object.defineProperty(scope, "BomController", {
			configurable: true, enumerable: true,
			get: () => undefined,
			set: Controller => {
				patch(Controller);
				Object.defineProperty(scope, "BomController", { configurable: true, enumerable: true, writable: true, value: Controller });
			},
		});
	}
	installBomCompatibility();
	function create(tag, cls, text, parent) {
		const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; parent?.append(el); return el;
	}
	function candidate(frm) {
		const meta = frm?.meta;
		if (!frm?.doc || !meta || meta.istable || meta.issingle || EXCLUDED_MODULES.has(meta.module)) return false;
		// Invoices use their purpose-built workbench; exceptional variants stay native.
		return !["Sales Invoice", "Purchase Invoice"].includes(frm.doctype);
	}
	function fallbackFields(frm) {
		const profile = PROFILES[frm.doctype];
		const fields = new Set(profile || []);
		for (const df of frm.meta.fields || []) {
			if (!df.fieldname) continue;
			if (profile) {
				// Empty mandatory fields stay reachable so native validation cannot dead-end.
				const control = frm.fields_dict?.[df.fieldname];
				if (df.reqd && !df.hidden && control?.get_status?.() === "Write" && [null, undefined, ""].includes(frm.doc[df.fieldname])) fields.add(df.fieldname);
			} else {
				if (df.reqd || df.bold || df.in_list_view) fields.add(df.fieldname);
				if (df.fieldtype === "Table" && /items|references|accounts|expenses|operations|locations|time_logs/i.test(df.fieldname)) fields.add(df.fieldname);
			}
		}
		if (!profile && frm.meta.title_field) fields.add(frm.meta.title_field);
		return fields;
	}
	class SimpleDocumentWorkbench {
		constructor(frm) {
			this.frm = frm;
			this.locations = new Map();
		}
		card(name, title, help) {
			const card = create("section", `bnd-stock-card bnd-stock-card-${name}`, null, this.grid);
			const head = create("div", "bnd-stock-card-head", null, card);
			create("h3", "", title, head);
			create("p", "", help, head);
			return { card, fields: create("div", "bnd-stock-card-fields", null, card) };
		}
		metric(label, initial = "0") {
			const row = create("div", "", null, this.metrics);
			create("dt", "", label, row);
			return create("dd", "", initial, row);
		}
		move(name, target) {
			const node = this.frm.fields_dict?.[name]?.$wrapper?.[0];
			if (!node) return;
			let stored = this.locations.get(name);
			if (stored?.node !== node) {
				stored?.marker?.replaceWith(stored.node);
				const marker = document.createComment(`bnd:${name}`);
				node.before(marker); stored = { node, marker }; this.locations.set(name, stored);
			}
			if (node.parentNode !== target) target.append(node);
		}
		restore() {
			for (const { node, marker } of this.locations.values()) if (marker?.isConnected) marker.replaceWith(node);
			this.locations.clear();
		}
		format(value, fieldname, fallbackType = "Currency", currency = this.frm.doc.company_currency) {
			const df = this.frm.fields_dict?.[fieldname]?.df || { fieldtype: fallbackType };
			try { return frappe.format(value || 0, df, { currency }); }
			catch (_error) {
				const options = fallbackType === "Currency"
					? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined;
				return Number(value || 0).toLocaleString(undefined, options);
			}
		}
	}
	class GroupedWorkbench extends SimpleDocumentWorkbench {
		constructor(frm, spec) {
			super(frm); this.spec = spec;
			this.root = create("section", "bnd-simple-composer", null, null);
			this.root.setAttribute("aria-label", __(frm.meta.name));
			this.groups = spec.map(([title, from, to, collapsed]) => {
				const card = create(collapsed ? "details" : "section", "bnd-simple-group", null, this.root);
				create(collapsed ? "summary" : "h3", "", __(title), card);
				return { from, to, fields: create("div", "bnd-simple-group-fields", null, card) };
			});
			this.required = create("section", "bnd-simple-group bnd-simple-required", null, this.root);
			create("h3", "", __("Required to save"), this.required);
			this.requiredFields = create("div", "bnd-simple-group-fields", null, this.required);
		}
		refresh(active, selected) {
			if (!active) { this.restore(); this.root.hidden = true; return; }
			this.root.hidden = false;
			const profile = PROFILES[this.frm.doctype] || [];
			const placed = new Set();
			for (const group of this.groups) for (const name of profile.slice(group.from, group.to)) {
				if (!selected.has(name)) continue;
				this.move(name, group.fields); placed.add(name);
			}
			let required = 0;
			for (const name of selected) if (!placed.has(name)) { this.move(name, this.requiredFields); required++; }
			this.required.hidden = !required;
		}
	}

	class StockEntryWorkbench extends SimpleDocumentWorkbench {
		constructor(frm) {
			super(frm);
			this.root = create("section", "bnd-stock-simple", null, null);
			this.root.setAttribute("aria-label", __("Stock movement steps"));
			const progress = create("ol", "bnd-stock-steps", null, this.root);
			for (const label of [__("Movement"), __("Warehouses"), __("Items")]) {
				const item = create("li", "", null, progress);
				create("span", "bnd-stock-step-dot", String(item.previousElementSibling ? progress.children.length : 1), item);
				create("span", "", label, item);
			}
			this.grid = create("div", "bnd-stock-simple-grid", null, this.root);
			this.movement = this.card("movement", __("Choose the movement"), __("Select how stock should enter, leave, or move between warehouses."));
			this.route = this.card("route", __("Choose the route"), __("Only the warehouses required for this movement are shown."));
			this.items = this.card("items", __("Add items and quantities"), __("Scan, search, or add items in the table. Stock is posted only after submission."));
			this.items.card.classList.add("bnd-stock-card-wide");
			this.details = create("details", "bnd-stock-details", null, this.grid);
			create("summary", "", __("Date and company"), this.details);
			this.detailFields = create("div", "bnd-stock-card-fields", null, this.details);
			this.summary = create("section", "bnd-stock-summary", null, this.grid);
			create("h3", "", __("Movement summary"), this.summary);
			this.metrics = create("dl", "", null, this.summary);
			this.metricNodes = [
				this.metric(__("Outgoing"), "0.00"), this.metric(__("Incoming"), "0.00"), this.metric(__("Difference"), "0.00"),
			];
		}
		refresh(active) {
			this.root.hidden = !active;
			if (!active) { this.restore(); return; }
			this.move("stock_entry_type", this.movement.fields);
			this.move("purpose", this.movement.fields);
			this.move("from_warehouse", this.route.fields);
			this.move("to_warehouse", this.route.fields);
			this.move("items", this.items.fields);
			for (const fieldname of ["company", "posting_date", "posting_time"]) this.move(fieldname, this.detailFields);
			const purpose = String(this.frm.doc.purpose || "").toLowerCase();
			this.route.card.dataset.movement = purpose.includes("receipt") ? "receipt" : purpose.includes("issue") ? "issue" : "transfer";
			this.metricNodes[0].innerHTML = this.format(this.frm.doc.total_outgoing_value, "total_outgoing_value");
			this.metricNodes[1].innerHTML = this.format(this.frm.doc.total_incoming_value, "total_incoming_value");
			this.metricNodes[2].innerHTML = this.format(this.frm.doc.value_difference, "value_difference");
		}
	}
	class DeliveryNoteWorkbench extends SimpleDocumentWorkbench {
		constructor(frm) {
			super(frm);
			this.root = create("section", "bnd-stock-simple bnd-delivery-simple", null, null);
			this.root.setAttribute("aria-label", __("Delivery steps"));
			const progress = create("ol", "bnd-stock-steps", null, this.root);
			for (const [index, label] of [__("Customer"), __("Fulfilment"), __("Items")].entries()) {
				const item = create("li", "", null, progress);
				create("span", "bnd-stock-step-dot", String(index + 1), item);
				create("span", "", label, item);
			}
			this.grid = create("div", "bnd-stock-simple-grid", null, this.root);
			this.customer = this.card("customer", __("Who is receiving this delivery?"), __("Select the customer for this delivery note."));
			this.fulfilment = this.card("route", __("Where is it leaving from?"), __("Choose the source warehouse used for the delivered items."));
			this.items = this.card("items", __("What are you delivering?"), __("Add the items and quantities. Stock changes only after submission."));
			this.items.card.classList.add("bnd-stock-card-wide");
			this.details = create("details", "bnd-stock-details", null, this.grid);
			create("summary", "", __("Date and company"), this.details);
			this.detailFields = create("div", "bnd-stock-card-fields", null, this.details);
			this.summary = create("section", "bnd-stock-summary", null, this.grid);
			create("h3", "", __("Delivery summary"), this.summary);
			this.metrics = create("dl", "", null, this.summary);
			this.quantity = this.metric(__("Total quantity"));
			this.total = this.metric(__("Grand total"));
		}
		refresh(active) {
			this.root.hidden = !active;
			if (!active) { this.restore(); return; }
			this.move("customer", this.customer.fields);
			this.move("set_warehouse", this.fulfilment.fields);
			this.move("items", this.items.fields);
			for (const fieldname of ["company", "posting_date", "posting_time"]) this.move(fieldname, this.detailFields);
			const currency = this.frm.doc.currency || this.frm.doc.company_currency;
			this.quantity.innerHTML = this.format(this.frm.doc.total_qty, "total_qty", "Float", currency);
			this.total.innerHTML = this.format(this.frm.doc.grand_total, "grand_total", "Float", currency);
		}
	}
	class SimpleForm {
		constructor(frm) {
			this.frm = frm; this.simple = true; this.selected = fallbackFields(frm);
			this.header = create("section", "bnd-simple-form-head", null, null);
			const heading = create("div", "bnd-simple-heading", null, this.header);
			const copy = create("div", "", null, heading);
			const guidance = GUIDANCE[frm.doctype]?.() || [__(frm.meta.name), __("The fields needed for this task are shown. Advanced mode keeps every ERPNext option on the same document.")];
			create("p", "bnd-simple-kicker", __("Simple mode"), copy);
			create("h2", "", guidance[0], copy);
			create("p", "bnd-simple-copy", guidance[1], copy);
			const modes = create("div", "bnd-simple-switch", null, heading); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = this.button(modes, __("Simple"), () => this.setMode(true), true);
			this.advancedButton = this.button(modes, __("Advanced"), () => this.setMode(false));
			this.actions = create("div", "bnd-simple-actions", null, this.header); this.actions.setAttribute("role", "toolbar"); this.actions.setAttribute("aria-label", __("Document actions"));
			this.newButton = this.action(__("New"), "F1", () => frappe.new_doc(this.frm.doctype), true);
			this.saveButton = this.action(__("Save"), "F2", () => this.frm.save("Save"), true);
			this.deleteButton = this.action(__("Delete"), "F4", () => this.frm.savetrash());
			this.printButton = this.action(__("Print"), "F6", () => this.frm.print_doc());
			this.submitButton = this.action(__("Submit"), "F8", () => this.frm.savesubmit());
			this.workbench = frm.doctype === "Stock Entry"
				? new StockEntryWorkbench(frm)
				: frm.doctype === "Delivery Note" ? new DeliveryNoteWorkbench(frm)
					: COMPOSITIONS[frm.doctype] ? new GroupedWorkbench(frm, COMPOSITIONS[frm.doctype]) : null;
			this.ensureMounted();
			this.keyHandler = event => {
				if (!this.simple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
				const actions = { F1: this.newButton, F2: this.saveButton, F4: this.deleteButton, F6: this.printButton, F8: this.submitButton };
				const target = actions[event.key]; if (!target || target.hidden || target.disabled) return;
				event.preventDefault(); event.stopPropagation(); target.click();
			};
			frm.$wrapper?.[0]?.addEventListener("keydown", this.keyHandler, true);
			this.setMode(true);
		}
		button(parent, label, action, primary = false) {
			const b = create("button", `bnd-bill-button${primary ? " bnd-bill-primary" : ""}`, label, parent); b.type = "button"; b.addEventListener("click", action); return b;
		}
		action(label, key, handler, primary = false) {
			const button = this.button(this.actions, "", handler, primary); button.classList.add("bnd-bill-action");
			create("span", "bnd-bill-action-label", label, button); create("kbd", "", key, button); button.setAttribute("aria-keyshortcuts", key); return button;
		}
		ensureMounted() {
			const layout = this.frm.$wrapper?.find(".form-layout").first()?.[0];
			const fallback = this.frm.$wrapper?.[0];
			if (layout) {
				const parent = layout.parentNode;
				const mounted = this.workbench
					? this.header.parentNode === parent && this.header.nextElementSibling === this.workbench.root && this.workbench.root.nextElementSibling === layout
					: this.header.parentNode === parent && this.header.nextElementSibling === layout;
				if (!mounted) layout.before(this.header, ...(this.workbench ? [this.workbench.root] : []));
			} else if (fallback && !this.header.isConnected) {
				fallback.prepend(this.header);
				if (this.workbench) this.header.after(this.workbench.root);
			}
		}
		refresh() {
			this.ensureMounted();
			this.selected = fallbackFields(this.frm);
			for (const [name, field] of Object.entries(this.frm.fields_dict || {})) {
				const wrapper = field?.$wrapper?.[0]; if (!wrapper) continue;
				wrapper.classList.toggle("bnd-simple-visible", this.selected.has(name));
				wrapper.classList.toggle("bnd-simple-omitted", !this.selected.has(name));
			}
			for (const link of this.frm.$wrapper?.find(".form-tabs .nav-link[aria-controls]") || []) {
				const pane = document.getElementById(link.getAttribute("aria-controls"));
				link.parentElement?.classList.toggle("bnd-simple-tab-omitted", !pane?.querySelector(".bnd-simple-visible"));
			}
			this.header.hidden = false;
			this.header.classList.toggle("bnd-simple-form-head-advanced", !this.simple);
			const setLayout = active => {
				this.frm.$wrapper?.toggleClass("bnd-generic-simple", active);
				this.frm.$wrapper?.toggleClass("bnd-stock-simple-active", active && this.frm.doctype === "Stock Entry");
				this.frm.$wrapper?.toggleClass("bnd-delivery-simple-active", active && this.frm.doctype === "Delivery Note");
				this.frm.$wrapper?.toggleClass("bnd-composed-simple-active", active && !!COMPOSITIONS[this.frm.doctype]);
			};
			if (this.simple) { this.workbench?.refresh(true, this.selected); setLayout(true); }
			else { setLayout(false); this.workbench?.refresh(false, this.selected); }
			this.simpleButton.setAttribute("aria-pressed", String(this.simple));
			this.advancedButton.setAttribute("aria-pressed", String(!this.simple));
			this.simpleButton.classList.toggle("bnd-bill-primary", this.simple);
			this.advancedButton.classList.toggle("bnd-bill-primary", !this.simple);
			const status = Number(this.frm.doc.docstatus); const local = !!this.frm.doc.__islocal;
			this.saveButton.hidden = status !== 0 || !!this.frm.save_disabled;
			this.deleteButton.hidden = status !== 0 || local;
			this.printButton.hidden = local;
			this.submitButton.hidden = status !== 0 || local || this.frm.is_dirty() || !this.frm.meta.is_submittable;
		}
		setMode(simple) {
			const active = document.activeElement;
			const keep = active?.matches?.("input, textarea, select") && this.frm.$wrapper?.[0]?.contains(active);
			const selection = keep && "selectionStart" in active ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
			this.simple = simple; this.refresh();
			if (keep && active.isConnected) {
				active.focus({ preventScroll: true });
				if (selection?.[0] != null) active.setSelectionRange(...selection);
			}
		}
	}
	function mount(frm) {
		if (!candidate(frm)) return false;
		const current = controllers.get(frm);
		if (current) current.refresh(); else controllers.set(frm, new SimpleForm(frm));
		return true;
	}
	api.simple_forms = { mount, candidate, profiles: PROFILES, compositions: COMPOSITIONS, fallbackFields, GroupedWorkbench };
	// Refresh presentation after native field handlers and their requests finish.
	// Do not calculate values here or return an AJAX wait into a native trigger.
	if (frappe.ui?.form?.on) {
		for (const [doctype, fields] of Object.entries({
			"Stock Entry": ["stock_entry_type", "purpose", "from_warehouse", "to_warehouse", "total_outgoing_value", "total_incoming_value", "value_difference"],
			"Stock Entry Detail": ["items_add", "items_remove", "item_code", "qty", "transfer_qty", "basic_rate", "basic_amount", "amount", "s_warehouse", "t_warehouse"],
			"Delivery Note": ["customer", "set_warehouse", "currency", "total_qty", "grand_total"],
			"Delivery Note Item": ["items_add", "items_remove", "item_code", "qty", "stock_qty", "rate", "amount"],
		})) frappe.ui.form.on(doctype, Object.fromEntries(fields.map(name => [name, scheduleWorkbenchRefresh])));
	}
	$(document).on("form-refresh.bnd-simple-forms", (_event, frm) => {
		setTimeout(() => frappe.after_ajax().then(() => { if (window.cur_frm === frm) mount(frm); }), 0);
	});
})();
