/* global frappe, __ */
frappe.pages["bnd-home"].on_page_show = function () {
    // A shared module can contain several native sidebars. The Page chooses
    // its own through Frappe's API, rather than inheriting the previous module.
    if (frappe.boot.workspace_sidebar_item?.["bunood home"]) frappe.app.sidebar.setup("Bunood Home");
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
