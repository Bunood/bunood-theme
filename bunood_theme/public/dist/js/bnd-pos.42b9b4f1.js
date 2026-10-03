// Copyright (c) 2026, Bunood and contributors
// A task-first cashier shell. Every posting operation delegates to ERPNext.
/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	const METHOD = "bunood_theme.pos.";
	const PAGE_SIZE = 36;

	function el(tag, className, text, parent) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = text;
		if (parent) parent.append(node);
		return node;
	}

	function icon(name, size = "sm") {
		const holder = el("span", "bnd-pos__icon");
		if (frappe.utils?.icon) {
			const parsed = new DOMParser().parseFromString(frappe.utils.icon(name, size), "image/svg+xml");
			if (parsed.documentElement?.nodeName === "svg") {
				holder.append(document.importNode(parsed.documentElement, true));
			}
		}
		holder.setAttribute("aria-hidden", "true");
		return holder;
	}

	function button(label, iconName, className, handler) {
		const control = el("button", className || "btn btn-default");
		control.type = "button";
		if (iconName) control.append(icon(iconName));
		control.append(el("span", null, label));
		control.addEventListener("click", handler);
		return control;
	}

	function locale() {
		return frappe.boot?.lang || document.documentElement.lang || "en";
	}

	function number(value, digits) {
		return new Intl.NumberFormat(locale(), {
			minimumFractionDigits: digits || 0,
			maximumFractionDigits: digits === undefined ? 2 : digits,
		}).format(Number(value || 0));
	}

	function money(value, currency) {
		try {
			return new Intl.NumberFormat(locale(), {
				style: "currency",
				currency: currency || "SAR",
				minimumFractionDigits: 2,
			}).format(Number(value || 0));
		} catch (_error) {
			return `${number(value, 2)} ${currency || "SAR"}`;
		}
	}

	function initials(value) {
		const words = String(value || "").trim().split(/\s+/).filter(Boolean);
		return (words.slice(0, 2).map((word) => [...word][0]).join("") || "•").toUpperCase();
	}

	function productIllustration(item) {
		const name = `${item.item_name || ""} ${item.item_group || ""} ${item.item_code || ""}`.toLowerCase();
		const drawings = {
			cup: '<path d="M11 16h20v13a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6zM31 19h4a4 4 0 0 1 0 8h-4M10 39h26M17 7c-3 3 3 4 0 7M25 7c-3 3 3 4 0 7"/>',
			bottle: '<path d="M19 5h10M20 5v8l-5 5v21a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V18l-5-5V5M15 22h18M15 34h18"/>',
			bread: '<path d="M8 32c3-9 12-17 24-17 6 0 9 3 9 8 0 6-6 12-13 15-8 3-17 1-20-6zM12 27l6 6M20 20l6 8M30 16l5 7"/>',
			sandwich: '<path d="M6 27c3-11 11-18 18-18s15 7 18 18zM6 27h36l-4 7H10zM10 34h28l-4 5H14zM15 24h18"/>',
		};
		const kind = /قهو|شاي|لاتيه|كابتشينو|coffee|latte|espresso|tea/.test(name) ? "cup"
			: /مياه|ماء|عصير|زيت|water|juice|bottle|milk/.test(name) ? "bottle"
			: /كرواسون|مخبوز|pastry|croissant|bread/.test(name) ? "bread"
			: /ساندويتش|برجر|sandwich|burger/.test(name) ? "sandwich" : "";
		if (!kind) return el("span", null, initials(item.item_name || item.item_code));
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 48 48");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "1.7");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("aria-hidden", "true");
		svg.innerHTML = drawings[kind];
		return svg;
	}

	function userDate(value) {
		return value && frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(value) : value || "—";
	}

	function api(method, args, options) {
		return frappe.call({
			method: METHOD + method,
			args: args || {},
			freeze: Boolean(options?.freeze),
			freeze_message: options?.message,
			type: options?.type,
		}).then((response) => response.message);
	}

	async function deliverySnapshot(doctype, name) {
		const response = await frappe.call({
			method: "bunood_theme.zatca.delivery.get_delivery_status", type: "GET", args: { doctype, name },
		});
		return response.message || {};
	}

	function printCustomerReceipt(doctype, name, fallbackFormat, knownStatus = null, autoPrint = false) {
		const openReady = status => {
			if (!status.ready) {
				if (status.can_preview_sandbox) {
					window.bunood_theme.invoice_print_preview(doctype, name);
					return;
				}
				frappe.msgprint(status.state === "sandbox_only" ? __("The signed ZATCA XML or QR code is not ready yet.") : (status.reason || __("Invoice delivery is not ready.")));
				return;
			}
			window.bunood_theme.invoice_print_preview(doctype, name, false, autoPrint);
		};
		if (knownStatus) { openReady(knownStatus); return; }
		void deliverySnapshot(doctype, name).then(openReady).catch(() => {
			frappe.msgprint(__("Invoice delivery status is unavailable. Try again shortly."));
		});
	}

	function render(container, page) {
		container.replaceChildren();
		const root = el("section", "bnd-pos-workbench");
		container.append(root);
		const state = {
			context: null,
			backendConnected: null,
			profile: "",
			service: "Retail",
			serviceSnapshots: new Map(),
			orderType: "Takeaway",
			tableNumber: "",
			customer: "",
			cart: new Map(),
			items: [],
			group: "",
			search: "",
			start: 0,
			draft: "",
			preview: null,
			request: 0,
			previewRequest: 0,
			busy: false,
			view: "items",
		};

		const header = el("header", "bnd-pos__header", null, root);
		const title = el("div", "bnd-pos__title", null, header);
		title.append(
			el("p", "bnd-pos__eyebrow", "BUNOOD / POS"),
			el("h2", null, __("Bunood POS")),
			el("p", "bnd-pos__subtitle", __("Choose an item, check the ticket, then collect payment."))
		);
		const headerActions = el("div", "bnd-pos__header-actions", null, header);
		const serviceSwitch = el("div", "bnd-pos__service-switch", null, headerActions);
		serviceSwitch.setAttribute("role", "group");
		serviceSwitch.setAttribute("aria-label", __("Selling mode"));
		for (const [mode, label] of [["Retail", __("Retail")], ["Cafe", __("Café & dining")]]) {
			const control = button(label, null, "bnd-pos__service-choice", () => switchService(mode));
			control.dataset.service = mode;
			serviceSwitch.append(control);
		}
		const profileSelect = el("select", "form-control bnd-pos__profile", null, headerActions);
		profileSelect.setAttribute("aria-label", __("POS Profile"));
		const quickSale = button(__("Quick Sale"), "file-plus", "btn btn-default", () => frappe.set_route("bnd-quick-sale"));
		const nativePos = button(__("Native POS"), "external-link", "btn btn-default", () => frappe.set_route("point-of-sale"));
		headerActions.append(profileSelect, quickSale, nativePos);

		const shift = el("section", "bnd-pos__shift", null, root);
		const shiftState = el("div", "bnd-pos__shift-state", null, shift);
		const shiftActions = el("div", "bnd-pos__shift-actions", null, shift);
		const openShift = button(__("Open shift"), "play", "btn btn-primary", showOpening);
		const closeShift = button(__("Review and close shift"), "lock", "btn btn-default", closeCurrentShift);
		shiftActions.append(openShift, closeShift);
		shift.append(shiftState, shiftActions);

		const tabs = el("nav", "bnd-pos__tabs", null, root);
		tabs.setAttribute("aria-label", __("POS views"));
		const itemTab = tab(__("Items"), "grid", "items");
		const heldTab = tab(__("Held sales"), "pause", "held");
		const historyTab = tab(__("Receipts"), "file-text", "history");
		tabs.append(itemTab, heldTab, historyTab);

		const workspace = el("div", "bnd-pos__workspace", null, root);
		const catalogue = el("section", "bnd-pos__catalogue", null, workspace);
		catalogue.setAttribute("aria-label", __("Product catalogue"));
		const searchBar = el("div", "bnd-pos__search", null, catalogue);
		searchBar.append(icon("search", "md"));
		const search = el("input", "form-control", null, searchBar);
		search.type = "search";
		search.placeholder = __("Search item name, code, or scan a barcode");
		search.setAttribute("aria-label", search.placeholder);
		const scan = button(__("Scan"), "scan", "btn btn-default bnd-pos__scan", startScanner);
		searchBar.append(search, scan);
		const groups = el("div", "bnd-pos__groups", null, catalogue);
		groups.setAttribute("role", "list");
		groups.setAttribute("aria-label", __("Item groups"));
		const catalogueLive = el("p", "bnd-pos__live", "", catalogue);
		catalogueLive.setAttribute("role", "status");
		catalogueLive.setAttribute("aria-live", "polite");
		const products = el("div", "bnd-pos__products", null, catalogue);
		const loadMore = button(__("Load more items"), "chevron-down", "btn btn-default bnd-pos__more", () => loadItems(true));
		catalogue.append(loadMore);

		const lists = el("section", "bnd-pos__lists", null, workspace);
		lists.hidden = true;
		const listsHead = el("header", "bnd-pos__lists-head", null, lists);
		const listsTitle = el("h3", null, "", listsHead);
		const listsSearch = el("input", "form-control", null, listsHead);
		listsSearch.type = "search";
		listsSearch.placeholder = __("Search receipts or customers");
		const allReceipts = button(__("View all POS receipts"), "external-link", "btn btn-default bnd-pos__all-receipts",
			() => frappe.set_route("bnd-pos-register"));
		listsHead.append(allReceipts);
		const listBody = el("div", "bnd-pos__list-body", null, lists);

		const cart = el("aside", "bnd-pos__cart", null, workspace);
		cart.setAttribute("aria-label", __("Current sale"));
		const cartHead = el("header", "bnd-pos__cart-head", null, cart);
		const cartHeading = el("div", null, null, cartHead);
		cartHeading.append(el("p", "bnd-pos__eyebrow", __("Current sale")), el("h3", null, __("Cart")));
		const newSale = button(__("New sale"), null, "btn bnd-pos__new-sale", resetSale);
		cartHead.append(cartHeading, newSale);
		const customerWrap = el("div", "bnd-pos__customer", null, cart);
		const customerHost = el("div", "bnd-pos__customer-control", null, customerWrap);
		const addCustomer = button(__("Add customer"), "user-plus", "btn btn-default bnd-pos__add-customer", createCustomer);
		customerWrap.append(addCustomer);
		const customerControl = frappe.ui.form.make_control({
			parent: customerHost,
			df: {
				fieldname: "customer",
				fieldtype: "Link",
				options: "Customer",
				label: __("Customer"),
				placeholder: __("Walk-in or named customer"),
				change() {
					state.customer = customerControl.get_value() || "";
					schedulePreview();
				},
			},
				render_input: true,
		});
		const orderContext = el("div", "bnd-pos__order-context", null, cart);
		const orderTypeSwitch = el("div", "bnd-pos__order-types", null, orderContext);
		orderTypeSwitch.setAttribute("role", "group");
		orderTypeSwitch.setAttribute("aria-label", __("Service type"));
		for (const [type, label] of [["Dine In", __("Dine in")], ["Takeaway", __("Takeaway")]]) {
			const control = button(label, null, "bnd-pos__order-type", () => setOrderType(type));
			control.dataset.orderType = type;
			orderTypeSwitch.append(control);
		}
		const tableLabel = el("label", "bnd-pos__table-label", null, orderContext);
		tableLabel.append(el("span", null, __("Table")));
		const tableInput = el("input", "form-control", null, tableLabel);
		tableInput.type = "text";
		tableInput.maxLength = 80;
		tableInput.placeholder = __("Table number or name");
		tableInput.addEventListener("input", () => {
			state.tableNumber = tableInput.value.trim();
			schedulePreview();
		});
		const cartLines = el("div", "bnd-pos__cart-lines", null, cart);
		const totals = el("dl", "bnd-pos__totals", null, cart);
		const cartActions = el("div", "bnd-pos__cart-actions", null, cart);
		const hold = button(__("Hold sale"), "pause", "btn btn-default", holdSale);
		const kitchen = button(__("Save & print kitchen ticket"), "printer", "btn btn-default bnd-pos__kitchen", printKitchenTicket);
		const pay = button(__("Pay"), "credit-card", "btn btn-primary bnd-pos__pay", showPayment);
		cartActions.append(hold, kitchen, pay);
		cart.append(cartActions);

		const mobileNav = el("nav", "bnd-pos__mobile-nav", null, root);
		root.insertBefore(mobileNav, workspace);
		mobileNav.setAttribute("aria-label", __("Mobile POS navigation"));
		for (const [view, label, glyph] of [["items", __("Items"), "grid"], ["cart", __("Cart"), "shopping-cart"], ["pay", __("Pay"), "credit-card"]]) {
			const control = button(label, glyph, "bnd-pos__mobile-action", () => {
				if (view === "pay") return showPayment();
				setMobileView(view);
			});
			control.dataset.view = view;
			mobileNav.append(control);
		}

		function tab(label, glyph, view) {
			const control = button(label, glyph, "bnd-pos__tab", () => setView(view));
			control.dataset.view = view;
			return control;
		}

		function syncServiceControls() {
			root.dataset.service = state.service.toLowerCase();
			for (const control of serviceSwitch.querySelectorAll("button")) {
				const selected = control.dataset.service === state.service;
				control.classList.toggle("is-selected", selected);
				control.setAttribute("aria-pressed", String(selected));
			}
			orderContext.hidden = state.service !== "Cafe";
			kitchen.hidden = state.service !== "Cafe";
			for (const control of orderTypeSwitch.querySelectorAll("button")) {
				const selected = control.dataset.orderType === state.orderType;
				control.classList.toggle("is-selected", selected);
				control.setAttribute("aria-pressed", String(selected));
			}
			tableLabel.hidden = state.service !== "Cafe" || state.orderType !== "Dine In";
			tableInput.value = state.tableNumber;
		}

		function switchService(mode) {
			if (state.busy || mode === state.service || !["Retail", "Cafe"].includes(mode)) return;
			state.serviceSnapshots.set(state.service, {
				cart: state.cart, customer: state.customer, draft: state.draft,
				orderType: state.orderType, tableNumber: state.tableNumber,
			});
			const saved = state.serviceSnapshots.get(mode);
			state.service = mode;
			state.cart = saved?.cart || new Map();
			state.customer = saved?.customer || state.context?.profile?.customer || "";
			state.draft = saved?.draft || "";
			state.orderType = saved?.orderType || "Takeaway";
			state.tableNumber = saved?.tableNumber || "";
			state.preview = null;
			customerControl.set_value(state.customer);
			syncServiceControls();
			renderCart();
			schedulePreview();
		}

		function setOrderType(type) {
			state.orderType = type;
			if (type === "Takeaway") state.tableNumber = "";
			syncServiceControls();
			schedulePreview();
		}

		function validOrderContext() {
			if (state.service === "Cafe" && state.orderType === "Dine In" && !state.tableNumber) {
				frappe.show_alert({ message: __("Enter the table before saving a dine-in order."), indicator: "orange" });
				tableInput.focus();
				return false;
			}
			return true;
		}

		function setMobileView(view) {
			root.dataset.mobileView = view;
			for (const control of mobileNav.querySelectorAll("[data-view]")) {
				const active = control.dataset.view === view;
				control.classList.toggle("is-active", active);
				control.setAttribute("aria-current", active ? "page" : "false");
			}
		}

		function setBusy(busy, message) {
			state.busy = busy;
			root.classList.toggle("is-busy", busy);
			if (busy) {
				for (const control of [profileSelect, openShift, closeShift, newSale, hold, kitchen, pay, loadMore]) {
					control.disabled = true;
				}
				catalogueLive.textContent = message || __("Working…");
				return;
			}
			profileSelect.disabled = Boolean(state.context?.opening_entry || state.context?.stale_opening_entry);
			openShift.disabled = !state.context?.capabilities?.can_open_shift || Boolean(state.context?.stale_opening_entry);
			closeShift.disabled = !state.context?.capabilities?.can_close_shift;
			loadMore.disabled = false;
			renderCart();
		}

		function setView(view) {
			state.view = view;
			catalogue.hidden = view !== "items";
			lists.hidden = view === "items";
			allReceipts.hidden = view !== "history";
			for (const control of tabs.querySelectorAll(".bnd-pos__tab")) {
				const active = control.dataset.view === view;
				control.classList.toggle("is-active", active);
				control.setAttribute("aria-current", active ? "page" : "false");
			}
			if (view === "held") loadHeld();
			if (view === "history") loadHistory();
		}

		async function initialize(profile) {
			setBusy(true, __("Preparing the counter…"));
			state.backendConnected = null;
			syncOnlineState();
			try {
				if (profile && profile !== state.profile) {
					state.serviceSnapshots.clear();
					state.cart = new Map();
					state.draft = "";
					state.preview = null;
				}
				state.context = await api("get_context", { pos_profile: profile || undefined }, { type: "GET" });
				state.backendConnected = true;
				syncOnlineState();
				state.profile = state.context.profile?.name || "";
				fillProfiles();
				applyContext();
				if (!profile && frappe.get_route?.()[1] === "held") setView("held");
				if (state.context.opening_entry) await loadItems(false);
			} catch (error) {
				state.backendConnected = false;
				syncOnlineState();
				showFailure(error, __("The counter could not be prepared."));
			} finally {
				setBusy(false);
			}
		}

		function fillProfiles() {
			profileSelect.replaceChildren();
			for (const profile of state.context.profiles || []) {
				const option = el("option", null, `${profile.name} · ${profile.company}`);
				option.value = profile.name;
				profileSelect.append(option);
			}
			profileSelect.value = state.profile;
		}

		function applyContext() {
			const context = state.context;
			const profile = context.profile;
			const opening = context.opening_entry;
			const staleOpening = context.stale_opening_entry;
			state.customer = state.customer || profile?.customer || "";
			customerControl.set_value(state.customer);
			addCustomer.hidden = !context.capabilities?.can_create_customer;
			openShift.hidden = Boolean(opening || staleOpening);
			closeShift.hidden = !opening && !staleOpening;
			profileSelect.disabled = Boolean(opening || staleOpening);
			if (opening) {
				shiftState.replaceChildren(
					icon("check-circle"),
					el("div", null, null)
				);
				shiftState.lastElementChild.append(
					el("strong", null, __("Shift open")),
					el("span", null, __("Opened {0} · {1}", [userDate(opening.period_start_date), opening.name]))
				);
			} else if (staleOpening) {
				shiftState.replaceChildren(icon("alert-triangle"), el("div", null, null));
				shiftState.lastElementChild.append(
					el("strong", null, __("This shift is out of date")),
					el("span", null, `${__("Review and close the outdated shift before opening today's counter.")} ${__("Reference")}: ${staleOpening.name}`)
				);
			} else {
				shiftState.replaceChildren(icon("info"), el("div", null, null));
				shiftState.lastElementChild.append(
					el("strong", null, __("Open the counter to start selling")),
					el("span", null, __("Count the starting tender once; closing will reconcile the same native shift."))
				);
			}
			openShift.disabled = !context.capabilities?.can_open_shift || Boolean(staleOpening);
			closeShift.disabled = !context.capabilities?.can_close_shift;
			if (!opening) {
				state.items = [];
				loadMore.hidden = true;
				catalogueLive.textContent = "";
				const empty = el("div", "bnd-pos__empty");
				empty.append(
					icon(staleOpening ? "alert-triangle" : "info", "lg"),
					el("strong", null, staleOpening ? __("This shift is out of date") : __("Open the counter to start selling")),
					el("span", null, staleOpening
						? __("Review and close the outdated shift before opening today's counter.")
						: __("Count the starting tender once; closing will reconcile the same native shift."))
				);
				products.replaceChildren(empty);
			} else {
				loadMore.hidden = false;
			}
			renderGroups();
			renderCart();
		}

		function renderGroups() {
			groups.replaceChildren();
			const all = button(__("All items"), null, "bnd-pos__group", () => chooseGroup(""));
			all.classList.toggle("is-active", !state.group);
			groups.append(all);
		for (const group of state.context?.item_groups || []) {
			if (group === "All Item Groups") continue;
			const control = button(__(group), null, "bnd-pos__group", () => chooseGroup(group));
				control.classList.toggle("is-active", state.group === group);
				groups.append(control);
			}
		}

		function chooseGroup(group) {
			state.group = group;
			renderGroups();
			loadItems(false);
		}

		async function loadItems(append) {
			if (!state.context?.opening_entry || !state.profile) return;
			const serial = ++state.request;
			const start = append ? state.items.length : 0;
			setBusy(true, __("Loading items…"));
			try {
				const result = await api("get_items", {
					pos_profile: state.profile,
					start,
					page_length: PAGE_SIZE,
					item_group: state.group || undefined,
					search_term: state.search,
				}, { type: "GET" });
				if (serial !== state.request) return;
				state.items = append ? [...state.items, ...(result.items || [])] : (result.items || []);
				renderProducts();
				loadMore.hidden = (result.items || []).length < PAGE_SIZE;
				catalogueLive.textContent = __("Items shown: {0}", [number(state.items.length, 0)]);
			} catch (error) {
				if (serial === state.request) showFailure(error, __("Items could not be loaded."), products);
			} finally {
				if (serial === state.request) setBusy(false);
			}
		}

		function renderProducts() {
			products.replaceChildren();
			if (!state.items.length) {
				const empty = el("div", "bnd-pos__empty");
				empty.append(icon("search", "lg"), el("strong", null, __("No matching items")), el("span", null, __("Try a name, item code, barcode, or another group.")));
				products.append(empty);
				return;
			}
			for (const item of state.items) {
				const card = el("button", "bnd-pos__product");
				card.type = "button";
				card.dataset.itemCode = item.item_code;
				// A stable material tone gives image-less catalogue items a real tile
				// rhythm without inventing product photography or changing item data.
				const key = String(item.item_group || item.item_code || item.item_name || "");
				card.dataset.tone = String([...key].reduce((sum, char) => sum + char.codePointAt(0), 0) % 6);
				const media = el("span", "bnd-pos__product-media");
				if (item.item_image && !state.context.profile.hide_images) {
					card.classList.add("has-image");
					const image = el("img");
					image.src = item.item_image;
					image.alt = "";
					image.loading = "lazy";
					image.addEventListener("error", () => media.replaceChildren(productIllustration(item)), { once: true });
					media.append(image);
				} else {
					media.append(productIllustration(item));
				}
				const copy = el("span", "bnd-pos__product-copy");
				copy.append(
					el("strong", null, item.item_name || item.item_code),
					el("small", null, item.item_code),
					el("b", null, money(item.price_list_rate, item.currency || state.context.profile.currency))
				);
				const stock = el("span", "bnd-pos__stock", item.is_stock_item
					? __("Stock {0}", [number(item.actual_qty)])
					: __("Service"));
				stock.classList.toggle("is-empty", item.is_stock_item && Number(item.actual_qty || 0) <= 0);
				card.append(media, copy, stock);
				card.disabled = item.price_list_rate === null || item.price_list_rate === undefined;
				card.addEventListener("click", () => addItem(item));
				products.append(card);
			}
		}

		function keyFor(item) {
			return [item.item_code, item.uom || item.stock_uom || "", item.batch_no || "", item.serial_no || ""].join("::");
		}

		function addItem(item) {
			const key = state.service === "Cafe"
				? `${keyFor(item)}::${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
				: keyFor(item);
			const current = state.cart.get(key);
			if (current) current.qty += 1;
			else state.cart.set(key, {
				item_code: item.item_code,
				item_name: item.item_name || item.item_code,
				uom: item.uom || item.stock_uom,
				stock_uom: item.stock_uom,
				qty: 1,
				rate: Number(item.price_list_rate || 0),
				batch_no: item.batch_no || "",
				serial_no: item.serial_no || "",
				kitchen_note: "",
			});
			frappe.utils?.play_sound?.("click");
			renderCart();
			schedulePreview();
		}

		function updateQuantity(key, value) {
			const row = state.cart.get(key);
			if (!row) return;
			const qty = Number(value);
			if (!Number.isFinite(qty) || qty <= 0) state.cart.delete(key);
			else row.qty = qty;
			renderCart();
			schedulePreview();
		}

		function renderCart() {
			cartLines.replaceChildren();
			const rows = [...state.cart.entries()];
			if (!rows.length) {
				const empty = el("div", "bnd-pos__empty bnd-pos__cart-empty");
				empty.append(icon("shopping-cart", "lg"), el("strong", null, __("The cart is ready")), el("span", null, __("Choose an item or scan a barcode to begin.")));
				cartLines.append(empty);
			} else {
				for (const [key, row] of rows) {
					const line = el("article", "bnd-pos__cart-line");
					const copy = el("div", "bnd-pos__line-copy");
					copy.append(el("strong", null, row.item_name), el("small", null, `${row.item_code} · ${row.uom || ""}`));
					if (state.service === "Cafe") {
						const note = button(row.kitchen_note ? __("Edit preparation note") : __("Add preparation note"), null, "bnd-pos__note", () => editNote(key));
						copy.append(note);
						if (row.kitchen_note) copy.append(el("span", "bnd-pos__note-text", row.kitchen_note));
					}
					const stepper = el("div", "bnd-pos__stepper");
					const minus = button("−", null, "bnd-pos__step", () => updateQuantity(key, row.qty - 1));
					minus.setAttribute("aria-label", __("Decrease quantity"));
					const input = el("input", "form-control");
					input.type = "number";
					input.min = "0";
					input.step = "1";
					input.value = row.qty;
					input.setAttribute("aria-label", __("Quantity for {0}", [row.item_name]));
					input.addEventListener("change", () => updateQuantity(key, input.value));
					const plus = button("+", null, "bnd-pos__step", () => updateQuantity(key, row.qty + 1));
					plus.setAttribute("aria-label", __("Increase quantity"));
					stepper.append(minus, input, plus);
					const amount = el("strong", "bnd-pos__line-amount", money(row.qty * row.rate, state.context?.profile?.currency));
					const remove = button(__("Remove"), "trash-2", "bnd-pos__remove", () => updateQuantity(key, 0));
					line.append(copy, stepper, amount, remove);
					cartLines.append(line);
				}
			}
			renderTotals();
			const enabled = rows.length > 0 && Boolean(state.context?.opening_entry) && navigator.onLine && state.backendConnected === true;
			hold.disabled = !enabled || state.busy || !state.customer;
			pay.disabled = !enabled || state.busy || !state.customer;
			kitchen.disabled = !enabled || state.busy || !state.customer;
			newSale.disabled = state.busy;
			for (const control of mobileNav.querySelectorAll('[data-view="cart"], [data-view="pay"]')) {
				const label = control.querySelector("span:last-child");
				if (control.dataset.view === "cart" && label) label.textContent = `${__("Cart")} (${rows.length})`;
				if (control.dataset.view === "pay") control.disabled = !enabled || !state.customer;
			}
		}

		function renderTotals() {
			totals.replaceChildren();
			const preview = state.preview || {};
			const currency = preview.currency || state.context?.profile?.currency || "SAR";
			const estimated = [...state.cart.values()].reduce((sum, row) => sum + row.qty * row.rate, 0);
			for (const [label, value, className] of [
				[__("Subtotal"), preview.net_total ?? estimated, ""],
				[__("VAT and charges"), preview.total_taxes_and_charges ?? 0, ""],
				[__("Total"), preview.rounded_total || preview.grand_total || estimated, "is-grand"],
			]) {
				const pair = el("div", `bnd-pos__total ${className}`);
				pair.append(el("dt", null, label), el("dd", null, money(value, currency)));
				totals.append(pair);
			}
			pay.querySelector("span:last-child").textContent = state.cart.size
				? `${__("Pay")} · ${money(preview.rounded_total || preview.grand_total || estimated, currency)}`
				: __("Pay");
		}

		function payload() {
			return {
				pos_profile: state.profile,
				customer: state.customer,
				service_mode: state.service,
				order_type: state.service === "Cafe" ? state.orderType : "",
				table_number: state.service === "Cafe" && state.orderType === "Dine In" ? state.tableNumber : "",
				items: [...state.cart.values()].map((row) => ({ ...row })),
			};
		}

		function editNote(key) {
			const row = state.cart.get(key);
			if (!row) return;
			const dialog = new frappe.ui.Dialog({
				title: __("Preparation note"),
				fields: [{ fieldname: "note", fieldtype: "Small Text", label: __("Note for kitchen"), default: row.kitchen_note || "" }],
				primary_action_label: __("Save note"),
				primary_action(values) {
					row.kitchen_note = String(values.note || "").trim().slice(0, 280);
					dialog.hide();
					renderCart();
					schedulePreview();
				},
			});
			dialog.show();
		}

		let previewTimer = 0;
		function schedulePreview() {
			clearTimeout(previewTimer);
			state.preview = null;
			renderTotals();
			if (!state.cart.size || !state.customer || (state.service === "Cafe" && state.orderType === "Dine In" && !state.tableNumber)) return;
			previewTimer = setTimeout(previewSale, 280);
		}

		async function previewSale() {
			const serial = ++state.previewRequest;
			try {
				const result = await api("preview_cart", { payload: JSON.stringify(payload()) });
				if (serial !== state.previewRequest) return;
				state.preview = result;
				renderTotals();
			} catch (error) {
				if (serial !== state.previewRequest) return;
				frappe.show_alert({ message: messageOf(error, __("The total could not be calculated.")), indicator: "orange" });
			}
		}

		async function holdSale() {
			if (!state.cart.size || !validOrderContext()) return;
			setBusy(true, __("Holding sale…"));
			try {
				const result = await api("hold_cart", {
					payload: JSON.stringify(payload()),
					draft_name: state.draft || undefined,
				});
				state.draft = result.name;
				frappe.show_alert({ message: __("Sale held as {0}", [result.name]), indicator: "green" });
				resetSale();
				setView("held");
			} catch (error) {
				showFailure(error, __("The sale could not be held."));
			} finally {
				setBusy(false);
			}
		}

		async function printKitchenTicket() {
			if (state.service !== "Cafe" || !state.cart.size || !validOrderContext()) return;
			const orderType = state.orderType;
			const tableNumber = state.tableNumber;
			const popup = window.open("", "_blank");
			if (!popup) {
				frappe.msgprint(__("Allow pop-ups to print the kitchen ticket, then try again."));
				return;
			}
			popup.opener = null;
			popup.document.body.textContent = __("Saving the order…");
			setBusy(true, __("Saving the kitchen order…"));
			try {
				const result = await api("hold_cart", {
					payload: JSON.stringify(payload()),
					draft_name: state.draft || undefined,
				});
				state.draft = result.name;
				state.preview = result;
				renderCart();
				const doc = popup.document;
				doc.title = __("Kitchen ticket") + " · " + result.name;
				const style = doc.createElement("style");
				style.textContent = "body{font:16px Arial,sans-serif;max-width:460px;margin:24px auto;color:#18372a}header{border-bottom:2px solid #18372a;padding-bottom:12px}h1{font-size:23px;margin:0 0 8px}p{margin:5px 0}ol{list-style:none;padding:0}li{padding:14px 0;border-bottom:1px solid #bac8bd}li strong{font-size:18px}.note{display:block;margin-top:6px}button{margin-top:20px;padding:9px 16px}@media print{button{display:none}body{margin:0}}";
				const main = doc.createElement("main");
				const add = (parent, tag, value, className) => {
					const node = doc.createElement(tag);
					node.textContent = value;
					if (className) node.className = className;
					parent.append(node);
					return node;
				};
				const heading = doc.createElement("header");
				add(heading, "h1", __("Kitchen ticket"));
				add(heading, "p", result.name);
				add(heading, "p", `${__(orderType === "Dine In" ? "Dine in" : "Takeaway")}${tableNumber ? ` · ${__("Table")} ${tableNumber}` : ""}`);
				add(heading, "p", new Date().toLocaleString(locale()));
				main.append(heading);
				const lines = doc.createElement("ol");
				for (const row of result.items || []) {
					const item = doc.createElement("li");
					add(item, "strong", `${number(row.qty)} × ${row.item_name}`);
					if (row.kitchen_note) add(item, "span", row.kitchen_note, "note");
					lines.append(item);
				}
				main.append(lines);
				const print = add(main, "button", __("Print kitchen ticket"));
				print.addEventListener("click", () => popup.print());
				doc.head.append(style);
				doc.body.replaceChildren(main);
				popup.focus();
				popup.print();
				frappe.show_alert({ message: __("Order saved as draft. Print the kitchen ticket from the new tab."), indicator: "green" });
			} catch (error) {
				popup.close();
				showFailure(error, __("The kitchen order could not be saved."));
			} finally {
				setBusy(false);
			}
		}

		function showPayment() {
			if (!validOrderContext()) return;
			if (!state.cart.size || !state.customer || !state.preview) {
				if (!state.preview && state.cart.size && state.customer) previewSale();
				frappe.show_alert({ message: __("Wait for the sale total, then choose payment."), indicator: "orange" });
				return;
			}
			const methods = state.context.profile.payments || [];
			if (!methods.length) {
				frappe.msgprint(__("This POS Profile has no payment methods."));
				return;
			}
			const due = Number(state.preview.rounded_total || state.preview.grand_total || 0);
			const fields = [
				{ fieldtype: "HTML", options: `<div class="bnd-pos-payment-total"><span>${__("Amount due")}</span><strong>${money(due, state.preview.currency)}</strong></div>` },
			];
			methods.forEach((method, index) => {
				fields.push({
					fieldname: `amount_${index}`,
					fieldtype: "Currency",
					label: __(method.mode_of_payment),
					default: method.default ? due : 0,
					reqd: 0,
				});
				if (method.type !== "Cash") fields.push({
					fieldname: `reference_${index}`,
					fieldtype: "Data",
					label: __("Payment reference: {0}", [__(method.mode_of_payment)]),
					depends_on: `eval:doc.amount_${index}>0`,
					mandatory_depends_on: `eval:doc.amount_${index}>0`,
				});
			});
			const dialog = new frappe.ui.Dialog({
				title: __("Collect payment"),
				fields,
				primary_action_label: __("Complete sale"),
				primary_action: async (values) => {
					const payments = methods.map((method, index) => ({
						mode_of_payment: method.mode_of_payment,
						amount: Number(values[`amount_${index}`] || 0),
						reference_no: values[`reference_${index}`] || "",
					})).filter((row) => row.amount > 0);
					dialog.get_primary_btn().prop("disabled", true);
					try {
						const result = await api("checkout", {
							payload: JSON.stringify(payload()),
							payments: JSON.stringify(payments),
							draft_name: state.draft || undefined,
						}, { freeze: true, message: __("Completing sale through ERPNext…") });
						dialog.hide();
						showReceipt(result);
					} catch (error) {
						showFailure(error, __("The sale was not submitted."));
						dialog.get_primary_btn().prop("disabled", false);
					}
				},
			});
			dialog.show();
		}

		async function showReceipt(receipt) {
			const format = state.context.profile.print_format || "POS Invoice";
			let readiness;
			try { readiness = await deliverySnapshot(receipt.doctype, receipt.name); }
			catch (_) { readiness = { ready: false, reason: __("Invoice delivery status is unavailable. Try again shortly.") }; }
			const body = document.createElement("div");
			body.className = "bnd-pos-receipt-result";
			body.append(
				icon("check-circle", "lg"),
				el("h3", null, __("Sale complete")),
				el("p", null, receipt.name),
				el("strong", null, money(receipt.rounded_total || receipt.grand_total, receipt.currency))
			);
			const dialogOptions = {
				title: __("Receipt ready"),
				fields: [{ fieldtype: "HTML", fieldname: "receipt_result", options: body.outerHTML }],
				secondary_action_label: __("New sale"),
				secondary_action: () => {
					dialog.hide();
					resetSale();
				},
			};
			if (readiness.ready || readiness.can_preview_sandbox) {
				dialogOptions.primary_action_label = readiness.state === "sandbox_only" ? __("Preview Sandbox test invoice") : __("Print receipt");
				dialogOptions.primary_action = () => printReceipt(receipt.doctype, receipt.name, format, readiness);
			}
			const dialog = new frappe.ui.Dialog(dialogOptions);
			dialog.show();
			const resultBody = dialog.fields_dict.receipt_result.$wrapper?.[0];
			if (resultBody) {
				if (!readiness.ready) el("p", "bnd-pos-receipt-not-ready", readiness.reason, resultBody);
				const actions = el("div", "bnd-pos-receipt-share", null, resultBody);
				if (readiness.ready) actions.append(button(__("Send to customer"), "send", "btn btn-default", () => {
					dialog.hide();
					const delivery = window.bunood_theme?.sales_bill?.showInvoiceDelivery;
					if (delivery) delivery({ doctype: receipt.doctype, doc: receipt, isPosReceiptHandoff: true }, true);
					else frappe.set_route("Form", receipt.doctype, receipt.name);
				}));
				else if (readiness.record) actions.append(button(__("View ZATCA record"), "external-link", "btn btn-default",
					() => frappe.set_route("Form", "Sales Invoice Additional Fields", readiness.record)));
				if (readiness.can_queue) actions.append(button(__("Send to ZATCA"), "send", "btn btn-default", async () => {
					try {
						await frappe.call({ method: "bunood_theme.zatca.status.queue_invoice", type: "POST",
							args: { invoice_name: receipt.name, invoice_doctype: receipt.doctype } });
						frappe.show_alert({ message: __("Invoice queued for ZATCA. Status will update automatically."), indicator: "green" });
						dialog.hide();
					} catch (_) { /* Frappe displays the native connector error. */ }
				}));
			}
			if (readiness.ready && state.context.profile.print_receipt_on_order_complete)
				printReceipt(receipt.doctype, receipt.name, format, readiness, true);
			resetSale();
		}

		function printReceipt(doctype, name, format, readiness = null, autoPrint = false) {
			printCustomerReceipt(doctype, name, format, readiness, autoPrint);
		}

		function resetSale() {
			state.cart.clear();
			state.draft = "";
			state.preview = null;
			state.orderType = "Takeaway";
			state.tableNumber = "";
			state.customer = state.context?.profile?.customer || "";
			customerControl.set_value(state.customer);
			syncServiceControls();
			renderCart();
			setMobileView("items");
			search.focus();
		}

		async function loadHeld() {
			listsTitle.textContent = __("Held sales");
			listsSearch.hidden = true;
			listBody.replaceChildren(skeleton());
			try {
				const rows = await api("held_carts", { pos_profile: state.profile }, { type: "GET" });
				drawList(rows, "held");
			} catch (error) {
				showFailure(error, __("Held sales could not be loaded."), listBody);
			}
		}

		async function loadHistory() {
			listsTitle.textContent = __("Receipts and returns");
			listsSearch.hidden = false;
			listBody.replaceChildren(skeleton());
			try {
				const rows = await api("sale_history", { pos_profile: state.profile, search_term: listsSearch.value }, { type: "GET" });
				drawList(rows, "history");
			} catch (error) {
				showFailure(error, __("Receipts could not be loaded."), listBody);
			}
		}

		function skeleton() {
			const node = el("div", "bnd-pos__skeleton");
			for (let index = 0; index < 4; index += 1) node.append(el("span"));
			return node;
		}

		function drawList(rows, kind) {
			listBody.replaceChildren();
			if (!rows.length) {
				const empty = el("div", "bnd-pos__empty");
				empty.append(icon(kind === "held" ? "pause" : "file-text", "lg"), el("strong", null, kind === "held" ? __("No held sales") : __("No receipts found")));
				listBody.append(empty);
				return;
			}
			for (const row of rows) {
				const card = el("article", "bnd-pos__list-card");
				const copy = el("div", "bnd-pos__list-copy");
				const service = row.custom_bunood_service_mode === "Cafe"
					? `${__("Café & dining")} · ${__(row.custom_bunood_order_type === "Dine In" ? "Dine in" : "Takeaway")}${row.custom_bunood_table_number ? ` · ${__("Table")} ${row.custom_bunood_table_number}` : ""}`
					: __("Retail");
				copy.append(
					el("strong", null, row.customer_name || row.customer || __("Walk-in customer")),
					el("span", null, `${row.name}${kind === "history" ? ` · ${__("POS receipt")} · ${__(row.doctype || state.context.invoice_type)}` : ""}`),
					el("small", null, `${service} · ${kind === "held" ? userDate(row.modified) : `${userDate(row.posting_date)} · ${row.status || ""}`}`)
				);
				const value = el("strong", "bnd-pos__list-value", money(row.grand_total, row.currency || state.context.profile.currency));
				const actions = el("div", "bnd-pos__list-actions");
				if (kind === "held") actions.append(button(__("Resume"), "play", "btn btn-primary", () => resume(row.name)));
				else {
					actions.append(button(__("Print"), "printer", "btn btn-default", () => printReceipt(row.doctype || state.context.invoice_type, row.name,
						row.doctype === state.context.invoice_type ? state.context.profile.print_format : "Standard")));
					if (!row.is_return) actions.append(button(__("Return"), "rotate-ccw", "btn btn-default", () => createReturn(row.name, row.doctype || state.context.invoice_type)));
				}
				actions.append(button(__("Open"), "external-link", "btn btn-default", () => frappe.set_route("Form", row.doctype || state.context.invoice_type, row.name)));
				card.append(copy, value, actions);
				listBody.append(card);
			}
		}

		function resume(name) {
			if (state.cart.size || state.draft) {
				frappe.confirm(__("Replace the current ticket with this held sale? Hold it first if you need to keep it."), () => resumeNow(name));
				return;
			}
			resumeNow(name);
		}

		async function resumeNow(name) {
			setBusy(true, __("Resuming held sale…"));
			try {
				const result = await api("load_cart", { name }, { type: "GET" });
				state.service = result.service_mode === "Cafe" ? "Cafe" : "Retail";
				state.draft = result.name;
				state.customer = result.customer;
				state.orderType = result.order_type || "Takeaway";
				state.tableNumber = result.table_number || "";
				state.cart = new Map();
				for (const [index, item] of (result.items || []).entries()) {
					const row = { ...item };
					state.cart.set(state.service === "Cafe" ? `${keyFor(row)}::${index}` : keyFor(row), row);
				}
				state.preview = result;
				customerControl.set_value(state.customer);
				syncServiceControls();
				renderCart();
				setView("items");
				setMobileView("cart");
			} catch (error) {
				showFailure(error, __("The held sale could not be resumed."));
			} finally {
				setBusy(false);
			}
		}

		async function createReturn(name, doctype = state.context.invoice_type) {
			frappe.confirm(__("Create a return from receipt {0}?", [name]), async () => {
				try {
					const result = await api("create_return", { source_doctype: doctype, source_name: name }, { freeze: true, message: __("Preparing native return…") });
					frappe.set_route.apply(frappe, result.route);
				} catch (error) {
					showFailure(error, __("The return draft could not be created."));
				}
			});
		}

		function showOpening() {
			const profile = state.context?.profile;
			if (!profile) return;
			const fields = [{ fieldtype: "HTML", options: `<p>${__("Enter the physical starting amount for each tender. ERPNext will store the submitted opening entry.")}</p>` }];
			(profile.payments || []).forEach((method, index) => fields.push({
				fieldname: `opening_${index}`,
				fieldtype: "Currency",
				label: __(method.mode_of_payment),
				default: 0,
			}));
			const dialog = new frappe.ui.Dialog({
				title: __("Open POS shift"),
				fields,
				primary_action_label: __("Open shift"),
				primary_action: async (values) => {
					const balances = profile.payments.map((method, index) => ({ mode_of_payment: method.mode_of_payment, opening_amount: values[`opening_${index}`] || 0 }));
					try {
						await api("open_shift", { pos_profile: profile.name, balances: JSON.stringify(balances) }, { freeze: true, message: __("Opening the counter…") });
						dialog.hide();
						await initialize(profile.name);
					} catch (error) {
						showFailure(error, __("The shift could not be opened."));
					}
				},
			});
			dialog.show();
		}

		function closeCurrentShift() {
			const opening = state.context?.opening_entry || state.context?.stale_opening_entry;
			if (!opening) return;
			frappe.route_options = {
				pos_profile: opening.pos_profile,
				user: frappe.session.user,
				company: opening.company,
				pos_opening_entry: opening.name,
				period_end_date: frappe.datetime.now_datetime(),
				posting_date: frappe.datetime.get_today(),
			};
			frappe.new_doc("POS Closing Entry");
		}

		function createCustomer() {
			if (!state.context?.capabilities?.can_create_customer) return;
			frappe.ui.form.make_quick_entry("Customer", (doc) => {
				state.customer = doc.name;
				customerControl.set_value(doc.name);
				schedulePreview();
			});
		}

		function startScanner() {
			if (frappe.ui?.Scanner) {
				const scanner = new frappe.ui.Scanner({
					dialog: true,
					multiple: false,
					on_scan(data) {
						const decoded = data?.decodedText || data?.text || data;
						if (!decoded) return;
						search.value = String(decoded);
						state.search = search.value;
						loadItems(false);
						scanner.stop_scan?.();
					},
				});
				scanner.make_scanner?.();
				return;
			}
			search.focus();
			frappe.show_alert({ message: __("Scan with the barcode reader or type the code, then press Enter."), indicator: "blue" });
		}

		function messageOf(error, fallback) {
			if (error?.message) return error.message;
			const server = error?._server_messages;
			if (server) {
				try {
					const messages = JSON.parse(server).map((entry) => JSON.parse(entry).message).filter(Boolean);
					if (messages.length) return messages.join(" ");
				} catch (_parseError) { /* use fallback */ }
			}
			return fallback;
		}

		function showFailure(error, fallback, host) {
			const message = messageOf(error, fallback);
			if (!host) {
				frappe.msgprint({ title: __("Bunood POS"), message, indicator: "red" });
				return;
			}
			host.replaceChildren();
			const failure = el("div", "bnd-pos__failure");
			failure.setAttribute("role", "alert");
			failure.append(icon("alert-triangle"), el("strong", null, fallback), el("span", null, message));
			host.append(failure);
		}

		let searchTimer = 0;
		search.addEventListener("input", () => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				state.search = search.value.trim();
				loadItems(false);
			}, 240);
		});
		search.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			state.search = search.value.trim();
			loadItems(false).then(() => {
				if (state.items.length === 1) addItem(state.items[0]);
			});
		});
		profileSelect.addEventListener("change", () => initialize(profileSelect.value));
		let historyTimer = 0;
		listsSearch.addEventListener("input", () => {
			clearTimeout(historyTimer);
			historyTimer = setTimeout(loadHistory, 260);
		});
		window.addEventListener("online", syncOnlineState);
		window.addEventListener("offline", syncOnlineState);
		function syncOnlineState() {
			if (!root.isConnected) return;
			renderCart();
		}
		// Browser online status alone does not mean the ERPNext POS endpoint works.
		// Recheck the same permission-filtered endpoint used to prepare the counter.
		const connectionTimer = window.setInterval(async () => {
			if (!root.isConnected) { window.clearInterval(connectionTimer); return; }
			if (document.hidden || !navigator.onLine || state.busy) return;
			try {
				await api("get_context", { pos_profile: state.profile || undefined }, { type: "GET" });
				state.backendConnected = true;
			} catch (_error) {
				state.backendConnected = false;
			}
			syncOnlineState();
		}, 60000);
		document.addEventListener("keydown", (event) => {
			if (!root.isConnected || event.target?.matches?.("input, textarea, select")) return;
			if (event.key === "F2") { event.preventDefault(); search.focus(); }
			if (event.key === "F4") { event.preventDefault(); showPayment(); }
			if (event.key === "F7") { event.preventDefault(); holdSale(); }
		});

		setView("items");
		setMobileView("items");
		syncServiceControls();
		syncOnlineState();
		initialize();
	}

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
		const resultTitle = el("h2", null, __("Receipts"), resultHead);
		const resultNote = el("p", null, __("Original records, including older POS invoice types"), resultHead);
		const columnHead = el("div", "bnd-pos-register__columns", null, result);
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
				button(__("Reprint"), "printer", "btn btn-default", () =>
					printCustomerReceipt(row.doctype, row.name, "Standard"))
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
				resultTitle.textContent = __("Receipts");
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
