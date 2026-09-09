"""Render every managed letterhead; no site, database or record writes."""
from pathlib import Path
import re
from types import SimpleNamespace
import unittest

from bs4 import BeautifulSoup
from jinja2 import Environment, StrictUndefined

SOURCE = Path(__file__).resolve().parents[1] / "bunood_theme/letterhead/bunood_letterhead_header.html"
BLOCK = re.compile(r"<!--BND lh=([\w-]+)-->(.*?)<!--BND-END-->", re.S)


class Company(dict):
    __getattr__ = dict.get


def render(slug, language="en", **overrides):
    company = Company(company_name="Bunood & Partners", company_name_in_arabic="شركة بنود",
                      tax_id="300000000000003", bnd_commercial_registration="1010000000")
    company.update(overrides)
    source = BLOCK.sub(lambda match: match[2] if match[1] == slug else "", SOURCE.read_text(encoding="utf-8"))
    source = source.replace("__BND_THEME_LOGO__", "")
    template = Environment(undefined=StrictUndefined).from_string(source)
    html = template.render(doc=Company(company="Fixture"),
                           frappe=SimpleNamespace(get_doc=lambda *_: company, db=SimpleNamespace(exists=lambda *_: True)),
                           bunood_print_language=lambda: language)
    return BeautifulSoup(html, "html.parser")


class LetterheadTest(unittest.TestCase):
    def test_one_brand_rule_and_no_accent_stripe(self):
        for slug in ("split", "center", "minimal"):
            for language in ("ar", "en"):
                with self.subTest(slug=slug, language=language):
                    header = render(slug, language)
                    rules = header.select('[style*="border-top:"]')
                    self.assertEqual(len(rules), 1)
                    self.assertIn("var(--bnd-brand-solid)", rules[0]["style"])
                    self.assertNotIn("var(--bnd-accent)", str(header))

    def test_identity_survives_all_compositions_and_languages(self):
        for slug in ("split", "center", "minimal"):
            for language in ("ar", "en"):
                header = render(slug, language)
                self.assertIn("300000000000003", header.get_text())
                self.assertIn("1010000000", header.get_text())
                self.assertIn("شركة بنود" if language == "ar" else "Bunood & Partners", header.get_text())
                self.assertEqual(header.select_one(".bnd-lh-" + slug)["dir"], "rtl" if language == "ar" else "ltr")
                self.assertNotIn("None", header.get_text())

    def test_split_does_not_reserve_empty_logo_column(self):
        for language in ("ar", "en"):
            header = render("split", language)
            table = header.select_one(".bnd-lh-split > table")
            self.assertEqual(len(table.select(":scope > tr > td")), 1)
            self.assertIn("width:100%", table.select_one("td")["style"])
            with_logo = render("split", language, company_logo="/files/company.png")
            self.assertEqual(len(with_logo.select(".bnd-lh-split > table > tr > td")), 2)
            self.assertEqual(with_logo.select_one("img")["src"], "/files/company.png")

    def test_missing_registration_and_escaped_long_name(self):
        for slug in ("split", "center", "minimal"):
            header = render(slug, company_name="Long <company> & partners " * 8,
                            tax_id="", bnd_commercial_registration="", registration_details="")
            self.assertIsNone(header.find("company"))
            self.assertNotIn("VAT number", header.get_text())
            self.assertNotIn("Commercial registration", header.get_text())
            self.assertIn("Long <company> & partners", header.get_text())


if __name__ == "__main__":
    unittest.main()
