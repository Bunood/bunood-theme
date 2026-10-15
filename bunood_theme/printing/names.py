"""The print records' names — no brand in any of them (the owner, 2026-10-15: «غير اسماء نماذج
الطباعه»), so a future rebrand never renames a record again.

Imports nothing, so the installer, the ZATCA delivery policy, the request hook and the tests read
the same facts. The OLD names live in one place only: ``patches/v0_60_0/print_format_names.py``.
"""

#: The site-wide Print Style (the substituted print.scss) and the bilingual Letter Head.
STYLE_NAME = "النمط الرسمي"
LETTERHEAD_NAME = "الترويسة الرسمية"

#: Sales Invoice — the kit's three core formats, then the rest of the family.
TAX_INVOICE_A4 = "فاتورة ضريبية - A4"
SIMPLIFIED_INVOICE_A4 = "فاتورة ضريبية مبسطة - A4"
SIMPLIFIED_RECEIPT_80 = "فاتورة ضريبية مبسطة - حراري 80مم"
TAX_RECEIPT_80 = "فاتورة ضريبية - حراري 80مم"
SIMPLIFIED_RECEIPT_58 = "فاتورة ضريبية مبسطة - حراري 58مم"
GIFT_RECEIPT_80 = "إيصال هدية - حراري 80مم"
MATRIX_INVOICE = "فاتورة - طابعة نقطية"

#: A POS Invoice twin carries its Sales Invoice sibling's name with this suffix.
POS_SUFFIX = " - نقطة البيع"

#: The other documents. None of the selling or buying papers that is not an invoice is named one,
#: except the proforma, which says so («فاتورة مبدئية») and prints «ليست فاتورة ضريبية».
QUOTATION_A4 = "عرض سعر - A4"
SALES_ORDER_A4 = "أمر بيع - A4"
PROFORMA_A4 = "فاتورة مبدئية - A4"
DELIVERY_NOTE_A4 = "سند تسليم - A4"
PURCHASE_INVOICE_A4 = "فاتورة مشتريات - A4"
PURCHASE_ORDER_A4 = "أمر شراء - A4"
PURCHASE_RECEIPT_A4 = "إذن استلام - A4"
STOCK_ENTRY_A4 = "تحويل مخزني - A4"
VOUCHER_A4 = "سند قبض وصرف - A4"
VOUCHER_A5 = "سند قبض وصرف - A5"
JOURNAL_A4 = "سند قيد - A4"
STATEMENT_A4 = "كشف حساب - A4"
SHIFT_REPORT_80 = "تقرير الوردية - حراري 80مم"
