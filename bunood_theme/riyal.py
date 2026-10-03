"""The Saudi riyal sign on every amount the desk formats (THE OWNER, 2026-09-28).

«العمله الريال السعودي svg ... رمز الريال السعودي يكون في النظام كامل». Frappe writes an amount's
currency mark from ``Currency.symbol``, so one value decides every form, list, report, print and
portal page of every app on the site. ERPNext's country data gives SAR «ر.س»; this makes it the
sign SAMA published, U+20C1, which the theme draws from SAMA's own artwork (``brand.py``
``RIYAL_FACE_CSS`` on screen, ``print.scss`` in a PDF).

A site whose SAR symbol somebody chose is left alone: only the stock spellings are replaced.

WHERE THE SIGN CANNOT BE DRAWN BY US. An e-mail or a text message carries the character, and the
reader's own fonts draw it. Unicode 17.0 (September 2025) added it, so an older phone or mail
client may show a box. That is measured on real clients after the first deploy, not assumed.
"""

import frappe

RIYAL_SIGN = "⃁"

#: What SAR's symbol reads on a site nobody customised: ERPNext's country data, its older spellings,
#: the ISO code and a blank. Anything else is a choice somebody made, and it is kept.
STOCK_SYMBOLS = frozenset({"ر.س", "ر.س.", "﷼", "SAR", "SR", "SR.", ""})


def ensure_riyal_sign() -> str:
    """Set ``Currency SAR``'s symbol to U+20C1 when it still reads a stock value; say what happened."""
    if not frappe.db.exists("Currency", "SAR"):
        return "no SAR currency on this site"
    current = frappe.db.get_value("Currency", "SAR", "symbol") or ""
    if current == RIYAL_SIGN:
        return "already the riyal sign"
    if current.strip() not in STOCK_SYMBOLS:
        return "kept: a symbol somebody chose"
    frappe.db.set_value("Currency", "SAR", "symbol", RIYAL_SIGN)
    # The desk reads currency symbols from each user's cached boot (enabled currencies only).
    frappe.clear_cache()
    return "set to the riyal sign"
