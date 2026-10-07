/** Read-only route timing probe for the isolated pilot. */
import { benchJson, openDesk, URL_BASE } from "./session.mjs";

const saved = benchJson("print(json.dumps(frappe.get_all('Sales Invoice', filters={'docstatus': 1}, pluck='name', limit=1)))\n")[0];
const routes = [
	["home", "/desk/home", ".bnd-home-dashboard"],
	["all-apps", "/desk/desktop", ".desktop-wrapper"],
	["new-invoice", "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill"],
	...(saved ? [["saved-invoice", `/desk/sales-invoice/${encodeURIComponent(saved)}`, ".bnd-bill"]] : []),
];
const { page, close } = await openDesk();
let requests = [];
page.on("requestfinished", request => {
	const timing = request.timing();
	if (timing?.responseEnd < 100) return;
	const url = new URL(request.url());
	requests.push({ path: url.pathname, ms: Math.round(timing.responseEnd), type: request.resourceType() });
});
try {
	for (const [name, path, selector] of routes) {
		requests = [];
		const start = performance.now();
		await page.goto(`${URL_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
		const domMs = Math.round(performance.now() - start);
		await page.locator(selector).first().waitFor({ timeout: 60000 });
		const readyMs = Math.round(performance.now() - start);
		await page.waitForTimeout(700);
		const browser = await page.evaluate(() => {
			const nav = performance.getEntriesByType("navigation")[0];
			const fcp = performance.getEntriesByName("first-contentful-paint")[0];
			return { serverMs: Math.round(nav?.responseStart || 0), domMs: Math.round(nav?.domContentLoadedEventEnd || 0), fcpMs: Math.round(fcp?.startTime || 0) };
		});
		console.log(JSON.stringify({ name, domMs, readyMs, browser, slowRequests: requests.sort((a, b) => b.ms - a.ms).slice(0, 8) }));
	}
} finally {
	await close();
}
