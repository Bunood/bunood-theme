# The print redesign — report (Stages 1-3)

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
  (rule 5: no new defaults). Superseded in Stage 2 at the lead's word: `receipt_format()`.
- Reprint «نسخة مكررة»: no print path in Frappe knows a reprint (no print count), so it is not
  printed.
- Out of scope: PDF/A-3 with embedded XML, ESC/POS raster, the cheque layout, petty cash.

## Stage 2 (2026-10-15)

The lead's answers, applied: figures stay aligned on their right edge; the simplified invoice's
line totals include VAT; the estimated receipt height stands; a site that chose Frappe's own
letter head is left alone; a POS Profile that names no format falls back to the kit's receipt.

### Commits

| Repo | Commit | Subject |
| --- | --- | --- |
| theme | `d8fc30d` | feat(print): Stage 2 — every remaining document in the kit |
| theme | `40c6a4c` | feat(print): the statement of account in the kit, printed on Chromium |
| theme | `81ef34c` | feat(pos): a counter that names no print format prints the kit's receipt |
| theme | `85f88c2` | test(print): Stage 2 — the families, the receipt columns, the fallback, the statement |
| theme | `8ae3066` | fix(print): the statement's aging counts an unapplied credit note |
| dining | `103ece1` | feat(print): the restaurant's prints in the kit's receipt language, on Chromium |
| dining | `9aa3bdf` | test(print): the restaurant's prints in their new layout |

The tests that follow the new layouts landed in `85f88c2`: at `d8fc30d` alone the engine test
still reads the old ones. Each repo is green at its head.

### What was built

- **One page for every A4/A5 family.** kit.html's `page` macro (the stylesheet, the repeated
  head and foot, the page numbers, the watermark, the policy); the sales invoice calls it too.
  Party boxes take their cells from `profile.cells` / `party_profile` (customer or supplier).
- **The trade family** (`trade_a4.html`, `printing/documents.py`): «عرض سعر - A4», «أمر بيع -
  A4», «فاتورة مبدئية - A4» (with «ليست فاتورة ضريبية — Not a tax invoice»), «سند تسليم - A4»
  (ordered / delivered / batch, received-by and date), «فاتورة مشتريات - A4» and its return
  («مرتجع مشتريات | Purchase Return» with the original, its date and the reason), «أمر شراء -
  A4», «إذن استلام - A4» (PO, ordered / received / accepted, warehouse), «تحويل مخزني - A4»
  (titled «صرف مخزني» / «استلام مخزني» by purpose; remarks under the table). No QR on any of
  them; only the purchase invoice shows paid / due.
- **Vouchers.** «سند قبض وصرف - A5» is A5 landscape and the main one (the amount box, received
  from / paid to, the sum in words, «وذلك عن», الفاتورة | التاريخ | المبلغ | المسدد, المستلم /
  المحاسب / المعتمد with the stamp); «سند قبض وصرف - A4» stays. Chromium ignores the landscape
  flag once a paper size is given, so the page is declared 210 × 148 mm. «سند قيد - A4»: الحساب |
  الطرف | مركز التكلفة | البيان | مدين | دائن, totals, words.
- **Thermal.** «… - حراري 58مم» (الصنف | الكمية | الإجمالي, the unit price under the name, QR 30
  mm), the B2B «فاتورة ضريبية - حراري 80مم», «إيصال هدية - حراري 80مم» (no prices, no QR),
  «تقرير الوردية - حراري 80مم» (POS Closing Entry: invoices, sales, returns, discounts, net, VAT,
  tenders expected / counted, the difference in the band when short). Every receipt figure
  column has its own width (80 mm: 35/18/22/25 %; 58 mm: 50/22/28 %), header and figures on
  one right edge — «الكمية» and «السعر» no longer touch. «C.R.» keeps its stops (an isolated
  label). POS twins for the 58 mm, B2B and gift receipts.
- **«فاتورة - طابعة نقطية»**: monospace, totals on the physical right, no QR — a dot-matrix
  head prints characters, not pictures; the foot says the electronic copy carries the QR.
- **Statement «كشف حساب - A4»** (General Ledger report format): the template asks
  `printing.statement.context` once for the page, the party box, the aging (current, 1-30,
  31-60, 61-90, 90+; credits in brackets) and printed at / by; التاريخ | النوع | الرقم | البيان |
  مدين | دائن | الرصيد with the opening row, totals and closing balance, credit balances in
  brackets. `report_to_pdf` sends a page with the statement's marker to Chromium; every other
  report keeps wkhtmltopdf.
- **POS fallback.** `pos.receipt_format()`: a profile without a format prints «فاتورة ضريبية
  مبسطة - حراري 80مم» (« - نقطة البيع» for a POS Invoice), for the counter and the shared link.
- **Dining** (all on Chromium; the kit's stylesheet plus a few restaurant pieces): the kitchen
  ticket (station and time sent, the state band «جديد» / «تعديل» / «ملغي», the order number —
  or the table — LARGE, the order type, server and guests, «2 × name» bold, choices signed − /
  +, notes in an inverted band, the allergy box, no prices or QR); «الحساب» (not an invoice,
  no number, no QR, the total in the band); the restaurant invoice in the receipt language
  (seller's names, VAT, CR; four figure columns; the deposit box; QR 35 mm; address, contacts,
  policy). It needs the theme's kit in the same release (it imports `kit.html`).

### Decisions and notes

- **`print_grid` (every other report's header) is not overridden.** It is Frappe's client
  template; replacing it means a desk bundle, and the desk JS has 8 bytes of budget left. The
  statement shows the kit on a report without touching it.
- **Reprints** are still unmarked: neither the receipt nor the kitchen ticket's print path
  knows it is printing again.
- **The lab tenant's brand turned blue mid-session** (another builder's palette work on the
  shared team-rc): the prints take the tenant's brand through tokens, so 08-32 show the blue,
  01-07 the earlier green. Nothing is hard-coded.
- The statement image comes from Frappe's own microtemplate compiler (Node, `microtemplate.js`
  as shipped) with the desk's two calls answered from the lab, then the real `report_to_pdf`.
  In the desk «Sales Invoice» in the type column is translated; the harness has no `__()`.
- Dining lab data reuses the dining print suite's world (company «_DIN Native», given a
  restaurant profile). The suite then needed its own VAT account, template and menu rows back;
  those lab copies are renamed «_LAB …», and the suite is 10/10 on the site.

### Tests and gates (lab `bunood-print-lab`, site team-rc.localhost)

- `python -m unittest discover -s tests -p <file>`:
  - test_print_stage2: 15, new. A sabotage (the old 14 % quantity column; a QR on the trade
    family) failed 6; restored green.
  - Also green: test_print_kit 20, test_print_engine 15 (updated), test_print_format_names 6,
    test_letterhead 9, test_print_thermal_service 5, test_print_thermal_logo 4,
    test_print_qr_rule 5, test_riyal_sign 3, test_print_preview 6, test_zerone_brand 9,
    test_print_logo_fixture 7, test_amount_words 5, test_custom_fields 3, test_zatca_delivery 9,
    test_invoice_delivery 11.
- `node --test` sales_bill, invoice_a4_qr, print_seal (updated), print_language: 123/123.
- `node build.mjs`: green. The thermal guard now reads the 58 mm roll, and a format without a
  width gets 80.
- `tools/payload.mjs --check`: within budget, desk JS still 8 bytes free.
- `i18n_po.mjs emit`: 3,876 rows. `i18n.mjs check`: coverage complete.
- Dining:
  - `bench --site team-rc.localhost run-tests --module bunood_dining.tests.test_prints`: 10/10.
  - `test_print_format_names`: 3/3.

### Images (08-32, `scratchpad/brand/print-shots/`, PDFs beside them)

08 quotation · 09 sales order · 10 proforma · 11 delivery note · 12 purchase invoice (15 % VAT)
· 13 purchase return · 14 purchase order · 15 goods receipt · 16 stock transfer · 17/18 receipt /
payment voucher A5 landscape · 19 receipt voucher A4 · 20 journal voucher · 21 58 mm · 22 B2B
80 mm · 23 gift receipt · 24 dot-matrix · 25 shift report · 26 80 mm with the new columns · 27-29
kitchen ticket new / change / cancelled · 30 «الحساب» · 31 restaurant invoice · 32 statement.
All single pages; «تذاكر المطبخ» printed two tickets on two pages.

### The acceptance script, updated for Stage 2

The Purchase Invoice is now the kit's too: its `.bnd-invoice` / `.bnd-inv-title` assertion
becomes `'class="zo zo-a4' in html and 'zo-title' in html`, as for the Sales Invoice.

### Still not done

- Engineering's five formats and its per-company letter heads: the next wave.
- Out of scope: PDF/A-3 with embedded XML, ESC/POS raster, the cheque layout, petty cash.

## Fix pass and Stage 3 (2026-10-15)

The lead's defaults for the owner, applied: the statement's names and «البيان», short 58 mm totals,
reprints marked, a supplier's aging; the proforma keeps the order's number.

### Commits

| Repo | Commit | Subject |
| --- | --- | --- |
| theme | `70f4ddc` | fix(print): the statement names each line in Arabic and says what it was; a supplier's aging |
| theme | `0b7922a` | feat(print): a reprinted invoice says «نسخة مكررة — Copy»; short totals on the 58 mm roll |
| theme | `3b60f21` | test(print): the statement's names and notes, a supplier's aging, reprints, the 58 mm labels |
| theme | `0ebe7ba` | feat(print): the kit's page can leave its watermark to the document |
| dining | `6d57ead` | feat(print): a reprinted kitchen ticket says «إعادة طباعة»; the restaurant invoice «نسخة مكررة» |
| dining | `ee76702` | test(print): a kitchen reprint; the floor's batch tests read the new state band |
| engineering | `e1c2c25` | feat(print): the office's five documents without the product's name, inside the platform print kit's page |
| engineering | `883eaec` | test(print): the office's documents under their new names and inside the kit's page |

### The fixes

- **Statement.** «النوع» names each line's document as the business app does, by kind: «فاتورة
  مبيعات», «إشعار دائن», «إشعار مدين», «فاتورة مشتريات», «مرتجع مشتريات», «سند قبض» / «سند صرف»
  / «تحويل داخلي», «سند قيد». An English print gets English names.
  - «البيان» is the GL remark (its first line, up to 120 characters). Where ERPNext wrote "No
    Remarks", it shows the settled document's name and number, with the number kept on one line.
  - A supplier gets the aging strip too, over its purchase invoices.
  - An unapplied credit note now counts in its bucket, in brackets, so the strip adds up to the
    closing balance.
  - The template sends its lines in one POST.
- **58 mm.** The totals read «قبل الضريبة», «الضريبة 15%», «الإجمالي», «المدفوع», «الباقي», with
  no English, and no label wraps.
- **Reprints.**
  - *The counter.* Frappe keeps no print count: its Access Log is a deferred insert, so a reprint
    a minute later would not see the first print. So I added a counter:
    - `bnd_print_count`, a hidden, read-only, no-copy custom field on Sales Invoice and POS
      Invoice;
    - `print_count` on the Dining Kitchen Ticket doctype.
  - *What counts.* `/printview` with `trigger_print`, `download_pdf`, the bulk PDFs and
    `print_by_server`; the count is committed even on a GET.
  - *What does not count.* A preview, an e-mailed PDF and the customer's shared link count nothing
    and show what the next print would be.
  - *The marks.* The first print is the original; a draft is never marked. The receipt, the A4
    invoice, the dot-matrix and the restaurant invoice print «نسخة مكررة — Copy» with the print
    time. A gift receipt is never marked.
  - *Kitchen tickets* print «إعادة طباعة» with the time, in a dashed box under the state band. In
    «تذاكر المطبخ», the Dining Order's `before_print` counts every ticket of the job.
  - *Proved over HTTP on the lab:*
    - receipt: 1st print plain, 2nd print copy;
    - preview: copy, with the count unchanged;
    - `download_pdf`: the count +1;
    - ticket: 1st print plain, 2nd print «إعادة طباعة»;
    - batch: «إعادة طباعة» only on the reprinted ticket;
    - restaurant invoice: 1st print plain, 2nd print copy.

### Stage 3 — Engineering

- **Names (no brand).**

  | Old name | New name |
  | --- | --- |
  | Bunood Engineering Quotation | «عرض سعر هندسي - A4» |
  | Bunood Engineering Contract | «عقد هندسي - A4» |
  | Bunood Engineering Document | «مستند هندسي صادر - A4» |
  | Bunood Engineering Receipt | «سند قبض هندسي - A4» |
  | Bunood Engineering Transmittal | «خطاب إحالة - A4» |
  | «{company} — Bunood» (letter heads) | «{company} — الترويسة» |

  - The names live in one module, `pure/print_names`; every caller reads it.
  - The standard records moved to their scrubbed folders.
  - Patch `v0_18.print_format_names` runs *before* the model sync. It renames the records and merges
    when both names exist, and every Link follows.
- **The kit's page around the approved bodies** (`engine/print_kit`, Jinja `bnd_kit`):
  - the bilingual header (AR right, logo centre, EN left, CR and VAT), the address-and-contacts
    footer with the policy, and the page number at the top;
  - Cairo and the riyal sign.
  - The office's own facts (CR, address, English name) fill what the company's print profile leaves
    empty.
  - The quotation and contract keep their title block beside their heading. The receipt,
    transmittal and issued document keep their bodies. None of them shows a watermark
    (`marked=False`).
  - All five print through Chromium.
  - Without the theme, each prints its own masthead and footer as before.
- **Colour.** The default «Green» now means the house colour: the tenant's brand colour, swatched on
  the settings board as «لون الهوية». Navy and Gold print as chosen. The transmittal's green party
  heading takes the brand colour too.
- **Found and fixed on the way.**
  - The shipped quotation printed «عرض سعر � …» (a U+FFFD) in its page-2 running header.
  - The seeded letter heads print mojibake Arabic labels on this lab. They no longer print under
    the kit.
- **Images.** 33 quotation (2 pages), 34 contract (3 pages), 35 issued document, 36 receipt and
  37 transmittal, for «مكتب المدار للاستشارات الهندسية», a demo office created through the app's own
  flows on team-rc. The fix pass adds:
  - 02b and 26b: copies;
  - 27b: a kitchen reprint;
  - 21: 58 mm with short labels;
  - 32 and 32b: customer and supplier statements.

### The lab is shared

team-rc.localhost and its redis are shared by every builder's lab container, and Frappe keeps
`app_hooks` in that redis. When a `clear-cache` runs, the next process to read the hooks stores its
own container's version for every lab. A lab whose worktree lacks a function that the cached hooks
name then fails to render (for example Stage 2's Jinja methods, or this pass's `before_print` and
`bnd_kit`). The lab scripts now read their own hooks without writing them (`ZO_LOCAL_HOOKS=1`).

Engineering was brought to the worktree's schema on team-rc by an engineering-only sync (its
doctypes, fixtures and pending patches, nothing of any other app), from a new container
`bunood-print-eng` that mounts `eng-zerone`.

### Tests and gates (this pass)

- Theme: `python -m unittest discover -s tests -p <file>`: test_print_stage2 21, test_print_engine 16,
  test_print_kit 20 and the Stage-1 print files green; `node --test` (4 files) 123/123; `node build.mjs`,
  `tools/payload.mjs --check`, `i18n_po.mjs emit` / `i18n.mjs check` green. A sabotage counting every
  /printview as a print failed the reprint test; restored green.
- Dining: `bench --site team-rc.localhost run-tests --module bunood_dining.tests.test_prints` 11/11;
  `test_floor` («تذاكر المطبخ», 2 tests) 2/2; `test_print_format_names` 3/3.
- Engineering: `ruff check` (one finding, SIM108 in `tests/pure/test_desk_navigation.py`, predates this
  branch), `ruff format --check`, `mypy`, the eleven `scripts/checks` gates and `release.py check` green;
  the pure print tests 61 pass by direct call (no pytest on this host or in the lab env, so
  `tests/gates` did not run). Site, on team-rc: test_print_kit 4/4, test_payment_receipt 10/10,
  test_transmittals 7/7, test_issued_documents 5/5. Failing for the lab, not for this change:
  test_print_redesign's rounding case (team-rc does not round totals), test_architecture_isolation's
  required_apps (dining requires the theme on this site), and wkhtmltopdf runs in test_print_branding (9)
  and test_contract_letter_head (1), which reach the site on port 80, where nothing listens in the lab;
  test_print_branding's two themeless-site assertions need a site without the theme (and the English
  quotation's body there quotes the office's seeded Arabic template).
