/**
 * The local stack's constants, and an authenticated browser session.
 *
 * WHY THIS FILE EXISTS
 *   The same forty lines — container name, site name, the bench-python
 *   invocation, and the `LoginManager.login_as("Administrator")` snippet that
 *   mints a sid — were retyped into eight throwaway probe scripts in a single
 *   session. Every copy was a chance to get the `frappe.local.request` stub
 *   wrong (it needs path, method, remote_addr, cookies, headers AND environ, or
 *   login raises), and every copy had to be found and fixed when a selector
 *   changed. It is a constant; constants live in a file.
 *
 *   `tests/smoke.mjs` and `tools/fingerprint.mjs` predate this and carry their
 *   own copies. They are not migrated here as part of writing it — that is a
 *   refactor of working, verified code and belongs in its own commit, not
 *   smuggled into a helper's introduction.
 *
 * WHY NOT `bench browse`
 *   Its xdg-open call crashes gunicorn on this stack. Never use it.
 *
 * USAGE
 *   import { openDesk, benchPy, URL_BASE } from "./tools/session.mjs";
 *   const { page, close } = await openDesk();
 *   await page.goto(`${URL_BASE}/desk/theme-settings?shell=1`);
 *   ...
 *   await close();
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCKER_BIN, dockerArgv } from "./docker.mjs";
import { browserLaunchOptions } from "./browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));

export const URL_BASE = process.env.BND_URL || "http://localhost:8080";
export const SITE = process.env.BND_SITE || "demo.bunood.test";
export const BACKEND = process.env.BND_BACKEND || "bunood-backend-1";
export const FRONTEND = process.env.BND_FRONTEND || "bunood-frontend-1";

/** The app containers, in the order a deploy feeds them. */
export const APP_CONTAINERS = [
	"bunood-backend-1",
	"bunood-queue-long-1",
	"bunood-queue-short-1",
	"bunood-scheduler-1",
];

/**
 * Run a Python snippet inside the backend, against the site.
 *
 * `frappe.init` + `frappe.connect` are prepended, and `json` is imported,
 * because every caller needed all three. Run from `sites/` with
 * `sites_path="."` — the other spelling (`sites_path="sites"` from the bench
 * root) resolves the log directory differently and dies on a missing
 * `/home/frappe/logs/database.log`.
 */
export function benchPy(code) {
	// ONE retry, only for MySQL 1020 ("record has changed... try restarting
	// transaction") — the error's own text names the remedy, and Frappe's
	// request handling retries it for the same reason. It became routine once
	// the full apps.json set was installed: ten apps' scheduler jobs now write
	// Singles and Users in the background, and one colliding write has killed
	// both a 25-minute suite run and a typography probe mid-restore — the
	// probe's `finally` never ran, which is the worst place to die. The
	// suite's own copy of this helper carries the same retry for the same
	// incident (tests/smoke.mjs).
	for (let attempt = 1; ; attempt++) {
		try {
			return execFileSync(
				DOCKER_BIN,
				dockerArgv(
					"exec", "-i", BACKEND, "bash", "-lc",
					"cd /home/frappe/frappe-bench/sites && ../env/bin/python -",
				),
				{
					input:
						"import frappe, json\n" +
						`frappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\n` +
						"frappe.connect()\n" +
						code,
					encoding: "utf8",
					stdio: ["pipe", "pipe", "pipe"],
				}
			);
		} catch (err) {
			const stderr = String(err.stderr || "");
			if (attempt === 1 && /\b1020\b/.test(stderr)) {
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
				continue;
			}
			throw err;
		}
	}
}

/** The last line of a bench-python run, parsed as JSON. */
export function benchJson(code) {
	return JSON.parse(benchPy(code).trim().split(/\r?\n/).pop());
}

/**
 * Mint an Administrator session id.
 *
 * The request stub is load-bearing: Frappe's login path dereferences
 * `request.path`, `.cookies`, `.headers` and `.environ`, and omitting any one
 * of them raises inside LoginManager rather than returning a usable error.
 */
export function mintSid() {
	const out = benchPy(
		"from frappe.auth import CookieManager, LoginManager\n" +
			"frappe.local.cookie_manager = CookieManager()\n" +
			"frappe.local.form_dict = frappe._dict()\n" +
			"frappe.local.request = frappe._dict(path='/', method='GET', remote_addr='127.0.0.1', " +
			"cookies=frappe._dict(), headers=frappe._dict(), environ=frappe._dict())\n" +
			"frappe.local.request_ip = '127.0.0.1'\n" +
			"lm = LoginManager()\n" +
			"lm.login_as('Administrator')\n" +
			"frappe.db.commit()\n" +
			"print('SID=' + frappe.session.sid)\n"
	);
	const m = out.match(/SID=([a-f0-9]+)/);
	if (!m) throw new Error(`could not mint a session:\n${out}`);
	return m[1];
}

/**
 * A logged-in page on the local desk.
 *
 * @returns {Promise<{page, browser, context, close, errors}>} `errors`
 *   accumulates console errors and page exceptions, minus the two that are
 *   environmental on this stack and mean nothing (socket.io cannot reach the
 *   websocket container from a headless context).
 */
export async function openDesk({ width = 1440, height = 900 } = {}) {
	const { chromium } = require("playwright");
	const sid = mintSid();
	const browser = await chromium.launch(browserLaunchOptions());
	const context = await browser.newContext({ viewport: { width, height } });
	await context.addCookies([
		{ name: "sid", value: sid, domain: "localhost", path: "/" },
	]);
	const page = await context.newPage();

	const errors = [];
	const noise = /socket\.io|Invalid origin/i;
	page.on("console", (m) => {
		if (m.type() === "error" && !noise.test(m.text())) errors.push(m.text().slice(0, 300));
	});
	page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));

	return { page, browser, context, errors, close: () => browser.close() };
}

/**
 * Navigate and wait for the desk to be ready.
 *
 * The default 60s is not padding. `bunood_theme.api.get_status_signals` takes
 * ~5,000ms on its FIRST call after a restart and 8-10ms thereafter, so the
 * first navigation of a cold stack routinely exceeds a 30s budget — measured
 * 2026-08-06, after it produced two unrelated-looking suite failures (a 504 on
 * that endpoint, and a status-bar test that then measured a bar with no data).
 */
export async function goto(page, route, selector, { settle = 4000, timeout = 60000 } = {}) {
	await page.goto(`${URL_BASE}${route}`, { waitUntil: "domcontentloaded", timeout });
	if (selector) await page.waitForSelector(selector, { timeout });
	await page.waitForTimeout(settle);
}

/** Read Theme Settings fields. */
export function getSettings(fields) {
	return benchJson(
		`vals = {f: frappe.db.get_single_value("Theme Settings", f) for f in ${JSON.stringify(fields)}}\n` +
			"print(json.dumps(vals, default=str))\n"
	);
}

/**
 * Write Theme Settings fields and clear the cache.
 *
 * ALWAYS restore what you write. `tests/smoke.mjs` snapshots and restores via
 * MUTABLE_FIELDS; an ad-hoc probe has no such safety net, and a field left
 * changed is indistinguishable from a defect the next time anyone looks.
 */
export function setSettings(values) {
	return benchPy(
		`vals = json.loads(${JSON.stringify(JSON.stringify(values))})\n` +
			"for f, v in vals.items():\n" +
			'    frappe.db.set_single_value("Theme Settings", f, v)\n' +
			"frappe.clear_cache()\n" +
			"frappe.db.commit()\n" +
			'print("ok")\n'
	);
}

/** Fields that differ from what a fresh install writes. Empty means clean. */
export function settingsDrift() {
	return benchJson(
		"from bunood_theme.setup import SHIPPED\n" +
			"drift = {f: [str(frappe.db.get_single_value('Theme Settings', f)), str(v)]\n" +
			"         for f, v in SHIPPED.items()\n" +
			"         if str(frappe.db.get_single_value('Theme Settings', f)) != str(v)}\n" +
			"print(json.dumps(drift))\n"
	);
}
