"""Candidate-bound, append-only review receipts for Bunood readiness work.

Native ERPNext Project and Task records remain the operational work ledger.
This module adds one deliberately narrow business entity that native Task state,
Comment, Version and Workflow Action do not represent: the qualified decision
receipt.  A submitted receipt is immutable; reopening is a new submitted receipt
linked to the immediately preceding one.

The receipt records who asserted authority, why they were qualified, what exact
candidate and evidence they reviewed, and a SHA-256 digest of that snapshot.  It
never changes Task status and never returns a launch-ready conclusion.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import frappe
from frappe.utils import now_datetime

from bunood_theme import __version__
from bunood_theme.assets import PRINT_CSS, THEME_CSS, THEME_JS
from bunood_theme.launch_readiness import LAUNCH_CHECK_ROLES
from bunood_theme.readiness_work import (
    PROJECT_IDENTITY_FIELD,
    READINESS_DOMAINS,
    ROLE_LABELS,
    TASK_DOMAIN_FIELD,
    TASK_IDENTITY_FIELD,
    readiness_task_identity,
)


REVIEW_DOCTYPE = "Bunood Readiness Review"
REVIEW_DECISIONS = ("Accepted", "Needs Work", "Not Applicable", "Reopened")
ACCEPTING_DECISIONS = {"Accepted", "Not Applicable"}


def _value(row: Any, fieldname: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(fieldname, default)
    getter = getattr(row, "get", None)
    if callable(getter):
        return getter(fieldname, default)
    return getattr(row, fieldname, default)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def snapshot_digest(snapshot: dict[str, Any]) -> str:
    """Return the stable SHA-256 identity of a candidate snapshot."""

    return hashlib.sha256(_canonical_json(snapshot).encode("utf-8")).hexdigest()


def receipt_chain_key(task: str, supersedes: str | None) -> str:
    """Return a fixed-width unique key for one permissible chain successor."""

    return snapshot_digest({"task": task, "supersedes": supersedes or "root"})


def default_candidate_reference() -> str:
    """A precise, editable default for the candidate the reviewer is seeing."""

    site = str(getattr(getattr(frappe, "local", None), "site", "") or "site-unavailable")
    assets = ",".join(path.rsplit("/", 1)[-1] for path in (THEME_CSS, PRINT_CSS, THEME_JS))
    return f"{site} | bunood_theme {__version__} | {assets}"


def _doctype_exists(doctype: str) -> bool:
    return bool(frappe.db.exists("DocType", doctype))


def _evidence_fields(doctype: str, required: list[str], optional: list[str]) -> list[str]:
    try:
        meta = frappe.get_meta(doctype)
        return required + [field for field in optional if meta.has_field(field)]
    except Exception:
        return required


def collect_native_evidence(task_names: list[str]) -> dict[str, Any]:
    """Collect only File/Comment references visible to the current user.

    Comment bodies and private file URLs are deliberately excluded.  A receipt
    fingerprints stable native record identities and hashes, while the protected
    Task remains the place where reviewers open the evidence itself.
    """

    names = list(dict.fromkeys(name for name in task_names if name))
    evidence = {
        "visibility": {"files": False, "comments": False},
        "by_task": {name: {"files": [], "comments": []} for name in names},
    }
    if not names:
        return evidence

    if _doctype_exists("File") and frappe.has_permission("File", "read"):
        fields = _evidence_fields(
            "File",
            ["name", "attached_to_name", "modified"],
            ["file_name", "file_size", "content_hash", "is_private"],
        )
        rows = frappe.get_list(
            "File",
            filters={"attached_to_doctype": "Task", "attached_to_name": ["in", names]},
            fields=fields,
            order_by="name asc",
            limit=0,
        )
        evidence["visibility"]["files"] = True
        for row in rows:
            task_name = _value(row, "attached_to_name")
            if task_name not in evidence["by_task"]:
                continue
            evidence["by_task"][task_name]["files"].append(
                {
                    field: _value(row, field)
                    for field in fields
                    if field != "attached_to_name" and _value(row, field) is not None
                }
            )

    if _doctype_exists("Comment") and frappe.has_permission("Comment", "read"):
        fields = _evidence_fields(
            "Comment",
            ["name", "reference_name", "creation", "modified"],
            ["owner", "comment_type"],
        )
        rows = frappe.get_list(
            "Comment",
            filters={"reference_doctype": "Task", "reference_name": ["in", names]},
            fields=fields,
            order_by="name asc",
            limit=0,
        )
        evidence["visibility"]["comments"] = True
        for row in rows:
            task_name = _value(row, "reference_name")
            if task_name not in evidence["by_task"]:
                continue
            evidence["by_task"][task_name]["comments"].append(
                {
                    field: _value(row, field)
                    for field in fields
                    if field != "reference_name" and _value(row, field) is not None
                }
            )
    return evidence


def build_candidate_snapshot(
    *,
    company: str,
    project: Any,
    task: Any,
    domain: str,
    candidate_reference: str,
    evidence_reference: str,
    native_evidence: dict[str, Any],
) -> dict[str, Any]:
    """Build the exact review input without copying business data."""

    return {
        "schema_version": 1,
        "site": str(getattr(getattr(frappe, "local", None), "site", "") or ""),
        "candidate_reference": (candidate_reference or "").strip(),
        "app": {
            "name": "bunood_theme",
            "version": __version__,
            "assets": {
                "desk_css": THEME_CSS.rsplit("/", 1)[-1],
                "print_css": PRINT_CSS.rsplit("/", 1)[-1],
                "desk_js": THEME_JS.rsplit("/", 1)[-1],
            },
        },
        "company": company,
        "project": {
            "name": _value(project, "name"),
            "status": _value(project, "status"),
            "modified": _value(project, "modified"),
            "readiness_identity": _value(project, PROJECT_IDENTITY_FIELD)
            or _value(project, "readiness_identity"),
        },
        "task": {
            "name": _value(task, "name"),
            "status": _value(task, "status"),
            "modified": _value(task, "modified"),
            "readiness_identity": _value(task, TASK_IDENTITY_FIELD)
            or _value(task, "readiness_identity"),
            "domain": domain,
        },
        "evidence": {
            "external_reference": (evidence_reference or "").strip(),
            "visibility": dict(native_evidence.get("visibility") or {}),
            "files": list(native_evidence.get("files") or []),
            "comments": list(native_evidence.get("comments") or []),
        },
    }


def _visible_company(company: str) -> bool:
    if not company or not _doctype_exists("Company") or not frappe.has_permission("Company", "read"):
        return False
    return bool(frappe.get_list("Company", filters={"name": company}, fields=["name"], limit=1))


def _task_and_project(task_name: str) -> tuple[Any, Any, str]:
    if not task_name:
        frappe.throw(frappe._("Select a readiness task."))
    task = frappe.get_doc("Task", task_name)
    task.check_permission("read")
    project_name = _value(task, "project")
    if not project_name:
        frappe.throw(frappe._("The readiness task is not linked to a work plan."))
    project = frappe.get_doc("Project", project_name)
    project.check_permission("read")
    company = _value(task, "company") or _value(project, "company")
    if not _visible_company(company):
        frappe.throw(frappe._("You do not have permission to use this company."), frappe.PermissionError)
    return task, project, company


def _latest_submitted(
    company: str,
    project: str,
    task: str,
    domain: str,
    *,
    exclude: str | None = None,
) -> dict[str, Any] | None:
    filters: list[list[Any]] = [
        [REVIEW_DOCTYPE, "company", "=", company],
        [REVIEW_DOCTYPE, "project", "=", project],
        [REVIEW_DOCTYPE, "task", "=", task],
        [REVIEW_DOCTYPE, "domain", "=", domain],
        [REVIEW_DOCTYPE, "docstatus", "=", 1],
    ]
    if exclude:
        filters.append([REVIEW_DOCTYPE, "name", "!=", exclude])
    rows = frappe.get_list(
        REVIEW_DOCTYPE,
        filters=filters,
        fields=["name", "decision", "candidate_reference", "reviewed_at"],
        order_by="reviewed_at desc, creation desc",
        limit=1,
    )
    return dict(rows[0]) if rows else None


def decision_chain_error(decision: str, latest_decision: str | None) -> str:
    """Pure chain rule used by the controller and focused tests."""

    if decision == "Reopened" and latest_decision not in ACCEPTING_DECISIONS:
        return "reopen-requires-current-acceptance"
    if decision and decision != "Reopened" and latest_decision in ACCEPTING_DECISIONS:
        return "accepted-receipt-must-be-reopened-first"
    return ""


def _throw_chain_error(error: str) -> None:
    if error == "reopen-requires-current-acceptance":
        frappe.throw(frappe._("Reopening requires a current Accepted or Not Applicable receipt."))
    if error == "accepted-receipt-must-be-reopened-first":
        frappe.throw(frappe._("Submit a reopening receipt before recording another decision."))


def _prepare_common(doc: Any) -> tuple[Any, Any, dict[str, Any], dict[str, Any] | None]:
    task, project, company = _task_and_project(str(_value(doc, "task") or "").strip())
    domain = _value(task, TASK_DOMAIN_FIELD)
    if domain not in READINESS_DOMAINS:
        frappe.throw(frappe._("The selected Task is not a Bunood readiness task."))
    if _value(task, TASK_IDENTITY_FIELD) != readiness_task_identity(company, domain):
        frappe.throw(frappe._("The readiness Task identity does not match its company and domain."))
    if _value(project, PROJECT_IDENTITY_FIELD) != company:
        frappe.throw(frappe._("The readiness work plan identity does not match its company."))
    if _value(task, "project") != _value(project, "name"):
        frappe.throw(frappe._("The readiness Task does not belong to the selected work plan."))

    doc.company = company
    doc.project = _value(project, "name")
    doc.domain = domain
    doc.responsible_role = ROLE_LABELS[LAUNCH_CHECK_ROLES[domain]]
    doc.reviewer = frappe.session.user
    doc.candidate_reference = (
        str(_value(doc, "candidate_reference") or "").strip() or default_candidate_reference()
    )
    doc.decision_reason = str(_value(doc, "decision_reason") or "").strip()
    doc.qualification_basis = str(_value(doc, "qualification_basis") or "").strip()
    doc.evidence_reference = str(_value(doc, "evidence_reference") or "").strip()

    decision = str(_value(doc, "decision") or "").strip()
    if decision and decision not in REVIEW_DECISIONS:
        frappe.throw(frappe._("Select a valid readiness decision."))
    latest = _latest_submitted(
        company,
        doc.project,
        _value(task, "name"),
        domain,
        exclude=None if getattr(doc, "is_new", lambda: True)() else _value(doc, "name"),
    )
    _throw_chain_error(decision_chain_error(decision, latest.get("decision") if latest else None))
    doc.supersedes = latest.get("name") if latest else None
    doc.chain_key = receipt_chain_key(_value(task, "name"), doc.supersedes)

    evidence = collect_native_evidence([_value(task, "name")])
    task_evidence = dict(evidence["by_task"].get(_value(task, "name")) or {})
    task_evidence["visibility"] = evidence["visibility"]
    snapshot = build_candidate_snapshot(
        company=company,
        project=project,
        task=task,
        domain=domain,
        candidate_reference=doc.candidate_reference,
        evidence_reference=doc.evidence_reference,
        native_evidence=task_evidence,
    )
    doc.evidence_count = len(task_evidence.get("files") or []) + len(
        task_evidence.get("comments") or []
    )
    doc.candidate_snapshot = _canonical_json(snapshot)
    doc.candidate_digest = snapshot_digest(snapshot)
    return task, project, snapshot, latest


def validate_readiness_review(doc: Any) -> None:
    """Keep a draft coherent without allowing it to become an approval."""

    _prepare_common(doc)
    doc.reviewed_at = None
    doc.receipt_digest = None


def finalize_readiness_review(doc: Any) -> None:
    """Freeze the reviewer assertion and exact candidate before submit."""

    _task, _project, _snapshot, _latest = _prepare_common(doc)
    decision = str(_value(doc, "decision") or "").strip()
    if decision not in REVIEW_DECISIONS:
        frappe.throw(frappe._("Select a readiness decision before submitting."))
    if not bool(_value(doc, "authority_confirmed")):
        frappe.throw(frappe._("Confirm your authority before submitting this review."))
    if not doc.decision_reason:
        frappe.throw(frappe._("Explain the decision before submitting this review."))
    if decision in ACCEPTING_DECISIONS:
        if not doc.qualification_basis:
            frappe.throw(frappe._("Record the qualification and authority basis for this decision."))
        if not doc.evidence_reference:
            frappe.throw(frappe._("Identify the evidence reviewed for this decision."))

    doc.reviewer = frappe.session.user
    doc.reviewed_at = now_datetime()
    receipt = {
        "schema_version": 1,
        "company": doc.company,
        "project": doc.project,
        "task": doc.task,
        "domain": doc.domain,
        "decision": decision,
        "decision_reason": doc.decision_reason,
        "responsible_role": doc.responsible_role,
        "reviewer": doc.reviewer,
        "reviewed_at": doc.reviewed_at,
        "authority_confirmed": True,
        "qualification_basis": doc.qualification_basis,
        "evidence_reference": doc.evidence_reference,
        "evidence_count": doc.evidence_count,
        "candidate_reference": doc.candidate_reference,
        "candidate_digest": doc.candidate_digest,
        "supersedes": doc.supersedes,
        "chain_key": doc.chain_key,
    }
    doc.receipt_digest = snapshot_digest(receipt)


def _parse_snapshot(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def review_state_for_work(
    *,
    company: str,
    project: Any,
    tasks: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Return latest visible receipts and whether their candidate still matches."""

    result = {
        "available": False,
        "can_read": False,
        "can_create": False,
        "query_error": False,
        "by_domain": {},
        "decision_is_launch_approval": False,
    }
    if not _doctype_exists(REVIEW_DOCTYPE):
        return result
    result["can_read"] = bool(frappe.has_permission(REVIEW_DOCTYPE, "read"))
    result["can_create"] = bool(
        result["can_read"] and frappe.has_permission(REVIEW_DOCTYPE, "create")
    )
    result["available"] = result["can_read"]
    if not result["can_read"] or not tasks:
        return result

    task_names = [task.get("name") for task in tasks.values() if task.get("name")]
    try:
        rows = frappe.get_list(
            REVIEW_DOCTYPE,
            filters={
                "company": company,
                "project": _value(project, "name"),
                "task": ["in", task_names],
                "docstatus": 1,
            },
            fields=[
                "name",
                "task",
                "domain",
                "decision",
                "candidate_reference",
                "candidate_digest",
                "candidate_snapshot",
                "evidence_reference",
                "reviewer",
                "reviewed_at",
                "supersedes",
            ],
            order_by="reviewed_at desc, creation desc",
            limit=0,
        )
        evidence = collect_native_evidence(task_names)
        for row in rows:
            domain = _value(row, "domain")
            if domain not in tasks or domain in result["by_domain"]:
                continue
            task = tasks[domain]
            current_task_evidence = dict(evidence["by_task"].get(task.get("name")) or {})
            current_task_evidence["visibility"] = evidence["visibility"]
            original = _parse_snapshot(_value(row, "candidate_snapshot"))
            original_visibility = ((original.get("evidence") or {}).get("visibility") or {})
            visibility_matches = original_visibility == evidence["visibility"]
            verification = "not-visible"
            if visibility_matches:
                current = build_candidate_snapshot(
                    company=company,
                    project=project,
                    task=task,
                    domain=domain,
                    candidate_reference=_value(row, "candidate_reference") or "",
                    evidence_reference=_value(row, "evidence_reference") or "",
                    native_evidence=current_task_evidence,
                )
                verification = (
                    "current"
                    if snapshot_digest(current) == _value(row, "candidate_digest")
                    else "stale"
                )
            decision = _value(row, "decision")
            result["by_domain"][domain] = {
                "name": _value(row, "name"),
                "decision": decision,
                "candidate_reference": _value(row, "candidate_reference"),
                "reviewer": _value(row, "reviewer"),
                "reviewed_at": _value(row, "reviewed_at"),
                "supersedes": _value(row, "supersedes"),
                "verification": verification,
                "reopen_required": bool(
                    decision in ACCEPTING_DECISIONS and verification == "stale"
                ),
                "route": ["Form", REVIEW_DOCTYPE, _value(row, "name")],
                "decision_is_launch_approval": False,
            }
        return result
    except Exception:
        frappe.log_error(title="bunood_theme: readiness review query stood down")
        result.update(query_error=True, by_domain={})
        return result


def prepare_readiness_decision(company: str, domain: str) -> dict[str, Any]:
    """Create or reopen a permission-safe draft receipt for one native Task."""

    company = (company or "").strip()
    domain = (domain or "").strip()
    if domain not in READINESS_DOMAINS:
        frappe.throw(frappe._("Select a valid readiness domain."))
    if not _doctype_exists(REVIEW_DOCTYPE):
        frappe.throw(frappe._("Run the latest Bunood migration before recording a review."))
    if not frappe.has_permission(REVIEW_DOCTYPE, "create"):
        frappe.throw(
            frappe._("You do not have permission to record readiness reviews."),
            frappe.PermissionError,
        )

    # Local import avoids making the native work module depend on this receipt
    # module during installation and observation-only operation.
    from bunood_theme.readiness_work import get_readiness_work

    work = get_readiness_work(company)
    task = (work.get("tasks") or {}).get(domain)
    project = work.get("project")
    if not work.get("available") or not task or not project:
        frappe.throw(frappe._("Create and open the readiness work plan before recording a review."))

    drafts = frappe.get_list(
        REVIEW_DOCTYPE,
        filters={"company": company, "project": project["name"], "task": task["name"], "docstatus": 0},
        fields=["name"],
        order_by="modified desc",
        limit=1,
    )
    if drafts:
        name = _value(drafts[0], "name")
        return {"created": False, "name": name, "route": ["Form", REVIEW_DOCTYPE, name]}

    latest = _latest_submitted(company, project["name"], task["name"], domain)
    values = {
        "doctype": REVIEW_DOCTYPE,
        "company": company,
        "project": project["name"],
        "task": task["name"],
        "domain": domain,
        "decision": "Reopened" if latest and latest.get("decision") in ACCEPTING_DECISIONS else "",
        "supersedes": latest.get("name") if latest else None,
        "candidate_reference": default_candidate_reference(),
    }
    review = frappe.get_doc(values).insert()
    return {
        "created": True,
        "name": review.name,
        "route": ["Form", REVIEW_DOCTYPE, review.name],
    }
