// Copyright (c) 2026, Bunood and contributors
// A bilingual work queue over ERPNext's native Journal Entry records.

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const METHOD = "bunood_theme.api.journal_workbench";

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

	function control(host, options) {
		const field = frappe.ui.form.make_control({ parent: host, df: options, render_input: true });
		field.refresh();
		return field;
	}

	function stateCopy(state) {
		return {
			"attention-needed": [__("Unbalanced drafts need attention"), __("Correct the difference and review supporting evidence before any native submission.")],
			"incomplete-evidence": [__("Journal evidence is incomplete"), __("The queue was limited or a permitted query failed. No clean-period conclusion was inferred.")],
			"review-required": [__("Draft review required"), __("Balanced drafts still require an authorised review and native submission before they affect the ledger.")],
			"no-open-drafts-observed": [__("No open drafts observed"), __("No draft Journal Entry was observed in this boundary. This is not accounting or close approval.")],
		}[state] || [__("Review required"), __("Review the native Journal Entry records for this boundary.")];
	}

	function metric(label, value, detail, warning) {
		const card = el("article", `bnd-close__metric${warning ? " is-warning" : ""}`);
		card.append(el("span", "", label), el("strong", "", String(value)), el("small", "", detail));
		return card;
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

	function journalState(state) {
		return {
			"unbalanced-draft": __("Unbalanced draft"),
			"draft-review": __("Draft — review required"),
			"submitted-reversal": __("Submitted reversal"),
			"system-generated": __("Submitted system entry"),
			submitted: __("Submitted"),
			cancelled: __("Cancelled"),
		}[state] || __("Review required");
	}

	function journalSource(source) {
		return {
			"deferred-accounting": __("Deferred accounting"),
			"auto-repeat": __("Auto Repeat"),
			template: __("Template"),
			reversal: __("Reversal"),
			"manual-or-native": __("Manual or native process"),
		}[source] || __("Native Journal Entry");
	}

	function renderGuidance(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Choose the correct document first")),
			el("p", "bnd-close__note", __("A Journal Entry is for deliberate accounting adjustments. Routine invoices and money movements belong in their purpose-built native documents."))
		);
		const grid = el("div", "bnd-close__controls");
		const choices = [
			[__("Customer or supplier payment"), __("Use Payment Entry for bank or cash, party allocation and invoice settlement."), ["List", "Payment Entry"]],
			[__("Customer sale"), __("Use Sales Invoice so tax, customer, stock and receivable balances remain connected."), ["List", "Sales Invoice"]],
			[__("Supplier purchase"), __("Use Purchase Invoice so tax, supplier, stock and payable balances remain connected."), ["List", "Purchase Invoice"]],
			[__("Accrual or adjustment"), __("Use Journal Entry when the accounting treatment requires deliberate debit and credit control."), ["List", "Journal Entry"]],
		];
		choices.forEach(([title, note, route]) => {
			const card = el("article", "bnd-close__control");
			card.append(el("h3", "", title), el("p", "", note), routeButton(__("Open native records"), route, false));
			grid.append(card);
		});
		panel.append(grid);
		return panel;
	}

	function renderJournalQueue(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(
			el("h2", "", __("Journal work queue")),
			el("p", "bnd-close__note", __("Open the native document to review account rows, parties, references, currencies, dimensions, attachments and approval history."))
		);
		if (!data.journals.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted Journal Entry records were observed in the selected period.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Journal"), __("Posting date"), __("Entry type"), __("State"), __("Source"), __("Debit"), __("Credit"), __("Difference")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.journals.forEach((row) => {
			const tr = el("tr");
			const documentCell = el("td");
			const link = el("button", "bnd-close__link", row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", "Journal Entry", row.name));
			documentCell.append(link);
			tr.append(
				documentCell,
				el("td", "", row.posting_date || "—"),
				el("td", "", __(row.voucher_type)),
				el("td", "", journalState(row.state)),
				el("td", "", journalSource(row.source)),
				el("td", "", formatAmount(row.total_debit, data.currency)),
				el("td", "", formatAmount(row.total_credit, data.currency)),
				el("td", "", formatAmount(row.difference, data.currency))
			);
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		if (data.journal_display_truncated || data.evidence_truncated) {
			panel.append(el("p", "bnd-close__note", __("This is a bounded work queue. Open the native Journal Entry list for the complete permitted result.")));
		}
		return panel;
	}

	function renderTemplates(data) {
		const panel = el("section", "bnd-close__panel");
		const heading = el("div", "bnd-close__panel-heading");
		heading.append(el("h2", "", __("Reusable templates")), routeButton(__("All templates"), ["List", "Journal Entry Template"], false));
		panel.append(heading, el("p", "bnd-close__note", __("Templates prefill structure only. The resulting Journal Entry still needs amounts, evidence, balance review and native submission.")));
		if (!data.templates.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted template was observed for this company.")));
			return panel;
		}
		const grid = el("div", "bnd-close__controls");
		data.templates.slice(0, 6).forEach((row) => {
			const card = el("article", "bnd-close__control");
			const title = row.template_title || row.name;
			card.append(
				el("h3", "", title),
				el("p", "", `${__(row.voucher_type || "Journal Entry")} · ${row.multi_currency ? __("Multi-currency") : __("Company currency")}`),
				routeButton(__("Open template"), ["Form", "Journal Entry Template", row.name], false)
			);
			grid.append(card);
		});
		panel.append(grid);
		return panel;
	}

	function renderSchedules(data) {
		const panel = el("section", "bnd-close__panel");
		const heading = el("div", "bnd-close__panel-heading");
		heading.append(el("h2", "", __("Recurring journal schedules")), routeButton(__("All schedules"), ["List", "Auto Repeat"], false));
		panel.append(heading, el("p", "bnd-close__note", __("Auto Repeat creates native documents on a schedule. Review whether generated entries remain drafts or submit automatically.")));
		if (!data.schedules.length) {
			panel.append(el("p", "bnd-close__empty", __("No permitted active Journal Entry schedule was observed for this company.")));
			return panel;
		}
		const wrap = el("div", "bnd-close__table-wrap");
		const table = el("table", "bnd-close__table");
		const head = el("tr");
		[__("Schedule"), __("Source journal"), __("Frequency"), __("Next schedule date"), __("Generated document")].forEach((label) => head.append(el("th", "", label)));
		const thead = el("thead");
		thead.append(head);
		const body = el("tbody");
		data.schedules.forEach((row) => {
			const tr = el("tr");
			const nameCell = el("td");
			const link = el("button", "bnd-close__link", row.name);
			link.type = "button";
			link.addEventListener("click", () => frappe.set_route("Form", "Auto Repeat", row.name));
			nameCell.append(link);
			tr.append(nameCell, el("td", "", row.reference_document || "—"), el("td", "", __(row.frequency || "")), el("td", "", row.next_schedule_date || "—"), el("td", "", row.submit_on_creation ? __("Submitted automatically") : __("Draft for review")));
			body.append(tr);
		});
		table.append(thead, body);
		wrap.append(table);
		panel.append(wrap);
		return panel;
	}

	function renderHandoffs(data) {
		const panel = el("section", "bnd-close__panel");
		panel.append(el("h2", "", __("Accounting handoffs")), el("p", "bnd-close__note", __("These routes retain native permissions, validation, posting and audit history.")));
		const actions = el("div", "bnd-close__report-grid");
		[
			[__("General Ledger"), ["query-report", "General Ledger"], data.capabilities.can_read_gl],
			[__("Accounting dimensions"), ["List", "Accounting Dimension"], true],
			[__("Deferred accounting"), ["List", "Process Deferred Accounting"], data.capabilities.can_run_deferred],
			[__("Deferred revenue and expense"), ["query-report", "Deferred Revenue and Expense"], true],
			[__("Payment Entries"), ["List", "Payment Entry"], true],
			[__("Finance and close"), ["bnd-finance-close"], true],
		].forEach(([label, route, enabled]) => actions.append(routeButton(label, route, false, enabled)));
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
			metric(__("Drafts observed"), data.summary.draft, __("Do not affect the ledger"), data.summary.draft > 0),
			metric(__("Unbalanced drafts"), data.summary.unbalanced_draft, __("Difference needs correction"), data.summary.unbalanced_draft > 0),
			metric(__("Submitted entries"), data.summary.submitted, __("Ledger-impacting native documents"), false),
			metric(__("Templates and schedules"), data.summary.template_count + data.summary.schedule_count, __("Reusable native controls"), false)
		);

		content.append(state, metrics, renderGuidance(data), renderJournalQueue(data), renderTemplates(data), renderSchedules(data), renderHandoffs(data));
	}

	function render(container) {
		container.replaceChildren();
		const root = el("main", "bnd-close bnd-journal");
		const intro = el("header", "bnd-close__intro");
		const introCopy = el("div", "bnd-close__intro-copy");
		introCopy.append(
			el("span", "bnd-close__eyebrow", __("Native ERPNext journals")),
			el("h1", "", __("Journal workbench")),
			el("p", "", __("Prepare, review and trace accounting adjustments without hiding native controls or creating a second ledger."))
		);
		const actions = el("div", "bnd-close__actions");
		const newJournal = actionButton(__("New Journal Entry"), () => {
			frappe.new_doc("Journal Entry", { company: company.get_value() });
		}, true);
		newJournal.disabled = true;
		actions.append(newJournal, routeButton(__("Journal Entries"), ["List", "Journal Entry"], false));
		intro.append(introCopy, actions);

		const filters = el("section", "bnd-close__filters");
		const companyHost = el("div", "bnd-close__field");
		const fromHost = el("div", "bnd-close__field");
		const toHost = el("div", "bnd-close__field");
		const applyHost = el("div", "bnd-close__apply");
		const apply = el("button", "btn btn-primary", __("Review journals"));
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
			newJournal.disabled = true;
			frappe.call({
				method: METHOD,
				args: { company: company.get_value(), from_date: from.get_value(), to_date: to.get_value() },
			}).then((response) => {
				renderResult(response.message, content);
				newJournal.disabled = !response.message.capabilities.can_create_journal;
			}).catch(() => {
				const failure = el("section", "bnd-close__failure");
				failure.setAttribute("role", "alert");
				failure.append(el("h2", "", __("The journal work queue could not be loaded")), el("p", "", __("No accounting record was changed. Review the error, then try again.")));
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
	window.bunood_theme.journal_workbench_render = render;
})();
