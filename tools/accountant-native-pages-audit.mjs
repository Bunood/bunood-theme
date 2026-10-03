/** Read-only navigation inventory of accountant-facing native Desk lists. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const doctypes = [
	"Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry",
	"GL Entry", "Bank Transaction", "Bank Account", "Account",
	"Accounting Period", "Period Closing Voucher", "POS Invoice",
];
const output = join("artifacts", "accountant-native-pages");
mkdirSync(output, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
try {
	await goto(session.page, "/desk/List/Sales%20Invoice", ".page-container", { settle: 600 });
	for (const doctype of doctypes) {
		await session.page.evaluate((name) => frappe.set_route("List", name), doctype);
		await session.page.waitForFunction((name) => (frappe.get_route?.() || []).includes(name),
			doctype, { timeout: 8000 }).catch(() => {});
		await session.page.waitForTimeout(1000);
		const state = await session.page.evaluate(() => ({
			route: frappe.get_route?.().slice(0, 2),
			title: [...document.querySelectorAll(".page-container")]
				.find((node) => node.offsetParent !== null)
				?.querySelector(".page-head .title-text, .page-head h1")?.textContent?.trim() || "",
			rows: [...document.querySelectorAll(".page-container")]
				.find((node) => node.offsetParent !== null)?.querySelectorAll(".list-row-container").length || 0,
			primaryActions: [...document.querySelectorAll(".page-container")]
				.find((node) => node.offsetParent !== null)?.querySelectorAll(".page-head .primary-action").length || 0,
			bodyPresent: Boolean([...document.querySelectorAll(".page-container")]
				.find((node) => node.offsetParent !== null)?.querySelector(".layout-main-section, .list-view-container")),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		await session.page.screenshot({ path: join(output, `${doctype.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: false });
		console.log(JSON.stringify(state));
	}
	if (session.errors.length) console.log(`Browser warnings: ${session.errors.join(" | ")}`);
} finally {
	await session.close();
}
