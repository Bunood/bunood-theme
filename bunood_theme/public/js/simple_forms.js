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
		Quotation: ["quotation_to", "party_name", "company", "transaction_date", "valid_till", "currency", "selling_price_list", "order_type", "items", "taxes_and_charges", "discount_amount", "grand_total"],
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
		Item: ["item_name", "item_code", "item_group", "stock_uom", "disabled", "is_stock_item", "is_sales_item", "is_purchase_item", "standard_rate", "valuation_rate", "description", "barcodes", "item_defaults"],
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
		"POS Profile": ["__newname", "company", "warehouse", "payments", "currency", "selling_price_list", "write_off_account", "write_off_cost_center", "write_off_limit"],
	};
	// [title, start, end, collapsed]. Indices slice the matching profile, so one
	// field list owns both visibility and the order users actually see.
	const COMPOSITIONS = {
		Customer: [["Essentials", 0, 4], ["Contact and tax", 4, 7], ["Defaults", 7, 99, 1]],
		Supplier: [["Essentials", 0, 4], ["Contact and tax", 4, 7], ["Defaults", 7, 99, 1]],
		Company: [["Essentials", 0, 4], ["Tax and branding", 4, 99]],
		Item: [["Essentials", 0, 5], ["Sales and purchasing", 5, 10], ["Description and defaults", 10, 99, 1]],
		Property: [["Essentials", 0, 5], ["Address and area", 5, 8], ["Plans and ownership", 8, 99, 1]],
		"Real Estate Unit": [["Essentials", 0, 5], ["Leasing and status", 5, 10], ["Area", 10, 99]],
		Lease: [["Agreement", 0, 5], ["Parties", 5, 9], ["Term", 9, 13], ["Compliance", 13, 99, 1]],
		"POS Profile": [["Profile", 0, 3], ["Payment methods", 3, 4], ["Currency and write-off defaults", 4, 99]],
	};
	// Task workbenches are deliberately not a renamed GroupedWorkbench. Each
	// document declares its own workflow, panel hierarchy and outcome summary;
	// only the reversible native-control adapter is shared.
	const TASK_WORKBENCHES = {
		Quotation: {
			variant: "offer", steps: ["Customer", "Offer", "Review"],
			panels: [
				["identity", "Who is this offer for?", "Customer, company and validity stay together at the top of the offer.", ["quotation_to", "party_name", "company", "transaction_date", "valid_till"], "lead"],
				["items", "Build the offer", "Add the products or services, quantities and prices the customer will receive.", ["items"], "sheet"],
				["commercial", "Commercial terms", "Choose currency, price list, tax and any document-level discount.", ["currency", "selling_price_list", "order_type", "taxes_and_charges", "discount_amount"], "aside"],
			],
			metrics: [["Offer total", "grand_total", "Currency"]],
		},
		"Sales Order": {
			variant: "sales-order", steps: ["Customer", "Commitment", "Fulfilment"],
			panels: [
				["commitment", "Customer commitment", "Confirm who ordered and the dates Bunood is promising.", ["customer", "company", "transaction_date", "delivery_date"], "lead"],
				["items", "What was ordered?", "Keep quantities, prices and delivery expectations together in one working sheet.", ["items"], "sheet"],
				["fulfilment", "Fulfilment and pricing", "Set the source warehouse and the commercial defaults for this order.", ["set_warehouse", "currency", "selling_price_list", "taxes_and_charges", "discount_amount"], "aside"],
			],
			metrics: [["Committed total", "grand_total", "Currency"]],
		},
		"Purchase Order": {
			variant: "purchase-order", steps: ["Supplier", "Schedule", "Approval"],
			panels: [
				["commitment", "Supplier and schedule", "Keep the supplier, company and required delivery date visible before ordering.", ["supplier", "company", "transaction_date", "schedule_date"], "lead"],
				["items", "What are we ordering?", "Add the exact products or services, quantities and agreed prices.", ["items"], "sheet"],
				["terms", "Receiving and commercial terms", "Choose the receiving warehouse, currency, price list, tax and discount.", ["set_warehouse", "currency", "buying_price_list", "taxes_and_charges", "discount_amount"], "aside"],
			],
			metrics: [["Purchase commitment", "grand_total", "Currency"]],
		},
		"Purchase Receipt": {
			variant: "receipt", steps: ["Supplier", "Receive", "Verify"],
			panels: [
				["arrival", "Incoming delivery", "Identify the supplier, company and actual receipt time.", ["supplier", "company", "posting_date", "posting_time"], "lead"],
				["items", "Verify received items", "Record only the quantities physically received into the selected warehouse.", ["items"], "sheet"],
				["warehouse", "Receiving destination", "Confirm where the accepted stock will be stored.", ["set_warehouse"], "aside"],
			],
			metrics: [["Received quantity", "total_qty", "Float"], ["Receipt value", "grand_total", "Currency"]],
		},
		"Material Request": {
			variant: "request", steps: ["Need", "Items", "Schedule"],
			panels: [
				["request", "What is needed?", "Choose the request purpose, company and required date before adding items.", ["material_request_type", "company", "transaction_date", "schedule_date"], "lead"],
				["items", "Requested items", "Record each item, quantity and the warehouse that needs it.", ["items"], "sheet"],
				["warehouse", "Default destination", "Use a warehouse default when the request shares one destination.", ["set_warehouse"], "aside"],
			],
			metrics: [["Requested quantity", "total_qty", "Float"]],
		},
		"Stock Reconciliation": {
			variant: "count", steps: ["Warehouse", "Count", "Difference"],
			panels: [
				["context", "Count context", "Choose the company, warehouse and exact posting time for this physical count.", ["company", "purpose", "set_warehouse", "posting_date", "posting_time"], "lead"],
				["items", "Counted stock", "Enter the physical quantity and valuation for every counted item.", ["items"], "sheet"],
			],
			metrics: [["Value difference", "difference_amount", "Currency"]],
		},
		"Payment Entry": {
			variant: "payment", steps: ["Direction", "Allocation", "Confirmation"],
			panels: [
				["direction", "How is money moving?", "Choose receive, pay or transfer and the payment method.", ["payment_type", "company", "posting_date", "mode_of_payment"], "lead"],
				["party", "Who is this payment for?", "Select the customer, supplier or other party when the movement belongs to one.", ["party_type", "party"], "party"],
				["accounts", "From account to account", "The native account pair remains the source of truth for the posting.", ["paid_from", "paid_to"], "flow"],
				["amount", "Amount", "Enter the paid and received amounts in their native currencies.", ["paid_amount", "received_amount"], "amount"],
				["allocations", "Allocate invoices", "Apply the payment to native invoice references and keep any difference visible.", ["references"], "sheet"],
				["evidence", "Payment evidence", "Add the bank or payment reference and its date.", ["reference_no", "reference_date"], "evidence"],
			],
			metrics: [["Unallocated difference", "difference_amount", "Currency"]],
		},
		"Journal Entry": {
			variant: "journal", steps: ["Voucher", "Debit and credit", "Balance"],
			panels: [
				["voucher", "Journal context", "Choose the voucher type, company and posting evidence.", ["voucher_type", "company", "posting_date", "finance_book", "cheque_no", "cheque_date"], "lead"],
				["lines", "Debit and credit lines", "Every line remains a native account row with its original dimensions and validation.", ["accounts"], "sheet"],
			],
			metrics: [["Total debit", "total_debit", "Currency"], ["Total credit", "total_credit", "Currency"], ["Difference", "difference", "Currency"]],
		},
		"Expense Claim": {
			variant: "claim", steps: ["Employee", "Expenses", "Approval"],
			panels: [
				["claimant", "Claimant and approval", "Identify the employee, company, posting date and current approval state.", ["employee", "company", "posting_date", "approval_status"], "lead"],
				["items", "Claimed expenses", "Add each expense with its receipt, category and amount.", ["expenses"], "sheet"],
				["settlement", "Settlement", "Review sanctioned totals and the payable account before submission.", ["payable_account"], "aside"],
			],
			metrics: [["Claimed", "total_claimed_amount", "Currency"], ["Approved", "total_sanctioned_amount", "Currency"]],
		},
	};
	const GUIDANCE = {
		Quotation: () => [__("Prepare an offer"), __("Once the quotation is submitted, use Create Sales Invoice above. The customer, items, and prices carry into a draft invoice for review.")],
		"Sales Order": () => [__("Confirm a sales order"), __("Capture the customer commitment, promised delivery, fulfilment route and commercial total in one place.")],
		"Purchase Order": () => [__("Place a purchase order"), __("Agree the supplier, schedule, receiving destination and commercial terms before committing the purchase.")],
		"Purchase Receipt": () => [__("Receive a supplier delivery"), __("Verify what physically arrived and where accepted stock will be stored before submission.")],
		"Material Request": () => [__("Request materials"), __("State what is needed, when it is needed and which warehouse should receive it.")],
		"Stock Reconciliation": () => [__("Reconcile a stock count"), __("Record a dated physical count and review the native quantity and value difference before submission.")],
		"Payment Entry": () => [__("Record a payment"), __("Choose whether money came in, went out, or moved between accounts. Then select the party, amount, accounts, and invoices that apply.")],
		"Stock Entry": () => [__("Move stock"), __("Choose the movement, warehouses, and items. Use Advanced for manufacturing, subcontracting, and accounting options.")],
		"Delivery Note": () => [__("Prepare a delivery"), __("Choose the customer and warehouse, then add the items being delivered. Use Advanced for transport, billing, and accounting details.")],
		"Journal Entry": () => [__("Record a journal entry"), __("Build a balanced native debit and credit voucher with the evidence required for review.")],
		"Expense Claim": () => [__("Review an expense claim"), __("Capture the employee, receipt evidence, approval state and payable outcome in one review flow.")],
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
	function hasPurposeWorkbench(doctype) {
		return ["Stock Entry", "Delivery Note"].includes(doctype) || !!TASK_WORKBENCHES[doctype] || !!COMPOSITIONS[doctype];
	}
	function candidate(frm) {
		const meta = frm?.meta;
		if (!frm?.doc || !meta || meta.istable || meta.issingle || EXCLUDED_MODULES.has(meta.module)) return false;
		// Invoices use their purpose-built workbench; exceptional variants stay native.
		// An unsupported document stays fully native until it receives a complete
		// workbench. A field-filtered native form is not a finished Simple page.
		return !["Sales Invoice", "Purchase Invoice"].includes(frm.doctype) && hasPurposeWorkbench(frm.doctype);
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
	function canCreateSalesInvoice(frm) {
		return frm?.doctype === "Quotation" && Number(frm.doc?.docstatus) === 1 &&
			!["Expired", "Lost", "Cancelled"].includes(frm.doc?.status) &&
			(frappe.boot?.user?.can_create || []).includes("Sales Invoice");
	}
	function createSalesInvoice(frm) {
		if (!canCreateSalesInvoice(frm)) return;
		return frappe.model.open_mapped_doc({
			method: "erpnext.selling.doctype.quotation.quotation.make_sales_invoice",
			frm,
		});
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
			this.root.setAttribute("data-doctype", frm.doctype);
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
	class TaskWorkbench extends SimpleDocumentWorkbench {
		constructor(frm, spec) {
			super(frm); this.spec = spec;
			this.root = create("section", `bnd-task-workbench bnd-task-${spec.variant}`, null, null);
			this.root.dataset.doctype = frm.doctype;
			this.root.setAttribute("aria-label", __(frm.meta.name));
			const stages = create("ol", "bnd-task-stages", null, this.root);
			for (const [index, label] of spec.steps.entries()) {
				const stage = create("li", "", null, stages);
				create("span", "bnd-task-stage-number", String(index + 1), stage);
				create("span", "", __(label), stage);
			}
			this.canvas = create("div", "bnd-task-canvas", null, this.root);
			this.panels = spec.panels.map(([name, title, help, fields, shape]) => {
				const panel = create("section", `bnd-task-panel bnd-task-panel-${name} bnd-task-panel-${shape}`, null, this.canvas);
				const head = create("header", "bnd-task-panel-head", null, panel);
				create("h3", "", __(title), head);
				create("p", "", __(help), head);
				return { fields, body: create("div", "bnd-task-panel-fields", null, panel) };
			});
			this.summary = create("section", "bnd-task-outcome", null, this.canvas);
			create("h3", "", __("Document outcome"), this.summary);
			this.metrics = create("dl", "", null, this.summary);
			this.metricNodes = spec.metrics.map(([label, fieldname, type]) => ({
				fieldname, type, node: this.metric(__(label)),
			}));
			this.required = create("details", "bnd-task-required", null, this.canvas);
			create("summary", "", __("Required to save"), this.required);
			this.requiredFields = create("div", "bnd-task-panel-fields", null, this.required);
		}
		refresh(active, selected) {
			this.root.hidden = !active;
			if (!active) { this.restore(); return; }
			const placed = new Set(this.spec.metrics.map(([, fieldname]) => fieldname));
			for (const panel of this.panels) for (const name of panel.fields) {
				if (!selected.has(name)) continue;
				this.move(name, panel.body); placed.add(name);
			}
			let required = 0;
			for (const name of selected) {
				if (placed.has(name) || !this.frm.fields_dict?.[name]?.$wrapper?.[0]) continue;
				this.move(name, this.requiredFields); required++;
			}
			this.required.hidden = !required;
			const currency = this.frm.doc.currency || this.frm.doc.company_currency;
			for (const metric of this.metricNodes) metric.node.innerHTML = this.format(
				this.frm.doc[metric.fieldname], metric.fieldname, metric.type, currency
			);
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
			const title = create("div", "bnd-simple-title-row", null, copy);
			create("h2", "", guidance[0], title);
			this.stateBadge = create("span", "bnd-document-state", "", title);
			this.stateBadge.setAttribute("role", "status");
			create("p", "bnd-simple-copy", guidance[1], copy);
			const modes = create("div", "bnd-simple-switch", null, heading); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = this.button(modes, __("Simple"), () => this.setMode(true), true);
			this.advancedButton = this.button(modes, __("Advanced"), () => this.setMode(false));
			this.actions = create("div", "bnd-simple-actions", null, null); this.actions.setAttribute("role", "toolbar"); this.actions.setAttribute("aria-label", __("Document actions"));
			const actionIdentity = create("div", "bnd-simple-actions-identity", null, this.actions);
			this.actionTitle = create("strong", "", guidance[0], actionIdentity);
			this.actionState = create("span", "", "", actionIdentity);
			this.primaryActions = create("div", "bnd-simple-primary-actions", null, this.actions);
			this.saveButton = this.action(this.primaryActions, __("Save and submit"), "F2", () => this.commit(), true);
			this.invoiceButton = this.action(this.primaryActions, __("Create Sales Invoice"), "", () => createSalesInvoice(this.frm), true);
			this.tools = create("details", "bnd-simple-tools", null, this.actions);
			this.toolsTrigger = create("summary", "bnd-bill-button", __("Document actions"), this.tools);
			this.toolsTrigger.setAttribute("role", "button");
			this.toolsTrigger.setAttribute("aria-haspopup", "true");
			this.menu = create("div", "bnd-simple-tools-menu", null, this.tools);
			this.menu.id = `bnd-simple-actions-${Math.random().toString(36).slice(2)}`;
			this.toolsTrigger.setAttribute("aria-controls", this.menu.id);
			this.toolsTrigger.setAttribute("aria-expanded", "false");
			this.tools.addEventListener("toggle", () => this.toolsTrigger.setAttribute("aria-expanded", String(this.tools.open)));
			this.tools.addEventListener("keydown", event => {
				if (event.key === "Escape" && this.tools.open) { event.preventDefault(); this.tools.open = false; this.toolsTrigger.focus(); }
			});
			this.tools.addEventListener("click", event => {
				if (event.target.closest("button")) this.tools.open = false;
			}, true);
			this.newButton = this.action(this.menu, __("New"), "", () => frappe.new_doc(this.frm.doctype));
			this.draftButton = this.action(this.menu, __("Save draft"), "", () => this.frm.save("Save"));
			// Print stays visible on every saved document. It still invokes the
			// native print engine and does not introduce a parallel rendering path.
			this.printButton = this.action(this.primaryActions, __("Print"), "", () => this.frm.print_doc());
			this.printButton.classList.add("bnd-simple-action-print");
			this.mobilePrintButton = this.action(this.menu, __("Print"), "", () => this.frm.print_doc());
			this.mobilePrintButton.classList.add("bnd-simple-action-mobile-print");
			this.duplicateButton = this.action(this.menu, __("Duplicate"), "", () => this.frm.copy_doc());
			this.deleteButton = this.action(this.menu, __("Delete draft"), "F4", () => this.frm.savetrash());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			this.cancelButton = this.action(this.menu, __("Cancel document"), "", () => this.frm.savecancel());
			this.cancelButton.classList.add("bnd-bill-action-danger");
			this.workbench = frm.doctype === "Stock Entry"
				? new StockEntryWorkbench(frm)
				: frm.doctype === "Delivery Note" ? new DeliveryNoteWorkbench(frm)
					: TASK_WORKBENCHES[frm.doctype] ? new TaskWorkbench(frm, TASK_WORKBENCHES[frm.doctype])
					: COMPOSITIONS[frm.doctype] ? new GroupedWorkbench(frm, COMPOSITIONS[frm.doctype]) : null;
			this.ensureMounted();
			this.keyHandler = event => {
				if (!this.simple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
				const actions = { F2: this.saveButton, F4: this.deleteButton, F8: this.saveButton };
				const target = actions[event.key]; if (!target || target.hidden || target.disabled) return;
				event.preventDefault(); event.stopPropagation(); target.click();
			};
			frm.$wrapper?.[0]?.addEventListener("keydown", this.keyHandler, true);
			this.setMode(true);
		}
		async commit() {
			if (this.saveButton.disabled) return;
			const actions = api.document_actions;
			if (!actions.canSaveAndSubmit(this.frm)) return this.frm.save("Save");
			this.saveButton.disabled = true;
			try { await actions.saveAndSubmit(this.frm); }
			finally { this.saveButton.disabled = false; this.refresh(); }
		}
		button(parent, label, action, primary = false) {
			const b = create("button", `bnd-bill-button${primary ? " bnd-bill-primary" : ""}`, label, parent); b.type = "button"; b.addEventListener("click", action); return b;
		}
		action(parent, label, key, handler, primary = false) {
			const button = this.button(parent, "", handler, primary); button.classList.add("bnd-bill-action");
			return api.document_actions.decorateAction(button, { label, key });
		}
		ensureMounted() {
			const layout = this.frm.$wrapper?.find(".form-layout").first()?.[0];
			const fallback = this.frm.$wrapper?.[0];
			if (layout) {
				const parent = layout.parentNode;
				const mounted = this.workbench
					? this.header.parentNode === parent && this.header.nextElementSibling === this.actions && this.actions.nextElementSibling === this.workbench.root && this.workbench.root.nextElementSibling === layout
					: this.header.parentNode === parent && this.header.nextElementSibling === this.actions && this.actions.nextElementSibling === layout;
				if (!mounted) layout.before(this.header, this.actions, ...(this.workbench ? [this.workbench.root] : []));
			} else if (fallback && !this.header.isConnected) {
				fallback.prepend(this.header, this.actions, ...(this.workbench ? [this.workbench.root] : []));
			}
		}
		refresh() {
			this.ensureMounted();
			this.selected = fallbackFields(this.frm);
			for (const [name, field] of Object.entries(this.frm.fields_dict || {})) {
				const wrapper = field?.$wrapper?.[0]; if (!wrapper) continue;
				if (field.df?.label) field.$input
					?.filter(":not([aria-label],[aria-labelledby])")
					.attr("aria-label", __(field.df.label));
				wrapper.classList.toggle("bnd-simple-visible", this.selected.has(name));
				wrapper.classList.toggle("bnd-simple-omitted", !this.selected.has(name));
			}
			for (const link of this.frm.$wrapper?.find(".form-tabs .nav-link[aria-controls]") || []) {
				const pane = document.getElementById(link.getAttribute("aria-controls"));
				link.parentElement?.classList.toggle("bnd-simple-tab-omitted", !pane?.querySelector(".bnd-simple-visible"));
			}
			this.header.hidden = false;
			this.actions.hidden = !this.simple;
			this.header.classList.toggle("bnd-simple-form-head-advanced", !this.simple);
			const setLayout = active => {
				this.frm.$wrapper?.toggleClass("bnd-generic-simple", active);
				window.bunood_theme?.[active ? "claim_native" : "release_native"]?.("simpleform");
				this.frm.$wrapper?.toggleClass("bnd-stock-simple-active", active && this.frm.doctype === "Stock Entry");
				this.frm.$wrapper?.toggleClass("bnd-delivery-simple-active", active && this.frm.doctype === "Delivery Note");
				this.frm.$wrapper?.toggleClass("bnd-composed-simple-active", active && !!this.workbench);
				this.frm.$wrapper?.toggleClass("bnd-task-simple-active", active && !!TASK_WORKBENCHES[this.frm.doctype]);
			};
			if (this.simple) { this.workbench?.refresh(true, this.selected); setLayout(true); }
			else { setLayout(false); this.workbench?.refresh(false, this.selected); }
			this.simpleButton.setAttribute("aria-pressed", String(this.simple));
			this.advancedButton.setAttribute("aria-pressed", String(!this.simple));
			this.simpleButton.classList.toggle("bnd-bill-primary", this.simple);
			this.advancedButton.classList.toggle("bnd-bill-primary", !this.simple);
			const contract = api.document_actions;
			const state = contract.actionState(this.frm, { canCreateInvoice: canCreateSalesInvoice(this.frm) });
			this.actions.dataset.primary = state.primary;
			const documentState = contract.documentState(this.frm);
			this.stateBadge.textContent = __(documentState.label);
			this.actionState.textContent = __(documentState.label);
			this.stateBadge.dataset.tone = documentState.tone;
			this.header.dataset.documentState = documentState.tone;
			const canCommit = contract.canSaveAndSubmit(this.frm);
			this.saveButton.hidden = !canCommit && !state.showSave;
			this.saveButton.querySelector(".bnd-bill-action-label").textContent = __(canCommit ? "Save and submit" : "Save");
			this.draftButton.hidden = !canCommit;
			this.invoiceButton.hidden = !state.showCreateInvoice;
			this.newButton.hidden = !state.showNew;
			this.printButton.hidden = !state.showPrint;
			this.mobilePrintButton.hidden = !state.showPrint || state.primary === "print";
			this.duplicateButton.hidden = !state.showDuplicate;
			this.deleteButton.hidden = !state.showDelete;
			this.cancelButton.hidden = !state.showCancel;
			if (this.printButton.parentNode !== this.primaryActions) this.primaryActions.append(this.printButton);
			this.printButton.classList.toggle("bnd-bill-primary", state.primary === "print");
			this.tools.hidden = ![this.draftButton, this.newButton, this.mobilePrintButton, this.duplicateButton, this.deleteButton, this.cancelButton]
				.some(button => !button.hidden && button.parentNode === this.menu);
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
	api.simple_forms = { mount,
		candidate, profiles: PROFILES, compositions: COMPOSITIONS, taskWorkbenches: TASK_WORKBENCHES,
		hasPurposeWorkbench, fallbackFields, canCreateSalesInvoice, createSalesInvoice, GroupedWorkbench, TaskWorkbench,
	};
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
