/**
 * Self-cleaning keyboard-only acceptance for three-line Sales/Purchase bills.
 *
 * Uses an operational non-System-Manager account, native Link autocomplete,
 * F3/Alt+I/F2 shortcuts, Enter-to-next-cell, Tab navigation and native submit.
 */
import { createRequire } from "node:module";
import { benchJson, benchPy, mintSid, URL_BASE } from "./session.mjs";
import { browserLaunchOptions } from "./browser.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const USER = "bunood-keyboard-qa@example.com";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function cleanup() {
	return benchPy([
		"for dt in ('Sales Invoice', 'Purchase Invoice'):",
		"    for name in frappe.get_all(dt, filters={'owner': " + JSON.stringify(USER) + "}, pluck='name'):",
		"        doc = frappe.get_doc(dt, name)",
		"        if doc.docstatus == 1:",
		"            doc.cancel()",
		"        frappe.delete_doc(dt, name, force=True, ignore_permissions=True)",
		"if frappe.db.exists('User', " + JSON.stringify(USER) + "):",
		"    frappe.delete_doc('User', " + JSON.stringify(USER) + ", force=True, ignore_permissions=True)",
		"frappe.db.commit()",
		"frappe.clear_cache()",
		"print('clean')",
	].join("\n") + "\n");
}

function setup() {
	cleanup();
	return benchJson([
		"roles = [r for r in ('Sales User', 'Purchase User', 'Accounts User') if frappe.db.exists('Role', r)]",
		"if len(roles) != 3:",
		"    raise AssertionError('required operational roles are missing: %s' % roles)",
		"user = frappe.get_doc({'doctype': 'User', 'email': " + JSON.stringify(USER) + ", 'first_name': 'Bunood Keyboard QA', 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User'})",
		"for role in roles:",
		"    user.append('roles', {'role': role})",
		"user.insert(ignore_permissions=True)",
		"company = frappe.defaults.get_global_default('company') or frappe.get_all('Company', pluck='name', limit=1)[0]",
		"customer = frappe.get_all('Customer', pluck='name', order_by='creation asc', limit=1)[0]",
		"supplier = frappe.get_all('Supplier', pluck='name', order_by='creation asc', limit=1)[0]",
		"items = frappe.get_all('Item', filters={'disabled': 0, 'is_sales_item': 1, 'is_purchase_item': 1}, pluck='name', order_by='name asc', limit=3)",
		"if len(items) != 3:",
		"    raise AssertionError('three shared sales/purchase item fixtures are required: %s' % items)",
		"frappe.defaults.set_user_default('Company', company, " + JSON.stringify(USER) + ")",
		"frappe.db.commit()",
		"frappe.clear_cache(user=" + JSON.stringify(USER) + ")",
		"print(json.dumps({'company': company, 'customer': customer, 'supplier': supplier, 'items': items}))",
	].join("\n") + "\n");
}

async function openBill(page, doctype) {
	await page.evaluate(async dt => {
		if (window.cur_frm?.doc?.__islocal) cur_frm.doc.__unsaved = 0;
		await frappe.new_doc(dt);
	}, doctype);
	await page.waitForFunction(
		dt => window.cur_frm?.doctype === dt && cur_frm.doc.__islocal &&
			!!document.querySelector(".bnd-bill:not([hidden])"),
		doctype,
		{ timeout: 30000 },
	);
}

async function chooseActiveLink(page, shortcut, fieldname, value) {
	await page.keyboard.press(shortcut);
	await page.waitForFunction(
		field => document.activeElement?.closest(".frappe-control")?.dataset.fieldname === field,
		fieldname,
		{ timeout: 8000 },
	).catch(async error => {
		const state = await page.evaluate(() => ({
			active: document.activeElement?.closest(".frappe-control")?.dataset.fieldname || document.activeElement?.tagName,
			doctype: window.cur_frm?.doctype,
			simple: !!document.querySelector(".bnd-bill:not([hidden])"),
			rows: document.querySelectorAll(".bnd-bill-line").length,
			picker: document.querySelector('.bnd-bill-picker input')?.value || "",
			busy: document.querySelector(".bnd-bill")?.getAttribute("aria-busy"),
		}));
		throw new Error(shortcut + " did not focus " + fieldname + ": " + JSON.stringify(state) + " (" + error.message + ")");
	});
	await page.keyboard.press("Control+A");
	await page.keyboard.type(value, { delay: 50 });
	const choices = page.locator('[role="listbox"]:visible').last();
	await choices.waitFor({ state: "visible", timeout: 10000 }).catch(async error => {
		const state = await page.evaluate(() => ({
			active: document.activeElement?.closest(".frappe-control")?.dataset.fieldname || document.activeElement?.tagName,
			value: document.activeElement?.value,
			disabled: document.activeElement?.disabled,
			expanded: document.activeElement?.getAttribute?.("aria-expanded"),
			lists: [...document.querySelectorAll('[role="listbox"], .awesomplete > ul')].map(list => ({
				hidden: list.hidden,
				display: getComputedStyle(list).display,
				text: list.textContent?.trim(),
			})),
			status: document.querySelector(".bnd-bill-status")?.textContent?.trim() || "",
		}));
		throw new Error("Link choices did not open for " + value + ": " + JSON.stringify(state) + " (" + error.message + ")");
	});
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
}

async function focusByTab(page, fieldname, limit = 120) {
	for (let tabs = 0; tabs <= limit; tabs++) {
		const active = await page.evaluate(() =>
			document.activeElement?.closest(".frappe-control")?.dataset.fieldname || "");
		if (active === fieldname) return tabs;
		await page.keyboard.press("Tab");
	}
	throw new Error("Tab did not reach " + fieldname);
}

async function configurePurchaseReference(page, stamp) {
	await focusByTab(page, "bill_no");
	await page.keyboard.press("Control+A");
	await page.keyboard.type("BND-KBD-" + stamp);
	const postingDate = await page.locator('.bnd-bill-party [data-fieldname="posting_date"] input').inputValue();
	await focusByTab(page, "bill_date");
	await page.keyboard.press("Control+A");
	await page.keyboard.type(postingDate);
	await page.keyboard.press("Tab");
}

async function addThreeLines(page, items) {
	const quantities = [2, 3, 4];
	for (let index = 0; index < quantities.length; index++) {
		console.log("keyboard line", index + 1);
		await chooseActiveLink(page, "Alt+i", "quick_bill_item", items[index]);
		await page.waitForFunction(
			expected => document.activeElement?.value === expected,
			items[index],
		);
		await page.keyboard.press("Control+Enter");
		await page.waitForFunction(
			count => cur_frm.$wrapper[0].querySelectorAll(".bnd-bill-line").length === count,
			index + 1,
			{ timeout: 20000 },
		).catch(async error => {
			const state = await page.evaluate(() => ({
				active: document.activeElement?.closest(".frappe-control")?.dataset.fieldname || document.activeElement?.tagName,
				picker: document.querySelector(".bnd-bill-picker input")?.value || "",
				status: document.querySelector(".bnd-bill-status")?.textContent?.trim() || "",
				busy: document.querySelector(".bnd-bill")?.getAttribute("aria-busy"),
				addDisabled: document.querySelector(".bnd-bill-search button")?.disabled,
				docstatus: cur_frm?.doc?.docstatus,
				dirty: cur_frm?.is_dirty?.(),
				items: (cur_frm?.doc?.items || []).map(row => ({ item_code: row.item_code, qty: row.qty })),
			}));
			throw new Error("line " + (index + 1) + " was not added: " + JSON.stringify(state) + " (" + error.message + ")");
		});
		const active = await page.evaluate(() =>
			document.activeElement?.closest(".frappe-control")?.dataset.fieldname || "");
		assert(active === "qty", "new line " + (index + 1) + " did not focus Quantity; active=" + active);
		await page.keyboard.press("Control+A");
		await page.keyboard.type(String(quantities[index]));
		await page.keyboard.press("Enter");
		await page.waitForFunction(
			({ row, qty }) => Number(cur_frm.doc.items.filter(item => item.item_code)[row].qty) === qty,
			{ row: index, qty: quantities[index] },
			{ timeout: 20000 },
		);
	}
	return quantities;
}

async function focusSubmitByTab(page, limit = 240) {
	for (let tabs = 0; tabs <= limit; tabs++) {
		const submit = await page.evaluate(() =>
			document.activeElement?.closest('[data-bnd-action="submit"]')?.dataset.bndAction === "submit");
		if (submit) return tabs;
		await page.keyboard.press("Tab");
	}
	throw new Error("Tab did not reach Submit document");
}

async function submitWithKeyboard(page) {
	const tabs = await focusSubmitByTab(page);
	await page.keyboard.press("Enter");
	await page.waitForFunction(
		() => Number(cur_frm?.doc?.docstatus) === 1 || !!window.cur_dialog?.confirm_dialog,
		null,
		{ timeout: 20000 },
	);
	if (await page.evaluate(() => !!window.cur_dialog?.confirm_dialog)) {
		await page.keyboard.press("Enter");
	}
	await page.waitForFunction(
		() => Number(cur_frm?.doc?.docstatus) === 1,
		null,
		{ timeout: 30000 },
	).catch(async error => {
		const state = await page.evaluate(() => ({
			status: document.querySelector(".bnd-bill-status")?.textContent?.trim() || "",
			dialog: document.querySelector(".modal.show")?.textContent?.trim() || "",
			docstatus: cur_frm?.doc?.docstatus,
			dirty: cur_frm?.is_dirty?.(),
		}));
		throw new Error("keyboard submit failed: " + JSON.stringify(state) + " (" + error.message + ")");
	});
	return tabs;
}

async function runBill(page, fixture, spec) {
	await openBill(page, spec.doctype);
	await chooseActiveLink(page, "F3", spec.partyField, fixture[spec.fixtureField]);
	await page.waitForFunction(
		({ field, value }) => cur_frm.doc[field] === value,
		{ field: spec.partyField, value: fixture[spec.fixtureField] },
		{ timeout: 20000 },
	);
	if (spec.doctype === "Purchase Invoice") {
		await configurePurchaseReference(page, Date.now().toString(36).toUpperCase());
	}
	const quantities = await addThreeLines(page, fixture.items);
	await page.keyboard.press("F2");
	await page.waitForFunction(
		() => !cur_frm.doc.__islocal && !cur_frm.is_dirty(),
		null,
		{ timeout: 30000 },
	);
	const name = await page.evaluate(() => cur_frm.doc.name);
	const tabsToSubmit = await submitWithKeyboard(page);
	const saved = await page.evaluate(async ({ doctype, name }) => {
		const doc = await frappe.xcall("frappe.client.get", { doctype, name });
		return {
			name: doc.name,
			docstatus: doc.docstatus,
			items: doc.items.filter(row => row.item_code).map(row => ({
				item_code: row.item_code,
				qty: Number(row.qty),
				amount: Number(row.amount),
			})),
			grand_total: Number(doc.grand_total),
			total_taxes_and_charges: Number(doc.total_taxes_and_charges),
		};
	}, { doctype: spec.doctype, name });
	assert(saved.docstatus === 1, spec.doctype + " did not submit");
	assert(saved.items.length === 3, spec.doctype + " did not retain three lines");
	assert(saved.items.every((row, index) =>
		row.item_code === fixture.items[index] && row.qty === quantities[index]),
	spec.doctype + " line data changed after submit");
	return { ...saved, tabsToSubmit };
}

let browser;
const errors = [];
try {
	const fixture = setup();
	console.log("fixture", JSON.stringify(fixture));
	browser = await chromium.launch(browserLaunchOptions());
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addCookies([
		{ name: "sid", value: mintSid(USER), domain: new URL(URL_BASE).hostname, path: "/" },
	]);
	const page = await context.newPage();
	page.on("console", message => {
		if (message.type() === "error" && !/socket\.io|Invalid origin/i.test(message.text())) {
			errors.push(message.text());
		}
	});
	page.on("pageerror", error => errors.push(error.message));
	await page.goto(URL_BASE + "/desk/home", { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(() => window.frappe?.boot, null, { timeout: 30000 });
	assert(!(await page.evaluate(() => frappe.boot.user.roles.includes("System Manager"))),
		"acceptance user must not be a System Manager");

	const sales = await runBill(page, fixture, {
		doctype: "Sales Invoice",
		partyField: "customer",
		fixtureField: "customer",
	});
	const purchase = await runBill(page, fixture, {
		doctype: "Purchase Invoice",
		partyField: "supplier",
		fixtureField: "supplier",
	});
	assert(errors.length === 0, "browser errors: " + errors.join(" | "));
	console.log(JSON.stringify({
		user: USER,
		roles: ["Sales User", "Purchase User", "Accounts User"],
		sales,
		purchase,
		errors,
	}, null, 2));
} finally {
	if (browser) await browser.close();
	cleanup();
}
