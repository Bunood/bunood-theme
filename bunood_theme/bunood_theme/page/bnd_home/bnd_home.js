/* global frappe, __ */
frappe.pages["bnd-home"].on_page_show = function () {
    if (!frappe.boot.workspace_sidebar_item?.["bunood home"]) return;
    // The native root route has no Page entity for sidebar resolution. Its
    // router change follows a preloaded Page's show event and consumes options.
    if (!frappe.route_options?.sidebar) {
        const options = frappe.route_options = { ...frappe.route_options, sidebar: "Bunood Home" };
        queueMicrotask(() => {
            // An asynchronously loaded Page may show after that router event.
            // Never carry our unconsumed association into a different route.
            if (frappe.route_options !== options || options.sidebar !== "Bunood Home") return;
            delete options.sidebar;
            if (!Object.keys(options).length) frappe.route_options = null;
        });
    }
    frappe.app.sidebar.setup(frappe.route_options.sidebar);
};
frappe.pages["bnd-home"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bunood Home"), single_column: true });
    const host = document.createElement("div");
    page.main[0].appendChild(host);
    const load = async () => {
        host.textContent = __("Loading…");
        try {
            const { message } = await frappe.call({ method: "bunood_theme.home.read", type: "GET" });
            await frappe.require([message.css, message.js]);
            window.bunood_theme.home.mount(host, message);
        } catch (error) {
            host.textContent = __("Unable to load Home. Try again.");
        }
    };
    page.set_secondary_action(__("Refresh"), load);
    void load();
};
