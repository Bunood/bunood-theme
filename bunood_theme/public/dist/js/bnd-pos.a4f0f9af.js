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

	function render(container, page) {
		container.replaceChildren();
		const root = el("section", "bnd-pos-workbench");
		container.append(root);
		const state = {
			context: null,
			profile: "",
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
			el("p", "bnd-pos__eyebrow", __("Retail workspace")),
			el("h2", null, __("Bunood POS")),
			el("p", "bnd-pos__subtitle", __("Scan, sell, collect, and print without leaving the counter."))
		);
		const headerActions = el("div", "bnd-pos__header-actions", null, header);
		const online = el("span", "bnd-pos__online", null, headerActions);
		online.append(el("span", "bnd-pos__online-dot"), el("span", null, __("Online · ERPNext connected")));
		const profileSelect = el("select", "form-control bnd-pos__profile", null, headerActions);
		profileSelect.setAttribute("aria-label", __("POS Profile"));
		const quickSale = button(__("Quick Sale"), "file-plus", "btn btn-default", () => frappe.set_route("bnd-quick-sale"));
		const nativePos = button(__("Native POS"), "external-link", "btn btn-default", () => frappe.set_route("point-of-sale"));
		headerActions.append(online, profileSelect, quickSale, nativePos);

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
		const listBody = el("div", "bnd-pos__list-body", null, lists);

		const cart = el("aside", "bnd-pos__cart", null, workspace);
		cart.setAttribute("aria-label", __("Current sale"));
		const cartHead = el("header", "bnd-pos__cart-head", null, cart);
		const cartHeading = el("div", null, null, cartHead);
		cartHeading.append(el("p", "bnd-pos__eyebrow", __("Current sale")), el("h3", null, __("Cart")));
		const newSale = button(__("New"), "plus", "btn btn-default", resetSale);
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
		const cartLines = el("div", "bnd-pos__cart-lines", null, cart);
		const totals = el("dl", "bnd-pos__totals", null, cart);
		const cartActions = el("div", "bnd-pos__cart-actions", null, cart);
		const hold = button(__("Hold sale"), "pause", "btn btn-default", holdSale);
		const pay = button(__("Pay"), "credit-card", "btn btn-primary bnd-pos__pay", showPayment);
		cartActions.append(hold, pay);
		cart.append(cartActions);

		const mobileNav = el("nav", "bnd-pos__mobile-nav", null, root);
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
				for (const control of [profileSelect, openShift, closeShift, newSale, hold, pay, loadMore]) {
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
			try {
				state.context = await api("get_context", { pos_profile: profile || undefined }, { type: "GET" });
				state.profile = state.context.profile?.name || "";
				fillProfiles();
				applyContext();
				if (state.context.opening_entry) await loadItems(false);
			} catch (error) {
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
				catalogueLive.textContent = staleOpening
					? __("Review and close the outdated shift before opening today's counter.")
					: __("Open the counter to start selling");
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
				const control = button(group, null, "bnd-pos__group", () => chooseGroup(group));
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
				const media = el("span", "bnd-pos__product-media");
				if (item.item_image && !state.context.profile.hide_images) {
					const image = el("img");
					image.src = item.item_image;
					image.alt = "";
					image.loading = "lazy";
					image.addEventListener("error", () => media.replaceChildren(el("span", null, initials(item.item_name || item.item_code))), { once: true });
					media.append(image);
				} else {
					media.append(el("span", null, initials(item.item_name || item.item_code)));
				}
				const copy = el("span", "bnd-pos__product-copy");
				copy.append(
					el("strong", null, item.item_name || item.item_code),
					el("small", null, item.item_code),
					el("b", null, money(item.price_list_rate, item.currency || state.context.profile.currency))
				);
				const stock = el("span", "bnd-pos__stock", __("Stock {0}", [number(item.actual_qty)]));
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
			const key = keyFor(item);
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
					const stepper = el("div", "bnd-pos__stepper");
					const minus = button(__("Decrease quantity"), "minus", "bnd-pos__step", () => updateQuantity(key, row.qty - 1));
					minus.setAttribute("aria-label", __("Decrease quantity"));
					const input = el("input", "form-control");
					input.type = "number";
					input.min = "0";
					input.step = "1";
					input.value = row.qty;
					input.setAttribute("aria-label", __("Quantity for {0}", [row.item_name]));
					input.addEventListener("change", () => updateQuantity(key, input.value));
					const plus = button(__("Increase quantity"), "plus", "bnd-pos__step", () => updateQuantity(key, row.qty + 1));
					plus.setAttribute("aria-label", __("Increase quantity"));
					stepper.append(minus, input, plus);
					const amount = el("strong", "bnd-pos__line-amount", money(row.qty * row.rate, state.context?.profile?.currency));
					const remove = button(__("Remove"), "trash-2", "bnd-pos__remove", () => updateQuantity(key, 0));
					line.append(copy, stepper, amount, remove);
					cartLines.append(line);
				}
			}
			renderTotals();
			const enabled = rows.length > 0 && Boolean(state.context?.opening_entry) && navigator.onLine;
			hold.disabled = !enabled || state.busy;
			pay.disabled = !enabled || state.busy || !state.customer;
			newSale.disabled = !rows.length && !state.draft;
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
				items: [...state.cart.values()].map((row) => ({ ...row })),
			};
		}

		let previewTimer = 0;
		function schedulePreview() {
			clearTimeout(previewTimer);
			state.preview = null;
			renderTotals();
			if (!state.cart.size || !state.customer) return;
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
			if (!state.cart.size) return;
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

		function showPayment() {
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

		function showReceipt(receipt) {
			const format = state.context.profile.print_format || "POS Invoice";
			const body = document.createElement("div");
			body.className = "bnd-pos-receipt-result";
			body.append(
				icon("check-circle", "lg"),
				el("h3", null, __("Sale complete")),
				el("p", null, receipt.name),
				el("strong", null, money(receipt.rounded_total || receipt.grand_total, receipt.currency))
			);
			const dialog = new frappe.ui.Dialog({
				title: __("Receipt ready"),
				fields: [{ fieldtype: "HTML", options: body.outerHTML }],
				primary_action_label: __("Print receipt"),
				primary_action: () => printReceipt(receipt.doctype, receipt.name, format),
				secondary_action_label: __("New sale"),
				secondary_action: () => {
					dialog.hide();
					resetSale();
				},
			});
			dialog.show();
			if (state.context.profile.print_receipt_on_order_complete) printReceipt(receipt.doctype, receipt.name, format);
			resetSale();
		}

		function printReceipt(doctype, name, format) {
			const query = new URLSearchParams({ doctype, name, format: format || "POS Invoice", trigger_print: "1" });
			window.open(`/printview?${query.toString()}`, "_blank", "noopener");
		}

		function resetSale() {
			state.cart.clear();
			state.draft = "";
			state.preview = null;
			state.customer = state.context?.profile?.customer || "";
			customerControl.set_value(state.customer);
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
				copy.append(
					el("strong", null, row.customer_name || row.customer || __("Walk-in customer")),
					el("span", null, row.name),
					el("small", null, kind === "held" ? userDate(row.modified) : `${userDate(row.posting_date)} · ${row.status || ""}`)
				);
				const value = el("strong", "bnd-pos__list-value", money(row.grand_total, row.currency || state.context.profile.currency));
				const actions = el("div", "bnd-pos__list-actions");
				if (kind === "held") actions.append(button(__("Resume"), "play", "btn btn-primary", () => resume(row.name)));
				else {
					actions.append(button(__("Print"), "printer", "btn btn-default", () => printReceipt(state.context.invoice_type, row.name, state.context.profile.print_format)));
					if (!row.is_return) actions.append(button(__("Return"), "rotate-ccw", "btn btn-default", () => createReturn(row.name)));
				}
				actions.append(button(__("Open"), "external-link", "btn btn-default", () => frappe.set_route("Form", state.context.invoice_type, row.name)));
				card.append(copy, value, actions);
				listBody.append(card);
			}
		}

		async function resume(name) {
			setBusy(true, __("Resuming held sale…"));
			try {
				const result = await api("load_cart", { name }, { type: "GET" });
				state.draft = result.name;
				state.customer = result.customer;
				state.cart.clear();
				for (const item of result.items || []) {
					const row = { ...item };
					state.cart.set(keyFor(row), row);
				}
				state.preview = result;
				customerControl.set_value(state.customer);
				renderCart();
				setView("items");
				setMobileView("cart");
			} catch (error) {
				showFailure(error, __("The held sale could not be resumed."));
			} finally {
				setBusy(false);
			}
		}

		async function createReturn(name) {
			frappe.confirm(__("Create a return from receipt {0}?", [name]), async () => {
				try {
					const result = await api("create_return", { source_doctype: state.context.invoice_type, source_name: name }, { freeze: true, message: __("Preparing native return…") });
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
			const connected = navigator.onLine;
			online.classList.toggle("is-offline", !connected);
			online.lastElementChild.textContent = connected ? __("Online · ERPNext connected") : __("Connection lost · checkout paused");
			renderCart();
		}
		document.addEventListener("keydown", (event) => {
			if (!root.isConnected || event.target?.matches?.("input, textarea, select")) return;
			if (event.key === "F2") { event.preventDefault(); search.focus(); }
			if (event.key === "F4") { event.preventDefault(); showPayment(); }
			if (event.key === "F7") { event.preventDefault(); holdSale(); }
		});

		setView("items");
		setMobileView("items");
		syncOnlineState();
		initialize();
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.pos_render = render;
})();
