# Bunood ERP Market Recommendations — Executable Work Orders

> **Absorbed into the authoritative V1 plan:**
> `docs/BUNOOD-V1-MEGA-PLAN-2026-09-20.md`. The work-order identifiers and
> acceptance intent are preserved there; use this file only for the expanded detail
> of those individual orders.

Primary planning ownership for these orders is machine-governed by
`quality/v1-program-authority-map.json`; this detail file cannot override the mega
plan, execution ledger, status registry, or the mapped domain contract.
The edition where each order first becomes mandatory is separately governed by
`quality/v1-edition-promotion-gates.json`.

**Document date:** 2026-09-20  
**Audience:** product owner, implementation engineering, QA, and operations  
**Purpose:** convert the ERP market-research recommendations into bounded work
orders that can be estimated, assigned, implemented, and accepted.  
**Explicit exclusion:** artificial-intelligence features are not part of this plan.

## 1. Delivery decision

Bunood should continue as an Arabic-first, task-oriented operating layer over
ERPNext. The next work must improve the daily operating experience without
duplicating ERPNext accounting, stock, tax, permissions, naming, mapping, payment,
or reconciliation logic.

The work is ordered into four waves:

| Wave | Outcome | Work orders |
|---|---|---|
| 0 — Release | Close the current sellable-pilot gate | WO-00, WO-01 |
| 1 — Daily finance | Make setup, visibility, collection, and banking easy | WO-10 through WO-14 |
| 2 — ERP breadth | Simplify the next most common operating workflows | WO-20 through WO-23 |
| 3 — Ecosystem | Package integrations and a repeatable support operation | WO-30, WO-31 |

Do not begin Wave 2 merely because engineering capacity is available. Promote work
between waves only after real customer use confirms the demand and the preceding
acceptance gates pass.

## 2. Rules applying to every work order

1. ERPNext DocTypes, controllers, permissions, ledgers, mappers, and reports remain
   authoritative.
2. Simple and Advanced modes edit the same native document.
3. No Bunood-only invoice, payment, bank, stock, return, order, or balance records.
4. Arabic and English must expose the same operations and state.
5. Every action that changes accounting, stock, or submitted records requires the
   native permission and confirmation model.
6. Every work order must add focused automated coverage and live acceptance in both
   languages at desktop and supported narrow widths.
7. Production features require auditability, failure recovery, and a written
   operating procedure—not only a working screen.
8. Do not expose an upstream ERPNext feature merely because it exists. Give it a
   Bunood task flow, safe defaults, understandable language, and a measurable user
   outcome.

## 3. Ordered work orders

**Production operations and support authority:**
`BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md` with
fail-closed target `quality/v1-production-operations-control-register.json`. WO-00,
WO-01 and FND-05 share one candidate-bound backup/restore/deploy/rollback/monitoring/
incident/support chain. Its structural check is not a production release receipt.

### WO-00 — Close the production MVP release gate

**Priority:** P0  
**Relative size:** Small, mostly acceptance and owner input  
**Depends on:** none  
**Owner:** product owner + release engineer + QA

**Outcome:** the current sales MVP has a signed release receipt and can be offered
to a controlled customer pilot.

**Scope:**

- Confirm the production company name, VAT number, national/address data, contact
  details, logo, bank/payment details, and ZATCA configuration with the owner.
- Complete one persistent native Quotation → Sales Invoice → Payment Entry scenario.
- Print one representative A4 invoice and one 80 mm invoice at intended settings.
- Scan required QR codes from paper and compare paper against browser/PDF values.
- Run the authoritative automated gates, build, deployment, and live bilingual
  desktop/mobile acceptance.
- Record the final commit, dirty-tree disposition, version, asset hashes, results,
  known non-blockers, and release decision.

**Acceptance criteria:**

- Every item in the release receipt has evidence and an owner.
- Printed identity, item names, quantities, VAT, totals, status, language, and QR
  content agree with the submitted native record.
- The invoice outstanding amount agrees with ERPNext after payment.
- No active P0/P1 revenue-path defect remains.
- The release commit/tag is reproducible and the deployed assets match it.

**Evidence:** completed release receipt, sample PDFs, printer/QR record, automated
test output, live-acceptance record, and deployed asset hashes.

**Source documents:**

- `docs/BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md`
- `docs/BUNOOD-MVP-RELEASE-RECEIPT-DRAFT-2026-09-20.md`

---

### WO-01 — Establish production operations and security baseline

**Priority:** P0 before storing irreplaceable customer data  
**Relative size:** Medium  
**Depends on:** WO-00 environment and ownership confirmation  
**Owner:** operations + security + release engineering

**Outcome:** Bunood can be operated, recovered, monitored, and supported as a real
financial system.

**Scope:**

- Define production, staging, and backup ownership.
- Automate encrypted database and private/public file backups with retention.
- Run and document a restore drill into an isolated environment.
- Enforce HTTPS, MFA for privileged users, least-privilege roles, session policy,
  secret handling, and administrator-account review.
- Add health, job-queue, scheduler, database-capacity, error-rate, and backup alerts.
- Publish incident, rollback, upgrade, restore, and escalation runbooks.
- Define supported browsers, support hours, severity levels, response targets, and
  release cadence.

**Acceptance criteria:**

- A new operator can restore the latest backup using the runbook and verify document
  counts, attachments, and representative ledger reports.
- A failed backup, stopped scheduler, unavailable site, and elevated error rate each
  produce an actionable alert.
- Privileged accounts require MFA and have no unexplained access.
- A release can be rolled back without editing accounting or stock ledgers directly.
- Recovery objectives and escalation owners are written and approved.

**Evidence:** restore-drill record, access review, alert screenshots/events, runbook
review, and disaster-recovery sign-off.

---

### WO-10 — Guided company readiness and onboarding

**Operating and acceptance authority:**
`BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md`; the machine
register remains fail-closed until the fresh-administrator and first-use evidence
exists.

**Priority:** P1  
**Relative size:** Medium  
**Depends on:** WO-00  
**Owner:** product + implementation engineering

**Outcome:** a new small business can reach its first valid invoice without knowing
ERPNext configuration terminology.

**User flow:** choose business type → complete readiness checklist → fix blocking
configuration → create first customer/item → issue a test invoice → mark onboarding
complete.

**Scope:**

- Server-persistent onboarding state per site and per responsible user.
- Readiness checks for company identity, fiscal year, currency, chart of accounts,
  receivable/payable accounts, warehouses, price list, taxes, payment methods, print
  formats, roles, and ZATCA state.
- Explain each failure in plain Arabic and English with a permission-aware route to
  resolve it.
- Separate blockers, warnings, and optional improvements.
- Allow dismissal only after essential blockers pass; allow reopening from Settings.
- Record completion and configuration changes in the normal audit trail.

**Implemented bounded work-order seam:** the Home disclosure can now create one
native ERPNext Project per company and twelve native Tasks. Stable hidden identities
make the operation idempotent; Frappe Assign To/ToDo supplies the named person, and
native comments/File attachments supply evidence. Reads and creates use current-user
permissions. No Bunood task DocType or shadow progress ledger exists, and Task
completion is explicitly not qualified readiness or launch approval.

**Implemented bounded decision seam:** a separate submittable `Bunood Readiness
Review` records one domain decision without changing Task status. Submission requires
the dedicated reviewer permission and explicit authority; accepting or marking a
domain not applicable additionally requires qualification and evidence references.
The receipt hashes the exact site/app/assets, native Task and visible evidence
snapshot, cannot be cancelled, and can only be superseded through an append-only
`Reopened` receipt. Home reports stale or unverified receipts without converting them
into whole-launch approval. This is implemented code and structural evidence, not a
qualified customer acceptance receipt.

**Out of scope:** automatically inventing tax, accounting, identity, or ZATCA data.

**Acceptance criteria:**

- A fresh supported site reaches a valid test invoice using only the guided flow.
- A user without configuration permission can see the blocker but cannot change the
  protected setting.
- Every check has a deterministic pass/fail rule and a focused test.
- Refresh, logout, device change, and language change preserve progress.
- Arabic and English communicate the same requirement and remediation.

**Measures:** median time to first valid invoice, blocked-onboarding rate, support
contacts before first invoice, and checklist abandonment point.

---

### WO-11 — Controlled data-import and migration kit

**Operating and acceptance authority:**
`BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md`; business-data
migration, site transfer, and software/version upgrade keep separate runbooks,
receipts, and rollback decisions.

**Priority:** P1  
**Relative size:** Medium–Large  
**Depends on:** WO-10 readiness rules  
**Owner:** implementation engineering + accounting QA

**Outcome:** customers can safely import master data and approved opening data with
preview, validation, reconciliation, and rollback guidance.

**Scope:**

- Downloadable bilingual templates for customers, suppliers, items, opening stock,
  item prices, and approved opening receivables/payables.
- A dry-run preview showing valid rows, warnings, blocking errors, duplicates, and
  the destination native DocType.
- Stable duplicate rules using business identifiers, not display names alone.
- Batch result with created/updated/rejected counts and row-level error export.
- Reconciliation checklist against ERPNext stock, receivable, payable, and opening
  balance reports.
- Safe rerun/idempotency rules and a documented correction path.

**Out of scope:** silently posting opening balances or overwriting submitted data.

**Acceptance criteria:**

- A bad row cannot cause valid rows to be misreported as imported.
- The same file can be safely retried according to the documented update policy.
- Arabic names, long text, leading zeros, currencies, units, and dates survive the
  round trip.
- Imported opening balances reconcile exactly to the approved source totals.
- Import permissions, audit records, and error files contain no exposed secrets.

**Measures:** import success rate, correction cycles per customer, reconciliation
difference, and implementation hours per site.

**Implemented foundation (not accepted):** a bilingual `Bunood Migration Run` now
freezes the scoped/mapped candidate, dependency order, source hashes and row counts,
mapping/evidence references, owners, material-opening review separation, source
site/database identity, freeze window, backup and rollback boundary. It can prepare
an empty, permission-checked native Frappe `Data Import` draft for one mapped
dataset. A separate guarded action can then run the exact hash-matched attachment
through Frappe's native importer only on a different, explicitly opted-in restored
site and capture an immutable privacy-minimised `Bunood Migration Rehearsal` result
receipt. A wholly successful non-empty run is `dry-run-validated`; partial/error/
timeout/inconsistent or oversized log results fail closed. Each Data Import dataset
now binds an approved stable-identity reference to an explicit duplicate disposition
that must match the native import type. Exact retries reuse the existing rehearsal;
an exception can create a new correction draft bound to its predecessor and receipt
digest, and unchanged correction packets cannot be submitted. A submitted exception
receipt with failures can download Frappe's native errored-row template only after
Bunood rechecks the isolated environment, receipt, packet, current permissions,
matching Data Import and unchanged file hash; Bunood does not expose the raw import
log or invent a second spreadsheet parser. After every dataset succeeds on the same
clone, an immutable reconciliation packet now binds all rehearsal digests and records
the eleven required source-to-native control families with exact decimal values,
reproducible native report filters, not-applicable reasons, owned variances, protected
evidence references and separate review for material openings. It is an evidence
workflow, not a parallel ledger or automatic accounting approval. Real operator and
accountant acceptance, source-specific duplicate effectiveness, exact report-backed
opening reconciliation, cutover, rollback and migration acceptance remain in this
work order and must not be inferred from the packet, native import job, failed-row
download, reconciliation form, or receipt.

---

**Customer/order-to-cash authority:**
`BUNOOD-V1-ORDER-TO-CASH-AND-CUSTOMER-OPERATIONS-CONTRACT-2026-09-20.md` with
fail-closed target `quality/v1-order-to-cash-control-register.json`. It governs the
lead/customer/quote/order/fulfilment/invoice/collection/portal chain and its output.

**Cash, bank, payment, allocation, provider-settlement, and reconciliation
authority:** `BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md`
with fail-closed target register
`quality/v1-cash-bank-payment-control-register.json`. WO-12 through WO-14 use the
same native money chain and must not invent separate balances or collapse recorded,
allocated, captured, settled, and reconciled into one status.

### WO-12 — Receivables and collections centre

**Priority:** P1  
**Relative size:** Large  
**Depends on:** WO-00; customer statements must remain authoritative  
**Owner:** product + finance workflow engineering

**Outcome:** users can answer “who owes us, how late are they, and what should we do
next?” from one actionable workspace.

**Scope:**

- Native receivables summary with total outstanding, overdue amount, ageing buckets,
  promised payments, and customers requiring action.
- Filters by company, customer, salesperson, territory, due date, amount, and ageing.
- Drill-down from every number to the native invoices/payments producing it.
- Customer action drawer with balance, overdue invoices, recent payments, previous
  invoice, statement, contact details, and follow-up history.
- Manual and scheduled statement/reminder delivery using approved templates.
- Reminder policies by days overdue, amount, customer, and escalation step.
- Log delivery status and follow-up outcome without altering invoice balances.
- Permission-aware pause/opt-out and duplicate-message prevention.

**Out of scope:** legal debt collection and automatically modifying credit limits or
posting payments.

**Acceptance criteria:**

- Centre totals reconcile to ERPNext Accounts Receivable for the same filters.
- Partial payments, credits, disputed invoices, multi-currency invoices, and later
  reconciliation update the queue correctly.
- A scheduled run never sends the same policy step twice.
- Every message shows the correct customer, invoice, amount, due date, company,
  language, and reply/contact details.
- Users can preview and test-send before enabling a schedule.

**Measures:** overdue balance, days-sales-outstanding trend, promises kept, reminder
delivery failures, and time from invoice due date to first follow-up.

---

### WO-13 — Payment requests, links, and settlement visibility

**Priority:** P1 after the collections centre  
**Relative size:** Medium–Large; connector-dependent  
**Depends on:** WO-12 and WO-30 integration controls  
**Owner:** payments engineering + finance QA

**Outcome:** a collector can send a safe payment request and see whether the related
invoice is unpaid, partially paid, paid, failed, expired, or awaiting reconciliation.

**Scope:**

- Use native ERPNext Payment Request/Payment Entry capabilities where supported.
- Create and revoke permission-controlled payment links for eligible invoices.
- Display expiry, provider status, amount, currency, customer, invoice, and payment
  allocation state.
- Verify signed provider callbacks and make them idempotent.
- Never mark an invoice paid merely because a browser returned to a success page.
- Route received money through the native payment and reconciliation workflow.
- Keep request, authorization, capture, callback, allocation, settlement, bank
  credit, and reconciliation states visibly distinct under the controlling contract.

**Acceptance criteria:**

- Duplicate or delayed callbacks cannot duplicate a Payment Entry.
- Partial, over-, under-, failed, expired, refunded, and cancelled payments have
  explicit tested behavior.
- Link access reveals no unrelated customer or invoice data.
- Provider totals, Payment Entry allocation, General Ledger, and invoice outstanding
  amount reconcile exactly.

**Measures:** request-to-payment conversion, payment failure rate, time to settle,
unallocated payments, and reconciliation exceptions.

---

### WO-14 — Simplified bank import and reconciliation workbench

**Priority:** P1  
**Relative size:** Large  
**Depends on:** WO-01 operational controls and WO-11 import safety patterns  
**Owner:** accounting workflow engineering + accounting QA

**Outcome:** a finance user can import a statement, match transactions, create
missing native vouchers when authorized, and finish with an explained difference.

**Scope:**

- A Bunood task flow over native Bank Transaction and Bank Reconciliation records.
- Statement-file mapping, preview, duplicate detection, original-reference retention,
  and import result.
- Queues for suggested matches, unmatched receipts, unmatched payments, fees,
  transfers, and exceptions.
- Explain match evidence: amount, date, reference, party, and description.
- Support one-to-one, one-to-many, many-to-one, partial, and no-match outcomes that
  native ERPNext permits.
- Permission-aware creation of Payment Entry or Journal Entry through native APIs.
- Closing-balance and difference display with a completion checklist.
- Difference category, amount, currency, age, owner, due date, evidence, escalation,
  root cause, and resolution history.
- Cash/POS deposit and provider settlement handoffs where the statement row is the
  final bank evidence rather than the start of the chain.

**Out of scope:** opaque automatic posting and direct ledger manipulation.

**Acceptance criteria:**

- Importing the same statement twice does not duplicate accepted Bank Transactions.
- Opening balance, closing balance, imported movement, book balance, and difference
  are understandable and reconcile to native reports.
- Suggested matches require confirmation until their accuracy is proven and a later
  work order explicitly changes the policy.
- Reversing/unreconciling follows ERPNext rules and leaves a usable audit history.
- All test scenarios reconcile without duplicate bank or ledger movement.

**Measures:** auto-suggestion acceptance, unmatched-rate trend, duplicate prevention,
minutes per statement, and unexplained reconciliation difference.

**Implemented foundation (2026-09-20):** a bilingual, permission-filtered Bunood
banking cockpit now exposes native statement evidence, open allocations, ageing,
older items, recent imports and separately labelled book movement, then hands the
user to native Bank Statement Import, Bank Transaction, General Ledger and ERPNext
v16 `/banking`. It performs no matching or posting and makes no reconciliation
claim. Controlled duplicate/reimport, match/split/merge/partial/unmatch, difference
ownership and reviewer acceptance remain the promotion gate.

---

**Reporting and decision-support authority:**
`BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md` with fail-closed
target `quality/v1-decision-support-control-register.json`. WO-15 and BI-01 through
BI-05 use one permission-filtered native reporting chain from approved definition and
explicit context to source drill-down, governed delivery and reconciled evidence.

### WO-15 — Owner dashboard with trustworthy drill-down

**Priority:** P1  
**Relative size:** Medium  
**Depends on:** WO-00; may ship alongside WO-12  
**Owner:** product analytics + accounting QA

**Outcome:** an owner can understand business position and reach the underlying work
without exporting data to reconstruct basic answers.

**Initial cards:** cash/bank position, sales, gross profit where configuration makes
it reliable, receivables, overdue receivables, payables, VAT position, top customers,
and low-stock/reorder exceptions when inventory is enabled.

**Scope:**

- One explicit company, period, and currency context shared by the page.
- Clear comparison period and “as of” time.
- Every card links to the exact native report/list and visible filters behind it.
- Empty, loading, stale, permission-denied, and calculation-error states.
- Export only from authoritative native reports, not from visual-card HTML.
- Role-based visibility without revealing restricted totals through the API or DOM.

**Acceptance criteria:**

- Each card reconciles to its named ERPNext report for a controlled dataset.
- Submitted, cancelled, returned, partially paid, multi-currency, and date-boundary
  cases are covered.
- A user cannot infer a restricted company or account value.
- The page remains usable in Arabic/English and supported phone widths.
- No metric is labelled profit, cash, tax, overdue, or available stock unless its
  accounting definition is documented.

**Measures:** dashboard-to-source drill-down rate, report export rate, load time,
metric reconciliation failures, and recurring owner questions not answered.

---

**Procurement, inventory, valuation, count, and correction authority:**
`BUNOOD-V1-PROCUREMENT-INVENTORY-OPERATIONS-CONTRACT-2026-09-20.md` with fail-closed
target register `quality/v1-procurement-inventory-control-register.json`. WO-20
through WO-22 share the native request/order/receipt/bill/payment/correction chain
and keep physical, commercial, tax, payable, payment, stock and GL states distinct.

### WO-20 — Simplified purchase-to-pay workflow

**Priority:** P2, promote after pilot evidence  
**Relative size:** Large  
**Depends on:** WO-10/11; native purchasing configuration  
**Owner:** purchasing workflow engineering

**Outcome:** a small-business user can create a supplier, record or order a purchase,
receive goods where required, enter the supplier invoice, and pay it without losing
native controls.

**Scope:** supplier setup, Purchase Order, Purchase Receipt, Purchase Invoice,
Payment Entry, taxes, due dates, supplier reference, landed/stock behavior only where
native configuration requires it, and state-appropriate mapped actions.

The controlling contract adds Material Request/approved direct-buy boundaries,
quality acceptance/rejection, duplicate supplier-reference control, explicit
two-/three-way matching, Stock Received But Not Billed and provider/bank payment
handoff without making every small-business path mandatory.

**Acceptance criteria:**

- Service purchase, stock purchase, order-first, invoice-first, partial receipt,
  partial billing, partial payment, tax, and cancellation scenarios match native
  ERPNext outcomes.
- Required fields are reachable in Simple mode; specialist fields remain available
  in Advanced mode on the same document.
- Payable, stock, tax, and General Ledger reports reconcile after each scenario.

**Measures:** time to record a supplier bill, advanced-mode rate, validation failures,
and unmatched supplier payments.

---

### WO-21 — Simplified inventory operations and replenishment

**Priority:** P2  
**Relative size:** Large  
**Depends on:** WO-20 and verified warehouse/item configuration  
**Owner:** inventory workflow engineering

**Outcome:** users can see usable stock, transfer or adjust it safely, and act on
replenishment exceptions.

**Scope:** stock balance by warehouse, stock transfer, receipt/issue/material
movement, stock reconciliation with explicit approval, reorder exceptions, and
traceable links to native Stock Entries and Stock Ledger.

The controlling contract adds actual/projected/reserved/available definitions,
transit, scan recovery, batch/serial/expiry/UOM/dimensions, blind count/recount,
valuation/GL reconciliation and mobile warehouse presentation.

**Acceptance criteria:**

- Actual, projected, reserved, and available quantities are named accurately.
- Serial/batch, negative-stock policy, multiple UOM, valuation, and warehouse
  permissions follow native rules.
- Every quantity drills down to the native stock ledger or source document.
- Adjustment workflows show expected quantity/value impact before submission and
  require appropriate permission.

**Measures:** stock discrepancy rate, emergency stockouts, transfer time, adjustment
frequency, and low-stock exceptions resolved.

---

### WO-22 — Returns, credit notes, and debit notes

**Priority:** P2 before broad invoicing rollout  
**Relative size:** Medium–Large  
**Depends on:** stable sales and purchase flows; WO-20 for purchase returns  
**Owner:** finance workflow engineering

**Outcome:** authorized users can correct commercial transactions through native
return/credit/debit documents instead of editing history.

**Scope:** eligible source selection, native mapped return, quantity/rate correction,
stock impact, tax reversal, refund or balance treatment, reason/reference, and links
between original and corrective documents.

**Acceptance criteria:**

- Full/partial sales return, purchase return, credit without stock, debit/rate
  adjustment, and already-paid invoice cases are tested.
- The UI never suggests deletion or direct editing of a submitted original.
- Stock, tax, receivable/payable, payment, and General Ledger outcomes reconcile.
- Printed corrective documents clearly reference the original and use the correct
  Arabic/English terminology.

**Measures:** correction completion time, support interventions, unreconciled credits,
and attempts to alter submitted originals.

---

**POS and retail operating authority:**
`BUNOOD-V1-POS-RETAIL-OPERATIONS-CONTRACT-2026-09-20.md` with fail-closed target
register `quality/v1-pos-retail-control-register.json`. It controls readiness,
cashier sale, tender, receipt/ZATCA, return/refund, shift close/posting, device,
degraded/offline claims, performance and finance reconciliation.

### WO-23 — POS operational simplification

**Priority:** P2 only for customers with counter-sales demand  
**Relative size:** Large  
**Depends on:** verified POS profile, inventory, payment, printing, and returns flows  
**Owner:** POS engineering + retail QA

**Outcome:** a cashier can start a shift, find items by name/barcode, sell, take one
or multiple payments, print, return, and close the shift quickly and accurately.

**Scope:** cashier readiness, item-name-first search/cards, barcode input, stock and
price visibility, cart, discount permission, cash/card/mixed payment, receipt, held
sale where native support is safe, return handoff, and opening/closing reconciliation.

**Acceptance criteria:**

- Cash, card, mixed, partial/failed, return, out-of-stock, and offline/error recovery
  behaviors are explicit and tested.
- Item name is primary; item code remains available as a secondary identifier.
- Payment-mode accounts, invoice paid/outstanding state, POS closing, stock, and GL
  reconcile exactly.
- Touch targets, text, prices, totals, and actions remain readable at supported POS
  widths in both languages.

**Measures:** seconds per sale, scan/search failures, payment exceptions, closing
difference, void/return rate, and cashier support requests.

---

**Integration and connector operations authority:**
`BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md` with
fail-closed target `quality/v1-integration-connector-control-register.json`. WO-30 and
WO-31 share one provider-neutral control chain; each selected provider still requires
its exact authorization, mapping, production evidence, reconciliation and support scope.

### WO-30 — Integration framework and governance

**Priority:** P2/P3 before individual production connectors  
**Relative size:** Medium  
**Depends on:** WO-01 security/operations baseline  
**Owner:** platform engineering + security

**Outcome:** every external connector follows one secure, observable, idempotent,
and supportable contract.

**Scope:** credential storage, permissions, connection health, inbound/outbound event
log, idempotency key, retries with backoff, dead-letter/replay procedure, rate-limit
handling, field mapping, audit trail, test/sandbox mode, data minimization, and
connector disable/revoke control.

**Acceptance criteria:**

- Secrets never enter browser bundles, logs, exports, or ordinary DocType fields.
- Replayed events cannot duplicate financial or stock transactions.
- Operators can identify failed, delayed, and permanently rejected operations.
- Disabling a connector stops new work without corrupting completed native records.
- The framework has a reference test connector and failure-injection coverage.

**Measures:** connector success/failure rate, retry age, duplicates prevented, time to
diagnose, and unresolved dead-letter events.

---

### WO-31 — Deliver the first three packaged connectors

**Priority:** P3, selected from customer demand  
**Relative size:** Large per connector  
**Depends on:** WO-30; WO-13 for payment provider; WO-14 for banking  
**Owner:** integration engineering + domain QA

**Outcome:** Bunood ships supported integrations instead of asking every customer to
fund a custom project.

**Selection rule:** choose exactly one provider in each of the first three validated
categories: payment, bank/statement source, and ecommerce/order source. Confirm
customer demand, API availability, commercial terms, Saudi support, sandbox quality,
and reconciliation behavior before committing.

**Scope per connector:** setup wizard, permission/credential model, mapping, initial
sync boundary, incremental sync, conflict rules, retries, status, disconnect, audit,
support playbook, and end-to-end reconciliation.

**Acceptance criteria:**

- The connector passes provider sandbox and controlled production acceptance.
- Initial and incremental sync do not duplicate or silently overwrite native data.
- Financial/stock consequences reconcile to authoritative ERPNext reports.
- Failure, revocation, expired credentials, rate limits, changed external records,
  and out-of-order events have tested outcomes.
- Customer-facing support documentation identifies ownership on both sides.

**Measures:** activation success, sync latency, failure rate, reconciliation
exceptions, support contacts, and customer adoption.

## 4. Recommended execution sequence

```text
WO-00 Release gate ──┬── WO-10 Guided onboarding ── WO-11 Migration kit
                    ├── WO-12 Collections ──────── WO-13 Payment requests
                    ├── WO-15 Owner dashboard
                    └── WO-01 Production operations ── WO-14 Bank reconciliation
                                                    └── WO-30 Integration framework

Pilot evidence ─────┬── WO-20 Purchase-to-pay ───── WO-21 Inventory
                    ├── WO-22 Returns/credit notes
                    └── WO-23 POS (only if demanded)

WO-30 + demand evidence ── WO-31 First packaged connectors
```

## 5. Promotion gates

### Wave 0 → Wave 1

- The authoritative release receipt is complete.
- Production identity and ZATCA data are owner-confirmed.
- Physical A4/80 mm/QR acceptance passes.
- There is a tested backup and named incident owner.

### Wave 1 → Wave 2

- At least two pilot customers complete a billing cycle without a data-integrity
  incident.
- Onboarding, collections, dashboard, and banking metrics are being collected.
- The requested Wave 2 workflow is observed repeatedly in real customer work.
- The product owner approves its accounting/stock scenarios and support burden.

### Wave 2 → Wave 3

- The integration framework passes its security and idempotency review.
- A named customer and provider sandbox exist for each connector.
- Reconciliation and failure ownership are agreed before production activation.

## 6. Product-level definition of done

A work order is complete only when:

1. The business outcome works through native ERPNext records and permissions.
2. Arabic/English and desktop/narrow-width acceptance pass.
3. Financial or stock effects reconcile to named authoritative reports.
4. Automated tests cover success, permission failure, validation failure, duplicate
   request, and recovery/retry behavior where applicable.
5. Monitoring, audit evidence, user help, and operator/support instructions exist.
6. The deployed build and migrations are recorded and reproducible.
7. Product and domain owners sign the acceptance evidence.

## 7. Deliberately deferred

- Artificial-intelligence features of every kind.
- A new accounting, tax, inventory, payment, or reporting engine.
- A generic no-code report or workflow designer before the named operational
  dashboards and flows are proven.
- Connectors without a real customer, provider sandbox, reconciliation design, and
  support owner.
- Broad module expansion that is not supported by observed customer workflows.
