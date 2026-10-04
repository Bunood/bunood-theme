import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCatalogue, assertTranslationCoverage, readTranslations } from "./i18n.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("business labels include literal calls and translated descriptor values", () => {
	const catalogue = extractCatalogue();
	for (const text of ["Sales bill", "Purchase bill", "Invoice tools", "Essentials",
		"How is money moving?", "Debit and credit lines",
		"Review period readiness, exceptions and close evidence."])
		assert.ok(catalogue.has(text), `Missing runtime translation: ${text}`);
	assert.ok(!catalogue.has("paid_from"), "Field identifiers are not display labels");
});

test("Arabic business translations ship through the generated runtime dictionary", () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), "..");
	const dictionary = readTranslations(join(root, "bunood_theme/translations/ar.csv"));
	for (const text of ["Sales bill", "Purchase bill", "Invoice tools", "Essentials",
		"Review period readiness, exceptions and close evidence."]) {
		assert.ok(/[\u0600-\u06ff]/u.test(dictionary.get(text)), `No Arabic runtime value: ${text}`);
	}
	assertTranslationCoverage("ar");
});
