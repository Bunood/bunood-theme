/**
 * Compare Studio's visible register totals with ERPNext's native query-report
 * results for the pilot's busiest submitted-invoice month. Read-only: no
 * document, fixture, language or Theme Settings writes.
 */
import assert from "node:assert/strict";
import { benchJson, goto, openDesk } from "./session.mjs";

const expected = benchJson([
	"frappe.set_user('Administrator')",
	"from frappe.desk.query_report import run",
	"import calendar",
	"row = frappe.db.sql(\"select year(posting_date), month(posting_date), count(*) c from `tabSales Invoice` where docstatus=1 group by 1, 2 order by c desc, 1 desc, 2 desc limit 1\")",
	"if not row: raise RuntimeError('No submitted sales-invoice month is available for parity testing')",
	"year, month = row[0][:2]",
	"first = f'{year:04d}-{month:02d}-01'",
	"last = f'{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}'",
	"company = 'Bunood Development'",
	"def totals(name, tax_field):",
	"    result = run(name, filters={'company': company, 'from_date': first, 'to_date': last}, ignore_prepared_report=True)",
	"    body = [r for r in result['result'] if isinstance(r, dict) and r.get('posting_date')]",
	"    fields = ['grand_total', 'net_total', tax_field, 'outstanding_amount']",
	"    return {'values': [round(sum(float(r.get(f) or 0) for r in body), 2) for f in fields], 'rows': len(body)}",
	"vat = run('VAT Summary', filters={'company': company, 'from_date': first, 'to_date': last}, ignore_prepared_report=True)",
	"vat_tiles = [round(float(s['value']), 2) for s in vat.get('report_summary', []) if s and s.get('value') is not None]",
	"tax_gl = float(frappe.db.sql(\"select coalesce(sum(g.credit-g.debit),0) from `tabGL Entry` g join `tabAccount` a on a.name=g.account where g.company=%s and g.is_cancelled=0 and a.account_type='Tax' and a.is_group=0 and g.posting_date between %s and %s\", (company, first, last))[0][0])",
	"print(json.dumps({'from': first, 'to': last, 'sales': totals('Sales Register', 'tax_total'), 'purchases': totals('Purchase Register', 'total_tax'), 'vat': vat_tiles, 'tax_gl': round(tax_gl, 2)}, default=str))",
].join("\n") + "\n");

function parseMoney(value) {
	const arabic = "٠١٢٣٤٥٦٧٨٩";
	const normalized = String(value).replace(/[٠-٩]/g, digit => String(arabic.indexOf(digit)))
		.replace(/٫/g, ".").replace(/٬/g, ",");
	const parsed = Number(normalized.replace(/[^0-9.\-]/g, ""));
	assert.ok(Number.isFinite(parsed), `Cannot parse Studio amount: ${value}`);
	return parsed;
}

const desk = await openDesk({ width: 1440, height: 960 });
try {
	for (const [key, values] of [["sales-register", expected.sales], ["purchase-register", expected.purchases]]) {
		await goto(desk.page, `/desk/bnd-report-studio/${key}`, ".bnd-studio--viewer-open", { settle: 500 });
		const customLabel = await desk.page.evaluate(() => __("Custom Period"));
		await desk.page.locator(".bnd-studio__chips .bnd-studio__chip").filter({ hasText: customLabel }).click();
		await desk.page.waitForFunction(() => window.cur_dialog?.$wrapper?.is(":visible"));
		await desk.page.evaluate(async ({ from, to }) => {
			await cur_dialog.set_value("from", from);
			await cur_dialog.set_value("to", to);
			cur_dialog.get_primary_btn().trigger("click");
		}, { from: expected.from, to: expected.to });
		await desk.page.waitForFunction(() => !document.querySelector(".modal.show"));
		await desk.page.waitForFunction(() => {
			const viewer = document.querySelector(".bnd-studio--viewer-open");
			return viewer?.getAttribute("aria-busy") !== "true" &&
				viewer.querySelectorAll(".bnd-studio__kpi:not(.is-skeleton)").length >= 5;
		}, null, { timeout: 120000 });
		const result = await desk.page.evaluate(() => ({
			error: document.querySelector(".bnd-studio__error")?.textContent?.trim() || "",
			kpis: [...document.querySelectorAll(".bnd-studio__kpi:not(.is-skeleton) .bnd-studio__kpi-value")]
				.map(node => node.textContent.trim()),
		}));
		assert.equal(result.error, "", `${key}: Studio returned an error`);
		assert.ok(result.kpis.length >= 5, `${key}: expected four financial tiles and a row count`);
		for (let index = 0; index < 4; index++) {
			const actual = parseMoney(result.kpis[index]);
			assert.ok(Math.abs(actual - values.values[index]) < 0.011,
				`${key} tile ${index}: displayed ${actual}, native report ${values.values[index]}`);
		}
		assert.equal(parseMoney(result.kpis.at(-1)), values.rows, `${key}: visible row count`);
	}
	assert.ok(expected.vat.length >= 5, `VAT Summary returned ${expected.vat.length} financial tiles`);
	assert.ok(Math.abs(expected.vat[3] - expected.tax_gl) < 0.011,
		`native VAT ledger tile ${expected.vat[3]} differs from posted tax GL ${expected.tax_gl}`);
	await goto(desk.page, "/desk/bnd-report-studio/vat-return", ".bnd-studio--viewer-open", { settle: 500 });
	const customLabel = await desk.page.evaluate(() => __("Custom Period"));
	await desk.page.locator(".bnd-studio__chips .bnd-studio__chip").filter({ hasText: customLabel }).click();
	await desk.page.waitForFunction(() => window.cur_dialog?.$wrapper?.is(":visible"));
	await desk.page.evaluate(async ({ from, to }) => {
		await cur_dialog.set_value("from", from);
		await cur_dialog.set_value("to", to);
		cur_dialog.get_primary_btn().trigger("click");
	}, { from: expected.from, to: expected.to });
	await desk.page.waitForFunction(() => !document.querySelector(".modal.show"));
	await desk.page.waitForFunction(() => {
		const viewer = document.querySelector(".bnd-studio--viewer-open");
		return viewer?.getAttribute("aria-busy") !== "true" &&
			viewer.querySelectorAll(".bnd-studio__kpi:not(.is-skeleton)").length >= 5;
	}, null, { timeout: 120000 });
	const vatValues = await desk.page.locator(".bnd-studio__kpi:not(.is-skeleton) .bnd-studio__kpi-value").allTextContents();
	for (let index = 0; index < 5; index++) {
		assert.ok(Math.abs(parseMoney(vatValues[index]) - expected.vat[index]) < 0.011,
			`VAT tile ${index}: Studio ${vatValues[index]}, native ${expected.vat[index]}`);
	}
	assert.deepEqual(desk.errors, [], `browser errors: ${desk.errors.join(" | ")}`);
	console.log(`PASS Studio/native register and VAT-ledger parity for ${expected.from} through ${expected.to}`);
} finally {
	await desk.close();
}
