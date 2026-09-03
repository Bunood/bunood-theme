/**
 * Bunood Theme — desk JavaScript entry point.
 *
 * WHAT
 *   Two features live here:
 *     1. Per-user density override (checklist item 4, decision "G with C").
 *     2. The desk-layout system (checklist item 9): five chrome layouts —
 *        Top Bar / Compact / Classic / Bottom Bar / Dock — selected on Theme
 *        Settings, delivered via boot, applied as `data-bnd-desk` on <html>,
 *        with the bars/dock mounted here after the desk is built.
 *
 * WHY THIS MUCH JS IS ALLOWED (the architecture rule, restated)
 *   Anything visual must arrive as CSS, because `app_include_js` runs after
 *   first paint. The layout system respects that split:
 *     - The ATTRIBUTE (which layout, what native chrome is hidden) is set
 *       synchronously at top level, before DOMContentLoaded — before Frappe
 *       renders anything the layout affects, so no flash.
 *     - The BARS are new DOM that only makes sense once the desk shell exists,
 *       which is inherently post-splash; mounting them from JS is not a flash,
 *       it is construction.
 *
 * THE REUSE PRINCIPLE (why there is no search/notification code here)
 *   Our bars never reimplement a Frappe behaviour. Every control PROXIES the
 *   native one: the search field click()s the hidden sidebar search trigger,
 *   the bell click()s the hidden sidebar bell (DOM .click() fires handlers on
 *   display:none elements), the avatar menu items call only public
 *   `frappe.ui.toolbar.*` / `frappe.app.*` APIs. Frappe owns behaviour; we own
 *   placement. If a native hook vanishes in an upgrade, the affected button
 *   simply does not mount (every lookup is guarded), never a broken desk.
 *
 * FAILURE MODE
 *   No boot value → no attribute → the CSS matrix matches nothing, nothing is
 *   hidden, nothing mounts: stock v16. The layout system can only ever fail
 *   OPEN.
 */

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	/** Public namespace. Navbar Settings action items call into this. */
	const bunood = (window.bunood_theme = window.bunood_theme || {});

	// ════════════════════════════════════════════════════════════════════════
	// Density (item 4) — unchanged behaviour, see git history for the decision.
	// ════════════════════════════════════════════════════════════════════════

	/** The cycle order for the toggle: follow-site -> comfortable -> compact. */
	const CYCLE = ["", "Comfortable", "Compact"];

	/**
	 * Reflect a density value onto <html>.
	 *
	 * Lowercased because the attribute participates in a CSS selector. Empty
	 * removes the attribute — "follow the site default" must genuinely be the
	 * absence of an override.
	 *
	 * @param {string} density - "", "Comfortable" or "Compact".
	 */
	function apply_density(density) {
		const html = document.documentElement;
		if (density) {
			html.setAttribute("data-bnd-density", density.toLowerCase());
		} else {
			html.removeAttribute("data-bnd-density");
		}
	}

	/**
	 * Stamp reduced motion on <html> (item 38).
	 *
	 * ONE DIRECTION ONLY. "Reduced" adds the attribute; anything else removes it.
	 * There is no pole that forces motion back ON, because the OS media query is
	 * an accessibility request and a control that overrode it would be a control
	 * for overriding somebody's accessibility settings. The CSS is additive for
	 * the same reason: `_tokens.scss` zeroes the duration tokens under EITHER the
	 * media query or this attribute, so they compose rather than compete.
	 *
	 * @param {string} motion - "Reduced", or "" to follow the OS.
	 */
	function apply_motion(motion) {
		const html = document.documentElement;
		if (String(motion).toLowerCase() === "reduced") html.setAttribute("data-bnd-motion", "reduce");
		else html.removeAttribute("data-bnd-motion");
	}

	/**
	 * Persist a density choice and apply it immediately (optimistic, with
	 * rollback on server failure so the visible state never lies).
	 *
	 * `{ save: false }` APPLIES WITHOUT PERSISTING — the Appearance dialog's
	 * preview, where a click must be visible and abandonable. Writing on every
	 * click would also be six full user-cache clears for one Save, which is what
	 * `api.set_personal` exists to avoid.
	 *
	 * @param {string} density - one of the CYCLE values.
	 * @param {{save?: boolean}} [opts]
	 * @returns {Promise<void>}
	 */
	bunood.set_density = function (density, opts) {
		const previous = frappe.boot.bnd_density || "";
		apply_density(density);
		if (opts && opts.save === false) return Promise.resolve();
		return frappe
			.xcall("bunood_theme.api.set_user_density", { density })
			.then(() => {
				frappe.boot.bnd_density = density;
				refresh_density_label();
				frappe.show_alert({
					message: density
						? __("Density: {0}", [__(density)])
						: __("Density: following site default"),
					indicator: "green",
				});
			})
			.catch(() => {
				apply_density(previous);
				refresh_density_label();
				frappe.show_alert({
					message: __("Could not save density preference"),
					indicator: "red",
				});
			});
	};

	/**
	 * Advance to the next density in the cycle. Wired to the "Toggle Density"
	 * Navbar Settings item (classic layout) and the avatar menu / status bar
	 * (all other layouts).
	 */
	bunood.cycle_density = function () {
		const current = frappe.boot.bnd_density || "";
		const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
		bunood.set_density(next);
	};

	// Apply the boot value NOW — before DOMContentLoaded, therefore before
	// Frappe renders anything density affects. See file header.
	apply_density((window.frappe && frappe.boot && frappe.boot.bnd_density) || "");
	apply_motion((window.frappe && frappe.boot && frappe.boot.bnd_motion) || "");
	bunood.set_motion = function (motion, opts) {
		apply_motion(motion);
		if (opts && opts.save === false) return Promise.resolve();
		return frappe
			.xcall("bunood_theme.api.set_personal", { values: { bnd_motion: motion } })
			.then(() => {
				frappe.boot.bnd_motion = motion;
			});
	};

	// ── Icon weight (item 23) ─────────────────────────────────────────────────
	/**
	 * Stamp the global icon stroke weight on <html>. It applies to EVERY desk
	 * icon through _icons.scss, so it is a document attribute, applied at boot
	 * before first paint exactly like density.
	 * @param {string} weight - "1.25" | "1.5" | "1.75" | "2", or "" to clear.
	 */
	function apply_icon_weight(weight) {
		const html = document.documentElement;
		if (weight) html.setAttribute("data-bnd-icon-weight", weight);
		else html.removeAttribute("data-bnd-icon-weight");
	}

	/**
	 * Live-apply the global icon axes from the settings form. The Icons picker
	 * calls this alongside sb_apply / crumb_apply, because its fields feed three
	 * different runtimes (the sidebar, the breadcrumb, and this document-level
	 * weight). MANDATORY per the kit contract — a picker that saves without
	 * applying is the status-kit failure class.
	 * @param {object} values - a Theme Settings values object (frm.doc is fine).
	 */
	bunood.icon_apply = function (values) {
		if (values && values.icon_weight !== undefined) apply_icon_weight(values.icon_weight);
	};

	apply_icon_weight(
		(window.frappe && frappe.boot && frappe.boot.bnd_icons && frappe.boot.bnd_icons.weight) || ""
	);

	// ════════════════════════════════════════════════════════════════════════
	// RTL correction — see bunood_theme/i18n/rtl_patch.py for the Python half.
	// ════════════════════════════════════════════════════════════════════════

	// frappe.utils.is_rtl() independently hardcodes the same four-language
	// list as its Python counterpart (public/js/frappe/utils/utils.js) — not
	// derived from any boot field, so the Python-side patch does not reach
	// it; this is a second, separate copy of the same defect. Every consumer
	// (toolbar, sidebar, menu, report views, print) calls this ONE function,
	// and unlike Python's import-time name binding, a JS object's property
	// lookup is live at call time — so reassigning it here, before anything
	// has had a chance to call it, is safe regardless of script load order.
	(function patch_is_rtl() {
		const rtl_langs = (window.frappe && frappe.boot && frappe.boot.bnd_rtl_langs) || [];
		if (!frappe.utils || !rtl_langs.length) return;
		frappe.utils.is_rtl = function (lang) {
			const code = lang || frappe.boot.lang || "";
			const parent = code.split("-")[0].split("_")[0];
			return rtl_langs.indexOf(parent) !== -1;
		};
	})();

	// ════════════════════════════════════════════════════════════════════════
	// Chart chrome — the chart_grid axis (item 25)
	// ════════════════════════════════════════════════════════════════════════
	//
	// The data-bnd-chart-grid attribute drives surfaces/_charts.scss: it themes
	// frappe-charts' own --charts-* variables and chooses where a chart carries its
	// weight. This is a CSS concern, independent of the colour wrap below — so it is
	// applied here whether or not frappe.Chart exists, exactly like the layout and
	// status attributes. Unknown label → no attribute → the base themed frame.
	const CHART_GRID_SLUGS = {
		"Hairline Axes": "axes",
		"Ruled Baseline": "ruled",
		"Dashed Guides": "dashed",
		"Bold Data": "bold",
		"Filled Area": "filled",
	};

	function apply_chart_grid_attr(label) {
		const slug = CHART_GRID_SLUGS[label];
		const html = document.documentElement;
		if (slug) html.setAttribute("data-bnd-chart-grid", slug);
		else html.removeAttribute("data-bnd-chart-grid");
	}

	apply_chart_grid_attr(
		((window.frappe && frappe.boot && frappe.boot.bnd_chart) || {}).chart_grid || ""
	);

	// ════════════════════════════════════════════════════════════════════════
	// Chart series palette (item 25)
	// ════════════════════════════════════════════════════════════════════════
	//
	// WHAT AND WHY. frappe-charts takes series colours as a JS array and writes
	// them as inline SVG styles — unreachable from CSS — and when a chart supplies
	// none it falls back to the vendor's own palette, which no gate has measured
	// (its default first colour is 2.4:1 on a white card). So the colours come
	// from us instead: a contrast-validated, colour-vision-safe ramp derived in
	// palette.series_ramp and shipped as the --bnd-series-* tokens.
	//
	// HOW. Every chart in v16 is built through ONE funnel, `new frappe.Chart(...)`
	// (frappe/public/js/frappe/ui/chart.js). We wrap that constructor — reaching
	// all seven call sites, where wrapping the widget method would reach only two.
	// A plain function, NOT `class extends`: frappe-charts' Chart constructor
	// RETURNS a different object (getChartByType), so a subclass's `this` is
	// silently rebound and its prototype never joins the chain. Reassigning a
	// function binding, before anything constructs a chart, is the same safe act
	// as the is_rtl patch above and for the same live-lookup reason.
	//
	// FALLS OPEN. No frappe.Chart, tokens that will not resolve to plain hex, or a
	// chart type we leave alone (heatmap wants a sequential ramp, not this) — any
	// of these and we install nothing extra and the chart renders exactly as stock.
	(function patch_chart_colors() {
		if (!window.frappe || typeof frappe.Chart !== "function") return;

		// Whether a slot carries an admin colour worth KEEPING — deliberately
		// permissive: any non-empty string. frappe-charts accepts more than #hex /
		// rgb() / hsl() (its own PRESET_COLOR_MAP honours "teal", "blue", … via
		// custom_options), and it validates each entry itself, so a stricter test
		// here would DISCARD a valid admin colour and overwrite it with the ramp —
		// the opposite of the intent. A `[]` (the vendor's `[[]]` degenerate for an
		// uncoloured chart), `""`, undefined or a non-string is an empty slot.
		const admin_set = (c) => typeof c === "string" && c.trim().length > 0;

		// The resolved ramp, cached per theme generation. getComputedStyle returns
		// the token's computed value; our tokens are authored as plain 6-digit hex
		// precisely so this is a hex and not a var()/color-mix string frappe-charts
		// would reject. If ANY slot is not clean hex we return null and leave the
		// chart on the vendor default — a coherent stock palette beats a mixture of
		// ours and theirs that looks deliberate.
		let ramp_cache = null;
		let ramp_gen = 0;
		let ramp_cache_gen = -1;
		function resolve_ramp() {
			if (ramp_cache && ramp_cache_gen === ramp_gen) return ramp_cache;
			const cs = getComputedStyle(document.documentElement);
			const out = [];
			for (let i = 1; i <= 7; i++) {
				const v = cs.getPropertyValue("--bnd-series-" + i).trim();
				if (!/^#[0-9a-f]{6}$/i.test(v)) return null;
				out.push(v.toLowerCase());
			}
			ramp_cache = out;
			ramp_cache_gen = ramp_gen;
			return out;
		}

		// Fill only what the admin left empty. A per-chart colour the admin set on
		// the Dashboard Chart doc is their data and is kept in place; a hole (a
		// null field, or the vendor's `[[]]` degenerate for an uncoloured Line/Bar
		// that otherwise logs `"" is not a valid color`) takes the ramp. Heatmap is
		// returned untouched.
		function merged_colors(given, type) {
			if (type === "heatmap") return given;
			const ramp = resolve_ramp();
			if (!ramp) return given;
			const n = Math.max(ramp.length, given.length);
			const out = [];
			for (let i = 0; i < n; i++) {
				const a = given[i];
				out[i] = admin_set(a) ? a : ramp[i % ramp.length];
			}
			return out;
		}

		// Live charts, so a theme flip can repaint them. A plain Set pruned by
		// `container.isConnected` — the honest synchronous "still on screen" test;
		// a GC'd chart needs no repaint, so WeakRef would be over-engineering.
		const live = new Set();
		const deferred = new Set();

		function repaint_one(c) {
			if (!c || c._bnd_type === "heatmap" || !c.container || !c.container.isConnected) return;
			const colors = merged_colors(c._bnd_given || [], c._bnd_type);
			c.colors = colors;
			if (c.tip) c.tip.colors = colors; // SvgTip captured the array separately
			try {
				// draw(false, false): rebuild components in place, same instance and
				// container, no refetch, no entry animation. Reconstructing would
				// strand the widget's reference to this chart.
				c.draw(false, false);
			} catch (e) {
				/* a vendor draw throwing must not take the desk down */
			}
		}

		// A repaint destroys an open tooltip, so a chart the user is pointing at or
		// keyboarding through is parked and flushed when they leave it.
		function busy(c) {
			return (
				(c.container.matches && c.container.matches(":hover")) ||
				c.container.contains(document.activeElement)
			);
		}
		function repaint_all() {
			ramp_gen++; // invalidate the cache: the theme moved
			for (const c of Array.from(live)) {
				if (!c.container || !c.container.isConnected) {
					live.delete(c);
					continue;
				}
				if (busy(c)) deferred.add(c);
				else repaint_one(c);
			}
		}
		function flush_deferred() {
			for (const c of Array.from(deferred)) {
				if (!c.container || !c.container.isConnected) {
					deferred.delete(c);
					continue;
				}
				if (busy(c)) continue;
				deferred.delete(c);
				repaint_one(c);
			}
		}
		document.addEventListener("pointerout", flush_deferred, true);
		document.addEventListener("focusout", flush_deferred, true);

		const NativeChart = frappe.Chart;
		function BndChart(parent, options) {
			const given =
				options && Array.isArray(options.colors) ? options.colors.slice() : [];
			if (options) options.colors = merged_colors(given, options.type);
			// Turn the area fill on for every line chart so the Filled Area style
			// (surfaces/_charts.scss) has a .region-fill to reveal — CSS then shows
			// or hides it per chart_grid, keeping that axis a pure-CSS live preview.
			// The fill's gradient is generated by frappe-charts from OUR series
			// colour. Left alone if the doc already set it.
			if (options && options.type === "line") {
				options.lineOptions = options.lineOptions || {};
				if (options.lineOptions.regionFill === undefined) options.lineOptions.regionFill = 1;
			}
			const chart = new NativeChart(parent, options);
			if (chart && chart.container) {
				chart._bnd_given = given;
				chart._bnd_type = options && options.type;
				// Prune opportunistically so the set cannot grow without bound on a
				// long-lived desk that renders many charts.
				for (const c of live) if (!c.container || !c.container.isConnected) live.delete(c);
				live.add(chart);
			}
			return chart;
		}
		BndChart.prototype = NativeChart.prototype;
		frappe.Chart = BndChart;

		// The ONE honest theme-flip signal: frappe.ui.set_theme writes data-theme
		// and emits no event. One observer on one node for the document's lifetime
		// — the leak class is per-chart listeners, which this avoids. Coalesced to
		// one pass per frame so a flip that also swaps the brand sheet redraws once.
		let raf_queued = false;
		if (typeof MutationObserver === "function" && document.documentElement) {
			new MutationObserver(function () {
				if (raf_queued) return;
				raf_queued = true;
				requestAnimationFrame(function () {
					raf_queued = false;
					repaint_all();
				});
			}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		}

		// The MANDATORY live-preview hook, present from day one — a kit that saves
		// but does not apply is the recorded failure class. The chart_grid picker
		// calls this with the new label: the attribute flips (CSS responds instantly
		// — gridlines, the area fill's opacity) and the series are repainted, so a
		// theme flip and a settings change go through one door.
		bunood.chart_apply = function (values) {
			if (values && values.chart_grid !== undefined) apply_chart_grid_attr(values.chart_grid);
			repaint_all();
		};
	})();

	// Set the attribute NOW, for the same timing reason as density: the CSS
	// matrix (chrome/_layouts.scss) must know the layout before Frappe builds
	// the sidebar, or hidden rows would flash in and out.
	(function mark_desk_active() {
		// UNCONDITIONAL SINCE ITEM 37. This used to stamp a LAYOUT SLUG read from
		// `frappe.boot.bnd_layout`, and every rule keyed on it was really asking
		// "did our chrome system start" rather than "which layout is this" - only
		// ONE rule in the whole tree ever read the value, and it was really about
		// where the bell mounted (now `data-bnd-bell`). With the layout no longer
		// stored there is no slug to carry, so the attribute becomes what it always
		// meant: a presence mark, absent only when this file never ran.
		//
		// STAMPED HERE, EARLY, for the same timing reason as density: the CSS matrix
		// must see it before Frappe builds the sidebar, or scoped rules would flash
		// in and out.
		document.documentElement.setAttribute("data-bnd-desk", "");
	})();

	// The status style travels as an attribute for the same reason as the
	// layout: it is state the stylesheet has to be able to see.
	//
	// It used to carry a second job — zeroing the bottom clearance when the
	// style is "Off" — and no longer does. Clearance is now MEASURED from the
	// chrome that actually rendered (observe_bottom_reserve), so "Off" needs
	// no special case: no bar in the DOM measures zero. The attribute stays
	// because it is a legitimate styling hook, but nothing about the desk's
	// geometry depends on it any more.
	(function apply_status() {
		const boot = (window.frappe && frappe.boot && frappe.boot.bnd_status) || null;
		const label = (boot && boot.status_style) || "Quiet";
		document.documentElement.setAttribute("data-bnd-status", String(label).toLowerCase());
	})();

	// ── Skip link (34a, design pick 4A) ─────────────────────────────────────
	// A keyboard user otherwise crosses the whole chrome — pane, bars, dock —
	// on every page before reaching content. First Tab reveals a pill that
	// jumps straight to the page; first BY DOCUMENT ORDER, never by positive
	// tabindex, which reorders the whole page's tab sequence around itself.
	//
	// AN ENSURE, NOT A ONE-SHOT: mounted at parse time the link WAS body's
	// first child — and then Frappe prepended `.body-sidebar-container` during
	// boot and quietly demoted it, so the first Tab landed on the pane's brand
	// (measured 2026-08-09). It re-asserts its place in the same passes that
	// mount the chrome, which run at boot and on every route change; the check
	// is one property read when nothing has moved.
	function ensure_skip_link() {
		if (!document.body) return;
		let link = document.querySelector(".bnd-skip-link");
		if (!link) {
			// tabindex="1" IS the anti-pattern, taken knowingly: Frappe's list
			// rows carry tabindex="1", and positive values precede every
			// tabindex="0" element regardless of document order — so on list
			// pages (the desk's most common) no ordinary element can be the
			// first Tab. Matching the value puts the link first among equals
			// by document order, which the ensure below maintains. Remove the
			// moment upstream drops positive tabindexes.
			link = el("button", "bnd-skip-link", { type: "button", tabindex: "1" });
			link.textContent = __("Skip to content");
			link.addEventListener("click", () => {
				const main =
					document.querySelector(".main-section .page-container:not([style*='display: none']) .page-head") ||
					document.querySelector(".main-section");
				if (!main) return;
				main.setAttribute("tabindex", "-1");
				main.focus();
			});
		}
		if (document.body.firstElementChild !== link) {
			document.body.insertBefore(link, document.body.firstChild);
		}
	}
	ensure_skip_link();

	/**
	 * Is our chrome system actually running? Boot payload present, not attribute.
	 *
	 * SPLIT OUT OF `layout()` IN ITEM 37, because that one name was answering two
	 * questions and the answers diverged the moment the layout stopped being
	 * stored. The guards below mean "boot failed or the theme is inactive, leave
	 * Frappe's desk alone"; `data-bnd-desk` CANNOT answer that any more, since it
	 * is stamped unconditionally by the fact this file ran at all.
	 */
	function theme_active() {
		return !!(window.frappe && frappe.boot && frappe.boot.bnd_chrome);
	}

	/**
	 * The active layout's slug, or "" when the containers spell no shipped shape.
	 *
	 * DERIVED, NEVER STORED (item 37). `desk_layout` is deleted, so the shape is
	 * computed server-side by `presets.layout_of`, comparing the live settings
	 * against `registry.layout_settings` - one catalogue, one derivation. It reads
	 * the tenant placements as well as the containers, because Classic and Bottom
	 * Bar have identical container rows, and it EXCLUDES `search_placement`,
	 * because search's own slot is the question this answer is asked to serve. A desk whose containers match no preset answers
	 * "", which is a real and common state since the container split; the two
	 * callers below fall back rather than guess.
	 */
	function layout() {
		const name = (window.frappe && frappe.boot && frappe.boot.bnd_desk_shape) || "";
		return name.toLowerCase().replace(/\s+/g, "");
	}

	// ════════════════════════════════════════════════════════════════════════
	// Containers (component rework, slice 2c)
	// ════════════════════════════════════════════════════════════════════════
	//
	// WHAT CHANGED
	//   A container used to mount because the LAYOUT said so — `mount_chrome`
	//   read one Select and a ladder of branches decided which strips appeared.
	//   Each container is its own setting now, delivered as `frappe.boot
	//   .bnd_chrome`, and a layout is a preset that WRITES those settings
	//   (registry.py's LAYOUT_CHROME is the catalogue) rather than standing in
	//   for them.
	//
	// WHY THAT MATTERS BEYOND TIDINESS
	//   While the layout decided, every question about the desk had two
	//   answers — what the layout implied and what the component settings said
	//   — and the seam between them produced every defect in 0.10.0. One
	//   setting per container is one answer per question.
	//
	// FALLS OPEN, LIKE EVERYTHING ELSE HERE
	//   No boot payload (theme inactive, boot failed, a site whose migration
	//   has not run) means `chrome_state` is null and `container_on` answers
	//   from the layout exactly as before. A desk never loses chrome because a
	//   payload was missing.
	//
	// THE SPLIT LANDS ONE CONTAINER PER SLICE, so this map is deliberately
	// partial: a container with no entry falls back to the layout branch that
	// still owns it. LAYOUT_CONTAINERS is that fallback, and it shrinks to
	// nothing as the slices land.

	/** Boot's per-container on/off, keyed by registry container key. */
	const chrome_state = (window.frappe && frappe.boot && frappe.boot.bnd_chrome) || null;

	// ════════════════════════════════════════════════════════════════════════
	// Mobile / narrow mode (item 24)
	// ════════════════════════════════════════════════════════════════════════
	//
	// Below Frappe's own mobile boundary — `frappe.is_mobile()` is exactly
	// `innerWidth < 768` — the desktop chrome cannot stand: `toolbar.js` swaps
	// away the <header> the top bar mounts into (desk.html:38), and Frappe
	// collapses the side pane to an off-canvas drawer. So the desk COLLAPSES to
	// one preset, `bnd_narrow_chrome` (registry.NARROW_CHROME): the host-free
	// bottom bar carries the critical tenants (`bnd_narrow_placement`), and
	// Frappe's own drawer — reached by its top-left menu — carries workspaces, so
	// nothing of ours duplicates it.
	//
	// APPLIED, NEVER PERSISTED. A resize is not a gesture; if narrow mode wrote
	// settings, one phone visit would rewrite a desk configured on a monitor. It
	// is a runtime override read by `container_on` / `active_placement` while
	// narrow, and touches neither the stored fields nor the layout's derived name.
	//
	// REACTS TO THE BREAKPOINT, NOT `resize`. The <header> swap was a boot
	// decision nothing re-ran, so a desk loaded at 400px and widened kept no top
	// bar until reload. `matchMedia` fixes both directions: crossing 768 re-runs
	// the container ladder (`remount_chrome`). Falls open — no payload means
	// `is_narrow()` is false and every answer comes from the desktop path.
	const narrow_chrome = (window.frappe && frappe.boot && frappe.boot.bnd_narrow_chrome) || null;
	const narrow_placement = (window.frappe && frappe.boot && frappe.boot.bnd_narrow_placement) || null;
	// The user's phone-bar toggles (item 24 C2): which tenants join search below
	// 768. Search itself has no toggle — it is the only search on a phone. A live
	// preference, not a rebuild: active_placement turns a 0 into "Off" while narrow.
	const mobile_state = (window.frappe && frappe.boot && frappe.boot.bnd_mobile) || null;
	const MOBILE_MQ = typeof window.matchMedia === "function" ? window.matchMedia("(width < 768px)") : null;

	/** Below Frappe's 768 mobile boundary, with a narrow preset to apply. */
	function is_narrow() {
		return !!(MOBILE_MQ && MOBILE_MQ.matches && narrow_chrome);
	}

	/**
	 * Which containers each layout mounted BEFORE the split — the fallback,
	 * and the honest record of what the mount ladder used to do.
	 *
	 * It is not `registry.LAYOUT_CHROME`. That table says what a layout WRITES
	 * going forward; this says what 0.10.0 rendered, and the two deliberately
	 * differ — Classic mounted a bottom strip here (subject to `status_style`,
	 * which the 0.11.0 patch set to Off for sites that had not opted in) while
	 * the catalogue writes none, because a Classic desk with a bar on it is not
	 * Classic. Confusing what a thing did with what it means is how a migration
	 * artefact becomes a design; they are kept in different files for that
	 * reason.
	 *
	 * EVERY layout mounted the bottom strip — the ladder called
	 * `mount_statusbar` on all five branches — and every layout but Dock had a
	 * side pane. Writing only the container each branch was NAMED for would
	 * have left the last two slices with a fallback that silently answered "no"
	 * for a container that was plainly there.
	 */
	const LAYOUT_CONTAINERS = {
		topbar: ["topbar", "bottombar", "sidepane"],
		compact: ["pagehead", "bottombar", "sidepane"],
		classic: ["bottombar", "sidepane"],
		bottombar: ["bottombar", "sidepane"],
		// The one layout with no side pane: it hides the whole container.
		dock: ["dock", "bottombar"],
	};

	/**
	 * Should this container mount?
	 *
	 * @param {string} key - a registry container key ("topbar", "dock", …).
	 * @returns {boolean}
	 */
	function container_on(key) {
		// Narrow mode wins: it is the runtime collapse to the mobile preset, and
		// it must override both the stored setting and the layout fallback.
		if (is_narrow() && Object.prototype.hasOwnProperty.call(narrow_chrome, key)) {
			return !!narrow_chrome[key];
		}
		if (chrome_state && Object.prototype.hasOwnProperty.call(chrome_state, key)) {
			return !!chrome_state[key];
		}
		return (LAYOUT_CONTAINERS[layout()] || []).indexOf(key) !== -1;
	}

	/**
	 * Record that a container really mounted.
	 *
	 * SAME POLARITY AS `data-bnd-own`, and for the same reason. `data-bnd-
	 * layout` is a declaration made at boot about what we INTEND to mount;
	 * `mount_topbar` bails whenever `.main-section > header` is missing. That is
	 * NOT "every viewport under ~480px" (this comment's old claim, corrected by
	 * item 24): Frappe renders the empty <header> at every width (desk.html:38),
	 * then `toolbar.js` REPLACES it whenever `frappe.is_mobile()` (innerWidth <
	 * 768) OR read_only OR impersonation OR an announcement widget is set — so
	 * the bar can be absent on a 1920px desk too. A stylesheet keyed on the
	 * intention then reserves space for a bar that is not there, or sticks a
	 * page head below a bar that never arrived. Keyed on the outcome there is
	 * nothing to get wrong.
	 *
	 * `data-bnd-statusbar` has worked this way since item 14 and is the model.
	 * This generalises it rather than adding a fifth bespoke attribute.
	 */
	function container_mounted(key) {
		document.documentElement.setAttribute("data-bnd-" + key, "");
	}

	/**
	 * Containers explicitly switched OFF, as a token list on <html>, applied
	 * before first paint.
	 *
	 * CONTAINERS ARE INDEPENDENT. Turning one on never turns another off — a
	 * dock and a side pane coexist if a user asks for both, exactly like every
	 * other pair. The Dock LAYOUT used to mean "dock, and therefore no side
	 * pane", and that coupling died with the split: the layout is a preset, so
	 * it writes `dock: 1, sidepane: 0` and the two settings go their own way
	 * afterwards.
	 *
	 * WHY THE OFF-LIST IS A DECLARATION WHEN THE HOUSE RULE IS TO KEY ON THE
	 * OUTCOME
	 *   Our own chrome is not in the document before it mounts, so an
	 *   outcome-keyed rule has nothing to flash. The side pane is the other way
	 *   round: it is Frappe's, it is there from the first paint, and it stays
	 *   visible until a rule says otherwise. Keyed on anything JS stamps later,
	 *   every pane-off desk would show the pane for up to 150ms — the interval
	 *   `mount_chrome`'s poll waits on — and then have it vanish.
	 *
	 * WHY IT LISTS WHAT IS OFF RATHER THAN WHAT IS ON
	 *   So the failure mode is stock. No attribute — theme inactive, boot
	 *   failed, a site whose migration has not run — must hide nothing at all.
	 *   An on-list would have to be read as `:not([… ~= "sidepane"])`, which
	 *   MATCHES when the attribute is absent, and a failed boot would hide the
	 *   side pane and every affordance in it. That is the whole layout system's
	 *   contract inverted by a selector.
	 *
	 *   The price of a declaration is that it can be wrong, and this codebase
	 *   has paid it: a layout that promised a bell it never mounted left a desk
	 *   with no way to log out. So it is CHECKED — see `guard_critical_reach`.
	 */
	/**
	 * Containers whose absence hides something of FRAPPE'S, rather than merely
	 * declining to add something of ours.
	 *
	 * Only these need a declaration at all. A top bar that is off is simply not
	 * there; a side pane that is off takes the search row, the bell and the user
	 * button with it, because they live inside it.
	 *
	 * DECLARED BEFORE THE IIFE THAT READS IT, and that is not style. `const` is
	 * hoisted into a temporal dead zone, so reading it from the block below
	 * while it is still declared underneath throws a ReferenceError — inside
	 * this file's single top-level IIFE, which kills the whole of bunood.js and
	 * leaves a stock desk with no theme at all. Written after, this cost a test
	 * run: every "container is on" check failed and every "container is off"
	 * check passed, because nothing had mounted.
	 */
	const HIDES_NATIVE = { sidepane: true };

	function apply_chrome_off() {
		if (!chrome_state) return;
		// Through container_on so it is narrow-aware: a Dock site (side pane off
		// on the desktop) still gets its pane back as Frappe's drawer on a phone,
		// because container_on("sidepane") is 1 under the narrow preset.
		const off = Object.keys(HIDES_NATIVE).filter((k) => !container_on(k));
		if (off.length) document.documentElement.setAttribute("data-bnd-chrome-off", off.join(" "));
		else document.documentElement.removeAttribute("data-bnd-chrome-off");
	}
	apply_chrome_off();

	/**
	 * Stamp the viewport-mode attributes on <html>.
	 *   data-bnd-narrow  — below Frappe's 768 boundary, the mobile collapse is on
	 *                      (CSS hides the status signals, sizes the bar for touch).
	 *   data-bnd-touch   — a coarse pointer is present; the reveal-on-hover
	 *                      affordances stand down and hit targets grow. A separate
	 *                      axis from width: a touch laptop is wide, a dragged
	 *                      window is narrow with a mouse.
	 */
	function apply_viewport_mode() {
		const html = document.documentElement;
		if (is_narrow()) html.setAttribute("data-bnd-narrow", "");
		else html.removeAttribute("data-bnd-narrow");
		const coarse = typeof window.matchMedia === "function" && window.matchMedia("(any-pointer: coarse)").matches;
		if (coarse) html.setAttribute("data-bnd-touch", "");
		else html.removeAttribute("data-bnd-touch");
	}
	apply_viewport_mode();

	/**
	 * Restore pinch-zoom (item 24). Frappe's desk.html ships a viewport meta that
	 * LOCKS zoom — `maximum-scale=1.0, minimum-scale=1.0, user-scalable=no` — which
	 * fails WCAG 2.2 AA 1.4.4 (and axe's meta-viewport rule), and on a phone means
	 * a low-vision user cannot enlarge the desk at all. We keep the sizing
	 * (width=device-width, initial-scale) and drop the locks.
	 *
	 * THE ONE SANCTIONED TOUCH OF FRAPPE-GENERATED DOM (CLAUDE.md, GUIDELINES §1.3).
	 * That rule exists to stop us fighting Frappe's LAYOUT through its class names
	 * (ARCHITECTURE §2); a <head> meta is neither layout nor styling. There is no
	 * hook to reach it — it is a literal in the template, and update_website_context
	 * mutates the context dict, not a tag already rendered — and forking desk.html
	 * is what §4 retired. So JS is the only route that does not fork the template,
	 * and this is the exception, recorded at both ends. Idempotent and guarded, so
	 * it no-ops once Frappe (or an upstream fix) stops shipping the locks.
	 */
	function repair_viewport_meta() {
		const meta = document.querySelector('meta[name="viewport"]');
		if (!meta) return;
		const content = meta.getAttribute("content") || "";
		if (!/user-scalable\s*=\s*no|maximum-scale|minimum-scale/.test(content)) return;
		meta.setAttribute("content", "width=device-width, initial-scale=1.0, minimal-ui");
	}
	repair_viewport_meta();

	/**
	 * Give the side pane back when switching it off would leave a user stranded.
	 *
	 * THE RULE, which is the same one `mount_placed_tenants` applies to tenants:
	 * a control may be removed only while something else can still reach the
	 * same function. Every container off at once is a reachable configuration
	 * now, and it must not be a desk with no search, no notifications and no way
	 * to log out. The side pane is where every stock affordance lives, so it is
	 * the thing that comes back.
	 *
	 * ASKS THE DOM, AND ASKS IT LAST. It runs after every container has mounted
	 * and after both placement passes, because "is there a route to this" cannot
	 * be answered from settings — a tenant may have been placed in a region that
	 * did not materialise, and only the document knows. The critical list comes
	 * from `registry.py` via boot rather than being restated here; it is the
	 * table that defines `critical`, and a fourth copy of those three selectors
	 * is exactly the duplication this rework exists to remove.
	 *
	 * Exposed on `bunood_theme` so the suite can drive it directly: the state it
	 * defends against is one where a mount FAILED, which no setting can produce,
	 * and a guard that has never run is a guard with no evidence it works.
	 */
	function guard_critical_reach() {
		const html = document.documentElement;
		const off = (html.getAttribute("data-bnd-chrome-off") || "").split(/\s+/).filter(Boolean);
		if (!off.includes("sidepane")) return false;

		// PRESENCE, not visibility. This runs while Frappe is still painting,
		// so a node of ours that exists but has not been laid out yet is a real
		// route and measuring it would say otherwise. The natives are excluded
		// deliberately — they are inside the pane we have hidden, so asking
		// about them answers the question we are trying to decide.
		const critical = (window.frappe && frappe.boot && frappe.boot.bnd_critical) || [];
		const stranded = critical.filter((c) => !document.querySelector(c.selector));
		if (!stranded.length) return false;

		const kept = off.filter((k) => k !== "sidepane");
		if (kept.length) html.setAttribute("data-bnd-chrome-off", kept.join(" "));
		else html.removeAttribute("data-bnd-chrome-off");
		return true;
	}
	bunood.guard_critical_reach = guard_critical_reach;

	/**
	 * Take a container back off the desk.
	 *
	 * The mirror of each mount, and the reason `chrome_apply` can exist at all.
	 * The side pane's entry removes what WE put in it, never the pane: nothing
	 * of ours built the container, so `data-bnd-chrome-off` still hides that.
	 * The entry was `() => {}` until item 40, on the argument that hiding is the
	 * whole mechanism — true of the container and false of its contents.
	 */
	const CONTAINER_TEARDOWN = {
		topbar: () => {
			for (const n of document.querySelectorAll(".bnd-topbar")) n.remove();
		},
		pagehead: () => {
			// Pages are cached in the DOM, so this has to reach EVERY page head
			// that ever received a cluster, not just the one on screen. Missing
			// the others leaves a container that reappears by navigating.
			for (const n of document.querySelectorAll(".page-head .bnd-cluster, .page-head .bnd-cluster-divider")) {
				n.remove();
			}
		},
		bottombar: () => {
			for (const n of document.querySelectorAll(".bnd-statusbar")) n.remove();
			document.documentElement.removeAttribute("data-bnd-statusbar");
		},
		dock: () => {
			for (const n of document.querySelectorAll(".bnd-dock")) n.remove();
		},
		sidepane: sidepane_teardown,
	};

	/**
	 * Apply a change to the container settings to the LIVE desk.
	 *
	 * WHY THIS EXISTS
	 *   Every style kit re-applies on click — `bunood.crumb_apply`,
	 *   `bunood.sidebar_apply` and friends — so the desk IS the preview. The
	 *   five containers were the exception: read once from boot at page load,
	 *   with nothing to re-mount them. That was survivable while saving meant
	 *   pressing Save and reloading, and stopped being survivable the moment
	 *   Theme Settings began saving on click: there was no longer any gesture
	 *   that would refresh the desk, so switching a container did nothing
	 *   visible, ever. Reported as "the settings save but nothing is applied
	 *   in reality" — and it was exactly that, no more and no less.
	 *
	 * RELEASE FIRST, THEN RE-PLACE, and this is the part to be careful about.
	 *   Tearing a container down takes its tenants with it. A token left
	 *   claimed on <html> would then hide Frappe's own affordance with nothing
	 *   in its place — the failure this project has already paid for twice. So
	 *   every token is released before the containers move, and
	 *   `mount_placed_tenants` re-claims only what it really mounts. That is
	 *   the same release-then-look bargain it strikes internally for "Off".
	 *
	 * @param {Object} values - container key OR toggle fieldname -> 0|1.
	 */
	/**
	 * Tear down the containers now off, (re)mount those now on, then re-place
	 * every tenant. The shared body of `chrome_apply` and the breakpoint handler:
	 * both change what `container_on` / `placement_for` answer — chrome_apply
	 * through `chrome_state`, the breakpoint through `is_narrow()` — and then need
	 * the live desk to catch up to the new answers.
	 *
	 * RELEASE FIRST, THEN RE-PLACE. Tearing a container down takes its tenants
	 * with it; a token left claimed on <html> would hide Frappe's own affordance
	 * with nothing in its place — the failure this project has paid for twice. So
	 * every token is released, then `mount_placed_tenants` re-claims only what it
	 * really mounts.
	 */
	function remount_chrome() {
		// Same contract as mount_chrome: nothing to remount until the desk is up.
		// Guards a breakpoint change that fires during the boot poll window.
		if (!theme_active()) return;
		apply_chrome_off();

		// `panehead` joins them (item 40); see _layouts.scss.
		for (const token of ["search", "bell", "user", "panehead", "panetoggle"]) bnd_disown(token);

		for (const key of Object.keys(CONTAINER_TEARDOWN)) {
			if (container_on(key)) continue;
			CONTAINER_TEARDOWN[key]();
			document.documentElement.removeAttribute("data-bnd-" + key);
		}

		if (container_on("topbar")) mount_topbar();
		if (container_on("pagehead")) inject_compact_cluster();
		if (container_on("dock")) mount_dock();
		if (container_on("bottombar")) mount_statusbar();

		mount_search();
		mount_placed_tenants();
		if (guard_critical_reach()) mount_placed_tenants();
		if (container_on("sidepane")) mount_sidebar_kit();
		// The links live in containers too: without this, switching the bar
		// that held them leaves them behind in a node that has just been
		// removed, or absent from the one that has just arrived.
		sb_mount_utils();
		defer_bottom_reserve();
		// A shape change moves which route to Appearance exists, so the claim on
		// Frappe's Display item is re-measured rather than assumed (item 38).
		stamp_appearance_route();
	}
	bunood.remount_chrome = remount_chrome;

	bunood.chrome_apply = function (values) {
		if (!values || !chrome_state) return;

		// Accept either vocabulary. The settings form thinks in fieldnames and
		// the desk thinks in container keys; making the caller translate would
		// put the registry's mapping in a third place.
		const FIELD_TO_KEY = {
			topbar_enabled: "topbar",
			pagehead_enabled: "pagehead",
			bottombar_enabled: "bottombar",
			sidebar_enabled: "sidepane",
			dock_enabled: "dock",
		};
		for (const [name, value] of Object.entries(values)) {
			const key = key_of(name, FIELD_TO_KEY);
			if (key && key in chrome_state) chrome_state[key] = parseInt(value, 10) ? 1 : 0;
		}
		remount_chrome();
	};

	/**
	 * Cross the mobile boundary: re-stamp the viewport attributes and rebuild the
	 * chrome for the mode we are now in. Registered on `matchMedia` (not `resize`)
	 * because the mode is a threshold, not a continuum — and because the defect it
	 * closes is that nothing re-ran the container ladder when the width crossed
	 * 768, so a desk loaded narrow and widened kept a phone's chrome until reload.
	 */
	/**
	 * Apply a phone-bar toggle change (item 24 C2). Updates the live state and
	 * remounts. At the desktop width the settings form is viewed at, is_narrow()
	 * is false so the desk does not visibly change — the toggle governs the phone
	 * bar, which is not on screen — but the state is current the moment the window
	 * crosses 768. The kit's mandatory re-apply-on-click hook, same as the others.
	 */
	bunood.mobile_apply = function (values) {
		if (!values || !mobile_state) return;
		const FIELD_TO_KEY = { mobile_inbox: "inbox", mobile_user: "user", mobile_apps: "apps" };
		for (const [name, value] of Object.entries(values)) {
			const key = FIELD_TO_KEY[name];
			if (key && key in mobile_state) mobile_state[key] = parseInt(value, 10) ? 1 : 0;
		}
		remount_chrome();
	};

	function on_breakpoint_change() {
		apply_viewport_mode();
		remount_chrome();
	}
	if (MOBILE_MQ) {
		if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener("change", on_breakpoint_change);
		else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(on_breakpoint_change);
	}

	/** A container key, from either a key or its toggle fieldname. */
	function key_of(name, field_map) {
		if (Object.prototype.hasOwnProperty.call(field_map, name)) return field_map[name];
		return name;
	}

	// ════════════════════════════════════════════════════════════════════════
	// Ownership stamps
	// ════════════════════════════════════════════════════════════════════════
	//
	// THE POLARITY OF EVERY NATIVE-HIDING RULE.
	//
	// The old rule was: the LAYOUT declares it will replace the sidebar's bell,
	// so CSS hides that bell at first paint from `data-bnd-desk`. What
	// actually mounts is decided later, in the DOM, by code that can fail —
	// mount_topbar bails if Frappe rendered no <header>, and the Bottom Bar
	// strip refused to mount at all when the status style was "Off". When the
	// declaration removes the native and the replacement never arrives, the
	// affordance is DELETED, not degraded: a desk with no notifications and no
	// way to log out. That is the shape of every bug this area has produced.
	//
	// The new rule inverts it: natives stay visible until our replacement is
	// STAMPED PRESENT. `bnd_own("bell")` is called after the node is in the
	// DOM, and the CSS keys on `html[data-bnd-own~="bell"]`. There is no
	// release path to write, because release is the default state — a mount
	// that fails leaves the stock desk, which is this app's declared failure
	// contract (see the head of chrome/_layouts.scss).
	//
	// The flash cost is nil: every native row this touches is built by
	// Frappe's own JS after the splash, and a brief window showing both is
	// strictly better than a window showing neither.

	/** Claim an affordance: our replacement for it is mounted and visible. */
	function bnd_own(token) {
		const html = document.documentElement;
		const owned = new Set((html.getAttribute("data-bnd-own") || "").split(/\s+/).filter(Boolean));
		if (owned.has(token)) return;
		owned.add(token);
		html.setAttribute("data-bnd-own", [...owned].join(" "));
	}

	/**
	 * Claim Frappe's Display item — but only once a real route to ours EXISTS.
	 *
	 * MEASURED FROM THE DOM, NEVER FROM THE FACT THAT `bunood.appearance` IS
	 * DEFINED. A defined function is a declaration, and the ownership rule this
	 * file is built on says a native affordance is hidden only once our
	 * replacement is stamped PRESENT — the whole point being that a failed mount
	 * degrades to stock rather than to nothing. The seeder that puts our item in
	 * Frappe's dropdown swallows its own failures into a log by design, so an
	 * unconditional stamp plus a failed seed would leave a desk with no theme
	 * control at all: ours never mounted, Frappe's hidden.
	 *
	 * Two routes count, and either is enough: the seeded Navbar Settings item
	 * (present in every shape, including the ones that mount no avatar) and our
	 * own avatar menu button. Re-evaluated on every remount, because a shape
	 * change moves which of the two exists.
	 */
	/**
	 * Open on the workspace this person chose (item 38). Once, and only at the root.
	 *
	 * A REQUESTED ROUTE ALWAYS WINS. This fires only when the incoming path is the
	 * bare desk root with no route, no query and no hash — anything else is a
	 * deep link, and a landing preference that hijacked one would break every
	 * bookmark and every notification link in the product. Discourse resolves the
	 * same preference as a routing CONSTRAINT on `/` for exactly this reason;
	 * ours is a client redirect because Frappe's desk owns its own router.
	 *
	 * The value was validated against the workspaces this person can READ when it
	 * was stored, and re-validated on every read of the picker — but a permission
	 * revoked since then is still possible, and sign-in is the one moment somebody
	 * cannot route around a 403. So a workspace Frappe does not offer is dropped
	 * rather than attempted.
	 */
	let home_routed = false;
	function apply_home_route() {
		if (home_routed) return;
		home_routed = true;
		const home = (frappe.boot && frappe.boot.bnd_personal && frappe.boot.bnd_personal.home) || "";
		if (!home) return;
		if (location.search || location.hash) return;
		if (!/^\/(app|desk)\/?$/.test(location.pathname)) return;
		const known = (frappe.boot.allowed_workspaces || []).map((w) => w.name || w);
		if (known.length && !known.includes(home)) return;
		frappe.set_route("Workspaces", home);
	}

	function stamp_appearance_route() {
		const seeded = [...document.querySelectorAll(".frappe-menu .dropdown-menu-item")].some(
			(el) => /bunood_theme\.appearance/.test(el.getAttribute("onclick") || "")
		);
		if (seeded || document.querySelector(".bnd-avatar-btn")) bnd_own("appearance");
		else bnd_disown("appearance");
	}

	/** Release an affordance back to Frappe's own control. */
	function bnd_disown(token) {
		const html = document.documentElement;
		const owned = new Set((html.getAttribute("data-bnd-own") || "").split(/\s+/).filter(Boolean));
		if (!owned.delete(token)) return;
		if (owned.size) html.setAttribute("data-bnd-own", [...owned].join(" "));
		else html.removeAttribute("data-bnd-own");
	}

	// ════════════════════════════════════════════════════════════════════════
	// Sidebar style kit (item 10) — attribute application
	// ════════════════════════════════════════════════════════════════════════

	/**
	 * Theme Settings label -> attribute slug, per option. Unknown labels set
	 * no attribute for that option, and the CSS matrix simply does not match:
	 * every option fails open independently, not the kit as a whole.
	 */
	const SB_SLUGS = {
		placement: { "Attached": "attached", "Floating": "floating" },
		material: { "Solid": "solid", "Glass": "glass", "Blurred Glass": "glassblur" },
		// `color` is gone; see _sidebar.scss's head for why.
		icons: {
			"Colored Chips": "chips", "Colored Dots": "dots", "Filled Color": "filled",
			"Duotone": "duotone", "Brand Lines": "brandlines", "Monochrome": "mono",
		},
		active: {
			"Solid Pill": "pill", "Soft Pill": "softpill", "Accent Rail": "rail",
			"Outline": "outline", "Folder Tab": "foldertab",
		},
		sections: { "Plain": "plain", "Divided": "divided", "Cards": "cards" },
		wash: { "Off": "off", "Subtle": "subtle", "Rich": "rich" },
		// Legacy labels ("Hover-Expand", "Hover + Pin") predate the split into
		// mode + trigger; they still resolve so an already-configured site
		// keeps its rail across the upgrade.
		menurail: { "Always Expanded": "expanded", "Rail": "rail", "Hover-Expand": "rail", "Hover + Pin": "rail" },
		railtrigger: { "Hover": "hover", "Click": "click", "Hover + Pin": "hoverpin" },
		railbtn: { "None": "", "Edge": "edge", "Header": "header" },
		railbtnicon: { "Chevron": "chevron", "Menu": "menu", "Arrows": "arrows" },
		iconsrc: { "Smart": "smart", "Original": "original", "Letters": "letters" },
		badges: { "Off": "off", "Dots": "dots", "Counts": "counts" },
	};

	/**
	 * The style values currently IN EFFECT — boot's at load, possibly
	 * replaced by a live preview (bunood.sb_apply) or a personalize pick.
	 * Every mount reads THIS, never frappe.boot directly, which is what
	 * makes instant preview a re-application rather than a special mode.
	 */
	let sb_state = (window.frappe && frappe.boot && frappe.boot.bnd_sidebar) || null;

	/**
	 * Reflect a full set of sidebar options onto <html>, clearing whatever
	 * set came before — attributes are wholly derived state.
	 * @param {Object|null} sb - the boot-shaped values object.
	 */
	function apply_sidebar_attrs(sb) {
		if (!sb) return;
		sb_state = sb;
		const html = document.documentElement;
		for (const a of [...html.attributes]) {
			if (a.name.startsWith("data-bnd-sb-") || a.name === "data-bnd-rail") {
				html.removeAttribute(a.name);
			}
		}
		const set = (name, value) => value && html.setAttribute("data-bnd-sb-" + name, value);
		set("placement", SB_SLUGS.placement[sb.placement]);
		set("material", SB_SLUGS.material[sb.material]);
		set("color", "on"); // the kit's on/off marker, not a colour
		set("icons", SB_SLUGS.icons[sb.icons]);
		set("active", SB_SLUGS.active[sb.active]);
		set("sections", SB_SLUGS.sections[sb.sections]);
		set("wash", SB_SLUGS.wash[sb.wash]);
		set("menurail", SB_SLUGS.menurail[sb.menurail]);
		// Rail mode gets its own anchor attribute plus the trigger the JS
		// wires. Legacy "Hover + Pin" mode labels imply their trigger.
		if (SB_SLUGS.menurail[sb.menurail] === "rail") {
			html.setAttribute("data-bnd-rail", "");
			const trigger =
				SB_SLUGS.railtrigger[sb.rail_trigger] ||
				(sb.menurail === "Hover + Pin" ? "hoverpin" : "hover");
			html.setAttribute("data-bnd-sb-railtrigger", trigger);
		}
		set("iconsrc", SB_SLUGS.iconsrc[sb.icon_source] || "smart");
		set("badges", SB_SLUGS.badges[sb.badges]);
		if (parseInt(sb.filter, 10)) html.setAttribute("data-bnd-sb-filter", "");
		const width = parseInt(sb.pane_width, 10);
		if (width >= 1 && width <= 5) html.setAttribute("data-bnd-sb-width", String(width));
		const intensity = parseInt(sb.intensity, 10);
		if (intensity >= 1 && intensity <= 5) html.setAttribute("data-bnd-sb-intensity", String(intensity));
	}

	// Apply boot's values NOW — same timing rule as layout/density: the CSS
	// matrix must know every choice before Frappe renders the sidebar.
	apply_sidebar_attrs(sb_state);

	/** True when the sidebar kit is active (its color attribute is the anchor). */
	function sb_active() {
		return document.documentElement.hasAttribute("data-bnd-sb-color");
	}

	// ════════════════════════════════════════════════════════════════════════
	// Breadcrumb kit (item 11) — attribute application
	// ════════════════════════════════════════════════════════════════════════

	/**
	 * Theme Settings label -> attribute slug. "Original" deliberately maps to
	 * "" so it sets NO attributes at all — the CSS matrix matches nothing and
	 * v16's stock trail is untouched, the same escape hatch the desk-layout
	 * picker offers with "Classic". Unknown labels behave identically.
	 */
	// ════════════════════════════════════════════════════════════════════════
	// The SURFACE kits — list (15) · form (16) · workspace (25) · report (26)
	// · views (27) · overlays (28) · empty (29) · skeleton (30) · filters (31)
	// — one construction, NINE rows of a table. (This said "six" from the
	// refactor that created the table until item 31; items 29 and 30 each added
	// a row without touching it, which is how a count in a comment drifts. It
	// counts the rows BELOW — if you add one, change it.)
	// ════════════════════════════════════════════════════════════════════════
	//
	// Unlike every chrome kit above, a surface kit mounts NOTHING and injects
	// nothing: it is attributes on <html> and a stylesheet over Frappe's own
	// DOM. No node to build, no native to release, no ownership stamp —
	// absent attributes ARE the stand-down, which is what lets "Original" be
	// a pure clearing.
	//
	// WHY A TABLE, AND WHY NOW (item 29 slice 2a). Six kits shipped as six
	// hand-copied blocks whose ONLY differences were data: the attribute
	// stem, the boot key, the slug maps, and one post-hook. That shape has
	// bitten twice — the item-18 "escapee" class is precisely a hand-copied
	// list drifting from its source of truth — and the seventh copy would
	// not fit the payload ceiling. The behaviour below is the six originals'
	// to the letter; the gate for this refactor was byte-identical
	// data-bnd-* attributes and a full green suite, never trust.
	//
	// THE SHARED SHAPE, once, instead of six times:
	// - Label -> slug maps: each option fails open INDEPENDENTLY — an
	//   unknown label sets no attribute for that option and the others
	//   still apply. "Original" maps the anchor to "" — the whole kit
	//   stands down and stock renders.
	// - State: the options currently IN EFFECT — boot's at load, possibly
	//   replaced by a live preview. Mounts read THIS, never frappe.boot, so
	//   preview is a re-application, not a mode.
	// - apply(): reflects options onto <html>, clearing whatever set came
	//   before — attributes are wholly derived state. A falsy anchor slug
	//   (Original / unknown / no boot) clears everything and sets nothing.
	//   Payload keys are FIELDNAMES (the status shape): no mirror map
	//   exists to fall out of step with presets.<KIT>_FIELDS.
	// - The boot call runs at parse time, before Frappe renders the first
	//   row/section/tile/cell/card/toast — the timing rule every kit keeps:
	//   the anchor is on <html> before the DOM it styles exists, so nothing
	//   stale ever paints.
	// - bunood.<kit>_apply: the LIVE PREVIEW hook, mandatory from day one —
	//   the status kit shipped without its hook and that is the recorded
	//   failure class: settings that save but visibly do nothing.
	//
	// Per-row notes that used to be block doctrine:
	// - workspace's attribute stem is "ws", not "workspace" — _workspace.scss
	//   has keyed on data-bnd-ws since item 25.
	// - views: Tinted/Chip/Cover are the NEUTRALS and map to "" (Frappe
	//   already tints the kanban column inline and re-themes it for dark;
	//   "keep stock" needs no attribute). Its live preview must also repaint
	//   the calendars — an attribute flip alone cannot recolour an
	//   inline-styled event.
	// - overlay: the REPAIRS are not here and must not be —
	//   surfaces/_overlays.scss scopes them html[data-theme], outside the
	//   anchor, so clearing it never makes a dialog illegible. Dim and Inset
	//   map to "" (stock scrim, stock row).

	// Assigned by patch_calendar_colors below; a no-op until then so a boot
	// with no Calendar class (or a headless build) never throws.
	let bnd_repaint_calendars = function () {};

	/**
	 * The options currently IN EFFECT per kit, keyed by kit name — written by
	 * every apply(), read by the one consumer outside the loop (the calendar
	 * wrap needs views' current mark). Never read frappe.boot directly for a
	 * kit's current state; boot is only the seed.
	 */
	const bnd_kit_state = {};

	/** The label->slug map for one axis of one kit — the single copy. */
	function bnd_axis_slugs(kit, suffix) {
		const row = BND_SURFACE_KITS[kit].axes.find((a) => a[0] === suffix);
		return row ? row[2] : {};
	}

	/**
	 * One row per surface kit. attr = the data-bnd-<attr> stem; anchor =
	 * [fieldname, label->slug]; axes = [suffix, fieldname, label->slug] each;
	 * check = [suffix, fieldname] set presence-only ("" value) when truthy,
	 * stood down under (hover: none) in the stylesheet where it reveals.
	 */
	const BND_SURFACE_KITS = {
		list: {
			attr: "list", boot: "bnd_list",
			anchor: ["list_style", { "Original": "", "Hairline Rows": "hairline", "Open Rows": "open", "Zebra Stripes": "zebra", "Floating Cards": "cards" }],
			axes: [
				["hover", "list_hover", { "Soft Wash": "wash", "Edge Rail": "rail" }],
				["select", "list_selection", { "Soft Tint": "soft", "Accent Rail": "rail", "Bold Bar": "bold" }],
			],
			check: ["ckreveal", "list_checkbox_reveal"],
		},
		form: {
			attr: "form", boot: "bnd_form",
			anchor: ["form_style", { "Original": "", "Hairline Panels": "hairline", "Open Canvas": "open", "Floating Panels": "cards", "Paper Sheet": "sheet" }],
			axes: [
				["tabs", "form_tabs", { "Brand Underline": "underline", "Segment Pills": "segment", "Solid Pill": "pill" }],
				["side", "form_sidebar", { "Hairline Edge": "edge", "Quiet Pane": "pane", "Floating Pane": "card" }],
			],
			check: ["ckreveal", "form_grid_checkbox_reveal"],
		},
		workspace: {
			attr: "ws", boot: "bnd_workspace",
			anchor: ["workspace_style", { "Original": "", "Open Board": "open", "Hairline Grid": "grid", "Soft Tiles": "soft", "Headed Panel": "headed", "Floating Cards": "cards", "Mixed Weights": "mixed" }],
			axes: [
				["metric", "workspace_metric", { "Quiet": "quiet", "Display": "display", "Headline": "headline", "Centred": "centred", "Inline": "inline" }],
				["rows", "workspace_rows", { "Plain": "plain", "Divided": "divided", "Edge Rail": "rail" }],
			],
			check: ["menu", "workspace_menu_reveal"],
		},
		report: {
			attr: "report", boot: "bnd_report",
			anchor: ["report_style", { "Original": "", "Ruled Grid": "ruled", "Ledger Rows": "ledger", "Open Sheet": "open", "Pinned Slab": "slab" }],
			axes: [
				["grain", "report_grain", { "Plain": "", "Row Stripes": "stripes" }],
				["rows", "report_rows", { "Soft Wash": "wash", "Edge Rail": "rail", "Bold Bar": "bold" }],
			],
			check: ["ckreveal", "report_checkbox_reveal"],
		},
		views: {
			attr: "views", boot: "bnd_views",
			anchor: ["views_style", { "Original": "", "Hairline": "hairline", "Soft Tiles": "tiles", "Floating Cards": "cards", "Solid Panels": "panels" }],
			axes: [
				["band", "views_band", { "Plain": "plain", "Tinted": "" }],
				["mark", "views_mark", { "Dot": "dot", "Chip": "", "Outlined": "outlined" }],
				["media", "views_media", { "Cover": "", "Contain": "contain" }],
			],
			check: ["reveal", "views_reveal"],
			after: () => bnd_repaint_calendars(),
		},
		overlay: {
			attr: "overlay", boot: "bnd_overlay",
			anchor: ["overlay_style", { "Original": "", "Hairline": "hairline", "Soft": "soft", "Floating": "floating", "Solid": "solid" }],
			axes: [
				["scrim", "overlay_scrim", { "Dim": "", "Tinted": "tinted", "Blurred": "blurred" }],
				// Inset is the NEUTRAL and Plain the active override — item 27's
				// views_band polarity, forced here too by measurement: Bootstrap's
				// dropdown row already carries an 8px radius while .frappe-menu's is
				// square, so "make it a pill" changes one vocabulary and not the
				// other. The anchor unifies; this axis offers square, edge to edge.
				["menu", "overlay_menu", { "Plain": "plain", "Inset": "" }],
			],
			check: null,
		},
		empty: {
			attr: "empty", boot: "bnd_empty",
			// Quiet separates by nothing, Open by AIR (the default — the first in
			// this project that is not the boldest option, because this block sits
			// inside containers other kits already frame), Framed by a solid
			// hairline, Filled by tone. Framed and Filled never combine.
			anchor: ["empty_style", { "Original": "", "Quiet": "quiet", "Open": "open", "Framed": "framed", "Filled": "filled" }],
			// Glyph and Plain are the NEUTRALS and map to "" — the stock mark is
			// already correct (--text-light is bridged) and the stock button is what
			// "leave it alone" means. The axes offer the real alternatives, which is
			// item 27's views_band polarity, kept.
			axes: [
				["media", "empty_media", { "Glyph": "", "Marked": "marked", "None": "none" }],
				["action", "empty_action", { "Plain": "", "Primary": "primary" }],
			],
			check: null,
		},
		skeleton: {
			attr: "skeleton", boot: "bnd_skeleton",
			// Still is the full bone treatment with NO motion — and it is exactly
			// what Pulse and Sweep render under prefers-reduced-motion, so the
			// option previews that state instead of hiding it.
			anchor: ["skeleton_style", { "Original": "", "Still": "still", "Pulse": "pulse", "Sweep": "sweep" }],
			axes: [],
			check: null,
		},
		// Item 31. Every pole and neutral is argued in presets.FILTERS_DEFAULTS,
		// and the boundary with item 28 in _filters.scss's header — deliberately
		// NOT restated here: this bundle ships to every desk load, and the same
		// fact in three places is the trap this repo names first.
		filters: {
			attr: "filters", boot: "bnd_filters",
			anchor: ["filters_style", { "Original": "", "Outlined": "outlined", "Trough": "trough", "Pill": "pill", "Ruled": "ruled" }],
			axes: [
				["applied", "filters_applied", { "Quiet": "", "Counted": "counted", "Accented": "accented" }],
				["saved", "filters_saved", { "Plain": "", "Listed": "listed" }],
			],
			check: null,
		},
	};

	for (const [kit, def] of Object.entries(BND_SURFACE_KITS)) {
		let state = (window.frappe && frappe.boot && frappe.boot[def.boot]) || null;
		bnd_kit_state[kit] = state;

		const apply = (v) => {
			const html = document.documentElement;
			const stem = "data-bnd-" + def.attr;
			for (const a of [...html.attributes]) {
				if (a.name === stem || a.name.startsWith(stem + "-")) html.removeAttribute(a.name);
			}
			if (!v) return;
			state = v;
			bnd_kit_state[kit] = v;
			const style = def.anchor[1][v[def.anchor[0]]];
			if (!style) return; // "" (Original) => pure clearing
			html.setAttribute(stem, style);
			for (const [suffix, field, slugs] of def.axes) {
				const slug = slugs[v[field]];
				if (slug) html.setAttribute(stem + "-" + suffix, slug);
			}
			if (def.check && parseInt(v[def.check[1]], 10)) html.setAttribute(stem + "-" + def.check[0], "");
		};

		apply(state);

		bunood[kit + "_apply"] = function (values) {
			if (!values) return;
			apply({ ...(state || {}), ...values });
			if (def.after) def.after();
		};
	}

	// ── Calendar event colours (item 27 slice 3) ────────────────────────────
	// A FullCalendar event's fill is an INLINE colour calendar.js computes in JS
	// (prepare_colors) — unreachable from CSS, exactly the frappe-charts problem
	// item 25 solved by wrapping the one funnel. We do the same: a DEFAULT event
	// (no category via get_css_class, no admin d.color — stock paints it "blue")
	// is re-hued to our --bnd-accent; a category or admin colour is KEPT (their
	// data). The mark axis reshapes the SAME hue — Chip fills it, Outlined draws
	// it as a border, Dot as a dot (the dot itself is CSS, in currentColor).
	// FALLS OPEN: no Calendar class, or a --bnd-accent that is not clean hex, and
	// we change nothing and the event renders exactly as stock.
	(function patch_calendar_colors() {
		const Cal = window.frappe && frappe.views && frappe.views.Calendar;
		if (!Cal || typeof Cal.prototype.prepare_colors !== "function") return;

		const live = new Set();
		const HEX6 = /^#[0-9a-f]{6}$/i;
		const token = (name) => {
			const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
			return HEX6.test(v) ? v : null;
		};
		const mark_slug = () => {
			const v = bnd_kit_state.views || (window.frappe && frappe.boot && frappe.boot.bnd_views) || {};
			return bnd_axis_slugs("views", "mark")[v.views_mark] || "";
		};

		const Native = Cal.prototype.prepare_colors;
		Cal.prototype.prepare_colors = function (d) {
			const r = Native.call(this, d);
			live.add(this); // register first, so a later switch-off-Original can repaint
			// TOTAL STAND-DOWN: under views_style Original the anchor is cleared, so
			// the kit must touch NOTHING — the SCSS stands down on the absent
			// attribute, and this JS must too, or the calendar keeps our colours
			// while every other view reverts (adversarial release review finding).
			// The anchor attribute is the active check the SCSS keys on.
			if (!document.documentElement.hasAttribute("data-bnd-views")) return r;
			const accent = token("--bnd-accent");
			if (!accent) return r; // fall open
			// Keep a category colour (get_css_class) or an admin's hex; re-hue only
			// the stock default. r.backgroundColor is the native hue either way.
			const kept =
				typeof this.get_css_class === "function" ||
				(d.color && frappe.ui.color && frappe.ui.color.validate_hex(d.color));
			const hue = kept ? r.backgroundColor : accent;
			const ink = token("--bnd-ink") || r.textColor;
			const mark = mark_slug();
			if (mark === "outlined") {
				// Transparent event, the hue as a BORDER (3:1 is enough for a
				// boundary), and INK text — not the hue: --bnd-accent is a 3:1
				// focus token, and a small event title needs 4.5:1 (review finding).
				r.backgroundColor = "transparent";
				r.borderColor = hue;
				r.textColor = ink;
			} else if (mark === "dot") {
				// Transparent event; textColor carries the hue so the CSS ::before
				// dot (currentColor) is the hue. The TITLE is re-inked to --bnd-ink
				// in the stylesheet, so only the non-text dot rides the 3:1 accent.
				r.backgroundColor = "transparent";
				r.borderColor = "transparent";
				r.textColor = hue;
			} else {
				// Chip: a wash of the hue (8-digit #RRGGBBAA when hue is hex), a
				// full-strength border, ink text.
				r.backgroundColor = HEX6.test(hue) ? hue + "26" : hue;
				r.borderColor = hue;
				r.textColor = ink;
			}
			return r;
		};

		bnd_repaint_calendars = function () {
			for (const cal of Array.from(live)) {
				const el = cal.$wrapper && cal.$wrapper.get(0);
				if (!cal.fullCalendar || !el || !el.isConnected) {
					live.delete(cal);
					continue;
				}
				// refetchEvents re-runs the event pipeline (and prepare_colors) and
				// re-renders in place — the calendar analogue of the chart draw().
				try {
					cal.fullCalendar.refetchEvents();
				} catch (e) {
					/* a vendor refetch throwing must not take the desk down */
				}
			}
		};

		// The ONE honest theme-flip signal (set_theme writes data-theme, no event),
		// coalesced per frame. frappe.ui.color_map is snapshotted once at bundle
		// parse, so a category/admin ramp lookup would stay light after a flip —
		// recompute it, then refetch so every event re-colours.
		if (typeof MutationObserver === "function" && document.documentElement) {
			let queued = false;
			new MutationObserver(function () {
				// Under Original the kit stands down — no recompute, no refetch, or
				// the calendar would differ from stock on a theme flip (not a total
				// stand-down). prepare_colors is gated the same way as a backstop.
				if (queued || !document.documentElement.hasAttribute("data-bnd-views")) return;
				queued = true;
				requestAnimationFrame(function () {
					queued = false;
					try {
						if (frappe.ui.color && frappe.ui.color.get_color_map) {
							frappe.ui.color_map = frappe.ui.color.get_color_map();
						}
					} catch (e) {
						/* keep the stale map rather than throw */
					}
					bnd_repaint_calendars();
				});
			}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		}
	})();

	const CRUMB_SLUGS = {

		style: { "Original": "", "Quiet Trail": "quiet", "Title Fusion": "fusion", "Eyebrow Title": "eyebrow", "Crumb Pills": "pills" },
		separator: { "Slash": "slash", "Chevron": "chevron", "Dot": "dot", "Arrow": "arrow" },
		icons: { "Off": "off", "First Crumb": "first", "Every Crumb": "every" },
		hover: { "Soft Pill": "pill", "Underline": "underline", "Darken": "darken" },
	};

	/**
	 * The crumb options currently IN EFFECT — boot's at load, possibly
	 * replaced by a live preview (bunood.crumb_apply). Mounts read THIS,
	 * never frappe.boot, so preview is a re-application, not a mode.
	 */
	let crumb_state = (window.frappe && frappe.boot && frappe.boot.bnd_crumbs) || null;

	/**
	 * Reflect a full set of crumb options onto <html>, clearing whatever set
	 * came before — attributes are wholly derived state. A falsy style slug
	 * (Original / unknown / no boot) clears everything and sets nothing:
	 * the whole kit stands down and the stock trail renders.
	 * @param {Object|null} c - the boot-shaped values object.
	 */
	function apply_crumb_attrs(c) {
		const html = document.documentElement;
		for (const a of [...html.attributes]) {
			if (a.name === "data-bnd-crumbs" || a.name.startsWith("data-bnd-crumb-")) {
				html.removeAttribute(a.name);
			}
		}
		if (!c) return;
		crumb_state = c;
		const style = CRUMB_SLUGS.style[c.style];
		if (!style) return;
		html.setAttribute("data-bnd-crumbs", style);
		const set = (name, value) => value && html.setAttribute("data-bnd-crumb-" + name, value);
		set("sep", CRUMB_SLUGS.separator[c.separator]);
		set("icons", CRUMB_SLUGS.icons[c.icons]);
		set("hover", CRUMB_SLUGS.hover[c.hover]);
		// Boolean flags: presence-only attributes, matched with [attr] in CSS.
		if (parseInt(c.copy_link, 10)) html.setAttribute("data-bnd-crumb-copy", "");
		if (parseInt(c.status_pill, 10)) html.setAttribute("data-bnd-crumb-pill", "");
		if (parseInt(c.narrow_collapse, 10)) html.setAttribute("data-bnd-crumb-collapse", "");
	}

	// Same timing rule as the sidebar: the matrix must know every choice
	// before Frappe renders the first trail.
	apply_crumb_attrs(crumb_state);

	/** True when the breadcrumb kit is active (style attribute is the anchor). */
	function crumb_active() {
		return document.documentElement.hasAttribute("data-bnd-crumbs");
	}

	// ── Small DOM helpers ───────────────────────────────────────────────────

	/**
	 * Create an element with a class list and optional attributes.
	 * @param {string} tag
	 * @param {string} cls - space-separated class names.
	 * @param {Object<string,string>} [attrs]
	 * @returns {HTMLElement}
	 */
	function el(tag, cls, attrs) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
		return node;
	}

	/**
	 * An <svg><use> pointing into Frappe's #all-symbols sprite. If the symbol
	 * id does not exist the box renders empty at the right size — alignment
	 * survives a missing icon, which is the failure mode we want.
	 * @param {string} symbol - e.g. "icon-home".
	 * @returns {SVGElement}
	 */
	function sprite_icon(symbol) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		// Frappe's icon class is load-bearing, not cosmetic, and the RIGHT class
		// depends on the symbol's FAMILY. The `icon-*` sets (timeless, lucide)
		// are STROKE drawings whose paths carry no fill, so `.icon` paints them
		// with `stroke: var(--icon-stroke); fill: transparent` — an unstyled
		// <svg> would fill them black. The `es-*` set is the OPPOSITE: those are
		// FILL drawings (a single fill-rule path, no stroke geometry), and
		// `.es-icon` inverts the polarity to `fill: var(--icon-stroke);
		// stroke-width: 0`. Stamping plain `.icon` on an es-* symbol traces a
		// 1.5px stroke around a hollow silhouette — the inbox "open in a new tab"
		// arrow (es-line-arrow-up-right) rendered exactly that way until here.
		// `frappe.utils.icon` chooses the class the same way; match its output.
		const cls =
			symbol && symbol.indexOf("es-") === 0
				? symbol.indexOf("es-solid-") === 0
					? "es-icon es-solid"
					: "es-icon es-line"
				: "icon";
		svg.setAttribute("class", cls);
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", "#" + symbol);
		svg.appendChild(use);
		return svg;
	}

	/**
	 * A workspace's sprite id, guarded. `ws.icon` is arbitrary per-site Workspace
	 * doctype data — an unbounded id set against a bounded sprite — so a wrong or
	 * unknown value must not paint an empty <use>: under the transparent chip
	 * styles that is an invisible 22px hole, not a graceful blank. Falls back to
	 * folder-normal, and to the raw id only when the sprite has not loaded yet
	 * (sb_existing_symbol needs it in the DOM), which is no worse than before.
	 * @param {string} [icon] - the bare workspace icon name, e.g. "stock".
	 * @returns {string} a sprite id that is safe to render.
	 */
	function ws_symbol(icon) {
		const want = "icon-" + (icon || "folder-normal");
		return sb_existing_symbol([want, "icon-folder-normal"]) || want;
	}

	/**
	 * Clone the icon out of a native control so our proxy button looks exactly
	 * like the thing it forwards to, whatever icon set this Frappe version
	 * ships. Falls back to a sprite id when the native node is gone.
	 * @param {string} native_selector - element whose <svg> to clone.
	 * @param {string} fallback_symbol - sprite id used when cloning fails.
	 * @returns {SVGElement}
	 */
	function cloned_icon(native_selector, fallback_symbol) {
		const src = document.querySelector(native_selector + " svg");
		return src ? src.cloneNode(true) : sprite_icon(fallback_symbol);
	}

	/**
	 * Forward a click to a hidden native control. Guarded: if the selector no
	 * longer matches (Frappe upgrade), the proxy is a silent no-op.
	 * @param {string} selector
	 */
	function proxy_click(selector) {
		const target = document.querySelector(selector);
		if (target) target.click();
	}

	/**
	 * Retry `fn` until it returns truthy or the attempts run out. The desk is
	 * built asynchronously and "when is the sidebar there?" has no event, so
	 * polling with a bounded budget is the honest primitive.
	 * @param {() => boolean} fn
	 * @param {number} [tries=40]
	 * @param {number} [interval=150] - milliseconds.
	 */
	function try_for(fn, tries = 40, interval = 150) {
		if (fn()) return;
		if (tries <= 0) return;
		setTimeout(() => try_for(fn, tries - 1, interval), interval);
	}

	// ── Sidebar width tracking ──────────────────────────────────────────────

	/**
	 * Keep --bnd-sidebar-live-w equal to the sidebar's real rendered width.
	 *
	 * The status bar and bottom bar are position:fixed and must start where
	 * the sidebar ends — but the sidebar is user-resizable (drag handle) and
	 * collapsible, so the width is a runtime fact, not a constant. A
	 * ResizeObserver is the exact tool: fires on drag, on collapse, and on the
	 * dock layout's display:none (width 0), with no polling.
	 */
	function observe_sidebar_width() {
		const sidebar = document.querySelector(".body-sidebar-container");
		const root = document.documentElement;
		if (!sidebar) {
			root.style.setProperty("--bnd-sidebar-live-w", "0px");
			return;
		}
		// The value is the sidebar's END-EDGE INSET, not its width: fixed
		// bottom bars start where the sidebar column truly ends, which width
		// alone misses whenever the apps rail or a floating margin shifts the
		// container (measured: the status bar rendered under both).
		const set = () => {
			const r = sidebar.getBoundingClientRect();
			let inset = 0;
			if (r.width > 0) {
				const rtl = (document.documentElement.getAttribute("dir") || document.dir) === "rtl";
				inset = Math.max(0, Math.round(rtl ? window.innerWidth - r.left : r.right));
			}
			root.style.setProperty("--bnd-sidebar-live-w", inset + "px");
		};
		set();
		if (typeof ResizeObserver !== "undefined") {
			new ResizeObserver(set).observe(sidebar);
		}
		window.addEventListener("resize", set);
	}

	// ── Numerals ────────────────────────────────────────────────────────────

	/**
	 * THE NUMERAL POLICY, IN ONE PLACE.
	 *
	 * Western digits everywhere, pinned rather than inferred. `GUIDELINES.md`
	 * §1.6 says to decide this once and §2.4 recorded it as undecided; this is
	 * the decision, and it is a constant so there can never be a second one.
	 *
	 * WHY PINNED AT ALL. `toLocaleTimeString` infers the numbering system from
	 * the locale, so an `ar` desk rendered ٠٩:٤٥ in the status bar while every
	 * number Frappe itself drew — list counts, grid rows, currency — stayed
	 * Western. The theme was the only thing on screen speaking a different
	 * numeral system, which reads as a bug rather than a localisation.
	 *
	 * WHY WESTERN AND NOT ARABIC-INDIC. The theme follows the platform instead
	 * of inventing a second policy: Frappe and ERPNext render `latn`, and ZATCA
	 * e-invoices carry `latn`. If that ever changes, THIS is the line to change,
	 * and the numeric font stack in `_tokens.scss` has to move with it — a
	 * Latin-led tabular stack loses its alignment the moment it is asked for
	 * Arabic-Indic glyphs it does not have.
	 */
	const BND_NUMERALS = "latn";

	// ── Bottom reserve tracking ─────────────────────────────────────────────

	/** Every piece of chrome this theme fixes to the viewport's bottom edge. */
	const BND_BOTTOM_CHROME = ".bnd-statusbar, .bnd-dock";

	/**
	 * Re-measure the bottom reserve on demand. Assigned by
	 * observe_bottom_reserve; a no-op until then, and a no-op forever if the
	 * desk never mounted — which is the correct reserve for a desk with no
	 * chrome on it.
	 */
	let sync_bottom_reserve = () => {};

	/**
	 * Re-measure on the next frame instead of right now.
	 *
	 * Measuring forces a synchronous layout, so calling it from inside an
	 * event handler makes every listener after ours pay for it — and on a
	 * route change those listeners are Frappe's own re-render. One frame of
	 * delay is imperceptible (the bar and the reserve both already exist;
	 * only the number changes) and keeps us off the critical path.
	 */
	function defer_bottom_reserve() {
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => sync_bottom_reserve());
		else setTimeout(() => sync_bottom_reserve(), 0);
	}

	/**
	 * Keep --bnd-bottom-reserve equal to how much of the viewport's bottom
	 * edge the fixed chrome actually covers. chrome/_layouts.scss subtracts it
	 * from .main-section's height, which is what stops page content from
	 * hiding behind the bar — see that file for why padding cannot do it.
	 *
	 * WHY MEASURED RATHER THAN A TOKEN PER LAYOUT
	 *   The reserve is not a property of the layout. Dock mounts a floating
	 *   pill AND a status bar, and the pill's rendered height (50px) is not
	 *   its --bnd-dock-h token (56px). The slim strip grows from 26px to 40px
	 *   when search is placed in it. Classic mounts a bar only if the user
	 *   opts in. Quick links can be moved into the bar and change its height.
	 *   A static matrix was written first and was wrong in three of those
	 *   states; one getBoundingClientRect is right in all of them.
	 *
	 * The observers are the whole point: a ResizeObserver catches a bar that
	 * changes height in place (search moving in, an option flip, a responsive
	 * collapse), and a childList MutationObserver on .main-section catches a
	 * bar being mounted, removed or rebuilt by a live preview. Between them
	 * there is no code path that has to remember to call this.
	 */
	function observe_bottom_reserve() {
		const root = document.documentElement;
		// BOTH mount points, and the pair is load-bearing: mount_statusbar
		// appends to .main-section while mount_dock appends to <body>.
		// Watching only .main-section made the Dock layout depend on the
		// status bar arriving to trigger the re-measure — so Dock with the
		// status bar switched Off reserved nothing and the dock sat on top of
		// the paging row. Measured in RTL at 430px before this line existed.
		const hosts = [document.querySelector(".main-section"), document.body].filter(Boolean);
		if (!hosts.length) return;

		const observed = typeof ResizeObserver === "undefined" ? null : new WeakSet();
		const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => sync());
		let last = null;

		const sync = () => {
			let reserve = 0;
			for (const bar of document.querySelectorAll(BND_BOTTOM_CHROME)) {
				if (ro && !observed.has(bar)) {
					observed.add(bar);
					ro.observe(bar);
				}
				// A display:none bar measures 0x0, which is the right answer:
				// the Desktop page stands all chrome down and must reserve
				// nothing. So no visibility check is needed here.
				const r = bar.getBoundingClientRect();
				if (r.height <= 0) continue;
				// Distance from the viewport's BOTTOM EDGE to the top of the
				// bar — not the bar's height. The dock floats clear of the
				// edge, so its height alone would under-reserve by the gap.
				reserve = Math.max(reserve, Math.ceil(window.innerHeight - r.top));
			}
			reserve = Math.max(0, reserve);
			if (reserve === last) return;
			last = reserve;
			root.style.setProperty("--bnd-bottom-reserve", reserve + "px");
			relayout_list();
		};

		sync_bottom_reserve = sync;
		sync();
		if (typeof MutationObserver !== "undefined") {
			// Direct children only. Watching the subtree would fire on every
			// list render, and the bars are always appended as direct children
			// of one of these two hosts.
			const mo = new MutationObserver(sync);
			for (const host of hosts) mo.observe(host, { childList: true });
		}
		window.addEventListener("resize", sync);
	}

	/**
	 * Ask the list view to re-measure after the reserve changes.
	 *
	 * Frappe recomputes the result height only on window resize
	 * (base_list.js:433) and on refresh. Shrinking .main-section from CSS
	 * fires neither, so without this the list keeps the height it computed
	 * against the taller box until the next navigation. Best-effort by
	 * design: a renamed internal must cost us a relayout, never the bar.
	 */
	function relayout_list() {
		try {
			const list = window.cur_list;
			if (list && typeof list.set_result_height === "function") list.set_result_height();
		} catch (e) {
			/* a stale list object must never take the chrome down */
		}
	}

	/**
	 * Route "" is v16's Desktop page, which ships its own navbar and search
	 * and hides the normal sidebar — every piece of Bunood chrome stands down
	 * there via the data-bnd-desktop attribute (chrome/_sidebar.scss).
	 */
	function update_desktop_mode() {
		const route = frappe.get_route ? frappe.get_route() || [] : [];
		const on_desktop = !route.length || (route.length === 1 && !route[0]);
		document.documentElement.toggleAttribute("data-bnd-desktop", on_desktop);
	}

	// ── The theme's dropdown menu ───────────────────────────────────────────

	/** The one open .bnd-menu, so opening another closes it first. */
	let open_menu = null;

	/**
	 * Mark a trigger as ABLE to open a menu — knowable at build time, unlike
	 * whether one is open right now. Call once, when the trigger is built.
	 * `aria-expanded` is deliberately NOT set here: that is a fact about
	 * CURRENT state, and show_menu()/close_menu() are the one choke point
	 * every open and close already passes through, so it stays there.
	 */
	function menu_trigger(btn) {
		btn.setAttribute("aria-haspopup", "menu");
		btn.setAttribute("aria-expanded", "false");
	}

	/**
	 * Close the open menu, if any. Safe to call always. Restores focus to
	 * the trigger ONLY when focus is currently inside the menu — the
	 * outside-pointerdown closer below fires for clicks that were never
	 * IN the menu at all, and yanking focus from wherever the user
	 * actually is would be its own defect.
	 */
	function close_menu() {
		if (!open_menu) return;
		const trigger = open_menu._trigger;
		const had_focus = open_menu.contains(document.activeElement);
		if (trigger && trigger.setAttribute) trigger.setAttribute("aria-expanded", "false");
		open_menu.remove();
		open_menu = null;
		if (had_focus && trigger && trigger.focus) trigger.focus();
	}

	// One set of global closers for every menu instance. The menu's OWN
	// keydown listener (below) consumes Escape and Tab before either of
	// these — or Frappe's own document-level Escape handling — ever sees
	// them: letting two handlers react to the same Escape is what blurred a
	// just-placed focus restore once already, for the palette and inbox
	// (e2a4926). This pointerdown closer has no such conflict; it stays global
	// because nothing inside the menu needs to see an outside click.
	document.addEventListener("pointerdown", (e) => {
		if (open_menu && !open_menu.contains(e.target)) close_menu();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close_menu();
	});

	/** The menu's own focusable items, in DOM order. */
	function menu_items(menu) {
		return [...menu.querySelectorAll(".bnd-menu-item")];
	}

	/**
	 * Open a .bnd-menu anchored to a trigger button.
	 *
	 * FOCUS CONTRACT: opening moves focus to the first item. ArrowDown/
	 * ArrowUp move among items with wrap, Home/End jump to the ends. Escape
	 * closes, restores focus, and is consumed on the way — see the listener
	 * below. Tab closes too, but is deliberately NOT prevented: this is a
	 * POPUP, not a modal (the palette traps Tab on purpose; this is the
	 * opposite choice for the opposite kind of surface) — closing and
	 * refocusing the trigger synchronously, before the browser's own Tab
	 * handling runs, means the default action continues from THAT element,
	 * landing exactly where Tab/Shift+Tab would if the menu had never
	 * opened. Verified with a standalone probe before writing this: a
	 * keydown handler that mutates focus and removes the focused element
	 * without preventDefault is still followed by the browser's default
	 * action, computed against the NEW activeElement, in both directions.
	 * Every item carries tabindex="-1": this is a transient, body-appended
	 * surface, and nothing about it belongs in the page's own tab order.
	 *
	 * CONTENT MODEL: the popup surface (.bnd-menu) carries no role of its
	 * own. role="menu" belongs to ITS OWN child, .bnd-menu-list, because
	 * ARIA's menu role only permits menuitem/separator/group children — the
	 * identity header is neither, so it is the LIST's sibling, not its
	 * child. (aria-required-children is wcag2a and was already firing on
	 * the settings-form baseline before this; a header inside role="menu"
	 * would have tripped it here too the moment this surface joined a scan.)
	 *
	 * Positioning is computed from viewport rects in PHYSICAL coordinates
	 * (rects are physical by nature, so this is RTL-correct without any dir
	 * checks): the menu's near edge aligns with the trigger's near edge, and
	 * it opens upward when the trigger sits in the lower half of the window.
	 *
	 * @param {HTMLElement} trigger - the button the menu hangs off. Should
	 *   already carry aria-haspopup via menu_trigger() at build time.
	 * @param {Array<Object|"divider">} items - "divider" or
	 *   {label, icon?, run?, danger?, header?} where header items render the
	 *   identity block instead of a button.
	 */
	function show_menu(trigger, items) {
		if (open_menu && open_menu._trigger === trigger) {
			close_menu(); // second click on the same trigger toggles
			return;
		}
		close_menu();

		// tabindex=0: the menu scrolls, so it must be tab-reachable. _cluster.scss.
		const menu = el("div", "bnd-menu", { tabindex: "0" });
		menu._trigger = trigger;
		if (trigger && trigger.setAttribute) trigger.setAttribute("aria-expanded", "true");

		const list = el("div", "bnd-menu-list", { role: "menu" });

		for (const item of items) {
			if (item === "divider") {
				list.appendChild(el("div", "bnd-menu-divider", { role: "separator" }));
				continue;
			}
			// The identity header moved into the account panel (8c) — no caller
			// passes `header` any more, and the panel labels itself by the name.
			const btn = el("button", "bnd-menu-item" + (item.danger ? " bnd-danger" : ""), {
				type: "button",
				role: "menuitem",
				tabindex: "-1",
			});
			if (item.icon) btn.appendChild(sprite_icon(item.icon));
			btn.appendChild(document.createTextNode(item.label));
			btn.addEventListener("click", () => {
				close_menu();
				try {
					item.run && item.run();
				} catch (e) {
					console.error("bunood_theme menu action failed", e); // eslint-disable-line no-console
				}
			});
			list.appendChild(btn);
		}

		menu.appendChild(list);

		menu.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation(); // see the FOCUS CONTRACT note above
				close_menu();
				return;
			}
			if (e.key === "Tab") {
				close_menu(); // NOT prevented — see the FOCUS CONTRACT note above
				return;
			}
			const nodes = menu_items(menu);
			if (!nodes.length) return;
			const at = nodes.indexOf(document.activeElement);
			let next = -1;
			if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % nodes.length;
			else if (e.key === "ArrowUp") next = at < 0 ? nodes.length - 1 : (at - 1 + nodes.length) % nodes.length;
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = nodes.length - 1;
			if (next !== -1) {
				e.preventDefault();
				nodes[next].focus();
			}
		});

		document.body.appendChild(menu);
		open_menu = menu;

		// Measure, then place. Kept physical on purpose — see the docstring.
		const r = trigger.getBoundingClientRect();
		const mw = menu.offsetWidth;
		const mh = menu.offsetHeight;
		// DOES IT FIT — never "is the trigger below mid-screen" (defect 22:
		// an eleven-item menu from a trigger just above the midpoint opened
		// downward and overflowed the bottom edge).
		const opens_up = r.bottom + mh + 6 > window.innerHeight;
		let left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
		menu.style.left = left + "px";
		menu.style.top = opens_up ? Math.max(8, r.top - mh - 6) + "px" : r.bottom + 6 + "px";

		const first = menu_items(menu)[0];
		if (first) first.focus();
	}

	// The placement board (theme_settings.js, item 22) is the first caller
	// outside this file — its chip-level "Move to…" control opens the SAME
	// menu with the SAME focus contract rather than growing a second one.
	bunood.menu = show_menu;
	bunood.menu_trigger = menu_trigger;

	// ── The avatar menu ─────────────────────────────────────────────────────

	/**
	 * The personal menu: identity header + the items that used to hide in the
	 * logo menu (the "brand menu = where, avatar menu = who" split the user
	 * picked). Every action is a public Frappe API — nothing here owns any
	 * behaviour. The matching brand-menu items are hidden by CSS
	 * (chrome/_layouts.scss) in the layouts that mount this.
	 *
	 * @returns {Array} items for show_menu().
	 */
	function avatar_menu_items() {
		const items = [];

		// Place-switching that has no other home now that the old brand menu
		// is retired: Website for everyone, Desktop where the sidebar is gone.
		// Asks the DOM, not the layout: this item exists because the side pane
		// — which normally carries the Desktop route — is not reachable. Since
		// the container split that is a question about the PANE, not about
		// which layout is active, and the menu is built on click so the honest
		// answer is available by then.
		if (sidebar_is_hidden()) {
			items.push({ label: __("Desktop"), icon: "icon-home", run: () => frappe.set_route("") });
		}
		items.push({
			label: __("Website"),
			icon: "icon-web",
			run: () => frappe.ui.toolbar.view_website(),
		});
		items.push("divider");

		// ONE ENTRY, NOT THREE (item 38). This used to be "Appearance" (Frappe's
		// own theme modal), "Sidebar Style" (a menu that applied the side pane
		// only) and "Toggle Density" (a three-state cycle with a toast) — three
		// mechanisms for one question. `bunood.appearance` is that question's
		// single answer, and it still reaches Frappe's field for light/dark
		// through the endpoint Frappe's own switcher calls.
		items.push({
			label: __("Appearance"),
			icon: "icon-monitor",
			run: () => bunood.appearance(),
		});
		// Theme Settings is site-wide admin config, so the shortcut only shows
		// for users who can actually open it — everyone else would get a
		// permission error page, which is worse than no entry.
		if (frappe.user_roles && frappe.user_roles.includes("System Manager")) {
			items.push({
				label: __("Theme Settings"),
				icon: "icon-setting-gear",
				run: () => frappe.set_route("theme-settings"),
			});
		}
		items.push({
			label: __("Session Defaults"),
			icon: "icon-sliders-horizontal",
			run: () => frappe.ui.toolbar.setup_session_defaults(),
		});
		items.push({
			label: __("Toggle Full Width"),
			icon: "icon-expand",
			run: () => frappe.ui.toolbar.toggle_full_width(),
		});
		items.push("divider");
		// The trailing hints the vendor shows and item 40's audit called an
		// information regression to drop. Unit strings, not sentences.
		items.push({
			label: __("Keyboard Shortcuts"),
			icon: "icon-keyboard",
			kbd: "Shift+/",
			run: () => frappe.ui.toolbar.show_shortcuts(),
		});
		items.push({
			label: __("Reload"),
			icon: "icon-rotate-ccw",
			kbd: "Shift+Ctrl+R",
			run: () => frappe.ui.toolbar.clear_cache(),
		});
		items.push("divider");
		items.push({
			label: __("My Profile"),
			icon: "icon-user",
			run: () => frappe.ui.toolbar.route_to_user(),
		});
		items.push({
			label: __("Log Out"),
			icon: "icon-log-out",
			danger: true,
			run: () => frappe.app.logout(),
		});
		return items;
	}

	// ── The global cluster (search? + bell + avatar) ────────────────────────

	/**
	 * Build the [search] [bell] [avatar] group every non-classic layout
	 * mounts somewhere. Search and bell are proxies to the hidden native
	 * controls (icons cloned from them for pixel fidelity); the avatar is
	 * ours and opens the personal menu.
	 *
	 * @param {Object} opts
	 * @param {"field"|"icon"|"none"} opts.search - how search appears here.
	 * @returns {HTMLElement}
	 */
	// ════════════════════════════════════════════════════════════════════════
	// Host registry — where a region actually is, right now
	// ════════════════════════════════════════════════════════════════════════
	//
	// One table answering "does this region exist in the live DOM, and what
	// node do I put things in". Every tenant resolves through it, so adding a
	// component becomes a placement field plus a row here — not a new branch
	// in the mount ladder, a new selector in the Desktop stand-down list, and
	// a new rule per layout.
	//
	// It reports the DOM, never the settings. A region backed by a hidden
	// container is ABSENT, because a tenant placed there would be invisible:
	// Dock leaves .body-sidebar in the document and hides its container, which
	// is how search once resolved into display:none and disappeared.
	const HOSTS = {
		topbar: () => document.querySelector(".bnd-topbar .bnd-cluster") || document.querySelector(".bnd-topbar"),
		bottombar: () =>
			document.querySelector(".bnd-statusbar .bnd-cluster") || document.querySelector(".bnd-statusbar"),
		// SCOPED TO THE PAGE BEING LOOKED AT. `document.querySelector` returns
		// the FIRST page head in the document, and Frappe caches every page it
		// has instantiated — so on a route change that is usually the page you
		// just left. The tenant was being built into the outgoing page's
		// cluster, where nobody could see it, and the incoming page stayed
		// empty. Measured 2026-08-07: the Compact badge stopped painting after
		// any navigation.
		pagehead: () => {
			const page = (window.frappe && frappe.container && frappe.container.page) || document;
			return page.querySelector(".page-head .bnd-cluster");
		},
		dock: () => document.querySelector(".bnd-dock .bnd-cluster"),
		sidepane: () => (sidebar_is_hidden() ? null : document.querySelector(".body-sidebar")),
	};

	/**
	 * The node a tenant goes in, for a region AND a zone within it.
	 *
	 * The region answer is still the DOM's — a region backed by a hidden
	 * container is absent, because a tenant placed there would be invisible.
	 * The zone is then a child of it, so "Top Bar End" resolves to one element
	 * and cannot be confused with "Top Bar Start".
	 *
	 * The side pane is the exception: its zones are Frappe's own rows, not a
	 * cluster we built, so it returns the pane itself and the caller places by
	 * `order` (see sb_zone_style). Wrapping the pane's contents in three divs
	 * would be redrawing Frappe's DOM, which this theme does not do.
	 */
	function host_for(region, zone) {
		const get = HOSTS[region];
		if (!get) return null;
		try {
			const host = get() || null;
			if (!host || region === "sidepane") return host;
			return zone ? zone_in(host, zone) : host;
		} catch (e) {
			return null;
		}
	}

	/** Theme Settings region label -> region key. */
	const PLACEMENT_REGIONS = {
		"Top Bar": "topbar",
		"Bottom Bar": "bottombar",
		"Page Header": "pagehead",
		"Side Pane": "sidepane",
		Dock: "dock",
	};

	/**
	 * "Top Bar End" -> { region: "topbar", zone: "end" }.
	 *
	 * The mirror of `registry.parse_slot`, which is the same split in Python.
	 * Two implementations of one rule is normally this codebase's cardinal sin;
	 * here the alternative is shipping the table through boot on every desk
	 * load to save a `startsWith`, and the rule is "the label is the region
	 * name, a space, and one of three words" — small enough that the smoke
	 * suite's vocabulary test pins both ends against `slots_for`.
	 *
	 * An unknown label yields no region, which every caller reads as "absent"
	 * and therefore LEAVES WHAT IS THERE. That is the fail-open a site holding
	 * a pre-migration value depends on.
	 */
	function parse_slot(label) {
		if (!label || label === "Off") return { region: "", zone: "" };
		for (const [name, region] of Object.entries(PLACEMENT_REGIONS)) {
			if (label === name) return { region, zone: "end" }; // legacy, pre-E1
			if (label.startsWith(name + " ")) {
				const zone = label.slice(name.length + 1).toLowerCase();
				return { region, zone: ZONES.includes(zone) ? zone : "end" };
			}
		}
		return { region: "", zone: "" };
	}

	/** Boot's placement choices, replaced by live preview. */
	let placement_state = (window.frappe && frappe.boot && frappe.boot.bnd_placement) || null;

	/**
	 * Resolve a tenant's placement. THREE outcomes, not two, and conflating
	 * the last two is a bug I wrote and caught here:
	 *
	 *   "off"     the admin asked for it to be gone. Remove ours; the native
	 *             comes back because we stop claiming the token.
	 *   "absent"  the admin asked for a region this layout does not have —
	 *             the shipped default is Top Bar, and a Bottom Bar site has no
	 *             top bar. LEAVE WHATEVER IS THERE. Removing it would delete
	 *             the bell from every Bottom Bar desk on upgrade, which is the
	 *             exact failure this whole rework exists to stop.
	 *   <region>  place it there.
	 *
	 * Unlike search, these two do NOT walk a fallback chain. They have native
	 * ERPNext equivalents, so "nowhere of ours" is a fine answer — and moving
	 * a control the admin deliberately placed to somewhere they did not ask
	 * for is worse than leaving it where the layout put it.
	 */
	/**
	 * A tenant's active placement label — the narrow override while a phone-width
	 * viewport is showing, the stored choice otherwise. Search is deliberately
	 * NOT in `narrow_placement`: it walks a fallback chain, so tearing down the
	 * top bar drops it into the bottom bar on its own (SEARCH_FALLBACKS). The
	 * tenants that do NOT walk a chain — bell, user, apps — are the ones the
	 * narrow preset has to place explicitly, or they resolve to "absent".
	 */
	function active_placement(tenant) {
		if (is_narrow() && narrow_placement && narrow_placement[tenant]) {
			// Gated by the user's phone-bar toggle: a tenant switched off stands
			// down. Search is never in mobile_state, so it is never gated here —
			// it is the only search on a phone and always present.
			if (mobile_state && tenant in mobile_state && !mobile_state[tenant]) return "Off";
			return narrow_placement[tenant];
		}
		return (placement_state && placement_state[tenant]) || "";
	}

	function placement_for(tenant) {
		const label = active_placement(tenant);
		if (label === "Off") return "off";
		const { region, zone } = parse_slot(label);
		if (!region) return "absent";
		return host_for(region, zone) ? region : "absent";
	}

	/** The zone a tenant asked for, for the region it resolved to. */
	function zone_for(tenant) {
		return parse_slot(active_placement(tenant)).zone || "end";
	}

	/**
	 * Append a cluster to a host and CLAIM the affordances it carries.
	 *
	 * The claim happens here rather than in build_cluster because a cluster
	 * that was built but never appended owns nothing — and hiding Frappe's
	 * bell on the strength of a node that is not in the document is precisely
	 * the failure this inversion exists to remove.
	 */
	/**
	 * Reserve an empty cluster slot in a container.
	 *
	 * A CONTAINER MOUNTS FURNITURE, NEVER TENANTS. Each container used to build
	 * its own bell and avatar (`mount_cluster`), which was safe while exactly
	 * one container mounted per layout — the layout decided, so there was only
	 * ever one. Containers became independent in slice 2c and several can be on
	 * at once, and then asking for the bell in the top bar produced THREE
	 * bells: top bar, page head and dock, each built by its own container,
	 * with `inbox_placement` overruled by all of them. Measured 2026-08-07.
	 *
	 * So the container contributes a place and nothing else.
	 * `mount_placed_tenants` is the single thing that puts a tenant anywhere,
	 * which is what makes "exactly one, where you asked" true by construction
	 * rather than by everyone remembering.
	 */
	/** Where inside a container a tenant sits. Logical: start/end mirror in RTL. */
	const ZONES = ["start", "center", "end"];

	function reserve_cluster(host) {
		if (!host) return null;
		// THE HOST MAY BE THE CLUSTER. Several host lookups return
		// `.bnd-topbar .bnd-cluster` when one exists and the bar itself
		// otherwise — a shape that predates zones and was harmless while a
		// cluster was only a box to append to. Searching blindly from here
		// nested a SECOND cluster inside the first, so the bar carried two
		// "end" zones: the tenants went into one, and every measurement of the
		// trailing edge found the other, which was empty and earlier in the
		// DOM. Measured 2026-08-08 — clusters=2, endZones=2, bell@end, and the
		// zone the assertion read holding nothing.
		let cluster = host.classList.contains("bnd-cluster")
			? host
			: host.querySelector(".bnd-cluster");
		if (!cluster) {
			cluster = el("div", "bnd-cluster");
			host.appendChild(cluster);
		}
		// Three zones inside it, always, in document order. Always rather than
		// on demand because their ORDER is what start/centre/end means — created
		// lazily, the first tenant to arrive would define the sequence and
		// "start" could end up after "end".
		for (const zone of ZONES) {
			if (!cluster.querySelector(`.bnd-zone[data-zone="${zone}"]`)) {
				cluster.appendChild(el("div", "bnd-zone", { "data-zone": zone }));
			}
		}
		return cluster;
	}

	/** The zone element inside a container, creating the cluster if needed. */
	function zone_in(host, zone) {
		const cluster = reserve_cluster(host);
		if (!cluster) return null;
		return cluster.querySelector(`.bnd-zone[data-zone="${ZONES.includes(zone) ? zone : "end"}"]`);
	}

	// `mount_cluster` and `build_cluster` were deleted here on 2026-08-07,
	// grepped to zero callers first. They built a bell and an avatar into
	// whichever container asked, which is precisely the duplication above.

	/**
	 * Is the stock affordance this tenant replaces actually usable right now?
	 *
	 * Present in the DOM is not enough. The Dock layout hides the whole
	 * `.body-sidebar-container` with `display: none !important` keyed on the
	 * LAYOUT (_layouts.scss) — Frappe writes an inline `display: block` there,
	 * which is one of this codebase's two sanctioned uses of !important. So the
	 * native bell and user button still exist, still match a selector, and
	 * cannot be clicked by anyone.
	 *
	 * `offsetParent` is null for an element inside a `display: none` ancestor,
	 * which is exactly the question being asked and is cheaper than walking up
	 * through getComputedStyle.
	 */
	function native_pane_usable() {
		// Ask about the CONTAINER, not the affordance inside it. This runs from
		// mount_chrome, before Frappe has painted the sidebar's contents — so
		// testing the bell or the user button answers "not there yet" and the
		// guard below misfires, refusing Off in every layout. The container is
		// part of the desk skeleton and exists by then, and it is exactly what
		// the layout rule targets (_layouts.scss sets `display: none !important`
		// on it for Dock, beating Frappe's inline `display: block`).
		const pane = document.querySelector(".body-sidebar-container");
		return !!(pane && getComputedStyle(pane).display !== "none");
	}

/**
 * Put a node at a zone of the SIDE PANE, by DOM position.
 *
 * TWO ZONES, NOT THREE. The pane is the one region that does not get a centre,
 * and `registry.ZONES_BY_REGION` is where that is declared — this function is
 * only where it is carried out. The reason is measured, not stylistic: the
 * pane's content FILLS the column, so "after the workspace list" and "the foot
 * of the pane" are the same position, because the list is the last thing in it.
 * Three attempts said so — CSS `order` with auto margins put start, centre and
 * end on an identical y; inserting the end before Frappe's pinned bottom strip
 * put it ABOVE the centre; inserting it at the true last child matched the
 * centre exactly. A third choice that lands where the second one does is the
 * "two options, one pixel" defect this vocabulary exists to delete, and the
 * pane already had it — search's old Sidebar Top and Sidebar Bottom both
 * measured y 228 for months.
 *
 *   start   after the pane's header, above the workspaces
 *   end     the foot of the pane, below the workspace list
 *
 * Position, not `order`, is what decides here — see the measurement above.
 * Falls back outward at every step: a pane missing its header or its bottom
 * strip still gets the node, at the nearest honest place, rather than not at
 * all.
 */
/** The account band (8c): one toolbar shell at the foot. _sidebar.scss. */
function sb_band(pane) {
	let band = pane.querySelector(".bnd-sb-band");
	if (!band) {
		band = el("div", "bnd-sb-band", {
			role: "toolbar",
			"aria-label": __("Quick actions"),
			"data-bnd-zone": "end",
		});
		// Through the anchor: no part, so the cell branch passes it by.
		sb_zone_anchor(pane, "end", band);
	}
	return band;
}

function sb_band_prune() {
	for (const band of document.querySelectorAll(".bnd-sb-band")) {
		if (!band.childElementCount) band.remove();
	}
}

function sb_zone_anchor(pane, zone, node) {
	// Our end tenants become band cells.
	if (zone === "end" && node.getAttribute) {
		const part = node.getAttribute("data-bnd-part");
		if (part === "bell" || part === "user" || part === "home" || part === "apps") {
			return sb_band(pane).appendChild(node);
		}
	}
	const bottom = pane.querySelector(".body-sidebar-bottom");

	if (zone === "start") {
		// Between the brand row and the place row, whichever mounted first.
		const head = pane.querySelector(":scope > .bnd-sb-head") || pane.querySelector(":scope > .body-sidebar-top");
		if (head) return head.insertAdjacentElement("beforebegin", node);
		const top = pane.querySelector(":scope > .bnd-sb-brand") || pane.querySelector(":scope > .sidebar-header");
		if (top) return top.insertAdjacentElement("afterend", node);
		return pane.insertBefore(node, pane.firstChild);
	}
	// No "center" branch: the pane has two zones, because a third could not be
	// made to differ from the second (see registry.ZONES_BY_REGION). A value
	// from a site that stored one before this settled falls through to the foot,
	// which is where it rendered anyway.
	// "end" = the foot: before `.body-sidebar-bottom` when it is the last
	// IN-FLOW child. "Last CHILD" was permanently false — the collapse link
	// and handle trail it, both absolute (defect 20; band 8 vs bottom 5).
	if (bottom) {
		let lastInFlow = null;
		for (const kid of pane.children) {
			const cs = getComputedStyle(kid);
			if (cs.position === "absolute" || cs.position === "fixed") continue;
			lastInFlow = kid;
		}
		if (lastInFlow === bottom) {
			return bottom.insertAdjacentElement("beforebegin", node);
		}
	}
	return pane.appendChild(node);
}

	/**
	 * Tell the stylesheet where the BELL really is.
	 *
	 * The notifications panel used to be pinned by four rules keyed on the
	 * LAYOUT — the last "the layout decides" left in the sheet, named in
	 * _layouts.scss since slice 2c and finally retired here. `inbox_placement`
	 * is the thing that knows, so a Top Bar desk with the bell in the side pane
	 * pinned the panel under the top bar, nowhere near it; a top bar on a Dock
	 * desk matched two of the rules at once and source order picked the dock.
	 *
	 * A stamp, not a declaration: written from where the mount LANDED, after it
	 * landed, exactly like `data-bnd-own` — and removed when the bell is off or
	 * native, which hands the panel back to Frappe's own anchoring beside the
	 * sidebar.
	 */
	function stamp_bell_region(region) {
		if (region) document.documentElement.setAttribute("data-bnd-bell", region);
		else document.documentElement.removeAttribute("data-bnd-bell");
	}

	/** The region a mounted node is ACTUALLY in, measured from its ancestry. */
	function region_of_node(node) {
		if (!node) return "";
		if (node.closest(".bnd-topbar")) return "topbar";
		if (node.closest(".bnd-statusbar")) return "bottombar";
		if (node.closest(".bnd-dock")) return "dock";
		if (node.closest(".page-head")) return "pagehead";
		if (node.closest(".body-sidebar")) return "sidepane";
		return "";
	}

	/**
	 * ORDER WITHIN A ZONE (E3). Two tenants sharing a zone used to sit in
	 * mount-array order — the bell always led the user menu, and nothing a
	 * user did could change it. `desk_order` is the chosen order (tenant
	 * keys, comma-joined, written by the placement board); this pass sorts
	 * each zone's tenants by it.
	 *
	 * A DOM SORT, NOT A MOUNT RULE. Mounts stay independent and idempotent —
	 * teaching each mount path to insert at a rank would put the order in
	 * four places. Sorting afterwards puts it in one, and appendChild MOVES
	 * a node, so listeners survive and running twice is a no-op.
	 *
	 * Tolerant by construction: a key missing from the stored order ranks at
	 * its default position, an unknown token is ignored, and the quick-links
	 * wrap (one node carrying home AND apps) ranks by its best member — so a
	 * half-written or stale order degrades to the shipped one, never to an
	 * error. No migration needed for exactly this reason.
	 */
	const DESK_ORDER_DEFAULT = ["search", "inbox", "user", "home", "apps"];
	const PART_TO_KEY = { search: "search", bell: "inbox", user: "user", home: "home", apps: "apps" };

	function desk_order_rank() {
		const stored = String((placement_state && placement_state.order) || "")
			.split(",")
			.map((t) => t.trim())
			.filter((t) => DESK_ORDER_DEFAULT.indexOf(t) !== -1);
		const order = stored.concat(DESK_ORDER_DEFAULT.filter((t) => stored.indexOf(t) === -1));
		const rank = {};
		order.forEach((t, i) => { rank[t] = i; });
		return rank;
	}

	/** The order key a mounted node answers to, or null for foreign nodes. */
	function node_order_key(node, rank) {
		const part = node.getAttribute && node.getAttribute("data-bnd-part");
		if (part && part in PART_TO_KEY) return rank[PART_TO_KEY[part]];
		if (node.classList && node.classList.contains("bnd-sb-utils")) {
			// The wrap is one node carrying up to two tenants; it sits where
			// its best-ranked member would.
			const ranks = [...node.querySelectorAll("[data-bnd-part]")]
				.map((n) => PART_TO_KEY[n.getAttribute("data-bnd-part")])
				.filter((k) => k)
				.map((k) => rank[k]);
			return ranks.length ? Math.min(...ranks) : null;
		}
		if (node.classList && (node.classList.contains("bnd-search-field") || node.classList.contains("bnd-search-icon"))) {
			return rank.search;
		}
		return null;
	}

	/** Re-order one group of sibling nodes in place, leaving strangers alone. */
	function sort_siblings(nodes, rank) {
		const ours = nodes.filter((n) => node_order_key(n, rank) !== null);
		if (ours.length < 2) return;
		const sorted = [...ours].sort((a, b) => node_order_key(a, rank) - node_order_key(b, rank));
		if (ours.every((n, i) => n === sorted[i])) return;
		// An anchor comment marks the group's start; each node re-inserts
		// before it in sorted order. Insertion is the only mutation, so a
		// stranger between two of ours keeps its own position relative to
		// the group's start.
		const anchor = document.createComment("bnd-order");
		ours[0].before(anchor);
		for (const n of sorted) anchor.before(n);
		anchor.remove();
	}

	function enforce_desk_order() {
		const rank = desk_order_rank();
		// Cluster zones: every bar's start/center/end.
		for (const zone of document.querySelectorAll(".bnd-zone")) {
			sort_siblings([...zone.children], rank);
		}
		// Pane zones: our direct children of the side pane, grouped by the
		// zone they were anchored to. Sorted within the group only — the
		// pane's own rows are never touched.
		const pane = document.querySelector(".body-sidebar");
		if (pane) {
			for (const zone of ["start", "end"]) {
				sort_siblings(
					[...pane.children].filter((n) => n.getAttribute && n.getAttribute("data-bnd-zone") === zone),
					rank
				);
			}
		}
	}

	function mount_placed_tenants() {
		if (!placement_state) return;
		// `native` mirrors registry.py, which is the table that says what each
		// tenant replaces. Both of these are marked `critical` there: losing
		// every route to the user menu means no log out, no theme switch and no
		// session defaults.
		for (const [tenant, token, cls, build] of [
			["inbox", "bell", "bnd-bell", build_bell],
			["user", "user", "bnd-avatar-btn", build_user],
		]) {
			const region = placement_for(tenant);
			// The panel stamp follows the OUTCOME of every branch below: only a
			// mount that actually happened stamps its region, and every other
			// exit clears — off, absent, and a host that is not there. Stamping
			// from the SETTING instead would be the same guess the stamp
			// replaces, one table to the left.
			const stamp = (r) => tenant === "inbox" && stamp_bell_region(r);
			// ALL of them, not the first. This was `querySelector`, which was
			// correct while exactly one container mounted per layout and became
			// wrong the moment containers turned independent: three containers
			// each built a bell, this saw one, and `inbox_placement` was
			// overruled by whichever two it could not see. Measured 2026-08-07:
			// "Top Bar" produced bells in the top bar, the page head AND the
			// dock. Containers reserve an empty slot now (`reserve_cluster`) and
			// this function is the only thing that puts a tenant anywhere — so
			// "exactly one, where you asked" is a property of the construction.
			// PAGES ARE CACHED IN THE DOM, so "one in the document" is the wrong
			// unit for the page header: every page Frappe has instantiated keeps
			// its own head, and the tenant has to exist in the head of the page
			// being LOOKED AT. Counting the whole document made the first cut of
			// this see the outgoing page's bell, decide one already existed, and
			// never build one for the incoming page — the Compact badge stopped
			// painting after any navigation.
			//
			// So a node inside some OTHER page's head is not a duplicate; it is
			// somebody else's, and it is neither kept nor removed here. Its page
			// re-runs inject_compact_cluster (and this) when it comes forward.
			const current_page = (window.frappe && frappe.container && frappe.container.page) || null;
			const in_another_page = (node) => {
				const head = node.closest(".page-head");
				return !!head && !!current_page && !current_page.contains(head);
			};
			const existing = [...document.querySelectorAll("." + cls)].filter((n) => !in_another_page(n));

			// Asked for a region this desk does not have: leave whatever is
			// already there exactly where it is, and keep claiming it if it is
			// really there. Doing anything else deletes chrome.
			if (region === "absent") {
				if (existing.length) bnd_own(token);
				// The kept bell is somewhere — ASK IT, rather than clearing and
				// letting the panel anchor to a sidebar the bell is not in. The
				// setting cannot answer here (it names a region this desk does
				// not have); the node's ancestry can.
				stamp(region_of_node(existing[0]));
				continue;
			}

			if (region === "off") {
				// OFF MUST NOT DELETE THE LAST ROUTE TO THIS THING. Off means
				// "use the stock affordance instead of ours" — it can only mean
				// that where the stock one is reachable. Where the side pane is
				// hidden, removing ours would leave a desk with no
				// notifications, no user menu and no way to log out: exactly the
				// defect status style "Off" caused in the Bottom Bar layout.
				//
				// RELEASE FIRST, THEN LOOK. Asking "is the native reachable?"
				// while we still own it always answers no — the ownership stamp
				// is the very thing hiding it (_layouts.scss keys on
				// data-bnd-own). The first version of this guard did exactly
				// that and turned Off into a no-op in every layout.
				bnd_disown(token);
				if (existing.length && !native_pane_usable()) {
					// Releasing brought nothing back, so keep ONE of ours and
					// claim it again. Keeping one rather than all is the other
					// half of the fix: before, "Off" with three containers on
					// removed one bell and left two, which is neither off nor
					// placed.
					for (const node of existing.slice(1)) node.remove();
					bnd_own(token);
					// Same rule as "absent": the kept bell knows where it is.
					stamp(region_of_node(existing[0]));
					continue;
				}
				for (const node of existing) node.remove();
				stamp("");
				continue;
			}

			const host = host_for(region, zone_for(tenant));
			if (!host) {
				stamp("");
				continue;
			}
			// Keep at most one, and only if it is already in the right host;
			// everything else goes, wherever it is.
			let keeper = null;
			for (const node of existing) {
				if (!keeper && host.contains(node)) keeper = node;
				else node.remove();
			}
			// `host` is already the zone for every region but the side pane,
			// where it is the pane itself and CSS `order` does the placing —
			// so the node carries the zone and the stylesheet reads it. The
			// pane is Frappe's DOM and this theme does not redraw it.
			const zone = zone_for(tenant);
			if (!keeper) {
				const node = build();
				node.setAttribute("data-bnd-zone", zone);
				if (region === "sidepane") sb_zone_anchor(host, zone, node);
				else host.appendChild(node);
			} else if (region === "sidepane" && keeper.getAttribute("data-bnd-zone") !== zone) {
				// The zone changed under a node that is already in the pane;
				// move it rather than rebuild, so nothing bound to it is lost.
				keeper.setAttribute("data-bnd-zone", zone);
				sb_zone_anchor(host, zone, keeper);
			}
			bnd_own(token);
			stamp(region);
		}
		sb_band_prune();
		enforce_desk_order();
		ensure_skip_link();
	}

	// `build_cluster` lived here and is deleted: it welded a bell and an avatar
	// together and handed the pair to any container that asked. Search had
	// already been lifted out of it by item 14 — the `opts.search` branch was
	// annotated "legacy" and had no live caller — and the other two follow now
	// for the same reason. A tenant is placed by `mount_placed_tenants`, once.

	/**
	 * The notifications bell.
	 *
	 * `bnd-bell` names the AFFORDANCE. The badge inside it is only the unread
	 * indicator and is hidden whenever there is nothing unread — asking the
	 * badge whether notifications are reachable answers a different question,
	 * and answers it wrongly on a quiet bench.
	 * @returns {HTMLElement}
	 */
	function build_bell() {
		const bell = el("button", "bnd-icon-btn bnd-bell", {
			type: "button",
			"data-bnd-part": "bell",
			"aria-label": __("Notifications"),
			title: __("Notifications"),
			"aria-haspopup": "dialog",
			"aria-expanded": "false",
		});
		bell.appendChild(cloned_icon(".sidebar-notification", "icon-bell"));
		// The unread badge is OURS to build: Frappe's own badge code toggles
		// selectors (.notifications-icon / .notifications-unseen) that exist
		// in no template in this version, so nothing renders however many
		// unread rows a user has (measured with 2 unread + seen:0). See the
		// inbox kit below; inbox_mount_badge fills this node.
		bell.appendChild(el("span", "bnd-inbox-badge", { hidden: "" }));
		bell.addEventListener("click", (e) => {
			// The proxy opens the panel synchronously; without this, OUR click
			// then bubbles to Frappe's document-level outside-click closer —
			// whose target (this button) is outside the panel — and the panel
			// closes in the same instant it opened (measured 2026-07-30).
			e.stopPropagation();
			inbox_invoke();
		});
		return bell;
	}

	let open_acct = null;

	function close_acct(refocus) {
		if (!open_acct) return;
		const { panel, trigger, on_doc } = open_acct;
		open_acct = null;
		document.removeEventListener("pointerdown", on_doc, true);
		if (trigger && trigger.setAttribute) trigger.setAttribute("aria-expanded", "false");
		panel.classList.remove("bnd-acct-open");
		const gone = () => panel.remove();
		const dur = parseFloat(getComputedStyle(panel).transitionDuration) || 0;
		if (dur) setTimeout(gone, dur * 1000 + 30);
		else gone();
		if (refocus && trigger && trigger.focus) trigger.focus();
	}

	/** The account panel (8c): dialog, never menu. _cluster.scss argues it. */
	function bunood_acct_panel(trigger) {
		if (open_acct && open_acct.trigger === trigger) {
			close_acct(true);
			return;
		}
		close_acct(false);

		const panel = el("div", "bnd-acct-panel", {
			role: "dialog",
			"aria-modal": "false",
			"aria-labelledby": "bnd-acct-name",
			tabindex: "-1",
		});

		// <bdi> on every free-text line — item 7's isolation gap.
		const head = el("div", "bnd-acct-head");
		const av = el("span", "bnd-acct-avatar");
		av.innerHTML = user_avatar_html();
		head.appendChild(av);
		const id = el("div", "bnd-acct-id");
		const name = el("div", "bnd-acct-name", { id: "bnd-acct-name" });
		const nbdi = el("bdi", "");
		nbdi.textContent = (frappe.session && frappe.session.user_fullname) || frappe.session.user;
		name.appendChild(nbdi);
		id.appendChild(name);
		const mail = el("div", "bnd-acct-email");
		const mbdi = el("bdi", "");
		mbdi.textContent =
			(frappe.boot.user && frappe.boot.user.email) ||
			(frappe.session && frappe.session.user_email) ||
			"";
		mail.appendChild(mbdi);
		id.appendChild(mail);
		const company = (frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) || "";
		if (company) {
			const line = el("div", "bnd-acct-company-line");
			const cbdi = el("bdi", "");
			cbdi.textContent = company;
			line.appendChild(cbdi);
			id.appendChild(line);
		}
		head.appendChild(id);
		panel.appendChild(head);

		// Light or dark, through Frappe's own switch_theme endpoint.
		const modes = [
			{ value: "light", label: __("Light") },
			{ value: "dark", label: __("Dark") },
			{ value: "automatic", label: __("Automatic") },
		];
		const group = el("div", "bnd-acct-appearance", {
			role: "radiogroup",
			"aria-label": __("Light or dark"),
		});
		const mode_now = () => document.documentElement.getAttribute("data-theme-mode") || "light";
		const radios = modes.map((m) => {
			const b = el("button", "bnd-acct-radio", {
				type: "button",
				role: "radio",
				"aria-checked": mode_now() === m.value ? "true" : "false",
				tabindex: mode_now() === m.value ? "0" : "-1",
			});
			b.textContent = m.label;
			b.addEventListener("click", () => set_mode(m.value));
			group.appendChild(b);
			return b;
		});
		function set_mode(value) {
			frappe.ui.set_theme(value === "automatic" ? undefined : value);
			document.documentElement.setAttribute("data-theme-mode", value);
			frappe
				.xcall("frappe.core.doctype.user.user.switch_theme", {
					theme: value.charAt(0).toUpperCase() + value.slice(1),
				})
				.catch(() => {});
			radios.forEach((b, i) => {
				b.setAttribute("aria-checked", modes[i].value === value ? "true" : "false");
				b.tabIndex = modes[i].value === value ? 0 : -1;
			});
		}
		group.addEventListener("keydown", (e) => {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
			e.preventDefault();
			const at = radios.indexOf(document.activeElement);
			const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
			const next = radios[(at + (fwd ? 1 : radios.length - 1)) % radios.length];
			next.focus();
			next.click();
		});
		panel.appendChild(group);

		// Company: the vendor's own session-defaults write.
		if (company) {
			const disc = el("button", "bnd-acct-company", {
				type: "button",
				"aria-expanded": "false",
			});
			const dlabel = el("span", "bnd-acct-company-label");
			dlabel.textContent = __("Company");
			disc.appendChild(dlabel);
			const dval = el("bdi", "bnd-acct-company-value");
			dval.textContent = company;
			disc.appendChild(dval);
			const list = el("div", "bnd-acct-companies", { hidden: "" });
			let loaded = false;
			disc.addEventListener("click", () => {
				const opening = disc.getAttribute("aria-expanded") !== "true";
				disc.setAttribute("aria-expanded", opening ? "true" : "false");
				list.hidden = !opening;
				if (!opening || loaded) return;
				loaded = true;
				frappe
					.xcall("frappe.client.get_list", {
						doctype: "Company",
						fields: ["name"],
						limit_page_length: 20,
					})
					.then((rows) => {
						for (const row of rows || []) {
							const opt = el("button", "bnd-acct-company-opt", {
								type: "button",
								"aria-checked": row.name === dval.textContent ? "true" : "false",
							});
							const obdi = el("bdi", "");
							obdi.textContent = row.name;
							opt.appendChild(obdi);
							opt.addEventListener("click", () => {
								frappe
									.xcall(
										"frappe.core.doctype.session_default_settings.session_default_settings.set_session_default_values",
										{ default_values: JSON.stringify({ company: row.name }) }
									)
									.then(() => {
										dval.textContent = row.name;
										for (const o of list.children) {
											o.setAttribute("aria-checked", o === opt ? "true" : "false");
										}
									})
									.catch(() => {});
							});
							list.appendChild(opt);
						}
					})
					.catch(() => {});
			});
			panel.appendChild(disc);
			panel.appendChild(list);
		}

		// The session actions.
		const items = el("div", "bnd-acct-items");
		for (const item of avatar_menu_items()) {
			if (item === "divider") {
				items.appendChild(el("div", "bnd-acct-divider", { role: "separator" }));
				continue;
			}
			const row = el("button", item.danger ? "bnd-acct-item bnd-acct-signout" : "bnd-acct-item", {
				type: "button",
			});
			if (item.icon) row.appendChild(sprite_icon(item.icon));
			const lbl = el("span", "bnd-acct-item-label");
			lbl.textContent = item.label;
			row.appendChild(lbl);
			if (item.kbd) {
				const hint = el("kbd", "bnd-acct-kbd");
				hint.textContent = item.kbd;
				row.appendChild(hint);
			}
			row.addEventListener("click", () => {
				close_acct(false);
				try {
					item.run && item.run();
				} catch (e) {
					console.error("bunood_theme account action failed", e); // eslint-disable-line no-console
				}
			});
			items.appendChild(row);
		}
		panel.appendChild(items);

		const caption = el("div", "bnd-acct-caption");
		const sbdi = el("bdi", "");
		sbdi.textContent = (frappe.boot && frappe.boot.sitename) || "";
		caption.appendChild(sbdi);
		panel.appendChild(caption);

		panel.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				close_acct(true);
			}
		});

		document.body.appendChild(panel);

		// Viewport geometry, no side names.
		const r = trigger.getBoundingClientRect();
		const pw = panel.offsetWidth;
		const ph = panel.offsetHeight;
		const opens_up = r.bottom + ph + 6 > window.innerHeight;
		const top = opens_up ? Math.max(8, r.top - ph - 6) : r.bottom + 6;
		const left = Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8);
		panel.style.top = top + "px";
		panel.style.left = left + "px";
		// Origin at the trigger's corner, numerically.
		const ox = Math.min(Math.max(0, r.left + r.width / 2 - left), pw);
		const oy = opens_up ? ph : 0;
		panel.style.transformOrigin = ox + "px " + oy + "px";

		const on_doc = (e) => {
			if (panel.contains(e.target) || trigger.contains(e.target)) return;
			close_acct(false);
		};
		document.addEventListener("pointerdown", on_doc, true);
		if (trigger && trigger.setAttribute) trigger.setAttribute("aria-expanded", "true");
		open_acct = { panel, trigger, on_doc };

		requestAnimationFrame(() => {
			panel.classList.add("bnd-acct-open");
			panel.focus();
		});
	}
	bunood.acct_panel = bunood_acct_panel;

	/**
	 * The avatar and its panel — the only route to Log Out once a layout hides
	 * Frappe's own, which is why `user` is the sharpest ownership token.
	 * @returns {HTMLElement}
	 */
	function build_user() {
		const avatar = el("button", "bnd-avatar-btn", {
			type: "button",
			"data-bnd-part": "user",
			"aria-label": __("User menu"),
		});
		avatar.innerHTML = user_avatar_html();
		avatar.setAttribute("aria-haspopup", "dialog");
		avatar.setAttribute("aria-expanded", "false");
		avatar.addEventListener("click", (e) => {
			e.stopPropagation();
			bunood_acct_panel(avatar);
		});
		return avatar;
	}

	/**
	 * Frappe's own avatar markup for the session user — images, initials and
	 * their colours are core's business. Falls back to a bare initial if the
	 * helper is unavailable.
	 * @returns {string} HTML.
	 */
	function user_avatar_html() {
		try {
			return frappe.avatar(frappe.session.user, "avatar-small");
		} catch (e) {
			const initial = (frappe.session.user_fullname || "?").charAt(0).toUpperCase();
			return '<span class="avatar avatar-small"><div class="avatar-frame standard-image">' + initial + "</div></span>";
		}
	}

	/**
	 * The search ICON: the same affordance as the field, for hosts too narrow
	 * to hold one — today the dock's pill.
	 *
	 * `bnd-search-icon` names it deliberately. `.bnd-icon-btn` alone cannot be
	 * told apart from the bell, so nothing could ask "is search reachable in
	 * this layout" — and the invariant matrix answered "no" for Dock, where
	 * search was in fact right there.
	 * @returns {HTMLElement}
	 */
	function build_search_icon() {
		const btn = el("button", "bnd-icon-btn bnd-search-icon", {
			type: "button",
			"data-bnd-part": "search",
			"aria-label": __("Search"),
			title: __("Search"),
		});
		btn.appendChild(cloned_icon(".navbar-search-bar", "icon-search"));
		btn.addEventListener("click", () => pal_invoke());
		return btn;
	}

	/**
	 * The search "field": a button dressed as an input that opens Frappe's
	 * search modal via the hidden native trigger. Shows the platform-correct
	 * shortcut hint; the shortcut itself is Frappe's own binding, untouched.
	 * @returns {HTMLElement}
	 */
	function build_search_field() {
		const field = el("button", "bnd-search-field", {
			type: "button",
			"data-bnd-part": "search",
			"aria-label": __("Search"),
		});
		field.appendChild(cloned_icon(".navbar-search-bar", "icon-search"));
		const label = el("span", "bnd-search-label");
		label.textContent = __("Search");
		field.appendChild(label);
		const kbd = el("kbd");
		kbd.textContent = /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl+K";
		field.appendChild(kbd);
		// The palette kit owns search invocation when active; otherwise the
		// click proxies the hidden native trigger exactly as before.
		field.addEventListener("click", () => pal_invoke());
		return field;
	}

	// ════════════════════════════════════════════════════════════════════════
	// Status bar (item 14) — state, segments, polling
	// ════════════════════════════════════════════════════════════════════════
	//
	// FOUR STYLES: Off / Minimal (no server calls at all) / Quiet (default:
	// a healthy desk shows nothing but density and the clock; a segment
	// appears only once it has something to say) / "Always On" (always-on
	// counts for admins).
	//
	// WHAT THE PLATFORM ALLOWS, and why this shape:
	//   * Frappe publishes NO realtime event for background jobs — not on
	//     start, success or failure. Job state is therefore POLLED, and the
	//     bar says how old the number is rather than pretending to be live.
	//   * Job counts are System Manager only, and counting them walks every
	//     RQ registry on the BENCH. api.get_status_signals gates on the role
	//     server-side and always filters by status (measured: 9ms warm
	//     against 4.5s unfiltered).
	//   * Error counts ride Frappe's own self-gating notification counts, so
	//     a user who may not read Error Log gets null — "not applicable",
	//     which the bar renders as absence, never as a reassuring zero.

	/** Boot's status options, replaced by live preview. */
	let status_state = (window.frappe && frappe.boot && frappe.boot.bnd_status) || null;

	/** Latest signals from the server, and when they arrived. */
	let status_signals = null;
	let status_timer = null;
	let status_age_timer = null;

	/**
	 * Style slug: minimal | quiet | operator.
	 *
	 * "Off" was a fourth option until slice 2c-4, and it meant "no bottom bar" —
	 * which is `bottombar_enabled`'s answer, not a style's. A site read before
	 * its migration has run can still be holding the retired label, so it is
	 * normalised to the shipped style rather than passed through: left alone it
	 * would fall through every content branch below and produce a bar that
	 * exists and shows nothing, which is the one outcome neither setting means.
	 */
	function status_style() {
		const label = (status_state && status_state.status_style) || "Quiet";
		const slug = String(label).toLowerCase();
		return slug === "off" ? "quiet" : slug;
	}

	/** Is a segment flag on? */
	function status_on(field) {
		return !!(status_state && parseInt(status_state[field], 10));
	}

	/** Clock mode: off | 12 | 24. */
	function status_clock_mode() {
		const label = (status_state && status_state.status_clock) || "24 Hour";
		if (label === "Off") return "off";
		return label === "12 Hour" ? "12" : "24";
	}

	/** Poll period in ms, or 0 for manual-only. */
	function status_period() {
		const label = (status_state && status_state.status_interval) || "60s";
		if (label === "Manual") return 0;
		if (label === "30s") return 30000;
		if (label === "5min") return 300000;
		return 60000;
	}

	/**
	 * The live segments, in bar order. `prio` is the collapse rank — higher
	 * numbers are dropped first on narrow viewports (CSS reads it), so the
	 * things that mean "something is wrong" survive longest.
	 */
	const STATUS_SEGMENTS = [
		{
			id: "jobs",
			flag: "status_segments_jobs",
			prio: 5,
			admin: true,
			open: () => frappe.set_route("List", "RQ Job"),
		},
		{
			// NOT admin-gated: Error Log read is grantable to roles other than
			// System Manager, and the server self-gates by omitting the count
			// for anyone without it. Guessing here would hide a signal from
			// someone entitled to see it.
			id: "errors",
			flag: "status_segments_errors",
			prio: 4,
			open: () => frappe.set_route("List", "Error Log"),
		},
		{
			id: "scheduler",
			flag: "status_segments_scheduler",
			prio: 6,
			admin: true,
			open: () => frappe.set_route("Form", "System Settings"),
		},
	];

	/** Is the session a System Manager? Decided by the SERVER, at boot. */
	function status_privileged() {
		return !!(status_state && parseInt(status_state.privileged, 10));
	}

	/**
	 * Should this segment exist for this user at all?
	 *
	 * Admin-only signals are dropped rather than built-and-left-empty: a
	 * "Scheduler paused" warning is noise to someone with no power to
	 * restart it, and a jobs count the server will always refuse is a node
	 * that can never fill.
	 */
	function status_seg_enabled(seg) {
		if (!status_on(seg.flag)) return false;
		return seg.admin ? status_privileged() : true;
	}

	/**
	 * Paint one segment. Returns true when it has something to show.
	 * Quiet hides anything healthy; "Always On" shows everything it has.
	 */
	function status_paint_segment(seg) {
		const node = status_refs[seg.id];
		if (!node) return false;
		const quiet = status_style() === "quiet";
		let text = "";
		let tone = "";

		if (seg.id === "jobs") {
			const jobs = status_signals && status_signals.jobs;
			if (jobs) {
				const failed = parseInt(jobs.failed, 10) || 0;
				const busy = (parseInt(jobs.queued, 10) || 0) + (parseInt(jobs.started, 10) || 0);
				if (failed > 0) {
					// LABEL + VALUE, NOT A COUNTED NOUN. Frappe's translation
					// layer is a flat key->string map with no plural forms, and
					// Arabic has six plural categories — so "{0} failed" cannot
					// be correct for 1, 2, 3-10 and 11+ at once, and no
					// translation can rescue it. Naming the label and letting
					// the number follow is grammar-free in every language.
					// The siblings below ("Jobs OK", "No errors") already read
					// this way; item 7(c) makes it uniform.
					text = __("Failed: {0}", [String(failed)]);
					tone = "bad";
				} else if (!quiet && busy > 0) {
					text = __("Running: {0}", [String(busy)]);
				} else if (!quiet) {
					text = __("Jobs OK");
				}
			}
		} else if (seg.id === "errors") {
			const errors = status_signals && status_signals.errors;
			if (errors !== null && errors !== undefined) {
				if (errors > 0) {
					text = __("Errors: {0}", [String(errors)]);
					// The tone belongs to the FACT, not to the style. Tying it
					// to Quiet meant "Always On" — the style for people watching
					// for trouble — rendered errors in plain text, and the
					// escalation tint could never fire for them at all.
					tone = "warn";
				} else if (!quiet) {
					text = __("No errors");
				}
			}
		} else if (seg.id === "scheduler") {
			const sched = status_signals && status_signals.scheduler;
			if (sched === "inactive") {
				text = __("Scheduler paused");
				tone = "warn";
			} else if (sched === "active" && !quiet) {
				text = __("Scheduler on");
			}
		}

		node.textContent = text;
		if (tone) node.setAttribute("data-tone", tone);
		else node.removeAttribute("data-tone");
		if (text) node.removeAttribute("hidden");
		else node.setAttribute("hidden", "");
		return !!text;
	}

	/** Repaint every segment plus the freshness stamp. */
	function status_paint() {
		let alarm = false;
		for (const seg of STATUS_SEGMENTS) {
			if (status_paint_segment(seg) && status_refs[seg.id].getAttribute("data-tone") === "bad") {
				alarm = true;
			}
		}
		// Escalation is opt-in: tinting a whole bar is loud, and a bar that
		// cries wolf gets ignored.
		const bar = document.querySelector(".bnd-statusbar");
		if (bar) bar.classList.toggle("bnd-status-alarm", alarm && status_on("status_escalate"));

		const fresh = status_refs.fresh;
		if (fresh) {
			if (!status_signals) {
				fresh.textContent = __("No data");
			} else {
				const age = Math.max(0, Math.round(Date.now() / 1000 - (status_signals.at || 0)));
				fresh.textContent =
					age < 60 ? __("{0}s ago", [String(age)]) : __("{0}m ago", [String(Math.round(age / 60))]);
			}
		}
	}

	/**
	 * Ask the server for signals. `force` bypasses nothing on the server —
	 * it only exists so the manual refresh button works while the interval
	 * is set to Manual.
	 */
	function status_poll(force) {
		if (!frappe.xcall) return;
		if (!force && status_period() === 0) return;
		const style = status_style();
		if (style === "off" || style === "minimal") return;
		// Ask only for what this user will actually be shown. The server
		// gates jobs on the role regardless; not asking spares it the work.
		const want = {};
		for (const seg of STATUS_SEGMENTS) want[seg.id] = status_seg_enabled(seg) ? 1 : 0;
		if (!want.jobs && !want.errors && !want.scheduler) return;
		frappe
			.xcall("bunood_theme.api.get_status_signals", {
				want_jobs: want.jobs,
				want_errors: want.errors,
				want_scheduler: want.scheduler,
			})
			.then((res) => {
				status_signals = res || null;
				status_paint();
			})
			.catch(() => {
				// Leave the last known values and let the stamp age — a
				// failed poll is stale data, not zero.
				status_paint();
			});
	}

	/** Start (or restart) polling for the active style. */
	function status_start() {
		// BOTH timers are cleared, not just the poller: this function is a
		// restart, and an ageing timer left behind by a previous call would
		// stack a second repaint loop on every restart.
		clearInterval(status_timer);
		clearInterval(status_age_timer);
		status_timer = null;
		status_age_timer = null;
		const style = status_style();
		if (style === "off" || style === "minimal") return;
		status_poll(true);
		const period = status_period();
		if (period) status_timer = setInterval(() => status_poll(false), period);
		// The stamp must keep ageing between polls or "12s ago" lies.
		status_age_timer = setInterval(status_paint, 15000);
	}

	// ════════════════════════════════════════════════════════════════════════
	// Search placement (item 14 companion)
	// ════════════════════════════════════════════════════════════════════════
	//
	// Search used to be welded into whichever bar the layout mounted, so
	// picking a layout also picked where search lived — and in Bottom Bar it
	// fought the status segments for one strip. Placement is now its own
	// setting with six slots.
	//
	// TWO MECHANISMS, deliberately:
	//   sidebar slots -> CSS only. Frappe's own search row already lives in
	//     the sidebar; we reveal and order it rather than injecting a second
	//     search (proxy, don't reimplement).
	//   bar slots     -> inject our field, since those bars are ours.

	/**
	 * Theme Settings label -> slot slug.
	 *
	 * The E1 vocabulary first, then the retired labels as ALIASES. Both halves
	 * are load-bearing:
	 *
	 *   The new keys are the ones the field can now hold. Without them every
	 *   value except the two "Center" ones missed this table and fell to
	 *   `|| "topcenter"` — so "Top Bar Start" and "Side Pane End" would both
	 *   have put search in the middle of the top bar, silently. That would have
	 *   been a REGRESSION INTRODUCED BY THE FIX: `LAYOUT_TENANTS` now writes
	 *   "Side Pane Start" for Compact and Classic, which the old table did not
	 *   know, so those two layouts would have lost their sidebar search row.
	 *
	 *   The old keys stay because an upgrade is not instant. `slot_vocabulary`
	 *   runs during migrate, but a desk already open in another tab holds a
	 *   boot payload from before it, and this file is asked for that tab's
	 *   placement on every render until it reloads. Four dead keys are cheaper
	 *   than a blank search field for whoever had the desk open. They cost
	 *   nothing once no site emits them, and `slots_for` no longer offers them,
	 *   so nothing new can arrive here holding one.
	 */
	const SEARCH_SLOTS = {
		"Top Bar Start": "topedge",
		"Top Bar Center": "topcenter",
		"Bottom Bar Start": "botedge",
		"Bottom Bar Center": "botcenter",
		"Side Pane Start": "sbtop",
		"Side Pane End": "sbbottom",
		// Retired 2026-08-08 (E1). Upgrade-window aliases only.
		"Sidebar Top": "sbtop",
		"Sidebar Bottom": "sbbottom",
		"Top Bar Edge": "topedge",
		"Bottom Bar Edge": "botedge",
	};

	//: The dock is a slot too, reachable only by fallback. It is deliberately
	//: absent from SEARCH_SLOTS because no admin picks it directly — the Dock
	//: layout is the only place it exists, and there it is the RIGHT home:
	//: the dock already carries this layout's other controls, and it is the
	//: only chrome that survives when the status bar is switched off.
	const SEARCH_DOCK = "dock";

	/**
	 * Preference order when the requested slot does not exist in the active
	 * layout. Walked left to right from the request, so a choice degrades to
	 * the nearest sensible home instead of vanishing.
	 *
	 * PER-LAYOUT, because "nearest sensible home" is a property of the layout
	 * rather than a global ranking:
	 *   compact / classic  keep Frappe's own sidebar search row, and are
	 *                      defined by not growing extra chrome. Falling back
	 *                      into their slim strip contradicted the layout
	 *                      twice — it grew that strip to 40px AND took away
	 *                      the row the layout exists to keep.
	 *   dock               hides the sidebar outright, so it has only bars.
	 *   bottombar          its own strip first: that strip IS the layout.
	 */
	const SEARCH_FALLBACKS = {
		topbar: ["topcenter", "topedge", "botcenter", "botedge", "sbtop", "sbbottom"],
		compact: ["sbtop", "sbbottom", "botcenter", "botedge"],
		classic: ["sbtop", "sbbottom", "botcenter", "botedge"],
		bottombar: ["botcenter", "botedge", "sbtop", "sbbottom"],
		// The dock FIRST, not the status bar. Dock hides the sidebar and may
		// have no status bar at all, so the pill is the one piece of chrome
		// guaranteed to be there — and putting search anywhere else in this
		// layout leaves the pill's own controls split across two strips.
		dock: ["dock", "botcenter", "botedge"],
	};

	/**
	 * The fallback order for the active layout.
	 *
	 * STILL KEYED ON THE LAYOUT, and knowingly so. Since slice 2c a container
	 * can contradict its layout — a top bar on a Classic desk, none on a Top
	 * Bar one — so this table no longer describes what is really there. It does
	 * not have to: `mount_search` tries the WANTED slot first and every slot is
	 * resolved against the live DOM (`search_slot_host`), so the worst this can
	 * be is a suboptimal SECOND choice, never a wrong first one or a missing
	 * search. Reworking it into a preference over regions belongs with the
	 * honest-picker audit, which is where every remaining "the layout decides"
	 * gets found; changing it here would be a second behaviour riding along
	 * with the split.
	 */
	function search_fallback_order() {
		return SEARCH_FALLBACKS[layout()] || SEARCH_FALLBACKS.topbar;
	}

	/** The container a slot needs, or null when this layout has no such bar. */
	function search_slot_host(slot) {
		if (slot === "topedge" || slot === "topcenter") {
			return document.querySelector(".bnd-topbar");
		}
		if (slot === "botedge" || slot === "botcenter") {
			return document.querySelector(".bnd-statusbar");
		}
		if (slot === SEARCH_DOCK) {
			return document.querySelector(".bnd-dock .bnd-cluster");
		}
		// Sidebar slots need the sidebar AND Frappe's own search row — and
		// need them VISIBLE. Dock hides the whole sidebar container while
		// leaving it in the DOM, so an existence test happily "places" search
		// inside display:none and it is simply gone. Visibility is the real
		// condition; anything less makes the fallback unreachable exactly
		// where it is needed most.
		if (slot === "sbtop" || slot === "sbbottom") {
			const sidebar = document.querySelector(".body-sidebar");
			const native = document.querySelector(".navbar-search-bar");
			if (!sidebar || !native || sidebar_is_hidden()) return null;
			return sidebar;
		}
		return null;
	}

	/** Is the sidebar container display:none (Dock layout, narrow collapse)? */
	function sidebar_is_hidden() {
		const container = document.querySelector(".body-sidebar-container");
		return !!container && getComputedStyle(container).display === "none";
	}

	/** The slot the admin asked for, as a slug. */
	function search_wanted_slot() {
		return SEARCH_SLOTS[(status_state && status_state.search_placement) || ""] || "topcenter";
	}

	/**
	 * Resolve the configured placement to one that actually exists now, and
	 * reflect it on <html> so CSS can position both our field and Frappe's
	 * native row. Returns the resolved slug (or "" when nothing fits).
	 */
	function search_resolve_slot() {
		const want = search_wanted_slot();
		for (const slot of [want].concat(search_fallback_order().filter((s) => s !== want))) {
			if (search_slot_host(slot)) return slot;
		}
		return "";
	}

	/**
	 * Is this slot merely LATE rather than absent?
	 *
	 * Every bar slot lives in a bar mounted synchronously by the caller a few
	 * lines above mount_search, so for those "missing now" means "missing
	 * forever". Frappe's sidebar search row is the one anchor that arrives a
	 * beat after boot — unless the layout hides the sidebar outright, in
	 * which case it is not coming either.
	 */
	function search_pending(slot) {
		if (slot !== "sbtop" && slot !== "sbbottom") return false;
		if (sidebar_is_hidden()) return false;
		return !document.querySelector(".navbar-search-bar");
	}

	/**
	 * Mount the search field at the resolved slot. Idempotent: an existing
	 * field in the right host is left alone, one in the wrong host is moved,
	 * so a live preview flip does not leave two search fields behind.
	 *
	 * THE RULE: never fall PAST a higher-preference slot that is only late.
	 * Both halves of that matter, and each was learned by breaking it:
	 *   - waiting on a slot that can never exist left Bottom Bar search-less
	 *     for 3.1s on its own default placement;
	 *   - not waiting at all let Compact skip its sidebar — its preferred
	 *     home — for the strip that happened to exist already, growing the
	 *     one layout defined by not growing chrome;
	 *   - and resolving before the row rendered dropped search entirely in
	 *     Classic. All three measured.
	 */
	function mount_search() {
		if (!status_state) return;
		const want = search_wanted_slot();
		const order = [want].concat(search_fallback_order().filter((s) => s !== want));

		let placed = false;
		try_for(() => {
			for (const slot of order) {
				if (search_slot_host(slot)) {
					mount_search_at(slot);
					placed = true;
					return true;
				}
				// Stop scanning here rather than settling for a lower
				// preference: this one may still arrive.
				if (search_pending(slot)) return false;
			}
			return false;
		}, 20);

		// Budget spent: whatever we were waiting for is not coming. Take the
		// nearest home that does exist rather than dropping search.
		setTimeout(() => {
			if (placed) return;
			const slot = search_resolve_slot();
			if (slot) mount_search_at(slot);
		}, 20 * 150 + 100);
	}

	/** Place the field (or reveal the native row) for a resolved slot. */
	function mount_search_at(slot) {
		const html = document.documentElement;
		html.setAttribute("data-bnd-search", slot);

		// Sidebar slots are pure CSS — the native row IS the search there, so we
		// deliberately do NOT claim it. Unclaimed means visible, which is
		// exactly what this placement wants; disowning matters too, for a live
		// preview flipping back from a bar slot.
		if (slot === "sbtop" || slot === "sbbottom") {
			for (const stray of document.querySelectorAll(".bnd-search-field, .bnd-search-icon")) stray.remove();
			bnd_disown("search");
			return;
		}

		const host = search_slot_host(slot);
		if (!host) return;

		// The dock takes the ICON form: a 340px field does not fit a pill, and
		// the pill's other controls are icons already.
		if (slot === SEARCH_DOCK) {
			for (const stray of document.querySelectorAll(".bnd-search-field")) stray.remove();
			if (!host.querySelector(".bnd-search-icon")) {
				host.insertBefore(build_search_icon(), host.firstChild);
			}
			bnd_own("search");
			return;
		}
		for (const stray of document.querySelectorAll(".bnd-search-icon")) stray.remove();
		let field = host.querySelector(".bnd-search-field");
		if (!field) {
			// Remove any field left in another bar by a previous placement.
			for (const stray of document.querySelectorAll(".bnd-search-field")) stray.remove();
			field = build_search_field();
			if (slot === "topcenter" || slot === "botcenter") {
				// ONE centre (item 42, slice 1b): the cluster's centre zone, so a
				// tenant placed there sits beside the field — argument in _cluster.scss.
				// The bar's own slot is the fallback for a bar with no cluster yet.
				// zone_in reserves the cluster's zones: search mounts before the tenants do.
				const zone = zone_in(host, "center");
				if (zone) {
					zone.insertBefore(field, zone.firstChild);
				} else {
					let centre = host.querySelector(".bnd-search-center");
					if (!centre) {
						centre = el("div", "bnd-search-center");
						host.appendChild(centre);
					}
					centre.appendChild(field);
				}
			} else {
				host.insertBefore(field, host.firstChild);
			}
		}
		// Claimed only once the field is in the document — this is the line
		// that hides Frappe's own search row, so it must not run a moment
		// earlier than the replacement actually existing.
		bnd_own("search");
	}

	// ── Top bar ─────────────────────────────────────────────────────────────

	/**
	 * Mount the Top Bar layout's global strip into the native <header> that
	 * v16 renders empty inside .main-section — a mount point that already
	 * sits after the sidebar and above every page, so no geometry management
	 * is needed beyond the sticky rules in _layouts.scss.
	 */
	function mount_topbar() {
		const header = document.querySelector(".main-section > header");
		if (!header || header.querySelector(".bnd-topbar")) return;
		const bar = el("div", "bnd-topbar", { "data-bnd-part": "topbar", role: "navigation", "aria-label": __("Top bar") });
		// No search here any more: mount_search() places it per the setting,
		// which may well be this bar — but may equally be the sidebar or the
		// bottom strip. The bar only owns the cluster it always owned, plus a
		// reserved centre slot (see mount_statusbar for why it is reserved).
		//
		// The centre slot is appended FIRST and centred by CSS against the
		// bar. It must not flex: the cluster is pushed to the trailing edge
		// by an auto margin, and per flexbox, flexible lengths resolve before
		// auto margins — so a flexing sibling eats the free space, the auto
		// margin resolves to zero, and the bell and avatar snap to the
		// leading edge. That regression shipped in the first cut of item 14.
		bar.appendChild(el("div", "bnd-search-center"));
		reserve_cluster(bar);
		header.appendChild(bar);
		// Stamped only now, with the bar in the document — the whole point of
		// keying the stylesheet on the outcome. Everything above this line can
		// return early.
		container_mounted("topbar");
	}

	// ── Status bar / bottom bar ─────────────────────────────────────────────

	/** Live references the status bar updates after mount. */
	const status_refs = { conn: null, conn_label: null, density: null, clock: null };

	/**
	 * Mount the fixed bottom strip.
	 *
	 * NO `global_variant` ANY MORE, and losing it is the point of slice 2c-4.
	 * It used to mean "the Bottom Bar layout's taller strip, which also carries
	 * search + bell + avatar" — a second way of saying what `inbox_placement`
	 * and `user_placement` already say. The bar reserves a cluster slot and
	 * `mount_placed_tenants` fills it, exactly as it fills the top bar and the
	 * dock; the strip grows to fit whatever really landed in it (_statusbar.scss
	 * keys on the contents, not on a flag).
	 *
	 * AND NO `status_style: "Off"`. Whether the strip exists is
	 * `bottombar_enabled`, checked by the caller; the style only ever decides
	 * what it SHOWS. Those were one fact in two places, and they disagreed:
	 * "Off" meant no bar in four layouts and nothing at all in the fifth, where
	 * the strip mounted regardless because it was that layout's only chrome.
	 * That disagreement is how "Off" cost the Bottom Bar layout its Log Out in
	 * 0.10.0 — the defect the whole component rework began with.
	 */
	function mount_statusbar() {
		if (document.querySelector(".bnd-statusbar")) return;

		// role="region", not "navigation" (item 22): a clock, a connection dot
		// and job counts are not navigation, and a wrong role is discoverable
		// only by AT testing — GUIDELINES §1.5's own words. "status" would be
		// worse: a live region that announces every clock tick. A named
		// region is still a landmark a screen-reader user can jump to, which
		// is the property this container actually has.
		const bar = el("div", "bnd-statusbar", { "data-bnd-part": "bottombar", role: "region", "aria-label": __("Status bar") });

		// Connection: dot + word. State wired to the realtime socket when it
		// exposes lifecycle events, else to navigator.onLine — both guarded,
		// because a status bar must never be the thing that breaks the desk.
		if (status_on("status_segments_connection")) {
			// Built hidden and with no text: the first honest paint comes from
			// bind_connection_state, which knows whether the socket is up and
			// whether this style wants to hear about it. Seeding it "Connected"
			// here would state a fact nobody had checked yet.
			const conn = el("span", "bnd-status-item bnd-conn", { "data-state": "online", hidden: "" });
			conn.appendChild(el("span", "bnd-conn-dot"));
			const conn_label = el("span");
			conn.appendChild(conn_label);
			bar.appendChild(conn);
			status_refs.conn = conn;
			status_refs.conn_label = conn_label;
			bind_connection_state();
		}

		// Minimal is the "no server calls" style, so everything the POLLER
		// owns is skipped outright rather than built and left dark: unfilled
		// segments would be permanently hidden dead nodes, and the freshness
		// stamp would sit there reading "No data" forever with a refresh button
		// wired to a poll that returns early.
		const live = status_style() !== "minimal";

		// Live signal segments, built empty and filled by the poller. Each
		// carries a priority so narrow viewports collapse by rank, not by
		// flexbox accident (CSS reads data-bnd-prio).
		for (const seg of live ? STATUS_SEGMENTS : []) {
			if (!status_seg_enabled(seg)) continue;
			const node = el("button", "bnd-status-item bnd-status-seg", {
				type: "button",
				"data-seg": seg.id,
				"data-bnd-prio": String(seg.prio),
				hidden: "",
			});
			node.addEventListener("click", () => seg.open());
			bar.appendChild(node);
			status_refs[seg.id] = node;
		}

		// The centre slot is RESERVED here rather than appended by
		// mount_search() when it runs: appending put the field after
		// everything else in the bar, so "Bottom Bar Center" sat well right
		// of centre (measured). It is centred by CSS against the BAR, not by
		// flexing siblings — a pair of flexing spacers would centre it
		// between the two content groups instead, and would also cancel the
		// cluster's auto margin and drag the bell and avatar to the leading
		// edge (both caught by the release review).
		bar.appendChild(el("span", "bnd-status-spacer"));
		bar.appendChild(el("div", "bnd-search-center"));

		// The stamp is only honest if something is actually being polled. A
		// user with no readable signals would otherwise get a permanent "No
		// data" above a refresh button that cannot refresh anything.
		const pollable = STATUS_SEGMENTS.some(status_seg_enabled);
		if (live && pollable && status_on("status_freshness")) {
			const fresh = el("button", "bnd-status-item bnd-status-fresh", {
				type: "button",
				title: __("Refresh now"),
				// The visible text is a timestamp ("12s ago"), and content
				// beats title in the accessible name — so a screen reader
				// heard the age and never the ACTION. The label names what
				// pressing it does.
				"aria-label": __("Refresh now"),
				"data-bnd-prio": "1",
			});
			fresh.addEventListener("click", () => status_poll(true));
			bar.appendChild(fresh);
			status_refs.fresh = fresh;
		}

		// Density: label shows the user's override or "Auto"; click cycles.
		if (status_on("status_segments_density")) {
			const density = el("button", "bnd-status-item", {
				type: "button",
				title: __("Toggle Density"),
				"data-bnd-prio": "2",
			});
			density.addEventListener("click", () => bunood.cycle_density());
			bar.appendChild(density);
			status_refs.density = density;
			refresh_density_label();
		}

		if (status_clock_mode() !== "off") {
			const clock = el("span", "bnd-status-item bnd-clock", { "data-bnd-prio": "3" });
			bar.appendChild(clock);
			status_refs.clock = clock;
			tick_clock();
			setInterval(tick_clock, 30000);
		}

		// A cluster slot, ALWAYS — empty until mount_placed_tenants puts
		// something in it. It is reserved for the same reason the search centre
		// above is: appending later lands it after every status segment, and
		// the bell and avatar belong at the trailing edge. An empty slot costs
		// nothing and means the bottom bar is a host like any other, rather
		// than a bar that only carries controls in one layout.
		bar.appendChild(el("div", "bnd-cluster"));

		// The native <footer> exists but the desk scrolls at document level,
		// so the bar is position:fixed (CSS); body still gets it as a child
		// of .main-section for sane DOM ownership.
		(document.querySelector(".main-section") || document.body).appendChild(bar);
		// Tell CSS a bar EXISTS, rather than making it infer one. This attribute
		// predates the container split and was already the model for it: the
		// clearance rules only ever cared about the answer, and Classic's
		// opt-in bar had no clearance at all while they were left to guess.
		//
		// It carries no VALUE any more. "global" vs "slim" was the layout
		// variant, and the bar's size now follows what really landed in it —
		// see _statusbar.scss, which asks about its contents.
		document.documentElement.setAttribute("data-bnd-statusbar", "");
		container_mounted("bottombar");
		status_start();
	}

	/** Put the current time on the status bar, in the configured format. */
	function tick_clock() {
		if (!status_refs.clock) return;
		const mode = status_clock_mode();
		if (mode === "off") return;
		status_refs.clock.textContent = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			// Explicit, not locale-inferred: an Arabic desk in a 24h country
			// should still honour the admin's choice.
			hour12: mode === "12",
			numberingSystem: BND_NUMERALS,
		});
	}

	/** Reflect the stored density override on the status bar label. */
	function refresh_density_label() {
		if (!status_refs.density) return;
		const value = (frappe.boot && frappe.boot.bnd_density) || "";
		status_refs.density.textContent = __("Density: {0}", [value ? __(value) : __("Auto")]);
	}

	/** How long the socket may take to finish its handshake before we say so. */
	const CONN_GRACE_MS = 8000;

	/**
	 * Paint the connection segment.
	 *
	 * IT DOES NOT SAY "OFFLINE", because that would be false: the desk you
	 * are reading loaded over HTTP and every page, save and report still
	 * works without a socket. What stops is LIVE UPDATES, so that is what it
	 * says. The old wording told users their connection was broken while
	 * they were plainly using it.
	 */
	function paint_connection(up) {
		const conn = status_refs.conn;
		if (!conn || !status_refs.conn_label) return;
		conn.setAttribute("data-state", up ? "online" : "offline");
		status_refs.conn_label.textContent = up ? __("Live") : __("No live updates");
		// Quiet keeps its promise here too: a working socket is not news.
		if (up && status_style() === "quiet") conn.setAttribute("hidden", "");
		else conn.removeAttribute("hidden");
	}

	/**
	 * Wire the connection indicator to the realtime socket's lifecycle if it
	 * is reachable, else to the browser's own online/offline events. Both
	 * paths are best-effort — see mount_statusbar.
	 *
	 * GOOD NEWS PAINTS AT ONCE, BAD NEWS WAITS. socket.io is normally still
	 * mid-handshake when the bar mounts, so reading `connected` right away
	 * reported a warning on virtually every page load, which then corrected
	 * itself a second later. Nothing negative is shown until the handshake
	 * has had its grace period; after that, a drop paints immediately.
	 */
	function bind_connection_state() {
		let known = null;
		let settled = false;
		const mark = (state) => {
			known = state;
			if (state || settled) paint_connection(state);
		};
		setTimeout(() => {
			settled = true;
			paint_connection(known === true);
		}, CONN_GRACE_MS);
		try {
			const socket = frappe.realtime && (frappe.realtime.socket || null);
			if (socket && socket.on) {
				socket.on("connect", () => mark(true));
				socket.on("disconnect", () => mark(false));
				if (socket.connected) mark(true);
				return;
			}
		} catch (e) {
			/* fall through to navigator */
		}
		mark(navigator.onLine);
		window.addEventListener("online", () => mark(true));
		window.addEventListener("offline", () => mark(false));
	}

	// ── Compact layout: cluster in the page strip ───────────────────────────

	/**
	 * Compact mounts the cluster INSIDE each page's title row (the merged
	 * single strip of the wireframe). Page heads are built per page and pages
	 * are cached in the DOM, so this runs on every route change, idempotently
	 * (the marker is the cluster itself), with a retry because the head may
	 * not exist yet when the router event fires.
	 */
	function inject_compact_cluster() {
		// `frappe.container.page` still points at the OUTGOING page when the
		// router fires — the new one becomes current a few hundred ms later
		// (measured: 105ms still old, 512ms new, on Form routes). Without
		// this guard the first synchronous attempt found the outgoing page's
		// existing cluster, returned success, and the incoming page never
		// got one at all: no cluster, no bell, no badge, indefinitely.
		const outgoing = frappe.container && frappe.container.page;
		const wait_for_swap = !!(outgoing && outgoing.querySelector(".bnd-cluster"));
		try_for(() => {
			const page = frappe.container && frappe.container.page;
			if (!page) return false;
			if (wait_for_swap && page === outgoing) return false;
			const section = page.querySelector(".page-head .standard-items-section");
			if (!section) return false;
			if (section.querySelector(".bnd-cluster")) {
				// Already there, but the stamp is per-DOCUMENT and the page is
				// per-ROUTE: arriving back on a cached page that still has its
				// cluster must re-assert the attribute, or a navigation away
				// and back leaves the stylesheet believing there is no cluster.
				container_mounted("pagehead");
				return true;
			}
			section.appendChild(el("span", "bnd-cluster-divider"));
			// Identity on the cluster itself, not on the page head: the head is
			// Frappe's and exists on every desk, while THIS is the container —
			// the group our tenants live in, and what HOSTS.pagehead resolves
			// to. `mount_cluster` is shared with the top bar and the dock, so
			// the stamp goes on here rather than inside it.
			reserve_cluster(section).setAttribute("data-bnd-part", "pagehead");
			container_mounted("pagehead");
			// mount_cluster builds the bell and the avatar unconditionally, and
			// this runs again on EVERY route change (it has to — Frappe swaps the
			// page element out from under us). Without re-asserting placement,
			// a tenant the user placed elsewhere or switched Off came back on the
			// next navigation and quietly stayed: the setting appeared to work
			// once and then undo itself.
			mount_placed_tenants();
			return true;
		}, 20);
	}

	// ── Breadcrumb kit (item 11) — trail decoration ─────────────────────────

	/**
	 * The copy-link button for the trail's last crumb. Returns null when no
	 * suitable sprite symbol exists — the affordance simply does not mount
	 * (fails open), never a broken button.
	 * @returns {HTMLElement|null}
	 */
	function crumb_copy_button() {
		// Both preconditions checked at MOUNT time, honouring the contract
		// below: navigator.clipboard only exists in secure contexts, and a
		// plain-http intranet tenant must not get a visible button whose
		// click silently does nothing (release review v0.6.2..HEAD).
		if (!(navigator.clipboard && navigator.clipboard.writeText)) return null;
		const symbol = sb_existing_symbol(["icon-link-url", "icon-link", "es-line-link", "icon-duplicate"]);
		if (!symbol) return null;
		const btn = el("button", "bnd-crumb-copy", {
			type: "button",
			"aria-label": __("Copy link"),
			title: __("Copy link"),
		});
		btn.appendChild(sprite_icon(symbol));
		btn.addEventListener("click", (ev) => {
			// The button sits inside the trail; never let the click reach a
			// crumb anchor and navigate.
			ev.preventDefault();
			ev.stopPropagation();
			navigator.clipboard.writeText(window.location.href).then(
				() => frappe.show_alert({ message: __("Link copied"), indicator: "green" }),
				() => frappe.show_alert({ message: __("Could not copy"), indicator: "red" })
			);
		});
		return btn;
	}

	/**
	 * One pass over every trail (pages are cached in the DOM, so there is one
	 * trail per instantiated page): resolve the current workspace, then — if
	 * the kit is active — decorate per the boot/preview options. Retried
	 * because breadcrumbs render slightly after the route event.
	 *
	 * RESOLUTION ALWAYS RUNS, even with the kit down ("Original"): the
	 * sidebar kit's module row consumes the resolved workspace in every
	 * layout — one resolution, two consumers. On list/form pages the trail's
	 * workspace crumb is the only reliable signal; the route carries the
	 * doctype, not the workspace.
	 *
	 * TWO-STEP MATCH, both needed (measured 2026-07-30): the workspace crumb's
	 * href is unreliable — on a list page Frappe emitted text "Home" with
	 * href "/desk/item" — so the slug lookup is only the fast path and the
	 * link's visible TEXT vs workspace titles is the fallback. Text matching
	 * is locale-tolerant here because workspace titles arrive in boot already
	 * in the user's locale, same as the crumb label Frappe renders from them.
	 */
	function decorate_crumbs() {
		const workspaces = (frappe.boot && frappe.boot.allowed_workspaces) || [];
		const slug = (name) =>
			frappe.router && frappe.router.slug
				? frappe.router.slug(name)
				: String(name).toLowerCase().replace(/ /g, "-");
		const by_slug = {};
		for (const w of workspaces) by_slug[slug(w.name)] = w;

		// The <ul> exists before Frappe fills it (measured — mount-time trails
		// are empty), so "trail found" is not success: keep retrying until a
		// workspace link resolves. Decoration is idempotent per trail and per
		// li, so the extra passes as content arrives cost nothing; the budget
		// bounds pages whose trail legitimately has no workspace link
		// (Desktop, bare singles) — those still get copy/icon passes.
		try_for(() => {
			const trails = document.querySelectorAll(".page-head .navbar-breadcrumbs");
			if (!trails.length) return false;
			const icon_mode = document.documentElement.getAttribute("data-bnd-crumb-icons") || "off";
			const want_copy = document.documentElement.hasAttribute("data-bnd-crumb-copy");
			let resolved = false;

			for (const trail of trails) {
				// 1. Resolution (always) — find the workspace crumb.
				let ws_link = null;
				let ws = null;
				for (const link of trail.querySelectorAll('li a[href^="/desk/"]')) {
					let hit = by_slug[link.getAttribute("href").split("/")[2]];
					if (!hit) {
						const text = link.textContent.trim().toLowerCase();
						hit = workspaces.find(
							(w) =>
								String(w.title || "").toLowerCase() === text ||
								String(w.name || "").toLowerCase() === text
						);
					}
					if (!hit) continue;
					ws_link = link;
					ws = hit;
					sb_current_workspace = ws;
					sb_update_head();
					resolved = true;
					break;
				}

				if (!crumb_active()) continue;

				// 2. Module chip(s), per the icon-scope option.
				if (icon_mode !== "off" && !trail.querySelector(".bnd-crumb-chip")) {
					if (ws_link && ws && ws.icon) {
						const chip = el("span", "bnd-crumb-chip");
						chip.appendChild(sprite_icon(ws_symbol(ws.icon)));
						ws_link.insertBefore(chip, ws_link.firstChild);
					} else if (sb_current_workspace && sb_current_workspace.icon) {
						// Workspace pages: the current workspace is the trail's
						// LAST crumb and often not a link at all — chip it via
						// the route-resolved workspace instead. Anchor FIRST,
						// explicitly: a comma list returns the first match in
						// DOCUMENT order, which is the li itself — and a chip
						// outside the anchor sits outside the pill styles
						// (caught by the item-11 visual sweep).
						const last =
							trail.querySelector("li:last-child a") ||
							trail.querySelector("li:last-child span") ||
							trail.querySelector("li:last-child");
						if (last) {
							const chip = el("span", "bnd-crumb-chip");
							chip.appendChild(sprite_icon(ws_symbol(sb_current_workspace.icon)));
							last.insertBefore(chip, last.firstChild);
						}
					}
				}
				if (icon_mode === "every") {
					// Best-effort icons for the remaining crumbs, inferred from
					// their text via the sidebar's hint table. No letter-chip
					// fallback here: an unmatched crumb (a document name) stays
					// text-only rather than gaining a meaningless initial.
					// Skips the first li (Frappe's own home icon) and anything
					// already chipped.
					const lis = trail.querySelectorAll("li");
					for (let i = 1; i < lis.length; i++) {
						const link = lis[i].querySelector("a");
						if (!link || lis[i].querySelector(".bnd-crumb-chip")) continue;
						const text = link.textContent.trim();
						if (!text) continue;
						let symbol = null;
						for (const [re, candidates] of SB_ICON_HINTS) {
							if (re.test(text)) {
								symbol = sb_existing_symbol(candidates);
								if (symbol) break;
							}
						}
						if (!symbol) continue;
						const chip = el("span", "bnd-crumb-chip");
						chip.appendChild(sprite_icon(symbol));
						link.insertBefore(chip, link.firstChild);
					}
				}

				// 3. Copy-link on the last crumb. Requires a real trail (two
				// or more crumbs) so the home-only bail state of tool pages
				// does not grow a button beside a lone home icon.
				if (want_copy && trail.children.length >= 2 && !trail.querySelector(".bnd-crumb-copy")) {
					const last = trail.querySelector("li:last-child");
					const btn = crumb_copy_button();
					if (last && btn) last.appendChild(btn);
				}
			}
			return resolved;
		}, 20);
	}

	/**
	 * Remove every node the kit injected into the trails. Used by live
	 * preview before re-decorating, so option flips (icons Every -> Off,
	 * copy on -> off) preview truthfully instead of accreting.
	 */
	function crumb_teardown() {
		for (const node of document.querySelectorAll(".bnd-crumb-chip, .bnd-crumb-copy")) node.remove();
	}

	// ════════════════════════════════════════════════════════════════════════
	// Command palette kit (item 12)
	// ════════════════════════════════════════════════════════════════════════
	//
	// FOUR STYLES, three of them Frappe's own modal:
	//   Original -> stock Ctrl+K modal, untouched (kit sets no attribute).
	//   Refined  -> stock modal, tagged `bnd-search-modal` so CSS can skin it.
	//   Bunood Palette / Palette Pro -> OUR shell (.bnd-palette), but every
	//   result comes from frappe.search.utils.* and executes with the stock
	//   select semantics — "we own the shell, Frappe owns every behaviour",
	//   the avatar-menu precedent. If any of those APIs is missing (upgrade),
	//   invocation falls back to opening the native modal: never a dead
	//   Ctrl+K, never a broken search.
	//
	// FRECENCY: per-user, SERVER-side (frappe.defaults via api.py), per the
	// item-31 rule — localStorage would make ranking per-browser. The boot
	// blob is merged in memory on every use and pushed with one small xcall.

	/** Palette label -> attribute slug. Original/unknown -> no attribute. */
	const PAL_SLUGS = { "Original": "", "Refined": "refined", "Bunood Palette": "palette", "Palette Pro": "pro" };

	/**
	 * The palette options in effect — boot's at load, replaced by live
	 * preview. An old cached boot may still deliver the pre-0.8 integer
	 * flag; anything non-object means "kit down" and everything fails open.
	 */
	let pal_state =
		window.frappe && frappe.boot && typeof frappe.boot.bnd_palette === "object"
			? frappe.boot.bnd_palette
			: null;

	/** Reflect the palette style onto <html>; clears first, wholly derived. */
	function apply_palette_attrs(p) {
		const html = document.documentElement;
		html.removeAttribute("data-bnd-palette");
		if (!p) return;
		pal_state = p;
		const slug = PAL_SLUGS[p.style];
		if (slug) html.setAttribute("data-bnd-palette", slug);
	}

	apply_palette_attrs(pal_state);

	/** True when OUR shell owns invocation (palette/pro styles). */
	function pal_shell_active() {
		const slug = document.documentElement.getAttribute("data-bnd-palette");
		return slug === "palette" || slug === "pro";
	}

	/**
	 * Open search — the single entry point every invoker routes through
	 * (theme field click, Ctrl+K, intercepted native row). Decides at CALL
	 * time so live preview needs no re-wiring: our shell when active and
	 * buildable, otherwise the native modal (Refined additionally tags it
	 * for the CSS skin).
	 */
	function pal_invoke() {
		if (pal_shell_active() && frappe.search && frappe.search.utils) {
			pal_open();
			return;
		}
		// Original / Refined must behave EXACTLY like stock ctrl+k, and stock
		// ctrl+k is this function — it hides an open Global Search dialog and
		// carries its keywords into the awesomebar. A bare proxy_click skips
		// both (release review v0.7.0..HEAD measured the dialog left open
		// behind the modal). Call Frappe's own function; proxy only if the
		// name is gone in a future version.
		if (frappe.search && typeof frappe.search.open_awesomebar_from_global_search_shortcut === "function") {
			frappe.search.open_awesomebar_from_global_search_shortcut();
		} else {
			proxy_click(".navbar-search-bar .item-anchor");
		}
		if (document.documentElement.getAttribute("data-bnd-palette") === "refined") {
			// The native modal is built lazily on first open; tag it once so
			// _palette.scss can skin it without :has().
			try_for(() => {
				const input = document.getElementById("navbar-search");
				const modal = input && input.closest(".modal");
				if (!modal) return false;
				modal.classList.add("bnd-search-modal");
				return true;
			}, 10);
		}
	}

	// ── Frecency ────────────────────────────────────────────────────────────

	/** Half-life of a use, in days: two weeks keeps last week's work warm. */
	const PAL_HALFLIFE_DAYS = 14;

	/**
	 * The learned boost for one option key: decayed use count, scaled to
	 * compete with (not drown) the source indices Frappe assigns (~20-100).
	 * @param {string} key
	 * @returns {number}
	 */
	function pal_frecency(key) {
		if (!pal_state || !parseInt(pal_state.frecency, 10)) return 0;
		const entry = pal_state.usage && pal_state.usage[key];
		if (!entry) return 0;
		const age_days = Math.max(0, (Date.now() / 1000 - (entry[1] || 0)) / 86400);
		return Math.min(120, 30 * (entry[0] || 0) * Math.pow(0.5, age_days / PAL_HALFLIFE_DAYS));
	}

	/** Uses recorded since the last server flush. */
	let pal_pending_uses = [];

	/** Timestamp of the last flush, for the throttle window. */
	let pal_flushed_at = 0;

	/** Throttle window between server writes, ms. */
	const PAL_FLUSH_EVERY = 90 * 1000;

	/**
	 * Push pending uses to the server in ONE batched write. Throttled hard:
	 * frappe.defaults.set_default clears the user's whole cache on every
	 * write (verified in the release review), so a write per palette
	 * execution would rebuild boot on every navigation. In-session ranking
	 * freshness never depends on this — the in-memory blob is merged
	 * immediately; the server copy only matters across sessions.
	 * @param {boolean} force - flush regardless of the throttle window.
	 */
	function pal_flush_uses(force) {
		if (!pal_pending_uses.length || !frappe.xcall) return;
		if (!force && Date.now() - pal_flushed_at < PAL_FLUSH_EVERY) return;
		const keys = pal_pending_uses;
		pal_pending_uses = [];
		pal_flushed_at = Date.now();
		frappe.xcall("bunood_theme.api.record_palette_use", { keys: JSON.stringify(keys) }).catch(() => {
			// Lost uses only soften ranking — never re-queue into a loop.
		});
	}

	// Flush the tail when the tab hides; best-effort by design.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") pal_flush_uses(true);
	});

	/** Merge one use into the in-memory blob and queue the server write. */
	function pal_record_use(key) {
		if (!pal_state || !parseInt(pal_state.frecency, 10) || !key) return;
		pal_state.usage = pal_state.usage || {};
		const entry = pal_state.usage[key] || [0, 0];
		pal_state.usage[key] = [entry[0] + 1, Math.floor(Date.now() / 1000)];
		pal_pending_uses.push(key);
		pal_flush_uses(false);
	}

	/**
	 * Render the full-page inbox into a container (the "Inbox + Page" style;
	 * called by bunood_theme/page/bnd_inbox/bnd_inbox.js). Shares every row
	 * class and action with the panel — one renderer, two surfaces — and
	 * adds the detail pane the panel has no room for.
	 * @param {HTMLElement} container - the page's main element.
	 */
	bunood.inbox_render_page = function (container) {
		if (!container) return;
		container.innerHTML = "";
		const frame = el("div", "bnd-inbox-page");
		const left = el("div", "bnd-inbox-page-list");
		// role="group" of aria-pressed toggles, not role="tablist" (item 22):
		// what these filter is a role="listbox" a few lines down, which
		// cannot ALSO be a tabpanel, and a tablist promises arrow-key
		// movement that inbox_keydown already owns here for row triage —
		// two arrow contracts in one dialog is the two-options-one-pixel
		// defect in keyboard form. aria-pressed is this codebase's existing
		// idiom for "an option chip that says its own selection".
		const tabs = el("div", "bnd-inbox-tabs", { role: "group", "aria-label": __("Filter") });
		for (const tab of INBOX_TABS) {
			const btn = el("button", "bnd-inbox-tab", { type: "button", "aria-pressed": "false", "data-tab": tab.id });
			btn.textContent = tab.label();
			btn.addEventListener("click", () => {
				inbox_tab = tab.id;
				load();
			});
			tabs.appendChild(btn);
		}
		left.appendChild(tabs);
		const list = el("div", "bnd-inbox-list", { role: "listbox", tabindex: "0" });
		left.appendChild(list);
		frame.appendChild(left);

		const detail = el("div", "bnd-inbox-page-detail");
		frame.appendChild(detail);
		container.appendChild(frame);

		/** Paint the detail pane for the highlighted row. */
		function show_detail() {
			const row = inbox_flat[inbox_cursor];
			detail.innerHTML = "";
			if (!row) {
				// aria-hidden like its Loading sibling: the message is visual, the
			// list's own label and the status live region carry the state, and
			// a listbox whose only child is prose fails required-children —
			// found by the scoped axe scan on the caught-up resting state.
			const empty = el("div", "bnd-inbox-empty", { "aria-hidden": "true" });
				empty.textContent = __("Select a notification");
				detail.appendChild(empty);
				return;
			}
			const title = el("div", "bnd-inbox-detail-title");
			title.textContent = row.document_name || __("Notification");
			detail.appendChild(title);
			const meta = el("div", "bnd-inbox-detail-meta");
			const subject = el("div");
			subject.innerHTML = row.subject || "";
			meta.appendChild(subject);
			// Plain facts as TEXT, the timestamp as MARKUP — comment_when
			// returns a live <span class="frappe-timestamp">, so the two
			// cannot share one assignment.
			const facts = [];
			if (row.document_type) facts.push(__(row.document_type));
			if (row.from_user) facts.push(row.from_user);
			if (facts.length) {
				const line = el("div");
				line.textContent = facts.join(" · ");
				meta.appendChild(line);
			}
			const detail_when = inbox_when(row);
			if (detail_when) {
				const line = el("div");
				line.innerHTML = detail_when;
				meta.appendChild(line);
			}
			detail.appendChild(meta);

			const actions = el("div", "bnd-inbox-detail-actions");
			const open_btn = el("button", "bnd-inbox-btn bnd-inbox-btn-primary", { type: "button" });
			open_btn.textContent = __("Open");
			open_btn.addEventListener("click", () => inbox_open(row));
			actions.appendChild(open_btn);
			const done_btn = el("button", "bnd-inbox-btn", { type: "button" });
			done_btn.textContent = inbox_done.has(row.name) ? __("Not done") : __("Done");
			done_btn.addEventListener("click", () => {
				const node = list.querySelector('.bnd-inbox-row[data-idx="' + inbox_cursor + '"]');
				inbox_mark_read(row, node);
				inbox_toggle_done(row);
				if (node) node.classList.toggle("bnd-inbox-done", inbox_done.has(row.name));
				// Triage loop: acting advances, exactly like the `e` key.
				inbox_highlight(inbox_cursor + 1, list);
				show_detail();
			});
			actions.appendChild(done_btn);
			detail.appendChild(actions);
		}

		/** Load the active tab into the page list. */
		function load() {
			for (const btn of tabs.querySelectorAll(".bnd-inbox-tab")) {
				const tab_on = btn.getAttribute("data-tab") === inbox_tab;
				btn.classList.toggle("bnd-inbox-tab-on", tab_on);
				// The class styles; the attribute SAYS which filter is on.
				btn.setAttribute("aria-pressed", tab_on ? "true" : "false");
			}
			list.innerHTML = "";
			const loading = el("div", "bnd-inbox-empty", { "aria-hidden": "true", "data-bnd-loading": "" });
			loading.textContent = __("Loading...");
			list.appendChild(loading);
			inbox_fetch(inbox_tab, 0).then((res) => {
				inbox_unread = (res && parseInt(res.unread, 10)) || 0;
				inbox_action_unread = (res && parseInt(res.action, 10)) || 0;
				inbox_paint_badge();
				inbox_render_rows(list, (res && res.rows) || []);
				inbox_highlight(0, list);
				show_detail();
			});
		}

		// Selection follows the pointer and the keys; the detail pane
		// follows the selection.
		list.addEventListener("mousemove", (ev) => {
			const row = ev.target.closest && ev.target.closest(".bnd-inbox-row");
			if (!row) return;
			const idx = parseInt(row.getAttribute("data-idx"), 10);
			if (idx !== inbox_cursor) {
				inbox_highlight(idx, list);
				show_detail();
			}
		});
		list.addEventListener("keydown", (ev) => {
			inbox_keydown(ev, list, null);
			show_detail();
		});
		list.focus();
		inbox_tab = "unread";
		load();
	};

	/**
	 * LIVE PREVIEW for the notification kit: re-derive the attribute, drop
	 * the built panel so flag changes rebuild on next open, repaint the
	 * badge. Boot shape and field shape both accepted.
	 * @param {Object} values
	 */
	bunood.inbox_apply = function (values) {
		if (!values) return;
		const v = (field, key) => values[field] ?? values[key] ?? (inbox_state ? inbox_state[key] : undefined);
		apply_inbox_attrs({
			style: v("inbox_style", "style"),
			badge: v("inbox_badge", "badge"),
			arrival: v("inbox_arrival", "arrival"),
			group: v("inbox_group", "group"),
			chips: v("inbox_chips", "chips"),
			row_actions: v("inbox_row_actions", "row_actions"),
			keyboard: v("inbox_keyboard", "keyboard"),
			unread: inbox_unread,
			done: [...inbox_done],
		});
		if (inbox_nodes) {
			inbox_nodes.backdrop.remove();
			inbox_nodes = null;
		}
		inbox_paint_badge();
	};

	/** Forget the in-memory usage blob (the picker's reset presses this). */
	bunood.palette_forget_usage = function () {
		if (pal_state) pal_state.usage = {};
		pal_pending_uses = [];
	};

	// ── Sources ─────────────────────────────────────────────────────────────

	/**
	 * Species metadata: group title, badge, sprite candidates for row icons.
	 * The candidate lists dropped four ids that exist in NO sprite this Frappe
	 * ships (verified live: `es-line-list`, `icon-unordered-list`,
	 * `es-line-graph`, `es-line-file`) — each sat behind an `icon-*` that always
	 * won, so they were pure dead weight, never the reason a row lost its icon.
	 * `es-line-add` stays: it exists and is a real (if shadowed) fallback, now
	 * that sprite_icon gives the es-* family its correct fill polarity.
	 */
	const PAL_SPECIES = {
		action: { title: () => __("Actions"), badge: () => __("Action"), icons: ["icon-add", "es-line-add", "icon-small-add"] },
		navigate: { title: () => __("Navigate"), badge: () => __("List"), icons: ["icon-list"] },
		report: { title: () => __("Reports"), badge: () => __("Report"), icons: ["icon-chart", "icon-table"] },
		page: { title: () => __("Pages & Workspaces"), badge: () => __("Page"), icons: ["icon-file", "icon-small-file"] },
		doc: { title: () => __("Documents"), badge: () => __("Document"), icons: ["icon-file", "icon-small-file"] },
		frequent: { title: () => __("Frequent"), badge: () => "", icons: [] },
		recent: { title: () => __("Recent"), badge: () => "", icons: [] },
		fallback: { title: () => "", badge: () => "", icons: [] },
	};

	/** A stable frecency key for a sourced option. */
	function pal_key(opt) {
		if (opt.route) return "route:" + (Array.isArray(opt.route) ? opt.route.join("/") : String(opt.route));
		return "label:" + (opt.value || opt.label || "");
	}

	/**
	 * Map one frappe.search.utils option into a palette row model. The
	 * marked label (match highlighting) comes from Frappe's own fuzzy_search
	 * so the palette shows the same "why it matched" the stock bar would.
	 */
	function pal_row(opt, species, txt) {
		let marked = opt.label || opt.value || "";
		if (txt && frappe.search.utils.fuzzy_search) {
			const scored = frappe.search.utils.fuzzy_search(txt, opt.value || "", true);
			if (scored && scored.marked_string) marked = scored.marked_string;
		}
		const plain = opt.value || opt.label || "";
		// The badge names what Enter does, so a "X Report" or "X Tree" row
		// must not wear the generic List badge of its species. Match on the
		// UNTRANSLATED opt.type Frappe supplies — the value string is
		// translated ("New X" is Arabic on Arabic sessions) and a regex on
		// it silently misgroups there (release review v0.7.0..HEAD). The
		// regex stays as the fallback for sources that omit type.
		let badge_override = null;
		if (species === "navigate") {
			if (opt.type) {
				// Trust the type ALONE when present. Keeping the regex as an
				// `||` fallback re-created the bug it was meant to fix: on
				// Arabic, "{0} List" translates to "قائمة {0}" (placeholder
				// LAST) with the doctype name untranslated, so the List row
				// of the core "Report" doctype reads "قائمة Report" and the
				// regex badged it "تقرير" — a row whose Enter opens a list.
				if (opt.type === "Report") badge_override = __("Report");
				else if (opt.type === "Tree") badge_override = __("Tree");
			} else if (/\bReport$/.test(plain)) {
				badge_override = __("Report");
			} else if (/\bTree$/.test(plain)) {
				badge_override = __("Tree");
			}
		}
		return {
			species,
			marked,
			plain,
			badge_override,
			route: opt.route,
			route_options: opt.route_options,
			onclick: opt.onclick,
			icon_data: opt.icon_data,
			match: opt.match,
			index: (opt.index || 0) + pal_frecency(pal_key(opt)),
			key: pal_key(opt),
			// Frappe's UNTRANSLATED discriminator ("List" | "New" | "Report" |
			// "Tree"). Carried through so a row can be identified by what it
			// DOES rather than by what it reads — see pal_row_el. It is the
			// same field the badge_override above already trusts for exactly
			// that reason, so this exposes a fact the model was using anyway.
			type: opt.type || null,
		};
	}

	/** Safely call one source; a missing/throwing source contributes nothing. */
	function pal_source(name, txt) {
		try {
			const fn = frappe.search.utils[name];
			return fn ? fn.call(frappe.search.utils, txt) || [] : [];
		} catch (e) {
			return [];
		}
	}

	/**
	 * Assemble the grouped row model for a query. Groups keep a FIXED order
	 * (positional memory beats cleverness); rows sort by boosted index
	 * within their group; every group is capped so no species floods the
	 * palette the way broad queries flood the stock bar's flat list.
	 */
	function pal_options(txt) {
		const pro = document.documentElement.getAttribute("data-bnd-palette") === "pro";
		const sigils = pro && parseInt(pal_state.sigils, 10);
		const groups = [];
		const push = (species, rows, cap) => {
			rows = rows.filter(Boolean).sort((a, b) => b.index - a.index).slice(0, cap);
			if (rows.length) groups.push({ species, rows });
		};

		if (!txt) {
			if (!parseInt(pal_state.suggest, 10)) return groups;
			// Cap FIRST, dedupe against the survivors only: get_frequent_links
			// falls back to get_recent_pages when boot frequents are empty
			// (identical keys), and a dedupe that runs before the cap would
			// consume every key and leave Recent permanently empty (release
			// review v0.7.0..HEAD). pal_row already added the frecency boost
			// — no second pass, or the documented cap doubles.
			// Dedupe WITHIN each group as well as across: frappe.route_history
			// is appended per navigation with no dedupe, so revisiting a list
			// twice would otherwise render it twice and eat the cap.
			const uniq = (rows) => {
				const seen = new Set();
				return rows.filter((r) => !seen.has(r.key) && seen.add(r.key));
			};
			// Dedupe by what the row READS too, not only by where it goes:
			// get_frequent_links labels both List/ToDo/Calendar/default and
			// List/ToDo/List "ToDo List" (measured), so distinct keys render
			// identical words and the pick is a coin toss. Higher count wins; the
			// other route is still reachable by typing. Naming the view instead
			// would need a vocabulary these options do not carry. HANDOVER §4 has
			// the measurement. Words come from the capped SURVIVORS, never the
			// pre-cap list — the key trap above, one field over.
			const reads = (r) => String(r.plain || "").replace(/<[^>]*>/g, "").trim();
			const unseen = (words) => (r) => {
				const t = reads(r);
				return !t || (!words.has(t) && words.add(t));
			};
			const frequents = uniq(pal_source("get_frequent_links", "").map((o) => pal_row(o, "frequent", "")))
				.sort((a, b) => b.index - a.index)
				.filter(unseen(new Set()))
				.slice(0, 5);
			const kept = new Set(frequents.map((r) => r.key));
			const shown = new Set(frequents.map(reads));
			const recents = uniq(pal_source("get_recent_pages", "").map((o) => pal_row(o, "recent", "")))
				.filter((r) => !kept.has(r.key))
				.sort((a, b) => b.index - a.index)
				.filter(unseen(shown))
				.slice(0, 7);
			if (frequents.length) groups.push({ species: "frequent", rows: frequents });
			if (recents.length) groups.push({ species: "recent", rows: recents });
			return groups;
		}

		// Mode sigils (Pro): a leading character narrows to one species.
		if (sigils && txt[0] === ">") {
			const q = txt.slice(1).trim();
			push("action", [
				...pal_source("get_creatables", q).map((o) => pal_row(o, "action", q)),
				...pal_source("get_executables", q).map((o) => pal_row(o, "action", q)),
			], 20);
			return groups;
		}
		if (sigils && txt[0] === "/") {
			const q = txt.slice(1).trim();
			push("report", pal_source("get_reports", q).map((o) => pal_row(o, "report", q)), 20);
			return groups;
		}
		if (sigils && txt[0] === "#") {
			// Record search renders asynchronously — pal_render_docs fills
			// the Documents group when the server answers.
			return groups;
		}

		// get_creatables only fires on a "new " prefix; the everyday "New X"
		// rows ride inside get_doctypes — split them out into Actions here,
		// or creation would vanish from plain queries (caught by the item-12
		// visual sweep).
		const doctype_rows = pal_source("get_doctypes", txt);
		// Type alone when present; the regex only covers sources that omit
		// it — the value string is translated. See pal_row.
		const is_new = (o) => (o.type !== undefined ? o.type === "New" : /^New /.test(o.value || o.label || ""));
		push("action", [
			...pal_source("get_creatables", txt).map((o) => pal_row(o, "action", txt)),
			...doctype_rows.filter(is_new).map((o) => pal_row(o, "action", txt)),
			...pal_source("get_executables", txt).map((o) => pal_row(o, "action", txt)),
		], 4);
		push("navigate", [
			...doctype_rows.filter((o) => !is_new(o)).map((o) => pal_row(o, "navigate", txt)),
			...pal_source("get_search_in_list", txt).map((o) => pal_row(o, "navigate", txt)),
		], 8);
		push("report", pal_source("get_reports", txt).map((o) => pal_row(o, "report", txt)), 4);
		push("page", [
			...pal_source("get_pages", txt).map((o) => pal_row(o, "page", txt)),
			...pal_source("get_desktop_icons", txt).map((o) => pal_row(o, "page", txt)),
			...pal_source("get_dashboards", txt).map((o) => pal_row(o, "page", txt)),
		], 4);
		return groups;
	}

	/**
	 * The pinned fallback rows: never ranked, never pushed out — fixing the
	 * stock bar's worst measured weakness (99 fuzzy rows burying "Search
	 * for X"). Calculator included: same convenience as stock, but behind a
	 * strict arithmetic whitelist instead of a raw eval.
	 */
	function pal_fallbacks(txt) {
		const rows = [];
		if (!txt || !parseInt(pal_state.fallbacks, 10)) return rows;
		// Under a Pro sigil the hand-off query is the part AFTER the sigil —
		// "Search all documents for '#test'" would search for a literal hash.
		const pro = document.documentElement.getAttribute("data-bnd-palette") === "pro";
		if (pro && parseInt(pal_state.sigils, 10) && /^[>#/]/.test(txt)) {
			txt = txt.slice(1).trim();
			if (!txt) return rows;
		}
		if (/^[0-9+\-*/(). %]+$/.test(txt) && /[0-9]/.test(txt)) {
			try {
				const result = Function('"use strict"; return (' + txt + ")")();
				if (typeof result === "number" && isFinite(result)) {
					rows.push({
						species: "fallback",
						marked: frappe.utils.escape_html(txt + " = " + result),
						plain: String(result),
						onclick: () => {
							if (navigator.clipboard && navigator.clipboard.writeText) {
								navigator.clipboard.writeText(String(result)).catch(() => {});
							}
						},
						key: "",
						index: 0,
					});
				}
			} catch (e) {
				/* not arithmetic after all — no row */
			}
		}
		// Global search hand-off: proxy to Frappe's own full-text dialog.
		if (frappe.searchdialog && frappe.searchdialog.search) {
			rows.push({
				species: "fallback",
				// Typographic quotes, not escaped ASCII ones. Every regex-based
				// message extractor — Frappe's TRANSLATE_PATTERN and ours alike —
				// stops at the first quote character it sees, so \" split this
				// msgid in half: the catalogue carried `Search all documents for \`
				// while the runtime looked up the full string, which therefore
				// could never be translated. “ ” need no escaping, so the
				// extracted msgid and the runtime key agree again.
				marked: frappe.utils.escape_html(__("Search all documents for “{0}”", [txt])),
				plain: txt,
				onclick: () => frappe.searchdialog.search.init_search(txt, "global_search"),
				key: "",
				index: 0,
			});
		}
		return rows;
	}

	// ── Shell ───────────────────────────────────────────────────────────────

	/** Built-once overlay nodes; destroyed by live preview to rebuild flags. */
	let pal_nodes = null;

	/** Debounce handle for the Pro record-search stage. */
	let pal_docs_timer = null;

	/** Build the overlay skeleton (backdrop, input, list, footer). */
	function pal_build() {
		const backdrop = el("div", "bnd-palette-backdrop", { hidden: "" });
		const shell = el("div", "bnd-palette", { role: "dialog", "aria-modal": "true", "aria-label": __("Command palette") });
		const head = el("div", "bnd-palette-head");
		head.appendChild(sprite_icon(sb_existing_symbol(["icon-search", "es-line-search"]) || "icon-search"));
		// COMBOBOX WIRING (34a). The visual pattern was always "editable field
		// drives a listbox"; the attributes now say so. Focus stays on the
		// input for the palette's whole life — the active option is conveyed
		// by aria-activedescendant, which pal_highlight maintains, so a screen
		// reader hears the selection move while the caret never leaves the
		// query. That is the W3C combobox pattern, not a simplification of it.
		const input = el("input", "bnd-palette-input", {
			type: "text",
			placeholder: __("Search or type a command"),
			"aria-label": __("Search"),
			spellcheck: "false",
			role: "combobox",
			"aria-expanded": "true",
			"aria-controls": "bnd-pal-list",
			"aria-autocomplete": "list",
			"aria-describedby": "bnd-pal-footer",
		});
		head.appendChild(input);
		shell.appendChild(head);
		const list = el("div", "bnd-palette-list", { role: "listbox", id: "bnd-pal-list", "aria-label": __("Results") });
		shell.appendChild(list);
		// The result count, announced. Polite: a keystroke's count should never
		// interrupt the input echo that matters more.
		const status = el("div", "bnd-palette-status bnd-visually-hidden", { role: "status", "aria-live": "polite" });
		shell.appendChild(status);
		let footer = null;
		if (parseInt(pal_state.footer, 10)) {
			footer = el("div", "bnd-palette-footer", { id: "bnd-pal-footer" });
			shell.appendChild(footer);
		}
		backdrop.appendChild(shell);
		document.body.appendChild(backdrop);

		backdrop.addEventListener("mousedown", (ev) => {
			if (ev.target === backdrop) pal_close();
		});
		input.addEventListener("input", () => pal_render(input.value.trim()));
		input.addEventListener("keydown", pal_keydown);
		// aria-modal promises the desk is inert while the palette is up, and
		// the input is the dialog's only tabbable — so Tab has nowhere honest
		// to go. Trapping it on the SHELL (capture on the dialog, not the
		// input) keeps the promise even if focus ever lands elsewhere inside.
		shell.addEventListener("keydown", (ev) => {
			if (ev.key === "Tab") {
				ev.preventDefault();
				input.focus();
			} else if (ev.key === "Escape" && ev.target !== input) {
				// Esc must work wherever focus sits inside the dialog, not
				// only in the input — pal_keydown is input-bound.
				ev.preventDefault();
				ev.stopPropagation();
				pal_close();
			}
		});
		pal_nodes = { backdrop, shell, input, list, footer, status };
	}

	/** Rows currently rendered, flat, for keyboard traversal. */
	let pal_flat = [];
	let pal_cursor = 0;

	/** Render the footer hints for the current mode. */
	function pal_footer_hints() {
		if (!pal_nodes.footer) return;
		const pro = document.documentElement.getAttribute("data-bnd-palette") === "pro";
		const sigils = pro && parseInt(pal_state.sigils, 10);
		const bits = [];
		if (sigils) bits.push("<span>&gt; " + __("actions") + "</span><span># " + __("documents") + "</span><span>/ " + __("reports") + "</span>");
		bits.push("<span>↑↓ " + __("navigate") + "</span>");
		bits.push("<span>↵ " + __("open") + "</span>");
		if (parseInt(pal_state.newtab, 10)) bits.push("<span>Ctrl↵ " + __("new tab") + "</span>");
		bits.push('<span class="bnd-palette-footer-end">esc ' + __("close") + "</span>");
		pal_nodes.footer.innerHTML = bits.join("");
	}

	/**
	 * Render one row element.
	 *
	 * IDENTITY IS STAMPED, NOT READ OFF THE LABEL. `data-bnd-key` is the same
	 * stable frecency key the server already stores ("route:List/Item"),
	 * `data-bnd-species` is the group, and `data-bnd-type` is Frappe's own
	 * untranslated discriminator. None of the three moves when the desk
	 * changes language.
	 *
	 * The label cannot serve this purpose and never could: `row.marked` is
	 * `__()`-translated AND carries <mark> tags from fuzzy_search, so matching
	 * on it is matching on a rendering. That mistake is already recorded twice
	 * in this file — the badge regex that read "قائمة Report" and badged a list
	 * row as a report (see pal_row) — and a third copy of it sat in the smoke
	 * suite, where four assertions matched "Item List"/"New Item" and one of
	 * them DROVE A CLICK, so an Arabic run threw instead of failing.
	 *
	 * "New" rows are the reason `type` is stamped separately: they carry no
	 * route, so their key falls back to `label:<translated value>`. `type` is
	 * the only untranslated handle they have.
	 */
	function pal_row_el(row, flat_index) {
		const attrs = {
			role: "option",
			id: "bnd-pal-opt-" + flat_index,
			"aria-selected": "false",
			"data-idx": String(flat_index),
			// `|| ""` because the fallback rows are hand-built rather than
			// produced by pal_row(), and the calculator one carries no key.
			"data-bnd-key": row.key || "",
			"data-bnd-species": row.species,
		};
		// Conditional because el() setAttribute's whatever it is given, and an
		// absent type would stamp the literal string "undefined".
		if (row.type) attrs["data-bnd-type"] = row.type;
		const item = el("div", "bnd-palette-row", attrs);
		const species = PAL_SPECIES[row.species];
		const symbol = species.icons.length ? sb_existing_symbol(species.icons) : null;
		if (symbol) {
			const ic = el("span", "bnd-palette-row-icon");
			ic.appendChild(sprite_icon(symbol));
			item.appendChild(ic);
		}
		const label = el("span", "bnd-palette-row-label");
		label.innerHTML = row.marked; // frappe's own marked_string; stock renders it the same way
		item.appendChild(label);
		const badge_text = row.badge_override || species.badge();
		if (badge_text) {
			const badge = el("span", "bnd-palette-row-badge");
			badge.textContent = badge_text;
			item.appendChild(badge);
		}
		item.addEventListener("mousemove", () => pal_highlight(flat_index));
		item.addEventListener("mousedown", (ev) => {
			ev.preventDefault();
			pal_execute(row, ev.ctrlKey || ev.metaKey);
		});
		// Click too: assistive tech that synthesises activation sends a plain
		// click, not the mousedown the pointer path uses. Idempotent — the
		// mousedown's preventDefault means a real pointer never fires both.
		item.addEventListener("click", (ev) => {
			ev.preventDefault();
			pal_execute(row, ev.ctrlKey || ev.metaKey);
		});
		return item;
	}

	/** Move the highlight (wrap-around) and sync aria + scroll. */
	function pal_highlight(index) {
		if (!pal_flat.length) return;
		pal_cursor = ((index % pal_flat.length) + pal_flat.length) % pal_flat.length;
		const rows = pal_nodes.list.querySelectorAll(".bnd-palette-row");
		// Explicit "false", never absent: with a listbox the unstated case is
		// undefined behaviour across screen readers, and the attribute is the
		// contract the suite now asserts.
		rows.forEach((node) => node.setAttribute("aria-selected", "false"));
		const active = pal_nodes.list.querySelector('.bnd-palette-row[data-idx="' + pal_cursor + '"]');
		if (active) {
			active.setAttribute("aria-selected", "true");
			// The combobox pattern's moving part: focus stays in the input and
			// this attribute tells AT which option is current.
			pal_nodes.input.setAttribute("aria-activedescendant", active.id);
			active.scrollIntoView({ block: "nearest" });
		} else {
			pal_nodes.input.removeAttribute("aria-activedescendant");
		}
	}

	/** Full list render for a query. */
	function pal_render(txt) {
		const groups = pal_options(txt);
		const fallbacks = pal_fallbacks(txt);
		pal_flat = [];
		pal_nodes.list.innerHTML = "";
		for (const group of groups) {
			const species = PAL_SPECIES[group.species];
			if (species.title()) {
				// aria-hidden: a listbox may contain only options, and the
				// species is already on every row as data + badge text. The
				// heading is visual grouping, not unique information.
				const heading = el("div", "bnd-palette-group", { "aria-hidden": "true" });
				heading.textContent = species.title();
				pal_nodes.list.appendChild(heading);
			}
			for (const row of group.rows) {
				pal_nodes.list.appendChild(pal_row_el(row, pal_flat.length));
				pal_flat.push(row);
			}
		}
		if (fallbacks.length) {
			const divider = el("div", "bnd-palette-divider", { "aria-hidden": "true" });
			pal_nodes.list.appendChild(divider);
			for (const row of fallbacks) {
				pal_nodes.list.appendChild(pal_row_el(row, pal_flat.length));
				pal_flat.push(row);
			}
		}
		if (!pal_flat.length && txt) {
			const empty = el("div", "bnd-palette-empty");
			empty.textContent = __("No matches");
			pal_nodes.list.appendChild(empty);
		}
		pal_highlight(0);
		if (pal_nodes.status) {
			pal_nodes.status.textContent = pal_flat.length
				? __("Results: {0}", [pal_flat.length])
				: txt
					? __("No matches")
					: "";
		}
		pal_footer_hints();

		// Pro record-search stage: '#query' or any plain query of 3+ chars
		// appends a Documents group when the (debounced) server answers.
		// NEVER under '>' or '/': those sigils narrow to ONE species, and a
		// global search for the literal sigil string would bolt a Documents
		// group under the narrowed view (release review v0.7.0..HEAD).
		const pro = document.documentElement.getAttribute("data-bnd-palette") === "pro";
		const sigil_on = pro && parseInt(pal_state.sigils, 10);
		const hash = sigil_on && txt[0] === "#";
		const other_sigil = sigil_on && (txt[0] === ">" || txt[0] === "/");
		const record_q = hash ? txt.slice(1).trim() : txt;
		clearTimeout(pal_docs_timer);
		if (pro && !other_sigil && record_q.length >= 3 && frappe.search.utils.get_global_results) {
			pal_docs_timer = setTimeout(() => pal_render_docs(record_q, txt), 260);
		}
	}

	/**
	 * Append the async Documents group (Pro). Ignored if the query moved on
	 * — the palette must never show results for a stale keystroke.
	 */
	function pal_render_docs(record_q, typed) {
		frappe.search.utils
			.get_global_results(record_q, 0, 12)
			.then((sets) => {
				if (!pal_nodes || pal_nodes.input.value.trim() !== typed) return;
				const rows = [];
				for (const set of sets || []) {
					for (const opt of (set && set.results) || []) {
						rows.push({
							species: "doc",
							marked: frappe.utils.escape_html(opt.label || opt.value || ""),
							plain: opt.value || "",
							route: opt.route,
							key: pal_key(opt),
							index: 0,
							badge_override: set.title,
						});
					}
				}
				if (!rows.length) return;
				const heading = el("div", "bnd-palette-group");
				heading.textContent = PAL_SPECIES.doc.title();
				pal_nodes.list.appendChild(heading);
				for (const row of rows.slice(0, 12)) {
					const node = pal_row_el(row, pal_flat.length);
					if (row.badge_override) {
						const badge = node.querySelector(".bnd-palette-row-badge");
						if (badge) badge.textContent = row.badge_override;
					}
					pal_nodes.list.appendChild(node);
					pal_flat.push(row);
				}
			})
			.catch(() => {});
	}

	/**
	 * Execute a row with the stock awesomebar's select semantics
	 * (awesome_bar.js:209-234), plus the frecency write.
	 */
	function pal_execute(row, new_tab) {
		pal_record_use(row.key);
		pal_close();
		if (row.route_options) frappe.route_options = row.route_options;
		if (row.onclick) {
			row.onclick(row.match);
			return;
		}
		if (row.icon_data && frappe.utils.get_route_for_icon) {
			frappe.route_options = { sidebar: row.icon_data.label };
			frappe.set_route(frappe.utils.get_route_for_icon(row.icon_data));
			return;
		}
		if (!row.route) return;
		const route = Array.isArray(row.route) ? row.route : [row.route];
		if (String(route[0]).startsWith("https://")) {
			window.open(route[0], "_blank");
			return;
		}
		if (new_tab && parseInt(pal_state.newtab, 10)) {
			frappe.open_in_new_tab = true;
		}
		frappe.set_route(route);
	}

	/** Keyboard model: wrap-around arrows, two-stage Esc, Ctrl+Enter. */
	function pal_keydown(ev) {
		if (ev.key === "ArrowDown") {
			ev.preventDefault();
			pal_highlight(pal_cursor + 1);
		} else if (ev.key === "ArrowUp") {
			ev.preventDefault();
			pal_highlight(pal_cursor - 1);
		} else if (ev.key === "Enter") {
			ev.preventDefault();
			const row = pal_flat[pal_cursor];
			if (row) pal_execute(row, ev.ctrlKey || ev.metaKey);
		} else if (ev.key === "Escape") {
			ev.preventDefault();
			// AND stop it: this Escape is the dialog's. Left to bubble, Frappe's
			// document-level Escape handling runs after our close and blurs the
			// focus the restore just placed — measured 2026-08-09, focus landing
			// on <body> with the restore demonstrably having run.
			ev.stopPropagation();
			if (pal_nodes.input.value) {
				pal_nodes.input.value = "";
				pal_render("");
			} else {
				pal_close();
			}
		}
	}

	/**
	 * Open (building lazily), reset to the empty state, focus. Guarded and
	 * toggling like the stock binding: a second Ctrl+K closes, an open
	 * Global Search dialog is handed off (hidden) first, and a missing
	 * search API degrades to the native modal — never a throw after our
	 * capture handler already suppressed Frappe's own handler.
	 */
	function pal_open() {
		if (!(frappe.search && frappe.search.utils)) {
			proxy_click(".navbar-search-bar .item-anchor");
			return;
		}
		if (pal_nodes && !pal_nodes.backdrop.hasAttribute("hidden")) {
			pal_close();
			return;
		}
		// Stock ctrl+k closes an open Global Search dialog and CARRIES its
		// keywords across — keep both halves of that hand-off. Hide through
		// the Dialog object when it is reachable, so its own is_visible flag
		// clears too (jQuery modal("hide") alone leaves it stale).
		let seed = "";
		const gs = frappe.searchdialog && frappe.searchdialog.search;
		const gs_dialog = document.querySelector(".modal.search-dialog.show");
		if (gs_dialog) {
			const gs_input = gs_dialog.querySelector("input");
			seed = (gs_input && gs_input.value) || "";
			try {
				if (gs && gs.search_dialog && gs.search_dialog.hide) gs.search_dialog.hide();
				else if (window.jQuery) window.jQuery(gs_dialog).modal("hide");
			} catch (e) {
				/* dialog stays; the palette still opens above it */
			}
		}
		// A Frappe control input answers ctrl+k with its OWN handler
		// (base_input.js: $("#navbar-modal-search").click(); return false),
		// whose jQuery-simulated click opens the native modal before our
		// capture listener ever sees the real event — so the shell would
		// stack on top of an invisible, focus-stealing awesomebar. Close it.
		const native_modal = document.querySelector(".modal.show #navbar-search");
		if (native_modal && window.jQuery) {
			try {
				window.jQuery(native_modal.closest(".modal")).modal("hide");
			} catch (e) {
				/* leave it; ours is above and focused either way */
			}
		}
		if (!pal_nodes) pal_build();

		// Is another modal ACTUALLY still up? Ask the DOM, never
		// body.modal-open: Bootstrap's _hideModal strips that class
		// unconditionally, with no reference counting, so hiding the
		// awesomebar above the user's own dialog clears it while the dialog
		// is still open — and a lift keyed on the class then left the
		// palette at its resting 1045, UNDER that dialog (measured live in
		// the v0.8.0 fix verification). Repair the class too, or the page
		// behind the surviving dialog scrolls.
		const other_modal = document.querySelector(".modal.show");
		if (other_modal) document.body.classList.add("modal-open");
		if (frappe.search.utils.setup_recent) {
			try {
				frappe.search.utils.setup_recent();
			} catch (e) {
				/* recents unavailable — groups simply omit them */
			}
		}
		// Ctrl+K fires with ignore_inputs even while a Frappe dialog (1050)
		// is up; our resting slot is below dialogs by design, so lift just
		// this open above them or the palette would render underneath.
		pal_nodes.backdrop.style.zIndex = other_modal ? "1055" : "";
		// Where focus came FROM, so pal_close can put it back. The opener is
		// whatever was focused at the moment of opening — the search button,
		// the field-shaped button, or wherever Ctrl+K found the user — and
		// closing a dialog that dumps focus on <body> strands a keyboard user
		// at the top of the page.
		pal_opener = document.activeElement;
		pal_nodes.backdrop.removeAttribute("hidden");
		pal_nodes.input.value = seed;
		pal_render(seed);
		pal_nodes.input.focus();
	}

	/** The element focused when the palette opened; focus returns to it. */
	let pal_opener = null;

	/** Close and return focus to where it came from. */
	function pal_close() {
		if (pal_nodes) {
			pal_nodes.backdrop.setAttribute("hidden", "");
			pal_nodes.input.blur();
		}
		// Restore, then forget: a stale opener from a page that has since been
		// torn down fails the isConnected check and focus stays where it is,
		// which is the honest fallback.
		if (pal_opener && pal_opener.isConnected && typeof pal_opener.focus === "function") {
			pal_opener.focus();
		}
		pal_opener = null;
	}

	/**
	 * LIVE PREVIEW / re-application: update state + attribute, tear the
	 * built shell down so flag changes (footer, sigils) rebuild on next
	 * open. Boot shape and field shape both accepted.
	 * @param {Object} values
	 */
	bunood.palette_apply = function (values) {
		if (!values) return;
		const v = (field, key) => values[field] ?? values[key] ?? (pal_state ? pal_state[key] : undefined);
		apply_palette_attrs({
			style: v("palette_style", "style"),
			frecency: v("palette_frecency", "frecency"),
			footer: v("palette_footer", "footer"),
			newtab: v("palette_newtab", "newtab"),
			fallbacks: v("palette_fallbacks", "fallbacks"),
			suggest: v("palette_suggest", "suggest"),
			sigils: v("palette_sigils", "sigils"),
			usage: (pal_state && pal_state.usage) || {},
		});
		if (pal_nodes) {
			pal_nodes.backdrop.remove();
			pal_nodes = null;
		}
	};

	/**
	 * Wire invocation once the desk exists. Registered ONLY when boot
	 * delivered the kit: add_shortcut REPLACES every handler on the combo
	 * (keyboard.js:70 calls off() first), so the action must cover all
	 * styles itself — pal_invoke opens our shell or the native modal. If
	 * boot carried nothing, we never touch the binding and stock survives.
	 */
	function mount_palette() {
		if (!pal_state) return;
		if (frappe.ui && frappe.ui.keys && frappe.ui.keys.add_shortcut) {
			frappe.ui.keys.add_shortcut({
				shortcut: "ctrl+k",
				action: () => pal_invoke(),
				description: __("Open the command palette"),
				ignore_inputs: true,
			});
		}
		// The native sidebar search row stays visible in Classic/Compact;
		// route its clicks through the same decision point. Capture phase,
		// so Frappe's own handler never races us while the shell is active.
		// TWO guards keep the fail-open contract honest (release review
		// v0.7.0..HEAD traced both): the API guard lets the native handler
		// proceed untouched when frappe.search.utils is gone — including
		// pal_invoke's own fallback proxy_click, whose synthetic event lands
		// right here — and the Refined branch never intercepts, it only
		// tags the lazily-built modal for the CSS skin.
		document.addEventListener(
			"click",
			(ev) => {
				const trigger = ev.target.closest && ev.target.closest(".navbar-search-bar");
				if (!trigger) return;
				if (document.documentElement.getAttribute("data-bnd-palette") === "refined") {
					try_for(() => {
						const input = document.getElementById("navbar-search");
						const modal = input && input.closest(".modal");
						if (!modal) return false;
						modal.classList.add("bnd-search-modal");
						return true;
					}, 10);
					return;
				}
				if (!pal_shell_active()) return;
				if (!(frappe.search && frappe.search.utils)) return;
				ev.preventDefault();
				ev.stopPropagation();
				pal_open();
			},
			true
		);
	}

	// ════════════════════════════════════════════════════════════════════════
	// Notification centre kit (item 13)
	// ════════════════════════════════════════════════════════════════════════
	//
	// FOUR STYLES:
	//   Original      -> stock panel, untouched (kit sets no attribute).
	//   Refined       -> stock panel, tagged for the CSS skin.
	//   Bunood Inbox  -> OUR panel over Frappe's Notification Log.
	//   Inbox + Page  -> the panel plus a full-page triage surface.
	//
	// Sources and actions are Frappe's own: api.get_inbox pages the log
	// (Frappe's get_notification_logs takes no offset, caps at 20 and is
	// http-cached for 60s — a burst can render the same row repeatedly),
	// mark-read goes through Frappe's whitelisted endpoints, and routing
	// uses frappe.set_route. "Done" is ours (frappe.defaults) because the
	// log grants role All no write permission and has no unread endpoint.

	/** Label -> attribute slug. Original/unknown -> no attribute. */
	const INBOX_SLUGS = { "Original": "", "Refined": "refined", "Bunood Inbox": "inbox", "Inbox + Page": "page" };

	/** The inbox options in effect — boot's, or a live preview's. */
	let inbox_state =
		window.frappe && frappe.boot && typeof frappe.boot.bnd_inbox === "object"
			? frappe.boot.bnd_inbox
			: null;

	/** Reflect the style onto <html>; wholly derived, cleared first. */
	function apply_inbox_attrs(v) {
		const html = document.documentElement;
		html.removeAttribute("data-bnd-inbox");
		if (!v) return;
		inbox_state = v;
		const slug = INBOX_SLUGS[v.style];
		if (slug) html.setAttribute("data-bnd-inbox", slug);
	}

	apply_inbox_attrs(inbox_state);

	/** True when OUR panel owns the bell (inbox / page styles). */
	function inbox_active() {
		const slug = document.documentElement.getAttribute("data-bnd-inbox");
		return slug === "inbox" || slug === "page";
	}

	/** True when the full-page surface is part of the chosen style. */
	function inbox_has_page() {
		return document.documentElement.getAttribute("data-bnd-inbox") === "page";
	}

	// ── Badge ───────────────────────────────────────────────────────────────

	/** Notification Log types that mean "someone is waiting on you". */
	const INBOX_ACTION_TYPES = ["Assignment", "Mention"];

	/** Last unread count applied, so realtime pushes can render optimistically. */
	let inbox_unread = inbox_state ? parseInt(inbox_state.unread, 10) || 0 : 0;

	/**
	 * Unread count of action-required rows. Seeded from BOOT and refreshed
	 * by every count fetch — it used to be declared null and never assigned,
	 * so "Action Count" could only ever fall through to a dot (release
	 * review v0.8.0..HEAD).
	 */
	let inbox_action_unread = inbox_state ? parseInt(inbox_state.action, 10) || 0 : null;

	/**
	 * Paint every mounted bell badge from the current counts, per the badge
	 * mode. "Action Count" needs a typed count, so until the first fetch
	 * answers it falls back to a dot rather than showing a wrong number.
	 */
	function inbox_paint_badge() {
		// Original stands the WHOLE kit down, badge included: the style
		// promises stock behaviour, and stock has no unread indicator. The
		// CSS is attribute-scoped, so without this the node would still
		// unhide — an unstyled number floating on the bell (caught by the
		// item-13 suite).
		const style = document.documentElement.getAttribute("data-bnd-inbox");
		const mode = !style ? "Off" : (inbox_state && inbox_state.badge) || "Count";
		// The badge span is INVISIBLE to a screen reader: the bell's aria-label
		// masks all descendant text under accname rules. So the label is where
		// the count lives for AT, updated in the same pass that paints it.
		for (const bell of document.querySelectorAll(".bnd-bell")) {
			bell.setAttribute(
				"aria-label",
				inbox_unread > 0
					? __("Notifications") + " — " + __("Unread: {0}", [String(inbox_unread)])
					: __("Notifications")
			);
		}
		// Announce the change too: marking rows read gives no visual feedback
		// beyond the number shrinking, and no audible feedback at all without
		// this. Lives on the PANEL so it only speaks while the panel is up.
		if (inbox_nodes && inbox_nodes.status) {
			inbox_nodes.status.textContent = inbox_unread > 0
				? __("Unread: {0}", [String(inbox_unread)])
				: __("All read");
		}
		for (const node of document.querySelectorAll(".bnd-inbox-badge")) {
			let text = "";
			let show = false;
			if (mode === "Count" && inbox_unread > 0) {
				text = inbox_unread > 99 ? "99+" : String(inbox_unread);
				show = true;
			} else if (mode === "Action Count") {
				if (inbox_action_unread === null) {
					show = inbox_unread > 0;
				} else if (inbox_action_unread > 0) {
					text = inbox_action_unread > 99 ? "99+" : String(inbox_action_unread);
					show = true;
				}
			} else if (mode === "Dot") {
				show = inbox_unread > 0;
			}
			node.textContent = text;
			node.classList.toggle("bnd-inbox-badge-dot", show && !text);
			if (show) node.removeAttribute("hidden");
			else node.setAttribute("hidden", "");
		}
	}

	/** Last count fetch, for the route-change throttle. */
	let inbox_counted_at = 0;

	/**
	 * Refresh the count on navigation, at most once a minute.
	 *
	 * The badge is normally kept live by Frappe's realtime "notification"
	 * event — but when the socket is down (verified: this dev stack reads
	 * "Offline" with socket.connected false) nothing refreshed it until a
	 * full reload, so a user could work all day against a stale number.
	 * Navigation is a cheap, natural checkpoint; the throttle keeps it from
	 * becoming a query per click.
	 */
	function inbox_refresh_on_route() {
		if (Date.now() - inbox_counted_at < 60000) return;
		inbox_counted_at = Date.now();
		inbox_refresh_count();
	}

	/** Refresh the unread count from the server, then repaint. */
	function inbox_refresh_count() {
		inbox_counted_at = Date.now();
		if (!frappe.xcall) return Promise.resolve();
		return frappe
			.xcall("bunood_theme.api.get_inbox_unread")
			.then((res) => {
				inbox_unread = (res && parseInt(res.unread, 10)) || 0;
				inbox_action_unread = (res && parseInt(res.action, 10)) || 0;
				inbox_paint_badge();
			})
			.catch(() => {});
	}

	// ── Data ────────────────────────────────────────────────────────────────

	/** Current filter tab. */
	let inbox_tab = "unread";

	/** Rows currently rendered, flat, for keyboard traversal. */
	let inbox_flat = [];
	let inbox_cursor = 0;

	/** The tab set, in fixed order — state filters before type filters. */
	const INBOX_TABS = [
		{ id: "unread", label: () => __("Unread"), unread_only: 1, kinds: "" },
		{ id: "approvals", label: () => __("Approvals"), unread_only: 0, kinds: "Assignment" },
		{ id: "mentions", label: () => __("Mentions"), unread_only: 0, kinds: "Mention" },
		{ id: "shared", label: () => __("Shared"), unread_only: 0, kinds: "Share" },
		{ id: "all", label: () => __("All"), unread_only: 0, kinds: "" },
	];

	/** Reason-chip label per Notification Log type. */
	function inbox_chip(type) {
		if (type === "Assignment") return __("Approval");
		if (type === "Mention") return __("Mention");
		if (type === "Share") return __("Share");
		if (type === "Energy Point") return __("Points");
		if (type === "Alert") return __("Alert");
		return "";
	}

	/** Fetch one tab's rows. Returns a promise of {rows, unread, has_more}. */
	function inbox_fetch(tab_id, start) {
		const tab = INBOX_TABS.find((t) => t.id === tab_id) || INBOX_TABS[0];
		if (!frappe.xcall) return Promise.resolve({ rows: [], unread: 0, has_more: false });
		return frappe
			.xcall("bunood_theme.api.get_inbox", {
				start: start || 0,
				unread_only: tab.unread_only,
				kinds: tab.kinds,
			})
			.catch(() => ({ rows: [], unread: 0, has_more: false }));
	}

	/**
	 * Group rows by the document they concern. One submitted invoice can
	 * fire assignment, share and workflow rows within a minute; Frappe lists
	 * each separately. Rows without a document stay ungrouped (own group of
	 * one) so nothing is ever hidden by grouping.
	 */
	function inbox_group_rows(rows) {
		if (!inbox_state || !parseInt(inbox_state.group, 10)) {
			return rows.map((r) => ({ key: r.name, doc: null, rows: [r] }));
		}
		const groups = [];
		const by_doc = {};
		for (const row of rows) {
			const key = row.document_type && row.document_name
				? row.document_type + "/" + row.document_name
				: null;
			if (!key) {
				groups.push({ key: row.name, doc: null, rows: [row] });
				continue;
			}
			if (!by_doc[key]) {
				by_doc[key] = { key, doc: { type: row.document_type, name: row.document_name }, rows: [] };
				groups.push(by_doc[key]);
			}
			by_doc[key].rows.push(row);
		}
		return groups;
	}

	// ── Actions ─────────────────────────────────────────────────────────────

	/** The per-user done list (ours; see api.mark_inbox_done). */
	let inbox_done = new Set((inbox_state && inbox_state.done) || []);

	/** Mark one row read through Frappe's own endpoint, optimistically. */
	function inbox_mark_read(row, node) {
		if (row.read) return Promise.resolve();
		row.read = 1;
		if (node) node.classList.remove("bnd-inbox-unread");
		inbox_unread = Math.max(0, inbox_unread - 1);
		// Keep the typed count honest too, or an "Action Count" badge would
		// stay stuck until the next fetch.
		if (inbox_action_unread !== null && INBOX_ACTION_TYPES.indexOf(row.type) !== -1) {
			inbox_action_unread = Math.max(0, inbox_action_unread - 1);
		}
		inbox_paint_badge();
		if (!frappe.xcall) return Promise.resolve();
		return frappe
			.xcall("frappe.desk.doctype.notification_log.notification_log.mark_as_read", {
				docname: row.name,
			})
			.catch(() => {});
	}

	/** Flag/unflag one row as handled (our own per-user store). */
	function inbox_toggle_done(row) {
		const undo = inbox_done.has(row.name);
		if (undo) inbox_done.delete(row.name);
		else inbox_done.add(row.name);
		if (frappe.xcall) {
			frappe
				.xcall("bunood_theme.api.mark_inbox_done", { name: row.name, undo: undo ? 1 : 0 })
				.catch(() => {});
		}
	}

	/** Open the document a row concerns, marking it read on the way. */
	function inbox_open(row, new_tab) {
		inbox_mark_read(row);
		let route = null;
		if (row.link) {
			route = row.link;
		} else if (row.document_type && row.document_name) {
			route = ["Form", row.document_type, row.document_name];
		}
		if (!route) return;
		if (new_tab) frappe.open_in_new_tab = true;
		if (typeof route === "string") window.location.href = route;
		else frappe.set_route(route);
	}

	/** Mark every unread row read (Frappe's own bulk endpoint). */
	function inbox_mark_all_read() {
		inbox_unread = 0;
		inbox_action_unread = 0;
		inbox_paint_badge();
		for (const node of document.querySelectorAll(".bnd-inbox-unread")) {
			node.classList.remove("bnd-inbox-unread");
		}
		if (frappe.xcall) {
			frappe
				.xcall("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read")
				.catch(() => {});
		}
	}

	// ── Rendering (shared by the panel and the page) ─────────────────────────

	/** Relative time, using Frappe's own formatter when present. */
	function inbox_when(row) {
		try {
			if (frappe.datetime && frappe.datetime.comment_when) {
				return frappe.datetime.comment_when(row.creation, true);
			}
		} catch (e) {
			/* fall through */
		}
		return "";
	}

	/**
	 * Build one row node. `subject` is Frappe's own HTML (it wraps the title
	 * in <b class="subject-title">), so it is inserted as markup exactly as
	 * the stock panel does — same trust boundary, not a new one.
	 */
	function inbox_row_el(row, flat_index) {
		const item = el("div", "bnd-inbox-row" + (row.read ? "" : " bnd-inbox-unread"), {
			role: "option",
			"data-idx": String(flat_index),
		});
		item.appendChild(el("span", "bnd-inbox-dot", { "aria-hidden": "true" }));

		const avatar = el("span", "bnd-inbox-avatar", { "aria-hidden": "true" });
		const who = row.from_user || "";
		avatar.textContent = (who.replace(/@.*/, "").trim().charAt(0) || "?").toUpperCase();
		item.appendChild(avatar);

		const body = el("span", "bnd-inbox-body");
		const subject = el("span", "bnd-inbox-subject");
		subject.innerHTML = row.subject || "";
		body.appendChild(subject);
		const when = inbox_when(row);
		if (when) {
			const meta = el("span", "bnd-inbox-when");
			// comment_when returns Frappe's own <span class="frappe-timestamp">
			// MARKUP, not a plain string — assigning it as text printed the
			// tag source into the row (caught by the item-13 visual sweep).
			// As markup it also keeps Frappe's live relative-time updating.
			meta.innerHTML = when;
			body.appendChild(meta);
		}
		item.appendChild(body);

		if (inbox_state && parseInt(inbox_state.chips, 10)) {
			const label = inbox_chip(row.type);
			if (label) {
				const chip = el("span", "bnd-inbox-chip", { "data-kind": String(row.type || "") });
				chip.textContent = label;
				item.appendChild(chip);
			}
		}

		if (inbox_state && parseInt(inbox_state.row_actions, 10)) {
			const gutter = el("span", "bnd-inbox-actions");
			const open_btn = el("button", "bnd-inbox-act", {
				type: "button",
				"aria-label": __("Open in a new tab"),
				title: __("Open in a new tab"),
			});
			// icon-link-url draws a PAPERCLIP in this icon set (measured) —
			// wrong verb for "open in a new tab". The espresso arrow reads
			// as "leaves this surface", which is what the action does.
			const open_symbol = sb_existing_symbol([
				"es-line-arrow-up-right", "es-line-web-link", "icon-link-url",
			]);
			if (open_symbol) open_btn.appendChild(sprite_icon(open_symbol));
			open_btn.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				inbox_open(row, true);
			});
			gutter.appendChild(open_btn);

			const done_btn = el("button", "bnd-inbox-act", {
				type: "button",
				"aria-label": __("Mark as done"),
				title: __("Mark as done"),
			});
			const done_symbol = sb_existing_symbol(["icon-check", "es-line-check", "icon-tick"]);
			if (done_symbol) done_btn.appendChild(sprite_icon(done_symbol));
			done_btn.addEventListener("click", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				inbox_mark_read(row, item);
				inbox_toggle_done(row);
				item.classList.toggle("bnd-inbox-done", inbox_done.has(row.name));
			});
			gutter.appendChild(done_btn);
			item.appendChild(gutter);
		}

		if (inbox_done.has(row.name)) item.classList.add("bnd-inbox-done");
		item.addEventListener("click", (ev) => inbox_open(row, ev.ctrlKey || ev.metaKey));
		return item;
	}

	/** Render grouped rows into a list container; fills inbox_flat. */
	function inbox_render_rows(list, rows) {
		inbox_flat = [];
		list.innerHTML = "";
		// The list is an input role and input roles need NAMES — axe's
		// aria-input-field-name, found by the scoped scan the moment it ran.
		if (!list.getAttribute("aria-label")) list.setAttribute("aria-label", __("Notifications"));
		const groups = inbox_group_rows(rows);
		for (const group of groups) {
			if (group.doc && group.rows.length > 1) {
				// aria-hidden for the same reason as the palette's headings: a
				// listbox may contain only options, and the grouping is visual
				// — the rows carry their document identity themselves.
				const head = el("div", "bnd-inbox-group", { "aria-hidden": "true" });
				head.textContent =
					group.doc.name + " · " + __(group.doc.type) + " · " +
					__("Updates: {0}", [String(group.rows.length)]);
				list.appendChild(head);
			} else if (group.doc) {
				const head = el("div", "bnd-inbox-group", { "aria-hidden": "true" });
				head.textContent = group.doc.name + " · " + __(group.doc.type);
				list.appendChild(head);
			}
			for (const row of group.rows) {
				list.appendChild(inbox_row_el(row, inbox_flat.length));
				inbox_flat.push(row);
			}
		}
		if (!rows.length) {
			// aria-hidden like its Loading sibling: the message is visual, the
			// list's own label and the status live region carry the state, and
			// a listbox whose only child is prose fails required-children —
			// found by the scoped axe scan on the caught-up resting state.
			const empty = el("div", "bnd-inbox-empty", { "aria-hidden": "true" });
			const tab = INBOX_TABS.find((t) => t.id === inbox_tab);
			empty.textContent =
				inbox_tab === "approvals"
					? __("Nothing waiting on your approval")
					: inbox_tab === "mentions"
						? __("No one has mentioned you")
						: inbox_tab === "unread"
							? __("You're all caught up")
							: __("Nothing here yet");
			if (tab) list.appendChild(empty);
		}
	}

	// ── Panel ───────────────────────────────────────────────────────────────

	let inbox_nodes = null;

	/** Move the keyboard highlight (wrap-around) within the rendered rows. */
	function inbox_highlight(index, list) {
		if (!inbox_flat.length) return;
		inbox_cursor = ((index % inbox_flat.length) + inbox_flat.length) % inbox_flat.length;
		const rows = list.querySelectorAll(".bnd-inbox-row");
		rows.forEach((n) => n.removeAttribute("aria-selected"));
		const active = list.querySelector('.bnd-inbox-row[data-idx="' + inbox_cursor + '"]');
		if (active) {
			active.setAttribute("aria-selected", "true");
			active.scrollIntoView({ block: "nearest" });
		}
	}

	/** Keyboard triage: arrows move, Enter opens, e marks read, Esc closes. */
	function inbox_keydown(ev, list, close) {
		// ESCAPE IS NOT A PREFERENCE. `inbox_keyboard` gates the TRIAGE keys —
		// j/k/e are power-user vocabulary a user opts into — but Esc is how a
		// keyboard user LEAVES, and it used to sit behind the same guard: with
		// "Keyboard shortcuts" off, the panel could be opened from the bell
		// and never closed again without a mouse. Found by the 34a audit.
		if (ev.key === "Escape" && close) {
			ev.preventDefault();
			// The dialog's Escape, consumed — same reasoning as the palette's:
			// bubbling on lets Frappe's own Escape handling blur the focus the
			// close just restored to the bell.
			ev.stopPropagation();
			close();
			return;
		}
		if (!inbox_state || !parseInt(inbox_state.keyboard, 10)) return;
		const row = inbox_flat[inbox_cursor];
		if (ev.key === "ArrowDown" || ev.key === "j") {
			ev.preventDefault();
			inbox_highlight(inbox_cursor + 1, list);
		} else if (ev.key === "ArrowUp" || ev.key === "k") {
			ev.preventDefault();
			inbox_highlight(inbox_cursor - 1, list);
		} else if (ev.key === "Enter" && row) {
			ev.preventDefault();
			inbox_open(row, ev.ctrlKey || ev.metaKey);
		} else if ((ev.key === "e" || ev.key === "E") && row) {
			// Auto-advance: triage is a loop, the hand never leaves the keys.
			ev.preventDefault();
			const node = list.querySelector('.bnd-inbox-row[data-idx="' + inbox_cursor + '"]');
			inbox_mark_read(row, node);
			inbox_highlight(inbox_cursor + 1, list);
		} else if (ev.key === "Escape" && close) {
			ev.preventDefault();
			close();
		}
	}

	/** Build the panel shell once. */
	function inbox_build() {
		const backdrop = el("div", "bnd-inbox-backdrop", { hidden: "" });
		const panel = el("div", "bnd-inbox", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": __("Notifications"),
			// Without a tabindex, `panel.focus()` on open is a silent no-op —
			// a div is not focusable — and keyboard focus stayed on the bell
			// behind the backdrop. -1: programmatically focusable, not in the
			// tab order.
			tabindex: "-1",
		});

		const head = el("div", "bnd-inbox-head");
		const title = el("span", "bnd-inbox-title");
		title.textContent = __("Inbox");
		head.appendChild(title);
		const count = el("span", "bnd-inbox-headcount");
		head.appendChild(count);
		const mark_all = el("button", "bnd-inbox-link", { type: "button" });
		mark_all.textContent = __("Mark all read");
		mark_all.addEventListener("click", (ev) => {
			ev.stopPropagation();
			inbox_mark_all_read();
		});
		head.appendChild(mark_all);
		const settings = el("button", "bnd-inbox-act", {
			type: "button",
			"aria-label": __("Notification settings"),
			title: __("Notification settings"),
		});
		const gear = sb_existing_symbol(["icon-setting-gear", "icon-settings", "es-line-settings"]);
		if (gear) settings.appendChild(sprite_icon(gear));
		// Design pick 2A: Esc and the backdrop both close, but neither is
		// VISIBLE — a panel whose only exits are invisible is a panel some
		// users cannot leave. One labelled X, after the gear.
		const close_btn = el("button", "bnd-inbox-act bnd-inbox-close", {
			type: "button",
			"aria-label": __("Close notifications"),
			title: __("Close notifications"),
		});
		const x_symbol = sb_existing_symbol(["icon-close", "es-line-close", "icon-x"]);
		if (x_symbol) close_btn.appendChild(sprite_icon(x_symbol));
		else close_btn.textContent = "×";
		close_btn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			inbox_close();
		});
		settings.addEventListener("click", (ev) => {
			ev.stopPropagation();
			inbox_close();
			frappe.set_route("Form", "Notification Settings", frappe.session.user);
		});
		head.appendChild(settings);
		head.appendChild(close_btn);
		panel.appendChild(head);

		// role="group" of aria-pressed toggles — see the matching comment on
		// bunood.inbox_render_page's tabs, above; the same shape, twice.
		const tabs = el("div", "bnd-inbox-tabs", { role: "group", "aria-label": __("Filter") });
		for (const tab of INBOX_TABS) {
			const btn = el("button", "bnd-inbox-tab", {
				type: "button",
				"aria-pressed": "false",
				"data-tab": tab.id,
			});
			btn.textContent = tab.label();
			btn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				inbox_tab = tab.id;
				inbox_load();
			});
			tabs.appendChild(btn);
		}
		panel.appendChild(tabs);

		const list = el("div", "bnd-inbox-list", { role: "listbox", tabindex: "-1" });
		panel.appendChild(list);

		const foot = el("div", "bnd-inbox-foot");
		if (inbox_has_page()) {
			const all = el("button", "bnd-inbox-link", { type: "button" });
			all.textContent = __("Open inbox page");
			all.addEventListener("click", (ev) => {
				ev.stopPropagation();
				inbox_close();
				frappe.set_route("bnd-inbox");
			});
			foot.appendChild(all);
		}
		const hint = el("span", "bnd-inbox-hint");
		hint.textContent = __("↑↓ move · ↵ open · e read");
		foot.appendChild(hint);
		panel.appendChild(foot);

		backdrop.appendChild(panel);
		document.body.appendChild(backdrop);
		backdrop.addEventListener("mousedown", (ev) => {
			if (ev.target === backdrop) inbox_close();
		});
		panel.addEventListener("keydown", (ev) => inbox_keydown(ev, list, inbox_close));
		const status = el("div", "bnd-inbox-status bnd-visually-hidden", { role: "status", "aria-live": "polite" });
		panel.appendChild(status);
		inbox_nodes = { backdrop, panel, list, count, tabs, status };
	}

	/** Load the active tab into the panel. */
	function inbox_load() {
		if (!inbox_nodes) return;
		for (const btn of inbox_nodes.tabs.querySelectorAll(".bnd-inbox-tab")) {
			const tab_on = btn.getAttribute("data-tab") === inbox_tab;
			btn.classList.toggle("bnd-inbox-tab-on", tab_on);
			// The class styles; the attribute SAYS which filter is on.
			btn.setAttribute("aria-pressed", tab_on ? "true" : "false");
		}
		inbox_nodes.list.innerHTML = "";
		const loading = el("div", "bnd-inbox-empty", { "aria-hidden": "true", "data-bnd-loading": "" });
		loading.textContent = __("Loading...");
		inbox_nodes.list.appendChild(loading);
		inbox_fetch(inbox_tab, 0).then((res) => {
			if (!inbox_nodes) return;
			inbox_unread = (res && parseInt(res.unread, 10)) || 0;
			inbox_action_unread = (res && parseInt(res.action, 10)) || 0;
			inbox_paint_badge();
			inbox_nodes.count.textContent = inbox_unread ? String(inbox_unread) : "";
			inbox_render_rows(inbox_nodes.list, (res && res.rows) || []);
			inbox_highlight(0, inbox_nodes.list);
		});
	}

	/** The element focused when the panel opened; focus returns to it. */
	let inbox_opener = null;

	/** Open the panel (building lazily); a second invocation closes it. */
	function inbox_open_panel() {
		if (!inbox_nodes) inbox_build();
		if (!inbox_nodes.backdrop.hasAttribute("hidden")) {
			inbox_close();
			return;
		}
		inbox_opener = document.activeElement;
		inbox_nodes.backdrop.removeAttribute("hidden");
		inbox_set_expanded(true);
		inbox_tab = "unread";
		inbox_load();
		inbox_nodes.panel.focus();
	}

	/** Close the panel and give focus back to whatever opened it. */
	function inbox_close() {
		if (inbox_nodes) inbox_nodes.backdrop.setAttribute("hidden", "");
		inbox_set_expanded(false);
		if (inbox_opener && inbox_opener.isConnected && typeof inbox_opener.focus === "function") {
			inbox_opener.focus();
		}
		inbox_opener = null;
	}

	/** Reflect the panel's open state on every bell that can open it. */
	function inbox_set_expanded(open) {
		for (const bell of document.querySelectorAll(".bnd-bell")) {
			bell.setAttribute("aria-expanded", open ? "true" : "false");
		}
	}

	/**
	 * The single decision point every bell click routes through: our panel
	 * when the style owns it, otherwise the native one (Refined tags it for
	 * the skin on the way). Mirrors pal_invoke.
	 */
	function inbox_invoke() {
		if (inbox_active() && frappe.xcall) {
			inbox_open_panel();
			return;
		}
		// Refined needs no tagging: its skin is keyed on the boot attribute
		// alone (the tagging never ran in Classic, which mounts no bell).
		proxy_click(".sidebar-notification .item-anchor");
	}

	/**
	 * Make sure every bell that exists right now carries a badge node, then
	 * paint them. TWO layouts need this beyond the initial mount:
	 *   Classic  — mounts no cluster at all, so the ONLY bell is Frappe's
	 *              own sidebar row; without this it had no badge whatsoever
	 *              while the picker still offered "Bell badge: Count".
	 *   Compact  — re-injects its cluster on every route change, so each
	 *              new page arrived with a fresh, unpainted badge node.
	 * (Release review v0.8.0..HEAD found both.)
	 */
	function inbox_ensure_badges() {
		if (!inbox_state) return;
		const native = document.querySelector(".sidebar-notification .item-anchor");
		if (native && !native.querySelector(".bnd-inbox-badge")) {
			native.appendChild(el("span", "bnd-inbox-badge", { hidden: "" }));
		}
		inbox_paint_badge();
	}

	/** Coalesces observer bursts into one paint per frame. */
	let inbox_paint_queued = false;

	/**
	 * Watch for badge nodes ARRIVING and paint them.
	 *
	 * Two timing fixes failed before this one, both for the same reason:
	 * Compact rebuilds its cluster per route through a try_for poll, so the
	 * moment a new badge exists is not tied to any event we can order
	 * against. Painting "after inject_compact_cluster" still painted the
	 * OUTGOING page — measured: on a hop to a form route the incoming page
	 * had no cluster at all for 15s, while the previous page got the one we
	 * built. Cold loads on form URLs were blank permanently.
	 *
	 * So stop guessing when: react to the DOM itself. Idempotent, cheap
	 * (one paint per frame), and correct for every layout and page type.
	 */
	function inbox_observe() {
		if (!inbox_state || !window.MutationObserver) return;
		const observer = new MutationObserver((records) => {
			if (inbox_paint_queued) return;
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1) continue;
					if (
						node.classList.contains("bnd-inbox-badge") ||
						node.querySelector(".bnd-inbox-badge")
					) {
						inbox_paint_queued = true;
						requestAnimationFrame(() => {
							inbox_paint_queued = false;
							inbox_paint_badge();
						});
						return;
					}
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	/**
	 * Arrival tiering: an approval that blocks a document earns an
	 * interruption; a share notification does not. "Badge Only" stays
	 * silent, "Approvals Only" (default) toasts assignments and mentions,
	 * "All Toasts" announces everything. Uses Frappe's own alert so the
	 * toast looks native and stacks with the desk's other messages.
	 * @param {Object} doc - the Notification Log document from realtime.
	 */
	function inbox_announce(doc) {
		const mode = (inbox_state && inbox_state.arrival) || "Approvals Only";
		if (mode === "Badge Only" || !doc || !frappe.show_alert) return;
		if (mode === "Approvals Only" && INBOX_ACTION_TYPES.indexOf(doc.type) === -1) return;
		// subject carries HTML; show_alert renders it, exactly as the stock
		// panel renders the same field.
		frappe.show_alert({ message: doc.subject || __("New notification"), indicator: "blue" }, 7);
	}

	/**
	 * Mount the kit: paint the badge from boot, keep it live on Frappe's own
	 * realtime event, and tier arrival toasts. Registered only when boot
	 * delivered the kit, so a boot failure leaves stock behaviour intact.
	 */
	function mount_inbox() {
		if (!inbox_state) return;
		// The sidebar renders a beat after the shell, so the native bell may
		// not exist yet; retry like every other late-mounting anchor.
		try_for(() => {
			if (!document.querySelector(".sidebar-notification .item-anchor")) return false;
			inbox_ensure_badges();
			return true;
		}, 30);
		inbox_paint_badge();
		inbox_observe();

		// Frappe's own sidebar bell is the ONLY bell in Classic (which
		// mounts no cluster). Every other layout hides that row and mounts
		// the themed bell instead — _layouts.scss hides it for topbar,
		// bottombar and compact, and dock hides the sidebar entirely — so
		// this listener exists for Classic. Route its clicks through the
		// same decision point, exactly as the palette does for the native
		// search row. Capture phase so Frappe's handler never races us
		// while our panel owns the surface; guarded so a missing xcall lets
		// the native handler proceed untouched (fails open).
		document.addEventListener(
			"click",
			(ev) => {
				if (!inbox_active() || !frappe.xcall) return;
				const trigger = ev.target.closest && ev.target.closest(".sidebar-notification");
				if (!trigger) return;
				ev.preventDefault();
				ev.stopPropagation();
				inbox_open_panel();
			},
			true
		);
		if (frappe.realtime && frappe.realtime.on) {
			// Frappe publishes the whole Notification Log doc on this event
			// (notification_log.py after_insert), so the tiering decision
			// needs no extra round trip.
			frappe.realtime.on("notification", (doc) => {
				inbox_refresh_count().then(() => {
					if (inbox_nodes && !inbox_nodes.backdrop.hasAttribute("hidden")) inbox_load();
				});
				inbox_announce(doc);
			});
		}
		// Frappe's own panel force-hides on route change; ours does too, so
		// a click-through never leaves a panel floating over the new page.
		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				inbox_close();
				// Compact rebuilds its cluster per page: the new bell needs
				// its badge painted, and Classic's native bell may only now
				// have rendered. (The observer covers late arrivals; this
				// covers nodes that already exist.)
				inbox_ensure_badges();
				inbox_refresh_on_route();
			});
		}
	}

	// ── Dock ────────────────────────────────────────────────────────────────

	/** How many workspaces get a first-class dock slot before the overflow. */
	const DOCK_SLOTS = 8;

	/**
	 * Mount the Dock layout: brand chip, the first N public root workspaces
	 * as icon buttons, an overflow menu for the rest, then the cluster. The
	 * sidebar is hidden by CSS in this layout, so the dock is the navigation;
	 * place-switching (Desktop/Website) moves into the avatar menu.
	 */
	function mount_dock() {
		if (document.querySelector(".bnd-dock")) return;
		const dock = el("div", "bnd-dock", { role: "navigation", "aria-label": __("Workspaces") });

		// Brand chip -> Desktop. Carries identity now that the sidebar is gone.
		const brand = el("button", "bnd-dock-item bnd-dock-brand", {
			type: "button",
			title: (frappe.boot.bnd_company || "Bunood") + " — " + __("Desktop"),
			"aria-label": (frappe.boot.bnd_company || "Bunood") + " — " + __("Desktop"),
		});
		brand.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
		brand.addEventListener("click", () => frappe.set_route(""));
		dock.appendChild(brand);

		const slug = (name) =>
			frappe.router && frappe.router.slug
				? frappe.router.slug(name)
				: String(name).toLowerCase().replace(/ /g, "-");
		const roots = ((frappe.boot && frappe.boot.allowed_workspaces) || []).filter(
			(w) => w.public && !w.parent_page
		);

		for (const ws of roots.slice(0, DOCK_SLOTS)) {
			const item = el("button", "bnd-dock-item", {
				type: "button",
				title: ws.title,
				"data-ws": slug(ws.name),
			});
			item.appendChild(sprite_icon(ws_symbol(ws.icon)));
			item.addEventListener("click", () => frappe.set_route(slug(ws.name)));
			dock.appendChild(item);
		}

		const rest = roots.slice(DOCK_SLOTS);
		if (rest.length) {
			const more = el("button", "bnd-dock-item", {
				type: "button",
				title: __("More workspaces"),
				"aria-label": __("More workspaces"),
			});
			more.textContent = "⋯";
			menu_trigger(more);
			more.addEventListener("click", () =>
				show_menu(
					more,
					rest.map((ws) => ({
						label: ws.title,
						icon: ws_symbol(ws.icon),
						run: () => frappe.set_route(slug(ws.name)),
					}))
				)
			);
			dock.appendChild(more);
		}

		dock.appendChild(el("span", "bnd-dock-divider"));
		// No search here: the dock is a search REGION now, and mount_search
		// decides whether search lands in it. Hardcoding the icon meant Dock
		// rendered search twice — this pill's icon plus whatever the placement
		// setting put in the status bar — which the release review found and
		// the invariant matrix then reproduced.
		reserve_cluster(dock);
		document.body.appendChild(dock);
		update_dock_active();
	}

	/**
	 * Highlight the dock item for the workspace being viewed.
	 *
	 * v16 models a workspace page as route ["Workspaces", "<Name>"] (measured:
	 * /desk/invoicing -> ["Workspaces", "Invoicing"]) — NOT as the slug in
	 * segment 0 — so only that shape produces a highlight; any other route
	 * (list, form, report) clears it, which is honest: no workspace is open.
	 */
	function update_dock_active() {
		const dock = document.querySelector(".bnd-dock");
		if (!dock) return;
		const route = frappe.get_route() || [];
		const slug = (name) =>
			frappe.router && frappe.router.slug
				? frappe.router.slug(name)
				: String(name).toLowerCase().replace(/ /g, "-");
		const current_slug = route[0] === "Workspaces" && route[1] ? slug(route[1]) : "";
		for (const item of dock.querySelectorAll("[data-ws]")) {
			const ws_on = item.getAttribute("data-ws") === current_slug;
			item.classList.toggle("bnd-active", ws_on);
			// The highlight, stated: without aria-current the active
			// workspace is indistinguishable from its neighbours to AT.
			if (ws_on) item.setAttribute("aria-current", "page");
			else item.removeAttribute("aria-current");
		}
	}

	// ════════════════════════════════════════════════════════════════════════
	// Sidebar style kit (item 10) — mounted pieces
	// ════════════════════════════════════════════════════════════════════════

	/** The workspace shown by the crumb decorator; the module row reuses it. */
	let sb_current_workspace = null;

	/** Boot's resolved pins, until a toggle replaces them. */
	let sb_pins = ((window.frappe && frappe.boot && frappe.boot.bnd_sidebar) || {}).shortcuts || [];

	/** The route as a pin key. */
	function sb_route_key() {
		return (frappe.get_route() || []).join("/").replace(/^[/]+|[/]+$/g, "") &&
			("app/" + (frappe.get_route() || []).map((x) => (frappe.router && frappe.router.slug ? frappe.router.slug(String(x)) : String(x).toLowerCase())).join("/"))
				.replace(/\/+$/, "");
	}

	/** What pinning HERE stores; doctype feeds the per-doctype cap. */
	function sb_pin_payload() {
		const route = frappe.get_route() || [];
		const key = sb_route_key();
		if (!key) return null;
		const payload = { route: key, label: document.title.split(" | ")[0].trim().slice(0, 140) || key };
		if (route[0] === "Form" && route[1]) {
			payload.doctype = String(route[1]);
			if (route[2]) payload.name = String(route[2]);
		} else if (route[0] === "List" && route[1]) {
			payload.doctype = String(route[1]);
		}
		return payload;
	}

	/** Pins first, then recents; appears only with rows. _sidebar.scss. */
	function sb_mount_shortcuts() {
		for (const n of document.querySelectorAll(".bnd-sb-shortcuts")) n.remove();
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar) return;
		const pinned = Array.isArray(sb_pins) ? sb_pins : [];
		const taken = new Set(pinned.map((p) => p.r));
		const here = sb_route_key();
		taken.add(here);
		// Frappe's route history; deduped by route AND label (palette lesson).
		const seenLabels = new Set(pinned.map((p) => p.l));
		const recents = [];
		const hist = ((window.frappe && frappe.route_history) || []).slice(-25).reverse();
		for (const r of hist) {
			if (recents.length >= 3) break;
			if (!Array.isArray(r) || !r.length) continue;
			const key = "app/" + r.map((x) => (frappe.router && frappe.router.slug ? frappe.router.slug(String(x)) : String(x).toLowerCase())).join("/");
			if (taken.has(key)) continue;
			const label = r.length > 2 ? r[1] + " " + r[2] : r.length === 2 ? r[1] + " " + r[0] : String(r[0]);
			if (seenLabels.has(label)) continue;
			taken.add(key);
			seenLabels.add(label);
			recents.push({ r: key, l: label });
		}
		if (!pinned.length && !recents.length) return;

		const region = el("div", "bnd-sb-shortcuts");
		const title = el("div", "bnd-sb-shortcuts-title");
		title.textContent = __("Shortcuts");
		region.appendChild(title);
		const row_for = (entry, kind) => {
			const row = el("div", "bnd-sb-shortcut", { "data-bnd-kind": kind });
			const go = el("button", "bnd-sb-shortcut-go", { type: "button", title: entry.l });
			go.appendChild(sprite_icon(kind === "pin" ? "icon-pin" : "icon-clock"));
			const label = el("span", "bnd-sb-shortcut-label");
			label.textContent = entry.l;
			go.appendChild(label);
			go.addEventListener("click", () => {
				const parts = entry.r.replace(/^app\//, "").split("/");
				frappe.set_route(parts);
			});
			row.appendChild(go);
			// In the DOM at rest — Fluent's position on row actions.
			const act = el("button", "bnd-sb-unpin", {
				type: "button",
				title: kind === "pin" ? __("Unpin") : __("Pin"),
				"aria-label": (kind === "pin" ? __("Unpin") : __("Pin")) + " " + entry.l,
			});
			act.appendChild(sprite_icon(kind === "pin" ? "icon-x" : "icon-pin"));
			act.addEventListener("click", (e) => {
				e.stopPropagation();
				sb_toggle_pin({ route: entry.r, label: entry.l, doctype: entry.d, name: entry.n });
			});
			row.appendChild(act);
			return row;
		};
		for (const pin of pinned) region.appendChild(row_for(pin, "pin"));
		for (const r of recents) region.appendChild(row_for(r, "recent"));

		const anchor = sidebar.querySelector(".bnd-sb-filter") || sidebar.querySelector(".bnd-sb-head");
		if (anchor) anchor.insertAdjacentElement("afterend", region);
		else sidebar.insertBefore(region, sidebar.firstChild);
	}

	function sb_teardown_shortcuts() {
		for (const n of document.querySelectorAll(".bnd-sb-shortcuts")) n.remove();
	}

	/** One round-trip; the region re-renders from the answer. */
	function sb_toggle_pin(payload) {
		frappe
			.xcall("bunood_theme.api.toggle_sb_pin", payload)
			.then((res) => {
				sb_pins = (res && res.pins) || [];
				sb_mount_shortcuts();
			})
			.catch(() => {}); // the caps throw their number; Frappe showed it
	}

	/** The filter row. Argument: _sidebar.scss. */
	function sb_mount_filter() {
		if (!document.documentElement.hasAttribute("data-bnd-sb-filter")) {
			sb_teardown_filter();
			return;
		}
		const sidebar = document.querySelector(".body-sidebar");
		const head = sidebar && sidebar.querySelector(".bnd-sb-head");
		if (!sidebar || sidebar.querySelector(".bnd-sb-filter")) return;
		const row = el("div", "bnd-sb-filter");
		const input = el("input", "bnd-sb-filter-input", {
			type: "search",
			placeholder: __("Filter this workspace"),
			"aria-label": __("Filter this workspace"),
		});
		const count = el("span", "bnd-sb-filter-count", { "aria-live": "polite" });
		row.appendChild(input);
		row.appendChild(count);
		let timer = null;
		input.addEventListener("input", () => {
			clearTimeout(timer);
			timer = setTimeout(() => sb_apply_filter(input.value, count), 120);
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				input.value = "";
				sb_apply_filter("", count);
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				const first = document.querySelector(
					".body-sidebar-top .sidebar-item-container:not(.bnd-sb-fhide) .item-anchor"
				);
				if (first) first.focus();
			}
		});
		if (head) head.insertAdjacentElement("afterend", row);
		else sidebar.insertBefore(row, sidebar.firstChild);
	}

	/** Headers follow their items. */
	function sb_apply_filter(q, count) {
		q = (q || "").trim().toLowerCase();
		const list = document.querySelector(".body-sidebar-top .sidebar-items");
		if (!list) return;
		// Lets CSS reveal matches inside collapsed sections. _sidebar.scss.
		document.documentElement.toggleAttribute("data-bnd-sb-filtering", !!q);
		let shown = 0;
		const rows = list.querySelectorAll(".sidebar-item-container:not(.section-item)");
		for (const row of rows) {
			const label = (row.querySelector(".sidebar-item-label") || {}).textContent || "";
			const hit = !q || label.toLowerCase().includes(q);
			row.classList.toggle("bnd-sb-fhide", !hit);
			if (hit && q) shown++;
		}
		for (const section of list.querySelectorAll(".sidebar-item-container.section-item")) {
			const any = !!section.querySelector(".sidebar-item-container:not(.section-item):not(.bnd-sb-fhide)");
			section.classList.toggle("bnd-sb-fhide", !!q && !any);
		}
		// Label + value, never a bare count (the i18n rule).
		if (count) count.textContent = q ? __("Matches: {0}", [shown]) : "";
	}

	/** Remove the row; give every hidden row back. */
	function sb_teardown_filter() {
		document.documentElement.removeAttribute("data-bnd-sb-filtering");
		for (const n of document.querySelectorAll(".bnd-sb-filter")) n.remove();
		for (const n of document.querySelectorAll(".bnd-sb-fhide")) n.classList.remove("bnd-sb-fhide");
	}

	/** The automatic overflow fade — stamps which EDGES hide content. SCSS. */
	function sb_mount_fades() {
		const top = document.querySelector(".body-sidebar-top");
		if (!top) return;
		const update = () => {
			const over = top.scrollHeight > top.clientHeight + 1;
			if (!over) {
				top.removeAttribute("data-bnd-sb-scroll");
				return;
			}
			const atTop = top.scrollTop <= 1;
			const atEnd = top.scrollTop + top.clientHeight >= top.scrollHeight - 1;
			top.setAttribute("data-bnd-sb-scroll", atTop ? "bottom" : atEnd ? "top" : "both");
		};
		if (!top._bnd_fades) {
			top._bnd_fades = true;
			top.addEventListener("scroll", update, { passive: true });
			if (typeof ResizeObserver !== "undefined") new ResizeObserver(update).observe(top);
		}
		update();
	}

	/** Un-stamp; the listener is inert without it. */
	function sb_teardown_fades() {
		const top = document.querySelector(".body-sidebar-top");
		if (top) top.removeAttribute("data-bnd-sb-scroll");
	}

	/** aria-current on the pane's active row. SELF-GUARDING like
	 *  claim_panehead: the router hook calls it on every route, and a pane
	 *  the layout has hidden must not claim the current page from nowhere. */
	function sb_mark_current() {
		for (const n of document.querySelectorAll(".body-sidebar [aria-current]")) {
			n.removeAttribute("aria-current");
		}
		if (!sb_active() || !container_on("sidepane") || sidebar_is_hidden()) return;
		const active = document.querySelector(".body-sidebar .standard-sidebar-item.active-sidebar");
		if (!active) return;
		const holder = active.closest(".item-anchor") || active.querySelector(".item-anchor") || active;
		holder.setAttribute("aria-current", "page");
	}

	/** The sweep above is the whole teardown. */
	function sb_unmark_current() {
		for (const n of document.querySelectorAll(".body-sidebar [aria-current]")) {
			n.removeAttribute("aria-current");
		}
	}

	// SECTIONS ARE PAINT NOW, not surgery — the wrap/unwrap pair, its
	// re-entrancy guard and its edit-mode observer are gone. _sidebar.scss
	// carries the whole argument.

	/** The Place row: one node, one position, and the whole pane head.
	 *  Why it replaced four rows, and what its position fixes: _sidebar.scss. */
	function sb_mount_head() {
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar) return;
		// Brand row, then place row (item 42) — argument in _sidebar.scss.
		if (!sidebar.querySelector(".bnd-sb-brand")) {
			const brand = el("div", "bnd-sb-brand");
			const mark = el("span", "bnd-sb-brand-mark");
			if (frappe.boot.bnd_logo) {
				mark.appendChild(el("img", "bnd-sb-brand-logo", { src: frappe.boot.bnd_logo, alt: "" }));
			} else {
				mark.classList.add("bnd-sb-brand-initial");
				mark.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
			}
			brand.appendChild(mark);
			const company = el("span", "bnd-sb-brand-name");
			company.textContent = frappe.boot.bnd_company || __("Home");
			brand.appendChild(company);
			sidebar.insertBefore(brand, sidebar.firstChild);
		}
		if (!sidebar.querySelector(".bnd-sb-head")) {
			const head = el("button", "bnd-sb-head", {
				type: "button",
				"data-bnd-part": "panehead",
				"aria-haspopup": "menu",
				"aria-expanded": "false",
			});
			head.appendChild(el("span", "bnd-sb-head-name"));
			const chev = el("span", "bnd-sb-head-chev");
			chev.appendChild(sprite_icon("icon-chevron-down"));
			head.appendChild(chev);
			head.addEventListener("click", (e) => {
				e.stopPropagation();
				show_menu(head, sb_head_menu());
			});
			sb_place_head(sidebar, head);
		}
		sb_update_head();
		claim_panehead();
	}

	/** Above the list; same anchor as sb_zone_anchor's start branch. */
	function sb_place_head(sidebar, head) {
		const list = sidebar.querySelector(":scope > .body-sidebar-top");
		if (list) return list.insertAdjacentElement("beforebegin", head);
		const brand = sidebar.querySelector(":scope > .bnd-sb-brand");
		if (brand) return brand.insertAdjacentElement("afterend", head);
		return sidebar.insertBefore(head, sidebar.firstChild);
	}

	/** Where you are, or whose desk this is. Two states, both facts. */
	function sb_update_head() {
		const name = document.querySelector(".bnd-sb-head .bnd-sb-head-name");
		if (!name) return;
		const ws = sb_current_workspace;
		const label = (ws && ws.title) || frappe.boot.bnd_company || __("Home");
		name.textContent = label;
		// The landmark shares this label: one writer, no drift.
		const pane = document.querySelector(".body-sidebar");
		if (pane) {
			pane.setAttribute("role", "navigation");
			pane.setAttribute("aria-label", label);
		}
	}

	/** A workspace's desk route, through Frappe's own slugger where it exists. */
	function ws_route(name) {
		return frappe.router && frappe.router.slug
			? frappe.router.slug(name)
			: String(name).toLowerCase().split(" ").join("-");
	}

	/** Fold every open section through Frappe's OWN toggle (2a). */
	function sb_collapse_all() {
		for (const d of document.querySelectorAll('.body-sidebar-top .section-item .drop-icon[data-state="opened"]')) {
			const header = d.closest(".standard-sidebar-item");
			if (header) header.click();
		}
		requestAnimationFrame(() => {
			sb_mirror_disclosure();
			sb_update_rollups();
		});
	}

	/** Home, All Apps and the workspace cascade. The cascade is an OBLIGATION of
	 *  the "keep replacing" posture, not decoration — hiding Frappe's header
	 *  takes its list with it. Roots only, no cap; _sidebar.scss carries why. */
	function sb_head_menu() {
		const payload = sb_pin_payload();
		const pinnedHere = !!(payload && (sb_pins || []).some((p) => p.r === payload.route));
		const items = [
			...(payload
				? [
						{
							label: pinnedHere ? __("Unpin this page") : __("Pin this page"),
							icon: "icon-pin",
							run: () => sb_toggle_pin(payload),
						},
						"divider",
				  ]
				: []),
			{ label: __("Home"), icon: "icon-home", run: () => frappe.set_route("") },
			{
				label: __("All Apps"),
				icon: "icon-grid-2x2",
				run: () => {
					window.location.href = "/apps";
				},
			},
		];
		// A workspace whose title already reads as one of the actions above is
		// dropped: Frappe ships a workspace called "Home", and "" and "home" are
		// DIFFERENT routes (/desk and /desk/home, measured) that render the same
		// page. Two rows a person cannot tell apart are not two choices -- the
		// rule the command palette's empty state follows one component over.
		const taken = new Set(items.map((i) => i.label));
		const roots = ((frappe.boot && frappe.boot.allowed_workspaces) || []).filter(
			(w) => !w.parent_page && !taken.has(w.title || w.name)
		);
		if (roots.length) items.push("divider");
		for (const w of roots) {
			items.push({
				label: w.title || w.name,
				icon: ws_symbol(w.icon),
				run: () => frappe.set_route(ws_route(w.name)),
			});
		}
		// Collapse-all (2a), only when something is foldable.
		if (document.querySelector('.body-sidebar-top .section-item .drop-icon[data-state="opened"]')) {
			items.push("divider");
			items.push({
				label: __("Collapse all sections"),
				icon: "icon-list-tree",
				run: sb_collapse_all,
			});
		}
		return items;
	}

	/** Claim the pane header from the DOM, never from having built it.
	 *  Disowns on the negative branch. Argument: _layouts.scss. */
	function claim_panehead() {
		// Both rows, or the vendor's header comes back.
		const both =
			document.querySelector(".body-sidebar .bnd-sb-brand") && document.querySelector(".body-sidebar .bnd-sb-head");
		if (both) bnd_own("panehead");
		else bnd_disown("panehead");
	}

	/**
	 * The quick links: Home and All Apps. WHERE they live is a Theme
	 * Settings option — top or bottom of the pane, or as icon buttons in the
	 * top/bottom bar. Rebuilt (not patched) on preview changes.
	 */
	/**
	 * Build ONE quick link, in the shape its region wants.
	 *
	 * A bar wants an icon button; the pane wants a labelled row whose text sits
	 * in a SPAN, because the collapsed rail hides labels with `display:none` and
	 * a bare text node cannot be hidden by CSS — that is how icons once
	 * overflowed the 52px rail.
	 */
	function build_quick_link(which, in_bar) {
		const is_home = which === "home";
		const title = is_home ? __("Home") : __("All Apps");
		const run = is_home
			? () => frappe.set_route("")
			: () => {
					window.location.href = "/apps";
			  };

		if (in_bar) {
			const btn = el("button", "bnd-icon-btn bnd-sb-util", {
				type: "button",
				title: title,
				"aria-label": title,
				"data-bnd-part": which,
			});
			if (is_home) btn.appendChild(sprite_icon("icon-home"));
			else btn.innerHTML = BND_GRID_SVG;
			btn.addEventListener("click", run);
			return btn;
		}

		const item = el("button", "bnd-sb-item bnd-sb-util", {
			type: "button",
			title: title,
			"data-bnd-part": which,
		});
		const chip = el("span", "bnd-sb-chip");
		if (is_home) chip.appendChild(sprite_icon("icon-home"));
		else chip.innerHTML = BND_GRID_SVG;
		item.appendChild(chip);
		const label = el("span", "bnd-sb-item-label");
		label.textContent = title;
		item.appendChild(label);
		item.addEventListener("click", run);
		return item;
	}

	/**
	 * Home and All Apps, each placed on its own.
	 *
	 * THEY USED TO SHARE ONE SETTING. `sidebar_quick_links` positioned both, and
	 * it rode the sidebar STYLE kit — so a preset decided where they lived and
	 * they could never be separated. `registry.py` has always called them two
	 * components; slice 2 is where the runtime catches up.
	 *
	 * Rebuilt rather than patched on every call: preview changes re-run this,
	 * and reconciling two independently-placed nodes against four possible
	 * regions is more code than throwing them away and building again.
	 */
	function sb_mount_utils() {
		for (const old_mount of document.querySelectorAll(".bnd-sb-utils")) old_mount.remove();
		// The links' BAND CELLS are not .bnd-sb-utils — sweep them too, or
		// every re-run appends a fresh pair (measured: six cells, w=200,
		// the avatar shoved under the resize handle).
		for (const old_cell of document.querySelectorAll(
			'.bnd-sb-band > [data-bnd-part="home"], .bnd-sb-band > [data-bnd-part="apps"]'
		)) {
			old_cell.remove();
		}

		// No fallback to the old shared key: boot stopped emitting it in slice 2,
		// so reading it would be a branch that can never be taken pretending to
		// be a safety net. Through active_placement so narrow mode reaches the
		// links: on a phone All Apps moves into the bottom bar and Home stands
		// down (NARROW_PLACEMENT), without touching either stored setting.
		const place = (which) => active_placement(which) || "Side Pane Start";

		// Group by destination so two links landing in the same place share one
		// wrapper — otherwise the pane grows two containers with one row each,
		// and the bar puts a gap between buttons that belong together.
		const groups = new Map();
		for (const which of ["home", "apps"]) {
			const where = place(which);
			if (where === "Off") continue;
			if (!groups.has(where)) groups.set(where, []);
			groups.get(where).push(which);
		}

		for (const [where, members] of groups) {
			const { region, zone } = parse_slot(where);
			if (region && region !== "sidepane") {
				// THE SAME ZONES AS EVERY OTHER TENANT (E3). The links used to
				// mount at the bar's literal firstChild while the bell used the
				// cluster's start ZONE — one visual place, two containers, and
				// no order between them was expressible. `host_for` resolves
				// region + zone to the same element the bell mounts into, so
				// `enforce_desk_order` can sort them as neighbours, and a
				// container that is not on this desk returns null — the setting
				// is honoured when the region exists, exactly as before.
				const host = host_for(region, zone);
				if (!host) continue;
				const wrap = el("span", "bnd-sb-utils bnd-sb-utils-bar");
				for (const which of members) wrap.appendChild(build_quick_link(which, true));
				host.appendChild(wrap);
				continue;
			}
			if (!region) continue;

			const sidebar = document.querySelector(".body-sidebar");
			if (!sidebar) continue;
			// ONE anchor, not a ladder. The head is always above the list, so
			// "under the head" is a position rather than a race.
			const head =
				sidebar.querySelector(".bnd-sb-head") || sidebar.querySelector(".sidebar-header");
			if (!head) continue;

			// Foot links are band cells (8c); the bar variant is the cell.
			if (zone === "end") {
				for (const which of members) {
					sb_zone_anchor(sidebar, "end", build_quick_link(which, true));
				}
				continue;
			}
			const utils = el("div", "bnd-sb-utils");
			utils.setAttribute("data-bnd-zone", zone || "start");
			for (const which of members) utils.appendChild(build_quick_link(which, false));
			head.insertAdjacentElement("afterend", utils);
		}
		sb_band_prune();
		enforce_desk_order();
	}

	/** A 2x2 grid glyph of our own — no sprite id for "apps" is guaranteed. */
	const BND_GRID_SVG =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
		'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
		'<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';


	/**
	 * Resolve the current workspace from the route when it names one
	 * directly (["Workspaces", "<Name>"]) — the crumb decorator covers list
	 * and form pages, this covers workspace pages themselves, where the
	 * trail has no workspace link to decorate.
	 */
	function sb_resolve_workspace_from_route() {
		const route = frappe.get_route() || [];
		if (route[0] !== "Workspaces" || !route[1]) return;
		const hit = ((frappe.boot && frappe.boot.allowed_workspaces) || []).find(
			(w) => w.name === route[1] || w.title === route[1]
		);
		if (hit) sb_current_workspace = hit;
	}


	/**
	 * The menu rail. Active only in "Rail" mode; the container is narrowed by
	 * inline style (Frappe writes inline widths of its own, so CSS alone
	 * cannot win) and the .bnd-rail-open class drives the CSS overlay
	 * expansion. The TRIGGER — how the rail opens — is a Theme Settings
	 * option:
	 *
	 *   hover     pointer enter opens, leave closes (focus-within too)
	 *   click     clicking the rail toggles; outside click or route closes
	 *   button    only the expand button toggles
	 *   hoverpin  hover, plus a pin that locks the pane open
	 *
	 * The expand BUTTON (placement/shape/glyph all options) can accompany any
	 * trigger; picking the button-only trigger forces one at the edge.
	 */
	function sb_mount_rail() {
		const container = document.querySelector(".body-sidebar-container");
		if (!container) return;
		// Narrow = the drawer's turf: stand down, or the claim strands the phone.
		if (!document.documentElement.hasAttribute("data-bnd-rail") || is_narrow()) {
			sb_teardown_rail(container);
			return;
		}
		if (container.dataset.bndRail) {
			// Already wired; remount released the token — re-claim.
			bnd_own("panetoggle");
			return;
		}
		container.dataset.bndRail = "1";
		container.style.width = "var(--bnd-sb-rail-w)";
		container._bnd_rail_teardown = [];
		const on = (target, event, fn) => {
			target.addEventListener(event, fn);
			container._bnd_rail_teardown.push(() => target.removeEventListener(event, fn));
		};

		const trigger = document.documentElement.getAttribute("data-bnd-sb-railtrigger") || "hover";
		let open_timer = null;
		let close_timer = null;
		let pinned = false;
		const open = () => {
			clearTimeout(close_timer);
			clearTimeout(open_timer);
			// A short open delay filters drive-by passes over the rail; a
			// deliberate pointer barely notices 80ms.
			open_timer = setTimeout(() => container.classList.add("bnd-rail-open"), 80);
		};
		const close = (immediate) => {
			clearTimeout(open_timer);
			if (pinned) return;
			clearTimeout(close_timer);
			if (immediate) container.classList.remove("bnd-rail-open");
			// A generous close delay stops the pane flapping when the pointer
			// clips the edge or crosses to the expand button.
			else close_timer = setTimeout(() => container.classList.remove("bnd-rail-open"), 320);
		};
		const toggle_pin = () => {
			pinned = !pinned;
			container.classList.toggle("bnd-rail-pinned", pinned);
			// Both toggles SAY what they hold: the expand button controls the
			// pane's expansion (aria-expanded), the pin holds it (aria-pressed).
			for (const b of container.querySelectorAll(".bnd-railbtn")) {
				b.setAttribute("aria-expanded", pinned ? "true" : "false");
			}
			for (const b of container.querySelectorAll(".bnd-sb-pin")) {
				b.setAttribute("aria-pressed", pinned ? "true" : "false");
			}
			if (pinned) {
				clearTimeout(close_timer);
				container.classList.add("bnd-rail-open");
			} else {
				// Soft close: if the pointer is still over the pane, stay open
				// until it leaves — an instant slam under the cursor reads as
				// a glitch (the old behaviour).
				if (!container.matches(":hover")) close(true);
			}
		};

		if (trigger === "hover" || trigger === "hoverpin") {
			on(container, "pointerenter", open);
			on(container, "pointerleave", () => close(false));
			// Focus versions ignore movements WITHIN the pane — focusout fires
			// on every internal focus hop and caused open/close churn.
			on(container, "focusin", () => {
				clearTimeout(close_timer);
				container.classList.add("bnd-rail-open");
			});
			on(container, "focusout", (e) => {
				if (e.relatedTarget && container.contains(e.relatedTarget)) return;
				close(false);
			});
		}
		if (trigger === "click") {
			on(container, "click", (e) => {
				// A click on a LINK navigates; only background clicks toggle.
				if (e.target.closest("a, button")) return;
				if (container.classList.contains("bnd-rail-open")) close(true);
				else {
					clearTimeout(open_timer);
					container.classList.add("bnd-rail-open");
				}
			});
			on(document, "pointerdown", (e) => {
				if (!container.contains(e.target)) close(true);
			});
		}
		// Escape always closes an unpinned pane, whatever the trigger.
		on(document, "keydown", (e) => {
			if (e.key === "Escape" && !pinned) close(true);
		});

		if (trigger === "hoverpin") {
			const header = container.querySelector(".bnd-sb-head") || container.querySelector(".sidebar-header");
			if (header) {
				const pin = el("button", "bnd-sb-pin", { type: "button", "aria-label": __("Pin sidebar open"), title: __("Pin sidebar open"), "aria-pressed": "false" });
				pin.textContent = "⌖";
				pin.addEventListener("click", (e) => {
					e.stopPropagation();
					toggle_pin();
				});
				header.insertAdjacentElement("beforeend", pin);
			}
		}

		// The expand button. Its click PINS the pane (open until clicked
		// again) so it works alone and alongside the hover trigger.
		const sb = sb_state || {};
		// No "Button Only": it forced pos="edge", overwriting another picker.
		const pos = SB_SLUGS.railbtn[sb.rail_button] || "";
		if (pos) {
			const glyph = SB_SLUGS.railbtnicon[sb.rail_button_icon] || "chevron";
			const btn = el("button", "bnd-railbtn bnd-railbtn-" + pos, {
				type: "button",
				"data-bnd-part": "railbtn",
				"aria-label": __("Expand sidebar"),
				"aria-expanded": "false",
				title: __("Expand sidebar"),
			});
			btn.appendChild(
				sprite_icon(
					glyph === "menu" ? "icon-menu" : glyph === "arrows" ? "icon-arrow-left-to-line" : "icon-chevron-right"
				)
			);
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				toggle_pin();
			});
			container.appendChild(btn);
		}

		// Wiring live — claim the hamburger. Never before it. _layouts.scss.
		bnd_own("panetoggle");
	}

	/**
	 * Apply the configured pane width. Rail mode's OPEN width and the
	 * always-expanded pane both read --bnd-sb-w (stops 200-280px; stop 2 is
	 * v16's original 220px). Manual-collapse mode is left to Frappe: its
	 * collapse animation owns the width there, and an inline width from us
	 * would pin it open.
	 */
	/** The free-drag pixel; "" follows the site. Defect 23: _sidebar.scss. */
	let sb_pane_px = String(((window.frappe && frappe.boot && frappe.boot.bnd_sidebar) || {}).pane_px || "");

	function sb_apply_width() {
		const container = document.querySelector(".body-sidebar-container");
		if (!container) return;
		// On a phone the pane is Frappe's off-canvas drawer, not a column. An
		// inline width here would pin it open and reserve a phantom column that
		// squeezes the desk into a strip (item 24 — measured 150px at 390). An
		// inline style beats the stylesheet, so the narrow collapse in
		// _sidebar.scss cannot win while this is set: clear it and let CSS take
		// the resting container out of flow. Re-runs on the breakpoint change via
		// mount_sidebar_kit, so widening restores the width.
		if (is_narrow()) {
			container.style.width = "";
			return;
		}
		if (document.documentElement.hasAttribute("data-bnd-rail")) return; // rail sets its own
		// The pixel rides an inline custom property; clearing is one remove.
		const px = parseInt(sb_pane_px, 10);
		if (px >= 200 && px <= 280) container.style.setProperty("--bnd-sb-w", px + "px");
		else container.style.removeProperty("--bnd-sb-w");
		// Frappe's collapse is the `expanded` CLASS, and since item 40 it is the
		// only collapse there is. _sidebar.scss carries the pairing.
		if (container.classList.contains("expanded")) container.style.width = "var(--bnd-sb-w)";
		else container.style.width = "";
	}

	/** Undo everything sb_mount_rail did, for previews that leave rail mode. */
	function sb_teardown_rail(container) {
		bnd_disown("panetoggle");
		if (!container.dataset.bndRail) return;
		delete container.dataset.bndRail;
		container.style.width = "";
		container.classList.remove("bnd-rail-open", "bnd-rail-pinned");
		for (const off of container._bnd_rail_teardown || []) off();
		container._bnd_rail_teardown = [];
		for (const node of container.querySelectorAll(".bnd-railbtn, .bnd-sb-pin")) node.remove();
	}

	// ── Icon engine (Smart / Original / Letters) ────────────────────────────

	/**
	 * Keyword -> sprite-symbol candidates for links that ship no icon of
	 * their own (most Workspace Links do not). Candidates because sprite ids
	 * differ across Frappe versions — the first symbol that EXISTS in
	 * #all-symbols wins, and a wrong guess costs nothing: the letter chip is
	 * the fallback. Order matters: earlier keywords are more specific.
	 */
	const SB_ICON_HINTS = [
		[/dashboard|analytic/i, ["icon-chart", "icon-dashboard"]],
		[/report|statement|ledger|trial/i, ["icon-table", "icon-chart"]],
		[/chart of|tree|group/i, ["icon-list-tree"]],
		[/customer|supplier|user|employee|contact|member|student|patient/i, ["icon-users", "icon-user"]],
		[/invoice|bill/i, ["icon-invoice", "icon-file", "icon-small-file"]],
		[/payment|bank|cash|money|salary|payroll|expense/i, ["icon-money", "icon-money-coins-1", "icon-file"]],
		[/order|quotation|request/i, ["icon-assets", "icon-file"]],
		[/item|product|stock|warehouse|batch|serial/i, ["icon-stock", "icon-package"]],
		[/settings|setup|configuration|defaults/i, ["icon-setting-gear", "icon-settings"]],
		[/entry|note|journal|voucher|document|template|term/i, ["icon-file", "icon-small-file"]],
		[/tax|charge/i, ["icon-percentage", "icon-file"]],
		[/company|organization|branch|department/i, ["icon-organization", "icon-building"]],
		[/project|task|todo/i, ["icon-project", "icon-todo"]],
		[/tool|import|export|rename|bulk/i, ["icon-tool"]],
	];

	/**
	 * First candidate that names a real sprite <symbol>, or null.
	 *
	 * Scoped to an actual <symbol> element, not a bare getElementById: an id is a
	 * document-wide handle, so an unscoped lookup would treat ANY element that
	 * happened to carry `id="icon-foo"` as a resolved icon. Frappe's own reader is
	 * scoped the same way (`#all-symbols > svg > symbol[id]`).
	 */
	function sb_existing_symbol(candidates) {
		for (const id of candidates) {
			const node = document.getElementById(id);
			if (node && node.tagName && node.tagName.toLowerCase() === "symbol") return id;
		}
		return null;
	}

	/**
	 * Give every sidebar link a real glyph, per the Icon Source setting:
	 * "original" leaves Frappe's icon area completely alone; "letters" uses a
	 * styled initial for everything; "smart" (default) keeps icons that
	 * exist, infers a sprite icon from the label for the many links that
	 * ship none, and falls back to the initial. Idempotent per item.
	 */
	/** Original icon markup per icon span, so previews can restore it. */
	const sb_icon_originals = new WeakMap();

	/** The icon mode last applied — a change forces reprocessing. */
	let sb_icon_mode_applied = null;

	/** Give Frappe's own rows their icons back. The inverse of sb_fix_icons,
	 *  and the third writing of this loop — two of them were inside it. */
	function sb_restore_icons() {
		for (const item of document.querySelectorAll("[data-bnd-iconized]")) {
			const span = item.querySelector(".sidebar-item-icon");
			if (span && sb_icon_originals.has(span)) span.innerHTML = sb_icon_originals.get(span);
			item.removeAttribute("data-bnd-iconized");
		}
		sb_icon_mode_applied = null;
	}

	function sb_fix_icons() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-iconsrc") || "smart";
		if (sb_icon_mode_applied && sb_icon_mode_applied !== mode) {
			// Restore before reapplying, or already-processed items would be
			// skipped and a smart->letters preview would change nothing.
			sb_restore_icons();
		}
		sb_icon_mode_applied = mode;
		if (mode === "original") {
			sb_restore_icons(); // restore anything a previous mode replaced
			return;
		}
		for (const item of document.querySelectorAll(
			".body-sidebar-top .sidebar-item-container:not([data-bnd-iconized])"
		)) {
			const icon_span = item.querySelector(":scope > .standard-sidebar-item .sidebar-item-icon");
			if (!icon_span) continue;
			item.setAttribute("data-bnd-iconized", "1");
			const label = item.getAttribute("item-name") || "";
			const has_icon = !!icon_span.querySelector("use");

			if (mode === "letters" || !has_icon) {
				if (!sb_icon_originals.has(icon_span)) sb_icon_originals.set(icon_span, icon_span.innerHTML);
				// Inference moved to the SERVER in item 23: extend_bootinfo derives
				// each link's icon from its untranslated link_to before the sidebar
				// renders. So an item that arrives here with no icon has already
				// been through inference and had nothing to resolve — a client
				// keyword pass over the TRANSLATED label (what this used to do) would
				// only re-guess, and wrongly in Arabic, before landing on the same
				// letter anyway. Straight to the letter chip. The letter is the
				// display label's first character, correct in the visible language.
				icon_span.innerHTML = "";
				const letter = el("span", "bnd-sb-letter");
				letter.textContent = (label || "?").charAt(0);
				icon_span.appendChild(letter);
			}
		}
	}

	/** The last label set we fetched counts for, and when. Keyed on the SET,
	 *  not on the clock alone — see sb_mount_badges. */
	let sb_badges_at = 0;
	let sb_badges_key = "";

	/**
	 * Live badges on sidebar links. One batched server call
	 * (bunood_theme.api.get_sidebar_counts) returns counts for the labels
	 * that are readable DocTypes; anything else is silently skipped. "dots"
	 * mode marks only nonzero rows; "counts" shows the number.
	 */
	function sb_mount_badges() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-badges");
		if (mode !== "dots" && mode !== "counts") return;

		const items = [...document.querySelectorAll(".body-sidebar-top .sidebar-item-container[item-name]:not(.section-item)")];
		const labels = items.map((i) => i.getAttribute("item-name")).filter(Boolean);
		if (!labels.length) return;

		// The window applies WITHIN one label set, never across two: a workspace
		// switch replaces every label and must refetch. _sidebar.scss has why.
		const key = labels.join("|");
		if (key === sb_badges_key && Date.now() - sb_badges_at < 60000) return;
		// Stamp only once there is something to fetch — at first mount the item
		// list is often not built yet, and stamping on the empty attempt
		// throttled away the observer's retry (measured).
		sb_badges_key = key;
		sb_badges_at = Date.now();

		frappe
			.xcall("bunood_theme.api.get_sidebar_counts", { labels: labels.slice(0, 40) })
			.then((counts) => {
				for (const item of items) {
					const label = item.getAttribute("item-name");
					if (!(label in counts)) continue;
					const anchor = item.querySelector(".item-anchor");
					if (!anchor || anchor.querySelector(".bnd-sb-badge")) continue;
					const count = counts[label];
					// Zero is silence in BOTH modes — a wall of "0" pills reads
					// as clutter, and an empty dot means nothing needs you.
					if (!count) continue;
					const badge = el("span", "bnd-sb-badge");
					if (mode === "counts") badge.textContent = count > 99 ? "99+" : String(count);
					anchor.appendChild(badge);
				}
				sb_update_rollups();
			})
			.catch(() => {}); // badges are decoration; never surface a failure
	}

	/** Free-pixel drag on Frappe's own handle. Argument: _sidebar.scss. */
	function sb_mount_resize() {
		const handle = document.querySelector(".body-sidebar .sidebar-resize-handle");
		const container = document.querySelector(".body-sidebar-container");
		if (!handle || !container || handle._bnd_resize) return;
		handle._bnd_resize = true;

		// APG splitter: focusable separator, pixel scale.
		const aria = () => {
			const w = Math.round(container.getBoundingClientRect().width) || 240;
			handle.setAttribute("aria-valuenow", String(w));
			// "240px": a unit symbol, not a noun for a placeholder to govern.
			handle.setAttribute("aria-valuetext", w + "px");
		};
		handle.setAttribute("role", "separator");
		handle.setAttribute("tabindex", "0");
		handle.setAttribute("aria-orientation", "vertical");
		handle.setAttribute("aria-valuemin", "200");
		handle.setAttribute("aria-valuemax", "280");
		handle.setAttribute("aria-label", __("Side pane width"));
		aria();

		const rtl = () => getComputedStyle(container).direction === "rtl";
		const clamp = (n) => Math.min(280, Math.max(200, n));
		const persist = (px) => {
			sb_pane_px = px === "" ? "" : String(px);
			frappe
				.xcall("bunood_theme.api.set_personal", { values: { bnd_sb_width: sb_pane_px } })
				.catch(() => {});
		};

		let drag = null;
		handle.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			if (!container.classList.contains("expanded")) return;
			if (document.documentElement.hasAttribute("data-bnd-rail")) return;
			drag = {
				x0: e.clientX,
				w0: Math.round(container.getBoundingClientRect().width),
				latched: false,
				cancelled: false,
			};
			handle.setPointerCapture(e.pointerId);
		});
		handle.addEventListener("pointermove", (e) => {
			if (!drag || drag.cancelled) return;
			const raw = e.clientX - drag.x0;
			// The 4px latch: movement, never time. _sidebar.scss.
			if (!drag.latched && Math.abs(raw) < 4) return;
			drag.latched = true;
			// clientX never mirrors — RTL widens leftward.
			const w = clamp(drag.w0 + (rtl() ? -raw : raw));
			container.style.setProperty("--bnd-sb-w", w + "px");
			sb_wchip(w);
			aria();
		});
		const finish = (e) => {
			if (!drag) return;
			const d = drag;
			drag = null;
			sb_wchip(null);
			try {
				handle.releasePointerCapture(e.pointerId);
			} catch (err) {
				/* capture may already be gone */
			}
			if (d.cancelled) return;
			if (!d.latched) return; // a click — Frappe's toggle owns it
			// Swallow this gesture's click.
			handle.addEventListener(
				"click",
				(c) => {
					c.stopImmediatePropagation();
					c.preventDefault();
				},
				{ capture: true, once: true }
			);
			const w = clamp(d.w0 + (rtl() ? -(e.clientX - d.x0) : e.clientX - d.x0));
			persist(w);
			aria();
		};
		handle.addEventListener("pointerup", finish);
		handle.addEventListener("pointercancel", (e) => {
			if (drag) drag.cancelled = true;
			sb_wchip(null);
			sb_apply_width();
			finish(e);
		});
		document.addEventListener("keydown", (e) => {
			if (e.key !== "Escape" || !drag || drag.cancelled) return;
			// Cancel: pre-drag width, nothing persisted.
			drag.cancelled = true;
			const latched = drag.latched;
			sb_wchip(null);
			sb_apply_width();
			aria();
			if (latched) {
				handle.addEventListener(
					"click",
					(c) => {
						c.stopImmediatePropagation();
						c.preventDefault();
					},
					{ capture: true, once: true }
				);
			}
		});

		// Physical arrows, derived direction; Up/Down NOT consumed. SCSS.
		handle.addEventListener("keydown", (e) => {
			const w0 = Math.round(container.getBoundingClientRect().width) || 240;
			let w = null;
			if (e.key === "ArrowRight") w = clamp(w0 + (rtl() ? -10 : 10));
			else if (e.key === "ArrowLeft") w = clamp(w0 + (rtl() ? 10 : -10));
			else if (e.key === "Home") w = 200;
			else if (e.key === "End") w = 280;
			else if (e.key === "Enter") {
				e.preventDefault();
				handle.click();
				return;
			} else return;
			e.preventDefault();
			container.style.setProperty("--bnd-sb-w", w + "px");
			persist(w);
			aria();
		});

		// WCAG 2.5.7's pointer alternative, from boot data, zero network.
		const stop_menu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			const stops = (((frappe.boot || {}).bnd_sidebar || {}).pane_stops || []).map(([, px]) => ({
				label: px + "px",
				icon: "icon-chevron-right",
				run: () => {
					container.style.setProperty("--bnd-sb-w", px + "px");
					persist(px);
					aria();
				},
			}));
			stops.push("divider");
			stops.push({
				label: __("Use the site's width"),
				icon: "icon-history",
				run: () => {
					persist("");
					sb_apply_width();
					aria();
				},
			});
			show_menu(handle, stops);
		};
		handle.addEventListener("contextmenu", stop_menu);
		handle.addEventListener("keydown", (e) => {
			if (e.key === "F10" && e.shiftKey) stop_menu(e);
		});
	}

	/** The drag readout; null hides it. */
	function sb_wchip(w) {
		let chip = document.querySelector(".bnd-sb-wchip");
		if (w == null) {
			if (chip) chip.remove();
			return;
		}
		if (!chip) {
			chip = el("div", "bnd-sb-wchip");
			document.body.appendChild(chip);
		}
		const c = document.querySelector(".body-sidebar-container");
		const r = c.getBoundingClientRect();
		const rtl = getComputedStyle(c).direction === "rtl";
		chip.style.insetBlockStart = Math.round(r.y + 8) + "px";
		chip.style.insetInlineStart = Math.round(rtl ? window.innerWidth - r.x + 8 : r.right + 8) + "px";
		chip.textContent = w + "px";
	}

	function sb_teardown_resize() {
		sb_wchip(null);
		const handle = document.querySelector(".body-sidebar .sidebar-resize-handle");
		if (!handle || !handle._bnd_resize) return;
		// Frappe's node: give back every stamped attribute.
		for (const a of ["role", "tabindex", "aria-orientation", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext", "aria-label"]) {
			handle.removeAttribute(a);
		}
		delete handle._bnd_resize;
	}

	// ── The pane's lifecycle (item 40) — argument in _sidebar.scss ─────────

	/** Remove the head. */
	function sb_teardown_head() {
		for (const n of document.querySelectorAll(".bnd-sb-head, .bnd-sb-brand")) n.remove();
		claim_panehead();
	}

	/** The link rows the PANE holds. A bar-placed pair outlives it. */
	function sb_teardown_pane_utils() {
		for (const n of document.querySelectorAll(".body-sidebar .bnd-sb-utils")) n.remove();
		for (const n of document.querySelectorAll(".body-sidebar .bnd-sb-band")) n.remove();
	}

	/** Remove the badges and forget the throttle, so a remount refetches. */
	function sb_teardown_badges() {
		for (const n of document.querySelectorAll(".bnd-sb-badge")) n.remove();
		sb_badges_at = 0;
		sb_badges_key = "";
	}

	/** Hand the container's width back to the stylesheet. */
	function sb_clear_width() {
		const container = document.querySelector(".body-sidebar-container");
		if (container) container.style.width = "";
	}

	/** The rail, without the caller having to find the container first. */
	function sb_teardown_rail_here() {
		const container = document.querySelector(".body-sidebar-container");
		if (container) sb_teardown_rail(container);
	}

	/** The ladder as DATA — both directions read it. `volatile` = lives inside
	 *  `.sidebar-items`, which Frappe rebuilds. Argument: _sidebar.scss. */
	const SB_PARTS = [
		{ key: "head", volatile: false, mount: sb_mount_head, unmount: sb_teardown_head },
		{ key: "filter", volatile: false, mount: sb_mount_filter, unmount: sb_teardown_filter },
		{ key: "shortcuts", volatile: false, mount: sb_mount_shortcuts, unmount: sb_teardown_shortcuts },
		{ key: "utils", volatile: false, mount: sb_mount_utils, unmount: sb_teardown_pane_utils },
		{ key: "icons", volatile: true, mount: sb_fix_icons, unmount: sb_restore_icons },
		{ key: "current", volatile: true, mount: sb_mark_current, unmount: sb_unmark_current },
		{ key: "fades", volatile: true, mount: sb_mount_fades, unmount: sb_teardown_fades },
		{ key: "badges", volatile: true, mount: sb_mount_badges, unmount: sb_teardown_badges },
		{ key: "rail", volatile: false, mount: sb_mount_rail, unmount: sb_teardown_rail_here },
		{ key: "aria", volatile: true, mount: sb_mount_aria, unmount: sb_teardown_aria },
		{ key: "width", volatile: false, mount: sb_apply_width, unmount: sb_clear_width },
		{ key: "resize", volatile: false, mount: sb_mount_resize, unmount: sb_teardown_resize },
	];

	/** The watch record: the NODES being observed, their observers, and the one
	 *  timer they share. Null when nothing is being watched. */
	let sb_watch = null;

	/** Install the pane's observers once, deduped on NODE IDENTITY — a boolean
	 *  would turn the leak into a silence. Argument: _sidebar.scss. */
	function sidepane_observe() {
		if (typeof MutationObserver === "undefined") return;
		const list = document.querySelector(".body-sidebar-top .sidebar-items");
		if (!list) return;
		const box0 = document.querySelector(".body-sidebar-container");
		if (sb_watch && sb_watch.list === list && sb_watch.box === box0) return;
		sidepane_unobserve();
		const watch = { list, box: null, obs: [], timer: null };
		sb_watch = watch;
		if (list) {
			const o = new MutationObserver(() => {
				clearTimeout(watch.timer);
				watch.timer = setTimeout(() => {
					if (!sb_edit_active()) sidepane_sync("list");
				}, 200);
			});
			o.observe(list, { childList: true, subtree: true });
			watch.obs.push(o);
		}
		// The collapse gesture is a class flip; the width has to follow it.
		const box = document.querySelector(".body-sidebar-container");
		if (box) {
			const o = new MutationObserver(() => sb_apply_width());
			o.observe(box, { attributes: true, attributeFilter: ["class"] });
			watch.obs.push(o);
			watch.box = box;
		}
	}

	/** Stop watching. Called by teardown, so an observer cannot outlive the
	 *  parts it exists to rebuild. */
	function sidepane_unobserve() {
		if (!sb_watch) return;
		for (const o of sb_watch.obs) o.disconnect();
		clearTimeout(sb_watch.timer);
		sb_watch = null;
	}

	/** Put our parts in the pane. `only_volatile` is the route contract: a list
	 *  rebuild touches what lived inside the list and nothing else. */
	/** data-state (vendor truth) -> aria-expanded (what AT hears). */
	function sb_mirror_disclosure() {
		for (const d of document.querySelectorAll(".sidebar-item-container.section-item .drop-icon")) {
			d.setAttribute("aria-expanded", d.getAttribute("data-state") === "opened" ? "true" : "false");
		}
	}

	function sb_mount_aria() {
		sb_mirror_disclosure();
		sb_update_rollups();
		const list = document.querySelector(".body-sidebar .sidebar-items");
		if (!list || list.dataset.bndAria) return;
		list.dataset.bndAria = "1";
		list.addEventListener(
			"click",
			(e) => {
				if (!e.target.closest || !e.target.closest(".section-item .standard-sidebar-item")) return;
				requestAnimationFrame(() => {
					sb_mirror_disclosure();
					sb_update_rollups();
				});
			},
			true
		);
	}

	/** Hidden badges sum into one header chip (1a). _sidebar.scss. */
	function sb_update_rollups() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-badges");
		const live = mode === "dots" || mode === "counts";
		for (const sec of document.querySelectorAll(".body-sidebar-top .sidebar-item-container.section-item")) {
			const header = sec.querySelector(".standard-sidebar-item");
			if (!header) continue;
			let chip = header.querySelector(".bnd-sb-rollup");
			const drop = sec.querySelector(".drop-icon");
			const closed = drop && drop.getAttribute("data-state") !== "opened";
			let total = 0;
			let any = false;
			if (live && closed) {
				for (const b of sec.querySelectorAll(".sidebar-child-item .bnd-sb-badge")) {
					any = true;
					const t = b.textContent.trim();
					total += t === "99+" ? 99 : parseInt(t, 10) || 0;
				}
			}
			if (!live || !closed || !any) {
				if (chip) chip.remove();
				continue;
			}
			if (!chip) {
				chip = el("span", "bnd-sb-badge bnd-sb-rollup");
				// The chevron's REAL parent — wrong-parent insertBefore threw silently.
				if (drop) drop.parentNode.insertBefore(chip, drop);
				else header.appendChild(chip);
			}
			chip.textContent = mode === "counts" && total ? (total > 99 ? "99+" : String(total)) : "";
		}
	}

	function sb_teardown_aria() {
		for (const d of document.querySelectorAll(".sidebar-item-container.section-item .drop-icon")) {
			d.removeAttribute("aria-expanded");
		}
	}

	function sidepane_mount(only_volatile) {
		for (const part of SB_PARTS) {
			if (only_volatile && !part.volatile) continue;
			part.mount();
		}
		// data-bnd-sidepane = our decoration is ON (a removal with no setter before).
		container_mounted("sidepane");
	}

	/** Take every part back out, and stop watching. The exact mirror, total. */
	function sidepane_teardown() {
		sidepane_unobserve();
		for (let i = SB_PARTS.length - 1; i >= 0; i--) SB_PARTS[i].unmount();
		document.documentElement.removeAttribute("data-bnd-sidepane");
		const pane = document.querySelector(".body-sidebar");
		if (pane) {
			pane.removeAttribute("role");
			pane.removeAttribute("aria-label");
		}
	}

	/**
	 * The single entry. Every caller that used to climb a ladder calls this.
	 * @param {string} reason - "mount" | "settings" | "list"
	 */
	function sidepane_sync(reason) {
		// `container_on` as well as the DOM, which answers stale mid-apply.
		if (!sb_active() || sidebar_is_hidden() || !container_on("sidepane")) {
			sidepane_teardown();
			return;
		}
		sb_resolve_workspace_from_route();
		if (reason === "list") {
			sidepane_mount(true);
			sidepane_observe();
			return;
		}
		// A retry budget for the head, and it RE-CHECKS ITS OWN PREMISE: it
		// outlives the call that scheduled it, so a pending attempt would land
		// after a teardown. _sidebar.scss carries it.
		try_for(() => {
			// Not WANTED stops the loop; not READY yet does not. _sidebar.scss.
			if (!sb_active() || !container_on("sidepane")) return true;
			if (!document.querySelector(".body-sidebar .sidebar-header")) return false;
			sidepane_mount(false);
			sidepane_observe();
			return true;
		}, 30);
	}

	/** True while Frappe's sidebar edit mode is active (save/discard shown). */
	function sb_edit_active() {
		const controls = document.querySelector(".body-sidebar-bottom .bottom-edit-controls");
		return !!(controls && !controls.classList.contains("hidden"));
	}

	/**
	 * The Appearance dialog — one place a person sets their own desk (item 38).
	 *
	 * IT REPLACES FIVE SCATTERED ENTRIES. Before this, "Appearance" opened
	 * Frappe's own theme modal, "Sidebar Style" opened a menu that applied the
	 * side pane and nothing else, and "Toggle Density" cycled three states with a
	 * toast. Three mechanisms, nothing that said "these are your preferences",
	 * and no way to put any of them back.
	 *
	 * IT READS AN UNGATED ENDPOINT, and that is doctrine now rather than a
	 * detail. `get_theme_presets` opens `only_for("System Manager")`, and item 37
	 * pointed the personalize menu at it: every non-admin's click became a 403
	 * swallowed by an empty catch, invisible to a suite that runs as
	 * Administrator. An endpoint reachable from a per-user surface may not carry
	 * a role gate — see `api.get_personal_presets`.
	 *
	 * A LOCKED AXIS IS SHOWN DISABLED WITH THE REASON, never hidden. Hiding makes
	 * the dialog's contents vary by tenant, so "open Appearance and change your
	 * shape" would work for some people and silently do nothing for others. VS
	 * Code renders policy-managed settings read-only with a lock for the same
	 * reason.
	 *
	 * COLOURS ARE NOT HERE, and the dialog says so rather than staying quiet.
	 * They are one content-hashed stylesheet per site. That is a mechanism
	 * constraint and not a claim that colour cannot be personal — Discourse ships
	 * exactly that, as one variable-only sheet per palette, server-rendered.
	 */
	bunood.appearance = function () {
		frappe
			.xcall("bunood_theme.api.get_personal_presets")
			.then((data) => {
				const st = data.state || {};
				const opened = {
					bnd_look: st.look || "",
					bnd_shape: st.shape || "",
					bnd_density: st.density || "",
					bnd_motion: st.motion || "",
					bnd_home: st.home || "",
					mode: document.documentElement.getAttribute("data-theme-mode") || "light",
				};
				const pick = { ...opened };
				const esc = (t) => frappe.utils.escape_html(String(t));

				// "Follow the site" is a NAMED row that says what it resolves to,
				// not a separate reset button — the shape Discourse and Directus
				// both give inherit. The derived name is "" whenever the site is
				// on a combination no preset spells, which is a common state and
				// not an edge case, so the label degrades to the bare phrase.
				const follow = (named) =>
					named ? __("Follow the site ({0})", [__(named)]) : __("Follow the site");

				const row = (axis, label, options, locked) =>
					`<div class="bnd-cbp-group" data-bnd-part="appearance-axis" data-axis="${axis}">` +
					`<div class="bnd-cbp-title">${esc(label)}</div>` +
					(locked
						? `<div class="bnd-cbp-desc">${esc(__("Set by your administrator."))}</div>`
						: "") +
					`<div class="bnd-cbp-row">` +
					options
						.map(
							(o) =>
								`<button type="button" class="bnd-cbp-opt${o.value === pick[axis] ? " bnd-cbp-on" : ""}"` +
								` data-axis="${axis}" data-value="${esc(o.value)}"` +
								`${locked ? " disabled" : ""} aria-pressed="${o.value === pick[axis]}">` +
								`${esc(o.label)}</button>`
						)
						.join("") +
					`</div></div>`;

				const open_for = (axis) => !!(st.open && st.open[axis]);
				const named = (list, site_name) =>
					[{ value: "", label: follow(site_name) }].concat(
						list.map((n) => ({ value: n, label: __(n) }))
					);
				const density_values =
					(data.axes || []).find((a) => a.key === "bnd_density") || { values: [] };

				const body =
					`<div class="bnd-cbp" data-bnd-part="appearance">` +
					row("bnd_look", __("Look"), named(Object.keys(data.looks || {}), data.site.look), !open_for("bnd_look")) +
					row("bnd_shape", __("Desk shape"), named(Object.keys(data.shapes || {}), data.site.shape), !open_for("bnd_shape")) +
					row("mode", __("Light or dark"), [
						{ value: "light", label: __("Light") },
						{ value: "dark", label: __("Dark") },
						{ value: "automatic", label: __("Automatic") },
					], !open_for("bnd_density")) +
					row("bnd_density", __("Density"), named(density_values.values, data.site.density), !open_for("bnd_density")) +
					// No lock on motion, ever — see personal.UNLOCKABLE. It is an
					// accessibility floor, not a taste, and the one pole reduces.
					row("bnd_motion", __("Motion"), [
						{ value: "", label: __("Follow my system") },
						{ value: "Reduced", label: __("Reduced") },
					], false) +
					row(
						"bnd_home",
						__("Where the desk opens"),
						[{ value: "", label: __("Follow the site") }].concat(
							((data.axes || []).find((a) => a.key === "bnd_home") || { values: [] }).values.map(
								(v) => ({ value: v, label: __(v) })
							)
						),
						!open_for("bnd_home")
					) +
					`<div class="bnd-cbp-note">${esc(__("Colours follow the site."))}</div></div>`;

				const dialog = new frappe.ui.Dialog({
					title: __("Appearance"),
					fields: [{ fieldtype: "HTML", fieldname: "body", options: body }],
					primary_action_label: __("Save"),
					primary_action: () => save(),
				});

				const show_look = (name) => bunood.apply_look(name ? data.looks[name] : data.site_values);
				const show_shape = (name) =>
					bunood.shape_apply(name ? data.shapes[name] : data.site_values, name || data.site.shape || "");
				const show_mode = (m) =>
					frappe.ui.set_theme(m === "automatic" ? undefined : m);

				const preview = (axis, value) => {
					if (axis === "bnd_look") show_look(value);
					else if (axis === "bnd_shape") show_shape(value);
					else if (axis === "bnd_density") bunood.set_density(value, { save: false });
					else if (axis === "bnd_motion") bunood.set_motion(value, { save: false });
					else if (axis === "mode") show_mode(value);
					// bnd_home has nothing to preview — it decides where the NEXT
					// sign-in lands, and routing there now would close the dialog.
				};

				dialog.$wrapper.on("click", ".bnd-cbp-opt", function () {
					const axis = this.getAttribute("data-axis");
					const value = this.getAttribute("data-value");
					for (const b of dialog.$wrapper[0].querySelectorAll(`.bnd-cbp-opt[data-axis="${axis}"]`)) {
						b.classList.toggle("bnd-cbp-on", b === this);
						b.setAttribute("aria-pressed", b === this ? "true" : "false");
					}
					pick[axis] = value;
					preview(axis, value);
				});

				// CANCEL RESTORES. Everything previewed here is a NAMED thing, so
				// putting it back is re-applying the name the dialog opened on —
				// there is no snapshot of a hundred values to keep in sync. Without
				// this, closing without saving leaves somebody wearing a look they
				// declined, with no stored value anywhere to explain it.
				let saved = false;
				dialog.$wrapper.on("hidden.bs.modal", () => {
					if (saved) return;
					show_look(opened.bnd_look);
					show_shape(opened.bnd_shape);
					bunood.set_density(opened.bnd_density, { save: false });
					bunood.set_motion(opened.bnd_motion, { save: false });
					show_mode(opened.mode);
				});

				function save() {
					const calls = [
						frappe.xcall("bunood_theme.api.set_personal", {
							values: {
								bnd_look: pick.bnd_look,
								bnd_shape: pick.bnd_shape,
								bnd_density: pick.bnd_density,
								bnd_motion: pick.bnd_motion,
								bnd_home: pick.bnd_home,
							},
						}),
					];
					// The mode stays FRAPPE'S. The roadmap line for this item says
					// so by name ("via User.desk_theme, never a parallel
					// localStorage"), and calling the endpoint their own switcher
					// calls is what keeps their modal showing the right selection.
					if (pick.mode !== opened.mode) {
						calls.push(
							frappe.xcall("frappe.core.doctype.user.user.switch_theme", {
								theme: pick.mode.charAt(0).toUpperCase() + pick.mode.slice(1),
							})
						);
						document.documentElement.setAttribute("data-theme-mode", pick.mode);
					}
					Promise.all(calls)
						.then(() => {
							saved = true;
							dialog.hide();
							frappe.show_alert({ message: __("Appearance saved"), indicator: "green" });
						})
						.catch((e) =>
							frappe.show_alert({ message: (e && e.message) || __("Could not save"), indicator: "red" })
						);
				}

				dialog.show();
			})
			.catch(() => frappe.show_alert({ message: __("Could not open Appearance"), indicator: "red" }));
	};

	/**
	 * LIVE PREVIEW / re-application: take a full set of style values (Theme
	 * Settings field names, as the picker and presets carry them), re-derive
	 * the attribute set, tear down what placement changed, and remount.
	 * Called by the settings picker on every option click — the desk IS the
	 * preview. Boot shape and field shape both accepted.
	 * @param {Object} values
	 */
	bunood.sb_apply = function (values) {
		if (!values) return;
		const v = (field, key) => values[field] ?? values[key] ?? (sb_state ? sb_state[key] : undefined);
		const next = {
			placement: v("sidebar_placement", "placement"),
			material: v("sidebar_material", "material"),
			icons: v("icon_style", "icons"),
			active: v("sidebar_active_style", "active"),
			sections: v("sidebar_section_style", "sections"),
			wash: v("sidebar_hue_wash", "wash"),
			intensity: v("sidebar_card_depth", "intensity"),
			menurail: v("sidebar_menu_rail", "menurail"),
			rail_trigger: v("sidebar_rail_trigger", "rail_trigger"),
			rail_button: v("sidebar_rail_button", "rail_button"),
			rail_button_icon: v("icon_rail_button", "rail_button_icon"),
			icon_source: v("icon_source", "icon_source"),
			pane_width: v("sidebar_pane_width", "pane_width"),
			badges: v("sidebar_badges", "badges"),
			filter: v("sidebar_filter", "filter"),
			user_preset: sb_state ? sb_state.user_preset : "",
		};
		apply_sidebar_attrs(next);

		// The same teardown every other caller uses. This block used to re-run
		// eight of the ten mounts by hand and skip the other two.
		sidepane_teardown();
		sidepane_sync("settings");
	};

	/**
	 * LIVE PREVIEW / re-application for the breadcrumb kit: take a full set
	 * of option values (Theme Settings field names, as the picker carries
	 * them), re-derive the attribute set, tear down injected nodes, and
	 * re-decorate. Called by the settings picker on every option click —
	 * the desk IS the preview. Boot shape and field shape both accepted.
	 * @param {Object} values
	 */
	bunood.crumb_apply = function (values) {
		if (!values) return;
		const v = (field, key) => values[field] ?? values[key] ?? (crumb_state ? crumb_state[key] : undefined);
		apply_crumb_attrs({
			style: v("crumb_style", "style"),
			separator: v("crumb_separator", "separator"),
			icons: v("icon_crumbs", "icons"),
			hover: v("crumb_hover", "hover"),
			copy_link: v("crumb_copy_link", "copy_link"),
			status_pill: v("crumb_status_pill", "status_pill"),
			narrow_collapse: v("crumb_narrow_collapse", "narrow_collapse"),
		});
		crumb_teardown();
		decorate_crumbs();
	};

	// ── Appearance: one person's own desk (item 38) ─────────────────────────

	/**
	 * Re-apply a whole LOOK from Theme Settings field values.
	 *
	 * One call site for the fifteen `*_apply` functions the settings form drives
	 * individually. The form has its own `bnd_all_previews` doing exactly this;
	 * the dialog is the second caller, and a second hand-kept list of fifteen
	 * names is the same-fact-twice trap — so this is the list, and the form is
	 * free to keep its own because it also repaints its pickers.
	 */
	bunood.apply_look = function (values) {
		if (!values) return;
		for (const fn of [
			"sb_apply", "crumb_apply", "icon_apply", "palette_apply", "inbox_apply",
			"chart_apply", "list_apply", "form_apply", "workspace_apply", "report_apply",
			"views_apply", "overlay_apply", "empty_apply", "skeleton_apply", "filters_apply",
		]) {
			if (typeof bunood[fn] === "function") bunood[fn](values);
		}
	};

	/**
	 * Re-apply a whole SHAPE: containers, tenant placements, and the derived name.
	 *
	 * THE TWO SEAMS THAT DID NOT EXIST. `chrome_apply` moves containers and
	 * remounts, but `mount_placed_tenants` reads `placement_state` and search
	 * reads `status_state.search_placement` — neither of which anything updated,
	 * because until now a placement only ever changed by saving the settings form
	 * and reloading. Previewing a shape without them moves the BARS and leaves the
	 * bell, the profile and search pointing at the old ones.
	 *
	 * `frappe.boot.bnd_desk_shape` is the third: it is the sole input to
	 * `search_fallback_order()`, so without it search walks the OLD shape's
	 * fallback chain and can land in a container this shape does not mount.
	 */
	bunood.shape_apply = function (values, shape) {
		if (!values) return;
		if (placement_state) {
			for (const [field, key] of Object.entries({
				inbox_placement: "inbox",
				user_placement: "user",
				home_placement: "home",
				apps_placement: "apps",
			})) {
				if (field in values) placement_state[key] = values[field];
			}
		}
		if (status_state && "search_placement" in values) {
			status_state.search_placement = values.search_placement;
		}
		if (window.frappe && frappe.boot) frappe.boot.bnd_desk_shape = shape || "";
		bunood.chrome_apply(values);
	};

	/** Mount every active piece of the sidebar kit. Skipped in Dock layout. */
	function mount_sidebar_kit() {
		// `sidepane_sync` owns the is-there-a-pane question, and tears down when
		// the answer is no.
		sidepane_sync("mount");
	}

	// ── Orchestration ───────────────────────────────────────────────────────

	/**
	 * Mount the desk chrome, once the shell exists.
	 *
	 * Per-page work (the page-head cluster, trail resolution, dock highlight)
	 * re-runs on every route change; per-shell work runs once, guarded by
	 * mount markers.
	 *
	 * "the active LAYOUT" is deliberately no longer part of that sentence. Since
	 * slice 2c every container answers for itself and a layout is a preset that
	 * wrote those settings at the moment it was picked.
	 */
	function mount_chrome() {
		// Not "which containers", and since item 37 not the attribute either:
		// empty means boot failed or the theme is inactive, and a stock desk
		// must be left exactly as Frappe built it.
		if (!theme_active()) return;

		// Re-stamp the viewport attributes now the desk is up: the module-scope
		// call ran at load, but this is the point container_on / placement_for
		// below are first asked, so data-bnd-narrow must be current here.
		apply_viewport_mode();

		observe_sidebar_width();
		// Set up BEFORE the bars mount: its MutationObserver is what notices
		// them arriving, so there is no ordering to maintain below.
		observe_bottom_reserve();
		update_desktop_mode();
		decorate_crumbs();

		// Frappe's renderer EMPTIES every trail and rebuilds it from scratch
		// on each update() — route changes, add() calls, and every form
		// header refresh (a doc save wipes our decoration). Wrapping update()
		// is the sanctioned augmentation point: a plain object method, and
		// core itself appends to the trail after clear() the same way.
		// Fails open — if Frappe renames update(), decoration still runs on
		// route changes below, just not on form refreshes.
		if (frappe.breadcrumbs && typeof frappe.breadcrumbs.update === "function" && !frappe.breadcrumbs._bnd_wrapped) {
			const native_update = frappe.breadcrumbs.update.bind(frappe.breadcrumbs);
			frappe.breadcrumbs.update = function () {
				native_update();
				decorate_crumbs();
			};
			frappe.breadcrumbs._bnd_wrapped = true;
		}

		// ── The container ladder ─────────────────────────────────────────
		//
		// FIVE LINES, AND `desk_layout` IS NOT ONE OF THEM. This was a ladder of
		// `if (slug === …)` branches, and the seam between what the layout
		// implied and what the component settings said produced every defect in
		// 0.10.0. Each container answers for itself now; a layout is a preset
		// that WRITES these settings (registry.LAYOUT_CHROME is the catalogue)
		// and then has no further say. That is the whole point of slice 2c, and
		// this is the line it was aiming at.
		//
		// `layout()` still exists, but only as a styling hook and a fallback for
		// a boot payload that predates the split — never as a mount decision.
		//
		// Two things about the order:
		//
		//   * containers go FIRST because they are hosts. mount_search and
		//     mount_placed_tenants resolve placements against the live DOM
		//     (HOSTS), so a region has to exist before anything can be put in
		//     it — which is why both of those calls sit below.
		//   * a container that is off mounts nothing and stamps nothing, so
		//     `host_for(…)` returns null and every tenant pointed at it resolves
		//     to "absent". Absent means LEAVE WHAT IS THERE, not delete — see
		//     placement_for. Switching a container off therefore cannot take a
		//     control away from a user; it can only decline to offer a new home
		//     for one. What stops the LAST one stranding somebody is
		//     guard_critical_reach, below.
		if (container_on("topbar")) mount_topbar();
		if (container_on("pagehead")) inject_compact_cluster();
		if (container_on("dock")) mount_dock();
		if (container_on("bottombar")) mount_statusbar();

		// Search placement is independent of the layout (item 14): mount it
		// AFTER the bars exist, since its slots live in them.
		mount_search();

		// The bell and the user menu follow their own settings, after the
		// containers exist — a placement can only be honoured by a region
		// that is really there.
		mount_placed_tenants();

		// LAST, and only now: every container has mounted and both placement
		// passes have run, so "is there still a route to everything critical"
		// finally has an honest answer. If switching the side pane off has left
		// a user stranded, it comes back — and the tenants are placed again,
		// because the pane returning makes regions and native affordances
		// available that were not there a moment ago. Re-running is safe by
		// construction: mount_placed_tenants is idempotent and Compact already
		// calls it on every route change.
		if (guard_critical_reach()) mount_placed_tenants();

		// The sidebar style kit rides along wherever there IS a side pane —
		// after the guard, so a pane that has just come back is decorated too.
		mount_sidebar_kit();

		// Home and All Apps place themselves, so they mount from HERE rather
		// than from inside the pane's style kit. Reached only through that kit
		// they inherited its gate, and a link placed in the top bar mounted
		// nowhere at all when the side pane was off. Idempotent — it clears its
		// own previous mounts first — so the kit calling it too costs nothing.
		sb_mount_utils();

		// The palette kit owns search invocation in every layout.
		mount_palette();

		// The notification kit owns the bell (and the badge Frappe lacks).
		mount_inbox();
		stamp_appearance_route();
		apply_home_route();

		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				close_menu();
				update_desktop_mode();
				// AFTER update_desktop_mode, because that call is what stands
				// the chrome down on route "" and brings it back — but on the
				// NEXT frame, not in this handler. Measuring forces a
				// synchronous layout, and doing that inside a router event
				// runs it in the middle of Frappe's own re-render; one frame
				// later is invisible to a user and keeps our bookkeeping out
				// of their critical path.
				defer_bottom_reserve();
				// A route change can remount the avatar, which is one of the two
				// routes to Appearance — so the claim on Frappe's Display item is
				// re-measured rather than assumed (item 38).
				stamp_appearance_route();
				sb_resolve_workspace_from_route();
				decorate_crumbs();
				// The ONE container that has to remount per route: page heads
				// are built per page and Frappe swaps the element out from
				// under us. Asking the setting rather than the layout matters
				// more here than anywhere else — this is the line that would
				// quietly bring the cluster back on the next navigation after
				// the user switched it off.
				if (container_on("pagehead")) inject_compact_cluster();
				if (container_on("dock")) update_dock_active();
				sb_update_head();
				sb_mark_current();
				// Recents churn with the route.
				if (sb_active() && container_on("sidepane")) sb_mount_shortcuts();
				// AFTER inject_compact_cluster, never before: Compact builds
				// a NEW cluster (with a fresh hidden badge) on every route
				// change, and Frappe fires router listeners in registration
				// order — mount_inbox's own listener runs first, so it can
				// only ever paint the OUTGOING page's badge. Measured: every
				// newly visited page kept a blank badge indefinitely.
				inbox_ensure_badges();
			});
		}
	}

	// The desk is built by Frappe's JS after DOMContentLoaded with no single
	// "shell ready" event, so wait for its anchor elements with a bounded
	// poll, then mount. If the desk never appears (website page, login), the
	// budget runs out and nothing happens — which is correct there.
	try_for(() => {
		if (!window.frappe || !frappe.boot || !document.querySelector(".body-sidebar-container")) {
			return false;
		}
		mount_chrome();
		return true;
	}, 80, 150);
})();
