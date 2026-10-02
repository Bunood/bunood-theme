// Copyright (c) 2026, Bunood and contributors
/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-journal-workbench"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Journal workbench"),
		single_column: true,
	});
	const container = document.createElement("div");
	page.main.append(container);

	const fail = (message) => {
		container.replaceChildren();
		const state = document.createElement("div");
		state.className = "bnd-close-load-error";
		state.setAttribute("role", "alert");
		state.textContent = message;
		container.append(state);
	};

	const src = frappe.boot && frappe.boot.bnd_journal_workbench_js;
	if (!src) {
		fail(__("The journal workbench bundle is not registered. Rebuild the theme assets."));
		return;
	}
	frappe.require(src, () => {
		const api = window.bunood_theme;
		if (!api || typeof api.journal_workbench_render !== "function") {
			fail(__("The journal workbench failed to load. Check the browser console."));
			return;
		}
		api.journal_workbench_render(container, page);
	});
};
