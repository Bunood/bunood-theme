"""Grammar regressions; needs only Frappe's existing num2words dependency."""

import unittest
from decimal import Decimal, getcontext

from num2words import num2words

from bunood_theme.printing.amount_words import arabic_sar_words


class ArabicAmountWordsTest(unittest.TestCase):
    def test_major_units(self):
        cases = {
            "0": "صفر ريال سعودي",
            "1": "ريال سعودي واحد",
            "2": "ريالان سعوديان",
            "3": "ثلاثة ريالات سعودية",
            "10": "عشرة ريالات سعودية",
            "11": "أحد عشر ريالًا سعوديًا",
            "12": "اثنا عشر ريالًا سعوديًا",
            "21": "واحد وعشرون ريالًا سعوديًا",
            "22": "اثنان وعشرون ريالًا سعوديًا",
            "100": "مائة ريال سعودي",
            "101": "مائة ريال سعودي وريال واحد",
            "102": "مائة ريال سعودي وريالان سعوديان",
            "200": "مئتا ريال سعودي",
            "201": "مئتا ريال سعودي وريال واحد",
            "1001": "ألف ريال سعودي وريال واحد",
            "1002": "ألف ريال سعودي وريالان سعوديان",
            "1200": "ألف ومئتا ريال سعودي",
            "1400": "ألف وأربعمائة ريال سعودي",
            "2000": "ألفا ريال سعودي",
            "1000000": "مليون ريال سعودي",
            "2000000": "مليونا ريال سعودي",
        }
        for amount, phrase in cases.items():
            with self.subTest(amount=amount):
                self.assertEqual(arabic_sar_words(amount), phrase + " فقط لا غير")

    def test_fraction_gender_and_no_orphan_conjunction(self):
        cases = {
            "0.01": "هللة واحدة",
            "0.02": "هللتان",
            "0.03": "ثلاث هللات",
            "0.08": "ثماني هللات",
            "0.10": "عشر هللات",
            "0.11": "إحدى عشرة هللة",
            "0.12": "اثنتا عشرة هللة",
            "0.21": "إحدى وعشرون هللة",
            "1.01": "ريال سعودي واحد وهللة واحدة",
            "2.02": "ريالان سعوديان وهللتان",
            "1400.50": "ألف وأربعمائة ريال سعودي وخمسون هللة",
            "1400.08": "ألف وأربعمائة ريال سعودي وثماني هللات",
            "-1400.50": "سالب ألف وأربعمائة ريال سعودي وخمسون هللة",
            "-0.00": "صفر ريال سعودي",
        }
        for amount, phrase in cases.items():
            with self.subTest(amount=amount):
                self.assertEqual(arabic_sar_words(amount), phrase + " فقط لا غير")

    def test_upstream_large_group_defects_use_explicit_phrases(self):
        cases = {
            "101000": "مائة ألف ريال سعودي وألف ريال سعودي",
            "102000": "مائة ألف ريال سعودي وألفا ريال سعودي",
            "103000": "مائة ألف ريال سعودي وثلاثة آلاف ريال سعودي",
            "110000": "مائة ألف ريال سعودي وعشرة آلاف ريال سعودي",
            "201001": "مئتا ألف ريال سعودي وألف ريال سعودي وريال واحد",
            "1000001": "مليون ريال سعودي وريال واحد",
            "101101000": "مائة مليون ريال سعودي ومليون ومائة ألف ريال سعودي وألف ريال سعودي",
            "1002000": "مليون ريال سعودي وألفا ريال سعودي",
            "100003": "مائة ألف ريال سعودي وثلاثة ريالات سعودية",
            "200003": "مئتا ألف ريال سعودي وثلاثة ريالات سعودية",
            "100100": "مائة ألف ريال سعودي ومائة ريال سعودي",
        }
        for amount, phrase in cases.items():
            with self.subTest(amount=amount):
                self.assertEqual(arabic_sar_words(amount), phrase + " فقط لا غير")

    def test_no_silent_precision_loss(self):
        for value in ("0.001", "1.999", "NaN", "Infinity", "1000000000000000"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                arabic_sar_words(value)
        self.assertEqual(arabic_sar_words(Decimal("1.000")), "ريال سعودي واحد فقط لا غير")
        self.assertTrue(arabic_sar_words("999999999999999.99").endswith("وتسع وتسعون هللة فقط لا غير"))

    def test_converter_state_and_decimal_context_are_not_changed(self):
        context = getcontext().copy()
        before = num2words(21, lang="ar")
        for amount in ("1400", "1.01", "999999999999999.99", "0.02", "1400"):
            arabic_sar_words(amount)
        self.assertEqual(num2words(21, lang="ar"), before)
        self.assertEqual(getcontext().prec, context.prec)
        self.assertEqual(getcontext().rounding, context.rounding)


if __name__ == "__main__":
    unittest.main()
