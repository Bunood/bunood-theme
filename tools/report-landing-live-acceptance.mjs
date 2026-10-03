/** Live, read-only gate for optional Reports cards and the pilot search UI. */
import assert from "node:assert/strict";
import { benchJson, goto, openDesk } from "./session.mjs";

const optional = ["bnd-finance-close", "bnd-journal-workbench", "bnd-banking"];
const native = benchJson([
	"frappe.set_user('Administrator')",
	`names = ${JSON.stringify(optional)}`,
	"permitted = [name for name in names if frappe.db.exists('Page', name) and frappe.get_cached_doc('Page', name).is_permitted()]",
	"print(json.dumps(permitted))",
].join("\n") + "\n");

const session = await openDesk({ width: 1440, height: 900 });
try {
	await goto(session.page, "/desk/reports", ".bnd-report-landing__card", { settle: 500 });
	const state = await session.page.evaluate(() => ({
		permitted: frappe.boot?.bnd_report_landing_permitted_pages,
		assets: Object.fromEntries([
			["bnd-finance-close", "bnd_finance_close_js"],
			["bnd-journal-workbench", "bnd_journal_workbench_js"],
			["bnd-banking", "bnd_banking_js"],
		].map(([page, key]) => [page, !!frappe.boot?.[key]])),
		cards: [...document.querySelectorAll(".bnd-report-landing__card")]
			.map(card => new URL(card.href).pathname.split("/").at(-1)),
	}));
	assert.deepEqual([...state.permitted].sort(), [...native].sort(), "boot did not use native Page permissions");
	for (const name of optional) {
		assert.equal(state.cards.includes(name), state.assets[name] && native.includes(name),
			`${name} card did not match installed asset and native permission`);
	}
	const search = session.page.locator(".bnd-report-landing__search");
	await search.fill("no such report 20260926");
	assert.equal(await session.page.locator(".bnd-report-landing__card:visible").count(), 0);
	assert.equal(await session.page.locator(".bnd-report-landing__empty:visible").count(), 1);
	await search.fill("");
	assert.equal(await session.page.locator(".bnd-report-landing__empty:visible").count(), 0);
	assert.deepEqual(session.errors, [], `browser errors: ${session.errors.join(" | ")}`);
	console.log(`PASS Reports landing permissions/search: ${JSON.stringify(state)}`);
} finally {
	await session.close();
}
