# Bunood V1 reporting and decision-support contract

**Document date:** 2026-09-20  
**Scope:** WO-15, BI-01 through BI-05, and FIN-09  
**Machine register:** `quality/v1-decision-support-control-register.json`  
**Status:** approved planning authority; implementation and acceptance remain open

> This contract assists reporting and reconciliation workflows. It is not financial,
> accounting, tax, investment, or management advice and is not an audit opinion.
> Qualified finance, accounting, tax, security, and privacy reviewers must approve the
> configured definitions and sign the controlled-period evidence before production use.

## 1. Decision

Bunood will not ship an attractive wall of disconnected KPI cards. V1 decision support
is a governed path from one business question to one approved definition, an explicit
scope, a permission-filtered native result, exact-filter drill-down, a next action, and
reconciliation evidence. Owners get plain-language answers; accountants keep source,
filter, currency, dimension, period, status, and voucher traceability.

The authoritative chain is:

`submitted native source → effective permission → approved definition → explicit
context → result and freshness → decision surface → exact drill-down → governed
delivery → reconciliation and change history`.

ERPNext submitted documents, GL Entry, Payment Ledger Entry, Stock Ledger Entry,
standard reports, role/user permissions, accounting dimensions, and workspaces remain
authoritative. Bunood may curate, explain, group, compare, and route. It must not create
a second KPI ledger, a reporting database presented as financial truth, or a dashboard
state that overrides native records.

## 2. Research translated into product rules

The official ERPNext reporting guidance says to begin with the question, not the report
name, and distinguishes General Ledger, Trial Balance, financial statements, AR/AP,
Payment Ledger and their filter bases. It also warns that company, dates, Finance Book,
dimensions, currency and period-closing options change results. Therefore every
promoted Bunood value exposes this context and drills to permitted native evidence.

ERPNext Report Builder supports saved columns, filters, sorting, grouping and
aggregation; Auto Email Report executes a saved report for a selected user whose
permissions apply. Bunood keeps those capabilities but adds request/review/publish,
recipient, export and change governance. Scheduled delivery never becomes a permission
bypass or a timeless snapshot with no “as of” state.

Saudi operation adds three hard boundaries:

1. ZATCA requires appropriate VAT records supporting calculations and returns. Tax
   summaries therefore reconcile to source documents, tax ledgers, return support and
   GL; a dashboard is not a filed return.
2. SOCPA endorses IFRS and IFRS for SMEs for application in Saudi Arabia, with Saudi
   endorsement material. Financial-statement labels, classifications, consolidation
   and disclosures require the organisation's qualified accounting policy and cannot
   be invented by the UI.
3. Reports, exports and scheduled delivery may contain personal or confidential data.
   Effective row/user permissions, recipient review, retention, revocation and Saudi
   privacy controls apply before aggregation and delivery—not only to the page shell.

Primary sources:

- [ERPNext Accounting Reports](https://docs.frappe.io/erpnext/accounting-reports)
- [ERPNext Accounting Introduction](https://docs.frappe.io/erpnext/accounting-introduction)
- [ERPNext General Ledger](https://docs.frappe.io/erpnext/general-ledger)
- [ERPNext Accounting Dimensions](https://docs.frappe.io/erpnext/accounting-dimensions)
- [ERPNext role-based permissions](https://docs.frappe.io/erpnext/permissions)
- [ERPNext user permissions](https://docs.frappe.io/erpnext/user-permissions)
- [ERPNext Auto Email Reports](https://docs.frappe.io/erpnext/auto-email-reports)
- [Frappe Desk and Report Builder](https://docs.frappe.io/erpnext/v13/user/manual/en/using-erpnext/desktop)
- [ZATCA VAT guideline](https://zatca.gov.sa/en/RulesRegulations/VAT/Documents/VAT%20%20Real%20Guidelines%20English%20Web.pdf)
- [SOCPA endorsement documents](https://socpa.org.sa/Socpa/Pages/Knowledge-Center/101.aspx?lang=en-us)
- [Saudi PDPL guide](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP/)

## 3. One metric definition, not one ambiguous number

Before a metric can appear on an owner home, role queue, report catalogue, export or
scheduled message, its versioned definition records all fields enforced by the machine
register, including:

- the business question, bilingual name, business/technical owners and effective date;
- formula plus inclusion/exclusion, document-status and cancellation rules;
- exact native report, DocType, ledger and fields;
- company/legal entity, consolidation, period, timezone and “as of” basis;
- company/presentation currency, exchange-rate basis, precision, sign and display unit;
- Finance Book, Cost Center, Project, branch, warehouse and other dimensions;
- effective role, user and row permissions;
- freshness threshold, comparison, target, trend and variance basis;
- drill-down route with identical filters and source-voucher path;
- zero, empty, stale, partial, denied, unavailable and error behavior; and
- reviewer, version, change reason, superseded definition and recovery path.

The UI shows a compact explanation such as “Submitted sales invoices, net of returns,
1–30 September, Bunood Development, SAR, refreshed 10:42” with a Definition action.
Advanced context remains available without forcing a cashier or owner to understand
ledger implementation.

## 4. Meaningful states

Metric definitions move only through `draft → accounting review → product review →
approved → active`, with suspension, supersession and retirement kept explicit.

Results never collapse into a generic blank card. V1 distinguishes loading,
configured-empty, current, stale, partial, permission-limited, source unavailable,
calculation error, open reconciliation difference and reconciled. A stale figure keeps
its last successful “as of” value only with a visible stale warning and retry/support
path. Denied data is not displayed as zero. Partial data is not presented as complete.

## 5. Surfaces by job

### 5.1 Owner business pulse

The default owner view answers a short set of decisions rather than displaying every
available chart:

- What cash is actually available, and what remains only recorded, settling or
  unreconciled?
- What was invoiced, returned, collected and overdue in the selected period?
- Is gross profit reliable for this configuration, and what cost/stock boundary is it
  using?
- What is payable soon, what VAT needs review, and what inventory exception needs an
  owner?
- What materially changed against a named comparison period, target or prior value?

Every answer has the scope and “as of” context, exact drill-down and one relevant next
action. Gross profit stays unavailable—with a specific setup explanation—until stock,
valuation, COGS and return boundaries pass reconciliation.

### 5.2 Role work queues

Cashier supervisors, sales, buyers, warehouse, accountants and finance see owned
exceptions and next actions: unsettled shifts, overdue promises, purchase receipts not
billed, shortages, count differences, unreconciled bank rows, close blockers, failed
deliveries, stale sources and permission-safe support paths. Decorative KPIs never
displace the queue.

### 5.3 Question-led report catalogue

Users start with questions (“Which customers need collection?” or “Why did cash change?”)
and see the correct report, a one-sentence explanation, safe defaults and common saved
views. Search covers Arabic/English names, aliases and business terms. Report runs expose
filters, selected columns/grouping, row count, freshness and the result state.

### 5.4 Governed custom reporting

Trained users may request or author custom reports, but publication requires named
source, permission review, query/code review where applicable, controlled-data totals,
Arabic/English labels, performance budget, owner/reviewer, version and disable/rollback
path. Report code cannot write documents or ledgers. Direct database credentials are
not a reporting feature.

## 6. Reconciliation standard

Each controlled dataset or period uses the same company, dates, timezone, Finance Book,
currency, dimensions, document states and closing options across all compared results.
Differences record category, amount, currency, age, owner, due date, evidence, root cause
and resolution. At minimum, V1 reconciles:

- sales commitment/delivery/invoice/return/revenue/receivable/cash;
- purchase order/receipt/bill/return/payable/cash;
- Payment Ledger/Payment Entry/provider settlement/bank/GL;
- Stock Ledger/valuation/COGS/gross profit/count/GL;
- VAT source/tax ledger/return support/GL;
- Trial Balance/General Ledger/statements/source vouchers; and
- card/queue/report/drill-down/export/print/scheduled copy for identical filters.

Reconciliation means a proven equation plus explained differences, not two screenshots
that appear similar. Standard equations include `opening + activity = closing`,
`invoices - credits - allocated payments = outstanding`, and `book amount - external
evidence = explained difference`, adapted and signed by the qualified reviewer.

## 7. Permission, privacy and delivery boundary

Permissions are evaluated before aggregation and again at drill-down/export/delivery.
Tests cover company, branch, territory, warehouse, customer, supplier, employee and
other configured User Permissions; field masking; report/export rights; API access;
scheduled recipients; revoked users; shared links; files; cache keys; and cross-tenant
negative cases. A user must never infer a restricted total from a card, comparison,
trend, cache, row count or export filename.

Scheduled reports record the effective user, definition version, filters, recipients,
generation time, expiry/retention, delivery result and retry history. Duplicate retries
do not send conflicting copies without visible history.

## 8. Experience and performance

- Simple surfaces lead with the question, answer, context, next action and source.
- Advanced reports retain complete native filters, dimensions and audit trace.
- Arabic and English preserve meaning, filter order, numbers, currency, dates, exports,
  print and scheduled content; RTL never reverses financial meaning or table columns.
- Desktop, tablet, compact and phone remain navigable by keyboard, touch and assistive
  technology. Tables prioritize readable names and values instead of clipped codes.
- Each query, card, drill-down, export and scheduled job has a named performance budget.
  Caching is keyed by permission and context and is invalidated or visibly stale.

## 9. Acceptance gate

Structural validation of this document/register is not product acceptance. Promotion
requires at least two candidate-bound controlled datasets or periods: one normal and
one with returns, cancellation/amendment, zero/empty, stale/partial source, denied data,
calculation/delivery failure and an open reconciliation difference.

Acceptance requires all twelve evidence groups in the machine register, exact
card/report/drill/export/print/schedule reconciliation, permission and cross-tenant
negative tests, real owner and operational-role task studies, bilingual responsive and
accessible evidence, query/load/delivery budgets, support/recovery, and qualified
finance/accounting/tax/security/privacy sign-off. Only then may an individual metric or
report definition become active; no structural test marks it “verified.”
