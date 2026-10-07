/* global frappe, __ */
frappe.pages['bnd-stock'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({parent:wrapper, title:__('Stock'), single_column:true});
    const host = document.createElement('section');
    host.className = 'bnd-sales-page bnd-stock-page'; page.main[0].append(host);
    const add = (tag,text,parent=host) => {
        const node=document.createElement(tag); if(text!==undefined) node.textContent=text;
        parent.append(node); return node;
    };
    const button = (text,action,parent=host) => {
        const node=add('button',text,parent); node.type='button'; node.className='btn btn-default';
        node.addEventListener('click',action); return node;
    };
    const readable = name => (frappe.boot?.user?.can_read || []).includes(name);
    const creatable = name => (frappe.boot?.user?.can_create || []).includes(name);
    const actions=add('nav'); actions.className='bnd-sales-actions'; actions.setAttribute('aria-label',__('Stock'));
    for(const purpose of ['Material Receipt','Material Issue','Material Transfer']) {
        if(creatable('Stock Entry')) button(__(purpose),()=>frappe.new_doc('Stock Entry',{
            company:company.get_value(),stock_entry_type:purpose}),actions);
    }
    if(creatable('Stock Reconciliation')) button(__('Stock Reconciliation'),()=>frappe.new_doc('Stock Reconciliation',{
        company:company.get_value()}),actions);
    const links=add('nav'); links.className='bnd-sales-actions'; links.setAttribute('aria-label',__('Reports'));
    for(const name of ['Item','Warehouse']) if(readable(name)) button(__(name),()=>frappe.set_route('List',name),links);
    // These are ERPNext reports: permission checks, quantities and valuation stay native.
    for(const report of ['Stock Balance','Stock Ledger']) button(__(report),()=>{
        frappe.route_options={company:company.get_value()}; frappe.set_route('query-report',report);
    },links);
    const stages=add('nav'); stages.className='bnd-sales-stages'; stages.setAttribute('aria-label',__('Documents'));
    const records=add('section'); records.className='bnd-sales-records'; records.setAttribute('aria-live','polite');
    let selected='Stock Entry',request=0; const tabs=new Map();
    for(const name of ['Stock Entry','Purchase Receipt','Delivery Note','Stock Reconciliation']) {
        if(readable(name)) tabs.set(name,button(__(name),()=>{selected=name;void load();},stages));
    }
    if(!tabs.has(selected)) selected=tabs.keys().next().value || selected;
    async function load() {
        const id=++request,doctype=selected,scope=company.get_value();
        records.replaceChildren();
        for(const [name,tab] of tabs) tab.setAttribute('aria-pressed',String(name===doctype));
        if(!scope){add('p',__('Select a company'),records);return;}
        if(!readable(doctype)){add('p',__('Not permitted'),records);return;}
        add('p',__('Loading…'),records);
        try {
            const response=await frappe.call({method:'frappe.client.get_list',type:'GET',args:{doctype,
                fields:['name','posting_date','docstatus'],filters:{company:scope},order_by:'modified desc',limit_page_length:25}});
            const rows=response.message || [];
            if(id!==request || scope!==company.get_value()) return;
            records.replaceChildren();
            if(!rows.length) add('p',__('No records'),records);
            const table=add('table',undefined,records);table.className='table';
            const head=add('tr',undefined,add('thead',undefined,table));
            for(const label of ['Document','Date','Status']){const cell=add('th',__(label),head);cell.scope='col';}
            const body=add('tbody',undefined,table);
            for(const row of rows){const tr=add('tr',undefined,body);
                button(row.name,()=>frappe.set_route('Form',doctype,row.name),add('td',undefined,tr));
                add('td',frappe.datetime.str_to_user(row.posting_date),tr);
                add('td',__({0:'Draft',1:'Submitted',2:'Cancelled'}[row.docstatus]),tr);
            }
            button(__('View all'),()=>{frappe.route_options={company:scope};frappe.set_route('List',doctype);},records);
        } catch(error){if(id!==request)return;records.replaceChildren();add('p',__('Unable to load records'),records);
            button(__('Retry'),()=>void load(),records);}
    }
    const company=page.add_field({fieldname:'company',label:__('Company'),fieldtype:'Link',options:'Company',change:()=>void load()});
    page.set_primary_action(__('Home'),()=>frappe.set_route('bnd-home'));
    page.set_secondary_action(__('Refresh'),()=>void load());
    wrapper.bunood_stock_refresh=()=>void load();
    const initial=frappe.route_options?.company || frappe.defaults.get_user_default('Company');
    if(initial) company.set_value(initial);else void load();
};
frappe.pages['bnd-stock'].on_page_show = wrapper => wrapper.bunood_stock_refresh?.();
