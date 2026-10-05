"""The fixed-asset workbench's server context (``bunood_theme/asset_workbench.py``).

Pure checks with a fake ``frappe``: the lifecycle state each asset is shown in,
the period guard, and that the module only reads through Frappe's permission
query layer. No site.
"""

from datetime import date
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "bunood_theme" / "asset_workbench.py"


def load():
    fake = types.ModuleType("frappe")
    fake._ = lambda text: text
    fake.throw = lambda message, *args: (_ for _ in ()).throw(ValueError(message))
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda value: value if isinstance(value, date) else date.fromisoformat(str(value))
    utils.date_diff = lambda end, start: (end - start).days
    utils.flt = lambda value: float(value or 0)
    utils.nowdate = lambda: "2026-10-03"
    utils.now_datetime = lambda: "2026-10-03 12:00:00"
    with patch.dict(sys.modules, {"frappe": fake, "frappe.utils": utils}):
        namespace = {"__name__": "asset_workbench_test"}
        exec(compile(SOURCE.read_text(encoding="utf-8"), str(SOURCE), "exec"), namespace)
    return namespace


class AssetWorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def state(self, **row):
        return self.m["_asset_state"](row, date(2026, 10, 31))

    def test_each_asset_is_shown_in_its_lifecycle_state(self):
        self.assertEqual(self.state(docstatus=2), "cancelled")
        self.assertEqual(self.state(docstatus=0, status="Draft"), "draft-review")
        self.assertEqual(self.state(docstatus=1, status="Sold"), "disposed")
        self.assertEqual(self.state(docstatus=1, status="Submitted", depr_entry_posting_status="Failed"), "depreciation-failed")
        self.assertEqual(self.state(docstatus=1, status="Partially Depreciated", calculate_depreciation=1,
                                    next_depreciation_date="2026-10-15"), "depreciation-due")
        self.assertEqual(self.state(docstatus=1, status="In Maintenance"), "service-attention")
        self.assertEqual(self.state(docstatus=1, status="Fully Depreciated"), "fully-depreciated")
        self.assertEqual(self.state(docstatus=1, status="Submitted"), "in-use")

    def test_a_disposed_asset_is_never_due(self):
        self.assertFalse(self.m["_is_due"]({"docstatus": 1, "status": "Scrapped", "calculate_depreciation": 1,
                                             "next_depreciation_date": "2026-01-01"}, date(2026, 10, 31)))

    def test_the_period_is_ordered_and_bounded(self):
        start, end = self.m["_period"]("2026-01-01", "2026-10-03")
        self.assertEqual((start, end), (date(2026, 1, 1), date(2026, 10, 3)))
        with self.assertRaises(ValueError):
            self.m["_period"]("2026-10-04", "2026-10-03")
        with self.assertRaises(ValueError):
            self.m["_period"]("2025-01-01", "2026-10-03")

    def test_it_only_reads(self):
        source = SOURCE.read_text(encoding="utf-8")
        for write in (".insert(", ".save(", ".submit(", "set_value(", "db.sql(", "frappe.get_all(",
                      "ignore_permissions", ".delete(", "enqueue("):
            self.assertNotIn(write, source)
        self.assertIn("frappe.get_list(doctype, **kwargs)", source)
        self.assertIn('company_doc.check_permission("read")', source)


if __name__ == "__main__":
    unittest.main()
