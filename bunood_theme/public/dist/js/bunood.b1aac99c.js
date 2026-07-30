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

	/** Current layout slug, or "" when the system is inactive. */
	function layout() {
		return document.documentElement.getAttribute("data-bnd-layout") || "";
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
		menurail: { "Always Expanded": "expanded", "Manual Collapse": "manual", "Hover-Expand": "hover", "Hover + Pin": "hoverpin" },
		badges: { "Off": "off", "Dots": "dots", "Counts": "counts" },
	};

	// Reflect the sidebar options NOW, same timing rule as layout/density:
	// the CSS matrix must know every choice before Frappe renders the sidebar.
	(function apply_sidebar_attrs() {
		const sb = (window.frappe && frappe.boot && frappe.boot.bnd_sidebar) || null;
		if (!sb) return;
		const html = document.documentElement;
		const set = (name, value) => value && html.setAttribute("data-bnd-sb-" + name, value);
		set("placement", SB_SLUGS.placement[sb.placement]);
		set("material", SB_SLUGS.material[sb.material]);
		set("color", SB_SLUGS.color[sb.color]);
		set("icons", SB_SLUGS.icons[sb.icons]);
		set("active", SB_SLUGS.active[sb.active]);
		set("sections", SB_SLUGS.sections[sb.sections]);
		set("wash", SB_SLUGS.wash[sb.wash]);
		set("menurail", SB_SLUGS.menurail[sb.menurail]);
		set("badges", SB_SLUGS.badges[sb.badges]);
		const glass = parseInt(sb.glass_opacity, 10);
		if (glass >= 1 && glass <= 5) html.setAttribute("data-bnd-sb-glass", String(glass));
		const intensity = parseInt(sb.intensity, 10);
		if (intensity >= 1 && intensity <= 5) html.setAttribute("data-bnd-sb-intensity", String(intensity));
		if (sb.blur) html.setAttribute("data-bnd-sb-blur", String(sb.blur).toLowerCase());
		if (parseInt(sb.apps_rail, 10)) html.setAttribute("data-bnd-sb-appsrail", "");
		if (parseInt(sb.scroll_fades, 10)) html.setAttribute("data-bnd-sb-fades", "");
	})();

	/** True when the sidebar kit is active (its color attribute is the anchor). */
	function sb_active() {
		return document.documentElement.hasAttribute("data-bnd-sb-color");
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
		const set = (w) => root.style.setProperty("--bnd-sidebar-live-w", w + "px");
		if (!sidebar) {
			set(0);
			return;
		}
		set(sidebar.getBoundingClientRect().width);
		if (typeof ResizeObserver !== "undefined") {
			new ResizeObserver(() => set(sidebar.getBoundingClientRect().width)).observe(sidebar);
		}
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

		// Dock hides the sidebar, taking the brand menu's place-switching with
		// it — so Desktop and Website come along in that one layout.
		if (layout() === "dock") {
			items.push({ label: __("Desktop"), icon: "icon-home", run: () => frappe.set_route("") });
			items.push({
				label: __("Website"),
				icon: "icon-web",
				run: () => frappe.ui.toolbar.view_website(),
			});
			items.push("divider");
		}

		items.push({
			label: __("Appearance"),
			icon: "icon-monitor",
			run: () => new frappe.ui.ThemeSwitcher().show(),
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
	function build_cluster(opts) {
		const cluster = el("div", "bnd-cluster");

		if (opts.search === "field") {
			cluster.appendChild(build_search_field());
		} else if (opts.search === "icon") {
			const btn = el("button", "bnd-icon-btn", {
				type: "button",
				"aria-label": __("Search"),
				title: __("Search"),
			});
			btn.appendChild(cloned_icon(".navbar-search-bar", "icon-search"));
			btn.addEventListener("click", () => proxy_click(".navbar-search-bar .item-anchor"));
			cluster.appendChild(btn);
		}

		const bell = el("button", "bnd-icon-btn", {
			type: "button",
			"aria-label": __("Notifications"),
			title: __("Notifications"),
		});
		bell.appendChild(cloned_icon(".sidebar-notification", "icon-bell"));
		bell.addEventListener("click", (e) => {
			// The proxy opens the panel synchronously; without this, OUR click
			// then bubbles to Frappe's document-level outside-click closer —
			// whose target (this button) is outside the panel — and the panel
			// closes in the same instant it opened (measured 2026-07-30).
			e.stopPropagation();
			proxy_click(".sidebar-notification .item-anchor");
		});
		cluster.appendChild(bell);

		const avatar = el("button", "bnd-avatar-btn", {
			type: "button",
			"aria-label": __("User menu"),
		});
		avatar.innerHTML = user_avatar_html();
		avatar.addEventListener("click", () => show_menu(avatar, avatar_menu_items()));
		cluster.appendChild(avatar);

		return cluster;
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
	 * The search "field": a button dressed as an input that opens Frappe's
	 * search modal via the hidden native trigger. Shows the platform-correct
	 * shortcut hint; the shortcut itself is Frappe's own binding, untouched.
	 * @returns {HTMLElement}
	 */
	function build_search_field() {
		const field = el("button", "bnd-search-field", { type: "button", "aria-label": __("Search") });
		field.appendChild(cloned_icon(".navbar-search-bar", "icon-search"));
		const label = el("span", "bnd-search-label");
		label.textContent = __("Search");
		field.appendChild(label);
		const kbd = el("kbd");
		kbd.textContent = /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl+K";
		field.appendChild(kbd);
		field.addEventListener("click", () => proxy_click(".navbar-search-bar .item-anchor"));
		return field;
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
		bar.appendChild(build_search_field());
		bar.appendChild(build_cluster({ search: "none" }));
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
		const bar = el("div", "bnd-statusbar" + (global_variant ? " bnd-bottombar" : ""));

		if (global_variant) bar.appendChild(build_search_field());

		// Connection: dot + word. State wired to the realtime socket when it
		// exposes lifecycle events, else to navigator.onLine — both guarded,
		// because a status bar must never be the thing that breaks the desk.
		const conn = el("span", "bnd-status-item bnd-conn", { "data-state": "online" });
		conn.appendChild(el("span", "bnd-conn-dot"));
		const conn_label = el("span");
		conn_label.textContent = __("Connected");
		conn.appendChild(conn_label);
		bar.appendChild(conn);
		status_refs.conn = conn;
		status_refs.conn_label = conn_label;
		bind_connection_state();

		// Background jobs: a plain route link. A live count is item 14 work.
		const jobs = el("button", "bnd-status-item", { type: "button", title: __("Background Jobs") });
		jobs.appendChild(document.createTextNode(__("Jobs")));
		jobs.addEventListener("click", () => frappe.set_route("background-jobs"));
		bar.appendChild(jobs);

		bar.appendChild(el("span", "bnd-status-spacer"));

		// Density: label shows the user's override or "Auto"; click cycles.
		const density = el("button", "bnd-status-item", {
			type: "button",
			title: __("Toggle Density"),
		});
		density.addEventListener("click", () => bunood.cycle_density());
		bar.appendChild(density);
		status_refs.density = density;
		refresh_density_label();

		const clock = el("span", "bnd-status-item bnd-clock");
		bar.appendChild(clock);
		status_refs.clock = clock;
		tick_clock();
		setInterval(tick_clock, 30000);

		if (global_variant) bar.appendChild(build_cluster({ search: "none" }));

		// The native <footer> exists but the desk scrolls at document level,
		// so the bar is position:fixed (CSS); body still gets it as a child
		// of .main-section for sane DOM ownership.
		(document.querySelector(".main-section") || document.body).appendChild(bar);
	}

	/** Put the current time (locale HH:MM) on the status bar. */
	function tick_clock() {
		if (!status_refs.clock) return;
		status_refs.clock.textContent = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	/** Reflect the stored density override on the status bar label. */
	function refresh_density_label() {
		if (!status_refs.density) return;
		const value = (frappe.boot && frappe.boot.bnd_density) || "";
		status_refs.density.textContent = __("Density: {0}", [value ? __(value) : __("Auto")]);
	}

	/**
	 * Wire the connection indicator to the realtime socket's lifecycle if it
	 * is reachable, else to the browser's own online/offline events. Both
	 * paths are best-effort — see mount_statusbar.
	 */
	function bind_connection_state() {
		const set = (online) => {
			if (!status_refs.conn) return;
			status_refs.conn.setAttribute("data-state", online ? "online" : "offline");
			status_refs.conn_label.textContent = online ? __("Connected") : __("Offline");
		};
		try {
			const socket = frappe.realtime && (frappe.realtime.socket || null);
			if (socket && socket.on) {
				socket.on("connect", () => set(true));
				socket.on("disconnect", () => set(false));
				set(!!socket.connected);
				return;
			}
		} catch (e) {
			/* fall through to navigator */
		}
		set(navigator.onLine);
		window.addEventListener("online", () => set(true));
		window.addEventListener("offline", () => set(false));
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
		try_for(() => {
			const page = frappe.container && frappe.container.page;
			if (!page) return false;
			const section = page.querySelector(".page-head .standard-items-section");
			if (!section) return false;
			if (section.querySelector(".bnd-cluster")) return true;
			section.appendChild(el("span", "bnd-cluster-divider"));
			section.appendChild(build_cluster({ search: "none" }));
			return true;
		}, 20);
	}

	// ── Breadcrumb module chip (all layouts) ────────────────────────────────

	/**
	 * Prepend the current workspace's own sprite icon to the workspace link in
	 * v16's existing breadcrumb trail, so the trail and the navigation agree
	 * visually. Decorates every un-decorated trail (pages are cached), maps
	 * link slug -> boot.allowed_workspaces for the icon, and skips silently
	 * when a link is not a workspace. Retried because breadcrumbs render
	 * slightly after the route event.
	 *
	 * TWO-STEP MATCH, both needed (measured 2026-07-30): the workspace crumb's
	 * href is unreliable — on a list page Frappe emitted text "Home" with
	 * href "/desk/item" — so the slug lookup is only the fast path and the
	 * link's visible TEXT vs workspace titles is the fallback. Text matching
	 * is locale-tolerant here because workspace titles arrive in boot already
	 * in the user's locale, same as the crumb label Frappe renders from them.
	 */
	function decorate_breadcrumbs() {
		const workspaces = (frappe.boot && frappe.boot.allowed_workspaces) || [];
		if (!workspaces.length) return;
		const slug = (name) =>
			frappe.router && frappe.router.slug
				? frappe.router.slug(name)
				: String(name).toLowerCase().replace(/ /g, "-");
		const by_slug = {};
		for (const w of workspaces) by_slug[slug(w.name)] = w;

		// Success means every trail is DECORATED, not merely present: the <ul>
		// exists before Frappe fills it (measured — mount-time trails are
		// empty), so "trail found" must keep retrying until links appear. The
		// budget bounds pages whose trail legitimately has no workspace link.
		try_for(() => {
			const trails = document.querySelectorAll(".page-head .navbar-breadcrumbs");
			if (!trails.length) return false;
			let all_done = true;
			for (const trail of trails) {
				if (trail.querySelector(".bnd-crumb-chip")) continue;
				let done = false;
				for (const link of trail.querySelectorAll('li a[href^="/desk/"]')) {
					let ws = by_slug[link.getAttribute("href").split("/")[2]];
					if (!ws) {
						const text = link.textContent.trim().toLowerCase();
						ws = workspaces.find(
							(w) =>
								String(w.title || "").toLowerCase() === text ||
								String(w.name || "").toLowerCase() === text
						);
					}
					if (!ws || !ws.icon) continue;
					// The module row (sidebar kit) shows the same workspace the
					// trail resolved — one resolution, two consumers.
					sb_current_workspace = ws;
					sb_update_module_row();
					const chip = el("span", "bnd-crumb-chip");
					chip.appendChild(sprite_icon("icon-" + ws.icon));
					link.insertBefore(chip, link.firstChild);
					done = true;
					break; // one chip per trail: the main module
				}
				if (!done) all_done = false;
			}
			return all_done;
		}, 20);
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
		dock.appendChild(build_cluster({ search: "icon" }));
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
	 * The pinned utility section: Home and All Apps, above everything. Home
	 * routes to the default workspace; All Apps opens Frappe's /apps screen
	 * (a full page, so a real navigation). Idempotent by mount marker.
	 */
	function sb_mount_utils() {
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar || sidebar.querySelector(".bnd-sb-utils")) return;
		const header = sidebar.querySelector(".sidebar-header");
		if (!header) return;

		const utils = el("div", "bnd-sb-utils");
		const home = el("button", "bnd-sb-item", { type: "button" });
		const home_chip = el("span", "bnd-sb-chip");
		home_chip.appendChild(sprite_icon("icon-home"));
		home.appendChild(home_chip);
		home.appendChild(document.createTextNode(__("Home")));
		home.addEventListener("click", () => frappe.set_route(""));
		utils.appendChild(home);

		const apps = el("button", "bnd-sb-item", { type: "button" });
		const apps_chip = el("span", "bnd-sb-chip");
		// A 2x2 grid glyph of our own — no sprite id for "apps" is guaranteed.
		apps_chip.innerHTML =
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
			'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
			'<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
		apps.appendChild(apps_chip);
		apps.appendChild(document.createTextNode(__("All Apps")));
		apps.addEventListener("click", () => {
			window.location.href = "/apps";
		});
		utils.appendChild(apps);

		header.insertAdjacentElement("afterend", utils);
	}

	/**
	 * The module row: the current workspace's icon and name, pinned under the
	 * utility section. Clicking it opens the native brand menu (which holds
	 * the Workspaces cascade) — reuse, not reimplementation. Label refreshes
	 * on every route change from the workspace the crumb decorator resolved.
	 */
	function sb_mount_module_row() {
		const sidebar = document.querySelector(".body-sidebar");
		if (!sidebar || sidebar.querySelector(".bnd-sb-module")) return;
		const anchor = sidebar.querySelector(".bnd-sb-utils") || sidebar.querySelector(".sidebar-header");
		if (!anchor) return;

		const row = el("button", "bnd-sb-module", { type: "button", "aria-haspopup": "menu" });
		row.appendChild(el("span", "bnd-sb-chip bnd-sb-module-chip"));
		const label = el("span", "bnd-sb-module-label");
		row.appendChild(label);
		const chev = el("span", "bnd-sb-module-chev");
		chev.textContent = "▾";
		row.appendChild(chev);
		row.addEventListener("click", (e) => {
			e.stopPropagation();
			proxy_click(".body-sidebar .sidebar-header");
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
	 * Hover-expand menu rail. The container is narrowed by inline style
	 * (Frappe writes inline widths of its own, so CSS alone cannot win), and
	 * the .bnd-rail-open class drives the CSS overlay expansion. Opening
	 * triggers: pointer enter, focus entering the pane (keyboard parity).
	 * Closing waits 150ms so a wobbly pointer does not flap the pane.
	 * "hoverpin" adds a pin button that locks the pane open.
	 */
	function sb_mount_hover_rail() {
		const mode = document.documentElement.getAttribute("data-bnd-sb-menurail");
		if (mode !== "hover" && mode !== "hoverpin") return;
		const container = document.querySelector(".body-sidebar-container");
		if (!container || container.dataset.bndRail) return;
		container.dataset.bndRail = "1";
		container.style.width = "var(--bnd-sb-rail-w)";

		let close_timer = null;
		let pinned = false;
		const open = () => {
			clearTimeout(close_timer);
			container.classList.add("bnd-rail-open");
		};
		const close = () => {
			if (pinned) return;
			clearTimeout(close_timer);
			close_timer = setTimeout(() => container.classList.remove("bnd-rail-open"), 150);
		};
		container.addEventListener("pointerenter", open);
		container.addEventListener("pointerleave", close);
		container.addEventListener("focusin", open);
		container.addEventListener("focusout", close);

		if (mode === "hoverpin") {
			const header = container.querySelector(".sidebar-header");
			if (header) {
				const pin = el("button", "bnd-sb-pin", { type: "button", "aria-label": __("Pin sidebar open"), title: __("Pin sidebar open") });
				pin.textContent = "⌖";
				pin.addEventListener("click", (e) => {
					e.stopPropagation();
					pinned = !pinned;
					container.classList.toggle("bnd-rail-pinned", pinned);
					if (pinned) open();
					else close();
				});
				header.insertAdjacentElement("beforeend", pin);
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
						sb_wrap_sections();
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

	/** Mount every active piece of the sidebar kit. Skipped in Dock layout. */
	function mount_sidebar_kit() {
		if (!sb_active() || layout() === "dock") return;
		sb_resolve_workspace_from_route();
		sb_mount_utils();
		sb_mount_module_row();
		sb_wrap_sections();
		sb_mount_hover_rail();
		sb_mount_apps_rail();
		sb_mount_badges();
		sb_observe();
	}

	// ── Orchestration ───────────────────────────────────────────────────────

	/**
	 * Mount the chrome for the active layout, once the desk shell exists.
	 * Per-page work (compact cluster, crumb chips, dock highlight) re-runs on
	 * every route change; per-shell work runs once, guarded by mount markers.
	 */
	function mount_chrome() {
		const slug = layout();
		if (!slug) return; // boot failed or theme inactive: leave stock desk alone

		observe_sidebar_width();
		decorate_breadcrumbs();

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
		}
		// classic mounts nothing — stock chrome, plus the crumb chip above.

		// The sidebar style kit rides along in every layout that HAS a
		// sidebar; Dock hides it, so the kit stays down there.
		mount_sidebar_kit();

		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				close_menu();
				decorate_breadcrumbs();
				if (slug === "compact") inject_compact_cluster();
				if (slug === "dock") update_dock_active();
				sb_resolve_workspace_from_route();
				sb_update_module_row();
				sb_update_apps_rail_active();
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
