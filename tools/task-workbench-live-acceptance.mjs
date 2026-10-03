import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { benchJson, benchPy, openDesk } from "./session.mjs";

const CASES = [
	["Quotation", "offer"],
	["Sales Order", "sales-order"],
	["Purchase Order", "purchase-order"],
	["Purchase Receipt", "receipt"],
	["Material Request", "request"],
	["Stock Reconciliation", "count"],
	["Payment Entry", "payment"],
	["Journal Entry", "journal"],
	["Expense Claim", "claim"],
];
const fail = message => { throw new Error(message); };
const artifactDir = new URL("../artifacts/", import.meta.url);
await mkdir(fileURLToPath(artifactDir), { recursive: true });
const language = process.env.BND_TASK_LANGUAGE || "";
const user = "Administrator";
const originalLanguage = language ? benchJson(
	`print(json.dumps({"language": frappe.db.get_value("User", ${JSON.stringify(user)}, "language") or ""}))\n`
).language : "";
function setLanguage(value) {
	benchPy(
		`frappe.db.set_value("User", ${JSON.stringify(user)}, "language", ${JSON.stringify(value)})\n` +
		"frappe.db.commit()\n" +
		`frappe.cache.hdel("bootinfo", ${JSON.stringify(user)})\n` +
		`frappe.clear_cache(user=${JSON.stringify(user)})\n` +
		"print('ok')\n"
	);
}
if (language) setLanguage(language);

const { page, errors, close } = await openDesk({ width: 1440, height: 900 });
try {
	await page.goto(`${process.env.BND_URL || "http://127.0.0.1:8088"}/desk`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => window.frappe?.model && window.frappe?.set_route, null, { timeout: 60000 });
	for (const [doctype, variant] of CASES) {
		await page.evaluate(async dt => {
			if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0;
			await frappe.model.with_doctype(dt);
			const doc = frappe.model.get_new_doc(dt);
			frappe.set_route("Form", dt, doc.name);
		}, doctype);
		await page.waitForFunction(dt => window.cur_frm?.doctype === dt, doctype, { timeout: 60000 });
		await page.locator(`.bnd-task-${variant}:visible`).waitFor({ timeout: 60000 });
		const desktop = await page.evaluate(({ doctype, variant }) => {
			const frm = window.cur_frm, shell = frm.$wrapper[0];
			const root = shell.querySelector(`.bnd-task-${variant}:not([hidden])`);
			const layout = shell.querySelector(".form-layout");
			const wrappers = Object.fromEntries(Object.entries(frm.fields_dict)
				.map(([name, field]) => [name, field?.$wrapper?.[0]]).filter(([, node]) => node));
			const profile = window.bunood_theme.simple_forms.profiles[doctype] || [];
			const nativeInTask = profile.map(name => wrappers[name]).filter(node => node && root.contains(node));
			const before = JSON.stringify(frm.doc);
			const buttons = shell.querySelectorAll(".bnd-simple-switch button");
			buttons[1]?.click();
			const advanced = layout?.getClientRects().length > 0 && nativeInTask.every(node => layout.contains(node));
			buttons[0]?.click();
			const missingAfterReturn = Object.entries(wrappers)
				.filter(([, node]) => nativeInTask.includes(node) && !root.contains(node)).map(([name]) => name);
			const restoredSimple = root.getClientRects().length > 0 && !missingAfterReturn.length;
			return {
				doctype, variant, panels: root.querySelectorAll(".bnd-task-panel").length,
				stages: root.querySelectorAll(".bnd-task-stages li").length,
				nativeControls: nativeInTask.length, advanced, restoredSimple,
				docStable: JSON.stringify(frm.doc) === before, missingAfterReturn,
				layoutHidden: layout?.getClientRects().length === 0,
				rootWidth: Math.round(root.getBoundingClientRect().width),
				direction: document.documentElement.dir || getComputedStyle(document.body).direction,
				localized: /[\u0600-\u06ff]/.test(root.textContent),
				text: root.textContent.replace(/\s+/g, " ").trim().slice(0, 240),
			};
		}, { doctype, variant });
		if (desktop.panels < 2 || desktop.stages !== 3 || desktop.nativeControls < 1)
			fail(`${doctype}: incomplete task surface ${JSON.stringify(desktop)}`);
		for (const key of ["advanced", "restoredSimple", "docStable", "layoutHidden"])
			if (!desktop[key]) fail(`${doctype}: ${key} failed ${JSON.stringify(desktop)}`);
		if (language === "ar" && (desktop.direction !== "rtl" || !desktop.localized))
			fail(`${doctype}: Arabic direction or translation failed ${JSON.stringify(desktop)}`);

		await page.setViewportSize({ width: 430, height: 900 });
		const mobile = await page.evaluate(variant => {
			const root = document.querySelector(`.bnd-task-${variant}:not([hidden])`);
			const rect = root.getBoundingClientRect();
			return {
				left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width),
				overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
				columns: getComputedStyle(root.querySelector(".bnd-task-canvas")).gridTemplateColumns,
			};
		}, variant);
		if (mobile.overflow > 1 || mobile.width > 430 || mobile.columns.split(" ").length !== 1)
			fail(`${doctype}: narrow layout failed ${JSON.stringify(mobile)}`);
		if (["Quotation", "Payment Entry"].includes(doctype)) {
			await page.screenshot({ path: fileURLToPath(new URL(`task-${variant}-mobile.png`, artifactDir)), fullPage: true });
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		if (["Quotation", "Payment Entry"].includes(doctype)) {
			await page.screenshot({ path: fileURLToPath(new URL(`task-${variant}-desktop.png`, artifactDir)), fullPage: true });
		}
		console.log(JSON.stringify({ desktop, mobile }));
	}
	if (errors.length) fail(`browser errors: ${errors.join(" | ")}`);
} finally {
	await page.evaluate(() => { if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0; }).catch(() => {});
	await close();
	if (language) setLanguage(originalLanguage);
}
