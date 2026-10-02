// Render the managed Customer Statement with live General Ledger data through
// Frappe's own report controller and JavaScript microtemplate engine.
//
// This is intentionally read only: the report controller fetches data, the
// custom format is rendered in the browser, and Playwright prints that HTML.
import {mkdirSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";

import {benchJson, benchPy, openDesk, URL_BASE} from "./session.mjs";

const output = resolve(
	process.env.BND_STATEMENT_PDF_OUTPUT || "artifacts/customer-statement-pdfs-20260919"
);
const printFormat = "بنود - كشف حساب عميل";
const customer = process.env.BND_STATEMENT_CUSTOMER || "Bunood Acceptance Customer RC20A";
const company = process.env.BND_STATEMENT_COMPANY || "Bunood Development";
const fromDate = process.env.BND_STATEMENT_FROM || "2026-09-01";
const toDate = process.env.BND_STATEMENT_TO || "2026-09-19";

mkdirSync(output, {recursive: true});

const evidence = {};
const originalLanguage = benchJson(
	`print(json.dumps(frappe.db.get_value("User", "Administrator", "language") or ""))\n`
);

function setUserLanguage(language) {
	benchPy(
		`language = json.loads(${JSON.stringify(JSON.stringify(language))})\n` +
		`frappe.db.set_value("User", "Administrator", "language", language or None, update_modified=False)\n` +
		`frappe.db.commit()\n` +
		`frappe.cache.hdel("bootinfo", "Administrator")\n` +
		`frappe.clear_cache(user="Administrator")\n` +
		`print("ok")\n`
	);
}

try {
	for (const language of ["en", "ar"]) {
		setUserLanguage(language);
		const {page, errors, close} = await openDesk({width: 1440, height: 1000});
		try {
		const params = new URLSearchParams({
			_lang: language,
			company,
			from_date: fromDate,
			to_date: toDate,
			party_type: "Customer",
			party: customer,
			categorize_by: "Categorize by Voucher (Consolidated)",
			include_dimensions: "1",
			include_default_book_entries: "1",
		});
		await page.goto(`${URL_BASE}/desk/query-report/General%20Ledger?${params}`, {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});
		await page.waitForFunction(
			() => window.frappe?.query_report?.data?.length > 0,
			undefined,
			{timeout: 60000}
		);

		const rendered = await page.evaluate(async ({formatName}) => {
			const report = frappe.query_report;
			const printSettings = {
				orientation: "Portrait",
				print_format: formatName,
				report: report.report_name,
				with_letter_head: 0,
				include_filters: 0,
			};
			const customFormat = await report.get_report_print_format(formatName);
			if (!customFormat) throw new Error(`Missing report print format: ${formatName}`);
			const columns = report.get_columns_for_print(printSettings, customFormat);
			const data = report.get_data_for_print();
			const filters = report.get_filter_values();
			const template = report.get_print_template(printSettings, customFormat);
			const html = frappe.render_template(template, {
				title: __(report.report_name),
				subtitle: null,
				filters,
				data,
				original_data: report.data,
				columns,
				report,
				print_settings: printSettings,
			});
			return {
				html,
				language: frappe.boot.lang,
				filters,
				row_count: data.length,
				rows: data.map((row) => ({
					posting_date: row.posting_date || null,
					voucher_type: row.voucher_type || null,
					voucher_no: row.voucher_no || null,
					account: row.account || null,
					debit: row.debit || 0,
					credit: row.credit || 0,
					balance: row.balance ?? null,
				})),
			};
		}, {formatName: printFormat});

		if (!rendered.language.toLowerCase().startsWith(language)) {
			throw new Error(`Requested ${language}; Frappe booted ${rendered.language}`);
		}
		if (!rendered.filters.party_type || !rendered.filters.party?.length) {
			throw new Error("Customer filters were not applied to the live General Ledger");
		}
		if (rendered.row_count < 5) {
			throw new Error(`Expected statement activity and totals; got ${rendered.row_count} rows`);
		}

		const direction = language === "ar" ? "rtl" : "ltr";
		const documentHtml = `<!doctype html><html lang="${language}" dir="${direction}"><head>` +
			`<meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}` +
			`body{padding:12mm;box-sizing:border-box}</style></head><body>${rendered.html}</body></html>`;
		const slug = `customer-statement-a4-${language}`;
		writeFileSync(join(output, `${slug}.html`), documentHtml, "utf8");

		const printPage = await page.context().newPage();
		await printPage.setViewportSize({width: 794, height: 1123});
		await printPage.setContent(documentHtml, {waitUntil: "load"});
		await printPage.emulateMedia({media: "print"});
		const statement = printPage.locator(".bnd-statement");
		if ((await statement.getAttribute("lang")) !== language) {
			throw new Error(`${slug}: wrong lang attribute`);
		}
		if ((await statement.getAttribute("dir")) !== direction) {
			throw new Error(`${slug}: wrong dir attribute`);
		}
		const labels = await printPage.locator(".bnd-statement h1, .bnd-statement th, .bnd-statement strong")
			.allTextContents();
		const text = await statement.innerText();
		if (/^'|'$/m.test(text)) throw new Error(`${slug}: quoted summary label rendered`);
		const hasArabic = (value) => /[\u0600-\u06ff]/.test(value);
		for (const label of labels.map((value) => value.trim()).filter(Boolean)) {
			if (hasArabic(label) !== (language === "ar")) {
				throw new Error(`${slug}: mixed static-label language: ${label}`);
			}
		}
		if (!text.includes(customer)) throw new Error(`${slug}: customer identity missing`);
		for (const voucher of ["ACC-SINV-2026-00001", "ACC-PAY-2026-00001", "ACC-SINV-2026-00002"]) {
			if (!text.includes(voucher)) throw new Error(`${slug}: missing ${voucher}`);
		}
		const bodyRows = await printPage.locator(".bnd-statement__table tbody tr").count();
		if (bodyRows !== rendered.row_count) {
			throw new Error(`${slug}: rendered ${bodyRows} rows from ${rendered.row_count}`);
		}

		await printPage.pdf({
			path: join(output, `${slug}.pdf`),
			format: "A4",
			printBackground: true,
			preferCSSPageSize: true,
			margin: {top: "0", right: "0", bottom: "0", left: "0"},
		});
		await printPage.screenshot({path: join(output, `${slug}.png`), fullPage: true});
		await printPage.close();

		evidence[language] = {
			language: rendered.language,
			direction,
			customer,
			company,
			from_date: fromDate,
			to_date: toDate,
			row_count: rendered.row_count,
			body_rows: bodyRows,
			labels,
			rows: rendered.rows,
			console_errors: errors,
		};
		if (errors.length) throw new Error(`${slug}: browser errors: ${errors.join(" | ")}`);
		console.log(`${slug}: ${rendered.row_count} live rows, ${labels.length} labels, no browser errors`);
		} finally {
			await close();
		}
	}
} finally {
	setUserLanguage(originalLanguage);
}

writeFileSync(
	join(output, "customer-statement-verification.json"),
	JSON.stringify(evidence, null, 2),
	"utf8"
);
