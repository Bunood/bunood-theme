const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const csv = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");
const js = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");

test("Payments dashboard uses accounting-context Arabic labels", () => {
	for (const row of [
		"Total Incoming Payment,إجمالي المقبوضات,",
		"Total Outgoing Payment,إجمالي المدفوعات,",
		"Total Incoming Bills,إجمالي فواتير المشتريات,",
		"Total Outgoing Bills,إجمالي فواتير المبيعات,",
		"Outgoing Bills (Sales Invoice),فواتير المبيعات الصادرة,",
		"Incoming Bills (Purchase Invoice),فواتير المشتريات الواردة,",
	]) assert.ok(csv.includes(row), `missing contextual translation: ${row}`);
});

test("Arabic dashboard charts localize Frappe's fixed English month periods", () => {
	for (const row of ["January,يناير,", "April,أبريل,", "August,أغسطس,", "September,سبتمبر,", "December,ديسمبر,"])
		assert.ok(csv.includes(row), `missing month translation: ${row}`);
	const localizer = js.match(/function localize_chart_periods\(options\) \{([\s\S]*?)\n\t\t\}/)?.[0] || "";
	assert.match(localizer, /Jan\|Feb\|Mar/);
	assert.match(localizer, /Intl\.DateTimeFormat\("ar-u-ca-gregory", \{ month: "long" \}\)/);
	assert.match(localizer, /MONTH_KEYS\.indexOf\(match\[1\]\)/);
	assert.match(js, /options = localize_chart_periods\(viable\.options\)/);
});

test("empty or signed part-to-whole charts use a finite textual fallback", () => {
	const guard = js.match(/function viable_chart_options\(options\) \{([\s\S]*?)\n\t\t\}/)?.[0] || "";
	assert.match(js, /PART_TO_WHOLE_TYPES = new Set\(\["percentage", "pie", "donut"\]\)/);
	assert.match(guard, /PART_TO_WHOLE_TYPES\.has\(options\.type\)/);
	assert.match(guard, /total > 0/);
	assert.match(guard, /magnitude === 0[\s\S]*?empty: true/);
	assert.match(guard, /nonviable-part-to-whole/);
	assert.match(js, /dataset\.bndChartFallback = empty \? "empty" : "nonviable-part-to-whole"/);
	assert.match(js, /function fallback_chart\(parent, options, empty\)/);
	assert.match(js, /if \(viable\.empty \|\| viable\.fallback\) return fallback_chart\(parent, options, viable\.empty\)/);
});

test("one-period line data uses the native finite bar geometry", () => {
	const guard = js.match(/function viable_chart_options\(options\) \{([\s\S]*?)\n\t\t\}/)?.[0] || "";
	assert.match(guard, /options\?\.type === "line"/);
	assert.match(guard, /labels \|\| \[\]\)\.length < 2/);
	assert.match(guard, /options: \{ \.\.\.options, type: "bar" \}/);
});
