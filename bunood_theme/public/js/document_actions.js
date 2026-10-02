// Shared form-action contract. State and labels stay presentation-only; the
// one-step commit delegates persistence and submission to native frm methods.
/* global __ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};

	const TONES = new Map([
		["draft", "neutral"], ["not saved", "neutral"],
		["submitted", "info"], ["posted", "info"], ["open", "info"],
		["sent", "accent"],
		["partially paid", "warning"], ["partly paid", "warning"], ["expired", "warning"],
		["paid", "success"], ["completed", "success"], ["ordered", "success"], ["converted", "success"],
		["overdue", "danger"], ["lost", "danger"],
		["cancelled", "cancelled"], ["canceled", "cancelled"],
	]);

	function permitted(frm, type) {
		try {
			if (typeof frm?.has_perm === "function") return !!frm.has_perm(type);
		} catch (_error) { /* Native action still validates permission at invocation. */ }
		const permission = frm?.perm?.[0];
		return permission && Object.hasOwn(permission, type) ? !!permission[type] : true;
	}

	function documentState(frm) {
		const doc = frm?.doc || {};
		const status = Number(doc.docstatus);
		let label;
		if (status === 2) label = "Cancelled";
		else if (status === 0) label = "Draft";
		else if (frm?.doctype === "Sales Invoice") {
			const native = String(doc.status || "").trim();
			if (/overdue/i.test(native)) label = "Overdue";
			else if (Number(doc.outstanding_amount) <= 0 && doc.outstanding_amount != null) label = "Paid";
			else if (Number(doc.paid_amount) > 0) label = "Partially paid";
			else label = native || "Submitted";
		} else {
			label = String(doc.status || "").trim() || "Submitted";
		}
		const key = label.toLocaleLowerCase("en");
		return { label, tone: TONES.get(key) || (status === 1 ? "info" : "neutral") };
	}

	function actionState(frm, options = {}) {
		const doc = frm?.doc || {};
		const status = Number(doc.docstatus);
		const local = !!doc.__islocal;
		const dirty = typeof frm?.is_dirty === "function" ? !!frm.is_dirty() : false;
		const draft = status === 0;
		const showSave = draft && (local || dirty) && !frm?.save_disabled && permitted(frm, local ? "create" : "write");
		const showSubmit = draft && !local && !dirty && !!frm?.meta?.is_submittable && permitted(frm, "submit");
		const showCreateInvoice = status === 1 && !!options.canCreateInvoice;
		const showRecordPayment = status === 1 && !!options.canRecordPayment && Number(doc.outstanding_amount) !== 0;
		const showPrintReceipt = frm?.doctype === "Payment Entry" && status === 1 && !local;
		const primary = showSave ? "save" : showSubmit ? "submit" : showCreateInvoice ? "create-invoice" :
			showRecordPayment ? "record-payment" : showPrintReceipt ? "print" : "";
		return {
			primary,
			showSave,
			showSubmit,
			showCreateInvoice,
			showRecordPayment,
			showNew: permitted(frm, "create"),
			showPrint: !local,
			showDuplicate: !local && permitted(frm, "create"),
			showDelete: draft && !local && permitted(frm, "delete"),
			showCancel: status === 1 && !!frm?.meta?.is_submittable && permitted(frm, "cancel"),
		};
	}

	function canSaveAndSubmit(frm) {
		const local = !!frm?.doc?.__islocal;
		return Number(frm?.doc?.docstatus) === 0 && !!frm?.meta?.is_submittable &&
			!frm?.save_disabled && permitted(frm, "submit") && permitted(frm, local ? "create" : "write");
	}

	function submitWithoutConfirmation(frm) {
		// The button itself is the user's submit decision. Accept only Frappe's
		// exact submit prompt; other confirmations (including custom validation)
		// must still reach the native dialog.
		const nativeConfirm = frappe.confirm;
		if (typeof nativeConfirm !== "function") return Promise.resolve(frm.savesubmit());
		const prompt = __("Permanently Submit {0}?", [frm.docname]);
		let accepted = false;
		frappe.confirm = function (message, yes) {
			if (!accepted && message === prompt) {
				accepted = true;
				return yes();
			}
			return nativeConfirm.apply(this, arguments);
		};
		try { return Promise.resolve(frm.savesubmit()); }
		finally { frappe.confirm = nativeConfirm; }
	}

	async function saveAndSubmit(frm) {
		if (!canSaveAndSubmit(frm)) return false;
		if (frm.doc.__islocal || frm.is_dirty?.()) {
			// Native save can leave its promise pending after a mandatory-field
			// failure. Check first, then verify persistence before submitting.
			if (typeof frappe.ui?.form?.check_mandatory === "function" &&
				!frappe.ui.form.check_mandatory(frm)) return false;
			await frm.save("Save");
			if (typeof frappe.after_ajax === "function") await frappe.after_ajax();
			if (frm.doc.__islocal || frm.is_dirty?.() || Number(frm.doc.docstatus) !== 0) return false;
		}
		return submitWithoutConfirmation(frm);
	}

	function decorateAction(button, { label, key = "", icon = "" } = {}) {
		if (icon) {
			const iconNode = document.createElement("span");
			iconNode.className = "bnd-bill-action-icon";
			iconNode.innerHTML = frappe.utils.icon(icon, "sm");
			iconNode.setAttribute("aria-hidden", "true");
			button.append(iconNode);
		}
		const labelNode = document.createElement("span");
		labelNode.className = "bnd-bill-action-label";
		labelNode.textContent = label;
		button.append(labelNode);
		if (key) {
			const keyNode = document.createElement("kbd");
			keyNode.textContent = key;
			button.append(keyNode);
			button.setAttribute("aria-keyshortcuts", key);
		}
		return button;
	}

	api.document_actions = { actionState, canSaveAndSubmit, saveAndSubmit, submitWithoutConfirmation, decorateAction, documentState, permitted };
})();
