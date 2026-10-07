/** POS and Report Studio must be discoverable, permitted and navigable. */
import assert from "node:assert/strict";
import { goto, openDesk } from "./session.mjs";

for (const user of ["Administrator", "demo.office@bunood.test"]) {
	const session = await openDesk({ user, width: 1440, height: 900 });
	const { page } = session;
	try {
		await goto(page, "/desk/home", ".bnd-home-dashboard", { settle: 500 });
		const navigation = await page.evaluate(() => {
			const sidebars = frappe.boot.workspace_sidebar_item || {};
			const home = sidebars.home?.items || [];
			const icons = frappe.boot.desktop_icons || [];
			return {
				homePages: home.filter((item) => item.link_type === "Page")
					.map((item) => item.link_to),
				sellingPos: sidebars.selling?.items?.filter((item) =>
					item.type === "Link" && item.link_type === "Page" &&
					/نقطة البيع|Point of Sale/i.test(item.label || ""))
					.map((item) => item.link_to),
				taskSidebars: ["Bunood POS", "Report Studio"].map((name) => ({
					name,
					first: sidebars[name.toLowerCase()]?.items?.find((item) => item.type === "Link"),
				})),
				appTiles: icons.filter((icon) => ["Bunood POS", "Report Studio"].includes(icon.label))
					.map((icon) => ({ label: icon.label, type: icon.link_type, target: icon.link_to })),
			};
		});
		assert.deepEqual(navigation.homePages.filter((page) =>
			["bnd-pos", "bnd-report-studio"].includes(page)).sort(),
			["bnd-pos", "bnd-report-studio"].sort(), `${user}: Home sidebar has missing task pages`);
		assert.deepEqual(navigation.taskSidebars.map((row) => row.first?.link_to),
			["bnd-pos", "bnd-report-studio"], `${user}: Apps tile does not open its real Page`);
		assert.deepEqual(navigation.appTiles.map((row) => row.label).sort(),
			["Bunood POS", "Report Studio"].sort(), `${user}: Apps tiles missing`);
		assert.deepEqual(navigation.sellingPos, ["bnd-pos"],
			`${user}: Selling's Point of Sale link still opens the old page`);
		const visibleHomeLinks = await page.locator(".body-sidebar a").evaluateAll((links) =>
			links.filter((link) => link.getClientRects().length)
				.map((link) => link.getAttribute("href") || "")
				.filter((href) => /\/desk\/bnd-(pos|report-studio)/.test(href)));
		assert(visibleHomeLinks.some((href) => href.includes("/desk/bnd-pos")),
			`${user}: POS link is not visible in Home sidebar`);
		assert(visibleHomeLinks.some((href) => href.includes("/desk/bnd-report-studio")),
			`${user}: Report Studio link is not visible in Home sidebar`);

		await goto(page, "/desk/desktop", '.desktop-icon[data-id="Bunood POS"]', { settle: 500 });
		await page.locator('.desktop-icon[data-id="Bunood POS"]').click();
		await page.waitForSelector(".bnd-pos-workbench");
		await goto(page, "/desk/desktop", '.desktop-icon[data-id="Report Studio"]', { settle: 500 });
		await page.locator('.desktop-icon[data-id="Report Studio"]').click();
		await page.waitForSelector(".bnd-studio__catalogue, .bnd-studio-sidebar-index");
		await goto(page, "/desk/selling", ".body-sidebar", { settle: 500 });
		const sellingPosSection = page.locator('.body-sidebar .sidebar-item-container.section-item:has(a[href="/desk/bnd-pos"]) > .standard-sidebar-item a');
		await sellingPosSection.click();
		await page.locator('.body-sidebar a[href="/desk/bnd-pos"]').click();
		await page.waitForSelector(".bnd-pos-workbench");
		assert.deepEqual(session.errors, [], `${user}: browser errors`);
		console.log(JSON.stringify({ user, navigation, visibleHomeLinks, routed: ["bnd-pos", "bnd-report-studio", "selling-to-bnd-pos"] }));
	} finally {
		await session.close();
	}
}
