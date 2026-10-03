const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const partial=readFileSync(join(__dirname,'../bunood_theme/public/scss/surfaces/_invoice_action_alignment.scss'),'utf8');
test('invoice actions center their actual icon and label without a phantom third slot',()=>{
 assert.match(partial,/grid-template-columns: max-content max-content;/);
 assert.match(partial,/\.bnd-bill-toolbar > \.bnd-bill-action/);
 assert.match(partial,/\.bnd-bill-action-group-commit > \.bnd-bill-action/);
 assert.match(partial,/@media \(width >= bp\.bnd-bp\(sm\)\)/);
 assert.doesNotMatch(partial,/!important|summary\s*\{|kbd\s*\{|display:\s*none/);
 assert(readFileSync(join(__dirname,'../bunood_theme/public/scss/bunood.scss'),'utf8').includes('@use "surfaces/invoice_action_alignment";'));
});
