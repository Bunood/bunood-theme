const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
const simple = fs.readFileSync('bunood_theme/public/js/simple_forms.js', 'utf8');
const bill = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');

test('new and saved transaction forms have a bounded, fail-open first-paint guard', () => {
  assert.match(css, /\[data-route\^="Form\/Sales Invoice\/"\]/);
  assert.match(css, /\[data-route\^="Form\/Purchase Invoice\/"\]/);
  assert.match(css, /:not\(\.bnd-bill-native-ready\) \.form-layout/);
  assert.match(bill, /setTimeout\(\(\) => page\?\.classList\.add\("bnd-bill-native-ready"\), 8000\)/);
  assert.match(simple, /setTimeout\(\(\) => page\?\.classList\.add\("bnd-simple-native-ready"\), 6000\)/);
  assert.match(simple, /toggleClass\("bnd-simple-native-ready", !active\)/);
});

test('purpose-built forms mount before unrelated desk AJAX settles', () => {
  const immediate = simple.indexOf('try { mount(frm); }', simple.indexOf('form-refresh.bnd-simple-forms'));
  const deferred = simple.indexOf('frappe.after_ajax().then', simple.indexOf('form-refresh.bnd-simple-forms'));
  assert.ok(immediate >= 0 && deferred > immediate);
  const open = bill.indexOf('if (instances.has(frm)) instances.get(frm).render(); else open(frm);');
  const precision = bill.indexOf('await ensureExactHalalas(frm);', open);
  assert.ok(open >= 0 && precision > open);
});

test('compact invoice actions retain accessible names and cannot create root overflow', () => {
  assert.match(css, /\.bnd-bill-line-total \{\s*grid-column: 8;\s*display: flex;/);
  assert.match(css, /\.bnd-bill-action-submit-print \.bnd-bill-action-label,/);
  assert.match(bill, /printButton\.setAttribute\("aria-label", __\("Print"\)\)/);
  assert.match(bill, /submitPrintButton\.setAttribute\("aria-label", __\("Save, submit and print"\)\)/);
});
