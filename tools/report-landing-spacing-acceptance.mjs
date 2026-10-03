/** The Reports shortcuts are independent cards, not cells in one joined table. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { goto, openDesk } from "./session.mjs";

const output = join("artifacts", "report-landing-spacing");
mkdirSync(output, { recursive: true });

for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
	const session = await openDesk({ width, height, user: "Administrator" });
	try {
		await goto(session.page, "/desk/reports", ".bnd-report-landing__card", { settle: 500 });
		const layout = await session.page.evaluate(() => {
			const grid = document.querySelector(".bnd-report-landing__grid");
			const cards = [...grid.querySelectorAll(".bnd-report-landing__card")]
				.filter((card) => !card.hidden);
			const style = getComputedStyle(grid);
			const cardStyles = cards.map((card) => getComputedStyle(card));
			const rects = cards.map((card) => card.getBoundingClientRect());
			const overlap = rects.some((a, i) => rects.some((b, j) =>
				j > i && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
			return {
				count: cards.length,
				columnGap: parseFloat(style.columnGap),
				rowGap: parseFloat(style.rowGap),
				gridBorder: parseFloat(style.borderTopWidth),
				cardBorders: cardStyles.map((card) => parseFloat(card.borderTopWidth)),
				cardBackgrounds: cardStyles.map((card) => card.backgroundColor),
				overlap,
				horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		assert.equal(layout.count, 6, `${name}: Reports shortcuts missing`);
		assert(layout.columnGap >= 12 && layout.rowGap >= 12, `${name}: cards still touch`);
		assert.equal(layout.gridBorder, 0, `${name}: shared grid frame remains`);
		assert(layout.cardBorders.every((width) => width >= 1), `${name}: cards have no individual borders`);
		assert(layout.cardBackgrounds.every((background) => background !== "rgba(0, 0, 0, 0)"),
			`${name}: cards have no individual surface`);
		assert.equal(layout.overlap, false, `${name}: cards overlap`);
		assert(layout.horizontalOverflow <= 1, `${name}: horizontal overflow`);
		await session.page.screenshot({ path: join(output, `${name}.png`) });
		assert.deepEqual(session.errors, [], `${name}: browser errors`);
		console.log(JSON.stringify({ name, layout }));
	} finally {
		await session.close();
	}
}
