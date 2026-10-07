import assert from "node:assert/strict";
import { openDesk, goto } from "./session.mjs";

const desk = await openDesk({ width: 1440, height: 900 });
try {
	await goto(desk.page, "/desk/home", ".bnd-home-dashboard", { settle: 1200 });
	const home = await desk.page.evaluate(() => {
		const top = (selector) => document.querySelector(selector)?.getBoundingClientRect().top;
		const attention = document.querySelector(".bnd-home-attn-panel")?.getBoundingClientRect();
		const metrics = document.querySelector(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary");
		const summary = metrics?.getBoundingClientRect();
		const firstMetric = metrics?.querySelector(".bnd-home-metric");
		const secondMetric = metrics?.querySelector(".bnd-home-metric:nth-child(2)");
		const value = firstMetric?.querySelector(".bnd-home-metric-value");
		const icon = firstMetric?.querySelector(".bnd-home-icon");
		return {
			attention: top(".bnd-home-attn-panel"),
			readiness: top(".bnd-launch-review"),
			actions: top(".bnd-home-actions-panel"),
			figuresFollowWorklist: !!attention && !!summary && summary.top >= attention.bottom,
			metricCount: metrics?.querySelectorAll(".bnd-home-metric").length,
			metricColumns: metrics && getComputedStyle(metrics).gridTemplateColumns.split(" ").length,
			metricCellsUnified: !!firstMetric && !!secondMetric &&
				getComputedStyle(firstMetric).backgroundColor === getComputedStyle(secondMetric).backgroundColor,
			metricValueDirection: value && getComputedStyle(value).direction,
			metricValueAlignment: value && getComputedStyle(value).textAlign,
			metricIconVisible: !!icon && getComputedStyle(icon).display !== "none" && !!icon.querySelector("svg use"),
			metricContextCount: metrics?.querySelectorAll(".bnd-home-metric-context").length,
			metricDestinationCount: metrics?.querySelectorAll(".bnd-home-metric-destination").length,
			metricFootFits: [...(metrics?.querySelectorAll(".bnd-home-metric-foot") || [])]
				.every((foot) => foot.scrollWidth <= foot.clientWidth + 1),
			paths: top(".bnd-home-process-panel"),
			reports: top(".bnd-home-reports-panel"),
			backVisible: !!document.querySelector(".bnd-topbar-back svg")?.getClientRects().length,
			bellColor: getComputedStyle(document.querySelector(".bnd-home-attn-panel .bnd-home-panel-mark")).color,
		};
	});
	assert.ok(Number.isFinite(home.attention) && Number.isFinite(home.readiness), "home sections render");
	assert.ok(home.reports < home.readiness, "transactions and reporting precede setup review");
	assert.ok(home.actions < 360, "create actions are visible without scrolling");
	assert.ok(home.figuresFollowWorklist, "the full-width work queue precedes financial figures");
	assert.ok(home.metricCount === 5 && home.metricColumns === 5 && home.metricCellsUnified &&
		home.metricValueDirection === "ltr" && home.metricValueAlignment === "end",
		`home figures share a balanced RTL financial summary: ${JSON.stringify(home)}`);
	assert.ok(home.metricIconVisible && home.metricContextCount === 5 && home.metricDestinationCount === 5 && home.metricFootFits,
		`each financial figure has a visible icon, explanation and fitting drill-down: ${JSON.stringify(home)}`);
	assert.ok(home.paths < 800 && home.paths < home.reports,
		"workflow routes begin in the first desktop viewport before analysis");
	assert.ok(home.backVisible && home.bellColor === "rgb(225, 240, 228)",
		"the top bar has a visible Back control and the dark attention panel has a legible bell");
	await desk.page.screenshot({ path: "artifacts/editorial-home.png" });
	await desk.page.locator(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary").scrollIntoViewIfNeeded();
	await desk.page.screenshot({ path: "artifacts/editorial-home-kpis.png" });
	await desk.page.setViewportSize({ width: 390, height: 844 });
	await desk.page.locator(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary").scrollIntoViewIfNeeded();
	const mobileKpis = await desk.page.evaluate(() => {
		const cells = [...document.querySelectorAll(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary .bnd-home-metric")];
		return {
			visible: cells.length === 5,
			iconsVisible: cells.every((cell) => getComputedStyle(cell.querySelector(".bnd-home-icon")).display !== "none"),
			cellsFit: cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
			pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
		};
	});
	await desk.page.screenshot({ path: "artifacts/editorial-home-kpis-mobile.png" });
	assert.ok(mobileKpis.visible && mobileKpis.iconsVisible && mobileKpis.cellsFit && mobileKpis.pageFits,
		`the sales figures remain legible without horizontal overflow on mobile: ${JSON.stringify(mobileKpis)}`);
	await desk.page.setViewportSize({ width: 1440, height: 900 });
	await desk.page.locator(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary .bnd-home-metric").first().click();
	await desk.page.waitForURL(/sales-order/, { timeout: 15000 });
	assert.match(new URL(desk.page.url()).pathname, /sales-order$/, "Orders opens the native Sales Order list");
	await goto(desk.page, "/app/real-estate", "body", { settle: 3000 });
	await desk.page.waitForFunction(() => {
		const root = document.querySelector(".bnd-home-dashboard[data-bnd-home-profile='real_estate']");
		return root && (!root.querySelector(".bnd-home-loading") || root.querySelector(".bnd-system-state.is-recoverable-error"));
	}, null, { timeout: 30000 });
	const realEstate = await desk.page.evaluate(() => {
		const root = document.querySelector(".bnd-home-dashboard[data-bnd-home-profile='real_estate']");
		const icon = root?.querySelector(".bnd-home-metric .bnd-home-icon");
		const attention = root?.querySelector(".bnd-home-attn-panel")?.getBoundingClientRect();
		const summary = root?.querySelector(".bnd-home-summary")?.getBoundingClientRect();
		const portfolio = root?.querySelector(".bnd-re-portfolio-body")?.getBoundingClientRect();
		return {
			available: !!root,
			error: root?.querySelector(".bnd-system-state.is-recoverable-error")?.textContent?.trim() || "",
			actionsFirst: root?.children[1]?.classList.contains("bnd-home-actions-panel"),
			children: [...(root?.children || [])].slice(0, 4).map((node) => node.className),
			iconVisible: !!icon && getComputedStyle(icon).display !== "none",
			metricCount: root?.querySelectorAll(".bnd-home-summary .bnd-home-metric").length || 0,
			attentionBeforeMetrics: !!attention && !!summary && attention.top < summary.top,
			metricsFullWidth: !!summary && !!portfolio && summary.width >= portfolio.width - 2,
			processTop: root?.querySelector(".bnd-home-process-panel")?.getBoundingClientRect().top,
			url: location.pathname,
		};
	});
	assert.ok(realEstate.available && !realEstate.error, `property dashboard loads operational data: ${JSON.stringify(realEstate)}`);
	assert.ok(realEstate.actionsFirst, `property quick actions remain the first section: ${JSON.stringify(realEstate)}`);
	assert.ok(realEstate.iconVisible && realEstate.metricCount === 5,
		`the property dashboard renders its five live metrics: ${JSON.stringify(realEstate)}`);
	assert.ok(realEstate.attentionBeforeMetrics && realEstate.metricsFullWidth,
		`property tasks precede full-width metrics: ${JSON.stringify(realEstate)}`);
	assert.ok(realEstate.processTop < 800, `property workflows start in the opening viewport: ${JSON.stringify(realEstate)}`);
	await desk.page.screenshot({ path: "artifacts/editorial-real-estate.png" });

	await goto(desk.page, "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill", { settle: 1200 });
	const invoice = await desk.page.evaluate(() => {
		const seal = document.querySelector(".bnd-bill-seal");
		const state = document.querySelector(".bnd-bill .bnd-document-state");
		const nativeState = document.querySelector(".page-head .title-area > :is(.page-indicator-pill, .indicator-pill)");
		return {
			sealDisplay: seal && getComputedStyle(seal).display,
			actionBarBackground: getComputedStyle(document.querySelector(".bnd-bill-intro")).backgroundColor,
			actionBarTitleColor: getComputedStyle(document.querySelector(".bnd-bill-intro h2")).color,
			stateBackground: state && getComputedStyle(state).backgroundColor,
			nativeStateBackground: nativeState && getComputedStyle(nativeState).backgroundColor,
			nativeStateRadius: nativeState && getComputedStyle(nativeState).borderTopLeftRadius,
			itemsTop: document.querySelector(".bnd-bill-items")?.getBoundingClientRect().top,
			firstRowBottom: document.querySelector(".bnd-bill-line")?.getBoundingClientRect().bottom,
			amountTop: document.querySelector(".bnd-bill-amount-summary")?.getBoundingClientRect().top,
			itemsWidth: document.querySelector(".bnd-bill-items")?.getBoundingClientRect().width,
			linesWidth: document.querySelector(".bnd-bill-lines")?.getBoundingClientRect().width,
			mainWidth: document.querySelector(".bnd-bill-main")?.getBoundingClientRect().width,
			partyWidth: document.querySelector(".bnd-bill-party")?.getBoundingClientRect().width,
			contextVisible: !!document.querySelector(".bnd-bill-context")?.getClientRects().length,
			submitPrintBackground: getComputedStyle(document.querySelector(".bnd-bill-action-submit-print")).backgroundColor,
			submitBackground: getComputedStyle(document.querySelector(".bnd-bill-action-save")).backgroundColor,
			partyHeaderBottom: document.querySelector(".bnd-bill-party .bnd-bill-section-head")?.getBoundingClientRect().bottom,
			partyDetailsBottom: document.querySelector(".bnd-bill-party .bnd-bill-more-toggle")?.getBoundingClientRect().bottom,
		};
	});
	assert.equal(invoice.sealDisplay, "none", "record title replaces decorative monogram");
	assert.equal(invoice.actionBarBackground, "rgb(21, 60, 49)", "the invoice action bar uses Bunood deep green");
	assert.equal(invoice.actionBarTitleColor, "rgb(255, 255, 255)", "the invoice title stays legible on green");
	assert.equal(invoice.stateBackground, "rgba(0, 0, 0, 0)", "status is plain text, not a pill");
	if (invoice.nativeStateBackground) {
		assert.equal(invoice.nativeStateBackground, "rgba(0, 0, 0, 0)", "breadcrumb status has no colored pill");
		assert.equal(invoice.nativeStateRadius, "0px", "breadcrumb status is not rounded");
	}
	assert.ok(invoice.itemsTop < 400 && invoice.firstRowBottom < 630 && invoice.amountTop < 710,
		"invoice title, first editable item row and total remain compact in the opening viewport");
	assert.ok(invoice.contextVisible, "company, currency, price list and default warehouse remain visible without expanding details");
	assert.ok(Math.abs(invoice.itemsWidth - invoice.mainWidth) <= 2 && Math.abs(invoice.linesWidth - invoice.mainWidth) <= 2,
		"invoice table uses the full available document width");
	assert.equal(invoice.submitPrintBackground, invoice.submitBackground,
		"save-submit-print and save-submit share the requested green action treatment");
	assert.ok(Math.abs(invoice.partyHeaderBottom - invoice.partyDetailsBottom) <= 2,
		"customer and invoice-details actions align along the field row");
	const desktopDetails = desk.page.locator(".bnd-bill-more-toggle");
	assert.ok(await desktopDetails.isVisible(), "desktop secondary fields have an explicit disclosure");
	await desktopDetails.click();
	assert.ok(await desk.page.locator(".bnd-bill-more-fields").isVisible(), "desktop invoice details open without leaving the document");
	await desktopDetails.click();
	await desk.page.screenshot({ path: "artifacts/editorial-invoice.png" });
	await goto(desk.page, "/desk/purchase-invoice/new-purchase-invoice-1", ".bnd-bill", { settle: 800 });
	const purchaseAmountTop = await desk.page.locator(".bnd-bill-amount-summary").evaluate((node) => node.getBoundingClientRect().top);
	assert.ok(purchaseAmountTop < 630, "purchase invoice shares the denser document layout");
	await desk.page.locator(".bnd-topbar-brand").click();
	await desk.page.waitForURL(/\/desk\/home(?:$|[?#])/);
	await desk.page.locator(".bnd-topbar-back").click();
	await desk.page.waitForURL(/\/desk\/purchase-invoice\//);
	assert.ok(await desk.page.locator(".bnd-bill:not([hidden])").isVisible(), "Back returns to the prior invoice page");

	await goto(desk.page, "/desk/bnd-report-studio", ".bnd-studio__card", { settle: 1200 });
	const studio = await desk.page.evaluate(() => {
		const card = document.querySelector(".bnd-studio__card");
		const glyph = card?.querySelector(".bnd-studio__glyph");
		const grid = document.querySelector(".bnd-studio__grid");
		return {
			borderTop: card && getComputedStyle(card).borderTopWidth,
			glyphBackground: glyph && getComputedStyle(glyph).backgroundColor,
			cards: document.querySelectorAll(".bnd-studio__card").length,
			columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
		};
	});
	assert.ok(studio.cards >= 3, "report catalogue is populated");
	assert.equal(studio.borderTop, "0px", "report rows have no colored card caps");
	assert.equal(studio.glyphBackground, "rgba(0, 0, 0, 0)", "report icons have no colored plates");
	assert.equal(studio.columns, 2, "desktop report catalogue uses both columns");
	await desk.page.screenshot({ path: "artifacts/editorial-studio.png" });
	await desk.page.locator(".bnd-studio__card").first().click();
	await desk.page.waitForSelector(".bnd-studio__tablecard", { timeout: 30000 });
	await desk.page.waitForFunction(() => !document.querySelector(".bnd-studio__tablecard .bnd-studio__shimmer"), null, { timeout: 30000 });
	const viewer = await desk.page.evaluate(() => ({
		tableTop: document.querySelector(".bnd-studio__tablecard")?.getBoundingClientRect().top,
		chartTop: document.querySelector(".bnd-studio__chartcard")?.getBoundingClientRect().top,
		rows: document.querySelectorAll(".bnd-studio__table tbody tr").length,
	}));
	assert.ok(viewer.tableTop < viewer.chartTop, "report records precede the secondary chart");
	assert.ok(viewer.rows > 0, "the first report displays actual records, not only a loading surface");
	await desk.page.screenshot({ path: "artifacts/editorial-report-viewer.png" });

	await desk.page.setViewportSize({ width: 390, height: 844 });
	await goto(desk.page, "/desk/home", ".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary", { settle: 800 });
	const phoneMetrics = await desk.page.evaluate(() => {
		const summary = document.querySelector(".bnd-home-dashboard:not(.is-real-estate) > .bnd-home-summary");
		return {
			columns: getComputedStyle(summary).gridTemplateColumns.split(" ").length,
			lastWidth: summary.lastElementChild.getBoundingClientRect().width,
			width: summary.getBoundingClientRect().width,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});
	assert.ok(phoneMetrics.columns === 2 && phoneMetrics.lastWidth >= phoneMetrics.width - 3 && phoneMetrics.overflow <= 1,
		`phone metrics balance two columns without overflow: ${JSON.stringify(phoneMetrics)}`);
	await goto(desk.page, "/app/real-estate", ".bnd-home-dashboard[data-bnd-home-profile='real_estate']", { settle: 1200 });
	const phoneRealEstate = await desk.page.evaluate(() => ({
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		attention: document.querySelector(".bnd-home-attn-panel")?.getBoundingClientRect().top,
		metrics: document.querySelector(".bnd-home-summary")?.getBoundingClientRect().top,
	}));
	assert.ok(phoneRealEstate.overflow <= 1, "mobile property dashboard has no horizontal overflow");
	assert.ok(phoneRealEstate.attention < phoneRealEstate.metrics,
		"mobile property tasks remain ahead of portfolio figures");
	await desk.page.screenshot({ path: "artifacts/editorial-real-estate-mobile.png" });
	await goto(desk.page, "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill:not([hidden])", { settle: 800 });
	const phoneInvoice = await desk.page.evaluate(() => ({
		titleVisible: !!document.querySelector(".bnd-bill-identity h2")?.getClientRects().length,
		toolbarBorder: getComputedStyle(document.querySelector(".bnd-bill-toolbar")).borderTopWidth,
		contextColumns: getComputedStyle(document.querySelector(".bnd-bill-context")).gridTemplateColumns.split(" ").length,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert.ok(phoneInvoice.titleVisible && phoneInvoice.toolbarBorder !== "0px",
		"mobile invoice keeps its document title above a separately bounded action bar");
	assert.equal(phoneInvoice.contextColumns, 2, "mobile company and warehouse context fits two columns");
	assert.ok(phoneInvoice.overflow <= 1, "mobile invoice has no horizontal overflow");
	const more = desk.page.locator(".bnd-bill-more-toggle");
	assert.ok(await more.isVisible(), "secondary invoice fields have a visible phone disclosure");
	assert.equal(await more.getAttribute("aria-expanded"), "false", "secondary fields start collapsed on phones");
	await desk.page.screenshot({ path: "artifacts/editorial-invoice-mobile.png" });
	await more.click();
	assert.equal(await more.getAttribute("aria-expanded"), "true", "the invoice details disclosure opens");
	assert.ok(await desk.page.locator(".bnd-bill-more-fields").isVisible(), "payment and document fields remain accessible");
	await goto(desk.page, "/desk/purchase-invoice/new-purchase-invoice-1", ".bnd-bill:not([hidden])", { settle: 800 });
	assert.ok(await desk.page.locator(".bnd-bill-more-toggle").isVisible(), "purchase invoice secondary fields are also accessible on phones");
	assert.ok(await desk.page.locator(".bnd-bill-items").isVisible(), "purchase invoice item entry remains visible on phones");
	console.log("Editorial pilot visual acceptance passed", { home, invoice, studio });
} finally {
	await desk.close();
}
