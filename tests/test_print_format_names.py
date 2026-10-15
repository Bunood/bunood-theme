"""The print-record rename (patches/v0_60_0/print_format_names.py) and its request hook
(printing/renames.py), against a fake site: the mapping, the rename and merge paths, the
Print Style path Frappe's rename_doc cannot take, and an idempotent second run.

Measured on the lab (team-rc.localhost, 2026-10-15): the first run moved 12 formats (two of them
merged), the style and the letter head, carried the Sales Invoice / Quotation / Payment Entry
default print formats and the POS Profile's receipt; a second run moved nothing.
"""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"


def load(relative, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


NAMES = load("printing/names.py", "isolated_names")


class FakeSite:
    """Records keyed by (doctype, name); rename_doc moves or merges them like Frappe's."""

    def __init__(self, records, single_links=None):
        self.records = set(records)
        self.singles = dict(single_links or {})
        self.calls = []
        frappe = ModuleType("frappe")
        frappe.db = SimpleNamespace(
            exists=lambda doctype, name: (doctype, name) in self.records,
            commit=Mock(), sql=self.sql, set_value=Mock(),
            get_single_value=lambda doctype, field: self.singles.get((doctype, field)),
            set_single_value=lambda doctype, field, value: self.singles.__setitem__((doctype, field), value),
        )
        frappe.rename_doc = self.rename_doc
        frappe.delete_doc = lambda doctype, name, **kw: self.records.discard((doctype, name))
        frappe.clear_cache = Mock()
        frappe.get_meta = lambda doctype: SimpleNamespace(autoname="field:print_style_name")
        rename = ModuleType("frappe.model.rename_doc")
        rename.get_link_fields = lambda doctype: (
            [SimpleNamespace(parent="Print Settings", fieldname="print_style", issingle=1, get=lambda k, d=None: 1)]
            if doctype == "Print Style"
            else [SimpleNamespace(parent="POS Profile", fieldname="print_format", issingle=0, get=lambda k, d=None: 0)]
        )
        self.modules = {"frappe": frappe, "frappe.model": ModuleType("frappe.model"), "frappe.model.rename_doc": rename}
        self.frappe = frappe

    def rename_doc(self, doctype, old, new, force=False, merge=False, show_alert=True):
        assert force, "the patch renames by force: the records are ours"
        assert merge == ((doctype, new) in self.records), "merge exactly when the new name exists"
        self.calls.append((doctype, old, new, merge))
        self.records.discard((doctype, old))
        self.records.add((doctype, new))

    def sql(self, query, values):
        new, old = values
        doctype = query.split("`tab", 1)[1].split("`", 1)[0]
        self.calls.append((doctype, old, new, "sql"))
        self.records.discard((doctype, old))
        self.records.add((doctype, new))


def patch_module(site):
    with patch.dict(sys.modules, site.modules):
        return load("patches/v0_60_0/print_format_names.py", "isolated_print_names_patch")


class RenamePatchTests(unittest.TestCase):
    def test_the_mapping_reaches_only_names_the_installer_creates(self):
        site = FakeSite([])
        module = patch_module(site)
        created = {getattr(NAMES, k) for k in dir(NAMES) if k.isupper() and isinstance(getattr(NAMES, k), str)}
        created |= {NAMES.TAX_INVOICE_A4 + NAMES.POS_SUFFIX}
        for doctype, old, new in module.RENAMES:
            with self.subTest(old=old):
                self.assertIn(new, created, "every target is a name printing/names.py owns")
                self.assertRegex(old, r"Bunood|بونود|بنود|زاتكا", "only branded names move")
        olds = [old for _dt, old, _new in module.RENAMES]
        self.assertEqual(len(olds), len(set((dt, old) for dt, old, _ in module.RENAMES)))
        # The owner's two merges.
        self.assertEqual(module.FORMAT_RENAMES["Bunood Sales Invoice (A4)"], NAMES.TAX_INVOICE_A4)
        self.assertEqual(module.FORMAT_RENAMES["زاتكا - فاتورة مبسطة (حراري 80مم)"], NAMES.SIMPLIFIED_RECEIPT_80)

    def test_rename_then_merge_then_nothing(self):
        site = FakeSite([
            ("Print Format", "بونود - فاتورة ضريبية (A4)"),
            ("Print Format", "Bunood Sales Invoice (A4)"),
            ("Print Format", "بونود - فاتورة مبسطة (حراري 80مم)"),
            ("Print Format", "زاتكا - فاتورة مبسطة (حراري 80مم)"),
            ("Print Style", "Bunood"),
            ("Letter Head", "Bunood"),
        ], single_links={("Print Settings", "print_style"): "Bunood"})
        module = patch_module(site)
        with patch.dict(sys.modules, site.modules):
            moved = module.rename_all()
        self.assertEqual(site.calls[:4], [
            ("Print Format", "بونود - فاتورة ضريبية (A4)", NAMES.TAX_INVOICE_A4, False),
            ("Print Format", "Bunood Sales Invoice (A4)", NAMES.TAX_INVOICE_A4, True),
            ("Print Format", "بونود - فاتورة مبسطة (حراري 80مم)", NAMES.SIMPLIFIED_RECEIPT_80, False),
            ("Print Format", "زاتكا - فاتورة مبسطة (حراري 80مم)", NAMES.SIMPLIFIED_RECEIPT_80, True),
        ])
        # Print Style: only a Single links to it, which Frappe's rename_doc cannot take.
        self.assertIn(("Print Style", "Bunood", NAMES.STYLE_NAME, "sql"), site.calls)
        self.assertEqual(site.singles[("Print Settings", "print_style")], NAMES.STYLE_NAME)
        self.assertIn(("Letter Head", "Bunood", NAMES.LETTERHEAD_NAME, False), site.calls)
        self.assertEqual(len(moved), 6)
        site.frappe.db.commit.assert_called_once()

        site.calls.clear()
        with patch.dict(sys.modules, site.modules):
            self.assertEqual(module.rename_all(), [], "a second run finds nothing to move")
        self.assertEqual(site.calls, [])

    def test_a_style_that_already_exists_absorbs_the_old_one(self):
        site = FakeSite([("Print Style", "Bunood"), ("Print Style", NAMES.STYLE_NAME)],
                        single_links={("Print Settings", "print_style"): "Bunood"})
        module = patch_module(site)
        with patch.dict(sys.modules, site.modules):
            module.rename_all()
        self.assertNotIn(("Print Style", "Bunood"), site.records)
        self.assertEqual(site.singles[("Print Settings", "print_style")], NAMES.STYLE_NAME)


class OldLinkHookTests(unittest.TestCase):
    def load_hook(self, records, path="/printview", form=None):
        site = FakeSite(records)
        site.frappe.local = SimpleNamespace(request=SimpleNamespace(path=path), form_dict=dict(form or {}))
        patch_mod = patch_module(site)
        modules = dict(site.modules)
        modules["bunood_theme.patches.v0_60_0.print_format_names"] = patch_mod
        with patch.dict(sys.modules, modules):
            hook = load("printing/renames.py", "isolated_renames")
            hook.map_old_format_name()
        return site.frappe.local.form_dict

    def test_an_old_receipt_link_reaches_the_renamed_format(self):
        form = self.load_hook([("Print Format", NAMES.SIMPLIFIED_RECEIPT_80)],
                              form={"format": "بونود - فاتورة مبسطة (حراري 80مم)"})
        self.assertEqual(form["format"], NAMES.SIMPLIFIED_RECEIPT_80)

    def test_download_pdf_is_mapped_too(self):
        form = self.load_hook([("Print Format", NAMES.TAX_INVOICE_A4)],
                              path="/api/method/frappe.utils.print_format.download_pdf",
                              form={"format": "Bunood Sales Invoice (A4)"})
        self.assertEqual(form["format"], NAMES.TAX_INVOICE_A4)

    def test_a_kept_old_record_and_other_paths_are_left_alone(self):
        kept = self.load_hook([("Print Format", "Bunood Sales Invoice (A4)"), ("Print Format", NAMES.TAX_INVOICE_A4)],
                              form={"format": "Bunood Sales Invoice (A4)"})
        self.assertEqual(kept["format"], "Bunood Sales Invoice (A4)")
        other = self.load_hook([("Print Format", NAMES.TAX_INVOICE_A4)], path="/app/sales-invoice",
                               form={"format": "Bunood Sales Invoice (A4)"})
        self.assertEqual(other["format"], "Bunood Sales Invoice (A4)")


if __name__ == "__main__":
    unittest.main()
