const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const bill=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
const html=fs.readFileSync('bunood_theme/templates/bunood_invoice_a4.html','utf8');
test('Print uses a guarded in-page preview with explicit PDF download',()=>{
 assert.match(bill,/api\.invoice_print_preview = previewInvoice/);
 assert.match(bill,/preview_sandbox_invoice/);
 assert.match(bill,/preview_customer_invoice/);
 assert.match(bill,/secondary_action_label: __\("Download PDF"\)/);
 assert.match(bill,/sandbox", "allow-same-origin allow-modals"/);
 assert.match(bill,/frame\.contentWindow\.print\(\)/);
 assert.doesNotMatch(bill,/window\.open\("about:blank"/);
 assert.match(bill,/if \(autoPrint && !sandbox\)/);
 assert.match(bill,/printPreviews\.has\(key\)/);
});
test('QR and totals share a print-safe row instead of a trailing block',()=>{
 assert.match(html,/bnd-inv-summary-row[\s\S]*?bnd-inv-summary-qr[\s\S]*?bnd-inv-summary-amount/);
 assert.match(html,/vertical-align: bottom/);
 assert.match(html,/break-inside: avoid/);
 assert.doesNotMatch(html,/<div class="bnd-inv-qr"/);
 assert.equal((html.match(/zatca_qr\(doc,/g)||[]).length,1);
});
