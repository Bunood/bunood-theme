/**
 * Report Studio — end-to-end suite. Every card, in a real browser.
 *
 * WHAT
 *   Opens /app/bnd-report-studio as an authenticated Administrator and walks
 *   ALL the cards across the three domains: each must render its tiles (or
 *   its picker, or an honest empty state) with zero unexplained console
 *   errors — and every deterministic money tile is compared TO THE FILS
 *   against expectations minted server-side in the same run, so the DOM the
 *   user reads is checked against the books, not against the studio's own
 *   arithmetic.
 *
 * WHY EXPECTATIONS ARE MINTED PER RUN
 *   The dev site's numbers move with every seeded document. A hardcoded
 *   35,684.50 would rot in a week; deriving both sides fresh each run keeps
 *   the assertion "DOM == server" true forever, which is the only claim this
 *   suite makes.
 *
 * REQUIREMENTS
 *   Runs INSIDE the bench container (python is reached directly, no docker
 *   exec):  cd apps/bunood_theme && node tests/studio.mjs
 *   Needs: npx playwright install chromium (one-time).
 *
 * USAGE
 *   BND_URL=http://bunood.localhost:8000 BND_SITE=bunood.localhost \
 *     node tests/studio.mjs
 */

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const URL_BASE = process.env.BND_URL || "http://bunood.localhost:8000";
const SITE = process.env.BND_SITE || "bunood.localhost";
const COMPANY = process.env.BND_COMPANY || "Bunood Development";
const MONTH = { from: "2026-08-01", to: "2026-08-31" };

// ── Server-side helper (in-container python, smoke.mjs's benchPy adapted) ───
function benchPy(code) {
	const wrapped =
		`import frappe, json\n` +
		`frappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\n` +
		`frappe.connect()\n` +
		code;
	try {
		return execFileSync(
			"bash",
			["-lc", "cd /home/frappe/frappe-bench/sites && ../env/bin/python -"],
			{ input: wrapped, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
		);
	} catch (err) {
		const noise = /^<frozen site>:\d+: RuntimeWarning:.*$|^\s*$/;
		const stderr = String(err.stderr || "")
			.split("\n")
			.filter((l) => !noise.test(l))
			.join("\n")
			.trim();
		throw new Error(`benchPy failed:\n${stderr || String(err.message).slice(0, 200)}`);
	}
}

function mintSid() {
	const out = benchPy(
		`from frappe.auth import CookieManager, LoginManager\n` +
		`frappe.local.cookie_manager = CookieManager()\n` +
		`frappe.local.form_dict = frappe._dict()\n` +
		`frappe.local.request = frappe._dict(path="/", method="GET", remote_addr="127.0.0.1", ` +
		`cookies=frappe._dict(), headers=frappe._dict(), environ=frappe._dict())\n` +
		`frappe.local.request_ip = "127.0.0.1"\n` +
		`lm = LoginManager()\n` +
		`lm.login_as("Administrator")\n` +
		`frappe.db.commit()\n` +
		`print("SID=" + frappe.session.sid)\n`
	);
	const m = out.match(/SID=([a-f0-9]+)/);
	if (!m) throw new Error("could not mint sid: " + out.slice(0, 300));
	return m[1];
}

/** Every deterministic figure the tiles must show, derived from the books. */
function mintExpectations() {
	const out = benchPy(
		`frappe.set_user("Administrator")\n` +
		`frappe.local.lang = "ar"\n` +
		`from frappe.desk.query_report import run as rr\n` +
		`C = ${JSON.stringify(COMPANY)}\n` +
		`month = {"company": C, "from_date": "${MONTH.from}", "to_date": "${MONTH.to}"}\n` +
		`out = {}\n` +
		`def body(res):\n` +
		`    return [r for r in res["result"] if isinstance(r, dict) and r.get("posting_date")]\n` +
		`sr = rr("Sales Register", filters=dict(month), ignore_prepared_report=True)\n` +
		`b = body(sr)\n` +
		`out["sales_gross"] = sum(r["grand_total"] for r in b if r["grand_total"] >= 0)\n` +
		`out["sales_returns"] = sum(-r["grand_total"] for r in b if r["grand_total"] < 0)\n` +
		`out["sales_net"] = out["sales_gross"] - out["sales_returns"]\n` +
		`out["sales_tax"] = sum(r.get("tax_total") or 0 for r in b)\n` +
		`out["sales_return_rows"] = sum(1 for r in b if r["grand_total"] < 0)\n` +
		`pr = rr("Purchase Register", filters=dict(month), ignore_prepared_report=True)\n` +
		`b = body(pr)\n` +
		`out["buy_gross"] = sum(r["grand_total"] for r in b if r["grand_total"] >= 0)\n` +
		`out["buy_returns"] = sum(-r["grand_total"] for r in b if r["grand_total"] < 0)\n` +
		`out["buy_net"] = out["buy_gross"] - out["buy_returns"]\n` +
		`out["buy_tax"] = sum(r.get("total_tax") or 0 for r in b)\n` +
		`gp = rr("Gross Profit", filters=dict(month, group_by="Item Code"), ignore_prepared_report=True)\n` +
		`gb = [r for r in gp["result"] if isinstance(r, dict) and r.get("item_code") and str(r.get("item_code")) != "Total"]\n` +
		`out["gp_selling"] = sum(r.get("selling_amount") or 0 for r in gb)\n` +
		`out["gp_profit"] = sum(r.get("gross_profit") or 0 for r in gb)\n` +
		`tb = rr("Trial Balance", filters={"company": C, "fiscal_year": "2026",\n` +
		`    "from_date": "2026-01-01", "to_date": "${MONTH.to}",\n` +
		`    "with_period_closing_entry_for_opening": 1,\n` +
		`    "with_period_closing_entry_for_current_period": 1}, ignore_prepared_report=True)\n` +
		`tot = next(r for r in tb["result"] if isinstance(r, dict) and str(r.get("account", "")).strip().startswith("'"))\n` +
		`out["tb_debit"], out["tb_credit"] = tot["debit"], tot["credit"]\n` +
		`ar = rr("Accounts Receivable", filters={"company": C, "report_date": "${MONTH.to}",\n` +
		`    "ageing_based_on": "Due Date", "range": "30, 60, 90, 120"}, ignore_prepared_report=True)\n` +
		`cols = [c["fieldname"] for c in ar["columns"]]\n` +
		`arr = next(r for r in ar["result"] if isinstance(r, list))\n` +
		`out["ar_outstanding"] = float(arr[cols.index("outstanding")] or 0)\n` +
		`ap = rr("Accounts Payable", filters={"company": C, "report_date": "${MONTH.to}",\n` +
		`    "ageing_based_on": "Due Date", "range": "30, 60, 90, 120"}, ignore_prepared_report=True)\n` +
		`pcols = [c["fieldname"] for c in ap["columns"]]\n` +
		`apr = next(r for r in ap["result"] if isinstance(r, list))\n` +
		`out["ap_outstanding"] = float(apr[pcols.index("outstanding")] or 0)\n` +
		`pl = rr("Profit and Loss Statement", filters={"company": C, "filter_based_on": "Date Range",\n` +
		`    "period_start_date": "${MONTH.from}", "period_end_date": "${MONTH.to}",\n` +
		`    "periodicity": "Yearly"}, ignore_prepared_report=True)\n` +
		`out["pl_summary"] = [s["value"] for s in pl["report_summary"]]\n` +
		`bs = rr("Balance Sheet", filters={"company": C, "filter_based_on": "Date Range",\n` +
		`    "period_start_date": "${MONTH.from}", "period_end_date": "${MONTH.to}",\n` +
		`    "periodicity": "Yearly"}, ignore_prepared_report=True)\n` +
		`out["bs_summary"] = [s["value"] for s in bs["report_summary"]]\n` +
		`gl = rr("General Ledger", filters=dict(month, group_by="Group by Voucher (Consolidated)"), ignore_prepared_report=True)\n` +
		`glt = next(r for r in gl["result"] if isinstance(r, dict) and str(r.get("account", "")).strip().startswith("'الإجمالي"))\n` +
		`out["gl_debit"], out["gl_credit"] = glt["debit"], glt["credit"]\n` +
		`out["stmt_customer"] = float(frappe.db.sql("select coalesce(sum(debit-credit),0) from \`tabGL Entry\` where company=%s and is_cancelled=0 and party_type='Customer' and party=%s and posting_date <= %s", (C, "DEV-SEED عبدالله المطيري", "${MONTH.to}"))[0][0])\n` +
		`out["stmt_bank"] = float(frappe.db.sql("select coalesce(sum(debit-credit),0) from \`tabGL Entry\` where company=%s and is_cancelled=0 and account=%s and posting_date <= %s", (C, "البنك - BDEV", "${MONTH.to}"))[0][0])\n` +
		`out["vat_output"] = float(frappe.db.sql("select coalesce(sum(t.base_tax_amount_after_discount_amount),0) from \`tabSales Taxes and Charges\` t join \`tabSales Invoice\` si on si.name=t.parent where si.company=%s and si.docstatus=1 and t.account_head='Output VAT - BDEV' and si.posting_date between %s and %s", (C, "${MONTH.from}", "${MONTH.to}"))[0][0])\n` +
		`out["vat_input"] = float(frappe.db.sql("select coalesce(sum(case when t.add_deduct_tax='Deduct' then -t.base_tax_amount_after_discount_amount else t.base_tax_amount_after_discount_amount end),0) from \`tabPurchase Taxes and Charges\` t join \`tabPurchase Invoice\` pi on pi.name=t.parent where pi.company=%s and pi.docstatus=1 and t.account_head='Input VAT - BDEV' and t.category != 'Valuation' and pi.posting_date between %s and %s", (C, "${MONTH.from}", "${MONTH.to}"))[0][0])\n` +
		`out["vat_ledger"] = float(frappe.db.sql("select coalesce(sum(g.credit-g.debit),0) from \`tabGL Entry\` g join \`tabAccount\` a on a.name=g.account where g.company=%s and g.is_cancelled=0 and a.account_type='Tax' and a.is_group=0 and g.posting_date between %s and %s", (C, "${MONTH.from}", "${MONTH.to}"))[0][0])\n` +
		`print("EXPECT=" + json.dumps(out))\n`
	);
	const m = out.match(/EXPECT=(\{.*\})/);
	if (!m) throw new Error("could not mint expectations: " + out.slice(0, 400));
	return JSON.parse(m[1]);
}

// ── Tiny runner (smoke.mjs convention: sequential, shared state) ────────────
// A failing test must not poison the rest: the runner photographs the wreck,
// then forces the stage back to the gallery before the next test speaks.
// (Measured: the first run cascaded 20 timeouts off one stale-bundle failure.)
const results = [];
let recover = async () => {};
let snapshot = async () => "";
async function test(name, fn) {
	try {
		await fn();
		results.push([name, true, ""]);
		console.log(`PASS  ${name}`);
	} catch (err) {
		const shot = await snapshot();
		results.push([name, false, String(err.message || err).slice(0, 300)]);
		console.log(
			`FAIL  ${name}\n      ${String(err.message || err).slice(0, 300)}` +
			(shot ? `\n      [shot] ${shot}` : "")
		);
		await recover();
	}
}

const num = (text) => {
	const m = String(text).replace(/[,٬]/g, "").match(/-?\d+(?:\.\d+)?/);
	return m ? parseFloat(m[0]) : NaN;
};
const close = (a, b) => Math.abs(a - b) < 0.01;

// ── The walk ────────────────────────────────────────────────────────────────
const CONSOLE_ALLOWLIST = [
	/socket\.io/i,
	/Invalid origin/i,
	/\/undefined/,
	/Failed to load resource/,
	/favicon/i,
];

async function main() {
	const sid = mintSid();
	const expect = mintExpectations();
	console.log("expectations minted:", Object.keys(expect).length, "figures");

	const browser = await chromium.launch({
		args: ['--host-resolver-rules=MAP bunood.localhost 127.0.0.1'],
	});
	const context = await browser.newContext({
		viewport: { width: 1440, height: 940 },
		acceptDownloads: true,
	});
	context.setDefaultTimeout(15000);
	await context.addCookies([{ name: "sid", value: sid, url: URL_BASE }]);
	const page = await context.newPage();

	// آلة التعافي: لقطة للحطام، ثم عودة قسرية إلى شبكة النطاق الجاري.
	let shotIndex = 0;
	let currentDomain = "المبيعات";
	snapshot = async () => {
		try {
			const path = `/tmp/studio-shots/fail-${String(++shotIndex).padStart(2, "0")}.png`;
			await page.screenshot({ path, timeout: 5000 });
			return path;
		} catch {
			return "";
		}
	};
	recover = async () => {
		try {
			// نافذة msgprint عالقة تحجب كل نقر — اطردها قبل أي شيء.
			if (await page.$(".modal.show")) {
				await page.keyboard.press("Escape");
				await page.waitForTimeout(400);
			}
			if (!(await page.$(".bnd-studio__grid"))) {
				await page.goto(`${URL_BASE}/app/bnd-report-studio`, { waitUntil: "domcontentloaded" });
				await page.waitForSelector(".bnd-studio__grid", { timeout: 20000 });
			}
			if (currentDomain !== "المبيعات") {
				await page.click(`.bnd-studio__domain >> text="${currentDomain}"`);
				await page.waitForTimeout(300);
			}
		} catch {
			// الاختبار التالي سيقول ما وجد.
		}
	};

	const consoleErrors = [];
	page.on("pageerror", (e) => consoleErrors.push(String(e)));
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});

	const tiles = async () =>
		page.$$eval(".bnd-studio__kpi:not(.is-skeleton)", (nodes) =>
			nodes.map((n) => ({
				label: (n.querySelector(".bnd-studio__kpi-label") || {}).textContent || "",
				value: (n.querySelector(".bnd-studio__kpi-value") || {}).textContent || "",
			}))
		);
	const tileByLabel = async (needle) => {
		const all = await tiles();
		const hit = all.find((t) => t.label.includes(needle));
		if (!hit) throw new Error(`no tile labelled «${needle}» among: ${all.map((t) => t.label).join(" | ")}`);
		return num(hit.value);
	};
	const waitViewer = async () => {
		await page.waitForFunction(
			() =>
				document.querySelector(".bnd-studio__kpi:not(.is-skeleton)") ||
				document.querySelector(".bnd-studio__picker") ||
				document.querySelector(".bnd-studio__error") ||
				document.querySelector(".bnd-studio__empty"),
			{ timeout: 30000 }
		);
		if (await page.$(".bnd-studio__error")) {
			const text = await page.$eval(".bnd-studio__error", (n) => n.textContent);
			throw new Error("viewer error state: " + text.slice(0, 160));
		}
	};
	const openCard = async (title) => {
		await page.click(`.bnd-studio__card:not(.is-missing) >> text="${title}"`);
		await waitViewer();
	};
	const goBack = async () => {
		await page.click(".bnd-studio__back");
		await page.waitForSelector(".bnd-studio__grid");
	};
	const openDomain = async (label) => {
		await page.click(`.bnd-studio__domain >> text="${label}"`);
		await page.waitForSelector(".bnd-studio__grid");
		currentDomain = label;
	};
	const rowCount = () => page.$$eval(".bnd-studio__table tbody tr:not(.is-spacer)", (r) => r.length);

	// ── Boot ──
	await test("البوابة تفتح بثلاثة نطاقات وبطاقاتها كاملة", async () => {
		await page.goto(`${URL_BASE}/app/bnd-report-studio`, { waitUntil: "domcontentloaded" });
		await page.waitForSelector(".bnd-studio__grid", { timeout: 30000 });
		const domains = await page.$$eval(".bnd-studio__domain", (n) => n.length);
		if (domains !== 3) throw new Error(`domains=${domains}`);
		const rtl = await page.$eval("html", (h) => h.dir);
		if (rtl !== "rtl") throw new Error(`dir=${rtl} — Administrator is Arabic`);
	});

	// ── التنقل: فتح البطاقة خطوة تاريخ حقيقية ──
	await test("رجوع المتصفح خطوةٌ داخل الاستوديو لا خروجٌ منه", async () => {
		await openCard("سجل المبيعات");
		await page.goBack();
		await page.waitForSelector(".bnd-studio__grid", { timeout: 15000 });
		if (!page.url().includes("bnd-report-studio")) {
			throw new Error("left the studio: " + page.url());
		}
	});

	// ── المبيعات ──
	await test("سجل المبيعات: بلاطة الضريبة وعمودها", async () => {
		await openCard("سجل المبيعات");
		const tax = await tileByLabel("مجموع الضرائب");
		if (!close(tax, expect.sales_tax)) throw new Error(`tax tile ${tax} != ${expect.sales_tax}`);
		const headers = await page.$$eval(".bnd-studio__table thead th", (n) => n.map((x) => x.textContent));
		if (!headers.some((h) => h.includes("مجموع الضرائب"))) throw new Error("tax column missing: " + headers.join("|"));
		if ((await rowCount()) < 1) throw new Error("no rows");
	});
	await test("سجل المبيعات: كل الأعمدة والبحث", async () => {
		const before = await page.$$eval(".bnd-studio__table thead th", (n) => n.length);
		await page.click('.bnd-studio__action >> text="كل الأعمدة"');
		await page.waitForFunction(
			(b) => document.querySelectorAll(".bnd-studio__table thead th").length > b, before);
		await page.fill(".bnd-studio__search", "عبدالله");
		await page.waitForFunction(() =>
			document.querySelector(".bnd-studio__count").textContent.length > 0);
		await page.fill(".bnd-studio__search", "");
		await page.click('.bnd-studio__action >> text="الأعمدة الرئيسة"');
		await goBack();
	});
	await test("تصدير Excel: مصنّف حقيقي بجدول منظّم وأرقام بالفلس", async () => {
		await openCard("سجل المبيعات");
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.click('.bnd-studio__action >> text="تصدير Excel"'),
		]);
		await download.saveAs("/tmp/studio-export.xlsx");
		// يُفتح الملف بمكتبة مستقلة (openpyxl) — صحة الحاوية والأرقام معاً.
		const out = benchPy(
			`from openpyxl import load_workbook\n` +
			`wb = load_workbook("/tmp/studio-export.xlsx")\n` +
			`ws = wb.active\n` +
			`hdr = None\n` +
			`for r in range(1, 15):\n` +
			`    for c in range(1, ws.max_column + 1):\n` +
			`        if ws.cell(r, c).value == "مجموع الضرائب":\n` +
			`            hdr = (r, c)\n` +
			`nums = [ws.cell(r, hdr[1]).value for r in range(hdr[0] + 1, ws.max_row + 1)]\n` +
			`nums = [v for v in nums if isinstance(v, (int, float))]\n` +
			`print("XL|rtl=%s|tables=%d|title=%s|last=%.2f|rest=%.2f" % (\n` +
			`    bool(ws.sheet_view.rightToLeft), len(ws.tables), ws.cell(1, 1).value, nums[-1], sum(nums[:-1])))\n`
		);
		const m = out.match(/XL\|rtl=(\w+)\|tables=(\d+)\|title=([^|]+)\|last=([-\d.]+)\|rest=([-\d.]+)/);
		if (!m) throw new Error("xlsx probe failed: " + out.slice(-300));
		if (m[1] !== "True") throw new Error("sheet is not RTL");
		if (m[2] !== "1") throw new Error("no structured Excel table inside");
		if (!m[3].includes("سجل المبيعات")) throw new Error("title cell: " + m[3]);
		if (!close(parseFloat(m[4]), expect.sales_tax)) throw new Error(`xlsx total ${m[4]} != ${expect.sales_tax}`);
		if (!close(parseFloat(m[5]), expect.sales_tax)) throw new Error(`xlsx sum ${m[5]} != ${expect.sales_tax}`);
		await goBack();
	});
	await test("سجل المبيعات حسب الصنف يعرض", async () => {
		await openCard("سجل المبيعات حسب الصنف");
		if ((await tiles()).length < 2) throw new Error("tiles missing");
		await goBack();
	});
	await test("الربح الإجمالي: البلاطات والهامش وشريط الإيضاح", async () => {
		await openCard("الربح الإجمالي");
		const profit = await tileByLabel("الربح الإجمالي");
		if (!close(profit, expect.gp_profit)) throw new Error(`profit ${profit} != ${expect.gp_profit}`);
		const margin = await tileByLabel("نسبة الهامش");
		const expMargin = (expect.gp_profit / expect.gp_selling) * 100;
		if (!close(Math.round(margin * 10), Math.round(expMargin * 10))) throw new Error(`margin ${margin} != ${expMargin}`);
		const note = await page.$eval(".bnd-studio__note", (n) => n.textContent);
		if (!note.includes("صافٍ من ضريبة القيمة المضافة")) throw new Error("clarity note missing");
		await goBack();
	});
	await test("المبيعات والمرتجعات: الأربع بلاطات بالفلس", async () => {
		await openCard("المبيعات والمرتجعات");
		for (const [label, key] of [["إجمالي المبيعات", "sales_gross"], ["المرتجعات", "sales_returns"],
			["صافي المبيعات", "sales_net"], ["صافي الضريبة", "sales_tax"]]) {
			const v = await tileByLabel(label);
			if (!close(v, expect[key])) throw new Error(`${label}: ${v} != ${expect[key]}`);
		}
	});
	await test("المبيعات والمرتجعات: رقاقة المرتجعات ترشّح الصفوف", async () => {
		await page.click('.bnd-studio__tabletools .bnd-studio__chip >> text="المرتجعات"');
		await page.waitForFunction((n) =>
			document.querySelectorAll(".bnd-studio__table tbody tr.is-return").length === n &&
			document.querySelectorAll(".bnd-studio__table tbody tr:not(.is-spacer):not(.is-total)").length === n,
			expect.sales_return_rows);
		await page.click('.bnd-studio__tabletools .bnd-studio__chip >> text="الكل"');
		await goBack();
	});
	await test("تحليل أوامر البيع يعرض", async () => {
		await openCard("تحليل أوامر البيع");
		if ((await tiles()).length < 2) throw new Error("tiles missing");
		await goBack();
	});
	await test("ملخص مندوبي المبيعات: حالة فارغة صادقة", async () => {
		await openCard("ملخص المعاملات حسب مندوب المبيعات");
		const empty = await page.$(".bnd-studio__empty");
		if (!empty) {
			if ((await tiles()).length < 1) throw new Error("neither tiles nor empty state");
		}
		await goBack();
	});
	await test("المبيعات حسب منطقة المبيعات يعرض", async () => {
		await openCard("المبيعات حسب منطقة المبيعات");
		if ((await tiles()).length < 1) throw new Error("tiles missing");
		await goBack();
	});

	// ── المشتريات ──
	await test("سجل المشتريات: ضريبة المدخلات حاضرة", async () => {
		await openDomain("المشتريات");
		await openCard("سجل المشتريات");
		const tax = await tileByLabel("مجموع الضرائب");
		if (!close(tax, expect.buy_tax)) throw new Error(`input tax ${tax} != ${expect.buy_tax}`);
		await goBack();
	});
	await test("سجل المشتريات حسب الصنف يعرض", async () => {
		await openCard("سجل المشتريات حسب الصنف");
		if ((await tiles()).length < 2) throw new Error("tiles missing");
		await goBack();
	});
	await test("المشتريات والمرتجعات: الأربع بلاطات بالفلس", async () => {
		await openCard("المشتريات والمرتجعات");
		for (const [label, key] of [["إجمالي المشتريات", "buy_gross"], ["المرتجعات", "buy_returns"],
			["صافي المشتريات", "buy_net"], ["صافي الضريبة", "buy_tax"]]) {
			const v = await tileByLabel(label);
			if (!close(v, expect[key])) throw new Error(`${label}: ${v} != ${expect[key]}`);
		}
		await goBack();
	});
	await test("تحليل أوامر الشراء يعرض", async () => {
		await openCard("تحليل أوامر الشراء");
		if ((await tiles()).length < 2) throw new Error("tiles missing");
		await goBack();
	});
	await test("متتبع المشتريات يعرض بمساره الكامل", async () => {
		await openCard("متتبع المشتريات");
		if ((await tiles()).length < 2) throw new Error("tiles missing");
		if ((await rowCount()) < 1) throw new Error("no rows");
		await goBack();
	});
	await test("ملخص دفتر أستاذ الموردين (محرك عام بلا تلميحات)", async () => {
		await openCard("ملخص دفتر أستاذ الموردين");
		if ((await tiles()).length < 1) throw new Error("tiles missing");
		await goBack();
	});

	// ── المحاسبة ──
	await test("كشف حساب: منتقي ← عميل ← رصيد ختامي بالفلس", async () => {
		await openDomain("المحاسبة");
		await openCard("كشف حساب");
		await page.waitForSelector(".bnd-studio__picker");
		await page.click('.bnd-studio__picker-item >> text="DEV-SEED عبدالله المطيري"');
		await waitViewer();
		const closing = await tileByLabel("الرصيد الختامي");
		if (!close(closing, expect.stmt_customer)) throw new Error(`closing ${closing} != ${expect.stmt_customer}`);
		const heading = await page.$eval(".bnd-studio__heading .bnd-studio__title", (n) => n.textContent);
		if (!heading.includes("عبدالله")) throw new Error("heading is not the entity: " + heading);
	});
	await test("كشف حساب: «تغيير» ← رقاقة البنك ← رصيده بالفلس", async () => {
		await page.click('.bnd-studio__action >> text="تغيير"');
		await page.waitForSelector(".bnd-studio__picker");
		await page.click('.bnd-studio__picker-quick .bnd-studio__chip >> text="البنك"');
		await waitViewer();
		const closing = await tileByLabel("الرصيد الختامي");
		if (!close(closing, expect.stmt_bank)) throw new Error(`bank closing ${closing} != ${expect.stmt_bank}`);
	});
	await test("كشف حساب: الرجوع خطوة واحدة — كيان ← منتقٍ ← بطاقات", async () => {
		// من كشف كيانٍ، «رجوع» يعود إلى المنتقي لا يقفز فوقه إلى البطاقات.
		await page.click(".bnd-studio__back");
		await page.waitForSelector(".bnd-studio__picker");
		await goBack();
	});
	await test("الإقرار الضريبي: فواتير وقيود وأستاذ — كلٌّ بفلسه", async () => {
		await openCard("الإقرار الضريبي");
		const output = await tileByLabel("ضريبة المخرجات");
		const input = await tileByLabel("ضريبة المدخلات");
		const netInvoices = await tileByLabel("صافي الضريبة المستحقة");
		const netLedger = await tileByLabel("وفق الأستاذ");
		if (!close(output, expect.vat_output)) throw new Error(`output ${output} != ${expect.vat_output}`);
		if (!close(input, expect.vat_input)) throw new Error(`input ${input} != ${expect.vat_input}`);
		if (!close(netInvoices, expect.vat_output - expect.vat_input)) {
			throw new Error(`net ${netInvoices} != ${expect.vat_output - expect.vat_input}`);
		}
		if (!close(netLedger, expect.vat_ledger)) {
			throw new Error(`ledger net ${netLedger} != ${expect.vat_ledger}`);
		}
		const sections = await page.$$eval(".bnd-studio__table tbody tr.is-section", (r) => r.length);
		if (sections < 6) throw new Error(`section rows=${sections}`);
		const table = await page.$eval(".bnd-studio__table", (n) => n.textContent);
		for (const needle of ["قيود اليومية (مدين)", "قيود اليومية (دائن)", "خلاصة الإقرار",
			"الرقم الضريبي", "فحص الأستاذ"]) {
			if (!table.includes(needle)) throw new Error(`worksheet line missing: ${needle}`);
		}
		const note = await page.$eval(".bnd-studio__note", (n) => n.textContent);
		if (!note.includes("هيئة الزكاة")) throw new Error("scope note missing: " + note.slice(0, 120));
		await goBack();
	});
	await test("الطباعة: ترويسة A4 رسمية وذيل ثابت ورأس جدول يتكرر", async () => {
		await openCard("الإقرار الضريبي");
		await page.emulateMedia({ media: "print" });
		const head = await page.$eval(".bnd-studio__printhead", (n) => ({
			display: getComputedStyle(n).display,
			text: n.textContent,
		}));
		if (head.display === "none") throw new Error("printhead hidden in print media");
		if (!head.text.includes("310122393500003")) {
			throw new Error("tax id missing from letterhead: " + head.text.slice(0, 140));
		}
		if (!head.text.includes("فترة التقرير")) throw new Error("period missing from letterhead");
		const navbar = await page
			.$eval(".navbar", (n) => getComputedStyle(n).display)
			.catch(() => "none");
		if (navbar !== "none") throw new Error("desk navbar would print: " + navbar);
		for (const part of ["topbar", "bottombar"]) {
			const display = await page
				.$eval(`[data-bnd-part="${part}"]`, (n) => getComputedStyle(n).display)
				.catch(() => "none");
			if (display !== "none") throw new Error(`theme ${part} would print: ${display}`);
		}
		// معلومات فقط: لا بلاطات ولا مخطط ولا عنوان شاشةٍ مكرر على الورق.
		for (const selector of [".bnd-studio__kpi", ".bnd-studio__chartcard", ".bnd-studio__viewhead"]) {
			const display = await page
				.$eval(selector, (n) => getComputedStyle(n).display)
				.catch(() => "none");
			if (display !== "none") throw new Error(`${selector} would print: ${display}`);
		}
		const note = await page
			.$eval(".bnd-studio__note", (n) => getComputedStyle(n).display)
			.catch(() => "missing");
		if (note === "none" || note === "missing") throw new Error("scope note lost from paper: " + note);
		const thead = await page.$eval(".bnd-studio__table thead", (n) => getComputedStyle(n).display);
		if (thead !== "table-header-group") throw new Error("thead display: " + thead);
		const foot = await page.$eval(".bnd-studio__printfoot", (n) => getComputedStyle(n).position);
		if (foot !== "fixed") throw new Error("printfoot position: " + foot);
		await page.emulateMedia({ media: "screen" });
		await goBack();
	});
	await test("الأستاذ العام: إجماليا الحركة بالفلس", async () => {
		await openCard("الأستاذ العام");
		const debit = await tileByLabel("إجمالي المدين");
		const credit = await tileByLabel("إجمالي الدائن");
		if (!close(debit, expect.gl_debit)) throw new Error(`debit ${debit} != ${expect.gl_debit}`);
		if (!close(credit, expect.gl_credit)) throw new Error(`credit ${credit} != ${expect.gl_credit}`);
		await goBack();
	});
	await test("الحسابات المدينة: المتبقي وشرائح الأعمار", async () => {
		await openCard("الحسابات المدينة");
		const outstanding = await tileByLabel("المبلغ المتبقي");
		if (!close(outstanding, expect.ar_outstanding)) throw new Error(`${outstanding} != ${expect.ar_outstanding}`);
		// شرائح كلها صفر (لا متأخرات) = لا مخطط، بصدق. إن وُجد فليكن مسمّىً صحيحاً.
		const chartTitle = await page.$(".bnd-studio__chart-title");
		if (chartTitle) {
			const text = await chartTitle.textContent();
			if (!text.includes("شرائح الأعمار")) throw new Error("bucket chart title: " + text);
		} else if (!(await page.$(".bnd-studio__chartcard.is-empty"))) {
			throw new Error("neither an ageing chart nor an honest empty chart card");
		}
		await goBack();
	});
	await test("الحسابات الدائنة: المتبقي بالفلس", async () => {
		await openCard("الحسابات الدائنة");
		const outstanding = await tileByLabel("المبلغ المتبقي");
		if (!close(outstanding, expect.ap_outstanding)) throw new Error(`${outstanding} != ${expect.ap_outstanding}`);
		await goBack();
	});
	await test("ميزان المراجعة: توازنٌ معلن وأرقام بالفلس", async () => {
		await openCard("ميزان المراجعة");
		const debit = await tileByLabel("إجمالي المدين");
		const credit = await tileByLabel("إجمالي الدائن");
		if (!close(debit, expect.tb_debit) || !close(credit, expect.tb_credit)) {
			throw new Error(`TB ${debit}/${credit} != ${expect.tb_debit}/${expect.tb_credit}`);
		}
		const check = await page.$eval(".bnd-studio__kpi-value.is-good", (n) => n.textContent);
		if (!check.includes("متوازن")) throw new Error("balance check tile: " + check);
		await goBack();
	});
	await test("قائمة الأرباح والخسائر: بلاطات ملخص الخادم حرفياً", async () => {
		await openCard("قائمة الأرباح والخسائر");
		const all = await tiles();
		const values = all.map((t) => num(t.value)).filter((v) => isFinite(v));
		for (const v of expect.pl_summary) {
			if (!values.some((x) => close(x, v))) throw new Error(`summary value ${v} not on tiles: ${values.join(",")}`);
		}
	});
	await test("قائمة الأرباح والخسائر: الشجرة تُطوى", async () => {
		const before = await rowCount();
		await page.click(".bnd-studio__caret");
		await page.waitForFunction((b) =>
			document.querySelectorAll(".bnd-studio__table tbody tr:not(.is-spacer)").length < b, before);
		await page.click(".bnd-studio__caret");
		await goBack();
	});
	await test("قائمة المركز المالي: الأصول = الالتزامات + الحقوق + الربح", async () => {
		await openCard("قائمة المركز المالي");
		const all = await tiles();
		const values = all.map((t) => num(t.value)).filter((v) => isFinite(v));
		const [assets, liab, equity, prov] = expect.bs_summary;
		if (!values.some((x) => close(x, assets))) throw new Error(`assets ${assets} not on tiles`);
		if (!close(assets, liab + equity + prov)) throw new Error("balance identity broken server-side");
		await goBack();
	});

	// ── ميزانية أخطاء الطرفية ──
	await test("صفر أخطاء طرفية غير مبررة عبر الجولة كلها", async () => {
		const real = consoleErrors.filter((e) => !CONSOLE_ALLOWLIST.some((re) => re.test(e)));
		if (real.length) throw new Error(`${real.length} error(s): ` + real.slice(0, 3).join(" || ").slice(0, 250));
	});

	await browser.close();

	const passed = results.filter(([, ok]) => ok).length;
	console.log(`\nSTUDIO SUITE: ${passed}/${results.length} passed`);
	process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
	console.error("SUITE CRASHED:", err);
	process.exit(2);
});
