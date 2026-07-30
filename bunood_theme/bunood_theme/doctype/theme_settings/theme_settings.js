// Copyright (c) 2026, Bunood and contributors
// For license information, please see license.txt
/**
 * Theme Settings form script — the visual Desk Layout picker.
 *
 * WHAT
 *   Renders five clickable wireframe cards (one per layout) into the
 *   `layout_picker` HTML field. Clicking a card sets the `desk_layout` Select;
 *   the Select stays visible above as the canonical stored value, so the
 *   picker is sugar, never a second source of truth.
 *
 * WHY INLINE SVG THUMBNAILS
 *   The cards are the wireframes the user chose from, shrunk to glyph size —
 *   a layout is a spatial idea and a Select of five nouns does not communicate
 *   it. Drawn with currentColor at low opacity plus var(--primary), so the
 *   thumbnails are legible in both desk themes with no per-mode assets.
 *
 * Loaded automatically by Frappe because it sits next to the DocType it
 * belongs to (bunood_theme/doctype/theme_settings/).
 */

/* global frappe, __ */

frappe.ui.form.on("Theme Settings", {
	refresh(frm) {
		bnd_render_layout_picker(frm);
	},
	desk_layout(frm) {
		bnd_render_layout_picker(frm);
	},
});

/**
 * The five layouts: stored value, human blurb, and a 120x76 thumbnail.
 * Order matches the recommendation ladder — default first.
 */
const BND_LAYOUTS = [
	{
		value: "Top Bar",
		blurb: () => __("Search, notifications and profile in a bar above the page. Slim status bar below."),
		svg:
			'<svg viewBox="0 0 120 76">' +
			'<rect x="1" y="1" width="118" height="74" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="2" width="26" height="72" fill="currentColor" opacity=".08"/>' +
			'<rect x="30" y="2" width="88" height="11" fill="currentColor" opacity=".14"/>' +
			'<rect x="34" y="5" width="30" height="5" rx="2.5" fill="currentColor" opacity=".2"/>' +
			'<circle cx="106" cy="7.5" r="3" fill="var(--primary, #4d8756)"/>' +
			'<circle cx="98" cy="7.5" r="2" fill="currentColor" opacity=".35"/>' +
			'<rect x="30" y="16" width="88" height="8" fill="currentColor" opacity=".06"/>' +
			'<rect x="34" y="30" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="38" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="46" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="30" y="69" width="88" height="5" fill="currentColor" opacity=".14"/>' +
			"</svg>",
	},
	{
		value: "Compact",
		blurb: () => __("No extra bars — global controls share the page title row. Most space for data."),
		svg:
			'<svg viewBox="0 0 120 76">' +
			'<rect x="1" y="1" width="118" height="74" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="2" width="26" height="72" fill="currentColor" opacity=".08"/>' +
			'<rect x="30" y="2" width="88" height="11" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="5" width="26" height="5" rx="2.5" fill="currentColor" opacity=".25"/>' +
			'<circle cx="106" cy="7.5" r="3" fill="var(--primary, #4d8756)"/>' +
			'<circle cx="98" cy="7.5" r="2" fill="currentColor" opacity=".35"/>' +
			'<rect x="34" y="20" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="28" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="36" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="44" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="30" y="69" width="88" height="5" fill="currentColor" opacity=".14"/>' +
			"</svg>",
	},
	{
		value: "Classic",
		blurb: () => __("Everything stays in the sidebar — closest to standard ERPNext."),
		svg:
			'<svg viewBox="0 0 120 76">' +
			'<rect x="1" y="1" width="118" height="74" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="2" width="26" height="72" fill="currentColor" opacity=".08"/>' +
			'<rect x="5" y="8" width="20" height="4" rx="2" fill="currentColor" opacity=".25"/>' +
			'<circle cx="8" cy="18" r="2" fill="currentColor" opacity=".35"/>' +
			'<circle cx="8" cy="66" r="3" fill="var(--primary, #4d8756)"/>' +
			'<rect x="30" y="2" width="88" height="11" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="5" width="26" height="5" rx="2.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="34" y="20" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="28" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="36" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="44" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
	{
		value: "Bottom Bar",
		blurb: () => __("Global search, notifications and profile in a bar along the bottom edge."),
		svg:
			'<svg viewBox="0 0 120 76">' +
			'<rect x="1" y="1" width="118" height="74" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="2" width="26" height="72" fill="currentColor" opacity=".08"/>' +
			'<rect x="30" y="2" width="88" height="11" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="5" width="26" height="5" rx="2.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="34" y="20" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="28" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="34" y="36" width="80" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="30" y="63" width="88" height="11" fill="currentColor" opacity=".16"/>' +
			'<rect x="34" y="66" width="26" height="5" rx="2.5" fill="currentColor" opacity=".25"/>' +
			'<circle cx="106" cy="68.5" r="3" fill="var(--primary, #4d8756)"/>' +
			'<circle cx="98" cy="68.5" r="2" fill="currentColor" opacity=".35"/>' +
			"</svg>",
	},
	{
		value: "Dock",
		blurb: () => __("No sidebar — workspaces float in a bottom dock. Full-width pages."),
		svg:
			'<svg viewBox="0 0 120 76">' +
			'<rect x="1" y="1" width="118" height="74" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="2" width="116" height="11" fill="currentColor" opacity=".1"/>' +
			'<rect x="6" y="5" width="26" height="5" rx="2.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="6" y="20" width="108" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="6" y="28" width="108" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="6" y="36" width="108" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="6" y="44" width="108" height="4" fill="currentColor" opacity=".1"/>' +
			'<rect x="28" y="60" width="64" height="12" rx="6" fill="currentColor" opacity=".16"/>' +
			'<circle cx="36" cy="66" r="3" fill="var(--primary, #4d8756)"/>' +
			'<circle cx="46" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="55" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="64" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="84" cy="66" r="3" fill="var(--primary, #4d8756)"/>' +
			"</svg>",
	},
];

/**
 * (Re)render the picker cards into the HTML field and highlight the current
 * choice. Idempotent — wholesale re-render on every call keeps state trivial.
 * @param {Object} frm - the Theme Settings form.
 */
function bnd_render_layout_picker(frm) {
	const field = frm.get_field("layout_picker");
	if (!field || !field.$wrapper) return;

	const current = frm.doc.desk_layout || "Top Bar";
	const cards = BND_LAYOUTS.map((l) => {
		const selected = l.value === current ? " bnd-lp-selected" : "";
		return (
			'<button type="button" class="bnd-lp-card' + selected + '" data-layout="' + l.value + '">' +
			'<span class="bnd-lp-thumb">' + l.svg + "</span>" +
			'<span class="bnd-lp-name">' + __(l.value) + "</span>" +
			'<span class="bnd-lp-blurb">' + l.blurb() + "</span>" +
			"</button>"
		);
	}).join("");

	field.$wrapper.html(
		"<style>" +
			".bnd-lp{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-block:4px}" +
			".bnd-lp-card{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:10px;" +
			"border:1px solid var(--border-color);border-radius:10px;background:var(--control-bg);cursor:pointer;text-align:start}" +
			".bnd-lp-card:hover{border-color:var(--primary)}" +
			".bnd-lp-selected{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}" +
			".bnd-lp-thumb svg{display:block;inline-size:100%;block-size:auto;color:var(--text-color)}" +
			".bnd-lp-name{font-weight:600;font-size:var(--text-md)}" +
			".bnd-lp-blurb{font-size:var(--text-sm);color:var(--text-muted);line-height:1.45}" +
			"</style>" +
			'<div class="bnd-lp">' + cards + "</div>"
	);

	field.$wrapper.find(".bnd-lp-card").on("click", function () {
		frm.set_value("desk_layout", this.getAttribute("data-layout"));
	});
}
