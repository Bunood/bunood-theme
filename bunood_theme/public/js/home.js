/* global frappe, __ */
// The team's role navigator and daily-work layout, rendered in a native Page.
// The Page owns this DOM; existing workspaces, forms and sidebar links stay native.
(() => {
    "use strict";
    const api = window.bunood_theme = window.bunood_theme || {};
    const PRIORITY = {
        sales: ["Selling", "Bunood Selling", "CRM"], purchasing: ["Buying", "Bunood Buying", "Stock"],
        warehouse: ["Stock", "Buying", "Manufacturing"], accounting: ["Invoicing", "Financial Reports", "Reports"],
        finance: ["Invoicing", "Financial Reports", "Reports"], hr: ["HR", "Payroll"],
        engineering: ["Engineering Office", "Projects"], cashier: ["Selling", "Invoicing"], erp: [],
    };
    function profile(roles) {
        if (roles.includes("System Manager")) return "erp";
        if (roles.some(role => ["Engineering Office Manager", "Engineering Office User"].includes(role))) return "engineering";
        const cashier = roles.some(role => ["Bunood Cashier", "Cashier", "POS User"].includes(role));
        if (cashier && roles.includes("Bunood Owner")) return "erp";
        if (cashier) return "cashier";
        if (roles.includes("Accounts Manager") && !roles.some(role => ["Sales User", "Purchase User", "Stock User"].includes(role))) return "finance";
        const jobs = [["sales", "Sales User"], ["purchasing", "Purchase User"], ["warehouse", "Stock User"], ["accounting", "Accounts User"]].filter(([, role]) => roles.includes(role));
        if (jobs.length > 1) return "erp";
        if (jobs.length) return jobs[0][0];
        if (roles.includes("Accounts Manager")) return "finance";
        if (roles.some(role => ["HR User", "HR Manager", "Payroll User", "Payroll Manager"].includes(role))) return "hr";
        return "erp";
    }
    function navigation(rows, roles) {
        const order = PRIORITY[profile(roles)];
        const rank = row => order.includes(row.name) ? order.indexOf(row.name) : order.length;
        return rows.filter(row => row && typeof row.name === "string").slice().sort((a, b) => rank(a) - rank(b));
    }
    function workspaceHref(name, isPublic = true) { return `/desk/${isPublic === false || isPublic === 0 ? "private/" : ""}${encodeURIComponent(name.toLowerCase().replace(/ /g, "-"))}`; }
    function displayValue(value, currency, format = {}) {
        if (typeof value !== "number" || !Number.isFinite(value)) return __("Unavailable");
        const number = new Intl.NumberFormat(document.documentElement?.lang || "en", {maximumFractionDigits:currency ? 2 : 0}).format(Number(value));
        if (!currency) return number;
        const symbol = format.currency === currency && format.currency_symbol ? format.currency_symbol : currency;
        if (currency === "SAR" && /^ar(?:[-_]|$)/i.test(document.documentElement?.lang || "")) return `\u2067\u2066${number}\u2069 ${symbol}\u2069`;
        return format.currency === currency && format.currency_symbol && !format.currency_symbol_on_right ? `${symbol} ${number}` : `${number} ${symbol}`;
    }
    // All amounts and filters come from the permission-scoped native reader.
    // No client-side totals across companies, periods or currencies.
    function dashboard(parent, initial, add) {
        const controls = add("section", "bnd-home-scope", undefined, parent);
        controls.setAttribute("aria-label", __("Dashboard filters"));
        const views = add("div", "bnd-home-views", undefined, controls);
        const filters = add("div", "bnd-home-filter-grid", undefined, controls);
        const explanation = add("p", "bnd-home-note", undefined, controls);
        const content = add("div", "bnd-home-dashboard-content", undefined, parent);
        const state = {};
        let generation = 0;
        const periods = [["today", __("Today")], ["last_7_days", __("Last 7 days")], ["month_to_date", __("Month to date")], ["last_30_days", __("Last 30 days")], ["all_time", __("All time")]];
        const viewLabels = {overview:__("Overview"), accountant:__("Accounting desk"), sales:__("Sales"), collections:__("Collections"), cashier:__("Cashier desk")};
        const button = (label, cls, target, run) => {
            const node = add("button", cls, label, target); node.type = "button";
            if (run) node.addEventListener("click", run);
            return node;
        };
        const section = (title, cls = "") => {
            const node = add("section", `bnd-home-panel ${cls}`, undefined, content);
            add("h2", "bnd-home-panel-title", title, node); return node;
        };
        const openList = (doctype, values) => frappe.set_route("List", doctype, values);
        const card = (target, label, value, note, run, available = true) => {
            const node = button(undefined, "bnd-home-metric", target, available ? run : null);
            node.disabled = !available || !run;
            add("span", "bnd-home-queue-label", label, node);
            add("bdi", "bnd-home-queue-value", available ? value : __("Unavailable"), node);
            if (note) add("span", "bnd-home-note", note, node);
            return node;
        };
        const records = (target, rows, fallbackCurrency, format = {}) => {
            for (const row of rows || []) {
                const node = button(undefined, "bnd-home-record", target, () => frappe.set_route("Form", row.doctype || "Sales Invoice", row.name));
                add("bdi", "", row.party || row.customer_name || row.name, node);
                add("span", "bnd-home-note", row.name, node);
                add("bdi", "bnd-home-note", row.date || row.posting_date || row.due_date || "", node);
                add("bdi", "", displayValue(row.amount ?? row.outstanding_amount, row.currency || fallbackCurrency, format), node);
            }
        };
        function control(label, options, selected, key) {
            const field = add("label", "bnd-home-scope-field", label, filters);
            const select = add("select", "bnd-home-select", undefined, field);
            select.dataset.bndHomeScope = key;
            for (const [value, text] of options) add("option", "", text, select).value = value;
            select.value = selected || "";
            select.addEventListener("change", () => load({[key]:select.value}));
        }
        function observations(data) {
            const states = {complete:__("Complete"),next:__("Next step"),waiting:__("Waiting"),blocked:__("Unavailable"),
                observed:__("Observed"),missing:__("Missing"),review:__("Needs review"),unavailable:__("Unavailable"),"not-assessed":__("Not assessed")};
            const startNames = {company:__("Company details"),customer:__("First customer"),item:__("First product or service"),invoice:__("First submitted invoice"),payment:__("First recorded payment")};
            const checkNames = {company:__("Company identity and fiscal setup"),accounting:__("Accounts and dimensions"),tax_zatca:__("VAT, ZATCA and legal output"),stock:__("Warehouse, stock and valuation"),commercial:__("Items, prices and commercial policy"),parties:__("Customers, suppliers and terms"),payments:__("Cash, payments and POS"),access:__("Users, roles and approvals"),output:__("Print, numbering and language"),operations:__("Privacy, backup and support"),integrations:__("Integrations and credentials"),first_transaction:__("First transaction and handoff")};
            for (const [evidence, title, rows, labels] of [
                [data.start_readiness,__("Get ready to sell"),data.start_readiness?.steps,startNames],
                [data.launch_readiness,__("Configuration observations"),data.launch_readiness?.checks,checkNames],
            ]) {
                if (!evidence || evidence.state === "first-use-complete") continue;
                const panel = add("details", "bnd-home-panel bnd-home-observations", undefined, content);
                add("summary", "bnd-home-panel-title", title, panel);
                add("p", "bnd-home-note", __("These observations do not approve launch, accounting or compliance."), panel);
                for (const row of rows || []) {
                    const item = add("div", "bnd-home-record", undefined, panel);
                    add("span", "", labels[row.key] || row.key, item);
                    add("strong", "", states[row.state] || __("Unavailable"), item);
                    if (Array.isArray(row.route) && row.route.length && !["blocked","unavailable","waiting","not-assessed"].includes(row.state)) button(__("Open"), "bnd-home-action", item, () => frappe.set_route(...row.route));
                }
            }
        }
        function render(data) {
            const scope = data.scope || {};
            Object.assign(state, {company:scope.company, period:scope.period, sales_person:scope.sales_person || "", view:scope.view});
            views.replaceChildren(); filters.replaceChildren(); content.replaceChildren();
            parent.dataset.bndHomeView = scope.view || "overview";
            for (const view of scope.views || []) {
                const item = button(viewLabels[view] || view, "bnd-home-view", views, () => load({view}));
                item.setAttribute("aria-pressed", String(view === scope.view));
            }
            if (scope.default_view && scope.view !== scope.default_view) button(__("Return to role default"), "bnd-home-action", views, () => load({view:scope.default_view,period:"month_to_date",sales_person:""}));
            const save = button(__("Save dashboard preferences"), "bnd-home-action", views, async () => {
                save.disabled = true;
                const snapshot = {...state};
                try {
                    await frappe.call({method:"bunood_theme.team_home.save_home_preferences",type:"POST",args:snapshot});
                    if (save.isConnected) save.textContent = __("Saved");
                } catch (error) {
                    if (save.isConnected) save.textContent = __("Unable to save. Try again.");
                } finally { if (save.isConnected) save.disabled = false; }
            });
            control(__("Company"), [["__all__", __("All companies")], ...(scope.companies || []).map(row => [typeof row === "string" ? row : row.name, typeof row === "string" ? row : row.name])], scope.company, "company");
            control(__("Period"), periods, scope.period, "period");
            if ((scope.sales_people || []).length && !["accountant", "cashier"].includes(scope.view) && scope.company !== "__all__") {
                control(__("Sales person"), [["", __("All salespeople")], ...scope.sales_people.map(row => [typeof row === "string" ? row : row.name, typeof row === "string" ? row : row.name])], scope.sales_person, "sales_person");
            }
            explanation.textContent = scope.company === "__all__" ? __("Each company is shown in its own currency. Open a company for its full dashboard.")
                : scope.view === "accountant" ? __("Balances are current and company-wide; sales filters do not change these figures.")
                : scope.view === "cashier" ? __("Today's POS overview stays current. The period changes the recent receipt list, not your shift.")
                : __("Sales figures use the selected period. Collections and tasks show current balances.");
            if (data.data_complete === false || (data.query_errors || []).length) add("p", "bnd-home-notice", __("Some figures could not be loaded. Unavailable values are shown separately from zero."), content).setAttribute("role", "status");
            if (scope.company === "__all__") {
                const grid = section(__("Company overview"), "bnd-home-company-overview");
                for (const company of data.company_overview || []) {
                    const node = button(undefined, "bnd-home-company-card", grid, () => load({company:company.company}));
                    add("h3", "bnd-home-lane-title", company.company, node);
                    for (const [label, value] of [[__("Invoiced value"), displayValue(company.sales_amount, company.currency, company)], [__("Sales invoices"), displayValue(company.sales_count)], [__("Overdue invoices"), displayValue(company.overdue_count)], [__("Draft journals"), displayValue(company.journal_drafts)]]) {
                        const row = add("span", "bnd-home-company-stat", undefined, node); add("span", "", label, row); add("bdi", "", value, row);
                    }
                }
                if (!(data.company_overview || []).length) add("p", "bnd-home-note", data.company_overview === null ? __("Unavailable") : __("No companies are available for this role"), grid);
                return;
            }
            if (!scope.company) { add("p", "bnd-home-note", __("No companies are available for this role"), content); observations(data); return; }
            const currency = data.currency;
            const money = value => displayValue(value, currency, data);
            if (scope.view === "cashier") {
                const cashier = data.cashier || {};
                const panel = section(__("Today's POS position"));
                const grid = add("div", "bnd-home-summary", undefined, panel);
                card(grid, __("Net POS sales in selected period"), money(cashier.sales_amount), scope.period_label, null, cashier.sales_amount != null);
                card(grid, __("Today's POS sales"), `${displayValue(cashier.today_count)} · ${money(cashier.today_amount)}`, __("Today"), null, cashier.today_count != null);
                card(grid, __("Held sales"), displayValue(cashier.held_count), "", initial.pages.includes("bnd-pos") ? () => frappe.set_route("bnd-pos", "held") : null, cashier.held_count != null);
                card(grid, __("Returns"), displayValue(cashier.returns_today), __("Today"), null, cashier.returns_today != null);
                const shift = cashier.shift || {};
                const shiftText = shift.state === "open" ? __("Shift open today") : shift.state === "stale" ? __("Previous shift needs closing") : shift.state === "needs_opening" ? __("No open shift") : __("Unavailable");
                card(grid, __("Current shift"), shiftText, cashier.profile || "", shift.name ? () => frappe.set_route("Form", "POS Opening Entry", shift.name) : null, shift.state !== "unavailable");
                if (initial.pages.includes("bnd-pos")) button(__("Open POS"), "bnd-home-action", panel, () => frappe.set_route("bnd-pos"));
                for (const source of cashier.sources || []) {
                    card(panel, __(source.doctype), displayValue(source.count), money(source.amount), () => openList(source.doctype, source.filters), source.count != null);
                    const todayFilters = {...source.filters,posting_date:cashier.as_of,is_return:0};
                    button(__("Today's POS sales"), "bnd-home-action", panel, () => openList(source.doctype, todayFilters));
                    button(__("Returns"), "bnd-home-action", panel, () => openList(source.doctype, {...todayFilters,is_return:1}));
                }
                for (const source of cashier.held_sources || []) card(panel, __("Held sales"), displayValue(source.count), __(source.doctype), () => openList(source.doctype, source.filters), source.count != null);
                if (cashier.available === false) add("p", "bnd-home-notice", cashier.profile_state === "unassigned" ? __("No POS profile is assigned to you for this company. Ask an administrator to assign one.") : __("Unavailable"), panel);
                const recent = section(__("Recent POS sales")); records(recent, cashier.recent, currency, data);
                if (!(cashier.recent || []).length) add("p", "bnd-home-note", cashier.recent === null ? __("Unavailable") : __("No POS sales in this period"), recent);
                return;
            }
            if (scope.view === "accountant") {
                const panel = section(__("Current balances"));
                const grid = add("div", "bnd-home-summary", undefined, panel);
                for (const [key, label] of [["cash_balance", __("Cash and bank")], ["receivables", __("Receivables")], ["payables", __("Payables")], ["overdue", __("Overdue receivables")]]) {
                    card(grid, label, money(data.metrics?.[key]), __("As of today"), null, data.accounting?.available?.[key] !== false && data.metrics?.[key] != null);
                }
                if (Number(data.metrics?.payables) < 0) add("p", "bnd-home-note", __("A negative payable total is a net debit. Review supplier balances before acting."), panel);
                const desk = data.accountant_desk;
                const work = section(__("Accounting work to review"));
                if (!desk || desk.available === false || desk.state === "unavailable") add("p", "bnd-home-note", __("Unavailable"), work);
                else {
                    for (const group of desk.queue_groups || desk.groups || []) card(work, __(group.label || group.doctype || group.key), displayValue(group.count), "", group.doctype ? () => openList(group.doctype, group.filters || {}) : null, group.count != null);
                    records(work, desk.queue, currency, data);
                    const bank = section(__("Bank reconciliation evidence"));
                    if (!desk.bank?.available) add("p", "bnd-home-note", __("Unavailable"), bank);
                    else for (const account of desk.bank.accounts || []) card(bank, account.label, displayValue(account.open_count), __("Unallocated bank transactions"), () => openList("Bank Transaction", {company:scope.company,bank_account:account.name,unallocated_amount:["!=",0]}), account.open_count != null);
                    const close = section(__("Period close evidence"));
                    const evidence = desk.close;
                    const states = {"attention-needed":__("Needs review"), "not-evaluated":__("Not evaluated"), "protection-present":__("Protection present"), "not-protected":__("Not protected")};
                    const phases = {"source-capture":__("Source documents"), reconciliation:__("Reconciliation"), adjustments:__("Adjustments"), statements:__("Statements"), protection:__("Protection")};
                    if (!evidence || evidence.state === "unavailable") add("p", "bnd-home-note", __("Unavailable"), close);
                    else for (const phase of evidence.phases || []) card(close, phases[phase.id] || phase.id, states[phase.state] || __("Unavailable"), "", initial.pages.includes("bnd-finance-close") ? () => frappe.set_route("bnd-finance-close") : null);
                    if (initial.pages.includes("bnd-accounting-home")) button(__("Accounting desk"), "bnd-home-action", work, () => frappe.set_route("bnd-accounting-home"));
                    if (initial.pages.includes("bnd-banking")) button(__("Reconcile bank"), "bnd-home-action", work, () => frappe.set_route("bnd-banking"));
                    if (initial.pages.includes("bnd-finance-close")) button(__("Finance and close"), "bnd-home-action", work, () => frappe.set_route("bnd-finance-close"));
                }
            }
            const summary = section(__("Financial summary"));
            const metricGrid = add("div", "bnd-home-summary", undefined, summary);
            for (const metric of data.kpis || []) card(metricGrid, __(metric.label), displayValue(metric.value, metric.value_type === "currency" ? currency : undefined, data), __(metric.period_label), () => openList(metric.doctype, metric.filters), metric.available !== false && metric.value != null);
            const attention = section(__("Needs your attention"));
            const priorities = {sales:["sales_drafts","quotation_drafts","open_quotations","overdue"],collections:["overdue","due_soon","payment_drafts"],accountant:["journal_drafts","payment_drafts","purchase_drafts","overdue","payables_due","zatca_exceptions"]}[scope.view] || [];
            const rank = row => priorities.includes(row.key) ? priorities.indexOf(row.key) : priorities.length;
            for (const item of [...(data.attention || [])].sort((a,b)=>rank(a)-rank(b))) card(attention, __(item.label || item.doctype), displayValue(item.count), item.amount != null ? money(item.amount) : "", item.route ? () => frappe.set_route(...item.route) : item.doctype ? () => openList(item.doctype, item.filters) : null, item.available !== false && item.count != null);
            if (!(data.attention || []).length) add("p", "bnd-home-note", data.attention === null ? __("Unavailable") : __("No pending work in the available queues"), attention);
            const processes = [
                [__("Quote to cash"), ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"]],
                [__("Procure to pay"), ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"]],
                [__("Stock control"), ["Item", "Warehouse", "Stock Entry", "Stock Reconciliation"]],
                [__("Close and VAT"), ["Journal Entry", "Payment Reconciliation", "Period Closing Voucher"]],
            ];
            const processPanels = [];
            for (const [title, documents] of processes) {
                const permitted = documents.filter(name => (initial.read || []).includes(name));
                if (!permitted.length) continue;
                const process = section(title, "bnd-home-native-process");
                processPanels.push(process);
                const steps = add("ol", "bnd-home-process-steps", undefined, process);
                for (const name of permitted) {
                    const step = add("li", "", undefined, steps);
                    const meta = initial.document_routes?.[name] || {};
                    button(__(name), "bnd-home-action", step, () => meta.single ? frappe.set_route("Form", name) : openList(name, meta.company ? {company:scope.company} : {}));
                }
            }
            let collectionPanel;
            if ((scope.views || []).includes("collections")) {
                const panel = section(__("Collections"));
                collectionPanel = panel;
                for (const [key, title] of [["overdue", __("Overdue receivables")], ["due_soon", __("Due soon")]]) {
                    const group = data.collections?.[key];
                    const box = add("div", "bnd-home-collection", undefined, panel);
                    card(box, title, displayValue(group?.count), money(group?.amount), group?.filters ? () => openList("Sales Invoice", group.filters) : null, group?.available !== false && group?.count != null);
                    records(box, group?.rows, currency, data);
                }
            }
            const reports = section(__("Sales trend"));
            add("p", "bnd-home-note", `${scope.period_label || ""} · ${currency || ""}`, reports);
            const trend = add("div", "bnd-home-trend", undefined, reports);
            const trendRows = data.trend || [];
            if (trendRows.length && typeof frappe.Chart === "function") {
                const chart = add("div", "bnd-home-chart", undefined, reports);
                chart.setAttribute("aria-label", __("Sales trend"));
                requestAnimationFrame(() => {
                    if (!chart.isConnected || chart.clientWidth <= 32) return;
                    new frappe.Chart(chart, {bndAriaLabel:__("Sales trend"),type:"bar",height:260,colors:[],
                        data:{labels:trendRows.map(row=>row.label || row.from_date),datasets:[{name:__("Sales"),values:trendRows.map(row=>row.value)}]},
                        tooltipOptions:{formatTooltipY:value=>money(value)}});
                    chart.addEventListener("data-select", event => {
                        const row = trendRows[Number(event.index ?? event.detail?.index)];
                        if (row) openList(row.doctype || "Sales Invoice", row.filters);
                    });
                });
            }
            const max = Math.max(1, ...trendRows.map(row => Math.abs(Number(row.value) || 0)));
            for (const row of trendRows) {
                const node = button(undefined, "bnd-home-trend-row", trend, () => openList(row.doctype || "Sales Invoice", row.filters));
                add("span", "", row.label || row.from_date, node);
                const bar = add("span", "bnd-home-trend-bar", undefined, node); bar.setAttribute("aria-hidden", "true"); bar.style.setProperty("--bnd-home-share", `${Math.abs(Number(row.value) || 0) / max * 100}%`);
                add("bdi", "", money(row.value), node);
            }
            if (!trendRows.length) add("p", "bnd-home-note", data.trend === null ? __("Unavailable") : __("No invoice data yet"), trend);
            const status = section(__("Invoice status"));
            for (const [key, label] of [["paid", __("Paid")], ["open", __("Open")], ["overdue", __("Overdue")]]) card(status, label, displayValue(data.invoice_status?.[key]), __("Current sales invoices"), data.invoice_status_filters?.[key] ? () => openList("Sales Invoice", data.invoice_status_filters[key]) : null, data.invoice_status?.[key] != null);
            const recent = section(__("Recent activity")); records(recent, data.recent, currency, data);
            if (!(data.recent || []).length) add("p", "bnd-home-note", data.recent === null ? __("Unavailable") : __("No recent activity"), recent);
            const reportsPanel = section(__("Reports"));
            const runnable = Array.isArray(frappe.boot?.bnd_navigation_reports) ? frappe.boot.bnd_navigation_reports : Object.keys(frappe.boot?.allowed_reports || {});
            for (const report of ["General Ledger", "Accounts Receivable", "Accounts Payable", "Trial Balance", "VAT Summary"]) {
                if (!runnable.includes(report)) continue;
                button(__(report), "bnd-home-action", reportsPanel, () => frappe.set_route(...(api.studio_report_route?.(report) || ["query-report", report])));
            }
            const setup = section(__("Setup and administration"));
            for (const name of ["Company", "Accounts Settings"]) {
                const meta = initial.document_routes?.[name];
                if (meta) button(__(name), "bnd-home-action", setup, () => frappe.set_route(meta.single ? "Form" : "List", name));
            }
            if (data.admin_health) {
                for (const [key, label] of [["failed_jobs_today", __("Failed jobs today")], ["error_logs_today", __("Error logs today")]]) card(setup, label, displayValue(data.admin_health[key]), __("Today"), null, data.admin_health[key] != null);
            }
            observations(data);
            // Move only this Page's own sections. Visual and keyboard order
            // agree; no permitted content is removed by role presentation.
            if (scope.view === "collections" && collectionPanel) content.prepend(collectionPanel, attention, summary);
            else if (scope.view === "sales") content.prepend(attention, summary, ...processPanels);
            else if (scope.view === "overview") content.prepend(attention, ...processPanels, summary);
        }
        async function load(change = {}) {
            const id = ++generation;
            content.setAttribute("aria-busy", "true");
            content.replaceChildren(); add("p", "bnd-home-note", __("Loading…"), content);
            try {
                const {message:data} = await frappe.call({method:"bunood_theme.team_home.get_home_dashboard", type:"GET", args:{...state,...change}});
                if (generation !== id || !parent.isConnected) return;
                render(data);
            } catch (error) {
                if (generation !== id || !parent.isConnected) return;
                content.replaceChildren(); add("p", "bnd-home-notice", __("Could not load dashboard data"), content);
                button(__("Retry"), "bnd-home-action", content, () => load(change));
            } finally { if (generation === id) content.removeAttribute("aria-busy"); }
        }
        load();
    }
    function mount(host, initial) {
        const root = document.createElement("section"); root.className = "bnd-home-dashboard";
        root.dataset.bndHomeProfile = profile(initial.roles || []);
        host.replaceChildren(root);
        const add = (tag, cls, text, parent = root) => {
            const node = document.createElement(tag); node.className = cls;
            if (text !== undefined) node.textContent = text;
            parent.appendChild(node); return node;
        };
        const link = (label, route, cls, parent, options) => {
            const node = add("a", cls, label, parent);
            node.href = route;
            if (options) node.addEventListener("click", event => {
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); frappe.route_options = options; frappe.set_route(route.replace(/^\/desk\//, ""));
            });
            return node;
        };
        const header = add("header", "bnd-home-command");
        add("span", "bnd-home-eyebrow", __("Bunood Home"), header);
        const hour = new Date().getHours();
        add("h1", "bnd-home-title", hour < 12 ? __("Good morning") : hour < 18 ? __("Good afternoon") : __("Good evening"), header);
        add("p", "bnd-home-subtitle", __("Your business at a glance"), header);
        add("time", "bnd-home-date", new Intl.DateTimeFormat(document.documentElement.lang || "ar", {weekday:"long", day:"numeric", month:"long"}).format(new Date()), header);
        const body = add("div", "bnd-home-layout");
        const nav = add("nav", "bnd-home-navigation", undefined, body); nav.setAttribute("aria-label", __("Workspaces"));
        const rows = navigation(initial.workspaces || [], initial.roles || []);
        const used = new Set();
        for (const [label, names] of [...(initial.groups || []), ["Other workspaces", rows.map(row => row.name)]]) {
            const members = rows.filter(row => names.includes(row.name) && !used.has(row.name));
            if (!members.length) continue;
            const section = add("section", "bnd-home-nav-group", undefined, nav);
            add("h2", "bnd-home-nav-title", __(label), section);
            for (const row of members) {
                used.add(row.name);
                const a = link(__(row.title || row.label || row.name), workspaceHref(row.name, row.public), "bnd-home-nav-link", section);
                a.addEventListener("click", event => {
                    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    event.preventDefault(); frappe.set_route("Workspaces", row.name);
                });
            }
        }
        const main = add("div", "bnd-home-work", undefined, body);
        if ((initial.domains || []).length) {
            const domain = add("section", "bnd-home-panel", undefined, main);
            add("h2", "bnd-home-panel-title", __("Your operating workspaces"), domain);
            const grid = add("div", "bnd-home-process", undefined, domain);
            for (const item of initial.domains) {
                const node = link(item.label, item.route, "bnd-home-lane", grid);
                add("span", "bnd-home-note", __("Open the live dashboard and its operational records"), node);
            }
        }
        const actions = add("section", "bnd-home-actions", undefined, main);
        add("h2", "bnd-home-panel-title", __("Frequent actions"), actions);
        const actionGrid = add("div", "bnd-home-action-grid", undefined, actions);
        for (const name of initial.create || []) link(__(name), `/desk/${name.toLowerCase().replace(/ /g, "-")}/new`, "bnd-home-action", actionGrid);
        if (!(initial.create || []).length) add("p", "bnd-home-note", __("No create actions are available for your permissions."), actions);
        dashboard(main, initial, add);
        const desks = add("section", "bnd-home-panel", undefined, main);
        add("h2", "bnd-home-panel-title", __("Continue your work"), desks);
        const deskGrid = add("div", "bnd-home-process", undefined, desks);
        const pages = [
            ["bnd-selling", __("Sales desk"), __("Follow offers, orders, deliveries, invoices and collections.")],
            ["bnd-stock", __("Stock"), __("Stock Balance")],
            ["bnd-accounting-home", __("Accounting desk"), __("Review accounting drafts and bank evidence.")],
            ["bnd-journal-workbench", __("Journal workbench"), __("Prepare and review native journal entries with their supporting details.")],
            ["bnd-report-studio", __("Report Studio"), __("Browse sales, purchasing and accounting reports in one responsive catalogue.")],
            ["real-estate-operations", __("Real estate operations"), __("Portfolio, leases, billing and collections in one place")],
            ["bnd-finance-close", __("Finance and close"), __("Review period readiness, exceptions and close evidence.")],
            ["bnd-banking", __("Bank Reconciliation"), __("Match bank activity to native transactions and investigate differences.")],
            ["bnd-asset-workbench", __("Fixed asset workbench"), __("Review assets, depreciation, repairs and lifecycle drafts by company and period.")],
            ["bnd-pos", __("Bunood POS"), __("Open point of sale")],
            ["bnd-pos-register", __("POS register"), __("Review submitted POS receipts and returns.")],
            ["bnd-quick-sale", __("Quick Sale"), __("Prepare a native sales invoice.")],
            ["bnd-inbox", __("Inbox"), __("Review notifications and assigned work.")],
            ["bnd-zatca", __("ZATCA workspace"), __("Review Sandbox setup and native invoice evidence by company.")],
        ];
        for (const [page, title, description] of pages) {
            if (!(initial.pages || []).includes(page)) continue;
            const card = link("", `/desk/${page}`, "bnd-home-lane", deskGrid);
            add("h3", "bnd-home-lane-title", title, card); add("p", "bnd-home-note", description, card);
            add("span", "bnd-home-lane-next", __("Open"), card);
        }
    }
    api.home = { profile, navigation, workspaceHref, displayValue, mount };
})();
