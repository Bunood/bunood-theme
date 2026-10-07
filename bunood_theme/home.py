"""Theme-owned Home: native permissions and read-only work queues.

This is presentation over native documents, not a tenant bootstrap or a ledger.
Denied sources are absent; a failed permitted query is unavailable, never zero.
"""

import frappe
from frappe import _


PAGE = "bnd-home"
DOCTYPES = ("Sales Invoice", "Purchase Invoice", "Journal Entry", "Payment Entry",
            "Quotation", "Sales Order", "Purchase Order", "Delivery Note", "Material Request")
NAV_DOCTYPES = (*DOCTYPES, "Request for Quotation", "Supplier Quotation", "Purchase Receipt",
                "Item", "Warehouse", "Stock Entry", "Stock Reconciliation", "Payment Reconciliation",
                "Period Closing Voucher", "Company", "Accounts Settings")
PAGES = ("bnd-accounting-home", "bnd-journal-workbench", "bnd-report-studio",
         "bnd-finance-close", "bnd-banking", "bnd-asset-workbench",
         "real-estate-operations", "bnd-pos", "bnd-pos-register", "bnd-quick-sale", "bnd-inbox", "bnd-zatca")
GROUPS = (
    ("Transactions", ("Selling", "Bunood Selling", "Buying", "Bunood Buying", "Stock", "Invoicing")),
    ("Operations", ("Real Estate", "Engineering Office", "CRM", "Manufacturing", "Projects", "Assets", "Quality", "Subcontracting")),
    ("Human Resources", ("HR", "HR Setup", "Recruitment", "Performance", "Shift & Attendance", "Leaves", "Payroll", "Expenses", "Tenure", "Tax & Benefits")),
    ("Reports", ("Financial Reports", "Reports", "Report Studio", "ZATCA")),
    ("Setup", ("ERPNext Settings",)),
)


def _staff():
    if frappe.session.user == "Guest" or frappe.get_cached_value("User", frappe.session.user, "user_type") != "System User":
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _allowed(doctype, permission="read"):
    return bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, permission))


def _domain_routes():
    """The installed app's own web gate remains the authority for its route."""
    import importlib
    installed = set(frappe.get_installed_apps())
    routes = []
    for app, module, route, label in (
        ("bunood_engineering", "bunood_engineering.www.engineering", "/engineering", _("Engineering Office")),
        ("bunood_real_estate", "bunood_real_estate.www.realestate", "/realestate", _("Real Estate")),
        ("bunood_crm", "bunood_crm.www.crm", "/crm", _("CRM")),
    ):
        if app in installed and importlib.import_module(module).has_app_permission():
            routes.append({"app": app, "route": route, "label": label})
    if "crm" in installed and "bunood_crm" not in installed:
        # Pinned legacy CRM's own app-screen gate; never infer from a stale
        # Workspace or the different Bunood CRM role vocabulary.
        if importlib.import_module("crm.api").check_app_permission():
            routes.append({"app": "crm", "route": "/crm", "label": _("CRM")})
    return routes


@frappe.whitelist(methods=["GET"])
def read(company=None):
    _staff()
    if company is not None and not isinstance(company, str):
        frappe.throw(_("Select a company"), frappe.ValidationError)
    from bunood_theme.assets import HOME_CSS, HOME_JS
    from bunood_theme.boot import _permitted_pages
    from frappe.desk.desktop import get_workspaces

    companies = frappe.get_list("Company", fields=["name"], order_by="name", limit_page_length=200) if _allowed("Company") else []
    if company:
        frappe.get_doc("Company", company).check_permission("read")
    allowed = [name for name in DOCTYPES if _allowed(name)]
    navigation = {}
    for name in NAV_DOCTYPES:
        if _allowed(name):
            meta = frappe.get_meta(name)
            navigation[name] = {"single": bool(meta.issingle), "company": bool(meta.has_field("company"))}
    queues = []
    evidence = None
    accounting = set(frappe.get_roles()).intersection({"Accounts User", "Accounts Manager", "Auditor", "System Manager"})
    if company and accounting:
        from bunood_theme.accounting_page import read as accounting_read
        evidence = accounting_read(company)
        queues = [{"doctype": row["doctype"], "key": row["key"], "count": row["count"], "filters": row["filters"]}
                  for row in evidence.get("groups", []) if row["doctype"] in allowed]
    elif company:
        for name in allowed:
            filters = {"company": company, "docstatus": 0}
            try:
                rows = frappe.get_list(name, filters=filters, fields=[{"COUNT": "name", "AS": "count"}], limit_page_length=1)
                count = int(rows[0]["count"]) if rows else 0
            except Exception:
                count = None
            queues.append({"doctype": name, "count": count, "filters": filters})
    return {
        "css": HOME_CSS, "js": HOME_JS, "company": company,
        "companies": companies, "queues": queues,
        "queue_records": evidence.get("queue", []) if evidence else [],
        "workspaces": get_workspaces().get("pages", []),
        "pages": _permitted_pages(name for name in PAGES if name != "real-estate-operations" or "bunood_real_estate" in frappe.get_installed_apps()),
        "roles": frappe.get_roles(),
        "domains": _domain_routes(),
        "groups": GROUPS,
        "read": list(navigation), "document_routes": navigation,
        "create": [name for name in allowed if _allowed(name, "create")],
    }


def extend_bootinfo(bootinfo):
    """An unset native landing inherits Home; explicit defaults remain untouched."""
    if frappe.session.user == "Guest" or not frappe.db.exists("Page", PAGE):
        return
    if not frappe.get_cached_doc("Page", PAGE).is_permitted():
        return
    from bunood_theme.assets import HOME_CSS, HOME_JS
    bootinfo.bnd_home_css, bootinfo.bnd_home_js = HOME_CSS, HOME_JS
    # Do not write defaults: custom site and user landing preferences survive.
    personal_home = (bootinfo.get("bnd_personal") or {}).get("home")
    native_home = (bootinfo.get("user") or {}).get("default_workspace")
    role_home = any(frappe.get_cached_value("Role", role, "home_page") for role in frappe.get_roles())
    default = frappe.db.get_default("desktop:home_page")
    generic = not default or (default in ("workspace", "desktop")
                             and not frappe.db.exists("Page", default)
                             and not frappe.db.exists("Workspace", default))
    if not personal_home and not native_home and not role_home and generic and bootinfo.get("home_page") in (None, "desktop"):
        from frappe.desk import desk_page
        page = desk_page.get(PAGE)
        bootinfo.home_page = PAGE
        bootinfo.setdefault("docs", []).append(page)
    # Consume Frappe's already permission-filtered navigation. Never replace an
    # existing Sidebar or discard its custom links, even on a name collision.
    sidebars = bootinfo.get("workspace_sidebar_item")
    if not isinstance(sidebars, dict):
        return
    entry = {"type": "Link", "label": _("Bunood Home"), "link_type": "Page", "link_to": PAGE,
             "icon": "home", "child": 0, "route_options": '{"sidebar":"Bunood Home"}'}
    for sidebar in sidebars.values():
        if isinstance(sidebar.get("items"), list) and not any(row.get("link_to") == PAGE for row in sidebar["items"]):
            sidebar["items"].insert(0, dict(entry))
    if "bunood home" in sidebars:
        return
    allowed = {row["name"]: row for row in bootinfo.get("allowed_workspaces", []) if row.get("name")}
    items, used = [dict(entry)], set()
    for title, names in (*GROUPS, ("Other workspaces", tuple(allowed))):
        visible = [name for name in names if name in allowed and name not in used]
        if not visible:
            continue
        items.append({"type": "Section Break", "label": _(title), "collapsible": 1, "keep_closed": 0})
        for name in visible:
            used.add(name)
            items.append({"type": "Link", "label": _(allowed[name].get("label") or name),
                          "link_type": "Workspace", "link_to": name, "child": 1, "icon": allowed[name].get("icon")})
    # Native sidebar routing uses label as its identity; the header translates
    # it when rendering. Translating it here makes Arabic routes pick a peer.
    sidebars["bunood home"] = {"label": "Bunood Home", "title": "Bunood Home", "items": items,
                               "header_icon": "home", "module": "Bunood Theme", "app": "bunood_theme"}
