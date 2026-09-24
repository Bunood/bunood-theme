"""POS payment setup contract, independent of invoice/receivables capabilities."""

from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class PaymentSetupContractTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")

    def test_network_is_separate_bank_clearing_account(self):
        self.assertIn('NETWORK_MODE = "Network"', self.source)
        self.assertIn('NETWORK_ACCOUNT_NAME = "Network Card Clearing"', self.source)
        self.assertIn('network_mode = _mode(NETWORK_MODE, "Bank")', self.source)
        self.assertIn('"account_type": "Bank"', self.source)
        self.assertIn("current != cash_account", self.source)

    def test_card_uses_native_mode_and_existing_clearing_ledger(self):
        self.assertIn('CARD_MODE = "Credit Card"', self.source)
        self.assertIn('card_mode = _mode(CARD_MODE, "Bank")', self.source)
        self.assertIn("_set_safe_clearing_mapping(", self.source)
        self.assertNotIn('MIXED_MODE = "Mixed Payment"', self.source)

    def test_setup_supplies_native_company_bank_default(self):
        self.assertIn("def _ensure_default_bank_account(", self.source)
        self.assertIn('company.db_set("default_bank_account", account', self.source)
        self.assertIn("_ensure_default_bank_account(company, network_account)", self.source)

    def test_all_lifecycles_and_existing_site_patch_run_setup(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        patches = (ROOT / "bunood_theme" / "patches.txt").read_text(encoding="utf-8")
        self.assertEqual(setup.count("ensure_pos_payment_setup()"), 3)
        self.assertIn("v0_46_11.pos_payment_ledgers", patches)
        self.assertIn("v0_46_33.network_mode_english", patches)

    def test_existing_valid_profile_defaults_are_preserved(self):
        self.assertIn("if CASH_MODE not in methods", self.source)
        self.assertIn("if NETWORK_MODE not in methods", self.source)
        self.assertIn("Existing\n    # valid defaults are preserved", self.source)

    def test_network_key_is_language_neutral_and_translated(self):
        patch = (
            ROOT / "bunood_theme" / "patches" / "v0_46_33" / "network_mode_english.py"
        ).read_text(encoding="utf-8")
        arabic = (ROOT / "bunood_theme" / "translations" / "ar.csv").read_text(
            encoding="utf-8"
        )
        self.assertIn('CANONICAL_NETWORK_MODE = "Network"', patch)
        self.assertIn("from frappe.model.rename_doc import rename_doc", patch)
        self.assertIn("Network,شبكة,", arabic)


if __name__ == "__main__":
    unittest.main()
