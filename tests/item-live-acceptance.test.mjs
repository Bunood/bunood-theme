import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../tools/item-live-acceptance.mjs", import.meta.url), "utf8");

test("Item live gate is run-owned and always cleans native records", () => {
	assert.match(source, /RunOwnedUserFixtures/);
	assert.match(source, /makeV1RoleFixtureUsers/);
	assert.match(source, /description != marker/);
	assert.match(source, /Refusing to delete an unowned Item/);
	assert.match(source, /finally \{[\s\S]*cleanupItem\(\);[\s\S]*fixtures\.cleanup\(\)/);
});

test("Item live gate exercises the complete presentation matrix and lifecycle", () => {
	assert.match(source, /\[1440, 900\], \[1024, 900\], \[700, 900\], \[430, 900\]/);
	assert.match(source, /\[\["en", "ltr"\], \["ar", "rtl"\]\]/);
	assert.match(source, /const themes = \["light", "dark"\]/);
	assert.match(source, /setDisabled\(true\)/);
	assert.match(source, /nameIndex < result\.codeIndex/);
	assert.match(source, /nameProminent/);
	assert.match(source, /sameDocument/);
	assert.match(source, /overflow <= 1/);
});

test("Item live gate proves native search and effective role denials", () => {
	assert.match(source, /frappe\.desk\.search\.search_link/);
	assert.match(source, /native Item search did not find/);
	assert.match(source, /frappe\.has_permission\("Item", ptype, code, user=user\)/);
	assert.match(source, /frappe\.client\.set_value/);
	assert.match(source, /Stock User unexpectedly wrote Item master data/);
	assert.match(source, /marker-only Owner unexpectedly read Item master data/);
});
