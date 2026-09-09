import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest
from zipfile import ZipFile


class FakeField:
    pass


class FakeMeta:
    def __init__(self, fields):
        self.fields = fields

    def get_field(self, name):
        return FakeField() if name in self.fields else None


class FakeDB:
    def __init__(self, query):
        self.query = query
        self.writes = []
        self.commits = 0

    def exists(self, doctype, name):
        return (doctype, name) in {("Report", "Review"), ("DocType", "Quality Action")}

    def get_value(self, doctype, name, fieldname):
        return self.query

    def set_value(self, doctype, name, fieldname, value, update_modified=True):
        self.writes.append((doctype, name, fieldname, value, update_modified))
        self.query = value

    def commit(self):
        self.commits += 1


def load_module(query, fields=("review",)):
    fake = types.ModuleType("frappe")
    fake.whitelist = lambda *args, **kwargs: lambda fn: fn
    fake.read_only = lambda *args, **kwargs: lambda fn: fn
    fake.db = FakeDB(query)
    fake.get_meta = lambda doctype: FakeMeta(fields)
    fake.clear_document_cache = lambda *args: None
    fake.log_error = lambda *args: None
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "report_compat.py"
    spec = importlib.util.spec_from_file_location("bunood_report_compat_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, fake


class ReportCompatibilityTests(unittest.TestCase):
    def test_only_invalid_empty_serial_tuple_is_normalised(self):
        module, _ = load_module("SELECT 1")
        self.assertEqual(module._normalise_available_serial_rows(([], [])), [])
        for value in ([], [{"item_code": "A"}], ([1], [2]), None):
            with self.subTest(value=value):
                self.assertIs(module._normalise_available_serial_rows(value), value)

    def test_obsolete_review_query_is_replaced_idempotently(self):
        module, fake = load_module(
            "SELECT `tabQuality Action`.document_type FROM `tabQuality Action`"
        )
        self.assertTrue(module.sync_report_compatibility()["review_query_updated"])
        self.assertIn("`tabQuality Action`.review", fake.db.query)
        self.assertNotIn(module.OBSOLETE_REVIEW_COLUMN, fake.db.query)
        self.assertEqual(fake.db.commits, 1)
        self.assertFalse(module.sync_report_compatibility()["review_query_updated"])
        self.assertEqual(fake.db.commits, 1)

    def test_future_schema_or_upstream_query_is_not_overwritten(self):
        module, fake = load_module("SELECT name FROM `tabQuality Action`")
        self.assertFalse(module.sync_report_compatibility()["review_query_updated"])
        self.assertEqual(fake.db.writes, [])

    def test_missing_report_controller_matching_is_exact_or_parent_only(self):
        module, _ = load_module("SELECT 1")
        expected = "erpnext.accounts.report.sql_only.sql_only"
        for missing in (
            expected,
            "erpnext.accounts.report.sql_only",
            "erpnext.accounts.report",
        ):
            with self.subTest(missing=missing):
                self.assertTrue(module._missing_module_is_report_controller(expected, missing))

        for missing in (None, "openpyxl", "erpnext.accounts.report.other_report"):
            with self.subTest(missing=missing):
                self.assertFalse(module._missing_module_is_report_controller(expected, missing))

        module, fake = load_module(
            "SELECT `tabQuality Action`.document_type FROM `tabQuality Action`",
            fields=("review", "document_type"),
        )
        self.assertFalse(module.sync_report_compatibility()["review_query_updated"])
        self.assertEqual(fake.db.writes, [])

    def test_arabic_xlsx_sets_rtl_without_rebuilding_other_parts(self):
        module, fake = load_module("SELECT 1")
        fake.local = types.SimpleNamespace(lang="ar")
        source = io.BytesIO()
        worksheet = (
            b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            b'<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>'
            b'<sheetData><row r="1"><c r="A1" t="n"><v>15</v></c></row></sheetData>'
            b'</worksheet>'
        )
        with ZipFile(source, "w") as archive:
            archive.writestr("xl/worksheets/sheet1.xml", worksheet)
            archive.writestr("xl/styles.xml", b"unchanged-styles")

        result = module._apply_arabic_xlsx_direction(source.getvalue())
        with ZipFile(io.BytesIO(result)) as archive:
            updated = archive.read("xl/worksheets/sheet1.xml")
            self.assertIn(b'rightToLeft="1"', updated)
            self.assertIn(b'<v>15</v>', updated)
            self.assertEqual(archive.read("xl/styles.xml"), b"unchanged-styles")

        self.assertEqual(module._set_xlsx_right_to_left(result), result)

    def test_non_arabic_xlsx_is_byte_identical(self):
        module, fake = load_module("SELECT 1")
        fake.local = types.SimpleNamespace(lang="en")
        content = b"not-opened-because-language-is-not-arabic"
        self.assertIs(module._apply_arabic_xlsx_direction(content), content)


if __name__ == "__main__":
    unittest.main()
