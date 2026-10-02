/** Reproduce Frappe's failed-asset cache and prove Report Studio heals it. */
import { openDesk, URL_BASE } from "./session.mjs";

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

const { page, errors, close } = await openDesk({ width: 1440, height: 980 });
try {
	await page.goto(`${URL_BASE}/desk`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => window.frappe?.boot?.bnd_studio_css);

	const poisonedPath = await page.evaluate(() => {
		const path = frappe.boot.bnd_studio_css;
		const wanted = new URL(path, window.location.origin).pathname;
		document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
			if (new URL(link.href, window.location.origin).pathname === wanted) link.remove();
		});
		if (!frappe.assets._executed.includes(path)) frappe.assets._executed.push(path);
		return wanted;
	});

	await page.evaluate(() => frappe.set_route("bnd-report-studio"));
	await page.waitForSelector(".bnd-studio__card", { state: "visible", timeout: 60000 });
	await page.waitForTimeout(500);

	const result = await page.evaluate((wanted) => {
		const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(
			(node) => new URL(node.href, window.location.origin).pathname === wanted
		);
		const card = document.querySelector(".bnd-studio__card");
		const glyph = document.querySelector(".bnd-studio__glyph svg");
		return {
			linkPresent: Boolean(link),
			stylesheetReady: Boolean(link?.sheet),
			cardDisplay: getComputedStyle(card).display,
			cardHeight: card.getBoundingClientRect().height,
			glyphWidth: glyph.getBoundingClientRect().width,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	}, poisonedPath);

	invariant(result.linkPresent && result.stylesheetReady, "Studio did not replace the poisoned stylesheet");
	invariant(result.cardDisplay === "flex", `Studio card remained unstyled (${result.cardDisplay})`);
	invariant(result.cardHeight < 180, `Studio card remained oversized (${result.cardHeight}px)`);
	invariant(result.glyphWidth < 80, `Studio glyph remained oversized (${result.glyphWidth}px)`);
	invariant(result.overflow <= 1, `Studio recovery introduced ${result.overflow}px overflow`);
	invariant(errors.length === 0, `browser errors: ${errors.join(" | ")}`);

	await page.screenshot({ path: "artifacts/report-studio-session-recovery.png", fullPage: true });
	console.log(`PASS Report Studio session recovery: ${JSON.stringify(result)}`);
} finally {
	await close();
}
