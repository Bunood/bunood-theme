import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCatalogue, assertTranslationCoverage, assertNoCountGoverned, readTranslations } from "./i18n.mjs";
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

test("invoice prompts translate complete sentences without noun-governing placeholders", () => {
	const catalogue = extractCatalogue();
	for (const text of ["Remove this item from the invoice? Item: {0}",
		"Choose a customer to see their document context here.",
		"Choose a supplier to see their document context here."])
		assert.ok(catalogue.has(text));
	assert.ok(!catalogue.has("Remove {0} from this invoice?"));
	assert.ok(!catalogue.has("Choose a {0} to see their document context here."));
	assert.equal(assertNoCountGoverned(), 0);
});

test("native settlement values have Arabic display translations", () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), "..");
	const dictionary = readTranslations(join(root, "bunood_theme/translations/ar.csv"));
	const catalogue = extractCatalogue();
	for (const [value, display] of [["On Credit", "آجل"], ["Mixed Payment", "دفع متعدد"]]) {
		assert.ok(catalogue.has(value), `Settlement constant not extracted: ${value}`);
		assert.equal(dictionary.get(value), display);
	}
});
