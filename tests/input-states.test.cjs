const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bunood_theme/public/scss/components/_inputs.scss','utf8');

test('native forms, Quick Entry and composed forms share state selectors',()=>{
  for(const scope of ['.form-layout','.modal-dialog','.bnd-simple-composer'])assert.match(css,new RegExp(scope.replace('.','\\.')));
  for(const state of [':hover',':focus-visible','.has-error','aria-invalid="true"','[readonly]',':disabled','aria-busy="true"'])
    assert.ok(css.includes(state),`missing ${state}`);
});

test('focus and validation use design tokens and disabled fields remain legible',()=>{
  assert.match(css,/outline: var\(--bnd-line-2\) solid var\(--bnd-accent\)/);
  assert.match(css,/outline-offset: var\(--bnd-focus-offset\)/);
  assert.match(css,/border-color: var\(--bnd-critical\)/);
  assert.match(css,/:disabled[\s\S]*?cursor: not-allowed; opacity: 1;/);
  assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i);
});
