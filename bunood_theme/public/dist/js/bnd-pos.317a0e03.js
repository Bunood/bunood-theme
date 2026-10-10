// Copyright (c) 2026, Bunood and contributors
// The Bunood counter ("المنصة"): bill and number pad on the inline-start side,
// catalogue on the other, payment opening beside the bill. Every posting
// operation still delegates to ERPNext through bunood_theme.pos — this file
// only collects intent (lines, quantities, tenders) and shows the server's
// answer. Approved design: canvas FoSizh8R1SDnEtaUhdJbgK, page «final».
/* eslint-env browser */
/* global frappe, __, format_currency, format_number */

(function () {
	"use strict";

	const METHOD = "bunood_theme.pos.";
	const PAGE_SIZE = 40;
	const WEIGHED_UOM = /^(kg|kgs|kilo|kilogram|كجم|كغ|كيلو|كيلوغرام|كيلوجرام)$/i;
	const PREFS_KEY = "bnd_pos_prefs";
	const CAT_HUES = 7;

	// Constant Lucide strokes — never built from data.
	const ICONS = {
		scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>',
		user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
		pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
		keyboard: '<path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
		settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
		exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
		printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
		undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
		alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
		monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
		store: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>',
	};

	function h(tag, props, ...kids) {
		const node = document.createElement(tag);
		for (const [key, value] of Object.entries(props || {})) {
			if (value === undefined || value === null || value === false) continue;
			if (key === "class") node.className = value;
			else if (key === "text") node.textContent = value;
			else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
			else if (key === "hue") node.style.setProperty("--bnd-pos-hue", value);
			else if (value === true) node.setAttribute(key, "");
			else node.setAttribute(key, String(value));
		}
		for (const kid of kids.flat(Infinity)) {
			if (kid === undefined || kid === null || kid === false) continue;
			node.append(kid instanceof Node ? kid : String(kid));
		}
		return node;
	}

	// replaceChildren() writes a null as the text "null"; drop empty slots first.
	function fill(node, ...kids) {
		node.replaceChildren(...kids.flat(Infinity).filter((kid) => kid !== undefined && kid !== null && kid !== false));
		return node;
	}

	function svg(name, size) {
		const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
		const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
		return document.importNode(parsed.documentElement, true);
	}

	// A number that must keep its digit order inside Arabic text.
	function ltr(text, className) {
		return h("bdi", { dir: "ltr", class: className || null }, text);
	}

	// Unit names ERPNext ships in English; Frappe's global Arabic for "Nos" reads "لا".
	function unitLabel(uom) {
		const labels = {
			Nos: __("Nos", null, "Bunood POS unit"),
			Unit: __("Unit", null, "Bunood POS unit"),
			Kg: __("Kg", null, "Bunood POS unit"),
			Gram: __("Gram", null, "Bunood POS unit"),
			Litre: __("Litre", null, "Bunood POS unit"),
			Box: __("Box", null, "Bunood POS unit"),
			Pair: __("Pair", null, "Bunood POS unit"),
			Set: __("Set", null, "Bunood POS unit"),
			Hour: __("Hour", null, "Bunood POS unit"),
			Meter: __("Meter", null, "Bunood POS unit"),
		};
		return labels[uom] || uom || "";
	}

	function key(label) {
		return h("kbd", { class: "bnd-pos__key", dir: "ltr" }, label);
	}

	function api(method, args, options) {
		if (navigator.onLine === false) return Promise.reject({ status: 0, message: "" });
		return frappe.call({
			method: METHOD + method,
			args: args || {},
			freeze: Boolean(options?.freeze),
			freeze_message: options?.message,
			type: options?.type,
			// The shift close and the return show the server's refusal in place.
			silent: Boolean(options?.silent),
		}).then((response) => response.message, (error) => {
			if (error && error.status === 0) window.dispatchEvent(new CustomEvent("bnd-pos-network"));
			throw error;
		});
	}

	function messageOf(error, fallback) {
		if (error?.message) return error.message;
		const server = error?._server_messages || error?.responseJSON?._server_messages;
		if (server) {
			try {
				const messages = JSON.parse(server).map((entry) => JSON.parse(entry).message).filter(Boolean);
				if (messages.length) return messages.map((text) => frappe.utils?.html2text ? frappe.utils.html2text(text) : text).join(" ");
			} catch (_parseError) { /* use fallback */ }
		}
		return fallback;
	}

	function round(value, places) {
		const factor = 10 ** (places ?? 2);
		return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
	}

	function hueFor(text) {
		let sum = 0;
		for (const char of String(text || "")) sum = (sum * 31 + char.codePointAt(0)) % 9973;
		return `var(--bnd-cat-${(sum % CAT_HUES) + 1})`;
	}

	function readPrefs() {
		try {
			return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {};
		} catch (_error) {
			return {};
		}
	}

	function writePrefs(prefs) {
		try {
			window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch (_error) { /* private window: the preference lasts this visit */ }
	}

	// A scale label: the counter's 2-digit prefix, the item's 5-digit barcode,
	// the weight in grams (5 digits) and a check digit. The prefix comes from
	// the POS Profile's settings ("" switches scale labels off).
	function parseLabel(code, scalePrefix) {
		const match = /^(\d{2})(\d{5})(\d{5})\d$/.exec(String(code || ""));
		if (!match || !scalePrefix || match[1] !== scalePrefix) return null;
		const grams = parseInt(match[3], 10);
		return grams > 0 ? { barcode: match[2], qty: grams / 1000 } : null;
	}

	// ── The device's own store, for selling through a lost connection ───────
	// IndexedDB: the catalogue a counter last downloaded ("catalog", one record
	// per user and POS Profile) and the sales kept while offline ("queue").
	const OFFLINE_DB = "bnd-pos-offline";

	function offlineDb() {
		if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable"));
		return new Promise((resolve, reject) => {
			const request = window.indexedDB.open(OFFLINE_DB, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains("catalog")) db.createObjectStore("catalog", { keyPath: "key" });
				if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	// One transaction; resolves with the request's result once the transaction commits.
	function offlineStore(name, mode, work) {
		return offlineDb().then((db) => new Promise((resolve, reject) => {
			const tx = db.transaction(name, mode);
			const request = work(tx.objectStore(name));
			tx.oncomplete = () => {
				db.close();
				resolve(request ? request.result : undefined);
			};
			tx.onerror = () => {
				db.close();
				reject(tx.error);
			};
			tx.onabort = () => {
				db.close();
				reject(tx.error);
			};
		}));
	}

	// frappe.utils.data.rounded() for each System Settings rounding method.
	function frappeRounded(num, precision, method) {
		const multiplier = 10 ** precision;
		if (method === "Commercial Rounding") {
			if (num === 0) return 0;
			return (Math.sign(num) * Math.round(Math.abs(num) * multiplier + 1e-9)) / multiplier;
		}
		if (method === "Banker's Rounding") {
			if (num === 0) return 0;
			const sign = num < 0 ? -1 : 1;
			let value = Number((Math.abs(num) * multiplier).toFixed(12));
			if (value === 0) return 0;
			const floor = Math.floor(value);
			const epsilon = 2 ** (Math.log2(value) - 52);
			value = epsilon < 0.5 && Math.abs(value - floor - 0.5) < epsilon ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
			return (sign * value) / multiplier;
		}
		// "Banker's Rounding (legacy)", Frappe's default.
		let value = Number((precision ? num * multiplier : num).toFixed(8));
		const floor = Math.floor(value);
		const decimal = value - floor;
		if (!precision && decimal === 0.5) value = floor % 2 === 0 ? floor : floor + 1;
		else value = decimal === 0.5 ? floor + 1 : Math.round(value);
		return precision ? value / multiplier : value;
	}

	// ERPNext's rounded total: to the currency's smallest fraction, or by the method.
	function roundLikeERPNext(value, rule) {
		const precision = Number(rule?.precision ?? 2);
		const method = rule?.method || "Banker's Rounding (legacy)";
		const fraction = Number(rule?.fraction || 0);
		let total = Number(value || 0);
		if (fraction) {
			const multiplier = 10 ** precision;
			const rest = frappeRounded(((total * multiplier) % (fraction * multiplier)) / multiplier, precision, method);
			total = rest > fraction / 2 ? total + fraction - rest : total - rest;
		} else {
			total = frappeRounded(total, 0, method);
		}
		return frappeRounded(total, precision, method);
	}

	// Text for a provisional receipt printed while offline: escaped, never markup.
	function escapeHtml(text) {
		return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
	}

	function render(container, page) {
		// The same Page in the counter's second window is the customer screen.
		const displayFor = new URLSearchParams(window.location.search).get("display");
		if (displayFor) {
			renderDisplay(container, page, displayFor);
			return;
		}
		fill(container);
		page?.set_title?.(__("Bunood POS", null, "Bunood POS"));

		const prefs = readPrefs();
		const state = {
			context: null,
			profile: null,
			view: "sale",
			screen: "sale",
			lines: [],
			sel: -1,
			mode: "qty",
			buf: "",
			fresh: true,
			rev: 0,
			preview: null,
			previewing: false,
			customer: "",
			customerName: "",
			customerTaxId: "",
			draft: "",
			items: [],
			itemsNext: 0,
			more: false,
			group: "",
			itemsSerial: 0,
			itemsLoading: false,
			query: "",
			mult: null,
			pi: 0,
			palette: null,
			unknown: "",
			unknownLabel: "",
			pays: [],
			psel: -1,
			payBuf: "",
			payFresh: true,
			payErr: "",
			busy: false,
			done: null,
			flash: { kind: "info", text: "" },
			overlay: null,
			held: [],
			heldOpen: false,
			receipts: [],
			receiptsMode: "shift",
			receiptsTerm: "",
			returnHint: false,
			menuOpen: false,
			opening: null,
			gateProfile: "",
			close: null,
			ret: null,
			settings: null,
			saleId: "",
		};

		const root = h("section", { class: "bnd-pos", "aria-label": __("Point of sale", null, "Bunood POS") });
		const bar = h("header", { class: "bnd-pos__bar" });
		const body = h("div", { class: "bnd-pos__body" });
		const foot = h("footer", { class: "bnd-pos__foot" });
		const live = h("div", { class: "bnd-pos__live", role: "status", "aria-live": "polite" });
		const layer = h("div", { class: "bnd-pos__layer" });
		root.append(bar, body, foot, live, layer);
		container.append(root);
		root.toggleAttribute("data-fbar", Boolean(prefs.fbar));

		// The sale layout is built once; its parts re-render in place so the
		// scan field never loses focus or caret while the cashier types.
		const omni = h("input", {
			class: "bnd-pos__omni-input",
			type: "text",
			autocomplete: "off",
			spellcheck: "false",
			inputmode: prefs.keyboard ? "search" : "none",
			placeholder: __("Scan a barcode, search by name, or type a command", null, "Bunood POS"),
			"aria-label": __("Scan, search or command", null, "Bunood POS"),
		});
		const billHead = h("div", { class: "bnd-pos__bill-head" });
		const billLines = h("div", { class: "bnd-pos__lines", role: "listbox", "aria-label": __("Sale lines", null, "Bunood POS") });
		const billTotals = h("div", { class: "bnd-pos__totals" });
		const bill = h("div", { class: "bnd-pos__bill" }, billHead, billLines, billTotals);
		const pad = h("div", { class: "bnd-pos__pad", dir: "ltr", role: "group", "aria-label": __("Number pad", null, "Bunood POS") });
		const billCol = h("section", { class: "bnd-pos__bill-col" }, bill, pad);
		const multChip = h("bdi", { class: "bnd-pos__mult", dir: "ltr", hidden: true });
		const grammar = h("span", { class: "bnd-pos__grammar" });
		const keyboardToggle = h("button", { type: "button", class: "bnd-pos__omni-kbd", "aria-pressed": String(Boolean(prefs.keyboard)), "aria-label": __("Show the device keyboard", null, "Bunood POS"), onclick: toggleKeyboard }, svg("keyboard", 18));
		const omniWrap = h("label", { class: "bnd-pos__omni" }, h("span", { class: "bnd-pos__omni-icon" }, svg("scan", 24)), multChip, omni, grammar, keyboardToggle);
		const paletteBox = h("div", { class: "bnd-pos__palette", hidden: true, role: "listbox", "aria-label": __("Suggestions", null, "Bunood POS") });
		const omniArea = h("div", { class: "bnd-pos__omni-area" }, omniWrap, paletteBox);
		const alertBox = h("div", { class: "bnd-pos__alert", hidden: true, role: "alert" });
		const groupsBar = h("div", { class: "bnd-pos__groups", role: "tablist", "aria-label": __("Item groups", null, "Bunood POS") });
		const statusLine = h("div", { class: "bnd-pos__status" });
		const grid = h("div", { class: "bnd-pos__grid" });
		const gridWrap = h("div", { class: "bnd-pos__grid-wrap" }, grid);
		const panel = h("div", { class: "bnd-pos__panel", hidden: true });
		const catalog = h("section", { class: "bnd-pos__catalog" }, omniArea, alertBox, groupsBar, statusLine, gridWrap, panel);
		const saleLayout = h("div", { class: "bnd-pos__sale" }, billCol, catalog);
		const listView = h("div", { class: "bnd-pos__list-view" });

		// The POS Profile's counter settings (the settings page); the server fills
		// every key, so a missing one means the profile has not loaded yet.
		function counter(key) {
			return state.profile?.counter?.[key];
		}
		// Supermarket mode: this device's own choice, else the profile's.
		function fbarOn() {
			return typeof prefs.fbar === "boolean" ? prefs.fbar : Boolean(counter("fbar"));
		}

		// ── Formatting ────────────────────────────────────────────────────────
		function currency() {
			return state.profile?.currency || frappe.boot?.sysdefaults?.currency || "SAR";
		}
		function money(value) {
			if (typeof format_currency === "function") return format_currency(Number(value || 0), currency(), 2);
			return `${Number(value || 0).toFixed(2)} ${currency()}`;
		}
		function num(value, places) {
			if (typeof format_number === "function") return format_number(Number(value || 0), null, places ?? 2);
			return Number(value || 0).toFixed(places ?? 2);
		}
		function qtyText(line) {
			return line.weighed ? num(line.qty, 3) : String(round(line.qty, 3));
		}

		// ── Totals: instant estimate, then ERPNext's own figures ─────────────
		function lineAmount(line) {
			return round(line.qty * line.rate * (1 - (line.discount_percentage || 0) / 100));
		}
		function totals() {
			const subtotal = round(state.lines.reduce((sum, line) => sum + lineAmount(line), 0));
			const server = state.preview && state.preview.rev === state.rev ? state.preview : null;
			if (server) {
				return {
					net: server.net_total,
					vat: server.total_taxes_and_charges,
					total: server.rounded_total || server.grand_total,
					// ERPNext rounds the payable total when the profile allows it; show the step.
					rounding: server.rounded_total ? round(server.rounded_total - server.grand_total) : 0,
					exact: true,
				};
			}
			const rounded = (estimate) => {
				const rule = state.profile?.rounding;
				if (!offline.on || !rule || rule.disabled) return estimate;
				const total = roundLikeERPNext(estimate.total, rule);
				return { ...estimate, total, rounding: round(total - estimate.total) };
			};
			const taxes = (state.profile?.taxes || []).filter((row) => row.charge_type === "On Net Total");
			const rate = taxes.reduce((sum, row) => sum + Number(row.rate || 0), 0) / 100;
			const included = taxes.length > 0 && taxes.every((row) => row.included);
			if (included) {
				const net = round(subtotal / (1 + rate));
				return rounded({ net, vat: round(subtotal - net), total: subtotal, rounding: 0, exact: false });
			}
			const vat = round(subtotal * rate);
			return rounded({ net: subtotal, vat, total: round(subtotal + vat), rounding: 0, exact: false });
		}

		// ── Flash and focus ──────────────────────────────────────────────────
		function flash(kind, text) {
			state.flash = { kind, text };
			live.textContent = text;
			renderStatus();
		}
		function focusOmni() {
			if (state.view !== "sale" || state.overlay || state.menuOpen) return;
			if (document.activeElement !== omni) omni.focus({ preventScroll: true });
		}
		function setQuery(value) {
			state.query = value;
			state.pi = 0;
			if (omni.value !== value) omni.value = value;
			queryChanged();
		}

		// ── Context and the shift gate ───────────────────────────────────────
		async function initialize(profileName) {
			fill(body, h("div", { class: "bnd-pos__loading" }, __("Preparing the counter…", null, "Bunood POS")));
			try {
				state.context = await api("get_context", { pos_profile: profileName || undefined }, { type: "GET" });
			} catch (error) {
				fill(body, failure(__("The counter could not be prepared.", null, "Bunood POS"), messageOf(error, "")));
				return;
			}
			state.profile = state.context.profile;
			state.gateProfile = state.profile?.name || "";
			root.toggleAttribute("data-fbar", fbarOn());
			root.setAttribute("data-tiles", counter("tiles") || "m");
			connectDisplay();
			offline.on = navigator.onLine === false;
			root.toggleAttribute("data-offline", offline.on);
			loadCatalog().then(() => { renderOfflineStrip(); refreshCatalog(); });
			loadQueue().then(syncQueue);
			navigator.storage?.persist?.().catch?.(() => {});
			clearInterval(offline.refresh);
			offline.refresh = setInterval(refreshCatalog, 30 * 60 * 1000);
			resetSale({ silent: true });
			renderBar();
			if (!state.profile) {
				fill(body, failure(__("No POS Profile is available to you.", null, "Bunood POS"), __("Ask the system manager to create a POS Profile and assign it to your user.", null, "Bunood POS")));
				return;
			}
			if (!state.context.opening_entry) {
				renderGate();
				return;
			}
			showSale();
			loadItems(false);
			refreshHeld();
		}

		function failure(title, detail) {
			return h("div", { class: "bnd-pos__failure", role: "alert" }, svg("alert", 22), h("strong", null, title), detail ? h("span", null, detail) : null);
		}

		const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];
		function renderGate() {
			state.view = "gate";
			pushDisplay();
			const ctx = state.context;
			renderBar();
			renderFoot();
			const stale = ctx.stale_opening_entry;
			if (stale) {
				fill(body, h("div", { class: "bnd-pos__gate" },
					h("div", { class: "bnd-pos__gate-card" },
						h("h2", null, __("This shift is out of date", null, "Bunood POS")),
						h("p", null, __("Review and close the outdated shift before opening today's counter.", null, "Bunood POS")),
						h("p", { class: "bnd-pos__muted" }, `${__("Reference", null, "Bunood POS")}: `, ltr(stale.name)),
						h("button", { type: "button", class: "bnd-pos__primary", onclick: closeShift }, __("Review and close shift", null, "Bunood POS")))));
				return;
			}
			const profile = state.profile;
			const cashMethod = (profile.payments || []).find((row) => row.type === "Cash") || (profile.payments || [])[0];
			state.opening = state.opening || { counts: DENOMINATIONS.map(() => 0), others: {} };
			const counts = state.opening.counts;
			const cashTotal = round(DENOMINATIONS.reduce((sum, value, index) => sum + value * counts[index], 0));
			const notes = DENOMINATIONS.map((value, index) => h("div", { class: "bnd-pos__note", "data-filled": counts[index] ? "1" : null },
				h("strong", { class: "bnd-pos__note-value" }, ltr(String(value))),
				h("div", { class: "bnd-pos__stepper", dir: "ltr" },
					h("button", { type: "button", "aria-label": __("Fewer {0}", [value]), onclick: () => { counts[index] = Math.max(0, counts[index] - 1); renderGate(); } }, "−"),
					h("span", null, String(counts[index])),
					h("button", { type: "button", "aria-label": __("More {0}", [value]), onclick: () => { counts[index] += 1; renderGate(); } }, "+")),
				h("span", { class: "bnd-pos__muted" }, ltr(num(value * counts[index], 2)))));
			const profiles = (ctx.profiles || []);
			const companies = new Set(profiles.map((row) => row.company));
			const chooser = profiles.length > 1 ? h("div", { class: "bnd-pos__gate-profiles" },
				h("strong", null, __("Point of sale", null, "Bunood POS")),
				profiles.map((row, index) => [
					companies.size > 1 && row.company !== profiles[index - 1]?.company ? h("span", { class: "bnd-pos__gate-company" }, row.company) : null,
					h("button", {
						type: "button",
						class: "bnd-pos__choice",
						"aria-pressed": String(row.name === profile.name),
						onclick: () => { state.opening = null; initialize(row.name); },
					}, h("strong", null, row.name), h("span", { class: "bnd-pos__muted" }, [row.branch ? __(row.branch) : "", row.warehouse_name || row.warehouse || ""].filter(Boolean).join(" · "))),
				])) : null;
			const canOpen = ctx.capabilities?.can_open_shift;
			fill(body, h("div", { class: "bnd-pos__gate" },
				h("div", { class: "bnd-pos__gate-card bnd-pos__gate-card--wide" },
					h("div", { class: "bnd-pos__gate-head" },
						h("h2", null, __("Open the shift", null, "Bunood POS")),
						h("span", { class: "bnd-pos__muted" }, profile.name, " · ", frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(frappe.datetime.get_today()) : "")),
					h("div", { class: "bnd-pos__gate-grid" },
						h("div", { class: "bnd-pos__gate-count" },
							h("strong", null, cashMethod ? __("Count the opening cash in the drawer", null, "Bunood POS") : __("Opening balances", null, "Bunood POS")),
							h("div", { class: "bnd-pos__notes" }, notes),
							h("div", { class: "bnd-pos__gate-total" }, h("span", null, __("Total", null, "Bunood POS")), h("strong", null, ltr(money(cashTotal))))),
						h("div", { class: "bnd-pos__gate-side" },
							chooser,
							storeFacts(profile),
							h("p", { class: "bnd-pos__muted" }, __("The items' quantities, and the stock of every sale on this shift, come from this warehouse.", null, "Bunood POS")),
							canOpen
								? h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", onclick: () => openShift(cashMethod, cashTotal) }, __("Open the shift and start selling", null, "Bunood POS"))
								: h("p", { class: "bnd-pos__warn" }, __("You do not have permission to open a POS shift.", null, "Bunood POS"))))))
			);
		}

		function storeFacts(profile) {
			const store = profile.store || {};
			const fact = (label, value) => (value ? h("div", null, h("dt", null, label), h("dd", null, value)) : null);
			return h("dl", { class: "bnd-pos__facts" },
				fact(__("Company", null, "Bunood POS"), store.company),
				fact(__("Branch", null, "Bunood POS"), store.branch ? __(store.branch) : ""),
				fact(__("Warehouse", null, "Bunood POS"), store.warehouse_name),
				fact(__("Price list", null, "Bunood POS"), profile.selling_price_list ? __(profile.selling_price_list) : ""));
		}

		async function openShift(cashMethod, cashTotal) {
			const balances = (state.profile.payments || []).map((row) => ({
				mode_of_payment: row.mode_of_payment,
				opening_amount: cashMethod && row.mode_of_payment === cashMethod.mode_of_payment ? cashTotal : 0,
			}));
			try {
				await api("open_shift", { pos_profile: state.profile.name, balances: JSON.stringify(balances) }, { freeze: true, message: __("Opening the counter…", null, "Bunood POS") });
				state.opening = null;
				await initialize(state.profile.name);
			} catch (error) {
				frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The shift could not be opened.", null, "Bunood POS")), indicator: "red" });
			}
		}

		// ── Closing the shift: count first, then see what was expected ──────
		// The count step never receives the expected figures; the server keeps
		// the first count, and the closing record says so if a recount differs.
		function closeReasons() {
			return [__("Wrong change given", null, "Bunood POS"), __("Cash taken out without a record", null, "Bunood POS"), __("Counting mistake", null, "Bunood POS")];
		}
		// Arabic-Indic digits typed on a device keyboard read as Latin digits; a
		// thousands separator is dropped and only the first decimal point counts.
		function latinDigits(text) {
			const plain = String(text || "")
				.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
				.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
				.replace(/\u066B/g, ".")
				.replace(/[^0-9.]/g, "");
			const dot = plain.indexOf(".");
			return dot < 0 ? plain : plain.slice(0, dot + 1) + plain.slice(dot + 1).replace(/\./g, "");
		}
		// Re-rendering a view keeps the field the cashier is typing in.
		function keepField(render) {
			const active = document.activeElement;
			const name = active && listView.contains(active) ? active.getAttribute("name") : null;
			const caret = name ? active.selectionStart : null;
			render();
			if (!name) return;
			const next = Array.from(listView.querySelectorAll("[name]")).find((node) => node.getAttribute("name") === name);
			if (!next) return;
			next.focus({ preventScroll: true });
			if (caret !== null) next.setSelectionRange?.(caret, caret);
		}

		function closeShift() {
			const opening = state.context?.opening_entry || state.context?.stale_opening_entry;
			if (!opening || needsConnection()) return;
			// The sales kept on this device belong to this shift's money: send them, and
			// complete the ones held for review, first. An out-of-date shift cannot send
			// them (ERPNext takes POS sales into today's shift only): they post into the next.
			const waiting = queueFor(opening.pos_profile).length;
			if (waiting && state.context?.opening_entry) {
				flash("err", __("Send or resolve the sales kept on this device first. Waiting: {0}", [waiting]));
				syncQueue();
				return;
			}
			if (waiting && !state.context?.closeConfirmed) {
				frappe.confirm(__("Sales kept on this device will post into the next shift. Waiting: {0}", [waiting]), () => {
					state.context.closeConfirmed = true;
					closeShift();
				});
				return;
			}
			state.heldOpen = false;
			renderHeldPopover();
			state.menuOpen = false;
			const close = { step: "count", ctx: null, counts: DENOMINATIONS.map(() => 0), coins: "", others: {}, result: null, reason: -1, other: "", error: "", busy: false, closed: null, profile: opening.pos_profile };
			state.close = close;
			state.view = "close";
			fill(body, listView);
			renderBar();
			renderFoot();
			renderCloseView();
			api("close_shift_context", { pos_profile: opening.pos_profile }, { type: "GET", silent: true })
				.then((ctx) => { if (state.close === close) { close.ctx = ctx; renderCloseView(); } })
				.catch((error) => { if (state.close === close) { close.error = messageOf(error, __("The shift could not be read.", null, "Bunood POS")); renderCloseView(); } });
		}

		function leaveClose() {
			state.close = null;
			if (state.context?.opening_entry) showSale();
			else renderGate();
		}

		function closeCash() {
			return (state.close?.ctx?.methods || []).find((row) => row.type === "Cash") || null;
		}

		// Notes by count, then loose coins as one amount (halalas included).
		function countedCash() {
			const close = state.close;
			const notes = DENOMINATIONS.reduce((sum, value, index) => sum + value * close.counts[index], 0);
			return round(notes + Number(latinDigits(close.coins) || 0));
		}

		// A card terminal can settle below zero (refunds over sales): a leading minus counts.
		function settled(text) {
			const value = Number(latinDigits(text) || 0);
			return /^\s*[-\u2212]/.test(String(text || "")) ? -value : value;
		}

		function countedRows() {
			const close = state.close;
			const cash = closeCash();
			return (close.ctx?.methods || []).map((row) => ({
				mode_of_payment: row.mode_of_payment,
				amount: cash && row.mode_of_payment === cash.mode_of_payment ? countedCash() : round(settled(close.others[row.mode_of_payment])),
			}));
		}

		function closeReason() {
			const close = state.close;
			if (close.reason === -2) return close.other.trim();
			return close.reason >= 0 ? closeReasons()[close.reason] : "";
		}

		function closeHasDifference() {
			const threshold = Number(counter("reason_threshold") || 0);
			return (state.close?.result?.rows || []).some((row) => {
				const difference = Math.abs(Number(row.difference || 0));
				return difference >= 0.005 && difference > threshold;
			});
		}

		// Only today's shift: an out-of-date one cannot complete a held sale (the server agrees).
		function heldBlocksClose() {
			return counter("held_on_close") === "block" && Boolean(state.context?.opening_entry) && Number(state.close?.ctx?.held || 0) > 0;
		}

		async function previewClose() {
			const close = state.close;
			if (!close || close.busy) return;
			close.busy = true;
			close.error = "";
			renderCloseView();
			try {
				close.result = await api("preview_close", { pos_profile: close.profile, counted: JSON.stringify(countedRows()) }, { silent: true });
				close.step = "result";
			} catch (error) {
				close.error = messageOf(error, __("The count could not be checked.", null, "Bunood POS"));
			} finally {
				close.busy = false;
				renderCloseView();
			}
		}

		async function submitClose() {
			const close = state.close;
			if (!close || close.busy) return;
			if (closeHasDifference() && !closeReason()) {
				close.error = __("Choose the reason for the difference first.", null, "Bunood POS");
				renderCloseView();
				return;
			}
			close.busy = true;
			close.error = "";
			renderCloseView();
			try {
				close.closed = await api("close_shift", { pos_profile: close.profile, counted: JSON.stringify(countedRows()), reason: closeReason() }, { silent: true, freeze: true, message: __("Closing the shift…", null, "Bunood POS") });
				close.step = "closed";
				state.context.opening_entry = null;
				state.context.stale_opening_entry = null;
				renderBar();
				pushDisplay(true);
				flash("ok", __("Shift closed: {0}", [close.closed.name]));
				openPrintView("POS Closing Entry", close.closed.name, "Standard");
			} catch (error) {
				close.error = messageOf(error, __("The shift was not closed.", null, "Bunood POS"));
			} finally {
				close.busy = false;
				renderCloseView();
			}
		}

		function renderCloseView() {
			const close = state.close;
			if (!close || state.view !== "close") return;
			const opening = state.context?.opening_entry || state.context?.stale_opening_entry;
			const since = opening?.period_start_date && frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(opening.period_start_date) : "";
			const steps = [["count", __("Count the drawer", null, "Bunood POS")], ["result", __("Result", null, "Bunood POS")], ["closed", __("Closed", null, "Bunood POS")]];
			const head = h("div", { class: "bnd-pos__list-head" },
				h("h2", null, __("Close the shift", null, "Bunood POS")),
				h("span", { class: "bnd-pos__muted" }, close.profile, since ? " · " : null, since ? ltr(since) : null),
				h("ol", { class: "bnd-pos__steps" }, steps.map(([id, label], index) => h("li", { "aria-current": close.step === id ? "step" : null }, ltr(String(index + 1)), label))),
				h("span", { class: "bnd-pos__spacer" }),
				close.step !== "closed" ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: leaveClose }, state.context?.opening_entry ? __("Back to the sale", null, "Bunood POS") : __("Back", null, "Bunood POS"), " ", key("Esc")) : null);
			const error = close.error ? h("div", { class: "bnd-pos__pay-error", role: "alert" }, svg("alert", 18), close.error) : null;
			let main = null;
			if (!close.ctx) main = close.error ? null : h("p", { class: "bnd-pos__muted" }, __("Loading the shift…", null, "Bunood POS"));
			else if (close.step === "count") main = renderCloseCount();
			else if (close.step === "result") main = renderCloseResult();
			else main = renderClosed();
			keepField(() => fill(listView, h("div", { class: "bnd-pos__list bnd-pos__list--wide" }, head, error, main)));
		}

		function renderCloseCount() {
			const close = state.close;
			const cash = closeCash();
			const notes = DENOMINATIONS.map((value, index) => h("div", { class: "bnd-pos__note", "data-filled": close.counts[index] ? "1" : null },
				h("strong", { class: "bnd-pos__note-value" }, ltr(String(value))),
				h("div", { class: "bnd-pos__stepper", dir: "ltr" },
					h("button", { type: "button", "aria-label": __("Fewer {0}", [value]), onclick: () => { close.counts[index] = Math.max(0, close.counts[index] - 1); renderCloseView(); } }, "−"),
					h("span", null, String(close.counts[index])),
					h("button", { type: "button", "aria-label": __("More {0}", [value]), onclick: () => { close.counts[index] += 1; renderCloseView(); } }, "+")),
				h("span", { class: "bnd-pos__muted" }, ltr(num(value * close.counts[index], 2)))));
			const others = (close.ctx.methods || []).filter((row) => !cash || row.mode_of_payment !== cash.mode_of_payment);
			const held = Number(close.ctx.held || 0);
			return h("div", { class: "bnd-pos__split" },
				h("section", { class: "bnd-pos__split-main" },
					held ? h("div", { class: "bnd-pos__notice", "data-tone": heldBlocksClose() ? "bad" : "warn" }, svg("alert", 18),
						h("span", null, __("Held sales: {0}", [held]), " — ", heldBlocksClose()
							? __("complete them before closing the shift.", null, "Bunood POS")
							: __("they stay held for the next shift on this point of sale.", null, "Bunood POS")),
						state.context?.opening_entry ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: () => { state.close = null; showList("held"); } }, __("Open", null, "Bunood POS")) : null) : null,
					cash ? h("div", { class: "bnd-pos__sheet" },
						h("div", { class: "bnd-pos__gate-head" }, h("strong", null, __("Count the cash in the drawer", null, "Bunood POS")), h("span", { class: "bnd-pos__muted" }, __("The expected amount appears after the count, so the count stays honest.", null, "Bunood POS"))),
						h("div", { class: "bnd-pos__notes" }, notes),
						h("label", { class: "bnd-pos__field bnd-pos__field--inline" },
							h("span", null, __("Loose coins and other cash", null, "Bunood POS")),
							h("input", { type: "text", name: "close-coins", inputmode: "decimal", dir: "ltr", autocomplete: "off", value: close.coins, oninput: (event) => { close.coins = event.target.value; renderCloseView(); } })),
						h("div", { class: "bnd-pos__gate-total" }, h("span", null, __("Counted cash", null, "Bunood POS")), h("strong", null, ltr(money(countedCash()))))) : null),
				h("aside", { class: "bnd-pos__split-side" },
					others.length ? h("div", { class: "bnd-pos__sheet" },
						h("strong", null, __("Cards and other methods", null, "Bunood POS")),
						others.map((row) => h("label", { class: "bnd-pos__field" },
							h("span", null, __(row.mode_of_payment), row.type === "Bank" ? h("span", { class: "bnd-pos__muted" }, " — ", __("the terminal's settlement total", null, "Bunood POS")) : null),
							h("input", {
								type: "text",
								name: `close-${row.mode_of_payment}`,
								inputmode: "decimal",
								dir: "ltr",
								autocomplete: "off",
								value: close.others[row.mode_of_payment] ?? "",
								oninput: (event) => { close.others[row.mode_of_payment] = event.target.value; },
							})))) : null,
					h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", disabled: close.busy, onclick: previewClose }, __("Done counting — show the result", null, "Bunood POS"))));
		}

		function renderCloseResult() {
			const close = state.close;
			const result = close.result;
			const cash = closeCash();
			const cashRow = (result.rows || []).find((row) => cash && row.mode_of_payment === cash.mode_of_payment);
			const chip = (row) => {
				const diff = round(Number(row.difference || 0));
				const tone = Math.abs(diff) < 0.005 ? "good" : diff < 0 ? "bad" : "over";
				const label = tone === "good" ? __("Matches", null, "Bunood POS") : tone === "bad" ? __("Short", null, "Bunood POS") : __("Over", null, "Bunood POS");
				return h("span", { class: "bnd-pos__diff", "data-tone": tone }, label, tone === "good" ? null : ltr(money(Math.abs(diff))));
			};
			const table = h("div", { class: "bnd-pos__table", role: "table", "aria-label": __("Count result", null, "Bunood POS") },
				h("div", { class: "bnd-pos__tr bnd-pos__tr--head bnd-pos__tr--close", role: "row" }, [__("Payment method", null, "Bunood POS"), __("Expected", null, "Bunood POS"), __("Counted", null, "Bunood POS"), __("Difference", null, "Bunood POS")].map((text, index) => h("span", { role: "columnheader", class: index ? "bnd-pos__num" : null }, text))),
				(result.rows || []).map((row) => h("div", { class: "bnd-pos__tr bnd-pos__tr--close", role: "row" },
					h("span", { role: "cell", class: "bnd-pos__person-text" }, h("strong", null, __(row.mode_of_payment)),
						h("span", null, cashRow === row ? __("Opening float + cash sales − cash refunds", null, "Bunood POS") : row.type === "Bank" ? __("Compared with the terminal's settlement", null, "Bunood POS") : __("Payments taken this shift", null, "Bunood POS"))),
					h("span", { role: "cell", class: "bnd-pos__num" }, ltr(money(row.expected_amount))),
					h("span", { role: "cell", class: "bnd-pos__num" }, ltr(money(row.closing_amount))),
					h("span", { role: "cell", class: "bnd-pos__num" }, chip(row)))));
			const stats = [
				[__("Invoices", null, "Bunood POS"), ltr(String(result.invoices || 0))],
				[__("Returns", null, "Bunood POS"), ltr(String(result.returns || 0))],
				[__("Returns total", null, "Bunood POS"), ltr(money(Math.abs(result.returns_total || 0)))],
				[__("Net sales including VAT", null, "Bunood POS"), ltr(money(result.grand_total))],
				[__("VAT", null, "Bunood POS"), ltr(money(result.total_taxes_and_charges))],
				[__("Pieces", null, "Bunood POS"), ltr(num(result.total_quantity, 2))],
			];
			const differs = closeHasDifference();
			const reasons = closeReasons();
			const blocked = close.busy || (differs && !closeReason()) || heldBlocksClose();
			return h("div", { class: "bnd-pos__split" },
				h("section", { class: "bnd-pos__split-main" },
					table,
					h("div", { class: "bnd-pos__stats bnd-pos__stats--report" }, stats.map(([label, value]) => h("div", null, h("span", null, label), h("strong", null, value))))),
				h("aside", { class: "bnd-pos__split-side" },
					differs ? h("div", { class: "bnd-pos__sheet", "data-tone": "bad" },
						h("strong", null, __("The reason for the difference is required", null, "Bunood POS")),
						h("div", { class: "bnd-pos__reasons", role: "radiogroup" },
							reasons.map((label, index) => h("button", { type: "button", class: "bnd-pos__reason", role: "radio", "aria-checked": String(close.reason === index), onclick: () => { close.reason = index; close.error = ""; renderCloseView(); } }, label)),
							h("button", { type: "button", class: "bnd-pos__reason", role: "radio", "aria-checked": String(close.reason === -2), onclick: () => { close.reason = -2; renderCloseView(); listView.querySelector(".bnd-pos__text")?.focus(); } }, __("Other", null, "Bunood POS"))),
						close.reason === -2 ? h("input", {
							type: "text",
							name: "close-other",
							class: "bnd-pos__text",
							maxlength: 140,
							value: close.other,
							placeholder: __("Write the reason", null, "Bunood POS"),
							oninput: (event) => {
								close.other = event.target.value;
								const go = listView.querySelector(".bnd-pos__close-go");
								if (go) go.disabled = close.busy || !close.other.trim();
							},
						}) : null) : null,
					cashRow ? h("div", { class: "bnd-pos__sheet" },
						h("strong", null, __("Cash in the drawer", null, "Bunood POS")),
						h("div", { class: "bnd-pos__trow" }, h("span", null, __("Opening float", null, "Bunood POS")), ltr(money(cashRow.opening_amount))),
						h("div", { class: "bnd-pos__trow" }, h("span", null, __("To hand over (counted cash − opening float)", null, "Bunood POS")), ltr(money(Math.max(0, round(cashRow.closing_amount - cashRow.opening_amount)))))) : null,
					h("div", { class: "bnd-pos__split-actions" },
						h("button", { type: "button", class: "bnd-pos__ghost bnd-pos__ghost--tall", disabled: close.busy, onclick: () => { close.step = "count"; close.error = ""; renderCloseView(); } }, __("Back to the count", null, "Bunood POS")),
						h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall bnd-pos__close-go", disabled: blocked, onclick: submitClose }, __("Close the shift and print the report", null, "Bunood POS")),
						h("span", { class: "bnd-pos__muted" }, __("ERPNext's POS Closing Entry is submitted with the counted amounts and the differences. This point of sale cannot sell until a new shift is opened.", null, "Bunood POS")))));
		}

		function renderClosed() {
			const done = state.close.closed;
			return h("div", { class: "bnd-pos__gate" }, h("div", { class: "bnd-pos__gate-card bnd-pos__closed" },
				h("span", { class: "bnd-pos__done-mark" }, svg("check", 30)),
				h("h2", null, __("The shift is closed", null, "Bunood POS")),
				h("p", null, __("Closing entry", null, "Bunood POS"), ": ", ltr(done.name)),
				done.status === "Queued" ? h("p", { class: "bnd-pos__muted" }, __("ERPNext is still consolidating this shift's invoices in the background.", null, "Bunood POS")) : null,
				h("div", { class: "bnd-pos__card-actions" },
					h("button", { type: "button", class: "bnd-pos__ghost bnd-pos__ghost--tall", onclick: () => openPrintView("POS Closing Entry", done.name, "Standard") }, svg("printer", 18), __("Print the closing report", null, "Bunood POS")),
					h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", onclick: () => { state.close = null; state.opening = null; initialize(state.profile?.name); } }, __("Open a new shift", null, "Bunood POS")))));
		}

		// ── Catalogue ────────────────────────────────────────────────────────
		function textQuery() {
			const q = state.query.trim();
			return q && !/^[/@*=+-]|^\d+(\.\d+)?\*/.test(q) && !/^\d{4,}$/.test(q) ? q : "";
		}

		let itemsTimer = 0;
		function scheduleItems() {
			clearTimeout(itemsTimer);
			itemsTimer = setTimeout(() => loadItems(false), 220);
		}

		async function loadItems(append) {
			if (!state.profile || !state.context?.opening_entry) return;
			if (offline.on) {
				state.items = offlineList();
				state.more = false;
				state.itemsLoading = false;
				renderGrid();
				renderStatus();
				return;
			}
			const serial = ++state.itemsSerial;
			state.itemsLoading = true;
			renderStatus();
			try {
				const result = await api("get_items", {
					pos_profile: state.profile.name,
					start: append ? state.itemsNext : 0,
					page_length: PAGE_SIZE,
					item_group: state.group || undefined,
					search_term: textQuery(),
				}, { type: "GET" });
				if (serial !== state.itemsSerial) return;
				const rows = result?.items || [];
				state.items = append ? state.items.concat(rows) : rows;
				state.itemsNext = Number(result?.next_start ?? state.items.length);
				state.more = typeof result?.more === "boolean" ? result.more : rows.length === PAGE_SIZE;
			} catch (error) {
				if (serial !== state.itemsSerial) return;
				state.items = append ? state.items : [];
				flash("err", messageOf(error, __("Items could not be loaded.", null, "Bunood POS")));
			} finally {
				if (serial === state.itemsSerial) {
					state.itemsLoading = false;
					renderGrid();
					renderStatus();
				}
			}
		}

		function weighed(item) {
			return WEIGHED_UOM.test(String(item.uom || item.stock_uom || "").trim());
		}

		function addItem(item, qty) {
			if (state.screen === "done") resetSale({ silent: true });
			if (state.screen === "pay") return;
			const amount = Number(qty) > 0 ? Number(qty) : 1;
			const isWeighed = weighed(item);
			const uom = item.uom || item.stock_uom || "";
			const lineKey = [item.item_code, uom, item.batch_no || "", item.serial_no || ""].join("::");
			const price = Number(item.price_list_rate || 0);
			let index = isWeighed || item.serial_no || counter("merge_scans") === false ? -1 : state.lines.findIndex((line) => line.key === lineKey && !line.discount_percentage && line.rate === price);
			if (index >= 0) {
				state.lines[index].qty = round(state.lines[index].qty + amount, 3);
			} else {
				state.lines.push({
					key: lineKey,
					item_code: item.item_code,
					item_name: item.item_name || item.item_code,
					uom,
					stock_uom: item.stock_uom || uom,
					qty: round(amount, 3),
					rate: price,
					price_list_rate: price,
					discount_percentage: 0,
					batch_no: item.batch_no || "",
					serial_no: item.serial_no || "",
					weighed: isWeighed,
				});
				index = state.lines.length - 1;
			}
			state.sel = index;
			state.mode = "qty";
			state.fresh = true;
			state.buf = "";
			state.mult = null;
			state.unknown = "";
			frappe.utils?.play_sound?.("click");
			const shown = isWeighed ? `${num(amount, 3)} ${uom}` : `× ${round(amount, 3)}`;
			flash("ok", __("Added: {0} {1}", [item.item_name || item.item_code, shown]));
			cartChanged();
		}

		async function scan(raw) {
			let code = String(raw || "").trim();
			if (!code) return;
			let qty = state.mult || 1;
			const multiplied = /^(\d+(?:\.\d+)?)\*(.+)$/.exec(code);
			if (multiplied) {
				qty = parseFloat(multiplied[1]);
				code = multiplied[2].trim();
			}
			let label = parseLabel(code, counter("scale_prefix"));
			const counted = qty;
			let lookup = label ? label.barcode : code;
			if (label) qty = label.qty;
			setQuery("");
			const find = async (term) => {
				if (offline.on) return offlineFind(term);
				const result = await api("get_items", {
					pos_profile: state.profile.name, start: 0, page_length: 20, search_term: term,
				}, { type: "GET" });
				const rows = result?.items || [];
				const exact = rows.filter((row) => [row.barcode, row.item_code, row.serial_no, row.batch_no].includes(term));
				const hits = exact.length ? exact : (rows.length === 1 && !/^\d+$/.test(term) ? rows : []);
				// Another company's item, or another group's: linking the code again would fail.
				hits.elsewhere = !hits.length && Boolean(result?.elsewhere);
				return hits;
			};
			try {
				let hits = await find(lookup);
				if (label && !hits.length) {
					const whole = await find(code);
					if (whole.length) {
						hits = whole;
						label = null;
						lookup = code;
						qty = counted;
					}
				}
				if (hits.length === 1) {
					addItem(hits[0], qty);
				} else if (hits.length > 1) {
					state.palette = {
						title: __("This barcode belongs to more than one item", null, "Bunood POS"),
						items: hits.map((row) => ({
							title: row.item_name || row.item_code,
							sub: [row.item_code, row.uom].filter(Boolean).join(" · "),
							end: money(row.price_list_rate),
							glyph: "#",
							run: () => { state.palette = null; addItem(row, qty); renderPalette(); },
						})),
					};
					renderPalette();
				} else if (hits.elsewhere) {
					frappe.utils?.play_sound?.("error");
					flash("err", __("Not sold at this point of sale: {0}", [code]));
				} else {
					// A label links its item's 5-digit code; the label itself is read again after.
					state.unknown = lookup;
					state.unknownLabel = label ? code : "";
					state.mult = null;
					frappe.utils?.play_sound?.("error");
					flash("err", __("Unknown barcode: {0}", [code]));
					renderAlert();
					renderMult();
				}
			} catch (error) {
				flash("err", messageOf(error, __("The barcode could not be looked up.", null, "Bunood POS")));
			}
		}

		// ── Cart edits ───────────────────────────────────────────────────────
		function selected() {
			return state.lines[state.sel] || null;
		}
		function canEdit(mode) {
			if (mode === "price") return Boolean(state.profile?.allow_rate_change);
			if (mode === "disc") return Boolean(state.profile?.allow_discount_change);
			return true;
		}
		function setMode(mode) {
			if (!selected()) { flash("err", __("Choose a line from the bill first", null, "Bunood POS")); return; }
			if (!canEdit(mode)) { flash("err", mode === "price" ? __("This point of sale does not allow price changes", null, "Bunood POS") : __("This point of sale does not allow discounts", null, "Bunood POS")); return; }
			state.mode = mode;
			state.fresh = true;
			state.buf = "";
			renderBill();
			renderPad();
			focusOmni();
		}
		function removeSelected() {
			const line = selected();
			if (!line) return;
			state.lines.splice(state.sel, 1);
			state.sel = Math.min(state.sel, state.lines.length - 1);
			state.fresh = true;
			state.buf = "";
			flash("info", __("Removed: {0}", [line.item_name]));
			cartChanged();
		}
		function applyBuffer(buffer) {
			const line = selected();
			if (!line) return;
			const value = parseFloat(buffer || "0") || 0;
			if (state.mode === "qty") line.qty = round(value, 3);
			else if (state.mode === "price") line.rate = round(value, 4);
			else line.discount_percentage = Math.min(100, round(value, 2));
			state.buf = buffer;
			state.fresh = false;
			if (state.mode === "qty" && line.qty <= 0) {
				renderBill();
				return;
			}
			cartChanged();
		}
		function bumpQty(delta) {
			const line = selected();
			if (!line) return;
			const next = round(line.qty + delta * (line.weighed ? 0.25 : 1), 3);
			if (next <= 0) removeSelected();
			else { line.qty = next; cartChanged(); }
		}

		function payload() {
			return {
				pos_profile: state.profile.name,
				customer: state.customer || state.profile.customer,
				items: state.lines.filter((line) => line.qty > 0).map((line) => ({
					item_code: line.item_code,
					qty: line.qty,
					uom: line.uom,
					rate: line.rate !== line.price_list_rate ? line.rate : undefined,
					discount_percentage: line.discount_percentage || undefined,
					batch_no: line.batch_no || undefined,
					serial_no: line.serial_no || undefined,
				})),
			};
		}

		let previewTimer = 0;
		function cartChanged() {
			state.rev += 1;
			state.saleId = "";
			state.preview = null;
			renderBill();
			renderPad();
			renderGrid();
			renderFoot();
			clearTimeout(previewTimer);
			if (state.lines.some((line) => line.qty > 0)) previewTimer = setTimeout(previewSale, 300);
		}

		async function previewSale() {
			if (offline.on) return null;
			const rev = state.rev;
			if (!state.lines.some((line) => line.qty > 0)) return null;
			state.previewing = true;
			try {
				// The refusal shows in the status line; a desk dialog would cover the bill.
				const result = await api("preview_cart", { payload: JSON.stringify(payload()) }, { silent: true });
				if (rev !== state.rev) return null;
				state.preview = { ...result, rev };
				renderBill();
				renderPad();
				if (state.screen === "pay") renderPanel();
				return state.preview;
			} catch (error) {
				if (rev === state.rev) flash("err", messageOf(error, __("The total could not be calculated.", null, "Bunood POS")));
				return null;
			} finally {
				state.previewing = false;
			}
		}

		async function serverTotal() {
			if (offline.on) return offlineDue();
			if (state.preview && state.preview.rev === state.rev) return state.preview;
			clearTimeout(previewTimer);
			return previewSale();
		}

		function resetSale(options) {
			state.lines = [];
			state.sel = -1;
			state.mode = "qty";
			state.buf = "";
			state.fresh = true;
			state.rev += 1;
			state.preview = null;
			state.screen = "sale";
			state.pays = [];
			state.psel = -1;
			state.payErr = "";
			state.done = null;
			state.draft = "";
			state.saleId = "";
			state.mult = null;
			state.unknown = "";
			state.customer = state.profile?.customer || "";
			state.customerName = state.customer;
			state.customerTaxId = "";
			if (!options?.silent) {
				flash("info", __("New sale — scan the first item", null, "Bunood POS"));
				renderSaleParts();
				focusOmni();
			}
		}

		// ── Payment ──────────────────────────────────────────────────────────
		function methods() {
			return state.profile?.payments || [];
		}
		function cashMethod() {
			return methods().find((row) => row.type === "Cash") || null;
		}
		function cardMethod() {
			return methods().find((row) => row.type === "Bank") || methods().find((row) => row.type !== "Cash") || null;
		}
		// A buy-now-pay-later method: Tabby or Tamara, and its number of payments.
		function bnplOf(mode) {
			const entry = counter("bnpl")?.[mode];
			return entry ? { ...entry, name: { tabby: "Tabby", tamara: "Tamara" }[entry.provider] || entry.provider } : null;
		}
		function methodTone(row) {
			if (row && bnplOf(row.mode_of_payment)) return "bnpl";
			return row?.type === "Cash" ? "cash" : row?.type === "Bank" ? "card" : "other";
		}
		function isWalkIn() {
			return !state.customer || state.customer === state.profile?.customer;
		}

		async function openPay() {
			if (!state.lines.some((line) => line.qty > 0)) { flash("err", __("Add an item first", null, "Bunood POS")); return; }
			if (state.busy) return;
			const preview = await serverTotal();
			if (!preview) return;
			state.screen = "pay";
			state.pays = [];
			state.psel = -1;
			state.payErr = "";
			state.payFresh = true;
			state.payBuf = "";
			closePalette();
			renderSaleParts();
			focusOmni();
		}

		function due() {
			const preview = state.preview && state.preview.rev === state.rev ? state.preview : null;
			return preview ? Number(preview.rounded_total || preview.grand_total || 0) : totals().total;
		}
		function paid() {
			return round(state.pays.reduce((sum, row) => sum + Number(row.amount || 0), 0));
		}

		function addPay(row) {
			if (!row) return;
			const rest = Math.max(round(due() - paid()), 0);
			const existing = state.pays.findIndex((pay) => pay.mode_of_payment === row.mode_of_payment);
			if (existing >= 0) {
				state.psel = existing;
			} else {
				state.pays.push({ mode_of_payment: row.mode_of_payment, amount: rest, reference_no: "" });
				state.psel = state.pays.length - 1;
			}
			state.payFresh = true;
			state.payBuf = "";
			state.payErr = "";
			renderPanel();
			renderPad();
			focusOmni();
		}

		function quickCash(value) {
			const cash = cashMethod();
			if (!cash) return;
			state.pays = state.pays.filter((row) => row.mode_of_payment !== cash.mode_of_payment);
			state.pays.push({ mode_of_payment: cash.mode_of_payment, amount: value, reference_no: "" });
			state.psel = state.pays.length - 1;
			state.payFresh = true;
			state.payErr = "";
			renderPanel();
			focusOmni();
		}

		function cashSuggestions(total) {
			const values = [];
			const add = (value) => {
				const rounded = round(value);
				if (rounded >= total - 0.001 && !values.some((other) => Math.abs(other - rounded) < 0.001)) values.push(rounded);
			};
			if (counter("cash_exact") !== false) add(total);
			// Notes up to 100 round the total up (87 → 90, 100); 200 and 500 are
			// offered as one note when it covers the total. The defaults give the
			// buttons the counter showed before it had settings.
			(counter("cash_notes") || [10, 50, 100, 200, 500]).forEach((note) => add(note >= 200 ? note : Math.ceil(total / note) * note));
			return values.slice(0, 5);
		}

		async function complete(directPayments) {
			if (state.busy) return;
			const preview = await serverTotal();
			if (!preview) return;
			const total = Number(preview.rounded_total || preview.grand_total || 0);
			let payments = directPayments || state.pays.filter((row) => Number(row.amount) > 0);
			if (!payments.length) {
				const fallback = cashMethod() || methods().find((row) => row.default) || methods()[0];
				if (!fallback) { flash("err", __("This POS Profile has no payment methods.", null, "Bunood POS")); return; }
				payments = [{ mode_of_payment: fallback.mode_of_payment, amount: total }];
			}
			const sum = round(payments.reduce((acc, row) => acc + Number(row.amount || 0), 0));
			const unreferenced = payments.find((row) => Number(row.amount) > 0 && bnplOf(row.mode_of_payment) && !String(row.reference_no || "").trim());
			if (unreferenced) {
				state.payErr = __("Enter the order number from: {0}", [bnplOf(unreferenced.mode_of_payment).name]);
				renderPanel();
				return;
			}
			if (sum + 0.001 < total) {
				if (!state.profile.allow_partial_payment) {
					state.payErr = __("Short of the total by: {0}", [money(total - sum)]);
					renderPanel();
					return;
				}
				if (isWalkIn()) {
					state.payErr = __("The rest can stay on account only for a named customer.", null, "Bunood POS");
					renderPanel();
					return;
				}
			}
			state.saleId = state.saleId || newSaleId();
			if (offline.on) {
				if (state.draft) {
					state.payErr = __("A held sale is completed with the connection.", null, "Bunood POS");
				} else if (sum + 0.001 < total) {
					state.payErr = __("Without a connection a sale is paid in full.", null, "Bunood POS");
				} else {
					// Busy before the first wait: a double tap must not keep the sale twice.
					state.busy = true;
					try {
						await keepSale(payments, total);
					} finally {
						state.busy = false;
					}
					return;
				}
				renderPanel();
				return;
			}
			state.busy = true;
			renderPad();
			try {
				const result = await api("checkout", {
					payload: JSON.stringify(payload()),
					payments: JSON.stringify(payments),
					draft_name: state.draft || undefined,
					client_id: state.saleId,
				}, { freeze: true, message: __("Completing the sale…", null, "Bunood POS") });
				state.done = { ...result, payments };
				state.screen = "done";
				loadReceipt(result);
				state.draft = "";
				frappe.utils?.play_sound?.("submit");
				flash("ok", __("Sale complete: {0}", [result.name]));
				if (state.profile.print_receipt_on_order_complete) printReceipt(result.doctype, result.name);
			} catch (error) {
				// No answer: the sale may or may not have reached ERPNext. It is kept on this
				// device under the same id, and the server answers the send with the invoice
				// it already made, if any; nothing is charged twice.
				if (error?.status === 0 && !state.draft && sum + 0.001 >= total) {
					await keepSale(payments, total);
					return;
				}
				state.payErr = messageOf(error, __("The sale was not submitted.", null, "Bunood POS"));
				if (state.screen !== "pay") {
					frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: state.payErr, indicator: "red" });
					state.payErr = "";
				}
			} finally {
				state.busy = false;
				renderSaleParts();
				focusOmni();
			}
		}

		async function instant(kind) {
			if (!state.lines.some((line) => line.qty > 0)) { flash("err", __("Add an item first", null, "Bunood POS")); return; }
			const row = kind === "cash" ? cashMethod() : cardMethod();
			if (!row) { flash("err", kind === "cash" ? __("This point of sale has no cash method", null, "Bunood POS") : __("This point of sale has no card method", null, "Bunood POS")); return; }
			const preview = await serverTotal();
			if (!preview) return;
			const total = Number(preview.rounded_total || preview.grand_total || 0);
			complete([{ mode_of_payment: row.mode_of_payment, amount: total }]);
		}

		function printReceipt(doctype, name) {
			const format = state.profile?.print_format || "Standard";
			const query = new URLSearchParams({ doctype, name, format, trigger_print: "1" });
			window.open(`/printview?${query.toString()}`, "_blank", "noopener");
		}

		// ── Held sales ───────────────────────────────────────────────────────
		function canHold() {
			return Boolean(state.context?.capabilities?.can_hold);
		}
		async function refreshHeld() {
			if (!state.profile || !canHold()) return;
			try {
				state.held = await api("held_carts", { pos_profile: state.profile.name }, { type: "GET" }) || [];
			} catch (_error) {
				state.held = [];
			}
			renderBar();
			if (state.heldOpen) renderHeldPopover();
			if (state.view === "held") renderHeldView();
		}

		async function hold() {
			if (needsConnection()) return;
			if (!canHold()) { flash("err", __("Holding sales is not set up on this site yet.", null, "Bunood POS")); return; }
			if (!state.lines.some((line) => line.qty > 0) || state.screen !== "sale") { flash("err", __("Nothing to hold", null, "Bunood POS")); return; }
			try {
				const result = await api("hold_cart", { payload: JSON.stringify(payload()), draft_name: state.draft || undefined }, { freeze: true, message: __("Holding the sale…", null, "Bunood POS") });
				resetSale({ silent: true });
				flash("info", __("Held as {0} — F7 to bring it back", [result.name]));
				renderSaleParts();
				refreshHeld();
				focusOmni();
			} catch (error) {
				frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The sale could not be held.", null, "Bunood POS")), indicator: "red" });
			}
		}

		function resume(name) {
			const go = () => resumeNow(name);
			if (state.lines.length && state.screen === "sale") {
				frappe.confirm(__("Replace the current bill with this held sale? Hold the current one first if you need it.", null, "Bunood POS"), go);
				return;
			}
			go();
		}

		async function resumeNow(name) {
			try {
				const result = await api("load_cart", { name }, { type: "GET" });
				resetSale({ silent: true });
				state.draft = result.name;
				state.customer = result.customer;
				state.customerName = result.customer;
				state.lines = (result.items || []).map((row) => {
					const uom = row.uom || "";
					const listed = Number(row.price_list_rate || 0);
					const line = {
						key: [row.item_code, uom, "", ""].join("::"),
						item_code: row.item_code,
						item_name: row.item_name || row.item_code,
						uom,
						stock_uom: uom,
						qty: Number(row.qty || 0),
						rate: listed || Number(row.rate || 0),
						price_list_rate: 0,
						// The draft keeps the discounted rate; recover the percentage from the list price.
						discount_percentage: listed && Number(row.rate || 0) < listed ? round((1 - Number(row.rate || 0) / listed) * 100, 2) : 0,
						batch_no: "",
						serial_no: "",
						weighed: WEIGHED_UOM.test(uom),
					};
					line.rate = round(line.rate, 4);
					// The bill's own rate is resent, so a price the cashier changed survives the hold.
					line.price_list_rate = null;
					return line;
				});
				state.sel = state.lines.length - 1;
				state.heldOpen = false;
				state.view = "sale";
				showSale();
				flash("info", __("Resumed: {0}", [result.name]));
				cartChanged();
				refreshHeld();
			} catch (error) {
				frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The held sale could not be resumed.", null, "Bunood POS")), indicator: "red" });
			}
		}

		// ── Customer ─────────────────────────────────────────────────────────
		let customerTimer = 0;
		function openCustomer() {
			if (needsConnection()) return;
			if (state.screen === "done") return;
			state.overlay = { kind: "customer", term: "", rows: null };
			renderLayer();
			searchCustomers("");
		}
		function searchCustomers(term) {
			clearTimeout(customerTimer);
			customerTimer = setTimeout(async () => {
				try {
					const rows = await api("search_customers", { search_term: term, limit: 12 }, { type: "GET" });
					if (state.overlay?.kind !== "customer" || state.overlay.term !== term) return;
					state.overlay.rows = rows || [];
					renderLayer({ keepFocus: true });
				} catch (error) {
					if (state.overlay?.kind === "customer") {
						state.overlay.rows = [];
						state.overlay.error = messageOf(error, __("Customers could not be loaded.", null, "Bunood POS"));
						renderLayer({ keepFocus: true });
					}
				}
			}, 200);
		}
		function chooseCustomer(row) {
			state.customer = row.name;
			state.customerName = row.customer_name || row.name;
			state.customerTaxId = row.tax_id || "";
			state.overlay = null;
			state.payErr = "";
			renderLayer();
			flash("ok", __("Customer: {0}", [state.customerName]));
			cartChanged();
			if (state.screen === "pay") renderPanel();
			focusOmni();
		}
		function createCustomer() {
			if (!state.context?.capabilities?.can_create_customer) return;
			state.overlay = null;
			renderLayer();
			frappe.ui.form.make_quick_entry("Customer", (doc) => chooseCustomer({ name: doc.name, customer_name: doc.customer_name, tax_id: doc.tax_id }));
		}

		// ── Unknown barcode: link it, or make a new item ─────────────────────
		async function addBarcode(itemCode, code) {
			const doc = await frappe.xcall("frappe.client.get", { doctype: "Item", name: itemCode });
			if ((doc.barcodes || []).some((row) => row.barcode === code)) return;
			doc.barcodes = (doc.barcodes || []).concat([{ doctype: "Item Barcode", barcode: code }]);
			await frappe.xcall("frappe.client.save", { doc });
		}
		function openLink() {
			state.overlay = { kind: "link", code: state.unknown, term: "", rows: null, sel: 0 };
			renderLayer();
			searchLinkItems("");
		}
		let linkTimer = 0;
		function searchLinkItems(term) {
			clearTimeout(linkTimer);
			linkTimer = setTimeout(async () => {
				try {
					const result = await api("get_items", { pos_profile: state.profile.name, start: 0, page_length: 8, search_term: term }, { type: "GET" });
					if (state.overlay?.kind !== "link" || state.overlay.term !== term) return;
					state.overlay.rows = result?.items || [];
					state.overlay.sel = 0;
					renderLayer({ keepFocus: true });
				} catch (_error) {
					if (state.overlay?.kind === "link") { state.overlay.rows = []; renderLayer({ keepFocus: true }); }
				}
			}, 200);
		}
		async function saveLink() {
			const overlay = state.overlay;
			const row = overlay?.rows?.[overlay.sel];
			if (!row) return;
			const labelled = state.unknownLabel;
			try {
				await addBarcode(row.item_code, overlay.code);
				state.overlay = null;
				state.unknown = "";
				state.unknownLabel = "";
				renderLayer();
				renderAlert();
				if (labelled) scan(labelled);
				else addItem(row, 1);
				flash("ok", __("Barcode saved — {0} → {1}", [overlay.code, row.item_name || row.item_code]));
			} catch (error) {
				frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The barcode could not be saved.", null, "Bunood POS")), indicator: "red" });
			}
		}
		function newItem() {
			const code = state.unknown;
			const labelled = state.unknownLabel;
			frappe.ui.form.make_quick_entry("Item", async (doc) => {
				try {
					if (code) await addBarcode(doc.name, code);
					state.unknown = "";
					state.unknownLabel = "";
					renderAlert();
					if (code) scan(labelled || code);
				} catch (error) {
					frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The barcode could not be saved.", null, "Bunood POS")), indicator: "red" });
				}
			});
		}

		// ── The command line inside the scan field ───────────────────────────
		function commands() {
			return [
				{ title: __("Pay", null, "Bunood POS"), hint: "F9", glyph: "⏎", run: openPay },
				{ title: __("Exact cash and finish", null, "Bunood POS"), hint: "F10", glyph: "#", run: () => instant("cash") },
				{ title: __("Card for the full amount", null, "Bunood POS"), hint: "F8", glyph: "#", run: () => instant("card") },
				canHold() ? { title: __("Hold the bill", null, "Bunood POS"), hint: "F6", glyph: "‖", run: hold } : null,
				canHold() ? { title: __("Held sales", null, "Bunood POS"), hint: "F7", glyph: "≡", run: toggleHeld } : null,
				{ title: __("Customer", null, "Bunood POS"), hint: "F3", glyph: "@", run: openCustomer },
				{ title: __("Receipts and returns", null, "Bunood POS"), hint: "Alt+R", glyph: "↩", run: () => showList("receipts", true) },
				{ title: __("Supermarket mode", null, "Bunood POS"), hint: "", glyph: "F", run: toggleFbar },
				{ title: __("Close the shift", null, "Bunood POS"), hint: "", glyph: "■", run: closeShift },
				{ title: __("Shortcuts", null, "Bunood POS"), hint: "F1", glyph: "?", run: openHelp },
			].filter(Boolean);
		}

		let customerPaletteTimer = 0;
		function queryChanged() {
			const q = state.query.trim();
			const line = selected();
			let palette = null;
			if (q.startsWith("/")) {
				const term = q.slice(1).trim();
				palette = { title: __("Commands", null, "Bunood POS"), items: commands().filter((row) => !term || row.title.includes(term)).map((row) => ({ ...row, sub: row.hint ? __("Shortcut {0}", [row.hint]) : "", run: () => { setQuery(""); row.run(); } })) };
			} else if (q.startsWith("@")) {
				palette = { title: __("Customers", null, "Bunood POS"), items: [], loading: true };
				clearTimeout(customerPaletteTimer);
				const term = q.slice(1).trim();
				customerPaletteTimer = setTimeout(async () => {
					try {
						const rows = await api("search_customers", { search_term: term, limit: 6 }, { type: "GET" });
						if (state.query.trim() !== q) return;
						state.palette = { title: __("Customers", null, "Bunood POS"), items: (rows || []).map((row) => ({ title: row.customer_name || row.name, sub: row.mobile_no || row.customer_group || "", glyph: "@", run: () => { setQuery(""); chooseCustomer(row); } })) };
						renderPalette();
					} catch (_error) { /* the palette stays empty */ }
				}, 200);
			} else if (/^\*\d+(\.\d+)?$/.test(q) && line) {
				const value = parseFloat(q.slice(1));
				palette = { title: __("Quantity", null, "Bunood POS"), items: [{ title: __("Quantity: {0} — {1}", [value, line.item_name]), sub: __("Enter to apply", null, "Bunood POS"), glyph: "×", run: () => { setQuery(""); line.qty = round(value, 3); cartChanged(); } }] };
			} else if (/^-\d+(\.\d+)?%$/.test(q) && line) {
				const value = parseFloat(q.slice(1));
				palette = { title: __("Discount", null, "Bunood POS"), items: [canEdit("disc")
					? { title: __("{0}% off {1}", [value, line.item_name]), sub: __("Enter to apply", null, "Bunood POS"), glyph: "%", run: () => { setQuery(""); line.discount_percentage = Math.min(100, value); cartChanged(); } }
					: { title: __("This point of sale does not allow discounts", null, "Bunood POS"), sub: "", glyph: "!", run: () => setQuery("") }] };
			} else if (/^=\d+(\.\d+)?$/.test(q) && line) {
				const value = parseFloat(q.slice(1));
				palette = { title: __("Price", null, "Bunood POS"), items: [canEdit("price")
					? { title: __("Price: {0} — {1}", [num(value, 2), line.item_name]), sub: __("Enter to apply", null, "Bunood POS"), glyph: "=", run: () => { setQuery(""); line.rate = value; cartChanged(); } }
					: { title: __("This point of sale does not allow price changes", null, "Bunood POS"), sub: "", glyph: "!", run: () => setQuery("") }] };
			}
			state.palette = palette;
			renderPalette();
			renderMult();
			const text = textQuery();
			if (text !== state.lastText) {
				state.lastText = text;
				scheduleItems();
			}
		}

		function closePalette() {
			state.palette = null;
			renderPalette();
		}

		function submitQuery() {
			const q = state.query.trim();
			const palette = state.palette;
			if (palette?.items?.length) {
				(palette.items[state.pi] || palette.items[0]).run();
				return;
			}
			if (!q) return;
			if (/^[0-9*.]+$/.test(q) || /^\S+$/.test(q) && !textQuery()) { scan(q); return; }
			// A typed name: add the first match, or scan it as a code if nothing matched.
			if (state.items.length && !state.itemsLoading) { const first = state.items[0]; setQuery(""); addItem(first, state.mult || 1); return; }
			scan(q);
		}

		// ── The number pad ───────────────────────────────────────────────────
		function press(k) {
			if (state.busy) return;
			if (state.screen === "done") {
				if (k === "pay") { resetSale(); }
				return;
			}
			if (state.screen === "pay") {
				if (k === "pay" || k === "enter") { complete(); return; }
				if (k === "mada") { addPay(cardMethod()); return; }
				if (k === "cash") { addPay(cashMethod()); return; }
				if (["qty", "price", "disc", "mult", "del"].includes(k)) return;
				if (state.psel < 0 || !state.pays[state.psel]) {
					const first = cashMethod() || methods()[0];
					if (!first) return;
					state.pays.push({ mode_of_payment: first.mode_of_payment, amount: 0, reference_no: "" });
					state.psel = state.pays.length - 1;
					state.payFresh = true;
				}
				let buffer = state.payFresh ? "" : state.payBuf;
				if (k === "back") buffer = buffer.slice(0, -1);
				else if (k === "clear") buffer = "";
				else if (k === "." && buffer.includes(".")) return;
				else buffer += k;
				state.payBuf = buffer;
				state.payFresh = false;
				state.pays[state.psel].amount = round(parseFloat(buffer || "0") || 0);
				state.payErr = "";
				renderPanel();
				focusOmni();
				return;
			}
			if (k === "pay") { openPay(); return; }
			if (k === "mada") { instant("card"); return; }
			if (k === "cash") { instant("cash"); return; }
			if (k === "qty" || k === "price" || k === "disc") { setMode(k); return; }
			if (k === "del") { removeSelected(); focusOmni(); return; }
			if (k === "mult") {
				const value = parseFloat(state.query);
				if (value > 0 && /^\d+(\.\d+)?$/.test(state.query.trim())) { state.mult = value; setQuery(""); flash("info", __("Now scan the item — quantity {0}", [value])); }
				else flash("info", __("Type the count, press ×, then scan the item", null, "Bunood POS"));
				renderMult();
				focusOmni();
				return;
			}
			if (k === "enter") {
				if (state.query.trim()) submitQuery();
				else { state.fresh = true; state.buf = ""; renderBill(); }
				focusOmni();
				return;
			}
			const line = selected();
			if (!line || state.query) {
				// No line chosen: the pad types a code into the scan field.
				if (k === "back") setQuery(state.query.slice(0, -1));
				else if (k === "clear") setQuery("");
				else setQuery(state.query + k);
				focusOmni();
				return;
			}
			let buffer = state.fresh ? "" : state.buf;
			if (k === "back") {
				if (buffer === "" && state.mode === "qty") { removeSelected(); focusOmni(); return; }
				buffer = buffer.slice(0, -1);
			} else if (k === "clear") buffer = "";
			else if (k === "." && buffer.includes(".")) return;
			else buffer += k;
			applyBuffer(buffer);
			focusOmni();
		}

		// ── Keyboard ─────────────────────────────────────────────────────────
		function counterActive() {
			// A fixed element has no offsetParent even when shown: ask for its boxes.
			if (!root.isConnected || !root.getClientRects().length) return false;
			if (document.querySelector(".modal.show")) return false;
			return true;
		}

		function onKey(event) {
			if (!counterActive()) return;
			const k = event.key;
			const inOmni = event.target === omni;
			const inOverlayField = !inOmni && event.target?.closest?.(".bnd-pos__layer") && event.target.matches?.("input, textarea, select");
			if (k === "Escape") {
				if (state.overlay) { state.overlay = null; renderLayer(); focusOmni(); }
				else if (state.menuOpen) { state.menuOpen = false; renderBar(); focusOmni(); }
				else if (state.heldOpen) { state.heldOpen = false; renderHeldPopover(); focusOmni(); }
				else if (state.view === "close") {
					if (state.close?.step === "result" && !state.close.busy) { state.close.step = "count"; renderCloseView(); }
					else if (state.close?.step === "count") leaveClose();
				}
				else if (state.view === "return") { if (!state.ret?.busy) leaveReturn(); }
				else if (state.view === "settings") { if (!state.settings?.busy) leaveSettings(); }
				else if (state.view !== "sale" && state.view !== "gate") showSale();
				else if (state.palette) { setQuery(""); }
				else if (state.query) setQuery("");
				else if (state.screen === "pay") { state.screen = "sale"; renderSaleParts(); focusOmni(); }
				else if (state.unknown) { state.unknown = ""; renderAlert(); }
				else if (state.mult) { state.mult = null; renderMult(); }
				event.preventDefault();
				return;
			}
			if (inOverlayField) return;
			if (["gate", "close", "return", "settings"].includes(state.view)) return;
			const fkeys = {
				F1: openHelp,
				F2: () => { if (state.view !== "sale") showSale(); setQuery(""); focusOmni(); },
				F3: openCustomer,
				F4: () => { if (counter("new_item") === false || counter("unknown_barcode") === "alert") return; if (state.unknown) newItem(); else flash("info", __("Scan the new barcode first, then choose New item", null, "Bunood POS")); },
				F6: hold,
				F7: toggleHeld,
				F8: () => (state.screen === "pay" ? addPay(cardMethod()) : instant("card")),
				F9: () => (state.screen === "pay" ? complete() : openPay()),
				F10: () => (state.screen === "pay" ? complete() : instant("cash")),
			};
			if (fkeys[k]) {
				event.preventDefault();
				event.stopPropagation();
				if (state.view !== "sale" && !["F1", "F2", "F7"].includes(k)) showSale();
				if (state.screen === "done" && !["F1", "F2"].includes(k)) return;
				fkeys[k]();
				return;
			}
			if (event.altKey && event.code === "KeyR") {
				event.preventDefault();
				event.stopPropagation();
				showList("receipts", true);
				return;
			}
			if ((event.ctrlKey || event.metaKey) && event.code === "KeyP" && state.screen === "done" && state.done) {
				event.preventDefault();
				if (state.done.offline) printProvisional(state.done.sale);
				else printReceipt(state.done.doctype, state.done.name);
				return;
			}
			if (state.view !== "sale") return;
			if (!inOmni) {
				// A scanner or a typist with focus elsewhere: send the keys to the scan field.
				const typing = k.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
				const editable = event.target?.matches?.("input, textarea, select, [contenteditable]");
				if (typing && !editable) omni.focus({ preventScroll: true });
				else return;
			}
			if (state.screen === "pay" && !state.query) {
				if (/^[0-9.]$/.test(k)) { event.preventDefault(); press(k); return; }
				if (k === "Backspace") { event.preventDefault(); press("back"); return; }
				if (k === "Enter") { event.preventDefault(); complete(); return; }
				if (k === "Tab") {
					event.preventDefault();
					const list = methods();
					if (!list.length) return;
					const current = state.pays[state.psel];
					const index = current ? list.findIndex((row) => row.mode_of_payment === current.mode_of_payment) : -1;
					const next = list[(index + 1) % list.length];
					if (current && !state.pays.some((row) => row.mode_of_payment === next.mode_of_payment)) {
						current.mode_of_payment = next.mode_of_payment;
						renderPanel();
					} else addPay(next);
					return;
				}
				return;
			}
			if (state.screen === "done") {
				if (k === "Enter" && !state.query) { event.preventDefault(); resetSale(); }
				else if (k === "Enter") { event.preventDefault(); submitQuery(); }
				return;
			}
			if (k === "ArrowDown" || k === "ArrowUp") {
				event.preventDefault();
				const step = k === "ArrowDown" ? 1 : -1;
				if (state.palette?.items?.length) {
					state.pi = Math.max(0, Math.min(state.palette.items.length - 1, state.pi + step));
					renderPalette();
				} else if (state.lines.length) {
					state.sel = Math.max(0, Math.min(state.lines.length - 1, (state.sel < 0 ? state.lines.length : state.sel) + step));
					state.fresh = true;
					state.buf = "";
					renderBill();
				}
				return;
			}
			if (k === "Enter") { event.preventDefault(); submitQuery(); return; }
			if (!state.query) {
				if (k === "Delete") { event.preventDefault(); removeSelected(); return; }
				if ((k === "+" || k === "-") && selected()) { event.preventDefault(); bumpQty(k === "+" ? 1 : -1); return; }
			}
		}

		omni.addEventListener("input", () => {
			const value = omni.value;
			if (/^\d+(\.\d+)?\*$/.test(value.trim())) {
				state.mult = parseFloat(value);
				omni.value = "";
				state.query = "";
				flash("info", __("Now scan the item — quantity {0}", [state.mult]));
				queryChanged();
				return;
			}
			state.query = value;
			state.pi = 0;
			queryChanged();
		});
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("online", () => renderBar());
		window.addEventListener("offline", () => renderBar());

		function toggleKeyboard() {
			prefs.keyboard = !prefs.keyboard;
			writePrefs(prefs);
			omni.setAttribute("inputmode", prefs.keyboard ? "search" : "none");
			keyboardToggle.setAttribute("aria-pressed", String(prefs.keyboard));
			omni.blur();
			omni.focus({ preventScroll: true });
		}
		function toggleFbar() {
			prefs.fbar = !fbarOn();
			writePrefs(prefs);
			root.toggleAttribute("data-fbar", prefs.fbar);
			state.menuOpen = false;
			renderBar();
			renderFoot();
			renderPad();
			focusOmni();
		}
		function toggleHeld() {
			if (needsConnection()) return;
			if (!canHold()) { flash("err", __("Holding sales is not set up on this site yet.", null, "Bunood POS")); return; }
			state.heldOpen = !state.heldOpen;
			if (state.heldOpen) refreshHeld();
			renderHeldPopover();
		}
		function openHelp() {
			state.overlay = { kind: "help" };
			renderLayer();
		}
		function toggleFullscreen() {
			state.menuOpen = false;
			renderBar();
			if (document.fullscreenElement) document.exitFullscreen?.();
			else document.documentElement.requestFullscreen?.().catch(() => {});
		}

		// ── Selling through a lost connection ────────────────────────────────
		// The catalogue the counter last downloaded stays on this device, and a
		// sale completed without a connection is kept here under its own id and
		// sent when the connection returns (pos.sync_offline_sale prices it again
		// and posts it, or keeps it as a held draft for review).
		const offline = { on: false, catalog: null, queue: [], syncing: false, heartbeat: 0, refresh: 0 };
		const offlineStrip = h("div", { class: "bnd-pos__offline", role: "status", hidden: true });
		root.insertBefore(offlineStrip, body);

		function catalogKey() {
			return `${frappe.session.user}::${state.profile?.name || ""}`;
		}

		async function loadCatalog() {
			try {
				offline.catalog = (await offlineStore("catalog", "readonly", (store) => store.get(catalogKey()))) || null;
			} catch (_error) {
				offline.catalog = null;
			}
		}

		async function refreshCatalog() {
			if (offline.on || !state.profile || !state.context?.opening_entry) return;
			try {
				const result = await api("offline_catalog", { pos_profile: state.profile.name }, { type: "GET", silent: true });
				offline.catalog = { key: catalogKey(), items: result?.items || [], at: result?.generated_at || "", truncated: Boolean(result?.truncated) };
				await offlineStore("catalog", "readwrite", (store) => store.put(offline.catalog));
			} catch (_error) { /* the last copy stays */ }
			renderOfflineStrip();
		}

		async function loadQueue() {
			try {
				const rows = (await offlineStore("queue", "readonly", (store) => store.getAll())) || [];
				offline.queue = rows.filter((row) => row.user === frappe.session.user).sort((a, b) => String(a.sold_at).localeCompare(String(b.sold_at)));
			} catch (_error) {
				offline.queue = [];
			}
			renderBar();
			renderOfflineStrip();
		}

		function queueFor(profile) {
			return offline.queue.filter((sale) => sale.profile === profile);
		}

		// The cached catalogue answers what get_items answers online.
		function offlineFind(term) {
			const items = offline.catalog?.items || [];
			const text = String(term || "").trim();
			if (!text) return [];
			const exact = items.filter((row) => row.item_code === text || (row.barcodes || []).includes(text));
			if (exact.length || /^\d+$/.test(text)) return exact;
			const lower = text.toLowerCase();
			const named = items.filter((row) => String(row.item_name || "").toLowerCase().includes(lower) || String(row.item_code).toLowerCase().includes(lower));
			return named.length === 1 ? named : [];
		}

		function offlineList() {
			const lower = textQuery().toLowerCase();
			return (offline.catalog?.items || []).filter((row) => !lower
				|| String(row.item_name || "").toLowerCase().includes(lower)
				|| String(row.item_code).toLowerCase().includes(lower)
				|| (row.barcodes || []).includes(lower));
		}

		function setOnline(on) {
			const wasOffline = offline.on;
			offline.on = !on;
			root.toggleAttribute("data-offline", offline.on);
			clearInterval(offline.heartbeat);
			if (offline.on) {
				// Ask the server, not the browser, whether the connection is back.
				offline.heartbeat = setInterval(async () => {
					try {
						const response = await fetch("/api/method/ping", { cache: "no-store", credentials: "same-origin" });
						if (response.ok) setOnline(true);
					} catch (_error) { /* still offline */ }
				}, 8000);
			}
			renderBar();
			renderOfflineStrip();
			if (offline.on && !wasOffline) {
				flash("err", __("Connection lost — selling continues on this device", null, "Bunood POS"));
				if (state.view === "sale") loadItems(false);
			} else if (!offline.on && wasOffline) {
				flash("ok", __("Connection back — sending the sales kept on this device", null, "Bunood POS"));
				syncQueue();
				refreshCatalog();
				if (state.view === "sale") loadItems(false);
			}
		}

		// What a sale is due while offline: the counter's estimate, rounded as ERPNext rounds.
		function offlineDue() {
			const t = totals();
			return { net_total: t.net, total_taxes_and_charges: t.vat, grand_total: round(t.total - t.rounding), rounded_total: t.total, rev: state.rev, offline: true };
		}

		function newSaleId() {
			return window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
		}

		function saveSale(sale) {
			return offlineStore("queue", "readwrite", (store) => store.put(sale));
		}

		function dropSale(id) {
			return offlineStore("queue", "readwrite", (store) => store.delete(id));
		}

		async function keepSale(payments, total) {
			const sum = round(payments.reduce((acc, row) => acc + Number(row.amount || 0), 0));
			const cash = cashMethod();
			const change = cash && payments.some((row) => row.mode_of_payment === cash.mode_of_payment) ? Math.max(round(sum - total), 0) : 0;
			const id = state.saleId || newSaleId();
			const amounts = shownAmounts();
			const sale = {
				id,
				user: frappe.session.user,
				profile: state.profile.name,
				sold_at: frappe.datetime.now_datetime(),
				payload: payload(),
				payments,
				total,
				paid: sum,
				change,
				status: "queued",
				customer: state.customerName || state.customer,
				lines: state.lines.filter((line) => line.qty > 0).map((line) => ({ name: line.item_name, qty: qtyText(line), amount: amounts[state.lines.indexOf(line)] })),
			};
			try {
				await saveSale(sale);
			} catch (error) {
				state.payErr = __("The sale could not be kept on this device. Nothing was recorded.", null, "Bunood POS");
				renderPanel();
				return;
			}
			offline.queue = offline.queue.filter((other) => other.id !== sale.id).concat([sale]);
			state.done = { offline: true, name: id, sale, rounded_total: total, grand_total: total, paid_amount: sum, change_amount: change, payments };
			state.screen = "done";
			frappe.utils?.play_sound?.("submit");
			flash("ok", __("Sale kept on this device until the connection returns", null, "Bunood POS"));
			renderSaleParts();
			renderBar();
			renderOfflineStrip();
			if (state.profile.print_receipt_on_order_complete) printProvisional(sale);
		}

		// A request that hangs counts as no connection: the loop ends and can run again.
		function withinTime(promise) {
			return Promise.race([promise, new Promise((_resolve, reject) => setTimeout(() => reject({ status: 0, message: "" }), 45000))]);
		}

		async function syncQueue() {
			if (offline.syncing || offline.on || !state.profile || !state.context?.opening_entry) return;
			offline.syncing = true;
			renderOfflineStrip();
			let sent = 0;
			let review = 0;
			try {
				const mine = queueFor(state.profile.name);
				// Sales already on the server for review: dropped once someone completed,
				// cancelled or deleted them; never sent again.
				const reviewing = mine.filter((sale) => sale.status === "review");
				if (reviewing.length) {
					const states = await withinTime(api("offline_sale_state", { offline_ids: JSON.stringify(reviewing.map((sale) => sale.id)) }, { silent: true }));
					for (const sale of reviewing) {
						const known = states?.[sale.id];
						if (!known || known.docstatus === null || known.docstatus >= 1) await dropSale(sale.id);
					}
				}
				for (const sale of mine.filter((item) => item.status !== "review")) {
					try {
						const result = await withinTime(api("sync_offline_sale", {
							offline_id: sale.id,
							sold_at: sale.sold_at,
							payload: JSON.stringify(sale.payload),
							payments: JSON.stringify(sale.payments),
							collected_total: sale.total,
						}, { silent: true }));
						if (result?.status === "review") {
							review += 1;
							await saveSale({ ...sale, status: "review", invoice: result.name, error: result.message || "" });
						} else {
							sent += 1;
							await dropSale(sale.id);
						}
					} catch (error) {
						if (error?.status === 0) break;
						await saveSale({ ...sale, status: "failed", error: messageOf(error, __("The server did not take this sale.", null, "Bunood POS")) }).catch(() => {});
					}
				}
			} catch (_error) {
				/* the next run tries again */
			} finally {
				offline.syncing = false;
				await loadQueue();
			}
			if (sent) flash("ok", __("Sales sent from this device: {0}", [sent]));
			if (review) {
				flash("err", __("Sales held for review: {0}", [review]));
				refreshHeld();
			}
		}

		function discardSale(sale) {
			frappe.confirm(__("This sale will not reach ERPNext. Print its provisional receipt first if you need a paper record. Discard it?", null, "Bunood POS"), async () => {
				await dropSale(sale.id).catch(() => {});
				await loadQueue();
			});
		}

		function renderOfflineStrip() {
			const waiting = state.profile ? queueFor(state.profile.name) : [];
			const failed = waiting.filter((sale) => sale.status === "failed");
			const reviewing = waiting.filter((sale) => sale.status === "review");
			offlineStrip.hidden = !offline.on && !waiting.length;
			if (offlineStrip.hidden) {
				fill(offlineStrip);
				return;
			}
			const at = offline.catalog?.at && frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(offline.catalog.at) : "";
			offlineStrip.toggleAttribute("data-online", !offline.on);
			fill(offlineStrip,
				svg("alert", 16),
				h("span", null, offline.on
					? __("No connection — selling continues on this device; the sales are sent when it returns.", null, "Bunood POS")
					: offline.syncing ? __("Sending the sales kept on this device…", null, "Bunood POS") : __("Sales kept on this device are waiting to be sent.", null, "Bunood POS")),
				waiting.length ? h("b", null, __("Waiting: {0}", [waiting.length])) : null,
				offline.on && at ? h("span", { class: "bnd-pos__muted" }, __("Catalogue saved", null, "Bunood POS"), " ", ltr(at)) : null,
				offline.on && !offline.catalog?.items?.length ? h("b", null, __("No catalogue on this device yet: items can be added once the connection returns.", null, "Bunood POS")) : null,
				!offline.on && !offline.syncing ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: syncQueue }, __("Send now", null, "Bunood POS")) : null,
				failed.concat(reviewing).slice(0, 3).map((sale) => h("span", { class: "bnd-pos__offline-sale" },
					h("b", null, sale.status === "review" ? __("Needs review", null, "Bunood POS") : __("Not sent", null, "Bunood POS")),
					" ", ltr(money(sale.total)), sale.error ? ` — ${sale.error}` : "",
					sale.status === "review" && sale.invoice
						? h("button", { type: "button", class: "bnd-pos__link", onclick: () => frappe.set_route("Form", state.context.invoice_type, sale.invoice) }, __("Open", null, "Bunood POS"))
						: [h("button", { type: "button", class: "bnd-pos__link", onclick: () => printProvisional(sale) }, __("Print", null, "Bunood POS")),
							h("button", { type: "button", class: "bnd-pos__link", onclick: () => discardSale(sale) }, __("Discard", null, "Bunood POS"))])));
		}

		// Things that need the server say so instead of failing.
		function needsConnection() {
			if (!offline.on) return false;
			flash("err", __("This needs the connection. Selling continues meanwhile.", null, "Bunood POS"));
			return true;
		}

		// A provisional receipt from this device: honest that the invoice follows.
		function printProvisional(sale) {
			const view = window.open("", "_blank", "width=420,height=640");
			if (!view) return;
			const rows = (sale.lines || []).map((line) => `<tr><td>${escapeHtml(line.qty)}</td><td>${escapeHtml(line.name)}</td><td class="n">${escapeHtml(money(line.amount))}</td></tr>`).join("");
			const dir = frappe.utils?.is_rtl?.() ? "rtl" : "ltr";
			view.document.write(`<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(__("Provisional receipt", null, "Bunood POS"))}</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;font-size:13px}h1{font-size:16px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:3px 0;border-bottom:1px solid #ddd}.n{text-align:end;white-space:nowrap}p{margin:4px 0}</style></head><body>
<h1>${escapeHtml(state.profile?.company || "")}</h1>
<p><b>${escapeHtml(__("Provisional receipt", null, "Bunood POS"))}</b> · ${escapeHtml(sale.sold_at)}</p>
<p>${escapeHtml(__("Sold without a connection. The tax invoice follows when this device is back online.", null, "Bunood POS"))}</p>
<table>${rows}</table>
<p>${escapeHtml(__("Total", null, "Bunood POS"))}: <b>${escapeHtml(money(sale.total))}</b></p>
<p>${escapeHtml(__("Paid", null, "Bunood POS"))}: ${escapeHtml(money(sale.paid))} · ${escapeHtml(__("Change for the customer", null, "Bunood POS"))}: ${escapeHtml(money(sale.change))}</p>
<p>${escapeHtml(__("Reference", null, "Bunood POS"))}: ${escapeHtml(sale.id)}</p>
</body></html>`);
			view.document.close();
			view.focus();
			view.print();
		}

		window.addEventListener("online", () => setOnline(true));
		window.addEventListener("offline", () => setOnline(false));
		window.addEventListener("bnd-pos-network", () => setOnline(false));

		// ── The customer screen ──────────────────────────────────────────────
		// A second window on the terminal's customer-facing monitor, in the same
		// browser. The counter tells it what the customer may see — the bill,
		// what is due, the change — over a BroadcastChannel: no server round
		// trip, and nothing else the cashier does is sent.
		const display = { channel: null, name: "", connected: false, timer: 0, receipt: null, window: null, profile: "" };

		function connectDisplay() {
			const name = displayChannel(state.profile?.name);
			if (!state.profile || typeof BroadcastChannel !== "function" || display.name === name) return;
			// A screen left on the previous profile's channel must not keep its last bill.
			display.channel?.postMessage({ type: "counter-gone" });
			display.channel?.close();
			display.name = name;
			display.connected = false;
			display.channel = new BroadcastChannel(name);
			display.channel.onmessage = (event) => {
				const message = event.data || {};
				if (message.type === "hello") {
					display.connected = true;
					renderBar();
					pushDisplay(true);
				} else if (message.type === "bye") {
					display.connected = false;
					renderBar();
				}
			};
			// A screen already open from before this page loaded answers with hello.
			display.channel.postMessage({ type: "counter" });
		}

		function shownAmounts() {
			// ERPNext's own line amounts once its preview matches this bill.
			const fresh = state.preview && state.preview.rev === state.rev ? state.preview.items || [] : null;
			const amounts = new Map();
			if (fresh) {
				let position = 0;
				state.lines.forEach((line, index) => {
					if (line.qty > 0) amounts.set(index, fresh[position++]?.amount);
				});
			}
			return state.lines.map((line, index) => (amounts.get(index) !== undefined ? amounts.get(index) : lineAmount(line)));
		}

		// What the customer may see. Never the customer's name or tax number, the
		// cashier's notes, references or other sales: the screen faces the queue.
		function displayState() {
			const store = { name: state.profile?.company || "", logo: state.profile?.company_logo || "", currency: currency() };
			if (!state.context?.opening_entry || state.view === "gate") return { mode: "closed", store };
			if (state.screen === "done" && state.done) {
				const result = state.done;
				const total = Number(result.rounded_total || result.grand_total || 0);
				return {
					mode: "thanks",
					store,
					total,
					change: Number(result.change_amount || 0),
					owed: Math.max(round(total - Number(result.paid_amount || 0)), 0),
					name: result.name,
					receipt: display.receipt && display.receipt.name === result.name ? display.receipt : null,
				};
			}
			if (state.screen === "pay") {
				const total = due();
				const sum = paid();
				return {
					mode: "pay",
					store,
					due: total,
					paid: sum,
					rest: round(total - sum),
					tenders: state.pays.filter((row) => Number(row.amount) > 0).map((row) => ({
						mode_of_payment: row.mode_of_payment,
						amount: Number(row.amount),
						tone: methodTone(methods().find((method) => method.mode_of_payment === row.mode_of_payment)),
						bnpl: bnplOf(row.mode_of_payment),
					})),
				};
			}
			const amounts = shownAmounts();
			const lines = [];
			state.lines.forEach((line, index) => {
				if (line.qty <= 0) return;
				lines.push({
					name: line.item_name,
					qty: qtyText(line),
					uom: unitLabel(line.uom),
					rate: line.rate,
					discount: line.discount_percentage || 0,
					amount: amounts[index],
					last: index === state.sel,
				});
			});
			if (!lines.length) return { mode: "idle", store };
			const t = totals();
			return { mode: "sale", store, lines, vat: t.vat, total: t.total, exact: t.exact, receipt_offered: receiptOffered() };
		}

		function pushDisplay(now) {
			if (!display.channel || !display.connected) return;
			clearTimeout(display.timer);
			const send = () => {
				try {
					display.channel.postMessage({ type: "state", state: displayState() });
				} catch (_error) { /* the channel closed with the page */ }
			};
			if (now) send();
			else display.timer = setTimeout(send, 60);
		}

		async function openDisplay() {
			if (!state.profile) return;
			connectDisplay();
			const url = `/desk/bnd-pos?display=${encodeURIComponent(state.profile.name)}`;
			if (display.window && !display.window.closed) {
				// Open for another profile: move it to this one's channel.
				if (display.profile !== state.profile.name) display.window.location.assign(url);
				display.profile = state.profile.name;
				display.window.focus();
				return;
			}
			display.profile = state.profile.name;
			display.window = window.open(url, "bnd-pos-display", await displayPlacement());
			if (!display.window) flash("err", __("The browser blocked the customer screen. Allow pop-ups for this site, then press the screen button again.", null, "Bunood POS"));
			else flash("info", __("Customer screen opened. If it opened on this monitor, drag it to the customer's.", null, "Bunood POS"));
		}

		// The e-receipt's code is scannable by the whole queue, so only a walk-in
		// sale without a VAT number offers one; the server checks the same.
		function receiptOffered() {
			return isWalkIn() && !state.customerTaxId && state.context?.capabilities?.can_print_invoice !== false && counter("receipt_qr") !== false;
		}

		// The receipt's QR for the thanks screen, only while a screen is showing it.
		async function loadReceipt(result) {
			if (!display.connected || !result?.name || !receiptOffered()) return;
			try {
				const link = await api("receipt_link", { doctype: result.doctype, name: result.name }, { silent: true });
				display.receipt = link?.qr_svg ? link : null;
				pushDisplay(true);
			} catch (_error) { /* the thanks screen shows without the QR */ }
		}

		window.addEventListener("pagehide", () => display.channel?.postMessage({ type: "counter-gone" }));

		// ── The settings page ────────────────────────────────────────────────
		// Approved board «الإعدادات». Every row changes something real: native
		// choices are saved on the POS Profile (ERPNext validates and versions
		// them), the counter's own through pos.save_settings. Rows on the board
		// that the counter cannot honour yet are not shown.
		function settingsSections() {
			const settings = state.settings;
			const modes = settings?.ctx?.modes || [];
			const chosen = (settings?.native?.payments || []).map((row) => row.mode_of_payment);
			const T = (source, key, label, desc, invert) => ({ kind: "toggle", source, key, label, desc, invert });
			const S = (source, key, label, desc, options) => ({ kind: "options", source, key, label, desc, options });
			const store = settings?.ctx?.store || {};
			return [
				{ name: __("Store and stock", null, "Bunood POS"), intro: __("The company and warehouse this counter sells from, and the items it shows. Quantities are the warehouse's.", null, "Bunood POS"), rows: [
					{ kind: "company", label: __("Company", null, "Bunood POS"), desc: __("A point of sale belongs to one company. To sell for another company, make a point of sale for it.", null, "Bunood POS") },
					{ kind: "warehouse", source: "native", key: "warehouse", label: __("Warehouse", null, "Bunood POS"), desc: __("Every sale takes its stock from here, and the counter shows its quantities.", null, "Bunood POS"), options: store.warehouses || [], shifts: store.open_shifts || [] },
					{ kind: "groups", source: "native", key: "item_groups", label: __("Item groups on this counter", null, "Bunood POS"), desc: __("These groups and the groups under them. None chosen: every group.", null, "Bunood POS"), groups: store.groups || [] },
					S("native", "hide_unavailable_items", __("Items out of stock in this warehouse", null, "Bunood POS"), __("Shown with their quantity, or left out of the catalogue. Services always show.", null, "Bunood POS"), [[false, __("Shown", null, "Bunood POS")], [true, __("Hidden", null, "Bunood POS")]]),
					(store.companies || 0) > 1 ? T("counter", "company_items", __("Only this company's items", null, "Bunood POS"), __("An item is this company's when it has stock in one of its warehouses or an item default for it. An item with neither for any company shows at every counter.", null, "Bunood POS")) : null,
				].filter(Boolean) },
				{ name: __("The screen", null, "Bunood POS"), intro: __("How the sale screen looks for whoever works this counter.", null, "Bunood POS"), rows: [
					T("counter", "fbar", __("Supermarket mode", null, "Bunood POS"), __("A bar of function keys under the screen, to touch or press. Each device can still switch it from the counter's menu.", null, "Bunood POS")),
					T("native", "hide_images", __("Item pictures on the tiles", null, "Bunood POS"), __("Without pictures the catalogue is faster and clearer when most items are scanned.", null, "Bunood POS"), true),
					S("counter", "tiles", __("Item tile size", null, "Bunood POS"), __("Small shows more items; large is easier to touch.", null, "Bunood POS"), [["s", __("Small", null, "Bunood POS")], ["m", __("Medium", null, "Bunood POS")], ["l", __("Large", null, "Bunood POS")]]),
					T("counter", "customer_screen", __("Customer screen", null, "Bunood POS"), __("The screen button on the counter's bar opens the customer-facing window.", null, "Bunood POS")),
				] },
				{ name: __("Keypad and permissions", null, "Bunood POS"), intro: __("What the cashier can change from the pad and the scan field.", null, "Bunood POS"), rows: [
					S("native", "allow_rate_change", __("Changing the price", null, "Bunood POS"), __("The Price key, and =12.5 in the scan field.", null, "Bunood POS"), [[false, __("Not allowed", null, "Bunood POS")], [true, __("Allowed", null, "Bunood POS")]]),
					S("native", "allow_discount_change", __("Line discount", null, "Bunood POS"), __("The Disc % key, and -10% in the scan field.", null, "Bunood POS"), [[false, __("Not allowed", null, "Bunood POS")], [true, __("Allowed", null, "Bunood POS")]]),
					{ kind: "number", source: "counter", key: "max_discount", label: __("The counter's maximum discount", null, "Bunood POS"), desc: __("A line discount above it is refused. 0: only each item's own maximum.", null, "Bunood POS"), unit: "%", max: 100 },
					T("counter", "returns", __("Returns at the counter", null, "Bunood POS"), __("Return by receipt from Receipts and returns. Off: returns go through the invoice form.", null, "Bunood POS")),
					T("counter", "new_item", __("New items from the counter", null, "Bunood POS"), __("Make an item for an unknown barcode, for cashiers allowed to create items.", null, "Bunood POS")),
				] },
				{ name: __("Payment", null, "Bunood POS"), intro: __("The payment methods on this counter and the quick cash buttons.", null, "Bunood POS"), rows: [
					{ kind: "payments", label: __("Payment methods", null, "Bunood POS"), desc: __("Touch to add or remove. A method needs its account for this company before it can be added.", null, "Bunood POS"), modes },
					{ kind: "default", label: __("Default payment method", null, "Bunood POS"), desc: __("ERPNext's default for this POS Profile.", null, "Bunood POS"), options: chosen },
					{ kind: "bnpl", label: __("Buy now, pay later", null, "Bunood POS"), desc: __("A payment method that is Tabby or Tamara asks for the order number from the provider's app, and shows the customer the payments it splits into.", null, "Bunood POS"), modes: (settings?.native?.payments || []).map((row) => row.mode_of_payment).filter((mode) => (modes.find((item) => item.mode_of_payment === mode)?.type || "") !== "Cash") },
					T("counter", "cash_exact", __("Exact amount button", null, "Bunood POS"), __("The first quick cash button pays the total exactly.", null, "Bunood POS")),
					{ kind: "notes", source: "counter", key: "cash_notes", label: __("Suggested cash notes", null, "Bunood POS"), desc: __("Payment offers the fewest of each note that covers the total.", null, "Bunood POS"), notes: settings?.ctx?.cash_notes || [] },
					S("native", "allow_partial_payment", __("Credit sales", null, "Bunood POS"), __("The rest of a sale on a named customer's account.", null, "Bunood POS"), [[false, __("Not allowed", null, "Bunood POS")], [true, __("Allowed", null, "Bunood POS")]]),
					S("native", "disable_rounded_total", __("Rounding the total", null, "Bunood POS"), __("By ERPNext's rounding for the currency, or none.", null, "Bunood POS"), [[false, __("Rounded", null, "Bunood POS")], [true, __("Not rounded", null, "Bunood POS")]]),
				] },
				{ name: __("Barcodes and scale", null, "Bunood POS"), intro: __("How the counter reads repeated scans and store labels.", null, "Bunood POS"), rows: [
					T("counter", "merge_scans", __("Merge repeated scans", null, "Bunood POS"), __("Scanning the same item raises its quantity instead of adding a line.", null, "Bunood POS")),
					{ kind: "label", source: "counter", key: "scale_prefix", label: __("Scale label", null, "Bunood POS"), desc: __("The weight is read from the label. The prefix is one of the in-store ranges, 20 to 29 or 02. Empty: no scale labels.", null, "Bunood POS"), value: __("Grams", null, "Bunood POS"), sample: "01250" },
					S("counter", "unknown_barcode", __("Unknown barcode", null, "Bunood POS"), __("The sale carries on either way.", null, "Bunood POS"), [["offer", __("Offer to link or make an item", null, "Bunood POS")], ["alert", __("Alert only", null, "Bunood POS")]]),
				] },
				{ name: __("Receipt and customer screen", null, "Bunood POS"), intro: __("What happens after paying.", null, "Bunood POS"), rows: [
					S("native", "print_receipt_on_order_complete", __("Printing the receipt", null, "Bunood POS"), __("When a sale completes.", null, "Bunood POS"), [[true, __("Print automatically", null, "Bunood POS")], [false, __("On request", null, "Bunood POS")]]),
					{ kind: "format", source: "native", key: "print_format", label: __("Receipt print format", null, "Bunood POS"), desc: __("Empty: the invoice's default print format.", null, "Bunood POS"), options: settings?.ctx?.print_formats || [] },
					T("counter", "receipt_qr", __("Receipt code on the customer screen", null, "Bunood POS"), __("Walk-in sales without a VAT number only: anyone in the queue can scan it.", null, "Bunood POS")),
				] },
				{ name: __("Shift and drawer", null, "Bunood POS"), intro: __("Closing the shift.", null, "Bunood POS"), rows: [
					{ kind: "number", source: "counter", key: "reason_threshold", label: __("Difference that needs a reason", null, "Bunood POS"), desc: __("A closing difference above this needs a reason. 0: any difference.", null, "Bunood POS"), unit: currency(), max: 1000000 },
					S("counter", "held_on_close", __("Held sales at closing", null, "Bunood POS"), __("They stay held for the next shift, or today's close waits until they are completed. An abandoned one is deleted from the invoice list by whoever may delete invoices.", null, "Bunood POS"), [["carry", __("Carry to the next shift", null, "Bunood POS")], ["block", __("Block the close", null, "Bunood POS")]]),
				] },
			];
		}

		async function openSettings() {
			if (!state.profile?.can_edit || needsConnection()) return;
			state.heldOpen = false;
			renderHeldPopover();
			const settings = { ctx: null, native: null, counter: null, section: 0, busy: false, error: "", dirty: false, profile: state.profile.name };
			state.settings = settings;
			state.view = "settings";
			fill(body, listView);
			renderBar();
			renderFoot();
			renderSettingsView();
			try {
				const ctx = await api("settings_context", { pos_profile: settings.profile }, { type: "GET", silent: true });
				if (state.settings !== settings) return;
				settingsLoaded(ctx);
			} catch (error) {
				if (state.settings !== settings) return;
				settings.error = messageOf(error, __("The settings could not be read.", null, "Bunood POS"));
			}
			renderSettingsView();
		}

		function settingsLoaded(ctx) {
			const settings = state.settings;
			settings.ctx = ctx;
			settings.native = JSON.parse(JSON.stringify(ctx.native));
			settings.counter = JSON.parse(JSON.stringify(ctx.counter));
			settings.dirty = false;
		}

		// Anything that leaves the settings page with unsaved changes asks first.
		function unsavedGuard(go) {
			if (state.view === "settings" && state.settings?.dirty) {
				frappe.confirm(__("Leave without saving the changes?", null, "Bunood POS"), () => {
					state.settings = null;
					go();
				});
			} else {
				if (state.view === "settings") state.settings = null;
				go();
			}
		}

		function leaveSettings() {
			unsavedGuard(() => {
				if (state.context?.opening_entry) showSale();
				else renderGate();
			});
		}

		function changeSetting(source, key, value, quiet) {
			const settings = state.settings;
			if (!settings?.ctx?.can_edit || settings.busy) return;
			settings[source][key] = value;
			settings.dirty = JSON.stringify(settings.native) !== JSON.stringify(settings.ctx.native) || JSON.stringify(settings.counter) !== JSON.stringify(settings.ctx.counter);
			settings.error = "";
			if (!quiet) {
				renderSettingsView();
				return;
			}
			// While typing: only the save button and the state tag change.
			const saveButton = listView.querySelector(".bnd-pos__list-head .bnd-pos__primary");
			if (saveButton) saveButton.disabled = !settings.dirty;
			const tag = listView.querySelector(".bnd-pos__list-head .bnd-pos__tag");
			if (tag) {
				tag.textContent = settings.dirty ? __("Unsaved changes", null, "Bunood POS") : __("All saved", null, "Bunood POS");
				tag.toggleAttribute("data-tone", settings.dirty);
				if (settings.dirty) tag.setAttribute("data-tone", "warn");
			}
		}

		async function saveSettings() {
			const settings = state.settings;
			if (!settings?.dirty || settings.busy) return;
			const native = {};
			for (const [field, value] of Object.entries(settings.native)) {
				if (JSON.stringify(value) !== JSON.stringify(settings.ctx.native[field])) native[field] = value;
			}
			const counterChanges = {};
			for (const [field, value] of Object.entries(settings.counter)) {
				if (JSON.stringify(value) !== JSON.stringify(settings.ctx.counter[field])) counterChanges[field] = value;
			}
			const scope = ["warehouse", "item_groups", "hide_unavailable_items"].some((field) => field in native) || "company_items" in counterChanges;
			settings.busy = true;
			settings.error = "";
			renderSettingsView();
			try {
				const ctx = await api("save_settings", {
					pos_profile: settings.profile,
					native: JSON.stringify(native),
					counter: JSON.stringify(counterChanges),
					modified: settings.ctx.modified,
				}, { silent: true, freeze: true, message: __("Saving the settings…", null, "Bunood POS") });
				if (state.settings !== settings) return;
				settingsLoaded(ctx);
				flash("ok", __("Settings saved", null, "Bunood POS"));
				frappe.show_alert?.({ message: __("Settings saved", null, "Bunood POS"), indicator: "green" });
				// The counter takes the new settings at once: the profile as ERPNext now has it.
				try {
					const fresh = await api("get_context", { pos_profile: settings.profile }, { type: "GET", silent: true });
					if (fresh?.profile?.name === state.profile?.name) {
						state.context = fresh;
						state.profile = fresh.profile;
						root.toggleAttribute("data-fbar", fbarOn());
						root.setAttribute("data-tiles", counter("tiles") || "m");
						if (scope) {
							loadItems(false);
							refreshCatalog();
						}
					}
				} catch (_error) {
					flash("info", __("Saved. Reopen the counter to apply the settings.", null, "Bunood POS"));
				}
			} catch (error) {
				settings.error = messageOf(error, __("The settings were not saved.", null, "Bunood POS"));
			} finally {
				settings.busy = false;
				renderBar();
				renderSettingsView();
			}
		}

		function settingsRow(row) {
			const settings = state.settings;
			const editable = Boolean(settings.ctx.can_edit) && !settings.busy;
			const value = row.source ? settings[row.source][row.key] : null;
			let control = null;
			if (row.kind === "company") {
				control = h("strong", { class: "bnd-pos__setting-value" }, settings.ctx.company);
			} else if (row.kind === "warehouse") {
				// A shift's sales come from one warehouse: the server refuses a change under an open shift.
				const locked = row.shifts.length > 0;
				control = h("div", { class: "bnd-pos__setting-stack" },
					h("select", {
						class: "bnd-pos__select",
						"aria-label": row.label,
						disabled: !editable || locked,
						onchange: (event) => changeSetting("native", "warehouse", event.target.value),
					}, row.options.map((option) => h("option", { value: option.name, selected: option.name === value }, option.branch ? `${option.label} · ${__(option.branch)}` : option.label))),
					locked ? h("small", { class: "bnd-pos__muted" }, __("Close the open shifts first: {0}", [row.shifts.join(", ")])) : null);
			} else if (row.kind === "groups") {
				const chosen = value || [];
				const left = row.groups.filter((group) => !chosen.includes(group.name));
				control = h("div", { class: "bnd-pos__setting-stack" },
					h("div", { class: "bnd-pos__chipset" }, chosen.length ? chosen.map((name) => h("button", {
						type: "button",
						class: "bnd-pos__opt-chip",
						"aria-pressed": "true",
						"aria-label": __("Remove the item group: {0}", [__(name)]),
						disabled: !editable,
						onclick: () => changeSetting("native", "item_groups", chosen.filter((other) => other !== name)),
					}, __(name), " ×")) : h("span", { class: "bnd-pos__muted" }, __("Every item group", null, "Bunood POS"))),
					editable && left.length ? h("select", {
						class: "bnd-pos__select",
						"aria-label": __("Add an item group", null, "Bunood POS"),
						onchange: (event) => { if (event.target.value) changeSetting("native", "item_groups", chosen.concat([event.target.value])); },
					}, h("option", { value: "", selected: true }, __("Add an item group", null, "Bunood POS")),
					left.map((group) => h("option", { value: group.name }, group.is_group ? `${__(group.name)} …` : __(group.name)))) : null);
			} else if (row.kind === "toggle") {
				const on = row.invert ? !value : Boolean(value);
				control = h("button", {
					type: "button",
					class: "bnd-pos__switch",
					role: "switch",
					"aria-checked": String(on),
					"aria-label": row.label,
					disabled: !editable,
					onclick: () => changeSetting(row.source, row.key, row.invert ? on : !on),
				}, h("span", { class: "bnd-pos__switch-knob" }));
			} else if (row.kind === "options") {
				control = h("div", { class: "bnd-pos__options", role: "radiogroup", "aria-label": row.label }, row.options.map(([option, label]) => h("button", {
					type: "button",
					role: "radio",
					"aria-checked": String(option === value),
					disabled: !editable,
					onclick: () => changeSetting(row.source, row.key, option),
				}, label)));
			} else if (row.kind === "number") {
				control = h("label", { class: "bnd-pos__number" },
					h("input", {
						type: "text",
						name: `setting-${row.key}`,
						inputmode: "decimal",
						dir: "ltr",
						autocomplete: "off",
						"aria-label": row.label,
						value: String(value ?? 0),
						disabled: !editable,
						oninput: (event) => {
							const number = Math.min(Math.max(Number(latinDigits(event.target.value) || 0), 0), row.max);
							changeSetting(row.source, row.key, round(number, 2), true);
						},
						onchange: () => renderSettingsView(),
					}),
					h("span", null, row.unit));
			} else if (row.kind === "label") {
				control = h("div", { class: "bnd-pos__mask", dir: "ltr" },
					h("input", {
						type: "text",
						name: `setting-${row.key}`,
						inputmode: "numeric",
						maxlength: 2,
						autocomplete: "off",
						"aria-label": row.label,
						placeholder: "—",
						value: value || "",
						disabled: !editable,
						// Kept as typed; the server takes only 20-29 and 02, and says so.
						oninput: (event) => changeSetting(row.source, row.key, latinDigits(event.target.value).replace(/\./g, "").slice(0, 2), true),
						onchange: () => renderSettingsView(),
					}),
					h("span", { "data-part": "code" }, h("b", null, "01230"), h("small", null, __("Item code", null, "Bunood POS"))),
					h("span", { "data-part": "value" }, h("b", null, row.sample), h("small", null, row.value)),
					h("span", { "data-part": "check" }, h("b", null, "9"), h("small", null, __("Check", null, "Bunood POS"))));
			} else if (row.kind === "payments") {
				const chosen = settings.native.payments;
				control = h("div", { class: "bnd-pos__chipset" }, row.modes.map((mode) => {
					const index = chosen.findIndex((item) => item.mode_of_payment === mode.mode_of_payment);
					const on = index >= 0;
					return h("button", {
						type: "button",
						class: "bnd-pos__opt-chip",
						"aria-pressed": String(on),
						title: mode.has_account ? null : __("Set this method's account for the company first.", null, "Bunood POS"),
						disabled: !editable || (!on && !mode.has_account) || (on && chosen.length === 1),
						onclick: () => {
							const next = on ? chosen.filter((item) => item.mode_of_payment !== mode.mode_of_payment) : chosen.concat([{ mode_of_payment: mode.mode_of_payment, default: false }]);
							if (!next.some((item) => item.default) && next.length) next[0] = { ...next[0], default: true };
							changeSetting("native", "payments", next);
						},
					}, on ? svg("check", 14) : "+", " ", __(mode.mode_of_payment));
				}));
			} else if (row.kind === "default") {
				const chosen = settings.native.payments;
				control = h("div", { class: "bnd-pos__options", role: "radiogroup", "aria-label": row.label }, chosen.map((item) => h("button", {
					type: "button",
					role: "radio",
					"aria-checked": String(Boolean(item.default)),
					disabled: !editable,
					onclick: () => changeSetting("native", "payments", chosen.map((other) => ({ ...other, default: other.mode_of_payment === item.mode_of_payment }))),
				}, __(item.mode_of_payment))));
			} else if (row.kind === "bnpl") {
				const map = settings.counter.bnpl || {};
				const set = (mode, entry) => {
					const next = { ...map };
					if (entry) next[mode] = entry;
					else delete next[mode];
					changeSetting("counter", "bnpl", next);
				};
				control = row.modes.length ? h("div", { class: "bnd-pos__bnpl" }, row.modes.map((mode) => h("div", { class: "bnd-pos__bnpl-row" },
					h("strong", null, __(mode)),
					h("select", {
						class: "bnd-pos__select bnd-pos__select--small",
						"aria-label": __(mode),
						disabled: !editable,
						onchange: (event) => set(mode, event.target.value ? { provider: event.target.value, installments: map[mode]?.installments || 4 } : null),
					}, h("option", { value: "", selected: !map[mode] }, __("Not buy-now-pay-later", null, "Bunood POS")),
					h("option", { value: "tabby", selected: map[mode]?.provider === "tabby" }, "Tabby"),
					h("option", { value: "tamara", selected: map[mode]?.provider === "tamara" }, "Tamara")),
					map[mode] ? h("label", { class: "bnd-pos__number" },
						h("input", {
							type: "text",
							inputmode: "numeric",
							dir: "ltr",
							name: `setting-bnpl-${mode}`,
							"aria-label": __("Number of payments", null, "Bunood POS"),
							value: String(map[mode].installments),
							disabled: !editable,
							onchange: (event) => set(mode, { ...map[mode], installments: Math.min(Math.max(parseInt(latinDigits(event.target.value), 10) || 4, 2), 12) }),
						}),
						h("span", null, __("payments", null, "Bunood POS"))) : null)))
					: h("span", { class: "bnd-pos__muted" }, __("Add a card or other payment method first.", null, "Bunood POS"));
			} else if (row.kind === "notes") {
				const notes = value || [];
				control = h("div", { class: "bnd-pos__chipset" }, row.notes.map((note) => {
					const on = notes.includes(note);
					return h("button", {
						type: "button",
						class: "bnd-pos__opt-chip",
						"aria-pressed": String(on),
						disabled: !editable,
						onclick: () => changeSetting(row.source, row.key, on ? notes.filter((other) => other !== note) : notes.concat([note]).sort((a, b) => a - b)),
					}, on ? svg("check", 14) : "+", " ", ltr(String(note)));
				}));
			} else if (row.kind === "format") {
				control = h("select", {
					class: "bnd-pos__select",
					"aria-label": row.label,
					disabled: !editable,
					onchange: (event) => changeSetting(row.source, row.key, event.target.value),
				}, h("option", { value: "", selected: !value }, __("The invoice's default", null, "Bunood POS")),
				row.options.map((name) => h("option", { value: name, selected: name === value }, __(name))));
			}
			return h("div", { class: "bnd-pos__setting" },
				h("div", { class: "bnd-pos__setting-text" }, h("strong", null, row.label), h("span", null, row.desc)),
				control);
		}

		function renderSettingsView() {
			const settings = state.settings;
			if (!settings || state.view !== "settings") return;
			const head = h("div", { class: "bnd-pos__list-head" },
				h("h2", null, __("Point of sale settings", null, "Bunood POS")),
				h("span", { class: "bnd-pos__muted" }, settings.profile, settings.ctx?.company ? ` · ${settings.ctx.company}` : "", " — ", __("saved in the POS Profile, for everyone who sells on it", null, "Bunood POS")),
				h("span", { class: "bnd-pos__spacer" }),
				settings.ctx ? h("span", { class: "bnd-pos__tag", "data-tone": settings.dirty ? "warn" : null }, settings.dirty ? __("Unsaved changes", null, "Bunood POS") : __("All saved", null, "Bunood POS")) : null,
				h("button", { type: "button", class: "bnd-pos__ghost", onclick: leaveSettings }, __("Back", null, "Bunood POS"), " ", key("Esc")),
				settings.ctx?.can_edit ? h("button", { type: "button", class: "bnd-pos__primary", disabled: !settings.dirty || settings.busy, onclick: saveSettings }, __("Save", null, "Bunood POS")) : null);
			const error = settings.error ? h("div", { class: "bnd-pos__pay-error", role: "alert" }, svg("alert", 18), settings.error) : null;
			if (!settings.ctx) {
				keepField(() => fill(listView, h("div", { class: "bnd-pos__list bnd-pos__list--wide" }, head, error || h("p", { class: "bnd-pos__muted" }, __("Loading the settings…", null, "Bunood POS")))));
				return;
			}
			const sections = settingsSections();
			const current = sections[settings.section] || sections[0];
			keepField(() => fill(listView, h("div", { class: "bnd-pos__list bnd-pos__list--wide" }, head, error,
				settings.ctx.can_edit ? null : h("div", { class: "bnd-pos__notice" }, svg("alert", 18), h("span", null, __("You can view these settings. Changing them needs write access to the POS Profile.", null, "Bunood POS"))),
				h("div", { class: "bnd-pos__settings" },
					h("nav", { class: "bnd-pos__settings-nav", "aria-label": __("Settings sections", null, "Bunood POS") }, sections.map((section, index) => h("button", {
						type: "button",
						"aria-current": index === settings.section ? "page" : null,
						onclick: () => { settings.section = index; renderSettingsView(); },
					}, ltr(String(index + 1)), section.name))),
					h("section", { class: "bnd-pos__settings-body" },
						h("h3", null, current.name),
						h("p", { class: "bnd-pos__muted" }, current.intro),
						current.rows.map(settingsRow))))));
			// On a phone the sections are a strip: keep the open one in sight.
			listView.querySelector('.bnd-pos__settings-nav [aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
		}

		// ── Rendering ────────────────────────────────────────────────────────
		function showSale() {
			state.view = "sale";
			fill(body, saleLayout);
			renderBar();
			renderSaleParts();
			renderGroups();
			renderGrid();
			focusOmni();
		}

		function showList(view, returnHint) {
			if (state.view === "gate" || needsConnection()) return;
			state.view = view;
			state.returnHint = Boolean(returnHint);
			state.heldOpen = false;
			renderHeldPopover();
			fill(body, listView);
			renderBar();
			renderFoot();
			if (view === "held") { renderHeldView(); refreshHeld(); }
			else loadReceipts();
		}

		function renderSaleParts() {
			renderBill();
			renderPad();
			renderMult();
			renderAlert();
			renderStatus();
			renderPanel();
			renderFoot();
			renderPalette();
		}

		function renderBar() {
			const ctx = state.context;
			const online = !offline.on && navigator.onLine !== false;
			const waiting = state.profile ? queueFor(state.profile.name).length : 0;
			const locked = state.view === "gate" || ((state.view === "close" || state.view === "settings") && !ctx?.opening_entry);
			const tab = (view, label, count) => h("button", {
				type: "button",
				class: "bnd-pos__tab",
				"aria-current": state.view === view || (view === "sale" && state.view === "gate") || (view === "receipts" && state.view === "return") ? "page" : null,
				disabled: locked && view !== "sale",
				onclick: () => unsavedGuard(() => (view === "sale" ? showSale() : showList(view))),
			}, label, count ? h("span", { class: "bnd-pos__count", dir: "ltr" }, String(count)) : null);
			const opening = ctx?.opening_entry;
			const since = opening?.period_start_date ? frappe.datetime?.str_to_user?.(opening.period_start_date)?.split(" ").pop()?.slice(0, 5) : "";
			const menu = state.menuOpen ? h("div", { class: "bnd-pos__menu", role: "menu" },
				h("button", { type: "button", role: "menuitemcheckbox", "aria-checked": String(fbarOn()), onclick: toggleFbar }, __("Supermarket mode — function-key bar", null, "Bunood POS")),
				h("button", { type: "button", role: "menuitem", onclick: toggleFullscreen }, document.fullscreenElement ? __("Leave full screen", null, "Bunood POS") : __("Full screen", null, "Bunood POS")),
				opening ? h("button", { type: "button", role: "menuitem", onclick: () => { state.menuOpen = false; renderBar(); unsavedGuard(closeShift); } }, __("Review and close shift", null, "Bunood POS")) : null,
				state.profile?.can_edit ? h("button", { type: "button", role: "menuitem", onclick: () => { state.menuOpen = false; renderBar(); openSettings(); } }, __("Point of sale settings", null, "Bunood POS")) : null,
				h("button", { type: "button", role: "menuitem", onclick: () => { state.menuOpen = false; renderBar(); openHelp(); } }, __("Shortcuts", null, "Bunood POS"))) : null;
			fill(bar, 
				h("span", { class: "bnd-pos__brand", "aria-hidden": "true" }, (state.profile?.company || frappe.boot?.sysdefaults?.company || "B").slice(0, 1)),
				storeBadge(),
				h("nav", { class: "bnd-pos__tabs", "aria-label": __("POS views", null, "Bunood POS") },
					tab("sale", __("Sale", null, "Bunood POS")),
					canHold() ? tab("held", __("Held", null, "Bunood POS"), (state.held || []).length) : null,
					tab("receipts", __("Receipts and returns", null, "Bunood POS"))),
				h("span", { class: "bnd-pos__spacer" }),
				h("span", { class: "bnd-pos__pill", "data-tone": online ? "good" : "warn", title: online ? __("Connected", null, "Bunood POS") : null }, h("span", { class: "bnd-pos__dot" }), h("span", { class: "bnd-pos__pill-text" }, online ? __("Connected", null, "Bunood POS") : __("No connection — selling continues", null, "Bunood POS"))),
				waiting ? h("span", { class: "bnd-pos__pill", "data-tone": "warn" }, __("Waiting to send: {0}", [waiting])) : null,
				opening ? h("span", { class: "bnd-pos__pill" }, __("Shift", null, "Bunood POS"), " ", since ? ltr(since) : null, h("span", { class: "bnd-pos__pill-extra" }, " · ", opening.pos_profile)) : null,
				h("span", { class: "bnd-pos__user" }, frappe.user_info?.(frappe.session?.user)?.fullname || frappe.session?.user || ""),
				counter("customer_screen") === false ? null : h("button", {
					type: "button",
					class: "bnd-pos__icon-btn bnd-pos__screen-btn",
					"data-on": display.connected ? "1" : null,
					"aria-label": display.connected ? __("Customer screen: connected", null, "Bunood POS") : __("Open the customer screen", null, "Bunood POS"),
					title: display.connected ? __("Customer screen: connected", null, "Bunood POS") : __("Open the customer screen", null, "Bunood POS"),
					onclick: openDisplay,
				}, svg("monitor", 18)),
				h("span", { class: "bnd-pos__menu-wrap" },
					h("button", { type: "button", class: "bnd-pos__icon-btn", "aria-label": __("Counter settings", null, "Bunood POS"), "aria-expanded": String(state.menuOpen), onclick: () => { state.menuOpen = !state.menuOpen; renderBar(); } }, svg("settings", 18)),
					menu),
				h("button", { type: "button", class: "bnd-pos__icon-btn", "aria-label": __("Leave the counter", null, "Bunood POS"), onclick: () => unsavedGuard(() => frappe.set_route("")) }, svg("exit", 18)),
			);
		}

		// Which company and warehouse this counter sells from, always in sight.
		function storeBadge() {
			const store = state.profile?.store;
			if (!store) return null;
			const place = store.branch ? `${__(store.branch)} · ${store.warehouse_name}` : store.warehouse_name;
			return h("span", { class: "bnd-pos__store", title: `${store.company} · ${store.warehouse}` },
				svg("store", 16),
				h("span", { class: "bnd-pos__store-text" }, h("small", null, store.company), h("strong", null, place)));
		}

		function renderBill() {
			pushDisplay();
			const t = totals();
			const walkIn = isWalkIn();
			const taxInvoice = !walkIn && Boolean(state.customerTaxId);
			fill(billHead, 
				h("strong", { class: "bnd-pos__bill-title" }, state.draft ? __("Held bill", null, "Bunood POS") : __("Bill", null, "Bunood POS")),
				state.draft ? ltr(state.draft, "bnd-pos__muted") : null,
				h("span", { class: "bnd-pos__spacer" }),
				h("button", { type: "button", class: "bnd-pos__customer", "data-named": walkIn ? null : "1", onclick: openCustomer, disabled: state.screen === "done" },
					svg("user", 16), h("span", { class: "bnd-pos__ellipsis" }, state.customerName || state.customer || __("Walk-in customer", null, "Bunood POS")),
					taxInvoice ? h("span", { class: "bnd-pos__tag" }, __("Tax invoice", null, "Bunood POS")) : null,
					key("F3")),
				canHold() ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: hold, disabled: state.screen !== "sale" || !state.lines.length }, svg("pause", 15), __("Hold", null, "Bunood POS")) : null,
			);

			const amounts = shownAmounts();
			fill(billLines, ...(state.lines.length ? state.lines.map((line, index) => {
				const on = index === state.sel && state.screen === "sale";
				const shown = amounts[index];
				const ring = (mode) => (on && state.mode === mode ? "1" : null);
				return h("button", {
					type: "button",
					class: "bnd-pos__line",
					role: "option",
					"aria-selected": String(on),
					"data-empty": line.qty <= 0 ? "1" : null,
					onclick: () => { if (state.screen !== "sale") return; state.sel = index; state.fresh = true; state.buf = ""; renderBill(); renderPad(); focusOmni(); },
				},
				h("span", { class: "bnd-pos__qty", "data-ring": ring("qty"), dir: "ltr" }, qtyText(line)),
				h("span", { class: "bnd-pos__line-text" },
					h("strong", { class: "bnd-pos__ellipsis" }, line.item_name),
					h("span", { class: "bnd-pos__line-sub" },
						h("bdi", { dir: "ltr", class: "bnd-pos__ring", "data-ring": ring("price") }, num(line.rate, 2)),
						" / ", unitLabel(line.uom),
						line.discount_percentage ? [" · ", h("span", { class: "bnd-pos__disc bnd-pos__ring", "data-ring": ring("disc") }, __("{0}% off", [num(line.discount_percentage, 2)]))] : null,
						on && state.mode === "disc" && !line.discount_percentage ? [" · ", h("span", { class: "bnd-pos__disc bnd-pos__ring", "data-ring": "1" }, __("Discount %", null, "Bunood POS"))] : null)),
				h("span", { class: "bnd-pos__amount" }, ltr(money(shown))));
			}) : [h("div", { class: "bnd-pos__empty" },
				svg("scan", 34),
				h("strong", null, __("The bill is ready", null, "Bunood POS")),
				h("span", null, __("Scan the first item or touch one on the other side. No need to choose the customer now.", null, "Bunood POS")))]));

			const pieces = state.lines.reduce((sum, line) => sum + (line.weighed ? 1 : Math.max(line.qty, 0)), 0);
			fill(billTotals, 
				h("div", { class: "bnd-pos__totals-side" },
					h("span", null, __("Lines: {0} · Pieces: {1}", [state.lines.length, round(pieces, 3)])),
					h("span", null, __("Before VAT", null, "Bunood POS"), " ", h("b", null, ltr(money(t.net))), " · ", __("VAT", null, "Bunood POS"), " ", h("b", null, ltr(money(t.vat))),
						t.rounding ? [" · ", __("Rounding", null, "Bunood POS"), " ", h("b", null, ltr(num(t.rounding, 2)))] : null)),
				h("div", { class: "bnd-pos__totals-main", "data-exact": t.exact ? "1" : null },
					h("span", null, t.exact || !state.lines.length ? __("Total", null, "Bunood POS") : __("Total (estimating…)", null, "Bunood POS")),
					h("strong", null, ltr(money(t.total)))));
		}

		function renderPad() {
			const sale = state.screen === "sale";
			const paying = state.screen === "pay";
			const done = state.screen === "done";
			const t = totals();
			const cell = (id, label, col, row, opts) => {
				const o = opts || {};
				return h("button", {
					type: "button",
					class: `bnd-pos__k ${o.kind ? `bnd-pos__k--${o.kind}` : ""}`,
					style: `grid-column:${col};grid-row:${row}`,
					"aria-label": o.aria || label,
					"aria-pressed": o.pressed === undefined ? null : String(o.pressed),
					disabled: o.off || state.busy || null,
					onclick: () => press(id),
				}, h("span", { dir: o.rtl ? "rtl" : "ltr" }, label), o.sub ? h("small", { dir: "ltr" }, o.sub) : null);
			};
			const card = cardMethod();
			const cash = cashMethod();
			const modeOff = !sale || !selected();
			const payLabel = done ? __("New sale", null, "Bunood POS") : paying ? __("Complete", null, "Bunood POS") : __("Pay", null, "Bunood POS");
			fill(pad, 
				cell("mada", paying ? `+ ${__(card?.mode_of_payment || "Card")}` : __(card?.mode_of_payment || "Card"), 1, 1, { kind: "card", rtl: true, off: done || !card, sub: sale ? "F8" : null }),
				cell("cash", paying ? `+ ${__(cash?.mode_of_payment || "Cash")}` : __("Exact cash", null, "Bunood POS"), 1, 2, { kind: "cash", rtl: true, off: done || !cash, sub: sale ? "F10" : null }),
				cell("pay", payLabel, 1, "3 / span 2", { kind: done ? "done" : "pay", rtl: true, sub: done ? "Enter" : paying ? "Enter" : money(t.total) }),
				cell("back", "⌫", 2, 1, { kind: "util", aria: __("Delete a digit", null, "Bunood POS"), off: done }),
				cell("clear", "C", 2, 2, { kind: "util", aria: __("Clear", null, "Bunood POS"), off: done }),
				cell("mult", "×", 2, 3, { kind: "util", aria: __("Count for the next scan", null, "Bunood POS"), off: !sale }),
				cell("enter", "⏎", 2, 4, { kind: "util", aria: __("Enter", null, "Bunood POS"), off: done }),
				cell("7", "7", 3, 1, { off: done }), cell("8", "8", 4, 1, { off: done }), cell("9", "9", 5, 1, { off: done }),
				cell("4", "4", 3, 2, { off: done }), cell("5", "5", 4, 2, { off: done }), cell("6", "6", 5, 2, { off: done }),
				cell("1", "1", 3, 3, { off: done }), cell("2", "2", 4, 3, { off: done }), cell("3", "3", 5, 3, { off: done }),
				cell("0", "0", 3, 4, { off: done }), cell("00", "00", 4, 4, { off: done }), cell(".", ".", 5, 4, { off: done }),
				cell("qty", __("Qty", null, "Bunood POS"), 6, 1, { kind: "mode", rtl: true, off: modeOff, pressed: sale && Boolean(selected()) && state.mode === "qty" }),
				cell("price", __("Price", null, "Bunood POS"), 6, 2, { kind: "mode", rtl: true, off: modeOff || !canEdit("price"), pressed: sale && Boolean(selected()) && state.mode === "price" }),
				cell("disc", __("Disc %", null, "Bunood POS"), 6, 3, { kind: "mode", rtl: true, off: modeOff || !canEdit("disc"), pressed: sale && Boolean(selected()) && state.mode === "disc" }),
				cell("del", __("Delete", null, "Bunood POS"), 6, 4, { kind: "danger", rtl: true, off: modeOff }),
			);
		}

		function renderMult() {
			multChip.hidden = !state.mult;
			multChip.textContent = state.mult ? `× ${state.mult}` : "";
			const grammarKeys = [["/", __("Commands", null, "Bunood POS")], ["@", __("Customer", null, "Bunood POS")], ["*", __("Quantity", null, "Bunood POS")], ["-%", __("Discount", null, "Bunood POS")]];
			fill(grammar, ...grammarKeys.map(([text, title]) => h("button", {
				type: "button",
				class: "bnd-pos__chip",
				title,
				"aria-label": title,
				onclick: (event) => { event.preventDefault(); setQuery(text === "-%" ? "-" : text); focusOmni(); },
			}, ltr(text))));
			omniWrap.toggleAttribute("data-alert", Boolean(state.unknown));
		}

		function renderPalette() {
			const palette = state.palette;
			if (!palette || (!palette.items.length && !palette.loading) || state.view !== "sale") {
				paletteBox.hidden = true;
				fill(paletteBox);
				return;
			}
			paletteBox.hidden = false;
			fill(paletteBox, 
				h("span", { class: "bnd-pos__palette-title" }, palette.title),
				...palette.items.map((row, index) => h("button", {
					type: "button",
					class: "bnd-pos__palette-row",
					role: "option",
					"aria-selected": String(index === state.pi),
					onclick: () => row.run(),
				}, h("span", { class: "bnd-pos__glyph" }, row.glyph || "·"),
				h("span", { class: "bnd-pos__palette-text" }, h("strong", null, row.title), row.sub ? h("span", null, row.sub) : null),
				row.end ? ltr(row.end, "bnd-pos__palette-end") : null)),
				palette.loading && !palette.items.length ? h("span", { class: "bnd-pos__palette-title" }, __("Searching…", null, "Bunood POS")) : null,
				h("span", { class: "bnd-pos__palette-foot" }, __("↑ ↓ to move · Enter to run · Esc to close", null, "Bunood POS")));
		}

		function renderAlert() {
			if (!state.unknown || state.view !== "sale") {
				alertBox.hidden = true;
				fill(alertBox);
				renderMult();
				return;
			}
			const offer = counter("unknown_barcode") !== "alert" && !offline.on;
			const canItem = offer && frappe.model?.can_create?.("Item");
			alertBox.hidden = false;
			fill(alertBox, 
				h("span", { class: "bnd-pos__alert-mark" }, "!"),
				h("span", { class: "bnd-pos__alert-text" }, h("strong", null, __("Unknown barcode", null, "Bunood POS")), " ", ltr(state.unknown), " — ", __("the sale carries on", null, "Bunood POS")),
				canItem ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: openLink }, __("Link to an existing item", null, "Bunood POS")) : null,
				canItem && counter("new_item") !== false ? h("button", { type: "button", class: "bnd-pos__dark", onclick: newItem }, __("New item", null, "Bunood POS"), " ", key("F4")) : null,
				h("button", { type: "button", class: "bnd-pos__icon-btn", "aria-label": __("Dismiss", null, "Bunood POS"), onclick: () => { state.unknown = ""; renderAlert(); focusOmni(); } }, "×"));
			renderMult();
		}

		function renderGroups() {
			const groups = state.context?.item_groups || [];
			const names = groups.map((row) => (typeof row === "string" ? row : row.name || row.item_group)).filter(Boolean);
			fill(groupsBar, 
				h("button", { type: "button", role: "tab", class: "bnd-pos__group", "aria-selected": String(!state.group), onclick: () => chooseGroup("") }, __("All items", null, "Bunood POS")),
				...names.map((name) => h("button", { type: "button", role: "tab", class: "bnd-pos__group", hue: hueFor(name), "aria-selected": String(state.group === name), onclick: () => chooseGroup(name) }, __(name))));
		}
		function chooseGroup(name) {
			state.group = name;
			setQuery("");
			renderGroups();
			loadItems(false);
			focusOmni();
		}

		function renderStatus() {
			const flashText = state.flash?.text || "";
			const text = textQuery();
			fill(statusLine, 
				h("span", { class: "bnd-pos__dot", "data-tone": state.flash?.kind || "info" }),
				h("span", { class: "bnd-pos__flash", "data-tone": state.flash?.kind || "info" }, flashText),
				h("span", { class: "bnd-pos__spacer" }),
				h("span", { class: "bnd-pos__muted" }, state.itemsLoading ? __("Loading items…", null, "Bunood POS")
					: text ? __("Results for «{0}»: {1} — Enter adds the first", [text, state.items.length])
						: __("Items: {0}", [state.items.length])));
		}

		function renderGrid() {
			if (state.view !== "sale") return;
			const inCart = {};
			for (const line of state.lines) inCart[line.item_code] = (inCart[line.item_code] || 0) + line.qty;
			const hideImages = state.profile?.hide_images;
			const tiles = state.items.map((item) => {
				const stock = item.actual_qty;
				const isStock = item.is_stock_item !== 0 && stock !== undefined && stock !== null;
				let tone = "good";
				let label = isStock ? __("In stock {0}", [round(stock, 2)]) : __("Service", null, "Bunood POS");
				if (weighed(item)) { label = __("By weight", null, "Bunood POS"); tone = "warn"; }
				if (!isStock) tone = "neutral";
				else if (stock <= 0) { tone = "bad"; label = __("Out of stock", null, "Bunood POS"); }
				else if (stock <= 10 && !weighed(item)) { tone = "warn"; label = __("Left: {0}", [round(stock, 2)]); }
				const count = inCart[item.item_code];
				return h("button", {
					type: "button",
					class: "bnd-pos__tile",
					hue: hueFor(item.item_group || state.group || ""),
					"data-out": tone === "bad" ? "1" : null,
					"aria-label": `${item.item_name || item.item_code} — ${money(item.price_list_rate)}`,
					onclick: () => {
						if (weighed(item)) {
							addItem(item, 1);
							state.mode = "qty";
							flash("info", __("{0} — put it on the scale or type the weight on the pad", [item.item_name || item.item_code]));
						} else addItem(item, state.mult || 1);
						focusOmni();
					},
				},
				!hideImages && item.item_image ? h("img", { class: "bnd-pos__tile-img", src: item.item_image, alt: "", loading: "lazy" }) : null,
				h("strong", { class: "bnd-pos__tile-name" }, item.item_name || item.item_code),
				h("span", { class: "bnd-pos__tile-foot" },
					h("b", null, ltr(money(item.price_list_rate))),
					h("span", { class: "bnd-pos__stock", "data-tone": tone }, label)),
				// No dir on the badge itself: its inset-inline-end must resolve in the page's direction.
				count ? h("span", { class: "bnd-pos__badge" }, ltr(String(round(count, 2)))) : null);
			});
			fill(grid, ...tiles);
			if (!tiles.length && !state.itemsLoading) {
				grid.append(h("div", { class: "bnd-pos__empty bnd-pos__empty--grid" },
					h("strong", null, textQuery() ? __("No item with this name", null, "Bunood POS") : __("No items in this group", null, "Bunood POS")),
					h("span", null, __("Try another name, scan the barcode, or add it as a new item.", null, "Bunood POS"))));
			}
			if (state.more) grid.append(h("button", { type: "button", class: "bnd-pos__more", onclick: () => loadItems(true) }, __("More items", null, "Bunood POS")));
		}

		function renderPanel() {
			pushDisplay();
			const paying = state.screen === "pay";
			const done = state.screen === "done";
			panel.hidden = !(paying || done);
			if (!paying && !done) { fill(panel); return; }
			if (done && state.done?.offline) {
				const result = state.done;
				fill(panel, h("div", { class: "bnd-pos__done" },
					h("div", { class: "bnd-pos__done-main", "data-offline": "1" },
						h("span", { class: "bnd-pos__done-mark" }, svg("check", 38)),
						h("strong", { class: "bnd-pos__done-title" }, __("Sale kept on this device", null, "Bunood POS")),
						h("span", null, Number(result.change_amount) > 0 ? __("Change for the customer", null, "Bunood POS") : __("No change", null, "Bunood POS")),
						h("strong", { class: "bnd-pos__done-change" }, ltr(money(result.change_amount))),
						h("span", { class: "bnd-pos__muted" }, __("Sent to ERPNext when the connection returns.", null, "Bunood POS"))),
					h("div", { class: "bnd-pos__done-actions" },
						h("button", { type: "button", class: "bnd-pos__ghost bnd-pos__ghost--tall", onclick: () => printProvisional(result.sale) }, svg("printer", 18), __("Provisional receipt", null, "Bunood POS"), " ", key("Ctrl+P")),
						h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", onclick: () => resetSale() }, __("New sale", null, "Bunood POS"), " ", key("Enter")))));
				return;
			}
			if (done) {
				const result = state.done || {};
				const change = Number(result.change_amount || 0);
				const owed = Math.max(round(Number(result.rounded_total || result.grand_total || 0) - Number(result.paid_amount || 0)), 0);
				const used = (result.payments || []).map((row) => __(row.mode_of_payment)).filter((v, i, a) => a.indexOf(v) === i).join(" + ");
				fill(panel, h("div", { class: "bnd-pos__done" },
					h("div", { class: "bnd-pos__done-main" },
						h("span", { class: "bnd-pos__done-mark" }, svg("check", 38)),
						h("strong", { class: "bnd-pos__done-title" }, __("Sale complete", null, "Bunood POS"), used ? ` · ${used}` : ""),
						h("span", null, owed > 0 ? __("Left on the customer's account", null, "Bunood POS") : change > 0 ? __("Change for the customer", null, "Bunood POS") : __("No change", null, "Bunood POS")),
						h("strong", { class: "bnd-pos__done-change", "data-owed": owed > 0 ? "1" : null }, ltr(money(owed > 0 ? owed : change))),
						h("span", { class: "bnd-pos__muted" }, ltr(result.name || ""), " · ", ltr(money(result.rounded_total || result.grand_total))),
						h("span", { class: "bnd-pos__muted" }, __("Scan the next item or press Enter — a new sale starts by itself", null, "Bunood POS"))),
					h("div", { class: "bnd-pos__done-actions" },
						result.name && state.context?.capabilities?.can_print_invoice !== false
							? h("button", { type: "button", class: "bnd-pos__ghost bnd-pos__ghost--tall", onclick: () => printReceipt(result.doctype, result.name) }, svg("printer", 18), __("Print receipt", null, "Bunood POS"), " ", key("Ctrl+P"))
							: null,
						h("button", { type: "button", class: "bnd-pos__ghost bnd-pos__ghost--tall", onclick: () => frappe.set_route("Form", result.doctype, result.name) }, __("Open the invoice", null, "Bunood POS")),
						h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", onclick: () => resetSale() }, __("New sale", null, "Bunood POS"), " ", key("Enter")))));
				return;
			}
			const total = due();
			const sum = paid();
			const rest = round(total - sum);
			const methodButtons = methods().map((row) => h("button", {
				type: "button",
				class: "bnd-pos__method",
				"data-tone": methodTone(row),
				onclick: () => addPay(row),
			}, h("span", { class: "bnd-pos__swatch" }), "+ ", __(row.mode_of_payment)));
			const lines = state.pays.map((row, index) => {
				const method = methods().find((m) => m.mode_of_payment === row.mode_of_payment);
				const tone = methodTone(method);
				return h("div", { class: "bnd-pos__tender" },
					h("button", {
						type: "button",
						class: "bnd-pos__tender-main",
						"data-tone": tone,
						"aria-pressed": String(index === state.psel),
						onclick: () => { state.psel = index; state.payFresh = true; state.payBuf = ""; renderPanel(); focusOmni(); },
					},
					h("span", { class: "bnd-pos__swatch" }),
					h("span", { class: "bnd-pos__tender-text" }, h("strong", null, __(row.mode_of_payment)), h("span", null, tone === "bnpl"
						? [__("Payments: {0} ×", [bnplOf(row.mode_of_payment).installments]), " ", ltr(money(round(Number(row.amount || 0) / bnplOf(row.mode_of_payment).installments)))]
						: tone === "cash" ? __("Into the drawer", null, "Bunood POS") : tone === "card" ? __("Sent to the card terminal", null, "Bunood POS") : __("Other tender", null, "Bunood POS"))),
					h("strong", { class: "bnd-pos__tender-amount" }, ltr(money(row.amount)))),
					tone !== "cash" ? h("input", {
						class: "bnd-pos__ref",
						type: "text",
						dir: "ltr",
						value: row.reference_no || "",
						placeholder: tone === "bnpl" ? __("Order number from the app (required)", null, "Bunood POS") : __("Reference (optional)", null, "Bunood POS"),
						"data-required": tone === "bnpl" ? "1" : null,
						"aria-label": __("Payment reference for {0}", [__(row.mode_of_payment)]),
						oninput: (event) => { row.reference_no = event.target.value; },
					}) : null,
					h("button", { type: "button", class: "bnd-pos__icon-btn", "aria-label": __("Remove this payment", null, "Bunood POS"), onclick: () => { state.pays.splice(index, 1); state.psel = state.pays.length - 1; renderPanel(); focusOmni(); } }, "×"));
			});
			const notes = cashMethod() ? cashSuggestions(total).map((value, index) => h("button", {
				type: "button",
				class: "bnd-pos__note-btn",
				onclick: () => quickCash(value),
			}, ltr(Number.isInteger(value) ? String(value) : num(value, 2)), h("small", null, index === 0 ? __("Exact", null, "Bunood POS") : __("Note", null, "Bunood POS")))) : [];
			const restLabel = rest > 0.001 ? (state.profile?.allow_partial_payment && !isWalkIn() ? __("Remaining — on the customer's account", null, "Bunood POS") : __("Remaining", null, "Bunood POS")) : __("Change for the customer", null, "Bunood POS");
			fill(panel, h("div", { class: "bnd-pos__pay" },
				h("div", { class: "bnd-pos__pay-head" },
					h("strong", null, __("Payment", null, "Bunood POS")),
					h("span", { class: "bnd-pos__tag", "data-tone": state.customerTaxId && !isWalkIn() ? "blue" : null }, state.customerTaxId && !isWalkIn() ? __("Tax invoice — {0}", [state.customerName]) : __("Simplified tax invoice", null, "Bunood POS")),
					h("span", { class: "bnd-pos__spacer" }),
					h("button", { type: "button", class: "bnd-pos__ghost", onclick: () => { state.screen = "sale"; renderSaleParts(); focusOmni(); } }, __("Back to items", null, "Bunood POS"), " ", key("Esc"))),
				h("div", { class: "bnd-pos__stats" },
					h("div", null, h("span", null, __("Due", null, "Bunood POS")), h("strong", null, ltr(money(total)))),
					h("div", null, h("span", null, __("Paid", null, "Bunood POS")), h("strong", null, ltr(money(sum)))),
					h("div", { "data-tone": rest > 0.001 ? "warn" : "good" }, h("span", null, restLabel), h("strong", null, ltr(money(Math.abs(rest)))))),
				h("div", { class: "bnd-pos__methods" }, methodButtons),
				h("div", { class: "bnd-pos__tenders" }, lines.length ? lines : h("div", { class: "bnd-pos__tenders-empty" }, __("Choose a payment method above or beside the pad — or press Complete to take the exact amount in cash", null, "Bunood POS"))),
				notes.length ? h("div", { class: "bnd-pos__notes-row" }, h("span", { class: "bnd-pos__muted" }, __("Quick cash:", null, "Bunood POS")), notes) : null,
				state.payErr ? h("div", { class: "bnd-pos__pay-error", role: "alert" }, state.payErr, isWalkIn() && rest > 0.001 ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: openCustomer }, __("Choose a customer", null, "Bunood POS"), " ", key("F3")) : null) : null));
		}

		function renderFoot() {
			const fbar = fbarOn() && state.view === "sale";
			if (["gate", "close", "return", "settings"].includes(state.view)) { fill(foot); return; }
			if (fbar) {
				const keys = [
					["F1", __("Shortcuts", null, "Bunood POS"), openHelp],
					["F2", __("Scan", null, "Bunood POS"), () => { setQuery(""); focusOmni(); }],
					["F3", __("Customer", null, "Bunood POS"), openCustomer],
					counter("new_item") === false || counter("unknown_barcode") === "alert" ? null : ["F4", __("New item", null, "Bunood POS"), () => (state.unknown ? newItem() : flash("info", __("Scan the new barcode first, then choose New item", null, "Bunood POS"))) ],
					canHold() ? ["F6", __("Hold", null, "Bunood POS"), hold] : null,
					canHold() ? ["F7", __("Held", null, "Bunood POS"), toggleHeld] : null,
					["Alt+R", __("Returns", null, "Bunood POS"), () => showList("receipts", true)],
					["Del", __("Delete line", null, "Bunood POS"), removeSelected],
					["F8", __("Card", null, "Bunood POS"), () => press("mada")],
					["F10", __("Exact cash", null, "Bunood POS"), () => press("cash")],
					["F9", __("Pay", null, "Bunood POS"), () => press("pay")],
				];
				fill(foot, h("div", { class: "bnd-pos__fbar" }, keys.filter(Boolean).map(([k, label, run]) => h("button", {
					type: "button",
					class: "bnd-pos__fkey",
					"data-main": k === "F9" ? "1" : null,
					onclick: () => { run(); focusOmni(); },
				}, ltr(k, "bnd-pos__fkey-k"), h("span", null, label)))));
				return;
			}
			const hints = [["F1", __("Shortcuts", null, "Bunood POS")], ["F2", __("Scan", null, "Bunood POS")], ["F3", __("Customer", null, "Bunood POS")], canHold() ? ["F6", __("Hold", null, "Bunood POS")] : null, canHold() ? ["F7", __("Held", null, "Bunood POS")] : null, ["F8", __("Card", null, "Bunood POS")], ["F9", __("Pay", null, "Bunood POS")], ["F10", __("Exact cash", null, "Bunood POS")], ["Alt+R", __("Returns", null, "Bunood POS")], ["/", __("Commands", null, "Bunood POS")]].filter(Boolean);
			fill(foot, h("div", { class: "bnd-pos__hints" }, hints.map(([k, label]) => h("span", null, key(k), label))));
		}

		function renderHeldPopover() {
			const old = root.querySelector(".bnd-pos__held-pop");
			if (old) old.remove();
			if (!state.heldOpen) return;
			const rows = state.held || [];
			root.append(h("div", { class: "bnd-pos__held-pop", role: "dialog", "aria-label": __("Held sales", null, "Bunood POS") },
				h("div", { class: "bnd-pos__held-head" }, h("strong", null, __("Held sales", null, "Bunood POS")), h("button", { type: "button", class: "bnd-pos__link", onclick: () => showList("held") }, __("Show all", null, "Bunood POS"))),
				rows.length ? rows.slice(0, 6).map((row) => h("button", { type: "button", class: "bnd-pos__held-row", onclick: () => resume(row.name) },
					h("span", { class: "bnd-pos__held-text" }, h("strong", null, row.customer_name || row.customer), h("span", null, ltr(row.name), " · ", __("Pieces: {0}", [round(row.total_qty || 0, 2)]), " · ", frappe.datetime?.prettyDate ? frappe.datetime.prettyDate(row.modified) : "")),
					ltr(money(row.grand_total), "bnd-pos__held-total")))
					: h("p", { class: "bnd-pos__muted" }, __("No held sales", null, "Bunood POS"))));
		}

		function renderHeldView() {
			const rows = state.held || [];
			fill(listView, h("div", { class: "bnd-pos__list" },
				h("div", { class: "bnd-pos__list-head" }, h("h2", null, __("Held sales", null, "Bunood POS")), h("span", { class: "bnd-pos__muted" }, __("A held sale is a draft: it takes no stock and is not reported to ZATCA until it is paid.", null, "Bunood POS"))),
				rows.length ? h("div", { class: "bnd-pos__cards" }, rows.map((row) => h("article", { class: "bnd-pos__card" },
					h("div", { class: "bnd-pos__card-top" }, h("strong", null, row.customer_name || row.customer), h("b", null, ltr(money(row.grand_total)))),
					h("span", { class: "bnd-pos__muted" }, ltr(row.name), " · ", __("Pieces: {0}", [round(row.total_qty || 0, 2)]), " · ", frappe.datetime?.prettyDate ? frappe.datetime.prettyDate(row.modified) : ""),
					h("div", { class: "bnd-pos__card-actions" },
						h("button", { type: "button", class: "bnd-pos__primary", onclick: () => resume(row.name) }, __("Resume", null, "Bunood POS")),
						h("button", { type: "button", class: "bnd-pos__ghost", onclick: () => frappe.set_route("Form", state.context.invoice_type, row.name) }, __("Open", null, "Bunood POS"))))))
					: h("div", { class: "bnd-pos__empty" }, h("strong", null, __("No held sales", null, "Bunood POS")), h("span", null, __("Hold a bill with F6 to serve the next customer, then bring it back with F7.", null, "Bunood POS")))));
		}

		let receiptsTimer = 0;
		async function loadReceipts() {
			renderReceiptsView(true);
			try {
				const result = await api("receipt_register", { mode: state.receiptsMode, pos_profile: state.profile?.name || "", search_term: state.receiptsTerm, limit: 40 }, { type: "GET" });
				state.receipts = result?.rows || [];
			} catch (error) {
				state.receipts = [];
				flash("err", messageOf(error, __("Receipts could not be loaded.", null, "Bunood POS")));
			}
			renderReceiptsView(false);
		}

		function renderReceiptsView(loading) {
			const focused = document.activeElement?.classList?.contains("bnd-pos__receipts-search");
			const search = h("input", {
				class: "bnd-pos__receipts-search",
				type: "search",
				value: state.receiptsTerm,
				placeholder: __("Invoice number or customer", null, "Bunood POS"),
				"aria-label": __("Search receipts", null, "Bunood POS"),
				oninput: (event) => { state.receiptsTerm = event.target.value; clearTimeout(receiptsTimer); receiptsTimer = setTimeout(loadReceipts, 260); },
			});
			const modes = [["shift", __("This shift", null, "Bunood POS")], ["today", __("Today", null, "Bunood POS")], ["returns", __("Returns", null, "Bunood POS")], ["mine", __("Mine", null, "Bunood POS")]];
			const canReturn = state.context?.capabilities?.can_create_invoice && counter("returns") !== false;
			fill(listView, h("div", { class: "bnd-pos__list" },
				h("div", { class: "bnd-pos__list-head" }, h("h2", null, __("Receipts and returns", null, "Bunood POS")),
					state.returnHint ? h("span", { class: "bnd-pos__tag", "data-tone": "warn" }, __("To return items: find the receipt, then press Return", null, "Bunood POS")) : null,
					h("span", { class: "bnd-pos__spacer" }),
					h("button", { type: "button", class: "bnd-pos__link", onclick: () => frappe.set_route("bnd-pos-register") }, __("All POS receipts", null, "Bunood POS"))),
				h("div", { class: "bnd-pos__toolbar" }, search, modes.map(([mode, label]) => h("button", { type: "button", class: "bnd-pos__filter", "aria-pressed": String(state.receiptsMode === mode), onclick: () => { state.receiptsMode = mode; loadReceipts(); } }, label))),
				loading && !state.receipts.length ? h("p", { class: "bnd-pos__muted" }, __("Loading receipts…", null, "Bunood POS"))
					: state.receipts.length ? h("div", { class: "bnd-pos__table", role: "table" },
						h("div", { class: "bnd-pos__tr bnd-pos__tr--head", role: "row" }, [__("Time", null, "Bunood POS"), __("Number", null, "Bunood POS"), __("Customer", null, "Bunood POS"), __("Total", null, "Bunood POS"), __("Status", null, "Bunood POS"), ""].map((text) => h("span", { role: "columnheader" }, text))),
						state.receipts.map((row) => h("div", { class: "bnd-pos__tr", role: "row", "data-return": row.is_return ? "1" : null },
							h("span", { role: "cell" }, ltr(String(row.posting_time || "").slice(0, 5))),
							h("span", { role: "cell" }, ltr(row.name)),
							h("span", { role: "cell", class: "bnd-pos__ellipsis" }, row.customer_name || row.customer, row.is_return ? h("span", { class: "bnd-pos__tag", "data-tone": "bad" }, __("Return", null, "Bunood POS")) : null),
							h("span", { role: "cell", class: "bnd-pos__num" }, ltr(money(row.grand_total))),
							h("span", { role: "cell" }, __(row.status || "")),
							h("span", { role: "cell", class: "bnd-pos__row-actions" },
								h("button", { type: "button", class: "bnd-pos__ghost", onclick: () => printReceipt(row.doctype, row.name) }, svg("printer", 15), __("Print", null, "Bunood POS")),
								!row.is_return && canReturn ? h("button", { type: "button", class: "bnd-pos__ghost", onclick: () => createReturn(row) }, svg("undo", 15), __("Return", null, "Bunood POS")) : null))))
						: h("div", { class: "bnd-pos__empty" }, h("strong", null, __("No receipts here", null, "Bunood POS")), h("span", null, __("Change the filter or search by invoice number.", null, "Bunood POS")))));
			if (focused) {
				const input = listView.querySelector(".bnd-pos__receipts-search");
				input?.focus();
				input?.setSelectionRange?.(input.value.length, input.value.length);
			}
		}

		// ── Returning part of a receipt ──────────────────────────────────────
		// The lines, condition, reason and refund are chosen here; the credit
		// note is ERPNext's own, built and checked by pos.submit_return.
		function returnReasons() {
			return [__("Changed their mind", null, "Bunood POS"), __("Damaged or faulty item", null, "Bunood POS"), __("Wrong item", null, "Bunood POS"), __("Expired", null, "Bunood POS")];
		}

		function createReturn(row) {
			const token = window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
			const ret = { source: row, token, ctx: null, picks: {}, reason: -1, other: "", refund: "", preview: null, rev: 0, error: "", busy: false, issued: null };
			state.ret = ret;
			state.view = "return";
			fill(body, listView);
			renderBar();
			renderFoot();
			renderReturnView();
			api("return_context", { source_doctype: row.doctype, source_name: row.name }, { type: "GET", silent: true })
				.then((ctx) => {
					if (state.ret !== ret) return;
					ret.ctx = ctx;
					// An invoice discount or a fixed charge comes back only with the whole receipt.
					if (ctx.whole_only) ctx.lines.forEach((line) => { ret.picks[line.row] = { on: true, qty: Number(line.returnable || 0), damaged: false }; });
					ret.refund = defaultRefund(ctx);
					if (ctx.whole_only) returnChanged();
					else renderReturnView();
				})
				.catch((error) => {
					if (state.ret !== ret) return;
					ret.error = messageOf(error, __("The receipt could not be read.", null, "Bunood POS"));
					renderReturnView();
				});
		}

		// The native return form, for what the counter does not take back itself.
		function nativeReturn(row) {
			frappe.confirm(__("Create a return from receipt {0}? It opens as a draft you can edit, then submit.", [row.name]), async () => {
				try {
					const result = await api("create_return", { source_doctype: row.doctype, source_name: row.name }, { freeze: true, message: __("Preparing the return…", null, "Bunood POS") });
					frappe.set_route.apply(frappe, result.route);
				} catch (error) {
					frappe.msgprint({ title: __("Bunood POS", null, "Bunood POS"), message: messageOf(error, __("The return draft could not be created.", null, "Bunood POS")), indicator: "red" });
				}
			});
		}

		function leaveReturn() {
			state.ret = null;
			showList("receipts");
		}

		function refundOptions(ctx) {
			const own = methods();
			const options = [];
			(ctx.payments || []).forEach((payment) => {
				const row = own.find((method) => method.mode_of_payment === payment.mode_of_payment);
				if (row && !options.some((option) => option.id === row.mode_of_payment)) options.push({ id: row.mode_of_payment, row, same: true });
			});
			own.forEach((row) => {
				if (!options.some((option) => option.id === row.mode_of_payment)) options.push({ id: row.mode_of_payment, row, same: false });
			});
			if (ctx.credit_allowed && ctx.customer && ctx.customer !== state.profile?.customer) options.push({ id: "__credit__", row: null, same: false });
			return options;
		}

		function defaultRefund(ctx) {
			const options = refundOptions(ctx);
			// Nothing was paid in money: the refund can only stay on the account.
			if (Number(ctx.refundable || 0) <= 0.005 && options.some((option) => option.id === "__credit__")) return "__credit__";
			return options[0]?.id || "";
		}

		function returnPicks() {
			return Object.entries(state.ret?.picks || {})
				.filter(([, pick]) => pick.on && pick.qty > 0)
				.map(([row, pick]) => ({ row, qty: pick.qty, damaged: Boolean(pick.damaged) }));
		}

		function returnReason() {
			const ret = state.ret;
			if (ret.reason === -2) return ret.other.trim();
			return ret.reason >= 0 ? returnReasons()[ret.reason] : "";
		}

		let returnTimer = 0;
		function returnChanged() {
			const ret = state.ret;
			ret.rev += 1;
			ret.preview = null;
			ret.error = "";
			renderReturnView();
			clearTimeout(returnTimer);
			if (returnPicks().length && ret.refund) returnTimer = setTimeout(previewReturn, 250);
		}

		async function previewReturn() {
			const ret = state.ret;
			if (!ret?.ctx) return;
			const rev = ret.rev;
			try {
				const result = await api("preview_return", {
					pos_profile: state.profile.name,
					source_doctype: ret.ctx.doctype,
					source_name: ret.ctx.name,
					lines: JSON.stringify(returnPicks()),
					refund: ret.refund,
				}, { silent: true });
				if (state.ret !== ret || rev !== ret.rev) return;
				ret.preview = { ...result, rev };
			} catch (error) {
				if (state.ret !== ret || rev !== ret.rev) return;
				ret.error = messageOf(error, __("The refund could not be calculated.", null, "Bunood POS"));
			}
			renderReturnView();
		}

		async function submitReturn() {
			const ret = state.ret;
			if (!ret?.ctx || ret.busy || ret.issued) return;
			if (!returnPicks().length) { ret.error = __("Choose at least one item to return.", null, "Bunood POS"); renderReturnView(); return; }
			const reason = returnReason();
			if (!reason) { ret.error = __("Choose the reason for the return.", null, "Bunood POS"); renderReturnView(); return; }
			ret.busy = true;
			ret.error = "";
			renderReturnView();
			try {
				ret.issued = await api("submit_return", {
					pos_profile: state.profile.name,
					source_doctype: ret.ctx.doctype,
					source_name: ret.ctx.name,
					lines: JSON.stringify(returnPicks()),
					refund: ret.refund,
					reason,
					request_id: ret.token,
				}, { silent: true, freeze: true, message: __("Issuing the credit note…", null, "Bunood POS") });
				frappe.utils?.play_sound?.("submit");
				flash("ok", __("Credit note issued: {0}", [ret.issued.name]));
				if (state.profile.print_receipt_on_order_complete) printReceipt(ret.issued.doctype, ret.issued.name);
			} catch (error) {
				ret.error = messageOf(error, __("The credit note was not issued.", null, "Bunood POS"));
			} finally {
				ret.busy = false;
				renderReturnView();
			}
		}

		function renderReturnView() {
			const ret = state.ret;
			if (!ret || state.view !== "return") return;
			const ctx = ret.ctx;
			const head = h("div", { class: "bnd-pos__list-head" },
				h("h2", null, __("Return by receipt", null, "Bunood POS")),
				h("span", { class: "bnd-pos__spacer" }),
				ctx && !ret.issued ? h("button", { type: "button", class: "bnd-pos__link", onclick: () => nativeReturn(ret.source) }, __("Open the return in the invoice form", null, "Bunood POS")) : null,
				h("button", { type: "button", class: "bnd-pos__ghost", onclick: leaveReturn }, __("Back to receipts", null, "Bunood POS"), " ", key("Esc")));
			if (!ctx) {
				fill(listView, h("div", { class: "bnd-pos__list bnd-pos__list--wide" }, head,
					ret.error ? h("div", { class: "bnd-pos__pay-error", role: "alert" }, svg("alert", 18), ret.error) : h("p", { class: "bnd-pos__muted" }, __("Loading the receipt…", null, "Bunood POS"))));
				return;
			}
			const locked = Boolean(ret.issued) || ret.busy;
			const before = ctx.lines.some((line) => Number(line.returned) > 0);
			const paidWith = (ctx.payments || []).map((row) => __(row.mode_of_payment)).filter((value, index, all) => all.indexOf(value) === index).join(" + ");
			const when = frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(ctx.posting_date) : ctx.posting_date;
			const source = h("div", { class: "bnd-pos__sheet bnd-pos__return-source" },
				h("div", { class: "bnd-pos__person-text" },
					h("strong", null, __("Receipt", null, "Bunood POS"), " ", ltr(ctx.name)),
					h("span", null, ltr(`${when} ${String(ctx.posting_time || "").slice(0, 5)}`), " · ", ctx.customer_name || ctx.customer, paidWith ? ` · ${paidWith} ` : " ", ltr(money(ctx.rounded_total || ctx.grand_total)))),
				h("span", { class: "bnd-pos__spacer" }),
				h("span", { class: "bnd-pos__tag" }, __("Days since the sale: {0}", [ctx.days])),
				h("span", { class: "bnd-pos__tag", "data-tone": before ? "warn" : null }, before ? __("Partly returned before", null, "Bunood POS") : __("Nothing returned yet", null, "Bunood POS")));
			const damagedOk = Boolean(ctx.damaged_warehouse);
			const rows = ctx.lines.map((line) => {
				const pick = ret.picks[line.row] || { on: false, qty: 0, damaged: false };
				const max = Number(line.returnable || 0);
				const step = Math.min(1, max);
				const gone = max <= 0;
				const fixed = Boolean(ctx.whole_only) || locked;
				const set = (patch) => { ret.picks[line.row] = { ...pick, ...patch }; returnChanged(); };
				return h("div", { class: "bnd-pos__tr bnd-pos__tr--return", role: "row", "data-on": pick.on ? "1" : null, "data-gone": gone ? "1" : null },
					h("span", { role: "cell" }, h("button", {
						type: "button",
						class: "bnd-pos__check",
						role: "checkbox",
						"aria-checked": String(Boolean(pick.on)),
						"aria-label": line.item_name || line.item_code,
						disabled: gone || fixed,
						onclick: () => set({ on: !pick.on, qty: pick.qty > 0 ? pick.qty : step }),
					}, pick.on ? svg("check", 16) : null)),
					h("span", { role: "cell", class: "bnd-pos__person-text" },
						h("strong", { class: "bnd-pos__ellipsis" }, line.item_name || line.item_code),
						h("span", null, __("Sold", null, "Bunood POS"), " ", ltr(String(round(line.qty, 3))), " ", unitLabel(line.uom), " · ", ltr(money(line.rate)),
							Number(line.returned) > 0 ? [" · ", __("Returned before", null, "Bunood POS"), " ", ltr(String(round(line.returned, 3)))] : null)),
					h("span", { role: "cell" }, gone ? h("span", { class: "bnd-pos__tag" }, __("Fully returned", null, "Bunood POS")) : h("div", { class: "bnd-pos__stepper bnd-pos__stepper--small", dir: "ltr" },
						h("button", { type: "button", "aria-label": __("Less", null, "Bunood POS"), disabled: !pick.on || fixed || pick.qty <= step, onclick: () => set({ qty: round(Math.max(step, pick.qty - 1), 3) }) }, "−"),
						h("span", null, pick.on ? String(round(pick.qty, 3)) : "0"),
						h("button", { type: "button", "aria-label": __("More", null, "Bunood POS"), disabled: !pick.on || fixed || pick.qty >= max, onclick: () => set({ qty: round(Math.min(max, pick.qty + 1), 3) }) }, "+"))),
					h("span", { role: "cell", class: "bnd-pos__num" }, ltr(money(pick.on ? round(pick.qty * Number(line.rate || 0)) : 0))),
					h("span", { role: "cell" }, damagedOk
						? h("div", { class: "bnd-pos__seg", role: "radiogroup", "aria-label": __("Item condition", null, "Bunood POS") },
							h("button", { type: "button", role: "radio", "aria-checked": String(!pick.damaged), disabled: !pick.on || locked, onclick: () => set({ damaged: false }) }, __("Back to stock", null, "Bunood POS")),
							h("button", { type: "button", role: "radio", "data-tone": "bad", "aria-checked": String(Boolean(pick.damaged)), disabled: !pick.on || locked, onclick: () => set({ damaged: true }) }, __("Damaged", null, "Bunood POS")))
						: h("span", { class: "bnd-pos__muted" }, __("Back to stock", null, "Bunood POS"))));
			});
			const table = h("div", { class: "bnd-pos__table", role: "table", "aria-label": __("Receipt lines", null, "Bunood POS") },
				h("div", { class: "bnd-pos__tr bnd-pos__tr--head bnd-pos__tr--return", role: "row" }, ["", __("Item", null, "Bunood POS"), __("Quantity to return", null, "Bunood POS"), __("Amount", null, "Bunood POS"), __("Item condition", null, "Bunood POS")].map((text, index) => h("span", { role: "columnheader", class: index === 3 ? "bnd-pos__num" : null }, text))),
				rows);
			const reasons = returnReasons();
			const reasonCard = h("div", { class: "bnd-pos__sheet" },
				h("strong", null, __("Reason for the return", null, "Bunood POS")),
				h("div", { class: "bnd-pos__reasons", role: "radiogroup" },
					reasons.map((label, index) => h("button", { type: "button", class: "bnd-pos__reason", role: "radio", "aria-checked": String(ret.reason === index), disabled: locked, onclick: () => { ret.reason = index; ret.error = ""; renderReturnView(); } }, label)),
					h("button", { type: "button", class: "bnd-pos__reason", role: "radio", "aria-checked": String(ret.reason === -2), disabled: locked, onclick: () => { ret.reason = -2; renderReturnView(); listView.querySelector(".bnd-pos__text")?.focus(); } }, __("Other", null, "Bunood POS"))),
				ret.reason === -2 ? h("input", { type: "text", name: "return-other", class: "bnd-pos__text", maxlength: 140, value: ret.other, disabled: locked, placeholder: __("Write the reason", null, "Bunood POS"), oninput: (event) => { ret.other = event.target.value; } }) : null);
			const total = Number(ctx.rounded_total || ctx.grand_total || 0);
			const refundCard = h("div", { class: "bnd-pos__sheet" },
				h("strong", null, __("Refund by", null, "Bunood POS")),
				h("div", { class: "bnd-pos__radios", role: "radiogroup" }, refundOptions(ctx).map((option) => h("button", {
					type: "button",
					class: "bnd-pos__radio",
					role: "radio",
					"aria-checked": String(ret.refund === option.id),
					disabled: locked,
					onclick: () => { ret.refund = option.id; returnChanged(); },
				},
				h("span", { class: "bnd-pos__radio-dot", "aria-hidden": "true" }),
				h("span", { class: "bnd-pos__person-text" },
					h("strong", null, option.id === "__credit__" ? __("Credit on the customer's account", null, "Bunood POS") : option.same ? [__("Same payment method", null, "Bunood POS"), " — ", __(option.id)] : __(option.id)),
					h("span", null, option.id === "__credit__" ? __("Used on the customer's next purchases", null, "Bunood POS") : option.row.type === "Cash" ? __("Paid out of this shift's cash", null, "Bunood POS") : __("Refunded through the card terminal", null, "Bunood POS")))))),
				Number(ctx.refundable || 0) < total - 0.005 ? h("div", { class: "bnd-pos__trow" }, h("span", { class: "bnd-pos__muted" }, __("Still refundable in money", null, "Bunood POS")), ltr(money(Math.max(0, ctx.refundable)))) : null);
			const preview = ret.preview && ret.preview.rev === ret.rev ? ret.preview : null;
			const refund = preview ? Math.abs(Number(preview.rounded_total || preview.grand_total || 0)) : null;
			const totalsCard = h("div", { class: "bnd-pos__sheet bnd-pos__return-total" },
				h("div", { class: "bnd-pos__trow" }, h("span", null, __("Before VAT", null, "Bunood POS")), ltr(preview ? money(Math.abs(preview.net_total)) : "—")),
				h("div", { class: "bnd-pos__trow" }, h("span", null, __("VAT", null, "Bunood POS")), ltr(preview ? money(Math.abs(preview.total_taxes_and_charges)) : "—")),
				h("div", { class: "bnd-pos__trow bnd-pos__trow--grand" },
					h("span", null, ret.refund === "__credit__" ? __("Credit to the customer", null, "Bunood POS") : __("Refund to the customer", null, "Bunood POS")),
					h("strong", null, ltr(refund === null ? "—" : money(refund)))),
				ret.error ? h("div", { class: "bnd-pos__pay-error", role: "alert" }, ret.error) : null,
				ret.issued
					? [
						h("div", { class: "bnd-pos__issued", role: "status" }, svg("check", 18), __("Credit note issued", null, "Bunood POS"), " ", ltr(ret.issued.name)),
						h("div", { class: "bnd-pos__card-actions" },
							h("button", { type: "button", class: "bnd-pos__primary", onclick: () => printReceipt(ret.issued.doctype, ret.issued.name) }, svg("printer", 16), __("Print", null, "Bunood POS")),
							h("button", { type: "button", class: "bnd-pos__ghost", onclick: leaveReturn }, __("Back to receipts", null, "Bunood POS"))),
					]
					: h("button", { type: "button", class: "bnd-pos__primary bnd-pos__primary--tall", disabled: !preview || ret.busy, onclick: submitReturn }, __("Issue the credit note", null, "Bunood POS")),
				h("span", { class: "bnd-pos__muted" }, __("The original invoice is not changed: a credit note linked to it is issued.", null, "Bunood POS")));
			keepField(() => fill(listView, h("div", { class: "bnd-pos__list bnd-pos__list--wide" }, head,
				h("div", { class: "bnd-pos__split" },
					h("section", { class: "bnd-pos__split-main" },
						source,
						ctx.whole_only ? h("div", { class: "bnd-pos__notice", "data-tone": "warn" }, svg("alert", 18), h("span", null, __("This receipt has a discount on the whole invoice or a fixed charge, so it comes back whole.", null, "Bunood POS"))) : null,
						table),
					h("aside", { class: "bnd-pos__split-side" }, reasonCard, refundCard, totalsCard)))));
		}

		function renderLayer(options) {
			const overlay = state.overlay;
			if (!overlay) { fill(layer); return; }
			const keep = options?.keepFocus ? document.activeElement : null;
			const keepValue = keep?.value;
			const close = () => { state.overlay = null; renderLayer(); focusOmni(); };
			let dialog = null;
			if (overlay.kind === "customer") {
				const input = h("input", {
					class: "bnd-pos__dialog-search",
					type: "search",
					value: overlay.term,
					placeholder: __("Mobile, name or customer code", null, "Bunood POS"),
					"aria-label": __("Search customers", null, "Bunood POS"),
					oninput: (event) => { overlay.term = event.target.value; searchCustomers(overlay.term); },
					onkeydown: (event) => { if (event.key === "Enter" && overlay.rows?.length) { event.preventDefault(); chooseCustomer(overlay.rows[0]); } },
				});
				const walk = state.profile?.customer;
				dialog = h("div", { class: "bnd-pos__dialog", role: "dialog", "aria-modal": "true", "aria-label": __("Customer", null, "Bunood POS") },
					h("div", { class: "bnd-pos__dialog-head" }, h("strong", null, __("Customer", null, "Bunood POS")), h("span", { class: "bnd-pos__muted" }, __("By mobile, name or VAT number", null, "Bunood POS")), h("span", { class: "bnd-pos__spacer" }), h("button", { type: "button", class: "bnd-pos__ghost", onclick: close }, __("Close", null, "Bunood POS"), " ", key("Esc"))),
					input,
					h("div", { class: "bnd-pos__dialog-list" },
						walk ? h("button", { type: "button", class: "bnd-pos__person", "aria-pressed": String(state.customer === walk), onclick: () => chooseCustomer({ name: walk, customer_name: walk }) }, h("span", { class: "bnd-pos__avatar" }, walk.slice(0, 1)), h("span", { class: "bnd-pos__person-text" }, h("strong", null, walk), h("span", null, __("Default for this point of sale — simplified invoice", null, "Bunood POS")))) : null,
						overlay.rows === null ? h("p", { class: "bnd-pos__muted" }, __("Searching…", null, "Bunood POS"))
							: overlay.rows.filter((row) => row.name !== walk).map((row) => h("button", { type: "button", class: "bnd-pos__person", "aria-pressed": String(state.customer === row.name), onclick: () => chooseCustomer(row) },
								h("span", { class: "bnd-pos__avatar", "data-tone": row.tax_id ? "blue" : null }, (row.customer_name || row.name).slice(0, 1)),
								h("span", { class: "bnd-pos__person-text" }, h("strong", null, row.customer_name || row.name), h("span", null, [row.mobile_no, row.customer_group ? __(row.customer_group) : ""].filter(Boolean).join(" · "))),
								row.tax_id ? h("span", { class: "bnd-pos__tag", "data-tone": "blue" }, __("Tax invoice", null, "Bunood POS")) : null)),
						overlay.error ? h("p", { class: "bnd-pos__warn" }, overlay.error) : null),
					state.context?.capabilities?.can_create_customer ? h("button", { type: "button", class: "bnd-pos__dashed", onclick: createCustomer }, __("+ New customer", null, "Bunood POS")) : null);
			} else if (overlay.kind === "link") {
				const input = h("input", {
					class: "bnd-pos__dialog-search",
					type: "search",
					value: overlay.term,
					placeholder: __("Item name", null, "Bunood POS"),
					"aria-label": __("Search items", null, "Bunood POS"),
					oninput: (event) => { overlay.term = event.target.value; searchLinkItems(overlay.term); },
					onkeydown: (event) => {
						if (event.key === "Enter") { event.preventDefault(); saveLink(); }
						if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); overlay.sel = Math.max(0, Math.min((overlay.rows || []).length - 1, overlay.sel + (event.key === "ArrowDown" ? 1 : -1))); renderLayer({ keepFocus: true }); }
					},
				});
				dialog = h("div", { class: "bnd-pos__dialog", role: "dialog", "aria-modal": "true", "aria-label": __("Link the barcode to an item", null, "Bunood POS") },
					h("div", { class: "bnd-pos__dialog-head" }, h("strong", null, __("Link the barcode to an item", null, "Bunood POS"))),
					h("p", { class: "bnd-pos__muted" }, __("Saved as one more barcode of the item, so it is never asked about again: {0}", [overlay.code])),
					input,
					h("div", { class: "bnd-pos__dialog-list" }, overlay.rows === null ? h("p", { class: "bnd-pos__muted" }, __("Searching…", null, "Bunood POS"))
						: overlay.rows.map((row, index) => h("button", { type: "button", class: "bnd-pos__person", "aria-pressed": String(index === overlay.sel), onclick: () => { overlay.sel = index; renderLayer(); } },
							h("span", { class: "bnd-pos__person-text" }, h("strong", null, row.item_name || row.item_code), h("span", null, ltr(row.item_code), row.uom ? ` · ${unitLabel(row.uom)}` : "")),
							ltr(money(row.price_list_rate))))),
					h("div", { class: "bnd-pos__dialog-foot" },
						h("button", { type: "button", class: "bnd-pos__ghost", onclick: close }, __("Cancel", null, "Bunood POS")),
						h("button", { type: "button", class: "bnd-pos__primary", onclick: saveLink, disabled: !overlay.rows?.length }, __("Link and add to the bill", null, "Bunood POS"))));
			} else if (overlay.kind === "help") {
				const keys = [["F1", __("This list", null, "Bunood POS")], ["F2", __("Scan field", null, "Bunood POS")], ["F3", __("Customer", null, "Bunood POS")], ["F4", __("New item for an unknown barcode", null, "Bunood POS")], ["F6", __("Hold the bill", null, "Bunood POS")], ["F7", __("Held sales", null, "Bunood POS")], ["F8", __("Card for the full amount", null, "Bunood POS")], ["F9", __("Pay / complete", null, "Bunood POS")], ["F10", __("Exact cash and finish", null, "Bunood POS")], ["Alt+R", __("Receipts and returns", null, "Bunood POS")], ["Tab", __("Next payment method", null, "Bunood POS")], ["Ctrl+P", __("Print the receipt", null, "Bunood POS")], ["↑ ↓", __("Lines or suggestions", null, "Bunood POS")], ["+ / −", __("Line quantity", null, "Bunood POS")], ["Delete", __("Delete the line", null, "Bunood POS")], ["Esc", __("Back / cancel", null, "Bunood POS")]];
				const grammarRows = [["3*", __("then the barcode = 3 pieces", null, "Bunood POS")], ["*5", __("quantity 5 for the chosen line", null, "Bunood POS")], ["-10%", __("discount on the chosen line", null, "Bunood POS")], ["=12.5", __("new price (with permission)", null, "Bunood POS")], ["@", __("customer by name or mobile", null, "Bunood POS")], ["/", __("every command", null, "Bunood POS")], counter("scale_prefix") ? [`${counter("scale_prefix")}…`, __("scale label: the weight is read from it", null, "Bunood POS")] : null, [__("name", null, "Bunood POS"), __("filters the items; Enter adds the first", null, "Bunood POS")]];
				const grid2 = (rows, cls) => h("div", { class: "bnd-pos__help-grid" }, rows.filter(Boolean).map(([k, text]) => h("div", { class: "bnd-pos__help-row" }, h("kbd", { class: `bnd-pos__key ${cls || ""}`, dir: "ltr" }, k), h("span", null, text))));
				dialog = h("div", { class: "bnd-pos__dialog bnd-pos__dialog--wide", role: "dialog", "aria-modal": "true", "aria-label": __("Shortcuts", null, "Bunood POS") },
					h("div", { class: "bnd-pos__dialog-head" }, h("strong", null, __("Shortcuts and typing rules", null, "Bunood POS")), h("span", { class: "bnd-pos__spacer" }), h("button", { type: "button", class: "bnd-pos__ghost", onclick: close }, __("Close", null, "Bunood POS"), " ", key("Esc"))),
					grid2(keys),
					h("strong", null, __("Typed in the scan field", null, "Bunood POS")),
					grid2(grammarRows, "bnd-pos__key--soft"));
			}
			fill(layer, h("div", { class: "bnd-pos__scrim", onclick: (event) => { if (event.target === event.currentTarget) close(); } }, dialog));
			const field = layer.querySelector(".bnd-pos__dialog-search");
			if (field) {
				field.focus({ preventScroll: true });
				if (keep && keep.classList?.contains("bnd-pos__dialog-search") && keepValue !== undefined) field.setSelectionRange?.(field.value.length, field.value.length);
			}
		}

		initialize();
	}

	// ── The customer screen (bnd-pos?display=<POS Profile>) ─────────────────
	// The same Page, opened by the counter in a second window. It fetches
	// nothing: it shows what the counter sends over the channel, and says hello
	// when it opens so the counter sends the bill as it stands.
	function displayChannel(profile) {
		return `bnd-pos-display:${profile || ""}`;
	}

	function formatMoney(value, currency) {
		if (typeof format_currency === "function") return format_currency(Number(value || 0), currency, 2);
		return `${Number(value || 0).toFixed(2)} ${currency || ""}`;
	}

	// The window lands on another monitor when the browser can say where one is.
	async function displayPlacement() {
		const fallback = "popup=yes,width=1024,height=600";
		try {
			if (typeof window.getScreenDetails !== "function") return fallback;
			const status = await navigator.permissions?.query?.({ name: "window-management" }).catch(() => null);
			if (status?.state === "denied") return fallback;
			const details = await window.getScreenDetails();
			const other = details.screens.find((screen) => screen !== details.currentScreen);
			if (!other) return fallback;
			return `popup=yes,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
		} catch (_error) {
			return fallback;
		}
	}

	const DISPLAY_MODES = new Set(["waiting", "closed", "idle", "sale", "pay", "thanks"]);

	function renderDisplay(container, page, profileName) {
		fill(container);
		const title = __("Customer screen", null, "Bunood POS");
		page?.set_title?.(title);
		document.title = title;
		const root = h("section", { class: "bnd-pos-display", "aria-label": title });
		const head = h("header", { class: "bnd-pos-display__head" });
		const main = h("div", { class: "bnd-pos-display__main", "aria-live": "polite" });
		const full = h("button", {
			type: "button",
			class: "bnd-pos-display__full",
			onclick: () => document.documentElement.requestFullscreen?.().catch(() => {}),
		}, __("Full screen", null, "Bunood POS"));
		root.append(head, main, full);
		container.append(root);
		let current = { mode: "waiting", store: {} };

		const money = (value) => formatMoney(value, current.store?.currency);
		// Only this site's own file is shown as the logo; anything else is ignored.
		const sameSite = (path) => {
			try {
				return typeof path === "string" && path.startsWith("/") && new URL(path, window.location.origin).origin === window.location.origin;
			} catch (_error) {
				return false;
			}
		};
		const logo = (store) => (sameSite(store?.logo)
			? h("img", { class: "bnd-pos-display__logo", src: store.logo, alt: "" })
			: h("span", { class: "bnd-pos-display__logo", "aria-hidden": "true" }, String(store?.name || "B").slice(0, 1)));
		const qr = (receipt) => (typeof receipt?.qr_svg === "string" && receipt.qr_svg.startsWith("<svg")
			? h("img", { class: "bnd-pos-display__qr", alt: __("Receipt QR code", null, "Bunood POS"), src: `data:image/svg+xml;base64,${btoa(receipt.qr_svg)}` })
			: null);

		function draw() {
			const s = current;
			const greeting = {
				pay: __("Payment", null, "Bunood POS"),
				thanks: __("See you soon", null, "Bunood POS"),
			}[s.mode] || __("Welcome", null, "Bunood POS");
			fill(head, logo(s.store), h("strong", { class: "bnd-pos-display__store" }, s.store?.name || ""), h("span", { class: "bnd-pos-display__greeting" }, greeting));
			root.setAttribute("data-mode", s.mode);
			if (s.mode === "sale") {
				const lines = Array.isArray(s.lines) ? s.lines : [];
				const last = lines.find((line) => line.last) || lines[lines.length - 1];
				fill(main, h("div", { class: "bnd-pos-display__sale" },
					h("section", { class: "bnd-pos-display__bill" },
						h("div", { class: "bnd-pos-display__lines" }, lines.map((line) => h("div", { class: "bnd-pos-display__line", "data-last": line === last ? "1" : null },
							h("bdi", { dir: "ltr", class: "bnd-pos-display__qty" }, String(line.qty)),
							h("span", { class: "bnd-pos-display__name" }, line.name, Number(line.discount) ? h("span", { class: "bnd-pos-display__off" }, " · ", __("{0}% off", [Number(line.discount)])) : null),
							h("bdi", { dir: "ltr", class: "bnd-pos-display__amount" }, money(line.amount))))),
						h("div", { class: "bnd-pos-display__total" },
							h("span", { class: "bnd-pos-display__total-side" },
								h("span", null, __("Items: {0}", [lines.length])),
								h("span", null, __("VAT included", null, "Bunood POS"), " ", h("bdi", { dir: "ltr" }, money(s.vat)))),
							h("span", { class: "bnd-pos-display__total-main" }, h("span", null, __("Total", null, "Bunood POS")), h("bdi", { dir: "ltr" }, money(s.total))))),
					h("aside", { class: "bnd-pos-display__side" },
						last ? h("div", { class: "bnd-pos-display__card" },
							h("span", { class: "bnd-pos-display__muted" }, __("Last item", null, "Bunood POS")),
							h("strong", { class: "bnd-pos-display__last-name" }, last.name),
							h("bdi", { dir: "ltr", class: "bnd-pos-display__last-price" }, `${last.qty} × ${money(last.rate)}`)) : null,
						s.receipt_offered ? h("div", { class: "bnd-pos-display__card bnd-pos-display__card--soft" },
							h("strong", null, __("Your receipt on your phone", null, "Bunood POS")),
							h("span", { class: "bnd-pos-display__muted" }, __("After paying, scan the code that appears here — no paper needed.", null, "Bunood POS"))) : null)));
			} else if (s.mode === "pay") {
				const tenders = Array.isArray(s.tenders) ? s.tenders : [];
				const rest = Number(s.rest || 0);
				fill(main, h("div", { class: "bnd-pos-display__center" },
					h("span", { class: "bnd-pos-display__label" }, __("Amount due", null, "Bunood POS")),
					h("bdi", { dir: "ltr", class: "bnd-pos-display__due" }, money(s.due)),
					tenders.length ? h("div", { class: "bnd-pos-display__tenders" }, tenders.map((row) => h("div", { class: "bnd-pos-display__tender", "data-tone": row.tone },
						h("strong", null, __(row.mode_of_payment)),
						h("bdi", { dir: "ltr" }, money(row.amount)),
						row.bnpl ? h("span", null, __("Payments: {0} ×", [Number(row.bnpl.installments)]), " ", h("bdi", { dir: "ltr" }, money(Number(row.amount) / Number(row.bnpl.installments)))) : null,
						h("span", { class: "bnd-pos-display__muted" }, row.bnpl ? __("Approve the payment in the app on your phone", null, "Bunood POS") : row.tone === "card" ? __("Tap your card or phone on the terminal", null, "Bunood POS") : row.tone === "cash" ? __("Received", null, "Bunood POS") : "")))) : null,
					rest > 0.004 && tenders.length ? h("span", { class: "bnd-pos-display__label" }, __("Remaining", null, "Bunood POS"), " ", h("bdi", { dir: "ltr" }, money(rest))) : null,
					rest < -0.004 ? h("span", { class: "bnd-pos-display__label" }, __("Your change", null, "Bunood POS"), " ", h("bdi", { dir: "ltr" }, money(-rest))) : null));
			} else if (s.mode === "thanks") {
				const owed = Number(s.owed || 0);
				const change = Number(s.change || 0);
				const code = qr(s.receipt);
				fill(main, h("div", { class: "bnd-pos-display__thanks" },
					h("div", { class: "bnd-pos-display__thanks-text" },
						h("strong", { class: "bnd-pos-display__hero" }, __("Thank you", null, "Bunood POS")),
						owed > 0.004 ? [h("span", { class: "bnd-pos-display__label" }, __("On your account", null, "Bunood POS")), h("bdi", { dir: "ltr", class: "bnd-pos-display__change" }, money(owed))]
							: change > 0.004 ? [h("span", { class: "bnd-pos-display__label" }, __("Your change", null, "Bunood POS")), h("bdi", { dir: "ltr", class: "bnd-pos-display__change" }, money(change))]
								: h("bdi", { dir: "ltr", class: "bnd-pos-display__change" }, money(s.total)),
						s.name ? h("span", { class: "bnd-pos-display__muted" }, __("Invoice", null, "Bunood POS"), " ", h("bdi", { dir: "ltr" }, s.name)) : null),
					code ? h("div", { class: "bnd-pos-display__card bnd-pos-display__receipt" },
						code,
						h("strong", null, __("Your e-receipt", null, "Bunood POS")),
						h("span", { class: "bnd-pos-display__muted" }, __("Scan with your phone's camera", null, "Bunood POS"))) : null));
			} else {
				const text = {
					waiting: __("Waiting for the counter…", null, "Bunood POS"),
					closed: __("This counter is closed", null, "Bunood POS"),
				}[s.mode];
				fill(main, h("div", { class: "bnd-pos-display__center" },
					h("strong", { class: "bnd-pos-display__hero" }, text || __("Welcome", null, "Bunood POS")),
					text ? null : h("span", { class: "bnd-pos-display__label" }, s.store?.name || "")));
			}
		}

		// Desk messages are for the cashier: none reaches the customer's monitor
		// (the screen also sits above Frappe's modal and toast layers).
		const quiet = () => {};
		Object.assign(frappe, { msgprint: quiet, show_alert: quiet, show_progress: quiet });

		// A thanks screen, and its code, return to the welcome after half a minute.
		// A receipt whose half-minute has passed is not shown again when the
		// counter repeats its state.
		let thanksTimer = 0;
		let expired = "";
		const show = (next) => {
			if (next.mode === "thanks" && next.name && next.name === expired) return;
			current = next;
			clearTimeout(thanksTimer);
			if (current.mode === "thanks") {
				thanksTimer = setTimeout(() => {
					expired = current.name;
					show({ mode: "idle", store: current.store });
				}, 30000);
			}
			draw();
		};
		const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(displayChannel(profileName)) : null;
		if (channel) {
			channel.onmessage = (event) => {
				const message = event.data || {};
				if (message.type === "counter") channel.postMessage({ type: "hello" });
				else if (message.type === "counter-gone") show({ mode: "waiting", store: current.store });
				else if (message.type === "state" && DISPLAY_MODES.has(message.state?.mode)) {
					// The counter repeats the thanks state; the half-minute runs from the first.
					if (message.state.mode === "thanks" && current.mode === "thanks" && current.name === message.state.name) {
						current = message.state;
						draw();
					} else show(message.state);
				}
			};
			channel.postMessage({ type: "hello" });
			window.addEventListener("pagehide", () => channel.postMessage({ type: "bye" }));
		}
		draw();

		// A customer-facing monitor: no sleeping screen, no resting cursor.
		const awake = () => navigator.wakeLock?.request?.("screen").catch(() => {});
		awake();
		document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") awake(); });
		let still = 0;
		const moved = () => {
			root.removeAttribute("data-still");
			clearTimeout(still);
			still = setTimeout(() => root.setAttribute("data-still", ""), 3000);
		};
		root.addEventListener("pointermove", moved);
		moved();
		const fullscreen = () => { full.hidden = Boolean(document.fullscreenElement); };
		document.addEventListener("fullscreenchange", fullscreen);
		fullscreen();
	}

	// The native print view in a new tab, as the counter's own Print opens it.
	function openPrintView(doctype, name, format) {
		const query = new URLSearchParams({ doctype, name, format: format || "Standard", trigger_print: "1" });
		window.open(`/printview?${query.toString()}`, "_blank", "noopener");
	}

	// The receipt register (bnd-pos-register): every permitted POS receipt of
	// both invoice types, read through pos.receipt_register. Read-only; Open and
	// Reprint are the native form and print view.
	function renderRegister(container) {
		container.replaceChildren();
		const route = frappe.get_route?.() || [];
		const modes = [
			["today", __("Today")], ["shift", __("This shift")],
			["mine", __("My sales")], ["all", __("All permitted sales")],
			["returns", __("Returns")],
		];
		const state = {
			mode: modes.some(([key]) => key === route[1]) ? route[1] : "today",
			company: route[2] ? decodeURIComponent(route[2]) : "",
			search: "", cursor: null, busy: false, serial: 0,
		};
		const root = el("section", "bnd-pos-register", null, container);
		const heading = el("header", "bnd-pos-register__heading", null, root);
		const headingCopy = el("div", null, null, heading);
		headingCopy.append(
			el("span", "bnd-pos-register__eyebrow", __("POS receipts")),
			el("h1", null, __("POS sales register")),
			el("p", null, __("Find receipts from both POS invoice types without counting shift consolidation twice."))
		);
		heading.append(headingCopy, button(__("Open POS"), "shopping-cart", "btn btn-primary", () => frappe.set_route("bnd-pos")));
		const toolbar = el("section", "bnd-pos-register__toolbar", null, root);
		const modeRow = el("div", "bnd-pos-register__modes", null, toolbar);
		modeRow.setAttribute("role", "group");
		modeRow.setAttribute("aria-label", __("POS sales filters"));
		const modeButtons = new Map();
		for (const [key, label] of modes) {
			const control = button(label, null, "bnd-pos-register__mode", () => {
				if (state.mode === key) return;
				state.mode = key;
				syncModes();
				refresh();
			});
			modeButtons.set(key, control);
			modeRow.append(control);
		}
		const fields = el("div", "bnd-pos-register__fields", null, toolbar);
		const searchLabel = el("label", "bnd-pos-register__field", null, fields);
		searchLabel.append(el("span", null, __("Receipt or customer")));
		const search = el("input", "form-control", null, searchLabel);
		search.type = "search";
		search.placeholder = __("Search receipt number or customer");
		const companyLabel = el("label", "bnd-pos-register__field", null, fields);
		companyLabel.append(el("span", null, __("Company")));
		const company = el("select", "form-control", null, companyLabel);
		company.append(new Option(__("All permitted companies"), ""));
		company.value = state.company;
		company.addEventListener("change", () => { state.company = company.value; refresh(); });
		const result = el("section", "bnd-pos-register__results", null, root);
		const resultHead = el("header", "bnd-pos-register__results-head", null, result);
		el("h2", null, __("Receipts"), resultHead);
		const resultNote = el("p", null, __("Original records, including older POS invoice types"), resultHead);
		const columnHead = el("div", "bnd-pos-register__columns", null, result);
		columnHead.setAttribute("aria-hidden", "true");
		for (const label of [__("Receipt"), __("Customer and cashier"), __("Payment and type"), __("Amount"), __("Actions")]) {
			columnHead.append(el("span", null, label));
		}
		const list = el("div", "bnd-pos-register__list", null, result);
		const more = button(__("Load more receipts"), "chevron-down", "btn btn-default bnd-pos-register__more", loadMore);
		more.hidden = true;
		result.append(more);
		let searchTimer = 0;
		search.addEventListener("input", () => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(() => { state.search = search.value.trim(); refresh(); }, 250);
		});
		function syncModes() {
			for (const [key, control] of modeButtons) {
				const active = key === state.mode;
				control.classList.toggle("is-active", active);
				control.setAttribute("aria-pressed", String(active));
			}
		}
		function showRow(row) {
			const card = el("article", "bnd-pos-register__row", null, list);
			const identity = el("div", "bnd-pos-register__identity", null, card);
			identity.append(el("strong", null, row.name), el("small", null,
				`${userDate(row.posting_date)} · ${row.pos_profile || __("POS")}`));
			const customer = el("div", "bnd-pos-register__person", null, card);
			customer.append(el("strong", null, row.customer_name || row.customer || __("Walk-in customer")),
				el("small", null, `${__("Cashier")}: ${row.owner || "—"}`));
			const status = el("div", "bnd-pos-register__status", null, card);
			const kind = el("span", "bnd-pos-register__kind", __("POS receipt"), status);
			kind.title = __(row.doctype);
			status.append(el("small", null, __(row.doctype)));
			if (row.is_return) status.append(el("span", "bnd-pos-register__return", __("Return")));
			const balance = Number(row.outstanding_amount || 0);
			const total = Math.abs(Number(row.grand_total || 0));
			const paid = balance <= 0 ? __("Paid") : balance < total ? __("Partly paid") : __("Unpaid");
			status.append(el("small", null, `${__("Payment status")}: ${paid}`));
			card.append(el("strong", "bnd-pos-register__amount", money(row.grand_total, row.currency)));
			const actions = el("div", "bnd-pos-register__actions", null, card);
			actions.append(
				button(__("Open"), "external-link", "btn btn-default", () => frappe.set_route("Form", row.doctype, row.name)),
				button(__("Reprint"), "printer", "btn btn-default", () => openPrintView(row.doctype, row.name, "Standard"))
			);
		}
		function setCompanies(names) {
			company.replaceChildren(new Option(__("All permitted companies"), ""));
			for (const name of names || []) company.append(new Option(name, name));
			if (state.company && ![...company.options].some((option) => option.value === state.company)) {
				state.company = "";
			}
			company.value = state.company;
		}
		async function loadMore() {
			if (state.busy) return;
			state.busy = true;
			const serial = state.serial;
			more.disabled = true;
			try {
				const data = await api("receipt_register", {
					mode: state.mode, company: state.company, search_term: state.search,
					cursor: state.cursor ? JSON.stringify(state.cursor) : "", limit: 30,
				}, { type: "GET" });
				if (serial !== state.serial || !root.isConnected) return;
				setCompanies(data.companies);
				list.querySelector(".bnd-pos-register__loading")?.remove();
				for (const receipt of data.rows || []) showRow(receipt);
				state.cursor = data.next_cursor;
				more.hidden = !state.cursor;
				if (!list.children.length) list.append(el("p", "bnd-pos-register__empty", state.mode === "shift" && data.has_open_shift === false
					? __("No shift is open. Open POS to start a shift.")
					: __("No POS receipts match these filters.")));
				resultNote.textContent = state.mode === "shift" ? __("Your current open shift only")
					: __("Original records, including older POS invoice types");
			} catch (error) {
				if (serial === state.serial) {
					list.querySelector(".bnd-pos-register__loading")?.remove();
					list.append(el("p", "bnd-pos-register__empty", __("Receipts could not be loaded. Try again.")));
					more.hidden = true;
				}
			} finally {
				if (serial === state.serial) { state.busy = false; more.disabled = false; }
			}
		}
		function refresh() {
			state.serial += 1;
			state.busy = false;
			state.cursor = null;
			list.replaceChildren(el("p", "bnd-pos-register__empty bnd-pos-register__loading", __("Loading POS receipts…")));
			more.hidden = true;
			loadMore();
		}
		syncModes();
		refresh();
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.pos_render = render;
	window.bunood_theme.pos_register_render = renderRegister;
})();
