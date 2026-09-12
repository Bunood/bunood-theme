/* global frappe */
(() => {
	"use strict";
	const settings = frappe.listview_settings["Purchase Invoice"];
	if (!settings || settings.__bnd_priority_columns) return;
	const nativeOnload = settings.onload;
	const nativeBeforeRender = settings.before_render;
	let current;
	settings.onload = function (listview) {
		const result = nativeOnload?.call(this, listview);
		current = listview;
		return result;
	};
	settings.before_render = function () {
		const result = nativeBeforeRender?.apply(this, arguments);
		const listview = current;
		if (!listview) return result;
		const saved = listview.list_view_settings?.fields ||
			(listview.list_filter?.active_layout_name && listview.list_filter.active_layout_name !== "default_layout");
		if (saved || !listview.columns?.length) return result;
		const subject = listview.meta.title_field || "name";
		const rank = new Map([subject, "status_field", "grand_total", "name", "due_date", "posting_date"].map((name, index) => [name, index]));
		const key = column => column.type === "Subject" ? subject : column.type === "Status" ? "status_field" : column.df?.fieldname;
		listview.columns = listview.columns.filter(column => column.type !== "Tag")
			.sort((a, b) => (rank.get(key(a)) ?? 99) - (rank.get(key(b)) ?? 99));
		listview.columns.splice(1, 0, { type: "Tag" });
		return result;
	};
	settings.__bnd_priority_columns = true;
})();
