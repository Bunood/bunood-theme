const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('bunood_theme/templates/bunood_invoice_a4.html','utf8');
test('QR and totals share a print-safe row instead of a trailing block',()=>{
 assert.match(html,/bnd-inv-summary-row[\s\S]*?bnd-inv-summary-qr[\s\S]*?bnd-inv-summary-amount/);
 assert.match(html,/vertical-align: bottom/);
 assert.match(html,/break-inside: avoid/);
 assert.doesNotMatch(html,/<div class="bnd-inv-qr"/);
 assert.equal((html.match(/zatca_qr\(doc,/g)||[]).length,1);
});
test('the QR macro is imported inside the document, after the title head',()=>{
 const head=html.slice(0, html.indexOf('<div class="bnd-invoice"'));
 assert.doesNotMatch(head,/import zatca_qr/);
 assert.match(html,/<div class="bnd-invoice"[^\n]*\n\{% from "templates\/bunood_print_macros\.html" import zatca_qr %\}/);
});
