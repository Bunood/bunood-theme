const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {
  window: { bunood_theme: {} },
  document: {},
  frappe: { after_ajax: async () => {} },
  $: () => ({ on() {} }),
  __: s => s,
  setTimeout,
};
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8'), context);
const { eligible, SerialChanges, saveDraft, totalField, canAdd, canRemove } = context.window.bunood_theme.sales_bill;
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
