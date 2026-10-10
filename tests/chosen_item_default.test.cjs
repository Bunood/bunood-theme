// An item default chosen on purpose (bunood_business's item form marks it bnd_chosen) makes the
// item the warehouse's and the company's, even when it names the site's default warehouse: only
// ERPNext's own row of that shape, added to every new item, is read as no choice at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const body = (file, name) => {
	const text = fs.readFileSync(file, 'utf8');
	const start = text.indexOf(`def ${name}(`);
	assert.ok(start >= 0, `${name} is defined in ${file}`);
	const next = text.indexOf('\ndef ', start + 5);
	return text.slice(start, next < 0 ? undefined : next);
};

for (const [file, name] of [['bunood_theme/pos.py', '_company_items'], ['bunood_theme/api.py', 'warehouse_items']]) {
	test(`${name} reads the chosen mark, where the site has it`, () => {
		const fn = body(file, name);
		assert.match(fn, /has_field\("bnd_chosen"\)/);
		assert.match(fn, /\*chosen\]/, 'the mark is fetched with the row');
	});
	test(`${name} keeps a chosen row on the default warehouse`, () => {
		const fn = body(file, name);
		const skip = fn.split('\n').find((line) => /== automatic/.test(line) && /continue|not any/.test(line)) || '';
		assert.match(skip, /not row\.get\("bnd_chosen"\)/, 'the automatic-row skip spares a chosen row');
	});
}
