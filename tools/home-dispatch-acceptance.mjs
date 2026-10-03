/** Visual and read-only interaction check for the ERP Home dispatch on the pilot. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const out = join("artifacts", "home-dispatch");
mkdirSync(out, { recursive: true });
const assets = readFileSync(new URL("../bunood_theme/assets.py", import.meta.url), "utf8");
const pathFor = (name) => assets.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1];
const localFile = (asset) => new URL(`../bunood_theme/public/${asset.split("/assets/bunood_theme/")[1]}`, import.meta.url);

for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
	const session = await openDesk({ width, height, user: "demo.office@bunood.test" });
	let initialView = "";
	try {
		if (!process.env.BND_LIVE_ASSETS) {
			assert.ok(pathFor("THEME_JS") && pathFor("THEME_CSS"), "Build assets before previewing the Home dispatch");
			await session.page.route(/\/assets\/bunood_theme\/dist\/(?:js|css)\/bunood\.[\da-f]+\.(?:js|css)/,
				async (route) => {
					const js = route.request().url().endsWith(".js");
					await route.fulfill({ body: readFileSync(localFile(pathFor(js ? "THEME_JS" : "THEME_CSS"))),
						contentType: js ? "application/javascript" : "text/css" });
				});
		}
		await goto(session.page, "/desk/home", ".bnd-home-dashboard", { settle: 700 });
		initialView = (await session.page.locator(".bnd-home-view.is-current").textContent())?.trim() || "";
		await session.page.locator(".bnd-home-view").filter({ hasText: /Overview|نظرة عامة/ }).click();
		await session.page.waitForSelector(".bnd-home-command");
		const state = await session.page.evaluate(() => ({
			profile: document.querySelector(".bnd-home-dashboard")?.dataset.bndHomeProfile,
			commandHeight: Math.round(document.querySelector(".bnd-home-command")?.getBoundingClientRect().height || 0),
			actions: document.querySelectorAll(".bnd-home-dashboard > .bnd-home-actions-panel .bnd-home-action").length,
			actionsBelowScope: document.querySelector(".bnd-home-actions-panel")?.compareDocumentPosition(document.querySelector(".bnd-home-scope")) & Node.DOCUMENT_POSITION_PRECEDING,
			queues: document.querySelectorAll(".bnd-home-attn-row").length,
			signal: Number(document.querySelector(".bnd-home-command-signal-value")?.textContent?.replace(/[^\d]/g, "")),
			lanes: document.querySelectorAll(".bnd-home-process-panel .bnd-home-lane").length,
			metrics: document.querySelectorAll(".bnd-home-summary .bnd-home-metric").length,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		assert.equal(state.profile, "erp", `${name}: wrong Home profile`);
		assert.ok(state.commandHeight <= (name === "phone" ? 390 : 245),
			`${name}: Home command expanded to ${state.commandHeight}px`);
		assert.ok(state.actions >= 1, `${name}: daily actions are missing`);
		assert.ok(state.actionsBelowScope, `${name}: actions must follow view controls`);
		assert.equal(state.signal, state.queues, `${name}: queue signal does not match visible work`);
		assert.equal(state.lanes, 4, `${name}: missing process lanes`);
		assert.equal(state.metrics, 5, `${name}: missing live financial metrics`);
		assert.ok(state.overflow <= 1, `${name}: horizontal overflow ${state.overflow}px`);
		assert.deepEqual(session.errors, [], `${name}: ${session.errors.join("\n")}`);
		await session.page.screenshot({ path: join(out, `${name}.png`) });
		const nextStep = session.page.locator(".bnd-home-lane-next").first();
		await nextStep.hover();
		const hoverContrast = await nextStep.evaluate((node) => {
			const luminance = (color) => {
				const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
					const channel = value / 255;
					return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
				});
				return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
			};
			const style = getComputedStyle(node);
			const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
			return (values[0] + .05) / (values[1] + .05);
		});
		assert.ok(hoverContrast >= 4.5, `${name}: workflow hover contrast is only ${hoverContrast.toFixed(2)}:1`);
		await session.page.screenshot({ path: join(out, `${name}-workflow-hover.png`) });
		await session.page.locator(".bnd-home-command-signal").click();
		await session.page.waitForTimeout(400);
		const visible = await session.page.locator(".bnd-home-attn-panel").evaluate((node) => {
			const rect = node.getBoundingClientRect();
			const topbar = document.querySelector(".bnd-topbar")?.getBoundingClientRect().bottom || 0;
			return rect.top < innerHeight && rect.top >= topbar - 2 && rect.bottom > 0;
		});
		assert.ok(visible, `${name}: work-queue shortcut hid the heading behind the top bar`);
		await session.page.screenshot({ path: join(out, `${name}-work.png`) });
		await session.page.locator(".bnd-home-summary").evaluate((node) => node.scrollIntoView({ block: "start" }));
		await session.page.waitForTimeout(200);
		await session.page.screenshot({ path: join(out, `${name}-figures.png`) });
		await session.page.locator(".bnd-home-view").filter({ hasText: /Cashier|أمين الصندوق/ }).click();
		await session.page.waitForSelector(".bnd-home-dashboard.is-cashier .bnd-accountant-actions");
		const activeTabVisible = await session.page.locator(".bnd-home-view.is-current").evaluate((tab) => {
			const tabRect = tab.getBoundingClientRect();
			const stripRect = tab.parentElement.getBoundingClientRect();
			return tabRect.left >= stripRect.left - 1 && tabRect.right <= stripRect.right + 1;
		});
		assert.ok(activeTabVisible, `${name}: the selected Cashier tab is clipped`);
		const cashierActions = await session.page.locator(".bnd-home-dashboard.is-cashier .bnd-accountant-actions .bnd-home-intro-actions").evaluate((row) => ({
			labels: [...row.querySelectorAll("button")].map((button) => button.textContent.trim()),
			heights: [...row.querySelectorAll("button")].map((button) => Math.round(button.getBoundingClientRect().height)),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}));
		assert.ok(cashierActions.labels[0].includes("فتح نقطة البيع"), `${name}: POS action is not translated`);
		assert.ok(cashierActions.heights.every((height) => height <= 62), `${name}: cashier actions became oversized cards`);
		assert.ok(cashierActions.overflow <= 1, `${name}: cashier actions overflow horizontally`);
		await session.page.screenshot({ path: join(out, `${name}-cashier-actions.png`) });
		if (name === "desktop") {
			await session.page.locator(".bnd-home-dashboard.is-cashier .bnd-home-action.is-primary").click();
			await session.page.waitForFunction(() => location.href.includes("bnd-pos"));
			await goto(session.page, "/desk/home", ".bnd-home-dashboard", { settle: 300 });
		}
		console.log(JSON.stringify({ name, ...state, shortcut: "worklist visible" }));
	} finally {
		if (initialView) {
			try {
				await session.page.locator(".bnd-home-view").filter({ hasText: initialView }).click({ timeout: 3000 });
			} catch { /* Preserve the original assertion if the page failed earlier. */ }
		}
		await session.close();
	}
}
