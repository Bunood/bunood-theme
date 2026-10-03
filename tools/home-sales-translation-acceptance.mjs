/** Arabic Sales dashboard actions should use standard sales-document names. */
import assert from "node:assert/strict";
import { goto, openDesk } from "./session.mjs";

const session = await openDesk({ user: "Administrator", width: 1440, height: 900 });
const { page } = session;
let original;

async function rpc(method, args = {}) {
	return page.evaluate(({ method, args }) => new Promise((resolve, reject) => {
		frappe.call({
			method, args,
			callback: (response) => resolve(response.message),
			error: (error) => reject(new Error(String(error?.message || error))),
		});
	}), { method, args });
}

try {
	await goto(page, "/desk/home", ".bnd-home-view-switch", { settle: 400 });
	original = (await rpc("bunood_theme.api.get_home_dashboard")).scope;
	assert(original.views.includes("sales"), "Sales dashboard is unavailable");
	if (original.view !== "sales") {
		await page.locator(".bnd-home-view").filter({ hasText: /المبيعات|Sales/ }).click();
		await page.locator(".bnd-home-view.is-current").filter({ hasText: /المبيعات|Sales/ }).waitFor();
	}
	const labels = await page.locator(".bnd-home-intro-actions .bnd-home-action")
		.evaluateAll((buttons) => buttons.map((button) => button.textContent.trim()));
	assert(labels.includes("عرض سعر جديد"), `Quotation action is untranslated: ${labels}`);
	assert(labels.includes("أمر بيع جديد"), `Sales Order action is untranslated: ${labels}`);
	assert(!labels.some((label) => /^New (quotation|sales order)$/.test(label)),
		`English labels remain on Arabic Sales dashboard: ${labels}`);
	assert.deepEqual(session.errors, [], `browser errors: ${session.errors.join(" | ")}`);
	console.log(JSON.stringify({ labels }));
} finally {
	if (original && page.url().includes("/desk/home")) {
		await rpc("bunood_theme.api.save_home_preferences", {
			view: original.view,
			company: original.company,
			period: original.period,
			sales_person: original.sales_person || "",
		}).catch(() => {});
	}
	await session.close();
}
