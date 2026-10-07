"""Native, permission-filtered entry points for Bunood's task pages.

The Page records make POS and Report Studio routable, but Frappe v16's Apps
screen is driven by Desktop Icon records backed by Workspace Sidebars. A Page
alone is therefore invisible in both places. Seed only missing Bunood-owned
navigation; never replace a site's existing sidebar or desktop layout.
"""

import frappe

# These are the native read checks made by the corresponding first-paint
# endpoints. A Page with an empty roles table is not evidence that its data
# endpoint is accessible. This restricts navigation only; no permissions change.
PAGE_READ_REQUIREMENTS = {
    "bnd-pos": ("POS Profile",),
    "bnd-pos-register": ("Company",),
    "bnd-quick-sale": ("Company", "Sales Invoice", "Sales Taxes and Charges Template"),
    "bnd-banking": ("Company", "Bank Account"),
    "bnd-report-studio": ("Company",),
}


def navigation_permitted_pages():
    permitted = []
    for name in frappe.get_all("Page", filters={"name": ["like", "bnd-%"]}, pluck="name"):
        if (frappe.get_cached_doc("Page", name).is_permitted()
                and all(frappe.has_permission(dt, "read") for dt in PAGE_READ_REQUIREMENTS.get(name, ()))
                and (name != "bnd-pos-register" or any(frappe.has_permission(dt, "read")
                     for dt in ("POS Invoice", "Sales Invoice")))):
            permitted.append(name)
    return permitted


ENTRY_POINTS = (
    {
        "label": "Bunood POS",
        "icon": "shopping-cart",
        "order": 30,
        "items": (
            ("Bunood POS", "Page", "bnd-pos"),
            ("POS sales register", "Page", "bnd-pos-register"),
            ("Sales Invoice", "DocType", "Sales Invoice"),
            ("POS Opening Entry", "DocType", "POS Opening Entry"),
            ("POS Closing Entry", "DocType", "POS Closing Entry"),
            ("POS Profile", "DocType", "POS Profile"),
        ),
    },
    {
        "label": "Report Studio",
        "icon": "chart-bar",
        "order": 31,
        "items": (
            ("Report Studio", "Page", "bnd-report-studio"),
            ("Reports", "Workspace", "Reports"),
        ),
    },
)


# The Reports workspace is a landing page, but its automatically generated
# sidebar only contained its two Page shortcuts.  Keep the useful native
# report links in the same sidebar so accountants can open them directly.
REPORT_SIDEBAR_GROUPS = (
    ("Ledgers and balances", (
        ("General Ledger", "General Ledger"),
        ("Trial Balance", "Trial Balance"),
        ("Balance Sheet", "Balance Sheet"),
        ("Profit and Loss", "Profit and Loss Statement"),
    )),
    ("Receivables and payables", (
        ("Accounts Receivable", "Accounts Receivable"),
        ("Accounts Payable", "Accounts Payable"),
    )),
    ("Sales and purchases", (
        ("Sales Register", "Sales Register"),
        ("Purchase Register", "Purchase Register"),
        ("Gross Profit", "Gross Profit"),
    )),
)


def ensure_reports_sidebar():
    """Repair the generated Reports sidebar without removing local additions."""
    if not frappe.db.exists("Workspace Sidebar", "Reports"):
        return False

    sidebar = frappe.get_doc("Workspace Sidebar", "Reports")
    changed = False

    # Frappe's Workspace-to-Sidebar conversion copies URL shortcuts without
    # their URL target.  These two pre-existing rows were consequently hidden.
    studio_urls = {
        "VAT Return": "/desk/bnd-report-studio/vat-return",
        "Statement of Account": "/desk/bnd-report-studio/account-statement",
    }
    if frappe.db.exists("Page", "bnd-report-studio"):
        for item in sidebar.items:
            if item.type == "Link" and item.link_type == "URL" and item.label in studio_urls:
                target = studio_urls[item.label]
                if item.url != target:
                    item.url = target
                    changed = True

    existing_reports = {
        item.link_to for item in sidebar.items
        if item.type == "Link" and item.link_type == "Report"
    }
    existing_sections = {
        item.label for item in sidebar.items if item.type == "Section Break"
    }
    for section, reports in REPORT_SIDEBAR_GROUPS:
        available = [
            (label, report) for label, report in reports
            if report not in existing_reports and _navigation_target_exists("Report", report)
        ]
        if not available:
            continue
        if section not in existing_sections:
            sidebar.append("items", {"label": section, "type": "Section Break"})
            existing_sections.add(section)
        for label, report in available:
            sidebar.append("items", {
                "label": label,
                "type": "Link",
                "link_type": "Report",
                "link_to": report,
                "child": 1,
            })
            existing_reports.add(report)
        changed = True

    if changed:
        sidebar.save(ignore_permissions=True)
    return changed


def ensure_task_navigation():
    """Connect the task pages to Apps and sidebar without overriding local edits.

    Frappe filters Workspace Sidebar Page/DocType links by the user's native
    permissions, and shows the matching Desktop Icon only when at least one
    sidebar item survives. The page link comes first so its Apps tile opens the
    working page directly, rather than a second empty landing workspace.
    """
    changed = ensure_sidebar_integrity()
    for entry in ENTRY_POINTS:
        label = entry["label"]
        if not frappe.db.exists("Page", entry["items"][0][2]):
            continue

        if not frappe.db.exists("Workspace Sidebar", label):
            sidebar = frappe.new_doc("Workspace Sidebar")
            sidebar.title = label
            sidebar.header_icon = entry["icon"]
            sidebar.module = "Bunood Theme"
            sidebar.app = "bunood_theme"
            sidebar.standard = 1
            for item_label, link_type, link_to in entry["items"]:
                if not frappe.db.exists(link_type, link_to):
                    continue
                sidebar.append("items", {
                    "label": item_label,
                    "type": "Link",
                    "link_type": link_type,
                    "link_to": link_to,
                })
            sidebar.insert(ignore_permissions=True)
            changed = True

        if not frappe.db.exists("Desktop Icon", label):
            icon = frappe.new_doc("Desktop Icon")
            icon.label = label
            icon.icon_type = "Link"
            icon.link_type = "Workspace Sidebar"
            icon.link_to = label
            icon.icon = entry["icon"]
            icon.app = "bunood_theme"
            icon.idx = entry["order"]
            icon.standard = 1
            icon.insert(ignore_permissions=True)
            changed = True

    # Existing Bunood-owned POS sidebars predate the register. Append only the
    # missing page link; never rebuild or reorder the site's existing items.
    if (frappe.db.exists("Page", "bnd-pos-register")
            and frappe.db.exists("Workspace Sidebar", "Bunood POS")):
        sidebar = frappe.get_doc("Workspace Sidebar", "Bunood POS")
        if not any(item.type == "Link" and item.link_type == "Page"
                   and item.link_to == "bnd-pos-register" for item in sidebar.items):
            sidebar.append("items", {
                "label": "POS sales register", "type": "Link",
                "link_type": "Page", "link_to": "bnd-pos-register",
            })
            sidebar.save(ignore_permissions=True)
            changed = True

    # ERPNext's Selling sidebar still ships a link to its older Point of Sale
    # page. Keep the user's Selling layout and label, changing only that one
    # native Page target. The guard also respects sites that have customized it.
    if (frappe.db.exists("Page", "bnd-pos")
            and frappe.db.exists("Workspace Sidebar", "Selling")):
        selling = frappe.get_doc("Workspace Sidebar", "Selling")
        for item in selling.items:
            if (item.type == "Link" and item.link_type == "Page"
                    and item.link_to == "point-of-sale"):
                frappe.db.set_value(item.doctype, item.name, "link_to", "bnd-pos", update_modified=False)
                changed = True

    changed = ensure_reports_sidebar() or changed
    changed = ensure_complete_sidebars() or changed

    if changed:
        frappe.clear_cache()


def _navigation_identity(kind, target):
    # /app and /desk are native aliases, not two destinations. The old Reports
    # repair canonicalizes /desk; authored /app shortcuts must not reappear.
    if kind == "URL" and target and target.startswith("/app/"):
        target = "/desk/" + target[5:]
    return kind, target


def sidebar_additions(workspace, sidebar, exists):
    """Missing authored navigation, not a catalogue of internal child tables.

    Keep existing rows, labels, filters and order. Workspace cards are the app's
    workflow catalogue; v16's initial converter copied shortcuts only. This is
    installation metadata, not user data: native Sidebar boot filtering still
    decides what each person can see.
    """
    additions = []
    seen = {_navigation_identity(i.get("link_type"), i.get("url") if i.get("link_type") == "URL"
             else i.get("link_to")) for i in sidebar if i.get("type") == "Link"}
    sections = set()
    group = None
    for source in workspace:
        if source.get("type") == "Card Break":
            group = source.get("label")
            continue
        kind = source.get("link_type") or source.get("type")
        target = source.get("url") or source.get("link_to")
        if not target or kind not in ("DocType", "Report", "Page", "Workspace", "Dashboard", "URL"):
            continue
        identity = _navigation_identity(kind, target)
        if identity in seen or not exists(kind, target):
            continue
        if group and group not in sections:
            additions.append({"type": "Section Break", "label": group, "collapsible": 1})
            sections.add(group)
        additions.append({"type": "Link", "label": source.get("label") or target,
                          "link_type": kind, "link_to": target if kind != "URL" else None,
                          "url": target if kind == "URL" else None,
                          "child": int(bool(group)), "icon": source.get("icon"),
                          "filters": source.get("filters"),
                          "route_options": source.get("route_options")})
        seen.add(identity)
    return additions


def _append_sidebar_rows(sidebar, rows):
    """Insert children into an existing section, without reordering local rows."""
    cursor = len(sidebar.items)
    for row in rows:
        if row["type"] == "Section Break":
            match = next((i for i, item in enumerate(sidebar.items)
                          if item.type == "Section Break" and item.label == row["label"]), None)
            if match is not None:
                cursor = match + 1
                while cursor < len(sidebar.items) and sidebar.items[cursor].child:
                    cursor += 1
                continue
            sidebar.append("items", row)
            cursor = len(sidebar.items)
        else:
            sidebar.append("items", row)
            item = sidebar.items.pop()
            sidebar.items.insert(cursor, item)
            cursor += 1
    for index, item in enumerate(sidebar.items, 1):
        item.idx = index


def _navigation_target_exists(kind, target):
    if kind == "URL":
        # Only ship internal destinations. External/custom URLs already on a
        # client's sidebar are preserved, not invented by this reconciler.
        return target.startswith("/") and not target.startswith("//")
    if not frappe.db.exists(kind, target):
        return False
    if kind == "DocType":
        return not frappe.get_meta(target).istable
    if kind == "Report":
        return not frappe.db.get_value("Report", target, "disabled")
    return True


def ensure_complete_sidebars():
    """Add missing public workspace links, never overwrite private menus.

    Called by the existing after-migrate installer, not during user requests.
    Legacy CRM is deliberately excluded pending its separately approved
    retirement; this navigation repair must not grow a second CRM workflow.
    """
    changed = False
    for name in frappe.get_all("Workspace", filters={"public": 1, "is_hidden": 0}, pluck="name"):
        if name in ("Home", "CRM", "Frappe CRM", "Welcome Workspace"):
            continue
        if not frappe.db.exists("Workspace Sidebar", name):
            continue
        workspace = frappe.get_doc("Workspace", name)
        sidebar = frappe.get_doc("Workspace Sidebar", name)
        if sidebar.for_user:
            continue
        rows = [i.as_dict() for i in workspace.shortcuts] + [i.as_dict() for i in workspace.links]
        additions = sidebar_additions(rows, [i.as_dict() for i in sidebar.items], _navigation_target_exists)
        owner = frappe.db.get_value("Module Def", workspace.module, "app_name") if workspace.module else None
        needs_owner = not sidebar.app and owner
        if not additions and not needs_owner:
            continue
        if needs_owner:
            sidebar.app = owner
        _append_sidebar_rows(sidebar, additions)
        sidebar.save(ignore_permissions=True)
        changed = True

    # The standalone Studio has views, not a Workspace document of its own.
    # Store report identities, never public URL aliases: native role filtering
    # happens before the browser upgrades permitted reports to Studio routes.
    if frappe.db.exists("Workspace Sidebar", "Report Studio"):
        sidebar = frappe.get_doc("Workspace Sidebar", "Report Studio")
        rows = []
        for section, reports in REPORT_SIDEBAR_GROUPS:
            rows.append({"type": "Card Break", "label": section})
            rows.extend({"type": "Link", "label": label, "link_type": "Report", "link_to": report}
                        for label, report in reports)
        additions = sidebar_additions(rows, [i.as_dict() for i in sidebar.items], _navigation_target_exists)
        if additions and not sidebar.for_user:
            _append_sidebar_rows(sidebar, additions)
            sidebar.save(ignore_permissions=True)
            changed = True
    workbenches = {
        "Banking": [("Banking workbench", "Page", "bnd-banking")],
        "Financial Reports": [("Period close", "Page", "bnd-finance-close"),
                              ("Journal workbench", "Page", "bnd-journal-workbench")],
        "Assets": [("Asset workbench", "Page", "bnd-asset-workbench")],
        "Bunood POS": [("Quick sale", "Page", "bnd-quick-sale")],
        "Bunood Dining": [("Dining Outlet", "DocType", "Dining Outlet"),
                          ("Dining Menu", "DocType", "Dining Menu"),
                          ("Dining Table", "DocType", "Dining Table"),
                          ("Dining Order", "DocType", "Dining Order"),
                          ("Dining Visit", "DocType", "Dining Visit"),
                          ("Dining Staff Assignment", "DocType", "Dining Staff Assignment")],
    }
    for name, links in workbenches.items():
        if not frappe.db.exists("Workspace Sidebar", name):
            continue
        sidebar = frappe.get_doc("Workspace Sidebar", name)
        if sidebar.for_user:
            continue
        rows = [{"type": "Card Break", "label": "Setup" if name == "Bunood Dining" else "Workspaces"}]
        rows.extend({"type": "Link", "label": label, "link_type": kind, "link_to": target}
                    for label, kind, target in links)
        additions = sidebar_additions(rows, [i.as_dict() for i in sidebar.items], _navigation_target_exists)
        if additions:
            _append_sidebar_rows(sidebar, additions)
            sidebar.save(ignore_permissions=True)
            changed = True
    return changed


def ensure_sidebar_integrity():
    changed = False
    # Old upstream versions left removed DocTypes and empty URL shortcuts in
    # public menus. Repair them before saving additions: native link validation
    # must still run, rather than being bypassed to keep a broken menu alive.
    for name in frappe.get_all("Workspace Sidebar", pluck="name"):
        if name in ("CRM", "Frappe CRM"):
            continue
        sidebar = frappe.get_doc("Workspace Sidebar", name)
        if sidebar.for_user:
            continue
        authored = []
        if frappe.db.exists("Workspace", name):
            workspace = frappe.get_doc("Workspace", name)
            authored = [i.as_dict() for i in workspace.shortcuts] + [i.as_dict() for i in workspace.links]
        original = [i.as_dict() for i in sidebar.items]
        repaired = sidebar_repaired_rows(original, authored, _navigation_target_exists)
        if repaired != original:
            sidebar.set("items", repaired)
            sidebar.save(ignore_permissions=True)
            changed = True
    return changed


def sidebar_repaired_rows(items, authored, exists):
    """Keep valid custom rows; restore URL shortcuts and omit absent targets.

    A working external URL already chosen by the site is preserved. Empty URL
    placeholders and removed native entities are not navigable. Private menus
    never call this function, and the site backup retains all removed metadata.
    """
    urls = {i.get("label"): i.get("url") for i in authored if i.get("url")}
    result = []
    seen = set()
    for original in items:
        row = dict(original)
        if row.get("type") != "Link":
            result.append(row)
            continue
        kind = row.get("link_type")
        target = row.get("url") if kind == "URL" else row.get("link_to")
        if kind == "URL":
            if not target:
                target = urls.get(row.get("label"))
                if target:
                    row["url"] = target
            if not target:
                continue
        elif not target or not kind or not exists(kind, target):
            continue
        if not row.get("label"):
            row["label"] = target
        # Retain separately filtered/labeled custom views. Remove only exact
        # duplicate destinations from repeated native conversion/repair runs.
        identity = (_navigation_identity(kind, target), row.get("label"),
                    row.get("filters"), row.get("route_options"), row.get("child", 0))
        if identity in seen:
            continue
        seen.add(identity)
        result.append(row)
    return result
