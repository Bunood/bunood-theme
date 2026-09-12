const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('production asset build ships the bill and simplified-form controllers', () => {
  const build = fs.readFileSync('build.mjs', 'utf8');
  assert.match(build, /DESK_JS_SOURCES = \["bunood\.js", "sales_bill\.js", "simple_forms\.js"\]/);
  assert.match(build, /key === "bunood"[\s\S]*?await readDeskJs\(\)/);
  assert.match(build, /key: "bnd-studio", src: "report_studio\.js", pyid: "STUDIO_JS"/);
  const boot = fs.readFileSync('bunood_theme/boot.py', 'utf8');
  assert.match(boot, /from bunood_theme\.assets import STUDIO_JS[\s\S]*?bootinfo\.bnd_studio_js = STUDIO_JS/);
});
test('ZATCA calls the package module that actually owns the whitelisted facade', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /bunood_theme\.zatca\.status\.get_status/);
  assert.match(source, /bunood_theme\.zatca\.status\.queue_invoice/);
  assert.doesNotMatch(source, /bunood_theme\.zatca\.(?:get_status|queue_invoice)/);
});
test('redesigned bill keeps essential native controls visible without duplicating option controls', () => {
  const source = fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8');
  assert.match(source, /primaryFields = \["posting_date", "due_date",.*"bill_no", "bill_date"/);
  assert.match(source, /this\.bindControl\(essentials, source, this\.doc\)/);
  assert.match(source, /if \(primaryFields\.includes\(name\)\) continue/);
  assert.match(source, /toolsTrigger\.focus\(\)/);
  assert.match(source, /tools\.open = false/);
  assert.match(source, /tools\.addEventListener\("click", e => \{[\s\S]*?toolsTrigger\.focus\(\);[\s\S]*?\}, true\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("role", "button"\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("aria-haspopup", "true"\)/);
  assert.match(source, /toolsTrigger\.setAttribute\("aria-controls", toolBody\.id\)/);
  assert.match(source, /tools\.addEventListener\("toggle", \(\) => toolsTrigger\.setAttribute\("aria-expanded", String\(tools\.open\)\)\)/);
  const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss', 'utf8');
  assert.match(css, /container-type: inline-size/);
  assert.match(source, /bnd-bill-panel bnd-bill-party", null, main/);
  assert.match(css, /bnd-bill-line-remove \{\s*grid-column: 8; grid-row: 1/);
  assert.match(css, /min-inline-size: 52rem/);
  assert.match(css, /bnd-bill-lines.*overflow-x: auto/);
  assert.match(css, /@container.*bnd-cq\(bar-3\)/);
  assert.match(css, /bnd-bill-tools-body \{ position: static; inline-size: 100%/);
});
const context = {
  window: { bunood_theme: {} },
  document: {},
  frappe: { after_ajax: async () => {} },
  $: () => ({ on() {} }),
  __: (s, args = []) => args.reduce((text, value, index) => text.replace(`{${index}}`, value), s),
  setTimeout,
  clearTimeout,
};
// Expose the existing class only inside the test VM, without a new public API.
vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/sales_bill.js', 'utf8').replace('api.sales_bill = {', 'api.sales_bill = { BillWorkbench, instances,'), context);
const { eligible, actionState, SerialChanges, saveDraft, totalField, canAdd, canRemove, hasTaxConfiguration, taxLabel, showSummary, taxConfigurationIssue, taxIssueMessage } = context.window.bunood_theme.sales_bill;

test('new-party tax field uses native metadata without duplicates or permission bypass', () => {
  const method=context.window.bunood_theme.sales_bill.BillWorkbench.prototype.addPartyTaxField;
  const previousMeta=context.frappe.meta, previousPerm=context.frappe.perm;
  try {
    const df={fieldname:'tax_id',fieldtype:'Data',label:'Vendor Tax',length:20}; let status='Write', added=[];
    context.frappe.meta={get_docfield:()=>df};
    context.frappe.perm={get_perm:()=>[],get_field_display_status:()=>status};
    const entry={doc:{},fields_dict:{},add_fields:fields=>added.push(...fields)};
    method.call({profile:{partyDoctype:'Supplier'}},entry);
    assert.equal(added.length,1); assert.equal(added[0].fieldname,'tax_id'); assert.equal(added[0].length,20);
    assert.equal(added[0].label,'Tax ID'); assert.equal(df.label,'Vendor Tax');
    entry.fields_dict.tax_id={}; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
    delete entry.fields_dict.tax_id; status='Read'; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
    status='Write'; df.hidden=1; method.call({profile:{partyDoctype:'Supplier'}},entry); assert.equal(added.length,1);
  } finally { context.frappe.meta=previousMeta; context.frappe.perm=previousPerm; }
});

function lifecycleWorkbench() {
  const proto=context.window.bunood_theme.sales_bill.BillWorkbench.prototype;
  const frm=form({name:'INV-OLD',customer:'Previous customer'}), w=Object.create(proto);
  Object.assign(w,{frm,doc:frm.doc,docname:frm.doc.name,closed:false,simple:true,
    editTimers:new Map(),pending:new Map([['old','value']]),invalid:new Map(),
    root:{remove(){w.rootRemoved=true;}},mode:{remove(){w.modeRemoved=true;}},
    setMode(value){this.simple=value;},syncSelectionGuard(){w.guardReleased=true;}});
  context.window.cur_frm=null;
  context.window.bunood_theme.sales_bill.instances.set(frm,w);
  return w;
}

test('Save and Submit direct missing party/items to the right control after unlocking', async () => {
  for (const method of ['save', 'submit']) for (const party of ['customer', 'supplier']) for (const hasParty of [false, true]) {
    const w = lifecycleWorkbench(); let focused;
    w.profile = {party, partyDoctype: party === 'customer' ? 'Customer' : 'Supplier'};
    w.doc[party] = hasParty ? 'TEST' : ''; w.doc.items = []; w.doc.docstatus = 0;
    w.active = () => true; w.flush = async () => {}; w.busy = () => {}; w.render = () => {};
    w.message = text => {w.lastMessage = text;};
    const focus = name => () => {assert.equal(w.saving, false); focused = name;};
    w.partyControl = {set_focus: focus('party')}; w.picker = {set_focus: focus('item')};
    w.frm.save = w.frm.savesubmit = () => assert.fail('invalid bill must not save or submit');
    await w[method]();
    assert.equal(focused, hasParty ? 'item' : 'party');
    assert.equal(w.lastMessage, hasParty ? 'Add at least one item before continuing.' : `Choose a ${party} before continuing.`);
  }
});

test('required-field check accepts complete bills and tolerates an absent item array', () => {
  const w = lifecycleWorkbench(); w.profile = {party:'customer', partyDoctype:'Customer'};
  delete w.doc.items; assert.match(w.missingRequiredField().message, /Add at least/);
  w.doc.items = [{item_code:''}]; assert.match(w.missingRequiredField().message, /Add at least/);
  w.doc.items.push({item_code:'ITEM'}); assert.equal(w.missingRequiredField(), null);
});
test('document replacement or native rename retires old control closures without rebinding them', () => {
  for(const rename of [false,true]) {
    const w=lifecycleWorkbench(), original=w.doc;
    if(rename) w.frm.doc.name='INV-SAVED'; else w.frm.doc={name:'INV-NEW',docstatus:0,items:[]};
    assert.equal(w.syncDocument(),false);
    assert.equal(w.doc,original,'old closures must never be declared current for another document');
    assert.equal(w.closed,true); assert.equal(w.simple,false);
    assert.equal(w.rootRemoved,true); assert.equal(w.modeRemoved,true);
    assert.equal(w.pending.size,0);
  }
});
test('same-document refresh keeps its controller and pending typing', () => {
  const w=lifecycleWorkbench();
  assert.equal(w.syncDocument(),true);
  assert.equal(w.closed,false); assert.equal(w.pending.size,1);
});
test('queued edits from a retired invoice cannot execute on its replacement', async () => {
  const w=lifecycleWorkbench(); let writes=0;
  const queue=new SerialChanges(()=>!w.closed && w.frm.doc===w.doc,()=>{});
  const pending=queue.run(()=>{writes++;});
  w.frm.doc={name:'INV-NEW',docstatus:0,items:[]}; w.syncDocument();
  await assert.rejects(pending,/no longer active/); assert.equal(writes,0);
});
test('late retired callbacks cannot evict a newer controller or reveal its native form', () => {
  const w=lifecycleWorkbench(), registry=context.window.bunood_theme.sales_bill.instances;
  w.dispose();
  const replacement={}; registry.set(w.frm,replacement);
  w.setMode=()=>assert.fail('retired controller changed shared mode');
  w.dispose(); assert.equal(w.syncDocument(),false);
  assert.equal(registry.get(w.frm),replacement);
  const second=lifecycleWorkbench(); registry.set(second.frm,replacement);
  second.setMode=()=>assert.fail('non-owner changed shared mode'); second.dispose();
  assert.equal(registry.get(second.frm),replacement);
});
test('Submit and Advanced stop after document ownership changes during flush', async () => {
  for(const method of ['submit','fullInvoice']) {
    const w=lifecycleWorkbench(); let release,active=true,calls=0;
    w.active=()=>active; w.busy=()=>{}; w.render=()=>{}; w.message=()=>{};
    w.flush=()=>new Promise(resolve=>release=resolve);
    w.profile={party:'customer'}; w.doc.items=[{item_code:'ITEM'}];
    w.frm.savesubmit=()=>{calls++;}; w.setMode=()=>{calls++;}; w.frm.is_dirty=()=>false;
    const task=w[method](); active=false; w.frm.doc={name:'NEW',docstatus:0,items:[]}; release();
    await task; assert.equal(calls,0,method);
  }
});
test('Submit cannot continue on a replacement after native save resolves', async () => {
  const w=lifecycleWorkbench(); let release,entered,active=true,dirty=true,submits=0,lastError;
  const saveEntered=new Promise(resolve=>entered=resolve);
  w.active=()=>active; w.busy=()=>{}; w.render=()=>{}; w.message=error=>{lastError=error;}; w.flush=async()=>{};
  w.profile={party:'customer'}; w.doc.items=[{item_code:'ITEM'}];
  w.frm.is_dirty=()=>dirty;
  w.frm.save=(_kind,callback)=>new Promise(resolve=>{release=()=>{dirty=false;callback({});resolve();};entered();});
  w.frm.savesubmit=()=>{submits++;};
  const task=w.submit(); await Promise.race([saveEntered,task.then(()=>assert.fail(lastError || 'Submit stopped before native save'))]);
  active=false; w.frm.doc={name:'OTHER',docstatus:0,items:[]}; release();
  await task; assert.equal(submits,0);
});

test('invoice sheet puts identity before actions and marks draft-only editing affordances', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.ok(source.indexOf('const intro =') < source.indexOf('const toolbar ='));
  assert.match(source, /this\.root\.dataset\.bndDraft = String\(draft\)/);
  assert.match(source, /this\.searchButton\.hidden = !draft/);
  assert.match(source, /bnd-bill-search bnd-bill-draft-only/);
  assert.match(source, /bnd-bill-hint bnd-bill-draft-only/);
  const css=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(css, /\[data-bnd-draft="false"\] \.bnd-bill-draft-only/);
  assert.doesNotMatch(css, /\.bnd-bill-toolbar \{ flex-wrap: nowrap; overflow-x: auto;/);
});
test('invoice tool actions use bundled, labelled Frappe icons', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  for (const icon of ['user','delete','printer','credit-card','percent','rotate-ccw','search']) {
    assert.match(source,new RegExp(`this\\.action\\([^\\n]+"${icon}"`));
  }
  assert.match(source,/frappe\.utils\.icon\(icon, "sm"\)/);
  assert.match(source,/bnd-bill-action-icon[^\n]+aria-hidden/);
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/\.bnd-bill-action-icon[^}]*place-items:\s*center/);
  assert.match(scss,/\.bnd-bill-tools-body \.bnd-bill-action-label \{ flex: 1; \}/);
});

test('ZATCA setup states do not present inactive server and sync labels as live status', () => {
  const proto=context.window.bunood_theme.sales_bill.BillWorkbench.prototype;
  const render=(state, extra={})=>{
    const w=Object.create(proto);
    w.zatcaData={state,settings:{server:'Sandbox',sync:'Live'},invoice:{integration_status:'Queued'},...extra};
    w.zatcaStatus={classList:{toggle(){}},textContent:''};
    w.zatcaMeta={textContent:''}; w.zatcaButton={textContent:'',hidden:false};
    w.busy=()=>{}; w.zatcaTimer=null;
    proto.renderZatca.call(w);
    return w.zatcaMeta.textContent;
  };
  for (const state of ['missing_app','needs_settings','disabled','needs_onboarding','needs_csid']) {
    assert.equal(render(state),'',state);
  }
  assert.equal(render('ready_to_send'),'Sandbox · Live · Queued');
});

// Verbatim methods from the installed, already-pinned Frappe form/layout.js.
// The upstream gate checks the full file; this runs its actual global-select branch.
const nativeLayoutSource = `({
	refresh(doc) {
		if (doc) this.doc = doc;

		if (this.frm) {
			this.wrapper.find(".empty-form-alert").remove();
		}

		// NOTE this might seem redundant at first, but it needs to be executed when frm.refresh_fields is called
		this.attach_doc_and_docfields(true);

		if (this.frm && this.frm.wrapper) {
			$(this.frm.wrapper).trigger("refresh-fields");
		}

		// dependent fields
		this.refresh_dependency();

		// refresh sections
		this.refresh_sections();

		if (this.frm) {
			// collapse sections
			this.refresh_section_collapse();
		}

		if (document.activeElement) {
			if (document.activeElement.tagName == "INPUT" && this.is_numeric_field_active()) {
				document.activeElement.select();
			}
		}
	},

	is_numeric_field_active() {
		const control = $(document.activeElement).closest(".frappe-control");
		const fieldtype = (control.data() || {}).fieldtype;
		return frappe.model.numeric_fieldtypes.includes(fieldtype);
	}
})`;
const nativeLayout = vm.runInNewContext(nativeLayoutSource, {
  document:context.document, frappe:{model:{numeric_fieldtypes:['Float','Currency','Int']}},
  $:input=>({closest:()=>({data:()=>({fieldtype:input.fieldtype})})})
});

function selectionWorkbench() {
  const fixture=boundWorkbench(), w=fixture.workbench, control=fixture.bind('qty'), input=control.$input[0];
  delete w.active;
  w.simple=true; w.closed=false; w.root={isConnected:true,hidden:false,contains:node=>!!node?.inRoot};
  Object.assign(input,{tagName:'INPUT',fieldtype:'Float',inRoot:true,value:'23',selectionStart:2,selectionEnd:2,
    select(){this.selectionStart=0;this.selectionEnd=this.value.length;this.selectCalls=(this.selectCalls||0)+1;}});
  w.frm.layout=Object.assign(Object.create(nativeLayout),{attach_doc_and_docfields(){},refresh_dependency(){},refresh_sections(){}});
  context.window.cur_frm=w.frm; context.document.activeElement=input;
  return {...fixture,input,layout:w.frm.layout};
}

test('native layout selection contract is pinned and reproduced before the adapter', () => {
  const pins=fs.readFileSync('bunood_theme/data/upstream-pins.json','utf8');
  assert.match(pins,/"frappe:frappe\/public\/js\/frappe\/form\/layout.js": "3abb35b67655684fd706533ac7018adaadbc08ce3cd38e24bd3231a32c7e5d6f"/);
  const {layout,input}=selectionWorkbench(); layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,2,1]);
});

test('native refresh leaves the Simple registered input caret and intentional selection untouched', () => {
  const {workbench:w,layout,input}=selectionWorkbench(); w.setMode(true);
  layout.refresh(); assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[2,2,undefined]);
  input.selectionStart=0; input.selectionEnd=1; layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,1,undefined]);
  w.setMode(false); layout.refresh();
  assert.deepEqual([input.selectionStart,input.selectionEnd,input.selectCalls],[0,2,1],'Advanced keeps the native select-all behavior');
});

test('selection guard delegates unchanged outside its exact active root, document and layout', () => {
  for (const change of [
    ({workbench:w})=>{w.simple=false;}, ({workbench:w})=>{w.root.hidden=true;},
    ({workbench:w})=>{w.root.isConnected=false;}, ({input})=>{input.inRoot=false;},
    ({workbench:w})=>{w.controls=[];}, ({workbench:w})=>{w.frm.doc={...w.doc};},
    ({workbench:w})=>{w.doc.items=[];}, ()=>{context.window.cur_frm={};},
    ({workbench:w})=>{w.closed=true;}, ({workbench:w})=>{w.frm.layout={};}
  ]) {
    const fixture=selectionWorkbench(); fixture.workbench.setMode(true); change(fixture);
    fixture.layout.refresh(); assert.equal(fixture.input.selectCalls,1);
  }
  const {workbench:w,layout,input}=selectionWorkbench(); w.setMode(true);
  context.document.activeElement={...input}; layout.refresh();
  assert.equal(context.document.activeElement.selectCalls,1,'unregistered dialog control uses native selection');
});

test('selection guard preserves delegated receiver, arguments, result and exception', () => {
  const {workbench:w,layout,input}=selectionWorkbench(), marker={}, args=[1,2];
  let receiver, received;
  const original=function(...values){receiver=this;received=values;return marker;};
  layout.is_numeric_field_active=original; w.setMode(true); input.inRoot=false;
  assert.equal(layout.is_numeric_field_active(...args),marker); assert.equal(receiver,layout); assert.deepEqual(received,args);
  input.inRoot=true; const other={};
  assert.equal(layout.is_numeric_field_active.call(other,3),marker); assert.equal(receiver,other); assert.deepEqual(received,[3]);
  w.setMode(false); const error=Error('native predicate'); layout.is_numeric_field_active=()=>{throw error;};
  w.setMode(true); input.inRoot=false; assert.throws(()=>layout.is_numeric_field_active(),e=>e===error);
});

test('selection guard is idempotent and restores inherited or own descriptors on leaving Simple', () => {
  for (const own of [false,true]) {
    const {workbench:w,layout}=selectionWorkbench();
    if(own)Object.defineProperty(layout,'is_numeric_field_active',{value:nativeLayout.is_numeric_field_active,writable:true,configurable:false,enumerable:true});
    const before=Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active');
    w.setMode(true); const guard=layout.is_numeric_field_active;
    w.setMode(true); w.syncSelectionGuard(); assert.equal(layout.is_numeric_field_active,guard);
    w.setMode(false); assert.deepEqual(Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active'),before);
    w.setMode(true); assert.notEqual(layout.is_numeric_field_active,nativeLayout.is_numeric_field_active);
    w.closed=true; w.syncSelectionGuard(); assert.deepEqual(Object.getOwnPropertyDescriptor(layout,'is_numeric_field_active'),before);
  }
});

test('replaced layouts are released and another writer is neither overwritten nor repeatedly wrapped', () => {
  const {workbench:w,layout}=selectionWorkbench(); w.setMode(true);
  const second=Object.create(nativeLayout); w.frm.layout=second; w.syncSelectionGuard();
  assert.equal(Object.hasOwn(layout,'is_numeric_field_active'),false);
  const guard=second.is_numeric_field_active, external=function(){return guard.call(this);};
  second.is_numeric_field_active=external; w.syncSelectionGuard(); assert.equal(second.is_numeric_field_active,external);
  assert.equal(external.call(second),true,'a displaced wrapper delegates even while Simple remains active');
  w.setMode(false); w.setMode(true); assert.equal(second.is_numeric_field_active,external);
  w.frm.layout=layout; w.syncSelectionGuard(); w.frm.layout=second; w.syncSelectionGuard();
  assert.equal(second.is_numeric_field_active,external);
});

test('missing, non-callable and unadaptable native contracts remain untouched', () => {
  for (const layout of [{},{is_numeric_field_active:42},Object.freeze({is_numeric_field_active:()=>true})]) {
    const {workbench:w}=selectionWorkbench(); w.frm.layout=layout;
    const before=Object.getOwnPropertyDescriptors(layout); assert.doesNotThrow(()=>w.setMode(true));
    assert.deepEqual(Object.getOwnPropertyDescriptors(layout),before);
  }
});
function form(extra = {}) {
  return { doctype: 'Sales Invoice', doc: { docstatus: 0, items: [], ...extra },
    perm: [{ write: 1, create: 1 }], save_disabled: false,
    fields_dict: { customer: { get_status: () => 'Write' }, items: { get_status: () => 'Write', grid: { is_editable: () => true, df: {} } } } };
}
test('quick bill excludes posted, return, POS, mapped and restricted invoices', () => {
  assert.equal(eligible(form()), true);
  for (const extra of [{docstatus:1},{is_return:1},{is_pos:1},{amended_from:'INV'},{is_debit_note:1},{items:[{sales_order:'SO-1'}]}]) assert.equal(eligible(form(extra)), false);
  const restricted = form(); restricted.fields_dict.items.grid.is_editable = () => false;
  assert.equal(eligible(restricted), false);
  const disabled = form(); disabled.save_disabled = true;
  assert.equal(eligible(disabled), false);
});
test('purchase invoices use the same native workbench contract', () => {
  const f = form();
  f.doctype = 'Purchase Invoice'; f.doc.doctype = 'Purchase Invoice'; f.doc.supplier = 'SUP-1';
  f.fields_dict.supplier = { get_status: () => 'Write' }; delete f.fields_dict.customer;
  assert.equal(context.window.bunood_theme.sales_bill.supports(f), true);
  assert.equal(eligible(f), true);
  f.doc.items = [{ purchase_order: 'PO-1' }];
  assert.equal(context.window.bunood_theme.sales_bill.supports(f), false);
});
test('the default bill workbench is inline and exposes native actions', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.doesNotMatch(source,/new frappe\.ui\.Dialog/);
  for (const action of ['frm.savesubmit()','frm.savetrash()','frm.print_doc()','makePaymentEntry(this.frm)','frappe.ui.Scanner']) assert.match(source,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('both invoice profiles expose the native base price before line discounts', () => {
  const {profiles} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice', 'Purchase Invoice']) {
    assert.ok(profiles[type].lineFields.includes('price_list_rate'), type);
    assert.ok(profiles[type].lineFields.indexOf('price_list_rate') < profiles[type].lineFields.indexOf('discount_percentage'));
    assert.ok(profiles[type].lineFields.includes('rate'));
  }
});
test('nonzero discount without a positive finite base is rejected before native mutation', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const base of [undefined, null, '', 0, '0', -1, NaN, Infinity]) {
    const row = {rate:100, price_list_rate:base, discount_percentage:0};
    let calls = 0;
    await assert.rejects(() => setLineValue(row,'discount_percentage',10,async () => { calls++; row.rate=0; }, () => 'Write'), /price before discount/i);
    assert.equal(calls,0); assert.equal(row.rate,100); assert.equal(row.discount_percentage,0);
  }
});
test('missing-base guidance follows current native editability, not invoice type', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice Item','Purchase Invoice Item']) {
    for (const status of ['Read','None',undefined]) {
      const row={doctype:type,rate:100,price_list_rate:0,discount_percentage:0};
      await assert.rejects(
        () => setLineValue(row,'discount_percentage',10,async()=>assert.fail('must not mutate'),()=>status),
        error => /selected price list/.test(error.message) && /Discount \(%\) to 0/.test(error.message) && !/Enter a price|advanced/i.test(error.message));
      assert.equal(row.rate,100); assert.equal(row.discount_percentage,0);
    }
    await assert.rejects(() => setLineValue({doctype:type},'discount_percentage',10,async()=>assert.fail('must not mutate'),()=> 'Write'), /Enter a price before discount/);
  }
});
test('row field status resolves current native metadata and respects grid locks or missing fields', () => {
  const {rowFieldStatus} = context.window.bunood_theme.sales_bill;
  const row={doctype:'Sales Invoice Item',name:'row-05'}, frm=form();
  let df={fieldname:'price_list_rate',read_only:1}, calls=0;
  context.frappe.meta={get_docfield(type,name,id){assert.equal(type,row.doctype);assert.equal(id,row.name);assert.equal(name,'price_list_rate');return df;}};
  context.frappe.perm={get_field_display_status(field,doc,perm){calls++;assert.equal(doc,row);assert.equal(perm,frm.perm);return field.hidden?'None':field.read_only?'Read':'Write';}};
  frm.fields_dict.items.grid.get_docfield=()=>undefined;
  try {
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Read');
    df={fieldname:'price_list_rate'}; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Write');
    df={fieldname:'price_list_rate',hidden:1}; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'None');
    df=undefined; assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'None');
    frm.fields_dict.items.grid.get_docfield=()=>({fieldname:'price_list_rate'});
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Write');
    const before=calls; frm.fields_dict.items.grid.is_editable=()=>false;
    assert.equal(rowFieldStatus(frm,row,'price_list_rate'),'Read'); assert.equal(calls,before);
  } finally { delete context.frappe.meta; delete context.frappe.perm; }
});
test('queued discount checks editability at execution and clearing zero still delegates', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  const queue=new SerialChanges(()=>true,()=>{}), row={price_list_rate:0,rate:100,discount_percentage:0};
  let status='Write';
  const first=queue.run(async()=>{status='Read';});
  const discount=queue.run(()=>setLineValue(row,'discount_percentage',10,async()=>assert.fail('must not mutate'),()=>status));
  await first; await assert.rejects(discount,/selected price list/);
  let cleared=false;
  await setLineValue(row,'discount_percentage',0,async value=>{assert.equal(value,0);cleared=true;},()=>{throw Error('unneeded status read');});
  assert.equal(cleared,true); assert.equal(row.rate,100);
  assert.match(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /setLineValue\(doc, name, value, nativeSet, \(\) => rowFieldStatus\(frm, doc, "price_list_rate"\)\)/);
});
test('valid pricing edits delegate unchanged to the native setter, without calculating a second price', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  for (const [field,value,base] of [['discount_percentage',10,100],['discount_percentage',0,0],['price_list_rate',100,0],['rate',19.99,0],['qty',0.125,0]]) {
    const row = {rate:100,price_list_rate:base}; const calls=[];
    const result = await setLineValue(row,field,value,async incoming => { calls.push(incoming); return 'native-result'; });
    assert.deepEqual(calls,[value]); assert.equal(result,'native-result'); assert.equal(row.rate,100);
  }
  for (const [field,value] of [['qty',0],['qty',-1],['rate',-1],['rate',NaN],['price_list_rate',-1],['price_list_rate',Infinity]]) {
    await assert.rejects(() => setLineValue({},field,value,async () => assert.fail('invalid native call')), /quantity|price/i);
  }
});
test('a queued base-price edit is applied before the following discount is validated', async () => {
  const {setLineValue} = context.window.bunood_theme.sales_bill;
  const row={price_list_rate:0,rate:100}, order=[];
  const queue=new SerialChanges(()=>true,()=>{});
  const base=queue.run(()=>setLineValue(row,'price_list_rate',100,async value=>{row.price_list_rate=value;order.push('base');}));
  const discount=queue.run(()=>setLineValue(row,'discount_percentage',10,async value=>{row.discount_percentage=value;order.push('discount');}));
  await Promise.all([base,discount]);
  assert.deepEqual(order,['base','discount']); assert.equal(row.discount_percentage,10); assert.equal(row.rate,100);
});
test('Payment delegates to the native invoice controller with its receiver and return value', () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  for (const type of ['Sales Invoice','Purchase Invoice']) {
    const frm = {doctype:type,doc:{doctype:type,name:'AUDIT-1',docstatus:1}};
    frm.cscript = {frm,make_payment_entry() { assert.equal(this,frm.cscript); return {native:true}; }};
    assert.deepEqual(makePaymentEntry(frm),{native:true});
  }
});
test('Payment blocks drafts and missing controllers and preserves native errors without a mapper fallback', () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  assert.throws(() => makePaymentEntry({doc:{docstatus:0},cscript:{make_payment_entry(){assert.fail('draft');}}}), /Submit/);
  assert.throws(() => makePaymentEntry({doc:{docstatus:1}}), /advanced/i);
  const nativeError = new Error('native payment denied');
  assert.throws(() => makePaymentEntry({doc:{docstatus:1},cscript:{make_payment_entry(){throw nativeError;}}}), error=>error===nativeError);
  assert.doesNotMatch(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /open_mapped_doc/);
});
test('native asynchronous Payment errors remain observable', async () => {
  const {makePaymentEntry} = context.window.bunood_theme.sales_bill;
  const nativeError = new Error('native payment refused');
  const frm = {doc:{docstatus:1},cscript:{make_payment_entry:async () => {throw nativeError;}}};
  await assert.rejects(makePaymentEntry(frm), error=>error===nativeError);
  assert.match(fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8'), /try \{ return await makePaymentEntry\(this\.frm\); \}/);
});
test('sales invoices expose the credential-free Bunood ZATCA facade', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source,/bunood_theme\.zatca\.status\.get_status/);
  assert.match(source,/bunood_theme\.zatca\.status\.queue_invoice/);
  assert.match(source,/Sales Invoice Additional Fields/);
  assert.doesNotMatch(source,/production_security_token|production_secret|security_token/);
});
test('a clean saved draft replaces Save with Submit until it is edited', () => {
  const state = (doc, dirty) => JSON.parse(JSON.stringify(actionState(doc, dirty)));
  assert.deepEqual(state({docstatus:0,__islocal:1}, false), {draft:true,savedDraft:false,showSave:true,showSubmit:false});
  assert.deepEqual(state({docstatus:0,__islocal:0}, false), {draft:true,savedDraft:true,showSave:false,showSubmit:true});
  assert.deepEqual(state({docstatus:0,__islocal:0}, true), {draft:true,savedDraft:false,showSave:true,showSubmit:false});
  assert.deepEqual(state({docstatus:1,__islocal:0}, false), {draft:false,savedDraft:false,showSave:false,showSubmit:false});
});
test('zero rounded total is retained and disabled rounding uses grand total', () => {
  const f = form({grand_total:0.2, rounded_total:0}); f.fields_dict.rounded_total = {};
  assert.equal(totalField(f), 'rounded_total');
  f.doc.disable_rounded_total=1; assert.equal(totalField(f), 'grand_total');
  f.doc.disable_rounded_total='0'; assert.equal(totalField(f), 'rounded_total');
});
test('native grid add and delete restrictions are respected', () => {
  const f = form(); assert.equal(canAdd(f), true); assert.equal(canRemove(f), true);
  f.fields_dict.items.grid.df.cannot_add_rows=1; assert.equal(canAdd(f), false);
  f.fields_dict.items.grid.df.cannot_delete_rows=1; assert.equal(canRemove(f), false);
  f.fields_dict.items.grid.df={}; f.fields_dict.items.grid.cannot_add_rows=true;
  assert.equal(canAdd(f), false);
});
test('VAT stays visible and uses the configured native tax rate', () => {
  assert.equal(hasTaxConfiguration({}), false);
  assert.equal(hasTaxConfiguration({taxes_and_charges:'KSA VAT 15%'}), true);
  assert.equal(taxLabel({taxes:[]}), 'VAT');
  assert.equal(taxLabel({taxes:[{description:'Input VAT 15%',rate:15}]}), 'VAT (15%)');
  assert.equal(taxLabel({taxes:[{description:'Shipping',rate:5}]}, 'Taxes and charges'), 'Taxes and charges');
  assert.equal(showSummary('total_taxes_and_charges', {total_taxes_and_charges:0}), true);
  assert.equal(showSummary('discount_amount', {discount_amount:0}), false);
});
test('Simple mode rejects ambiguous VAT rows before native save', () => {
  assert.equal(taxConfigurationIssue({ taxes_and_charges: 'KSA VAT', taxes: [] }).code, 'empty_template');
  assert.equal(taxConfigurationIssue({ taxes: [{ idx: 3, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: '' }] }).row, 3);
  assert.equal(taxConfigurationIssue({ taxes: [{ description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 0 }] }), null);
  const conflict = taxConfigurationIssue({ taxes: [
    { idx: 2, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 15 },
    { idx: 4, description: 'Output VAT', account_head: 'VAT - BD', charge_type: 'On Net Total', rate: 5 },
  ] });
  assert.equal(conflict.code, 'conflicting_rates');
  assert.deepEqual(Array.from(conflict.rows), [2, 4]);
  assert.match(taxIssueMessage(conflict), /2, 4/);
});
test('the Remove action gets its own row so item identity aligns with field controls', () => {
  const source=fs.readFileSync('bunood_theme/public/js/sales_bill.js','utf8');
  assert.match(source, /button\(__\("Remove"\), view\.line,/);
  assert.match(source, /bnd-bill-item-label/);
});
test('mutations run in order, recover after rejection, and reject stale work', async () => {
  let active = true, release; const order = [];
  const queue = new SerialChanges(() => active, () => {});
  const first = queue.run(async () => { order.push('start'); await new Promise(r => release = r); order.push('end'); });
  const second = queue.run(async () => order.push('second'));
  await Promise.resolve(); release(); await Promise.all([first,second]);
  assert.deepEqual(order, ['start','end','second']);
  await assert.rejects(queue.run(async () => { throw Error('lookup failed'); }));
  await queue.run(async () => order.push('recovered'));
  active = false;
  await assert.rejects(queue.run(async () => order.push('stale')));
  assert.equal(order.includes('stale'), false);
  assert.equal(queue.count, 0);
});
test('resolved native save is not proof that a draft was saved', async () => {
  const failed = form(); failed.is_dirty = () => true;
  failed.save = async (_action, callback, _button, onError) => { onError(); };
  await assert.rejects(saveDraft(failed));
  const swallowed = form(); swallowed.is_dirty = () => true;
  swallowed.save = async () => {};
  await assert.rejects(saveDraft(swallowed));
  const ok = form(); ok.is_dirty = () => false;
  ok.save = async (action, callback) => { assert.equal(action,'Save'); ok.doc.name='INV-TEST'; callback({}); };
  await saveDraft(ok);
});

// Small native-control doubles; the production bind/queue/render methods run unchanged.
function element() {
  const attrs = new Map(), classes = new Set();
  return { children: [], className: '', textContent: '',
    setAttribute: (key, value) => attrs.set(key, String(value)),
    getAttribute: key => attrs.get(key) ?? null, removeAttribute: key => attrs.delete(key),
    classList: { add: key => classes.add(key), remove: key => classes.delete(key),
      contains: key => classes.has(key), toggle(key, on) { on ? classes.add(key) : classes.delete(key); } },
    append(child) { this.children.push(child); child.parent = this; },
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
    querySelector(selector) { return this.children.find(child => child.className.split(' ').includes(selector.slice(1))) || null; },
  };
}
function boundWorkbench(nativeSet) {
  const { BillWorkbench } = context.window.bunood_theme.sales_bill;
  const workbench = Object.create(BillWorkbench.prototype), frm = form();
  const row = { name:'row-06', doctype:'Sales Invoice Item', item_code:'TEST', qty:1, rate:100, price_list_rate:0, discount_percentage:0 };
  frm.doc.items = [row];
  Object.assign(workbench, { frm, doc:frm.doc, controls:[], invalid:new Map(), pending:new Map(), editTimers:new Map(), revertButton:{hidden:true},
    active:()=>true, busy(){}, render(){ for(const c of this.controls) this.renderControl(c.control,c.key,true); }, message(text){this.lastMessage=text;} });
  workbench.queue = new SerialChanges(()=>true,()=>{});
  context.document.createElement = element;
  context.frappe.meta = {get_docfield:()=>({read_only:1})};
  context.frappe.perm = {get_field_display_status:df=>df.read_only?'Read':'Write'};
  context.frappe.ui = {form:{make_control({df,doc}) {
    const input=element(), wrapper=element(); let value=doc[df.fieldname];
    input.handlers = {};
    input.setAttribute('aria-describedby','native-help');
    const c={df,get_query(){return 'native-link-query';},$input:{0:input,val(v){if(arguments.length)value=v;return value;},attr(k,v){input.setAttribute(k,v);},on(event,fn){input.handlers[event]=fn;}},
      $wrapper:{0:wrapper,addClass:k=>wrapper.classList.add(k),removeClass:k=>wrapper.classList.remove(k)},
      get_status:df.get_status, refresh(){value=doc[df.fieldname];}, set_input(v){value=v;},
      get_value(){return Number(value);}, get_model_value(){return doc[df.fieldname];},
      set_value(v){return this.validate_and_set_in_model(v);},
      async set_model_value(v){if(nativeSet)await nativeSet(df.fieldname,v);doc[df.fieldname]=v;},
      validate_and_set_in_model(v){return v===doc[df.fieldname]?Promise.resolve():this.set_model_value(v);},
    };
    return c;
  }}};
  const bind = name => workbench.bindControl(element(),{df:{fieldname:name,label:name}},row,true);
  return {workbench,row,bind};
}
test('synthetic row controls preserve a native fallback and forward the grid Link query', () => {
  const {workbench,row}=boundWorkbench();
  const native=workbench.bindControl(element(),{df:{fieldname:'warehouse',label:'Warehouse',fieldtype:'Link'}},row,true);
  assert.equal(native.get_query(),'native-link-query');
  const override=()=> 'configured-query';
  const configured=workbench.bindControl(element(),{df:{fieldname:'warehouse',label:'Warehouse',fieldtype:'Link'},get_query:override},row,true);
  assert.equal(configured.get_query,override);
  assert.equal(configured.get_query(),'configured-query');
  configured.$input.val('Stores');
  configured.$input[0].handlers['input.bnd-bill']();
  assert.equal(workbench.editTimers.size,0,'Link typing must reach native autocomplete before validation');
});
test('rejected input gets an associated plain-text inline error; clearing to native value removes only owned help', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.$input.val('10'); await control.set_model_value(10);
  const error=control.$wrapper[0].querySelector('.bnd-bill-field-error');
  assert.ok(error,'error must be beside the actual control');
  assert.match(error.textContent,/selected price list/);
  assert.equal(control.$input[0].getAttribute('aria-describedby'),`native-help ${error.id}`);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  assert.equal(workbench.invalid.get('row-06:discount_percentage').raw,'10');
  assert.equal(row.rate,100); assert.equal(row.discount_percentage,0);
  control.$input.val('0'); await control.validate_and_set_in_model(0);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  assert.equal(control.$input[0].getAttribute('aria-describedby'),'native-help');
  assert.equal(control.$input[0].getAttribute('aria-invalid'),null);
  assert.equal(control.$wrapper[0].classList.contains('bnd-bill-invalid'),false);
  assert.equal(workbench.invalid.size,0);
});
test('an untouched focused dependent price refreshes from native calculation instead of becoming a false edit', () => {
  const {workbench:w,row,bind}=boundWorkbench(), rate=bind('rate');
  context.document.activeElement=rate.$input[0];
  row.rate=76; w.render();
  assert.equal(rate.get_value(),76);
  assert.equal(rate.get_value(),rate.get_model_value(),'flush must not see a false edit');
  assert.equal(context.document.activeElement,rate.$input[0]);
});
test('focused equivalent formatting, pending typing and rejected raw values survive dependent refresh', () => {
  const {workbench:w,row,bind}=boundWorkbench(), rate=bind('rate'), key='row-06:rate';
  context.document.activeElement=rate.$input[0];
  row.rate=125.5; rate.$input.val('125.50'); w.render();
  assert.equal(rate.$input.val(),'125.50');
  rate.$input.val('7.'); w.pending.set(key,'7.'); row.rate=76; w.render();
  assert.equal(rate.$input.val(),'7.');
  w.pending.clear(); rate.$input.val('-1'); w.invalid.set(key,{raw:'-1',message:'invalid'}); w.render();
  assert.equal(rate.$input.val(),'-1');
});
test('unrelated successful edits and focused refresh preserve the error and newer pending typing', async () => {
  const {workbench,row,bind}=boundWorkbench(), discount=bind('discount_percentage'), qty=bind('qty');
  discount.$input.val('10'); await discount.set_model_value(10);
  const id=discount.$wrapper[0].querySelector('.bnd-bill-field-error')?.id;
  discount.$input.val('15'); workbench.pending.set('row-06:discount_percentage','15');
  context.document.activeElement=discount.$input[0];
  qty.$input.val('2'); await qty.set_model_value(2);
  assert.equal(discount.$input.val(),'15'); assert.equal(row.qty,2); assert.equal(row.discount_percentage,0);
  assert.equal(discount.$wrapper[0].querySelector('.bnd-bill-field-error')?.id,id);
  assert.equal(discount.$input[0].getAttribute('aria-invalid'),'true');
  context.document.activeElement=null; workbench.render();
  assert.equal(discount.$input.val(),'15','old rejection must not replace newer raw input');
  assert.equal(discount.$input[0].getAttribute('aria-describedby'),`native-help ${id}`);
});
test('independent errors keep unique IDs, do not render HTML, and cleanly clear on revert or read-only refresh', async () => {
  const {workbench,bind}=boundWorkbench(), discount=bind('discount_percentage'), qty=bind('qty');
  discount.$input.val('10'); await discount.set_model_value(10);
  qty.$input.val('0'); await qty.set_model_value(0);
  const error=discount.$wrapper[0].querySelector('.bnd-bill-field-error');
  assert.notEqual(error?.id,qty.$wrapper[0].querySelector('.bnd-bill-field-error')?.id);
  workbench.invalid.get('row-06:discount_percentage').message='<img src=x onerror=alert(1)>';
  workbench.render(); assert.equal(error.textContent,'<img src=x onerror=alert(1)>'); assert.equal(error.children.length,0);
  discount.get_status=()=> 'None'; workbench.render();
  assert.equal(discount.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  assert.equal(discount.$input[0].getAttribute('aria-describedby'),'native-help');
  assert.equal(workbench.invalid.size,2,'permissions must not silently accept rejected edits');
  workbench.invalid.clear(); workbench.pending.clear(); workbench.render();
  assert.equal(qty.$input[0].getAttribute('aria-invalid'),null);
  assert.equal(qty.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('row removal forgets errors/pending values without disturbing another row', async () => {
  const {workbench,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.$input.val('10'); await control.set_model_value(10);
  workbench.invalid.set('other:qty',{raw:'0',message:'other error'});
  workbench.forgetRow('row-06'); workbench.render();
  assert.equal(workbench.invalid.size,1); assert.equal(workbench.pending.size,0);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('invalid field errors block both native save and submit after flush', async () => {
  const {workbench,row}=boundWorkbench();
  workbench.invalid.set('row-06:qty',{raw:'0',message:'bad quantity'});
  workbench.doc.customer='TEST'; workbench.profile={party:'customer'};
  workbench.flush=async()=>{}; workbench.render=()=>{};
  workbench.frm.is_dirty=()=>false;
  workbench.frm.save=async()=>assert.fail('invalid draft reached save');
  let submitted=false; workbench.frm.savesubmit=async()=>{submitted=true;};
  await workbench.save(); assert.match(workbench.lastMessage,/highlighted/);
  await workbench.submit(); assert.equal(submitted,false); assert.match(workbench.lastMessage,/highlighted/);
  assert.equal(row.qty,1);
});
test('Bunood errors never erase native required/invalid presentation or unrelated help', async () => {
  const {workbench,bind}=boundWorkbench(), control=bind('discount_percentage');
  control.refresh=()=>{control.$wrapper[0].classList.add('has-error');control.$input[0].setAttribute('aria-invalid','true');};
  workbench.render();
  assert.equal(control.$wrapper[0].classList.contains('has-error'),true);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  control.$input.val('10'); await control.set_model_value(10);
  control.$input[0].setAttribute('aria-describedby',control.$input[0].getAttribute('aria-describedby')+' later-help');
  control.$input.val('0'); await control.validate_and_set_in_model(0);
  assert.equal(control.$wrapper[0].classList.contains('has-error'),true);
  assert.equal(control.$input[0].getAttribute('aria-invalid'),'true');
  assert.equal(control.$input[0].getAttribute('aria-describedby'),'native-help later-help');
  assert.equal(control.$wrapper[0].classList.contains('bnd-bill-invalid'),false);
});
test('superseded queued edits retain newer typing until explicit validation, including clear-to-current', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('discount_percentage');
  let release;
  const hold=workbench.queue.run(()=>new Promise(resolve=>{release=resolve;}));
  await Promise.resolve();
  control.$input.val('10'); const failed=control.set_model_value(10);
  control.$input.val('15'); workbench.pending.set('row-06:discount_percentage','15');
  release(); await hold; await failed; workbench.render();
  assert.equal(control.$input.val(),'15'); assert.equal(row.discount_percentage,0);
  assert.equal(workbench.invalid.size,0,'superseded queued edit must not show an old error');
  control.$input.val('0'); await control.validate_and_set_in_model(0); workbench.render();
  assert.equal(workbench.invalid.size,0); assert.equal(workbench.pending.size,0);
  assert.equal(Number(control.$input.val()),0);
});
test('restoring the native value while an invalid edit is queued cancels its late error', async () => {
  const {workbench,row,bind}=boundWorkbench(), control=bind('qty');
  let release;
  const hold=workbench.queue.run(()=>new Promise(resolve=>{release=resolve;})); await Promise.resolve();
  control.$input.val('0'); const old=control.set_model_value(0);
  control.$input.val('1'); workbench.pending.set('row-06:qty','1');
  await control.validate_and_set_in_model(1);
  release(); await hold; await old; workbench.render();
  assert.equal(workbench.invalid.size,0); assert.equal(workbench.pending.size,0);
  assert.equal(Number(control.$input.val()),1); assert.equal(row.qty,1);
  assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
});
test('Read/None native refresh does not replay rejected raw values into the native display', async () => {
  for (const status of ['Read','None']) {
    const {workbench,row,bind}=boundWorkbench(), control=bind('qty');
    control.$input.val('0'); await control.set_model_value(0);
    let displayed;
    control.get_status=()=>status;
    control.refresh=()=>{displayed=row.qty;};
    control.set_input=value=>{displayed=value;};
    workbench.render();
    assert.equal(displayed,1); assert.equal(workbench.invalid.size,1);
    assert.equal(control.$wrapper[0].querySelector('.bnd-bill-field-error'),null);
  }
});
test('inline error growth does not bottom-align neighboring invoice controls', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  const line=scss.match(/\.bnd-bill-line \{([^}]+)\}/)[1];
  assert.match(line,/align-items: stretch/);
  assert.match(scss,/bnd-bill-line-total.*align-content: start/);
});
test('spreadsheet row gives every label and control a shared vertical track', () => {
  const scss=fs.readFileSync('bunood_theme/public/scss/surfaces/_sales_bill.scss','utf8');
  assert.match(scss,/--bnd-bill-line-label-h:\s*3rem/);
  assert.match(scss,/\.bnd-bill-cell > \.frappe-control[\s\S]*?grid-template-rows:\s*var\(--bnd-bill-line-label-h\) auto/);
  assert.match(scss,/\.bnd-bill-item[^}]*grid-template-rows:\s*var\(--bnd-bill-line-label-h\) auto/);
  assert.match(scss,/\.bnd-bill-line-total[^}]*grid-template-rows:\s*var\(--bnd-bill-line-label-h\) auto/);
  assert.match(scss,/\.bnd-bill-line \.frappe-control :is\([^}]*block-size:\s*var\(--bnd-control-h\)/);
  assert.match(scss,/\.bnd-bill-line \.frappe-control \.control-value[^}]*white-space:\s*nowrap/);
});

// Disabling a containing fieldset removes browser focus. Model that side effect,
// then exercise the actual busy policy and serial/native-control integration.
function editingWorkbench(nativeSet) {
  const fixture = boundWorkbench(nativeSet), w = fixture.workbench;
  w.profile = {party:'customer'}; w.frm.doc.customer = 'TEST';
  w.root = element(); w.rowViews = new Map([['row-06',{remove:{}}]]);
  for (const name of ['addButton','saveButton','submitButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) w[name] = {};
  let disabled = false;
  w.editor = {get disabled(){return disabled;},set disabled(value){disabled=value;if(value)context.document.activeElement=null;}};
  w.busy = context.window.bunood_theme.sales_bill.BillWorkbench.prototype.busy;
  w.queue = new SerialChanges(()=>true,()=>w.busy());
  return fixture;
}
test('queued recalculation keeps typing focus while structural and commit actions stay disabled', async () => {
  const {workbench:w,bind}=editingWorkbench(), qty=bind('qty');
  context.document.activeElement=qty.$input[0];
  let release;
  const task=w.queue.run(()=>new Promise(resolve=>release=resolve));
  await Promise.resolve();
  try {
    assert.equal(w.editor.disabled,false,'queued input must not disable its fieldset');
    assert.equal(context.document.activeElement,qty.$input[0]);
    assert.equal(w.root.getAttribute('aria-busy'),'true');
    for(const name of ['addButton','saveButton','submitButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) assert.equal(w[name].disabled,true,name);
    assert.equal(w.rowViews.get('row-06').remove.disabled,true);
  } finally {release();await task;}
  assert.equal(w.root.getAttribute('aria-busy'),'false');
  assert.equal(w.editor.disabled,false);
  for(const name of ['addButton','saveButton','submitButton','newButton','advancedButton','scanButton','newPartyButton','zatcaButton']) assert.equal(w[name].disabled,false,name);
  assert.equal(w.rowViews.get('row-06').remove.disabled,false);
});
test('saving closing and flushing still lock the editor independently of queued work', () => {
  const {workbench:w}=editingWorkbench();
  for(const flag of ['saving','closing','flushing']) {
    w[flag]=true;w.busy();assert.equal(w.editor.disabled,true,flag);
    assert.equal(w.saveButton.disabled,true);assert.equal(w.root.getAttribute('aria-busy'),'true');
    w[flag]=false;w.busy();assert.equal(w.editor.disabled,false,flag);
  }
});
test('typing newer values and moving focus during a deferred queue preserves both choices', async () => {
  const {workbench:w,row,bind}=editingWorkbench(), qty=bind('qty'), rate=bind('rate');
  context.document.activeElement=qty.$input[0];
  let release;const gate=w.queue.run(()=>new Promise(resolve=>release=resolve));await Promise.resolve();
  qty.$input.val('2');const old=qty.set_model_value(2);
  qty.$input.val('23');const latest=qty.set_model_value(23);
  context.document.activeElement=rate.$input[0];
  rate.$input.val('125.5');const price=rate.set_model_value(125.5);
  release();await Promise.all([gate,old,latest,price]);
  assert.equal(row.qty,23);assert.equal(row.rate,125.5);
  assert.equal(context.document.activeElement,rate.$input[0],'completion must not steal the chosen focus');
  assert.equal(rate.$input.val(),'125.5','focused raw text must not be reformatted');
  assert.equal(w.pending.size,0);assert.equal(w.invalid.size,0);
});
test('real input handlers preserve continued typing through an in-flight native setter', async () => {
  let release, started;
  const entered=new Promise(resolve=>started=resolve), originalTimer=context.setTimeout, originalClear=context.clearTimeout;
  const callbacks=new Map();let timerId=0;
  context.setTimeout=fn=>{callbacks.set(++timerId,fn);return timerId;};
  context.clearTimeout=id=>callbacks.delete(id);
  const {workbench:w,row,bind}=editingWorkbench(async(field,value)=>{if(field==='qty'&&value===2){started();await new Promise(resolve=>release=resolve);}});
  const qty=bind('qty'),rate=bind('rate');
  const input=(control,value)=>{control.$input.val(value);control.$input[0].handlers['input.bnd-bill']();};
  const tick=()=>{const work=[...callbacks.values()];callbacks.clear();for(const fn of work)fn();};
  try {
    context.document.activeElement=qty.$input[0];input(qty,'2');tick();await entered;
    input(qty,'23');tick();
    context.document.activeElement=rate.$input[0];input(rate,'125.5');tick();
    release();await w.queue.tail;await Promise.resolve();
    assert.equal(row.qty,23);assert.equal(row.rate,125.5);
    assert.equal(qty.$input.val(),23);assert.equal(rate.$input.val(),'125.5');
    assert.equal(context.document.activeElement,rate.$input[0]);assert.equal(w.pending.size,0);
  } finally {release?.();context.setTimeout=originalTimer;context.clearTimeout=originalClear;}
});
test('queue completion cannot unlock an in-flight ZATCA action', () => {
  const {workbench:w}=editingWorkbench();
  w.zatcaSending=true;w.queue.count=1;w.busy();assert.equal(w.zatcaButton.disabled,true);
  w.queue.count=0;w.busy();assert.equal(w.zatcaButton.disabled,true);
  assert.equal(w.editor.disabled,false);w.zatcaSending=false;w.busy();assert.equal(w.zatcaButton.disabled,false);
});
test('ZATCA action respects busy state, rejects duplicate sends and releases only its own lock', async () => {
  const originalCall=context.frappe.call,originalTimer=context.setTimeout;
  context.setTimeout=()=>0;
  try {
    for(const fails of [false,true]) {
      const {workbench:w}=editingWorkbench();w.zatcaData={state:'ready_to_send',can_queue:true};w.zatcaStatus={};
      let release,calls=0;
      context.frappe.call=async()=>{calls++;await new Promise((resolve,reject)=>release=()=>fails?reject(Error('test rejection')):resolve());};
      w.queue.count=1;w.busy();await w.zatcaAction();assert.equal(calls,0);
      w.queue.count=0;w.busy();const send=w.zatcaAction();assert.equal(calls,1);
      await w.zatcaAction();assert.equal(calls,1,'duplicate send must be ignored');
      w.queue.count=1;w.busy();release();
      if(fails)await assert.rejects(send,/test rejection/);else await send;
      assert.equal(w.zatcaSending,false);assert.equal(w.zatcaButton.disabled,true,'queued edits still own their lock');
      w.queue.count=0;w.busy();assert.equal(w.zatcaButton.disabled,false);
    }
  } finally {context.frappe.call=originalCall;context.setTimeout=originalTimer;}
});
