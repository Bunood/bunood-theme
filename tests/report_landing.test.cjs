const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('bunood_theme/public/js/report_landing.js', 'utf8');
const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_report_landing.scss', 'utf8');
const build = fs.readFileSync('build.mjs', 'utf8');

test('reports workspace becomes one searchable, described catalogue', () => {
  assert.match(source, /Workspaces/);
  assert.match(source, /Reports/);
  assert.match(source, /bnd-report-landing__search/);
  assert.match(source, /bnd-report-landing__description/);
  assert.match(source, /No reports match your search/);
  assert.match(source, /\(!report\.bootAsset \|\| frappe\.boot\?\.\[report\.bootAsset\]\) &&/);
  assert.match(source, /\(!Array\.isArray\(permitted\) \|\| permitted\.includes\(report\.route\[0\]\)\)/);
  assert.match(build, /"report_landing\.js"/);
  assert.match(build, /key: "bnd-report-landing", src: "report_landing\.scss", pyid: "REPORT_LANDING_CSS"/);
  assert.doesNotMatch(build.match(/const DESK_JS_SOURCES = \[([^\]]+)\]/)?.[1] || '', /report_landing/);
});

test('report landing uses a restrained responsive grid instead of blank shortcut strips', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(css, /\.bnd-report-landing__card/);
  assert.doesNotMatch(css, /border-radius:\s*var\(--bnd-radius-pill\)/);
});

test('every card the landing links is a Page the boot gate knows', () => {
  const boot = fs.readFileSync('bunood_theme/boot.py', 'utf8');
  const pages = (boot.match(/^REPORT_LANDING_PAGES = \(([^)]*)\)/m) || [])[1] || '';
  const gated = new Set([...pages.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  const routes = new Set([...source.matchAll(/route: \["([a-z-]+)"/g)].map((m) => m[1]));
  assert.ok(routes.size >= 4, `the landing's routes were read (${[...routes]})`);
  for (const page of routes) assert.ok(gated.has(page), `${page} is linked but not in REPORT_LANDING_PAGES`);
  assert.match(boot, /bootinfo\.bnd_report_landing_permitted_pages = _permitted_pages\(REPORT_LANDING_PAGES\)/);
});
