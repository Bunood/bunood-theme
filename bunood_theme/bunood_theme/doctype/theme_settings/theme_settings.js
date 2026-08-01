// Copyright (c) 2026, Bunood and contributors
// For license information, please see license.txt
/**
 * Theme Settings form script — the visual pickers.
 *
 * THREE PICKERS LIVE HERE
 *   1. Desk Layout (item 9): five thumbnail cards -> `desk_layout`.
 *   2. Sidebar Style (item 10): preset cards + one visual control per style
 *      option -> the hidden `sidebar_*` fields.
 *   3. Breadcrumbs (item 11): style cards + extras -> the hidden `crumb_*`
 *      fields. "Original" is the stock-ERPNext escape hatch, like the
 *      layout picker's "Classic".
 *
 * THE CONTRACT WITH THE SERVER
 *   The hidden fields are the canon; presets are labels. Clicking a preset
 *   writes all of its values into the fields (from the catalogue served by
 *   bunood_theme.api.get_sidebar_presets — one source of truth in Python).
 *   Changing any single option recomputes the label: exact match -> that
 *   preset's name, anything else -> "Custom". No "preset + overrides" state
 *   exists anywhere.
 *
 * CONSTRAINTS ARE ENFORCED HERE, VISIBLY
 *   Impossible combinations grey out with a one-line reason (e.g. Folder Tab
 *   needs an attached pane) instead of failing silently later. If a change
 *   invalidates the current choice, the choice is corrected and announced
 *   with a toast — the form never stores a combination the CSS cannot draw.
 *
 * Styling is deliberately calmer than stock Frappe forms: hairline borders,
 * flat cards, one accent outline for the selected option.
 */

/* global frappe, __ */

frappe.ui.form.on("Theme Settings", {
	refresh(frm) {
		bnd_render_layout_picker(frm);
		bnd_render_sidebar_picker(frm);
		bnd_render_crumbs_picker(frm);
		bnd_render_palette_picker(frm);
		bnd_render_inbox_picker(frm);
		bnd_render_search_picker(frm);
		bnd_render_status_picker(frm);
		// Re-apply the FORM's values to the desk on every refresh: after a
		// reload/discard this reverts any live preview to the stored state
		// (on first open it re-applies what boot already applied — harmless).
		setTimeout(() => {
			bnd_sb_preview(frm);
			bnd_crumb_preview(frm);
			bnd_palette_preview(frm);
			bnd_inbox_preview(frm);
		}, 300);
	},
	desk_layout(frm) {
		bnd_render_layout_picker(frm);
		// The search picker's availability notes read the layout, so they go
		// stale the moment it changes — "Not available" must never linger on
		// a slot the new layout actually offers.
		bnd_render_search_picker(frm);
	},
});

// ════════════════════════════════════════════════════════════════════════════
// Desk Layout picker (item 9) — unchanged behaviour.
// ════════════════════════════════════════════════════════════════════════════

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
 * (Re)render the desk-layout cards and highlight the current choice.
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

	const toolbar =
		'<div class="bnd-sbp-toolbar">' +
		'<input type="search" class="bnd-sbp-search" placeholder="' + __("Search settings…") + '">' +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-export">' + __("Export") + "</button>" +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-import">' + __("Import") + "</button>" +
		'<span class="bnd-sbp-hint">' + __("Changes preview instantly — Save to keep them.") + "</span>" +
		"</div>";

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

// ════════════════════════════════════════════════════════════════════════════
// Sidebar Style picker (item 10)
// ════════════════════════════════════════════════════════════════════════════

/** The preset catalogue, fetched once per form session from the server. */
let bnd_sb_catalogue = null;

/** Mini pane-glyph helper: a rounded block, used across many thumbnails. */
function bnd_sb_pane(bg, extra) {
	return (
		'<span style="position:absolute;inset-block:5px;inset-inline-start:5px;inline-size:22px;' +
		"border-radius:5px;background:" + bg + ";" + (extra || "") + '"></span>'
	);
}

/**
 * The option groups: field, title, one-line description, and per-value
 * thumbnails. Values must equal the Select options in theme_settings.json.
 * `disabled(frm)` returns a reason string when a value is not currently
 * legal; the card greys out and shows it.
 */
const BND_SB_GROUPS = [
	{
		field: "sidebar_placement",
		title: () => __("Pane placement"),
		desc: () => __("How the sidebar sits against the page."),
		options: [
			{ value: "Attached", name: () => __("Attached"), thumb: '<span style="position:absolute;inset-block:0;inset-inline-start:0;inline-size:24px;background:currentColor;opacity:.18"></span>' },
			{ value: "Floating", name: () => __("Floating card"), thumb: bnd_sb_pane("currentColor", "opacity:.18") },
		],
	},
	{
		field: "sidebar_material",
		title: () => __("Pane material"),
		desc: () => __("Glass lets the page glow through; opacity and blur below tune it."),
		options: [
			{ value: "Solid", name: () => __("Solid"), thumb: bnd_sb_pane("currentColor", "opacity:.3") },
			{ value: "Glass", name: () => __("Glass"), thumb: bnd_sb_pane("currentColor", "opacity:.12;outline:1px solid currentColor;outline-offset:-1px") },
		],
	},
	{
		field: "sidebar_color",
		title: () => __("Pane color"),
		desc: () => __("The sidebar's own color world — independent of light or dark mode."),
		options: [
			{ value: "Match Theme", name: () => __("Match theme"), thumb: bnd_sb_pane("#dfeae1") },
			{ value: "Minimal", name: () => __("Minimal"), thumb: bnd_sb_pane("#f2f2f0", "outline:1px solid rgba(0,0,0,.08);outline-offset:-1px") },
			{ value: "Dark Contrast", name: () => __("Dark contrast"), thumb: bnd_sb_pane("#16211b") },
			{ value: "Brand", name: () => __("Brand"), thumb: bnd_sb_pane("var(--primary, #4d8756)") },
		],
	},
	{
		field: "sidebar_icon_style",
		title: () => __("Icon style"),
		desc: () => __("How link icons are drawn."),
		options: [
			{ value: "Colored Chips", name: () => __("Colored chips"), thumb: '<span class="bnd-sbp-ic" style="background:#d9eadc;color:#2e6b44">▤</span><span class="bnd-sbp-ic" style="background:#dbe7fb;color:#2f5cc4">◉</span>' },
			{ value: "Colored Dots", name: () => __("Colored dots"), thumb: '<span class="bnd-sbp-ic" style="background:#d9eadc;color:#2e6b44;border-radius:50%">▤</span><span class="bnd-sbp-ic" style="background:#dbe7fb;color:#2f5cc4;border-radius:50%">◉</span>' },
			{ value: "Filled Color", name: () => __("Filled color"), thumb: '<span class="bnd-sbp-ic" style="color:#2e6b44">▮</span><span class="bnd-sbp-ic" style="color:#2f5cc4">●</span>' },
			{ value: "Duotone", name: () => __("Duotone"), thumb: '<span class="bnd-sbp-ic" style="color:var(--primary,#4d8756)">◪</span><span class="bnd-sbp-ic" style="color:var(--primary,#4d8756);opacity:.5">◪</span>' },
			{ value: "Brand Lines", name: () => __("Brand lines"), thumb: '<span class="bnd-sbp-ic" style="color:var(--primary,#4d8756)">▢</span><span class="bnd-sbp-ic" style="color:var(--primary,#4d8756)">○</span>' },
			{ value: "Monochrome", name: () => __("Monochrome"), thumb: '<span class="bnd-sbp-ic" style="color:var(--text-muted)">▢</span><span class="bnd-sbp-ic" style="color:var(--text-muted)">○</span>' },
		],
	},
	{
		field: "sidebar_icon_source",
		title: () => __("Icon source"),
		desc: () => __("Where link glyphs come from - most workspace links ship no icon of their own."),
		options: [
			{ value: "Smart", name: () => __("Smart"), thumb: '<span class="bnd-sbp-glyph">▤ + A</span>' },
			{ value: "Original", name: () => __("Original"), thumb: '<span class="bnd-sbp-glyph">▢</span>' },
			{ value: "Letters", name: () => __("Letters"), thumb: '<span class="bnd-sbp-glyph" style="color:var(--primary,#4d8756);font-weight:600">A B C</span>' },
		],
	},
	{
		field: "sidebar_active_style",
		title: () => __("Active link"),
		desc: () => __("How the current page is marked."),
		options: [
			{ value: "Solid Pill", name: () => __("Solid pill"), thumb: '<span class="bnd-sbp-row" style="background:var(--primary,#4d8756);color:#fff"></span>' },
			{ value: "Soft Pill", name: () => __("Soft pill"), thumb: '<span class="bnd-sbp-row" style="background:color-mix(in srgb, var(--primary,#4d8756) 18%, transparent)"></span>' },
			{ value: "Accent Rail", name: () => __("Accent rail"), thumb: '<span class="bnd-sbp-row" style="border-inline-start:3px solid var(--primary,#4d8756);border-radius:0;background:color-mix(in srgb, var(--primary,#4d8756) 8%, transparent)"></span>' },
			{ value: "Glow Ring", name: () => __("Glow ring"), thumb: '<span class="bnd-sbp-row" style="outline:2px solid color-mix(in srgb, var(--primary,#4d8756) 55%, transparent);outline-offset:1px"></span>' },
			{ value: "Outline", name: () => __("Outline"), thumb: '<span class="bnd-sbp-row" style="box-shadow:inset 0 0 0 1.5px var(--primary,#4d8756)"></span>' },
			{ value: "Dot Marker", name: () => __("Dot marker"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span><span style="position:absolute;inset-inline-end:14px;inset-block-start:50%;translate:0 -50%;inline-size:6px;block-size:6px;border-radius:50%;background:var(--primary,#4d8756)"></span>' },
			{
				value: "Folder Tab",
				name: () => __("Folder tab"),
				thumb: '<span style="position:absolute;inset-block:0;inset-inline-start:0;inline-size:22px;background:currentColor;opacity:.15"></span><span class="bnd-sbp-row" style="inset-inline-start:12px;background:var(--control-bg);border-radius:8px 0 0 8px"></span>',
				disabled: (frm) =>
					frm.doc.sidebar_placement === "Floating" ? __("Needs an attached pane") : "",
			},
		],
	},
	{
		field: "sidebar_section_layout",
		title: () => __("Sections"),
		desc: () => __("How the pane's link groups are presented."),
		options: [
			{ value: "Plain", name: () => __("Plain"), thumb: '<span class="bnd-sbp-lines"></span>' },
			{ value: "Divided", name: () => __("Divided"), thumb: '<span class="bnd-sbp-lines" style="border-block-start:1px solid currentColor;opacity:.6"></span>' },
			{ value: "Mini-Cards", name: () => __("Mini-cards"), thumb: '<span class="bnd-sbp-card"></span>' },
			{ value: "Accordion Cards", name: () => __("Accordion cards"), thumb: '<span class="bnd-sbp-card" style="block-size:12px"></span><span class="bnd-sbp-card" style="block-size:12px;inset-block-start:26px;opacity:.55"></span>' },
		],
	},
	{
		field: "sidebar_hue_wash",
		title: () => __("Hue wash"),
		desc: () => __("Each section keeps its own color family; actives take the section hue."),
		options: [
			{ value: "Off", name: () => __("Off"), thumb: '<span class="bnd-sbp-wash" style="background:var(--control-bg)"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:var(--control-bg)"></span>' },
			{ value: "Subtle", name: () => __("Subtle"), thumb: '<span class="bnd-sbp-wash" style="background:#f5f8fd"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:#fdf9f1"></span>' },
			{ value: "Rich", name: () => __("Rich"), thumb: '<span class="bnd-sbp-wash" style="background:#e8f0fc"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:#faf0dc"></span>' },
		],
	},
	{
		field: "sidebar_quick_links",
		title: () => __("Home & All Apps"),
		desc: () => __("Where the two quick links live."),
		options: [
			{ value: "Sidebar Top", name: () => __("Sidebar top"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-start:7px;inset-inline-start:8px"></span><span class="bnd-sbp-btnmark" style="inset-block-start:7px;inset-inline-start:19px"></span>' },
			{ value: "Sidebar Bottom", name: () => __("Sidebar bottom"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-end:6px;inset-inline-start:8px"></span><span class="bnd-sbp-btnmark" style="inset-block-end:6px;inset-inline-start:19px"></span>' },
			{ value: "Top Bar", name: () => __("Top bar"), thumb: '<span style="position:absolute;inset-inline:4px;inset-block-start:4px;block-size:9px;border-radius:3px;background:currentColor;opacity:.14"></span><span class="bnd-sbp-btnmark" style="inset-block-start:4px;inset-inline-start:8px"></span>' },
			{ value: "Bottom Bar", name: () => __("Bottom bar"), thumb: '<span style="position:absolute;inset-inline:4px;inset-block-end:4px;block-size:9px;border-radius:3px;background:currentColor;opacity:.14"></span><span class="bnd-sbp-btnmark" style="inset-block-end:4px;inset-inline-start:8px"></span>' },
		],
	},
	{
		field: "sidebar_menu_rail",
		title: () => __("Menu rail"),
		desc: () => __("How your sidebar rests. Separate from the apps rail below."),
		options: [
			{ value: "Always Expanded", name: () => __("Always expanded"), thumb: bnd_sb_pane("currentColor", "opacity:.18") },
			{ value: "Manual Collapse", name: () => __("Manual collapse"), thumb: bnd_sb_pane("currentColor", "opacity:.18") + '<span style="position:absolute;inset-block-start:18px;inset-inline-start:32px;font-size:10px;opacity:.5">⟨</span>' },
			{ value: "Rail", name: () => __("Rail"), thumb: '<span style="position:absolute;inset-block:5px;inset-inline-start:5px;inline-size:8px;border-radius:3px;background:currentColor;opacity:.45"></span><span style="position:absolute;inset-block:5px;inset-inline-start:5px;inline-size:24px;border-radius:5px;background:currentColor;opacity:.12"></span>' },
		],
	},
	{
		field: "sidebar_rail_trigger",
		title: () => __("Rail expand trigger"),
		desc: () => __("How the rail opens. Applies when Menu rail is set to Rail."),
		options: [
			{ value: "Hover", name: () => __("Hover"), thumb: '<span class="bnd-sbp-glyph">⇢</span>' },
			{ value: "Click", name: () => __("Click"), thumb: '<span class="bnd-sbp-glyph">☉</span>' },
			{ value: "Button Only", name: () => __("Button only"), thumb: '<span class="bnd-sbp-glyph">◎</span>' },
			{ value: "Hover + Pin", name: () => __("Hover + pin"), thumb: '<span class="bnd-sbp-glyph">⌖</span>' },
		],
	},
	{
		field: "sidebar_rail_button",
		title: () => __("Rail expand button"),
		desc: () => __("An always-visible expand/collapse control on the rail."),
		options: [
			{ value: "None", name: () => __("None"), thumb: bnd_sb_pane("currentColor", "opacity:.14") },
			{ value: "Edge", name: () => __("Edge"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-start:50%;inset-inline-start:24px;translate:0 -50%"></span>' },
			{ value: "Top", name: () => __("Top"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-start:8px;inset-inline-start:20px"></span>' },
			{ value: "Bottom", name: () => __("Bottom"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-end:6px;inset-inline-start:12px"></span>' },
		],
	},
	{
		field: "sidebar_rail_button_shape",
		title: () => __("Rail button shape"),
		options: [
			{ value: "Circle", name: () => __("Circle"), thumb: '<span class="bnd-sbp-shape" style="border-radius:50%"></span>' },
			{ value: "Square", name: () => __("Square"), thumb: '<span class="bnd-sbp-shape" style="border-radius:4px"></span>' },
			{ value: "Tab", name: () => __("Tab"), thumb: '<span class="bnd-sbp-shape" style="inline-size:9px;block-size:26px;border-radius:0 5px 5px 0;border-inline-start:none"></span>' },
		],
	},
	{
		field: "sidebar_rail_button_icon",
		title: () => __("Rail button icon"),
		options: [
			{ value: "Chevron", name: () => __("Chevron"), thumb: '<span class="bnd-sbp-glyph">›</span>' },
			{ value: "Menu", name: () => __("Menu"), thumb: '<span class="bnd-sbp-glyph">☰</span>' },
			{ value: "Arrows", name: () => __("Arrows"), thumb: '<span class="bnd-sbp-glyph">⇄</span>' },
		],
	},
	{
		field: "sidebar_badges",
		title: () => __("Count badges"),
		desc: () => __("Live record indicators on links."),
		options: [
			{ value: "Off", name: () => __("Off"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span>' },
			{ value: "Dots", name: () => __("Dots"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span><span style="position:absolute;inset-inline-end:14px;inset-block-start:50%;translate:0 -50%;inline-size:6px;block-size:6px;border-radius:50%;background:#E24B4A"></span>' },
			{ value: "Counts", name: () => __("Counts"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span><span style="position:absolute;inset-inline-end:10px;inset-block-start:50%;translate:0 -50%;font-size:9px;background:color-mix(in srgb, var(--primary,#4d8756) 18%, transparent);color:var(--primary,#4d8756);border-radius:8px;padding-inline:5px">12</span>' },
		],
	},
];

/** Stepped 1..5 controls: field + endpoint labels. */
const BND_SB_STEPPERS = [
	{ field: "sidebar_glass_opacity", title: () => __("Glass opacity"), lo: () => __("Airy"), hi: () => __("Dense") },
	{ field: "sidebar_surface_intensity", title: () => __("Surface intensity"), lo: () => __("Hairline"), hi: () => __("Elevated") },
	{ field: "sidebar_pane_width", title: () => __("Pane width"), lo: () => __("200px"), hi: () => __("280px") },
];

/** Toggle rows: field + name + one-liner. */
const BND_SB_TOGGLES = [
	{ field: "sidebar_apps_rail", name: () => __("Apps rail"), desc: () => __("A separate slim strip of every app for one-click switching.") },
	{ field: "sidebar_remember_sections", name: () => __("Remember sections"), desc: () => __("Keep each user's opened groups between visits.") },
	{ field: "sidebar_scroll_fades", name: () => __("Scroll fades"), desc: () => __("Overflowing links fade at the edges instead of clipping.") },
];

/** Fetch the preset catalogue once, then render. */
function bnd_render_sidebar_picker(frm) {
	const field = frm.get_field("sidebar_picker");
	if (!field || !field.$wrapper) return;
	if (bnd_sb_catalogue) {
		bnd_render_sidebar_picker_now(frm);
		return;
	}
	frappe
		.xcall("bunood_theme.api.get_sidebar_presets")
		.then((data) => {
			bnd_sb_catalogue = data;
			bnd_render_sidebar_picker_now(frm);
		})
		.catch(() => {
			field.$wrapper.html('<div class="text-muted">' + __("Could not load sidebar presets.") + "</div>");
		});
}

/** Which preset (if any) exactly matches the form's current field values? */
function bnd_sb_match_preset(frm) {
	const { presets, fields } = bnd_sb_catalogue;
	for (const [name, values] of Object.entries(presets)) {
		const hit = fields.every(
			(f) => bnd_sb_norm(f, frm.doc[f]) === bnd_sb_norm(f, values[f])
		);
		if (hit) return name;
	}
	return "Custom";
}

/**
 * Normalise legacy stored values so old sites keep matching presets and the
 * picker highlights the right card: the pre-split rail labels both mean
 * "Rail" now.
 */
function bnd_sb_norm(field, value) {
	if (field === "sidebar_menu_rail" && (value === "Hover-Expand" || value === "Hover + Pin")) {
		return "Rail";
	}
	return String(value ?? "");
}

/** Preset card palette dots, hand-picked per preset for recognisability. */
const BND_SB_PRESET_DOTS = {
	"Bunood Night": ["#16211b", "#4d8756", "#5b8def", "#e8a13c"],
	"Bunood Light": ["#f7faf7", "#4d8756", "#3b6fd4", "#d98e2b"],
	"Daylight": ["#eef4ef", "#4d8756", "#3b6fd4", "#c4524a"],
	"Ink": ["#fafafa", "#2c2c2a", "#888780", "#4d8756"],
	"Carbon": ["#131714", "#5DCAA5", "#85B7EB", "#FAC775"],
	"Paper": ["#f6f3ec", "#4d8756", "#534AB7", "#BA7517"],
	"Aurora": ["#fdfefd", "#4d8756", "#378ADD", "#7F77DD"],
	"Operator": ["#ffffff", "#2c2c2a", "#4d8756", "#B4B2A9"],
};

/** One-line blurbs for the preset cards. */
const BND_SB_PRESET_BLURBS = {
	"Bunood Night": () => __("Dark glass float, hue-washed cards, hover rail. The default."),
	"Bunood Light": () => __("The same design in daylight: white glass, soft hue cards."),
	"Daylight": () => __("Attached tinted pane, chips, solid pill. The safe beauty."),
	"Ink": () => __("Minimal: mono icons, soft pill, no decoration."),
	"Carbon": () => __("Deep dark, glow actives."),
	"Paper": () => __("Warm and editorial."),
	"Aurora": () => __("Luminous light glass."),
	"Operator": () => __("Dense rows, live counts, hairline actives."),
};

/**
 * Full render of the sidebar picker. Wholesale re-render on every change —
 * state lives in the form document, never in this DOM.
 */
function bnd_render_sidebar_picker_now(frm) {
	const field = frm.get_field("sidebar_picker");
	const { presets } = bnd_sb_catalogue;
	const active_preset = bnd_sb_match_preset(frm);

	const preset_cards = Object.keys(presets)
		.map((name) => {
			const dots = (BND_SB_PRESET_DOTS[name] || [])
				.map((c) => '<span class="bnd-sbp-dot" style="background:' + c + '"></span>')
				.join("");
			const blurb = BND_SB_PRESET_BLURBS[name] ? BND_SB_PRESET_BLURBS[name]() : "";
			const on = name === active_preset ? " bnd-sbp-on" : "";
			return (
				'<button type="button" class="bnd-sbp-preset' + on + '" data-preset="' + name + '">' +
				'<span class="bnd-sbp-pname">' + __(name) + "</span>" +
				'<span class="bnd-sbp-pblurb">' + blurb + "</span>" +
				'<span class="bnd-sbp-dots">' + dots + "</span>" +
				"</button>"
			);
		})
		.join("");

	const custom_note =
		active_preset === "Custom"
			? '<div class="bnd-sbp-custom">' + __("Custom — your own combination.") + "</div>"
			: "";

	const groups = BND_SB_GROUPS.map((group) => {
		const current = bnd_sb_norm(group.field, frm.doc[group.field]);
		const cards = group.options
			.map((opt) => {
				const reason = opt.disabled ? opt.disabled(frm) : "";
				const on = bnd_sb_norm(group.field, opt.value) === current ? " bnd-sbp-on" : "";
				const dis = reason ? " bnd-sbp-dis" : "";
				return (
					'<button type="button" class="bnd-sbp-opt' + on + dis + '" data-field="' + group.field +
					'" data-value="' + opt.value + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
					'<span class="bnd-sbp-thumb">' + opt.thumb + "</span>" +
					'<span class="bnd-sbp-oname">' + opt.name() + "</span>" +
					(reason ? '<span class="bnd-sbp-reason">' + reason + "</span>" : "") +
					"</button>"
				);
			})
			.join("");
		return (
			'<div class="bnd-sbp-group" data-search="' + (group.title() + " " + group.field).toLowerCase() + '">' +
			'<div class="bnd-sbp-title">' + group.title() +
			'<button type="button" class="bnd-sbp-reset" data-field="' + group.field + '" title="' + __("Reset to preset value") + '">↺</button></div>' +
			(group.desc ? '<div class="bnd-sbp-desc">' + group.desc() + "</div>" : "") +
			'<div class="bnd-sbp-row-wrap">' + cards + "</div></div>"
		);
	}).join("");

	const steppers = BND_SB_STEPPERS.map((s) => {
		const current = parseInt(frm.doc[s.field], 10) || (s.field === "sidebar_pane_width" ? 2 : 3);
		const stops = [1, 2, 3, 4, 5]
			.map(
				(n) =>
					'<button type="button" class="bnd-sbp-stop' + (n === current ? " bnd-sbp-on" : "") +
					'" data-field="' + s.field + '" data-value="' + n + '" aria-label="' + n + '"></button>'
			)
			.join("");
		return (
			'<div class="bnd-sbp-group"><div class="bnd-sbp-title">' + s.title() + "</div>" +
			'<div class="bnd-sbp-steps"><span class="bnd-sbp-slab">' + s.lo() + "</span>" + stops +
			'<span class="bnd-sbp-slab">' + s.hi() + "</span></div></div>"
		);
	}).join("");

	const blur_group =
		'<div class="bnd-sbp-group"><div class="bnd-sbp-title">' + __("Glass blur") + "</div>" +
		'<div class="bnd-sbp-desc">' + __("Full steps down automatically on weak devices and honors the OS reduce-transparency setting.") + "</div>" +
		'<div class="bnd-sbp-row-wrap">' +
		["Off", "Soft", "Full"]
			.map(
				(v) =>
					'<button type="button" class="bnd-sbp-opt' + (frm.doc.sidebar_blur === v ? " bnd-sbp-on" : "") +
					'" data-field="sidebar_blur" data-value="' + v + '" style="inline-size:70px">' +
					'<span class="bnd-sbp-oname">' + __(v) + "</span></button>"
			)
			.join("") +
		"</div></div>";

	const toggles = BND_SB_TOGGLES.map((t) => {
		const on = !!parseInt(frm.doc[t.field], 10);
		return (
			'<button type="button" class="bnd-sbp-toggle" data-field="' + t.field + '" data-value="' + (on ? 0 : 1) + '">' +
			'<span class="bnd-sbp-knob' + (on ? " bnd-sbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-sbp-pblurb'>" + t.desc() + "</span></span>" +
			"</button>"
		);
	}).join("");

	const toolbar =
		'<div class="bnd-sbp-toolbar">' +
		'<input type="search" class="bnd-sbp-search" placeholder="' + __("Search settings…") + '">' +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-export">' + __("Export") + "</button>" +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-import">' + __("Import") + "</button>" +
		'<span class="bnd-sbp-hint">' + __("Changes preview instantly — Save to keep them.") + "</span>" +
		"</div>";

	field.$wrapper.html(
		"<style>" +
			".bnd-sbp{display:flex;flex-direction:column;gap:14px;margin-block:4px}" +
			".bnd-sbp-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
			".bnd-sbp-search{max-inline-size:220px;border:1px solid var(--border-color);border-radius:8px;padding:4px 10px;background:var(--control-bg);font-size:var(--text-sm)}" +
			".bnd-sbp-hint{font-size:var(--text-xs);color:var(--text-muted)}" +
			".bnd-sbp-reset{border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:12px;margin-inline-start:6px}" +
			".bnd-sbp-reset:hover{color:var(--primary)}" +
			".bnd-sbp-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}" +
			".bnd-sbp-preset{display:flex;flex-direction:column;gap:3px;padding:9px;border:1px solid var(--border-color);border-radius:10px;background:var(--control-bg);cursor:pointer;text-align:start}" +
			".bnd-sbp-preset:hover{border-color:var(--primary)}" +
			".bnd-sbp-pname{font-weight:600;font-size:var(--text-sm)}" +
			".bnd-sbp-pblurb{font-size:var(--text-xs);color:var(--text-muted);line-height:1.4}" +
			".bnd-sbp-dots{display:flex;gap:3px;margin-block-start:2px}" +
			".bnd-sbp-dot{inline-size:9px;block-size:9px;border-radius:50%;outline:1px solid var(--border-color);outline-offset:-1px}" +
			".bnd-sbp-custom{font-size:var(--text-sm);color:var(--text-muted)}" +
			".bnd-sbp-group{border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;background:var(--card-bg, var(--fg-color))}" +
			".bnd-sbp-title{font-weight:600;font-size:var(--text-sm)}" +
			".bnd-sbp-desc{font-size:var(--text-xs);color:var(--text-muted);margin-block-end:7px}" +
			".bnd-sbp-row-wrap{display:flex;gap:7px;flex-wrap:wrap}" +
			".bnd-sbp-opt{position:relative;inline-size:96px;padding:6px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);cursor:pointer;text-align:start}" +
			".bnd-sbp-opt:hover{border-color:var(--primary)}" +
			".bnd-sbp-on{border-color:var(--primary) !important;box-shadow:0 0 0 1px var(--primary)}" +
			".bnd-sbp-dis{opacity:.45;cursor:not-allowed}" +
			".bnd-sbp-thumb{position:relative;display:block;block-size:42px;border-radius:6px;background:var(--bg-color);overflow:hidden;color:var(--text-color)}" +
			".bnd-sbp-oname{display:block;font-size:var(--text-xs);font-weight:600;margin-block-start:4px}" +
			".bnd-sbp-reason{display:block;font-size:10px;color:var(--text-muted)}" +
			".bnd-sbp-ic{position:relative;display:inline-grid;place-items:center;inline-size:16px;block-size:16px;border-radius:5px;font-size:9px;margin:12px 2px 0 6px}" +
			".bnd-sbp-row{position:absolute;inset-inline:8px;inset-block-start:13px;block-size:16px;border-radius:8px}" +
			".bnd-sbp-lines{position:absolute;inset-inline:8px;inset-block-start:10px;block-size:6px;border-radius:3px;background:currentColor;opacity:.15;box-shadow:0 10px 0 currentColor,0 20px 0 currentColor}" +
			".bnd-sbp-card{position:absolute;inset-inline:7px;inset-block-start:7px;block-size:28px;border-radius:5px;background:var(--control-bg);border:1px solid var(--border-color)}" +
			".bnd-sbp-wash{position:absolute;inset-inline:7px;inset-block-start:6px;block-size:16px;border-radius:5px}" +
			".bnd-sbp-glyph{position:absolute;inset-block-start:12px;inset-inline-start:10px;font-size:12px;opacity:.75}" +
			".bnd-sbp-btnmark{position:absolute;inline-size:10px;block-size:10px;border-radius:50%;background:var(--control-bg);border:1px solid currentColor;opacity:.7}" +
			".bnd-sbp-shape{position:absolute;inset-block-start:12px;inset-inline-start:38px;inline-size:16px;block-size:16px;border:1.5px solid currentColor;opacity:.6}" +
			".bnd-sbp-steps{display:flex;align-items:center;gap:8px}" +
			".bnd-sbp-slab{font-size:var(--text-xs);color:var(--text-muted)}" +
			".bnd-sbp-stop{inline-size:13px;block-size:13px;border-radius:50%;border:none;background:var(--border-color);cursor:pointer;padding:0}" +
			".bnd-sbp-stop.bnd-sbp-on{background:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)}" +
			".bnd-sbp-toggle{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);cursor:pointer;text-align:start;inline-size:100%}" +
			".bnd-sbp-toggle b{font-size:var(--text-sm)}" +
			".bnd-sbp-knob{position:relative;inline-size:30px;block-size:17px;border-radius:99px;background:var(--border-color);flex:none;transition:background .15s}" +
			".bnd-sbp-knob::after{content:'';position:absolute;inset-block-start:2px;inset-inline-start:2px;inline-size:13px;block-size:13px;border-radius:50%;background:#fff;transition:inset-inline-start .15s}" +
			".bnd-sbp-knob-on{background:var(--primary)}" +
			".bnd-sbp-knob-on::after{inset-inline-start:15px}" +
			"</style>" +
			'<div class="bnd-sbp">' + toolbar +
			'<div class="bnd-sbp-presets">' + preset_cards + "</div>" + custom_note +
			groups + blur_group + steppers +
			'<div class="bnd-sbp-group"><div class="bnd-sbp-title">' + __("Extras") + '</div><div style="display:flex;flex-direction:column;gap:6px;margin-block-start:7px">' + toggles + "</div></div>" +
			"</div>"
	);

	// One delegated pass wires everything; re-render happens on any change.
	field.$wrapper.find(".bnd-sbp-preset").on("click", function () {
		bnd_sb_apply_preset(frm, this.getAttribute("data-preset"));
	});
	field.$wrapper.find(".bnd-sbp-opt, .bnd-sbp-stop, .bnd-sbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_sb_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-sbp-export").on("click", () => bnd_sb_export(frm));
	field.$wrapper.find(".bnd-sbp-import").on("click", () => bnd_sb_import(frm));
	field.$wrapper.find(".bnd-sbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		const base = bnd_sb_match_preset(frm);
		const source = bnd_sb_catalogue.presets[base] || bnd_sb_catalogue.presets[bnd_sb_catalogue.default];
		bnd_sb_set(frm, f, source[f]);
	});
	field.$wrapper.find(".bnd-sbp-search").on("input", function () {
		const q = this.value.trim().toLowerCase();
		field.$wrapper.find(".bnd-sbp-group").each(function () {
			this.style.display = !q || (this.getAttribute("data-search") || "").includes(q) || this.textContent.toLowerCase().includes(q) ? "" : "none";
		});
	});
}

/**
 * LIVE PREVIEW: hand the form's current sidebar values to the desk engine —
 * the chrome around this very form restyles instantly. Saving makes it
 * permanent for everyone; leaving without saving reverts on next load.
 */
function bnd_sb_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.sb_apply || !bnd_sb_catalogue) return;
	const values = {};
	for (const f of bnd_sb_catalogue.fields) values[f] = frm.doc[f];
	values.sidebar_menu_rail = bnd_sb_norm("sidebar_menu_rail", values.sidebar_menu_rail);
	window.bunood_theme.sb_apply(values);
}

/** Apply a preset: write every field, then relabel, preview and re-render. */
function bnd_sb_apply_preset(frm, name) {
	const values = bnd_sb_catalogue.presets[name];
	if (!values) return;
	for (const [field, value] of Object.entries(values)) frm.set_value(field, value);
	frm.set_value("sidebar_preset", name);
	bnd_sb_preview(frm);
	bnd_render_sidebar_picker_now(frm);
}

/**
 * Set one option, keep the state legal, relabel the preset, re-render.
 * The one cross-field rule: leaving an attached pane while Folder Tab is
 * the active style silently falls back to Solid Pill, with a toast.
 */
function bnd_sb_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	if (
		fieldname === "sidebar_placement" &&
		value === "Floating" &&
		frm.doc.sidebar_active_style === "Folder Tab"
	) {
		frm.set_value("sidebar_active_style", "Solid Pill");
		frappe.show_alert({
			message: __("Folder Tab needs an attached pane — active link set to Solid Pill."),
			indicator: "orange",
		});
	}
	frm.set_value("sidebar_preset", bnd_sb_match_preset(frm));
	bnd_sb_preview(frm);
	bnd_render_sidebar_picker_now(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Breadcrumbs picker (item 11)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Client mirror of presets.CRUMB_FIELDS — keep in sync with
 * theme_settings.json and bunood_theme/presets.py. Hardcoded (no API round
 * trip) because unlike the sidebar there is no server-side preset catalogue
 * to fetch: the style IS the choice.
 */
const BND_CRUMB_FIELDS = [
	"crumb_style", "crumb_separator", "crumb_icons", "crumb_hover",
	"crumb_copy_link", "crumb_status_pill", "crumb_narrow_collapse",
];

/** Shipped defaults, for the per-group reset. Mirrors presets.CRUMB_DEFAULTS. */
const BND_CRUMB_DEFAULTS = {
	crumb_style: "Quiet Trail",
	crumb_separator: "Chevron",
	crumb_icons: "First Crumb",
	crumb_hover: "Soft Pill",
	crumb_copy_link: 1,
	crumb_status_pill: 0,
	crumb_narrow_collapse: 0,
};

/**
 * The five styles: stored value, blurb, and a 120x36 trail thumbnail.
 * Abstract shapes, same drawing language as the layout picker.
 */
const BND_CRUMB_STYLES = [
	{
		value: "Quiet Trail",
		blurb: () => __("Muted small ancestors, strong last crumb. Typography does the wayfinding."),
		svg:
			'<svg viewBox="0 0 120 36">' +
			'<circle cx="10" cy="18" r="4" fill="currentColor" opacity=".3"/>' +
			'<rect x="20" y="14" width="8" height="8" rx="2.5" fill="var(--primary, #4d8756)" opacity=".35"/>' +
			'<rect x="31" y="16" width="18" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<path d="M54 14l3 4-3 4" stroke="currentColor" fill="none" opacity=".3"/>' +
			'<rect x="61" y="16" width="14" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<path d="M80 14l3 4-3 4" stroke="currentColor" fill="none" opacity=".3"/>' +
			'<rect x="87" y="15" width="26" height="6" rx="3" fill="currentColor" opacity=".75"/>' +
			"</svg>",
	},
	{
		value: "Title Fusion",
		blurb: () => __("The last crumb IS the page title — one row, maximum vertical economy."),
		svg:
			'<svg viewBox="0 0 120 36">' +
			'<circle cx="10" cy="18" r="4" fill="currentColor" opacity=".3"/>' +
			'<rect x="20" y="16" width="14" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="38" y="16" width="3" height="4" rx="1.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="45" y="16" width="14" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="63" y="16" width="3" height="4" rx="1.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="70" y="12" width="40" height="11" rx="4" fill="currentColor" opacity=".75"/>' +
			"</svg>",
	},
	{
		value: "Eyebrow Title",
		blurb: () => __("Small trail line above a large title. Long names wrap without deforming the trail."),
		svg:
			'<svg viewBox="0 0 120 36">' +
			'<circle cx="10" cy="10" r="3" fill="currentColor" opacity=".3"/>' +
			'<rect x="18" y="8" width="14" height="3.5" rx="1.75" fill="currentColor" opacity=".3"/>' +
			'<path d="M37 7l2.5 3-2.5 3" stroke="currentColor" fill="none" opacity=".3"/>' +
			'<rect x="44" y="8" width="14" height="3.5" rx="1.75" fill="currentColor" opacity=".3"/>' +
			'<rect x="6" y="19" width="58" height="11" rx="4" fill="currentColor" opacity=".75"/>' +
			"</svg>",
	},
	{
		value: "Crumb Pills",
		blurb: () => __("Every crumb is a soft pill; the current page is the filled one."),
		svg:
			'<svg viewBox="0 0 120 36">' +
			'<rect x="4" y="12" width="16" height="12" rx="6" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<circle cx="12" cy="18" r="3" fill="currentColor" opacity=".35"/>' +
			'<rect x="24" y="12" width="26" height="12" rx="6" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="54" y="12" width="24" height="12" rx="6" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="82" y="12" width="32" height="12" rx="6" fill="var(--primary, #4d8756)" opacity=".4"/>' +
			"</svg>",
	},
	{
		value: "Original",
		blurb: () => __("ERPNext's stock trail, completely untouched."),
		svg:
			'<svg viewBox="0 0 120 36">' +
			'<circle cx="10" cy="18" r="4" fill="currentColor" opacity=".3"/>' +
			'<rect x="20" y="15" width="3" height="6" rx="1" fill="currentColor" opacity=".25" transform="rotate(15 21 18)"/>' +
			'<rect x="29" y="15" width="20" height="5" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="53" y="15" width="3" height="6" rx="1" fill="currentColor" opacity=".25" transform="rotate(15 54 18)"/>' +
			'<rect x="62" y="15" width="20" height="5" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="86" y="15" width="3" height="6" rx="1" fill="currentColor" opacity=".25" transform="rotate(15 87 18)"/>' +
			'<rect x="95" y="15" width="20" height="5" rx="2" fill="currentColor" opacity=".55"/>' +
			"</svg>",
	},
];

/**
 * The extras groups. `disabled(frm)` marks options the current style makes
 * moot — greyed with the reason, never silently ignored.
 */
const BND_CRUMB_GROUPS = [
	{
		field: "crumb_separator",
		title: () => __("Separator"),
		desc: () => __("Chevron and arrow mirror automatically in right-to-left languages."),
		options: [
			{ value: "Chevron", name: () => __("Chevron"), glyph: "›" },
			{ value: "Slash", name: () => __("Slash"), glyph: "/" },
			{ value: "Dot", name: () => __("Dot"), glyph: "·" },
			{ value: "Arrow", name: () => __("Arrow"), glyph: "→" },
		],
		disabled: (frm) =>
			frm.doc.crumb_style === "Crumb Pills" ? __("Pills draw no separators") : "",
	},
	{
		field: "crumb_icons",
		title: () => __("Module icons"),
		desc: () => __("The workspace's own icon as a small chip in the trail."),
		options: [
			{ value: "First Crumb", name: () => __("First crumb"), glyph: "▣ a › b" },
			{ value: "Every Crumb", name: () => __("Every crumb"), glyph: "▣ a › ▣ b" },
			{ value: "Off", name: () => __("Off"), glyph: "a › b" },
		],
	},
	{
		field: "crumb_hover",
		title: () => __("Hover"),
		desc: () => __("How ancestor crumbs react to the pointer."),
		options: [
			{
				value: "Soft Pill",
				name: () => __("Soft pill"),
				glyph: "▢",
				disabled: (frm) =>
					frm.doc.crumb_style === "Crumb Pills" ? __("Pills have their own hover") : "",
			},
			{ value: "Underline", name: () => __("Underline"), glyph: "a̲" },
			{ value: "Darken", name: () => __("Darken"), glyph: "a" },
		],
	},
];

/** Toggle rows: field + name + one-liner. */
const BND_CRUMB_TOGGLES = [
	{ field: "crumb_copy_link", name: () => __("Copy link"), desc: () => __("A copy button appears on the last crumb when the title row is hovered.") },
	{ field: "crumb_status_pill", name: () => __("Status in the trail row"), desc: () => __("Pushes the document's Draft / Submitted pill to the row's end and calms its shape.") },
	{ field: "crumb_narrow_collapse", name: () => __("Back crumb on small screens"), desc: () => __("Under tablet width the trail becomes a single labeled link to the parent.") },
];

/**
 * Full render of the breadcrumbs picker. Wholesale re-render on every
 * change — state lives in the form document, never in this DOM. Carries
 * its own stylesheet (prefixed bnd-cbp-) so it renders correctly even if
 * the sidebar picker's fetch failed.
 */
function bnd_render_crumbs_picker(frm) {
	const field = frm.get_field("crumbs_picker");
	if (!field || !field.$wrapper) return;

	const current_style = frm.doc.crumb_style || "Quiet Trail";
	const kit_down = current_style === "Original";

	const style_cards = BND_CRUMB_STYLES.map((s) => {
		const on = s.value === current_style ? " bnd-cbp-on" : "";
		return (
			'<button type="button" class="bnd-cbp-style' + on + '" data-value="' + s.value + '">' +
			'<span class="bnd-cbp-thumb">' + s.svg + "</span>" +
			'<span class="bnd-cbp-name">' + __(s.value) + "</span>" +
			'<span class="bnd-cbp-blurb">' + s.blurb() + "</span>" +
			"</button>"
		);
	}).join("");

	const groups = BND_CRUMB_GROUPS.map((group) => {
		const group_reason = group.disabled ? group.disabled(frm) : "";
		const cards = group.options
			.map((opt) => {
				const reason = kit_down
					? __("Original leaves the stock trail")
					: (opt.disabled ? opt.disabled(frm) : "") || group_reason;
				const on = opt.value === frm.doc[group.field] ? " bnd-cbp-on" : "";
				const dis = reason ? " bnd-cbp-dis" : "";
				return (
					'<button type="button" class="bnd-cbp-opt' + on + dis + '" data-field="' + group.field +
					'" data-value="' + opt.value + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
					'<span class="bnd-cbp-glyph">' + opt.glyph + "</span>" +
					'<span class="bnd-cbp-oname">' + opt.name() + "</span>" +
					"</button>"
				);
			})
			.join("");
		return (
			'<div class="bnd-cbp-group' + (kit_down || group_reason ? " bnd-cbp-off" : "") + '">' +
			'<div class="bnd-cbp-title">' + group.title() +
			'<button type="button" class="bnd-cbp-reset" data-field="' + group.field + '" title="' + __("Reset to default") + '">↺</button></div>' +
			'<div class="bnd-cbp-desc">' + group.desc() + "</div>" +
			'<div class="bnd-cbp-row">' + cards + "</div></div>"
		);
	}).join("");

	const toggles = BND_CRUMB_TOGGLES.map((t) => {
		const on = !!parseInt(frm.doc[t.field], 10);
		const dis = kit_down ? " bnd-cbp-dis" : "";
		return (
			'<button type="button" class="bnd-cbp-toggle' + dis + '" data-field="' + t.field + '" data-value="' + (on ? 0 : 1) + '"' +
			(kit_down ? ' title="' + __("Original leaves the stock trail") + '" disabled' : "") + ">" +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-cbp-blurb'>" + t.desc() + "</span></span>" +
			"</button>"
		);
	}).join("");

	const note = kit_down
		? '<div class="bnd-cbp-note">' + __("Original leaves ERPNext's trail untouched — the options below apply to the other styles.") + "</div>"
		: '<div class="bnd-cbp-note">' + __("Changes preview instantly — Save to keep them.") + "</div>";

	field.$wrapper.html(
		"<style>" +
			".bnd-cbp{display:flex;flex-direction:column;gap:12px;margin-block:4px}" +
			".bnd-cbp-styles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}" +
			".bnd-cbp-style{display:flex;flex-direction:column;gap:5px;padding:10px;border:1px solid var(--border-color);border-radius:10px;background:var(--control-bg);cursor:pointer;text-align:start}" +
			".bnd-cbp-style:hover{border-color:var(--primary)}" +
			".bnd-cbp-on{border-color:var(--primary) !important;box-shadow:0 0 0 1px var(--primary)}" +
			".bnd-cbp-thumb svg{display:block;inline-size:100%;block-size:auto;color:var(--text-color);background:var(--bg-color);border-radius:6px}" +
			".bnd-cbp-name{font-weight:600;font-size:var(--text-sm)}" +
			".bnd-cbp-blurb{font-size:var(--text-xs);color:var(--text-muted);line-height:1.45}" +
			".bnd-cbp-note{font-size:var(--text-xs);color:var(--text-muted)}" +
			".bnd-cbp-group{border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;background:var(--card-bg, var(--fg-color))}" +
			".bnd-cbp-off{opacity:.55}" +
			".bnd-cbp-title{font-weight:600;font-size:var(--text-sm)}" +
			".bnd-cbp-desc{font-size:var(--text-xs);color:var(--text-muted);margin-block-end:7px}" +
			".bnd-cbp-row{display:flex;gap:7px;flex-wrap:wrap}" +
			".bnd-cbp-opt{inline-size:96px;padding:6px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);cursor:pointer;text-align:center}" +
			".bnd-cbp-opt:hover{border-color:var(--primary)}" +
			".bnd-cbp-dis{opacity:.45;cursor:not-allowed}" +
			".bnd-cbp-glyph{display:block;font-size:14px;block-size:22px;line-height:22px;opacity:.8}" +
			".bnd-cbp-oname{display:block;font-size:var(--text-xs);font-weight:600;margin-block-start:2px}" +
			".bnd-cbp-reset{border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:12px;margin-inline-start:6px}" +
			".bnd-cbp-reset:hover{color:var(--primary)}" +
			".bnd-cbp-toggle{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--control-bg);cursor:pointer;text-align:start;inline-size:100%}" +
			".bnd-cbp-toggle b{font-size:var(--text-sm)}" +
			".bnd-cbp-knob{position:relative;inline-size:30px;block-size:17px;border-radius:99px;background:var(--border-color);flex:none;transition:background .15s}" +
			".bnd-cbp-knob::after{content:'';position:absolute;inset-block-start:2px;inset-inline-start:2px;inline-size:13px;block-size:13px;border-radius:50%;background:#fff;transition:inset-inline-start .15s}" +
			".bnd-cbp-knob-on{background:var(--primary)}" +
			".bnd-cbp-knob-on::after{inset-inline-start:15px}" +
			"</style>" +
			'<div class="bnd-cbp">' +
			'<div class="bnd-cbp-styles">' + style_cards + "</div>" + note + groups +
			'<div class="bnd-cbp-group"><div class="bnd-cbp-title">' + __("Extras") + '</div><div style="display:flex;flex-direction:column;gap:6px;margin-block-start:7px">' + toggles + "</div></div>" +
			"</div>"
	);

	field.$wrapper.find(".bnd-cbp-style").on("click", function () {
		bnd_crumb_set(frm, "crumb_style", this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-cbp-opt, .bnd-cbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_crumb_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_crumb_set(frm, f, BND_CRUMB_DEFAULTS[f]);
	});
}

/**
 * LIVE PREVIEW: hand the form's current crumb values to the desk engine —
 * the trail above this very form restyles instantly. Saving makes it
 * permanent for everyone; leaving without saving reverts on next load.
 */
function bnd_crumb_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.crumb_apply) return;
	const values = {};
	for (const f of BND_CRUMB_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.crumb_apply(values);
}

/** Set one crumb option, preview, re-render. */
function bnd_crumb_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_crumb_preview(frm);
	bnd_render_crumbs_picker(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Command Palette picker (item 12)
// ════════════════════════════════════════════════════════════════════════════

/** Client mirror of presets.PALETTE_FIELDS — keep in sync. */
const BND_PALETTE_FIELDS = [
	"palette_style", "palette_frecency", "palette_footer", "palette_newtab",
	"palette_fallbacks", "palette_suggest", "palette_sigils",
];

/** Shipped defaults, for the picker's reset affordances. */
const BND_PALETTE_DEFAULTS = {
	palette_style: "Bunood Palette",
	palette_frecency: 1,
	palette_footer: 1,
	palette_newtab: 1,
	palette_fallbacks: 1,
	palette_suggest: 1,
	palette_sigils: 1,
};

/**
 * The four styles: stored value, blurb, and a 120x64 thumbnail sketching
 * the palette anatomy each one produces.
 */
const BND_PALETTE_STYLES = [
	{
		value: "Bunood Palette",
		blurb: () => __("Our palette over Frappe's own search: grouped results, pinned fallbacks, per-user frecency, footer hints."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<rect x="18" y="6" width="84" height="46" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="23" y="10" width="74" height="8" rx="3" fill="currentColor" opacity=".12"/>' +
			'<rect x="24" y="22" width="18" height="3" rx="1.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="23" y="27" width="74" height="6" rx="2.5" fill="var(--primary, #4d8756)" opacity=".3"/>' +
			'<rect x="24" y="36" width="14" height="3" rx="1.5" fill="currentColor" opacity=".25"/>' +
			'<rect x="23" y="41" width="74" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="18" y="52" width="84" height="0.75" fill="currentColor" opacity=".3"/>' +
			"</svg>",
	},
	{
		value: "Palette Pro",
		blurb: () => __("The palette plus mode sigils (> actions, # documents, / reports) and record search — actual invoices by name."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<rect x="18" y="6" width="84" height="46" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="23" y="10" width="14" height="8" rx="3" fill="var(--primary, #4d8756)" opacity=".35"/>' +
			'<rect x="40" y="10" width="57" height="8" rx="3" fill="currentColor" opacity=".12"/>' +
			'<rect x="23" y="24" width="74" height="6" rx="2.5" fill="var(--primary, #4d8756)" opacity=".3"/>' +
			'<rect x="23" y="33" width="74" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="23" y="42" width="74" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="18" y="52" width="84" height="0.75" fill="currentColor" opacity=".3"/>' +
			"</svg>",
	},
	{
		value: "Refined",
		blurb: () => __("Frappe's own search modal, restyled through the theme tokens. No new behavior — the list stays flat."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<rect x="18" y="6" width="84" height="46" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="23" y="10" width="74" height="8" rx="3" fill="currentColor" opacity=".12"/>' +
			'<rect x="23" y="23" width="74" height="6" rx="2.5" fill="var(--primary, #4d8756)" opacity=".3"/>' +
			'<rect x="23" y="32" width="74" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="23" y="41" width="74" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
	{
		value: "Original",
		blurb: () => __("ERPNext's stock Ctrl+K modal, completely untouched."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<rect x="18" y="8" width="84" height="42" rx="3" fill="none" stroke="currentColor" opacity=".3"/>' +
			'<rect x="23" y="13" width="74" height="7" rx="2" fill="currentColor" opacity=".12"/>' +
			'<rect x="23" y="25" width="74" height="5" rx="2" fill="currentColor" opacity=".18"/>' +
			'<rect x="23" y="33" width="74" height="5" rx="2" fill="currentColor" opacity=".1"/>' +
			'<rect x="23" y="41" width="74" height="5" rx="2" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
];

/** Toggle rows: field, name, one-liner, and which styles they apply to. */
const BND_PALETTE_TOGGLES = [
	{ field: "palette_frecency", name: () => __("Frecency ranking"), desc: () => __("Your most-used entries rise to the top. Stored per user on the server — follows you across devices.") },
	{ field: "palette_suggest", name: () => __("Empty-state suggestions"), desc: () => __("Frequent and recent destinations appear before you type.") },
	{ field: "palette_fallbacks", name: () => __("Fallback rows"), desc: () => __("\"Search all documents\" stays pinned at the bottom — never pushed out by broad queries. Includes the calculator.") },
	{ field: "palette_footer", name: () => __("Footer hint bar"), desc: () => __("A slim keycap legend along the palette's bottom edge.") },
	{ field: "palette_newtab", name: () => __("Ctrl+Enter opens a new tab"), desc: () => __("Side-by-side documents without losing the one you came from.") },
	{ field: "palette_sigils", name: () => __("Mode sigils"), desc: () => __("A leading > # or / narrows to actions, documents, or reports."), pro_only: true },
];

/**
 * Full render of the palette picker. Wholesale re-render on every change —
 * state lives in the form document, never in this DOM. Reuses the crumbs
 * picker's stylesheet (bnd-cbp-*): both render on every refresh, and the
 * class contract is local to this file.
 */
function bnd_render_palette_picker(frm) {
	const field = frm.get_field("palette_picker");
	if (!field || !field.$wrapper) return;

	const current_style = frm.doc.palette_style || "Bunood Palette";
	const kit_down = current_style === "Original" || !parseInt(frm.doc.enable_command_palette ?? 1, 10);
	const is_pro = current_style === "Palette Pro";

	const style_cards = BND_PALETTE_STYLES.map((s) => {
		const on = s.value === current_style ? " bnd-cbp-on" : "";
		return (
			'<button type="button" class="bnd-cbp-style bnd-plp-style' + on + '" data-value="' + s.value + '">' +
			'<span class="bnd-cbp-thumb">' + s.svg + "</span>" +
			'<span class="bnd-cbp-name">' + __(s.value) + "</span>" +
			'<span class="bnd-cbp-blurb">' + s.blurb() + "</span>" +
			"</button>"
		);
	}).join("");

	const toggles = BND_PALETTE_TOGGLES.map((t) => {
		const on = !!parseInt(frm.doc[t.field], 10);
		const reason = kit_down
			? __("Original leaves the stock modal")
			: t.pro_only && !is_pro
				? __("Palette Pro only")
				: "";
		const dis = reason ? " bnd-cbp-dis" : "";
		return (
			'<button type="button" class="bnd-cbp-toggle' + dis + '" data-field="' + t.field + '" data-value="' + (on ? 0 : 1) + '"' +
			(reason ? ' title="' + reason + '" disabled' : "") + ">" +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-cbp-blurb'>" + t.desc() + "</span></span>" +
			"</button>"
		);
	}).join("");

	const note = kit_down
		? '<div class="bnd-cbp-note">' + __("Original leaves ERPNext's Ctrl+K modal untouched — the options below apply to the other styles.") + "</div>"
		: '<div class="bnd-cbp-note">' + __("Changes apply on the palette's next open — press Ctrl+K to try it.") + "</div>";

	field.$wrapper.html(
		'<div class="bnd-cbp">' +
			'<div class="bnd-cbp-styles">' + style_cards + "</div>" + note +
			'<div class="bnd-cbp-group' + (kit_down ? " bnd-cbp-off" : "") + '"><div class="bnd-cbp-title">' + __("Behaviour") + '</div>' +
			'<div style="display:flex;flex-direction:column;gap:6px;margin-block-start:7px">' + toggles + "</div>" +
			'<div style="margin-block-start:10px"><button type="button" class="btn btn-xs btn-default bnd-plp-reset-rank">' + __("Reset my ranking") + "</button>" +
			'<span class="bnd-cbp-note" style="margin-inline-start:8px">' + __("Clears what the frecency ranking has learned for your user.") + "</span></div>" +
			"</div>" +
			"</div>"
	);

	field.$wrapper.find(".bnd-plp-style").on("click", function () {
		bnd_palette_set(frm, "palette_style", this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-cbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_palette_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-plp-reset-rank").on("click", () => {
		frappe
			.xcall("bunood_theme.api.reset_palette_ranking")
			.then(() => {
				// The live desk holds its own in-memory copy of the blob —
				// clear it too, or ranking looks unchanged until a reload.
				if (window.bunood_theme && window.bunood_theme.palette_forget_usage) {
					window.bunood_theme.palette_forget_usage();
				}
				frappe.show_alert({ message: __("Ranking reset"), indicator: "green" });
			})
			.catch(() => frappe.show_alert({ message: __("Could not reset ranking"), indicator: "red" }));
	});
}

/**
 * LIVE PREVIEW: hand the form's current palette values to the desk engine.
 * The palette is built lazily, so "preview" means the next Ctrl+K opens
 * with these options; saving makes them permanent for everyone.
 */
function bnd_palette_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.palette_apply) return;
	const values = {};
	for (const f of BND_PALETTE_FIELDS) values[f] = frm.doc[f];
	if (!parseInt(frm.doc.enable_command_palette ?? 1, 10)) values.palette_style = "Original";
	window.bunood_theme.palette_apply(values);
}

/** Set one palette option, preview, re-render. */
function bnd_palette_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_palette_preview(frm);
	bnd_render_palette_picker(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Notification centre picker (item 13)
// ════════════════════════════════════════════════════════════════════════════

/** Client mirror of presets.INBOX_FIELDS — keep in sync. */
const BND_INBOX_FIELDS = [
	"inbox_style", "inbox_badge", "inbox_group", "inbox_chips",
	"inbox_row_actions", "inbox_arrival", "inbox_keyboard",
];

/** Shipped defaults, for the per-option resets. */
const BND_INBOX_DEFAULTS = {
	inbox_style: "Inbox + Page",
	inbox_badge: "Count",
	inbox_arrival: "Approvals Only",
	inbox_group: 1,
	inbox_chips: 1,
	inbox_row_actions: 1,
	inbox_keyboard: 1,
};

/** The four styles: value, blurb, and a 120x64 anatomy thumbnail. */
const BND_INBOX_STYLES = [
	{
		value: "Inbox + Page",
		blurb: () => __("The panel plus a full-page triage surface: list beside a detail pane, keyboard loop with auto-advance."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<rect x="6" y="6" width="50" height="52" rx="4" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="10" y="11" width="42" height="6" rx="2.5" fill="var(--primary, #4d8756)" opacity=".3"/>' +
			'<rect x="10" y="21" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="10" y="31" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="10" y="41" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="62" y="6" width="52" height="52" rx="4" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="67" y="12" width="30" height="5" rx="2" fill="currentColor" opacity=".35"/>' +
			'<rect x="67" y="22" width="40" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="67" y="29" width="34" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="67" y="44" width="20" height="8" rx="3" fill="var(--primary, #4d8756)" opacity=".35"/>' +
			"</svg>",
	},
	{
		value: "Bunood Inbox",
		blurb: () => __("The panel only: filter tabs, grouping by document, reason chips, hover actions, a real unread badge."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<circle cx="99" cy="9" r="4" fill="currentColor" opacity=".3"/>' +
			'<circle cx="103" cy="6" r="3" fill="var(--primary, #4d8756)"/>' +
			'<rect x="46" y="14" width="68" height="44" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="51" y="19" width="24" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="51" y="28" width="58" height="7" rx="3" fill="var(--primary, #4d8756)" opacity=".28"/>' +
			'<rect x="51" y="38" width="58" height="7" rx="3" fill="currentColor" opacity=".1"/>' +
			'<rect x="51" y="48" width="58" height="7" rx="3" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
	{
		value: "Refined",
		blurb: () => __("ERPNext's own panel and its three tabs, restyled through the theme tokens, plus the missing unread badge."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<circle cx="99" cy="9" r="4" fill="currentColor" opacity=".3"/>' +
			'<circle cx="103" cy="6" r="3" fill="var(--primary, #4d8756)"/>' +
			'<rect x="46" y="14" width="68" height="44" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="51" y="19" width="14" height="3" rx="1.5" fill="currentColor" opacity=".35"/>' +
			'<rect x="68" y="19" width="12" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="83" y="19" width="14" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="51" y="29" width="58" height="6" rx="2" fill="currentColor" opacity=".12"/>' +
			'<rect x="51" y="39" width="58" height="6" rx="2" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
	{
		value: "Original",
		blurb: () => __("ERPNext's stock notification panel, completely untouched — no badge either."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<circle cx="99" cy="9" r="4" fill="currentColor" opacity=".25"/>' +
			'<rect x="46" y="16" width="68" height="40" rx="3" fill="none" stroke="currentColor" opacity=".3"/>' +
			'<rect x="51" y="21" width="58" height="5" rx="2" fill="currentColor" opacity=".14"/>' +
			'<rect x="51" y="30" width="58" height="5" rx="2" fill="currentColor" opacity=".1"/>' +
			'<rect x="51" y="39" width="58" height="5" rx="2" fill="currentColor" opacity=".1"/>' +
			"</svg>",
	},
];

/** Select-type extras: field, title, description, options. */
const BND_INBOX_SELECTS = [
	{
		field: "inbox_badge",
		title: () => __("Bell badge"),
		desc: () => __("ERPNext renders no unread indicator at all — this one is the theme's."),
		options: [
			{ value: "Count", name: () => __("Count"), glyph: "③" },
			{ value: "Action Count", name: () => __("Action count"), glyph: "①" },
			{ value: "Dot", name: () => __("Dot"), glyph: "●" },
			{ value: "Off", name: () => __("Off"), glyph: "—" },
		],
	},
	{
		field: "inbox_arrival",
		title: () => __("When something arrives"),
		desc: () => __("An approval that blocks a document earns an interruption; a share notification does not."),
		options: [
			{ value: "Badge Only", name: () => __("Badge only"), glyph: "•" },
			{ value: "Approvals Only", name: () => __("Approvals only"), glyph: "!" },
			{ value: "All Toasts", name: () => __("Everything"), glyph: "☰" },
		],
	},
];

/** Toggle rows: field, name, one-liner. */
const BND_INBOX_TOGGLES = [
	{ field: "inbox_group", name: () => __("Group by document"), desc: () => __("One submitted invoice can fire assignment, share and workflow notifications within a minute — this collects them under the document.") },
	{ field: "inbox_chips", name: () => __("Reason chips"), desc: () => __("Label each row Approval / Mention / Share so a mixed list stays scannable.") },
	{ field: "inbox_row_actions", name: () => __("Hover row actions"), desc: () => __("Open in a new tab, or mark done, without leaving the panel.") },
	{ field: "inbox_keyboard", name: () => __("Keyboard triage"), desc: () => __("Arrows or j/k to move, Enter to open, e to mark read and advance to the next.") },
];

/**
 * Full render of the notification picker. Wholesale re-render on every
 * change — state lives in the form document. Reuses the crumbs picker's
 * stylesheet (bnd-cbp-*), like the palette picker does.
 */
function bnd_render_inbox_picker(frm) {
	const field = frm.get_field("inbox_picker");
	if (!field || !field.$wrapper) return;

	const current = frm.doc.inbox_style || "Inbox + Page";
	const kit_down = current === "Original";
	const panel_ours = current === "Bunood Inbox" || current === "Inbox + Page";

	const style_cards = BND_INBOX_STYLES.map((s) => {
		const on = s.value === current ? " bnd-cbp-on" : "";
		return (
			'<button type="button" class="bnd-cbp-style bnd-ibp-style' + on + '" data-value="' + s.value + '">' +
			'<span class="bnd-cbp-thumb">' + s.svg + "</span>" +
			'<span class="bnd-cbp-name">' + __(s.value) + "</span>" +
			'<span class="bnd-cbp-blurb">' + s.blurb() + "</span>" +
			"</button>"
		);
	}).join("");

	const selects = BND_INBOX_SELECTS.map((group) => {
		// The badge survives Refined (the theme owns it either way); the
		// arrival tiering needs our own panel to be meaningful.
		const reason =
			kit_down
				? __("Original leaves the stock panel")
				: group.field === "inbox_arrival" && !panel_ours
					? __("Needs the Bunood panel")
					: "";
		const cards = group.options
			.map((opt) => {
				const on = opt.value === frm.doc[group.field] ? " bnd-cbp-on" : "";
				const dis = reason ? " bnd-cbp-dis" : "";
				return (
					'<button type="button" class="bnd-cbp-opt' + on + dis + '" data-field="' + group.field +
					'" data-value="' + opt.value + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
					'<span class="bnd-cbp-glyph">' + opt.glyph + "</span>" +
					'<span class="bnd-cbp-oname">' + opt.name() + "</span></button>"
				);
			})
			.join("");
		return (
			'<div class="bnd-cbp-group' + (reason ? " bnd-cbp-off" : "") + '">' +
			'<div class="bnd-cbp-title">' + group.title() +
			'<button type="button" class="bnd-cbp-reset bnd-ibp-reset" data-field="' + group.field + '" title="' + __("Reset to default") + '">↺</button></div>' +
			'<div class="bnd-cbp-desc">' + group.desc() + "</div>" +
			'<div class="bnd-cbp-row">' + cards + "</div></div>"
		);
	}).join("");

	const toggles = BND_INBOX_TOGGLES.map((t) => {
		const on = !!parseInt(frm.doc[t.field], 10);
		const reason = panel_ours ? "" : kit_down ? __("Original leaves the stock panel") : __("Needs the Bunood panel");
		const dis = reason ? " bnd-cbp-dis" : "";
		return (
			'<button type="button" class="bnd-cbp-toggle bnd-ibp-toggle' + dis + '" data-field="' + t.field +
			'" data-value="' + (on ? 0 : 1) + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-cbp-blurb'>" + t.desc() + "</span></span></button>"
		);
	}).join("");

	const note = kit_down
		? '<div class="bnd-cbp-note">' + __("Original leaves ERPNext's panel untouched — including the missing unread badge.") + "</div>"
		: '<div class="bnd-cbp-note">' + __("Changes apply the next time the panel opens — click the bell to try it.") + "</div>";

	field.$wrapper.html(
		// Wider option tiles than the shared bnd-cbp-opt default: "Approvals
		// only" wrapped to two lines at 96px, pushing its glyph off the row's
		// baseline (item-13 sweep).
		"<style>.bnd-ibp .bnd-cbp-opt{inline-size:118px}</style>" +
		'<div class="bnd-cbp bnd-ibp">' +
			'<div class="bnd-cbp-styles">' + style_cards + "</div>" + note + selects +
			'<div class="bnd-cbp-group' + (panel_ours ? "" : " bnd-cbp-off") + '"><div class="bnd-cbp-title">' + __("Panel behaviour") +
			'<button type="button" class="bnd-cbp-reset bnd-ibp-reset-all" title="' + __("Reset to defaults") + '">↺</button></div>' +
			'<div style="display:flex;flex-direction:column;gap:6px;margin-block-start:7px">' + toggles + "</div></div>" +
			"</div>"
	);

	field.$wrapper.find(".bnd-ibp-style").on("click", function () {
		bnd_inbox_set(frm, "inbox_style", this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-cbp-opt, .bnd-ibp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_inbox_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-ibp-reset-all").on("click", function (e) {
		e.stopPropagation();
		for (const t of BND_INBOX_TOGGLES) frm.set_value(t.field, BND_INBOX_DEFAULTS[t.field]);
		bnd_inbox_preview(frm);
		bnd_render_inbox_picker(frm);
	});
	field.$wrapper.find(".bnd-ibp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_inbox_set(frm, f, BND_INBOX_DEFAULTS[f]);
	});
}

/** LIVE PREVIEW: hand the form's current inbox values to the desk engine. */
function bnd_inbox_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.inbox_apply) return;
	const values = {};
	for (const f of BND_INBOX_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.inbox_apply(values);
}

/** Set one inbox option, preview, re-render. */
function bnd_inbox_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_inbox_preview(frm);
	bnd_render_inbox_picker(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Search placement picker (item 14 companion) — deliberately its OWN section
// ════════════════════════════════════════════════════════════════════════════

/** Client mirror of presets.STATUS_FIELDS. Keep in sync. */
const BND_STATUS_FIELDS = [
	"search_placement", "status_style", "status_segments_jobs", "status_segments_errors",
	"status_segments_scheduler", "status_segments_connection", "status_segments_density",
	"status_clock", "status_interval", "status_freshness", "status_escalate", "status_in_classic",
];

/** Shipped defaults, for the reset chips. */
const BND_STATUS_DEFAULTS = {
	search_placement: "Top Bar Center", status_style: "Quiet", status_clock: "24 Hour",
	status_interval: "60s", status_segments_jobs: 1, status_segments_errors: 1,
	status_segments_scheduler: 1, status_segments_connection: 1, status_segments_density: 1,
	status_freshness: 1, status_escalate: 0, status_in_classic: 0,
};

/** A 120x54 thumbnail of the desk with search highlighted in one slot. */
function bnd_search_thumb(slot) {
	const on = 'fill="var(--primary, #4d8756)" opacity=".55"';
	const off = 'fill="currentColor" opacity=".12"';
	const bar = (y) => `<rect x="30" y="${y}" width="86" height="8" rx="3" ${off}/>`;
	const pill = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" ${on}/>`;
	const parts = [
		'<rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>',
		`<rect x="2" y="2" width="24" height="50" ${off}/>`,
		bar(4), bar(44),
	];
	if (slot === "Sidebar Top") parts.push(pill(5, 6, 18));
	if (slot === "Sidebar Bottom") parts.push(pill(5, 44, 18));
	if (slot === "Top Bar Edge") parts.push(pill(33, 5, 26));
	if (slot === "Top Bar Center") parts.push(pill(58, 5, 30));
	if (slot === "Bottom Bar Edge") parts.push(pill(33, 45, 26));
	if (slot === "Bottom Bar Center") parts.push(pill(58, 45, 30));
	return '<svg viewBox="0 0 120 54">' + parts.join("") + "</svg>";
}

/**
 * Can this slot exist with the settings currently on screen? Used to WARN,
 * never to block — the runtime falls back either way.
 *
 * Availability is not the layout alone, which is why this is a function and
 * not a lookup table: the bottom strip only exists while the status bar is
 * switched on (and in Classic only when it opts in), and Dock hides the
 * sidebar outright.
 */
function bnd_search_slot_blocker(frm, slot) {
	const layout = frm.doc.desk_layout || "Top Bar";
	if (slot === "Sidebar Top" || slot === "Sidebar Bottom") {
		return layout === "Dock" ? __("Dock hides the sidebar") : "";
	}
	if (slot === "Top Bar Edge" || slot === "Top Bar Center") {
		return layout === "Top Bar" ? "" : __("{0} has no top bar", [__(layout)]);
	}
	if ((frm.doc.status_style || "Quiet") === "Off") return __("the status bar is switched off");
	if (layout === "Classic" && !parseInt(frm.doc.status_in_classic, 10)) {
		return __("Classic shows no bottom bar");
	}
	return "";
}

const BND_SEARCH_SLOTS = [
	{ value: "Top Bar Center", blurb: () => __("Centred in the top bar — the modern default.") },
	{ value: "Top Bar Edge", blurb: () => __("At the start of the top bar, beside the page.") },
	{ value: "Sidebar Top", blurb: () => __("ERPNext's own search row, at the top of the sidebar.") },
	{ value: "Sidebar Bottom", blurb: () => __("The same row, pinned to the sidebar's foot.") },
	{ value: "Bottom Bar Center", blurb: () => __("Centred in the bottom strip, beside the status signals.") },
	{ value: "Bottom Bar Edge", blurb: () => __("At the start of the bottom strip.") },
];

/** Render the search-placement picker. */
function bnd_render_search_picker(frm) {
	const field = frm.get_field("search_picker");
	if (!field || !field.$wrapper) return;
	const current = frm.doc.search_placement || "Top Bar Center";

	const cards = BND_SEARCH_SLOTS.map((s) => {
		const on = s.value === current ? " bnd-cbp-on" : "";
		// Never disabled: an unavailable slot falls back at runtime, and
		// naming the actual reason is more useful than greying the choice out.
		const blocker = bnd_search_slot_blocker(frm, s.value);
		const note = blocker
			? '<span class="bnd-cbp-blurb" style="color:var(--text-muted)">' +
			  __("Not available — {0}. Falls back to the nearest slot.", [blocker]) + "</span>"
			: "";
		return (
			'<button type="button" class="bnd-cbp-style bnd-srp-slot' + on + '" data-value="' + s.value + '">' +
			'<span class="bnd-cbp-thumb">' + bnd_search_thumb(s.value) + "</span>" +
			'<span class="bnd-cbp-name">' + __(s.value) + "</span>" +
			'<span class="bnd-cbp-blurb">' + s.blurb() + "</span>" + note + "</button>"
		);
	}).join("");

	field.$wrapper.html(
		'<div class="bnd-cbp"><div class="bnd-cbp-styles">' + cards + "</div>" +
		'<div class="bnd-cbp-note">' + __("Where the search field lives, independent of the desk layout. Applies on the next page load.") + "</div></div>"
	);
	field.$wrapper.find(".bnd-srp-slot").on("click", function () {
		bnd_status_set(frm, "search_placement", this.getAttribute("data-value"));
	});
}

// ════════════════════════════════════════════════════════════════════════════
// Status bar picker (item 14)
// ════════════════════════════════════════════════════════════════════════════

const BND_STATUS_STYLES = [
	{
		value: "Quiet",
		blurb: () => __("A healthy desk shows almost nothing. A signal appears only once it needs you."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="42" width="116" height="10" fill="currentColor" opacity=".06"/>' +
			'<rect x="84" y="45" width="14" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="102" y="45" width="12" height="4" rx="2" fill="currentColor" opacity=".3"/></svg>',
	},
	{
		value: "Operator",
		blurb: () => __("Every count on screen at all times, with a freshness stamp and manual refresh."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="42" width="116" height="10" fill="currentColor" opacity=".06"/>' +
			'<circle cx="10" cy="47" r="2.5" fill="var(--primary, #4d8756)"/>' +
			'<rect x="16" y="45" width="16" height="4" rx="2" fill="currentColor" opacity=".35"/>' +
			'<rect x="36" y="45" width="14" height="4" rx="2" fill="#b42318" opacity=".55"/>' +
			'<rect x="54" y="45" width="18" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="90" y="45" width="12" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="105" y="45" width="9" height="4" rx="2" fill="currentColor" opacity=".3"/></svg>',
	},
	{
		value: "Minimal",
		blurb: () => __("Connection, density and the clock only. No server calls at all."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="42" width="116" height="10" fill="currentColor" opacity=".06"/>' +
			'<circle cx="10" cy="47" r="2.5" fill="var(--primary, #4d8756)"/>' +
			'<rect x="90" y="45" width="12" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="105" y="45" width="9" height="4" rx="2" fill="currentColor" opacity=".3"/></svg>',
	},
	{
		value: "Off",
		blurb: () => __("No status bar at all, and the page takes the space back."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="30" y="20" width="60" height="5" rx="2" fill="currentColor" opacity=".1"/></svg>',
	},
];

const BND_STATUS_SELECTS = [
	{
		field: "status_interval", title: () => __("Refresh"),
		desc: () => __("Frappe emits no live event for background jobs, so counts are polled. Longer is cheaper."),
		options: [
			{ value: "30s", name: () => __("30 seconds") }, { value: "60s", name: () => __("1 minute") },
			{ value: "5min", name: () => __("5 minutes") }, { value: "Manual", name: () => __("Manual only") },
		],
	},
	{
		field: "status_clock", title: () => __("Clock"),
		desc: () => __("Explicit, not inferred from the locale."),
		options: [
			{ value: "24 Hour", name: () => __("24 hour") }, { value: "12 Hour", name: () => __("12 hour") },
			{ value: "Off", name: () => __("Off") },
		],
	},
];

const BND_STATUS_TOGGLES = [
	{ field: "status_segments_jobs", name: () => __("Background jobs"), desc: () => __("Failed and running counts. System Managers only — nobody else is even asked about.") },
	{ field: "status_segments_errors", name: () => __("Errors"), desc: () => __("Unseen error count, using ERPNext's own permission-filtered counter.") },
	{ field: "status_segments_scheduler", name: () => __("Scheduler"), desc: () => __("Warns when the scheduler is paused — the quiet failure behind most 'why did nothing run' tickets. System Managers only.") },
	{ field: "status_segments_connection", name: () => __("Live updates"), desc: () => __("Says when the realtime connection is down. The desk still works — what stops is anything updating on its own.") },
	{ field: "status_segments_density", name: () => __("Density toggle"), desc: () => __("Click to cycle row density.") },
	{ field: "status_freshness", name: () => __("Freshness stamp"), desc: () => __("How old the counts are, and a button to refresh them now.") },
	{ field: "status_escalate", name: () => __("Recolour the bar on failure"), desc: () => __("Tints the whole strip when something has failed. Off by default — a bar that shouts gets ignored.") },
	{ field: "status_in_classic", name: () => __("Show in Classic layout"), desc: () => __("Classic mounts no bars of its own; this opts it in.") },
];

/** Render the status bar picker. */
function bnd_render_status_picker(frm) {
	const field = frm.get_field("status_picker");
	if (!field || !field.$wrapper) return;
	const current = frm.doc.status_style || "Quiet";
	const off = current === "Off";
	const minimal = current === "Minimal";

	const cards = BND_STATUS_STYLES.map((s) => {
		const on = s.value === current ? " bnd-cbp-on" : "";
		return (
			'<button type="button" class="bnd-cbp-style bnd-stp-style' + on + '" data-value="' + s.value + '">' +
			'<span class="bnd-cbp-thumb">' + s.svg + "</span>" +
			'<span class="bnd-cbp-name">' + __(s.value) + "</span>" +
			'<span class="bnd-cbp-blurb">' + s.blurb() + "</span></button>"
		);
	}).join("");

	const selects = BND_STATUS_SELECTS.map((g) => {
		// Minimal makes no server calls, so a refresh interval is moot.
		const reason = off ? __("The bar is off")
			: minimal && g.field === "status_interval" ? __("Minimal polls nothing") : "";
		const opts = g.options.map((o) => {
			const sel = o.value === frm.doc[g.field] ? " bnd-cbp-on" : "";
			const dis = reason ? " bnd-cbp-dis" : "";
			return '<button type="button" class="bnd-cbp-opt' + sel + dis + '" data-field="' + g.field +
				'" data-value="' + o.value + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
				'<span class="bnd-cbp-oname">' + o.name() + "</span></button>";
		}).join("");
		return '<div class="bnd-cbp-group' + (reason ? " bnd-cbp-off" : "") + '"><div class="bnd-cbp-title">' + g.title() +
			'<button type="button" class="bnd-cbp-reset bnd-stp-reset" data-field="' + g.field + '" title="' + __("Reset to default") + '">↺</button></div>' +
			'<div class="bnd-cbp-desc">' + g.desc() + "</div><div class=\"bnd-cbp-row\">" + opts + "</div></div>";
	}).join("");

	const toggles = BND_STATUS_TOGGLES.map((t) => {
		const on = !!parseInt(frm.doc[t.field], 10);
		const signal = ["status_segments_jobs", "status_segments_errors", "status_segments_scheduler", "status_freshness"].indexOf(t.field) !== -1;
		const reason = off ? __("The bar is off") : minimal && signal ? __("Minimal shows no live signals") : "";
		const dis = reason ? " bnd-cbp-dis" : "";
		return '<button type="button" class="bnd-cbp-toggle bnd-stp-toggle' + dis + '" data-field="' + t.field +
			'" data-value="' + (on ? 0 : 1) + '"' + (reason ? ' title="' + reason + '" disabled' : "") + ">" +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-cbp-blurb'>" + t.desc() + "</span></span></button>";
	}).join("");

	field.$wrapper.html(
		"<style>.bnd-stp .bnd-cbp-opt{inline-size:112px}</style>" +
		'<div class="bnd-cbp bnd-stp"><div class="bnd-cbp-styles">' + cards + "</div>" +
		'<div class="bnd-cbp-note">' + __("Applies on the next page load.") + "</div>" + selects +
		'<div class="bnd-cbp-group' + (off ? " bnd-cbp-off" : "") + '"><div class="bnd-cbp-title">' + __("Segments and extras") + "</div>" +
		'<div style="display:flex;flex-direction:column;gap:6px;margin-block-start:7px">' + toggles + "</div></div></div>"
	);

	field.$wrapper.find(".bnd-stp-style").on("click", function () {
		bnd_status_set(frm, "status_style", this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-cbp-opt, .bnd-stp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_status_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	field.$wrapper.find(".bnd-stp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_status_set(frm, f, BND_STATUS_DEFAULTS[f]);
	});
}

/** Set one search/status option and re-render both pickers. */
function bnd_status_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_render_search_picker(frm);
	bnd_render_status_picker(frm);
}

/**
 * Export the whole theme (desk layout, branding colors, every sidebar style
 * field, every breadcrumb field, every palette field, every notification
 * field, search placement and the status bar) as a JSON file + clipboard
 * copy — portable between tenant sites.
 */
function bnd_sb_export(frm) {
	const keys = [
		"desk_layout", "company_name", "brand_color", "accent_color",
		"brand_color_dark", "accent_color_dark", "default_density", "sidebar_preset",
	].concat(bnd_sb_catalogue.fields, BND_CRUMB_FIELDS, BND_PALETTE_FIELDS, BND_INBOX_FIELDS, BND_STATUS_FIELDS);
	const data = {};
	for (const k of keys) data[k] = frm.doc[k];
	const text = JSON.stringify({ bunood_theme: 1, ...data }, null, 2);
	if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
	const blob = new Blob([text], { type: "application/json" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "bunood-theme.json";
	a.click();
	URL.revokeObjectURL(a.href);
	frappe.show_alert({ message: __("Theme exported (downloaded and copied)"), indicator: "green" });
}

/** Import a theme JSON: validate known keys, set, preview. Save to keep. */
function bnd_sb_import(frm) {
	frappe.prompt(
		[{ fieldname: "json", fieldtype: "Small Text", label: __("Paste theme JSON"), reqd: 1 }],
		(v) => {
			let data;
			try {
				data = JSON.parse(v.json);
			} catch (e) {
				frappe.msgprint(__("That is not valid JSON."));
				return;
			}
			const known = new Set(
				["desk_layout", "company_name", "brand_color", "accent_color",
					"brand_color_dark", "accent_color_dark", "default_density", "sidebar_preset",
				].concat(bnd_sb_catalogue.fields, BND_CRUMB_FIELDS, BND_PALETTE_FIELDS, BND_INBOX_FIELDS, BND_STATUS_FIELDS)
			);
			let applied = 0;
			for (const [k, val] of Object.entries(data)) {
				if (known.has(k) && val !== undefined && val !== null) {
					frm.set_value(k, val);
					applied++;
				}
			}
			bnd_sb_preview(frm);
			bnd_crumb_preview(frm);
			bnd_palette_preview(frm);
			bnd_inbox_preview(frm);
			bnd_render_sidebar_picker_now(frm);
			bnd_render_crumbs_picker(frm);
			bnd_render_palette_picker(frm);
			bnd_render_inbox_picker(frm);
			bnd_render_search_picker(frm);
			bnd_render_status_picker(frm);
			frappe.show_alert({ message: __("Applied {0} settings — Save to keep", [applied]), indicator: "blue" });
		},
		__("Import theme"),
		__("Apply")
	);
}
