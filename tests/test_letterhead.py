"""Render every managed letterhead composition; no site, database or record writes.

The print redesign (2026-10-15) rewrote both files: the header reads the print profile
(bunood_print_profile) instead of fields no app defines, its labels are proper UTF-8 again (the
old file carried «الرقم الضريبي» and «السجل التجاري» double-encoded), the `split` composition is
the kit's bilingual mirror, and the footer is the owner's two things — the address and the
contact methods — with the company's policy under them.
"""
from pathlib import Path
import re
import unittest

from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader, StrictUndefined

ROOT = Path(__file__).resolve().parents[1] / "bunood_theme"
SOURCE = ROOT / "letterhead/bunood_letterhead_header.html"
FOOTER_SOURCE = ROOT / "letterhead/bunood_letterhead_footer.html"
BLOCK = re.compile(r"<!--BND lh=([\w-]+)-->(.*?)<!--BND-END-->", re.S)


def profile(**over):
    data = {
        "name": "Fixture", "name_ar": "شركة الاختبار", "name_en": "Fixture & Partners", "display": "شركة الاختبار",
        "vat": "300000000000003", "cr": "1010000000", "logo": "", "phone": "+966 11 000 0000",
        "address": {"line": "8228 طريق الملك فهد، حي العليا، الرياض 12214", "building": "8228"},
        "contacts": [{"key": "phone", "value": "+966 11 000 0000"}, {"key": "email", "value": "hello@fixture.test"}],
        "policy": "الاستبدال خلال 7 أيام.",
    }
    data.update(over)
    return data


def env(p, language="en", title_lang="Follow print language"):
    environment = Environment(loader=FileSystemLoader(str(ROOT)), undefined=StrictUndefined)
    environment.globals.update(
        bunood_print_profile=lambda doc: p,
        bunood_print_kit_css=lambda: "/* kit */",
        bunood_print_language=lambda: language,
        bunood_print_image_src=lambda src: src,
        bunood_print_setting=lambda field: title_lang if field == "print_title_lang" else "",
    )
    return environment


def render(slug, language="en", title_lang="Follow print language", **over):
    source = BLOCK.sub(lambda m: m[2] if m[1] == slug else "", SOURCE.read_text(encoding="utf-8"))
    source = source.replace("__BND_THEME_LOGO__", "")
    html = env(profile(**over), language, title_lang).from_string(source).render(doc={"company": "Fixture"})
    return BeautifulSoup(html, "html.parser")


def render_footer(language="en", title_lang="Follow print language", **over):
    html = env(profile(**over), language, title_lang).from_string(
        FOOTER_SOURCE.read_text(encoding="utf-8")).render(doc={"company": "Fixture"})
    return BeautifulSoup(html, "html.parser")


class LetterheadTest(unittest.TestCase):
    def test_the_files_are_clean_utf8_and_read_only_real_fields(self):
        for path in (SOURCE, FOOTER_SOURCE):
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotRegex(text, r"ط§|ظ„|â€", "no double-encoded Arabic")
                code = re.sub(r"\{#.*?#\}", "", text, flags=re.S)
                for absent in ("company_name_in_arabic", "custom_company_name_ar", "custom_privacy_policy"):
                    self.assertNotIn(absent, code)
                self.assertIn("bunood_print_profile(doc)", text)

    def test_managed_header_cancels_frappe_chromes_negative_merge_margin(self):
        style = render("minimal").select_one("style").get_text()
        self.assertIn("@media print", style)
        self.assertRegex(style, r"\.letter-head,\s*\.letter-head-footer")
        self.assertIn("margin-top: 0 !important", style)

    def test_split_is_the_kits_bilingual_mirror(self):
        header = render("split", "ar")
        grid = header.select_one(".bnd-lh-split .zo-head__grid")
        self.assertEqual(grid["dir"], "ltr")
        self.assertEqual([td["class"][0] for td in grid.select("td")], ["zo-head__en", "zo-head__logo", "zo-head__ar"])
        self.assertIn("السجل التجاري", grid.get_text())
        self.assertIn("الرقم الضريبي", grid.get_text())
        self.assertIsNone(header.select_one(".zo-head__page"), "a letter head prints no page numbers")

    def test_identity_survives_all_compositions_and_languages(self):
        for slug in ("split", "center", "minimal"):
            for language in ("ar", "en"):
                with self.subTest(slug=slug, language=language):
                    text = render(slug, language).get_text(" ")
                    self.assertIn("300000000000003", text)
                    self.assertIn("1010000000", text)
                    self.assertTrue("شركة الاختبار" in text or "Fixture &amp; Partners" in text or "Fixture & Partners" in text)

    def test_missing_registration_and_escaped_long_name(self):
        header = render("minimal", cr="", name_ar="", name_en="<b>" + "A" * 50)
        self.assertNotIn("<b>A", str(header).replace("&lt;b&gt;", ""))
        self.assertNotIn("السجل التجاري", header.get_text())

    def test_managed_footer_cancels_frappe_chromes_negative_merge_margin(self):
        style = render_footer().select_one("style").get_text()
        self.assertIn("@media print", style)
        self.assertIn(".letter-head-footer { margin-top: 0 !important; }", style)

    def test_footer_carries_the_address_the_contacts_and_the_policy(self):
        foot = render_footer("ar")
        cells = foot.select(".zo-foot__grid td")
        self.assertEqual([c["class"][0] for c in cells], ["zo-foot__addr", "zo-foot__contacts"])
        self.assertIn("الرياض 12214", cells[0].get_text())
        self.assertIn("hello@fixture.test", cells[1].get_text())
        self.assertIn("الاستبدال", foot.select_one(".zo-policy").get_text())
        self.assertEqual(foot.select_one(".zo")["dir"], "rtl")

    def test_footer_follows_the_print_language(self):
        self.assertEqual(render_footer("en").select_one(".zo")["dir"], "ltr")
        self.assertEqual(render_footer("en", title_lang="Both").select_one(".zo")["dir"], "rtl")

    def test_a_company_with_nothing_to_show_prints_no_band(self):
        foot = render_footer(address={"line": ""}, contacts=[], policy="")
        self.assertIsNone(foot.select_one(".zo-foot"))


if __name__ == "__main__":
    unittest.main()
