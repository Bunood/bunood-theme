"""Pure security and aggregation checks for the tenant health feed."""

import importlib.util
from datetime import datetime
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


def load_module():
    fake = types.ModuleType("frappe")
    fake.whitelist = lambda *args, **kwargs: lambda fn: fn
    fake._ = lambda value: value
    fake.PermissionError = PermissionError
    fake.ValidationError = ValueError
    fake.throw = lambda message, exception=ValueError: (_ for _ in ()).throw(exception(message))
    limiter = types.ModuleType("frappe.rate_limiter")
    limiter.rate_limit = lambda *args, **kwargs: lambda fn: fn
    utils = types.ModuleType("frappe.utils")
    utils.__path__ = []
    scheduler = types.ModuleType("frappe.utils.scheduler")
    scheduler.is_scheduler_inactive = lambda verbose=False: False
    package = types.ModuleType("bunood_theme")
    package.__path__ = []
    subpackage = types.ModuleType("bunood_theme.zatca")
    subpackage.__path__ = []
    monitor = types.ModuleType("bunood_theme.zatca.monitor")
    monitor._state = lambda record: {
        "Accepted": "accepted", "Accepted with warnings": "warnings", "Rejected": "rejected",
        "Duplicate": "duplicate",
    }.get((record or {}).get("integration_status"), "pending" if record else "missing_record")
    status = types.ModuleType("bunood_theme.zatca.status")
    status.INVOICE_DOCTYPES = {"Sales Invoice", "POS Invoice"}
    status._installed = lambda: True
    status._settings = lambda company: {}
    status._stored_fields = lambda meta, fields: fields
    status.classify_status = lambda **kwargs: "ready"
    modules = {"frappe": fake, "frappe.rate_limiter": limiter,
               "frappe.utils": utils, "frappe.utils.scheduler": scheduler, "bunood_theme": package,
               "bunood_theme.zatca": subpackage, "bunood_theme.zatca.monitor": monitor,
               "bunood_theme.zatca.status": status}
    path = Path(__file__).parents[1] / "bunood_theme" / "zatca" / "health.py"
    spec = importlib.util.spec_from_file_location("bunood_zatca_health_test", path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class HealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.health = load_module()

    def context(self):
        fake = self.health.frappe
        fake.session = types.SimpleNamespace(user="service@example.com")
        fake.conf = {"bunood_zatca_health_service_user": "service@example.com",
                     "bunood_zatca_health_companies": ["ACME"], "bunood_zatca_site_id": "tenant-1"}
        fake.request = types.SimpleNamespace(headers={"Authorization": "token key:secret"})
        fake.db = types.SimpleNamespace(table_exists=lambda doctype: True,
                                        exists=lambda doctype, name: name == "ACME",
                                        get_value=lambda *args, **kwargs: None)
        fake.utils = types.SimpleNamespace(now_datetime=lambda: datetime(2026, 10, 1, 12, 0),
                                           get_system_timezone=lambda: "Asia/Riyadh")
        fake.logger = lambda *args, **kwargs: types.SimpleNamespace(info=lambda *args: None)
        return fake

    def test_service_user_token_and_company_allowlist_are_all_required(self):
        fake = self.context()
        self.health._service_company("ACME")
        fake.request.headers = {}
        with self.assertRaises(PermissionError):
            self.health._service_company("ACME")
        fake.request.headers = {"Authorization": "token key:secret"}
        with self.assertRaises(PermissionError):
            self.health._service_company("OTHER")
        fake.session.user = "Administrator"
        with self.assertRaises(PermissionError):
            self.health._service_company("ACME")

    def test_deadline_counts_follow_native_invoice_type_and_issue_time(self):
        now = datetime(2026, 10, 1, 12, 0)
        rows = [
            {"name": "A", "doctype": "Sales Invoice", "posting_date": "2026-09-30", "posting_time": "10:00:00"},
            {"name": "B", "doctype": "POS Invoice", "posting_date": "2026-09-30", "posting_time": "16:00:00"},
            {"name": "C", "doctype": "Sales Invoice", "posting_date": "2026-10-01", "posting_time": "08:00:00"},
            {"name": "D", "doctype": "Sales Invoice", "posting_date": "2026-10-01", "posting_time": "08:00:00"},
        ]
        evidence = {
            ("Sales Invoice", "A"): {"integration_status": "Rejected", "invoice_type_transaction": "0200000"},
            ("POS Invoice", "B"): {"integration_status": "Ready For Batch", "invoice_type_transaction": "0200000"},
            ("Sales Invoice", "C"): {"integration_status": "Rejected", "invoice_type_transaction": "0100000"},
            ("Sales Invoice", "D"): {"integration_status": "Accepted", "invoice_type_transaction": "0100000",
                                      "last_attempt": "2026-10-01 09:00:00"},
        }
        summary = self.health._summary(rows, evidence, now, True)
        self.assertEqual(summary["counts"]["simplified_overdue"], 1)
        self.assertEqual(summary["counts"]["simplified_near_deadline"], 1)
        self.assertEqual(summary["counts"]["standard_blocked"], 1)
        self.assertEqual(summary["last_confirmed_success"], "2026-10-01T06:00:00+00:00")
        self.assertEqual(summary["oldest_unresolved_issued_at"], "2026-09-30T07:00:00+00:00")
        unverified = self.health._summary(rows, evidence, now, False)
        self.assertEqual(unverified["counts"]["simplified_overdue"], 0)
        self.assertEqual(unverified["deadline_unknown"], 2)

    def test_privileged_health_join_keeps_sales_and_pos_evidence_separate(self):
        fake = self.context()
        fake.get_meta = lambda doctype: types.SimpleNamespace(get_field=lambda name: True)
        calls = []
        class Row(dict):
            __getattr__ = dict.get
        def records(doctype, filters, fields, **kwargs):
            calls.append((doctype, filters, fields))
            return [Row(sales_invoice="SAME", integration_status="Rejected",
                        invoice_type_transaction="0200000")]
        fake.get_all = records
        rows = [{"name": "SAME", "doctype": "Sales Invoice"},
                {"name": "SAME", "doctype": "POS Invoice"}]
        result = self.health._health_evidence(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual({call[1]["invoice_doctype"] for call in calls},
                         {"Sales Invoice", "POS Invoice"})
        self.assertTrue(all("invoice_type_transaction" in call[2] for call in calls))

    def test_health_envelope_contains_no_invoice_id_or_credentials(self):
        self.context()
        with patch.object(self.health, "_invoice_rows", return_value=([], True)), \
             patch.object(self.health, "_installed", return_value=True), \
             patch.object(self.health, "_settings", return_value={
                 "fatoora_server": "Sandbox", "sync_with_zatca": "Batches",
                 "enable_zatca_integration": 1, "secret": "do-not-return",
                 "security_token": "do-not-return",
             }):
            result = self.health.get_tenant_health("ACME")
        self.assertEqual(result["site_id"], "tenant-1")
        self.assertTrue(result["partial"])
        self.assertNotIn("secret", result)
        self.assertNotIn("settings", result)
        self.assertNotIn("rows", result)
        self.assertTrue(result["scheduler_active"])
        self.assertFalse(result["sync_job_registered"])

    def test_native_batch_job_signal_is_read_only_and_uses_existing_job(self):
        fake = self.context()
        fake.db.get_value = lambda *args, **kwargs: {
            "frequency": "Hourly Long", "stopped": 0, "last_execution": "2026-10-01 10:00:00"}
        result = self.health._scheduler_info(True, datetime(2026, 10, 1, 12, 0))
        self.assertTrue(result["scheduler_active"])
        self.assertTrue(result["sync_job_registered"])
        self.assertFalse(result["sync_job_stale"])
        self.assertEqual(result["last_sync_job_run"], "2026-10-01T07:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
