// Copyright (c) 2026, Bunood and contributors
/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-pos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Bunood POS"),
		single_column: true,
	});
	const container = document.createElement("div");
	page.main.append(container);

	const fail = (message) => {
		container.replaceChildren();
		const state = document.createElement("div");
		state.className = "bnd-pos-load-error";
		state.setAttribute("role", "alert");
		state.textContent = message;
		container.append(state);
	};
	const fallback = () => ({
		css: frappe.boot && frappe.boot.bnd_pos_css,
		js: frappe.boot && frappe.boot.bnd_pos_js,
	});
	const assets = () => frappe.call({
		method: "bunood_theme.api.get_pos_assets",
		type: "GET",
	}).then((response) => response.message || fallback()).catch(fallback);
	const load = (path, kind) => new Promise((resolve, reject) => {
		if (!path) return reject(new Error(`Missing POS ${kind} asset`));
		const wanted = new URL(path, window.location.origin);
		const selector = kind === "css" ? 'link[rel="stylesheet"]' : "script[src]";
		const existing = [...document.querySelectorAll(selector)].find((node) => {
			const candidate = new URL(kind === "css" ? node.href : node.src, window.location.origin);
			return candidate.pathname === wanted.pathname;
		});
		if (existing && (kind === "js" || existing.sheet)) return resolve();
		if (existing) existing.remove();
		const node = document.createElement(kind === "css" ? "link" : "script");
		if (kind === "css") {
			node.rel = "stylesheet";
			node.href = wanted.href;
		} else {
			node.src = wanted.href;
			node.async = true;
		}
		node.addEventListener("load", resolve, { once: true });
		node.addEventListener("error", () => {
			node.remove();
			reject(new Error(`Failed to load POS ${kind} asset`));
		}, { once: true });
		document.head.append(node);
	});

	assets()
		.then((paths) => load(paths.css, "css").then(() => load(paths.js, "js")))
		.then(() => {
			if (typeof window.bunood_theme?.pos_render !== "function") {
				throw new Error("Bunood POS renderer is unavailable");
			}
			window.bunood_theme.pos_render(container, page);
		})
		.catch((error) => {
			console.error("Bunood POS asset load failed", error);
			fail(__("Bunood POS failed to load. Rebuild the theme assets and try again."));
		});
};
