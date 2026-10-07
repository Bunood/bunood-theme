const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {}; this.disabled = false; this.hidden = false; }
  get isConnected() { return this === documentRoot || !!this.parentNode?.isConnected; }
  detach() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  append(...nodes) { for (const node of nodes) { node.detach(); node.parentNode = this; this.children.push(node); } }
  before(...nodes) { const parent = this.parentNode; assert.ok(parent, 'native control must have a parent'); for (const node of nodes) { node.detach(); const index = parent.children.indexOf(this); node.parentNode = parent; parent.children.splice(index, 0, node); } }
  replaceWith(node) { this.before(node); this.detach(); }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener() {}
  classList = { add() {} };
}
const documentRoot = new Node('document');
const context = {
  window: { bunood_theme: {} },
  document: { createElement: tag => new Node(tag), createComment: () => new Node('#comment'), addEventListener() {} },
  frappe: { after_ajax: async () => {}, format: value => String(value) },
  $: () => ({ on() {} }), __: value => value, setTimeout,
};
context.window.frappe = context.frappe;
const source = fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8');
// Expose the private stock constructor in this isolated VM for native-control
// restoration checks; its body and the production registry are unchanged.
assert.equal(source.split('api.simple_forms = { mount,').length, 2);
vm.runInNewContext(source.replace('api.simple_forms = { mount,', 'api.simple_forms = { StockEntryWorkbench, mount,'), context);
const api = context.window.bunood_theme.simple_forms;
const restored = [
  ['Stock Entry', 'Stock'], ['Stock Reconciliation', 'Stock'], ['Expense Claim', 'HR'],
  ['Company', 'Setup'], ['Property', 'Real Estate'], ['Real Estate Unit', 'Real Estate'],
  ['Lease', 'Real Estate'], ['POS Profile', 'Accounts'], ['Warehouse', 'Stock'],
];
function form(doctype, module) {
  return { doctype, doc: { doctype }, meta: { name: doctype, module, fields: [] }, fields_dict: {} };
}

for (const [doctype, module] of restored) test(`${doctype}: the completed team interface is reachable`, () => {
  assert.equal(api.candidate(form(doctype, module)), true);
});

test('framework, invoices and incomplete workbenches keep their original native interface', () => {
  for (const doctype of ['Sales Invoice', 'Purchase Invoice', 'BOM', 'Work Order', 'Job Card', 'Project', 'Task', 'Timesheet', 'Asset', 'Unknown Order']) {
    assert.equal(api.candidate(form(doctype, 'Custom')), false, doctype);
  }
  for (const module of ['Core', 'Desk', 'Email', 'Website', 'Printing', 'Workflow', 'Automation']) {
    assert.equal(api.candidate(form('Company', module)), false, module);
  }
  for (const override of [{ istable: 1 }, { issingle: 1 }]) {
    const frm = form('Company', 'Setup'); Object.assign(frm.meta, override);
    assert.equal(api.candidate(frm), false);
  }
  assert.equal(api.candidate(null), false);
  assert.equal(api.candidate({ doctype: 'Company' }), false);
});

for (const [doctype, module] of restored) {
  test(`${doctype}: Simple and Advanced preserve original fields, handlers and readonly state`, () => {
    const frm = form(doctype, module), native = new Node('native-layout');
    documentRoot.append(native);
    const names = [...api.profiles[doctype], 'required_extension'];
    const originals = [], originalState = new Map();
    const calculated = { 'Stock Entry': ['total_outgoing_value', 'total_incoming_value', 'value_difference'], 'Stock Reconciliation': ['difference_amount'], 'Expense Claim': ['total_claimed_amount', 'total_sanctioned_amount'] }[doctype] || [];
    for (const name of names) {
      const node = new Node('native-field'); node.name = name;
      node.nativeHandler = () => name; node.disabled = name === names[1] || calculated.includes(name);
      node.hidden = name === names[2]; native.append(node); originals.push(node);
      originalState.set(node, { disabled: node.disabled, hidden: node.hidden });
      frm.doc[name] = calculated.includes(name) ? 147 : undefined;
      frm.fields_dict[name] = { $wrapper: [node], df: { fieldname: name, read_only: calculated.includes(name) }, get_status: () => node.disabled ? 'Read' : 'Write' };
    }
    frm.meta.fields.push({ fieldname: 'required_extension', reqd: 1 });
    const bench = doctype === 'Stock Entry' ? new api.StockEntryWorkbench(frm) : api.compositions[doctype]
      ? new api.GroupedWorkbench(frm, api.compositions[doctype])
      : new api.TaskWorkbench(frm, api.taskWorkbenches[doctype]);
    documentRoot.append(bench.root);
    const selected = api.fallbackFields(frm);
    bench.refresh(true, selected);
    for (const node of originals) {
      assert.equal(frm.fields_dict[node.name].$wrapper[0], node);
      assert.equal(node.nativeHandler(), node.name);
      assert.equal(node.disabled, originalState.get(node).disabled);
      assert.equal(node.hidden, originalState.get(node).hidden);
      if (selected.has(node.name) && !calculated.includes(node.name)) assert.notEqual(node.parentNode, native, `${node.name} must be reachable in the composer`);
    }
    for (const [index, fieldname] of calculated.entries()) assert.equal(doctype === 'Stock Entry' ? bench.metricNodes[index].innerHTML : bench.metricNodes.find(row => row.fieldname === fieldname).node.innerHTML, '147', 'the readonly native calculation is visible in the outcome');
    if (doctype === 'Stock Entry') assert.equal(bench.details.open, true, 'empty mandatory extensions must not hide inside a closed disclosure');
    else {
      assert.equal(bench.required.hidden, false, 'an empty mandatory native extension must remain reachable');
      if (api.taskWorkbenches[doctype]) assert.equal(bench.required.open, true, 'empty mandatory extensions must not hide inside a closed disclosure');
    }
    bench.refresh(false, selected);
    assert.deepEqual(native.children, originals, 'Advanced restores the exact native field order and objects');
    assert.equal(bench.root.hidden, true);
    native.detach(); bench.root.detach();
  });
}
