# Bunood print Jinja methods — whitelisted via hooks.py `jinja.methods` so every
# print format (any app) can call them. All are defensive: they return empty
# values instead of raising, so a print never breaks because of missing apps,
# fields, or bad data.

import base64
import json
import mimetypes
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
        import os

        if src.startswith("/private/files/"):
            path = frappe.get_site_path("private", "files",
                                        src[len("/private/files/"):])
        elif src.startswith("/files/"):
            path = frappe.get_site_path("public", "files", src[len("/files/"):])
        else:
            return ""          # not a site file; nothing safe to inline

        if not os.path.isfile(path):
            return ""
        size = os.path.getsize(path)
        if size > _MAX_INLINE_BYTES:
            frappe.log_error(
                title="bunood_theme: letterhead logo too large to inline"[:140],
                message="%s is %d bytes, over %d" % (src, size, _MAX_INLINE_BYTES),
            )
            return ""
        mime = _MIME_BY_SUFFIX.get(os.path.splitext(path)[1].lower())
        if not mime:
            return ""
        with open(path, "rb") as fh:
            return "data:%s;base64,%s" % (
                mime, base64.b64encode(fh.read()).decode("ascii"))
    except Exception:
        frappe.log_error(title="bunood_theme: letterhead logo inline failed"[:140])
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
    """Per-line VAT {item_code: {"rate": r, "amount": a}} from item_wise_tax_detail."""
    result = {}
    try:
        for tax_row in doc.get("taxes") or []:
            if not _is_vat_row(tax_row) or not tax_row.get("item_wise_tax_detail"):
                continue
            detail = tax_row.get("item_wise_tax_detail")
            if isinstance(detail, str):
                detail = json.loads(detail)
            for item_code, pair in (detail or {}).items():
                rate, amount = (pair[0], pair[1]) if isinstance(pair, (list, tuple)) else (pair, 0)
                entry = result.setdefault(item_code, {"rate": 0, "amount": 0})
                entry["rate"] = rate
                entry["amount"] += amount or 0
    except Exception:
        frappe.log_error(title="bunood_theme: item_vat_map failed"[:140])
    return result


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
