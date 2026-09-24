const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('production asset build ships the bill and simplified-form controllers', () => {
  const build = fs.readFileSync('build.mjs', 'utf8');
  for (const source of ['bunood.js','document_actions.js','list_presets.js','sales_bill.js','simple_forms.js']) assert.match(build, new RegExp(`"${source.replace('.', '\\.')}"`));
  assert.match(build, /key === "bunood"[\s\S]*?await readDeskJs\(\)/);
  assert.match(build, /key: "bnd-studio", src: "report_studio\.js", pyid: "STUDIO_JS"/);
  const boot = fs.readFileSync('bunood_theme/boot.py', 'utf8');
  assert.match(boot, /from bunood_theme\.assets import STUDIO_CSS, STUDIO_JS[\s\S]*?bootinfo\.bnd_studio_js = STUDIO_JS[\s\S]*?bootinfo\.bnd_studio_css = STUDIO_CSS/);
});
test('ZATCA calls the package module that actually owns the whitelisted facade', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /bunood_theme\.zatca\.status\.get_status/);
  assert.match(source, /bunood_theme\.zatca\.status\.queue_invoice/);
  assert.doesNotMatch(source, /bunood_theme\.zatca\.(?:get_status|queue_invoice)/);
});
test('sales bill uses the full document width while its mode switch follows the invoice grid', () => {
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(css, /body:not\(\.full-width\) \.bnd-bill \{[\s\S]*?max-inline-size: none;[\s\S]*?margin-inline: auto;/);
  assert.match(css, /body:not\(\.full-width\) \.bnd-bill-mode \{[\s\S]*?max-inline-size: var\(--bnd-wide-w\);[\s\S]*?margin-inline: auto;/);
  assert.match(css, /data-route\^="Form\/Sales Invoice\/"[\s\S]*?data-route\^="Form\/Purchase Invoice\/"[\s\S]*?\.layout-main-section > \.bnd-dochead \{[\s\S]*?inline-size: 100%;[\s\S]*?max-inline-size: none;[\s\S]*?margin-inline: 0;/);
});
test('invoice item suggestions overlay the rows without expanding the table', () => {
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(css, /\.bnd-bill-lines \{[\s\S]*?overflow: visible;/);
  assert.match(css, /\.bnd-bill-lines \.awesomplete > ul \{[^}]*max-block-size: 14rem;[^}]*overflow-y: auto;/);
  assert.doesNotMatch(css, /\.bnd-bill-lines:has\(\.awesomplete/);
});
test('sales bill mode switch follows the active view and exposes one selected state', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /this\.placeMode\(simple\)/);
  assert.match(source, /this\.native\?\.querySelector\?\.\("\.form-tabs-list"\)/);
  assert.match(source, /tabs\.classList\.add\("bnd-bill-mode-row"\)/);
  assert.match(source, /tabs\.append\(this\.mode\)/);
  assert.match(source, /this\.root\.before\(this\.mode\)/);
  assert.match(source, /simpleButton\?\.classList\.toggle\("bnd-bill-primary", simple\)/);
  assert.match(source, /advancedButton\?\.classList\.toggle\("bnd-bill-primary", !simple\)/);
  assert.match(css, /\.bnd-bill-mode \{[\s\S]*?justify-content: flex-start/);
  assert.match(css, /\.form-tabs-list\.bnd-bill-mode-row \{[\s\S]*?display: flex;[\s\S]*?max-inline-size: var\(--bnd-wide-w\)/);
  assert.match(css, /\.form-tabs-list\.bnd-bill-mode-row > \.bnd-bill-mode\[data-bnd-inline="true"\] \{[\s\S]*?inline-size: auto/);
  assert.match(css, /\.bnd-bill-mode > \.bnd-bill-button\[aria-pressed="false"\] \{[\s\S]*?background: var\(--bnd-surface\)/);
  assert.match(css, /\.bnd-bill-mode > \.bnd-bill-button\[aria-pressed="true"\] \{[\s\S]*?color: var\(--bnd-on-deep\);[\s\S]*?background: var\(--bnd-brand-deep\)/);
});
test('redesigned bill keeps essential native controls visible without duplicating option controls', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const desk = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
  assert.match(source, /primaryFields = \["posting_date", "due_date",.*"bill_no", "bill_date"/);
  assert.match(source, /this\.bindControl\(essentials, source, this\.doc\)/);
  assert.match(source, /if \(primaryFields\.includes\(name\) \|\| this\.inlineStockOptions\.has\(name\)\) continue/);
  assert.match(source, /toolsTrigger\.focus\(\)/);
  assert.match(source, /tools\.open = false/);
  assert.match(source, /tools\.addEventListener\("click", e => \{[\s\S]*?toolsTrigger\.focus\(\);[\s\S]*?\}, true\)/);
  assert.match(desk, /event\.target\.closest\("\.bnd-bill-tools"\) \|\|[\s\S]*?querySelector\("\.bnd-bill-tools\[open\]"\)\?\.removeAttribute\("open"\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("role", "button"\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("aria-haspopup", "true"\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("aria-controls", toolBody\.id\)/);
  assert.match(source, /tools\.addEventListener\("toggle", \(\) => toolsTrigger\.setAttribute\("aria-expanded", String\(tools\.open\)\)\)/);
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(css, /container-type: inline-size/);
  assert.match(source, /bnd-bill-panel bnd-bill-party", null, main/);
  assert.match(css, /bnd-bill-line-actions \{\s*grid-column: 9; grid-row: 1/);
  assert.match(css, /\.bnd-bill-line-head,[\s\S]*?min-inline-size: 0/);
  assert.match(css, /\.bnd-bill-lines \{[\s\S]*?max-block-size: none;[\s\S]*?overflow: visible/);
  assert.match(css, /@container.*bnd-cq\(bar-3\)/);
  assert.match(css, /bnd-bill-tools-body \{ position: static; inline-size: 100%/);
});
test('shared workbench makes party context compact and items spreadsheet-first', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.equal((source.match(/context: \["tax_id"/g) || []).length, 2);
  assert.match(source, /bnd-bill-line-head/);
  assert.match(source, /bnd-bill-row-number/);
  assert.match(source, /bnd-bill-mobile-total/);
  assert.match(css, /\.bnd-bill-line-head \{[\s\S]*?position: static/);
  assert.match(css, /\.bnd-bill-essentials \{[\s\S]*?repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.bnd-bill-essentials \{[\s\S]*?align-items: end/);
  assert.match(css, /\.bnd-bill-layout \{[^}]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.bnd-bill-rail \{[\s\S]*?position: fixed/);
  assert.match(css, /\.bnd-bill-toolbar \.bnd-bill-rail-toggle \{[\s\S]*?display: inline-grid !important;/);
  assert.match(css, /\.bnd-bill-toolbar \.bnd-bill-rail-toggle \{[\s\S]*?grid-template-columns: 1\.125rem auto 1\.125rem;/);
  assert.match(css, /\.bnd-bill-toolbar \.bnd-bill-rail-toggle \{[\s\S]*?border-color: var\(--bnd-border\);/);
});
test('invoice context shows the native default warehouse without bypassing field permission', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const arabic = fs.readFileSync('bunood_theme/translations/ar.csv', 'utf8');
  const { profiles } = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice', 'Purchase Invoice']) {
    assert.equal(profiles[type].context.at(-1), 'set_warehouse');
  }
  assert.match(source, /isWarehouse = name === "set_warehouse"/);
  assert.match(source, /get_field_display_status\(\{ \.\.\.field\.df, hidden_due_to_dependency: 0 \}, doc, frm\.perm\)/);
  assert.match(source, /isWarehouse \? __\("Default warehouse"\) : __\(field\.df\.label\)/);
  assert.match(source, /doc\[name\] \? this\.format\(doc\[name\], field\.df\) : __\("Not set"\)/);
  assert.match(arabic, /^Default warehouse,المستودع الافتراضي,/m);
  assert.match(arabic, /^Not set,غير محدد,/m);
});
test('simple Sales Invoice exposes one native stock movement control beside the items', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /bnd-bill-stock-settings/);
  assert.match(source, /frm\.fields_dict\.update_stock/);
  assert.match(source, /frm\.fields_dict\.set_warehouse/);
  assert.match(source, /get_field_display_status\([\s\S]*?\.\.\.warehouseSource\.df, hidden_due_to_dependency: 0[\s\S]*?this\.doc, frm\.perm/);
  assert.match(source, /primaryFields\.includes\(name\) \|\| this\.inlineStockOptions\.has\(name\)/);
  assert.match(source, /renderStockSettings\(\)[\s\S]*?warehouse\.hidden = !enabled/);
  assert.match(source, /No stock movement will be posted/);
  assert.match(source, /On submission, quantities are deducted from stock/);
  assert.match(css, /\.bnd-bill-stock-settings \{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.bnd-bill-stock-source\[hidden\] \{ display: none !important; \}/);
});
test('phone invoices use one expanded line card and a persistent action total', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /bnd-bill-line-toggle/);
  assert.match(source, /setExpandedLine\(name\)/);
  assert.match(source, /this\.mobileExpanded = row\.name/);
  assert.match(source, /newLineControl\?\.control\.set_focus\(\)/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-line-head \{ display: none; \}/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-essentials \{\s*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-essentials > \.frappe-control:first-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.bnd-bill-line:not\(\.is-expanded\) \.bnd-bill-line-body \{ display: none; \}/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-line-body \{\s*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-mobile-total \{\s*display: flex;/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-mobile-total \{[\s\S]*?margin-inline-start: var\(--bnd-sp-5\);[\s\S]*?margin-inline-end: var\(--bnd-sp-5\);[\s\S]*?padding-inline-start: var\(--bnd-sp-4\);[\s\S]*?border-inline-start:/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-toolbar \{[\s\S]*?inline-size: auto/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-line-total \{[^}]*gap: var\(--bnd-sp-2\)/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(sm\)\)[\s\S]*?\.bnd-bill-mobile-total \{[\s\S]*?min-inline-size: max-content/);
  assert.match(css, /@media \(width < bp\.bnd-bp\(sm\)\)[\s\S]*?\.bnd-bill-mobile-total \{[\s\S]*?margin-inline: var\(--bnd-sp-5\)/);
  assert.match(css, /\.bnd-bill-rail-toggle \.bnd-bill-action-label,[\s\S]*?\.bnd-bill-tools > summary \.bnd-bill-action-label \{ display: none; \}/);
  assert.match(source, /railButton\.setAttribute\("aria-label", __\("Customer & preview"\)\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("aria-label", __\("Invoice tools"\)\)/);
  assert.match(source, /frappe\.utils\.icon\("more-horizontal", "sm"\)/);
});
test('custom form action toolbars replace rather than stack with the pinned document foot', () => {
  const source = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /const FORM_ACTION_OWNERS = \["salesbill", "simpleform"\]/);
  assert.match(source, /function sync_native_owner\(token, own\)[\s\S]*?FORM_ACTION_OWNERS\.includes\(token\)[\s\S]*?mount_docfoot\(window\.cur_frm\)/);
  assert.match(source, /function docfoot_wanted\(\)[\s\S]*?!FORM_ACTION_OWNERS\.some/);
  assert.match(css, /html\[data-theme\]\[data-bnd-own~="salesbill"\] \.bnd-docfoot \{ display: none !important; \}/);
});
test('spreadsheet keyboard flow commits a cell and advances through the direct-entry sheet', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /this\.doc\.__islocal && !this\.doc\[this\.profile\.party\][\s\S]*?this\.partyControl\?\.set_focus\(\)/);
  assert.match(source, /window\.addEventListener\?\.\("keydown", e => \{[\s\S]*?instances\.get\(frm\)[\s\S]*?workbench\?\.shortcut\(e\)/);
  assert.match(source, /this\.root\.addEventListener\("keydown", e => this\.shortcut\(e, true\), true\)/);
  assert.match(source, /shortcut\(e, local = false\) \{[\s\S]*?!this\.simple \|\| \(!local && !this\.active\(\)\)[\s\S]*?e\.target\?\.closest\?\.\("\.modal"\)/);
  assert.match(source, /this\.action\(utilityActions, __\("Find item"\), "Alt\+I", "search"/);
  assert.match(source, /const findItem = e\.altKey && e\.key\.toLowerCase\(\) === "i"/);
  assert.match(source, /const focus = \(\) => setTimeout\(\(\) => frappe\.after_ajax\(\)\.then/);
  assert.match(source, /document\.activeElement\?\.blur\?\.\(\);[\s\S]*?this\.queue\.tail\.then\(focus\)/);
  assert.match(source, /if \(this\.queue\.count\) this\.queue\.tail\.then\(settle\); else settle\(\)/);
  assert.match(source, /focusNextLineControl\(control\)/);
  assert.match(source, /e\.key !== "Enter" \|\| e\.isComposing/);
  assert.match(source, /\.awesomplete > ul:not\(\[hidden\]\)/);
  assert.match(source, /awesomplete-selectcomplete\.bnd-bill-nav/);
  assert.match(source, /Promise\.resolve\(\)[\s\S]*?control\.set_value\(control\.get_value\(\)\)[\s\S]*?focusNextLineControl\(control\)/);
  assert.match(source, /document\.activeElement === inputElement[\s\S]*?focusNextLineControl\(control\)/);
  assert.match(source, /const focus = document\.activeElement;[\s\S]*?this\.render\(\);[\s\S]*?focus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /async addBlankLine\(focus = false\) \{[\s\S]*?if \(this\.queue\.count\) await this\.queue\.tail;[\s\S]*?if \(!this\.active\(\)\) return;/);
  assert.match(source, /focusItemEntry\(\)[\s\S]*?entry\.control\.set_focus\(\)/);
  assert.match(source, /ensureEntryRow\(focus = false\)[\s\S]*?rows\[rows\.length - 1\]/);
});
test('invoice item entry removes helper rows on save and does not recreate a deleted row', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.doesNotMatch(source, /fieldname: "quick_bill_item"/);
  assert.doesNotMatch(source, /__\("Add item"\)/);
  assert.match(source, /__\("Add line"\)/);
  assert.match(source, /placeholder: __\("Description or search items"\)/);
  assert.match(source, /items\.append\(this\.lines, search, lineHint\)/);
  assert.match(source, /const rows = draft \? \(doc\.items \|\| \[\]\) : \(doc\.items \|\| \[\]\)\.filter/);
  assert.match(source, /async pruneBlankRows\(\)[\s\S]*?filter\(row => !row\.item_code\)[\s\S]*?removeNativeRow\(row\)/);
  assert.match(source, /await this\.pruneBlankRows\(\);[\s\S]*?missing = this\.missingRequiredField\(\)/);
  assert.match(source, /completedItem = !!doc\.item_code[\s\S]*?this\.ensureEntryRow\(\)/);
  assert.match(source, /bnd-bill-item-name/);
  assert.match(source, /Item code.*row\.item_code/);
  assert.doesNotMatch(source, /if \(draft && canAdd\(frm\) && !rows\.some\(row => !row\.item_code\)\) queueMicrotask/);
  const deletion = source.match(/async deleteItem\(row\)[\s\S]*?(?=\n\t\tasync removeNativeRow)/)?.[0] || '';
  assert.doesNotMatch(deletion, /this\.ensureEntryRow\(\)/);
  assert.match(source, /__\("Save and submit"\)/);
  assert.match(source, /__\("Save, submit and print"\)/);
  assert.match(source, /__\("Save and create new"\)/);
});
test('invoice workbench completes the document requirements for item creation preview and settlement choice', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  const setup = fs.readFileSync('bunood_theme/printing/install.py', 'utf8');
  assert.match(source, /this\.newItemButton = button\(__\("New item"\)/);
  assert.match(source, /frappe\.ui\.form\.make_quick_entry\("Item"/);
  assert.match(source, /this\.preview = node\("section", "bnd-bill-preview"/);
  assert.match(source, /renderPreview\(rows\)/);
  assert.match(css, /\.bnd-bill-preview \{/);
  assert.match(source, /paymentMethod: "bunood_settlement_method"/);
  assert.match(source, /window\.cur_frm\.set_value\("mode_of_payment", preferred\)/);
  assert.match(setup, /"fieldname": "bunood_settlement_method"/);
  assert.match(setup, /"fieldtype": "Select"/);
  assert.match(setup, /MIXED_PAYMENT = "Mixed Payment"/);
  assert.match(setup, /SETTLEMENT_METHODS = \(CREDIT_SALE, "Cash", "Network", MIXED_PAYMENT\)/);
  assert.match(setup, /"default": CREDIT_SALE/);
});
test('invoice rail is a responsive customer and preview drawer with truthful final-print handoff', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /__\("Customer & preview"\)/);
  assert.match(source, /selectRailTab\("preview"\)/);
  assert.match(source, /dataset\.bndRailOpen/);
  assert.match(source, /__\("This is a live draft summary, not the final PDF layout\."\)/);
  assert.match(source, /__\("Open print preview"\)[\s\S]*?\(\) => this\.print\(\)/);
  assert.match(css, /\.bnd-bill-rail \{[\s\S]*?position: fixed/);
  assert.match(css, /data-bnd-rail-open="true"[^}]*\.bnd-bill-rail \{ transform: translateX\(0\)/);
});
test('invoice preview opens without a scrim-only blank frame', () => {
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  const scrim = css.match(/\.bnd-bill-rail-scrim \{([\s\S]*?)\}/)?.[1] || '';
  const rail = css.match(/\.bnd-bill-rail \{([\s\S]*?)\}/)?.[1] || '';
  const openScrim = css.match(/\.bnd-bill\[data-bnd-rail-open="true"\] \.bnd-bill-rail-scrim \{([\s\S]*?)\}/)?.[1] || '';

  assert.match(scrim, /opacity:\s*0/);
  assert.match(scrim, /visibility:\s*hidden/);
  assert.match(scrim, /pointer-events:\s*none/);
  assert.match(rail, /transition:\s*none/);
  assert.match(openScrim, /opacity:\s*1/);
  assert.match(openScrim, /visibility:\s*visible/);
  assert.match(openScrim, /pointer-events:\s*auto/);
  assert.doesNotMatch(openScrim, /display:\s*block/);
});
test('invoice sheet increments matching products and derives payment creation from settlement', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /mergeDuplicateItem\(doc\)/);
  assert.match(source, /name === "item_code" && doc\.item_code === value[\s\S]*?mergeDuplicateItem\(doc\)[\s\S]*?this\.pending\.get\(key\) !== raw/);
  assert.doesNotMatch(source, /async duplicateItem\(row\)/);
  assert.doesNotMatch(source, /button\(__\("Add one"\), view\.actions/);
  assert.match(source, /\["paid_amount", "outstanding_amount"\]/);
  assert.match(source, /__\("Credit sale"\)/);
  assert.match(source, /const settlement = settlementValue\(this\.doc\);[\s\S]*?const createPayment = settlementCreatesPayment\(settlement\)/);
  assert.match(source, /await submitConfirmed\(this\.frm\);[\s\S]*?if \(mixedAmounts\) await this\.postMixedPayment\(mixedAmounts\);[\s\S]*?else await makePaymentEntry\(this\.frm\)/);
});
test('credit is not passed to Payment Entry as a fake mode of payment', () => {
  const {settlementCreatesPayment, mixedPaymentSelected, receiptMethod} = context.window.bunood_theme.sales_bill;
  assert.equal(settlementCreatesPayment('On Credit'), false);
  assert.equal(settlementCreatesPayment(''), false);
  assert.equal(receiptMethod('On Credit'), '');
  assert.equal(settlementCreatesPayment('Cash'), true);
  assert.equal(receiptMethod('Network'), 'Network');
  assert.equal(settlementCreatesPayment('Mixed Payment'), true);
  assert.equal(mixedPaymentSelected('Mixed Payment'), true);
  assert.equal(receiptMethod('Mixed Payment'), '', 'workflow choice is never sent as a Mode of Payment');
});
test('mixed settlement posts through the native Payment Entry endpoint and exposes both receipts', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /method: "bunood_theme\.payments\.post_mixed_invoice_payment"/);
  assert.match(source, /network_reference_no/);
  assert.match(source, /await this\.frm\.reload_doc\(\)/);
  assert.match(source, /frappe\.set_route\("Form", "Payment Entry", entry\.name\)/);
  assert.match(source, /Two original ERPNext Payment Entries will be posted and linked to this invoice\./);
  assert.match(source, /value\.textContent = this\.format\(balance, \{ fieldtype: "Currency"/);
  assert.match(source, /value\.dir = "ltr"/);
  assert.match(source, /node\("small", "", this\.format\(entry\.amount, \{ fieldtype: "Currency"/);
  assert.match(source, /dialog\.show\(\);[\s\S]*?requestAnimationFrame\(update\)/);
  assert.doesNotMatch(source, /textContent = frappe\.format\(balance/);
  assert.doesNotMatch(source, /set_value\("mode_of_payment", MIXED_PAYMENT\)/);
});
test('mixed payment amounts automatically preserve the invoice total', () => {
  const { balancedPaymentPair } = context.window.bunood_theme.sales_bill;
  assert.deepEqual(Array.from(balancedPaymentPair(40, 57.5, 2)), [40, 17.5]);
  assert.deepEqual(Array.from(balancedPaymentPair(10, 57.5, 2)), [10, 47.5]);
  assert.deepEqual(Array.from(balancedPaymentPair(80, 57.5, 2)), [57.5, 0]);
  assert.deepEqual(Array.from(balancedPaymentPair(-3, 57.5, 2)), [0, 57.5]);
  assert.deepEqual(Array.from(balancedPaymentPair(0.1, 0.3, 2)), [0.1, 0.2]);
});

test('mixed payment resolves values before the dialog hide cancellation callback', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const action = source.match(/primary_action:\s*values\s*=>\s*\{([\s\S]*?)\n\s*\},\n\s*onhide:/)?.[1] || '';
  assert.ok(action.indexOf('finish({ cash_amount: cash') >= 0, 'mixed action must resolve entered values');
  assert.ok(action.indexOf('finish({ cash_amount: cash') < action.indexOf('dialog.hide()'), 'values must resolve before onhide can cancel');
});
test('invoice customer panel reads the native customer ledger and opens its statement', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /bunood_theme\.api\.get_customer_account_summary/);
  assert.match(source, /frappe\.set_route\("query-report", "General Ledger", \{/);
  assert.match(source, /party_type: "Customer"/);
  assert.match(source, /__\("Amount due from customer"\)/);
});
test('removing a populated bill row requires explicit confirmation', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /removeItem\(row\)[\s\S]*?frappe\.confirm\(\s*__\("Remove \{0\} from this invoice\?"/);
  assert.match(source, /deleteItem\(row\)[\s\S]*?native\.remove\(\)/);
});
test('blank invoice rows are removed while completed item rows are retained', async () => {
  const {BillWorkbench}=context.window.bunood_theme.sales_bill;
  const w=Object.create(BillWorkbench.prototype);
  const complete={name:'item',item_code:'ITEM-1'}, first={name:'blank-1',item_code:''}, second={name:'blank-2'};
  const items=[first,complete,second]; let refreshes=0, renders=0;
  w.frm={doc:{items},refresh_field(name){assert.equal(name,'items');refreshes++;}};
  w.removeNativeRow=async row=>{w.frm.doc.items=w.frm.doc.items.filter(item=>item!==row);};
  w.render=()=>renders++;
  assert.equal(await w.pruneBlankRows(),2);
  assert.deepEqual(w.frm.doc.items,[complete]);
  assert.equal(refreshes,1);
  assert.equal(renders,1);
});
test('the ready row must be last and is appended once after a completed line', async () => {
  const {BillWorkbench}=context.window.bunood_theme.sales_bill;
  const w=Object.create(BillWorkbench.prototype), frm=form();
  const olderBlank={name:'blank-1',item_code:''}, complete={name:'item',item_code:'ITEM-1'}, trailing={name:'blank-2',item_code:''};
  Object.assign(w,{frm,doc:frm.doc,active:()=>true,entryRowPromise:null});
  frm.doc.items=[olderBlank,complete]; let adds=0;
  w.addBlankLine=async()=>{adds++;return trailing;};
  await w.ensureEntryRow(); assert.equal(adds,1,'an earlier blank is not the trailing ready row');
  frm.doc.items.push(trailing);
  assert.equal(await w.ensureEntryRow(),trailing); assert.equal(adds,1,'an existing trailing row is reused');
});
const context = {
  window: { bunood_theme: {} },
  document: {},
  frappe: { after_ajax: async () => {} },
  $: () => ({ on() {} }),
  __: (s, args = []) => args.reduce((text, value, index) => text.replace(`{${index}}`, value), s),
  setTimeout,
  clearTimeout,
};
// Expose the existing class only inside the test VM, without a new public API.
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/document_actions.js', 'utf8'), context);
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8').replace('api.sales_bill = {', 'api.sales_bill = { BillWorkbench, instances, mergeableItemLines,'), context);
const { eligible, actionState, SerialChanges, saveDraft, submitConfirmed, totalField, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage, vatTreatment, clearItemTaxOverrides, setVatIncludedInPrice, applyVatTreatment } = context.window.bunood_theme.sales_bill;

test('new-party tax field uses native metadata without duplicates or permission bypass', () => {
  const method=context.window.bunood_theme.sales_bill.BillWorkbench.prototype.addPartyTaxField;
  const previousMeta=context.frappe.meta, previousPerm=context.frappe.perm;
  try {
    const df={fieldname:'tax_id',fieldtype:'Data',label:'Vendor Tax',length:20}; let status='Write', added=[];
    context.frappe.meta={get_docfield:()=>df};
    context.frappe.perm={get_perm:()=>[],get_field_display_status:()=>status};
    const entry={doc:{},fields_dict:{},add_fields:fields=>added.push(...fields)};
    method.call({profile:{partyDoctype:'Supplier'}},entry);
    assert.equal(added.length,1); assert.equal(added[0].fieldname,'tax_id'); assert.equal(added[0].length,20);
    assert.equal(added[0].label,'Tax ID'); assert.equal(df.label,'Vendor Tax');
    entry.fields_dict.tax_id={}; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
    delete entry.fields_dict.tax_id; status='Read'; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
    status='Write'; df.hidden=1; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
  } finally { context.frappe.meta=previousMeta; context.frappe.perm=previousPerm; }
});

test('new-item quick entry carries selling price, opening quantity, unit and company warehouse through native Item fields', () => {
  const method=context.window.bunood_theme.sales_bill.BillWorkbench.prototype.addItemStockAndPriceFields;
  const previousMeta=context.frappe.meta, previousPerm=context.frappe.perm;
  try {
    context.frappe.meta={get_docfield:(_doctype,name)=>({fieldname:name,fieldtype:name==='opening_stock'?'Float':'Currency',hidden:name==='opening_stock'?1:0})};
    context.frappe.perm={get_perm:()=>[],get_field_display_status:df=>df.hidden?'None':'Write'};
    const fields={stock_uom:{df:{fieldname:'stock_uom'},get_value:()=> 'Nos'}};
    const entry={doc:{doctype:'Item'},fields_dict:fields,
      add_fields(added){for(const df of added)fields[df.fieldname]={df,value:df.default||'',get_value(){return this.value;},set_value(value){this.value=value;}};},
      toggle_reqd(name,required){fields[name].df.reqd=required;},
      update_doc(){for(const [name,field] of Object.entries(fields))this.doc[name]=field.get_value();return this.doc;}};
    const workbench={frm:{doctype:'Sales Invoice'},doc:{company:'Bunood Development',set_warehouse:'Stores - BDEV',selling_price_list:'Standard Selling'}};
    method.call(workbench,entry);
    assert.equal(fields.stock_uom.get_value(),'Nos','the native stock unit stays in the dialog');
    for(const name of ['standard_rate','opening_stock','valuation_rate','__bnd_opening_warehouse'])assert.ok(fields[name],name);
    assert.equal(fields.opening_stock.df.hidden,0,'native hidden opening stock is exposed only in this quick entry');
    assert.equal(fields.__bnd_opening_warehouse.value,'Stores - BDEV');
    assert.equal(fields.__bnd_opening_warehouse.df.reqd,false);
    fields.opening_stock.value=4; fields.opening_stock.df.onchange();
    assert.equal(fields.__bnd_opening_warehouse.df.reqd,true);
    assert.equal(fields.valuation_rate.df.reqd,true);
    fields.standard_rate.value=50; fields.valuation_rate.value=30;
    const item=entry.update_doc();
    assert.equal(item.standard_rate,50);
    assert.equal(item.opening_stock,4);
    assert.equal(item.valuation_rate,30);
    assert.equal(item.__bnd_opening_warehouse,undefined,'dialog-only warehouse must not be sent as an Item field');
    assert.equal(item.item_defaults[0].company,'Bunood Development');
    assert.equal(item.item_defaults[0].default_warehouse,'Stores - BDEV');
    assert.equal(item.item_defaults[0].default_price_list,'Standard Selling');
    method.call(workbench,entry);
    assert.equal(Object.keys(fields).filter(name=>name==='__bnd_opening_warehouse').length,1);
  } finally {context.frappe.meta=previousMeta;context.frappe.perm=previousPerm;}
});

function lifecycleWorkbench() {
  const proto=context.window.bunood_theme.sales_bill.BillWorkbench.prototype;
  const frm=form({name:'INV-OLD',customer:'Previous customer'}), w=Object.create(proto);
  Object.assign(w,{frm,doc:frm.doc,docname:frm.doc.name,closed:false,simple:true,
    editTimers:new Map(),pending:new Map([['old','value']]),invalid:new Map(),
    root:{remove(){w.rootRemoved=true;}},mode:{remove(){w.modeRemoved=true;}},
    setMode(value){this.simple=value;},syncSelectionGuard(){w.guardReleased=true;}});
  context.window.cur_frm=null;
  context.window.bunood_theme.sales_bill.instances.set(frm,w);
  return w;
}

test('Save and Submit direct missing party/items to the right control after unlocking', async () => {
  for (const method of ['save', 'submit']) for (const party of ['customer', 'supplier']) for (const hasParty of [false, true]) {
    const w = lifecycleWorkbench(); let focused;
    w.profile = {party, partyDoctype: party === 'customer' ? 'Customer' : 'Supplier'};
    w.doc[party] = hasParty ? 'TEST' : ''; w.doc.items = []; w.doc.docstatus = 0;
    w.active = () => true; w.flush = async () => {}; w.pruneBlankRows = async () => {}; w.busy = () => {}; w.render = () => {};
    w.message = text => {w.lastMessage = text;};
    const focus = name => () => {assert.equal(w.saving, false); focused = name;};
    w.partyControl = {set_focus: focus('party')};
    w.addLineButton = {focus: focus('item')};
    w.entryControl = () => hasParty ? {control:{set_focus: focus('item')}} : null;
    w.frm.save = w.frm.savesubmit = () => assert.fail('invalid bill must not save or submit');
    await w[method]();
    assert.equal(focused, hasParty ? 'item' : 'party');
    assert.equal(w.lastMessage, hasParty ? 'Add at least one item before continuing.' : `Choose a ${party} before continuing.`);
  }
});

test('required-field check accepts complete bills and tolerates an absent item array', () => {
  const w = lifecycleWorkbench(); w.profile = {party:'customer', partyDoctype:'Customer'};
  delete w.doc.items; assert.match(w.missingRequiredField().message, /Add at least/);
  w.doc.items = [{item_code:''}]; assert.match(w.missingRequiredField().message, /Add at least/);
  w.doc.items.push({item_code:'ITEM'}); assert.equal(w.missingRequiredField(), null);
});
test('native mandatory validation cannot strand Save Draft in a pending busy state', async () => {
  const previousUi=context.frappe.ui;
  let checks=0, saves=0;
  try {
    context.frappe.ui={form:{check_mandatory(frm){checks++;assert.equal(frm.doc.name,'INV-BLOCKED');return false;}}};
    const frm={doc:{name:'INV-BLOCKED'},save(){saves++;return new Promise(()=>{});}};
    await assert.rejects(saveDraft(frm),/Complete the required fields/);
    assert.equal(checks,1);
    assert.equal(saves,0,'the known non-settling native save path must not start');
  } finally {context.frappe.ui=previousUi;}
});
test('Save Draft continues through the native save when mandatory validation passes', async () => {
  const previousUi=context.frappe.ui;
  try {
    context.frappe.ui={form:{check_mandatory:()=>true}};
    const frm={doc:{name:'INV-OK',__islocal:false},is_dirty:()=>false,save:async (_action,success)=>success({})};
    await saveDraft(frm);
  } finally {context.frappe.ui=previousUi;}
});
test('workbench submit auto-accepts only its exact native confirmation and restores Frappe confirm', async () => {
  const previousConfirm=context.frappe.confirm;
  let submitted=0, delegated=0;
  const nativeConfirm=(message,yes)=>{delegated++;return yes();};
  try {
    context.frappe.confirm=nativeConfirm;
    const frm={docname:'ACC-SINV-TEST',savesubmit(){
      return new Promise(resolve=>context.frappe.confirm('Permanently Submit ACC-SINV-TEST?',()=>{submitted++;resolve();}));
    }};
    await submitConfirmed(frm);
    assert.equal(submitted,1);
    assert.equal(delegated,0,'the explicit submit action is already the user confirmation');
    assert.equal(context.frappe.confirm,nativeConfirm,'the global confirmation handler must be restored immediately');

    frm.savesubmit=()=>new Promise(resolve=>context.frappe.confirm('Review another condition?',resolve));
    await submitConfirmed(frm);
    assert.equal(delegated,1,'unrelated confirmations still use Frappe normally');
    assert.equal(context.frappe.confirm,nativeConfirm);
  } finally {context.frappe.confirm=previousConfirm;}
});
test('document replacement or native rename retires old control closures without rebinding them', () => {
  for(const rename of [false,true]) {
    const w=lifecycleWorkbench(), original=w.doc;
    if(rename) w.frm.doc.name='INV-SAVED'; else w.frm.doc={name:'INV-NEW',docstatus:0,items:[]};
    assert.equal(w.syncDocument(),false);
    assert.equal(w.doc,original,'old closures must never be declared current for another document');
    assert.equal(w.closed,true); assert.equal(w.simple,false);
    assert.equal(w.rootRemoved,true); assert.equal(w.modeRemoved,true);
    assert.equal(w.pending.size,0);
  }
});
test('same-document refresh keeps its controller and pending typing', () => {
  const w=lifecycleWorkbench();
  assert.equal(w.syncDocument(),true);
  assert.equal(w.closed,false); assert.equal(w.pending.size,1);
});
test('queued edits from a retired invoice cannot execute on its replacement', async () => {
  const w=lifecycleWorkbench(); let writes=0;
  const queue=new SerialChanges(()=>!w.closed && w.frm.doc===w.doc,()=>{});
  const pending=queue.run(()=>{writes++;});
  w.frm.doc={name:'INV-NEW',docstatus:0,items:[]}; w.syncDocument();
  await assert.rejects(pending,/no longer active/); assert.equal(writes,0);
});
test('late retired callbacks cannot evict a newer controller or reveal its native form', () => {
  const w=lifecycleWorkbench(), registry=context.window.bunood_theme.sales_bill.instances;
  w.dispose();
  const replacement={}; registry.set(w.frm,replacement);
  w.setMode=()=>assert.fail('retired controller changed shared mode');
  w.dispose(); assert.equal(w.syncDocument(),false);
  assert.equal(registry.get(w.frm),replacement);
  const second=lifecycleWorkbench(); registry.set(second.frm,replacement);
  second.setMode=()=>assert.fail('non-owner changed shared mode'); second.dispose();
  assert.equal(registry.get(second.frm),replacement);
});
test('invoice autocomplete closes when scrolling detaches it from its native field', () => {
  const {BillWorkbench}=context.window.bunood_theme.sales_bill;
  const w=Object.create(BillWorkbench.prototype);
  const originalDocument={...context.document}, originalWindow={
    innerWidth:context.window.innerWidth, innerHeight:context.window.innerHeight,
  };
  let blurred=0;
  const input={
    getAttribute(name){return {role:'combobox','aria-expanded':'true','aria-owns':'item-results'}[name] || null;},
    getBoundingClientRect(){return {top:-20,bottom:10,left:100,right:400};},
    blur(){blurred++;},
  };
  try {
    Object.assign(w,{simple:true,active:()=>true,root:{contains:node=>node===input},
      scrollHost:{getBoundingClientRect:()=>({top:0,bottom:500,left:0,right:900})}});
    Object.assign(context.document,{activeElement:input,getElementById:id=>id==='item-results'?{hidden:false}:null});
    context.window.innerWidth=900; context.window.innerHeight=500;
    assert.equal(w.closeDetachedAutocomplete(),true);
    assert.equal(blurred,1,'native blur owns popup closing and ARIA cleanup');

    input.getBoundingClientRect=()=>({top:100,bottom:130,left:100,right:400});
    assert.equal(w.closeDetachedAutocomplete(),false);
    assert.equal(blurred,1,'a fully visible native field keeps its menu open');
  } finally {
    for(const key of Object.keys(context.document)) delete context.document[key];
    Object.assign(context.document,originalDocument);
    context.window.innerWidth=originalWindow.innerWidth; context.window.innerHeight=originalWindow.innerHeight;
  }
});
test('Submit and Advanced stop after document ownership changes during flush', async () => {
  for(const method of ['submit','fullInvoice']) {
    const w=lifecycleWorkbench(); let release,active=true,calls=0;
    w.active=()=>active; w.busy=()=>{}; w.render=()=>{}; w.message=()=>{};
    w.flush=()=>new Promise(resolve=>release=resolve);
    w.profile={party:'customer'}; w.doc.items=[{item_code:'ITEM'}];
    w.frm.savesubmit=()=>{calls++;}; w.setMode=()=>{calls++;}; w.frm.is_dirty=()=>false;
    const task=w[method](); active=false; w.frm.doc={name:'NEW',docstatus:0,items:[]}; release();
    await task; assert.equal(calls,0,method);
  }
});
test('Submit cannot continue on a replacement after native save resolves', async () => {
  const w=lifecycleWorkbench(); let release,entered,active=true,dirty=true,submits=0,lastError;
  const saveEntered=new Promise(resolve=>entered=resolve);
  w.active=()=>active; w.busy=()=>{}; w.render=()=>{}; w.message=error=>{lastError=error;}; w.flush=async()=>{};
  w.profile={party:'customer'}; w.doc.items=[{item_code:'ITEM'}];
  w.frm.is_dirty=()=>dirty;
  w.frm.save=(_kind,callback)=>new Promise(resolve=>{release=()=>{dirty=false;callback({});resolve();};entered();});
  w.frm.savesubmit=()=>{submits++;};
  const task=w.submit(); await Promise.race([saveEntered,task.then(()=>assert.fail(lastError || 'Submit stopped before native save'))]);
  active=false; w.frm.doc={name:'OTHER',docstatus:0,items:[]}; release();
  await task; assert.equal(submits,0);
});

test('Save and Submit follows its own native new-document rename into Submit', async () => {
  const w=lifecycleWorkbench();
  const previousUi=context.frappe.ui, previousModel=context.frappe.model, previousCurrent=context.window.cur_frm;
  let dirty=true, submits=0;
  try {
    context.frappe.ui={form:{check_mandatory:()=>true}};
    context.frappe.model={new_names:{}};
    context.window.cur_frm=w.frm;
    w.profile={party:'customer',partyDoctype:'Customer'};
    Object.assign(w.doc,{doctype:'Sales Invoice',docstatus:0,__islocal:true,customer:'TEST',items:[{item_code:'ITEM'}]});
    w.flush=async()=>{}; w.pruneBlankRows=async()=>{}; w.busy=()=>{}; w.render=()=>{}; w.message=()=>{};
    w.frm.is_dirty=()=>dirty;
    w.frm.save=async (_kind,callback)=>{
      const localName=w.frm.doc.name;
      const saved={...w.frm.doc,name:'ACC-SINV-TEST',__islocal:false,docstatus:0};
      context.frappe.model.new_names[localName]=saved.name;
      w.frm.doc=saved; w.frm.docname=saved.name; dirty=false;
      callback({});
      // A native form refresh may retire the controller whose button initiated the save.
      w.closed=true;
    };
    w.frm.savesubmit=async()=>{submits++;w.frm.doc.docstatus=1;};
    await w.submit();
    assert.equal(submits,1,'the native Submit call must follow the successful native Save rename');
    assert.equal(w.frm.doc.docstatus,1);
  } finally {
    context.frappe.ui=previousUi; context.frappe.model=previousModel; context.window.cur_frm=previousCurrent;
  }
});
test('Save, Submit and Print waits for successful submission before opening native print', async () => {
  const w=lifecycleWorkbench();
  const previousConfirm=context.frappe.confirm, previousCurrent=context.window.cur_frm;
  let printed=0, submitted=0, shownPrompts=0;
  try {
    context.window.cur_frm=w.frm;
    context.frappe.confirm=(message,yes)=>{shownPrompts++;return yes();};
    w.profile={party:'customer',partyDoctype:'Customer'};
    Object.assign(w.doc,{doctype:'Sales Invoice',docstatus:0,__islocal:false,customer:'TEST',items:[{item_code:'ITEM'}]});
    w.frm.docname=w.doc.name;
    w.active=()=>true; w.flush=async()=>{}; w.pruneBlankRows=async()=>{}; w.busy=()=>{}; w.render=()=>{}; w.message=()=>{};
    w.frm.is_dirty=()=>false;
    w.frm.savesubmit=()=>new Promise(resolve=>context.frappe.confirm('Permanently Submit INV-OLD?',()=>{
      submitted++; w.frm.doc.docstatus=1; resolve(w.frm);
    }));
    w.frm.print_doc=()=>{printed++;};
    assert.equal(await w.submitAndPrint(),true);
    assert.equal(submitted,1);
    assert.equal(printed,1,'print must start only after the invoice is submitted');
    assert.equal(shownPrompts,0,'the explicit combined action must not show a second submit confirmation');
  } finally {context.frappe.confirm=previousConfirm;context.window.cur_frm=previousCurrent;}
});

test('invoice sheet puts identity before actions and marks draft-only editing affordances', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.ok(source.indexOf('const intro =') < source.indexOf('const toolbar ='));
  assert.match(source, /this\.root\.dataset\.bndDraft = String\(draft\)/);
  assert.match(source, /this\.searchButton\.hidden = !draft/);
  assert.match(source, /bnd-bill-search bnd-bill-draft-only/);
  assert.match(source, /bnd-bill-hint bnd-bill-draft-only/);
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(css, /\[data-bnd-draft="false"\] \.bnd-bill-draft-only/);
  assert.doesNotMatch(css, /\.bnd-bill-toolbar \{ flex-wrap: nowrap; overflow-x: auto;/);
});
test('invoice tool actions use bundled, labelled Frappe icons', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  for (const icon of ['user','delete','printer','coins','percent','rotate-ccw','search']) {
    assert.match(source,new RegExp(`this\\.action\\([^\\n]+"${icon}"`));
  }
  const actions=fs.readFileSync('bunood_theme/public/js/document_actions.js','utf8');
  assert.match(actions,/frappe\.utils\.icon\(icon, "sm"\)/);
  assert.match(actions,/bnd-bill-action-icon[\s\S]+aria-hidden/);
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/\.bnd-bill-action-icon[^}]*place-items:\s*center/);
  assert.match(scss,/\.bnd-bill-tools-body \.bnd-bill-action-label \{ flex: 1; \}/);
});

test('ZATCA states are actionable and technical metadata is manager-only', () => {
  const proto=context.window.bunood_theme.sales_bill.BillWorkbench.prototype;
  const render=(state, extra={}, roles=['Sales User'])=>{
    context.frappe.boot={user:{roles}};
    const w=Object.create(proto);
    w.zatcaData={state,settings:{server:'Sandbox',sync:'Live'},invoice:{},...extra};
    let error=false;
    let warning=false;
    w.zatcaStatus={classList:{toggle(name,value){if(name==='bnd-bill-error')error=value;if(name==='bnd-bill-warning')warning=value;}},textContent:''};
    w.zatcaMeta={textContent:''}; w.zatcaButton={textContent:'',hidden:false};
    w.busy=()=>{}; w.loadZatca=()=>{}; w.zatcaTimer=null;
    proto.renderZatca.call(w);
    clearTimeout(w.zatcaTimer);
    return {status:w.zatcaStatus.textContent,meta:w.zatcaMeta.textContent,
      action:w.zatcaButton.textContent,hidden:w.zatcaButton.hidden,error,warning};
  };
  const setup={
    missing_app:['The ZATCA connector is not installed on this site.','',true,true],
    needs_settings:['Create ZATCA Business Settings for this company.','ZATCA settings',false,false],
    disabled:['ZATCA integration is disabled for this company.','ZATCA settings',false,false],
    needs_onboarding:['Complete device onboarding with the OTP from Fatoora.','ZATCA settings',false,false],
    needs_csid:['Run compliance checks, then obtain the production CSID.','ZATCA settings',false,false],
    ready:['ZATCA is ready. This invoice will be prepared when it is submitted.','ZATCA settings',false,false],
    preparing:['The signed invoice is being prepared for ZATCA.','Refresh status',false,false],
  };
  for (const [state,[status,action,hidden,error]] of Object.entries(setup)) {
    const view=render(state);
    assert.deepEqual([view.status,view.action,view.hidden,view.error],[status,action,hidden,error],state);
    assert.equal(view.meta,'',state);
  }
  const invoice={name:'ZATCA-1',integration_status:'Queued'};
  const sendable=render('ready_to_send',{can_queue:true,invoice});
  assert.equal(sendable.action,'Send to ZATCA');
  assert.equal(sendable.meta,'Queued');
  assert.equal(render('ready_to_send',{can_queue:true,invoice},['Accounts Manager']).meta,'Sandbox · Live · Queued');
  for (const [state,status,error,warning] of [
    ['accepted','ZATCA accepted this invoice.',false,false],
    ['accepted_with_warnings','ZATCA accepted this invoice with warnings.',false,true],
    ['duplicate_response','ZATCA returned a duplicate response. Reconcile it with the original submission before treating this invoice as accepted.',false,true],
    ['rejected','ZATCA rejected this invoice. Open the validation record before correcting it.',true,false],
    ['clearance_off','ZATCA clearance is switched off. Review the validation record and company settings.',false,true],
  ]) {
    const view=render(state,{invoice});
    assert.deepEqual([view.status,view.action,view.error,view.warning],[status,'View ZATCA record',error,warning],state);
  }
});

// Verbatim methods from the installed, already-pinned Frappe form/layout.js.
// The upstream gate checks the full file; this runs its actual global-select branch.
const nativeLayoutSource = `({
	refresh(doc) {
		if (doc) this.doc = doc;

		if (this.frm) {
			this.wrapper.find(".empty-form-alert").remove();
		}

		// NOTE this might seem redundant at first, but it needs to be executed when frm.refresh_fields is called
		this.attach_doc_and_docfields(true);

		if (this.frm && this.frm.wrapper) {
			$(this.frm.wrapper).trigger("refresh-fields");
		}

		// dependent fields
		this.refresh_dependency();

		// refresh sections
		this.refresh_sections();

		if (this.frm) {
			// collapse sections
			this.refresh_section_collapse();
		}

		if (document.activeElement) {
			if (document.activeElement.tagName == "INPUT" && this.is_numeric_field_active()) {
				document.activeElement.select();
			}
		}
	},

	is_numeric_field_active() {
		const control = $(document.activeElement).closest(".frappe-control");
		const fieldtype = (control.data() || {}).fieldtype;
		return frappe.model.numeric_fieldtypes.includes(fieldtype);
	}
})`;
const nativeLayout = vm.runInNewContext(nativeLayoutSource, {
  document:context.document, frappe:{model:{numeric_fieldtypes:['Float','Currency','Int']}},
  $:input=>({closest:()=>({data:()=>({fieldtype:input.fieldtype})})})
});

function selectionWorkbench() {
  const fixture=boundWorkbench(), w=fixture.workbench, control=fixture.bind('qty'), input=control.$input[0];
  delete w.active;
  w.simple=true; w.closed=false; w.root={isConnected:true,hidden:false,contains:node=>!!node?.inRoot};
  Object.assign(input,{tagName:'INPUT',fieldtype:'Float',inRoot:true,value:'23',selectionStart:2,selectionEnd:2,
    select(){this.selectionStart=0;this.selectionEnd=this.value.length;this.selectCalls=(this.selectCalls||0)+1;}});
  w.frm.layout=Object.assign(Object.create(nativeLayout),{attach_doc_and_docfields(){},refresh_dependency(){},refresh_sections(){}});
  context.window.cur_frm=w.frm; context.document.activeElement=input;
  return {...fixture,input,layout:w.frm.layout};
}

test('native layout selection contract is pinned and reproduced before the adapter', () => {
  const pins=fs.readFileSync('bunood_theme/data/upstream-pins.json','utf8');
  assert.match(pins,/"frappe:frappe\/public\/js\/frappe\/form\/layout.js": "3abb35b67655684fd706533ac7018adaadbc08ce3cd38e24bd3231a32c7e5d6f"/);
  const {layout,input}=selectionWorkbench(); layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,2,1]);
});

test('native refresh leaves the Simple registered input caret and intentional selection untouched', () => {
  const {workbench:w,layout,input}=selectionWorkbench(); w.setMode(true);
  layout.refresh(); assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[2,2,undefined]);
  input.selectionStart=0; input.selectionEnd=1; layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,1,undefined]);
  w.setMode(false); layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,2,1],'Advanced keeps the native select-all behavior');
});

test('selection guard delegates unchanged outside its exact active root, document and layout', () => {
  for (const change of [
    ({workbench:w})=>{w.simple=false;}, ({workbench:w})=>{w.root.hidden=true;},
    ({workbench:w})=>{w.root.isConnected=false;}, ({input})=>{input.inRoot=false;},
    ({workbench:w})=>{w.controls=[];}, ({workbench:w})=>{w.frm.doc={...w.doc};},
    ({workbench:w})=>{w.doc.items=[];}, ()=>{context.window.cur_frm={};},
    ({workbench:w})=>{w.closed=true;}, ({workbench:w})=>{w.frm.layout={};}
  ]) {
    const fixture=selectionWorkbench(); fixture.workbench.setMode(true); change(fixture);
    fixture.layout.refresh(); assert.equal(fixture.input.selectCalls,1);
  }
  const {workbench:w,layout,input}=selectionWorkbench(); w.setMode(true);
  context.document.activeElement={...input}; layout.refresh();
  assert.equal(context.document.activeElement.selectCalls,1,'unregistered dialog control uses native selection');
});

test('selection guard preserves delegated receiver, arguments, result and exception', () => {
  const {workbench:w,layout,input}=selectionWorkbench(), marker={}, args=[1,2];
  let receiver, received;
  const original=function(...values){receiver=this;received=values;return marker;};
  layout.is_numeric_field_active=original; w.setMode(true); input.inRoot=false;
  assert.equal(layout.is_numeric_field_active(...args),marker); assert.equal(receiver,layout); assert.deepEqual(received,args);
  input.inRoot=true; const other={};
  assert.equal(layout.is_numeric_field_active.call(other,3),marker); assert.equal(receiver,other); assert.deepEqual(received,[3]);
  w.setMode(false); const error=Error('native predicate'); layout.is_numeric_field_active=()=>{throw error;};
  w.setMode(true); input.inRoot=false; assert.throws(()=>layout.is_numeric_field_active(),e=>e===error);
});

test('selection guard is idempotent and restores inherited or own descriptors on leaving Simple', () => {
  for (const own of [false,true]) {
    const {workbench:w,layout}=selectionWorkbench();
    if(own)Object.defineProperty(layout,'is_numeric_field_active',{value:nativeLayout.is_numeric_field_active,writable:true,configurable:false,enumerable:true});
    const before=Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active');
    w.setMode(true); const guard=layout.is_numeric_field_active;
    w.setMode(true); w.syncSelectionGuard(); assert.equal(layout.is_numeric_field_active,guard);
    w.setMode(false); assert.deepEqual(Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active'),before);
    w.setMode(true); assert.notEqual(layout.is_numeric_field_active,nativeLayout.is_numeric_field_active);
    w.closed=true; w.syncSelectionGuard(); assert.deepEqual(Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active'),before);
  }
});

test('replaced layouts are released and another writer is neither overwritten nor repeatedly wrapped', () => {
  const {workbench:w,layout}=selectionWorkbench(); w.setMode(true);
  const second=Object.create(nativeLayout); w.frm.layout=second; w.syncSelectionGuard();
  assert.equal(Object.hasOwn(layout,'is_numeric_field_active'),false);
  const guard=second.is_numeric_field_active, external=function(){return guard.call(this);};
  second.is_numeric_field_active=external; w.syncSelectionGuard(); assert.equal(second.is_numeric_field_active,external);
  assert.equal(external.call(second),true,'a displaced wrapper delegates even while Simple remains active');
  w.setMode(false); w.setMode(true); assert.equal(second.is_numeric_field_active,external);
  w.frm.layout=layout; w.syncSelectionGuard(); w.frm.layout=second; w.syncSelectionGuard();
  assert.equal(second.is_numeric_field_active,external);
});

test('missing, non-callable and unadaptable native contracts remain untouched', () => {
  for (const layout of [{},{is_numeric_field_active:42},Object.freeze({is_numeric_field_active:()=>true})]) {
    const {workbench:w}=selectionWorkbench(); w.frm.layout=layout;
    const before=Object.getOwnPropertyDescriptors(layout); assert.doesNotThrow(()=>w.setMode(true));
    assert.deepEqual(Object.getOwnPropertyDescriptors(layout),before);
  }
});
function form(extra = {}) {
  return { doctype: 'Sales Invoice', doc: { docstatus: 0, items: [], ...extra },
    perm: [{ write: 1, create: 1 }], save_disabled: false,
    fields_dict: { customer: { get_status: () => 'Write' }, items: { get_status: () => 'Write', grid: { is_editable: () => true, df: {} } } } };
}
test('quick bill supports mapped rows while excluding posted, return, POS and restricted invoices', () => {
  assert.equal(eligible(form()), true);
  assert.equal(eligible(form({items:[{item_code:'ITEM-1',sales_order:'SO-1',so_detail:'SO-ITEM-1'}]})), true);
  for (const extra of [{docstatus:1},{is_return:1},{is_pos:1},{amended_from:'INV'},{is_debit_note:1}]) assert.equal(eligible(form(extra)), false);
  const restricted = form(); restricted.fields_dict.items.grid.is_editable = () => false;
  assert.equal(eligible(restricted), false);
  const disabled = form(); disabled.save_disabled = true;
  assert.equal(eligible(disabled), false);
});
test('purchase invoices use the same native workbench contract', () => {
  const f = form();
  f.doctype = 'Purchase Invoice'; f.doc.doctype = 'Purchase Invoice'; f.doc.supplier = 'SUP-1';
  f.fields_dict.supplier = { get_status: () => 'Write' }; delete f.fields_dict.customer;
  assert.equal(context.window.bunood_theme.sales_bill.supports(f), true);
  assert.equal(eligible(f), true);
  f.doc.items = [{ purchase_order: 'PO-1' }];
  assert.equal(context.window.bunood_theme.sales_bill.supports(f), true);
  assert.equal(eligible(f), true);
});
test('the default bill workbench stays inline while the explicit split action uses a bounded dialog', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source,/async promptMixedPayment\(\)[\s\S]*?new frappe\.ui\.Dialog/);
  for (const action of ['frm.savesubmit()','frm.savetrash()','frm.print_doc()','makePaymentEntry(this.frm)','frappe.ui.Scanner']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('both invoice profiles default line discounts to native currency amounts', () => {
  const {profiles} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice', 'Purchase Invoice']) {
    assert.ok(profiles[type].lineFields.includes('price_list_rate'), type);
    assert.ok(profiles[type].lineFields.indexOf('price_list_rate') < profiles[type].lineFields.indexOf('discount_amount'));
    assert.ok(profiles[type].lineFields.includes('discount_amount'), type);
    assert.ok(!profiles[type].lineFields.includes('discount_percentage'), type);
    assert.ok(profiles[type].lineFields.includes('rate'));
  }
  assert.match(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /discount_amount: \(\) => __\("Discount Amount"\)/);
});

test('invoice sheet presents unit price before discount inputs', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.equal((source.match(/lineFields: \["qty", "rate", "price_list_rate", "discount_amount", "warehouse"\]/g) || []).length, 2);
});

test('print is a visible operational action beside payment and disabled commits remain legible', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(source, /this\.printButton = this\.action\(commitActions, __\("Print"\)/);
  assert.match(source, /this\.paymentButton = this\.action\(commitActions, __\("Record payment"\)/);
  assert.match(source, /this\.saveButton = this\.action\(documentActions, __\("Save draft"\), "F2", "save"/);
  assert.doesNotMatch(source, /this\.saveButton = this\.action\(commitActions/);
  assert.match(source, /this\.submitPrintButton = this\.action\(commitActions, __\("Save, submit and print"\)/);
  assert.match(source, /this\.submitPrintButton\.hidden = !showSubmit/);
  assert.match(css, /\.bnd-bill-toolbar \.bnd-bill-action-submit-print \{[\s\S]*?border-color: var\(--bnd-brand-solid\)/);
  assert.match(css, /\.bnd-bill-action-submit-print \.bnd-bill-action-label,[\s\S]*?display: none/);
  assert.match(css, /\.bnd-bill-toolbar \.bnd-bill-action-save:disabled[\s\S]*?opacity:\s*1/);
});

test('preview scrim keeps its backdrop while hovered and mixed allocation has a dedicated status layout', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(css, /data-bnd-rail-open="true"\][\s\S]*?rail-scrim:is\(:hover, :focus, :focus-visible\)/);
  assert.match(source, /remaining\.classList\.add\("bnd-mixed-payment-balance"\)/);
  assert.match(css, /\.bnd-mixed-payment-balance[\s\S]*?gap:\s*var\(--bnd-sp-4\)/);
});
test('nonzero discount without a positive finite base is rejected before native mutation', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const field of ['discount_percentage','discount_amount']) {
    for (const base of [undefined, null, '', 0, '0', -1, NaN, Infinity]) {
      const row = {rate:100, price_list_rate:base, discount_percentage:0, discount_amount:0};
      let calls = 0;
      await assert.rejects(() => setLineValue(row,field,10,async () => { calls++; row.rate=0; }, () => 'Write'), /price before discount/i);
      assert.equal(calls,0); assert.equal(row.rate,100); assert.equal(row[field],0);
    }
  }
  for (const value of [-1,NaN,Infinity]) await assert.rejects(
    () => setLineValue({price_list_rate:100},'discount_amount',value,async()=>assert.fail('invalid native call')),
    /discount amount of zero or more/i);
});
test('missing-base guidance follows current native editability, not invoice type', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice Item','Purchase Invoice Item']) {
    for (const status of ['Read','None',undefined]) {
      const row={doctype:type,rate:100,price_list_rate:0,discount_amount:0};
      await assert.rejects(
        () => setLineValue(row,'discount_amount',10,async()=>assert.fail('must not mutate'),()=>status),
        error => /selected price list/.test(error.message) && /Discount Amount to 0/.test(error.message) && !/Enter a price|advanced/i.test(error.message));
      assert.equal(row.rate,100); assert.equal(row.discount_amount,0);
    }
    await assert.rejects(() => setLineValue({doctype:type},'discount_amount',10,async()=>assert.fail('must not mutate'),()=> 'Write'), /Enter a price before discount/);
  }
});
test('row field status resolves current native metadata and respects grid locks or missing fields', () => {
  const {rowFieldStatus} = context.window.bunood_theme.sales_bill;
  const row={doctype:'Sales Invoice Item',name:'row-05'}, frm=form();
  let df={fieldname:'price_list_rate',read_only:1}, calls=0;
  context.frappe.meta={get_docfield(type,name,id){assert.equal(type,row.doctype);assert.equal(id,row.name);assert.equal(name,'price_list_rate');return df;}};
  context.frappe.perm={get_field_display_status(field,doc,perm){calls++;assert.equal(doc,row);assert.equal(perm,frm.perm);return field.hidden?'None':field.read_only?'Read':'Write';}};
  frm.fields_dict.items.grid.get_docfield=()=>undefined;
  try {
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Read');
    df={fieldname:'price_list_rate'}; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Write');
    df={fieldname:'price_list_rate',hidden:1}; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'None');
    df=undefined; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'None');
    frm.fields_dict.items.grid.get_docfield=()=>({fieldname:'price_list_rate'});
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Write');
    const before=calls; frm.fields_dict.items.grid.is_editable=()=>false;
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Read'); assert.equal(calls,before);
  } finally { delete context.frappe.meta; delete context.frappe.perm; }
});
test('queued discount checks editability at execution and clearing zero still delegates', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  const queue=new SerialChanges(()=>true,()=>{}), row={price_list_rate:0,rate:100,discount_amount:0};
  let status='Write';
  const first=queue.run(async()=>{status='Read';});
  const discount=queue.run(()=>setLineValue(row,'discount_amount',10,async()=>assert.fail('must not mutate'),()=>status));
  await first; await assert.rejects(discount,/selected price list/);
  let cleared=false;
  await setLineValue(row,'discount_amount',0,async value=>{assert.equal(value,0);cleared=true;},()=>{throw Error('unneeded status read');});
  assert.equal(cleared,true); assert.equal(row.rate,100);
  assert.match(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /setLineValue\(doc, name, value, nativeSet, \(\) => rowFieldStatus\(frm, doc, "price_list_rate"\)\)/);
});
test('valid pricing edits delegate unchanged to the native setter, without calculating a second price', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const [field,value,base] of [['discount_amount',10,100],['discount_amount',0,0],['discount_percentage',10,100],['price_list_rate',100,0],['rate',19.99,0],['qty',0.125,0]]) {
    const row = {rate:100,price_list_rate:base}; const calls=[];
    const result = await setLineValue(row,field,value,async incoming => { calls.push(incoming); return 'native-result'; });
    assert.deepEqual(calls,[value]); assert.equal(result,'native-result'); assert.equal(row.rate,100);
  }
  for (const [field,value] of [['qty',0],['qty',-1],['rate',-1],['rate',NaN],['price_list_rate',-1],['price_list_rate',Infinity]]) {
    await assert.rejects(() => setLineValue({},field,value,async () => assert.fail('invalid native call')), /quantity|price/i);
  }
});
test('a queued base-price edit is applied before the following discount is validated', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  const row={price_list_rate:0,rate:100}, order=[];
  const queue=new SerialChanges(()=>true,()=>{});
  const base=queue.run(()=>setLineValue(row,'price_list_rate',100,async value=>{row.price_list_rate=value;order.push('base');}));
  const discount=queue.run(()=>setLineValue(row,'discount_amount',10,async value=>{row.discount_amount=value;order.push('discount');}));
  await Promise.all([base,discount]);
  assert.deepEqual(order,['base','discount']); assert.equal(row.discount_amount,10); assert.equal(row.rate,100);
});
test('Payment delegates to the native invoice controller with its receiver and return value', () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice','Purchase Invoice']) {
    const frm = {doctype:type,doc:{doctype:type,name:'AUDIT-1',docstatus:1}};
    frm.cscript = {frm,make_payment_entry() { assert.equal(this,frm.cscript); return {native:true}; }};
    assert.deepEqual(makePaymentEntry(frm),{native:true});
  }
});
test('Payment blocks drafts and missing controllers and preserves native errors without a mapper fallback', () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  assert.throws(() => makePaymentEntry({doc:{docstatus:0},cscript:{make_payment_entry(){assert.fail('draft');}}}), /Submit/);
  assert.throws(() => makePaymentEntry({doc:{docstatus:1}}), /advanced/i);
  const nativeError = new Error('native payment denied');
  assert.throws(() => makePaymentEntry({doc:{docstatus:1},cscript:{make_payment_entry(){throw nativeError;}}}), error=>error===nativeError);
  assert.doesNotMatch(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /open_mapped_doc/);
});
test('native asynchronous Payment errors remain observable', async () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  const nativeError = new Error('native payment refused');
  const frm = {doc:{docstatus:1},cscript:{make_payment_entry:async () => {throw nativeError;}}};
  await assert.rejects(makePaymentEntry(frm), error=>error===nativeError);
  assert.match(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /return await makePaymentEntry\(this\.frm\);/);
});
test('sales invoices expose the credential-free Bunood ZATCA facade', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source,/bunood_theme\.zatca\.status\.get_status/);
  assert.match(source,/bunood_theme\.zatca\.status\.queue_invoice/);
  assert.match(source,/Sales Invoice Additional Fields/);
  assert.doesNotMatch(source,/production_security_token|production_secret|security_token/);
});
test('drafts can be saved or submitted in one step while clean drafts hide redundant Save', () => {
  const state = (doc, dirty) => JSON.parse(JSON.stringify(actionState(doc, dirty)));
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.deepEqual(state({docstatus:0,__islocal:1}, false), {draft:true,savedDraft:false,showSave:true,showSubmit:true});
  assert.deepEqual(state({docstatus:0,__islocal:0}, false), {draft:true,savedDraft:true,showSave:false,showSubmit:true});
  assert.deepEqual(state({docstatus:0,__islocal:0}, true), {draft:true,savedDraft:false,showSave:true,showSubmit:true});
  assert.deepEqual(state({docstatus:1,__islocal:0}, false), {draft:false,savedDraft:false,showSave:false,showSubmit:false});
  assert.match(css, /\.bnd-bill-action\[hidden\] \{ display: none !important; \}/);
  assert.equal((css.match(/\.bnd-bill-action\[hidden\]/g) || []).length, 1);
});
test('zero rounded total is retained and disabled rounding uses grand total', () => {
  const f = form({grand_total:0.2, rounded_total:0}); f.fields_dict.rounded_total = {};
  assert.equal(totalField(f), 'rounded_total');
  f.doc.disable_rounded_total=1; assert.equal(totalField(f), 'grand_total');
  f.doc.disable_rounded_total='0'; assert.equal(totalField(f), 'rounded_total');
});
test('draft invoices switch to exact halala totals through the native flag', async () => {
  const {ensureExactHalalas} = context.window.bunood_theme.sales_bill;
  const changes=[];
  const draft={doc:{docstatus:0,disable_rounded_total:0},fields_dict:{disable_rounded_total:{}},set_value:async (...args)=>{changes.push(args); draft.doc.disable_rounded_total=args[1];}};
  assert.equal(await ensureExactHalalas(draft),true);
  assert.deepEqual(changes,[['disable_rounded_total',1]]);
  assert.equal(await ensureExactHalalas(draft),false);
  const submitted={...draft,doc:{docstatus:1,disable_rounded_total:0}};
  assert.equal(await ensureExactHalalas(submitted),false);
});
test('native grid add and delete restrictions are respected', () => {
  const f = form(); assert.equal(canAdd(f), true); assert.equal(canRemove(f), true);
  f.fields_dict.items.grid.df.cannot_add_rows=1; assert.equal(canAdd(f), false);
  f.fields_dict.items.grid.df.cannot_delete_rows=1; assert.equal(canRemove(f), false);
  f.fields_dict.items.grid.df={}; f.fields_dict.items.grid.cannot_add_rows=true;
  assert.equal(canAdd(f), false);
});
test('matching item lines merge only when their commercial details match', () => {
  const {mergeableItemLines} = context.window.bunood_theme.sales_bill;
  const line={item_code:'ITEM-1',uom:'Nos',conversion_factor:1,rate:50,price_list_rate:50,
		discount_percentage:0,discount_amount:0,warehouse:'Stores - BDEV',item_tax_template:'KSA VAT'};
  assert.equal(mergeableItemLines(line,{...line,qty:1}),true);
  for (const changed of [
    {rate:49},{price_list_rate:60},{discount_percentage:10},{discount_amount:5},{uom:'Box'},
    {warehouse:'Showroom - BDEV'},{batch_no:'BATCH-1'},{delivery_date:'2026-09-20'},
  ]) assert.equal(mergeableItemLines(line,{...line,...changed}),false,JSON.stringify(changed));
  assert.equal(mergeableItemLines(line,{...line,item_code:'ITEM-2'}),false);
});
test('duplicate item selection increases native quantity and removes only the redundant row', async () => {
  const {BillWorkbench}=context.window.bunood_theme.sales_bill, w=Object.create(BillWorkbench.prototype), frm=form();
  const existing={name:'row-1',doctype:'Sales Invoice Item',item_code:'ITEM-1',qty:2,uom:'Nos',rate:50,price_list_rate:50,discount_percentage:0,warehouse:'Stores'};
  const duplicate={...existing,name:'row-2',qty:1}, ready={name:'row-3',doctype:'Sales Invoice Item',item_code:'',qty:null};
  frm.doc.items=[existing,duplicate,ready];
  frm.fields_dict.items.grid.grid_rows_by_docname={'row-2':{remove(){frm.doc.items=frm.doc.items.filter(row=>row.name!=='row-2');}}};
  frm.fields_dict.items.grid.get_docfield=()=>({fieldname:'qty'});
  frm.refresh_field=name=>assert.equal(name,'items');
  Object.assign(w,{frm,doc:frm.doc,active:()=>true,forgetRow(name){this.forgot=name;},mobileExpanded:''});
  const previous={meta:context.frappe.meta,perm:context.frappe.perm,model:context.frappe.model};
  context.frappe.meta={get_docfield:()=>({fieldname:'qty'})};
  context.frappe.perm={get_field_display_status:()=> 'Write'};
  context.frappe.model={set_value:async (_type,name,field,value)=>{frm.doc.items.find(row=>row.name===name)[field]=value;}};
  try {
    const result=await w.mergeDuplicateItem(duplicate);
    assert.equal(result,existing); assert.equal(existing.qty,3);
    assert.deepEqual(frm.doc.items.map(row=>row.name),['row-1','row-3']);
    assert.equal(w.forgot,'row-2'); assert.equal(w.mobileExpanded,'row-1');
  } finally {Object.assign(context.frappe,previous);}
});
test('VAT stays visible and uses the configured native tax rate', () => {
  assert.equal(hasTaxConfiguration({}), false);
  assert.equal(hasTaxConfiguration({taxes_and_charges:'KSA VAT 15%'}), true);
  assert.equal(taxLabel({taxes:[]}), 'VAT');
  assert.equal(taxLabel({taxes:[{description:'Input VAT 15%',rate:15}]}), 'VAT (15%)');
  assert.equal(taxLabel({taxes:[{description:'Shipping',rate:5}]}, 'Taxes and charges'), 'Taxes and charges');
  assert.equal(showSummary('total_taxes_and_charges', {total_taxes_and_charges:0}), true);
  assert.equal(showSummary('discount_amount', {discount_amount:0}), false);
});
test('the simple VAT choice reflects the configured native category and template', () => {
  const profiles={
    standard:{template:'KSA VAT 15% - BDEV',tax_category:'KSA VAT 15%',rate:15},
    exempt:{template:'KSA VAT Exempt - BDEV',tax_category:'KSA VAT Exempt',rate:0},
  };
  assert.equal(vatTreatment({taxes_and_charges:'KSA VAT 15% - BDEV'},profiles),'standard');
  assert.equal(vatTreatment({taxes_and_charges:'KSA VAT 15% - BDEV',taxes:[{description:'Output VAT',included_in_print_rate:1}]},profiles),'included');
  assert.equal(vatTreatment({tax_category:'KSA VAT Exempt'},profiles),'exempt');
  assert.equal(vatTreatment({tax_category:'Zero-rated exports'},profiles),'');
  assert.equal(vatTreatment({tax_category:'KSA VAT 15%',taxes_and_charges:'Special regional tax'},profiles,'taxes_and_charges'),'');
});
test('changing VAT treatment clears stale item tax overrides before native recalculation', async () => {
  const profiles={standard:{template:'Standard',tax_category:'Standard category',rate:15},exempt:{template:'Exempt',tax_category:'Exempt category',rate:0}};
  const row={name:'ROW-1',doctype:'Sales Invoice Item',item_tax_template:'Old 15%',item_tax_rate:'{"Output VAT": 15}'};
  let dirty=0, refreshes=[], itemMapSawCleared=false, calculations=0;
  const frm={
    doctype:'Sales Invoice',doc:{docstatus:0,company:'Bunood',customer:'Customer 1',tax_category:'Standard category',taxes_and_charges:'Standard',exempt_from_sales_tax:0,items:[row]},
    fields_dict:{exempt_from_sales_tax:{}},dirty(){dirty++;},refresh_field(name){refreshes.push(name);},refresh_fields(){refreshes.push('*');},
    async set_value(name,value){this.doc[name]=value;},
    cscript:{
      async update_item_tax_map(){itemMapSawCleared=row.item_tax_template===''&&row.item_tax_rate==='{}';},
      calculate_taxes_and_totals(){calculations++;},
    },
  };
  assert.equal(clearItemTaxOverrides(frm),true);
  row.item_tax_template='Old 15%'; row.item_tax_rate='{"Output VAT": 15}';
  await applyVatTreatment(frm,'exempt',profiles);
  assert.equal(itemMapSawCleared,true);
  assert.equal(frm.doc.tax_category,'Exempt category');
  assert.equal(frm.doc.taxes_and_charges,'Exempt');
  assert.equal(frm.doc.exempt_from_sales_tax,1);
  assert.equal(calculations,1);
  assert.ok(dirty>=2);
  assert.ok(refreshes.includes('taxes'));
});
test('VAT-inclusive pricing changes only native VAT rows', async () => {
  const vat={doctype:'Sales Taxes and Charges',name:'VAT-1',description:'Output VAT',included_in_print_rate:0};
  const shipping={doctype:'Sales Taxes and Charges',name:'SHIP-1',description:'Shipping',included_in_print_rate:0};
  const frm={doc:{taxes:[vat,shipping]},refresh_field(name){assert.equal(name,'taxes');}};
  const previousModel=context.frappe.model; const writes=[];
  context.frappe.model={set_value:async (_doctype,name,field,value)=>{
    const row=frm.doc.taxes.find(candidate=>candidate.name===name); row[field]=value; writes.push([name,field,value]);
  }};
  try {
    assert.equal(await setVatIncludedInPrice(frm,true),1);
    assert.equal(vat.included_in_print_rate,1);
    assert.equal(shipping.included_in_print_rate,0);
    assert.deepEqual(writes,[['VAT-1','included_in_print_rate',1]]);
    assert.equal(await setVatIncludedInPrice(frm,true),0,'reselecting the mode is idempotent');
    assert.equal(await setVatIncludedInPrice(frm,false),1);
    assert.equal(vat.included_in_print_rate,0);
  } finally { context.frappe.model=previousModel; }
});
test('simple invoices offer three clear VAT price modes while Advanced retains native detail', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(source,/role", "radiogroup"/);
  assert.match(source,/__\("VAT added to price"\)/);
  assert.match(source,/__\("Price includes VAT"\)/);
  assert.match(source,/__\("VAT exempt \(0%\)"\)/);
  assert.match(source,/"included_in_print_rate"/);
  assert.match(source,/bunood_theme\.vat\.get_vat_treatments/);
  assert.match(source,/tax_category: frm => scheduleVatNormalization\(frm, "tax_category"\)/);
  assert.match(source,/taxes_and_charges: frm => scheduleVatNormalization\(frm, "taxes_and_charges"\)/);
  assert.match(source,/exempt_from_sales_tax\(frm\)/);
  assert.match(source,/\["apply_discount_on", "additional_discount_percentage", "discount_amount"\]/);
  assert.doesNotMatch(source,/\["apply_discount_on", "additional_discount_percentage", "discount_amount", "taxes_and_charges"\]/);
  assert.match(css,/\.bnd-vat-treatment-options > button\.is-selected/);
});
test('the item sheet ends with a concise native invoice calculation', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  const arabic=fs.readFileSync('bunood_theme/translations/ar.csv','utf8');
  assert.match(source,/items\.append\(this\.lines, search, lineHint\);[\s\S]*?bnd-bill-amount-summary/);
  assert.match(source,/\["total", __\("Items total"\)\]/);
  assert.match(source,/\["discount_amount", __\("Discount Amount"\)\]/);
  assert.match(source,/\["net_total", __\("Net before VAT"\)\]/);
  assert.match(source,/\["total_taxes_and_charges", null\]/);
  assert.match(source,/frm\.fields_dict\[name\]\?\.df \|\| frappe\.meta\.get_docfield\(frm\.doctype, name, doc\.name\)/);
  assert.match(source,/taxLabel\(doc, __\(df\.label\)\)/);
  assert.match(source,/const optional = \["rounding_adjustment", "paid_amount", "outstanding_amount"\]/);
  assert.match(source,/name === "discount_amount" && !Number\(doc\[name\]\)/);
  assert.match(source,/name === "net_total" && roundMoney\(doc\[name\]\) === roundMoney\(doc\.total\)/);
  assert.match(source,/name === "outstanding_amount" && roundMoney\(doc\[name\]\) === roundMoney\(doc\[totalName\]\)/);
  assert.match(source,/name === "discount_amount" \? -Math\.abs\(Number\(doc\[name\]\)\)/);
  assert.match(source,/this\.money\(node\("strong", "", null, this\.amountGrand\), doc\[totalName\] \|\| 0, totalDf\)/);
  assert.match(scss,/\.bnd-bill-amount-breakdown \{[\s\S]*?grid-template-columns: repeat\(auto-fit,minmax\(min\(100%,14rem\),1fr\)\)/);
  assert.match(scss,/\.bnd-bill-amount-grand \{[\s\S]*?background: var\(--bnd-brand-deep\)/);
  assert.match(arabic,/^Items total,إجمالي قيمة الأصناف,/m);
  assert.match(arabic,/^Net before VAT,الصافي قبل الضريبة,/m);
});
test('Simple mode rejects ambiguous VAT rows before native save', () => {
  assert.equal(taxConfigurationIssue({ taxes_and_charges: 'KSA VAT', taxes: [] }).code, 'empty_template');
  assert.equal(taxConfigurationIssue({ taxes: [{ idx: 3, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: '' }] }).row, 3);
  assert.equal(taxConfigurationIssue({ taxes: [{ description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 0 }] }), null);
  const conflict = taxConfigurationIssue({ taxes: [
    { idx: 2, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 15 },
    { idx: 4, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 5 },
  ] });
  assert.equal(conflict.code, 'conflicting_rates');
  assert.deepEqual(Array.from(conflict.rows), [2, 4]);
  assert.match(taxIssueMessage(conflict), /2, 4/);
});
test('line actions get their own spreadsheet column so item identity aligns with field controls', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(source, /button\(__\("Remove"\), view\.actions,/);
  assert.doesNotMatch(source, /view\.duplicate/);
  assert.doesNotMatch(source, /button\(__\("Add one"\), view\.actions,/);
  assert.match(source, /bnd-bill-item-meta/);
  assert.match(source, /fieldname === "item_code"/);
  assert.match(scss, /\.bnd-bill-line-actions \{\s*grid-column: 9; grid-row: 1/);
});
test('white gray and focused row surfaces paint every invoice column', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss, /\.bnd-bill-line \{[\s\S]*?--bnd-bill-row-bg: var\(--bnd-surface\);[\s\S]*?background: var\(--bnd-bill-row-bg\)/);
  assert.match(scss, /\.bnd-bill-line:nth-of-type\(even\) \{ --bnd-bill-row-bg: var\(--bnd-raised\); \}/);
  assert.match(scss, /\.bnd-bill-line:focus-within \{ --bnd-bill-row-bg: var\(--bnd-hover\); \}/);
  assert.match(scss, /\.bnd-bill-line-body,\s*\.bnd-bill-line-body > div \{ background: var\(--bnd-bill-row-bg\); \}/);
});
test('mutations run in order, recover after rejection, and reject stale work', async () => {
  let active = true, release; const order = [];
  const queue = new SerialChanges(() => active, () => {});
  const first = queue.run(async () => { order.push('start'); await new Promise(r => release = r); order.push('end'); });
  const second = queue.run(async () => order.push('second'));
  await Promise.resolve(); release(); await Promise.all([first,second]);
  assert.deepEqual(order, ['start','end','second']);
  await assert.rejects(queue.run(async () => { throw Error('lookup failed'); }));
  await queue.run(async () => order.push('recovered'));
  active = false;
  await assert.rejects(queue.run(async () => order.push('stale')));
  assert.equal(order.includes('stale'), false);
  assert.equal(queue.count, 0);
});
test('saving does not wait for unrelated desk AJAX after native save resolves', async () => {
  const previous = context.frappe.after_ajax;
  let waits = 0;
  context.frappe.after_ajax = async () => { waits++; };
  try {
    const queue = new SerialChanges(() => true, () => {});
    await queue.run(async () => {}, { settle: false });
    assert.equal(waits, 0);
    await queue.run(async () => {});
    assert.equal(waits, 1, 'field mutations still wait for their dependent AJAX');
  } finally { context.frappe.after_ajax = previous; }
});
test('resolved native save is not proof that a draft was saved', async () => {
  const failed = form(); failed.is_dirty = () => true;
  failed.save = async (_action, callback, _button, onError) => { onError(); };
  await assert.rejects(saveDraft(failed));
  const swallowed = form(); swallowed.is_dirty = () => true;
  swallowed.save = async () => {};
  await assert.rejects(saveDraft(swallowed));
  const ok = form(); ok.is_dirty = () => false;
  ok.save = async (action, callback) => { assert.equal(action,'Save'); ok.doc.name='INV-TEST'; callback({}); };
  await saveDraft(ok);
});

// Small native-control doubles; the production bind/queue/render methods run unchanged.
function element() {
  const attrs = new Map(), classes = new Set();
  return { children: [], className: '', textContent: '',
    setAttribute: (key, value) => attrs.set(key, String(value)),
    getAttribute: key => attrs.get(key) ?? null, removeAttribute: key => attrs.delete(key),
    classList: { add: key => classes.add(key), remove: key => classes.delete(key),
      contains: key => classes.has(key), toggle(key, on) { on ? classes.add(key) : classes.delete(key); } },
    append(child) { this.children.push(child); child.parent = this; },
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
    querySelector(selector) { return this.children.find(child => child.className.split(' ').includes(selector.slice(1))) || null; },
  };
}
function boundWorkbench(nativeSet) {
  const { BillWorkbench } = context.window.bunood_theme.sales_bill;
  const workbench = Object.create(BillWorkbench.prototype), frm = form();
  const row = { name:'row-06', doctype:'Sales Invoice Item', item_code:'TEST', qty:1, rate:100, price_list_rate:0, discount_percentage:0 };
  frm.doc.items = [row];
  Object.assign(workbench, { frm, doc:frm.doc, controls:[], invalid:new Map(), pending:new Map(), editTimers:new Map(), rowViews:new Map(), revertButton:{hidden:true},
    active:()=>true, busy(){}, render(){ for(const c of this.controls) this.renderControl(c.control,c.key,true); }, message(text){this.lastMessage=text;} });
  workbench.queue = new SerialChanges(()=>true,()=>{});
  context.document.createElement = element;
  context.frappe.meta = {get_docfield:()=>({read_only:1})};
  context.frappe.perm = {get_field_display_status:df=>df.read_only?'Read':'Write'};
  context.frappe.ui = {form:{make_control({df,doc}) {
    const input=element(), wrapper=element(); let value=doc[df.fieldname];
    input.handlers = {};
    input.setAttribute('aria-describedby','native-help');
    const c={df,get_query(){return 'native-link-query';},$input:{0:input,val(v){if(arguments.length)value=v;return value;},attr(k,v){input.setAttribute(k,v);},on(event,fn){input.handlers[event]=fn;}},
      $wrapper:{0:wrapper,addClass:k=>wrapper.classList.add(k),removeClass:k=>wrapper.classList.remove(k)},
      get_status:df.get_status, refresh(){value=doc[df.fieldname];}, set_input(v){value=v;},
      set_focus(){context.document.activeElement=input;},
      get_value(){return Number(value);}, get_model_value(){return doc[df.fieldname];},
      set_value(v){return this.validate_and_set_in_model(v);},
      async set_model_value(v){if(nativeSet)await nativeSet(df.fieldname,v);doc[df.fieldname]=v;},
      validate_and_set_in_model(v){return v===doc[df.fieldname]?Promise.resolve():this.set_model_value(v);},
    };
    return c;
  }}};
  const bind = name => workbench.bindControl(element(),{df:{fieldname:name,label:name}},row,true);
  return {workbench,row,bind};
}
test('synthetic row controls preserve a native fallback and forward the grid Link query', () => {
  const {workbench,row}=boundWorkbench();
  const native=workbench.bindControl(element(),{df:{fieldname:'warehouse',label:'Warehouse',fieldtype:'Link'}},row,true);
  assert.equal(native.get_query(),'native-link-query');
  const override=()=> 'configured-query';
  const configured=workbench.bindControl(element(),{df:{fieldname:'warehouse',label:'Warehouse',fieldtype:'Link'},get_query:override},row,true);
  assert.equal(configured.get_query,override);
  assert.equal(configured.get_query(),'configured-query');
  configured.$input.val('Stores');
  configured.$input[0].handlers['input.bnd-bill']();
  assert.equal(workbench.editTimers.size,0,'Link typing must reach native autocomplete before validation');
});
test('rejected input gets an associated plain-text inline error; clearing to native value removes only owned help', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.$input.val('10'); await control.set_model_value(10);
  const error=control.$wrapper[0].querySelector('.bnd-bill-field-error');
  assert.ok(error,'error must be beside the actual control');
  assert.match(error.textContent,/selected price list/);
  assert.equal(control.$input[0].getAttribute('aria-describedby'),`native-help ${error.id}`);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  assert.equal(workbench.invalid.get('row-06:discount_percentage').raw,'10');
  assert.equal(row.rate,100); assert.equal(row.discount_percentage,0);
  control.$input.val('0'); await control.validate_and_set_in_model(0);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  assert.equal(control.$input[0].getAttribute('aria-describedby'),'native-help');
  assert.equal(control.$input[0].getAttribute('aria-invalid'),null);
  assert.equal(control.$wrapper[0].classList.contains('bnd-bill-invalid'),false);
  assert.equal(workbench.invalid.size,0);
});
test('an untouched focused dependent price refreshes from native calculation instead of becoming a false edit', () => {
  const {workbench:w,row,bind}=boundWorkbench(), rate=bind('rate');
  context.document.activeElement=rate.$input[0];
  row.rate=76; w.render();
  assert.equal(rate.get_value(),76);
  assert.equal(rate.get_value(),rate.get_model_value(),'flush must not see a false edit');
  assert.equal(context.document.activeElement,rate.$input[0]);
});
test('flush ignores the untouched ready row but still validates real typing in it', async () => {
  const {workbench:w,row,bind}=boundWorkbench();
  row.item_code=''; row.qty=null; row.rate=null;
  const qty=bind('qty'),rate=bind('rate');
  await w.flush();
  assert.equal(w.invalid.size,0,'display-only zeroes on the ready row are not edits');
  assert.equal(row.qty,null); assert.equal(row.rate,null);

  qty.$input.val('0'); w.pending.set('row-06:qty','0');
  await w.flush();
  assert.match(w.invalid.get('row-06:qty')?.message || '',/quantity above zero/);
});
test('focused equivalent formatting, pending typing and rejected raw values survive dependent refresh', () => {
  const {workbench:w,row,bind}=boundWorkbench(), rate=bind('rate'), key='row-06:rate';
  context.document.activeElement=rate.$input[0];
  row.rate=125.5; rate.$input.val('125.50'); w.render();
  assert.equal(rate.$input.val(),'125.50');
  rate.$input.val('7.'); w.pending.set(key,'7.'); row.rate=76; w.render();
  assert.equal(rate.$input.val(),'7.');
  w.pending.clear(); rate.$input.val('-1'); w.invalid.set(key,{raw:'-1',message:'invalid'}); w.render();
  assert.equal(rate.$input.val(),'-1');
});
test('unrelated successful edits and focused refresh preserve the error and newer pending typing', async () => {
  const {workbench,row,bind}=boundWorkbench(), discount=bind('discount_percentage'), qty=bind('qty');
  discount.$input.val('10'); await discount.set_model_value(10);
  const id=discount.$wrapper[0].querySelector('.bnd-bill-field-error')?.id;
  discount.$input.val('15'); workbench.pending.set('row-06:discount_percentage','15');
  context.document.activeElement=discount.$input[0];
  qty.$input.val('2'); await qty.set_model_value(2);
  assert.equal(discount.$input.val(),'15'); assert.equal(row.qty,2); assert.equal(row.discount_percentage,0);
  assert.equal(discount.$wrapper[0].querySelector('.bnd-bill-field-error')?.id,id);
  assert.equal(discount.$input[0].getAttribute('aria-invalid'),'true');
  context.document.activeElement=null; workbench.render();
  assert.equal(discount.$input.val(),'15','old rejection must not replace newer raw input');
  assert.equal(discount.$input[0].getAttribute('aria-describedby'),`native-help ${id}`);
});
test('independent errors keep unique IDs, do not render HTML, and cleanly clear on revert or read-only refresh', async () => {
  const {workbench,bind}=boundWorkbench(), discount=bind('discount_percentage'), qty=bind('qty');
  discount.$input.val('10'); await discount.set_model_value(10);
  qty.$input.val('0'); await qty.set_model_value(0);
  const error=discount.$wrapper[0].querySelector('.bnd-bill-field-error');
  assert.notEqual(error?.id,qty.$wrapper[0].querySelector('.bnd-bill-field-error')?.id);
  workbench.invalid.get('row-06:discount_percentage').message='<img src=x onerror=alert(1)>';
  workbench.render(); assert.equal(error.textContent,'<img src=x onerror=alert(1)>'); assert.equal(error.children.length,0);
  discount.get_status=()=> 'None'; workbench.render();
  assert.equal(discount.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  assert.equal(discount.$input[0].getAttribute('aria-describedby'),'native-help');
  assert.equal(workbench.invalid.size,2,'permissions must not silently accept rejected edits');
  workbench.invalid.clear(); workbench.pending.clear(); workbench.render();
  assert.equal(qty.$input[0].getAttribute('aria-invalid'),null);
  assert.equal(qty.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('row removal forgets errors/pending values without disturbing another row', async () => {
  const {workbench,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.$input.val('10'); await control.set_model_value(10);
  workbench.invalid.set('other:qty',{raw:'0',message:'other error'});
  workbench.forgetRow('row-06'); workbench.render();
  assert.equal(workbench.invalid.size,1); assert.equal(workbench.pending.size,0);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('invalid field errors block save/submit and focus the first invalid native control', async () => {
  const {workbench,row,bind}=boundWorkbench(), qty=bind('qty');
  workbench.invalid.set('row-06:qty',{raw:'0',message:'bad quantity'});
  workbench.doc.customer='TEST'; workbench.profile={party:'customer'};
  workbench.flush=async()=>{}; workbench.render=()=>{};
  workbench.frm.is_dirty=()=>false;
  workbench.frm.save=async()=>assert.fail('invalid draft reached save');
  let submitted=false; workbench.frm.savesubmit=async()=>{submitted=true;};
  await workbench.save(); assert.match(workbench.lastMessage,/highlighted/); assert.equal(context.document.activeElement,qty.$input[0]);
  context.document.activeElement=null;
  await workbench.submit(); assert.equal(submitted,false); assert.match(workbench.lastMessage,/highlighted/); assert.equal(context.document.activeElement,qty.$input[0]);
  assert.equal(row.qty,1);
});
test('Bunood errors never erase native required/invalid presentation or unrelated help', async () => {
  const {workbench,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.refresh=()=>{control.$wrapper[0].classList.add('has-error');control.$input[0].setAttribute('aria-invalid','true');};
  workbench.render();
  assert.equal(control.$wrapper[0].classList.contains('has-error'),true);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  control.$input.val('10'); await control.set_model_value(10);
  control.$input[0].setAttribute('aria-describedby',control.$input[0].getAttribute('aria-describedby')+' later-help');
  control.$input.val('0'); await control.validate_and_set_in_model(0);
  assert.equal(control.$wrapper[0].classList.contains('has-error'),true);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  assert.equal(control.$input[0].getAttribute('aria-describedby'),'native-help later-help');
  assert.equal(control.$wrapper[0].classList.contains('bnd-bill-invalid'),false);
});
test('superseded queued edits retain newer typing until explicit validation, including clear-to-current', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('discount_percentage');
  let release;
  const hold=workbench.queue.run(()=>new Promise(resolve=>{release=resolve;}));
  await Promise.resolve();
  control.$input.val('10'); const failed=control.set_model_value(10);
  control.$input.val('15'); workbench.pending.set('row-06:discount_percentage','15');
  release(); await hold; await failed; workbench.render();
  assert.equal(control.$input.val(),'15'); assert.equal(row.discount_percentage,0);
  assert.equal(workbench.invalid.size,0,'superseded queued edit must not show an old error');
  control.$input.val('0'); await control.validate_and_set_in_model(0); workbench.render();
  assert.equal(workbench.invalid.size,0); assert.equal(workbench.pending.size,0);
  assert.equal(Number(control.$input.val()),0);
});
test('restoring the native value while an invalid edit is queued cancels its late error', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('qty');
  let release;
  const hold=workbench.queue.run(()=>new Promise(resolve=>{release=resolve;})); await Promise.resolve();
  control.$input.val('0'); const old=control.set_model_value(0);
  control.$input.val('1'); workbench.pending.set('row-06:qty','1');
  await control.validate_and_set_in_model(1);
  release(); await hold; await old; workbench.render();
  assert.equal(workbench.invalid.size,0); assert.equal(workbench.pending.size,0);
  assert.equal(Number(control.$input.val()),1); assert.equal(row.qty,1);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('Read/None native refresh does not replay rejected raw values into the native display', async () => {
  for (const status of ['Read','None']) {
    const {workbench,row,bind}=boundWorkbench(), control=bind('qty');
    control.$input.val('0'); await control.set_model_value(0);
    let displayed;
    control.get_status=()=>status;
    control.refresh=()=>{displayed=row.qty;};
    control.set_input=value=>{displayed=value;};
    workbench.render();
    assert.equal(displayed,1); assert.equal(workbench.invalid.size,1);
    assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  }
});
test('inline error growth does not bottom-align neighboring invoice controls', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/\.bnd-bill-line-body \{[\s\S]*?align-items: stretch/);
  assert.match(scss,/\.bnd-bill-cell > \.frappe-control,[\s\S]*?display: block;[\s\S]*?min-block-size: 0/);
  assert.match(scss,/\.bnd-bill-line \.frappe-control :is\([^}]*block-size:\s*var\(--bnd-control-h\)/);
});
test('spreadsheet rows use a full-width control track without an internal scroller', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/--bnd-bill-grid:\s*2rem minmax\(9rem,2\.5fr\) repeat\(4,minmax\(3rem,\.8fr\)\) minmax\(6rem,1fr\) minmax\(5rem,1fr\) 4\.5rem/);
  assert.match(scss,/\.bnd-bill-line-head,[\s\S]*?grid-template-columns:\s*var\(--bnd-bill-grid\)/);
  assert.match(scss,/\.bnd-bill-line-head \{[\s\S]*?position: static/);
  assert.match(scss,/\.bnd-bill-lines \{[\s\S]*?max-block-size: none;[\s\S]*?overflow: visible/);
  assert.match(scss,/\.bnd-bill-line \.frappe-control :is\([^}]*block-size:\s*var\(--bnd-control-h\)/);
  assert.match(scss,/\.bnd-bill-line \.frappe-control \.control-value[^}]*white-space:\s*nowrap/);
  assert.match(scss,/@media \(width < bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-cell \.control-label,[\s\S]*?position: static/);
});
test('short desktop invoices keep the document header in flow above the item sheet', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/@media \(height < bp\.bnd-bp\(sm\)\) and \(width >= bp\.bnd-bp\(md\)\)[\s\S]*?\.bnd-bill-intro \{\s*position: static;\s*inset-block-start: auto;/);
});
test('settlement choice is half-width and shares its row with the native invoice number', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/\.bnd-bill-essentials > \[data-fieldname="bunood_settlement_method"\] \{ min-inline-size: 0; \}/);
  assert.doesNotMatch(scss,/data-fieldname="bunood_settlement_method"[^}]*grid-column:\s*span 2/);
  assert.match(scss,/\.bnd-bill-essentials > \[data-fieldname="bunood_settlement_method"\] \.help-box \{ display: none; \}/);
  assert.match(scss,/\.bnd-bill-essentials > \[data-fieldname="bunood_settlement_method"\] select \{ inline-size: 100%; max-inline-size: 100%; \}/);
  assert.match(source,/bnd-bill-invoice-number/);
  assert.match(source,/__\("Invoice number"\)/);
  assert.match(source,/doc\.__islocal \? __\("Assigned after saving"\) : doc\.name/);
  assert.match(scss,/\.bnd-bill-static-value \{[\s\S]*?min-block-size: var\(--bnd-control-h\)/);
});

// Disabling a containing fieldset removes browser focus. Model that side effect,
// then exercise the actual busy policy and serial/native-control integration.
function editingWorkbench(nativeSet) {
  const fixture = boundWorkbench(nativeSet), w = fixture.workbench;
  w.profile = {party:'customer'}; w.frm.doc.customer = 'TEST';
  w.root = element(); w.rowViews = new Map([['row-06',{remove:{}}]]);
  for (const name of ['addLineButton','saveButton','submitButton','submitPrintButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) w[name] = {};
  let disabled = false;
  w.editor = {get disabled(){return disabled;},set disabled(value){disabled=value;if(value)context.document.activeElement=null;}};
  w.busy = context.window.bunood_theme.sales_bill.BillWorkbench.prototype.busy;
  w.queue = new SerialChanges(()=>true,()=>w.busy());
  return fixture;
}
test('queued recalculation keeps typing focus while structural and commit actions stay disabled', async () => {
  const {workbench:w,bind}=editingWorkbench(), qty=bind('qty');
  context.document.activeElement=qty.$input[0];
  let release;
  const task=w.queue.run(()=>new Promise(resolve=>release=resolve));
  await Promise.resolve();
  try {
    assert.equal(w.editor.disabled,false,'queued input must not disable its fieldset');
    assert.equal(context.document.activeElement,qty.$input[0]);
    assert.equal(w.root.getAttribute('aria-busy'),'true');
    for(const name of ['addLineButton','saveButton','submitButton','submitPrintButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) assert.equal(w[name].disabled,true,name);
    assert.equal(w.rowViews.get('row-06').remove.disabled,true);
  } finally {release();await task;}
  assert.equal(w.root.getAttribute('aria-busy'),'false');
  assert.equal(w.editor.disabled,false);
  for(const name of ['addLineButton','saveButton','submitButton','submitPrintButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) assert.equal(w[name].disabled,false,name);
  assert.equal(w.rowViews.get('row-06').remove.disabled,false);
});
test('saving closing and flushing still lock the editor independently of queued work', () => {
  const {workbench:w}=editingWorkbench();
  for(const flag of ['saving','closing','flushing']) {
    w[flag]=true;w.busy();assert.equal(w.editor.disabled,true,flag);
    assert.equal(w.saveButton.disabled,true);assert.equal(w.root.getAttribute('aria-busy'),'true');
    w[flag]=false;w.busy();assert.equal(w.editor.disabled,false,flag);
  }
});
test('typing newer values and moving focus during a deferred queue preserves both choices', async () => {
  const {workbench:w,row,bind}=editingWorkbench(), qty=bind('qty'), rate=bind('rate');
  context.document.activeElement=qty.$input[0];
  let release;const gate=w.queue.run(()=>new Promise(resolve=>release=resolve));await Promise.resolve();
  qty.$input.val('2');const old=qty.set_model_value(2);
  qty.$input.val('23');const latest=qty.set_model_value(23);
  context.document.activeElement=rate.$input[0];
  rate.$input.val('125.5');const price=rate.set_model_value(125.5);
  release();await Promise.all([gate,old,latest,price]);
  assert.equal(row.qty,23);assert.equal(row.rate,125.5);
  assert.equal(context.document.activeElement,rate.$input[0],'completion must not steal the chosen focus');
  assert.equal(rate.$input.val(),'125.5','focused raw text must not be reformatted');
  assert.equal(w.pending.size,0);assert.equal(w.invalid.size,0);
});
test('real input handlers preserve continued typing through an in-flight native setter', async () => {
  let release, started;
  const entered=new Promise(resolve=>started=resolve), originalTimer=context.setTimeout, originalClear=context.clearTimeout;
  const callbacks=new Map();let timerId=0;
  context.setTimeout=fn=>{callbacks.set(++timerId,fn);return timerId;};
  context.clearTimeout=id=>callbacks.delete(id);
  const {workbench:w,row,bind}=editingWorkbench(async(field,value)=>{if(field==='qty'&&value===2){started();await new Promise(resolve=>release=resolve);}});
  const qty=bind('qty'),rate=bind('rate');
  const input=(control,value)=>{control.$input.val(value);control.$input[0].handlers['input.bnd-bill']();};
  const tick=()=>{const work=[...callbacks.values()];callbacks.clear();for(const fn of work)fn();};
  try {
    context.document.activeElement=qty.$input[0];input(qty,'2');tick();await entered;
    input(qty,'23');tick();
    context.document.activeElement=rate.$input[0];input(rate,'125.5');tick();
    release();await w.queue.tail;await Promise.resolve();
    assert.equal(row.qty,23);assert.equal(row.rate,125.5);
    assert.equal(qty.$input.val(),23);assert.equal(rate.$input.val(),'125.5');
    assert.equal(context.document.activeElement,rate.$input[0]);assert.equal(w.pending.size,0);
  } finally {release?.();context.setTimeout=originalTimer;context.clearTimeout=originalClear;}
});
test('queue completion cannot unlock an in-flight ZATCA action', () => {
  const {workbench:w}=editingWorkbench();
  w.zatcaSending=true;w.queue.count=1;w.busy();assert.equal(w.zatcaButton.disabled,true);
  w.queue.count=0;w.busy();assert.equal(w.zatcaButton.disabled,true);
  assert.equal(w.editor.disabled,false);w.zatcaSending=false;w.busy();assert.equal(w.zatcaButton.disabled,false);
});
test('ZATCA action respects busy state, rejects duplicate sends and releases only its own lock', async () => {
  const originalCall=context.frappe.call,originalTimer=context.setTimeout;
  context.setTimeout=()=>0;
  try {
    for(const fails of [false,true]) {
      const {workbench:w}=editingWorkbench();w.zatcaData={state:'ready_to_send',can_queue:true};w.zatcaStatus={};
      let release,calls=0;
      context.frappe.call=async()=>{calls++;await new Promise((resolve,reject)=>release=()=>fails?reject(Error('test rejection')):resolve());};
      w.queue.count=1;w.busy();await w.zatcaAction();assert.equal(calls,0);
      w.queue.count=0;w.busy();const send=w.zatcaAction();assert.equal(calls,1);
      await w.zatcaAction();assert.equal(calls,1,'duplicate send must be ignored');
      w.queue.count=1;w.busy();release();
      if(fails)await assert.rejects(send,/test rejection/);else await send;
      assert.equal(w.zatcaSending,false);assert.equal(w.zatcaButton.disabled,true,'queued edits still own their lock');
      w.queue.count=0;w.busy();assert.equal(w.zatcaButton.disabled,false);
    }
  } finally {context.frappe.call=originalCall;context.setTimeout=originalTimer;}
});
