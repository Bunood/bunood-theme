// bunood.js build_user: the account button names whose menu it opens.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "..", "bunood_theme/public/js/bunood.js"), "utf8");
const start = js.indexOf("\tfunction build_user() {");
const end = js.indexOf("\n\t}\n", start) + 4;

function build(session, boot) {
	const made = [];
	const context = {
		__: (text) => ({ "User menu": "قائمة المستخدم" })[text] || text,
		frappe: { session, boot },
		el(tag, cls, attrs) {
			const node = { tag, cls, attrs: { ...attrs }, title: "", setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} };
			made.push(node);
			return node;
		},
		user_avatar_html: () => "<span></span>",
		bunood_acct_panel() {},
	};
	vm.runInNewContext(`${js.slice(start, end)}\nthis.avatar = build_user();`, context);
	return context.avatar;
}

test("the label carries the name; the tooltip adds the email, or the company", () => {
	assert.ok(start > 0 && end > start, "build_user is found");
	const withEmail = build({ user_fullname: "Huda Ali", user: "huda@example.com" }, { user: { email: "huda@example.com" } });
	assert.equal(withEmail.attrs["aria-label"], "قائمة المستخدم: Huda Ali");
	assert.equal(withEmail.title, "Huda Ali\nhuda@example.com");
	const noEmail = build({ user_fullname: "Huda Ali" }, { user: {}, sysdefaults: { company: "Fixture Co" } });
	assert.equal(noEmail.title, "Huda Ali\nFixture Co");
	const anonymous = build({}, {});
	assert.equal(anonymous.attrs["aria-label"], "قائمة المستخدم");
	assert.equal(anonymous.title, "");
});
