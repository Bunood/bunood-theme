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

	const src = frappe.boot && frappe.boot.bnd_studio_js;
	if (!src) {
		// boot.py is try-wrapped: a failed theme boot means no key. Fail open,
		// loudly enough to be actionable.
		fail(__("The Report Studio bundle is not registered. Rebuild the theme's assets."));
		return;
	}

	frappe.require(src, () => {
		const api = window.bunood_theme;
		if (!api || typeof api.report_studio_render !== "function") {
			fail(__("The Report Studio failed to load. Check the browser console."));
			return;
		}
		api.report_studio_render(container, page);
	});
};
