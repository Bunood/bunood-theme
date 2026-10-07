/* global frappe, __ */
;(() => {
    "use strict";
    const api = window.bunood_theme = window.bunood_theme || {};
    const controllers = new WeakMap();
    let active = null;
    const layoutTypes = new Set(["Section Break", "Column Break", "Tab Break", "Fold", "Heading"]);
    const wrapperClasses = ["bnd-simple-active", "bnd-generic-simple", "bnd-composed-simple-active", "bnd-task-simple-active"];
    const spec = {
        variant: "sales-return",
        steps: ["Original invoice", "Returned items", "Credit and refund"],
        panels: [
            ["source", "Original invoice", "Review the invoice being returned and any amendment reference.", ["is_return", "return_against", "amended_from", "company", "posting_date", "posting_time", "set_posting_time"], "lead"],
            ["customer", "Customer", "Keep the customer and currency connected to the original invoice.", ["customer", "customer_name", "currency", "conversion_rate", "customer_address", "contact_person"], "lead"],
            ["items", "Returned items", "Review the quantities and warehouses in the original item controls.", ["update_stock", "set_warehouse", "items"], "sheet"],
            ["tax", "Taxes and credit", "ERPNext calculates the credit from the returned items and taxes.", ["tax_category", "taxes_and_charges", "taxes", "discount_amount", "additional_discount_percentage", "net_total", "total_taxes_and_charges", "grand_total", "rounded_total"], "aside"],
            ["settlement", "Credit and refund", "A credit note does not by itself confirm that a customer refund was paid.", ["debit_to", "is_pos", "payments", "paid_amount", "outstanding_amount", "write_off_amount", "write_off_account", "write_off_cost_center"], "amount"],
            ["details", "Details", "Review the native accounting and supporting details.", ["cost_center", "project", "remarks", "terms"], "aside"],
        ],
        // Monetary values remain their original native controls, never a second calculation.
        metrics: [],
    };
    function permitted(frm, kind) {
        try { return typeof frm?.has_perm === "function" && !!frm.has_perm(kind); }
        catch (_) { return false; }
    }
    function current(frm, doc = frm?.doc) {
        const route = frappe.get_route();
        return window.cur_frm === frm && frm?.doc === doc && frm?.doctype === "Sales Invoice" &&
            Number(doc?.is_return) === 1 && route[0] === "Form" && route[1] === frm.doctype &&
            route[2] === doc.name && !!frm.$wrapper?.[0]?.isConnected && permitted(frm, "read");
    }
    function candidate(frm) {
        return current(frm) && typeof api.simple_forms?.TaskWorkbench === "function" &&
            typeof api.document_actions?.actionState === "function" &&
            typeof api.document_actions?.submitWithoutConfirmation === "function" &&
            typeof api.claim_native === "function" && typeof api.release_native === "function";
    }
    function element(tag, classes, text) {
        const node = document.createElement(tag); node.className = classes;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    class ReturnWorkbench {
        constructor(frm) {
            this.frm = frm; this.doc = frm.doc; this.simple = true; this.busy = false;
            this.fieldClasses = new Map(); this.wrapperClasses = new Map();
            this.header = element("header", "bnd-simple-form-head");
            this.header.append(element("h2", "", __("Sales return / Credit note")));
            this.status = element("span", "bnd-simple-state"); this.header.append(this.status);
            this.status.setAttribute("role", "status");
            this.actions = element("div", "bnd-return-document-actions bnd-simple-actions");
            this.actions.setAttribute("role", "toolbar");
            this.actions.setAttribute("aria-label", __("Document actions"));
            this.simpleButton = this.button(this.header, __("Simple"), () => this.setMode(true));
            this.advancedButton = this.button(this.header, __("Advanced"), () => this.setMode(false));
            this.saveButton = this.button(this.actions, __("Save draft"), () => this.save());
            this.submitButton = this.button(this.actions, __("Submit"), () => this.submit());
            this.refundButton = this.button(this.actions, __("Customer refund"), () => this.refund());
            this.printButton = this.button(this.actions, __("Print"), () => this.print());
            this.workbench = new api.simple_forms.TaskWorkbench(frm, spec);
            this.workbench.summary.hidden = spec.metrics.length === 0;
        }
        button(parent, label, handler) {
            const node = element("button", "bnd-bill-button", label); node.type = "button";
            node.addEventListener("click", handler); parent.append(node); return node;
        }
        valid() { return current(this.frm, this.doc); }
        state() { return api.document_actions.actionState(this.frm); }
        canRefund() {
            const button = this.frm.custom_buttons?.[__("Payment")];
            return this.valid() && this.simple && !this.busy && Number(this.doc.docstatus) === 1 &&
                !this.doc.__islocal && !this.frm.is_dirty?.() &&
                frappe.model.can_create("Payment Entry") && !!button?.length &&
                !!button[0]?.isConnected && !button.prop("disabled") &&
                !button.prop("hidden") && !button.hasClass("disabled") &&
                !button.hasClass("hide") && !button.hasClass("hidden") &&
                button.attr("aria-disabled") !== "true" && button.attr("aria-hidden") !== "true" &&
                button.css("display") !== "none" && button.css("visibility") !== "hidden";
        }
        async save() {
            if (!this.valid() || !this.simple || this.busy || !this.state().showSave ||
                !permitted(this.frm, this.doc.__islocal ? "create" : "write")) return;
            this.busy = true; this.refresh();
            try { await this.frm.save("Save"); }
            finally { this.busy = false; if (this.valid()) this.refresh(); }
        }
        async submit() {
            if (!this.valid() || !this.simple || this.busy || !this.state().showSubmit ||
                !permitted(this.frm, "submit") || this.frm.save_disabled) return;
            this.busy = true; this.refresh();
            try { await api.document_actions.submitWithoutConfirmation(this.frm); }
            finally { this.busy = false; if (this.valid()) this.refresh(); }
        }
        refund() {
            if (this.canRefund()) return this.frm.custom_buttons[__("Payment")].trigger("click");
        }
        print() {
            if (this.valid() && this.simple && !this.busy && this.state().showPrint) return this.frm.print_doc();
        }
        restoreClasses() {
            for (const [node, values] of this.fieldClasses) for (const [name, present] of values) node.classList.toggle(name, present);
            this.fieldClasses.clear();
            const wrapper = this.frm.$wrapper?.[0];
            for (const [name, present] of this.wrapperClasses) wrapper?.classList.toggle(name, present);
            this.wrapperClasses.clear();
        }
        observeToolbar() {
            const toolbar = this.frm.page?.inner_toolbar?.[0];
            if (this.toolbar === toolbar) return;
            this.toolbarObserver?.disconnect(); this.toolbarObserver = null;
            this.toolbar = toolbar;
            if (!toolbar || typeof MutationObserver !== "function") return;
            this.toolbarObserver = new MutationObserver(() => {
                if (!this.valid()) { this.destroy(); return; }
                this.refreshActions();
            });
            // Native callbacks register buttons asynchronously. Observe only their
            // toolbar, never our controls or native field layout.
            this.toolbarObserver.observe(toolbar, { childList: true, subtree: true,
                attributes: true, attributeFilter: ["disabled", "hidden", "class", "style", "aria-disabled", "aria-hidden"] });
        }
        refreshActions() {
            const state = this.state();
            this.saveButton.hidden = !state.showSave; this.submitButton.hidden = !state.showSubmit || !!this.frm.save_disabled;
            this.refundButton.hidden = !this.canRefund(); this.printButton.hidden = !state.showPrint;
            for (const button of [this.saveButton, this.submitButton, this.refundButton, this.printButton]) button.disabled = this.busy;
        }
        refresh() {
            if (!this.valid()) { this.destroy(); return; }
            const layout = this.frm.$wrapper.find(".std-form-layout > .form-layout").first()?.[0];
            if (!layout?.parentNode) { this.destroy(); return; }
            layout.before(this.header, this.actions, this.workbench.root);
            // Re-evaluate native visibility before moving controls, including fields
            // whose dependencies or field-level permissions changed since refresh.
            this.workbench.restore(); this.restoreClasses();
            const selected = new Set();
            for (const [name, field] of Object.entries(this.frm.fields_dict || {})) {
                const node = field?.$wrapper?.[0];
                if (!node || layoutTypes.has(field.df?.fieldtype)) continue;
                if (Number(field.df?.hidden) || Number(field.df?.hidden_due_to_dependency)) continue;
                let status;
                try { status = field.get_status?.(); } catch (_) { continue; }
                if (status !== "Read" && status !== "Write") continue;
                selected.add(name);
                if (this.simple) {
                    if (!this.fieldClasses.has(node)) this.fieldClasses.set(node, ["bnd-simple-visible", "bnd-simple-omitted"].map(c => [c, node.classList.contains(c)]));
                    node.classList.add("bnd-simple-visible"); node.classList.remove("bnd-simple-omitted");
                }
            }
            if (!this.simple) this.restoreClasses();
            this.workbench.refresh(this.simple, selected);
            const wrapper = this.frm.$wrapper[0];
            if (this.simple) for (const name of wrapperClasses) {
                if (!this.wrapperClasses.has(name)) this.wrapperClasses.set(name, wrapper.classList.contains(name));
                wrapper.classList.add(name);
            }
            this.actions.hidden = !this.simple;
            this.simpleButton.setAttribute("aria-pressed", String(this.simple));
            this.advancedButton.setAttribute("aria-pressed", String(!this.simple));
            const status = Number(this.doc.docstatus);
            this.status.textContent = __(status === 2 ? "Cancelled" : status === 0 ? "Draft" : String(this.doc.status || "Submitted"));
            this.observeToolbar(); this.refreshActions();
            api[this.simple ? "claim_native" : "release_native"]("simpleform");
        }
        setMode(simple) { if (!this.valid()) return; this.simple = !!simple; this.refresh(); }
        destroy() {
            this.toolbarObserver?.disconnect(); this.toolbarObserver = null; this.toolbar = null;
            this.workbench.restore(); this.restoreClasses();
            this.header.remove(); this.actions.remove(); this.workbench.root.remove();
            if (window.cur_frm === this.frm) api.release_native("simpleform");
            else api.claim_native("simpleform"); // Re-evaluate a newer form; never release its ownership.
            controllers.delete(this.frm); if (active === this) active = null;
        }
    }
    function mount(frm) {
        if (!candidate(frm)) { controllers.get(frm)?.destroy(); return false; }
        let controller = controllers.get(frm);
        if (controller && controller.doc !== frm.doc) { controller.destroy(); controller = null; }
        if (!controller) { controller = new ReturnWorkbench(frm); controllers.set(frm, controller); }
        if (active && active !== controller) active.destroy();
        active = controller; controller.refresh(); return controllers.get(frm) === controller;
    }
    api.sales_return = { mount, candidate, controller: frm => controllers.get(frm) };
    frappe.ui.form.on("Sales Invoice", { refresh: mount });
    frappe.router?.on("change", () => {
        if (active && !active.valid()) active.destroy();
        if (candidate(window.cur_frm)) mount(window.cur_frm);
    });
})();
