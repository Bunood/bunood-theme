import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../tools/stock-entry-live-acceptance.mjs", import.meta.url), "utf8");

test("Stock Entry live gate owns and cleans every native fixture", () => {
	assert.match(source, /RunOwnedUserFixtures/);
	assert.match(source, /BND-STOCK-QA-/);
	assert.match(source, /remarks,\s*items:/);
	assert.match(source, /Refusing to delete an unowned Stock Entry/);
	assert.match(source, /Refusing to purge ledger rows outside the owned fixture/);
	assert.match(source, /frappe\.db\.delete\("Stock Ledger Entry",\{"voucher_type":"Stock Entry","voucher_no":voucher\}\)/);
	assert.match(source, /Refusing to delete a non-zero owned Bin/);
	assert.match(source, /Refusing to delete an unowned Item/);
	assert.match(source, /Refusing to delete an unowned Warehouse/);
	assert.match(source, /finally \{[\s\S]*cleanupNativeFixtures\(\);[\s\S]*fixtures\.cleanup\(\)/);
});

test("Stock Entry live gate covers the bilingual responsive presentation matrix", () => {
	assert.match(source, /\[1440, 900\], \[1024, 900\], \[700, 900\], \[430, 900\]/);
	assert.match(source, /\[\["en", "ltr"\], \["ar", "rtl"\]\]/);
	assert.match(source, /const themes = \["light", "dark"\]/);
	assert.match(source, /frappe\.new_doc\("Stock Entry"\)/);
	assert.match(source, /\.bnd-stock-steps > li/);
	assert.match(source, /sameDocument/);
	assert.match(source, /overflow <= 1/);
});

test("Stock Entry live gate uses native permissions lifecycle and ledgers", () => {
	assert.match(source, /"frappe\.client\.insert"/);
	assert.match(source, /"frappe\.client\.submit"/);
	assert.match(source, /"frappe\.client\.cancel"/);
	assert.match(source, /frappe\.desk\.search\.search_link/);
	assert.match(source, /native Warehouse search leaked the forbidden warehouse/);
	assert.match(source, /Stock Ledger Entry/);
	assert.match(source, /GL Entry/);
	assert.match(source, /"Bin"/);
	assert.match(source, /perpetual inventory did not create balanced native GL evidence/);
	assert.match(source, /marker-only Owner unexpectedly read Stock Entry/);
});
