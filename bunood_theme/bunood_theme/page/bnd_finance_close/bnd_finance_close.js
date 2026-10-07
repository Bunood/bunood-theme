// Copyright (c) 2026, Bunood and contributors
/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-finance-close"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Finance and close"),
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

	const src = frappe.boot && frappe.boot.bnd_finance_close_js;
	if (!src) {
		fail(__("The finance close bundle is not registered. Rebuild the theme assets."));
		return;
	}
	frappe.require(src, () => {
		const api = window.bunood_theme;
		if (!api || typeof api.finance_close_render !== "function") {
			fail(__("The finance close workspace failed to load. Check the browser console."));
			return;
		}
		api.finance_close_render(container, page);
	});
};
