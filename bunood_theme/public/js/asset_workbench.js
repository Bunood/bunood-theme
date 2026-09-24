// Copyright (c) 2026, Bunood and contributors
// A bilingual work queue over ERPNext's native fixed-asset lifecycle.

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const METHOD = "bunood_theme.api.asset_workbench";

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = text;
		return node;
	}

	function actionButton(label, action, primary, enabled = true) {
		const node = el("button", `btn ${primary ? "btn-primary" : "btn-default"}`, label);
		node.type = "button";
		node.disabled = !enabled;
		if (enabled) node.addEventListener("click", action);
		return node;
	}

	function routeButton(label, route, primary, enabled = true) {
		return actionButton(label, () => frappe.set_route(...route), primary, enabled);
	}

	function newDocumentButton(label, doctype, data, enabled) {
		return actionButton(label, () => frappe.new_doc(doctype, data), false, enabled);
	}

	function control(host, options) {
		const field = frappe.ui.form.make_control({ parent: host, df: options, render_input: true });
		field.refresh();
		return field;
	}

	function formatAmount(value, currency) {
		try {
			return new Intl.NumberFormat(frappe.boot.lang || undefined, {
				style: "currency",
				currency: currency || "SAR",
				minimumFractionDigits: 2,
			}).format(Number(value || 0));
		} catch (_error) {
			return `${Number(value || 0).toFixed(2)} ${currency || ""}`.trim();
		}
	}

	function stateCopy(state) {
		return {
			"attention-needed": [__("Asset attention is required"), __("Review due or failed depreciation and open repairs in their native records before close.")],
			"review-required": [__("Asset review is required"), __("Draft asset lifecycle records still require authorised review and native submission.")],
			"incomplete-evidence": [__("Asset evidence is incomplete"), __("A permitted query failed or a bounded result was truncated. No clean-register conclusion was inferred.")],
			"no-exceptions-observed": [__("No exceptions observed in this bounded view"), __("This is not fixed-asset or General Ledger reconciliation. Complete the native reports and qualified review.")],
		}[state] || [__("Asset review is required"), __("Review the native asset records for this company and period.")];
	}

	function assetState(state) {
		return {
			"depreciation-failed": __("Depreciation posting failed"),
			"depreciation-due": __("Depreciation due by boundary"),
			"draft-review": __("Draft — review required"),
			"service-attention": __("Maintenance or repair attention"),
			"fully-depreciated": __("Fully depreciated"),
			"in-use": __("In use"),
			disposed: __("Disposed"),
			cancelled: __("Cancelled"),
		}[state] || __("Review required");
	}

	function documentState(docstatus, state) {
		if (Number(docstatus) === 2) return __("Cancelled");
		if (Number(docstatus) === 0) return __("Draft — review required");
		return state ? __(state) : __("Submitted");
	}

	function metric(label, value, detail, warning) {
		const card = el("article", `bnd-close__metric${warning ? " is-warning" : ""}`);
		card.append(el("span", "", label), el("strong", "", String(value)), el("small", "", detail));
		return card;
	}

	function renderLifecycle(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Fixed-asset lifecycle")),
			el("p", "bnd-close__note", __("Physical custody and accounting value are different controls. Use the native document that matches the event."))
		);
		const grid = el("div", "bnd-close__controls");
		const choices = [
			[__("Acquire and capitalize"), __("Create the asset from its fixed-asset Item or combine eligible costs through Asset Capitalization."), __("New capitalization"), "Asset Capitalization", data.capabilities.can_create_capitalization],
			[__("Put in use and depreciate"), __("Confirm available-for-use date, Finance Book, method, useful life, residual value and schedule before posting."), __("Depreciation schedules"), null, true, ["List", "Asset Depreciation Schedule"]],
			[__("Move and assign custody"), __("Use Asset Movement for location and custodian changes. Do not edit the visible location as an unaudited shortcut."), __("New movement"), "Asset Movement", data.capabilities.can_create_movement],
			[__("Maintain and repair"), __("Keep planned maintenance separate from failures, repair cost and any policy-approved capitalization."), __("New repair"), "Asset Repair", data.capabilities.can_create_repair],
			[__("Adjust or dispose"), __("Use a supported value adjustment, fixed-asset sale or scrap workflow so carrying value and gain or loss remain traceable."), __("Value adjustment"), "Asset Value Adjustment", data.capabilities.can_create_adjustment],
		];
		choices.forEach(([title, note, label, doctype, enabled, route]) => {
			const card = el("article", "bnd-close__control");
			const button = route ? routeButton(label, route, false) : newDocumentButton(label, doctype, { company: data.company }, enabled);
			card.append(el("h3", "", title), el("p", "", note), button);
			grid.append(card);
		});
		panel.append(grid);
		return panel;
	}

	function renderAssetQueue(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Current asset queue")),
			el("p", "bnd-close__note", __("The period filters lifecycle activity. This queue shows the current permitted Asset register state, prioritised by attention."))
		);
		if (!data.assets.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted Asset records were observed for this company.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Asset"), __("Category"), __("Lifecycle state"), __("Location or custodian"), __("Next depreciation"), __("Carrying value")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.assets.forEach((row) => {
			const tr = el("tr");
			const nameCell = el("td");
			const link = el("button", "bnd-close__link", row.asset_name || row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", "Asset", row.name));
			nameCell.append(link, el("small", "", row.item_code ? ` · ${row.item_code}` : ""));
			const custody = [row.location, row.custodian].filter(Boolean).join(" · ") || "—";
			tr.append(
				nameCell,
				el("td", "", row.asset_category || "—"),
				el("td", "", assetState(row.state)),
				el("td", "", custody),
				el("td", "", row.next_depreciation_date || "—"),
				el("td", "", formatAmount(row.carrying_value, data.currency))
			);
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		if (data.asset_display_truncated || data.evidence_truncated) {
			panel.append(el("p", "bnd-close__note", __("This is a bounded queue. Open the native Asset list and reports for the complete permitted result.")));
		}
		return panel;
	}

	function renderSchedules(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Depreciation schedules")),
			el("p", "bnd-close__note", __("A schedule is not a posted expense. Verify each Finance Book, future row and linked Journal Entry in the native schedule and ledger report."))
		);
		if (!data.schedules.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted Asset Depreciation Schedule was observed.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Schedule"), __("Asset"), __("Finance Book"), __("Method"), __("State"), __("Current scheduled value")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.schedules.forEach((row) => {
			const tr = el("tr");
			const nameCell = el("td");
			const link = el("button", "bnd-close__link", row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", "Asset Depreciation Schedule", row.name));
			nameCell.append(link);
			tr.append(nameCell, el("td", "", row.asset || "—"), el("td", "", row.finance_book || data.finance_book || "—"), el("td", "", __(row.depreciation_method || "—")), el("td", "", documentState(row.docstatus, row.status)), el("td", "", formatAmount(row.value_after_depreciation, data.currency)));
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		return panel;
	}

	function renderActivity(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Lifecycle activity and open repairs")),
			el("p", "bnd-close__note", __("Open the source document to verify affected assets, stock or service cost, accounting date, evidence and approval history."))
		);
		if (!data.activity.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted lifecycle activity or open repair was observed in this boundary.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Document"), __("Type"), __("Date"), __("Asset or purpose"), __("State"), __("Amount")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.activity.forEach((row) => {
			const tr = el("tr");
			const nameCell = el("td");
			const link = el("button", "bnd-close__link", row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", row.doctype, row.name));
			nameCell.append(link);
			tr.append(nameCell, el("td", "", __(row.doctype)), el("td", "", row.date || "—"), el("td", "", row.asset || row.title || "—"), el("td", "", documentState(row.docstatus, row.state)), el("td", "", formatAmount(row.amount, data.currency)));
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		return panel;
	}

	function renderReconciliation(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Register-to-ledger review")),
			el("p", "bnd-close__note", __("Use the same company, cutoff date, Finance Book, currency and dimensions. Reconcile asset cost, accumulated depreciation, depreciation expense, value adjustments and disposal gain or loss; investigate manual journals and timing differences."))
		);
		const actions = el("div", "bnd-close__report-grid");
		[
			[__("Fixed Asset Register"), ["query-report", "Fixed Asset Register"], data.capabilities.can_read_asset],
			[__("Depreciation and balances"), ["query-report", "Asset Depreciations and Balances"], data.capabilities.can_read_asset],
			[__("Asset Depreciation Ledger"), ["query-report", "Asset Depreciation Ledger"], data.capabilities.can_read_gl],
			[__("Asset Activity"), ["query-report", "Asset Activity"], data.capabilities.can_read_asset],
			[__("General Ledger"), ["query-report", "General Ledger"], data.capabilities.can_read_gl],
			[__("Finance and close"), ["bnd-finance-close"], true],
		].forEach(([label, route, enabled]) => actions.append(routeButton(label, route, false, enabled)));
		panel.append(actions, el("p", "bnd-close__note", __("Bunood has not declared this boundary reconciled. Qualified preparer and reviewer evidence remains required.")));
		return panel;
	}

	function renderResult(data, content) {
		content.replaceChildren();
		const state = el("section", `bnd-close__state is-${data.state}`);
		const copy = stateCopy(data.state);
		state.setAttribute("role", "status");
		state.setAttribute("aria-live", "polite");
		state.append(el("div", "", copy[0]), el("p", "", copy[1]), el("small", "", `${data.company} · ${data.from_date} — ${data.to_date} · ${__("Generated")} ${data.generated_at}`));

		const attention = data.summary.depreciation_due + data.summary.depreciation_failed + data.summary.pending_repairs;
		const metrics = el("section", "bnd-close__metrics");
		metrics.append(
			metric(__("Assets observed"), data.summary.observed_assets, __("Current permitted register rows"), data.evidence_truncated),
			metric(__("Attention queue"), attention, __("Due or failed depreciation and open repairs"), attention > 0),
			metric(__("Observed carrying value"), formatAmount(data.summary.observed_carrying_value, data.currency), __("Not a reconciled register total"), data.evidence_truncated),
			metric(__("Period activity"), data.summary.period_activity + data.summary.disposed_in_period, __("Movements, capitalization, adjustments and disposal"), false)
		);

		content.append(state, metrics, renderLifecycle(data), renderAssetQueue(data), renderSchedules(data), renderActivity(data), renderReconciliation(data));
	}

	function render(container) {
		container.replaceChildren();
		const root = el("main", "bnd-close bnd-assets");
		const intro = el("header", "bnd-close__intro");
		const introCopy = el("div", "bnd-close__intro-copy");
		introCopy.append(
			el("span", "bnd-close__eyebrow", __("Native ERPNext asset lifecycle")),
			el("h1", "", __("Fixed asset workbench")),
			el("p", "", __("Track acquisition, custody, depreciation, maintenance, value changes and disposal without hiding native accounting controls."))
		);
		const actions = el("div", "bnd-close__actions");
		const newAsset = actionButton(__("New Asset"), () => frappe.new_doc("Asset", { company: company.get_value() }), true);
		newAsset.disabled = true;
		actions.append(newAsset, routeButton(__("Assets"), ["List", "Asset"], false));
		intro.append(introCopy, actions);

		const filters = el("section", "bnd-close__filters");
		const companyHost = el("div", "bnd-close__field");
		const fromHost = el("div", "bnd-close__field");
		const toHost = el("div", "bnd-close__field");
		const applyHost = el("div", "bnd-close__apply");
		const apply = el("button", "btn btn-primary", __("Review assets"));
		apply.type = "button";
		applyHost.append(apply);
		filters.append(companyHost, fromHost, toHost, applyHost);
		const content = el("div", "bnd-close__content");
		root.append(intro, filters, content);
		container.append(root);

		const company = control(companyHost, { fieldtype: "Link", fieldname: "company", label: __("Company"), options: "Company", reqd: 1 });
		const from = control(fromHost, { fieldtype: "Date", fieldname: "from_date", label: __("From date"), reqd: 1 });
		const to = control(toHost, { fieldtype: "Date", fieldname: "to_date", label: __("To date"), reqd: 1 });
		company.set_value(frappe.defaults.get_user_default("Company") || "");
		to.set_value(frappe.datetime.get_today());
		from.set_value(`${frappe.datetime.get_today().slice(0, 4)}-01-01`);

		const load = () => {
			if (!company.get_value()) {
				frappe.msgprint(__("Company is required"));
				return;
			}
			root.classList.add("is-loading");
			apply.disabled = true;
			newAsset.disabled = true;
			frappe.call({
				method: METHOD,
				args: { company: company.get_value(), from_date: from.get_value(), to_date: to.get_value() },
			}).then((response) => {
				renderResult(response.message, content);
				newAsset.disabled = !response.message.capabilities.can_create_asset;
			}).catch(() => {
				const failure = el("section", "bnd-close__failure");
				failure.setAttribute("role", "alert");
				failure.append(el("h2", "", __("The fixed-asset workbench could not be loaded")), el("p", "", __("No asset or accounting record was changed. Review the error, then try again.")));
				content.replaceChildren(failure);
			}).finally(() => {
				root.classList.remove("is-loading");
				apply.disabled = false;
			});
		};
		apply.addEventListener("click", load);
		if (company.get_value()) load();
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.asset_workbench_render = render;
})();
