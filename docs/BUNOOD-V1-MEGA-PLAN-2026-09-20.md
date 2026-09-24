# Bunood V1 Mega Plan — Saudi-First ERP Without ERP Friction

**Document date:** 2026-09-20  
**Status:** authoritative for post-MVP product planning  
**Audience:** product owner, design, engineering, accounting/compliance, QA,
implementation, operations, and support  
**Current-release authority:** the MVP release remains governed by
`BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md` until its release gate
is signed. This document governs the V1 program after that gate.  
**Explicit exclusion:** artificial-intelligence features are not part of V1.

## 1. Executive decision

No ERP can literally be perfect for every person and every industry in one release.
Trying to achieve that with one screen produces exactly the complexity customers
dislike. Bunood V1 will instead be a universal Saudi business foundation with:

1. one authoritative ERPNext business and accounting engine;
2. role-specific workspaces for cashiers, operators, managers, owners, and expert
   accountants;
3. progressive disclosure from Simple to Expert without changing the document;
4. complete Saudi commercial, tax, privacy, payroll, and payment readiness for the
   supported workflows;
5. a restrained, consistent, bilingual design system across forms, lists, reports,
   dashboards, portals, and print; and
6. measurable onboarding, support, reliability, and reconciliation—not only a long
   feature list.

The V1 promise is:

> A new employee can complete their daily job without learning ERP terminology,
> while an expert accountant can inspect, control, reconcile, and report every
> underlying transaction without leaving the same system.

## 2. Research basis and limitations

This plan combines:

- the full local documentation inventory and previous Bunood audits;
- verified-user ERP research and small-business surveys;
- official Saudi regulatory and market sources;
- public product documentation from Saudi and Saudi-localized competitors; and
- recurring practitioner complaints used only as qualitative corroboration.

The strongest recurring market needs are simplicity, connected data, reporting,
automation, integrations, support, and dependable implementation. Capterra's
verified small-business ERP users rank order management, billing, reporting,
accounting, and inventory as the five most important capabilities, each rated
critical or highly important by 84–91% of users. Intuit's survey of 630 leaders at
10–99 employee businesses found demand for more automation (72%) and better
integration (64%).

Sources:

- [Capterra: ERP for small business](https://www.capterra.com/resources/does-your-small-business-need-erp/)
- [Capterra: ERP selection guide](https://www.capterra.com/resources/erp-selection-guide/)
- [Intuit Business Solutions Survey](https://erp.intuit.com/blog/research/business-solutions-survey-2024/)
- [Saudi SME cloud-accounting adoption study](https://doi.org/10.1016/j.joitmc.2024.100314)
- [Saudi SME ERP performance study](https://doi.org/10.3390/JOITMC6030087)

The Saudi evidence, observations, interpretations, target segments, Bunood gap
comparison, and remaining primary research are synthesized separately in
`BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md`. That document distinguishes
official market observations from product hypotheses; neither vendor claims nor desk
research may be presented as customer acceptance.

Vendor pages describe advertised capabilities, not independent proof of usability or
compliance. Regulatory interpretation and production activation require qualified
Saudi accounting, tax, privacy, labor, security, and legal review.

## 3. What the Saudi market changes

### 3.1 E-invoicing is a small-business requirement, not an enterprise extra

ZATCA Phase 2 introduces structured formats, additional fields, security controls,
and Fatoora integration. The July 2026 Wave 25 announcement reaches taxpayers with
VAT-subject revenue above SAR 187,500 in any of 2022–2025, showing that integration
readiness now reaches very small businesses.

Product consequence: ZATCA onboarding, status, rejection recovery, credit/debit
notes, immutable audit evidence, QR/XML storage, and operational monitoring must be
part of the normal product—not a hidden implementation project.

The official material also changes the product and marketing contract:

- Standard B2B invoices require the clearance lifecycle; simplified B2C invoices
  require the reporting lifecycle. A locally generated document is not evidence that
  either external lifecycle completed.
- The EGS unit, credentials, invoice counter, previous-document hash, XML, QR,
  submission attempt, response, and corrective document must remain traceable.
- The UI must distinguish ready, queued/delayed, submitted, warned/non-compliant,
  cleared/reported, rejected, retrying, and terminal support-required states without
  turning an HTTP response or browser return into accounting success.
- ZATCA describes its provider directory as indicative and says taxpayers may use an
  unlisted provider that meets the requirements. Bunood must therefore claim only the
  exact reviewed compliance scope; it must not use an unqualified “ZATCA approved”
  badge as a substitute for configured-company evidence.

- [ZATCA rollout phases](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx)
- [ZATCA Wave 25 announcement](https://zatca.gov.sa/en/MediaCenter/News/Pages/Wave25-E-invoicing.aspx)
- [ZATCA technical and educational library](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx)
- [ZATCA e-invoicing specifications and provider-directory statement](https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx)

### 3.2 Arabic is operational content

Arabic and English must expose the same task, data, state, help, validation, print,
and recovery behavior. Master data may contain either language, but static labels
must never mix languages on a completed surface. RTL is a functional layout mode,
not a mirrored cosmetic skin.

Canonical product terms, context-sensitive accounting words, Frappe extraction
rules, review ownership, and release gates are governed by
`BUNOOD-V1-BILINGUAL-TERMINOLOGY-GOVERNANCE-2026-09-20.md`. Catalogue coverage
without semantic and rendered-context review is not language acceptance.

### 3.3 Privacy and cloud operations are product requirements

The Saudi PDPL applies to personal-data processing in the Kingdom and can also apply
to parties outside the Kingdom processing data related to Saudi residents. Saudi
cloud regulation also defines obligations for cloud providers and customers.

Product consequence: data inventory, purpose and retention rules, access/export,
correction/deletion workflows where legally allowed, processor governance, breach
response, audit logs, backups, encryption, and cross-border transfer review belong
in V1 operations. Their exact product roles, six subject-right workflows, processing
register, 30-day request clock, threshold-dependent 72-hour breach clock,
processor/transfer gates, non-destructive accounting rules and acceptance evidence
are governed by `BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md`.

SDAIA explicitly distinguishes its controller/processor guidance from binding law.
Consequently Bunood can provide evidence, workflows, and configurable controls, but
only qualified legal/privacy review may approve a customer's interpretation. Product
copy must not claim blanket “PDPL certification.”

- [SDAIA guide to the Saudi PDPL](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP/)
- [CST cloud-computing regulations](https://www.cst.gov.sa/regulations-and-licenses/regulations/Document-1550)

### 3.4 Saudi finance extends beyond invoices

SOCPA has endorsed IFRS and IFRS for SMEs for application in Saudi Arabia. Expert
accountants therefore need traceable ledgers, period controls, assets, accruals,
dimensions, multicurrency handling, close evidence, and financial statements—not
only attractive invoices.

- [SOCPA documents of endorsement](https://socpa.org.sa/Socpa/Pages/Knowledge-Center/101.aspx?lang=en-us)

### 3.5 Payments and banking require governed partners

SAMA's Open Banking Framework includes use cases, business rules, technical
standards, customer-experience guidance, and a conformance lab. Bunood may integrate
with licensed/certified participants; it must not present itself as a payment service
provider merely because it can call an API.

Every bank connector is therefore a separately promoted capability: named authorized
partner, consent journey, sandbox/conformance evidence, account and transaction scope,
revocation, duplicate handling, degradation behavior, settlement reconciliation,
support owner, and production authorization are all required. Screen scraping or
credential capture is not an acceptable substitute.

- [SAMA Open Banking Framework](https://www.openbanking.sama.gov.sa/index-en.html)
- [SAMA payment-services regulations](https://www.rulebook.sama.gov.sa/en/implementing-regulations-payments-and-payment-services-law)

### 3.6 Payroll must respect Saudi operating workflows

Saudi employer workflows include wage-protection reporting, Qiwa employment contracts,
Mudad payroll processing, and GOSI wage records. In January 2026 MHRSD described an
enforcement path that compares documented contract wages with Mudad payment records and
connects Qiwa, Mudad, and Najiz. GOSI's official monthly-wage workflow also supports
reviewing an uploaded wage file after processing.

V1 payroll must therefore reconcile contract terms, approved payroll, bank/WPS output,
paid amounts, GOSI contributory wages, liabilities, and GL posting per employee and pay
period. A payslip or generated file alone is not success. Government-facing connectors
remain separately gated until the current interface, authorization, validation,
submission, correction, and support contract are verified.

- [GOSI Wage Protection Program](https://www.gosi.gov.sa/GOSIOnline/Wages_Protection_Program)
- [GOSI monthly wage update](https://beta.gosi.gov.sa/en/services/business/Wage_Update_)
- [MHRSD: documented employment contract enforcement through Qiwa, Mudad, and Najiz](https://www.hrsd.gov.sa/si/node/5578694)

## 4. Saudi competitor lessons

The following matrix records public product claims, not an independent product
certification.

| Product | Public strength | Lesson for Bunood |
|---|---|---|
| Qoyod | Separate business-owner and accountant editions on one accounting foundation; ZATCA Phase 2; accountant tools; POS with offline, barcode, split payments, returns, and shifts | Role-specific experience can change without weakening the ledger. Bunood must match offline/recovery clarity and accountant depth. |
| Wafeq | Accounting, ZATCA invoicing, inventory, payroll, 40+ reports, VAT return, fine-grained permissions, multi-branch/entity; its published 2025 update also exposes compliance checks, delayed reporting, explicit ZATCA states, and batch actions | V1 needs a complete finance story, visible permission/branch controls, and an exception workbench—not only transaction entry. External integration state must be understandable without opening logs. |
| Daftra | Broad ERP/CRM/HR/inventory/operations, many verticals, mobile and offline POS, workflow breadth; public POS material emphasizes split/partial tender, returns, shifts, hardware, explicit sync, and 24/7 support | Breadth wins evaluations, but Bunood should package breadth as coherent task editions rather than a giant menu. Offline is an operational product with conflict, sync, reconciliation, and support obligations. |
| Foodics | Deep cashier/restaurant workflow, payments, inventory/recipes, shifts, reporting, approvals, marketplace | Industry depth and ecosystem can beat generic ERP breadth. POS must be optimized for the worker's environment. |
| Odoo | Broad modular ERP, Saudi fiscal reports, ZATCA Phase 2 and POS localization, withholding tax, Saudi payroll localization | Saudi localization must cover accounting, POS, tax, and payroll together. Upgrade-safe modularity matters. |
| Zoho Books | Banking/reconciliation, VAT/ZATCA, inventory/reorder, approvals, ecommerce sync, 70+ customizable reports and scheduled sharing | Bank automation, useful reporting, approvals, and integrations are expected even by smaller firms. |

Sources:

- [Qoyod accounting](https://www.qoyod.com/en/accounting-software/)
- [Qoyod POS](https://www.qoyod.com/en/point-of-sale/)
- [Wafeq Saudi](https://www.wafeq.com/en-sa)
- [Wafeq 2025 product update](https://www.wafeq.com/en-sa/press-releases/media-center/wafeq-2025-whats-new-in-wafeq-updates-and-upcoming-features)
- [Daftra](https://www.daftra.com/en?change_lang=en)
- [Daftra POS](https://www.daftra.com/en/pos/)
- [Foodics features](https://www.foodics.com/rms-features/)
- [Odoo Saudi fiscal localization](https://www.odoo.com/documentation/19.0/ar/applications/finance/fiscal_localizations/saudi_arabia.html)
- [Zoho Books Saudi features](https://www.zoho.com/sa/books/accounting-software-features/)

### 4.1 Saudi market segmentation changes the launch order

Official Saudi evidence shows why one universal default screen would be the wrong
product. Monsha'at reported 1.7 million SMEs by Q2 2025; GASTAT's differently defined
2024 population recorded 1.022 million active enterprises and a 31.3% new-enterprise
rate. GASTAT also found wholesale/retail generated 65.0% of micro-establishment
revenue, while medium-establishment revenue leaned more toward manufacturing,
wholesale/retail, and construction. The two population totals are not directly
comparable and must not be added together.

Digital readiness is similarly mixed: GASTAT reported 98.0% internet access and 76.3%
electronic-banking use among establishments, but only 46.8% cloud-computing use.
SAMA reported electronic payments reached 85% of retail payments in 2025. Therefore
fast POS/payment operation, migration, explicit degraded/provider states, and
reconciliation are launch requirements—not future polish.

Bunood will package one native foundation through four progressive experiences:

| Experience | Primary user/company | Promotion boundary |
|---|---|---|
| **Start** | Owner and cashier in a micro retail/service business | Guided activation through compliant sale, tender, receipt/ZATCA, daily total and statement works on accepted devices without expert setup. |
| **Operate** | Small multi-role company | Start plus migration, purchasing, inventory, payables/receivables, approvals and controlled bank reconciliation work end to end. |
| **Control** | Medium company, accountant and controller | Operate plus dimensions, assets, accruals, multicurrency, governed reporting, privacy evidence and two consecutive controlled closes pass. |
| **Connect** | Companies needing payroll, portal or external providers | Relevant earlier experience plus each payroll/portal/connector scope passes its own authorization, security, failure, reconciliation and support gate. |

These are experience and commercial packages over the same ERPNext documents,
permissions and ledgers. Moving between them must not fork data or require a destructive
Bunood migration. Detailed evidence and limitations are in the Saudi market research
synthesis. `quality/v1-edition-promotion-gates.json` maps every one of the 51 work
orders to the edition where it first becomes mandatory and fails closed if scope,
sequence, native-truth safeguards, or evidence requirements are weakened. It is a
planning gate, not a claim that any edition is accepted.

## 5. Consolidation of existing Bunood documents

### 5.1 Precedence

`quality/v1-program-authority-map.json` is the canonical machine-readable merger of
the plan, absorbed audits, contracts, and work-order registers. Each of the 51 V1
work orders has exactly one primary authority group; supporting contracts may overlap
where a journey crosses domains. `npm run v1:authority-map` fails on missing,
duplicate, unknown, or promoted work orders and on missing authority files. This map
resolves planning ownership only: it is not implementation evidence, an acceptance
receipt, or a release decision.

| Document | V1 disposition |
|---|---|
| `BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md` | Current Saudi desk-research and segment-prioritization evidence. It informs Start/Operate/Control/Connect ordering but is not participant research, implementation evidence, or acceptance. |
| `BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md` | Remains authoritative only for closing the current MVP release. Its native-authority rules and verified baseline are inherited permanently. |
| `BUNOOD-MVP-RELEASE-RECEIPT-DRAFT-2026-09-20.md` | Complete as the MVP release evidence; do not turn it into a V1 backlog. |
| `MVP-PRD-2026-09-18.md` | Historical MVP scope. Its architecture and UX invariants are retained. |
| `IMPLEMENTATION-ROADMAP-MVP-TO-V1.md` | Superseded for post-MVP sequencing by this plan; its pilot, feedback, hardening, and operational tasks are absorbed. |
| `ERP-MARKET-RECOMMENDATIONS-WORK-ORDERS-2026-09-20.md` | Absorbed. Its WO identifiers and acceptance intent are retained below. |
| `PRODUCTION-MVP-FOCUSED-ACTION-PLAN-2026-09-19.md` | Historical and already superseded for release execution. Completed work remains evidence, not future scope. |
| `PRODUCTION-MVP-PRESENTATION-HANDOFF-2026-09-18.md` | Historical presentation plan. Preserve its verified form hierarchy, action, responsive, and print contracts. |
| `BUNOOD-MVP-AGENT-HANDOFF-2026-09-19.md` and `BUNOOD-MVP-IMPLEMENTATION-HANDOFF-2026-09-19.docx` | Superseded implementation handoffs. Keep as evidence only; the authoritative MVP handoff resolves later status and remaining blockers. |
| `CURRENT-BUILD-AUDIT-2026-09-17.md` | Root-cause input. Its findings become permanent V1 acceptance rules. |
| `CODE-QUALITY-AUDIT-2026-09-04.md` | Open technical debt is moved into the Foundation workstream. Resolved items remain regression contracts. |
| `SIMPLE-FORMS.md`, `QUICK-BILL.md`, `SIDEBAR-CONSISTENCY.md`, `SYSTEM-STATES.md`, `REPORT-LIBRARY.md`, `ZATCA.md`, `UPSTREAM-UPGRADES.md` | Living subsystem contracts. Link to them; do not duplicate or contradict them. |

### 5.2 Repeated findings merged once

| Repeated finding | One V1 response |
|---|---|
| Too many competing shell/layout assumptions | One canonical shell, one breakpoint contract, one navigation acceptance matrix. |
| Screens technically exist but tasks still fail | Journey tests measure complete role tasks, not selector presence. |
| Configuration problems look like product defects | Readiness checks distinguish missing setup, permissions, empty state, and system failure. |
| Simple pages can hide required fields | Mandatory-field fallback plus explicit role/task profiles and configuration fixtures. |
| Expert data overwhelms routine users | Same document, role defaults, Simple/Expert progressive disclosure. |
| Dashboard numbers can disagree with destinations | One permission-filtered query/filter definition per metric and drill-down. |
| Large UI modules create regression risk | Incremental module extraction behind existing public contracts. |
| Browser tests are monolithic | One safe sequential orchestrator with domain registration files. |
| Print/compliance depends on company configuration | Per-company readiness and physical/PDF acceptance, never invented legal data. |
| Features expand before production operations exist | Backup, restore, monitoring, support, security, and release evidence are first-class gates. |

### 5.3 Current Bunood-to-V1 gap map

This is a planning assessment from the verified local documents, not a substitute
for the release receipt. “Available upstream” means ERPNext may contain the feature;
it does not mean Bunood has yet made the workflow simple, accepted, supported, and
production-ready.

| Capability | Evidence in the current build/audits | V1 gap and decision |
|---|---|---|
| Native financial foundation | Strong: the MVP handoff verifies native ERPNext authority and reconciled core scenarios. | Preserve the boundary permanently and expand acceptance from invoice/payment into purchasing, bank, returns, assets, tax, and close. |
| Saudi sales invoicing | Strong MVP path with ZATCA, print, and company-readiness work; final physical evidence remains a release gate. | Turn configuration into guided onboarding, add monitored exceptions/recovery, and accept the complete commercial-document family. |
| Simple forms and bilingual shell | Substantial implementation and detailed contracts exist, but audits and screenshots found mixed language, responsive, alignment, action-state, and duplicate-shell regressions. | Build one token/component/state contract and test every core form by role, language, viewport, permission, and lifecycle state. |
| Daily sales and cashier work | Invoice workbench and POS foundations exist; recurring findings include code-first item display, trailing-row validation, dense mobile presentation, and unclear actions. | Deliver name-first, task-first sales/POS journeys with safe ready rows, explicit save outcomes, tender/shift/return recovery, and reconciled postings. |
| Purchasing and inventory | Native capability is available, but the consolidated audits do not prove a complete task-designed, bilingual, role-accepted flow. | Treat request-to-pay and receive-to-stock as full V1 journeys, including exceptions, approvals, mobile warehouse work, and ledger reconciliation. |
| Expert accounting | Native reports and ledgers are the authority; the current product evidence is stronger for billing than controlled month end. | Add the accountant workspace, bank reconciliation, assets, accruals, dimensions, multicurrency, close cockpit, and traceable statements. |
| Reporting and owner insight | A large report catalogue and dashboard contracts exist, but metric reconciliation, question-led discovery, and cross-route consistency remain ongoing work. | Curate reports by job, document every metric, reconcile drill-downs, and remove decorative or zero-value dashboard clutter. |
| Onboarding and migration | Readiness scripts and handoffs exist, but a no-developer first-company/import journey is not yet the accepted product standard. | Ship guided configuration, dry-run imports, duplicate/error recovery, opening-balance reconciliation, help, and implementation handoff. |
| Operations, security, privacy, and upgrades | Runbooks and upgrade guidance exist; the authoritative handoff still requires release evidence and owner-controlled production checks. | Make restore drills, monitoring, incident response, PDPL operations, access review, performance budgets, and upgrade rehearsals release gates. |
| Payroll, portals, and integrations | Some upstream/native capabilities and local payment setup exist, but broad Saudi payroll, portal, banking, payment-provider, and ecommerce journeys are not proven V1 products. | Promote only customer-validated, governed integrations and payroll flows with explicit ownership, authorization, privacy, reconciliation, and support. |

The immediate implication is that V1 is not a rewrite and not a theme expansion.
It is the conversion of a strong native core into a consistently accepted product:
every promoted capability needs a role, a complete journey, a reconciled outcome, a
support owner, and a recovery path.

### 5.4 Market-to-delivery traceability

This table is the bridge between research, the present Bunood baseline, and delivery.
No row is complete because a screen exists or a competitor advertises it; promotion
requires the listed outcome evidence on the exact release candidate.

| Market need / product promise | Current Bunood position | Owning work orders | Minimum promotion evidence |
|---|---|---|---|
| Easy from first login; no ERP maze | Role-home, sidebar and Simple-mode foundations now include one built first-use spine from Company through submitted Payment Entry plus a compact twelve-row pre-live map aligned to every onboarding readiness domain. It reads only native permission-filtered observations; every row names a responsible role, explains the unresolved consequence and offers permission-derived setup or view access. An opt-in work plan now creates one native Project per company and one native Task per domain, preserving native Assign To, due dates, comments and attachment evidence without a parallel ledger. Qualified domain decision/reopening receipts and a separate immutable mapped-migration scope packet now exist. The packet records hashes, mappings, owners, recovery boundaries and source environment identity; an exact hash-matched attachment can run through the native importer only on an explicitly opted-in isolated clone and produce an immutable privacy-minimised result receipt. Data Import datasets bind stable-identity evidence to an explicit import-type-compatible duplicate decision; exact retries reuse the existing rehearsal, exception corrections create a materially changed packet with immutable predecessor/receipt lineage, and submitted exception receipts can download Frappe's native failed-row template behind renewed isolation, permission and file-integrity checks. When all datasets succeed on the same clone, an accountant-facing reconciliation packet binds every receipt and guides the eleven source-to-native control families with exact decimal values, report filters, owned variances and material-opening separation. Privacy/backup/security/support and integrations stay external, Task completion or a reconciliation form is not approval, and fresh-company acceptance, real-source duplicate proof, executed exact reconciliation, cutover and acceptance receipts remain missing. | FND-02..04, WO-10, WO-11 | A fresh non-developer configures/imports safely and each persona completes its top three jobs in Arabic and English without an unexplained dead end. |
| Calm, attractive, consistent forms at every width | Strong visual contracts exist alongside known route-specific regressions and legacy density. | FND-01, FND-03, FND-04 | Representative form/list/report/POS matrices at 1440/1024/700/430, light/dark, RTL/LTR; no clipping, mixed static language, ornamental pills/cards, or control-state ambiguity. |
| Fast cashier and dependable daily sales | Invoice workbench and POS catalogue are substantial; full shift, return, offline/degraded, tender, and close evidence is incomplete. | WO-23, OTC-01..05, KSA-04 | Run-owned open-to-close sale/return journeys reconcile tender, invoice, stock, tax/ZATCA, closing, Payment Ledger, and GL; denial and recovery cases pass. |
| Complete purchasing and inventory, not just menus | Native upstream documents exist; task design and accepted warehouse boundaries remain incomplete. | WO-20, WO-21, WO-22 | Request/order/receive/bill/pay/return and transfer/count/reorder journeys pass by role, warehouse, lifecycle, device width, and ledger reconciliation. |
| Accountant-grade books and a controlled close | Native ledgers/reports are authoritative; current evidence is deeper for invoicing than close operations. | WO-14, FIN-01..10 | Two controlled month ends reconcile banks, AR/AP, tax, stock, assets, FX, trial balance, statements, and locked/reopened periods with source drill-down. |
| Saudi compliance users can operate, not call a developer | ZATCA, VAT, print, and readiness foundations exist; production identity, physical evidence, exception operations, privacy, and legal sign-off remain gated. | KSA-01..07 | Configured-company sandbox/authorized-production evidence, physical/PDF/XML/QR parity, delayed/rejected recovery, VAT/GL reconciliation, PDPL exercise, and named qualified sign-off. |
| Owners understand the business without rebuilding spreadsheets | Dashboard/report contracts exist; every promoted metric is not yet governed and reconciled. | WO-15, BI-01..05 | Metric dictionary plus controlled-dataset reconciliation, permission-filtered drill-down, useful empty/error states, and owner/accountant task studies. |
| Employees and payroll fit Saudi operating reality | Upstream HR capability exists; no supported Saudi payroll product has been accepted. | HR-01..05 | Parallel payroll reconciles contract, approved gross-to-net, WPS/bank payment, GOSI wage, liabilities, employee balances, and GL under payroll/legal review. |
| Banking, payments, ecommerce, and portals are trustworthy | Payment setup and integration patterns exist; provider-specific production contracts are not proven. | WO-13, WO-30, WO-31, OTC-04, OTC-05 | Per-connector authorization, consent, sandbox/conformance, idempotency, revocation, outage/replay, privacy, settlement, reconciliation, runbook, and support evidence. |
| Safe operations, upgrades, support, and recovery | Runbooks exist; the MVP receipt still records missing production-controlled evidence. | WO-00, WO-01, FND-05 | Restore and rollback drills, monitored failure/incident exercise, access review, performance budgets, deterministic evidence receipt, and supported upgrade rehearsal pass. |
| Breadth without a bloated universal UI | ERPNext provides broad modules; only retail/distribution shares enough accepted core to be a default V1 candidate. | Foundation + selected domain orders; later packs require their own design-partner orders | The supported-customer declaration names the exact edition/industry boundary; unsupported packs stay V1.x and cannot weaken the core release gate. |

## 6. V1 users and their default experiences

Every persona uses the same native records. The difference is default navigation,
visible fields, density, shortcuts, approvals, and explanations.

| Persona | Default home | Fastest important job | Default mode |
|---|---|---|---|
| Cashier | Shift and counter | Scan/search item → take payment → print receipt | Focused POS |
| Sales representative | Customers and opportunities | Customer → quotation/order/invoice → follow-up | Simple |
| Buyer | Requisitions and suppliers | Request → order → receive/bill | Simple |
| Warehouse operator | Inbound/outbound queue | Receive, pick, pack, transfer, count | Task mode/mobile |
| Employee | My work | Expense, time, leave, documents | Simple/self-service |
| Accountant | Accounting workbench | Post/review/reconcile/close/report | Expert compact |
| Finance manager | Exceptions and approvals | Cash, ageing, tax, close, budget, approvals | Expert summary |
| Owner | Business pulse | Understand position and approve exceptions | Executive simple |
| Administrator/implementer | Readiness and system health | Configure, migrate, integrate, audit, support | Expert/admin |

### Role rules

- Navigation shows permitted, role-relevant destinations first; hiding a shortcut
  never grants or removes permission.
- Global search and command navigation can reach every permitted record/action.
- Users may pin recent/frequent tasks without changing another user's workspace.
- Expert mode is not a separate product or database.
- A cashier never sees journals; an accountant never loses them.
- Owners see definitions and drill-downs, not decorative numbers.

## 7. V1 information architecture

### 7.1 Stable top-level destinations

1. Home
2. Sales
3. Purchases
4. Inventory
5. Accounting
6. People
7. Reports
8. Settings

Role and industry packs may add a named workspace such as POS, Projects, Real Estate,
or Manufacturing, but may not create another shell or navigation geometry.

### 7.2 Navigation behavior

- One canonical sidebar at desktop and native drawer at narrow widths.
- Four balanced mobile navigation destinations selected by role; remaining tasks are
  under Apps/Search, not an uneven three-item bar.
- Search is always reachable and searches records by display name first, identifier
  second.
- “Create” offers only frequent permitted documents, grouped by job.
- Breadcrumbs communicate location; they do not become another action bar.
- Back preserves list filters and scroll position.
- Unsaved forms block language/route changes with a clear keep/discard decision.
- Lists retain visible filters, saved views, column choices, bulk actions, pagination,
  and export according to permission.
- No route-specific top bar, sidebar, or duplicate brand block.

### 7.3 Home is a work queue

Every role home contains, in this order:

1. work needing action today;
2. exceptions and failures;
3. the role's frequent create actions;
4. a small number of reconciled KPIs;
5. recent work and learning/help.

Cards with non-zero operational counts navigate to the exact filtered native data.
Zero values must not dominate the page.

## 8. V1 visual and interaction system

### 8.1 Visual direction

Bunood should look like a calm financial workspace, not a marketing dashboard or an
AI-generated card kit.

- Preserve the current brand seed `#3d8150`, but reserve solid green for the current
  primary action, selected state, brand identity, or confirmed success.
- Use white/neutral surfaces and black/gray text for most content. “Everything is
  green” is a defect.
- Use the blue accent only for informational navigation or links, never as another
  competing brand.
- Red, amber, and green are semantic states and always include text/icon meaning.
- Pills are limited to short status badges. Mode switches, filters, buttons, and
  navigation use ordinary rectangular controls with purposeful radii.
- Avoid rows of identical rounded cards. Use tables, grouped fields, dividers, and
  whitespace when they communicate structure more clearly.
- Shadows indicate elevation only; borders and spacing carry ordinary hierarchy.

### 8.2 Shape, spacing, and type contract

- Base spacing scale: 4, 8, 12, 16, 24, 32, and 48 px.
- Control minimum: 40 px desktop; 44 px for touch-critical controls.
- Radius: 8 px controls, 12 px elevated panels, compact status only may be fully
  rounded.
- Body copy uses a restrained scale and line length; financial values align using
  tabular numerals where supported.
- Preserve the configured Arabic font system and validated Riyal glyph; introduce no
  font dependency without Arabic/Latin numeral and PDF tests.
- Arabic and English share hierarchy, density, and control size.

### 8.3 Standard form anatomy

Every task-designed form uses the same five zones:

```text
┌ Identity · document number · status · one primary action ┐
│ Essentials: party, date, reference, operating context    │
├ Primary work area: lines, allocation, movement, or task  ┤
│ Impact: subtotal/tax/total or quantity/accounting effect │
├ Optional sections: collapsed, labelled, remembered       ┤
└ Activity, attachments, audit, comments                   ┘
```

Rules:

- One primary action per state. Secondary and dangerous actions use a labelled
  overflow/menu and native confirmation.
- Mode switching sits inline with the document section/header system. The selected
  option uses dark brand green; the other uses a white neutral control. It is not a
  floating pair of pills.
- Essential fields align to one grid and consistent width. Empty visual columns are
  not used to create accidental off-centre layouts.
- Save options use explicit outcomes: **Save draft**, **Save and continue**,
  **Submit**, or the state-specific next action. Avoid vague “Apply”.
- A completed child row creates the next ready row; an untouched ready row is ignored
  by save, validation, print, totals, and posting.
- Item/customer/supplier names are primary; internal codes are secondary identifiers.
- Validation appears next to the relevant field/row plus one concise summary. A
  rejected save always restores enabled controls and focus.
- Loading an expensive preview never blanks the page. Preserve the current screen and
  show a bounded skeleton/progress state inside the preview region.
- Desktop tables favor speed and keyboard use; narrow layouts become intentional
  cards/reduced columns rather than squeezed tables.
- Expert mode increases information density and keyboard/bulk capability; it does
  not make labels smaller than readable limits.

### 8.4 Required form-state matrix

Every core form must be reviewed in these states:

- new empty;
- new partially entered;
- invalid after save attempt;
- saved draft;
- submitted/open;
- partially fulfilled/paid;
- completed/paid;
- cancelled/returned/amended;
- permission denied;
- setup incomplete;
- integration delayed/rejected;
- loading, empty, and recoverable failure;
- Arabic/English, desktop/tablet/phone, light/dark where supported.

## 9. Functional V1 scope

### 9.1 Foundation and operations

**Work orders:** WO-00, WO-01, FND-01 through FND-05

**Production operating authority:**
`BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md` with machine
target `quality/v1-production-operations-control-register.json`. It binds environment
and candidate provenance, complete backup/isolated restore, staging/deploy/migration,
post-deploy-data-aware rollback, monitoring, incidents, privileged support access,
measured RPO/RTO/SLOs, runbooks and customer validation.

- Close the existing production release gate and release receipt.
- Backups, restore drill, monitoring, alerting, incident/rollback/upgrade runbooks,
  production/staging ownership, MFA, least privilege, encryption, and audit review.
- Incrementally split `bunood.js` and the large smoke-registration file by domain
  while keeping public contracts and sequential shared-site orchestration.
- Maintain a dynamic Frappe entry-point manifest to prevent false dead-code cleanup.
- Give every console-error exception an owner, upstream version, and removal rule.
- Enforce the browser, API, list, search, form, POS, report, print, queue,
  integration, availability, backup, RPO, and RTO budgets in
  `BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md`; build payload ceilings
  remain a separate hard gate.

**V1 gate:** restore succeeds inside the declared recovery target, alerts fire,
security review passes, Starter and Standard load/soak/peak gates meet the named
percentiles without correctness or duplicate-result errors, the current MVP
financial scenario reconciles, and no domain refactor changes behavior.

### 9.2 Guided onboarding and migration

**Work orders:** WO-10, WO-11

**Operating and acceptance authority:**
`BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md`, with the
fail-closed machine register at `quality/v1-onboarding-migration-control-register.json`.

- Role-aware readiness checklist for company, accounting, tax, warehouse, pricing,
  payments, print, users, permissions, ZATCA, privacy, backups, and integrations.
- Business-type starter profiles that propose—not silently commit—safe defaults.
- Dry-run imports for customers, suppliers, items, prices, opening stock, and approved
  opening receivables/payables.
- Duplicate detection, row-level errors, idempotent retry policy, and reconciliation
  to named native reports.
- Sample company/test transaction that can be removed without touching ledgers.
- Embedded bilingual help by job and state, plus implementation/support handoff.

**Implemented first Start slice:** Home presents one calm ordered spine for Company,
Customer, Item, submitted Sales Invoice, and submitted Payment Entry. It exposes only
the first actionable native record, reports permission/setup blockers instead of
skipping them, contains no completion percentage, and disappears when those five
persisted milestones exist. A single adjacent disclosure now maps all twelve
readiness domains using narrow observations from native company, accounting, stock,
commercial, party, payment/POS, user, output, invoice/payment and credential-free
ZATCA sources. Privacy/backup/security/support and integrations stay external,
qualified areas stay review-only, and query failures never masquerade as absence.
Every row names the responsible business role, explains the unresolved consequence,
and labels its safe native route `Open setup` only when the server confirms change
permission, otherwise `View details`. An opt-in action now creates one native ERPNext
Project per company and one native Task for each domain. Native Assign To/ToDo, due
dates, comments and File attachments provide person ownership and evidence without a
parallel Bunood task store; Home exposes a separate task action and visible assignment,
status and evidence count. Creation and reads remain server-permission checked. Task
completion is operational progress, never a tax/ZATCA, print, accounting, migration,
security or launch-readiness claim; qualified decision/reopening and the remaining
work above plus the
fresh-administrator receipt below are unchanged.

**Implemented migration slice:** the mapped packet freezes source site and a one-way
database identity. On a different site/database that explicitly enables migration
rehearsal, a permitted operator can run the exact hash-matched attached file through
Frappe's native Data Import and capture a submitted privacy-minimised receipt. Only a
non-empty, wholly successful terminal native run is `dry-run-validated`; partial,
failed, timed-out, inconsistent, or oversized log results fail closed. The receipt
does not authorize production import, reconciliation, cutover, rollback, or migration
acceptance. A stable identity evidence reference and import-type-compatible duplicate
decision are now mandatory per Data Import dataset. Exact repeat starts reuse the
existing rehearsal; an exception can create a new packet with predecessor and receipt
lineage, and it cannot be submitted without a material source/mapping/identity/control
change. A submitted exception with failures can download Frappe's native errored-row
template only after Bunood rechecks the receipt, isolated environment, permissions,
matching Data Import and unchanged file hash. Raw import logs remain native and are
not proxied. When every mapped dataset has one successful receipt on the same clone,
an accountant-facing reconciliation packet now binds those digests and requires all
eleven control families, exact decimal source/native comparisons, reproducible native
report filters, owned variances, explicit exclusions and separate review for material
openings. It remains evidence structure rather than a parallel ledger or accounting
approval. Real operator/accountant execution, source-specific duplicate effectiveness,
exact report-backed opening reconciliation, and controlled clean/dirty acceptance
remain open.

**V1 gate:** a trained business administrator reaches the first valid invoice without
developer intervention; one clean and one dirty migration rehearsal prove dry-run
non-mutation, identity/duplicate decisions, idempotent retry, exact applicable
opening-data reconciliation, permission isolation, and complete restore or approved
native rollback. Business-data migration, site transfer, and software upgrade require
separate receipts.

### 9.3 Sales, CRM, invoicing, and collections

**Work orders:** WO-12, WO-13, OTC-01 through OTC-05

**Detailed operating authority:**
`BUNOOD-V1-ORDER-TO-CASH-AND-CUSTOMER-OPERATIONS-CONTRACT-2026-09-20.md` with
machine target `quality/v1-order-to-cash-control-register.json`. It governs the
lead/customer, quotation, order, fulfilment, invoice, collection, return and portal
chain; keeps customer, commercial, stock, tax, ZATCA, receivable, payment,
settlement and GL states distinct; and requires portal isolation plus bilingual
output parity without creating a second commercial ledger.

- Lead/opportunity/customer context appropriate to sales roles.
- Quotation → order → delivery → invoice → payment mappings through native methods.
- Recurring/subscription billing where the native workflow is suitable.
- Customer credit, terms, price lists, discounts, commissions, attachments, and
  approval thresholds.
- Receivables centre with ageing, overdue work queue, promises, disputes, statements,
  reminders, delivery evidence, and follow-up history.
- Payment requests/links through approved providers; idempotent callbacks and native
  Payment Entries.
- Customer portal for quotes, orders, invoices, statements, payment links, and
  documents with strict tenant/customer isolation.
- Complete A4/thermal bilingual commercial-document family.

**V1 gate:** full and partial quote-to-cash, returns, credit, payment, reminder, and
portal scenarios reconcile across invoice, Payment Ledger, GL, stock, ZATCA, and
customer-facing outputs.

### 9.4 POS and cashier experience

**Work order:** WO-23

**Detailed operating authority:**
`BUNOOD-V1-POS-RETAIL-OPERATIONS-CONTRACT-2026-09-20.md` with machine target
`quality/v1-pos-retail-control-register.json`. It governs readiness, the fast
name/barcode/cart/tender path, receipt/ZATCA, original-linked returns/refunds,
shift close/posting, device/degraded/offline claims, performance and exact finance
reconciliation without giving the cashier accounting complexity.

- Opening/closing shift, cashier PIN/switch, branch/profile readiness, and a
  dedicated least-privilege POS operator role instead of broad manager authority.
- Item-name-first catalogue, barcode/camera/weight barcode, favorites, variants,
  stock, prices, tax, promotions, customer, hold/resume, and clear cart recovery.
- Cash, card, Mada/provider, store credit, and mixed payments.
- Returns/refunds tied to original sale and payment method where supported.
- Offline or degraded-mode design only after accounting, ZATCA, conflict, sync,
  idempotency, and recovery behavior is proven. Never market offline mode before this.
- Receipt/QR print, cash-drawer and device diagnostics, last transactions, and shift
  difference.

**V1 gate:** a new cashier completes the supported sale in under the agreed target
without `Sales Manager`, `Accounts Manager`, or `System Manager`; stock, tender,
ZATCA, invoice, Payment Entry, closing, and GL all reconcile.

### 9.5 Purchasing and payables

**Work order:** WO-20

**Detailed operating authority:**
`BUNOOD-V1-PROCUREMENT-INVENTORY-OPERATIONS-CONTRACT-2026-09-20.md` with machine
target `quality/v1-procurement-inventory-control-register.json`. It preserves the
request/order/receipt/quality/bill/payment boundaries, two-/three-way matching,
Stock Received But Not Billed, Saudi input-tax evidence and source-to-ledger trace.

- Supplier onboarding, request for quotation, comparison, purchase request/order,
  receipt, supplier bill, expense, payment, and return.
- Invoice-first and order-first paths, partial receipt/billing/payment, approvals,
  three-way match, supplier credit, landed cost, attachments, and duplicate supplier
  invoice protection.
- Payables/ageing queue, due-payment plan, bank/payment handoff, and supplier statement.

**V1 gate:** service and stocked purchases reconcile through payable, stock, tax,
asset/expense, payment, and GL reports.

### 9.6 Inventory and warehouse

**Work order:** WO-21

The procurement/inventory operating authority above also controls actual/projected/
reserved/available definitions, movement/transit, scanning, serial/batch/expiry/UOM,
physical count, valuation, Stock Ledger/inventory-GL reconciliation, Arabic/English
mobile UX and recovery.

- Clear actual, projected, reserved, and available quantities.
- Receive, inspect, put away, pick, pack, deliver, transfer, issue, manufacture/repack
  where configured, count, reconcile, batch/serial, expiry, and traceability.
- Reorder points, supplier lead time, exceptions, stockout risk, and purchase trigger.
- Mobile task surfaces for scan-heavy work; printable pick/count/transfer documents.
- Adjustment preview and approval showing quantity and valuation impact.

**V1 gate:** every quantity/value drills into Stock Ledger/source documents and a
cycle-count variance can be explained and approved without spreadsheet reconstruction.

### 9.7 Returns and corrective documents

**Work order:** WO-22

- Full/partial sales and purchase returns.
- Credit/debit notes and rate corrections linked to originals.
- Paid, partially paid, stock/non-stock, tax, refund, and customer/supplier balance
  treatment.
- Bilingual corrective print/XML with the correct original reference.

**V1 gate:** correction scenarios reverse only the intended stock, tax, receivable/
payable, payment, and ledger effects; submitted originals stay immutable.

### 9.8 Expert accounting and close

**Work orders:** FIN-01 through FIN-10

**Detailed operating authority:**
`BUNOOD-V1-EXPERT-FINANCE-AND-CLOSE-CONTRACT-2026-09-20.md` with machine target
`quality/v1-finance-close-control-register.json`. It governs one native accounting
engine for clerk, accountant, controller, CFO and auditor experiences; the
pre-close/T+1–T+5 sequence is configurable and never presented as universal advice.

**Cash, bank, payment, and reconciliation authority:**
`BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md` with machine
target `quality/v1-cash-bank-payment-control-register.json`. It defines the
customer/supplier payment, party allocation, statement, bank match, cash/POS and
provider-settlement chains, and the Saudi authorization/consent/conformance boundary
for any promoted connector.

- Chart of accounts and accounting dimensions with guarded setup.
- Journals/templates, accruals, prepayments, deferred revenue/expense, recurring
  journals, allocations, and approval rules.
- **Implemented foundation:** the bilingual `bnd-journal-workbench` now turns native
  Journal Entry records into a bounded, permission-filtered work queue; distinguishes
  unbalanced drafts, drafts awaiting review, submitted, cancelled, reversal and
  generated entries; intersects recurring schedules with separately permitted
  same-Company source journals; and explains when Payment Entry or an invoice is the
  safer native document. Templates, recurring schedules, deferred processing,
  Journal Entry creation and GL review stay native. Full accrual, prepayment,
  allocation, attachment, maker-checker and source-to-GL acceptance remains open.
- Bank import, matching, bank reconciliation, payment reconciliation, and unexplained
  difference workflow (WO-14).
- **Implemented foundation:** Bunood now provides a bilingual, permission-filtered
  bank-evidence and ageing cockpit with native statement-import and ERPNext `/banking`
  handoffs. Matching, posting and reconciliation remain native; two controlled
  periods and accountable difference/reviewer evidence are still required.
- Accounts receivable/payable control and ageing reconciliation.
- Fixed assets, capitalization, depreciation, transfer, disposal, and register.
- Multi-currency, exchange revaluation, realized/unrealized differences.
- Budgets, cost centres, projects, branches, departments, and variance analysis.
- Period close cockpit: checklist, owners, evidence, reconciliations, exceptions,
  dependency-aware pre-close/T+1–T+5 calendar, soft close, native Accounting
  Period/frozen-account protection, accurately described Period Closing Voucher,
  governed reopen/relock, and sign-off.
- **Implemented foundation:** the bilingual `bnd-finance-close` cockpit now reads
  permission-filtered native draft sources and period controls, distinguishes
  Accounting Period/frozen-date protection from a Period Closing Voucher, keeps all
  unevaluated reconciliation stages explicit, and links to native reports. It does
  not yet implement a close instance, task ownership, approval, reopen/relock or
  immutable close packet.
- Trial balance, General Ledger, P&L, Balance Sheet, Cash Flow, tax reports, audit
  trail, comparative and consolidated views where native support is validated.
- Accountant workspace with compact tables, saved views, batch actions, keyboard
  workflow, trace-to-source, export, and review notes.

**V1 gate:** a qualified accountant completes two consecutive controlled month-end
closes—one normal and one with deliberate exceptions—and reproduces every published
figure from the same-boundary source documents and ledgers without editing generated
ledger rows. Payment, bank, cash/POS, AR, AP, stock, assets, deferrals, FX and tax
remain separate reconciliations; a submitted Period Closing Voucher is never treated
as proof that the period is locked.

### 9.9 Saudi tax and compliance operations

**Work orders:** KSA-01 through KSA-07

**ZATCA and VAT operating authority:**
`BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`, with the fail-closed
machine register at `quality/v1-zatca-control-register.json`.

- Per-company legal identity and national-address readiness.
- VAT categories, inclusive/exclusive pricing, exemptions/zero rate, reverse charge
  where applicable, VAT return and audit report with accounting sign-off.
- ZATCA Phase 1/2 onboarding, EGS/CSID governance, standard clearance, simplified
  reporting, retries, rejection explanation, XML/QR/response retention, counter/hash
  integrity, and monitoring.
- Credit/debit notes and amendments through native correction rules.
- Withholding-tax configuration and reports where the supported customer requires it.
- PDPL inventory, purpose/retention, privacy notice, all six official right types,
  deletion/anonymization where legally allowed, processor governance, impact/DPO
  assessments, breach workflow, and cross-border review under
  `BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md`.
- Compliance dashboard shows readiness and exceptions without claiming certification.

**V1 gate:** a controlled Sandbox cycle and an authorised Production cycle prove
standard clearance before buyer delivery, simplified issue/reporting, invoice and
credit/debit-note paths, warnings, rejection, delay, duplicate reconciliation,
idempotent retry, credential lifecycle, XML/QR/physical/native-ledger parity and
monitoring. An external Saudi tax/accounting/compliance reviewer signs the configured
company's operational checklist. SDK validation is never described as ZATCA approval.

### 9.10 Reporting, dashboards, and decision support

**Work order:** WO-15 plus BI-01 through BI-05

**Detailed operating authority:**
`BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md` with machine target
`quality/v1-decision-support-control-register.json`. It governs a versioned metric
dictionary, question-led owner and role surfaces, exact-filter source drill-down,
custom-report publication, export/print/scheduled-delivery permissions, meaningful
freshness/error states and reconciliation without creating a parallel KPI ledger.

- Owner dashboard with cash/bank, sales, gross profit where reliable, receivables,
  overdue, payables, VAT, inventory exceptions, and trend context.
- Accountant and operational dashboards by role, not one universal wall of cards.
- Every metric has a documented definition, permission-filtered source, “as of” time,
  comparison period, drill-down, empty/error state, and reconciliation test.
- Report catalogue by question/job; saved views, filters, columns, grouping,
  dimensions, charts only where useful, PDF/spreadsheet export, and scheduled delivery.
- A governed custom-report path for trained users that cannot bypass permissions or
  mutate data.

**V1 gate:** core dashboard values reconcile to named native reports and users can
answer agreed owner/accountant questions without rebuilding exports in spreadsheets.

### 9.11 People, expenses, and Saudi payroll pack

**Work orders:** HR-01 through HR-05

**Detailed operating authority:**
`BUNOOD-V1-SAUDI-PEOPLE-PAYROLL-CONTRACT-2026-09-20.md` with machine target
`quality/v1-saudi-payroll-control-register.json`. It defines one native
employment-to-payment chain, effective-dated Saudi rule packs and strict separation
between calculated, approved, posted, file-generated, externally accepted, paid and
reconciled states.

- Employee self-service for expense, time, leave, payslips, and documents.
- Expense claims with policy, receipts, approvals, reimbursement, and accounting.
- Attendance/shift inputs only for validated customer workflows.
- Saudi payroll structures, allowances/deductions, loans/advances, leave impact,
  explainable GOSI population/transition rules, and final-settlement/end-of-service
  treatment subject to qualified review, payroll posting, bank/WPS output and
  authentic payment/external-response evidence.
- WPS/GOSI/Qiwa-facing files or connectors only after current official interfaces,
  authorization, privacy, and reconciliation are verified.

**V1 gate:** two controlled parallel cycles—one normal and one with contract,
attendance, retro/off-cycle, GOSI, external-rejection and final-settlement
exceptions—reconcile each employee from approved contract terms through gross-to-net,
liabilities, bank/WPS response and payment evidence to GOSI wage, employee balances
and GL. File generation or a draft bank Journal Entry never counts as payment or
government acceptance.

### 9.12 Integrations and ecosystem

**Work orders:** WO-30, WO-31

**Detailed operating authority:**
`BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md` with machine
target `quality/v1-integration-connector-control-register.json`. It governs provider
selection, authentication/consent/secrets, versioned mappings, signed webhooks,
idempotency, ordering, queue/retry/quarantine/replay, native workflow integrity,
external-to-native reconciliation, privacy, monitoring, support and retirement.

- One connector framework for secrets, consent, mapping, health, idempotency, retry,
  replay, rate limits, audit, sandbox, revoke, and support ownership.
- First customer-validated connectors: one payment provider, one bank/open-banking or
  statement source, and one ecommerce/order source.
- Public API/webhook documentation and scoped credentials for supported business
  use—not direct database access.
- Marketplace only after connector certification, version compatibility, support,
  privacy, and commercial ownership exist.

**V1 gate:** duplicates, delayed/out-of-order events, revocation, expired credentials,
provider outage, and replay are tested; resulting stock/financial data reconciles.

### 9.13 Industry packs

Industry packs change defaults, terminology, workflows, reports, print, and
onboarding—not the ledger engine.

Candidate packs:

1. Retail/distribution: POS, branches, barcode, replenishment, promotions, returns.
2. Restaurants: recipes, waste, modifiers, tables, kitchen, delivery integrations.
3. Services/projects: timesheets, expenses, milestones, retainers, project margin.
4. Real estate: existing Property/Unit/Lease capabilities, billing, collections,
   maintenance, occupancy, owner reporting.
5. Light manufacturing: BOM, planning, work orders, job cards, quality, subcontracting.

Only Retail/Distribution is a default V1 candidate because it shares the cashier,
sales, purchasing, inventory, and accounting core. Promote another pack into V1 only
with a named design partner and end-to-end acceptance scenarios. Otherwise it remains
V1.x without blocking the core product.

## 10. Ordered delivery program

Time ranges are planning envelopes for a stable cross-functional team, not promises.
Each phase is promoted by evidence, not calendar alone.

Execution status, current evidence, first-90-day order, and external decisions are
maintained in `BUNOOD-V1-EXECUTION-LEDGER-2026-09-20.md`. This strategy document
defines the destination; the ledger must never claim a narrower test proves the
whole workstream.

The least-privilege role, record-scope, navigation, top-task, negative-test, and
promotion contract for V1-UX-01 is maintained in
`BUNOOD-V1-ROLE-ACCEPTANCE-MATRIX-2026-09-20.md`. Experience-marker roles remain
authority-free until that live acceptance is complete.

The shared shell, five-zone form, data-entry, action, state/recovery, neutral visual,
bilingual/RTL, responsive, and accessibility rules are defined in
`BUNOOD-V1-UNIVERSAL-PRODUCT-GRAMMAR-2026-09-20.md`. Their representative target
coverage is machine-validated by `quality/v1-acceptance-manifest.json`; that manifest
is a declaration, never a substitute for executed evidence.

Every `FND-*`, `OTC-*`, `FIN-*`, `KSA-*`, `BI-*`, and `HR-*` identifier above is
defined as an assignable outcome, bounded deliverable, dependency, and evidence gate
in `BUNOOD-V1-WORK-ORDER-CATALOG-2026-09-20.md`. The expanded `WO-*` orders remain in
`ERP-MARKET-RECOMMENDATIONS-WORK-ORDERS-2026-09-20.md`.

The product is promoted in customer-value order even where engineering phases overlap:

1. prove **Start** on the release-safe universal foundation;
2. prove **Operate** through one reconciled sell/buy/stock/bank cycle;
3. prove **Control** through two consecutive accountant-led closes; and
4. promote **Connect** capabilities independently by provider or regulated scope.

An unfinished earlier experience may not be hidden by beginning a later one. A shared
foundation may be developed ahead only when its acceptance does not create a false
promotion claim. Run `npm run v1:edition-gates` after any scope, dependency, edition,
or work-order change.

### Phase 0 — MVP release and operational safety (0–4 weeks)

- WO-00 current production release gate.
- WO-01 backups, restore, monitoring, security, support, and release operation.
- Establish pilot metrics and customer-feedback capture.

**Exit:** controlled pilot can store live data safely and complete quote-to-cash.

### Phase 1 — Universal UX foundation (weeks 3–10)

- Role/persona permission map and home work queues.
- Navigation, search, create, list, form, state, table, action, and responsive
  component contracts.
- Neutral-first visual refinement; remove decorative pills/card soup/excess green.
- WO-10 onboarding and WO-11 migration.
- FND code/test modularization behind current behavior.

**Exit:** five representative roles complete their top three jobs in Arabic and
English without encountering an unexplained dead end.

### Phase 2 — Complete commerce and daily finance (weeks 8–18)

- Sales/CRM/collections/payment requests.
- Purchasing/payables.
- Inventory/warehouse.
- Returns/corrective documents.
- POS/cashier.
- Bank and payment reconciliation.
- Owner dashboard.

**Exit:** sell, collect, buy, receive, pay, count, return, reconcile, and report all
work end to end through native records.

### Phase 3 — Expert accounting and Saudi compliance (weeks 14–24)

- Accountant workspace and period-close cockpit.
- Assets, accruals/deferred, dimensions, budgets, multicurrency, tax/audit reports.
- Full ZATCA operational workflow and exception monitoring.
- PDPL operational controls.
- Report library, drill-down, scheduled reports, governed customization.

**Exit:** accountant-led month end, VAT/ZATCA evidence, and external review pass.

### Phase 4 — Saudi workforce and integrations (weeks 18–28)

- Employee/expense foundation and validated Saudi payroll pack.
- Connector framework, payment, banking, and ecommerce connectors.
- Customer/supplier portal hardening.

**Exit:** parallel payroll and all production connectors reconcile and have support
ownership.

### Phase 5 — V1 general availability (weeks 26–32)

- Browser/device/RTL/LTR/accessibility/role/permission/upgrade matrices.
- Load, volume, recovery, security, privacy, accounting, and stock reconciliation.
- Implementation kit, training paths, help centre, support SLA, release/upgrade plan.
- At least three design-partner businesses complete a billing and close cycle without
  a critical data-integrity incident.

**Exit:** signed V1 release receipt and published supported-scope statement.

## 11. Master acceptance journeys

V1 cannot be approved by isolated component screenshots. The following journeys
must pass in Arabic and English with role-appropriate permissions.

1. New company → readiness → import → first invoice → ZATCA → payment → statement.
2. Cashier open → scan/search → mixed payment → print → return → close.
3. Lead/customer → quotation → order → delivery → invoice → collection follow-up.
4. Need stock → request → supplier quotes → order → receipt → bill → payment.
5. Transfer/count/adjust stock with batch/serial/expiry and valuation review.
6. Import bank statement → match/create native vouchers → reconcile to zero.
7. Overdue invoice → statement/reminder/payment link → payment → reconciliation.
8. Full and partial return/credit/refund tied to original transaction.
9. Expense → approval → reimbursement → accounting and payroll interaction.
10. Month end → AR/AP/bank/stock/tax/assets/accruals → statements → lock/sign-off.
11. ZATCA rejection or delayed integration → explanation → safe correction/retry.
12. Backup restore → integrity/reconciliation → service recovery.

Each journey records duration, errors, mode switches, help use, support intervention,
source documents, resulting ledgers, print/PDF, and recovery behavior.

## 12. Product success measures

The study design, recruitment matrix, task protocol, release thresholds, severity
rules, privacy controls, and evidence packet are authoritative in
`BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md`. Metrics below are
instrumentation categories; they do not replace observed outcome correctness or the
persona thresholds in that protocol.

### Usability

- Time and steps for top role tasks.
- First-attempt completion rate.
- Validation failures per transaction.
- Simple → Expert switches caused by missing essentials.
- Search success and backtracking.
- Accessibility failures and keyboard-only completion.

### Adoption

- Time to first valid invoice and first reconciled payment.
- Weekly active users by role and workflow.
- Spreadsheet/export workaround rate.
- Feature adoption after training.
- Support contacts per 100 completed transactions.

### Financial integrity

- AR/AP/stock/bank/tax-to-GL reconciliation exceptions.
- Unallocated payments and unexplained bank difference.
- Duplicate transaction prevention.
- ZATCA acceptance/rejection/retry age.
- Close duration and reopened periods.

### Reliability and service

- Availability, Core Web Vitals, route/save/report percentiles, queue age, and
  failed jobs against `BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md`.
- Backup success, restore-test age, demonstrated RPO, and demonstrated RTO.
- Connector success/retry/dead-letter age.
- Incident detection, acknowledgement, recovery, and recurrence.
- Upgrade regression and rollback success.

## 13. V1 non-negotiable architecture

1. ERPNext owns accounting, tax, stock, workflow, permission, naming, mapping,
   validation, save, submit, cancel, amendment, and reconciliation.
2. Bunood owns task presentation, navigation, orchestration, readiness, curated
   reports, managed print, and safe integration facades.
3. No duplicate ledger, balance, stock, invoice, payment, bank, payroll, or customer
   source of truth.
4. Derived numbers identify their source, filters, company, currency, and timestamp.
5. Integrations are idempotent and auditable; secrets never reach browser bundles.
6. Upstream Frappe/ERPNext changes pass the pinned staging compatibility process.
7. Customization uses extension points and documented configuration, not forks of
   transactional controllers.
8. Security and privacy are verified with permissions, API tests, audit review, and
   recovery drills—not assumed from hidden buttons.

## 14. V1 quality gates

- Functional: master journeys and domain edge cases pass.
- Accounting: named native reports reconcile for every financial journey.
- Inventory: Stock Ledger and valuation reconcile for every movement/correction.
- Compliance: ZATCA technical evidence plus qualified production configuration review.
- Privacy/security: threat model, permission matrix, secret scan, dependency audit,
  PDPL controls, penetration review, and incident exercise.
- Accessibility: keyboard, focus, screen-reader semantics, contrast, zoom/reflow,
  reduced motion, touch target, and Arabic reading order.
- Visual: no clipping, overlap, mixed static language, off-centre grids, green flood,
  pill/card overuse, or inconsistent field widths on the supported matrix.
- Performance: the named p75/p95/p99, queue-age, correctness, and regression
  budgets in `BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md` pass against
  Starter and Standard production-like volume, peak/soak load, and slow networks.
- Operations: backup/restore, monitoring, alerts, runbooks, support escalation, and
  rollback pass.
- Upgrade: pinned upstream compatibility and migration/rollback rehearsal pass.

## 15. Governance and scope control

- Product owner: owns target segment, phase promotion, and commercial scope.
- Domain accountant: owns accounting scenarios, definitions, reconciliation, and
  close acceptance.
- Saudi compliance owner: owns ZATCA/VAT/payroll/privacy interpretation and sign-off.
- Design owner: owns the role model, vocabulary, design tokens, form anatomy, and
  cross-route visual acceptance.
- Engineering owner: owns native boundaries, integration contracts, performance,
  migrations, and maintainability.
- QA owner: owns the journey matrix and release evidence.
- Operations/support owner: owns recovery, monitoring, incident, upgrade, training,
  and SLA readiness.

No module is promoted because it looks impressive. Promotion requires a named user,
repeated job, authoritative data path, acceptance journey, metric, support owner, and
production operating procedure.

## 16. Definition of Bunood V1 complete

Bunood V1 is complete when all of the following are true:

1. The existing MVP release gate and physical print/QR evidence are signed.
2. Cashier, sales, purchasing, warehouse, accountant, finance-manager, owner, and
   administrator role journeys pass in Arabic and English.
3. Sales, purchase, inventory, returns, POS, payment, banking, collections, and
   period-close results reconcile to native ERPNext records and reports.
4. ZATCA Phase 2 supported flows and exceptions are operationally monitored and
   reviewed for the configured Saudi company.
5. Guided onboarding and migration reach reconciled opening data without developer
   intervention for the supported customer profile.
6. Dashboards and reports answer the agreed daily and month-end questions with
   drill-down and documented definitions.
7. Production security, PDPL controls, backups, restore, monitoring, incident,
   support, and upgrades pass their evidence gates.
8. Forms and navigation pass the full state/role/viewport/language/accessibility
   matrix and follow the neutral-first visual system.
9. At least three design partners complete one billing and close cycle without a
   critical integrity incident or an undocumented spreadsheet workaround.
10. The supported scope, limitations, integration ownership, pricing/support terms,
    release receipt, and known non-blocking issues are published.

At that point, V1 is a fully functioning Saudi-first ERP product for the supported
personas and workflows. Additional industries become versioned packs; they do not
turn the core into an unbounded universal screen.
