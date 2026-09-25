import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parents[1]))


fake_frappe = types.ModuleType("frappe")
fake_frappe.utils = types.ModuleType("frappe.utils")
fake_frappe.utils.add_days = lambda value, days: (value, days)
fake_frappe.utils.nowdate = lambda: "2026-09-20"
fake_frappe.utils.now_datetime = lambda: "2026-09-20 12:00:00"
fake_frappe._ = lambda value: value
fake_frappe.local = types.SimpleNamespace(site="rc20.localhost")
fake_frappe.DuplicateEntryError = type("DuplicateEntryError", (Exception,), {})
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
    readiness_review = importlib.import_module("bunood_theme.readiness_review")

sys.modules.pop("bunood_theme.readiness_review", None)


class ReadinessReviewPolicyTests(unittest.TestCase):
    def _snapshot(self, *, task_modified="2026-09-20 10:00:00", evidence=None):
        return readiness_review.build_candidate_snapshot(
            company="Bunood Development",
            project={
                "name": "PROJ-1",
                "status": "Open",
                "modified": "2026-09-20 09:00:00",
                "readiness_identity": "Bunood Development",
            },
            task={
                "name": "TASK-1",
                "status": "Pending Review",
                "modified": task_modified,
                "readiness_identity": "Bunood Development::accounting",
            },
            domain="accounting",
            candidate_reference="rc20.localhost | release 2026.09.20",
            evidence_reference="Trial balance review packet TB-2026-09",
            native_evidence=evidence
            or {
                "visibility": {"files": True, "comments": True},
                "files": [{"name": "FILE-1", "content_hash": "abc"}],
                "comments": [{"name": "COMMENT-1", "modified": "2026-09-20"}],
            },
        )

    def test_candidate_digest_binds_site_assets_task_and_evidence(self):
        first = self._snapshot()
        self.assertEqual(first["site"], "rc20.localhost")
        self.assertEqual(first["task"]["readiness_identity"], "Bunood Development::accounting")
        self.assertIn("desk_js", first["app"]["assets"])
        digest = readiness_review.snapshot_digest(first)
        self.assertEqual(len(digest), 64)

        changed_task = self._snapshot(task_modified="2026-09-20 11:00:00")
        self.assertNotEqual(digest, readiness_review.snapshot_digest(changed_task))
        changed_evidence = self._snapshot(
            evidence={
                "visibility": {"files": True, "comments": True},
                "files": [{"name": "FILE-2", "content_hash": "def"}],
                "comments": [],
            }
        )
        self.assertNotEqual(digest, readiness_review.snapshot_digest(changed_evidence))

    def test_decision_chain_requires_explicit_reopening(self):
        self.assertEqual(readiness_review.decision_chain_error("Accepted", None), "")
        self.assertEqual(
            readiness_review.decision_chain_error("Accepted", "Accepted"),
            "accepted-receipt-must-be-reopened-first",
        )
        self.assertEqual(readiness_review.decision_chain_error("Reopened", "Accepted"), "")
        self.assertEqual(
            readiness_review.decision_chain_error("Reopened", "Needs Work"),
            "reopen-requires-current-acceptance",
        )
        self.assertEqual(readiness_review.decision_chain_error("Accepted", "Reopened"), "")

    def test_receipt_chain_key_is_fixed_width_and_prevents_sibling_successors(self):
        task = "TASK-" + ("very-long-name-" * 20)
        root = readiness_review.receipt_chain_key(task, None)
        first_successor = readiness_review.receipt_chain_key(task, "BND-RR-2026-00001")
        duplicate_successor = readiness_review.receipt_chain_key(task, "BND-RR-2026-00001")
        other_successor = readiness_review.receipt_chain_key(task, "BND-RR-2026-00002")

        self.assertEqual(len(root), 64)
        self.assertEqual(first_successor, duplicate_successor)
        self.assertNotEqual(root, first_successor)
        self.assertNotEqual(first_successor, other_successor)

    def test_default_candidate_reference_is_exact_not_a_generic_version_label(self):
        reference = readiness_review.default_candidate_reference()
        self.assertIn("rc20.localhost", reference)
        self.assertIn("bunood_theme 0.46.35-test", reference)
        self.assertIn("bunood.", reference)
        self.assertIn("bunood-print.", reference)

    def test_acceptance_submission_requires_authority_qualification_and_evidence(self):
        complete = {
            "decision": "Accepted",
            "authority_confirmed": True,
            "decision_reason": "Balances and controls reconciled.",
            "qualification_basis": "Company finance reviewer for this close.",
            "evidence_reference": "TB-2026-09 signed packet",
            "company": "Bunood Development",
            "project": "PROJ-1",
            "task": "TASK-1",
            "domain": "accounting",
            "responsible_role": "Finance reviewer",
            "reviewer": None,
            "reviewed_at": None,
            "evidence_count": 2,
            "candidate_reference": "rc20.localhost | release 2026.09.20",
            "candidate_digest": "a" * 64,
            "supersedes": None,
            "chain_key": "b" * 64,
            "receipt_digest": None,
        }

        def throw(message, *_args, **_kwargs):
            raise RuntimeError(message)

        with (
            patch.object(readiness_review, "_prepare_common", return_value=(None, None, {}, None)),
            patch.object(
                readiness_review.frappe,
                "session",
                types.SimpleNamespace(user="finance@example.com"),
                create=True,
            ),
            patch.object(readiness_review.frappe, "throw", throw, create=True),
        ):
            for field, expected in [
                ("authority_confirmed", "Confirm your authority"),
                ("decision_reason", "Explain the decision"),
                ("qualification_basis", "qualification and authority basis"),
                ("evidence_reference", "Identify the evidence"),
            ]:
                values = dict(complete)
                values[field] = False if field == "authority_confirmed" else ""
                with self.assertRaisesRegex(RuntimeError, expected):
                    readiness_review.finalize_readiness_review(types.SimpleNamespace(**values))

            doc = types.SimpleNamespace(**complete)
            readiness_review.finalize_readiness_review(doc)

        self.assertEqual(doc.reviewer, "finance@example.com")
        self.assertEqual(doc.reviewed_at, "2026-09-20 12:00:00")
        self.assertEqual(len(doc.receipt_digest), 64)

    def test_draft_validation_cannot_retain_a_submitted_receipt_identity(self):
        doc = types.SimpleNamespace(reviewed_at="old", receipt_digest="c" * 64)
        with patch.object(
            readiness_review,
            "_prepare_common",
            return_value=(None, None, {}, None),
        ):
            readiness_review.validate_readiness_review(doc)
        self.assertIsNone(doc.reviewed_at)
        self.assertIsNone(doc.receipt_digest)


if __name__ == "__main__":
    unittest.main()
