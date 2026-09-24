/* global frappe */
(() => {
	"use strict";
	const settings = frappe.listview_settings.Quotation;
	window.bunood_theme?.list_presets?.register(settings, "Quotation");
})();
