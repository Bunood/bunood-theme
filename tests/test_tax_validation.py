import importlib.util
from pathlib import Path
import sys
import types
import unittest


def load_module():
    fake = types.ModuleType("frappe")
    fake._ = lambda value: value
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "tax_validation.py"
    spec = importlib.util.spec_from_file_location("bunood_tax_validation_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TaxValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tax = load_module()

    def issues(self, rows, accounts=("Output VAT - BD",), template="KSA VAT 15%"):
        return self.tax.find_tax_configuration_issues(
            rows, accounts, selected_template=template
        )

    def test_selected_template_must_contain_rows(self):
        self.assertEqual(self.issues([])[0]["code"], "empty_template")
        self.assertEqual(self.issues([], template=""), [])

    def test_blank_or_invalid_rate_names_the_row(self):
        for value, code in ((None, "blank_rate"), ("", "blank_rate"), ("bad", "invalid_rate"), (-1, "invalid_rate")):
            with self.subTest(value=value):
                issue = self.issues([{
                    "idx": 4,
                    "account_head": "Output VAT - BD",
                    "charge_type": "On Net Total",
                    "rate": value,
                }])[0]
                self.assertEqual(issue["code"], code)
                self.assertEqual(issue["rows"], [4])

    def test_explicit_zero_rate_is_valid(self):
        self.assertEqual(self.issues([{
            "idx": 1,
            "account_head": "Output VAT - BD",
            "charge_type": "On Net Total",
            "rate": 0,
        }]), [])

    def test_one_tax_account_cannot_carry_conflicting_rates(self):
        issue = self.issues([
            {"idx": 2, "account_head": "Output VAT - BD", "charge_type": "On Net Total", "rate": 15},
            {"idx": 5, "account_head": "Output VAT - BD", "charge_type": "On Net Total", "rate": 5},
        ])[0]
        self.assertEqual(issue, {
            "code": "conflicting_rates",
            "account": "Output VAT - BD",
            "rates": ["5", "15"],
            "rows": [2, 5],
        })

    def test_non_tax_accounts_and_matching_rates_are_not_rejected(self):
        rows = [
            {"idx": 1, "account_head": "Freight - BD", "charge_type": "On Net Total", "rate": 5},
            {"idx": 2, "account_head": "Freight - BD", "charge_type": "On Net Total", "rate": 10},
            {"idx": 3, "account_head": "Output VAT - BD", "charge_type": "On Net Total", "rate": 15},
            {"idx": 4, "account_head": "Output VAT - BD", "charge_type": "On Net Total", "rate": "15.0"},
        ]
        self.assertEqual(self.issues(rows), [])


if __name__ == "__main__":
    unittest.main()
