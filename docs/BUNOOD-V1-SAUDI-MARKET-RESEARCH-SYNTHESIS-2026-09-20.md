# Bunood V1 Saudi Market Research Synthesis

**Document date:** 2026-09-20  
**Method:** desk research and product-gap synthesis  
**Evidence base:** Saudi official statistics and regulators, public competitor
documentation, the Bunood audit inventory, V1 contracts, and the execution ledger  
**Authority boundary:** supports `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`; it does not
replace the mega plan, prove implementation, certify compliance, or constitute user
research with real participants. The resulting product-promotion targets are
machine-governed by `quality/v1-edition-promotion-gates.json`.

## 1. Executive synthesis

The Saudi opportunity is not one generic ERP buyer. The market contains a very large,
fast-changing base of micro businesses, growing small operators, and medium companies
that need materially different density, control, and support while sharing the same
commercial and accounting truth.

The evidence supports four product decisions:

1. **Lead with activation and daily cash, not configuration.** A new owner or cashier
   must reach a compliant first sale, receipt, and daily total without learning ERP
   structure.
2. **Make retail/service simple mode the entry door, not a simplified ledger.** Micro
   establishments are heavily concentrated in wholesale and retail, while Saudi retail
   payments are overwhelmingly electronic. POS, tender, settlement, ZATCA, and recovery
   are therefore core rather than optional decoration.
3. **Treat migration and degraded connectivity as normal conditions.** Internet access
   is widespread, but cloud adoption is not universal. Spreadsheet import, resumable
   setup, explicit sync/provider states, and supportable recovery matter as much as the
   happy path.
4. **Reveal expert controls by role and company maturity.** Small and medium operators
   need purchasing, stock, approvals, payroll, dimensions, close, and audit evidence;
   none should be forced into the cashier's first screen or reimplemented outside the
   native ERPNext records and ledgers.

## 2. Observed Saudi market signals

These are observations from the cited sources. Interpretations and product decisions
are separated into the following section.

| Signal | Observed evidence | Limitation |
|---|---|---|
| Large and growing business base | Monsha'at reports 1.7 million SMEs by the end of Q2 2025. GASTAT reports 1.022 million active enterprises in 2024, about 320 thousand new enterprises, and a 31.3% new-enterprise rate. | The publications use different populations and definitions; the totals must not be combined or treated as the same denominator. |
| Retail dominates the smallest firms | GASTAT reports that wholesale and retail generated 65.0% of micro-establishment revenue and 35.1% of small-establishment revenue in 2024. Across SMEs, wholesale and retail contributed 36.3% of operating revenue. | Sector revenue share does not prove software demand or willingness to pay. |
| Medium firms have a different operating mix | For medium establishments, manufacturing contributed 29.6% of operating revenue, wholesale/retail 19.6%, and construction 17.0%. | Industry workflow depth still requires direct discovery with target customers. |
| High business creation and closure | GASTAT reports about 320 thousand new enterprises and 139 thousand closures in 2024. | Enterprise birth/closure does not identify ERP switching behavior. |
| Digital access is high but cloud maturity is uneven | GASTAT reports 98.0% internet access, 76.3% use of electronic banking, and 46.8% use of cloud-computing services among establishments in 2024. | Establishment-wide access does not guarantee stable bandwidth or skilled users at each branch/device. |
| Online commerce is meaningful but not universal | GASTAT reports 46.8% of establishments used the internet to order goods/services and 29.0% used it to sell or display goods/services in 2024. | The figures do not specify ERP integration quality or transaction volume. |
| Electronic tender is the retail norm | SAMA reports electronic payments were 85% of retail payments in 2025, with 14.6 billion electronic transactions versus 12.6 billion in 2024. | The aggregate does not define which provider Bunood should integrate first. |
| E-invoicing applies below enterprise scale | ZATCA states Phase 1 applies to VAT taxpayers and Phase 2 adds integration in notified waves. | Each company still needs current applicability and configured-company review; Bunood cannot infer a taxpayer's legal position. |

Primary sources:

- [Monsha'at Q2 2025 SME Monitor](https://www.monshaat.gov.sa/sites/default/files/2025-09/V5.0%20Monsha%27at%20SMEM%20Report%20-%20Q2-25.pdf)
- [GASTAT Small and Medium Establishments Statistics 2024](https://www.stats.gov.sa/documents/20117/2435267/SME%2B2024%2BEN.pdf/4cb50fc7-fcb2-729c-92fe-08b5790f75d8?t=1766944990175)
- [GASTAT Business Demography Statistics 2024](https://www.stats.gov.sa/documents/20117/2435267/Business%2BDemography%2B2024%2BEN.pdf/7e34c0d6-904a-f02d-5ff0-19efdeaca37b?t=1767155572295)
- [GASTAT Establishments ICT Access and Usage Statistics 2024](https://www.stats.gov.sa/documents/20117/2435267/Establishments%2BICT%2BAccess%2Band%2BUsage%2BStatistics%2B2024-EN.pdf/2b4e45e8-ccbe-9767-1615-2f7d21236a9c?t=1766638872322)
- [SAMA: electronic payments reached 85% of retail payments in 2025](https://sama.gov.sa/en-US/MediaCenter/News/pages/news-1139.aspx)
- [ZATCA e-invoicing rollout phases](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx)

## 3. Interpretation: jobs the product must solve

| Market observation | User job | Product implication | Primary V1 orders |
|---|---|---|---|
| Many new and micro businesses | Start correctly without a consultant at every step | Guided company setup, readiness checks, defaults with explanation, sample-to-live boundary, first useful outcome, resumable progress | WO-10, FND-03, FND-04 |
| Existing businesses may not be cloud-native | Move existing records without losing trust | Template mapping, dry run, duplicate quarantine, opening reconciliation, idempotent retry, cutover and rollback | WO-11 |
| Retail concentration and electronic tender | Sell quickly and know where the money went | Name-first POS, barcode/touch entry, tender and refund states, shifts, physical receipt, provider settlement and daily reconciliation | WO-23, WO-13, FIN-03, KSA-01..04 |
| Owner often performs several jobs | Know today's position and next action | One role-aware home with cash, sales, receivables, payables, stock alerts and explainable drill-down; no duplicate KPI source | WO-15, BI-01..04 |
| Small firms add people and stock complexity | Delegate safely without adopting ERP jargon | Job-based roles, approvals, purchase/receive/bill/pay, transfer/count/reorder, exception queues and bilingual help | FND-02, WO-20..22 |
| Medium firms require control and auditability | Close accurately and explain every number | Segregation, dimensions, bank reconciliation, assets, accruals, tax, period locks, evidence-backed statements and close cockpit | FIN-01..10, BI-01..05 |
| Saudi statutory workflows cross systems | Operate compliance rather than generate files | Visible external states, retry/rejection/correction, credentials, evidence retention, qualified review and exact ledger/output reconciliation | KSA-01..07, HR-01..05, WO-30..31 |
| Diverse workforce and bilingual operations | Complete the same job in Arabic or English | Semantic translation, RTL/LTR parity, mixed-data legibility, language-preserving print/help/recovery and real-user acceptance | FND-04 |

## 4. Target segments and product editions

“Edition” is a default experience and commercial package over the same native data,
not a forked product or weaker accounting model.

| Segment | Typical operating shape | Default experience | Must be complete before promotion | Deliberately hidden by default |
|---|---|---|---|---|
| **Start — micro retail/service** | Owner plus 1–5 workers; one branch; cash/card; limited stock or services | Guided activation, Simple invoice/POS, customer/item shortcuts, daily cash/tender total, ZATCA status, bilingual receipt, owner snapshot | Release safety; FND-01..04; WO-10; WO-12/13/15/23; OTC-01..04; KSA-01..04; controlled manual settlement | Chart maintenance, journals, dimensions, close controls, connector engineering |
| **Operate — small company** | 6–49 workers; buyer/warehouse/sales/accounting responsibilities; recurring purchasing and inventory | Role homes, quotations/orders, purchasing, receiving, stock, payables/receivables, approvals, bank reconciliation, employee self-service basics | Start scope plus WO-11/14/20/21/22; FIN-03/04; KSA-05; accepted inventory and bank periods | Specialist consolidation and rarely used accounting setup outside advanced mode |
| **Control — medium company** | 50–249 workers; branches, departments, finance team, audit and close calendar | Accountant/controller workspace, dimensions, budgets, assets, accruals, multicurrency, controlled close, governed reporting, privacy evidence | Operate scope plus FIN-01/02/05..10; BI-01..05; KSA-06/07; role/record scope and two controlled closes | Industry-specific modules not selected for the company |
| **Connect — regulated or ecosystem-heavy** | Payroll, portals, external payment/bank/order channels, provider SLAs | Supported connectors, customer portal, Saudi people/payroll pack, monitoring, consent/credential/retry/support workflows | Relevant earlier edition plus WO-30/31, OTC-05, HR-01..05 and provider/government-specific acceptance | Unsupported provider claims, screen scraping, unverified “offline” or compliance promises |

Users may move between editions by configuration and permission. Existing documents,
names, audit trail, and ledgers remain the same; the product must never require a
destructive “upgrade migration” between Bunood experiences.

## 5. Current Bunood comparison

| Need | Current evidence | Assessment | Next proof, not merely next feature |
|---|---|---|---|
| Simple bilingual daily entry | Simple invoice/form, item-name-first, RTL, translation, ready-row and recovery contracts exist | Strong foundation; representative live matrix incomplete | Real cashier/sales completion in Arabic and English on accepted desktop/phone devices with validation/server/network recovery |
| Retail/POS | Native POS, role, payment mode and catalogue presentation foundations exist | Material foundation; open-to-close operation not accepted | Cash/card/mixed/refund/return/hold, shift difference, ZATCA/receipt, stock/payment/GL and settlement reconciliation on target hardware |
| Guided activation | Readiness contracts, a built native-record first-use spine from Company through submitted Payment Entry, and one compact twelve-row pre-live map aligned to every contract readiness domain exist. Native facts are permission-filtered; every row names a responsible role, explains the unresolved consequence and exposes change or view access from server permissions. An opt-in work plan now uses one native Project per company and twelve native Tasks, retaining native Assign To, due dates, comments and visible attachment evidence. Query failures fail closed, qualified domains remain review-only, external operations/integrations are not inferred, and Task completion is not approval. | Partial; qualified decision/reopening, guided decisions and fresh-admin receipt remain incomplete; the map is observation and the native work plan is accountability, not compliance acceptance | New permitted administrator reaches first useful compliant sale/payment/print/statement without developer intervention |
| Migration | Contract/control register plus immutable mapped packets, isolated exact-file native rehearsals, duplicate decisions, correction lineage, guarded native failed-row recovery and an immutable eleven-domain source-to-native reconciliation evidence workflow exist | Partial; qualified real-source execution, reconciliation and acceptance remain open | Clean and dirty operator/accountant rehearsals with duplicate effectiveness, retained report evidence, exact opening controls and approved cutover/rollback |
| Buying and stock | Native documents and Simple presentation exist | Partial | Normal and exception request-to-pay and receive-to-stock cycles, counts/transfers/returns and exact Stock Ledger/GL reconciliation |
| Cash, banking and reconciliation | Payment/statement foundations and detailed contract exist | Partial/planned | Two controlled bank periods with import, duplicate quarantine, explainable matching, split/partial, review and GL reconciliation |
| Expert finance | Native ledgers/reports plus close contract exist | Planned as a product experience | Two consecutive controlled closes including journals, stock, assets, deferred accounting, FX, tax, locks/reopen and statements |
| Saudi tax/compliance | VAT/ZATCA/XML/QR/status/print foundations exist | Strong foundation; external and physical acceptance incomplete | Configured-company Sandbox and authorized Production cycles, recovery, corrections, physical parity and qualified review |
| Reporting and owner insight | Role homes, KPI/report contracts and routing exist | Partial | Versioned metric definitions and exact card/report/drill/export/print/schedule reconciliation under role restrictions |
| People/payroll | Detailed Saudi contract exists | Planned | Parallel payroll with contract-to-WPS/GOSI/payment/GL reconciliation and current authorized external evidence |
| Integrations and portal | Framework/portal contracts exist | Planned | Demand-selected providers and portal pass security, idempotency, failure/revocation, reconciliation, load and support acceptance |
| Production service | Build, release, performance and operations contracts exist | Acceptance incomplete | Candidate-bound staging/deploy/rollback, two isolated restores, monitoring/incident/on-call, second-operator and customer acceptance |

## 6. Prioritization conclusions

### Now: prove Start

Do not add another broad module before the first edition works end to end. Close the
release identity/physical/reproducibility gates; complete the representative design,
form, role and bilingual matrix; then accept activation → first sale → payment →
receipt/ZATCA → daily total → statement on real devices and realistic failures.

### Next: prove Operate

Add migration, purchase/receipt/bill/pay, stock movement/count/return, and bank
reconciliation as one controlled operating cycle. The proof is quantity, value, tax,
payable/receivable, payment, Stock Ledger, Payment Ledger, bank and GL agreement—not
the presence of menus.

### Then: prove Control

Build the accountant/controller workspace around continuous reconciliation and two
consecutive closes. Owner dashboards and reports become promotable only after every
number preserves company, period, currency, dimension, permission, freshness and
drill-down context.

### Finally: promote Connect capabilities separately

Payroll, portals, payment/bank/ecommerce connectors and industry packs should reuse
the accepted foundation but keep provider- or regulation-specific authorization,
evidence, support and release decisions. One successful API call cannot promote an
entire category.

## 7. Research still required before general availability

Desk research cannot establish usability or product-market fit. The following evidence
must be collected under `BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md`:

1. At least one complete benchmark round for each core role, with Arabic-first and
   English-first participants represented.
2. Micro retail/service interviews covering setup, tender, receipt, returns, shift,
   connectivity and support expectations.
3. Small-company workflow observation across owner, buyer, warehouse, sales and
   accountant handoffs.
4. Expert-accountant close observation using controlled Saudi company fixtures and
   exception cases.
5. Willingness-to-pay and packaging research for Start, Operate, Control, payroll,
   portal and connector add-ons.
6. Provider discovery using real customer demand before selecting the first payment,
   bank/statement and ecommerce connectors.

Until that evidence exists, segment labels and sequencing are hypotheses supported by
desk evidence—not claims that Bunood is already the best fit for every Saudi business.
