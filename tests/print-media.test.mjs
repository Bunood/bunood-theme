import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfMediaCss} from '../tools/print-media.mjs';
import * as sass from 'sass';

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
