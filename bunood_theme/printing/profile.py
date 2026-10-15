"""The print profile: everything a printed document says about the seller and the buyer.

THE OWNER (2026-10-15): «الراس اسم الشركه عربي وانجليزي ورقم السجل التجاري وايضا الرقم الضريبي.
وفي التذييل يكون معانا شيئين العنوان ووسائل التواصل وتحت يكون سياسه الشركه». Every format reads
these facts from here, once, instead of each template walking the Company, its Address and its
Bank Account on its own (the letter head, the thermal head and the A4 parties used to, and
drifted: three different address joins, two different logo chains).

WHERE EACH FACT LIVES (measured on a v16 bench with ksa_compliance 0.61.7):
    names        Company.bnd_company_name_ar / bnd_company_name_en (this app installs them),
                 else Company.company_name in whichever script it is written, else (Arabic only)
                 the seller name ksa_compliance's Phase 2 settings hold.
    CR           Company.bnd_commercial_registration, else the stock free-text
                 registration_details.
    VAT          Company.tax_id; a Sandbox preview passes the signed seller VAT on the doc
                 (invoice_delivery._render_sandbox_invoice sets ``_bnd_sandbox_vat``).
    address      the company's primary Address (Dynamic Link), in the national-address parts
                 the business «المنشأة» screen stores: custom_building_number, address_line1,
                 custom_area, city, pincode, address_line2 (the additional number).
    contacts     phone_no, bnd_mobile, email, website and the four social handles.
    policy       Company.bnd_print_policy, printed under the footer.
    images       the Theme Settings logo, else company_logo; bnd_company_stamp and bnd_signature
                 (private files, inlined as data: URIs by jinja.bunood_print_image_src).
    bank         the company's default Bank Account (is_company_account), when one exists.

DEFENSIVE LIKE THE REST OF printing/: a missing app, field or record yields an empty value,
never an exception, because a print that fails is worse than a print with a blank line. A
missing name prints nothing: the templates guard every label on its value.
"""

from __future__ import annotations

import re

import frappe

#: The Arabic blocks a name can be written in (Arabic, Supplement, Presentation Forms A and B).
_ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
_LATIN = re.compile(r"[A-Za-z]")

#: The national address, part → the Address field the business screen stores it in.
ADDRESS_PARTS = {
    "building": "custom_building_number",
    "street": "address_line1",
    "district": "custom_area",
    "city": "city",
    "postal": "pincode",
    "additional": "address_line2",
}

#: The contact methods in print order: key → Company field.
CONTACTS = (
    ("phone", "phone_no"),
    ("mobile", "bnd_mobile"),
    ("email", "email"),
    ("website", "website"),
    ("instagram", "bnd_instagram"),
    ("x", "bnd_x"),
    ("snapchat", "bnd_snapchat"),
    ("tiktok", "bnd_tiktok"),
)
_SOCIAL = {"instagram", "x", "snapchat", "tiktok"}


def is_arabic(text) -> bool:
    return bool(text and _ARABIC.search(str(text)))


def is_latin(text) -> bool:
    return bool(text and _LATIN.search(str(text)) and not _ARABIC.search(str(text)))


def _clean(value) -> str:
    return str(value or "").strip()


def handle(value) -> str:
    """A social handle as it prints: «@name», whatever the owner typed (a URL, @name, name)."""
    value = _clean(value)
    if not value:
        return ""
    value = re.sub(r"^https?://", "", value, flags=re.I)
    value = re.sub(r"^(www\.)?(instagram\.com|x\.com|twitter\.com|snapchat\.com(/add)?|tiktok\.com)/", "", value, flags=re.I)
    value = value.strip("/").lstrip("@")
    return "@" + value if value else ""


def website(value) -> str:
    """A website as it prints: no scheme, no trailing slash."""
    value = _clean(value)
    return re.sub(r"^https?://", "", value, flags=re.I).rstrip("/")


def _company_doc(company):
    if not company or not frappe.db.exists("Company", company):
        return None
    return frappe.get_cached_doc("Company", company)


def _phase2_seller_name(company) -> str:
    try:
        if not frappe.db.exists("DocType", "ZATCA Business Settings"):
            return ""
        meta = frappe.get_meta("ZATCA Business Settings")
        if not meta.has_field("seller_name"):
            return ""
        return _clean(frappe.db.get_value("ZATCA Business Settings", {"company": company}, "seller_name"))
    except Exception:
        return ""


def names(c) -> tuple[str, str]:
    """(Arabic, English) for a Company doc; either may be "" and then prints nothing."""
    if not c:
        return "", ""
    base = _clean(c.get("company_name"))
    ar = _clean(c.get("bnd_company_name_ar")) or (base if is_arabic(base) else "")
    if not ar:
        seller = _phase2_seller_name(c.name)
        ar = seller if is_arabic(seller) else ""
    en = _clean(c.get("bnd_company_name_en")) or (base if is_latin(base) else "")
    return ar, en


def primary_address_name(link_doctype: str, link_name: str) -> str | None:
    """The primary Address of a Company/Customer/Supplier: the same order the business screen
    reads it in (primary first, then the company's own, then the oldest)."""
    if not link_name:
        return None
    parents = frappe.get_all(
        "Dynamic Link",
        filters={"link_doctype": link_doctype, "link_name": link_name, "parenttype": "Address"},
        pluck="parent",
    )
    if not parents:
        return None
    meta = frappe.get_meta("Address")
    order = ["is_primary_address desc"]
    if meta.has_field("is_your_company_address"):
        order.append("is_your_company_address desc")
    order.append("creation asc")
    rows = frappe.get_all(
        "Address", filters={"name": ["in", parents], "disabled": 0}, pluck="name",
        order_by=", ".join(order), limit=1,
    )
    return rows[0] if rows else None


def address_parts(name: str | None, arabic: bool = True) -> dict:
    """The national address of one Address record, as parts and as one line."""
    empty = {key: "" for key in ADDRESS_PARTS} | {"country": "", "line": "", "lines": []}
    if not name or not frappe.db.exists("Address", name):
        return empty
    doc = frappe.get_doc("Address", name)
    meta = frappe.get_meta("Address")
    parts = {key: _clean(doc.get(field)) if meta.has_field(field) else "" for key, field in ADDRESS_PARTS.items()}
    if not meta.has_field("custom_building_number"):
        # Without ksa_compliance's fields the business screen joins building, district and the
        # additional number into the second line; it then prints as one more address line.
        parts["additional"] = ""
        parts["street"] = "، ".join(p for p in (parts["street"], _clean(doc.get("address_line2"))) if p)
    parts["country"] = _clean(doc.get("country"))
    parts["line"] = address_line(parts, arabic=arabic)
    parts["lines"] = [p for p in (doc.get("address_line1"), doc.get("address_line2"), doc.get("city"), doc.get("pincode")) if p]
    return parts


def address_line(parts: dict, arabic: bool = True) -> str:
    """«8228 طريق الملك فهد، حي العليا، الرياض 12214، الرقم الإضافي 2121» — the national address
    in the order Saudi Post prints it."""
    street = " ".join(p for p in (parts.get("building"), parts.get("street")) if p)
    city = " ".join(p for p in (parts.get("city"), parts.get("postal")) if p)
    sep = "، " if arabic else ", "
    bits = [b for b in (street, parts.get("district"), city) if b]
    if parts.get("additional"):
        bits.append(("الرقم الإضافي " if arabic else "Additional No. ") + parts["additional"])
    return sep.join(bits)


def _logo(c) -> str:
    logo = ""
    try:
        logo = _clean(frappe.db.get_single_value("Theme Settings", "logo"))
    except Exception:
        logo = ""
    return logo or (_clean(c.get("company_logo")) if c else "")


def _image(src: str) -> str:
    if not src:
        return ""
    from bunood_theme.printing.jinja import bunood_print_image_src

    return bunood_print_image_src(src)


def bank(company: str) -> dict:
    """The company's default Bank Account, when it has one: bank, IBAN, account name."""
    try:
        if not frappe.db.exists("DocType", "Bank Account"):
            return {}
        meta = frappe.get_meta("Bank Account")
        filters = {"company": company}
        if meta.has_field("is_company_account"):
            filters["is_company_account"] = 1
        if meta.has_field("disabled"):
            filters["disabled"] = 0
        fields = [f for f in ("bank", "iban", "bank_account_no", "account_name") if meta.has_field(f)]
        order = "is_default desc, creation asc" if meta.has_field("is_default") else "creation asc"
        rows = frappe.get_all("Bank Account", filters=filters, fields=fields, order_by=order, limit=1)
        if not rows:
            return {}
        row = rows[0]
        out = {"bank": _clean(row.get("bank")), "iban": _clean(row.get("iban")),
            "account": _clean(row.get("bank_account_no")), "name": _clean(row.get("account_name"))}
        return out if out["iban"] or out["account"] else {}
    except Exception:
        return {}


def company_profile(company: str | None, doc=None, arabic: bool = True) -> dict:
    """The seller as every print shows it. ``doc`` (optional) carries a Sandbox VAT override."""
    c = _company_doc(company)
    ar, en = names(c)
    vat = _clean(getattr(doc, "_bnd_sandbox_vat", None) if doc is not None else None) or (
        _clean(c.get("tax_id")) if c else ""
    )
    if not vat and doc is not None and hasattr(doc, "get"):
        vat = _clean(doc.get("company_tax_id"))
    cr = (_clean(c.get("bnd_commercial_registration")) or _clean(c.get("registration_details"))) if c else ""
    address = address_parts(primary_address_name("Company", c.name) if c else None, arabic=arabic)
    contacts = []
    if c:
        for key, field in CONTACTS:
            value = _clean(c.get(field))
            if not value:
                continue
            if key in _SOCIAL:
                value = handle(value)
            elif key == "website":
                value = website(value)
            if value:
                contacts.append({"key": key, "value": value})
    profile = {
        "name": c.name if c else _clean(company),
        "name_ar": ar,
        "name_en": en,
        "display": (ar or en) if arabic else (en or ar),
        "vat": vat,
        "cr": cr,
        "address": address,
        "contacts": contacts,
        "phone": next((c["value"] for c in contacts if c["key"] == "phone"), ""),
        "policy": _clean(c.get("bnd_print_policy")) if c else "",
        "logo": _image(_logo(c)),
        "stamp": _image(_clean(c.get("bnd_company_stamp"))) if c else "",
        "signature": _image(_clean(c.get("bnd_signature"))) if c else "",
        "signatory": _clean(c.get("bnd_signatory")) if c else "",
        "bank": bank(c.name) if c else {},
    }
    profile["cells"] = cells(profile, vat_required=True)
    return profile


def buyer_profile(doc, arabic: bool = True) -> dict:
    """The buyer (a Sales/POS invoice's customer) as a standard tax invoice shows it: name, VAT
    or another identifier with its type (ksa_compliance's Additional Buyer IDs), the national
    address in parts, and a phone."""
    return party_profile(doc, "Customer", arabic=arabic)


#: Where each party lives on a document: (party doctype field, name field, address field).
_PARTY_FIELDS = {
    "Customer": ("customer", "customer_name", "customer_address"),
    "Supplier": ("supplier", "supplier_name", "supplier_address"),
}


def party_profile(doc, party_type: str = "Customer", arabic: bool = True) -> dict:
    """A customer or a supplier of any document, in the shape the party boxes print.

    A Quotation names its party in `party_name` (`quotation_to` says which doctype); every
    other selling document in `customer`, every buying one in `supplier`."""
    field, name_field, address_field = _PARTY_FIELDS.get(party_type, _PARTY_FIELDS["Customer"])
    party = doc.get(field)
    if not party and doc.get("doctype") == "Quotation" and (doc.get("quotation_to") or "Customer") == party_type:
        party = doc.get("party_name")
    record = frappe.get_cached_doc(party_type, party) if party and frappe.db.exists(party_type, party) else None
    name = _clean(doc.get(name_field)) or (_clean(record.get(name_field)) if record else "") or _clean(party)
    name_ar = (_clean(doc.get("customer_name_in_arabic")) if party_type == "Customer" else "") or (
        _clean(record.get("customer_name_in_arabic")) if record and party_type == "Customer" else ""
    )
    vat = (_clean(doc.get("tax_id")) if party_type == "Customer" else "") or (
        (_clean(record.get("custom_vat_registration_number")) or _clean(record.get("tax_id"))) if record else ""
    )
    ids = []
    if record:
        for row in record.get("custom_additional_ids") or []:
            value = _clean(row.get("value"))
            if value:
                ids.append({"type": _clean(row.get("type_name")) or _clean(row.get("type_code")),
                    "code": _clean(row.get("type_code")), "value": value})
    cr = next((i["value"] for i in ids if i["code"].upper() == "CRN"), "")
    other = [i for i in ids if i["code"].upper() != "CRN"]
    address_name = doc.get(address_field) or (primary_address_name(party_type, party) if party else None)
    address = address_parts(address_name, arabic=arabic)
    phone = _clean(doc.get("contact_mobile")) or _clean(doc.get("contact_phone")) or (
        _clean(record.get("mobile_no")) if record else ""
    )
    out = {
        "type": party_type,
        "name": name,
        "name_ar": name_ar if name_ar != name else "",
        "vat": vat,
        "cr": cr,
        "ids": other,
        "address": address,
        "address_text": "" if address["line"] else _clean(frappe.utils.strip_html(doc.get("address_display") or "")),
        "phone": phone,
    }
    out["cells"] = cells(out)
    return out


_SA = ("Saudi Arabia", "المملكة العربية السعودية", "السعودية")


def cells(party: dict, vat_required: bool = False) -> list[dict]:
    """A party box's grid: VAT, CR, phone, other IDs, then the national address in parts.
    Empty values are dropped by the box; a seller's VAT says when it is not set."""
    a = party.get("address") or {}
    out = [
        {"ar": "الرقم الضريبي", "en": "VAT No.", "ltr": True,
         "value": party.get("vat") or ("غير مُعدّ — NOT SET" if vat_required else "")},
        {"ar": "السجل التجاري", "en": "C.R.", "value": party.get("cr"), "ltr": True},
        {"ar": "الهاتف", "en": "Phone", "value": party.get("phone"), "ltr": True},
    ]
    for i in party.get("ids") or []:
        out.append({"ar": i.get("type") or "معرّف آخر", "en": i.get("code") or "ID", "value": i.get("value"), "ltr": True})
    out += [
        {"ar": "رقم المبنى", "en": "Building", "value": a.get("building"), "ltr": True},
        {"ar": "الشارع", "en": "Street", "value": a.get("street")},
        {"ar": "الحي", "en": "District", "value": a.get("district")},
        {"ar": "المدينة", "en": "City", "value": a.get("city")},
        {"ar": "الرمز البريدي", "en": "Postal", "value": a.get("postal"), "ltr": True},
        {"ar": "الرقم الإضافي", "en": "Add. no.", "value": a.get("additional"), "ltr": True},
        {"ar": "الدولة", "en": "Country", "value": "" if a.get("country") in _SA else a.get("country")},
        {"ar": "العنوان", "en": "Address", "value": party.get("address_text")},
    ]
    return out
