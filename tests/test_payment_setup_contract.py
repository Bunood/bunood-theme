from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class PaymentSetupContractTests(unittest.TestCase):
    def test_network_is_a_separate_bank_clearing_account(self):
        source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")
        self.assertIn('NETWORK_MODE = "Network"', source)
        self.assertIn('NETWORK_ACCOUNT_NAME = "Network Card Clearing"', source)
        self.assertIn('network_mode = _mode(NETWORK_MODE, "Bank")', source)
        self.assertIn('"account_type": "Bank"', source)
        self.assertIn("current != cash_account", source)
        self.assertIn("replace=bool(current and current != account)", source)

    def test_credit_card_uses_the_native_mode_and_the_existing_clearing_ledger(self):
        source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")
        self.assertIn('CARD_MODE = "Credit Card"', source)
        self.assertIn('card_mode = _mode(CARD_MODE, "Bank")', source)
        self.assertIn("_set_safe_clearing_mapping(", source)
        self.assertNotIn('MIXED_MODE = "Mixed Payment"', source)

    def test_payment_setup_supplies_a_native_company_bank_default_for_dashboards(self):
        source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")
        self.assertIn("def _ensure_default_bank_account(", source)
        self.assertIn('company.db_set("default_bank_account", account', source)
        self.assertIn("_ensure_default_bank_account(company, network_account)", source)

    def test_every_lifecycle_and_existing_site_patch_runs_the_setup(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        patch_list = (ROOT / "bunood_theme" / "patches.txt").read_text(encoding="utf-8")
        self.assertEqual(setup.count("ensure_pos_payment_setup()"), 3)
        self.assertIn("v0_46_11.pos_payment_ledgers", patch_list)
        self.assertIn("v0_46_33.network_mode_english", patch_list)

    def test_both_methods_are_added_without_replacing_valid_defaults(self):
        source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")
        self.assertIn("if CASH_MODE not in methods", source)
        self.assertIn("if NETWORK_MODE not in methods", source)
        self.assertIn("Existing\n    # valid defaults are preserved", source)

    def test_release_verifier_covers_cash_network_and_mixed_posting(self):
        source = (
            ROOT / "bunood_theme" / "verification" / "payment_matrix.py"
        ).read_text(encoding="utf-8")
        self.assertIn('(\"PAY-01\", \"Cash only\", 100.0, 0.0)', source)
        self.assertIn('(\"PAY-02\", \"Network only\", 0.0, 100.0)', source)
        self.assertIn('(\"PAY-03\", \"Mixed Cash and Network\", 40.0, 60.0)', source)
        self.assertIn('"id": "PAY-04"', source)
        self.assertIn("_post_standard_invoice_mixed_case", source)
        self.assertIn('"database savepoint plus unconditional rollback"', source)

    def test_invoice_settlement_keeps_mixed_as_a_workflow_not_a_mode_master(self):
        source = (ROOT / "bunood_theme" / "printing" / "install.py").read_text(
            encoding="utf-8"
        )
        self.assertIn('CREDIT_SALE = "On Credit"', source)
        self.assertIn('MIXED_PAYMENT = "Mixed Payment"', source)
        self.assertIn(
            'SETTLEMENT_METHODS = (CREDIT_SALE, "Cash", "Network", MIXED_PAYMENT)',
            source,
        )
        self.assertIn('"fieldtype": "Select"', source)
        self.assertNotIn('"options": "Mode of Payment"', source)

    def test_mixed_invoice_payment_uses_only_native_payment_entry_posting(self):
        source = (ROOT / "bunood_theme" / "payments.py").read_text(encoding="utf-8")
        self.assertIn("def post_mixed_invoice_payment(", source)
        self.assertIn(
            "from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry",
            source,
        )
        self.assertIn('get_payment_entry(\n            "Sales Invoice"', source)
        self.assertIn("payment.insert()", source)
        self.assertIn("payment.submit()", source)
        self.assertIn('"engine": "ERPNext Payment Entry"', source)
        self.assertNotIn('frappe.get_doc({"doctype": "GL Entry"', source)
        self.assertNotIn("frappe.db.commit()", source)

    def test_network_has_one_english_database_key_and_an_arabic_translation(self):
        patch = (
            ROOT
            / "bunood_theme"
            / "patches"
            / "v0_46_33"
            / "network_mode_english.py"
        ).read_text(encoding="utf-8")
        po = (ROOT / "bunood_theme" / "locale" / "ar.po").read_text(encoding="utf-8")
        csv = (ROOT / "bunood_theme" / "translations" / "ar.csv").read_text(
            encoding="utf-8"
        )
        self.assertIn('LEGACY_NETWORK_MODE = "شبكة"', patch)
        self.assertIn('CANONICAL_NETWORK_MODE = "Network"', patch)
        self.assertIn("from frappe.model.rename_doc import rename_doc", patch)
        self.assertIn("rename_doc(", patch)
        self.assertIn('msgid "Network"\nmsgstr "شبكة"', po)
        self.assertIn("Network,شبكة,", csv)

    def test_receivables_verifier_covers_full_customer_ledger_flow(self):
        source = (
            ROOT / "bunood_theme" / "verification" / "receivables_matrix.py"
        ).read_text(encoding="utf-8")
        for evidence in (
            "credit invoice outstanding",
            "invoice Accounts Receivable debit",
            "receipt Accounts Receivable credit",
            "receipt cash debit",
            "customer statement balance",
            "invoice balance card",
            "database savepoint plus unconditional rollback",
        ):
            self.assertIn(evidence, source)

    def test_quote_to_cash_verifier_uses_native_mappers_and_rolls_back(self):
        source = (
            ROOT / "bunood_theme" / "verification" / "quote_to_cash_matrix.py"
        ).read_text(encoding="utf-8")
        for evidence in (
            "make_sales_invoice(quotation.name)",
            'get_payment_entry(\n            "Sales Invoice"',
            "Native mapper did not retain the Quotation source lines",
            "reconciled invoice outstanding",
            "database savepoint plus unconditional rollback",
            "frappe.db.rollback(save_point=outer)",
        ):
            self.assertIn(evidence, source)


if __name__ == "__main__":
    unittest.main()
