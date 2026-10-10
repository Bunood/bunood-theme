// The seller's seal on printed documents: the company's authorised signature, its signatory and
// its stamp (bunood_business's Organization screen) close a tax invoice and a quotation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const macros = fs.readFileSync('bunood_theme/templates/bunood_print_macros.html', 'utf8');
const format = (name) => fs.readFileSync(`bunood_theme/printing/formats/${name}`, 'utf8');
const seal = (() => {
	const start = macros.indexOf('{% macro seal_row(');
	return start < 0 ? '' : macros.slice(start, macros.indexOf('{%- endmacro %}', start));
})();

test('the seal macro reads the company, and prints nothing for a company without a seal', () => {
	assert.ok(seal, 'seal_row is defined');
	assert.match(seal, /frappe\.get_doc\("Company", doc\.company\)/);
	for (const field of ['bnd_signature', 'bnd_company_stamp', 'bnd_signatory']) assert.match(seal, new RegExp(`get\\("${field}"\\)`));
	assert.match(seal, /\{%- if _sig or _stamp -%\}/);
});

test('the signature and the stamp are private files, so they are inlined, never linked', () => {
	assert.match(seal, /bunood_print_image_src\(_sig\)/);
	assert.match(seal, /bunood_print_image_src\(_stamp\)/);
	assert.doesNotMatch(seal, /src="\{\{ _sig \|/);
	assert.doesNotMatch(seal, /src="\{\{ _stamp \|/);
});

test('it rides the signature row and carries no colour of its own', () => {
	assert.match(seal, /class="bnd-p-sigs bnd-p-seal"/);
	assert.doesNotMatch(seal, /#[0-9a-f]{3,6}\b/i);
	assert.doesNotMatch(seal, /color:/);
});

test('the tax invoice and the quotation close with the seal, above their signature lines', () => {
	for (const name of ['sales_invoice_tax_a4.html', 'quotation_a4.html']) {
		const html = format(name);
		assert.match(html, /import [^%]*seal_row/, `${name} imports seal_row`);
		const at = html.indexOf('{{ seal_row(doc');
		assert.ok(at > 0 && at < html.indexOf('{{ sig_row('), `${name}: the seal comes before the signature lines`);
	}
	const simplified = format('sales_invoice_simplified_a4.html');
	assert.match(simplified, /import [^%]*seal_row/);
	assert.ok(simplified.indexOf('{{ seal_row(doc) }}') > simplified.indexOf('{{ totals_block('), 'the simplified invoice closes with the seal after its totals');
});
