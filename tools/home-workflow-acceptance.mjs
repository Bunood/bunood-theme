/** Read-only Home interaction check against the local Desk, using the just-built assets. */
import { readFileSync } from "node:fs";
import { openDesk, URL_BASE } from "./session.mjs";

const assets = readFileSync(new URL("../bunood_theme/assets.py", import.meta.url), "utf8");
const pathFor = (name) => assets.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1];
const js = pathFor("THEME_JS");
const css = pathFor("THEME_CSS");
if (!js || !css) throw new Error("Run npm run build first");
const file = (asset) => new URL(`../bunood_theme/public/${asset.split("/assets/bunood_theme/")[1]}`, import.meta.url);

const { page, close, errors } = await openDesk();
try {
	if (!process.env.BND_LIVE_ASSETS) {
		await page.route(/\/assets\/bunood_theme\/dist\/js\/bunood\.[\da-f]+\.js/, async (route) =>
			route.fulfill({ body: readFileSync(file(js)), contentType: "application/javascript" }));
		await page.route(/\/assets\/bunood_theme\/dist\/css\/bunood\.[\da-f]+\.css/, async (route) =>
			route.fulfill({ body: readFileSync(file(css)), contentType: "text/css" }));
	}
	await page.goto(`${URL_BASE}/app/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForSelector(".bnd-home-process-panel .bnd-home-lane-step", { timeout: 30000 });
	const result = await page.evaluate(() => {
		const calls = [];
		const original = frappe.set_route;
		frappe.set_route = (...args) => { calls.push(args); };
		try {
			const laneButtons = [...document.querySelectorAll(".bnd-home-process-panel .bnd-home-lane-step")];
			laneButtons.forEach((button) => button.click());
			const stageRoutes = calls.splice(0).map((args) => args[1]);
			const laneSurfaces = [...document.querySelectorAll(".bnd-home-lane-surface")];
			laneSurfaces.forEach((button) => button.click());
			const surfaceRoutes = calls.splice(0);
			const laneNext = [...document.querySelectorAll(".bnd-home-lane-next")];
			laneNext.forEach((button) => button.click());
			const nextRoutes = calls.splice(0);
			const highlightButtons = [...document.querySelectorAll(".bnd-home-process-highlight")];
			highlightButtons.forEach((button) => button.click());
			const highlightRoutes = calls.splice(0);
			const reportButtons = [...document.querySelectorAll(".bnd-home-report-open")];
			reportButtons.forEach((button) => button.click());
			const reportRoutes = calls.splice(0);
			const reportStudio = [...document.querySelectorAll(".bnd-home-reports-panel .bnd-home-action")]
				.find((button) => /report studio|استوديو التقارير/i.test(button.textContent));
			reportStudio?.click();
			const studioRoute = calls.splice(0)[0];
			return { stageRoutes, laneSurfaces: laneSurfaces.length, surfaceRoutes,
				laneNext: laneNext.length, nextRoutes, highlights: highlightButtons.length,
				highlightRoutes, reportButtons: reportButtons.length, reportRoutes, studioRoute };
		} finally { frappe.set_route = original; }
	});
	const expected = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry",
		"Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order",
		"Purchase Receipt", "Purchase Invoice", "Item", "Warehouse", "Stock Entry",
		"Stock Reconciliation", "Journal Entry", "Payment Reconciliation", "Period Closing Voucher"];
	if (JSON.stringify(result.stageRoutes) !== JSON.stringify(expected))
		throw new Error(`Workflow steps lost independent routes: ${JSON.stringify(result.stageRoutes)}`);
	if (result.laneSurfaces !== 4 || result.surfaceRoutes.length !== 4 || result.laneNext !== 4 || result.nextRoutes.length !== 4)
		throw new Error(`Workflow cards are not fully actionable: ${JSON.stringify(result)}`);
	if (result.highlights !== result.highlightRoutes.length || result.reportButtons !== 2 || result.reportRoutes.length !== 2)
		throw new Error(`Action/report cards are not fully actionable: ${JSON.stringify(result)}`);
	if (result.studioRoute?.[0] !== "bnd-report-studio") throw new Error("Report Studio shortcut is missing");
	await page.setViewportSize({ width: 390, height: 844 });
	const mobile = await page.evaluate(() => {
		const panel = document.querySelector(".bnd-home-process-panel");
		const highlights = [...panel.querySelectorAll(".bnd-home-process-highlight")];
		const bounds = panel.getBoundingClientRect();
		return { panelWidth: bounds.width, viewportWidth: innerWidth,
			highlightsFit: highlights.every((item) => item.getBoundingClientRect().width <= bounds.width),
			columns: getComputedStyle(panel.querySelector(".bnd-home-lanes")).gridTemplateColumns.split(" ").length };
	});
	if (mobile.panelWidth > mobile.viewportWidth || !mobile.highlightsFit || mobile.columns !== 1)
		throw new Error(`Mobile workflow layout overflows: ${JSON.stringify(mobile)}`);
	if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
	console.log(`Home workflow PASS: ${result.stageRoutes.length} independent steps, ${result.laneSurfaces} clickable lanes, ${result.highlights} live queue cards, ${result.reportButtons} report cards, Report Studio.`);
} finally {
	await close();
}
