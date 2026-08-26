/**
 * Take a freshly created site to suite-ready.
 *
 * WHY THIS FILE EXISTS
 *   `bench new-site --install-app erpnext` does NOT give you an ERPNext site.
 *   It gives you the schema. Everything the setup wizard would have written —
 *   the UOM table, the fiscal year, the site defaults, a company with a chart
 *   of accounts — is simply absent, and a site missing them fails a large share
 *   of the suite for reasons that never mention the missing thing.
 *
 *   That indirection is the whole point of this file. Measured on 2026-08-26,
 *   each symptom and its real cause:
 *
 *     "the fixture grid has two rows (got 1)"
 *         The form check needs an Item with two UOM conversion rows. Its own
 *         ensure-block appends from `frappe.get_all("UOM", limit=6)` — and the
 *         site held exactly ONE UOM, so the loop could never reach two. 239
 *         UOMs later it passes. Nothing in the failure mentions UOMs.
 *
 *     ".report-summary resolved to hidden" (62x)
 *         Balance Sheet ran fine server-side and returned 4 summary entries.
 *         The ledger was empty — 0 GL Entries, 0 submitted invoices — so the
 *         strip had nothing to show. Submitting the drafts fixed it.
 *
 *     "pageerror: Filter missing" (x6), and a 417 before that
 *         The same report's required filters come from SITE DEFAULTS. A site
 *         that never ran the wizard has no default company and no default
 *         fiscal year, so the filters arrive empty and the report throws.
 *
 *   Company creation itself walks the same gauntlet, one link error at a time:
 *   Warehouse Type "Transit", then a default Address Template, then a Fiscal
 *   Year, then a selling Price List. Each one only appears after the last is
 *   fixed, which is a slow way to spend an afternoon.
 *
 * WHAT THIS IS NOT
 *   Not a replacement for the setup wizard, and deliberately not
 *   `setup_complete()`: that runs onboarding, writes a chart of accounts from a
 *   template and takes minutes. This writes the minimum a TEST BENCH needs, and
 *   says so, so nobody mistakes this site for a tenant.
 *
 *   Not the views fixtures either. `tools/fixtures-views.mjs` seeds the kanban
 *   board, ToDos, Events and Items that the four alternate views are gated on.
 *   Run BOTH — this one first, since it installs the Item Groups and UOMs that
 *   one needs.
 *
 * IDEMPOTENT
 *   Every step checks before it writes, so re-running converges. Safe to run
 *   against a site that is already half-seeded, which is the usual case after
 *   a partial failure.
 *
 * USAGE
 *   node tools/fixtures-bench.mjs            # seed
 *   node tools/fixtures-bench.mjs --report   # say what is present, write nothing
 *
 *   then: node tools/fixtures-views.mjs
 *         npm run verify
 */

import { benchPy } from "./session.mjs";

const REPORT_ONLY = process.argv.includes("--report");
const COMPANY = process.env.BND_COMPANY || "Bunood Demo";
const ABBR = process.env.BND_ABBR || "BD";
const COUNTRY = process.env.BND_COUNTRY || "Saudi Arabia";
const CURRENCY = process.env.BND_CURRENCY || "SAR";

const py = (code) => benchPy(code).trim();

/** Read the site's current state without changing it. */
function survey() {
	const out = py(
		`import json\n` +
			`counts = {dt: frappe.db.count(dt) for dt in (\n` +
			`    "UOM", "Item Group", "Company", "Fiscal Year", "Price List",\n` +
			`    "Address Template", "Warehouse Type", "GL Entry", "Item", "Customer")}\n` +
			`counts["submitted Sales Invoice"] = frappe.db.count("Sales Invoice", {"docstatus": 1})\n` +
			`counts["default company"] = 1 if frappe.defaults.get_global_default("company") else 0\n` +
			`counts["default fiscal_year"] = 1 if frappe.defaults.get_global_default("fiscal_year") else 0\n` +
			`counts["setup_complete"] = 1 if frappe.is_setup_complete() else 0\n` +
			`print(json.dumps(counts))\n`
	);
	return JSON.parse(out.split("\n").pop());
}

/**
 * ERPNext's own master data — UOMs, item groups, market segments.
 *
 * This is what the wizard calls, and it is the single highest-value step: the
 * UOM table alone takes the site from 1 row to 239, which is the difference
 * between the form checks passing and failing.
 */
function masters() {
	return py(
		`frappe.flags.in_setup_wizard = True\n` +
			`from erpnext.setup.setup_wizard.operations import install_fixtures\n` +
			`before = frappe.db.count("UOM")\n` +
			`if before < 50:\n` +
			`    install_fixtures.install(country=${JSON.stringify(COUNTRY)})\n` +
			`    install_fixtures.add_uom_data()\n` +
			`    frappe.db.commit()\n` +
			`print("UOM %d -> %d" % (before, frappe.db.count("UOM")))\n`
	);
}

/**
 * The link targets a Company insert walks through, in the order it hits them.
 *
 * Ordered deliberately: each is what the NEXT step's validation asks for, and
 * discovering that order one exception at a time is the cost this saves.
 */
function prerequisites() {
	return py(
		`made = []\n` +
			`if not frappe.db.exists("Warehouse Type", "Transit"):\n` +
			`    frappe.get_doc({"doctype": "Warehouse Type", "name": "Transit"}).insert(ignore_permissions=True)\n` +
			`    made.append("Warehouse Type Transit")\n` +
			`if not frappe.db.exists("Address Template", {"is_default": 1}):\n` +
			`    frappe.get_doc({"doctype": "Address Template", "country": ${JSON.stringify(COUNTRY)},\n` +
			`        "is_default": 1,\n` +
			`        "template": "{{ address_line1 }}{% if city %}<br>{{ city }}{% endif %}"\n` +
			`                    "{% if pincode %} {{ pincode }}{% endif %}"\n` +
			`                    "{% if country %}<br>{{ country }}{% endif %}"}).insert(ignore_permissions=True)\n` +
			`    made.append("Address Template")\n` +
			`frappe.db.commit()\n` +
			`print("prerequisites: %s" % (", ".join(made) or "already present"))\n`
	);
}

/** A company with the identity fields the letter head prints. */
function company() {
	return py(
		`C = ${JSON.stringify(COMPANY)}\n` +
			`if not frappe.db.exists("Company", C):\n` +
			`    frappe.get_doc({"doctype": "Company", "company_name": C, "abbr": ${JSON.stringify(ABBR)},\n` +
			`        "default_currency": ${JSON.stringify(CURRENCY)}, "country": ${JSON.stringify(COUNTRY)}\n` +
			`        }).insert(ignore_permissions=True)\n` +
			`    frappe.db.commit()\n` +
			`c = frappe.get_doc("Company", C)\n` +
			`# The fields bunood_theme's letter head reads. tax_id is stock; the\n` +
			`# commercial registration is a custom field printing/install.py adds,\n` +
			`# so set it only when it exists.\n` +
			`c.tax_id = c.tax_id or "300000000000003"\n` +
			`c.phone_no = c.phone_no or "+966 11 000 0000"\n` +
			`c.email = c.email or "info@bunood.test"\n` +
			`c.website = c.website or "https://bunood.test"\n` +
			`if c.meta.has_field("bnd_commercial_registration") and not c.get("bnd_commercial_registration"):\n` +
			`    c.bnd_commercial_registration = "1010000000"\n` +
			`c.save(ignore_permissions=True)\n` +
			`if not frappe.db.exists("Address", {"address_title": C}):\n` +
			`    frappe.get_doc({"doctype": "Address", "address_title": C, "address_type": "Billing",\n` +
			`        "address_line1": "طريق الملك فهد، برج المملكة", "city": "الرياض",\n` +
			`        "pincode": "12211", "country": ${JSON.stringify(COUNTRY)}, "is_primary_address": 1,\n` +
			`        "links": [{"link_doctype": "Company", "link_name": C}]}).insert(ignore_permissions=True)\n` +
			`frappe.db.commit()\n` +
			`print("company: %s" % C)\n`
	);
}

/** Fiscal year and a selling price list — what a Sales Invoice insert demands. */
function accounting() {
	return py(
		`C = ${JSON.stringify(COMPANY)}\n` +
			`y = frappe.utils.nowdate()[:4]\n` +
			`if not frappe.db.exists("Fiscal Year", y):\n` +
			`    frappe.get_doc({"doctype": "Fiscal Year", "year": y,\n` +
			`        "year_start_date": "%s-01-01" % y, "year_end_date": "%s-12-31" % y,\n` +
			`        "companies": [{"company": C}]}).insert(ignore_permissions=True)\n` +
			`if not frappe.db.get_value("Price List", {"selling": 1}, "name"):\n` +
			`    frappe.get_doc({"doctype": "Price List", "price_list_name": "Standard Selling",\n` +
			`        "selling": 1, "currency": ${JSON.stringify(CURRENCY)}, "countries": []\n` +
			`        }).insert(ignore_permissions=True)\n` +
			`frappe.db.commit()\n` +
			`print("fiscal year %s, price list %s" % (y, frappe.db.get_value("Price List", {"selling": 1}, "name")))\n`
	);
}

/**
 * Site defaults.
 *
 * Report filters read these directly. Without them Balance Sheet arrives with
 * empty required filters and the page reports "Filter missing" six times —
 * a failure that names neither the default nor the wizard.
 */
function defaults() {
	return py(
		`C = ${JSON.stringify(COMPANY)}\n` +
			`fy = frappe.db.get_value("Fiscal Year", {}, "name")\n` +
			`gd = frappe.get_doc("Global Defaults")\n` +
			`gd.default_company = C\n` +
			`gd.current_fiscal_year = fy\n` +
			`gd.country = ${JSON.stringify(COUNTRY)}\n` +
			`gd.default_currency = ${JSON.stringify(CURRENCY)}\n` +
			`gd.save(ignore_permissions=True)\n` +
			`# Set explicitly rather than trusting Global Defaults' side effects:\n` +
			`# the report filters read frappe.defaults, not the doctype.\n` +
			`year = frappe.get_doc("Fiscal Year", fy)\n` +
			`frappe.db.set_default("company", C)\n` +
			`frappe.db.set_default("fiscal_year", fy)\n` +
			`frappe.db.set_default("currency", ${JSON.stringify(CURRENCY)})\n` +
			`frappe.db.set_default("country", ${JSON.stringify(COUNTRY)})\n` +
			`frappe.db.set_default("year_start_date", year.year_start_date.strftime("%Y-%m-%d"))\n` +
			`frappe.db.set_default("year_end_date", year.year_end_date.strftime("%Y-%m-%d"))\n` +
			`frappe.db.commit()\n` +
			`frappe.clear_cache()\n` +
			`print("defaults: company=%s fiscal_year=%s" % (C, fy))\n`
	);
}

/**
 * Movement in the ledger.
 *
 * A submitted invoice, so the financial reports have something to report. The
 * checks that need this do not ask for an invoice — they wait for a summary
 * strip to become visible, and it never does over an empty ledger.
 */
function ledger() {
	return py(
		`C = ${JSON.stringify(COMPANY)}\n` +
			`if frappe.db.count("GL Entry"):\n` +
			`    print("ledger: %d GL entries already" % frappe.db.count("GL Entry"))\n` +
			`else:\n` +
			`    cust = frappe.db.get_value("Customer", {}, "name") or frappe.get_doc(\n` +
			`        {"doctype": "Customer", "customer_name": "عميل تجريبي"}).insert(ignore_permissions=True).name\n` +
			`    grp = frappe.db.get_value("Item Group", {"is_group": 0}, "name")\n` +
			`    item = frappe.db.get_value("Item", {"is_stock_item": 0}, "name") or frappe.get_doc(\n` +
			`        {"doctype": "Item", "item_code": "خدمة استشارية", "item_name": "خدمة استشارية",\n` +
			`         "item_group": grp, "stock_uom": "Nos", "is_stock_item": 0}\n` +
			`        ).insert(ignore_permissions=True).name\n` +
			`    pl = frappe.db.get_value("Price List", {"selling": 1}, "name")\n` +
			`    inv = frappe.get_doc({"doctype": "Sales Invoice", "company": C, "customer": cust,\n` +
			`        "posting_date": frappe.utils.nowdate(), "due_date": frappe.utils.nowdate(),\n` +
			`        "currency": ${JSON.stringify(CURRENCY)}, "selling_price_list": pl,\n` +
			`        "price_list_currency": ${JSON.stringify(CURRENCY)},\n` +
			`        "plc_conversion_rate": 1, "conversion_rate": 1,\n` +
			`        "items": [{"item_code": item, "qty": 2, "rate": 625}]}).insert(ignore_permissions=True)\n` +
			`    inv.debit_to = inv.debit_to or frappe.db.get_value(\n` +
			`        "Account", {"company": C, "account_type": "Receivable", "is_group": 0}, "name")\n` +
			`    inc = frappe.db.get_value("Account", {"company": C, "account_type": "Income Account", "is_group": 0}, "name") \\\n` +
			`        or frappe.db.get_value("Account", {"company": C, "root_type": "Income", "is_group": 0}, "name")\n` +
			`    cc = frappe.db.get_value("Cost Center", {"company": C, "is_group": 0}, "name")\n` +
			`    for it in inv.items:\n` +
			`        it.income_account = it.income_account or inc\n` +
			`        it.cost_center = it.cost_center or cc\n` +
			`    inv.save()\n` +
			`    inv.submit()\n` +
			`    frappe.db.commit()\n` +
			`    print("ledger: submitted %s, %d GL entries" % (inv.name, frappe.db.count("GL Entry")))\n`
	);
}

/**
 * Mark setup complete.
 *
 * LAST, on purpose. frappe.is_setup_complete() reads
 * `Installed Application.is_setup_complete` per app, NOT System Settings — so
 * setting the System Settings field does nothing and the desk keeps bouncing
 * every route to /desk/setup-wizard/0. Done at the end so the flag never claims
 * a site is ready before it is.
 */
function markComplete() {
	return py(
		`for n in frappe.get_all("Installed Application", pluck="name"):\n` +
			`    frappe.db.set_value("Installed Application", n, "is_setup_complete", 1)\n` +
			`frappe.db.commit()\n` +
			`frappe.clear_cache()\n` +
			`print("setup_complete: %s" % frappe.is_setup_complete())\n`
	);
}

const before = survey();
console.log("before:", JSON.stringify(before));

if (REPORT_ONLY) {
	console.log("\n--report: nothing written.");
	process.exit(0);
}

for (const step of [masters, prerequisites, company, accounting, defaults, ledger, markComplete]) {
	console.log("  " + step().split("\n").pop());
}

const after = survey();
console.log("after :", JSON.stringify(after));
console.log(
	"\nnext: node tools/fixtures-views.mjs   (kanban/calendar/gantt/gallery data)" +
		"\n      npm run verify"
);
