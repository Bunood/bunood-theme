# Bunood Production MVP — Authoritative Agent Handoff

**Updated:** 2026-09-20  
**Audience:** the agent finishing the Bunood production MVP  
**Repository:** `C:\Users\abdul\Documents\Codex\2026-09-05\loc-2\work\baseline-20260909\theme`  
**Branch:** `production/theme-v0.46.7`  
**Recorded HEAD:** `18209bd`  
**Release candidate:** `http://127.0.0.1:8088`  
**Frappe site:** `rc20.localhost`  
**Bunood version:** `0.46.32`

## 1. Mission

Ship a sellable Bunood MVP as quickly as possible without replacing or weakening
ERPNext's business engine.

The launch scope is deliberately narrow:

1. A consistent, modern ERP shell and navigation model.
2. A fast, understandable quotation-to-invoice-to-payment workflow.
3. Professional Arabic and English customer documents on A4 and 80 mm paper.
4. Actionable dashboards and lists that take the user directly to work.
5. A verified release candidate with reproducible evidence.

Core accounting, tax, stock, permissions, validation, naming, mapping, submit,
cancel, and payment logic must remain native ERPNext behavior.

## 2. Current production decision

**The build is close, but it is not yet approved for production.**

The owner-authorized persistent Quotation → Sales Order → Sales Invoice → Payment
Entry acceptance now passes with a paid invoice and zero outstanding. The one
software defect it exposed—mapped invoices falling back to Advanced-only UI—was
fixed in `0.46.32`, deployed, migration-registered, regression-tested, and live-
verified in both modes. Production approval still requires confirmed owner/legal
data, physical A4 and thermal printing, real QR scanning, and release consolidation.

The remaining physical acceptance is:

1. Print one real A4 invoice.
2. Print one real 80 mm invoice.
3. Scan every required QR code from paper.
4. Compare browser preview, PDF, and paper for the same source document.

Physical print and QR-scan results must never be claimed without the actual printer
and scanner/phone test.

## 3. Status at a glance

| Work package | Status | Production meaning |
| --- | --- | --- |
| Standard top bar and sidebar | Implemented and live-verified, including the 700 px native drawer | Preserve; fix only a proven regression |
| Dashboard work queues and list presets | Complete and live-verified | Do not rebuild |
| Invoice workbench | Software acceptance complete in English and Arabic at desktop, tablet, and phone widths | Preserve; the separate financial transaction remains |
| Shared document states and actions | Complete and live-verified | Do not rebuild |
| Quotation, invoice, thermal, and receipt PDFs | Real PDFs generated and automatically + visually verified | Software PDF blocker cleared for these formats |
| Customer Statement | Complete; live English/Arabic General Ledger data and PDFs verified | Preserve; rerun only after print/report changes |
| Arabic/English responsive release sweep | Complete for the MVP scope; live navigation, list, form, invoice, and interaction gates passed | Preserve |
| Rollback-safe native financial rehearsal | Passed on 2026-09-20 | Native Quotation mapper, four-line invoice, full Payment Entry allocation, zero outstanding, and clean rollback proved |
| Fresh persistent financial acceptance transaction | Passed on 2026-09-20 | `SAL-QTN-2026-00003` → `SAL-ORD-2026-00005` → `ACC-SINV-2026-00013` → `ACC-PAY-2026-00003`; Cash `235.75`; outstanding `0.00` |
| Mapped Sales Invoice Simple/Advanced acceptance | Passed on 2026-09-20 | Both modes render the same submitted invoice after the `0.46.32` gate fix |
| Physical A4/thermal/QR acceptance | Not done | Requires hardware |
| Final release receipt | Not done | Create after all gates pass |

## 4. Work that is complete and must be preserved

### 4.1 Standard ERP presentation

- One canonical top bar and one standardized sidebar are the product shell.
- Home, sales, real-estate, list, and form routes must not add duplicate navigation,
  branding, or route-specific shells.
- Arabic and English use the same navigation, functionality, and source of truth.
- Sidebar expansion/collapse and arrow direction are logical for the active language.
- The home page must not bring back the removed second navigation row.

Do not start another shell redesign. Only fix a defect reproduced on the release
candidate.

### 4.2 Dashboard and list behavior

The Home queues and the Sales Invoice and Quotation presets are complete.

Verified behavior includes:

- Home open quotations opens the correct native filtered Quotation list.
- Home overdue receivables opens the correct native filtered Sales Invoice list.
- Sales Invoice status presets use visible native filters.
- Quotation presets use visible native filters.
- **All** clears the preset and restores the ordinary list.
- Arabic and English expose the same behavior.
- The tested actions did not open the generic Home dashboard or the wrong workspace.
- No new browser console errors were recorded during the live preset acceptance.

Do not create a second list UI or copy records into a Bunood data store.

### 4.3 Invoice creation page

The current workbench already provides:

- Simple and Advanced modes over the same native ERPNext document.
- Direct first-line editing.
- Native Item link and Item Quick Entry behavior.
- Keyboard movement through the line editor.
- Automatic same-item quantity consolidation and an always-ready blank row.
- Native subtotal, tax, discount, rounding, grand total, paid, and outstanding values.
- A desktop editor plus customer/preview context rail.
- A labelled responsive context drawer below 960 px.
- One state-aware primary action and an overflow for secondary actions.
- Native Quotation-to-Sales-Invoice mapping.
- Native post-submit Sales Invoice-to-Payment Entry mapping.
- A draft summary that is explicitly not presented as an exact PDF preview.

Do not replace these with client-only calculations, copied documents, or a custom
payment ledger.

### 4.4 Shared document states and actions

`bunood_theme/public/js/document_actions.js` is the shared contract.

- Sales Invoice uses the native status and shows **Record payment** when permitted.
- Quotation uses the native status and shows **Create Sales Invoice** when permitted.
- Submitted Payment Entry shows **Print** as the primary action.
- Secondary actions remain in the shared overflow.
- Submitted documents must not expose draft-only deletion or editing.

Modify this contract only when a failing test or reproduced live defect proves a
problem.

### 4.5 Customer document family completed in this pass

The following managed outputs now share the Bunood hierarchy and obey the current
print language:

1. Quotation A4.
2. Payment receipt A4.
3. Tax Sales Invoice A4.
4. Simplified Sales Invoice A4.
5. Tax Sales Invoice thermal 80 mm.
6. Simplified Sales Invoice thermal 80 mm.

Key fixes already implemented:

- Print titles and static labels follow the selected print language instead of
  mixing Arabic and English.
- Arabic documents declare RTL direction; English documents declare LTR.
- Metadata, party blocks, item headings, totals, signatures, and thermal labels are
  language-aware.
- Numeric and totals columns mirror correctly between RTL and LTR.
- ZATCA simplified-invoice QR images now resolve from the upstream
  `qr_image_src` property.
- Private Frappe logo files are embedded as PDF-safe data URLs.
- A missing or inaccessible image no longer produces a broken placeholder.
- The old default `Both` title setting is migrated to `Follow print language`.
- The Customer Statement template is now one JavaScript microtemplate rather than
  mixed Jinja and JavaScript rendering.

Primary implementation files:

- `bunood_theme/templates/bunood_print_macros.html`
- `bunood_theme/printing/jinja.py`
- `bunood_theme/printing/formats/quotation_a4.html`
- `bunood_theme/printing/formats/payment_entry_voucher.html`
- `bunood_theme/printing/formats/sales_invoice_tax_a4.html`
- `bunood_theme/printing/formats/sales_invoice_simplified_a4.html`
- `bunood_theme/printing/formats/sales_invoice_tax_thermal.html`
- `bunood_theme/printing/formats/sales_invoice_simplified_thermal.html`
- `bunood_theme/printing/formats/customer_statement.html`
- `bunood_theme/letterhead/bunood_letterhead_header.html`
- `bunood_theme/public/scss/print/print.scss`
- `bunood_theme/patches/v0_46_10/follow_print_language.py`
- `tools/commercial-document-pdf-regression.mjs`
- `tools/customer-statement-pdf-regression.mjs`
- `tools/verify_commercial_document_pdfs.py`
- `tools/verify_customer_statement_pdfs.py`
- `tests/test_print_qr.py`

## 5. Verified PDF evidence

The real-PDF regression generated twelve PDFs: six output types in English and
Arabic. The source records were asserted unchanged.

Artifacts are under `artifacts/commercial-document-pdfs-20260919/`, including:

- `quotation-a4-{en,ar}.pdf`
- `payment-receipt-a4-{en,ar}.pdf`
- `tax-invoice-a4-{en,ar}.pdf`
- `simplified-invoice-a4-{en,ar}.pdf`
- `tax-invoice-thermal-{en,ar}.pdf`
- `simplified-invoice-thermal-{en,ar}.pdf`
- `commercial-document-verification.json`

Automated PDF acceptance passed all twelve cases:

- Correct `lang` and `dir` attributes.
- One static-label language per output.
- Required simplified-invoice QR image present.
- No QR-missing warning printed.
- Source document identity present.
- A4 dimensions approximately `595.92 × 844.08 pt`.
- Thermal dimensions approximately `227.04 × 841.92 pt`.
- One page for each selected source sample.
- No extracted text outside the page bounds.

Visual review also passed the representative English/Arabic quotation, receipt,
simplified A4, and simplified thermal pages. The logo renders, the QR codes are
visible, direction is correct, and no clipping or overlap was seen.

An older long-form invoice regression remains available under
`artifacts/invoice-pdfs-20260919`. It passed ten cases, including five-page samples,
discount/tax cases, returns, mirrored columns, fonts, Riyal glyphs, repeated table
headers/footers, and source non-mutation.

The Customer Statement also passed the live General Ledger workflow in English and
Arabic using six real report rows: opening, invoice, payment, credit note, total,
and closing balance. Its two generated A4 PDFs are one page each, use the correct
LTR/RTL direction, contain the source voucher identities, keep all text inside the
page bounds, and contain no mixed static-label language or quoted summary labels.
The actual PDF pages were rendered to images and visually inspected with no clipping
or overlap. Evidence is under `artifacts/customer-statement-pdfs-20260919/`, including
the English/Arabic HTML, PDF, PNG, live-result JSON, rendered PDF pages, and
`customer-statement-verification.json`.

## 6. Important configuration findings

These are site-data decisions, not code defects. Do not guess or silently replace
them.

1. The configured Company logo currently resolves and prints, but the source file
   visually looks like a dark application screenshot rather than a clean production
   brand mark. Replace it with the owner's approved logo before customer delivery.
2. The PDF footer contains placeholder-looking phone/email data. Replace it only
   with the owner's verified business contact information.
3. Confirm the legal company name, VAT number, address, bank/payment instructions,
   and ZATCA environment before launch.
4. Phase 2 ZATCA settings are active. The Phase 1 settings record is disabled. Do
   not change that configuration without an explicit compliance decision.

These content items are customer-visible and therefore launch blockers if the
values are inaccurate, even though the rendering code works.

## 7. Exact next actions

Work in this order. Do not start post-launch enhancements before the launch gate.

### Step 1 — Customer Statement acceptance — complete

**Goal:** prove that `بنود - كشف حساب عميل` works through the actual General Ledger
report workflow.

Procedure:

1. Open General Ledger on `rc20.localhost`.
2. Apply the Customer party type and a real test customer.
3. Set a bounded date range with at least an opening balance, transaction, and
   closing balance when test data permits.
4. Select the Bunood Customer Statement print format.
5. Render/download in English, then Arabic.
6. Verify one-language labels, correct direction, customer identity, dates, debit,
   credit, running balance, opening balance, closing balance, and page flow.
7. Confirm no source report or accounting records are mutated.
8. Add a reproducible artifact/test if a defect is found.

Definition of done:

- English is fully LTR and Arabic is fully RTL.
- Values come from the General Ledger result; no duplicated ledger is introduced.
- Debit, credit, and balance columns remain aligned.
- Multipage output repeats the table header and does not orphan final totals.
- No clipping, overlap, or mixed static-label language appears.

Result on 2026-09-19: passed in English and Arabic against live General Ledger data.
The automated verifier and visual review of the actual PDF renders both passed.

### Step 2 — Invoice-page launch acceptance — complete

**Goal:** prove the current workbench before modifying it.

Test in English and Arabic at wide desktop, medium/tablet, and mobile widths:

1. Start a fresh Sales Invoice in Simple mode.
2. Select a customer.
3. Confirm posting date, due date/payment terms, customer reference when available,
   preferred payment method, and invoice lines are reachable.
4. Add three normal items with the keyboard.
5. Duplicate one line and use a long description.
6. Confirm totals match the native Advanced form.
7. Switch Simple → Advanced → Simple and confirm unsaved values remain.
8. Scroll the long invoice and confirm Save/Submit remains reachable.
9. Confirm mobile uses an intentional reduced-column/card treatment with no page
   horizontal overflow.
10. Confirm only one state-appropriate primary action is visible.

Change code only if a criterion fails.

Result on 2026-09-19: passed against the deployed release candidate in English and
Arabic without saving or submitting a record. The acceptance used a fresh Sales
Invoice, customer `Bunood Portal Fixture`, a preferred payment method, three real
items, and one duplicated item. The four populated lines survived
Simple → Advanced → Simple with native VAT `48.75`, rounding `0.25`, total
`374.00`, and outstanding `374.00` unchanged.

The run reproduced and fixed one launch defect: the always-ready blank item row
displayed quantity `0.00`, and the Simple-mode flush treated that untouched display
value as an edit. This blocked the switch to Advanced mode. `sales_bill.js` now
ignores an untouched blank child row while still passing real user input through
native validation. A dynamic regression proves that an untouched blank row is
ignored and a user-entered zero quantity is still rejected.

Responsive evidence:

- Wide desktop: Save remained reachable, the context rail behaved correctly, all
  four populated lines remained intact, and no validation error appeared.
- `1024 × 800`: Save remained reachable and the context rail stayed closed. The
  off-canvas rail contributes a measured 32 px scroll width at this breakpoint;
  no invoice content or action was clipped.
- `390 × 844`: English and Arabic had zero document/body horizontal overflow,
  four collapsed item cards plus the ready row, a visible sticky Save action, and a
  visible mobile total. No invalid control or alert appeared.
- The exact Arabic reproduction switched to native Advanced mode with all four
  lines and native totals present, then returned to Simple mode without loss.

### Step 3 — Run the fresh financial transaction

This step mutates accounting records. Obtain explicit user confirmation immediately
before doing it.

1. Create a fresh Quotation with at least two lines, discount, and tax.
2. Save and submit it.
3. Use the native mapped action to create a Sales Invoice.
4. Add a third line and duplicate one line.
5. Confirm subtotal, discount, VAT, total, paid, and outstanding.
6. Open the managed A4 preview.
7. Submit the Sales Invoice.
8. Use the native mapping to create a full or partial Payment Entry.
9. Submit the Payment Entry.
10. Verify the Sales Invoice outstanding amount reconciles exactly.
11. Print the Payment Entry receipt.
12. Confirm the same native records and state in Advanced mode.

Do not create Bunood-only invoice or payment records.

Software rehearsal on 2026-09-20: passed with
`bunood_theme.verification.quote_to_cash_matrix.run`. The native flow submitted a
two-line Quotation with document discount `23.00`, VAT `39.00`, and total `299.00`;
used ERPNext's own mapper; retained the two mapped lines and added two more invoice
lines; submitted a Sales Invoice with VAT `52.50` and total `402.50`; used the
native Payment Entry mapper to allocate `402.50`; and reconciled invoice outstanding
to `0.00`. Quotation, Sales Invoice, Payment Entry, and GL Entry counts were identical
before and after the unconditional rollback. This proves the software path but does
not replace the owner-authorized persistent transaction, UI/A4 review, or receipt print.

### Step 4 — Bilingual responsive release sweep — complete

Check only the launch scope:

- Standardized top bar and sidebar.
- Home and Selling entry.
- Quotation, Sales Invoice, and Payment Entry lists and forms.
- Invoice workbench.
- Dashboard queues and list presets.
- Customer-facing PDF/print outputs.

For English and Arabic, verify:

- Same operations and permission behavior.
- Logical arrow, menu, sidebar, numeric, and action placement.
- No duplicated or hidden navigation.
- No clipped or unreachable controls.
- No route hijack by the real-estate workspace.
- No new Bunood console errors.

Result on 2026-09-19: passed for the active MVP scope.

- Live navigation passed at `1440 × 900`, `1024 × 800`, and `430 × 900` in
  English and Arabic. The standardized sidebar cycles Open → Hidden → Open,
  retains one top-bar owner, mirrors its arrow in RTL, persists per user, and
  exposes four equal mobile navigation cells with uniform icons.
- All Apps retains one Home action; ordinary Selling and Real Estate users land on
  their correct role homes and do not receive technical workspaces.
- Dense lists passed Customer, Supplier, Item, Sales Invoice, Purchase Invoice,
  Lease, and Property at desktop and phone widths. Native filters, paging, focus,
  document IDs, zero horizontal overflow, and failure-to-Retry state preservation
  all passed.
- Bilingual forms passed 32 combinations covering English/Arabic, light/dark,
  desktop/phone, and Customer/Supplier/Company/Lease. Native controls, field order,
  direction, focus, invalid states, Simple/Advanced reversibility, document
  stability, and zero page overflow passed.
- The form hierarchy passed Customer, Supplier, Company, Item, Property, Real
  Estate Unit, and Lease with native controls preserved.
- The interaction gate passed Customer Quick Entry, Invoice Tools, native
  confirmation, server-error feedback, and list-filter dialogs with no browser
  errors or serious/critical Axe findings.

`tools/navigation-acceptance.mjs` was updated to assert the current standardized
binary sidebar and permanent top-bar ownership. Its former compact-rail assertions
belonged to the retired multi-layout shell and were not valid MVP requirements.
`tools/form-bilingual-acceptance.mjs` now has a direct-route fallback when Frappe
does not mount a fresh Simple composer after an in-page route transition.

### Step 5 — Physical document acceptance

With the production-intended printer settings:

1. Print one A4 tax or simplified invoice at 100% scale.
2. Print one 80 mm tax or simplified invoice using the intended thermal printer.
3. Scan the printed QR code with a real phone/scanner.
4. Compare document identity, customer, items, totals, VAT, status, direction, and
   QR data across browser preview, downloaded PDF, and paper.
5. Record printer model, driver, scale, margins, browser, and result.

### Step 6 — Run final gates and create the release receipt

After final fixes, run the focused suites, broader regressions, production build,
deployment, and live acceptance. Record the exact asset hashes and results.

## 8. What may be changed before launch

Only change code for a reproduced launch defect in these areas:

- Required Simple-mode fields are unreachable.
- Status or the current primary action becomes unreachable on long/mobile invoices.
- Long descriptions overlap monetary columns.
- Customer Statement rendering is incorrect.
- Arabic/English direction or translations differ functionally.
- A managed PDF clips, overlaps, mixes static-label languages, loses required QR
  data, or uses the wrong physical dimensions.
- The canonical top bar/sidebar is duplicated, covered, missing, or logically
  reversed.
- A dashboard/list action opens the wrong native data.
- A test or live console error proves a release regression.

Use the existing shared components. Add a targeted regression test for every fix.

## 9. What must not be changed

- Do not replace ERPNext accounting, stock, tax, permissions, validation, naming,
  document mapping, payment, save, submit, or cancel behavior.
- Do not create client-only invoices, quotations, payments, stock movements, or
  balances.
- Do not build a second sidebar, top bar, mobile navigation system, list UI, or
  route-specific shell.
- Do not redesign Advanced mode.
- Do not replace Frappe link fields, Item Quick Entry, child tables, native
  confirmations, or filter areas.
- Do not hide a required writable field in Simple mode.
- Do not label the draft summary as the exact final PDF.
- Do not calculate an independent authoritative invoice total.
- Do not broaden the launch into manufacturing, HR, payroll, CRM, real estate,
  portals, analytics, recommendations, or a print-template designer.
- Do not refactor unrelated code or apply a broad formatter.
- Do not overwrite owner-managed Company, VAT, bank, contact, or logo data without
  verified values and authorization.

## 10. Launch blockers

Production approval is blocked while any item below is true:

- A normal configured invoice cannot be saved and submitted from Simple mode.
- A required field has no reachable control.
- Quotation conversion or payment creation bypasses the native mapper.
- Bunood totals disagree with the native document.
- A dashboard queue or list preset opens the wrong data.
- Arabic and English expose different business actions.
- A4 or thermal output clips identity, items, totals, VAT, or required QR content.
- A required printed QR code does not scan from paper.
- Submitted records expose draft-only editing/deletion.
- The canonical top bar/sidebar is duplicated, hidden, covered, or replaced.
- Production business identity, tax, address, contact, or logo data is inaccurate.
- An active MVP automated gate fails.
- The release candidate does not serve the final built assets.
- The final financial transaction does not reconcile the invoice outstanding amount.

## 11. Verification commands

Run from the repository root.

Before editing an overlapping file:

```powershell
git status --short
git diff -- <path>
```

Focused JavaScript syntax and sales behavior:

```powershell
node --check bunood_theme/public/js/document_actions.js
node --check bunood_theme/public/js/list_presets.js
node --check bunood_theme/public/js/quotation_list.js
node --check bunood_theme/public/js/sales_invoice_list.js
node --check bunood_theme/public/js/simple_forms.js
node --check bunood_theme/public/js/sales_bill.js

node --test tests/list_presets.test.cjs tests/invoice_list.test.cjs tests/home-entry-regression.test.mjs
node --test tests/document_actions.test.cjs tests/simple_forms.test.cjs tests/sales_bill.test.cjs
node --test tests/sidebar-rebuild.test.cjs tests/onboarding_layout.test.cjs
```

Print and setup behavior:

```powershell
python -m unittest tests.test_payment_setup_contract tests.test_print_qr tests.test_print_engine tests.test_setup_completion
node tools/commercial-document-pdf-regression.mjs
python tools/verify_commercial_document_pdfs.py artifacts/commercial-document-pdfs-20260919

wsl bash -lc 'docker exec bunoodrc20-backend-1 bench --site rc20.localhost execute bunood_theme.verification.quote_to_cash_matrix.run --kwargs "{\"company\":\"Bunood Development\"}"'
```

Build and diff hygiene:

```powershell
npm run build
git diff --check
```

Deploy the already-built working tree:

```powershell
wsl bash -lc 'cd "/mnt/c/Users/abdul/Documents/Codex/2026-09-05/loc-2/work/baseline-20260909/theme" && BND_SITE=rc20.localhost BND_BACKEND=bunoodrc20-backend-1 BND_FRONTEND=bunoodrc20-frontend-1 BND_STACK_PREFIX=bunoodrc20 BND_URL=http://127.0.0.1:8088 bash tools/deploy.sh --no-build'
```

Site update after a patch or managed-format change:

```powershell
wsl bash -lc 'docker exec bunoodrc20-backend-1 bench --site rc20.localhost migrate'
wsl bash -lc 'docker exec bunoodrc20-backend-1 bench --site rc20.localhost execute bunood_theme.printing.install.sync_print_theme'
```

## 12. Current verified build evidence

- Version: `0.46.34`; `bench list-apps` reports the same value after migration.
- Recorded HEAD: `18209bd`.
- Branch: `production/theme-v0.46.7`.
- Working tree: intentionally dirty; 120 status entries at the 2026-09-20 refresh.
- Main CSS: `bunood_theme/public/dist/css/bunood.163e36ab.css`.
- Print CSS: `bunood_theme/public/dist/css/bunood-print.6115405a.css`.
- Main JavaScript: `bunood_theme/public/dist/js/bunood.1c831d8f.js`.
- Focused invoice/form/action suite: 111 of 111 passed.
- List, Home, dashboard, and translation regression suite: 31 of 31 passed.
- Shell, sidebar, and onboarding regression suite: 41 of 41 passed.
- Payment, print QR, print-engine, setup, exact-halala, and release-metadata suite: 27 of 27 passed.
- Extended interaction and translation contracts: 22 of 22 passed.
- Focused QR + print suite: 13 of 13 passed.
- Production build after the invoice fix: passed with the recorded asset hashes.
- `git diff --check`: passed.
- Narrow native workspace drawer: at 700 px RTL it opens above content, dismisses
  through its overlay, and records no browser errors.
- Live same-item acceptance: `_Test FG Item 2` added twice produced one populated
  invoice row with quantity `2.00`, amount `100.00`, and one blank ready row. The
  draft was not saved or submitted.
- Live Arabic row-action acceptance: each item row exposes only `إزالة`; the former
  `نسخ` / `Add one` control is absent from the deployed DOM. Automatic same-item
  quantity consolidation remains active, and browser errors were empty.
- Live invoice row-surface acceptance: the deployed white, alternating gray, and
  focused green states resolve to one matching background across every direct grid
  cell, including amount and actions. Browser errors were empty.
- Live Arabic line-discount acceptance: the Simple sales-invoice grid shows
  `مبلغ الخصم` as a native Currency control and contains no percentage-discount
  column. Entering `5.00` on a `50.00` item produced native unit rate and amount
  values of `45.00`; the browser console remained error-free.
- Live short-window invoice acceptance: at `1652 x 472`, the document intro stayed
  in normal flow and scrolled away before the sticky item-table header; their
  rectangles did not overlap, the deployed CSS was loaded, and browser errors were
  empty.
- Live Arabic invoice-field acceptance: at the same `690`-pixel narrow width, the
  essentials block fell from about `252px` to `200px`; the payment method used both
  grid tracks, the redundant prose row was removed, and browser errors were empty.
- Live full-width invoice-table acceptance: at `1258 x 782`, all nine RTL columns
  remained inside the table, horizontal and vertical overflow were both visible
  rather than scrollable, and five rows expanded inside normal page flow. The
  preview/customer rail remained available as a drawer and browser errors were
  empty.
- Site migration: passed, including
  `bunood_theme.patches.v0_46_10.follow_print_language`.
- Managed print-format synchronization: passed.
- Real commercial PDF verification: 12 of 12 passed.
- Rollback-safe native quote-to-cash rehearsal: passed with zero outstanding and
  unchanged Quotation, Sales Invoice, Payment Entry, and GL Entry counts.
- Persistent owner-authorized quote-to-cash acceptance: Quotation
  `SAL-QTN-2026-00003`, Sales Order `SAL-ORD-2026-00005`, four-line Sales Invoice
  `ACC-SINV-2026-00013`, and Cash Payment Entry `ACC-PAY-2026-00003` were submitted.
  The invoice grand total is `235.75`, outstanding is `0.00`, and the GL balances
  Debtors `235.75`, Sales `205.00`, Output VAT `30.75`, and Cash `235.75`.
- The submitted mapped invoice was live-reviewed in Simple and Advanced modes.
  Focused workbench/simple-form/print-language checks passed 110 of 110 after the
  mapped-row fix, and the served hashed JavaScript contains the release change.
- Arabic managed A4 preview was reviewed against the posted document: four lines,
  net `205.00`, discount `23.00`, VAT `30.75`, and total `235.75`. Payment receipt
  browser preview was reviewed with Cash `235.75` and invoice outstanding `0.00`.
- Managed default-print Property Setters now target `DocType` (not an inert blank
  `DocField` setter). Live metadata resolves Sales Invoice, Quotation, and Payment
  Entry to their approved Bunood A4/receipt formats after migration.
- Representative real PDFs: visually reviewed and passed.
- The recorded CSS, print CSS, and JavaScript assets each returned HTTP 200 from
  `http://127.0.0.1:8088` after the final build.
- Live navigation acceptance: passed in English/Arabic across desktop, tablet, and
  phone, including role homes, history, persistence, and uniform mobile navigation.
- Live dense-list acceptance: 15 checks passed (seven routes at desktop, seven at
  phone, plus native failure-to-Retry recovery).
- Live bilingual form acceptance: 32 of 32 combinations passed.
- Live form-hierarchy acceptance: seven of seven doctypes passed.
- Live interaction/accessibility acceptance: passed with zero browser errors and
  zero serious/critical Axe findings.
- Contrast: 9,464 measured pairs passed. Icons: all 53 emitted IDs passed. i18n:
  all 1,481 source strings covered, with eight declared exemptions.

The legacy `tests/smoke.mjs` is not an MVP release gate for this standardized
product shell. It still asserts decommissioned alternative layouts, compact rail
states, floating-sidebar presets, and theme-setting permutations that contradict
the one-top-bar/one-sidebar product requirement. Do not reintroduce those features
to make the legacy suite green; migrate any still-relevant assertions into the
focused active-scope gates above.

Do not assume this evidence remains current after editing. Rerun the relevant gates
and replace the hashes in the final release receipt.

## 13. Working-tree safety

The repository contains substantial intentional uncommitted work. Preserve it.

Never run:

```text
git reset --hard
git checkout -- <path>
git clean
```

Do not copy an optional stale WSL source mirror over this repository. The Windows
repository path above, the Docker deployment, and the served asset hashes are the
authoritative sources.

## 14. Final release receipt template

Complete this only after all launch blockers are cleared.

```text
Bunood version:
Git branch / HEAD:
Dirty-tree disposition:
Release-candidate URL and site:
Built CSS hash:
Built print CSS hash:
Built JavaScript hash:

Automated suites:
- Sales/list/home:
- Shell/responsive:
- Print/setup/QR:
- Build:
- Diff hygiene:

Live acceptance:
- English desktop:
- English medium/mobile:
- Arabic desktop:
- Arabic medium/mobile:
- Customer Statement EN/AR:
- Fresh Quotation → Invoice → Payment reconciliation:
- Console errors:

Physical acceptance:
- A4 printer/model/settings/result:
- 80 mm printer/model/settings/result:
- Printed QR scan result:

Production data:
- Company identity confirmed:
- VAT/ZATCA configuration confirmed:
- Logo confirmed:
- Address/contact/footer confirmed:

Known non-blocking defects:
Release decision:
```

## 15. Post-launch backlog — do not delay the MVP

Only begin these after the release gate passes and customers are using the product:

- Customer balance, overdue count, previous invoice, and statement shortcuts in the
  context rail.
- Customer-specific default print language and format.
- Inline format/language selection backed by the production renderer.
- Recent-customer and recent-item prioritization using native data.
- Scheduled statements and payment reminders.
- Role-specific dashboard presets based on observed customer behavior.
- Privacy-safe workflow analytics for time-to-invoice and drop-off.

## 16. Definition of MVP complete

The MVP is ready to sell when:

1. Customer Statement passes live English and Arabic report/PDF acceptance.
2. The invoice workbench passes desktop, medium, and mobile acceptance in both
   languages.
3. A fresh native Quotation → Sales Invoice → Payment Entry flow reconciles exactly.
4. The standardized shell and dashboard/list behavior remain regression-free.
5. All managed PDFs pass automated and visual checks.
6. Real A4 and 80 mm prints pass, including required QR scans.
7. Production company identity, VAT, ZATCA, logo, address, and contact data are
   confirmed.
8. All automated gates and the production build pass.
9. The release candidate serves the recorded final assets.
10. The release receipt is complete and contains no launch blocker.

When these conditions pass, stop adding pre-launch features. Release, sell, collect
customer feedback, and prioritize the post-launch backlog from observed usage.
