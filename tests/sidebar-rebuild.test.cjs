const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'bunood_theme/public/js/bunood.js'), 'utf8');
test('All Apps in workspace menu opens the native desktop grid', () => {
  let destination;
  const source = js.match(/function sb_head_menu\(\) \{([\s\S]*?)\n\t\}/)[0];
  const menu = vm.runInNewContext('(' + source + ')', {
    __:value=>value, go_home(){}, document:{querySelector:()=>null},
    frappe:{boot:{allowed_workspaces:[]},set_route:value=>{destination=value;}},
  })();
  menu.find(item=>item.label==='All Apps').run();
  assert.equal(destination,'desktop');
});
test('filled workspace header chevron uses on-brand contrast', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar.scss'),'utf8');
  const rule=css.match(/\.bnd-sb-head-chev \{([\s\S]*?)\n  \}/)[1];
  assert.match(rule,/color: var\(--bnd-on-brand\)/);
  assert.match(rule,/svg, use \{ stroke: currentColor/);
});
function model() {
  const match = js.match(/function sb_compact_entries\(rows\) \{([\s\S]*?)\n\t\}/);
  assert.ok(match, 'dedicated compact navigation model exists');
  return vm.runInNewContext('(' + match[0] + ')');
}
test('rail retains loose destinations and sections in native order', () => {
  const result = model()([
    {label:'Home',href:'/desk/selling'},
    {label:'Invoice',href:'/desk/sales-invoice',active:true},
    {label:'Reports',section:true,children:3},
  ]);
  assert.deepEqual(Array.from(result, e=>e.label), ['Home','Invoice','Reports']);
  assert.equal(result[1].active,true);
});
test('rail excludes hidden, empty and unsafe destinations without fabricating routes', () => {
  const result = model()([
    {label:'Hidden',href:'/desk/hidden',hidden:true},
    {label:'Empty',section:true,children:0},
    {label:'Remote',href:'https://external.example'},
    {label:'Script',href:'javascript:void(0)'},
    {label:'Protocol',href:'//external.example'},
    {label:'Valid',href:'/desk/quotation'},
  ]);
  assert.deepEqual(Array.from(result,e=>e.label), ['Valid']);
});
test('rail deduplicates destination links but keeps separate labeled sections', () => {
  assert.equal(model()([{label:'A',href:'/desk/item'},{label:'B',href:'/desk/item'},
    {label:'Reports',section:true,children:1},{label:'Settings',section:true,children:2}]).length,3);
});
test('native current-marker refresh preserves the unchanged compact renderer current state', () => {
  const current={value:'page',removeAttribute(){this.value=null;},closest(selector){return selector==='.bnd-compact-nav'?{}:null;}};
  const match=js.match(/function sb_mark_current\(\) \{([\s\S]*?)\n\t\}/);
  const run=vm.runInNewContext('('+match[0]+')',{
    document:{querySelectorAll:()=>[current],querySelector:()=>null},
    sb_active:()=>true,container_on:()=>true,sidebar_is_hidden:()=>false,
  });
  run(); run();
  assert.equal(current.value,'page');
});
test('brand is explicitly reset as a button, not browser bevel styling', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar.scss'),'utf8');
  const rule=css.match(/html\[data-bnd-sb-color\] \.bnd-sb-brand \{([^}]+)/)[1];
  assert.match(rule,/appearance:\s*none/);
  assert.match(rule,/border:\s*0/);
  assert.match(rule,/background:\s*transparent/);
});
test('narrow handoff closes through the native owner before the first mobile toggle', () => {
  const pane={}; let expanded=true,closed=0;
  const native={wrapper:[pane],close(){expanded=false;closed++;}};
  const match=js.match(/function on_breakpoint_change\(\) \{([\s\S]*?)\n\t\}/);
  vm.runInNewContext('('+match[0]+')()',{document:{querySelector:()=>pane},window:{frappe:{app:{sidebar:native}}},is_narrow:()=>true,apply_viewport_mode:()=>{},apply_sidebar_attrs:()=>{},sb_state:{},remount_chrome:()=>{}});
  assert.equal(expanded,false); assert.equal(closed,1);
  expanded=!expanded; assert.equal(expanded,true);
});
test('returning to desktop releases the native mobile inline pane height before rail sizing', () => {
  let height='844px';
  const container={style:{},querySelector:()=>({style:{removeProperty:p=>{if(p==='height')height='';}}})};
  const match=js.match(/function sb_apply_width\(\) \{([\s\S]*?)\n\t\}/);
  const context={document:{querySelector:()=>container,documentElement:{hasAttribute:()=>true}},is_narrow:()=>false};
  vm.runInNewContext('('+match[0]+')()',context); assert.equal(height,'');
  height='844px';context.is_narrow=()=>true;
  vm.runInNewContext('('+match[0]+')()',context); assert.equal(height,'844px');
});
test('existing rail without a topbar cannot retain toggle ownership', () => {
  let owned=true;
  const container={dataset:{bndRail:'1'}};
  const context={document:{querySelector:s=>s==='.body-sidebar-container'?container:null,querySelectorAll:()=>[],documentElement:{hasAttribute:()=>true}},is_narrow:()=>false,sb_mount_compact_nav:()=>{},bnd_own:()=>{owned=true;},bnd_disown:()=>{owned=false;}};
  const source=['sb_mount_topbar_toggle','sb_mount_rail'].map(name=>js.match(new RegExp('function '+name+'\\(container\\) \\{([\\s\\S]*?)\\n\\t\\}|function '+name+'\\(\\) \\{([\\s\\S]*?)\\n\\t\\}'))[0]).join('\n');
  vm.runInNewContext(source+'\nsb_mount_rail();',context);
  assert.equal(owned,false);
});
test('Escape returns focus from an expanded child to its compact section trigger', () => {
  let keydown,focused=0;
  const classes=new Set(['bnd-rail-open']);
  const container={dataset:{},style:{},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:(...keys)=>keys.forEach(k=>classes.delete(k))},querySelector:()=>null,contains:()=>true,_bnd_rail_return:{isConnected:true,focus:()=>focused++}};
  const document={activeElement:{},documentElement:{hasAttribute:()=>true},querySelector:s=>s==='.body-sidebar-container'?container:{},querySelectorAll:()=>[],addEventListener:(event,fn)=>{if(event==='keydown')keydown=fn;}};
  const match=js.match(/function sb_mount_rail\(\) \{([\s\S]*?)\n\t\}/);
  vm.runInNewContext('('+match[0]+')()',{document,is_narrow:()=>false,sb_mount_compact_nav:()=>{},sb_mount_topbar_toggle:()=>{}});
  let stopped=false,prevented=false;
  keydown({key:'Escape',stopPropagation:()=>stopped=true,preventDefault:()=>prevented=true});
  if(!stopped) focused=0; // Native window Escape handler blurs the active element.
  assert.equal(classes.has('bnd-rail-open'),false);
  assert.equal(focused,1);
  assert.equal(prevented,true);
  classes.add('bnd-rail-open'); container.contains=()=>false;
  keydown({key:'Escape',stopPropagation:()=>assert.fail('outside flow'),preventDefault:()=>assert.fail('outside flow')});
  assert.equal(classes.has('bnd-rail-open'),true);
});
test('one layout file replaces negative header reach and compressed native rail', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar.scss'),'utf8');
  assert.doesNotMatch(css,/inset-inline-start:\s*calc\(-1 \* var\(--bnd-sb-rail-w\)\)/);
  assert.doesNotMatch(css,/\.bnd-sb-brand-chip\s*\{/);
  const layout=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-layout.scss'),'utf8');
  assert.match(layout,/position:\s*fixed/);
  assert.match(layout,/100dvh/);
  assert.doesNotMatch(layout,/body \{ block-size:/);
  assert.match(layout,/background: inherit/);
  assert.match(layout,/inline-size: var\(--bnd-sb-rail-w\); padding-inline/);
  assert.match(layout,/data-bnd-own~="panetoggle"/);
});
