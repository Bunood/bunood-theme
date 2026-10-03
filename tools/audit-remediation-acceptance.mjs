/** Live acceptance for the September report/payment audit remediation. */
import { benchJson, goto, openDesk } from "./session.mjs";

function invariant(value, message) {
	if (!value) throw new Error(message);
}

const accounting = benchJson(
	"company = frappe.get_doc('Company', 'Bunood Development')\n" +
	"mappings = {name: frappe.db.get_value('Mode of Payment Account', " +
	"{'parent': name, 'company': company.name}, 'default_account') " +
	"for name in ('Cash', 'Network', 'Credit Card')}\n" +
	"customer = (frappe.get_all('Customer', pluck='name', limit_page_length=1) or [None])[0]\n" +
	"invoice = (frappe.get_all('Sales Invoice', filters={'docstatus': 1, 'outstanding_amount': ['>', 0]}, " +
	"pluck='name', order_by='modified desc', limit_page_length=1) or [None])[0]\n" +
	"print(json.dumps({'cash': company.default_cash_account, 'bank': company.default_bank_account, " +
	"'mappings': mappings, 'customer': customer, 'invoice': invoice}, default=str))\n"
);
invariant(accounting.cash, "Company has no native cash account");
invariant(accounting.bank, "Company has no native default bank account");
invariant(accounting.mappings.Cash === accounting.cash, "Cash mapping is not the company cash account");
invariant(accounting.mappings.Network === accounting.bank, "Network mapping is not the native bank account");
invariant(accounting.mappings["Credit Card"] === accounting.bank, "Credit Card mapping is missing");

const { page, errors, close } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, "/desk/reports", ".bnd-report-landing", { settle: 1200 });
	const landing = await page.evaluate(() => ({
		cards: document.querySelectorAll(".bnd-report-landing__card").length,
		descriptions: document.querySelectorAll(".bnd-report-landing__description").length,
		search: Boolean(document.querySelector(".bnd-report-landing__search")),
		style: [...document.styleSheets].some(sheet => /bnd-report-landing\./.test(sheet.href || "")),
		nativeHidden: Boolean(document.querySelector(".editor-js-container > #editorjs")?.hidden),
	}));
	invariant(landing.cards === 6 && landing.descriptions === 6, "Reports catalogue is incomplete");
	invariant(landing.search && landing.style && landing.nativeHidden, "Reports route assets did not mount cleanly");

	await goto(page, "/desk/bnd-report-studio", ".bnd-studio__card", { settle: 1200 });
	const studio = await page.evaluate(() => {
		const cards = [...document.querySelectorAll(".bnd-studio__card")];
		const glyphs = [...document.querySelectorAll(".bnd-studio__glyph svg")];
		return {
			cards: cards.length,
			maxCardHeight: Math.max(...cards.map(node => node.getBoundingClientRect().height)),
			maxGlyphWidth: Math.max(...glyphs.map(node => node.getBoundingClientRect().width)),
			style: [...document.styleSheets].some(sheet => /bnd-studio\./.test(sheet.href || "")),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		};
	});
	invariant(studio.cards >= 6 && studio.style, "Report Studio did not load its route assets");
	invariant(studio.maxCardHeight < 240 && studio.maxGlyphWidth < 100, "Report Studio illustrations are unbounded");
	invariant(studio.overflow <= 2, `Report Studio overflows by ${studio.overflow}px`);

	let statement = null;
	if (accounting.customer) {
		await goto(page, "/desk/bnd-report-studio/account-statement", ".bnd-studio__picker", { settle: 800 });
		const search = page.locator(".bnd-studio__picker .bnd-studio__search");
		await search.fill(accounting.customer);
		await page.waitForSelector(".bnd-studio__picker-item");
		await page.locator(".bnd-studio__picker-item").first().click();
		await page.waitForSelector(".bnd-studio__tablewrap");
		statement = await page.evaluate(() => {
			const wrap = document.querySelector(".bnd-studio__tablewrap");
			const table = wrap?.querySelector(".bnd-studio__table");
			return {
				overflowX: wrap ? getComputedStyle(wrap).overflowX : "",
				columns: table?.querySelectorAll("thead th").length || 0,
				pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		invariant(statement.overflowX === "auto" && statement.columns >= 3, "Statement table is not structured/responsive");
		invariant(statement.pageOverflow <= 2, "Statement viewer overflows the page");
	}

	await page.evaluate(() => {
		frappe.msgprint({
			title: __("Missing account"),
			message: "Please set default Cash or Bank account in Mode of Payment <a>Credit Card</a>\\n",
			indicator: "red",
		});
	});
	await page.waitForSelector(".modal.show.bnd-payment-account-dialog");
	const recovery = await page.evaluate(() => {
		const modal = document.querySelector(".modal.show.bnd-payment-account-dialog");
		return {
			title: modal?.querySelector(".modal-title")?.textContent || "",
			text: modal?.querySelector(".modal-message, .msgprint")?.textContent || "",
			action: Boolean(modal?.querySelector(".modal-message button, .msgprint button")),
			role: modal?.getAttribute("role"),
			width: modal?.querySelector(".modal-dialog")?.getBoundingClientRect().width || 0,
		};
	});
	invariant(recovery.title.includes("Credit Card"), "Payment recovery title lacks its payment method");
	invariant(recovery.action && recovery.role === "dialog", "Payment recovery is not actionable/accessibly labelled");
	invariant(!recovery.text.includes("Please set default") && !recovery.text.includes("\\n"), "Raw bilingual payment error leaked");
	invariant(recovery.width < 760, "Payment recovery dialog is still oversized");
	await page.locator(".modal.show .btn-modal-close").click();

	await goto(page, "/desk/dashboard-view/Accounts", null, { settle: 3500 });
	const dashboardText = await page.locator("body").innerText();
	invariant(!dashboardText.includes('<a href="http://127.0.0.1'), "Bank Balance still exposes raw localhost HTML");
	invariant(!dashboardText.includes("Account is not set for the dashboard chart"), "Bank Balance account remains unconfigured");

	let paymentAction = null;
	if (accounting.invoice) {
		await goto(page, `/desk/sales-invoice/${encodeURIComponent(accounting.invoice)}`, ".bnd-bill", { settle: 1500 });
		paymentAction = await page.evaluate(() => {
			const buttons = [...document.querySelectorAll(".bnd-bill-action:not([hidden])")];
			const button = buttons.find(node => /Record payment|تسجيل دفعة/.test(node.textContent));
			const icon = button?.querySelector(".bnd-bill-action-icon");
			const label = button?.querySelector(".bnd-bill-action-label");
			const iconBox = icon?.getBoundingClientRect();
			const labelBox = label?.getBoundingClientRect();
			return {
				visible: Boolean(button),
				icon: icon?.querySelector("use")?.getAttribute("href") || "",
				centerDelta: iconBox && labelBox ? Math.abs((iconBox.top + iconBox.bottom - labelBox.top - labelBox.bottom) / 2) : 99,
				color: button ? getComputedStyle(button).color : "",
				emptyKeys: document.querySelectorAll(".bnd-bill-action kbd:empty").length,
				conflictingKeys: [...document.querySelectorAll(".bnd-bill-action kbd")].filter(key => /^(F1|F6)$/.test(key.textContent.trim())).length,
			};
		});
		invariant(paymentAction.visible && /coins/.test(paymentAction.icon), "Record Payment lacks its semantic icon");
		invariant(paymentAction.centerDelta <= 3 && paymentAction.color, "Record Payment content is not optically centred");
		invariant(!paymentAction.emptyKeys && !paymentAction.conflictingKeys, "Document actions expose invalid shortcut badges");
	}

	invariant(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify({ accounting, landing, studio, statement, recovery, paymentAction, browser_errors: errors }, null, 2));
} finally {
	await close();
}
