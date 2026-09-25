frappe.ui.form.on("Bunood Migration Reconciliation", {
	refresh(frm) {
		if (frm.doc.docstatus === 0) {
			const message = frm.doc.control_state === "exception"
				? __("Non-zero variances need an owner, cause, corrective action and rerun reference before this exception receipt can be submitted.")
				: frm.doc.control_state === "reconciled"
					? __("All applicable controls are exact. Submit to freeze this evidence; production cutover and migration acceptance remain separate.")
					: __("Complete every domain. Add dimension-level rows where needed, or select Not Applicable and explain why.");
			frm.dashboard.set_headline_alert(
				message,
				frm.doc.control_state === "exception" ? "orange" : "blue"
			);
		} else if (frm.doc.docstatus === 1) {
			const message = frm.doc.control_state === "reconciled"
				? __("This immutable receipt records exact source-to-native controls. It does not authorize production cutover or migration acceptance.")
				: __("This immutable exception receipt preserves owned variances. Correct the source through a new migration packet and rehearse again.");
			frm.dashboard.set_headline_alert(
				message,
				frm.doc.control_state === "exception" ? "orange" : "blue"
			);
		}

		if (frm.doc.migration_run) {
			frm.add_custom_button(__("Open migration packet"), () => {
				frappe.set_route("Form", "Bunood Migration Run", frm.doc.migration_run);
			});
		}
	},
});
