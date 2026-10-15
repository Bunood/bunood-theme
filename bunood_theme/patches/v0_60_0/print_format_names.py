"""Every printed document's record renamed to a name WITHOUT a brand (THE OWNER, 2026-10-15:
«غير اسماء نماذج الطباعه الحين»), so a future rebrand never renames a record again.

THE ONE MAPPING. ``RENAMES`` below is the single statement of old → new. The installer
(``printing/install.py``) creates ONLY the new names, the request hook
(``printing/renames.py``) maps an old ``format`` in a receipt QR link to its new name, and the
tests read this tuple — nothing else spells an old name.

FOR EACH OLD NAME, IN ORDER:
    old missing                 nothing to do (a site that never had it);
    old present, new missing    ``rename_doc(force=True)``: the record keeps its row, its
                                Property Setter default (Print Format.after_rename moves it)
                                and every Link that points at it (POS Profile, Notification,
                                Print Settings, a document's letter_head …);
    both present                ``rename_doc(merge=True)``: the links move to the survivor and
                                the old record goes.
    Where several old names reach one new one, the FIRST present one is renamed and the rest
    merge into it. The order puts the record a site was most likely using first: the Arabic
    official A4 before the English "Bunood Sales Invoice (A4)", whose design the kit replaces
    (the owner's two merges: that A4 into «فاتورة ضريبية - A4», and the ZATCA Phase-1 receipt
    into «فاتورة ضريبية مبسطة - حراري 80مم», which now takes the Phase-2 QR first).

ONE PATCH, RUN ONCE (CLAUDE.md: never extend a patch that has run). It runs before
``after_migrate``, so the installer's sync then rewrites the renamed records' HTML and creates
nothing twice. A second run finds no old name and does nothing.

NOT HERE, ON PURPOSE: the five "Bunood Engineering …" formats and the per-company letter heads
"<company> — Bunood" belong to bunood_engineering, the next wave; Zero One Dining renames its own
in ``bunood_dining/patches/v0_10/print_format_names.py``.
"""

import frappe

#: (doctype, old name, new name). Order matters only where several old names share a new one.
RENAMES = (
    # The standard tax invoice, A4. Its English twin MERGES into it.
    ("Print Format", "بونود - فاتورة ضريبية (A4)", "فاتورة ضريبية - A4"),
    ("Print Format", "بنود - فاتورة ضريبية (A4)", "فاتورة ضريبية - A4"),
    ("Print Format", "Bunood Sales Invoice (A4)", "فاتورة ضريبية - A4"),
    # The simplified tax invoice, A4.
    ("Print Format", "بونود - فاتورة ضريبية مبسطة (A4)", "فاتورة ضريبية مبسطة - A4"),
    ("Print Format", "بنود - فاتورة ضريبية مبسطة (A4)", "فاتورة ضريبية مبسطة - A4"),
    # The main receipt. The ZATCA Phase-1 receipt MERGES into it.
    ("Print Format", "بونود - فاتورة مبسطة (حراري 80مم)", "فاتورة ضريبية مبسطة - حراري 80مم"),
    ("Print Format", "بنود - فاتورة مبسطة (حراري 80مم)", "فاتورة ضريبية مبسطة - حراري 80مم"),
    ("Print Format", "زاتكا - فاتورة مبسطة (حراري 80مم)", "فاتورة ضريبية مبسطة - حراري 80مم"),
    # The B2B thermal receipt.
    ("Print Format", "بونود - فاتورة ضريبية (حراري 80مم)", "فاتورة ضريبية - حراري 80مم"),
    ("Print Format", "بنود - فاتورة ضريبية (حراري 80مم)", "فاتورة ضريبية - حراري 80مم"),
    # The dot-matrix invoice.
    ("Print Format", "بونود - فاتورة (نقطي)", "فاتورة - طابعة نقطية"),
    ("Print Format", "بنود - فاتورة (نقطي)", "فاتورة - طابعة نقطية"),
    # The quotation.
    ("Print Format", "بنود - عرض سعر (A4)", "عرض سعر - A4"),
    ("Print Format", "بونود - عرض سعر (A4)", "عرض سعر - A4"),
    # The receipt / payment voucher (both spellings the README and the code used).
    ("Print Format", "بونود - سند قبض-صرف", "سند قبض وصرف - A4"),
    ("Print Format", "بنود - سند قبض-صرف", "سند قبض وصرف - A4"),
    ("Print Format", "بنود - سند قبض / صرف", "سند قبض وصرف - A4"),
    ("Print Format", "بونود - سند قبض / صرف", "سند قبض وصرف - A4"),
    # The journal voucher.
    ("Print Format", "بونود - سند قيد", "سند قيد - A4"),
    ("Print Format", "بنود - سند قيد", "سند قيد - A4"),
    # The statement of account (a General Ledger report format).
    ("Print Format", "بنود - كشف حساب عميل", "كشف حساب - A4"),
    ("Print Format", "بونود - كشف حساب عميل", "كشف حساب - A4"),
    # The purchase invoice, and the POS A4 that was named in code but never shipped.
    ("Print Format", "Bunood Purchase Invoice (A4)", "فاتورة مشتريات - A4"),
    ("Print Format", "Bunood POS Invoice (A4)", "فاتورة ضريبية - A4 - نقطة البيع"),
    # The site-wide print style and the letter head.
    ("Print Style", "Bunood", "النمط الرسمي"),
    ("Letter Head", "Bunood", "الترويسة الرسمية"),
)

#: Old Print Format name → new, for the request hook and the installer's tests.
FORMAT_RENAMES = {old: new for doctype, old, new in RENAMES if doctype == "Print Format"}


def execute():
    moved = rename_all()
    print("bunood_theme print names:", moved or "nothing to rename")


def rename_all() -> list[str]:
    """Apply RENAMES; return what moved, as «old → new (renamed|merged)» lines."""
    moved = []
    for doctype, old, new in RENAMES:
        if old == new or not frappe.db.exists(doctype, old):
            continue
        merge = bool(frappe.db.exists(doctype, new))
        if _only_single_links(doctype):
            _rename_single_linked(doctype, old, new, merge)
        else:
            frappe.rename_doc(doctype, old, new, force=True, merge=merge, show_alert=False)
        moved.append(f"{doctype}: {old} → {new} ({'merged' if merge else 'renamed'})")
    if moved:
        # Commit, then clear (CLAUDE.md, the cache trap): every doctype whose default print
        # format, style or letter head may have moved reads it again.
        frappe.db.commit()
        frappe.clear_cache()
    return moved


def _only_single_links(doctype: str) -> bool:
    """True when every Link to ``doctype`` sits on a Single (Print Style: only Print Settings).
    Frappe's rename_doc then builds ``doctype IN ()`` in update_user_settings and the database
    refuses it (frappe 16.36, measured on the lab), so such a record is renamed here instead."""
    from frappe.model.rename_doc import get_link_fields

    links = get_link_fields(doctype)
    return bool(links) and all(link.get("issingle") for link in links)


def _rename_single_linked(doctype: str, old: str, new: str, merge: bool) -> None:
    """What rename_doc does for a record linked only from Singles: point each Single at the new
    name, then rename the row (and its autoname field), or drop it when ``new`` already exists."""
    from frappe.model.rename_doc import get_link_fields

    for link in get_link_fields(doctype):
        if frappe.db.get_single_value(link.parent, link.fieldname) == old:
            frappe.db.set_single_value(link.parent, link.fieldname, new)
    if merge:
        frappe.delete_doc(doctype, old, force=True, ignore_permissions=True)
        return
    autoname = frappe.get_meta(doctype).autoname or ""
    frappe.db.sql(f"update `tab{doctype}` set name = %s where name = %s", (new, old))
    if autoname.startswith("field:"):
        frappe.db.set_value(doctype, new, autoname.split(":", 1)[1], new, update_modified=False)
