frappe.ui.form.on("Bunood Readiness Review", {
	setup(frm) {
		frm.set_query("project", () => ({
			filters: {
				company: frm.doc.company,
				custom_bunood_readiness_identity: frm.doc.company,
			},
		}));
		frm.set_query("task", () => ({
			filters: {
				project: frm.doc.project,
				custom_bunood_readiness_domain: ["is", "set"],
			},
		}));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("This submitted receipt is immutable. Reopening creates a new linked receipt."),
				"blue"
			);
			if (["Accepted", "Not Applicable"].includes(frm.doc.decision)) {
				frm.add_custom_button(__("Create reopening review"), () => {
					frappe.call({
						method: "bunood_theme.api.prepare_readiness_decision",
						args: { company: frm.doc.company, domain: frm.doc.domain },
						callback: ({ message }) => {
							if (message && Array.isArray(message.route)) frappe.set_route(...message.route);
						},
					});
				});
			}
		}
	},
});
