/** Read-only visual inventory of accountant workspaces on the pilot. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDesk, URL_BASE } from "./session.mjs";

const routes = [
	["bnd-finance-close", ".bnd-close"],
	["bnd-journal-workbench", ".bnd-journal"],
	["bnd-banking", ".bnd-banking"],
];
const out = join("artifacts", "finance-ux-audit");
mkdirSync(out, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
const requests = [];
session.page.on("response", (response) => {
	if (/finance_close|journal_workbench|bank_reconciliation_workbench/.test(response.url())) {
		requests.push({ status: response.status(), path: new URL(response.url()).pathname });
	}
});
try {
	for (const [route, selector] of routes) {
		await session.page.goto(`${URL_BASE}/desk/${route}`, { waitUntil: "domcontentloaded" });
		try {
			await session.page.waitForSelector(selector, { timeout: 15000 });
		} catch (error) {
			console.log(JSON.stringify({ route, url: session.page.url(), errors: session.errors,
				loadError: await session.page.locator(`${selector}-load-error`).allTextContents(),
				body: (await session.page.locator("body").innerText()).slice(0, 450) }));
			throw error;
		}
		await session.page.waitForTimeout(1800);
		try {
			await session.page.waitForFunction((rootSelector) =>
				!document.querySelector(rootSelector)?.classList.contains("is-loading"), selector,
				{ timeout: 30000 });
		} catch (error) {
			console.log(JSON.stringify({ route, requests, errors: session.errors,
				visible: (await session.page.locator(selector).innerText()).slice(0, 450) }));
			throw error;
		}
		const state = await session.page.evaluate((rootSelector) => {
			const root = document.querySelector(rootSelector);
			return {
				page: root?.querySelector("h1,h2")?.textContent?.trim() || "",
				fields: root?.querySelectorAll("input,select").length || 0,
				actions: root?.querySelectorAll("button,a").length || 0,
				metrics: root?.querySelectorAll(".bnd-close__metric,.bnd-banking__metric").length || 0,
				contentIsEmpty: (root?.querySelector(".bnd-close__content,.bnd-banking__content")?.children.length || 0) === 0,
				failure: Boolean(root?.querySelector("[role=alert]")),
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		}, selector);
		await session.page.screenshot({ path: join(out, `${route}.png`), fullPage: false });
		assert.equal(state.contentIsEmpty, false, `${route} displayed an empty content region`);
		assert.equal(state.failure, false, `${route} displayed an error`);
		assert.ok(state.overflow <= 1, `${route} has ${state.overflow}px horizontal overflow`);
		if (route !== "bnd-banking") assert.ok(state.metrics > 0, `${route} did not finish its first load`);
		console.log(JSON.stringify({ route, ...state }));
	}
	assert.ok(!session.errors.some((error) => error.includes("finally is not a function")),
		`Frappe promise finalization regressed: ${session.errors.join(" | ")}`);
	if (session.errors.length) console.log(`Browser warnings: ${session.errors.join(" | ")}`);
} finally {
	await session.close();
}
