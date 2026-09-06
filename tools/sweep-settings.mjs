/**
 * The settings sweep: click EVERY option of EVERY picker, and demand that each
 * click saves cleanly.
 *
 * WHY THIS EXISTS AS A TOOL AND NOT A SUITE TEST
 *     The suite asserts contracts — one click applies, the pickers render
 *     their complement, a preset writes what it says. This walks the whole
 *     option space (a few hundred clicks, minutes of wall clock) and answers a
 *     different question: is there ANY option that errors when applied? That
 *     question needs asking after work that touches many pickers at once, not
 *     on every push. Run it with:
 *
 *         node tools/sweep-settings.mjs
 *
 * WHAT A FAILURE MEANS
 *     Every option is applied through the same click path a user has, then the
 *     sweep waits for the autosave to settle and reads the document back. A
 *     row is reported when the click did not save (the single-write race's
 *     signature), when the value did not land (a picker writing something the
 *     field refuses — the E1 class of bug), or when the console gained an
 *     error (a renderer choking on the new state).
 *
 * WHAT IT CLICKS
 *     The selector inventory is read off the form script's own .on("click")
 *     wiring — the first cut of this sweep knew two selectors and reported
 *     eleven panes as having "0 options", which is a sweep finding nothing
 *     wrong because it looked at nothing. Four kinds:
 *
 *       explicit  data-field + data-value on the element
 *       implicit  style/layout cards that write one FIXED field
 *       toggle    data-field, where data-value is the NEXT state — it flips
 *                 on every render, so it is re-read at click time
 *       preset    sidebar preset cards; clicking applies a whole catalogue row
 *
 * STATE
 *     The full Theme Settings document is snapshotted first and restored last,
 *     through the same tabSingles read the suite uses, so a sweep leaves the
 *     site exactly as it found it however it ends.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SITE = "demo.bunood.test";
const BACKEND = "bunood-backend-1";
const URL_BASE = "http://localhost:8080";

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

// Snapshot every Theme Settings row so the sweep restores what it found.
const snapshot = JSON.parse(
	py(
		`rows = frappe.db.sql("select field, value from tabSingles where doctype='Theme Settings'", as_dict=True)\nprint(json.dumps({r.field: r.value for r in rows}))\n`
	)
		.trim()
		.split(/\r?\n/)
		.pop()
);

// THE SECOND TABLE. Theme Settings is not the only state a walk through the
// pickers can move: the desk chrome carries PERSONAL controls (the density
// cycle, the drag, the panel's mode radios), and anything that persists
// through frappe.defaults lands in tabDefaultValue — a table the tabSingles
// snapshot cannot see. Found the hard way: a full gate's personal-hygiene
// preamble red with bnd_density=Compact for Administrator after a day of
// sweeps, writer unattributable. So the sweep snapshots the admin's bnd_*
// rows too, and the restore reconciles them the same way: set what drifted,
// clear what appeared, count both tables in the self-check.
const personalSnapshot = JSON.parse(
	py(
		`rows = frappe.db.sql("select defkey, defvalue from tabDefaultValue where parent='Administrator' and defkey like 'bnd_%'", as_dict=True)\nprint(json.dumps({r.defkey: r.defvalue for r in rows}))\n`
	)
		.trim()
		.split(/\r?\n/)
		.pop()
);

// THE RESTORE MUST ALSO DELETE. A Single field that has never been written
// has NO tabSingles row — the snapshot cannot carry it, the sweep's click
// CREATES the row, and a restore that only loops snapshot keys leaves the
// clicked value behind forever. Reproduced 2026-08-30: eleven print_*
// fields off their shipped defaults after a sweep that printed "state
// restored", and four unrelated suite checks red with nothing naming the
// cause. So: rows not in the snapshot are deleted back to absence, the
// restored doc fires on_update ONCE (set_single_value does not, and the
// sweep's own clicks regenerated artifacts from sweep-end values), and
// the function returns the DIFF against the snapshot rather than trusting
// itself — the caller refuses to say "restored" over a non-empty diff.
const restore = () => {
	const out = py(
		`vals = json.loads(${JSON.stringify(JSON.stringify(snapshot))})\n` +
			`skip = ("name", "modified", "modified_by", "owner", "creation", "idx", "docstatus")\n` +
			`now = [r.field for r in frappe.db.sql("select field from tabSingles where doctype='Theme Settings'", as_dict=True)]\n` +
			`for f in now:\n` +
			`    if f in skip or f in vals:\n` +
			`        continue\n` +
			`    frappe.db.delete("Singles", {"doctype": "Theme Settings", "field": f})\n` +
			`for f, v in vals.items():\n` +
			`    if f in skip:\n` +
			`        continue\n` +
			`    frappe.db.set_single_value("Theme Settings", f, v, update_modified=False)\n` +
			`frappe.db.commit()\n` +
			`frappe.clear_cache()\n` +
			`doc = frappe.get_cached_doc("Theme Settings")\n` +
			`doc.run_method("on_update")\n` +
			`frappe.db.commit()\n` +
			`want_p = json.loads(${JSON.stringify(JSON.stringify(personalSnapshot))})\n` +
			`have_rows = frappe.db.sql("select defkey, defvalue from tabDefaultValue where parent='Administrator' and defkey like 'bnd_%'", as_dict=True)\n` +
			`have_p = {r.defkey: r.defvalue for r in have_rows}\n` +
			`for k in set(list(want_p) + list(have_p)):\n` +
			`    if want_p.get(k) == have_p.get(k):\n` +
			`        continue\n` +
			`    if k in want_p:\n` +
			`        frappe.defaults.set_default(k, want_p[k], parent="Administrator")\n` +
			`    else:\n` +
			`        frappe.defaults.clear_default(k, parent="Administrator")\n` +
			`frappe.cache.hdel("bootinfo", "Administrator")\n` +
			`frappe.db.commit()\n` +
			`after = {r.field: r.value for r in frappe.db.sql("select field, value from tabSingles where doctype='Theme Settings'", as_dict=True)}\n` +
			`after_rows = frappe.db.sql("select defkey, defvalue from tabDefaultValue where parent='Administrator' and defkey like 'bnd_%'", as_dict=True)\n` +
			`after_p = {r.defkey: r.defvalue for r in after_rows}\n` +
			`drift = {}\n` +
			`for k in set(list(want_p) + list(after_p)):\n` +
			`    if want_p.get(k) != after_p.get(k):\n` +
			`        drift["personal:" + k] = {"snapshot": want_p.get(k), "now": after_p.get(k)}\n` +
			`for f in set(list(vals) + list(after)):\n` +
			`    if f in skip:\n` +
			`        continue\n` +
			`    if vals.get(f) != after.get(f):\n` +
			`        drift[f] = {"snapshot": vals.get(f), "now": after.get(f)}\n` +
			`print("RESTORE_DRIFT=" + json.dumps(drift))\n`
	);
	const m = out.match(/RESTORE_DRIFT=(\{.*\})/);
	return m ? JSON.parse(m[1]) : { __unreadable__: out.slice(-200) };
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "sid", value: sid, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

// Console errors, attributed to whichever click is in flight.
const failures = [];
let current = "(none)";
const seenErrors = [];
page.on("console", (msg) => {
	if (msg.type() !== "error") return;
	// The URL rides in location, not text — "Failed to load resource ... 417"
	// says nothing about WHICH endpoint without it, and the allowlist has to
	// tell a recovered savedocs deadlock from a real failure by the endpoint.
	const loc = (msg.location && msg.location()) || {};
	const text = msg.text() + " " + (loc.url || "");
	// The same allowlist reasoning as the suite: transient deadlocks retry,
	// route-history 5xx noise is Frappe's, and socket.io origin refusals are
	// the bench's CORS config, none of them a picker's doing.
	if (
		/QueryDeadlockError|route_history|favicon|socket\.io|Invalid origin/.test(text) ||
		/Record has changed since last read in table/.test(text) ||
		// The recovered Single-write conflict, same reasoning and same shape as
		// the suite's CONSOLE_ALLOWLIST: the sweep clicks fast enough to race
		// its own autosaves, the merge retries, and the click lands — which
		// the "did not save" check would catch if it did not.
		/417 \(EXPECTATION FAILED\)[\s\S]*savedocs/.test(text) ||
		/Traceback[\s\S]*savedocs/.test(text)
	) return;
	seenErrors.push({ at: current, text: text.slice(0, 300) });
});

await page.goto(`${URL_BASE}/desk/theme-settings?shell=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".bnd-shell-item", { timeout: 30000 });
await page.waitForTimeout(2000);

const settled = async () => {
	// Saved AND idle: dirty can flip true->false->true while a merge retries,
	// so require it to hold for a beat.
	try {
		await page.waitForFunction(() => window.cur_frm && !window.cur_frm.is_dirty(), { timeout: 20000 });
		await page.waitForTimeout(250);
		await page.waitForFunction(() => window.cur_frm && !window.cur_frm.is_dirty(), { timeout: 20000 });
		return true;
	} catch {
		return false;
	}
};

const items = await page.evaluate(() =>
	[...document.querySelectorAll(".bnd-shell-item")].map((n) => n.getAttribute("data-key"))
);
console.log(`shell items: ${items.join(", ")}`);

for (const key of items) {
	await page.click(`.bnd-shell-item[data-key="${key}"]`);
	await page.waitForTimeout(600);

	const opts = await page.evaluate(() => {
		const out = [];
		const vis = (n) => n.offsetParent !== null && !n.disabled && !n.hasAttribute("disabled");
		const seen = new Set();
		const push = (row, k) => {
			if (seen.has(k)) return;
			seen.add(k);
			out.push(row);
		};
		for (const n of document.querySelectorAll(
			".bnd-cbp-opt, .bnd-dgm-slot, .bnd-sbp-opt, .bnd-sbp-stop"
		)) {
			if (!vis(n)) continue;
			const field = n.getAttribute("data-field");
			const value = n.getAttribute("data-value");
			if (field && value !== null) push({ kind: "explicit", field, value }, field + "=" + value);
		}
		// Style cards share `bnd-cbp-style` as a BASE class; each picker adds
		// its own (`bnd-lp-card`, `bnd-plp-style`, ...) and its host-scoped
		// handler writes its own field. The crumbs picker's cards carry ONLY
		// the base class — so the specific classes are claimed first, and a
		// bare base class means crumbs. The first cut mapped the base class to
		// crumb_style everywhere and reported the LAYOUT cards as crumb_style
		// writes that never landed.
		// THE EXCLUSION IS DERIVED FROM THE MAP NOW, and item 33 is why. This
		// was two hand-kept lists that had to agree, and the comment here used
		// to say "every new picker's card class must join BOTH" — which is a
		// same-fact-in-two-places trap with an instruction attached instead of
		// a fix. It caught the list kit fourth and item 33's web kit fifth,
		// each reported as crumb_style writes that never landed. A specific
		// class now excludes itself from the catch-all by existing.
		// CARDS THAT WRITE MANY FIELDS, NOT ONE. The layout cards and (item 37)
		// the theme cards apply a whole PRESET — the layout cards write the five
		// container toggles, a theme card writes 124 values — so there is no
		// single `field` to click-and-assert, and `desk_layout` (which this list
		// mapped until item 37 deleted it) does not exist to hold the answer.
		// They still have to be NAMED here, because the crumbs catch-all below is
		// the complement of these keys: leave one out and every one of its cards
		// is swept as a crumb_style write that never lands.
		const MULTI = [".bnd-lp-card", ".bnd-thp-style", ".bnd-prp-style"];
		const IMPLICIT = {
			".bnd-plp-style": "palette_style",
			".bnd-ibp-style": "inbox_style",
			".bnd-stp-style": "status_style",
			".bnd-lvp-style": "list_style",
			".bnd-fvp-style": "form_style",
			".bnd-wsp-style": "workspace_style",
			".bnd-chp-style": "chart_grid",
			".bnd-rvp-style": "report_style",
			".bnd-avp-style": "views_style",
			".bnd-ovp-style": "overlay_style",
			".bnd-esp-style": "empty_style",
			".bnd-skp-style": "skeleton_style",
			".bnd-flp-style": "filters_style",
			".bnd-lgp-style": "login_style",
			".bnd-wbp-style": "web_style",
			".bnd-emp-style": "email_style",
			".bnd-icp-style": "icon_style",
		};
		const CRUMBS_ONLY =
			".bnd-cbp-style" +
			Object.keys(IMPLICIT).concat(MULTI).map((c) => `:not(${c})`).join("");
		IMPLICIT[CRUMBS_ONLY] = "crumb_style";
		for (const [sel, field] of Object.entries(IMPLICIT)) {
			for (const n of document.querySelectorAll(sel)) {
				if (!vis(n)) continue;
				const value = n.getAttribute("data-value");
				if (value !== null) push({ kind: "implicit", sel, field, value }, field + "=" + value);
			}
		}
		for (const n of document.querySelectorAll(".bnd-sbp-toggle, .bnd-cbp-toggle, .bnd-ibp-toggle, .bnd-stp-toggle")) {
			if (!vis(n)) continue;
			const field = n.getAttribute("data-field");
			if (field) push({ kind: "toggle", field }, "toggle:" + field);
		}
		for (const n of document.querySelectorAll(".bnd-sbp-preset")) {
			if (!vis(n)) continue;
			const preset = n.getAttribute("data-preset");
			if (preset) push({ kind: "preset", preset }, "preset:" + preset);
		}
		// MULTI cards stay NAMED-not-swept: clicking a whole-preset card
		// re-renders its pane, and a class-selector .first() click walks a
		// DOM that no longer exists (tried 2026-08-31: 29 "vanished"
		// reports, all of them the sweep chasing its own re-render, none a
		// picker defect). Sweeping them for real needs per-family plumbing
		// that re-enters the pane and targets by data-value — a separate
		// piece of work. Their exclusion from the crumbs catch-all is what
		// this list is FOR; the print cards sit here so a print-preset
		// click is never again reported as a crumb_style write.
		// PLAIN FRAPPE CONTROLS. The container panes (top bar, page header,
		// dock) are a single stock Check field each, and density is a stock
		// Select — settings like any other, invisible to a sweep that only
		// knows this theme's picker classes. Free-input fields (Data, Color,
		// Attach) stay out: their value space is unbounded and the suite's
		// live-preview tests own them.
		for (const n of document.querySelectorAll(
			".frappe-control[data-fieldtype='Check'] input[type='checkbox']"
		)) {
			if (n.offsetParent === null || n.disabled) continue;
			const wrap = n.closest("[data-fieldname]");
			const field = wrap && wrap.getAttribute("data-fieldname");
			if (field) push({ kind: "check", field }, "check:" + field);
		}
		for (const n of document.querySelectorAll(".frappe-control[data-fieldtype='Select'] select")) {
			if (n.offsetParent === null || n.disabled) continue;
			const wrap = n.closest("[data-fieldname]");
			const field = wrap && wrap.getAttribute("data-fieldname");
			if (!field) continue;
			for (const opt of n.options) {
				if (opt.value) push({ kind: "select", field, value: opt.value }, field + "=" + opt.value);
			}
		}
		return out;
	});

	console.log(`\n[${key}] ${opts.length} options`);
	for (const o of opts) {
		const label =
			o.kind === "preset" ? `preset ${o.preset}` :
			o.kind === "toggle" || o.kind === "check" ? `${o.kind} ${o.field}` :
			`${o.field} = ${o.value}`;
		current = `${key}: ${label}`;

		// The two stock-control kinds have their own apply paths: a checkbox
		// is clicked and must flip, a select is driven through selectOption —
		// the same change event the real dropdown fires.
		if (o.kind === "check") {
			const boxSel = `.frappe-control[data-fieldname="${o.field}"] input[type="checkbox"]`;
			const before = await page.evaluate((f) => window.cur_frm.doc[f], o.field);
			try {
				await page.locator(boxSel).first().click({ timeout: 5000 });
			} catch (e) {
				failures.push({ at: current, why: "unclickable: " + String(e).split("\n")[0] });
				continue;
			}
			if (!(await settled())) {
				failures.push({ at: current, why: "did not save (dirty after 20s)" });
				continue;
			}
			const after = await page.evaluate((f) => window.cur_frm.doc[f], o.field);
			if (Number(after) === Number(before)) {
				failures.push({ at: current, why: `checkbox did not flip: ${before} -> ${after}` });
			}
			continue;
		}
		if (o.kind === "select") {
			const selSel = `.frappe-control[data-fieldname="${o.field}"] select`;
			try {
				await page.selectOption(selSel, o.value, { timeout: 5000 });
			} catch (e) {
				failures.push({ at: current, why: "select failed: " + String(e).split("\n")[0] });
				continue;
			}
			if (!(await settled())) {
				failures.push({ at: current, why: "did not save (dirty after 20s)" });
				continue;
			}
			const landed = await page.evaluate((f) => window.cur_frm.doc[f], o.field);
			if (String(landed) !== String(o.value)) {
				failures.push({ at: current, why: `value did not land: doc holds ${JSON.stringify(landed)}` });
			}
			continue;
		}
		const sel =
			o.kind === "preset"
				? `.bnd-sbp-preset[data-preset="${o.preset}"]`
				: o.kind === "toggle"
					? `.bnd-sbp-toggle[data-field="${o.field}"], .bnd-cbp-toggle[data-field="${o.field}"], .bnd-ibp-toggle[data-field="${o.field}"], .bnd-stp-toggle[data-field="${o.field}"]`
					: o.kind === "implicit"
						? `${o.sel}[data-value="${o.value}"]`
						: `.bnd-cbp-opt[data-field="${o.field}"][data-value="${o.value}"], .bnd-dgm-slot[data-field="${o.field}"][data-value="${o.value}"], .bnd-sbp-opt[data-field="${o.field}"][data-value="${o.value}"], .bnd-sbp-stop[data-field="${o.field}"][data-value="${o.value}"]`;
		// Re-check NOW, not at enumeration: an earlier click in this pane can
		// legitimately disable this option (Crumb Pills greys the separators —
		// a blocker doing its job), and a toggle's data-value is the NEXT
		// state, which flips on every render. A user cannot click a disabled
		// control either; skipping is the honest verdict, and a disappearance
		// is still reported.
		const state = await page.evaluate((s2) => {
			const n = [...document.querySelectorAll(s2)].find((x) => x.offsetParent !== null);
			if (!n) return { at: "gone" };
			if (n.disabled || n.hasAttribute("disabled")) return { at: "disabled" };
			return { at: "clickable", value: n.getAttribute("data-value") };
		}, sel);
		if (state.at === "disabled") continue;
		if (state.at === "gone") {
			failures.push({ at: current, why: "option vanished from the pane mid-sweep" });
			continue;
		}
		const expected = o.kind === "toggle" ? state.value : o.value;
		const loc = page.locator(sel).first();
		try {
			await loc.click({ timeout: 5000 });
		} catch (e) {
			// A pointer click can starve without the control being broken: the
			// pickers re-render on every save, and a re-render mid-actionability
			// swaps the node and restarts Playwright's stability wheel — the
			// crumbs "Original" card timed out exactly this way while being
			// plainly clickable by hand. So the timeout is re-examined: if the
			// element is visible and nothing covers its centre, a DOM click is
			// dispatched — the handler is the same jQuery listener either way.
			// Only an element that is genuinely gone, hidden or covered is
			// reported.
			const verdict = await page.evaluate((s2) => {
				const n = [...document.querySelectorAll(s2)].find((x) => x.offsetParent !== null);
				if (!n) return "gone";
				n.scrollIntoView({ block: "center" });
				const r = n.getBoundingClientRect();
				const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				if (top && !n.contains(top)) return "covered by " + (String(top.className).slice(0, 60) || top.tagName);
				n.click();
				return "dom-clicked";
			}, sel);
			if (verdict !== "dom-clicked") {
				failures.push({ at: current, why: "unclickable (" + verdict + "): " + String(e).split("\n")[0] });
				continue;
			}
		}
		const saved = await settled();
		// A FAILED save surfaces Frappe's error dialog ON PURPOSE — the
		// autosave's contract is fail loudly, never silently. To the sweep
		// that dialog is two things at once: a finding to record against the
		// option that raised it, and a blocker that would swallow every later
		// click if left standing. So it is reported, dismissed, and the sweep
		// walks on — dying under it (the first behaviour) hid every option
		// after the failure.
		const dialog = await page.evaluate(() => {
			const m = document.querySelector(".modal.show");
			if (!m) return null;
			const title = ((m.querySelector(".modal-title") || {}).textContent || "").trim();
			const body = ((m.querySelector(".modal-body") || {}).textContent || "").trim().slice(0, 160);
			const close = m.querySelector('[data-dismiss="modal"], .btn-modal-close, .modal-header .close');
			if (close) close.click();
			return title + (body ? " — " + body : "");
		});
		if (dialog) {
			failures.push({ at: current, why: "save raised Frappe's error dialog: " + dialog });
			await page.keyboard.press("Escape").catch(() => {});
			await page.waitForTimeout(400);
			continue;
		}
		if (!saved) {
			failures.push({ at: current, why: "did not save (dirty after 20s)" });
			continue;
		}
		// A preset writes a whole catalogue row, so no single field names its
		// outcome; saved-and-clean is its contract here. Everything else names
		// one field and one expected value.
		if (o.kind === "preset") continue;
		const landed = await page.evaluate((f) => window.cur_frm.doc[f], o.field);
		if (String(landed) !== String(expected)) {
			failures.push({ at: current, why: `value did not land: doc holds ${JSON.stringify(landed)}, wanted ${JSON.stringify(expected)}` });
		}
	}
}

for (const e of seenErrors) failures.push({ at: e.at, why: "console error: " + e.text });

console.log("\n" + "-".repeat(60));
if (!failures.length) console.log("  SWEEP CLEAN — every option applied and saved, no console errors");
else {
	console.log(`  ${failures.length} failures:`);
	for (const f of failures) console.log(`    ${f.at}\n      ${f.why}`);
}
console.log("-".repeat(60));

const drift = restore();
if (Object.keys(drift).length) {
	console.log("  RESTORE INCOMPLETE — the site is NOT as the sweep found it:");
	for (const [f, d] of Object.entries(drift)) {
		console.log(`    ${f}: now ${JSON.stringify(d.now)}, snapshot held ${JSON.stringify(d.snapshot)}`);
	}
	console.log("  Repair: load Theme Settings, set each field back, doc.save() so on_update fires.");
} else {
	console.log("state restored — verified against the snapshot, row for row");
}
await b.close();
process.exit(failures.length || Object.keys(drift).length ? 1 : 0);
