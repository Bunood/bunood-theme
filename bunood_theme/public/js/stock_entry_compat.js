/**
 * Read the two Stock Settings values ERPNext's own Stock Entry controller needs.
 *
 * ERPNext gives Stock User the full native Stock Entry lifecycle but gives the
 * Stock Settings singleton only to Stock Manager and Sales User. The upstream
 * controller nevertheless reads these fields during setup, producing two 403s
 * for the warehouse operator. This route-scoped adapter reads the original
 * singleton through a field-whitelisted server method. Every other frappe.db
 * call remains untouched.
 */
(function installStockEntrySettingsCompatibility() {
	if (!window.frappe?.db || frappe.db.__bndStockEntrySettingsCompatibility) return;

	const allowed = new Set(["sample_retention_warehouse", "disable_serial_no_and_batch_selector"]);
	const nativeGetValue = frappe.db.get_value.bind(frappe.db);
	const nativeGetSingleValue = frappe.db.get_single_value.bind(frappe.db);
	const read = fieldname => frappe.xcall("bunood_theme.api.get_stock_entry_setting", { fieldname });

	frappe.db.get_value = function (doctype, filters, fieldname, callback, parentDoc) {
		if (doctype !== "Stock Settings" || !allowed.has(fieldname)) {
			return nativeGetValue(doctype, filters, fieldname, callback, parentDoc);
		}
		return frappe.call({
			method: "bunood_theme.api.get_stock_entry_setting",
			args: { fieldname },
			callback: response => {
				const message = { [fieldname]: response ? response.message : null };
				if (typeof callback === "function") callback(message);
				if (response) response.message = message;
			},
		});
	};

	frappe.db.get_single_value = function (doctype, fieldname) {
		if (doctype === "Stock Settings" && allowed.has(fieldname)) return read(fieldname);
		return nativeGetSingleValue(doctype, fieldname);
	};

	frappe.db.__bndStockEntrySettingsCompatibility = true;
})();
