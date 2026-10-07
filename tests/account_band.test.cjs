const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
const sidebar = fs.readFileSync('bunood_theme/public/scss/chrome/_sidebar.scss', 'utf8');
const cluster = fs.readFileSync('bunood_theme/public/scss/chrome/_cluster.scss', 'utf8');

test('side-pane account card shows authenticated name and useful secondary identity', () => {
  const start = js.indexOf('function build_user()');
  const end = js.indexOf('\n\t/**\n\t * Frappe\'s own avatar markup', start);
  const source = js.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(source, /session\.user_fullname \|\| user\.full_name \|\| user\.first_name/);
  assert.match(source, /user\.email \|\| session\.user_email/);
  assert.match(source, /bnd-user-summary__name/);
  assert.match(source, /bnd-user-summary__detail/);
});

test('identity copy expands only in the wide side-pane account band', () => {
  assert.match(cluster, /html\[data-theme\] \.bnd-user-summary \{\s*display: none/);
  assert.match(sidebar, /> \.bnd-avatar-btn \{[\s\S]*?flex: 1 1 120px;[\s\S]*?\.bnd-user-summary \{[\s\S]*?display: flex/);
  assert.match(sidebar, /\.bnd-user-summary__detail \{[\s\S]*?color: var\(--bnd-sb-ink-muted\)/);
  assert.match(sidebar, /\.body-sidebar-container:not\(\.bnd-rail-open\)[\s\S]*?\.bnd-user-summary \{ display: none; \}/);
});
