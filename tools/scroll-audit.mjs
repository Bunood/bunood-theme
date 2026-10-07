import { openDesk, goto } from "./session.mjs";

const openActivity = process.argv.includes("--open-activity");
const routes = process.argv.slice(2).filter((value) => value !== "--open-activity");
const targets = routes.length ? routes : ["/desk/home", "/desk/sales-invoice/new-sales-invoice-1", "/app/selling"];

for (const width of [2048, 1440, 390]) {
	const { page, close } = await openDesk({ width, height: Number(process.env.BND_AUDIT_HEIGHT || 1000) });
	try {
		for (const route of targets) {
			await goto(page, route);
			await page.waitForTimeout(900);
			if (openActivity && await page.locator(".bnd-drawer-toggle:visible").count()) {
				await page.locator(".bnd-drawer-toggle:visible").first().click();
			}
			const result = await page.evaluate(() => {
				const all = [document.documentElement, document.body, ...document.querySelectorAll("*")];
				return {
					url: location.href,
					viewport: [innerWidth, innerHeight],
					mode: [document.documentElement.dir, document.documentElement.dataset.bndDesk, document.documentElement.dataset.bndTopbar, document.body.dataset.route, document.documentElement.dataset.bndDrawer],
					root: [document.documentElement, document.body, document.querySelector(".main-section"), document.querySelector(".page-container"), document.querySelector(".result-container")].filter(Boolean).map((element) => { const s = getComputedStyle(element); const r = element.getBoundingClientRect(); return { tag: element.tagName, classes: String(element.className).slice(0, 90), overflowY: s.overflowY, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, left: Math.round(r.left), right: Math.round(r.right) }; }),
					scrollers: all.flatMap((element) => {
						const style = getComputedStyle(element);
						if (element.scrollHeight <= element.clientHeight + 1 || !/auto|scroll/.test(style.overflowY)) return [];
						const rect = element.getBoundingClientRect();
						return [{ tag: element.tagName, id: element.id, classes: String(element.className).slice(0, 110), overflowY: style.overflowY, direction: style.direction, scrollbarWidth: style.scrollbarWidth, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }];
					}),
				};
			});
			console.log(JSON.stringify({ width, route, ...result }));
		}
	} finally {
		await close();
	}
}
