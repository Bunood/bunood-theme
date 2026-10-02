// Quick Sale is an entry point, not a second invoice implementation. The
// existing Sales Invoice workbench remains the single task-first editor.
/* eslint-env browser */
/* global frappe */

frappe.pages["bnd-quick-sale"].on_page_load = function () {
	frappe.route_options = { is_pos: 0 };
	frappe.new_doc("Sales Invoice");
};
