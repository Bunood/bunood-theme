"""Native, permission-aware work records for Bunood's pre-live review.

The readiness disclosure remains an observation layer.  When a company wants
to turn those observations into accountable work, this module creates exactly
one native ERPNext Project and one native Task for each readiness domain.
Assignments remain Frappe ``Assign To`` records and evidence remains native
attachments/comments; Bunood deliberately does not build a second task ledger.

Task completion records operational progress only.  It is never tax, ZATCA,
accounting, security, or launch approval.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

import frappe
from frappe.utils import add_days, nowdate

from bunood_theme.launch_readiness import (
    LAUNCH_CHECK_CONSEQUENCES,
    LAUNCH_CHECK_POLICIES,
    LAUNCH_CHECK_ROLES,
    LAUNCH_CHECK_TITLES,
)
from bunood_theme.custom_fields import ensure_custom_fields, fields_installed


PROJECT_IDENTITY_FIELD = "custom_bunood_readiness_identity"
TASK_IDENTITY_FIELD = "custom_bunood_readiness_identity"
TASK_DOMAIN_FIELD = "custom_bunood_readiness_domain"

READINESS_DOMAINS = tuple(key for key, _policy in LAUNCH_CHECK_POLICIES)

ROLE_LABELS = {
    "business-owner": "Business owner",
    "finance-reviewer": "Finance reviewer",
    "tax-and-zatca-reviewer": "Tax and ZATCA reviewer",
    "inventory-reviewer": "Inventory reviewer",
    "sales-and-pricing-owner": "Sales and pricing owner",
    "sales-and-procurement-owner": "Sales and procurement owner",
    "finance-and-pos-owner": "Finance and POS owner",
    "system-and-security-owner": "System and security owner",
    "finance-and-tax-reviewer": "Finance and tax reviewer",
    "system-and-privacy-owner": "System and privacy owner",
    "integration-owner": "Integration owner",
    "implementation-lead": "Implementation lead",
}

CONSEQUENCE_LABELS = {
    "wrong-identity-currency-period-or-branch": "Documents may use the wrong identity, currency, period or branch",
    "posting-unavailable-or-wrong-accounts-and-dimensions": "Transactions may not post, or may use the wrong accounts and dimensions",
    "incorrect-tax-or-rejected-regulated-output": "Tax may be incorrect or regulated output may be rejected",
    "incorrect-stock-quantity-value-or-traceability": "Stock quantity, value or traceability may be incorrect",
    "unavailable-items-or-incorrect-pricing-and-discounts": "Items may be unavailable or prices and discounts may be wrong",
    "incorrect-party-history-terms-credit-or-duplicates": "Party history, terms, credit or duplicate handling may be wrong",
    "unreconciled-cash-card-bank-or-provider-settlement": "Cash, card, bank or provider settlement may not reconcile",
    "excessive-or-insufficient-access-and-approval-conflict": "Users may have too much or too little access, or conflicting approvals",
    "incorrect-numbering-language-communication-or-legal-output": "Numbering, language, communications or legal output may be wrong",
    "failed-recovery-privacy-security-or-support-response": "Recovery, privacy, security or support response may fail",
    "unowned-provider-failure-secret-or-reconciliation-gap": "Provider failures, credentials or reconciliation gaps may have no owner",
    "go-live-errors-reach-customers-stock-and-ledgers": "Go-live errors may reach customers, stock and accounting ledgers",
}

CUSTOM_FIELDS = {
    "Project": (
        {
            "fieldname": PROJECT_IDENTITY_FIELD,
            "label": "Bunood Readiness Identity",
            "fieldtype": "Data",
            "insert_after": "company",
            "hidden": 1,
            "read_only": 1,
            "no_copy": 1,
            "unique": 1,
        },
    ),
    "Task": (
        {
            "fieldname": TASK_IDENTITY_FIELD,
            "label": "Bunood Readiness Identity",
            "fieldtype": "Data",
            "insert_after": "project",
            "hidden": 1,
            "read_only": 1,
            "no_copy": 1,
            "unique": 1,
        },
        {
            "fieldname": TASK_DOMAIN_FIELD,
            "label": "Bunood Readiness Domain",
            "fieldtype": "Select",
            # The blank first option is essential: this field exists on every
            # native Task, and ordinary project work must never default to the
            # first Bunood readiness domain.
            "options": "\n" + "\n".join(READINESS_DOMAINS),
            "insert_after": TASK_IDENTITY_FIELD,
            "hidden": 1,
            "read_only": 1,
            "no_copy": 1,
        },
    ),
}


def readiness_task_identity(company: str, domain: str) -> str:
    """Stable identity used for idempotency and concurrent create requests."""

    return f"{company}::{domain}"


def parse_assignees(value: Any) -> list[str]:
    """Normalize Frappe's ``_assign`` JSON without manufacturing owners."""

    if not value:
        return []
    parsed = value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return []
    if isinstance(parsed, dict):
        parsed = list(parsed)
    if not isinstance(parsed, (list, tuple, set)):
        return []
    return list(dict.fromkeys(str(item).strip() for item in parsed if str(item).strip()))


def _doctype_exists(doctype: str) -> bool:
    return bool(frappe.db.exists("DocType", doctype))


def _fields_installed() -> bool:
    return fields_installed(frappe, CUSTOM_FIELDS)


def ensure_readiness_work_fields() -> None:
    """Install the small identity seam on native Project and Task records.

    This runs only during app installation/migration.  ``ignore_permissions``
    is appropriate here because it changes metadata as part of deployment; no
    user-triggered readiness action bypasses permissions.
    """

    ensure_custom_fields(frappe, CUSTOM_FIELDS)


def _empty_work_plan(company: str, *, reason: str = "") -> dict[str, Any]:
    return {
        "available": False,
        "company": company,
        "project": None,
        "tasks": {},
        "can_create": False,
        "can_create_project": False,
        "can_create_task": False,
        "evidence_visible": False,
        "query_error": False,
        "reason": reason,
        "completion_is_approval": False,
        "review": {
            "available": False,
            "can_read": False,
            "can_create": False,
            "query_error": False,
            "decision_is_launch_approval": False,
        },
        "source": "native-project-task-assignment-file",
    }


def _visible_company(company: str) -> bool:
    if not company or not _doctype_exists("Company"):
        return False
    if not frappe.has_permission("Company", "read"):
        return False
    return bool(
        frappe.get_list("Company", filters={"name": company}, fields=["name"], limit=1)
    )


def _evidence_counts(task_names: Iterable[str]) -> tuple[bool, dict[str, int]]:
    names = list(task_names)
    if not names or not _doctype_exists("File") or not frappe.has_permission("File", "read"):
        return False, {}
    rows = frappe.get_list(
        "File",
        filters={
            "attached_to_doctype": "Task",
            "attached_to_name": ["in", names],
        },
        fields=["name", "attached_to_name"],
        limit=0,
    )
    counts: dict[str, int] = {}
    for row in rows:
        attached_to = row.get("attached_to_name")
        if attached_to:
            counts[attached_to] = counts.get(attached_to, 0) + 1
    return True, counts


def get_readiness_work(company: str) -> dict[str, Any]:
    """Return only readiness work visible to the current user."""

    result = _empty_work_plan(company)
    if not company:
        result["reason"] = "company-required"
        return result
    if not all(_doctype_exists(doctype) for doctype in ("Project", "Task")):
        result["reason"] = "erpnext-projects-unavailable"
        return result
    if not _fields_installed():
        result["reason"] = "migration-required"
        return result

    try:
        company_visible = _visible_company(company)
        can_read_project = bool(frappe.has_permission("Project", "read"))
        can_read_task = bool(frappe.has_permission("Task", "read"))
        can_create_project = bool(frappe.has_permission("Project", "create"))
        can_create_task = bool(frappe.has_permission("Task", "create"))
        result.update(
            available=company_visible and can_read_project and can_read_task,
            can_create_project=company_visible and can_read_project and can_create_project,
            can_create_task=company_visible and can_read_task and can_create_task,
            can_create=(
                company_visible
                and can_read_project
                and can_read_task
                and can_create_project
                and can_create_task
            ),
            reason="" if company_visible else "company-not-visible",
        )
        if not result["available"]:
            if company_visible:
                result["reason"] = "work-records-not-readable"
            return result

        projects = frappe.get_list(
            "Project",
            filters={"company": company, PROJECT_IDENTITY_FIELD: company},
            fields=[
                "name",
                "project_name",
                "status",
                "modified",
                PROJECT_IDENTITY_FIELD,
            ],
            order_by="creation asc",
            limit=1,
        )
        if not projects:
            return result

        project = projects[0]
        project_name = project.get("name")
        result["project"] = {
            "name": project_name,
            "title": project.get("project_name") or project_name,
            "status": project.get("status") or "Open",
            "modified": project.get("modified"),
            "readiness_identity": project.get(PROJECT_IDENTITY_FIELD),
            "route": ["Form", "Project", project_name],
        }
        rows = frappe.get_list(
            "Task",
            filters={"project": project_name, TASK_DOMAIN_FIELD: ["in", list(READINESS_DOMAINS)]},
            fields=[
                "name",
                "subject",
                "status",
                "priority",
                "exp_end_date",
                "modified",
                "_assign",
                TASK_IDENTITY_FIELD,
                TASK_DOMAIN_FIELD,
            ],
            order_by="creation asc",
            limit=0,
        )
        evidence_visible, evidence_counts = _evidence_counts(row.get("name") for row in rows)
        result["evidence_visible"] = evidence_visible
        for row in rows:
            domain = row.get(TASK_DOMAIN_FIELD)
            if domain not in READINESS_DOMAINS or domain in result["tasks"]:
                continue
            name = row.get("name")
            task = {
                "name": name,
                "subject": row.get("subject") or LAUNCH_CHECK_TITLES[domain],
                "status": row.get("status") or "Open",
                "priority": row.get("priority") or "Medium",
                "due_date": row.get("exp_end_date"),
                "modified": row.get("modified"),
                "readiness_identity": row.get(TASK_IDENTITY_FIELD),
                "assignees": parse_assignees(row.get("_assign")),
                "route": ["Form", "Task", name],
            }
            if evidence_visible:
                task["evidence_count"] = evidence_counts.get(name, 0)
            result["tasks"][domain] = task

        # Review receipts are an optional, bounded layer.  Import locally so a
        # Frappe-only site or a pre-migration site keeps the observation and
        # native work-plan paths even when the receipt DocType is unavailable.
        from bunood_theme.readiness_review import review_state_for_work

        review = review_state_for_work(
            company=company,
            project=project,
            tasks=result["tasks"],
        )
        result["review"] = {key: value for key, value in review.items() if key != "by_domain"}
        for domain, task in result["tasks"].items():
            task["can_record_review"] = bool(
                review.get("can_create") and not review.get("query_error")
            )
            decision = (review.get("by_domain") or {}).get(domain)
            if decision:
                task["review"] = decision
        return result
    except Exception:
        frappe.log_error(title="bunood_theme: readiness work query stood down")
        result.update(query_error=True, reason="query-error")
        return result


def _task_description(domain: str) -> str:
    role = ROLE_LABELS[LAUNCH_CHECK_ROLES[domain]]
    consequence = CONSEQUENCE_LABELS[LAUNCH_CHECK_CONSEQUENCES[domain]]
    return "\n\n".join(
        (
            frappe._("Responsible role: {0}").format(frappe._(role)),
            frappe._("If unresolved: {0}").format(frappe._(consequence)),
            frappe._(
                "Operational work item only. Completing this task is not tax, ZATCA, accounting or launch approval."
            ),
        )
    )


def _create_missing_tasks(company: str, project_name: str) -> None:
    for domain in READINESS_DOMAINS:
        identity = readiness_task_identity(company, domain)
        if frappe.db.exists("Task", {TASK_IDENTITY_FIELD: identity}):
            continue
        values = {
            "doctype": "Task",
            "subject": frappe._(LAUNCH_CHECK_TITLES[domain]),
            "project": project_name,
            "company": company,
            "status": "Open",
            "priority": "High" if domain in {"company", "accounting", "tax_zatca"} else "Medium",
            "exp_start_date": nowdate(),
            "exp_end_date": add_days(nowdate(), 14),
            "description": _task_description(domain),
            TASK_IDENTITY_FIELD: identity,
            TASK_DOMAIN_FIELD: domain,
        }
        try:
            frappe.get_doc(values).insert()
        except frappe.DuplicateEntryError:
            # The unique identity makes concurrent button presses idempotent.
            if not frappe.db.exists("Task", {TASK_IDENTITY_FIELD: identity}):
                raise


def start_readiness_review(company: str) -> dict[str, Any]:
    """Create or repair the native readiness Project and its twelve Tasks."""

    company = (company or "").strip()
    if not company:
        frappe.throw(frappe._("Select a company before creating the work plan."))
    if not _fields_installed():
        frappe.throw(frappe._("Run the latest Bunood migration before creating the work plan."))
    if not _visible_company(company):
        frappe.throw(
            frappe._("You do not have permission to use this company."),
            frappe.PermissionError,
        )

    current = get_readiness_work(company)
    project = current.get("project")
    if project:
        if len(current.get("tasks") or {}) < len(READINESS_DOMAINS):
            if not current.get("can_create_task"):
                frappe.throw(
                    frappe._("You do not have permission to create readiness tasks."),
                    frappe.PermissionError,
                )
            _create_missing_tasks(company, project["name"])
        refreshed = get_readiness_work(company)
        refreshed["created"] = False
        return refreshed

    if not current.get("can_create"):
        frappe.throw(
            frappe._("You do not have permission to create the readiness work plan."),
            frappe.PermissionError,
        )

    values = {
        "doctype": "Project",
        "project_name": frappe._("Bunood readiness — {0}").format(company),
        "company": company,
        "status": "Open",
        "expected_start_date": nowdate(),
        "expected_end_date": add_days(nowdate(), 14),
        "notes": frappe._(
            "Operational work plan only. Task completion is not tax, ZATCA, accounting, security or launch approval."
        ),
        PROJECT_IDENTITY_FIELD: company,
    }
    try:
        project_doc = frappe.get_doc(values).insert()
        project_name = project_doc.name
    except frappe.DuplicateEntryError:
        projects = frappe.get_list(
            "Project",
            filters={"company": company, PROJECT_IDENTITY_FIELD: company},
            fields=["name"],
            limit=1,
        )
        if not projects:
            raise
        project_name = projects[0].get("name")

    _create_missing_tasks(company, project_name)
    result = get_readiness_work(company)
    result["created"] = True
    return result
