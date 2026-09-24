const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Warehouse and Country explain native constraints without replacing them', () => {
  const source = fs.readFileSync('bunood_theme/public/js/reference_field_guidance.js', 'utf8');
  const hooks = fs.readFileSync('bunood_theme/hooks.py', 'utf8');
  const handlers = {};
  const context = {
    window: { frappe: { ui: { form: {} } } },
    frappe: { ui: { form: { on: (doctype, events) => { handlers[doctype] = events; } } } },
    __: value => value,
  };
  vm.runInNewContext(source, context);
  assert.match(hooks, /"Warehouse": "public\/js\/reference_field_guidance\.js"/);
  assert.match(hooks, /"Country": "public\/js\/reference_field_guidance\.js"/);
  for (const [doctype, fieldname, clue] of [
    ['Warehouse', 'account', 'non-group Stock accounts'],
    ['Country', 'code', 'two-letter ISO country code'],
  ]) {
    const calls = [];
    handlers[doctype].refresh({ fields_dict: { [fieldname]: {} }, set_df_property: (...args) => calls.push(args) });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 2), [fieldname, 'description']);
    assert.match(calls[0][2], new RegExp(clue));
  }
  assert.doesNotMatch(source, /set_query|validate|before_save|frappe\.call/);
});
