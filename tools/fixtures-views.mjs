/**
 * Seed the demo site with the data item 27's four alternate views need to
 * render — and to be tested and axe-baselined against.
 *
 * WHY THIS FILE EXISTS
 *   The four views (kanban, calendar, gantt, gallery) are all GATED: a route
 *   renders empty chrome — or a create-board dialog — unless real records
 *   exist. The demo site ships with 0 Kanban Boards, 0 Tasks and 0 Events, so
 *   before item 27 there was nothing to probe, nothing to test, and an axe
 *   baseline would have been captured against blank pages (banking no honest
 *   count). A hand-seeded site is also unrecoverable: HANDOVER §5 records that
 *   `compose down` destroys the writable layer and that the mount has truncated
 *   `apps.txt` twice. So the fixtures are CODE, re-runnable at any time.
 *
 * THE SPINE IS ToDo
 *   ToDo is frappe core and ships `todo_calendar.js` with `gantt: true`, so one
 *   doctype gives a kanban board, a calendar AND a gantt. Its `color` field
 *   exercises both raw-hex escape hatches (the kanban card swatch and the
 *   gantt's injected <style>), which item 27's admin-colour carve-out
 *   (plan §4.4) must be tested against. `todo_calendar.js` maps start AND end
 *   to the one `date` field, so every ToDo gantt bar is a single day — a few
 *   Events (distinct starts_on/ends_on) are seeded alongside so the gantt has
 *   real spans to judge.
 *
 * IDEMPOTENT
 *   Every record has a deterministic identity — the board a fixed `name`, the
 *   ToDos and Events a marker in their text — and each run deletes its own
 *   prior output first, so re-running converges rather than piling up. The
 *   board name is PINNED because the kanban axe-route URL contains it; a
 *   generated name would break the baseline on the next reseed.
 *
 * ONE COUPLING, DELIBERATE AND EXPLAINED
 *   The 12 seeded Items land in the Item LIST too, so the axe baseline for
 *   `/desk/item` (the item-16 list route) rises — its upstream `label` rule
 *   (one unlabelled row checkbox per row) went 2 -> 14 when these were added.
 *   That is honest and safe: the axe honesty test treats the baseline as a
 *   CEILING (it fails on NEW rules or GROWN counts, never on a shrink), the
 *   count is deterministic (exactly 12 seeded, wiped-first), and the same
 *   coupling already exists for the report route's 98 Accounts. Re-baseline
 *   deliberately after changing the Item count here.
 *
 * USAGE
 *   node tools/fixtures-views.mjs           # seed (idempotent)
 *   node tools/fixtures-views.mjs --clear   # remove everything this tool made
 */

import { benchPy } from "./session.mjs";

// The pinned identities. The board name rides into the route URL, so it is a
// constant the axe baseline and the suite both hard-code.
const BOARD = "Bunood Memos";
const MARK = "[bnd-fixture]"; // in every seeded ToDo/Event description/subject
const CLEAR = process.argv.includes("--clear");

// ── The Python that does the work, run inside the backend container ─────────
// Written as a single program fed to benchPy: it has a real Frappe env (db,
// get_doc, commit) that a browser session cannot give. ignore_permissions and
// ignore_mandatory keep a re-run from tripping validation noise on core
// doctypes.
const PY = [
	"import frappe, json, datetime, base64",
	"",
	`BOARD = ${JSON.stringify(BOARD)}`,
	`MARK = ${JSON.stringify(MARK)}`,
	`CLEAR = ${CLEAR ? "True" : "False"}`,
	"",
	"# Western reference date so the calendar/gantt land on a populated month",
	"# regardless of when this runs. Fixed, not computed from today, so the",
	"# fixture is stable across reseeds (the suite navigates to this month).",
	"BASE = datetime.date(2026, 8, 1)",
	"",
	"def wipe():",
	'    for name in frappe.get_all("ToDo", filters={"description": ["like", "%" + MARK + "%"]}, pluck="name"):',
	'        frappe.delete_doc("ToDo", name, force=1, ignore_permissions=True)',
	'    for name in frappe.get_all("Event", filters={"subject": ["like", "%" + MARK + "%"]}, pluck="name"):',
	'        frappe.delete_doc("Event", name, force=1, ignore_permissions=True)',
	'    if frappe.db.exists("Kanban Board", BOARD):',
	'        frappe.delete_doc("Kanban Board", BOARD, force=1, ignore_permissions=True)',
	'    for name in frappe.get_all("Item", filters={"item_code": ["like", "BND-VIEW-%"]}, pluck="name"):',
	'        frappe.delete_doc("Item", name, force=1, ignore_permissions=True)',
	"    frappe.db.commit()",
	"",
	"wipe()",
	"if CLEAR:",
	'    print(json.dumps({"cleared": True}))',
	"    raise SystemExit",
	"",
	"# ── ToDo memos ──────────────────────────────────────────────────────────",
	"# status is Open/Closed/Cancelled — the kanban board keys on it. Priority is",
	"# High/Medium/Low. A few carry an explicit `color` (the admin-colour path).",
	"# The Open column gets many rows so it scrolls (the overflow behaviour that",
	"# only appears with volume — item 26's lesson).",
	'PRIORITIES = ["High", "Medium", "Low"]',
	'COLORS = {3: "#e8833f", 7: "#2a78d6", 11: "#1baf7a"}',
	"todos = []",
	'plan = [("Open", 14), ("Closed", 6), ("Cancelled", 4)]',
	"idx = 0",
	"for status, count in plan:",
	"    for i in range(count):",
	"        doc = frappe.get_doc({",
	'            "doctype": "ToDo",',
	'            "description": f"<div>{MARK} {status} memo {i+1}</div>",',
	'            "status": status,',
	'            "priority": PRIORITIES[idx % 3],',
	'            "date": (BASE + datetime.timedelta(days=(idx * 2) % 27)).isoformat(),',
	'            "color": COLORS.get(idx),',
	"        })",
	"        doc.insert(ignore_permissions=True, ignore_mandatory=True)",
	"        todos.append(doc.name)",
	"        idx += 1",
	"",
	"# ── The Kanban Board on ToDo, keyed on status ───────────────────────────",
	"# Columns carry an `indicator` (Frappe's --bg-{indicator} colour name) so the",
	"# band has real colour to retint. Column names match the status values, which",
	"# is how a card maps to a column.",
	"board = frappe.get_doc({",
	'    "doctype": "Kanban Board",',
	'    "kanban_board_name": BOARD,',
	'    "reference_doctype": "ToDo",',
	'    "field_name": "status",',
	'    "private": 0,',
	'    "show_labels": 1,',
	'    "columns": [',
	'        {"column_name": "Open", "status": "Active", "indicator": "Orange"},',
	'        {"column_name": "Closed", "status": "Active", "indicator": "Green"},',
	'        {"column_name": "Cancelled", "status": "Active", "indicator": "Gray"},',
	"    ],",
	"})",
	"board.insert(ignore_permissions=True, ignore_mandatory=True)",
	"",
	"# ── Events with real spans, for the Event calendar/gantt ─────────────────",
	"# event_calendar.js maps start=starts_on, end=ends_on (distinct), giving the",
	"# EVENT gantt/calendar multi-day bars and a '+N more' day that a single-day",
	"# ToDo cannot. NOTE: these live on /app/event/view/*, which the suite does",
	"# NOT open — the views: tests assert against the ToDo and Item routes. So",
	"# these are for MANUAL/visual verification of multi-day spans (the screenshots",
	"# in the plan), not an asserted fixture. One carries a color.",
	"def dt(day, hour=9):",
	"    return datetime.datetime.combine(BASE + datetime.timedelta(days=day), datetime.time(hour, 0)).isoformat(' ')",
	"",
	"events = [",
	'    {"subject": f"{MARK} Kickoff", "starts_on": dt(2), "ends_on": dt(6, 17), "color": "#4463f0"},',
	'    {"subject": f"{MARK} Build phase", "starts_on": dt(6), "ends_on": dt(15, 17)},',
	'    {"subject": f"{MARK} Review", "starts_on": dt(15), "ends_on": dt(18, 17)},',
	'    {"subject": f"{MARK} Ship", "starts_on": dt(18), "ends_on": dt(21, 17)},',
	'    {"subject": f"{MARK} Standup", "starts_on": dt(10, 9), "ends_on": dt(10, 10)},',
	'    {"subject": f"{MARK} Demo", "starts_on": dt(10, 11), "ends_on": dt(10, 12)},',
	'    {"subject": f"{MARK} Retro", "starts_on": dt(10, 14), "ends_on": dt(10, 15)},',
	'    {"subject": f"{MARK} All-day offsite", "starts_on": dt(12), "ends_on": dt(12), "all_day": 1},',
	"]",
	"ev_names = []",
	"for e in events:",
	'    doc = frappe.get_doc({"doctype": "Event", "event_type": "Public", **e})',
	"    doc.insert(ignore_permissions=True, ignore_mandatory=True)",
	"    ev_names.append(doc.name)",
	"",
	"# ── Items with images, for the gallery ──────────────────────────────────",
	"# The image view needs meta.image_field (Item.image) populated. A tiny inline",
	"# SVG data URI is a real, self-contained image — no upload, no external asset,",
	"# deterministic. One item is left imageless to hit the .no-image branch.",
	"def svg_uri(label, hue):",
	'    svg = (',
	'        f\'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="175">\'',
	'        f\'<rect width="200" height="175" fill="hsl({hue},45%,72%)"/>\'',
	'        f\'<text x="100" y="95" font-size="20" text-anchor="middle" fill="#222">{label}</text></svg>\'',
	"    )",
	'    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()',
	"",
	'item_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"',
	'uom = frappe.db.get_value("UOM", {}, "name") or "Nos"',
	"item_names = []",
	"for i in range(12):",
	'    code = f"BND-VIEW-{i+1:02d}"',
	"    doc = frappe.get_doc({",
	'        "doctype": "Item",',
	'        "item_code": code,',
	'        "item_name": f"Gallery sample {i+1}",',
	'        "item_group": item_group,',
	'        "stock_uom": uom,',
	'        "is_stock_item": 0,',
	'        "image": None if i == 11 else svg_uri(str(i + 1), (i * 30) % 360),',
	"    })",
	"    doc.insert(ignore_permissions=True, ignore_mandatory=True)",
	"    item_names.append(code)",
	"",
	"frappe.db.commit()",
	"print(json.dumps({",
	'    "board": BOARD,',
	'    "todos": len(todos),',
	'    "events": len(ev_names),',
	'    "items": len(item_names),',
	'    "imageless": item_names[-1],',
	"}))",
	"",
].join("\n");

const out = benchPy(PY).trim().split(/\r?\n/).pop();
const res = JSON.parse(out);
if (CLEAR) {
	console.log("fixtures-views: cleared all seeded records");
} else {
	console.log(
		`fixtures-views: board "${res.board}" · ${res.todos} ToDos · ` +
			`${res.events} Events · ${res.items} Items (${res.imageless} imageless)`
	);
	console.log("routes:");
	console.log(`  /app/todo/view/kanban/${encodeURIComponent(res.board)}`);
	console.log("  /app/todo/view/calendar");
	console.log("  /app/todo/view/gantt");
	console.log("  /app/item/view/image");
}
