const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(doctype, target) {
  let clicks = 0;
  const button = {length:1, prop:()=>false, trigger:event=>{assert.equal(event,'click'); clicks++;}};
  const frm = {doctype, doc:{name:'OWNED-1',docstatus:1}, is_dirty:()=>false, has_perm:()=>true, custom_buttons:{[target]:button}};
  const context = {window:{bunood_theme:{},cur_frm:frm},document:{addEventListener(){}},frappe:{model:{can_create:()=>true}},$:()=>({on(){}}),__:x=>x};
  vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8'), context);
  return {api:context.window.bunood_theme.simple_forms,frm,context,button,clicks:()=>clicks};
}
for (const [source,target] of [['Quotation','Sales Order'],['Sales Order','Delivery Note'],['Sales Order','Sales Invoice'],['Delivery Note','Sales Invoice']]) {
  test(`${source} → ${target} delegates the registered native controller once`,()=>{
    const f=fixture(source,target); assert.equal(f.api.canAdvanceSales(f.frm,target),true);
    f.api.advanceSales(f.frm,target); assert.equal(f.clicks(),1);
  });
}
for (const [name,change] of Object.entries({dirty:f=>f.frm.is_dirty=()=>true,local:f=>f.frm.doc.__islocal=true,draft:f=>f.frm.doc.docstatus=0,cancelled:f=>f.frm.doc.docstatus=2,readDenied:f=>f.frm.has_perm=()=>false,createDenied:f=>f.context.frappe.model.can_create=()=>false,staleForm:f=>f.context.window.cur_frm={},nativeAbsent:f=>f.frm.custom_buttons={},nativeDisabled:f=>f.button.prop=()=>true})) {
  test(`refuses ${name} including state changes after rendering`,()=>{const f=fixture('Sales Order','Sales Invoice'); change(f); assert.equal(f.api.canAdvanceSales(f.frm,'Sales Invoice'),false); f.api.advanceSales(f.frm,'Sales Invoice'); assert.equal(f.clicks(),0);});
}
test('unsupported transition cannot dispatch an unrelated native button',()=>{const f=fixture('Customer','Sales Invoice'); assert.equal(f.api.canAdvanceSales(f.frm,'Sales Invoice'),false); f.api.advanceSales(f.frm,'Sales Invoice'); assert.equal(f.clicks(),0);});
