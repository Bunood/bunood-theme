# Bunood V1 cash, bank, payment, and reconciliation contract

**Date:** 2026-09-20  
**Scope:** WO-12, WO-13, WO-14, OTC-03, OTC-04, FIN-03, FIN-04  
**Status:** implemented foundation; controlled-period acceptance incomplete  
**Machine register:** `quality/v1-cash-bank-payment-control-register.json`

## 1. Product outcome

Bunood must make one question easy for a cashier, collections operator, owner, and
accountant at their respective level of detail:

> Where is the money now, what is it settling, what evidence proves it, and what
> still needs action?

The same native records serve both modes:

- **Simple mode** explains the next safe task: receive or pay, select invoices,
  import a statement, review a suggested match, explain a difference, deposit
  cash, or investigate a settlement.
- **Expert mode** exposes accounts, currencies, exchange rates, references,
  allocations, clearing, deductions, source identifiers, matching evidence,
  differences, approvals, and General Ledger trace.

Neither mode creates a second balance, payment ledger, bank ledger, or settlement
ledger. Bunood is the task and explanation layer over ERPNext-native documents.

## 2. Evidence and Saudi market basis

### 2.1 ERPNext accounting authority

The current official ERPNext documentation establishes these boundaries:

- [Payment Entry](https://docs.frappe.io/erpnext/payment-entry) is the standard
  operational document for a receipt, supplier payment, advance, partial payment,
  multi-invoice payment, or internal bank/cash transfer. It posts the money
  movement and may allocate it to native documents.
- [Payment Reconciliation](https://docs.frappe.io/erpnext/payment-reconciliation)
  applies an already-recorded payment or credit to one or more outstanding
  invoices. It does not create another bank movement.
- [Banking](https://docs.frappe.io/erpnext/banking-in-erpnext) distinguishes a
  Bank Transaction—the statement side—from the Payment Entry or Journal Entry—the
  book side.
- [Bank Reconciliation](https://docs.frappe.io/erpnext/bank-reconciliation)
  matches statement activity with book vouchers. It is not the same operation as
  allocating a party payment to an invoice.
- [Bank Transaction](https://docs.frappe.io/erpnext/bank-transaction) preserves a
  statement line and its identifiers; importing it does not itself replace the
  accounting voucher.
- [Mode of Payment](https://docs.frappe.io/erpnext/mode_of_payment) can provide
  company-specific default payment accounts. Its mapping must be governed rather
  than left to operator guesswork.

These are permanent architectural boundaries. Bunood may guide, rank, explain,
batch, and reconcile; it must not recreate these records in a parallel subsystem.

### 2.2 Saudi operating context

The Saudi Central Bank reported that electronic payments represented **79% of
retail payments in 2024**, with **12.6 billion** non-cash transactions, up from
10.8 billion in 2023. This makes card, wallet, transfer, settlement, and fee
reconciliation a core daily ERP workflow, not an optional integration polish:
[SAMA announcement](https://www.sama.gov.sa/en-us/mediacenter/news/pages/news-1083.aspx).

SAMA's [Open Banking program](https://www.openbanking.sama.gov.sa/index-en.html)
defines a framework of use cases, business rules, customer-experience rules, API
specifications, implementation requirements, and operational guidelines. Its lab
supports sandbox and conformance testing. Bunood therefore never labels a bank
feed “supported” merely because a generic API call worked.

The SAMA Rulebook requires secure storage, sharing, and transmission for payment
account information or initiation services and ties them to applicable open
banking, cybersecurity, and privacy requirements:
[Article 95](https://rulebook.sama.gov.sa/en/article-95-1). A promoted integration
requires a current authorized route, explicit consent where applicable, tested
revocation, scoped access, and conformance evidence.

Merchant settlement is not synonymous with sales captured. SAMA's published
merchant-acquiring rule states that the credited amount follows reconciliation
and may be reduced by credits, reversals, adjustments, refunds, and merchant
discounts under the agreement:
[Settlement period](https://www.rulebook.sama.gov.sa/en/2135-settlement-period).
Bunood must therefore show gross activity, every adjustment, and the net bank
credit instead of hiding the difference inside one amount.

References to mada, cards, wallets, SARIE/bank transfer, SADAD, payment links, or
open banking in this contract describe accounting and operational classes. They
are not promises that a named provider or rail is connected. Each connector is a
separately approved and accepted product.

### 2.3 Implemented WO-14 / FIN-03 foundation

The first bank-reconciliation product slice is now implemented without creating a
second accounting engine:

- `/app/bnd-banking` is a lazy-loaded bilingual Page linked from the Bunood
  Reports workspace. Its code and payload are absent from unrelated Desk routes.
- Company and Bank Account reads preserve current-user permissions. Only active
  company accounts are offered; the label uses the native mask and never returns
  the account number, IBAN, statement password, or integration identifier.
- Account currency is resolved from the linked native ledger Account, with the
  permitted Company currency used only as a display fallback.
- A bounded period reads native Bank Transaction records and shows deposits,
  withdrawals, statement net movement, allocated/open amounts, open-row ageing,
  older open items, and recent native Bank Statement Import records.
- General Ledger movement is read from the linked native bank account and is
  deliberately labelled **book net movement**, not a reconciliation difference.
- “No open imported transactions” is explicitly not a close approval. The Page
  never derives a `reconciled` or `approved` state from presentation data.
- Import starts by creating an ordinary permission-checked Bank Statement Import
  draft. Upload, preview, validation, duplicate handling, import, matching,
  split/merge/partial cases, voucher creation, unmatch and posting remain in
  ERPNext's native forms and v16 `/banking` application.
- Focused tests hold the permission, privacy, native-authority, state-wording,
  RTL/logical-CSS, accessibility, Arabic coverage, page wiring and payload
  boundaries.

This is implementation evidence, not completed reconciliation evidence. The
machine control register remains `planned` until the two controlled periods and
all twelve evidence groups in section 13 are accepted by qualified reviewers.

## 3. Non-negotiable accounting truths

1. ERPNext Payment Entry, Payment Ledger, Bank Transaction, party outstanding,
   Bank/Cash General Ledger accounts, and native reports remain authoritative.
2. A payment records movement of money. It must not record revenue or expense a
   second time when an invoice already recognized it.
3. Importing a statement row records external evidence; it does not post the GL.
4. Payment reconciliation changes allocation; it does not move money again.
5. Bank reconciliation connects bank evidence to book vouchers; it does not
   allocate the customer's payment to an invoice.
6. Provider authorization, capture, callback, Payment Entry, allocation,
   settlement, bank credit, and reconciliation are different states.
7. A browser return, toast, HTTP response, webhook, or provider “paid” state is
   not proof that the bank settled the correct net amount.
8. Unknown, delayed, timed-out, and duplicate callbacks never create another
   payment until exact source identity and prior processing are reconciled.
9. Automated and fuzzy matches are proposals. They may rank candidates, never
   make an irreversible material match without the configured control.
10. Fees, VAT on eligible fee invoices, refunds, reversals, chargebacks,
    adjustments, and exchange differences are explicit components. They cannot
    disappear inside a net number.
11. A cash sale, cash counted, cash in safe, deposit in transit, and bank credit
    are different custody states.
12. Corrections use supported unreconcile, reverse, cancel/amend, refund, or
    adjusting-entry flows. Generated ledger rows are never edited directly.
13. Every difference has a category, amount, currency, age, owner, due date,
    explanation, evidence, and resolution history.
14. An account, batch, shift, or period is reconciled only when its adjusted
    difference is zero, or when an explicitly permitted policy exception is
    documented and approved. “Looks close” is never a state.

## 4. Roles and segregation

| Role | Primary work | Must not silently do |
|---|---|---|
| Cashier | Record permitted tenders, count and close a shift, hand off cash | change clearing/bank accounts, approve own unexplained variance |
| Collections operator | Record customer receipts, allocate known invoices, follow unallocated cash | change submitted invoices, write off or alter bank evidence |
| Payables operator | Prepare supplier payments and references against approved liabilities | approve own payment where segregation is required |
| Treasury operator | Import statements, monitor cash/banks, prepare matching and settlement work | administer connector secrets or approve own material adjustment |
| Accountant preparer | Investigate differences, prepare adjustments, reconcile and document | review and sign off own controlled reconciliation |
| Finance reviewer | Review mappings, evidence, adjustments, ageing, materiality and close status | bypass native permissions or mark incomplete work reconciled |
| Connector security administrator | Manage approved credentials, scopes, rotation, revocation and environments | create/account for commercial transactions by virtue of secret access |
| Auditor | Read-only source-to-ledger trace, evidence, approvals and changes | import, match, post, unreconcile, approve, or alter evidence |

Small organizations may assign multiple named roles to one person only through a
documented compensating control. Bunood still records which capacity performed
each action and requires an independent review for configured high-risk actions.

## 5. Account and method design

### 5.1 Guided setup

The onboarding workspace asks business-language questions first:

- Which locations take cash, card, wallet, transfer, payment link, or other
  methods?
- Which legal company owns each terminal, bank account, and merchant agreement?
- Does the money reach the bank immediately or settle later through a provider?
- Which currencies are allowed?
- Who prepares, approves, imports, reconciles, and reviews?
- What reference must the operator retain?

It then proposes—not silently creates—native mappings for qualified review.

### 5.2 Required mapping pattern

| Operating event | Typical native destination | Product rule |
|---|---|---|
| Physical cash collected | Cash-on-hand account by company/location where needed | Do not call it banked until the deposit clears |
| Cash handed for deposit | Deposit-in-transit/clearing where policy requires | Trace handoff, deposit reference, date, amount, custodian |
| Direct bank transfer receipt | Correct company bank account | Allocate to party documents separately where unknown at receipt |
| Card/wallet captured but not settled | Provider/merchant clearing account | One governed clearing route per necessary company/provider/currency class |
| Net provider settlement | Bank account plus explicit clearing components | Reconcile gross, fees, tax, refunds, chargebacks and net |
| Supplier payment | Correct company bank/cash account | Link approved supplier obligations and retain payment reference |
| Internal transfer | Source and destination native bank/cash accounts | Never use a party receipt/payment workaround |

“Network,” “card,” or “electronic” cannot default every company to one universal
bank ledger. The Mode of Payment mapping is validated by company and currency;
an invalid or missing mapping blocks submission with a direct remediation link.

## 6. Lifecycles shown without false success

### 6.1 Payment states

`Draft → submitted-unallocated / submitted-partly-allocated /
submitted-allocated → reconciliation-required → reconciled`

Supported branches include `unreconciled`, `reversed-or-refunded`, and
`cancelled`. UI wording always separates:

- **Recorded:** native voucher submitted.
- **Allocated:** connected to the stated invoice(s) or credit(s).
- **Cleared/settled:** external money evidence received.
- **Reconciled:** external evidence, allocation, outstanding, and ledgers agree.

### 6.2 Bank Transaction states

`Source received → validated → imported unmatched → candidate match → partly
matched / matched → reconciled`

Branches include `duplicate quarantined`, `difference open`, `unmatched after
review`, and `cancelled`. Every row retains source file/feed, import batch,
immutable source identifier where available, row/hash identity, dates, currency,
amount direction, original text, and mapping version.

### 6.3 Provider settlement states

`Authorized not captured → captured unsettled → settlement pending → settlement
received / partly received / difference → reconciled`

Branches include `unknown/delayed`, `refunded`, `reversed`, and
`chargeback/dispute`. A captured sale can be operationally successful while its
settlement remains open; the UI must show both without alarming the cashier or
misleading finance.

## 7. Task-designed workflows

### 7.1 Receive from a customer

1. Start from the customer, invoice, collections queue, bank row, or payment-link
   result; preserve that context.
2. Show customer, open invoices/credits, amount/currency, method, destination,
   payment date and reference in the first view.
3. Default only permitted, company-correct mappings. Explain where the amount will
   post before submit.
4. Allocate one or many invoices; show remaining payment and remaining invoice
   balance live. Partial payment is ordinary, not an error.
5. An overpayment remains an explicit unallocated advance unless an authorized
   refund or other supported treatment is chosen.
6. Preview the accounting effect in plain language, then preserve the detailed
   debit/credit view for accountants.
7. After submission, show `recorded`, `allocated`, and `settlement/reconciliation`
   as separate milestones with source links.

### 7.2 Pay a supplier

The same grammar applies to approved payables. Bunood shows due and overdue
documents, holds/disputes, proposed amount, discounts or deductions, currency,
bank route, approval state, reference, and expected remaining payable. Bulk
payment creation is a reviewed batch of native payments, not an opaque aggregate.
The operator can trace each batch row to the source liability and final bank
evidence.

### 7.3 Allocate existing payments and credits

Payment Reconciliation opens as a two-sided task:

- invoices/credits with outstanding balances;
- submitted payments/credits with available unallocated amounts;
- proposed allocations with amount and remaining balances;
- exact company, party, control account, currency, and date filters.

Leaving selections blank must never silently trigger FIFO without explaining the
effect and requiring the configured confirmation. Unreconcile restores the native
balances, records who/why, and returns the affected rows to review.

### 7.4 Import or synchronize a bank statement

1. Choose legal company, Bank Account, statement period, source, and currency.
2. Validate file/feed structure before mutation. Preview mapped and rejected rows.
3. Compute duplicate identity using stable bank identifiers when available and a
   documented composite fallback when not. Never rely on description alone.
4. Quarantine exact duplicates and ambiguous overlaps; do not create them as
   ordinary unmatched work.
5. Preserve the original immutable source file or signed/feed receipt under the
   retention and access policy.
6. Import in a recoverable batch with row counts, hashes, mapping version,
   accepted/rejected/duplicate totals and retry identity.
7. A retry is idempotent: accepted rows are not recreated, rejected rows retain
   their history, and corrected source rows are auditable.

Connected feeds follow the same contract. Sync does not weaken source identity,
consent, duplicate, retention, permission, or reconciliation requirements.

### 7.5 Reconcile a bank account

The workbench begins with the period and a compact summary:

- bank statement opening/closing balance;
- book opening/closing balance;
- deposits in transit;
- uncleared payments;
- bank-only additions/deductions awaiting a book voucher;
- book-only entries awaiting clearance;
- unidentified, disputed, duplicate, and aged differences;
- adjusted bank, adjusted book, and remaining difference.

For each statement row Bunood may rank candidates by amount, date, currency,
reference, party and description. It shows *why* each candidate ranked; the source
row and voucher open side by side. Supported cases include:

- one statement row to one voucher;
- one settlement row to many sale/payment vouchers;
- several statement rows to one supported voucher;
- partial matches and remaining amount;
- included or separate fees;
- foreign-currency and exchange differences;
- creation of a missing Payment Entry or an appropriate reviewed Journal Entry;
- unmatch/review/correct/reconcile again.

Creating a voucher from a bank row asks what the transaction represents. Routine
receipts, payments, and transfers use Payment Entry; genuine accounting
adjustments use reviewed Journal Entry. The UI must not teach users to use a
Journal Entry as the default payment shortcut.

### 7.6 Reconcile cash and POS

Cash is a custody chain:

`Opening float → sales/refunds/paid-outs → expected tender → counted tender →
approved variance → safe/hand-off → deposit in transit → bank credit`

Card/wallet tender is a settlement chain:

`POS sale/refund → terminal/provider transaction → clearing account → settlement
batch → fees/tax/adjustments → net bank credit`

The shift close shows expected versus counted by method, with reasons and approval
for variance. It does not force a cashier to perform bank reconciliation. Finance
receives a clean queue of cash deposits and provider batches, linked back to the
shift, invoice, refund, payment, stock/tax consequences and GL.

### 7.7 Reconcile a provider settlement

For each merchant/provider batch, Bunood displays a large, legible waterfall:

```
Gross captured sales
- refunds and reversals
- chargebacks/disputes
- merchant/provider fees
+/- other named adjustments
= expected settlement
vs bank credit
= remaining difference
```

Each component drills to the authentic provider row and native document. Fee tax
treatment requires the provider's valid document and approved accounting setup;
the ERP must not infer recoverable VAT merely from a deducted amount. Unknown
adjustments remain owned differences rather than being posted automatically to a
generic expense.

### 7.8 Payment link and callback

The connector contract requires:

- server-generated idempotency key bound to company, request, amount and currency;
- signed/authenticated callback verification;
- immutable provider transaction, attempt, event and settlement identifiers;
- replay protection and out-of-order event handling;
- status inquiry after timeout or ambiguous response before retry;
- one native Payment Entry per genuine payment event;
- refund/chargeback linked to the original transaction;
- browser redirect used only for user guidance, never payment proof;
- complete request/response metadata with secrets and sensitive data redacted;
- provider-to-Payment Entry-to-allocation-to-outstanding-to-clearing-to-bank-to-GL
  reconciliation.

## 8. Saudi connector governance

A Saudi bank or payment connector can be promoted only when all are named:

1. legal provider and current authorization/licensing basis;
2. customer legal entity and accounts in scope;
3. information access versus payment-initiation capability;
4. consent purpose, scope, expiry, renewal and revocation behavior;
5. sandbox/lab and conformance result for the exact version;
6. production endpoints, scopes, certificates/secrets and custody owner;
7. identifiers, pagination, date/time zone, currencies, reversals and settlement
   semantics;
8. rate limits, availability, webhook or polling behavior, retry and replay;
9. duplicate and overlapping-source strategy if files and feeds coexist;
10. incident, degraded/manual fallback and resynchronization procedure;
11. retention, privacy, access logging, support escalation and exit/export;
12. exact accounting, reconciliation and acceptance matrix.

Credentials never reach the browser, appear in ordinary records, exports, logs,
screenshots, evidence packets, or support bundles. A revoked or expired consent
causes an explicit `connection needs attention` state; existing accounting data
remains usable and statement import remains the controlled fallback.

## 9. Difference management

Every reconciling item has one of the controlled categories in the machine
register, including normal timing, deposit in transit, uncleared payment,
unrecorded fee/interest, provider fee/tax/rounding, refund/reversal/chargeback,
mismatch, duplicate, missing item, classification error, FX, or unidentified
dispute.

Each item stores:

- account/provider, company, period, source and native record links;
- source and book amount/currency/date/reference;
- difference and adjusted-balance effect;
- category, cause, evidence and proposed action;
- origin date, age bucket, owner and due date;
- materiality/escalation result and reviewer;
- adjustment/unmatch/reversal/reference if resolved;
- resolution date and root-cause/prevention note where recurring.

Aging and materiality thresholds are organization policy, not hard-coded universal
amounts. Default presentation uses 0–30, 31–60, 61–90 and over-90-day views, but
the finance owner approves the actual cadence, thresholds and escalation. Any
unexplained difference remains visible even below materiality.

## 10. Visual and interaction contract

### 10.1 One consistent reconciliation grammar

All payment/bank screens use the same hierarchy:

1. **Context:** company, account/provider, period, currency, last source update.
2. **Outcome:** adjusted balances and difference in large clear values.
3. **Work queue:** exceptions and next actions before decorative KPIs.
4. **Workspace:** source on one side, native book record on the other, proposed
   allocation/match between them.
5. **Evidence:** original source, identifiers, mapping, approvals and history.

Green means a verified reconciled outcome, not “this is a finance page.” Neutral
surfaces carry ordinary content. Warning and error colors communicate owned
states, with text and icons so color is never the only signal.

### 10.2 Simple mode

- plain labels such as “Money received,” “Applied to invoices,” “Expected in
  bank,” “Bank received,” and “Difference to explain”;
- names before codes; masked account/merchant identifiers with reveal permission;
- one primary next action and visible save/result feedback;
- no empty auto-row that blocks saving or prints;
- helpful empty states that distinguish “no activity” from “source not imported”;
- undo/unreconcile offered only when permitted and explained.

### 10.3 Expert mode

- keyboard-first compact tables with sticky identifying and amount columns;
- saved filters, grouping, bulk proposal/review, notes, attachment and export;
- explicit debit/credit, source/book currency, exchange rate and account columns;
- side panel for source row, voucher, allocations, GL, audit and evidence;
- no horizontal compression that clips Arabic or hides material fields;
- one-click source drill-down retains period/filter context.

Arabic/RTL and English/LTR must be semantically complete at desktop, tablet,
compact, and phone widths. Numbers, signs, account codes, IBAN/reference strings,
currency, and mixed-direction identifiers must remain readable. The same actions
must be keyboard and screen-reader operable.

## 11. Reconciliation equations

### 11.1 Bank account

```
Statement closing balance
+ deposits in transit
- outstanding/uncleared payments
+/- proven bank errors or timing items
= adjusted bank balance

Book bank GL closing balance
+ bank credits/interest not yet recorded
- bank fees/debits not yet recorded
+/- proven book errors or adjustments
= adjusted book balance

Adjusted bank - adjusted book = 0.00 (in account currency)
```

### 11.2 Party control

For each company, control account, currency and cutoff:

- invoice/credit outstanding from the native party/payment ledger;
- submitted allocated and unallocated payments/advances;
- AR/AP ageing and party statements;
- receivable/payable GL control balance;

must reconcile under the same inclusion rules. Returns, cancellations, write-offs,
exchange differences and period cutoffs are explicit.

### 11.3 Provider settlement

```
Gross captured amount
- refunds/reversals/chargebacks
- fees and separately evidenced taxes
+/- named adjustments
= expected net settlement
- actual bank credit matched
= open settlement difference
```

The provider clearing GL movement and closing balance must reproduce the same
chain. A zero bank difference with a non-zero clearing balance is not complete.

### 11.4 Cash/POS

Expected tender by method, counted tender, approved variance, cash handoff,
deposit-in-transit, provider clearing, actual bank credit, Payment Ledger and GL
must tie to the same shifts and cutoff.

## 12. Exception and recovery matrix

Acceptance covers at least:

- validation or permission failure before native save/submit;
- server error after click, including safe button/state recovery;
- duplicate or overlapping statement file and feed windows;
- corrupted file, unmapped column, invalid date/currency/amount direction;
- statement import interrupted and retried idempotently;
- no candidate, wrong candidate, partial, split and merged bank matches;
- payment allocated to wrong invoice and safely unreconciled/reallocated;
- wrong party/account/company/currency caught before submit;
- callback duplicated, reordered, forged, timed out, or received after refund;
- provider capture without settlement and settlement without expected detail;
- short/long settlement, separate/included fee, VAT evidence missing;
- refund, reversal, chargeback and dispute before/after settlement;
- cash count variance, missing deposit, partial deposit and bank mismatch;
- foreign-currency rate and realized difference;
- consent/credential expired or revoked, rate limit, provider/bank outage;
- late item after close and governed reopen/reconciliation impact;
- stale/unowned/recurring difference escalation;
- unauthorized import, match, adjustment, unreconcile, export or cross-company view.

Every recovery leaves the operator on a usable screen with the original context,
clear state, safe next action, and no duplicate money or ledger effect.

## 13. Acceptance evidence

Structural validation of this document and register proves only that the target
contract remains complete. It is not a reconciliation, bank/provider approval,
connector receipt, accounting sign-off, or release acceptance.

Promotion requires **two consecutive controlled periods**: one normal and one
exception-heavy. The evidence packet contains all twelve machine-register groups,
including:

1. qualified finance review of mappings, materiality and sign-off policy;
2. customer/supplier receipt, payment, advance, partial, over/under, refund and
   internal-transfer scenarios;
3. Payment Ledger, AR/AP, outstanding, control-account and GL reconciliation;
4. clean, dirty, duplicate, overlapping and reimport statement cases;
5. one-to-one, one-to-many, many-to-one, partial, fee, FX and unmatch cases;
6. shift/tender/variance/deposit/bank chain;
7. provider callback/replay/timeout/refund/chargeback/fee/tax/settlement chain;
8. current Saudi authorization, consent, sandbox/conformance, revoke and degraded
   operation for every promoted connector;
9. difference age, owner, escalation, root cause and resolution history;
10. role, company, account, currency, secret and tenant negative tests;
11. Arabic/English, four-width, keyboard, screen-reader, export and drill-down
    task evidence; and
12. immutable candidate/version, source file/hash, monitoring, incident, recovery,
    retention, support and approvals.

Each period receipt records candidate commit and assets, site/app versions, fixture
or source population, legal companies/accounts/currencies/providers, source file
hashes/feed cursors, mappings, cutoff and time zone, scenario results, exact
reconciliation queries/totals, open differences, preparer/reviewer, failures,
remediation, rerun, and signed decision.

## 14. Implementation order

1. **Authority and mappings:** company bank/cash/clearing accounts, payment modes,
   currencies, roles, materiality, native reports and controlled fixtures.
2. **Native payment task:** receipts, supplier payments, transfers, allocations,
   advances, refunds and clear accounting preview.
3. **Party reconciliation:** unallocated work queue, controlled FIFO explanation,
   unreconcile/reallocate, AR/AP/Payment Ledger/GL trace.
4. **Statement ingestion:** preview, mappings, source identity, duplicates,
   idempotent batches, evidence and recovery.
5. **Bank reconciliation workbench:** candidate explanation, match/split/merge,
   voucher creation, differences, adjusted balances and review.
6. **Cash/POS chain:** shift-to-deposit and provider-clearing handoff.
7. **Provider settlement:** waterfall, fees/tax evidence, refunds/chargebacks and
   clearing-to-bank reconciliation.
8. **Selected Saudi connector:** only after customer priority, authorization,
   consent, conformance, security and support decisions.
9. **Controlled periods and close integration:** two accepted periods, then link
   the result into FIN-08 close readiness and owner cash insight.

No connector dependency blocks statement import and native reconciliation. No
visual workbench is promoted until its underlying accounting scenarios reconcile.

## 15. Product wording restrictions

Bunood may say:

- “Payment recorded; SAR 500 remains unallocated.”
- “Provider captured the payment; settlement is pending.”
- “Suggested match: same amount and reference, one-day date difference.”
- “Statement imported: 94 new, 3 duplicates quarantined, 2 need correction.”
- “Adjusted difference is SAR 0.00; ready for reviewer.”

Bunood must not say:

- “Paid” based only on a browser return or unverified callback;
- “Settled” before provider/bank evidence;
- “Reconciled” because a row is green, a batch imported, or totals approximately
  agree;
- “Automatic matching” without disclosing proposal/approval behavior;
- “Supports Saudi banks/mada/SADAD/open banking” without naming the accepted
  provider, scope, version, authorization and evidence;
- “Compliant” or “approved” based on a generic integration test.

## 16. Decisions requiring owners

Before implementation acceptance, named owners approve:

- bank/cash/provider-clearing, fee, tax, FX, variance and write-off accounts;
- Mode of Payment mapping by legal company, location and currency;
- statement formats, unique identifiers, overlap, retention and source custody;
- provider commercial terms, settlement calendar, fees, tax documents, refunds,
  chargebacks, disputes and SLA;
- Saudi connector authorization, consent, conformance and data processing;
- materiality, aging, escalation, adjustment, write-off and close policy;
- role segregation, support access, credential custody and tenant boundaries;
- cutover, opening unreconciled items, monitoring, incident, recovery, retention
  and support ownership.

This contract and the reconciliation skill assist product and control design; they
do not provide financial advice. All accounting mappings, reconciliations,
adjustments, period conclusions, and production connector decisions require review
and sign-off by the organization's qualified finance professionals and, where
applicable, legal, privacy, security, bank, payment-provider, and Saudi regulatory
owners.
