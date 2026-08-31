# Bunood Printing — منظومة الطباعة الموحّدة

## English and Arabic commercial invoices (2026-08-31)

`Bunood Purchase Invoice (A4)` and `Bunood Sales Invoice (A4)` share
`templates/bunood_invoice_a4.html`. In Print, select **Language: English (en)**
or **Arabic (ar)**. Each produces a single-language document: English is LTR;
Arabic mirrors the title, metadata, parties, item columns and totals into RTL.
The managed letterhead/footer and amount in words follow the same language.
The title no longer repeats the currency; currency remains in metadata and
amount headings/totals. Hairline Minimal uses one company/VAT/CR header row.
Arabic uses self-hosted Noto Naskh Arabic Regular/Bold, also installed into the
shared PDF fontconfig directory. Its Arabic-only subsets preserve complete
Latin labels, numbers and invoice identifiers in their existing Latin face.
The read-only `bunood_print_language()` Jinja helper resolves the language at
render time, avoiding stale `frappe.lang` snapshots in cached environments.
Names, descriptions and addresses retain source data; they are not machine
translated. Company uses its Arabic name when present, otherwise its saved name.
Identifiers and numeric runs stay LTR in both versions. Both use explicit quantity/unit/price/amount
columns, ISO currency codes, and white print-media header text. They omit
thumbnail placeholders and mark an absent invoice address explicitly. They
do not change invoice records, calculate new taxes, or certify tax compliance.
Use the existing specialized tax formats when those workflows are required.

These two formats are managed by the existing installer. Installation makes
them available but does not override a tenant's default format. The local
`verify.bunood.test` site explicitly selected them through native default-print
format Property Setters, replacing the stock image formats.

Actual-PDF regression (requires a running demo site, wkhtmltopdf and Python
`pdfplumber` and `lxml`; the long/tax/return documents are unsaved copies):

```sh
BND_PDF_OUTPUT=/tmp/invoice-pdfs node tools/invoice-pdf-regression.mjs
python tools/verify_invoice_pdfs.py /tmp/invoice-pdfs
```

Set the usual `BND_DOCKER`, `BND_BACKEND`, `BND_SITE` environment variables.
`BND_PDF_ASSET_URL` defaults to the container-visible `http://frontend:8080`.
The demo source records are `ACC-PINV-2026-00002` and `ACC-SINV-2026-00002`.
Checks first exercise eight sequential native-preview language switches in one
process, then inspect real PDF glyph colors, table extraction, unchanged source
documents, two print languages, page continuity, a long unbroken item code,
discount/tax values and negative return amounts. A one-page browser screenshot
does not substitute for these checks.

PDF text extraction still depends on the reader: wkhtmltopdf emits shaped
Arabic glyphs, not a tagged semantic accounting interchange format. Use the
source document API/export for automated accounting imports.

نمط طباعة عام + ٩ قوالب جاهزة، **تصل كل موقع تلقائياً** (المُثبّت يعمل مع كل
`bench migrate` عبر `after_migrate`) — لا خطوات يدوية لكل مستأجر.

## كيف «يؤخذ الثيم» لكل التطبيقات حتى المستقبلية؟

| الآلية | الأثر |
|---|---|
| **Print Style «Bunood»** يُضبط افتراضياً للنظام (`Print Settings.print_style`) | كل Print Format في **أي** تطبيق — الآن ومستقبلاً — يرث الخط/الألوان/الجداول تلقائياً |
| **Macros مشتركة** في `templates/bunood_print_macros.html` | أي تطبيق جديد يبني قالباً كاملاً بأسطُر: `{% from "templates/bunood_print_macros.html" import doc_title, items_table, totals_block, zatca_qr %}` |
| **المُثبّت** `printing/install.py` (idempotent، لا يكسر الـ migrate أبداً) | الملفات هنا هي مصدر الحقيقة؛ أي تعديل يصل كل المواقع مع الـ migrate التالي |

## القوالب

| القالب | الدوكتايب | ملاحظات |
|---|---|---|
| Bunood Purchase Invoice (A4) | Purchase Invoice | نسخة عربية RTL أو إنجليزية LTR حسب لغة الطباعة |
| Bunood Sales Invoice (A4) | Sales Invoice | نسخة عربية RTL أو إنجليزية LTR حسب لغة الطباعة |
| بونود - فاتورة ضريبية (A4) | Sales Invoice | ZATCA قياسية: بيانات البائع والمشتري + VAT + QR |
| بونود - فاتورة ضريبية مبسطة (A4) | Sales Invoice | B2C — بيانات المشتري اختيارية، QR إلزامي |
| بونود - فاتورة ضريبية (حراري 80مم) | Sales Invoice | إيصال حراري + بيانات المشتري إن وُجدت |
| بونود - فاتورة مبسطة (حراري 80مم) | Sales Invoice | إيصال POS الكلاسيكي |
| بونود - فاتورة (نقطي) | Sales Invoice | هيكل Courier أساس — **انسخه وعدّله لكل عميل** حسب نموذجه المطبوع مسبقاً |
| بونود - سند قبض / صرف | Payment Entry | العنوان يتبدّل تلقائياً (قبض/صرف/تحويل) + صندوق مبلغ + مراجع |
| بونود - سند قيد | Journal Entry | جدول مدين/دائن + الإجماليات |

## تشغيل الطباعة الحرارية
- القوالب الحرارية تعلن المقاس على `.print-format`
  (`page-width: 80mm; page-height: 297mm`) — وهذه هي القناة الوحيدة التي
  يقرأها محرّك الـ PDF، لذا **زر PDF يُخرج 80مم فعلياً** على المحرّكين.
  اختر **بلا ترويسة** (No Letterhead) لأن رأس الشركة مضمّن في القالب نفسه.
- `@page` باقٍ في القوالب من أجل الطباعة المباشرة من المتصفح (Ctrl+P): المتصفح
  يحترمه، ومحرّك الـ PDF لا يراه إطلاقاً.
- للطباعة RAW‏ (ESC/POS عبر QZ Tray): تُضبط من إعدادات الطابعة على الـ bench —
  خارج نطاق الكود هنا عمداً.

## ZATCA QR
الـ macro‏ `zatca_qr(doc)` يجرّب الحقول المعروفة (`ksa_einv_qr` من توطين السعودية،
`qr_code`، `custom_zatca_qr`، `custom_qr_code`) ويتجاهل بصمت إن غابت — القوالب
تعمل مع/بدون `ksa_compliance`. توليد الـ QR نفسه مسؤولية تطبيق التوطين.

## سياسات الإدارة (مهم للمشرفين)

- **القوالب مُدارة:** أي تعديل يدوي على قالب «بونود - …» في الـ Desk **سيُستبدل مع
  الـ migrate التالي** (الملفات هنا هي مصدر الحقيقة). للتخصيص لعميل: **انسخ القالب**
  (Duplicate) باسم جديد وعدّل النسخة — النسخ لا تُلمس أبداً.
- **نمط الطباعة يُضبط مرة واحدة:** المُثبّت يجعل «Bunood» الافتراضي فقط إذا كان
  الموقع على نمط Frappe الجاهز (Modern/Classic/Standard). اختيار المشرف لنمط آخر
  لاحقاً يُحترم ولا يُستبدل.
- **زر PDF والحراري:** يعمل بمقاس 80مم. المقاس معلَن على `.print-format`، وهي
  القناة الوحيدة التي يقرأها المحرّكان (`read_options_from_html`). `@page` لا
  يصل أيّاً منهما: wkhtmltopdf يتجاهله، و chrome يثبّت `preferCSSPageSize=False`
  فيفوز مقاس `printToPDF` الصريح. مقيس على bench حيّ: 80×297مم على المحرّكين،
  وA4 تبقى 210×297مم.

## قواعد
- الأنماط العامة في `scss/print/print.scss` **فقط** (تُستبدل الرموز لكل موقع عبر `printing/sheet.py` ثم تصل عبر Print Style) —
  لا `<style>` داخل القوالب إلا مقاس الصفحة الحراري (`.print-format` مع `@page`).
- الألوان **رموز `--bnd-*` تُستبدل آلياً** لكل موقع من `palette.derive()` (آلية العنصر 34، المستهلك الرابع) — لا مزامنة يدوية بعد الآن
  (ليس في هذا المستودع).
- كل القيم مهرَّبة `| e`؛ الأرقام/المراجع داخل `dir="ltr"`.
- خط عربي على خادم الـ PDF إلزامي (Cairo/Amiri + fallback ‏Noto مضمّن).
