import assert from "node:assert/strict";
import { goto, openDesk } from "./session.mjs";

const desk = await openDesk({ width: 1440, height: 900 });
const failedResponses = [];
desk.page.on("response", (response) => {
	if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
});

try {
	await goto(desk.page, "/desk/home", ".bnd-home-dashboard", { settle: 700 });
	const create = desk.page.locator(".bnd-home-intro-actions .bnd-home-action").first();
	await create.waitFor({ state: "visible", timeout: 30000 });
	assert.ok(await create.isVisible(), `invoice shortcut is not available on Home: ${JSON.stringify(await desk.page.evaluate(() => ({ actions: document.querySelectorAll('.bnd-home-action').length, intro: document.querySelectorAll('.bnd-home-intro-actions').length, text: document.querySelector('.bnd-home-dashboard')?.textContent?.slice(0, 200) })))}`);
	await create.click();
	await desk.page.waitForSelector(".bnd-bill:not([hidden])", { timeout: 30000 });
	assert.match(desk.page.url(), /sales-invoice/, "Home shortcut did not open the invoice");

	const rows = desk.page.locator(".bnd-bill-line");
	const before = await rows.count();
	await desk.page.locator(".bnd-bill-search button").first().click();
	const rowState = await desk.page.evaluate(() => ({
		count: cur_frm.doc.items.length,
		blank: cur_frm.doc.items.some((item) => !item.item_code),
		focused: document.activeElement?.closest(".bnd-bill-line") !== null,
	}));
	assert.ok(rowState.count === before + 1 || (rowState.count === before && rowState.blank && rowState.focused),
		`Add line neither added a row nor focused the existing blank row: ${JSON.stringify(rowState)}`);
	const stock = await desk.page.locator(".bnd-bill-stock-settings").evaluate((node) => {
		const children = [...node.children].map((child) => child.getBoundingClientRect().toJSON());
		return { children, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
	});
	assert.ok(stock.children.length >= 3, "stock toggle, warehouse or explanation is missing");
	assert.ok(stock.children[2].top < stock.children[0].bottom, "warehouse explanation wrapped below the entire desktop row");
	assert.ok(stock.overflow <= 1, "invoice overflows desktop viewport");

	await desk.page.setViewportSize({ width: 390, height: 844 });
	for (const [route, selector, name] of [
		["/desk/home", ".bnd-home-dashboard", "home"],
		["/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill:not([hidden])", "invoice"],
		["/desk/bnd-report-studio", ".bnd-studio__card", "studio"],
	]) {
		await goto(desk.page, route, selector, { settle: 600 });
		const overflow = await desk.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(overflow <= 1, `${name} overflows phone viewport by ${overflow}px`);
	}
	console.log("Pilot workflow PASS", { invoiceRowsBefore: before, invoiceRowState: rowState, failedResponses, browserErrors: desk.errors });
} finally {
	await desk.close();
}
