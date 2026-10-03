import { getSettings, openDesk, setSettings, goto } from "./session.mjs";

const ROUTES = ["customer", "supplier", "item", "sales-invoice", "purchase-invoice", "lease", "property"];
const RETRY_ONLY = process.env.BND_LIST_RETRY_ONLY === "1";
const previous = getSettings(["list_style"]);
setSettings({ list_style: "Hairline Rows" });
const { page, errors, close } = await openDesk();
try {
	if (!RETRY_ONLY) for (const width of [1440, 430]) {
		await page.setViewportSize({ width, height: 900 });
		for (const route of ROUTES) {
			await goto(page, `/desk/${route}/view/list`, ".frappe-list:visible", { settle: 400 });
			await page.waitForFunction(name => (frappe.get_route?.()[1] || "").toLowerCase().replaceAll(" ", "-") === name, route);
			await page.waitForFunction(() => {
				const visible = node => !!node && node.getClientRects().length > 0;
				return [...document.querySelectorAll(".result .list-row-container, .no-result, .no-result-message")].some(visible);
			}, null, { timeout: 60000 });
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

	// One deterministic native-Promise failure -> Retry cycle. Restore the
	// exact bound delegate before pressing Retry so the second call reaches
	// Frappe unchanged and proves the live recovery path.
	await page.setViewportSize({ width: 1440, height: 900 });
	await goto(page, "/desk/customer/view/list", ".frappe-list:visible", { settle: 400 });
	const before = await page.evaluate(async () => {
		const list = window.cur_list;
		const wrapper = list.refresh;
		const native = wrapper._bnd_native;
		const preserved = JSON.stringify({
			filters: list.get_filters_for_args(),
			sort: list.sort_selector?.get_sql_string?.() || "",
			start: list.start,
			pageLength: list.page_length,
		});
		list.last_args = null;
		wrapper._bnd_native = () => Promise.reject(new Error("BND deliberate list refresh failure"));
		try { await list.refresh(); } catch (_error) { /* the alert is the assertion */ }
		wrapper._bnd_native = native;
		const host = [...document.querySelectorAll(".frappe-list")].find(node => node.getClientRects().length > 0);
		const state = host?.querySelector(":scope > .bnd-list-recovery");
		const retry = state?.querySelector(".bnd-list-retry");
		retry?.focus();
		return {
			preserved,
			alert: state?.getAttribute("role"),
			live: state?.getAttribute("aria-live"),
			message: state?.textContent || "",
			retry: !!retry,
			icon: retry?.querySelector("use")?.getAttribute("href") || "",
			focus: document.activeElement === retry && getComputedStyle(retry).outlineStyle === "solid",
			throttleCleared: list.last_args === null,
			nativeWrapped: !!list.refresh?._bnd_native,
		};
	});
	if (before.alert !== "alert" || before.live !== "assertive")
		throw new Error(`list failure is not announced (${JSON.stringify(before)})`);
	if (!before.retry || !before.icon.endsWith("icon-refresh-cw")) throw new Error("list failure has no labelled Retry icon");
	if (!before.focus) throw new Error("list Retry has no keyboard focus ring");
	if (!before.throttleCleared || !before.nativeWrapped) throw new Error("native refresh/throttle contract failed");
	await page.locator(".bnd-list-retry:visible").click();
	await page.waitForFunction(() => {
		const host = [...document.querySelectorAll(".frappe-list")].find(node => node.getClientRects().length > 0);
		return !host?.querySelector(":scope > .bnd-list-recovery") && window.cur_list?.data?.length > 0;
	}, null, { timeout: 60000 });
	const after = await page.evaluate(() => ({
			preserved: JSON.stringify({
				filters: cur_list.get_filters_for_args(),
				sort: cur_list.sort_selector?.get_sql_string?.() || "",
				start: cur_list.start,
				pageLength: cur_list.page_length,
			}),
			rows: cur_list.data.length,
	}));
	if (after.preserved !== before.preserved) throw new Error("Retry changed filters, sort or paging");
	console.log(`PASS refresh failure -> Retry (${after.rows} rows, native state preserved)`);
	if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
} finally {
	await close();
	setSettings(previous);
}
