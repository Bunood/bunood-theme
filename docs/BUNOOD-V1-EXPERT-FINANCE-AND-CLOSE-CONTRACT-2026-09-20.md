# Bunood V1 Expert Finance and Close Contract

**Document date:** 2026-09-20  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Work-order owners:** FIN-01 through FIN-10  
**Machine control register:** `quality/v1-finance-close-control-register.json`  
**Status:** product and operating requirements; not accounting advice, not a
financial-statement acceptance, and not evidence that a customer has completed an
accurate close

## 1. Decision

Bunood V1 will give a new clerk an understandable queue and an experienced
accountant the depth, traceability, density, controls and speed needed to close the
books. Both use the same ERPNext Company, source documents, Payment Ledger, Stock
Ledger and General Ledger. Simple and expert presentation must never become two
accounting systems.

Bunood does not choose an accounting policy, reporting framework, materiality,
closing account, depreciation method, exchange rate, tax treatment or journal on
the customer's behalf. Those decisions require the customer's authorised finance
owner and, where appropriate, a qualified Saudi accountant or auditor. A green UI
state means that the configured workflow step is satisfied; it never means that a
financial statement is audited or legally correct.

## 2. Authority and non-negotiable boundaries

1. Submitted native ERPNext source documents and generated ledgers remain the
   accounting authority. Bunood may orchestrate, explain, filter and reconcile them;
   it must not maintain a parallel balance or edit generated ledger rows.
2. Draft, submitted, cancelled and amended records remain distinct. A correction
   uses the supported cancel/amend, reversal, credit/debit-note or reconciliation
   path. A manual balancing entry is not an acceptable way to hide an unknown cause.
3. Company, Finance Book, account currency, presentation currency, fiscal period,
   cost centre and other accounting dimensions are part of every result's identity.
4. A close task is not complete because a checkbox was clicked. It requires the
   configured source report, cutoff, reconciliation result, preparer, reviewer,
   evidence, exceptions and approval.
5. The close template is configurable. The T+1 to T+5 model in this contract is a
   practical operating baseline, not a universal accounting rule.

The native behaviors below were verified against current official ERPNext
documentation on the document date:

- a [Period Closing Voucher](https://docs.frappe.io/erpnext/period-closing-voucher)
  transfers Profit and Loss balances to the selected equity/closing account; it
  does not itself stop backdated posting or close Balance Sheet accounts;
- an [Accounting Period](https://docs.frappe.io/erpnext/accounting-period) selectively
  blocks configured submittable document types in a completed range, while the
  frozen-accounts date provides a separate broader posting restriction;
- [Payment Reconciliation](https://docs.frappe.io/erpnext/payment-reconciliation)
  allocates an already-recorded payment or credit to invoices without creating a
  new bank movement, whereas
  [Bank Reconciliation](https://docs.frappe.io/erpnext/bank-reconciliation) matches
  bank-statement activity to book vouchers;
- [Exchange Rate Revaluation](https://docs.frappe.io/erpnext/exchange-rate-revaluation)
  changes the company-currency carrying value of qualifying open balances without
  changing their foreign-currency amount, and affects the ledger only through the
  reviewed and submitted resulting Journal Entry;
- [asset depreciation](https://docs.frappe.io/erpnext/asset-depreciation) follows the
  configured schedule and posts linked Journal Entries, while fixed-asset value is
  separate from stock valuation; and
- [deferred accounting](https://docs.frappe.io/erpnext/deferred-accounting) separates
  invoice timing from revenue or expense recognition and must reconcile the source
  row, deferred report and General Ledger.

For Saudi statutory reporting, configuration and review must follow the framework
selected by the qualified owner, including the IFRS Standards or IFRS for SMEs as
endorsed in the Kingdom where applicable. Bunood links to SOCPA's current
[endorsement material](https://www.socpa.org.sa/Socpa/Professional-standards/Accounting-standards/Auditing-Standards-Endorsed.aspx)
but does not infer the applicable framework from company size or industry.

## 3. Personas and progressive depth

| Persona | Default experience | Authority boundary |
|---|---|---|
| AP/AR clerk | Invoice, collection/payment, allocation, missing-document and ageing queues in plain language. | Cannot approve their own journals, reopen periods, alter policy or browse unrelated companies. |
| Staff accountant | Reconciliation workbench, schedules, draft adjustments, evidence and source drill-down. | Prepares but does not self-review controlled close work. |
| Senior accountant/controller | Material exceptions, policy-controlled journals, reconciliation review, close dependency and lock readiness. | Approval follows server workflow and segregation rules. |
| Finance manager/CFO | Close health, cash, working capital, statements, variance, risk, sign-off and governed reopen. | Summary never hides source filters or unresolved differences. |
| Auditor | Read-only source-to-report trace, versions, approvals, exceptions, access history and exported evidence. | Cannot post, reconcile, approve, unlock or alter evidence. |
| System administrator | Technical availability, jobs, permissions, backups and integration health. | Does not receive accounting approval merely by being Administrator. |

The role home starts with **work requiring attention**, then scheduled work,
reconciliations, review and reporting. Entry-level users see the next safe action and
its consequence. Experts can switch to compact, keyboard-first tables, saved views,
batch review, dimensions and full source trace without leaving the same record.

## 4. Finance workspace information architecture

The **Finance and close / المالية والإقفال** workspace has seven stable sections:

1. **Attention now:** blocked, at-risk and overdue close work; unexplained or aged
   differences; rejected approvals; failed scheduled accounting; stale exchange
   rates; draft generated journals; posting attempted in a closed period.
2. **Daily accounting:** unsubmitted or unmatched receipts/payments, AR/AP ageing,
   bank imports, cash/POS tender differences, stock valuation exceptions, assets,
   deferrals, accruals and approvals.
3. **Reconciliations:** source-to-ledger pairs, difference, age, owner, reviewer,
   materiality, evidence and resolution.
4. **Close calendar:** company, period, phase, dependency, due time, owner, reviewer,
   status and critical path.
5. **Adjustments:** templates, accruals, reversals, allocations, recurring journals,
   revaluation, depreciation and deferred-accounting runs.
6. **Statements and analysis:** governed Trial Balance, General Ledger, P&L,
   Balance Sheet, Cash Flow, AR/AP ageing, tax, budgets and comparative views.
7. **Evidence and controls:** sign-offs, locked periods, reopen decisions, late
   adjustments, metric history and candidate-bound close packets.

There is no generic “finance score.” Every status shows company, period, source,
owner, last refresh, cutoff and the exact condition. Unknown, stale, waiting,
blocked, at risk and complete remain visibly different.

### 4.1 Implemented FIN-08 evidence foundation

The first close product slice is implemented as the route-scoped
`bnd-finance-close` Page. Its permission-safe server context reads native Company,
draft Journal Entry/Sales Invoice/Purchase Invoice/Payment Entry, Accounting Period
and Period Closing Voucher records for one bounded period. The page presents current
attention, five deliberately non-approving evidence stages, separately described
frozen-date/Accounting-Period/closing-voucher controls, and direct native report and
document handoffs in Arabic and English.

This is a comprehension and preflight layer only. It does not post, reconcile,
approve, lock, reopen, relock, create a close task, or certify the books. A submitted
Period Closing Voucher without a native posting restriction remains `Review required`;
zero observed drafts remains `Not evaluated`; a query failure becomes `Evidence
incomplete`. The configurable close instance, owner/reviewer evidence, dependencies,
reconciliation records, soft-close decision, controlled reopen and immutable close
packet remain to be implemented and accepted.

### 4.2 Implemented FIN-02 journal foundation

The route-scoped `bnd-journal-workbench` Page now gives permitted accountants one
bounded Company/period view over native Journal Entry records. It distinguishes
unbalanced drafts, balanced drafts awaiting review, submitted, cancelled, reversal
and system-generated entries and preserves template, Auto Repeat, deferred-accounting
and reversal provenance. Recurring schedules are returned only after their source
Journal Entry is independently visible through the selected Company's permission-
filtered query. The page also explains when Payment Entry, Sales Invoice or Purchase
Invoice is the safer source document and hands every creation, review, submission,
reversal, dimension, attachment and ledger action back to ERPNext.

This is a work-queue and comprehension foundation, not an accrual engine or approval
system. It does not create schedules, calculate accounting policy, post, submit,
cancel, reverse, allocate or approve. The task-designed template, accrual, prepayment,
deferral, allocation, recurrence, attachment, maker-checker and exact source-to-GL
acceptance journeys remain required before FIN-02 can be promoted.

## 5. Continuous accounting before month end

The fastest close is built during the month. Bunood therefore exposes these queues
daily instead of discovering them on the last day:

- bank-statement lines not imported, duplicated, unmatched or partly matched;
- receipts/payments recorded but unallocated, and invoices with allocation disputes;
- aged receivables, payables, advances, credits and control-account exceptions;
- POS shift/tender differences and cash deposits not traced to the bank;
- stock transactions with negative-stock, valuation, landed-cost, serial/batch,
  transit, rejected-warehouse or GL differences;
- uncapitalised assets, incomplete schedules, overdue depreciation and disposal
  exceptions;
- deferred revenue/expense schedules with missing accounts, service dates, draft
  recognition journals or failed background runs;
- recurring/accrual/reversal journals due, rejected or missing support;
- foreign balances with missing, stale or unapproved closing rates;
- VAT, withholding and ZATCA transactions whose document, tax, XML or GL state is
  inconsistent; and
- background jobs, imports and integrations whose delay changes close readiness.

Each queue item links to the native source and explains **why it matters**, **who can
act**, **what action is safe**, and **how the result will be verified**.

## 6. Close calendar, phases and dependencies

Every close instance is scoped by legal Company, fiscal year, period start/end,
Finance Book, reporting currency, template version, materiality basis, owner and
reviewer. One group's close cannot silently combine companies or currencies.

### 6.1 State model

`Not started → Ready → In progress → Prepared → Reviewed → Approved → Complete`

Controlled alternatives are `Waiting dependency`, `Blocked`, `At risk` and
`Reopened`. A task may return to an earlier state only with reason, actor and
timestamp. `Complete` requires its acceptance rule and evidence; `Approved` requires
an authorised reviewer different from the preparer where segregation is configured.

### 6.2 Configurable baseline schedule

| Phase | Default focus | Exit condition |
|---|---|---|
| Pre-close (last 2–3 business days) | Confirm calendar/cutoff, owners, bank files, subledger completeness, inventory count/status, recurring schedules, rates, tax and known estimates. | Sources are available or an owned exception and fallback are recorded. |
| T+1 | Cash/POS and bank ingestion, AP/expenses/payroll accrual inputs, intercompany confirmations, depreciation and prepaid/deferred runs. | Level-1 sources and scheduled postings are complete or blocked explicitly. |
| T+2 | Revenue/expense cut-off, AR/AP and payment allocation, inventory/COGS, foreign-currency calculation, initial balance-sheet reconciliations. | Subledgers and operational ledgers reconcile or carry owned differences. |
| T+3 | Balance-sheet reconciliations, intercompany/eliminations where supported, approved adjustments, preliminary Trial Balance/P&L and flux analysis. | All material balances have prepared reconciliations and explanations. |
| T+4 | Tax review, equity/closing review, draft statements, variance review and management questions. | Reviewer decisions and final adjustments are recorded. |
| T+5 | Final statements, approved lock, distribution, forecast handoff and retrospective. | Hard-close requirements pass and the immutable close packet is sealed. |

The dependency levels are:

1. transaction cutoff and source capture;
2. subledger, payment, bank, stock and cash reconciliation;
3. balance-sheet reconciliation and approved adjustments;
4. tax, consolidation where supported and draft statements; and
5. management review, lock and controlled distribution.

Bunood calculates readiness from dependency state. It must not paint a downstream
task green while an upstream material dependency is incomplete.

## 7. Reconciliation contract

The following families are required where applicable:

1. Trial Balance debits equal credits and reproduce the General Ledger boundary.
2. Accounts Receivable and Payment Ledger reconcile to receivable control accounts.
3. Accounts Payable and Payment Ledger reconcile to payable control accounts.
4. Bank statement and Bank Transactions reconcile to book vouchers and bank GL.
5. Cash/POS shifts, tenders, deposits and clearing accounts reconcile end to end.
6. Stock Ledger and valuation reports reconcile to inventory GL by company,
   warehouse, item and relevant dimensions.
7. Fixed Asset Register, depreciation schedules and disposal entries reconcile to
   asset cost, accumulated depreciation and gain/loss accounts.
8. Deferred revenue/expense and accrual/prepayment schedules reconcile to their
   balance-sheet and P&L accounts.
9. VAT, withholding and ZATCA operational outputs reconcile to source documents,
   tax ledgers and reviewed filing periods.
10. Foreign-currency subledgers and revaluation schedules reconcile account and
    company currency, rates and realised/unrealised gain/loss.
11. Intercompany balances and eliminations reconcile only when the supported
    company structure and consolidation route have been explicitly accepted.

Every reconciliation record stores:

- company, period, Finance Book, account/dimension/currency and cutoff;
- exact source report and saved filters/version;
- expected/source amount, ledger amount, difference and materiality result;
- preparer, reviewer, due date, prepared/reviewed timestamps and status;
- itemised reconciling differences with age, classification and owner;
- explanation, source-document links, attachments and resolution target;
- subsequent clearance, adjustment or approved carry-forward; and
- immutable evidence hash/reference bound to the release candidate and dataset.

Zero difference alone is not proof if filters, period, company or currency differ.
An unexplained amount cannot be made “immaterial” without the configured materiality
owner and rationale.

## 8. Journal and schedule governance

Bunood's journal workbench is a controlled view over native Journal Entry and
related ERPNext documents. It supports approved templates, recurring entries,
accruals, auto-reversals, prepayments, deferrals, allocations and source-generated
entries.

Non-negotiable controls:

- debits equal credits in company currency and required account currencies;
- Company, Finance Book, posting date, accounts, parties, references, dimensions and
  exchange rates are valid together;
- the business purpose, preparer, support, source and reversal policy are explicit;
- maker and checker are distinct where the workflow requires it;
- high-risk/manual/top-side entries receive enhanced review and evidence;
- recurring or automatic creation does not imply automatic approval/submission;
- generated entries retain their source link, such as depreciation, deferred
  accounting or exchange revaluation;
- submitted source and ledger rows are not edited; correction uses native reversal,
  cancellation/amendment or an approved subsequent entry;
- duplicate template/run detection is idempotent; and
- every approval, rejection, amendment and reversal remains auditable.

## 9. Soft close, hard lock and governed reopen

Bunood labels the controls precisely:

- **Soft close** means the team's reconciliations and review are complete enough for
  draft reporting, but authorised adjustments may still occur.
- **Accounting Period** means selected document types are restricted for the past
  date range through the native ERPNext record.
- **Accounts frozen up to** means the broader native posting restriction is active,
  with only the explicitly approved bypass role where policy permits.
- **Period Closing Voucher** means the native P&L transfer was posted for the
  configured fiscal period; it is not itself a lock.
- **Hard close** means the organisation's approved combination of reviewed
  reconciliations, final statements, lock controls and sign-off is active.

Before hard close, Bunood verifies the configured list of open drafts, failed jobs,
unreconciled material items, unapproved journals, stock and tax exceptions, missing
rates, incomplete schedules, late transactions, backup evidence and report hashes.

A reopen requires company/period, requested document type, reason, impact,
requester, authorised approver, time window and follow-up reconciliation. Bunood
records every posting made during the window, forces affected reports and
reconciliations back to review, then confirms relock. A system administrator cannot
grant themselves accounting approval by editing the UI.

## 10. Statements, variance and drill-down

The governed report family includes Trial Balance, General Ledger, Profit and Loss,
Balance Sheet, Cash Flow, Accounts Receivable/Payable and ageing, bank
reconciliation, Fixed Asset Register/depreciation, stock valuation/GL comparison,
tax/VAT, budget-versus-actual and supported comparative/consolidated views.

Every promoted figure shows:

- definition and calculation owner;
- Company, period/as-of date, fiscal year, Finance Book, currency and dimensions;
- inclusion/exclusion of drafts, cancelled records, opening entries, closing entries,
  revaluations and returns where relevant;
- generated-at timestamp and stale-data warning;
- drill-down to permitted source rows with the same filters; and
- export metadata sufficient to reproduce the view.

P&L, gross profit, working capital and cash values cannot be relabelled as simple
KPIs without a signed metric definition. Unsupported consolidation is labelled
unavailable, not approximated with summed cards.

## 11. Saudi operating dimension

The close cockpit coordinates, but never silently decides:

- SOCPA-endorsed reporting-framework selection and customer accounting policies;
- Saudi VAT classifications, return periods and GL reconciliation;
- ZATCA standard/simplified document lifecycle, corrections and retained evidence;
- withholding treatment and reports where configured and externally reviewed;
- payroll, GOSI and WPS outputs when that V1 workstream is implemented; and
- Arabic/English evidence and statements appropriate to the selected output.

Tax, ZATCA, payroll and statutory controls keep their own qualified reviewers and
acceptance receipts. Passing the accounting close cannot imply that those external
obligations are accepted.

## 12. Interaction and visual contract

The finance experience follows the universal five-zone form grammar: identity,
business context, primary work, totals/validation, and actions. It is neutral-first;
dark green is reserved for the current selection, primary action, brand or confirmed
success. Ordinary statuses use text/icon/edge emphasis rather than decorative pills.

- Names and account titles are primary; codes remain secondary traceability.
- Tables align numeric values by decimal and preserve sign, currency and scale.
- Totals are large and clear, but never separated from their filters or source.
- Dense expert tables remain keyboard-operable and usable at 200% zoom.
- Mobile shows actionable queues and review summaries; it does not pretend that a
  wide reconciliation can be safely completed in an unreadable compressed grid.
- Arabic uses correct RTL flow, glyph line height and accounting terminology;
  account numbers, dates, currency codes and mixed formulas remain legible.
- Loading preserves the workspace shell. Validation, denial, conflict, job delay and
  server failure restore controls, focus and an idempotent recovery path.

## 13. Permission and segregation contract

For every promoted action, acceptance includes an allowed and denied server-side
probe with allowed/forbidden Company and record fixtures. At minimum, separate:

- source transaction creation/submission/cancellation;
- journal preparation, approval and submission;
- bank import, matching, voucher creation and reconciliation review;
- close preparation and close approval;
- period creation/lock, bypass, reopen and relock;
- policy, materiality, rate and account-master changes;
- financial-statement distribution/export; and
- auditor read-only access.

Client visibility reflects effective permission but never replaces server checks.
Cross-company data, attachments, exports, comments, notification text and cached
results are part of the isolation test.

## 14. Acceptance programme

Promotion requires **two consecutive controlled closes**: one normal month and one
month with deliberate exceptions. Both use an identified release candidate,
controlled opening data, named roles, Arabic and English, desktop and compact
review, and reproducible reports.

Required evidence groups:

1. qualified-accountant policy, framework and materiality sign-off;
2. role, permission, segregation and cross-company isolation probes;
3. pre-close through T+5 dependency and critical-path execution;
4. all applicable reconciliation families with source/filter evidence;
5. journal, accrual, reversal, recurring and generated-entry governance;
6. bank import/match/create/unmatch and payment allocation/unreconcile scenarios;
7. stock, fixed-asset, deferred, FX, tax and cash/POS close scenarios;
8. statement reproduction, drill-down and prior-closing-to-next-opening continuity;
9. soft close, native lock, denied late posting, controlled reopen and relock;
10. late adjustment, failed job, stale rate, duplicate import and recovery states;
11. bilingual, responsive, accessible and keyboard task completion; and
12. immutable, candidate-bound close packet with backup/restore and cleanup proof.

Minimum financial assertions include:

- Trial Balance debits equal credits for the identical boundary;
- prior closing Balance Sheet equals the next opening boundary under the native
  carry-forward/closing design;
- every material control-account and schedule difference is zero or approved,
  explained, owned and aged;
- the Period Closing Voucher effect agrees with the reviewed P&L boundary and does
  not masquerade as a period lock;
- AR/AP outstanding, bank, stock, assets, deferrals, FX, tax and cash/POS each tie to
  their named authoritative records; and
- run cleanup removes only run-owned fixtures and proves unrelated persistent
  balances and documents are unchanged.

No domain becomes `verified` in the machine register without a signed external
acceptance receipt. Structural tests prove the target remains intact; they do not
prove accounting accuracy.

## 15. Operating metrics

Track by Company and close template:

- business days/hours from period end to soft close and hard close;
- tasks completed on time, late, blocked, at risk and reopened;
- reconciliation exceptions by amount, age and root cause;
- manual journals, rejected journals and adjustments after soft close;
- failed/late scheduled accounting jobs;
- reopened periods and postings during reopen windows;
- unexplained differences and restatements; and
- preparer/reviewer workload and evidence completeness.

Metrics diagnose the process. They do not reward closing early while leaving
unresolved or incorrectly scoped balances.

## 16. External decisions still required

Before implementation can be accepted, authorised owners must approve:

1. reporting framework and accounting policies;
2. Chart of Accounts, Finance Books, dimensions and closing account;
3. materiality and reconciliation ageing/escalation;
4. close calendar, cutoff and owner/reviewer assignments;
5. journal types, approval thresholds and auto-reversal/automation policy;
6. exchange-rate source, freshness, revaluation and reversal policy;
7. depreciation, capitalization, deferred accounting and inventory valuation policy;
8. period-lock, bypass, reopen and statement-distribution authority; and
9. Saudi VAT, withholding, ZATCA, payroll and filing interpretations with the
   relevant qualified reviewers.

These decisions are customer configuration and acceptance evidence. Bunood must not
ship hidden defaults that look like professional judgement.
