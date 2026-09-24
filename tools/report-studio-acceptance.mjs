import { benchJson, goto, openDesk } from "./session.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const previousLanguage = benchJson(
	"user = 'Administrator'\n" +
	"previous = frappe.db.get_value('User', user, 'language') or ''\n" +
	"frappe.db.set_value('User', user, 'language', 'ar')\n" +
	"frappe.db.commit()\n" +
	"frappe.clear_cache(user=user)\n" +
	"print(json.dumps(previous))\n"
);

const { page, errors, close } = await openDesk({ width: 1440, height: 980 });
try {
	await goto(page, "/desk/bnd-report-studio", ".bnd-studio__card", { settle: 800 });
	const gallery = await page.evaluate(() => ({
		direction: document.documentElement.dir,
		language: frappe.boot?.lang,
		cards: document.querySelectorAll(".bnd-studio__card").length,
		domains: [...document.querySelectorAll(".bnd-studio__domain")].map((button) => ({
			id: button.dataset.domain,
			pressed: button.getAttribute("aria-pressed"),
		})),
		countRole: document.querySelector(".bnd-studio__gallery-tools .bnd-studio__count")?.getAttribute("role"),
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert(gallery.direction === "rtl" && gallery.language === "ar", "Studio did not load in Arabic RTL");
	assert(gallery.cards >= 6, `gallery rendered only ${gallery.cards} cards`);
	assert(gallery.domains.some((domain) => domain.id === "all"), "All reports category is missing");
	assert(gallery.countRole === "status", "catalogue count is not announced");
	assert(gallery.overflow <= 1, `gallery overflows by ${gallery.overflow}px`);

	// Desk writes data-theme after boot and older/open sessions can briefly lack
	// it. The Studio must keep its compact catalogue anatomy in that state; the
	// old selector gate expanded intrinsic SVGs across the viewport.
	const ungatedLayout = await page.evaluate(() => {
		const html = document.documentElement;
		const previous = html.getAttribute("data-theme");
		html.removeAttribute("data-theme");
		const card = document.querySelector(".bnd-studio__card");
		const glyph = document.querySelector(".bnd-studio__glyph svg");
		const result = {
			display: getComputedStyle(card).display,
			cardHeight: card.getBoundingClientRect().height,
			glyphWidth: glyph.getBoundingClientRect().width,
		};
		if (previous == null) html.removeAttribute("data-theme");
		else html.setAttribute("data-theme", previous);
		return result;
	});
	assert(ungatedLayout.display === "flex", "Studio layout depends on html[data-theme]");
	assert(ungatedLayout.cardHeight < 180, `Studio card expanded to ${ungatedLayout.cardHeight}px without data-theme`);
	assert(ungatedLayout.glyphWidth < 80, `Studio icon expanded to ${ungatedLayout.glyphWidth}px without data-theme`);

	const search = page.locator(".bnd-studio__gallery-tools .bnd-studio__search");
	await search.fill("General Ledger");
	await page.waitForFunction(() => document.querySelectorAll(".bnd-studio__card").length > 0);
	const bilingualSearch = await page.evaluate(() => ({
		cards: document.querySelectorAll(".bnd-studio__card").length,
		domains: document.querySelectorAll(".bnd-studio__card-domain").length,
	}));
	assert(bilingualSearch.cards > 0 && bilingualSearch.domains === bilingualSearch.cards,
		"English report names are not searchable in the Arabic catalogue");
	await search.press("Escape");
	assert(await search.inputValue() === "", "Escape did not clear report search");

	await page.locator('.bnd-studio__domain[data-domain="all"]').click();
	const allCards = await page.locator(".bnd-studio__card").count();
	assert(allCards > gallery.cards, "All reports did not expand the catalogue");
	const reports = await page.evaluate(() => [...document.querySelectorAll(".bnd-studio__card")].map((card) => ({
		key: card.dataset.reportKey,
		disabled: card.disabled,
		title: card.querySelector(".bnd-studio__card-title")?.textContent || card.dataset.reportKey,
	})));
	const installed = reports.filter((report) => !report.disabled);
	assert(installed.length >= 12, `only ${installed.length} Studio reports are installed`);

	await page.evaluate(() => {
		window.__bndStudioCalls = [];
		window.__bndStudioNativeCall = frappe.call;
		frappe.call = function (options) {
			if (options?.method === "frappe.desk.query_report.run") {
				window.__bndStudioCalls.push({
					report: options.args?.report_name,
					filters: JSON.parse(options.args?.filters || "{}"),
				});
			}
			return window.__bndStudioNativeCall.apply(this, arguments);
		};
	});

	const results = [];
	for (const report of installed) {
		await page.evaluate((key) => frappe.set_route("bnd-report-studio", key), report.key);
		await page.waitForFunction((key) =>
			frappe.get_route?.()[0] === "bnd-report-studio" &&
			frappe.get_route?.()[1] === key &&
			document.querySelector(".bnd-studio--viewer-open"), report.key, { timeout: 30000 });

		if (report.key === "account-statement") {
			await page.waitForSelector(".bnd-studio__picker", { state: "visible", timeout: 30000 });
			results.push({ key: report.key, picker: true });
			continue;
		}

		await page.waitForFunction(() => {
			const studio = document.querySelector(".bnd-studio--viewer-open");
			return studio && studio.getAttribute("aria-busy") !== "true";
		}, null, { timeout: 120000 });
		const result = await page.evaluate(() => {
			const root = document.querySelector(".bnd-studio--viewer-open");
			const enabled = [...root.querySelectorAll(".bnd-studio__actions .bnd-studio__action")]
				.filter((button) => !button.disabled).length;
			return {
				error: root.querySelector(".bnd-studio__error")?.textContent || "",
				controls: root.querySelectorAll(".bnd-studio__control-label").length,
				actions: root.querySelectorAll(".bnd-studio__actions .bnd-studio__action").length,
				enabled,
				table: Boolean(root.querySelector(".bnd-studio__table, .bnd-studio__empty")),
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		assert(!result.error, `${report.title}: ${result.error}`);
		assert(result.controls >= 1 && result.actions === 5 && result.enabled === 5,
			`${report.title}: scope or actions did not become ready`);
		assert(result.table, `${report.title}: no table or valid empty state`);
		assert(result.overflow <= 1, `${report.title}: page overflows by ${result.overflow}px`);
		results.push({ key: report.key, ...result });
	}

	const dateRangeCalls = await page.evaluate(() => window.__bndStudioCalls
		.filter((call) => ["Balance Sheet", "Profit and Loss Statement"].includes(call.report)));
	assert(dateRangeCalls.length >= 2, "date-range report calls were not observed");
	assert(dateRangeCalls.every((call) => call.filters.period_start_date && call.filters.period_end_date),
		"current or previous comparison used the wrong date-range filter names");

	const firstReport = installed.find((report) => report.key !== "account-statement");
	await page.evaluate((key) => frappe.set_route("bnd-report-studio", key), firstReport.key);
	await page.waitForFunction(() => {
		const root = document.querySelector(".bnd-studio--viewer-open");
		return root && root.getAttribute("aria-busy") !== "true" &&
			!root.querySelector(".bnd-studio__error");
	}, null, { timeout: 120000 });
	const labels = await page.evaluate(() => ({
		refresh: __("Refresh"),
		print: __("Print"),
		export: __("Export Excel"),
		presentation: __("Presentation"),
		custom: __("Custom Period"),
		classic: __("Classic view"),
	}));
	await page.getByRole("button", { name: labels.refresh, exact: true }).click();
	await page.waitForFunction(() => document.querySelector(".bnd-studio")?.getAttribute("aria-busy") !== "true", null,
		{ timeout: 120000 });
	await page.evaluate(() => { window.__bndPrintCalled = false; window.print = () => { window.__bndPrintCalled = true; }; });
	await page.getByRole("button", { name: labels.print, exact: true }).click();
	assert(await page.evaluate(() => window.__bndPrintCalled), "Print action did not call the browser print workflow");
	await page.getByRole("button", { name: labels.presentation, exact: true }).click();
	assert(await page.locator(".bnd-studio--present").count() === 1, "Presentation mode did not open");
	await page.getByRole("button", { name: labels.presentation, exact: true }).click();
	assert(await page.locator(".bnd-studio--present").count() === 0, "Presentation mode did not close");
	await page.getByRole("button", { name: labels.custom, exact: true }).click();
	await page.waitForSelector(".modal-dialog", { state: "visible" });
	const customFields = await page.evaluate(() => ({
		from: Boolean(document.querySelector('.modal-dialog [data-fieldname="from"]')),
		to: Boolean(document.querySelector('.modal-dialog [data-fieldname="to"]')),
	}));
	assert(customFields.from && customFields.to, "Custom Period lost its from/to fields");
	await page.locator(".modal-dialog:visible .btn-modal-close, .modal-dialog:visible .btn-close").first().click();
	await page.waitForSelector(".modal-dialog", { state: "hidden" });

	const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
	await page.getByRole("button", { name: labels.export, exact: true }).click();
	const download = await downloadPromise;
	assert(download.suggestedFilename().endsWith(".xlsx"), "Excel export did not produce an XLSX file");

	await page.setViewportSize({ width: 520, height: 880 });
	await page.evaluate(() => frappe.set_route("bnd-report-studio"));
	await page.waitForSelector(".bnd-studio__card", { state: "visible" });
	const mobile = await page.evaluate(() => ({
		columns: getComputedStyle(document.querySelector(".bnd-studio__grid")).gridTemplateColumns.split(" ").length,
		arrowOpacity: Number(getComputedStyle(document.querySelector(".bnd-studio__card-go")).opacity),
		searchHeight: document.querySelector(".bnd-studio__gallery-tools .bnd-studio__search").getBoundingClientRect().height,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert(mobile.columns === 1, `mobile catalogue has ${mobile.columns} columns`);
	assert(mobile.arrowOpacity > 0.5, "mobile report affordance is hidden until hover");
	assert(mobile.searchHeight <= 56, `mobile report search is ${mobile.searchHeight}px tall`);
	assert(mobile.overflow <= 1, `mobile Studio overflows by ${mobile.overflow}px`);
	await page.screenshot({ path: "artifacts/report-studio-after-ar-mobile.png", fullPage: true });

	await page.setViewportSize({ width: 1440, height: 980 });
	await page.evaluate(() => frappe.set_route("bnd-report-studio"));
	await page.waitForSelector(".bnd-studio__card", { state: "visible" });
	await page.screenshot({ path: "artifacts/report-studio-after-ar.png", fullPage: true });

	assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
	console.log(`PASS Report Studio: ${installed.length} installed reports, ${results.length} routes, RTL/mobile/actions/export verified`);
} finally {
	await page.evaluate(() => {
		if (window.__bndStudioNativeCall) frappe.call = window.__bndStudioNativeCall;
	}).catch(() => {});
	await close();
	benchJson(
		"user = 'Administrator'\n" +
		`frappe.db.set_value('User', user, 'language', ${JSON.stringify(previousLanguage)})\n` +
		"frappe.db.commit()\n" +
		"frappe.clear_cache(user=user)\n" +
		"print(json.dumps(True))\n"
	);
}
