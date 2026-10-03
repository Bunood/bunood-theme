const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const desk = fs.readFileSync("bunood_theme/public/js/bunood.js", "utf8");
const report = fs.readFileSync("bunood_theme/public/js/report_workbench.js", "utf8");
const styles = fs.readFileSync("bunood_theme/public/scss/components/_states.scss", "utf8");
const entry = fs.readFileSync("bunood_theme/public/scss/bunood.scss", "utf8");
const docs = fs.readFileSync("docs/SYSTEM-STATES.md", "utf8");
const sprite = new Set(JSON.parse(fs.readFileSync("bunood_theme/data/sprite_ids.json", "utf8")).ids);
const ar = fs.readFileSync("bunood_theme/translations/ar.csv", "utf8");

const variants = [
  "loading",
  "configured-empty",
  "setup-incomplete",
  "permission-denied",
  "recoverable-error",
  "offline-delayed-integration",
];

test("one documented component owns all six production states", () => {
  for (const variant of variants) {
    assert.ok(desk.includes(variant), `${variant} missing from component registry`);
    assert.ok(styles.includes(`is-${variant}`), `${variant} missing from styles`);
    assert.ok(docs.includes(`\`${variant}\``), `${variant} missing from docs`);
  }
  assert.match(entry, /@use "components\/states"/);
  assert.match(desk, /bunood\.system_state = Object\.freeze/);
  assert.match(desk, /"aria-atomic": "true"/);
  assert.match(desk, /kind === "loading".*setAttribute\("aria-busy", "true"\)/);
  assert.match(desk, /role: "alert", live: "assertive"/);
  assert.match(desk, /role: "status", live: "polite"/);
});

test("state and recovery icons exist in the pinned Frappe sprite", () => {
  for (const id of [
    "icon-loader-circle", "icon-inbox", "icon-folder-normal", "icon-setting-gear",
    "icon-lock", "icon-circle-alert", "icon-wifi-off", "icon-cloud-off",
    "icon-refresh-cw",
  ]) assert.ok(sprite.has(id), `${id} is missing from the sprite`);
  assert.match(desk, /sb_existing_symbol\(candidates\)/);
  assert.match(desk, /sb_existing_symbol\(actionIcons\)/);
});

test("Home, list, report and connectivity paths use the shared contract", () => {
  assert.match(desk, /kind: "loading",\s*className: "bnd-home-state"/);
  assert.match(desk, /kind: "recoverable-error",\s*compact: true,\s*className: "bnd-list-recovery"/);
  assert.match(report, /window\.bunood_theme\.system_state\.create/);
  assert.match(report, /className: "bnd-report-recovery"/);
  assert.match(desk, /bnd-conn-icon/);
  assert.match(desk, /sprite_icon\("icon-wifi-off"\)/);
  assert.match(desk, /conn_icon\?\.toggleAttribute\("hidden", up\)/);
});

test("the component is RTL-safe, responsive and reduced-motion safe", () => {
  assert.doesNotMatch(styles, /^\s*(?:margin-left|margin-right|padding-left|padding-right|left|right)\s*:/m);
  assert.match(styles, /margin-inline/);
  assert.match(styles, /padding-inline/);
  assert.match(styles, /@include bnd-until\(sm\)/);
  assert.match(styles, /prefers-reduced-motion: no-preference/);
  assert.match(styles, /\.bnd-system-state__action:focus-visible/);
});

test("new state copy is localized in Arabic", () => {
  for (const source of [
    "Setup required", "Access required", "Something went wrong", "Updates are delayed",
    "Could not refresh this list", "Could not refresh this report",
    "Check your connection and try again.",
  ]) assert.ok(ar.split(/\r?\n/).some(line => line.startsWith(`${source},`)), source);
});
