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

test("outdated shifts are blocked and closed through ERPNext's own closing entry", () => {
	assert.match(server, /def _stale_entries\(\)/);
	assert.match(server, /getdate\(row\.period_start_date\) != today/);
	assert.match(server, /"stale_opening_entry"/);
	assert.match(server, /Review and close the outdated POS shift before opening a new shift/);
	assert.match(js, /opening_entry \|\| state\.context\?\.stale_opening_entry/);
	assert.match(js, /This shift is out of date/);
});


test("the counter covers scanning, the pad, customer, hold, split tender, receipt and return", () => {
	for (const contract of [
		/api\("get_items", \{/,
		/api\("preview_cart"/,
		/api\("hold_cart"/,
		/api\("held_carts"/,
		/api\("load_cart"/,
		/api\("checkout"/,
		/api\("create_return"/,
		/api\("search_customers"/,
		/api\("receipt_register"/,
		/function printReceipt\(doctype, name\)/,
		/mode_of_payment/,
		/reference_no/,
		/make_quick_entry\("Customer"/,
		/make_quick_entry\("Item"/,
	]) assert.match(js, contract);
	assert.match(setup, /ensure_pos_reference_field\(\)/);
});

test("scale labels carry the item's barcode and the weight in grams", () => {
	assert.match(js, /const SCALE_PREFIX = "21";/);
	assert.match(js, /new RegExp\(`\^\$\{SCALE_PREFIX\}\(\\\\d\{5\}\)\(\\\\d\{5\}\)\\\\d\$`\)/);
	assert.match(js, /return grams > 0 \? \{ barcode: match\[1\], qty: grams \/ 1000 \} : null;/);
	// A count typed before the scan ("3*" then the barcode) multiplies it.
	assert.match(js, /\/\^\(\\d\+\(\?:\\\.\\d\+\)\?\)\\\*\(\.\+\)\$\/\.exec\(code\)/);
	// An unknown code never blocks the sale: link it to an item or make a new one.
	assert.match(js, /state\.unknown = code;/);
	assert.match(js, /doc\.barcodes = \(doc\.barcodes \|\| \[\]\)\.concat\(\[\{ doctype: "Item Barcode", barcode: code \}\]\);/);
	assert.match(js, /frappe\.xcall\("frappe\.client\.save", \{ doc \}\)/);
});

test("the pad reads 7 8 9 left to right in every language", () => {
	assert.match(js, /const pad = h\("div", \{ class: "bnd-pos__pad", dir: "ltr"/);
	const sevens = [...js.matchAll(/cell\("([0-9])", "\1", (\d), (\d)/g)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
	const row = (r) => sevens.filter((cell) => cell[2] === r).sort((a, b) => a[1] - b[1]).map((cell) => cell[0]).join("");
	assert.equal(row(1), "789");
	assert.equal(row(2), "456");
	assert.equal(row(3), "123");
});

test("the counter keys never take a key the browser owns", () => {
	const fkeys = js.match(/const fkeys = \{([\s\S]*?)\n\t\t\t\};/)?.[1] || "";
	assert.ok(fkeys.length > 0, "the F-key map is where this test expects it");
	for (const owned of ["F5", "F11", "F12"]) assert.doesNotMatch(fkeys, new RegExp(`\\b${owned}:`), owned);
	assert.match(js, /event\.altKey && event\.code === "KeyR"/, "Alt+R reads the key's position, so it works on an Arabic layout");
	assert.match(js, /window\.addEventListener\("keydown", onKey, true\);/);
});

test("the counter covers the desk while open, and only answers keys while shown", () => {
	assert.match(scss, /html\[data-theme\] \.bnd-pos \{\s+position: fixed;\s+inset: 0;\s+z-index: var\(--bnd-z-flyout\);/);
	// A fixed element has no offsetParent even when shown; visibility is its boxes.
	const active = js.match(/function counterActive\(\) \{([\s\S]*?)\n\t\t\}/)?.[1] || "";
	assert.match(active, /root\.getClientRects\(\)\.length/);
	assert.doesNotMatch(active, /root.offsetParent/);
	assert.match(active, /document\.querySelector\("\.modal\.show"\)/, "Frappe's own dialogs keep their keys");
	assert.match(scss, /\.bnd-pos__bar \{\s+\/\/ [^\n]*\n\s+position: relative;\s+z-index: 8;/, "the settings menu drops above the body");
});

test("a corner badge takes the page's direction, so it never covers the name's start", () => {
	assert.match(js, /count \? h\("span", \{ class: "bnd-pos__badge" \}, ltr\(/);
	assert.doesNotMatch(js, /class: "bnd-pos__badge", dir:/);
	assert.match(scss, /\.bnd-pos__badge \{\s+position: absolute;\s+inset-block-start: var\(--bnd-sp-2\);\s+inset-inline-end: var\(--bnd-sp-2\);/);
});

test("totals show ERPNext's own figures once its preview matches the bill", () => {
	assert.match(js, /const server = state\.preview && state\.preview\.rev === state\.rev \? state\.preview : null;/);
	assert.match(js, /rounding: server\.rounded_total \? round\(server\.rounded_total - server\.grand_total\) : 0,/);
	assert.match(js, /const fresh = state\.preview && state\.preview\.rev === state\.rev \? state\.preview\.items \|\| \[\] : null;/);
	assert.match(js, /if \(state\.lines\.some\(\(line\) => line\.qty > 0\)\) previewTimer = setTimeout\(previewSale, 300\);/);
});

test("paying: exact cash and card in one key, notes from the total, credit only for a named customer", () => {
	assert.match(js, /F8: \(\) => \(state\.screen === "pay" \? addPay\(cardMethod\(\)\) : instant\("card"\)\),/);
	assert.match(js, /F10: \(\) => \(state\.screen === "pay" \? complete\(\) : instant\("cash"\)\),/);
	assert.match(js, /\[10, 50, 100\]\.forEach\(\(step\) => add\(Math\.ceil\(total \/ step\) \* step\)\);/);
	assert.match(js, /if \(!state\.profile\.allow_partial_payment\) \{/);
	assert.match(js, /if \(isWalkIn\(\)\) \{\s+state\.payErr = __\("The rest can stay on account only for a named customer\.", null, "Bunood POS"\);/);
});

test("hold appears only where the site can hold", () => {
	assert.match(js, /function canHold\(\) \{\s+return Boolean\(state\.context\?\.capabilities\?\.can_hold\);/);
	assert.match(js, /canHold\(\) \? tab\("held"/);
	assert.match(server, /"can_hold": _can_hold\(invoice_type\),/);
	assert.match(server, /if not _can_hold\(invoice_type\):\s+return \[\]/);
	assert.match(server, /if not _can_hold\(_invoice_type\(\)\):\s+frappe\.throw\(_\("Holding sales is not set up on this site yet\."\)\)/);
});

test("every counter string is in the translation gate, with the counter's own context", () => {
	const i18n = read("tools/i18n.mjs");
	assert.match(i18n, /join\(APP, "public", "js", "pos_workbench\.js"\),/);
	assert.doesNotMatch(js.slice(0, js.indexOf("The native print view")), /__\("[^"]+"\)/, "a bare __() would take a global meaning (Nos reads «لا»)");
	for (const [source, arabicText] of [["Bunood POS", "نقطة بيع بنود"], ["Exact cash", "نقدي مضبوط"], ["Held sales", "الفواتير المعلّقة"], ["Nos", "حبة"]]) {
		assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith(`${source},${arabicText},Bunood POS`)), source);
	}
});

test("receipts from both invoice types act on their own type", () => {
	assert.match(server, /return receipt_register\(\s+mode="all", pos_profile=pos_profile, search_term=search_term, limit=limit,\s+\)\["rows"\]/);
	assert.match(server, /filters\["is_consolidated"\] = 0/);
	assert.match(js, /onclick: \(\) => printReceipt\(row\.doctype, row\.name\)/);
	assert.match(js, /api\("create_return", \{ source_doctype: row\.doctype, source_name: row\.name \}/);
	assert.match(js, /frappe\.set_route\("bnd-pos-register"\)/);
});

test("resuming a held sale asks before replacing a bill in progress", () => {
	assert.match(js, /function resume\(name\) \{\s+const go = \(\) => resumeNow\(name\);\s+if \(state\.lines\.length && state\.screen === "sale"\) \{\s+frappe\.confirm\(/);
	assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith("Replace the current bill with this held sale? Hold the current one first if you need it.,")));
});

test("the receipt register is a role-gated Page over the read-only union, reprinting natively", () => {
	const page = JSON.parse(read("bunood_theme/bunood_theme/page/bnd_pos_register/bnd_pos_register.json"));
	assert.equal(page.name, "bnd-pos-register");
	assert.deepEqual(page.roles.map((row) => row.role).sort(),
		["Accounts Manager", "Accounts User", "Auditor", "Sales Manager", "Sales User", "System Manager"]);
	const loader = read("bunood_theme/bunood_theme/page/bnd_pos_register/bnd_pos_register.js");
	assert.match(loader, /window\.bunood_theme\.pos_register_render\(container, page\)/);
	assert.match(loader, /method: "bunood_theme\.api\.get_pos_assets"/);
	assert.match(js, /window\.bunood_theme\.pos_register_render = renderRegister;/);
	assert.match(js, /api\("receipt_register", \{/);
	assert.match(js, /button\(__\("Reprint"\), "printer", "btn btn-default", \(\) => openPrintView\(row\.doctype, row\.name, "Standard"\)\)/);
	assert.match(js, /window\.open\(`\/printview\?\$\{query\.toString\(\)\}`, "_blank", "noopener"\)/);
	assert.doesNotMatch(js, /get_delivery_status|printCustomerReceipt|queue_invoice/, "no ZATCA delivery gate on reprint");
	assert.match(js, /frappe\.set_route\("bnd-pos-register"\)/);
	assert.match(scss, /html\[data-theme\] \.bnd-pos-register \{/);
	assert.doesNotMatch(scss.slice(scss.indexOf("The receipt register")), /#[0-9a-fA-F]{3,6}\b/, "re-tokenised");
	for (const source of ["POS sales register", "View all POS receipts", "Reprint", "Load more receipts"]) {
		assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith(source + ",")), source);
	}
});

// Phase 2, 2026-10-09: the shift close and the return by receipt, inside the counter.
const fn = (name) => {
	const start = js.indexOf(`function ${name}(`);
	assert.ok(start > 0, name);
	const next = js.indexOf("\n\t\tfunction ", start + 1);
	return js.slice(start, next > 0 ? next : undefined);
};

test("the shift close counts blind: the expected figures arrive only with the result", () => {
	assert.match(fn("closeShift"), /api\("close_shift_context", \{ pos_profile: opening\.pos_profile \}, \{ type: "GET", silent: true \}\)/);
	assert.match(fn("previewClose"), /api\("preview_close", \{ pos_profile: close\.profile, counted: JSON\.stringify\(countedRows\(\)\) \}/);
	assert.match(fn("submitClose"), /api\("close_shift", \{ pos_profile: close\.profile, counted: JSON\.stringify\(countedRows\(\)\), reason: closeReason\(\) \}/);
	// The count step renders from the context, which carries no expected figure.
	assert.doesNotMatch(fn("renderCloseCount"), /expected_amount|closing_amount|difference|close\.result/);
	assert.match(fn("renderCloseResult"), /row\.expected_amount/);
	// A difference holds the close until a reason is given.
	assert.match(fn("renderCloseResult"), /const blocked = close\.busy \|\| \(differs && !closeReason\(\)\);/);
	assert.match(fn("submitClose"), /if \(closeHasDifference\(\) && !closeReason\(\)\)/);
	// The menu and the out-of-date gate open the counter's close, not a blank native form.
	assert.doesNotMatch(js, /frappe\.new_doc\("POS Closing Entry"\)/);
	assert.match(fn("submitClose"), /openPrintView\("POS Closing Entry", close\.closed\.name, "Standard"\)/);
});

test("a count typed with Arabic-Indic digits is read as the same number", () => {
	const latinDigits = new Function(`${fn("latinDigits")}
return latinDigits;`)();
	assert.equal(latinDigits("٧٥"), "75");
	assert.equal(latinDigits("١٢٣٫٥"), "123.5");
	assert.equal(latinDigits("۱۲"), "12");
	assert.equal(Number(latinDigits(" 4 0 ر.س")), 40);
	// A thousands separator never turns into a second decimal point (that read as 0).
	assert.equal(latinDigits("1,250.50"), "1250.50");
	assert.equal(latinDigits("١٬٢٥٠٫٥"), "1250.5");
	assert.match(fn("countedRows"), /round\(settled\(close\.others\[row\.mode_of_payment\]\)\)/);
	// A card settlement may be negative; the drawer's cash may not.
	const settled = new Function("latinDigits", `${fn("settled")}\nreturn settled;`)(latinDigits);
	assert.equal(settled("-120.5"), -120.5);
	assert.equal(settled("\u2212٤٠"), -40);
	assert.equal(settled("75"), 75);
	// Notes and coins in use (20 and 2 riyal included), plus loose coins as an amount.
	assert.match(js, /const DENOMINATIONS = \[500, 200, 100, 50, 20, 10, 5, 2, 1, 0\.5\];/);
	assert.match(fn("countedCash"), /return round\(notes \+ Number\(latinDigits\(close\.coins\) \|\| 0\)\);/);
});

test("a return by receipt sends only the chosen lines, and issues only the previewed credit note", () => {
	assert.match(fn("createReturn"), /api\("return_context", \{ source_doctype: row\.doctype, source_name: row\.name \}, \{ type: "GET", silent: true \}\)/);
	assert.match(fn("returnPicks"), /\.filter\(\(\[, pick\]\) => pick\.on && pick\.qty > 0\)/);
	assert.match(fn("previewReturn"), /if \(state\.ret !== ret \|\| rev !== ret\.rev\) return;/);
	// The issue button waits for the preview of exactly these lines and this refund.
	assert.match(fn("renderReturnView"), /const preview = ret\.preview && ret\.preview\.rev === ret\.rev \? ret\.preview : null;/);
	assert.match(fn("renderReturnView"), /disabled: !preview \|\| ret\.busy, onclick: submitReturn/);
	assert.match(fn("submitReturn"), /api\("submit_return", \{/);
	// Credit is offered only for a named customer; the native form stays reachable.
	assert.match(fn("refundOptions"), /if \(ctx\.credit_allowed && ctx\.customer && ctx\.customer !== state\.profile\?\.customer\) options\.push\(\{ id: "__credit__"/);
	// One token per return view: a retry after a lost answer gets the same credit note.
	assert.match(fn("createReturn"), /const ret = \{ source: row, token,/);
	assert.match(fn("submitReturn"), /request_id: ret\.token,/);
	assert.match(fn("nativeReturn"), /api\("create_return"/);
	// The damaged toggle appears only where the company has a rejected-goods warehouse.
	assert.match(fn("renderReturnView"), /const damagedOk = Boolean\(ctx\.damaged_warehouse\);/);
});

test("inside the close and return views no sale key fires; Esc steps back", () => {
	const onKey = fn("onKey");
	assert.match(onKey, /if \(state\.view === "gate" \|\| state\.view === "close" \|\| state\.view === "return"\) return;/);
	assert.ok(onKey.indexOf('state.view === "close") return;') < onKey.indexOf("const fkeys"), "views return before the function keys");
	assert.match(onKey, /else if \(state\.view === "return"\) \{ if \(!state\.ret\?\.busy\) leaveReturn\(\); \}/);
	assert.match(onKey, /if \(state\.close\?\.step === "result" && !state\.close\.busy\) \{ state\.close\.step = "count"; renderCloseView\(\); \}/);
	// The server's refusal shows in the view, not as a desk dialog over it.
	assert.match(js, /silent: Boolean\(options\?\.silent\)/);
	assert.match(js, /error\?\._server_messages \|\| error\?\.responseJSON\?\._server_messages/);
});

test("the receipts table's narrow layout leaves the close and return tables their own", () => {
	assert.match(scss, /\.bnd-pos__tr:not\(\.bnd-pos__tr--close, \.bnd-pos__tr--return\) \{\s+grid-template-columns: 4rem minmax\(0, 1fr\) 7rem;/);
	assert.match(scss, /\.bnd-pos__tr--close \{\s+grid-template-columns: minmax\(0, 1\.4fr\) repeat\(3, minmax\(0, 1fr\)\);/);
	for (const [source, arabicText] of [["Done counting — show the result", "انتهيت من العد — عرض النتيجة"], ["Issue the credit note", "إصدار إشعار دائن"], ["Back to stock", "يعود للمخزون"]]) {
		assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith(`${source},${arabicText},Bunood POS`)), source);
	}
});
