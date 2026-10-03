/** Read-only visual and route acceptance for the isolated Real Estate desk. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const out = join("artifacts", "real-estate-command");
mkdirSync(out, { recursive: true });
for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
	const session = await openDesk({ width, height, user: "demo.office@bunood.test" });
	try {
		await goto(session.page, "/desk/real-estate", ".bnd-re-command-hero", { settle: 1400 });
		const state = await session.page.evaluate(() => ({
			title: document.querySelector(".bnd-re-command-title")?.textContent?.trim(),
			metrics: document.querySelectorAll(".bnd-re-command-metric").length,
			board: Boolean(document.querySelector(".bnd-re-command-board")),
			actions: document.querySelectorAll(".bnd-re-command-action-list .bnd-home-action").length,
			stages: document.querySelectorAll(".bnd-re-command-stage").length,
			reportLinks: document.querySelectorAll(".bnd-re-command-reports .bnd-home-action").length,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			dataState: document.querySelector(".bnd-re-command-clear strong")?.textContent?.trim() || "active queues",
		}));
		assert.ok(state.title, `${name}: missing heading`);
		assert.equal(state.metrics, 5, `${name}: missing live metrics`);
		assert.ok(state.board, `${name}: missing operating board`);
		assert.ok(state.actions >= 1, `${name}: no permitted quick action`);
		assert.equal(state.stages, 4, `${name}: incomplete property journey`);
		assert.ok(state.reportLinks >= 1, `${name}: no reports`);
		assert.ok(state.overflow <= 1, `${name}: horizontal page overflow ${state.overflow}px`);
		assert.deepEqual(session.errors, [], `${name}: ${session.errors.join("\n")}`);
		await session.page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
		const scroll = await session.page.evaluate(() => {
			const root = document.querySelector(".bnd-re-command-desk");
			let node = root;
			while (node && node !== document.documentElement) {
				if (node.scrollHeight > node.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
					node.scrollTop = node.scrollHeight;
					return { owner: node.className, height: node.scrollHeight, viewport: node.clientHeight };
				}
				node = node.parentElement;
			}
			window.scrollTo(0, document.body.scrollHeight);
			return { owner: "window", height: document.body.scrollHeight, viewport: window.innerHeight };
		});
		await session.page.waitForTimeout(350);
		await session.page.screenshot({ path: join(out, `${name}-bottom.png`), fullPage: false });
		if (name === "desktop") {
			await session.page.locator(".bnd-re-command-metric.is-active_properties").click();
			await session.page.waitForURL(/\/desk\/property(?:\/|$)/, { timeout: 15000 });
			assert.doesNotMatch(await session.page.locator("body").innerText(), /not permitted|ليس لديك صلاحية/i);
			await goto(session.page, "/desk/real-estate", ".bnd-re-command-hero", { settle: 300 });
			await session.page.locator(".bnd-re-command-action-list .bnd-home-action").first().click();
			await session.page.waitForURL(/\/desk\/property\/new-property-/, { timeout: 15000 });
			assert.doesNotMatch(await session.page.locator("body").innerText(), /not permitted|ليس لديك صلاحية/i);
		}
		console.log(JSON.stringify({ name, ...state, scroll }));
	} finally {
		await session.close();
	}
}
