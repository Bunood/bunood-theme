const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const file=path.join(__dirname,'../bunood_theme/public/js/sales_return_workbench.js');
function paymentButton(trigger,disabled=()=>false){return {0:{isConnected:true},length:1,prop:k=>k==='disabled'&&disabled(),hasClass:()=>false,attr:()=>null,css:()=>'',is:()=>true,trigger};}
class Node {
 constructor(){this.children=[];this.parentNode=null;this.hidden=false;this.disabled=false;this.dataset={};this.attrs={};this.events={};this.isConnected=true;this.className='';const set=new Set();this.classList={add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,on)=>on?set.add(x):set.delete(x)};}
 append(...nodes){for(const n of nodes){n.remove?.();n.parentNode=this;this.children.push(n);}}
 prepend(...nodes){this.append(...nodes);}
 before(...nodes){const parent=this.parentNode;for(const n of nodes){n.remove?.();n.parentNode=parent;parent.children.splice(parent.children.indexOf(this),0,n);}}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,v){this.events[k]=v;}
 click(){if(!this.disabled&&!this.hidden)return this.events.click?.();}
}
function setup({permissions={},docstatus=0,local=false,dirty=true}={}){
 const calls=[],fields={},wrapper=new Node(),layout=new Node(),toolbar=new Node(),observers=[];wrapper.append(layout);
 for(const name of ['company','customer','return_against','amended_from','items','taxes','outstanding_amount','custom_required','custom_extension']){
  const node=new Node();layout.append(node);fields[name]={$wrapper:[node],df:{fieldname:name,fieldtype:name==='items'?'Table':'Data',reqd:name==='custom_required'},get_status:()=>name==='return_against'?'Read':'Write'};
 }
 const grid={native:true};fields.items.grid=grid;
 const doc={doctype:'Sales Invoice',name:'RETURN-1',is_return:1,docstatus,__islocal:local,customer:'Customer',items:[{name:'ROW',qty:-2}],outstanding_amount:-100,status:docstatus===1?'Return':'Draft'};
 const frm={doctype:'Sales Invoice',doc,page:{inner_toolbar:[toolbar]},fields_dict:fields,meta:{name:'Sales Invoice',is_submittable:1},custom_buttons:{},has_perm:p=>permissions[p]!==false,is_dirty:()=>dirty,
  save:async mode=>{calls.push(['save',mode,doc.items[0].qty]);},print_doc:()=>calls.push(['print']),
  $wrapper:{0:wrapper,find:()=>({first:()=>[layout]}),toggleClass:(c,on)=>wrapper.classList.toggle(c,on)}};
 let route=['Form','Sales Invoice',doc.name];const events={},formEvents={};
 const api={claim_native:owner=>calls.push(['claim',owner]),release_native:owner=>calls.push(['release',owner]),
  document_actions:{actionState:f=>({showSave:Number(f.doc.docstatus)===0&&(f.doc.__islocal||f.is_dirty())&&!f.save_disabled&&f.has_perm(f.doc.__islocal?'create':'write'),showSubmit:Number(f.doc.docstatus)===0&&!f.doc.__islocal&&!f.is_dirty()&&f.has_perm('submit'),showPrint:!f.doc.__islocal}),submitWithoutConfirmation:f=>calls.push(['submit',f.doc.name])},
  simple_forms:{TaskWorkbench:class{
   constructor(f,spec){this.frm=f;this.spec=spec;this.root=new Node();this.summary=new Node();this.root.append(this.summary);this.origins=new Map();this.selected=null;}
   refresh(active,selected){this.selected=selected;if(!active)return this.restore();for(const name of selected){const node=this.frm.fields_dict[name]?.$wrapper?.[0];if(!node)continue;if(!this.origins.has(node))this.origins.set(node,node.parentNode);this.root.append(node);}}
   restore(){for(const [node,parent]of this.origins)parent.append(node);this.origins.clear();}
  }}};
 const window={bunood_theme:api,cur_frm:frm};
 const frappe={get_route:()=>route,router:{on:(name,fn)=>events[name]=fn},ui:{form:{on:(dt,handlers)=>formEvents[dt]=handlers}},model:{can_create:dt=>permissions.payment!==false}};
 class MutationObserver{constructor(callback){this.callback=callback;observers.push(this);}observe(target,options){this.target=target;this.options=options;this.connected=true;}disconnect(){this.connected=false;}}
 const context={window,frappe,MutationObserver,__:(x)=>x,document:{createElement:()=>new Node()},console,setTimeout:fn=>fn()};
 const actions=api.document_actions;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../bunood_theme/public/js/document_actions.js'),'utf8'),context);Object.assign(api.document_actions,actions);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 return {api,frm,doc,fields,grid,wrapper,layout,calls,window,toolbar,observers,mutateToolbar:()=>observers.filter(o=>o.connected&&o.target===toolbar).forEach(o=>o.callback([])),routeTo:value=>{route=value;events.change?.();},formEvents};
}
test('return variant mounts native negative grid and all mandatory/extensions unchanged',()=>{
 const x=setup();const node=x.fields.items.$wrapper[0];assert.equal(x.api.sales_return.mount(x.frm),true);
 const ui=x.api.sales_return.controller(x.frm);assert.ok(ui.workbench.selected.has('custom_required'));assert.ok(ui.workbench.selected.has('custom_extension'));
 assert.equal(x.fields.items.grid,x.grid);assert.equal(x.fields.items.$wrapper[0],node);assert.equal(x.doc.items[0].qty,-2);assert.equal(x.fields.return_against.get_status(),'Read');
 assert.ok(!x.calls.some(c=>['save','submit','payment'].includes(c[0])));
});
test('financial read/create/write/submit permissions remain native gates',async()=>{
 const denied=setup({permissions:{read:false}});assert.equal(denied.api.sales_return.mount(denied.frm),false);
 const x=setup({local:true,permissions:{create:false,submit:false}});x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);await ui.save();await ui.submit();assert.ok(!x.calls.some(c=>['save','submit'].includes(c[0])));
 const readonly=setup({permissions:{write:false}});readonly.api.sales_return.mount(readonly.frm);await readonly.api.sales_return.controller(readonly.frm).save();assert.ok(!readonly.calls.some(c=>c[0]==='save'));
});
test('save delegates native negative-row draft and never auto-submits or pays',async()=>{
 const x=setup();x.api.sales_return.mount(x.frm);await x.api.sales_return.controller(x.frm).save();
 assert.deepEqual(x.calls.filter(c=>c[0]==='save'),[['save','Save',-2]]);assert.ok(!x.calls.some(c=>['submit','payment'].includes(c[0])));
});
test('submit uses shared native contract only on clean permitted saved drafts',async()=>{
 const dirty=setup();dirty.api.sales_return.mount(dirty.frm);await dirty.api.sales_return.controller(dirty.frm).submit();assert.ok(!dirty.calls.some(c=>c[0]==='submit'));
 const x=setup({dirty:false});x.api.sales_return.mount(x.frm);await x.api.sales_return.controller(x.frm).submit();assert.ok(x.calls.some(c=>c[0]==='submit'));assert.ok(!x.calls.some(c=>c[0]==='payment'));
});
test('return refund invokes only registered enabled native Payment Entry handler',()=>{
 const x=setup({docstatus:1,dirty:false});let disabled=false;
 x.frm.custom_buttons['Payment']=paymentButton(event=>x.calls.push(['payment',event]),()=>disabled);
 x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);ui.refund();assert.ok(x.calls.some(c=>c[0]==='payment'));
 disabled=true;x.calls.length=0;ui.refund();assert.equal(x.calls.length,0);
 delete x.frm.custom_buttons['Payment'];ui.refund();assert.equal(x.calls.length,0);
});
test('negative outstanding return is never relabeled Paid',()=>{
 const x=setup({docstatus:1,dirty:false});x.api.sales_return.mount(x.frm);
 assert.equal(x.api.sales_return.controller(x.frm).status.textContent,'Return');
});
test('Advanced restores same nodes and route exit releases only owned state',()=>{
 const x=setup();const node=x.fields.items.$wrapper[0];x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 ui.setMode(false);assert.equal(node.parentNode,x.layout);assert.equal(x.fields.items.grid,x.grid);
 ui.setMode(true);assert.equal(node.parentNode,ui.workbench.root);
 x.routeTo(['List','Sales Invoice']);assert.equal(node.parentNode,x.layout);assert.ok(x.calls.some(c=>c[0]==='release'));
 assert.equal(node.classList.contains('bnd-simple-visible'),false);
});
test('stale route/form/doc handlers never save submit print or refund',async()=>{
 for(const change of [x=>x.routeTo(['Form','Sales Invoice','OTHER']),x=>x.window.cur_frm={},x=>x.frm.doc={...x.doc,name:'OTHER'}]){
  const x=setup({dirty:false});x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);change(x);x.calls.length=0;
  await ui.save();await ui.submit();ui.print();ui.refund();assert.equal(x.calls.length,0);
 }
});
test('ordinary sales invoice never claims the return workbench',()=>{
 const x=setup();x.doc.is_return=0;assert.equal(x.api.sales_return.mount(x.frm),false);assert.equal(x.calls.length,0);
});
test('permissions are rechecked at click time and cancelled returns stay native cancelled',async()=>{
 const permissions={};const x=setup({permissions});x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 permissions.write=false;await ui.save();assert.ok(!x.calls.some(c=>c[0]==='save'));
 const cancelled=setup({docstatus:2,dirty:false});cancelled.api.sales_return.mount(cancelled.frm);const c=cancelled.api.sales_return.controller(cancelled.frm);
 await c.save();await c.submit();c.refund();assert.equal(c.status.textContent,'Cancelled');
 assert.ok(!cancelled.calls.some(call=>['save','submit','payment'].includes(call[0])));
});
test('pending native save prevents duplicate actions and never continues after route departure',async()=>{
 const x=setup();let resolve;let saves=0;x.frm.save=()=>{saves++;return new Promise(r=>resolve=r);};
 x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);const pending=ui.save();
 await ui.save();await ui.submit();ui.print();assert.equal(saves,1);assert.ok(ui.saveButton.disabled);
 x.routeTo(['List','Sales Invoice']);x.calls.length=0;resolve();await pending;
 assert.equal(x.calls.length,0);assert.equal(x.api.sales_return.controller(x.frm),undefined);
});
test('Advanced actions are inert and original classes survive teardown',async()=>{
 const x=setup();const node=x.fields.items.$wrapper[0];node.classList.add('bnd-simple-omitted');x.wrapper.classList.add('bnd-task-simple-active');
 x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);ui.setMode(false);x.calls.length=0;
 await ui.save();await ui.submit();ui.refund();ui.print();assert.equal(x.calls.length,0);
 assert.equal(node.parentNode,x.layout);assert.ok(node.classList.contains('bnd-simple-omitted'));assert.ok(x.wrapper.classList.contains('bnd-task-simple-active'));
});
test('refund requires native create permission even when a handler exists',()=>{
 const permissions={};const x=setup({permissions,docstatus:1,dirty:false});x.frm.custom_buttons['Payment']=paymentButton(()=>x.calls.push(['payment']));
 x.api.sales_return.mount(x.frm);permissions.payment=false;x.api.sales_return.controller(x.frm).refund();
 assert.ok(!x.calls.some(c=>c[0]==='payment'));
});
test('native Payment handler must remain connected visible and enabled at click time',()=>{
 for(const disable of [b=>b[0].isConnected=false,b=>b.css=k=>k==='display'?'none':'',b=>b.css=k=>k==='visibility'?'hidden':'',b=>b.prop=k=>k==='hidden',b=>b.hasClass=()=>true,b=>b.attr=()=> 'true']){
  const x=setup({docstatus:1,dirty:false});const button=paymentButton(()=>x.calls.push(['payment']));x.frm.custom_buttons.Payment=button;
  x.api.sales_return.mount(x.frm);disable(button);x.api.sales_return.controller(x.frm).refund();assert.ok(!x.calls.some(c=>c[0]==='payment'));
 }
});
test('closed native Create dropdown does not disable its registered Payment handler',()=>{
 const x=setup({docstatus:1,dirty:false});const button=paymentButton(()=>x.calls.push(['payment']));
 button.is=()=>false;button[0].parentNode={hidden:true};x.frm.custom_buttons.Payment=button;
 x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);assert.equal(ui.refundButton.hidden,false);ui.refund();
 assert.ok(x.calls.some(c=>c[0]==='payment'));
});
test('native hidden and field-permission denied controls are never selected or made visible',()=>{
 const x=setup();x.fields.customer.df.hidden=1;x.fields.taxes.get_status=()=> 'None';x.fields.custom_extension.df.hidden_due_to_dependency=1;
 x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 for(const name of ['customer','taxes','custom_extension']){assert.ok(!ui.workbench.selected.has(name));assert.equal(x.fields[name].$wrapper[0].parentNode,x.layout);assert.ok(!x.fields[name].$wrapper[0].classList.contains('bnd-simple-visible'));}
 x.fields.items.get_status=()=> 'None';ui.refresh();assert.equal(x.fields.items.$wrapper[0].parentNode,x.layout);assert.ok(!ui.workbench.selected.has('items'));assert.ok(!x.fields.items.$wrapper[0].classList.contains('bnd-simple-visible'));
});
test('late native Payment registration updates only owned action state without remounting fields',()=>{
 const x=setup({docstatus:1,dirty:false});x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 assert.equal(ui.refundButton.hidden,true);const parent=x.fields.items.$wrapper[0].parentNode;
 ui.workbench.refresh=()=>assert.fail('toolbar mutation must not remount native fields');
 const button=paymentButton(()=>x.calls.push(['payment']));x.frm.custom_buttons.Payment=button;x.toolbar.append(new Node());x.mutateToolbar();
 assert.equal(ui.refundButton.hidden,false);assert.equal(x.fields.items.$wrapper[0].parentNode,parent);
 button.prop=k=>k==='disabled';x.mutateToolbar();assert.equal(ui.refundButton.hidden,true);
 assert.equal(x.observers.length,1);assert.equal(x.observers[0].target,x.toolbar);assert.equal(x.observers[0].options.subtree,true);
 x.routeTo(['List','Sales Invoice']);assert.equal(x.observers[0].connected,false);
});
test('stale document toolbar observer disconnects without resurrecting Return controls',()=>{
 const x=setup({docstatus:1,dirty:false});x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 x.frm.doc={...x.doc,name:'OTHER'};x.mutateToolbar();assert.equal(x.api.sales_return.controller(x.frm),undefined);
 assert.equal(x.observers[0].connected,false);assert.equal(ui.header.parentNode,null);
});
test('return panels use existing CSS shapes with full-width source/customer and no empty outcome',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../bunood_theme/public/scss/surfaces/_sales_bill.scss'),'utf8');
 const x=setup();x.api.sales_return.mount(x.frm);const ui=x.api.sales_return.controller(x.frm);
 for(const panel of ui.workbench.spec.panels) assert.ok(css.includes(`.bnd-task-panel-${panel[4]}`),`unsupported shape ${panel[4]}`);
 assert.equal(ui.workbench.spec.panels.find(p=>p[0]==='source')[4],'lead');
 assert.equal(ui.workbench.spec.panels.find(p=>p[0]==='customer')[4],'lead');
 assert.match(css,/\.bnd-task-panel-lead\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
 assert.equal(ui.workbench.summary.hidden,true);ui.setMode(false);ui.setMode(true);assert.equal(ui.workbench.summary.hidden,true);
});
