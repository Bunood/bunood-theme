const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const root = path.join(__dirname, '..');
const nativeSource = fs.readFileSync(path.join(__dirname, 'fixtures/frappe-breadcrumbs-v16.js'), 'utf8').replace(/\r\n/g, '\n');
const theme = fs.readFileSync(path.join(root, 'bunood_theme/public/js/bunood.js'), 'utf8');
const start = theme.indexOf('\tfunction install_breadcrumb_context_fallback(');
const end = theme.indexOf('\n\tfunction decorate_crumbs(', start);
// Without the candidate, exercise the actual unmodified native behavior: the
// six regression cases must fail on the missing workspace link, not a mock.
let active = true;
const install = start < 0 ? () => {} : vm.runInNewContext('(' + theme.slice(start, end).trim() + ')', {theme_active: () => active});

function fixture({doctype = 'Delivery Note', module = 'Stock', origin = ['Workspaces', 'Selling'],
  workspace, hints = ['Stock'], modules = {Stock: ['Stock']}, preference, preferred = {},
  moduleMap = {}, blocked = false, visible = ['Stock'], icon = true} = {}) {
  const links = [];
  const history = [['List', 'Previous'], origin, ['List', doctype, 'List']];
  const frappe = {route_history: history, boot: {module_wise_workspaces: modules},
    get_meta: () => ({__workspaces: hints}), get_module: name => ({module: name, blocked}),
    visible_modules: visible, app: {sidebar: {sidebar_title: 'Native sidebar'}},
    utils: {get_desktop_icon_by_label: label => ({label}),
      get_route_for_icon: () => icon ? '/desk/native-sidebar' : null}};
  vm.runInNewContext(nativeSource, {frappe, __: x => x});
  const native = frappe.breadcrumbs;
  Object.assign(native, {preferred, module_map: moduleMap, get_doctype_module: () => preference,
    $breadcrumbs: {find: () => ({parent: () => ({addClass() {}})})},
    append_breadcrumb_element: (url, label, kind) => links.push({url, label, kind})});
  const context = {doctype, module, ...(workspace ? {workspace} : {})};
  return {native, context, links, history};
}
const cases = [
  ['Selling', 'Delivery Note', 'Stock'], ['Selling', 'Sales Invoice', 'Accounts'],
  ['Selling', 'Payment Entry', 'Accounts'], ['Buying', 'Purchase Receipt', 'Stock'],
  ['Buying', 'Purchase Invoice', 'Accounts'], ['Buying', 'Payment Entry', 'Accounts'],
];
for (const [from, doctype, module] of cases) test(`${from} → ${doctype} uses native fallback`, () => {
  const f = fixture({doctype, module, origin: ['Workspaces', from], hints: [module],
    modules: {[module]: [module]}, visible: [module]});
  const before = JSON.stringify(f.history);
  install(f.native);
  f.native.set_workspace_breadcrumb(f.context);
  assert.equal(f.links.length, 1, 'workspace breadcrumb is absent');
  assert.equal(f.links[0].url, '/desk/native-sidebar');
  assert.equal(f.context.workspace, module);
  assert.equal(JSON.stringify(f.history), before, 'route history mutated');
  assert.equal(Object.hasOwn(f.native, 'last_route'), true);
  assert.equal(typeof Object.getOwnPropertyDescriptor(f.native, 'last_route').get, 'function');
});

test('all fallback outcomes retain native metadata, preference and visibility semantics', () => {
  for (let flags = 0; flags < 256; flags++) {
    const bit = n => !!(flags & (1 << n));
    const opts = {hints: bit(0) ? ['Hint'] : [], modules: bit(1) ? {Stock: ['Stock'], Settings: ['Settings']} : {},
      module: bit(2) ? 'Core' : 'Stock', moduleMap: {Core: 'Settings'},
      preference: bit(3) ? 'Stock' : undefined, preferred: bit(4) ? {'Delivery Note': ''} : {},
      blocked: bit(5), visible: bit(6) ? ['Stock', 'Settings'] : [], icon: bit(7)};
    const actual = fixture(opts), expected = fixture({...opts, origin: ['List', 'Other']});
    install(actual.native);
    actual.native.set_workspace_breadcrumb(actual.context);
    expected.native.set_workspace_breadcrumb(expected.context);
    assert.deepEqual(actual.context, expected.context, `native context parity ${flags}`);
    assert.deepEqual(actual.links, expected.links, `native renderer parity ${flags}`);
  }
});

test('unaffected paths and explicit context remain native', () => {
  for (const opts of [{origin: ['Workspaces', 'Stock']}, {origin: ['List', 'Other']},
    {origin: null}, {workspace: 'Existing'}, {hints: [], modules: {}, module: null}]) {
    const actual = fixture(opts), expected = fixture(opts);
    install(actual.native);
    actual.native.set_workspace_breadcrumb(actual.context);
    expected.native.set_workspace_breadcrumb(expected.context);
    assert.deepEqual(actual.context, expected.context);
    assert.deepEqual(actual.links, expected.links);
  }
});

test('installation is guarded, idempotent and connected to theme mount', () => {
  assert(start >= 0 && end > start, 'theme wrapper missing');
  assert.match(theme, /install_breadcrumb_context_fallback\(frappe\.breadcrumbs\);/);
  const f = fixture();
  install(f.native);
  const once = f.native.set_workspace;
  install(f.native);
  assert.equal(f.native.set_workspace, once);
  assert.doesNotThrow(() => install(undefined));
  assert.doesNotThrow(() => install({}));
  const external = function () {};
  f.native.set_workspace = external;
  install(f.native);
  assert.equal(f.native.set_workspace, external, 'external wrapper replaced');
});

test('disabled theme delegates without fallback and can reactivate', () => {
  const f = fixture();
  install(f.native);
  active = false;
  try { f.native.set_workspace_breadcrumb(f.context); } finally { active = true; }
  assert.equal(f.links.length, 0);
  f.native.set_workspace_breadcrumb(f.context);
  assert.equal(f.links.length, 1);
});

test('native returns and exceptions propagate', () => {
  const sentinel = {};
  const f = {set_workspace() { return sentinel; }};
  install(f);
  assert.equal(f.set_workspace({}), sentinel);
  const error = new Error('native failure');
  const broken = {set_workspace() { throw error; }};
  install(broken);
  assert.throws(() => broken.set_workspace({}), e => e === error);
});

test('native fixture is covered by the upstream fingerprint', () => {
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'bunood_theme/data/upstream-pins.json')));
  const key = 'frappe:frappe/public/js/frappe/views/breadcrumbs.js';
  assert.equal(crypto.createHash('sha256').update(nativeSource).digest('hex'), pins.files[key]);
  assert.match(fs.readFileSync(path.join(root, 'bunood_theme/upstream.py'), 'utf8'), /frappe\/public\/js\/frappe\/views\/breadcrumbs\.js/);
});
