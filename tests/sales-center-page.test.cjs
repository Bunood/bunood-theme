const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual Page with a small event-capable DOM; no copied controller.
class Element {
    constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.parentNode=null; this.listeners={}; this.attributes={}; this.value=''; this.disabled=false; this._text=''; }
    appendChild(node) { if(node.parentNode) node.parentNode.children=node.parentNode.children.filter(n=>n!==node); this.children.push(node); node.parentNode=this; return node; }
    replaceChildren(...nodes) { this.children.forEach(n=>n.parentNode=null); this.children=[]; this._text=''; nodes.forEach(n=>this.appendChild(n)); }
    set textContent(value) { this.replaceChildren(); this._text=String(value); }
    get textContent() { return this._text+this.children.map(n=>n.textContent).join(''); }
    set innerHTML(_) { throw new Error('Untrusted HTML parser used'); }
    setAttribute(key,value) { this.attributes[key]=String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(event,fn) { (this.listeners[event]??=[]).push(fn); }
    dispatch(event) { for(const fn of this.listeners[event]||[]) fn({target:this}); }
    click() { if(!this.disabled) this.dispatch('click'); }
    get isConnected() { return this.tagName==='ROOT' || !!this.parentNode?.isConnected; }
}
const source=fs.readFileSync(path.join(__dirname,'../bunood_theme/bunood_theme/page/bnd_selling/bnd_selling.js'),'utf8');
const flatten = node => [node,...node.children.flatMap(flatten)];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function page({company='Company A',create=['Sales Invoice','Payment Entry'],format=value=>`<span>${value}</span>`,code=source,engineering,storageThrows=false}={}) {
    const root=new Element('root'), wrapper={}, calls=[], routes=[], created=[], timers=new Map();let timer=0, field;
    const actions={},events=[],storageCalls=[];
    const window={sessionStorage:{setItem(key,value){storageCalls.push([key,value]);events.push('storage');if(storageThrows)throw new Error('storage unavailable');}}};
    if(engineering!==undefined)window.bunood_engineering=engineering;
    const frappe={pages:{'bnd-selling':{}},boot:{user:{can_create:create}},route_options:null,
        defaults:{get_user_default:()=>company},datetime:{str_to_user:value=>value},format,
        provide(namespace){events.push('provide');let target=window;for(const part of namespace.split('.'))target=target[part]??=( {} );},
        set_route:(...args)=>routes.push(args),new_doc:(doctype,defaults)=>{events.push('new_doc');created.push({doctype,defaults:JSON.parse(JSON.stringify(defaults))});},
        call:options=>new Promise((resolve,reject)=>calls.push({options,resolve,reject})),
        ui:{make_app_page:()=>({main:[root],add_field:options=>{
            field={value:'',get_value(){return this.value;},set_value(value){this.value=value;options.change();}};return field;
        },set_secondary_action:(label,fn)=>{actions[label]=fn;},set_primary_action:(label,fn)=>{actions[label]=fn;}})}};
    vm.runInNewContext(code,{frappe,window,__:(text)=>text,document:{createElement:tag=>new Element(tag)},
        setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)});
    frappe.pages['bnd-selling'].on_page_load(wrapper);
    const nodes=()=>flatten(root);
    return {root,frappe,window,wrapper,calls,routes,created,actions,events,storageCalls,company:()=>field,
        button:label=>nodes().find(n=>n.tagName==='BUTTON' && n.textContent===label),
        input:()=>nodes().find(n=>n.tagName==='INPUT'),status:()=>nodes().find(n=>n.tagName==='SELECT'),
        records:()=>nodes().find(n=>n.className==='bnd-sales-records'),
        search(value){this.input().value=value;this.input().dispatch('input');},
        fireTimers(){const list=[...timers.values()];timers.clear();list.forEach(fn=>fn());},
        show(){frappe.pages['bnd-selling'].on_page_show(wrapper);},nodes};
}
function data(names=[],extra={}) {
    return {rows:names.map(name=>({name,customer:'Customer',posting_date:'2026-10-07',grand_total:50,currency:'SAR',docstatus:0})),
        party_field:'customer',date_field:'posting_date',amount_field:'grand_total',currency_field:'currency',page_size:25,has_more:false,...extra};
}
async function resolve(p,index,names=[],extra={}) { p.calls[index].resolve({message:data(names,extra)});await flush(); }

test('company request race only renders the latest company',async()=>{
    const p=page();p.company().set_value('Company B');
    await resolve(p,1,['B-INVOICE']);await resolve(p,0,['A-INVOICE']);
    assert.ok(p.button('B-INVOICE'));assert.equal(p.button('A-INVOICE'),undefined);
    assert.equal(p.calls[1].options.args.company,'Company B');
});

test('document-type race cannot route a returned old invoice as an order',async()=>{
    const p=page();p.button('Orders').click();await resolve(p,1,['ORDER']);await resolve(p,0,['INVOICE']);
    assert.equal(p.button('INVOICE'),undefined);p.button('ORDER').click();
    assert.deepEqual(p.routes,[['Form','Sales Order','ORDER']]);
});

test('search invalidates an in-flight response before debounce fires',async()=>{
    const p=page();p.search('new');await resolve(p,0,['OLD']);
    assert.equal(p.button('OLD'),undefined);p.fireTimers();
    assert.equal(p.calls[1].options.args.search,'new');await resolve(p,1,['NEW']);assert.ok(p.button('NEW'));
});

test('changing search immediately retires previous visible record actions',async()=>{
    const p=page();await resolve(p,0,['OLD']);p.search('different');
    p.button('OLD')?.click();
    assert.equal(p.routes.length,0,'old result remains clickable during the search debounce');
});

test('success from an earlier search cannot replace newer results',async()=>{
    const p=page();p.search('first');p.fireTimers();p.search('second');p.fireTimers();
    await resolve(p,2,['SECOND']);await resolve(p,1,['FIRST']);await resolve(p,0,['ORIGINAL']);
    assert.ok(p.button('SECOND'));assert.equal(p.button('FIRST'),undefined);
});

test('status changes reset paging and reject older status responses',async()=>{
    const p=page();await resolve(p,0,['FIRST'],{has_more:true});p.button('Next').click();
    assert.equal(p.calls[1].options.args.start,25);
    p.status().value='drafts';p.status().dispatch('change');
    assert.equal(p.calls[2].options.args.start,0);assert.equal(p.calls[2].options.args.state,'drafts');
    await resolve(p,2,['DRAFT']);await resolve(p,1,['OLD-PAGE']);assert.equal(p.button('OLD-PAGE'),undefined);
});

test('create permission is required and invoice receives selected company defaults',async()=>{
    const denied=page({create:[]});await resolve(denied,0);assert.equal(denied.button('New'),undefined);
    const allowed=page();await resolve(allowed,0);allowed.button('New').click();
    assert.deepEqual(allowed.created,[{doctype:'Sales Invoice',defaults:{company:'Company A'}}]);
});

test('new collection retains native Customer Receive defaults',async()=>{
    const p=page();p.button('Collections').click();await resolve(p,1);p.button('New').click();
    assert.deepEqual(p.created,[{doctype:'Payment Entry',defaults:{company:'Company A',party_type:'Customer',payment_type:'Receive'}}]);
});

test('cached Page show refreshes and rejects pending old content',async()=>{
    const p=page();p.show();assert.equal(p.calls.length,2);
    await resolve(p,1,['FRESH']);await resolve(p,0,['STALE']);
    assert.ok(p.button('FRESH'));assert.equal(p.button('STALE'),undefined);
});

test('error is distinct from valid empty and Retry starts a fresh request',async()=>{
    const p=page();p.calls[0].reject(new Error('private server error'));await flush();
    assert.ok(p.button('Retry'));assert.ok(!p.records().textContent.includes('No records to show'));
    assert.ok(!p.records().textContent.includes('private server error'));
    p.button('Retry').click();await resolve(p,1);
    assert.ok(p.records().textContent.includes('No records to show'));assert.equal(p.button('Retry'),undefined);
});

test('stale failure does not erase current successful content',async()=>{
    const p=page();p.company().set_value('Company B');await resolve(p,1,['CURRENT']);
    p.calls[0].reject(new Error('stale'));await flush();assert.ok(p.button('CURRENT'));assert.equal(p.button('Retry'),undefined);
});

test('record and customer text never invokes an HTML parser',async()=>{
    const p=page();const attack='<img src=x onerror=globalThis.injected=true>';
    await resolve(p,0,[],{rows:[{name:attack,customer:attack,grand_total:3,currency:'SAR',docstatus:0}]});
    assert.ok(p.button(attack));assert.equal(p.nodes().filter(n=>n.tagName==='IMG').length,0);
    p.button(attack).click();assert.deepEqual(p.routes,[['Form','Sales Invoice',attack]]);
});

test('missing company makes no reader call and no create affordance',()=>{
    const p=page({company:null});assert.equal(p.calls.length,0);assert.ok(p.records().textContent.includes('Select a company'));
    assert.equal(p.button('New'),undefined);
});

test('clearing company retires loaded actions and ignores a pending response',async()=>{
    const p=page();await resolve(p,0,['A']);p.actions.Refresh();p.company().set_value('');
    await resolve(p,1,['LATE']);assert.equal(p.button('LATE'),undefined);assert.equal(p.button('New'),undefined);
    assert.ok(p.records().textContent.includes('Select a company'));
});

test('invoice create permission does not grant collection creation',async()=>{
    const p=page({create:['Sales Invoice']});p.button('Collections').click();await resolve(p,1);
    assert.equal(p.button('New'),undefined);assert.equal(p.created.length,0);
});

test('cached show resets pagination instead of showing a stale later page',async()=>{
    const p=page();await resolve(p,0,['FIRST'],{has_more:true});p.button('Next').click();
    await resolve(p,1,['SECOND']);p.show();assert.equal(p.calls[2].options.args.start,0);
    await resolve(p,2,['CURRENT-FIRST']);assert.ok(p.button('CURRENT-FIRST'));assert.equal(p.button('SECOND'),undefined);
});

// Pinned Frappe16.36.1 meta.js:get_field_currency interprets df.options as
// a FIELD NAME, looks first in the supplied doc, then cur_frm.doc, then the
// site currency. This adapter models that native field/doc branch (no Link colon
// options are used by this Page), not a currency-code-as-options formatter.
function nativeCurrencyFormatter() {
    const calls=[];const stale={currency:'JPY',paid_from_account_currency:'JPY'};
    function format(value,df,options,doc) {
        calls.push({value,df,options,doc});
        let currency='SAR';const context=doc || stale;
        if(df.options && context[df.options]) currency=context[df.options];
        else if(df.options && stale[df.options]) currency=stale[df.options];
        return `${currency} ${value}`;
    }
    return {calls,format};
}
async function currencyCase({collection=false,code=source}={}) {
    const formatter=nativeCurrencyFormatter();const p=page({format:formatter.format,code});
    if(collection)p.button('Collections').click();
    const row=collection?{name:'RECEIVE-EUR',party:'Customer',posting_date:'2026-10-07',paid_amount:75,paid_from_account_currency:'EUR',docstatus:0}
        :{name:'INVOICE-USD',customer:'Customer',posting_date:'2026-10-07',grand_total:50,currency:'USD',docstatus:0};
    await resolve(p,collection?1:0,[],{rows:[row],party_field:collection?'party':'customer',
        amount_field:collection?'paid_amount':'grand_total',currency_field:collection?'paid_from_account_currency':'currency'});
    return {p,formatter,row};
}
test('invoice USD resolves against its own row rather than site SAR or stale JPY',async()=>{
    const {p,formatter,row}=await currencyCase();
    assert.ok(p.records().textContent.includes('USD 50'));
    assert.equal(formatter.calls.length,1);const call=formatter.calls[0];
    assert.equal(call.df.options,'currency');assert.equal(call.doc,row);assert.equal(call.options.only_value,true);
});
test('collection EUR uses paid_from_account_currency field and Payment Entry row',async()=>{
    const {p,formatter,row}=await currencyCase({collection:true});
    assert.ok(p.records().textContent.includes('EUR 75'));
    const call=formatter.calls[0];assert.equal(call.df.options,'paid_from_account_currency');assert.equal(call.doc,row);
    assert.equal(call.options.only_value,true);
});
test('currency regression detects both old code-as-options and missing row argument mutants',async()=>{
    const fixed='frappe.format(row[data.amount_field], { fieldtype: "Currency", options: data.currency_field }, { only_value: true }, row)';
    assert.ok(source.includes(fixed),'production call changed; review the mutation anchor');
    const old='frappe.format(row[data.amount_field], { fieldtype: "Currency", options: row[data.currency_field] })';
    const missingDoc='frappe.format(row[data.amount_field], { fieldtype: "Currency", options: data.currency_field }, { only_value: true })';
    for(const collection of [false,true]) {
        const expected=collection?'EUR 75':'USD 50';
        const oldRun=await currencyCase({collection,code:source.replace(fixed,old)});
        assert.throws(()=>assert.ok(oldRun.p.records().textContent.includes(expected)));
        assert.ok(oldRun.p.records().textContent.includes(collection?'SAR 75':'SAR 50'));
        const staleRun=await currencyCase({collection,code:source.replace(fixed,missingDoc)});
        assert.throws(()=>assert.ok(staleRun.p.records().textContent.includes(expected)));
        assert.ok(staleRun.p.records().textContent.includes(collection?'JPY 75':'JPY 50'));
    }
});

for(const loaded of [false,true]) for(const storageThrows of [false,true]) {
    test(`generic Quotation opts out before native New (namespace ${loaded?'loaded':'absent'}, storage ${storageThrows?'blocked':'available'})`,async()=>{
        const existing={workspace:{kept:false,ownerChoice:'preserved'}};
        const p=page({company:'Sales Company',create:['Quotation'],engineering:loaded?existing:undefined,storageThrows});
        p.button('Offers').click();await resolve(p,1);
        let keptAtCreate;
        const nativeNew=p.frappe.new_doc;
        p.frappe.new_doc=(...args)=>{keptAtCreate=p.window.bunood_engineering?.workspace?.kept;nativeNew(...args);};
        p.button('New').click();
        assert.equal(keptAtCreate,true,'opt-out must precede native controller creation');
        assert.equal(p.window.bunood_engineering.workspace.kept,true);
        if(loaded){assert.equal(p.window.bunood_engineering,existing);assert.equal(existing.workspace.ownerChoice,'preserved');}
        assert.deepEqual(p.storageCalls,[['bnd_engineering_desk','1']]);
        assert.deepEqual(p.events,['provide','storage','new_doc']);
        assert.deepEqual(p.created,[{doctype:'Quotation',defaults:{company:'Sales Company'}}]);
        assert.equal(p.routes.length,0,'the sales action must not redirect to Engineering');
    });
}

test('other sales document types never modify Engineering state or storage',async()=>{
    for(const [doctype,label] of [['Sales Order','Orders'],['Delivery Note','Deliveries'],['Sales Invoice','Invoices'],['Payment Entry','Collections']]) {
        for(const loaded of [false,true]) {
            const existing={workspace:{kept:false,ownerChoice:'preserved'}};
            const p=page({create:[doctype],engineering:loaded?existing:undefined,storageThrows:true});
            p.button(label).click();await resolve(p,1);p.button('New').click();
            assert.deepEqual(p.events,['new_doc']);assert.deepEqual(p.storageCalls,[]);
            assert.equal(p.created[0].doctype,doctype);assert.equal(p.created[0].defaults.company,'Company A');
            if(loaded){assert.equal(p.window.bunood_engineering,existing);assert.equal(existing.workspace.kept,false);}
            else assert.equal(p.window.bunood_engineering,undefined);
        }
    }
});
