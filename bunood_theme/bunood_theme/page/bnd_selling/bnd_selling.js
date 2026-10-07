/* global frappe, __ */
frappe.pages["bnd-selling"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Sales desk"), single_column: true });
    const host = document.createElement("div");
    host.className = "bnd-sales-page";
    page.main[0].appendChild(host);
    const stages = [
        ["Quotation", __("Offers")], ["Sales Order", __("Orders")],
        ["Delivery Note", __("Deliveries")], ["Sales Invoice", __("Invoices")],
        ["Payment Entry", __("Collections")],
    ];
    const labels = { all: __("All"), drafts: __("Drafts"), active: __("Submitted"), cancelled: __("Cancelled") };
    let selected = "Sales Invoice", state = "all", offset = 0, request = 0, searchTimer;
    const add = (tag, text, parent = host) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        parent.appendChild(node); return node;
    };
    const button = (label, action, parent) => {
        const node = add("button", label, parent);
        node.type = "button"; node.className = "btn btn-default";
        node.addEventListener("click", action); return node;
    };
    const stagesHost = add("nav"); stagesHost.setAttribute("aria-label", __("Sales stages"));
    stagesHost.className = "bnd-sales-stages";
    const tabs = new Map();
    for (const [doctype, title] of stages) {
        tabs.set(doctype, button(title, () => { selected = doctype; offset = 0; void load(); }, stagesHost));
    }
    const filters = add("div"); filters.className = "bnd-sales-filters";
    const statusLabel = add("label", __("Status"), filters);
    const status = add("select", undefined, statusLabel); status.className = "form-control";
    for (const [value, title] of Object.entries(labels)) {
        const option = add("option", title, status); option.value = value;
    }
    status.addEventListener("change", () => { state = status.value; offset = 0; void load(); });
    const searchLabel = add("label", __("Search invoices, orders or customer"), filters);
    const search = add("input", undefined, searchLabel);
    search.type = "search"; search.maxLength = 140; search.className = "form-control";
    search.addEventListener("input", () => {
        ++request; clearTimeout(searchTimer);
        records.replaceChildren();
        add("p", __("Loading…"), records);
        searchTimer = setTimeout(() => { offset = 0; void load(); }, 250);
    });
    const records = add("section"); records.className = "bnd-sales-records";
    records.setAttribute("aria-live", "polite");
    const open = name => frappe.set_route("Form", selected, name);
    async function load() {
        const id = ++request, companyName = company.get_value();
        const doctype = selected, requestedOffset = offset, query = search.value.trim();
        for (const [name, tab] of tabs) tab.setAttribute("aria-pressed", String(name === doctype));
        records.replaceChildren();
        if (!companyName) { add("p", __("Select a company"), records); return; }
        add("p", __("Loading…"), records);
        try {
            const response = await frappe.call({ method: "bunood_theme.sales_center.read", type: "GET",
                args: { company: companyName, doctype, state, search: query, start: requestedOffset } });
            if (id !== request || doctype !== selected || companyName !== company.get_value()) return;
            const data = response.message;
            records.replaceChildren();
            const actions = add("div", undefined, records); actions.className = "bnd-sales-actions";
            if ((frappe.boot?.user?.can_create || []).includes(doctype)) {
                button(__("New"), () => {
                    const defaults = { company: companyName };
                    if (doctype === "Payment Entry") Object.assign(defaults, { party_type: "Customer", payment_type: "Receive" });
                    // Engineering's documented Desk opt-out keeps a generic
                    // sales quotation here; opening Engineering clears it.
                    if (doctype === "Quotation") {
                        frappe.provide("bunood_engineering.workspace");
                        window.bunood_engineering.workspace.kept = true;
                        try { window.sessionStorage.setItem("bnd_engineering_desk", "1"); } catch (_) { /* Browser storage may be unavailable. */ }
                    }
                    frappe.new_doc(doctype, defaults);
                }, actions);
            }
            const tableWrap = add("div", undefined, records); tableWrap.className = "bnd-sales-table";
            const table = add("table", undefined, tableWrap); table.className = "table";
            const caption = add("caption", stages.find(([name]) => name === doctype)[1], table);
            caption.className = "sr-only";
            const head = add("tr", undefined, add("thead", undefined, table));
            for (const title of [__("Document"), __("Customer"), __("Date"), __("Status"), __("Amount")]) {
                const cell = add("th", title, head); cell.scope = "col";
            }
            const body = add("tbody", undefined, table);
            for (const row of data.rows || []) {
                const tr = add("tr", undefined, body);
                button(row.name, () => open(row.name), add("td", undefined, tr));
                add("td", row[data.party_field] || "", tr);
                add("td", row[data.date_field] ? frappe.datetime.str_to_user(row[data.date_field]) : "", tr);
                add("td", row.status ? __(row.status) : ({0: __("Draft"), 1: __("Submitted"), 2: __("Cancelled")}[row.docstatus] || ""), tr);
                add("td", frappe.format(row[data.amount_field], { fieldtype: "Currency", options: data.currency_field }, { only_value: true }, row).replace(/<[^>]*>/g, ""), tr);
            }
            if (!(data.rows || []).length) add("p", __("No records to show"), records);
            const pagination = add("nav", undefined, records);
            pagination.setAttribute("aria-label", __("Sales list pages")); pagination.className = "bnd-sales-actions";
            const previous = button(__("Previous"), () => { offset = Math.max(0, offset - data.page_size); void load(); }, pagination);
            previous.disabled = requestedOffset === 0;
            const next = button(__("Next"), () => { offset += data.page_size; void load(); }, pagination);
            next.disabled = !data.has_more;
        } catch (error) {
            if (id !== request) return;
            records.replaceChildren(); add("p", __("Unable to load sales records. Check your permissions and try again."), records);
            button(__("Retry"), () => void load(), records);
        }
    }
    const company = page.add_field({ fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company",
        change: () => { offset = 0; void load(); } });
    page.set_secondary_action(__("Refresh"), () => void load());
    page.set_primary_action(__("Home"), () => frappe.set_route("bnd-home"));
    const initial = frappe.route_options?.company || frappe.defaults.get_user_default("Company");
    wrapper.bunood_sales_refresh = () => { offset = 0; void load(); };
    if (initial) company.set_value(initial); else void load();
};
frappe.pages["bnd-selling"].on_page_show = function (wrapper) {
    wrapper.bunood_sales_refresh?.();
};
