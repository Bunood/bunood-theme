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

test("deploy keeps the frontend app source in sync with backend workers", () => {
	assert.match(source, /SOURCE_CONTAINERS=\("\$\{APP_CONTAINERS\[@\]\}"\)/);
	assert.match(source, /SOURCE_CONTAINERS\+=\("\$FRONTEND"\)/);
	assert.match(source, /for c in "\$\{SOURCE_CONTAINERS\[@\]\}"/);
});
