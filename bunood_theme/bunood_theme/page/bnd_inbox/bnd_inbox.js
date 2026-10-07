// Copyright (c) 2026, Bunood and contributors
// ============================================================================
// THE FULL-PAGE INBOX — checklist item 13, style "Inbox + Page".
//
// WHAT
//   A split-pane triage surface: notification list on one side, a detail
//   pane on the other that follows the selection, with a keyboard loop
//   (j/k or arrows to move, Enter to open, e to mark read and AUTO-ADVANCE)
//   so an approver facing forty pending documents never leaves the keys.
//
// WHY A REAL FRAPPE PAGE
//   This is our own app's page directory — the sanctioned way to add a desk
//   route. It creates no coupling to a core doctype (the rule that also
//   keeps density, palette frecency and inbox "done" out of the User form),
//   and Frappe owns the routing, the page shell and the permission check.
//
// WHY THE RENDERING LIVES IN bunood.js, NOT HERE
//   The panel and this page must render a row identically — same classes,
//   same chips, same done state. bunood.js exposes the shared renderer as
//   `bunood_theme.inbox_render_page(container)`; this file is only the
//   route's entry point. If the theme's JS did not load (or the style is
//   not "Inbox + Page"), the page says so instead of rendering half a UI.
// ============================================================================

/* eslint-env browser */
/* global frappe, __ */

frappe.pages["bnd-inbox"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Inbox"),
		single_column: true,
	});

	const container = document.createElement("div");
	page.main.append(container);

	const api = window.bunood_theme;
	if (!api || typeof api.inbox_render_page !== "function") {
		// Fails open, loudly enough to be actionable but without a stack
		// trace: the theme's desk script is what owns this surface.
		container.innerHTML =
			'<div class="text-muted" style="padding:2rem;text-align:center">' +
			__("The Bunood inbox is not active. Enable it in Theme Settings.") +
			"</div>";
		return;
	}

	api.inbox_render_page(container, page);
};
