const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'bunood_theme/public/js/bunood.js'), 'utf8');
const sidebarLayout = fs.readFileSync(path.join(root, 'bunood_theme/public/scss/chrome/_sidebar-layout.scss'), 'utf8');
const sidebarStyle = fs.readFileSync(path.join(root, 'bunood_theme/public/scss/chrome/_sidebar.scss'), 'utf8');
const statusbarStyle = fs.readFileSync(path.join(root, 'bunood_theme/public/scss/chrome/_statusbar.scss'), 'utf8');
const desktopStyle = fs.readFileSync(path.join(root, 'bunood_theme/public/scss/surfaces/_desktop.scss'), 'utf8');
test('desktop top bar and sticky page head share one reserved offset', () => {
  const desktopTopbar = sidebarLayout.match(/html\[data-bnd-desk\]\[data-bnd-topbar\]:not\(\[data-bnd-narrow\]\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(desktopTopbar, /\.main-section\s*\{[\s\S]*?padding-block-start:\s*var\(--bnd-topbar-h\)/);
  assert.match(desktopTopbar, /\.page-head\s*\{\s*inset-block-start:\s*0;/);
});
test('mobile bottom navigation keeps four equal cells and one icon size', () => {
  assert.match(statusbarStyle, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(statusbarStyle, /html\[data-bnd-narrow\]\[data-theme\] \.bnd-statusbar\s*\{[\s\S]*?inset-inline:\s*0;/);
  assert.match(js, /function mount_search\(\) \{[\s\S]*?if \(is_narrow\(\) && search_slot_host\("botcenter"\)\) \{[\s\S]*?mount_search_at\("botcenter"\);[\s\S]*?return;/);
  assert.match(statusbarStyle, /\[data-bnd-part="home"\][^}]*order:\s*10/);
  assert.match(statusbarStyle, /\[data-bnd-part="apps"\][^}]*order:\s*20/);
  assert.match(statusbarStyle, /\[data-bnd-part="search"\][^}]*order:\s*30/);
  assert.match(statusbarStyle, /\[data-bnd-part="user"\][^}]*order:\s*40/);
  assert.match(statusbarStyle, /\.bnd-statusbar :is\([\s\S]*?\.bnd-icon-btn[\s\S]*?\) svg\s*\{\s*inline-size:\s*20px;\s*block-size:\s*20px;/);
  assert.match(statusbarStyle, /\.bnd-avatar-btn \.avatar\s*\{\s*inline-size:\s*20px;\s*block-size:\s*20px;/);
  assert.match(statusbarStyle, /\[aria-current="page"\]::before\s*\{[\s\S]*?inline-size:\s*var\(--bnd-sp-6\);[\s\S]*?margin-inline:\s*auto;/);
  assert.match(statusbarStyle, /\[aria-current="page"\]\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/);
  assert.match(desktopStyle, /html\[data-bnd-desktop\]\[data-bnd-narrow\] \.desktop-wrapper\s*\{[\s\S]*?padding-block-end:\s*calc\(var\(--bnd-bottom-reserve\) \+ var\(--bnd-sp-6\)\);/);
  assert.match(sidebarStyle, /html\[data-theme\]:not\(\[data-bnd-narrow\]\) \.bnd-statusbar \.bnd-sb-utils-bar \.bnd-icon-btn/);
});
test('expanded mobile sidebar is a contained viewport sheet', () => {
  const mobile = sidebarLayout.match(/html\[data-bnd-narrow\] \.body-sidebar-container\.expanded \{([\s\S]*?)\n\}/)?.[0] || '';
  assert.match(mobile, /inline-size:\s*100vw !important/);
  assert.match(mobile, /block-size:\s*calc\(100dvh - var\(--bnd-bottom-reserve\)\)/);
  assert.match(mobile, /z-index:\s*calc\(var\(--bnd-z-panel\) \+ 1\)/);
  assert.match(mobile, /> \.overlay \{ display: none !important; \}/);
  assert.match(mobile, /\.body-sidebar \{[\s\S]*?block-size:\s*100% !important;[\s\S]*?overflow:\s*hidden/);
  assert.match(mobile, /\.sidebar-resize-handle \{ display: none !important; \}/);
  assert.match(mobile, /\.collapse-sidebar-link \{[\s\S]*?inset-block-start:\s*var\(--bnd-sp-3\)/);
});
test('locked Frappe sidebar menu never parses undefined image sources', () => {
  const start=js.indexOf('function install_sidebar_header_menu_compat()');
  const end=js.indexOf('\n\tinstall_sidebar_header_menu_compat();',start);
  assert.ok(start>0 && end>start,'compatibility installer is present and invoked at boot');
  const source=js.slice(start,end);
  const nativeCalls=[]; const appended=[];
  function SidebarHeader(){}
  SidebarHeader.prototype.add_app_item=function(item){nativeCalls.push(item);return item;};
  const document={
    createElement(tag){
      return {
        tagName:tag.toUpperCase(),className:'',attrs:{},
        setAttribute(name,value){this.attrs[name]=value;},
      };
    },
  };
  const context={frappe:{ui:{SidebarHeader}},document};
  vm.runInNewContext(source+'\ninstall_sidebar_header_menu_compat();',context);
  const first=SidebarHeader.prototype.add_app_item;
  const owner={dropdown_menu:{append(node){appended.push(node);}}};
  const separator=first.call(owner,{is_divider:true});
  assert.equal(separator.className,'dropdown-divider');
  assert.equal(separator.attrs.role,'separator');
  assert.equal(nativeCalls.length,0);
  first.call(owner,{item_label:'Custom action',label:'Custom action'});
  assert.equal(nativeCalls[0].icon,'circle');
  assert.equal(nativeCalls[0].name,'Custom action');
  assert.equal(nativeCalls[0].route,'');
  assert.equal(nativeCalls[0].icon_url,undefined);
  vm.runInNewContext(source+'\ninstall_sidebar_header_menu_compat();',context);
  assert.equal(SidebarHeader.prototype.add_app_item,first,'installer is idempotent');
});
test('Appearance action seeds a real icon for Frappe native menus', () => {
  const setup=fs.readFileSync(path.join(root,'bunood_theme/setup.py'),'utf8');
  assert.match(setup,/NAVBAR_APPEARANCE_ICON = "palette"/);
  assert.match(setup,/"icon": NAVBAR_APPEARANCE_ICON/);
});
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
test('legacy /apps address redirects to the native desktop grid', () => {
  let destination;
  const source = js.match(/function redirect_apps_alias\(\) \{([\s\S]*?)\n\t\}/)[0];
  const redirect = vm.runInNewContext('(' + source + ')', {
    location:{pathname:'/desk/apps'}, window:{frappe:{}},
    frappe:{set_route:value=>{destination=value;}},
  });
  assert.equal(redirect(), true);
  assert.equal(destination, 'desktop');
});
function roleModel() {
  const start=js.indexOf('\tconst ROLE_WORKSPACES =');
  const end=js.indexOf('\n\tfunction home_sidebar_item',start);
  assert.ok(start>0 && end>start,'role workspace model is declared before sidebar preparation');
  return vm.runInNewContext(js.slice(start,end)+'\n({role_home_workspace,role_navigation_profile,role_workspace_names})',{
    window:{frappe:{}},
  });
}
test('explicit personal workspace selects separate ERP and real-estate homes', () => {
  const {role_home_workspace}=roleModel();
  const rows=[{name:'Home'},{name:'Selling'},{name:'Real Estate'}];
  assert.equal(role_home_workspace({allowed_workspaces:rows,bnd_personal:{home:'Selling'}},['Sales User']),'Selling');
  assert.equal(role_home_workspace({allowed_workspaces:rows,bnd_personal:{home:'Real Estate'}},['Accounts Manager']),'Real Estate');
  assert.equal(role_home_workspace({allowed_workspaces:rows,bnd_personal:{home:'Missing'}},['Sales User']),'Home');
  assert.equal(role_home_workspace({allowed_workspaces:rows,bnd_personal:{}},['Accounts Manager']),'Home');
});
test('ordinary role maps exclude technical workspaces while System Manager remains unrestricted', () => {
  const {role_workspace_names}=roleModel();
  const rows=[{name:'Home'},{name:'Selling'},{name:'Buying'},{name:'Real Estate'},{name:'Build'},{name:'Users'}];
  const erp=role_workspace_names({allowed_workspaces:rows,bnd_personal:{home:'Selling'}},['Sales User']);
  const realEstate=role_workspace_names({allowed_workspaces:rows,bnd_personal:{home:'Real Estate'}},['Accounts Manager']);
  assert.ok(erp.includes('Selling') && !erp.includes('Real Estate') && !erp.includes('Build'));
  assert.ok(realEstate.includes('Real Estate') && !realEstate.includes('Selling') && !realEstate.includes('Users'));
  assert.equal(role_workspace_names({allowed_workspaces:rows},['System Manager']),null);
});
test('single-job users receive focused permission-safe workspace profiles', () => {
  const {role_navigation_profile,role_workspace_names}=roleModel();
  const names=['Home','Selling','Buying','Stock','CRM','Invoicing','Manufacturing','Quality','Financial Reports','Reports','ZATCA','ERPNext Settings'];
  const boot={allowed_workspaces:names.map(name=>({name})),bnd_personal:{}};
  const cases=[
    [['Cashier'],'cashier',['Selling','Stock','Invoicing'],['Buying','Financial Reports']],
    [['Sales User'],'sales',['Selling','CRM','Invoicing'],['Buying','Stock','Financial Reports']],
    [['Purchase User'],'purchasing',['Buying','Stock','Invoicing'],['Selling','CRM','Financial Reports']],
    [['Stock User'],'warehouse',['Stock','Buying','Manufacturing','Quality'],['Selling','Financial Reports']],
    [['Accounts User'],'accounting',['Invoicing','Financial Reports','ZATCA'],['Selling','Buying','Stock']],
    [['Accounts Manager'],'finance',['Selling','Buying','Stock','Financial Reports','ZATCA'],['ERPNext Settings']],
	[['Bunood Owner'],'owner',['Selling','Buying','Stock','Financial Reports','ZATCA'],['ERPNext Settings']],
  ];
  for(const [roles,profile,included,excluded] of cases){
    assert.equal(role_navigation_profile(boot,roles),profile,roles.join(','));
    const visible=role_workspace_names(boot,roles);
    for(const name of included) assert.ok(visible.includes(name),`${profile} missing ${name}`);
    for(const name of excluded) assert.ok(!visible.includes(name),`${profile} exposed ${name}`);
  }
});
test('multi-job users stay broad and an explicit permitted personal home remains visible', () => {
  const {role_navigation_profile,role_workspace_names}=roleModel();
  const rows=['Home','Selling','Buying','Stock','Invoicing','Financial Reports','Reports'].map(name=>({name}));
  const combined={allowed_workspaces:rows,bnd_personal:{}};
  assert.equal(role_navigation_profile(combined,['Sales User','Purchase User','Accounts User','Stock User']),'erp');
  const broad=role_workspace_names(combined,['Sales User','Purchase User','Accounts User','Stock User']);
  for(const name of ['Selling','Buying','Stock','Financial Reports']) assert.ok(broad.includes(name));
  const personal={allowed_workspaces:rows,bnd_personal:{home:'Buying'}};
  assert.equal(role_navigation_profile(personal,['Sales User']),'sales');
  assert.ok(role_workspace_names(personal,['Sales User']).includes('Buying'));
  assert.equal(role_navigation_profile(combined,['Cashier','Sales User','Accounts User']),'cashier');
	assert.equal(role_navigation_profile(combined,['Bunood Cashier','Sales User','Stock User']),'cashier');
  assert.equal(role_navigation_profile(combined,['Accounts Manager','Accounts User']),'finance');
	assert.equal(role_navigation_profile(combined,['Bunood Owner','Accounts Manager']),'owner');
	assert.equal(role_navigation_profile(combined,['Bunood Owner','Bunood Cashier','Sales User']),'erp');
});
test('Home control routes through the stable role workspace resolver', () => {
  const source=js.match(/function go_home\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(source,/frappe\.set_route\(ws_route\(role_home_workspace\(\)\)\)/);
  const desktop=js.match(/function mount_desktop_icons\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(desktop,/tile\.hidden = !permitted/);
  assert.match(desktop,/module_wise_workspaces/);
});
test('filled workspace header chevron uses on-brand contrast', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar.scss'),'utf8');
  const rule=css.match(/\.bnd-sb-head-chev \{([\s\S]*?)\n  \}/)[1];
  assert.match(rule,/color: var\(--bnd-on-brand\)/);
  assert.match(rule,/svg, use \{ stroke: currentColor/);
});
test('Selling header uses a visible semantic sprite instead of its filled desktop tile', () => {
  const update=js.match(/function sb_update_head\(\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(update,/ws\.name === "Selling" \|\| ws\.title === "Selling"/);
  assert.match(update,/"icon-shopping-cart"/);
  assert.match(update,/ws && !head_symbol \? ws_original_icon\(ws\) : ""/);
});
test('hovering a flyout option does not schedule its own flyout to close', () => {
  const menu=js.match(/function menu_list\(items\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(menu,/else if \(!btn\.closest\("\.bnd-menu-fly"\)\) close_fly\(false\)/);
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
    document:{querySelectorAll:selector=>selector.includes('[aria-current]')?[current]:[],querySelector:()=>null},
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
test('narrow native drawer is not clipped by the desktop width-resizing floor', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar.scss'),'utf8');
  assert.match(css,/html\[data-bnd-sb-panestate="open"\]:not\(\[data-bnd-narrow\]\) \.body-sidebar-container \{/);
  assert.match(css,/&\.expanded \{[\s\S]*?min-inline-size:\s*0;[\s\S]*?overflow:\s*clip/);
  assert.doesNotMatch(css,/html\[data-bnd-sb-panestate="open"\] \.body-sidebar-container \{/);
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
test('existing rail without a topbar delegates toggle ownership to the page head', () => {
  let owned=false,mounted=0;
  const container={dataset:{bndRail:'1'}};
  const context={document:{querySelector:s=>s==='.body-sidebar-container'?container:null,querySelectorAll:()=>[],documentElement:{hasAttribute:()=>true}},is_narrow:()=>false,sb_mount_compact_nav:()=>{},sb_mount_pagehead_toggle:()=>{mounted++;owned=true;}};
  const source=['sb_mount_topbar_toggle','sb_mount_rail'].map(name=>js.match(new RegExp('function '+name+'\\(container\\) \\{([\\s\\S]*?)\\n\\t\\}|function '+name+'\\(\\) \\{([\\s\\S]*?)\\n\\t\\}'))[0]).join('\n');
  vm.runInNewContext(source+'\nsb_mount_rail();',context);
  assert.equal(owned,true); assert.equal(mounted,1);
});
test('page-head toggle arrows mirror pane state and writing direction', () => {
  const source=js.match(/function sidebar_toggle_direction\(state\) \{[\s\S]*?\n\t\}/)[0];
  const direction=vm.runInNewContext('('+source+')');
  assert.equal(direction('open'),'start');
  assert.equal(direction('rail'),'start');
  assert.equal(direction('hidden'),'end');
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_breadcrumbs.scss'),'utf8');
  assert.match(css,/html\[dir="rtl"\][\s\S]*?transform:\s*scaleX\(-1\)/);
  const navbar=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_navbar.scss'),'utf8');
  assert.match(navbar,/html\[dir="rtl"\]\[data-theme\] \.bnd-topbar \.bnd-topbar-sidebar-toggle svg \{\s*transform:\s*scaleX\(-1\)/);
});
test('page-head toggle is binary and legacy rail returns to the canonical sidebar', () => {
  const source=js.match(/function next_pane_state\(current, narrow = is_narrow\(\)\) \{[\s\S]*?\n\t\}/)[0];
  const next=vm.runInNewContext('('+source+')',{is_narrow:()=>false});
  assert.deepEqual(['open','rail','hidden'].map(state=>next(state,false)),['Hidden','Open','Open']);
  assert.equal(next('open',true),'Hidden');
  assert.equal(next('rail',true),'Open');
  assert.equal(next('hidden',true),'Open');
});
test('legacy rail settings render the same full sidebar instead of compact navigation', () => {
  const paneMap=js.match(/panestate:\s*\{([\s\S]*?)\n\t\t\}/)?.[1] || '';
  assert.match(paneMap,/"Rail": "open"/);
  assert.match(paneMap,/"Hover-Expand": "open"/);
  assert.match(paneMap,/"Hover \+ Pin": "open"/);
});
test('every route receives the canonical sidebar visual contract', () => {
  const attrs=js.match(/function apply_sidebar_attrs\(sb\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(js,/const SB_STANDARD = Object\.freeze\(\{/);
  assert.match(attrs,/data-bnd-sb-standard/);
  for (const axis of ['placement','material','icons','active','sections','wash','iconsrc']) {
    assert.match(attrs,new RegExp(`set\\("${axis}", SB_STANDARD\\.${axis}\\)`));
  }
  assert.match(attrs,/set\("width", sb\.pane_width\)/);
  assert.doesNotMatch(js,/width:\s*"standard"/);
  assert.doesNotMatch(attrs,/SB_SLUGS\.placement\[sb\.placement\]/);
  assert.doesNotMatch(attrs,/SB_SLUGS\.sections\[sb\.sections\]/);
  const standard=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-standard.scss'),'utf8');
  assert.match(standard,/--bnd-sb-row-h:\s*40px/);
  assert.match(standard,/--bnd-sb-icon-size:\s*19px/);
  assert.match(standard,/\.standard-sidebar-item\.active-sidebar[\s\S]*?background:\s*var\(--bnd-sb-selected\)/);
  assert.match(standard,/\.sidebar-item-container\.section-item[\s\S]*?background:\s*transparent/);
});
test('workspace selector leaves a full navigation-group breath before destinations', () => {
  const standard=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-standard.scss'),'utf8');
  const head=standard.match(/\.body-sidebar \.bnd-sb-head \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(head,/margin:\s*4px 0 var\(--bnd-sp-5\)/);
});
test('Arabic navigation labels keep their glyphs and complete names visible', () => {
  const standard=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-standard.scss'),'utf8');
  const navbar=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_navbar.scss'),'utf8');
  const head=standard.match(/\.bnd-sb-head-name\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  const anchor=standard.match(/\.item-anchor\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  const label=standard.match(/\.sidebar-item-label\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  const returnLabel=navbar.match(/\.bnd-dashboard-return-label\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(head,/white-space:\s*normal/);
  assert.match(head,/line-height:\s*var\(--bnd-leading-base\)/);
  assert.match(anchor,/block-size:\s*auto/);
  assert.match(anchor,/overflow:\s*visible/);
  assert.match(label,/overflow:\s*visible/);
  assert.match(label,/text-overflow:\s*clip/);
  assert.match(label,/white-space:\s*normal/);
  assert.match(label,/line-height:\s*var\(--bnd-leading-base\)/);
  assert.match(returnLabel,/line-height:\s*var\(--bnd-leading-base\)/);
});
test('sidebar lifecycle shares a live page-title resolver on saved forms', () => {
  const resolver=js.match(/function visible_page_title\(\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(resolver,/\.page-head \.page-title/);
  assert.match(resolver,/getBoundingClientRect\(\)\.width > 0/);
  assert.match(js,/function sb_mount_pagehead_toggle\(\)[\s\S]*?visible_page_title\(\)/);
});
test('a visible top-bar brand suppresses the duplicate sidebar brand row', () => {
  const owner=js.match(/function topbar_owns_brand\(\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  const head=js.match(/function sb_mount_head\(\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(owner,/\.bnd-topbar \.bnd-topbar-brand, \.bnd-topbar \.bnd-sb-start/);
  assert.match(owner,/getClientRects\(\)\.length > 0/);
  assert.match(head,/if \(topbar_owns_brand\(\)\)/);
  assert.match(head,/pane_brand\?\.remove\(\)/);
  assert.match(head,/brand\.appendChild\(brand_mark\(\)\)/);
  const claim=js.match(/function claim_panehead\(\) \{([\s\S]*?)\n\t\}/)?.[0] || '';
  assert.match(claim,/if \(topbar_owns_brand\(\) \|\| \(head && pane_identity\)\) bnd_own\("panehead"\)/);
});
test('desktop cycle persists through the declared per-user pane axis', () => {
  const toggle=js.match(/bunood\.pane_toggle = function \(\) \{([\s\S]*?)\n\t\};/)[0];
  const persist=js.match(/function persist_pane_state\(value\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(toggle,/next_pane_state\(current, narrow\)/);
  assert.match(toggle,/bunood\.pane_state\(next, \{ persist: !narrow \}\)/);
  assert.match(persist,/bunood_theme\.api\.set_personal/);
  assert.match(persist,/bnd_pane_state: value/);
  assert.doesNotMatch(persist,/localStorage/);
});
test('sidebar toggle is anchored in the permanent top-bar workspace group', () => {
  const css=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_navbar.scss'),'utf8');
  const rule=css.match(/\.bnd-topbar \.bnd-sidebar-toggle \{([\s\S]*?)\n\}/)[1];
  assert.match(rule,/display:\s*inline-grid/);
  assert.doesNotMatch(rule,/position:\s*(absolute|fixed)/);
  assert.match(js,/function mount_topbar_route_tools\(\)/);
  assert.match(js,/bnd-topbar-sidebar-toggle/);
  assert.match(js,/tools\.appendChild\(toggle\)/);
  assert.match(js,/data-bnd-part": "panetoggle"/);
});
test('permanent top bar uses the Bunood brand instead of a redundant Home workspace pill', () => {
  const source=js.match(/function mount_topbar_route_tools\(\) \{([\s\S]*?)\n\t\}/)[0];
  const brand=js.match(/function build_topbar_brand\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(source,/tools\.appendChild\(build_topbar_brand\(\)\)/);
  assert.doesNotMatch(source,/bnd-topbar-workspace|topbar_workspace/);
  assert.match(brand,/bnd-topbar-brand/);
  assert.match(brand,/brand\.appendChild\(brand_mark\(\)\)/);
  assert.match(brand,/brand\.addEventListener\("click", go_home\)/);
  assert.match(source,/querySelectorAll\("\.bnd-sb-start"\)/);
  assert.match(js,/tenant === "start" && document\.querySelector\("\.bnd-topbar-brand"\)/);
});
test('retained page-head toggles use one capture-phase shell handler', () => {
  const source=js.match(/function on_pagehead_sidebar_toggle\(event\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(source,/closest\?\.\("\.bnd-pagehead-sidebar-toggle"\)/);
  assert.match(source,/event\.stopImmediatePropagation\(\)/);
  assert.match(source,/bunood\.pane_toggle\(\)/);
  assert.match(js,/document\.addEventListener\("click", on_pagehead_sidebar_toggle, true\)/);
  const mount=js.match(/function sb_mount_pagehead_toggle\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.doesNotMatch(mount,/onclick|addEventListener\("click"/);
  assert.match(mount,/if \(mount_topbar_route_tools\(\)\)/);
  assert.match(mount,/container_on\("sidepane"\) && !is_narrow\(\)/);
  assert.match(mount,/build_sidebar_toggle\("bnd-pagehead-sidebar-toggle"\)/);
  const builder=js.match(/function build_sidebar_toggle\(owner_class\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(builder,/data-bnd-part": "panetoggle"/);
  assert.match(builder,/sync_start_toggle\(toggle, expanded\)/);
  assert.match(js,/build_sidebar_toggle\("bnd-topbar-sidebar-toggle"\)/);
});
test('language keeps the shared engine while desktop pins one switch beside the visible bell', () => {
  const mount=js.match(/function mount_placed_tenants\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(mount,/\["language", "language", "bnd-language-btn", build_language\]/);
  assert.match(js,/language: "language", "top-language": "language", appearance: "appearance"/);
  assert.match(js,/function mount_language_beside_bell\(\)/);
  assert.match(js,/build_language\(in_topbar \? "top-language" : "language"\)/);
  assert.match(js,/button\.classList\.add\("bnd-language-beside-bell"\)/);
  assert.match(js,/button\.classList\.toggle\("bnd-topbar-language", in_topbar\)/);
  assert.match(js,/bell\.nextElementSibling !== button/);
  assert.match(js,/bell\.insertAdjacentElement\("afterend", button\)/);
  assert.match(mount,/mount_language_beside_bell\(\)/);
  assert.match(js,/repair_needed[\s\S]*bell_arrived[\s\S]*mount_language_beside_bell\(\)/);
});
test('hidden pane lends disabled native tenants to the page head', () => {
  assert.match(js,/if \(!existing\.length && sb_pane_hidden\(\)\) \{[\s\S]*?host_for\("pagehead", "end"\)[\s\S]*?stamp\("pagehead"\)/);
});
test('hidden pane keeps one page-head recovery control', () => {
  assert.match(js,/tenant === "start" && sb_pane_hidden\(\)[\s\S]*?for \(const node of existing\) node\.remove\(\)[\s\S]*?continue/);
});
test('top-bar ownership permanently retires page-head and native edge toggles', () => {
  const layout=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-layout.scss'),'utf8');
  assert.match(layout,/data-bnd-sidepane[^\n]*data-bnd-own~="panetoggle"[^\n]*not\(\[data-bnd-narrow\]\)[^\n]*\.body-sidebar-container \.collapse-sidebar-link/);
  const source=js.match(/function mount_topbar_route_tools\(\) \{([\s\S]*?)\n\t\}/)[0];
  assert.match(source,/querySelectorAll\("\.bnd-pagehead-sidebar-toggle"\)/);
  assert.match(source,/node\.remove\(\)/);
  assert.doesNotMatch(js,/bnd-sb-brand-hide|Hide the side pane/);
});
test('desktop side pane leaves one logical content gutter in every direction and pane width', () => {
  const layout=fs.readFileSync(path.join(root,'bunood_theme/public/scss/chrome/_sidebar-layout.scss'),'utf8');
  const desktop=layout.match(/html\.bunood\[data-bnd-sidepane\]:not\(\[data-bnd-narrow\]\) \{([\s\S]*?)\n\}/)[1];
  assert.match(desktop,/\.body-sidebar-container \{[\s\S]*?margin-inline-end: var\(--bnd-sp-4\)/);
  assert.match(desktop,/\[data-bnd-rail\][\s\S]*?margin-inline-start: 0/);
  assert.doesNotMatch(desktop,/margin-(left|right):/);
});
test('Escape returns focus from an expanded child to its compact section trigger', () => {
  let keydown,focused=0;
  const classes=new Set(['bnd-rail-open']);
  const container={dataset:{},style:{},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:(...keys)=>keys.forEach(k=>classes.delete(k))},querySelector:()=>null,contains:()=>true,_bnd_rail_return:{isConnected:true,focus:()=>focused++}};
  const document={activeElement:{},documentElement:{hasAttribute:()=>true,getAttribute:()=>null},querySelector:s=>s==='.body-sidebar-container'?container:{},querySelectorAll:()=>[],addEventListener:(event,fn)=>{if(event==='keydown')keydown=fn;}};
  const match=js.match(/function sb_mount_rail\(\) \{([\s\S]*?)\n\t\}/);
  vm.runInNewContext('('+match[0]+')()',{document,window:{matchMedia:()=>({matches:false})},is_narrow:()=>false,sb_mount_compact_nav:()=>{},sb_mount_topbar_toggle:()=>{}});
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
