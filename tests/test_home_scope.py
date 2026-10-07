from datetime import date
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from bunood_theme.home_scope import default_view, period_bounds


class HomeScopeTests(unittest.TestCase):
    def test_period_presets_all_end_today(self):
        today = date(2026, 9, 27)
        expected = {
            "today": date(2026, 9, 27),
            "last_7_days": date(2026, 9, 21),
            "month_to_date": date(2026, 9, 1),
            "last_30_days": date(2026, 8, 29),
            "all_time": None,
        }
        for period, start in expected.items():
            with self.subTest(period=period):
                self.assertEqual(period_bounds(today, period), (start, today))

    def test_rejects_unknown_period(self):
        with self.assertRaises(ValueError):
            period_bounds(date(2026, 9, 27), "last_year")

    def test_role_default_only_uses_available_views(self):
        available = {"overview", "accountant", "sales", "collections", "cashier"}
        self.assertEqual(default_view({"Sales User"}, available), "sales")
        self.assertEqual(default_view({"Accounts User"}, available), "accountant")
        self.assertEqual(default_view({"Accounts Manager", "Sales User"}, available), "accountant")
        self.assertEqual(default_view({"POS User"}, available), "cashier")
        self.assertEqual(default_view({"POS User"}, {"overview", "sales"}), "overview")
        self.assertEqual(default_view({"POS User"}, available, administrator=True), "overview")


if __name__ == "__main__":
    unittest.main()
