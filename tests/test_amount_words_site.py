"""Print adapter tests; run with an initialized Frappe site, without DB writes."""

import unittest
from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.utils.number_format import NUMBER_FORMAT_MAP, NumberFormat
from frappe.utils.print_format import print_language

from bunood_theme.printing.jinja import bunood_amount_in_words


class AmountWordsSiteTest(unittest.TestCase):
    def test_all_native_number_formats_match_the_display(self):
        with print_language("ar"):
            for name in NUMBER_FORMAT_MAP:
                number_format = NumberFormat.from_string(name)
                with self.subTest(format=name), \
                     patch("frappe.locale.get_number_format", return_value=number_format), \
                     patch("frappe.utils.data.get_number_format", return_value=number_format):
                    actual = bunood_amount_in_words(1400.5, "SAR", 2)
                    expected = "ألف وأربعمائة ريال سعودي"
                    if number_format.decimal_separator:
                        expected += " وخمسون هللة"
                    self.assertEqual(actual, expected + " فقط لا غير")

    def test_precision_and_carry_follow_native_display(self):
        number_format = NumberFormat.from_string("#,###.##")
        with print_language("ar"), \
             patch("frappe.locale.get_number_format", return_value=number_format), \
             patch("frappe.utils.data.get_number_format", return_value=number_format):
            self.assertEqual(bunood_amount_in_words(1.999, "SAR", 2), "ريالان سعوديان فقط لا غير")
            self.assertEqual(bunood_amount_in_words(1.4, "SAR", 0), "ريال سعودي واحد فقط لا غير")
            self.assertEqual(bunood_amount_in_words(-1.999, "SAR", 2), "سالب ريالان سعوديان فقط لا غير")
            self.assertEqual(bunood_amount_in_words(0.001, "SAR", 3), "")

    def test_native_english_and_foreign_currency_wording_preserved(self):
        for language, currency in (("en", "SAR"), ("en", "USD"), ("ar", "USD")):
            with self.subTest(language=language, currency=currency), print_language(language):
                expected = frappe.utils.money_in_words(1400.5, currency)
                if currency == "SAR":
                    expected = expected.replace("SAR", "Saudi riyals")
                self.assertEqual(bunood_amount_in_words(1400.5, currency, 2), expected)
                self.assertEqual(bunood_amount_in_words(-1400.5, currency, 2), frappe._("Negative") + " " + expected)

    def test_repeated_languages_do_not_leak(self):
        for language in ("en", "ar", "en", "ar"):
            with print_language(language):
                words = bunood_amount_in_words(1400, "SAR")
                if language == "ar":
                    self.assertEqual(words, "ألف وأربعمائة ريال سعودي فقط لا غير")
                else:
                    self.assertNotIn("ريال", words)

    def test_nonfinite_amounts_do_not_print_false_words(self):
        with print_language("ar"):
            for value in (Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")):
                with self.subTest(value=str(value)):
                    self.assertEqual(bunood_amount_in_words(value, "SAR"), "")
