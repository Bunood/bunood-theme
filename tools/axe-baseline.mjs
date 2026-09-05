/**
 * Regenerate the Desk axe baseline — tests/fixtures/axe-baseline.json.
 *
 * WHAT THE BASELINE IS
 *     The CURRENT axe score of every surface this theme dresses, keyed
 *     route -> rule -> node count. The suite's "axe over the Desk" test fails
 *     only on a rule the baseline has never seen or a count that GREW —
 *     upstream's standing violations are recorded here so they cannot fail a
 *     gate they do not belong to, while anything OUR changes add still does.
 *
 *     IT IS NO LONGER ONLY THE DESK, despite the filename and the test name.
 *     Item 32 added the two logged-out routes and item 33 the five website and
 *     portal shapes, which between them need THREE different session contexts:
 *     an Administrator cookie, no cookie at all, and the portal fixture's own
 *     user. Each is there because scanning the wrong one banks a DOM that looks
 *     right and is not.
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
import { DOCKER_BIN, dockerArgv } from "./docker.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
import { browserLaunchOptions } from "./browser.mjs";
// The routes and the scan configuration live in ONE place, shared with the
// check that enforces what this tool banks. See tools/axe-routes.mjs.
import { ROUTES, scanForBaseline } from "./axe-routes.mjs";
import { FIXTURE as PORTAL_FIXTURE, fixturesReady, status as portalStatus } from "./portal-fixtures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tests", "fixtures", "axe-baseline.json");
const SITE = "demo.bunood.test";
const BACKEND = "bunood-backend-1";
const URL_BASE = "http://localhost:8080";

// The same routes the suite's baseline test walks — the three page shapes a
// desk session lives in: a list view, a document form, and the settings form.
//
// KEPT IN STEP BY `assertAxeRoutesAgree` IN build.mjs, not by hand. This list
// and the one inside `a11y: axe over the Desk` in tests/smoke.mjs are the same
// fact twice — this one CAPTURES the baseline, that one ENFORCES it — and the
// build fails when they disagree about a route, its selector, or the SESSION it
// is scanned in. They are allowed to stay separate because their commentary
// answers different questions and because the suite's entries legitimately
// carry `bust: true` where these do not: the scan below runs straight after a
// `frappe.clear_cache()`, so its pages are fresh by construction. Adding a route
// here without adding it there is now a build error rather than a silent hole.


const py = (c) =>
	execFileSync(
		DOCKER_BIN,
		dockerArgv("exec", "-i", BACKEND, "bash", "-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python -"),
		{
			input:
				`import frappe, json\nfrappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\nfrappe.connect()\n` + c,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		}
	);

// Item 33 needs a THIRD identity, so minting became a function. `login_as` is
// parameterised; everything else about the request stub is unchanged, because
// login raises without every one of path/method/remote_addr/cookies/headers
// AND environ being present.
const mintSid = (user) =>
	py(
	`from frappe.auth import CookieManager, LoginManager\nfrappe.local.cookie_manager=CookieManager()\nfrappe.local.form_dict=frappe._dict()\nfrappe.local.request=frappe._dict(path="/",method="GET",remote_addr="127.0.0.1",cookies=frappe._dict(),headers=frappe._dict(),environ=frappe._dict())\nfrappe.local.request_ip="127.0.0.1"\nlm=LoginManager()\nlm.login_as(${JSON.stringify(user)})\nfrappe.db.commit()\nprint("SID="+frappe.session.sid)\n`
	).match(/SID=([a-f0-9]+)/)[1];

const sid = mintSid("Administrator");

// THE PORTAL PAIR IS SKIPPED RATHER THAN FAKED when the fixture is absent. A
// site that has never run tools/portal-fixtures.mjs renders /orders as an empty
// list, and an axe scan of empty chrome banks a clean count that means nothing —
// the same reason item 27 seeds its four alternate views before scanning them.
// READY, NOT MERELY PRESENT. The first cut tested `frappe.db.exists("User", …)`,
// which is true the moment the account exists — but a populated portal ALSO
// needs the Customer link, the `Portal User` child row and SUBMITTED orders, so
// a bare user renders an empty list and banks a clean count off an empty page.
// `fixturesReady` already encodes all four conditions; reusing it means this
// file holds no second opinion about what "ready" means.
const PORTAL_PRESENT = fixturesReady(portalStatus());
const portalSid = PORTAL_PRESENT ? mintSid(PORTAL_FIXTURE.user) : null;

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

const b = await chromium.launch(browserLaunchOptions());
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
	// Item 33's portal pair: a THIRD context carrying the fixture user's cookie,
	// not the Administrator's. See the ROUTES note for why that distinction is
	// load-bearing rather than tidy.
	if (opts && opts.portal) {
		if (!portalSid) {
			console.log(`${route}: SKIPPED — portal fixture absent (run tools/portal-fixtures.mjs)`);
			continue;
		}
		guestCtx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
		await guestCtx.addCookies([{ name: "sid", value: portalSid, domain: "localhost", path: "/" }]);
		target = await guestCtx.newPage();
	}
	await target.goto(URL_BASE + route.replace("/desk/", "/app/").replace("/desk", "/app"), {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});
	await target.waitForSelector(waitFor, { timeout: 30000 });
	await target.waitForTimeout(2500);
	const res = await scanForBaseline(AxeBuilder, target);
	baseline[route] = {};
	for (const v of res.violations) baseline[route][v.id] = v.nodes.length;
	console.log(`${route}: ${res.violations.length} standing rules (${res.violations.reduce((a, v) => a + v.nodes.length, 0)} nodes)`);
	for (const v of res.violations) console.log(`   ${v.id}: ${v.nodes.length}`);
	if (guestCtx) await guestCtx.close();
}

writeFileSync(OUT, JSON.stringify(baseline, null, "\t") + "\n");
console.log(`wrote ${OUT}`);
await b.close();
