const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(status=1) {
  let clicks=0;
  const group={isConnected:true,append(){}};
  const wrapper={isConnected:true,classList:{contains:()=>true},querySelector:()=>group,contains:()=>true};
  const node={isConnected:true,disabled:false,style:{},classList:{contains:()=>false},getAttribute:()=>null};
  const native={0:node,length:1,prop:()=>false,attr:key=>key==='data-label'?'Amend':null,css:()=>'',trigger:()=>clicks++};
  const frm={doctype:'Sales Invoice',doc:{name:'OWNED-1',docstatus:status},$wrapper:[wrapper],is_dirty:()=>false,has_perm:()=>true,custom_buttons:{'Return / Credit Note':native},page:{btn_primary:native}};
  const context={window:{cur_frm:frm,bunood_theme:{}},frappe:{get_route:()=>['Form','Sales Invoice','OWNED-1'],model:{can_create:()=>true},router:{on(){}}},document:{},__:x=>x,$:()=>({on(){}}),MutationObserver:class{},setTimeout(){},clearTimeout};
  vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/sales_invoice_journey.js','utf8'),context);
  return {api:context.window.bunood_theme.sales_invoice_journey,frm,context,node,native,wrapper,group,clicks:()=>clicks};
}
test('return delegates native handler once',()=>{const f=fixture();f.api.invoke(f.frm,'return',{});assert.equal(f.clicks(),1);});
test('amend requires resolved negative native check',()=>{const f=fixture(2);f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);});
for(const [name,change] of Object.entries({dirty:f=>f.frm.is_dirty=()=>true,local:f=>f.frm.doc.__islocal=true,staleForm:f=>f.context.window.cur_frm={},staleRoute:f=>f.context.frappe.get_route=()=>['Form','Sales Invoice','OTHER'],readDenied:f=>f.frm.has_perm=()=>false,createDenied:f=>f.context.frappe.model.can_create=()=>false,nativeAbsent:f=>f.frm.custom_buttons={},nativeDisabled:f=>f.node.disabled=true,nativeDetached:f=>f.node.isConnected=false,returnInvoice:f=>f.frm.doc.is_return=1,draft:f=>f.frm.doc.docstatus=0,cancelled:f=>f.frm.doc.docstatus=2})) {
  test(`return refuses ${name}`,()=>{const f=fixture();change(f);f.api.invoke(f.frm,'return',{});assert.equal(f.clicks(),0);});
}
for(const [name,change,state] of [
  ['pending',()=>{},{}],['already amended',()=>{},{name:'OWNED-1',amended:true}],
  ['wrong record',()=>{},{name:'OTHER',amended:false}],
  ['permission',f=>f.frm.has_perm=type=>type!=='amend',{name:'OWNED-1',amended:false}],
  ['native label',f=>f.native.attr=()=> 'Save',{name:'OWNED-1',amended:false}],
  ['hidden primary',f=>f.node.classList.contains=()=>true,{name:'OWNED-1',amended:false}],
]) test(`amend refuses ${name}`,()=>{const f=fixture(2);change(f);f.api.invoke(f.frm,'amend',state);assert.equal(f.clicks(),0);});

function lifecycle(status=1) {
  const f=fixture(status); const observers=[]; const pending=[];
  f.group.children=[]; f.group.append=b=>f.group.children.push(b);
  f.context.document.createElement=()=>({hidden:false,isConnected:true,addEventListener(event,fn){this.click=fn;},remove(){this.removed=true;this.isConnected=false;}});
  f.context.MutationObserver=class {constructor(fn){this.fire=fn;observers.push(this);}observe(){}disconnect(){this.closed=true;}};
  f.context.frappe.xcall=(method,args,verb)=>{assert.equal(method,'frappe.client.is_document_amended');assert.equal(verb,'GET');return new Promise((resolve,reject)=>pending.push({resolve,reject,args}));};
  return Object.assign(f,{observers,pending});
}
test('delayed native registration and owned group remount update actions; stop disconnects',()=>{
  const f=lifecycle();f.frm.custom_buttons={};f.api.mount(f.frm);
  assert.equal(f.group.children[0].hidden,true);
  f.frm.custom_buttons['Return / Credit Note']=f.native;f.observers[0].fire();
  assert.equal(f.group.children[0].hidden,false);
  const old=f.group.children[0];const replacement={append(b){this.children.push(b);},children:[]};
  f.wrapper.querySelector=()=>replacement;f.observers[0].fire();
  assert.equal(old.removed,true);assert.equal(replacement.children[0].hidden,false);
  f.api.stop();assert.equal(f.observers[0].closed,true);replacement.children[0].click();assert.equal(f.clicks(),0);
});
test('amend waits for native read and actual registration; Advanced round trip retains result',async()=>{
  const f=lifecycle(2);f.api.mount(f.frm);assert.equal(f.group.children[1].hidden,true);
  f.wrapper.classList.contains=()=>false;f.pending[0].resolve(null);await Promise.resolve();
  assert.equal(f.group.children[1].hidden,true);
  f.wrapper.classList.contains=()=>true;f.observers[0].fire();assert.equal(f.group.children[1].hidden,false);
  f.group.children[1].click();assert.equal(f.clicks(),1);
});
test('already amended and failed native checks remain hidden',async()=>{
  for(const value of ['EXISTING',new Error('unavailable')]) {
    const f=lifecycle(2);f.api.mount(f.frm);
    if(value instanceof Error)f.pending[0].reject(value);else f.pending[0].resolve(value);
    await Promise.resolve();await Promise.resolve();assert.equal(f.group.children[1].hidden,true);
  }
});
test('stale native read cannot enable a refreshed owner',async()=>{
  const f=lifecycle(2);f.api.mount(f.frm);const old=f.group.children[1];
  f.api.mount(f.frm);f.pending[0].resolve(null);await Promise.resolve();
  assert.equal(old.removed,true);assert.equal(f.group.children[3].hidden,true);
});
test('detached owned button cannot dispatch before observer cleanup',()=>{
  const f=lifecycle();f.api.mount(f.frm);f.group.children[0].isConnected=false;
  f.group.children[0].click();assert.equal(f.clicks(),0);
});
test('doctype concatenation tolerates preceding expression without semicolon',()=>{
  const f=fixture();
  vm.runInNewContext('window.previous = function () {}\n'+fs.readFileSync('bunood_theme/public/js/sales_invoice_journey.js','utf8'),f.context);
  assert.equal(typeof f.context.window.previous,'function');
});
test('cancelled Return Simple uses shared Amend guard; Advanced and native-only stay unavailable',async()=>{
  const f=lifecycle(2);f.frm.doc.is_return=1;
  f.wrapper.classList.contains=cls=>cls==='bnd-simple-active';
  let selector;f.wrapper.querySelector=value=>{selector=value;return f.group;};
  f.api.mount(f.frm);f.pending[0].resolve(null);await Promise.resolve();
  assert.equal(selector,'.bnd-return-document-actions');
  assert.equal(f.group.children[0].hidden,true);assert.equal(f.group.children[1].hidden,false);
  f.group.children[1].click();assert.equal(f.clicks(),1);
  f.wrapper.classList.contains=()=>false;f.observers[0].fire();
  assert.equal(f.group.children[1].hidden,true);f.group.children[1].click();assert.equal(f.clicks(),1);
});
test('normal invoice cannot claim generic Simple return ownership',()=>{
  const f=fixture(2);f.wrapper.classList.contains=cls=>cls==='bnd-simple-active';
  f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),0);
});
for (const kind of ['return','amend']) {
  for (const [name,change] of Object.entries({display:f=>f.node.style.display='none',visibility:f=>f.node.style.visibility='hidden',hiddenClass:f=>f.node.classList.contains=key=>key==='hidden',ariaHidden:f=>f.native.attr=key=>key==='aria-hidden'?'true':key==='data-label'?'Amend':null,ariaDisabled:f=>f.native.attr=key=>key==='aria-disabled'?'true':key==='data-label'?'Amend':null})) {
    test(`${kind} rejects direct native ${name} on click`,()=>{
      const f=fixture(kind==='amend'?2:1);change(f);
      f.api.invoke(f.frm,kind,{name:'OWNED-1',amended:false});assert.equal(f.clicks(),0);
    });
  }
  test(`${kind} accepts enabled native button inside closed dropdown`,()=>{
    const f=fixture(kind==='amend'?2:1);
    f.node.parentElement={hidden:true};f.node.getClientRects=()=>[];
    f.api.invoke(f.frm,kind,{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);
  });
}
test('owned Theme CSS may conceal native Amend while inline native state remains enabled',()=>{
  const f=fixture(2);f.native.css=key=>key==='display'?'none':'';
  f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);
  f.node.style.display='none';f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);
});
test('Return keeps computed direct-control visibility guard',()=>{
  const f=fixture();f.native.css=key=>key==='display'?'none':'';
  f.api.invoke(f.frm,'return',{});assert.equal(f.clicks(),0);
  f.native.css=key=>key==='visibility'?'hidden':'';
  f.api.invoke(f.frm,'return',{});assert.equal(f.clicks(),0);
});
test('Amend accepts exact encoded Arabic native label and rejects another action',()=>{
  const f=fixture(2);f.context.__=text=>text==='Amend'?'تعديل':text;
  f.native.attr=key=>key==='data-label'?encodeURIComponent('تعديل'):null;
  f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);
  f.native.attr=key=>key==='data-label'?encodeURIComponent('حفظ'):null;
  f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),1);
  f.native.attr=key=>key==='data-label'?'تعديل':null;
  f.api.invoke(f.frm,'amend',{name:'OWNED-1',amended:false});assert.equal(f.clicks(),2);
});
test('successful xcall response without message resolves native no-amend evidence',async()=>{
  const f=lifecycle(2);f.api.mount(f.frm);assert.equal(f.group.children[1].hidden,true);
  f.pending[0].resolve(undefined);await Promise.resolve();
  assert.equal(f.group.children[1].hidden,false);
  f.group.children[1].click();assert.equal(f.clicks(),1);
});
