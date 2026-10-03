"""Minimum native authority required by ERPNext's Stock Entry controller.

ERPNext's browser controller reads ``sample_retention_warehouse`` and
``disable_serial_no_and_batch_selector`` from the singleton Stock Settings
document while an operator opens Stock Entry.  Upstream grants that singleton
to Stock Manager and Sales User, but not Stock User, even though Stock User has
the complete native Stock Entry lifecycle.  The result is two visible 403s for
the warehouse persona before any transaction is attempted.

This module uses Frappe's own Custom DocPerm mechanism to add read/select only.
It does not expose a new settings endpoint, duplicate either value, or grant
configuration authority.  Existing administrator-added rights are preserved
and remain visible to acceptance rather than being silently removed.
"""

from __future__ import annotations

import frappe


ROLE = "Stock User"
DOCTYPE = "Stock Settings"
REQUIRED = frozenset({"select", "read"})
STANDARD_RIGHTS = (
    "select",
    "read",
    "write",
    "create",
    "delete",
    "submit",
    "cancel",
    "amend",
    "print",
    "email",
    "report",
    "import",
    "export",
    "share",
)


def _permission_values() -> dict[str, object]:
    values: dict[str, object] = {
        "doctype": "Custom DocPerm",
        "parent": DOCTYPE,
        "role": ROLE,
        "permlevel": 0,
        "if_owner": 0,
    }
    values.update({right: int(right in REQUIRED) for right in STANDARD_RIGHTS})
    return values


def ensure_stock_user_settings_read() -> dict[str, object]:
    """Install or repair the bounded read grant idempotently."""

    prerequisites = ("Role", "Custom DocPerm", DOCTYPE)
    if any(not frappe.db.exists("DocType", name) for name in prerequisites):
        return {"created": False, "repaired": [], "skipped": True}
    if not frappe.db.exists("Role", ROLE):
        return {"created": False, "repaired": [], "skipped": True}

    filters = {"parent": DOCTYPE, "role": ROLE, "permlevel": 0, "if_owner": 0}
    name = frappe.db.get_value("Custom DocPerm", filters, "name")
    created = False
    repaired: list[str] = []
    if not name:
        frappe.get_doc(_permission_values()).insert(ignore_permissions=True)
        created = True
    else:
        current = frappe.db.get_value("Custom DocPerm", name, list(REQUIRED), as_dict=True)
        missing = {right: 1 for right in REQUIRED if not current.get(right)}
        if missing:
            frappe.db.set_value("Custom DocPerm", name, missing, update_modified=False)
            repaired = sorted(missing)

    if created or repaired:
        frappe.clear_cache()
    return {"created": created, "repaired": repaired, "skipped": False}
