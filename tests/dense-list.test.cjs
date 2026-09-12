const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const py=fs.readFileSync('bunood_theme/presets.py','utf8');
const js=fs.readFileSync('bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js','utf8');
const json=JSON.parse(fs.readFileSync('bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.json','utf8'));
const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_list.scss','utf8');

test('all authoritative settings mirrors ship Hairline Rows',()=>{
  assert.match(py,/LIST_DEFAULTS\s*=\s*\{[\s\S]*?"list_style": "Hairline Rows"/);
  assert.match(js,/BND_LIST_DEFAULTS\s*=\s*\{[\s\S]*?list_style: "Hairline Rows"/);
  assert.equal(json.fields.find(field=>field.fieldname==='list_style').default,'Hairline Rows');
});

test('keyboard focus is distinct and clipped-safe without replacing native list controls',()=>{
  assert.match(css,/\.list-row-container:has\(:focus-visible\)\s*\{/);
  assert.match(css,/outline:\s*var\(--bnd-line-2\) solid var\(--bnd-accent\)/);
  assert.match(css,/outline-offset:\s*calc\(-1 \* var\(--bnd-line-2\)\)/);
  assert.match(css,/:has\(:focus-visible\) > \.list-row\s*\{\s*background: transparent/);
  for(const native of ['list-row-checkbox','checkbox-actions','list-row-head'])assert.match(css,new RegExp(native));
  assert.doesNotMatch(css,/display:\s*none[^\n]*(list-row-checkbox|checkbox-actions)/);
});
