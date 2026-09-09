import importlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest


def load_module():
    fake = types.ModuleType("frappe")
    fake.whitelist = lambda *args, **kwargs: lambda fn: fn
    fake._ = lambda value: value
    fake.PermissionError = PermissionError
    # Each isolated source-loader test owns its fake.  ``setdefault`` leaked a
    # different test module's partial frappe stub when unittest discovered the
    # whole suite in one process, making otherwise independent tests order
    # dependent.
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "zatca" / "status.py"
    spec = importlib.util.spec_from_file_location("bunood_zatca_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ZatcaStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zatca = load_module()

    def state(self, **changes):
        values = dict(
            installed=True,
            settings_exists=True,
            enabled=True,
            compliance_ready=True,
            production_ready=True,
        )
        values.update(changes)
        return self.zatca.classify_status(**values)

    def test_setup_is_progressive_and_sandbox_safe(self):
        self.assertEqual(self.state(installed=False), "missing_app")
        self.assertEqual(self.state(settings_exists=False), "needs_settings")
        self.assertEqual(self.state(enabled=False), "disabled")
        self.assertEqual(self.state(compliance_ready=False), "needs_onboarding")
        self.assertEqual(self.state(production_ready=False), "needs_csid")
        self.assertEqual(self.state(), "ready")

    def test_invoice_states_do_not_hide_warnings_or_rejections(self):
        self.assertEqual(self.state(submitted=True), "preparing")
        self.assertEqual(self.state(invoice_status="Ready For Batch", submitted=True), "ready_to_send")
        self.assertEqual(self.state(invoice_status="Accepted"), "accepted")
        self.assertEqual(self.state(invoice_status="Duplicate"), "accepted")
        self.assertEqual(self.state(invoice_status="Accepted with warnings"), "accepted_with_warnings")
        self.assertEqual(self.state(invoice_status="Rejected"), "rejected")
        self.assertEqual(self.state(invoice_status="Clearance switched off"), "clearance_off")

    def test_virtual_connector_fields_are_never_selected_from_sql(self):
        class Field:
            def __init__(self, is_virtual=False):
                self.is_virtual = is_virtual

        class Meta:
            fields = {
                "integration_status": Field(),
                "qr_image_src": Field(is_virtual=True),
                "invoice_xml": Field(),
            }

            def get_field(self, name):
                return self.fields.get(name)

        self.assertEqual(
            self.zatca._stored_fields(
                Meta(), ["integration_status", "qr_image_src", "missing", "invoice_xml"]
            ),
            ["integration_status", "invoice_xml"],
        )


if __name__ == "__main__":
    unittest.main()
