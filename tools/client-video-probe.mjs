// Read-only live acceptance for the rc20 local fixture. The invoice remains unsaved;
// Item 778 and Stores - BDEV are existing records, not records made by this probe.
import assert from "node:assert/strict";
import { benchJson, openDesk, URL_BASE } from "./session.mjs";

console.log("DATA", JSON.stringify(benchJson('print(json.dumps({"items": frappe.get_all("Item", fields=["name", "item_name"], filters={"disabled": 0}, limit=5), "warehouses": frappe.get_all("Warehouse", fields=["name"], filters={"is_group": 0}, limit=5)}))')));

const { page, errors, close } = await openDesk({ width: 1440, height: 900 });
try {
	await page.goto(`${URL_BASE}/desk/sales-invoice/new-sales-invoice-client-video-probe`, { waitUntil: "domcontentloaded" });
	try { await page.locator(".bnd-bill-items").waitFor({ timeout: 20000 }); }
	catch (error) {
		console.log("INVOICE WAIT FAILED", JSON.stringify({ url: page.url(), text: (await page.locator("body").innerText()).slice(0, 1600), errors }));
		throw error;
	}
	const before = await page.evaluate(() => ({
		name: cur_frm.doc.name,
		rows: cur_frm.doc.items?.map(row => [row.name, row.item_code]),
		canAdd: cur_frm.fields_dict.items.grid.is_editable(),
		cannotAdd: cur_frm.fields_dict.items.grid.cannot_add_rows,
		cannotAddDf: cur_frm.fields_dict.items.grid.df.cannot_add_rows,
		stock: cur_frm.doc.update_stock,
		warehouse: cur_frm.doc.set_warehouse,
		stockControl: !!document.querySelector(".bnd-bill-stock-source"),
		stockVisible: !!document.querySelector(".bnd-bill-stock-source")?.getClientRects().length,
		addButton: !!document.querySelector(".bnd-bill-search button"),
		fields: Object.fromEntries(["naming_series", "set_warehouse", "selling_price_list", "update_stock"].map(name => {
			const df = cur_frm.fields_dict[name]?.df;
			return [name, df && { label: df.label, fieldtype: df.fieldtype, hidden: df.hidden, read_only: df.read_only, depends_on: df.depends_on, options: df.options }];
		})),
	}));
	console.log("INVOICE BEFORE", JSON.stringify(before));
	assert.equal(before.stockVisible, true, "warehouse must be visible with Update Stock off");
	assert.equal(before.canAdd, true, "invoice item grid must be editable");
	assert.ok(before.fields.naming_series, "native numbering series must remain available");
	assert.ok(await page.locator('.bnd-bill-invoice-number .bnd-bill-hint').isVisible());
	assert.ok(await page.locator('.bnd-bill-context .bnd-bill-hint').isVisible());
	assert.ok(await page.locator('.bnd-bill-options [data-fieldname="naming_series"]').count());
	await page.getByRole("button", { name: /Add line|إضافة سطر/ }).click();
	await page.waitForTimeout(1500);
	const after = await page.evaluate(() => ({
		rows: cur_frm.doc.items?.map(row => [row.name, row.item_code]),
		status: document.querySelector(".bnd-bill-status")?.textContent,
		lines: document.querySelectorAll(".bnd-bill-line").length,
		active: document.activeElement?.outerHTML?.slice(0, 400),
	}));
	console.log("INVOICE AFTER", JSON.stringify(after));
	assert.equal(after.rows.length, before.rows.length, "Add line should focus the ready blank row instead of creating another empty row");
	assert.match(after.active, /data-fieldname="item_code"/, "Add line must focus the item selector");
	const itemInput = page.locator('.bnd-bill-item input[data-fieldname="item_code"]').first();
	await itemInput.fill("");
	await itemInput.pressSequentially("778", { delay: 80 });
	await page.waitForTimeout(700);
	console.log("ITEM CHOICES", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.awesomplete ul [role="option"]')].filter(el => el.getClientRects().length).slice(0, 5).map(el => el.innerText))));
	console.log("ITEM MENU", JSON.stringify(await page.evaluate(() => { const input = document.querySelector('.bnd-bill-item input[data-fieldname="item_code"]'); const menu = document.getElementById(input?.getAttribute('aria-owns')); return { value: input?.value, menu: menu?.outerHTML?.slice(0, 900) }; })));
	const firstItem = page.locator('.bnd-bill-item .awesomplete ul [role="option"]:visible').first();
	if (await firstItem.count()) {
		await firstItem.click();
		await page.waitForTimeout(1500);
		console.log("ITEM SELECTED", JSON.stringify(await page.evaluate(() => ({ rows: cur_frm.doc.items?.map(row => [row.item_code, row.qty]), status: document.querySelector('.bnd-bill-status')?.textContent }))));
	}
	assert.equal(await page.evaluate(() => cur_frm.doc.items[0].item_code), "778", "item selection must update the native invoice row");
	assert.ok(await page.evaluate(() => cur_frm.doc.items.some(row => !row.item_code)), "completed item must leave the next ready row");
	const warehouseInput = page.locator('.bnd-bill-stock-source input[data-fieldname="set_warehouse"]');
	await warehouseInput.fill("");
	await warehouseInput.pressSequentially("Stores", { delay: 80 });
	await page.waitForTimeout(700);
	console.log("WAREHOUSE CHOICES", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.awesomplete ul [role="option"]')].filter(el => el.getClientRects().length).slice(0, 5).map(el => el.innerText))));
	console.log("WAREHOUSE MENU", JSON.stringify(await page.evaluate(() => { const input = document.querySelector('.bnd-bill-stock-source input[data-fieldname="set_warehouse"]'); const menu = document.getElementById(input?.getAttribute('aria-owns')); return { value: input?.value, menu: menu?.outerHTML?.slice(0, 900) }; })));
	const firstWarehouse = page.locator('.bnd-bill-stock-source .awesomplete ul [role="option"]:visible').first();
	if (await firstWarehouse.count()) {
		await firstWarehouse.click();
		await page.waitForTimeout(700);
		console.log("WAREHOUSE SELECTED", JSON.stringify(await page.evaluate(() => ({ model: cur_frm.doc.set_warehouse, stock: cur_frm.doc.update_stock, status: document.querySelector('.bnd-bill-status')?.textContent }))));
	}
	assert.equal(await page.evaluate(() => cur_frm.doc.set_warehouse), "Stores - BDEV", "warehouse selection must update the native invoice");
	assert.equal(await page.evaluate(() => Number(cur_frm.doc.update_stock)), 0, "choosing a warehouse must not silently move stock");
	await page.goto(`${URL_BASE}/desk/item`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => cur_list?.doctype === "Item", null, { timeout: 60000 });
	await page.waitForTimeout(1000);
	const itemList = await page.evaluate(() => ({
		url: location.href,
		create: frappe.model.can_create("Item"),
		bootCreate: frappe.boot.user.can_create?.includes("Item"),
		buttons: [...document.querySelectorAll("button")].filter(el => el.getClientRects().length).map(el => ({ text: el.innerText, title: el.title, className: el.className })).filter(x => /new|add|جديد|إضافة/i.test([x.text,x.title].join(" "))).slice(0,30),
		primary: document.querySelector(".page-actions .primary-action")?.outerHTML,
		page: (() => { const el = document.querySelector(".page-actions .primary-action")?.closest(".page-container"); return el && { outer: el.outerHTML.slice(0, 500), attrs: [...el.attributes].map(a => [a.name,a.value]) }; })(),
	}));
	console.log("ITEM LIST", JSON.stringify(itemList));
	for (const width of [1440, 820, 474, 390]) {
		await page.setViewportSize({ width, height: 850 });
		const buttonAtWidth = await page.evaluate(() => {
			const button = document.querySelector(".page-actions .primary-action");
			const rectangle = button?.getBoundingClientRect();
			return { text: button?.innerText, visible: !!button?.getClientRects().length, box: rectangle && { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height }, style: button && { display: getComputedStyle(button).display, visibility: getComputedStyle(button).visibility }, viewport: innerWidth };
		});
		console.log("ITEM BUTTON AT", width, JSON.stringify(buttonAtWidth));
		assert.equal(buttonAtWidth.visible, true);
		assert.match(buttonAtWidth.text, /أضِف الصنف|Add Item|Add item/i, "Item create action must have a visible label at every width");
	}
	await page.locator('.page-actions .primary-action').click();
	await page.waitForTimeout(1500);
	const itemCreate = await page.evaluate(() => ({ doctype: window.cur_frm?.doctype, local: window.cur_frm?.doc?.__islocal, route: frappe.get_route(), modal: document.querySelector('.modal.show')?.innerText.slice(0, 350), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
	console.log('ITEM CREATE', JSON.stringify(itemCreate));
	assert.match(itemCreate.modal || "", /إضافة الصنف|New Item|Add Item/i, "Item list create action must open Quick Entry");
	assert.ok(itemCreate.overflow <= 1, "Item Quick Entry must not introduce horizontal overflow");
	console.log("ERRORS", JSON.stringify(errors));
	assert.deepEqual(errors, []);
} finally {
	await close();
}
