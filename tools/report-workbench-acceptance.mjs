import { benchJson, getSettings, goto, openDesk, setSettings } from "./session.mjs";

const REPORTS = [
	"General Ledger",
	"Accounts Receivable",
	"Accounts Payable",
	"VAT Summary",
	"Stock Balance",
	"Rent Roll",
	"Owner Ledger",
];
const recoveryOnly = process.env.BND_REPORT_RECOVERY_ONLY === "1";
const reportUser = process.env.BND_REPORT_USER || "Administrator";
const reportLanguage = process.env.BND_REPORT_LANGUAGE || "";
const reportWidth = Number(process.env.BND_REPORT_WIDTH || 1440);
const reportHeight = Number(process.env.BND_REPORT_HEIGHT || 900);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const previous = getSettings(["report_style", "report_grain", "report_rows", "filters_style"]);
setSettings({
	report_style: "Pinned Slab",
	report_grain: "Row Stripes",
	report_rows: "Edge Rail",
	filters_style: "Outlined",
});

const records = benchJson(
	`names = ${JSON.stringify(REPORTS)}\n` +
		"rows = []\n" +
		"for name in names:\n" +
		"    exists = bool(frappe.db.exists('Report', name))\n" +
		"    report = frappe.get_doc('Report', name) if exists else None\n" +
		"    rows.append({\n" +
		"        'name': name,\n" +
		"        'exists': exists,\n" +
		"        'type': getattr(report, 'report_type', None),\n" +
		"        'prepared': getattr(report, 'prepared_report', None),\n" +
		"        'roles': [row.role for row in getattr(report, 'roles', [])] if report else [],\n" +
		"    })\n" +
		"print(json.dumps(rows, default=str))\n"
);
console.log(JSON.stringify(records, null, 2));
assert(records.every((record) => record.exists), "one or more production reports are not installed");
assert(records.find((record) => record.name === "Stock Balance")?.prepared === 1,
	"Stock Balance is not configured as the prepared-report case");

const users = benchJson(
	"users = frappe.get_all('User', filters={'enabled': 1, 'user_type': 'System User'}, fields=['name', 'language'])\n" +
	"print(json.dumps([{**row, 'roles': frappe.get_roles(row.name)} for row in users], default=str))\n"
);
console.log(`Report personas: ${JSON.stringify(users)}`);

let previousLanguage = "";
if (reportLanguage) {
	previousLanguage = benchJson(
		`user = ${JSON.stringify(reportUser)}\n` +
		"previous = frappe.db.get_value('User', user, 'language') or ''\n" +
		`frappe.db.set_value('User', user, 'language', ${JSON.stringify(reportLanguage)})\n` +
		"frappe.clear_cache(user=user)\n" +
		"frappe.db.commit()\n" +
		"print(json.dumps(previous))\n"
	);
}

const { page, errors, close } = await openDesk({
	user: reportUser,
	width: reportWidth,
	height: reportHeight,
});
try {
	if (!recoveryOnly) for (const report of REPORTS) {
		await goto(page, `/desk/query-report/${encodeURIComponent(report)}`, "[id='page-query-report']", {
			settle: 1200,
		});
		await page.waitForFunction(
			(name) => frappe.get_route?.().includes(name) &&
				frappe.query_report?.report_name === name && frappe.query_report?.filters?.length > 0,
			report,
			{ timeout: 60000 }
		);
		await page.waitForFunction(() => Array.isArray(frappe.query_report?.data), null, {
			timeout: 120000,
		});
		await page.waitForSelector(".bnd-report-scope", { state: "visible", timeout: 60000 });
		const state = await page.evaluate(() => {
			const shown = (node) => !!node && node.getClientRects().length > 0;
			const qr = frappe.query_report;
			const root = qr.page?.wrapper?.get?.(0);
			const datatable = [...(root?.querySelectorAll(".datatable") || [])].find(shown);
			return {
				route: frappe.get_route?.() || [],
				reportName: qr.report_name,
				kit: document.documentElement.dataset.bndReport,
				language: document.documentElement.lang || frappe.boot?.lang || "",
				direction: document.documentElement.dir || getComputedStyle(document.body).direction,
				workbench: root?.hasAttribute("data-bnd-report-workbench") ?? false,
				rows: qr.data.length,
				datatable: !!datatable,
				header: shown(datatable?.querySelector(".dt-header")),
				scopeRole: root?.querySelector(".bnd-report-scope")?.getAttribute("role") || "",
				scopeItems: root?.querySelectorAll(".bnd-report-scope__item").length || 0,
				emptyAction: shown(root?.querySelector(".bnd-report-empty-action")),
				prepared: Boolean(qr.prepared_report),
				preparedDocument: Boolean(qr.prepared_report_document),
				numericCells: root?.querySelectorAll(
					".dt-scrollable .bnd-report-number .dt-cell__content[dir='ltr']"
				).length || 0,
				totalRows: root?.querySelectorAll(".bnd-report-total-row").length || 0,
				sectionRows: root?.querySelectorAll(".bnd-report-section-row").length || 0,
				nativeExport: typeof qr.export_report === "function",
				nativeRefresh: typeof qr.refresh?._bnd_native === "function",
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		assert(state.route.includes(report) && state.reportName === report, `${report}: wrong route/controller`);
		assert(state.kit === "slab" && state.workbench, `${report}: report kit/workbench missing`);
		if (reportLanguage) {
			assert(state.language.startsWith(reportLanguage),
				`${report}: expected ${reportLanguage}, got ${state.language}`);
			assert(state.direction === (reportLanguage === "ar" ? "rtl" : "ltr"),
				`${report}: wrong ${reportLanguage} direction ${state.direction}`);
		}
		assert(state.scopeRole === "region" && state.scopeItems > 0, `${report}: scope summary missing`);
		assert(state.nativeExport && state.nativeRefresh, `${report}: native export/refresh ownership changed`);
		assert(state.overflow <= 1, `${report}: page overflows by ${state.overflow}px`);
		if (state.rows > 0) {
			assert(state.datatable && state.header, `${report}: populated report has no native datatable`);
			assert(state.numericCells > 0, `${report}: populated report has no isolated numeric cells`);
		} else if (state.prepared && !state.preparedDocument) {
			assert(!state.emptyAction, `${report}: custom empty action obscures prepared-report generation`);
		} else {
			assert(state.emptyAction, `${report}: empty report has no Review filters action`);
		}
		console.log(`PASS ${report}: ${JSON.stringify(state)}`);
	}

	await goto(page, "/desk/query-report/VAT%20Summary", "[id='page-query-report']", { settle: 800 });
	await page.waitForFunction(() =>
		frappe.query_report?.report_name === "VAT Summary" &&
		Array.isArray(frappe.query_report?.data) &&
		document.querySelector(".bnd-report-scope"), null, { timeout: 120000 });

	const beforeFailure = await page.evaluate(() => {
		const report = frappe.query_report;
		const wrapped = report.refresh;
		const native = wrapped._bnd_native;
		const filters = JSON.stringify(report.get_filter_values());
		window.__bnd_report_export = report.export_report;
		wrapped._bnd_native = function () {
			const request = {
				abort() { return request; },
				done() { return request; },
				fail(callback) {
					queueMicrotask(() => callback({ statusText: "error" }, "error"));
					return request;
				},
			};
			this.last_ajax = request;
			return new Promise(() => {});
		};
		report.refresh();
		wrapped._bnd_native = native;
		return { filters, wrapped: typeof report.refresh._bnd_native === "function" };
	});
	assert(beforeFailure.wrapped, "the live report refresh is not wrapped around the native delegate");
	await page.waitForSelector(".bnd-report-recovery", { state: "visible", timeout: 10000 });
	const recovery = await page.evaluate(() => {
		const state = document.querySelector(".bnd-report-recovery");
		const retry = state?.querySelector(".bnd-report-retry");
		retry?.focus();
		const rect = retry?.getBoundingClientRect();
		const hit = rect && document.elementFromPoint(
			rect.left + rect.width / 2,
			rect.top + rect.height / 2
		);
		const sidebar = document.querySelector(".body-sidebar-container");
		const sidebarRect = sidebar?.getBoundingClientRect();
		const onboarding = document.querySelector(".body-sidebar-container > .user-onboarding");
		const onboardingRect = onboarding?.getBoundingClientRect();
		return {
			role: state?.getAttribute("role"),
			live: state?.getAttribute("aria-live"),
			icon: retry?.querySelector("use")?.getAttribute("href"),
			focus: document.activeElement === retry &&
				getComputedStyle(retry).outlineStyle === "solid",
			pointerReachable: Boolean(hit && (hit === retry || retry?.contains(hit))),
			hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join(".")}` : "none",
			retryRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
			sidebarRect: sidebarRect ? {
				x: sidebarRect.x, y: sidebarRect.y,
				width: sidebarRect.width, height: sidebarRect.height,
			} : null,
			onboardingRect: onboardingRect ? {
				x: onboardingRect.x, y: onboardingRect.y,
				width: onboardingRect.width, height: onboardingRect.height,
			} : null,
			sidebarPosition: sidebar ? getComputedStyle(sidebar).position : "missing",
			htmlAttributes: [...document.documentElement.attributes]
				.filter((attr) => attr.name.startsWith("data-bnd"))
				.map((attr) => `${attr.name}=${attr.value}`),
		};
	});
	console.log(`Recovery geometry: ${JSON.stringify(recovery)}`);
	assert(recovery.role === "alert" && recovery.live === "assertive",
		"report refresh failure is not announced assertively");
	assert(recovery.icon?.endsWith("icon-refresh-cw") && recovery.focus,
		"report Retry is missing its semantic icon or keyboard focus ring");
	assert(recovery.pointerReachable, `report Retry is covered by ${recovery.hit}`);
	await page.locator(".bnd-report-retry").click();
	await page.waitForFunction(() =>
		!document.querySelector(".bnd-report-recovery") &&
		frappe.query_report?.report_name === "VAT Summary" &&
		frappe.query_report?.data?.length > 0, null, { timeout: 120000 });
	const afterRetry = await page.evaluate(() => ({
		filters: JSON.stringify(frappe.query_report.get_filter_values()),
		exportUnchanged: frappe.query_report.export_report === window.__bnd_report_export,
		rows: frappe.query_report.data.length,
	}));
	assert(afterRetry.filters === beforeFailure.filters, "Retry changed the active report filters");
	assert(afterRetry.exportUnchanged, "Retry replaced Frappe's native export method");
	console.log(`PASS refresh failure -> Retry (${afterRetry.rows} rows, filters/export preserved)`);

	await page.evaluate(() => frappe.query_report.export_report());
	await page.waitForSelector(".modal-dialog", { state: "visible", timeout: 10000 });
	const exportState = await page.evaluate(() => {
		const dialog = frappe.query_report.export_dialog;
		return {
			fileFormat: Boolean(dialog?.fields_dict?.file_format),
			includeFilters: Boolean(dialog?.fields_dict?.include_filters),
			applied: Object.keys(frappe.query_report.get_applied_filters(
				frappe.query_report.get_filter_values()
			)).length,
		};
	});
	assert(exportState.fileFormat && exportState.includeFilters && exportState.applied > 0,
		"native export dialog lost file format or active-filter payload controls");
	await page.evaluate(() => frappe.query_report.export_dialog.hide());
	console.log(`PASS native export dialog (${exportState.applied} applied filters)`);

	if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
} finally {
	await close();
	if (reportLanguage) {
		benchJson(
			`user = ${JSON.stringify(reportUser)}\n` +
			`frappe.db.set_value('User', user, 'language', ${JSON.stringify(previousLanguage)})\n` +
			"frappe.clear_cache(user=user)\n" +
			"frappe.db.commit()\n" +
			"print(json.dumps(True))\n"
		);
	}
	setSettings(previous);
}
