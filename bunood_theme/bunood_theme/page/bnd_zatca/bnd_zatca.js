// Copyright (c) 2026, Bunood and contributors
/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-zatca"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("ZATCA workspace"),
		single_column: true,
	});
	const container = document.createElement("div");
	page.main.append(container);

	const fail = () => {
		container.replaceChildren();
		const message = document.createElement("p");
		message.className = "bnd-zatca-load-error";
		message.setAttribute("role", "alert");
		message.textContent = __("The ZATCA workspace could not load. Rebuild the theme assets and try again.");
		container.append(message);
	};
	const load = (path, kind) => new Promise((resolve, reject) => {
		if (!path) return reject(new Error(`Missing ZATCA ${kind} asset`));
		const wanted = new URL(path, window.location.origin);
		const selector = kind === "css" ? 'link[rel="stylesheet"]' : "script[src]";
		const existing = [...document.querySelectorAll(selector)].find((node) => {
			const candidate = new URL(kind === "css" ? node.href : node.src, window.location.origin);
			return candidate.pathname === wanted.pathname;
		});
		if (existing && (kind === "js" || existing.sheet)) return resolve();
		if (existing) existing.remove();
		const node = document.createElement(kind === "css" ? "link" : "script");
		if (kind === "css") { node.rel = "stylesheet"; node.href = wanted.href; }
		else { node.src = wanted.href; node.async = true; }
		node.addEventListener("load", resolve, { once: true });
		node.addEventListener("error", () => { node.remove(); reject(new Error(`Failed ZATCA ${kind} asset`)); }, { once: true });
		document.head.append(node);
	});

	const css = frappe.boot?.bnd_zatca_css;
	const js = frappe.boot?.bnd_zatca_js;
	load(css, "css").then(() => load(js, "js")).then(() => {
		if (typeof window.bunood_theme?.zatca_render !== "function") throw new Error("Missing ZATCA renderer");
		window.bunood_theme.zatca_render(container, page);
	}).catch((error) => { console.error("Bunood ZATCA workspace load failed", error); fail(); });
};
