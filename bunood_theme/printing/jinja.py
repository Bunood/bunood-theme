# Bunood print Jinja methods — whitelisted via hooks.py `jinja.methods` so every
# print format (any app) can call them. All are defensive: they return empty
# values instead of raising, so a print never breaks because of missing apps,
# fields, or bad data.

import base64
import functools
import json
import mimetypes
import os
from decimal import InvalidOperation

import frappe


def bunood_print_language():
    """Read language at render time, not from a cached Jinja globals snapshot."""
    language = getattr(frappe.local, "lang", None) or "en"
    return "ar" if language.startswith("ar") else "en"


#: A logo has to survive a render that has no page to be relative to, so the
#: budget is the whole letterhead's weight on EVERY printed page. 512 KB of
#: source is already generous for a 54px-tall mark; past that, dropping the
#: logo beats bloating every invoice.
_MAX_INLINE_BYTES = 512 * 1024

_MIME_BY_SUFFIX = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


def bunood_print_image_src(src):
    """Inline a site file as a data: URI so an isolated PDF header can show it.

    WHY THIS EXISTS -- measured 2026-09-12, not theorised.

    wkhtmltopdf renders the page header and footer as SEPARATE documents,
    written to /tmp and rendered with no base URL. A root-relative logo like

        /private/files/<arabic name>.png

    therefore has nothing to resolve against; and being under `private/` it
    would still need a session cookie even if it were absolute. wkhtmltopdf
    exits rc=1, pdfkit raises, and frappe rethrows it as "PDF generation failed
    because of broken image links" -- which names the symptom and hides that
    the whole PDF was lost. EVERY managed format failed this way, and so did
    stock `Standard`, because both carry the same letterhead.

    Measured, with only the src changed and everything else held:

        /private/files/... (relative)   ERR   no PDF at all
        absolute http /assets/...       OK    76,566 B
        data:image/png;base64,...       OK    75,532 B
        no <img>                        OK    75,229 B

    Both working forms were verified; the data: URI is the one chosen, because
    an absolute URL cannot fetch a PRIVATE file without a session, and because
    it does not depend on `host_name` being correct or on the site being
    reachable from whichever process happens to render.

    Degrades to "" rather than raising: a letterhead that loses its logo still
    prints, and a printout that fails entirely does not. The caller's
    `{% if logo %}` then drops the tag, which is also the only form measured to
    be safe when there is nothing to show.
    """
    src = (src or "").strip()
    if not src or src.startswith(("data:", "http://", "https://")):
        return src

    try:
        import base64
        from pathlib import Path
        from urllib.parse import unquote, urlsplit

        parsed = urlsplit(src)
        decoded = unquote(parsed.path)
        if parsed.query or parsed.fragment or "\\" in decoded or "\x00" in decoded:
            return ""
        if any(part in {".", ".."} for part in decoded.split("/")):
            return ""
        if decoded.startswith("/private/files/"):
            area = "private"
        elif decoded.startswith("/files/"):
            area = "public"
        else:
            return ""

        # Resolve registered attachments through Frappe, including the native
        # private File/attached-document permission check, before opening bytes.
        file_doc = frappe.get_doc("File", {"file_url": src})
        file_doc.check_permission("read")
        base = Path(frappe.get_site_path(area, "files")).resolve()
        path = Path(file_doc.get_full_path()).resolve()
        if not path.is_relative_to(base) or not path.is_file():
            return ""
        mime = _MIME_BY_SUFFIX.get(path.suffix.lower())
        if not mime or path.stat().st_size > _MAX_INLINE_BYTES:
            return ""
        with path.open("rb") as handle:
            content = handle.read(_MAX_INLINE_BYTES + 1)
        if len(content) > _MAX_INLINE_BYTES:
            return ""
        return "data:%s;base64,%s" % (mime, base64.b64encode(content).decode("ascii"))
    except Exception:
        # Missing/denied/unsafe images must not break a permitted document PDF.
        return ""


def bunood_amount_in_words(amount, currency, precision=2):
    """Print-only wording of the same payable number the template displays."""
    try:
        # printing/amount_words ships with the theme again (team integration
        # 2026-10-03). The guard stays: if its num2words dependency is ever
        # missing, Arabic SAR falls through to ERPNext's own wording below
        # instead of raising ImportError and taking the invoice render down.
        from bunood_theme.printing.amount_words import arabic_sar_words
    except ImportError:
        arabic_sar_words = None

    if arabic_sar_words and currency == "SAR" and bunood_print_language() == "ar":
        from frappe.locale import get_number_format

        try:
            displayed = frappe.utils.fmt_money(amount, precision=precision)
            number_format = get_number_format()
            if number_format.thousands_separator:
                displayed = displayed.replace(number_format.thousands_separator, "")
            if number_format.decimal_separator:
                displayed = displayed.replace(number_format.decimal_separator, ".")
            return arabic_sar_words(displayed)
        except (ValueError, InvalidOperation, OverflowError):
            return ""

    words = frappe.utils.money_in_words(abs(amount), currency)
    if currency == "SAR":
        # Arabic prints reach here only if amount_words cannot load (see the
        # import above); ERPNext's Arabic wording then needs an Arabic unit.
        unit = "ريال سعودي" if bunood_print_language() == "ar" else "Saudi riyals"
        words = words.replace("SAR", unit)
    return (frappe._("Negative") + " " if amount < 0 else "") + words


def bunood_zatca_qr_src(doc):
    """Resolve a printable ZATCA QR image src for an invoice.

    Order:
      1. Image-ish fields on the invoice itself (ERPNext KSA regional
         `ksa_einv_qr`, custom fields) — accepted only when the value looks
         like an image path/URL, never raw TLV text.
      2. lavaloon ksa_compliance >= 0.18: the QR lives on the linked
         "Sales Invoice Additional Fields" record, not on the invoice.
      3. lavaloon ksa_compliance Phase 1: no stored artefact exists at all —
         the QR (TLV: seller, VAT no., timestamp, totals) is computed at print
         time from "ZATCA Phase 1 Business Settings". Inert unless an Active
         settings row covers the invoice's company, which is also what makes
         the order safe: phase 1 and phase 2 cannot both be Active. The code
         lives in bunood_theme/zatca/qr.py — the compliance package.
    Returns "" when no QR image exists (formats decide how to degrade).
    """
    try:
        for field in ("ksa_einv_qr", "custom_zatca_qr", "custom_qr_code", "qr_code"):
            value = doc.get(field)
            if value and isinstance(value, str) and value.startswith(
                ("/files/", "/private/files/", "http://", "https://", "data:image")
            ):
                return value

        if doc.get("doctype") in {"Sales Invoice", "POS Invoice"} and frappe.db.exists(
            "DocType", "Sales Invoice Additional Fields"
        ):
            meta = frappe.get_meta("Sales Invoice Additional Fields")
            link_field = next(
                (f for f in ("sales_invoice", "invoice_reference", "reference_name")
                 if meta.has_field(f)),
                None,
            )
            if link_field:
                filters = {link_field: doc.name}
                if meta.has_field("invoice_doctype"):
                    filters["invoice_doctype"] = doc.doctype
                if meta.has_field("is_latest"):
                    filters["is_latest"] = 1
                rows = frappe.get_all(
                    "Sales Invoice Additional Fields", filters=filters, fields=["name"],
                    order_by="creation desc", limit=1,
                )
                name = rows[0].name if rows else None
                if name:
                    saf = frappe.get_doc("Sales Invoice Additional Fields", name)
                    for field in ("qr_image_src", "qr_code_image", "qr_image"):
                        # ksa_compliance exposes ``qr_image_src`` as a Python
                        # @property backed by the stored TLV ``qr_code``.  A
                        # Frappe virtual field is absent from ``Document.get``;
                        # attribute access is the contract that invokes the
                        # controller property and produces the printable PNG.
                        value = getattr(saf, field, None) or saf.get(field)
                        if callable(value):
                            value = value()
                        if value and isinstance(value, str) and value.startswith(
                            ("/files/", "/private/files/", "http", "data:image")
                        ):
                            return value

        # 3. Phase 1 — computed at print time. Lives in bunood_theme/zatca, the
        #    compliance package, with its ksa_compliance dependency.
        from bunood_theme.zatca.qr import phase1_qr_src

        value = phase1_qr_src(doc)
        if value:
            return value
    except Exception:
        frappe.log_error(title="bunood_theme: zatca_qr_src failed"[:140])
    return ""


_VAT_MARKERS = ("vat", "value added", "قيمة مضافة", "القيمة المضافة")


def _is_vat_row(tax_row):
    text = " ".join(
        str(tax_row.get(f) or "") for f in ("description", "account_head")
    ).lower()
    return any(marker in text for marker in _VAT_MARKERS)


def bunood_vat_totals(doc):
    """VAT-only totals (never freight/'Actual' charges) + single-rate detection.

    Returns {"vat", "vat_base", "rate"}: formatted VAT in invoice currency,
    formatted VAT in company currency (SAR) when the invoice currency differs,
    and the common VAT rate when all VAT rows share one rate (else None).
    Falls back to total_taxes_and_charges when no row matches the VAT markers.
    """
    out = {"vat": None, "vat_base": None, "rate": None}
    try:
        taxes = [t for t in (doc.get("taxes") or []) if _is_vat_row(t)]
        currency = doc.get("currency")
        company_currency = frappe.get_cached_value(
            "Company", doc.get("company"), "default_currency"
        ) if doc.get("company") else None

        if taxes:
            amount = sum(
                (t.get("tax_amount_after_discount_amount") or t.get("tax_amount") or 0)
                for t in taxes
            )
            base_amount = sum(
                (t.get("base_tax_amount_after_discount_amount") or t.get("base_tax_amount") or 0)
                for t in taxes
            )
            rates = {t.get("rate") for t in taxes if t.get("rate")}
            out["rate"] = rates.pop() if len(rates) == 1 else None
        else:
            amount = doc.get("total_taxes_and_charges") or 0
            base_amount = doc.get("base_total_taxes_and_charges") or 0

        out["vat"] = frappe.utils.fmt_money(amount, currency=currency)
        if company_currency and currency and currency != company_currency:
            out["vat_base"] = frappe.utils.fmt_money(base_amount, currency=company_currency)
    except Exception:
        frappe.log_error(title="bunood_theme: vat_totals failed"[:140])
    return out


def bunood_item_vat_map(doc):
    """Per-line VAT ``{key: {"rate": r, "amount": a}}``, keyed by item code and by item row name.

    ERPNext v16 keeps each line's share of a tax row in the ``item_wise_tax_details``
    table (item_row, tax_row, rate, amount in company currency); the JSON each tax
    row carried before (``item_wise_tax_detail``) is no longer filled, and reading it
    alone printed "—" for every line's VAT. That JSON is still read for a document
    saved before the table existed.
    """
    result = {}

    def add(key, rate, amount):
        if not key:
            return
        entry = result.setdefault(key, {"rate": 0, "amount": 0})
        entry["rate"] = rate
        entry["amount"] += amount or 0

    try:
        vat_rows = {row.get("name") for row in doc.get("taxes") or [] if _is_vat_row(row)}
        codes = {row.get("name"): row.get("item_code") for row in doc.get("items") or []}
        details = [d for d in doc.get("item_wise_tax_details") or [] if d.get("tax_row") in vat_rows]
        # The stored split answers only while it covers every line: a draft edited since
        # its last save (the bill's «عرض») holds rows for its old lines.
        if details and not {name for name in codes if codes[name]} <= {d.get("item_row") for d in details}:
            details = []
        for detail in details:
            rate, amount = frappe.utils.flt(detail.get("rate")), frappe.utils.flt(detail.get("amount"))
            add(detail.get("item_row"), rate, amount)
            code = codes.get(detail.get("item_row"))
            if code and code != detail.get("item_row"):
                add(code, rate, amount)
        if details:
            return result
        for tax_row in doc.get("taxes") or []:
            if not _is_vat_row(tax_row) or not tax_row.get("item_wise_tax_detail"):
                continue
            detail = tax_row.get("item_wise_tax_detail")
            if isinstance(detail, str):
                detail = json.loads(detail)
            for item_code, pair in (detail or {}).items():
                rate, amount = (pair[0], pair[1]) if isinstance(pair, (list, tuple)) else (pair, 0)
                add(item_code, rate, amount)
        if result:
            return result
        # An unsaved draft (the bill's «عرض» preview) has no split yet: each line takes
        # its VAT row's rate, or its item's own rate for that account, on its net amount.
        for item in doc.get("items") or []:
            overrides = item.get("item_tax_rate") or "{}"
            overrides = json.loads(overrides) if isinstance(overrides, str) else overrides
            for tax_row in doc.get("taxes") or []:
                if tax_row.get("name") not in vat_rows or tax_row.get("charge_type") != "On Net Total":
                    continue
                rate = frappe.utils.flt((overrides or {}).get(tax_row.get("account_head"), tax_row.get("rate")))
                amount = frappe.utils.flt(item.get("net_amount")) * rate / 100
                add(item.get("name"), rate, amount)
                if item.get("item_code") and item.get("item_code") != item.get("name"):
                    add(item.get("item_code"), rate, amount)
    except Exception:
        frappe.log_error(title="bunood_theme: item_vat_map failed"[:140])
    return result


def bunood_print_profile(doc):
    """The seller as the print kit shows it (printing/profile.py): names AR/EN, CR, VAT, the
    national address, the contact methods, the policy, the logo, stamp, signature and bank."""
    from bunood_theme.printing.profile import company_profile

    try:
        return company_profile(doc.get("company") if doc else None, doc, arabic=bunood_print_language() == "ar")
    except Exception:
        frappe.log_error(title="bunood_theme: print_profile failed"[:140])
        return company_profile(None)


def bunood_buyer_profile(doc):
    """The buyer of a sales document, in full (the standard tax invoice's buyer box)."""
    from bunood_theme.printing.profile import buyer_profile

    try:
        return buyer_profile(doc, arabic=bunood_print_language() == "ar")
    except Exception:
        frappe.log_error(title="bunood_theme: buyer_profile failed"[:140])
        return {"name": doc.get("customer_name") or "", "address": {}, "ids": []}


def bunood_invoice_view(doc, simplified=False):
    """The figures the sales-invoice family prints (printing/view.py)."""
    from bunood_theme.printing.view import invoice_view

    return invoice_view(doc, simplified=bool(simplified), arabic=bunood_print_language() == "ar")


def bunood_contracting_view(doc):
    """What «فاتورة ضريبية - مقاولات - A4» prints: the certificate, the works, the ladder and the net
    payable now in words (printing/contracting.py)."""
    from bunood_theme.printing.contracting import contracting_view

    return contracting_view(doc)


def bunood_trade_view(doc, kind):
    """What the trade family prints (printing/documents.py): quotation, orders, delivery note,
    purchase invoice, goods receipt, stock entry."""
    from bunood_theme.printing.documents import trade_view

    return trade_view(doc, kind, arabic=bunood_print_language() == "ar")


def bunood_party_profile(doc, party_type="Customer"):
    """A customer or a supplier as a party box prints it (printing/profile.py)."""
    from bunood_theme.printing.profile import party_profile

    try:
        return party_profile(doc, party_type, arabic=bunood_print_language() == "ar")
    except Exception:
        frappe.log_error(title="bunood_theme: party_profile failed"[:140])
        return {"name": "", "address": {}, "ids": [], "cells": []}


def bunood_voucher_view(doc):
    from bunood_theme.printing.documents import voucher_view

    return voucher_view(doc, arabic=bunood_print_language() == "ar")


def bunood_journal_view(doc):
    from bunood_theme.printing.documents import journal_view

    return journal_view(doc, arabic=bunood_print_language() == "ar")


def bunood_shift_view(doc):
    from bunood_theme.printing.documents import shift_view

    return shift_view(doc, arabic=bunood_print_language() == "ar")


def bunood_receipt_extras(doc):
    """What a thermal receipt adds to the invoice view: the named customer (never the walk-in
    one), the restaurant's order type and table, and the invoice number as a Code 128 SVG."""
    from bunood_theme.printing.view import code128_svg, named_customer, service

    try:
        return {"customer": named_customer(doc), "service": service(doc), "barcode": code128_svg(doc.get("name") or "")}
    except Exception:
        frappe.log_error(title="bunood_theme: receipt_extras failed"[:140])
        return {"customer": "", "service": {}, "barcode": ""}


_KIT_CSS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates", "print", "print_kit.css")
_RIYAL_OTF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "fonts", "riyal", "bunood-riyal.otf")


@functools.lru_cache(maxsize=16)
def _kit_css(site: str, stamp: str, mtime: float) -> str:
    from bunood_theme.email import substitute, tokens

    with open(_KIT_CSS, encoding="utf-8") as handle:
        css = handle.read()
    with open(_RIYAL_OTF, "rb") as handle:
        otf = base64.b64encode(handle.read()).decode("ascii")
    # The riyal sign's face, from the file the theme ships: the woff2 when the page can fetch
    # it, the same glyph inlined when it cannot (an isolated PDF header has no base URL).
    face = (
        '@font-face { font-family: "Bunood Riyal"; '
        "src: url(/assets/bunood_theme/fonts/riyal/bunood-riyal.woff2) format('woff2'), "
        f"url(data:font/otf;base64,{otf}) format('opentype'); "
        "font-weight: 100 900; font-display: block; unicode-range: U+20C1; }\n"
    )
    return face + substitute(css, tokens("light"))


#: What `email.tokens("light")` derives the kit's colours from. The cache key carries them because
#: a palette can move without `modified` moving: the zerONE palette patch (and the seeder) write
#: with update_modified=False, and a key of `modified` alone kept serving the old green sheet from
#: every worker's cache until it restarted (the v0.60.0 review, finding 8).
_KIT_SEEDS = ("brand_color", "accent_color", "ground_color")


def _kit_stamp() -> str:
    # The same cached document `tokens()` reads, so the key and the colours cannot disagree.
    settings = frappe.get_cached_doc("Theme Settings")
    return "|".join(str(settings.get(field) or "") for field in ("modified", *_KIT_SEEDS))


def bunood_print_kit_css():
    """The print kit's stylesheet (templates/print/print_kit.css), its tokens substituted from
    this site's palette. Cached per site, Theme Settings version and colour seeds, and file mtime;
    "" on failure (the format then prints unstyled rather than not at all, and the failure is
    logged)."""
    try:
        return _kit_css(getattr(frappe.local, "site", "") or "", _kit_stamp(), os.path.getmtime(_KIT_CSS))
    except Exception:
        frappe.log_error(title="bunood_theme: print kit stylesheet stood down"[:140])
        return ""


def bunood_print_setting(field: str):
    """A Theme Settings print field at render time, or its SHIPPED default from the one
    catalogue — never a literal in the template.

    The print macros used to read ``get_single_value(...) or "<literal>"`` at seven sites,
    each a second statement of a default ``presets.PRINT_DEFAULTS`` owns and nothing
    compared (the settings audit of 2026-09-21, decision ii-1). Read at render, as before:
    the field is the fact, and an unseeded site still gets today's behaviour — from the
    catalogue rather than from a copy that could drift.
    """
    from bunood_theme.presets import PRINT_DEFAULTS

    value = frappe.db.get_single_value("Theme Settings", field)
    return PRINT_DEFAULTS[field] if value in (None, "") else value


def bunood_print_copy(doc):
    """«نسخة مكررة — Copy» for a second or later print of an invoice ({} for the original):
    printing/reprint.py."""
    from bunood_theme.printing.reprint import mark

    try:
        return mark(doc)
    except Exception:
        frappe.log_error(title="bunood_theme: print copy mark failed"[:140])
        return {}
