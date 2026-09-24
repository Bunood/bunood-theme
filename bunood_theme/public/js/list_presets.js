/* global frappe, __ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};

	function localToday() {
		if (frappe.datetime?.get_today) return frappe.datetime.get_today();
		const now = new Date();
		const pad = value => String(value).padStart(2, "0");
		return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	}

	function addDays(date, days) {
		if (frappe.datetime?.add_days) return frappe.datetime.add_days(date, days);
		const value = new Date(`${date}T12:00:00`);
		value.setDate(value.getDate() + days);
		return value.toISOString().slice(0, 10);
	}

	function presetsFor(doctype, today = localToday()) {
		const monthStart = `${today.slice(0, 8)}01`;
		if (doctype === "Sales Invoice") {
			return [
				{ key: "draft", label: "Draft", tone: "neutral", filters: [["docstatus", "=", 0]] },
				{ key: "unpaid", label: "Unpaid", tone: "info", filters: [["docstatus", "=", 1], ["status", "in", ["Unpaid", "Unpaid and Discounted"]]] },
				{ key: "partially_paid", label: "Partially paid", tone: "warning", filters: [["docstatus", "=", 1], ["status", "in", ["Partly Paid", "Partly Paid and Discounted"]]] },
				{ key: "overdue", label: "Overdue", tone: "danger", filters: [["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", today]] },
				{ key: "paid", label: "Paid", tone: "success", filters: [["docstatus", "=", 1], ["status", "=", "Paid"]] },
				{ key: "this_month", label: "This month", tone: "accent", filters: [["posting_date", "between", [monthStart, today]]] },
			];
		}
		if (doctype === "Quotation") {
			return [
				{ key: "draft", label: "Draft", tone: "neutral", filters: [["docstatus", "=", 0]] },
				{ key: "awaiting_response", label: "Awaiting response", tone: "info", filters: [["docstatus", "=", 1], ["status", "=", "Open"]] },
				{ key: "expiring_soon", label: "Expiring soon", tone: "warning", filters: [["docstatus", "=", 1], ["status", "in", ["Open", "Replied"]], ["valid_till", "between", [today, addDays(today, 7)]]] },
				{ key: "converted", label: "Converted", tone: "success", filters: [["docstatus", "=", 1], ["status", "in", ["Partially Ordered", "Ordered"]]] },
				{ key: "lost", label: "Lost", tone: "danger", filters: [["docstatus", "=", 1], ["status", "=", "Lost"]] },
			];
		}
		return [];
	}

	function normalizedFilters(doctype, preset) {
		return (preset?.filters || []).map(filter => [doctype, ...filter]);
	}

	function comparable(value) {
		return JSON.stringify(value, (_key, item) => typeof item === "number" ? String(item) : item);
	}

	function containsFilters(actual, expected) {
		const rows = (actual || []).map(filter => filter.length === 3 ? ["", ...filter] : filter);
		return expected.every(wanted => rows.some(filter =>
			filter[1] === wanted[1] &&
			String(filter[2]) === String(wanted[2]) &&
			comparable(filter[3]) === comparable(wanted[3])
		));
	}

	function activeKey(listview, presets = presetsFor(listview?.doctype)) {
		const actual = listview?.filter_area?.get?.() || [];
		if (!actual.length) return "all";
		const match = presets.find(preset => containsFilters(actual, normalizedFilters(listview.doctype, preset)));
		return match?.key || "";
	}

	async function applyPreset(listview, preset) {
		if (!listview?.filter_area) return [];
		const filters = normalizedFilters(listview.doctype, preset);
		await listview.filter_area.clear(false);
		if (filters.length) await listview.filter_area.set(filters);
		await listview.refresh();
		return filters;
	}

	function mount(listview) {
		const presets = presetsFor(listview?.doctype);
		const pageForm = listview?.page?.page_form?.[0] || listview?.page?.page_form;
		if (!presets.length || !pageForm?.parentElement || typeof document === "undefined") return null;

		let nav = pageForm.parentElement.querySelector(`:scope > .bnd-list-presets[data-doctype="${listview.doctype}"]`);
		if (!nav) {
			nav = document.createElement("nav");
			nav.className = "bnd-list-presets";
			nav.dataset.doctype = listview.doctype;
			nav.setAttribute("aria-label", __("Quick filters"));
			pageForm.before(nav);
		}

		nav.replaceChildren();
		const label = document.createElement("span");
		label.className = "bnd-list-presets-label";
		label.textContent = __("Quick filters");
		nav.appendChild(label);

		const current = activeKey(listview, presets);
		for (const preset of [{ key: "all", label: "All", tone: "neutral", filters: [] }, ...presets]) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `bnd-list-preset is-${preset.tone}`;
			button.dataset.presetKey = preset.key;
			button.textContent = __(preset.label);
			button.setAttribute("aria-pressed", String(current === preset.key));
			button.addEventListener("click", async () => {
				nav.setAttribute("aria-busy", "true");
				for (const item of nav.querySelectorAll("button")) item.disabled = true;
				try {
					await applyPreset(listview, preset);
				} finally {
					nav.removeAttribute("aria-busy");
					for (const item of nav.querySelectorAll("button")) item.disabled = false;
				}
			});
			nav.appendChild(button);
		}
		return nav;
	}

	function register(settings, doctype) {
		if (!settings || settings.__bnd_list_presets) return;
		const nativeOnload = settings.onload;
		const nativeBeforeRender = settings.before_render;
		let current;
		settings.onload = function (listview) {
			const result = nativeOnload?.call(this, listview);
			current = listview;
			mount(listview);
			return result;
		};
		settings.before_render = function () {
			const result = nativeBeforeRender?.apply(this, arguments);
			if (current?.doctype === doctype) mount(current);
			return result;
		};
		settings.__bnd_list_presets = true;
	}

	api.list_presets = { activeKey, applyPreset, containsFilters, mount, normalizedFilters, presetsFor, register };
})();
