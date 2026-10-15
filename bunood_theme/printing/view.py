"""The figures a sales document prints, computed once (the print kit's model).

The templates used to recompute VAT, discounts and line totals inline, each its own way; this
module is the one place that turns an invoice into what the owner's layout shows: the lines in
the standard (11 columns) and the lean (5 columns) shapes, the totals table, the payments, the
title by document type and a return's reference strip. Amounts print POSITIVE on a credit note
(the addendum: "Amounts print positive"); the title says what the document is.

Pure arithmetic over the document; the only reads are the VAT split (``jinja.bunood_item_vat_map``,
ERPNext v16's ``item_wise_tax_details``), the original invoice's date and the sales person.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe.utils import flt, getdate

#: The theme's settlement choices (payments.SETTLEMENT_METHODS) as a print names them.
SETTLEMENT = {
    "On Credit": ("آجل", "On credit"),
    "Cash": ("نقدي", "Cash"),
    "Network": ("شبكة", "Card"),
    "Mixed Payment": ("نقدي وشبكة", "Cash and card"),
    "Bank Transfer": ("تحويل بنكي", "Bank transfer"),
}
#: Units a print should not show in English on an Arabic page.
UOM_AR = {"Nos": "عدد", "Unit": "وحدة", "Box": "علبة", "Kg": "كجم", "Meter": "متر", "Hour": "ساعة", "Yard": "ياردة", "Litre": "لتر"}

_VAT_MARKERS = ("vat", "value added", "قيمة مضافة", "القيمة المضافة")


def num(value, precision: int = 2) -> str:
    """Latin digits, comma thousands, a point for the decimals: «12,345.60». Never a sign."""
    q = Decimal(1).scaleb(-precision)
    d = Decimal(str(abs(flt(value)))).quantize(q, rounding=ROUND_HALF_UP)
    return f"{d:,.{precision}f}"


def price(value) -> str:
    """A unit price: two decimals, up to four when the price carries them (4-decimal prices)."""
    v = abs(flt(value))
    for p in (2, 3, 4):
        if abs(round(v, p) - v) < 1e-9:
            return num(v, p)
    return num(v, 4)


def qty(value) -> str:
    v = abs(flt(value))
    return f"{v:,.0f}" if v == int(v) else f"{v:,.3f}".rstrip("0").rstrip(".")


def date(value) -> str:
    """YYYY-MM-DD, whatever the site's date format (the addendum)."""
    if not value:
        return ""
    try:
        return getdate(value).strftime("%Y-%m-%d")
    except Exception:
        return str(value)


def time(value) -> str:
    if not value:
        return ""
    text = str(value)
    parts = text.split(":")
    return f"{int(parts[0]):02d}:{parts[1][:2]}" if len(parts) >= 2 else text


def _is_vat(row) -> bool:
    text = " ".join(str(row.get(f) or "") for f in ("description", "account_head")).lower()
    return any(marker in text for marker in _VAT_MARKERS)


def title(doc, simplified: bool) -> tuple[str, str]:
    """(Arabic, English) for a sales document. A seller without a VAT number issues a plain
    sales invoice — it cannot issue a tax invoice — and its return is a sales return."""
    if not (doc.get("company_tax_id") or _company_vat(doc)):
        return ("مرتجع مبيعات", "Sales Return") if doc.get("is_return") else ("فاتورة مبيعات", "Sales Invoice")
    if doc.get("is_return"):
        return ("إشعار دائن مبسط", "Simplified Credit Note") if simplified else ("إشعار دائن", "Credit Note")
    if doc.get("is_debit_note"):
        return ("إشعار مدين مبسط", "Simplified Debit Note") if simplified else ("إشعار مدين", "Debit Note")
    return ("فاتورة ضريبية مبسطة", "Simplified Tax Invoice") if simplified else ("فاتورة ضريبية", "Tax Invoice")


def _company_vat(doc) -> str:
    company = doc.get("company")
    if not company:
        return ""
    try:
        return frappe.get_cached_value("Company", company, "tax_id") or ""
    except Exception:
        return ""


def lines(doc) -> list[dict]:
    """Every item row, in the numbers both shapes need."""
    from bunood_theme.printing.jinja import bunood_item_vat_map

    vmap = bunood_item_vat_map(doc) or {}
    codes = [row.get("item_code") for row in doc.get("items") or []]
    single_rates = {flt(t.get("rate")) for t in doc.get("taxes") or [] if _is_vat(t) and t.get("charge_type") == "On Net Total"}
    fallback_rate = single_rates.pop() if len(single_rates) == 1 else None
    conversion = flt(doc.get("conversion_rate")) or 1
    out = []
    for i, row in enumerate(doc.get("items") or [], start=1):
        q = abs(flt(row.get("qty")))
        rate = abs(flt(row.get("rate")))
        plr = abs(flt(row.get("price_list_rate")))
        unit = plr if plr > rate else rate
        gross = unit * q
        taxable = abs(flt(row.get("net_amount") if row.get("net_amount") is not None else row.get("amount")))
        discount = max(0.0, gross - taxable)
        v = vmap.get(row.get("name"))
        if not v and codes.count(row.get("item_code")) == 1:
            v = vmap.get(row.get("item_code"))
        if v:
            vat_rate = flt(v.get("rate"))
            # item_wise_tax_details keeps each line's tax in company currency.
            vat = abs(flt(v.get("amount"))) / conversion
        elif fallback_rate is not None:
            vat_rate, vat = fallback_rate, taxable * fallback_rate / 100
        else:
            vat_rate, vat = None, 0.0
        total = taxable + vat
        name = row.get("item_name") or row.get("item_code") or ""
        description = frappe.utils.strip_html(row.get("description") or "").strip()
        uom = row.get("uom") or row.get("stock_uom") or ""
        out.append({
            "idx": i,
            "code": row.get("item_code") or "",
            "name": name,
            "description": description if description and description != name else "",
            "uom": UOM_AR.get(uom, frappe._(uom) if uom else ""),
            "qty": qty(q),
            "unit": price(unit),
            "rate": price(rate),
            "discount": num(discount) if discount >= 0.005 else "",
            "taxable": num(taxable),
            "vat_rate": (f"{vat_rate:g}%" if vat_rate is not None else ""),
            "vat": num(vat),
            "total": num(total),
            # The lean shape prints the price INCLUDING VAT, so qty × price = the line total.
            "unit_incl": price(total / q) if q else num(total),
            "treatment": _treatment(row),
        })
    return out


def _treatment(row) -> str:
    """The special-treatment statement ZATCA asks for on a zero-rated, exempt or export line."""
    category = (row.get("custom_zatca_item_tax_category") or "").strip()
    if category and category != "Standard rate":
        head, _sep, reason = category.partition("||")
        head, reason = head.strip(), reason.strip()
        if head.startswith("Zero rated"):
            return "خاضع لنسبة الصفر — Zero-rated" + (f": {reason}" if reason else "")
        if head.startswith("Exempt"):
            return "معفى من الضريبة — Exempt" + (f": {reason}" if reason else "")
        return "خارج نطاق الضريبة — Out of scope" + (f": {reason}" if reason else "")
    if row.get("is_zero_rated"):
        return "خاضع لنسبة الصفر — Zero-rated"
    if row.get("is_exempt"):
        return "معفى من الضريبة — Exempt"
    return ""


def totals(doc, items: list[dict] | None = None) -> dict:
    """The small totals table: before discount, discount, taxable, VAT, other charges, rounding,
    the grand total, then paid / remaining / change when they apply."""
    rows = doc.get("items") or []
    gross = 0.0
    for row in rows:
        q = abs(flt(row.get("qty")))
        rate, plr = abs(flt(row.get("rate"))), abs(flt(row.get("price_list_rate")))
        gross += (plr if plr > rate else rate) * q
    taxable = abs(flt(doc.get("net_total")))
    discount = max(0.0, gross - taxable)
    vat_rows = [t for t in doc.get("taxes") or [] if _is_vat(t)]
    if vat_rows:
        vat = abs(sum(flt(t.get("tax_amount_after_discount_amount") or t.get("tax_amount")) for t in vat_rows))
        rates = {flt(t.get("rate")) for t in vat_rows if t.get("rate")}
        rate = rates.pop() if len(rates) == 1 else None
    else:
        vat, rate = abs(flt(doc.get("total_taxes_and_charges"))), None
    other = max(0.0, abs(flt(doc.get("total_taxes_and_charges"))) - vat)
    rounded = bool(doc.get("rounded_total")) and not doc.get("disable_rounded_total")
    grand = abs(flt(doc.get("rounded_total") if rounded else doc.get("grand_total")))
    rounding = flt(doc.get("rounding_adjustment")) if rounded else 0.0
    if doc.get("is_return"):
        rounding = -rounding
    out = {
        "gross": num(gross),
        "discount": num(discount) if discount >= 0.005 else "",
        "taxable": num(taxable),
        "vat": num(vat),
        "vat_rate": f"{rate:g}" if rate is not None else "",
        "other": num(other) if other >= 0.005 else "",
        "rounding": ("-" if rounding < 0 else "") + num(rounding) if abs(rounding) >= 0.005 else "",
        "grand": num(grand),
        "grand_value": grand,
        "currency": doc.get("currency") or "",
        "paid": "",
        "remaining": "",
        "change": "",
        "advance": num(doc.get("total_advance")) if flt(doc.get("total_advance")) >= 0.005 else "",
    }
    if doc.get("is_return") or doc.get("docstatus") != 1 and not doc.get("is_pos"):
        return out
    if doc.get("is_pos"):
        paid = abs(flt(doc.get("paid_amount")))
        change = abs(flt(doc.get("change_amount")))
        out["paid"] = num(paid) if paid >= 0.005 else ""
        out["change"] = num(change) if change >= 0.005 else ""
        remaining = max(0.0, grand - paid + change)
        out["remaining"] = num(remaining) if remaining >= 0.005 and doc.get("docstatus") == 1 else ""
        return out
    outstanding = abs(flt(doc.get("outstanding_amount")))
    paid = max(0.0, grand - outstanding)
    if paid >= 0.005:
        out["paid"] = num(paid)
        out["remaining"] = num(outstanding) if outstanding >= 0.005 else num(0)
    return out


def payments(doc) -> list[dict]:
    """A POS sale's tenders, method → amount."""
    out = []
    for row in doc.get("payments") or []:
        if abs(flt(row.get("amount"))) >= 0.005:
            out.append({"method": frappe._(row.get("mode_of_payment") or ""), "amount": num(row.get("amount"))})
    return out


def method(doc) -> tuple[str, str]:
    """How the sale is settled, (Arabic, English); nothing for a credit note (it settles nothing
    itself — the original invoice's settlement is copied onto it by ERPNext)."""
    if doc.get("is_return"):
        return ("", "")
    paid = payments(doc)
    if doc.get("is_pos") and paid:
        names = " + ".join(p["method"] for p in paid)
        return names, ""
    choice = doc.get("bunood_settlement_method")
    if choice in SETTLEMENT:
        return SETTLEMENT[choice]
    if doc.get("docstatus") == 1 and flt(doc.get("outstanding_amount")) <= 0.005 and not doc.get("is_return"):
        return ("مدفوعة", "Paid")
    return ("آجل", "On credit") if not doc.get("is_return") else ("", "")


def reference(doc) -> dict:
    """A credit / debit note's reference strip: the original invoice(s), its date, the reason
    (ksa_compliance's custom_return_reason; the remarks when it is empty)."""
    if not (doc.get("is_return") or doc.get("is_debit_note")):
        return {}
    originals = [doc.get("return_against")] if doc.get("return_against") else []
    for row in doc.get("custom_return_against_additional_references") or []:
        name = row.get("sales_invoice")
        if name and name not in originals:
            originals.append(name)
    first = originals[0] if originals else ""
    original_date = ""
    if first and frappe.db.exists(doc.doctype, first):
        original_date = date(frappe.db.get_value(doc.doctype, first, "posting_date"))
    reason = (doc.get("custom_return_reason") or "").strip()
    if not reason:
        remarks = (doc.get("remarks") or "").strip()
        reason = "" if remarks in ("", "No Remarks", "لا ملاحظات") or remarks.startswith("Against Sales Invoice") else remarks
    return {"originals": originals, "date": original_date, "reason": reason}


def sales_person(doc) -> str:
    for row in doc.get("sales_team") or []:
        if row.get("sales_person"):
            return row.get("sales_person")
    return ""


def words(doc, grand: float, arabic: bool) -> str:
    """«فقط ستة آلاف وتسعمائة ريال سعودي لا غير» — the owner's wording of the grand total."""
    from bunood_theme.printing.jinja import bunood_amount_in_words

    currency = doc.get("currency") or ""
    text = (bunood_amount_in_words(abs(flt(grand)), currency, 2) or "").strip()
    if not text:
        return ""
    tail = " فقط لا غير"
    if arabic and text.endswith(tail):
        return "فقط " + text[: -len(tail)] + " لا غير"
    return text


def invoice_view(doc, simplified: bool = False, arabic: bool = True) -> dict:
    """Everything the sales-invoice family prints beyond the two parties."""
    items = lines(doc)
    tot = totals(doc, items)
    ar, en = title(doc, simplified)
    treatments = sorted({line["treatment"] for line in items if line["treatment"]})
    return {
        "title_ar": ar,
        "title_en": en,
        "number": doc.get("name") or "",
        "issued": " ".join(p for p in (date(doc.get("posting_date")), time(doc.get("posting_time"))) if p),
        "date": date(doc.get("posting_date")),
        "due": date(doc.get("due_date")) if doc.get("due_date") and doc.get("due_date") != doc.get("posting_date") else "",
        "terms_template": doc.get("payment_terms_template") or "",
        "method": method(doc),
        "po": doc.get("po_no") or "",
        "po_date": date(doc.get("po_date")),
        "sales_person": sales_person(doc),
        "branch": doc.get("branch") or "",
        "currency": doc.get("currency") or "",
        "foreign": bool(doc.get("currency") and doc.get("currency") != "SAR"),
        "conversion": flt(doc.get("conversion_rate")),
        "cashier": _user_name(doc.get("owner")),
        "lines": items,
        "totals": tot,
        "payments": payments(doc),
        "reference": reference(doc),
        "treatments": treatments,
        "words": words(doc, tot["grand_value"], arabic),
        "draft": doc.get("docstatus") == 0,
        "cancelled": doc.get("docstatus") == 2,
    }


def _user_name(user) -> str:
    if not user:
        return ""
    try:
        return frappe.db.get_value("User", user, "full_name") or user
    except Exception:
        return user


def named_customer(doc) -> str:
    """The customer's name when the receipt should show it: never the walk-in customer (the
    POS profile's default, or the theme's «عميل نقدي»)."""
    name = (doc.get("customer_name") or doc.get("customer") or "").strip()
    if not name:
        return ""
    from bunood_theme.cash_customer import CASH_CUSTOMER_NAME

    if doc.get("customer") == CASH_CUSTOMER_NAME or name == CASH_CUSTOMER_NAME:
        return ""
    profile = doc.get("pos_profile")
    if profile and frappe.db.get_value("POS Profile", profile, "customer") == doc.get("customer"):
        return ""
    return name


def service(doc) -> dict:
    """A restaurant sale's order type and table (stamped by Zero One Dining), for the receipt."""
    kind = doc.get("custom_bunood_order_type")
    if not kind:
        return {}
    title_ar = kind
    try:
        if frappe.db.exists("DocType", "Dining Order Type"):
            title_ar = frappe.db.get_value("Dining Order Type", kind, "title_ar") or kind
    except Exception:
        title_ar = kind
    return {"type": title_ar, "table": doc.get("custom_bunood_table") or "", "pickup": doc.get("custom_bunood_pickup_no") or ""}


# --- Code 128 (set B): the invoice number as a barcode, drawn as SVG, no dependency -----------

#: The 107 Code 128 symbols as bar/space module widths (ISO/IEC 15417, table 1); 106 is STOP.
CODE128 = (
    "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 "
    "122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 "
    "321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 "
    "211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 "
    "213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 "
    "121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 "
    "241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 "
    "412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 "
    "211214 211232 2331112"
).split()
START_B, STOP = 104, 106


def code128_values(text: str) -> list[int]:
    """Start B, the characters, the modulo-103 check symbol, STOP. Printable ASCII only."""
    values = [START_B]
    for ch in text:
        code = ord(ch)
        if code < 32 or code > 126:
            raise ValueError("Code 128 set B carries printable ASCII only")
        values.append(code - 32)
    check = (START_B + sum(i * v for i, v in enumerate(values[1:], start=1))) % 103
    return values + [check, STOP]


def code128_svg(text: str, height: int = 40) -> str:
    """An SVG of ``text`` in Code 128-B with a 10-module quiet zone each side; "" when the text
    cannot be encoded (a non-ASCII number), so the receipt simply prints no barcode."""
    try:
        values = code128_values(str(text or ""))
    except ValueError:
        return ""
    if len(values) <= 3:
        return ""
    x, bars = 10, []
    for value in values:
        widths = [int(w) for w in CODE128[value]]
        for i, w in enumerate(widths):
            if i % 2 == 0:
                bars.append(f'<rect x="{x}" y="0" width="{w}" height="{height}"/>')
            x += w
    total = x + 10
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {height}" preserveAspectRatio="none" '
            f'role="img" aria-label="{frappe.utils.escape_html(str(text))}"><g fill="#000">{"".join(bars)}</g></svg>')
