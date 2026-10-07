/** Read-only acceptance of the 8100 demo account's POS and daily-journal pages. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const user = "demo.office@bunood.test";
const out = process.env.BND_DEMO_AUDIT_OUT || join("artifacts", "demo-full-access");
mkdirSync(out, { recursive: true });
const session = await openDesk({ width: 1440, height: 900, user });
const checks = [
	["pos", "/desk/bnd-pos", ".bnd-pos-workbench"],
	["journal", "/desk/bnd-journal-workbench", ".bnd-journal"],
	["journal-new", "/desk/journal-entry/new-journal-entry-1", ".bnd-task-journal"],
	["real-estate", "/desk/real-estate", ".bnd-home-dashboard[data-bnd-home-profile='real_estate']"],
];
try {
	for (const [name, route, selector] of checks) {
		await goto(session.page, route, selector, { settle: 900 });
		const state = await session.page.evaluate(() => ({
			url: location.pathname,
			body: document.body.innerText.slice(0, 260),
			horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		assert.ok(state.horizontalOverflow <= 1, `${name} overflows horizontally: ${state.horizontalOverflow}px`);
		assert.doesNotMatch(state.body, /not permitted|ليس لديك صلاحية/i, `${name} denied`);
		if (name === "journal-new") {
			const widths = await session.page.evaluate(() => ({
				canvas: document.querySelector(".bnd-task-journal .bnd-task-canvas").getBoundingClientRect().width,
				lines: document.querySelector(".bnd-task-journal .bnd-task-panel-lines").getBoundingClientRect().width,
			}));
			assert.ok(Math.abs(widths.canvas - widths.lines) <= 2,
				`Journal rows must span the available canvas: ${JSON.stringify(widths)}`);
		}
		await session.page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
		console.log(JSON.stringify({ name, ...state }));
	}
	assert.deepEqual(session.errors, [], session.errors.join("\n"));
} finally {
	await session.close();
}
