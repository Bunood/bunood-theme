// Item 43 slice A0 — the desk body census probe.
//
// Measures, on the live desk, every number `docs/upstream/frappe-form-body.md` quotes:
// the 900px cap and what reads it, the type scale the body actually renders at, the
// control box, the grid, the sidebar image rule, the page head, the scroller, where the
// footer sits, list header vs cell alignment, the primary button's bindings, and — for
// the doctypes that matter — which fields are `in_list_view` (the band's tiles) and
// whether a workflow exists (the stage path's states).
//
// usage: BND_URL=http://127.0.0.1:8080 node tools/probe-body.mjs
// It writes nothing. It ensures the suite's Item fixture (idempotently, the suite's own
// recipe) and reads. Prints one JSON document.
import { openDesk, goto, benchPy } from "./session.mjs";

const DOCTYPES = [
	"Sales Invoice", "Sales Order", "Purchase Order", "Purchase Invoice", "Quotation", "Delivery Note",
	"Payment Entry", "Journal Entry", "Customer", "Supplier", "Item", "Employee", "Lead", "HD Ticket", "CRM Deal",
];

benchPy(
	'if not frappe.db.exists("Item", "BND-TEST-001"):\n' +
		'    doc = frappe.new_doc("Item")\n' +
		'    doc.item_code = "BND-TEST-001"\n' +
		'    doc.item_group = frappe.get_all("Item Group", limit=1)[0]["name"]\n' +
		'    doc.stock_uom = "Nos"\n' +
		"    doc.insert()\n" +
		"frappe.db.commit()\n" +
		'print("ok")\n'
);

const { page, close, errors } = await openDesk();
const out = { url: process.env.BND_URL || "http://localhost:8080", measured: new Date().toISOString() };

// The generic reads every page shares.
const framePage = () => page.evaluate(() => {
	const cs = (el, props) => { if (!el) return null; const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c.getPropertyValue(p); return o; };
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
	const html = document.documentElement, hcs = getComputedStyle(html);
	const q = (s) => document.querySelector(s);
	return {
		vars: {
			pageMaxWidth: hcs.getPropertyValue("--page-max-width").trim(),
			pageHeadHeight: hcs.getPropertyValue("--page-head-height").trim(),
			navbarHeight: hcs.getPropertyValue("--navbar-height").trim(),
			formSidebarWidth: hcs.getPropertyValue("--form-sidebar-width").trim(),
			bndRowH: hcs.getPropertyValue("--bnd-row-h").trim(),
			bndContentW: hcs.getPropertyValue("--bnd-content-w").trim(),
		},
		bodyFullWidth: document.body.classList.contains("full-width"),
		bndAttrs: Object.fromEntries([...html.attributes].filter((a) => a.name.startsWith("data-bnd")).map((a) => [a.name, a.value])),
		pageHead: { rect: rect(q(".page-head")), ...cs(q(".page-head"), ["position", "top", "z-index"]), content: rect(q(".page-head-content")) },
		mainSection: cs(q(".main-section"), ["overflow-y", "overflow-x", "height"]),
		layoutMainSection: { ...cs(q(".layout-main-section"), ["overflow", "overflow-y"]), rect: rect(q(".layout-main-section")) },
		wrapper: rect(q(".layout-main-section-wrapper")),
		sideSection: rect(q(".layout-side-section")),
		actions: {
			primary: (() => {
				const b = q(".page-actions .primary-action"); if (!b) return null;
				const ev = window.jQuery && window.jQuery._data(b, "events");
				return { label: b.getAttribute("data-label"), text: b.textContent.trim(), hidden: b.classList.contains("hide"), events: ev ? Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.length])) : null };
			})(),
			indicatorPill: (() => { const p = q(".page-head .indicator-pill"); return p ? { text: p.textContent.trim(), cls: p.className } : null; })(),
		},
	};
});

const formPage = () => page.evaluate(() => {
	const cs = (el, props) => { if (!el) return null; const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c.getPropertyValue(p); return o; };
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
	const q = (s) => document.querySelector(s);
	const visible = (el) => el && el.getBoundingClientRect().width > 0;
	const section = [...document.querySelectorAll(".form-layout .form-section")].find((s) => visible(s) && s.querySelector(".section-body"));
	const body = section && section.querySelector(".section-body");
	// The first section is often headless; the type scale wants ANY visible head.
	const head = [...document.querySelectorAll(".form-layout .section-head")].find(visible);
	// Ancestry, because "is the footer the layout's sibling" decides whether Beside ships.
	const chain = (el, stop) => { const out = []; for (let n = el; n && n !== document.body; n = n.parentElement) { out.push(n.tagName.toLowerCase() + (n.className ? "." + String(n.className).trim().replace(/\s+/g, ".") : "")); if (n.matches(stop)) break; } return out; };
	const label = [...document.querySelectorAll(".control-label")].find(visible);
	const input = [...document.querySelectorAll('.frappe-control[data-fieldtype="Data"] input.form-control, .frappe-control[data-fieldtype="Link"] input.form-control')].find(visible);
	const layout = q(".form-layout"), footer = q(".form-footer");
	const grid = [...document.querySelectorAll(".form-grid")].find(visible) || q(".form-grid");
	const gh = grid && grid.querySelector(".grid-heading-row");
	const ghCol = gh && gh.querySelector(".grid-static-col");
	const row = grid && grid.querySelector(".grid-body .grid-row");
	const rowCol = row && row.querySelector(".grid-static-col");
	const sb = q(".form-sidebar");
	const img = q(".sidebar-image-section .sidebar-image, .sidebar-image-section .sidebar-standard-image");
	const frm = window.cur_frm;
	return {
		widths: {
			section: rect(section), sectionStyle: cs(section, ["background-color", "border-top-width", "border-radius", "box-shadow", "padding-left", "padding-right"]),
			sectionBody: rect(body), sectionBodyStyle: cs(body, ["max-width", "margin-left", "margin-right"]),
			formLayout: rect(layout), formFooter: rect(footer), formFooterStyle: cs(footer, ["max-width", "margin-left", "padding-left"]),
			formPage: rect(q(".form-page")), tabsList: rect(q(".form-tabs-list")),
		},
		type: {
			sectionHead: cs(head, ["font-size", "font-weight", "color", "padding-left"]),
			label: cs(label, ["font-size", "font-weight", "color", "margin-bottom"]),
			input: cs(input, ["font-size", "background-color", "border-top-width", "border-top-color", "border-radius", "height", "padding-left"]),
			inputParentBg: input && cs(input.closest(".form-section") || document.body, ["background-color"]),
			helpBox: cs(q(".help-box"), ["font-size", "color"]),
			tab: cs(q(".form-tabs .nav-link.active"), ["font-size", "font-weight", "color", "border-bottom-width"]),
			title: cs(q(".page-title .title-text"), ["font-size", "font-weight"]),
		},
		footer: footer ? {
			chain: chain(footer, ".layout-main-section"), layoutChain: layout ? chain(layout, ".layout-main-section") : null,
			sameParentAsLayout: !!layout && footer.parentElement === layout.parentElement,
			timeline: !!footer.querySelector(".new-timeline"), commentBox: !!footer.querySelector(".comment-box"),
			timelineItems: footer.querySelectorAll(".timeline-item").length,
		} : null,
		sidebar: sb ? {
			rect: rect(sb), style: cs(sb, ["background-color", "border-left-width", "padding-left"]),
			sections: [...sb.querySelectorAll(".sidebar-section")].map((s) => s.className.replace(/\s+/g, " ").trim()),
			image: img ? { tag: img.tagName, cls: img.className, ...cs(img, ["width", "height", "border-radius"]) } : null,
		} : null,
		grid: grid ? {
			rect: rect(grid), style: cs(grid, ["border-top-width", "border-radius", "background-color"]),
			heading: { rect: rect(gh), ...cs(gh, ["height", "background-color", "color", "font-size", "border-bottom-width"]) },
			headingCol: cs(ghCol, ["border-right-width", "border-right-color", "padding-left", "background-color"]),
			row: { rect: rect(row), ...cs(row, ["height", "background-color"]) },
			rowCol: cs(rowCol, ["border-right-width", "border-right-color", "border-bottom-width", "padding-left"]),
			footer: !!grid.querySelector(".grid-footer"), addRow: (grid.querySelector(".grid-add-row") || {}).textContent,
			numericCells: [...grid.querySelectorAll('.grid-body .grid-static-col[data-fieldtype="Currency"], .grid-body .grid-static-col[data-fieldtype="Float"], .grid-body .grid-static-col[data-fieldtype="Int"]')].slice(0, 3).map((c) => ({ ft: c.getAttribute("data-fieldtype"), align: getComputedStyle(c.querySelector(".static-area") || c).textAlign })),
		} : null,
		doc: frm ? { doctype: frm.doctype, docstatus: frm.doc.docstatus, submittable: !!frm.meta.is_submittable, titleField: frm.meta.title_field || null, workflow: !!(window.frappe.workflow && window.frappe.workflow.workflows && window.frappe.workflow.workflows[frm.doctype]) } : null,
	};
});

// ── 1 · a master with tabs and a child grid ─────────────────────────────────
await goto(page, "/desk/item/BND-TEST-001", ".form-tabs-list", { settle: 3500 });
out.item = { ...(await framePage()), ...(await formPage()) };
// The grid lives on another tab: open it and measure the grid there.
out.itemGrid = await page.evaluate(async () => {
	const tab = [...document.querySelectorAll(".form-tabs .nav-link")].find((a) => /uom|unit/i.test(a.textContent));
	if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 600)); }
	const grid = [...document.querySelectorAll(".form-grid")].find((g) => g.getBoundingClientRect().width > 0);
	if (!grid) return { found: false };
	const cs = (el, props) => { const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c.getPropertyValue(p); return o; };
	const gh = grid.querySelector(".grid-heading-row"), row = grid.querySelector(".grid-body .grid-row");
	return { found: true, tab: tab && tab.textContent.trim(), heading: gh && cs(gh, ["height", "background-color", "color", "font-size"]), headingCol: gh && cs(gh.querySelector(".grid-static-col"), ["border-right-width", "border-right-color", "background-color"]), row: row && cs(row, ["height"]), rowCol: row && cs(row.querySelector(".grid-static-col"), ["border-right-width", "border-bottom-width"]), rows: grid.querySelectorAll(".grid-body .grid-row").length };
});

// ── 2 · a transaction with lines (the mock's case) ──────────────────────────
await goto(page, "/desk/sales-invoice/new", ".form-layout", { settle: 3500 });
out.sinvDialog = await page.evaluate(() => {
	const m = document.querySelector(".modal.show"); const t = m && (m.querySelector(".modal-title") || m).textContent.trim().slice(0, 80);
	document.querySelectorAll(".modal.show .btn-modal-close, .modal.show [data-dismiss=modal]").forEach((b) => b.click());
	return t || null;
});
await page.waitForTimeout(600);
out.sinv = { ...(await framePage()), ...(await formPage()) };

// ── 3 · a list: header vs cell alignment ────────────────────────────────────
await goto(page, "/desk/item", ".list-row-head", { settle: 3500 });
out.list = await page.evaluate(() => {
	const cs = (el, props) => { if (!el) return null; const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c.getPropertyValue(p); return o; };
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };
	const head = document.querySelector(".list-row-head");
	const containers = [...document.querySelectorAll(".list-row-container")];
	const body = containers[1] && containers[1].querySelector(".list-row");
	const cols = (r) => r ? [...r.querySelectorAll(".level-left .list-row-col")].map((c) => ({ align: getComputedStyle(c).textAlign, ...rect(c), cls: c.className.replace("list-row-col ", "").slice(0, 40) })) : null;
	return {
		head: { rect: rect(head), ...cs(head, ["background-color", "font-size", "font-weight", "height"]), cols: cols(head) },
		row: { rect: rect(body), ...cs(body, ["height", "font-size"]), cols: cols(body) },
		right: rect(containers[1] && containers[1].querySelector(".level-right")),
		indicator: (() => { const i = containers[1] && containers[1].querySelector(".indicator-pill"); return i ? { cls: i.className, text: i.textContent.trim() } : null; })(),
		count: document.querySelectorAll(".list-row-container").length - 1,
		attrs: Object.fromEntries([...document.documentElement.attributes].filter((a) => a.name.startsWith("data-bnd-list")).map((a) => [a.name, a.value])),
	};
});

// ── 4 · a workspace: the column and the tiles ───────────────────────────────
await goto(page, "/desk/selling", ".layout-main", { settle: 3500 });
out.workspace = await page.evaluate(() => {
	const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; };
	const cs = (el, props) => { if (!el) return null; const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c.getPropertyValue(p); return o; };
	const lm = document.querySelector(".layout-main");
	return { layoutMain: { ...rect(lm), ...cs(lm, ["max-width", "margin-left"]) }, layoutMainSection: rect(document.querySelector(".layout-main-section")), editor: rect(document.querySelector(".codex-editor")), numberCards: document.querySelectorAll(".number-widget-box").length, cardGap: (() => { const c = [...document.querySelectorAll(".number-widget-box")]; return c.length > 1 ? Math.round(c[1].getBoundingClientRect().x - c[0].getBoundingClientRect().right) : null; })() };
});

// ── 5 · the tiles and the states, per doctype ───────────────────────────────
out.doctypes = await page.evaluate(async (list) => {
	const rows = {};
	for (const dt of list) {
		try {
			await new Promise((res, rej) => window.frappe.model.with_doctype(dt, (r) => (r === undefined || r === null || r === true || typeof r === "object") ? res() : res(), true));
			const m = window.frappe.get_meta(dt);
			if (!m) { rows[dt] = { absent: true }; continue; }
			const inList = m.fields.filter((f) => f.in_list_view).map((f) => `${f.fieldname}:${f.fieldtype}`);
			const wf = window.frappe.workflow && window.frappe.workflow.workflows && window.frappe.workflow.workflows[dt];
			const status = m.fields.find((f) => f.fieldname === "status");
			rows[dt] = { title: m.title_field || null, submittable: !!m.is_submittable, inListView: inList, statusOptions: status ? String(status.options || "").split("\n").filter(Boolean).length : 0, workflow: wf ? (wf.states || []).map((s) => s.state) : null };
		} catch (e) { rows[dt] = { absent: true, error: String(e).slice(0, 80) }; }
	}
	return rows;
}, DOCTYPES);

out.errors = errors;
await close();
console.log(JSON.stringify(out, null, 1));
