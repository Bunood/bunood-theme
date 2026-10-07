frappe.ui.form.on("Bunood Migration Rehearsal", {
	refresh(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.control_state === "running") {
			frm.dashboard.set_headline_alert(
				__("The native import is running on the isolated rehearsal database. No production import is authorized."),
				"blue"
			);
			frm.add_custom_button(__("Refresh native result"), () => {
				frappe.call({
					method: "bunood_theme.api.capture_isolated_migration_rehearsal",
					args: { rehearsal_name: frm.doc.name },
					freeze: true,
					freeze_message: __("Reading the native Data Import result…"),
					callback: ({ message }) => {
						if (message && message.completed) frm.reload_doc();
					},
				});
			});
		} else if (frm.doc.docstatus === 1) {
			const message = frm.doc.control_state === "dry-run-validated"
				? __("The frozen file completed on an isolated database. Reconciliation and production approval are still required.")
				: __("The isolated rehearsal recorded exceptions. Download the failed rows, correct the source cells, then create a new frozen packet on the source site using this receipt digest.");
			frm.dashboard.set_headline_alert(message, frm.doc.control_state === "dry-run-validated" ? "green" : "orange");
		}

		if (
			frm.doc.docstatus === 1 &&
			frm.doc.control_state === "exception" &&
			cint(frm.doc.failed_records) > 0
		) {
			frm.add_custom_button(__("Download failed rows"), () => {
				open_url_post(
					"/api/method/bunood_theme.api.download_isolated_migration_failed_rows",
					{ rehearsal_name: frm.doc.name }
				);
			});
		}

		if (frm.doc.docstatus === 1 && frm.doc.control_state === "dry-run-validated") {
			frm.add_custom_button(__("Prepare reconciliation"), () => {
				frappe.call({
					method: "bunood_theme.api.prepare_migration_reconciliation",
					args: { rehearsal_name: frm.doc.name },
					freeze: true,
					freeze_message: __("Checking successful rehearsal evidence…"),
					callback: ({ message }) => {
						if (message && Array.isArray(message.route)) frappe.set_route(...message.route);
					},
				});
			});
		}

		if (frm.doc.data_import) {
			frm.add_custom_button(__("Open native Data Import"), () => {
				frappe.set_route("Form", "Data Import", frm.doc.data_import);
			});
		}
	},
});
