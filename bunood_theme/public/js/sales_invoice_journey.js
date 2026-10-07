/* global frappe, __, $ */
// Lazy Sales Invoice actions. Native controllers retain all document mutations.
;(() => {
    "use strict";
    let active;
    function current(frm, simple = true) {
        const route = frappe.get_route();
        const wrapper = frm?.$wrapper?.[0];
        return !!(frm?.doctype === "Sales Invoice" && window.cur_frm === frm &&
            route[0] === "Form" && route[1] === frm.doctype && route[2] === frm.doc?.name &&
            wrapper?.isConnected && (!simple || wrapper.classList.contains("bnd-bill-simple-active") ||
                frm.doc.is_return && wrapper.classList.contains("bnd-simple-active")));
    }
    function nativeAction(frm, kind, state) {
        if (!current(frm) || !frm.doc.name || frm.doc.__islocal || frm.is_dirty() ||
            !frm.has_perm("read") || !frappe.model.can_create("Sales Invoice")) return;
        let button;
        if (kind === "return" && Number(frm.doc.docstatus) === 1 && !frm.doc.is_return) {
            button = frm.custom_buttons?.[__("Return / Credit Note")];
        } else if (kind === "amend" && Number(frm.doc.docstatus) === 2 && frm.has_perm("amend") &&
            state?.name === frm.doc.name && state.amended === false) {
            button = frm.page?.btn_primary;
            const label = __("Amend"), nativeLabel = button?.attr("data-label");
            // Native Page.set_action stores raw labels; translated Desk
            // controls can expose their URI-encoded attribute representation.
            if (nativeLabel !== label && nativeLabel !== encodeURIComponent(label)) return;
        }
        const node = button?.[0];
        if (node?.isConnected && !node.disabled && !button.prop("disabled") &&
            !node.hidden && !node.classList.contains("hide") && !node.classList.contains("hidden") && !node.classList.contains("disabled") &&
            button.attr("aria-disabled") !== "true" && button.attr("aria-hidden") !== "true" &&
            // Owned Simple CSS conceals the native primary action. Its inline
            // state/classes/ARIA remain authoritative; computed CSS is not.
            node.style.display !== "none" && node.style.visibility !== "hidden" &&
            (kind === "amend" || button.css("display") !== "none" && button.css("visibility") !== "hidden")) return button;
    }
    function invoke(frm, kind, state) {
        nativeAction(frm, kind, state)?.trigger("click");
    }
    function stop() {
        if (!active) return;
        active.observer.disconnect();
        for (const button of Object.values(active.buttons)) button.remove();
        active = null;
    }
    function mount(frm) {
        stop();
        if (frm?.doctype !== "Sales Invoice" || window.cur_frm !== frm) return;
        const wrapper = frm.$wrapper?.[0];
        if (!wrapper?.isConnected) return;
        const state = {frm, buttons:{}, name:frm.doc.name, amended:null, key:null};
        active = state;
        function render() {
            if (active !== state) return;
            const route = frappe.get_route();
            if (window.cur_frm !== frm || route[0] !== "Form" || route[1] !== frm.doctype || route[2] !== frm.doc.name || !wrapper.isConnected) { stop(); return; }
            const key = `${frm.doc.name}:${frm.doc.docstatus}:${frm.is_dirty()}`;
            if (state.key !== key) {
                state.key = key; state.name = frm.doc.name; state.amended = null;
                if (Number(frm.doc.docstatus) === 2 && !frm.is_dirty() && !frm.doc.__islocal && frm.has_perm("read") && frm.has_perm("amend") && frappe.model.can_create("Sales Invoice")) {
                    frappe.xcall("frappe.client.is_document_amended", {doctype:frm.doctype,docname:frm.doc.name}, "GET")
                        .then(value => {
                            if (active !== state || state.key !== key || !current(frm,false)) return;
                            // xcall resolves r.message: a successful None result
                            // can omit that key and resolve undefined.
                            state.amended = value ? true : value == null || value === false || value === "" ? false : null;
                            render();
                        }).catch(() => { /* Unavailable remains hidden; refresh may try again. */ });
                }
            }
            const group = wrapper.querySelector(frm.doc.is_return ? ".bnd-return-document-actions" : ".bnd-bill .bnd-bill-action-group-document");
            if (state.group !== group) {
                for (const button of Object.values(state.buttons)) button.remove();
                state.buttons = {}; state.group = group;
                if (group) for (const [kind,label] of [["return",__("Return / Credit Note")],["amend",__("Amend")]]) {
                    const button = document.createElement("button");
                    button.type = "button"; button.className = "bnd-bill-button";
                    button.textContent = label; button.hidden = true;
                    button.addEventListener("click", () => {
                        if (active === state && button.isConnected && state.group === group && wrapper.contains(button)) invoke(frm,kind,state);
                    });
                    group.append(button); state.buttons[kind] = button;
                }
            }
            for (const [kind,button] of Object.entries(state.buttons)) {
                const hidden = !nativeAction(frm,kind,state);
                if (button.hidden !== hidden) button.hidden = hidden;
            }
        }
        state.observer = new MutationObserver(render);
        state.observer.observe(frm.page?.wrapper?.[0] || wrapper, {subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","disabled","data-label","style","aria-disabled","aria-hidden"]});
        render();
    }
    window.bunood_theme = window.bunood_theme || {};
    window.bunood_theme.sales_invoice_journey = {mount,stop,nativeAction,invoke};
    $(document).on("form-refresh.bnd-invoice-journey", (_event,frm) => mount(frm));
    frappe.router.on("change", () => { stop(); setTimeout(() => mount(window.cur_frm),0); });
    setTimeout(() => mount(window.cur_frm),0);
})();
