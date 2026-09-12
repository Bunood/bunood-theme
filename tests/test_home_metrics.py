from datetime import date
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from bunood_theme.home_metrics import build_home_kpis, home_metric_contract


class HomeMetricContractTests(unittest.TestCase):
    def setUp(self):
        self.contract = home_metric_contract(
            company="Bunood",
            month_start=date(2026, 9, 1),
            as_of=date(2026, 9, 12),
        )

    def test_every_metric_declares_period_currency_status_and_drilldown(self):
        self.assertEqual(
            [metric["key"] for metric in self.contract],
            ["order_count", "booked_value", "invoiced_value", "outstanding_value", "average_order_value"],
        )
        for metric in self.contract:
            self.assertEqual(metric["currency_basis"], "company")
            self.assertEqual(metric["filters"]["company"], "Bunood")
            self.assertEqual(metric["filters"]["docstatus"], 1)
            self.assertTrue(metric["period_label"])
            self.assertIn(metric["doctype"], {"Sales Order", "Sales Invoice"})

        order_filters = self.contract[0]["filters"]
        self.assertEqual(order_filters["transaction_date"], ["between", ["2026-09-01", "2026-09-12"]])
        invoice_filters = self.contract[2]["filters"]
        self.assertEqual(invoice_filters["posting_date"], ["between", ["2026-09-01", "2026-09-12"]])
        outstanding_filters = self.contract[3]["filters"]
        self.assertEqual(outstanding_filters["outstanding_amount"], ["!=", 0])
        self.assertNotIn("posting_date", outstanding_filters)

    def test_average_and_totals_share_one_filtered_population(self):
        kpis = build_home_kpis(
            self.contract,
            order_rows=[
                {"base_grand_total": 100},
                # The transaction is 100,000 JPY, but its company-currency
                # value is 2,500 SAR. The KPI must never sum grand_total.
                {"grand_total": 100_000, "base_grand_total": 2_500},
            ],
            invoice_rows=[
                {"grand_total": 100_000, "base_grand_total": 2_500},
                {"base_grand_total": -200},
            ],
            outstanding_value=460,
        )
        values = {metric["key"]: metric["value"] for metric in kpis}
        self.assertEqual(values["order_count"], 2)
        self.assertEqual(values["booked_value"], 2_600)
        self.assertEqual(values["average_order_value"], 1_300)
        self.assertEqual(values["invoiced_value"], 2_300)
        self.assertEqual(values["outstanding_value"], 460)

    def test_empty_average_is_zero_not_nan_or_infinity(self):
        kpis = build_home_kpis(
            self.contract,
            order_rows=[],
            invoice_rows=[],
            outstanding_value=0,
        )
        average = next(metric for metric in kpis if metric["key"] == "average_order_value")
        self.assertEqual(average["value"], 0)


if __name__ == "__main__":
    unittest.main()
