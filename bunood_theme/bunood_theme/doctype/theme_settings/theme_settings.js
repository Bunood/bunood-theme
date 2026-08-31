// Copyright (c) 2026, Bunood and contributors
// For license information, please see license.txt
/**
 * Theme Settings form script — the visual pickers.
 *
 * ONE PICKER PER COMPONENT LIVES HERE (items 9-36)
 *   The `refresh` hook's render calls ARE the list — it started at seven and
 *   is now twenty-six, which is why this no longer counts them. Each writes
 *   hidden fields; none of them is a control the user types into.
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
					// `reason` disables the card with the reason as its tooltip —
					// the same contract P.options has always had. Added in item 35's
					// review: the print picker passed `reason` for a server-unknown
					// preset and this function silently dropped the key, so the
					// claimed drift guard did not exist.
					(i) =>
						'<button type="button" class="' + cls + (i.value === opts.selected ? " bnd-cbp-on" : "") +
						(i.reason ? " bnd-cbp-dis" : "") +
						'" aria-pressed="' + (i.value === opts.selected ? "true" : "false") +
						'" data-value="' + bnd_esc(i.value) +
						(i.reason ? '" disabled title="' + bnd_esc(i.reason) : "") + '">' +
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
						' aria-pressed="' + (on ? "true" : "false") + '"' +
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
			// A switch, and it says so: the knob class styles the state, the
			// attribute pair announces it. Every picker's switches route
			// through this one builder, which is why the fix is one line and
			// not eight.
			' role="switch" aria-checked="' + (on ? "true" : "false") + '"' +
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
				  ' aria-label="' + bnd_esc(g.resetTitle || __("Reset to default")) +
				  '" title="' + bnd_esc(g.resetTitle || __("Reset to default")) + '"><span aria-hidden="true">↺</span></button>'
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

/**
 * Slot label -> the rectangle it occupies, DERIVED.
 *
 * Two hand-written tables used to live here — one of rectangles, one of
 * regions — both keyed by whole placement labels. E1 changed those labels and
 * they were missed, so every new value ("Top Bar End", "Side Pane Start")
 * looked up `undefined`, and `bnd_desk_diagram` drops a slot whose geometry is
 * missing (`if (!g) return ""`). The picker would have rendered with the
 * chosen slot simply absent.
 *
 * A label is a region and a zone, so the rectangle is a region's box and the
 * zone's share of it. Deriving means the tables cannot be the thing that is
 * out of date again: a slot the registry starts offering draws itself.
 *
 * A bar divides along its LENGTH and the pane divides down its HEIGHT, which
 * is what start/end mean on each axis — the same reasoning `sb_zone_anchor`
 * follows in bunood.js, and the reason the vocabulary is logical rather than
 * left/right.
 */
const BND_REGION_BY_LABEL = {
	"Top Bar": "topbar",
	"Bottom Bar": "bottombar",
	"Page Header": "pagehead",
	"Side Pane": "sidepane",
	Dock: "dock",
};

/** "Top Bar End" -> { region: "topbar", zone: "end" }. Mirrors registry.parse_slot. */
function bnd_parse_slot(label) {
	if (!label || label === "Off") return { region: "", zone: "" };
	for (const [name, region] of Object.entries(BND_REGION_BY_LABEL)) {
		// A bare region is pre-E1 and means the trailing end, which is where
		// those values measured. Kept for a form opened before a migration.
		if (label === name) return { region, zone: "end" };
		if (label.startsWith(name + " ")) {
			const zone = label.slice(name.length + 1).toLowerCase();
			return { region, zone: ["start", "center", "end"].includes(zone) ? zone : "end" };
		}
	}
	return { region: "", zone: "" };
}

/** Which desk region a placement label resolves to, for availability. */
function bnd_slot_region(label) {
	return bnd_parse_slot(label).region;
}

/** The rectangle a placement label occupies in the 300x180 diagram. */
function bnd_slot_geom(label) {
	const { region, zone } = bnd_parse_slot(label);
	const box = BND_DESK_GEOM[region];
	if (!box) return null;
	const inset = 3;
	if (region === "sidepane") {
		// A column: the zones are bands down its height. Two of them, because
		// the pane has two — see registry.ZONES_BY_REGION.
		const h = 30;
		return {
			x: box.x + inset,
			y: zone === "end" ? box.y + box.h - h - inset : box.y + inset,
			w: box.w - inset * 2,
			h: h,
		};
	}
	// A bar: thirds along its length, so the diagram shows the same three
	// places the desk has.
	const w = Math.round((box.w - inset * 2) / 3);
	const lead = box.x + inset;
	const x = zone === "center" ? lead + w : zone === "end" ? lead + w * 2 : lead;
	return { x: x, y: box.y + inset, w: w, h: box.h - inset * 2 };
}

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

/**
 * Why nothing this component offers can take effect — "" when it can.
 *
 * THE COUNTERPART TO `bnd_region_blocker`, and the gap the honest-picker audit
 * was named for. That function answers "can a tenant go HERE"; nothing
 * answered "does any of this matter at all right now". The container split
 * created the question: switch the side pane off and all 22 sidebar style
 * options are inert, switch the bottom bar off and every status option is —
 * and both kept offering themselves as though they were live.
 *
 * The status picker had a reason string for exactly this and it had gone dead:
 * it tested `status_style === "Off"`, an option removed when the bottom bar
 * became a container, so the condition could never be true again. A control
 * that explains itself only in a state that can no longer occur is worse than
 * one that never did — it reads as covered.
 *
 * WARNS, NEVER BLOCKS, the same rule `bnd_region_blocker` follows: the value
 * is still stored and still correct the moment the container comes back, and
 * greying a choice out with no explanation tells a user less than nothing.
 */
function bnd_component_blocker(frm, key) {
	const on = (field, dflt) => parseInt(frm.doc[field] ?? dflt, 10);
	if (key === "sidepane" && !on("sidebar_enabled", 1)) {
		return __("the side pane is switched off");
	}
	if (key === "status" && !on("bottombar_enabled", 1)) {
		return __("the bottom bar is switched off");
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
			const g = bnd_slot_geom(label);
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
 * What a placement picker may offer: the FIELD'S OWN OPTIONS.
 *
 * NOT a list written here. Every picker in this file used to carry its own,
 * and E1 changed the vocabulary underneath all of them at once — the bell's
 * picker still offered bare "Top Bar", search still offered "Sidebar Top", and
 * clicking either WROTE that value into a field that no longer accepts it.
 * Theme Settings is a Single, so Frappe then failed validation for the whole
 * document and every other setting stopped saving with it.
 *
 * The doctype's options are generated from `registry.slots_for`, so reading
 * them here makes the form and the desk the same list by construction. A slot
 * the registry adds appears in the picker with no edit; one it retires
 * disappears from it. "Off" is excluded because it is drawn as a chip beside
 * the diagram, not as a place on the desk.
 */
function bnd_field_slots(frm, field) {
	// META FIRST, and the order matters. `frm.fields_dict[field].df.options` is
	// whatever the form layer last put there, and for a Select that is not
	// reliably the newline string the doctype stores — it can already be a list
	// of {value, label}. Read as a string, a list stringifies to one
	// comma-joined line, every "slot" fails `bnd_slot_geom`, and the diagram
	// draws NOTHING: `.bnd-dgm-slot` never appears and the picker is an empty
	// box. Meta is the doctype's own copy and is always the string.
	const meta_df =
		(frappe.meta &&
			frappe.meta.get_docfield("Theme Settings", field, frm && frm.doc && frm.doc.name)) ||
		null;
	const form_df = frm && frm.fields_dict && frm.fields_dict[field] && frm.fields_dict[field].df;
	const options = (meta_df && meta_df.options) || (form_df && form_df.options) || "";
	const list = Array.isArray(options) ? options : String(options).split(/\r?\n/);
	return list
		.map((v) => (v && typeof v === "object" ? v.value : v) || "")
		.map((v) => String(v).trim())
		.filter((v) => v && v !== "Off");
}

/** The value a picker shows when the field is empty: the first slot it offers. */
function bnd_field_first_slot(frm, field) {
	return bnd_field_slots(frm, field)[0] || "";
}

/**
 * The placement control for a tenant that takes a whole region.
 *
 * `Off` is rendered as a chip beside the diagram rather than as a slot on it,
 * because "not shown" is not a place on the desk. Drawing it as a region would
 * make the picture claim there is somewhere the bell goes when it is off.
 */
function bnd_placement_control(frm, field, note) {
	const current = frm.doc[field] || bnd_field_first_slot(frm, field);
	return (
		bnd_desk_diagram({
			field: field,
			slots: bnd_field_slots(frm, field),
			value: current,
			blocker: (label) => bnd_region_blocker(frm, bnd_slot_region(label)),
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
 *   The side pane is not one of them: it has more option groups than any
 *   other picker, so a single
 *   "Style" band there would be a longer wall than the split exists to remove.
 *   `pane` / `links` / `rail` divide it where its own settings already divide —
 *   the surface, what sits on it, and the collapsed rail. A longer vocabulary
 *   where the data earns it, not a second mechanism.
 *
 * WHY `placement` IS USUALLY EMPTY, AND THAT IS CORRECT
 *   A band renders only when it has content. `inbox_placement` and
 *   `user_placement` DO have controls now (the inbox and user pickers, and the
 *   placement board) — the docblock said they appeared "zero times" through the
 *   phase-0 rework and item 36 corrected it — but most pickers still carry no
 *   placement band, and the empty-band-renders-nothing rule is what keeps that
 *   from showing as a blank heading.
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

/**
 * Remember the document as the server last agreed it was.
 *
 * Only the fields this app owns. `name`, `modified`, `docstatus` and the rest
 * of Frappe's bookkeeping must always come from the server — re-applying a
 * stale `modified` is how a merge becomes a conflict.
 */
function bnd_snapshot(frm) {
	const clean = {};
	for (const df of frm.meta.fields) {
		if (["Section Break", "Column Break", "Tab Break", "HTML"].includes(df.fieldtype)) continue;
		clean[df.fieldname] = frm.doc[df.fieldname];
	}
	frm.__bnd_clean = clean;
}

/** The fields THIS edit changed — never the whole document. */
function bnd_changed_since_clean(frm) {
	const clean = frm.__bnd_clean;
	if (!clean) return {};
	const out = {};
	for (const key of Object.keys(clean)) {
		if (String(frm.doc[key] ?? "") !== String(clean[key] ?? "")) out[key] = frm.doc[key];
	}
	return out;
}

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
	// The snapshot is refreshed on EVERY refresh, dirty or not — a refresh
	// follows every successful save and every reload, which are exactly the
	// moments the document and the server agree. Without it there is no way to
	// tell a field this edit changed from a field somebody else changed, and
	// "merge" degenerates into "overwrite everything".
	if (!frm.is_dirty()) bnd_snapshot(frm);
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
	// Captured BEFORE the attempt: a retry has to reload first, and a reload
	// replaces `frm.doc` — taking the user's click with it.
	const mine = bnd_changed_since_clean(frm);

	// DIRTY WITH AN EMPTY DIFF IS A FABRICATED STATE, AND IT IS HEALED HERE.
	// The snapshot spans every meta field, so an empty diff means the document
	// matches what the server last agreed to — there is nothing to save, and a
	// dirty flag over nothing is a flag somebody set by hand. The one hand was
	// `bnd_merge_and_retry`'s give-up branch (fixed alongside this), and the
	// wedge it produced was measured live on 2026-08-08: form dirty for
	// minutes, diff empty, timestamps agreeing, `frm.save()` resolving without
	// effect — and every later click in the pane timing out behind it. Clearing
	// the flag is the honest action: it makes "dirty" mean "a diff exists"
	// again, whoever fabricates it next.
	if (!Object.keys(mine).length) {
		frm.doc.__unsaved = 0;
		if (frm.refresh_header) frm.refresh_header();
		return;
	}

	// FRAPPE RESOLVES ITS SAVE PROMISE EVEN WHEN THE SAVE WAS REFUSED.
	// Measured 2026-08-08: with the document changed underneath it, `frm.save()`
	// settled "resolved", the value never reached the database, and the form
	// stayed dirty. So `.catch()` is not the failure signal and a retry hung off
	// it never ran. `modified` is: a save that took brings a new one back from
	// the server, and a save that did not leaves it exactly where it was.
	const modified_before = frm.doc.modified;

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
			if (frm.doc.modified === modified_before) {
				// It did not take. Almost always the document changed
				// underneath us; see bnd_merge_and_retry.
				return bnd_merge_and_retry(frm, mine);
			}
			bnd_snapshot(frm);
			// A click that landed WHILE this save was in flight left the form
			// dirty again. Re-arm — this is what makes the last click the one
			// that ends up stored.
			if (frm.is_dirty()) bnd_schedule_autosave(frm);
		})
		.catch(() => bnd_merge_and_retry(frm, mine));
}

/** How long to wait before the single retry — long enough for the other writer. */
const BND_RETRY_MS = 700;

/**
 * A save was refused. Reload, re-apply ONLY what this edit changed, save again.
 *
 * WHY THIS IS NEEDED AT ALL
 *   Saving a Frappe SINGLE writes the whole document: `Document.update_single`
 *   deletes every `tabSingles` row and re-inserts them. So a click on Theme
 *   Settings rewrites every field, and anything else that wrote the Single
 *   since this form loaded is either overwritten silently, or collides —
 *   MySQL 1020, "Record has changed since last read... try restarting
 *   transaction", which Frappe returns as a 417 and the click disappears.
 *
 *   Autosave turned that from theoretical into routine: every click is a write.
 *   Measured 2026-08-08 — four conflicts in one hour, and it made full suite
 *   runs non-deterministic (20/15/12/9/28/12 failures, different sets, on the
 *   PUSHED commit as well as the working tree).
 *
 * WHY ONLY THE CHANGED FIELDS
 *   The first attempt at this re-applied every field the app owns and was
 *   WORSE — it turned a lost click into a lost document, overwriting
 *   everything the other writer had just stored (failures went 12 -> 28). The
 *   reload brings their work in; re-applying only this edit's diff leaves it
 *   there. Last-write-wins per FIELD, not per document, which is the smallest
 *   claim that still honours the click.
 *
 * ONCE, NEVER IN A LOOP. A failure that is not transient has to surface: the
 * form stays dirty and Frappe's own error stands, with the Save button as the
 * manual fallback. A form that reports itself saved when it is not is the one
 * failure worse than a visible error.
 */
function bnd_merge_and_retry(frm, mine) {
	// NOTHING TO DEFEND, NOTHING TO FABRICATE. This branch used to set
	// `__unsaved = 1` for an empty `mine` too, and that flag is a lie with
	// consequences: dirty with an empty diff is a state no save can clear
	// (there is nothing to send) and autosave rightly declines, so the form
	// reads "Not Saved" forever and every later check that waits on a clean
	// form times out behind it — the settings sweep lost a whole pane to it,
	// measured 2026-08-08.
	if (!Object.keys(mine || {}).length) return;
	if (frm.__bnd_retrying) {
		// A real unsaved edit exists but a retry is already in flight. Mark it
		// AND come back — marking alone parked the edit on a flag nothing was
		// scheduled to act on.
		frm.doc.__unsaved = 1;
		bnd_schedule_autosave(frm);
		return;
	}
	frm.__bnd_retrying = true;
	setTimeout(() => {
		frm.reload_doc()
			.then(() => {
				// The reload brought the other writer's document. Lay only this
				// edit's fields on top of it.
				for (const [key, value] of Object.entries(mine)) frm.doc[key] = value;
				frm.doc.__unsaved = 1;
				return frm.save();
			})
			.then(() => bnd_snapshot(frm))
			.catch(() => {
				frm.doc.__unsaved = 1;
			})
			.finally(() => {
				frm.__bnd_retrying = false;
			});
	}, BND_RETRY_MS);
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
		// THE LAYOUT IS A PRESET, AND ITS FIELD IS NOW A RECORD OF ONE (item 36).
		// The "read-only for one release so support can still see what a site
		// was" that stood here expired many releases ago; the picker's derived
		// label (`bnd_match_layout`) has said what the desk actually IS since
		// the last container landed, and the Overview reads it too.
		//
		// HIDDEN, NOT DELETED, and the reason is a live consumer the retirement
		// plan had missed: boot still serves this name and `bunood.js` stamps
		// `data-bnd-layout` from it, which a dozen `_layouts.scss` rules
		// position panels by. Deleting the field today would leave a CUSTOM
		// desk — containers matching no preset — with nothing to stamp, i.e. a
		// silent rendering change on exactly the sites that diverged. The
		// honest sequence is to finish phase 0's own direction first (re-key
		// those rules to container OUTCOMES, as `data-bnd-topbar` already was),
		// then delete. Filed; this hides the control so nobody sets it by hand
		// in the meantime, while the stored value keeps the desk rendering and
		// stays queryable for support.
		bnd_render_theme_picker(frm);
		bnd_render_layout_picker(frm);
		bnd_render_sidebar_picker(frm);
		bnd_render_crumbs_picker(frm);
		bnd_render_palette_picker(frm);
		bnd_render_inbox_picker(frm);
		bnd_render_search_picker(frm);
		bnd_render_status_picker(frm);
		bnd_render_list_picker(frm);
		bnd_render_form_picker(frm);
		bnd_render_workspace_picker(frm);
		bnd_render_chart_picker(frm);
		bnd_render_report_picker(frm);
		bnd_render_views_picker(frm);
		bnd_render_overlay_picker(frm);
		bnd_render_empty_picker(frm);
		bnd_render_skeleton_picker(frm);
		bnd_render_filters_picker(frm);
		bnd_render_login_picker(frm);
		bnd_render_web_picker(frm);
		bnd_render_email_picker(frm);
		bnd_render_print_picker(frm);
		bnd_render_icons_picker(frm);
		bnd_render_identity_picker(frm);
		bnd_render_user_picker(frm);
		bnd_render_links_picker(frm);
		bnd_render_placement_board(frm);
		// AFTER the pickers, never before: the shell relocates the sections they
		// were just drawn into, and moving a node the renderer is about to look
		// for is how the host resolver ends up pointing at a detached wrapper.
		bnd_shell_setup(frm);
		// Re-apply the FORM's values to the desk on every refresh: after a
		// reload/discard this reverts any live preview to the stored state
		// (on first open it re-applies what boot already applied — harmless).
		setTimeout(() => {
			bnd_all_previews(frm);
		}, 300);
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
	// The phone-bar toggles (item 24): re-apply on click like every kit.
	mobile_inbox: bnd_mobile_changed,
	mobile_user: bnd_mobile_changed,
	mobile_apps: bnd_mobile_changed,
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
 * A phone-bar toggle changed (item 24): apply it to the live desk. All three go
 * every time, same reason chrome_apply gets all five — it rebuilds from the
 * whole picture. Visible only when the window is actually narrow; at the desktop
 * width the form is viewed at, it keeps the state current for the next resize.
 */
function bnd_mobile_changed(frm) {
	if (window.bunood_theme && typeof window.bunood_theme.mobile_apply === "function") {
		window.bunood_theme.mobile_apply({
			mobile_inbox: frm.doc.mobile_inbox,
			mobile_user: frm.doc.mobile_user,
			mobile_apps: frm.doc.mobile_apps,
		});
	}
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
	// The side pane's own picker joins them (item 36's picker audit): toggling
	// "Show the side pane" left its option groups offering themselves as
	// live over a pane that no longer existed, and the kit-off note never
	// appeared — the same staleness this function exists to prevent, for the
	// one picker it had omitted. The CATALOGUE-SAFE wrapper, never
	// `bnd_render_sidebar_picker_now`, which destructures the fetched
	// catalogue and throws if the call has not landed.
	bnd_render_sidebar_picker(frm);
	bnd_render_placement_board(frm);
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
			// Renders rather than relocating, like Translations below: it owns no
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
			{ key: "sidepane", label: () => __("Side pane"), anchors: ["sidebar_picker"] },
			{ key: "dock", label: () => __("Dock"), anchors: ["dock_enabled"] },
			{ key: "status", label: () => __("Bottom bar"), anchors: ["bottombar_enabled"] },
			{ key: "search", label: () => __("Search"), anchors: ["search_picker"] },
			// The phone bar (item 24): what the bottom bar carries below 768px.
			// Sits with the bars because that is what it configures; its three
			// toggles relocate here from section_mobile.
			{ key: "mobile", label: () => __("Mobile bar"), anchors: ["mobile_inbox"] },
		],
	},
	{
		group: () => __("Controls"),
		items: [
			// FIRST in the group, because it is the one that answers "where does
			// everything live" — the per-component pickers below it answer the
			// same question five times, each for one control.
			{ key: "placement", label: () => __("Placement"), anchors: ["placement_board"] },
			{ key: "inbox", label: () => __("Notifications"), anchors: ["inbox_style"] },
			{ key: "user", label: () => __("User menu"), anchors: ["user_picker"] },
			{ key: "links", label: () => __("Home & All Apps"), anchors: ["links_picker"] },
			// `palette_enabled` now sits with its seven siblings in
			// section_palette, so one anchor reaches the whole component. It used
			// to live three sections away, and anchoring it here claimed the
			// section that also held `density_default` — which left a stranded
			// "Features" heading over nothing and evicted the density control.
			{ key: "palette", label: () => __("Command palette"), anchors: ["palette_style"] },
			{ key: "crumbs", label: () => __("Breadcrumbs"), anchors: ["crumb_style"] },
			{ key: "list", label: () => __("List view"), anchors: ["list_style"] },
			{ key: "form", label: () => __("Form view"), anchors: ["form_style"] },
			{ key: "workspace", label: () => __("Workspace"), anchors: ["workspace_style"] },
			{ key: "chart", label: () => __("Charts"), anchors: ["chart_grid"] },
			{ key: "report", label: () => __("Data tables"), anchors: ["report_style"] },
			{ key: "views", label: () => __("Alternate views"), anchors: ["views_style"] },
			{ key: "overlay", label: () => __("Overlays"), anchors: ["overlay_style"] },
			{ key: "empty", label: () => __("Empty states"), anchors: ["empty_style"] },
			{ key: "skeleton", label: () => __("Loading"), anchors: ["skeleton_style"] },
			{ key: "filters", label: () => __("Filters"), anchors: ["filters_style"] },
			// Item 32. The only entry here whose surface is NOT on the desk — it
			// dresses /login and /update-password, which an authenticated admin
			// cannot even load (www/login.py redirects any session to /desk). So
			// this pane shows a specimen and never a live preview, and the shell's
			// change dot is the only feedback a click gives.
			{ key: "login", label: () => __("Sign In"), anchors: ["login_style"] },
			// Item 33, and the second entry here whose surface is not on the desk.
			// Unlike Sign In an admin CAN load these pages, so the missing live
			// preview needs a different argument — the picker's docblock makes it.
			{ key: "web", label: () => __("Website & Portal"), anchors: ["web_style"] },
			{ key: "email", label: () => __("Email"), anchors: ["email_style"] },
			{ key: "print", label: () => __("Print"), anchors: ["print_header_style"] },
		],
	},
	{
		// ITEM 36, THE USER'S MAP 1: identity is ONE page in its own group —
		// name, logo, favicon, tagline AND the colour seeds together. The
		// Directus co-location (its Appearance page holds colour + logos +
		// favicon on one surface) extended with the name, because at this scale
		// (four identity fields, four seeds) a split page just separates the
		// specimen from half its inputs. The entry anchors THREE sections:
		// branding, colours, and the generated stylesheet line — brand_css_url
		// belongs beside the seeds that produce it, not in a "Generated"
		// section at the bottom of the form where nobody connects the two.
		group: () => __("Identity"),
		items: [
			{
				key: "identity",
				label: () => __("Identity"),
				anchors: ["company_name", "brand_color", "brand_css_url"],
			},
		],
	},
	{
		group: () => __("Appearance"),
		items: [
			// ITEM 37, AND IT LEADS THE GROUP because it is the control that answers
			// "what does this desk look like" in one gesture. The entries under it
			// are the axes a look composes from. The Layout preset below KEEPS its
			// picker — the five layouts stay one click away — but it no longer stores
			// a name: it writes the containers and derives its highlight from them,
			// which is what a preset is supposed to do.
			{ key: "theme", label: () => __("Theme"), anchors: ["theme_picker"] },
			{ key: "layout", label: () => __("Layout preset"), anchors: ["layout_picker"] },
			// Icons (item 23): an axis, beside Colours and Density. Anchored on its
			// own picker like every other kit; the relocated Selects sit hidden
			// behind the card picker's controls.
			{ key: "icons", label: () => __("Icons"), anchors: ["icons_picker"] },
			// `density_default` has its own section as of the shell work. It used
			// to share `section_features` with `palette_enabled`, and the
			// fallback that handles a twice-claimed section handled it — but only
			// by moving a bare $wrapper out of `.form-column > form`, which severs
			// the direct-descendant chain Frappe caps input width with
			// (form.scss `.form-column.col-sm-12 > form > .input-max-width`).
			// Measured: 636px against every other Select's 273px. The fallback is
			// still there for the next collision; this one is fixed at the root.
			{ key: "density", label: () => __("Density"), anchors: ["density_default"] },
			// Item 38. Not a look but a POLICY about looks: which axes a person
			// may decide for themselves. It sits under Appearance because that is
			// what it governs, and the three Checks are visible rather than
			// picker-driven — the same shape the container toggles use, and one
			// fewer surface to keep truthful.
			{ key: "personal", label: () => __("Personalization"), anchors: ["personal_look"] },
		],
	},
	{
		group: () => __("Language"),
		items: [
			// Item 36, the user's direction: language and fonts move out of the
			// Colours pane into their own place beside Translation. The Arabic
			// face is the entry's whole surface today; the section is where any
			// later language-shaped field lands.
			{ key: "fonts", label: () => __("Language & Fonts"), anchors: ["arabic_font"] },
			// Renders rather than relocating, like the overview: the surface's
			// state lives in its own doctypes (Bunood Translation Settings /
			// Scan / Proposal), not in Theme Settings fields — which is what
			// keeps the FIELD_PREFIXES guard out of a feature that is not a
			// desk component.
			{ key: "translations", label: () => __("Translations"), render: bnd_render_translations },
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
//: The other half of a layout: where the tenants go (item 36's picker audit).
//: `registry.LAYOUT_TENANTS`, served beside the chrome because a layout is
//: BOTH — every card's blurb names where search, the bell and the profile sit.
let bnd_layout_tenants = null;
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
 * Entries listed by explicit `fields` are either axes that carry no prefix by
 * design — identity and fonts, which `build.mjs`'s FIELD_EXCEPTIONS says
 * exactly that about — or views over fields another entry also owns (the
 * board, the layout preset), where both claims are true.
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
	// The board OWNS the five placement fields it draws — deliberately the
	// same fields the four entries around it own. It is a second view over one
	// state, so a moved bell lights both its dot and the bell's: both claims
	// are true, and a silent board over changed placements would be the lie.
	placement: {
		fields: [
			"search_placement",
			"inbox_placement",
			"user_placement",
			"home_placement",
			"apps_placement",
			"desk_order",
		],
	},
	// The container and the content it shows are one entry: "is there a bar"
	// and "what does it say" are the same component to a reader, even though the
	// split deliberately made them two fields.
	status: { prefixes: ["status_", "bottombar_"] },
	search: { prefixes: ["search_"] },
	crumbs: { prefixes: ["crumb_"] },
	list: { prefixes: ["list_"] },
	form: { prefixes: ["form_"] },
	workspace: { prefixes: ["workspace_"] },
	chart: { prefixes: ["chart_"] },
	report: { prefixes: ["report_"] },
	views: { prefixes: ["views_"] },
	overlay: { prefixes: ["overlay_"] },
	empty: { prefixes: ["empty_"] },
	skeleton: { prefixes: ["skeleton_"] },
	filters: { prefixes: ["filters_"] },
	login: { prefixes: ["login_"] },
	web: { prefixes: ["web_"] },
	email: { prefixes: ["email_"] },
	print: { prefixes: ["print_"] },
	palette: { prefixes: ["palette_"], fields: ["palette_enabled"] },
	// The Layout entry owns the five container toggles it WRITES, not the
	// stored preset name (item 36). A preset that writes values and stops
	// existing has nothing of its own to be "changed" about; what the entry can
	// honestly answer for is the desk it produced. Deliberately the same fields
	// the five container entries own — the placement board set that precedent:
	// a second view over one state means both dots light, and both claims are
	// true. The stored `desk_layout` is GONE as of item 37 — it was a hidden
	// record of the last preset applied, and there was nothing for a dot on it
	// to mean. The containers it wrote are the state, and they are what this
	// entry owns.
	layout: { fields: ["topbar_enabled", "pagehead_enabled", "dock_enabled", "sidebar_enabled", "bottombar_enabled"] },
	// Map 1 (item 36): one Identity page owns the name, the marks, the tagline
	// AND the seeds. `brand_css_url` shares the pane and stays deliberately
	// UNOWNED: it is a generated artefact that changes on every colour save,
	// so a dot on it would light beside every seed change and mean nothing.
	identity: {
		fields: [
			"company_name", "logo", "favicon", "tagline",
			"brand_color", "accent_color", "brand_color_dark", "accent_color_dark",
		],
	},
	// `arabic_font` was the only visible, user-editable Select in the whole
	// form that NO entry owned (item 36 gave it one in the Colours pane, then
	// Map 1 moved it here with the field's own section).
	fonts: { fields: ["arabic_font"] },
	// The Icons axis owns every icon_* field by prefix — the same rule the
	// components use, and why build.mjs earns the prefix (item 23).
	icons: { prefixes: ["icon_"] },
	density: { fields: ["density_default"] },
	// Prefix rather than fields: the axis is `personal_*` and every field it
	// grows belongs to this pane by construction (item 38).
	personal: { prefixes: ["personal_"] },
	// The phone bar (item 24): the three mobile_* toggles by prefix.
	mobile: { prefixes: ["mobile_"] },
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
 *   sidepane  — `SIDEBAR_PRESETS`, every field in `presets.SIDEBAR_FIELDS`,
 *               matched since item 10.
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
	// THE THEME ENTRY OWNS NO FIELDS OF ITS OWN — it writes other entries'. So it
	// is answered BEFORE the ownership guard below, which would otherwise send it
	// down the "no state to report" path and print nothing under the one control
	// with the largest catalogue on the page. What it can honestly report is
	// which shipped look the desk currently IS, which is a comparison rather than
	// a field it holds. Falls through while the catalogue is still in flight, and
	// the fetch repaints the marks when it lands — the side pane's note learned
	// that race the hard way (it read "Default" intermittently on the one entry
	// with a real preset to name, which is the worst kind of wrong).
	if (key === "theme" && bnd_theme_cache) return bnd_tr_layout(bnd_theme_match(frm));
	// An entry that owns no fields has no state to report. The Overview READS
	// settings; saying "Default" under it claims it has some, and would go on
	// saying it while every component it shows had been changed.
	if (!BND_SHELL_OWNS[key]) return "";
	if (key === "sidepane" && bnd_sb_catalogue) return bnd_sb_match_preset(frm);
	// Translated HERE, not in the matcher: this is a display string, while the
	// picker compares the same answer against untranslated card values.
	if (key === "layout") return bnd_tr_layout(bnd_match_layout(frm));
	return bnd_changed_fields(key, frm).length ? __("Changed") : __("Default");
}

/**
 * Display form of a matched layout or theme name. Empty stays empty — "cannot say".
 *
 * "Custom" IS SPELLED OUT, and the build guard is why. The extractor reads
 * LITERAL `__("...")` calls only, so a purely dynamic `__(name)` ships the string
 * untranslated with the coverage gate green — the same trap the twelve preset
 * names hit earlier in this item. The catalogue names are covered by the literal
 * thunks on their own cards; "Custom" belongs to no card, so it is written here.
 */
function bnd_tr_layout(name) {
	if (!name) return "";
	return name === "Custom" ? __("Custom") : __(name);
}

/**
 * Which layout the desk's containers currently ARE, or "Custom".
 *
 * Derived by comparing values, never by reading `desk_layout` back. Pinning the
 * name pins nothing: the name is what was last APPLIED, and every container has
 * its own switch afterwards, so a desk can carry the label "Dock" while showing
 * a top bar and a side pane. The side pane's picker has worked this way since
 * item 10 for exactly this reason — its label is derived by comparing every
 * field the catalogue names — and this is the same rule reaching the last
 * preset that lacked it.
 *
 * Falls back to the stored name when the catalogue has not arrived. That is the
 * honest answer to "cannot say": it is what a user picked, merely unverified.
 */
function bnd_match_layout(frm) {
	if (!bnd_layout_chrome || !bnd_container_toggles) return "";

	for (const name of Object.keys(bnd_layout_chrome)) {
		const row = bnd_layout_chrome[name];
		const matches = Object.keys(bnd_container_toggles).every((key) => {
			const field = bnd_container_toggles[key];
			// A container whose field the doctype has not grown cannot disagree.
			if (!(key in row) || !frm.get_field(field)) return true;
			return parseInt(frm.doc[field] ?? row[key], 10) === row[key];
		});
		// THE CONTAINERS ARE NOT ENOUGH, and Classic and Bottom Bar are why: their
		// container rows are byte-identical, so comparing only the five toggles
		// returned whichever came first in the catalogue and a Bottom Bar desk
		// highlighted the Classic card. What separates them is where the bell, the
		// profile and search sit — which is the rest of what the card WRITES, so
		// comparing it is also what makes "Custom" mean what it says.
		const tenants = (bnd_layout_tenants && bnd_layout_tenants[name]) || {};
		const placed = Object.keys(tenants).every((field) => {
			if (!frm.get_field(field)) return true;
			return String(frm.doc[field] ?? tenants[field]) === String(tenants[field]);
		});
		if (matches && placed) return name;
	}
	return "Custom";
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
	{ key: "inbox", field: "inbox_placement", label: () => __("Bell"), fallback: "Top Bar End" },
	{ key: "user", field: "user_placement", label: () => __("You"), fallback: "Top Bar End" },
];

function bnd_render_overview(frm, $pane) {
	const pc = (n, total) => Math.round((n / total) * 10000) / 100 + "%";
	const placed = [];
	const off = [];

	BND_OVERVIEW_TENANTS.forEach((t, i) => {
		const value = frm.doc[t.field] || t.fallback;
		const g = bnd_slot_geom(value);
		if (!g) {
			off.push(t);
			return;
		}
		const reason = bnd_region_blocker(frm, bnd_slot_region(value));
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
				// above would be a claim this line cannot back. It names the
				// DERIVED label now: `bnd_match_layout` compares the container
				// values against the catalogue and says "Custom" the moment one
				// differs, which is exactly the difference this line used to be
				// unable to show. The catalogue arrived with the last container
				// (item 36); until it loads the function falls back to the
				// stored name, so this reads correctly either way.
				__("Layout preset: {0}. Each mark is a control — select it to change where that piece lives.", [
					bnd_tr_layout(bnd_match_layout(frm)),
				])
			) + hidden
		)
	);
	$pane.find(".bnd-dgm-mark").on("click", function () {
		bnd_shell_select(frm, this.getAttribute("data-goto"));
	});
}

/**
 * The Translations surface (item 7, part 2).
 *
 * WHAT IT SHOWS
 *   The latest scan's ledger — per app: how many strings it has, how many have
 *   no translation — plus what is NEW since the previous scan, which is how a
 *   freshly installed module announces itself. Below it, the ways to close the
 *   gap, in the order they should be tried: a provider run (machine proposals,
 *   reviewed row by row), export/import for a human translator, and a direct
 *   editor for one-off fixes.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   Apply machine output. A provider run writes PROPOSALS; each row is
 *   accepted or rejected here, by a person. Manual saves and imported files
 *   apply directly — a file someone filled and chose to upload IS the review.
 *
 * All state lives server-side (Bunood Translation Scan / Proposal); this
 * function only draws and calls. A scan runs on the LONG queue — a ten-app
 * sweep is minutes, and the realtime events repaint this pane as it goes.
 */
function bnd_render_translations(frm, $pane) {
	const lang = "ar";
	const call = (method, args) =>
		frappe.call({ method: "bunood_theme.i18n.api." + method, args: args || {} }).then((r) => r.message);

	const paint = (state) => {
		const scan = state.scan;
		let rows = "";
		if (scan && scan.apps) {
			rows = Object.entries(scan.apps)
				.sort((a, b) => b[1].missing - a[1].missing)
				.map(
					([app, t]) =>
						"<tr><td>" + bnd_esc(app) + "</td><td>" + t.total + "</td><td>" +
						(t.missing ? "<strong>" + t.missing + "</strong>" : "0") + "</td></tr>"
				)
				.join("");
		}
		const scanLine = !scan
			? __("No scan yet. Run one to see what needs translating.")
			: scan.status === "Failed"
				? __("Scan failed") + ": " + bnd_esc((scan.error || "").split("\n").pop() || "")
				: __("Untranslated: {0}", [String(scan.missing_total)]) +
					" · " + __("New since previous scan: {0}", [String(scan.new_since_previous || 0)]);

		$pane.html(
			'<div class="bnd-tc">' +
				'<div class="bnd-cbp-note bnd-tc-status">' +
					bnd_esc(scanLine) +
					(state.running ? " — " + bnd_esc(__("Scan running…")) : "") +
				"</div>" +
				(rows
					? '<table class="bnd-tc-table"><thead><tr><th>' +
						[__("App"), __("Strings"), __("Missing")].map(bnd_esc).join("</th><th>") +
						"</th></tr></thead><tbody>" + rows + "</tbody></table>"
					: "") +
				'<div class="bnd-tc-actions">' +
					'<button type="button" class="btn btn-sm btn-default" data-act="scan"' + (state.running ? " disabled" : "") + ">" +
						bnd_esc(__("Scan now")) + "</button>" +
					(scan && scan.status === "Completed"
						? '<button type="button" class="btn btn-sm btn-default" data-act="export">' +
								bnd_esc(__("Export untranslated (CSV)")) + "</button>" +
							'<button type="button" class="btn btn-sm btn-default" data-act="import">' +
								bnd_esc(__("Import a filled CSV…")) + "</button>" +
							'<button type="button" class="btn btn-sm btn-default" data-act="provider">' +
								bnd_esc(__("Run {0}", [state.provider])) + "</button>"
						: "") +
				"</div>" +
				(scan && scan.status === "Completed" && !state.provider_ready
					? '<div class="bnd-cbp-note">' + bnd_esc(state.provider_reason) + "</div>"
					: "") +
				'<div class="bnd-tc-manual">' +
					'<input class="form-control bnd-tc-src" type="text" placeholder="' + bnd_esc(__("Source string, exactly as the app spells it")) + '">' +
					'<input class="form-control bnd-tc-dst" type="text" dir="auto" placeholder="' + bnd_esc(__("Its translation")) + '">' +
					'<button type="button" class="btn btn-sm btn-default" data-act="save">' + bnd_esc(__("Save translation")) + "</button>" +
				"</div>" +
				'<div class="bnd-tc-proposals" data-count="' + state.pending_proposals + '">' +
					(state.pending_proposals
						? '<div class="bnd-cbp-note">' + bnd_esc(__("Proposals to review: {0}", [String(state.pending_proposals)])) + "</div>" +
							'<div class="bnd-tc-plist"></div>'
						: "") +
				"</div>" +
			"</div>"
		);

		$pane.find("[data-act=scan]").on("click", () =>
			call("start_scan", { language: lang }).then(refresh)
		);
		$pane.find("[data-act=export]").on("click", () => {
			window.open("/api/method/bunood_theme.i18n.api.export_untranslated?scan=" + encodeURIComponent(scan.name));
		});
		$pane.find("[data-act=import]").on("click", () => {
			const picker = document.createElement("input");
			picker.type = "file";
			picker.accept = ".csv,text/csv";
			picker.onchange = () => {
				const file = picker.files && picker.files[0];
				if (!file) return;
				file.text().then((content) =>
					call("import_csv", { language: lang, content }).then((counts) => {
						frappe.show_alert({
							message: __("Imported — created: {0}, updated: {1}, left empty: {2}", [
								counts.created, counts.updated, counts.skipped_empty,
							]),
							indicator: counts.skipped_empty ? "orange" : "green",
						});
						refresh();
					})
				);
			};
			picker.click();
		});
		$pane.find("[data-act=provider]").on("click", () =>
			call("estimate_provider_run", { scan: scan.name }).then((est) => {
				frappe.confirm(
					__("Provider: {0}. Strings: {1}. Estimated cost: ${2}. Cap: ${3}. Every result lands as a proposal to review — nothing is applied on its own.", [
						est.provider, est.strings, est.usd, est.cap,
					]),
					() => call("start_provider_run", { scan: scan.name }).then(refresh)
				);
			})
		);
		$pane.find("[data-act=save]").on("click", function () {
			const src = $pane.find(".bnd-tc-src").val().trim();
			const dst = $pane.find(".bnd-tc-dst").val().trim();
			if (!src || !dst) return;
			call("save_translation", { language: lang, source_text: src, translated_text: dst }).then(() => {
				frappe.show_alert({ message: __("Saved — applies on the next page load."), indicator: "green" });
				$pane.find(".bnd-tc-src, .bnd-tc-dst").val("");
			});
		});

		if (state.pending_proposals) paint_proposals();
	};

	const paint_proposals = () =>
		call("list_proposals", { language: lang, page_length: 20 }).then((data) => {
			const $list = $pane.find(".bnd-tc-plist");
			if (!$list.length) return;
			$list.html(
				data.rows
					.map(
						(p) =>
							'<div class="bnd-tc-prow" data-name="' + bnd_esc(p.name) + '">' +
								'<span class="bnd-tc-psrc">' + bnd_esc(p.source_text) + "</span>" +
								'<span class="bnd-tc-pdst" dir="auto">' + bnd_esc(p.proposed_text || "") + "</span>" +
								'<span class="bnd-tc-papp">' + bnd_esc(p.app || "") + "</span>" +
								'<button type="button" class="btn btn-xs btn-default" data-review="accept">' + bnd_esc(__("Accept")) + "</button>" +
								'<button type="button" class="btn btn-xs btn-default" data-review="reject">' + bnd_esc(__("Reject")) + "</button>" +
							"</div>"
					)
					.join("")
			);
			$list.find("[data-review]").on("click", function () {
				const row = this.closest(".bnd-tc-prow");
				call("review_proposal", { name: row.getAttribute("data-name"), action: this.getAttribute("data-review") }).then(() => {
					row.remove();
					const left = $list.find(".bnd-tc-prow").length;
					if (!left) refresh();
				});
			});
		});

	const refresh = () => call("get_state", { language: lang }).then(paint);

	// Repaint as the queue reports. Bound each render; frappe.realtime.on is
	// idempotent enough for a settings pane that is rebuilt wholesale, and the
	// events carry no payload this pane trusts — it always re-asks get_state.
	frappe.realtime.on("bnd_translation_scan", refresh);
	frappe.realtime.on("bnd_translation_provider", refresh);

	$pane.html('<div class="bnd-cbp-note">' + bnd_esc(__("Loading…")) + "</div>");
	refresh();
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
				`<button type="button" class="bnd-shell-item" role="tab" aria-selected="false" tabindex="-1" data-key="${bnd_esc(item.key)}">` +
				`<span class="bnd-shell-label">${bnd_esc(item.label())}</span>` +
				`<span class="bnd-shell-note" data-bnd-note="${bnd_esc(item.key)}"></span>` +
				`<span class="bnd-shell-dot" data-bnd-dot="${bnd_esc(item.key)}" hidden></span>` +
				`</button>`;
		}
	}

	// The VIEWPORT wrapper exists for one reason: a `@container` rule cannot
	// style the container it queries — only its descendants. `.bnd-shell` used
	// to carry `container-type` itself, so its own narrow rule (collapse to one
	// column) never applied while its CHILDREN's narrow rules did: the nav
	// became a row of wrapped chips inside a still-210px grid column, 83px
	// items packed two per ragged row. Measured 2026-08-09 on an 800px pane —
	// the "breaks its format instead of reflowing" report. The wrapper queries;
	// the shell responds.
	const $shell = $(
		`<div class="bnd-shell-viewport">` +
			`<div class="bnd-shell" data-current="">` +
			`<nav class="bnd-shell-nav" role="tablist">${nav}</nav>` +
			`<div class="bnd-shell-detail"></div>` +
			`</div>` +
			`</div>`
	);
	field.$wrapper.empty().append($shell);

	const $detail = $shell.find(".bnd-shell-detail");
	// A section can only be in one pane. Two entries claiming the same one is not
	// hypothetical — `density_default` and `palette_enabled` share
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

	// THE TABLIST KEYBOARD CONTRACT. The nav has carried role=tablist since
	// the shell shipped, and a tablist promises arrow-key movement with a
	// roving tabindex — one Tab stop for the whole rail, arrows to move
	// within it. Without this the role was a lie the 34a audit called out:
	// entries were plain buttons, aria-selected landed on nothing, and Tab
	// walked all seventeen entries one by one.
	$shell.on("keydown", ".bnd-shell-item", function (e) {
		const HORIZ = ["ArrowLeft", "ArrowRight"];
		const VERT = ["ArrowUp", "ArrowDown"];
		if (!HORIZ.includes(e.key) && !VERT.includes(e.key) && e.key !== "Home" && e.key !== "End") return;
		const items = $shell.find(".bnd-shell-item").toArray();
		const at = items.indexOf(this);
		if (at === -1) return;
		e.preventDefault();
		let next = at;
		if (e.key === "Home") next = 0;
		else if (e.key === "End") next = items.length - 1;
		else {
			const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
			next = (at + (fwd ? 1 : -1) + items.length) % items.length;
		}
		bnd_shell_select(frm, items[next].getAttribute("data-key"));
		items[next].focus();
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
			bnd_layout_tenants = (data && data.layout_tenants) || null;
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
function bnd_apply_layout_preset(frm, name) {
	return bnd_load_shipped().then(() => {
		if (!bnd_layout_chrome || !bnd_container_toggles) return;
		const row = bnd_layout_chrome[name];
		if (!row) return; // unknown layout: write nothing, same fail-open rule
		for (const key of Object.keys(bnd_container_toggles)) {
			const field = bnd_container_toggles[key];
			if (!(key in row) || !frm.get_field(field)) continue;
			frm.set_value(field, row[key]);
		}
		// AND THE TENANT PLACEMENTS — the half this loop was missing (item 36's
		// picker audit). Every card's blurb promises where search, the bell and
		// the profile will sit, and only the containers were written: picking
		// "Bottom Bar" switched the top bar off and left the bell pointing at a
		// region that no longer existed, which the runtime resolves to
		// "absent" — the card drew a bell in the bottom strip and the desk
		// showed none. `registry.layout_settings` has composed both halves all
		// along and the suite applied it through `setSettings`; the form could
		// not, so the suite was exercising a path no gesture could reach.
		//
		// Guarded on the field EXISTING, exactly as the containers are: a
		// catalogue that names a field this doctype lacks must skip it rather
		// than orphan a tabSingles row.
		const tenants = (bnd_layout_tenants && bnd_layout_tenants[name]) || null;
		if (tenants) {
			for (const field of Object.keys(tenants)) {
				if (!frm.get_field(field)) continue;
				frm.set_value(field, tenants[field]);
			}
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
		// The roving half of the tablist contract: exactly one entry is a Tab
		// stop, and it is the selected one. Arrows move within the rail.
		this.setAttribute("tabindex", on ? "0" : "-1");
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
			'<circle cx="106" cy="7.5" r="3" fill="var(--primary, #3d8150)"/>' +
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
			'<circle cx="106" cy="7.5" r="3" fill="var(--primary, #3d8150)"/>' +
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
			'<circle cx="8" cy="66" r="3" fill="var(--primary, #3d8150)"/>' +
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
			'<circle cx="106" cy="68.5" r="3" fill="var(--primary, #3d8150)"/>' +
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
			'<circle cx="36" cy="66" r="3" fill="var(--primary, #3d8150)"/>' +
			'<circle cx="46" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="55" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="64" cy="66" r="2.5" fill="currentColor" opacity=".35"/>' +
			'<circle cx="84" cy="66" r="3" fill="var(--primary, #3d8150)"/>' +
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

/**
 * Hand every kit's values to the desk at once.
 *
 * THE SAME FIFTEEN CALLS, IN THE SAME ORDER, existed twice — on refresh and in
 * the theme import — and item 37 was about to make it three. Extracted because
 * those two ARE one fact. The picker-repaint lists beside them are NOT, and are
 * deliberately left alone: the import repaints a smaller set and reaches the
 * sidebar through `_now` because its catalogue is already loaded. Folding those
 * together would be a behaviour change wearing a refactor's clothes.
 */
function bnd_all_previews(frm) {
	bnd_sb_preview(frm);
	bnd_crumb_preview(frm);
	bnd_palette_preview(frm);
	bnd_inbox_preview(frm);
	bnd_list_preview(frm);
	bnd_form_preview(frm);
	bnd_workspace_preview(frm);
	bnd_chart_preview(frm);
	bnd_report_preview(frm);
	bnd_views_preview(frm);
	bnd_overlay_preview(frm);
	bnd_empty_preview(frm);
	bnd_skeleton_preview(frm);
	bnd_filters_preview(frm);
	bnd_icon_preview(frm);
}

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

	// THE HIGHLIGHT IS DERIVED NOW (item 37), so this picker cannot answer until
	// the catalogue is here. It used to fall back to the stored `desk_layout` and
	// light the right card from the first paint; with the field gone, a render
	// that arrives first would keep an unhighlighted picker for the whole session.
	//
	// SELF-HEALING HERE rather than at the call site, because the first fix was put
	// in `bnd_shell_setup` — which only runs when the shell is wanted, so `?shell=0`
	// never got it and the fixture still showed no `bnd-cbp-on`. A picker that
	// depends on a fetch should say so itself; every caller getting it right is the
	// arrangement that fails the moment a caller is added.
	if (!bnd_layout_chrome) {
		bnd_load_shipped().then(() => {
			if (bnd_layout_chrome) bnd_render_layout_picker(frm);
		});
	}

	// DERIVED, not read back (item 37). This took the stored `desk_layout`, so a
	// desk whose containers had drifted still highlighted the last name written.
	// `bnd_match_layout` compares the containers and answers "Custom" — which
	// highlights nothing, correctly — and it is the same comparison the shell's
	// note already used, so the card and the note cannot disagree.
	const current = bnd_match_layout(frm);
	// The shared vocabulary, not a parallel one. `bnd-lp-*` duplicated
	// `bnd-cbp-*` rule for rule — same card, same thumb, same blurb, two
	// spellings — and the only differences were unintended: a name one step
	// larger and a grid 10px wider, neither of them a decision anybody made.
	// `bnd-lp-card` survives purely as the click hook.
	const cards = P.cards(
		BND_LAYOUTS.map((l) => ({ value: l.value, name: __(l.value), blurb: l.blurb(), svg: l.svg })),
		{ selected: current, cls: "bnd-cbp-style bnd-lp-card" }
	);

	// The export/import toolbar lives on the SIDEBAR picker (bnd_render_sidebar_picker,
	// bnd-sbp-toolbar) — this picker built a second copy of it and then never appended
	// it (`$host.html(P.wrap(cards))` ignored the local), so it rendered nowhere and
	// its strings were dead. Deleted in item 36; the fixture is byte-identical, which
	// is the proof it never reached the DOM.
	$host.html(P.wrap(cards));

	$host.find(".bnd-lp-card").on("click", function () {
		// `data-value`, not `data-layout`: the shared builder emits one
		// attribute name for every picker, so a handler cannot be written
		// against a spelling only this picker used.
		// APPLIED DIRECTLY (item 37). This used to write `desk_layout` and let the
		// field handler apply the preset — a stored name as a trigger. The field is
		// gone, so the gesture calls the composer, and the card highlight comes back
		// from comparing the containers, as it already did.
		bnd_apply_layout_preset(frm, this.getAttribute("data-value")).then(() => {
			bnd_container_changed(frm);
			bnd_render_theme_picker(frm);
			bnd_render_layout_picker(frm);
		});
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
		desc: () => __("Glass lets the page glow through; blurred frosts it as well."),
		options: [
			{ value: "Solid", name: () => __("Solid"), thumb: bnd_sb_pane("currentColor", "opacity:.3") },
			{ value: "Glass", name: () => __("Glass"), thumb: bnd_sb_pane("currentColor", "opacity:.12;outline:1px solid currentColor;outline-offset:-1px") },
			{ value: "Blurred Glass", name: () => __("Blurred Glass"), thumb: bnd_sb_pane("currentColor", "opacity:.12;outline:1px solid currentColor;outline-offset:-1px;filter:blur(1px)") },
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
			{ value: "Brand", name: () => __("Brand"), thumb: bnd_sb_pane("var(--primary, #3d8150)") },
		],
	},
	// Icon style and Icon source moved to the Icons axis (item 23). The sidebar
	// picker no longer draws them; they live in section_icons.
	{
		field: "sidebar_active_style",
		zone: "links",
		title: () => __("Active link"),
		desc: () => __("How the current page is marked."),
		options: [
			{ value: "Solid Pill", name: () => __("Solid pill"), thumb: '<span class="bnd-sbp-row" style="background:var(--primary,#3d8150);color:#fff"></span>' },
			{ value: "Soft Pill", name: () => __("Soft pill"), thumb: '<span class="bnd-sbp-row" style="background:color-mix(in srgb, var(--primary,#3d8150) 18%, transparent)"></span>' },
			{ value: "Accent Rail", name: () => __("Accent rail"), thumb: '<span class="bnd-sbp-row" style="border-inline-start:3px solid var(--primary,#3d8150);border-radius:0;background:color-mix(in srgb, var(--primary,#3d8150) 8%, transparent)"></span>' },
			{ value: "Outline", name: () => __("Outline"), thumb: '<span class="bnd-sbp-row" style="box-shadow:inset 0 0 0 1.5px var(--primary,#3d8150)"></span>' },
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
		field: "sidebar_section_style",
		zone: "links",
		title: () => __("Sections"),
		desc: () => __("How the pane's link groups are presented."),
		options: [
			{ value: "Plain", name: () => __("Plain"), thumb: '<span class="bnd-sbp-lines"></span>' },
			{ value: "Divided", name: () => __("Divided"), thumb: '<span class="bnd-sbp-lines" style="border-block-start:1px solid currentColor;opacity:.6"></span>' },
			{ value: "Cards", name: () => __("Cards"), thumb: '<span class="bnd-sbp-card"></span>' },
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
			{ value: "Header", name: () => __("Header"), thumb: bnd_sb_pane("currentColor", "opacity:.14") + '<span class="bnd-sbp-btnmark" style="inset-block-start:8px;inset-inline-start:20px"></span>' },
		],
	},
	// Rail button icon moved to the Icons axis (item 23).
	{
		field: "sidebar_badges",
		zone: "links",
		title: () => __("Count badges"),
		desc: () => __("Live record indicators on links."),
		options: [
			{ value: "Off", name: () => __("Off"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span>' },
			{ value: "Dots", name: () => __("Dots"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span><span style="position:absolute;inset-inline-end:14px;inset-block-start:50%;translate:0 -50%;inline-size:6px;block-size:6px;border-radius:50%;background:#E24B4A"></span>' },
			{ value: "Counts", name: () => __("Counts"), thumb: '<span class="bnd-sbp-row" style="background:var(--control-bg)"></span><span style="position:absolute;inset-inline-end:10px;inset-block-start:50%;translate:0 -50%;font-size:9px;background:color-mix(in srgb, var(--bnd-brand) 10%, var(--bnd-surface));color:var(--bnd-ink);border-radius:8px;padding-inline:5px">12</span>' },
		],
	},
];

/** Stepped 1..5 controls: field + endpoint labels. */
const BND_SB_STEPPERS = [
	{ field: "sidebar_card_depth", zone: "pane", title: () => __("Card depth"), desc: () => __("Applies to card sections."), lo: () => __("Hairline"), hi: () => __("Elevated") },
	{ field: "sidebar_pane_width", zone: "pane", title: () => __("Pane width"), lo: () => __("200px"), hi: () => __("280px") },
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

/**
 * Full render of the sidebar picker. Wholesale re-render on every change —
 * state lives in the form document, never in this DOM.
 */
function bnd_render_sidebar_picker_now(frm, host) {
	const $host = bnd_picker_host(frm, "sidebar_picker", host);
	if (!$host) return;

	// Collected BY BAND rather than joined into one string: the side pane has
	// more option groups than any other picker, and one undifferentiated column
	// of them is the wall
	// this split exists to remove.
	const by_zone = {};
	const add = (zone, html) => {
		by_zone[zone] = (by_zone[zone] || "") + html;
	};
	// Nothing in this picker does anything while the pane it styles is off.
	// Twenty option groups offering themselves as live is the dishonesty the
	// audit was named for, and it became reachable the day the side pane got
	// its own switch. The container's answer wins over any per-option one: a
	// reason about `sidebar_material` explains the smaller of two facts.
	const kit_off = bnd_component_blocker(frm, "sidepane");

	BND_SB_GROUPS.forEach((group) => {
		const current = bnd_sb_norm(group.field, frm.doc[group.field]);
		const cards = group.options
			.map((opt) => {
				const reason = kit_off || (opt.disabled ? opt.disabled(frm) : "");
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
			'<button type="button" class="bnd-cbp-reset bnd-sbp-reset" data-field="' + group.field +
			'" aria-label="' + __("Reset to preset value") + '" title="' + __("Reset to preset value") + '">↺</button></div>' +
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
					'" data-field="' + s.field + '" data-value="' + n + '" aria-label="' + bnd_esc(s.title()) + ": " + n + '"></button>'
			)
			.join("");
		add(s.zone, (
			'<div class="bnd-cbp-group bnd-sbp-group"><div class="bnd-cbp-title">' + s.title() + "</div>" +
			(s.desc ? '<div class="bnd-cbp-desc">' + s.desc() + "</div>" : "") +
			'<div class="bnd-sbp-steps"><span class="bnd-sbp-slab">' + s.lo() + "</span>" + stops +
			'<span class="bnd-sbp-slab">' + s.hi() + "</span></div></div>"
		));
	});

	const toolbar =
		'<div class="bnd-sbp-toolbar">' +
		'<input type="search" class="bnd-sbp-search" aria-label="' + __("Search settings") + '" placeholder="' + __("Search settings…") + '">' +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-export">' + __("Export") + "</button>" +
		'<button type="button" class="btn btn-xs btn-default bnd-sbp-import">' + __("Import") + "</button>" +
		'<span class="bnd-sbp-hint">' + __("Changes apply as you click — there is nothing to save.") + "</span>" +
		"</div>";

	$host.html(
		'<div class="bnd-sbp">' + toolbar +
			bnd_bands([
				// THE PRESET CARDS ARE GONE (item 37). They lived here and painted a
				// palette no sidebar preset carried — Carbon a teal, Paper a violet,
				// while all eight rendered in whatever seed the site was on. The looks
				// are ONE catalogue now, under Appearance > Theme, and this pane is
				// the options a look composes from. `bnd_sb_match_preset` stays: the
				// shell's note and the per-option reset both still ask which
				// composition this is.
				{ zone: "style", html: (kit_off ? P.note(kit_off) : "") },
				{ zone: "placement", html: by_zone.placement },
				{ zone: "pane", html: by_zone.pane || "" },
				{ zone: "links", html: by_zone.links },
				{ zone: "rail", html: by_zone.rail },
			]) +
			"</div>"
	);

	// One delegated pass wires everything; re-render happens on any change.
	$host.find(".bnd-sbp-opt, .bnd-sbp-stop").on("click", function () {
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
 * permanent for everyone the moment it is clicked — this form autosaves.
 */
function bnd_sb_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.sb_apply || !bnd_sb_catalogue) return;
	const values = {};
	for (const f of bnd_sb_catalogue.fields) values[f] = frm.doc[f];
	values.sidebar_menu_rail = bnd_sb_norm("sidebar_menu_rail", values.sidebar_menu_rail);
	window.bunood_theme.sb_apply(values);
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
	bnd_sb_preview(frm);
	bnd_render_sidebar_picker_now(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Theme presets (item 37)
// ════════════════════════════════════════════════════════════════════════════
//
// THE CATALOGUE IS THE SERVER'S. `presets.THEME_PRESETS` is the only statement of
// which values each look writes, flattened by `presets.theme_settings` — the ONE
// composer — and fetched over `bunood_theme.api.get_theme_presets`. Nothing here
// assembles a preset from its parts, and that is structural rather than tidy:
// item 36 found a layout writing HALF of itself for the whole of phase 0 because
// the form composed the containers while `registry.layout_settings` composed
// containers AND tenant placements, so the suite drove a state no gesture could
// produce. At ~124 values that failure is a certainty unless both writers call
// one function.
//
// ART AND BLURBS ONLY BELOW. A name listed here that the server does not know
// renders disabled with the reason, so the two lists cannot drift silently.

/** Card art + copy per shipped look. No VALUES — those are the server's. */
const BND_THEME_ART = {
	"Bunood Night": { name: () => __("Bunood Night"), pane: "dark", card: "float", rows: "plain", blurb: () => __("The shipped look. Floating cards on a hue-washed pane.") },
	"Bunood Day": { name: () => __("Bunood Day"), pane: "glass", card: "float", rows: "plain", blurb: () => __("The same design in daylight — floating glass instead of attached solid.") },
	"Focus": { name: () => __("Focus"), pane: "plain", card: "hairline", rows: "rule", blurb: () => __("Dense hairlines, monochrome glyphs, nothing raised.") },
	"Canvas": { name: () => __("Canvas"), pane: "tint", card: "open", rows: "none", blurb: () => __("Unframed and text-forward — the container does the framing.") },
	"Ledger": { name: () => __("Ledger"), pane: "tint", card: "hairline", rows: "zebra", blurb: () => __("Ruled and precise: zebra rows, weighted tiles.") },
	"Elevated": { name: () => __("Elevated"), pane: "glass", card: "float", rows: "plain", blurb: () => __("Soft tiles, filled empties, rounded elevation throughout.") },
	"Carbon": { name: () => __("Carbon"), pane: "dark", card: "hairline", rows: "rule", blurb: () => __("Structured and sharp — a grid you can feel, on a deep pane.") },
	"Records": { name: () => __("Records"), pane: "tint", card: "sheet", rows: "rule", blurb: () => __("Document-centric: a paper sheet on a headed board.") },
	"Studio": { name: () => __("Studio"), pane: "glass", card: "float", rows: "plain", blurb: () => __("The modern neutral — subtle borders, colour used sparingly.") },
	"Contrast": { name: () => __("Contrast"), pane: "brand", card: "solid", rows: "plain", blurb: () => __("Bold and high-contrast: solid panels, filled colour.") },
	"Workbench": { name: () => __("Workbench"), pane: "plain", card: "hairline", rows: "zebra", blurb: () => __("Dense rows, live count badges, the status bar always on.") },
	// THE HONEST STAND-DOWN. The blurb names the three kits that cannot comply,
	// because a card claiming "stock" while three surfaces stay ours is exactly
	// the promise this item exists to stop making.
	"Quiet": { name: () => __("Quiet"), pane: "plain", card: "open", rows: "none", blurb: () => __("Every kit that can stand down does. The side pane, status bar and charts cannot — they mount chrome, or ship no Original — so they take their quietest setting.") },
};

/**
 * One desk, twelve dressings — `bnd_print_thumb`'s lesson, in colour.
 *
 * Drawn in LIGHT for every card on purpose: light or dark is the viewer's choice
 * (or their OS's), never the preset's, so a card that picked one would be
 * answering a question it was not asked. The PANE may still be dark — that is
 * `sidebar_color`, which a preset does decide.
 *
 * Every colour is the server's `palette.derive` output for that palette, handed
 * over by `api.get_palettes`. Nothing is computed here: a JS reimplementation of
 * the derivation is the one thing this project forbids outright, because the gate
 * measures the Python and the copy is what would drift.
 */
function bnd_theme_thumb(sw, art) {
	if (!sw) return "";
	const a = art || {};
	const line = "rgba(0,0,0,.12)";
	const pane =
		a.pane === "dark" ? "#1b2023" :
		a.pane === "brand" ? sw.fill :
		a.pane === "tint" ? sw.pane :
		a.pane === "glass" ? sw.surface : sw.page;
	const paneInk = a.pane === "dark" || a.pane === "brand" ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.30)";
	const p = [`<rect x="0" y="0" width="120" height="72" fill="${sw.page}"/>`];
	// The side pane, and its active item — the one place the brand is a FILL.
	p.push(`<rect x="0" y="0" width="34" height="72" fill="${pane}"/>`);
	p.push(`<rect x="5" y="7" width="24" height="7" rx="3.5" fill="${a.pane === "brand" ? "rgba(255,255,255,.85)" : sw.fill}"/>`);
	for (let i = 0; i < 3; i++) {
		p.push(`<rect x="5" y="${20 + i * 8}" width="${20 - i * 3}" height="3" rx="1.5" fill="${paneInk}"/>`);
	}
	// The top bar, with the focus ring's colour as the one accent mark.
	p.push(`<rect x="34" y="0" width="86" height="12" fill="${sw.surface}"/>`);
	p.push(`<rect x="34" y="11.6" width="86" height="0.6" fill="${line}"/>`);
	p.push(`<circle cx="112" cy="6" r="2.4" fill="${sw.ring}"/>`);
	// Two cards, dressed by the anchor.
	for (let i = 0; i < 2; i++) {
		const y = 18 + i * 26;
		if (a.card === "float") {
			p.push(`<rect x="40" y="${y + 1}" width="74" height="21" rx="3" fill="rgba(0,0,0,.07)"/>`);
			p.push(`<rect x="40" y="${y}" width="74" height="21" rx="3" fill="${sw.surface}"/>`);
		} else if (a.card === "hairline") {
			p.push(`<rect x="40" y="${y}" width="74" height="21" rx="1.5" fill="${sw.surface}" stroke="${line}" stroke-width="0.7"/>`);
		} else if (a.card === "solid") {
			p.push(`<rect x="40" y="${y}" width="74" height="21" rx="2" fill="${sw.pane}" stroke="${sw.fill}" stroke-width="0.9"/>`);
		} else if (a.card === "sheet") {
			p.push(`<rect x="43" y="${y}" width="68" height="21" fill="${sw.surface}" stroke="${line}" stroke-width="0.7"/>`);
		} else {
			p.push(`<rect x="40" y="${y + 20.4}" width="74" height="0.6" fill="${line}"/>`);
		}
		p.push(`<rect x="45" y="${y + 5}" width="26" height="3" rx="1.5" fill="${sw.ink}"/>`);
		if (a.rows === "zebra") p.push(`<rect x="45" y="${y + 12}" width="64" height="5" fill="rgba(0,0,0,.05)"/>`);
		if (a.rows === "rule") p.push(`<rect x="45" y="${y + 15}" width="64" height="0.6" fill="${line}"/>`);
		p.push(`<rect x="45" y="${y + 12}" width="40" height="2.6" rx="1.3" fill="rgba(0,0,0,.22)"/>`);
	}
	return `<svg viewBox="0 0 120 72">${p.join("")}</svg>`;
}

let bnd_theme_cache = null;
let bnd_theme_inflight = false;
let bnd_palette_cache = null;
let bnd_palette_inflight = false;

/** Which shipped look, if any, does the form's current state EXACTLY match? */
function bnd_theme_match(frm) {
	if (!bnd_theme_cache) return null;
	const { axes, presets } = bnd_theme_cache;
	for (const [name, values] of Object.entries(presets)) {
		if (axes.every((f) => String(frm.doc[f] ?? "") === String(values[f] ?? ""))) return name;
	}
	return "Custom";
}

/**
 * Apply a look: write every axis the server composed, then let the kits repaint.
 *
 * IT WRITES THE SEEDS TOO, which is the decision this item was given and the
 * reason the card shows the colours it will write. `frm.set_value` on a Color
 * field goes through the same autosave every other control here does, and
 * `on_update` regenerates the per-site brand sheet — so the desk's colour follows
 * within the save, not on a reload.
 */
function bnd_apply_theme_preset(frm, name) {
	const values = bnd_theme_cache && bnd_theme_cache.presets[name];
	if (!values) return;
	for (const [field, value] of Object.entries(values)) frm.set_value(field, value);
	bnd_all_previews(frm);
	bnd_render_theme_picker(frm);
	// AND THE LAYOUT PICKER, because a theme writes the five container toggles:
	// without this the layout card kept its old highlight while the Overview's
	// Layout row (recomputed by bnd_shell_marks) told the truth, and the two rows
	// of one form disagreed about one desk.
	bnd_render_layout_picker(frm);
	bnd_shell_marks(frm);
}

/**
 * The theme picker — a GALLERY of complete looks.
 *
 * The presets write values and then stop existing (the settings-architecture
 * doctrine): clicking a card sets ~124 fields and nothing remembers the click.
 * The highlighted card is DERIVED by comparing the live values against the
 * server's table, so it reads "Custom" the moment one differs — which, at this
 * scope, is the honest answer and will be the common one.
 */
function bnd_render_theme_picker(frm, host) {
	const $host = bnd_picker_host(frm, "theme_picker", host);
	if (!$host) return;

	if (!bnd_theme_cache && !bnd_theme_inflight) {
		bnd_theme_inflight = true;
		frappe.xcall("bunood_theme.api.get_theme_presets").then((r) => {
			bnd_theme_cache = r;
			bnd_render_theme_picker(frm);
			// The shell's Theme note DERIVES from this catalogue, and two fetches
			// race here. Painting again is the cheap half of the fix; the marks are
			// idempotent, so the redundant repaint costs nothing.
			bnd_shell_marks(frm);
		}).catch(() => {
			// The flag RESETS so the next render retries — item 35's review caught
			// a first cut latching one transient failure into a dead card row for
			// the rest of the page's life.
			bnd_theme_inflight = false;
		});
	}
	if (!bnd_palette_cache && !bnd_palette_inflight) {
		bnd_palette_inflight = true;
		frappe.xcall("bunood_theme.api.get_palettes").then((r) => {
			bnd_palette_cache = r;
			bnd_render_theme_picker(frm);
		}).catch(() => {
			bnd_palette_inflight = false;
		});
	}

	const match = bnd_theme_match(frm);
	const swatches = (bnd_palette_cache && bnd_palette_cache.swatches) || {};
	const served = bnd_theme_cache && bnd_theme_cache.presets;

	const cards = P.cards(
		Object.keys(BND_THEME_ART).map((name) => {
			const art = BND_THEME_ART[name];
			// Which palette this look carries, read from what the server composed
			// rather than from a second table here.
			const seed = served && served[name] && served[name].brand_color;
			const palName = seed
				? Object.keys(swatches).find(
						(k) => bnd_palette_cache.palettes[k].brand_color.toLowerCase() === String(seed).toLowerCase()
				  )
				: null;
			const sw = palName && swatches[palName] ? swatches[palName].light : null;
			return {
				value: name,
				// LITERAL name thunks, not __(name): the extractor reads literal
				// __("...") calls only, and preset names have no doctype Select to
				// cover them — a dynamic call ships them untranslated with the
				// coverage gate green. The first cut of this file did exactly that,
				// and the gate said nothing; the thunks in BND_THEME_ART are what
				// make the names visible to it.
				name: art.name(),
				blurb: art.blurb(),
				svg: bnd_theme_thumb(sw, art),
				reason:
					served && !served[name]
						? __("Not in the shipped preset table — the card and the server disagree.")
						: "",
			};
		}),
		{ selected: match || "", cls: "bnd-cbp-style bnd-thp-style" }
	);

	const note =
		match === "Custom"
			? P.note(__("Custom — your own combination. Picking a look overwrites every setting it names, including the colours."))
			: match
			? P.note(__("Every setting this look names is applied. Change any one of them and this reads Custom."))
			: "";

	$host.html(P.wrap(cards + note));
	$host.find(".bnd-thp-style").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_apply_theme_preset(frm, this.getAttribute("data-value"));
	});
}

// ════════════════════════════════════════════════════════════════════════════
// Icon system (item 23)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Client mirror of presets.ICON_FIELDS — the fields the Icons axis owns, kept in
 * sync with theme_settings.json and bunood_theme/presets.py. Drives the picker
 * below, the change dots, and the theme export/import.
 */
const BND_ICON_FIELDS = ["icon_style", "icon_weight", "icon_source", "icon_rail_button", "icon_crumbs"];

/** Shipped defaults, for the per-group reset. Mirrors presets.ICON_DEFAULTS. */
const BND_ICON_DEFAULTS = {
	icon_style: "Colored Chips",
	icon_weight: "1.5",
	icon_source: "Smart",
	icon_rail_button: "Chevron",
	icon_crumbs: "First Crumb",
};

/**
 * The chip-style cards. These thumbs moved here verbatim from the sidebar
 * picker (item 23) — the style is the CHIP concern, distinct from the glyph
 * concerns (weight, the missing-icon fallback) below it.
 */
const BND_ICON_STYLES = [
	{ value: "Colored Chips", name: () => __("Colored chips"), thumb: '<span class="bnd-sbp-ic" style="background:#d9eadc;color:#2e6b44">▤</span><span class="bnd-sbp-ic" style="background:#dbe7fb;color:#2f5cc4">◉</span>' },
	{ value: "Colored Dots", name: () => __("Colored dots"), thumb: '<span class="bnd-sbp-ic" style="background:#d9eadc;color:#2e6b44;border-radius:50%">▤</span><span class="bnd-sbp-ic" style="background:#dbe7fb;color:#2f5cc4;border-radius:50%">◉</span>' },
	{ value: "Filled Color", name: () => __("Filled color"), thumb: '<span class="bnd-sbp-ic" style="color:#2e6b44">▮</span><span class="bnd-sbp-ic" style="color:#2f5cc4">●</span>' },
	{ value: "Duotone", name: () => __("Duotone"), thumb: '<span class="bnd-sbp-ic" style="color:var(--primary,#3d8150)">◪</span><span class="bnd-sbp-ic" style="color:var(--primary,#3d8150);opacity:.5">◪</span>' },
	{ value: "Brand Lines", name: () => __("Brand lines"), thumb: '<span class="bnd-sbp-ic" style="color:var(--primary,#3d8150)">▢</span><span class="bnd-sbp-ic" style="color:var(--primary,#3d8150)">○</span>' },
	{ value: "Monochrome", name: () => __("Monochrome"), thumb: '<span class="bnd-sbp-ic" style="color:var(--text-muted)">▢</span><span class="bnd-sbp-ic" style="color:var(--text-muted)">○</span>' },
];

/**
 * The option groups. Weight is the new axis; the other three are the relocated
 * Selects, now chips. Each maps 1:1 to a field the desk already consumes through
 * an unchanged payload key, so clicking one previews live.
 */
const BND_ICON_GROUPS = [
	{
		field: "icon_weight",
		title: () => __("Weight"),
		desc: () => __("The glyph stroke, normalised across sprite grids so this is the weight you actually get."),
		options: [
			{ value: "1.25", name: () => "1.25" },
			{ value: "1.5", name: () => "1.5" },
			{ value: "1.75", name: () => "1.75" },
			// Displayed "2.0", not "2": the value stays "2" (the Select option), but
			// a one-character label is a glyph to the a11y name gate, not a name.
			{ value: "2", name: () => "2.0" },
		],
	},
	{
		field: "icon_source",
		title: () => __("When an icon is missing"),
		desc: () => __("Most workspace links ship no icon of their own. Smart infers one from the title."),
		options: [
			{ value: "Smart", name: () => __("Smart"), glyph: "▤+A" },
			{ value: "Original", name: () => __("Original"), glyph: "▢" },
			{ value: "Letters", name: () => __("Letters"), glyph: "A" },
		],
	},
	{
		field: "icon_crumbs",
		title: () => __("Breadcrumb module icon"),
		desc: () => __("The workspace's own icon as a small chip in the trail."),
		options: [
			{ value: "First Crumb", name: () => __("First crumb"), glyph: "▣›b" },
			{ value: "Every Crumb", name: () => __("Every crumb"), glyph: "▣›▣" },
			{ value: "Off", name: () => __("Off"), glyph: "a›b" },
		],
	},
	{
		field: "icon_rail_button",
		title: () => __("Rail button icon"),
		desc: () => __("The glyph on the side pane's collapse button."),
		options: [
			{ value: "Chevron", name: () => __("Chevron"), glyph: "›" },
			{ value: "Menu", name: () => __("Menu"), glyph: "☰" },
			{ value: "Arrows", name: () => __("Arrows"), glyph: "⇄" },
		],
	},
];

/**
 * The specimen — real sprite glyphs at the current settings, the only honest way
 * to judge a stroke weight (a card cannot show the difference between 1.5 and
 * 1.75). They carry `class="icon"`, so `_icons.scss`'s weight rule reaches them
 * and the sheet re-strokes the instant `data-bnd-icon-weight` changes on <html>.
 */
function bnd_icon_specimen() {
	const ids = [
		"icon-home", "icon-users", "icon-file-text", "icon-stock",
		"icon-calendar", "icon-mail", "icon-setting-gear", "icon-chart",
	];
	return (
		'<div class="bnd-icp-specimen" aria-hidden="true">' +
		ids
			.map(
				(id) =>
					'<svg class="icon" viewBox="0 0 24 24" width="22" height="22">' +
					'<use href="#' + id + '"></use></svg>'
			)
			.join("") +
		"</div>"
	);
}

/**
 * Full render of the Icons picker — style cards, the glyph option groups, and a
 * live specimen. Wholesale re-render on every change; state lives in the form
 * document. Carries the bnd-cbp- vocabulary like the crumbs/list/form pickers,
 * with `bnd-icp-style` as its own click hook on the style cards.
 */
function bnd_render_icons_picker(frm, host) {
	const $host = bnd_picker_host(frm, "icons_picker", host);
	if (!$host) return;

	const current_style = frm.doc.icon_style || "Colored Chips";
	const style_cards = P.cards(
		BND_ICON_STYLES.map((s) => ({ value: s.value, name: s.name(), svg: s.thumb })),
		{ selected: current_style, cls: "bnd-cbp-style bnd-icp-style" }
	);

	const groups = BND_ICON_GROUPS.map((group) =>
		P.group({
			title: group.title(),
			desc: group.desc(),
			field: group.field,
			body: P.options(
				group.options.map((opt) => ({ value: opt.value, name: opt.name(), glyph: opt.glyph })),
				{ field: group.field, value: frm.doc[group.field] }
			),
		})
	).join("");

	const note = P.note(__("Changes apply as you click — there is nothing to save."));

	const specimen = P.group({
		title: __("Specimen"),
		desc: __("The desk's own glyphs at these settings."),
		body: bnd_icon_specimen(),
	});

	$host.html(
		P.wrap(
			bnd_bands([
				{ zone: "style", html: style_cards + note + groups },
				{ zone: "extras", html: specimen },
			])
		)
	);

	$host.find(".bnd-icp-style").on("click", function () {
		bnd_icon_set(frm, "icon_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_icon_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_icon_set(frm, f, BND_ICON_DEFAULTS[f]);
	});
}

/**
 * LIVE PREVIEW. The Icons fields feed THREE runtimes — the sidebar (style,
 * source, rail button), the breadcrumb (module icon), and the document-level
 * weight — so this calls all three apply hooks. Each reads only its own fields
 * and its `set` is a no-op on an absent value, so a partial icon-values object
 * never disturbs a pane's other settings.
 */
function bnd_icon_preview(frm) {
	const bt = window.bunood_theme;
	if (!bt) return;
	const values = {};
	for (const f of BND_ICON_FIELDS) values[f] = frm.doc[f];
	if (bt.sb_apply) bt.sb_apply(values);
	if (bt.crumb_apply) bt.crumb_apply(values);
	if (bt.icon_apply) bt.icon_apply(values);
}

/** Set one icon option, preview, re-render. */
function bnd_icon_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_icon_preview(frm);
	bnd_render_icons_picker(frm);
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
	"crumb_style", "crumb_separator", "crumb_hover",
	"crumb_copy_link", "crumb_status_pill", "crumb_narrow_collapse",
];

/** Shipped defaults, for the per-group reset. Mirrors presets.CRUMB_DEFAULTS. */
const BND_CRUMB_DEFAULTS = {
	crumb_style: "Quiet Trail",
	crumb_separator: "Chevron",
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
			'<rect x="20" y="14" width="8" height="8" rx="2.5" fill="var(--primary, #3d8150)" opacity=".35"/>' +
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
			'<rect x="82" y="12" width="32" height="12" rx="6" fill="var(--primary, #3d8150)" opacity=".4"/>' +
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
	// Module icons (crumb_icons -> icon_crumbs) moved to the Icons axis (item 23).
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
 * permanent for everyone the moment it is clicked — this form autosaves.
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
			'<rect x="23" y="27" width="74" height="6" rx="2.5" fill="var(--primary, #3d8150)" opacity=".3"/>' +
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
			'<rect x="23" y="10" width="14" height="8" rx="3" fill="var(--primary, #3d8150)" opacity=".35"/>' +
			'<rect x="40" y="10" width="57" height="8" rx="3" fill="currentColor" opacity=".12"/>' +
			'<rect x="23" y="24" width="74" height="6" rx="2.5" fill="var(--primary, #3d8150)" opacity=".3"/>' +
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
			'<rect x="23" y="23" width="74" height="6" rx="2.5" fill="var(--primary, #3d8150)" opacity=".3"/>' +
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
	const kit_down = current_style === "Original" || !parseInt(frm.doc.palette_enabled ?? 1, 10);
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
	if (!parseInt(frm.doc.palette_enabled ?? 1, 10)) values.palette_style = "Original";
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
			'<rect x="10" y="11" width="42" height="6" rx="2.5" fill="var(--primary, #3d8150)" opacity=".3"/>' +
			'<rect x="10" y="21" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="10" y="31" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="10" y="41" width="42" height="6" rx="2.5" fill="currentColor" opacity=".1"/>' +
			'<rect x="62" y="6" width="52" height="52" rx="4" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="67" y="12" width="30" height="5" rx="2" fill="currentColor" opacity=".35"/>' +
			'<rect x="67" y="22" width="40" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="67" y="29" width="34" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="67" y="44" width="20" height="8" rx="3" fill="var(--primary, #3d8150)" opacity=".35"/>' +
			"</svg>",
	},
	{
		value: "Bunood Inbox",
		blurb: () => __("The panel only: filter tabs, grouping by document, reason chips, hover actions, a real unread badge."),
		svg:
			'<svg viewBox="0 0 120 64">' +
			'<rect x="1" y="1" width="118" height="62" rx="4" fill="currentColor" opacity=".05"/>' +
			'<circle cx="99" cy="9" r="4" fill="currentColor" opacity=".3"/>' +
			'<circle cx="103" cy="6" r="3" fill="var(--primary, #3d8150)"/>' +
			'<rect x="46" y="14" width="68" height="44" rx="5" fill="none" stroke="currentColor" opacity=".35"/>' +
			'<rect x="51" y="19" width="24" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="51" y="28" width="58" height="7" rx="3" fill="var(--primary, #3d8150)" opacity=".28"/>' +
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
			'<circle cx="103" cy="6" r="3" fill="var(--primary, #3d8150)"/>' +
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

/**
 * Set one option and repaint the picker that OWNS the field.
 *
 * IT USED TO REPAINT THE INBOX PICKER AND NOTHING ELSE (item 36, the defect
 * HANDOVER §8 had filed): the user and links pickers route their clicks here
 * too, so clicking a slot in either wrote the value and left the diagram
 * showing the OLD selection until the form was refreshed. A control that does
 * not visibly move is indistinguishable from one that did nothing — the honest
 * -picker rule this surface is built on.
 *
 * Routed by FIELD rather than by a caller-supplied renderer: the three pickers
 * share one setter precisely so a fourth cannot forget to pass one, and the
 * field already says which picker owns it. The inbox picker repaints for its
 * own fields and for nothing else, so a links click no longer redraws it.
 */
function bnd_inbox_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_inbox_preview(frm);
	if (fieldname === "user_placement") bnd_render_user_picker(frm);
	else if (fieldname === "home_placement" || fieldname === "apps_placement") bnd_render_links_picker(frm);
	else bnd_render_inbox_picker(frm);
	// The board draws the same five placements: a slot moved from any of these
	// pickers must move on the board too, or the two views disagree about one
	// state (the board's own docblock calls that the lie it exists to prevent).
	bnd_render_placement_board(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Search placement picker (item 14 companion) — deliberately its OWN section
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// List View picker (item 16) — the first surface kit's settings
// ════════════════════════════════════════════════════════════════════════════

/** Client mirror of presets.LIST_FIELDS — keep in sync. */
const BND_LIST_FIELDS = ["list_style", "list_hover", "list_selection", "list_checkbox_reveal"];

/** Client mirror of presets.LIST_DEFAULTS — keep in sync. */
const BND_LIST_DEFAULTS = {
	list_style: "Floating Cards",
	list_hover: "Edge Rail",
	list_selection: "Bold Bar",
	list_checkbox_reveal: 1,
};

/**
 * The style catalogue. Thumbnails are abstract row diagrams; the tick glyph
 * in the selection card is pulled through the sprite (the settings form is
 * the item-33 icon system's second real caller — a deliberate exercise, not
 * a convenience).
 */
const BND_LIST_STYLES = [
	{
		value: "Original",
		blurb: () => __("Stock ERPNext rows, untouched. The whole kit stands down."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<line x1="8" y1="18" x2="112" y2="18" stroke="currentColor" opacity=".15"/>' +
			'<line x1="8" y1="32" x2="112" y2="32" stroke="currentColor" opacity=".15"/>' +
			'<rect x="8" y="9" width="40" height="4" rx="2" fill="currentColor" opacity=".35"/></svg>',
	},
	{
		value: "Hairline Rows",
		blurb: () => __("Quiet separators, maximum density — the classic admin look."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<line x1="8" y1="19" x2="112" y2="19" stroke="currentColor" opacity=".3"/>' +
			'<line x1="8" y1="33" x2="112" y2="33" stroke="currentColor" opacity=".3"/>' +
			'<rect x="8" y="10" width="44" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="24" width="36" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="38" width="40" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
	{
		value: "Open Rows",
		blurb: () => __("No lines at all — spacing separates, hover defines."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="9" width="44" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="6" y="21" width="108" height="12" rx="3" fill="currentColor" opacity=".08"/>' +
			'<rect x="8" y="25" width="36" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="41" width="40" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
	{
		value: "Zebra Stripes",
		blurb: () => __("Alternating fill — the easiest row-tracking on wide tables."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="4" y="18" width="112" height="13" fill="currentColor" opacity=".08"/>' +
			'<rect x="8" y="8" width="44" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="22" width="36" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="38" width="40" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
	{
		value: "Floating Cards",
		blurb: () => __("Each row a raised card — the modern look, a small density cost."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="6" y="7" width="108" height="16" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-opacity=".25"/>' +
			'<rect x="12" y="13" width="40" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="6" y="30" width="108" height="16" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-opacity=".25"/>' +
			'<rect x="12" y="36" width="36" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
];

/** The two composing option groups. */
const BND_LIST_GROUPS = [
	{
		field: "list_hover",
		title: () => __("Hover"),
		desc: () => __("How a row answers the pointer."),
		options: [
			{ value: "Soft Wash", name: () => __("Soft Wash") },
			{ value: "Edge Rail", name: () => __("Edge Rail") },
		],
	},
	{
		field: "list_selection",
		title: () => __("Selection"),
		desc: () => __("Checked rows and the bulk header, as one treatment."),
		options: [
			{ value: "Soft Tint", name: () => __("Soft Tint") },
			{ value: "Accent Rail", name: () => __("Accent Rail") },
			{ value: "Bold Bar", name: () => __("Bold Bar") },
		],
	},
];

const BND_LIST_TOGGLES = [
	{
		field: "list_checkbox_reveal",
		name: () => __("Reveal checkboxes on hover"),
		desc: () => __("Rows rest clean; a checkbox appears on hover or keyboard focus, and all of them while anything is selected. Always visible on touch."),
	},
];

/** Render the list picker. */
function bnd_render_list_picker(frm, host) {
	const $host = bnd_picker_host(frm, "list_picker", host);
	if (!$host) return;

	const current = frm.doc.list_style || BND_LIST_DEFAULTS.list_style;
	const off = current === "Original";

	// Filtered against the field's real options — the rule that retired the
	// status Off-card wedge class of bug.
	const offered = bnd_field_slots(frm, "list_style");
	const cards = P.cards(
		BND_LIST_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-lvp-style" }
	);

	const reason = off ? __("Original leaves the stock list untouched — nothing below applies.") : "";
	const groups = BND_LIST_GROUPS.map((g) =>
		P.group({
			title: g.title(),
			desc: g.desc(),
			field: g.field,
			body: P.options(
				g.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: g.field, value: frm.doc[g.field] || BND_LIST_DEFAULTS[g.field] }
			),
		})
	).join("");

	const toggles = BND_LIST_TOGGLES.map((t) =>
		P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason,
			// The picker's own hook class — omitting it is the recorded
			// inert-switch failure (the status kit's toggles, 2026-08-08).
			cls: "bnd-lvp-toggle",
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-lvp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups + '<div class="bnd-cbp-switches">' + toggles + "</div>" },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-lvp-style").on("click", function () {
		bnd_list_set(frm, "list_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-lvp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_list_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_list_set(frm, f, BND_LIST_DEFAULTS[f]);
	});
}

/** Hand the form's current list values to the desk engine — live preview. */
function bnd_list_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.list_apply) return;
	const values = {};
	for (const f of BND_LIST_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.list_apply(values);
}

/** Set one list option, preview, re-render. */
function bnd_list_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_list_preview(frm);
	bnd_render_list_picker(frm);
}

// ════════════════════════════════════════════════════════════════════════════
// Form View picker (item 18) — the second surface kit's settings
// ════════════════════════════════════════════════════════════════════════════

/** Client mirror of presets.FORM_FIELDS — keep in sync. */
const BND_FORM_FIELDS = ["form_style", "form_tabs", "form_sidebar", "form_grid_checkbox_reveal"];
// Mobile bar contents (item 24 C2). Export AND import list it — the same const
// on both sides, so the two cannot drift (the item-18 escapee: export carried a
// field the import's `known` set refused, silently dropping it on re-import).
const BND_MOBILE_FIELDS = ["mobile_inbox", "mobile_user", "mobile_apps"];

/**
 * Client mirror of presets.LINKS_DEFAULTS — keep in sync.
 *
 * Landed with item 36's picker audit: the links picker's reset chip had been
 * writing `bnd_field_first_slot`, i.e. "Top Bar Start", while both links ship
 * in "Side Pane Start" — a chip labelled "Reset to default" whose click was
 * the surest way to make the change dot say Changed.
 *
 * DEFAULTS ONLY, deliberately no `BND_LINKS_FIELDS` beside it: the two
 * placements are already named in `bnd_theme_keys`, and adding a FIELDS mirror
 * made the portability check demand it be concatenated there too — a second
 * statement of the same two fieldnames in one file. The check was right; the
 * mirror was the mistake.
 */
const BND_LINKS_DEFAULTS = {
	home_placement: "Off",
	apps_placement: "Off",
};

/** Client mirror of presets.FORM_DEFAULTS — keep in sync. */
const BND_FORM_DEFAULTS = {
	form_style: "Floating Panels",
	form_tabs: "Solid Pill",
	form_sidebar: "Floating Pane",
	form_grid_checkbox_reveal: 1,
};

/** The style catalogue. Thumbnails are abstract form diagrams: a tab strip,
 * then the section containers the style is actually about. */
const BND_FORM_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock form, untouched. The whole kit stands down."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".4"/>' +
			'<rect x="30" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".2"/>' +
			'<line x1="8" y1="13" x2="112" y2="13" stroke="currentColor" opacity=".15"/>' +
			'<rect x="8" y="19" width="36" height="4" rx="2" fill="currentColor" opacity=".35"/>' +
			'<line x1="8" y1="31" x2="112" y2="31" stroke="currentColor" opacity=".15"/>' +
			'<rect x="8" y="37" width="28" height="4" rx="2" fill="currentColor" opacity=".35"/></svg>',
	},
	{
		value: "Hairline Panels",
		blurb: () => __("Each section a bordered panel on the flat canvas."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".4"/>' +
			'<rect x="30" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".2"/>' +
			'<rect x="6" y="15" width="108" height="15" rx="3" fill="none" stroke="currentColor" stroke-opacity=".3"/>' +
			'<rect x="12" y="20" width="32" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="6" y="35" width="108" height="13" rx="3" fill="none" stroke="currentColor" stroke-opacity=".3"/>' +
			'<rect x="12" y="40" width="26" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
	{
		value: "Open Canvas",
		blurb: () => __("Separators erased — whitespace and titles carry the structure."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".4"/>' +
			'<rect x="30" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".2"/>' +
			'<rect x="8" y="18" width="36" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="26" width="60" height="3" rx="1.5" fill="currentColor" opacity=".15"/>' +
			'<rect x="8" y="40" width="28" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="8" y="48" width="52" height="3" rx="1.5" fill="currentColor" opacity=".15"/></svg>',
	},
	{
		value: "Floating Panels",
		blurb: () => __("Sections float as raised cards on a tinted canvas — the list kit's sibling."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".4"/>' +
			'<rect x="30" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".2"/>' +
			'<rect x="6" y="14" width="108" height="16" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-opacity=".25"/>' +
			'<rect x="12" y="20" width="32" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<rect x="6" y="34" width="108" height="14" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-opacity=".25"/>' +
			'<rect x="12" y="39" width="26" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
	{
		value: "Paper Sheet",
		blurb: () => __("One elevated sheet; sections divide inside it."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="8" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".4"/>' +
			'<rect x="30" y="6" width="16" height="3" rx="1.5" fill="currentColor" opacity=".2"/>' +
			'<rect x="6" y="14" width="108" height="34" rx="4" fill="currentColor" opacity=".08" stroke="currentColor" stroke-opacity=".25"/>' +
			'<rect x="12" y="20" width="32" height="4" rx="2" fill="currentColor" opacity=".4"/>' +
			'<line x1="12" y1="32" x2="108" y2="32" stroke="currentColor" opacity=".2"/>' +
			'<rect x="12" y="38" width="26" height="4" rx="2" fill="currentColor" opacity=".4"/></svg>',
	},
];

/** The two composing option groups. */
const BND_FORM_GROUPS = [
	{
		field: "form_tabs",
		title: () => __("Tabs"),
		desc: () => __("How the active tab announces itself."),
		options: [
			{ value: "Brand Underline", name: () => __("Brand Underline") },
			{ value: "Segment Pills", name: () => __("Segment Pills") },
			{ value: "Solid Pill", name: () => __("Solid Pill") },
		],
	},
	{
		field: "form_sidebar",
		title: () => __("Sidebar"),
		desc: () => __("How the record's sidebar separates from the document."),
		options: [
			{ value: "Hairline Edge", name: () => __("Hairline Edge") },
			{ value: "Quiet Pane", name: () => __("Quiet Pane") },
			{ value: "Floating Pane", name: () => __("Floating Pane") },
		],
	},
];

const BND_FORM_TOGGLES = [
	{
		field: "form_grid_checkbox_reveal",
		name: () => __("Reveal grid checkboxes on hover"),
		desc: () => __("Grid rows rest clean; a checkbox appears on hover or keyboard focus, and all of them while anything is selected. Always visible on touch."),
	},
];

/** Render the form picker. */
function bnd_render_form_picker(frm, host) {
	const $host = bnd_picker_host(frm, "form_picker", host);
	if (!$host) return;

	const current = frm.doc.form_style || BND_FORM_DEFAULTS.form_style;
	const off = current === "Original";

	// Filtered against the field's real options — the rule that retired the
	// status Off-card wedge class of bug.
	const offered = bnd_field_slots(frm, "form_style");
	const cards = P.cards(
		BND_FORM_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-fvp-style" }
	);

	const reason = off ? __("Original leaves the stock form untouched — nothing below applies.") : "";
	const groups = BND_FORM_GROUPS.map((g) =>
		P.group({
			title: g.title(),
			desc: g.desc(),
			field: g.field,
			body: P.options(
				g.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: g.field, value: frm.doc[g.field] || BND_FORM_DEFAULTS[g.field] }
			),
		})
	).join("");

	const toggles = BND_FORM_TOGGLES.map((t) =>
		P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason,
			// The picker's own hook class — omitting it is the recorded
			// inert-switch failure (the status kit's toggles, 2026-08-08).
			cls: "bnd-fvp-toggle",
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-fvp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups + '<div class="bnd-cbp-switches">' + toggles + "</div>" },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-fvp-style").on("click", function () {
		bnd_form_set(frm, "form_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-fvp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_form_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_form_set(frm, f, BND_FORM_DEFAULTS[f]);
	});
}

/** Hand the form's current form-kit values to the desk engine — live preview. */
function bnd_form_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.form_apply) return;
	const values = {};
	for (const f of BND_FORM_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.form_apply(values);
}

/** Set one form option, preview, re-render. */
function bnd_form_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_form_preview(frm);
	bnd_render_form_picker(frm);
}

// ── Workspace picker (item 25) — 7 tile styles, a rows group, a menu toggle ──
/** Client mirror of presets.WORKSPACE_FIELDS — keep in sync. Export AND import list it. */
const BND_WORKSPACE_FIELDS = ["workspace_style", "workspace_metric", "workspace_rows", "workspace_menu_reveal"];

/** Client mirror of presets.WORKSPACE_DEFAULTS — keep in sync. */
const BND_WORKSPACE_DEFAULTS = {
	workspace_style: "Hairline Grid",
	workspace_metric: "Display",
	workspace_rows: "Edge Rail",
	workspace_menu_reveal: 1,
};

/** The tile-style catalogue. Thumbnails are a mini workspace: a title, a row of
 * small tiles, and a wide tile beneath — the shape of a real board. */
const BND_WORKSPACE_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock workspace, untouched. The whole kit stands down."),
		svg: bnd_ws_thumb({ tileFill: "none", tileStroke: ".28", gap: 5, radius: 3 }),
	},
	{
		value: "Open Board",
		blurb: () => __("No tile at all — whitespace and titles carry the structure."),
		svg: bnd_ws_thumb({ tileFill: "none", tileStroke: "0", gap: 8, radius: 0 }),
	},
	{
		value: "Hairline Grid",
		blurb: () => __("A gapless contact sheet — tiles butt together, sharing one hairline."),
		svg: bnd_ws_thumb({ tileFill: ".02", tileStroke: ".3", gap: 0, radius: 0, outer: true }),
	},
	{
		value: "Soft Tiles",
		blurb: () => __("White canvas, quiet filled tiles, no border."),
		svg: bnd_ws_thumb({ tileFill: ".09", tileStroke: "0", gap: 5, radius: 4, canvas: "0" }),
	},
	{
		value: "Headed Panel",
		blurb: () => __("Each tile gets a tinted title band with a rule beneath."),
		svg: bnd_ws_thumb({ tileFill: "none", tileStroke: ".28", gap: 5, radius: 3, headed: true }),
	},
	{
		value: "Floating Cards",
		blurb: () => __("Lifted cards on a tinted canvas — the current look, turned up."),
		svg: bnd_ws_thumb({ tileFill: ".08", tileStroke: ".22", gap: 7, radius: 4, shadow: true }),
	},
	{
		value: "Mixed Weights",
		blurb: () => __("Treatment by what the block is: charts lift, links recede."),
		svg: bnd_ws_thumb({ mixed: true, gap: 5, radius: 3 }),
	},
];

/** One workspace thumbnail. Kept as a builder so seven near-identical diagrams
 * are one description, not seven copies that drift. */
function bnd_ws_thumb(o) {
	const g = o.gap, r = o.radius;
	const cv = o.canvas !== undefined
		? `<rect x="1" y="1" width="118" height="52" rx="4" fill="currentColor" opacity="${o.canvas}"/>`
		: "";
	const frame = '<rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>';
	const title = '<rect x="8" y="6" width="26" height="3" rx="1.5" fill="currentColor" opacity=".4"/>';
	const tile = (x, y, w, h, opts) => {
		const fill = opts.fill === "none" ? "" : ` fill="currentColor" fill-opacity="${opts.fill}"`;
		const stroke = opts.stroke === "0" ? "" : ` stroke="currentColor" stroke-opacity="${opts.stroke}"`;
		const sh = opts.shadow ? ' filter="url(#wsh)"' : "";
		let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.radius}"${fill}${stroke}${sh}/>`;
		if (opts.headed) {
			s += `<rect x="${x}" y="${y}" width="${w}" height="5" rx="${opts.radius}" fill="currentColor" opacity=".1"/>`;
			s += `<line x1="${x}" y1="${y + 5}" x2="${x + w}" y2="${y + 5}" stroke="currentColor" opacity=".25"/>`;
		}
		return s;
	};
	const defs = o.shadow
		? '<defs><filter id="wsh" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#0b2b1e" flood-opacity=".22"/></filter></defs>'
		: "";
	let body = "";
	if (o.mixed) {
		// three small tiles: a lifted chart-ish tile, two flat link lists
		body =
			'<rect x="8" y="14" width="32" height="16" rx="3" fill="currentColor" fill-opacity=".08" filter="url(#wsh)"/>' +
			'<polyline points="12,26 20,20 28,24 36,17" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/>' +
			'<rect x="46" y="15" width="26" height="3" rx="1.5" fill="currentColor" opacity=".3"/>' +
			'<rect x="46" y="21" width="22" height="2.4" rx="1.2" fill="currentColor" opacity=".18"/>' +
			'<rect x="46" y="26" width="24" height="2.4" rx="1.2" fill="currentColor" opacity=".18"/>' +
			'<rect x="80" y="15" width="26" height="3" rx="1.5" fill="currentColor" opacity=".3"/>' +
			'<rect x="80" y="21" width="20" height="2.4" rx="1.2" fill="currentColor" opacity=".18"/>' +
			'<rect x="80" y="26" width="24" height="2.4" rx="1.2" fill="currentColor" opacity=".18"/>' +
			tile(8, 36, 98, 12, { fill: ".08", stroke: "0", radius: 3, shadow: true });
	} else {
		const opts = { fill: o.tileFill, stroke: o.tileStroke, radius: r, headed: o.headed, shadow: o.shadow };
		const x0 = 8 - (o.outer ? 0 : 0);
		const w = (98 - 2 * g) / 3;
		body =
			tile(8, 14, w, 16, opts) +
			tile(8 + w + g, 14, w, 16, opts) +
			tile(8 + 2 * (w + g), 14, w, 16, opts) +
			tile(8, 34 + (g ? 0 : 0), 98, 14, opts);
		if (o.outer) body = `<g>${body}</g>`;
	}
	return `<svg viewBox="0 0 120 54">${defs}${frame}${cv}${title}${body}</svg>`;
}

/** The composing option groups — the number card's figure, and card rows. */
const BND_WORKSPACE_GROUPS = [
	{
		field: "workspace_metric",
		title: () => __("Number cards"),
		desc: () => __("How a number card presents its figure."),
		options: [
			{ value: "Quiet", name: () => __("Quiet") },
			{ value: "Display", name: () => __("Display") },
			{ value: "Headline", name: () => __("Headline") },
			{ value: "Centred", name: () => __("Centred") },
			{ value: "Inline", name: () => __("Inline") },
		],
	},
	{
		field: "workspace_rows",
		title: () => __("Card rows"),
		desc: () => __("How the links inside a card behave on hover."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Divided", name: () => __("Divided") },
			{ value: "Edge Rail", name: () => __("Edge Rail") },
		],
	},
];

const BND_WORKSPACE_TOGGLES = [
	{
		field: "workspace_menu_reveal",
		name: () => __("Reveal card menus on hover"),
		desc: () => __("A card's ⋯ menu rests hidden and appears on hover or keyboard focus. Always visible on touch."),
	},
];

/** Render the workspace picker. */
function bnd_render_workspace_picker(frm, host) {
	const $host = bnd_picker_host(frm, "workspace_picker", host);
	if (!$host) return;

	const current = frm.doc.workspace_style || BND_WORKSPACE_DEFAULTS.workspace_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "workspace_style");
	const cards = P.cards(
		BND_WORKSPACE_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-wsp-style" }
	);

	const reason = off ? __("Original leaves the stock workspace untouched — nothing below applies.") : "";
	const groups = BND_WORKSPACE_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_WORKSPACE_DEFAULTS[grp.field] }),
		})
	).join("");

	const toggles = BND_WORKSPACE_TOGGLES.map((t) =>
		P.toggle({
			field: t.field, on: !!parseInt(frm.doc[t.field], 10), name: t.name(), desc: t.desc(), reason,
			cls: "bnd-wsp-toggle",
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-wsp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups + '<div class="bnd-cbp-switches">' + toggles + "</div>" },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-wsp-style").on("click", function () {
		bnd_workspace_set(frm, "workspace_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-wsp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_workspace_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_workspace_set(frm, f, BND_WORKSPACE_DEFAULTS[f]);
	});
}

/** Hand the workspace values to the desk engine — live preview. */
function bnd_workspace_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.workspace_apply) return;
	const values = {};
	for (const f of BND_WORKSPACE_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.workspace_apply(values);
}

/** Set one workspace option, preview, re-render. */
function bnd_workspace_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_workspace_preview(frm);
	bnd_render_workspace_picker(frm);
}

// ── Chart picker (item 25) — one card axis, no Original ──────────────────────
/** Client mirror of presets.CHART_FIELDS — keep in sync. Export AND import list it. */
const BND_CHART_FIELDS = ["chart_grid"];

/** Client mirror of presets.CHART_DEFAULTS — keep in sync. */
const BND_CHART_DEFAULTS = { chart_grid: "Filled Area" };

/** The chart_grid catalogue. Thumbnails are a small chart showing the frame the
 * style produces: gridlines, an axis, a data line, and — for Filled Area — the
 * area beneath it. No "Original": the base chart theming is always on. */
const BND_CHART_STYLES = [
	{
		value: "Hairline Axes",
		blurb: () => __("Both gridlines, a quiet hairline in each direction."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<g stroke="currentColor" opacity=".18"><line x1="20" y1="14" x2="110" y2="14"/><line x1="20" y1="26" x2="110" y2="26"/><line x1="20" y1="38" x2="110" y2="38"/>' +
			'<line x1="42" y1="10" x2="42" y2="44"/><line x1="66" y1="10" x2="66" y2="44"/><line x1="90" y1="10" x2="90" y2="44"/></g>' +
			'<line x1="20" y1="44" x2="110" y2="44" stroke="currentColor" opacity=".4"/>' +
			'<polyline points="20,38 42,26 66,30 90,16 110,22" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
	},
	{
		value: "Ruled Baseline",
		blurb: () => __("Horizontal rules only — the value scale, and nothing competing with it."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<g stroke="currentColor" opacity=".18"><line x1="20" y1="14" x2="110" y2="14"/><line x1="20" y1="26" x2="110" y2="26"/><line x1="20" y1="38" x2="110" y2="38"/></g>' +
			'<line x1="20" y1="44" x2="110" y2="44" stroke="currentColor" opacity=".4"/>' +
			'<polyline points="20,38 42,26 66,30 90,16 110,22" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
	},
	{
		value: "Dashed Guides",
		blurb: () => __("Gridlines become dashed guides; the solid axis stands down."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<g stroke="currentColor" opacity=".2" stroke-dasharray="3 2"><line x1="20" y1="14" x2="110" y2="14"/><line x1="20" y1="26" x2="110" y2="26"/><line x1="20" y1="38" x2="110" y2="38"/></g>' +
			'<polyline points="20,38 42,26 66,30 90,16 110,22" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
	},
	{
		value: "Bold Data",
		blurb: () => __("The frame drops to a wash; the line thickens and its points grow."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<g stroke="currentColor" opacity=".1"><line x1="20" y1="20" x2="110" y2="20"/><line x1="20" y1="32" x2="110" y2="32"/></g>' +
			'<polyline points="20,38 42,26 66,30 90,16 110,22" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
			'<circle cx="66" cy="30" r="2.6" fill="currentColor"/><circle cx="90" cy="16" r="2.6" fill="currentColor"/></svg>',
	},
	{
		value: "Filled Area",
		blurb: () => __("The area under the line carries the chart — the modern analytics look."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<g stroke="currentColor" opacity=".1"><line x1="20" y1="20" x2="110" y2="20"/><line x1="20" y1="32" x2="110" y2="32"/></g>' +
			'<path d="M20,38 42,26 66,30 90,16 110,22 110,44 20,44 Z" fill="currentColor" opacity=".18"/>' +
			'<polyline points="20,38 42,26 66,30 90,16 110,22" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
	},
];

/** Render the chart picker. */
function bnd_render_chart_picker(frm, host) {
	const $host = bnd_picker_host(frm, "chart_picker", host);
	if (!$host) return;

	const current = frm.doc.chart_grid || BND_CHART_DEFAULTS.chart_grid;
	const cards = P.cards(
		BND_CHART_STYLES.map((s) => ({ value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg })),
		{ selected: current, cls: "bnd-cbp-style bnd-chp-style" }
	);

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-chp">' +
				bnd_bands([{ zone: "style", html: cards + P.note(__("Applies as you click. Series colours are set automatically for legibility.")) }]) +
				"</div>"
		)
	);

	$host.find(".bnd-chp-style").on("click", function () {
		bnd_chart_set(frm, "chart_grid", this.getAttribute("data-value"));
	});
	// NO RESET BINDING HERE, and that is not an omission: this picker renders
	// no `P.group`, so it emits no `.bnd-cbp-reset` and the handler that used
	// to sit here matched nothing (item 36's picker audit). `assertResetChipsBound`
	// only guards render-without-bind, so the inverse — a binding with nothing
	// to bind — read as coverage while being dead code. Deleted rather than
	// answered with a chip: adding one would change this picker's complement,
	// which the suite and the shape fixture both pin.
}

/** Hand the chart values to the desk engine — live preview. */
function bnd_chart_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.chart_apply) return;
	const values = {};
	for (const f of BND_CHART_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.chart_apply(values);
}

/** Set the chart option, preview, re-render. */
function bnd_chart_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_chart_preview(frm);
	bnd_render_chart_picker(frm);
}

// ── Report / datatable picker (item 26) — five styles, two chip rows, a toggle ─
/** Client mirror of presets.REPORT_FIELDS. Keep in sync. Export AND import list it. */
const BND_REPORT_FIELDS = ["report_style", "report_grain", "report_rows", "report_checkbox_reveal"];

/** Client mirror of presets.REPORT_DEFAULTS — keep in sync. */
const BND_REPORT_DEFAULTS = {
	report_style: "Pinned Slab",
	report_grain: "Row Stripes",
	report_rows: "Edge Rail",
	report_checkbox_reveal: 1,
};

/** The table-style catalogue. Each thumbnail is a mini datatable — a header band
 * over three rows — drawn to that style's fill, boundary and grid. */
const BND_REPORT_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock table, untouched. The whole kit stands down."),
		svg: bnd_rpt_thumb({ headFill: 0, gridX: 0, gridY: 0.14, headSep: 0 }),
	},
	{
		value: "Ruled Grid",
		blurb: () => __("A full spreadsheet grid — every cell bordered."),
		svg: bnd_rpt_thumb({ headFill: 0.06, gridX: 0.2, gridY: 0.2, headSep: 0.32 }),
	},
	{
		value: "Ledger Rows",
		blurb: () => __("Horizontal rules only — the accounting ledger, header on the canvas."),
		svg: bnd_rpt_thumb({ headFill: 0, gridX: 0, gridY: 0.2, headSep: 0.32 }),
	},
	{
		value: "Open Sheet",
		blurb: () => __("Whitespace carries it — one rule under the header, no grid."),
		svg: bnd_rpt_thumb({ headFill: 0, gridX: 0, gridY: 0, headSep: 0.14 }),
	},
	{
		value: "Pinned Slab",
		blurb: () => __("A filled, lifted header slab over clean rows — the default."),
		svg: bnd_rpt_thumb({ headFill: 0.09, gridX: 0, gridY: 0.12, headSep: 0.32, shadow: true }),
	},
];

/** One datatable thumbnail — a header band over three rows. A builder so five
 * near-identical diagrams are one description, not five copies that drift. */
function bnd_rpt_thumb(o) {
	const frame = '<rect x="1" y="1" width="118" height="52" rx="3" fill="none" stroke="currentColor" opacity=".2"/>';
	const headFill = o.headFill
		? `<rect x="1.5" y="1.5" width="117" height="12.5" rx="2" fill="currentColor" fill-opacity="${o.headFill}"/>`
		: "";
	const shadow = o.shadow ? '<rect x="1.5" y="14" width="117" height="2" fill="currentColor" opacity=".07"/>' : "";
	const headLabels = [10, 48, 86]
		.map((x) => `<rect x="${x}" y="6" width="22" height="2.6" rx="1.3" fill="currentColor" opacity=".5"/>`)
		.join("");
	const headSep = o.headSep
		? `<line x1="1.5" y1="14" x2="118.5" y2="14" stroke="currentColor" stroke-width="1" opacity="${o.headSep}"/>`
		: "";
	let rows = "";
	for (const y of [17, 29, 41]) {
		rows += [12, 50, 88]
			.map((x, ci) => `<rect x="${x}" y="${y + 3}" width="${ci === 0 ? 26 : 20}" height="2.4" rx="1.2" fill="currentColor" opacity=".26"/>`)
			.join("");
		if (o.gridY) rows += `<line x1="1.5" y1="${y + 12}" x2="118.5" y2="${y + 12}" stroke="currentColor" opacity="${o.gridY}"/>`;
	}
	const vlines = o.gridX
		? [42, 82].map((x) => `<line x1="${x}" y1="15" x2="${x}" y2="53" stroke="currentColor" opacity="${o.gridX}"/>`).join("")
		: "";
	return `<svg viewBox="0 0 120 54">${frame}${headFill}${shadow}${headLabels}${headSep}${rows}${vlines}</svg>`;
}

/** The composing chip rows — the table grain and the row feedback. */
const BND_REPORT_GROUPS = [
	{
		field: "report_grain",
		title: () => __("Table grain"),
		desc: () => __("The table's background grain."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Row Stripes", name: () => __("Row Stripes") },
		],
	},
	{
		field: "report_rows",
		title: () => __("Row feedback"),
		desc: () => __("How a row responds to hover and selection."),
		options: [
			{ value: "Soft Wash", name: () => __("Soft Wash") },
			{ value: "Edge Rail", name: () => __("Edge Rail") },
			{ value: "Bold Bar", name: () => __("Bold Bar") },
		],
	},
];

const BND_REPORT_TOGGLES = [
	{
		field: "report_checkbox_reveal",
		name: () => __("Reveal row checkboxes on hover"),
		desc: () => __("A row's checkbox rests hidden and appears on hover or keyboard focus. Always visible on touch, and never hidden in a selection dialog."),
	},
];

/** Render the report / datatable picker. */
function bnd_render_report_picker(frm, host) {
	const $host = bnd_picker_host(frm, "report_picker", host);
	if (!$host) return;

	const current = frm.doc.report_style || BND_REPORT_DEFAULTS.report_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "report_style");
	const cards = P.cards(
		BND_REPORT_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-rvp-style" }
	);

	const reason = off ? __("Original leaves every data table stock — nothing below applies.") : "";
	const groups = BND_REPORT_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_REPORT_DEFAULTS[grp.field] }),
		})
	).join("");

	const toggles = BND_REPORT_TOGGLES.map((t) =>
		P.toggle({
			field: t.field, on: !!parseInt(frm.doc[t.field], 10), name: t.name(), desc: t.desc(), reason,
			cls: "bnd-rvp-toggle",
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-rvp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups + '<div class="bnd-cbp-switches">' + toggles + "</div>" },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-rvp-style").on("click", function () {
		bnd_report_set(frm, "report_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-rvp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_report_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_report_set(frm, f, BND_REPORT_DEFAULTS[f]);
	});
}

/** Hand the report values to the desk engine — live preview. */
function bnd_report_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.report_apply) return;
	const values = {};
	for (const f of BND_REPORT_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.report_apply(values);
}

/** Set one report option, preview, re-render. */
function bnd_report_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_report_preview(frm);
	bnd_render_report_picker(frm);
}

// ── Alternate-views picker (item 27) — five styles, three chip rows, a toggle ─
/** Client mirror of presets.VIEWS_FIELDS. Keep in sync. Export AND import list it. */
const BND_VIEWS_FIELDS = ["views_style", "views_band", "views_mark", "views_media", "views_reveal"];

/** Client mirror of presets.VIEWS_DEFAULTS — keep in sync. */
const BND_VIEWS_DEFAULTS = {
	views_style: "Floating Cards",
	views_band: "Tinted",
	views_mark: "Chip",
	views_media: "Cover",
	views_reveal: 1,
};

/** The view-style catalogue. Each thumbnail is a mini object — a card — drawn to
 * that style's fill, boundary, radius and lift. ONE anchor dresses the kanban
 * card, gallery tile and calendar chip the same way, so one card stands for all. */
const BND_VIEWS_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock views, untouched. The whole kit stands down."),
		svg: bnd_view_thumb({ border: 0.16 }),
	},
	{
		value: "Hairline",
		blurb: () => __("A boundary only, no fill — the densest object, the theme receding."),
		svg: bnd_view_thumb({ border: 0.42, radius: 3 }),
	},
	{
		value: "Soft Tiles",
		blurb: () => __("A soft filled tile, no border — a quiet contact sheet."),
		svg: bnd_view_thumb({ fill: 0.06, radius: 6 }),
	},
	{
		value: "Floating Cards",
		blurb: () => __("Fill, boundary and a soft lift — the object reads as a card. The default."),
		svg: bnd_view_thumb({ fill: 0.05, border: 0.16, radius: 6, shadow: true }),
	},
	{
		value: "Solid Panels",
		blurb: () => __("A strong fill and a strong edge, flat — crisp on a dense board."),
		svg: bnd_view_thumb({ fill: 0.12, border: 0.36, radius: 2 }),
	},
];

/** One object thumbnail — a card with two content lines. A builder so five
 * near-identical diagrams are one description, not five copies that drift. */
function bnd_view_thumb(o) {
	const rx = o.radius || 0;
	const shadow = o.shadow
		? `<rect x="19" y="15" width="82" height="26" rx="${rx}" fill="currentColor" opacity=".09"/>`
		: "";
	const fill = o.fill ? `fill="currentColor" fill-opacity="${o.fill}"` : 'fill="none"';
	const stroke = o.border ? `stroke="currentColor" stroke-opacity="${o.border}" stroke-width="1"` : "";
	const card = `<rect x="18" y="12" width="82" height="26" rx="${rx}" ${fill} ${stroke}/>`;
	const lines =
		'<rect x="24" y="18" width="38" height="3" rx="1.5" fill="currentColor" opacity=".55"/>' +
		'<rect x="24" y="26" width="58" height="2.6" rx="1.3" fill="currentColor" opacity=".28"/>';
	return `<svg viewBox="0 0 120 54">${shadow}${card}${lines}</svg>`;
}

/** The composing chip rows — the kanban band, the calendar mark, the image fit. */
const BND_VIEWS_GROUPS = [
	{
		field: "views_band",
		title: () => __("Kanban Column"),
		desc: () => __("Whether a kanban column carries its status colour."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Tinted", name: () => __("Tinted") },
		],
	},
	{
		field: "views_mark",
		title: () => __("Calendar Event"),
		desc: () => __("The shape of a calendar event."),
		options: [
			{ value: "Dot", name: () => __("Dot") },
			{ value: "Chip", name: () => __("Chip") },
			{ value: "Outlined", name: () => __("Outlined") },
		],
	},
	{
		field: "views_media",
		title: () => __("Image Fit"),
		desc: () => __("How a gallery image fills its tile."),
		options: [
			{ value: "Cover", name: () => __("Cover") },
			{ value: "Contain", name: () => __("Contain") },
		],
	},
];

const BND_VIEWS_TOGGLES = [
	{
		field: "views_reveal",
		name: () => __("Reveal controls on hover"),
		desc: () => __("A gallery tile's controls rest hidden and appear on hover or keyboard focus. Always visible on touch."),
	},
];

/** Render the alternate-views picker. */
function bnd_render_views_picker(frm, host) {
	const $host = bnd_picker_host(frm, "views_picker", host);
	if (!$host) return;

	const current = frm.doc.views_style || BND_VIEWS_DEFAULTS.views_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "views_style");
	const cards = P.cards(
		BND_VIEWS_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-avp-style" }
	);

	const reason = off ? __("Original leaves every alternate view stock — nothing below applies.") : "";
	const groups = BND_VIEWS_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_VIEWS_DEFAULTS[grp.field] }),
		})
	).join("");

	const toggles = BND_VIEWS_TOGGLES.map((t) =>
		P.toggle({
			field: t.field, on: !!parseInt(frm.doc[t.field], 10), name: t.name(), desc: t.desc(), reason,
			cls: "bnd-avp-toggle",
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-avp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups + '<div class="bnd-cbp-switches">' + toggles + "</div>" },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-avp-style").on("click", function () {
		bnd_views_set(frm, "views_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt, .bnd-avp-toggle").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_views_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_views_set(frm, f, BND_VIEWS_DEFAULTS[f]);
	});
}

/** Hand the view values to the desk engine — live preview. */
function bnd_views_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.views_apply) return;
	const values = {};
	for (const f of BND_VIEWS_FIELDS) values[f] = frm.doc[f];
	window.bunood_theme.views_apply(values);
}

/** Set one view option, preview, re-render. */
function bnd_views_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_views_preview(frm);
	bnd_render_views_picker(frm);
}

// ── Overlays picker (item 28) — five styles, two chip rows, no toggle ────────
/** Client mirror of presets.OVERLAY_FIELDS. Keep in sync. Export AND import list it. */
const BND_OVERLAY_FIELDS = ["overlay_style", "overlay_scrim", "overlay_menu"];

/** Client mirror of presets.EMPTY_FIELDS — kept a superset by assertFieldMirrors. */
const BND_EMPTY_FIELDS = ["empty_style", "empty_media", "empty_action"];

/** Client mirror of presets.SKELETON_FIELDS — kept a superset by assertFieldMirrors. */
const BND_SKELETON_FIELDS = ["skeleton_style"];
// The JS mirror of presets.FILTERS_FIELDS. `assertFieldMirrors` gates that
// this is a SUPERSET of it — the item-18 "escapee" class, which bit items 25
// and 26 before that guard existed.
const BND_FILTERS_FIELDS = ["filters_style", "filters_applied", "filters_saved"];
const BND_FILTERS_DEFAULTS = {
	filters_style: "Outlined",
	filters_applied: "Accented",
	filters_saved: "Listed",
};

// The JS mirror of presets.LOGIN_FIELDS (item 32).
//
// DECLARED BEFORE THERE IS A PICKER TO USE IT, on purpose. `assertFieldMirrors`
// skips any family with no `BND_<X>_FIELDS` at all — `!(name in js) continue` —
// so a kit that ships its Python fields first and its mirror later is exempt
// from the guard for exactly as long as it takes to forget. That is the item-25
// / item-26 escapee's own hiding place. Two lines close it from day one.
const BND_LOGIN_FIELDS = ["login_style", "login_action", "login_theme"];

/** Client mirror of presets.WEB_FIELDS. Keep in sync — `assertFieldMirrors`
 * SKIPS a family that has no mirror here, so an absent one is not a warning,
 * it is a hole. Item 32 closed that hole; do not reopen it. */
const BND_WEB_FIELDS = ["web_style", "web_header", "web_theme"];
const BND_WEB_DEFAULTS = {
	web_style: "Panel",
	web_header: "Branded",
	web_theme: "Follow OS",
};
const BND_LOGIN_DEFAULTS = {
	login_style: "Split",
	login_action: "Branded",
	login_theme: "Follow OS",
};

/**
 * Client mirror of presets.EMAIL_FIELDS (item 34).
 *
 * Landed WITH the Python rather than after it. `assertFieldMirrors` SKIPS a
 * family that has no `BND_<X>_FIELDS` at all — `!(name in js) continue` — so a
 * kit shipping its Python fields first and its mirror later is exempt from the
 * guard for exactly as long as it takes to forget. Item 32 closed that hole;
 * this is not the place to reopen it.
 */
const BND_EMAIL_FIELDS = ["email_style", "email_header", "email_action", "email_theme"];
const BND_EMAIL_DEFAULTS = {
	email_style: "Card",
	email_header: "Logo + wordmark",
	email_action: "Brand fill",
	email_theme: "Follow the client",
};

/** Client mirror of presets.PRINT_FIELDS. Keep in sync. */
const BND_PRINT_FIELDS = [
	"print_header_style", "print_table_style", "print_totals_style",
	"print_heading_style", "print_accent", "print_letterhead",
	"print_title_lang", "print_qr", "print_qr_place", "print_qr_size",
	"print_words", "print_signatures",
];
const BND_PRINT_DEFAULTS = {
	print_header_style: "Wash Card",
	print_table_style: "Washed",
	print_totals_style: "Washed Panel",
	print_heading_style: "Original",
	print_accent: "Brand panels",
	print_letterhead: "Bilingual Split",
	print_title_lang: "Both",
	print_qr: "Show",
	print_qr_place: "Head end",
	print_qr_size: "Medium",
	print_words: "Show",
	print_signatures: "Three lines",
};

/** Client mirror of presets.SKELETON_DEFAULTS — keep in sync. */
const BND_SKELETON_DEFAULTS = {
	skeleton_style: "Sweep",
};

/** Client mirror of presets.EMPTY_DEFAULTS — keep in sync. */
const BND_EMPTY_DEFAULTS = {
	empty_style: "Open",
	empty_media: "Marked",
	empty_action: "Primary",
};

/** Client mirror of presets.OVERLAY_DEFAULTS — keep in sync. */
const BND_OVERLAY_DEFAULTS = {
	overlay_style: "Floating",
	overlay_scrim: "Tinted",
	overlay_menu: "Inset",
};

/** The overlay-style catalogue. Each thumbnail is one floating panel drawn to
 * that style's fill, boundary, radius and lift. ONE anchor dresses the dialog,
 * the menu, the toast and the popover the same way, so one panel stands for all
 * of them — the same reasoning the views picker's single card stands on. */
const BND_OVERLAY_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock overlays, untouched. The style stands down — the legibility repairs stay."),
		svg: bnd_overlay_thumb({ border: 0.16, radius: 2 }),
	},
	{
		value: "Hairline",
		blurb: () => __("A boundary only, no lift — the densest panel, the theme receding."),
		svg: bnd_overlay_thumb({ border: 0.42, radius: 2 }),
	},
	{
		value: "Soft",
		blurb: () => __("A boundary and a close shadow — the quieter middle."),
		svg: bnd_overlay_thumb({ fill: 0.05, border: 0.16, radius: 5, shadow: 0.1 }),
	},
	{
		value: "Floating",
		blurb: () => __("A hairline ring and a deep shadow — the panel lifts clear of the page. The default."),
		svg: bnd_overlay_thumb({ fill: 0.05, border: 0.14, radius: 7, shadow: 0.18 }),
	},
	{
		value: "Solid",
		blurb: () => __("A raised fill and no boundary — the panel separates by tone."),
		svg: bnd_overlay_thumb({ fill: 0.14, radius: 5, shadow: 0.16 }),
	},
];

/** One panel thumbnail, floating over a hint of the page beneath. A builder so
 * five near-identical diagrams are one description, not five copies that drift. */
function bnd_overlay_thumb(o) {
	const rx = o.radius || 0;
	// the page underneath, so "floating" reads as floating
	const page =
		'<rect x="6" y="8" width="46" height="3" rx="1.5" fill="currentColor" opacity=".16"/>' +
		'<rect x="6" y="15" width="72" height="3" rx="1.5" fill="currentColor" opacity=".12"/>' +
		'<rect x="6" y="44" width="60" height="3" rx="1.5" fill="currentColor" opacity=".12"/>';
	const shadow = o.shadow
		? `<rect x="26" y="17" width="76" height="30" rx="${rx}" fill="currentColor" opacity="${o.shadow}"/>`
		: "";
	const fill = o.fill ? `fill="currentColor" fill-opacity="${o.fill}"` : 'fill="none"';
	const stroke = o.border ? `stroke="currentColor" stroke-opacity="${o.border}" stroke-width="1"` : "";
	const panel = `<rect x="26" y="14" width="76" height="30" rx="${rx}" ${fill} ${stroke}/>`;
	// a title rule and one row, so the panel reads as a dialog rather than a box
	const inner =
		'<rect x="32" y="20" width="30" height="3" rx="1.5" fill="currentColor" opacity=".5"/>' +
		`<rect x="26" y="27" width="76" height="1" fill="currentColor" opacity="${o.border || 0.14}"/>` +
		'<rect x="32" y="33" width="50" height="3" rx="1.5" fill="currentColor" opacity=".26"/>';
	return `<svg viewBox="0 0 120 54">${page}${shadow}${panel}${inner}</svg>`;
}

/** The composing chip rows — the dialog scrim and the menu row. */
const BND_OVERLAY_GROUPS = [
	{
		field: "overlay_scrim",
		title: () => __("Dialog Scrim"),
		desc: () => __("What the page behind a dialog looks like."),
		options: [
			{ value: "Dim", name: () => __("Dim") },
			{ value: "Tinted", name: () => __("Tinted") },
			{ value: "Blurred", name: () => __("Blurred") },
		],
	},
	{
		field: "overlay_menu",
		title: () => __("Menu Row"),
		desc: () => __("How a menu row shows it is under the pointer."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Inset", name: () => __("Inset") },
		],
	},
];

/** Render the overlays picker. No toggle row: this kit's repairs are contracts,
 * not options, so there is nothing to switch off. */
function bnd_render_overlay_picker(frm, host) {
	const $host = bnd_picker_host(frm, "overlay_picker", host);
	if (!$host) return;

	const current = frm.doc.overlay_style || BND_OVERLAY_DEFAULTS.overlay_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "overlay_style");
	const cards = P.cards(
		BND_OVERLAY_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-ovp-style" }
	);

	const reason = off ? __("Original leaves every overlay stock — nothing below applies.") : "";
	const groups = BND_OVERLAY_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_OVERLAY_DEFAULTS[grp.field] }),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-ovp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-ovp-style").on("click", function () {
		bnd_overlay_set(frm, "overlay_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_overlay_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_overlay_set(frm, f, BND_OVERLAY_DEFAULTS[f]);
	});
}

/** Hand the overlay values to the desk engine — live preview. */
function bnd_overlay_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.overlay_apply) return;
	const values = {};
	// `|| DEFAULT` matters: on a site where a field was never written,
	// frm.doc[f] is empty and sending it raw CLEARS the anchor the boot payload
	// had just set — opening the settings form would strip the style. The two
	// call sites in the renderer above already fall back; this one did not.
	for (const f of BND_OVERLAY_FIELDS) values[f] = frm.doc[f] || BND_OVERLAY_DEFAULTS[f];
	window.bunood_theme.overlay_apply(values);
}

/** Set one overlay option, preview, re-render. */
function bnd_overlay_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_overlay_preview(frm);
	bnd_render_overlay_picker(frm);
}

/** The empty-state catalogue. Each thumbnail is the same block — a mark, a
 * line of message, a button — drawn to that style's air, boundary and tone,
 * because ONE anchor dresses the list's no-result, the report's box, the
 * dashboard's, the inbox view's and the 404 alike. */
const BND_EMPTY_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock empty states, untouched. The style stands down — the legibility repairs stay."),
		svg: bnd_empty_thumb({}),
	},
	{
		value: "Quiet",
		blurb: () => __("Separated by nothing — ink and a little air, for a desk that wants its empty screens to recede."),
		svg: bnd_empty_thumb({ pad: 3 }),
	},
	{
		value: "Open",
		blurb: () => __("Separated by AIR — generous space and no frame. The default, because this block sits inside containers that already frame it."),
		svg: bnd_empty_thumb({ pad: 9 }),
	},
	{
		value: "Framed",
		blurb: () => __("Separated by a hairline — the block becomes a card with a boundary and no fill."),
		svg: bnd_empty_thumb({ pad: 6, border: 0.34, radius: 5 }),
	},
	{
		value: "Filled",
		blurb: () => __("Separated by TONE — a filled card with no boundary."),
		svg: bnd_empty_thumb({ pad: 6, fill: 0.1, radius: 5 }),
	},
];

/** One empty-state thumbnail: mark, message, button, inside the block. A
 * builder so five near-identical diagrams are one description, not five
 * copies that drift. */
function bnd_empty_thumb(o) {
	const rx = o.radius || 0;
	// the surface the block sits in, so "framed" and "filled" read as against
	// something rather than floating in nothing
	const surface = '<rect x="2" y="2" width="116" height="50" rx="2" fill="currentColor" opacity=".05"/>';
	const pad = o.pad === undefined ? 6 : o.pad;
	const y = 27 - pad;
	const h = Math.max(14, pad * 2 + 14);
	const fill = o.fill ? `fill="currentColor" fill-opacity="${o.fill}"` : 'fill="none"';
	const stroke = o.border ? `stroke="currentColor" stroke-opacity="${o.border}" stroke-width="1"` : "";
	const box = `<rect x="26" y="${y}" width="68" height="${h}" rx="${rx}" ${fill} ${stroke}/>`;
	// the mark, the message and the button — the anatomy every reference
	// product ships, drawn small
	const mid = 27 + 7 - pad + pad;
	const inner =
		`<circle cx="60" cy="${y + h / 2 - 7}" r="4" fill="currentColor" opacity=".28"/>` +
		`<rect x="44" y="${y + h / 2 - 1}" width="32" height="3" rx="1.5" fill="currentColor" opacity=".22"/>` +
		`<rect x="52" y="${y + h / 2 + 5}" width="16" height="5" rx="2.5" fill="currentColor" opacity=".4"/>`;
	return `<svg viewBox="0 0 120 54">${surface}${box}${inner}</svg>`;
}

/** The composing chip rows — the mark and the call to action. */
const BND_EMPTY_GROUPS = [
	{
		field: "empty_media",
		title: () => __("Mark"),
		desc: () => __("The mark above the message."),
		options: [
			{ value: "Glyph", name: () => __("Glyph") },
			{ value: "Marked", name: () => __("Marked") },
			{ value: "None", name: () => __("None") },
		],
	},
	{
		field: "empty_action",
		title: () => __("Call to Action"),
		desc: () => __("How much the button on an empty screen asks to be pressed."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Primary", name: () => __("Primary") },
		],
	},
];

/** Render the empty-states picker. No toggle row: this kit's repairs are
 * contracts, not options, so there is nothing to switch off. */
function bnd_render_empty_picker(frm, host) {
	const $host = bnd_picker_host(frm, "empty_picker", host);
	if (!$host) return;

	const current = frm.doc.empty_style || BND_EMPTY_DEFAULTS.empty_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "empty_style");
	const cards = P.cards(
		BND_EMPTY_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-esp-style" }
	);

	const reason = off ? __("Original leaves every empty state stock — nothing below applies.") : "";
	const groups = BND_EMPTY_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_EMPTY_DEFAULTS[grp.field] }),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-esp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-esp-style").on("click", function () {
		bnd_empty_set(frm, "empty_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_empty_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_empty_set(frm, f, BND_EMPTY_DEFAULTS[f]);
	});
}

/** Hand the empty-state values to the desk engine — live preview. */
function bnd_empty_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.empty_apply) return;
	const values = {};
	// `|| DEFAULT` matters, and the overlays picker records why: on a site where
	// a field was never written, frm.doc[f] is empty, and sending it raw CLEARS
	// the anchor the boot payload had just set — opening the settings form would
	// strip the style.
	for (const f of BND_EMPTY_FIELDS) values[f] = frm.doc[f] || BND_EMPTY_DEFAULTS[f];
	window.bunood_theme.empty_apply(values);
}

/** Set one empty-state option, preview, re-render. */
function bnd_empty_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_empty_preview(frm);
	bnd_render_empty_picker(frm);
}

/** The loading-style catalogue. Each thumbnail is the same skeleton block —
 * a mark and three bones — drawn to that style's motion, because ONE anchor
 * governs the workspace skeleton, the list skeleton and every text loading
 * node the desk draws. */
const BND_SKELETON_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock loading states, untouched. The style stands down — the legibility repairs stay."),
		svg: bnd_skeleton_thumb({}),
	},
	{
		value: "Still",
		blurb: () => __("Bones, no motion — and exactly what the two below render for anyone who asks for reduced motion."),
		svg: bnd_skeleton_thumb({ bone: 0.3 }),
	},
	{
		value: "Pulse",
		blurb: () => __("The whole block breathes — one mechanism for bones and text alike, and the calmer of the two."),
		svg: bnd_skeleton_thumb({ bone: 0.3, pulse: true }),
	},
	{
		value: "Sweep",
		blurb: () => __("A band travels the bones; text still pulses, because a gradient across a sentence is noise. The default."),
		svg: bnd_skeleton_thumb({ bone: 0.3, sweep: true }),
	},
];

/** One loading thumbnail. A builder so four near-identical diagrams are one
 * description, not four copies that drift. */
function bnd_skeleton_thumb(o) {
	const b = o.bone === undefined ? 0.16 : o.bone;
	const bone = (x, y, w) =>
		`<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="currentColor" opacity="${o.pulse ? b * 0.75 : b}"/>`;
	// the mark, then three lines of "content" that has not arrived
	const mark = `<circle cx="26" cy="18" r="8" fill="currentColor" opacity="${o.pulse ? b * 0.75 : b}"/>`;
	// Sweep draws the band ON one bone, so the difference from Pulse is visible
	// in a still picture rather than only in motion.
	const band = o.sweep
		? '<rect x="52" y="12" width="18" height="6" rx="3" fill="currentColor" opacity=".34"/>'
		: "";
	return `<svg viewBox="0 0 120 54">${mark}${bone(42, 12, 62)}${band}${bone(42, 24, 48)}${bone(14, 38, 90)}</svg>`;
}

/** Render the loading picker. No chip rows: this kit is one anchor — its
 * repairs are contracts and its geometry floors are not choices. */
function bnd_render_skeleton_picker(frm, host) {
	const $host = bnd_picker_host(frm, "skeleton_picker", host);
	if (!$host) return;

	const current = frm.doc.skeleton_style || BND_SKELETON_DEFAULTS.skeleton_style;
	const offered = bnd_field_slots(frm, "skeleton_style");
	const cards = P.cards(
		BND_SKELETON_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-skp-style" }
	);

	$host.html(
		P.wrap('<div class="bnd-cbp bnd-skp">' + bnd_bands([{ zone: "style", html: cards + P.note(__("Applies as you click.")) }]) + "</div>")
	);

	$host.find(".bnd-skp-style").on("click", function () {
		bnd_skeleton_set(frm, "skeleton_style", this.getAttribute("data-value"));
	});
}

/** Hand the loading values to the desk engine — live preview. */
function bnd_skeleton_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.skeleton_apply) return;
	const values = {};
	// `|| DEFAULT`, for the reason the overlays picker records: on a site where
	// the field was never written, frm.doc[f] is empty and sending it raw would
	// CLEAR the anchor boot had just set.
	for (const f of BND_SKELETON_FIELDS) values[f] = frm.doc[f] || BND_SKELETON_DEFAULTS[f];
	window.bunood_theme.skeleton_apply(values);
}

/** Set the loading style, preview, re-render. */
function bnd_skeleton_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_skeleton_preview(frm);
	bnd_render_skeleton_picker(frm);
}

/** The filter-strip specimen: a band with three slots, drawn at the pole's own
 * boundary treatment. A still picture has to separate five poles, so each one
 * changes something STRUCTURAL rather than only a colour — otherwise the cards
 * are five pictures of the same thing, which is the two-options-one-pixel
 * defect wearing a thumbnail. */
function bnd_filters_thumb(o) {
	const r = o.radius === undefined ? 4 : o.radius;
	const slot = (x, w) =>
		`<rect x="${x}" y="16" width="${w}" height="15" rx="${r}"` +
		(o.slotFill
			? ` fill="${o.slotFill}"`
			: ` fill="currentColor" fill-opacity="${o.slot === undefined ? 0.1 : o.slot}"`) +
		(o.ring ? ` stroke="currentColor" stroke-opacity="${o.ring}" stroke-width="1"` : "") +
		"/>";
	const well = o.well
		? `<rect x="0" y="9" width="120" height="29" fill="currentColor" fill-opacity="${o.well}"/>`
		: "";
	const edge = o.edge
		? `<rect x="0" y="37" width="120" height="1.6" fill="currentColor" fill-opacity="${o.edge}"/>`
		: "";
	return `<svg viewBox="0 0 120 54">${well}${slot(9, 33)}${slot(48, 25)}${slot(79, 32)}${edge}</svg>`;
}

const BND_FILTERS_STYLES = [
	{
		value: "Original",
		blurb: () => __("The stock filter bar, untouched. The style stands down — the legibility repairs stay."),
		svg: bnd_filters_thumb({}),
	},
	{
		value: "Outlined",
		blurb: () => __("Every filter control takes a hairline at rest. The default — and the only resting treatment any reference product gives a filter control."),
		svg: bnd_filters_thumb({ ring: 0.34 }),
	},
	{
		value: "Trough",
		blurb: () => __("The bar is recessed and the controls sit up out of it."),
		svg: bnd_filters_thumb({ well: 0.1, slotFill: "var(--bnd-surface)" }),
	},
	{
		value: "Pill",
		blurb: () => __("Fully rounded controls, so the bar reads as a strip of tokens."),
		svg: bnd_filters_thumb({ ring: 0.3, radius: 8 }),
	},
	{
		value: "Ruled",
		blurb: () => __("No boundary on any control — the bar separates itself with a rule instead."),
		svg: bnd_filters_thumb({ edge: 0.4 }),
	},
];

const BND_FILTERS_GROUPS = [
	{
		field: "filters_applied",
		title: () => __("Applied Filters"),
		desc: () => __("How loudly a filtered list says so."),
		options: [
			{ value: "Quiet", name: () => __("Quiet") },
			{ value: "Counted", name: () => __("Counted") },
			{ value: "Accented", name: () => __("Accented") },
		],
	},
	{
		field: "filters_saved",
		title: () => __("Saved Filters"),
		desc: () => __("Row spacing and a separated Save row in the saved-filter menu."),
		options: [
			{ value: "Plain", name: () => __("Plain") },
			{ value: "Listed", name: () => __("Listed") },
		],
	},
];

/** Render the filters picker. The same two-band shape as the empty-states
 * picker: the anchor as cards, the two composing axes as chip rows that grey
 * out when the anchor stands down. */
function bnd_render_filters_picker(frm, host) {
	const $host = bnd_picker_host(frm, "filters_picker", host);
	if (!$host) return;

	const current = frm.doc.filters_style || BND_FILTERS_DEFAULTS.filters_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "filters_style");
	const cards = P.cards(
		BND_FILTERS_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value, name: __(s.value), blurb: s.blurb(), svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-flp-style" }
	);

	const reason = off ? __("Original leaves the filter bar stock — nothing below applies.") : "";
	const groups = BND_FILTERS_GROUPS.map((grp) =>
		P.group({
			title: grp.title(), desc: grp.desc(), field: grp.field,
			body: P.options(grp.options.map((o) => ({ value: o.value, name: o.name(), reason })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_FILTERS_DEFAULTS[grp.field] }),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-flp">' +
				bnd_bands([
					{ zone: "style", html: cards + P.note(__("Applies as you click.")) },
					{ zone: "extras", html: groups },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-flp-style").on("click", function () {
		bnd_filters_set(frm, "filters_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_filters_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_filters_set(frm, f, BND_FILTERS_DEFAULTS[f]);
	});
}

/** Hand the filter values to the desk engine — live preview. */
function bnd_filters_preview(frm) {
	if (!window.bunood_theme || !window.bunood_theme.filters_apply) return;
	const values = {};
	// `|| DEFAULT`, for the reason the overlays picker records: on a site where
	// the field was never written, frm.doc[f] is empty and sending it raw would
	// CLEAR the anchor boot had just set.
	for (const f of BND_FILTERS_FIELDS) values[f] = frm.doc[f] || BND_FILTERS_DEFAULTS[f];
	window.bunood_theme.filters_apply(values);
}

/** Set a filter field, preview, re-render. */
function bnd_filters_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_filters_preview(frm);
	bnd_render_filters_picker(frm);
}

/** The sign-in specimen: a page with a card on it, drawn at the pole's own
 * composition. Every pole changes something STRUCTURAL — where the card sits,
 * what the ground is, whether there is a second column — rather than only a
 * colour, because four pictures of the same thing is the two-options-one-pixel
 * defect wearing a thumbnail. Item 31's filter-strip specimen, transposed. */
function bnd_login_thumb(o) {
	const ground = o.ground
		? `<rect x="0" y="0" width="120" height="72" fill="currentColor" fill-opacity="${o.ground}"/>`
		: "";
	const column = o.column
		? `<rect x="0" y="0" width="46" height="72" fill="currentColor" fill-opacity="0.04"/>` +
		  `<rect x="46" y="0" width="74" height="72" fill="currentColor" fill-opacity="0.42"/>`
		: "";
	const cx = o.column ? 8 : 33;
	const cw = o.column ? 30 : 54;
	const cy = o.top ? 10 : 21;
	const card =
		`<rect x="${cx}" y="${cy}" width="${cw}" height="30" rx="${o.radius === undefined ? 3 : o.radius}"` +
		(o.card === undefined ? ' fill="none"' : ` fill="currentColor" fill-opacity="${o.card}"`) +
		(o.ring ? ` stroke="currentColor" stroke-opacity="${o.ring}" stroke-width="1"` : "") +
		"/>";
	// Three bars for the logo, the field and the action — enough to read as a
	// form at 120px without pretending to be a screenshot.
	const bar = (y, w, op) =>
		`<rect x="${cx + 5}" y="${cy + y}" width="${w}" height="3" rx="1.5" fill="currentColor" fill-opacity="${op}"/>`;
	const inner = bar(6, Math.round(cw * 0.34), 0.5) + bar(13, cw - 10, 0.16) + bar(21, cw - 10, 0.7);
	return `<svg viewBox="0 0 120 72">${ground}${column}${card}${inner}</svg>`;
}

const BND_LOGIN_STYLES = [
	{
		value: "Original",
		blurb: () => __("Stock: the card is the page's own colour, pinned near the top."),
		svg: bnd_login_thumb({ top: true, radius: 3 }),
	},
	{
		value: "Panel",
		blurb: () => __("The card becomes an object — its own fill, a hairline edge, centred."),
		svg: bnd_login_thumb({ card: 0.06, ring: 0.22, radius: 4 }),
	},
	{
		value: "Split",
		blurb: () => __("A form column beside a full-height brand panel."),
		svg: bnd_login_thumb({ column: true, radius: 0 }),
	},
	{
		value: "Plate",
		blurb: () => __("A brand wash across the page, with the card floating on it."),
		svg: bnd_login_thumb({ ground: 0.14, card: 0.02, ring: 0.18, radius: 4 }),
	},
];

const BND_LOGIN_GROUPS = [
	{
		field: "login_action",
		title: () => __("Primary Action"),
		desc: () => __("Whether the primary button carries your brand colour."),
		options: [
			{ value: "Neutral", name: () => __("Neutral") },
			{ value: "Branded", name: () => __("Branded") },
		],
	},
	{
		field: "login_theme",
		title: () => __("Sign-In Theme"),
		desc: () => __("A signed-out visitor has no stored preference, so the default follows their device."),
		options: [
			{ value: "Follow OS", name: () => __("Follow OS") },
			{ value: "Always Light", name: () => __("Always Light") },
			{ value: "Always Dark", name: () => __("Always Dark") },
		],
	},
];

/** Render the sign-in picker.
 *
 * NO LIVE PREVIEW, AND UNLIKE THE WEBSITE KIT'S THE REASON IS IMPOSSIBILITY
 * RATHER THAN COST — it is not an omission. Every other
 * surface repaints on click through `bunood.<kit>_apply`, because the surface is
 * on the desk the settings page lives in. This one dresses /login and
 * /update-password — and `www/login.py:38-46` REDIRECTS any authenticated
 * session to /desk, so the only person who can open this picker is the only
 * person who cannot see the page it configures. An iframe cannot work either,
 * for the same reason.
 *
 * So there is no `bunood.login_apply` and no `bnd_login_preview`: a hook that
 * cannot act is a lie, and the mandatory-hook rule exists to catch a kit whose
 * click does nothing, not to require a hook where nothing CAN happen. The
 * specimen and the shell's change dot are the feedback, and the suite asserts
 * the honest pair instead — the specimen tracks the field, and the rendered
 * page carries the chosen class.
 */
function bnd_render_login_picker(frm, host) {
	const $host = bnd_picker_host(frm, "login_picker", host);
	if (!$host) return;

	const current = frm.doc.login_style || BND_LOGIN_DEFAULTS.login_style;
	const off = current === "Original";
	const offered = bnd_field_slots(frm, "login_style");
	const cards = P.cards(
		BND_LOGIN_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-lgp-style" }
	);

	// `login_theme` composes with Original — it decides which palette the page
	// paints in, and the CONTRACTS paint in it whether or not a pole is chosen.
	// Only `login_action` rides the anchor's stand-down.
	const groups = BND_LOGIN_GROUPS.map((grp) =>
		P.group({
			title: grp.title(),
			desc: grp.desc(),
			field: grp.field,
			body: P.options(
				grp.options.map((o) => ({
					value: o.value,
					name: o.name(),
					reason:
						off && grp.field === "login_action"
							? __("Original leaves the sign-in page stock — this does not apply.")
							: "",
				})),
				{ field: grp.field, value: frm.doc[grp.field] || BND_LOGIN_DEFAULTS[grp.field] }
			),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-lgp">' +
				bnd_bands([
					{
						zone: "style",
						html:
							cards +
							P.note(__("Applies to the sign-in, sign-up and forgot-password screens.")),
					},
					{ zone: "extras", html: groups },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-lgp-style").on("click", function () {
		bnd_login_set(frm, "login_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_login_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_login_set(frm, f, BND_LOGIN_DEFAULTS[f]);
	});
}

/** Set a sign-in field and re-render. No preview call — see the picker's
 * docblock for why this kit has none. */
function bnd_login_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_render_login_picker(frm);
}

/** A 120x72 specimen of one website pole, drawn from the same primitives the
 * sign-in thumbs use. Every pole changes something STRUCTURAL — what the ground
 * is, whether the content reads as an object on it — rather than only a colour,
 * because three pictures of the same thing is the two-options-one-pixel defect
 * wearing a thumbnail.
 *
 * The furniture is a navbar strip and a rail, because that is what the widest
 * route in this surface actually has. It is a SPECIMEN, not a screenshot: five
 * of the templates carry no navbar and no rail at all, which the blurbs say. */
function bnd_web_thumb(o) {
	const ground = o.ground
		? `<rect x="0" y="0" width="120" height="72" fill="currentColor" fill-opacity="${o.ground}"/>`
		: "";
	const bar =
		`<rect x="0" y="0" width="120" height="11" fill="currentColor" fill-opacity="${o.bar || 0.03}"/>` +
		`<rect x="6" y="4" width="20" height="3" rx="1.5" fill="currentColor" fill-opacity="0.55"/>`;
	const rail =
		`<rect x="6" y="17" width="17" height="3" rx="1.5" fill="currentColor" fill-opacity="0.3"/>` +
		`<rect x="6" y="24" width="13" height="3" rx="1.5" fill="currentColor" fill-opacity="0.18"/>`;
	const card =
		`<rect x="31" y="16" width="83" height="50" rx="${o.radius === undefined ? 0 : o.radius}"` +
		(o.card === undefined ? ' fill="none"' : ` fill="currentColor" fill-opacity="${o.card}"`) +
		(o.ring ? ` stroke="currentColor" stroke-opacity="${o.ring}" stroke-width="1"` : "") +
		"/>";
	// A heading and two rows — enough to read as a document at 120px.
	const row = (y, w, op) =>
		`<rect x="37" y="${y}" width="${w}" height="3" rx="1.5" fill="currentColor" fill-opacity="${op}"/>`;
	const inner = row(23, 28, 0.6) + row(34, 71, 0.16) + row(43, 71, 0.16) + row(52, 52, 0.16);
	return `<svg viewBox="0 0 120 72">${ground}${bar}${rail}${card}${inner}</svg>`;
}

const BND_WEB_GROUPS = [
	{
		field: "web_header",
		title: () => __("Header"),
		desc: () => __("Whether the site header carries your brand colour."),
		options: [
			{ value: "Neutral", name: () => __("Neutral") },
			{ value: "Branded", name: () => __("Branded") },
		],
	},
	{
		field: "web_theme",
		title: () => __("Website Theme"),
		// SAYS WHAT IT CANNOT DO, because it cannot do it and a picker that implies
		// otherwise is the setting lying to the person choosing it. Dark mode needs
		// a ground we painted, and `Original` is the choice not to have one — Frappe
		// ships no dark rules for its website at all, so on `Original` the page is
		// white whatever this says. Added after a release review found the previous
		// behaviour: it flipped our tokens dark anyway and put 1.87:1 ink on that
		// white page.
		desc: () =>
			__(
				"A website visitor has no stored preference, so the default follows their device. Needs a page style other than Original — a dark page needs a ground the theme paints."
			),
		options: [
			{ value: "Follow OS", name: () => __("Follow OS") },
			{ value: "Always Light", name: () => __("Always Light") },
			{ value: "Always Dark", name: () => __("Always Dark") },
		],
	},
];

const BND_WEB_STYLES = [
	{
		value: "Original",
		blurb: () =>
			__("Stock: Frappe's own white page, with the accessibility repairs still applied. Always light."),
		svg: bnd_web_thumb({}),
	},
	{
		value: "Panel",
		blurb: () => __("The page takes your ground tint and the content becomes an object on it."),
		svg: bnd_web_thumb({ ground: 0.05, card: 0.02, ring: 0.2, radius: 4 }),
	},
	{
		value: "Plate",
		blurb: () => __("A brand wash across the page, with the content plate floating on it."),
		svg: bnd_web_thumb({ ground: 0.14, bar: 0.1, card: 0.02, ring: 0.18, radius: 4 }),
	},
];

/** Render the website & portal picker.
 *
 * NO LIVE PREVIEW, AND THE ARGUMENT IS NOT THE SIGN-IN KIT'S. That one is
 * exempt because `www/login.py` redirects an authenticated session to /desk, so
 * the only person who can open its picker is the only one who cannot see the
 * page — a hook that cannot act is a lie. THAT PREMISE DOES NOT HOLD HERE: an
 * admin loads /me and /orders perfectly well. So the mandatory-hook rule applies
 * again and has to be answered rather than inherited. Three reasons, and they
 * are about cost and honesty rather than impossibility:
 *
 *   1. The anchor is server-rendered into a DIFFERENT document. Any "apply" is a
 *      page load, and a preview that is a page load is a link.
 *   2. An iframe would cost desk-side CSS and JS against a budget with 271 and
 *      420 bytes of headroom.
 *   3. An iframe of /orders renders the ADMIN'S OWN data, so the preview differs
 *      per admin and shows a portal that is not the customer's.
 *
 * Because there is no client-side apply, `context.WEB_CLASSES` stays THE ONLY
 * value→slug map — the same property the sign-in kit has, kept for a different
 * reason. The suite asserts the honest pair instead: the click lands in the
 * field, and a portal page loaded in a real session carries the chosen class. */
function bnd_render_web_picker(frm, host) {
	const $host = bnd_picker_host(frm, "web_picker", host);
	if (!$host) return;

	const current = frm.doc.web_style || BND_WEB_DEFAULTS.web_style;
	const offered = bnd_field_slots(frm, "web_style");
	const cards = P.cards(
		BND_WEB_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-wbp-style" }
	);

	// `web_header` COMPOSES with the anchor — the navbar is chrome present under
	// every pole, so unlike the sign-in kit's branded CTA there is no
	// "does not apply under Original" reason. One group, no stand-down.
	const groups = BND_WEB_GROUPS.map((grp) =>
		P.group({
			title: grp.title(),
			desc: grp.desc(),
			field: grp.field,
			body: P.options(
				grp.options.map((o) => ({ value: o.value, name: o.name(), reason: "" })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_WEB_DEFAULTS[grp.field] }
			),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-wbp">' +
				bnd_bands([
					{
						zone: "style",
						html:
							cards +
							P.note(
								__(
									"Applies to the customer portal, web forms, error pages and any public page — not to the desk or the sign-in screens."
								)
							),
					},
					{ zone: "extras", html: groups },
				]) +
				"</div>"
		)
	);

	$host.find(".bnd-wbp-style").on("click", function () {
		bnd_web_set(frm, "web_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_web_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	// THE RESET CHIPS, WHICH SHIPPED RENDERED AND DEAD. `P.group` emits a
	// `.bnd-cbp-reset` for any group with a `field`, and both groups here have
	// one — the fixture banks the two nodes — but this function was copied from
	// `bnd_render_login_picker` without its binding, so the chips were visible,
	// enabled and inert. Every other picker carries this handler — and nothing
	// counts them here, because `assertResetChipsBound` in `build.mjs` is what
	// actually enforces it. There is no
	// delegated fallback: every picker binds inside its own host, so no other
	// kit's handler can reach these. Found by the v0.33.0 release review.
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_web_set(frm, f, BND_WEB_DEFAULTS[f]);
	});
}

/** Set a website field and re-render. No preview call — see the picker's
 * docblock for why this kit has none, and why its reason differs from the
 * sign-in kit's. */
function bnd_web_set(frm, fieldname, value) {
	frm.set_value(fieldname, value);
	bnd_render_web_picker(frm);
}

/**
 * The email thumbnail — an envelope's worth of anatomy at 120x72.
 *
 * DRAWN AS A MESSAGE, NOT A PAGE, and that is the only reason it is a separate
 * function from `bnd_web_thumb`. A website thumbnail needs a chrome bar and a
 * nav rail; an email has neither, and reusing the web one would have shown the
 * reader a browser window for a thing that arrives in an inbox.
 */
function bnd_email_thumb(o) {
	const ground = `<rect x="0" y="0" width="120" height="72" fill="currentColor" fill-opacity="${
		o.ground === undefined ? 0.05 : o.ground
	}"/>`;
	// The plate. `fill="none"` rather than opacity 0 so a pole with no card reads
	// as absent rather than as a white card on a white ground.
	const x = o.measure === "narrow" ? 22 : 16;
	const w = 120 - x * 2;
	const plate =
		`<rect x="${x}" y="${o.band ? 14 : 10}" width="${w}" height="${o.band ? 48 : 52}" rx="${
			o.radius === undefined ? 0 : o.radius
		}"` +
		(o.card === undefined ? ' fill="none"' : ` fill="currentColor" fill-opacity="${o.card}"`) +
		"/>";
	const band = o.band
		? `<rect x="${x}" y="10" width="${w}" height="4" rx="${o.radius ? 1.5 : 0}" fill="currentColor" fill-opacity="0.5"/>`
		: "";
	const row = (y, ww, op) =>
		`<rect x="${x + 8}" y="${y}" width="${ww}" height="3" rx="1.5" fill="currentColor" fill-opacity="${op}"/>`;
	const inner =
		row(o.band ? 22 : 18, Math.min(30, w - 16), 0.6) +
		row(o.band ? 32 : 28, w - 16, 0.16) +
		row(o.band ? 40 : 36, w - 16, 0.16) +
		// The CTA — the one control an email has, so it is what a reader looks for
		// when comparing two of these.
		`<rect x="${x + 8}" y="${o.band ? 49 : 46}" width="26" height="7" rx="2" fill="currentColor" fill-opacity="0.42"/>`;
	return `<svg viewBox="0 0 120 72">${ground}${plate}${band}${inner}</svg>`;
}

const BND_EMAIL_STYLES = [
	{
		value: "Original",
		blurb: () =>
			__("Stock: the message as Frappe composes it. The legibility repairs still apply."),
		svg: bnd_email_thumb({ ground: 0.03 }),
	},
	{
		value: "Card",
		blurb: () => __("The message sits on a framed card over a tinted ground."),
		svg: bnd_email_thumb({ ground: 0.06, card: 0.02, radius: 4 }),
	},
	{
		value: "Letter",
		blurb: () => __("No card — the message reads as a letter, with room around it."),
		svg: bnd_email_thumb({ ground: 0.05, measure: "narrow" }),
	},
	{
		value: "Masthead",
		blurb: () => __("A card, with a band of your brand colour across the top."),
		svg: bnd_email_thumb({ ground: 0.06, card: 0.02, radius: 4, band: true }),
	},
];

const BND_EMAIL_GROUPS = [
	{
		field: "email_header",
		title: () => __("Identity"),
		desc: () =>
			__(
				"Mail clients do not render SVG logos, so a form that asks for a mark falls back to your name where no raster logo is set."
			),
		options: [
			{ value: "Logo + wordmark", name: () => __("Logo + wordmark") },
			{ value: "Wordmark", name: () => __("Wordmark") },
			{ value: "Logo", name: () => __("Logo") },
			{ value: "None", name: () => __("None") },
		],
	},
	{
		field: "email_action",
		title: () => __("Button"),
		desc: () =>
			__("The one control an email has. Stock is near-black and carries no brand at all."),
		options: [
			{ value: "Brand fill", name: () => __("Brand fill") },
			{ value: "Outline", name: () => __("Outline") },
			{ value: "Link", name: () => __("Link") },
		],
	},
	{
		field: "email_theme",
		title: () => __("Theme"),
		desc: () =>
			__(
				"One message is read by many people on many devices, so following each reader’s own setting is the only thing that can answer per reader. Support varies by mail client."
			),
		options: [
			{ value: "Follow the client", name: () => __("Follow the client") },
			{ value: "Always Light", name: () => __("Always Light") },
			{ value: "Always Dark", name: () => __("Always Dark") },
		],
	},
];

/**
 * The email picker.
 *
 * BOTH GROUPS COMPOSE WITH `Original` and neither stands down, so no option
 * carries a `reason`. That is not the same call `bnd_render_login_picker` makes:
 * its branded CTA sits INSIDE the card `Original` leaves stock, so it genuinely
 * does not apply there. Here the button and the mode are properties of the
 * message rather than of the anchor's geometry — a stock-composed email still has
 * a button, and is still read on a device with a setting.
 */
function bnd_render_email_picker(frm, host) {
	const $host = bnd_picker_host(frm, "email_picker", host);
	if (!$host) return;

	const current = frm.doc.email_style || BND_EMAIL_DEFAULTS.email_style;
	const offered = bnd_field_slots(frm, "email_style");
	const cards = P.cards(
		BND_EMAIL_STYLES.filter((s) => s.value === "Original" || offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-emp-style" }
	);

	const groups = BND_EMAIL_GROUPS.map((grp) =>
		P.group({
			title: grp.title(),
			desc: grp.desc(),
			field: grp.field,
			body: P.options(
				grp.options.map((o) => ({ value: o.value, name: o.name(), reason: "" })),
				{ field: grp.field, value: frm.doc[grp.field] || BND_EMAIL_DEFAULTS[grp.field] }
			),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-emp">' +
				bnd_bands([
					{
						zone: "style",
						html:
							cards +
							P.note(
								__(
									"Applies to every email your site sends — notifications, invitations and password resets alike."
								)
							),
					},
					{ zone: "extras", html: groups },
				]) +
				'<div class="bnd-emp-preview" data-bnd-part="email-preview"></div>' +
				// THE CAPTION EXISTS BECAUSE THE PREVIEW CANNOT SHOW BOTH MODES, and
				// without it the frame quietly implies it does. The iframe is a
				// separate document: its `prefers-color-scheme` comes from the
				// READER'S OS, not from the desk's `data-theme`, so on a dark desk an
				// admin sees a light email and has every reason to conclude that is
				// all there is. Screenshotting the picker in both modes is what
				// surfaced it — nine slices of measurement and nobody had looked.
				P.note(
					frm.doc.email_theme === "Always Dark"
						? __("Shown as every reader sees it.")
						: frm.doc.email_theme === "Always Light"
							? __("Shown as every reader sees it.")
							: __(
									"Shown as a reader whose device is set to light sees it. Readers on dark devices get the dark version."
								)
				) +
				"</div>"
		)
	);

	$host.find(".bnd-emp-style").on("click", function () {
		bnd_email_set(frm, "email_style", this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-opt").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_email_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	// THE RESET CHIPS. `P.group` emits a `.bnd-cbp-reset` for any group with a
	// `field` and both groups here have one, so this binding is not optional —
	// `assertResetChipsBound` exists because `bnd_render_web_picker` shipped two
	// of them rendered, enabled and inert, and there is no delegated fallback:
	// every picker binds inside its own host.
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_email_set(frm, f, BND_EMAIL_DEFAULTS[f]);
	});

	bnd_email_preview(frm, $host);
}

/**
 * Set an email field and re-render.
 *
 * NO PREVIEW CALL, and unlike the sign-in and website kits this is a DEFERRAL
 * rather than a refusal — which is worth stating precisely, because the
 * mandatory-hook rule exists to catch a picker whose click does nothing.
 *
 * The sign-in kit has no preview because the only person who can open its picker
 * is the only one who cannot load the page (`www/login.py:38-46` redirects an
 * authenticated session away). The website kit has none because an "apply" there
 * is a page load in a different document. Neither argument held here, and the
 * preview WAS then built (`bnd_email_preview`, called from the render above) —
 * this block once read "simply not built yet", which item 34's own later slice
 * made stale the day it landed; item 35 retired the sentence. The print
 * picker's preview carries the same mechanics one surface further.
 */
function bnd_email_set(frm, field, value) {
	frm.set_value(field, value);
	bnd_render_email_picker(frm);
}

/**
 * The live preview — an iframe carrying a real render.
 *
 * AN IFRAME AND NOT `innerHTML`, and the reason is not isolation-in-principle.
 * The document being previewed sets rules on `body` and `table` and ships its own
 * `<style>`; dropped into the settings page those would apply TO THE SETTINGS
 * PAGE. `srcdoc` gives it its own document, which is also what makes the preview
 * honest — an email IS a whole document, and showing it inside one is the closest
 * a browser gets to how it will be read.
 *
 * WHAT IT DOES NOT CLAIM. A browser is not a mail client. This shows the CSS that
 * was authored, resolved the way Chromium resolves it; it says nothing about
 * whether Outlook's Word engine will lay the tables out the same way. That limit
 * is the reason `assertEmailSafeCss` exists, and the note under the picker says
 * so in the admin's own words rather than leaving them to assume otherwise.
 *
 * REFETCHED ON EVERY RENDER, deliberately. The whole point is that a pole change
 * is visible immediately, and the render happens SERVER-side — there is nothing
 * the client could recompute. Each call is one `xcall` against a fixed sample.
 */
function bnd_email_preview(frm, $host) {
	const $slot = $host.find('[data-bnd-part="email-preview"]');
	if (!$slot.length) return;

	// THE FRAME IS CREATED SYNCHRONOUSLY AND FILLED LATER, which is not a style
	// choice. Built inside the `.then()` it exists only once the round-trip lands,
	// so the picker has TWO structures — one before, one after — and which of them
	// `tools/fingerprint.mjs` captures depends on how fast the backend answered.
	// Three consecutive fingerprints agreed here, which is exactly how a flake
	// looks until the day a cold worker takes five seconds (a documented cost of
	// the first call after a restart) and `settings: no unexplained structural
	// drift` goes red over nothing. Creating it up front makes the shape one fact.
	//
	// It is an iframe and not `innerHTML` because the document being previewed
	// sets rules on `body` and `table` and ships its own `<style>`; dropped into
	// the settings page those would style THE SETTINGS PAGE. `srcdoc` also makes
	// the preview honest — an email IS a whole document.
	const frame = document.createElement("iframe");
	frame.className = "bnd-emp-frame";
	frame.setAttribute("title", __("Email preview"));
	// No script runs in a rendered email and none should run here. An empty
	// `sandbox` grants nothing, which also blocks form submission and top-level
	// navigation — so a link in the sample cannot take the admin off the page.
	frame.setAttribute("sandbox", "");
	frame.setAttribute("srcdoc", "");
	$slot.empty().append(frame);

	frappe
		.xcall("bunood_theme.api.email_preview")
		.then((html) => {
			// The picker may have re-rendered while this was in flight — a second
			// click before the first resolves. Write into the frame that is in the
			// DOM NOW, or the render lands in a detached node and the admin watches
			// the previous pole forever.
			const live = $host.find(".bnd-emp-frame")[0];
			if (live && html) live.setAttribute("srcdoc", html);
		})
		.catch(() => {
			// A failed preview is not a failed picker. The endpoint already returns
			// "" rather than raising for anything it can foresee; this covers the
			// rest and leaves an empty frame rather than a half-drawn one.
		});
}

/**
 * The print thumbnail — a sheet of paper at 120x72, parameterised per preset.
 *
 * ONE GEOMETRY, THIRTEEN DRESSINGS — the desk-diagram lesson: the page, the
 * letterhead band, three table rows and a totals mark are one drawing, and a
 * preset contributes only flags. Thirty hand-drawn thumbnails that all have
 * to stay truthful is the trap this avoids.
 */
function bnd_print_thumb(o) {
	o = o || {};
	const parts = ['<rect x="0" y="0" width="120" height="72" fill="currentColor" fill-opacity="0.05"/>'];
	// The sheet.
	parts.push('<rect x="28" y="4" width="64" height="64" rx="1.5" fill="currentColor" fill-opacity="0.02" stroke="currentColor" stroke-opacity="0.25" stroke-width="0.6"/>');
	if (o.rail) parts.push('<rect x="28" y="4" width="2.5" height="64" fill="currentColor" fill-opacity="0.6"/>');
	if (o.frame) parts.push('<rect x="31" y="7" width="58" height="58" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="0.7"/>');
	// The letterhead band.
	if (o.band === "fill") parts.push('<rect x="33" y="9" width="54" height="9" fill="currentColor" fill-opacity="0.55"/>');
	else if (o.band === "wash") parts.push('<rect x="33" y="9" width="54" height="9" rx="2" fill="currentColor" fill-opacity="0.14"/>');
	else if (o.band === "rule") parts.push('<rect x="33" y="16" width="54" height="1.6" fill="currentColor" fill-opacity="0.55"/>');
	else if (o.band === "hair") parts.push('<rect x="33" y="16" width="54" height="0.8" fill="currentColor" fill-opacity="0.3"/>');
	// The title.
	parts.push(`<rect x="33" y="${o.band === "fill" || o.band === "wash" ? 22 : 21}" width="${o.poster ? 34 : 22}" height="${o.poster ? 5 : 3.4}" rx="1" fill="currentColor" fill-opacity="0.6"/>`);
	// Three table rows.
	const y0 = 32;
	for (let i = 0; i < 3; i++) {
		const y = y0 + i * 7;
		if (o.rows === "zebra" && i % 2 === 0) parts.push(`<rect x="33" y="${y - 1.4}" width="54" height="5.6" fill="currentColor" fill-opacity="0.1"/>`);
		if (o.rows === "washed") parts.push(`<rect x="33" y="${y - 1.4}" width="54" height="5.6" rx="1.5" fill="currentColor" fill-opacity="0.1"/>`);
		parts.push(`<rect x="35" y="${y}" width="30" height="2.4" rx="1" fill="currentColor" fill-opacity="0.35"/>`);
		parts.push(`<rect x="74" y="${y}" width="11" height="2.4" rx="1" fill="currentColor" fill-opacity="0.35"/>`);
		if (o.rows === "ruled") parts.push(`<rect x="33" y="${y + 4}" width="54" height="0.7" fill="currentColor" fill-opacity="0.28"/>`);
		if (o.rows === "boxed") parts.push(`<rect x="33" y="${y - 1.6}" width="54" height="6" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="0.5"/>`);
	}
	// The totals mark.
	if (o.totals === "inverse") parts.push('<rect x="60" y="56" width="27" height="6" fill="currentColor" fill-opacity="0.75"/>');
	else if (o.totals === "wash") parts.push('<rect x="60" y="56" width="27" height="6" rx="1.5" fill="currentColor" fill-opacity="0.16"/>');
	else if (o.totals === "boxed") parts.push('<rect x="60" y="56" width="27" height="6" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="0.6"/>');
	else parts.push('<rect x="60" y="61" width="27" height="1" fill="currentColor" fill-opacity="0.45"/>');
	parts.push('<rect x="62" y="58" width="16" height="2.2" rx="1" fill="currentColor" fill-opacity="0.55"/>');
	return `<svg viewBox="0 0 120 72">${parts.join("")}</svg>`;
}

/**
 * Preset card ART and BLURBS only — the VALUES each preset writes live in
 * `presets.PRINT_PRESETS` alone and are fetched over
 * `bunood_theme.api.print_presets`, never mirrored here: a second copy of the
 * compositions is exactly the drift the derived label exists to surface. A
 * name listed here that the server does not know renders disabled with the
 * reason, so the two lists cannot drift silently either.
 */
const BND_PRINT_STYLES = [
	{ value: "Original", name: () => __("Original"), blurb: () => __("Stock: every document as Frappe draws it. The legibility repairs still apply."), art: {} },
	{ value: "Soft Cards", name: () => __("Soft Cards"), blurb: () => __("Every section a washed, rounded panel — friendly, and continuous with the desk."), art: { band: "wash", rows: "washed", totals: "wash" } },
	{ value: "Ruled Ledger", name: () => __("Ruled Ledger"), blurb: () => __("Full-width rules and a boxed total — the classical accounting document."), art: { band: "rule", rows: "ruled", totals: "boxed" } },
	{ value: "Quiet Minimal", name: () => __("Quiet Minimal"), blurb: () => __("Hairlines only, the amount leading — ink spent nowhere it is not needed."), art: { band: "hair", rows: "open" } },
	{ value: "Striped", name: () => __("Striped"), blurb: () => __("A brand band and zebra rows — long invoices stay scannable."), art: { band: "fill", rows: "zebra" } },
	{ value: "Brand Slab", name: () => __("Brand Slab"), blurb: () => __("A filled band and boxed, filled table heads — the boldest draw."), art: { band: "fill", rows: "boxed", totals: "wash" } },
	{ value: "Boxed Classic", name: () => __("Boxed Classic"), blurb: () => __("The gridded meta-and-table composition the legacy formats drew, re-derived."), art: { band: "rule", rows: "boxed", totals: "boxed" } },
	{ value: "Edge Rail", name: () => __("Edge Rail"), blurb: () => __("A brand rail down the starting edge — the list view's signature, on paper."), art: { rail: true, band: "hair", rows: "ruled" } },
	{ value: "Formal Serif", name: () => __("Formal Serif"), blurb: () => __("Serif headings and almost no chrome — the formal letter register."), art: { band: "hair", rows: "open" } },
	{ value: "Poster Bold", name: () => __("Poster Bold"), blurb: () => __("A huge title and the total inverted — the strongest statement ink can make."), art: { band: "rule", rows: "ruled", totals: "inverse", poster: true } },
	{ value: "Bookends", name: () => __("Bookends"), blurb: () => __("A brand band up top, a clean ruled sheet below it."), art: { band: "fill", rows: "ruled" } },
	{ value: "Blueprint", name: () => __("Blueprint"), blurb: () => __("A drawing frame and small-cap headings — made for a technical tenant."), art: { frame: true, band: "hair", rows: "ruled", totals: "boxed" } },
];

const BND_PRINT_GROUPS = [
	{
		field: "print_header_style",
		title: () => __("Letterhead band"),
		desc: () => __("The identity strip at the top of every printed page."),
	},
	{
		field: "print_table_style",
		title: () => __("Item table"),
		desc: () => __("Rules, boxes, zebra rows or washed panels — on every print format, including ERPNext's."),
	},
	{
		field: "print_totals_style",
		title: () => __("Totals"),
		desc: () => __("How the grand total is set off from the rows above it."),
	},
	{
		field: "print_heading_style",
		title: () => __("Headings"),
		desc: () => __("The document title and section headings."),
	},
	{
		field: "print_accent",
		title: () => __("Brand on paper"),
		desc: () => __("How much of your colour reaches print. Ink only saves toner; thermal receipts always print pure black regardless."),
	},
	{
		field: "print_letterhead",
		title: () => __("Letterhead"),
		desc: () => __("Composed from your logo and names and kept in sync with your colours. Frappe's own leaves whatever Letter Head the site already uses untouched."),
	},
	{
		field: "print_title_lang",
		title: () => __("Document title"),
		desc: () => __("Which halves of the bilingual title render on the Bunood formats."),
	},
	{
		field: "print_qr",
		title: () => __("ZATCA QR"),
		desc: () => __("Hide applies only where the QR is optional — a simplified tax invoice keeps its QR and its warning regardless."),
	},
	{
		field: "print_qr_place",
		title: () => __("QR placement"),
		desc: () => __("Beside the meta at either end of the head row, or down beside the totals."),
	},
	{
		field: "print_qr_size",
		title: () => __("QR size"),
		desc: () => __("The QR's printed size."),
	},
	{
		field: "print_words",
		title: () => __("Amount in words"),
		desc: () => __("The tafqit strip under the totals."),
	},
	{
		field: "print_signatures",
		title: () => __("Signatures"),
		desc: () => __("On vouchers and invoices. A format that passes its own labels keeps them."),
	},
];

// The preset table, fetched ONCE per page and cached — the server is the one
// copy (see BND_PRINT_STYLES). `null` until the first fetch lands; the picker
// renders complete without it and once more when it arrives.
let bnd_print_presets_cache = null;
let bnd_print_presets_inflight = false;

function bnd_print_match_preset(frm) {
	if (!bnd_print_presets_cache) return null;
	const { axes, presets } = bnd_print_presets_cache;
	for (const [name, comp] of Object.entries(presets)) {
		if (axes.every((f) => (frm.doc[f] || BND_PRINT_DEFAULTS[f]) === comp[f])) return name;
	}
	return "Custom";
}

/**
 * The print picker — a PRESET ROW over four section axes plus the accent.
 *
 * THE PRESETS WRITE VALUES AND STOP EXISTING (the settings-architecture
 * doctrine, on paper): clicking a card sets the four axis fields and nothing
 * remembers the click — the highlighted card and the note underneath are
 * DERIVED by comparing the live values against the server's table, so they
 * read "Custom" the moment any axis differs. The side pane's picker has
 * worked this way since item 10; paper joins it.
 */
function bnd_render_print_picker(frm, host) {
	const $host = bnd_picker_host(frm, "print_picker", host);
	if (!$host) return;

	if (!bnd_print_presets_cache && !bnd_print_presets_inflight) {
		bnd_print_presets_inflight = true;
		frappe.xcall("bunood_theme.api.print_presets").then((r) => {
			bnd_print_presets_cache = r;
			bnd_render_print_picker(frm);
		}).catch(() => {
			// The picker stays usable without the presets: the axis groups below
			// are the real controls; the cards are a convenience over them. The
			// flag RESETS so the next render retries — the review caught the
			// first cut latching one transient failure into a dead card row for
			// the rest of the page's life.
			bnd_print_presets_inflight = false;
		});
	}

	const match = bnd_print_match_preset(frm);
	const cards = P.cards(
		BND_PRINT_STYLES.map((st) => ({
			value: st.value,
			// LITERAL name thunks, not __(st.value): the extractor reads literal
			// __("...") calls only, and preset names have no doctype Select to
			// cover them — a dynamic call here would ship them untranslated with
			// the coverage gate green.
			name: st.name(),
			blurb: st.blurb(),
			svg: bnd_print_thumb(st.art),
			reason:
				bnd_print_presets_cache && !bnd_print_presets_cache.presets[st.value]
					? __("Not in the shipped preset table — the card and the server disagree.")
					: "",
		})),
		{ selected: match || "", cls: "bnd-cbp-style bnd-prp-style" }
	);

	const groups = BND_PRINT_GROUPS.map((grp) =>
		P.group({
			title: grp.title(),
			desc: grp.desc(),
			field: grp.field,
			body: P.options(
				// "Open" the style shares a msgid with "Open" the verb, which Arabic
				// translates as an imperative — so the STORED value stays "Open" and
				// only its display goes through a distinct literal.
				bnd_field_slots(frm, grp.field).map((v) => ({
					value: v,
					name: v === "Open" ? __("Open rows") : __(v),
					reason: "",
				})),
				{ field: grp.field, value: frm.doc[grp.field] || BND_PRINT_DEFAULTS[grp.field] }
			),
		})
	).join("");

	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-prp">' +
				bnd_bands([
					{
						zone: "style",
						html:
							cards +
							P.note(
								match === null
									? __("A style writes the four sections below and stops existing — change any of them and the label reads Custom.")
									: match === "Custom"
										? __("The four sections below read as Custom — your own composition.")
										: __("The four sections below currently read as {0}.", [__(match)])
							),
					},
					{ zone: "extras", html: groups },
				]) +
				(() => {
					// ONE test, written to BOTH the class and the attribute (item 36's
					// picker audit). These four chips announced their selection only
					// through `aria-pressed`, and no shipped rule targets it — so all
					// four looked identical whichever specimen was showing, while a
					// screen reader was told correctly. `.bnd-cbp-on` is the class the
					// rest of the surface paints a selected chip with; computing the
					// test twice is how the two would drift apart.
					const chip = (k, v, label) => {
						const on = bnd_print_preview_state[k] === v;
						return `<button type="button" class="bnd-cbp-opt bnd-prp-chip${
							on ? " bnd-cbp-on" : ""
						}" data-k="${k}" data-v="${v}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
					};
					return (
						'<div class="bnd-prp-chips" role="group" aria-label="' + __("Print preview") + '">' +
						chip("shape", "invoice", __("Invoice")) +
						chip("shape", "document", __("Document")) +
						'<span class="bnd-prp-chipgap"></span>' +
						chip("lang", "en", __("English")) +
						chip("lang", "ar", __("Arabic")) +
						"</div>" +
						'<div class="bnd-prp-preview" data-bnd-part="print-preview"></div>' +
						P.note(
							__(
								"A specimen document through the real print pipeline — no record on this site is read. PDFs from wkhtmltopdf can differ in detail."
							)
						)
					);
				})() +
				"</div>"
		)
	);

	$host.find(".bnd-prp-style").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		const name = this.getAttribute("data-value");
		if (name === "Custom") return;
		if (!bnd_print_presets_cache || !bnd_print_presets_cache.presets[name]) return;
		const comp = bnd_print_presets_cache.presets[name];
		for (const [f, v] of Object.entries(comp)) frm.set_value(f, v);
		bnd_render_print_picker(frm);
	});
	// .not(): the preview chips SHARE the opt class for styling and the review
	// walked the double-fire — the generic handler called set_value(null) and
	// raced a second preview xcall per chip click.
	$host.find(".bnd-cbp-opt").not(".bnd-prp-chip").on("click", function () {
		if (this.hasAttribute("disabled")) return;
		bnd_print_set(frm, this.getAttribute("data-field"), this.getAttribute("data-value"));
	});
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		bnd_print_set(frm, f, BND_PRINT_DEFAULTS[f]);
	});
	$host.find(".bnd-prp-chip").on("click", function () {
		const k = this.getAttribute("data-k");
		bnd_print_preview_state[k] = this.getAttribute("data-v");
		bnd_render_print_picker(frm);
	});

	bnd_print_preview(frm, $host);
}

/**
 * Which specimen the preview shows — TRANSIENT UI state, deliberately not a
 * field: what an admin last previewed is not site configuration, and a field
 * for it would be the same-fact trap wearing a convenience.
 */
const bnd_print_preview_state = { shape: "invoice", lang: "en" };

/**
 * The live paper preview — the email preview's mechanics (synchronous frame,
 * sandboxed srcdoc, refetch per render) over a REAL get_html_and_style render
 * of a SPECIMEN document. Two chip rows make it the most interactive preview
 * in the project: the SHAPE chips, because a style that reads right on prose
 * can fail on a table (the item-34 fixture lesson applied to the preview
 * itself); and the LANGUAGE chips — the same specimen re-rendered in Arabic,
 * the one demo of the slice-2 direction closure no other kit could offer.
 */
function bnd_print_preview(frm, $host) {
	const $slot = $host.find('[data-bnd-part="print-preview"]');
	if (!$slot.length) return;

	const frame = document.createElement("iframe");
	frame.className = "bnd-prp-frame";
	frame.setAttribute("title", __("Print preview"));
	// `allow-same-origin` and NOTHING else — unlike the email frame's empty
	// sandbox. The print sheet declares real @font-face rules (Cairo, Amiri)
	// with same-site URLs, and an empty sandbox gives the srcdoc a `null`
	// origin whose font fetches CORS-fail: a console error per render and the
	// preview showing Arabic in a fallback face — a preview that lies about
	// typography. Scripts, forms and navigation stay blocked; the content is
	// our own server's render of a specimen, the same document /printview
	// serves top-level.
	frame.setAttribute("sandbox", "allow-same-origin");
	frame.setAttribute("srcdoc", "");
	$slot.empty().append(frame);

	frappe
		.xcall("bunood_theme.api.print_preview", {
			shape: bnd_print_preview_state.shape,
			lang: bnd_print_preview_state.lang,
		})
		.then((html) => {
			const live = $host.find(".bnd-prp-frame")[0];
			if (live && html) live.setAttribute("srcdoc", html);
		})
		.catch(() => {
			// A failed preview is not a failed picker.
		});
}

/** Set a print field and re-render. Server-rendered surface: the record is
 * re-substituted by `on_theme_settings_update` when the autosave lands, so
 * there is no client apply — the item-34 shape, minus even the class map. */
function bnd_print_set(frm, field, value) {
	frm.set_value(field, value);
	bnd_render_print_picker(frm);
}

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
	return bnd_region_blocker(frm, bnd_slot_region(slot));
}

/**
 * What each search slot MEANS, by value. The list itself comes from the field —
 * see `bnd_field_slots`. This is prose, not vocabulary: a slot with no entry
 * here still renders, it just describes itself.
 */
const BND_SEARCH_BLURBS = {
	"Top Bar Center": () => __("Centred in the top bar — the modern default."),
	"Top Bar Start": () => __("At the start of the top bar, beside the page."),
	"Side Pane Start": () => __("ERPNext's own search row, at the top of the sidebar."),
	"Side Pane End": () => __("The same row, pinned to the sidebar's foot."),
	"Bottom Bar Center": () => __("Centred in the bottom strip, beside the status signals."),
	"Bottom Bar Start": () => __("At the start of the bottom strip."),
};

/** The search slots on offer, each with its blurb. */
function bnd_search_slots(frm) {
	return bnd_field_slots(frm, "search_placement").map((value) => ({
		value: value,
		blurb: BND_SEARCH_BLURBS[value] || (() => value),
	}));
}

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
/**
 * THE PLACEMENT BOARD — the desk is the form (option E).
 *
 * WHY IT EXISTS
 *     Placement used to be five separate pickers, each a 300x180 thumbnail with
 *     one component's name on it, each answering "where does THIS go?" in
 *     isolation. That asks the reader to hold the desk in their head and
 *     assemble it from five small answers. The board inverts it: one desk,
 *     drawn big, with every control shown WHERE IT IS. Moving something is
 *     moving it.
 *
 * PICK AND DROP, BOTH
 *     Drag is the headline gesture and it is not sufficient alone — it is
 *     unavailable on touch, awkward on a trackpad, and invisible to a keyboard.
 *     So every chip is also a BUTTON: click it to pick it up, click a zone to
 *     drop it. Both paths end in the same `drop_on`, so neither can rot while
 *     the other is exercised.
 *
 * IT INVENTS NO VOCABULARY
 *     Zones come from `bnd_field_slots`, which reads the field's own options,
 *     which the doctype generates from `registry.slots_for`. A component is
 *     offered exactly the places its runtime implements — search has no page
 *     header because it has no slug for one, and the side pane has two zones
 *     rather than three. A zone a chip may not take REFUSES the drop instead of
 *     accepting it and silently landing elsewhere, which is the whole reason
 *     the vocabulary slice came first.
 */
const BND_BOARD_TENANTS = [
	{ key: "search", field: "search_placement", label: () => __("Search") },
	{ key: "inbox", field: "inbox_placement", label: () => __("Notifications") },
	{ key: "user", field: "user_placement", label: () => __("You") },
	{ key: "home", field: "home_placement", label: () => __("Home") },
	{ key: "apps", field: "apps_placement", label: () => __("All Apps") },
];

/** The regions the board draws, in the order they sit on a desk. */
const BND_BOARD_REGIONS = [
	{ region: "sidepane", label: () => __("Side Pane") },
	{ region: "topbar", label: () => __("Top Bar") },
	{ region: "pagehead", label: () => __("Page Header") },
	{ region: "dock", label: () => __("Dock") },
	{ region: "bottombar", label: () => __("Bottom Bar") },
];

/** A zone's own name within its region — module scope so the board's zone
 * badges and the "Move to…" menu (item 22) read the same three words. */
const BND_ZONE_NAME = {
	start: () => __("Start"),
	center: () => __("Center"),
	end: () => __("End"),
};

/** "Top Bar End" -> "Top Bar · End", for anywhere a slot needs a human label. */
function bnd_slot_label(slot) {
	if (slot === "Off") return __("Off");
	const parsed = bnd_parse_slot(slot);
	const region = BND_BOARD_REGIONS.find((r) => r.region === parsed.region);
	const zoneName = BND_ZONE_NAME[parsed.zone];
	if (!region || !zoneName) return slot; // an unparsed slot still needs SOME label
	return region.label() + " · " + zoneName();
}

/** Every zone any component can occupy, grouped by region, in desk order. */
function bnd_board_zones(frm) {
	const seen = new Map();
	for (const t of BND_BOARD_TENANTS) {
		for (const slot of bnd_field_slots(frm, t.field)) {
			const parsed = bnd_parse_slot(slot);
			if (!parsed.region) continue;
			if (!seen.has(parsed.region)) seen.set(parsed.region, new Map());
			// A Map keeps insertion order and de-duplicates without caring
			// which component contributed the zone first.
			if (!seen.get(parsed.region).has(parsed.zone)) {
				seen.get(parsed.region).set(parsed.zone, slot);
			}
		}
	}
	return seen;
}

/**
 * May this component be switched off at all?
 *
 * Search may not: a desk nobody can search is not a configuration this theme
 * offers, and the field says so by having no "Off" option. Asked of the FIELD
 * rather than remembered here, for the same reason as everything else here.
 */
function bnd_can_be_off(frm, field) {
	const meta_df =
		frappe.meta &&
		frappe.meta.get_docfield("Theme Settings", field, frm && frm.doc && frm.doc.name);
	const options = (meta_df && meta_df.options) || "";
	return String(options).split(/\r?\n/).indexOf("Off") !== -1;
}

/** One chip. A button first, draggable second — see the header. */
function bnd_board_chip(t, value) {
	return (
		'<button type="button" class="bnd-bd-chip" draggable="true" aria-pressed="false"' +
		' data-tenant="' + bnd_esc(t.key) + '" data-field="' + bnd_esc(t.field) + '"' +
		' data-value="' + bnd_esc(value || "Off") + '"' +
		' title="' + bnd_esc(__("Drag to move, or click to pick up")) + '">' +
		'<span class="bnd-bd-dot" aria-hidden="true"></span>' +
		'<span class="bnd-bd-chip-label">' + bnd_esc(t.label()) + "</span>" +
		"</button>"
	);
}

/** The stored desk order as a token list, healed against the default. */
function bnd_order_tokens(frm) {
	const DEFAULT = ["search", "inbox", "user", "home", "apps"];
	const stored = String(frm.doc.desk_order || "")
		.split(",")
		.map((t) => t.trim())
		.filter((t) => DEFAULT.indexOf(t) !== -1);
	return stored.concat(DEFAULT.filter((t) => stored.indexOf(t) === -1));
}

/**
 * Move one tenant in the desk order: before `before_key`, or to the end.
 *
 * The order is GLOBAL (one list) while the constraint is per-zone, and that
 * is the design rather than a shortcut: a per-zone list would need a list per
 * zone a tenant may occupy and a rule for what happens when it moves. One
 * list, position meaningful wherever two tenants share a zone, is the whole
 * of E3.
 */
function bnd_order_move(frm, moved_key, before_key, after_key) {
	const tokens = bnd_order_tokens(frm).filter((t) => t !== moved_key);
	if (after_key && tokens.indexOf(after_key) !== -1) {
		tokens.splice(tokens.indexOf(after_key) + 1, 0, moved_key);
	} else {
		const at = before_key ? tokens.indexOf(before_key) : -1;
		if (at === -1) tokens.push(moved_key);
		else tokens.splice(at, 0, moved_key);
	}
	const next = tokens.join(",");
	if (next !== (frm.doc.desk_order || "")) frm.set_value("desk_order", next);
}

function bnd_render_placement_board(frm, host) {
	const $host = bnd_picker_host(frm, "placement_board", host);
	if (!$host) return;

	const placed = new Map();
	const off = [];
	// Walked in the DESK order, not declaration order, so the chips in a zone
	// read exactly as the desk will render them — the board is the order's
	// only control, and a board that showed a different sequence than the desk
	// would be a picker lying about what it writes.
	const by_key = Object.fromEntries(BND_BOARD_TENANTS.map((t) => [t.key, t]));
	const ordered = bnd_order_tokens(frm).map((k) => by_key[k]).filter(Boolean);
	for (const t of ordered) {
		const value = frm.doc[t.field] || bnd_field_first_slot(frm, t.field);
		if (!value || value === "Off") {
			off.push(bnd_board_chip(t, "Off"));
			continue;
		}
		if (!placed.has(value)) placed.set(value, []);
		placed.get(value).push(bnd_board_chip(t, value));
	}

	const zones = bnd_board_zones(frm);
	const regions = BND_BOARD_REGIONS.filter((r) => zones.has(r.region))
		.map((r) => {
			const reason = bnd_region_blocker(frm, r.region);
			const cells = Array.from(zones.get(r.region).entries())
				.map((pair) => {
					const zone = pair[0];
					const slot = pair[1];
					const chips = (placed.get(slot) || []).join("");
					return (
						// A DROP target — the pointer/drag path still targets the
						// whole zone — but no longer a keyboard CONTROL: role=button
						// gave every chip inside it Children Presentational: True,
						// so the chips that ARE the components could be flattened
						// out of the accessibility tree entirely. role=group names
						// the region without claiming to act; the keyboard path is
						// the armed chip's own "Move to…" menu, below.
						'<div class="bnd-bd-zone" role="group"' +
						' aria-label="' + bnd_esc(__("{0}, {1}", [r.label(), (BND_ZONE_NAME[zone] || (() => zone))()])) + '"' +
						' data-slot="' + bnd_esc(slot) + '"' +
						' data-region="' + bnd_esc(r.region) + '" data-zone="' + bnd_esc(zone) + '">' +
						'<span class="bnd-bd-zone-name">' +
						bnd_esc((BND_ZONE_NAME[zone] || (() => zone))()) +
						"</span>" +
						'<div class="bnd-bd-slot-chips">' + chips + "</div>" +
						"</div>"
					);
				})
				.join("");
			return (
				'<section class="bnd-bd-region' + (reason ? " bnd-bd-unavailable" : "") + '"' +
				' data-region="' + bnd_esc(r.region) + '"' +
				(reason ? ' title="' + bnd_esc(reason) + '"' : "") +
				">" +
				'<h4 class="bnd-bd-region-name">' + bnd_esc(r.label()) +
				(reason
					? ' <span class="bnd-bd-warn">' + bnd_esc(__("not on this desk")) + "</span>"
					: "") +
				"</h4>" +
				'<div class="bnd-bd-zones">' + cells + "</div>" +
				"</section>"
			);
		})
		.join("");

	$host.html(
		P.wrap(
			'<div class="bnd-bd" data-armed="">' +
				'<div class="bnd-bd-desk">' + regions + "</div>" +
				'<div class="bnd-bd-tray bnd-bd-zone" role="group" aria-label="' + bnd_esc(__("Off — not shown")) + '" data-slot="Off">' +
				'<span class="bnd-bd-zone-name">' + bnd_esc(__("Off — not shown")) + "</span>" +
				'<div class="bnd-bd-slot-chips">' + off.join("") + "</div>" +
				"</div>" +
				P.note(
					__("Drag a control onto the desk, click it and then click where it should go, or pick it up and use its Move to menu.")
				) +
				'<div class="bnd-bd-status bnd-visually-hidden" role="status" aria-live="polite"></div>' +
				"</div>"
		)
	);

	const legal = (field, slot) =>
		slot === "Off"
			? bnd_can_be_off(frm, field)
			: bnd_field_slots(frm, field).indexOf(slot) !== -1;

	const $bd = $host.find(".bnd-bd");
	// The board's one announcer: arm, move, nudge and a refused drop were all
	// silent before item 22 — a refused drop was indistinguishable from a
	// successful one. Visually hidden, so a mouse user sees nothing new.
	const status = $bd.find(".bnd-bd-status")[0];
	const announce = (msg) => {
		if (status) status.textContent = msg;
	};

	const drop_on = (field, slot, order_settled) => {
		const t = BND_BOARD_TENANTS.find((x) => x.field === field);
		if (!field || !slot || !legal(field, slot)) {
			if (t) announce(__("Cannot move: {0}", [t.label()]));
			return;
		}
		// Landing at a zone's blank space means AFTER its current chips, and
		// the order list has to say so too or the desk would render the new
		// arrival wherever its old rank put it — before chips the user just
		// dropped it behind. The chip-level drop has ALREADY placed the token
		// ("before this chip") and says so — appending here as well would
		// clobber the position it just chose, which is exactly what the first
		// cut did: every before-drop measured as an after-drop.
		if (t && slot !== "Off" && !order_settled) bnd_order_move(frm, t.key, null);
		bnd_inbox_set(frm, field, slot);
		if (t) announce(__("Moved: {0} — {1}", [t.label(), bnd_slot_label(slot)]));
	};

	const arm = (field) => {
		$bd.attr("data-armed", field || "");
		// Remembered on the FORM, because every drop re-renders this board
		// from scratch: without the memory, a nudge (below) would deselect
		// the chip it just moved and the arrows would vanish under the
		// user's pointer after every press.
		frm.__bnd_board_armed = field || "";
		$bd.find(".bnd-bd-zone").each(function () {
			const ok = field ? legal(field, this.getAttribute("data-slot")) : false;
			this.classList.toggle("bnd-bd-ok", !!ok);
			this.classList.toggle("bnd-bd-no", !!field && !ok);
		});
		$bd.find(".bnd-bd-nudge").remove();
		if (!field) {
			$bd.find(".bnd-bd-chip").removeClass("bnd-bd-armed").attr("aria-pressed", "false");
			return;
		}
		const t = BND_BOARD_TENANTS.find((x) => x.field === field);
		const chip = $bd.find(`.bnd-bd-chip[data-field="${field}"]`)[0];
		if (!chip) return;
		if (t) announce(__("Picked up: {0}", [t.label()]));

		// THE ARMED CONTROLS — siblings of the chip, never children: the chip
		// is a <button> and buttons cannot nest. Two of them, for two
		// DIFFERENT facts a chip has: reordering WITHIN a zone (design pick
		// 1A, unchanged) needs a neighbour to swap with, so those arrows only
		// appear when one exists; changing WHICH zone (item 22) is meaningful
		// even for a chip alone in its zone, so the menu always appears.
		// Splitting the board's one Enter-anywhere keyboard path into two
		// controls this way is also what makes the 9-of-15-zones-silently-
		// refuse problem disappear: the menu only ever lists LEGAL zones.
		const nudge = document.createElement("span");
		nudge.className = "bnd-bd-nudge";

		const wrap = chip.closest(".bnd-bd-slot-chips");
		if (wrap) {
			const chips_of = () => [...wrap.querySelectorAll(".bnd-bd-chip")];
			if (chips_of().length >= 2) {
				const moved = tenant_of_field(field);
				for (const [dir, glyph, label] of [
					[-1, "‹", __("Move earlier in this zone")],
					[1, "›", __("Move later in this zone")],
				]) {
					const b = document.createElement("button");
					b.type = "button";
					b.className = "bnd-bd-nudge-btn";
					b.setAttribute("aria-label", label);
					b.textContent = glyph;
					b.addEventListener("click", (e) => {
						e.stopPropagation();
						const order = chips_of().map((c) => c.getAttribute("data-tenant"));
						const at = order.indexOf(moved);
						const target = at + dir;
						if (at === -1 || target < 0 || target >= order.length) return;
						if (dir < 0) bnd_order_move(frm, moved, order[target]);
						else bnd_order_move(frm, moved, null, order[target]);
						if (t) {
							const zoneLabel = bnd_slot_label(chip.closest(".bnd-bd-zone").getAttribute("data-slot"));
							announce(
								dir < 0
									? __("Moved earlier: {0} — {1}", [t.label(), zoneLabel])
									: __("Moved later: {0} — {1}", [t.label(), zoneLabel])
							);
						}
						bnd_render_placement_board(frm);
					});
					nudge.appendChild(b);
				}
			}
		}

		const move_btn = document.createElement("button");
		move_btn.type = "button";
		move_btn.className = "bnd-bd-move-btn";
		move_btn.textContent = __("Move to…");
		if (window.bunood_theme && window.bunood_theme.menu_trigger) {
			window.bunood_theme.menu_trigger(move_btn);
		}
		move_btn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (!window.bunood_theme || !window.bunood_theme.menu) return;
			const items = bnd_field_slots(frm, field).map((slot) => ({
				label: bnd_slot_label(slot),
				run: () => drop_on(field, slot),
			}));
			if (bnd_can_be_off(frm, field)) {
				items.push("divider");
				items.push({ label: __("Off — not shown"), run: () => drop_on(field, "Off") });
			}
			window.bunood_theme.menu(move_btn, items);
		});
		nudge.appendChild(move_btn);

		chip.insertAdjacentElement("afterend", nudge);
	};

	// Re-arm after any re-render: the memory lives on the form, the DOM is
	// fresh, and a nudge that lost its arrows after one press would be a
	// control that dismantles itself mid-use. Focus follows it — every
	// mutation (drop, nudge, menu pick) replaces the whole board via
	// $host.html() above, and nothing used to call .focus() afterward, so a
	// keyboard user's focus fell out of the document on every single action.
	if (frm.__bnd_board_armed && $bd.find(`.bnd-bd-chip[data-field="${frm.__bnd_board_armed}"]`).length) {
		arm(frm.__bnd_board_armed);
		const $chip = $bd
			.find(`.bnd-bd-chip[data-field="${frm.__bnd_board_armed}"]`)
			.addClass("bnd-bd-armed")
			.attr("aria-pressed", "true");
		$chip[0].focus();
	}

	$bd.find(".bnd-bd-chip").on("click", function (e) {
		e.stopPropagation();
		const field = this.getAttribute("data-field");
		// Clicking the armed chip again puts it down. A board that cannot be
		// disarmed traps the next click on a zone nobody meant to choose.
		const next = $bd.attr("data-armed") === field ? "" : field;
		$bd.find(".bnd-bd-chip").removeClass("bnd-bd-armed").attr("aria-pressed", "false");
		arm(next);
		if (next) window.$(this).addClass("bnd-bd-armed").attr("aria-pressed", "true");
	});

	// Pointer drop target only now — zones are role="group" and carry no
	// tabindex, so there is no keyboard Enter/Space path here to maintain.
	// The keyboard route is the armed chip's own "Move to…" menu, above.
	$bd.find(".bnd-bd-zone").on("click", function () {
		const field = $bd.attr("data-armed");
		if (!field) return;
		drop_on(field, this.getAttribute("data-slot"));
	});

	// Dropping ON a chip means "before this chip" — the within-zone position
	// is the order control (E3), and the zone-level drop stays "at the end".
	// The chip handler must run before the zone's, so it stops propagation.
	// A declaration, not a const: `arm` runs from the re-arm block above both
	// of them, and a const here would be a temporal-dead-zone crash the first
	// time a re-render restored an armed chip.
	function tenant_of_field(field) {
		const t = BND_BOARD_TENANTS.find((x) => x.field === field);
		return t ? t.key : "";
	}
	$bd.find(".bnd-bd-chip").on("drop", function (e) {
		const ev = e.originalEvent || e;
		ev.preventDefault();
		ev.stopPropagation();
		const field = (ev.dataTransfer && ev.dataTransfer.getData("text/plain")) || $bd.attr("data-armed");
		const zone = this.closest(".bnd-bd-zone");
		if (!field || !zone) return;
		const moved = tenant_of_field(field);
		const before = this.getAttribute("data-tenant");
		const settled = !!(moved && before && moved !== before);
		if (settled) bnd_order_move(frm, moved, before);
		drop_on(field, zone.getAttribute("data-slot"), settled);
	});
	$bd.find(".bnd-bd-chip").on("dragover", function (e) {
		const ev = e.originalEvent || e;
		const field = $bd.attr("data-armed");
		const zone = this.closest(".bnd-bd-zone");
		if (!field || !zone || !legal(field, zone.getAttribute("data-slot"))) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
	});

	$bd.find(".bnd-bd-chip").on("dragstart", function (e) {
		const ev = e.originalEvent || e;
		const field = this.getAttribute("data-field");
		if (ev.dataTransfer) {
			ev.dataTransfer.setData("text/plain", field);
			ev.dataTransfer.effectAllowed = "move";
		}
		arm(field);
		window.$(this).addClass("bnd-bd-dragging");
	});

	$bd.find(".bnd-bd-chip").on("dragend", function () {
		window.$(this).removeClass("bnd-bd-dragging");
		arm("");
	});

	$bd.find(".bnd-bd-zone").on("dragover", function (e) {
		const ev = e.originalEvent || e;
		const field = $bd.attr("data-armed");
		if (!field || !legal(field, this.getAttribute("data-slot"))) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
	});

	$bd.find(".bnd-bd-zone").on("drop", function (e) {
		const ev = e.originalEvent || e;
		ev.preventDefault();
		const field = (ev.dataTransfer && ev.dataTransfer.getData("text/plain")) || $bd.attr("data-armed");
		drop_on(field, this.getAttribute("data-slot"));
	});
}

function bnd_render_links_picker(frm, host) {
	const $host = bnd_picker_host(frm, "links_picker", host);
	if (!$host) return;

	const one = (field, label) =>
		P.group({
			title: label,
			field: field,
			body: bnd_desk_diagram({
				field: field,
				// From the field, not from a list here: these two are the
				// components whose picker offered "Dock" while the runtime put
				// the link in the pane (2026-08-07), and then offered the whole
				// pre-E1 vocabulary while the field accepted none of it.
				slots: bnd_field_slots(frm, field),
				value: frm.doc[field] || bnd_field_first_slot(frm, field),
				blocker: (slot) => bnd_region_blocker(frm, bnd_slot_region(slot)),
			}) +
				P.options([{ value: "Off", name: __("Off — not shown") }], {
					field: field,
					value: frm.doc[field] || bnd_field_first_slot(frm, field),
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
		// THE SHIPPED DEFAULT, not the field's first slot (item 36's picker
		// audit). Both links ship in "Side Pane Start"; the first slot the
		// field offers is "Top Bar Start", so a chip labelled "Reset to
		// default" was writing the one value guaranteed to make the shell's
		// change dot say Changed. A mirror of presets.LINKS_DEFAULTS, guarded
		// by assertFieldMirrors like every other kit's.
		bnd_inbox_set(frm, this.getAttribute("data-field"), BND_LINKS_DEFAULTS[this.getAttribute("data-field")]);
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
		slots: bnd_search_slots(frm).map((s) => s.value),
		value: current,
		blocker: (label) => bnd_search_slot_blocker(frm, label),
	});

	// One band, so `bnd_bands` prints no heading at all and this renders exactly
	// as it did before. Marked anyway: search IS the placement control, and the
	// bell and the user menu now have their own placement controls too (the
	// inbox and user pickers plus the placement board) — the "step 3 will give
	// them one" the comment used to promise has landed.
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
		value: "Always On",
		blurb: () => __("Every count on screen at all times, with a freshness stamp and manual refresh."),
		svg:
			'<svg viewBox="0 0 120 54"><rect x="1" y="1" width="118" height="52" rx="4" fill="none" stroke="currentColor" opacity=".25"/>' +
			'<rect x="2" y="42" width="116" height="10" fill="currentColor" opacity=".06"/>' +
			'<circle cx="10" cy="47" r="2.5" fill="var(--primary, #3d8150)"/>' +
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
			'<circle cx="10" cy="47" r="2.5" fill="var(--primary, #3d8150)"/>' +
			'<rect x="90" y="45" width="12" height="4" rx="2" fill="currentColor" opacity=".3"/>' +
			'<rect x="105" y="45" width="9" height="4" rx="2" fill="currentColor" opacity=".3"/></svg>',
	},
	// "Off" is NOT a style, and its card is deleted, not commented. The option
	// left the FIELD on 2026-08-06 when the status bar became a component —
	// "is there a strip" is `bottombar_enabled`, the container switch that
	// lives in this same pane — but the card survived, still describing the
	// pre-split behaviour, and still writing "Off" into a Select that refuses
	// it. Theme Settings is a Single, so that one click failed validation for
	// the WHOLE document: the form read "Not Saved" forever and every control
	// clicked after it timed out behind the wedge — found live by the settings
	// sweep on 2026-08-08, the same day the same class of bug was fixed for
	// the placement pickers. The render below also filters this list against
	// the field's own options, so the NEXT option an update removes takes its
	// card with it instead of lying in wait.
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
	// WAS `current === "Off"`, which stopped being reachable when the bottom
	// bar became a container and the style lost that option. The real question
	// is whether the bar exists at all, and it is not this field's to answer.
	const off = bnd_component_blocker(frm, "status");
	const minimal = current === "Minimal";

	// Filtered against the FIELD's options — the same rule every placement
	// picker follows since E1. The hand-authored list carries the art and the
	// prose; the field says which of them exist. This is what retired the
	// "Off" card's whole class of bug: a card whose value the doctype dropped
	// stops rendering instead of writing a value the Select refuses and
	// wedging every later save of the Single.
	const offered = bnd_field_slots(frm, "status_style");
	const cards = P.cards(
		BND_STATUS_STYLES.filter((s) => offered.includes(s.value)).map((s) => ({
			value: s.value,
			name: __(s.value),
			blurb: s.blurb(),
			svg: s.svg,
		})),
		{ selected: current, cls: "bnd-cbp-style bnd-stp-style" }
	);

	const selects = BND_STATUS_SELECTS.map((g) => {
		// Minimal makes no server calls, so a refresh interval is moot.
		// The container's answer wins: if there is no bar, nothing below it
		// matters and saying "Minimal polls nothing" would explain the smaller
		// of two reasons.
		const reason =
			off || (minimal && g.field === "status_interval" ? __("Minimal polls nothing") : "");
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
		const reason =
			off || (minimal && SIGNALS.indexOf(t.field) !== -1 ? __("Minimal shows no live signals") : "");
		return P.toggle({
			field: t.field,
			on: !!parseInt(frm.doc[t.field], 10),
			name: t.name(),
			desc: t.desc(),
			reason,
			// The picker's own hook class, which the handler below binds. It was
			// MISSING — the toggles rendered with only the shared class, the
			// handler matched nothing, and every status switch was inert: the
			// knob looked right, the click did nothing, no error anywhere. This
			// is the exact port defect P.toggle's docstring warns about, found
			// by the settings sweep on 2026-08-08 as three "value did not land"
			// rows (the other four toggles were disabled at that moment, or it
			// would have been seven).
			cls: "bnd-stp-toggle",
		});
	}).join("");

	$host.html(
		'<div class="bnd-cbp bnd-stp">' +
			bnd_bands([
				{ zone: "style", html: cards + P.note(off || __("Applies as you click.")) + selects },
				{ zone: "extras", html: P.group({
					off: !!off,
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
	// `.bnd-cbp-reset`, NOT `.bnd-stp-reset` — this bound a class that nothing
	// has ever rendered, so the status picker's reset chips were dead in exactly
	// the way item 33's were. `P.group` stamps every chip `bnd-cbp-reset` and adds
	// a second class only when the caller passes `resetCls`; this picker never
	// did, so the selector matched nothing. The sidebar picker emits both classes
	// and the inbox picker passes `resetCls`, which is why only this one and the
	// website picker were broken. Found by `assertResetChipsBound` in build.mjs,
	// added during the v0.33.0 release review — this defect predates item 33.
	$host.find(".bnd-cbp-reset").on("click", function (e) {
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
 * The identity pane's specimen + colours console, from the server — item 36.
 *
 * Map 1: one Identity page holds the name, marks, tagline AND the seeds. The
 * NATIVE controls Frappe relocates into this pane stay the only write surface;
 * this picker adds the read-only layer the round picked (B specimen strip + D
 * seed console) plus reset chips that write THROUGH those native fields.
 *
 * EVERYTHING SHOWN IS SERVER-RESOLVED. `effective_identity` composes the
 * fallback chains, the raster rule and the whole `palette.derive` lattice on
 * the server; the pane never re-derives a chain or a colour, so it cannot drift
 * from what the real surfaces do. Fetched on every render (identity changes
 * move the answer), drawn into a placeholder the moment it resolves — a slow
 * call leaves the native controls fully usable, never a spinner over them.
 */
let bnd_identity_cache = null;

function bnd_identity_note(frm) {
	// "Applies on the next page load" — identity travels in boot and the served
	// <head>, so unlike every style kit there is no live desk repaint, and a
	// pane that implied one would lie.
	return P.note(__("Identity applies on the next page load."));
}

function bnd_identity_specimen(data) {
	if (!data) return "";
	const s = data.surfaces;
	const esc = bnd_esc;
	// INK AND FILL FROM ONE DICT. The ink was a hardcoded white in the
	// stylesheet, which discarded the `on_fill` `palette.derive` already
	// returns beside every fill — so a pale seed drew a white monogram on a
	// near-white chip. The seed console two blocks below always paired them
	// correctly; this is the specimen catching up.
	const chip = (fill, ink, glyph) =>
		'<span class="bnd-idp-mark" style="background:' + esc(fill) + ";color:" + esc(ink) + '">' + esc(glyph) + "</span>";

	// Each miniature is a drawing captioned with its SOURCE — the frappe-ui
	// compose-the-tenant's-own-values thumbnail crossed with Discourse's
	// show-the-computed-fallback. Colours are inline (dynamic per seed); layout
	// is `.bnd-idp-*` in _settings.scss.
	// THE MODE THE PANE IS ACTUALLY IN. This read `data.palette.light`
	// unconditionally, and `--bnd-brand-ink` is fitted against the LIGHT
	// surfaces only — so on a dark desk the wordmark landed on a dark card at
	// 3.0:1, at every seed. The server sends both modes; the pane picks the one
	// it is rendering in, the way every other kit reads `data-theme`.
	//
	// `mark` follows the SIDEBAR's own resolved logo, not the raster rule: the
	// desk sidebar renders an SVG perfectly well (`sb_mount_head` sets an
	// <img> from boot), and captioning it "first letter — no logo" told an
	// admin their SVG was unused on the one surface where it is used. The
	// raster rule belongs to email and paper, and those cells carry it already.
	const mark = !!s.sidebar.logo;
	const dark = (document.documentElement.getAttribute("data-theme") || "").indexOf("dark") > -1;
	const light = dark ? data.palette.dark : data.palette.light;
	const cell = (title, body, note) =>
		'<div class="bnd-idp-cell"><div class="bnd-idp-frame">' + body + "</div>" +
		'<div class="bnd-idp-cap">' + esc(title) + (note ? " — " + esc(note) : "") + "</div></div>";

	const sidebar = cell(
		__("Sidebar"),
		'<div class="bnd-idp-row">' +
			(mark ? '<img class="bnd-idp-img" src="' + esc(s.sidebar.logo) + '" alt="">' : chip(light.fill, light.on_fill, s.sidebar.letter)) +
			'<b>' + esc(s.sidebar.name) + "</b></div>",
		mark ? __("your logo") : __("first letter — no logo")
	);
	const tab = cell(
		__("Browser tab"),
		'<div class="bnd-idp-tab"><img class="bnd-idp-fav" src="' + esc(s.tab.favicon) + '" alt="">' +
			"<span>" + esc(s.tab.title) + "</span></div>",
		data.favicon.value ? __("your favicon") : (data.favicon.site ? __("Website Settings' favicon") : __("the Bunood mark"))
	);
	const email = cell(
		__("Email header"),
		'<div class="bnd-idp-center">' +
			(s.email.mark
				? '<img class="bnd-idp-img" src="' + esc(s.email.mark) + '" alt="">'
				: '<b style="color: var(--bnd-brand-ink)">' + esc(s.email.name) + "</b>") +
			(s.email.svg_dropped ? '<span class="bnd-idp-badge">' + __("SVG — wordmark used") + "</span>" : "") +
			"</div>",
		null
	);
	const paper = cell(
		__("Letterhead"),
		'<div class="bnd-idp-paper" dir="ltr"><span>' + esc(s.paper.name_en || "—") + "</span>" +
			(s.paper.logo ? '<img class="bnd-idp-fav" src="' + esc(s.paper.logo) + '" alt="">' : "") +
			'<span dir="rtl">' + esc(s.paper.name_ar || "—") + "</span></div>",
		__("names from the Company record")
	);
	const login = cell(
		__("Sign-in"),
		'<div class="bnd-idp-center"><img class="bnd-idp-img" src="' + esc(s.login.logo) + '" alt="">' +
			(s.login.tagline ? '<span class="bnd-idp-tagline">' + esc(s.login.tagline) + "</span>" : "") +
			"</div>",
		__("a specimen — /login cannot be previewed")
	);

	return (
		'<div class="bnd-idp-strip">' + sidebar + tab + email + paper + login + "</div>" +
		P.note(__("How each surface reads your identity now, and after staff reload."))
	);
}

function bnd_identity_console(frm, data) {
	if (!data) return "";
	const esc = bnd_esc;
	const p = data.palette;
	// The three roles a brand IS (wash / fill+ink / text), both modes, from the
	// served hexes — never a live var() read (the tab's own sheet is one load
	// stale) and never client maths.
	const roleRow = (mode, label) => {
		const r = p[mode];
		const sw = (bg, fg, txt) =>
			'<span class="bnd-idp-role" style="background:' + esc(bg) + (fg ? ";color:" + esc(fg) : "") + '">' + esc(txt) + "</span>";
		return (
			'<div class="bnd-idp-roles"><span class="bnd-idp-rlabel">' + esc(label) + "</span>" +
			sw(r.wash, r.text, __("wash")) + sw(r.fill, r.on_fill, __("fill")) +
			'<span class="bnd-idp-role" style="background:' + esc(r.ground) + ";color:" + esc(r.text) + '">' + __("text") + "</span>" +
			"</div>"
		);
	};
	// The adjustment report, RESIDENT. The server already computes these whole
	// translated sentences and throws them away as a save-time toast; here they
	// live where the seeds are. "Used as entered" when the derivation changed
	// nothing — silence was the ambiguity.
	const report = p.report.length
		? '<div class="bnd-idp-report">' + p.report.map((line) => "<div>" + esc(line) + "</div>").join("") + "</div>"
		: P.note(__("Your colours are used as entered."));

	const receipt = data.receipt
		? P.note(__("Generated stylesheet: {0} — rewritten on every save.", [data.receipt.split("/").pop()]))
		: "";

	return P.group({
		title: __("How the seed derives"),
		body: roleRow("light", __("Light")) + roleRow("dark", __("Dark")) + report + receipt,
	});
}

function bnd_render_identity_picker(frm, host) {
	const $host = bnd_picker_host(frm, "identity_picker", host);
	if (!$host) return;

	const esc = bnd_esc;
	const shipped = (bnd_shipped && bnd_shipped.company_name) || "Bunood";
	// The honesty ledger: one group per identity field with a reset/clear chip
	// (bound below) and its effective-value line. company_name RESETS to the
	// shipped name (the user's pick — and the migrate seeder would refill it
	// anyway, so the chip says what actually happens); the others CLEAR, and
	// their note states the fallback the empty value follows.
	const ledger = [
		{ field: "company_name", verb: "reset", to: shipped, label: __("Company Name"),
		  note: __("Reset returns the shipped name.") },
		{ field: "logo", verb: "clear", to: "", label: __("Logo"),
		  note: __("Empty — the splash follows Website Settings, then the Bunood mark. Email and paper need a raster image.") },
		{ field: "favicon", verb: "clear", to: "", label: __("Favicon"),
		  note: __("Empty — the tab icon follows Website Settings, then the Bunood mark.") },
		{ field: "tagline", verb: "clear", to: "", label: __("Tagline"),
		  note: __("Appears under the sign-in card only. Empty — nothing shows there.") },
	].map((row) =>
		P.group({
			field: row.field,
			resetTitle: row.verb === "reset" ? __("Reset to {0}", [shipped]) : __("Clear"),
			title: row.label,
			body: P.note(row.note),
		})
	).join("");

	// Draw the frame immediately with a placeholder for the async parts, so the
	// native controls below are never blocked; fill on resolve.
	$host.html(
		P.wrap(
			'<div class="bnd-cbp bnd-idp">' +
				bnd_identity_note(frm) +
				'<div class="bnd-idp-async">' +
				(bnd_identity_cache ? bnd_identity_specimen(bnd_identity_cache) + bnd_identity_console(frm, bnd_identity_cache) : "") +
				"</div>" +
				ledger +
				"</div>"
		)
	);

	// Reset/clear chips write THROUGH the native fields — autosave fires, the
	// specimen re-fetches, the dot updates. `.bnd-cbp-reset` bound here, which
	// is what `assertResetChipsBound` checks for.
	$host.find(".bnd-cbp-reset").on("click", function (e) {
		e.stopPropagation();
		const f = this.getAttribute("data-field");
		const to = f === "company_name" ? shipped : "";
		frm.set_value(f, to);
		bnd_render_identity_picker(frm);
	});

	// FETCH LAST, and re-render the async region in place when it lands. Guarded
	// on the host still being attached — a shell torn down mid-fetch must not
	// throw into a detached node. A failed fetch leaves the native controls and
	// the ledger fully usable, which is the honest degrade (item 32's rule that
	// a cosmetic endpoint failure costs the cosmetics and nothing else).
	frappe
		.xcall("bunood_theme.api.effective_identity")
		.then((data) => {
			if (!data) return;
			bnd_identity_cache = data;
			const $slot = $host.find(".bnd-idp-async");
			if ($slot.length && document.body.contains($slot[0])) {
				$slot.html(bnd_identity_specimen(bnd_identity_cache) + bnd_identity_console(frm, bnd_identity_cache));
			}
		})
		.catch(() => {});
}

/**
 * The ONE list both halves of theme portability read — item 36.
 *
 * Export and import each carried their own copy of this concat, and the two
 * had already been wrong together twice: `BND_PRINT_FIELDS` was wired into
 * NEITHER list until the 34+35 release review, and the container toggles,
 * `desk_order` and four of the five placements were in neither until item 36.
 * Two copies cannot drift apart when there is one copy.
 *
 * A function, not a const: `bnd_sb_catalogue.fields` is fetched lazily and
 * must be read at call time, exactly as both call sites always did.
 *
 * WHAT TRAVELS (the user's pick, 2026-08-26): full reproduction including
 * identity TEXT. `company_name` and `tagline` are a theme's voice and travel;
 * `arabic_font` is styling and travels; the five container toggles,
 * `desk_order` and every placement are the desk's layout and travel — an
 * imported theme that reproduced the look but not where anything sat was
 * half a theme. `logo` and `favicon` DO NOT travel and never join: they are
 * site-local /files URLs that break on any other site, and the export toast
 * says so where the admin can see it.
 */
function bnd_theme_keys() {
	return [
		// The five container toggles below are what reproduce the desk. There is no
		// layout NAME to travel any more (item 37 deleted it, and item 37's own
		// theme catalogue is not exported either): a name beside the values it
		// wrote is the same-fact-twice trap, and an import could write a label that
		// disagreed with the containers it wrote in the same pass.
		"company_name", "tagline", "arabic_font",
		"brand_color", "accent_color",
		"brand_color_dark", "accent_color_dark", "ground_color", "density_default",
		"topbar_enabled", "pagehead_enabled", "dock_enabled", "sidebar_enabled", "bottombar_enabled",
		"desk_order", "inbox_placement", "user_placement", "home_placement", "apps_placement",
	].concat(bnd_sb_catalogue.fields, BND_ICON_FIELDS, BND_CRUMB_FIELDS, BND_PALETTE_FIELDS, BND_INBOX_FIELDS, BND_STATUS_FIELDS, BND_LIST_FIELDS, BND_FORM_FIELDS, BND_WORKSPACE_FIELDS, BND_CHART_FIELDS, BND_REPORT_FIELDS, BND_VIEWS_FIELDS, BND_OVERLAY_FIELDS, BND_EMPTY_FIELDS, BND_SKELETON_FIELDS, BND_FILTERS_FIELDS, BND_LOGIN_FIELDS, BND_WEB_FIELDS, BND_EMAIL_FIELDS, BND_PRINT_FIELDS, BND_MOBILE_FIELDS);
}

/**
 * Export the whole theme (desk layout, branding colors, every sidebar style
 * field, every breadcrumb field, every palette field, every notification
 * field, search placement and the status bar) as a JSON file + clipboard
 * copy — portable between tenant sites.
 */
function bnd_sb_export(frm) {
	const keys = bnd_theme_keys();
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
	// The exclusion is SAID, not silent: an admin who exports expecting their
	// logo to travel should learn here, not on the importing site.
	frappe.show_alert({
		message: __("Theme exported (downloaded and copied). The logo and favicon are files on this site and do not travel."),
		indicator: "green",
	});
}

/**
 * Import a theme JSON: validate known keys, set, preview — and it SAVES.
 *
 * The docblock and the toast both said "Save to keep" (item 36's picker
 * audit). There is no Save step: every `frm.set_value` here goes through the
 * wrapped `frm.dirty` and autosave writes it ~400ms later, which three other
 * notes in this file tell the user plainly. Asking for an action that does not
 * exist also implies the import has not stuck, which is the opposite of true.
 */
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
			// A FILE EXPORTED BEFORE 0.36.0 STILL CARRIES THE OLD NAMES, and the
			// import filter would have dropped them silently — an admin moving a
			// Bottom Bar, Compact desk from a 0.35.0 site would have got the
			// styling and neither the layout nor the density, with a toast saying
			// how many keys applied. The renames are the same table the data patch
			// carries (`v0_36_0/rename_axis_fields`); `desk_layout` no longer
			// travels at all, so it is translated into the container toggles the
			// layout it names writes — which is what actually reproduces the desk.
			for (const [was, now] of [["default_density", "density_default"], ["enable_command_palette", "palette_enabled"]]) {
				if (was in data && !(now in data)) {
					data[now] = data[was];
					delete data[was];
				}
			}
			if ("desk_layout" in data && bnd_layout_chrome && bnd_container_toggles) {
				const row = bnd_layout_chrome[data.desk_layout];
				if (row) {
					for (const key of Object.keys(bnd_container_toggles)) {
						const field = bnd_container_toggles[key];
						if (key in row && !(field in data)) data[field] = row[key];
					}
					const tenants = (bnd_layout_tenants && bnd_layout_tenants[data.desk_layout]) || null;
					if (tenants) {
						for (const f of Object.keys(tenants)) if (!(f in data)) data[f] = tenants[f];
					}
				}
				delete data.desk_layout;
			}
			const known = new Set(bnd_theme_keys());
			let applied = 0;
			for (const [k, val] of Object.entries(data)) {
				if (known.has(k) && val !== undefined && val !== null) {
					frm.set_value(k, val);
					applied++;
				}
			}
			bnd_all_previews(frm);
			bnd_render_sidebar_picker_now(frm);
			bnd_render_crumbs_picker(frm);
			bnd_render_palette_picker(frm);
			bnd_render_inbox_picker(frm);
			bnd_render_search_picker(frm);
			bnd_render_status_picker(frm);
			bnd_render_list_picker(frm);
			bnd_render_form_picker(frm);
			bnd_render_workspace_picker(frm);
			bnd_render_chart_picker(frm);
			bnd_render_report_picker(frm);
			bnd_render_views_picker(frm);
			bnd_render_overlay_picker(frm);
			bnd_render_empty_picker(frm);
			bnd_render_skeleton_picker(frm);
			bnd_render_filters_picker(frm);
			bnd_render_login_picker(frm);
			bnd_render_web_picker(frm);
			bnd_render_print_picker(frm);
			bnd_render_email_picker(frm);
			bnd_render_icons_picker(frm);
			bnd_identity_cache = null;
			bnd_render_identity_picker(frm);
			// Label + value: see the note in bunood.js's status segments. A
			// counted noun cannot be translated correctly into Arabic through
			// Frappe's plural-free dictionary.
			frappe.show_alert({ message: __("Settings applied: {0} — saved automatically", [applied]), indicator: "blue" });
		},
		__("Import theme"),
		__("Apply")
	);
}
