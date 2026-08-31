"""Run without a site: python -m unittest discover -s tests -p test_report_assets.py."""

import unittest

from bs4 import BeautifulSoup

from bunood_theme.printing.report_assets import canonical_print_stylesheet


class ReportAssetsTest(unittest.TestCase):
    paths = {"/assets/frappe/dist/css/print.bundle.ABC.css", "/assets/frappe/dist/css-rtl/print.bundle.DEF.css"}

    def rewrite(self, html):
        return canonical_print_stylesheet(html, "http://localhost:8080/", "http://verify.bunood.test", self.paths)

    def test_both_installed_directions_use_canonical_origin(self):
        for path in self.paths:
            html = f'<link rel="stylesheet" href="http://localhost:8080{path}?v=1"><p dir="rtl">الإجمالي: 70.00 SAR</p>'
            soup = BeautifulSoup(self.rewrite(html), "html.parser")
            self.assertEqual(soup.link["href"], f"http://verify.bunood.test{path}?v=1")
            self.assertEqual(soup.p.text, "الإجمالي: 70.00 SAR")
            self.assertEqual(soup.p["dir"], "rtl")

    def test_no_new_network_access_for_arbitrary_urls(self):
        urls = [
            "http://external.test/assets/frappe/dist/css/print.bundle.ABC.css",
            "http://localhost:9000/assets/frappe/dist/css/print.bundle.ABC.css",
            "http://localhost:8080/api/method/private",
            "http://localhost:8080/assets/frappe/dist/css/../../private.css",
            "http://localhost:8080/assets/frappe/dist/css/print.bundle.UNREVIEWED.css",
            "http://user:pass@localhost:8080/assets/frappe/dist/css/print.bundle.ABC.css",
            "/assets/frappe/dist/css/print.bundle.ABC.css",
        ]
        for url in urls:
            html = f'<link rel="stylesheet" href="{url}">'
            self.assertEqual(self.rewrite(html), html, url)

    def test_does_not_rewrite_content_images_scripts_or_inline_css(self):
        url = "http://localhost:8080/assets/frappe/dist/css/print.bundle.ABC.css"
        html = f'<p>{url}</p><img src="{url}"><script src="{url}"></script><style>@import url("{url}");</style>'
        self.assertEqual(self.rewrite(html), html)

    def test_canonical_origin_is_a_no_op(self):
        html = '<link rel="stylesheet" href="https://site.test/assets/frappe/dist/css/print.bundle.ABC.css">'
        self.assertEqual(canonical_print_stylesheet(html, "https://site.test/", "https://site.test/", self.paths), html)


if __name__ == "__main__":
    unittest.main()
