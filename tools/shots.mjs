// Screenshot the desk in every pane state, so a change is LOOKED AT before it is
// reported done. Usage: node tools/shots.mjs <outdir> [width] [route]
//
// WHY THIS EXISTS. Item 42 shipped 478/478 green with three defects a single glance
// would have caught: the rail rendered Frappe's row labels clipped to one letter, the
// brand tile and the account button sat off-axis in a 52px strip, and Hidden drew an
// EMPTY 280px column. Every one of those states had a check; the checks asserted
// attributes, counts and computed styles, and none of them looked. The user found
// them with a screenshot, and asked that the work always be tested visually.
//
// What it captures, per state: a 760px-wide crop of the pane and the page's start,
// and a full-width strip of the page head (where Hidden puts the brand and the lent
// tenants). The states are Open, FRAPPE'S OWN COLLAPSE (`.collapse-sidebar-link` --
// a state the vendor styles only by width and the one the user's screenshot was of),
// Rail at rest, Rail on hover, and Hidden. Alongside each picture it prints the
// container's classes and width, the pane's width, and where the tenants ended up,
// so a picture and its DOM can be read together.
//
// It writes the site's `sidebar_pane_state` and restores Open at the end. Never run
// it while the suite runs -- they would fight over that field.
import { openDesk, goto, benchPy } from "./session.mjs";
import { mkdirSync } from "fs";

const out = process.argv[2];
const W = Number(process.argv[3] || 1200);
const route = process.argv[4] || "/app/selling";
if (!out) {
	console.error("usage: node tools/shots.mjs <outdir> [width] [route]");
	process.exit(2);
}
mkdirSync(out, { recursive: true });

const set = (state) =>
	benchPy(
		`frappe.db.set_single_value('Theme Settings', 'sidebar_pane_state', ${JSON.stringify(state)})\n` +
			"frappe.db.commit(); frappe.clear_cache(); frappe.get_cached_doc('Theme Settings')\n"
	);

const { browser, page } = await openDesk();
const shot = async (name) => {
	await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: Math.min(W, 760), height: 700 } });
	await page.screenshot({ path: `${out}/${name}-head.png`, clip: { x: 0, y: 0, width: W, height: 56 } });
	console.log(`  ${out}/${name}.png  +  ${name}-head.png`);
};
const dom = () =>
	page.evaluate(() => {
		const c = document.querySelector(".body-sidebar-container");
		const s = document.querySelector(".body-sidebar");
		const r = (n) => (n ? Math.round(n.getBoundingClientRect().width) : 0);
		return {
			state: document.documentElement.getAttribute("data-bnd-sb-panestate"),
			container: c ? `${c.className} | display=${getComputedStyle(c).display} w=${r(c)}` : null,
			pane: s ? `w=${r(s)}` : null,
			band: !!document.querySelector(".bnd-sb-band"),
			pageheadBrand: !!document.querySelector(".page-head .bnd-ph-brand"),
			pageheadTenants: [...document.querySelectorAll(".page-head .bnd-cluster [data-bnd-part]")]
				.map((e) => e.getAttribute("data-bnd-part"))
				.join(","),
		};
	});
const settle = async () => {
	await page.waitForFunction(
		() => window.bunood_theme && document.documentElement.getAttribute("data-bnd-sb-panestate"),
		null,
		{ timeout: 25000 }
	);
	await page.waitForTimeout(2500);
};

try {
	await page.setViewportSize({ width: W, height: 800 });
	for (const state of ["Open", "Rail", "Hidden"]) {
		set(state);
		await goto(page, route, "body", { timeout: 30000 });
		await settle();
		console.log(state, JSON.stringify(await dom()));
		await shot(state.toLowerCase());
		if (state === "Open") {
			// Frappe's own collapse, reached from the pane's own toggle.
			const clicked = await page.evaluate(() => {
				const t = document.querySelector(".body-sidebar .collapse-sidebar-link");
				if (!t) return false;
				t.click();
				return true;
			});
			if (clicked) {
				await page.waitForTimeout(1200);
				console.log("Open, Frappe collapsed", JSON.stringify(await dom()));
				await shot("open-frappe-collapsed");
				await page.evaluate(() => document.querySelector(".body-sidebar .collapse-sidebar-link").click());
				await page.waitForTimeout(600);
			} else console.log("  (no vendor collapse toggle on this desk)");
		}
		if (state === "Rail") {
			await page.hover(".body-sidebar");
			await page.waitForTimeout(900);
			console.log("Rail, hovered", JSON.stringify(await dom()));
			await shot("rail-hover");
		}
	}
} finally {
	set("Open");
	await browser.close();
}
