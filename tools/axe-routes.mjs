/**
 * The axe baseline's scan configuration — the routes, and how they are scanned.
 *
 * WHY THIS FILE EXISTS
 *   `tools/axe-baseline.mjs` CAPTURES `tests/fixtures/axe-baseline.json`; the
 *   `a11y: axe over the Desk` check in `tests/smoke.mjs` ENFORCES it. They must
 *   scan the same DOM the same way, or the gate compares a number to one banked
 *   from somewhere else — and it looks entirely correct while doing it.
 *
 *   Both files used to carry their own copy of the list, held in agreement by
 *   `build.mjs::assertAxeRoutesAgree`, which compared route, selector and
 *   session across the two texts. That guard is retired with this file: it
 *   existed because there were two copies, and it could only ever check the
 *   three things it knew to parse. It could not see, for instance, that only one
 *   copy had learned to exclude something — which is exactly the change that
 *   prompted this extraction, and exactly the drift a text comparison misses.
 *
 *   The scan itself is a FUNCTION and not a pair of constants, because there are
 *   FOUR call sites: the tool's one, and the suite's three (desk, guest, portal).
 *   Four places to remember an `exclude()` is four places to forget it.
 *
 * WHAT IS DELIBERATELY NOT SHARED
 *   `bust` is carried here but read only by the SUITE. Frappe caches website
 *   HTML on `(path, lang)` and nothing else. The tool calls
 *   `frappe.clear_cache()` immediately before it scans, so its pages are fresh
 *   by construction; the suite runs this check in the middle of hundreds of
 *   others, any of which can have repopulated that cache since. So the flag is a
 *   fact about the route that only one consumer needs, which is different from a
 *   disagreement between them.
 */

/**
 * Frappe's own onboarding panel, excluded from every baseline scan.
 *
 * WHY IT IS OUT OF SCOPE, and it is not "because it was failing". Measured
 * 2026-08-30:
 *
 *   * This theme emits ZERO rules matching `.onb-*` — grepped across the SCSS
 *     and the runtime, and 0 occurrences in the compiled bundle. The panel paints
 *     its own opaque `#ffffff` / `#fdfaed`, so nothing of ours reaches its
 *     contrast. Whatever it scores, we did not cause and cannot fix.
 *   * Its content tracks the onboarding COMPLETION PERCENTAGE.
 *     `.onb-progress-badge` literally renders "17% completed", and a finished
 *     step renders `.onb-step-text` with `text-decoration: line-through` — a node
 *     that does not exist at 0%. Documents created by the suite's own fixtures
 *     advance it. So the node COUNT this baseline records moves for reasons that
 *     are never the theme's.
 *   * It lives inside `.body-sidebar-container`, so it is on FIVE of the six
 *     desk routes, not one. It was a large share of every count they recorded:
 *
 *         /app/item                    contrast 2->0   button-name 9->7
 *         /app/item/BND-TEST-001       contrast 6->4   button-name 15->13
 *         /app/selling                 contrast 3->1   button-name 8->6
 *         /app/dashboard-view/Selling  contrast 5->3   button-name 10->8
 *         /app/account/view/report     contrast 4->0   button-name 8->6
 *
 *     plus `image-alt 1->0` on all five, and no change at
 *     `/desk/theme-settings?shell=1`, which mounts no pane.
 *
 * WHAT STAYS IN SCOPE, because this is a narrow exclusion and not a licence: the
 * pane's own rows, the four `button-name` nodes inside our `.bnd-sb-card`, every
 * widget, every bar, and both website surfaces. If the theme makes any of those
 * worse the gate still says so.
 *
 * THE COST, STATED: if this theme ever DID reach the onboarding panel, the gate
 * would no longer notice. Today it cannot — but "we emit no rule for it" is a
 * fact that has to stay true, so a rule targeting `.onb-*` is a reason to
 * revisit this, not to widen it.
 */
export const AXE_EXCLUDE = ".user-onboarding";

/** The WCAG tag set every baseline scan uses. */
export const AXE_TAGS = ["wcag2a", "wcag2aa"];

/**
 * `[route, readinessSelector, opts?]`, in capture order.
 *
 * `opts.guest` scans with NO session cookie; `opts.portal` scans as the portal
 * fixture user; absent means Administrator. `opts.bust` appends a query string
 * to defeat Frappe's website cache — see the note above on why only the suite
 * reads it.
 */
export const ROUTES = [
	["/desk/item", ".page-head"],
	["/desk/item/BND-TEST-001", ".form-tabs-list"],
	["/desk/theme-settings?shell=1", ".bnd-shell"],
	// Item 25: the two surfaces the workspace + chart kits land on.
	["/desk/selling", ".ce-block .widget"],
	["/desk/dashboard-view/Selling", ".widget-group-body"],
	// Item 26: the report view's datatable. The /app/ form on purpose — it is
	// verified to render and the tool's /desk/->/app/ rewrite is a no-op on it.
	// The query-report route renders the SAME .datatable DOM, so this covers the
	// datatable's axe profile; its unique chrome (.report-summary) is filter- and
	// date-dependent — unsafe for a node-count gate — and gets explicit contrast
	// pairs in item 26's close instead.
	["/app/account/view/report", ".dt-scrollable .dt-row"],
	// Item 27: the four alternate views. Each needs seeded data to render at all
	// (tools/fixtures-views.mjs) — the demo site ships with zero Kanban Boards,
	// Tasks or Events, and a baseline over empty chrome banks no honest count.
	// The board name in the kanban route is the pinned fixture name; a generated
	// name would break this baseline on the next reseed.
	["/app/todo/view/kanban/Bunood%20Memos", ".kanban-column"],
	["/app/todo/view/calendar", ".fc"],
	["/app/todo/view/gantt", ".gantt .bar"],
	["/app/item/view/image", ".image-view-container"],
	// Item 32: the two LOGGED-OUT routes. They are the only entries here that are
	// not a desk session, so they are scanned in a cookie-less context —
	// www/login.py redirects an authenticated session to /desk, and a baseline
	// banked from that redirect would be the desk's, silently.
	["/login", ".for-login .page-card", { guest: true }],
	["/update-password", ".for-reset-password .page-card", { guest: true }],
	// Item 33: the website and portal. FIVE ROUTES FOR FIVE TEMPLATE SHAPES, not
	// five addresses — `docs/upstream/frappe-website.md` §0 measured that twelve
	// erpnext portal routes collapse onto ONE template, so scanning more of them
	// would bank the same DOM repeatedly and still miss the shapes below.
	// `/support` is erpnext's own `www/*` (navbar + footer, no sidebar),
	// `/request-data/new` is a Web Form, `/404` has no chrome at all, `/orders`
	// is `www/portal.html` (navbar + sidebar, no footer) and `/me` is the account
	// page (no navbar, no sidebar, no footer).
	["/support", ".navbar", { guest: true, bust: true }],
	["/request-data/new", ".navbar", { guest: true, bust: true }],
	["/404", "body", { guest: true, bust: true }],
	// THE PORTAL PAIR NEEDS THE FIXTURE USER, NOT THE ADMINISTRATOR, and that is
	// not a preference. `website_list_for_contact.py` renders a populated list to
	// an Administrator through the PERMISSION branch — every Customer on the site
	// — and to a Website User through the Portal-User branch. Scanning as
	// Administrator banks the wrong DOM while looking entirely correct. Slice 0
	// proved this by sabotage; see the harness check in tests/smoke.mjs.
	["/orders", ".website-list", { portal: true, bust: true }],
	["/me", ".portal-container", { portal: true, bust: true }],
];

/**
 * Run the baseline scan on one page, configured identically everywhere.
 *
 * `AxeBuilder` is a parameter because the two consumers obtain it differently —
 * the tool through `createRequire`, the suite through a static import — and a
 * module that imported it itself would drag `@axe-core/playwright` into every
 * caller of this file.
 *
 * @param {Function} AxeBuilder - the `@axe-core/playwright` constructor
 * @param {import("playwright").Page} page - the page to scan
 * @returns {Promise<{violations: Array}>} axe's result object
 */
export function scanForBaseline(AxeBuilder, page) {
	return new AxeBuilder({ page }).withTags(AXE_TAGS).exclude(AXE_EXCLUDE).analyze();
}
