const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_form.scss', 'utf8');

test('print language is an English/Arabic choice over Frappe native state', () => {
  const syncStart = js.indexOf('function sync_print_language_choice(field)');
  const start = js.indexOf('function mount_print_language_choice()');
  const end = js.indexOf('\n\tfunction mount_chrome()', start);
  const source = js.slice(syncStart, end);
  assert.ok(syncStart > 0 && start > syncStart && end > start);
  assert.match(source, /\[\["en", "English", "ltr"\], \["ar", "العربية", "rtl"\]\]/);
  assert.match(source, /window\.jQuery\(input\)\.val\(code\)\.trigger\("change"\)/);
  assert.match(source, /\.control-value \[data-value\]/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /set_value|frappe\.call|set_route/);
});

test('print language buttons are equal width with one explicit selected state', () => {
  assert.match(css, /\.bnd-print-language \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.bnd-print-language__option\[aria-pressed="true"\] \{[\s\S]*?background: var\(--bnd-brand-deep\)/);
  assert.match(css, /> \.control-input-wrapper \{ display: none; \}/);
});
