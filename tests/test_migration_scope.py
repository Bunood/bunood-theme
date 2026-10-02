import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parents[1]))

fake_frappe = types.ModuleType("frappe")
fake_frappe.utils = types.ModuleType("frappe.utils")
fake_frappe.utils.now_datetime = lambda: "2026-09-20 15:30:00"
fake_frappe._ = lambda value: value
fake_frappe.local = types.SimpleNamespace(site="migration.localhost")
fake_frappe.conf = {"db_name": "migration_production", "bunood_migration_rehearsal": 1}
fake_frappe.session = types.SimpleNamespace(user="implementer@example.com")
fake_frappe.PermissionError = type("PermissionError", (Exception,), {})
fake_frappe.DuplicateEntryError = type("DuplicateEntryError", (Exception,), {})
fake_frappe._dict = lambda values=None, **kwargs: types.SimpleNamespace(**(values or kwargs))
fake_package = types.ModuleType("bunood_theme")
fake_package.__path__ = [str(Path(__file__).parents[1] / "bunood_theme")]
fake_package.__version__ = "0.46.35-test"

with patch.dict(
    sys.modules,
    {
        "frappe": fake_frappe,
        "frappe.utils": fake_frappe.utils,
        "bunood_theme": fake_package,
    },
):
    migration_scope = importlib.import_module("bunood_theme.migration_scope")
    migration_rehearsal = importlib.import_module("bunood_theme.migration_rehearsal")
    migration_reconciliation = importlib.import_module("bunood_theme.migration_reconciliation")

sys.modules.pop("bunood_theme.migration_scope", None)
sys.modules.pop("bunood_theme.migration_rehearsal", None)
sys.modules.pop("bunood_theme.migration_reconciliation", None)


def dataset(**overrides):
    values = {
        "name": "ROW-1",
        "dependency_stage": migration_scope.DEPENDENCY_STAGES[0],
        "dataset_name": "Company masters",
        "load_method": "Data Import",
        "target_doctype": "Customer",
        "import_type": "Insert New Records",
        "identity_rule_reference": "identity://customer/tax-id-source-key-v1",
        "duplicate_disposition": "Reject existing matches",
        "source_entity": "customers.csv",
        "source_snapshot_hash": "a" * 64,
        "source_row_count": 12,
        "mapping_version": "customers-v1",
        "source_owner": "owner@example.com",
        "material_opening": False,
        "reviewer": "",
        "manifest_reference": "manifest://customers/sha256",
        "profiling_reference": "evidence://customers/profile-v1",
        "control_total_reference": "",
        "notes": "",
    }
    values.update(overrides)
    return types.SimpleNamespace(**values)


def migration_run(**overrides):
    values = {
        "name": "BND-MIG-2026-00001",
        "docstatus": 0,
        "title": "",
        "company": "Bunood Development",
        "strategy": "Open Transactions plus Opening",
        "source_system": "Legacy ERP",
        "source_timezone": "Asia/Riyadh",
        "source_date_convention": "Gregorian YYYY-MM-DD",
        "source_encoding": "UTF-8",
        "cutover_at": "2026-10-01 00:00:00",
        "candidate_reference": "migration.localhost | release candidate 1",
        "scope_reason": "Open transactions and approved openings; history remains archived.",
        "business_owner": "owner@example.com",
        "implementation_lead": "implementer@example.com",
        "security_privacy_reviewer": "security@example.com",
        "authority_confirmed": True,
        "datasets": [dataset()],
        "duplicate_policy": "VAT number plus approved source key; no display-name-only match.",
        "late_entry_policy": "Freeze source; approved delta extract after freeze.",
        "archive_reference": "archive://legacy/read-only-2026-09-30",
        "retention_policy": "Retain according to approved company and Saudi requirements.",
        "freeze_window_start": "2026-09-30 18:00:00",
        "freeze_window_end": "2026-10-01 08:00:00",
        "maximum_outage_minutes": 120,
        "maximum_data_loss_minutes": 0,
        "rollback_method": "Restore complete pre-run site",
        "rollback_point_reference": "decision://cutover/rollback-v1",
        "rollback_owner": "administrator@example.com",
        "backup_reference": "backup://verified/pre-run-2026-09-30",
        "control_state": "Draft",
        "prepared_by": None,
        "prepared_at": None,
        "dataset_count": 0,
        "scope_digest": None,
        "receipt_digest": None,
        "scope_snapshot": None,
        "source_site": None,
        "source_database_digest": None,
        "supersedes_migration_run": "",
        "prior_rehearsal_receipt_digest": "",
        "correction_reason": "",
    }
    values.update(overrides)
    return types.SimpleNamespace(**values)


def reconciliation_controls():
    return [
        types.SimpleNamespace(
            idx=index,
            domain=domain,
            control_key=f"{domain} control",
            applicability="Applicable",
            control_measure="Count",
            unit="records",
            source_value=2,
            native_value=2,
            variance=0,
            status="Pending",
            source_evidence_reference="source://approved/control",
            native_evidence_reference="report://native/control",
            native_report_filters="company=Bunood Development; as_of=2026-09-30",
            not_applicable_reason="",
            variance_owner="",
            variance_cause="",
            corrective_action="",
            rerun_reference="",
        )
        for index, domain in enumerate(migration_reconciliation.RECONCILIATION_DOMAINS, 1)
    ]


class MigrationScopePolicyTests(unittest.TestCase):
    def setUp(self):
        self.throw_patch = patch.object(
            migration_scope.frappe,
            "throw",
            lambda message, *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(message)),
            create=True,
        )
        self.throw_patch.start()

    def tearDown(self):
        self.throw_patch.stop()

    def test_dependency_order_accepts_subset_and_rejects_reversal(self):
        ordered = migration_run(
            datasets=[
                dataset(name="ROW-1", dataset_name="Parties", dependency_stage=migration_scope.DEPENDENCY_STAGES[3]),
                dataset(name="ROW-2", dataset_name="Items", source_entity="items.csv", dependency_stage=migration_scope.DEPENDENCY_STAGES[4]),
            ]
        )
        migration_scope.validate_migration_run(ordered)
        self.assertEqual(ordered.dataset_count, 2)

        reversed_run = migration_run(datasets=list(reversed(ordered.datasets)))
        with self.assertRaisesRegex(RuntimeError, "required dependency order"):
            migration_scope.validate_migration_run(reversed_run)

    def test_snapshot_digest_binds_source_mapping_candidate_and_assets(self):
        run = migration_run()
        snapshot = migration_scope.build_migration_snapshot(run)
        digest = migration_scope.snapshot_digest(snapshot)
        self.assertEqual(len(digest), 64)
        self.assertIn("desk_js", snapshot["app"]["assets"])
        self.assertEqual(snapshot["claim_boundary"], "mapped-scope-only-not-imported-reconciled-or-accepted")

        changed_hash = migration_run(datasets=[dataset(source_snapshot_hash="b" * 64)])
        changed_mapping = migration_run(datasets=[dataset(mapping_version="customers-v2")])
        changed_candidate = migration_run(candidate_reference="migration.localhost | release candidate 2")
        self.assertNotEqual(digest, migration_scope.snapshot_digest(migration_scope.build_migration_snapshot(changed_hash)))
        self.assertNotEqual(digest, migration_scope.snapshot_digest(migration_scope.build_migration_snapshot(changed_mapping)))
        self.assertNotEqual(digest, migration_scope.snapshot_digest(migration_scope.build_migration_snapshot(changed_candidate)))

    def test_data_import_identity_is_stable_and_candidate_specific(self):
        run = migration_run()
        first = migration_scope.migration_data_import_identity(run, run.datasets[0])
        second = migration_scope.migration_data_import_identity(run, run.datasets[0])
        changed = migration_scope.migration_data_import_identity(
            run, dataset(source_snapshot_hash="b" * 64)
        )
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)
        self.assertNotEqual(first, changed)

    def test_submission_freezes_mapped_packet_without_import_claim(self):
        run = migration_run(
            datasets=[
                dataset(
                    material_opening=True,
                    reviewer="finance@example.com",
                    control_total_reference="approved://ar/control-total-2026-09",
                )
            ]
        )
        migration_scope.finalize_migration_run(run)
        self.assertEqual(run.control_state, "mapped")
        self.assertEqual(run.prepared_by, "implementer@example.com")
        self.assertEqual(run.prepared_at, "2026-09-20 15:30:00")
        self.assertEqual(run.dataset_count, 1)
        self.assertEqual(len(run.scope_digest), 64)
        self.assertEqual(len(run.receipt_digest), 64)
        self.assertIn("mapped-scope-only-not-imported-reconciled-or-accepted", run.scope_snapshot)
        self.assertEqual(run.source_site, "migration.localhost")
        self.assertEqual(len(run.source_database_digest), 64)

    def test_material_opening_requires_distinct_reviewer_and_control_totals(self):
        same_reviewer = migration_run(
            datasets=[
                dataset(
                    material_opening=True,
                    reviewer="implementer@example.com",
                    control_total_reference="approved://stock/total",
                )
            ]
        )
        with self.assertRaisesRegex(RuntimeError, "different from the packet submitter"):
            migration_scope.finalize_migration_run(same_reviewer)

        no_totals = migration_run(
            datasets=[dataset(material_opening=True, reviewer="finance@example.com")]
        )
        with self.assertRaisesRegex(RuntimeError, "approved control totals"):
            migration_scope.finalize_migration_run(no_totals)

    def test_duplicate_disposition_is_explicit_and_matches_native_import_type(self):
        missing_identity = migration_run(
            datasets=[dataset(identity_rule_reference="")]
        )
        with self.assertRaisesRegex(RuntimeError, "stable identity rule"):
            migration_scope.finalize_migration_run(missing_identity)

        mismatched = migration_run(
            datasets=[
                dataset(
                    import_type="Update Existing Records",
                    duplicate_disposition="Reject existing matches",
                )
            ]
        )
        with self.assertRaisesRegex(RuntimeError, "duplicate disposition must match"):
            migration_scope.finalize_migration_run(mismatched)

    def test_corrected_packet_requires_receipt_lineage_and_material_change(self):
        class Prior(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked_permission = permission

        predecessor = Prior(
            **migration_run(
                name="BND-MIG-2026-00001",
                docstatus=1,
                control_state="mapped",
            ).__dict__
        )
        corrected = migration_run(
            name="BND-MIG-2026-00002",
            supersedes_migration_run=predecessor.name,
            prior_rehearsal_receipt_digest="d" * 64,
            correction_reason="Correct rejected identity rows.",
        )
        with patch.object(
            migration_scope.frappe, "get_doc", return_value=predecessor, create=True
        ):
            with self.assertRaisesRegex(RuntimeError, "must change the frozen source"):
                migration_scope._validate_correction_lineage(corrected)

            corrected.datasets[0].source_snapshot_hash = "b" * 64
            migration_scope._validate_correction_lineage(corrected)

        self.assertEqual(predecessor.checked_permission, "read")

    def test_correction_draft_copies_controls_without_claiming_authority(self):
        class Prior(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked_permission = permission

        predecessor = Prior(
            **migration_run(
                name="BND-MIG-2026-00001",
                docstatus=1,
                control_state="mapped",
            ).__dict__
        )
        captured = {}

        class Draft(types.SimpleNamespace):
            name = "BND-MIG-2026-00002"

            def insert(self):
                captured["inserted"] = True

        def get_doc(*args):
            if len(args) == 2:
                return predecessor
            captured.update(args[0])
            return Draft(**args[0])

        with (
            patch.object(migration_scope.frappe, "get_doc", side_effect=get_doc, create=True),
            patch.object(
                migration_scope.frappe, "has_permission", return_value=True, create=True
            ),
        ):
            result = migration_scope.prepare_corrected_migration_packet(
                predecessor.name,
                "e" * 64,
                "Replace rejected rows after controlled correction.",
            )

        self.assertTrue(captured["inserted"])
        self.assertEqual(captured["supersedes_migration_run"], predecessor.name)
        self.assertEqual(captured["authority_confirmed"], 0)
        self.assertTrue(result["requires_material_change"])
        self.assertFalse(result["production_import_authorized"])

    def test_native_handoff_creates_empty_draft_and_never_starts_import(self):
        run = migration_run(docstatus=1, control_state="mapped")
        inserted = {}

        class Run(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked_permission = permission

        class NativeImport:
            name = "Customer Import on 2026-09-20"

            def __init__(self, values):
                inserted.update(values)

            def insert(self):
                inserted["insert_called"] = True

        controlled_run = Run(**run.__dict__)

        def get_doc(*args):
            if len(args) == 2:
                return controlled_run
            return NativeImport(args[0])

        with (
            patch.object(migration_scope, "_submitted_snapshot_is_current", return_value=True),
            patch.object(migration_scope, "_visible_company", return_value=True),
            patch.object(migration_scope, "_fields_installed", return_value=True),
            patch.object(migration_scope.frappe, "get_doc", side_effect=get_doc, create=True),
            patch.object(migration_scope.frappe, "has_permission", return_value=True, create=True),
            patch.object(migration_scope.frappe, "get_list", return_value=[], create=True),
        ):
            result = migration_scope.prepare_native_data_import(
                controlled_run.name, controlled_run.datasets[0].name
            )

        self.assertEqual(controlled_run.checked_permission, "read")
        self.assertTrue(inserted["insert_called"])
        self.assertNotIn("import_file", inserted)
        self.assertNotIn("google_sheets_url", inserted)
        self.assertFalse(result["preview_completed"])
        self.assertFalse(result["import_started"])
        self.assertFalse(result["reconciled"])
        self.assertFalse(result["accepted"])


class MigrationRehearsalPolicyTests(unittest.TestCase):
    def setUp(self):
        self.throw_patch = patch.object(
            migration_rehearsal.frappe,
            "throw",
            lambda message, *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError(message)),
            create=True,
        )
        self.throw_patch.start()

    def tearDown(self):
        self.throw_patch.stop()

    def test_rehearsal_requires_a_different_site_and_database(self):
        run = migration_run(
            source_site="production.localhost",
            source_database_digest="a" * 64,
        )
        with (
            patch.object(migration_rehearsal.frappe, "conf", {"bunood_migration_rehearsal": 0}),
            patch.object(
                migration_rehearsal,
                "runtime_environment_identity",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "rehearsal mode is disabled"):
                migration_rehearsal._isolated_environment(run)

        with patch.object(
            migration_rehearsal,
            "runtime_environment_identity",
            return_value={"site": "production.localhost", "database_digest": "b" * 64},
        ):
            with self.assertRaisesRegex(RuntimeError, "frozen source site"):
                migration_rehearsal._isolated_environment(run)

        with patch.object(
            migration_rehearsal,
            "runtime_environment_identity",
            return_value={"site": "rehearsal.localhost", "database_digest": "a" * 64},
        ):
            with self.assertRaisesRegex(RuntimeError, "frozen source database"):
                migration_rehearsal._isolated_environment(run)

        with patch.object(
            migration_rehearsal,
            "runtime_environment_identity",
            return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
        ):
            result = migration_rehearsal._isolated_environment(run)
        self.assertEqual(result["site"], "rehearsal.localhost")

    def test_start_uses_exact_frozen_file_and_native_import_on_clone(self):
        content = b"ID,Customer Name\nCUST-1,Example\n"
        file_hash = migration_rehearsal.hashlib.sha256(content).hexdigest()
        row = dataset(source_snapshot_hash=file_hash)
        run = migration_run(
            docstatus=1,
            control_state="mapped",
            source_site="production.localhost",
            source_database_digest="a" * 64,
            datasets=[row],
        )
        native_started = []

        class NativeImport(types.SimpleNamespace):
            def check_permission(self, permission):
                self.permissions = getattr(self, "permissions", []) + [permission]

            def start_import(self):
                native_started.append(True)
                return True

        identity = migration_scope.migration_data_import_identity(run, row)
        native = NativeImport(
            name="Customer Import on clone",
            status="Pending",
            import_file="/private/files/customers.csv",
            google_sheets_url="",
            reference_doctype="Customer",
            import_type=row.import_type,
            custom_bunood_migration_run=run.name,
            custom_bunood_migration_dataset=row.dataset_name,
            custom_bunood_source_snapshot_hash=row.source_snapshot_hash,
            custom_bunood_mapping_version=row.mapping_version,
            custom_bunood_migration_identity=identity,
        )

        class File(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked = permission

            def get_content(self):
                return content

        class Rehearsal(types.SimpleNamespace):
            name = "BND-REH-2026-00001"

            def insert(self):
                self.inserted = True

        created = {}

        def get_doc(*args):
            if len(args) == 1 and isinstance(args[0], dict):
                created.update(args[0])
                return Rehearsal(flags=types.SimpleNamespace(), **args[0])
            if args[0] == migration_scope.DATA_IMPORT_DOCTYPE:
                return native
            if args[0] == "File":
                return File(name=args[1])
            raise AssertionError(args)

        def get_list(doctype, **_kwargs):
            if doctype == migration_scope.DATA_IMPORT_DOCTYPE:
                return [{"name": native.name}]
            if doctype == "File":
                return [{"name": "FILE-1"}]
            if doctype == migration_rehearsal.REHEARSAL_DOCTYPE:
                return []
            raise AssertionError(doctype)

        with (
            patch.object(migration_rehearsal, "_mapped_context", return_value=(run, row)),
            patch.object(
                migration_rehearsal,
                "runtime_environment_identity",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
            patch.object(migration_rehearsal.frappe, "get_doc", side_effect=get_doc, create=True),
            patch.object(migration_rehearsal.frappe, "get_list", side_effect=get_list, create=True),
            patch.object(migration_rehearsal.frappe, "has_permission", return_value=True, create=True),
        ):
            result = migration_rehearsal.start_isolated_migration_rehearsal(run.name, row.name)

        self.assertTrue(native_started)
        self.assertEqual(created["actual_file_hash"], file_hash)
        self.assertTrue(created["isolated_environment"])
        self.assertTrue(result["native_job_enqueued"])
        self.assertFalse(result["production_import_authorized"])

    def test_row_receipt_hashes_sensitive_native_errors(self):
        rows = migration_rehearsal._privacy_minimised_results(
            [
                {
                    "row_indexes": "[4, 5]",
                    "success": 0,
                    "messages": ["Customer national ID 1234567890 is invalid"],
                    "exception": "Sensitive traceback",
                    "import_action": "Insert",
                    "docname": "CUST-0001",
                }
            ]
        )
        encoded = repr(rows)
        self.assertEqual(rows[0]["row_numbers"], [4, 5])
        self.assertEqual(rows[0]["outcome"], "Failure")
        self.assertEqual(len(rows[0]["message_digest"]), 64)
        self.assertNotIn("1234567890", encoded)
        self.assertNotIn("Sensitive traceback", encoded)
        self.assertNotIn("CUST-0001", encoded)
        self.assertEqual(len(rows[0]["target_record_digest"]), 64)

    def test_terminal_success_becomes_submitted_dry_run_receipt(self):
        row = dataset()
        run = migration_run(
            docstatus=1,
            control_state="mapped",
            source_site="production.localhost",
            source_database_digest="a" * 64,
            datasets=[row],
            scope_digest="c" * 64,
        )
        native = types.SimpleNamespace(name="Customer Import on clone")

        class Rehearsal(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked_permission = permission

            def set(self, fieldname, value):
                setattr(self, fieldname, value)

            def append(self, fieldname, value):
                getattr(self, fieldname).append(types.SimpleNamespace(**value))

            def save(self):
                migration_rehearsal.validate_rehearsal_document(self)
                self.saved = True

            def submit(self):
                migration_rehearsal.validate_rehearsal_document(self)
                self.docstatus = 1
                self.submitted = True

        receipt = Rehearsal(
            name="BND-REH-2026-00001",
            docstatus=0,
            flags=types.SimpleNamespace(),
            migration_run=run.name,
            dataset_row=row.name,
            data_import=native.name,
            control_state="running",
            source_site=run.source_site,
            source_database_digest=run.source_database_digest,
            rehearsal_site="rehearsal.localhost",
            rehearsal_database_digest="b" * 64,
            isolated_environment=1,
            scope_digest=run.scope_digest,
            rehearsal_identity="d" * 64,
            actual_file_hash=row.source_snapshot_hash,
            identity_rule_reference=row.identity_rule_reference,
            duplicate_disposition=row.duplicate_disposition,
            row_results=[],
        )
        native_result = {
            "status": "Success",
            "total_records": 1,
            "success": 1,
            "failed": 0,
            "inserted": 1,
            "updated": 0,
        }
        logs = [
            {
                "row_indexes": "[2]",
                "success": 1,
                "messages": [],
                "exception": "",
                "import_action": "Insert",
                "docname": "CUST-0001",
            }
        ]
        with (
            patch.object(migration_rehearsal.frappe, "get_doc", return_value=receipt, create=True),
            patch.object(
                migration_rehearsal,
                "runtime_environment_identity",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
            patch.object(migration_rehearsal, "_mapped_context", return_value=(run, row)),
            patch.object(
                migration_rehearsal,
                "_isolated_environment",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
            patch.object(migration_rehearsal, "_native_import", return_value=native),
            patch.object(
                migration_rehearsal,
                "_file_hash",
                return_value=("/private/files/customers.csv", row.source_snapshot_hash),
            ),
            patch.object(migration_rehearsal, "_native_result", return_value=(native_result, logs)),
        ):
            result = migration_rehearsal.capture_isolated_migration_rehearsal(receipt.name)

        self.assertEqual(receipt.docstatus, 1)
        self.assertEqual(receipt.control_state, "dry-run-validated")
        self.assertEqual(receipt.result_count, 1)
        self.assertEqual(len(receipt.result_digest), 64)
        self.assertIn("isolated-rehearsal-only-not-production", receipt.result_snapshot)
        self.assertTrue(result["dry_run_validated"])
        self.assertFalse(result["production_import_authorized"])
        self.assertFalse(result["reconciled"])
        self.assertFalse(result["accepted"])

    def test_failed_row_download_delegates_to_native_export_after_receipt_guards(self):
        row = dataset()
        run = migration_run(
            docstatus=1,
            control_state="mapped",
            source_site="production.localhost",
            source_database_digest="a" * 64,
            datasets=[row],
            scope_digest="c" * 64,
        )
        native = types.SimpleNamespace(name="Customer Import on clone")

        class Rehearsal(types.SimpleNamespace):
            def check_permission(self, permission):
                self.checked_permission = permission

        receipt = Rehearsal(
            name="BND-REH-2026-00002",
            docstatus=1,
            migration_run=run.name,
            dataset_row=row.name,
            data_import=native.name,
            control_state="exception",
            failed_records=2,
            rehearsal_site="rehearsal.localhost",
            rehearsal_database_digest="b" * 64,
            isolated_environment=1,
            actual_file_hash=row.source_snapshot_hash,
        )
        with (
            patch.object(migration_rehearsal.frappe, "get_doc", return_value=receipt, create=True),
            patch.object(
                migration_rehearsal,
                "runtime_environment_identity",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
            patch.object(migration_rehearsal, "_mapped_context", return_value=(run, row)),
            patch.object(
                migration_rehearsal,
                "_isolated_environment",
                return_value={"site": "rehearsal.localhost", "database_digest": "b" * 64},
            ),
            patch.object(migration_rehearsal, "_native_import", return_value=native),
            patch.object(
                migration_rehearsal,
                "_file_hash",
                return_value=("/private/files/customers.csv", row.source_snapshot_hash),
            ),
            patch.object(
                migration_rehearsal,
                "_native_failed_rows_download",
                return_value="native-download-response",
            ) as native_download,
        ):
            result = migration_rehearsal.download_isolated_migration_failed_rows(receipt.name)

        self.assertEqual(receipt.checked_permission, "read")
        native_download.assert_called_once_with(native.name)
        self.assertEqual(result, "native-download-response")

    def test_failed_row_download_rejects_unsubmitted_or_nonfailure_receipts(self):
        cases = (
            {"docstatus": 0, "control_state": "exception", "failed_records": 1},
            {"docstatus": 1, "control_state": "dry-run-validated", "failed_records": 0},
            {"docstatus": 1, "control_state": "exception", "failed_records": 0},
        )

        for values in cases:
            with self.subTest(**values):
                receipt = types.SimpleNamespace(
                    name="BND-REH-2026-00003",
                    check_permission=lambda permission: None,
                    **values,
                )
                with patch.object(
                    migration_rehearsal.frappe,
                    "get_doc",
                    return_value=receipt,
                    create=True,
                ):
                    with self.assertRaises(RuntimeError):
                        migration_rehearsal.download_isolated_migration_failed_rows(receipt.name)

    def test_reconciliation_controls_require_complete_evidence_and_owned_variances(self):
        doc = types.SimpleNamespace(controls=reconciliation_controls())
        summary = migration_reconciliation._summarise_controls(doc, submitting=True)
        self.assertEqual(summary["state"], "reconciled")
        self.assertEqual(summary["exact"], len(migration_reconciliation.RECONCILIATION_DOMAINS))
        self.assertEqual(doc.control_state, "reconciled")

        variance = doc.controls[0]
        variance.native_value = 3
        with self.assertRaisesRegex(RuntimeError, "owner, cause"):
            migration_reconciliation._summarise_controls(doc, submitting=True)
        variance.variance_owner = "finance@example.com"
        variance.variance_cause = "Source cutover entry was omitted"
        variance.corrective_action = "Correct the frozen source and rehearse again"
        variance.rerun_reference = "BND-MIG-2026-00002"
        summary = migration_reconciliation._summarise_controls(doc, submitting=True)
        self.assertEqual(summary["state"], "exception")
        self.assertEqual(summary["variance"], 1)
        self.assertEqual(variance.variance, "1")

    def test_reconciliation_requires_successful_receipt_for_every_native_dataset(self):
        first = dataset()
        second = dataset(
            name="ROW-2",
            dataset_name="Items",
            source_entity="items.csv",
            source_snapshot_hash="b" * 64,
        )
        run = migration_run(
            name="BND-MIG-2026-00001",
            docstatus=1,
            control_state="mapped",
            scope_digest="c" * 64,
            datasets=[first, second],
        )
        rows = [
            {
                "name": "BND-REH-2026-00001",
                "dataset_row": first.name,
                "dataset_name": first.dataset_name,
                "scope_digest": run.scope_digest,
                "rehearsal_site": "rehearsal.localhost",
                "rehearsal_database_digest": "d" * 64,
                "result_digest": "e" * 64,
                "receipt_digest": "f" * 64,
                "actual_file_hash": first.source_snapshot_hash,
                "completed_at": "2026-09-20 16:00:00",
            }
        ]
        with patch.object(
            migration_reconciliation.frappe,
            "get_list",
            return_value=rows,
            create=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Items"):
                migration_reconciliation._successful_rehearsal_snapshot(
                    run,
                    {"site": "rehearsal.localhost", "database_digest": "d" * 64},
                )

    def test_material_opening_reconciliation_requires_distinct_reviewer(self):
        doc = types.SimpleNamespace(
            migration_run="BND-MIG-2026-00001",
            controls=reconciliation_controls(),
            material_opening_present=1,
            prepared_by="implementer@example.com",
            authority_confirmed=1,
            qualification_basis="Qualified finance reviewer for the approved opening schedules",
            decision_reason="All applicable source and native controls agree exactly",
            evidence_reference="evidence://migration/reconciliation-pack-v1",
            company="Bunood Development",
            candidate_reference="candidate-1",
            cutover_at="2026-09-30 23:59:59",
            scope_digest="a" * 64,
            source_site="production.localhost",
            source_database_digest="b" * 64,
            reconciliation_site="rehearsal.localhost",
            reconciliation_database_digest="c" * 64,
            rehearsal_digest="d" * 64,
            rehearsal_count=1,
            prepared_at="2026-09-20 15:00:00",
        )
        with patch.object(migration_reconciliation, "_refresh_bound_context"):
            with self.assertRaisesRegex(RuntimeError, "different from the preparer"):
                migration_reconciliation.finalize_migration_reconciliation(doc)

            doc.prepared_by = "data-owner@example.com"
            migration_reconciliation.finalize_migration_reconciliation(doc)

        self.assertEqual(doc.control_state, "reconciled")
        self.assertEqual(doc.reviewer, "implementer@example.com")
        self.assertEqual(len(doc.receipt_digest), 64)
        self.assertIn("not-production-cutover", doc.result_snapshot)


if __name__ == "__main__":
    unittest.main()
