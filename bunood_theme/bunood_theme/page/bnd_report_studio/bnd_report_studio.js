// Copyright (c) 2026, Bunood and contributors
// ============================================================================
// THE REPORT STUDIO — route entry point only.
//
// WHY THIS FILE IS SMALL (the bnd-inbox precedent)
//   A page directory is the sanctioned way to own a desk route; the RENDERING
//   lives in its own hashed bundle (public/js/report_studio.js) so the global
//   desk payload never pays for a surface only report readers open. boot.py
//   exposes that bundle's content-hashed URL as `bnd_studio_js` — the ONLY
//   safe way to reach it, because a literal path would either go stale on the
//   next build or fall into the `.bundle.` / stale-assets.json trap that
//   ARCHITECTURE.md section 6 documents.
// ============================================================================

/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-report-studio"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Report Studio"),
		single_column: true,
	});

	const container = document.createElement("div");
	page.main.append(container);

	const fail = (message) => {
		container.innerHTML =
			'<div class="text-muted" style="padding:2rem;text-align:center">' +
			message +
			"</div>";
	};

	const bootAssets = () => ({
		css: frappe.boot && frappe.boot.bnd_studio_css,
		js: frappe.boot && frappe.boot.bnd_studio_js,
	});

	const currentAssets = () => frappe.call({
		method: "bunood_theme.api.get_report_studio_assets",
		type: "GET",
	}).then((response) => response.message || bootAssets())
		.catch(() => bootAssets());

	const load = (path, kind) => new Promise((resolve, reject) => {
		if (!path) {
			reject(new Error(`Missing Report Studio ${kind} asset`));
			return;
		}

		const wanted = new URL(path, window.location.origin);
		const selector = kind === "css" ? 'link[rel="stylesheet"]' : "script[src]";
		const existing = [...document.querySelectorAll(selector)].find((node) => {
			const candidate = new URL(kind === "css" ? node.href : node.src, window.location.origin);
			return candidate.pathname === wanted.pathname;
		});

		// Do not trust frappe.assets._executed here. Frappe deliberately resolves
		// failed requests for backward compatibility and records them as executed,
		// which is exactly how a Studio can render raw controls and intrinsic SVGs.
		if (existing && (kind === "js" || existing.sheet)) {
			resolve();
			return;
		}
		if (existing) existing.remove();

		const node = document.createElement(kind === "css" ? "link" : "script");
		node.dataset.bndStudioAsset = kind;
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
			reject(new Error(`Failed to load Report Studio ${kind} asset`));
		}, { once: true });
		document.head.append(node);
	});

	currentAssets()
		// CSS first: the catalogue must never expose intrinsic SVG dimensions.
		.then((assets) => load(assets.css, "css").then(() => load(assets.js, "js")))
		.then(() => {
			const api = window.bunood_theme;
			if (!api || typeof api.report_studio_render !== "function") {
				throw new Error("Report Studio renderer is unavailable");
			}
			api.report_studio_render(container, page);
		})
		.catch((error) => {
			console.error("Report Studio asset load failed", error);
			fail(__("The Report Studio failed to load. Check the browser console."));
		});
};
