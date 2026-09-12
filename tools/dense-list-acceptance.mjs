import { getSettings, openDesk, setSettings, goto } from "./session.mjs";

const ROUTES = ["customer", "supplier", "item", "sales-invoice", "purchase-invoice", "lease", "property"];
const previous = getSettings(["list_style"]);
setSettings({ list_style: "Hairline Rows" });
const { page, errors, close } = await openDesk();
try {
	for (const width of [1440, 430]) {
		await page.setViewportSize({ width, height: 900 });
		for (const route of ROUTES) {
			await goto(page, `/desk/${route}/view/list`, ".frappe-list:visible", { settle: 400 });
			await page.waitForFunction(name => (frappe.get_route?.()[1] || "").toLowerCase().replaceAll(" ", "-") === name, route);
			await page.keyboard.press("Tab");
			const state = await page.evaluate(() => {
				const shown = node => !!node && node.getClientRects().length > 0;
				const hasVisible = selector => [...document.querySelectorAll(selector)].some(shown);
				const list = [...document.querySelectorAll(".frappe-list")].find(shown);
				const head = list?.querySelector(".list-row-head");
				const row = [...(list?.querySelectorAll(".result .list-row-container") || [])]
					.find(node => shown(node) && node.querySelector(".list-row-checkbox"));
				const empty = hasVisible(".no-result, .no-result-message");
				const target = row?.querySelector("a, button, input, [tabindex]");
				target?.focus();
				const style = row ? getComputedStyle(row) : null;
				return {
					kit: document.documentElement.dataset.bndList,
					head: shown(head) || empty, row: !!row || empty, focus: empty || style?.outlineStyle === "solid" && parseFloat(style.outlineWidth) >= 2,
					filters: hasVisible(".filter-selector, .filter-button, .list-filter-button"),
					paging: empty || hasVisible(".list-paging-area, .list-paging-buttons"),
					overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					text: row?.innerText || "", focusInfo: row ? [target?.tagName, target?.tabIndex, target?.matches(":focus-visible"), style.outlineStyle, style.outlineWidth].join("/") : "no row",
				};
			});
			for (const key of ["head", "row", "focus", "filters", "paging"])
				if (!state[key]) throw new Error(`${width}px ${route}: ${key} contract failed (${state.focusInfo})`);
			if (state.kit !== "hairline") throw new Error(`${width}px ${route}: ${state.kit || "no"} list kit`);
			if (state.overflow > 1) throw new Error(`${width}px ${route}: page overflows by ${state.overflow}px`);
			if (width === 430 && route.endsWith("invoice") && !/ACC-(SINV|PINV)-/.test(state.text))
				throw new Error(`${route}: phone row does not expose document ID (${state.text.replaceAll("\n", " | ")})`);
			console.log(`PASS ${width}px ${route}`);
		}
	}
	if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
} finally {
	await close();
	setSettings(previous);
}
