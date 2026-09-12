/**
 * Focused live acceptance for native Customer/Supplier VAT Quick Entry.
 *
 * Creates one temporary non-admin operational user, drives the real Quick
 * Entry dialogs from the shared bill workbench, verifies native tax_id after
 * save/reload, then deletes every temporary record in a finally block.
 *
 * Usage:
 *   BND_DOCKER="wsl docker" BND_BACKEND=... BND_SITE=... BND_URL=... \
 *   BND_BROWSER_EXECUTABLE="C:\path\to\chrome.exe" \
 *   node tools/bill-party-acceptance.mjs
 */

import { createRequire } from "node:module";
import { benchPy, mintSid, URL_BASE } from "./session.mjs";
import { browserLaunchOptions } from "./browser.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const USER = "bunood-bill-qa@example.com";
const stamp = Date.now().toString(36).toUpperCase();
const PREFIX = "Bunood VAT QA " + stamp;
const VAT = "300000000000003";

function python(lines) {
	return benchPy(lines.join("\n") + "\n");
}

function cleanup() {
	return python([
		"for dt in ('Sales Invoice', 'Purchase Invoice'):",
		"    for name in frappe.get_all(dt, filters={'owner': " + JSON.stringify(USER) + "}, pluck='name'):",
		"        frappe.delete_doc(dt, name, force=True, ignore_permissions=True)",
		"for dt in ('Customer', 'Supplier'):",
		"    for name in frappe.get_all(dt, filters={'name': ['like', " + JSON.stringify(PREFIX + "%") + "]}, pluck='name'):",
		"        frappe.delete_doc(dt, name, force=True, ignore_permissions=True)",
		"if frappe.db.exists('User', " + JSON.stringify(USER) + "):",
		"    frappe.delete_doc('User', " + JSON.stringify(USER) + ", force=True, ignore_permissions=True)",
		"frappe.db.commit()",
		"frappe.clear_cache()",
		"print('clean')",
	]);
}

function setup() {
	cleanup();
	return python([
		"roles = [r for r in ('Sales User', 'Purchase Master Manager', 'Accounts User') if frappe.db.exists('Role', r)]",
		"if len(roles) != 3:",
		"    raise AssertionError('required operational roles are missing: %s' % roles)",
		"doc = frappe.get_doc({'doctype': 'User', 'email': " + JSON.stringify(USER) + ", 'first_name': 'Bunood Bill QA', 'enabled': 1, 'send_welcome_email': 0, 'user_type': 'System User'})",
		"for role in roles:",
		"    doc.append('roles', {'role': role})",
		"doc.insert(ignore_permissions=True)",
		"frappe.db.commit()",
		"frappe.clear_cache(user=" + JSON.stringify(USER) + ")",
		"print(json.dumps({dt: [p.role for p in frappe.get_meta(dt).permissions if p.create] for dt in ('Customer', 'Supplier', 'Sales Invoice', 'Purchase Invoice')}))",
	]);
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function openNewBill(page, doctype) {
	await page.evaluate(async dt => {
		if (window.cur_frm?.doc?.__islocal) cur_frm.doc.__unsaved = 0;
		await frappe.new_doc(dt);
	}, doctype);
	await page.waitForFunction(
		dt => window.cur_frm?.doctype === dt && cur_frm.doc?.__islocal &&
			!!document.querySelector(".bnd-bill:not([hidden])"),
		doctype,
		{ timeout: 30000 },
	);
}

async function createParty(page, spec) {
	await openNewBill(page, spec.invoice);
	const result = await page.evaluate(dt => ({
		canCreate: (frappe.boot.user.can_create || []).includes(dt),
		systemManager: (frappe.boot.user.roles || []).includes("System Manager"),
	}), spec.doctype);
	assert(result.canCreate, USER + " cannot create " + spec.doctype);
	assert(!result.systemManager, "acceptance user must not be a System Manager");

	const launch = page.locator(".bnd-bill-party .bnd-bill-button").filter({
		hasText: spec.doctype === "Customer" ? "New customer" : "New supplier",
	});
	await launch.click();
	const dialog = page.locator(".modal.show");
	await dialog.waitFor({ state: "visible", timeout: 10000 });

	const taxInput = dialog.locator('[data-fieldname="tax_id"] input');
	const taxCount = await taxInput.count();
	if (taxCount !== 1) {
		const diagnostic = await page.evaluate(dt => {
			const modal = document.querySelector(".modal.show");
			const df = frappe.meta.get_docfield(dt, "tax_id");
			return {
				fields: [...(modal?.querySelectorAll("[data-fieldname]") || [])].map(node => node.getAttribute("data-fieldname")),
				meta: df && { hidden: df.hidden, read_only: df.read_only, permlevel: df.permlevel },
				status: df && frappe.perm.get_field_display_status(df, { doctype: dt }, frappe.perm.get_perm(dt)),
				permissions: frappe.perm.get_perm(dt),
			};
		}, spec.doctype);
		throw new Error(spec.doctype + " Quick Entry must expose exactly one native tax_id: " + JSON.stringify(diagnostic));
	}
	assert(await taxInput.isEditable(), spec.doctype + " tax_id must be writable for the operational user");

	const partyName = PREFIX + " " + spec.doctype;
	await dialog.locator('[data-fieldname="' + spec.nameField + '"] input').fill(partyName);
	await taxInput.fill(VAT);
	await dialog.locator(".modal-footer .btn-primary").click();
	await dialog.waitFor({ state: "hidden", timeout: 20000 });
	await page.waitForFunction(
		party => !!window.cur_frm?.doc?.[party],
		spec.partyField,
		{ timeout: 20000 },
	);
	await page.waitForFunction(
		value => (document.querySelector(".bnd-bill-context")?.textContent || "").includes(value),
		VAT,
		{ timeout: 10000 },
	);

	const saved = await page.evaluate(async ({ doctype, partyField }) => {
		const name = cur_frm.doc[partyField];
		const doc = await frappe.xcall("frappe.client.get", { doctype, name });
		return { name, tax_id: doc.tax_id };
	}, spec);
	assert(saved.tax_id === VAT, spec.doctype + " native tax_id did not persist after reload");
	return saved;
}

let browser;
const errors = [];
try {
	console.log("permission roles:", setup().trim().split(/\r?\n/).pop());
	browser = await chromium.launch(browserLaunchOptions());
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addCookies([
		{ name: "sid", value: mintSid(USER), domain: new URL(URL_BASE).hostname, path: "/" },
	]);
	const page = await context.newPage();
	page.on("console", message => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", error => errors.push(error.message));
	await page.goto(URL_BASE + "/desk/home", { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(() => window.frappe?.boot, null, { timeout: 30000 });

	const customer = await createParty(page, {
		invoice: "Sales Invoice",
		doctype: "Customer",
		partyField: "customer",
		nameField: "customer_name",
	});
	const supplier = await createParty(page, {
		invoice: "Purchase Invoice",
		doctype: "Supplier",
		partyField: "supplier",
		nameField: "supplier_name",
	});
	const schema = JSON.parse(python([
		"out = {}",
		"for dt in ('Customer', 'Supplier'):",
		"    meta = frappe.get_meta(dt)",
		"    out[dt] = {'native': bool(meta.get_field('tax_id')), 'custom': frappe.db.count('Custom Field', {'dt': dt, 'fieldname': 'tax_id'})}",
		"print(json.dumps(out))",
	]).trim().split(/\r?\n/).pop());
	for (const doctype of ["Customer", "Supplier"]) {
		assert(schema[doctype].native, doctype + " is missing native tax_id metadata");
		assert(schema[doctype].custom === 0, doctype + " has a duplicate custom tax_id");
	}
	assert(errors.length === 0, "browser errors: " + errors.join(" | "));
	console.log(JSON.stringify({
		user: USER,
		roles: ["Sales User", "Purchase Master Manager", "Accounts User"],
		customer,
		supplier,
		schema,
		errors,
	}, null, 2));
} finally {
	if (browser) await browser.close();
	cleanup();
}
