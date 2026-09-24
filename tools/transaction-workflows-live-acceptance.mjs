import { benchJson, benchPy, openDesk, goto } from "./session.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function cleanup(invoice, quotation) {
	if (!invoice && !quotation) return;
	benchPy([
		`invoice = ${JSON.stringify(invoice || "")}`,
		`quotation = ${JSON.stringify(quotation || "")}`,
		"if invoice and frappe.db.exists('Sales Invoice', invoice):",
		"    refs = frappe.get_all('Payment Entry Reference', filters={'reference_doctype': 'Sales Invoice', 'reference_name': invoice}, pluck='parent')",
		"    for name in list(dict.fromkeys(refs)):",
		"        if not frappe.db.exists('Payment Entry', name): continue",
		"        payment = frappe.get_doc('Payment Entry', name)",
		"        if payment.docstatus == 1: payment.cancel()",
		"        frappe.delete_doc('Payment Entry', name, force=True, ignore_permissions=True)",
		"    doc = frappe.get_doc('Sales Invoice', invoice)",
		"    if doc.docstatus == 1: doc.cancel()",
		"    frappe.delete_doc('Sales Invoice', invoice, force=True, ignore_permissions=True)",
		"if quotation and frappe.db.exists('Quotation', quotation):",
		"    doc = frappe.get_doc('Quotation', quotation)",
		"    if doc.docstatus == 1: doc.cancel()",
		"    frappe.delete_doc('Quotation', quotation, force=True, ignore_permissions=True)",
		"frappe.db.commit()",
		"print('clean')",
	].join("\n") + "\n");
}

let invoice = "", quotation = "";
const stamp = Date.now().toString(36).toUpperCase();
const setup = benchJson([
	"from frappe.utils import add_days, nowdate",
	"source_name = frappe.get_all('Sales Invoice', filters={'docstatus': 1, 'is_return': 0, 'is_pos': 0, 'grand_total': ['>', 0]}, pluck='name', order_by='creation desc', limit=1)[0]",
	"source = frappe.get_doc('Sales Invoice', source_name)",
	"invoice = frappe.copy_doc(source)",
	"invoice.posting_date = nowdate()",
	"invoice.due_date = nowdate()",
	"for term in invoice.get('payment_schedule') or []: term.due_date = nowdate()",
	"invoice.set_posting_time = 1",
	"invoice.update_stock = 0",
	"invoice.is_pos = 0",
	"invoice.bunood_settlement_method = 'Mixed Payment'",
	"invoice.remarks = " + JSON.stringify(`Bunood mixed workflow acceptance ${stamp}`),
	"invoice.insert(ignore_permissions=True)",
	"quotation = frappe.get_doc({'doctype': 'Quotation', 'quotation_to': 'Customer', 'party_name': source.customer, 'company': source.company, 'transaction_date': nowdate(), 'valid_till': add_days(nowdate(), 7), 'order_type': 'Sales', 'currency': source.currency, 'selling_price_list': source.selling_price_list})",
	"for row in source.items:",
	"    if row.item_code:",
	"        quotation.append('items', {'item_code': row.item_code, 'qty': max(1, row.qty), 'rate': row.rate, 'warehouse': row.warehouse})",
	"quotation.insert(ignore_permissions=True)",
	"quotation.submit()",
	"frappe.db.commit()",
	"print(json.dumps({'invoice': invoice.name, 'quotation': quotation.name, 'total': invoice.rounded_total or invoice.grand_total, 'customer': source.customer}))",
].join("\n") + "\n");
invoice = setup.invoice;
quotation = setup.quotation;

const { page, close, errors } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, `/desk/sales-invoice/${encodeURIComponent(invoice)}`, ".bnd-bill:not([hidden])", { settle: 5000 });
	assert(await page.evaluate(() => cur_frm.doc.bunood_settlement_method === "Mixed Payment"), "test invoice did not retain the native settlement field");
	await page.locator('button[data-bnd-action="submit"]:visible').click();
	await page.locator(".bnd-mixed-payment-dialog .modal-dialog:visible").waitFor({ state: "visible", timeout: 15000 });

	const allocationLayout = await page.evaluate(() => {
		const row = document.querySelector(".bnd-mixed-payment-balance");
		const label = row?.querySelector("span")?.getBoundingClientRect();
		const value = row?.querySelector("strong")?.getBoundingClientRect();
		return { display: row && getComputedStyle(row).display, gap: row && getComputedStyle(row).gap, label: label?.toJSON(), value: value?.toJSON() };
	});
	assert(allocationLayout.display === "flex" && parseFloat(allocationLayout.gap) >= 12, "mixed allocation status is cramped: " + JSON.stringify(allocationLayout));

	const cashInput = page.locator('.bnd-mixed-payment-dialog [data-fieldname="cash_amount"] input');
	const networkInput = page.locator('.bnd-mixed-payment-dialog [data-fieldname="network_amount"] input');
	await cashInput.fill("10.00");
	await cashInput.press("Tab");
	await page.waitForFunction(total => {
		const cash = Number(document.querySelector('.bnd-mixed-payment-dialog [data-fieldname="cash_amount"] input')?.value || 0);
		const network = Number(document.querySelector('.bnd-mixed-payment-dialog [data-fieldname="network_amount"] input')?.value || 0);
		return Math.abs(cash + network - total) < 0.001;
	}, Number(setup.total), { timeout: 10000 });
	const balanced = await page.evaluate(() => ({
		cash: Number(document.querySelector('.bnd-mixed-payment-dialog [data-fieldname="cash_amount"] input')?.value || 0),
		network: Number(document.querySelector('.bnd-mixed-payment-dialog [data-fieldname="network_amount"] input')?.value || 0),
		status: document.querySelector(".bnd-mixed-payment-balance")?.textContent?.trim(),
	}));
	assert(Math.abs(balanced.cash + balanced.network - Number(setup.total)) < 0.001, "split amounts do not balance: " + JSON.stringify(balanced));
	await page.locator('.bnd-mixed-payment-dialog [data-fieldname="network_reference_no"] input').fill(`BND-${stamp}`);
	await page.locator(".bnd-mixed-payment-dialog .btn-primary:visible").click();

	// The explicit workbench action is the confirmation. It still follows
	// Frappe's native submit lifecycle, but must not open a second Yes/No step.
	await page.waitForTimeout(500);
	const submitConfirmation = page.locator('.modal:visible').filter({ hasText: /Permanently Submit|اعتماد.+نهائي/i });
	assert(await submitConfirmation.count() === 0, "Save and submit opened a redundant native confirmation");
	await page.waitForFunction(() => Number(cur_frm?.doc?.docstatus) === 1, null, { timeout: 30000 }).catch(async error => {
		const diagnostic = await page.evaluate(() => ({
			docstatus: cur_frm?.doc?.docstatus,
			dirty: cur_frm?.is_dirty?.(),
			status: document.querySelector(".bnd-bill-status")?.textContent?.trim(),
			modals: [...document.querySelectorAll(".modal")].filter(modal => modal.getClientRects().length).map(modal => ({ title: modal.querySelector(".modal-title")?.textContent?.trim(), text: modal.textContent?.trim().slice(0, 600) })),
		}));
		throw new Error(`invoice did not submit: ${JSON.stringify(diagnostic)} (${error.message})`);
	});
	await page.locator(".bnd-mixed-payment-result:visible").waitFor({ state: "visible", timeout: 30000 });
	const resultRows = await page.locator(".bnd-mixed-payment-result-row").count();
	assert(resultRows === 2, `expected two native payment receipts, found ${resultRows}`);

	const posted = benchJson([
		`invoice = frappe.get_doc('Sales Invoice', ${JSON.stringify(invoice)})`,
		"names = frappe.get_all('Payment Entry Reference', filters={'reference_doctype': 'Sales Invoice', 'reference_name': invoice.name}, pluck='parent')",
		"entries = []",
		"for name in list(dict.fromkeys(names)):",
		"    payment = frappe.get_doc('Payment Entry', name)",
		"    entries.append({'name': name, 'docstatus': payment.docstatus, 'mode': payment.mode_of_payment, 'paid': payment.paid_amount, 'received': payment.received_amount, 'gl': frappe.db.count('GL Entry', {'voucher_type': 'Payment Entry', 'voucher_no': name, 'is_cancelled': 0})})",
		"print(json.dumps({'docstatus': invoice.docstatus, 'outstanding': invoice.outstanding_amount, 'entries': entries}, default=str))",
	].join("\n") + "\n");
	assert(posted.docstatus === 1 && Number(posted.outstanding) === 0, "invoice was not submitted and settled: " + JSON.stringify(posted));
	assert(posted.entries.length === 2 && new Set(posted.entries.map(entry => entry.mode)).size === 2, "native mixed receipts are incomplete: " + JSON.stringify(posted));
	assert(posted.entries.every(entry => entry.docstatus === 1 && entry.gl >= 2), "payment entries were not posted to the ledger: " + JSON.stringify(posted));

	await page.locator(".bnd-mixed-payment-result .btn-primary:visible").click().catch(() => {});
	await goto(page, `/desk/quotation/${encodeURIComponent(quotation)}`, ".form-layout", { settle: 5000 });
	await page.locator(".bnd-simple-form-head").waitFor({ state: "visible", timeout: 15000 }).catch(async error => {
		const diagnostic = await page.evaluate(() => ({
			route: frappe.get_route?.(),
			doctype: cur_frm?.doctype,
			name: cur_frm?.doc?.name,
			header: !!document.querySelector(".bnd-simple-form-head"),
			own: document.documentElement.getAttribute("data-bnd-own"),
			bodyRoute: document.body.dataset.route,
		}));
		throw new Error(`Quotation Simple page did not mount: ${JSON.stringify(diagnostic)} (${error.message})`);
	});
	const convert = page.getByRole("button", { name: /إنشاء فاتورة مبيعات|Create Sales Invoice/i });
	assert(await convert.isVisible(), "submitted quotation does not expose its native invoice conversion");
	await convert.click();
	await page.waitForFunction(expected => cur_frm?.doctype === "Sales Invoice" && cur_frm.doc.__islocal && cur_frm.doc.customer === expected.customer && cur_frm.doc.items?.some(row => row.item_code), setup, { timeout: 30000 });
	const mapped = await page.evaluate(() => ({ customer: cur_frm.doc.customer, items: cur_frm.doc.items.filter(row => row.item_code).length, local: !!cur_frm.doc.__islocal }));
	assert(mapped.local && mapped.customer === setup.customer && mapped.items > 0, "quotation did not map through ERPNext: " + JSON.stringify(mapped));
	await page.evaluate(() => { cur_frm.doc.__unsaved = 0; });

	console.log(JSON.stringify({ setup, allocationLayout, balanced, posted, mapped, browser_errors: errors }, null, 2));
	assert(errors.length === 0, "browser errors: " + errors.join("\n"));
} finally {
	await close();
	cleanup(invoice, quotation);
}
