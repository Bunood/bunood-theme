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
	// Phase 4: the prefixes come from the POS Profile's settings; run the parser itself.
	const start = js.indexOf("\n\tfunction parseLabel(");
	const parseLabel = new Function(`${js.slice(start, js.indexOf("\n\t}\n", start) + 3)}\nreturn parseLabel;`)();
	assert.deepEqual(parseLabel("2101230012509", "21"), { barcode: "01230", qty: 1.25 });
	assert.deepEqual(parseLabel("2201230012509", "22"), { barcode: "01230", qty: 1.25 });
	assert.equal(parseLabel("2101230012509", ""), null, "scale labels are off without a prefix");
	assert.equal(parseLabel("6281007100014", "21"), null, "an ordinary EAN-13 is not a label");
	assert.equal(parseLabel("2101230000009", "21"), null, "a zero weight is no label");
	assert.match(js, /let label = parseLabel\(code, counter\("scale_prefix"\)\);/);
	// Review 2026-10-10: a label whose item is unknown is tried as an ordinary barcode,
	// and linking keeps the item's 5-digit code, then reads the label again.
	assert.match(fn("scan"), /if \(label && !hits\.length\) \{\s+const whole = await find\(code\);/);
	assert.match(fn("scan"), /state\.unknown = lookup;\s+state\.unknownLabel = label \? code : "";/);
	assert.match(fn("saveLink"), /if \(labelled\) scan\(labelled\);\s+else addItem\(row, 1\);/);
	// A count typed before the scan ("3*" then the barcode) multiplies it.
	assert.match(js, /\/\^\(\\d\+\(\?:\\\.\\d\+\)\?\)\\\*\(\.\+\)\$\/\.exec\(code\)/);
	// An unknown code never blocks the sale: link it to an item or make a new one.
	assert.match(js, /state\.unknown = lookup;/);
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
	// The profile's notes; by default the buttons the counter showed before it had settings.
	assert.match(js, /\(counter\("cash_notes"\) \|\| \[10, 50, 100, 200, 500\]\)\.forEach\(\(note\) => add\(note >= 200 \? note : Math\.ceil\(total \/ note\) \* note\)\);/);
	assert.match(js, /if \(counter\("cash_exact"\) !== false\) add\(total\);/);
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
	assert.match(fn("renderCloseResult"), /const blocked = close\.busy \|\| \(differs && !closeReason\(\)\) \|\| heldBlocksClose\(\);/);
	// Phase 4: a difference within the profile's threshold needs no reason.
	assert.match(fn("closeHasDifference"), /return difference >= 0\.005 && difference > threshold;/);
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
	assert.match(onKey, /if \(\["gate", "close", "return", "settings"\]\.includes\(state\.view\)\) return;/);
	assert.ok(onKey.indexOf('"settings"].includes(state.view)) return;') < onKey.indexOf("const fkeys"), "views return before the function keys");
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

// Phase 3, 2026-10-09: the customer screen.
const moduleFn = (name) => {
	const start = js.indexOf(`\n\tfunction ${name}(`);
	assert.ok(start > 0, name);
	const next = js.indexOf("\n\tfunction ", start + 1);
	return js.slice(start, next > 0 ? next : undefined);
};

test("the customer screen shows the customer only what faces the queue", () => {
	const shown = fn("displayState");
	// Never the customer's name or tax number, a held draft's number or a payment reference.
	assert.doesNotMatch(shown, /customerName|customerTaxId|state\.customer\b|reference|state\.draft/);
	for (const mode of ["closed", "thanks", "pay", "idle", "sale"]) assert.match(shown, new RegExp(`mode: "${mode}"`));
	// One channel per POS Profile; the screen fetches nothing of its own.
	const channel = new Function(`${moduleFn("displayChannel")}\nreturn displayChannel;`)();
	assert.equal(channel("نقطة 1"), "bnd-pos-display:نقطة 1");
	assert.doesNotMatch(moduleFn("renderDisplay"), /api\(|frappe\.call|fetch\(/);
});

test("the customer screen renders text, never markup, and only a same-site logo", () => {
	const screen = moduleFn("renderDisplay");
	assert.doesNotMatch(screen, /innerHTML|outerHTML|insertAdjacentHTML/);
	assert.match(screen, /receipt\.qr_svg\.startsWith\("<svg"\)/);
	assert.match(screen, /src: `data:image\/svg\+xml;base64,\$\{btoa\(receipt\.qr_svg\)\}`/);
	assert.match(screen, /DISPLAY_MODES\.has\(message\.state\?\.mode\)/);
	// Review 2026-10-09: an origin check (a "/\host" path resolves off-site), desk
	// messages kept off the customer's monitor, a thanks screen that does not linger.
	assert.match(screen, /new URL\(path, window\.location\.origin\)\.origin === window\.location\.origin/);
	assert.match(screen, /Object\.assign\(frappe, \{ msgprint: quiet, show_alert: quiet, show_progress: quiet \}\)/);
	assert.match(screen, /\}, 30000\);/);
	assert.match(screen, /if \(next\.mode === "thanks" && next\.name && next\.name === expired\) return;/);
	assert.match(scss, /\.bnd-pos-display \{[^}]*z-index: var\(--bnd-z-customer-screen\);/);
});

test("the counter keeps the screen in step and asks for a receipt link only while one is shown", () => {
	for (const name of ["renderBill", "renderPanel", "renderGate"]) assert.match(fn(name), /pushDisplay\(\);/, name);
	assert.match(fn("loadReceipt"), /if \(!display\.connected \|\| !result\?\.name \|\| !receiptOffered\(\)\) return;/);
	assert.match(fn("receiptOffered"), /return isWalkIn\(\) && !state\.customerTaxId && state\.context\?\.capabilities\?\.can_print_invoice !== false && counter\("receipt_qr"\) !== false;/);
	assert.match(fn("loadReceipt"), /api\("receipt_link", \{ doctype: result\.doctype, name: result\.name \}, \{ silent: true \}\)/);
	// The bill and the screen read one set of line amounts.
	assert.match(fn("renderBill"), /const amounts = shownAmounts\(\);/);
	assert.match(fn("displayState"), /const amounts = shownAmounts\(\);/);
	// The second window is the same Page with ?display=<POS Profile>.
	assert.match(js, /const displayFor = new URLSearchParams\(window\.location\.search\)\.get\("display"\);\n\t\tif \(displayFor\) \{\n\t\t\trenderDisplay\(container, page, displayFor\);/);
	assert.match(scss, /--bnd-qr-ground/);
	assert.ok(arabic.split(/\r?\n/).some((line) => line.startsWith("Your e-receipt,فاتورتك الإلكترونية,Bunood POS")));
});

// Phase 4, 2026-10-10: the settings page.
test("the settings page saves through the server and the counter takes the result at once", () => {
	assert.match(fn("openSettings"), /if \(!state\.profile\?\.can_edit \|\| needsConnection\(\)\) return;/);
	assert.match(js, /state\.profile\?\.can_edit \? h\("button", \{ type: "button", role: "menuitem", onclick: \(\) => \{ state\.menuOpen = false; renderBar\(\); openSettings\(\); \} \}/);
	assert.match(fn("openSettings"), /api\("settings_context", \{ pos_profile: settings\.profile \}, \{ type: "GET", silent: true \}\)/);
	const save = fn("saveSettings");
	assert.match(save, /api\("save_settings", \{/);
	// Only the native fields that changed go to the POS Profile.
	assert.match(save, /if \(JSON\.stringify\(value\) !== JSON\.stringify\(settings\.ctx\.native\[field\]\)\) native\[field\] = value;/);
	assert.match(save, /api\("get_context", \{ pos_profile: settings\.profile \}, \{ type: "GET", silent: true \}\)/);
	assert.match(fn("unsavedGuard"), /if \(state\.view === "settings" && state\.settings\?\.dirty\) \{\s+frappe\.confirm\(/);
	assert.match(fn("changeSetting"), /if \(!settings\?\.ctx\?\.can_edit \|\| settings\.busy\) return;/);
	// Every row is one the counter honours: no row names a key the server does not know.
	const sections = fn("settingsSections");
	assert.doesNotMatch(js, /price_prefix/, "price labels are not part of this phase");
	// Only the counter keys this page changed, and the profile version it read.
	assert.match(save, /counter: JSON\.stringify\(counterChanges\),\s+modified: settings\.ctx\.modified,/);
	for (const name of ["renderBar", "leaveSettings"]) assert.match(fn(name), /unsavedGuard\(/, name);
	for (const key of ["fbar", "tiles", "customer_screen", "max_discount", "returns", "new_item", "cash_exact", "cash_notes", "merge_scans", "scale_prefix", "unknown_barcode", "receipt_qr", "reason_threshold", "held_on_close"]) {
		assert.ok(sections.includes(`"${key}"`), key);
		assert.ok(server.includes(`"${key}": `), `server default for ${key}`);
	}
});

test("a profile that never opened the settings behaves as before", () => {
	// Supermarket mode: this device's own choice first, the profile's otherwise.
	assert.match(fn("fbarOn"), /return typeof prefs\.fbar === "boolean" \? prefs\.fbar : Boolean\(counter\("fbar"\)\);/);
	assert.match(fn("addItem"), /isWeighed \|\| item\.serial_no \|\| counter\("merge_scans"\) === false \? -1/);
	assert.match(fn("renderAlert"), /const offer = counter\("unknown_barcode"\) !== "alert" && !offline\.on;/);
	assert.match(js, /const canReturn = state\.context\?\.capabilities\?\.can_create_invoice && counter\("returns"\) !== false;/);
	assert.match(scss, /&\[data-tiles="s"\] \{\s+--bnd-pos-tile-h: 5rem;/);
});

// Phase 5, 2026-10-10: selling through a lost connection.
test("offline, the counter sells from the device's catalogue and keeps the sale there", () => {
	assert.match(js, /if \(navigator\.onLine === false\) return Promise\.reject\(\{ status: 0, message: "" \}\);/);
	assert.match(js, /if \(error && error\.status === 0\) window\.dispatchEvent\(new CustomEvent\("bnd-pos-network"\)\);/);
	assert.match(fn("loadItems"), /if \(offline\.on\) \{\s+state\.items = offlineList\(\);/);
	assert.match(fn("scan"), /if \(offline\.on\) return offlineFind\(term\);/);
	assert.match(fn("serverTotal"), /if \(offline\.on\) return offlineDue\(\);/);
	// Paid in full, never a held sale, then kept on the device under its own id.
	const complete = fn("complete");
	assert.match(complete, /if \(state\.draft\) \{\s+state\.payErr = __\("A held sale is completed with the connection\."/);
	assert.match(complete, /\} else if \(sum \+ 0\.001 < total\) \{\s+state\.payErr = __\("Without a connection a sale is paid in full\."/);
	assert.match(complete, /await keepSale\(payments, total\);/);
	assert.ok(complete.indexOf("await keepSale(") < complete.indexOf('api("checkout"'), "kept before any checkout call");
	assert.match(fn("keepSale"), /await saveSale\(sale\);/);
});

test("the kept sales are sent once, and only after the server answers", () => {
	const sync = fn("syncQueue");
	assert.match(sync, /api\("sync_offline_sale", \{\s+offline_id: sale\.id,/);
	// Dropped from the device only after the server answered; a network failure stops the run.
	assert.ok(sync.lastIndexOf("await dropSale(sale.id);") > sync.indexOf('api("sync_offline_sale"'));
	// A sale held for review on the server is never sent again, only looked up.
	assert.match(sync, /for \(const sale of mine\.filter\(\(item\) => item\.status !== "review"\)\) \{/);
	assert.match(sync, /api\("offline_sale_state", \{ offline_ids: JSON\.stringify\(reviewing\.map\(\(sale\) => sale\.id\)\) \}/);
	// The same id travels with a checkout, so a lost answer is not a second sale.
	assert.match(fn("complete"), /client_id: state\.saleId,/);
	assert.match(fn("complete"), /if \(error\?\.status === 0 && !state\.draft && sum \+ 0\.001 >= total\) \{\s+await keepSale\(payments, total\);/);
	assert.match(fn("cartChanged"), /state\.saleId = "";/);
	assert.match(sync, /if \(error\?\.status === 0\) break;/);
	// A shift with sales still on the device does not close.
	assert.match(fn("closeShift"), /const waiting = queueFor\(opening\.pos_profile\)\.length;\s+if \(waiting && state\.context\?\.opening_entry\) \{/);
	for (const name of ["hold", "toggleHeld", "showList", "openCustomer", "openSettings"]) assert.match(fn(name), /needsConnection\(\)/, name);
	// The provisional receipt is escaped text, never markup.
	const escapeHtml = new Function(`${js.slice(js.indexOf("\n\tfunction escapeHtml("), js.indexOf("\n\t}\n", js.indexOf("\n\tfunction escapeHtml(")) + 3)}\nreturn escapeHtml;`)();
	assert.equal(escapeHtml(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
	assert.match(fn("printProvisional"), /\$\{escapeHtml\(line\.name\)\}/);
});

// Phase 5 review: offline, the counter must round exactly as ERPNext will, or what it
// collects is not what posts. Expected values are Frappe's own round_based_on_smallest_
// currency_fraction run in the lab for each System Settings method and fraction.
test("offline totals round exactly as ERPNext rounds them", () => {
	const lift = (name) => {
		const start = js.indexOf("\n\tfunction " + name + "(");
		return js.slice(start, js.indexOf("\n\t}\n", start) + 3);
	};
	const roundLikeERPNext = new Function(lift("frappeRounded") + lift("roundLikeERPNext") + "\nreturn roundLikeERPNext;")();
	const expected = [["Banker's Rounding (legacy)", 0, 12.5, 12.0], ["Banker's Rounding (legacy)", 0, 13.5, 14.0], ["Banker's Rounding (legacy)", 0, 0.5, 0.0], ["Banker's Rounding (legacy)", 0, 74.73, 75.0], ["Banker's Rounding (legacy)", 0, 118.86, 119.0], ["Banker's Rounding (legacy)", 0, 2.675, 3.0], ["Banker's Rounding (legacy)", 0, 33.63, 34.0], ["Banker's Rounding (legacy)", 0, 56.87, 57.0], ["Banker's Rounding (legacy)", 0, 87.43, 87.0], ["Banker's Rounding (legacy)", 0, 99.995, 100.0], ["Banker's Rounding (legacy)", 0, 7.125, 7.0], ["Banker's Rounding (legacy)", 0.05, 12.5, 12.5], ["Banker's Rounding (legacy)", 0.05, 13.5, 13.5], ["Banker's Rounding (legacy)", 0.05, 0.5, 0.5], ["Banker's Rounding (legacy)", 0.05, 74.73, 74.75], ["Banker's Rounding (legacy)", 0.05, 118.86, 118.85], ["Banker's Rounding (legacy)", 0.05, 2.675, 2.7], ["Banker's Rounding (legacy)", 0.05, 33.63, 33.65], ["Banker's Rounding (legacy)", 0.05, 56.87, 56.85], ["Banker's Rounding (legacy)", 0.05, 87.43, 87.45], ["Banker's Rounding (legacy)", 0.05, 99.995, 100.0], ["Banker's Rounding (legacy)", 0.05, 7.125, 7.15], ["Banker's Rounding (legacy)", 0.25, 12.5, 12.5], ["Banker's Rounding (legacy)", 0.25, 13.5, 13.5], ["Banker's Rounding (legacy)", 0.25, 0.5, 0.5], ["Banker's Rounding (legacy)", 0.25, 74.73, 74.75], ["Banker's Rounding (legacy)", 0.25, 118.86, 118.75], ["Banker's Rounding (legacy)", 0.25, 2.675, 2.75], ["Banker's Rounding (legacy)", 0.25, 33.63, 33.75], ["Banker's Rounding (legacy)", 0.25, 56.87, 56.75], ["Banker's Rounding (legacy)", 0.25, 87.43, 87.5], ["Banker's Rounding (legacy)", 0.25, 99.995, 100.0], ["Banker's Rounding (legacy)", 0.25, 7.125, 7.25], ["Banker's Rounding (legacy)", 0.5, 12.5, 12.5], ["Banker's Rounding (legacy)", 0.5, 13.5, 13.5], ["Banker's Rounding (legacy)", 0.5, 0.5, 0.5], ["Banker's Rounding (legacy)", 0.5, 74.73, 74.5], ["Banker's Rounding (legacy)", 0.5, 118.86, 119.0], ["Banker's Rounding (legacy)", 0.5, 2.675, 2.5], ["Banker's Rounding (legacy)", 0.5, 33.63, 33.5], ["Banker's Rounding (legacy)", 0.5, 56.87, 57.0], ["Banker's Rounding (legacy)", 0.5, 87.43, 87.5], ["Banker's Rounding (legacy)", 0.5, 99.995, 100.0], ["Banker's Rounding (legacy)", 0.5, 7.125, 7.0], ["Banker's Rounding", 0, 12.5, 12.0], ["Banker's Rounding", 0, 13.5, 14.0], ["Banker's Rounding", 0, 0.5, 0.0], ["Banker's Rounding", 0, 74.73, 75.0], ["Banker's Rounding", 0, 118.86, 119.0], ["Banker's Rounding", 0, 2.675, 3.0], ["Banker's Rounding", 0, 33.63, 34.0], ["Banker's Rounding", 0, 56.87, 57.0], ["Banker's Rounding", 0, 87.43, 87.0], ["Banker's Rounding", 0, 99.995, 100.0], ["Banker's Rounding", 0, 7.125, 7.0], ["Banker's Rounding", 0.05, 12.5, 12.5], ["Banker's Rounding", 0.05, 13.5, 13.5], ["Banker's Rounding", 0.05, 0.5, 0.5], ["Banker's Rounding", 0.05, 74.73, 74.75], ["Banker's Rounding", 0.05, 118.86, 118.85], ["Banker's Rounding", 0.05, 2.675, 2.66], ["Banker's Rounding", 0.05, 33.63, 33.65], ["Banker's Rounding", 0.05, 56.87, 56.85], ["Banker's Rounding", 0.05, 87.43, 87.45], ["Banker's Rounding", 0.05, 99.995, 100.0], ["Banker's Rounding", 0.05, 7.125, 7.1], ["Banker's Rounding", 0.25, 12.5, 12.5], ["Banker's Rounding", 0.25, 13.5, 13.5], ["Banker's Rounding", 0.25, 0.5, 0.5], ["Banker's Rounding", 0.25, 74.73, 74.75], ["Banker's Rounding", 0.25, 118.86, 118.75], ["Banker's Rounding", 0.25, 2.675, 2.74], ["Banker's Rounding", 0.25, 33.63, 33.75], ["Banker's Rounding", 0.25, 56.87, 56.75], ["Banker's Rounding", 0.25, 87.43, 87.5], ["Banker's Rounding", 0.25, 99.995, 100.0], ["Banker's Rounding", 0.25, 7.125, 7.0], ["Banker's Rounding", 0.5, 12.5, 12.5], ["Banker's Rounding", 0.5, 13.5, 13.5], ["Banker's Rounding", 0.5, 0.5, 0.5], ["Banker's Rounding", 0.5, 74.73, 74.5], ["Banker's Rounding", 0.5, 118.86, 119.0], ["Banker's Rounding", 0.5, 2.675, 2.5], ["Banker's Rounding", 0.5, 33.63, 33.5], ["Banker's Rounding", 0.5, 56.87, 57.0], ["Banker's Rounding", 0.5, 87.43, 87.5], ["Banker's Rounding", 0.5, 99.995, 100.0], ["Banker's Rounding", 0.5, 7.125, 7.0], ["Commercial Rounding", 0, 12.5, 13.0], ["Commercial Rounding", 0, 13.5, 14.0], ["Commercial Rounding", 0, 0.5, 1.0], ["Commercial Rounding", 0, 74.73, 75.0], ["Commercial Rounding", 0, 118.86, 119.0], ["Commercial Rounding", 0, 2.675, 3.0], ["Commercial Rounding", 0, 33.63, 34.0], ["Commercial Rounding", 0, 56.87, 57.0], ["Commercial Rounding", 0, 87.43, 87.0], ["Commercial Rounding", 0, 99.995, 100.0], ["Commercial Rounding", 0, 7.125, 7.0], ["Commercial Rounding", 0.05, 12.5, 12.5], ["Commercial Rounding", 0.05, 13.5, 13.5], ["Commercial Rounding", 0.05, 0.5, 0.5], ["Commercial Rounding", 0.05, 74.73, 74.75], ["Commercial Rounding", 0.05, 118.86, 118.85], ["Commercial Rounding", 0.05, 2.675, 2.7], ["Commercial Rounding", 0.05, 33.63, 33.65], ["Commercial Rounding", 0.05, 56.87, 56.85], ["Commercial Rounding", 0.05, 87.43, 87.45], ["Commercial Rounding", 0.05, 99.995, 100.0], ["Commercial Rounding", 0.05, 7.125, 7.15], ["Commercial Rounding", 0.25, 12.5, 12.5], ["Commercial Rounding", 0.25, 13.5, 13.5], ["Commercial Rounding", 0.25, 0.5, 0.5], ["Commercial Rounding", 0.25, 74.73, 74.75], ["Commercial Rounding", 0.25, 118.86, 118.75], ["Commercial Rounding", 0.25, 2.675, 2.75], ["Commercial Rounding", 0.25, 33.63, 33.75], ["Commercial Rounding", 0.25, 56.87, 56.75], ["Commercial Rounding", 0.25, 87.43, 87.5], ["Commercial Rounding", 0.25, 99.995, 100.0], ["Commercial Rounding", 0.25, 7.125, 7.25], ["Commercial Rounding", 0.5, 12.5, 12.5], ["Commercial Rounding", 0.5, 13.5, 13.5], ["Commercial Rounding", 0.5, 0.5, 0.5], ["Commercial Rounding", 0.5, 74.73, 74.5], ["Commercial Rounding", 0.5, 118.86, 119.0], ["Commercial Rounding", 0.5, 2.675, 2.5], ["Commercial Rounding", 0.5, 33.63, 33.5], ["Commercial Rounding", 0.5, 56.87, 57.0], ["Commercial Rounding", 0.5, 87.43, 87.5], ["Commercial Rounding", 0.5, 99.995, 100.0], ["Commercial Rounding", 0.5, 7.125, 7.0]];
	for (const [method, fraction, value, want] of expected) {
		assert.equal(roundLikeERPNext(value, { method, fraction, precision: 2 }), want, method + " / " + fraction + " / " + value);
	}
});

// Phase 6, 2026-10-10: Tabby and Tamara at the counter.
test("a Tabby or Tamara payment carries its order number and shows its payments", () => {
	assert.match(fn("methodTone"), /if \(row && bnplOf\(row\.mode_of_payment\)\) return "bnpl";/);
	assert.match(fn("complete"), /const unreferenced = payments\.find\(\(row\) => Number\(row\.amount\) > 0 && bnplOf\(row\.mode_of_payment\) && !String\(row\.reference_no \|\| ""\)\.trim\(\)\);/);
	assert.ok(fn("complete").indexOf("const unreferenced") < fn("complete").indexOf('api("checkout"'), "checked before checkout");
	assert.match(fn("displayState"), /bnpl: bnplOf\(row\.mode_of_payment\),/);
	assert.match(fn("settingsRow"), /h\("option", \{ value: "tabby", selected: map\[mode\]\?\.provider === "tabby" \}, "Tabby"\)/);
	assert.match(scss, /\[data-tone="bnpl"\] \.bnd-pos__swatch \{/);
});

// 2026-10-10 (owner): each point of sale shows, and keeps to, its company, warehouse and items.
test("the counter says which company, branch and warehouse it sells from", () => {
	assert.match(fn("storeBadge"), /h\("small", null, store\.company\), h\("strong", null, place\)/);
	assert.match(fn("renderBar"), /storeBadge\(\),/);
	assert.match(fn("storeFacts"), /fact\(__\("Warehouse", null, "Bunood POS"\), store\.warehouse_name\)/);
	assert.match(js, /companies\.size > 1 && row\.company !== profiles\[index - 1\]\?\.company/);
	assert.match(scss, /\.bnd-pos__store \{/);
});

test("the catalogue pages where the server says, and a code sold elsewhere is not an unknown code", () => {
	assert.match(fn("loadItems"), /start: append \? state\.itemsNext : 0,/);
	assert.match(fn("loadItems"), /state\.more = typeof result\?\.more === "boolean" \? result\.more : rows\.length === PAGE_SIZE;/);
	assert.match(js, /if \(!exact\.length && result\?\.elsewhere\) return Object\.assign\(\[\], \{ elsewhere: true \}\);/);
	assert.match(js, /if \(!whole\.length && whole\.elsewhere\) hits = whole;/);
	// A refused scan leaves no pending quantity or older unknown code behind.
	assert.match(js, /\} else if \(hits\.elsewhere\) \{\s*state\.unknown = "";\s*state\.unknownLabel = "";\s*state\.mult = null;/);
	// An item made at the counter is the counter's company's, in its warehouse.
	assert.match(fn("addBarcode"), /company: store\.company, default_warehouse: store\.warehouse/);
	assert.match(fn("newItem"), /await addBarcode\(doc\.name, code, true\);/);
	assert.ok(js.indexOf("} else if (hits.elsewhere) {") < js.indexOf("state.unknown = lookup;"), "a code sold elsewhere is never offered for linking");
});

test("the settings page opens on the store: warehouse, item groups, stock and the company's items", () => {
	const sections = fn("settingsSections");
	assert.ok(sections.indexOf('"Store and stock"') > 0 && sections.indexOf('"Store and stock"') < sections.indexOf('"The screen"'));
	assert.match(sections, /kind: "warehouse", source: "native", key: "warehouse"/);
	assert.match(sections, /kind: "groups", source: "native", key: "item_groups"/);
	assert.match(sections, /S\("counter", "item_scope", __\("Items shown", null, "Bunood POS"\)/);
	assert.match(sections, /\["company", __\("This company's items", null, "Bunood POS"\)\], \["warehouse", __\("This warehouse's items", null, "Bunood POS"\)\], \["all", __\("All items", null, "Bunood POS"\)\]/);
	assert.match(fn("settingsRow"), /disabled: !editable \|\| locked,/);
	assert.match(fn("saveSettings"), /if \(scope\) \{\s*loadItems\(false\);\s*refreshCatalog\(\);/);
});
