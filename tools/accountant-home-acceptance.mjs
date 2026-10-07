import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { openDesk, goto } from "./session.mjs";

mkdirSync("artifacts/accountant-home", { recursive: true });
const desk = await openDesk({ width: 1440, height: 900 });
let original;
async function rpc(method, args = {}) {
	return desk.page.evaluate(({ method, args }) => new Promise((resolve, reject) => {
		frappe.call({
			method, args,
			callback: (response) => resolve(response.message),
			error: (error) => reject(new Error(String(error?.message || error))),
		});
	}), { method, args });
}

try {
	await goto(desk.page, "/desk/home", ".bnd-home-scope", { settle: 500 });
	original = (await rpc("bunood_theme.api.get_home_dashboard")).scope;
	assert.ok(original.views.includes("accountant"));
	const current = await rpc("bunood_theme.api.save_home_preferences", {
		view: "accountant", company: original.company,
		period: original.period, sales_person: "",
	});
	await desk.page.reload();
	await desk.page.locator(".bnd-home-dashboard.is-accountant .bnd-accountant-snapshot").waitFor();
	assert.equal(current.scope.view, "accountant");
	assert.equal(current.scope.sales_person, "");
	if (current.scope.sales_people.length) {
		const companyWide = await rpc("bunood_theme.api.get_home_dashboard", {
			company: original.company, period: original.period,
			view: "accountant", sales_person: current.scope.sales_people[0],
		});
		assert.equal(companyWide.scope.sales_person, "", "accounting balances must ignore sales filters");
		assert.equal(companyWide.metrics.receivables, current.metrics.receivables);
	}
	assert.equal(await desk.page.locator(".bnd-home-period-preset").count(), 0);
	assert.equal(await desk.page.locator(".bnd-accountant-measure").count(),
		Object.values(current.accounting.available).filter(Boolean).length);
	assert.ok(await desk.page.locator(".bnd-accountant-link").count() >= 5);
	assert.equal(await desk.page.locator(".bnd-home-view[aria-pressed='true']").count(), 1);
	const scopeLayout = await desk.page.evaluate(() => {
		const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
		return {
			scope: rect(".bnd-home-dashboard.is-accountant > .bnd-home-scope"),
			views: rect(".bnd-home-view-switch"),
			filters: rect(".bnd-home-scope-filters"),
		};
	});
	assert.ok(scopeLayout.scope.height < 110, JSON.stringify(scopeLayout));
	assert.ok(Math.abs(scopeLayout.views.top - scopeLayout.filters.top) < 8, JSON.stringify(scopeLayout));
	await desk.page.screenshot({ path: "artifacts/accountant-home/desktop.png", fullPage: true });

	await desk.page.setViewportSize({ width: 390, height: 844 });
	const mobile = await desk.page.evaluate(() => ({
		viewport: innerWidth,
		page: document.documentElement.scrollWidth,
		snapshot: document.querySelector(".bnd-accountant-snapshot")?.getBoundingClientRect().width,
	}));
	assert.ok(mobile.page <= mobile.viewport + 1, JSON.stringify(mobile));
	await desk.page.screenshot({ path: "artifacts/accountant-home/mobile.png", fullPage: true });
	assert.equal(desk.errors.length, 0, desk.errors.join("\n"));
	console.log(JSON.stringify({ ok: true, company: current.scope.company, measures: current.accounting.available, mobile }));
} finally {
	if (original && desk.page.url().includes("/desk/home")) {
		await rpc("bunood_theme.api.save_home_preferences", {
			view: original.view, company: original.company,
			period: original.period, sales_person: original.sales_person || "",
		}).catch(() => {});
	}
	await desk.close();
}
