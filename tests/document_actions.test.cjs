const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const created = [];
const context = {
  window: { bunood_theme: {} },
  __: (label, args = []) => label.replace('{0}', args[0] || ''),
  document: { createElement(tag) { const node = { tag, className: '', textContent: '', attrs: {}, children: [], append(...xs) { this.children.push(...xs); }, setAttribute(k, v) { this.attrs[k] = v; } }; created.push(node); return node; } },
  frappe: { utils: { icon: name => `<svg data-icon="${name}"></svg>` } },
};
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/document_actions.js', 'utf8'), context);
const { actionState, canSaveAndSubmit, saveAndSubmit, submitWithoutConfirmation, documentState, decorateAction } = context.window.bunood_theme.document_actions;

function form(doctype, doc, { dirty = false, permissions = {}, submittable = true } = {}) {
  return {
    doctype,
    doc: { doctype, ...doc },
    meta: { is_submittable: submittable },
    perm: [{ create: 1, write: 1, submit: 1, delete: 1, cancel: 1, ...permissions }],
    is_dirty: () => dirty,
  };
}

test('shared document states use native lifecycle and settlement values', () => {
  const state = frm => JSON.parse(JSON.stringify(documentState(frm)));
  assert.deepEqual(state(form('Quotation', { docstatus: 0, status: 'Open' })), { label: 'Draft', tone: 'neutral' });
  assert.deepEqual(state(form('Quotation', { docstatus: 1, status: 'Open' })), { label: 'Open', tone: 'info' });
  assert.deepEqual(state(form('Quotation', { docstatus: 1, status: 'Lost' })), { label: 'Lost', tone: 'danger' });
  assert.deepEqual(state(form('Sales Invoice', { docstatus: 1, status: 'Overdue', outstanding_amount: 80 })), { label: 'Overdue', tone: 'danger' });
  assert.deepEqual(state(form('Sales Invoice', { docstatus: 1, paid_amount: 20, outstanding_amount: 80 })), { label: 'Partially paid', tone: 'warning' });
  assert.deepEqual(state(form('Sales Invoice', { docstatus: 1, outstanding_amount: 0 })), { label: 'Paid', tone: 'success' });
  assert.deepEqual(state(form('Payment Entry', { docstatus: 2 })), { label: 'Cancelled', tone: 'cancelled' });
});

test('one primary action follows document state without bypassing native permissions', () => {
  let state = actionState(form('Quotation', { docstatus: 0, __islocal: 1 }));
  assert.equal(state.primary, 'save');
  assert.equal(state.showSubmit, false);

  state = actionState(form('Quotation', { docstatus: 0, __islocal: 0 }));
  assert.equal(state.primary, 'submit');
  assert.equal(state.showSave, false);

  state = actionState(form('Quotation', { docstatus: 1 }, { permissions: { cancel: 0 } }), { canCreateInvoice: true });
  assert.equal(state.primary, 'create-invoice');
  assert.equal(state.showCancel, false);

  state = actionState(form('Sales Invoice', { docstatus: 1, outstanding_amount: 115 }), { canRecordPayment: true });
  assert.equal(state.primary, 'record-payment');
  assert.equal(state.showRecordPayment, true);

  state = actionState(form('Sales Invoice', { docstatus: 1, outstanding_amount: 0 }), { canRecordPayment: true });
  assert.equal(state.showRecordPayment, false);

  state = actionState(form('Payment Entry', { docstatus: 1 }));
  assert.equal(state.primary, 'print');
});

test('secondary actions are permission and lifecycle aware', () => {
  const draft = actionState(form('Quotation', { docstatus: 0, __islocal: 0 }, { permissions: { delete: 0, create: 0 } }));
  assert.equal(draft.showDelete, false);
  assert.equal(draft.showDuplicate, false);
  assert.equal(draft.showNew, false);

  const submitted = actionState(form('Payment Entry', { docstatus: 1 }, { permissions: { cancel: 1, create: 1 } }));
  assert.equal(submitted.showCancel, true);
  assert.equal(submitted.showDuplicate, true);
  assert.equal(submitted.showPrint, true);
});

test('one shared action decorator omits empty shortcut badges and keeps icons decorative', () => {
  const button = { children: [], attrs: {}, append(...xs) { this.children.push(...xs); }, setAttribute(k, v) { this.attrs[k] = v; } };
  decorateAction(button, { label: 'Duplicate', key: '', icon: 'copy' });
  assert.deepEqual(button.children.map(node => node.tag), ['span', 'span']);
  assert.equal(button.attrs['aria-keyshortcuts'], undefined);
  assert.equal(button.children[0].attrs['aria-hidden'], 'true');

  const keyed = { children: [], attrs: {}, append(...xs) { this.children.push(...xs); }, setAttribute(k, v) { this.attrs[k] = v; } };
  decorateAction(keyed, { label: 'Save', key: 'F2' });
  assert.deepEqual(keyed.children.map(node => node.tag), ['span', 'kbd']);
  assert.equal(keyed.attrs['aria-keyshortcuts'], 'F2');
});

test('one-step commit saves a new draft before accepting only native submit confirmation', async () => {
  const calls = [];
  const frm = form('Quotation', { docstatus: 0, __islocal: 1 });
  frm.docname = 'new-quotation';
  frm.is_dirty = () => !!frm.doc.__islocal;
  frm.save = async action => {
    calls.push(action);
    frm.doc.__islocal = 0;
    frm.docname = 'QTN-0001';
  };
  frm.savesubmit = () => {
    calls.push('savesubmit');
    return new Promise(resolve => context.frappe.confirm('Permanently Submit QTN-0001?', () => {
      calls.push('accepted'); frm.doc.docstatus = 1; resolve();
    }));
  };
  context.frappe.ui = { form: { check_mandatory: () => true } };
  context.frappe.after_ajax = async () => {};
  const nativeConfirm = context.frappe.confirm = () => calls.push('unexpected confirmation');
  assert.equal(canSaveAndSubmit(frm), true);
  await saveAndSubmit(frm);
  assert.deepEqual(calls, ['Save', 'savesubmit', 'accepted']);
  assert.equal(context.frappe.confirm, nativeConfirm);
  assert.equal(frm.doc.docstatus, 1);
});

test('failed or forbidden drafts never enter native submit', async () => {
  const frm = form('Quotation', { docstatus: 0, __islocal: 1 });
  let submitted = 0;
  frm.is_dirty = () => true;
  frm.save = async () => {};
  frm.savesubmit = () => { submitted++; };
  context.frappe.ui.form.check_mandatory = () => false;
  assert.equal(await saveAndSubmit(frm), false);
  assert.equal(submitted, 0);
  context.frappe.ui.form.check_mandatory = () => true;
  assert.equal(await saveAndSubmit(frm), false);
  assert.equal(submitted, 0);
  frm.perm[0].submit = 0;
  assert.equal(canSaveAndSubmit(frm), false);
  assert.equal(await saveAndSubmit(frm), false);
});

test('unrelated confirmation is not silently accepted', async () => {
  const calls = [];
  context.frappe.confirm = message => { calls.push(message); };
  const frm = { docname: 'QTN-0002', savesubmit: () => context.frappe.confirm('Review tax treatment?', () => calls.push('accepted')) };
  await submitWithoutConfirmation(frm);
  assert.deepEqual(calls, ['Review tax treatment?']);
});

test('native form action bar is sticky and stands down for Simple workbenches', () => {
  const desk = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
  const formCss = fs.readFileSync('bunood_theme/public/scss/surfaces/_form.scss', 'utf8');
  assert.match(desk, /function mount_docbar\(frm\)/);
  assert.match(desk, /mount_docbar\(frm\);\s*mount_docfoot\(frm\)/);
  assert.match(desk, /docfoot_wanted\(\) && docbar_wanted\(frm\) && !page\.querySelector\("\.bnd-form-actionbar"\)/);
  assert.match(desk, /bnd-bill-simple-active/);
  assert.match(desk, /bnd-composed-simple-active/);
  assert.match(formCss, /\.bnd-form-actionbar \{[\s\S]*?position: sticky/);
  assert.match(formCss, /data-bnd-own~="docbar"[\s\S]*?\.page-actions \.primary-action \{ display: none; \}/);
  // .main-section already reserves the topbar height. A second topbar offset
  // leaves scrolling form content visible between the page head and action bar.
  assert.doesNotMatch(formCss, /data-bnd-topbar[^\n]*\.bnd-form-actionbar[\s\S]*?inset-block-start: calc\(var\(--bnd-topbar-h\) \+ var\(--page-head-height\)\)/);
});
