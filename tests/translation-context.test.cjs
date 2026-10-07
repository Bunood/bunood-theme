const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("the Ledger visual theme uses its own translation context", () => {
	const source = readFileSync(
		join(root, "bunood_theme", "bunood_theme", "doctype", "theme_settings", "theme_settings.js"),
		"utf8"
	);
	assert.match(source, /__\(name, null, "theme name"\)/);
	assert.match(source, /__\("Ledger", null, "theme name"\)/);
});

test("Standard is defended as قياسي without overriding accounting Ledger", () => {
	const catalogue = readFileSync(join(root, "bunood_theme", "translations", "ar.csv"), "utf8");
	const falseFriends = JSON.parse(
		readFileSync(join(root, "bunood_theme", "locale", "false_friends.json"), "utf8")
	);
	assert.match(catalogue, /^Standard,قياسي,$/m);
	assert.match(catalogue, /^Ledger,دفتر,theme name$/m);
	assert.equal(falseFriends.entries.Standard.defend, true);
	assert.equal(falseFriends.entries.Ledger.defend, false);
});
