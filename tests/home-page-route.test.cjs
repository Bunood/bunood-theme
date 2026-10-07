const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function page(options=null,permitted=true){
 const tasks=[];const sidebar={title:'Stock',setup(name){this.title=name;}};
 const frappe={pages:{'bnd-home':{},'bnd-report-studio':{}},boot:{workspace_sidebar_item:permitted?{'bunood home':{}}:{}},app:{sidebar},route_options:options};
 const context={frappe,window:{},queueMicrotask:fn=>tasks.push(fn)};
 vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/page_sidebar.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync('bunood_theme/bunood_theme/page/bnd_home/bnd_home.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync('bunood_theme/bunood_theme/page/bnd_report_studio/bnd_report_studio.js','utf8'),context);
 return {frappe,sidebar,show:()=>frappe.pages['bnd-home'].on_page_show(),flush:()=>tasks.splice(0).forEach(fn=>fn()),
  change(fallback){if(frappe.route_options?.sidebar){sidebar.setup(frappe.route_options.sidebar);frappe.route_options=null;}else sidebar.setup(fallback);}};
}
test('preloaded Home root and deep routes retain native sidebar after router change',()=>{
 for(const fallback of ['Stock','Bunood Home']){const p=page();p.show();p.change(fallback);p.flush();assert.equal(p.sidebar.title,'Bunood Home');assert.equal(p.frappe.route_options,null);}
});

test('report subroutes select the same permitted sidebar without leaking route filters',()=>{
 const p=page({company:'keep'});p.frappe.pages['bnd-report-studio'].on_page_show();p.flush();p.change('Accounts');p.flush();
 assert.equal(p.sidebar.title,'Bunood Home');assert.equal(p.frappe.route_options,null);
 const denied=page(null,false);denied.frappe.pages['bnd-report-studio'].on_page_show();denied.flush();assert.equal(denied.sidebar.title,'Stock');
});
test('asynchronously shown Home does not leak its sidebar into next navigation',()=>{
 const p=page({filter:'keep'});p.change('Stock');p.show();p.flush();assert.equal(p.sidebar.title,'Bunood Home');assert.equal(p.frappe.route_options.filter,'keep');assert.equal(p.frappe.route_options.sidebar,undefined);p.change('Selling');assert.equal(p.sidebar.title,'Selling');
});
test('explicit native sidebar and other route options remain authoritative',()=>{
 const options={sidebar:'Custom allowed workspace',filter:'keep'};const p=page(options);p.show();p.flush();assert.equal(p.frappe.route_options,options);p.change('Stock');assert.equal(p.sidebar.title,'Custom allowed workspace');
});
test('denied Home boot navigation never gains an association',()=>{
 const options={filter:'keep'};const p=page(options,false);p.show();p.flush();assert.equal(p.frappe.route_options,options);assert.equal(p.sidebar.title,'Stock');
});
test('cleanup never removes a subsequently supplied explicit sidebar',()=>{
 const p=page();p.show();p.frappe.route_options.sidebar='Explicit owner sidebar';p.flush();assert.equal(p.frappe.route_options.sidebar,'Explicit owner sidebar');
});

test('release entry expires only owned native Page script caches',()=>{
 const removed=[];
 vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/page_sidebar.js','utf8'),{window:{localStorage:{removeItem:key=>removed.push(key)}},frappe:{},queueMicrotask:()=>{}});
 assert.deepEqual(removed,['_page:bnd-home','_page:bnd-report-studio']);
});
