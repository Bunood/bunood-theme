"""Export and privacy boundaries, independent of a Frappe site."""

import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from zipfile import ZipFile


class Row(dict):
    def __getattr__(self, key):
        return self.get(key)


def load_module():
    fake = types.ModuleType("frappe")
    fake.whitelist = fake.read_only = lambda *args, **kwargs: lambda fn: fn
    fake._ = lambda text: text
    fake.local = Row(lang="ar")
    path = Path(__file__).parents[1] / "bunood_theme" / "report_compat.py"
    spec = importlib.util.spec_from_file_location("bnd_report_compat_test", path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"frappe": fake}):
        spec.loader.exec_module(module)
    return module, fake


def workbook(direction=""):
    stream = io.BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.comment = b"native metadata"
        for index in (1, 2):
            archive.writestr(f"xl/worksheets/sheet{index}.xml",
                            f'<worksheet><sheetViews><sheetView {direction} workbookViewId="0"/></sheetViews>'
                            '<sheetData><row><c><v>15</v></c></row></sheetData></worksheet>')
        archive.writestr("xl/styles.xml", b"native styles")
    return stream.getvalue()


class ReportCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.module, self.frappe = load_module()

    def test_arabic_all_sheets_rtl_cells_styles_metadata_unchanged(self):
        source = workbook('rightToLeft="0"')
        result = self.module._apply_arabic_xlsx_direction(source, "ar-SA")
        with ZipFile(io.BytesIO(result)) as archive:
            self.assertEqual(archive.comment, b"native metadata")
            self.assertEqual(archive.read("xl/styles.xml"), b"native styles")
            for index in (1, 2):
                self.assertIn(b'rightToLeft="1"', archive.read(f"xl/worksheets/sheet{index}.xml"))
                self.assertIn(b"<v>15</v>", archive.read(f"xl/worksheets/sheet{index}.xml"))
        self.assertIs(self.module._set_xlsx_right_to_left(result), result)

    def test_absent_direction_set_and_english_byte_identical(self):
        source = workbook()
        self.assertIs(self.module._apply_arabic_xlsx_direction(source, "en"), source)
        with ZipFile(io.BytesIO(self.module._apply_arabic_xlsx_direction(source))) as archive:
            self.assertIn(b'rightToLeft="1"', archive.read("xl/worksheets/sheet1.xml"))

    def test_optional_own_controller_only_not_dependency_failure(self):
        expected = "frappe.core.report.owned_sql.owned_sql"
        native = types.ModuleType("frappe.core.doctype.report.report")
        native.get_report_module_dotted_path = lambda module, name: expected
        class Base:
            def get_xlsx_styles_from_module(instance, metadata):
                raise ModuleNotFoundError("missing", name=instance.missing)
        class Report(self.module.ReportCompatibility, Base):
            is_standard, report_type, query = "Yes", "Query Report", "SELECT 1"
            module, report_name = "Core", "Owned SQL"
        report = Report()
        with patch.dict(sys.modules, {"frappe.core.doctype.report.report": native}):
            for missing in (expected, "frappe.core.report.owned_sql"):
                report.missing = missing
                self.assertIsNone(report.get_xlsx_styles_from_module({}))
            for missing in ("openpyxl", None, "frappe.core.report.another"):
                report.missing = missing
                with self.assertRaises(ModuleNotFoundError):
                    report.get_xlsx_styles_from_module({})
            report.missing = expected
            for key, value in (("is_standard", "No"), ("report_type", "Script Report"), ("query", "")):
                original = getattr(report, key)
                setattr(report, key, value)
                with self.assertRaises(ModuleNotFoundError):
                    report.get_xlsx_styles_from_module({})
                setattr(report, key, original)

    def test_serial_no_only_exact_invalid_data_and_native_outer_shape(self):
        class Base:
            def execute_script_report(instance, filters):
                return instance.result
            def get(instance, field):
                return getattr(instance, field, False)
        class Report(self.module.ReportCompatibility, Base):
            report_name, is_standard, report_type = "Available Serial No", "Yes", "Script Report"
        report = Report()
        for outer in (tuple, list):
            columns, extra = [{"fieldname": "serial_no"}], {"native": True}
            report.result = outer([columns, ([], []), extra])
            value = report.execute_script_report({})
            self.assertIsInstance(value, outer)
            self.assertIs(value[0], columns)
            self.assertEqual(value[1], [])
            self.assertIs(value[2], extra)
        for data in ([], [{"serial_no": "owned"}], ([1], []), None):
            report.result = ([], data)
            self.assertIs(report.execute_script_report({}), report.result)
        report.report_name = "Other Report"
        report.result = ([], ([], []))
        self.assertIs(report.execute_script_report({}), report.result)
        report.report_name = "Available Serial No"
        report.snapshot_report = True
        self.assertIs(report.execute_script_report({}), report.result)

    def ledger(self):
        return {"columns": [{"fieldname": "voucher_no"}], "result": [
            {"voucher_type": "Payment Entry", "voucher_no": "PE-owned"},
            {"voucher_type": "Sales Invoice", "voucher_no": "SI-owned"}, {}]}

    def fields(self, permitted):
        model = types.ModuleType("frappe.model")
        model.get_permitted_fields = lambda *args, **kwargs: permitted
        return patch.dict(sys.modules, {"frappe.model": model})

    def test_no_payment_permission_no_lookup_or_inferred_origin(self):
        self.frappe.has_permission = lambda *args, **kwargs: False
        self.frappe.get_list = lambda *args, **kwargs: self.fail("unauthorized lookup")
        result = self.ledger()
        self.module._add_ledger_statement(result)
        self.assertEqual(result["result"][0]["bnd_statement"], "Payment Entry")
        self.assertEqual(result["result"][1]["bnd_statement"], "Sales Invoice")
        self.assertNotIn("bnd_statement", result["result"][2])

    def test_hidden_payment_fields_not_queried_or_disclosed(self):
        self.frappe.has_permission = lambda *args, **kwargs: True
        requested = []
        def get_list(doctype, **kwargs):
            requested.append(kwargs["fields"])
            return [Row(name="PE-owned", payment_type="Receive")]
        self.frappe.get_list = get_list
        with self.fields(["name", "payment_type"]):
            result = self.ledger()
            self.module._add_ledger_statement(result)
            self.assertEqual(result["result"][0]["bnd_statement"], "Receipt Voucher")
            self.assertEqual(requested, [["name", "payment_type"]])
        with self.fields(["name"]):
            result = self.ledger()
            self.module._add_ledger_statement(result)
            self.assertEqual(result["result"][0]["bnd_statement"], "Payment Entry")
            self.assertEqual(len(requested), 1)

    def test_visible_origin_enrichment_idempotent_and_native_list_filtered(self):
        self.frappe.has_permission = lambda *args, **kwargs: True
        origin = self.module.PAYMENT_ORIGIN_FIELD
        permitted = ["name", "payment_type", "mode_of_payment", "total_allocated_amount", origin]
        calls = []
        def get_list(doctype, **kwargs):
            calls.append(kwargs)
            return [Row(name="PE-owned", payment_type="Receive", mode_of_payment="Cash",
                        total_allocated_amount=0, **{origin: "credit_collection"})]
        self.frappe.get_list = get_list
        with self.fields(permitted):
            result = self.ledger()
            self.module._add_ledger_statement(result)
            self.module._add_ledger_statement(result)
        self.assertEqual(result["result"][0]["bnd_statement"], "Later receipt for credit sale (Not allocated to an invoice) — Cash")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["filters"], {"name": ["in", ["PE-owned"]]})
        self.assertEqual([c["fieldname"] for c in result["columns"]], ["voucher_no", "bnd_statement"])

    def test_review_exact_native_query_repair_has_no_internal_commit(self):
        native_query = "SELECT `tabQuality Action`.document_type FROM `tabQuality Action`"
        upstream = dict(report_name="Review", ref_doctype="Quality Action", module="Quality Management", query=native_query)
        report = Row(is_standard="Yes", report_type="Query Report", **upstream)
        report.pop("report_name")
        writes = []
        self.frappe.db = Row(exists=lambda *args: True, set_value=lambda *args, **kwargs: writes.append((args, kwargs)),
                             commit=lambda: self.fail("internal commit"))
        self.frappe.get_meta = lambda name: Row(get_field=lambda field: field == "review")
        self.frappe.get_doc = lambda *args: report
        self.frappe.get_app_path = lambda *args: "owned-upstream.json"
        self.frappe.clear_document_cache = lambda *args: None
        with patch.object(Path, "read_text", return_value=json.dumps(upstream)):
            self.assertTrue(self.module.sync_report_compatibility()["review_query_updated"])
            self.assertEqual(len(writes), 1)
            for key, value in (("query", native_query + " -- owner custom"), ("is_standard", "No"),
                               ("module", "Owner Module"), ("ref_doctype", "ToDo"), ("report_type", "Script Report")):
                previous = report[key]
                report[key] = value
                self.assertFalse(self.module.sync_report_compatibility()["review_query_updated"])
                report[key] = previous
            self.assertEqual(len(writes), 1)

    def test_native_general_ledger_boundary_keeps_values_shape_and_snapshot(self):
        class Base:
            def execute_script_report(instance, filters):
                return instance.result
            def get(instance, field):
                return getattr(instance, field, False)
        class Report(self.module.ReportCompatibility, Base):
            report_name, is_standard, report_type = "General Ledger", "Yes", "Script Report"
        report = Report()
        self.frappe.has_permission = lambda *args, **kwargs: False
        for outer in (list, tuple):
            data = self.ledger()
            data["result"][0]["debit"] = 15
            extra = {"native": True}
            report.result = outer([data["columns"], data["result"], extra])
            result = report.execute_script_report({})
            self.assertIs(result, report.result)
            self.assertIs(result[2], extra)
            self.assertEqual(result[1][0]["debit"], 15)
            self.assertEqual(result[1][0]["bnd_statement"], "Payment Entry")
        report.snapshot_report = True
        data = self.ledger()
        report.result = (data["columns"], data["result"])
        self.assertIs(report.execute_script_report({}), report.result)
        self.assertNotIn("bnd_statement", report.result[1][0])


if __name__ == "__main__":
    unittest.main()
