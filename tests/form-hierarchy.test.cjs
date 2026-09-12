const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class Node {
  constructor(tag='div'){ this.tagName=tag; this.children=[]; this.parentNode=null; this.attributes={}; this.hidden=false; this.classList={toggle(){}}; }
  append(...nodes){ for(const node of nodes){ if(node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node),1); node.parentNode=this; this.children.push(node); } }
  before(node){ const parent=this.parentNode,index=parent.children.indexOf(this); if(node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node),1); node.parentNode=parent; parent.children.splice(index,0,node); }
  replaceWith(node){ const parent=this.parentNode,index=parent?.children.indexOf(this); if(!parent||index<0)return; if(node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node),1); parent.children[index]=node; node.parentNode=parent; this.parentNode=null; }
  setAttribute(name,value){ this.attributes[name]=value; }
  get isConnected(){ let node=this; while(node.parentNode)node=node.parentNode; return node===page; }
}
const page=new Node('page');
const document={createElement:tag=>new Node(tag),createComment:()=>new Node('#comment')};
const context={window:{bunood_theme:{}},document,frappe:{after_ajax:async()=>{},perm:{has_perm(){}}},$:()=>({on(){}}),__:s=>s,setTimeout,clearTimeout};
context.window.frappe=context.frappe;
context.frappe.provide=path=>{ let value=context.window; for(const part of path.split('.'))value=value[part]||=( {} ); return value; };
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8'),context);
const api=context.window.bunood_theme.simple_forms;

test('group composer renders profile order and restores the exact native nodes',()=>{
  const order=['territory','tax_id','customer_name','email_id','customer_type','default_currency','customer_group','mobile_no','default_price_list'];
  const layout=new Node('layout'); page.append(layout);
  const fields_dict={};
  for(const name of order){ const node=new Node(); node.name=name; layout.append(node); fields_dict[name]={$wrapper:[node]}; }
  const frm={doctype:'Customer',doc:{doctype:'Customer',customer_name:'Acme',__unsaved:1},meta:{name:'Customer'},fields_dict};
  const before=JSON.stringify(frm.doc),nodes=Object.fromEntries(order.map(name=>[name,fields_dict[name].$wrapper[0]]));
  const workbench=new api.GroupedWorkbench(frm,api.compositions.Customer); page.append(workbench.root);
  workbench.refresh(true,new Set(api.profiles.Customer));
  assert.deepEqual(workbench.groups[0].fields.children.map(node=>node.name),['customer_name','customer_type','customer_group','territory']);
  assert.deepEqual(workbench.groups[1].fields.children.map(node=>node.name),['tax_id','mobile_no','email_id']);
  assert.equal(JSON.stringify(frm.doc),before,'composition must not mutate values or dirty state');
  workbench.refresh(false,new Set());
  assert.deepEqual(layout.children.map(node=>node.name),order,'Advanced restores native order');
  for(const name of order)assert.equal(fields_dict[name].$wrapper[0],nodes[name],`${name} wrapper identity survives`);
});

test('unexpected writable mandatory fields are placed in Required to save',()=>{
  const layout=new Node('layout'); page.append(layout);
  const required=new Node(); required.name='mandatory_extension'; layout.append(required);
  const frm={doctype:'Company',doc:{doctype:'Company'},meta:{name:'Company'},fields_dict:{mandatory_extension:{$wrapper:[required]}}};
  const workbench=new api.GroupedWorkbench(frm,api.compositions.Company); page.append(workbench.root);
  workbench.refresh(true,new Set(['mandatory_extension']));
  assert.equal(workbench.required.hidden,false);
  assert.deepEqual(workbench.requiredFields.children.map(node=>node.name),['mandatory_extension']);
});
