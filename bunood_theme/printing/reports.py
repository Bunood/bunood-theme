"""Delegate report PDF export to Frappe with its canonical print stylesheet."""

import frappe
from urllib.parse import urlsplit
from frappe.utils import get_url
from frappe.utils.jinja_globals import bundled_asset
from frappe.utils.print_format import report_to_pdf as native_report_to_pdf

from bunood_theme.printing.report_assets import canonical_print_stylesheet
from bunood_theme.printing.statement import MARKER as STATEMENT_MARKER


@frappe.whitelist()
def report_to_pdf(html: str, orientation: str = "Landscape"):
    # nginx's $host drops the browser port. Same-origin POSTs carry Origin,
    # which keeps it; never trust a different hostname as the browser origin.
    browser_origin = frappe.request.host_url
    origin = frappe.request.headers.get("Origin")
    if origin and urlsplit(origin).hostname == urlsplit(browser_origin).hostname:
        browser_origin = origin
    html = canonical_print_stylesheet(
        html,
        browser_origin,
        get_url(allow_header_override=False),
        {bundled_asset("print.bundle.css", rtl=rtl) for rtl in (False, True)},
    )
    if f'class="{STATEMENT_MARKER}"' in html:
        # The print kit's statement of account is written for Chromium (logical CSS, the
        # repeated head and foot, page numbers); wkhtmltopdf, Frappe's report engine, has none
        # of that. Every other report keeps Frappe's own path.
        return _kit_report_pdf(html)
    return native_report_to_pdf(html=html, orientation=orientation)


def _kit_report_pdf(html: str):
    from frappe.core.doctype.access_log.access_log import make_access_log
    from frappe.utils.pdf import get_chrome_pdf

    from bunood_theme.printing.names import STATEMENT_A4

    make_access_log(file_type="PDF", method="PDF", page=html)
    frappe.local.response.filename = "statement.pdf"
    frappe.local.response.filecontent = get_chrome_pdf(STATEMENT_A4, html, {}, None, "chrome")
    frappe.local.response.type = "pdf"
