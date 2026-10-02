"""Isolated native Data Import rehearsals and immutable result receipts.

This module never imports into the mapped source database.  It allows one
native Frappe Data Import to run only after proving that both the current site
name and the one-way database identity differ from the frozen packet.  Native
Data Import remains the mutation and row-log authority; Bunood records a
candidate-bound, privacy-minimised receipt around that result.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import now_datetime

from bunood_theme.migration_scope import (
    DATA_IMPORT_DOCTYPE,
    DATA_IMPORT_METHOD,
    DUPLICATE_DISPOSITION_BY_IMPORT_TYPE,
    MIGRATION_RUN_DOCTYPE,
    _clean,
    _submitted_snapshot_is_current,
    _value,
    _visible_company,
    migration_data_import_identity,
    runtime_environment_identity,
    snapshot_digest,
)


REHEARSAL_DOCTYPE = "Bunood Migration Rehearsal"
TERMINAL_NATIVE_STATES = frozenset({"Success", "Partial Success", "Error", "Timed Out"})
MAX_NATIVE_LOG_ROWS = 5000


def _throw(message: str, exc: Any = None) -> None:
    if exc is None:
        frappe.throw(message)
    frappe.throw(message, exc)


def _require(value: Any, message: str) -> None:
    if not _clean(value):
        _throw(message)


def _mark_server_action(doc: Any) -> None:
    flags = getattr(doc, "flags", None)
    if flags is None:
        flags = frappe._dict()
        setattr(doc, "flags", flags)
    setattr(flags, "bunood_rehearsal_action", True)


def validate_rehearsal_document(doc: Any) -> None:
    """Reject manual construction or edits of machine-issued receipts."""

    flags = getattr(doc, "flags", None)
    if not bool(getattr(flags, "bunood_rehearsal_action", False)):
        _throw(
            _(
                "Migration rehearsals are issued by the isolated rehearsal action and cannot be edited manually."
            )
        )
    for fieldname, message in (
        ("migration_run", _("A migration run is required.")),
        ("dataset_row", _("A migration dataset is required.")),
        ("data_import", _("A native Data Import is required.")),
        ("source_site", _("The frozen source site is required.")),
        ("source_database_digest", _("The frozen source database identity is required.")),
        ("rehearsal_site", _("The rehearsal site is required.")),
        ("rehearsal_database_digest", _("The rehearsal database identity is required.")),
        ("scope_digest", _("The frozen scope digest is required.")),
        ("rehearsal_identity", _("The rehearsal identity is required.")),
        ("identity_rule_reference", _("The approved identity rule reference is required.")),
        ("duplicate_disposition", _("The frozen duplicate disposition is required.")),
    ):
        _require(_value(doc, fieldname), message)
    if not bool(_value(doc, "isolated_environment")):
        _throw(_("The rehearsal environment has not been verified as isolated."))
    if _clean(_value(doc, "source_site")) == _clean(_value(doc, "rehearsal_site")):
        _throw(_("A migration rehearsal cannot run on the frozen source site."))
    if _clean(_value(doc, "source_database_digest")) == _clean(
        _value(doc, "rehearsal_database_digest")
    ):
        _throw(_("A migration rehearsal cannot run on the frozen source database."))


def _rehearsal_mode_enabled() -> bool:
    conf = getattr(frappe, "conf", None)
    getter = getattr(conf, "get", None)
    value = getter("bunood_migration_rehearsal") if callable(getter) else getattr(
        conf, "bunood_migration_rehearsal", None
    )
    return value is True or _clean(value).lower() in {"1", "true", "yes", "on"}


def _mapped_context(run_name: str, dataset_row_name: str) -> tuple[Any, Any]:
    run = frappe.get_doc(MIGRATION_RUN_DOCTYPE, run_name)
    run.check_permission("read")
    if int(_value(run, "docstatus", 0) or 0) != 1 or _clean(
        _value(run, "control_state")
    ) != "mapped":
        _throw(_("Submit a mapped migration packet before starting a rehearsal."))
    if not _submitted_snapshot_is_current(run):
        _throw(_("This migration packet no longer matches its frozen scope."))
    if not _visible_company(_clean(_value(run, "company"))):
        _throw(_("You do not have permission to use this company."), frappe.PermissionError)
    dataset = next(
        (
            row
            for row in list(_value(run, "datasets", []) or [])
            if _clean(_value(row, "name")) == _clean(dataset_row_name)
        ),
        None,
    )
    if dataset is None:
        _throw(_("Select a dataset that belongs to this migration packet."))
    if _clean(_value(dataset, "load_method")) != DATA_IMPORT_METHOD:
        _throw(_("This rehearsal currently supports the native Data Import path only."))
    _require(
        _value(dataset, "identity_rule_reference"),
        _(
            "This packet predates explicit duplicate identity controls. Create and submit a new migration packet."
        ),
    )
    expected_disposition = DUPLICATE_DISPOSITION_BY_IMPORT_TYPE.get(
        _clean(_value(dataset, "import_type"))
    )
    if _clean(_value(dataset, "duplicate_disposition")) != expected_disposition:
        _throw(_("The frozen duplicate disposition does not match the native import type."))
    return run, dataset


def _isolated_environment(run: Any) -> dict[str, str]:
    source_site = _clean(_value(run, "source_site"))
    source_database_digest = _clean(_value(run, "source_database_digest"))
    _require(
        source_site,
        _("This packet predates environment binding. Create and submit a new migration packet."),
    )
    _require(
        source_database_digest,
        _("This packet predates database binding. Create and submit a new migration packet."),
    )
    if not _rehearsal_mode_enabled():
        _throw(
            _(
                "Migration rehearsal mode is disabled. Enable bunood_migration_rehearsal only on the isolated restored site."
            )
        )
    current = runtime_environment_identity()
    _require(current["site"], _("The current rehearsal site identity is unavailable."))
    _require(
        current["database_digest"],
        _("The current rehearsal database identity is unavailable."),
    )
    if current["site"] == source_site:
        _throw(
            _(
                "Blocked: this is the frozen source site. Restore the packet to a separate rehearsal site first."
            )
        )
    if current["database_digest"] == source_database_digest:
        _throw(
            _(
                "Blocked: this site points to the frozen source database. Use a separate restored database."
            )
        )
    return current


def _native_import(run: Any, dataset: Any, *, write: bool) -> Any:
    target_doctype = _clean(_value(dataset, "target_doctype"))
    if not target_doctype or not frappe.has_permission(target_doctype, "import"):
        _throw(_("You do not have import permission for the target DocType."), frappe.PermissionError)

    identity = migration_data_import_identity(run, dataset)
    rows = frappe.get_list(
        DATA_IMPORT_DOCTYPE,
        filters={"custom_bunood_migration_identity": identity},
        fields=["name"],
        limit=1,
    )
    if not rows:
        _throw(
            _(
                "Prepare the native Data Import, attach the frozen file, and restore it to the rehearsal site first."
            )
        )
    data_import = frappe.get_doc(DATA_IMPORT_DOCTYPE, _value(rows[0], "name"))
    data_import.check_permission("read")
    if write:
        data_import.check_permission("write")
    expected = {
        "reference_doctype": target_doctype,
        "import_type": _clean(_value(dataset, "import_type")),
        "custom_bunood_migration_run": _clean(_value(run, "name")),
        "custom_bunood_migration_dataset": _clean(_value(dataset, "dataset_name")),
        "custom_bunood_source_snapshot_hash": _clean(_value(dataset, "source_snapshot_hash")),
        "custom_bunood_mapping_version": _clean(_value(dataset, "mapping_version")),
        "custom_bunood_migration_identity": identity,
    }
    for fieldname, value in expected.items():
        if _clean(_value(data_import, fieldname)) != value:
            _throw(_("The native Data Import no longer matches the frozen migration dataset."))
    return data_import


def _file_hash(data_import: Any) -> tuple[str, str]:
    file_url = _clean(_value(data_import, "import_file"))
    if not file_url:
        if _clean(_value(data_import, "google_sheets_url")):
            _throw(
                _(
                    "Use an attached frozen CSV or spreadsheet for a controlled rehearsal; a live Google Sheet cannot prove the frozen source hash."
                )
            )
        _throw(_("Attach the frozen import file to the native Data Import first."))
    rows = frappe.get_list(
        "File",
        filters={"file_url": file_url},
        fields=["name"],
        limit=1,
    )
    if not rows:
        _throw(_("You do not have permission to read the attached import file."), frappe.PermissionError)
    file_doc = frappe.get_doc("File", _value(rows[0], "name"))
    file_doc.check_permission("read")
    content = file_doc.get_content()
    if isinstance(content, str):
        content = content.encode("utf-8")
    return file_url, hashlib.sha256(content).hexdigest()


def _identity(run: Any, dataset: Any, data_import: Any, environment: dict[str, str], file_hash: str) -> str:
    return snapshot_digest(
        {
            "schema_version": 1,
            "migration_run": _value(run, "name"),
            "scope_digest": _value(run, "scope_digest"),
            "dataset_row": _value(dataset, "name"),
            "data_import": _value(data_import, "name"),
            "source_snapshot_hash": _value(dataset, "source_snapshot_hash"),
            "actual_file_hash": file_hash,
            "identity_rule_reference": _value(dataset, "identity_rule_reference"),
            "duplicate_disposition": _value(dataset, "duplicate_disposition"),
            "rehearsal_site": environment["site"],
            "rehearsal_database_digest": environment["database_digest"],
        }
    )


def start_isolated_migration_rehearsal(run_name: str, dataset_row_name: str) -> dict[str, Any]:
    """Start native Data Import only on a distinct restored site database."""

    run, dataset = _mapped_context(run_name, dataset_row_name)
    environment = _isolated_environment(run)
    data_import = _native_import(run, dataset, write=True)
    if _clean(_value(data_import, "status")) != "Pending":
        _throw(_("Use a pending native Data Import for a new isolated rehearsal."))
    file_reference, actual_hash = _file_hash(data_import)
    expected_hash = _clean(_value(dataset, "source_snapshot_hash"))
    if actual_hash != expected_hash:
        _throw(
            _(
                "The attached file SHA-256 does not match the frozen source snapshot. Create a new packet for changed data."
            )
        )

    rehearsal_identity = _identity(run, dataset, data_import, environment, actual_hash)
    existing = frappe.get_list(
        REHEARSAL_DOCTYPE,
        filters={"rehearsal_identity": rehearsal_identity},
        fields=["name", "docstatus", "control_state"],
        limit=1,
    )
    if existing:
        row = existing[0]
        return {
            "route": ["Form", REHEARSAL_DOCTYPE, _value(row, "name")],
            "name": _value(row, "name"),
            "created": False,
            "native_job_enqueued": False,
            "control_state": _value(row, "control_state"),
            "isolated_environment": True,
            "production_import_authorized": False,
        }

    now = now_datetime()
    rehearsal = frappe.get_doc(
        {
            "doctype": REHEARSAL_DOCTYPE,
            "title": f"{_clean(_value(dataset, 'dataset_name'))} — {environment['site']}",
            "migration_run": _value(run, "name"),
            "dataset_row": _value(dataset, "name"),
            "dataset_name": _value(dataset, "dataset_name"),
            "company": _value(run, "company"),
            "data_import": _value(data_import, "name"),
            "control_state": "running",
            "source_site": _value(run, "source_site"),
            "source_database_digest": _value(run, "source_database_digest"),
            "rehearsal_site": environment["site"],
            "rehearsal_database_digest": environment["database_digest"],
            "isolated_environment": 1,
            "target_doctype": _value(dataset, "target_doctype"),
            "import_type": _value(dataset, "import_type"),
            "mapping_version": _value(dataset, "mapping_version"),
            "identity_rule_reference": _value(dataset, "identity_rule_reference"),
            "duplicate_disposition": _value(dataset, "duplicate_disposition"),
            "source_snapshot_hash": expected_hash,
            "actual_file_hash": actual_hash,
            "file_reference": file_reference,
            "data_import_status": "Pending",
            "scope_digest": _value(run, "scope_digest"),
            "rehearsal_identity": rehearsal_identity,
            "started_by": frappe.session.user,
            "started_at": now,
        }
    )
    _mark_server_action(rehearsal)
    rehearsal.insert()
    native_job_enqueued = bool(data_import.start_import())
    return {
        "route": ["Form", REHEARSAL_DOCTYPE, rehearsal.name],
        "name": rehearsal.name,
        "created": True,
        "native_job_enqueued": native_job_enqueued,
        "control_state": "running",
        "isolated_environment": True,
        "production_import_authorized": False,
    }


def _native_result(data_import_name: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Use Frappe's permission-checked native status and log APIs."""

    from frappe.core.doctype.data_import.data_import import get_import_logs, get_import_status

    return get_import_status(data_import_name), get_import_logs(data_import_name)


def _native_failed_rows_download(data_import_name: str) -> Any:
    """Delegate the response body to Frappe's native failed-row exporter."""

    from frappe.core.doctype.data_import.data_import import download_errored_template

    return download_errored_template(data_import_name)


def _row_numbers(value: Any) -> list[int]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            value = []
    if not isinstance(value, (list, tuple, set)):
        value = []
    numbers = []
    for item in value:
        try:
            number = int(item)
        except (TypeError, ValueError):
            continue
        if number >= 0:
            numbers.append(number)
    return sorted(set(numbers))


def _privacy_minimised_results(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for log in logs:
        rows = _row_numbers(_value(log, "row_indexes"))
        message_digest = snapshot_digest(
            {
                "messages": _value(log, "messages") or [],
                "exception": _clean(_value(log, "exception")),
            }
        )
        result = {
            "row_numbers": rows,
            "outcome": "Success" if bool(_value(log, "success")) else "Failure",
            "import_action": _clean(_value(log, "import_action")),
            "target_record_digest": (
                snapshot_digest({"target_record": _clean(_value(log, "docname"))})
                if _clean(_value(log, "docname"))
                else ""
            ),
            "message_digest": message_digest,
        }
        result["result_digest"] = snapshot_digest(result)
        results.append(result)
    return results


def capture_isolated_migration_rehearsal(rehearsal_name: str) -> dict[str, Any]:
    """Freeze terminal native results without copying sensitive error text."""

    rehearsal = frappe.get_doc(REHEARSAL_DOCTYPE, rehearsal_name)
    rehearsal.check_permission("write")
    if int(_value(rehearsal, "docstatus", 0) or 0) != 0:
        return {
            "route": ["Form", REHEARSAL_DOCTYPE, _value(rehearsal, "name")],
            "completed": True,
            "control_state": _value(rehearsal, "control_state"),
            "dry_run_validated": _value(rehearsal, "control_state") == "dry-run-validated",
            "production_import_authorized": False,
        }

    environment = runtime_environment_identity()
    if environment["site"] != _clean(_value(rehearsal, "rehearsal_site")) or environment[
        "database_digest"
    ] != _clean(_value(rehearsal, "rehearsal_database_digest")):
        _throw(_("Open this rehearsal on the same isolated site and database that started it."))
    if not bool(_value(rehearsal, "isolated_environment")):
        _throw(_("The rehearsal environment has not been verified as isolated."))

    run, dataset = _mapped_context(
        _clean(_value(rehearsal, "migration_run")),
        _clean(_value(rehearsal, "dataset_row")),
    )
    _isolated_environment(run)
    data_import = _native_import(run, dataset, write=False)
    if _clean(_value(data_import, "name")) != _clean(_value(rehearsal, "data_import")):
        _throw(_("The native Data Import does not match this rehearsal."))
    _file_reference, actual_hash = _file_hash(data_import)
    if actual_hash != _clean(_value(rehearsal, "actual_file_hash")):
        _throw(_("The attached native import file changed after the rehearsal started."))

    native_status, native_logs = _native_result(_value(data_import, "name"))
    status = _clean(native_status.get("status"))
    if status == "Pending":
        return {
            "route": ["Form", REHEARSAL_DOCTYPE, _value(rehearsal, "name")],
            "completed": False,
            "control_state": "running",
            "native_status": status,
            "production_import_authorized": False,
        }
    if status not in TERMINAL_NATIVE_STATES:
        _throw(_("The native Data Import returned an unsupported status."))

    total = int(native_status.get("total_records") or 0)
    successful = int(native_status.get("success") or 0)
    failed = int(native_status.get("failed") or 0)
    if successful + failed > len(native_logs):
        _throw(
            _(
                "The native result exceeds the 5,000-row receipt limit. Split the dataset into controlled batches before rehearsal."
            )
        )
    if len(native_logs) > MAX_NATIVE_LOG_ROWS:
        _throw(_("The native result exceeds the controlled receipt limit."))

    row_results = _privacy_minimised_results(native_logs)
    completed_at = now_datetime()
    completed_by = frappe.session.user
    fully_successful = bool(total) and status == "Success" and failed == 0 and successful == total
    control_state = "dry-run-validated" if fully_successful else "exception"
    result_snapshot = {
        "schema_version": 1,
        "claim_boundary": "isolated-rehearsal-only-not-production-imported-reconciled-or-accepted",
        "migration_run": _value(run, "name"),
        "scope_digest": _value(run, "scope_digest"),
        "dataset_row": _value(dataset, "name"),
        "dataset_name": _value(dataset, "dataset_name"),
        "data_import": _value(data_import, "name"),
        "target_doctype": _value(dataset, "target_doctype"),
        "import_type": _value(dataset, "import_type"),
        "mapping_version": _value(dataset, "mapping_version"),
        "identity_rule_reference": _value(dataset, "identity_rule_reference"),
        "duplicate_disposition": _value(dataset, "duplicate_disposition"),
        "source_snapshot_hash": _value(dataset, "source_snapshot_hash"),
        "actual_file_hash": actual_hash,
        "source_environment": {
            "site": _value(run, "source_site"),
            "database_digest": _value(run, "source_database_digest"),
        },
        "rehearsal_environment": environment,
        "native_result": {
            "status": status,
            "total_records": total,
            "successful_records": successful,
            "failed_records": failed,
            "inserted_records": int(native_status.get("inserted") or 0),
            "updated_records": int(native_status.get("updated") or 0),
            "row_results": row_results,
        },
    }
    result_digest = snapshot_digest(result_snapshot)
    receipt = {
        "schema_version": 1,
        "rehearsal_identity": _value(rehearsal, "rehearsal_identity"),
        "result_digest": result_digest,
        "control_state": control_state,
        "completed_by": completed_by,
        "completed_at": completed_at,
        "claim_boundary": result_snapshot["claim_boundary"],
    }

    _mark_server_action(rehearsal)
    rehearsal.control_state = control_state
    rehearsal.data_import_status = status
    rehearsal.total_records = total
    rehearsal.successful_records = successful
    rehearsal.failed_records = failed
    rehearsal.inserted_records = int(native_status.get("inserted") or 0)
    rehearsal.updated_records = int(native_status.get("updated") or 0)
    rehearsal.result_count = len(row_results)
    rehearsal.completed_by = completed_by
    rehearsal.completed_at = completed_at
    rehearsal.result_digest = result_digest
    rehearsal.receipt_digest = snapshot_digest(receipt)
    rehearsal.result_snapshot = json.dumps(
        result_snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    )
    rehearsal.set("row_results", [])
    for result in row_results:
        rehearsal.append(
            "row_results",
            {
                **result,
                "row_numbers": ", ".join(str(number) for number in result["row_numbers"]),
            },
        )
    rehearsal.save()
    _mark_server_action(rehearsal)
    rehearsal.submit()
    return {
        "route": ["Form", REHEARSAL_DOCTYPE, rehearsal.name],
        "completed": True,
        "control_state": control_state,
        "dry_run_validated": fully_successful,
        "production_import_authorized": False,
        "reconciled": False,
        "accepted": False,
    }


def download_isolated_migration_failed_rows(rehearsal_name: str) -> Any:
    """Export native failed rows only from a submitted isolated exception receipt.

    Frappe remains the file-format and row-selection authority. Bunood adds the
    receipt, environment, current-file and permission guards before delegating to
    the native exporter; it never proxies the more sensitive raw import log.
    """

    rehearsal = frappe.get_doc(REHEARSAL_DOCTYPE, rehearsal_name)
    rehearsal.check_permission("read")
    if int(_value(rehearsal, "docstatus", 0) or 0) != 1:
        _throw(_("Capture and submit the isolated rehearsal result before downloading failed rows."))
    if _clean(_value(rehearsal, "control_state")) != "exception" or int(
        _value(rehearsal, "failed_records", 0) or 0
    ) <= 0:
        _throw(_("This rehearsal has no failed rows to download."))
    if not bool(_value(rehearsal, "isolated_environment")):
        _throw(_("The rehearsal environment has not been verified as isolated."))

    environment = runtime_environment_identity()
    if environment["site"] != _clean(_value(rehearsal, "rehearsal_site")) or environment[
        "database_digest"
    ] != _clean(_value(rehearsal, "rehearsal_database_digest")):
        _throw(_("Open this rehearsal on the same isolated site and database that produced it."))

    run, dataset = _mapped_context(
        _clean(_value(rehearsal, "migration_run")),
        _clean(_value(rehearsal, "dataset_row")),
    )
    _isolated_environment(run)
    data_import = _native_import(run, dataset, write=False)
    data_import_name = _clean(_value(data_import, "name"))
    if data_import_name != _clean(_value(rehearsal, "data_import")):
        _throw(_("The native Data Import does not match this rehearsal."))
    _file_reference, actual_hash = _file_hash(data_import)
    if actual_hash != _clean(_value(rehearsal, "actual_file_hash")):
        _throw(_("The attached native import file changed after the rehearsal result was captured."))

    return _native_failed_rows_download(data_import_name)
