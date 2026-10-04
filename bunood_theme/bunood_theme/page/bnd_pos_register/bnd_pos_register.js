// Copyright (c) 2026, Bunood and contributors
/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-pos-register"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper, title: __("POS sales register"), single_column: true,
	});
	const container = document.createElement("div");
	page.main.append(container);
	wrapper._bnd_pos_register_container = container;
	const fallback = () => ({ css: frappe.boot?.bnd_pos_css, js: frappe.boot?.bnd_pos_js });
	const load = (path, kind) => new Promise((resolve, reject) => {
		if (!path) return reject(new Error(`Missing POS ${kind} asset`));
		const wanted = new URL(path, location.origin);
		const selector = kind === "css" ? 'link[rel="stylesheet"]' : "script[src]";
		const existing = [...document.querySelectorAll(selector)].find((node) =>
			new URL(kind === "css" ? node.href : node.src, location.origin).pathname === wanted.pathname);
		if (existing && (kind === "js" || existing.sheet)) return resolve();
		if (existing) existing.remove();
		const node = document.createElement(kind === "css" ? "link" : "script");
		if (kind === "css") { node.rel = "stylesheet"; node.href = wanted.href; }
		else { node.src = wanted.href; node.async = true; }
		node.addEventListener("load", resolve, { once: true });
		node.addEventListener("error", () => { node.remove(); reject(new Error(`Failed to load POS ${kind} asset`)); }, { once: true });
		document.head.append(node);
	});
	frappe.call({ method: "bunood_theme.api.get_pos_assets", type: "GET" })
		.then((response) => response.message || fallback()).catch(fallback)
		.then((paths) => load(paths.css, "css").then(() => load(paths.js, "js")))
		.then(() => {
			if (typeof window.bunood_theme?.pos_register_render !== "function") {
				throw new Error("POS register renderer unavailable");
			}
			window.bunood_theme.pos_register_render(container, page);
		})
		.catch((error) => {
			console.error("POS register load failed", error);
			container.replaceChildren();
			const message = document.createElement("p");
			message.className = "bnd-pos-load-error";
			message.setAttribute("role", "alert");
			message.textContent = __("POS receipts could not be loaded. Rebuild the theme assets and try again.");
			container.append(message);
		});
};

frappe.pages["bnd-pos-register"].on_page_show = function (wrapper) {
	const container = wrapper._bnd_pos_register_container;
	if (container?.querySelector(".bnd-pos-register") && window.bunood_theme?.pos_register_render) {
		window.bunood_theme.pos_register_render(container);
	}
};
