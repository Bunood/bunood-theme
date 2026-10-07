# Bunood V1 Work-Order Catalog

**Document date:** 2026-09-20  
**Authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Execution truth:** `BUNOOD-V1-EXECUTION-LEDGER-2026-09-20.md`  
**Primary ownership map:** `quality/v1-program-authority-map.json`  
**Saudi segment evidence:** `BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md`  
**Edition promotion gates:** `quality/v1-edition-promotion-gates.json`  
**Exclusion:** artificial-intelligence features are not part of V1.

## 1. Purpose

This catalog turns every identifier introduced by the V1 mega plan into a bounded,
assignable work order. It supplements the detailed `WO-*` orders in
`ERP-MARKET-RECOMMENDATIONS-WORK-ORDERS-2026-09-20.md`; it does not duplicate them.
The machine ownership map assigns every catalog and detailed order to exactly one
primary authority group while permitting explicit supporting-contract overlap.
WO-10 and WO-11 additionally operate under
`BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md` and its
fail-closed machine register, so setup progress or an import job cannot be mistaken
for accepted readiness or a reconciled cutover.

The detailed purchasing, warehouse, count, valuation and corrective-document target
is governed by `BUNOOD-V1-PROCUREMENT-INVENTORY-OPERATIONS-CONTRACT-2026-09-20.md`
and `quality/v1-procurement-inventory-control-register.json`. These controls apply
where OTC, finance and Saudi-tax work orders touch stock or purchase documents.

The cashier/retail target is governed by
`BUNOOD-V1-POS-RETAIL-OPERATIONS-CONTRACT-2026-09-20.md` and
`quality/v1-pos-retail-control-register.json`; POS speed never collapses sale,
payment, receipt, ZATCA, closing, native posting, settlement and reconciliation.

Every order must preserve ERPNext as the authority for documents, permissions,
posting, stock, tax, workflows, and ledgers. A screen, API, or upstream feature is
not complete until its role journey, denial tests, Arabic/English behavior,
responsive states, reconciliation, recovery, support owner, and evidence pass.

Status is deliberately not stored here. The execution ledger is the only status
source, so a planned catalog cannot be mistaken for a test receipt.

## 2. Foundation orders

**Production operations and support authority:**
`BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md`, enforced as a
planning target by `quality/v1-production-operations-control-register.json`. It keeps
build/deploy/smoke/business acceptance distinct and requires complete restore sets,
post-deploy-data-aware rollback, technical/business monitoring, incidents, safe support
access and a second operator before any production-ready claim.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| FND-01 | One neutral-first design system for tokens, typography, spacing, shape, fields, actions, tables, cards, overlays, focus, loading, and feedback. Remove decorative pill/card/green excess without forking native behavior. | Visual-token tests; representative form/list/report/POS screenshots in Arabic/English, light/dark, and four widths; no clipping, mixed static language, or unowned primitive. | WO-00 baseline |
| FND-02 | Role-specific homes and navigation for cashier, sales, buyer, warehouse, accountant, finance, owner, and administrator, with separate authority and experience-marker roles. | Positive/negative effective-permission probes; allowed/forbidden record fixtures; top-three role journeys; navigation never exceeds server permission. | WO-01 access policy |
| FND-03 | Universal five-zone form, dense-list, report, action, and recovery-state grammar over the same native documents in Simple and Advanced modes. | Machine-readable surface manifest; lifecycle/error-state tests; save/submit failure always restores controls and focus; no ready row blocks a transaction. | FND-01, FND-02 |
| FND-04 | Complete bilingual, RTL/LTR, terminology, responsive, keyboard, touch, zoom/reflow, screen-reader, and real-user usability contract for promoted surfaces. | Arabic/English static-copy and catalogue-conflict scans; the terminology governance gate passes; semantic/focus tests; WCAG 2.2 AA review; 1440/1024/700/430 evidence; mixed names/numbers/currency remain legible; the benchmark and persona thresholds in `BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md` pass. | FND-01, FND-03 |
| FND-05 | Reproducible release-quality system: the browser/API/database/cache/queue/recovery budgets in `BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md`, modular test orchestration, upstream pin drift, migrations, rollback, observability, research/evidence receipts, and privacy-safe artifact retention. | Clean install/migrate/upgrade/rollback rehearsal; Starter and Standard load/soak/peak/recovery gates meet the named p75/p95/p99, queue-age, correctness, availability, RPO, and RTO targets; deterministic suites; pinned compatibility report; deploy artifact hashes; de-identified run packet links the exact candidate to usability and technical evidence. | WO-01 |

## 3. Order-to-cash orders

**Customer and commercial authority:**
`BUNOOD-V1-ORDER-TO-CASH-AND-CUSTOMER-OPERATIONS-CONTRACT-2026-09-20.md`, enforced
as a planning target by `quality/v1-order-to-cash-control-register.json`. It keeps
customer, quote, order, delivery, invoice, payment, return and portal states distinct.

**Cash, bank, payment, and reconciliation authority:**
`BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md`, enforced as a
planning target by `quality/v1-cash-bank-payment-control-register.json`. Recorded,
allocated, captured, settled, bank-credited, and reconciled remain different states.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| OTC-01 | Customer and lead-to-order workspace covering lead/opportunity, customer, quotation, sales order, approvals, expiry, and source history with names primary and identifiers secondary. | New/existing customer journeys; partial/expired/rejected quotation cases; mapped native records; permission and record-scope denials. | FND-02, FND-03, WO-10 |
| OTC-02 | Complete native invoice lifecycle for service/stock, inclusive/exclusive VAT, discount, partial delivery/billing, due terms, draft/save/submit/cancel/return, print, and audit trace. | Invoice, tax, stock, receivable, Payment Ledger, and GL reconciliation; physical/PDF output; recovery after validation/server failure. | WO-00, KSA-02 |
| OTC-03 | Actionable receivables, ageing, promises, statements, reminders, disputes, and collection history without a second balance source. | Totals reconcile to Accounts Receivable; partial/credit/multicurrency cases; duplicate reminder prevention; delivery audit. | WO-12, OTC-02 |
| OTC-04 | Payment request, payment-link, receipt/allocation, partial/over/under payment, refund, failure, expiry, and settlement status through native Payment Request/Entry. | Signed/idempotent callback tests; provider-to-Payment Entry-to-GL-to-outstanding reconciliation; no browser-return success shortcut. | WO-13, WO-30, OTC-03 |
| OTC-05 | Customer portal and commercial-output family for quotations, orders, invoices, statements, payment links, attachments, A4, thermal, language, and permissions. | Cross-customer isolation; portal role tests; download/print/QR checks; Arabic/English parity; revoked link/session behavior. | OTC-01 through OTC-04, KSA-04 |

## 4. Finance and close orders

**Operating and acceptance authority:**
`BUNOOD-V1-EXPERT-FINANCE-AND-CLOSE-CONTRACT-2026-09-20.md`, enforced as a
planning target by `quality/v1-finance-close-control-register.json`. The contract
keeps native ERPNext documents and ledgers authoritative, distinguishes payment,
bank, cash, subledger, stock, asset, tax and FX reconciliation, and requires two
controlled closes before any finance domain is called verified.

FIN-03 and the payment/bank/cash portions of FIN-04 also use the more detailed
`BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md` and
`quality/v1-cash-bank-payment-control-register.json` for lifecycle, source,
matching, settlement, difference, Saudi connector and evidence controls.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| FIN-01 | Guarded chart-of-accounts and accounting-dimension setup with plain-language impact, company scope, validation, and change audit. | Fresh-company and existing-company scenarios; invalid hierarchy/scope denials; transaction and report dimension propagation. | WO-10, FND-02 |
| FIN-02 | Journal workbench for templates, accruals, reversals, prepayments, deferred revenue/expense, allocations, recurring entries, attachments, and approval. | Balanced-entry validation; schedule/reversal tests; workflow denials; GL and source trace; no direct ledger editing. | FIN-01 |
| FIN-03 | Bank import, matching, voucher creation, reconciliation, unmatch/reverse, and explained difference over native Bank Transaction/Reconciliation. | Duplicate import prevention; one-to-one/one-to-many/many-to-one/partial tests; statement-to-book-to-GL reconciliation. | WO-14, FIN-01 |
| FIN-04 | AR/AP control accounts, ageing, advances, unallocated payments, credits, party reconciliation, and subledger-to-GL sign-off. | AR/AP and Payment Ledger totals reproduce GL control balances for returns, partials, advances, and multicurrency. | OTC-03, WO-20, FIN-01 |
| FIN-05 | Fixed-asset lifecycle: class/setup, acquisition/capitalization, depreciation, transfer, impairment where supported, disposal, and register. | Asset register, depreciation schedules, disposal gain/loss, and GL reconcile; period/permission controls pass. | FIN-01, WO-20 |
| FIN-06 | Multi-currency transaction, rate source, realized/unrealized exchange, revaluation, settlement, and reporting controls. | Foreign invoice/payment/revaluation scenarios reconcile party, bank, exchange accounts, and statements at controlled rates. | FIN-01, FIN-04 |
| FIN-07 | Budgets, cost centres, projects, branches/departments, allocations, commitments where supported, and variance analysis. | Dimension/budget enforcement and override workflow; source drill-down; actual/commitment/budget variance reconciliation. | FIN-01 |
| FIN-08 | Period-close cockpit implementing the expert-finance contract: continuous queues, configurable pre-close/T+1–T+5 dependencies, evidence-backed reconciliations, soft close, native Accounting Period/frozen-account protection, correctly described Period Closing Voucher, governed reopen/relock, and sign-off. | Two consecutive controlled closes (normal and exception); every completed task has source boundary, preparer, reviewer and evidence; late posting and unauthorised reopen are denied; affected work returns to review after reopen; immutable close packet. | FIN-02 through FIN-07, KSA-02 |
| FIN-09 | Curated Trial Balance, GL, P&L, Balance Sheet, Cash Flow, tax, audit-trail, comparative, and supported consolidation views. | Each published figure drills to permitted source rows and reconciles under date, company, currency, return, and cancellation boundaries. | FIN-04, FIN-08, BI-01 |
| FIN-10 | Expert accountant workbench with compact keyboard-first tables, saved filters, batch review, source trace, notes, attachments, export, and exceptions. | Accountant completes agreed posting/reconciliation/close tasks without spreadsheet reconstruction; actions remain permission/audit governed. | FND-03, FIN-02 through FIN-09 |

**FIN-02 implementation foundation (2026-09-20):** a route-scoped bilingual Journal
workbench now exposes a bounded, permission-filtered native queue; distinct draft,
unbalanced, submitted, cancelled, reversal and generated states; same-Company
template and Auto Repeat evidence; safe document-choice guidance; and direct native
accounting handoffs. It never posts or approves a journal and does not replace the
task-designed accrual, prepayment, deferral, allocation, attachment, reversal,
recurrence, segregation or source-to-GL acceptance journeys.

**FIN-08 implementation foundation (2026-09-20):** a route-scoped bilingual close
cockpit now exposes permission-filtered draft-source attention, bounded native period
controls, non-approving evidence stages and direct report/document handoffs. It does
not post, reconcile, approve, lock or certify, and the configured close calendar,
owner/reviewer evidence, governed reopen/relock and immutable close packet remain
acceptance gaps.

## 5. Saudi compliance orders

**ZATCA and VAT operating authority:**
`BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`, enforced as a
fail-closed target by `quality/v1-zatca-control-register.json`. It preserves the
different standard-clearance and simplified-reporting lifecycles and never treats an
SDK pass, queued request, duplicate response or warning as clean ZATCA acceptance.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| KSA-01 | Per-company Saudi legal identity and national-address readiness: Arabic/English names, VAT/CR and required address/contact fields, branch/device ownership, and evidence age. | Owner-confirmed values; missing/invalid readiness states; company isolation; outputs never invent legal data. | WO-10 |
| KSA-02 | VAT configuration and operations for standard, zero, exempt, inclusive/exclusive, reverse-charge where applicable, returns, discounts, rounding, and VAT reporting. | Qualified-accountant scenario set; invoice/tax account/VAT report/GL reconciliation; documented supported interpretation. | KSA-01, FIN-01 |
| KSA-03 | ZATCA Phase 2 onboarding and credential governance for sandbox/production, EGS, CSID, expiry, renewal, revoke, access, and environment separation. | Authorized onboarding checklist; secret/access review; sandbox issuance; expiry/revocation and backup/restore behavior. | KSA-01, WO-01 |
| KSA-04 | Standard clearance and simplified reporting lifecycle with XML/QR generation, signed submission, EGS/counter/hash integrity, response retention, explicit queued/warned/cleared/reported/rejected states, retry, rejection explanation, and monitoring. Marketing states only the exact reviewed compliance scope and never substitutes an unqualified “approved” badge for evidence. | ZATCA validator/sandbox evidence; idempotent retry; offline/delayed/warned/rejected cases; XML/QR/ERPNext values reconcile; physical output and configured-company reviewer sign-off. | KSA-02, KSA-03, WO-30 |
| KSA-05 | Saudi corrective-document and withholding operations: credit/debit notes, original reference, rate correction, supported withholding setup/reports, and audit outputs. | Full/partial paid/unpaid stock/non-stock corrections reconcile tax, party, payment, stock, GL, XML, and print; external review. | WO-22, KSA-02, KSA-04 |
| KSA-06 | Implement the bounded `BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md`: controller/processor roles, versioned processing inventory/RoPA, purpose, notice and consent where approved, all six subject-right request types, retention/holds/disposition, processors/subprocessors, transfer review, impact assessment, DPO assessment, breach workflow, security and evidence. | `npm run v1:pdpl:contract` preserves the target; promotion requires qualified Saudi privacy/legal review plus all twelve candidate-bound acceptance groups in `quality/v1-pdpl-control-register.json`. Tenant/role/company/subject isolation passes; disposition and restored backups do not corrupt GL, Payment Ledger, Stock Ledger, tax/ZATCA, payroll or audit truth; the 30-day request and threshold-dependent 72-hour breach clocks are exercised without claiming unsent notices. | WO-01, WO-30 |
| KSA-07 | Compliance readiness and evidence centre aggregating company, VAT, ZATCA, privacy, payroll, credential, rejection, and review exceptions without claiming certification. | Every status has source, owner, age, remediation, permission, and evidence link; stale/unknown/error states are explicit; reviewer sign-off. | KSA-01 through KSA-06, HR-05 |

## 6. Reporting and decision-support orders

**Operating and acceptance authority:**
`BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md`, enforced as a
planning target by `quality/v1-decision-support-control-register.json`. Every promoted
answer has an approved definition, explicit company/date/currency/dimension/status
context, effective permissions, exact drill-down, meaningful result state and
controlled-data reconciliation. Structural validation is not report acceptance.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| BI-01 | Versioned metric dictionary defining question, formula, native source, filters, company/currency/date basis, permissions, “as of,” comparison, empty/error state, and owner. | Accounting/product sign-off; automated controlled-dataset reconciliation for every promoted metric. | FIN-01 |
| BI-02 | Owner business-pulse dashboard for cash/bank, sales, reliable gross profit, receivables/overdue, payables, VAT, inventory exceptions, and trends. | WO-15 criteria plus role/API leakage tests, exact-filter drill-down, four-width bilingual acceptance, and load budget. | WO-15, BI-01 |
| BI-03 | Cashier, sales, buyer, warehouse, accountant, and finance-manager work queues focused on exceptions and next actions, not decorative KPIs. | Each role answers agreed daily questions and reaches permitted source tasks; zero/empty/denied/error states are distinct. | FND-02, BI-01 |
| BI-04 | Question-led report catalogue with curated defaults, saved views, filters, columns, grouping, export, print, and governed scheduled delivery. | Role discovery tests; saved/scheduled permission isolation; export/print parity; representative report reconciliation and performance. | FIN-09, BI-01 |
| BI-05 | Governed custom-report path for trained users using permission-filtered sources, bounded fields/joins, review, ownership, versioning, and retirement. | Attempted permission bypass, unsafe query, excessive volume, sensitive export, and orphaned schedule are denied/audited. | BI-04, WO-01 |

## 7. People and Saudi payroll orders

**Operating and acceptance authority:**
`BUNOOD-V1-SAUDI-PEOPLE-PAYROLL-CONTRACT-2026-09-20.md`, enforced as a planning
target by `quality/v1-saudi-payroll-control-register.json`. It keeps Frappe HR and
ERPNext native records authoritative, uses effective-dated reviewed Saudi rule
packs, and separates calculation, approval, accrual, file generation, external
submission/acceptance, payment and reconciliation.

| ID | Outcome and bounded deliverables | Acceptance evidence | Depends on |
|---|---|---|---|
| HR-01 | Employee self-service for profile, documents, leave, time, expense status, payslips, and requests with strict self/manager/HR boundaries. | Cross-employee negative tests; Arabic/English/mobile journeys; attachment/privacy/notification audit. | FND-02, KSA-06 |
| HR-02 | Expense claim flow with policy, receipt, project/cost centre, approval, reimbursement, advance, rejection, and accounting handoff. | Submitted/approved/rejected/partial/advance cases; duplicate receipt controls; payable/payment/GL reconciliation. | HR-01, FIN-01 |
| HR-03 | Validated attendance, shift, overtime, absence, leave interaction, correction, device import, and approval for supported customer workflows. | Parallel source comparison; late/duplicate/device-failure cases; employee/manager/HR permissions; approved payroll input totals. | HR-01, WO-30 |
| HR-04 | Implement the Saudi payroll contract over native Salary Structure Assignment, Payroll Entry, Salary Slip and accounting records: effective structures, allowances/deductions, loans/advances, leave/time inputs, deterministic gross-to-net, explainable GOSI classification, final settlement under qualified review, accrual, payslips and bank/WPS output. Contract wage, approved payroll, paid/WPS amount, GOSI contributory wage, liabilities, employee balances and GL remain one versioned chain. | Two controlled parallel cycles (normal and exception); per-employee and period variance; regular/retro/off-cycle/final-settlement scenarios; gross-to-net, liabilities, bank output/payment evidence, employee balances and GL reconcile; external HR/payroll/legal/accounting sign-off. | HR-02, HR-03, FIN-01 |
| HR-05 | Qiwa contract-reference/status, Wage Protection/Mudad, GOSI and bank-facing files or connectors only for current authorised interfaces, with payload identity, validation, approval, submission/acknowledgement/acceptance, row rejection, correction/supersession, privacy and support ownership. Generated, submitted, accepted and paid remain different states. | Official-interface/legal/privacy review; sandbox or controlled submission; authentic response bound to exact payload; contract/payroll/WPS/GOSI/payment/GL totals reconcile; rejection/partial/delay/retry/revoke and evidence retention pass. | HR-04, WO-30, KSA-06 |

**Integration and connector authority:**
`BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md`, enforced as
a planning target by `quality/v1-integration-connector-control-register.json`. It
requires the three customer-selected categories, least-privilege native APIs, signed
and duplicate-safe messages, explicit queue/recovery states, external/native
reconciliation and provider-specific production evidence before a supported claim.

## 8. Dependency and promotion rule

The practical critical path is:

```text
WO-00/WO-01
  -> FND-01..05 + WO-10/WO-11
  -> OTC-01..05 + WO-20..23 + FIN-01..04 + KSA-01..04 + BI-01..03
  -> FIN-05..10 + KSA-05..07 + BI-04..05
  -> HR-01..05 + WO-30/WO-31 customer-selected connectors
  -> design-partner billing/close cycles -> V1 GA receipt
```

Parallel work is permitted only when shared authority, data, permission, and design
contracts are stable. No downstream order may be promoted on screenshots or upstream
availability alone.

## 9. Definition of ready and done

A work order is **ready** only when it has a named product owner, domain owner,
implementation owner, candidate environment, exact supported scenario, dependencies,
fixture/data plan, legal/compliance review where relevant, and measurable gate.

A work order is **done** only when:

1. its native authoritative records and permission boundary are documented;
2. positive, negative, recovery, duplicate/idempotency, and reconciliation tests pass;
3. Arabic/English, RTL/LTR, keyboard/touch, light/dark, and required widths pass;
4. monitoring, audit, help, runbook, support ownership, and upgrade behavior exist;
5. run-owned cleanup proves unrelated persistent data was not changed; and
6. the execution ledger links the exact candidate, commands, artifacts, external
   sign-offs, limitations, and release decision.
