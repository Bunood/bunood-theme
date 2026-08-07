/**
 * Bunood Theme — desk JavaScript entry point.
 *
 * WHAT
 *   Two features live here:
 *     1. Per-user density override (checklist item 4, decision "G with C").
 *     2. The desk-layout system (checklist item 9): five chrome layouts —
 *        Top Bar / Compact / Classic / Bottom Bar / Dock — selected on Theme
 *        Settings, delivered via boot, applied as `data-bnd-layout` on <html>,
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
	 * Persist a density choice and apply it immediately (optimistic, with
	 * rollback on server failure so the visible state never lies).
	 *
	 * @param {string} density - one of the CYCLE values.
	 * @returns {Promise<void>}
	 */
	bunood.set_density = function (density) {
		const previous = frappe.boot.bnd_density || "";
		apply_density(density);
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

	// ════════════════════════════════════════════════════════════════════════
	// Desk layouts (item 9)
	// ════════════════════════════════════════════════════════════════════════

	/**
	 * Theme Settings label -> attribute slug. The Select stores the human
	 * label; CSS wants a stable token. Unknown labels fall through to no
	 * attribute (= stock desk), so a typo can never half-apply a layout.
	 */
	const LAYOUT_SLUGS = {
		"Top Bar": "topbar",
		"Compact": "compact",
		"Classic": "classic",
		"Bottom Bar": "bottombar",
		"Dock": "dock",
	};

	// Set the attribute NOW, for the same timing reason as density: the CSS
	// matrix (chrome/_layouts.scss) must know the layout before Frappe builds
	// the sidebar, or hidden rows would flash in and out.
	(function apply_layout() {
		const label = (window.frappe && frappe.boot && frappe.boot.bnd_layout) || "";
		const slug = LAYOUT_SLUGS[label];
		if (slug) document.documentElement.setAttribute("data-bnd-layout", slug);
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

	/** Current layout slug, or "" when the system is inactive. */
	function layout() {
		return document.documentElement.getAttribute("data-bnd-layout") || "";
	}

	// ════════════════════════════════════════════════════════════════════════
	// Ownership stamps
	// ════════════════════════════════════════════════════════════════════════
	//
	// THE POLARITY OF EVERY NATIVE-HIDING RULE.
	//
	// The old rule was: the LAYOUT declares it will replace the sidebar's bell,
	// so CSS hides that bell at first paint from `data-bnd-layout`. What
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
		material: { "Solid": "solid", "Glass": "glass" },
		color: { "Match Theme": "theme", "Minimal": "minimal", "Dark Contrast": "dark", "Brand": "brand" },
		icons: {
			"Colored Chips": "chips", "Colored Dots": "dots", "Filled Color": "filled",
			"Duotone": "duotone", "Brand Lines": "brandlines", "Monochrome": "mono",
		},
		active: {
			"Solid Pill": "pill", "Soft Pill": "softpill", "Accent Rail": "rail",
			"Glow Ring": "glow", "Outline": "outline", "Dot Marker": "dot", "Folder Tab": "foldertab",
		},
		sections: { "Plain": "plain", "Divided": "divided", "Mini-Cards": "cards", "Accordion Cards": "accordion" },
		wash: { "Off": "off", "Subtle": "subtle", "Rich": "rich" },
		// Legacy labels ("Hover-Expand", "Hover + Pin") predate the split into
		// mode + trigger; they still resolve so an already-configured site
		// keeps its rail across the upgrade.
		menurail: { "Always Expanded": "expanded", "Manual Collapse": "manual", "Rail": "rail", "Hover-Expand": "rail", "Hover + Pin": "rail" },
		railtrigger: { "Hover": "hover", "Click": "click", "Button Only": "button", "Hover + Pin": "hoverpin" },
		railbtn: { "None": "", "Edge": "edge", "Top": "top", "Bottom": "bottom" },
		railbtnshape: { "Circle": "circle", "Square": "square", "Tab": "tab" },
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
		set("color", SB_SLUGS.color[sb.color]);
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
		const glass = parseInt(sb.glass_opacity, 10);
		if (glass >= 1 && glass <= 5) html.setAttribute("data-bnd-sb-glass", String(glass));
		const width = parseInt(sb.pane_width, 10);
		if (width >= 1 && width <= 5) html.setAttribute("data-bnd-sb-width", String(width));
		const intensity = parseInt(sb.intensity, 10);
		if (intensity >= 1 && intensity <= 5) html.setAttribute("data-bnd-sb-intensity", String(intensity));
		if (sb.blur) html.setAttribute("data-bnd-sb-blur", String(sb.blur).toLowerCase());
		if (parseInt(sb.apps_rail, 10)) html.setAttribute("data-bnd-sb-appsrail", "");
		if (parseInt(sb.scroll_fades, 10)) html.setAttribute("data-bnd-sb-fades", "");
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
		// Frappe's own `icon` class is load-bearing, not cosmetic: many sprite
		// symbols (the es-line set, icon-stock, ...) are STROKE drawings whose
		// paths carry no fill attribute — an unstyled <svg> fills them black
		// and they render as solid blobs (caught by the item-11 visual sweep).
		// Frappe's icon stylesheet keys fill/stroke defaults on this class.
		svg.setAttribute("class", "icon");
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", "#" + symbol);
		svg.appendChild(use);
		return svg;
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

	/** Close the open menu, if any. Safe to call always. */
	function close_menu() {
		if (open_menu) {
			open_menu.remove();
			open_menu = null;
		}
	}

	// One set of global closers for every menu instance.
	document.addEventListener("pointerdown", (e) => {
		if (open_menu && !open_menu.contains(e.target)) close_menu();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close_menu();
	});

	/**
	 * Open a .bnd-menu anchored to a trigger button.
	 *
	 * Positioning is computed from viewport rects in PHYSICAL coordinates
	 * (rects are physical by nature, so this is RTL-correct without any dir
	 * checks): the menu's near edge aligns with the trigger's near edge, and
	 * it opens upward when the trigger sits in the lower half of the window.
	 *
	 * @param {HTMLElement} trigger - the button the menu hangs off.
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

		const menu = el("div", "bnd-menu", { role: "menu" });
		menu._trigger = trigger;

		for (const item of items) {
			if (item === "divider") {
				menu.appendChild(el("div", "bnd-menu-divider"));
				continue;
			}
			if (item.header) {
				const head = el("div", "bnd-menu-header");
				const name = el("div", "bnd-menu-name");
				name.textContent = item.header.name;
				head.appendChild(name);
				if (item.header.email) {
					const mail = el("div", "bnd-menu-email");
					mail.textContent = item.header.email;
					head.appendChild(mail);
				}
				menu.appendChild(head);
				continue;
			}
			const btn = el("button", "bnd-menu-item" + (item.danger ? " bnd-danger" : ""), {
				type: "button",
				role: "menuitem",
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
			menu.appendChild(btn);
		}

		document.body.appendChild(menu);
		open_menu = menu;

		// Measure, then place. Kept physical on purpose — see the docstring.
		const r = trigger.getBoundingClientRect();
		const mw = menu.offsetWidth;
		const mh = menu.offsetHeight;
		const opens_up = r.top > window.innerHeight / 2;
		let left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
		menu.style.left = left + "px";
		menu.style.top = opens_up ? Math.max(8, r.top - mh - 6) + "px" : r.bottom + 6 + "px";
	}

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
		items.push({
			header: {
				name: (frappe.session && frappe.session.user_fullname) || frappe.session.user,
				email:
					(frappe.boot.user && frappe.boot.user.email) ||
					(frappe.session && frappe.session.user_email) ||
					"",
			},
		});

		// Place-switching that has no other home now that the old brand menu
		// is retired: Website for everyone, Desktop where the sidebar is gone.
		if (layout() === "dock") {
			items.push({ label: __("Desktop"), icon: "icon-home", run: () => frappe.set_route("") });
		}
		items.push({
			label: __("Website"),
			icon: "icon-web",
			run: () => frappe.ui.toolbar.view_website(),
		});
		items.push("divider");

		items.push({
			label: __("Appearance"),
			icon: "icon-monitor",
			run: () => new frappe.ui.ThemeSwitcher().show(),
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
			label: __("Sidebar Style"),
			icon: "icon-sliders-horizontal",
			run: () => sb_personalize_menu(),
		});
		items.push({
			label: __("Toggle Density"),
			icon: "icon-sliders-horizontal",
			run: () => bunood.cycle_density(),
		});
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
		items.push({
			label: __("Keyboard Shortcuts"),
			icon: "icon-keyboard",
			run: () => frappe.ui.toolbar.show_shortcuts(),
		});
		items.push({
			label: __("Reload"),
			icon: "icon-rotate-ccw",
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
		pagehead: () => document.querySelector(".page-head .bnd-cluster"),
		dock: () => document.querySelector(".bnd-dock .bnd-cluster"),
		sidepane: () => (sidebar_is_hidden() ? null : document.querySelector(".body-sidebar")),
	};

	/** The node for a region, or null when this desk has no such region now. */
	function host_for(region) {
		const get = HOSTS[region];
		if (!get) return null;
		try {
			return get() || null;
		} catch (e) {
			return null;
		}
	}

	/** Theme Settings label -> region key. "Off" resolves to nothing at all. */
	const PLACEMENT_REGIONS = {
		"Top Bar": "topbar",
		"Bottom Bar": "bottombar",
		"Page Header": "pagehead",
		"Side Pane": "sidepane",
		Dock: "dock",
	};

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
	function placement_for(tenant) {
		const label = (placement_state && placement_state[tenant]) || "";
		if (label === "Off") return "off";
		const region = PLACEMENT_REGIONS[label];
		if (!region) return "absent";
		return host_for(region) ? region : "absent";
	}

	/**
	 * Append a cluster to a host and CLAIM the affordances it carries.
	 *
	 * The claim happens here rather than in build_cluster because a cluster
	 * that was built but never appended owns nothing — and hiding Frappe's
	 * bell on the strength of a node that is not in the document is precisely
	 * the failure this inversion exists to remove.
	 */
	function mount_cluster(host, opts) {
		if (!host) return null;
		const cluster = build_cluster(opts || { search: "none" });
		host.appendChild(cluster);
		if (cluster.querySelector(".bnd-bell")) bnd_own("bell");
		if (cluster.querySelector(".bnd-avatar-btn")) bnd_own("user");
		if (cluster.querySelector(".bnd-search-icon")) bnd_own("search");
		return cluster;
	}

	/**
	 * Place the bell and the user menu per their own settings.
	 *
	 * Runs AFTER the layout has mounted its containers, because a placement
	 * can only be honoured by a region that exists. Each is independent: the
	 * bell may sit in the top bar while the avatar sits in the side pane, which
	 * the single welded cluster could never express.
	 *
	 * Anything already carrying one is left alone — mount_cluster still builds
	 * the pair for layouts whose bar IS their chrome — so this only has work to
	 * do when a placement points somewhere else.
	 */
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
			const existing = document.querySelector("." + cls);

			// Asked for a region this layout does not have: leave whatever the
			// layout mounted exactly where it is, and keep claiming it if it
			// is really there. Doing anything else deletes chrome.
			if (region === "absent") {
				if (existing) bnd_own(token);
				continue;
			}

			if (region === "off") {
				// OFF MUST NOT DELETE THE LAST ROUTE TO THIS THING. Off means
				// "use the stock affordance instead of ours" — it can only mean
				// that where the stock one is reachable. In the Dock layout the
				// sidebar is hidden by the layout itself, so removing ours would
				// leave a desk with no notifications, no user menu and no way to
				// log out. Exactly the defect status style "Off" caused in the
				// Bottom Bar layout, in a new costume.
				//
				// So: keep it, and keep claiming it. The user asked for one fewer
				// control and gets the one they cannot do without — which is the
				// same bargain the whole ownership-stamp rule exists to strike.
				// RELEASE FIRST, THEN LOOK. Asking "is the native reachable?" while
				// we still own it always answers no — the ownership stamp is the
				// very thing hiding it (_layouts.scss keys on data-bnd-own). The
				// first version of this guard did exactly that and turned Off into
				// a no-op in every layout, which the Top Bar half of the test
				// caught. Reading offsetParent forces the style recalc, so the
				// answer below is the post-release truth.
				bnd_disown(token);
				if (existing && !native_pane_usable()) {
					// Releasing did not bring anything back: this layout hides the
					// stock control by itself (Dock hides the whole sidebar). Take
					// the claim back and keep ours — Off can mean "use the stock
					// one instead", but never "have none at all".
					bnd_own(token);
					continue;
				}
				if (existing) existing.remove();
				continue;
			}

			const host = host_for(region);
			if (!host) continue;
			if (existing && host.contains(existing)) {
				bnd_own(token);
				continue;
			}
			if (existing) existing.remove();
			let cluster = host.querySelector(".bnd-cluster");
			if (!cluster) {
				cluster = el("div", "bnd-cluster");
				host.appendChild(cluster);
			}
			cluster.appendChild(build());
			bnd_own(token);
		}
	}

	function build_cluster(opts) {
		const cluster = el("div", "bnd-cluster");

		// "field" is legacy: search placement is its own setting now and
		// mount_search() owns it. Kept so a caller asking for the old shape
		// still gets one search rather than none.
		if (opts.search === "field") {
			cluster.appendChild(build_search_field());
		} else if (opts.search === "icon") {
			cluster.appendChild(build_search_icon());
		}

		cluster.appendChild(build_bell());
		cluster.appendChild(build_user());
		return cluster;
	}

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

	/**
	 * The avatar and its menu — the only route to Log Out once a layout hides
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
		avatar.addEventListener("click", () => show_menu(avatar, avatar_menu_items()));
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
	// appears only once it has something to say) / Operator (always-on
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

	/** Style slug: off | minimal | quiet | operator. */
	function status_style() {
		const label = (status_state && status_state.status_style) || "Quiet";
		return String(label).toLowerCase();
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
	 * Quiet hides anything healthy; Operator shows everything it has.
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
					text = __("{0} failed", [String(failed)]);
					tone = "bad";
				} else if (!quiet && busy > 0) {
					text = __("{0} running", [String(busy)]);
				} else if (!quiet) {
					text = __("Jobs OK");
				}
			}
		} else if (seg.id === "errors") {
			const errors = status_signals && status_signals.errors;
			if (errors !== null && errors !== undefined) {
				if (errors > 0) {
					text = __("{0} errors", [String(errors)]);
					// The tone belongs to the FACT, not to the style. Tying it
					// to Quiet meant Operator — the style for people watching
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

	/** Theme Settings label -> slot slug. */
	const SEARCH_SLOTS = {
		"Sidebar Top": "sbtop",
		"Sidebar Bottom": "sbbottom",
		"Top Bar Edge": "topedge",
		"Top Bar Center": "topcenter",
		"Bottom Bar Edge": "botedge",
		"Bottom Bar Center": "botcenter",
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

	/** The fallback order for the active layout. */
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
				// Both bars reserve this slot at mount. Falling back to a
				// fresh wrapper keeps the placement working if a bar ever
				// forgets to — search appearing off-centre beats no search.
				let centre = host.querySelector(".bnd-search-center");
				if (!centre) {
					centre = el("div", "bnd-search-center");
					host.appendChild(centre);
				}
				centre.appendChild(field);
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
		const bar = el("div", "bnd-topbar");
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
		mount_cluster(bar);
		header.appendChild(bar);
	}

	// ── Status bar / bottom bar ─────────────────────────────────────────────

	/** Live references the status bar updates after mount. */
	const status_refs = { conn: null, conn_label: null, density: null, clock: null };

	/**
	 * Mount the fixed bottom strip.
	 *
	 * @param {boolean} global_variant - false: slim ambient status bar
	 *   (topbar/compact layouts; checklist item 14's seed). true: the Bottom
	 *   Bar layout's taller strip that also carries search + bell + avatar.
	 */
	function mount_statusbar(global_variant) {
		if (document.querySelector(".bnd-statusbar")) return;

		// Style "Off" means NO STATUS BAR — but in the Bottom Bar layout this
		// strip is not the status bar. It is that layout's only chrome: it
		// carries the bell, the unread badge and the avatar menu, while
		// _layouts.scss hides the sidebar's own copies of all three keyed on
		// the LAYOUT. Refusing to mount it there left a desk with no
		// notifications, no user menu and no way to log out. So Off empties
		// the strip of status content; it never deletes a layout's chrome.
		const off = status_style() === "off";
		if (off && !global_variant) return;

		const bar = el("div", "bnd-statusbar" + (global_variant ? " bnd-bottombar" : ""));

		// Connection: dot + word. State wired to the realtime socket when it
		// exposes lifecycle events, else to navigator.onLine — both guarded,
		// because a status bar must never be the thing that breaks the desk.
		if (!off && status_on("status_segments_connection")) {
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

		// Minimal is the "no server calls" style, and Off wants no status
		// content at all, so everything the POLLER owns is skipped outright
		// rather than built and left dark: unfilled segments would be
		// permanently hidden dead nodes, and the freshness stamp would sit
		// there reading "No data" forever with a refresh button wired to a
		// poll that returns early.
		const live = !off && status_style() !== "minimal";

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
				"data-bnd-prio": "1",
			});
			fresh.addEventListener("click", () => status_poll(true));
			bar.appendChild(fresh);
			status_refs.fresh = fresh;
		}

		// Density: label shows the user's override or "Auto"; click cycles.
		if (!off && status_on("status_segments_density")) {
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

		if (!off && status_clock_mode() !== "off") {
			const clock = el("span", "bnd-status-item bnd-clock", { "data-bnd-prio": "3" });
			bar.appendChild(clock);
			status_refs.clock = clock;
			tick_clock();
			setInterval(tick_clock, 30000);
		}

		if (global_variant) mount_cluster(bar);

		// The native <footer> exists but the desk scrolls at document level,
		// so the bar is position:fixed (CSS); body still gets it as a child
		// of .main-section for sane DOM ownership.
		(document.querySelector(".main-section") || document.body).appendChild(bar);
		// Tell CSS a bar EXISTS, rather than making it infer one from layout
		// and style. Whether a bar mounts depends on the style, the layout and
		// the Classic opt-in; the clearance rules only care about the answer,
		// and Classic's opt-in bar had no clearance at all while it was left
		// to guess.
		document.documentElement.setAttribute("data-bnd-statusbar", global_variant ? "global" : "slim");
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
			if (section.querySelector(".bnd-cluster")) return true;
			section.appendChild(el("span", "bnd-cluster-divider"));
			mount_cluster(section);
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
					sb_update_module_row();
					resolved = true;
					break;
				}

				if (!crumb_active()) continue;

				// 2. Module chip(s), per the icon-scope option.
				if (icon_mode !== "off" && !trail.querySelector(".bnd-crumb-chip")) {
					if (ws_link && ws && ws.icon) {
						const chip = el("span", "bnd-crumb-chip");
						chip.appendChild(sprite_icon("icon-" + ws.icon));
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
							chip.appendChild(sprite_icon("icon-" + sb_current_workspace.icon));
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
		const tabs = el("div", "bnd-inbox-tabs", { role: "tablist" });
		for (const tab of INBOX_TABS) {
			const btn = el("button", "bnd-inbox-tab", { type: "button", role: "tab", "data-tab": tab.id });
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
				const empty = el("div", "bnd-inbox-empty");
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
				btn.classList.toggle("bnd-inbox-tab-on", btn.getAttribute("data-tab") === inbox_tab);
			}
			list.innerHTML = "";
			const loading = el("div", "bnd-inbox-empty");
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

	/** Species metadata: group title, badge, sprite candidates for row icons. */
	const PAL_SPECIES = {
		action: { title: () => __("Actions"), badge: () => __("Action"), icons: ["icon-add", "es-line-add", "icon-small-add"] },
		navigate: { title: () => __("Navigate"), badge: () => __("List"), icons: ["icon-list", "es-line-list", "icon-unordered-list"] },
		report: { title: () => __("Reports"), badge: () => __("Report"), icons: ["icon-chart", "es-line-graph", "icon-table"] },
		page: { title: () => __("Pages & Workspaces"), badge: () => __("Page"), icons: ["icon-file", "es-line-file", "icon-small-file"] },
		doc: { title: () => __("Documents"), badge: () => __("Document"), icons: ["icon-file", "es-line-file", "icon-small-file"] },
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
			const frequents = uniq(pal_source("get_frequent_links", "").map((o) => pal_row(o, "frequent", "")))
				.sort((a, b) => b.index - a.index)
				.slice(0, 5);
			const kept = new Set(frequents.map((r) => r.key));
			const recents = uniq(pal_source("get_recent_pages", "").map((o) => pal_row(o, "recent", "")))
				.filter((r) => !kept.has(r.key))
				.sort((a, b) => b.index - a.index)
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
				marked: frappe.utils.escape_html(__("Search all documents for \"{0}\"", [txt])),
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
		const input = el("input", "bnd-palette-input", {
			type: "text",
			placeholder: __("Search or type a command"),
			"aria-label": __("Search"),
			spellcheck: "false",
		});
		head.appendChild(input);
		shell.appendChild(head);
		const list = el("div", "bnd-palette-list", { role: "listbox" });
		shell.appendChild(list);
		let footer = null;
		if (parseInt(pal_state.footer, 10)) {
			footer = el("div", "bnd-palette-footer");
			shell.appendChild(footer);
		}
		backdrop.appendChild(shell);
		document.body.appendChild(backdrop);

		backdrop.addEventListener("mousedown", (ev) => {
			if (ev.target === backdrop) pal_close();
		});
		input.addEventListener("input", () => pal_render(input.value.trim()));
		input.addEventListener("keydown", pal_keydown);
		pal_nodes = { backdrop, shell, input, list, footer };
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

	/** Render one row element. */
	function pal_row_el(row, flat_index) {
		const item = el("div", "bnd-palette-row", { role: "option", "data-idx": String(flat_index) });
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
		return item;
	}

	/** Move the highlight (wrap-around) and sync aria + scroll. */
	function pal_highlight(index) {
		if (!pal_flat.length) return;
		pal_cursor = ((index % pal_flat.length) + pal_flat.length) % pal_flat.length;
		const rows = pal_nodes.list.querySelectorAll(".bnd-palette-row");
		rows.forEach((node) => node.removeAttribute("aria-selected"));
		const active = pal_nodes.list.querySelector('.bnd-palette-row[data-idx="' + pal_cursor + '"]');
		if (active) {
			active.setAttribute("aria-selected", "true");
			active.scrollIntoView({ block: "nearest" });
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
				const heading = el("div", "bnd-palette-group");
				heading.textContent = species.title();
				pal_nodes.list.appendChild(heading);
			}
			for (const row of group.rows) {
				pal_nodes.list.appendChild(pal_row_el(row, pal_flat.length));
				pal_flat.push(row);
			}
		}
		if (fallbacks.length) {
			const divider = el("div", "bnd-palette-divider");
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
		pal_nodes.backdrop.removeAttribute("hidden");
		pal_nodes.input.value = seed;
		pal_render(seed);
		pal_nodes.input.focus();
	}

	/** Close and return focus to the page. */
	function pal_close() {
		if (pal_nodes) {
			pal_nodes.backdrop.setAttribute("hidden", "");
			pal_nodes.input.blur();
		}
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
		item.appendChild(el("span", "bnd-inbox-dot"));

		const avatar = el("span", "bnd-inbox-avatar");
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
		const groups = inbox_group_rows(rows);
		for (const group of groups) {
			if (group.doc && group.rows.length > 1) {
				const head = el("div", "bnd-inbox-group");
				head.textContent =
					group.doc.name + " · " + __(group.doc.type) + " · " +
					__("{0} updates", [String(group.rows.length)]);
				list.appendChild(head);
			} else if (group.doc) {
				const head = el("div", "bnd-inbox-group");
				head.textContent = group.doc.name + " · " + __(group.doc.type);
				list.appendChild(head);
			}
			for (const row of group.rows) {
				list.appendChild(inbox_row_el(row, inbox_flat.length));
				inbox_flat.push(row);
			}
		}
		if (!rows.length) {
			const empty = el("div", "bnd-inbox-empty");
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
			"aria-label": __("Notifications"),
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
		settings.addEventListener("click", (ev) => {
			ev.stopPropagation();
			inbox_close();
			frappe.set_route("Form", "Notification Settings", frappe.session.user);
		});
		head.appendChild(settings);
		panel.appendChild(head);

		const tabs = el("div", "bnd-inbox-tabs", { role: "tablist" });
		for (const tab of INBOX_TABS) {
			const btn = el("button", "bnd-inbox-tab", {
				type: "button",
				role: "tab",
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
		inbox_nodes = { backdrop, panel, list, count, tabs };
	}

	/** Load the active tab into the panel. */
	function inbox_load() {
		if (!inbox_nodes) return;
		for (const btn of inbox_nodes.tabs.querySelectorAll(".bnd-inbox-tab")) {
			btn.classList.toggle("bnd-inbox-tab-on", btn.getAttribute("data-tab") === inbox_tab);
		}
		inbox_nodes.list.innerHTML = "";
		const loading = el("div", "bnd-inbox-empty");
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

	/** Open the panel (building lazily); a second invocation closes it. */
	function inbox_open_panel() {
		if (!inbox_nodes) inbox_build();
		if (!inbox_nodes.backdrop.hasAttribute("hidden")) {
			inbox_close();
			return;
		}
		inbox_nodes.backdrop.removeAttribute("hidden");
		inbox_tab = "unread";
		inbox_load();
		inbox_nodes.panel.focus();
	}

	/** Close the panel. */
	function inbox_close() {
		if (inbox_nodes) inbox_nodes.backdrop.setAttribute("hidden", "");
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
			item.appendChild(sprite_icon("icon-" + (ws.icon || "folder-normal")));
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
			more.addEventListener("click", () =>
				show_menu(
					more,
					rest.map((ws) => ({
						label: ws.title,
						icon: "icon-" + (ws.icon || "folder-normal"),
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
		mount_cluster(dock);
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
			item.classList.toggle("bnd-active", item.getAttribute("data-ws") === current_slug);
		}
	}

	// ════════════════════════════════════════════════════════════════════════
	// Sidebar style kit (item 10) — mounted pieces
	// ════════════════════════════════════════════════════════════════════════

	/** The workspace shown by the crumb decorator; the module row reuses it. */
	let sb_current_workspace = null;

	/** Guard so our own DOM surgery does not retrigger the rebuild observer. */
	let sb_mutating = false;

	/**
	 * Wrap each sidebar section (its header + following items) in a
	 * .bnd-sb-card stamped with data-bnd-hue, for the cards/accordion section
	 * layouts. Items BEFORE the first section header form the neutral card 0.
	 *
	 * The wrapping is fully reversible (sb_unwrap_sections) and is undone the
	 * moment Frappe's sidebar EDIT MODE starts, because drag-reorder expects
	 * the original flat list. Hue indices are assigned per section order
	 * (1..7 cycling) — stable across reloads because section order is what
	 * the tenant authored.
	 */
	function sb_wrap_sections() {
		const kind = document.documentElement.getAttribute("data-bnd-sb-sections");
		if (kind !== "cards" && kind !== "accordion") return;
		const list = document.querySelector(".body-sidebar-top .sidebar-items");
		if (!list || list.querySelector(".bnd-sb-card")) return;
		try {
			sb_mutating = true;
			const groups = [];
			let current = { hue: 0, nodes: [] };
			for (const node of [...list.children]) {
				if (node.classList.contains("bnd-sb-card")) continue;
				if (node.querySelector(":scope > .standard-sidebar-item") || node.classList.contains("sidebar-item-container")) {
					if (node.classList.contains("section-item")) {
						if (current.nodes.length) groups.push(current);
						current = { hue: (groups.filter((g) => g.hue > 0).length % 7) + 1, nodes: [node] };
						continue;
					}
				}
				current.nodes.push(node);
			}
			if (current.nodes.length) groups.push(current);
			for (const group of groups) {
				const card = el("div", "bnd-sb-card", { "data-bnd-hue": String(group.hue) });
				list.insertBefore(card, group.nodes[0]);
				for (const node of group.nodes) card.appendChild(node);
			}
		} catch (e) {
			console.error("bunood_theme: section wrap failed, leaving stock sidebar", e); // eslint-disable-line no-console
			sb_unwrap_sections();
		} finally {
			sb_mutating = false;
		}
	}

	/** Undo sb_wrap_sections, restoring the flat native list. Always safe. */
	function sb_unwrap_sections() {
		const list = document.querySelector(".body-sidebar-top .sidebar-items");
		if (!list) return;
		sb_mutating = true;
		for (const card of [...list.querySelectorAll(":scope > .bnd-sb-card")]) {
			while (card.firstChild) list.insertBefore(card.firstChild, card);
			card.remove();
		}
		sb_mutating = false;
	}

	/**
	 * The brand block: company logo + name from Theme Settings branding,
	 * pinned at the pane's top and routing HOME on click — never a menu.
	 * Replaces the native header visually (CSS hides it), which also retires
	 * the old Desktop/Workspaces cascade: place-switching now lives in Home,
	 * All Apps, the module row and the avatar menu.
	 */
	function sb_mount_brand() {
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar || sidebar.querySelector(".bnd-sb-brand")) return;
		const brand = el("button", "bnd-sb-brand", { type: "button", title: __("Home") });
		if (frappe.boot.bnd_logo) {
			const img = el("img", "bnd-sb-brand-logo", { src: frappe.boot.bnd_logo, alt: "" });
			brand.appendChild(img);
		} else {
			const chip = el("span", "bnd-sb-brand-chip");
			chip.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
			brand.appendChild(chip);
		}
		const name = el("span", "bnd-sb-brand-name");
		name.textContent = frappe.boot.bnd_company || "Home";
		brand.appendChild(name);
		brand.addEventListener("click", () => frappe.set_route(""));
		sidebar.insertBefore(brand, sidebar.firstChild);
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

		// No fallback to the old shared key: boot stopped emitting it in slice 2,
		// so reading it would be a branch that can never be taken pretending to
		// be a safety net.
		const place = (which) =>
			(placement_state && placement_state[which]) || "Sidebar Top";

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
			if (where === "Top Bar" || where === "Bottom Bar") {
				const bar =
					where === "Top Bar"
						? document.querySelector(".bnd-topbar")
						: document.querySelector(".bnd-statusbar");
				// That bar is not part of the active layout. Leave it: the
				// setting is honoured when the region exists, and inventing a
				// home for it elsewhere would be a placement nobody chose.
				if (!bar) continue;
				const wrap = el("span", "bnd-sb-utils bnd-sb-utils-bar");
				for (const which of members) wrap.appendChild(build_quick_link(which, true));
				bar.insertBefore(wrap, bar.firstChild);
				continue;
			}

			const sidebar = document.querySelector(".body-sidebar");
			if (!sidebar) continue;
			const header =
				sidebar.querySelector(".bnd-sb-brand") || sidebar.querySelector(".sidebar-header");
			if (!header) continue;

			const utils = el("div", "bnd-sb-utils");
			for (const which of members) utils.appendChild(build_quick_link(which, false));

			if (where === "Sidebar Bottom") {
				const bottom = document.querySelector(".body-sidebar-bottom");
				if (bottom) bottom.insertAdjacentElement("beforebegin", utils);
				else sidebar.appendChild(utils);
			} else {
				header.insertAdjacentElement("afterend", utils);
			}
		}
	}

	/** A 2x2 grid glyph of our own — no sprite id for "apps" is guaranteed. */
	const BND_GRID_SVG =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
		'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
		'<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

	/**
	 * The module row: the current workspace's icon and name, pinned under the
	 * utility section. Clicking it opens the native brand menu (which holds
	 * the Workspaces cascade) — reuse, not reimplementation. Label refreshes
	 * on every route change from the workspace the crumb decorator resolved.
	 */
	function sb_mount_module_row() {
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar || sidebar.querySelector(".bnd-sb-module")) return;
		const anchor =
			sidebar.querySelector(".bnd-sb-utils:not(.bnd-sb-utils-bar)") ||
			sidebar.querySelector(".bnd-sb-brand") ||
			sidebar.querySelector(".sidebar-header");
		if (!anchor) return;

		const row = el("button", "bnd-sb-module", { type: "button" });
		row.appendChild(el("span", "bnd-sb-chip bnd-sb-module-chip"));
		const label = el("span", "bnd-sb-module-label");
		row.appendChild(label);
		// No menu here by design — the old workspace cascade is retired.
		// Clicking goes to the module's own landing page.
		row.addEventListener("click", (e) => {
			e.stopPropagation();
			if (sb_current_workspace) {
				const slug =
					frappe.router && frappe.router.slug
						? frappe.router.slug(sb_current_workspace.name)
						: String(sb_current_workspace.name).toLowerCase().replace(/ /g, "-");
				frappe.set_route(slug);
			}
		});
		anchor.insertAdjacentElement("afterend", row);
		sb_update_module_row();
	}

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

	/** Refresh the module row's icon + label from the resolved workspace. */
	function sb_update_module_row() {
		const row = document.querySelector(".bnd-sb-module");
		if (!row) return;
		const ws = sb_current_workspace;
		row.querySelector(".bnd-sb-module-label").textContent = (ws && ws.title) || __("Workspaces");
		const chip = row.querySelector(".bnd-sb-module-chip");
		chip.innerHTML = "";
		chip.appendChild(sprite_icon("icon-" + ((ws && ws.icon) || "folder-normal")));
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
		if (!document.documentElement.hasAttribute("data-bnd-rail")) {
			sb_teardown_rail(container);
			return;
		}
		if (container.dataset.bndRail) return;
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
			const header = container.querySelector(".bnd-sb-brand") || container.querySelector(".sidebar-header");
			if (header) {
				const pin = el("button", "bnd-sb-pin", { type: "button", "aria-label": __("Pin sidebar open"), title: __("Pin sidebar open") });
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
		let pos = SB_SLUGS.railbtn[sb.rail_button] || "";
		if (trigger === "button" && !pos) pos = "edge";
		if (pos) {
			const shape = SB_SLUGS.railbtnshape[sb.rail_button_shape] || "circle";
			const glyph = SB_SLUGS.railbtnicon[sb.rail_button_icon] || "chevron";
			const btn = el("button", "bnd-railbtn bnd-railbtn-" + pos + " bnd-railbtn-" + shape, {
				type: "button",
				"aria-label": __("Expand sidebar"),
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
	}

	/**
	 * Apply the configured pane width. Rail mode's OPEN width and the
	 * always-expanded pane both read --bnd-sb-w (stops 200-280px; stop 2 is
	 * v16's original 220px). Manual-collapse mode is left to Frappe: its
	 * collapse animation owns the width there, and an inline width from us
	 * would pin it open.
	 */
	function sb_apply_width() {
		const container = document.querySelector(".body-sidebar-container");
		if (!container) return;
		const mode = document.documentElement.getAttribute("data-bnd-sb-menurail");
		if (document.documentElement.hasAttribute("data-bnd-rail")) return; // rail sets its own
		if (mode === "expanded") container.style.width = "var(--bnd-sb-w)";
		else container.style.width = "";
	}

	/** Undo everything sb_mount_rail did, for previews that leave rail mode. */
	function sb_teardown_rail(container) {
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

	/** First sprite id in `candidates` that exists in Frappe's symbol sheet. */
	function sb_existing_symbol(candidates) {
		for (const id of candidates) if (document.getElementById(id)) return id;
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

	function sb_fix_icons() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-iconsrc") || "smart";
		if (sb_icon_mode_applied && sb_icon_mode_applied !== mode) {
			// Restore before reapplying, or already-processed items would be
			// skipped and a smart->letters preview would change nothing.
			for (const item of document.querySelectorAll("[data-bnd-iconized]")) {
				const span = item.querySelector(".sidebar-item-icon");
				if (span && sb_icon_originals.has(span)) span.innerHTML = sb_icon_originals.get(span);
				item.removeAttribute("data-bnd-iconized");
			}
		}
		sb_icon_mode_applied = mode;
		if (mode === "original") {
			// Restore anything a previous mode replaced.
			for (const item of document.querySelectorAll("[data-bnd-iconized]")) {
				const span = item.querySelector(".sidebar-item-icon");
				if (span && sb_icon_originals.has(span)) span.innerHTML = sb_icon_originals.get(span);
				item.removeAttribute("data-bnd-iconized");
			}
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
				let symbol = null;
				if (mode === "smart") {
					for (const [re, candidates] of SB_ICON_HINTS) {
						if (re.test(label)) {
							symbol = sb_existing_symbol(candidates);
							if (symbol) break;
						}
					}
				}
				icon_span.innerHTML = "";
				if (symbol) {
					icon_span.appendChild(sprite_icon(symbol));
				} else {
					const letter = el("span", "bnd-sb-letter");
					letter.textContent = (label || "?").charAt(0);
					icon_span.appendChild(letter);
				}
			}
		}
	}

	/**
	 * The Apps Rail: a slim fixed strip of every root workspace, mounted
	 * before the sidebar. Same data and behaviour as the Dock layout's
	 * items, stacked vertically; overflow beyond 12 goes to a menu.
	 */
	function sb_mount_apps_rail() {
		if (!document.documentElement.hasAttribute("data-bnd-sb-appsrail")) return;
		if (document.querySelector(".bnd-apps-rail")) return;
		const rail = el("div", "bnd-apps-rail", { role: "navigation", "aria-label": __("Apps") });

		// Brand chip first — the rail carries identity like the dock does.
		const brand = el("button", "bnd-apps-rail-item bnd-apps-rail-brand", {
			type: "button",
			title: (frappe.boot.bnd_company || "Bunood") + " — " + __("Home"),
		});
		brand.textContent = (frappe.boot.bnd_company || "B").charAt(0).toUpperCase();
		brand.addEventListener("click", () => frappe.set_route(""));
		rail.appendChild(brand);
		rail.appendChild(el("span", "bnd-apps-rail-divider"));

		const slug = (name) =>
			frappe.router && frappe.router.slug ? frappe.router.slug(name) : String(name).toLowerCase().replace(/ /g, "-");
		const roots = ((frappe.boot && frappe.boot.allowed_workspaces) || []).filter((w) => w.public && !w.parent_page);

		for (const ws of roots.slice(0, 12)) {
			const item = el("button", "bnd-apps-rail-item", { type: "button", title: ws.title, "data-ws": slug(ws.name) });
			item.appendChild(sprite_icon("icon-" + (ws.icon || "folder-normal")));
			item.addEventListener("click", () => frappe.set_route(slug(ws.name)));
			rail.appendChild(item);
		}
		const rest = roots.slice(12);
		if (rest.length) {
			const more = el("button", "bnd-apps-rail-item", { type: "button", "aria-label": __("More") });
			more.textContent = "⋯";
			more.addEventListener("click", () =>
				show_menu(more, rest.map((ws) => ({
					label: ws.title,
					icon: "icon-" + (ws.icon || "folder-normal"),
					run: () => frappe.set_route(slug(ws.name)),
				})))
			);
			rail.appendChild(more);
		}
		document.body.appendChild(rail);
		sb_update_apps_rail_active();
	}

	/** Highlight the apps-rail item for the workspace being viewed. */
	function sb_update_apps_rail_active() {
		const rail = document.querySelector(".bnd-apps-rail");
		if (!rail) return;
		const route = frappe.get_route() || [];
		const slug = (name) =>
			frappe.router && frappe.router.slug ? frappe.router.slug(name) : String(name).toLowerCase().replace(/ /g, "-");
		const current = route[0] === "Workspaces" && route[1] ? slug(route[1]) : "";
		for (const item of rail.querySelectorAll("[data-ws]")) {
			item.classList.toggle("bnd-active", item.getAttribute("data-ws") === current);
		}
	}

	/** Cache so badge counts are fetched at most once a minute per rebuild. */
	let sb_badges_at = 0;

	/**
	 * Live badges on sidebar links. One batched server call
	 * (bunood_theme.api.get_sidebar_counts) returns counts for the labels
	 * that are readable DocTypes; anything else is silently skipped. "dots"
	 * mode marks only nonzero rows; "counts" shows the number.
	 */
	function sb_mount_badges() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-badges");
		if (mode !== "dots" && mode !== "counts") return;
		if (Date.now() - sb_badges_at < 60000) return;

		const items = [...document.querySelectorAll(".body-sidebar-top .sidebar-item-container[item-name]:not(.section-item)")];
		const labels = items.map((i) => i.getAttribute("item-name")).filter(Boolean);
		if (!labels.length) return;
		// Stamp the throttle only once there is actually something to fetch —
		// at first mount the item list is often not built yet, and stamping on
		// the empty attempt throttled away the observer's retry (measured).
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
			})
			.catch(() => {}); // badges are decoration; never surface a failure
	}

	/**
	 * Watch the sidebar for the two events that must undo/redo our surgery:
	 * Frappe rebuilding the item list (workspace switch) and edit mode
	 * starting/ending. Both are observed rather than hooked — Frappe exposes
	 * no events here — with our own mutations guarded out via sb_mutating.
	 */
	function sb_observe() {
		const list = document.querySelector(".body-sidebar-top .sidebar-items");
		if (list && typeof MutationObserver !== "undefined") {
			let timer = null;
			new MutationObserver(() => {
				if (sb_mutating) return;
				clearTimeout(timer);
				timer = setTimeout(() => {
					if (!sb_edit_active()) {
						sb_mount_brand();
						sb_mount_utils();
						sb_mount_module_row();
						sb_wrap_sections();
						sb_fix_icons();
						sb_mount_badges();
					}
				}, 200);
			}).observe(list, { childList: true, subtree: true });
		}

		const bottom = document.querySelector(".body-sidebar-bottom .bottom-edit-controls");
		if (bottom && typeof MutationObserver !== "undefined") {
			new MutationObserver(() => {
				if (sb_edit_active()) sb_unwrap_sections();
				else setTimeout(sb_wrap_sections, 250);
			}).observe(bottom, { attributes: true, attributeFilter: ["class"] });
		}
	}

	/** True while Frappe's sidebar edit mode is active (save/discard shown). */
	function sb_edit_active() {
		const controls = document.querySelector(".body-sidebar-bottom .bottom-edit-controls");
		return !!(controls && !controls.classList.contains("hidden"));
	}

	/**
	 * The user-facing "personalize" picker: choose a whole PRESET for
	 * yourself (or follow the site). Users never get option-level knobs —
	 * they always land on designed combinations. Persisted server-side and
	 * applied instantly.
	 */
	function sb_personalize_menu() {
		frappe
			.xcall("bunood_theme.api.get_sidebar_presets")
			.then((data) => {
				const current = (sb_state && sb_state.user_preset) || "";
				const anchor = document.querySelector(".bnd-avatar-btn") || document.body;
				const pick = (name) => {
					frappe
						.xcall("bunood_theme.api.set_user_sidebar_preset", { preset: name })
						.then(() => {
							if (name && data.presets[name]) {
								bunood.sb_apply(data.presets[name]);
								sb_state.user_preset = name;
							} else {
								window.location.reload(); // site values live server-side
							}
							frappe.show_alert({
								message: name ? __("Sidebar: {0}", [__(name)]) : __("Sidebar: following the site"),
								indicator: "green",
							});
						})
						.catch(() => frappe.show_alert({ message: __("Could not save"), indicator: "red" }));
				};
				const items = [
					{ label: (current === "" ? "✓ " : "") + __("Site Default"), run: () => pick("") },
					"divider",
				];
				for (const name of Object.keys(data.presets)) {
					items.push({ label: (current === name ? "✓ " : "") + __(name), run: () => pick(name) });
				}
				show_menu(anchor, items);
			})
			.catch(() => {});
	}

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
			glass_opacity: v("sidebar_glass_opacity", "glass_opacity"),
			blur: v("sidebar_blur", "blur"),
			color: v("sidebar_color", "color"),
			icons: v("sidebar_icon_style", "icons"),
			active: v("sidebar_active_style", "active"),
			sections: v("sidebar_section_layout", "sections"),
			wash: v("sidebar_hue_wash", "wash"),
			intensity: v("sidebar_surface_intensity", "intensity"),
			menurail: v("sidebar_menu_rail", "menurail"),
			rail_trigger: v("sidebar_rail_trigger", "rail_trigger"),
			rail_button: v("sidebar_rail_button", "rail_button"),
			rail_button_shape: v("sidebar_rail_button_shape", "rail_button_shape"),
			rail_button_icon: v("sidebar_rail_button_icon", "rail_button_icon"),
			icon_source: v("sidebar_icon_source", "icon_source"),
			pane_width: v("sidebar_pane_width", "pane_width"),
			apps_rail: v("sidebar_apps_rail", "apps_rail"),
			badges: v("sidebar_badges", "badges"),
			remember: v("sidebar_remember_sections", "remember"),
			scroll_fades: v("sidebar_scroll_fades", "scroll_fades"),
			user_preset: sb_state ? sb_state.user_preset : "",
		};
		apply_sidebar_attrs(next);

		// Structural pieces are torn down and remounted from the new state.
		const container = document.querySelector(".body-sidebar-container");
		if (container) sb_teardown_rail(container);
		for (const node of document.querySelectorAll(".bnd-apps-rail")) node.remove();
		if (document.documentElement.getAttribute("data-bnd-sb-sections") === "cards" ||
			document.documentElement.getAttribute("data-bnd-sb-sections") === "accordion") {
			sb_wrap_sections();
		} else {
			sb_unwrap_sections();
		}
		sb_mount_utils();
		sb_fix_icons();
		sb_mount_rail();
		sb_apply_width();
		sb_mount_apps_rail();
		// Badges rebuild from scratch so mode switches (counts -> dots -> off)
		// preview truthfully instead of stacking.
		for (const badge of document.querySelectorAll(".bnd-sb-badge")) badge.remove();
		sb_badges_at = 0;
		sb_mount_badges();
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
			icons: v("crumb_icons", "icons"),
			hover: v("crumb_hover", "hover"),
			copy_link: v("crumb_copy_link", "copy_link"),
			status_pill: v("crumb_status_pill", "status_pill"),
			narrow_collapse: v("crumb_narrow_collapse", "narrow_collapse"),
		});
		crumb_teardown();
		decorate_crumbs();
	};

	/** Mount every active piece of the sidebar kit. Skipped in Dock layout. */
	function mount_sidebar_kit() {
		if (!sb_active() || layout() === "dock") return;
		sb_resolve_workspace_from_route();
		// The header renders a beat after the shell exists; utils and the
		// module row anchor to it, so they get their own retry budget
		// (measured: a single attempt raced and silently mounted nothing).
		try_for(() => {
			if (!document.querySelector(".body-sidebar .sidebar-header")) return false;
			sb_mount_brand();
			sb_mount_utils();
			sb_mount_module_row();
			return true;
		}, 30);
		sb_wrap_sections();
		sb_fix_icons();
		sb_mount_rail();
		sb_apply_width();
		sb_mount_apps_rail();
		sb_mount_badges();
		sb_observe();
	}

	// ── Orchestration ───────────────────────────────────────────────────────

	/**
	 * Mount the chrome for the active layout, once the desk shell exists.
	 * Per-page work (compact cluster, trail resolution, dock highlight)
	 * re-runs on every route change; per-shell work runs once, guarded by
	 * mount markers.
	 */
	function mount_chrome() {
		const slug = layout();
		if (!slug) return; // boot failed or theme inactive: leave stock desk alone

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

		if (slug === "topbar") {
			mount_topbar();
			mount_statusbar(false);
		} else if (slug === "compact") {
			inject_compact_cluster();
			mount_statusbar(false);
		} else if (slug === "bottombar") {
			mount_statusbar(true);
		} else if (slug === "dock") {
			mount_dock();
			mount_statusbar(false);
		} else if (slug === "classic") {
			// Classic used to need an opt-in (`status_in_classic`) because the
			// status bar was a consequence of the LAYOUT. It is a component now,
			// so the layout has no opinion: `status_style` decides, here as
			// everywhere else. mount_statusbar returns early when the style is
			// Off, which is what makes one call correct for all five layouts.
			mount_statusbar(false);
		}

		// Search placement is independent of the layout (item 14): mount it
		// AFTER the bars exist, since its slots live in them.
		mount_search();

		// The bell and the user menu follow their own settings, after the
		// containers exist — a placement can only be honoured by a region
		// that is really there.
		mount_placed_tenants();

		// The sidebar style kit rides along in every layout that HAS a
		// sidebar; Dock hides it, so the kit stays down there.
		mount_sidebar_kit();

		// The palette kit owns search invocation in every layout.
		mount_palette();

		// The notification kit owns the bell (and the badge Frappe lacks).
		mount_inbox();

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
				sb_resolve_workspace_from_route();
				decorate_crumbs();
				if (slug === "compact") inject_compact_cluster();
				if (slug === "dock") update_dock_active();
				sb_update_module_row();
				sb_update_apps_rail_active();
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
