"""What the kit's other A4 families print (Stage 2 of the print redesign, 2026-10-15).

`trade_view` serves one template, `templates/print/trade_a4.html`, for every document that
carries items: the quotation, the sales order and its proforma, the delivery note, the purchase
invoice (and its return), the purchase order, the goods receipt and the stock entry.
`voucher_view` serves the receipt / payment voucher (A4 and A5), `journal_view` the journal
voucher, `shift_view` the cashier's shift report. Like printing/view.py: pure arithmetic over
the document plus a few reads, positive amounts, YYYY-MM-DD dates, Latin digits.

THE NOT-AN-INVOICE RULE (the market study): a quotation, an order, a delivery note, a proforma
and a goods receipt never say «فاتورة ضريبية» and never carry a QR; a proforma says «فاتورة
مبدئية» with «ليست فاتورة ضريبية». A purchase invoice is the supplier's tax document — its QR
is the supplier's, so ours prints none.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

from bunood_theme.printing import view

#: kind → (doctype, title AR, title EN, number label AR, number label EN, party roles, tax document)
KINDS = {
    "quotation": ("Quotation", "عرض سعر", "Quotation", "رقم العرض", "Quotation No.", ("company", "Customer"), False),
    "sales_order": ("Sales Order", "أمر بيع", "Sales Order", "رقم الأمر", "Order No.", ("company", "Customer"), False),
    "proforma": ("Sales Order", "فاتورة مبدئية", "Proforma Invoice", "رقم الأمر", "Order No.", ("company", "Customer"), False),
    "delivery_note": ("Delivery Note", "سند تسليم", "Delivery Note", "رقم السند", "Note No.", ("company", "Customer"), False),
    "purchase_invoice": ("Purchase Invoice", "فاتورة مشتريات", "Purchase Invoice", "رقم الفاتورة", "Invoice No.", ("Supplier", "company"), False),
    "purchase_order": ("Purchase Order", "أمر شراء", "Purchase Order", "رقم الأمر", "Order No.", ("Supplier", "company"), False),
    "purchase_receipt": ("Purchase Receipt", "إذن استلام", "Goods Receipt Note", "رقم الإذن", "Receipt No.", ("Supplier", "company"), False),
    "stock_entry": ("Stock Entry", "حركة مخزنية", "Stock Entry", "رقم الحركة", "Entry No.", (), False),
}
STOCK_TITLES = {
    "Material Transfer": ("تحويل مخزني", "Stock Transfer"),
    "Material Issue": ("صرف مخزني", "Material Issue"),
    "Material Receipt": ("استلام مخزني", "Material Receipt"),
}
#: The signature row of each kind: (labels, the cell carrying the company's seal or None).
SIGNATURES = {
    "quotation": ([("البائع", "Seller"), ("قبول العميل", "Customer acceptance")], 0),
    "sales_order": ([("البائع", "Seller"), ("العميل", "Customer")], 0),
    "proforma": ([("البائع", "Seller"), ("العميل", "Customer")], 0),
    "delivery_note": ([("المسلِّم", "Delivered by"), ("المستلم — الاسم والتوقيع", "Received by"), ("تاريخ الاستلام", "Date received")], 0),
    "purchase_invoice": ([("أعدّه", "Prepared by"), ("اعتمده", "Approved by")], None),
    "purchase_order": ([("المعتمد عن الشركة", "Approved for the company"), ("المورد", "Supplier")], 0),
    "purchase_receipt": ([("أمين المستودع", "Storekeeper"), ("المستلم", "Received by"), ("المعتمد", "Approved by")], None),
    "stock_entry": ([("أمين المستودع", "Storekeeper"), ("المستلم", "Received by"), ("المعتمد", "Approved by")], None),
}


def _uom(value) -> str:
    return view.UOM_AR.get(value or "", frappe._(value) if value else "")


def _date(doc, *fields) -> str:
    for field in fields:
        if doc.get(field):
            return view.date(doc.get(field))
    return ""


def _unique(values) -> str:
    seen = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return "، ".join(seen)


def _batch(row) -> str:
    return row.get("batch_no") or row.get("serial_no") or ""


def qty_lines(doc, kind: str) -> list[dict]:
    """The rows of a document that moves goods without prices."""
    out = []
    for i, row in enumerate(doc.get("items") or [], start=1):
        line = {
            "idx": i,
            "code": row.get("item_code") or "",
            "name": row.get("item_name") or row.get("item_code") or "",
            "uom": _uom(row.get("uom") or row.get("stock_uom")),
            "qty": view.qty(row.get("qty")),
            "batch": _batch(row),
        }
        if kind == "delivery_note":
            ordered = None
            if row.get("so_detail"):
                ordered = frappe.db.get_value("Sales Order Item", row.get("so_detail"), "qty")
            line["ordered"] = view.qty(ordered if ordered is not None else row.get("qty"))
            line["delivered"] = line["qty"]
        elif kind == "purchase_receipt":
            ordered = None
            po_item = row.get("purchase_order_item")
            if po_item:
                ordered = frappe.db.get_value("Purchase Order Item", po_item, "qty")
            line["ordered"] = view.qty(ordered) if ordered is not None else ""
            line["received"] = view.qty(row.get("received_qty") or row.get("qty"))
            line["accepted"] = view.qty(row.get("qty"))
            line["warehouse"] = row.get("warehouse") or ""
        elif kind == "stock_entry":
            line["from"] = row.get("s_warehouse") or ""
            line["to"] = row.get("t_warehouse") or ""
        out.append(line)
    return out


#: The columns of each quantity table (the delivery note's are the addendum's).
QTY_COLUMNS = {
    "delivery_note": [
        {"ar": "الصنف", "en": "Item", "key": "name", "w": "38%"},
        {"ar": "الوحدة", "en": "Unit", "key": "uom", "w": "9%"},
        {"ar": "الكمية المطلوبة", "en": "Ordered", "key": "ordered", "n": True, "w": "13%"},
        {"ar": "الكمية المسلّمة", "en": "Delivered", "key": "delivered", "n": True, "w": "13%"},
        {"ar": "الدفعة / التسلسلي", "en": "Batch / serial", "key": "batch", "w": "22%"},
    ],
    "purchase_receipt": [
        {"ar": "الصنف", "en": "Item", "key": "name", "w": "30%"},
        {"ar": "الوحدة", "en": "Unit", "key": "uom", "w": "8%"},
        {"ar": "المطلوبة", "en": "Ordered", "key": "ordered", "n": True, "w": "11%"},
        {"ar": "المستلمة", "en": "Received", "key": "received", "n": True, "w": "11%"},
        {"ar": "المقبولة", "en": "Accepted", "key": "accepted", "n": True, "w": "11%"},
        {"ar": "المستودع", "en": "Warehouse", "key": "warehouse", "w": "24%"},
    ],
    "stock_entry": [
        {"ar": "الصنف", "en": "Item", "key": "name", "w": "30%"},
        {"ar": "الوحدة", "en": "Unit", "key": "uom", "w": "8%"},
        {"ar": "الكمية", "en": "Qty", "key": "qty", "n": True, "w": "10%"},
        {"ar": "من مستودع", "en": "From", "key": "from", "w": "17%"},
        {"ar": "إلى مستودع", "en": "To", "key": "to", "w": "17%"},
        {"ar": "الدفعة / التسلسلي", "en": "Batch / serial", "key": "batch", "w": "13%"},
    ],
}


def _meta(doc, kind: str) -> list[dict]:
    d = lambda ar, en, value, ltr=False: {"ar": ar, "en": en, "value": value or "", "ltr": ltr}
    currency = doc.get("currency") if doc.get("currency") and doc.get("currency") != "SAR" else ""
    if kind == "quotation":
        return [d("التاريخ", "Date", _date(doc, "transaction_date"), True),
                d("صالح حتى", "Valid until", _date(doc, "valid_till"), True),
                d("شروط الدفع", "Payment terms", doc.get("payment_terms_template")),
                d("المندوب", "Salesperson", view.sales_person(doc)),
                d("العملة", "Currency", currency, True)]
    if kind in ("sales_order", "proforma"):
        return [d("التاريخ", "Date", _date(doc, "transaction_date"), True),
                d("تاريخ التسليم", "Delivery date", _date(doc, "delivery_date"), True),
                d("أمر شراء العميل", "Customer PO", doc.get("po_no"), True),
                d("شروط الدفع", "Payment terms", doc.get("payment_terms_template")),
                d("المندوب", "Salesperson", view.sales_person(doc)),
                d("العملة", "Currency", currency, True)]
    if kind == "delivery_note":
        rows = doc.get("items") or []
        return [d("التاريخ والوقت", "Date & time", " ".join(p for p in (view.date(doc.get("posting_date")), view.time(doc.get("posting_time"))) if p), True),
                d("أمر البيع", "Sales order", _unique(r.get("against_sales_order") for r in rows), True),
                d("أمر شراء العميل", "Customer PO", doc.get("po_no"), True),
                d("المستودع", "Warehouse", doc.get("set_warehouse") or _unique(r.get("warehouse") for r in rows)),
                d("السائق / المركبة", "Driver / vehicle", " · ".join(p for p in (doc.get("driver_name"), doc.get("vehicle_no")) if p))]
    if kind == "purchase_invoice":
        return [d("التاريخ", "Date", _date(doc, "posting_date"), True),
                d("فاتورة المورد", "Supplier invoice", " · ".join(p for p in (doc.get("bill_no"), view.date(doc.get("bill_date"))) if p), True),
                d("تاريخ الاستحقاق", "Due", _date(doc, "due_date"), True),
                d("شروط الدفع", "Payment terms", doc.get("payment_terms_template")),
                d("العملة", "Currency", currency, True)]
    if kind == "purchase_order":
        return [d("التاريخ", "Date", _date(doc, "transaction_date"), True),
                d("مطلوب بتاريخ", "Required by", _date(doc, "schedule_date"), True),
                d("شروط الدفع", "Payment terms", doc.get("payment_terms_template")),
                d("التسليم إلى", "Deliver to", doc.get("set_warehouse")),
                d("العملة", "Currency", currency, True)]
    if kind == "purchase_receipt":
        rows = doc.get("items") or []
        return [d("التاريخ والوقت", "Date & time", " ".join(p for p in (view.date(doc.get("posting_date")), view.time(doc.get("posting_time"))) if p), True),
                d("سند تسليم المورد", "Supplier delivery note", doc.get("supplier_delivery_note"), True),
                d("أمر الشراء", "Purchase order", _unique(r.get("purchase_order") for r in rows), True),
                d("المستودع", "Warehouse", doc.get("set_warehouse") or _unique(r.get("warehouse") for r in rows))]
    if kind == "stock_entry":
        return [d("التاريخ والوقت", "Date & time", " ".join(p for p in (view.date(doc.get("posting_date")), view.time(doc.get("posting_time"))) if p), True),
                d("النوع", "Type", frappe._(doc.get("stock_entry_type") or doc.get("purpose") or "")),
                d("من مستودع", "From", doc.get("from_warehouse")),
                d("إلى مستودع", "To", doc.get("to_warehouse"))]
    return []


def trade_view(doc, kind: str, arabic: bool = True) -> dict:
    doctype, ar, en, no_ar, no_en, roles, tax_document = KINDS[kind]
    priced = kind not in QTY_COLUMNS
    returned = bool(doc.get("is_return"))
    if kind == "purchase_invoice" and returned:
        ar, en = "مرتجع مشتريات", "Purchase Return"
    elif kind == "delivery_note" and returned:
        ar, en = "مرتجع تسليم", "Delivery Return"
    elif kind == "stock_entry":
        ar, en = STOCK_TITLES.get(doc.get("purpose") or doc.get("stock_entry_type"), (ar, en))
    reference = {}
    if returned and doc.get("return_against"):
        original_date = ""
        if frappe.db.exists(doctype, doc.get("return_against")):
            original_date = view.date(frappe.db.get_value(doctype, doc.get("return_against"), "posting_date"))
        remarks = (doc.get("remarks") or "").strip()
        reason = "" if remarks in ("", "No Remarks") or remarks.startswith("Against ") else remarks
        # The supplier's own credit-note number is already in the meta row («فاتورة المورد»).
        reference = {"originals": [doc.get("return_against")], "date": original_date, "reason": reason}
    out = {
        "kind": kind,
        "title_ar": ar,
        "title_en": en,
        "number": doc.get("name") or "",
        "no_ar": no_ar,
        "no_en": no_en,
        "roles": roles,
        "tax_document": tax_document,
        "priced": priced,
        "meta": _meta(doc, kind),
        "reference": reference,
        "not_invoice": kind == "proforma",
        "signatures": SIGNATURES[kind][0],
        "seal": SIGNATURES[kind][1],
        "columns": QTY_COLUMNS.get(kind, []),
        # A stock entry has no terms; its remarks print under the table as «البيان».
        "remarks": (doc.get("remarks") or "").strip() if kind == "stock_entry" else "",
    }
    if priced:
        out["lines"] = view.lines(doc)
        out["currency"] = doc.get("currency") or ""
        out["totals"] = view.totals(doc, out["lines"], settled=(kind == "purchase_invoice"))
        out["words"] = view.words(doc, out["totals"]["grand_value"], arabic)
    else:
        out["lines"] = qty_lines(doc, kind)
        out["total_qty"] = view.qty(sum(abs(flt(r.get("qty"))) for r in doc.get("items") or []))
    return out


# --- the receipt / payment voucher -------------------------------------------------------------

VOUCHER_TITLES = {
    "Receive": ("سند قبض", "Receipt Voucher", "استلمنا من السيد / السادة", "Received from"),
    "Pay": ("سند صرف", "Payment Voucher", "صرفنا إلى السيد / السادة", "Paid to"),
    "Internal Transfer": ("سند تحويل", "Transfer Voucher", "تحويل بين حسابات المنشأة", "Internal transfer"),
}


def voucher_view(doc, arabic: bool = True) -> dict:
    kind = doc.get("payment_type") or "Receive"
    ar, en, party_ar, party_en = VOUCHER_TITLES.get(kind, VOUCHER_TITLES["Receive"])
    receive = kind == "Receive"
    amount = flt(doc.get("received_amount") if receive else doc.get("paid_amount")) or flt(doc.get("paid_amount"))
    currency = (doc.get("paid_to_account_currency") if receive else doc.get("paid_from_account_currency")) or doc.get("company_currency") or "SAR"
    bank_account = doc.get("paid_to") if receive else doc.get("paid_from")
    allocations = []
    for row in doc.get("references") or []:
        posting = ""
        if row.get("reference_doctype") and row.get("reference_name") and frappe.db.exists(row.reference_doctype, row.reference_name):
            meta = frappe.get_meta(row.reference_doctype)
            field = "posting_date" if meta.has_field("posting_date") else ("transaction_date" if meta.has_field("transaction_date") else None)
            if field:
                posting = view.date(frappe.db.get_value(row.reference_doctype, row.reference_name, field))
        allocations.append({
            "name": row.get("reference_name") or "",
            "doctype": frappe._(row.get("reference_doctype") or ""),
            "date": posting,
            "total": view.num(row.get("total_amount")),
            "allocated": view.num(row.get("allocated_amount")),
        })
    method = doc.get("mode_of_payment") or ""
    return {
        "title_ar": ar, "title_en": en, "party_ar": party_ar, "party_en": party_en,
        "number": doc.get("name") or "",
        "date": view.date(doc.get("posting_date")),
        "method": frappe._(method) if method else "",
        "reference": doc.get("reference_no") or "",
        "reference_date": view.date(doc.get("reference_date")),
        "account": bank_account or "",
        "party": doc.get("party_name") or doc.get("party") or "",
        "party_type": doc.get("party_type") or "",
        "amount": view.num(amount),
        "currency": currency,
        "words": view.words(SimpleDoc(currency=currency), amount, arabic),
        "remarks": _remarks(doc),
        "allocations": allocations,
        "allocated_total": view.num(sum(flt(r.get("allocated_amount")) for r in doc.get("references") or [])),
        "unallocated": view.num(doc.get("unallocated_amount")) if flt(doc.get("unallocated_amount")) >= 0.005 else "",
    }


class SimpleDoc(dict):
    __getattr__ = dict.get


def _remarks(doc) -> str:
    """«وذلك عن»: the user's own remark; ERPNext's generated one («Amount SAR 100 received from
    …») says nothing the voucher does not already print."""
    remarks = (doc.get("remarks") or "").strip()
    if not remarks or remarks.startswith(("Amount ", "Transaction reference no")):
        return ""
    return remarks


# --- the journal voucher -----------------------------------------------------------------------

def journal_view(doc, arabic: bool = True) -> dict:
    rows = []
    for row in doc.get("accounts") or []:
        party = ""
        if row.get("party"):
            party = frappe.db.get_value(row.party_type, row.party, ("customer_name" if row.party_type == "Customer" else "supplier_name" if row.party_type == "Supplier" else "name")) or row.party
        rows.append({
            "account": row.get("account") or "",
            "party": party,
            "cost_center": row.get("cost_center") or "",
            "remark": (row.get("user_remark") or "").strip(),
            "debit": view.num(row.get("debit_in_account_currency") or row.get("debit")) if flt(row.get("debit")) else "",
            "credit": view.num(row.get("credit_in_account_currency") or row.get("credit")) if flt(row.get("credit")) else "",
        })
    total = flt(doc.get("total_debit"))
    return {
        "title_ar": "سند قيد", "title_en": "Journal Voucher",
        "number": doc.get("name") or "",
        "date": view.date(doc.get("posting_date")),
        "type": frappe._(doc.get("voucher_type") or ""),
        "reference": " · ".join(p for p in (doc.get("cheque_no"), view.date(doc.get("cheque_date"))) if p),
        "rows": rows,
        "total_debit": view.num(doc.get("total_debit")),
        "total_credit": view.num(doc.get("total_credit")),
        "currency": doc.get("company_currency") or "SAR",
        "words": view.words(SimpleDoc(currency="SAR"), total, arabic),
        "remark": (doc.get("user_remark") or "").strip(),
    }


# --- the cashier's shift report (POS Closing Entry) ---------------------------------------------

def shift_view(doc, arabic: bool = True) -> dict:
    """The shift's money and sales: tenders expected vs counted, sales, returns, discounts, VAT."""
    invoices = [r.get("sales_invoice") or r.get("pos_invoice") for r in (doc.get("sales_invoices") or doc.get("pos_invoices") or [])]
    invoice_doctype = "Sales Invoice" if doc.get("sales_invoices") else "POS Invoice"
    sales = returns = discount = count = return_count = 0.0
    for name in invoices:
        if not name:
            continue
        row = frappe.db.get_value(invoice_doctype, name, ["grand_total", "is_return", "discount_amount"], as_dict=True)
        if not row:
            continue
        if row.is_return:
            returns += abs(flt(row.grand_total))
            return_count += 1
        else:
            sales += flt(row.grand_total)
            count += 1
        discount += abs(flt(row.discount_amount))
    tenders = []
    cash_diff = 0.0
    for row in doc.get("payment_reconciliation") or []:
        diff = flt(row.get("closing_amount")) - flt(row.get("expected_amount"))
        tenders.append({"method": frappe._(row.get("mode_of_payment") or ""), "opening": view.num(row.get("opening_amount")),
                        "expected": view.num(row.get("expected_amount")), "counted": view.num(row.get("closing_amount")),
                        "difference": ("-" if diff < 0 else "") + view.num(diff), "short": diff < -0.004})
        cash_diff += diff
    taxes = [{"account": row.get("account_head") or "", "amount": view.num(row.get("amount"))} for row in doc.get("taxes") or []]
    user = doc.get("user") or doc.get("owner")
    return {
        "number": doc.get("name") or "",
        "profile": doc.get("pos_profile") or "",
        "cashier": frappe.db.get_value("User", user, "full_name") or user if user else "",
        "opened": " ".join(p for p in (view.date(doc.get("period_start_date")), view.time(str(doc.get("period_start_date") or "")[11:])) if p),
        "closed": " ".join(p for p in (view.date(doc.get("period_end_date")), view.time(str(doc.get("period_end_date") or "")[11:])) if p),
        "invoices": int(count),
        "returns_count": int(return_count),
        "sales": view.num(sales),
        "returns": view.num(returns),
        "discounts": view.num(discount),
        "net": view.num(doc.get("net_total")),
        "vat": view.num(doc.get("total_taxes_and_charges")),
        "grand": view.num(doc.get("grand_total")),
        "quantity": view.qty(doc.get("total_quantity")),
        "tenders": tenders,
        "difference": ("-" if cash_diff < 0 else "") + view.num(cash_diff),
        "short": cash_diff < -0.004,
        "taxes": taxes,
        "draft": doc.get("docstatus") == 0,
    }
