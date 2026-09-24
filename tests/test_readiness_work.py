import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parents[1]))


fake_frappe = types.ModuleType("frappe")
fake_frappe.utils = types.ModuleType("frappe.utils")
fake_frappe.utils.add_days = lambda value, days: (value, days)
fake_frappe.utils.nowdate = lambda: "2026-09-20"
fake_frappe.utils.now_datetime = lambda: "2026-09-20 12:00:00"
fake_frappe._ = lambda value: value
fake_frappe.log_error = lambda *args, **kwargs: None
fake_frappe.DuplicateEntryError = type("DuplicateEntryError", (Exception,), {})
fake_package = types.ModuleType("bunood_theme")
fake_package.__path__ = [str(Path(__file__).parents[1] / "bunood_theme")]
fake_package.__version__ = "0.0-test"

with patch.dict(
    sys.modules,
    {
        "frappe": fake_frappe,
        "frappe.utils": fake_frappe.utils,
        "bunood_theme": fake_package,
    },
):
    readiness_work = importlib.import_module("bunood_theme.readiness_work")
    importlib.import_module("bunood_theme.readiness_review")

sys.modules.pop("bunood_theme.readiness_work", None)


class ReadinessWorkPolicyTests(unittest.TestCase):
    def test_domain_identity_is_stable_and_company_scoped(self):
        self.assertEqual(
            readiness_work.readiness_task_identity("Bunood Development", "accounting"),
            "Bunood Development::accounting",
        )
        self.assertEqual(len(readiness_work.READINESS_DOMAINS), 12)
        self.assertEqual(len(set(readiness_work.READINESS_DOMAINS)), 12)

    def test_assignment_json_is_normalized_without_inventing_an_owner(self):
        self.assertEqual(readiness_work.parse_assignees(None), [])
        self.assertEqual(readiness_work.parse_assignees("not-json"), [])
        self.assertEqual(
            readiness_work.parse_assignees('["finance@example.com", "finance@example.com", "owner@example.com"]'),
            ["finance@example.com", "owner@example.com"],
        )

    def test_native_fields_are_hidden_identity_seams_not_a_parallel_ledger(self):
        self.assertEqual(set(readiness_work.CUSTOM_FIELDS), {"Project", "Task"})
        project_fields = {
            row["fieldname"]: row for row in readiness_work.CUSTOM_FIELDS["Project"]
        }
        task_fields = {
            row["fieldname"]: row for row in readiness_work.CUSTOM_FIELDS["Task"]
        }
        self.assertTrue(project_fields[readiness_work.PROJECT_IDENTITY_FIELD]["unique"])
        self.assertTrue(task_fields[readiness_work.TASK_IDENTITY_FIELD]["unique"])
        self.assertEqual(
            task_fields[readiness_work.TASK_DOMAIN_FIELD]["options"].splitlines(),
            [""] + list(readiness_work.READINESS_DOMAINS),
        )
        for fields in (project_fields.values(), task_fields.values()):
            for field in fields:
                self.assertTrue(field["hidden"])
                self.assertTrue(field["read_only"])
                self.assertTrue(field["no_copy"])

    def test_visible_work_plan_comes_from_permission_filtered_native_records(self):
        class Meta:
            @staticmethod
            def has_field(_fieldname):
                return True

        class Database:
            @staticmethod
            def exists(doctype, _filters):
                return bool(doctype in {"DocType", "File"})

        def get_list(doctype, **_kwargs):
            if doctype == "Company":
                return [{"name": "Bunood Development"}]
            if doctype == "Project":
                return [{"name": "PROJ-1", "project_name": "Readiness", "status": "Open"}]
            if doctype == "Task":
                return [{
                    "name": "TASK-1",
                    "subject": "Accounts and dimensions",
                    "status": "Working",
                    "priority": "High",
                    "exp_end_date": "2026-10-04",
                    "_assign": '["finance@example.com"]',
                    readiness_work.TASK_DOMAIN_FIELD: "accounting",
                }]
            if doctype == "File":
                return [{"name": "FILE-1", "attached_to_name": "TASK-1"}]
            return []

        with (
            patch.dict(
                sys.modules,
                {
                    "frappe": fake_frappe,
                    "frappe.utils": fake_frappe.utils,
                    "bunood_theme": fake_package,
                },
            ),
            patch.object(readiness_work.frappe, "db", Database(), create=True),
            patch.object(readiness_work.frappe, "get_meta", lambda _doctype: Meta(), create=True),
            patch.object(readiness_work.frappe, "has_permission", lambda *_args: True, create=True),
            patch.object(readiness_work.frappe, "get_list", get_list, create=True),
        ):
            result = readiness_work.get_readiness_work("Bunood Development")

        self.assertTrue(result["available"])
        self.assertEqual(result["project"]["route"], ["Form", "Project", "PROJ-1"])
        self.assertEqual(result["tasks"]["accounting"]["assignees"], ["finance@example.com"])
        self.assertEqual(result["tasks"]["accounting"]["evidence_count"], 1)
        self.assertFalse(result["completion_is_approval"])

    def test_start_creates_one_native_project_and_twelve_tasks_without_bypass(self):
        inserted = []

        class Database:
            @staticmethod
            def exists(_doctype, _filters):
                return False

        class Document:
            def __init__(self, values):
                self.values = values
                self.name = "PROJ-1" if values["doctype"] == "Project" else values["subject"]

            def insert(self, *args, **kwargs):
                inserted.append((self.values, args, kwargs))
                return self

        initial = {
            "available": True,
            "project": None,
            "tasks": {},
            "can_create": True,
            "can_create_task": True,
        }
        final = {"available": True, "project": {"name": "PROJ-1"}, "tasks": {}}
        with (
            patch.object(readiness_work, "_fields_installed", lambda: True),
            patch.object(readiness_work, "_visible_company", lambda _company: True),
            patch.object(readiness_work, "get_readiness_work", Mock(side_effect=[initial, final])),
            patch.object(readiness_work.frappe, "db", Database(), create=True),
            patch.object(readiness_work.frappe, "get_doc", lambda values: Document(values), create=True),
        ):
            result = readiness_work.start_readiness_review("Bunood Development")

        self.assertTrue(result["created"])
        self.assertEqual(sum(values["doctype"] == "Project" for values, _args, _kwargs in inserted), 1)
        self.assertEqual(sum(values["doctype"] == "Task" for values, _args, _kwargs in inserted), 12)
        self.assertTrue(all(not args and not kwargs for _values, args, kwargs in inserted))
        task_identities = {
            values[readiness_work.TASK_IDENTITY_FIELD]
            for values, _args, _kwargs in inserted
            if values["doctype"] == "Task"
        }
        self.assertEqual(len(task_identities), 12)


if __name__ == "__main__":
    unittest.main()
