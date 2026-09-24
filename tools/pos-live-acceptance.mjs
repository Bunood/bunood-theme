import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { goto, openDesk } from "./session.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "artifacts", "pos-live");
mkdirSync(out, { recursive: true });

const session = await openDesk({ width: 1440, height: 900 });
const { page, errors } = session;

try {
	await goto(page, "/desk/bnd-pos", ".bnd-pos-workbench", { settle: 1200 });
	await page.waitForFunction(() => document.querySelector(".bnd-pos__shift-state strong")?.textContent?.trim());

	const desktop = await page.evaluate(() => ({
		title: document.querySelector(".bnd-pos__title h2")?.textContent?.trim(),
		profiles: document.querySelectorAll(".bnd-pos__profile option").length,
		products: document.querySelectorAll(".bnd-pos__product").length,
		shift: document.querySelector(".bnd-pos__shift-state strong")?.textContent?.trim(),
		openShiftVisible: document.querySelectorAll(".bnd-pos__shift-actions button")[0]?.offsetParent !== null,
		closeShiftVisible: document.querySelectorAll(".bnd-pos__shift-actions button")[1]?.offsetParent !== null,
		direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert.match(desktop.title || "", /Bunood POS|نقطة بيع بنود/);
	assert.ok(desktop.profiles > 0, "a permitted POS Profile is selectable");
	assert.match(desktop.shift || "", /Shift open|الوردية مفتوحة|out of date|قديمة/);
	assert.ok(desktop.overflow <= 1, `desktop horizontal overflow: ${desktop.overflow}px`);

	if (/Shift open|الوردية مفتوحة/.test(desktop.shift || "")) {
		assert.ok(desktop.products > 0, "the native catalogue returned product cards");
		await page.locator(".bnd-pos__product").first().click();
		await page.waitForSelector(".bnd-pos__cart-line");
	} else {
		assert.equal(desktop.products, 0, "an outdated shift cannot load a sellable catalogue");
		assert.equal(desktop.openShiftVisible, false, "a second shift cannot be opened over an outdated shift");
		assert.equal(desktop.closeShiftVisible, true, "the outdated shift remains available for review and closing");
	}
	await page.screenshot({ path: join(out, "desktop.png"), fullPage: false });

	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForTimeout(1200);
	const cartButton = page.locator('.bnd-pos__mobile-action[data-view="cart"]');
	await cartButton.click();
	await page.waitForTimeout(300);

	const mobile = await page.evaluate(() => {
		const posNav = document.querySelector(".bnd-pos__mobile-nav");
		const actions = document.querySelector(".bnd-pos__cart-actions");
		const globalBars = [...document.querySelectorAll(".bnd-statusbar")]
			.filter((node) => getComputedStyle(node).display !== "none");
		return {
			posNavPosition: posNav ? getComputedStyle(posNav).position : "missing",
			posNavTop: posNav ? getComputedStyle(posNav).insetBlockStart : "missing",
			cartActionsPosition: actions ? getComputedStyle(actions).position : "missing",
			globalBars: globalBars.length,
			mobileView: document.querySelector(".bnd-pos-workbench")?.dataset.mobileView,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});
	assert.equal(mobile.posNavPosition, "sticky");
	assert.equal(mobile.cartActionsPosition, "static");
	assert.equal(mobile.globalBars, 1, "the existing Bunood bottom navigation remains the single bottom bar");
	assert.equal(mobile.mobileView, "cart");
	assert.ok(mobile.overflow <= 1, `mobile horizontal overflow: ${mobile.overflow}px`);
	await page.screenshot({ path: join(out, "mobile-cart.png"), fullPage: false });

	assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify({ desktop, mobile, screenshots: out }, null, 2));
} finally {
	await session.close();
}
