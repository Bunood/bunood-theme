const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('workspace onboarding is a bottom-corner flyout with a persistent close header', () => {
  const scss = fs.readFileSync('bunood_theme/public/scss/surfaces/_coverage.scss', 'utf8');
  assert.match(scss, /\.body-sidebar-container \.user-onboarding \{[\s\S]*?position: static/);
  assert.match(scss, /\.body-sidebar-container \.user-onboarding \.onb-panel \{[\s\S]*?position: fixed/);
  assert.match(scss, /inset-block: auto calc\(var\(--bnd-bottom-reserve\) \+ var\(--bnd-sp-5\)\)/);
  assert.match(scss, /inset-inline: auto var\(--bnd-sp-5\)/);
  assert.match(scss, /inline-size: min\(420px, calc\(100vw - 2 \* var\(--bnd-sp-5\)\)\)/);
  assert.match(scss, /z-index: var\(--bnd-z-panel\)/);
  assert.match(scss, /max-block-size: min\(74dvh, 680px\)/);
  assert.match(scss, /overflow: hidden/);
  assert.match(scss, /\.onb-header-main \{[\s\S]*?position: relative/);
  assert.match(scss, /\.onb-steps \{[\s\S]*?overflow-y: auto/);
  assert.match(scss, /@include bnd-until\(sm\)/);
  assert.match(scss, /\.body-sidebar-container:has\(> \.user-onboarding \.onb-panel\) > \.overlay \{ display: none; \}/);
});

test('native onboarding data is derived from records and exposes refresh recovery', () => {
  const hooks = fs.readFileSync('bunood_theme/hooks.py', 'utf8');
  const js = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
  const scss = fs.readFileSync('bunood_theme/public/scss/surfaces/_coverage.scss', 'utf8');
  assert.match(hooks, /frappe\.desk\.desktop\.get_onboarding_data.*bunood_theme\.onboarding\.get_onboarding_data/s);
  assert.match(hooks, /frappe\.desk\.doctype\.onboarding_step\.onboarding_step\.get_onboarding_steps.*bunood_theme\.onboarding\.get_onboarding_steps/s);
  assert.match(js, /function enhance_onboarding_refresh\(\)/);
  assert.match(js, /frappe\.xcall\("frappe\.desk\.desktop\.get_onboarding_data"/);
  assert.match(js, /sidebar\.setup_onboarding\(\)/);
  assert.match(js, /bnd-onboarding-close/);
  assert.match(js, /setAttribute\("aria-label", __\("Close"\)\)/);
  assert.match(js, /panel\.querySelector\("\.onb-progress-badge-complete"\)/);
  assert.match(js, /skip_all\.textContent\.trim\(\) === __\("Reset All"\)/);
  assert.match(js, /panel\.hidden = true/);
  assert.match(js, /frappe\.after_ajax\(close\)/);
  assert.match(scss, /\.onb-panel:has\(\.onb-progress-badge-complete\)\s*\{\s*display:\s*none/);
  assert.match(js, /Could not refresh progress\. Try again\./);
  assert.match(scss, /\.bnd-onboarding-refresh/);
  assert.match(scss, /\.bnd-onboarding-status/);
});
