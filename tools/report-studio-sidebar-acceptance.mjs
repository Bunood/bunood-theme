/** Permission-safe sidebar navigation and route lifecycle for Report Studio. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { goto, openDesk } from "./session.mjs";

const output = join("artifacts", "report-studio-sidebar");
mkdirSync(output, { recursive: true });
const assets = readFileSync(new URL("../bunood_theme/assets.py", import.meta.url), "utf8");
const asset = (name) => assets.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1];
const localFile = (path) => new URL(`../bunood_theme/public/${path.split("/assets/bunood_theme/")[1]}`, import.meta.url);

for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
	const session = await openDesk({ width, height, user: "demo.office@bunood.test" });
	try {
		if (!process.env.BND_LIVE_ASSETS) {
			await session.page.route(/\/assets\/bunood_theme\/dist\/(?:js|css)\/bnd-studio\.[\da-f]+\.(?:js|css)/,
				async (route) => {
					const js = route.request().url().endsWith(".js");
					await route.fulfill({ body: readFileSync(localFile(asset(js ? "STUDIO_JS" : "STUDIO_CSS"))),
						contentType: js ? "application/javascript" : "text/css" });
				});
		}
		await goto(session.page, "/desk/bnd-report-studio", ".bnd-studio-sidebar-index", { settle: 350 });
		const initial = await session.page.evaluate(() => ({
			links: [...document.querySelectorAll(".bnd-studio-sidebar-link")].map((link) => ({
				key: link.dataset.reportKey, href: link.getAttribute("href"), current: link.getAttribute("aria-current"),
			})),
			groups: [...document.querySelectorAll(".bnd-studio-sidebar-group-title")].map((node) => node.textContent.trim()),
			permitted: [...document.querySelectorAll(".bnd-studio-sidebar-link[data-report-key]")]
				.filter((link) => link.dataset.reportKey).every((link) => {
					const card = [...document.querySelectorAll(".bnd-studio__card")]
						.find((candidate) => candidate.dataset.reportKey === link.dataset.reportKey);
					return card && !card.disabled;
				}),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		assert.ok(initial.links.length >= 5, `${name}: report shelf has too few accessible links`);
		assert.equal(initial.links.filter((link) => link.current === "page").length, 1, `${name}: no unique current link`);
		assert.equal(initial.links[0].key, "", `${name}: All reports does not lead the shelf`);
		assert.ok(initial.groups.length >= 2, `${name}: report groups are missing`);
		assert.ok(initial.links.every((link) => link.href.startsWith("/desk/bnd-report-studio")), `${name}: invalid report route`);
		assert.ok(initial.permitted, `${name}: sidebar offered a disabled report`);
		assert.ok(initial.overflow <= 1, `${name}: horizontal overflow ${initial.overflow}px`);
		if (name === "desktop") {
			const audit = await new AxeBuilder({ page: session.page }).include(".bnd-studio-sidebar-index")
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
			assert.deepEqual(audit.violations.map((item) => item.id), [], "report shelf accessibility violations");
		}
		await session.page.screenshot({ path: join(output, `${name}.png`) });
		if (name === "desktop") {
			await session.page.locator('.bnd-studio-sidebar-link[data-report-key="accounts-receivable"]').click();
			await session.page.waitForFunction(() => frappe.get_route()[1] === "accounts-receivable" &&
				document.querySelector('.bnd-studio-sidebar-link[data-report-key="accounts-receivable"]')?.getAttribute("aria-current") === "page");
			await session.page.locator('.bnd-studio-sidebar-link[data-report-key=""]').click();
			await session.page.waitForFunction(() => !frappe.get_route()[1] &&
				document.querySelector('.bnd-studio-sidebar-link[data-report-key=""]')?.getAttribute("aria-current") === "page");
			await session.page.evaluate(() => frappe.set_route("Workspaces", "Home"));
			await session.page.waitForFunction(() => frappe.get_route()[0] === "Workspaces" && !document.querySelector(".bnd-studio-sidebar-index"));
			await session.page.evaluate(() => frappe.set_route("bnd-report-studio"));
			await session.page.waitForFunction(() => document.querySelectorAll(".bnd-studio-sidebar-index").length === 1);
		}
		assert.deepEqual(session.errors, [], `${name}: ${session.errors.join("\n")}`);
		console.log(JSON.stringify({ name, groups: initial.groups, links: initial.links.length, overflow: initial.overflow }));
	} finally {
		await session.close();
	}
}
