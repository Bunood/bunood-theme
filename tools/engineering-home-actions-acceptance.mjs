/** Pilot Engineering Office creation controls: readable in both directions and sizes. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDesk } from "./session.mjs";

const output = join("artifacts", "engineering-actions");
mkdirSync(output, { recursive: true });

for (const [user, language] of [["Administrator", "ar"], ["admin@example.com", "en"]]) {
	for (const [size, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
		const session = await openDesk({ user, width, height });
		try {
			await session.page.goto(`${process.env.BND_URL || "http://localhost:8080"}/desk/engineering-office`);
			await session.page.locator(".bnd-eng-home__btn--command").first().waitFor();
			const state = await session.page.locator(".bnd-eng-home__commands").evaluate((commands) => ({
				direction: document.documentElement.dir,
				buttons: [...commands.querySelectorAll(".bnd-eng-home__btn--command")].map((button) => ({
					doctype: button.dataset.new,
					label: button.querySelector(".bnd-eng-home__command-label")?.textContent.trim(),
					icon: button.querySelector(".bnd-eng-home__command-icon path")?.getAttribute("d"),
					color: getComputedStyle(button).color,
					background: getComputedStyle(button).backgroundColor,
					width: button.getBoundingClientRect().width,
				})),
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			}));
			assert.equal(state.direction, language === "ar" ? "rtl" : "ltr");
			assert.deepEqual(state.buttons.map(({ doctype }) => doctype),
				["Quotation", "Engineering Contract", "Project"]);
			assert.ok(state.buttons.every(({ label, width }) => label && width >= 100));
			assert.equal(new Set(state.buttons.map(({ icon }) => icon)).size, 3,
				"creation actions need distinct document icons");
			assert.ok(state.buttons.every(({ background, color }) => background !== "rgba(0, 0, 0, 0)" &&
				color !== "rgb(255, 255, 255)"), "actions should be solid and use dark text");
			assert.ok(state.overflow <= 1, `${language} ${size}: ${state.overflow}px horizontal overflow`);
			await session.page.screenshot({ path: join(output, `${language}-${size}.png`) });
			if (language === "en" && size === "desktop") {
				await session.page.locator('.bnd-eng-home__btn--command[data-new="Quotation"] .bnd-eng-home__command-icon').click();
				await session.page.waitForFunction(() => frappe.get_route()[0] === "Form" && frappe.get_route()[1] === "Quotation");
			}
			assert.deepEqual(session.errors, [], `${language} ${size}: ${session.errors.join("\n")}`);
			console.log(`PASS Engineering actions: ${language} ${size}`);
		} finally {
			await session.close();
		}
	}
}
