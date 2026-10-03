// Read-first ZATCA control desk. The maintained connector owns every regulated write.
/* eslint-env browser */
/* global frappe, __ */
(() => {
	"use strict";

	const METHOD = "bunood_theme.zatca.status.get_workspace";
	const LIST_METHOD = "bunood_theme.zatca.monitor.list_invoices";
	const DETAIL_METHOD = "bunood_theme.zatca.monitor.get_invoice_detail";
	const route = (...parts) => frappe.set_route(...parts);
	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const action = (label, parts, primary = false) => {
		const button = el("button", `btn ${primary ? "btn-primary" : "btn-default"}`, label);
		button.type = "button";
		button.addEventListener("click", () => route(...parts));
		return button;
	};
	const statusText = (value) => ({
		Accepted: __("Accepted"),
		"Accepted with warnings": __("Accepted with warnings"),
		Rejected: __("Rejected"),
		Duplicate: __("Duplicate response"),
		"Ready For Batch": __("Ready for batch"),
		Resend: __("Needs resend"),
		Corrected: __("Corrected; review before sending"),
		"Clearance switched off": __("Clearance switched off"),
	})[value] || __("Review native record");
	const environmentText = (value) => ({ Sandbox: __("Sandbox"), Production: __("Production"), Simulation: __("Simulation") })[value] || __("Not set");
	const syncText = (value) => ({ Live: __("Live"), Batches: __("Batches") })[value] || __("Not set");
	const stateText = (value) => ({
		accepted: __("Accepted"), warnings: __("Accepted with warnings"),
		rejected: __("Rejected"), duplicate: __("Duplicate response"),
		pending: __("Pending ZATCA result"), missing_record: __("No ZATCA record"),
	})[value] || __("Pending ZATCA result");
	const money = (amount, currency) => {
		if (amount === null || amount === undefined) return "—";
		const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
		if (currency !== "SAR") return `${number} ${currency || ""}`.trim();
		const wrap = el("span", "bnd-zatca__money", number);
		const sign = el("span", "bnd-zatca__riyal");
		sign.setAttribute("role", "img"); sign.setAttribute("aria-label", __("Saudi riyal"));
		wrap.prepend(sign);
		return wrap;
	};

	function steps(data) {
		const status = data.status || {}, settings = status.settings || {};
		return [
			{ label: __("Connector installed"), action: __("Install KSA Compliance"), done: !!status.installed,
				note: __("Install and migrate KSA Compliance on the site."), route: null },
			{ label: __("Sandbox selected"), action: __("Select Sandbox"), done: status.state !== "needs_settings" && settings.server === "Sandbox",
				note: __("Review the seller identity and select Sandbox in native settings."), route: settings.route },
			{ label: __("Device onboarded"), action: __("Onboard the device"), done: !!settings.compliance_ready,
				note: __("Complete the connector's OTP onboarding in native settings."), route: settings.route },
			{ label: __("Sandbox CSID present"), action: __("Obtain the Sandbox CSID"), done: !!settings.production_ready,
				note: __("Run the connector's checks and obtain its Sandbox-issued CSID."), route: settings.route },
			{ label: __("Integration enabled"), action: __("Enable Sandbox integration"), done: !!settings.enabled && settings.server === "Sandbox",
				note: __("Enable the integration for Sandbox only after reviewing setup."), route: settings.route },
		];
	}

	function headline(data) {
		const status = data.status || {}, settings = status.settings || {};
		if (!status.installed) return [__("Connector not installed"), __("Install KSA Compliance before starting Sandbox setup."), "blocked"];
		if (status.state === "needs_settings") return [__("Company setup needed"), __("Create the company's native ZATCA Business Settings."), "attention"];
		if (settings.server !== "Sandbox") return [__("Sandbox is not selected"), __("This page will not switch environments. Review the server in native settings."), "attention"];
		if (!settings.compliance_ready) return [__("Onboarding needed"), __("Onboard the device with the Sandbox OTP in native settings."), "attention"];
		if (!settings.production_ready) return [__("Sandbox CSID needed"), __("Complete Sandbox checks and obtain the Sandbox-issued CSID."), "attention"];
		if (!settings.enabled) return [__("Integration is disabled"), __("Review the configuration, then enable Sandbox integration in native settings."), "attention"];
		return [__("Sandbox connection configured"), __("Configuration is present. Test each invoice type and review its native ZATCA response."), "configured"];
	}

	function renderMonitor(data) {
		const panel = el("section", "bnd-zatca__evidence");
		const head = el("div", "bnd-zatca__section-head");
		head.append(el("h2", "", __("Invoice monitor")));
		if (data.can_read_records) head.append(action(__("Open native ZATCA records"), ["List", "Sales Invoice Additional Fields"]));
		panel.append(head);
		panel.append(el("p", "bnd-zatca__hint", __("Submitted Sales and POS invoices. ZATCA outcomes come from the native connector.")));
		if (!data.can_read_records) {
			panel.append(el("p", "bnd-zatca__empty", __("You do not have permission to view ZATCA validation records.")));
			return panel;
		}
		const filters = el("div", "bnd-zatca__filters");
		const field = (text, input) => { const label = el("label", "", text); label.append(input); return label; };
		const state = el("select", "form-control");
		[["all", __("All statuses")], ["attention", __("Needs attention")], ["rejected", __("Rejected")],
			["warnings", __("Accepted with warnings")], ["duplicate", __("Duplicate response")],
			["pending", __("Pending ZATCA result")], ["missing_record", __("No ZATCA record")],
			["accepted", __("Accepted")]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; state.append(option); });
		const type = el("select", "form-control");
		[["all", __("Sales and POS invoices")], ["Sales Invoice", __("Sales Invoice")],
			["POS Invoice", __("POS Invoice")]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; type.append(option); });
		const from = el("input", "form-control"); from.type = "date";
		const to = el("input", "form-control"); to.type = "date";
		const search = el("button", "btn btn-primary", __("Apply filters")); search.type = "button";
		filters.append(field(__("Status"), state), field(__("Document type"), type),
			field(__("From date"), from), field(__("To date"), to), search);
		panel.append(filters);
		const feedback = el("p", "bnd-zatca__feedback", ""); feedback.setAttribute("aria-live", "polite"); panel.append(feedback);
		const scroll = el("div", "bnd-zatca__table-scroll");
		scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", __("Invoice monitor")); scroll.tabIndex = 0;
		const table = el("table", "bnd-zatca__table");
		const titles = [__("Invoice"), __("Document type"), __("Issued"), __("Amount"), __("ZATCA status"), __("Last attempt"), __("Details")];
		const tr = el("tr"); titles.forEach((label) => tr.append(el("th", "", label)));
		const thead = el("thead"); thead.append(tr); table.append(thead);
		const tbody = el("tbody"); table.append(tbody); scroll.append(table); panel.append(scroll);
		const more = el("button", "btn btn-default bnd-zatca__more", __("Load more invoices")); more.type = "button"; more.hidden = true; panel.append(more);
		const dialog = el("dialog", "bnd-zatca__dialog");
		const dialogHead = el("div", "bnd-zatca__dialog-head");
		const dialogTitle = el("h2", "", __("Invoice ZATCA details"));
		const close = el("button", "btn btn-default", __("Close")); close.type = "button";
		close.addEventListener("click", () => dialog.close());
		dialogHead.append(dialogTitle, close);
		const dialogBody = el("div", "bnd-zatca__dialog-body"); dialog.append(dialogHead, dialogBody); panel.append(dialog);
		let cursor = null;
		let request = 0;
		async function openDetail(row) {
			dialogTitle.textContent = `${__("Invoice ZATCA details")} — ${row.name}`;
			dialogBody.replaceChildren(el("p", "", __("Loading invoice details…")));
			dialog.showModal();
			try {
				const response = await frappe.call({ method: DETAIL_METHOD, type: "GET", args: { invoice_doctype: row.doctype, invoice_name: row.name } });
				const detail = response.message || {};
				dialogBody.replaceChildren();
				const meta = el("dl", "bnd-zatca__detail-grid");
				const pair = (label, value) => { meta.append(el("dt", "", label), el("dd", "", String(value || "—"))); };
				pair(__("ZATCA status"), stateText(detail.state));
				pair(__("UUID"), detail.evidence?.uuid);
				pair(__("Last attempt"), detail.evidence?.last_attempt);
				dialogBody.append(meta);
				if (detail.evidence?.validation_errors) dialogBody.append(el("pre", "bnd-zatca__detail-error", detail.evidence.validation_errors));
				if (detail.evidence?.validation_messages) dialogBody.append(el("pre", "bnd-zatca__detail-note", detail.evidence.validation_messages));
				if (!detail.evidence) dialogBody.append(el("p", "", __("No ZATCA record exists yet for this submitted invoice.")));
				const links = el("div", "bnd-zatca__routes");
				links.append(action(__("Open invoice"), ["Form", row.doctype, row.name]));
				if (detail.can_open_evidence && detail.evidence?.name) links.append(action(__("Open native validation record"), ["Form", "Sales Invoice Additional Fields", detail.evidence.name]));
				if (detail.can_open_logs && detail.logs?.length) links.append(action(__("Open native integration logs"), ["List", "ZATCA Integration Log"]));
				dialogBody.append(links);
			} catch (error) {
				const failure = el("p", "bnd-zatca__error", error.message || __("Invoice details are temporarily unavailable."));
				failure.setAttribute("role", "alert"); dialogBody.replaceChildren(failure);
			}
		}
		function appendRows(rows) {
			rows.forEach((row) => {
				const line = el("tr");
				const invoice = el("td"); invoice.dataset.label = __("Invoice"); invoice.append(action(row.name, ["Form", row.doctype, row.name]));
				const docType = el("td", "", __(row.doctype)); docType.dataset.label = __("Document type");
				const date = el("td", "", row.posting_date || row.created.slice(0, 10)); date.dataset.label = __("Issued"); date.dir = "ltr";
				const amount = el("td"); amount.dataset.label = __("Amount"); const formatted = money(row.amount, row.currency); amount.append(formatted instanceof Node ? formatted : document.createTextNode(formatted));
				const result = el("td"); result.dataset.label = __("ZATCA status");
				const label = row.state === "pending" && row.native_status ? statusText(row.native_status) : stateText(row.state);
				result.append(el("span", `bnd-zatca__state is-${row.state}`, label));
				const attempted = el("td", "", row.last_attempt?.slice(0, 16) || "—"); attempted.dataset.label = __("Last attempt"); attempted.dir = "ltr";
				const details = el("td"); details.dataset.label = __("Details");
				const view = el("button", "btn btn-default", __("View details")); view.type = "button"; view.addEventListener("click", () => openDetail(row)); details.append(view);
				line.append(invoice, docType, date, amount, result, attempted, details); tbody.append(line);
			});
		}
		async function load(reset = false) {
			if (reset) { cursor = null; tbody.replaceChildren(); more.hidden = true; }
			const current = ++request;
			search.disabled = true; more.disabled = true; feedback.textContent = __("Checking invoices…");
			try {
				const args = { company: data.company, state: state.value, invoice_doctype: type.value,
					date_from: from.value, date_to: to.value, page_size: 25 };
				if (cursor) args.cursor = cursor;
				const response = await frappe.call({ method: LIST_METHOD, type: "GET", args });
				if (current !== request) return;
				const result = response.message || {};
				appendRows(result.rows || []);
				cursor = result.next_cursor || null;
				more.hidden = !cursor;
				feedback.textContent = tbody.children.length ?
					__("Invoices shown: {0}").replace("{0}", String(tbody.children.length)) :
					(cursor ? __("No matching invoices in this batch. Continue searching.") : __("No matching invoices for these filters."));
			} catch (error) {
				if (current === request) feedback.textContent = error.message || __("Invoice monitor is temporarily unavailable.");
			} finally { if (current === request) { search.disabled = false; more.disabled = false; } }
		}
		search.addEventListener("click", () => load(true));
		more.addEventListener("click", () => load(false));
		load(true);
		return panel;
	}

	function renderResult(data, host) {
		host.replaceChildren();
		if (!data.company) {
			host.append(el("p", "bnd-zatca__empty", __("No permitted company is available. Ask your administrator for company access.")));
			return;
		}
		const status = data.status || {}, settings = status.settings || {};
		const [title, description, tone] = headline(data);
		const summary = el("section", `bnd-zatca__summary is-${tone}`);
		const summaryCopy = el("div");
		summaryCopy.append(el("span", "bnd-zatca__eyebrow", __("Current state")), el("h2", "", title), el("p", "", description));
		const environment = el("div", "bnd-zatca__environment");
		environment.append(el("span", "", __("Environment")), el("strong", "", environmentText(settings.server)));
		environment.append(el("span", "", __("Sync mode")), el("strong", "", syncText(settings.sync)));
		summary.append(summaryCopy, environment); host.append(summary);

		const columns = el("div", "bnd-zatca__columns");
		const next = el("section", "bnd-zatca__next");
		const pending = steps(data).find((step) => !step.done);
		next.append(el("h2", "", __("Next action")));
		if (pending) {
			next.append(el("h3", "", pending.action), el("p", "", pending.note));
			if (data.can_open_settings && pending.route?.length) next.append(action(__("Open native ZATCA settings"), pending.route, true));
			else if (status.installed && !data.can_open_settings) next.append(el("p", "bnd-zatca__hint", __("Ask an Accounts Manager with ZATCA settings access to complete this step.")));
		} else {
			next.append(el("h3", "", __("Test a controlled invoice")), el("p", "", __("Check standard and simplified Sales and POS invoices, then review their native clearance or reporting records.")));
		}
		const routes = el("div", "bnd-zatca__routes");
		routes.append(action(__("Sales invoices"), ["List", "Sales Invoice"]));
		if (status.installed) routes.append(action(__("POS invoices"), ["List", "POS Invoice"]));
		next.append(routes);
		const path = el("section", "bnd-zatca__path");
		path.append(el("h2", "", __("Sandbox path")));
		const list = el("ol");
		steps(data).forEach((step) => {
			const item = el("li", step.done ? "is-done" : "is-pending");
			item.append(el("span", "bnd-zatca__step-mark", step.done ? "✓" : "○"), el("span", "", step.label));
			list.append(item);
		});
		path.append(list);
		columns.append(next, path); host.append(columns, renderMonitor(data));
		host.append(el("p", "bnd-zatca__boundary", __("Sandbox evidence is not Production approval. A qualified Saudi reviewer must approve legal identity, tax, prints and operational controls before Production activation.")));
	}

	function render(container) {
		const root = el("main", "bnd-zatca-workspace");
		root.dir = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
		const toolbar = el("div", "bnd-zatca__toolbar");
		const heading = el("div");
		heading.append(el("h1", "", __("ZATCA workspace")), el("p", "", __("Set up Sandbox, inspect evidence and continue in the native connector.")));
		const controls = el("div", "bnd-zatca__controls");
		const label = el("label", "", __("Company"));
		const select = el("select", "form-control");
		select.setAttribute("aria-label", __("Company"));
		label.append(select);
		const refresh = el("button", "btn btn-default", __("Refresh status")); refresh.type = "button";
		controls.append(label, refresh); toolbar.append(heading, controls);
		const content = el("div", "bnd-zatca__content");
		root.append(toolbar, content); container.replaceChildren(root);
		let request = 0;
		async function load(company = "") {
			const current = ++request;
			refresh.disabled = true;
			content.replaceChildren(el("p", "bnd-zatca__loading", __("Checking ZATCA setup…")));
			try {
				const response = await frappe.call({ method: METHOD, type: "GET", args: company ? { company } : {} });
				if (current !== request) return;
				const data = response.message || {};
				select.replaceChildren();
				(data.companies || []).forEach((name) => {
					const option = el("option", "", name); option.value = name; select.append(option);
				});
				select.value = data.company || "";
				renderResult(data, content);
			} catch (error) {
				if (current !== request) return;
				const failure = el("p", "bnd-zatca__error", error.message || __("ZATCA status is temporarily unavailable."));
				failure.setAttribute("role", "alert"); content.replaceChildren(failure);
			} finally { if (current === request) refresh.disabled = false; }
		}
		select.addEventListener("change", () => load(select.value));
		refresh.addEventListener("click", () => load(select.value));
		load();
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.zatca_render = render;
})();
