// A concise, searchable gateway over the native Reports workspace. Routes,
// permissions and report execution stay with Frappe/ERPNext.
/* global frappe, __ */
(() => {
	"use strict";

	const REPORTS = [
		{ label: "Finance and close", description: "Review period readiness, exceptions and close evidence.", icon: "calendar", route: ["bnd-finance-close"], bootAsset: "bnd_finance_close_js" },
		{ label: "Journal workbench", description: "Prepare and review native journal entries with their supporting details.", icon: "book-open", route: ["bnd-journal-workbench"], bootAsset: "bnd_journal_workbench_js" },
		{ label: "Bank Reconciliation", description: "Match bank activity to native transactions and investigate differences.", icon: "banknote", route: ["bnd-banking"], bootAsset: "bnd_banking_js" },
		{ label: "Report Studio", description: "Browse sales, purchasing and accounting reports in one responsive catalogue.", icon: "chart-bar", route: ["bnd-report-studio"] },
		{ label: "VAT Return", description: "Review the VAT period from submitted ERPNext transactions.", icon: "file-text", route: ["bnd-report-studio", "vat-return"] },
		{ label: "Statement of Account", description: "Open a clear customer, supplier, employee or ledger statement.", icon: "list", route: ["bnd-report-studio", "account-statement"] },
	];

	const isReportsRoute = () => {
		const route = frappe.get_route?.() || [];
		return route[0] === "Workspaces" && route[1] === "Reports";
	};

	function cardFor(report) {
		const card = document.createElement("a");
		card.className = "bnd-report-landing__card";
		card.href = `/desk/${report.route.join("/")}`;
		card.addEventListener("click", event => {
			if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			frappe.set_route(...report.route);
		});
		const icon = document.createElement("span");
		icon.className = "bnd-report-landing__icon";
		icon.innerHTML = frappe.utils.icon(report.icon, "md");
		icon.setAttribute("aria-hidden", "true");
		const copy = document.createElement("span");
		const name = document.createElement("span");
		name.className = "bnd-report-landing__name";
		name.textContent = __(report.label);
		const description = document.createElement("span");
		description.className = "bnd-report-landing__description";
		description.textContent = __(report.description);
		copy.append(name, description);
		card.append(icon, copy);
		card.dataset.search = `${name.textContent} ${description.textContent}`.toLocaleLowerCase();
		return card;
	}

	function mount() {
		if (!isReportsRoute()) return;
		const host = document.querySelector(".layout-main-section .editor-js-container");
		if (!host || host.querySelector(":scope > .bnd-report-landing")) return;
		const native = host.querySelector(":scope > #editorjs");
		if (native) native.hidden = true;
		host.closest(".page-container")?.classList.add("bnd-report-landing-active");

		const root = document.createElement("section");
		root.className = "bnd-report-landing";
		root.setAttribute("aria-labelledby", "bnd-report-landing-title");
		const head = document.createElement("header");
		head.className = "bnd-report-landing__head";
		const copy = document.createElement("div");
		const title = document.createElement("h1");
		title.id = "bnd-report-landing-title";
		title.className = "bnd-report-landing__title";
		title.textContent = __("Reports");
		const intro = document.createElement("p");
		intro.className = "bnd-report-landing__intro";
		intro.textContent = __("Choose the question you need to answer. Every result comes from native ERPNext documents and ledgers.");
		copy.append(title, intro);
		const search = document.createElement("input");
		search.className = "bnd-report-landing__search";
		search.type = "search";
		search.placeholder = __("Search reports");
		search.setAttribute("aria-label", __("Search reports"));
		head.append(copy, search);

		const grid = document.createElement("div");
		grid.className = "bnd-report-landing__grid";
		// Optional capability branches advertise their immutable asset in boot.
		// Keep this landing independently pullable: never link to a Page that was
		// not installed with its corresponding capability.
		const cards = REPORTS.filter(report => !report.bootAsset || frappe.boot?.[report.bootAsset]).map(cardFor);
		grid.append(...cards);
		const empty = document.createElement("p");
		empty.className = "bnd-report-landing__empty";
		empty.textContent = __("No reports match your search.");
		empty.hidden = true;
		grid.append(empty);
		search.addEventListener("input", () => {
			const query = search.value.trim().toLocaleLowerCase();
			let visible = 0;
			for (const card of cards) {
				card.hidden = !!query && !card.dataset.search.includes(query);
				if (!card.hidden) visible += 1;
			}
			empty.hidden = visible !== 0;
		});
		root.append(head, grid);
		host.prepend(root);
	}

	function sync() {
		if (!isReportsRoute()) {
			for (const root of document.querySelectorAll(".bnd-report-landing")) {
				const native = root.parentElement?.querySelector(":scope > #editorjs");
				if (native) native.hidden = false;
				root.closest(".page-container")?.classList.remove("bnd-report-landing-active");
				root.remove();
			}
			return;
		}
		for (const delay of [0, 100, 400, 1000]) setTimeout(mount, delay);
	}

	frappe.router.on("change", sync);
	// This bundle is fetched after Desk has already become interactive; website
	// helper `frappe.ready` is not present on every Frappe v16 Desk build.
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", sync, { once: true });
	} else {
		sync();
	}
	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.report_landing_loaded = true;
})();
