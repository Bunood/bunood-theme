import assert from "node:assert/strict";

import { openDesk } from "./session.mjs";

const base = process.env.BND_URL || "http://127.0.0.1:8088";
const session = await openDesk({ width: 1440, height: 900 });
const { page, errors } = session;

async function inspect(route, selector, maximumTop) {
	await page.goto(`${base}/desk/${route}`);
	await page.waitForSelector(selector, { timeout: 30000 });
	const result = await page.evaluate((firstSelector) => {
		const first = document.querySelector(firstSelector);
		const head = document.querySelector(".bnd-dochead");
		const main = document.querySelector(".main-section");
		return {
			route: location.pathname,
			firstTop: Math.round(first.getBoundingClientRect().top),
			duplicateHeader: head ? getComputedStyle(head).display !== "none" : false,
			rootScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
			horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			mainBounds: {
				left: Math.round(main.getBoundingClientRect().left),
				right: Math.round(main.getBoundingClientRect().right),
			},
			mainOverflow: getComputedStyle(main).overflowY,
			visibleScrollers: [...document.querySelectorAll("*")].filter((node) => {
				const style = getComputedStyle(node);
				const rect = node.getBoundingClientRect();
				return ["auto", "scroll"].includes(style.overflowY)
					&& node.scrollHeight - node.clientHeight > 3
					&& style.visibility !== "hidden"
					&& style.display !== "none"
					&& rect.width > 30
					&& rect.height > innerHeight * 0.7
					&& rect.right > 0
					&& rect.left < innerWidth
					&& rect.bottom > 0
					&& rect.top < innerHeight;
			}).map((node) => ({
				selector: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${[...node.classList].slice(0, 3).map((name) => `.${name}`).join("")}`,
				left: Math.round(node.getBoundingClientRect().left),
				right: Math.round(node.getBoundingClientRect().right),
			})),
		};
	}, selector);
	assert.equal(result.duplicateHeader, false, `${route}: the second title band must not occupy the first screen`);
	assert.ok(result.firstTop <= maximumTop, `${route}: first work area starts at ${result.firstTop}px`);
	assert.ok(result.rootScroll <= 1, `${route}: the document must not add a second page scrollbar`);
	assert.ok(result.horizontalOverflow <= 1, `${route}: horizontal overflow`);
	assert.equal(result.mainOverflow, "auto");
	assert.equal(result.visibleScrollers.filter(({ left, right }) => left <= result.mainBounds.left + 40 && right >= result.mainBounds.right - 40).length, 1, `${route}: one active content-width scrollbar ${JSON.stringify(result)}`);
	return result;
}

try {
	const desktop = [];
	desktop.push(await inspect("payment-entry/new-payment-entry-1", ".bnd-task-panel", 320));
	desktop.push(await inspect("quotation/new-quotation-1", ".bnd-task-panel", 320));
	desktop.push(await inspect("sales-order/new-sales-order-1", ".bnd-task-panel", 320));
	desktop.push(await inspect("journal-entry/new-journal-entry-1", ".bnd-task-panel", 320));
	desktop.push(await inspect("stock-entry/new-stock-entry-1", ".bnd-stock-card", 320));
	desktop.push(await inspect("delivery-note/new-delivery-note-1", ".bnd-stock-card", 320));
	desktop.push(await inspect("purchase-invoice/new-purchase-invoice-1", ".bnd-bill-party", 320));
	desktop.push(await inspect("sales-invoice/new-sales-invoice-1", ".bnd-bill-party", 320));

	await page.locator(".bnd-bill-rail-toggle").click();
	const drawer = await page.evaluate(() => ({
		main: getComputedStyle(document.querySelector(".main-section")).overflowY,
		rail: getComputedStyle(document.querySelector(".bnd-bill-rail")).overflowY,
		open: document.querySelector(".bnd-bill")?.dataset.bndRailOpen,
	}));
	assert.equal(drawer.open, "true");
	assert.equal(drawer.main, "hidden", "opening preview pauses the background scrollbar");
	assert.equal(drawer.rail, "auto", "the preview itself remains scrollable");
	await page.locator(".bnd-bill-rail-close").click();
	assert.equal(await page.locator(".main-section").evaluate(node => getComputedStyle(node).overflowY), "auto");

	const intermediate = [];
	for (const width of [1024, 820]) {
		await page.setViewportSize({ width, height: 900 });
		intermediate.push(await inspect("payment-entry/new-payment-entry-1", ".bnd-task-panel", 400));
		intermediate.push(await inspect("sales-invoice/new-sales-invoice-1", ".bnd-bill-party", 400));
	}

	await page.setViewportSize({ width: 390, height: 844 });
	const mobile = [];
	mobile.push(await inspect("payment-entry/new-payment-entry-1", ".bnd-task-panel", 400));
	mobile.push(await inspect("sales-invoice/new-sales-invoice-1", ".bnd-bill-party", 400));
	assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify({ desktop, drawer, intermediate, mobile }, null, 2));
} finally {
	await session.close();
}
