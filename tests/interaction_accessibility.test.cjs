const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const desk = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");
const overlays = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_overlays.scss"), "utf8");
const forms = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_form.scss"), "utf8");
const tokens = fs.readFileSync(path.join(root, "bunood_theme/public/scss/_tokens.scss"), "utf8");
const salesBill = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_sales_bill.scss"), "utf8");
const settings = fs.readFileSync(path.join(root, "bunood_theme/public/scss/chrome/_settings.scss"), "utf8");
const arabic = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");

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

test("RTL child-table link suggestions stay inside the grid instead of clipping Arabic labels", () => {
	assert.match(desk, /function align_grid_link_popup\(input\)/);
	assert.match(desk, /input_box\.right - host_box\.left - width/);
	assert.match(desk, /Math\.max\(0, Math\.min\(anchored, host_box\.width - width\)\)/);
	assert.match(desk, /popup\.dataset\.bndGridLinkPopup = "aligned"/);
	assert.match(desk, /document\.addEventListener\("awesomplete-open", queue_grid_link_popup\)/);
});

test("autocomplete suggestions always paint above document and table chrome", () => {
	const rule = overlays.match(/html\[data-theme\] \.awesomplete > :is\(ul, \[role="listbox"\]\) \{([\s\S]*?)\n\}/)?.[1] || "";
	assert.match(rule, /z-index: var\(--bnd-z-panel\)/);
	assert.doesNotMatch(rule, /data-bnd-overlay/);
	const rows = overlays.match(/html\[data-theme\] \.awesomplete > \[role="listbox"\] > li \{([\s\S]*?)\n\}/)?.[1] || "";
	assert.match(rows, /border-bottom: 0/);
});

test("the shared sales-tax exemption question is contextual Arabic with a logical RTL checkbox", () => {
	assert.match(arabic, /Is customer exempted from sales tax\?,هل العميل معفى من ضريبة المبيعات؟,/);
	assert.match(forms, /html\[dir="rtl"\]\[data-bnd-form\] \.frappe-control\[data-fieldtype="Check"\]\[data-fieldname="exempt_from_sales_tax"\] \.checkbox > label \{[\s\S]*?direction: rtl;[\s\S]*?text-align: start;/);
	assert.match(forms, /data-fieldname="exempt_from_sales_tax"[^}]*\.label-area \{[\s\S]*?unicode-bidi: plaintext;/);
});

test("decorative capsules use restrained geometry while semantic steps remain circular", () => {
	assert.match(tokens, /--bnd-radius-pill: var\(--bnd-radius-sm\);/);
	assert.match(salesBill, /\.bnd-document-state \{[\s\S]*?border-radius: var\(--bnd-radius-sm\);/);
	assert.match(salesBill, /\.bnd-stock-step-dot \{[\s\S]*?border-radius: 50%;/);
	assert.doesNotMatch(salesBill, /border-radius: 999px/);
	assert.doesNotMatch(settings, /border-radius: 999px/);
});

test("Arabic form presentation translates labels and master-data display without mutating stored values", () => {
	for (const row of [
		"Accounts,الحسابات,",
		"Accounts Setup,إعداد الحسابات,",
		"Bank Draft,شيك مصرفي,",
		"Cash,نقد,",
		"Cheque,شيك,",
		"COA Importer,استيراد شجرة الحسابات,",
		"Credit Card,بطاقة ائتمان,",
		"Default Account,الحساب الافتراضي,",
		"Enabled,مفعّل,",
		"FX Revaluation,إعادة تقييم العملات الأجنبية,",
		"Last Edited By You,آخر تعديل بواسطتك,",
		"Network Card Clearing,تسوية بطاقات الشبكة,",
		"Opening Invoice Tool,أداة إنشاء الفواتير الافتتاحية,",
		"Repost Accounting Ledger Settings,إعدادات إعادة ترحيل دفتر الحسابات,",
		"Sales Taxes,ضرائب المبيعات,",
		"Wire Transfer,حوالة مصرفية,",
	]) assert.match(arabic, new RegExp(row));
	assert.match(desk, /function localized_business_value\(doctype, value\)/);
	assert.match(desk, /const MODE_OF_PAYMENT_LABELS = \{/);
	assert.match(desk, /"Credit Card": __\("Credit Card"\)/);
	assert.match(desk, /function localize_mode_of_payment_options\(frm\)/);
	assert.match(desk, /\.awesomplete > \[role="listbox"\]/);
	assert.match(desk, /text\.replace\("Network Card Clearing", __\("Network Card Clearing"\)\)/);
	assert.match(desk, /title !== display_docname\) bits\.push\(display_docname\)/);
	assert.match(desk, /\.worksapce-breadcrumb/);
	assert.match(desk, /data-fieldname="default_account"/);
	assert.match(desk, /a\[data-doctype="Account"\]\[data-name\]/);
	assert.doesNotMatch(desk, /frm\.set_value\([^\n]*(Network|Cash|Network Card Clearing)/);
});
