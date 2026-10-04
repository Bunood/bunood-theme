"""No-network contract tests for customer delivery and its Phase 2 guard."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch


def load_module():
    frappe = ModuleType("frappe")
    frappe._ = lambda text: text
    frappe.get_roles = Mock(return_value=["Accounts Manager"])
    frappe.whitelist = lambda *args, **kwargs: lambda fn: fn
    frappe.PermissionError = PermissionError
    frappe.throw = lambda message, exception=ValueError: (_ for _ in ()).throw(exception(message))
    frappe.flags = SimpleNamespace()
    frappe.response = SimpleNamespace()
    frappe.get_print = Mock(return_value=b"%PDF-1.7")
    utils = ModuleType("frappe.utils")
    utils.validate_email_address = lambda address, throw=True: True
    email = ModuleType("frappe.core.doctype.communication.email")
    email.make = Mock(return_value={"name": "COMM-TEST"})
    delivery = ModuleType("bunood_theme.zatca.delivery")
    doc = SimpleNamespace(doctype="Sales Invoice", name="SINV-TEST", docstatus=1, company="COMPANY",
                          check_permission=Mock())
    delivery.CUSTOMER_FORMATS = {"Sales Invoice": "Bunood Sales Invoice (A4)"}
    delivery._settings = Mock(return_value=SimpleNamespace(fatoora_server="Sandbox",enable_zatca_integration=1))
    delivery._latest_record = Mock(return_value=SimpleNamespace(qr_code="native-qr", uuid="test",
                                  check_permission=Mock(),get_signed_xml=lambda: "<Invoice/>"))
    delivery._xml_bytes = Mock(return_value=b'<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>399999999900003</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty></Invoice>')
    delivery._invoice = Mock(return_value=doc)
    delivery.require_ready = Mock(return_value={"regulated": True,
                                                 "format": "ZATCA Phase 2 Print Format",
                                                 "xml": b"<Invoice/>"})
    patcher = patch.dict(sys.modules, {
        "frappe": frappe, "frappe.utils": utils,
        "frappe.core.doctype.communication.email": email,
        "bunood_theme.zatca.delivery": delivery,
    })
    patcher.start()
    path = Path(__file__).parents[1] / "bunood_theme" / "invoice_delivery.py"
    spec = importlib.util.spec_from_file_location("bunood_invoice_delivery_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, frappe, email, delivery, doc, patcher


class InvoiceDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.module, self.frappe, self.email, self.delivery, self.doc, self.patcher = load_module()

    def tearDown(self):
        self.patcher.stop()

    def test_phase2_email_uses_pinned_print_and_attaches_xml(self):
        result = self.module.send_invoice_email("Sales Invoice", "SINV-TEST", "buyer@example.com", "Invoice", "See attached")
        self.assertEqual(result, {"communication": "COMM-TEST"})
        self.doc.check_permission.assert_any_call("email")
        self.assertEqual(self.frappe.get_print.call_args.args[:3],
                         ("Sales Invoice", "SINV-TEST", "ZATCA Phase 2 Print Format"))
        attachments = self.email.make.call_args.kwargs["attachments"]
        self.assertEqual([entry["fname"] for entry in attachments], ["SINV-TEST.pdf", "SINV-TEST.xml"])
        self.assertEqual(attachments[1]["fcontent"], b"<Invoice/>")
        self.assertFalse(self.frappe.flags.bnd_zatca_delivery_print)

    def test_unready_invoice_never_reaches_email(self):
        self.delivery.require_ready.side_effect = ValueError("awaiting clearance")
        with self.assertRaisesRegex(ValueError, "awaiting clearance"):
            self.module.send_invoice_email("Sales Invoice", "SINV-TEST", "buyer@example.com", "Invoice", "Message")
        self.email.make.assert_not_called()

    def test_download_requires_print_permission_and_never_creates_public_file(self):
        self.module.download_customer_invoice("Sales Invoice", "SINV-TEST", "xml")
        self.doc.check_permission.assert_any_call("print")
        self.assertEqual(self.frappe.response.filecontent, b"<Invoice/>")
        self.assertEqual(self.frappe.response.type, "download")
        self.assertEqual(self.frappe.response.filename, "SINV-TEST.xml")

    def test_sandbox_preview_is_bound_labelled_and_restores_flags(self):
        def render(*args, **kwargs):
            self.assertTrue(kwargs['doc']._bnd_sandbox_preview)
            self.assertEqual(kwargs['doc']._bnd_sandbox_vat,'399999999900003')
            self.assertEqual(kwargs['no_letterhead'],1)
            self.assertEqual(self.frappe.flags.bnd_zatca_sandbox_preview, ('Sales Invoice','SINV-TEST'))
            return b'%PDF-1.7'
        self.frappe.get_print.side_effect = render
        self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.doc.check_permission.assert_any_call("print")
        self.delivery._latest_record.return_value.check_permission.assert_called_once_with("read")
        self.assertFalse(self.doc._bnd_sandbox_preview)
        self.assertIsNone(self.doc._bnd_sandbox_vat)
        self.assertEqual(self.frappe.response.filename, "SINV-TEST.sandbox.pdf")
        self.assertIsNone(self.frappe.flags.bnd_zatca_sandbox_preview)
        self.email.make.assert_not_called()

    def test_sandbox_preview_rejects_production_disabled_draft_and_missing_artifacts(self):
        for changes in ({"fatoora_server":"Production"}, {"enable_zatca_integration":0}):
            self.delivery._settings.return_value=SimpleNamespace(fatoora_server="Sandbox",enable_zatca_integration=1,**{})
            for field,value in changes.items(): setattr(self.delivery._settings.return_value,field,value)
            with self.assertRaises(ValueError): self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.delivery._settings.return_value=SimpleNamespace(fatoora_server="Sandbox",enable_zatca_integration=1)
        self.doc.docstatus=0
        with self.assertRaises(ValueError): self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.doc.docstatus=1
        self.delivery._latest_record.return_value=None
        with self.assertRaises(ValueError): self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.frappe.get_print.assert_not_called()

    def test_sandbox_preview_requires_role_and_native_permissions(self):
        self.frappe.get_roles.return_value=["Sales User"]
        with self.assertRaises(PermissionError): self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.delivery._invoice.assert_not_called()

    def test_sandbox_preview_restores_flag_on_pdf_failure(self):
        self.frappe.get_print.side_effect=RuntimeError("renderer unavailable")
        with self.assertRaises(RuntimeError): self.module.download_sandbox_invoice("Sales Invoice", "SINV-TEST")
        self.assertIsNone(self.frappe.flags.bnd_zatca_sandbox_preview)
        self.assertFalse(self.doc._bnd_sandbox_preview)

    def test_sandbox_preview_requires_a_uuid_and_matching_xml(self):
        self.delivery._latest_record.return_value.uuid = ''
        with self.assertRaises(ValueError): self.module.download_sandbox_invoice('Sales Invoice','SINV-TEST')
        self.delivery._latest_record.return_value.uuid = 'test'
        self.delivery._xml_bytes.return_value = b''
        with self.assertRaises(ValueError): self.module.download_sandbox_invoice('Sales Invoice','SINV-TEST')
        self.frappe.get_print.assert_not_called()

    def test_html_preview_reuses_sandbox_checks_without_pdf_or_native_actions(self):
        self.frappe.get_print.return_value='<html><body><div class="action-banner">Get PDF</div><script>window.print()</script><div class="print-format">Native invoice</div></body></html>'
        result=self.module.preview_sandbox_invoice('Sales Invoice','SINV-TEST')
        self.assertFalse(self.frappe.get_print.call_args.kwargs['as_pdf'])
        self.assertIn('Native invoice',result['html'])
        self.assertNotIn('<script',result['html'])
        self.assertNotIn('action-banner',result['html'])
        self.assertIsNone(self.frappe.flags.bnd_zatca_sandbox_preview)
        self.assertFalse(self.doc._bnd_sandbox_preview)
        self.assertFalse(hasattr(self.frappe.response,'filecontent'))

    def test_customer_html_preview_preserves_ready_gate_and_native_format(self):
        self.frappe.get_print.return_value='<html><body><div class="print-format">Customer invoice</div></body></html>'
        result=self.module.preview_customer_invoice('Sales Invoice','SINV-TEST')
        self.delivery.require_ready.assert_called_once_with(self.doc)
        self.doc.check_permission.assert_called_once_with('print')
        self.assertEqual(self.frappe.get_print.call_args.args[2],'ZATCA Phase 2 Print Format')
        self.assertFalse(self.frappe.get_print.call_args.kwargs['as_pdf'])
        self.assertIn('Customer invoice',result['html'])
        self.assertFalse(self.frappe.flags.bnd_zatca_delivery_print)
        self.assertFalse(hasattr(self.frappe.response,'filecontent'))

    def test_customer_html_preview_blocks_unready_without_rendering(self):
        self.delivery.require_ready.side_effect=ValueError('awaiting clearance')
        with self.assertRaises(ValueError): self.module.preview_customer_invoice('Sales Invoice','SINV-TEST')
        self.frappe.get_print.assert_not_called()


if __name__ == "__main__":
    unittest.main()
