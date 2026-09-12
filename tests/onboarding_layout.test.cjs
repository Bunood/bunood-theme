const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('workspace onboarding is contained by its sidebar instead of covering work', () => {
  const scss = fs.readFileSync('bunood_theme/public/scss/surfaces/_coverage.scss', 'utf8');
  assert.match(scss, /\.body-sidebar-container \.user-onboarding \{[\s\S]*?position: absolute/);
  assert.match(scss, /inset: 0/);
  assert.match(scss, /inline-size: 100%/);
  assert.match(scss, /block-size: 100%/);
  assert.match(scss, /z-index: var\(--bnd-z-panel\)/);
  assert.match(scss, /\.body-sidebar-container \.user-onboarding \.onb-panel \{[\s\S]*?position: static/);
  assert.match(scss, /max-inline-size: 100%/);
  assert.match(scss, /max-block-size: 100%/);
  assert.match(scss, /overflow-y: auto/);
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
  assert.match(js, /Could not refresh progress\. Try again\./);
  assert.match(scss, /\.bnd-onboarding-refresh/);
  assert.match(scss, /\.bnd-onboarding-status/);
});
