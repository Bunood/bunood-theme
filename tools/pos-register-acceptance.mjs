// Read-only browser acceptance for the dedicated POS receipt register.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const out = join("artifacts", "pos-register");
mkdirSync(out, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
try {
	await goto(session.page, "/desk/bnd-pos-register", ".bnd-pos-register", { settle: 700 });
	await session.page.waitForSelector(".bnd-pos-register__empty:not(.bnd-pos-register__loading)");
	assert.equal(await session.page.locator(".bnd-pos-register__mode").count(), 5);
	assert.equal(await session.page.locator(".bnd-pos-register__mode.is-active").count(), 1);
	assert.ok((await session.page.locator(".bnd-pos-register__field select option").count()) > 1);
	assert.equal(await session.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
	await session.page.screenshot({ path: join(out, "desktop-empty.png") });

	const sample = [
		{ doctype: "POS Invoice", name: "POS-HIST-001", customer: "CASH", customer_name: "عميل نقدي",
			posting_date: "2026-09-28", grand_total: 125, outstanding_amount: 0, currency: "SAR",
			status: "Paid", is_return: 0, owner: "cashier@example.test", pos_profile: "Counter" },
		{ doctype: "Sales Invoice", name: "SINV-DIRECT-002", customer: "CASH", customer_name: "عميل نقدي",
			posting_date: "2026-09-27", grand_total: -25, outstanding_amount: 0, currency: "SAR",
			status: "Return", is_return: 1, owner: "cashier@example.test", pos_profile: "Counter" },
	];
	await session.page.route("**/api/method/bunood_theme.pos.receipt_register**", async (route) => {
		const url = new URL(route.request().url());
		const mode = url.searchParams.get("mode");
		await route.fulfill({ json: { message: {
			rows: mode === "returns" ? sample.slice(1) : sample,
			next_cursor: null, mode, has_open_shift: mode === "shift" ? true : null,
			sources: ["POS Invoice", "Sales Invoice"], companies: ["Bunood Development"],
		} } });
	});
	await session.page.locator(".bnd-pos-register__mode").filter({ hasText: /All permitted sales|جميع المبيعات/ }).click();
	await session.page.waitForFunction(() => document.querySelectorAll(".bnd-pos-register__row").length === 2);
	const documents = await session.page.locator(".bnd-pos-register__row").evaluateAll((rows) =>
		rows.map((row) => ({ text: row.textContent, actions: [...row.querySelectorAll("button")].map((button) => button.textContent.trim()) })));
	assert.ok(documents[0].text.includes("POS-HIST-001"));
	assert.ok(documents[1].text.includes("SINV-DIRECT-002"));
	assert.ok(documents.every((row) => row.actions.length === 2));
	const originals = await session.page.evaluate(() => {
		const setRoute = frappe.set_route;
		const open = window.open;
		const result = {};
		try {
			frappe.set_route = (...parts) => { result.route = parts; };
			window.open = (...parts) => { result.print = parts; };
			const rows = document.querySelectorAll(".bnd-pos-register__row");
			rows[0].querySelectorAll("button")[0].click();
			rows[1].querySelectorAll("button")[1].click();
		} finally {
			frappe.set_route = setRoute;
			window.open = open;
		}
		return result;
	});
	assert.deepEqual(originals.route, ["Form", "POS Invoice", "POS-HIST-001"]);
	assert.ok(originals.print[0].includes("doctype=Sales+Invoice"));
	assert.ok(originals.print[0].includes("name=SINV-DIRECT-002"));
	await session.page.screenshot({ path: join(out, "desktop-sample.png") });
	await session.page.locator(".bnd-pos-register__mode").filter({ hasText: /Returns|المرتجعات/ }).click();
	await session.page.waitForFunction(() => document.querySelectorAll(".bnd-pos-register__row").length === 1);
	assert.ok((await session.page.locator(".bnd-pos-register__row").textContent()).includes("SINV-DIRECT-002"));
	await session.page.setViewportSize({ width: 390, height: 844 });
	await session.page.waitForTimeout(250);
	assert.ok(await session.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
	await session.page.screenshot({ path: join(out, "phone-sample.png") });
	await goto(session.page, "/desk/home", ".bnd-home-dashboard", { settle: 400 });
	await session.page.locator(".bnd-home-view").filter({ hasText: /Cashier|أمين الصندوق/ }).click();
	await session.page.waitForSelector(".bnd-home-dashboard.is-cashier .bnd-cashier-card");
	assert.equal(await session.page.locator(".bnd-cashier-card").count(), 4);
	assert.ok((await session.page.locator(".bnd-accountant-actions .bnd-home-action.is-primary").textContent())
		.includes("فتح نقطة البيع"));
	await session.page.screenshot({ path: join(out, "phone-cashier.png") });
	await session.page.locator(".bnd-accountant-actions .bnd-home-action").filter({ hasText: /View all POS receipts|عرض جميع إيصالات نقطة البيع/ }).click();
	await session.page.waitForSelector(".bnd-pos-register", { timeout: 30000 });
	assert.ok(session.page.url().includes("bnd-pos-register"));
	assert.deepEqual(session.errors, []);
	console.log(JSON.stringify({ ok: true, documents: documents.length, screenshots: out }));
} finally {
	await session.close();
}
