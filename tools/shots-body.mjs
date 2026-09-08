// Item 43 — screenshots of the desk BODY, to be READ before a slice is called done.
//
// The pane has tools/shots.mjs; the body has this. It walks the routes the item
// touches (a master with tabs and a grid, a new document in the wide column, a
// list, a workspace, the settings form) under the settings as they are, in
// light and dark, and writes one PNG per route and mode. It writes nothing
// else and changes no setting: set what you want to see first, shoot, restore.
//
// usage: BND_URL=http://127.0.0.1:8080 node tools/shots-body.mjs <outdir> [width]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDesk, goto } from "./session.mjs";

const outdir = process.argv[2];
const width = parseInt(process.argv[3] || "1440", 10);
if (!outdir) { console.error("usage: node tools/shots-body.mjs <outdir> [width]"); process.exit(1); }
mkdirSync(outdir, { recursive: true });

// [name, route, readiness selector, tab to open first (regex on its label)]
const ROUTES = [
	["item", "/desk/item/BND-TEST-001", ".form-tabs-list"],
	["item-uom", "/desk/item/BND-TEST-001", ".form-tabs-list", /uom/i],
	["item-new", "/desk/item/new", ".form-section"],
	["item-list", "/desk/item", ".list-row-head"],
	["selling", "/desk/selling", ".layout-main"],
	["settings", "/desk/theme-settings?shell=0", ".bnd-cbp"],
];

for (const mode of ["light", "dark"]) {
	const { page, close, errors } = await openDesk({ width, height: 900 });
	for (const [name, route, sel, tab] of ROUTES) {
		await goto(page, route, sel, { settle: 3000 });
		if (tab) {
			await page.evaluate((re) => {
				const a = [...document.querySelectorAll(".form-tabs .nav-link")].find((n) => new RegExp(re, "i").test(n.textContent));
				if (a) a.click();
			}, tab.source);
			await page.waitForTimeout(700);
		}
		// Frappe's own theme switch is a boot/user setting; the attribute is what
		// the stylesheets key on, and flipping it here is what the desk's own
		// switcher does after the round trip.
		await page.evaluate((m) => { document.documentElement.setAttribute("data-theme", m); }, mode);
		await page.waitForTimeout(400);
		await page.screenshot({ path: join(outdir, `${name}-${mode}.png`), fullPage: false });
		console.log(`${name}-${mode}.png`);
	}
	await close();
	if (errors.length) console.log(`(${mode}) console errors:`, errors.slice(0, 4));
}
