"""Bench-free tests for a read-only, template-pinned legacy print preflight."""
import hashlib
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parents[1] / 'bunood_theme/zatca/print_guard.py'


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.frappe = SimpleNamespace(
            _=lambda text: text, form_dict={'format': 'ZATCA Phase 1 Print Format'},
            db=SimpleNamespace(exists=Mock(return_value=True), get_value=Mock(return_value={'status':'Active','address':'SELLER'})),
            get_cached_doc=Mock(return_value={'html':'known-template','custom_format':1}),
            get_hooks=Mock(return_value=[]),
            throw=Mock(side_effect=lambda message, **kw: (_ for _ in ()).throw(ValueError(message))),
        )
        spec = importlib.util.spec_from_file_location('isolated_print_guard', SOURCE)
        self.guard = importlib.util.module_from_spec(spec)
        self.resolver = Mock(side_effect=lambda dt, template: template['html'])
        with patch.dict(sys.modules, {'frappe':self.frappe, 'frappe.www.printview':SimpleNamespace(get_print_format=self.resolver)}):
            spec.loader.exec_module(self.guard)
        self.guard.TEMPLATE_SHA256 = hashlib.sha256(b'known-template').hexdigest()
        self.doc = SimpleNamespace(doctype='Sales Invoice', meta={}, get=lambda key: 'COMPANY')

    def test_unrelated_format_has_no_lookups(self):
        self.frappe.form_dict['format'] = 'Bunood Sales Invoice (A4)'
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_not_called()
        self.frappe.db.exists.assert_not_called()

    def test_customized_or_upgraded_template_is_not_intercepted(self):
        self.frappe.get_cached_doc.return_value = {'html':'custom-template','custom_format':1}
        self.guard.before_print(self.doc)
        self.frappe.db.exists.assert_not_called()

    def test_native_renderer_override_is_not_intercepted_or_invoked(self):
        self.frappe.get_hooks.return_value = ['custom_app.printing.render']
        self.guard.before_print(self.doc)
        self.frappe.get_hooks.assert_called_once_with('get_print_format_template')
        self.frappe.get_cached_doc.assert_not_called()
        self.resolver.assert_not_called()
        self.frappe.db.exists.assert_not_called()
        self.frappe.db.get_value.assert_not_called()
        self.frappe.throw.assert_not_called()

    def test_missing_and_inactive_settings_produce_guidance(self):
        for settings in [None, {'status':'Inactive','address':'SELLER'}]:
            with self.subTest(settings=settings):
                self.frappe.db.get_value.return_value = settings
                with self.assertRaisesRegex(ValueError, 'requires active'):
                    self.guard.before_print(self.doc, 'before_print', {})

    def test_missing_dependency_produces_guidance_without_querying_it(self):
        self.frappe.db.exists.return_value = False
        with self.assertRaisesRegex(ValueError, 'requires active'):
            self.guard.before_print(self.doc)
        self.frappe.db.get_value.assert_not_called()

    def test_missing_and_dangling_address_produce_guidance(self):
        for address in ['', 'DELETED']:
            with self.subTest(address=address):
                self.frappe.db.get_value.return_value = {'status':'Active','address':address}
                self.frappe.db.exists.side_effect = lambda dt, name: dt == 'DocType'
                with self.assertRaisesRegex(ValueError, 'seller address is missing'):
                    self.guard.before_print(self.doc)

    def test_configured_settings_return_without_mutating_document(self):
        before = dict(vars(self.doc))
        self.assertIsNone(self.guard.before_print(self.doc))
        self.assertEqual(vars(self.doc), before)
        self.frappe.throw.assert_not_called()

    def test_default_format_and_explicit_override(self):
        self.doc.meta = {'default_print_format':self.guard.FORMAT}
        self.frappe.form_dict.clear()
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_called_once()
        self.frappe.get_cached_doc.reset_mock()
        self.frappe.form_dict['format'] = 'Standard'
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_not_called()

    def test_other_doctype_is_not_intercepted(self):
        self.doc.doctype = 'Purchase Invoice'
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_not_called()

    def test_file_backed_override_uses_effective_template_not_db(self):
        self.resolver.side_effect = None
        self.resolver.return_value = 'upgraded-file-template'
        self.guard.before_print(self.doc)
        self.resolver.assert_called_once()
        self.frappe.db.exists.assert_not_called()

    def test_desk_explicit_format_wins_over_default_and_stale_format(self):
        self.doc.meta = {'default_print_format':self.guard.FORMAT}
        self.frappe.form_dict.update(cmd='frappe.www.printview.get_html_and_style', print_format='Standard')
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_not_called()
        self.frappe.form_dict.update(print_format=self.guard.FORMAT, format='Standard')
        self.frappe.db.get_value.return_value = None
        with self.assertRaisesRegex(ValueError, 'requires active'):
            self.guard.before_print(self.doc)

    def test_printview_format_wins_over_stale_desk_parameter(self):
        self.frappe.form_dict.update(format='Standard', print_format=self.guard.FORMAT)
        self.guard.before_print(self.doc)
        self.frappe.get_cached_doc.assert_not_called()

    def test_disabled_standard_and_raw_formats_keep_native_behavior(self):
        for overrides in [{'disabled':1}, {'custom_format':0}, {'raw_printing':1}]:
            self.frappe.get_cached_doc.return_value = dict(html='known-template',custom_format=1) | overrides
            self.guard.before_print(self.doc)
        self.resolver.assert_not_called()


if __name__ == '__main__':
    unittest.main()
