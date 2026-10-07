import { openDesk, goto, URL_BASE } from "./session.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const { page, close, errors } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, "/desk/sales-invoice/ACC-SINV-2026-00016", ".bnd-bill:not([hidden])", { settle: 2500 });
	const send = page.locator(".bnd-bill-action-send");
	await page.locator(".bnd-bill-tools > summary").click();
	assert(await send.isVisible(), "submitted Sales Invoice has no send action: " + JSON.stringify(await page.evaluate(() => ({
		status: window.cur_frm?.doc?.docstatus, name: window.cur_frm?.doc?.name,
		present: !!document.querySelector(".bnd-bill-action-send"),
		hidden: document.querySelector(".bnd-bill-action-send")?.hidden,
		icons: [...document.querySelectorAll(".bnd-bill-action-send")].map(x => x.outerHTML.slice(0, 200)),
	}))));
	await send.click();
	await page.locator(".bnd-invoice-delivery-dialog:visible").waitFor({ timeout: 5000 });
	assert(await page.locator(".bnd-invoice-delivery-dialog:visible").count(), "send choice did not open: " + JSON.stringify(await page.evaluate(() => ({ modals: [...document.querySelectorAll(".modal")].map(x => ({ className: x.className, text: x.innerText.slice(0, 300) })), docstatus: cur_frm?.doc?.docstatus, local: cur_frm?.doc?.__islocal, dialog: !!frappe.ui?.Dialog, api: !!window.bunood_theme?.sales_bill?.showInvoiceDelivery }))) + JSON.stringify(errors));
	const text = await page.locator(".bnd-invoice-delivery-dialog:visible").innerText();
	assert(/Email with PDF|إرسال بالبريد/.test(text) && /WhatsApp|واتساب/.test(text), "missing share choices: " + text);
	const body = page.locator(".bnd-invoice-delivery-dialog:visible");
	await body.getByRole("button", { name: /Email with PDF|إرسال بالبريد/ }).click();
	await page.locator(".bnd-invoice-email-dialog:visible").waitFor({ timeout: 5000 });
	const composer = await page.locator(".bnd-invoice-email-dialog:visible").innerText();
	assert(/Customer email|البريد الإلكتروني للعميل/.test(composer) && /PDF/.test(composer), "email dialog did not open with PDF assurance: " + composer);
	assert(await page.locator(".bnd-invoice-email-dialog:visible [data-fieldname=recipient] input").count(), "email recipient field missing");
	if (process.env.BND_SCREENSHOT) { await page.waitForTimeout(600); await page.screenshot({ path: process.env.BND_SCREENSHOT }); }
	await goto(page, "/desk/sales-invoice/ACC-SINV-2026-00016", ".bnd-bill:not([hidden])", { settle: 1500 });
	await page.locator(".bnd-bill-tools > summary").click();
	await send.click();
	await page.locator(".bnd-invoice-delivery-dialog:visible").getByRole("button", { name: /WhatsApp|واتساب/ }).click();
	await page.locator(".bnd-invoice-whatsapp-dialog:visible").waitFor({ timeout: 5000 });
	assert(await page.locator(".bnd-invoice-whatsapp-dialog:visible").count(), "WhatsApp handoff did not open");
	const waText = await page.locator(".bnd-invoice-whatsapp-dialog:visible").innerText();
	assert(/Download invoice PDF|تنزيل الفاتورة/.test(waText), "authenticated PDF option missing: " + waText);
	assert(/does not send|لا يرسل/.test(waText), "manual handoff not made explicit: " + waText);
	await page.setViewportSize({ width: 390, height: 844 });
	const modalWidth = await page.locator(".bnd-invoice-whatsapp-dialog:visible .modal-dialog").evaluate(node => ({ scroll: node.scrollWidth, width: node.clientWidth }));
	assert(modalWidth.scroll <= modalWidth.width + 1, "WhatsApp handoff overflows a phone screen: " + JSON.stringify(modalWidth));
	const pdf = await page.request.get(`${URL_BASE}/api/method/frappe.utils.print_format.download_pdf?doctype=Sales%20Invoice&name=ACC-SINV-2026-00016&format=Standard&pdf_generator=chrome`);
	assert(pdf.ok() && /pdf/.test(pdf.headers()["content-type"] || ""), "authenticated invoice PDF download failed: " + pdf.status() + " " + (await pdf.text()).slice(-1800));
	assert(!errors.length, "browser errors: " + JSON.stringify(errors));
	console.log(JSON.stringify({ sendAction: true, emailDialog: true, whatsappHandoff: true, authenticatedPdf: true, errors }));
} finally { await close(); }
