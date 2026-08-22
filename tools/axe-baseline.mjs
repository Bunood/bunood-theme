/**
 * Regenerate the Desk axe baseline — tests/fixtures/axe-baseline.json.
 *
 * WHAT THE BASELINE IS
 *     The Frappe Desk's CURRENT axe score, keyed route -> rule -> node count.
 *     The suite's "axe over the Desk" test fails only on a rule the baseline
 *     has never seen or a count that GREW — upstream's standing violations
 *     are recorded here so they cannot fail a gate they do not belong to,
 *     while anything OUR changes add still does.
 *
 * THE REGENERATION CONTRACT (same as tools/fingerprint.mjs)
 *     A diff here is not automatically fine. Regenerating with a GROWN count
 *     bakes a regression into the record — so read the diff, decide it is
 *     upstream's, and only then commit the new baseline. Shrinking counts are
 *     always safe to record and make the gate stricter for free.
 *
 * USAGE
 *     node tools/axe-baseline.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tests", "fixtures", "axe-baseline.json");
const SITE = "demo.bunood.test";
const BACKEND = "bunood-backend-1";
const URL_BASE = "http://localhost:8080";

// The same routes the suite's baseline test walks — the three page shapes a
// desk session lives in: a list view, a document form, and the settings form.
const ROUTES = [
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
	// Item 32: the two LOGGED-OUT routes. They are the only entries here that
	// are not a desk session, so they are scanned in a cookie-less context —
	// www/login.py redirects an authenticated session to /desk, and a baseline
	// banked from that redirect would be the desk's, silently.
	["/login", ".for-login .page-card", { guest: true }],
	["/update-password", ".for-reset-password .page-card", { guest: true }],
];

const py = (c) =>
	execFileSync(
		"docker",
		["exec", "-i", BACKEND, "bash", "-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python -"],
		{
			input:
				`import frappe, json\nfrappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\nfrappe.connect()\n` + c,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		}
	);

const sid = py(
	`from frappe.auth import CookieManager, LoginManager\nfrappe.local.cookie_manager=CookieManager()\nfrappe.local.form_dict=frappe._dict()\nfrappe.local.request=frappe._dict(path="/",method="GET",remote_addr="127.0.0.1",cookies=frappe._dict(),headers=frappe._dict(),environ=frappe._dict())\nfrappe.local.request_ip="127.0.0.1"\nlm=LoginManager()\nlm.login_as("Administrator")\nfrappe.db.commit()\nprint("SID="+frappe.session.sid)\n`
).match(/SID=([a-f0-9]+)/)[1];

// PIN THE STATE, because a baseline of "whatever the site held" is not a
// baseline: the suite's diff test runs at the shipped defaults, and the two
// measuring different desks turned a state difference into a phantom
// regression (color-contrast "grew" 3 -> 4 the first time the pair ran).
py(
	`from bunood_theme.setup import SHIPPED
for f, v in SHIPPED.items():
    frappe.db.set_single_value("Theme Settings", f, v, update_modified=False)
frappe.clear_cache()
frappe.db.commit()
print("pinned")
`
);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addCookies([{ name: "sid", value: sid, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

const baseline = {};
for (const [route, waitFor, opts] of ROUTES) {
	// A guest route gets its own context with NO sid cookie — guest-ness here is
	// the ABSENCE of the cookie, so it cannot be had by clearing one on a page
	// that has already redirected.
	let target = page;
	let guestCtx = null;
	if (opts && opts.guest) {
		guestCtx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
		target = await guestCtx.newPage();
	}
	await target.goto(URL_BASE + route.replace("/desk/", "/app/").replace("/desk", "/app"), {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});
	await target.waitForSelector(waitFor, { timeout: 30000 });
	await target.waitForTimeout(2500);
	const res = await new AxeBuilder({ page: target }).withTags(["wcag2a", "wcag2aa"]).analyze();
	baseline[route] = {};
	for (const v of res.violations) baseline[route][v.id] = v.nodes.length;
	console.log(`${route}: ${res.violations.length} standing rules (${res.violations.reduce((a, v) => a + v.nodes.length, 0)} nodes)`);
	for (const v of res.violations) console.log(`   ${v.id}: ${v.nodes.length}`);
	if (guestCtx) await guestCtx.close();
}

writeFileSync(OUT, JSON.stringify(baseline, null, "\t") + "\n");
console.log(`wrote ${OUT}`);
await b.close();
