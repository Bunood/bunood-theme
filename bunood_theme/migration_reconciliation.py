"""Candidate-bound reconciliation receipts for isolated migration rehearsals.

ERPNext documents, ledgers and reports remain the accounting authority.  This
module records exact source-versus-native control comparisons and their evidence;
it does not query around permissions, calculate a parallel ledger, or authorize a
production cutover.  A submitted receipt is immutable and can be either a governed
exception (with owned variances) or an exact reconciliation result.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import now_datetime

from bunood_theme.migration_rehearsal import REHEARSAL_DOCTYPE, _isolated_environment
from bunood_theme.migration_scope import (
    DATA_IMPORT_METHOD,
    MIGRATION_RUN_DOCTYPE,
    _clean,
    _submitted_snapshot_is_current,
    _value,
    _visible_company,
    snapshot_digest,
)


RECONCILIATION_DOCTYPE = "Bunood Migration Reconciliation"
CONTROL_DOCTYPE = "Bunood Migration Control Result"
CONTROL_STATES = frozenset({"Pending", "Exact", "Variance", "Not Applicable"})
APPLICABILITY = frozenset({"Applicable", "Not Applicable"})
MEASURES = frozenset({"Count", "Quantity", "Amount", "Debit", "Credit", "Trace"})

RECONCILIATION_DOMAINS = (
    "Customers and suppliers",
    "Items, barcodes and UOM",
    "Prices and validity",
    "Opening stock quantity and value",
    "Receivables, currency, dates and ageing",
    "Payables, currency, dates and ageing",
    "Trial Balance, dimensions, debits and credits",
    "Cash, bank, advances and open allocations",
    "Assets, depreciation and net book value",
    "VAT and approved tax openings",
    "Cross-ledger document, payment, stock and GL chain",
)

DEFAULT_CONTROLS = (
    (RECONCILIATION_DOMAINS[0], "Distinct active and inactive party count", "Count", "records", "Customer and Supplier lists"),
    (RECONCILIATION_DOMAINS[1], "Approved item, barcode and UOM identity count", "Count", "records", "Item, Barcode and UOM records"),
    (RECONCILIATION_DOMAINS[2], "Approved price rows and validity scope", "Count", "records", "Item Price"),
    (RECONCILIATION_DOMAINS[3], "Opening stock value by approved dimensions", "Amount", "company currency", "Stock Balance and Stock Ledger"),
    (RECONCILIATION_DOMAINS[4], "Opening receivable outstanding by currency and ageing", "Amount", "company currency", "Accounts Receivable and Payment Ledger"),
    (RECONCILIATION_DOMAINS[5], "Opening payable outstanding by currency and ageing", "Amount", "company currency", "Accounts Payable and Payment Ledger"),
    (RECONCILIATION_DOMAINS[6], "Opening debit total by account and dimensions", "Debit", "company currency", "Trial Balance and General Ledger"),
    (RECONCILIATION_DOMAINS[6], "Opening credit total by account and dimensions", "Credit", "company currency", "Trial Balance and General Ledger"),
    (RECONCILIATION_DOMAINS[6], "Temporary Opening and migration clearing balance", "Amount", "company currency", "Trial Balance and General Ledger"),
    (RECONCILIATION_DOMAINS[7], "Cash, bank, advance and open-allocation balance", "Amount", "company currency", "General Ledger and bank or advance reports"),
    (RECONCILIATION_DOMAINS[8], "Opening asset cost", "Amount", "company currency", "Asset records, depreciation schedule and General Ledger"),
    (RECONCILIATION_DOMAINS[8], "Accumulated depreciation", "Amount", "company currency", "Asset records, depreciation schedule and General Ledger"),
    (RECONCILIATION_DOMAINS[8], "Net book value", "Amount", "company currency", "Asset records, depreciation schedule and General Ledger"),
    (RECONCILIATION_DOMAINS[9], "Approved VAT and tax opening balance", "Amount", "company currency", "Tax accounts, Trial Balance and tax reports"),
    (RECONCILIATION_DOMAINS[10], "Orphaned or directly edited ledger links", "Trace", "records", "Source documents, Payment Ledger, Stock Ledger and General Ledger"),
)


def _throw(message: str, exc: Any = None) -> None:
    if exc is None:
        frappe.throw(message)
    frappe.throw(message, exc)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _mark_server_action(doc: Any) -> None:
    flags = getattr(doc, "flags", None)
    if flags is None:
        flags = frappe._dict()
        setattr(doc, "flags", flags)
    setattr(flags, "bunood_reconciliation_action", True)


def _is_new(doc: Any) -> bool:
    checker = getattr(doc, "is_new", None)
    return bool(checker()) if callable(checker) else not bool(_clean(_value(doc, "name")))


def _before_save(doc: Any) -> Any:
    getter = getattr(doc, "get_doc_before_save", None)
    return getter() if callable(getter) else None


def _mapped_run(run_name: str) -> Any:
    run = frappe.get_doc(MIGRATION_RUN_DOCTYPE, run_name)
    run.check_permission("read")
    if int(_value(run, "docstatus", 0) or 0) != 1 or _clean(
        _value(run, "control_state")
    ) != "mapped":
        _throw(_("Select a submitted mapped migration packet."))
    if not _submitted_snapshot_is_current(run):
        _throw(_("This migration packet no longer matches its frozen scope."))
    if not _visible_company(_clean(_value(run, "company"))):
        _throw(_("You do not have permission to use this company."), frappe.PermissionError)
    return run


def _successful_rehearsal_snapshot(run: Any, environment: dict[str, str]) -> dict[str, Any]:
    datasets = [
        row
        for row in list(_value(run, "datasets", []) or [])
        if _clean(_value(row, "load_method")) == DATA_IMPORT_METHOD
    ]
    if not datasets:
        _throw(_("This migration packet has no native Data Import datasets to reconcile."))

    rows = frappe.get_list(
        REHEARSAL_DOCTYPE,
        filters={
            "migration_run": _value(run, "name"),
            "docstatus": 1,
            "control_state": "dry-run-validated",
        },
        fields=[
            "name",
            "dataset_row",
            "dataset_name",
            "scope_digest",
            "rehearsal_site",
            "rehearsal_database_digest",
            "result_digest",
            "receipt_digest",
            "actual_file_hash",
            "completed_at",
        ],
        order_by="dataset_row asc, completed_at desc",
        limit=0,
    )
    by_dataset: dict[str, list[Any]] = {}
    for row in rows:
        by_dataset.setdefault(_clean(_value(row, "dataset_row")), []).append(row)

    missing = [
        _clean(_value(dataset, "dataset_name"))
        for dataset in datasets
        if not by_dataset.get(_clean(_value(dataset, "name")))
    ]
    if missing:
        _throw(
            _("Every native Data Import dataset needs a submitted successful rehearsal before reconciliation: {0}").format(
                ", ".join(missing)
            )
        )

    receipts = []
    for dataset in datasets:
        dataset_row = _clean(_value(dataset, "name"))
        matches = by_dataset[dataset_row]
        if len(matches) != 1:
            _throw(_("The successful rehearsal evidence is ambiguous for dataset {0}.").format(_clean(_value(dataset, "dataset_name"))))
        row = matches[0]
        if (
            _clean(_value(row, "scope_digest")) != _clean(_value(run, "scope_digest"))
            or _clean(_value(row, "rehearsal_site")) != environment["site"]
            or _clean(_value(row, "rehearsal_database_digest"))
            != environment["database_digest"]
        ):
            _throw(_("A successful rehearsal receipt does not match this packet or isolated environment."))
        for fieldname in ("result_digest", "receipt_digest", "actual_file_hash"):
            if not _clean(_value(row, fieldname)):
                _throw(_("A successful rehearsal receipt is missing required integrity evidence."))
        receipts.append(
            {
                "dataset_row": dataset_row,
                "dataset_name": _clean(_value(dataset, "dataset_name")),
                "rehearsal": _clean(_value(row, "name")),
                "result_digest": _clean(_value(row, "result_digest")),
                "receipt_digest": _clean(_value(row, "receipt_digest")),
                "actual_file_hash": _clean(_value(row, "actual_file_hash")),
                "completed_at": _value(row, "completed_at"),
            }
        )
    return {
        "schema_version": 1,
        "migration_run": _value(run, "name"),
        "scope_digest": _value(run, "scope_digest"),
        "environment": environment,
        "receipts": receipts,
    }


def _refresh_bound_context(doc: Any) -> tuple[Any, dict[str, Any], dict[str, str]]:
    run_name = _clean(_value(doc, "migration_run"))
    if not run_name:
        _throw(_("A migration run is required."))
    before = _before_save(doc)
    previous_run = _clean(_value(before, "migration_run")) if before else ""
    if previous_run and previous_run != run_name:
        _throw(_("The migration run bound to a reconciliation packet cannot be changed."))
    run = _mapped_run(run_name)
    environment = _isolated_environment(run)
    rehearsal_snapshot = _successful_rehearsal_snapshot(run, environment)
    rehearsal_digest = snapshot_digest(rehearsal_snapshot)
    existing_digest = _clean(_value(before, "rehearsal_digest")) if before else _clean(
        _value(doc, "rehearsal_digest")
    )
    if existing_digest and existing_digest != rehearsal_digest and not _is_new(doc):
        _throw(_("The successful rehearsal evidence changed. Create a new reconciliation packet."))

    datasets = list(_value(run, "datasets", []) or [])
    doc.title = f"{_clean(_value(run, 'title')) or _clean(_value(run, 'name'))} — {environment['site']}"
    doc.company = _value(run, "company")
    doc.candidate_reference = _value(run, "candidate_reference")
    doc.cutover_at = _value(run, "cutover_at")
    doc.source_site = _value(run, "source_site")
    doc.source_database_digest = _value(run, "source_database_digest")
    doc.reconciliation_site = environment["site"]
    doc.reconciliation_database_digest = environment["database_digest"]
    doc.scope_digest = _value(run, "scope_digest")
    doc.material_opening_present = int(
        any(bool(_value(dataset, "material_opening")) for dataset in datasets)
    )
    doc.rehearsal_count = len(rehearsal_snapshot["receipts"])
    doc.rehearsal_digest = rehearsal_digest
    doc.rehearsal_snapshot = _canonical_json(rehearsal_snapshot)
    if before:
        doc.prepared_by = _value(before, "prepared_by")
        doc.prepared_at = _value(before, "prepared_at")
    return run, rehearsal_snapshot, environment


def _required_text(row: Any, fieldname: str) -> bool:
    return bool(_clean(_value(row, fieldname)))


def _summarise_controls(doc: Any, *, submitting: bool) -> dict[str, int | str]:
    controls = list(_value(doc, "controls", []) or [])
    if not controls:
        _throw(_("Add the migration reconciliation controls."))

    domains_seen: set[str] = set()
    keys_seen: set[tuple[str, str]] = set()
    counts = {"applicable": 0, "exact": 0, "variance": 0, "not_applicable": 0, "pending": 0}

    for row in controls:
        domain = _clean(_value(row, "domain"))
        control_key = _clean(_value(row, "control_key"))
        applicability = _clean(_value(row, "applicability"))
        measure = _clean(_value(row, "control_measure"))
        if domain not in RECONCILIATION_DOMAINS:
            _throw(_("Select a valid reconciliation domain for every control."))
        domains_seen.add(domain)
        if not control_key:
            _throw(_("Name every reconciliation control."))
        identity = (domain, control_key.casefold())
        if identity in keys_seen:
            _throw(_("Reconciliation control names must be unique within each domain."))
        keys_seen.add(identity)

        if applicability not in APPLICABILITY:
            row.status = "Pending"
            counts["pending"] += 1
            continue
        if applicability == "Not Applicable":
            row.variance = "0"
            row.status = "Not Applicable"
            counts["not_applicable"] += 1
            if submitting and not _required_text(row, "not_applicable_reason"):
                _throw(_("Explain why every not-applicable reconciliation control is excluded."))
            continue

        counts["applicable"] += 1
        source_value = _decimal(_value(row, "source_value"))
        native_value = _decimal(_value(row, "native_value"))
        if (
            (_value(row, "source_value") not in (None, "") and source_value is None)
            or (_value(row, "native_value") not in (None, "") and native_value is None)
        ):
            _throw(_("Use plain numeric source and native values without currency symbols or separators."))
        evidence_complete = all(
            _required_text(row, fieldname)
            for fieldname in (
                "unit",
                "source_evidence_reference",
                "native_evidence_reference",
                "native_report_filters",
            )
        )
        if measure not in MEASURES or source_value is None or native_value is None or not evidence_complete:
            row.status = "Pending"
            counts["pending"] += 1
            continue

        variance = native_value - source_value
        row.variance = format(variance, "f")
        if variance == 0:
            row.status = "Exact"
            counts["exact"] += 1
        else:
            row.status = "Variance"
            counts["variance"] += 1
            if submitting and not all(
                _required_text(row, fieldname)
                for fieldname in (
                    "variance_owner",
                    "variance_cause",
                    "corrective_action",
                    "rerun_reference",
                )
            ):
                _throw(_("Every non-zero variance needs an owner, cause, corrective action and rerun reference."))

    missing_domains = [domain for domain in RECONCILIATION_DOMAINS if domain not in domains_seen]
    if missing_domains:
        _throw(_("Cover every reconciliation domain, using Not Applicable with a reason where necessary."))
    if submitting and counts["pending"]:
        _throw(_("Complete every applicable reconciliation value and evidence reference before submitting."))
    if submitting and not counts["applicable"]:
        _throw(_("At least one reconciliation control must be applicable."))

    state = "draft" if counts["pending"] else ("exception" if counts["variance"] else "reconciled")
    counts["state"] = state
    doc.applicable_controls = counts["applicable"]
    doc.exact_controls = counts["exact"]
    doc.variance_controls = counts["variance"]
    doc.not_applicable_controls = counts["not_applicable"]
    doc.pending_controls = counts["pending"]
    doc.control_state = state
    return counts


def _control_snapshot(controls: list[Any]) -> list[dict[str, Any]]:
    fields = (
        "domain",
        "control_key",
        "applicability",
        "control_measure",
        "unit",
        "source_value",
        "native_value",
        "variance",
        "status",
        "source_evidence_reference",
        "native_evidence_reference",
        "native_report_filters",
        "not_applicable_reason",
        "variance_owner",
        "variance_cause",
        "corrective_action",
        "rerun_reference",
    )
    return [
        {fieldname: _value(row, fieldname) for fieldname in fields}
        for row in sorted(controls, key=lambda row: int(_value(row, "idx", 0) or 0))
    ]


def validate_migration_reconciliation(doc: Any) -> None:
    """Keep an editable packet bound to current successful rehearsal evidence."""

    if _is_new(doc) and not bool(
        getattr(getattr(doc, "flags", None), "bunood_reconciliation_action", False)
    ):
        _throw(_("Create migration reconciliation from a submitted successful rehearsal."))
    _refresh_bound_context(doc)
    _summarise_controls(doc, submitting=False)
    doc.decision_reason = _clean(_value(doc, "decision_reason"))
    doc.qualification_basis = _clean(_value(doc, "qualification_basis"))
    doc.evidence_reference = _clean(_value(doc, "evidence_reference"))
    doc.reviewer = None
    doc.reviewed_at = None
    doc.receipt_digest = None
    doc.result_snapshot = None


def finalize_migration_reconciliation(doc: Any) -> None:
    """Freeze an exact or governed-exception reconciliation receipt."""

    _refresh_bound_context(doc)
    counts = _summarise_controls(doc, submitting=True)
    if not bool(_value(doc, "authority_confirmed")):
        _throw(_("Confirm your reconciliation authority before submitting."))
    if not _clean(_value(doc, "qualification_basis")):
        _throw(_("Record the reviewer qualification and authority basis."))
    if not _clean(_value(doc, "decision_reason")):
        _throw(_("Explain the reconciliation conclusion before submitting."))
    if not _clean(_value(doc, "evidence_reference")):
        _throw(_("Identify the protected reconciliation evidence pack."))
    if bool(_value(doc, "material_opening_present")) and _clean(
        _value(doc, "prepared_by")
    ) == _clean(frappe.session.user):
        _throw(_("Material opening reconciliation requires a reviewer different from the preparer."))

    doc.reviewer = frappe.session.user
    doc.reviewed_at = now_datetime()
    result_snapshot = {
        "schema_version": 1,
        "claim_boundary": "reconciliation-evidence-only-not-production-cutover-or-migration-acceptance",
        "migration_run": _value(doc, "migration_run"),
        "company": _value(doc, "company"),
        "candidate_reference": _value(doc, "candidate_reference"),
        "cutover_at": _value(doc, "cutover_at"),
        "scope_digest": _value(doc, "scope_digest"),
        "source_environment": {
            "site": _value(doc, "source_site"),
            "database_digest": _value(doc, "source_database_digest"),
        },
        "reconciliation_environment": {
            "site": _value(doc, "reconciliation_site"),
            "database_digest": _value(doc, "reconciliation_database_digest"),
        },
        "rehearsal_digest": _value(doc, "rehearsal_digest"),
        "rehearsal_count": _value(doc, "rehearsal_count"),
        "control_state": counts["state"],
        "control_counts": {key: counts[key] for key in ("applicable", "exact", "variance", "not_applicable")},
        "controls": _control_snapshot(list(_value(doc, "controls", []) or [])),
        "decision_reason": _clean(_value(doc, "decision_reason")),
        "qualification_basis": _clean(_value(doc, "qualification_basis")),
        "evidence_reference": _clean(_value(doc, "evidence_reference")),
        "prepared_by": _value(doc, "prepared_by"),
        "prepared_at": _value(doc, "prepared_at"),
        "reviewer": doc.reviewer,
        "reviewed_at": doc.reviewed_at,
    }
    doc.result_snapshot = _canonical_json(result_snapshot)
    doc.receipt_digest = snapshot_digest(result_snapshot)


def prepare_migration_reconciliation(rehearsal_name: str) -> dict[str, Any]:
    """Create one permission-safe draft after all packet rehearsals succeed."""

    if not frappe.db.exists("DocType", RECONCILIATION_DOCTYPE):
        _throw(_("Run the latest Bunood migration before preparing reconciliation."))
    if not frappe.has_permission(RECONCILIATION_DOCTYPE, "create"):
        _throw(_("You do not have permission to prepare migration reconciliation."), frappe.PermissionError)

    rehearsal = frappe.get_doc(REHEARSAL_DOCTYPE, rehearsal_name)
    rehearsal.check_permission("read")
    if int(_value(rehearsal, "docstatus", 0) or 0) != 1 or _clean(
        _value(rehearsal, "control_state")
    ) != "dry-run-validated":
        _throw(_("Use a submitted successful rehearsal to prepare reconciliation."))
    run = _mapped_run(_clean(_value(rehearsal, "migration_run")))
    environment = _isolated_environment(run)
    if (
        _clean(_value(rehearsal, "rehearsal_site")) != environment["site"]
        or _clean(_value(rehearsal, "rehearsal_database_digest"))
        != environment["database_digest"]
    ):
        _throw(_("Open reconciliation on the isolated site and database that produced the rehearsals."))
    _successful_rehearsal_snapshot(run, environment)

    existing = frappe.get_list(
        RECONCILIATION_DOCTYPE,
        filters={"migration_run": _value(run, "name")},
        fields=["name", "docstatus", "control_state"],
        order_by="creation desc",
        limit=1,
    )
    if existing:
        row = existing[0]
        return {
            "created": False,
            "name": _value(row, "name"),
            "route": ["Form", RECONCILIATION_DOCTYPE, _value(row, "name")],
            "control_state": _value(row, "control_state"),
        }

    now = now_datetime()
    reconciliation = frappe.get_doc(
        {
            "doctype": RECONCILIATION_DOCTYPE,
            "migration_run": _value(run, "name"),
            "prepared_by": frappe.session.user,
            "prepared_at": now,
            "control_state": "draft",
            "controls": [
                {
                    "domain": domain,
                    "control_key": control_key,
                    "applicability": "",
                    "control_measure": measure,
                    "unit": unit,
                    "native_evidence_reference": native_evidence,
                    "status": "Pending",
                }
                for domain, control_key, measure, unit, native_evidence in DEFAULT_CONTROLS
            ],
        }
    )
    _mark_server_action(reconciliation)
    reconciliation.insert()
    return {
        "created": True,
        "name": reconciliation.name,
        "route": ["Form", RECONCILIATION_DOCTYPE, reconciliation.name],
        "control_state": "draft",
    }
