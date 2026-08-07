// Copyright (c) 2026, Bunood and contributors
// For license information, please see license.txt
/**
 * Theme Settings form script — the visual pickers.
 *
 * SEVEN PICKERS LIVE HERE
 *   Desk Layout (item 9), Sidebar Style (10), Breadcrumbs (11), Command
 *   Palette (12), Notifications (13), Search placement and Status Bar (14).
 *   Each writes hidden fields; none of them is a control the user types into.
 *
 * ONE VOCABULARY, BUILT BY `P`
 *   Every picker composes the same handful of shapes — a style card, a small
 *   option chip, a switch, a bordered group with a reset — so they are built
 *   by the `P` helpers below rather than hand-assembled seven times. Before
 *   this, the same idea was written slightly differently in each picker, and
 *   the differences were accidents rather than decisions: three spellings of
 *   the reset chip, two of the switch, cards that did and did not carry a
 *   blurb. The CSS lives in chrome/_settings.scss (it used to be three
 *   `<style>` strings in this file, where no build guard could see it).
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

// ════════════════════════════════════════════════════════════════════════════
// P — the picker vocabulary
// ════════════════════════════════════════════════════════════════════════════
//
// Small builders returning HTML strings, one per shape a picker can contain.
// They exist so a picker DECLARES what it holds instead of spelling out the
// markup, which has three payoffs: the shapes cannot drift apart, a new
// component composes rather than copies, and the classes are applied in one
// place so nothing can be styled by accident.
//
// Everything is escaped on the way in. These take translated, admin-authored
// and Frappe-supplied strings, and one of them (a preset name) reaches this
// file from the database.

/** Escape a value for interpolation into markup. */
function bnd_esc(value) {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const P = {
	/** The outer wrapper every picker sits in. */
	wrap(body) {
		return '<div class="bnd-cbp">' + body + "</div>";
	},

	/** A quiet line of explanation under a picker. */
	note(text) {
		return '<div class="bnd-cbp-note">' + bnd_esc(text) + "</div>";
	},

	/**
	 * The big choice: a grid of thumbnail cards.
	 * @param {Array<{value:string, name:string, blurb?:string, svg?:string, note?:string}>} items
	 * @param {{selected:string, cls?:string}} opts
	 */
	cards(items, opts) {
		const cls = opts.cls || "bnd-cbp-style";
		return (
			'<div class="bnd-cbp-styles">' +
			items
				.map(
					(i) =>
						'<button type="button" class="' + cls + (i.value === opts.selected ? " bnd-cbp-on" : "") +
						'" data-value="' + bnd_esc(i.value) + '">' +
						(i.svg ? '<span class="bnd-cbp-thumb">' + i.svg + "</span>" : "") +
						'<span class="bnd-cbp-name">' + bnd_esc(i.name) + "</span>" +
						(i.blurb ? '<span class="bnd-cbp-blurb">' + bnd_esc(i.blurb) + "</span>" : "") +
						(i.note
							? '<span class="bnd-cbp-blurb bnd-cbp-cardnote">' + bnd_esc(i.note) + "</span>"
							: "") +
						"</button>"
				)
				.join("") +
			"</div>"
		);
	},

	/**
	 * A row of small chips — the second-tier choice inside a group.
	 * @param {Array<{value:string|number, name:string, glyph?:string, reason?:string}>} items
	 */
	options(items, opts) {
		return (
			'<div class="bnd-cbp-row">' +
			items
				.map((i) => {
					const off = i.reason ? " bnd-cbp-dis" : "";
					const on = String(i.value) === String(opts.value) ? " bnd-cbp-on" : "";
					return (
						'<button type="button" class="bnd-cbp-opt' + on + off + '"' +
						' data-field="' + bnd_esc(opts.field) + '" data-value="' + bnd_esc(i.value) + '"' +
						(i.reason ? ' title="' + bnd_esc(i.reason) + '" disabled' : "") + ">" +
						(i.glyph ? '<span class="bnd-cbp-glyph">' + i.glyph + "</span>" : "") +
						'<span class="bnd-cbp-oname">' + bnd_esc(i.name) + "</span>" +
						"</button>"
					);
				})
				.join("") +
			"</div>"
		);
	},

	/**
	 * A switch with a name and one line of why it exists.
	 *
	 * `cls` is the picker's own hook class. Pickers bind their click handlers
	 * to it, so a primitive emitting only the shared class would leave the
	 * markup looking correct and the switch inert — a port that reads as a
	 * pure rename and quietly removes behaviour.
	 */
	toggle(t) {
		const on = !!t.on;
		return (
			'<button type="button" class="bnd-cbp-toggle' +
			(t.cls ? " " + t.cls : "") +
			(t.reason ? " bnd-cbp-dis" : "") + '"' +
			' data-field="' + bnd_esc(t.field) + '" data-value="' + (on ? 0 : 1) + '"' +
			(t.reason ? ' title="' + bnd_esc(t.reason) + '" disabled' : "") + ">" +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + bnd_esc(t.name) + "</b>" +
			(t.desc ? "<br><span class='bnd-cbp-blurb'>" + bnd_esc(t.desc) + "</span>" : "") +
			"</span></button>"
		);
	},

	/**
	 * A band of related groups, under one heading.
	 *
	 * Identity is `data-zone`; the class is for styling. Same rule the desk
	 * follows with `data-bnd-part` — a test that finds a band by class finds
	 * whatever else carries that class next month.
	 */
	zone(z) {
		return (
			'<section class="bnd-cbp-zone" data-zone="' + bnd_esc(z.key) + '">' +
			(z.title ? '<h4 class="bnd-cbp-zone-title">' + bnd_esc(z.title) + "</h4>" : "") +
			z.body +
			"</section>"
		);
	},

	/**
	 * A bordered group: title, optional reset chip, one line of description,
	 * then whatever it contains.
	 */
	group(g) {
		// `resetCls` exists because a group's reset is not always the same
		// verb. The notifications picker has two: a per-group chip carrying
		// `data-field`, and a reset-ALL for a whole section with no field at
		// all. They are told apart by class, and a primitive that emitted only
		// the first would silently unbind the second — the port would look
		// right and the button would quietly stop working.
		const chip =
			g.field || g.resetCls
				? '<button type="button" class="bnd-cbp-reset' +
				  (g.resetCls ? " " + g.resetCls : "") +
				  '"' +
				  (g.field ? ' data-field="' + bnd_esc(g.field) + '"' : "") +
				  ' title="' + bnd_esc(g.resetTitle || __("Reset to default")) + '">↺</button>'
				: "";
		// `cls` and `search` exist for the sidebar picker, whose group is this
		// group plus one responsibility: its filter box hides groups by
		// matching `data-search`. Shell, title, description and reset are
		// otherwise identical — and so were their CSS rules, which is the
		// definition of duplication worth removing.
		return (
			'<div class="bnd-cbp-group' +
			(g.cls ? " " + g.cls : "") +
			(g.off ? " bnd-cbp-off" : "") + '"' +
			(g.search ? ' data-search="' + bnd_esc(g.search) + '"' : "") + ">" +
			// A group inside a named band needs no title of its own — the band
			// says it. Emitting the row anyway leaves an empty heading holding
			// open a line of space, which is the kind of gap that reads as a
			// rendering bug rather than as a deliberate blank.
			(g.title || chip
				? '<div class="bnd-cbp-title">' + bnd_esc(g.title || "") + chip + "</div>"
				: "") +
			(g.desc ? '<div class="bnd-cbp-desc">' + bnd_esc(g.desc) + "</div>" : "") +
			g.body +
			"</div>"
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// The shared desk diagram (component rework, slice 1c step 3)
//
// WHY ONE DIAGRAM INSTEAD OF THUMBNAILS PER CHOICE
//   Placement was drawn as a thumbnail per option: six hand-authored SVGs for
//   search alone, and the bell, the user menu, home and all-apps would each have
//   needed their own set — about thirty little pictures of the same desk, every
//   one of which has to stay truthful as the chrome changes. They would not.
//   A miniature that lies about where a thing lands is worse than no picture,
//   because it is believed.
//
//   So there is ONE desk, and a component contributes only the slots it can
//   occupy. The frame is drawn from the same geometry the slots are positioned
//   from, so a region cannot move in the picture without its hit area moving
//   with it.
// ════════════════════════════════════════════════════════════════════════════

/**
 * The desk, in a 300x180 viewBox. Regions are the furniture; a slot is a region
 * or a named part of one.
 *
 * `sub` divides a bar into the centre and the trailing edge, which is a
 * distinction only search makes — the bell and the user menu take a whole
 * region. Keeping both in one table is what stops the two from drifting.
 */
const BND_DESK_GEOM = {
	sidepane: { x: 6, y: 6, w: 58, h: 168 },
	topbar: { x: 68, y: 6, w: 226, h: 22 },
	pagehead: { x: 68, y: 32, w: 226, h: 20 },
	content: { x: 68, y: 56, w: 226, h: 92 },
	dock: { x: 124, y: 120, w: 114, h: 22 },
	bottombar: { x: 68, y: 152, w: 226, h: 22 },
};

/** Slot label -> the rectangle it occupies. Percentages are derived, never typed. */
const BND_DESK_SLOTS = {
	// Whole regions — what a tenant with a simple placement chooses from.
	"Top Bar": BND_DESK_GEOM.topbar,
	"Bottom Bar": BND_DESK_GEOM.bottombar,
	"Page Header": BND_DESK_GEOM.pagehead,
	"Side Pane": BND_DESK_GEOM.sidepane,
	Dock: BND_DESK_GEOM.dock,
	// Parts of a region — search, which cares where in the bar it sits.
	"Top Bar Center": { x: 140, y: 9, w: 82, h: 16 },
	"Top Bar Edge": { x: 250, y: 9, w: 40, h: 16 },
	"Bottom Bar Center": { x: 140, y: 155, w: 82, h: 16 },
	"Bottom Bar Edge": { x: 250, y: 155, w: 40, h: 16 },
	"Sidebar Top": { x: 10, y: 10, w: 50, h: 30 },
	"Sidebar Bottom": { x: 10, y: 140, w: 50, h: 30 },
};

/** Which desk region each placement label resolves to, for availability. */
const BND_SLOT_REGION = {
	"Top Bar": "topbar", "Top Bar Center": "topbar", "Top Bar Edge": "topbar",
	"Bottom Bar": "bottombar", "Bottom Bar Center": "bottombar", "Bottom Bar Edge": "bottombar",
	"Page Header": "pagehead",
	"Side Pane": "sidepane", "Sidebar Top": "sidepane", "Sidebar Bottom": "sidepane",
	Dock: "dock",
};

/**
 * Why a region cannot hold anything in the configuration on screen — "" if it can.
 *
 * WARNS, never blocks: the runtime falls back either way, and naming the actual
 * obstacle beats greying a choice out with no explanation. This mirrors
 * `mount_chrome` in bunood.js, which is the only thing that really decides —
 * `topbar` exists only in the Top Bar layout, `pagehead` only in Compact (which
 * injects the cluster there), `dock` only in Dock, and the sidebar is hidden by
 * Dock outright. The bottom strip is the awkward one: the Bottom Bar layout owns
 * it unconditionally, everyone else borrows the status bar.
 */
function bnd_region_blocker(frm, region) {
	const layout = frm.doc.desk_layout || "Top Bar";
	// A container that has been split out (slice 2c) answers for itself: the
	// question "is there a top bar" is `topbar_enabled`, not the layout, and
	// giving the old answer here would grey out a slot that works — the
	// picker's warning would then be the LAST place the layout still decided.
	// The remaining regions read the layout until their own slice lands.
	if (region === "topbar") {
		// `?? 1` for the same reason boot.py falls back to CHROME_DEFAULTS: a
		// Check reads back as undefined on a site whose migration has not run,
		// and "not migrated yet" must mean the shipped answer, never "off".
		return parseInt(frm.doc.topbar_enabled ?? 1, 10) ? "" : __("the top bar is switched off");
	}
	if (region === "pagehead") {
		return parseInt(frm.doc.pagehead_enabled ?? 0, 10)
			? ""
			: __("the page title row is not carrying controls");
	}
	if (region === "dock") {
		return parseInt(frm.doc.dock_enabled ?? 0, 10) ? "" : __("the dock is switched off");
	}
	// The side pane answers for itself. It used to be "is the layout Dock",
	// because the dock hid it; containers are independent now, so a dock and a
	// side pane coexist and the only thing that removes the pane is its own
	// setting.
	if (region === "sidepane") {
		return parseInt(frm.doc.sidebar_enabled ?? 1, 10) ? "" : __("the side pane is switched off");
	}
	if (region === "bottombar") {
		// Was: "Bottom Bar layout always has one, otherwise ask status_style".
		// Two answers to one question, and they disagreed — which is how "Off"
		// took the Log Out off a Bottom Bar desk in 0.10.0. The container's own
		// switch is the only answer now, and the style is about content.
		return parseInt(frm.doc.bottombar_enabled ?? 1, 10) ? "" : __("the bottom bar is switched off");
	}
	return "";
}

/** The static desk furniture, drawn from the same geometry the slots use. */
function bnd_desk_frame() {
	const r = (k, cls) => {
		const g = BND_DESK_GEOM[k];
		return (
			'<rect class="' + cls + '" x="' + g.x + '" y="' + g.y + '" width="' + g.w +
			'" height="' + g.h + '" rx="3"/>'
		);
	};
	return (
		'<svg class="bnd-dgm-frame" viewBox="0 0 300 180" aria-hidden="true" focusable="false">' +
		'<rect class="bnd-dgm-desk" x="1" y="1" width="298" height="178" rx="6"/>' +
		r("sidepane", "bnd-dgm-region") +
		r("topbar", "bnd-dgm-region") +
		r("pagehead", "bnd-dgm-region bnd-dgm-quiet") +
		r("content", "bnd-dgm-region bnd-dgm-quiet") +
		r("dock", "bnd-dgm-region") +
		r("bottombar", "bnd-dgm-region") +
		"</svg>"
	);
}

/**
 * The diagram as a control.
 *
 * @param {object} o
 * @param {string} o.field    the Theme Settings field the slots write.
 * @param {string[]} o.slots  the labels this component can occupy, in any order.
 * @param {string} o.value    the current label.
 * @param {function} o.blocker  (label) -> reason string, or "".
 *
 * Slots are real `<button>`s positioned over the picture rather than shapes
 * inside it: they are the control, and a control that Frappe's own styles, the
 * keyboard and the accessibility tree all already understand is worth more than
 * a tidier SVG.
 */
function bnd_desk_diagram(o) {
	const pc = (n, total) => (Math.round((n / total) * 10000) / 100) + "%";
	const buttons = o.slots
		.map((label) => {
			const g = BND_DESK_SLOTS[label];
			if (!g) return "";
			const reason = o.blocker ? o.blocker(label) : "";
			const on = label === o.value;
			return (
				'<button type="button" class="bnd-dgm-slot' + (on ? " bnd-dgm-on" : "") +
				(reason ? " bnd-dgm-warn" : "") + '"' +
				' data-field="' + bnd_esc(o.field) + '" data-value="' + bnd_esc(label) + '"' +
				' aria-pressed="' + (on ? "true" : "false") + '"' +
				' title="' + bnd_esc(reason ? __("{0} — not available: {1}. Falls back to the nearest slot.", [__(label), reason]) : __(label)) + '"' +
				' style="inset-inline-start:' + pc(g.x, 300) + ";inset-block-start:" + pc(g.y, 180) +
				";inline-size:" + pc(g.w, 300) + ";block-size:" + pc(g.h, 180) + '">' +
				'<span class="bnd-dgm-label">' + bnd_esc(__(label)) + "</span>" +
				"</button>"
			);
		})
		.join("");
	return '<div class="bnd-dgm">' + bnd_desk_frame() + buttons + "</div>";
}

/**
 * The placement control for a tenant that takes a whole region.
 *
 * `Off` is rendered as a chip beside the diagram rather than as a slot on it,
 * because "not shown" is not a place on the desk. Drawing it as a region would
 * make the picture claim there is somewhere the bell goes when it is off.
 */
function bnd_placement_control(frm, field, note) {
	const current = frm.doc[field] || "Top Bar";
	return (
		bnd_desk_diagram({
			field: field,
			slots: ["Top Bar", "Page Header", "Side Pane", "Dock", "Bottom Bar"],
			value: current,
			blocker: (label) => bnd_region_blocker(frm, BND_SLOT_REGION[label] || ""),
		}) +
		P.options([{ value: "Off", name: __("Off — not shown") }], { field: field, value: current }) +
		(note ? P.note(note) : "")
	);
}

/**
 * The bands a picker can split into, in render order.
 *
 * WHY THE VOCABULARY IS LONGER THAN THREE
 *   Placement / Style / Extras is the right split for five of the six pickers.
 *   The side pane is not one of them: it has 20 option groups, so a single
 *   "Style" band there would be a longer wall than the split exists to remove.
 *   `pane` / `links` / `rail` divide it where its own settings already divide —
 *   the surface, what sits on it, and the collapsed rail. A longer vocabulary
 *   where the data earns it, not a second mechanism.
 *
 * WHY `placement` IS USUALLY EMPTY, AND THAT IS CORRECT
 *   Only the side pane and the search picker have placement controls today.
 *   `inbox_placement` and `user_placement` appear ZERO times in this file — they
 *   are settings with no control yet, and rework step 3 (the shared desk
 *   diagram) is where they get one. A band renders only when it has content, so
 *   step 3 fills this in without editing anything here.
 */
const BND_ZONES = [
	// Style leads. Where a picker has cards, they are its headline choice — the
	// side pane's presets WRITE the placement below them — so a "Placement" band
	// above the thing that sets it reads backwards.
	{ key: "style", title: () => __("Style") },
	{ key: "placement", title: () => __("Placement") },
	{ key: "pane", title: () => __("Pane surface") },
	{ key: "links", title: () => __("Links & icons") },
	{ key: "rail", title: () => __("Rail") },
	{ key: "extras", title: () => __("Extras") },
];

/**
 * Assemble `{zone, html}` parts into bands.
 *
 * A picker whose parts all land in ONE zone gets no headings at all — a band
 * titled "Style" over the entire contents of a pane says nothing and costs a
 * line. That is computed from what actually rendered rather than declared
 * per-picker, so a picker that grows a second zone starts showing headings on
 * its own, and one that loses a zone stops.
 *
 * Order comes from BND_ZONES, never from the caller's array order: two pickers
 * listing their parts in different sequences must still read the same way.
 */
function bnd_bands(parts) {
	const live = BND_ZONES.map((z) => ({
		z,
		html: parts.filter((p) => p.zone === z.key && p.html).map((p) => p.html).join(""),
	})).filter((b) => b.html);

	if (live.length < 2) return live.map((b) => b.html).join("");
	return live.map((b) => P.zone({ key: b.z.key, title: b.z.title(), body: b.html })).join("");
}

/**
 * Stop the primary button reading "Submit" on a doctype nothing can submit.
 *
 * THIS IS AN UPSTREAM DEFECT, NOT OURS, and it is worth writing down because
 * everything about the symptom points the wrong way:
 *
 *   * `frappe/public/js/frappe/model/perm.js` `_get_perm()` gives Administrator
 *     EVERY right unconditionally — `submit` among them — with no reference to
 *     whether the doctype is submittable.
 *   * `frappe/public/js/frappe/form/toolbar.js` `can_submit()` then tests that
 *     right and never asks `is_submittable`. That word appears exactly once in
 *     the file, inside `add_discard()`, and never here.
 *   * `get_action_status()` checks `can_submit()` BEFORE `can_save()`.
 *
 * So for an Administrator, every saved workflow-free document in the desk
 * reports "Submit" — a settings Single included. `is_submittable` is 0 in our
 * JSON, `docstatus` is 0, there is no Workflow, Client Script or Property
 * Setter, and none of that matters: the label comes from a PERMISSION.
 *
 * Corrected for this doctype only. This app is a theme; rewriting the desk's
 * permission model for every doctype is not a theme's business, and a global
 * patch would surprise the next person debugging a genuinely submittable form.
 * The three rights cleared are meaningless on a non-submittable doctype, so
 * clearing them states a fact rather than removing a capability — without it
 * the same path can also offer "Cancel" and "Amend".
 */
function bnd_fix_primary_action(frm) {
	if (!frm.meta || frm.meta.is_submittable) return;
	const perm = frm.perm && frm.perm[0];
	if (!perm) return;
	if (!perm.submit && !perm.cancel && !perm.amend) return;
	perm.submit = 0;
	perm.cancel = 0;
	perm.amend = 0;
	// Recompute: the toolbar may already have decided on the stale rights.
	if (frm.toolbar && typeof frm.toolbar.set_primary_action === "function") {
		frm.toolbar.set_primary_action();
	}
}

// ════════════════════════════════════════════════════════════════════════════
// Autosave — a click IS the change
//
// WHAT
//   Every control on this form persists the moment it is touched. No Save, no
//   Discard, no "Not Saved" badge. The desk already previewed each choice live;
//   the Save button was the last place a user could see their change and still
//   not have made it.
//
// WHY IT HOOKS `frm.dirty` AND NOT THE CONTROLS
//   There are a dozen `frm.set_value` call sites across seven pickers, the desk
//   diagram, the layout preset and the toggles, and more arrive with every
//   component. Wiring each one is a list to keep in step with the form — the
//   duplication this whole rework exists to remove. `frm.dirty()` is the single
//   choke point Frappe itself routes every change through, so a control added
//   tomorrow is covered without anyone remembering.
//
// WHY IT IS SERIALISED, AND WHY THAT IS THE WHOLE DESIGN
//   Two saves in flight is not a performance problem, it is a CORRECTNESS one:
//   the second carries the first's stale `modified` and dies with
//   TimestampMismatchError — the same error this app just fixed at the seeding
//   end. Autosave multiplies the chance of it by every click. So: one save at a
//   time, a debounce so a burst of clicks is one write, and a re-run afterwards
//   if anything changed while a save was in flight. The LAST click is what ends
//   up stored, which is the only answer a user would call correct.
//
// FAILS LOUDLY, NEVER SILENTLY
//   A settings page that silently stops persisting is worse than one with a
//   Save button, because nothing on screen says so. A save that fails re-marks
//   the form dirty and lets Frappe's own error surface.
// ════════════════════════════════════════════════════════════════════════════

/** How long a burst of clicks is collapsed into one write. */
const BND_AUTOSAVE_MS = 400;

/**
 * How many times a save may be deferred because Frappe is already saving.
 *
 * Bounded, not infinite. `frappe.ui.form.is_saving` is cleared in an `always`
 * handler, so a request that never returns would leave it set and an unbounded
 * retry would spin for the life of the page. Ten deferrals is four seconds —
 * far longer than any of these writes takes, and short of a spin.
 */
const BND_AUTOSAVE_MAX_DEFER = 10;

let bnd_save_timer = null;
let bnd_save_defers = 0;

/**
 * Wrap `frm.dirty` once per form so every change schedules a save.
 *
 * Idempotent by a marker on the form: `refresh` runs many times per session and
 * wrapping twice would double every scheduled save.
 */
function bnd_autosave_setup(frm) {
	if (frm.__bnd_autosave) return;
	frm.__bnd_autosave = true;

	const native_dirty = frm.dirty.bind(frm);
	frm.dirty = function () {
		const out = native_dirty.apply(this, arguments);
		bnd_schedule_autosave(frm);
		return out;
	};
}

function bnd_schedule_autosave(frm) {
	clearTimeout(bnd_save_timer);
	bnd_save_timer = setTimeout(() => bnd_autosave(frm), BND_AUTOSAVE_MS);
}

/**
 * Save, once, if there is anything to save and Frappe is not already saving.
 *
 * THE IN-FLIGHT FLAG IS FRAPPE'S, NOT OURS, and that distinction cost a suite
 * run. `frappe.ui.form.is_saving` is a module-level global set by
 * `form/save.js` — shared by every form, and set by paths this file does not
 * own (the toolbar button, Ctrl+S, another form entirely). A private flag of
 * ours tracked only the saves we started, so a click landing beside one of
 * those went straight into `_call`, which does:
 *
 *     if (frappe.ui.form.is_saving) { console.log(...); throw "saving"; }
 *
 * That throw is SYNCHRONOUS and it throws a bare string, so `frm.save()` never
 * returns a promise and `.catch()` never sees it — which is why it surfaced as
 * two unexplained console errors rather than as a failed save. Hence both the
 * pre-check and the try/catch: one to avoid the throw, one for the race
 * between checking and calling.
 */
function bnd_autosave(frm) {
	// `is_dirty` and not a flag of our own: Frappe owns that answer too, and a
	// reload or a discard clears it without telling us.
	if (!frm.is_dirty() || frm.doc.__islocal) return;

	if (frappe.ui.form.is_saving) {
		if (bnd_save_defers++ < BND_AUTOSAVE_MAX_DEFER) bnd_schedule_autosave(frm);
		return;
	}
	bnd_save_defers = 0;

	// `frappe.dom.freeze` is deliberately NOT used. Freezing the desk on every
	// click is exactly the interruption autosave exists to remove, and these
	// writes are small.
	let saving;
	try {
		saving = frm.save();
	} catch (e) {
		// Lost the race above. Come back rather than dropping the change.
		if (bnd_save_defers++ < BND_AUTOSAVE_MAX_DEFER) bnd_schedule_autosave(frm);
		return;
	}

	Promise.resolve(saving)
		.then(() => {
			// A click that landed WHILE this save was in flight left the form
			// dirty again. Re-arm — this is what makes the last click the one
			// that ends up stored.
			if (frm.is_dirty()) bnd_schedule_autosave(frm);
		})
		.catch(() => {
			// Leave it dirty and STOP. Frappe has already shown whatever went
			// wrong, the Save button lights up as the manual fallback, and a
			// retry loop against a failure that is not going away would spin
			// forever. A form that quietly reports itself saved when it is not
			// is the one failure mode worse than the Save button.
			frm.doc.__unsaved = 1;
		});
}

frappe.ui.form.on("Theme Settings", {
	// Before the first refresh, so the toolbar's first decision is already
	// made on corrected rights rather than corrected after the fact.
	onload(frm) {
		bnd_fix_primary_action(frm);
	},
	refresh(frm) {
		bnd_fix_primary_action(frm);
		bnd_autosave_setup(frm);
		// The layout is becoming a PRESET rather than a setting the desk reads
		// at runtime (component rework). Read-only for one release so support
		// can still see what a site was, while the component fields below are
		// the truth. It is not hidden, because "my layout dropdown vanished"
		// is a worse first impression than a greyed field with a reason.
		frm.set_df_property(
			"desk_layout",
			"description",
			__("Replaced by the component settings below. Kept visible for reference; it no longer decides anything on its own.")
		);
		frm.set_df_property("desk_layout", "read_only", 1);

		bnd_render_layout_picker(frm);
		bnd_render_sidebar_picker(frm);
		bnd_render_crumbs_picker(frm);
		bnd_render_palette_picker(frm);
		bnd_render_inbox_picker(frm);
		bnd_render_search_picker(frm);
		bnd_render_status_picker(frm);
		bnd_render_user_picker(frm);
		bnd_render_links_picker(frm);
		// AFTER the pickers, never before: the shell relocates the sections they
		// were just drawn into, and moving a node the renderer is about to look
		// for is how the host resolver ends up pointing at a detached wrapper.
		bnd_shell_setup(frm);
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
		// The preset WRITES first, then everything repaints against what it
		// wrote. The other order paints the old containers and leaves them on
		// screen until the next refresh.
		//
		// Fires only on a real change — Frappe does not run field handlers on
		// load — so this cannot overwrite an admin's container choices when
		// they merely open the form. The one place `desk_layout` is written is
		// the layout picker's click handler, which is exactly the gesture that
		// should mean "apply this preset".
		bnd_apply_layout_preset(frm).then(() => {
			// The preset just wrote five container values and the placements;
			// without this the desk keeps the OLD layout's chrome until a
			// reload, which is the same "nothing applied" the containers had.
			bnd_container_changed(frm);
			bnd_render_layout_picker(frm);
		});
	},
	// A container's on/off changes which regions can hold anything, exactly as
	// the layout used to — so it invalidates the same set of diagrams. One
	// handler per container, all calling the one repaint, because the thing
	// that went stale is the same thing however it was changed.
	topbar_enabled: bnd_container_changed,
	pagehead_enabled: bnd_container_changed,
	bottombar_enabled: bnd_container_changed,
	dock_enabled: bnd_container_changed,
	sidebar_enabled: bnd_container_changed,
});

/**
 * A container was switched: apply it to the live desk, then repaint.
 *
 * THE DESK IS THE PREVIEW, for containers as for every style kit. Until this
 * existed the five containers were read once from boot and never re-mounted,
 * so switching one did nothing visible until the user next happened to reload
 * the page. Harmless while saving meant pressing Save; fatal to the feature
 * once Theme Settings began saving on click, because then no gesture refreshed
 * the desk at all and the setting looked broken.
 *
 * All five are sent every time, not just the one that changed. `chrome_apply`
 * decides what to mount and tear down by comparing the whole picture, and
 * handing it a single field would make it guess at the rest.
 */
function bnd_container_changed(frm) {
	if (window.bunood_theme && typeof window.bunood_theme.chrome_apply === "function") {
		window.bunood_theme.chrome_apply({
			topbar_enabled: frm.doc.topbar_enabled,
			pagehead_enabled: frm.doc.pagehead_enabled,
			bottombar_enabled: frm.doc.bottombar_enabled,
			sidebar_enabled: frm.doc.sidebar_enabled,
			dock_enabled: frm.doc.dock_enabled,
		});
	}
	bnd_repaint_placement_pickers(frm);
}

/**
 * Repaint every picker whose availability notes read the desk's shape.
 *
 * Every placement diagram marks the slots that cannot be honoured right now
 * (`bnd_region_blocker`), so all of them go stale the moment the shape changes
 * — not just search's. "Not available" lingering on a slot that works is worse
 * than no warning at all, because it is a warning the user can prove wrong.
 *
 * A function rather than three calls repeated per handler: the container split
 * adds one handler per container, and a list restated five times is the
 * duplication this rework exists to remove.
 */
function bnd_repaint_placement_pickers(frm) {
	bnd_render_inbox_picker(frm);
	bnd_render_user_picker(frm);
	bnd_render_search_picker(frm);
	bnd_render_links_picker(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Master & detail shell (component rework, slice 1c step 2)
//
// WHAT
//   A grouped list on one side, one component's settings on the other, instead
//   of ~70 fields in nine stacked sections that a reader has to scroll to find
//   anything in.
//
// WHY IT RELOCATES SECTIONS RATHER THAN REBUILDING THEM
//   The obvious build is a second surface: draw the shell, and render every
//   picker into it. That gives you TWO sets of cards bound to the same fields,
//   each unaware of the other's clicks — the same-fact-in-two-places defect this
//   whole rework exists to remove, reintroduced by the thing meant to fix it.
//
//   So the shell MOVES the DOM Frappe already built. There is exactly one node
//   per field, in a different parent, and "only one surface exists" stops being
//   a rule anybody has to keep and becomes a property of the construction. It
//   also means every Frappe control keeps working untouched: its JS holds a
//   reference to its own wrapper, and a wrapper does not care who its parent is.
//
// WHY IT IS GATED BEHIND ?shell=1
//   This lands before it replaces anything. The stacked form stays the default
//   until the shell has the diagram (step 3) and the derived preset label, and
//   until it has been used. A half-finished navigation is worse than a long
//   form, because a long form at least shows you everything it has.
// ════════════════════════════════════════════════════════════════════════════

/**
 * The left list: groups, and what each entry owns.
 *
 * `anchors` are FIELD names, not section names, and that is deliberate — a
 * section break's own wrapper is an implementation detail of Frappe's layout
 * engine that has moved between versions, while a field's `$wrapper` is the
 * thing every control in this form already depends on. The section is found by
 * walking up from the field, so this keeps working if Frappe restructures.
 */
const BND_SHELL_GROUPS = [
	{
		group: () => __("Desk"),
		items: [
			// The only entry that renders rather than relocating: it owns no
			// fields, it reads them.
			{ key: "overview", label: () => __("Overview"), render: bnd_render_overview },
		],
	},
	{
		group: () => __("Bars & panes"),
		items: [
			// Containers, roughly top to bottom on the desk. The top bar is the
			// first to have been split out of `desk_layout` (slice 2c); the
			// others join this group as their own entries as their slices land,
			// and "Layout preset" under Appearance stops being a setting at all
			// once the last one has.
			{ key: "topbar", label: () => __("Top bar"), anchors: ["topbar_enabled"] },
			{ key: "pagehead", label: () => __("Page header"), anchors: ["pagehead_enabled"] },
			{ key: "sidepane", label: () => __("Side pane"), anchors: ["sidebar_preset"] },
			{ key: "dock", label: () => __("Dock"), anchors: ["dock_enabled"] },
			{ key: "status", label: () => __("Bottom bar"), anchors: ["bottombar_enabled"] },
			{ key: "search", label: () => __("Search"), anchors: ["search_picker"] },
		],
	},
	{
		group: () => __("Controls"),
		items: [
			{ key: "inbox", label: () => __("Notifications"), anchors: ["inbox_style"] },
			{ key: "user", label: () => __("User menu"), anchors: ["user_picker"] },
			{ key: "links", label: () => __("Home & All Apps"), anchors: ["links_picker"] },
			// `enable_command_palette` now sits with its seven siblings in
			// section_palette, so one anchor reaches the whole component. It used
			// to live three sections away, and anchoring it here claimed the
			// section that also held `default_density` — which left a stranded
			// "Features" heading over nothing and evicted the density control.
			{ key: "palette", label: () => __("Command palette"), anchors: ["palette_style"] },
			{ key: "crumbs", label: () => __("Breadcrumbs"), anchors: ["crumb_style"] },
		],
	},
	{
		group: () => __("Appearance"),
		items: [
			{ key: "layout", label: () => __("Layout preset"), anchors: ["desk_layout"] },
			{ key: "branding", label: () => __("Branding"), anchors: ["company_name"] },
			// brand_css_url is the generated stylesheet path — it belongs beside
			// the colours that produce it, not in a "Generated" section of its own
			// at the bottom of the form where nobody connects the two.
			{ key: "colors", label: () => __("Colours"), anchors: ["brand_color", "brand_css_url"] },
			// `default_density` has its own section as of the shell work. It used
			// to share `section_features` with `enable_command_palette`, and the
			// fallback that handles a twice-claimed section handled it — but only
			// by moving a bare $wrapper out of `.form-column > form`, which severs
			// the direct-descendant chain Frappe caps input width with
			// (form.scss `.form-column.col-sm-12 > form > .input-max-width`).
			// Measured: 636px against every other Select's 273px. The fallback is
			// still there for the next collision; this one is fixed at the root.
			{ key: "density", label: () => __("Density"), anchors: ["default_density"] },
		],
	},
];

/**
 * The shipped defaults, fetched once per form session. `null` until it arrives,
 * and `null` forever if the call fails — every reader treats that as "cannot
 * say", so a failed fetch costs the change marks and nothing else. The form has
 * to render when the server cannot answer a cosmetic question.
 */
let bnd_shipped = null;

/**
 * The layout catalogue and the container-key -> fieldname map, from the same
 * request as `bnd_shipped`. `null` until it arrives and `null` forever if the
 * call fails, in which case picking a layout writes no container values —
 * which is the honest failure: better to leave the desk as it is than to write
 * half a preset from a guess.
 */
let bnd_layout_chrome = null;
let bnd_container_toggles = null;

/**
 * Which fields each shell entry owns, as PREFIXES rather than a list.
 *
 * The alternative is a sixth hand-written list of fieldnames — there are already
 * five (`BND_CRUMB_FIELDS`, `BND_PALETTE_FIELDS`, `BND_INBOX_FIELDS`,
 * `BND_STATUS_FIELDS`, `bnd_sb_catalogue.fields`) and adding one more that must
 * be kept in step with the doctype is the defect this repo keeps paying for. The
 * prefix IS the naming rule `build.mjs` already enforces, so this reads the
 * convention instead of restating its contents.
 *
 * The four entries with no prefix are listed explicitly, because identity and
 * colour are axes rather than components and deliberately carry no prefix —
 * `build.mjs`'s FIELD_EXCEPTIONS says exactly that.
 */
const BND_SHELL_OWNS = {
	topbar: { prefixes: ["topbar_"] },
	pagehead: { prefixes: ["pagehead_"] },
	sidepane: { prefixes: ["sidebar_"] },
	dock: { prefixes: ["dock_"] },
	// The bell and the user menu are separate components sharing one picker, so
	// this entry owns the inbox prefix plus the user menu's placement field.
	inbox: { prefixes: ["inbox_"] },
	user: { fields: ["user_placement"] },
	links: { fields: ["home_placement", "apps_placement"] },
	// The container and the content it shows are one entry: "is there a bar"
	// and "what does it say" are the same component to a reader, even though the
	// split deliberately made them two fields.
	status: { prefixes: ["status_", "bottombar_"] },
	search: { prefixes: ["search_"] },
	crumbs: { prefixes: ["crumb_"] },
	palette: { prefixes: ["palette_"], fields: ["enable_command_palette"] },
	layout: { fields: ["desk_layout"] },
	branding: { fields: ["company_name", "logo", "favicon", "tagline"] },
	colors: { fields: ["brand_color", "accent_color", "brand_color_dark", "accent_color_dark"] },
	density: { fields: ["default_density"] },
};

/**
 * The fields of one shell entry that differ from what a fresh install writes.
 *
 * Returns `[]` when the defaults have not arrived. "Cannot say" and "nothing
 * changed" therefore render identically, and that is the right way round: a mark
 * that appeared because a fetch failed would be a lie about the user's settings.
 *
 * Comparison goes through `bnd_sb_norm`, which is not decoration here. Two
 * values that mean the same thing arrive in different shapes — a Check reads
 * back as `1` from Python and `"1"` from some form paths, and
 * `sidebar_menu_rail` has two legacy spellings that both mean "Rail". Comparing
 * raw would mark a component changed that nobody had touched.
 */
function bnd_changed_fields(key, frm) {
	if (!bnd_shipped) return [];
	const spec = BND_SHELL_OWNS[key];
	if (!spec) return [];
	const owned = Object.keys(bnd_shipped).filter(
		(f) =>
			(spec.fields || []).includes(f) ||
			(spec.prefixes || []).some((p) => f.startsWith(p))
	);
	return owned.filter((f) => bnd_sb_norm(f, frm.doc[f]) !== bnd_sb_norm(f, bnd_shipped[f]));
}

/**
 * The note under a shell entry: a preset name where one genuinely exists,
 * otherwise how far the component is from stock.
 *
 * TWO ENTRIES HAVE A REAL CATALOGUE; the rest do not, and pretending otherwise
 * would be the defect this rework exists to remove.
 *
 *   sidepane  — `SIDEBAR_PRESETS`, 22 values per preset, matched since item 10.
 *   layout    — `registry.LAYOUT_CHROME` as of slice 2c. **This is new**, and
 *               it is what the whole container split was for. Until the split
 *               there was no table anywhere stating what a layout writes: the
 *               migration patch records what 0.10.0 *rendered*, which is a
 *               one-shot artefact, and the layout decided things at mount time
 *               that no field recorded at all. There was nothing to compare
 *               against, so this function said "Changed" or "Default" and the
 *               comment here said why. Now every layout is exactly five
 *               container values, so the name is DERIVED by comparing them —
 *               and reads "Custom" the moment one differs.
 *
 * `crumb_style`, `palette_style`, `inbox_style` and `status_style` are top-level
 * style CHOICES that compose with their extras — `presets.py` says so in as many
 * words — so there is still nothing to match and no "Custom" to derive. Those
 * get the honest two-state, computed by the SAME function the dot uses. One
 * comparison, two renderings — never two comparisons that can disagree.
 */
function bnd_shell_note(key, frm) {
	if (!bnd_shipped) return "";
	// An entry that owns no fields has no state to report. The Overview READS
	// settings; saying "Default" under it claims it has some, and would go on
	// saying it while every component it shows had been changed.
	if (!BND_SHELL_OWNS[key]) return "";
	if (key === "sidepane" && bnd_sb_catalogue) return bnd_sb_match_preset(frm);
	if (key === "layout") return bnd_match_layout(frm);
	return bnd_changed_fields(key, frm).length ? __("Changed") : __("Default");
}

/**
 * Which layout the desk's containers currently ARE, or "Custom".
 *
 * Derived by comparing values, never by reading `desk_layout` back. Pinning the
 * name pins nothing: the name is what was last APPLIED, and every container has
 * its own switch afterwards, so a desk can carry the label "Dock" while showing
 * a top bar and a side pane. The side pane's picker has worked this way since
 * item 10 for exactly this reason — its label is derived by comparing 23 values
 * — and this is the same rule reaching the last preset that lacked it.
 *
 * Falls back to the stored name when the catalogue has not arrived. That is the
 * honest answer to "cannot say": it is what a user picked, merely unverified.
 */
function bnd_match_layout(frm) {
	const current = frm.doc.desk_layout || "";
	if (!bnd_layout_chrome || !bnd_container_toggles) return __(current);

	for (const name of Object.keys(bnd_layout_chrome)) {
		const row = bnd_layout_chrome[name];
		const matches = Object.keys(bnd_container_toggles).every((key) => {
			const field = bnd_container_toggles[key];
			// A container whose field the doctype has not grown cannot disagree.
			if (!(key in row) || !frm.get_field(field)) return true;
			return parseInt(frm.doc[field] ?? row[key], 10) === row[key];
		});
		if (matches) return __(name);
	}
	return __("Custom");
}

/**
 * The Overview: the same desk, showing where everything currently is.
 *
 * This is the diagram's second job and the reason it is worth building once.
 * Per-component pickers answer "where does the bell go"; nobody could answer
 * "what does my desk look like" without opening five of them and holding the
 * answer in their head. Here it is one picture.
 *
 * Read-only by design. A marker is a link to the control, not a control — two
 * ways to set the same value is the duplication this rework exists to remove,
 * and a drag target on a 40px box would be a worse one than the picker it
 * duplicated.
 */
const BND_OVERVIEW_TENANTS = [
	{ key: "search", field: "search_placement", label: () => __("Search"), fallback: "Top Bar Center" },
	{ key: "inbox", field: "inbox_placement", label: () => __("Bell"), fallback: "Top Bar" },
	{ key: "user", field: "user_placement", label: () => __("You"), fallback: "Top Bar" },
];

function bnd_render_overview(frm, $pane) {
	const pc = (n, total) => Math.round((n / total) * 10000) / 100 + "%";
	const placed = [];
	const off = [];

	BND_OVERVIEW_TENANTS.forEach((t, i) => {
		const value = frm.doc[t.field] || t.fallback;
		const g = BND_DESK_SLOTS[value];
		if (!g) {
			off.push(t);
			return;
		}
		const reason = bnd_region_blocker(frm, BND_SLOT_REGION[value] || "");
		// Stack markers inside a region rather than overlapping them: three
		// things in the top bar is the COMMON case, not an edge case.
		const seen = placed.filter((x) => x.value === value).length;
		placed.push({ ...t, value, g, reason, seen });
	});

	const markers = placed
		.map((m) => {
			const inset = m.seen * 26;
			return (
				'<button type="button" class="bnd-dgm-mark' + (m.reason ? " bnd-dgm-warn" : "") + '"' +
				' data-goto="' + bnd_esc(m.key) + '"' +
				' title="' + bnd_esc(
					m.reason
						? __("{0}: {1} — not available: {2}", [m.label(), __(m.value), m.reason])
						: __("{0}: {1}", [m.label(), __(m.value)])
				) + '"' +
				' style="inset-inline-start:calc(' + pc(m.g.x, 300) + " + " + inset + 'px);inset-block-start:' +
				pc(m.g.y + 2, 180) + '">' + bnd_esc(m.label()) + "</button>"
			);
		})
		.join("");

	const hidden = off.length
		? P.note(__("Not shown anywhere: {0}", [off.map((t) => t.label()).join(", ")]))
		: "";

	$pane.html(
		P.wrap(
			'<div class="bnd-dgm bnd-dgm-overview">' + bnd_desk_frame() + markers + "</div>" +
			P.note(
				// "Layout PRESET", not "Layout". Since slice 2c a container can
				// contradict the layout it came from — a top bar on a Classic
				// desk — so naming the layout as though it described the picture
				// above would be a claim this line cannot back. It names what
				// was last APPLIED, which it can. The derived "Custom" label
				// that makes the difference visible arrives with the last
				// container, when the catalogue reaches the client.
				__("Layout preset: {0}. Each mark is a control — select it to change where that piece lives.", [
					__(frm.doc.desk_layout || "Top Bar"),
				])
			) + hidden
		)
	);
	$pane.find(".bnd-dgm-mark").on("click", function () {
		bnd_shell_select(frm, this.getAttribute("data-goto"));
	});
}

/**
 * True unless the URL asks for the old stacked form.
 *
 * THE DEFAULT FLIPPED once the shell was finished. It shipped behind `?shell=1`
 * while it was being built, on the reasoning that a half-finished navigation is
 * worse than a long form — right at the time, and wrong the moment it stopped
 * being half-finished. Left as it was, the work was invisible: the settings page
 * kept showing the ~70-field stack it was built to replace, and the only way to
 * see the new one was a query string nobody would guess.
 *
 * `?shell=0` still reaches the stacked form. It is the escape hatch for anyone
 * who needs a field the shell has not placed, and for comparing the two.
 *
 * Read from `location`, not from Frappe's route state: the router drops unknown
 * query args on some transitions, and the answer must not change under the user
 * mid-session.
 */
function bnd_shell_wanted() {
	try {
		return new URLSearchParams(window.location.search).get("shell") !== "0";
	} catch (e) {
		// Cannot tell — show the stacked form, which needs nothing from us.
		return false;
	}
}

/**
 * Build the shell once, move the owned sections into it, and select an entry.
 *
 * Idempotent: `refresh` fires on every save and route return, and rebuilding
 * would detach sections the pickers have already been drawn into.
 */
function bnd_shell_setup(frm) {
	const field = frm.get_field("chrome_shell");
	if (!field || !field.$wrapper) return;
	if (!bnd_shell_wanted()) {
		// Hide the host section on the stacked form. The field renders nothing
		// there, and Frappe cannot mark the section empty by itself — so it drew
		// a "Desk" heading over a blank strip at the top of the default form,
		// which is the same empty-heading defect the shell's own panes fixed.
		field.$wrapper.closest(".form-section").hide();
		return;
	}
	if (field.$wrapper.find(".bnd-shell").length) {
		// Already built. The sections are where we put them; the selection and
		// the change marks are the only state that can have gone stale — and the
		// marks always have, because `refresh` fires straight after a save and a
		// save is precisely when "changed" stops being true.
		bnd_shell_select(frm, field.$wrapper.find(".bnd-shell").attr("data-current") || "sidepane");
		bnd_shell_marks(frm);
		return;
	}

	const $ = window.$;
	let nav = "";
	for (const g of BND_SHELL_GROUPS) {
		nav += `<div class="bnd-shell-group">${bnd_esc(g.group())}</div>`;
		for (const item of g.items) {
			nav +=
				`<button type="button" class="bnd-shell-item" data-key="${bnd_esc(item.key)}">` +
				`<span class="bnd-shell-label">${bnd_esc(item.label())}</span>` +
				`<span class="bnd-shell-note" data-bnd-note="${bnd_esc(item.key)}"></span>` +
				`<span class="bnd-shell-dot" data-bnd-dot="${bnd_esc(item.key)}" hidden></span>` +
				`</button>`;
		}
	}

	const $shell = $(
		`<div class="bnd-shell" data-current="">` +
			`<nav class="bnd-shell-nav" role="tablist">${nav}</nav>` +
			`<div class="bnd-shell-detail"></div>` +
			`</div>`
	);
	field.$wrapper.empty().append($shell);

	const $detail = $shell.find(".bnd-shell-detail");
	// A section can only be in one pane. Two entries claiming the same one is not
	// hypothetical — `default_density` and `enable_command_palette` share
	// `section_features`, so the second claim silently stole the first entry's
	// content until this existed. First claim wins the whole section; a later one
	// takes just its own field, which is the smaller, still-correct move.
	const claimed = new Set();
	for (const g of BND_SHELL_GROUPS) {
		for (const item of g.items) {
			const $pane = $(`<div class="bnd-shell-pane" data-key="${bnd_esc(item.key)}" hidden></div>`);
			$detail.append($pane);
			if (item.render) {
				// Owns no fields, so there is nothing to relocate — it draws.
				item.render(frm, $pane);
				continue;
			}
			for (const anchor of item.anchors || []) {
				const f = frm.get_field(anchor);
				if (!f || !f.$wrapper) continue;
				const $section = f.$wrapper.closest(".form-section");
				const node = $section.length ? $section[0] : null;
				// MOVE, not clone. jQuery append relocates an existing node, so
				// there is never a second copy to keep in step.
				if (node && !claimed.has(node)) {
					claimed.add(node);
					$pane.append($section);
				} else {
					$pane.append(f.$wrapper);
				}
			}
		}
	}

	$shell.on("click", ".bnd-shell-item", function () {
		bnd_shell_select(frm, this.getAttribute("data-key"));
	});

	bnd_shell_select(frm, BND_SHELL_GROUPS[0].items[0].key);

	// The marks need the shipped defaults, which the server owns. Fetched once
	// and then re-read from the module-level cache, so returning to the form
	// costs nothing. A failure leaves `bnd_shipped` null and the marks simply do
	// not appear — the shell is already fully usable without them.
	bnd_load_shipped().then(() => bnd_shell_marks(frm));
}

/**
 * The server's answer to "what does a fresh install write, and what does each
 * layout preset write" — fetched once per form session, then cached.
 *
 * ONE REQUEST, THREE CONSUMERS: the change dots, the derived note, and the
 * layout preset that writes the container fields. It is a promise rather than a
 * flag because the third of those is triggered by a CLICK, which can land
 * before any fetch this form started has resolved — and a preset that silently
 * writes nothing because a request was still in flight is the worst of the
 * available failures. Callers await; the cache makes every later await free.
 *
 * Never rejects. A failed fetch leaves `bnd_shipped` null, which every reader
 * already treats as "cannot say" — the form has to render when the server
 * cannot answer a cosmetic question.
 */
let bnd_shipped_load = null;
function bnd_load_shipped() {
	if (bnd_shipped) return Promise.resolve();
	if (bnd_shipped_load) return bnd_shipped_load;
	bnd_shipped_load = frappe
		.xcall("bunood_theme.api.get_shipped_defaults")
		.then((data) => {
			bnd_shipped = (data && data.defaults) || null;
			bnd_layout_chrome = (data && data.layout_chrome) || null;
			bnd_container_toggles = (data && data.toggles) || null;
		})
		.catch(() => {
			// Let the next caller try again: this one may have failed because
			// the desk was mid-reload, and a permanently poisoned cache would
			// cost the layout preset for the rest of the session.
			bnd_shipped_load = null;
		});
	return bnd_shipped_load;
}

/**
 * Apply a layout preset: write what the chosen layout says each container is.
 *
 * WHY THE LAYOUT HAS TO WRITE, AND WHY IT COULD NOT WAIT FOR THE LAST SLICE
 *   `desk_layout` used to be READ at mount time, and a ladder of branches
 *   decided which containers appeared. The split replaces that with one setting
 *   per container — which means that from the moment the FIRST container is
 *   split out, the layout no longer moves it. Picking "Compact" would give a
 *   desk its page-head cluster and leave the top bar exactly where it was: a
 *   layout picker that half works, on every site, for as long as the split
 *   takes to finish. So the write lands with the first container, not the last.
 *
 * Same contract as the sidebar presets: applying a preset is writing its
 * values, there is no "preset plus overrides" state anywhere, and the values
 * are the canon. The catalogue is `registry.LAYOUT_CHROME`, served rather than
 * copied here — a client-side second copy is the defect this rework exists to
 * remove.
 *
 * Containers whose field the doctype has not grown yet are skipped by ASKING
 * THE FORM whether the field exists, rather than by consulting a list of which
 * slices have landed. There is no such list to fall out of step with.
 */
function bnd_apply_layout_preset(frm) {
	return bnd_load_shipped().then(() => {
		if (!bnd_layout_chrome || !bnd_container_toggles) return;
		const row = bnd_layout_chrome[frm.doc.desk_layout];
		if (!row) return; // unknown layout: write nothing, same fail-open rule
		for (const key of Object.keys(bnd_container_toggles)) {
			const field = bnd_container_toggles[key];
			if (!(key in row) || !frm.get_field(field)) continue;
			frm.set_value(field, row[key]);
		}
	});
}

/**
 * Paint the change dot and the note on every entry.
 *
 * Called after the fetch and after every save, because a save is exactly when
 * "changed" stops being true. It reads `frm.doc`, so it must run after Frappe
 * has refreshed the document, never against the values the user typed.
 */
function bnd_shell_marks(frm) {
	const field = frm.get_field("chrome_shell");
	if (!field || !field.$wrapper) return;
	const $shell = field.$wrapper.find(".bnd-shell");
	if (!$shell.length) return;

	for (const g of BND_SHELL_GROUPS) {
		for (const item of g.items) {
			const changed = bnd_changed_fields(item.key, frm).length;
			const dot = $shell.find(`[data-bnd-dot="${item.key}"]`)[0];
			const note = $shell.find(`[data-bnd-note="${item.key}"]`)[0];
			if (dot) {
				if (changed) dot.removeAttribute("hidden");
				else dot.setAttribute("hidden", "hidden");
				// The dot is decoration; the count is the fact. Announce it once,
				// on the control, rather than shipping a coloured circle that
				// says nothing to anyone not looking at it.
				// Label + value, never an interpolated plural: Frappe's translation
				// layer is flat key->value with no plural support and Arabic has
				// singular, dual and two plural forms, so "{0} settings differ"
				// cannot be made correct for n=1,2,3-10,11+. See ROADMAP item 7(c).
				dot.setAttribute("title", __("Differs from default") + ": " + changed);
			}
			if (note) note.textContent = bnd_shell_note(item.key, frm);
		}
	}
}

/** Show one pane, mark its entry selected. */
function bnd_shell_select(frm, key) {
	const field = frm.get_field("chrome_shell");
	if (!field || !field.$wrapper) return;
	const $shell = field.$wrapper.find(".bnd-shell");
	if (!$shell.length) return;

	$shell.attr("data-current", key);
	$shell.find(".bnd-shell-item").each(function () {
		const on = this.getAttribute("data-key") === key;
		this.classList.toggle("bnd-shell-on", on);
		this.setAttribute("aria-selected", on ? "true" : "false");
	});
	// A render-entry reads values the OTHER panes write, so it is stale the
	// moment anything else was touched. Redrawn on selection rather than on
	// every change: it is the cheapest place that is always early enough.
	for (const g of BND_SHELL_GROUPS) {
		for (const item of g.items) {
			if (item.render && item.key === key) {
				item.render(frm, $shell.find(`.bnd-shell-pane[data-key="${key}"]`));
			}
		}
	}
	$shell.find(".bnd-shell-pane").each(function () {
		const on = this.getAttribute("data-key") === key;
		// `hidden` rather than display, so a pane that is off is off for
		// assistive technology too, not merely invisible.
		if (on) this.removeAttribute("hidden");
		else this.setAttribute("hidden", "hidden");
	});
}

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
 * Where a picker should render.
 *
 * Every picker used to look up its own field and render into that wrapper.
 * The master/detail shell needs them to render into panes it owns instead —
 * Frappe lays fields out in a vertical stack, so a persistent list-beside-detail
 * surface has to be owned by ONE field's wrapper, with the pickers rendered
 * inside it.
 *
 * Falls back to the field wrapper when no host is given, so every existing
 * caller keeps working unchanged.
 */
const bnd_picker_hosts = {};

function bnd_picker_host(frm, fieldname, host) {
	// REMEMBERED, not threaded. A picker re-renders itself from places that
	// have no idea where it was drawn — applying a preset, setting one value,
	// importing a theme. Passing `host` through every one of those call sites
	// would be the same fact in five places, which is the defect this rework
	// exists to remove; the third caller to forget it would quietly send the
	// picker back to its field wrapper mid-session.
	if (host) bnd_picker_hosts[fieldname] = window.$(host);
	const $remembered = bnd_picker_hosts[fieldname];
	if ($remembered) {
		// Still attached? A shell that was torn down must not capture the
		// picker forever.
		if ($remembered.length && document.body.contains($remembered[0])) return $remembered;
		delete bnd_picker_hosts[fieldname];
	}
	const field = frm.get_field(fieldname);
	return field && field.$wrapper ? field.$wrapper : null;
}

/**
 * (Re)render the desk-layout cards and highlight the current choice.
 * @param {Object} frm - the Theme Settings form.
 */
function bnd_render_layout_picker(frm, host) {
	const $host = bnd_picker_host(frm, "layout_picker", host);
	if (!$host) return;

	const current = frm.doc.desk_layout || "Top Bar";
	// The shared vocabulary, not a parallel one. `bnd-lp-*` duplicated
	// `bnd-cbp-*` rule for rule — same card, same thumb, same blurb, two
	// spellings — and the only differences were unintended: a name one step
	// larger and a grid 10px wider, neither of them a decision anybody made.
	// `bnd-lp-card` survives purely as the click hook.
	const cards = P.cards(
		BND_LAYOUTS.map((l) => ({ value: l.value, name: __(l.value), blurb: l.blurb(), svg: l.svg })),
		{ selected: current, cls: "bnd-cbp-style bnd-lp-card" }
	);

	const toolbar =
		'<div class="bnd-sbp-toolbar">' +
		'<input type="search" class="bnd-sbp-search" placeholder="' + __("Search settings…") + '">' +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-export">' + __("Export") + "</button>" +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-import">' + __("Import") + "</button>" +
		'<span class="bnd-sbp-hint">' + __("Changes apply as you click — there is nothing to save.") + "</span>" +
		"</div>";

	$host.html(P.wrap(cards));

	$host.find(".bnd-lp-card").on("click", function () {
		// `data-value`, not `data-layout`: the shared builder emits one
		// attribute name for every picker, so a handler cannot be written
		// against a spelling only this picker used.
		frm.set_value("desk_layout", this.getAttribute("data-value"));
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
		zone: "placement",
		title: () => __("Pane placement"),
		desc: () => __("How the sidebar sits against the page."),
		options: [
			{ value: "Attached", name: () => __("Attached"), thumb: '<span style="position:absolute;inset-block:0;inset-inline-start:0;inline-size:24px;background:currentColor;opacity:.18"></span>' },
			{ value: "Floating", name: () => __("Floating card"), thumb: bnd_sb_pane("currentColor", "opacity:.18") },
		],
	},
	{
		field: "sidebar_material",
		zone: "pane",
		title: () => __("Pane material"),
		desc: () => __("Glass lets the page glow through; opacity and blur below tune it."),
		options: [
			{ value: "Solid", name: () => __("Solid"), thumb: bnd_sb_pane("currentColor", "opacity:.3") },
			{ value: "Glass", name: () => __("Glass"), thumb: bnd_sb_pane("currentColor", "opacity:.12;outline:1px solid currentColor;outline-offset:-1px") },
		],
	},
	{
		field: "sidebar_color",
		zone: "pane",
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
		zone: "links",
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
		zone: "links",
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
		zone: "links",
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
		zone: "links",
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
		zone: "pane",
		title: () => __("Hue wash"),
		desc: () => __("Each section keeps its own color family; actives take the section hue."),
		options: [
			{ value: "Off", name: () => __("Off"), thumb: '<span class="bnd-sbp-wash" style="background:var(--control-bg)"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:var(--control-bg)"></span>' },
			{ value: "Subtle", name: () => __("Subtle"), thumb: '<span class="bnd-sbp-wash" style="background:#f5f8fd"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:#fdf9f1"></span>' },
			{ value: "Rich", name: () => __("Rich"), thumb: '<span class="bnd-sbp-wash" style="background:#e8f0fc"></span><span class="bnd-sbp-wash" style="inset-block-start:26px;background:#faf0dc"></span>' },
		],
	},
	{
		field: "sidebar_menu_rail",
		zone: "rail",
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
		zone: "rail",
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
		zone: "rail",
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
		zone: "rail",
		title: () => __("Rail button shape"),
		options: [
			{ value: "Circle", name: () => __("Circle"), thumb: '<span class="bnd-sbp-shape" style="border-radius:50%"></span>' },
			{ value: "Square", name: () => __("Square"), thumb: '<span class="bnd-sbp-shape" style="border-radius:4px"></span>' },
			{ value: "Tab", name: () => __("Tab"), thumb: '<span class="bnd-sbp-shape" style="inline-size:9px;block-size:26px;border-radius:0 5px 5px 0;border-inline-start:none"></span>' },
		],
	},
	{
		field: "sidebar_rail_button_icon",
		zone: "rail",
		title: () => __("Rail button icon"),
		options: [
			{ value: "Chevron", name: () => __("Chevron"), thumb: '<span class="bnd-sbp-glyph">›</span>' },
			{ value: "Menu", name: () => __("Menu"), thumb: '<span class="bnd-sbp-glyph">☰</span>' },
			{ value: "Arrows", name: () => __("Arrows"), thumb: '<span class="bnd-sbp-glyph">⇄</span>' },
		],
	},
	{
		field: "sidebar_badges",
		zone: "links",
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
	{ field: "sidebar_glass_opacity", zone: "pane", title: () => __("Glass opacity"), lo: () => __("Airy"), hi: () => __("Dense") },
	{ field: "sidebar_surface_intensity", zone: "pane", title: () => __("Surface intensity"), lo: () => __("Hairline"), hi: () => __("Elevated") },
	{ field: "sidebar_pane_width", zone: "pane", title: () => __("Pane width"), lo: () => __("200px"), hi: () => __("280px") },
];

/** Toggle rows: field + name + one-liner. */
const BND_SB_TOGGLES = [
	{ field: "sidebar_apps_rail", name: () => __("Apps rail"), desc: () => __("A separate slim strip of every app for one-click switching.") },
	{ field: "sidebar_remember_sections", name: () => __("Remember sections"), desc: () => __("Keep each user's opened groups between visits.") },
	{ field: "sidebar_scroll_fades", name: () => __("Scroll fades"), desc: () => __("Overflowing links fade at the edges instead of clipping.") },
];

/** Fetch the preset catalogue once, then render. */
function bnd_render_sidebar_picker(frm, host) {
	const $host = bnd_picker_host(frm, "sidebar_picker", host);
	if (!$host) return;
	if (bnd_sb_catalogue) {
		bnd_render_sidebar_picker_now(frm, host);
		return;
	}
	frappe
		.xcall("bunood_theme.api.get_sidebar_presets")
		.then((data) => {
			bnd_sb_catalogue = data;
			bnd_render_sidebar_picker_now(frm, host);
			// The side pane's note is its PRESET NAME, and deriving that needs
			// this catalogue. Two independent fetches race — the shipped defaults
			// and this one — and whichever lands second leaves the other's work
			// stale. Painting again here is the cheap half of the fix; the marks
			// are idempotent, so the redundant repaint when this wins costs
			// nothing. Without it the note read "Default" on the one entry that
			// has a real preset to name, intermittently, which is the worst kind.
			bnd_shell_marks(frm);
		})
		.catch(() => {
			$host.html('<div class="text-muted">' + __("Could not load sidebar presets.") + "</div>");
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
function bnd_render_sidebar_picker_now(frm, host) {
	const $host = bnd_picker_host(frm, "sidebar_picker", host);
	if (!$host) return;
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

	// Collected BY BAND rather than joined into one string: the side pane has
	// twenty option groups, and one undifferentiated column of them is the wall
	// this split exists to remove.
	const by_zone = {};
	const add = (zone, html) => {
		by_zone[zone] = (by_zone[zone] || "") + html;
	};
	BND_SB_GROUPS.forEach((group) => {
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
		add(group.zone, (
			'<div class="bnd-cbp-group bnd-sbp-group" data-search="' + (group.title() + " " + group.field).toLowerCase() + '">' +
			'<div class="bnd-cbp-title">' + group.title() +
			'<button type="button" class="bnd-cbp-reset bnd-sbp-reset" data-field="' + group.field + '" title="' + __("Reset to preset value") + '">↺</button></div>' +
			(group.desc ? '<div class="bnd-cbp-desc">' + group.desc() + "</div>" : "") +
			'<div class="bnd-sbp-row-wrap">' + cards + "</div></div>"
		));
	});


	BND_SB_STEPPERS.forEach((s) => {
		const current = parseInt(frm.doc[s.field], 10) || (s.field === "sidebar_pane_width" ? 2 : 3);
		const stops = [1, 2, 3, 4, 5]
			.map(
				(n) =>
					'<button type="button" class="bnd-sbp-stop' + (n === current ? " bnd-sbp-on" : "") +
					'" data-field="' + s.field + '" data-value="' + n + '" aria-label="' + n + '"></button>'
			)
			.join("");
		add(s.zone, (
			'<div class="bnd-cbp-group bnd-sbp-group"><div class="bnd-cbp-title">' + s.title() + "</div>" +
			'<div class="bnd-sbp-steps"><span class="bnd-sbp-slab">' + s.lo() + "</span>" + stops +
			'<span class="bnd-sbp-slab">' + s.hi() + "</span></div></div>"
		));
	});

	const blur_group =
		'<div class="bnd-cbp-group bnd-sbp-group"><div class="bnd-cbp-title">' + __("Glass blur") + "</div>" +
		'<div class="bnd-cbp-desc">' + __("Full steps down automatically on weak devices and honors the OS reduce-transparency setting.") + "</div>" +
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
			'<button type="button" class="bnd-cbp-toggle bnd-sbp-toggle" data-field="' + t.field + '" data-value="' + (on ? 0 : 1) + '">' +
			'<span class="bnd-cbp-knob' + (on ? " bnd-cbp-knob-on" : "") + '"></span>' +
			"<span><b>" + t.name() + "</b><br><span class='bnd-sbp-pblurb'>" + t.desc() + "</span></span>" +
			"</button>"
		);
	}).join("");

	const toolbar =
		'<div class="bnd-sbp-toolbar">' +
		'<input type="search" class="bnd-sbp-search" placeholder="' + __("Search settings…") + '">' +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-export">' + __("Export") + "</button>" +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-import">' + __("Import") + "</button>" +
		'<span class="bnd-sbp-hint">' + __("Changes apply as you click — there is nothing to save.") + "</span>" +
		"</div>";

	$host.html(
		'<div class="bnd-sbp">' + toolbar +
			bnd_bands([
				{ zone: "style", html: '<div class="bnd-sbp-presets">' + preset_cards + "</div>" + custom_note },
				{ zone: "placement", html: by_zone.placement },
				// The blur control is authored inline rather than in a table, so
				// its band is stated here. It belongs with the surface it blurs.
				{ zone: "pane", html: (by_zone.pane || "") + blur_group },
				{ zone: "links", html: by_zone.links },
				{ zone: "rail", html: by_zone.rail },
				// The literal `__("Extras")` group this replaces was the same idea
				// hand-rolled, in the second of two pickers that each had their own
				// copy. Both are gone.
				{ zone: "extras", html: '<div class="bnd-cbp-group bnd-sbp-group"><div class="bnd-cbp-switches">' + toggles + "</div></div>" },
			]) +
			"</div>"
	);

	// One delegated pass wires everything; re-render happens on any change.
	$host.find(".bnd-sbp-preset").on("click", function () {
		bnd_sb_apply_preset(frm, this.getAttribute("data-preset"));
	});
	$host.find(".bnd-sbp-opt, .bnd-sbp-stop, .bnd-sbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_sb_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-sbp-export").on("click", () => bnd_sb_export(frm));
	$host.find(".bnd-sbp-import").on("click", () => bnd_sb_import(frm));
	$host.find(".bnd-sbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		const base = bnd_sb_match_preset(frm);
		const source = bnd_sb_catalogue.presets[base] || bnd_sb_catalogue.presets[bnd_sb_catalogue.default];
		bnd_sb_set(frm, f, source[f]);
	});
	$host.find(".bnd-sbp-search").on("input", function () {
		const q = this.value.trim().toLowerCase();
		$host.find(".bnd-sbp-group").each(function () {
			this.style.display = !q || (this.getAttribute("data-search") || "").includes(q) || this.textContent.toLowerCase().includes(q) ? "" : "none";
		});
		// A band whose every group just got filtered out must go too, or the
		// search leaves headings standing over nothing — which reads as a broken
		// filter rather than as no matches. Bands holding no groups at all (the
		// preset cards) are left alone: they have nothing to be filtered.
		$host.find(".bnd-cbp-zone").each(function () {
			const groups = this.querySelectorAll(".bnd-sbp-group");
			if (!groups.length) return;
			const any = [...groups].some((g) => g.style.display !== "none");
			this.style.display = any ? "" : "none";
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
function bnd_render_crumbs_picker(frm, host) {
	const $host = bnd_picker_host(frm, "crumbs_picker", host);
	if (!$host) return;

	const current_style = frm.doc.crumb_style || "Quiet Trail";
	const kit_down = current_style === "Original";

	const style_cards = P.cards(
		BND_CRUMB_STYLES.map((s) => ({ value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg })),
		{ selected: current_style }
	);

	const groups = BND_CRUMB_GROUPS.map((group) => {
		const group_reason = group.disabled ? group.disabled(frm) : "";
		return P.group({
			title: group.title(),
			desc: group.desc(),
			field: group.field,
			off: !!(kit_down || group_reason),
			body: P.options(
				group.options.map((opt) => ({
					value: opt.value,
					name: opt.name(),
					glyph: opt.glyph,
					reason: kit_down
						? __("Original leaves the stock trail")
						: (opt.disabled ? opt.disabled(frm) : "") || group_reason,
				})),
				{ field: group.field, value: frm.doc[group.field] }
			),
		});
	}).join("");

	const toggles = BND_CRUMB_TOGGLES.map((t) =>
		P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason: kit_down ? __("Original leaves the stock trail") : "",
		})
	).join("");

	const note = P.note(
		kit_down
			? __("Original leaves ERPNext's trail untouched — the options below apply to the other styles.")
			: __("Changes apply as you click — there is nothing to save.")
	);

	// Two bands: the style choice and its option groups, then the switches. The
	// literal `P.group({title: __("Extras")})` this replaces was the same idea
	// hand-rolled in one picker — now it is the mechanism, so the sidebar's
	// identical literal goes too and neither can drift from the other.
	$host.html(
		P.wrap(
			bnd_bands([
				{ zone: "style", html: style_cards + note + groups },
				{ zone: "extras", html: '<div class="bnd-cbp-switches">' + toggles + "</div>" },
			])
		)
	);

	$host.find(".bnd-cbp-style").on("click", function () {
		bnd_crumb_set(frm, "crumb_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-cbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_crumb_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
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
function bnd_render_palette_picker(frm, host) {
	const $host = bnd_picker_host(frm, "palette_picker", host);
	if (!$host) return;

	const current_style = frm.doc.palette_style || "Bunood Palette";
	const kit_down = current_style === "Original" || !parseInt(frm.doc.enable_command_palette ?? 1, 10);
	const is_pro = current_style === "Palette Pro";

	const style_cards = P.cards(
		BND_PALETTE_STYLES.map((s) => ({ value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg })),
		{ selected: current_style, cls: "bnd-cbp-style bnd-plp-style" }
	);

	const toggles = BND_PALETTE_TOGGLES.map((t) =>
		P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason: kit_down
				? __("Original leaves the stock modal")
				: t.pro_only && !is_pro
				? __("Palette Pro only")
				: "",
		})
	).join("");

	const note = P.note(
		kit_down
			? __("Original leaves ERPNext's Ctrl+K modal untouched — the options below apply to the other styles.")
			: __("Changes apply on the palette's next open — press Ctrl+K to try it.")
	);

	$host.html(
		P.wrap(
			bnd_bands([
				{ zone: "style", html: style_cards + note },
				{ zone: "extras", html: P.group({
					off: kit_down,
					body:
						'<div class="bnd-cbp-switches">' + toggles + "</div>" +
						'<div class="bnd-cbp-action">' +
						'<button type="button" class="btn btn-xs btn-default bnd-plp-reset-rank">' +
						__("Reset my ranking") + "</button>" +
						'<span class="bnd-cbp-note">' +
						__("Clears what the frecency ranking has learned for your user.") +
						"</span></div>",
				}) },
			])
		)
	);

	$host.find(".bnd-plp-style").on("click", function () {
		bnd_palette_set(frm, "palette_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_palette_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-plp-reset-rank").on("click", () => {
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
function bnd_render_inbox_picker(frm, host) {
	const $host = bnd_picker_host(frm, "inbox_picker", host);
	if (!$host) return;

	const current = frm.doc.inbox_style || "Inbox + Page";
	const kit_down = current === "Original";
	const panel_ours = current === "Bunood Inbox" || current === "Inbox + Page";

	const style_cards = P.cards(
		BND_INBOX_STYLES.map((s) => ({ value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg })),
		{ selected: current, cls: "bnd-cbp-style bnd-ibp-style" }
	);

	const selects = BND_INBOX_SELECTS.map((group) => {
		// The badge survives Refined (the theme owns it either way); the
		// arrival tiering needs our own panel to be meaningful.
		const reason = kit_down
			? __("Original leaves the stock panel")
			: group.field === "inbox_arrival" && !panel_ours
			? __("Needs the Bunood panel")
			: "";
		return P.group({
			title: group.title(),
			desc: group.desc(),
			field: group.field,
			// Preserved deliberately: this picker binds per-group resets and its
			// reset-all separately, and they are told apart by this class.
			resetCls: "bnd-ibp-reset",
			off: !!reason,
			body: P.options(
				group.options.map((opt) => ({ value: opt.value, name: opt.name(), glyph: opt.glyph, reason })),
				{ field: group.field, value: frm.doc[group.field] }
			),
		});
	}).join("");

	const toggles = BND_INBOX_TOGGLES.map((t) =>
		P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			cls: "bnd-ibp-toggle",
			reason: panel_ours ? "" : kit_down ? __("Original leaves the stock panel") : __("Needs the Bunood panel"),
		})
	).join("");

	const note = kit_down
		? '<div class="bnd-cbp-note">' + __("Original leaves ERPNext's panel untouched — including the missing unread badge.") + "</div>"
		: '<div class="bnd-cbp-note">' + __("Changes apply the next time the panel opens — click the bell to try it.") + "</div>";

	$host.html(
		// Wider option tiles than the shared bnd-cbp-opt default: "Approvals
		// only" wrapped to two lines at 96px, pushing its glyph off the row's
		// baseline (item-13 sweep).
		'<div class="bnd-cbp bnd-ibp">' +
			bnd_bands([
				{
					zone: "placement",
					html: bnd_placement_control(
						frm,
						"inbox_placement",
						__("Where the bell sits. Applies on the next page load.")
					),
				},
				{ zone: "style", html: style_cards + note + selects },
				{ zone: "extras", html: P.group({
					// No title: the band names it. No `field` either — this chip
					// resets the whole section and its handler is bound by class
					// alone, so the chip must survive losing the title beside it.
					resetCls: "bnd-ibp-reset-all",
					resetTitle: __("Reset to defaults"),
					off: !panel_ours,
					body: '<div class="bnd-cbp-switches">' + toggles + "</div>",
				}) },
			]) +
			"</div>"
	);

	$host.find(".bnd-ibp-style").on("click", function () {
		bnd_inbox_set(frm, "inbox_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-dgm-slot, .bnd-cbp-opt, .bnd-ibp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_inbox_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-ibp-reset-all").on("click", function (e) {
		e.stopPropagation();
		for (const t of BND_INBOX_TOGGLES) frm.set_value(t.field, BND_INBOX_DEFAULTS[t.field]);
		bnd_inbox_preview(frm);
		bnd_render_inbox_picker(frm);
	});
	$host.find(".bnd-ibp-reset").on("click", function (e) {
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
	"status_clock", "status_interval", "status_freshness", "status_escalate",
];

/** Shipped defaults, for the reset chips. */
const BND_STATUS_DEFAULTS = {
	search_placement: "Top Bar Center", status_style: "Quiet", status_clock: "24 Hour",
	status_interval: "60s", status_segments_jobs: 1, status_segments_errors: 1,
	status_segments_scheduler: 1, status_segments_connection: 1, status_segments_density: 1,
	status_freshness: 1, status_escalate: 0,
};

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
	// Delegates. These rules used to live here in search's own vocabulary, and
	// the bell and the user menu would have needed the same reasoning restated
	// in theirs — three copies of "which regions does this layout actually
	// mount". One copy, keyed by region.
	return bnd_region_blocker(frm, BND_SLOT_REGION[slot] || "");
}

const BND_SEARCH_SLOTS = [
	{ value: "Top Bar Center", blurb: () => __("Centred in the top bar — the modern default.") },
	{ value: "Top Bar Edge", blurb: () => __("At the start of the top bar, beside the page.") },
	{ value: "Sidebar Top", blurb: () => __("ERPNext's own search row, at the top of the sidebar.") },
	{ value: "Sidebar Bottom", blurb: () => __("The same row, pinned to the sidebar's foot.") },
	{ value: "Bottom Bar Center", blurb: () => __("Centred in the bottom strip, beside the status signals.") },
	{ value: "Bottom Bar Edge", blurb: () => __("At the start of the bottom strip.") },
];

/**
 * The user menu's placement.
 *
 * Its own picker because the user menu is its own component — `registry.py` has
 * always said so, and it is the one marked `critical`: lose every route to it
 * and there is no log out, no theme switch, no session defaults. It shared the
 * notifications section only because the two were built by one commit.
 */
function bnd_render_user_picker(frm, host) {
	const $host = bnd_picker_host(frm, "user_picker", host);
	if (!$host) return;

	$host.html(
		P.wrap(
			bnd_bands([
				{
					zone: "placement",
					html: bnd_placement_control(
						frm,
						"user_placement",
						__("Where the avatar and its menu sit. Applies on the next page load.")
					),
				},
			])
		)
	);
	$host.find(".bnd-dgm-slot, .bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_inbox_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
}

/**
 * Home and All Apps — one diagram each.
 *
 * They shared a single setting until slice 2, which meant a sidebar STYLE
 * preset decided where both lived and neither could move without the other.
 * Two controls, because `registry.py` has always described two components.
 */
function bnd_render_links_picker(frm, host) {
	const $host = bnd_picker_host(frm, "links_picker", host);
	if (!$host) return;

	const one = (field, label) =>
		P.group({
			title: label,
			field: field,
			body: bnd_desk_diagram({
				field: field,
				// Sidebar Top and Sidebar Bottom are kept as distinct slots: the
				// old field had them, and collapsing both to "Side Pane" would
				// silently move every site that chose the bottom.
				slots: ["Sidebar Top", "Sidebar Bottom", "Top Bar", "Bottom Bar"],
				value: frm.doc[field] || "Sidebar Top",
				blocker: (slot) => bnd_region_blocker(frm, BND_SLOT_REGION[slot] || ""),
			}) +
				P.options([{ value: "Off", name: __("Off — not shown") }], {
					field: field,
					value: frm.doc[field] || "Sidebar Top",
				}),
		});

	$host.html(
		P.wrap(
			bnd_bands([
				{
					zone: "placement",
					html:
						one("home_placement", __("Home")) +
						one("apps_placement", __("All Apps")) +
						P.note(__("Two links, placed independently. Applies on the next page load.")),
				},
			])
		)
	);
	$host.find(".bnd-dgm-slot, .bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_inbox_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		bnd_inbox_set(frm, this.getAttribute("data-field"), "Sidebar Top");
	});
}

/** Render the search-placement picker. */
function bnd_render_search_picker(frm, host) {
	const $host = bnd_picker_host(frm, "search_picker", host);
	if (!$host) return;
	const current = frm.doc.search_placement || "Top Bar Center";

	// One diagram of the desk, six slots on it — replacing six hand-drawn
	// thumbnails of the same desk that each had to stay truthful on their own.
	const diagram = bnd_desk_diagram({
		field: "search_placement",
		slots: BND_SEARCH_SLOTS.map((s) => s.value),
		value: current,
		blocker: (label) => bnd_search_slot_blocker(frm, label),
	});

	// One band, so `bnd_bands` prints no heading at all and this renders exactly
	// as it did before. Marked anyway: search IS the placement control, and when
	// step 3's desk diagram gives the bell and the user menu one too, they join
	// this band rather than needing the picker restructured.
	$host.html(
		P.wrap(
			bnd_bands([
				{
					zone: "placement",
					html:
						diagram +
						P.note(
							__("Where the search field lives, independent of the desk layout. Applies on the next page load.")
						),
				},
			])
		)
	);
	$host.find(".bnd-dgm-slot").on("click", function () {
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
		blurb: () =>
			__("No status bar at all, and the page takes the space back. The Bottom Bar layout keeps its strip — that one carries notifications and your profile."),
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
];

/** Render the status bar picker. */
function bnd_render_status_picker(frm, host) {
	const $host = bnd_picker_host(frm, "status_picker", host);
	if (!$host) return;
	const current = frm.doc.status_style || "Quiet";
	const off = current === "Off";
	const minimal = current === "Minimal";

	const cards = P.cards(
		BND_STATUS_STYLES.map((s) => ({ value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg })),
		{ selected: current, cls: "bnd-cbp-style bnd-stp-style" }
	);

	const selects = BND_STATUS_SELECTS.map((g) => {
		// Minimal makes no server calls, so a refresh interval is moot.
		const reason = off
			? __("The bar is off")
			: minimal && g.field === "status_interval"
			? __("Minimal polls nothing")
			: "";
		return P.group({
			title: g.title(),
			desc: g.desc(),
			field: g.field,
			off: !!reason,
			body: P.options(
				g.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: g.field, value: frm.doc[g.field] }
			),
		});
	}).join("");

	const SIGNALS = ["status_segments_jobs", "status_segments_errors", "status_segments_scheduler", "status_freshness"];
	const toggles = BND_STATUS_TOGGLES.map((t) => {
		const reason = off
			? __("The bar is off")
			: minimal && SIGNALS.indexOf(t.field) !== -1
			? __("Minimal shows no live signals")
			: "";
		return P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason,
		});
	}).join("");

	$host.html(
		'<div class="bnd-cbp bnd-stp">' +
			bnd_bands([
				{ zone: "style", html: cards + P.note(__("Applies on the next page load.")) + selects },
				{ zone: "extras", html: P.group({
					off,
					body: '<div class="bnd-cbp-switches">' + toggles + "</div>",
				}) },
			]) +
			"</div>"
	);

	$host.find(".bnd-stp-style").on("click", function () {
		bnd_status_set(frm, "status_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-stp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_status_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-stp-reset").on("click", function (e) {
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
