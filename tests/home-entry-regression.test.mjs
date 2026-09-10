import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readTranslations } from "../tools/i18n.mjs";

// Rendered Home and Bill Workbench labels bypass the literal-only extractor
// through helpers/profile data. Keep this observed regression covered without
// pretending the general catalogue gate sees every dynamically supplied label.
const required = [
	"New sales invoice", "Record a purchase", "Receive payment", "Stock entry", "New customer",
	"Your business at a glance", "Financial summary", "Cash and bank balance",
	"Available across cash and bank accounts", "Sales this month", "Outstanding receivables",
	"Outstanding payables", "Needs your attention", "What to deal with today", "Overdue invoices",
	"Bills to pay", "Drafts to finish", "Nothing needs your attention", "No documents you can create yet",
	"Recent activity", "Latest invoices", "No recent activity", "Sales trend", "Last six months",
	"Invoice status", "Current sales invoices", "No invoice data yet", "Could not load dashboard data",
	"Sales bill", "Who are you billing?", "What are you selling?",
	"Purchase bill", "Who are you buying from?", "What are you buying?",
	"Notification", "Notifications", "Notification Picker", "Notification Style",
	"Notification settings", "Notifications Placement",
];

test("observed Home and invoice labels have shipped Arabic translations", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	const missing = required.filter(key => !/[\u0600-\u06ff]/u.test(translations.get(key) || ""));
	assert.deepEqual(missing, []);
});

test("notification labels use consistent Arabic product wording", () => {
	const translations = readTranslations(fileURLToPath(new URL("../bunood_theme/translations/ar.csv", import.meta.url)));
	assert.equal(translations.get("Notification"), "إشعار");
	assert.equal(translations.get("Notifications"), "إشعارات");
	assert.equal(translations.get("Notification Picker"), "منتقي الإشعارات");
	assert.equal(translations.get("Notification Style"), "نمط الإشعارات");
	assert.equal(translations.get("Notification settings"), "إعدادات الإشعارات");
	assert.equal(translations.get("Notifications Placement"), "موضع الإشعارات");
});

test("Home actions can wrap inside their available width", () => {
	const source = readFileSync(new URL("../bunood_theme/public/scss/surfaces/_home.scss", import.meta.url), "utf8");
	const rule = source.match(/\.bnd-home-intro-actions\s*\{([^}]+)\}/)?.[1] || "";
	assert.match(rule, /flex-wrap:\s*wrap\s*;/);
	assert.match(rule, /max-inline-size:\s*100%\s*;/);
	// This guards the source rule only. Real clipping is checked in the browser.
});
