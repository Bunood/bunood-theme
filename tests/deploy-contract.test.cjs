const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "tools", "deploy.sh"), "utf8");

test("deploy targets every app container in the selected stack", () => {
	assert.match(source, /STACK_PREFIX=.*BND_STACK_PREFIX/);
	assert.match(source, /APP_CONTAINERS=\(\s*"\$BACKEND"/);
	assert.match(source, /"\$\{STACK_PREFIX\}-scheduler-1"/);
});
