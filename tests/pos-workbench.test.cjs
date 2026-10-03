const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const js = read("bunood_theme/public/js/pos_workbench.js");
const scss = read("bunood_theme/public/scss/pos_workbench.scss");
const server = read("bunood_theme/pos.py");
const loader = read("bunood_theme/bunood_theme/page/bnd_pos/bnd_pos.js");
const quick = read("bunood_theme/bunood_theme/page/bnd_quick_sale/bnd_quick_sale.js");
const build = read("build.mjs");
const boot = read("bunood_theme/boot.py");
const assets = read("bunood_theme/assets.py");
const setup = read("bunood_theme/setup.py");
const arabic = read("bunood_theme/translations/ar.csv");

test("Bunood POS is a route-scoped Page and never enlarges the global Desk payload", () => {
	assert.match(build, /key: "bnd-pos", src: "pos_workbench\.scss", pyid: "POS_CSS"/);
	assert.match(build, /key: "bnd-pos", src: "pos_workbench\.js", pyid: "POS_JS"/);
	assert.match(boot, /bootinfo\.bnd_pos_css = POS_CSS/);
	assert.match(boot, /bootinfo\.bnd_pos_js = POS_JS/);
	assert.match(assets, /POS_CSS = "\/assets\/bunood_theme\/dist\/css\/bnd-pos\.[a-f0-9]+\.css"/);
	assert.match(assets, /POS_JS = "\/assets\/bunood_theme\/dist\/js\/bnd-pos\.[a-f0-9]+\.js"/);
	assert.match(loader, /window\.bunood_theme\.pos_render/);
});

test("Quick Sale is only an entry point to the existing native Sales Invoice workbench", () => {
	assert.match(quick, /frappe\.route_options = \{ is_pos: 0 \}/);
	assert.match(quick, /frappe\.new_doc\("Sales Invoice"\)/);
	assert.doesNotMatch(quick, /insert|submit|tax|total|ledger|payment/i);
});

test("server delegates every commercial decision to ERPNext native POS records", () => {
	for (const native of [
		'"POS Profile"',
		'"POS Opening Entry"',
		'"POS Closing Entry"',
		'"POS Invoice"',
		'"Sales Invoice"',
		'"Sales Invoice Payment"',
	]) assert.match(server, new RegExp(native));
	assert.match(server, /from erpnext\.selling\.page\.point_of_sale\.point_of_sale import/);
	assert.match(server, /doc\.run_method\("set_missing_values"\)/);
	assert.match(server, /doc\.run_method\("calculate_taxes_and_totals"\)/);
	assert.match(server, /make_sales_return/);
	assert.doesNotMatch(server, /frappe\.db\.sql|CREATE TABLE|INSERT INTO|UPDATE `tab/);
});

test("mutations are POST-only, permission checked, and checkout is replay safe", () => {
	for (const name of ["open_shift", "preview_cart", "hold_cart", "checkout", "create_return"]) {
		const declaration = new RegExp('@frappe\\.whitelist\\(methods=\\["POST"\\]\\)\\r?\\ndef ' + name);
		assert.match(server, declaration, name);
	}
	assert.match(server, /current\.docstatus == 1:[\s\S]*?"already_submitted": True/);
	assert.match(server, /doc\.check_permission\("submit"\)/);
	assert.match(server, /source\.check_permission\("read"\)/);
	assert.match(server, /doc\.owner != frappe\.session\.user/);
});

test("outdated shifts are blocked and handed to the native closing flow", () => {
	assert.match(server, /def _stale_entries\(\)/);
	assert.match(server, /getdate\(row\.period_start_date\) != today/);
	assert.match(server, /"stale_opening_entry"/);
	assert.match(server, /Review and close the outdated POS shift before opening a new shift/);
	assert.match(js, /opening_entry \|\| state\.context\?\.stale_opening_entry/);
	assert.match(js, /This shift is out of date/);
});

test("open shift action centers its Arabic label and uses a mint high-contrast surface", () => {
	assert.match(scss, /\.bnd-pos__shift-actions \.btn-primary:not\(:disabled\) \{[^}]*background: #e3f2e9;[^}]*color: #123d2f;/);
	assert.match(scss, /\.bnd-pos__header-actions \.btn-default,\s*\.bnd-pos__shift-actions \.btn-primary,\s*\.bnd-pos__scan \{[^}]*display: grid;[^}]*grid-template-columns: 1\.25rem max-content 1\.25rem;[^}]*justify-content: center;/);
	assert.match(js, /const openShift = button\(__\("Open shift"\), "play", "btn btn-primary"/);
});

test("scan label stays centered independently of its icon", () => {
	assert.match(js, /const scan = button\(__\("Scan"\), "scan", "btn btn-default bnd-pos__scan"/);
	assert.match(scss, /\.bnd-pos__header-actions \.btn-default,\s*\.bnd-pos__shift-actions \.btn-primary,\s*\.bnd-pos__scan \{[^}]*grid-template-columns: 1\.25rem max-content 1\.25rem;[^}]*justify-content: center;/);
});

test("POS header links center their labels without changing mobile visibility", () => {
	assert.match(js, /const quickSale = button\(__\("Quick Sale"\), "file-plus", "btn btn-default"/);
	assert.match(js, /const nativePos = button\(__\("Native POS"\), "external-link", "btn btn-default"/);
	assert.match(scss, /\.bnd-pos__header-actions \.btn-default,\s*\.bnd-pos__shift-actions \.btn-primary,\s*\.bnd-pos__scan \{[^}]*grid-template-columns: 1\.25rem max-content 1\.25rem;/);
	assert.match(scss, /\.bnd-pos__subtitle,\s*\.bnd-pos__header-actions \.btn-default \{\s*display: none;/);
});

test("desktop POS views are centered as one group in both directions", () => {
	assert.match(scss, /\.bnd-pos__tabs \{\s*display: flex;\s*justify-content: center;/);
});

test("counter workflow covers catalogue, barcode, customer, hold, split tender, receipt and return", () => {
	for (const contract of [
		/frappe\.ui\.Scanner/,
		/api\("preview_cart"/,
		/api\("hold_cart"/,
		/api\("held_carts"/,
		/api\("checkout"/,
		/api\("create_return"/,
		/printReceipt/,
		/mode_of_payment/,
		/reference_no/,
		/frappe\.ui\.form\.make_control/,
	]) assert.match(js, contract);
	assert.match(setup, /ensure_pos_reference_field\(\)/);
});

test("completed POS receipt offers the same deliberate customer delivery choices", () => {
	assert.match(js, /fieldname: "receipt_result"[\s\S]*?const resultBody/);
	assert.match(js, /button\(__\("Send to customer"\), "send"/);
	assert.match(js, /showInvoiceDelivery;[\s\S]*?isPosReceiptHandoff: true/);
	assert.match(js, /bunood_theme\.zatca\.delivery\.get_delivery_status/);
	assert.match(js, /readiness\.ready && state\.context\.profile\.print_receipt_on_order_complete/);
	assert.match(js, /invoice_doctype: receipt\.doctype/);
	assert.match(server, /"contact_email": doc\.get\("contact_email"\)/);
	assert.match(server, /"contact_mobile": doc\.get\("contact_mobile"\)/);
	assert.match(arabic, /^"?Send to customer"?,"?إرسال إلى العميل"?,/m);
});

test("Sandbox receipt preview requires signed artifacts and never auto-delivers", () => {
	assert.match(js, /if \(status\.can_preview_sandbox\)/);
	assert.match(js, /invoice_print_preview\(doctype, name\)/);
	assert.match(js, /readiness\.ready \|\| readiness\.can_preview_sandbox/);
	assert.match(js, /Preview Sandbox test invoice/);
	assert.doesNotMatch(js, /window\.open\("about:blank"/);
	assert.match(js, /readiness\.ready && state\.context\.profile\.print_receipt_on_order_complete/);
	assert.match(arabic, /^"?Preview Sandbox test invoice"?,"?معاينة فاتورة بيئة الاختبار"?,/m);
});

test("Market Tiles retail and dining share native invoice flow without faking kitchen delivery", () => {
	assert.match(js, /bnd-pos__service-switch/);
	assert.match(js, /bnd-pos__products/);
	assert.match(js, /service_mode: state\.service/);
	assert.match(js, /table_number: state\.service === "Cafe"/);
	assert.match(js, /kitchen_note/);
	assert.match(js, /async function printKitchenTicket\(\)/);
	assert.match(js, /api\("hold_cart"/);
	assert.match(js, /Order saved as draft\. Print the kitchen ticket/);
	assert.doesNotMatch(js, /sent to kitchen/i);
	assert.match(server, /def ensure_pos_dining_fields\(\)/);
	assert.match(setup, /ensure_pos_dining_fields\(\)/);
	assert.match(scss, /Market Tiles: the catalogue is the primary working surface/);
});

test("mobile POS has one app bottom navigation and keeps its own navigation at the top", () => {
	const mobile = scss.match(/@include bnd-until\(lg\) \{([\s\S]*)$/)?.[1] || "";
	assert.match(mobile, /\.bnd-pos__mobile-nav[\s\S]*?position:\s*sticky;[\s\S]*?inset-block-start:\s*0;/);
	assert.match(mobile, /\.bnd-pos__cart-actions[\s\S]*?position:\s*static;/);
	assert.doesNotMatch(mobile, /position:\s*fixed/);
	assert.doesNotMatch(mobile, /inset-block-end:\s*0/);
	assert.match(js, /setMobileView\("items"\)/);
	assert.match(js, /root\.insertBefore\(mobileNav, workspace\)/);
	assert.match(js, /aria-current/);
});

test("POS copy is fully shipped in Arabic", () => {
	for (const source of [
		"Bunood POS",
		"Quick Sale",
		"Open shift",
		"Hold sale",
		"Collect payment",
		"Payment reference: {0}",
		"Receipts and returns",
	]) {
		assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith(source + ",") || line.startsWith('"' + source.replaceAll('"', '""') + '",')), source);
	}
});
