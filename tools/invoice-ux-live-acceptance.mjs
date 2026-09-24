import { openDesk, goto } from "./session.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const { page, close, errors } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill:not([hidden])", { settle: 5000 });
	const draft = await page.evaluate(() => {
		const root = document.querySelector(".bnd-bill:not([hidden])");
		const header = [...root.querySelectorAll(".bnd-bill-line-head > span")].map(node => node.textContent.trim());
		const save = root.querySelector('[data-bnd-action="save"]');
		const submit = root.querySelector('[data-bnd-action="submit"]');
		const submitPrint = root.querySelector('[data-bnd-action="submit-print"]');
		return {
			header,
			saveDisabled: save.disabled,
			saveInCommit: !!root.querySelector('.bnd-bill-action-group-commit [data-bnd-action="save"]'),
			saveInTools: !!root.querySelector('.bnd-bill-tools-body [data-bnd-action="save"]'),
			submitVisible: !!submit && !submit.hidden && getComputedStyle(submit).display !== "none",
			submitPrintVisible: !!submitPrint && !submitPrint.hidden && getComputedStyle(submitPrint).display !== "none",
			submitPrintLabel: submitPrint?.textContent?.trim() || "",
		};
	});
	const unit = draft.header.findIndex(label => /سعر الوحدة|Unit price/i.test(label));
	const discount = draft.header.findIndex(label => /الخصم|Discount/i.test(label));
	assert(unit >= 0 && discount >= 0 && unit < discount, "unit price is not before discount fields: " + JSON.stringify(draft.header));
	assert(!draft.saveDisabled, "Save draft is unexpectedly disabled after the invoice settles: " + JSON.stringify(draft));
	assert(!draft.saveInCommit && draft.saveInTools, "Save draft still occupies the compact commitment bar: " + JSON.stringify(draft));
	assert(draft.submitVisible, "Save and submit is not immediately visible: " + JSON.stringify(draft));
	assert(draft.submitPrintVisible && /طباعة|print/i.test(draft.submitPrintLabel), "Save, submit and print is not immediately visible: " + JSON.stringify(draft));
	await page.locator(".bnd-bill-mode button").nth(1).click();
	const advancedVisible = await page.locator(".form-layout").first().evaluate(node =>
		!node.hidden && getComputedStyle(node).visibility !== "hidden" && !!node.getClientRects().length);
	assert(advancedVisible, "Advanced invoice form stayed hidden behind the first-paint gate");
	await page.locator(".bnd-bill-mode button").first().click();

	await page.locator(".bnd-bill-tools > summary").click();
	assert(await page.locator(".bnd-bill-tools").evaluate(details => details.open), "invoice tools did not open");
	await page.locator(".bnd-bill-party h3").click();
	const toolsDismiss = await page.locator(".bnd-bill-tools").evaluate(details => ({
		open: details.open,
		expanded: details.querySelector("summary")?.getAttribute("aria-expanded"),
	}));
	assert(!toolsDismiss.open && toolsDismiss.expanded === "false", "invoice tools did not close after clicking away: " + JSON.stringify(toolsDismiss));

	await page.setViewportSize({ width: 540, height: 960 });
	await goto(page, "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill:not([hidden])", { settle: 1500 });
	const narrowActions = await page.evaluate(() => {
		const measure = () => {
			const totalRect = document.querySelector(".bnd-bill-mobile-total").getBoundingClientRect();
			const buttons = [...document.querySelectorAll(".bnd-bill-toolbar > .bnd-bill-action, .bnd-bill-action-group-commit > .bnd-bill-action")]
				.filter(node => !node.hidden && getComputedStyle(node).display !== "none" && node.getClientRects().length)
				.map(node => node.getBoundingClientRect());
			const gaps = buttons.map(rect => Math.max(0, rect.left - totalRect.right, totalRect.left - rect.right));
			const toolbar = document.querySelector(".bnd-bill-toolbar");
			return { gap: Math.min(...gaps), toolbarFits: toolbar.scrollWidth <= toolbar.clientWidth };
		};
		const current = measure();
		const originalDirection = document.documentElement.getAttribute("dir");
		document.documentElement.setAttribute("dir", "rtl");
		const rtl = measure();
		if (originalDirection == null) document.documentElement.removeAttribute("dir");
		else document.documentElement.setAttribute("dir", originalDirection);
		const visibleDocfeet = [...document.querySelectorAll(".bnd-docfoot")]
			.filter(node => getComputedStyle(node).display !== "none" && node.getClientRects().length).length;
		const submitPrintLabel = document.querySelector('[data-bnd-action="submit-print"] .bnd-bill-action-label');
		return {
			...current,
			rtl,
			visibleDocfeet,
			submitPrintLabelDisplay: submitPrintLabel && getComputedStyle(submitPrintLabel).display,
			owned: document.documentElement.getAttribute("data-bnd-own") || "",
		};
	});
	assert(narrowActions.gap >= 24, "invoice total is too close to the adjacent action: " + JSON.stringify(narrowActions));
	assert(narrowActions.rtl.gap >= 24, "RTL invoice total is too close to the adjacent action: " + JSON.stringify(narrowActions));
	assert(narrowActions.visibleDocfeet === 0, "invoice workbench is stacked with the native pinned footer: " + JSON.stringify(narrowActions));
	assert(narrowActions.toolbarFits, "invoice action toolbar overflows at narrow width: " + JSON.stringify(narrowActions));
	assert(narrowActions.rtl.toolbarFits, "RTL invoice action toolbar overflows at narrow width: " + JSON.stringify(narrowActions));
	assert(narrowActions.submitPrintLabelDisplay === "none", "combined action does not collapse to its labelled print icon at phone width: " + JSON.stringify(narrowActions));

	await page.locator(".bnd-bill-rail-toggle").click();
	await page.waitForFunction(() => document.querySelector(".bnd-bill")?.dataset.bndRailOpen === "true");
	const before = await page.evaluate(() => {
		const scrim = document.querySelector(".bnd-bill-rail-scrim");
		const rail = document.querySelector(".bnd-bill-rail");
		const sr = scrim.getBoundingClientRect(), rr = rail.getBoundingClientRect();
		return { background: getComputedStyle(scrim).backgroundColor, opacity: getComputedStyle(scrim).opacity, scrim: sr.toJSON(), rail: rr.toJSON() };
	});
	await page.mouse.move(before.scrim.x + before.scrim.width / 2, before.scrim.y + before.scrim.height / 2);
	await page.waitForTimeout(400);
	const after = await page.evaluate(() => {
		const scrim = document.querySelector(".bnd-bill-rail-scrim");
		return { background: getComputedStyle(scrim).backgroundColor, opacity: getComputedStyle(scrim).opacity };
	});
	assert(before.background === after.background && after.opacity === "1", "preview backdrop changes on hover: " + JSON.stringify({ before, after }));
	assert(before.rail.height >= 700, "preview drawer does not use the available viewport height: " + JSON.stringify(before.rail));

	await goto(page, "/desk/sales-invoice/ACC-SINV-2026-00016", ".bnd-bill:not([hidden])", { settle: 5000 });
	const actions = await page.evaluate(() => {
		const group = document.querySelector(".bnd-bill-action-group-commit");
		const visible = [...group.querySelectorAll(".bnd-bill-action")]
			.filter(button => !button.hidden && getComputedStyle(button).display !== "none")
			.map(button => button.textContent.trim());
		return { visible, printInCommit: !!group.querySelector(".bnd-bill-action-print") };
	});
	assert(actions.printInCommit && actions.visible.some(label => /طباعة|Print/i.test(label)), "Print is not immediately visible: " + JSON.stringify(actions));
	assert(actions.visible.some(label => /دفعة|Payment/i.test(label)), "Record payment is not visible beside Print: " + JSON.stringify(actions));

	await goto(page, "/desk/sales-invoice/new-sales-invoice-1", ".page-head .sidebar-toggle-btn:visible", { settle: 3000 });
	await page.locator(".page-head .sidebar-toggle-btn:visible").click();
	await page.waitForFunction(() => document.querySelector(".body-sidebar-container")?.classList.contains("expanded"));
	await page.waitForTimeout(500);
	const sidebar = await page.evaluate(() => {
		const container = document.querySelector(".body-sidebar-container");
		const pane = container?.querySelector(".body-sidebar");
		const overlay = container?.querySelector(":scope > .overlay");
		const bottom = document.querySelector(".bnd-statusbar")?.getBoundingClientRect();
		const rect = pane?.getBoundingClientRect();
		const visibleRows = [...(pane?.querySelectorAll(".standard-sidebar-item") || [])]
			.filter(node => getComputedStyle(node).display !== "none" && node.getClientRects().length)
			.map(node => node.getBoundingClientRect());
		return {
			available: !!pane && getComputedStyle(pane).display !== "none",
			expanded: container?.classList.contains("expanded"),
			width: rect?.width || 0,
			viewport: innerWidth,
			bottom: rect?.bottom || 0,
			bottomNavTop: bottom?.top || innerHeight,
			overlay: overlay ? getComputedStyle(overlay).display : "missing",
			rowsContained: visibleRows.every(row => row.left >= (rect?.left || 0) && row.right <= (rect?.right || 0)),
			horizontalOverflow: pane ? pane.scrollWidth - pane.clientWidth : 0,
		};
	});
	assert(sidebar.available && sidebar.expanded && sidebar.width >= sidebar.viewport - 1, "mobile sidebar is not full width: " + JSON.stringify(sidebar));
	assert(sidebar.overlay === "none", "native narrow scrim still covers the full-width menu: " + JSON.stringify(sidebar));
	assert(sidebar.bottom <= sidebar.bottomNavTop + 1, "mobile sidebar overlaps the bottom navigation: " + JSON.stringify(sidebar));
	assert(sidebar.rowsContained && sidebar.horizontalOverflow <= 1, "mobile sidebar content escapes its sheet: " + JSON.stringify(sidebar));

	console.log(JSON.stringify({ draft, toolsDismiss, narrowActions, preview: { before, after }, actions, sidebar, browser_errors: errors }, null, 2));
	assert(errors.length === 0, "browser errors: " + errors.join("\n"));
} finally {
	await close();
}
