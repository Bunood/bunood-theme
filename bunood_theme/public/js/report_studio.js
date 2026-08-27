// Copyright (c) 2026, Bunood and contributors
// ============================================================================
// THE REPORT STUDIO — a reading room for the numbers.
//
// WHAT
//   A curated, bilingual presentation layer over the system's own query
//   reports: a gallery of the reports that matter per domain (selling first;
//   buying and accounting arrive as their phases close), and a viewer that
//   turns any of them into KPI tiles with previous-period deltas, one honest
//   chart, and a table cut down to the columns a human actually reads.
//
// WHAT IT IS NOT
//   Not a reporting engine. Every number on this surface comes from
//   frappe.desk.query_report.run — the same server code, the same permission
//   checks, the same translated column labels the classic view gets. This file
//   only decides HOW that answer is shown. Delete it and nothing is lost but
//   the presentation.
//
// BILINGUAL BY CONSTRUCTION
//   Column labels and report names arrive from the server already in the
//   user's language (the site's Translation layer serves them). The studio's
//   own chrome goes through __() with English sources, so an Arabic user reads
//   Arabic and an English user reads English from the same build. Layout is
//   direction-blind: DOM order plus the logical-properties-only stylesheet
//   (_studio.scss) serve LTR and RTL from one sheet.
//
// DESIGN CONTRACT (see _studio.scss)
//   All colour, spacing, radius and motion come from --bnd-* tokens. This file
//   reads chart colours FROM the computed tokens rather than shipping hex, so
//   a tenant's brand.py reskin recolours the studio for free — dark mode too.
// ============================================================================

/* eslint-env browser */
/* global frappe, __ */

(function () {
	"use strict";

	// ── Domain and report curation ──────────────────────────────────────────
	// `cat` picks one of the theme's categorical tints (--bnd-cat-0..7) so the
	// gallery reads as a set, not a repetition. `hints` steer the generic
	// engine where a report's shape deserves better than detection; everything
	// still works with no hints at all, which is what phases 2 and 3 rely on.
	const DOMAINS = [
		{
			id: "sales",
			label: () => __("Selling"),
			reports: [
				{
					name: "Sales Register",
					title: () => __("Sales Register"),
					cat: 0,
					desc: () => __("Every submitted sales invoice with its taxes, party and totals"),
					hints: {
						date: "posting_date",
						topn: { by: "customer", value: "grand_total" },
						kpis: ["grand_total", "net_total", "tax_total", "outstanding_amount"],
						columns: ["posting_date", "voucher_no", "customer", "net_total", "tax_total",
							"grand_total", "outstanding_amount", "mode_of_payment", "territory"],
					},
				},
				{
					name: "Item-wise Sales Register",
					title: () => __("Item-wise Sales Register"),
					cat: 1,
					desc: () => __("What was sold, item by item — quantities, rates and amounts"),
					hints: {
						date: "posting_date",
						topn: { by: "item_code", value: "amount" },
						kpis: ["total", "amount", "total_tax"],
						columns: ["posting_date", "invoice", "item_code", "item_name", "stock_qty",
							"rate", "amount", "total_tax", "total"],
					},
				},
				{
					name: "Gross Profit",
					title: () => __("Gross Profit"),
					cat: 2,
					desc: () => __("Selling value against buying cost, and the margin between them"),
					compose: "grossProfit",
					extra_filters: { group_by: "Item Code" },
					hints: {
						kpis: ["selling_amount", "buying_amount", "gross_profit"],
						topn: { by: "item_code", value: "gross_profit" },
						columns: ["item_code", "item_name", "qty", "avg._selling_rate", "valuation_rate",
							"selling_amount", "buying_amount", "gross_profit", "gross_profit_%"],
					},
				},
				{
					name: "Sales Register",
					key: "sales-returns",
					compose: "signSplit",
					split_labels: {
						gross: () => __("Gross Sales"),
						net: () => __("Net Sales"),
						row: () => __("Sale"),
					},
					title: () => __("Sales & Returns"),
					cat: 3,
					desc: () => __("Sales and returns in one place — gross, returned and net"),
					hints: {
						date: "posting_date",
						topn: { by: "customer", value: "grand_total" },
						columns: ["posting_date", "voucher_no", "customer", "net_total", "tax_total",
							"grand_total", "outstanding_amount", "mode_of_payment", "territory"],
					},
				},
				{
					name: "Sales Order Analysis",
					title: () => __("Sales Order Analysis"),
					cat: 4,
					desc: () => __("Open orders: what was promised, delivered and billed"),
					hints: {
						date: "date",
						topn: { by: "customer", value: "amount" },
						kpis: ["amount", "billed_amount", "pending_amount"],
						columns: ["date", "sales_order", "status", "customer", "item_code", "qty",
							"delivered_qty", "billed_qty", "amount", "billed_amount", "pending_amount"],
					},
				},
				{
					name: "Sales Person-wise Transaction Summary",
					title: () => __("Sales Person-wise Transaction Summary"),
					cat: 5,
					desc: () => __("Who sold what — contribution by sales person"),
					extra_filters: { doc_type: "Sales Invoice" },
					hints: { topn: { by: "sales_person" } },
				},
				{
					name: "Territory-wise Sales",
					title: () => __("Territory-wise Sales"),
					cat: 6,
					desc: () => __("Opportunities, quotations and orders by sales territory"),
					hints: { topn: { by: "territory" } },
				},
			],
		},
		{
			id: "buying",
			label: () => __("Buying"),
			reports: [
				{
					name: "Purchase Register",
					title: () => __("Purchase Register"),
					cat: 0,
					desc: () => __("Every submitted purchase invoice with its taxes, supplier and totals"),
					hints: {
						date: "posting_date",
						topn: { by: "supplier_id", value: "grand_total" },
						kpis: ["grand_total", "net_total", "total_tax", "outstanding_amount"],
						columns: ["posting_date", "voucher_no", "supplier_id", "bill_no", "net_total",
							"total_tax", "grand_total", "outstanding_amount", "mode_of_payment"],
					},
				},
				{
					name: "Item-wise Purchase Register",
					title: () => __("Item-wise Purchase Register"),
					cat: 1,
					desc: () => __("What was bought, item by item — quantities, rates and amounts"),
					hints: {
						date: "posting_date",
						topn: { by: "item_code", value: "amount" },
						kpis: ["total", "amount", "total_tax"],
						columns: ["posting_date", "invoice", "item_code", "item_name", "stock_qty",
							"rate", "amount", "total_tax", "total"],
					},
				},
				{
					name: "Purchase Register",
					key: "purchases-returns",
					compose: "signSplit",
					split_labels: {
						gross: () => __("Gross Purchases"),
						net: () => __("Net Purchases"),
						row: () => __("Purchase"),
					},
					title: () => __("Purchases & Returns"),
					cat: 3,
					desc: () => __("Purchases and returns in one place — gross, returned and net"),
					hints: {
						date: "posting_date",
						topn: { by: "supplier_id", value: "grand_total" },
						columns: ["posting_date", "voucher_no", "supplier_id", "bill_no", "net_total",
							"total_tax", "grand_total", "outstanding_amount", "mode_of_payment"],
					},
				},
				{
					name: "Purchase Order Analysis",
					title: () => __("Purchase Order Analysis"),
					cat: 4,
					desc: () => __("Open purchase orders: ordered, received and billed"),
					hints: {
						date: "date",
						topn: { by: "supplier", value: "amount" },
						kpis: ["amount", "billed_amount", "pending_amount"],
						columns: ["date", "purchase_order", "status", "supplier", "item_code", "qty",
							"received_qty", "billed_qty", "amount", "billed_amount", "pending_amount"],
					},
				},
				{
					name: "Procurement Tracker",
					title: () => __("Procurement Tracker"),
					cat: 6,
					desc: () => __("From material request to delivery — the whole procurement trail"),
					hints: {
						date: "material_request_date",
						topn: { by: "supplier", value: "purchase_order_amt_in_company_currency" },
						kpis: ["estimated_cost", "actual_cost", "purchase_order_amt_in_company_currency"],
						columns: ["material_request_date", "material_request_no", "item_code", "quantity",
							"status", "purchase_order", "supplier", "purchase_order_amt_in_company_currency",
							"expected_delivery_date", "actual_delivery_date"],
					},
				},
				{
					name: "Supplier Ledger Summary",
					title: () => __("Supplier Ledger Summary"),
					cat: 5,
					desc: () => __("Supplier balances over the period — opening, movement and closing"),
					hints: {},
				},
			],
		},
		{
			id: "accounting",
			label: () => __("Accounting"),
			reports: [
				{
					name: "General Ledger",
					key: "account-statement",
					compose: "statement",
					picker: true,
					title: () => __("Statement of Account"),
					cat: 3,
					desc: () => __("Any customer, supplier, employee or ledger account — its full statement"),
					careful: true,
					extra_filters: { group_by: "Group by Voucher (Consolidated)" },
					hints: {
						noFooter: true,
						columns: ["posting_date", "voucher_type", "voucher_no", "against",
							"debit", "credit", "balance"],
					},
				},
				{
					// bunood_real_estate's worksheet: pure Decimal arithmetic, boxes read
					// from the stored ZATCA classification, and its own ledger check.
					// The studio only DRESSES it — tiles verbatim from report_summary.
					name: "VAT Summary",
					key: "vat-return",
					title: () => __("VAT Return"),
					cat: 2,
					desc: () => __("The ZATCA declaration, box by box — with the proof it can be filed"),
					careful: true,
					compose: "vatReturn",
					hints: {
						noFooter: true,
						columns: ["entry", "documents", "amount", "amount_vat", "adjustment",
							"adjustment_vat", "vat", "note"],
					},
				},
				{
					name: "General Ledger",
					title: () => __("General Ledger"),
					cat: 0,
					desc: () => __("Every posting in the books — debits, credits and the running balance"),
					careful: true,
					compose: "generalLedger",
					extra_filters: { group_by: "Group by Voucher (Consolidated)" },
					hints: {
						noFooter: true,
						columns: ["posting_date", "account", "party", "voucher_no", "against",
							"debit", "credit", "balance"],
					},
				},
				{
					name: "Accounts Receivable",
					title: () => __("Accounts Receivable"),
					cat: 4,
					desc: () => __("Who owes you, how much, and for how long — aged as of the period end"),
					careful: true,
					compose: "aging",
					filter_mode: "asOn",
					hints: {
						columns: ["posting_date", "party", "voucher_no", "due_date", "invoiced",
							"paid", "credit_note", "outstanding", "age"],
					},
				},
				{
					name: "Accounts Payable",
					title: () => __("Accounts Payable"),
					cat: 5,
					desc: () => __("Who you owe, how much, and for how long — aged as of the period end"),
					careful: true,
					compose: "aging",
					filter_mode: "asOn",
					hints: {
						columns: ["posting_date", "party", "voucher_no", "due_date", "invoiced",
							"paid", "credit_note", "outstanding", "age"],
					},
				},
				{
					name: "Trial Balance",
					title: () => __("Trial Balance"),
					cat: 2,
					desc: () => __("Every account's opening, movement and closing — and whether the books balance"),
					careful: true,
					compose: "trialBalance",
					filter_mode: "trialBalance",
					hints: { noFooter: true },
				},
				{
					name: "Profit and Loss Statement",
					title: () => __("Profit and Loss Statement"),
					cat: 1,
					desc: () => __("Income against expenses, and the profit between them"),
					careful: true,
					compose: "financialStatement",
					filter_mode: "dateRange",
					tree: true,
					hints: { noFooter: true, dropColumns: ["acc_name", "acc_number", "currency"] },
				},
				{
					name: "Balance Sheet",
					title: () => __("Balance Sheet"),
					cat: 6,
					desc: () => __("What the company owns and owes, as of the period end"),
					careful: true,
					compose: "financialStatement",
					filter_mode: "dateRange",
					tree: true,
					hints: { noFooter: true, dropColumns: ["acc_name", "acc_number", "currency"] },
				},
			],
		},
	];

	// Every report owns a stable route key, so an open card is a real history
	// entry: the browser's back steps INSIDE the studio instead of leaving it
	// (measured: history.back() from a card used to land on about:blank).
	for (const domain of DOMAINS) {
		for (const report of domain.reports) {
			report.key = report.key || report.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
			report.domain_id = domain.id;
		}
	}
	const ALL_REPORTS = DOMAINS.flatMap((domain) => domain.reports);

	const PERIODS = [
		{ id: "today", label: () => __("Today") },
		{ id: "week", label: () => __("This Week") },
		{ id: "month", label: () => __("This Month") },
		{ id: "quarter", label: () => __("This Quarter") },
		{ id: "year", label: () => __("This Year") },
		{ id: "custom", label: () => __("Custom") },
	];

	// ── Small utilities ─────────────────────────────────────────────────────

	const el = (tag, cls, text) => {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text != null) node.textContent = text;
		return node;
	};

	// Direction-aware arrows: "back" points toward the reading start, "go"
	// toward the reading end — hardcoding either glyph breaks one language.
	const isRtl = () => document.documentElement.dir === "rtl";
	const ARROW = { back: () => (isRtl() ? "→" : "←"), go: () => (isRtl() ? "←" : "→") };

	const cssVar = (name) =>
		getComputedStyle(document.documentElement).getPropertyValue(name).trim();

	const fmt = (value, column) => {
		// ERPNext's quoted-label convention ('الإجمالي') marks a row, not a value —
		// the marks never reach the reader.
		if (typeof value === "string" && /^'.*'$/.test(value.trim())) {
			value = value.trim().replace(/^'+|'+$/g, "");
		}
		try {
			return frappe.format(value, column, { inline: true });
		} catch (e) {
			return value == null ? "" : String(value);
		}
	};

	const fnum = (value, column) => {
		// Tile-sized formatting: currency keeps its symbol via frappe.format;
		// plain counts go through the locale number formatter.
		if (column && (column.fieldtype === "Currency" || column.fieldtype === "Float" || column.fieldtype === "Percent")) {
			return fmt(value, column);
		}
		try {
			return new Intl.NumberFormat(frappe.boot.lang || "en").format(value);
		} catch (e) {
			return String(value);
		}
	};

	const D = frappe.datetime;

	function periodRange(period, custom) {
		const today = D.get_today();
		switch (period) {
			case "today":
				return [today, today];
			case "week":
				return [D.week_start(), D.week_end()];
			case "quarter":
				return [D.quarter_start(), D.quarter_end()];
			case "year":
				return [D.year_start(), D.year_end()];
			case "custom":
				return [custom.from, custom.to];
			case "month":
			default:
				return [D.month_start(), D.month_end()];
		}
	}

	function previousRange(from, to) {
		const days = D.get_day_diff(to, from) + 1;
		const prevTo = D.add_days(from, -1);
		const prevFrom = D.add_days(prevTo, -(days - 1));
		return [prevFrom, prevTo];
	}

	// Column meaning, decided once per run.
	function classify(columns) {
		const seen = new Set();
		const meaningful = [];
		for (const raw of columns) {
			const col = typeof raw === "string" ? { label: raw, fieldname: frappe.scrub(raw) } : raw;
			if (!col.label || col.hidden) continue;
			const fieldname = col.fieldname || frappe.scrub(col.label);
			if (seen.has(fieldname)) continue;
			seen.add(fieldname);
			meaningful.push(Object.assign({}, col, { fieldname }));
		}
		const byType = (types) => meaningful.filter((c) => types.includes(c.fieldtype));
		return {
			all: meaningful,
			currency: byType(["Currency"]),
			numeric: byType(["Currency", "Float", "Int", "Percent"]),
			dates: byType(["Date", "Datetime"]),
			links: byType(["Link", "Dynamic Link"]),
		};
	}

	// Tax is a first-class figure on a ZATCA site: a column is "taxish" when
	// its fieldname or served label says so, in either language — including the
	// dynamic per-account columns a register emits (Output VAT - ...).
	const isTaxish = (col) => /tax|vat|ضريب/i.test(`${col.fieldname || ""} ${col.label || ""}`);

	function rowValue(row, column, index) {
		if (Array.isArray(row)) return row[index];
		return row[column.fieldname];
	}

	// The one column the studio treats as "the money": the hinted KPI first,
	// otherwise the currency column with the largest absolute sum — measured,
	// not assumed, because every report orders its amounts differently.
	function primaryColumn(shape, rows, hints) {
		if (hints && hints.kpis && hints.kpis.length) {
			const hinted = shape.all.find((c) => c.fieldname === hints.kpis[0]);
			if (hinted) return hinted;
		}
		let best = null;
		let bestSum = -1;
		for (const col of shape.currency) {
			const index = shape.all.indexOf(col);
			let sum = 0;
			for (const row of rows) sum += Math.abs(parseFloat(rowValue(row, col, index)) || 0);
			if (sum > bestSum) {
				bestSum = sum;
				best = col;
			}
		}
		return best || shape.numeric[0] || null;
	}

	function sumBy(rows, shape, col) {
		if (!col) return 0;
		const index = shape.all.indexOf(col);
		let total = 0;
		for (const row of rows) {
			if (isTotalRow(row, shape)) continue;
			total += parseFloat(rowValue(row, col, index)) || 0;
		}
		return total;
	}

	// Several registers append their own "Total" row; counting it would double
	// every KPI, so it is detected (first cell reads like a total, or the row
	// is flagged) and kept out of aggregation while still shown in the table.
	function isTotalRow(row, shape) {
		if (!Array.isArray(row) && row && row.is_total_row) return true;
		const first = rowValue(row, shape.all[0], 0);
		if (typeof first === "string" && /^'?(Total|الإجمالي)/.test(first.trim())) return true;
		return false;
	}

	// ERPNext quotes every LABELED row ('افتتاحي', 'الإجمالي', 'الربح السنوي'):
	// the quote is the report engine's own marker, so it is the one we trust.
	// An empty object is a spacer; an Array inside a dict-shaped report is the
	// grand-total row the aging reports append. None of these is data, and in
	// the accounting phase none of them may ever enter an aggregate.
	function labeledText(row, shape) {
		const first = rowValue(row, shape.all[0], 0);
		if (typeof first === "string" && first.trim().startsWith("'")) return first.trim();
		for (const col of ["account", "account_name", "party"]) {
			const v = !Array.isArray(row) && row ? row[col] : null;
			if (typeof v === "string" && v.trim().startsWith("'")) return v.trim();
		}
		return null;
	}

	function isSpacerRow(row) {
		return !Array.isArray(row) && row && Object.keys(row).length === 0;
	}

	function isLabeledRow(row, shape) {
		return labeledText(row, shape) != null;
	}

	// ── The engine ──────────────────────────────────────────────────────────

	function runReport(reportName, filters) {
		return frappe
			.call({
				method: "frappe.desk.query_report.run",
				type: "GET",
				// silent: بعض التقارير ترسل msgprint («لم يتم العثور على أي سجل»)
				// مع فترةٍ فارغة — خاصة جولة الفترة السابقة الصامتة — فيعلو Modal
				// يحجب الاستوديو كله. حالات العرض عندنا (فارغ/خطأ) هي المتحدث الوحيد.
				silent: true,
				args: {
					report_name: reportName,
					filters: JSON.stringify(filters),
					ignore_prepared_report: true,
					are_default_filters: false,
				},
			})
			.then((r) => r.message || { columns: [], result: [] });
	}

	function buildFilters(report, state) {
		const [from, to] = periodRange(state.period, state.custom);
		let base;
		switch (report.filter_mode) {
			case "asOn":
				// Aged-balance reports answer one question: the position AS OF a
				// date. The period chip's END is that date; the start plays no part.
				base = { company: state.company, report_date: to,
					ageing_based_on: "Due Date", range: "30, 60, 90, 120" };
				break;
			case "dateRange":
				base = { company: state.company, filter_based_on: "Date Range",
					period_start_date: from, period_end_date: to, periodicity: "Yearly" };
				break;
			case "trialBalance":
				base = { company: state.company, from_date: from, to_date: to,
					fiscal_year: String(new Date(to).getFullYear()),
					with_period_closing_entry_for_opening: 1,
					with_period_closing_entry_for_current_period: 1 };
				break;
			default:
				base = { company: state.company, from_date: from, to_date: to };
		}
		const filters = Object.assign(base, report.extra_filters || {});
		if (report.picker && state_entity_of(report)) {
			const entity = state_entity_of(report);
			if (entity.party_type) {
				filters.party_type = entity.party_type;
				filters.party = [entity.name];
			} else {
				filters.account = [entity.name];
			}
		}
		return { filters, from, to };
	}

	// يقرأ الكيان من حالة الصفحة — يُربط عند التركيب لأن buildFilters خارج الإغلاق.
	let state_entity_of = () => null;

	function aggregate(data, report) {
		const shape = classify(data.columns || []);
		const rows = (data.result || []).filter((row) => row && (Array.isArray(row) ? row.length : true));
		const dictShaped = rows.some((r) => !Array.isArray(r) && !isSpacerRow(r));
		const bodyRows = rows.filter((row) =>
			!isTotalRow(row, shape) &&
			!isSpacerRow(row) &&
			!isLabeledRow(row, shape) &&
			!(dictShaped && Array.isArray(row)));
		const primary = primaryColumn(shape, bodyRows, report.hints);

		// Careful mode: an accounting report's numbers are NEVER summed by a
		// heuristic — a tree would double-count and a running balance means
		// nothing summed. Tiles come only from a composer reading the report's
		// own labeled rows or its report_summary.
		if (report.careful) {
			return {
				shape, rows, bodyRows, primary,
				kpis: [], series: null, topn: null,
				reportSummary: data.report_summary || null,
				message: typeof data.message === "string" ? data.message : null,
			};
		}

		// KPI set: hinted fieldnames, else the strongest currency columns.
		let kpiCols = [];
		if (report.hints && report.hints.kpis) {
			kpiCols = report.hints.kpis
				.map((fieldname) => shape.all.find((c) => c.fieldname === fieldname))
				.filter(Boolean);
		}
		if (!kpiCols.length) {
			// rounded_total is grand_total restated — a tile that repeats a tile.
			kpiCols = shape.currency
				.filter((col) => col.fieldname !== "rounded_total")
				.map((col) => ({ col, sum: Math.abs(sumBy(bodyRows, shape, col)) }))
				.sort((a, b) => b.sum - a.sum)
				.slice(0, 3)
				.map((x) => x.col);
			if (!kpiCols.some(isTaxish)) {
				const tax = shape.currency.find((col) => isTaxish(col) && !kpiCols.includes(col));
				if (tax) kpiCols.push(tax);
			}
		}
		const kpis = kpiCols.map((col) => ({ column: col, value: sumBy(bodyRows, shape, col) }));

		// Time series against the hinted/first date column.
		const dateField = report.hints && report.hints.date;
		const dateCol =
			(dateField && shape.all.find((c) => c.fieldname === dateField)) || shape.dates[0] || null;
		let series = null;
		if (dateCol && primary && bodyRows.length) {
			const dateIndex = shape.all.indexOf(dateCol);
			const primaryIndex = shape.all.indexOf(primary);
			const buckets = new Map();
			for (const row of bodyRows) {
				const raw = rowValue(row, dateCol, dateIndex);
				if (!raw) continue;
				const day = String(raw).slice(0, 10);
				buckets.set(day, (buckets.get(day) || 0) + (parseFloat(rowValue(row, primary, primaryIndex)) || 0));
			}
			const days = Array.from(buckets.keys()).sort();
			if (days.length > 1) {
				series = { labels: days, values: days.map((d) => buckets.get(d)) };
			}
		}

		// Top-N against the hinted/most-plausible grouping column.
		let topn = null;
		const groupHint = report.hints && report.hints.topn;
		const groupCol =
			(groupHint && shape.all.find((c) => c.fieldname === groupHint.by)) ||
			shape.links.find((c) => ["Customer", "Item", "Territory", "Sales Person", "Supplier"].includes(c.options)) ||
			null;
		const valueCol =
			(groupHint && groupHint.value && shape.all.find((c) => c.fieldname === groupHint.value)) || primary;
		if (groupCol && valueCol && bodyRows.length) {
			const groupIndex = shape.all.indexOf(groupCol);
			const valueIndex = shape.all.indexOf(valueCol);
			const sums = new Map();
			for (const row of bodyRows) {
				const key = rowValue(row, groupCol, groupIndex);
				if (!key) continue;
				sums.set(key, (sums.get(key) || 0) + (parseFloat(rowValue(row, valueCol, valueIndex)) || 0));
			}
			const ranked = Array.from(sums.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
			if (ranked.length > 1) {
				topn = { column: groupCol, value: valueCol, entries: ranked.slice(0, 8) };
			}
		}

		return { shape, rows, bodyRows, primary, kpis, series, topn,
			reportSummary: data.report_summary || null };
	}

	// ── Composers ───────────────────────────────────────────────────────────
	// A compose step reshapes a generic aggregation for a curated reading.
	// They attach customTiles / extraTiles / customSeries / note; the renderers
	// prefer those when present and fall back to the generic shapes when not.

	function composeSignSplit(agg, prevAgg, report) {
		const labels = report.split_labels;
		const build = (a) => {
			if (!a) return null;
			const shape = a.shape;
			const grand = shape.all.find((c) => c.fieldname === "grand_total") || a.primary;
			// Sales Register says tax_total; Purchase Register says total_tax —
			// measured, not assumed. Any remaining taxish currency column closes
			// the gap for reports this composer meets later.
			const tax =
				shape.all.find((c) => c.fieldname === "tax_total") ||
				shape.all.find((c) => c.fieldname === "total_tax") ||
				shape.currency.find(isTaxish);
			const gi = shape.all.indexOf(grand);
			const ti = tax ? shape.all.indexOf(tax) : -1;
			let sales = 0;
			let returns = 0;
			let netTax = 0;
			for (const row of a.bodyRows) {
				const g = parseFloat(rowValue(row, grand, gi)) || 0;
				if (g >= 0) sales += g;
				else returns += -g;
				if (tax) netTax += parseFloat(rowValue(row, tax, ti)) || 0;
			}
			return { grand, tax, sales, returns, net: sales - returns, netTax };
		};
		const now = build(agg);
		const prev = build(prevAgg);
		agg.kindColumn = now.grand;
		agg.customTiles = [
			{ label: labels.gross(), value: now.sales, column: now.grand, prev: prev && prev.sales },
			{ label: __("Returns"), value: now.returns, column: now.grand, prev: prev && prev.returns },
			{ label: labels.net(), value: now.net, column: now.grand, prev: prev && prev.net },
		];
		if (now.tax) {
			agg.customTiles.push({ label: __("Net Tax"), value: now.netTax, column: now.tax, prev: prev && prev.netTax });
		}
		// Two honest lines over the period: what went out, and what came back.
		const dateCol = agg.shape.dates[0];
		if (dateCol && agg.bodyRows.length) {
			const di = agg.shape.all.indexOf(dateCol);
			const gi2 = agg.shape.all.indexOf(now.grand);
			const days = new Map();
			for (const row of agg.bodyRows) {
				const raw = rowValue(row, dateCol, di);
				if (!raw) continue;
				const day = String(raw).slice(0, 10);
				const g = parseFloat(rowValue(row, now.grand, gi2)) || 0;
				const bucket = days.get(day) || { sales: 0, returns: 0 };
				if (g >= 0) bucket.sales += g;
				else bucket.returns += -g;
				days.set(day, bucket);
			}
			const dayKeys = Array.from(days.keys()).sort();
			if (dayKeys.length > 1) {
				agg.customSeries = {
					labels: dayKeys,
					value_column: now.grand,
					datasets: [
						{ name: labels.gross(), values: dayKeys.map((d) => days.get(d).sales) },
						{ name: __("Returns"), values: dayKeys.map((d) => days.get(d).returns) },
					],
				};
			}
		}
	}

	function composeGrossProfit(agg, prevAgg) {
		const margin = (a) => {
			if (!a) return null;
			const shape = a.shape;
			const selling = shape.all.find((c) => c.fieldname === "selling_amount");
			const profit = shape.all.find((c) => c.fieldname === "gross_profit");
			if (!selling || !profit) return null;
			const s = sumBy(a.bodyRows, shape, selling);
			const p = sumBy(a.bodyRows, shape, profit);
			return s ? (p / s) * 100 : null;
		};
		const now = margin(agg);
		if (now != null) {
			agg.extraTiles = [{
				label: __("Margin %"),
				value: now,
				column: { fieldtype: "Percent" },
				prev: margin(prevAgg),
			}];
		}
		agg.note = __("Selling value is net of VAT — the profit is measured before tax, and the margin is profit over net selling.");
	}

	// نصٌّ موسوم منزوع الاقتباس، للعرض والمطابقة
	const unquote = (s) => String(s == null ? "" : s).trim().replace(/^'+|'+$/g, "");

	function labeledRowByText(agg, needles) {
		for (const row of agg.rows) {
			const text = labeledText(row, agg.shape);
			if (!text) continue;
			const clean = unquote(text);
			if (needles.some((n) => clean.includes(n))) return row;
		}
		return null;
	}

	function composeGeneralLedger(agg, prevAgg) {
		const shape = agg.shape;
		const debit = shape.all.find((c) => c.fieldname === "debit");
		const credit = shape.all.find((c) => c.fieldname === "credit");
		if (!debit || !credit) return;
		// الإجماليان يُقرآن من صفّ 'الإجمالي' الموسوم — صفّ التقرير نفسه لا جمعنا.
		const pick = (a) => {
			if (!a) return null;
			const total = labeledRowByText(a, ["الإجمالي", "Total"]);
			if (!total) return null;
			return {
				debit: parseFloat(total.debit) || 0,
				credit: parseFloat(total.credit) || 0,
			};
		};
		const now = pick(agg);
		if (!now) return;
		const prev = pick(prevAgg);
		agg.customTiles = [
			{ label: __("Total Debit"), value: now.debit, column: debit, prev: prev && prev.debit },
			{ label: __("Total Credit"), value: now.credit, column: credit, prev: prev && prev.credit },
			{ label: __("Net Movement"), value: now.debit - now.credit, column: debit,
				prev: prev && prev.debit - prev.credit },
		];
		// حركة يومية مدين/دائن من صفوف البيانات وحدها
		const dateCol = shape.all.find((c) => c.fieldname === "posting_date");
		if (dateCol && agg.bodyRows.length) {
			const days = new Map();
			for (const row of agg.bodyRows) {
				const raw = row.posting_date;
				if (!raw) continue;
				const day = String(raw).slice(0, 10);
				const bucket = days.get(day) || { debit: 0, credit: 0 };
				bucket.debit += parseFloat(row.debit) || 0;
				bucket.credit += parseFloat(row.credit) || 0;
				days.set(day, bucket);
			}
			const dayKeys = Array.from(days.keys()).sort();
			if (dayKeys.length > 1) {
				agg.customSeries = {
					labels: dayKeys,
					value_column: debit,
					datasets: [
						{ name: debit.label, values: dayKeys.map((d) => days.get(d).debit) },
						{ name: credit.label, values: dayKeys.map((d) => days.get(d).credit) },
					],
				};
			}
		}
	}

	function composeTrialBalance(agg, prevAgg) {
		const shape = agg.shape;
		const col = (fn) => shape.all.find((c) => c.fieldname === fn);
		const pick = (a) => {
			if (!a) return null;
			const total = labeledRowByText(a, ["الإجمالي", "Total"]);
			if (!total) return null;
			return {
				debit: parseFloat(total.debit) || 0,
				credit: parseFloat(total.credit) || 0,
				closing_debit: parseFloat(total.closing_debit) || 0,
				closing_credit: parseFloat(total.closing_credit) || 0,
			};
		};
		const now = pick(agg);
		if (!now) return;
		const prev = pick(prevAgg);
		const balanced = Math.abs(now.debit - now.credit) < 0.005;
		agg.customTiles = [
			{ label: __("Total Debit"), value: now.debit, column: col("debit"), prev: prev && prev.debit },
			{ label: __("Total Credit"), value: now.credit, column: col("credit"), prev: prev && prev.credit },
			{
				label: __("Balance Check"), column: { fieldtype: "Data" },
				text: balanced ? __("Balanced") : __("Out of balance"),
				state: balanced ? "good" : "bad",
			},
		];
	}

	function composeAging(agg, prevAgg) {
		const shape = agg.shape;
		const index = (fn) => shape.all.findIndex((c) => c.fieldname === fn);
		// صفّ الإجماليات في تقارير الأعمار مصفوفة يلحقها التقرير — تُقرأ بالفهرس.
		const pick = (a) => {
			if (!a) return null;
			const total = a.rows.find((r) => Array.isArray(r));
			if (!total) return null;
			const at = (fn) => {
				const i = index(fn);
				return i >= 0 ? parseFloat(total[i]) || 0 : 0;
			};
			return {
				invoiced: at("invoiced"), paid: at("paid"), outstanding: at("outstanding"),
				buckets: ["range0", "range1", "range2", "range3", "range4", "range5"]
					.map((fn) => ({ column: shape.all[index(fn)], value: at(fn) }))
					.filter((b) => b.column),
			};
		};
		const now = pick(agg);
		if (!now) return;
		const prev = pick(prevAgg);
		const money = shape.all[index("outstanding")] || agg.primary;
		agg.customTiles = [
			{ label: shape.all[index("invoiced")] ? shape.all[index("invoiced")].label : __("Total"),
				value: now.invoiced, column: money, prev: prev && prev.invoiced },
			{ label: shape.all[index("paid")] ? shape.all[index("paid")].label : __("Total"),
				value: now.paid, column: money, prev: prev && prev.paid },
			{ label: money.label, value: now.outstanding, column: money, prev: prev && prev.outstanding },
		];
		if (now.buckets.some((b) => b.value)) {
			agg.customSeries = {
				labels: now.buckets.map((b) => b.column.label),
				value_column: money,
				categorical: true,
				datasets: [{ name: money.label, values: now.buckets.map((b) => b.value) }],
			};
		}
	}

	function composeStatement(agg, prevAgg) {
		const shape = agg.shape;
		const col = (fn) => shape.all.find((c) => c.fieldname === fn);
		const pick = (a) => {
			if (!a) return null;
			const rowOf = (needles) => labeledRowByText(a, needles);
			const opening = rowOf(["افتتاحي", "Opening"]);
			const totals = rowOf(["الإجمالي", "Total"]);
			const closing = rowOf(["الإغلاق", "الختامي", "Closing"]);
			const bal = (row) => row ? (parseFloat(row.debit) || 0) - (parseFloat(row.credit) || 0) : null;
			return {
				opening: bal(opening),
				debit: totals ? parseFloat(totals.debit) || 0 : null,
				credit: totals ? parseFloat(totals.credit) || 0 : null,
				closing: bal(closing),
			};
		};
		const now = pick(agg);
		if (!now || now.closing == null) return;
		const prev = pick(prevAgg);
		const money = col("debit");
		agg.customTiles = [
			{ label: __("Opening Balance"), value: now.opening || 0, column: money },
			{ label: __("Total Debit"), value: now.debit || 0, column: money, prev: prev && prev.debit },
			{ label: __("Total Credit"), value: now.credit || 0, column: col("credit"), prev: prev && prev.credit },
			{ label: __("Closing Balance"), value: now.closing, column: money, prev: prev && prev.closing },
		];
		// منحنى الرصيد: آخر رصيد كل يوم — خطاً لا أعمدة
		const balCol = col("balance");
		if (balCol && agg.bodyRows.length) {
			const days = new Map();
			for (const row of agg.bodyRows) {
				if (!row.posting_date) continue;
				days.set(String(row.posting_date).slice(0, 10), parseFloat(row.balance) || 0);
			}
			const dayKeys = Array.from(days.keys()).sort();
			if (dayKeys.length > 1) {
				agg.customSeries = {
					labels: dayKeys,
					value_column: balCol,
					chartType: "line",
					datasets: [{ name: balCol.label, values: dayKeys.map((d) => days.get(d)) }],
				};
			}
		}
	}

	function composeFinancialStatement(agg, prevAgg) {
		// بلاطات القوائم المالية من report_summary — حساب الخادم نفسه، حرفياً.
		const tiles = (summary) => (summary || [])
			.filter((s) => s && s.label != null && s.value != null)
			.map((s) => ({
				label: s.label,
				value: s.value,
				column: { fieldtype: s.datatype || "Currency", options: s.currency ? "currency" : undefined },
				indicator: s.indicator,
			}));
		const now = tiles(agg.reportSummary);
		if (!now.length) return;
		const prev = tiles(prevAgg && prevAgg.reportSummary);
		now.forEach((tile, i) => {
			if (prev[i] && prev[i].label === tile.label) tile.prev = prev[i].value;
		});
		agg.customTiles = now;
	}

	function composeVatReturn(agg, prevAgg) {
		// الإقرار الضريبي: كل رقم من حساب الخادم النقي — البلاطات من report_summary
		// حرفياً، والرسم مقارنة المخرجات/المدخلات/صافي الأستاذ (رقم التقديم)،
		// والملاحظة رسالة النطاق التي يصرّح بها التقرير (ما لا يقدَّر لا يُعرَض كصفر).
		composeFinancialStatement(agg, prevAgg);
		const tiles = agg.customTiles || [];
		// ترتيب البطاقات ثابت من التقرير: المخرجات، المدخلات، صافي الفواتير،
		// صافي الأستاذ، غير المصنف — صافيان عمداً وفجوتهما هي قيود اليومية.
		if (tiles.length === 5) {
			if (tiles[2].value < 0) tiles[2].state = "good";
			if (tiles[3].value < 0) tiles[3].state = "good";
			tiles[4].state = tiles[4].value > 0 ? "bad" : "good";
			const bars = [tiles[0], tiles[1], tiles[3]];
			agg.customSeries = {
				categorical: true,
				title: __("VAT Return"),
				labels: bars.map((tile) => String(tile.label)),
				value_column: tiles[0].column,
				datasets: [{
					name: tiles[3].label,
					values: bars.map((tile) => tile.value),
				}],
			};
		}
		agg.note = agg.message || null;
	}

	// ── Excel (xlsx) — built by hand, no library ────────────────────────────
	// A real Workbook: ZIP container (stored entries + CRC32), inline-string
	// worksheet, a styles part whose colours are READ FROM THE THEME TOKENS at
	// export time (brand reskin restyles the spreadsheet for free), and a real
	// Excel Table (ListObject) over the data — header filters, banded rows,
	// the "محكم" grid the owner asked for. Numbers are numbers with a currency
	// format that reddens negatives; nothing is exported as decorated text.

	const CRC_TABLE = (() => {
		const table = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			table[n] = c >>> 0;
		}
		return table;
	})();

	function crc32(bytes) {
		let c = 0xffffffff;
		for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	}

	// ZIP with stored (uncompressed) entries — xlsx accepts it, and it keeps
	// the writer small enough to audit by eye.
	function zipStore(files) {
		const encoder = new TextEncoder();
		const chunks = [];
		const central = [];
		let offset = 0;
		const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // a fixed, valid stamp
		const push = (bytes) => {
			chunks.push(bytes);
			offset += bytes.length;
		};
		const u16 = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
		const u32 = (v) =>
			new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
		const concat = (parts) => {
			const size = parts.reduce((n, p) => n + p.length, 0);
			const out = new Uint8Array(size);
			let at = 0;
			for (const p of parts) {
				out.set(p, at);
				at += p.length;
			}
			return out;
		};
		for (const file of files) {
			const name = encoder.encode(file.name);
			const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
			const crc = crc32(data);
			const start = offset;
			push(concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(DOS_DATE),
				u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]));
			central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0),
				u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length),
				u16(0), u16(0), u16(0), u16(0), u32(0), u32(start), name]));
		}
		const dirStart = offset;
		for (const entry of central) push(entry);
		push(concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
			u32(offset - dirStart), u32(dirStart), u16(0)]));
		return concat(chunks);
	}

	const xmlEsc = (value) =>
		String(value == null ? "" : value)
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&apos;");

	function colLetter(index) {
		let name = "";
		let n = index;
		do {
			name = String.fromCharCode(65 + (n % 26)) + name;
			n = Math.floor(n / 26) - 1;
		} while (n >= 0);
		return name;
	}

	// أَلوان المصنّف من رموز الثيم نفسها — قيمة محسوبة تُحوَّل إلى ARGB.
	function themeHex(token, fallback) {
		const raw = cssVar(token) || "";
		const rgb = raw.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
		if (rgb) {
			return rgb.slice(1, 4)
				.map((part) => Number(part).toString(16).padStart(2, "0"))
				.join("")
				.toUpperCase();
		}
		const hex = raw.match(/#([0-9a-f]{6})/i);
		return hex ? hex[1].toUpperCase() : fallback;
	}

	function xlsxStyles() {
		const brand = themeHex("--bnd-brand", "444444");
		const line = themeHex("--bnd-line", "DDDDDD");
		const muted = themeHex("--bnd-ink-muted", "777777");
		const section = themeHex("--bnd-pane", "F2F2F2");
		const total = themeHex("--bnd-raised", "FAFAFA");
		const thin = `<left style="thin"><color rgb="FF${line}"/></left><right style="thin"><color rgb="FF${line}"/></right><top style="thin"><color rgb="FF${line}"/></top><bottom style="thin"><color rgb="FF${line}"/></bottom><diagonal/>`;
		const center = '<alignment horizontal="center" vertical="center" wrapText="1"/>';
		const wrap = '<alignment vertical="center" wrapText="1"/>';
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0;[Red]-#,##0"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF${muted}"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${brand}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${section}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${total}"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}</border><border><left style="thin"><color rgb="FF${line}"/></left><right style="thin"><color rgb="FF${line}"/></right><top style="medium"><color rgb="FF${brand}"/></top><bottom style="thin"><color rgb="FF${line}"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" applyAlignment="1">${center}</xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyAlignment="1">${wrap}</xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyAlignment="1">${center}</xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1">${wrap}</xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyAlignment="1">${wrap}</xf>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="2" applyAlignment="1">${wrap}</xf>
<xf numFmtId="164" fontId="1" fillId="4" borderId="2"/>
<xf numFmtId="165" fontId="1" fillId="4" borderId="2"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyAlignment="1">${wrap}</xf>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
	}

	const XLSX_STYLE = {
		title: 1, meta: 2, header: 3,
		text: 4, money: 5, int: 6,
		sectionText: 7, sectionMoney: 8,
		totalText: 9, totalMoney: 10, totalInt: 11,
		kpiLabel: 12, kpiMoney: 13, kpiText: 14, kpiInt: 15,
	};

	/**
	 * spec: { fileName, sheetName, rtl, title, meta, kpis:[{label, text?, value?, int?}],
	 *         columns:[{name, type:'text'|'money'|'int', width}],
	 *         rows:[{kind:'data'|'section'|'total', cells:[{t?|n?}]}] }
	 */
	function xlsxDownload(spec) {
		const columnCount = spec.columns.length;
		const last = colLetter(columnCount - 1);
		const lines = [];
		const merges = [];
		let r = 0;
		const rowTag = (attrs, cells) => {
			lines.push(`<row r="${r}"${attrs || ""}>${cells}</row>`);
		};
		const textCell = (col, style, value) =>
			`<c r="${colLetter(col)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
		const numCell = (col, style, value) =>
			`<c r="${colLetter(col)}${r}" s="${style}"><v>${value}</v></c>`;

		r += 1;
		rowTag(' ht="30" customHeight="1"', textCell(0, XLSX_STYLE.title, spec.title));
		merges.push(`A${r}:${last}${r}`);
		r += 1;
		rowTag(' ht="18" customHeight="1"', textCell(0, XLSX_STYLE.meta, spec.meta));
		merges.push(`A${r}:${last}${r}`);
		r += 1;
		rowTag("", "");
		for (const kpi of spec.kpis) {
			r += 1;
			let value;
			if (kpi.text != null) value = textCell(1, XLSX_STYLE.kpiText, kpi.text);
			else value = numCell(1, kpi.int ? XLSX_STYLE.kpiInt : XLSX_STYLE.kpiMoney, kpi.value);
			rowTag("", textCell(0, XLSX_STYLE.kpiLabel, kpi.label) + value);
		}
		if (spec.kpis.length) {
			r += 1;
			rowTag("", "");
		}

		r += 1;
		const headerRow = r;
		rowTag(
			' ht="22" customHeight="1"',
			spec.columns.map((col, i) => textCell(i, XLSX_STYLE.header, col.name)).join("")
		);
		for (const row of spec.rows) {
			r += 1;
			const cells = row.cells.map((cell, i) => {
				const type = spec.columns[i].type;
				let style;
				if (row.kind === "section") style = cell.n != null ? XLSX_STYLE.sectionMoney : XLSX_STYLE.sectionText;
				else if (row.kind === "total") {
					style = cell.n == null ? XLSX_STYLE.totalText
						: type === "int" ? XLSX_STYLE.totalInt : XLSX_STYLE.totalMoney;
				} else {
					style = cell.n == null ? XLSX_STYLE.text
						: type === "int" ? XLSX_STYLE.int : XLSX_STYLE.money;
				}
				return cell.n != null ? numCell(i, style, cell.n) : textCell(i, style, cell.t || "");
			});
			rowTag("", cells.join(""));
		}
		const lastRow = r;

		const cols = spec.columns
			.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`)
			.join("");
		const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView${spec.rtl ? ' rightToLeft="1"' : ""} workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${lines.join("")}</sheetData>
<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>
<tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`;

		const tableRef = `A${headerRow}:${last}${Math.max(lastRow, headerRow + 1)}`;
		const table = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="BNDData" displayName="BNDData" ref="${tableRef}" headerRowCount="1" totalsRowShown="0">
<autoFilter ref="${tableRef}"/>
<tableColumns count="${columnCount}">${spec.columns.map((col, i) => `<tableColumn id="${i + 1}" name="${xmlEsc(col.name)}"/>`).join("")}</tableColumns>
<tableStyleInfo name="TableStyleMedium9" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`;

		const sheetName = xmlEsc((spec.sheetName || "Report").replace(/[\\/?*[\]:']/g, " ").slice(0, 31));
		const files = [
			{ name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>` },
			{ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
			{ name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
			{ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
			{ name: "xl/styles.xml", data: xlsxStyles() },
			{ name: "xl/worksheets/sheet1.xml", data: sheet },
			{ name: "xl/worksheets/_rels/sheet1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>` },
			{ name: "xl/tables/table1.xml", data: table },
		];
		const blob = new Blob([zipStore(files)], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = spec.fileName;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	// ── Rendering ───────────────────────────────────────────────────────────

	function render(container, page) {
		container.classList.add("bnd-studio");
		state_entity_of = () => state.entity;
		const state = {
			domain: "sales",
			report: null,
			period: "month",
			custom: { from: D.month_start(), to: D.month_end() },
			company:
				frappe.defaults.get_user_default("company") ||
				(frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) ||
				null,
			companies: [],
			available: null,
			showAllColumns: false,
			query: "",
			kind: "all",
			entity: null,
		};

		// ---- من هو صاحب الكشف — أنواعه الأربعة، تلزم المنتقي ومزامنة المسار ----
		const KINDS = [
			{ id: "customer", label: () => __("Customer"), party_type: "Customer", doctype: "Customer" },
			{ id: "supplier", label: () => __("Supplier"), party_type: "Supplier", doctype: "Supplier" },
			{ id: "employee", label: () => __("Employee"), party_type: "Employee", doctype: "Employee" },
			{ id: "account", label: () => __("Ledger Account"), doctype: "Account" },
		];

		// ---- The route IS the memory -----------------------------------------
		// bnd-report-studio[/<report.key>[/<kind~entity>]] — so the browser's
		// back button walks the same steps the user walked, one at a time.
		const ROUTE_PAGE = "bnd-report-studio";
		function routeParts(report, entity) {
			const parts = [ROUTE_PAGE];
			if (report) parts.push(report.key);
			if (report && entity) parts.push((entity.kind_id || "account") + "~" + entity.name);
			return parts;
		}
		function entityFromSegment(segment) {
			const cut = segment.indexOf("~");
			if (cut < 1) return null;
			const kind = KINDS.find((k) => k.id === segment.slice(0, cut)) || KINDS[3];
			const name = segment.slice(cut + 1);
			if (!name) return null;
			return {
				name: name,
				label: name,
				party_type: kind.party_type || null,
				kindLabel: kind.label(),
				kind_id: kind.id,
			};
		}
		function syncFromRoute() {
			const route = frappe.get_route();
			if (route[0] !== ROUTE_PAGE) return;
			const key = route[1] || null;
			const report = (key && ALL_REPORTS.find((r) => r.key === key)) || null;
			const entity = report && report.picker && route[2] ? entityFromSegment(String(route[2])) : null;
			if (!report) {
				if (!state.report) return;
				state.report = null;
				state.entity = null;
				gallery();
				return;
			}
			const sameEntity = state.entity && entity && state.entity.name === entity.name;
			if (state.report === report && (sameEntity || (!state.entity && !entity))) return;
			state.domain = report.domain_id;
			state.report = report;
			if (!sameEntity) state.entity = entity;
			viewer();
		}
		frappe.router.on("change", () => {
			if (frappe.get_route()[0] === ROUTE_PAGE) syncFromRoute();
		});

		// الرقم الضريبي يرافق كل طبعة وكل تصدير — يُجلب مرة لكل شركة.
		state.taxId = "";
		function fetchTaxId() {
			state.taxId = "";
			if (!state.company) return;
			frappe.db
				.get_value("Company", state.company, "tax_id")
				.then((r) => {
					state.taxId = (r.message && r.message.tax_id) || "";
				})
				.catch(() => {});
		}

		frappe.db
			.get_list("Company", { pluck: "name", limit: 0 })
			.then((names) => {
				state.companies = names || [];
				if (!state.company && state.companies.length) state.company = state.companies[0];
				fetchTaxId();
				return frappe.db.get_list("Report", {
					filters: { name: ["in", DOMAINS.flatMap((d) => d.reports.map((r) => r.name))] },
					pluck: "name",
					limit: 0,
				});
			})
			.then((names) => {
				state.available = new Set(names || []);
				// A deep link (or a restored tab) opens straight onto its card.
				if (frappe.get_route()[0] === ROUTE_PAGE && frappe.get_route()[1]) syncFromRoute();
				else gallery();
			})
			.catch(() => {
				state.available = new Set();
				gallery();
			});

		// ---- The gallery -----------------------------------------------------
		function gallery() {
			container.innerHTML = "";
			container.classList.remove("bnd-studio--viewer-open");

			const hero = el("header", "bnd-studio__hero");
			hero.append(el("h2", "bnd-studio__title", __("Report Studio")));
			hero.append(
				el("p", "bnd-studio__subtitle", __("The numbers that run the business — read, not hunted."))
			);
			container.append(hero);

			const rail = el("nav", "bnd-studio__domains");
			for (const domain of DOMAINS) {
				const chip = el("button", "bnd-studio__domain", domain.label());
				chip.type = "button";
				if (domain.id === state.domain) chip.classList.add("is-active");
				if (domain.soon) {
					chip.classList.add("is-soon");
					chip.append(el("span", "bnd-studio__soon", __("Soon")));
					chip.disabled = true;
				} else {
					chip.addEventListener("click", () => {
						state.domain = domain.id;
						gallery();
					});
				}
				rail.append(chip);
			}
			container.append(rail);

			const grid = el("div", "bnd-studio__grid");
			const domain = DOMAINS.find((d) => d.id === state.domain);
			for (const report of domain.reports) {
				const card = el("button", "bnd-studio__card");
				card.type = "button";
				card.style.setProperty("--bnd-studio-cat", `var(--bnd-cat-${report.cat})`);
				const missing = state.available && !state.available.has(report.name);
				const glyph = el("span", "bnd-studio__glyph");
				glyph.append(cardGlyph(report.cat));
				card.append(glyph);
				const body = el("span", "bnd-studio__card-body");
				body.append(el("span", "bnd-studio__card-title", report.title()));
				body.append(el("span", "bnd-studio__card-desc", report.desc()));
				card.append(body);
				card.append(el("span", "bnd-studio__card-go", ARROW.go()));
				if (missing) {
					card.classList.add("is-missing");
					card.disabled = true;
					card.title = __("This report is not installed on this site");
				} else {
					card.addEventListener("click", () => {
						// عبر المسار لا مباشرةً: الفتح خطوة تاريخ يرجع عنها المتصفح.
						frappe.set_route(...routeParts(report, null));
					});
				}
				grid.append(card);
			}
			container.append(grid);
		}

		// A small stroked glyph per category — inline SVG so it inherits
		// currentColor and needs no icon font or sprite request.
		function cardGlyph(cat) {
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", "currentColor");
			svg.setAttribute("stroke-width", "1.8");
			svg.setAttribute("stroke-linecap", "round");
			svg.setAttribute("stroke-linejoin", "round");
			const paths = [
				"M4 19V5m0 14h16M8 15l4-6 3 3 5-7", // trend
				"M4 20h16M6 16v-5m4 5V8m4 8v-3m4 3V6", // bars
				"M12 3a9 9 0 1 0 9 9h-9V3z", // pie share
				"M4 6h16M4 12h10M4 18h7", // lines
				"M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4z", // receipt
				"M16 11a4 4 0 1 0-8 0M3 21c1.5-4 5-6 9-6s7.5 2 9 6", // people
				"M12 21s-7-4.4-7-10a7 7 0 0 1 14 0c0 5.6-7 10-7 10z", // territory
				"M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z", // blocks
			];
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", paths[cat % paths.length]);
			svg.append(path);
			return svg;
		}

		// ---- The viewer ------------------------------------------------------
		function viewer() {
			const report = state.report;
			container.innerHTML = "";
			container.classList.add("bnd-studio--viewer-open");

			// ترويسة الورق: لا تظهر على الشاشة، وتتصدر كل طبعة A4 — هوية المنشأة
			// ورقمها الضريبي والفترة وطابع الوقت، فالورقة تحمل نسبها بنفسها.
			const printhead = el("header", "bnd-studio__printhead");
			container.append(printhead);
			const printfoot = el("footer", "bnd-studio__printfoot",
				__("Generated from the Report Studio") + " — " + (state.company || ""));

			function updatePrinthead(agg) {
				printhead.innerHTML = "";
				const brand = el("div", "bnd-studio__printhead-brand");
				brand.append(el("strong", null, state.company || ""));
				brand.append(el("span", null,
					state.entity ? state.entity.label + " — " + __(report.name) : report.title()));
				const meta = el("div", "bnd-studio__printhead-meta");
				const chip = (label, value) => {
					if (!value) return;
					const item = el("span", "bnd-studio__printhead-chip");
					item.append(el("b", null, label + ": "));
					item.append(document.createTextNode(value));
					meta.append(item);
				};
				const [from, to] = periodRange(state.period, state.custom);
				chip(__("Company VAT registration"), state.taxId);
				chip(__("Report period"),
					frappe.datetime.str_to_user(from) + " — " + frappe.datetime.str_to_user(to));
				chip(__("Printed on"),
					frappe.datetime.str_to_user(D.get_today()) + " " + new Date().toLocaleTimeString());
				if (agg) chip(__("Rows"), String(agg.bodyRows.length));
				printhead.append(brand, meta);
			}
			updatePrinthead(null);

			const head = el("header", "bnd-studio__viewhead");
			const back = el("button", "bnd-studio__back");
			back.type = "button";
			back.append(el("span", "bnd-studio__back-arrow", ARROW.back()));
			// خطوة واحدة للخلف دائماً: من كشف كيانٍ إلى المنتقي، ومن العارض إلى
			// البطاقات — عبر المسار، فيبقى زر المتصفح والزر المرسوم على خطوةٍ سواء.
			back.append(el("span", null, state.entity ? __("Back") : __("All reports")));
			back.addEventListener("click", () => {
				if (state.entity) frappe.set_route(...routeParts(report, null));
				else frappe.set_route(ROUTE_PAGE);
			});
			head.append(back);

			const heading = el("div", "bnd-studio__heading");
			heading.append(el("h2", "bnd-studio__title", report.title()));
			heading.append(el("p", "bnd-studio__subtitle", report.desc()));
			head.append(heading);

			const actions = el("div", "bnd-studio__actions");
			const btn = (label, handler, cls) => {
				const b = el("button", "bnd-studio__action" + (cls ? " " + cls : ""), label);
				b.type = "button";
				b.addEventListener("click", handler);
				actions.append(b);
				return b;
			};
			btn(__("Refresh"), () => load());
			btn(__("Print"), () => window.print());
			btn(__("Export Excel"), () => exportExcel());
			btn(__("Presentation"), () => presentation());
			btn(__("Classic view"), () => frappe.set_route("query-report", report.name));
			head.append(actions);
			container.append(head);
			container.append(printfoot);

			const controls = el("div", "bnd-studio__controls");
			const chips = el("div", "bnd-studio__chips");
			for (const period of PERIODS) {
				const chip = el("button", "bnd-studio__chip", period.label());
				chip.type = "button";
				if (period.id === state.period) chip.classList.add("is-active");
				chip.addEventListener("click", () => {
					if (period.id === "custom") {
						frappe.prompt(
							[
								{ fieldname: "from", fieldtype: "Date", label: __("From Date"), reqd: 1, default: state.custom.from },
								{ fieldname: "to", fieldtype: "Date", label: __("To Date"), reqd: 1, default: state.custom.to },
							],
							(values) => {
								state.custom = { from: values.from, to: values.to };
								state.period = "custom";
								viewer();
							},
							__("Custom Period")
						);
						return;
					}
					state.period = period.id;
					viewer();
				});
				chips.append(chip);
			}
			controls.append(chips);

			if (state.companies.length > 1) {
				const select = el("select", "bnd-studio__company");
				for (const name of state.companies) {
					const option = el("option", null, name);
					option.value = name;
					if (name === state.company) option.selected = true;
					select.append(option);
				}
				select.addEventListener("change", () => {
					state.company = select.value;
					fetchTaxId();
					load();
				});
				controls.append(select);
			}
			container.append(controls);

			const kpisEl = el("section", "bnd-studio__kpis");
			const chartCard = el("section", "bnd-studio__chartcard");
			const tableCard = el("section", "bnd-studio__tablecard");
			container.append(kpisEl, chartCard, tableCard);

			if (report.picker && !state.entity) {
				renderPicker();
			} else {
				if (report.picker && state.entity) {
					heading.querySelector(".bnd-studio__title").textContent = state.entity.label;
					heading.querySelector(".bnd-studio__subtitle").textContent =
						state.entity.kindLabel + " — " + __(report.name);
					const change = el("button", "bnd-studio__action is-quiet", __("Change"));
					change.type = "button";
					change.addEventListener("click", () => {
						frappe.set_route(...routeParts(report, null));
					});
					actions.prepend(change);
				}
				load();
			}

			// ---- منتقي صاحب الكشف ------------------------------------------
			function renderPicker() {
				kpisEl.innerHTML = "";
				chartCard.innerHTML = "";
				tableCard.innerHTML = "";
				const panel = el("div", "bnd-studio__picker");
				panel.append(el("h3", "bnd-studio__picker-title", __("Who is this statement for?")));

				let kind = KINDS[0];

				const chips = el("div", "bnd-studio__chips");
				for (const k of KINDS) {
					const chip = el("button", "bnd-studio__chip", k.label());
					chip.type = "button";
					if (k === kind) chip.classList.add("is-active");
					chip.addEventListener("click", () => {
						kind = k;
						chips.querySelectorAll(".bnd-studio__chip").forEach((c) => c.classList.remove("is-active"));
						chip.classList.add("is-active");
						search.value = "";
						refresh("");
					});
					chips.append(chip);
				}
				panel.append(chips);

				const search = el("input", "bnd-studio__search");
				search.type = "search";
				search.placeholder = __("Search…");
				panel.append(search);

				const quick = el("div", "bnd-studio__picker-quick");
				const list = el("div", "bnd-studio__picker-list");
				panel.append(quick, list);
				tableCard.append(panel);

				const choose = (name, label) => {
					state.entity = {
						name: name,
						label: label || name,
						party_type: kind.party_type || null,
						kindLabel: kind.label(),
						kind_id: kind.id,
					};
					viewer();
					// بعد الرسم لا قبله: المزامنة ترى الاسم مطابقاً فلا تعيد الرسم،
					// ويبقى الاسم المقروء الذي اختاره المستخدم لا معرّف المسار.
					frappe.set_route(...routeParts(report, state.entity));
				};

				// الصناديق والبنوك حاضرة دائماً بلمسة — أكثر الكشوف طلباً
				frappe.db
					.get_list("Account", {
						filters: { company: state.company, is_group: 0,
							account_type: ["in", ["Cash", "Bank"]] },
						fields: ["name", "account_name"],
						limit: 12,
					})
					.then((accounts) => {
						if (!accounts || !accounts.length) return;
						quick.append(el("span", "bnd-studio__picker-hint", __("Cash and bank accounts")));
						for (const account of accounts) {
							const chip = el("button", "bnd-studio__chip", account.account_name || account.name);
							chip.type = "button";
							chip.addEventListener("click", () => {
								kind = KINDS[3];
								choose(account.name, account.account_name || account.name);
							});
							quick.append(chip);
						}
					})
					.catch(() => {});

				function refresh(q) {
					list.innerHTML = "";
					const args = { fields: ["name"], limit: 20 };
					if (kind.doctype === "Account") {
						args.filters = { company: state.company, is_group: 0 };
						args.fields = ["name", "account_name"];
					} else if (kind.doctype === "Employee") {
						args.fields = ["name", "employee_name"];
					}
					if (q) {
						args.filters = Object.assign(args.filters || {}, { name: ["like", "%" + q + "%"] });
					}
					frappe.db
						.get_list(kind.doctype, args)
						.then((rows) => {
							if (!rows || !rows.length) {
								list.append(el("div", "bnd-studio__picker-hint", __("Nothing found")));
								return;
							}
							for (const row of rows) {
								const label = row.account_name || row.employee_name || row.name;
								const item = el("button", "bnd-studio__picker-item");
								item.type = "button";
								item.append(el("span", null, label));
								if (label !== row.name) item.append(el("span", "bnd-studio__picker-sub", row.name));
								item.addEventListener("click", () => choose(row.name, label));
								list.append(item);
							}
						})
						.catch(() => list.append(el("div", "bnd-studio__picker-hint", __("Nothing found"))));
				}
				search.addEventListener("input", () => refresh(search.value.trim()));
				refresh("");
			}

			function skeleton() {
				kpisEl.innerHTML = "";
				for (let i = 0; i < 4; i++) kpisEl.append(el("div", "bnd-studio__kpi is-skeleton"));
				chartCard.innerHTML = "";
				chartCard.append(el("div", "bnd-studio__shimmer"));
				tableCard.innerHTML = "";
				tableCard.append(el("div", "bnd-studio__shimmer is-tall"));
			}

			function load() {
				skeleton();
				const { filters, from, to } = buildFilters(report, state);
				const [prevFrom, prevTo] = previousRange(from, to);
				const prevFilters = Object.assign({}, filters, { from_date: prevFrom, to_date: prevTo });

				Promise.all([
					runReport(report.name, filters),
					runReport(report.name, prevFilters).catch(() => null),
				])
					.then(([data, prevData]) => {
						const agg = aggregate(data, report);
						const prevAgg = prevData ? aggregate(prevData, report) : null;
						if (report.compose === "signSplit") composeSignSplit(agg, prevAgg, report);
						if (report.compose === "grossProfit") composeGrossProfit(agg, prevAgg);
						if (report.compose === "generalLedger") composeGeneralLedger(agg, prevAgg);
						if (report.compose === "trialBalance") composeTrialBalance(agg, prevAgg);
						if (report.compose === "aging") composeAging(agg, prevAgg);
						if (report.compose === "financialStatement") composeFinancialStatement(agg, prevAgg);
						if (report.compose === "statement") composeStatement(agg, prevAgg);
						if (report.compose === "vatReturn") composeVatReturn(agg, prevAgg);
						drawKpis(agg, prevAgg);
						drawChart(agg);
						drawTable(agg);
						updatePrinthead(agg);
					})
					.catch((err) => {
						const message =
							(err && err.message) || __("The report could not be run. Open the classic view for details.");
						kpisEl.innerHTML = "";
						chartCard.innerHTML = "";
						tableCard.innerHTML = "";
						const alert = el("div", "bnd-studio__error");
						alert.append(el("strong", null, __("Nothing to show")));
						alert.append(el("span", null, message));
						tableCard.append(alert);
					});
			}

			function drawKpis(agg, prevAgg) {
				kpisEl.innerHTML = "";
				state._tiles = null;
				const tiles = [];
				if (agg.customTiles) {
					for (const tile of agg.customTiles) tiles.push(tile);
				} else for (const kpi of agg.kpis) {
					const prev = prevAgg && prevAgg.kpis.find((p) => p.column.fieldname === kpi.column.fieldname);
					tiles.push({
						label: kpi.column.label,
						value: kpi.value,
						column: kpi.column,
						prev: prev ? prev.value : null,
					});
				}
				if (agg.extraTiles) for (const tile of agg.extraTiles) tiles.push(tile);
				tiles.push({
					label: __("Rows"),
					value: agg.bodyRows.length,
					column: { fieldtype: "Int" },
					prev: prevAgg ? prevAgg.bodyRows.length : null,
				});
				state._tiles = tiles;

				tiles.forEach((tile, index) => {
					const card = el("div", "bnd-studio__kpi");
					card.append(el("span", "bnd-studio__kpi-label", tile.label));
					const valueEl = el("strong", "bnd-studio__kpi-value",
						tile.text != null ? tile.text : fnum(tile.value, tile.column));
					if (tile.state === "good" || tile.indicator === "Green") valueEl.classList.add("is-good");
					if (tile.state === "bad" || tile.indicator === "Red") valueEl.classList.add("is-bad");
					card.append(valueEl);
					if (tile.prev != null && isFinite(tile.prev)) {
						const delta = tile.prev === 0 ? null : ((tile.value - tile.prev) / Math.abs(tile.prev)) * 100;
						const wrap = el("span", "bnd-studio__kpi-delta");
						if (delta == null) {
							wrap.textContent = __("No previous period");
							wrap.classList.add("is-flat");
						} else {
							const up = delta >= 0;
							wrap.classList.add(up ? "is-up" : "is-down");
							wrap.append(el("span", "bnd-studio__kpi-arrow", up ? "▲" : "▼"));
							wrap.append(el("span", null, Math.abs(delta).toFixed(1) + "%"));
							wrap.append(el("span", "bnd-studio__kpi-vs", __("vs previous period")));
						}
						card.append(wrap);
					}
					if (index === 0 && agg.series && !agg.customTiles) card.append(sparkline(agg.series.values));
					kpisEl.append(card);
				});
				if (agg.note) {
					kpisEl.append(el("div", "bnd-studio__note", agg.note));
				}
			}

			function sparkline(values) {
				const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				svg.setAttribute("class", "bnd-studio__spark");
				svg.setAttribute("viewBox", "0 0 100 28");
				svg.setAttribute("preserveAspectRatio", "none");
				const max = Math.max(...values, 1);
				const min = Math.min(...values, 0);
				const span = max - min || 1;
				const step = 100 / Math.max(values.length - 1, 1);
				const points = values.map((v, i) => `${(i * step).toFixed(2)},${(26 - ((v - min) / span) * 24).toFixed(2)}`);
				const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
				path.setAttribute("d", "M" + points.join(" L"));
				path.setAttribute("fill", "none");
				path.setAttribute("stroke", "currentColor");
				path.setAttribute("stroke-width", "2");
				path.setAttribute("stroke-linecap", "round");
				path.setAttribute("stroke-linejoin", "round");
				svg.append(path);
				return svg;
			}

			function drawChart(agg) {
				chartCard.innerHTML = "";
				if (!window.frappe || !frappe.Chart) return;
				const series = agg.series;
				const topn = agg.topn;
				// customSeries عاش خارج هذا الحارس فمات كل مخطط مؤلَّف بصمت —
				// الوضع الحذر يصفّر series/topn ويتكلم بمخطط مؤلّفه وحده.
				if (!series && !topn && !agg.customSeries) {
					chartCard.classList.add("is-empty");
					return;
				}
				chartCard.classList.remove("is-empty");
				const title = el("h3", "bnd-studio__chart-title");
				const host = el("div", "bnd-studio__chart");
				chartCard.append(title, host);

				const colors = [cssVar("--bnd-series-1"), cssVar("--bnd-series-2")].filter(Boolean);
				if (agg.customSeries) {
					const categorical = agg.customSeries.categorical;
					// مؤلّفٌ يسمّي مخططه يُحترم اسمه؛ الافتراضان يبقيان لمن لم يسمِّ.
					title.textContent = agg.customSeries.title ||
						(categorical ? __("Ageing buckets") : __("Over the period"));
					new frappe.Chart(host, {
						data: {
							labels: categorical
								? agg.customSeries.labels
								: agg.customSeries.labels.map((d) => frappe.datetime.str_to_user(d)),
							datasets: agg.customSeries.datasets,
						},
						type: agg.customSeries.chartType || "bar",
						height: 260,
						colors: colors,
						axisOptions: { xIsSeries: categorical ? 0 : 1, shortenYAxisNumbers: 1 },
						barOptions: { spaceRatio: 0.45 },
						tooltipOptions: { formatTooltipY: (v) => fnum(v, agg.customSeries.value_column) },
					});
					return;
				}
				if (series && (!topn || series.labels.length >= 4)) {
					title.textContent = __("Over the period") + " — " + (agg.primary ? agg.primary.label : "");
					new frappe.Chart(host, {
						data: {
							labels: series.labels.map((d) => frappe.datetime.str_to_user(d)),
							datasets: [{ name: agg.primary ? agg.primary.label : "", values: series.values }],
						},
						type: "bar",
						height: 260,
						colors: colors,
						axisOptions: { xIsSeries: 1, shortenYAxisNumbers: 1 },
						barOptions: { spaceRatio: 0.55 },
						tooltipOptions: {
							formatTooltipY: (v) => fnum(v, agg.primary),
						},
					});
				} else if (topn) {
					title.textContent = __("Top contributors") + " — " + topn.column.label;
					new frappe.Chart(host, {
						data: {
							labels: topn.entries.map(([k]) => String(k)),
							datasets: [{ name: topn.value.label, values: topn.entries.map(([, v]) => v) }],
						},
						type: "bar",
						height: 260,
						colors: colors,
						axisOptions: { shortenYAxisNumbers: 1 },
						barOptions: { spaceRatio: 0.4 },
						tooltipOptions: {
							formatTooltipY: (v) => fnum(v, topn.value),
						},
					});
				}
			}

			function drawTable(agg) {
				tableCard.innerHTML = "";
				const toolbar = el("div", "bnd-studio__tabletools");
				const search = el("input", "bnd-studio__search");
				search.type = "search";
				search.placeholder = __("Filter rows…");
				search.value = state.query;
				toolbar.append(search);
				const count = el("span", "bnd-studio__count");
				toolbar.append(count);
				const toggle = el("button", "bnd-studio__action is-quiet");
				toggle.type = "button";
				toggle.textContent = state.showAllColumns ? __("Key columns") : __("All columns");
				toggle.addEventListener("click", () => {
					state.showAllColumns = !state.showAllColumns;
					drawTable(agg);
				});
				toolbar.append(toggle);
				if (report.compose === "signSplit") {
					const kinds = el("div", "bnd-studio__chips");
					for (const [id, label] of [["all", __("All")], ["sale", report.split_labels.gross()], ["return", __("Returns")]]) {
						const chip = el("button", "bnd-studio__chip", label);
						chip.type = "button";
						if (state.kind === id) chip.classList.add("is-active");
						chip.addEventListener("click", () => {
							state.kind = id;
							drawTable(agg);
						});
						kinds.append(chip);
					}
					toolbar.append(kinds);
				}
				tableCard.append(toolbar);

				const shape = agg.shape;
				const score = (col) =>
					({ Date: 90, Datetime: 88, Link: 80, "Dynamic Link": 78, Currency: 70, Percent: 55, Float: 50, Int: 45, Data: 30 }[
						col.fieldtype
					] || 15) + (isTaxish(col) ? 30 : 0);
				let visible = shape.all;
				const dropped = (report.hints && report.hints.dropColumns) || [];
				if (dropped.length) visible = visible.filter((c) => !dropped.includes(c.fieldname));
				if (!state.showAllColumns) {
					// A measured hint beats a heuristic: reports we curated name
					// their reading columns outright, tax among them.
					const hinted = (report.hints && report.hints.columns || [])
						.map((fieldname) => shape.all.find((c) => c.fieldname === fieldname))
						.filter(Boolean);
					if (hinted.length) {
						visible = hinted;
					} else if (shape.all.length > 9) {
						const ranked = shape.all
							.map((col, index) => ({ col, index, score: score(col) }))
							.sort((a, b) => b.score - a.score)
							.slice(0, 9)
							.sort((a, b) => a.index - b.index);
						visible = ranked.map((r) => r.col);
					}
				}

				const scroller = el("div", "bnd-studio__tablewrap");
				const table = el("table", "bnd-studio__table");
				const composed = report.compose === "signSplit" && agg.kindColumn;
				const kindIndex = composed ? shape.all.indexOf(agg.kindColumn) : -1;
				const thead = el("thead");
				const headRow = el("tr");
				if (composed) headRow.append(el("th", null, __("Kind")));
				for (const col of visible) {
					const th = el("th", null, col.label);
					if (["Currency", "Float", "Int", "Percent"].includes(col.fieldtype)) th.classList.add("is-num");
					headRow.append(th);
				}
				thead.append(headRow);
				table.append(thead);

				const tbody = el("tbody");
				const rows = agg.rows;
				const isTree = !!report.tree;
				const collapsed = new Set();
				const indentOf = (row) =>
					!Array.isArray(row) && row && isFinite(row.indent) ? Number(row.indent) : 0;
				const renderRows = () => {
					tbody.innerHTML = "";
					const needle = state.query.trim().toLowerCase();
					let shown = 0;
					let hideDeeperThan = null;
					for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
						const row = rows[rowIndex];
						if (isSpacerRow(row)) {
							if (!needle) {
								const spacer = el("tr", "is-spacer");
								spacer.append(el("td"));
								tbody.append(spacer);
							}
							continue;
						}
						const level = indentOf(row);
						if (isTree && hideDeeperThan != null) {
							if (level > hideDeeperThan && !isLabeledRow(row, shape)) continue;
							hideDeeperThan = null;
						}
						if (isTree && collapsed.has(rowIndex)) hideDeeperThan = level;
						const totalRow = isTotalRow(row, shape) || isLabeledRow(row, shape) ||
							(Array.isArray(row) && rows.some((r) => !Array.isArray(r) && !isSpacerRow(r)));
						const tr = el("tr");
						if (totalRow) tr.classList.add("is-total");
						if (isTree && !Array.isArray(row) && row.is_group) tr.classList.add("is-group");
						// صفوف تصرّح بطبيعتها (ورقة الإقرار): قسمٌ أو إجمالي من البيانات لا من تحسّس النص.
						if (!Array.isArray(row) && row.is_section) tr.classList.add("is-group", "is-section");
						if (!Array.isArray(row) && row.is_total) tr.classList.add("is-total");
						let isReturn = false;
						if (composed && !totalRow) {
							const g = parseFloat(rowValue(row, agg.kindColumn, kindIndex)) || 0;
							isReturn = g < 0;
							if (state.kind === "sale" && isReturn) continue;
							if (state.kind === "return" && !isReturn) continue;
							if (isReturn) tr.classList.add("is-return");
							const kindCell = el("td");
							kindCell.append(el("span",
								"bnd-studio__kindchip" + (isReturn ? " is-return" : ""),
								isReturn ? __("Return") : report.split_labels.row()));
							tr.append(kindCell);
						} else if (composed) {
							tr.append(el("td"));
						}
						let haystack = "";
						visible.forEach((col, position) => {
							const index = shape.all.indexOf(col);
							let raw = rowValue(row, col, index);
							// شجرة القوائم: عمود الحساب يعرض اسمه المقروء لا معرّفه الكامل
							if (isTree && position === 0 && !Array.isArray(row) && row.account_name && !totalRow) {
								raw = row.account_name;
							}
							const td = el("td");
							td.innerHTML = fmt(raw, col);
							if (isTree && position === 0) {
								td.style.paddingInlineStart =
									"calc(var(--bnd-sp-3) + " + level + " * var(--bnd-sp-5))";
								if (!Array.isArray(row) && row.is_group && !totalRow) {
									const caret = el("button", "bnd-studio__caret",
										collapsed.has(rowIndex) ? "+" : "−");
									caret.type = "button";
									caret.addEventListener("click", (ev) => {
										ev.stopPropagation();
										if (collapsed.has(rowIndex)) collapsed.delete(rowIndex);
										else collapsed.add(rowIndex);
										renderRows();
									});
									td.prepend(caret);
								}
							}
							if (["Currency", "Float", "Int", "Percent"].includes(col.fieldtype)) {
								td.classList.add("is-num");
								if (parseFloat(raw) < 0) td.classList.add("is-neg");
							}
							haystack += " " + td.textContent.toLowerCase();
							tr.append(td);
						});
						if (needle && !haystack.includes(needle)) continue;
						shown++;
						tbody.append(tr);
					}
					count.textContent = __("Rows: {0}", [new Intl.NumberFormat(frappe.boot.lang || "en").format(shown)]);
				};
				renderRows();
				search.addEventListener("input", () => {
					state.query = search.value;
					renderRows();
				});
				table.append(tbody);

				// A computed footer, independent of any server total row.
				const numericVisible = visible.filter((c) => ["Currency", "Float", "Int"].includes(c.fieldtype));
				const footerAllowed = !(report.hints && report.hints.noFooter);
				if (footerAllowed && numericVisible.length && agg.bodyRows.length) {
					const tfoot = el("tfoot");
					const tr = el("tr");
					if (composed) tr.append(el("td"));
					visible.forEach((col, position) => {
						const td = el("td");
						if (position === 0) td.textContent = __("Total");
						else if (numericVisible.includes(col)) {
							td.innerHTML = fmt(sumBy(agg.bodyRows, shape, col), col);
							td.classList.add("is-num");
						}
						tr.append(td);
					});
					tfoot.append(tr);
					table.append(tfoot);
				}

				scroller.append(table);
				tableCard.append(scroller);

				if (!agg.bodyRows.length) {
					const empty = el("div", "bnd-studio__empty");
					empty.append(el("strong", null, __("Nothing in this period")));
					empty.append(el("span", null, __("Try a wider period, or another company.")));
					tableCard.append(empty);
				}

				state._export = { shape, rows, visible, agg, footerAllowed };
			}

			function exportExcel() {
				// ما تراه هو ما تصدّره: أعمدة العرض الحالية، الصفوف بطبيعتها
				// (قسم/إجمالي/بيانات)، البلاطات، وذيل الإجماليات — أرقاماً حقيقية
				// داخل جدول Excel منظّم، لا نصاً مزخرفاً.
				const payload = state._export;
				if (!payload || !payload.agg) {
					frappe.show_alert(__("Nothing to export yet"));
					return;
				}
				const { shape, visible, agg, footerAllowed } = payload;
				const typeOf = (col) =>
					col.fieldtype === "Int" ? "int"
					: ["Currency", "Float", "Percent"].includes(col.fieldtype) ? "money"
					: "text";
				const seen = new Map();
				const columns = visible.map((col) => {
					let name = String(col.label || "").trim() || __("Rows");
					const used = seen.get(name) || 0;
					seen.set(name, used + 1);
					if (used) name = `${name} (${used + 1})`;
					return { name, type: typeOf(col), width: 0, col };
				});

				const rows = [];
				const widths = columns.map((c) => c.name.length);
				for (const row of agg.rows) {
					if (isSpacerRow(row)) continue;
					const dict = !Array.isArray(row);
					const kind = dict && row.is_section ? "section"
						: (dict && row.is_total) || isTotalRow(row, shape) || isLabeledRow(row, shape)
							? "total"
							: "data";
					const cells = columns.map((column, i) => {
						const index = shape.all.indexOf(column.col);
						let raw = rowValue(row, column.col, index);
						if (column.type !== "text") {
							const value = parseFloat(raw);
							return isFinite(value) ? { n: value } : { t: "" };
						}
						if (column.col.fieldtype === "Date" && raw) raw = frappe.datetime.str_to_user(raw);
						const text = unquote(String(raw == null ? "" : raw));
						widths[i] = Math.max(widths[i], Math.min(text.length, 60));
						return { t: text };
					});
					rows.push({ kind, cells });
				}
				// تقرير يحمل صف إجماله بنفسه لا يُذيَّل بثانٍ — إجماليان عيب لا إحكام.
				const hasOwnTotal = rows.some((row) => row.kind === "total");
				const numericVisible = columns.filter((c) => c.type !== "text");
				if (!hasOwnTotal && footerAllowed && numericVisible.length && agg.bodyRows.length) {
					const cells = columns.map((column, i) => {
						if (column.type === "text") return { t: i === 0 ? __("Total") : "" };
						const index = shape.all.indexOf(column.col);
						const sum = agg.bodyRows.reduce(
							(total, row) => total + (parseFloat(rowValue(row, column.col, index)) || 0), 0);
						return { n: Math.round(sum * 100) / 100 };
					});
					rows.push({ kind: "total", cells });
				}
				for (const [i, column] of columns.entries()) {
					column.width = Math.min(46, Math.max(column.type === "text" ? 12 : 14,
						Math.round(widths[i] * 1.15) + 2));
					delete column.col;
				}

				const kpis = (state._tiles || [])
					.filter((tile) => tile.label != null)
					.map((tile) => tile.text != null
						? { label: String(tile.label), text: String(tile.text) }
						: {
							label: String(tile.label),
							value: Math.round((tile.value || 0) * 100) / 100,
							int: tile.column && tile.column.fieldtype === "Int" ? 1 : 0,
						});

				const [from, to] = periodRange(state.period, state.custom);
				const title = state.entity
					? state.entity.label + " — " + __(report.name)
					: report.title();
				const metaParts = [state.company || ""];
				if (state.taxId) metaParts.push(__("Company VAT registration") + ": " + state.taxId);
				metaParts.push(__("Report period") + ": " +
					frappe.datetime.str_to_user(from) + " — " + frappe.datetime.str_to_user(to));
				metaParts.push(__("Printed on") + ": " + frappe.datetime.str_to_user(D.get_today()));

				xlsxDownload({
					fileName: (report.key || frappe.scrub(report.name)) + "-" + from + "-" + to + ".xlsx",
					sheetName: title,
					rtl: isRtl(),
					title: title,
					meta: metaParts.join("  •  "),
					kpis: kpis,
					columns: columns,
					rows: rows,
				});
			}

			function presentation() {
				const on = container.classList.toggle("bnd-studio--present");
				if (on && container.requestFullscreen) {
					container.requestFullscreen().catch(() => {});
				} else if (!on && document.fullscreenElement) {
					document.exitFullscreen().catch(() => {});
				}
			}
		}

		// Registered once per mount, not per viewer render — a listener that
		// accumulates is a leak that fires N times after N navigations.
		document.addEventListener("fullscreenchange", () => {
			if (!document.fullscreenElement) container.classList.remove("bnd-studio--present");
		});
	}

	window.bunood_theme = window.bunood_theme || {};
	window.bunood_theme.report_studio_render = render;
})();
