import assert from "node:assert/strict";
import { openDesk, goto } from "./session.mjs";

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
	const initial = await rpc("bunood_theme.api.get_home_dashboard");
	original = initial.scope;
	assert.ok(original.companies.includes(original.company));
	assert.ok(original.views.includes(original.view));
	assert.equal(await desk.page.locator(".bnd-home-scope-select").count(),
		1 + (original.sales_people.length && ["sales", "collections"].includes(original.view) ? 1 : 0));
	assert.equal(await desk.page.locator(".bnd-home-period-preset").count(), original.view === "accountant" ? 0 : 4);
	assert.equal(await desk.page.locator(".bnd-home-collections-panel").count(), original.view === "accountant" ? 0 : 1);
	assert.equal(await desk.page.locator(".bnd-home-view[aria-pressed='true']").count(), 1);
	if (original.view !== "accountant") {
		const periodToTest = original.period === "today" ? "last_7_days" : "today";
		const position = { today: 0, last_7_days: 1, month_to_date: 2, last_30_days: 3 };
		await desk.page.locator(".bnd-home-period-preset").nth(position[periodToTest]).click();
		await desk.page.waitForFunction((index) =>
			document.querySelectorAll(".bnd-home-period-preset")[index]?.getAttribute("aria-pressed") === "true",
		position[periodToTest]);
		assert.equal((await rpc("bunood_theme.api.get_home_dashboard")).scope.period, periodToTest);
		await desk.page.locator(".bnd-home-period-preset").nth(position[original.period]).click();
		await desk.page.waitForFunction((index) =>
			document.querySelectorAll(".bnd-home-period-preset")[index]?.getAttribute("aria-pressed") === "true",
		position[original.period]);
	}

	const seven = await rpc("bunood_theme.api.get_home_dashboard", {
		company: original.company, period: "last_7_days", sales_person: "", view: original.view,
	});
	assert.equal(seven.scope.period, "last_7_days");
	assert.equal(seven.scope.company, original.company);
	assert.equal(seven.trend.length, 7);
	assert.ok(seven.collections.overdue.rows.length <= 5);
	assert.ok(seven.collections.due_soon.rows.length <= 5);
	assert.ok(seven.collections.overdue.count >= seven.collections.overdue.rows.length);
	assert.ok(seven.collections.due_soon.count >= seven.collections.due_soon.rows.length);
	const scopedSalesView = original.views.includes("sales") ? "sales" :
		original.views.includes("collections") ? "collections" : null;
	if (original.sales_people.length && scopedSalesView) {
		const person = original.sales_people[0];
		const focused = await rpc("bunood_theme.api.get_home_dashboard", {
			company: original.company, period: "last_7_days", sales_person: person, view: scopedSalesView,
		});
		assert.equal(focused.scope.sales_person, person);
		assert.ok(focused.kpis.every((metric) => metric.filters["sales_team.sales_person"] === person));
		assert.equal(focused.collections.overdue.filters["sales_team.sales_person"], person);
	}

	if (original.views.includes("collections")) {
		await desk.page.locator(".bnd-home-view").filter({ hasText: /Collections|التحصيلات/ }).click();
		await desk.page.locator(".bnd-home-view.is-current").filter({ hasText: /Collections|التحصيلات/ }).waitFor();
		const saved = await rpc("bunood_theme.api.get_home_dashboard");
		assert.equal(saved.scope.view, "collections");
		const order = await desk.page.evaluate(() => {
			const root = document.querySelector(".bnd-home-dashboard");
			return [...root.children].map((node) => node.className);
		});
		assert.ok(order.findIndex((x) => x.includes("bnd-home-collections-panel")) <
			order.findIndex((x) => x.includes("bnd-home-summary")));
		if (saved.collections.overdue.count) {
			const amount = await desk.page.locator(".bnd-home-collection-amount").first().innerText();
			assert.match(amount, /\d+\.\d{2}/, "collection amounts retain cents");
		}
	}
	await desk.page.screenshot({ path: "artifacts/home-scope-desktop.png" });
	await desk.page.setViewportSize({ width: 390, height: 844 });
	const mobile = await desk.page.evaluate(() => ({
		pageWidth: document.documentElement.scrollWidth,
		viewport: innerWidth,
		scopeFields: document.querySelectorAll(".bnd-home-scope-field").length,
		companyWidth: document.querySelector(".bnd-home-scope-field")?.getBoundingClientRect().width,
	}));
	assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
	assert.ok(mobile.companyWidth > 300, JSON.stringify(mobile));
	await desk.page.screenshot({ path: "artifacts/home-scope-mobile.png" });
	assert.equal(desk.errors.length, 0, desk.errors.join("\n"));
	console.log(JSON.stringify({ ok: true, views: original.views, collections: seven.collections, mobile }));
} finally {
	if (original && desk.page.url().includes("/desk/home")) {
		await rpc("bunood_theme.api.save_home_preferences", {
			view: original.view, company: original.company, period: original.period,
			sales_person: original.sales_person || "",
		}).catch(() => {});
	}
	await desk.close();
}
