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
	// Stage 2: the quotation is the trade family's (trade_a4.html); its signature row carries the
	// seal in the seller's cell, the first (printing/documents.py SIGNATURES: labels, seal index).
	const quotation = format('quotation_a4.html');
	assert.match(quotation, /\{% include "templates\/print\/trade_a4\.html" %\}/);
	const trade = fs.readFileSync('bunood_theme/templates/print/trade_a4.html', 'utf8');
	assert.match(trade, /\{\{ signatures\(p, v\.signatures, seal=v\.seal\) \}\}/);
	const documents = fs.readFileSync('bunood_theme/printing/documents.py', 'utf8');
	assert.match(documents, /"quotation": \(\[\("البائع", "Seller"\), \("قبول العميل", "Customer acceptance"\)\], 0\)/);
	// The print kit (2026-10-15): the standard tax invoice's signature row carries the seal in the
	// seller's cell — the company's signature, its stamp and its signatory, from the print profile,
	// which inlines both private images (printing/profile.py `_image` → bunood_print_image_src).
	const kit = fs.readFileSync('bunood_theme/templates/print/kit.html', 'utf8');
	const sigs = kit.slice(kit.indexOf('{% macro signatures('), kit.indexOf('{%- endmacro %}', kit.indexOf('{% macro signatures(')));
	assert.match(sigs, /\{% if loop\.index0 == seal %\}\{% if p\.signature %\}<img src="\{\{ p\.signature \| e \}\}"/);
	assert.match(sigs, /\{% if p\.stamp %\}<img src="\{\{ p\.stamp \| e \}\}"/);
	assert.match(sigs, /p\.signatory/);
	const profile = fs.readFileSync('bunood_theme/printing/profile.py', 'utf8');
	assert.match(profile, /"stamp": _image\(_clean\(c\.get\("bnd_company_stamp"\)\)\)/);
	assert.match(profile, /"signature": _image\(_clean\(c\.get\("bnd_signature"\)\)\)/);
	const family = fs.readFileSync('bunood_theme/templates/print/sales_invoice_a4.html', 'utf8');
	assert.match(family, /\{\{ signatures\(p, \[\("البائع", "Seller"\), \("المستلم", "Received by"\)\]\) \}\}/);
	// The simplified (B2C) invoice is lean: the owner's rule puts the signature row on the tax
	// invoice, the quotation, the orders, the vouchers and the journal — not on a receipt-like bill.
	assert.match(family, /\{%- if not simplified %\}\s*\{\{ signatures\(/, 'the signature row sits behind the simplified switch');
});
