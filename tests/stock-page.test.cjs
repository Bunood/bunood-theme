const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};}
 append(node){this.children.push(node);}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,fn){this.events[name]=fn;}
 replaceChildren(){this.children=[];}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(read=['Stock Entry'],create=['Stock Entry'],failure=false){
 const root=new Node('main'),calls=[],created=[];let company='Test Company';
 const page={main:[root],add_field:()=>({get_value:()=>company,set_value(value){company=value;}}),set_primary_action(){},set_secondary_action(){}};
 const frappe={pages:{'bnd-stock':{}},ui:{make_app_page:()=>page},boot:{user:{can_read:read,can_create:create}},
 defaults:{get_user_default:()=>company},new_doc:(...args)=>created.push(args),set_route(){},datetime:{str_to_user:x=>x},
 call:async options=>{calls.push(options);if(failure)throw new Error('native permission denied');return {message:[]};}};
 vm.runInNewContext(fs.readFileSync('bunood_theme/bunood_theme/page/bnd_stock/bnd_stock.js','utf8'),{frappe,__ : x=>x,document:{createElement:tag=>new Node(tag)}});
 const wrapper={};frappe.pages['bnd-stock'].on_page_load(wrapper);wrapper.bunood_stock_refresh();
 const nodes=()=>{const all=[];const walk=n=>{all.push(n);n.children.forEach(walk);};walk(root);return all;};
 return {calls,created,nodes,frappe};
}
test('stock desk reads bounded native documents and creates only unsaved native movements',async()=>{
 const f=fixture();await tick();
 assert.equal(f.calls[0].method,'frappe.client.get_list');assert.equal(f.calls[0].type,'GET');
 assert.equal(f.calls[0].args.limit_page_length,25);assert.equal(f.calls[0].args.filters.company,'Test Company');
 f.nodes().find(n=>n.textContent==='Material Transfer').events.click();
 assert.equal(f.created[0][0],'Stock Entry');assert.equal(f.created[0][1].stock_entry_type,'Material Transfer');
 assert.equal(f.created[0][1].company,'Test Company');
});
test('limited roles begin on their permitted tab and receive no create buttons',async()=>{
 const f=fixture(['Stock Reconciliation'],[]);await tick();
 assert.equal(f.calls[0].args.doctype,'Stock Reconciliation');
 assert.equal(f.nodes().filter(n=>['Material Transfer','Material Receipt','Material Issue'].includes(n.textContent)).length,0);
});
test('native permission failures display retry rather than an empty balance',async()=>{
 const f=fixture(['Stock Entry'],[],true);await tick();
 assert.ok(f.nodes().some(n=>n.textContent==='Unable to load records'));
 assert.ok(f.nodes().some(n=>n.textContent==='Retry'));
});
