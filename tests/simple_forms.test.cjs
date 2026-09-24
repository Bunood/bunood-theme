const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {
  window: { bunood_theme: {} }, document: {},
  frappe: { after_ajax: async () => {}, perm: { has_perm: (...args) => args } },
  $: () => ({ on() {} }), __: s => s, setTimeout,
};
context.window.frappe=context.frappe;
context.frappe.provide=path => {
  let target=context.window;
  for (const part of path.split('.')) target=target[part] ||= {};
  return target;
};
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/document_actions.js', 'utf8'), context);
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8'), context);
const { candidate, fallbackFields, profiles, canCreateSalesInvoice, createSalesInvoice } = context.window.bunood_theme.simple_forms;
function frm(doctype, module='Stock') {
  return { doctype, doc: { doctype }, meta: { name: doctype, module, fields: [
    {fieldname:'company', reqd:1}, {fieldname:'posting_date', bold:1},
    {fieldname:'internal_note'}, {fieldname:'items', fieldtype:'Table'},
  ]}, fields_dict: {} };
}
test('only completed workbenches default to Simple; unfinished and framework forms stay native', () => {
  assert.equal(candidate(frm('Stock Entry')), true);
  assert.equal(candidate(frm('Quotation','Selling')), true);
  assert.equal(candidate(frm('Payment Entry','Accounts')), true);
  assert.equal(candidate(frm('Custom Vertical Order', 'Custom')), false);
  assert.equal(candidate(frm('BOM','Manufacturing')), false);
  assert.equal(candidate(frm('Sales Invoice', 'Accounts')), false);
  assert.equal(candidate(frm('Purchase Invoice', 'Accounts')), false);
  assert.equal(candidate(frm('User','Core')), false);
  assert.equal(candidate({...frm('Row'), meta:{name:'Row',module:'Stock',istable:1,fields:[]}}), false);
});
test('profiles preserve task fields and required fallback fields', () => {
  const selected=fallbackFields(frm('Stock Entry'));
  for (const name of ['company','posting_date','items','stock_entry_type','from_warehouse','to_warehouse']) assert.equal(selected.has(name),true,name);
  assert.equal(selected.has('internal_note'),false);
  assert.ok(Object.keys(profiles).length >= 20);
});
test('real-estate masters and lease use explicit task-ordered profiles', () => {
  const expected = {
    Property: ['property_name', 'company', 'property_kind', 'usage_type', 'status', 'floor_plan', 'deeds', 'ownership_shares'],
    'Real Estate Unit': ['unit_name', 'property', 'unit_kind', 'is_leasable', 'status', 'area'],
    Lease: ['company', 'property', 'contract_type', 'our_role', 'tenant', 'start_date', 'end_date', 'renewal_mode', 'tenancies'],
  };
  for (const [doctype, fields] of Object.entries(expected)) {
    assert.ok(Array.isArray(profiles[doctype]), `${doctype} must not use metadata-only fallback`);
    let previous = -1;
    for (const field of fields) {
      const index = profiles[doctype].indexOf(field);
      assert.ok(index > previous, `${doctype}.${field} must exist in task order`);
      previous = index;
    }
  }
  for (const table of ['floor_plan', 'deeds', 'ownership_shares']) assert.ok(profiles.Property.includes(table));
  assert.ok(profiles.Lease.includes('tenancies'));
});
test('daily masters have structured compositions and Company keeps native tax ID', () => {
  const { compositions }=context.window.bunood_theme.simple_forms;
  for (const doctype of ['Customer','Supplier','Item','Property','Real Estate Unit','Lease','Company']) {
    assert.ok(compositions[doctype]?.length >= 2, `${doctype} needs progressive-disclosure groups`);
  }
  assert.deepEqual(Array.from(profiles.Company), ['company_name','abbr','default_currency','country','tax_id','default_letter_head']);
  assert.equal(fallbackFields({...frm('Company'),doc:{doctype:'Company',tax_id:null}}).has('tax_id'),true);
});

test('core transactions use purpose-built task workbenches instead of grouped native-form cards', () => {
  const source = fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8');
  const workbenches=context.window.bunood_theme.simple_forms.taskWorkbenches;
  for (const doctype of ['Quotation', 'Sales Order', 'Purchase Order', 'Purchase Receipt', 'Material Request', 'Stock Reconciliation', 'Payment Entry', 'Journal Entry', 'Expense Claim']) {
    assert.ok(workbenches[doctype]?.panels.length >= 2, `${doctype} needs a dedicated task hierarchy`);
    assert.equal(context.window.bunood_theme.simple_forms.compositions[doctype], undefined, `${doctype} must not fall back to GroupedWorkbench`);
  }
  assert.equal(new Set(Object.values(workbenches).map(spec=>spec.variant)).size, Object.keys(workbenches).length, 'every transaction needs a distinct visual variant');
  assert.match(source, /class TaskWorkbench extends SimpleDocumentWorkbench/);
  assert.match(source, /TASK_WORKBENCHES\[frm\.doctype\] \? new TaskWorkbench/);
  assert.match(source, /this\.printButton = this\.action\(this\.primaryActions, __\("Print"\)/);
  assert.match(source, /this\.printButton\.parentNode !== this\.primaryActions/);
});
test('submitted quotation keeps native mapping prominent in its action bar', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(source,/frappe\.model\.open_mapped_doc\(\{/);
  assert.match(source,/erpnext\.selling\.doctype\.quotation\.quotation\.make_sales_invoice/);
  assert.match(source,/Once the quotation is submitted, use Create Sales Invoice above/);
  assert.match(css,/\[data-primary="create-invoice"\] \.bnd-simple-actions-identity \{ flex: 0 1 auto; \}/);
});
test('every purpose-built task label and explanation ships in Arabic', () => {
  const firstCell=line=>{
    if (!line.startsWith('"')) return line.split(',',1)[0];
    let out='';
    for(let i=1;i<line.length;i++){
      if(line[i]==='"'&&line[i+1]==='"'){out+='"';i++;continue;}
      if(line[i]==='"')break;
      out+=line[i];
    }
    return out;
  };
  const translated=new Set(fs.readFileSync('bunood_theme/translations/ar.csv','utf8').split(/\r?\n/).filter(Boolean).map(firstCell));
  const inherited=new Set(fs.readFileSync('bunood_theme/locale/inherited.ar.txt','utf8').split(/\r?\n/)
    .filter(line=>line&&!line.startsWith('#')).map(line=>line.split('\t',1)[0]));
  const workbenches=context.window.bunood_theme.simple_forms.taskWorkbenches;
  for(const [doctype,spec] of Object.entries(workbenches)){
    const copy=[...spec.steps,...spec.panels.flatMap(([,title,help])=>[title,help]),...spec.metrics.map(([label])=>label)];
    for(const text of copy)assert.ok(translated.has(text)||inherited.has(text),`${doctype} is missing Arabic for ${text}`);
  }
});
test('Item identifies the product by name before its traceability code', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  const { profiles }=context.window.bunood_theme.simple_forms;
  assert.deepEqual(Array.from(profiles.Item).slice(0,5), ['item_name','item_code','item_group','stock_uom','disabled']);
  assert.match(source,/this\.root\.setAttribute\("data-doctype", frm\.doctype\)/);
  assert.match(scss,/\.bnd-simple-composer\[data-doctype="Item"\] \[data-fieldname="item_name"\][\s\S]*?grid-column:\s*1 \/ -1/);
});
test('POS Profile simple mode includes every field needed for the first save', () => {
  const { compositions }=context.window.bunood_theme.simple_forms;
  assert.deepEqual(Array.from(profiles['POS Profile']), [
    '__newname','company','warehouse','payments','currency','selling_price_list',
    'write_off_account','write_off_cost_center','write_off_limit',
  ]);
  assert.deepEqual(Array.from(compositions['POS Profile'], group => group[0]), [
    'Profile','Payment methods','Currency and write-off defaults',
  ]);
});
test('simple header and composed fields share the document content width', () => {
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  const rule=css.match(/:is\(\.bnd-simple-form-head, \.bnd-simple-actions, \.bnd-simple-composer, \.bnd-task-workbench\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(rule,/max-inline-size: var\(--bnd-content-w\)/);
  assert.match(rule,/margin-inline: auto/);
});
test('composed Simple mode releases the native inspector column', () => {
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  const scope=css.match(/\.page-container\.bnd-composed-simple-active \.layout-main\.layout-two-column \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(scope,/> \.layout-main-section-wrapper \{/);
  assert.match(scope,/flex: 1 1 100%/);
  assert.match(scope,/inline-size: 100%/);
  assert.match(scope,/> \.layout-side-section \{ display: none; \}/);
});
test('Payment Entry keeps the status card and every native section on one edge', () => {
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_body.scss','utf8');
  const rule=css.match(/body:not\(\.full-width\)\[data-route\^="Form\/Payment Entry\/"\] \.form-layout :is\([\s\S]*?\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(css,/\.form-section:has\(\.form-grid\)/);
  assert.match(rule,/max-inline-size: var\(--bnd-content-w\)/);
  assert.match(rule,/margin-inline: auto/);
});

test('Sales Invoice keeps every advanced section and its summary on one wide edge', () => {
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_body.scss','utf8');
  const rule=css.match(/body:not\(\.full-width\)\[data-route\^="Form\/Sales Invoice\/"\] \.form-layout :is\([\s\S]*?\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(css,/\.form-section,[\s\S]*?\.bnd-form-summary/);
  assert.match(rule,/max-inline-size: var\(--bnd-wide-w\)/);
  assert.match(rule,/margin-inline: auto/);
});
test('explicit profiles exclude bold specialist add-ons but retain empty mandatory fields', () => {
  const payment=frm('Payment Entry');
  payment.doc.company='Bunood Demo';
  payment.meta.fields.push(
    {fieldname:'custom_prepayment_invoice', fieldtype:'Check', bold:1},
    {fieldname:'mandatory_extension', fieldtype:'Data', reqd:1},
  );
  payment.fields_dict.mandatory_extension={get_status:()=> 'Write'};
  const selected=fallbackFields(payment);
  assert.equal(selected.has('custom_prepayment_invoice'),false);
  assert.equal(selected.has('mandatory_extension'),true);
});
test('generic simple forms retain native document actions', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  for (const action of ['frappe.new_doc','this.frm.save("Save")','this.frm.savetrash()','this.frm.print_doc()','actions.saveAndSubmit(this.frm)']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for (const action of ['this.frm.copy_doc()','this.frm.savecancel()']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/const contract = api\.document_actions/);
  assert.match(source,/contract\.actionState/);
  assert.match(source,/bnd-document-state/);
  assert.match(source,/bnd-simple-tools-menu/);
  assert.match(source,/api\.document_actions\.decorateAction/);
  assert.doesNotMatch(source,/__\("New"\), "F1"/);
  assert.doesNotMatch(source,/__\("Print"\), "F6"/);
});

test('simple action construction uses the shared document action contract in constructor scope', () => {
  const source = fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8');
  assert.match(source, /return api\.document_actions\.decorateAction\(button, \{ label, key \}\)/);
  assert.doesNotMatch(source, /return contract\.decorateAction/);
});

test('report studio styles are route-scoped and keep illustrations bounded', () => {
  const entry=fs.readFileSync('bunood_theme/public/scss/studio.scss','utf8');
  const build=fs.readFileSync('build.mjs','utf8');
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_studio.scss','utf8');
  assert.match(entry,/@use "surfaces\/studio"/);
  assert.match(build,/key: "bnd-studio", src: "studio\.scss", pyid: "STUDIO_CSS"/);
  assert.match(css,/\.bnd-studio__glyph[\s\S]*?inline-size:/);
  assert.match(css,/\.bnd-studio__glyph[\s\S]*?svg \{[\s\S]*?inline-size:/);
  assert.match(css,/\.bnd-studio__tablewrap \{[\s\S]*?overflow: auto/);
});
test('submitted quotations expose the native Sales Invoice mapping only when permitted', () => {
  context.frappe.boot={user:{can_create:['Sales Invoice']}};
  const quotation={doctype:'Quotation',doc:{docstatus:1,status:'Submitted'}};
  assert.equal(canCreateSalesInvoice(quotation),true);
  for (const status of ['Expired','Lost','Cancelled']) {
    quotation.doc.status=status;
    assert.equal(canCreateSalesInvoice(quotation),false,status);
  }
  quotation.doc.status='Submitted'; quotation.doc.docstatus=0;
  assert.equal(canCreateSalesInvoice(quotation),false);
  quotation.doc.docstatus=1; context.frappe.boot.user.can_create=[];
  assert.equal(canCreateSalesInvoice(quotation),false);
});
test('quotation conversion delegates to ERPNext mapping instead of duplicating document logic', () => {
  const quotation={doctype:'Quotation',doc:{docstatus:1,status:'Submitted'}};
  context.frappe.boot={user:{can_create:['Sales Invoice']}};
  let request;
  context.frappe.model={open_mapped_doc:value => {request=value; return 'mapped';}};
  assert.equal(createSalesInvoice(quotation),'mapped');
  assert.equal(request.method,'erpnext.selling.doctype.quotation.quotation.make_sales_invoice');
  assert.equal(request.frm,quotation);
});
test('the mode switch remounts beside a replaced native layout', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  assert.match(source, /ensureMounted\(\)/);
  assert.match(source, /layout\.before\(this\.header/);
  assert.match(source, /this\.ensureMounted\(\);\s*this\.selected/);
});
test('Stock Entry has a task-focused workbench over native controls', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  assert.match(source, /class StockEntryWorkbench/);
  for (const field of ['stock_entry_type','from_warehouse','to_warehouse','items']) {
    assert.match(source, new RegExp(`this\\.move\\("${field}"`), field);
  }
  assert.match(source, /this\.workbench\?\.refresh\(true, this\.selected\)/);
  assert.match(source, /restore\(\)/);
});
test('Delivery Note has its own three-step workbench and scoped active state', () => {
  const source=fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8');
  assert.match(source, /class DeliveryNoteWorkbench/);
  for (const field of ['customer','set_warehouse','items']) {
    assert.match(source, new RegExp(`this\\.move\\("${field}"`), field);
  }
  assert.match(source, /\[__\("Customer"\), __\("Fulfilment"\), __\("Items"\)\]/);
  assert.match(source, /bnd-delivery-simple-active/);
  assert.match(source, /bnd-stock-simple-active", active && this\.frm\.doctype === "Stock Entry"/);
});
test('BOM compatibility passes the current document when ERPNext omits it', () => {
  class BomController {}
  BomController.prototype.plc_conversion_rate=function(doc) { return doc.rm_cost_as_per; };
  context.window.erpnext.bom.BomController=BomController;
  const controller=new BomController();
  controller.frm={doc:{rm_cost_as_per:'Valuation Rate'}};
  assert.equal(controller.plc_conversion_rate(), 'Valuation Rate');
  assert.equal(controller.plc_conversion_rate({rm_cost_as_per:'Price List'}), 'Price List');
});
test('legacy ERPNext client permission calls use Frappe perm argument order', () => {
  assert.deepEqual(
    Array.from(context.frappe.has_permission('Price List', 'read', 'Standard Buying')),
    ['Price List', 0, 'read', undefined]
  );
});
