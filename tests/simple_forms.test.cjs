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
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8'), context);
const { candidate, fallbackFields, profiles } = context.window.bunood_theme.simple_forms;
function frm(doctype, module='Stock') {
  return { doctype, doc: { doctype }, meta: { name: doctype, module, fields: [
    {fieldname:'company', reqd:1}, {fieldname:'posting_date', bold:1},
    {fieldname:'internal_note'}, {fieldname:'items', fieldtype:'Table'},
  ]}, fields_dict: {} };
}
test('business forms default to simple mode while framework internals do not', () => {
  assert.equal(candidate(frm('Stock Entry')), true);
  assert.equal(candidate(frm('Custom Vertical Order', 'Custom')), true);
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
  for (const action of ['frappe.new_doc','this.frm.save("Save")','this.frm.savetrash()','this.frm.print_doc()','this.frm.savesubmit()']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
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
  assert.match(source, /this\.workbench\?\.refresh\(this\.simple\)/);
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
  assert.match(source, /bnd-stock-simple-active", this\.simple && this\.frm\.doctype === "Stock Entry"/);
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
