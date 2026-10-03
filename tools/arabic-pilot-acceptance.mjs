/** Pilot-only, read-only Arabic navigation and Trial Balance acceptance. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { benchJson, goto, openDesk } from "./session.mjs";

const out = join("artifacts", "arabic-audit");
mkdirSync(out, { recursive: true });
const accountBefore = benchJson(
	'print(json.dumps(frappe.db.get_value("Account", "1410 - Stock In Hand - BDEV", ["name", "account_name"], as_dict=True), ensure_ascii=False))'
);
const { page, errors, close } = await openDesk();
try {
	await goto(page, "/desk/desktop", ".desktop-wrapper", { settle: 1500 });
	const desktop = await page.evaluate(() => ({
		language: frappe.boot?.lang,
		untranslatedSidebar: ["PAGES", "Setup Wizard"].filter(label =>
			document.body.innerText.split(/\n/).some(line => line.trim() === label)),
		sidebarNodes: [...document.querySelectorAll("*")].filter(node =>
			node.textContent.trim().toUpperCase() === "PAGES" && node.getClientRects().length)
			.map(node => node.outerHTML.slice(0, 600)).slice(-5),
		labels: [...document.querySelectorAll(".desktop-wrapper .desktop-icon .icon-title, .desktop-wrapper .desktop-icon .icon-caption")]
			.map(node => node.textContent.trim()).filter(Boolean),
	}));
	if (desktop.language !== "ar") throw new Error(`Expected Arabic pilot, got ${desktop.language}`);
	if (desktop.untranslatedSidebar.length) throw new Error(`Untranslated sidebar: ${JSON.stringify(desktop.sidebarNodes)}`);
	if (desktop.labels.some(label => ["HR Setup", "Helpdesk", "Frappe CRM", "Recruitment"].includes(label))) {
		throw new Error(`Untranslated All Apps tile: ${JSON.stringify(desktop.labels)}`);
	}
	await page.screenshot({ path: join(out, "all-apps-ar.png"), fullPage: true });

	await goto(page, "/desk/query-report/Trial%20Balance", "[id='page-query-report']", { settle: 1200 });
	await page.waitForFunction(() => frappe.query_report?.report_name === "Trial Balance" &&
		Array.isArray(frappe.query_report?.data) &&
		document.querySelector(".dt-scrollable .dt-row[data-row-index]"), null, { timeout: 120000 });
	await page.waitForTimeout(600);
	const trial = await page.evaluate(() => {
		const report = frappe.query_report;
		const root = report.page.wrapper.get(0);
		const table = root.querySelector(".datatable");
		const accountColumn = report.datatable.datamanager.columns.findIndex(col => col.fieldname === "account");
		const rows = [...table.querySelectorAll(`.dt-scrollable .dt-cell--col-${accountColumn} .dt-cell__content`)];
		return {
			accountColumn,
			visibleAccounts: rows.map(cell => cell.textContent.trim()).filter(Boolean).slice(0, 20),
			storedFirst: report.data.find(row => row.account)?.account,
			storedLiabilities: report.data.find(row => String(row.account || "").includes("Source of Funds")),
			accountLink: rows.find(cell => cell.querySelector("a"))?.querySelector("a")?.getAttribute("onclick") || "",
			headers: [...table.querySelectorAll(".dt-header .dt-cell__content")].map(cell => cell.textContent.trim()),
			wrappedNativeRefresh: typeof report.refresh?._bnd_native === "function",
		};
	});
	if (trial.accountColumn < 0) throw new Error(`No native account column: ${JSON.stringify(trial)}`);
	if (!trial.visibleAccounts.some(label => /[\u0600-\u06ff]/u.test(label))) {
		throw new Error(`Account cells not Arabic: ${JSON.stringify(trial)}`);
	}
	if (!trial.visibleAccounts.includes("1410 - المخزون في المستودعات") ||
		!trial.visibleAccounts.includes("2000 - مصادر الأموال (الالتزامات)")) {
		throw new Error(`Accounting terminology is wrong: ${JSON.stringify(trial.visibleAccounts)}`);
	}
	if (!trial.headers.includes("الرصيد الافتتاحي (مدين)") ||
		!trial.headers.includes("الرصيد الافتتاحي (دائن)")) {
		throw new Error(`Trial Balance headers: ${JSON.stringify(trial.headers)}`);
	}
	if (!trial.accountLink || !trial.wrappedNativeRefresh) throw new Error("Native report navigation changed");
	await page.screenshot({ path: join(out, "trial-balance-ar.png"), fullPage: true });
	if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify({ desktop, trial }, null, 2));
} finally {
	await close();
}
const accountAfter = benchJson(
	'print(json.dumps(frappe.db.get_value("Account", "1410 - Stock In Hand - BDEV", ["name", "account_name"], as_dict=True), ensure_ascii=False))'
);
if (JSON.stringify(accountAfter) !== JSON.stringify(accountBefore)) {
	throw new Error("The stored Account changed during a display-only acceptance run");
}
console.log("PASS: Arabic All Apps and Trial Balance display; stored Account unchanged");

const english = await openDesk({ user: "admin@example.com" });
try {
	await goto(english.page, "/desk/query-report/Trial%20Balance", "[id='page-query-report']", { settle: 1200 });
	await english.page.waitForFunction(() => frappe.query_report?.report_name === "Trial Balance" &&
		document.querySelector(".dt-scrollable .dt-row[data-row-index]"), null, { timeout: 120000 });
	const result = await english.page.evaluate(() => ({
		language: frappe.boot?.lang,
		labels: [...document.querySelectorAll(".dt-scrollable .dt-cell--col-1 .dt-cell__content")]
			.map(node => node.textContent.trim()),
	}));
	if (!result.language?.startsWith("en") || !result.labels.some(label => label.includes("Stock In Hand"))) {
		throw new Error(`English report changed: ${JSON.stringify(result)}`);
	}
	if (english.errors.length) throw new Error(`English browser errors: ${english.errors.join(" | ")}`);
	console.log("PASS: English Trial Balance retains canonical labels");
} finally {
	await english.close();
}
