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

	// Stable root scope for all Bunood component overrides. Keep this beside the
	// other synchronous document attributes so shared controls are themed before
	// Frappe mounts the desk shell.
	document.documentElement.classList.add("bunood");

	/** Public namespace. Navbar Settings action items call into this. */
	const bunood = (window.bunood_theme = window.bunood_theme || {});

	// ERPNext ships Home with Item, Customer, Supplier and Sales Invoice links.
	// Bunood Home already exposes those tasks as prominent actions, while the
	// sparse sidebar leaves every module behind an All Apps detour. Replace only
	// Home's boot entry with a compact product navigator derived from Frappe's
	// permission-filtered allowed_workspaces. Module sidebars remain untouched.
	const HOME_NAVIGATION_GROUPS = [
		["Transactions", "accounting", false, ["Selling", "Buying", "Stock", "Invoicing"]],
		["Operations", "organization", true, ["CRM", "Manufacturing", "Projects", "Assets", "Quality", "Subcontracting"]],
		["Reports", "table", true, ["Financial Reports", "ZATCA"]],
		["Setup", "setting-gear", true, ["ERPNext Settings"]],
	];

	function home_sidebar_item(label, { type = "Link", link_to = null, icon = null, child = 0, keep_closed = 0 } = {}) {
		return {
			// These rows are assembled after boot rather than loaded from a
			// translated Workspace document. Localize the visible label here and
			// keep link_to as the stable English workspace identifier used by the
			// router. Without this, an Arabic desk shows an English-only navigator.
			label: __(label),
			link_to,
			link_type: type === "Link" ? "Workspace" : "DocType",
			type,
			icon,
			child,
			collapsible: 1,
			indent: type === "Section Break" ? 1 : 0,
			keep_closed,
			url: null,
			show_arrow: 0,
			filters: null,
			route_options: null,
			tab: null,
		};
	}

	function prepare_home_sidebar() {
		const boot = window.frappe && frappe.boot;
		const sidebars = boot && boot.workspace_sidebar_item;
		const allowed_rows = (boot && boot.allowed_workspaces) || [];
		if (!sidebars || !allowed_rows.length) return false;
		const home_key = Object.keys(sidebars).find((key) => key.toLowerCase() === "home");
		if (!home_key || !sidebars[home_key]) return false;
		if (sidebars[home_key]._bnd_module_navigation) return false;
		const allowed = new Map(allowed_rows.filter((row) => row && row.name).map((row) => [row.name, row]));
		const home = allowed.get("Home");
		const items = home ? [home_sidebar_item("Home", { link_to: "Home", icon: home.icon || "home" })] : [];
		for (const [label, icon, closed, names] of HOME_NAVIGATION_GROUPS) {
			const visible = names.filter((name) => allowed.has(name));
			if (!visible.length) continue;
			items.push(home_sidebar_item(label, { type: "Section Break", icon, keep_closed: Number(closed) }));
			for (const name of visible) {
				const workspace = allowed.get(name);
				items.push(home_sidebar_item(workspace.title || workspace.label || name, {
					link_to: name,
					icon: workspace.icon,
					child: 1,
				}));
			}
		}
		if (items.length < 2) return false;
		sidebars[home_key].items = items;
		sidebars[home_key]._bnd_module_navigation = true;
		return true;
	}

	// app_include_js executes after frappe.boot is assigned and before the desk
	// shell's bounded mount below. Mutating the payload here avoids a flash and
	// leaves the standard Workspace Sidebar document untouched for upgrades.
	prepare_home_sidebar();

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
	// Frappe Charts writes series colours inline, so CSS cannot theme them. Wrap
	// its one public constructor and fill empty slots from Bunood's AA-safe ramp.
	(function patch_chart_colors() {
		if (!window.frappe || typeof frappe.Chart !== "function") return;
		const NAVIGABLE_TYPES = new Set(["bar", "line", "axis-mixed", "scatter"]);
		let chart_uid = 0;

		function chart_host(parent, chart) {
			if (parent && parent.nodeType === 1) return parent;
			if (typeof parent === "string") return document.querySelector(parent);
			return chart && chart.container ? chart.container.parentElement : null;
		}

		function chart_point_text(options, index) {
			const data = (options && options.data) || {};
			const label = ((data.labels || [])[index] || "").toString();
			const values = (data.datasets || []).map((dataset, dataset_index) => {
				const name = dataset.name || `${typeof __ === "function" ? __("Series") : "Series"} ${dataset_index + 1}`;
				return `${name}: ${(dataset.values || [])[index] ?? 0}`;
			});
			return [label, ...values].filter(Boolean).join(". ");
		}

		/** Give every Frappe chart one interaction and accessibility contract. */
		function decorate_chart(chart, parent, options, navigable) {
			if (!chart || !chart.container) return;
			const host = chart_host(parent, chart);
			if (!host) return;
			const title = options.bndAriaLabel || options.title ||
				(((options.data && options.data.datasets) || [])
					.map((dataset) => dataset.name).filter(Boolean).join(", ")) ||
				(typeof __ === "function" ? __("Interactive chart") : "Interactive chart");
			const container = chart.container;
			container.classList.add("bnd-interactive-chart");
			container.setAttribute("role", "group");
			container.setAttribute("aria-label", title);
			if (navigable && !container.hasAttribute("tabindex")) container.tabIndex = 0;

			const help = document.createElement("span");
			help.id = `bnd-chart-help-${++chart_uid}`;
			help.className = "bnd-visually-hidden bnd-chart-announcer";
			help.setAttribute("role", "status");
			help.setAttribute("aria-live", "polite");
			help.textContent = navigable
				? (typeof __ === "function" ? __("Use the left and right arrow keys to inspect data points.") : "Use the left and right arrow keys to inspect data points.")
				: title;
			host.appendChild(help);
			container.setAttribute("aria-describedby", help.id);
			host.addEventListener("data-select", (event) => {
				const index = Number(event.index ?? (event.detail && event.detail.index));
				if (Number.isInteger(index) && index >= 0) help.textContent = chart_point_text(options, index);
			});
			if (navigable) {
				let index = Math.max(0, ((options.data && options.data.labels) || []).length - 1);
				container.addEventListener("keydown", (event) => {
					const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
					if (!step) return;
					event.preventDefault();
					index = Math.max(0, Math.min(options.data.labels.length - 1, index + step));
					host.dispatchEvent(new CustomEvent("data-select", { detail: { index } }));
				});
			}
		}

		const admin_set = (c) => typeof c === "string" && c.trim().length > 0;
		function resolve_color(color) {
			if (!admin_set(color)) return color;
			const match = color.trim().match(/^var\(\s*(--[\w-]+)\s*\)$/);
			if (!match) return color;
			const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
			return value || color;
		}

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

		function merged_colors(given, type) {
			if (type === "heatmap") return given;
			const ramp = resolve_ramp();
			if (!ramp) return given;
			const n = Math.max(ramp.length, given.length);
			const out = [];
			for (let i = 0; i < n; i++) {
				const a = given[i];
				out[i] = admin_set(a) ? resolve_color(a) : ramp[i % ramp.length];
			}
			return out;
		}

		const live = new Set();
		const deferred = new Set();

		function repaint_marks(c, colors) {
			const root = c.container;
			if (!root || !colors.length) return;
			let sheet = root.querySelector(":scope > style[data-bnd-chart-colors]");
			if (!sheet) {
				sheet = document.createElement("style");
				sheet.dataset.bndChartColors = "";
				root.appendChild(sheet);
			}
			sheet.textContent = colors.map((color, index) => {
				if (window.CSS?.supports && !CSS.supports("color", color)) return "";
				const d = `.dataset-${index}`;
				return `${d} .bar,${d} .region-fill,${d} .data-point,${d} circle{fill:${color}!important}${d} .line-graph-path{stroke:${color}!important}`;
			}).join("");
			const paint = (node, color) => {
				if (node.matches(".line-graph-path")) node.style.stroke = color;
				else if (node.matches(".bar, .region-fill, .data-point, circle")) node.style.fill = color;
			};
			colors.forEach((color, index) => {
				for (const node of root.querySelectorAll(`.dataset-${index} .bar, .dataset-${index} .line-graph-path, .dataset-${index} .region-fill, .dataset-${index} .data-point, .dataset-${index} circle`)) paint(node, color);
			});
			// Pie and donut slices represent points rather than datasets.
			for (const [index, node] of [...root.querySelectorAll(".donut-path, .pie-path")].entries()) {
				const color = colors[index % colors.length];
				if (node.matches(".donut-path")) node.style.stroke = color;
				else node.style.fill = color;
			}
			for (const [index, node] of [...root.querySelectorAll(".chart-legend .indicator, .graph-stats-container .indicator")].entries()) node.style.backgroundColor = colors[index % colors.length];
		}

		// Retire a chart whose container is gone. surfaces/_charts.scss.
		function retire(c) {
			try {
				if (c && c.boundDrawFn) window.removeEventListener("resize", c.boundDrawFn);
			} catch (e) {
				/* a vendor that stops binding this way must not take the desk down */
			}
			live.delete(c);
			deferred.delete(c);
		}

		function repaint_one(c) {
			if (!c || c._bnd_type === "heatmap" || !c.container || !c.container.isConnected) return;
			const colors = merged_colors(c._bnd_given || [], c._bnd_type);
			c.colors = colors;
			if (c.tip) c.tip.colors = colors; // SvgTip captured the array separately
			// Avoid draw(): it races Frappe's ResizeObserver during route remounts.
			repaint_marks(c, colors);
		}

		// A repaint destroys an open tooltip, so a chart the user is pointing at or
		// keyboarding through is parked and flushed when they leave it.
		function busy(c) {
			return (
				(c.container.matches && c.container.matches(":hover")) ||
				c.container.contains(document.activeElement)
			);
		}
		function repaint_all(force) {
			ramp_gen++; // invalidate the cache: the theme moved
			for (const c of Array.from(live)) {
				if (!c.container || !c.container.isConnected) {
					retire(c);
					continue;
				}
				if (!force && busy(c)) deferred.add(c);
				else repaint_one(c);
			}
		}
		function flush_deferred() {
			for (const c of Array.from(deferred)) {
				if (!c.container || !c.container.isConnected) {
					retire(c);
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
			const navigable = !!(options && NAVIGABLE_TYPES.has(options.type) && options.isNavigable !== false);
			if (navigable) options.isNavigable = 0;
			const given =
				options && Array.isArray(options.colors) ? options.colors.slice() : [];
			if (options) options.colors = merged_colors(given, options.type);
			// Give line charts the region that the Filled Area style reveals.
			if (options && options.type === "line") {
				options.lineOptions = options.lineOptions || {};
				if (options.lineOptions.regionFill === undefined) options.lineOptions.regionFill = 1;
			}
			const chart = new NativeChart(parent, options);
			if (chart && chart.container) {
				chart._bnd_given = given;
				chart._bnd_type = options && options.type;
				decorate_chart(chart, parent, options || {}, navigable);
				// Prune opportunistically so the set cannot grow without bound on a
				// long-lived desk that renders many charts — and RETIRE rather than
				// forget: a chart Frappe has re-rendered past is still bound to the
				// window's resize.
				for (const c of live) if (!c.container || !c.container.isConnected) retire(c);
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

		// ...and on every route change, when a widget's chart dies. _charts.scss.
		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				for (const c of Array.from(live)) {
					if (!c.container || !c.container.isConnected) retire(c);
				}
			});
		}

		// The MANDATORY live-preview hook, present from day one — a kit that saves
		// but does not apply is the recorded failure class. The chart_grid picker
		// calls this with the new label: the attribute flips (CSS responds instantly
		// — gridlines, the area fill's opacity) and the series are repainted, so a
		// theme flip and a settings change go through one door.
		bunood.chart_apply = function (values) {
			if (values && values.chart_grid !== undefined) apply_chart_grid_attr(values.chart_grid);
			repaint_all(true);
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
	// `innerWidth < 768` — the desktop chrome cannot stand. Current v16 keeps
	// desk.html's empty <header> in the DOM, but Frappe still collapses the side
	// pane to an off-canvas drawer. So the desk COLLAPSES to
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
	// REACTS TO THE BREAKPOINT, NOT `resize`. The narrow chrome choice is a boot
	// decision nothing re-ran, so a desk loaded at 400px and widened kept no top
	// bar until reload. `matchMedia` fixes both directions: crossing 768 re-runs
	// the container ladder (`remount_chrome`). The viewport decision must not
	// depend on the optional server payload: without it, a phone was treated as
	// desktop and an always-open sidebar consumed almost the entire screen.
	const narrow_chrome = (window.frappe && frappe.boot && frappe.boot.bnd_narrow_chrome) || null;
	const narrow_placement = (window.frappe && frappe.boot && frappe.boot.bnd_narrow_placement) || null;
	// The user's phone-bar toggles (item 24 C2): which tenants join search below
	// 768. Search itself has no toggle — it is the only search on a phone. A live
	// preference, not a rebuild: active_placement turns a 0 into "Off" while narrow.
	const mobile_state = (window.frappe && frappe.boot && frappe.boot.bnd_mobile) || null;
	const MOBILE_MQ = typeof window.matchMedia === "function" ? window.matchMedia("(width < 768px)") : null;

	/** Below Frappe's 768 mobile boundary, with a narrow preset to apply. */
	function is_narrow() {
		return !!(MOBILE_MQ && MOBILE_MQ.matches);
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
	// Renamed with the catalogue (item 42). Reached only when `chrome_state`
	// lacks a key — boot has carried all five since the container split, so this
	// is the pre-boot floor rather than a live decision, which is why the stale
	// names here cost nothing while SEARCH_FALLBACKS' cost a wrong placement.
	const LAYOUT_CONTAINERS = {
		unifiedsidepane: ["bottombar", "sidepane"],
		"rail+flyout": ["bottombar", "sidepane"],
		taskbar: ["bottombar", "sidepane"],
		toptaskbar: ["topbar", "bottombar", "sidepane"],
		// The one layout with no side pane: it hides the whole container.
		floatingbar: ["dock", "bottombar"],
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
		if (is_narrow() && narrow_chrome && Object.prototype.hasOwnProperty.call(narrow_chrome, key)) {
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
	 * not the mobile signal: current v16 keeps the empty header below 768, while
	 * `container_on` deliberately selects the narrow container set there. The
	 * header can still be absent for read_only, impersonation or announcements, so
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
		// TWO WAYS TO HIDE THE PANE since item 42 — argument in _sidebar.scss.
		const hidden = html.getAttribute("data-bnd-sb-panestate") === "hidden";
		if (!off.includes("sidepane") && !hidden) return false;

		// PRESENCE, not visibility — except inside the pane we are hiding, where a
		// present node is an unreachable one. Argument in _sidebar.scss.
		const critical = (window.frappe && frappe.boot && frappe.boot.bnd_critical) || [];
		const stranded = critical.filter((c) => {
			const node = document.querySelector(c.selector);
			return !node || !!node.closest(".body-sidebar-container");
		});
		if (!stranded.length) return false;

		// Release whichever mechanism is hiding it. Both, when both are.
		if (hidden) html.setAttribute("data-bnd-sb-panestate", "open");
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
		// The brand pill (item 42) — argument in _sidebar.scss.
		if (container_on("sidepane")) sb_mount_pill();
		else sb_teardown_pill();
		sync_desktop_shell();
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
		// Release the desktop-open state while the rail attribute still exists;
		// removing the attribute first would route through teardown and leave
		// Frappe's `.expanded` class carrying the old floating-card geometry.
		document.querySelector(".body-sidebar-container")?._bnd_sync_rail?.();
		// Rail is desktop chrome. Re-resolve its attribute before remounting so
		// Frappe's native off-canvas drawer owns the narrow layout, then restore
		// the single top-bar toggle when the viewport becomes wide again.
		apply_sidebar_attrs(sb_state);
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
		// Getting Started rides the same measure (item 42) — see _layouts.scss.
		if (document.querySelector(".bnd-avatar-btn")) bnd_own("onboard");
		else bnd_disown("onboard");
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
		// Six surfaces; four icon styles. The retired labels keep entries —
		// argument in _sidebar.scss, which Sass strips before the wire.
		material: {
			"Solid": "solid", "Bordered": "bordered", "Elevated": "elevated",
			"Textured": "textured", "Tinted": "tinted", "Gradient": "gradient",
			"Glass": "elevated", "Blurred Glass": "elevated",
		},
		// `color` is gone; see _sidebar.scss's head for why.
		icons: {
			"Filled Color": "filled", "Fill on Active": "onactive",
			"Solid Tile": "tile", "Circle Badge": "badge",
			"Colored Chips": "tile", "Colored Dots": "badge",
			"Duotone": "filled", "Brand Lines": "filled", "Monochrome": "onactive",
		},
		active: {
			"Solid Pill": "pill", "Soft Pill": "softpill", "Accent Rail": "rail",
			"Outline": "outline", "Folder Tab": "foldertab",
		},
		sections: { "Plain": "plain", "Divided": "divided", "Cards": "cards" },
		wash: { "Off": "off", "Subtle": "subtle", "Rich": "rich" },
		// Three states since item 42. The legacy spellings still resolve — the
		// migration rewrites stored values, but a desk mid-upgrade (boot cached
		// before the patch ran) must not lose its pane over a label.
		panestate: {
			"Open": "open", "Rail": "rail", "Hidden": "hidden",
			"Always Expanded": "open", "Hover-Expand": "rail", "Hover + Pin": "rail",
		},
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
		const state = SB_SLUGS.panestate[sb.panestate] || "open";
		set("panestate", state);
		// Rail keeps its own anchor attribute plus the trigger the JS wires --
		// four dozen rules key on `data-bnd-rail` and it stays their subject.
		// Legacy "Hover + Pin" mode labels imply their trigger.
		// The custom collapsed pane is desktop-only. At narrow widths leave the
		// rail attribute off so Frappe's native off-canvas drawer remains usable.
		if (state === "rail" && !is_narrow()) {
			html.setAttribute("data-bnd-rail", "");
			const trigger =
				SB_SLUGS.railtrigger[sb.rail_trigger] ||
				(sb.panestate === "Hover + Pin" ? "hoverpin" : "hover");
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
	// Surface kits are attribute-only, fail open per axis, and clear all
	// styling when their Original anchor resolves to an empty slug.

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

		// Frappe v16's generic endpoint now annotates start/end as date, while
		// calendar.js still sends convert_to_system_tz() datetimes. In any
		// non-UTC zone that becomes e.g. "2026-07-26 02:30:00" and Pydantic
		// rejects the request with 417 before a single event can render. Keep
		// custom calendar methods untouched; normalize only the generic method's
		// documented date range at its one client-side funnel.
		if (typeof Cal.prototype.get_args === "function") {
			const NativeArgs = Cal.prototype.get_args;
			Cal.prototype.get_args = function (start, end) {
				const args = NativeArgs.call(this, start, end);
				const generic = !this.get_events_method || this.get_events_method === "frappe.desk.calendar.get_events";
				if (generic) {
					for (const key of ["start", "end"]) {
						if (typeof args[key] === "string") args[key] = args[key].split(/[ T]/)[0];
					}
				}
				return args;
			};
		}

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
	 * Give Frappe's dynamically-rendered list selection checkboxes an accessible
	 * name. Core emits one bare input per record, so axe's label count otherwise
	 * grows with tenant data and a screen-reader user hears only "checkbox".
	 * Observe added rows rather than the whole list state: this stays cheap on
	 * long lists and also covers paging, filtering and virtual re-renders.
	 */
	let list_a11y_observer = null;
	function label_list_checkboxes(root) {
		const boxes = [];
		if (root?.matches?.(".list-row-checkbox")) boxes.push(root);
		for (const box of root?.querySelectorAll?.(".list-row-checkbox") || []) boxes.push(box);
		for (const box of boxes) {
			if (box.getAttribute("aria-label") || box.getAttribute("aria-labelledby") || box.title) continue;
			const name = box.getAttribute("data-name") || __("row");
			box.setAttribute("aria-label", __("Select {0}", [name]));
		}
	}
	function observe_list_accessibility() {
		label_list_checkboxes(document);
		if (list_a11y_observer || typeof MutationObserver === "undefined" || !document.body) return;
		list_a11y_observer = new MutationObserver(records => {
			for (const record of records) for (const added of record.addedNodes) {
				if (added.nodeType === Node.ELEMENT_NODE) label_list_checkboxes(added);
			}
		});
		list_a11y_observer.observe(document.body, { childList: true, subtree: true });
	}

	/**
	 * Route "" is v16's Desktop page, which ships its own navbar and search
	 * and hides the normal sidebar — every piece of Bunood chrome stands down
	 * there via the data-bnd-desktop attribute (chrome/_sidebar.scss).
	 *
	 * RESTORED AFTER A CHERRY-PICK ATE IT. Porting the v16 compatibility commit
	 * onto this branch deleted this definition while leaving its call in the
	 * router handler, and `node --check` passed — removing a whole function
	 * leaves valid JS, exactly as CLAUDE.md warns. The desk threw
	 * `update_desktop_mode is not defined` on every route change.
	 */
	/**
	 * Is this Frappe's Desktop page — the module grid?
	 *
	 * TWO ADDRESSES, ONE PAGE. The EMPTY route renders the grid as the desk's
	 * landing, and `/app/desktop` reaches the same Page explicitly. Only the
	 * empty spelling was recognised here, which stopped mattering the moment
	 * `land_on_home` started sending the empty route away: the grid would have
	 * kept its tiles but lost our styling and sprite icons at the one address
	 * that still showed it.
	 *
	 * @param {string[]} route
	 * @returns {boolean}
	 */
	function on_desktop_route(route) {
		// THE URL SETTLES BEFORE FRAPPE'S ROUTE ARRAY. During a direct load or a
		// native transition get_route() can still describe the page we just left;
		// that race made the Dashboard return appear only on alternating All Apps
		// loads. Use the requested address to settle every explicit page first,
		// then consult the route array only for the genuinely bare desk address.
		const path = String(location.pathname || "").replace(/\/+$/, "").toLowerCase();
		if (path === "/desk/desktop" || path === "/app/desktop") return true;
		if (path !== "/desk" && path !== "/app" && path !== "") return false;

		// Frappe briefly returns null while its router resolves during boot. Treat
		// that transient state as the empty route instead of reading `.length`
		// from null and aborting the rest of the chrome mount.
		if (!Array.isArray(route)) route = [];
		if (!route.length) return true;
		if (route.length === 1 && !route[0]) return true;
		return route.length === 1 && String(route[0]).toLowerCase() === "desktop";
	}

	/**
	 * Send the desk's EMPTY route to the Bunood home.
	 *
	 * WHY A REDIRECT AND NOT A SETTING. `frappe.boot.home_page` is the
	 * supported lever, and it cannot reach this: `boot.add_home_page` resolves
	 * the value through `frappe.desk.desk_page.get()`, so it names a **Page**
	 * record, while our home is a **Workspace**. Measured on this site — the
	 * only landing Page that exists is `desktop`, and there is no `Workspaces`
	 * Page to point at. So the empty route is redirected here instead.
	 *
	 * NOTHING LOSES ITS ADDRESS. "All Apps" goes to `/apps`, Frappe's app
	 * switcher, not to this grid — so it is untouched. The grid itself keeps
	 * `/app/desktop`, which `on_desktop_route` now recognises, and a user who
	 * asks for it explicitly is not bounced.
	 */
	function land_on_home() {
		if (!theme_active()) return;

		// THE URL DECIDES, NOT THE ROUTER'S CURRENT ANSWER.
		//
		// `frappe.get_route()` is transiently EMPTY while v16's desk shell does
		// its own boot routing, so keying on it alone made this steal
		// navigations meant for other pages: a visit to /desk/todo was bounced
		// to the home the moment the router had not resolved yet, and the
		// caller then waited out its full timeout for a selector on a page it
		// never opened. The suite has a comment about exactly this failure mode
		// for its own navigations; this added a second source of it, and 21
		// checks went red in one subset — every `container:` and `invariant:`
		// case, all of them 30s selector timeouts rather than assertions.
		//
		// The pathname is what the USER asked for and does not flicker. Only
		// the bare desk root lands on the home; any deeper address is left
		// alone whatever the router happens to be reporting mid-boot.
		const path = String(location.pathname || "").replace(/\/+$/, "");
		if (path !== "/desk" && path !== "/app" && path !== "") return;

		const route = frappe.get_route ? frappe.get_route() || [] : [];
		const empty = !route.length || (route.length === 1 && !route[0]);
		if (!empty) return;
		go_home();
	}

	function update_desktop_mode() {
		const route = frappe.get_route ? frappe.get_route() || [] : [];
		const on_desktop = on_desktop_route(route);
		document.documentElement.toggleAttribute("data-bnd-desktop", on_desktop);
		// The Desktop page is cached. Never let the ownership stamp from that
		// page leak onto an ordinary workspace while the router is swapping the
		// visible container; `sync_desktop_shell` will claim it again after the
		// current route's controls have actually mounted.
		if (!on_desktop) document.documentElement.removeAttribute("data-bnd-desktop-shell");
		// The grid is built asynchronously and has no "ready" event, so this
		// polls with a bounded budget like every other mount here. Driven from
		// this one function because it already runs at mount AND on every route
		// change, which is exactly when a tile can appear.
		if (on_desktop) try_for(mount_desktop_icons, 40, 150);
	}

	/** Release Frappe's phone-only inline three-column lock to responsive CSS. */
	function sync_desktop_grid() {
		if (!document.documentElement.hasAttribute("data-bnd-desktop")) return;
		for (const grid of document.querySelectorAll(".desktop-wrapper .icons")) {
			if (is_narrow()) {
				// desktop.js writes `repeat(3, 1fr)` inline below 768, making the
				// grid wider than a 390px viewport after padding and gaps. The Bunood
				// narrow rule owns the responsive count, so release that one inline
				// declaration while leaving Frappe's inline `display: grid` intact.
				grid.style.removeProperty("grid-template-columns");
			}
		}
	}

	/**
	 * Make the All Apps page choose ONE global shell.
	 *
	 * Frappe's Desktop page owns a private `.desktop-navbar` while every other
	 * desk page uses the normal shell. Bunood also mounts its configured shell,
	 * so allowing both to render produces two searches, two bells and two user
	 * menus. It was previously hidden only when a TOP BAR existed; the exact
	 * moment responsive mode removed that bar, Frappe's private navbar returned
	 * on top of the mobile bottom navigation.
	 *
	 * Ownership is now based on the outcome: once a Bunood search has landed in
	 * a real shell, that whole shell owns global navigation and the Desktop-only
	 * navbar stands down. If no Bunood shell materialises, the stamp is absent
	 * and Frappe remains the fail-open fallback.
	 *
	 * The bottom strip changes jobs below 768 too. Give assistive technology the
	 * role it is actually performing: status region on desktop, primary
	 * navigation on a phone.
	 */
	function sync_desktop_shell() {
		const html = document.documentElement;
		sync_desktop_grid();
		const search = document.querySelector(".bnd-search-field, .bnd-search-icon");
		const shell = search && search.closest(".bnd-topbar, .bnd-statusbar, .bnd-dock, .page-head");
		html.toggleAttribute(
			"data-bnd-desktop-shell",
			html.hasAttribute("data-bnd-desktop") && !!shell
		);

		const bar = document.querySelector(".bnd-statusbar");
		if (!bar) return;
		const mobile = is_narrow();
		bar.toggleAttribute("data-bnd-mobile-nav", mobile);
		bar.setAttribute("role", mobile ? "navigation" : "region");
		bar.setAttribute("aria-label", mobile ? __("Primary navigation") : __("Status bar"));
	}

	/**
	 * The sprite symbol for a module tile on the Desktop grid.
	 *
	 * A tile's `data-id` is sometimes a workspace name ("Invoicing", "Payments")
	 * and sometimes a module name ("Accounting", "Framework"), so both are
	 * asked. `frappe.boot.allowed_workspaces` carries the icon the site itself
	 * chose for each workspace — the same value the side pane renders — which is
	 * why this reads per-site data rather than a table in here: a hand-written
	 * module list cannot cover a custom module, a third-party app or a site
	 * running in another language, and the version this replaces had exactly
	 * that problem.
	 *
	 * @param {string} id - the tile's `data-id`.
	 * @returns {string} a sprite id that is safe to render.
	 */
	function desktop_symbol(id, label) {
		const boot = (window.frappe && frappe.boot) || {};
		const spaces = boot.allowed_workspaces || [];
		const want = String(id || "");

		let hit = spaces.find((w) => w && w.name === want);
		if (!hit) {
			// Module name: take the first workspace the module owns.
			const owned = (boot.module_wise_workspaces || {})[want];
			const first = Array.isArray(owned) ? owned[0] : null;
			if (first) hit = spaces.find((w) => w && w.name === first);
		}
		if (hit && hit.icon) return ws_symbol(hit.icon);

		// INFER, rather than settle for a folder. Measured on this stack: nine
		// of twenty-one tiles name neither a workspace nor a module that owns
		// one — "Payments", "Taxes", "Accounts Setup" — and a grid where nine
		// tiles are the same folder glyph is not a set, it is a shrug. This is
		// the SAME keyword table the sidebar and breadcrumbs already infer
		// from, so a tile and its side-pane entry agree on the glyph.
		for (const [re, candidates] of SB_ICON_HINTS) {
			if (re.test(want) || (label && re.test(label))) {
				const found = sb_existing_symbol(candidates);
				if (found) return found;
			}
		}
		return ws_symbol(null);
	}

	/**
	 * Give each Desktop tile an icon from Frappe's own sprite.
	 *
	 * WHY OURS AND NOT FRAPPE'S OWN `<img>`
	 *   The stock tile ships a raster-ish per-module SVG in whatever colours its
	 *   app chose, so a grid mixes half a dozen palettes. A sprite symbol is a
	 *   stroke drawing that inherits `currentColor`, which is what lets the grid
	 *   read as one set.
	 *
	 * WHY THE NATIVE ICON IS HIDDEN FROM AN OUTCOME, NOT A DECLARATION
	 *   `data-bnd-deskicon` is stamped on the container AFTER ours is in it, and
	 *   the stylesheet hides the native sibling only from that mark — the same
	 *   polarity as `data-bnd-own`. A mount that fails therefore leaves the
	 *   stock icon on screen rather than an empty tile, which is the failure
	 *   mode worth having. The version this replaces hid the native icon
	 *   unconditionally and fetched a replacement from a third-party CDN, so an
	 *   unreachable CDN meant a grid of empty squares.
	 *
	 * @returns {boolean} true once tiles have been seen, for `try_for`.
	 */
	function mount_desktop_icons() {
		const tiles = document.querySelectorAll(".desktop-wrapper .desktop-icon");
		if (!tiles.length) return false;
		for (const tile of tiles) {
			const host = tile.querySelector(".icon-container");
			if (!host || host.querySelector(".bnd-deskicon")) continue;
			const caption = tile.querySelector(".icon-title, .icon-caption");
			const label = caption ? caption.textContent.trim() : "";
			const svg = sprite_icon(desktop_symbol(tile.getAttribute("data-id"), label));
			svg.classList.add("bnd-deskicon");
			host.appendChild(svg);
			// Frappe's alphabet fallback writes a random plate colour inline.
			// Reports is one such tile on this site, so the inline declaration beats
			// the shared Bunood plate even after our icon has replaced the fallback.
			// Once the replacement succeeds, the host belongs to this icon system and
			// must use the same token as every other module.
			host.style.removeProperty("background-color");
				host.setAttribute("data-bnd-deskicon", "");
		}
		sync_desktop_grid();
		return true;
	}

	/**
	 * Route to the first-class Home workspace, not Desk's empty route. Frappe
	 * v16 keeps it as a standard workspace while /desk itself is only a shell
	 * that self-redirects forever when a brand chip sends the user there.
	 */
	function go_home() {
		frappe.set_route("home");
	}

	// A desk language change needs new translations and the matching RTL/LTR
	// bundle. Persist only the signed-in User, then reload the same page.
	let language_switch_pending = false;
	function language_choice() {
		return String(frappe.boot.lang || "en").split(/[-_]/)[0] === "ar"
			// Language choices use their own names so the destination remains
			// recognisable even when the current interface language is unfamiliar.
			? { code: "en", label: "English", title: __("Switch to English") }
			: { code: "ar", label: "العربية", title: __("Switch to Arabic") };
	}

	async function switch_desk_language() {
		if (language_switch_pending || !frappe.session?.user || frappe.session.user === "Guest") return;
		// Include cached forms: a user may have navigated away from an edit.
		const dirty = Object.values(window.locals || {}).some(records =>
			Object.values(records || {}).some(doc => doc?.__unsaved && !doc.parenttype));
		if (dirty) {
			frappe.msgprint(__("Save or discard your unsaved changes before switching language."));
			return;
		}
		language_switch_pending = true;
		const buttons = document.querySelectorAll('[data-bnd-part="language"]');
		buttons.forEach(btn => { btn.disabled = true; btn.setAttribute("aria-busy", "true"); });
		try {
			const choice = language_choice();
			// Native save checks User permissions and clears that user's boot cache.
			const response = await frappe.call({
				method: "frappe.client.set_value",
				args: { doctype: "User", name: frappe.session.user, fieldname: "language", value: choice.code },
				freeze: true,
				freeze_message: __("Switching language..."),
			});
			if (response.exc || response.message?.language !== choice.code) throw new Error("Language update failed");
			window.location.reload();
		} catch (error) {
			frappe.msgprint(__("Could not switch language. Please try again."));
		} finally {
			language_switch_pending = false;
			buttons.forEach(btn => { btn.disabled = false; btn.removeAttribute("aria-busy"); });
		}
	}

	function build_language_button() {
		const choice = language_choice();
		const btn = el("button", "bnd-icon-btn bnd-language-btn", {
			type: "button", title: choice.title, "aria-label": choice.title,
			"data-bnd-part": "language",
		});
		// Only the autonym changes language; the accessible label uses the UI's.
		const label = el("span", "", { lang: choice.code, dir: choice.code === "ar" ? "rtl" : "ltr" });
		label.textContent = choice.label;
		btn.appendChild(label);
		btn.addEventListener("click", switch_desk_language);
		return btn;
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
		// is retired: Website for everyone, Home where the sidebar is gone.
		// Asks the DOM, not the layout: this item exists because the side pane
		// — which normally carries the Home route — is not reachable. Since
		// the container split that is a question about the PANE, not about
		// which layout is active, and the menu is built on click so the honest
		// answer is available by then.
		if (sidebar_is_hidden()) {
			items.push({ label: __("Home"), icon: "icon-home", run: go_home });
		}
		items.push({
			label: __("Website"),
			icon: "icon-web",
			run: () => frappe.ui.toolbar.view_website(),
		});
		items.push("divider");

		// The top bar stands down on phones and some layout presets. Keep the
		// same account action reachable through the existing profile menu.
		items.push({ label: language_choice().label, icon: "icon-web", run: switch_desk_language });
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
		// Getting Started (item 42) — argument in _layouts.scss. The pane has to be
		// USABLE, not merely present: the vendor mounts its widget into the pane, so
		// on a desk with no side pane the row would open something nobody can see.
		// `.click()` fires on a hidden element, which is what makes this a silent
		// no-op rather than an error.
		if (!sidebar_is_hidden() && document.querySelector(".body-sidebar .onboarding-sidebar:not(.hidden)")) {
			items.push({
				label: __("Getting Started"),
				icon: "icon-user-check",
				run: () => proxy_click(".body-sidebar .onboarding-sidebar"),
			});
		}
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
	function native_pane_usable(tenant) {
		// This check runs only AFTER ownership was released, so inspect the real
		// tenant rather than treating a visible container as proof. A compact rail
		// keeps the container visible while clipping its stock footer; that false
		// positive removed the last user-menu route. Geometry plus hit-testing asks
		// the product question directly: can a person actually operate it now?
		const selectors = {
			inbox: ".body-sidebar .sidebar-notification .item-anchor, .body-sidebar .sidebar-notification",
			user: ".body-sidebar .sidebar-user-button",
		};
		const control = document.querySelector(selectors[tenant] || "");
		if (!control || control.offsetParent === null) return false;
		const style = getComputedStyle(control);
		const rect = control.getBoundingClientRect();
		if (
			style.display === "none" || style.visibility === "hidden" ||
			style.pointerEvents === "none" || rect.width < 20 || rect.height < 20 ||
			rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight
		) return false;
		const hit = document.elementFromPoint(
			Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
			Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
		);
		return !!(hit && (control === hit || control.contains(hit) || hit.contains(control)));
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
	// REGISTRY ORDER, not append-at-the-end: `registry.default_desk_order()` reads
	// the components table top to bottom and `start` sits before `apps` there, so
	// spelling it last here would be a second copy that disagrees about ties.
	const DESK_ORDER_DEFAULT = ["search", "inbox", "user", "home", "start", "apps"];
	const PART_TO_KEY = { search: "search", bell: "inbox", user: "user", home: "home", apps: "apps", start: "start" };

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
			// The start button (item 42, slice 7). It replaces no native, so its
			// token is its own and releasing it costs nothing — the pane keeps its
			// handle and Frappe's page-title toggle either way.
			["start", "start", "bnd-sb-start", build_start],
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
				if (existing.length && !native_pane_usable(tenant)) {
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
	/** The start button — argument in _sidebar.scss. */
	function build_start() {
		const btn = el("button", "bnd-icon-btn bnd-sb-start", {
			type: "button",
			"data-bnd-part": "start",
			"aria-label": __("Menu"),
			title: __("Menu"),
			// FROM THE LIVE STATE, not a constant. Built false, it announced a pane
			// that was plainly open as collapsed until the first click corrected it —
			// and the first click is exactly when a screen-reader user has already
			// been told the wrong thing.
			"aria-expanded":
				document.documentElement.getAttribute("data-bnd-sb-panestate") === "open" ? "true" : "false",
		});
		const mark = el("span", "bnd-sb-start-mark");
		if (frappe.boot.bnd_logo) {
			mark.appendChild(el("img", "bnd-sb-brand-logo", { src: frappe.boot.bnd_logo, alt: "" }));
		} else {
			mark.classList.add("bnd-sb-brand-initial");
			mark.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
		}
		btn.appendChild(mark);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			bunood.pane_toggle();
		});
		return btn;
	}

	/** Open the pane if it is away, put it back if it is not. */
	bunood.pane_toggle = function () {
		if (!sb_state) return;
		const html = document.documentElement;
		const container = document.querySelector(".body-sidebar-container");
		// In Rail, the bar's Menu control is the rail control. Reuse it instead
		// of creating a second button or changing the saved pane state.
		if (html.getAttribute("data-bnd-sb-panestate") === "rail" && !is_narrow() && container?._bnd_toggle_rail) {
			container._bnd_toggle_rail();
			return;
		}
		const away = html.getAttribute("data-bnd-sb-panestate") !== "open";
		bunood.pane_state(away ? "Open" : "Hidden");
		for (const b of document.querySelectorAll(".bnd-sb-start")) {
			b.setAttribute("aria-expanded", away ? "true" : "false");
		}
	};

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
		const label = el("span", "bnd-mobile-nav-label");
		label.textContent = __("Notifications");
		bell.appendChild(label);
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
		const label = el("span", "bnd-mobile-nav-label");
		label.textContent = __("Profile");
		avatar.appendChild(label);
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
	// KEYED ON THE CATALOGUE'S NAMES, slugified — so renaming a layout renames
	// these keys, and item 42 did exactly that. Every desk fell through to the
	// old `topbar` row for one suite run: on the shipped pane-first desk, search
	// asked for a top bar that is not there and landed in the STATUS STRIP
	// instead of the pane. The `|| ` default below is what made it silent.
	const SEARCH_FALLBACKS = {
		// The shipped desk: everything is in the pane, so the pane is where a
		// homeless search belongs.
		unifiedsidepane: ["sbtop", "sbbottom", "botcenter", "botedge"],
		// The rail is still a pane: it expands, and a search that lands in it is
		// THE KEY CARRIES THE PLUS. `layout()` lowercases and strips WHITESPACE and
		// nothing else, so "Rail + Flyout" arrives as `rail+flyout` — not a bare
		// identifier, so it is quoted. assertLayoutSlugs checks it against the
		// catalogue either way.
		"rail+flyout": ["sbtop", "sbbottom", "botcenter", "botedge"],
		// The taskbar IS the strip this layout is about.
		taskbar: ["botcenter", "botedge", "sbtop", "sbbottom"],
		toptaskbar: ["topcenter", "topedge", "botcenter", "botedge", "sbtop", "sbbottom"],
		// The dock FIRST, not the status bar. This layout hides the sidebar and
		// may have no status bar at all, so the pill is the one piece of chrome
		// guaranteed to be there — and putting search anywhere else here leaves
		// the pill's own controls split across two strips.
		floatingbar: ["dock", "botcenter", "botedge"],
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
		const named = SEARCH_FALLBACKS[layout()];
		if (named) return named;
		// A custom composition has no catalogue name. Resolve it from the live
		// containers instead of pretending it is a top taskbar: an available side
		// pane is the least intrusive home when no top bar or dock exists, while a
		// bottom-only shell remains the final fail-open route.
		if (container_on("dock")) return SEARCH_FALLBACKS.floatingbar;
		if (container_on("topbar")) return SEARCH_FALLBACKS.toptaskbar;
		if (container_on("sidepane")) return SEARCH_FALLBACKS.unifiedsidepane;
		if (container_on("bottombar")) return SEARCH_FALLBACKS.taskbar;
		return SEARCH_FALLBACKS.toptaskbar;
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
			sync_desktop_shell();
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
			sync_desktop_shell();
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
				// `zone_in` RESERVES the cluster and its three zones, so this cannot
				// come back empty for a host that exists, and the host is checked above.
				// The first draft carried a fallback to the bar's old `.bnd-search-center`
				// slot for "a bar with no cluster yet" — a state reserve_cluster makes
				// unreachable, so it was a branch that could never run pretending to be a
				// safety net.
				zone_in(host, "center").appendChild(field);
			} else {
				host.insertBefore(field, host.firstChild);
			}
		}
		// Claimed only once the field is in the document — this is the line
		// that hides Frappe's own search row, so it must not run a moment
		// earlier than the replacement actually existing.
		bnd_own("search");
		sync_desktop_shell();
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
		zone_in(bar, "end").appendChild(build_language_button());
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

		// Density: an icon at the trailing edge (item 42); words in the label.
		if (status_on("status_segments_density")) {
			const density = el("button", "bnd-status-item bnd-status-density", {
				type: "button",
				"data-bnd-prio": "2",
			});
			density.appendChild(sprite_icon("icon-list-alt"));
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
		const label = __("Density: {0}", [value ? __(value) : __("Auto")]);
		// The glyph stays; the words go to AT and to the tooltip.
		status_refs.density.setAttribute("aria-label", label);
		status_refs.density.title = label;
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
		const outgoing_cluster = outgoing && outgoing.querySelector(".bnd-cluster");
		const wait_for_swap = !!outgoing_cluster;
		try_for(() => {
			const page = frappe.container && frappe.container.page;
			if (!page) return false;
			// List-to-list navigation can reuse the SAME page object and replace
			// its head in place. Waiting only for object identity therefore waits
			// forever and leaves the new list without a cluster. Wait while the
			// actual outgoing cluster is connected; once Frappe detaches it, the
			// reused page is a valid incoming host.
			if (wait_for_swap && page === outgoing && outgoing_cluster.isConnected) {
				inbox_ensure_badges();
				return false;
			}
			const section = page.querySelector(".page-head .standard-items-section");
			if (!section) return false;
			if (section.querySelector(".bnd-cluster")) {
				// Already there, but the stamp is per-DOCUMENT and the page is
				// per-ROUTE: arriving back on a cached page that still has its
				// cluster must re-assert the attribute, or a navigation away
				// and back leaves the stylesheet believing there is no cluster.
				container_mounted("pagehead");
				mount_placed_tenants();
				inbox_ensure_badges();
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
		// Frappe's search options retain stable English values for routing. Paint
		// the localized label, and run highlighting over that presentation string;
		// otherwise fuzzy_search replaces a translated label with its English
		// marked_string (for example "Item" on an Arabic palette).
		const display = __(opt.label || opt.value || "");
		let marked = frappe.utils.escape_html(display);
		if (txt && frappe.search.utils.fuzzy_search) {
			const scored = frappe.search.utils.fuzzy_search(txt, display, true);
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
			// Dedupe WITHIN each group as well as across. Use the visible label,
			// not only the route: v16 emits one frequent-link option per view
			// (`List/Item/List` and `List/Item/Image`) but labels both "Item
			// List". Two indistinguishable rows are not two useful choices; keep
			// the higher-ranked one. The key remains the fallback for icon-only
			// or otherwise unlabeled options.
			const identity = (row) => row.marked || row.plain || row.key;
			const uniq = (rows) => {
				const seen = new Set();
				return rows.filter((r) => !seen.has(identity(r)) && seen.add(identity(r)));
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
			const kept = new Set(frequents.map(identity));
			const shown = new Set(frequents.map(reads));
			const recents = uniq(pal_source("get_recent_pages", "").map((o) => pal_row(o, "recent", "")))
				.filter((r) => !kept.has(identity(r)))
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
	function pal_open_global_search(txt) {
		let search = frappe.searchdialog && frappe.searchdialog.search;
		// Toolbar.setup_help() now skips construction when notifications are
		// disabled. The SearchDialog class is still shipped; create it only when
		// the user asks for the fallback instead of silently dropping the row.
		if (!search && frappe.search && frappe.search.SearchDialog) {
			search = new frappe.search.SearchDialog();
			frappe.provide("frappe.searchdialog");
			frappe.searchdialog.search = search;
		}
		if (search && search.open_global_search_dialog) search.open_global_search_dialog(txt);
		else if (search && search.init_search) search.init_search(txt, "global_search");
	}

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
		if ((frappe.searchdialog && frappe.searchdialog.search) || (frappe.search && frappe.search.SearchDialog)) {
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
				onclick: () => pal_open_global_search(txt),
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
		});
		// Execute only after mouse-up. Removing the palette on mouse-down
		// exposes the underlying dashboard to the remainder of the click.
		// This also gives assistive activation the same single action path.
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
	let palette_mounted = false;
	function mount_palette() {
		if (!pal_state || palette_mounted) return;
		palette_mounted = true;
		// Frappe registers its standard shortcuts after app_include_js has
		// loaded. add_shortcut() removes the previous callback for a combo, so
		// registering here was only temporarily correct: Frappe's later Ctrl+K
		// registration silently replaced ours on every real desk load. Own the
		// gesture at the capture boundary instead. This also prevents the base
		// input handler from opening the native awesomebar behind our shell when
		// focus is inside a dialog. Original/Refined still call Frappe's own
		// function through pal_invoke, so their behaviour remains native.
		document.documentElement.dataset.bndPaletteKey = "1";
		document.addEventListener(
				"keydown",
				(ev) => {
					if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
					if (String(ev.key || "").toLowerCase() !== "k") return;
					ev.preventDefault();
					ev.stopImmediatePropagation();
					pal_invoke();
				},
				true
			);
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

	// Shortcut ownership is independent of visual chrome. Bind from boot as
	// soon as the bundle is evaluated; waiting for the asynchronous desk-shell
	// mount coupled Ctrl+K to unrelated sidebar work on cold loads.
	mount_palette();

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
	let inbox_observer = null;
	function inbox_observe() {
		if (!inbox_state || !window.MutationObserver || inbox_observer) return;
		inbox_observer = new MutationObserver((records) => {
			if (inbox_paint_queued) return;
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1) continue;
					// Frappe can replace the complete native notification row
					// after our initial retry has already decorated the outgoing
					// one. React to that host arriving as well as to our own badge
					// arriving; otherwise Classic and an "Off" placed bell lose
					// the count permanently on cold loads and route changes.
					const native_arrived =
						(node.matches && node.matches(".sidebar-notification, .sidebar-notification .item-anchor")) ||
						(node.querySelector && node.querySelector(".sidebar-notification .item-anchor"));
					if (
						native_arrived ||
						node.classList.contains("bnd-inbox-badge") ||
						node.querySelector(".bnd-inbox-badge")
					) {
						inbox_paint_queued = true;
						requestAnimationFrame(() => {
							inbox_paint_queued = false;
							inbox_ensure_badges();
						});
						return;
					}
				}
			}
		});
		inbox_observer.observe(document.body, { childList: true, subtree: true });
	}

	// Badge continuity is a DOM lifecycle concern, independent of the chosen
	// chrome. Watch before Frappe constructs or replaces its native row; the
	// deferred pass also covers a row that already exists at bundle time.
	inbox_observe();
	setTimeout(() => inbox_ensure_badges(), 0);

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
	let inbox_mounted = false;
	function mount_inbox() {
		if (!inbox_state || inbox_mounted) return;
		inbox_mounted = true;
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

	// The native Classic bell and realtime/router hooks do not depend on a
	// themed container. Register them from boot immediately, just like the
	// palette shortcut, so a delayed chrome mount cannot leave a painted bell
	// that still opens the wrong panel.
	mount_inbox();

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
		brand.addEventListener("click", go_home);
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
			// The brand is the pane's single, durable route to the dashboard. It
			// remains a named 40px target when the pane becomes an icon rail, so a
			// collapsed sidebar never turns the identity mark into dead decoration.
			const brand = el("button", "bnd-sb-brand", {
				type: "button",
				title: __("Dashboard"),
				"aria-label": __("Dashboard"),
			});
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
			brand.addEventListener("click", go_home);
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

	/** What Hidden leaves behind — argument in _sidebar.scss. */
	function sb_mount_pill() {
		if (document.querySelector(".bnd-sb-pill")) return;
		const pill = el("div", "bnd-sb-pill");
		const mark = el("span", "bnd-sb-brand-mark");
		if (frappe.boot.bnd_logo) {
			mark.appendChild(el("img", "bnd-sb-brand-logo", { src: frappe.boot.bnd_logo, alt: "" }));
		} else {
			mark.classList.add("bnd-sb-brand-initial");
			mark.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
		}
		pill.appendChild(mark);
		const name = el("span", "bnd-sb-brand-name bnd-sb-pill-name");
		name.textContent = frappe.boot.bnd_company || __("Home");
		pill.appendChild(name);
		const back = el("button", "bnd-icon-btn bnd-sb-pill-open", {
			type: "button",
			title: __("Show the side pane"),
			"aria-label": __("Show the side pane"),
		});
		back.appendChild(sprite_icon("icon-sidebar-expand"));
		back.addEventListener("click", () => bunood.pane_state("Open"));
		pill.appendChild(back);
		document.body.appendChild(pill);
	}

	/** Remove it — the mirror, for CONTAINER_TEARDOWN. */
	function sb_teardown_pill() {
		for (const n of document.querySelectorAll(".bnd-sb-pill")) n.remove();
	}

	/** The pane's state, page-locally — argument in _sidebar.scss. */
	bunood.pane_state = function (value) {
		if (!sb_state) return;

		bunood.sb_apply({ sidebar_pane_state: value });
		// The guard runs at MOUNT; this is a runtime gesture. _sidebar.scss.
		if (guard_critical_reach()) mount_placed_tenants();
	};

	/** Above the list, below the brand row — the same ladder sb_zone_anchor's
	 *  start branch walks, including the vendor-header rung: without it a pane
	 *  with neither list nor brand row put the place row ABOVE Frappe's own
	 *  header instead of below it. */
	function sb_place_head(sidebar, head) {
		const list = sidebar.querySelector(":scope > .body-sidebar-top");
		if (list) return list.insertAdjacentElement("beforebegin", head);
		const top = sidebar.querySelector(":scope > .bnd-sb-brand") || sidebar.querySelector(":scope > .sidebar-header");
		if (top) return top.insertAdjacentElement("afterend", head);
		return sidebar.insertBefore(head, sidebar.firstChild);
	}

	/** Where you are, or whose desk this is. Two states, both facts. */
	function sb_update_head() {
		const name = document.querySelector(".bnd-sb-head .bnd-sb-head-name");
		if (!name) return;
		const ws = sb_current_workspace;
		const label = (ws && __(ws.title || ws.name)) || frappe.boot.bnd_company || __("Home");
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
		// No settle here: `sb_mount_aria`'s observer watches `data-state` and mirrors
		// whenever the vendor actually writes it, however long that takes.
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
				label: __(w.title || w.name),
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
	 * in a SPAN so the row has stable, addressable text across pane layouts.
	 */
	function build_quick_link(which, in_bar) {
		const is_home = which === "home";
		const on_desktop = on_desktop_route(frappe.get_route ? frappe.get_route() || [] : []);
		// The module grid hides the side pane, so its route back is a labelled
		// destination rather than another unexplained square glyph in the global
		// chrome. On every other route the same setting keeps its compact shape.
		const is_desktop_return = is_home && in_bar && on_desktop;
		const title = is_desktop_return ? __("Dashboard") : is_home ? __("Home") : __("All Apps");
		const bar_title = in_bar && is_narrow() && is_home ? __("Dashboard") : title;
		// "All Apps" goes to the DESKTOP, not to `/apps`.
		//
		// `/apps` is Frappe's app SWITCHER, and it only has something to switch
		// between when a site runs more than one desk app. On this one it
		// server-redirects straight back to `/desk` — measured: a request to
		// /apps returns 200 at the URL /desk — so the control looked dead. A
		// user clicking "All Apps" was returned to the page they were already
		// on, with no error to explain it.
		//
		// `desktop` is the module grid — 41 tiles here, Accounting through
		// Framework — which is what the label actually promises. It is a normal
		// route, so it keeps its address and the back button works; and it is
		// NOT hijacked by `land_on_home`, which only claims an empty path.
		const run = is_home
			? go_home
			: () => {
					frappe.set_route("desktop");
			  };

		if (in_bar) {
			const btn = el(
				"button",
				`bnd-icon-btn bnd-sb-util${is_desktop_return ? " bnd-dashboard-return" : ""}`,
				{
				type: "button",
				title: bar_title,
				"aria-label": bar_title,
				"data-bnd-part": which,
				}
			);
			if (is_home) btn.appendChild(sprite_icon("icon-home"));
			else btn.innerHTML = BND_GRID_SVG;
			// One DOM shape survives a breakpoint change: labels are visually
			// hidden in desktop icon clusters, exposed as the caption of every
			// phone-nav destination, and also exposed for the Dashboard return on
			// the sidebar-free All Apps page.
			const label = el(
				"span",
				`bnd-mobile-nav-label${is_desktop_return ? " bnd-dashboard-return-label" : ""}`
			);
			label.textContent = is_narrow() ? (is_home ? __("Dashboard") : __("Apps")) : title;
			btn.appendChild(label);
			if (is_home && on_home_route()) {
				btn.classList.add("is-current");
				btn.setAttribute("aria-current", "page");
			}
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
		// links: on a phone Home and All Apps move into the bottom bar
		// (NARROW_PLACEMENT), without touching either stored setting.
		const place = (which) => {
			const configured = active_placement(which) || "Side Pane Start";
			// The Desktop/All Apps route intentionally hides the side pane. It must
			// never become a navigation dead end: on THIS route Home is the labelled
			// Dashboard action in the top bar even when the ordinary Home shortcut is
			// configured Off or assigned to another region. The stored preference is
			// still respected everywhere else.
			const route = frappe.get_route ? frappe.get_route() || [] : [];
			const desktop = on_desktop_route(route);
			// A shortcut to the page already being shown is duplicate chrome, not
			// navigation. Replace All Apps with the reciprocal Dashboard route.
			if (which === "apps" && desktop) return "Off";
			// Use the end zone: in rail mode the top bar deliberately spans back
			// across the rail at its logical start, so a wide labelled control there
			// would begin outside the viewport. The end is the stable global-actions
			// cluster in both LTR and RTL.
			if (which === "home" && desktop) {
				// Keep the route in the SAME live shell as search. This makes the
				// labelled return survive Top Bar, Bottom Bar, Dock and the narrow
				// phone collapse instead of hard-coding a host that may not exist.
				const search = document.querySelector(".bnd-search-field, .bnd-search-icon");
				const owner = region_of_node(search);
				const candidates = [owner, "topbar", "bottombar", "dock"].filter(
					(value, index, all) => value && all.indexOf(value) === index
				);
				for (const region of candidates) {
					if (!["topbar", "bottombar", "dock"].includes(region)) continue;
					// A labelled destination belongs beside the desktop bar's other
					// global actions, away from its absolutely-centred search. On a
					// phone the placement scaffolds are flattened into an ordered grid,
					// so Start remains the honest narrow preset value.
					const zone = region === "topbar" || (region === "bottombar" && !is_narrow())
						? "end"
						: "start";
					if (host_for(region, zone)) {
						const name = Object.entries(PLACEMENT_REGIONS).find(([, key]) => key === region)?.[0];
						if (name) return `${name} ${zone.charAt(0).toUpperCase() + zone.slice(1)}`;
					}
				}
			}
			return configured;
		};

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
			// THROUGH THE SAME ANCHOR AS EVERY OTHER TENANT (item 42). These links
			// used to carry their own -- `afterend` of the head -- and that was one
			// position until the head split in two: the Start zone now anchors ABOVE
			// the place row, so a bell at Side Pane Start sat above it and Home sat
			// below, from the same words in the same picker. enforce_desk_order could
			// not tell them apart either, because it sorts siblings and these were
			// never in one run.
			sb_zone_anchor(sidebar, zone || "start", utils);
		}
		sb_band_prune();
		enforce_desk_order();
	}

	/** A 2x2 grid glyph of our own — no sprite id for "apps" is guaranteed. */
	const BND_GRID_SVG =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
		'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
		'<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
	/** Split-panel glyph for the single top-bar sidebar toggle. */
	const BND_PANEL_SVG =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
		'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>';


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
	 * The collapsible desktop sidebar. Active only in "Rail" mode for backwards
	 * compatibility with the saved setting name. Closed is a compact, interactive
	 * icon rail; open is the complete navigation pane. Frappe writes inline widths
	 * of its own, so this function owns the container width while CSS makes the
	 * inner pane follow that one source of truth.
	 *
	 * One quiet split-panel button in the top bar owns the state. Nothing is
	 * attached to the pane edge, and hover never changes navigation state.
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
			container._bnd_sync_rail?.();
			sb_mount_topbar_toggle(container);
			// Already wired; remount released the token — re-claim.
			bnd_own("panetoggle");
			return;
		}
		container.dataset.bndRail = "1";
		container._bnd_rail_teardown = [];
		const on = (target, event, fn, options) => {
			target.addEventListener(event, fn, options);
			container._bnd_rail_teardown.push(() => target.removeEventListener(event, fn, options));
		};
		const label_compact_items = () => {
			for (const item of container.querySelectorAll(".sidebar-items > .sidebar-item-container.section-item > .standard-sidebar-item")) {
				const label = item.querySelector(".sidebar-item-label")?.textContent?.trim();
				if (!label) continue;
				const owned = new Set((item.dataset.bndRailOwned || "").split(" ").filter(Boolean));
				if (!item.hasAttribute("title")) { item.title = label; owned.add("title"); }
				if (!item.hasAttribute("aria-label")) { item.setAttribute("aria-label", label); owned.add("aria-label"); }
				if (!item.hasAttribute("role")) { item.setAttribute("role", "button"); owned.add("role"); }
				if (!item.hasAttribute("tabindex")) { item.tabIndex = 0; owned.add("tabindex"); }
				item.dataset.bndRailSection = "1";
				item.dataset.bndRailOwned = [...owned].join(" ");
			}
		};

		const sync_toggle = () => {
			const narrow = is_narrow();
			// Sidebar expansion is a desktop layout state. If zooming or resizing
			// crosses Frappe's mobile boundary, release it before the fixed 220px
			// column can crush the phone workspace; Frappe's own drawer owns
			// navigation there.
			if (narrow) {
				container.classList.remove("bnd-rail-open", "expanded");
			}
			// A collapsible sidebar without its one top-bar control would be a
			// permanently hidden navigation system. Degrade that configuration to
			// an ordinary expanded column; when the bar exists, the user owns the
			// state through its toggle.
			if (!narrow && !document.querySelector(".bnd-topbar")) {
				container.classList.add("bnd-rail-open");
			}
			const expanded = !narrow && container.classList.contains("bnd-rail-open");
			// The container is the only width owner. A second width on the inner
			// pane is what produced the broken 52px strip inside a 220px shell.
			container.style.width = narrow
				? ""
				: expanded
					? "var(--bnd-sb-w)"
					: "var(--bnd-sb-rail-w)";
			const sidebar = container.querySelector(".body-sidebar");
			if (sidebar) {
				if (narrow) {
					sidebar.removeAttribute("aria-hidden");
					sidebar.removeAttribute("inert");
				} else {
					sidebar.setAttribute("aria-hidden", "false");
					sidebar.removeAttribute("inert");
				}
			}
			label_compact_items();
			for (const button of document.querySelectorAll(".bnd-sidebar-toggle")) {
				button.setAttribute("aria-expanded", expanded ? "true" : "false");
				const label = expanded ? __("Retract sidebar") : __("Expand sidebar");
				button.setAttribute("aria-label", label);
				button.title = label;
			}
		};
		container._bnd_sync_rail = sync_toggle;
		container._bnd_toggle_rail = () => {
			if (is_narrow()) {
				sync_toggle();
				return;
			}
			container.classList.toggle("bnd-rail-open");
			sync_toggle();
		};
		sync_toggle();
		// Escape is the only secondary gesture, and only closes. It is not a
		// competing visible control and gives keyboard users a safe exit.
		on(document, "keydown", (e) => {
			if (e.key !== "Escape" || !container.classList.contains("bnd-rail-open")) return;
			container.classList.remove("bnd-rail-open");
			sync_toggle();
		});
		// The native section headers are generic divs. Once the compact rail turns
		// them into primary controls, give keyboard users the same open-and-select
		// behaviour as a pointer click.
		on(container, "keydown", (e) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			const section = e.target.closest("[data-bnd-rail-section]");
			if (!section) return;
			e.preventDefault();
			section.click();
		});
		// A section icon is a preview of the full navigation tree, not a tiny
		// accordion. Open the pane before the native click expands that section.
		on(container, "click", (e) => {
			if (is_narrow() || container.classList.contains("bnd-rail-open")) return;
			const section = e.target.closest(".sidebar-items > .sidebar-item-container.section-item > .standard-sidebar-item");
			if (!section) return;
			container.classList.add("bnd-rail-open");
			sync_toggle();
		}, true);
		sb_mount_topbar_toggle(container);
	}

	/** Mount (or restore after a chrome remount) the sidebar's only visible control. */
	function sb_mount_topbar_toggle(container) {
		if (is_narrow()) {
			for (const node of document.querySelectorAll('[data-bnd-rail-toggle="created"]')) node.remove();
			for (const node of document.querySelectorAll('[data-bnd-rail-toggle="reused"]')) {
				if (node._bnd_start_markup !== undefined) {
					node.innerHTML = node._bnd_start_markup;
					delete node._bnd_start_markup;
				}
				node.classList.remove("bnd-sidebar-toggle");
				node.removeAttribute("data-bnd-rail-toggle");
			}
			return;
		}
		const bar = document.querySelector(".bnd-topbar");
		if (!bar || bar.querySelector(".bnd-sidebar-toggle")) return;
		const sidebar = container.querySelector(".body-sidebar");
		if (sidebar && !sidebar.id) sidebar.id = "bnd-primary-sidebar";
		const expanded = container.classList.contains("bnd-rail-open");
		const label = expanded ? __("Retract sidebar") : __("Expand sidebar");
		// A taskbar already has a Menu button in this exact host. Make that the
		// rail toggle; two adjacent buttons for one pane was the original defect.
		const start = bar.querySelector('.bnd-sb-start[data-bnd-part="start"]');
		if (start) {
			// The tenant normally carries the brand mark. While it owns rail
			// expansion it must communicate that action as clearly as ChatGPT's
			// panel control; save the mark so leaving Rail restores it exactly.
			start._bnd_start_markup = start.innerHTML;
			start.innerHTML = BND_PANEL_SVG;
			start.classList.add("bnd-sidebar-toggle");
			start.setAttribute("data-bnd-rail-toggle", "reused");
			start.setAttribute("aria-label", label);
			start.setAttribute("aria-expanded", expanded ? "true" : "false");
			start.setAttribute("aria-controls", (sidebar && sidebar.id) || "bnd-primary-sidebar");
			start.title = label;
			bnd_own("panetoggle");
			return;
		}
		const button = el("button", "bnd-sidebar-toggle", {
			type: "button",
			"data-bnd-rail-toggle": "created",
			"data-bnd-part": "panetoggle",
			"aria-label": label,
			"aria-expanded": expanded ? "true" : "false",
			"aria-controls": (sidebar && sidebar.id) || "bnd-primary-sidebar",
			title: label,
		});
		button.innerHTML = BND_PANEL_SVG;
		button.addEventListener("click", () => container._bnd_toggle_rail?.());
		bar.insertBefore(button, bar.firstChild);
		bnd_own("panetoggle");
	}

	/**
	 * Apply the configured pane width. Collapsible mode's OPEN width and the
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
		// Pane state is the higher-level contract. "Open" cannot inherit a stale
		// vendor collapse from a previous route or layout and render as a 51px
		// ghost column. Synchronize Frappe's STATE, not just its class: changing
		// only the class leaves `sidebar_expanded` and localStorage saying false,
		// so the next native render immediately folds it again.
		if (document.documentElement.getAttribute("data-bnd-sb-panestate") === "open") {
			if (!container.classList.contains("expanded")) {
				try {
					localStorage.setItem("sidebar-expanded", "true");
				} catch (_error) {
					/* a storage-denied desk can still use the in-memory state */
				}
				const native = window.frappe?.app?.sidebar;
				if (native?.wrapper?.[0] === container && typeof native.expand_sidebar === "function") {
					native.sidebar_expanded = true;
					native.expand_sidebar();
				} else {
					// Early boot: Frappe will read the persisted value when its instance
					// arrives; the class keeps first paint at the same width meanwhile.
					container.classList.add("expanded");
				}
			}
		}
		// Frappe's class still owns a person's manual collapse outside pane-state
		// transitions; this function only sizes whichever state is now current.
		container.style.width = container.classList.contains("expanded") ? "var(--bnd-sb-w)" : "";
	}

	/** Undo everything sb_mount_rail did, for previews that leave rail mode. */
	function sb_teardown_rail(container) {
		for (const node of document.querySelectorAll('[data-bnd-rail-toggle="created"]')) node.remove();
		for (const node of document.querySelectorAll('[data-bnd-rail-toggle="reused"]')) {
			if (node._bnd_start_markup !== undefined) {
				node.innerHTML = node._bnd_start_markup;
				delete node._bnd_start_markup;
			}
			node.classList.remove("bnd-sidebar-toggle");
			node.removeAttribute("data-bnd-rail-toggle");
			node.removeAttribute("aria-controls");
			node.setAttribute(
				"aria-expanded",
				document.documentElement.getAttribute("data-bnd-sb-panestate") === "open" ? "true" : "false"
			);
			node.setAttribute("aria-label", __("Menu"));
			node.title = __("Menu");
		}
		bnd_disown("panetoggle");
		if (!container.dataset.bndRail) return;
		delete container.dataset.bndRail;
		delete container._bnd_toggle_rail;
		delete container._bnd_sync_rail;
		container.style.width = "";
		container.classList.remove("bnd-rail-open", "bnd-rail-pinned");
		for (const off of container._bnd_rail_teardown || []) off();
		container._bnd_rail_teardown = [];
		for (const item of container.querySelectorAll("[data-bnd-rail-section]")) {
			for (const attr of (item.dataset.bndRailOwned || "").split(" ").filter(Boolean)) item.removeAttribute(attr);
			delete item.dataset.bndRailOwned;
			delete item.dataset.bndRailSection;
		}
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

		// The resize strip resizes only. Pane state belongs to the dedicated
		// navigation control; allowing Frappe's click-to-collapse handler to run
		// here creates a second, unlabeled collapse control on the pane edge.
		handle.addEventListener("click", (e) => {
			const state = document.documentElement.getAttribute("data-bnd-sb-panestate");
			if (state !== "open" && state !== "rail") return;
			e.stopImmediatePropagation();
			e.preventDefault();
		}, true);

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
		// NOT the band — it is a shell for somebody else's nodes. _sidebar.scss.
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
		// The pane's half of a contract with the chrome. _sidebar.scss.
		{ key: "tenants", volatile: false, mount: mount_placed_tenants, unmount: sb_band_prune },
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
		// WATCH THE ATTRIBUTE, do not guess when it changes. This was a click
		// listener that re-mirrored one frame later, and `sb_collapse_all` added a
		// four-frame settle on top; both are guesses about how long the vendor takes
		// to write `data-state`, and both were measured wrong — two sections stayed
		// `aria-expanded="true"` after folding, which tells a screen reader the
		// opposite of what the desk shows. An observer on the attribute itself
		// cannot be early or late.
		const seen = new MutationObserver(() => {
			sb_mirror_disclosure();
			sb_update_rollups();
		});
		seen.observe(list, {
			subtree: true,
			attributes: true,
			// `data-state` ONLY: mirroring writes `aria-expanded`, and watching that
			// too would make this observer its own trigger.
			attributeFilter: ["data-state"],
		});
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
		if (document.querySelector('.body-sidebar-container[data-mode="edit"]')) return true;
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
			panestate: v("sidebar_pane_state", "panestate"),
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
				start_placement: "start",
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

	// ── Bunood Home dashboard ──────────────────────────────────────────────

	const HOME_ROUTE = "home";
	let home_request = 0;
	let home_status_resize_observer = null;

	function home_text(source) {
		return typeof __ === "function" ? __(source) : source;
	}

	function on_home_route() {
		// `|| []` GUARDS THE RETURN, not just the function's existence. The
		// ternary alone asks whether `frappe.get_route` is defined; on Frappe
		// v16 it is defined and RETURNS NULL while the router is still
		// resolving — measured on `/app/item`, where `route[0]` then threw
		// `Cannot read properties of null` out of the boot-time
		// `mount_chrome` -> `mount_home_dashboard` chain.
		const route = (window.frappe && frappe.get_route ? frappe.get_route() : null) || [];
		// A public workspace URL such as /desk/home is normalised by Frappe's
		// router to ["Workspaces", "Home"]. Testing route[0] alone therefore
		// sees "Workspaces", not "home", and the dashboard never mounts.
		// Keep the direct form for older Frappe builds and derive the workspace
		// name from the current standard route for v16.
		const head = String(route[0] || "").toLowerCase();
		const workspace = head === "workspaces"
			? route[1] === "private"
				? route[2]
				: route[1]
			: route[0];
		const slug = window.frappe && frappe.router && frappe.router.slug
			? frappe.router.slug(String(workspace || ""))
			: String(workspace || "").trim().toLowerCase().replace(/\s+/g, "-");
		return slug === HOME_ROUTE;
	}

	function home_host() {
		let page = frappe.container && frappe.container.page;
		if (page && page.jquery) page = page[0];
		// All workspaces share Frappe's one data-page-route="Workspaces"
		// container. Use the current container instead of a document query:
		// cached page containers remain in the DOM and a generic selector can
		// otherwise mount into a hidden page during router transitions.
		if (!page || String(page.getAttribute("data-page-route") || "").toLowerCase() !== "workspaces") {
			return null;
		}
		return page.querySelector(".layout-main-section");
	}

	/**
	 * The sign this site actually prints, and which side of the amount it goes.
	 * Filled from `api.get_home_dashboard`; empty until the first payload.
	 */
	let home_sign = { code: "", symbol: "", right: false };

	/** Record the site's currency sign from a dashboard payload. */
	function home_sign_from(data) {
		home_sign = {
			code: data.currency || "",
			symbol: data.currency_symbol || "",
			right: !!data.currency_symbol_on_right,
		};
	}

	/**
	 * Money, with the site's own sign on the site's own side.
	 *
	 * NOT `Intl`'s currency style, which this used to be: that renders from
	 * CLDR, whose SAR is the letters "SAR". U+20C1 is a 2025 codepoint CLDR
	 * does not map, so the browser could not produce it at any locale — which
	 * is why home read "SAR 1,000" while every list, form and printed invoice
	 * on the same site already read "⃁ 1,000.00". The sign is a fact on the
	 * `Currency` record, so it is fetched. `Intl` still formats the NUMBER.
	 */
	function home_money(value, currency) {
		const amount = Number(value) || 0;
		const language = document.documentElement.lang || "ar";
		let text;
		try {
			text = new Intl.NumberFormat(language, {
				maximumFractionDigits: 0,
				numberingSystem: BND_NUMERALS,
			}).format(amount);
		} catch (e) {
			text = amount.toLocaleString();
		}
		const code = currency || home_sign.code;
		if (!code) return text;
		const known = code === home_sign.code && home_sign.symbol;
		const sign = known ? home_sign.symbol : code;
		// Arabic reads the amount first from the right, then the riyal on
		// the left. Isolate the number LTR inside an RTL amount/sign pair
		// so separators and negative signs keep their order, including when
		// this string appears beside counts in the attention panel.
		if (known && code === "SAR" && /^ar(?:[-_]|$)/i.test(language)) {
			return `\u2067\u2066${text}\u2069 ${sign}\u2069`;
		}
		// The trailing side is a property of THIS site's sign, so a foreign
		// currency keeps the conventional leading ISO code rather than
		// inheriting a placement that was never about it.
		return known && home_sign.right ? `${text} ${sign}` : `${sign} ${text}`;
	}

	/**
	 * @param {string|string[]} symbol - one sprite id, or candidates in
	 *   preference order.
	 *
	 * CANDIDATES, FOR THE SAME REASON `HOME_TASKS` TAKES THEM. Sprite ids move
	 * between upstream versions, and a `<use href>` naming a missing symbol
	 * renders a SILENT EMPTY BOX — right size, no glyph. That shipped on
	 * "Overdue invoices": Lucide renamed `alert-triangle` to `triangle-alert`
	 * and this call site kept the old spelling. Resolving here rather than per
	 * call site gives every home glyph the fallback.
	 */
	function home_icon(symbol, cls) {
		const wrap = el("span", cls || "bnd-home-icon");
		wrap.setAttribute("aria-hidden", "true");
		const list = Array.isArray(symbol) ? symbol : [symbol];
		// A miss costs a glyph, not the row: fall back to the first candidate
		// so the markup is unchanged from today's behaviour when none exist.
		wrap.appendChild(sprite_icon(sb_existing_symbol(list) || list[0]));
		return wrap;
	}

	/**
	 * The work a person actually opens Bunood to do, in the order they do it.
	 *
	 * WHY A TASK ROW AT ALL
	 *   Measured on this desk: the first ACTIONABLE link sits ~580px into an
	 *   800px viewport on Selling, Buying and Stock alike — above it, charts and
	 *   number cards. Every door in the product is a NOUN ("Selling", "Buying"),
	 *   so a person told "invoice this customer" has to already know ERPNext's
	 *   information model to find the verb. This row is the verbs.
	 *
	 *   Capped at five, deliberately. A task row that grows into a menu has
	 *   become the thing it replaced.
	 *
	 * `[doctype, label, symbol candidates]`. Candidates because sprite ids move
	 * between Frappe versions; the first that exists wins and a miss costs a
	 * glyph, not the button.
	 */
	const HOME_TASKS = [
		["Sales Invoice", "New sales invoice", ["icon-invoice", "icon-file", "icon-plus"]],
		["Purchase Invoice", "Record a purchase", ["icon-buying", "icon-shopping-cart", "icon-file"]],
		["Payment Entry", "Receive payment", ["icon-money", "icon-money-coins-1", "icon-file"]],
		["Stock Entry", "Stock entry", ["icon-stock", "icon-package", "icon-file"]],
		["Customer", "New customer", ["icon-users", "icon-user", "icon-organization"]],
	];

	/**
	 * Build the task row, filtered to what this user may actually create.
	 *
	 * A door nobody can open is worse than no door: it teaches a user that the
	 * product lies to them. `frappe.boot.user.can_create` is the same list the
	 * desk's own "+ New" menu is built from, so this cannot drift from what
	 * Frappe would allow. It also filters by doctype EXISTENCE, so a
	 * Frappe-only site (no ERPNext) renders the row it can rather than a row of
	 * dead buttons.
	 *
	 * @param {HTMLElement} host - the actions container.
	 */
	function home_mount_tasks(host) {
		const can = ((window.frappe && frappe.boot && frappe.boot.user) || {}).can_create || [];
		let primary = true;
		for (const [doctype, label, symbols] of HOME_TASKS) {
			if (can.length && can.indexOf(doctype) === -1) continue;
			const symbol = sb_existing_symbol(symbols) || symbols[symbols.length - 1];
			host.appendChild(
				home_action(label, symbol, () => {
					if (doctype === "Sales Invoice" && window.bunood_theme.sales_bill) return window.bunood_theme.sales_bill.newInvoice();
					return frappe.new_doc(doctype);
				}, primary)
			);
			primary = false;
		}
		// Every task filtered out (a very restricted account): say so rather
		// than leaving a bare greeting with an empty strip under it.
		if (!host.children.length) {
			const none = el("p", "bnd-home-tasks-empty");
			none.textContent = home_text("No documents you can create yet");
			host.appendChild(none);
		}
	}

	function home_action(label, symbol, action, primary) {
		const button = el("button", `bnd-home-action${primary ? " is-primary" : ""}`, { type: "button" });
		button.appendChild(home_icon(symbol, "bnd-home-action-icon"));
		const copy = el("span", "");
		copy.textContent = home_text(label);
		button.appendChild(copy);
		button.addEventListener("click", action);
		return button;
	}

	function home_panel(title, subtitle, extra_class) {
		const panel = el("section", `bnd-home-panel ${extra_class || ""}`.trim());
		const head = el("header", "bnd-home-panel-head");
		const copy = el("div", "bnd-home-panel-copy");
		const heading = el("h2", "bnd-home-panel-title");
		heading.textContent = home_text(title);
		copy.appendChild(heading);
		if (subtitle) {
			const sub = el("p", "bnd-home-panel-subtitle");
			sub.textContent = home_text(subtitle);
			copy.appendChild(sub);
		}
		head.appendChild(copy);
		panel.appendChild(head);
		return { panel, head };
	}

	function home_metric(label, value, currency, symbol, tone) {
		const card = el("article", `bnd-home-metric is-${tone}`);
		const top = el("div", "bnd-home-metric-top");
		top.appendChild(home_icon(symbol));
		const caption = el("span", "bnd-home-metric-label");
		caption.textContent = home_text(label);
		top.appendChild(caption);
		const amount = el("strong", "bnd-home-metric-value");
		amount.textContent = home_money(value, currency);
		card.append(top, amount);
		return card;
	}

	/**
	 * One row of "needs your attention": a label, what it is worth, and the
	 * list it opens.
	 *
	 * A BUTTON, NOT A TILE. Every row here exists because there is something to
	 * DO about it, so each one goes somewhere — a filtered list of exactly the
	 * documents it counted. A number a user cannot act on belongs in the
	 * summary strip above, not here.
	 */
	function home_attention_row(label, note, symbol, run) {
		const row = el("button", "bnd-home-attn-row", { type: "button" });
		row.appendChild(home_icon(symbol, "bnd-home-attn-icon"));
		const copy = el("span", "bnd-home-attn-copy");
		const title = el("span", "bnd-home-attn-label");
		title.textContent = home_text(label);
		const sub = el("span", "bnd-home-attn-note");
		sub.textContent = note;
		copy.append(title, sub);
		row.appendChild(copy);
		row.addEventListener("click", run);
		return row;
	}

	/** Match the server classifier; ERPNext's scheduler-updated `status` can lag. */
	function home_invoice_filters(data, kind) {
		const scope = data.invoice_scope || {};
		const filters = { docstatus: 1 };
		if (scope.company) filters.company = scope.company;
		if (scope.from_date) filters.posting_date = [">=", scope.from_date];
		if (kind === "paid") {
			filters.outstanding_amount = ["<=", 0];
		} else {
			filters.outstanding_amount = [">", 0];
			if (scope.as_of) filters.due_date = [kind === "overdue" ? "<" : ">=", scope.as_of];
		}
		return filters;
	}

	function home_open_invoice_list(data, kind) {
		frappe.set_route("List", "Sales Invoice", home_invoice_filters(data, kind));
	}

	function home_stop_status_alignment() {
		if (home_status_resize_observer) home_status_resize_observer.disconnect();
		home_status_resize_observer = null;
	}

	/** Anchor the custom total to the rendered ring, not to its wider panel. */
	function home_align_status_total(visual, total, chart) {
		const slice = chart.querySelector(".donut-path");
		if (!visual.isConnected || !slice) return;
		const visual_box = visual.getBoundingClientRect();
		const slice_box = slice.getBoundingClientRect();
		const center_x = slice_box.left + slice_box.width / 2;
		const center_y = slice_box.top + slice_box.height / 2;
		const rtl = getComputedStyle(visual).direction === "rtl";
		total.style.setProperty("--bnd-home-status-center-inline",
			`${rtl ? visual_box.right - center_x : center_x - visual_box.left}px`);
		total.style.setProperty("--bnd-home-status-center-block", `${center_y - visual_box.top}px`);
		total.dataset.bndAligned = "true";
	}

	/**
	 * "Needs your attention" — the work, not the score.
	 *
	 * The summary strip above answers "how is the business doing". This answers
	 * "what do I have to deal with", which is the question someone opening an
	 * ERP at 9am actually has. Rows appear ONLY when they have something in
	 * them: a panel listing three zeroes teaches a user to stop reading it, so
	 * an empty one says so in a single line instead.
	 *
	 * @param {object} data - the payload from `api.get_home_dashboard`.
	 */
	function home_attention_panel(data) {
		const currency = data.currency;
		const metrics = data.metrics || {};
		const status = data.invoice_status || {};
		const drafts = data.drafts || {};
		const attn = home_panel("Needs your attention", "What to deal with today", "bnd-home-attn-panel");
		attn.head.appendChild(home_icon("icon-bell", "bnd-home-panel-mark"));
		const list = el("div", "bnd-home-attn-list");

		if (status.overdue) {
			list.appendChild(
				home_attention_row(
					"Overdue invoices",
					`${status.overdue} · ${home_money(metrics.overdue, currency)}`,
					["icon-triangle-alert", "icon-alert-triangle", "es-line-alert-triangle", "icon-circle-alert"],
					() => home_open_invoice_list(data, "overdue")
				)
			);
		}
		if (Number(metrics.payables) > 0) {
			list.appendChild(
				home_attention_row(
					"Bills to pay",
					home_money(metrics.payables, currency),
					"icon-buying",
					() => frappe.set_route("List", "Purchase Invoice", { status: "Unpaid" })
				)
			);
		}
		const draft_total = (Number(drafts.sales) || 0) + (Number(drafts.purchase) || 0);
		if (draft_total) {
			list.appendChild(
				home_attention_row(
					"Drafts to finish",
					String(draft_total),
					"icon-edit",
					() => frappe.set_route("List", "Sales Invoice", { docstatus: 0 })
				)
			);
		}

		if (!list.children.length) {
			const clear = el("p", "bnd-home-empty");
			clear.textContent = home_text("Nothing needs your attention");
			list.appendChild(clear);
		}
		attn.panel.appendChild(list);
		return attn.panel;
	}

	function home_render_dashboard(root, data) {
		home_stop_status_alignment();
		root.replaceChildren();
		// Before anything formats money: every home_money() below reads this.
		home_sign_from(data);
		const metrics = data.metrics || {};
		const currency = data.currency || "SAR";
		const hour = new Date().getHours();
		const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

		const intro = el("header", "bnd-home-intro");
		const intro_copy = el("div", "bnd-home-intro-copy");
		const eyebrow = el("span", "bnd-home-eyebrow");
		eyebrow.textContent = data.company || home_text("Bunood");
		const title = el("h1", "bnd-home-title");
		title.textContent = home_text(greeting);
		const subtitle = el("p", "bnd-home-subtitle");
		subtitle.textContent = home_text("Your business at a glance");
		intro_copy.append(eyebrow, title, subtitle);
		const intro_actions = el("div", "bnd-home-intro-actions");
		home_mount_tasks(intro_actions);
		intro.append(intro_copy, intro_actions);
		root.appendChild(intro);

		const summary = el("section", "bnd-home-summary", { "aria-label": home_text("Financial summary") });
		const hero = el("article", "bnd-home-balance");
		const hero_top = el("div", "bnd-home-balance-top");
		hero_top.appendChild(home_icon("icon-wallet", "bnd-home-balance-icon"));
		const hero_label = el("span", "bnd-home-balance-label");
		hero_label.textContent = home_text("Cash and bank balance");
		hero_top.appendChild(hero_label);
		const hero_value = el("strong", "bnd-home-balance-value");
		hero_value.textContent = home_money(metrics.cash_balance, currency);
		const hero_note = el("span", "bnd-home-balance-note");
		hero_note.textContent = home_text("Available across cash and bank accounts");
		hero.append(hero_top, hero_value, hero_note);
		summary.append(
			hero,
			home_metric("Sales this month", metrics.sales_month, currency, "icon-chart-no-axes-column-increasing", "blue"),
			home_metric("Outstanding receivables", metrics.receivables, currency, "icon-receipt-text", "teal"),
			home_metric("Outstanding payables", metrics.payables, currency, "icon-credit-card", "gold")
		);
		root.appendChild(summary);

		const grid = el("div", "bnd-home-grid");
		const trend = home_panel("Sales trend", "Last six months", "bnd-home-trend");
		trend.head.appendChild(home_icon("icon-chart-column", "bnd-home-panel-mark"));
		const trend_rows = Array.isArray(data.trend) ? data.trend : [];
		const trend_chart = el("div", "bnd-home-chart bnd-home-trend-chart", {
			"aria-label": home_text("Sales trend"),
		});
		trend.panel.appendChild(trend_chart);
		grid.appendChild(trend.panel);

		const status = home_panel("Invoice status", "Current sales invoices", "bnd-home-status");
		status.head.appendChild(home_icon("icon-receipt", "bnd-home-panel-mark"));
		const status_body = el("div", "bnd-home-status-body");
		const status_visual = el("div", "bnd-home-status-visual");
		const status_chart = el("div", "bnd-home-chart bnd-home-status-chart", {
			"aria-label": home_text("Invoice status"),
		});
		const invoice_status = data.invoice_status || {};
		const status_rows = [
			["Paid", "paid", "paid", "var(--bnd-good)"],
			["Open", "open", "open", "var(--bnd-cat-1)"],
			["Overdue", "overdue", "overdue", "var(--bnd-critical)"],
		];
		const status_total = status_rows.reduce((sum, item) => sum + (Number(invoice_status[item[1]]) || 0), 0);
		const status_total_copy = el("div", "bnd-home-status-total", { "aria-hidden": "true" });
		const status_total_value = el("strong", "bnd-home-status-total-value");
		status_total_value.textContent = String(status_total);
		const status_total_label = el("span", "bnd-home-status-total-label");
		status_total_label.textContent = home_text("Total");
		status_total_copy.append(status_total_value, status_total_label);
		status_visual.appendChild(status_chart);
		if (status_total) status_visual.appendChild(status_total_copy);
		const status_list = el("div", "bnd-home-status-list");
		for (const item of status_rows) {
			const value = Number(invoice_status[item[1]]) || 0;
			const share = status_total ? Math.round((value / status_total) * 100) : 0;
			const label_text = home_text(item[0]);
			const row = el("button", `bnd-home-status-row is-${item[2]}`, {
				type: "button",
				"aria-label": `${label_text}: ${value} (${share}%)`,
			});
			const marker = el("span", "bnd-home-status-marker", { "aria-hidden": "true" });
			row.addEventListener("click", () => home_open_invoice_list(data, item[1]));
			const line = el("div", "bnd-home-status-line");
			const label = el("span", "bnd-home-status-label");
			label.textContent = label_text;
			const count = el("strong", "bnd-home-status-count");
			count.textContent = String(value);
			line.append(label, count);
			const percentage = el("span", "bnd-home-status-share");
			percentage.textContent = `${share}%`;
			row.append(marker, line, percentage);
			status_list.appendChild(row);
		}
		status_body.append(status_visual, status_list);
		status.panel.appendChild(status_body);
		grid.appendChild(status.panel);

		const recent = home_panel("Recent activity", "Latest invoices", "bnd-home-recent-panel");
		recent.head.appendChild(home_icon("icon-activity", "bnd-home-panel-mark"));
		const recent_list = el("div", "bnd-home-recent-list");
		for (const item of data.recent || []) {
			const row = el("button", "bnd-home-recent", { type: "button" });
			row.appendChild(home_icon(item.doctype === "Sales Invoice" ? "icon-arrow-up-right" : "icon-arrow-down-left", "bnd-home-recent-icon"));
			const copy = el("span", "bnd-home-recent-copy");
			const party = el("strong", "bnd-home-recent-party");
			party.textContent = item.party || item.name;
			const meta = el("span", "bnd-home-recent-meta");
			meta.textContent = `${home_text(item.doctype)} · ${item.name}`;
			copy.append(party, meta);
			const value = el("span", `bnd-home-recent-value${Number(item.amount) < 0 ? " is-out" : ""}`);
			value.textContent = home_money(Math.abs(Number(item.amount) || 0), item.currency || currency);
			row.append(copy, value);
			row.addEventListener("click", () => frappe.set_route("Form", item.doctype, item.name));
			recent_list.appendChild(row);
		}
		if (!recent_list.children.length) {
			const empty = el("p", "bnd-home-empty");
			empty.textContent = home_text("No recent activity");
			recent_list.appendChild(empty);
		}
		recent.panel.appendChild(recent_list);
		grid.appendChild(recent.panel);

		// THE "QUICK ACTIONS" PANEL IS GONE, and its two creation entries with
		// it. It offered "Create invoice" and "Record payment" — the same two
		// doctypes the task row at the top of this page now offers as "New
		// sales invoice" and "Receive payment". Two labels for one action is
		// worse than either alone: a user cannot tell whether they differ, so
		// they hesitate over both. Nine buttons in two rows was exactly the
		// "too much, nothing pops" the task row exists to answer.
		//
		// Its other two entries were navigation, not creation — the Account
		// list and the General Ledger — and both are one click away in the side
		// pane, which now carries its labels on every workspace.
		// WORK BEFORE REPORTING. The trend and status panels are built above
		// because their data arrives with everything else, but they must READ
		// after the two panels someone opens this page to act on: what needs
		// attention, and what just happened. Moving the nodes rather than
		// reordering the construction keeps each panel's build next to the data
		// it reads — and moving them changes the tab order with the visual
		// order, which a CSS `order` would not have done.
		const attention = home_attention_panel(data);
		grid.prepend(attention);
		attention.after(recent.panel);
		root.appendChild(grid);

		// Native workspaces, dashboards, reports and Home now share Frappe Charts.
		requestAnimationFrame(() => {
			if (!trend_chart.isConnected || typeof frappe.Chart !== "function") return;
			new frappe.Chart(trend_chart, {
				bndAriaLabel: home_text("Sales trend"), type: "bar", height: 320, colors: [],
				data: {
					labels: trend_rows.map((item) => home_text(item.label || "")),
					datasets: [{ name: home_text("Sales"), values: trend_rows.map((item) => Number(item.value) || 0) }],
				},
				axisOptions: { xAxisMode: "tick", yAxisMode: "span", xIsSeries: 1 },
				barOptions: { spaceRatio: 0.45 },
				tooltipOptions: { formatTooltipY: (value) => home_money(value, currency) },
			});
			trend_chart.addEventListener("data-select", (event) => {
				const point = trend_rows[Number(event.index ?? (event.detail && event.detail.index))];
				if (point) frappe.set_route("List", "Sales Invoice", {
					docstatus: 1,
					posting_date: ["between", [point.from_date, point.to_date]],
				});
			});

			const visible_statuses = status_rows
				.map((item) => ({ item, value: Number(invoice_status[item[1]]) || 0 }))
				.filter((entry) => entry.value > 0);
			if (visible_statuses.length) {
				new frappe.Chart(status_chart, {
					bndAriaLabel: home_text("Invoice status"),
					type: "donut",
					height: 280,
					strokeWidth: 34,
					showLegend: 0,
					colors: visible_statuses.map((entry) => entry.item[3]),
					data: {
						labels: visible_statuses.map((entry) => home_text(entry.item[0])),
						datasets: [{
							name: home_text("Current sales invoices"),
							values: visible_statuses.map((entry) => entry.value),
						}],
					},
				});
				const align_total = () => requestAnimationFrame(() =>
					home_align_status_total(status_visual, status_total_copy, status_chart));
				align_total();
				if (typeof ResizeObserver !== "undefined") {
					home_status_resize_observer = new ResizeObserver(align_total);
					home_status_resize_observer.observe(status_chart);
				}
				status_chart.addEventListener("data-select", (event) => {
					const point = visible_statuses[Number(event.index ?? (event.detail && event.detail.index))];
					if (point) home_open_invoice_list(data, point.item[1]);
				});
			} else {
				const empty = el("p", "bnd-home-chart-empty");
				empty.textContent = home_text("No invoice data yet");
				status_chart.appendChild(empty);
			}
		});
	}

	function home_render_error(root) {
		root.replaceChildren();
		const state = el("div", "bnd-home-state");
		state.appendChild(home_icon("icon-circle-alert", "bnd-home-state-icon"));
		const message = el("p", "bnd-home-state-message");
		message.textContent = home_text("Could not load dashboard data");
		state.append(message, home_action("Retry", "icon-refresh-cw", () => mount_home_dashboard(true), true));
		root.appendChild(state);
	}

	function mount_home_dashboard(force) {
		if (!on_home_route()) {
			home_stop_status_alignment();
			for (const host of document.querySelectorAll(".bnd-home-host")) host.classList.remove("bnd-home-host");
			for (const node of document.querySelectorAll(".bnd-home-dashboard")) node.remove();
			return false;
		}
		const host = home_host();
		if (!host) return false;
		host.classList.add("bnd-home-host");
		let root = host.querySelector(":scope > .bnd-home-dashboard");
		if (root && !force) return true;
		if (!root) {
			root = el("main", "bnd-home-dashboard", { "aria-label": home_text("Bunood dashboard") });
			host.appendChild(root);
		}
		home_stop_status_alignment();
		root.replaceChildren();
		const loading = el("div", "bnd-home-state is-loading");
		loading.appendChild(home_icon("icon-loader-circle", "bnd-home-state-icon"));
		const loading_copy = el("p", "bnd-home-state-message");
		loading_copy.textContent = home_text("Loading dashboard");
		loading.appendChild(loading_copy);
		root.appendChild(loading);
		const request = ++home_request;
		frappe.call({
			method: "bunood_theme.api.get_home_dashboard",
			callback: (response) => {
				if (request !== home_request || !root.isConnected || !on_home_route()) return;
				home_render_dashboard(root, response.message || {});
			},
			error: () => {
				if (request === home_request && root.isConnected) home_render_error(root);
			},
		});
		return true;
	}

	// Read-only summaries augment the form; native controls remain untouched.
	// Permission/dependency visibility comes from each live Frappe control, not
	// from the document payload (which can contain values the user cannot see).
	const summary_states = new WeakMap();
	// A review sheet is useful for itemized or financial transactions, not
	// every document with fields. In particular, do not duplicate profile,
	// permission, configuration, master-data, or operational tracking forms.
	// Unknown/custom DocTypes stay native until their review use is assessed.
	const summary_document_types = new Set([
		"Quotation", "Sales Order", "Delivery Note", "Sales Invoice",
		"Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice",
		"Payment Entry", "Journal Entry",
		"Material Request", "Stock Entry", "Stock Reconciliation",
		"Work Order", "Subcontracting Order", "Subcontracting Receipt",
	]);
	function summary_eligible(frm) {
		return !!frm?.doc && !frm.meta?.istable && !frm.meta?.issingle && summary_document_types.has(frm.doctype);
	}
	function unmount_form_summary(frm) {
		const state = summary_states.get(frm);
		if (!state) return;
		clearTimeout(state.timer);
		state.observer?.disconnect();
		$(frm.wrapper).off(".bnd-summary");
		state.root?.remove();
		summary_states.delete(frm);
	}
	function summary_node(tag, cls, text) {
		const node = el(tag, cls);
		if (text != null) node.textContent = text;
		return node;
	}
	const summary_types = new Set(["Data", "Read Only", "Link", "Dynamic Link", "Select", "Date", "Datetime", "Time", "Currency", "Float", "Int", "Percent", "Check", "Small Text", "Text", "Long Text", "Text Editor"]);
	const summary_priority = new Set(["customer", "customer_name", "supplier", "supplier_name", "party", "party_name", "company", "posting_date", "transaction_date", "due_date", "currency", "grand_total", "rounded_total", "outstanding_amount", "paid_amount", "received_amount", "total_qty", "total_taxes_and_charges", "discount_amount", "status"]);

	function summary_text(value, df, doc) {
		if (df.fieldtype === "Check") return Number(value) ? __("Yes") : __("No");
		// Format with ERPNext's own currency/precision policy, then keep text
		// only. User HTML can never become executable summary markup.
		const markup = frappe.format(value, df, { inline: true }, doc);
		return new DOMParser().parseFromString(markup, "text/html").body.textContent || "";
	}

	function summary_data(frm) {
		const fields = [];
		const tables = [];
		for (const field of frm.fields || []) {
			const df = field.df;
			if (!df || typeof field.get_status !== "function" || df.hidden || df.hidden_due_to_dependency || field.get_status() === "None") continue;
			if (field.tab?.is_hidden()) continue;
			if (field.$wrapper?.closest(".hide-control, .hidden-section").length) continue;
			const value = frm.doc[df.fieldname];
			if (df.fieldtype === "Table" && Array.isArray(value) && value.length) {
				// Only columns already exposed by the native grid are repeated.
				const cols = (field.grid?.visible_columns || []).map(c => c[0]).filter(c =>
					!c.hidden && !c.depends_on && !c.hidden_due_to_dependency && !Number(c.permlevel) && summary_types.has(c.fieldtype));
				if (cols.length) tables.push({ name: df.fieldname, label: __(df.label), cols: cols.map(c => __(c.label)), rows: value.map(row => cols.map(c => summary_text(row[c.fieldname], c, row))) });
				continue;
			}
			if (!summary_types.has(df.fieldtype) || value == null || value === "" || (df.fieldtype === "Check" && !Number(value))) continue;
			fields.push({ name: df.fieldname, label: __(df.label), value: summary_text(value, df, frm.doc), key: summary_priority.has(df.fieldname), total: ["grand_total", "rounded_total", "outstanding_amount", "paid_amount", "received_amount"].includes(df.fieldname) });
		}
		return { fields, tables, pending: !!frm.doc.__unsaved };
	}

	function render_form_summary(frm, state) {
		// Recheck at render too: a queued refresh must not resurrect a summary
		// after its form context stops being eligible.
		if (!summary_eligible(frm)) { unmount_form_summary(frm); return; }
		if (window.cur_frm !== frm || !document.documentElement.hasAttribute("data-bnd-form")) return;
		const host = frm.layout?.wrapper?.[0];
		if (!host?.isConnected) return;
		const data = summary_data(frm);
		const signature = JSON.stringify(data);
		if (signature === state.signature && state.root?.isConnected) return;
		state.signature = signature;
		const expanded = !!state.root?.querySelector("details")?.open;
		const root = state.root || el("section", "bnd-form-summary");
		state.root = root;
		root.setAttribute("data-bnd-part", "form-summary");
		root.setAttribute("aria-label", __("Document summary"));
		root.replaceChildren();
		const heading = el("header", "bnd-summary-heading");
		heading.appendChild(summary_node("h2", "", __("Document summary")));
		heading.appendChild(summary_node("span", "bnd-summary-state", data.pending ? __("Not Saved") : __(frm.doc.status || frm.doctype)));
		root.appendChild(heading);
		const list = (entries) => {
			const dl = el("dl", "bnd-summary-values");
			for (const entry of entries) {
				const pair = el("div", entry.total ? "bnd-summary-value bnd-summary-total" : "bnd-summary-value");
				pair.setAttribute("data-summary-field", entry.name);
				pair.appendChild(summary_node("dt", "", entry.label));
				const dd = summary_node("dd", "", entry.value);
				dd.setAttribute("dir", "auto");
				pair.appendChild(dd);
				dl.appendChild(pair);
			}
			return dl;
		};
		const key = data.fields.filter(f => f.key);
		root.appendChild(list(key.length ? key : data.fields.slice(0, 6)));
		for (const table of data.tables) {
			const block = el("div", "bnd-summary-table");
			const grid = el("table");
			grid.appendChild(summary_node("caption", "", table.label));
			const head = el("thead"), row = el("tr");
			for (const title of table.cols) { const th = summary_node("th", "", title); th.scope = "col"; row.appendChild(th); }
			head.appendChild(row); grid.appendChild(head);
			const body = el("tbody");
			for (const values of table.rows) {
				const tr = el("tr");
				for (const value of values) { const td = summary_node("td", "", value); td.setAttribute("dir", "auto"); tr.appendChild(td); }
				body.appendChild(tr);
			}
			grid.appendChild(body); block.appendChild(grid); root.appendChild(block);
		}
		const remaining = key.length ? data.fields.filter(f => !f.key) : data.fields.slice(6);
		if (remaining.length) {
			const details = el("details"); details.open = expanded;
			details.appendChild(summary_node("summary", "bnd-summary-more", __("All entered details")));
			details.appendChild(list(remaining)); root.appendChild(details);
		}
		if (!root.isConnected) host.appendChild(root);
	}

	function mount_form_summary(frm) {
		if (!frm?.wrapper) return;
		if (!summary_eligible(frm)) { unmount_form_summary(frm); return; }
		let state = summary_states.get(frm);
		if (!state) {
			state = { root: null, signature: "", timer: null };
			summary_states.set(frm, state);
			state.queue = () => { clearTimeout(state.timer); state.timer = setTimeout(() => render_form_summary(frm, state), 120); };
			$(frm.wrapper).on("dirty.bnd-summary refresh-fields.bnd-summary render_complete.bnd-summary change.bnd-summary", state.queue);
			// Async calculations update native fields after the input event.
			// Ignore our own mutations and render only when values change.
			state.observer = new MutationObserver(records => {
				if (records.some(r => !state.root?.contains(r.target))) state.queue();
			});
			// Frappe hides controls by toggling hide-control, without changing
			// their children. Observe visibility too so stale values disappear.
			state.observer.observe(frm.wrapper, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden"] });
		}
		state.queue();
	}

	$(document).on("form-refresh.bnd-summary", (_event, frm) => mount_form_summary(frm));

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

		// allowed_workspaces is populated later than app_include_js on this v16
		// build. Prepare Home at the first desk mount and let Frappe render the
		// changed native payload once if its sparse shipped list already painted.
		if (prepare_home_sidebar() && on_home_route() && frappe.app?.sidebar?.setup) {
			frappe.app.sidebar.setup("Home");
		}

		// Re-stamp the viewport attributes now the desk is up: the module-scope
		// call ran at load, but this is the point container_on / placement_for
		// below are first asked, so data-bnd-narrow must be current here.
		apply_viewport_mode();

		observe_sidebar_width();
		observe_list_accessibility();
		// Set up BEFORE the bars mount: its MutationObserver is what notices
		// them arriving, so there is no ordering to maintain below.
		observe_bottom_reserve();
		// AT MOUNT AS WELL AS ON ROUTE CHANGE. The router handler alone never
		// fires for the route the desk LOADS on, so a visit that lands on
		// route "" — v16's Desktop page — left `data-bnd-desktop` unstamped and
		// our chrome mounted on top of the Desktop's own header. Measured: the
		// attribute read false on `/desk` until this call came back.
		update_desktop_mode();
		// Same reason: the router handler never fires for the route the desk
		// LOADS on, and a fresh login lands on exactly the empty route this
		// sends to the home.
		land_on_home();
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
		// The brand pill (item 42) — argument in _sidebar.scss.
		if (container_on("sidepane")) sb_mount_pill();
		else sb_teardown_pill();
		sync_desktop_shell();

		// The palette kit owns search invocation in every layout.
		mount_palette();

		// The notification kit owns the bell (and the badge Frappe lacks).
		mount_inbox();
		stamp_appearance_route();
		apply_home_route();

		try_for(() => mount_home_dashboard(), 40, 150);

		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				close_menu();
				update_desktop_mode();
				land_on_home();
				// Restore the complete sidebar after native navigation, including
				// returning from All Apps where its decoration stands down.
				sidepane_sync("route");
				// The home dashboard mounts per route because Frappe swaps the
				// workspace element out from under us. The retry covers the
				// home route only, where the container is built asynchronously
				// and a single synchronous mount lands before it exists.
				mount_home_dashboard();
				if (on_home_route()) try_for(() => mount_home_dashboard(), 40, 150);
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
				sb_mount_utils();
				sync_desktop_shell();
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

// Bunood Bill Workbench: the default full-page presentation of the CURRENT
// native Sales/Purchase Invoice. Advanced mode reveals the same frm.doc.
// No separate document, calculation engine, posting endpoint, or persisted state.
// Native controls + model triggers own all changes. See docs/QUICK-BILL.md.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const instances = new WeakMap();
	const PROFILES = {
		"Sales Invoice": {
			party: "customer", partyDoctype: "Customer", title: "Sales bill", question: "Who are you billing?",
			itemQuestion: "What are you selling?", priceList: "selling_price_list",
			lineFields: ["qty", "rate", "discount_percentage", "warehouse"],
			context: ["company", "posting_date", "due_date", "currency", "selling_price_list"],
			options: ["posting_date", "due_date", "update_stock", "set_warehouse", "currency", "selling_price_list", "payment_terms_template", "po_no"],
			mapped: ["sales_order", "delivery_note", "so_detail", "dn_detail"],
		},
		"Purchase Invoice": {
			party: "supplier", partyDoctype: "Supplier", title: "Purchase bill", question: "Who are you buying from?",
			itemQuestion: "What are you buying?", priceList: "buying_price_list",
			lineFields: ["qty", "rate", "discount_percentage", "warehouse"],
			context: ["company", "posting_date", "due_date", "currency", "buying_price_list"],
			options: ["bill_no", "bill_date", "posting_date", "due_date", "update_stock", "set_warehouse", "currency", "buying_price_list", "payment_terms_template"],
			mapped: ["purchase_order", "purchase_receipt", "po_detail", "pr_detail"],
		},
	};
	// Keep each source literal inside `__()`. Frappe's extractor cannot discover
	// a label hidden behind `__(LINE_LABELS[name])`, which let Unit price ship in
	// English on the Arabic workbench while the catalogue gate stayed green.
	const LINE_LABELS = {
		qty: () => __("Quantity"),
		rate: () => __("Unit price"),
		discount_percentage: () => __("Discount"),
		warehouse: () => __("Warehouse"),
	};
	const profileFor = frm => PROFILES[frm?.doctype];
	const actionState = (doc, dirty) => {
		const draft = Number(doc.docstatus) === 0;
		const savedDraft = draft && !doc.__islocal && !dirty;
		return { draft, savedDraft, showSave: draft && !savedDraft, showSubmit: savedDraft };
	};
	const fieldStatus = (frm, name) => frm.fields_dict[name]?.get_status?.() || "None";
	const canAdd = frm => {
		const grid = frm.fields_dict.items.grid;
		return grid.is_editable() && !grid.cannot_add_rows && !grid.df.cannot_add_rows;
	};
	const canRemove = frm => frm.fields_dict.items.grid.is_editable() && !frm.fields_dict.items.grid.df.cannot_delete_rows;
	function totalField(frm) { return Number(frm.doc.disable_rounded_total) || !frm.fields_dict.rounded_total ? "grand_total" : "rounded_total"; }
	function hasTaxConfiguration(doc) {
		return !!(doc?.taxes_and_charges || (doc?.taxes || []).length);
	}
	function taxLabel(doc, fallback = __("Taxes and charges")) {
		const rows = (doc?.taxes || []).filter(row => row?.account_head || row?.description || row?.rate != null);
		const vatRows = rows.filter(row => /\bvat\b|value added|ضريبة/i.test(`${row.description || ""} ${row.account_head || ""}`));
		if (!rows.length || vatRows.length === rows.length) {
			const rates = [...new Set(vatRows.map(row => Number(row.rate)).filter(Number.isFinite))];
			return rates.length === 1 ? `${__("VAT")} (${rates[0]}%)` : __("VAT");
		}
		return fallback;
	}
	function showSummary(name, doc) {
		return name === "net_total" || name === "total_taxes_and_charges" || !!doc?.[name];
	}
	const RATE_BASED_CHARGE_TYPES = new Set(["On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"]);
	const isVatRow = row => /\bvat\b|value added|ضريبة/i.test(`${row?.description || ""} ${row?.account_head || ""}`);
	function taxConfigurationIssue(doc) {
		const rows = doc?.taxes || [];
		if (doc?.taxes_and_charges && !rows.length) return { code: "empty_template", template: doc.taxes_and_charges, row: 0 };
		const rates = new Map();
		for (let position = 0; position < rows.length; position++) {
			const row = rows[position];
			if (!isVatRow(row) || !row.account_head) continue;
			const rowNumber = Number(row.idx) || position + 1;
			const blank = row.rate == null || (typeof row.rate === "string" && !row.rate.trim());
			const number = Number(row.rate);
			if (RATE_BASED_CHARGE_TYPES.has(row.charge_type) && (blank || !Number.isFinite(number) || number < 0)) {
				return { code: "invalid_rate", account: row.account_head, row: rowNumber };
			}
			if (!blank && Number.isFinite(number) && number >= 0) {
				if (!rates.has(row.account_head)) rates.set(row.account_head, new Map());
				const accountRates = rates.get(row.account_head), key = String(number);
				if (!accountRates.has(key)) accountRates.set(key, []);
				accountRates.get(key).push(rowNumber);
			}
		}
		for (const [account, accountRates] of rates) {
			if (accountRates.size < 2) continue;
			return {
				code: "conflicting_rates", account,
				rates: [...accountRates.keys()].sort((a, b) => Number(a) - Number(b)),
				rows: [...accountRates.values()].flat().sort((a, b) => a - b),
				row: [...accountRates.values()].flat().sort((a, b) => a - b)[0],
			};
		}
		return null;
	}
	function taxIssueMessage(issue) {
		if (issue.code === "empty_template") return __("The selected tax template contains no tax rows. Choose a valid standard, zero-rate, exempt, or out-of-scope template.");
		if (issue.code === "conflicting_rates") return __("Tax issue. Rows: {0}. Conflicting rates: {1}. Use one rate per tax account or separate the rates into different tax accounts.", [issue.rows.join(", "), issue.rates.map(rate => `${rate}%`).join(", ")]);
		return __("Tax issue. Row: {0}. The rate is missing or invalid. Enter a rate, or choose an explicit zero-rate, exempt, or out-of-scope template.", [issue.row]);
	}
	function supports(frm) {
		const d = frm?.doc;
		const p = profileFor(frm);
		return !!(d && p && [0, 1].includes(Number(d.docstatus)) && !d.is_return && !d.is_pos &&
			!d.is_debit_note && !d.is_credit_note && !d.amended_from &&
			fieldStatus(frm, p.party) !== "None" && frm.fields_dict.items?.grid &&
			!(d.items || []).some(r => p.mapped.some(name => r[name])));
	}
	function eligible(frm) {
		return supports(frm) && Number(frm.doc.docstatus) === 0 && !frm.save_disabled &&
			frm.fields_dict.items.grid.is_editable();
	}
	class SerialChanges {
		constructor(active, changed) { this.active = active; this.changed = changed; this.tail = Promise.resolve(); this.count = 0; }
		run(action) {
			this.count++; this.changed();
			const next = this.tail.then(async () => {
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				const result = await action();
				await frappe.after_ajax();
				return result;
			}).finally(() => { this.count--; this.changed(); });
			this.tail = next.catch(() => {});
			return next;
		}
	}
	async function saveDraft(frm) {
		let confirmed = false, failed = false;
		await frm.save("Save", r => { confirmed = !r?.exc; }, null, () => { failed = true; });
		await frappe.after_ajax();
		if (failed || !confirmed || !frm.doc.name || frm.doc.__islocal || frm.is_dirty()) {
			throw Error(__("The draft was not saved. Review the message or open the full invoice."));
		}
	}
	function node(tag, cls, text, parent) {
		const n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		if (parent) parent.append(n);
		return n;
	}
	function button(text, parent, action, primary = false) {
		const b = node("button", `bnd-bill-button${primary ? " bnd-bill-primary" : ""}`, text, parent);
		b.type = "button"; b.addEventListener("click", action); return b;
	}
	class BillWorkbench {
		constructor(frm) {
			this.frm = frm; this.doc = frm.doc; this.profile = profileFor(frm); this.controls = []; this.closed = false; this.simple = true; this.invalid = new Map(); this.pending = new Map(); this.rowViews = new Map(); this.editTimers = new Map();
			this.queue = new SerialChanges(() => this.active(), () => this.busy());
			this.native = frm.$wrapper?.find(".form-layout").first()?.[0];
			this.host = this.native?.parentElement || frm.$wrapper?.[0] || frm.wrapper;
			this.root = node("section", "bnd-bill", null, null);
			if (this.native?.parentElement) this.native.before(this.root); else this.host?.prepend(this.root);
			this.root.setAttribute("data-bnd-part", "sales-bill");
			this.root.setAttribute("aria-label", __(this.profile.title));
			const mode = node("nav", "bnd-bill-mode"); this.root.before(mode); mode.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = button(__("Simple"), mode, () => this.setMode(true), true);
			this.advancedButton = button(__("Advanced"), mode, () => this.fullInvoice());
			const toolbar = node("div", "bnd-bill-toolbar", null, this.root); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", __("Document actions"));
			const commitActions = node("div", "bnd-bill-action-group bnd-bill-action-group-commit", null, toolbar);
			commitActions.setAttribute("role", "group"); commitActions.setAttribute("aria-label", __("Draft actions"));
			const documentActions = node("div", "bnd-bill-action-group bnd-bill-action-group-document", null, toolbar);
			documentActions.setAttribute("role", "group"); documentActions.setAttribute("aria-label", __("Invoice actions"));
			const utilityActions = node("div", "bnd-bill-action-group bnd-bill-action-group-utility", null, toolbar);
			utilityActions.setAttribute("role", "group"); utilityActions.setAttribute("aria-label", __("Invoice tools"));
			this.newButton = this.action(commitActions, __("New"), "F1", () => this.newDocument());
			this.newButton.classList.add("bnd-bill-action-new");
			this.saveButton = this.action(commitActions, __("Save draft"), "F2", () => this.save(), true);
			this.saveButton.classList.add("bnd-bill-action-save");
			this.saveButton.dataset.bndAction = "save";
			this.submitButton = this.action(commitActions, __("Submit document"), null, () => this.submit(), true);
			this.submitButton.classList.add("bnd-bill-action-save");
			this.submitButton.dataset.bndAction = "submit";
			this.partyButton = this.action(documentActions, __(this.profile.partyDoctype), "F3", () => this.partyControl?.set_focus());
			this.deleteButton = this.action(documentActions, __("Delete"), "F4", () => this.removeDocument());
			this.deleteButton.classList.add("bnd-bill-action-danger");
			this.printButton = this.action(documentActions, __("Print"), "F6", () => this.print());
			this.paymentButton = this.action(documentActions, __("Payment"), "F7", () => this.payment());
			this.discountButton = this.action(documentActions, __("Discount"), "F10", () => { this.discount.open = !this.discount.open; this.discount.scrollIntoView({ block: "nearest" }); });
			this.restoreButton = this.action(utilityActions, __("Reload"), "F11", () => this.restore());
			this.searchButton = this.action(utilityActions, __("Find item"), "F12", () => this.picker?.set_focus());
			const intro = node("header", "bnd-bill-intro", null, this.root);
			node("h2", "", __(this.profile.title), intro);
			node("p", "", __("Choose the party, add items, then save or submit when the document is ready."), intro);
			this.status = node("p", "bnd-bill-status", "", this.root);
			this.status.setAttribute("role", "status");
			this.revertButton = button(__("Revert invalid edits"), this.root, () => { for (const key of this.invalid.keys()) this.pending.delete(key); this.invalid.clear(); this.render(); this.message(__("Changes stay in this invoice when you close this view.")); });
			this.revertButton.hidden = true;
			this.editor = node("fieldset", "bnd-bill-editor", null, this.root);
			const layout = node("div", "bnd-bill-layout", null, this.editor);
			const main = node("div", "bnd-bill-main", null, layout);
			const customer = node("section", "bnd-bill-panel", null, main);
			const customerHead = node("header", "bnd-bill-section-head", null, customer);
			node("h3", "", __(this.profile.question), customerHead);
			if ((frappe.boot.user.can_create || []).includes(this.profile.partyDoctype) && fieldStatus(frm, this.profile.party) === "Write") {
				button(__("New {0}", [__(this.profile.partyDoctype).toLowerCase()]), customerHead, () => this.newParty());
			}
			this.partyControl = this.bindControl(customer, frm.fields_dict[this.profile.party], this.doc);
			this.context = node("dl", "bnd-bill-context", null, customer);
			const items = node("section", "bnd-bill-panel", null, main);
			node("h3", "", __(this.profile.itemQuestion), items);
			const search = node("div", "bnd-bill-search", null, items);
			const pickerHost = node("div", "bnd-bill-picker", null, search);
			this.picker = frappe.ui.form.make_control({ parent: pickerHost, render_input: true,
				df: { fieldtype: "Link", fieldname: "quick_bill_item", options: "Item", label: __("Find an item"),
					placeholder: __("Search by item name or code"), only_select: true,
					get_query: () => {
						const source = frm.fields_dict.items.grid.get_field("item_code");
						const query = source.get_query || source.df?.get_query;
						return typeof query === "function" ? query(frm.doc, "Sales Invoice Item", frm.doc.items?.[0]?.name) : query;
					},
				},
			});
			this.picker.$input.attr("aria-label", __("Find an item"));
			this.addButton = button(__("Add item"), search, () => this.addItem(), true);
			this.scanButton = button(__("Scan barcode"), search, () => this.scanItem());
			this.picker.$input.on("keydown.bnd-bill", e => {
				if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.addItem(); }
			});
			node("p", "bnd-bill-hint", __("Select an item, then Add item. Ctrl+Enter adds it from search."), items);
			this.lines = node("div", "bnd-bill-lines", null, items);
			this.rail = node("aside", "bnd-bill-panel bnd-bill-rail", null, layout);
			node("h3", "", __("Bill total"), this.rail);
			this.totals = node("dl", "bnd-bill-totals", null, this.rail);
			this.stock = node("p", "bnd-bill-hint", null, this.rail);
			if (frm.doctype === "Sales Invoice") {
				this.zatca = node("details", "bnd-bill-options", null, this.rail); this.zatca.open = true;
				this.zatca.dataset.bndPart = "zatca-status";
				node("summary", "", __("ZATCA e-invoicing"), this.zatca);
				this.zatcaStatus = node("p", "bnd-bill-hint", __("Checking ZATCA setup…"), this.zatca);
				this.zatcaMeta = node("p", "bnd-bill-hint", "", this.zatca);
				this.zatcaButton = button(__("Refresh status"), this.zatca, () => this.zatcaAction());
				this.zatcaButton.hidden = true;
			}
			const options = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Document options"), options);
			for (const name of this.profile.options) {
				const source = frm.fields_dict[name];
				if (source && fieldStatus(frm, name) !== "None") this.bindControl(options, source, this.doc);
			}
			this.discount = node("details", "bnd-bill-options", null, this.rail);
			node("summary", "", __("Discount and tax"), this.discount);
			for (const name of ["apply_discount_on", "additional_discount_percentage", "discount_amount", "taxes_and_charges"]) {
				const source = frm.fields_dict[name]; if (source && fieldStatus(frm, name) !== "None") this.bindControl(this.discount, source, this.doc);
			}
			const footer = node("footer", "bnd-bill-footer", null, this.root);
			this.footerTotal = node("strong", "bnd-bill-footer-total", "", footer);
			const actions = node("div", "bnd-bill-actions", null, footer);
			this.fullButton = button(__("Advanced form"), actions, () => this.fullInvoice());
			node("p", "bnd-bill-hint", __("A draft does not post accounts, move stock, or record payment. Submission uses the native validation and confirmation flow."), this.rail);
			let popupWasOpen = false;
			this.root.addEventListener("keydown", e => { if (e.key === "Escape") popupWasOpen = !!this.root.querySelector('[aria-expanded="true"]'); }, true);
			this.root.addEventListener("keydown", e => {
				const keys = { F1: () => this.newDocument(), F2: () => this.save(), F3: () => this.partyControl?.set_focus(), F4: () => this.removeDocument(), F6: () => this.print(), F7: () => this.payment(), F10: () => this.discountButton.click(), F11: () => this.restore(), F12: () => this.picker?.set_focus() };
				if (keys[e.key]) { e.preventDefault(); e.stopPropagation(); keys[e.key](); }
				if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); this.save(); }
				if (e.key === "Escape" && !popupWasOpen) { e.preventDefault(); this.fullInvoice(); }
			});
			this.setMode(true); this.render(); this.applyDefaultTax();
		}
		action(parent, label, key, handler, primary = false) {
			const b = button("", parent, handler, primary); b.classList.add("bnd-bill-action");
			node("span", "bnd-bill-action-label", label, b);
			if (key) { node("kbd", "", key, b); b.setAttribute("aria-keyshortcuts", key); }
			return b;
		}
		setMode(simple) {
			this.simple = simple; this.root.hidden = !simple; if (this.native) this.native.hidden = simple;
			this.frm.$wrapper?.toggleClass("bnd-bill-simple-active", simple);
			this.simpleButton?.setAttribute("aria-pressed", String(simple));
			this.advancedButton?.setAttribute("aria-pressed", String(!simple));
			this.simpleButton?.setAttribute("aria-current", simple ? "page" : "false");
			this.advancedButton?.setAttribute("aria-current", simple ? "false" : "page");
		}
		syncDocument() { this.doc = this.frm.doc; }
		show() { this.syncDocument(); this.setMode(true); this.render(); }
		active() { return !this.closed && window.cur_frm === this.frm && this.frm.doc === this.doc && supports(this.frm); }
		busy() {
			const busy = !!this.queue.count || !!this.saving || !!this.closing || !!this.flushing;
			if (this.editor) this.editor.disabled = busy;
			if (this.addButton) this.addButton.disabled = busy || !this.frm.doc[this.profile.party] || !canAdd(this.frm);
			if (this.saveButton) this.saveButton.disabled = busy;
			if (this.submitButton) this.submitButton.disabled = busy;
			if (this.fullButton) this.fullButton.disabled = busy;
			this.root?.setAttribute("aria-busy", String(busy));
		}
		message(text, error = false, action = null) {
			const visible = text === __("Changes stay in this invoice when you close this view.") ? "" : text;
			this.status.replaceChildren(document.createTextNode(visible));
			this.status.classList.toggle("bnd-bill-error", error);
			if (action) {
				const control = button(action.label, this.status, action.run);
				control.classList.add("bnd-bill-status-action");
			}
		}
		showTaxIssue(issue) {
			this.message(taxIssueMessage(issue), true, {
				label: __("Review tax rows in Advanced"),
				run: () => this.openTaxIssue(issue),
			});
		}
		openTaxIssue(issue) {
			this.setMode(false);
			setTimeout(() => {
				if (!issue.row) {
					this.frm.fields_dict.taxes_and_charges?.set_focus?.();
					this.frm.fields_dict.taxes_and_charges?.$wrapper?.[0]?.scrollIntoView({ block: "center" });
					return;
				}
				const field = this.frm.fields_dict.taxes;
				const gridRow = field?.grid?.grid_rows?.find(row => Number(row.doc?.idx) === Number(issue.row));
				gridRow?.toggle_view?.(true);
				setTimeout(() => {
					const rate = gridRow?.grid_form?.fields_dict?.rate;
					if (rate?.set_focus) rate.set_focus();
					else {
						const target = field?.$wrapper?.[0];
						if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
					}
					field?.$wrapper?.[0]?.scrollIntoView({ block: "center" });
				}, 0);
			}, 0);
		}
		async change(action) {
			this.message(__("Updating invoice…"));
			try { await this.queue.run(action); if (this.active()) { if (!this.flushing) this.render(); this.message(__("Changes stay in this invoice when you close this view.")); } }
			catch (e) { this.message(e.message || __("Could not update the invoice. Open the full invoice to review."), true); throw e; }
		}
		bindControl(parent, source, doc, rowField) {
			const frm = this.frm, name = source.df.fieldname;
			const allowed = () => rowField
				? (frm.fields_dict.items.grid.is_editable() ? frappe.perm.get_field_display_status(source.df, doc, frm.perm) : "Read")
				: source.get_status();
			if (allowed() === "None") return;
			const control = frappe.ui.form.make_control({ parent, render_input: true, frm,
				doctype: doc.doctype || frm.doctype, docname: doc.name, doc,
				df: { ...source.df, get_status: allowed },
			});
			control.get_query = source.get_query;
			const nativeSet = control.set_model_value.bind(control);
			const key = `${doc.name}:${name}`;
			const nativeValidate = control.validate_and_set_in_model.bind(control);
			control.validate_and_set_in_model = (value, ...args) => {
				if (value === doc[name] && this.invalid.has(key)) {
					this.invalid.delete(key); control.$input?.attr("aria-invalid", "false");
					control.$wrapper.removeClass("has-error"); this.revertButton.hidden = !this.invalid.size;
					if (!this.invalid.size) this.message(__("Changes stay in this invoice when you close this view."));
				}
				return nativeValidate(value, ...args);
			};
			control.set_model_value = value => {
				const raw = control.$input?.val();
				this.pending.set(key, raw);
				return this.change(async () => {
				if (allowed() !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) throw Error(__("This item is no longer on the invoice."));
				if ((name === "qty" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) ||
					(name === "rate" && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
					throw Error(__("Use a quantity above zero and a price of zero or more."));
				}
				await nativeSet(value); this.invalid.delete(key);
				if (this.pending.get(key) === raw) this.pending.delete(key);
			}).catch(() => {
				if (rowField && !frm.doc.items.some(r => r.name === doc.name)) { this.forgetRow(doc.name); return; }
				this.invalid.set(key, raw); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error"); this.revertButton.hidden = false;
			});
			};
			control.$input?.on("input.bnd-bill", () => {
				this.pending.set(key, control.$input.val());
				// Keep the total current while entering numbers, using the native
				// parser and triggers. Link fields retain native selection/validation.
				if (rowField) {
					clearTimeout(this.editTimers.get(key));
					this.editTimers.set(key, setTimeout(() => {
						this.editTimers.delete(key);
						if (this.active() && this.pending.has(key)) control.set_value(control.get_value()).catch(e => this.message(e.message, true));
					}, 400));
				}
			});
			control.$input?.attr("aria-label", rowField ? `${__(source.df.label)} · ${doc.item_code}` : __(source.df.label));
			if (this.invalid.has(key)) {
				control.set_input(this.invalid.get(key)); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error");
			}
			this.controls.push({ control, rowField, key, doc }); return control;
		}
		async addItem() {
			if (this.queue.count || this.saving) return;
			const code = this.picker.get_value();
			if (!this.frm.doc[this.profile.party]) { this.message(__("Choose the party before adding items."), true); return; }
			if (!code) { this.message(__("Choose an item from the search results."), true); this.picker.set_focus(); return; }
			try {
				await this.change(async () => {
					if (!canAdd(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
					// Reuse ONLY the untouched blank native row. Never merge matching SKUs.
					let row = this.frm.doc.items.find(r => !r.item_code && !r.item_name && !r.description && !r.amount);
					if (!row) {
						row = this.frm.add_child("items");
						await this.frm.script_manager.trigger("items_add", row.doctype, row.name);
					}
					this.frm.refresh_field("items");
					const itemDf = frappe.meta.get_docfield(row.doctype, "item_code", row.name);
					if (frappe.perm.get_field_display_status(itemDf, row, this.frm.perm) !== "Write") throw Error(__("This field is not editable. Use the full invoice."));
					await frappe.model.set_value(row.doctype, row.name, "item_code", code);
					await frappe.after_ajax();
					if (!row.item_code || row.item_code !== code) throw Error(__("The item could not be added. Review the full invoice."));
				});
				await this.picker.set_value(""); this.picker.set_focus();
			} catch (_) { /* Native error and inline status retain the draft. */ }
		}
		async applyDefaultTax() {
			const frm = this.frm, doc = frm.doc;
			const key = `${doc.name || "new"}:${doc.company || ""}`;
			if (this.defaultTaxKey === key || !doc.__islocal || Number(doc.docstatus) !== 0 || !doc.company || hasTaxConfiguration(doc)) return;
			this.defaultTaxKey = key;
			const doctype = frm.doctype === "Purchase Invoice"
				? "Purchase Taxes and Charges Template"
				: "Sales Taxes and Charges Template";
			try {
				const response = await frappe.db.get_value(doctype, { company: doc.company, is_default: 1 }, "name");
				const name = response?.message?.name;
				if (!name || !this.active() || hasTaxConfiguration(frm.doc)) return;
				await this.change(() => frm.set_value("taxes_and_charges", name));
			} catch (_) {
				// The visible zero-VAT line and tax selector remain available. Native
				// validation owns the decision when the user saves or submits.
			}
		}
		async removeItem(row) {
			if (this.queue.count || this.saving) return;
			try {
				await this.change(async () => {
					const grid = this.frm.fields_dict.items.grid;
					const native = grid.grid_rows_by_docname[row.name];
					if (!native || !canRemove(this.frm)) throw Error(__("This field is not editable. Use the full invoice."));
					native.remove();
					// Native remove returns void while awaiting before_items_remove hooks.
					// Observe completion, not an arbitrary delay, and never splice the model.
					await new Promise((resolve, reject) => {
						let attempts = 0;
						const check = () => {
							if (!this.frm.doc.items.some(r => r.name === row.name)) return resolve();
							if (++attempts > 100 || !this.active()) return reject(Error(__("The item was not removed. Review the full invoice.")));
							setTimeout(check, 100);
						}; check();
					});
					this.forgetRow(row.name);
				});
			} catch (_) { /* Keep the native row when hooks refuse removal. */ }
		}
		forgetRow(name) {
			for (const map of [this.invalid, this.pending, this.editTimers]) for (const key of map.keys()) {
				if (!key.startsWith(`${name}:`)) continue;
				if (map === this.editTimers) clearTimeout(map.get(key));
				map.delete(key);
			}
		}
		newParty() {
			if (this.saving || this.closing || this.queue.count || fieldStatus(this.frm, this.profile.party) !== "Write" || !(frappe.boot.user.can_create || []).includes(this.profile.partyDoctype)) return;
			frappe.ui.form.make_quick_entry(this.profile.partyDoctype, doc => {
				if (this.active()) this.change(() => {
					if (fieldStatus(this.frm, this.profile.party) !== "Write") throw Error(__("This field is not editable. Use the advanced form."));
					return this.frm.set_value(this.profile.party, doc.name);
				}).catch(() => {});
			}, null, null, true);
		}
		scanItem() {
			if (!window.frappe?.ui?.Scanner) { this.message(__("Camera scanning is not available in this browser. Type the barcode in item search."), true); return; }
			new frappe.ui.Scanner({ dialog: true, multiple: false, on_scan: data => {
				const value = data?.result?.text; if (!value || !this.active()) return;
				this.picker.set_value(value).then(() => this.addItem());
			} });
		}
		format(value, df, doc = this.doc) {
			// Native precision/currency formatting; HTML stripped before display.
			return new DOMParser().parseFromString(frappe.format(value, df, { inline: true }, doc), "text/html").body.textContent || "";
		}
		money(parent, value, df, doc = this.doc) {
			const wrap = node("span", "bnd-bill-money", null, parent);
			if (this.doc.currency === "SAR") {
				const symbol = node("span", "bnd-bill-riyal", "", wrap); symbol.setAttribute("aria-label", __("Saudi riyal"));
				node("bdi", "", window.format_number(value, window.get_number_format(this.doc.currency), frappe.meta.get_field_precision(df, doc)), wrap);
			} else node("bdi", "", this.format(value, df, doc), wrap);
			return wrap;
		}
		async loadZatca(force = false) {
			if (!this.zatca || !this.active()) return;
			const key = `${this.doc.name || "new"}:${this.doc.docstatus}:${this.doc.company || ""}`;
			if (!force && this.zatcaKey === key) return;
			this.zatcaKey = key;
			const request = this.zatcaRequest = (this.zatcaRequest || 0) + 1;
			this.zatcaStatus.textContent = __("Checking ZATCA setup…");
			try {
				const args = this.doc.__islocal ? { company: this.doc.company } : { invoice_name: this.doc.name, company: this.doc.company };
				const response = await frappe.call({ method: "bunood_theme.zatca.get_status", type: "GET", args });
				if (!this.active() || request !== this.zatcaRequest) return;
				this.zatcaData = response.message || {}; this.renderZatca();
			} catch (error) {
				if (request !== this.zatcaRequest) return;
				this.zatcaStatus.textContent = error.message || __("ZATCA status is temporarily unavailable.");
				this.zatcaStatus.classList.add("bnd-bill-error"); this.zatcaButton.hidden = false;
			}
		}
		renderZatca() {
			const data = this.zatcaData || {}, state = data.state || "missing_app";
			const messages = {
				missing_app: __("The ZATCA connector is not installed on this site."),
				needs_settings: __("Create ZATCA Business Settings for this company."),
				disabled: __("ZATCA integration is disabled for this company."),
				needs_onboarding: __("Complete device onboarding with the OTP from Fatoora."),
				needs_csid: __("Run compliance checks, then obtain the production CSID."),
				ready: __("ZATCA is ready. This invoice will be prepared when it is submitted."),
				preparing: __("The signed invoice is being prepared for ZATCA."),
				ready_to_send: __("The signed invoice is ready to send to ZATCA."),
				accepted: __("ZATCA accepted this invoice."),
				accepted_with_warnings: __("ZATCA accepted this invoice with warnings."),
				rejected: __("ZATCA rejected this invoice. Open the validation record before correcting it."),
				clearance_off: __("ZATCA clearance is switched off. Review the validation record and company settings."),
			};
			this.zatcaStatus.classList.toggle("bnd-bill-error", state === "rejected" || state === "missing_app");
			this.zatcaStatus.textContent = messages[state] || __("ZATCA status is temporarily unavailable.");
			const settings = data.settings || {}, invoice = data.invoice || {};
			this.zatcaMeta.textContent = [settings.server, settings.sync, invoice.integration_status].filter(Boolean).map(value => __(value)).join(" · ");
			let label = "";
			if (["needs_settings", "disabled", "needs_onboarding", "needs_csid", "ready"].includes(state)) label = __("ZATCA settings");
			else if (state === "preparing") label = __("Refresh status");
			else if (state === "ready_to_send" && data.can_queue) label = __("Send to ZATCA");
			else if (invoice.name) label = __("View ZATCA record");
			this.zatcaButton.textContent = label; this.zatcaButton.hidden = !label;
			clearTimeout(this.zatcaTimer);
			if (state === "preparing") this.zatcaTimer = setTimeout(() => this.loadZatca(true), 5000);
		}
		async zatcaAction() {
			const data = this.zatcaData || {}, state = data.state;
			if (state === "missing_app") {
				frappe.msgprint(__("Install and migrate the KSA Compliance app before configuring ZATCA.")); return;
			}
			if (state === "preparing") return this.loadZatca(true);
			if (state === "ready_to_send" && data.can_queue) {
				this.zatcaButton.disabled = true;
				try {
					await frappe.call({ method: "bunood_theme.zatca.queue_invoice", type: "POST", args: { invoice_name: this.doc.name }, freeze: true, freeze_message: __("Queueing invoice for ZATCA…") });
					this.zatcaStatus.textContent = __("Invoice queued for ZATCA. Status will update automatically.");
					setTimeout(() => this.loadZatca(true), 2500);
				} finally { this.zatcaButton.disabled = false; }
				return;
			}
			if (data.invoice?.name) { frappe.set_route("Form", "Sales Invoice Additional Fields", data.invoice.name); return; }
			const route = data.settings?.route;
			if (route?.length) frappe.set_route(...route);
		}
		render() {
			if (this.closed) return;
			this.syncDocument();
			const frm = this.frm, doc = frm.doc;
			this.context.replaceChildren();
			for (const name of this.profile.context) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !doc[name]) continue;
				const pair = node("div", "", null, this.context);
				node("dt", "", __(field.df.label), pair); node("dd", "", this.format(doc[name], field.df), pair);
			}
			const rows = (doc.items || []).filter(r => r.item_code);
			for (const [name, view] of this.rowViews) if (!rows.some(r => r.name === name)) { this.forgetRow(name); view.line.remove(); this.rowViews.delete(name); }
			this.controls = this.controls.filter(c => !c.rowField || rows.some(r => r === c.doc));
			for (const { control, key } of this.controls) {
				control.$input?.attr("aria-invalid", String(this.invalid.has(key)));
				const raw = this.pending.get(key);
				if (control.$input?.[0] === document.activeElement) continue;
				control.refresh();
				if (this.pending.has(key)) control.set_input(raw);
				if (this.invalid.has(key)) { control.set_input(this.invalid.get(key)); control.$input?.attr("aria-invalid", "true"); control.$wrapper.addClass("has-error"); }
			}
			this.revertButton.hidden = !this.invalid.size;
			this.lines.querySelector(".bnd-bill-empty")?.remove();
			if (!rows.length) {
				const empty = node("div", "bnd-bill-empty", null, this.lines);
				node("strong", "", __("Your bill starts here"), empty);
				node("p", "", __("Add your first item. Prices and taxes follow your invoice settings."), empty);
			}
			for (const row of rows) {
				let view = this.rowViews.get(row.name);
				const grid = frm.fields_dict.items.grid;
				if (!view) {
				const line = node("article", "bnd-bill-line", null, this.lines);
					const info = node("div", "bnd-bill-item", null, line);
					node("span", "bnd-bill-hint bnd-bill-item-label", __("Item"), info);
					const itemValue = node("div", "bnd-bill-item-value", null, info);
					node("strong", "", row.item_name || row.item_code, itemValue);
					node("bdi", "bnd-bill-hint", `${row.item_code}${row.uom ? " · " + __(row.uom) : ""}`, itemValue);
				for (const name of this.profile.lineFields) {
					const cell = node("div", "bnd-bill-cell", null, line);
					const df = frappe.meta.get_docfield(row.doctype, name, row.name) || grid.get_docfield(name);
					if (df) this.bindControl(cell, { df: { ...df, label: LINE_LABELS[name]?.() || __(df.label) } }, row, true);
				}
				const amount = node("div", "bnd-bill-line-total", null, line);
					view = { line, info, amount }; this.rowViews.set(row.name, view);
				}
				const { info, amount } = view;
				amount.replaceChildren();
				const df = frappe.meta.get_docfield(row.doctype, "amount", row.name) || grid.get_docfield("amount");
				if (df && frappe.perm.get_field_display_status(df, row, frm.perm) !== "None") {
					node("span", "bnd-bill-hint", __("Amount"), amount); this.money(amount, row.amount, df, row);
				}
				if (!view.remove) { view.remove = button(__("Remove"), view.line, () => this.removeItem(row)); view.remove.classList.add("bnd-bill-line-remove"); view.remove.setAttribute("aria-label", `${__("Remove")} · ${row.item_code}`); }
				if (view.remove) view.remove.hidden = !canRemove(frm);
			}
			this.totals.replaceChildren();
			for (const name of ["net_total", "discount_amount", "total_taxes_and_charges", "rounding_adjustment"]) {
				const field = frm.fields_dict[name];
				if (!field || fieldStatus(frm, name) === "None" || !showSummary(name, doc)) continue;
				const pair = node("div", "", null, this.totals);
				const label = name === "total_taxes_and_charges" ? taxLabel(doc, __(field.df.label)) : __(field.df.label);
				node("dt", "", label, pair); this.money(node("dd", "", null, pair), doc[name] || 0, field.df);
			}
			const totalName = totalField(frm);
			const totalControl = frm.fields_dict[totalName];
			this.footerTotal.replaceChildren();
			if (totalControl && fieldStatus(frm, totalName) !== "None") {
				const pair = node("div", "bnd-bill-grand", null, this.totals);
				node("dt", "", __("Total"), pair); this.money(node("dd", "", null, pair), doc[totalName], totalControl.df);
				this.money(this.footerTotal, doc[totalName], totalControl.df);
			}
			this.stock.textContent = doc.update_stock ? __("Stock will be updated when the invoice is submitted.") : __("Stock is not updated by this invoice.");
			const { draft, showSave, showSubmit } = actionState(doc, this.frm.is_dirty());
			this.addButton.hidden = !draft; this.scanButton.hidden = !draft; this.saveButton.hidden = !showSave;
			this.submitButton.hidden = !showSubmit;
			this.deleteButton.hidden = !draft || !!doc.__islocal; this.paymentButton.hidden = Number(doc.docstatus) !== 1;
			this.printButton.hidden = !!doc.__islocal; this.discountButton.hidden = !draft;
			this.loadZatca();
			this.busy();
		}
		async flush() {
			for (const timer of this.editTimers.values()) clearTimeout(timer);
			this.editTimers.clear();
			// Capture before an awaited native trigger can refresh another input.
			// Clicking Save moves focus to the button before this handler runs.
			const edits = this.controls.filter(({control}) => control.get_status() === "Write")
				.map(({control, key}) => ({ control, key, value: control.get_value() }))
				.filter(({control, key, value}) => this.pending.has(key) || this.invalid.has(key) || value !== control.get_model_value());
			this.flushing = true;
			try {
				await this.queue.tail; await frappe.after_ajax();
				for (const { control, key, value } of edits) { await control.set_value(value); if (!this.invalid.has(key)) this.pending.delete(key); }
				await this.queue.tail; await frappe.after_ajax();
			} finally { this.flushing = false; this.render(); }
		}
		async fullInvoice() {
			if (this.closing || this.saving) return;
			this.closing = true; this.busy();
			try {
				if (Number(this.doc.docstatus) === 0) await this.flush();
				if (this.invalid.size) { this.message(__("Correct the highlighted value before saving."), true); return; }
				this.setMode(false);
			} catch (e) { this.message(e.message || __("Could not update the document. Open the advanced form to review."), true); }
			finally { this.closing = false; this.busy(); }
		}
		async save() {
			if (this.saving || this.closing) return;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (this.invalid.size) throw Error(__("Correct the highlighted value before saving."));
				if (!this.active()) throw Error(__("This invoice is no longer active. Open it again to continue."));
				if (!this.frm.doc[this.profile.party] || !this.frm.doc.items.some(r => r.item_code)) throw Error(__("Choose the party and add at least one item."));
				const taxIssue = taxConfigurationIssue(this.frm.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				await this.queue.run(() => saveDraft(this.frm));
				frappe.show_alert({ message: __("Draft saved. Submit it when it is ready to affect accounts or stock."), indicator: "green" }); this.render();
			} catch (e) { this.message(e.message || __("The draft was not saved. Review the message or open the advanced form."), true); }
			finally { this.saving = false; this.busy(); }
		}
		async submit() {
			if (Number(this.doc.docstatus) !== 0 || this.saving) return;
			this.saving = true; this.busy();
			try {
				await this.flush();
				if (!this.doc[this.profile.party] || !this.doc.items.some(row => row.item_code)) throw Error(__("Choose the party and add at least one item."));
				const taxIssue = taxConfigurationIssue(this.doc);
				if (taxIssue) { this.showTaxIssue(taxIssue); return; }
				if (this.doc.__islocal || this.frm.is_dirty()) await saveDraft(this.frm);
				await this.frm.savesubmit();
			} catch (e) { this.message(e.message || __("The document was not submitted. Review the highlighted fields."), true); }
			finally { this.saving = false; this.render(); this.busy(); }
		}
		newDocument() { return frappe.new_doc(this.frm.doctype); }
		removeDocument() { if (!this.doc.__islocal && Number(this.doc.docstatus) === 0) this.frm.savetrash(); }
		print() { if (!this.doc.__islocal) this.frm.print_doc(); }
		restore() {
			const reload = () => this.frm.reload_doc().then(() => { this.syncDocument(); this.render(); });
			if (this.frm.is_dirty()) frappe.confirm(__("Discard unsaved changes and reload this document?"), reload); else reload();
		}
		payment() {
			if (Number(this.doc.docstatus) !== 1) { this.message(__("Submit the document before recording payment."), true); return; }
			frappe.model.open_mapped_doc({
				method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", frm: this.frm,
			});
		}
	}
	function open(frm) {
		if (!supports(frm)) {
			frappe.msgprint(__("Use the advanced form for this document type or permission level."));
			return;
		}
		if (instances.has(frm)) { instances.get(frm).show(); return; }
		instances.set(frm, new BillWorkbench(frm));
	}
	function newInvoice() {
		return frappe.new_doc("Sales Invoice");
	}
	api.sales_bill = { open, newInvoice, eligible, supports, actionState, SerialChanges, saveDraft, totalField, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, profiles: PROFILES };
	$(document).on("form-refresh.bnd-sales-bill", (_event, frm) => {
		if (!profileFor(frm)) return;
		// form-refresh precedes refresh_fields and native refresh handlers. Wait
		// for that stack and its requests; never judge permissions mid-refresh.
		setTimeout(() => frappe.after_ajax().then(() => {
			if (window.cur_frm !== frm || !supports(frm)) return;
			if (instances.has(frm)) { instances.get(frm).syncDocument(); instances.get(frm).render(); } else open(frm);
		}), 0);
	});
})();

// Bunood Simple mode: progressive disclosure over the CURRENT native Frappe
// form. It does not create controls, copy values, persist a second model, or
// bypass native permissions. Advanced mode removes only Bunood's CSS classes.
/* global frappe, __, $ */
(() => {
	"use strict";
	const api = window.bunood_theme = window.bunood_theme || {};
	const controllers = new WeakMap();
	if (!frappe.has_permission && frappe.perm?.has_perm) {
		frappe.has_permission = (doctype, ptype = "read", name) => frappe.perm.has_perm(
			doctype, 0, ptype, typeof name === "string" ? frappe.get_doc?.(doctype, name) : name
		);
	}
	const EXCLUDED_MODULES = new Set(["Core", "Desk", "Email", "Website", "Printing", "Workflow", "Automation"]);
	const PROFILES = {
		Quotation: ["quotation_to", "party_name", "customer_name", "company", "transaction_date", "valid_till", "currency", "selling_price_list", "order_type", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Sales Order": ["customer", "company", "transaction_date", "delivery_date", "currency", "selling_price_list", "set_warehouse", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Delivery Note": ["customer", "company", "posting_date", "posting_time", "set_warehouse", "items", "total_qty", "grand_total"],
		"Purchase Order": ["supplier", "company", "transaction_date", "schedule_date", "currency", "buying_price_list", "set_warehouse", "items", "taxes_and_charges", "discount_amount", "grand_total"],
		"Purchase Receipt": ["supplier", "company", "posting_date", "posting_time", "set_warehouse", "items", "total_qty", "grand_total"],
		"Material Request": ["material_request_type", "company", "transaction_date", "schedule_date", "set_warehouse", "items", "total_qty"],
		"Stock Entry": ["stock_entry_type", "purpose", "company", "posting_date", "posting_time", "from_warehouse", "to_warehouse", "items", "total_outgoing_value", "total_incoming_value", "value_difference"],
		"Stock Reconciliation": ["company", "purpose", "posting_date", "posting_time", "set_warehouse", "items", "difference_amount"],
		"Pick List": ["purpose", "company", "customer", "parent_warehouse", "locations"],
		"Packing Slip": ["delivery_note", "from_case_no", "to_case_no", "items", "net_weight", "gross_weight"],
		"Payment Entry": ["payment_type", "company", "posting_date", "mode_of_payment", "party_type", "party", "paid_from", "paid_to", "paid_amount", "received_amount", "reference_no", "reference_date", "references", "difference_amount"],
		"Journal Entry": ["voucher_type", "company", "posting_date", "finance_book", "cheque_no", "cheque_date", "accounts", "total_debit", "total_credit", "difference"],
		Customer: ["customer_name", "customer_type", "customer_group", "territory", "tax_id", "mobile_no", "email_id", "default_currency", "default_price_list"],
		Supplier: ["supplier_name", "supplier_group", "supplier_type", "country", "tax_id", "mobile_no", "email_id", "default_currency", "default_price_list"],
		Item: ["item_code", "item_name", "item_group", "stock_uom", "is_stock_item", "is_sales_item", "is_purchase_item", "standard_rate", "valuation_rate", "description", "barcodes", "item_defaults"],
		Warehouse: ["warehouse_name", "company", "is_group", "parent_warehouse", "warehouse_type", "account", "disabled"],
		BOM: ["item", "company", "quantity", "uom", "is_active", "is_default", "with_operations", "operations", "items", "total_cost"],
		"Work Order": ["production_item", "bom_no", "company", "qty", "planned_start_date", "planned_end_date", "source_warehouse", "wip_warehouse", "fg_warehouse", "operations", "required_items", "produced_qty"],
		"Job Card": ["work_order", "operation", "company", "for_quantity", "workstation", "employee", "time_logs", "total_completed_qty"],
		Asset: ["item_code", "asset_name", "company", "asset_category", "location", "purchase_date", "available_for_use_date", "gross_purchase_amount", "calculate_depreciation", "finance_books"],
		Project: ["project_name", "status", "project_type", "company", "expected_start_date", "expected_end_date", "percent_complete_method", "percent_complete", "customer", "sales_order", "estimated_costing"],
		Task: ["subject", "project", "status", "priority", "exp_start_date", "exp_end_date", "progress", "description", "depends_on"],
		Timesheet: ["company", "employee", "parent_project", "start_date", "end_date", "time_logs", "total_hours", "total_billable_hours", "total_billed_hours"],
		"Expense Claim": ["employee", "company", "posting_date", "approval_status", "expenses", "total_claimed_amount", "total_sanctioned_amount", "payable_account"],
	};
	const GUIDANCE = {
		"Payment Entry": () => [__("Record a payment"), __("Choose whether money came in, went out, or moved between accounts. Then select the party, amount, accounts, and invoices that apply.")],
		"Stock Entry": () => [__("Move stock"), __("Choose the movement, warehouses, and items. Use Advanced for manufacturing, subcontracting, and accounting options.")],
		"Delivery Note": () => [__("Prepare a delivery"), __("Choose the customer and warehouse, then add the items being delivered. Use Advanced for transport, billing, and accounting details.")],
	};
	function installBomCompatibility() {
		if (!window.frappe?.provide) return;
		frappe.provide("erpnext.bom");
		const scope = window.erpnext.bom;
		const patch = Controller => {
			const proto = Controller?.prototype;
			const original = proto?.plc_conversion_rate;
			if (!original || original._bnd_accepts_missing_doc) return;
			proto.plc_conversion_rate = function (doc, ...args) {
				return original.call(this, doc || this.frm?.doc, ...args);
			};
			proto.plc_conversion_rate._bnd_accepts_missing_doc = true;
		};
		if (scope.BomController) { patch(scope.BomController); return; }
		Object.defineProperty(scope, "BomController", {
			configurable: true, enumerable: true,
			get: () => undefined,
			set: Controller => {
				patch(Controller);
				Object.defineProperty(scope, "BomController", { configurable: true, enumerable: true, writable: true, value: Controller });
			},
		});
	}
	installBomCompatibility();
	function create(tag, cls, text, parent) {
		const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; parent?.append(el); return el;
	}
	function candidate(frm) {
		const meta = frm?.meta;
		if (!frm?.doc || !meta || meta.istable || meta.issingle || EXCLUDED_MODULES.has(meta.module)) return false;
		// Ordinary invoices have the purpose-built bill workbench. Returns, POS,
		// amendments and mapped invoices deliberately stay in native Advanced mode.
		return !["Sales Invoice", "Purchase Invoice"].includes(frm.doctype);
	}
	function fallbackFields(frm) {
		const profile = PROFILES[frm.doctype];
		const fields = new Set(profile || []);
		for (const df of frm.meta.fields || []) {
			if (!df.fieldname) continue;
			if (profile) {
				// Installed apps often mark specialist options bold. An explicit task
				// profile stays explicit, but an empty mandatory field must remain
				// reachable so native validation never becomes a dead end.
				const control = frm.fields_dict?.[df.fieldname];
				if (df.reqd && !df.hidden && control?.get_status?.() === "Write" && [null, undefined, ""].includes(frm.doc[df.fieldname])) fields.add(df.fieldname);
			} else {
				if (df.reqd || df.bold || df.in_list_view) fields.add(df.fieldname);
				if (df.fieldtype === "Table" && /items|references|accounts|expenses|operations|locations|time_logs/i.test(df.fieldname)) fields.add(df.fieldname);
			}
		}
		if (!profile && frm.meta.title_field) fields.add(frm.meta.title_field);
		return fields;
	}
	class SimpleDocumentWorkbench {
		constructor(frm) {
			this.frm = frm;
			this.locations = new Map();
		}
		card(name, title, help) {
			const card = create("section", `bnd-stock-card bnd-stock-card-${name}`, null, this.grid);
			const head = create("div", "bnd-stock-card-head", null, card);
			create("h3", "", title, head);
			create("p", "", help, head);
			return { card, fields: create("div", "bnd-stock-card-fields", null, card) };
		}
		metric(label, initial = "0") {
			const row = create("div", "", null, this.metrics);
			create("dt", "", label, row);
			return create("dd", "", initial, row);
		}
		move(name, target) {
			const node = this.frm.fields_dict?.[name]?.$wrapper?.[0];
			if (!node) return;
			const stored = this.locations.get(name);
			if (!stored || stored.node !== node) {
				this.locations.set(name, { node, parent: node.parentNode, next: node.nextSibling });
			}
			if (node.parentNode !== target) target.append(node);
		}
		restore() {
			for (const { node, parent, next } of this.locations.values()) {
				if (!parent?.isConnected) continue;
				if (next?.parentNode === parent) parent.insertBefore(node, next); else parent.append(node);
			}
			this.locations.clear();
		}
		format(value, fieldname, fallbackType = "Currency", currency = this.frm.doc.company_currency) {
			const df = this.frm.fields_dict?.[fieldname]?.df || { fieldtype: fallbackType };
			try { return frappe.format(value || 0, df, { currency }); }
			catch (_error) {
				const options = fallbackType === "Currency"
					? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined;
				return Number(value || 0).toLocaleString(undefined, options);
			}
		}
	}

	class StockEntryWorkbench extends SimpleDocumentWorkbench {
		constructor(frm) {
			super(frm);
			this.root = create("section", "bnd-stock-simple", null, null);
			this.root.setAttribute("aria-label", __("Stock movement steps"));
			const progress = create("ol", "bnd-stock-steps", null, this.root);
			for (const label of [__("Movement"), __("Warehouses"), __("Items")]) {
				const item = create("li", "", null, progress);
				create("span", "bnd-stock-step-dot", String(item.previousElementSibling ? progress.children.length : 1), item);
				create("span", "", label, item);
			}
			this.grid = create("div", "bnd-stock-simple-grid", null, this.root);
			this.movement = this.card("movement", __("Choose the movement"), __("Select how stock should enter, leave, or move between warehouses."));
			this.route = this.card("route", __("Choose the route"), __("Only the warehouses required for this movement are shown."));
			this.items = this.card("items", __("Add items and quantities"), __("Scan, search, or add items in the table. Stock is posted only after submission."));
			this.items.card.classList.add("bnd-stock-card-wide");
			this.details = create("details", "bnd-stock-details", null, this.grid);
			create("summary", "", __("Date and company"), this.details);
			this.detailFields = create("div", "bnd-stock-card-fields", null, this.details);
			this.summary = create("section", "bnd-stock-summary", null, this.grid);
			create("h3", "", __("Movement summary"), this.summary);
			this.metrics = create("dl", "", null, this.summary);
			this.metricNodes = [
				this.metric(__("Outgoing"), "0.00"), this.metric(__("Incoming"), "0.00"), this.metric(__("Difference"), "0.00"),
			];
		}
		refresh(active) {
			this.root.hidden = !active;
			if (!active) { this.restore(); return; }
			this.move("stock_entry_type", this.movement.fields);
			this.move("purpose", this.movement.fields);
			this.move("from_warehouse", this.route.fields);
			this.move("to_warehouse", this.route.fields);
			this.move("items", this.items.fields);
			for (const fieldname of ["company", "posting_date", "posting_time"]) this.move(fieldname, this.detailFields);
			const purpose = String(this.frm.doc.purpose || "").toLowerCase();
			this.route.card.dataset.movement = purpose.includes("receipt") ? "receipt" : purpose.includes("issue") ? "issue" : "transfer";
			this.metricNodes[0].innerHTML = this.format(this.frm.doc.total_outgoing_value, "total_outgoing_value");
			this.metricNodes[1].innerHTML = this.format(this.frm.doc.total_incoming_value, "total_incoming_value");
			this.metricNodes[2].innerHTML = this.format(this.frm.doc.value_difference, "value_difference");
		}
	}
	class DeliveryNoteWorkbench extends SimpleDocumentWorkbench {
		constructor(frm) {
			super(frm);
			this.root = create("section", "bnd-stock-simple bnd-delivery-simple", null, null);
			this.root.setAttribute("aria-label", __("Delivery steps"));
			const progress = create("ol", "bnd-stock-steps", null, this.root);
			for (const [index, label] of [__("Customer"), __("Fulfilment"), __("Items")].entries()) {
				const item = create("li", "", null, progress);
				create("span", "bnd-stock-step-dot", String(index + 1), item);
				create("span", "", label, item);
			}
			this.grid = create("div", "bnd-stock-simple-grid", null, this.root);
			this.customer = this.card("customer", __("Who is receiving this delivery?"), __("Select the customer for this delivery note."));
			this.fulfilment = this.card("route", __("Where is it leaving from?"), __("Choose the source warehouse used for the delivered items."));
			this.items = this.card("items", __("What are you delivering?"), __("Add the items and quantities. Stock changes only after submission."));
			this.items.card.classList.add("bnd-stock-card-wide");
			this.details = create("details", "bnd-stock-details", null, this.grid);
			create("summary", "", __("Date and company"), this.details);
			this.detailFields = create("div", "bnd-stock-card-fields", null, this.details);
			this.summary = create("section", "bnd-stock-summary", null, this.grid);
			create("h3", "", __("Delivery summary"), this.summary);
			this.metrics = create("dl", "", null, this.summary);
			this.quantity = this.metric(__("Total quantity"));
			this.total = this.metric(__("Grand total"));
		}
		refresh(active) {
			this.root.hidden = !active;
			if (!active) { this.restore(); return; }
			this.move("customer", this.customer.fields);
			this.move("set_warehouse", this.fulfilment.fields);
			this.move("items", this.items.fields);
			for (const fieldname of ["company", "posting_date", "posting_time"]) this.move(fieldname, this.detailFields);
			const currency = this.frm.doc.currency || this.frm.doc.company_currency;
			this.quantity.innerHTML = this.format(this.frm.doc.total_qty, "total_qty", "Float", currency);
			this.total.innerHTML = this.format(this.frm.doc.grand_total, "grand_total", "Float", currency);
		}
	}
	class SimpleForm {
		constructor(frm) {
			this.frm = frm; this.simple = true; this.selected = fallbackFields(frm);
			this.header = create("section", "bnd-simple-form-head", null, null);
			const heading = create("div", "bnd-simple-heading", null, this.header);
			const copy = create("div", "", null, heading);
			const guidance = GUIDANCE[frm.doctype]?.() || [__(frm.meta.name), __("The fields needed for this task are shown. Advanced mode keeps every ERPNext option on the same document.")];
			create("p", "bnd-simple-kicker", __("Simple mode"), copy);
			create("h2", "", guidance[0], copy);
			create("p", "bnd-simple-copy", guidance[1], copy);
			const modes = create("div", "bnd-simple-switch", null, heading); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", __("Form mode"));
			this.simpleButton = this.button(modes, __("Simple"), () => this.setMode(true), true);
			this.advancedButton = this.button(modes, __("Advanced"), () => this.setMode(false));
			this.actions = create("div", "bnd-simple-actions", null, this.header); this.actions.setAttribute("role", "toolbar"); this.actions.setAttribute("aria-label", __("Document actions"));
			this.newButton = this.action(__("New"), "F1", () => frappe.new_doc(this.frm.doctype), true);
			this.saveButton = this.action(__("Save"), "F2", () => this.frm.save("Save"), true);
			this.deleteButton = this.action(__("Delete"), "F4", () => this.frm.savetrash());
			this.printButton = this.action(__("Print"), "F6", () => this.frm.print_doc());
			this.submitButton = this.action(__("Submit"), "F8", () => this.frm.savesubmit());
			this.workbench = frm.doctype === "Stock Entry"
				? new StockEntryWorkbench(frm)
				: frm.doctype === "Delivery Note" ? new DeliveryNoteWorkbench(frm) : null;
			this.ensureMounted();
			this.keyHandler = event => {
				if (!this.simple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
				const actions = { F1: this.newButton, F2: this.saveButton, F4: this.deleteButton, F6: this.printButton, F8: this.submitButton };
				const target = actions[event.key]; if (!target || target.hidden || target.disabled) return;
				event.preventDefault(); event.stopPropagation(); target.click();
			};
			frm.$wrapper?.[0]?.addEventListener("keydown", this.keyHandler, true);
			this.setMode(true);
		}
		button(parent, label, action, primary = false) {
			const b = create("button", `bnd-bill-button${primary ? " bnd-bill-primary" : ""}`, label, parent); b.type = "button"; b.addEventListener("click", action); return b;
		}
		action(label, key, handler, primary = false) {
			const button = this.button(this.actions, "", handler, primary); button.classList.add("bnd-bill-action");
			create("span", "bnd-bill-action-label", label, button); create("kbd", "", key, button); button.setAttribute("aria-keyshortcuts", key); return button;
		}
		ensureMounted() {
			const layout = this.frm.$wrapper?.find(".form-layout").first()?.[0];
			const fallback = this.frm.$wrapper?.[0];
			if (layout) {
				const parent = layout.parentNode;
				const mounted = this.workbench
					? this.header.parentNode === parent && this.header.nextElementSibling === this.workbench.root && this.workbench.root.nextElementSibling === layout
					: this.header.parentNode === parent && this.header.nextElementSibling === layout;
				if (!mounted) layout.before(this.header, ...(this.workbench ? [this.workbench.root] : []));
			} else if (fallback && !this.header.isConnected) {
				fallback.prepend(this.header);
				if (this.workbench) this.header.after(this.workbench.root);
			}
		}
		refresh() {
			this.ensureMounted();
			this.selected = fallbackFields(this.frm);
			for (const [name, field] of Object.entries(this.frm.fields_dict || {})) {
				const wrapper = field?.$wrapper?.[0]; if (!wrapper) continue;
				wrapper.classList.toggle("bnd-simple-visible", this.selected.has(name));
				wrapper.classList.toggle("bnd-simple-omitted", !this.selected.has(name));
			}
			for (const link of this.frm.$wrapper?.find(".form-tabs .nav-link[aria-controls]") || []) {
				const pane = document.getElementById(link.getAttribute("aria-controls"));
				link.parentElement?.classList.toggle("bnd-simple-tab-omitted", !pane?.querySelector(".bnd-simple-visible"));
			}
			this.header.hidden = false;
			this.header.classList.toggle("bnd-simple-form-head-advanced", !this.simple);
			this.frm.$wrapper?.toggleClass("bnd-generic-simple", this.simple);
			this.frm.$wrapper?.toggleClass("bnd-stock-simple-active", this.simple && this.frm.doctype === "Stock Entry");
			this.frm.$wrapper?.toggleClass("bnd-delivery-simple-active", this.simple && this.frm.doctype === "Delivery Note");
			this.workbench?.refresh(this.simple);
			this.simpleButton.setAttribute("aria-pressed", String(this.simple));
			this.advancedButton.setAttribute("aria-pressed", String(!this.simple));
			this.simpleButton.classList.toggle("bnd-bill-primary", this.simple);
			this.advancedButton.classList.toggle("bnd-bill-primary", !this.simple);
			const status = Number(this.frm.doc.docstatus); const local = !!this.frm.doc.__islocal;
			this.saveButton.hidden = status !== 0 || !!this.frm.save_disabled;
			this.deleteButton.hidden = status !== 0 || local;
			this.printButton.hidden = local;
			this.submitButton.hidden = status !== 0 || local || this.frm.is_dirty() || !this.frm.meta.is_submittable;
		}
		setMode(simple) {
			this.simple = simple; this.refresh();
		}
	}
	function mount(frm) {
		if (!candidate(frm)) return false;
		const current = controllers.get(frm);
		if (current) current.refresh(); else controllers.set(frm, new SimpleForm(frm));
		return true;
	}
	api.simple_forms = { mount, candidate, profiles: PROFILES, fallbackFields };
	$(document).on("form-refresh.bnd-simple-forms", (_event, frm) => {
		setTimeout(() => frappe.after_ajax().then(() => { if (window.cur_frm === frm) mount(frm); }), 0);
	});
})();
