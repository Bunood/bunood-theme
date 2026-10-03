import assert from "node:assert/strict";

import { openDesk } from "./session.mjs";

const base = process.env.BND_URL || "http://127.0.0.1:8088";
const session = await openDesk({ width: 1440, height: 900 });

try {
	for (const type of ["sales-invoice", "purchase-invoice"]) {
		await session.page.goto(`${base}/desk/${type}/new-${type}-1`);
		await session.page.waitForSelector(".bnd-bill-context > div", { timeout: 30000 });
		const result = await session.page.evaluate(() => {
			const label = window.__("Default warehouse");
			const pair = [...document.querySelectorAll(".bnd-bill-context > div")]
				.find((item) => item.querySelector("dt")?.textContent === label);
			return {
				label,
				value: pair?.querySelector("dd")?.textContent || "",
				modelValue: window.cur_frm?.doc?.set_warehouse || "",
				unsetLabel: window.__("Not set"),
			};
		});
		assert.ok(result.value, `${type}: default warehouse is visible beside invoice context`);
		assert.equal(result.value, result.modelValue || result.unsetLabel, `${type}: summary matches native set_warehouse`);
		console.log(`${type}: ${result.label}: ${result.value}`);
		if (type === "sales-invoice") {
			await session.page.locator(".bnd-bill-context").screenshot({ path: "artifacts/invoice-warehouse-context.png" });
		}
	}
	await session.page.setViewportSize({ width: 390, height: 844 });
	await session.page.goto(`${base}/desk/sales-invoice/new-sales-invoice-1`);
	await session.page.waitForSelector(".bnd-bill-context > div", { timeout: 30000 });
	const narrow = await session.page.evaluate(() => ({
		warehouseVisible: [...document.querySelectorAll(".bnd-bill-context dt")]
			.some((item) => item.textContent === window.__("Default warehouse")),
		horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert.equal(narrow.warehouseVisible, true);
	assert.ok(narrow.horizontalOverflow <= 1, "warehouse context must not create mobile horizontal scrolling");
	assert.deepEqual(session.errors, [], `browser errors: ${session.errors.join(" | ")}`);
} finally {
	await session.close();
}
