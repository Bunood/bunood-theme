/** Live check: native Link choices stay one click away without losing record links. */
import assert from "node:assert/strict";
import { openDesk, URL_BASE } from "./session.mjs";

const { page, close, errors } = await openDesk();
try {
	await page.goto(`${URL_BASE}/app/stock-entry/new`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		window.cur_frm?.fields_dict?.from_warehouse?.$input?.[0]?.dataset.bndLinkChoices
	);
	await page.evaluate(async () => {
		await cur_frm.set_value("from_warehouse", "Stores - BDEV");
	});
	const field = page.locator('.frappe-control[data-fieldname="from_warehouse"]');
	await field.locator(".bnd-link-choose").click();
	await page.waitForFunction(() =>
		cur_frm.fields_dict.from_warehouse.awesomplete.ul.querySelectorAll('[role="option"]').length >= 4
	);
	const before = await page.evaluate(() => ({
		selected: cur_frm.doc.from_warehouse,
		choices: [...cur_frm.fields_dict.from_warehouse.awesomplete.ul.querySelectorAll('[role="option"]')]
			.map(element => element.textContent.trim()),
		openHref: cur_frm.fields_dict.from_warehouse.$link_open.attr("href"),
	}));
	assert.equal(before.selected, "Stores - BDEV");
	assert(before.choices.some(value => value.includes("Finished Goods - BDEV")));
	assert(before.openHref.includes("/warehouse/Stores%20-%20BDEV"));
	await field.locator('.awesomplete [role="option"]')
		.filter({ hasText: "Finished Goods - BDEV" }).first().click();
	await page.waitForFunction(() => cur_frm.doc.from_warehouse === "Finished Goods - BDEV");
	const after = await page.evaluate(() => ({
		selected: cur_frm.doc.from_warehouse,
		openHref: cur_frm.fields_dict.from_warehouse.$link_open.attr("href"),
	}));
	assert(after.openHref.includes("/warehouse/Finished%20Goods%20-%20BDEV"));
	await field.locator("input").click();
	await page.waitForFunction(() => cur_frm.fields_dict.from_warehouse.autocomplete_open);
	assert.equal(await page.evaluate(() => cur_frm.doc.from_warehouse), "Finished Goods - BDEV");
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ before, after }));
} finally {
	await close();
}
