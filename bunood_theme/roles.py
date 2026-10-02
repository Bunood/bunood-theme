"""V1 experience-marker roles.

These roles select a Bunood task experience; they deliberately carry no document
permissions. ERPNext's native roles, Custom DocPerm records, workflows, and User
Permissions remain the authority for records and actions. Keeping the marker
separate prevents a navigation preference from becoming a security grant.
"""

from __future__ import annotations

import frappe


CASHIER_ROLE = "Bunood Cashier"
OWNER_ROLE = "Bunood Owner"
V1_MARKER_ROLES = (CASHIER_ROLE, OWNER_ROLE)
READINESS_REVIEWER_ROLE = "Bunood Readiness Reviewer"
MIGRATION_MANAGER_ROLE = "Bunood Migration Manager"


def ensure_v1_marker_roles() -> list[str]:
    """Create missing namespaced marker roles without changing existing roles.

    Existing records are respected exactly, including an administrator choosing
    to disable one. The roles have Desk access so they can identify a System User,
    but this function creates no DocPerm, Custom DocPerm, workflow, or User
    Permission records.
    """
    if not frappe.db.exists("DocType", "Role"):
        return []

    created: list[str] = []
    for role_name in V1_MARKER_ROLES:
        if frappe.db.exists("Role", role_name):
            continue
        frappe.get_doc(
            {
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": 1,
                "is_custom": 1,
            }
        ).insert(ignore_permissions=True)
        created.append(role_name)

    if created:
        frappe.clear_cache()
    return created


def ensure_readiness_reviewer_role() -> bool:
    """Install the explicit authorization role for readiness receipts.

    Unlike the experience-marker roles above, this role is intentionally used
    by the ``Bunood Readiness Review`` DocType permission table.  Holding it
    authorizes a user to record a review; it never proves professional
    qualification by itself.  Accepted decisions also require the reviewer to
    record their authority and qualification basis on the immutable receipt.
    """

    if not frappe.db.exists("DocType", "Role"):
        return False
    if frappe.db.exists("Role", READINESS_REVIEWER_ROLE):
        return False
    frappe.get_doc(
        {
            "doctype": "Role",
            "role_name": READINESS_REVIEWER_ROLE,
            "desk_access": 1,
            "is_custom": 1,
        }
    ).insert(ignore_permissions=True)
    frappe.clear_cache()
    return True


def ensure_migration_manager_role() -> bool:
    """Install the bounded authorization role for migration run packets.

    This role can plan and freeze a ``Bunood Migration Run``.  It deliberately
    grants no permission on native business DocTypes or ``Data Import``; those
    permissions remain an explicit ERPNext administrator decision and are
    checked again when a native import draft is prepared.
    """

    if not frappe.db.exists("DocType", "Role"):
        return False
    if frappe.db.exists("Role", MIGRATION_MANAGER_ROLE):
        return False
    frappe.get_doc(
        {
            "doctype": "Role",
            "role_name": MIGRATION_MANAGER_ROLE,
            "desk_access": 1,
            "is_custom": 1,
        }
    ).insert(ignore_permissions=True)
    frappe.clear_cache()
    return True
