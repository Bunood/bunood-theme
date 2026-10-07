const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const js = fs.readFileSync(require('node:path').join(__dirname,'../bunood_theme/public/js/bunood.js'),'utf8');
const source = js.match(/function sidebar_route_target\([\s\S]*?\n\t\}/)[0];
const resolve = vm.runInNewContext('(' + source + ')');
const link=(kind,target)=>({type:'Link',link_type:kind,link_to:target});
const menus={
  home:{label:'Home',module:'Setup',items:[link('Workspace','Real Estate'),link('Page','bnd-pos')]},
  'real estate':{label:'Real Estate',module:'Real Estate',items:[link('Workspace','Real Estate'),link('DocType','Property')]},
  'bunood pos':{label:'Bunood POS',items:[link('Page','bnd-pos'),link('DocType','Sales Invoice')]},
  'report studio':{label:'Report Studio',items:[link('Page','bnd-report-studio')]},
  reports:{label:'Reports',items:[link('Page','bnd-report-studio')]},
  zatca:{label:'ZATCA',module:'KSA Compliance',items:[link('Workspace','ZATCA'),link('Page','bnd-zatca')]},
  invoicing:{label:'Invoicing',module:'Accounts',items:[link('DocType','Sales Invoice')]},
};
test('explicit Real Estate home beats generic Home cross-module links',()=>{
  assert.equal(resolve(['Workspaces','Real Estate'],menus,'Home'),'Real Estate');
});
test('industry entity beats a saved POS menu that does not contain it',()=>{
  assert.equal(resolve(['List','Property','List'],menus,'Bunood POS','Real Estate', {Property:['Bunood POS']}),'Real Estate');
});
test('custom Page parameters retain dedicated navigation at any depth',()=>{
  assert.equal(resolve(['bnd-report-studio','general-ledger','account~X'],menus,'Bunood POS'),'Report Studio');
  assert.equal(resolve(['bnd-pos'],menus,'Home'),'Bunood POS');
  assert.equal(resolve(['bnd-zatca'],menus,'Home'),'ZATCA');
});
test('shared financial records retain the relevant current workflow',()=>{
  assert.equal(resolve(['Form','Sales Invoice','TEST'],menus,'Invoicing','Accounts'),'Invoicing');
  assert.equal(resolve(['Form','Sales Invoice','TEST'],menus,'Bunood POS','Accounts'),'Bunood POS');
});
test('removed or forbidden menus cannot be selected by old preferences',()=>{
  assert.equal(resolve(['Workspaces','Real Estate'],{home:menus.home},'Home'),null);
  assert.equal(resolve(['List','Property','List'],{home:menus.home},'Home',undefined,{Property:['Real Estate']}),null);
});
test('industry landing preferences never replace their operational menu',()=>{
  const prepare=js.match(/function prepare_home_sidebar\(\) \{[\s\S]*?\n\t\}/)[0];
  assert.match(prepare,/const role_home = "Home"/);
  assert.match(js,/prepared_home && on_home_route\(\)/);
});

test('All Apps uses the complete native permitted workspace set',()=>{
  const menu=js.slice(js.indexOf('const roots ='),js.indexOf('const roots =')+260);
  assert.match(menu,/frappe\.boot\?\.allowed_workspaces/);
  assert.doesNotMatch(menu,/product_workspaces\(\)/);
  const desktop=js.match(/function mount_desktop_icons\(\) \{[\s\S]*?\n\t\}/)[0];
  assert.doesNotMatch(desktop,/role_workspace_names/);
  assert.match(desktop,/if \(tile\.hidden\) continue/);
});

const rowsSource=js.match(/function sidebar_visible_rows\([\s\S]*?\n\t\}/)[0];
const visibleRows=vm.runInNewContext('('+rowsSource+')');
test('native report source permission narrows role-visible report links',()=>{
  const rows=[link('Report','General Ledger'),link('Report','Trial Balance'),link('DocType','Employee')];
  assert.deepEqual(Array.from(visibleRows(rows,[],['Trial Balance']),r=>r.link_to),['Trial Balance','Employee']);
  assert.equal(visibleRows(rows,[]).length,3,'older boot payload compatibility');
});
test('unavailable Page links and their now-empty groups are removed without adding rights',()=>{
  const rows=[{type:'Section Break',label:'Finance'},link('Page','bnd-finance-close'),
    {type:'Section Break',label:'Allowed'},link('Page','bnd-inbox')];
  const result=visibleRows(rows,['bnd-inbox']);
  assert.deepEqual(Array.from(result,x=>x.label||x.link_to),['Allowed','bnd-inbox']);
  assert.equal(rows.length,4,'native source rows changed');
});
test('orphan children cannot crash native TypeLink and valid groups retain their children',()=>{
  const rows=[{...link('DocType','Employee'),child:1},{type:'Section Break',label:'Group'},
    {...link('DocType','Task'),child:1}];
  const result=visibleRows(rows,[]);
  assert.equal(result[0].child,0);
  assert.equal(result[2].child,1);
  assert.equal(rows[0].child,1,'stored custom row changed');
});
test('URL workbench aliases use the same Page visibility, custom external URLs remain',()=>{
  const rows=[{type:'Link',link_type:'URL',url:'/desk/bnd-report-studio/general-ledger'},
    {type:'Link',link_type:'URL',url:'/dining_desk'},
    {type:'Link',link_type:'URL',url:'https://client.example/'}];
  assert.deepEqual(Array.from(visibleRows(rows,[]),r=>r.url),['https://client.example/']);
});
test('Employee deep links use its HR workspace, but an intentional office workflow remains',()=>{
  const options={'engineering office':{label:'Engineering Office',items:[link('DocType','Employee')]},
    organization:{label:'Organization',items:[link('DocType','Employee')]}};
  assert.equal(resolve(['List','Employee','List'],options,null,'HR'),'Organization');
  assert.equal(resolve(['List','Employee','List'],options,'Engineering Office','HR'),'Engineering Office');
  const native={'engineering office':options['engineering office'],
    'hr setup':{label:'HR Setup',items:[link('DocType','Employee')]}};
  assert.equal(resolve(['List','Employee','List'],native,null,'Setup'),'HR Setup');
});

test('hidden cached breadcrumbs cannot change the active navigation name',()=>{
  assert.match(js,/if \(trail\.closest\("\.page-container"\)\?\.offsetParent != null\) \{\s*sb_current_workspace = ws;/);
});

test('dedicated workbenches beat the generic theme Page catalogue',()=>{
  const options={
    'bunood theme':{label:'Bunood Theme',items:[link('Page','bnd-banking'),link('Page','bnd-asset-workbench')]},
    banking:{label:'Banking',items:[link('Page','bnd-banking')]},
    assets:{label:'Assets',items:[link('Page','bnd-asset-workbench')]},
  };
  assert.equal(resolve(['bnd-banking'],options,'Bunood Theme'),'Banking');
  assert.equal(resolve(['bnd-asset-workbench'],options,'Bunood Theme'),'Assets');
});

test('absent parent app metadata cannot crash permitted HR sidebar construction',()=>{
  const guard=js.match(/function install_sidebar_app_owner_guard\([\s\S]*?\n\t\}/)[0];
  let calls=0;
  const proto={choose_app_name(){calls++;return 'native';}};
  const context={frappe:{ui:{Sidebar:{prototype:proto}},boot:{module_app:{hr:'hrms'},app_data:[]}},__:s=>s};
  const install=vm.runInNewContext('('+guard+')',context);
  assert.equal(install(),true);
  const sidebar={workspace_title:'hr',sidebar_title:'HR'};
  assert.equal(proto.choose_app_name.call(sidebar),undefined);
  assert.equal(sidebar.header_subtitle,'HR');
  assert.equal(calls,0);
  context.frappe.boot.app_data=[{app_name:'hrms'}];
  assert.equal(proto.choose_app_name.call(sidebar),'native');
  assert.equal(calls,1);
  assert.equal(install(),false);
});
