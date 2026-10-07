import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const source = fileURLToPath(new URL("../bunood_theme/public/js/report_landing.js", import.meta.url));

async function landing(browser, boot) {
	const page = await browser.newPage();
	await page.setContent('<div class="page-container"><div class="layout-main-section"><div class="editor-js-container"><div id="editorjs"></div></div></div></div>');
	await page.evaluate((assets) => {
		window.__ = (text) => text;
		window.frappe = {
			boot: assets,
			get_route: () => ["Workspaces", "Reports"],
			router: { on() {} },
			utils: { icon: () => "<svg></svg>" },
			set_route: (...route) => { window.chosenReportRoute = route; },
		};
	}, boot);
	await page.addScriptTag({ path: source });
	await page.waitForSelector(".bnd-report-landing__card");
	return page;
}

test("optional report workbenches follow capability availability without changing card anatomy", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const all = await landing(browser, {
			bnd_finance_close_js: "/assets/close.js",
			bnd_journal_workbench_js: "/assets/journal.js",
			bnd_banking_js: "/assets/banking.js",
		});
		assert.equal(await all.locator(".bnd-report-landing__card").count(), 6);
		assert.equal(await all.locator(".bnd-report-landing__card .bnd-report-landing__description").count(), 6);
		await all.close();

		const partial = await landing(browser, { bnd_journal_workbench_js: "/assets/journal.js" });
		const labels = await partial.locator(".bnd-report-landing__name").allTextContents();
		assert.deepEqual(labels, ["Journal workbench", "Report Studio", "VAT Return", "Statement of Account"]);
		await partial.locator(".bnd-report-landing__search").fill("Bank");
		assert.equal(await partial.locator(".bnd-report-landing__card:visible").count(), 0);
		assert.equal(await partial.locator(".bnd-report-landing__empty").isVisible(), true);
		await partial.close();

		const restricted = await landing(browser, {
			bnd_finance_close_js: "/assets/close.js",
			bnd_journal_workbench_js: "/assets/journal.js",
			bnd_banking_js: "/assets/banking.js",
			bnd_report_landing_permitted_pages: ["bnd-banking"],
		});
		assert.deepEqual(await restricted.locator(".bnd-report-landing__name").allTextContents(),
			["Bank Reconciliation", "Report Studio", "VAT Return", "Statement of Account"]);
		await restricted.close();

		const none = await landing(browser, {});
		assert.equal(await none.locator(".bnd-report-landing__card").count(), 3);
		await none.locator(".bnd-report-landing__card").first().click();
		assert.deepEqual(await none.evaluate(() => window.chosenReportRoute), ["bnd-report-studio"]);
		await none.close();
	} finally {
		await browser.close();
	}
});
