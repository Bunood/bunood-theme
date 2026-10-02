frappe.ui.form.on("Bunood Migration Run", {
	setup(frm) {
		frm.set_query("target_doctype", "datasets", () => ({
			filters: { allow_import: 1, istable: 0, issingle: 0 },
		}));
		frm.set_query("supersedes_migration_run", () => ({
			filters: { docstatus: 1, control_state: "mapped" },
		}));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__("Submitting freezes the mapped source packet. It does not validate or import business data."),
				"orange"
			);
			return;
		}
		if (frm.doc.docstatus !== 1) return;

		frm.dashboard.set_headline_alert(
			__("This mapped packet is immutable. An isolated rehearsal can record native import results, but no production import, reconciliation or acceptance is authorized."),
			"blue"
		);

		frm.add_custom_button(__("Create corrected packet"), () => {
			const dialog = new frappe.ui.Dialog({
				title: __("Create corrected migration packet"),
				fields: [
					{
						fieldtype: "HTML",
						options: `<p class="text-muted">${__("Use the receipt digest from the isolated exception rehearsal. The new draft must change the frozen source, mapping, identity rule, duplicate decision or control evidence before it can be submitted.")}</p>`,
					},
					{
						fieldname: "prior_rehearsal_receipt_digest",
						fieldtype: "Data",
						label: __("Prior rehearsal receipt digest"),
						reqd: 1,
					},
					{
						fieldname: "correction_reason",
						fieldtype: "Small Text",
						label: __("Correction reason"),
						reqd: 1,
					},
				],
				primary_action_label: __("Create correction draft"),
				primary_action(values) {
					dialog.disable_primary_action();
					frappe.call({
						method: "bunood_theme.api.prepare_corrected_migration_packet",
						args: {
							run_name: frm.doc.name,
							prior_rehearsal_receipt_digest: values.prior_rehearsal_receipt_digest,
							correction_reason: values.correction_reason,
						},
						callback: ({ message }) => {
							if (message && Array.isArray(message.route)) {
								dialog.hide();
								frappe.set_route(...message.route);
							}
						},
						always: () => dialog.enable_primary_action(),
					});
				},
			});
			dialog.show();
		});

		const datasets = (frm.doc.datasets || []).filter(
			(row) => row.load_method === "Data Import"
		);
		if (!datasets.length) return;

		frm.add_custom_button(__("Prepare native Data Import"), () => {
			const labels = {};
			const options = datasets.map((row) => {
				labels[row.name] = `${row.idx}. ${row.dataset_name} — ${row.target_doctype}`;
				return { label: labels[row.name], value: row.name };
			});
			const dialog = new frappe.ui.Dialog({
				title: __("Prepare native Data Import"),
				fields: [
					{
						fieldname: "dataset_row_name",
						fieldtype: "Select",
						label: __("Dataset"),
						options,
						reqd: 1,
					},
				],
				primary_action_label: __("Open Data Import draft"),
				primary_action(values) {
					dialog.disable_primary_action();
					frappe.call({
						method: "bunood_theme.api.prepare_native_data_import",
						args: {
							run_name: frm.doc.name,
							dataset_row_name: values.dataset_row_name,
						},
						callback: ({ message }) => {
							if (message && Array.isArray(message.route)) {
								dialog.hide();
								frappe.set_route(...message.route);
							}
						},
						always: () => dialog.enable_primary_action(),
					});
				},
			});
			dialog.show();
		});

		frm.add_custom_button(__("Start isolated rehearsal"), () => {
			const options = datasets.map((row) => ({
				label: `${row.idx}. ${row.dataset_name} — ${row.target_doctype}`,
				value: row.name,
			}));
			const dialog = new frappe.ui.Dialog({
				title: __("Start isolated rehearsal"),
				fields: [
					{
						fieldtype: "HTML",
						options: `<p class="text-muted">${__("This action is blocked on the frozen source database. Run it only after restoring the packet and attached file to a separate rehearsal site.")}</p>`,
					},
					{
						fieldname: "dataset_row_name",
						fieldtype: "Select",
						label: __("Dataset"),
						options,
						reqd: 1,
					},
				],
				primary_action_label: __("Start native rehearsal"),
				primary_action(values) {
					dialog.disable_primary_action();
					frappe.call({
						method: "bunood_theme.api.start_isolated_migration_rehearsal",
						args: {
							run_name: frm.doc.name,
							dataset_row_name: values.dataset_row_name,
						},
						freeze: true,
						freeze_message: __("Starting the native import on the isolated database…"),
						callback: ({ message }) => {
							if (message && Array.isArray(message.route)) {
								dialog.hide();
								frappe.set_route(...message.route);
							}
						},
						always: () => dialog.enable_primary_action(),
					});
				},
			});
			dialog.show();
		});
	},
});

frappe.ui.form.on("Bunood Migration Dataset", {
	import_type(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		const disposition = {
			"Insert New Records": "Reject existing matches",
			"Update Existing Records": "Update approved matches only",
			"Insert or Update Records": "Insert unmatched and update approved matches",
		}[row.import_type] || "";
		frappe.model.set_value(cdt, cdn, "duplicate_disposition", disposition);
	},
});
