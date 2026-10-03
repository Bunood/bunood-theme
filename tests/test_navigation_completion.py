"""Pure regression checks: do not require a site or write financial data."""
import importlib.util
import pathlib
import os
import sys
import types
import unittest

sys.modules.setdefault("frappe", types.ModuleType("frappe"))
spec = importlib.util.spec_from_file_location("navigation_under_test", os.environ.get("BND_TEST_NAV") or pathlib.Path(__file__).parents[1] / "bunood_theme/navigation.py")
navigation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(navigation)


class CompletionTest(unittest.TestCase):
    def test_native_url_aliases_do_not_reinsert_report_shortcuts(self):
        existing=[{'type':'Link','link_type':'URL','url':'/desk/bnd-report-studio/vat-return'}]
        authored=[{'type':'URL','label':'VAT Return','url':'/app/bnd-report-studio/vat-return'}]
        self.assertEqual(navigation.sidebar_additions(authored,existing,lambda *_:True),[])

    def test_exact_duplicate_aliases_removed_but_filtered_views_retained(self):
        first={'type':'Link','label':'VAT Return','link_type':'URL','url':'/desk/bnd-report-studio/vat-return'}
        alias={**first,'url':'/app/bnd-report-studio/vat-return'}
        filtered={**alias,'filters':'{"company":"X"}'}
        self.assertEqual(navigation.sidebar_repaired_rows([first,alias,filtered],[],lambda *_:True),[first,filtered])

    def test_page_navigation_uses_native_rules_and_read_prerequisites(self):
        from unittest.mock import patch
        permitted={'bnd-pos': True, 'bnd-report-studio': True, 'bnd-finance-close': False, 'bnd-inbox': True}
        fake=sys.modules['frappe']
        with patch.object(fake,'get_all',return_value=list(permitted),create=True), \
             patch.object(fake,'get_cached_doc',side_effect=lambda dt,name: types.SimpleNamespace(is_permitted=lambda:permitted[name]),create=True), \
             patch.object(fake,'has_permission',side_effect=lambda dt,ptype: dt not in ('POS Profile','Company'),create=True):
            self.assertEqual(navigation.navigation_permitted_pages(),['bnd-inbox'])

    def test_groups_deduplicate_and_preserve_filters(self):
        rows = [{"type": "Card Break", "label": "Leases"},
                {"type": "Link", "label": "Lease", "link_type": "DocType", "link_to": "Lease"},
                {"type": "Link", "label": "Due", "link_type": "Report", "link_to": "Collections", "filters": '{"company":"X"}'}]
        existing = [{"type": "Link", "link_type": "DocType", "link_to": "Lease"}]
        result = navigation.sidebar_additions(rows, existing, lambda *_: True)
        self.assertEqual([i["label"] for i in result], ["Leases", "Due"])
        self.assertEqual(result[1]["filters"], '{"company":"X"}')
        self.assertEqual(result[1]["child"], 1)
        self.assertEqual(navigation.sidebar_additions(rows, existing + result, lambda *_: True), [])

    def test_unavailable_entities_and_empty_sections_are_not_added(self):
        rows = [{"type": "Card Break", "label": "Unavailable"},
                {"type": "Link", "link_type": "DocType", "link_to": "Missing"}]
        self.assertEqual(navigation.sidebar_additions(rows, [], lambda *_: False), [])

    def test_url_shortcuts_copy_url_not_missing_dynamic_link(self):
        rows = [{"type": "URL", "label": "Orders", "url": "/dining_desk"}]
        result = navigation.sidebar_additions(rows, [], lambda *_: True)
        self.assertEqual(result[0]["url"], "/dining_desk")
        self.assertIsNone(result[0]["link_to"])

    def test_repair_removes_absent_entities_and_restores_authored_urls(self):
        rows = [{"type": "Link", "link_type": "DocType", "link_to": "Removed"},
                {"type": "Link", "label": "Orders", "link_type": "URL", "url": None},
                {"type": "Link", "label": "Custom", "link_type": "URL", "url": "https://client.example/"},
                {"type": "Link", "label": "", "link_type": "Page", "link_to": "Valid"}]
        authored = [{"type": "URL", "label": "Orders", "url": "/dining_desk"}]
        exists = lambda kind, target: target != "Removed"
        result = navigation.sidebar_repaired_rows(rows, authored, exists)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["url"], "/dining_desk")
        self.assertEqual(result[1]["url"], "https://client.example/")
        self.assertEqual(result[2]["label"], "Valid")
        self.assertEqual(navigation.sidebar_repaired_rows(result, authored, exists), result)

    def test_repair_preserves_custom_filters_and_non_link_rows(self):
        rows = [{"type": "Section Break", "label": "Custom"},
                {"type": "Link", "label": "My queue", "link_type": "DocType", "link_to": "Task", "filters": '{"status":"Open"}'}]
        self.assertEqual(navigation.sidebar_repaired_rows(rows, [], lambda *_: True), rows)


if __name__ == "__main__":
    unittest.main()
