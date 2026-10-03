"""Optional fixed-specimen previews must not turn their refusal into a modal."""
import ast
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]


class PrintPreviewTests(unittest.TestCase):
    def fixture(self):
        prior = {"message": "Keep the existing alert"}
        form_dict = {"cmd": "bunood_theme.api.print_preview", "lang": "en"}
        frappe = SimpleNamespace(
            local=SimpleNamespace(lang="ar", form_dict=form_dict, message_log=[prior]),
            only_for=Mock(), _dict=dict, _=lambda value: value,
            db=SimpleNamespace(exists=lambda *args: True, get_default=lambda *args: "Specimen Co"),
            log_error=Mock(),
        )
        source = ast.parse((ROOT / "bunood_theme/api.py").read_text(encoding="utf-8"))
        function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "print_preview")
        function.decorator_list = []
        scope = {"frappe": frappe}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "<print_preview>", "exec"), scope)
        render = Mock()
        modules = {
            "frappe.utils.jinja_globals": SimpleNamespace(bundled_asset=lambda *args: "/assets/print.css"),
            "frappe.www.printview": SimpleNamespace(get_html_and_style=render),
            "bunood_theme.setup": SimpleNamespace(is_rtl=lambda lang: lang == "ar"),
        }
        return frappe, form_dict, prior, scope["print_preview"], render, modules

    def test_refused_invoice_specimen_removes_only_its_new_messages_and_restores_request(self):
        frappe, form_dict, prior, preview, render, modules = self.fixture()
        message_log = frappe.local.message_log

        def guard(**kwargs):
            specimen = json.loads(kwargs["doc"])
            self.assertEqual(specimen["name"], "BND-PREVIEW-0042")
            self.assertNotIn("docstatus", specimen, "do not pretend the specimen is submitted")
            self.assertEqual(frappe.local.lang, "en")
            self.assertEqual(frappe.local.form_dict, {})
            frappe.local.message_log.append({"message": "Submit the invoice before sharing or printing it.", "raise_exception": 1})
            raise ValueError("normal invoice guard refusal")

        render.side_effect = guard
        with patch.dict(sys.modules, modules):
            self.assertEqual(preview(shape="invoice", lang="en"), "")
        self.assertIs(frappe.local.message_log, message_log)
        self.assertEqual(message_log, [prior])
        self.assertIs(frappe.local.form_dict, form_dict)
        self.assertEqual(frappe.local.lang, "ar")
        frappe.only_for.assert_called_once_with("System Manager")
        frappe.log_error.assert_called_once()

    def test_refusal_without_prior_alerts_leaves_no_server_messages(self):
        frappe, form_dict, _, preview, render, modules = self.fixture()
        frappe.local.message_log = None

        def guard(**kwargs):
            frappe.local.message_log = [{"message": "Submit first", "raise_exception": 1}]
            raise ValueError("refused")

        render.side_effect = guard
        with patch.dict(sys.modules, modules):
            self.assertEqual(preview(shape="invoice"), "")
        self.assertFalse(frappe.local.message_log)
        self.assertIs(frappe.local.form_dict, form_dict)
        self.assertEqual(frappe.local.lang, "ar")

    def test_authorization_denial_is_not_suppressed(self):
        frappe, form_dict, prior, preview, render, modules = self.fixture()

        def deny(role):
            frappe.local.message_log.append({"message": "Not permitted", "raise_exception": 1})
            raise PermissionError("System Manager required")

        frappe.only_for.side_effect = deny
        with patch.dict(sys.modules, modules), self.assertRaises(PermissionError):
            preview(shape="invoice")
        self.assertEqual(frappe.local.message_log, [prior, {"message": "Not permitted", "raise_exception": 1}])
        self.assertIs(frappe.local.form_dict, form_dict)
        self.assertEqual(frappe.local.lang, "ar")
        render.assert_not_called()
        frappe.log_error.assert_not_called()

    def test_success_preserves_messages_and_restores_language_and_form_dict(self):
        frappe, form_dict, prior, preview, render, modules = self.fixture()
        notice = {"message": "Successful rendering notice"}

        def successful(**kwargs):
            frappe.local.message_log.append(notice)
            return {"html": "<p>Specimen</p>", "style": "p{color:inherit}"}

        render.side_effect = successful
        with patch.dict(sys.modules, modules):
            html = preview(shape="document", lang="en")
        self.assertIn('<html lang="en" dir="ltr">', html)
        self.assertIn("<p>Specimen</p>", html)
        self.assertEqual(frappe.local.message_log, [prior, notice])
        self.assertIs(frappe.local.form_dict, form_dict)
        self.assertEqual(frappe.local.lang, "ar")
        frappe.log_error.assert_not_called()

    def test_empty_render_restores_request_without_discarding_successful_messages(self):
        frappe, form_dict, prior, preview, render, modules = self.fixture()
        render.return_value = {"html": ""}
        with patch.dict(sys.modules, modules):
            self.assertEqual(preview(), "")
        self.assertEqual(frappe.local.message_log, [prior])
        self.assertIs(frappe.local.form_dict, form_dict)
        self.assertEqual(frappe.local.lang, "ar")


if __name__ == "__main__":
    unittest.main()
