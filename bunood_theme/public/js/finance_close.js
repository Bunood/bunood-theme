// Copyright (c) 2026, Bunood and contributors
// A read-first comprehension layer over ERPNext's native close controls.

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const METHOD = "bunood_theme.api.finance_close_cockpit";

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = text;
		return node;
	}

	function button(label, route, primary) {
		const node = el("button", `btn ${primary ? "btn-primary" : "btn-default"}`, label);
		node.type = "button";
		node.addEventListener("click", () => frappe.set_route(...route));
		return node;
	}

	function control(host, options) {
		const field = frappe.ui.form.make_control({ parent: host, df: options, render_input: true });
		field.refresh();
		return field;
	}

	function stateCopy(state) {
		return {
			"attention-needed": [__("Attention needed"), __("Draft or failed native records need review before this period can move forward.")],
			"incomplete-evidence": [__("Evidence incomplete"), __("One or more permitted queries could not be completed. No close conclusion was inferred.")],
			"protection-present": [__("Protection is present"), __("A native posting restriction covers this period. Reconciliations and approval still require review.")],
			"review-required": [__("Review required"), __("No period protection was observed for this boundary. Complete review before applying a lock.")],
		}[state] || [__("Review required"), __("Review the native records for this period.")];
	}

	function metric(label, value, detail, warning) {
		const card = el("div", `bnd-close__metric${warning ? " is-warning" : ""}`);
		card.append(el("span", "", label), el("strong", "", String(value)), el("small", "", detail));
		return card;
	}

	function controlCard(title, value, note, active) {
		const card = el("article", `bnd-close__control${active ? " is-present" : ""}`);
		const head = el("div", "bnd-close__control-head");
		head.append(el("h3", "", title), el("span", "bnd-close__status", active ? __("Observed") : __("Not observed")));
		card.append(head, el("strong", "", value || __("None for this period")), el("p", "", note));
		return card;
	}

	function renderAttention(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(el("h2", "", __("Attention now")));
		if (!data.attention.length) {
			panel.append(el("p", "bnd-close__empty", __("No draft or failed native records were observed in the selected boundary. This is not close approval.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Document"), __("Type"), __("Date"), __("Reason")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.attention.forEach((row) => {
			const tr = el("tr");
			const linkCell = el("td");
			const link = el("button", "bnd-close__link", row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", row.doctype, row.name));
			linkCell.append(link);
			tr.append(linkCell, el("td", "", __(row.doctype)), el("td", "", row.date || "—"), el("td", "", row.reason === "failed-closing-processing" ? __("Closing processing failed") : __("Draft source document")));
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		if (data.attention_truncated) panel.append(el("p", "bnd-close__note", __("The queue is limited. Open the native lists to review all records.")));
		return panel;
	}

	function renderPhases(data) {
		const names = {
			"source-capture": [__("1. Source capture"), __("Draft transactions and cutoff")],
			reconciliation: [__("2. Reconciliations"), __("Bank, AR/AP, stock, assets and tax")],
			adjustments: [__("3. Adjustments"), __("Journals, schedules and review")],
			statements: [__("4. Statements"), __("Trial Balance and financial statements")],
			protection: [__("5. Period protection"), __("Native restriction after approval")],
		};
		const panel = el("section", "bnd-close__panel");
		panel.append(el("h2", "", __("Close path")), el("p", "bnd-close__note", __("These are evidence stages, not completion badges. Not evaluated remains different from complete.")));
		const grid = el("div", "bnd-close__phases");
		data.phases.forEach((phase) => {
			const card = el("article", `bnd-close__phase is-${phase.state}`);
			card.append(el("h3", "", names[phase.id][0]), el("p", "", names[phase.id][1]), el("span", "", phase.state === "attention-needed" ? __("Attention needed") : phase.state === "protection-present" ? __("Protection observed") : phase.state === "not-protected" ? __("Not protected") : __("Not evaluated")));
			grid.append(card);
		});
		panel.append(grid);
		return panel;
	}

	function renderReports(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(el("h2", "", __("Review reports")), el("p", "bnd-close__note", __("Each report opens with native permissions. Apply the same company, dates, currency, Finance Book and dimensions before comparing figures.")));
		const actions = el("div", "bnd-close__report-grid");
		[
			[__("Trial Balance"), ["query-report", "Trial Balance"]],
			[__("General Ledger"), ["query-report", "General Ledger"]],
			[__("Profit and Loss Statement"), ["query-report", "Profit and Loss Statement"]],
			[__("Balance Sheet"), ["query-report", "Balance Sheet"]],
			[__("Cash Flow"), ["query-report", "Cash Flow"]],
			[__("Accounts Receivable"), ["query-report", "Accounts Receivable"]],
			[__("Accounts Payable"), ["query-report", "Accounts Payable"]],
		].forEach(([label, route]) => actions.append(button(label, route, false)));
		if (!data.capabilities.can_read_gl) actions.setAttribute("aria-disabled", "true");
		panel.append(actions);
		return panel;
	}

	function renderResult(data, content) {
		content.replaceChildren();
		const state = el("section", `bnd-close__state is-${data.state}`);
		const copy = stateCopy(data.state);
		state.setAttribute("role", "status");
		state.setAttribute("aria-live", "polite");
		state.append(el("div", "", copy[0]), el("p", "", copy[1]), el("small", "", `${data.company} · ${data.from_date} — ${data.to_date} · ${__("Generated")} ${data.generated_at}`));

		const metrics = el("section", "bnd-close__metrics");
		metrics.append(
			metric(__("Items requiring attention"), data.summary.attention_count, __("Drafts and failed native records"), data.summary.attention_count > 0),
			metric(__("Draft source documents"), data.summary.draft_source_count, __("Inside the selected period"), data.summary.draft_source_count > 0),
			metric(__("Covering accounting periods"), data.summary.accounting_period_count, __("Native selective restrictions"), false),
			metric(__("Submitted closing vouchers"), data.summary.submitted_closing_voucher_count, __("P&L transfer; not a lock"), false)
		);

		const controls = el("section", "bnd-close__controls");
		controls.append(
			controlCard(__("Accounts frozen through"), data.controls.accounts_frozen_till_date || "—", __("Broad Company posting cut-off; authorised roles may bypass it."), data.controls.frozen_through_period),
			controlCard(__("Accounting Period"), data.controls.accounting_period_covers_period ? __("Covers selected boundary") : "—", __("Restricts configured document types; it does not transfer profit or loss."), data.controls.accounting_period_covers_period),
			controlCard(__("Period Closing Voucher"), data.controls.closing_voucher_covers_period ? __("Submitted voucher observed") : "—", __("Transfers Profit and Loss to the selected closing account; it does not lock posting."), data.controls.closing_voucher_covers_period)
		);

		content.append(state, metrics, controls, renderAttention(data), renderPhases(data), renderReports(data));
	}

	function render(container) {
		container.replaceChildren();
		const root = el("main", "bnd-close");
		const intro = el("header", "bnd-close__intro");
		const introCopy = el("div", "bnd-close__intro-copy");
		introCopy.append(el("span", "bnd-close__eyebrow", __("Native ERPNext controls")), el("h1", "", __("Finance and close")), el("p", "", __("See what needs attention, review the same reporting boundary, then use ERPNext's native controls. Bunood does not certify the books.")));
		const actions = el("div", "bnd-close__actions");
		actions.append(button(__("Journal workbench"), ["bnd-journal-workbench"], false), button(__("Accounting Periods"), ["List", "Accounting Period"], false), button(__("Closing Vouchers"), ["List", "Period Closing Voucher"], false));
		intro.append(introCopy, actions);

		const filters = el("section", "bnd-close__filters");
		const companyHost = el("div", "bnd-close__field");
		const fromHost = el("div", "bnd-close__field");
		const toHost = el("div", "bnd-close__field");
		const applyHost = el("div", "bnd-close__apply");
		const apply = el("button", "btn btn-primary", __("Review period"));
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
		from.set_value(frappe.datetime.month_start());

		const load = () => {
			if (!company.get_value()) {
				frappe.msgprint(__("Company is required"));
				return;
			}
			root.classList.add("is-loading");
			apply.disabled = true;
			frappe.call({
				method: METHOD,
				args: { company: company.get_value(), from_date: from.get_value(), to_date: to.get_value() },
			}).then((response) => renderResult(response.message, content)).catch(() => {
				const failure = el("section", "bnd-close__failure");
				failure.setAttribute("role", "alert");
				failure.append(el("h2", "", __("The close evidence could not be loaded")), el("p", "", __("Your controls are unchanged. Review the error, then try again.")));
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
	window.bunood_theme.finance_close_render = render;
})();
