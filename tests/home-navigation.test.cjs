const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = 'bunood_theme/public/js/home.js';
test('private Workspace links retain the native private namespace for new tabs',()=>{
 const home=model();
 assert.equal(home.workspaceHref('Owner Workspace',0),'/desk/private/owner-workspace');
 assert.equal(home.workspaceHref('Owner Workspace',false),'/desk/private/owner-workspace');
 assert.equal(home.workspaceHref('Selling',1),'/desk/selling');
});
function model() {
  const context = { window: {}, document: {}, __: x => x };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  return context.window.bunood_theme.home;
}
test('role ranking never discards permitted custom workspaces or adds denied destinations', () => {
  const home = model();
  const rows = home.navigation([{name:'Buying'}, {name:'Selling'}, {name:'Custom Operations'}], ['Sales User']);
  assert.equal(rows[0].name, 'Selling');
  assert.deepEqual(Array.from(rows, row => row.name).sort(), ['Buying','Custom Operations','Selling']);
});
test('multiple operational roles retain broad navigation and input is immutable', () => {
  const home = model();
  const input = Object.freeze([Object.freeze({name:'Buying'}), Object.freeze({name:'Stock'})]);
  assert.equal(home.profile(['Sales User','Purchase User']), 'erp');
  assert.equal(home.navigation(input, ['Sales User']).length, 2);
});
test('untrusted labels are not executable route fragments', () => {
  const home = model();
  assert.equal(home.workspaceHref('Custom / <Operations>'), '/desk/custom-%2F-%3Coperations%3E');
});
test('dashboard values distinguish unavailable from a real zero and retain currency', () => {
  const home = model();
  assert.equal(home.displayValue(null, 'SAR'), 'Unavailable');
  assert.equal(home.displayValue(undefined), 'Unavailable');
  assert.match(home.displayValue(0, 'SAR'), /0.*SAR/);
  assert.match(home.displayValue(-25, 'USD'), /-25.*USD/);
  assert.equal(home.displayValue(Infinity), 'Unavailable');
});
test('malformed values never coerce into apparently valid money', () => {
  const home = model();
  for (const value of ['',true,{},[],NaN,'12']) assert.equal(home.displayValue(value,'SAR'),'Unavailable');
});
test('company currency symbol and placement are preserved',()=>{
  const home=model();
  assert.equal(home.displayValue(12,'USD',{currency:'USD',currency_symbol:'$',currency_symbol_on_right:false}),'$ 12');
  assert.equal(home.displayValue(12,'USD',{currency:'USD',currency_symbol:'USD-custom',currency_symbol_on_right:true}),'12 USD-custom');
  assert.equal(home.displayValue(12,'EUR',{currency:'USD',currency_symbol:'$',currency_symbol_on_right:false}),'12 EUR');
});
test('both lazy Home entries have enforced payload ceilings', async () => {
  const { CEILING_KEYS, measure } = await import('../tools/payload.mjs');
  for (const key of ['home_js_gzip', 'home_css_gzip']) {
    assert.ok(CEILING_KEYS.includes(key), key);
    assert.ok(measure()[key] > 0);
  }
});
test('existing personal Home consumer preserves deep links and root preference', () => {
  const source = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
  const start = source.indexOf('let home_routed = false;');
  const end = source.indexOf('function stamp_appearance_route', start);
  assert.ok(start > 0 && end > start);
  for (const [pathname, search, hash, expected] of [
    ['/desk', '', '', 1], ['/desk/sales-invoice', '', '', 0],
    ['/desk', '?view=report', '', 0], ['/desk', '', '#my-route', 0],
  ]) {
    const routes = [];
    const context = { location: {pathname,search,hash}, frappe: {
      boot: {home_page:'bnd-home',bnd_personal:{home:'Custom work'},allowed_workspaces:[{name:'Custom work'}]},
      set_route: (...args) => routes.push(args),
    }};
    vm.runInNewContext(source.slice(start, end) + '\napply_home_route();apply_home_route();', context);
    assert.equal(routes.length, expected);
    if (expected) assert.deepEqual(routes[0], ['Workspaces','Custom work']);
  }
});
test('the Home Page selects its native sidebar without rewriting vendor DOM', () => {
  const calls = [];
  const frappe = {pages:{'bnd-home':{}},boot:{workspace_sidebar_item:{'bunood home':{items:[]}}},app:{sidebar:{setup:name=>calls.push(name)}}};
  vm.runInNewContext(fs.readFileSync('bunood_theme/bunood_theme/page/bnd_home/bnd_home.js','utf8'), {frappe, queueMicrotask});
  assert.equal(typeof frappe.pages['bnd-home'].on_page_show, 'function');
  frappe.pages['bnd-home'].on_page_show();
  assert.deepEqual(calls, ['Bunood Home']);
});
function renderedHome(payload, initial = {}) {
  class Element {
    constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.attributes={}; this.events={}; this.style={setProperty(){}}; this.isConnected=true; this.textContent=''; }
    appendChild(node){this.children.push(node);return node;}
    replaceChildren(...nodes){this.children=nodes;}
    prepend(...nodes){this.children=[...nodes,...this.children.filter(node=>!nodes.includes(node))];}
    setAttribute(key,value){this.attributes[key]=value;}
    removeAttribute(key){delete this.attributes[key];}
    addEventListener(key,fn){this.events[key]=fn;}
  }
  const calls=[], routes=[], document={documentElement:{lang:'en'},createElement:tag=>new Element(tag)};
  const context={window:{},document,__:x=>x,frappe:{call:async options=>{calls.push(options);return {message:payload};},set_route:(...args)=>routes.push(args)}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  const host=new Element('div');
  context.window.bunood_theme.home.mount(host,{roles:[],workspaces:[],groups:[],create:[],pages:[],...initial});
  const nodes=()=>{const all=[];function walk(node){all.push(node);node.children.forEach(walk);}walk(host);return all;};
  return {host,nodes,calls,routes};
}
test('actual renderer preserves KPI population and null-versus-zero while loading all scopes', async () => {
  const filter={company:'Allowed','sales_team.sales_person':'Seller',transaction_date:['between',['2026-10-01','2026-10-06']],docstatus:1};
  const scope={company:'Allowed',companies:['Allowed'],period:'month_to_date',sales_person:'Seller',sales_people:['Seller'],view:'sales',views:['overview','accountant','sales','collections','cashier']};
  const ui=renderedHome({scope,currency:'USD',kpis:[{label:'Orders',value:0,value_type:'count',available:true,doctype:'Sales Order',filters:filter},{label:'Booked value',value:null,value_type:'currency',available:false}],attention:[],trend:null,recent:null,invoice_status:{paid:null,open:null,overdue:null}});
  await new Promise(setImmediate);
  assert.equal(ui.calls[0].method,'bunood_theme.team_home.get_home_dashboard');
  assert.equal(ui.calls[0].type,'GET');
  assert.equal(ui.nodes().filter(x=>x.className==='bnd-home-view').length,5);
  const period=ui.nodes().find(x=>x.dataset.bndHomeScope==='period');
  assert.equal(period.children.length,5);
  const order=ui.nodes().find(x=>x.className==='bnd-home-metric'&&x.children.some(n=>n.textContent==='Orders'));
  assert.equal(order.disabled,false); order.events.click();
  assert.deepEqual(ui.routes[0],['List','Sales Order',filter]);
  const booked=ui.nodes().find(x=>x.className==='bnd-home-metric'&&x.children.some(n=>n.textContent==='Booked value'));
  assert.equal(booked.disabled,true);
  assert.ok(booked.children.some(x=>x.textContent==='Unavailable'));
  assert.ok(!ui.nodes().some(x=>x.textContent==='No invoice data yet'));
});
test('actual renderer passes status and trend filters unchanged including null due-date population',async()=>{
  const statusFilters={company:'Allowed',name:['in',['no-due-date','future-due']]};
  const trendFilters={company:'Allowed',docstatus:1,posting_date:['between',['2026-10-01','2026-10-06']]};
  const ui=renderedHome({scope:{company:'Allowed',companies:['Allowed'],view:'overview',views:['overview']},currency:'SAR',trend:[{label:'October',value:-50,filters:trendFilters}],invoice_status:{open:2},invoice_status_filters:{open:statusFilters},recent:[]});
  await new Promise(setImmediate);
  const status=ui.nodes().find(x=>x.className==='bnd-home-metric'&&x.children.some(n=>n.textContent==='Open'));
  status.events.click();
  ui.nodes().find(x=>x.className==='bnd-home-trend-row').events.click();
  assert.deepEqual(ui.routes,[['List','Sales Invoice',statusFilters],['List','Sales Invoice',trendFilters]]);
});
test('all-company view keeps currencies separate and refuses an unavailable collection',async()=>{
  const ui=renderedHome({scope:{company:'__all__',companies:['A','B'],views:['overview']},company_overview:[{company:'A',currency:'USD',sales_amount:10,sales_count:1},{company:'B',currency:'SAR',sales_amount:20,sales_count:2}]});
  await new Promise(setImmediate);
  assert.ok(ui.nodes().some(x=>x.textContent==='10 USD'));
  assert.ok(ui.nodes().some(x=>x.textContent==='20 SAR'));
  assert.ok(!ui.nodes().some(x=>x.textContent==='30 USD'||x.textContent==='30 SAR'));
});
test('extractor includes dynamic Home navigation, periods and KPI labels',async()=>{
  const {extractCatalogue}=await import('../tools/i18n.mjs');
  const catalogue=extractCatalogue();
  for(const label of ['Invoicing','HR Setup','Tenure','Recruitment','Transactions','Booked value','Average order value','Last 30 days','Sales drafts','Receivables due soon']) assert.ok(catalogue.has(label),label);
});
test('scope edits request new native evidence without writing user preferences',async()=>{
  const ui=renderedHome({scope:{company:'A',companies:['A','B'],period:'today',sales_person:'',view:'overview',views:['overview','sales']},trend:[],recent:[]});
  await new Promise(setImmediate);
  const company=ui.nodes().find(x=>x.dataset.bndHomeScope==='company');
  company.value='B'; company.events.change();
  await new Promise(setImmediate);
  assert.equal(ui.calls.length,2);
  assert.equal(ui.calls[1].args.company,'B');
  assert.equal(ui.calls[1].args.period,'today');
  assert.ok(ui.calls.every(call=>call.type==='GET'&&call.method==='bunood_theme.team_home.get_home_dashboard'));
});
test('cashier query failure never claims an unassigned profile',async()=>{
  for(const [profile_state,expectAbsent] of [['unavailable',false],['unassigned',true]]) {
    const ui=renderedHome({scope:{company:'A',companies:['A'],view:'cashier',views:['cashier']},cashier:{available:false,profile_state,shift:{state:'unavailable'},recent:null}});
    await new Promise(setImmediate);
    assert.equal(ui.nodes().some(x=>x.textContent==='No POS profile is assigned to you for this company. Ask an administrator to assign one.'),expectAbsent);
  }
});
test('preference persistence happens only on the explicit Save action',async()=>{
  const scope={company:'A',companies:['A'],period:'last_7_days',sales_person:'',view:'overview',views:['overview']};
  const ui=renderedHome({scope,trend:[],recent:[]});
  await new Promise(setImmediate);
  assert.ok(ui.calls.every(x=>x.type==='GET'));
  const save=ui.nodes().find(x=>x.textContent==='Save dashboard preferences');
  await save.events.click();
  assert.equal(ui.calls[1].type,'POST');
  assert.equal(ui.calls[1].method,'bunood_theme.team_home.save_home_preferences');
  assert.equal(ui.calls[1].args.company,'A');
  assert.equal(ui.calls[1].args.period,'last_7_days');
});
test('process stages use native singleton metadata and never invent a company filter on Item',async()=>{
  const ui=renderedHome({scope:{company:'A',companies:['A'],view:'overview',views:['overview']},trend:[],recent:[]},{read:['Item','Payment Reconciliation','Purchase Receipt'],document_routes:{Item:{single:false,company:false},'Payment Reconciliation':{single:true,company:false},'Purchase Receipt':{single:false,company:true}}});
  await new Promise(setImmediate);
  for(const name of ['Item','Payment Reconciliation','Purchase Receipt']) ui.nodes().find(x=>x.tagName==='button'&&x.textContent===name).events.click();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.routes)),[['List','Item',{}],['Form','Payment Reconciliation'],['List','Purchase Receipt',{company:'A'}]]);
});
test('read-only readiness displays unavailable and external checks without decision or mutation actions',async()=>{
 const ui=renderedHome({scope:{company:'A',companies:['A'],view:'overview',views:['overview']},trend:[],recent:[],start_readiness:{state:'blocked',steps:[{key:'company',state:'blocked',route:['List','Company']}]},launch_readiness:{launch_ready:false,checks:[{key:'accounting',state:'review',route:['List','Account'],action_mode:'change'},{key:'operations',state:'not-assessed',route:['List','User']} ]}});
 await new Promise(setImmediate);
 const observations=ui.nodes().filter(x=>x.className==='bnd-home-panel bnd-home-observations');
 assert.equal(observations.length,2);
 const buttons=observations.flatMap(x=>x.children).flatMap(x=>x.children).filter(x=>x.tagName==='button');
 assert.equal(buttons.length,1);
 buttons[0].events.click();
 assert.deepEqual(ui.routes,[['List','Account']]);
 assert.ok(ui.calls.every(x=>x.type==='GET'));
 assert.ok(ui.nodes().some(x=>x.textContent==='Not assessed'));
});
test('role views prioritize actual work in keyboard order without dropping permitted sections',async()=>{
 const attention=[{key:'purchase_drafts',label:'Purchases',count:1,doctype:'Purchase Invoice',filters:{}},{key:'overdue',label:'Overdue work',count:2,doctype:'Sales Invoice',filters:{}},{key:'sales_drafts',label:'Sales work',count:3,doctype:'Sales Invoice',filters:{}}];
 for(const view of ['sales','collections']) {
  const ui=renderedHome({scope:{company:'A',companies:['A'],view,views:['sales','collections']},attention,kpis:[],trend:[],recent:[],collections:{overdue:{count:2,amount:10,rows:[],filters:{}},due_soon:{count:0,amount:0,rows:[],filters:{}}}});
  await new Promise(setImmediate);
  const content=ui.nodes().find(x=>x.className==='bnd-home-dashboard-content');
  assert.equal(content.children[0].children[0].textContent,view==='sales'?'Needs your attention':'Collections');
  const panel=content.children.find(x=>x.children.some(y=>y.textContent==='Needs your attention'));
  const cards=panel.children.filter(x=>x.className==='bnd-home-metric');
  assert.equal(cards[0].children[0].textContent,view==='sales'?'Sales work':'Overdue work');
  assert.equal(cards.length,3);
  assert.ok(content.children.some(x=>x.children.some(y=>y.textContent==='Financial summary')));
 }
});
