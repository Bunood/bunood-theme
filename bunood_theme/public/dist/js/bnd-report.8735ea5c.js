// Copyright (c) 2026, Bunood and contributors
// Page-scoped enhancement for the seven production reference reports.
//
// This script is loaded from its immutable hashed asset only on query-report.
// It never replaces QueryReport, refresh, prepared-report, virtualization or
// export behavior. The only wrapper delegates to the live throttled refresh
// and listens to its jqXHR so a failed request has a persistent recovery path.

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const REPORTS = new Set([
		"General Ledger",
		"Accounts Receivable",
		"Accounts Payable",
		"VAT Summary",
		"Stock Balance",
		"Rent Roll",
		"Owner Ledger",
	]);
	const NUMERIC_TYPES = new Set(["Currency", "Float", "Int", "Percent"]);
	const MAX_SCOPE_ITEMS = 6;
	let installTimer = null;
	let installAttempts = 0;

	function shown(node) {
		return Boolean(node && node.getClientRects().length);
	}

	function currentRoot(report) {
		return report?.page?.wrapper?.get?.(0) ||
			[...document.querySelectorAll("[id='page-query-report']")].find(shown) || null;
	}

	function activeReport(report) {
		return Boolean(report && REPORTS.has(report.report_name) &&
			frappe.get_route?.()[0] === "query-report");
	}

	function icon(name) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "icon icon-sm bnd-report-action-icon");
		svg.setAttribute("aria-hidden", "true");
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", `#icon-${name}`);
		svg.append(use);
		return svg;
	}

	function hasValue(value, control) {
		if (value == null || value === "") return false;
		if (Array.isArray(value)) return value.length > 0;
		if (control?.df?.fieldtype === "Check") return Boolean(value);
		return true;
	}

	function displayValue(value, control) {
		if (Array.isArray(value)) return value.join(", ");
		if (control?.df?.fieldtype === "Date" && value) {
			return frappe.datetime.str_to_user(value);
		}
		if (control?.df?.fieldtype === "Check") return value ? __("Yes") : __("No");
		return String(value);
	}

	function scopeItems(report) {
		return (report.filters || [])
			.filter((control) => !control.df?.hidden && !control.df?.hidden_due_to_dependency)
			.map((control) => ({ control, value: control.get_value?.() }))
			.filter(({ control, value }) => hasValue(value, control))
			.map(({ control, value }) => ({
				label: __(control.df?.label || control.df?.fieldname || ""),
				value: displayValue(value, control),
			}));
	}

	function renderScope(report, root) {
		if (!activeReport(report) || !root) return;
		const form = root.querySelector(".page-form");
		if (!form) return;
		let scope = root.querySelector(".bnd-report-scope");
		if (!scope) {
			scope = document.createElement("div");
			scope.className = "bnd-report-scope";
			scope.setAttribute("role", "region");
			scope.setAttribute("aria-label", __("Report scope"));
			form.insertAdjacentElement("afterend", scope);
		}
		scope.replaceChildren();
		const title = document.createElement("strong");
		title.className = "bnd-report-scope__title";
		title.textContent = __("Report scope");
		scope.append(title);

		const items = scopeItems(report);
		const list = document.createElement("div");
		list.className = "bnd-report-scope__items";
		for (const item of items.slice(0, MAX_SCOPE_ITEMS)) {
			const chip = document.createElement("span");
			chip.className = "bnd-report-scope__item";
			const label = document.createElement("span");
			label.className = "bnd-report-scope__label";
			label.textContent = `${item.label}:`;
			const value = document.createElement("bdi");
			value.className = "bnd-report-scope__value";
			value.setAttribute("dir", "auto");
			value.textContent = item.value;
			chip.append(label, value);
			list.append(chip);
		}
		if (items.length > MAX_SCOPE_ITEMS) {
			const more = document.createElement("span");
			more.className = "bnd-report-scope__more";
			more.textContent = __("{0} more filters", [items.length - MAX_SCOPE_ITEMS]);
			more.title = items.slice(MAX_SCOPE_ITEMS)
				.map((item) => `${item.label}: ${item.value}`).join("\n");
			list.append(more);
		}
		scope.append(list);
	}

	function removeFailure(root) {
		root?.querySelector(".bnd-report-recovery")?.remove();
	}

	function showFailure(report, root) {
		if (!activeReport(report) || !root) return;
		removeFailure(root);
		const state = window.bunood_theme.system_state.create({
			kind: "recoverable-error",
			compact: true,
			className: "bnd-report-recovery",
			title: __("Could not refresh this report"),
			message: __("Check your connection and try again."),
			action: {
				label: __("Retry"),
				icon: "icon-refresh-cw",
				className: "bnd-report-retry",
				run: () => {
					state.querySelector(".bnd-system-state__message").textContent = __("Retrying…");
					const args = report.refresh?._bnd_last_args || [];
					const result = report.refresh?.apply(report, args);
					if (result && typeof result.catch === "function") result.catch(() => {});
					return result;
				},
			},
		});
		const anchor = root.querySelector(".bnd-report-scope") || root.querySelector(".page-form");
		anchor?.insertAdjacentElement("afterend", state);
	}

	function ensureEmptyAction(report, root) {
		root?.querySelectorAll(".bnd-report-empty-action").forEach((node) => node.remove());
		if (!activeReport(report) || !Array.isArray(report.data) || report.data.length ||
			(report.prepared_report && !report.prepared_report_document)) return;
		const message = report.$message?.get?.(0);
		if (!shown(message)) return;
		const host = message.querySelector(".msg-box") || message.firstElementChild;
		if (!host) return;
		const action = document.createElement("button");
		action.type = "button";
		action.className = "btn btn-secondary bnd-report-empty-action";
		action.append(icon("filter"), document.createTextNode(__("Review filters")));
		action.addEventListener("click", () => {
			const first = [...root.querySelectorAll(
				".page-form input:not([type='hidden']), .page-form select"
			)].find((node) => shown(node) && !node.disabled);
			first?.scrollIntoView({ block: "center", behavior: "smooth" });
			first?.focus({ preventScroll: true });
		});
		host.append(action);
	}

	function reportColumn(report, datatableColumn) {
		const id = datatableColumn?.id || datatableColumn?.fieldname;
		return (report.columns || []).find((column) =>
			(column.fieldname || column.id) === id) || datatableColumn || {};
	}

	function decorateTable(report, root) {
		if (!activeReport(report) || !root || !report.datatable) return;
		const datatable = root.querySelector(".datatable");
		if (!datatable) return;
		const columns = report.datatable.datamanager?.columns || [];
		columns.forEach((datatableColumn, index) => {
			const column = reportColumn(report, datatableColumn);
			if (!NUMERIC_TYPES.has(column.fieldtype || datatableColumn.type)) return;
			for (const cell of datatable.querySelectorAll(`.dt-cell--col-${index}`)) {
				cell.classList.add("bnd-report-number");
				cell.querySelector(".dt-cell__content")?.setAttribute("dir", "ltr");
			}
		});

		const rows = report.data || [];
		for (const rowNode of datatable.querySelectorAll(".dt-scrollable .dt-row[data-row-index]")) {
			const row = rows[Number(rowNode.dataset.rowIndex)];
			rowNode.classList.toggle("bnd-report-total-row", Boolean(row?.is_total || row?.is_total_row));
			rowNode.classList.toggle("bnd-report-section-row", Boolean(row?.is_section));
		}
	}

	function afterSuccess(report) {
		const root = currentRoot(report);
		if (!activeReport(report) || !root) return;
		removeFailure(root);
		renderScope(report, root);
		ensureEmptyAction(report, root);
		decorateTable(report, root);
	}

	function bindRequest(report, request) {
		if (!request || request._bnd_report_bound || typeof request.fail !== "function") return;
		request._bnd_report_bound = true;
		// Frappe's jqXHR resolves before QueryReport's Promise chain completes
		// its native render. Defer one task so data, prepared state and $message
		// are authoritative before the presentation layer reads them.
		request.done?.(() => setTimeout(() => afterSuccess(report), 0));
		request.fail((_xhr, status) => {
			if (status === "abort") return;
			showFailure(report, currentRoot(report));
		});
	}

	function wrapRefresh(report) {
		if (report.refresh?._bnd_native) return;
		const nativeRefresh = report.refresh;
		if (typeof nativeRefresh !== "function") return;
		function bndRefresh(...args) {
			bndRefresh._bnd_last_args = args;
			const result = bndRefresh._bnd_native.apply(this, args);
			if (activeReport(this)) queueMicrotask(() => bindRequest(this, this.last_ajax));
			if (result && typeof result.then === "function") {
				result.then(() => afterSuccess(this), () => {});
			}
			return result;
		}
		bndRefresh._bnd_native = nativeRefresh;
		bndRefresh._bnd_last_args = [];
		report.refresh = bndRefresh;
	}

	function install() {
		const report = frappe.query_report;
		const root = currentRoot(report);
		if (!report || !root || !report.report_name || !Array.isArray(report.filters)) return false;
		if (!activeReport(report)) {
			root.removeAttribute("data-bnd-report-workbench");
			root.querySelector(".bnd-report-scope")?.remove();
			removeFailure(root);
			return true;
		}
		root.setAttribute("data-bnd-report-workbench", "");
		wrapRefresh(report);
		bindRequest(report, report.last_ajax);
		renderScope(report, root);
		decorateTable(report, root);

		if (!root._bnd_report_events) {
			root._bnd_report_events = true;
			const update = () => requestAnimationFrame(() =>
				renderScope(frappe.query_report, currentRoot(frappe.query_report)));
			root.addEventListener("change", update, true);
			root.addEventListener("input", update, true);
		}
		const reportHost = report.$report?.get?.(0);
		if (reportHost && !reportHost._bnd_report_observer) {
			reportHost._bnd_report_observer = new MutationObserver(() =>
				requestAnimationFrame(() =>
					decorateTable(frappe.query_report, currentRoot(frappe.query_report))));
			reportHost._bnd_report_observer.observe(reportHost, { childList: true, subtree: true });
		}
		return true;
	}

	function scheduleInstall() {
		clearTimeout(installTimer);
		installAttempts = 0;
		const tick = () => {
			if (install() || installAttempts++ >= 120) return;
			installTimer = setTimeout(tick, 100);
		};
		installTimer = setTimeout(tick, 0);
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.report_workbench_loaded = true;
	frappe.router?.on?.("change", scheduleInstall);
	scheduleInstall();
})();
