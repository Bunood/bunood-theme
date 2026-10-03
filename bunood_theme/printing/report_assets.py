"""Normalize Frappe's own report print sheet, without widening PDF fetch access."""

from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup


def canonical_print_stylesheet(html, browser_origin, site_origin, stylesheet_paths):
    """Only remap same-origin links to the installed Frappe print bundles.

    Report HTML uses the browser origin, but native PDF fetching only permits
    the canonical site and configured domains. Do not add localhost to that
    allowlist or disable its proxy: use the already permitted canonical URL for
    these known public stylesheets. External links, images and CSS stay intact.
    """
    browser = urlsplit(browser_origin)
    site = urlsplit(site_origin)
    if browser.scheme not in ("http", "https") or site.scheme not in ("http", "https"):
        return html
    if browser.netloc.lower() == site.netloc.lower() and browser.scheme == site.scheme:
        return html
    soup = BeautifulSoup(html, "html.parser")
    changed = False
    for link in soup.find_all("link", href=True):
        if "stylesheet" not in link.get("rel", []):
            continue
        source = urlsplit(link["href"])
        if (
            source.scheme == browser.scheme
            and source.netloc.lower() == browser.netloc.lower()
            and source.path in stylesheet_paths
            and not source.username
            and not source.password
        ):
            target = urlsplit(urljoin(site_origin, source.path))
            link["href"] = target._replace(query=source.query, fragment=source.fragment).geturl()
            changed = True
    return str(soup) if changed else html
