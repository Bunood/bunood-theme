const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const scssRoot = path.join(root, 'bunood_theme/public/scss');
const walkScss = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return walkScss(target);
  return entry.name.endsWith('.scss') ? [target] : [];
});

const tokens = read('bunood_theme/public/scss/_tokens.scss');
const cluster = read('bunood_theme/public/scss/chrome/_cluster.scss');
const menus = read('bunood_theme/public/scss/components/_menus.scss');
const studio = read('bunood_theme/public/scss/surfaces/_studio.scss');
const focusFiles = [cluster, menus, studio];

test('separator borders use the line token only as a width', () => {
  const allStyles = walkScss(scssRoot).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(allStyles, /solid\s+var\(--bnd-line\)/);
  assert.equal(
    (studio.match(/var\(--bnd-line\)\s+solid\s+var\(--bnd-border\)/g) || []).length,
    4,
    'all four Studio separators pair the line width with a border color',
  );
});

test('cluster has one authoritative base layout with the effective gap', () => {
  assert.equal(
    (cluster.match(/html\[data-theme\]\s+\.bnd-cluster\s*\{/g) || []).length,
    1,
  );
  const base = cluster.match(/html\[data-theme\]\s+\.bnd-cluster\s*\{([^}]+)\}/);
  assert.ok(base, 'base cluster rule exists');
  assert.match(base[1], /gap:\s*var\(--bnd-sp-2\)/);
  assert.match(base[1], /flex:\s*1/);
  assert.match(base[1], /position:\s*relative/);
});

test('owned focus rings use the shared width and offset tokens', () => {
  assert.match(tokens, /--bnd-focus-offset:\s*2px/);
  for (const css of focusFiles) {
    assert.doesNotMatch(css, /outline:\s*\d+(?:\.\d+)?px\s+solid/);
    for (const rule of css.matchAll(/[^{}]*:focus-visible[^{}]*\{([^{}]*)\}/g)) {
      if (!/outline:/.test(rule[1])) continue;
      assert.match(rule[1], /outline:\s*var\(--bnd-line-2\)\s+solid/);
      assert.match(rule[1], /outline-offset:\s*var\(--bnd-focus-offset\)/);
    }
  }
});

test('Studio search shows its custom ring only for keyboard-visible focus', () => {
  const search = studio.match(/\.bnd-studio__search\s*\{([\s\S]*?)\n\t\}/);
  assert.ok(search, 'Studio search rule exists');
  assert.match(search[1], /&:focus-visible\s*\{/);
  assert.doesNotMatch(search[1], /&:focus(?!-visible)\s*\{/);
});
