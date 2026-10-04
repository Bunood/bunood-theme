// Full-width desk screenshot. Ad-hoc probe built on session.mjs, per CLAUDE.md
// ("Use it for any ad-hoc probe").
//
// WHY THIS EXISTS, separately from shots.mjs: shots.mjs captures a 760px-wide crop
// of "the pane and the page's start", which assumes the pane is at the INLINE START
// in *visual* terms — true in LTR, false in RTL. On this Arabic desk the pane is on
// the right, so every shots.mjs crop shows the page's left edge and NO sidebar at
// all. A crop that is blind to the component it exists to photograph reports green
// by showing nothing. This takes the whole viewport instead, so RTL is photographable.
//
// Usage: node tools/shot-full.mjs <outfile.png> [width] [height] [route]
import { openDesk, goto } from "./session.mjs";

const out = process.argv[2];
const W = Number(process.argv[3] || 1600);
const H = Number(process.argv[4] || 1000);
const route = process.argv[5] || "/app/selling";
if (!out) {
	console.error("usage: node tools/shot-full.mjs <outfile.png> [width] [height] [route]");
	process.exit(2);
}

const { page, close } = await openDesk({ width: W, height: H });
try {
	await goto(page, route);
	await page.waitForTimeout(2500);
	const dir = page.evaluate ? await page.evaluate(() => document.documentElement.dir || "") : "";
	const meta = await page.evaluate(() => {
		const pane = document.querySelector(".body-sidebar-container");
		const r = pane ? pane.getBoundingClientRect() : null;
		return {
			dir: document.documentElement.dir || "(unset)",
			paneLeft: r ? Math.round(r.left) : null,
			paneWidth: r ? Math.round(r.width) : null,
			viewport: window.innerWidth,
			linkItems: document.querySelectorAll(".link-item").length,
			shortcuts: document.querySelectorAll(".widget.shortcut-widget-box").length,
			cards: document.querySelectorAll(".widget.links-widget-box").length,
		};
	});
	console.log("DOM:", JSON.stringify(meta));
	console.log("html dir:", dir);
	await page.screenshot({ path: out });
	console.log("wrote", out);
} finally {
	await close();
}
