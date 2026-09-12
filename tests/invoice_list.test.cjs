const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const cases = [
  ['Sales Invoice', 'customer_name', 'sales_invoice_list.js'],
  ['Purchase Invoice', 'supplier_name', 'purchase_invoice_list.js'],
];

test('invoice list scripts are registered through Frappe doctype hooks', () => {
  const hooks = fs.readFileSync('bunood_theme/hooks.py', 'utf8');
  assert.match(hooks, /doctype_list_js\s*=\s*\{/);
  for (const [doctype,, file] of cases) {
    assert.match(hooks, new RegExp(`"${doctype}": "public/js/${file}"`));
  }
});

for (const [doctype, titleField, file] of cases) {
  test(`${doctype} list prioritises total and ID while preserving native actions and saved layouts`, () => {
    let nativeCalls = 0, nativeBeforeCalls = 0;
    const receiver = {};
    const settings = {
      onload(listview) {
        nativeCalls++;
        assert.equal(this, receiver);
        assert.equal(listview.doctype, doctype);
        return 'native-result';
      },
      before_render() {
        nativeBeforeCalls++;
        assert.equal(this, receiver);
        return 'native-before-result';
      },
    };
    const context = {frappe: {listview_settings: {[doctype]: settings}}};
    vm.runInNewContext(fs.readFileSync(`bunood_theme/public/js/${file}`, 'utf8'), context);

    const defaultColumns = () => [
      {type:'Subject',df:{fieldname:titleField}},
      {type:'Tag'},
      {type:'Status'},
      {type:'Field',df:{fieldname:'posting_date'}},
      {type:'Field',df:{fieldname:'due_date'}},
      {type:'Field',df:{fieldname:'grand_total'}},
      {type:'Field',df:{fieldname:'name'}},
    ];
    const listview = {
      doctype,
      meta: {title_field: titleField},
      list_view_settings: {},
      list_filter: {active_layout_name: 'default_layout'},
      columns: defaultColumns(),
    };
    const result = settings.onload.call(receiver, listview);
    assert.equal(result, 'native-result');
    assert.equal(nativeCalls, 1);
    assert.equal(listview.columns[3].df.fieldname, 'posting_date', 'column priority waits until Frappe restores the active layout');
    assert.equal(settings.before_render.call(receiver), 'native-before-result');
    assert.equal(nativeBeforeCalls, 1);
    assert.deepEqual(Array.from(listview.columns, column => column.type), ['Subject','Tag','Status','Field','Field','Field','Field']);
    assert.equal(listview.columns[3].df.fieldname, 'grand_total');
    assert.equal(listview.columns[4].df.fieldname, 'name');

    listview.columns = defaultColumns();
    listview.list_view_settings.fields = '[{"fieldname":"posting_date"}]';
    settings.before_render.call(receiver);
    assert.equal(listview.columns[3].df.fieldname, 'posting_date', 'saved user column settings must win');
  });
}
