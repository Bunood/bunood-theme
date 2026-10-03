# Report Studio and accountant workflow audit — 27 September 2026

Scope: the isolated 8100 pilot, its Reports landing, all 21 Report Studio views, the three Bunood finance workspaces, and the 11 native accounting list/tree destinations an accountant reaches from them. Native document **forms** are follow-up work, not claimed to have received a full visual redesign. The original local server is outside this change.

## Evidence and limits

- An authenticated Arabic/RTL desktop and narrow-screen browser gate opened all **21** installed Studio routes. Each completed to a table or honest empty state, with controls/actions, no horizontal overflow, an accessibility scan, and working print, presentation and Excel controls. The live data-parity gate matched Studio/native registers and the VAT-ledger result for 1–30 September 2026. These gates establish route and data behavior, **not** that every report is convenient for every accountant task.
- The Statement of Account picker was inspected in a 1440px desktop screenshot and a 390px mobile screenshot. Its search field was stretched by the shared `flex-basis: 12rem` rule inside a column. The updated field measures 44px on both sizes; picker search, type state and accessibility pass.
- Three finance workspaces were opened in the pilot. Their APIs returned native evidence and denied Guest. Before this pass, Finance and Close and Journal Workbench could display an empty content region under populated filters. A live browser trace found the actual cause of a stuck first load: `frappe.call()` returned a promise-like object without `.finally()`, so the request succeeded but the loading state never cleared. The request is now normalized to a native Promise and the company default is awaited; a visible first-use state covers the interim.
- Eleven native accountant list/tree routes were opened read-only in an Administrator desktop session: Sales Invoice, Purchase Invoice, Payment Entry, Journal Entry, GL Entry, Bank Transaction, Bank Account, Account tree, Accounting Period, Period Closing Voucher, and POS Invoice. Each route showed content with no horizontal overflow. This checks **navigation and first-screen usefulness**, not the detailed form fields, role-specific access, or transaction submission.
- A read-only role probe used **one existing, multi-role user per named role**. General Ledger, Receivables, Payables and Trial Balance ran. VAT Summary was listed, but execution failed because the user lacked **POS Invoice** read permission. The probe is evidence of a reachable failure, **not** proof that every member of those roles has identical access. All sampled users had additional roles; a dedicated least-privilege test account is needed before release.
- Report Studio currently offers company and time controls; advanced native report filters are not reproduced generically. The finance workbench already warns that figures must be compared using the same company, dates, currency, Finance Book and dimensions. That parity is not enforced by Studio today.

## Accountant walk-through

An accountant starts at Reports, checks this month's Sales Register, reviews an invoice, checks whether the customer balance appears in Receivables, follows payment to the General Ledger, reconciles its bank transaction, checks VAT, then prepares period close. The current visual journey is attractive enough to find a report, but the handoff loses context: each page asks for company/time again, and the Studio's compact filters cannot express several native accounting dimensions. The accountant must know when to switch to Classic view; it is currently a quiet utility link rather than an explicit scope boundary. A report that is visible but cannot run is worse than an unavailable report because it appears to promise evidence it cannot deliver.

The design direction is an **accountant's workroom**, not another dashboard of decorative cards: one compact scope ribbon, a table-first document surface, clear source/provenance and exception labels, and one primary next action per task. RTL alignment, visible focus, numeric alignment and export scope should match the same mental model in English and Arabic. As-of reports must never imply that their start date affects the result.

## Page-by-page Studio review

Each row below passed the authenticated Administrator route-load gate unless noted. “Next change” is a proposed accountant UX/workflow change, not a claim that its underlying financial calculation is wrong.

| Page | Accountant question | Next change / risk |
| --- | --- | --- |
| Sales Register | What did we invoice and leave unpaid? | Keep document number, customer, tax, total and outstanding together; make the invoice number a direct drill-down and expose the exact applied scope beside export. |
| Item-wise Sales Register | What products and quantities were sold? | Present quantity with UOM and amount in a stable, sortable row; link the invoice without losing filters. |
| Gross Profit | Which sales earned or lost margin? | Explain the cost/valuation basis and negative-margin treatment before the chart; offer invoice/item drill-down. |
| Sales & Returns | What is gross, returned and net? | Keep the current split but add an explicit return sign legend and source-document link to prevent negative totals being mistaken for errors. |
| Sales Order Analysis | What remains to deliver or bill? | Prioritize pending quantity/value and direct navigation to the open order rather than emphasizing a chart. |
| Sales Person-wise Transaction Summary | Which salesperson owns the result? | Clarify salesperson assignment and the selected document type; verify role-limited visibility in a single-role account. |
| Territory-wise Sales | Which territory produced the pipeline? | Label whether values are opportunity, quotation or order amounts and give a source-list handoff. |
| Purchase Register | What did suppliers bill us? | Keep supplier invoice number, due/outstanding and ERPNext document ID distinct; link the payable document. |
| Item-wise Purchase Register | What was bought and at what effective rate? | Show quantity/UOM/rate/amount as a compact numeric ledger with supplier/invoice context. |
| Purchases & Returns | What is net spend after returns? | State return sign convention and link the debit note/source purchase invoice. |
| Purchase Order Analysis | What is ordered, received and billed? | Surface the largest unmatched receipt/bill gaps as actions, not just metrics. |
| Procurement Tracker | Where is the request-to-receipt chain blocked? | Make each chain step a source-document link and mark missing handoffs explicitly. |
| Supplier Ledger Summary | How did supplier balances move? | Add a consistent opening/movement/closing explanation and same-scope drill-through to Payables/GL. |
| Statement of Account | Whose ledger do I need? | **Updated now:** compact picker, company selector before party, name/ID search, cash/bank shortcuts, visible loading/error state and accessible type selection. Period and result actions appear after selection, keeping the primary search above the fold on phones. Next: add a clear source-voucher drill-down in the statement. |
| VAT Return | What can be prepared for filing? | **Access blocker:** report is listed for sampled accountant roles but fails on POS Invoice read. Do not broaden access blindly; decide a scoped read role or a permission-preserving VAT aggregation endpoint, then test least privilege. Keep “worksheet, not filing” and unclassified/reconciliation exceptions prominent. |
| General Ledger | What posted and from which document? | Pin posting date, voucher type/number, source statement, debit, credit and running balance; click through to the native voucher. Add Finance Book/dimension parity before comparison. |
| Accounts Receivable | What is owed as of today and overdue? | **Updated now:** screen/print/Excel/custom date consistently say **As of**; only the end date is queried. Next: age bucket totals, customer drill-down, and collection handoff. |
| Accounts Payable | What must we pay and when? | Same as-of correction. Next: due-date priority and payment handoff without losing supplier/company context. |
| Trial Balance | Do opening and closing debits/credits balance? | Show the difference as a prominent assertion and retain fiscal year/period-closing choices visibly in the export scope. |
| Profit and Loss Statement | What drove profit in the selected period? | Preserve hierarchy and compare like-for-like periods; make Finance Book, currency and dimensions explicit before comparison/export. |
| Balance Sheet | What is the position at the boundary? | Treat the date as a position, not a sales trend; flag out-of-balance totals and show closing-entry assumptions in the scope. |

## Finance pages and native handoffs

| Page | Observed condition | Update |
| --- | --- | --- |
| Reports landing | Direct cards reach Studio, VAT, Statement, Close, Journals and Banking; optional links are asset/permission guarded. | Organize by tasks (collect, pay, reconcile, close) and retain the native report link as an advanced route. Search should name the underlying report, not only a marketing description. |
| Finance and Close | API is read-only and Guest-denied; a successful first request could leave the page permanently loading because of an incompatible `.finally()` call. | **Updated now:** working first load and first-use guidance. Next: status hierarchy (blocker → evidence → next action), same-scope report links and explicit reviewer sign-off outside Bunood's informational surface. |
| Journal Workbench | API is read-only and Guest-denied; draft queue and native Journal Entry handoffs exist. It shared the same request-finalization defect. | **Updated now:** working first load and first-use guidance. Next: show draft imbalance, source/reference and missing evidence before “new journal”; preserve native submit/approval. |
| Bank Reconciliation | API is read-only and Guest-denied; requires a bank account and delegates matching to ERPNext. | Distinguish “no account selected,” “no imported statement” and “open unmatched items”; put Import and Match beside each other and retain a link to bank-only/book-only exceptions. |
| Native Sales/Purchase Invoice lists | Both list routes loaded with visible rows and a primary action. | Keep status, party, date, amount and outstanding prominent; test the full document forms separately. |
| Native Payment Entry list | Route loaded, but the first-screen columns emphasize party and technical debit/credit account labels. A visible filter still says “Payment Invoice” in English. | Add a human-readable origin/method column (at-invoice collection versus later receipt), voucher reference and payment method; translate the stray filter label. This directly addresses the previously reported payment-source confusion. |
| Native GL Entry list | Route loaded, but its title is mistranslated as **“GL الدخول”** and the initial columns do not show debit, credit or running balance. | Correct the Arabic label, show accounting amounts and source voucher by default, and link to the source document. Studio's General Ledger can remain the reading view; the native list is the audit trail. |
| Native Account tree | Route loaded with the company tree, but the canvas has large unused space and mixes Arabic headings with English account names. | Introduce a compact account/balance summary and a search or jump-to-account control. Do not translate company-owned account names automatically. |
| Native Journal Entry, Bank Transaction and Bank Account lists | All three loaded without overflow. | Make review state, source/reference and unmatched bank amount available in the first screen; audit each native form and approval action with an accountant role. |
| Native Accounting Period and Period Closing Voucher lists | Both control routes loaded. | Distinguish a posting restriction from a P&L transfer in list copy and close workflow; require reviewer evidence, not just a green count. |
| Native POS Invoice list | Route loaded as Administrator; a sampled accountant can see the VAT report card yet cannot read POS Invoice inside its query. | Resolve the VAT permission boundary before treating the worksheet as an accountant-accessible report. |

## Full update work order

| Priority | Work order | Acceptance / guardrail |
| --- | --- | --- |
| P0 | Resolve VAT report execution for accountant roles. Identify every source DocType read by VAT Summary, especially POS Invoice; decide least-privilege policy with finance owner. | Dedicated Accounts User/Manager accounts can run the report for an allowed company; a user without source permission neither sees restricted rows nor a misleading usable card. Guest remains denied. |
| P0 | Repair native accounting navigation language and first-screen evidence. | “GL Entry” has a natural Arabic label; GL defaults include debit/credit/source, Payment Entry shows collection origin and method, and no English filter labels leak into the Arabic payment page. These are presentation changes over native records, not replacement postings. |
| P0 | Make catalogue availability truthful. Distinguish not installed, role denied, and source-data denied; deep links must show a useful denial rather than a generic error. | Role matrix tests cover Studio cards, direct URLs, run, print/export and source drill-down; no access is inferred solely from `Report` list visibility. |
| P0 | Define a shared accounting scope contract. Company, actual date semantics, fiscal year, currency, Finance Book, cost center/project/dimensions and closing-entry options must be explicit where supported. | GL, Trial Balance, P&L, Balance Sheet, AR/AP and VAT compare to native results under identical filters. Unsupported filters remain in Classic view with a plainly worded handoff. |
| P1 | Build report-specific controls instead of a universal filter strip. Keep default view compact, reveal relevant advanced controls on demand. | As-of reports have one date; period reports have two; all exports/prints display the exact query scope. Filter changes re-run the same native report, without a second accounting engine. |
| P1 | Turn record cells into source paths. Source voucher, party, invoice and payment are readable links with return-to-report context. | Accountant can complete invoice → payment → GL → bank trace and return with company/time selection intact. Permission denial is handled in place. |
| P1 | Tighten results presentation. A ledger table is the primary object; KPIs summarize, charts follow. Use one vertical scroll owner, numeric alignment, sticky headers only where they help, and explicit loading/empty/error. | Arabic/English desktop and 390px mobile screenshots, keyboard/focus and screen-reader checks; no double vertical scrollbar or clipped controls. |
| P1 | Connect close, journal and bank workspaces into one task queue. | Each exception shows severity, source document, owner/next action and freshness; no “ready to close” claim is inferred from a bounded queue or missing permissions. |
| P2 | Saved report views and repeatability. | A saved view stores only filters/layout, is per-user and permission-rechecked; its export records company, scope and timestamp. Do not persist a second ledger. |
| P2 | Accountant UAT and security sign-off. | At least one single-role clerk, manager and auditor; representative multi-company data; native-vs-Studio parity, sensitive export checks, VAT exceptions, AR/AP ageing, bank-only/book-only items, and period close evidence. |

Recommended release order: **fix permission truth and scope first**, then drill-down/workflow and report-specific presentation, then saved views. The visual changes in this pass are confined to the 8100 pilot; they are not a declaration that the whole finance workflow is production-ready.

## Reference baseline

- [ERPNext Accounting Reports](https://docs.frappe.io/erpnext/accounting-reports) and [General Ledger](https://docs.frappe.io/erpnext/general-ledger): filters, report families and source-voucher tracing.
- [Frappe Users and Permissions](https://docs.frappe.io/framework/user/en/basics/users-and-permissions): report/page roles and export privileges are separate controls.
- [ERPNext Bank Reconciliation](https://docs.frappe.io/erpnext/bank-reconciliation) and [Payment Reconciliation](https://docs.frappe.io/erpnext/payment-reconciliation): bank-statement matching and allocating payments to invoices are different accountant jobs.
