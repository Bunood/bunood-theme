"""Least-privilege authority for Bunood POS shift operators.

``Bunood Cashier`` remains an experience marker: it selects the cashier-shaped
navigation but grants no records or actions.  Native ERPNext currently reserves
POS Opening Entry and POS Closing Entry for manager roles, so assigning
``Sales Manager`` to a cashier would also grant unrelated sales administration.

This module creates a separate ``Bunood POS Operator`` authority role with only
the POS lifecycle rights. ERPNext v16.34.1 reserves both POS invoice variants
for Accounts roles, while ``Sales User`` and ``Stock User`` add unrelated
authority without making the invoice submittable. Bunood therefore owns the
small cashier contract instead of composing broad native roles. Invoice and
shift records are creator-only; company, warehouse, customer, and profile scope
continues to come from User Permissions and the POS Profile. Existing
administrator extensions are never removed; the acceptance
matrix is responsible for detecting excessive grants.
"""

from __future__ import annotations

import frappe


POS_OPERATOR_ROLE = "Bunood POS Operator"

# Every field is explicit because Custom DocPerm ships with some permissive
# defaults (notably export).  A newly inserted row must never inherit authority
# that is not part of the contract below.
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

POS_OPERATOR_PERMISSIONS = {
    # Link lookup needs select; ERPNext's closing reconciliation explicitly
    # checks read permission on the selected profile.  The role still cannot
    # create, edit, delete, export, or share profile configuration.
    "POS Profile": (frozenset({"select", "read"}), False),
    # The configured POS Settings invoice type can be either document. Drafts
    # may be discarded and receipts printed, but submitted invoices cannot be
    # cancelled/amended and the role cannot report, export, share, or import.
    "POS Invoice": (frozenset({"select", "read", "write", "create", "delete", "submit", "print"}), True),
    "Sales Invoice": (frozenset({"select", "read", "write", "create", "delete", "submit", "print"}), True),
    # Customer lookup is operationally necessary, but customer master-data
    # creation and maintenance belong to sales/master-data roles.
    "Customer": (frozenset({"select", "read"}), False),
    # A cashier owns the ordinary shift lifecycle but cannot delete, cancel,
    # amend, export, share, or email these audit records.
    "POS Opening Entry": (frozenset({"select", "read", "write", "create", "submit"}), True),
    "POS Closing Entry": (frozenset({"select", "read", "write", "create", "submit"}), True),
}


def _ensure_role() -> bool:
    if frappe.db.exists("Role", POS_OPERATOR_ROLE):
        return False
    frappe.get_doc(
        {
            "doctype": "Role",
            "role_name": POS_OPERATOR_ROLE,
            "desk_access": 1,
            "is_custom": 1,
        }
    ).insert(ignore_permissions=True)
    return True


def _permission_values(doctype: str, required: frozenset[str], owner_only: bool) -> dict[str, object]:
    values: dict[str, object] = {
        "doctype": "Custom DocPerm",
        "parent": doctype,
        "role": POS_OPERATOR_ROLE,
        "permlevel": 0,
        "if_owner": int(owner_only),
    }
    values.update({right: int(right in required) for right in STANDARD_RIGHTS})
    return values


def ensure_pos_operator_permissions() -> dict[str, object]:
    """Create the dedicated role and its minimum required grants idempotently.

    Missing required rights on an existing managed row are repaired.  Extra
    administrator-added rights are preserved rather than silently revoked; the
    V1 permission acceptance gate must report them for an explicit decision.
    """
    required_doctypes = ("Role", "Custom DocPerm")
    if any(not frappe.db.exists("DocType", name) for name in required_doctypes):
        return {
            "role_created": False,
            "created": [],
            "repaired": [],
            "scope_repaired": [],
            "skipped": list(POS_OPERATOR_PERMISSIONS),
        }

    role_created = _ensure_role()
    created: list[str] = []
    repaired: list[str] = []
    scope_repaired: list[str] = []
    skipped: list[str] = []

    for doctype, (required, owner_only) in POS_OPERATOR_PERMISSIONS.items():
        if not frappe.db.exists("DocType", doctype):
            skipped.append(doctype)
            continue
        filters = {
            "parent": doctype,
            "role": POS_OPERATOR_ROLE,
            "permlevel": 0,
            "if_owner": int(owner_only),
        }
        name = frappe.db.get_value("Custom DocPerm", filters, "name")
        if not name:
            # Tighten the single legacy Bunood-managed row in place. Multiple
            # rows are left visible for the acceptance gate rather than making
            # an ambiguous destructive choice.
            legacy = frappe.get_all(
                "Custom DocPerm",
                filters={"parent": doctype, "role": POS_OPERATOR_ROLE, "permlevel": 0},
                pluck="name",
            )
            if len(legacy) == 1:
                name = legacy[0]
                frappe.db.set_value(
                    "Custom DocPerm", name, "if_owner", int(owner_only), update_modified=False
                )
                scope_repaired.append(doctype)
            else:
                frappe.get_doc(_permission_values(doctype, required, owner_only)).insert(
                    ignore_permissions=True
                )
                created.append(doctype)
                continue

        current = frappe.db.get_value("Custom DocPerm", name, list(required), as_dict=True)
        missing = {right: 1 for right in required if not current.get(right)}
        if missing:
            frappe.db.set_value("Custom DocPerm", name, missing, update_modified=False)
            repaired.append(doctype)

    if role_created or created or repaired or scope_repaired:
        frappe.clear_cache()
    return {
        "role_created": role_created,
        "created": created,
        "repaired": repaired,
        "scope_repaired": scope_repaired,
        "skipped": skipped,
    }
