# The print redesign — report (Stage 1)

The owner, 2026-10-15: «غير اسماء نماذج الطباعه الحين … اريد ان تعيد تصاميم كل انواع الطباعه …» —
rename every print format now; items in a full table; under it a SMALL totals table on the physical
RIGHT and the ZATCA QR on the physical LEFT; a header with the company's Arabic and English names,
CR and VAT; a footer with exactly the address and the contact methods, the company policy under it;
a lean simplified A4, a fuller standard tax invoice, elegant tabular thermal receipts. The market
study's addendum is folded in where it does not contradict him.

Branches: theme `feat/print-redesign` (from `feat/zerone-brand` 68df11f), dining
`feat/print-redesign` (from d131ccd), business `feat/print-org-fields` (from c8c64b4).
Not pushed, not tagged, no version bump.

## Commits

| Repo | Commit | Subject |
| --- | --- | --- |
| theme | `f72b189` | feat(print): the Company's print profile, its resolver and the invoice figures |
| theme | `50e3351` | feat(print): the print kit — one stylesheet, shared macros, the sales invoice A4 and receipt |
| theme | `09b1cfb` | fix(print): the letter head in clean UTF-8, from the print profile, in the kit's design |
| theme | `38dea4f` | feat(print): every print record renamed without a brand; old receipt links still resolve |
| theme | `f137d7f` | fix(print): the national address keeps its own direction in an English print |
| dining | `31fbb9c` | feat(print): the dining print formats renamed without a brand |
| business | `af7afa1` | feat(organization): «بيانات الطباعة» — the print profile on the «المنشأة» screen |

Two commit-message slips, left as they are (no amending): `38dea4f` gives the desk JS as 202,699
gzip bytes — measured, it is 202,692 (8 bytes under the 202,700 ceiling, which is not raised);
`f137d7f` says it also moves the receipt's long-name cut to 16 characters — that change landed in
`50e3351`.

## What was built

**Company data (theme installs, business edits).** `bnd_company_name_ar`, `bnd_company_name_en`,
`bnd_mobile`, `bnd_instagram`, `bnd_x`, `bnd_snapchat`, `bnd_tiktok`, `bnd_print_policy` (Small
Text; its hint names the Ministry of Commerce's ban on «البضاعة المباعة لا ترد ولا تستبدل»), in a
«بيانات الطباعة» section on Company, reconciled on every migrate. `phone_no`, `email`, `website`
are reused.

**The resolver** (`printing/profile.py`, jinja `bunood_print_profile`): names by script (the AR
field, else `company_name` when Arabic, else ksa Phase-2 `seller_name` when Arabic; the EN field,
else a Latin `company_name`; a missing name prints nothing), CR (field, else
`registration_details`), VAT (`tax_id`; a Sandbox preview's signed VAT wins), the primary Address
as parts and as one line in Saudi Post order, the non-empty contacts (handles normalised to
«@name», websites without scheme), policy, logo (Theme Settings, then `company_logo`), stamp,
signature, signatory, default company Bank Account. `bunood_buyer_profile`: name (+ ksa Arabic
name), VAT (doc, ksa `custom_vat_registration_number`, `tax_id`), CR and other IDs from ksa
`custom_additional_ids`, address parts, phone.

**The figures** (`printing/view.py`, jinja `bunood_invoice_view`): per line the code, name,
description, unit (Arabic for stock UOMs), qty, unit price (before line discount), discount
(line + allocated invoice discount), taxable amount, VAT rate and amount (ERPNext v16's
`item_wise_tax_details`), total incl. VAT, and the lean shape's price incl. VAT. Totals: before
discount, discount, taxable, VAT (+ rate), other charges, rounding, grand total, advance, paid,
change, balance due. Title by document (tax / simplified / credit / debit; a seller with no VAT
number prints «فاتورة مبيعات»). Dates YYYY-MM-DD, Latin digits, amounts positive on a note.
Supply date: no app defines one, so it is never printed (it equals the issue date; the addendum
prints it only when it differs).

**The kit** (`templates/print/`): `print_kit.css` — the one stylesheet, its tokens substituted
per site at render (`bunood_print_kit_css`), so a format keeps its look whatever Print Style the
site selected; `kit.html` — the shared macros; one template per family:
`sales_invoice_a4.html` (`zo_kind` standard | simplified) and `sales_receipt.html`
(`zo_width` 80 | 58, `zo_b2b`). The format files only set switches.

- Header: Arabic block physical right (name 15pt bold, «السجل التجاري», «الرقم الضريبي»), logo
  centre (≤ 19 mm), English block physical left (11pt, C.R., VAT No.), a 1.25pt brand rule.
- Page number «صفحة 1 من 3 — Page 1 of 3» in the top margin (an `@page` margin box).
- Title band (AR | EN) with the document number large; balanced meta grid (5 per row, never a
  row of empty boxes); a credit/debit note's reference strip (original(s), its date, the reason
  from ksa `custom_return_reason`, else the remarks).
- Standard: seller and buyer boxes of equal height, each a 3-column grid of VAT, CR, phone and
  the six national-address parts; 11 columns exactly as the brief lists them.
- Simplified (addendum wins): one customer line; columns م | الصنف | الكمية | سعر الوحدة |
  الإجمالي شامل الضريبة (the price incl. VAT, so qty × price = line total); totals before VAT,
  VAT 15%, total incl. VAT (+ discount, paid, change when used).
- Under the table: one row pinned `direction: ltr` — the QR (36 mm) physically LEFT with
  «رمز التحقق — ZATCA», the small totals table physically RIGHT, the grand total in the brand
  band; kept together on one page. Then the amount in words («فقط … لا غير»), notes and bank
  side by side, the signature row (البائع / المستلم; the seller's cell carries signature, stamp
  and signatory when set).
- Foot, every page: a brand rule, the national address with a pin glyph, the contact methods
  with inline SVG glyphs (only the non-empty ones); the policy under it on every page when it is
  ≤ 2 short lines, else once at the end of the body.
- States: a draft carries «مسودة DRAFT» on every page and no QR; a tax document never prints
  «ملغاة/CANCELLED».
- Numbers: number cells and their headers align on the number's own end (right), so decimal
  points line up; totals sit in equal-width boxes flush to the line's end.
- Receipt (80 mm): logo, AR/EN names, VAT, C.R., branch; title band; meta table (number, date and
  time, cashier, order type/table from Dining, original + reason on a note, the customer when not
  the walk-in one); items الصنف | الكمية | السعر | الإجمالي with a long name on its own line;
  totals with the inverted black total band; payments, paid, change; QR 35 mm; address and
  contacts; policy; «شكراً لزيارتكم — Thank you»; the invoice number as Code 128-B (drawn as SVG,
  no dependency). Black only, 600-800 weights, body ≥ 9pt. The page height is estimated from the
  content (a roll has no length; the PNGs are trimmed).

**Page chrome is CSS.** Frappe's `#header-html/#footer-html` overlay was tried and set aside on
Chromium: it cannot number pages (its `clone_and_update` script ships only with print_designer —
the page line printed "Page of"), and the `.print-format` margins it reads also apply as CSS and
shift the overlay (the header printed half on page 1 and half on page 2, the footer was cut). The
kit uses fixed head/foot boxes (Chromium paints a fixed box on every sheet) and the frame table's
`<thead>/<tfoot>` spacers (repeated on every page) to keep the content clear; `@page` margin boxes
number the pages. Two vendor rules had to be beaten: Bootstrap's print `* { color: #000 }` (it
broke ink inheritance — the white total amount printed black on black) and the site sheet's
`tfoot { display: table-row-group }` (it put the foot spacer at the top). The same output in the
PDF and in the browser's own print; on screen the header sits on top and the footer at the end.

**Letter head** «الترويسة الرسمية»: rewritten in UTF-8 (defect 1 — the labels were
double-encoded), reads the profile (defect 2), `split` is the kit's mirror and the footer is the
kit's foot, so stock and other apps' formats match. A site on «Frappe's own» keeps its record
untouched by design — team-rc is one, so its record still holds the old content.

**Business «المنشأة»**: a «بيانات الطباعة» card (names AR/EN, mobile/WhatsApp, Instagram, X,
Snapchat, TikTok, policy) with its own save; the «As it prints» preview shows them;
`save_company` saves them permission-first and refuses the banned policy wording.

## The rename (patch `patches/v0_60_0/print_format_names.py`, mapping `RENAMES`)

| Old | New |
| --- | --- |
| بونود/بنود - فاتورة ضريبية (A4), **Bunood Sales Invoice (A4)** (merges) | فاتورة ضريبية - A4 |
| بونود/بنود - فاتورة ضريبية مبسطة (A4) | فاتورة ضريبية مبسطة - A4 |
| بونود/بنود - فاتورة مبسطة (حراري 80مم), **زاتكا - فاتورة مبسطة (حراري 80مم)** (merges) | فاتورة ضريبية مبسطة - حراري 80مم |
| بونود/بنود - فاتورة ضريبية (حراري 80مم) | فاتورة ضريبية - حراري 80مم |
| بونود/بنود - فاتورة (نقطي) | فاتورة - طابعة نقطية |
| بنود/بونود - عرض سعر (A4) | عرض سعر - A4 |
| بونود/بنود - سند قبض-صرف, بنود/بونود - سند قبض / صرف | سند قبض وصرف - A4 |
| بونود/بنود - سند قيد | سند قيد - A4 |
| بنود/بونود - كشف حساب عميل | كشف حساب - A4 |
| Bunood Purchase Invoice (A4) | فاتورة مشتريات - A4 |
| Bunood POS Invoice (A4) (named in code, never shipped) | فاتورة ضريبية - A4 - نقطة البيع |
| Print Style "Bunood" | النمط الرسمي |
| Letter Head "Bunood" | الترويسة الرسمية |
| dining: Bunood Dining Pre-bill (+ POS Invoice) | الحساب - حراري 80مم (+ « - نقطة البيع») |
| dining: Bunood Dining Kitchen Ticket | تذكرة المطبخ - حراري 80مم |

New POS Invoice twins of the three kit formats carry « - نقطة البيع». Dining's «فاتورة المطعم
المبسطة (حراري 80مم)» (+ twin) and «تذاكر المطبخ» carry no brand and keep their names. The dining
pre-bill is «الحساب», not «فاتورة مبدئية» (the addendum: a pre-bill is not an invoice).

Rename when the new name is free, merge when it exists (links move, the old record goes).
`Print Style` is linked only from a Single, where Frappe 16.36's `rename_doc` builds `IN ()` in
`update_user_settings` and fails (the first lab migrate stopped there and rolled back cleanly); it
is renamed by hand (Print Settings pointer + row). The installer creates only the new names;
`LEGACY_FORMAT_NAMES` is gone; `zatca.FORMATS` is empty. `printing/renames.py` (a
`before_request` hook) reads an old `format`/`print_format` on `/printview` and `download_pdf`
as its new name when the old record is gone.

**Verified on the lab** (team-rc.localhost, `bench migrate`): 12 formats moved (2 merged), the
style and the letter head; dining's pre-bill renamed; 19 managed formats afterwards, no twin; the
Sales Invoice / Quotation / Payment Entry default print formats followed (`after_rename`); the POS
Profile's receipt link followed; Print Settings' style and the default letter head followed. Old
names over HTTP: `/printview` with «بونود - فاتورة مبسطة (حراري 80مم)», «زاتكا - …» and "Bunood
Sales Invoice (A4)" → 200 with the kit; `download_pdf` with the old receipt name → 200
`application/pdf`.

## Phase 2

The kit takes the QR from `bunood_zatca_qr_src`: a stored artefact first (an image field, then
ksa_compliance's «Sales Invoice Additional Fields» `qr_image_src` — the cleared/reported QR), the
Phase-1 QR computed at print time only when none exists (Phase 1 and 2 are never both Active). So
the new formats are valid for a Phase-2 invoice. `zatca/delivery.py`'s `before_print` is still not
registered (as instructed). `CUSTOMER_FORMATS` now names the kit's A4 and its POS twin.

## Tests and gates (lab container `bunood-print-lab`, Python 3.14, Node 24)

- `python -m unittest discover -s tests -p <file>`: test_print_kit 20 (new; a sabotage moving the
  QR cell failed 2 of them, restored green), test_print_format_names 6 (new: mapping, rename,
  merge, Print Style, idempotent second run, the old-link hook), test_print_engine 15,
  test_letterhead 9 (rewritten), test_zatca_delivery 9, test_invoice_delivery 11,
  test_print_qr_rule 5, test_print_thermal_logo 4, test_print_thermal_service 5,
  test_zerone_brand 9, test_print_logo_fixture 7, test_print_preview 6, test_riyal_sign 3,
  test_amount_words 5, test_custom_fields 3 — all OK.
- Failing before this branch, untouched by it: `test_zatca.test_the_module_is_read_only`
  (counts whitelists in `zatca/status.py`) and `test_print_qr.test_private_brand_image_…` (its
  fake File has no `check_permission`).
- `node --test` sales_bill, invoice_a4_qr, print_seal, print_language: 123/123; the interface
  suite (`npm run interface:test` list): 308/308.
- `node build.mjs`: green (all guards, thermal page-size guard reading the family template,
  coverage, plural guard); `node tools/payload.mjs --check`: within budget (desk JS 8 bytes
  free; only `bunood.*.js` and `assets.py` changed).
- `node tools/i18n_po.mjs emit` → 3,876 rows; `node tools/i18n.mjs check` → coverage complete.
- Dining: `python -m unittest bunood_dining.tests.test_print_format_names` 3/3 (new).
- Business: `scripts/check_translations.py` → 2035/2035, none unused; the Vue SFC compiles with
  `@vue/compiler-sfc`; `save_company` exercised on the lab (rolled back): the banned wording is
  refused, the eight fields round-trip, the policy keeps its lines.
- `tests/smoke.mjs` and the regression tools carry the new names but were not run (they need the
  deployed stack).

## Images (`scratchpad/brand/print-shots/`, PDFs from the formats' own engine → PNG)

`01-tax-invoice-a4.png`, `02-simplified-tax-invoice-a4.png`, `03-simplified-receipt-80mm.png`,
`04-credit-note-a4.png`, `05-tax-invoice-a4-three-pages-p1/p2/p3.png` (34 lines: repeated
header, table head and foot, page numbers, totals + QR together), `06-simplified-a4-draft.png`
(watermark, no QR), `07-tax-invoice-a4-english-print.png` (an English print keeps the header and
the totals/QR placement). The PDFs sit beside them. Data: a fictional company «مؤسسة الواحة
الحديثة للتجارة» on team-rc (demo logo, address, bank, ZATCA Phase 1 Active for the QR), created
through the normal controllers.

## The acceptance script (`erp-pin-business/scripts/official_native_acceptance.py:465-476`, not edited)

- `('Sales Invoice', 'sales_invoice', 'Bunood Sales Invoice (A4)')` → `'فاتورة ضريبية - A4'`.
- `('Purchase Invoice', 'purchase_invoice', 'Bunood Purchase Invoice (A4)')` → `'فاتورة مشتريات - A4'`.
- `style='Bunood'` (twice) → `style='النمط الرسمي'`.
- `assert '.bnd-invoice' in html and '.bnd-inv-title' in html` — still true for the Purchase
  Invoice (its template is redesigned in Stage 2); for the Sales Invoice use
  `'class="zo zo-a4' in html and 'zo-title' in html`.

## Not in this stage

- Engineering's five formats ("Bunood Engineering Contract / Document / Quotation / Receipt /
  Transmittal") and its per-company letter heads "<company> — Bunood": the next wave.
- `pos.py:451` falls back to the stock "POS Invoice" format when a profile names none; left as is
  (rule 5: no new defaults).
- Reprint «نسخة مكررة»: no print path in Frappe knows a reprint (no print count), so it is not
  printed.
- Out of scope: PDF/A-3 with embedded XML, ESC/POS raster, the cheque layout, petty cash.

## Stage 2

The 58 mm receipt and the B2B thermal (switches on the receipt family), the dot-matrix layout,
the POS twins' checks, quotation, sales order, delivery note (not-an-invoice rule), purchase
invoice and its return title, purchase order, receipt and payment vouchers (A5 landscape main,
A4 second), journal voucher, statement of account (the report template, aging strip), the
report `print_grid` header if it can be overridden cleanly, stock transfer, purchase receipt,
the shift report, dining's pre-bill «الحساب», kitchen ticket and restaurant invoice in the
receipt language — each rendered.
