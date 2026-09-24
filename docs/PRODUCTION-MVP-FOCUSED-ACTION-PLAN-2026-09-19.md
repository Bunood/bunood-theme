# Bunood Production MVP Focused Action Plan

> **Superseded:** use
> `docs/BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md` for the
> current production plan and handoff.

**Document date:** 2026-09-19  
**Audience:** the implementation agent continuing production-readiness work  
**Repository:** `C:\Users\abdul\Documents\Codex\2026-09-05\loc-2\work\baseline-20260909\theme`  
**Branch:** `production/theme-v0.46.7`  
**HEAD at handoff:** `18209bd`  
**Live release candidate:** `http://127.0.0.1:8088` using site `rc20.localhost`  
**Bunood package version:** `0.46.9`

## 1. Purpose and production decision

This is the authoritative execution plan for the presentation, invoice-creation,
sales-workflow, and customer-document work required to make Bunood sellable as an
MVP. It converts the ERP presentation research and the invoice-page research into a
small, ordered production backlog.

The core ERP functionality already exists in ERPNext. The remaining objective is to
make the existing quote-to-cash flow easy to understand, fast to operate, consistent
in Arabic and English, and professional when presented to a customer.

The production decision is:

1. Finish only the remaining launch blockers in section 5.
2. Run the complete release acceptance scenario in section 8.
3. Start selling after the launch gate passes.
4. Continue the post-launch improvements in section 10 while collecting customer
   feedback.

Do not restart completed work. Do not redesign the shell. Do not add a second
business engine. Do not expand this plan into unrelated ERP modules.

## 2. Exact starting point for the next agent

Start with **Work Package 2 — invoice page launch polish** in section 5.

Work Package 1 is complete and live on the release candidate. On 2026-09-19, the
Sales Invoice and Quotation presets were verified in Arabic and English, the Home
open-quotation and overdue-receivable queues opened the intended native filtered
lists, clearing **All** restored the ordinary lists, and the live browser reported
zero new console errors.

The shared state and action system is complete and live across the three core sales
documents. On 2026-09-19, live browser verification confirmed:

- Sales Invoice: native submitted/unpaid status, one primary **Record payment**
  action, and secondary actions in the invoice overflow.
- Quotation: native open status, one primary **Create Sales Invoice** action, and
  secondary actions in the shared overflow.
- Payment Entry: native submitted status, one primary **Print** action, and **New**,
  **Duplicate**, and **Cancel document** in the shared overflow.

Do not spend another implementation pass rebuilding this contract. Modify it only if
a failing test or live regression proves a defect.

## 3. Product goals

### Goal 1 — Make the ERP feel organized and intentional

Users should see one stable shell, one navigation model, one state language, and one
action hierarchy. Dashboard cards and list filters must take users directly to work
that needs attention.

### Goal 2 — Make invoice creation the fastest route through the product

A normal invoice must be possible from Simple mode without exposing ERPNext's full
form. The page must keep customer, dates, lines, totals, payment choice, status, and
the next valid action clear at all times.

### Goal 3 — Make every customer-facing document look like one product

Quotation, invoice, thermal invoice, payment receipt, and customer statement must
share a consistent information hierarchy, bilingual behavior, totals treatment, and
print quality.

### Goal 4 — Reach production without weakening ERPNext

All accounting, tax, stock, permissions, mapping, save, submit, cancel, and payment
behavior must continue to use native ERPNext documents and controllers.

## 4. What is already done and must be preserved

| Area | Verified current state | Instruction |
|---|---|---|
| Standard shell | One canonical top bar and one standardized sidebar across the covered Desk surfaces | Preserve; do not create a route-specific shell |
| Invoice line entry | Direct first-line editing, native Item Quick Entry, keyboard movement, row duplication, and an always-ready blank row | Preserve native child-table behavior |
| Invoice totals | Native subtotal, tax, discount, rounding, grand total, paid, and outstanding values are presented | Do not calculate an independent authoritative total |
| Invoice context rail | Wide 65/35 editor and Customer/Preview rail; labelled RTL-aware drawer below 960 px | Preserve responsive behavior |
| Preview contract | Draft view is explicitly a summary, not the exact final PDF; saved invoices hand off to native print preview | Do not relabel the summary as an exact PDF preview |
| Payment received now | Opt-in post-submit handoff to a native mapped Payment Entry | Preserve the native two-document accounting model |
| Quotation conversion | Native Quotation-to-Sales-Invoice mapping is used | Do not implement client-side document copying |
| Shared states and actions | Shared permission-aware state badge, one primary action, and an overflow menu are live on Quotation, Sales Invoice, and Payment Entry | Treat as complete unless a regression is demonstrated |
| Dashboard and list presets | Home queues plus Sales Invoice and Quotation presets are built, deployed, and live-verified in Arabic and English | Treat as complete unless a regression is demonstrated |
| Print formats | Managed Quotation A4, Sales Invoice A4 and thermal, Payment Entry receipt, and Customer Statement formats exist; A4 and thermal invoice formats are installed | Continue with print acceptance, not a new template system |
| Arabic support | Core invoice and shared action labels are translated and live | Complete only missing route/document strings discovered in acceptance |
| Automated evidence | Current focused suites passed 28 of 28 list/Home tests, 127 of 127 sales/shell tests, and 9 of 9 print/setup tests; the production build passed | Keep these tests green |
| Deployed assets | CSS `bunood.4be85fc8.css`; JavaScript `bunood.9a4b3c58.js` | These are the current release-candidate hashes |

The working tree contains extensive intentional uncommitted work. Never run
`git reset --hard`, `git checkout --`, `git clean`, or a broad formatter. Inspect the
diff for each file before editing and preserve unrelated user changes.

## 5. Remaining MVP work in required order

Only the work packages in this section are launch work. Complete them in order.

### Work Package 1 — Actionable dashboard and list presets

**Status: complete and live-verified on 2026-09-19.**

**Goal:** turn the home and sales surfaces into a work queue instead of a collection
of decorative counts.

**Change:**

1. Make these existing dashboard cards open a list with a visible native filter:
   - Sales drafts.
   - Overdue receivables.
   - Open quotations.
   - Unsubmitted documents.
   - Low-stock items only when inventory is enabled and an authoritative native
     field or report can supply the state.
2. Add small, visible Sales Invoice list presets:
   - Draft.
   - Unpaid.
   - Partially paid.
   - Overdue.
   - Paid.
   - This month.
3. Add small, visible Quotation list presets:
   - Draft.
   - Awaiting response.
   - Expiring soon.
   - Converted.
   - Lost.
4. Reuse the same semantic status colors already used by document headers.
5. Use native Frappe route filters. Do not create a second list or copy records into
   a Bunood data store.

**Primary files:**

- `bunood_theme/public/js/bunood.js`
- `bunood_theme/public/scss/surfaces/_home.scss`
- `bunood_theme/public/scss/surfaces/_coverage.scss`
- `bunood_theme/translations/ar.csv`
- `bunood_theme/locale/ar.po`
- Relevant dashboard, home-entry, and smoke tests

**Definition of done:**

- Every nonzero card opens the expected native list with the intended filter visibly
  active.
- A zero-count card stays aligned and either opens an empty filtered list or is
  clearly non-actionable without producing a broken route.
- Clearing the preset restores the ordinary list.
- Presets work in Arabic and English.
- No dashboard click opens the wrong workspace or the generic home dashboard.

**Acceptance evidence:** Sales Invoice **Overdue** and Quotation **Converted**
applied visible native filters in both languages; **All** cleared them; Home open
quotations and overdue receivables opened the correct filtered native lists; the
release candidate served the recorded CSS and JavaScript hashes; no new browser
console errors were recorded.

### Work Package 2 — Invoice page launch polish

**Goal:** close the remaining usability gaps without replacing the working invoice
workbench.

**Change only if the current surface fails the criterion:**

1. Keep the status, unsaved state, and one current primary action visible while a
   long invoice scrolls.
2. Confirm that a normal configured invoice can be saved and submitted in Simple
   mode with these fields reachable:
   - Customer.
   - Posting date.
   - Due date or payment terms.
   - Customer reference when available.
   - Preferred payment method.
   - Invoice lines.
3. Keep specialist fields in expandable sections unless the site's configuration
   makes one required:
   - Shipping and delivery.
   - Warehouse and inventory options.
   - Accounting dimensions.
   - Discounts and taxes.
   - Terms and notes.
   - Attachments.
   - Electronic-invoice details.
4. Verify the line editor at desktop and mobile widths. On mobile, use a deliberate
   reduced-column or card layout; do not squeeze the full desktop table.
5. Keep the completion action reachable on mobile.
6. Show validation beside the relevant field or line where native validation
   supplies enough information. Do not replace native validation rules.
7. Keep the current post-submit native Payment Entry handoff for MVP. Add inline
   amount/date/reference collection only if the release scenario proves that the
   mapped Payment Entry cannot support the cash-sale workflow safely.

**Primary files:**

- `bunood_theme/public/js/sales_bill.js`
- `bunood_theme/public/js/simple_forms.js`
- `bunood_theme/public/scss/surfaces/_sales_bill.scss`
- `tests/sales_bill.test.cjs`
- `tests/simple_forms.test.cjs`

**Definition of done:**

- A user can enter three normal items with the keyboard, save, submit, and continue
  to payment without opening Advanced mode.
- Save/Submit/Record payment remains reachable while scrolling.
- Only one primary action is shown for the current state.
- Long Arabic and English descriptions do not overlap monetary columns.
- No page-level horizontal overflow appears at supported widths.
- Switching Simple/Advanced keeps the same native document and unsaved values.

### Work Package 3 — Customer-facing document family acceptance

**Goal:** ship a consistent and trustworthy sales document set.

**Required output family:**

1. Quotation A4.
2. Tax Sales Invoice A4.
3. Simplified Sales Invoice A4.
4. Tax Sales Invoice thermal 80 mm.
5. Simplified Sales Invoice thermal 80 mm.
6. Payment receipt.
7. Customer statement.

**Change:**

1. Standardize this hierarchy on every applicable output:
   - Logo and company identity.
   - Document title.
   - Document number and dates.
   - Seller information.
   - Customer information.
   - Items or transactions.
   - Subtotal, discount, VAT, total, paid, and balance where applicable.
   - Payment or bank instructions where applicable.
   - QR code where required.
   - Terms and notes.
   - Footer and page number where the paper size permits it.
2. Keep Arabic output fully RTL and English output fully LTR.
3. Test long names, long descriptions, multipage A4 output, discounts, zero tax,
   normal tax, partial payment, negative/return values, and large totals.
4. Verify that table headers repeat on later A4 pages and totals do not become
   orphaned.
5. Print at least one real A4 invoice and one real 80 mm invoice. Scan the printed QR
   codes where required.
6. Compare browser preview, downloaded PDF, and physical print for the same document.

**Primary files:**

- `bunood_theme/printing/formats/quotation_a4.html`
- `bunood_theme/printing/formats/sales_invoice_tax_a4.html`
- `bunood_theme/printing/formats/sales_invoice_simplified_a4.html`
- `bunood_theme/printing/formats/sales_invoice_tax_thermal.html`
- `bunood_theme/printing/formats/sales_invoice_simplified_thermal.html`
- `bunood_theme/printing/formats/payment_entry_voucher.html`
- `bunood_theme/printing/formats/customer_statement.html`
- `bunood_theme/printing/install.py`
- `tests/test_print_engine.py`
- `tests/test_setup_completion.py`

**Definition of done:**

- All seven document types render without clipping, overlap, missing totals, mixed
  language, or broken page flow.
- Monetary values align and remain legible in grayscale.
- A4 and thermal invoices print at the intended physical scale.
- Required QR codes scan from paper.
- Preview, PDF, and physical output agree on document identity, customer, items,
  totals, language, and status.

### Work Package 4 — Bilingual and responsive release sweep

**Goal:** ensure that the product being sold is coherent on the actual supported
routes, languages, and sizes.

**Change:**

1. Run the release scenario in Arabic and English.
2. Test wide desktop, a medium desktop/tablet width, and a mobile width.
3. Fix only defects found in the scoped sales flow, standardized shell, dashboards,
   lists, and print outputs.
4. Verify logical RTL placement for sidebar controls, arrows, action menus, status
   badges, numeric fields, and print output.
5. Complete missing translations found during the sweep. Do not add duplicate
   translations for strings already inherited from Frappe or ERPNext.

**Definition of done:**

- No duplicate top bar, lower navigation bar, sidebar, or brand block appears.
- The real-estate workspace does not replace or hijack the sales workflow routes.
- No controls are clipped, hidden behind fixed chrome, or unreachable by keyboard.
- Arabic and English expose the same operations and native document state.
- The browser console has no new Bunood errors on the tested routes.

### Work Package 5 — Production gate and evidence

**Goal:** release based on visible proof, not only source changes.

**Change:**

1. Run the automated gates in section 7.
2. Deploy the built working tree to `rc20.localhost`.
3. Run the scenario in section 8 using fresh records.
4. Record:
   - Bunood package version.
   - Commit and dirty-tree state.
   - Built CSS and JavaScript hashes.
   - Test results.
   - Browser widths and languages checked.
   - PDF samples checked.
   - Physical A4 and thermal results.
   - Known non-blocking defects.
5. Do not claim production readiness until all launch blockers in section 9 are
   absent.

## 6. What not to change

These constraints are part of the product, not optional implementation advice:

- Do not replace ERPNext accounting, stock, tax, naming, permissions, validation,
  mapping, payment, submit, or cancel logic.
- Do not create client-only payment, invoice, quotation, or stock records.
- Do not create another sidebar, top bar, mobile navigation system, or route-specific
  shell.
- Do not redesign Advanced mode.
- Do not replace Frappe link fields, Item Quick Entry, child-table operations, or
  native confirmation dialogs.
- Do not hide a required writable field in Simple mode.
- Do not make the draft summary pretend to be the exact PDF.
- Do not build a dashboard designer, print-template designer, customer portal,
  recommendation engine, or new role framework before launch.
- Do not broaden this work into accounting, inventory, manufacturing, HR, payroll,
  CRM, real estate, or other module functionality.
- Do not perform broad cleanup in the dirty working tree.

## 7. Verification commands

Run commands from the repository root.

Before editing an overlapping file:

```powershell
git status --short
git diff -- <path-to-file>
```

Focused sales presentation tests:

```powershell
node --check bunood_theme/public/js/document_actions.js
node --check bunood_theme/public/js/simple_forms.js
node --check bunood_theme/public/js/sales_bill.js
node --test tests/document_actions.test.cjs tests/simple_forms.test.cjs tests/sales_bill.test.cjs
```

Shell, dashboard, and route regressions:

```powershell
node --test tests/sidebar-rebuild.test.cjs
node --test tests/home-entry-regression.test.mjs
node --test tests/onboarding_layout.test.cjs
```

Print and setup verification:

```powershell
python -m pytest tests/test_print_engine.py tests/test_setup_completion.py -q
```

Production build and diff hygiene:

```powershell
npm run build
git diff --check
```

Deploy the already-built working tree:

```powershell
wsl bash -lc 'cd "/mnt/c/Users/abdul/Documents/Codex/2026-09-05/loc-2/work/baseline-20260909/theme" && BND_SITE=rc20.localhost BND_BACKEND=bunoodrc20-backend-1 BND_FRONTEND=bunoodrc20-frontend-1 BND_STACK_PREFIX=bunoodrc20 BND_URL=http://127.0.0.1:8088 bash tools/deploy.sh --no-build'
```

The optional WSL source mirror may report that it is stale. The repository above,
the Docker deployment, and the served asset hashes are authoritative. Never copy the
stale mirror back over this working tree.

## 8. Final production acceptance scenario

Run this scenario once in English and once in Arabic:

1. Open the selling workspace from the standardized sidebar.
2. Create or select a customer.
3. Create or select a stock item through the native control.
4. Create a quotation with at least two lines, a discount, and tax.
5. Save and submit the quotation.
6. Convert the quotation to a Sales Invoice using the native mapped action.
7. Add a third line with the keyboard and duplicate one line.
8. Confirm subtotal, discount, tax, total, paid, and outstanding values.
9. Open A4 preview and verify the customer-facing hierarchy.
10. Submit the Sales Invoice.
11. Create a full or partial native Payment Entry from the invoice.
12. Confirm the invoice outstanding amount reconciles with the payment.
13. Print the Payment Entry receipt.
14. Open and print the Customer Statement.
15. Open each relevant dashboard card and list preset and confirm its visible native
    filter.
16. Repeat the visual checks at medium and mobile widths.
17. Print one A4 and one thermal invoice and scan required QR codes.

The scenario passes only if the same native documents remain correct in Advanced
mode and no Bunood-only state conflicts with ERPNext.

## 9. Launch blockers

Do not release while any of these conditions exists:

- A normal invoice cannot be saved or submitted from Simple mode.
- A required field is hidden with no reachable control.
- Quotation conversion or Payment Entry mapping bypasses the native ERPNext mapper.
- Totals shown by Bunood disagree with the native document.
- Dashboard cards or list presets route to the wrong data.
- Arabic and English expose different business actions.
- A4 or thermal output clips identity, items, totals, VAT, or required QR data.
- A required physical QR code does not scan.
- Submitted records expose draft-only deletion or editing.
- The standardized top bar or sidebar is duplicated, hidden, or replaced on a scoped
  route.
- Automated gates fail or the release candidate does not serve the newly built
  asset hashes.

## 10. Post-launch work while selling

These are valuable improvements, but they must not delay the MVP once section 9 is
clear:

1. Add customer balance, overdue count, previous invoice, and statement shortcuts to
   the context rail through an existing authoritative API.
2. Add an inline print-format and language selector backed by the production print
   renderer.
3. Add recent customers/items prioritization if it can use existing data without a
   new store.
4. Add customer-specific default print format and language.
5. Add scheduled statements and payment reminders.
6. Expand role-specific dashboard presets only after real customer behavior is
   observed.
7. Add workflow analytics for drop-off and time-to-invoice using privacy-safe events.

## 11. Research decisions already incorporated

The research is a decision input, not a request to copy another product.

| Research pattern | Bunood decision |
|---|---|
| Odoo's visible document lifecycle | Show one native state badge and one state-dependent primary action |
| Business Central's task pages and fact boxes | Keep invoice work central and place customer/preview context in the responsive rail |
| NetSuite and SAP role workspaces | Make dashboard cards actionable and route to filtered native work lists |
| QuickBooks and Zoho invoice flows | Keep common fields visible, defer specialist fields, and make completion actions obvious |
| Wafeq's regional presentation | Treat Arabic, VAT, A4, thermal, and QR output as launch requirements, not decorative polish |
| Mature ERP document output | Use one consistent hierarchy across quotation, invoice, receipt, and statement |

## 12. Definition of MVP complete

The presentation and invoice MVP is complete when:

- All five work packages in section 5 meet their definitions of done.
- The final scenario in section 8 passes in Arabic and English.
- No launch blocker in section 9 remains.
- Automated tests and the production build pass.
- The release candidate serves the recorded new asset hashes.
- A4 and thermal physical output have been checked and required QR codes scan.
- The release evidence and any non-blocking post-launch defects are recorded.

At that point, stop adding pre-launch features. Release the MVP, collect customer
feedback, and execute section 10 from observed usage rather than assumption.
