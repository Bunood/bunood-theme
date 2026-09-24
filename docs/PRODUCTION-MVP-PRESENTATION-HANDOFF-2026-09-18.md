# Bunood Production MVP — Presentation and Invoice UX Handoff

> **Current execution document:** Use
> `docs/PRODUCTION-MVP-FOCUSED-ACTION-PLAN-2026-09-19.md` for the authoritative
> done/change/do-not-change status and the exact production sequence. This document
> remains the deeper design and implementation reference.

**Document date:** 2026-09-18  
**Audience:** implementation agent taking over the production-readiness work  
**Repository:** `C:\Users\abdul\Documents\Codex\2026-09-05\loc-2\work\baseline-20260909\theme`  
**Branch at handoff:** `production/theme-v0.46.7`  
**HEAD at handoff:** `18209bd`  
**Live site:** `http://127.0.0.1:8088` (`rc20.localhost`)  
**Current Bunood package version in the working tree:** `0.46.9`

> **Important:** The working tree contains intentional, uncommitted product work from
> multiple earlier passes. Do not reset, discard, or replace unrelated changes. Inspect
> the current diff before editing and preserve all existing user work.

## 0. Current execution status — read this first

This file is both the scope contract and the live handoff. The following invoice
slice was implemented after the first draft of this document and is deployed on
`rc20.localhost`:

| Area | Current status | Next agent action |
|---|---|---|
| Direct item entry and native Item Quick Entry | Done and live | Preserve |
| Keyboard movement and always-ready blank row | Done and covered | Preserve |
| Native line copy | Done and live | Add broader business-case coverage only |
| Complete native totals | Done for subtotal/tax/discount/rounding/total/paid/outstanding | Verify more currencies and returns in Advanced mode |
| Customer/preview rail | Done: 65/35 wide layout; labelled drawer below 960 px; RTL verified | Add balance/overdue/statement data only through an existing API |
| Preview fidelity | Live summary is explicitly labelled non-PDF; saved invoices open native print preview | Optional inline format/language selector remains |
| A4 and thermal output | Installed and visible in native print selector | Physical-print/QR acceptance remains |
| Payment received now | Done as an opt-in handoff after native invoice submit to a native mapped Payment Entry | Add inline amount/date/reference collection if required for launch |
| Submitted invoice settlement | Paid/outstanding values shown from native fields | Verify partial-payment reconciliation end to end |
| Arabic invoice UI | New invoice strings translated and live | Complete the full route/document translation sweep |
| Quotation/Invoice/Payment shared action system | Partial | This is the next product-family task |
| Dashboard/list presets | Partial baseline only | Continue after shared document actions |
| End-to-end release matrix | Not complete | Required before production sign-off |

Latest focused verification completed on 2026-09-18:

- `node --test tests/sales_bill.test.cjs`: **73/73 passed**.
- `npm run build`: passed, including translation, phantom-token and payload gates.
- Current deployed desk assets: `bunood.ff84d69a.css` and
  `bunood.004ba14c.js`.
- Live Arabic browser acceptance confirmed the wide rail, narrow RTL drawer,
  one-click line copy, always-ready next row, draft summary disclosure, native
  outstanding amount, native print handoff, and installed A4/thermal formats.
- The Docker stack is updated. The deployment script reported that the optional
  WSL source mirror is stale; do not treat that mirror as the deployed source of
  truth until it is repaired.

## 0.1 Exact takeover point — start here

Do **not** restart the invoice redesign. The next implementation slice is:

> Standardize the state badge and primary/secondary/overflow action hierarchy across
> **Quotation, Sales Invoice, and Payment Entry**, while continuing to delegate every
> lifecycle action to ERPNext.

Start by reading these files in this order:

1. `bunood_theme/public/js/simple_forms.js` — shared Simple-mode document surface.
2. `bunood_theme/public/js/sales_bill.js` — Sales Invoice-specific behavior that must
   be preserved and, where appropriate, adapted to the shared contract.
3. `bunood_theme/public/js/bunood.js` — shell, route, dashboard, and list behavior.
4. `bunood_theme/public/scss/surfaces/_sales_bill.scss` — current invoice action and
   responsive-rail presentation.
5. `tests/simple_forms.test.cjs` and `tests/sales_bill.test.cjs` — current contracts.

The first change should be a small shared document-action contract, not a shell
rewrite. It must derive actions from native document state and permissions, use the
same logical placement on all three document types, and retain native save, submit,
cancel, print, mapping, and Payment Entry behavior. Once that passes, continue with
dashboard cards/list presets, then physical print and full bilingual acceptance.

## 0.2 Preserve these behaviors exactly

- The canonical top bar and one standardized sidebar.
- Direct first-line item entry and the always-ready blank invoice row.
- Native Item Quick Entry, link controls, setters, child-table operations, and form
  lifecycle.
- Native Quotation-to-Sales-Invoice and Sales-Invoice-to-Payment-Entry mapping.
- The live summary's explicit statement that it is not the final PDF.
- The responsive Customer/Preview rail on wide screens and RTL-aware drawer below
  960 px.
- The installed managed A4 and 80 mm formats.
- Simple and Advanced modes editing the same `frm.doc`.
- Every existing user change in the dirty working tree.

## 0.3 Current working-tree warning

The repository has extensive intentional uncommitted changes spanning the shell,
sidebar, invoice experience, translations, print formats, setup patches, tests, and
built assets. At handoff, `git status --short` reports modified, deleted, and untracked
files. The deleted hashed bundles were replaced by newly built hashed bundles. Do not
run reset, checkout, clean, or any broad formatter/rewrite. Inspect each overlapping
diff and make only additive, scoped edits.

Before touching a file, capture the current state with:

```powershell
git status --short
git diff -- <path-to-file>
```

## 0.4 Commands for the next agent

Run from the repository root shown at the top of this document.

Focused invoice verification:

```powershell
node --check bunood_theme/public/js/sales_bill.js
node --test tests/sales_bill.test.cjs
```

Shared form and shell regression tests after action-system changes:

```powershell
node --test tests/simple_forms.test.cjs tests/sales_bill.test.cjs tests/sidebar-rebuild.test.cjs
node --test tests/home-entry-regression.test.mjs
```

Focused print/setup verification:

```powershell
python -m pytest tests/test_print_engine.py tests/test_setup_completion.py -q
```

Production build and diff hygiene:

```powershell
npm run build
git diff --check
```

Deploy the already-built working tree to the local release-candidate stack:

```powershell
wsl bash -lc 'cd "/mnt/c/Users/abdul/Documents/Codex/2026-09-05/loc-2/work/baseline-20260909/theme" && BND_SITE=rc20.localhost BND_BACKEND=bunoodrc20-backend-1 BND_FRONTEND=bunoodrc20-frontend-1 BND_STACK_PREFIX=bunoodrc20 BND_URL=http://127.0.0.1:8088 bash tools/deploy.sh --no-build'
```

The optional WSL source mirror may warn that it is stale. The Docker deployment and
served asset hashes are the release-candidate evidence; do not copy from that mirror
back into this repository.

## 1. Mission

Get Bunood to a production-ready, sellable MVP as quickly as possible by improving
only the following presentation and workflow areas:

1. Invoice creation experience.
2. Customer-facing PDFs and print output.
3. Consistent document actions and statuses.
4. Actionable sales dashboard cards and list filters.
5. Final Arabic/English, desktop/mobile, and end-to-end acceptance.

The product already has ERPNext's core business functionality. Do not broaden this
work into new accounting, stock, CRM, manufacturing, HR, payroll, or real-estate
features. The objective is to make the existing quote-to-cash workflow coherent,
fast, understandable, and professionally presented.

## 2. Production outcome

A trained Saudi small-business user must be able to complete this flow without
learning ERPNext's full information architecture:

```text
Create/select customer
→ Create/select item
→ Create quotation
→ Submit quotation
→ Convert quotation to sales invoice
→ Enter invoice lines quickly
→ Preview A4 or thermal output
→ Submit invoice
→ Record full or partial payment
→ Print payment receipt
→ Open customer statement
```

The flow must work in Arabic and English while preserving native ERPNext validation,
permissions, document mapping, accounting entries, stock behavior, and auditability.

## 3. Authority and source-of-truth rules

These rules are non-negotiable:

- ERPNext DocTypes and controllers own accounting, tax, stock, payment, mapping,
  naming, validation, submission, cancellation, and permissions.
- Bunood is a presentation and orchestration layer. It must not create a parallel
  ledger, stock engine, tax calculator, invoice record, or payment record.
- Simple and Advanced modes edit the same `frm.doc`; never copy or convert data when
  switching modes.
- Use native form setters, native save/submit methods, native mapped-document methods,
  native Payment Entry mapping, and native print rendering.
- Required writable fields must never be hidden in Simple mode.
- Arabic and English use the same information architecture. RTL changes physical
  placement, not the semantic meaning or order of operations.

## 4. Current deployed baseline — do not rebuild these features

The following functionality is already implemented and deployed. Preserve it and
extend it instead of replacing it.

### 4.1 Canonical shell and sidebar — DONE

- One standardized sidebar is used across workspaces, lists, reports, and forms.
- The fixed top bar owns the Bunood identity when visible.
- Routes may change sidebar content but not its geometry or visual system.
- RTL uses logical properties.
- Regression coverage exists in `tests/sidebar-rebuild.test.cjs`.

Primary files:

- `bunood_theme/public/scss/chrome/_sidebar-standard.scss`
- `bunood_theme/public/scss/chrome/_sidebar.scss`
- `bunood_theme/public/scss/chrome/_sidebar-layout.scss`
- `bunood_theme/public/js/bunood.js`
- `docs/SIDEBAR-CONSISTENCY.md`

Do not introduce a second sidebar, route-specific sidebar component, duplicate brand
block, extra page-level top bar, or hamburger control when the canonical sidebar is
already available.

### 4.2 Direct invoice line entry — DONE

- A blank invoice line is visible immediately on a new draft.
- The user searches or types directly in the Item cell.
- There is no first-line **Add Item** gate.
- **Add line** creates additional rows.
- Barcode entry remains available.
- All rows are bound to the active native ERPNext invoice document.

Primary file: `bunood_theme/public/js/sales_bill.js`

### 4.3 Inline item creation — DONE

- **New item / صنف جديد** opens native Item Quick Entry.
- Permission to create Item is checked before opening the modal.
- The created item is selected into the current blank invoice line.
- Do not build a separate Bunood Item API or duplicate Item form.

### 4.4 Live invoice preview — DONE FOR MVP HANDOFF

- A lightweight live invoice preview is rendered from the active invoice document.
- It is explicitly labelled as a live draft summary, not as the final PDF.
- On wide screens it occupies the 30–35% context rail beside the editor.
- Below the rail breakpoint it opens as a labelled, closable drawer and never falls
  permanently below the invoice.
- Saved invoices expose **Open print preview**, which delegates to ERPNext's real
  print renderer and format selector.

Primary files:

- `bunood_theme/public/js/sales_bill.js` (`renderPreview`)
- `bunood_theme/public/scss/surfaces/_sales_bill.scss`

Do not reintroduce a separate preview data model or claim pixel-perfect PDF fidelity
for the lightweight summary. Any future exact preview must reuse the native renderer.

### 4.5 Preferred payment method and received-now handoff — DONE FOR MVP

- Sales Invoice has the custom field `bunood_payment_method`.
- The field links to Mode of Payment.
- The value is copied into the native Payment Entry created from the submitted
  invoice.
- The preference does **not** mark an invoice paid and does not post accounting.
- A draft Sales Invoice now offers **Payment received now**. When selected, native
  invoice submission completes first and the native mapped Payment Entry opens.
- The Payment Entry is still reviewed and completed through ERPNext's own lifecycle;
  a failed mapping leaves the submitted invoice accurately unpaid.

Primary files:

- `bunood_theme/printing/install.py`
- `bunood_theme/public/js/sales_bill.js` (`makePaymentEntry`)

Amount/date/reference inline collection is still optional follow-up work; do not
auto-submit a Payment Entry or create a parallel payment endpoint to add it.

### 4.6 Quotation to Sales Invoice — DONE

- Submitted eligible Quotations expose **Create Sales Invoice**.
- Conversion delegates to ERPNext's native quotation mapper.
- Items, taxes, references, permissions, and auditability remain upstream-owned.

Do not replace this mapping with copied browser data or a custom invoice insert.

### 4.7 Print formats — INSTALLED AND FUNCTIONAL

The repository contains managed print formats for:

- Sales Invoice A4.
- Simplified Sales Invoice A4.
- Tax Invoice thermal 80 mm.
- Simplified Invoice thermal 80 mm.
- Quotation A4.
- Payment receipt/voucher.
- Journal voucher.
- Customer statement.

The quotation format now chooses Arabic or English labels and amount-in-words output
according to the print language. Thermal formats declare an actual 80 mm page width.

Primary locations:

- `bunood_theme/printing/install.py`
- `bunood_theme/printing/formats/`
- `bunood_theme/zatca/`
- `bunood_theme/templates/bunood_print_macros.html`
- `docs/PRINT-FOOTERS.md`
- `bunood_theme/printing/README.md`

### 4.8 Deployment and verification already completed

- The current build was deployed to `rc20.localhost`.
- Database migration completed successfully.
- The `bunood_payment_method` Custom Field exists on the live site.
- Production assets returned HTTP 200.
- Deployed desk assets at the latest verification included:
  - `bunood.ff84d69a.css`
  - `bunood.004ba14c.js`
- Latest focused Sales Invoice verification passed: **73/73 tests**.
- Latest focused Python print/setup verification passed: **9/9 tests**.
- Earlier broader suite counts are historical only; rerun the relevant suites after
  the next change rather than treating those old counts as current evidence.
- Live browser verification confirmed:
  - Direct blank invoice item row.
  - **New item** button and Item Quick Entry modal.
  - Preferred payment method field.
  - 65/35 live invoice summary rail and narrow RTL drawer.
  - Native one-click line copy with a new blank row retained.
  - Native paid/outstanding total presentation.
  - Native print preview with managed A4 and thermal formats.
- A real PDF was generated successfully for an existing quotation.

Treat the above as the starting baseline, not as claims that every production
acceptance scenario has already passed.

## 5. Documentation precedence

This document supersedes older scope statements that conflict with the current build,
especially:

- `docs/MVP-PRD-2026-09-18.md` stating that split/live preview was deferred.
- `docs/CURRENT-BUILD-AUDIT-2026-09-17.md` stating that invoice-level payment method
  presentation should not be added.
- `docs/IMPLEMENTATION-ROADMAP-MVP-TO-V1.md` placing all preview work in a later phase.

The architectural safety rules in those documents still apply. The outdated scope
statements do not.

## 6. Strict implementation scope

Implement the following work in order. Do not begin a later group while an earlier
group has unresolved production blockers.

## 6.1 P0 — Invoice page hierarchy and actions

### Goal

Make the invoice page feel like one focused workspace with an obvious completion
path.

### Required changes

1. Make the document header sticky within the invoice workspace.
2. Display invoice title/number, document status, and unsaved state in the header.
3. Present one clear primary action for the current state:
   - Draft with changes: **Save draft**.
   - Complete saved draft: **Submit**.
   - Submitted invoice: **Record payment** where permitted.
4. Move lower-priority actions into one **Invoice actions** menu:
   - Preview PDF.
   - Print A4.
   - Print thermal.
   - Save and new.
   - Duplicate.
   - Delete draft.
   - Cancel, only when native rules permit it.
5. Keep dangerous actions out of the primary visual hierarchy.

### Acceptance criteria

- Save/Submit remains reachable while scrolling long invoices.
- No duplicate page header or second top bar appears.
- Only valid actions are shown for the document state and user permissions.
- Submitted records do not expose draft-only editing or deletion.
- Native confirmation and validation dialogs remain authoritative.
- Layout works in Arabic and English.

## 6.2 P0 — Essential fields and progressive disclosure

### Goal

Allow the common invoice to be completed entirely in Simple mode without presenting
the full ERPNext form.

### Always-visible fields

- Customer.
- Invoice/posting date.
- Due date or payment terms.
- Customer reference, when exposed by the DocType.
- Preferred payment method.
- Invoice lines.

### Collapsed sections

- Shipping and delivery.
- Inventory and warehouse options.
- Accounting dimensions.
- Discounts and taxes.
- Terms and notes.
- Attachments.
- Electronic-invoice details.

### Acceptance criteria

- Every required writable field needed by the active configuration is reachable in
  Simple mode.
- A normal invoice can be saved and submitted without switching to Advanced.
- Optional fields do not visually dominate the initial page.
- Switching modes keeps the same native document and unsaved values.

## 6.3 P0 — Invoice line table refinement

### Goal

Make line entry behave like a fast, readable business spreadsheet.

### Default visible columns

1. Item.
2. Quantity.
3. Unit.
4. Unit price.
5. Discount.
6. VAT/tax.
7. Amount.
8. Row actions.

Warehouse, income account, cost center, project, batch, serial number, and similar
specialist fields belong in expandable row details unless the site's configuration
makes one of them mandatory.

### Required changes

- Preserve the always-ready blank row.
- Add reliable Enter/Tab movement between editable cells.
- Focus the next empty row after completing the last cell.
- Add **Duplicate row**.
- Keep **New item** and barcode scanning.
- Put field and stock errors on the affected row.
- Keep long descriptions readable without moving numeric columns.
- If low risk and supported by existing data, prioritize recent items in Item search;
  otherwise defer this one enhancement rather than adding a new data store.

### Acceptance criteria

- A keyboard user can enter three ordinary items without using the mouse.
- Adding, duplicating, and removing rows uses native child-table operations.
- Recalculation does not destroy focus or row controls.
- Long Arabic and English item names wrap without overlapping amounts.
- Numeric columns align consistently in LTR and RTL.

## 6.4 P0 — Complete and persistent totals

### Goal

Make the financial result understandable without opening Advanced mode.

### Required display

- Subtotal.
- Line discounts.
- Invoice-level discount.
- Taxable amount where available.
- VAT/taxes.
- Rounding adjustment.
- Grand total.
- Amount paid.
- Balance due/outstanding.

### Acceptance criteria

- Values come from native ERPNext calculated fields; do not calculate an independent
  authoritative total in browser code.
- The summary stays visible in the wide-screen workspace or is immediately adjacent
  to the completion action at smaller sizes.
- Currency symbols, precision, and negative values are correct in Arabic and English.

## 6.5 P0 — Responsive customer and preview panel

### Goal

Provide useful customer context and document preview without making the item editor
too narrow or producing an extremely long page.

### Wide desktop behavior

- Use approximately 65–70% for the editor and 30–35% for the context panel.
- Never allow the item editor to become narrower than approximately 720 px.
- Provide two panel tabs: **Customer** and **Preview**.

Customer tab:

- Customer identity and VAT number.
- Current balance.
- Overdue amount/count.
- Link to customer statement.
- Previous invoice link if this is cheap to obtain through an existing API.

Preview tab:

- Customer-facing invoice preview.
- A4/Thermal selector.
- Arabic/English selector.
- Open full preview.

### Medium and small behavior

- When the editor would become too narrow, make it full width.
- Open preview in a drawer or full-screen modal.
- Do not move a permanent full document preview below the line table.
- On mobile, render invoice lines as readable cards or a deliberate reduced-column
  editor; do not squeeze the full desktop table into the viewport.
- Keep the main completion action reachable in a sticky bottom action area on mobile.

### Preview implementation rule

The final preview must use the same production print renderer/template as the PDF,
or a shared rendering path whose fidelity is automatically tested. The existing
lightweight `renderPreview` can remain as a loading/summary state, but it must not be
represented as an exact PDF preview if it is not one.

### Acceptance criteria

- Preview and final PDF show the same data, language, totals, and document type.
- The item editor remains usable with the canonical sidebar open.
- No horizontal page overflow at supported widths.
- Preview correctly switches between A4 and thermal formats.
- The preview UI is accessible by keyboard and labelled for assistive technology.

## 6.6 P0 — Payment received now flow

### Goal

Give cash-sale users a simple outcome while preserving the native two-document
accounting model.

### Required presentation

```text
Payment
○ Collect later
● Payment received now
```

When **Payment received now** is selected, reveal:

- Amount received.
- Payment method.
- Payment date.
- Reference.
- Deposit/bank/cash account if required by ERPNext.

### Required behavior

1. Validate and submit the Sales Invoice using the native form method.
2. Request a Payment Entry through ERPNext's native mapper.
3. Apply the entered payment details through native setters.
4. Save/submit the Payment Entry only through its native lifecycle and required
   confirmations.
5. Link the Payment Entry to the invoice through the native references produced by
   the mapper.
6. If payment creation fails, leave the successfully submitted invoice accurately
   unpaid and show a recoverable error with a **Create payment** action.

### Acceptance criteria

- **Collect later** creates no payment.
- **Payment received now** creates an auditable native Payment Entry.
- Full and partial payments are supported.
- The invoice's outstanding amount and customer statement reconcile correctly.
- A browser failure cannot mark an invoice paid without a valid Payment Entry.
- Early-payment-discount and other native special cases continue delegating to the
  upstream workflow.

## 6.7 P0 — Consistent core-document states and actions

### Goal

Make Quotations, Sales Invoices, and Payment Entries behave like one product family.

### Status presentation

Use one placement and semantic color system:

| State | Color role |
|---|---|
| Draft | neutral/gray |
| Submitted/Posted | information/blue |
| Sent | purple/accent |
| Partially paid | warning/amber |
| Paid/Completed | success/green |
| Overdue | danger/red |
| Cancelled | muted danger |

Use native document/payment state to choose the label. Do not invent a conflicting
client-only state machine.

### Action contracts

Quotation:

- Save draft.
- Submit.
- Create Sales Invoice.
- Preview/Print.
- Duplicate.
- Cancel where valid.

Sales Invoice:

- Save draft.
- Submit.
- Record payment.
- Preview/Print.
- Create Credit Note where valid.
- Duplicate.
- Cancel where valid.

Payment Entry:

- Save draft.
- Submit.
- Preview/Print receipt.
- Cancel where valid.

### Acceptance criteria

- Primary actions occupy the same logical location across the three surfaces.
- State labels and action availability match native permissions and lifecycle.
- Dangerous or rare actions remain in the overflow menu.
- Arabic translations are complete and semantically correct.

## 6.8 P0 — Actionable sales dashboard and list presets

### Goal

Make dashboard counts lead directly to work instead of acting as decoration.

### Dashboard cards that must navigate to filtered results

- Sales drafts.
- Overdue receivables.
- Open quotations.
- Low-stock items where inventory is enabled.
- Unsubmitted documents.

### Invoice list presets

- Draft.
- Unpaid.
- Partially paid.
- Overdue.
- Paid.
- This month.

### Quotation list presets

- Draft.
- Awaiting response.
- Expiring soon.
- Converted.
- Lost.

### Acceptance criteria

- Clicking a count opens the expected list with a visible active filter.
- Zero-count cards remain aligned and do not generate broken routes.
- Filters work in Arabic and English.
- Clearing the preset returns to the ordinary list.
- List badges use the same status semantics as document headers.

## 6.9 P0 — Customer-facing document family

### Goal

Make every customer-facing output look like it belongs to one professional product.

### Required documents

- Quotation A4.
- Sales Invoice A4.
- Simplified Sales Invoice A4.
- Tax Invoice thermal 80 mm.
- Simplified Invoice thermal 80 mm.
- Payment receipt.
- Customer statement.

### Required hierarchy

1. Logo and company identity.
2. Document title.
3. Document number and dates.
4. Seller information.
5. Customer information.
6. Item/transaction table.
7. Subtotal, discount, VAT, total, paid, and balance as applicable.
8. Payment or bank instructions where applicable.
9. QR code where required.
10. Terms/notes.
11. Footer and page number.

### Acceptance criteria

- Arabic documents are consistently RTL and English documents consistently LTR.
- No unintended Arabic text appears in an English output or vice versa.
- Long descriptions wrap without shifting monetary columns.
- Table headers repeat on later pages.
- Totals do not become orphaned from their context.
- Output remains legible in grayscale.
- Preview, downloaded PDF, and physical print agree.
- QR codes scan from both A4 and thermal paper where applicable.

## 7. Required implementation order

Follow this sequence because later work depends on earlier structure:

```text
1. Invoice header/action hierarchy
2. Essential fields and progressive disclosure
3. Line table and keyboard flow
4. Totals presentation
5. Responsive customer/preview panel
6. Payment received now workflow
7. Shared states/actions for quotation, invoice, payment
8. Dashboard links and list presets
9. Document-family polish
10. End-to-end acceptance and release
```

Do not refactor unrelated shell or ERPNext behavior while implementing this sequence.

## 8. Explicit non-goals — do not implement before production

- New accounting, stock, tax, payment, or permission engines.
- A drag-and-drop dashboard builder.
- A customer-facing template designer.
- Customer-specific document template management.
- Broad role-personalization infrastructure.
- New permanent navigation bars, sidebars, or mobile navigation systems.
- New ERP modules.
- Payroll, bank feed, OCR, or reconciliation automation.
- A redesign of native Advanced mode.
- Broad animation or cosmetic work outside the scoped surfaces.
- AI item recommendations or a new recommendation database.
- A new customer portal.
- Replacing Frappe/ERPNext link controls, dialogs, grid permissions, or form lifecycle.

If a requested change is not necessary for the flow in section 2 or an acceptance
criterion in section 6, place it in a post-launch backlog instead of implementing it.

## 9. Files most likely to change

Invoice experience:

- `bunood_theme/public/js/sales_bill.js`
- `bunood_theme/public/scss/surfaces/_sales_bill.scss`
- `bunood_theme/public/js/simple_forms.js` only if the shared document-action contract
  genuinely belongs there.

Shell and dashboards:

- `bunood_theme/public/js/bunood.js`
- `bunood_theme/public/scss/surfaces/_home.scss`
- Existing registry/preset files only when adding route/filter metadata.

Print:

- `bunood_theme/printing/formats/`
- `bunood_theme/templates/bunood_print_macros.html`
- `bunood_theme/printing/install.py` only for idempotent format/custom-field setup.
- Shared print SCSS rather than scattered inline styles, except required page-size
  declarations documented in `bunood_theme/printing/README.md`.

Translations:

- `bunood_theme/translations/ar.csv`
- `bunood_theme/locale/ar.po`

Tests:

- `tests/sales_bill.test.cjs`
- `tests/simple_forms.test.cjs`
- `tests/sidebar-rebuild.test.cjs`
- `tests/home-entry-regression.test.mjs`
- `tests/test_print_engine.py`
- `tests/test_setup_completion.py`
- Browser smoke coverage under the existing smoke framework.

Avoid touching core ERPNext source. Prefer a Bunood hook/adapter that delegates to
the existing native API.

## 10. Verification strategy

### 10.1 Automated gates after each task group

At minimum:

- Run focused invoice and Simple-form JavaScript tests.
- Run focused print/setup Python tests for print or installation changes.
- Run translation/catalogue checks after adding labels.
- Run the production asset build and payload budget gate.
- Run `git diff --check`.

Expand tests to lock each new acceptance criterion. Do not rely only on CSS selectors;
test document state, permissions, native delegation, and expected business outcome.

### 10.2 Browser matrix

Verify representative routes at these states:

| Surface | States |
|---|---|
| Sales Invoice | new draft, saved draft, submitted unpaid, partially paid, paid |
| Quotation | new draft, submitted eligible for conversion, converted |
| Payment Entry | draft, submitted |
| Dashboard | zero counts, non-zero counts, filtered navigation |
| Lists | each required preset and cleared preset |
| Modals/drawers | New Item, preview, payment received now |

Test each critical path in:

- Arabic RTL.
- English LTR.
- Wide desktop with sidebar open.
- Narrow desktop/tablet.
- Mobile-sized viewport.

### 10.3 Print matrix

Use realistic fixtures covering:

- One item and many items.
- Long Arabic and English descriptions.
- VAT-inclusive and VAT-exclusive prices where supported.
- Line and invoice discounts.
- Full and partial payment.
- Long customer/company names.
- Multi-page A4 output.
- 80 mm thermal output.

Inspect generated PDF page size and render at least one PDF from each format to an
image for visual review. Then test one actual A4 print and one actual thermal print.

## 11. Final production acceptance scenario

The release candidate must complete the following without manual database edits:

1. Sign in as a non-administrator sales user.
2. Create or select a Customer in Simple mode.
3. Create an Item through invoice Quick Entry or select an existing Item.
4. Create and submit a Quotation.
5. Convert the Quotation to a Sales Invoice using the native mapper.
6. Add, edit, duplicate, and remove invoice lines.
7. Confirm native subtotal, discount, tax, and total calculations.
8. Preview Arabic/English A4 and thermal documents.
9. Submit the invoice.
10. Record a partial payment through the native Payment Entry flow.
11. Confirm the outstanding balance.
12. Record the remaining payment.
13. Confirm Paid state and zero outstanding amount.
14. Print the payment receipt.
15. Open the customer statement and reconcile the invoice and both payments.
16. Confirm the dashboard and list filters reflect the final states.

Repeat the core flow in Arabic and English. Reconcile the resulting records against
native ERPNext accounting reports.

## 12. Release blockers

Do not release if any of these occur:

- Missing required fields in Simple mode.
- Incorrect or browser-calculated authoritative totals.
- Duplicate invoice, quotation, or payment documents.
- A draft creates accounting or stock ledger entries.
- Payment presentation marks an invoice paid without a valid Payment Entry.
- Quotation conversion loses items, rates, taxes, references, or permissions.
- Customer statement disagrees with invoice/payment outstanding values.
- Preview and PDF materially disagree.
- Arabic text or mirrored controls prevent task completion.
- Canonical top bar/sidebar is missing, covered, duplicated, or replaced.
- A4 or thermal output clips required fiscal information.
- Production assets fail to build, migrate, or serve.

## 13. Release procedure and evidence to record

Before deployment:

1. Record branch, commit, working-tree status, version, and asset hashes.
2. Back up the target site and record the restore owner/procedure.
3. Run focused and full required test gates.
4. Build immutable production assets.
5. Deploy through the repository's canonical deployment script.
6. Run site migration so idempotent print/custom-field installation executes.
7. Verify asset HTTP responses and browser bundle version.
8. Run the final production acceptance scenario.
9. Record PDF samples and physical printer results.
10. Record known non-blocking issues separately.

Do not report completion based only on source changes or tests. Completion requires
successful deployment plus visible browser and document evidence.

## 14. Post-launch backlog — only after the production gate

1. Recent documents and favorites.
2. Broader role-based dashboard presets.
3. Global search grouping for pages, customers, items, invoices, and quotations.
4. Customer-specific print-template and language defaults.
5. Scheduled statements and payment reminders.
6. Self-service document-template customization.
7. Deeper behavioral analytics based on privacy-safe workflow events.

## 15. Research basis for the design direction

The plan intentionally combines the following documented patterns:

- Odoo: clear draft/post/payment lifecycle, native payment records, expandable
  reports, and direct customer statements.
- Microsoft Dynamics 365/Business Central: page-level versus line-level action
  hierarchy, progressive disclosure, role workspaces, and PDF preview fidelity.
- Oracle NetSuite: role-aware reminders, configurable dashboards, transaction
  record creation from fields, and managed document templates.
- SAP Business One: controlled cockpit layouts and standardized print layouts.
- Zoho Books/Invoice: approachable invoice completion actions, payment presentation,
  and customer-facing PDF configuration.
- QuickBooks Online: inline customer/item creation, Review and Send, save variants,
  and side-by-side invoice customization/preview.
- Wafeq: region-focused invoice entry and MENA compliance presentation.

The target is not to copy any one product. Bunood should combine their strongest
presentation patterns while keeping ERPNext as the authoritative transaction system.

## 16. Definition of done

This handoff is complete only when:

- Every P0 item in section 6 meets its acceptance criteria.
- The final scenario in section 11 passes in Arabic and English.
- All release blockers in section 12 are absent.
- Production assets and migrations deploy successfully.
- A4 and thermal physical output are verified.
- The deployed version, test evidence, PDF samples, and known non-blocking issues are
  documented for the next release.
