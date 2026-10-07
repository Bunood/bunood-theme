import assert from "node:assert/strict";
import { openDesk, goto } from "./session.mjs";

for (const width of [1440, 390]) {
	const { page, close } = await openDesk({ width, height: 700 });
	try {
		await goto(page, "/desk/customer/view/list", ".result-container", { settle: 800 });
		const list = await page.evaluate(() => {
			const main = document.querySelector(".main-section");
			const results = document.querySelector(".result-container");
			return {
				root: getComputedStyle(document.documentElement).overflowY,
				body: getComputedStyle(document.body).overflowY,
				main: getComputedStyle(main).overflowY,
				results: getComputedStyle(results).overflowY,
				resultsScrollable: results.scrollHeight > results.clientHeight,
			};
		});
		assert.equal(list.root, "hidden", `the ${width}px document does not scroll`);
		assert.equal(list.body, "hidden", `the ${width}px body does not scroll`);
		assert.equal(list.main, "hidden", `the ${width}px list does not paint an outer scrollbar`);
		assert.equal(list.results, "auto", `the ${width}px results own vertical scrolling`);
		assert.ok(list.resultsScrollable, `the ${width}px results have enough rows to exercise scrolling`);
		const moved = await page.locator(".result-container").evaluate((node) => {
			node.scrollTop = 120;
			return node.scrollTop;
		});
		assert.ok(moved > 0, `the ${width}px results remain scrollable`);

		await goto(page, "/desk/home", ".bnd-home-dashboard", { settle: 700 });
		const home = await page.evaluate(() => ({
			main: getComputedStyle(document.querySelector(".main-section")).overflowY,
			scrollable: document.querySelector(".main-section").scrollHeight > document.querySelector(".main-section").clientHeight,
		}));
		assert.equal(home.main, "auto", `the ${width}px Home page regains its main scroller`);
		assert.ok(home.scrollable, `the ${width}px Home page can still scroll`);

		await goto(page, "/desk/item/BND-TEST-001", ".page-head", { settle: 700 });
		const drawer = await page.evaluate(() => {
			const html = document.documentElement;
			const main = document.querySelector(".main-section");
			const closed = getComputedStyle(main).overflowY;
			html.dataset.bndDrawer = "open";
			const opened = getComputedStyle(main).overflowY;
			delete html.dataset.bndDrawer;
			return { closed, opened, restored: getComputedStyle(main).overflowY };
		});
		assert.equal(drawer.closed, "auto", `the ${width}px form scrolls when Activity is closed`);
		assert.equal(drawer.opened, "hidden", `the ${width}px Activity drawer freezes the background scroll`);
		assert.equal(drawer.restored, "auto", `the ${width}px form scrolls again after Activity closes`);
		console.log(`scroll ownership passed at ${width}px`, { list, drawer });
	} finally {
		await close();
	}
}
