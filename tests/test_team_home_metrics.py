import importlib.util
from pathlib import Path
from datetime import date
import unittest

spec = importlib.util.spec_from_file_location('metrics', Path(__file__).parents[1] / 'bunood_theme/home_metrics.py')
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


class MetricContractTests(unittest.TestCase):
    def test_all_time_still_excludes_future_native_documents(self):
        cards = metrics.home_metric_contract(company='A', month_start=None, as_of=date(2026, 10, 6), period='all_time')
        self.assertEqual(cards[0]['filters']['transaction_date'], ['<=', '2026-10-06'])
        self.assertEqual(cards[2]['filters']['posting_date'], ['<=', '2026-10-06'])

    def test_native_order_population_and_signed_base_values(self):
        cards = metrics.home_metric_contract(company='A', month_start=date(2026, 10, 1), as_of=date(2026, 10, 6), sales_person='S')
        result = metrics.build_home_kpis(cards, order_rows=[{'base_grand_total':100}, {'base_grand_total':300}], invoice_rows=[{'base_grand_total':75}, {'base_grand_total':-15}], outstanding_value=-4)
        self.assertEqual([row['value'] for row in result], [2, 400, 60, -4, 200])
        self.assertTrue(all(row['filters']['docstatus'] == 1 for row in result))
        self.assertTrue(all(row['filters']['sales_team.sales_person'] == 'S' for row in result))
        self.assertEqual(result[3]['filters']['posting_date'], ['<=', '2026-10-06'])

    def test_foreign_outstanding_has_explicit_basis(self):
        self.assertEqual(metrics.base_outstanding({'outstanding_amount':100,'party_account_currency':'USD','currency':'USD','conversion_rate':3.75}, 'SAR'),375)
        self.assertEqual(metrics.base_outstanding({'outstanding_amount':100,'party_account_currency':'SAR','conversion_rate':3.75}, 'SAR'),100)
        with self.assertRaises(ValueError):
            metrics.base_outstanding({'outstanding_amount':100,'party_account_currency':'USD','currency':'USD','conversion_rate':0}, 'SAR')
        self.assertEqual(metrics.base_outstanding({'outstanding_amount':-100,'party_account_currency':'USD','currency':'USD','conversion_rate':3.75}, 'SAR'),-375)
        with self.assertRaises(ValueError):
            metrics.base_outstanding({'outstanding_amount':100,'party_account_currency':'EUR','currency':'USD','conversion_rate':3.75}, 'SAR')

    def test_reorder_group_precedence_missing_bin_boundary_and_deduplication(self):
        warehouses=[{'name':'Group','parent_warehouse':None,'is_group':1},{'name':'A','parent_warehouse':'Group','is_group':0},{'name':'B','parent_warehouse':'Group','is_group':0}]
        levels=[{'parent':'Item','warehouse':'A','warehouse_group':'Group','warehouse_reorder_level':5,'warehouse_reorder_qty':1}]
        bins=[{'item_code':'Item','warehouse':'A','projected_qty':3},{'item_code':'Item','warehouse':'B','projected_qty':3}]
        self.assertEqual(metrics.stock_reorder_names(levels,warehouses,bins),[])
        bins[1]['projected_qty']=2
        self.assertEqual(metrics.stock_reorder_names(levels*2,warehouses,bins),['Item'])
        self.assertEqual(metrics.stock_reorder_names(levels,warehouses,[]),['Item'])
        self.assertEqual(metrics.stock_reorder_names(levels,[warehouses[1]],[]),[])


if __name__ == '__main__':
    unittest.main()
