const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const desk = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");

test("native Frappe Dialog behavior remains the only show implementation", () => {
	assert.match(desk, /const native_show = proto\.show;/);
	assert.match(desk, /return native_show\.apply\(this, args\);/);
	assert.match(desk, /accessible_show\._bnd_native = native_show;/);
	assert.match(desk, /try_for\(install_interaction_accessibility, 40, 150\)/);
});

test("visible dialogs expose a named modal contract and persistent feedback", () => {
	assert.match(desk, /setAttribute\("role", "dialog"\)/);
	assert.match(desk, /setAttribute\("aria-modal", "true"\)/);
	assert.match(desk, /setAttribute\("aria-labelledby", title\.id\)/);
	assert.match(desk, /\.modal-message, \.msgprint, \.alert/);
	assert.match(desk, /setAttribute\("role", "alert"\)/);
	assert.match(desk, /setAttribute\("aria-live", "assertive"\)/);
	assert.match(desk, /new MutationObserver\(sync_interaction_overlays\)/);
	assert.match(desk, /button\.classList\.contains\("btn-modal-close"\)/);
	assert.match(desk, /control\.setAttribute\("aria-labelledby", visible_label\.id\)/);
	assert.match(desk, /frappe\.meta\?\.get_docfield\?\.\(doctype, fieldname\)\?\.label/);
});

test("keyboard focus loops inside the top dialog and returns to its opener", () => {
	assert.match(desk, /if \(event\.key !== "Tab"\) return;/);
	assert.match(desk, /event\.shiftKey && index <= 0/);
	assert.match(desk, /nodes\[nodes\.length - 1\]\.focus\(\)/);
	assert.match(desk, /index < 0 \|\| index === nodes\.length - 1/);
	assert.match(desk, /nodes\[0\]\.focus\(\)/);
	assert.match(desk, /modal\._bnd_opener = active && !modal\.contains\(active\) \? active : interaction_last_focus/);
	assert.match(desk, /function restore_interaction_dialog\(modal\)/);
	assert.match(desk, /modal\._bnd_opener/);
	assert.match(desk, /requestAnimationFrame\(\(\) => target\.focus/);
});

test("programmatic focus cannot escape an aria-modal dialog", () => {
	assert.match(desk, /document\.addEventListener\("focusin"/);
	assert.match(desk, /if \(!modal\) \{/);
	assert.match(desk, /if \(modal\.contains\(event\.target\)\) return;/);
	assert.match(desk, /queueMicrotask\(\(\) => target\.focus/);
});

test("list filters expose a keyboard-opened labelled popover and Escape restore", () => {
	assert.match(desk, /trigger\.setAttribute\("aria-haspopup", "dialog"\)/);
	assert.match(desk, /trigger\.setAttribute\("aria-expanded", "true"\)/);
	assert.match(desk, /popover\.setAttribute\("role", "dialog"\)/);
	assert.match(desk, /popover\.setAttribute\("aria-label", __\("Filters"\)\)/);
	assert.match(desk, /\["select\.condition", __\("Condition"\)\]/);
	assert.match(desk, /remove\.setAttribute\("aria-label", __\("Remove filter"\)\)/);
	assert.match(desk, /event\.key === "Enter" \|\| event\.key === " "/);
	assert.match(desk, /window\.jQuery\(trigger\)\.popover\("hide"\)/);
	assert.match(desk, /requestAnimationFrame\(\(\) => trigger\.focus/);
});
