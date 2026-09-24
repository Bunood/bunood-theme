# Bunood Production MVP Implementation Handoff

> **Superseded:** use
> `docs/BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md` for the
> current version, verified print evidence, remaining launch blockers, and exact
> execution order.

**Document date:** 19 September 2026  
**Audience:** the implementation agent continuing the production MVP  
**Repository:** `C:\Users\abdul\Documents\Codex\2026-09-05\loc-2\work\baseline-20260909\theme`  
**Branch:** `production/theme-v0.46.7`  
**Recorded HEAD:** `18209bd`  
**Release candidate:** `http://127.0.0.1:8088`  
**Frappe site:** `rc20.localhost`  
**Bunood package version:** `0.46.9`

## Production Goal

Ship a sellable Bunood MVP as quickly as possible by finishing only the presentation, invoice workflow, sales document, Arabic and English, responsive, and release-verification work described here. ERPNext already provides the business engine. The remaining work is to make that engine organized, fast to operate, coherent in both languages, and professional in customer-facing output.

The MVP is ready to sell only when the scoped quote-to-cash flow works in Arabic and English, the A4 and thermal documents pass print checks, the standardized shell remains intact, all launch tests pass, and the release candidate serves the newly built assets.

## Current Decision

Do not restart completed work. The dashboard and list-preset package is complete and live-verified. Continue with invoice-page acceptance, customer-document acceptance, the bilingual responsive sweep, and the release gate in that order.

The current working tree contains extensive intentional changes. Preserve them. Never use a destructive Git cleanup or broad formatter.

## Exact Starting Point

Start with **Work Package 2 — Invoice Page Launch Acceptance**.

Use the deployed release candidate to run the normal invoice flow in Simple mode at desktop and mobile widths, first in Arabic and then in English. Change code only when a launch criterion fails. Preserve native ERPNext fields, totals, permissions, save, submit, mapping, and Payment Entry behavior. Do not rebuild the invoice workbench or the completed list/dashboard package.

## Status Summary

| Work area | Current status | Evidence | Required next action |
| --- | --- | --- | --- |
| Standardized top bar and sidebar | Complete and already live on covered Desk surfaces | Existing shell regressions and prior live checks | Preserve; fix only a demonstrated regression |
| Invoice workbench and native line entry | Complete for the current implementation | Direct line editing, Item Quick Entry, keyboard movement, row duplication, native totals, responsive context rail | Run final desktop and mobile acceptance; do not rebuild |
| Shared document states and actions | Complete and live | Sales Invoice, Quotation, and Payment Entry use one native state badge, one primary action, and an overflow | Keep tests green; change only for a proven defect |
| Dashboard and list presets | Complete and live | Arabic and English Sales Invoice and Quotation presets applied native filters; Home queues opened the correct filtered lists; zero new console errors | Preserve; fix only a demonstrated regression |
| Customer-facing print family | Formats exist; full acceptance is incomplete | Quotation A4, invoice A4 and thermal, payment receipt, and customer statement files are present | Render, compare, print, and scan required QR codes |
| Arabic and responsive release sweep | Incomplete | Core strings and layouts exist | Run the complete scenario in both languages and all supported widths |
| Production evidence | In progress | Current assets are CSS `bunood.4be85fc8.css` and JavaScript `bunood.9a4b3c58.js`; current focused suites and live list checks are recorded | Add invoice, responsive, PDF, physical-print, QR-scan, and full-scenario evidence |

## Work Completed and Protected

### Standard Shell

- One canonical top bar and one standardized sidebar are the required shell.
- The home, sales, real-estate, list, and form routes must not introduce duplicate navigation or duplicate branding.
- Sidebar expansion, collapse, hover behavior, RTL direction, mobile navigation, and top spacing have already received substantial work.
- Preserve the current architecture. A route-specific shell is not permitted.

### Invoice Workbench

- Simple mode uses the same native ERPNext document as Advanced mode.
- Invoice lines support direct first-line editing, native Item Quick Entry, keyboard movement, row duplication, and an always-ready blank row.
- Native subtotal, tax, discount, rounding, grand total, paid, and outstanding values remain authoritative.
- The responsive customer and preview rail uses a wide editor on desktop and a labelled drawer below 960 px.
- The draft preview is a summary. It must not be presented as the exact final PDF.
- The payment-received-now option hands off to a native mapped Payment Entry after invoice submission.
- Quotation conversion uses ERPNext's native mapping to Sales Invoice.

### Shared States and Actions

- `bunood_theme/public/js/document_actions.js` owns the shared permission-aware state and action contract.
- Sales Invoice shows one primary Record payment action when appropriate.
- Quotation shows one primary Create Sales Invoice action when appropriate.
- Payment Entry shows one primary Print action when submitted.
- Secondary actions remain in the shared overflow.
- Do not rebuild this contract unless a failing test or live regression proves a defect.

### Print Formats

The following managed formats exist and must be accepted as one document family:

1. Quotation A4.
2. Tax Sales Invoice A4.
3. Simplified Sales Invoice A4.
4. Tax Sales Invoice thermal 80 mm.
5. Simplified Sales Invoice thermal 80 mm.
6. Payment receipt.
7. Customer statement.

Continue with verification and targeted corrections. Do not create another print system.

## Current Dashboard and List Preset Slice

### Changes Already Written

- Added `bunood_theme/public/js/list_presets.js` as the shared native-list preset controller.
- Added `bunood_theme/public/js/quotation_list.js` for Quotation registration.
- Registered Sales Invoice with the shared presets while retaining its existing priority columns.
- Added the Quotation list hook in `bunood_theme/hooks.py`.
- Added `list_presets.js` to the Desk build sources in `build.mjs`.
- Added Home dashboard labels and icons for quotation drafts, payment drafts, and open quotations.
- Expanded `get_home_dashboard` with permission-filtered Quotation and Payment Entry queues.
- Added the visible preset strip styles to `bunood_theme/public/scss/surfaces/_list.scss`.
- Added Arabic translations for the new preset and dashboard labels.
- Added `tests/list_presets.test.cjs` and expanded list and Home regressions.

### Intended Presets

Sales Invoice presets:

- Draft.
- Unpaid.
- Partially paid.
- Overdue.
- Paid.
- This month.

Quotation presets:

- Draft.
- Awaiting response.
- Expiring soon.
- Converted.
- Lost.

The controller uses only native Frappe filter-area operations and one native list refresh. It does not copy records or create a Bunood data store.

### Verification Completed

The following focused command passed 28 of 28 tests after the slice was written:

```powershell
node --test tests/list_presets.test.cjs tests/invoice_list.test.cjs tests/home-entry-regression.test.mjs
```

JavaScript syntax checks also passed for `document_actions.js`, `list_presets.js`, `quotation_list.js`, `sales_invoice_list.js`, and `simple_forms.js`.

The existing sales and shell suites passed 127 of 127 tests. Print and setup tests passed 9 of 9. `npm run build` and `git diff --check` passed. The build was deployed to `rc20.localhost`, which serves CSS `bunood.4be85fc8.css` and JavaScript `bunood.9a4b3c58.js`.

Live browser acceptance passed in Arabic and English:

1. Sales Invoice **Overdue** applied the intended native filters.
2. Quotation **Converted** applied the intended native filters.
3. **All** cleared the preset filters and restored the ordinary list.
4. Home open quotations opened the correct native filtered Quotation list.
5. Home overdue receivables opened the correct native filtered Sales Invoice list with three visible filters.
6. No tested action opened the generic Home dashboard or a wrong workspace.
7. The browser reported zero new console errors.

## Immediate Execution Checklist

1. Run Work Package 2 invoice-page launch acceptance in Arabic and English.
2. Verify desktop and mobile line entry, action reachability, required fields, totals, Simple/Advanced preservation, and native payment handoff.
3. Fix only demonstrated launch defects and rerun the related focused suites.
4. Continue to Work Package 3 only after the invoice acceptance definition of done is satisfied.

## Remaining Work Packages

### Work Package 2 Invoice Page Launch Acceptance

Goal: prove that a normal invoice can be completed quickly in Simple mode without weakening ERPNext.

Change only if a criterion fails:

- Keep document status, unsaved state, and the current primary action reachable while a long invoice scrolls.
- Make Customer, posting date, due date or terms, customer reference when available, preferred payment method, and invoice lines reachable in Simple mode.
- Keep specialist fields in expandable sections unless site configuration makes a field mandatory.
- Verify desktop and mobile line entry. Mobile must use a deliberate reduced-column or card layout rather than a squeezed desktop table.
- Keep the completion action reachable on mobile.
- Place validation beside the relevant field or line when native validation supplies enough detail.
- Retain the native Payment Entry handoff unless the release scenario proves it cannot safely support the cash-sale workflow.

Definition of done:

- Three normal items can be entered with the keyboard, saved, submitted, and continued to payment without opening Advanced mode.
- Save, Submit, and Record payment remain reachable while scrolling.
- Only one primary action is visible for the current state.
- Long Arabic and English descriptions do not overlap monetary columns.
- No page-level horizontal overflow appears at supported widths.
- Switching between Simple and Advanced mode preserves the native document and unsaved values.

### Work Package 3 Customer Document Acceptance

Goal: ship a consistent and trustworthy sales document family.

Use the same hierarchy on every applicable output: company identity, document title, number and dates, seller, customer, items or transactions, subtotal, discount, VAT, total, paid, balance, payment or bank instructions, required QR code, terms, notes, and footer or page number where the paper size permits.

Verify fully RTL Arabic output and fully LTR English output. Test long names and descriptions, multipage A4 output, discounts, zero tax, normal tax, partial payment, negative or return values, and large totals. Repeat table headers on later A4 pages and keep totals with their related rows.

The package is not accepted until one real A4 invoice and one real 80 mm invoice have been printed, required QR codes have been scanned from paper, and browser preview, downloaded PDF, and physical output agree on identity, customer, items, totals, language, and status.

### Work Package 4 Bilingual and Responsive Sweep

Goal: confirm the scoped product is coherent in the actual languages, routes, and sizes that will be sold.

- Run the complete release scenario in Arabic and English.
- Test wide desktop, medium desktop or tablet, and mobile widths.
- Fix only defects found in the scoped sales flow, standardized shell, dashboards, lists, and print outputs.
- Confirm logical RTL placement for sidebar controls, arrows, action menus, state badges, numeric fields, and print output.
- Add only missing translations. Do not duplicate strings inherited from Frappe or ERPNext.

### Work Package 5 Production Gate

Goal: release from visible proof rather than source changes alone.

- Run all automated gates.
- Deploy the built working tree to the release candidate.
- Execute the complete acceptance scenario with fresh records.
- Record package version, commit and dirty-tree state, built asset hashes, test results, widths, languages, PDFs, physical prints, and non-blocking defects.
- Do not declare production readiness while a launch blocker remains.

## Required Acceptance Scenario

Run this once in English and once in Arabic.

1. Open Selling from the standardized sidebar.
2. Create or select a customer.
3. Create or select a stock item through the native control.
4. Create a quotation with at least two lines, a discount, and tax.
5. Save and submit the quotation.
6. Convert it to a Sales Invoice through the native mapped action.
7. Add a third line with the keyboard and duplicate one line.
8. Confirm subtotal, discount, tax, total, paid, and outstanding values.
9. Open A4 preview and verify the customer-facing hierarchy.
10. Submit the Sales Invoice.
11. Create a full or partial native Payment Entry from the invoice.
12. Confirm that invoice outstanding reconciles with the payment.
13. Print the Payment Entry receipt.
14. Open and print the Customer Statement.
15. Open every relevant dashboard row and list preset and confirm its visible native filter.
16. Repeat the visual checks at medium and mobile widths.
17. Print one A4 invoice and one thermal invoice and scan required QR codes.

The scenario passes only when the same native documents remain correct in Advanced mode and no Bunood-only state conflicts with ERPNext.

## Launch Blockers

Do not release if any item below is true.

- A normal invoice cannot be saved or submitted from Simple mode.
- A required field is hidden with no reachable control.
- Quotation conversion or Payment Entry creation bypasses the native ERPNext mapper.
- A Bunood total disagrees with the native document.
- A dashboard row or list preset opens the wrong data.
- Arabic and English expose different business actions.
- A4 or thermal output clips identity, items, totals, VAT, or required QR data.
- A required physical QR code does not scan.
- Submitted records expose draft-only deletion or editing.
- The standardized top bar or sidebar is duplicated, hidden, or replaced on a scoped route.
- Automated gates fail.
- The release candidate does not serve the newly built asset hashes.

## What Must Not Change

- Do not replace ERPNext accounting, stock, tax, naming, permissions, validation, mapping, payment, save, submit, or cancel behavior.
- Do not create client-only invoices, quotations, payments, or stock records.
- Do not create another top bar, sidebar, mobile navigation system, or route-specific shell.
- Do not redesign Advanced mode.
- Do not replace native link fields, Item Quick Entry, child-table operations, confirmation dialogs, or filter areas.
- Do not hide a required writable field in Simple mode.
- Do not label the draft summary as the exact PDF.
- Do not add a dashboard designer, print designer, customer portal, recommendation engine, or new role framework before launch.
- Do not broaden this work into accounting, inventory, manufacturing, HR, payroll, CRM, real estate, or other module functionality.
- Do not perform broad cleanup in the dirty working tree.

## Working Tree Safety

The repository contains intentional modified and untracked files across the shell, invoice workbench, print formats, translations, tests, and built assets. Before editing an overlapping file, run:

```powershell
git status --short
git diff -- <path-to-file>
```

Never run:

```text
git reset --hard
git checkout -- <path>
git clean
```

Do not copy the optional stale WSL source mirror over this repository. The repository path in this document, the Docker deployment, and the served asset hashes are authoritative.

## Verification Commands

Run from the repository root.

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

python -m pytest tests/test_print_engine.py tests/test_setup_completion.py -q

npm run build
git diff --check
```

Deploy the built working tree:

```powershell
wsl bash -lc 'cd "/mnt/c/Users/abdul/Documents/Codex/2026-09-05/loc-2/work/baseline-20260909/theme" && BND_SITE=rc20.localhost BND_BACKEND=bunoodrc20-backend-1 BND_FRONTEND=bunoodrc20-frontend-1 BND_STACK_PREFIX=bunoodrc20 BND_URL=http://127.0.0.1:8088 bash tools/deploy.sh --no-build'
```

## Important File Map

| Responsibility | Primary files |
| --- | --- |
| Shared document states and actions | `bunood_theme/public/js/document_actions.js` |
| Sales Invoice list columns and presets | `bunood_theme/public/js/sales_invoice_list.js` |
| Quotation list presets | `bunood_theme/public/js/quotation_list.js` |
| Shared list preset controller | `bunood_theme/public/js/list_presets.js` |
| Home dashboard rendering and routes | `bunood_theme/public/js/bunood.js` |
| Home dashboard data | `bunood_theme/api.py` |
| Desk build entry | `build.mjs` |
| List preset styling | `bunood_theme/public/scss/surfaces/_list.scss` |
| Invoice workbench | `bunood_theme/public/js/sales_bill.js` and `bunood_theme/public/scss/surfaces/_sales_bill.scss` |
| Simple and Advanced mode integration | `bunood_theme/public/js/simple_forms.js` |
| Arabic strings | `bunood_theme/translations/ar.csv` and `bunood_theme/locale/ar.po` |
| Print formats and installation | `bunood_theme/printing/formats/` and `bunood_theme/printing/install.py` |
| List and dashboard tests | `tests/list_presets.test.cjs`, `tests/invoice_list.test.cjs`, `tests/home-entry-regression.test.mjs` |
| Sales and shell tests | `tests/document_actions.test.cjs`, `tests/simple_forms.test.cjs`, `tests/sales_bill.test.cjs`, `tests/sidebar-rebuild.test.cjs` |
| Print and setup tests | `tests/test_print_engine.py` and `tests/test_setup_completion.py` |

## Current Build Information

The current deployed release-candidate assets are:

- CSS `bunood.4be85fc8.css`.
- JavaScript `bunood.9a4b3c58.js`.

These hashes were served successfully by `http://127.0.0.1:8088` after the dashboard and list-preset deployment on 2026-09-19.

## Research Decisions That Define the Scope

- Use a visible native document lifecycle with one current primary action.
- Keep invoice work central and customer or preview context in the responsive rail.
- Turn dashboard metrics into native filtered work queues.
- Keep common invoice fields visible and defer specialist fields.
- Treat Arabic, VAT, A4, thermal, and QR output as release requirements.
- Use one information hierarchy across quotation, invoice, receipt, and statement.
- Apply these patterns to Bunood's existing ERPNext foundation. Do not copy another ERP's architecture or visual identity.

## Post Launch Backlog

Do not delay the MVP for these improvements after all launch blockers are clear:

- Customer balance, overdue count, previous invoice, and statement shortcuts in the context rail.
- Inline print-format and language selection backed by the production renderer.
- Recent customer and item prioritization using existing data.
- Customer-specific default print format and language.
- Scheduled statements and payment reminders.
- Role-specific dashboard presets based on observed customer behavior.
- Privacy-safe workflow analytics for drop-off and time to invoice.

## Definition of MVP Complete

The MVP is complete only when all five work packages meet their definitions of done, the acceptance scenario passes in Arabic and English, no launch blocker remains, all automated tests and the production build pass, the release candidate serves the recorded new asset hashes, and physical A4 and thermal output have been checked with required QR codes scanned.

When those conditions are met, stop adding pre-launch features. Release the MVP, collect customer feedback, and continue only the post-launch backlog supported by real usage.
