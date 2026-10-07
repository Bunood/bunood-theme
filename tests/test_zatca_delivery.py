"""Bench-free Phase 2 buyer-delivery policy tests; no ZATCA calls are made."""

import base64
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch


def load_module():
    fake = ModuleType("frappe")
    fake._ = lambda value: value
    fake.whitelist = lambda *args, **kwargs: lambda fn: fn
    fake.PermissionError = PermissionError
    fake.throw = lambda message, exception=ValueError: (_ for _ in ()).throw(exception(message))
    fake.flags = SimpleNamespace()
    fake.form_dict = {}
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "zatca" / "delivery.py"
    spec = importlib.util.spec_from_file_location("bunood_zatca_delivery_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


XML = (b'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" '
       b'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
       b'<cbc:UUID>test-uuid</cbc:UUID></Invoice>')


class DeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.delivery = load_module()

    def policy(self, **changes):
        data = dict(submitted=True, regulated=True, server="Production",
                    invoice_type="0100000", integration_status="Accepted",
                    has_xml=True, has_qr=True, zatca_status="CLEARED", has_cleared_xml=True)
        data.update(changes)
        return self.delivery.classify_delivery(**data)

    def test_standard_must_have_matching_clearance_and_cleared_xml(self):
        self.assertEqual(self.policy(), "ready")
        for changes in (
            {"integration_status": "Ready For Batch"},
            {"integration_status": "Duplicate"},
            {"zatca_status": "REPORTED"},
            {"has_cleared_xml": False},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(self.policy(**changes), "awaiting_clearance")

    def test_simplified_requires_signed_xml_and_qr_but_can_await_reporting(self):
        self.assertEqual(self.policy(invoice_type="0200000", integration_status="Ready For Batch",
                                     zatca_status="", has_cleared_xml=False), "ready")
        self.assertEqual(self.policy(invoice_type="0200000", integration_status="Accepted",
                                     zatca_status="REPORTED"), "ready")
        self.assertEqual(self.policy(invoice_type="0200000", integration_status="Accepted",
                                     zatca_status=""), "reporting_exception")
        for status in ("Rejected", "Resend", "Duplicate", "Corrected"):
            self.assertEqual(self.policy(invoice_type="0200000", integration_status=status),
                             "reporting_exception")
        self.assertEqual(self.policy(invoice_type="0200000", has_qr=False), "not_signed")

    def test_sandbox_and_unknown_type_never_reach_customer(self):
        self.assertEqual(self.policy(server="Sandbox"), "sandbox_only")
        self.assertEqual(self.policy(invoice_type=""), "unknown_type")
        self.assertEqual(self.policy(submitted=False), "not_submitted")
        self.assertEqual(self.policy(regulated=False), "ready")

    def test_pos_record_lookup_is_doctype_scoped_and_latest_only(self):
        fake = self.delivery.frappe
        fake.db = SimpleNamespace(table_exists=Mock(return_value=True))
        fake.get_all = Mock(return_value=[SimpleNamespace(name="SIAF-POS")])
        fake.get_doc = Mock(return_value=SimpleNamespace(name="SIAF-POS"))
        self.delivery._latest_record("POS Invoice", "POS-1")
        self.assertEqual(fake.get_all.call_args.kwargs["filters"], {
            "sales_invoice": "POS-1", "invoice_doctype": "POS Invoice", "is_latest": 1,
        })

    def test_non_integrated_customer_pdf_uses_a_qr_aware_managed_format(self):
        for doctype, expected in [("Sales Invoice", "Bunood Sales Invoice (A4)"),
                                  ("POS Invoice", "Bunood POS Invoice (A4)")]:
            with self.subTest(doctype=doctype), patch.object(self.delivery, "_settings", return_value=None):
                context = self.delivery.delivery_context(SimpleNamespace(
                    doctype=doctype, company="COMPANY", docstatus=1))
                self.assertEqual(context["format"], expected)
                self.assertEqual(context["state"], "ready")
                self.assertFalse(context["regulated"])

    def test_cleared_payload_must_be_valid_xml_from_a_cleared_log(self):
        fake = self.delivery.frappe
        fake.get_all = Mock(return_value=[SimpleNamespace(
            zatca_status="CLEARED",
            zatca_message=json.dumps({"clearanceStatus": "CLEARED",
                                      "clearedInvoice": base64.b64encode(XML).decode()}),
        )])
        self.assertEqual(self.delivery._cleared_xml(SimpleNamespace(name="SIAF-1", uuid="test-uuid")), ("CLEARED", XML))
        fake.get_all.return_value[0].zatca_message = json.dumps({
            "clearanceStatus": "CLEARED", "clearedInvoice": "not base64",
        })
        self.assertEqual(self.delivery._cleared_xml(SimpleNamespace(name="SIAF-1", uuid="test-uuid")), ("", b""))
        self.assertEqual(self.delivery._xml_bytes(XML, "another-uuid"), b"")

    def test_native_print_is_blocked_until_ready_and_pinned_to_phase2_format(self):
        fake = self.delivery.frappe
        doc = SimpleNamespace(doctype="POS Invoice")
        with patch.object(self.delivery, "require_ready", return_value={"regulated": True,
                          "format": "ZATCA Phase 2 Print Format - POS Invoice"}):
            with self.assertRaisesRegex(ValueError, "Phase 2 print format"):
                self.delivery.before_print(doc)
            fake.form_dict = {"format": "ZATCA Phase 2 Print Format - POS Invoice"}
            self.assertIsNone(self.delivery.before_print(doc))

    def test_sandbox_exception_requires_exact_invoice_binding_label_and_enabled_sandbox(self):
        fake = self.delivery.frappe
        doc = SimpleNamespace(doctype='Sales Invoice', name='SINV-A', company='COMPANY',docstatus=1,_bnd_sandbox_preview=True)
        fake.flags = SimpleNamespace(bnd_zatca_sandbox_preview=('Sales Invoice','SINV-A'))
        settings = SimpleNamespace(fatoora_server='Sandbox',enable_zatca_integration=1)
        with patch.object(self.delivery,'_settings',return_value=settings), patch.object(self.delivery,'require_ready',side_effect=ValueError('blocked')) as gate:
            self.assertIsNone(self.delivery.before_print(doc))
            gate.assert_not_called()
            for changes in [dict(binding=('POS Invoice','SINV-A')),dict(binding=('Sales Invoice','SINV-B')),dict(label=False),dict(server='Production'),dict(enabled=0),dict(status=0),dict(status=2)]:
                fake.flags.bnd_zatca_sandbox_preview=changes.get('binding',('Sales Invoice','SINV-A'))
                doc._bnd_sandbox_preview=changes.get('label',True)
                doc.docstatus=changes.get('status',1)
                settings.fatoora_server=changes.get('server','Sandbox')
                settings.enable_zatca_integration=changes.get('enabled',1)
                with self.subTest(changes=changes), self.assertRaisesRegex(ValueError,'blocked'):
                    self.delivery.before_print(doc)

    def test_status_only_offers_sandbox_preview_with_role_permission_uuid_and_artifacts(self):
        fake=self.delivery.frappe
        record=SimpleNamespace(name='SIAF-A',uuid='UUID',qr_code='native',integration_status='Accepted',has_permission=Mock(return_value=True))
        context=dict(state='sandbox_only',regulated=True,server='Sandbox',format='ZATCA Phase 2 Print Format',record=record,xml=b'',has_signed_xml=True)
        settings=SimpleNamespace(get=lambda field: True)
        fake.get_roles=Mock(return_value=['Accounts Manager'])
        with patch.object(self.delivery,'_invoice'),patch.object(self.delivery,'delivery_context',return_value=context),patch.object(self.delivery,'_settings',return_value=settings):
            self.assertTrue(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['can_preview_sandbox'])
            self.assertFalse(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['ready'])
            record.has_permission.return_value=False
            self.assertFalse(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['can_preview_sandbox'])
            record.has_permission.return_value=True
            for attribute in ['uuid','qr_code']:
                original=getattr(record,attribute)
                setattr(record,attribute,'')
                self.assertFalse(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['can_preview_sandbox'])
                setattr(record,attribute,original)
            context['has_signed_xml']=False
            self.assertFalse(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['can_preview_sandbox'])
            context['has_signed_xml']=True
            fake.get_roles.return_value=['Sales User']
            self.assertFalse(self.delivery.get_delivery_status('Sales Invoice','SINV-A')['can_preview_sandbox'])


if __name__ == "__main__":
    unittest.main()
