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
  assert.match(source, /REPORTS\.filter\(report => !report\.bootAsset \|\| frappe\.boot\?\.\[report\.bootAsset\]\)/);
  assert.match(build, /"report_landing\.js"/);
  assert.match(build, /key: "bnd-report-landing", src: "report_landing\.scss", pyid: "REPORT_LANDING_CSS"/);
  assert.doesNotMatch(build.match(/const DESK_JS_SOURCES = \[([^\]]+)\]/)?.[1] || '', /report_landing/);
});

test('report landing uses a restrained responsive grid instead of blank shortcut strips', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(css, /\.bnd-report-landing__card/);
  assert.doesNotMatch(css, /border-radius:\s*var\(--bnd-radius-pill\)/);
});
