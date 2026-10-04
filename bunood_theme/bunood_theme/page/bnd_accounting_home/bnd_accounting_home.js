/* global frappe, __ */
frappe.pages["bnd-accounting-home"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Accounting desk"), single_column: true });
    const host = document.createElement("div");
    host.className = "bnd-accounting-page";
    page.main[0].appendChild(host);
    let request = 0, company;
    const add = (tag, text, parent = host) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        parent.appendChild(node);
        return node;
    };
    const labels = {
        sales_drafts: __("Sales Invoice"), purchase_drafts: __("Purchase Invoice"),
        payment_drafts: __("Payment Entry"), journal_drafts: __("Journal Entry"),
        overdue_receivables: __("Overdue receivables"), payables_due: __("Payables due"),
    };
    const openRecord = row => frappe.set_route("Form", row.doctype, row.name);
    const button = (label, action, parent) => {
        const node = add("button", label, parent);
        node.type = "button"; node.className = "btn btn-default";
        node.addEventListener("click", action); return node;
    };
    async function load() {
        if (!company) return;
        const id = ++request, selected = company.get_value();
        host.replaceChildren();
        if (!selected) { add("p", __("Select a company")); return; }
        add("p", __("Loading…"));
        try {
            const result = await frappe.call({ method: "bunood_theme.accounting_page.read", type: "GET", args: { company: selected } });
            if (id !== request || selected !== company.get_value()) return;
            const data = result.message;
            host.replaceChildren();
            const actions = add("div"); actions.className = "bnd-accounting-actions";
            for (const [label, route] of [
                [__("Journal workbench"), "bnd-journal-workbench"],
                [__("Finance close cockpit"), "bnd-finance-close"],
                [__("Bank reconciliation"), "bnd-banking"],
                [__("Fixed asset workbench"), "bnd-asset-workbench"],
            ]) button(label, () => { frappe.route_options = { company: selected }; frappe.set_route(route); }, actions);
            if (data.checks_incomplete) add("p", __("Some checks are unavailable. Review the native records."));
            add("h2", __("Work queue"));
            const groups = add("div"); groups.className = "bnd-accounting-groups";
            for (const group of data.groups || []) {
                const card = add("section", undefined, groups);
                add("h3", labels[group.key] || __(group.doctype) || group.key, card);
                add("p", group.count == null ? __("Unavailable") : String(group.count), card);
                button(__("Open list"), () => { frappe.route_options = group.filters; frappe.set_route("List", group.doctype); }, card);
            }
            const list = add("div"); list.className = "bnd-accounting-records";
            for (const row of data.queue || []) {
                const entry = add("div", undefined, list);
                button(row.name, () => openRecord(row), entry);
                add("span", `${__(row.doctype)} · ${row.party || ""} · ${row.date || ""}`, entry);
                add("span", row.amount == null ? __("Unavailable") : frappe.format(row.amount, { fieldtype: "Currency", options: data.currency }).replace(/<[^>]*>/g, ""), entry);
            }
            if (!(data.queue || []).length) add("p", __("No records to show"));
            if (data.queue_truncated) add("p", __("More records are available in the full lists."));
            add("h2", __("Bank reconciliation"));
            if (!data.bank?.available) add("p", __("Unavailable"));
            for (const bank of data.bank?.accounts || []) {
                const row = add("div"); row.className = "bnd-accounting-bank";
                button(bank.label || bank.name, () => frappe.set_route("Form", "Bank Account", bank.name), row);
                add("span", bank.open_count == null ? __("Unavailable") : `${__("Unreconciled transactions")}: ${bank.open_count}`, row);
                add("small", __("A signed reconciliation and closing balance have not been verified."), row);
            }
        } catch (error) {
            if (id !== request) return;
            host.replaceChildren(); add("p", __("Unable to load accounting evidence."));
            button(__("Retry"), load, host);
        }
    }
    company = page.add_field({ fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company", change: () => void load() });
    page.set_secondary_action(__("Refresh"), load);
    const initial = frappe.route_options?.company || frappe.defaults.get_user_default("Company");
    if (initial) company.set_value(initial); else void load();
};
