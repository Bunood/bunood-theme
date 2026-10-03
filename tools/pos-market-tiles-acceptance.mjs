// Browser-only visual/interaction check. Route mocks expose an open register
// without changing the pilot's stale shift or posting any financial document.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goto, openDesk } from "./session.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.BND_POS_SHOT_DIR || join(root, "artifacts", "pos-market-tiles");
mkdirSync(out, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
const { page, errors } = session;

const items = [
	{ item_code: "COFFEE", item_name: "قهوة عربية", stock_uom: "Cup", uom: "Cup", price_list_rate: 18, currency: "SAR", is_stock_item: 0 },
	{ item_code: "LATTE", item_name: "لاتيه", stock_uom: "Cup", uom: "Cup", price_list_rate: 22, currency: "SAR", is_stock_item: 0 },
	{ item_code: "PASTRY", item_name: "كرواسون", stock_uom: "Nos", uom: "Nos", price_list_rate: 14, currency: "SAR", is_stock_item: 1, actual_qty: 27 },
	{ item_code: "WATER", item_name: "مياه معدنية", stock_uom: "Nos", uom: "Nos", price_list_rate: 3, currency: "SAR", is_stock_item: 1, actual_qty: 114 },
	{ item_code: "SANDWICH", item_name: "ساندويتش دجاج", stock_uom: "Nos", uom: "Nos", price_list_rate: 28, currency: "SAR", is_stock_item: 0 },
	{ item_code: "JUICE", item_name: "عصير برتقال", stock_uom: "Cup", uom: "Cup", price_list_rate: 16, currency: "SAR", is_stock_item: 0 },
];

try {
	await page.route("**/api/method/bunood_theme.pos.get_context**", async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		body.message.opening_entry = body.message.stale_opening_entry || { name: "VISUAL-ONLY", period_start_date: new Date().toISOString() };
		body.message.stale_opening_entry = null;
		body.message.item_groups = ["All Item Groups", "Beverages", "Food"];
		await route.fulfill({ response, json: body });
	});
	await page.route("**/api/method/bunood_theme.pos.get_items**", (route) => route.fulfill({ json: { message: { items } } }));
	await page.route("**/api/method/bunood_theme.pos.preview_cart**", async (route) => {
		const request = route.request();
		const body = request.postDataJSON();
		const payload = JSON.parse(body.payload);
		const total = payload.items.reduce((sum, row) => sum + Number(row.qty) * Number(row.rate), 0);
		await route.fulfill({ json: { message: { currency: "SAR", net_total: total, total_taxes_and_charges: 0, grand_total: total } } });
	});
	await goto(page, "/desk/bnd-pos", ".bnd-pos-workbench", { settle: 1000 });
	await page.waitForSelector(".bnd-pos__product");
	const brandColors = await page.evaluate(() => ({
		mode: getComputedStyle(document.querySelector(".bnd-pos__service-choice.is-selected")).backgroundColor,
		group: getComputedStyle(document.querySelector(".bnd-pos__group.is-active")).backgroundColor,
		cart: getComputedStyle(document.querySelector(".bnd-pos__cart-head")).backgroundColor,
		shift: getComputedStyle(document.querySelector(".bnd-pos__shift")).backgroundColor,
		connectionBadgeCount: document.querySelectorAll(".bnd-pos__online").length,
	}));
	assert.equal(brandColors.mode, brandColors.group, "selected mode and group use the same Bunood action green");
	assert.equal(brandColors.cart, brandColors.shift, "cart and shift use the same Bunood deep green");
	assert.equal(brandColors.connectionBadgeCount, 0, "POS header has no connection badge");
	assert.equal(await page.locator(".bnd-pos__product").count(), items.length);
	assert.ok(await page.locator(".bnd-pos__product-media svg").count() >= 4,
		"image-less drinks and food retain their Market Tiles illustrations");
	assert.equal(await page.locator(".bnd-pos__product[data-tone]").count(), items.length,
		"every tile has a stable material tone");
	await page.screenshot({ path: join(out, "desktop-initial.png"), fullPage: false });
	await page.locator(".bnd-pos__customer").screenshot({ path: join(out, "customer-row.png") });
	await page.locator(".bnd-pos__cart-head").screenshot({ path: join(out, "cart-header.png") });
	const cartHeaderAlignment = await page.evaluate(() => {
		const heading = document.querySelector(".bnd-pos__cart-head h3")?.getBoundingClientRect();
		const action = document.querySelector(".bnd-pos__new-sale")?.getBoundingClientRect();
		return heading && action ? Math.abs((heading.top + heading.bottom) / 2 - (action.top + action.bottom) / 2) : null;
	});
	assert.ok(cartHeaderAlignment !== null && cartHeaderAlignment <= 2, `cart heading/action misaligned: ${cartHeaderAlignment}`);
	assert.equal(await page.locator(".bnd-pos__new-sale").isEnabled(), true);
	const customerGeometry = await page.evaluate(() => {
		const row = document.querySelector(".bnd-pos__customer");
		const field = row.querySelector(".bnd-pos__customer-control .input-with-feedback");
		const button = row.querySelector(".bnd-pos__add-customer");
		const box = (node) => {
			const rect = node?.getBoundingClientRect();
			return rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) } : null;
		};
		return {
			field: box(field), button: box(button),
			controls: [...row.querySelectorAll(".frappe-control, .form-group, .link-btn, button")].map((node) => ({
				className: node.className, marginBottom: getComputedStyle(node).marginBottom,
			})),
		};
	});
	assert.ok(customerGeometry.field && customerGeometry.button, "customer controls are present");
	assert.ok(Math.abs(customerGeometry.field.top - customerGeometry.button.top) <= 1, "customer controls share a top edge");
	assert.ok(Math.abs(customerGeometry.field.bottom - customerGeometry.button.bottom) <= 1, "customer controls share a bottom edge");
	await page.locator('.bnd-pos__service-choice[data-service="Cafe"]').click();
	assert.equal(await page.locator(".bnd-pos__order-context").isVisible(), true);
	await page.locator('.bnd-pos__order-type[data-order-type="Dine In"]').click();
	await page.locator(".bnd-pos__table-label input").fill("T-12");
	await page.locator(".bnd-pos__product").first().click();
	await page.locator(".bnd-pos__product").first().click();
	assert.equal(await page.locator(".bnd-pos__cart-line").count(), 2, "cafe additions remain separate for individual notes");
	await page.locator(".bnd-pos__note").first().click();
	await page.locator('.modal:visible [data-fieldname="note"] textarea').fill("بدون سكر");
	await page.locator(".modal:visible .btn-primary").last().click();
	assert.match(await page.locator(".bnd-pos__note-text").first().textContent(), /بدون سكر/);
	await page.locator(".modal:visible").waitFor({ state: "hidden" });
	await page.locator(".modal-backdrop").waitFor({ state: "hidden" });
	await page.locator(".bnd-pos__header").evaluate((node) => node.scrollIntoView({ block: "start" }));
	await page.screenshot({ path: join(out, "desktop-cafe.png"), fullPage: false });
	await page.locator('.bnd-pos__service-choice[data-service="Retail"]').click();
	assert.equal(await page.locator(".bnd-pos__order-context").isVisible(), false);
	await page.screenshot({ path: join(out, "desktop-retail.png"), fullPage: false });
	await page.setViewportSize({ width: 820, height: 900 });
	await page.screenshot({ path: join(out, "tablet-retail.png"), fullPage: false });
	const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(tabletOverflow <= 1, `tablet horizontal overflow: ${tabletOverflow}px`);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.locator('.bnd-pos__service-choice[data-service="Cafe"]').click();
	await page.locator('.bnd-pos__mobile-action[data-view="items"]').click();
	await page.locator(".bnd-pos__mobile-nav").scrollIntoViewIfNeeded();
	await page.screenshot({ path: join(out, "mobile-items.png"), fullPage: false });
	await page.locator('.bnd-pos__mobile-action[data-view="cart"]').click();
	await page.screenshot({ path: join(out, "mobile-cafe.png"), fullPage: false });
	await page.locator(".bnd-pos__cart-actions").scrollIntoViewIfNeeded();
	const nav = await page.locator(".bnd-pos__mobile-nav").boundingBox();
	assert.ok(nav && nav.y >= 0 && nav.y + nav.height <= 844, `mobile POS navigation offscreen: ${JSON.stringify(nav)}`);
	await page.screenshot({ path: join(out, "mobile-checkout.png"), fullPage: false });
	await page.context().setOffline(true);
	await page.waitForFunction(() => document.querySelector(".bnd-pos__pay")?.disabled === true);
	assert.equal(await page.locator(".bnd-pos__pay").isDisabled(), true, "checkout pauses when connectivity is lost");
	await page.context().setOffline(false);
	await page.waitForFunction(() => document.querySelector(".bnd-pos__pay")?.disabled === false);
	await page.locator(".bnd-pos__new-sale").click();
	assert.equal(await page.locator(".bnd-pos__cart-line").count(), 0, "New sale resets the ticket");
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(overflow <= 1, `mobile horizontal overflow: ${overflow}px`);
	assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify({ items: items.length, cafeLines: 2, overflow, customerGeometry, screenshots: out }));
} finally {
	await session.close();
}
