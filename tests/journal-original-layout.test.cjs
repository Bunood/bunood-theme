const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('owned compact journal layout also applies with the Original appearance', () => {
  const css = fs.readFileSync(path.join(__dirname, '../bunood_theme/public/scss/surfaces/_journal_compact.scss'), 'utf8');
  assert.doesNotMatch(css, /html\.bunood\[data-theme\]/, 'Original appearance has no html.bunood class');
  assert.match(css, /html\[data-theme\]/);
  assert.match(css, /\.bnd-task-panel-voucher\s*>\s*\.bnd-task-panel-fields/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
});

test('invoice details collapse independently of the aligned party and date fields', () => {
  const css = fs.readFileSync(path.join(__dirname, '../bunood_theme/public/scss/surfaces/_sales_bill.scss'), 'utf8');
  assert.match(css, /\.bnd-bill-party > \.bnd-bill-essentials\s*\{[^}]*display: flex;[^}]*align-items: flex-end;/);
  assert.match(css, /\.bnd-bill-more-fields\s*\{[^}]*display: none/);
  assert.match(css, /\.bnd-bill-party\.is-open > \.bnd-bill-more-fields\s*\{[^}]*display: block/);
});

test('team invoice composition is built using shared theme tokens', () => {
  const root = path.join(__dirname, '../bunood_theme/public/scss');
  assert.match(fs.readFileSync(path.join(root, 'bunood.scss'), 'utf8'), /@use "surfaces\/invoice_team_design"/);
  const css = fs.readFileSync(path.join(root, 'surfaces/_invoice_team_design.scss'), 'utf8');
  assert.match(css, /background: var\(--bnd-brand-deep\)/);
  assert.match(css, /\.bnd-bill-tools-body/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b\d+px\b/i);
});
