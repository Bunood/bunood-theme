/** The Reports workspace must offer real, permission-filtered report links. */
import assert from "node:assert/strict";
import { goto, openDesk } from "./session.mjs";

const expectedReports = [
	"General Ledger", "Trial Balance", "Balance Sheet",
	"Profit and Loss Statement", "Accounts Receivable", "Accounts Payable",
	"Sales Register", "Purchase Register", "Gross Profit",
];

for (const user of ["Administrator", "demo.office@bunood.test"]) {
	const session = await openDesk({ user, width: 1440, height: 900 });
	const { page, context } = session;
	try {
		await goto(page, "/desk/reports", ".body-sidebar", { settle: 450 });
		const navigation = await page.evaluate(() => ({
			groups: [...document.querySelectorAll(".body-sidebar .section-item > .standard-sidebar-item")]
				.map((item) => item.textContent.trim()),
			reports: [...document.querySelectorAll('.body-sidebar a[href*="/desk/query-report/"]')]
				.map((link) => decodeURIComponent(link.getAttribute("href").split("/").pop())),
			studio: [...document.querySelectorAll('.body-sidebar a[href*="bnd-report-studio"]')]
				.map((link) => link.getAttribute("href")),
			visible: [...document.querySelectorAll(".body-sidebar a")]
				.filter((link) => link.getClientRects().length).length,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		assert.deepEqual(navigation.reports, expectedReports, `${user}: report links missing or out of order`);
		assert.equal(navigation.groups.length, 3, `${user}: report categories are missing`);
		assert(navigation.studio.includes("/desk/bnd-report-studio/vat-return"), `${user}: VAT has no destination`);
		assert(navigation.studio.includes("/desk/bnd-report-studio/account-statement"), `${user}: statement has no destination`);
		assert(navigation.visible >= 13, `${user}: sidebar is still sparse`);
		assert(navigation.overflow <= 1, `${user}: horizontal overflow`);

		await page.locator('.body-sidebar a[href="/desk/query-report/General Ledger"]').click();
		await page.waitForFunction(() => frappe.get_route()[0] === "query-report" &&
			frappe.get_route()[1] === "General Ledger");
		await goto(page, "/desk/reports", ".body-sidebar", { settle: 200 });
		const newTab = context.waitForEvent("page");
		await page.locator('.body-sidebar a[href="/desk/bnd-report-studio/vat-return"]').click();
		const vatPage = await newTab;
		await vatPage.waitForURL(/\/desk\/bnd-report-studio\/vat-return$/);
		await vatPage.waitForSelector(".bnd-studio-sidebar-index");
		await vatPage.close();
		assert.deepEqual(session.errors, [], `${user}: browser errors`);
		console.log(JSON.stringify({ user, groups: navigation.groups, reports: navigation.reports.length }));
	} finally {
		await session.close();
	}
}
