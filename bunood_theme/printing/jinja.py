# Bunood print Jinja methods — whitelisted via hooks.py `jinja.methods` so every
# print format (any app) can call them. All are defensive: they return empty
# values instead of raising, so a print never breaks because of missing apps,
# fields, or bad data.

import json
from decimal import InvalidOperation

import frappe


def bunood_print_language():
    """Read language at render time, not from a cached Jinja globals snapshot."""
    language = getattr(frappe.local, "lang", None) or "en"
    return "ar" if language.startswith("ar") else "en"


def bunood_amount_in_words(amount, currency, precision=2):
    """Print-only wording of the same payable number the template displays."""
    if currency == "SAR" and bunood_print_language() == "ar":
        from frappe.locale import get_number_format

        from bunood_theme.printing.amount_words import arabic_sar_words

        # Use the same native display rounding as the numeric total.
        # Read the active separators: some native formats suppress decimals.
        try:
            displayed = frappe.utils.fmt_money(amount, precision=precision)
            number_format = get_number_format()
            if number_format.thousands_separator:
                displayed = displayed.replace(number_format.thousands_separator, "")
            if number_format.decimal_separator:
                displayed = displayed.replace(number_format.decimal_separator, ".")
            return arabic_sar_words(displayed)
        except (ValueError, InvalidOperation, OverflowError):
            # Do not print incorrect words for unsupported sub-halala amounts.
            return ""

    words = frappe.utils.money_in_words(abs(amount), currency)
    if currency == "SAR":
        words = words.replace("SAR", "Saudi riyals")
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

        if doc.get("doctype") == "Sales Invoice" and frappe.db.exists(
            "DocType", "Sales Invoice Additional Fields"
        ):
            meta = frappe.get_meta("Sales Invoice Additional Fields")
            link_field = next(
                (f for f in ("sales_invoice", "invoice_reference", "reference_name")
                 if meta.has_field(f)),
                None,
            )
            if link_field:
                name = frappe.db.get_value(
                    "Sales Invoice Additional Fields", {link_field: doc.name}, "name"
                )
                if name:
                    saf = frappe.get_doc("Sales Invoice Additional Fields", name)
                    for field in ("qr_image_src", "qr_code_image", "qr_image"):
                        value = saf.get(field)
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
