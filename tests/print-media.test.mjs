import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfMediaCss} from '../tools/print-media.mjs';
import * as sass from 'sass';
import {existsSync, readFileSync} from 'node:fs';

test('Arabic print typography uses the bundled Tajawal Google Font',()=>{
 const source=readFileSync('bunood_theme/public/scss/print/print.scss','utf8');
 assert.match(source,/font-family: "Tajawal"/);
 assert.match(source,/"Tajawal", "Bunood Riyal", "Cairo"/);
 for (const weight of ['Regular', 'Medium', 'Bold', 'ExtraBold']) {
  assert.ok(existsSync(`bunood_theme/public/fonts/tajawal/Tajawal-${weight}.ttf`));
 }
 assert.ok(existsSync('bunood_theme/public/fonts/tajawal/OFL.txt'));
});

test('grand total rule uses the document brand, never the interactive blue accent',()=>{
 const source=readFileSync('bunood_theme/public/scss/print/print.scss','utf8');
 const rule=source.match(/\.bnd-p-totals \.g td \{([\s\S]*?)\n\}/)[1];
 assert.match(rule,/border-top: 2px solid var\(--bnd-brand-solid\)/);
 assert.doesNotMatch(rule,/--bnd-accent/);
});

test('managed A4 invoices carry the shared branded table and summary contract',()=>{
 const source=readFileSync('bunood_theme/public/scss/print/print.scss','utf8');
 assert.match(source,/\.print-format \.bnd-invoice \{/);
 assert.match(source,/\.bnd-invoice \.bnd-inv-items thead \{\s*display: table-header-group;/);
 const header=source.match(/\.bnd-invoice \.bnd-inv-items th \{([\s\S]*?)\n\}/)[1];
 assert.match(header,/background: var\(--bnd-brand-solid\)/);
 assert.match(header,/color: var\(--bnd-on-brand\)/);
 assert.doesNotMatch(header,/--bnd-accent/);
 const grand=source.match(/\.bnd-invoice \.bnd-inv-grand th,[\s\S]*?\.bnd-invoice \.bnd-inv-grand td \{([\s\S]*?)\n\}/)[1];
 assert.match(grand,/border-top: 2px solid var\(--bnd-brand-solid\)/);
 assert.doesNotMatch(grand,/--bnd-accent/);
 assert.match(source,/\.bnd-invoice \.bnd-inv-summary \{\s*page-break-inside: avoid;\s*break-inside: avoid;/);
});

test('Arabic invoice units do not translate ERPNext Nos as the word no',()=>{
 const source=readFileSync('bunood_theme/templates/bunood_invoice_a4.html','utf8');
 assert.match(source,/row\.get\("uom"\) == "Nos" %\}عدد/);
});

test('screen-only layout cannot hide the following PDF rule',()=>{
 const css='@media screen { .x {display:flex;content:"} @media screen {";} @supports (display:grid) {.y{display:grid}} } @media print {.x{display:grid}}';
 assert.equal(pdfMediaCss(css).trim(),'@media print {.x{display:grid}}');
});
test('mixed, negated, print, all and unqualified media remain guarded',()=>{
 for(const media of ['screen, print','not screen','print','all','(min-width:1px)']) {
  const css=`@media ${media} {.x{display:flex}}`;
  assert.equal(pdfMediaCss(css),css);
 }
 assert.equal(pdfMediaCss('.x{display:grid}'),'.x{display:grid}');
});
test('comments and quoted media text cannot remove unrelated CSS',()=>{
 assert.equal(pdfMediaCss('/* @media screen { */ .x{content:"@media screen {";display:grid}'), ' .x{content:"@media screen {";display:grid}');
 assert.throws(()=>pdfMediaCss('@media screen { .x{display:flex}'),/Unclosed/);
});
test('a compiled escaped @media selector remains subject to the PDF guard',()=>{
 const css=sass.compileString(String.raw`.\@media screen { display: grid; } .safe {color:red}`).css;
 assert.equal(pdfMediaCss(css),css);
 assert.match(pdfMediaCss(css),/display: grid/);
});
test('escaped braces inside screen rules cannot swallow a following PDF rule',()=>{
 const css=sass.compileString(String.raw`@media screen { .foo\{ { color:red; } } .bar { display:grid; --x: \}; }`).css;
 const paper=pdfMediaCss(css);
 assert.match(paper,/\.bar/);
 assert.match(paper,/display: grid/);
 assert.doesNotMatch(paper,/color: red/);
});
