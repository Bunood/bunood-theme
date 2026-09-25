import importlib.util
from pathlib import Path
import sys
import types
import unittest


def load_module():
    fake = types.ModuleType("frappe")
    fake._ = lambda value: value
    fake.whitelist = lambda **_kwargs: lambda function: function
    sys.modules["frappe"] = fake
    path = Path(__file__).parents[1] / "bunood_theme" / "vat.py"
    spec = importlib.util.spec_from_file_location("bunood_vat_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VatTreatmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vat = load_module()

    def test_profiles_keep_standard_and_exempt_legally_distinct(self):
        templates = [
            {"name": "KSA VAT 15%", "tax_category": "Standard", "is_default": 1},
            {"name": "KSA VAT Exempt", "tax_category": "", "is_default": 0},
            {"name": "Zero-rated exports", "tax_category": "Zero rated", "is_default": 0},
        ]
        rows = [
            {"parent": "KSA VAT 15%", "charge_type": "On Net Total", "account_head": "Output VAT", "rate": 15},
            {"parent": "KSA VAT Exempt", "charge_type": "On Net Total", "account_head": "Output VAT", "rate": 0},
            {"parent": "Zero-rated exports", "charge_type": "On Net Total", "account_head": "Output VAT", "rate": 0},
        ]
        rules = [{"template": "KSA VAT Exempt", "tax_category": "KSA VAT Exempt"}]

        profiles = self.vat._treatment_profiles(templates, rows, rules)

        self.assertEqual(profiles["standard"]["template"], "KSA VAT 15%")
        self.assertEqual(profiles["standard"]["rate"], 15)
        self.assertEqual(profiles["exempt"]["template"], "KSA VAT Exempt")
        self.assertEqual(profiles["exempt"]["tax_category"], "KSA VAT Exempt")
        self.assertNotEqual(profiles["exempt"]["template"], "Zero-rated exports")

    def test_unlabelled_zero_rate_is_not_presented_as_exempt(self):
        profiles = self.vat._treatment_profiles(
            [{"name": "Zero VAT", "tax_category": "Zero rated", "is_default": 0}],
            [{"parent": "Zero VAT", "charge_type": "On Net Total", "account_head": "Output VAT", "rate": 0}],
            [],
        )
        self.assertIsNone(profiles["standard"])
        self.assertIsNone(profiles["exempt"])


if __name__ == "__main__":
    unittest.main()
