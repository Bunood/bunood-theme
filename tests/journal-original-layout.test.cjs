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
