const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../bunood_theme/public/js/bunood.js'), 'utf8');
const start = source.indexOf('\tlet sb_badges_at =');
const end = source.indexOf('\n\t/** Free-pixel drag', start);
assert.ok(start >= 0 && end > start, 'sidebar badge implementation is present');
const badgeSource = source.slice(start, end);

function sidebarLink(label, linkType, linkTo, connected = true) {
  const anchor = {
    badges: [],
    querySelector(selector) {
      return selector === '.bnd-sb-badge' ? this.badges[0] : null;
    },
    appendChild(badge) { this.badges.push(badge); },
  };
  const node = {
    isConnected: connected,
    closest(selector) { return selector === '.body-sidebar-top' ? this : null; },
    querySelector(selector) { return selector === '.item-anchor' ? anchor : null; },
  };
  return {
    item: { type: 'Link', label, link_type: linkType, link_to: linkTo },
    wrapper: [node],
    node,
    anchor,
  };
}

function badgeHarness(instances) {
  const calls = [];
  const frappe = {
    app: { sidebar: { items: instances } },
    xcall(method, args) {
      calls.push({ method, labels: Array.from(args.labels) });
      return Promise.resolve({ Quotation: 4, 'Sales Invoice': 23 });
    },
  };
  const context = {
    window: { frappe }, frappe,
    document: { documentElement: { getAttribute: () => 'counts' } },
    el: (tag, className) => ({ tag, className, textContent: '' }),
    sb_update_rollups() {},
  };
  const badgeApi = vm.runInNewContext(badgeSource + '\n({sb_badge_links, sb_mount_badges})', context);
  return { ...badgeApi, calls, frappe };
}

test('Arabic labels receive counts using stable DocType targets, not translated text', async () => {
  const quote = sidebarLink('عرض أسعار', 'DocType', 'Quotation');
  const invoice = sidebarLink('فاتورة مبيعات', 'DocType', 'Sales Invoice');
  const workspace = sidebarLink('الصفحة الرئيسية', 'Workspace', 'Selling');
  const stale = sidebarLink('عرض أسعار', 'DocType', 'Quotation', false);
  const section = { item: { type: 'Section Break' }, wrapper: [{}], items: [quote, invoice, workspace] };
  const harness = badgeHarness([section, stale]);

  harness.sb_mount_badges();
  await new Promise(setImmediate);

  assert.deepEqual(harness.calls, [{
    method: 'bunood_theme.api.get_sidebar_counts',
    labels: ['Quotation', 'Sales Invoice'],
  }]);
  assert.equal(quote.anchor.badges[0].textContent, '4');
  assert.equal(invoice.anchor.badges[0].textContent, '23');
  assert.equal(workspace.anchor.badges.length, 0);
  assert.equal(stale.anchor.badges.length, 0);
});

test('a translated sidebar rebuild refetches even when DocType targets are unchanged', async () => {
  const first = sidebarLink('Quotation', 'DocType', 'Quotation');
  const harness = badgeHarness([first]);
  harness.sb_mount_badges();
  await new Promise(setImmediate);
  harness.sb_mount_badges();
  assert.equal(harness.calls.length, 1, 'unchanged nodes are throttled');

  first.node.isConnected = false;
  const rebuilt = sidebarLink('عرض أسعار', 'DocType', 'Quotation');
  harness.frappe.app.sidebar.items = [rebuilt];
  harness.sb_mount_badges();
  await new Promise(setImmediate);
  assert.equal(harness.calls.length, 2, 'new nodes trigger a fresh count request');
  assert.equal(rebuilt.anchor.badges[0].textContent, '4');
});
