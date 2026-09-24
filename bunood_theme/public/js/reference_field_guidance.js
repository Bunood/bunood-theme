/* Keep native ERPNext validation and link queries; clarify their requirements in place. */
(function () {
	if (!window.frappe?.ui?.form) return;
	frappe.ui.form.on("Warehouse", {
		refresh(frm) {
			if (!frm.fields_dict?.account) return;
			frm.set_df_property("account", "description", __("Only non-group Stock accounts for this warehouse's company appear here. Create the account as type Stock first, then return and select it. Leave blank to use the parent warehouse or company default."));
		},
	});
	frappe.ui.form.on("Country", {
		refresh(frm) {
			if (!frm.fields_dict?.code) return;
			frm.set_df_property("code", "description", __("Enter the two-letter ISO country code, such as SA for Saudi Arabia—not a numeric code. Search for the country first to avoid a duplicate."));
		},
	});
})();
