/* global frappe */
(() => {
    const api = window.bunood_theme = window.bunood_theme || {};
    // Refresh only our owned Page scripts; Frappe persists them across releases.
    try { for (const page of ["bnd-home", "bnd-report-studio"]) window.localStorage?.removeItem("_page:" + page); } catch (_) {}
    api.select_home_sidebar = () => {
        if (!frappe.boot.workspace_sidebar_item?.["bunood home"]) return;
        if (!frappe.route_options?.sidebar) {
            const options = frappe.route_options = { ...frappe.route_options, sidebar: "Bunood Home" };
            queueMicrotask(() => {
                if (frappe.route_options !== options || options.sidebar !== "Bunood Home") return;
                delete options.sidebar;
                if (!Object.keys(options).length) frappe.route_options = null;
            });
        }
        frappe.app.sidebar.setup(frappe.route_options.sidebar);
    };
})();



