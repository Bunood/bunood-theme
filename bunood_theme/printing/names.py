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
MATRIX_INVOICE = "فاتورة - طابعة نقطية"

#: A POS Invoice twin carries its Sales Invoice sibling's name with this suffix.
POS_SUFFIX = " - نقطة البيع"

#: The other documents.
PURCHASE_INVOICE_A4 = "فاتورة مشتريات - A4"
QUOTATION_A4 = "عرض سعر - A4"
VOUCHER_A4 = "سند قبض وصرف - A4"
JOURNAL_A4 = "سند قيد - A4"
STATEMENT_A4 = "كشف حساب - A4"
