import { openDesk, goto } from "./session.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const { page, close, errors } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, "/desk/sales-invoice/new-sales-invoice-1", ".bnd-vat-treatment", { settle: 4000 });
	await page.waitForTimeout(1500);
	const initial = await page.evaluate(async () => {
		let endpoint;
		try {
			endpoint = (await frappe.call({ type: "GET", method: "bunood_theme.vat.get_vat_treatments", args: { company: cur_frm.doc.company, transaction_type: "Sales" } })).message;
		} catch (error) { endpoint = { error: error.message || String(error) }; }
		return {
			status: document.querySelector(".bnd-vat-treatment-status")?.textContent,
			buttons: [...document.querySelectorAll(".bnd-vat-treatment-options button")]
				.map(button => ({ text: button.textContent, disabled: button.disabled, checked: button.getAttribute("aria-checked") })),
			endpoint,
		};
	});
	assert(initial.endpoint?.standard?.rate === 15 && initial.endpoint?.exempt?.rate === 0,
		"VAT profiles are not backed by the configured native rules: " + JSON.stringify({ initial, errors }));
	assert(initial.buttons.length === 3 && initial.buttons.every(button => button.disabled),
		"VAT choices should wait for the invoice party: " + JSON.stringify({ initial, errors }));
	await page.evaluate(async () => {
		await cur_frm.set_value("customer", "محمود");
		const row = cur_frm.doc.items?.[0] || cur_frm.add_child("items");
		await frappe.model.set_value(row.doctype, row.name, "item_code", "BND-VIEW-12");
		await frappe.after_ajax();
		await frappe.model.set_value(row.doctype, row.name, "price_list_rate", 10);
		await frappe.model.set_value(row.doctype, row.name, "rate", 10);
		cur_frm.cscript.calculate_taxes_and_totals();
		await frappe.after_ajax();
		await cur_frm.refresh();
		await frappe.after_ajax();
	});
	await page.waitForTimeout(1500);
	const ready = await page.evaluate(async () => ({
		customer: cur_frm.doc.customer,
		status: document.querySelector(".bnd-vat-treatment-status")?.textContent,
		busy: document.querySelector(".bnd-bill")?.getAttribute("aria-busy"),
		profiles: await window.bunood_theme.sales_bill.loadVatProfiles(cur_frm),
		buttons: [...document.querySelectorAll(".bnd-vat-treatment-options button")]
			.map(button => ({ text: button.textContent, disabled: button.disabled, checked: button.getAttribute("aria-checked") })),
	}));
	assert(ready.buttons.every(button => !button.disabled),
		"VAT choices did not enable after choosing the customer: " + JSON.stringify({ ready, errors }));
	await page.waitForFunction(() => Number(cur_frm.doc.total_taxes_and_charges) > 0);

	await page.getByRole("radio", { name: /VAT exempt|معفى/ }).click();
	await page.waitForFunction(() => cur_frm.doc.tax_category === "KSA VAT Exempt" &&
		Number(cur_frm.doc.total_taxes_and_charges) === 0 &&
		Number(cur_frm.doc.grand_total) === Number(cur_frm.doc.net_total));
	const exempt = await page.evaluate(() => ({
		category: cur_frm.doc.tax_category,
		template: cur_frm.doc.taxes_and_charges,
		tax: Number(cur_frm.doc.total_taxes_and_charges),
		grand: Number(cur_frm.doc.grand_total),
		net: Number(cur_frm.doc.net_total),
		rowRate: Number(cur_frm.doc.taxes?.[0]?.rate),
		itemRate: cur_frm.doc.items?.[0]?.item_tax_rate,
		included: Number(cur_frm.doc.taxes?.[0]?.included_in_print_rate),
	}));
	assert(exempt.template === "KSA VAT Exempt - BDEV", "wrong exempt template: " + JSON.stringify(exempt));
	assert(exempt.rowRate === 0 && exempt.included === 0 && exempt.tax === 0 && exempt.grand === exempt.net,
		"exempt invoice still carries VAT: " + JSON.stringify(exempt));

	await page.getByRole("radio", { name: /Price includes VAT|شامل الضريبة/ }).click();
	await page.waitForFunction(() => cur_frm.doc.tax_category === "KSA VAT 15%" &&
		Number(cur_frm.doc.taxes?.[0]?.included_in_print_rate) === 1 &&
		Number(cur_frm.doc.grand_total) === 10 && Number(cur_frm.doc.net_total) < 10);
	const included = await page.evaluate(() => ({
		category: cur_frm.doc.tax_category,
		template: cur_frm.doc.taxes_and_charges,
		tax: Number(cur_frm.doc.total_taxes_and_charges),
		grand: Number(cur_frm.doc.grand_total),
		net: Number(cur_frm.doc.net_total),
		rowRate: Number(cur_frm.doc.taxes?.[0]?.rate),
		included: Number(cur_frm.doc.taxes?.[0]?.included_in_print_rate),
	}));
	assert(included.template === "KSA VAT 15% - BDEV" && included.rowRate === 15 && included.included === 1,
		"VAT-inclusive mode did not use the standard native tax row: " + JSON.stringify(included));
	assert(included.grand === 10 && included.net === 8.7 && included.tax === 1.3,
		"VAT-inclusive price was not backed out correctly: " + JSON.stringify(included));

	await page.getByRole("radio", { name: /VAT added to price|تُضاف الضريبة/ }).click();
	await page.waitForFunction(() => cur_frm.doc.tax_category === "KSA VAT 15%" &&
		Number(cur_frm.doc.taxes?.[0]?.included_in_print_rate) === 0 &&
		Number(cur_frm.doc.total_taxes_and_charges) > 0 &&
		Number(cur_frm.doc.grand_total) > Number(cur_frm.doc.net_total));
	const standard = await page.evaluate(() => ({
		category: cur_frm.doc.tax_category,
		template: cur_frm.doc.taxes_and_charges,
		tax: Number(cur_frm.doc.total_taxes_and_charges),
		grand: Number(cur_frm.doc.grand_total),
		net: Number(cur_frm.doc.net_total),
		rowRate: Number(cur_frm.doc.taxes?.[0]?.rate),
		included: Number(cur_frm.doc.taxes?.[0]?.included_in_print_rate),
	}));
	assert(standard.template === "KSA VAT 15% - BDEV" && standard.rowRate === 15 && standard.included === 0 &&
		standard.net === 10 && standard.tax === 1.5 && standard.grand === 11.5,
		"standard VAT was not restored: " + JSON.stringify(standard));

	await page.evaluate(() => cur_frm.set_value("tax_category", "KSA VAT Exempt"));
	await page.waitForFunction(() => cur_frm.doc.taxes_and_charges === "KSA VAT Exempt - BDEV" &&
		Number(cur_frm.doc.total_taxes_and_charges) === 0 && Number(cur_frm.doc.grand_total) === 10);
	const advancedCategory = await page.evaluate(() => ({
		category: cur_frm.doc.tax_category,
		template: cur_frm.doc.taxes_and_charges,
		tax: Number(cur_frm.doc.total_taxes_and_charges),
		itemRate: cur_frm.doc.items?.[0]?.item_tax_rate,
	}));

	await page.evaluate(() => cur_frm.set_value("tax_category", "KSA VAT 15%"));
	await page.waitForFunction(() => cur_frm.doc.taxes_and_charges === "KSA VAT 15% - BDEV" &&
		Number(cur_frm.doc.total_taxes_and_charges) > 0 && Number(cur_frm.doc.exempt_from_sales_tax) === 0);
	await page.evaluate(() => cur_frm.set_value("exempt_from_sales_tax", 1));
	await page.waitForFunction(() => cur_frm.doc.tax_category === "KSA VAT Exempt" &&
		cur_frm.doc.taxes_and_charges === "KSA VAT Exempt - BDEV" &&
		Number(cur_frm.doc.total_taxes_and_charges) === 0);
	const legacyCheckbox = await page.evaluate(() => ({
		checked: Number(cur_frm.doc.exempt_from_sales_tax),
		category: cur_frm.doc.tax_category,
		template: cur_frm.doc.taxes_and_charges,
		tax: Number(cur_frm.doc.total_taxes_and_charges),
	}));
	assert(errors.length === 0, "browser errors: " + errors.join("\n"));
	console.log(JSON.stringify({ exempt, included, standard, advancedCategory, legacyCheckbox, browser_errors: errors }, null, 2));
} finally {
	await close();
}
