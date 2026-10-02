"""Candidate-bound migration scope packets and safe native Data Import handoff.

The packet records planning and mapping evidence only.  It is deliberately not
an importer, staging ledger, dry-run engine, reconciliation result or go-live
approval.  ERPNext native documents, permissions, validation and ledgers remain
authoritative throughout the eventual migration lifecycle.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

import frappe
from frappe import _
from frappe.utils import now_datetime

from bunood_theme import __version__
from bunood_theme.assets import PRINT_CSS, THEME_CSS, THEME_JS
from bunood_theme.custom_fields import ensure_custom_fields, fields_installed


MIGRATION_RUN_DOCTYPE = "Bunood Migration Run"
MIGRATION_DATASET_DOCTYPE = "Bunood Migration Dataset"
DATA_IMPORT_DOCTYPE = "Data Import"
DATA_IMPORT_METHOD = "Data Import"

DEPENDENCY_STAGES = (
    "company-fiscal-year-currency-naming-and-legal-identity",
    "chart-dimensions-tax-accounts-and-defaults",
    "uom-groups-warehouses-and-operational-dimensions",
    "customers-suppliers-addresses-contacts-and-terms",
    "items-variants-barcodes-serial-batch-and-bom-dependencies",
    "price-lists-item-prices-and-commercial-policies",
    "opening-stock-through-native-stock-reconciliation-or-approved-stock-documents",
    "opening-ar-ap-through-opening-invoice-tool-or-approved-native-alternative",
    "cash-bank-advances-and-remaining-trial-balance-without-double-counting",
    "assets-and-other-approved-modules",
    "users-permissions-integrations-and-operational-queues",
)

DEPENDENCY_STAGE_LABELS = (
    "01 — Company, fiscal year and legal identity",
    "02 — Chart, dimensions, tax and defaults",
    "03 — Units, groups, warehouses and dimensions",
    "04 — Customers, suppliers, addresses and terms",
    "05 — Items, variants, barcodes, serials and batches",
    "06 — Price lists, item prices and policies",
    "07 — Opening stock through native stock documents",
    "08 — Opening receivables and payables through native tools",
    "09 — Cash, bank, advances and remaining trial balance",
    "10 — Assets and other approved modules",
    "11 — Users, permissions, integrations and queues",
)

DEPENDENCY_LABEL_TO_STAGE = dict(zip(DEPENDENCY_STAGE_LABELS, DEPENDENCY_STAGES, strict=True))

IMPORT_TYPES = (
    "Insert New Records",
    "Update Existing Records",
    "Insert or Update Records",
)

DUPLICATE_DISPOSITION_BY_IMPORT_TYPE = {
    "Insert New Records": "Reject existing matches",
    "Update Existing Records": "Update approved matches only",
    "Insert or Update Records": "Insert unmatched and update approved matches",
}

RUN_COPY_FIELDS = (
    "company",
    "strategy",
    "source_system",
    "cutover_at",
    "source_timezone",
    "source_date_convention",
    "source_encoding",
    "candidate_reference",
    "scope_reason",
    "business_owner",
    "implementation_lead",
    "security_privacy_reviewer",
    "duplicate_policy",
    "late_entry_policy",
    "archive_reference",
    "retention_policy",
    "freeze_window_start",
    "freeze_window_end",
    "maximum_outage_minutes",
    "maximum_data_loss_minutes",
    "rollback_method",
    "rollback_point_reference",
    "rollback_owner",
    "backup_reference",
)

DATASET_COPY_FIELDS = (
    "dependency_stage",
    "dataset_name",
    "load_method",
    "target_doctype",
    "import_type",
    "identity_rule_reference",
    "duplicate_disposition",
    "source_entity",
    "source_snapshot_hash",
    "source_row_count",
    "mapping_version",
    "source_owner",
    "material_opening",
    "reviewer",
    "manifest_reference",
    "profiling_reference",
    "control_total_reference",
    "notes",
)

CUSTOM_FIELDS = {
    DATA_IMPORT_DOCTYPE: (
        {
            "fieldname": "custom_bunood_migration_section",
            "label": "Bunood Migration Packet",
            "fieldtype": "Section Break",
            "insert_after": "mute_emails",
            "collapsible": 1,
        },
        {
            "fieldname": "custom_bunood_migration_run",
            "label": "Migration Run",
            "fieldtype": "Link",
            "options": MIGRATION_RUN_DOCTYPE,
            "insert_after": "custom_bunood_migration_section",
            "read_only": 1,
            "no_copy": 1,
            "search_index": 1,
        },
        {
            "fieldname": "custom_bunood_migration_dataset",
            "label": "Migration Dataset",
            "fieldtype": "Data",
            "insert_after": "custom_bunood_migration_run",
            "read_only": 1,
            "no_copy": 1,
        },
        {
            "fieldname": "custom_bunood_source_snapshot_hash",
            "label": "Source Snapshot SHA-256",
            "fieldtype": "Data",
            "insert_after": "custom_bunood_migration_dataset",
            "read_only": 1,
            "no_copy": 1,
        },
        {
            "fieldname": "custom_bunood_mapping_version",
            "label": "Mapping Version",
            "fieldtype": "Data",
            "insert_after": "custom_bunood_source_snapshot_hash",
            "read_only": 1,
            "no_copy": 1,
        },
        {
            "fieldname": "custom_bunood_migration_identity",
            "label": "Bunood Migration Identity",
            "fieldtype": "Data",
            "insert_after": "custom_bunood_mapping_version",
            "hidden": 1,
            "read_only": 1,
            "no_copy": 1,
            "unique": 1,
            "search_index": 1,
        },
    )
}

_SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _value(row: Any, fieldname: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(fieldname, default)
    getter = getattr(row, "get", None)
    if callable(getter):
        return getter(fieldname, default)
    return getattr(row, fieldname, default)


def _set(row: Any, fieldname: str, value: Any) -> None:
    setter = getattr(row, "set", None)
    if callable(setter):
        setter(fieldname, value)
    else:
        setattr(row, fieldname, value)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _canonical_stage(value: Any) -> str:
    cleaned = _clean(value)
    return DEPENDENCY_LABEL_TO_STAGE.get(cleaned, cleaned)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def snapshot_digest(snapshot: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(snapshot).encode("utf-8")).hexdigest()


def default_candidate_reference() -> str:
    site = _clean(getattr(getattr(frappe, "local", None), "site", "")) or "site-unavailable"
    assets = ",".join(path.rsplit("/", 1)[-1] for path in (THEME_CSS, PRINT_CSS, THEME_JS))
    return f"{site} | bunood_theme {__version__} | {assets}"


def runtime_environment_identity() -> dict[str, str]:
    """Return a non-secret identity for the current site database.

    The raw database name is never persisted.  The digest exists so a native
    rehearsal can prove that it is running on a different database from the
    mapped source packet; a different site label alone is not sufficient
    because two labels can still point at one database.
    """

    site = _clean(getattr(getattr(frappe, "local", None), "site", ""))
    conf = getattr(frappe, "conf", None)
    getter = getattr(conf, "get", None)
    database_name = _clean(getter("db_name") if callable(getter) else getattr(conf, "db_name", ""))
    database_digest = (
        hashlib.sha256(f"bunood-database-v1:{database_name}".encode("utf-8")).hexdigest()
        if database_name
        else ""
    )
    return {"site": site, "database_digest": database_digest}


def migration_data_import_identity(run: Any, dataset: Any) -> str:
    """Stable identity for idempotent native Data Import draft preparation."""

    return snapshot_digest(
        {
            "migration_run": _value(run, "name"),
            "dataset_row": _value(dataset, "name"),
            "source_snapshot_hash": _value(dataset, "source_snapshot_hash"),
            "mapping_version": _value(dataset, "mapping_version"),
            "target_doctype": _value(dataset, "target_doctype"),
            "import_type": _value(dataset, "import_type"),
        }
    )


def build_migration_snapshot(doc: Any) -> dict[str, Any]:
    """Build the immutable scope input without copying source business data."""

    datasets = []
    for row in list(_value(doc, "datasets", []) or []):
        dataset_snapshot = {
                "dependency_stage": _canonical_stage(_value(row, "dependency_stage")),
                "dataset_name": _clean(_value(row, "dataset_name")),
                "load_method": _clean(_value(row, "load_method")),
                "target_doctype": _clean(_value(row, "target_doctype")),
                "import_type": _clean(_value(row, "import_type")),
                "source_entity": _clean(_value(row, "source_entity")),
                "source_snapshot_hash": _clean(_value(row, "source_snapshot_hash")),
                "source_row_count": int(_value(row, "source_row_count", 0) or 0),
                "mapping_version": _clean(_value(row, "mapping_version")),
                "source_owner": _clean(_value(row, "source_owner")),
                "material_opening": bool(_value(row, "material_opening")),
                "reviewer": _clean(_value(row, "reviewer")),
                "manifest_reference": _clean(_value(row, "manifest_reference")),
                "profiling_reference": _clean(_value(row, "profiling_reference")),
                "control_total_reference": _clean(_value(row, "control_total_reference")),
                "notes": _clean(_value(row, "notes")),
            }
        identity_rule_reference = _clean(_value(row, "identity_rule_reference"))
        duplicate_disposition = _clean(_value(row, "duplicate_disposition"))
        # Preserve the digest of packets frozen before the duplicate-decision
        # fields existed. Such packets cannot start a new rehearsal, but their
        # immutable historical digest must remain verifiable.
        if identity_rule_reference or duplicate_disposition:
            dataset_snapshot["identity_rule_reference"] = identity_rule_reference
            dataset_snapshot["duplicate_disposition"] = duplicate_disposition
        datasets.append(dataset_snapshot)

    snapshot = {
        "schema_version": 1,
        "claim_boundary": "mapped-scope-only-not-imported-reconciled-or-accepted",
        "site": _clean(getattr(getattr(frappe, "local", None), "site", "")),
        "candidate_reference": _clean(_value(doc, "candidate_reference")),
        "app": {
            "name": "bunood_theme",
            "version": __version__,
            "assets": {
                "desk_css": THEME_CSS.rsplit("/", 1)[-1],
                "print_css": PRINT_CSS.rsplit("/", 1)[-1],
                "desk_js": THEME_JS.rsplit("/", 1)[-1],
            },
        },
        "scope": {
            "company": _clean(_value(doc, "company")),
            "strategy": _clean(_value(doc, "strategy")),
            "source_system": _clean(_value(doc, "source_system")),
            "source_timezone": _clean(_value(doc, "source_timezone")),
            "source_date_convention": _clean(_value(doc, "source_date_convention")),
            "source_encoding": _clean(_value(doc, "source_encoding")),
            "cutover_at": _value(doc, "cutover_at"),
            "scope_reason": _clean(_value(doc, "scope_reason")),
        },
        "owners": {
            "business_owner": _clean(_value(doc, "business_owner")),
            "implementation_lead": _clean(_value(doc, "implementation_lead")),
            "security_privacy_reviewer": _clean(_value(doc, "security_privacy_reviewer")),
        },
        "data_policy": {
            "duplicate_policy": _clean(_value(doc, "duplicate_policy")),
            "late_entry_policy": _clean(_value(doc, "late_entry_policy")),
            "archive_reference": _clean(_value(doc, "archive_reference")),
            "retention_policy": _clean(_value(doc, "retention_policy")),
        },
        "cutover_and_recovery": {
            "freeze_window_start": _value(doc, "freeze_window_start"),
            "freeze_window_end": _value(doc, "freeze_window_end"),
            "maximum_outage_minutes": int(_value(doc, "maximum_outage_minutes", 0) or 0),
            "maximum_data_loss_minutes": int(
                _value(doc, "maximum_data_loss_minutes", 0) or 0
            ),
            "rollback_method": _clean(_value(doc, "rollback_method")),
            "rollback_point_reference": _clean(_value(doc, "rollback_point_reference")),
            "rollback_owner": _clean(_value(doc, "rollback_owner")),
            "backup_reference": _clean(_value(doc, "backup_reference")),
        },
        "datasets": datasets,
    }
    supersedes = _clean(_value(doc, "supersedes_migration_run"))
    prior_receipt = _clean(_value(doc, "prior_rehearsal_receipt_digest"))
    correction_reason = _clean(_value(doc, "correction_reason"))
    if supersedes or prior_receipt or correction_reason:
        snapshot["recovery_lineage"] = {
            "supersedes_migration_run": supersedes,
            "prior_rehearsal_receipt_digest": prior_receipt,
            "correction_reason": correction_reason,
        }
    source_site = _clean(_value(doc, "source_site"))
    source_database_digest = _clean(_value(doc, "source_database_digest"))
    if source_site or source_database_digest:
        snapshot["source_environment"] = {
            "site": source_site,
            "database_digest": source_database_digest,
        }
    return snapshot


def _throw(message: str, exc: Any = None) -> None:
    if exc is None:
        frappe.throw(message)
    frappe.throw(message, exc)


def _require(value: Any, message: str) -> None:
    if not _clean(value):
        _throw(message)


def _validate_dataset_order_and_identity(doc: Any, *, submission: bool) -> None:
    stage_rank = {stage: index for index, stage in enumerate(DEPENDENCY_STAGES)}
    previous_rank = -1
    names: set[str] = set()
    source_keys: set[tuple[str, str]] = set()

    for row in list(_value(doc, "datasets", []) or []):
        stage = _canonical_stage(_value(row, "dependency_stage"))
        name = _clean(_value(row, "dataset_name"))
        load_method = _clean(_value(row, "load_method"))
        source_entity = _clean(_value(row, "source_entity"))
        source_hash = _clean(_value(row, "source_snapshot_hash")).lower()
        _set(row, "source_snapshot_hash", source_hash)

        if stage not in stage_rank:
            _throw(_("Select a valid dependency stage for every dataset."))
        if stage_rank[stage] < previous_rank:
            _throw(_("Keep datasets in the required dependency order."))
        previous_rank = stage_rank[stage]
        if name in names:
            _throw(_("Dataset names must be unique within a migration packet."))
        names.add(name)
        source_key = (stage, source_entity)
        if source_entity and source_key in source_keys:
            _throw(_("A source entity can appear only once in the same dependency stage."))
        source_keys.add(source_key)

        row_count = int(_value(row, "source_row_count", 0) or 0)
        if row_count < 0:
            _throw(_("Source row counts cannot be negative."))
        if source_hash and not _SHA256.fullmatch(source_hash):
            _throw(_("Every source snapshot hash must be a lowercase SHA-256 value."))

        if load_method == DATA_IMPORT_METHOD:
            if submission:
                _require(_value(row, "target_doctype"), _("Select a target DocType for each Data Import dataset."))
                _require(_value(row, "import_type"), _("Select an import type for each Data Import dataset."))
            import_type = _clean(_value(row, "import_type"))
            if import_type and import_type not in IMPORT_TYPES:
                _throw(_("Select a valid native Data Import type."))
            if submission:
                _require(
                    _value(row, "identity_rule_reference"),
                    _("Reference the approved stable identity rule for every Data Import dataset."),
                )
                expected_disposition = DUPLICATE_DISPOSITION_BY_IMPORT_TYPE.get(import_type)
                if _clean(_value(row, "duplicate_disposition")) != expected_disposition:
                    _throw(
                        _(
                            "The duplicate disposition must match the selected native Data Import type."
                        )
                    )
        elif _value(row, "import_type"):
            _set(row, "import_type", None)
            _set(row, "identity_rule_reference", None)
            _set(row, "duplicate_disposition", None)

        if not submission:
            continue
        for fieldname, message in (
            ("dataset_name", _("Name every dataset before submitting.")),
            ("load_method", _("Select a native load path for every dataset.")),
            ("source_entity", _("Identify the source entity for every dataset.")),
            ("source_snapshot_hash", _("Record the frozen source SHA-256 for every dataset.")),
            ("mapping_version", _("Record the mapping version for every dataset.")),
            ("source_owner", _("Assign a data owner for every dataset.")),
            ("manifest_reference", _("Reference the extract manifest for every dataset.")),
            ("profiling_reference", _("Reference profiling and mapping evidence for every dataset.")),
        ):
            _require(_value(row, fieldname), message)
        if bool(_value(row, "material_opening")):
            _require(_value(row, "reviewer"), _("Assign a reviewer for every material opening dataset."))
            _require(
                _value(row, "control_total_reference"),
                _("Reference approved control totals for every material opening dataset."),
            )
            if _clean(_value(row, "reviewer")) == _clean(frappe.session.user):
                _throw(_("The reviewer for material opening data must be different from the packet submitter."))


def _normalize(doc: Any) -> None:
    for fieldname in (
        "company",
        "strategy",
        "source_system",
        "source_timezone",
        "source_date_convention",
        "source_encoding",
        "candidate_reference",
        "scope_reason",
        "business_owner",
        "implementation_lead",
        "security_privacy_reviewer",
        "duplicate_policy",
        "late_entry_policy",
        "archive_reference",
        "retention_policy",
        "rollback_method",
        "rollback_point_reference",
        "rollback_owner",
        "backup_reference",
        "supersedes_migration_run",
        "prior_rehearsal_receipt_digest",
        "correction_reason",
    ):
        _set(doc, fieldname, _clean(_value(doc, fieldname)))
    if not _value(doc, "candidate_reference"):
        _set(doc, "candidate_reference", default_candidate_reference())
    if not _value(doc, "source_encoding"):
        _set(doc, "source_encoding", "UTF-8")
    company = _clean(_value(doc, "company"))
    source = _clean(_value(doc, "source_system"))
    _set(doc, "title", " — ".join(part for part in (company, source) if part))


def _correction_material_digest(doc: Any) -> str:
    """Hash only the decisions that can materially change a retry outcome."""

    datasets = []
    for row in list(_value(doc, "datasets", []) or []):
        datasets.append(
            {
                fieldname: _value(row, fieldname)
                for fieldname in (
                    "dependency_stage",
                    "dataset_name",
                    "load_method",
                    "target_doctype",
                    "import_type",
                    "identity_rule_reference",
                    "duplicate_disposition",
                    "source_entity",
                    "source_snapshot_hash",
                    "source_row_count",
                    "mapping_version",
                    "manifest_reference",
                    "profiling_reference",
                    "control_total_reference",
                )
            }
        )
    return snapshot_digest(
        {
            "duplicate_policy": _clean(_value(doc, "duplicate_policy")),
            "datasets": datasets,
        }
    )


def _validate_correction_lineage(doc: Any) -> None:
    predecessor_name = _clean(_value(doc, "supersedes_migration_run"))
    prior_receipt = _clean(_value(doc, "prior_rehearsal_receipt_digest")).lower()
    reason = _clean(_value(doc, "correction_reason"))
    _set(doc, "prior_rehearsal_receipt_digest", prior_receipt)
    if not predecessor_name:
        if prior_receipt or reason:
            _throw(_("Select the migration packet this correction supersedes."))
        return
    if predecessor_name == _clean(_value(doc, "name")):
        _throw(_("A migration packet cannot supersede itself."))
    if not _SHA256.fullmatch(prior_receipt):
        _throw(_("Record the lowercase SHA-256 receipt digest from the prior rehearsal."))
    _require(reason, _("Explain the corrected rows or mapping decision before submitting."))

    predecessor = frappe.get_doc(MIGRATION_RUN_DOCTYPE, predecessor_name)
    predecessor.check_permission("read")
    if int(_value(predecessor, "docstatus", 0) or 0) != 1 or _clean(
        _value(predecessor, "control_state")
    ) != "mapped":
        _throw(_("The superseded migration packet must be a submitted mapped packet."))
    if _clean(_value(predecessor, "company")) != _clean(_value(doc, "company")) or _clean(
        _value(predecessor, "source_system")
    ) != _clean(_value(doc, "source_system")):
        _throw(_("A corrected packet must keep the same company and source system."))
    if _correction_material_digest(predecessor) == _correction_material_digest(doc):
        _throw(
            _(
                "A corrected packet must change the frozen source, mapping, identity rule, duplicate decision, or control evidence."
            )
        )


def validate_migration_run(doc: Any) -> None:
    """Keep a planning draft coherent without manufacturing lifecycle claims."""

    _normalize(doc)
    _validate_dataset_order_and_identity(doc, submission=False)
    _set(doc, "control_state", "Draft")
    for fieldname in (
        "prepared_by",
        "prepared_at",
        "scope_digest",
        "receipt_digest",
        "scope_snapshot",
        "source_site",
        "source_database_digest",
    ):
        _set(doc, fieldname, None)
    _set(doc, "dataset_count", len(list(_value(doc, "datasets", []) or [])))


def finalize_migration_run(doc: Any) -> None:
    """Freeze a mapped scope packet before submit; do not run any import."""

    _normalize(doc)
    if not bool(_value(doc, "authority_confirmed")):
        _throw(_("Confirm your authority and safe-reference statement before submitting."))
    for fieldname, message in (
        ("source_timezone", _("Record the source timezone before submitting.")),
        ("source_date_convention", _("Record the source date convention before submitting.")),
        ("scope_reason", _("Explain the approved scope and exclusions before submitting.")),
        ("business_owner", _("Assign the business owner before submitting.")),
        ("implementation_lead", _("Assign the implementation lead before submitting.")),
        ("security_privacy_reviewer", _("Assign the security and privacy reviewer before submitting.")),
        ("duplicate_policy", _("Record the business identity and duplicate policy before submitting.")),
        ("late_entry_policy", _("Record the late-entry and delta policy before submitting.")),
        ("archive_reference", _("Reference the read-only source archive before submitting.")),
        ("retention_policy", _("Record the retention and disposal policy before submitting.")),
        ("freeze_window_start", _("Record the source freeze start before submitting.")),
        ("freeze_window_end", _("Record the source freeze end before submitting.")),
        ("rollback_method", _("Select the rollback method before submitting.")),
        ("rollback_point_reference", _("Reference the rollback point and decision before submitting.")),
        ("rollback_owner", _("Assign the rollback owner before submitting.")),
        ("backup_reference", _("Reference the verified backup before submitting.")),
    ):
        _require(_value(doc, fieldname), message)
    datasets = list(_value(doc, "datasets", []) or [])
    if not datasets:
        _throw(_("Add at least one dataset before submitting this migration packet."))
    _validate_dataset_order_and_identity(doc, submission=True)
    _validate_correction_lineage(doc)

    environment = runtime_environment_identity()
    _require(environment["site"], _("The current site identity is unavailable."))
    _require(
        environment["database_digest"],
        _("The current database identity is unavailable. Check the site configuration."),
    )
    _set(doc, "source_site", environment["site"])
    _set(doc, "source_database_digest", environment["database_digest"])

    snapshot = build_migration_snapshot(doc)
    scope_digest = snapshot_digest(snapshot)
    prepared_at = now_datetime()
    prepared_by = frappe.session.user
    receipt = {
        "schema_version": 1,
        "migration_run": _value(doc, "name"),
        "prepared_by": prepared_by,
        "prepared_at": prepared_at,
        "control_state": "mapped",
        "scope_digest": scope_digest,
        "dataset_count": len(datasets),
        "claim_boundary": "not-dry-run-validated-imported-reconciled-or-accepted",
    }
    _set(doc, "control_state", "mapped")
    _set(doc, "prepared_by", prepared_by)
    _set(doc, "prepared_at", prepared_at)
    _set(doc, "dataset_count", len(datasets))
    _set(doc, "scope_snapshot", _canonical_json(snapshot))
    _set(doc, "scope_digest", scope_digest)
    _set(doc, "receipt_digest", snapshot_digest(receipt))


def prepare_corrected_migration_packet(
    run_name: str, prior_rehearsal_receipt_digest: str, correction_reason: str
) -> dict[str, Any]:
    """Create a permission-checked draft with explicit recovery lineage.

    The draft initially copies the frozen controls so the operator edits only
    the affected dataset. Submission still fails until a material source,
    mapping, identity, duplicate or control-evidence change is recorded.
    """

    predecessor = frappe.get_doc(MIGRATION_RUN_DOCTYPE, run_name)
    predecessor.check_permission("read")
    if int(_value(predecessor, "docstatus", 0) or 0) != 1 or _clean(
        _value(predecessor, "control_state")
    ) != "mapped":
        _throw(_("Create a correction only from a submitted mapped migration packet."))
    if not frappe.has_permission(MIGRATION_RUN_DOCTYPE, "create"):
        _throw(_("You do not have permission to create a corrected migration packet."), frappe.PermissionError)

    receipt_digest = _clean(prior_rehearsal_receipt_digest).lower()
    if not _SHA256.fullmatch(receipt_digest):
        _throw(_("Enter the lowercase SHA-256 receipt digest from the prior rehearsal."))
    _require(correction_reason, _("Explain what will be corrected before creating the draft."))

    values = {
        "doctype": MIGRATION_RUN_DOCTYPE,
        **{fieldname: _value(predecessor, fieldname) for fieldname in RUN_COPY_FIELDS},
        "authority_confirmed": 0,
        "supersedes_migration_run": _value(predecessor, "name"),
        "prior_rehearsal_receipt_digest": receipt_digest,
        "correction_reason": _clean(correction_reason),
        "datasets": [
            {fieldname: _value(row, fieldname) for fieldname in DATASET_COPY_FIELDS}
            for row in list(_value(predecessor, "datasets", []) or [])
        ],
    }
    draft = frappe.get_doc(values)
    draft.insert()
    return {
        "route": ["Form", MIGRATION_RUN_DOCTYPE, draft.name],
        "name": draft.name,
        "created": True,
        "requires_material_change": True,
        "production_import_authorized": False,
    }


def _doctype_exists(doctype: str) -> bool:
    return bool(frappe.db.exists("DocType", doctype))


def _fields_installed() -> bool:
    return fields_installed(frappe, CUSTOM_FIELDS)


def ensure_migration_data_import_fields() -> None:
    """Install deployment-time control references on native Data Import."""

    ensure_custom_fields(frappe, CUSTOM_FIELDS)


def _visible_company(company: str) -> bool:
    if not company or not _doctype_exists("Company") or not frappe.has_permission("Company", "read"):
        return False
    return bool(frappe.get_list("Company", filters={"name": company}, fields=["name"], limit=1))


def _submitted_snapshot_is_current(run: Any) -> bool:
    return _clean(_value(run, "scope_digest")) == snapshot_digest(build_migration_snapshot(run))


def prepare_native_data_import(run_name: str, dataset_row_name: str) -> dict[str, Any]:
    """Create or reuse an empty native Data Import draft with current permissions.

    No file is attached and no preview or import action is invoked.  Native Data
    Import performs its own target-permission and file validation when the user
    continues from the returned draft.
    """

    run = frappe.get_doc(MIGRATION_RUN_DOCTYPE, run_name)
    run.check_permission("read")
    if int(_value(run, "docstatus", 0) or 0) != 1 or _value(run, "control_state") != "mapped":
        _throw(_("Submit a mapped migration packet before preparing Data Import."))
    if not _submitted_snapshot_is_current(run):
        _throw(_("This migration packet no longer matches the current candidate. Create a new packet."))
    if not _visible_company(_clean(_value(run, "company"))):
        _throw(_("You do not have permission to use this company."), frappe.PermissionError)
    if not _fields_installed():
        _throw(_("Migration control fields are not installed. Run the site migration first."))

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
    if _value(dataset, "load_method") != DATA_IMPORT_METHOD:
        _throw(_("This dataset uses a different native load path, not Data Import."))

    target_doctype = _clean(_value(dataset, "target_doctype"))
    if not frappe.has_permission(DATA_IMPORT_DOCTYPE, "create"):
        _throw(_("You do not have permission to create Data Import records."), frappe.PermissionError)
    if not target_doctype or not frappe.has_permission(target_doctype, "import"):
        _throw(_("You do not have import permission for the target DocType."), frappe.PermissionError)

    identity = migration_data_import_identity(run, dataset)
    rows = frappe.get_list(
        DATA_IMPORT_DOCTYPE,
        filters={"custom_bunood_migration_identity": identity},
        fields=["name"],
        limit=1,
    )
    created = False
    name = _value(rows[0], "name") if rows else None
    if not name:
        values = {
            "doctype": DATA_IMPORT_DOCTYPE,
            "reference_doctype": target_doctype,
            "import_type": _value(dataset, "import_type"),
            "custom_bunood_migration_run": _value(run, "name"),
            "custom_bunood_migration_dataset": _value(dataset, "dataset_name"),
            "custom_bunood_source_snapshot_hash": _value(dataset, "source_snapshot_hash"),
            "custom_bunood_mapping_version": _value(dataset, "mapping_version"),
            "custom_bunood_migration_identity": identity,
        }
        try:
            record = frappe.get_doc(values)
            record.insert()
            name = record.name
            created = True
        except frappe.DuplicateEntryError:
            rows = frappe.get_list(
                DATA_IMPORT_DOCTYPE,
                filters={"custom_bunood_migration_identity": identity},
                fields=["name"],
                limit=1,
            )
            if not rows:
                raise
            name = _value(rows[0], "name")

    return {
        "route": ["Form", DATA_IMPORT_DOCTYPE, name],
        "name": name,
        "created": created,
        "preview_completed": False,
        "import_started": False,
        "reconciled": False,
        "accepted": False,
    }
