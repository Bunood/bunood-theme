/* global frappe, __ */
frappe.pages["bnd-home"].on_page_show = () => window.bunood_theme?.select_home_sidebar?.();
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
