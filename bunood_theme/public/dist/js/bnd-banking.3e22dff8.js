// Copyright (c) 2026, Bunood and contributors
// A comprehension layer over ERPNext's native Bank Statement Import and
// /banking application. This surface never writes ledgers or matches vouchers.

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const METHOD = "bunood_theme.api.bank_reconciliation_workbench";
	const IMPORT_METHOD = "bunood_theme.api.create_bank_statement_import";

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = text;
		return node;
	}

	function icon(name) {
		const holder = el("span", "bnd-banking-icon");
		if (frappe.utils && frappe.utils.icon) {
			const parsed = new DOMParser().parseFromString(frappe.utils.icon(name, "sm"), "image/svg+xml");
			if (parsed.documentElement && parsed.documentElement.nodeName === "svg") {
				holder.append(document.importNode(parsed.documentElement, true));
			}
		}
		holder.setAttribute("aria-hidden", "true");
		return holder;
	}

	function action(label, iconName, primary, handler) {
		const button = el("button", primary ? "btn btn-primary" : "btn btn-default");
		button.type = "button";
		button.append(icon(iconName), el("span", null, label));
		button.addEventListener("click", handler);
		return button;
	}

	function locale() {
		return (frappe.boot && frappe.boot.lang) || document.documentElement.lang || "en";
	}

	function number(value) {
		return new Intl.NumberFormat(locale()).format(Number(value || 0));
	}

	function money(value, currency) {
		try {
			return new Intl.NumberFormat(locale(), {
				style: "currency",
				currency: currency || (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "SAR",
				minimumFractionDigits: 2,
			}).format(Number(value || 0));
		} catch (_error) {
			return number(Number(value || 0).toFixed(2));
		}
	}

	function userDate(value) {
		return value && frappe.datetime && frappe.datetime.str_to_user
			? frappe.datetime.str_to_user(value)
			: value || "—";
	}

	function route(parts) {
		frappe.set_route.apply(frappe, parts);
	}

	function render(container) {
		container.replaceChildren();
		const root = el("section", "bnd-banking");
		container.append(root);

		const intro = el("header", "bnd-banking__intro");
		const introCopy = el("div", "bnd-banking__intro-copy");
		introCopy.append(
			el("p", "bnd-banking__eyebrow", __("Cash and bank control")),
			el("h2", null, __("Bank reconciliation")),
			el("p", null, __("Import the statement, review unmatched transactions, then finish the accounting in ERPNext's native reconciliation workspace."))
		);
		const assurance = el("div", "bnd-banking__assurance");
		assurance.append(
			icon("shield"),
			el("span", null, __("Bunood summarizes evidence. ERPNext remains the accounting system of record."))
		);
		intro.append(introCopy, assurance);
		root.append(intro);

		const filters = el("section", "bnd-banking__filters");
		filters.setAttribute("aria-label", __("Reconciliation filters"));
		const companyWrap = el("div", "bnd-banking__field");
		const accountWrap = el("div", "bnd-banking__field");
		const accountLabel = el("label", null, __("Company bank account"));
		accountLabel.htmlFor = "bnd-banking-account";
		const accountSelect = el("select", "form-control");
		accountSelect.id = "bnd-banking-account";
		accountWrap.append(accountLabel, accountSelect);
		const fromWrap = el("div", "bnd-banking__field");
		const toWrap = el("div", "bnd-banking__field");
		const apply = action(__("Review period"), "refresh-cw", true, () => load(true));
		const applyWrap = el("div", "bnd-banking__apply");
		applyWrap.append(apply);
		filters.append(companyWrap, accountWrap, fromWrap, toWrap, applyWrap);
		root.append(filters);

		const companyControl = frappe.ui.form.make_control({
			parent: companyWrap,
			df: {
				fieldname: "company",
				fieldtype: "Link",
				options: "Company",
				label: __("Company"),
				reqd: 1,
			},
			render_input: true,
		});
		const fromControl = frappe.ui.form.make_control({
			parent: fromWrap,
			df: { fieldname: "from_date", fieldtype: "Date", label: __("From date"), reqd: 1 },
			render_input: true,
		});
		const toControl = frappe.ui.form.make_control({
			parent: toWrap,
			df: { fieldname: "to_date", fieldtype: "Date", label: __("To date"), reqd: 1 },
			render_input: true,
		});

		const actions = el("nav", "bnd-banking__actions");
		actions.setAttribute("aria-label", __("Banking actions"));
		const importButton = action(__("Import bank statement"), "file-plus", true, createImport);
		const reconcileButton = action(__("Open reconciliation workspace"), "workflow", false, () => {
			window.location.assign("/banking");
		});
		const transactionButton = action(__("View bank transactions"), "list", false, () => {
			const filters = {};
			if (accountSelect.value) filters.bank_account = accountSelect.value;
			route(["List", "Bank Transaction", filters]);
		});
		const ledgerButton = action(__("Open general ledger"), "book-open", false, () => {
			if (!state.data || !state.data.bank_account || !state.data.bank_account.ledger_account) return;
			route([
				"query-report",
				"General Ledger",
				{
					company: companyControl.get_value(),
					account: state.data.bank_account.ledger_account,
					from_date: fromControl.get_value(),
					to_date: toControl.get_value(),
				},
			]);
		});
		actions.append(importButton, reconcileButton, transactionButton, ledgerButton);
		root.append(actions);

		const live = el("div", "bnd-banking__live");
		live.setAttribute("role", "status");
		live.setAttribute("aria-live", "polite");
		root.append(live);
		const content = el("div", "bnd-banking__content");
		root.append(content);

		const state = { serial: 0, data: null };
		const today = frappe.datetime.get_today();
		const monthStart = frappe.datetime.month_start
			? frappe.datetime.month_start()
			: `${today.slice(0, 8)}01`;
		companyControl.set_value(
			frappe.defaults.get_user_default("Company") ||
			(frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) ||
			""
		);
		fromControl.set_value(monthStart);
		toControl.set_value(today);

		accountSelect.addEventListener("change", () => {
			if (accountSelect.value) load(true);
			else updateActions();
		});

		function values() {
			return {
				company: companyControl.get_value(),
				bank_account: accountSelect.value || "",
				from_date: fromControl.get_value(),
				to_date: toControl.get_value(),
			};
		}

		function setBusy(busy) {
			apply.disabled = busy;
			root.classList.toggle("is-loading", busy);
			live.textContent = busy ? __("Loading bank reconciliation evidence…") : "";
		}

		function replaceAccountOptions(accounts, selected) {
			const current = selected || accountSelect.value;
			accountSelect.replaceChildren();
			const placeholder = el("option", null, __("Select a bank account"));
			placeholder.value = "";
			accountSelect.append(placeholder);
			for (const account of accounts || []) {
				const option = el("option", null, account.label || account.name);
				option.value = account.name;
				accountSelect.append(option);
			}
			if ((accounts || []).some((account) => account.name === current)) {
				accountSelect.value = current;
			} else if ((accounts || []).length === 1) {
				accountSelect.value = accounts[0].name;
			}
		}

		function updateActions() {
			const caps = (state.data && state.data.capabilities) || {};
			const selected = Boolean(accountSelect.value);
			importButton.disabled = !selected || !caps.can_import;
			reconcileButton.disabled = !selected || !caps.can_reconcile;
			transactionButton.disabled = !caps.can_read_transactions;
			ledgerButton.disabled = !selected || !caps.can_read_gl ||
				!state.data || !state.data.bank_account || !state.data.bank_account.ledger_account;
		}

		async function load(keepSelection) {
			const input = values();
			if (!input.company || !input.from_date || !input.to_date) {
				frappe.show_alert({ message: __("Choose a company and period first"), indicator: "orange" });
				return;
			}
			const serial = ++state.serial;
			setBusy(true);
			try {
				const response = await frappe.call({ method: METHOD, args: input, freeze: false });
				if (serial !== state.serial) return;
				state.data = response.message || {};
				replaceAccountOptions(state.data.bank_accounts, keepSelection ? input.bank_account : "");
				if (!input.bank_account && accountSelect.value) {
					setBusy(false);
					await load(true);
					return;
				}
				draw(state.data);
			} catch (error) {
				if (serial !== state.serial) return;
				content.replaceChildren();
				const failure = el("div", "bnd-banking__failure");
				failure.setAttribute("role", "alert");
				failure.append(
					el("strong", null, __("Banking evidence could not be loaded")),
					el("span", null, error && error.message ? error.message : __("Try again, or use the native banking workspace."))
				);
				content.append(failure);
			} finally {
				if (serial === state.serial) setBusy(false);
				updateActions();
			}
		}

		async function createImport() {
			const input = values();
			if (!input.company || !input.bank_account) return;
			importButton.disabled = true;
			try {
				const response = await frappe.call({
					method: IMPORT_METHOD,
					args: { company: input.company, bank_account: input.bank_account },
					freeze: true,
					freeze_message: __("Preparing the native statement import…"),
				});
				const result = response.message || {};
				if (Array.isArray(result.route)) route(result.route);
			} finally {
				updateActions();
			}
		}

		function stateCopy(id) {
			return {
				"select-bank-account": [__("Choose a bank account"), __("Select the company account whose statement you want to review.")],
				"no-bank-account": [__("No company bank account is available"), __("Create or enable a company bank account before importing a statement.")],
				"no-source": [__("No statement transactions in this period"), __("Import the bank statement, then return here to review the unmatched queue.")],
				"action-needed": [__("Reconciliation work is waiting"), __("Review the open statement transactions and finish their matches in the native workspace.")],
				"no-open-statement-items": [__("No open imported transactions"), __("This is not a close approval. Review book-only entries and complete the native reconciliation before signing off.")],
			}[id] || [__("Bank reconciliation"), __("Review the period and continue in the native workspace.")];
		}

		function metric(label, value, note, tone) {
			const card = el("article", `bnd-banking__metric${tone ? ` is-${tone}` : ""}`);
			card.append(el("span", null, label), el("strong", null, value));
			if (note) card.append(el("small", null, note));
			return card;
		}

		function draw(data) {
			content.replaceChildren();
			const copy = stateCopy(data.state);
			const banner = el("section", `bnd-banking__state is-${data.state}`);
			const stateIcon = data.state === "action-needed" ? "triangle-alert" :
				data.state === "no-open-statement-items" ? "check-circle" : "file-text";
			banner.append(icon(stateIcon));
			const stateText = el("div");
			stateText.append(el("h3", null, copy[0]), el("p", null, copy[1]));
			banner.append(stateText);
			content.append(banner);

			if (!data.bank_account) {
				if (data.state === "no-bank-account" && data.capabilities && data.capabilities.can_create_bank_account) {
					const openAccounts = action(__("Open bank accounts"), "small-add", false, () => route(["List", "Bank Account"]));
					banner.append(openAccounts);
				}
				return;
			}

			const currency = data.bank_account.currency;
			const summary = data.summary || {};
			const metrics = el("section", "bnd-banking__metrics");
			metrics.setAttribute("aria-label", __("Period summary"));
			metrics.append(
				metric(__("Imported deposits"), money(summary.deposits, currency), __("Statement movement in")),
				metric(__("Imported withdrawals"), money(summary.withdrawals, currency), __("Statement movement out")),
				metric(__("Open statement amount"), money(summary.open_amount, currency), __("Open transactions: {0}", [number(summary.open_count)]), summary.open_count ? "warning" : "neutral"),
				metric(__("Book net movement"), summary.book_net === null ? __("Not available") : money(summary.book_net, currency), __("Debit minus credit; not a reconciliation difference")),
				metric(__("Older open items"), number(summary.older_open_count), __("Before this period"), summary.older_open_count ? "warning" : "neutral")
			);
			content.append(metrics);

			const ageing = el("section", "bnd-banking__panel");
			ageing.append(el("h3", null, __("Open transaction ageing")));
			const ages = el("div", "bnd-banking__ageing");
			for (const [key, label] of [
				["0_30", __("0–30 days")],
				["31_60", __("31–60 days")],
				["61_90", __("61–90 days")],
				["over_90", __("Over 90 days")],
			]) {
				ages.append(metric(label, number((data.ageing || {})[key]), __("Open transactions"), (data.ageing || {})[key] ? "warning" : "neutral"));
			}
			ageing.append(ages);
			content.append(ageing);

			content.append(drawQueue(data.queue || [], currency, data.queue_truncated));
			content.append(drawImports(data.recent_imports || []));
		}

		function drawQueue(rows, currency, truncated) {
			const panel = el("section", "bnd-banking__panel");
			const heading = el("div", "bnd-banking__panel-heading");
			heading.append(
				el("h3", null, __("Unmatched and partially matched transactions")),
				el("span", null, __("Shown: {0}", [number(rows.length)]))
			);
			panel.append(heading);
			if (!rows.length) {
				panel.append(el("p", "bnd-banking__empty", __("No open imported transactions in this period.")));
				return panel;
			}
			const scroller = el("div", "bnd-banking__table-wrap");
			const table = el("table", "bnd-banking__table");
			const thead = el("thead");
			const head = el("tr");
			for (const label of [__("Transaction"), __("Date"), __("Statement amount"), __("Allocated"), __("Open"), __("Age"), __("Action")]) {
				head.append(el("th", null, label));
			}
			thead.append(head);
			table.append(thead);
			const tbody = el("tbody");
			for (const row of rows) {
				const tr = el("tr");
				const description = el("td", "bnd-banking__transaction");
				description.append(
					el("strong", null, row.description || row.transaction_type || __("Bank transaction")),
					el("small", null, [row.reference_number, row.party].filter(Boolean).join(" · ") || row.name)
				);
				const amount = Number(row.deposit || 0) - Number(row.withdrawal || 0);
				const open = el("button", "btn btn-xs btn-default", __("Open"));
				open.type = "button";
				open.addEventListener("click", () => route(["Form", "Bank Transaction", row.name]));
				for (const cell of [
					description,
					el("td", null, userDate(row.date)),
					el("td", "is-number", money(amount, currency)),
					el("td", "is-number", money(row.allocated_amount, currency)),
					el("td", "is-number", money(row.open_amount, currency)),
					el("td", null, __("Age in days: {0}", [number(row.age_days)])),
				]) tr.append(cell);
				const actionCell = el("td");
				actionCell.append(open);
				tr.append(actionCell);
				tbody.append(tr);
			}
			table.append(tbody);
			scroller.append(table);
			panel.append(scroller);
			if (truncated) panel.append(el("p", "bnd-banking__note", __("Only the first 200 open transactions are shown. Use the native workspace for the full queue.")));
			return panel;
		}

		function drawImports(imports) {
			const panel = el("section", "bnd-banking__panel");
			panel.append(el("h3", null, __("Recent statement imports")));
			if (!imports.length) {
				panel.append(el("p", "bnd-banking__empty", __("No recent native statement import records were found for this account.")));
				return panel;
			}
			const list = el("div", "bnd-banking__imports");
			for (const item of imports) {
				const button = el("button", "bnd-banking__import");
				button.type = "button";
				button.append(
					el("strong", null, item.name),
					el("span", null, item.status || __("Draft")),
					el("small", null, userDate(item.creation))
				);
				button.addEventListener("click", () => route(["Form", "Bank Statement Import", item.name]));
				list.append(button);
			}
			panel.append(list);
			return panel;
		}

		if (companyControl.get_value()) load(false);
		else {
			replaceAccountOptions([], "");
			updateActions();
			draw({ state: "select-bank-account", bank_accounts: [], capabilities: {} });
		}
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.banking_render = render;
})();
