"""Regression coverage for the Phase 2 virtual QR image contract."""

import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).parents[1]
SOURCE = ROOT / "bunood_theme/printing/jinja.py"


class Invoice(dict):
    def get(self, key, default=None):
        return super().get(key, default)

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


class AdditionalFields:
    @property
    def qr_image_src(self):
        return "data:image/png;base64,phase-two-image"

    def get(self, key, default=None):
        # The upstream virtual field is intentionally not available through
        # Document.get; attribute access must invoke the controller property.
        return default


class PrintQrTests(unittest.TestCase):
    def test_phase_two_virtual_qr_property_is_used(self):
        meta = SimpleNamespace(has_field=lambda field: field == "sales_invoice")
        fake_frappe = SimpleNamespace(
            db=SimpleNamespace(
                exists=lambda doctype, name=None: doctype == "DocType",
                get_value=lambda *args, **kwargs: "SIAF-0001",
            ),
            get_meta=lambda doctype: meta,
            get_doc=lambda doctype, name: AdditionalFields(),
            log_error=Mock(),
            local=SimpleNamespace(lang="en"),
        )
        spec = importlib.util.spec_from_file_location("isolated_print_jinja", SOURCE)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": fake_frappe}):
            spec.loader.exec_module(module)

        invoice = Invoice(doctype="Sales Invoice", name="ACC-SINV-TEST")
        self.assertEqual(
            module.bunood_zatca_qr_src(invoice),
            "data:image/png;base64,phase-two-image",
        )
        fake_frappe.log_error.assert_not_called()

    def test_private_brand_image_is_embedded_for_isolated_pdf_headers(self):
        file_doc = SimpleNamespace(
            mime_type=None,
            get_content=lambda: b"\x89PNG\r\n\x1a\nbrand",
            get=lambda key, default=None: "brand.png" if key == "file_name" else default,
        )
        fake_frappe = SimpleNamespace(
            db=SimpleNamespace(get_value=lambda *args, **kwargs: "FILE-0001"),
            get_doc=lambda doctype, name: file_doc,
            log_error=Mock(),
            local=SimpleNamespace(lang="en"),
        )
        spec = importlib.util.spec_from_file_location("isolated_print_image", SOURCE)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": fake_frappe}):
            spec.loader.exec_module(module)

        source = module.bunood_print_image_src("/private/files/brand.png")
        self.assertTrue(source.startswith("data:image/png;base64,"))
        fake_frappe.log_error.assert_not_called()


if __name__ == "__main__":
    unittest.main()
