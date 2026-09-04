const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {
  window: { bunood_theme: {} },
  document: {},
  frappe: { after_ajax: async () => {} },
  $: () => ({ on() {} }),
  __: (s, args = []) => args.reduce((text, value, index) => text.replace(`{${index}}`, value), s),
  setTimeout,
};
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8'), context);
const { eligible, actionState, SerialChanges, saveDraft, totalField, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage } = context.window.bunood_theme.sales_bill;
function form(extra = {}) {
  return { doctype: 'Sales Invoice', doc: { docstatus: 0, items: [], ...extra },
    perm: [{ write: 1, create: 1 }], save_disabled: false,
    fields_dict: { customer: { get_status: () => 'Write' }, items: { get_status: () => 'Write', grid: { is_editable: () => true, df: {} } } } };
}
test('quick bill excludes posted, return, POS, mapped and restricted invoices', () => {
  assert.equal(eligible(form()), true);
  for (const extra of [{docstatus:1},{is_return:1},{is_pos:1},{amended_from:'INV'},{is_debit_note:1},{items:[{sales_order:'SO-1'}]}]) assert.equal(eligible(form(extra)), false);
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
  assert.equal(context.window.bunood_theme.sales_bill.supports(f), false);
});
test('the default bill workbench is inline and exposes native actions', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.doesNotMatch(source,/new frappe\.ui\.Dialog/);
  for (const action of ['frm.savesubmit()','frm.savetrash()','frm.print_doc()','open_mapped_doc','frappe.ui.Scanner']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('sales invoices expose the credential-free Bunood ZATCA facade', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source,/bunood_theme\.zatca\.get_status/);
  assert.match(source,/bunood_theme\.zatca\.queue_invoice/);
  assert.match(source,/Sales Invoice Additional Fields/);
  assert.doesNotMatch(source,/production_security_token|production_secret|security_token/);
});
test('a clean saved draft replaces Save with Submit until it is edited', () => {
  const state = (doc, dirty) => JSON.parse(JSON.stringify(actionState(doc, dirty)));
  assert.deepEqual(state({docstatus:0,__islocal:1}, false), {draft:true,savedDraft:false,showSave:true,showSubmit:false});
  assert.deepEqual(state({docstatus:0,__islocal:0}, false), {draft:true,savedDraft:true,showSave:false,showSubmit:true});
  assert.deepEqual(state({docstatus:0,__islocal:0}, true), {draft:true,savedDraft:false,showSave:true,showSubmit:false});
  assert.deepEqual(state({docstatus:1,__islocal:0}, false), {draft:false,savedDraft:false,showSave:false,showSubmit:false});
});
test('zero rounded total is retained and disabled rounding uses grand total', () => {
  const f = form({grand_total:0.2, rounded_total:0}); f.fields_dict.rounded_total = {};
  assert.equal(totalField(f), 'rounded_total');
  f.doc.disable_rounded_total=1; assert.equal(totalField(f), 'grand_total');
  f.doc.disable_rounded_total='0'; assert.equal(totalField(f), 'rounded_total');
});
test('native grid add and delete restrictions are respected', () => {
  const f = form(); assert.equal(canAdd(f), true); assert.equal(canRemove(f), true);
  f.fields_dict.items.grid.df.cannot_add_rows=1; assert.equal(canAdd(f), false);
  f.fields_dict.items.grid.df.cannot_delete_rows=1; assert.equal(canRemove(f), false);
  f.fields_dict.items.grid.df={}; f.fields_dict.items.grid.cannot_add_rows=true;
  assert.equal(canAdd(f), false);
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
test('the Remove action gets its own row so item identity aligns with field controls', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source, /button\(__\("Remove"\), view\.line,/);
  assert.match(source, /bnd-bill-item-label/);
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
