# Bunood V1 Execution Ledger

**Document date:** 2026-09-20  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Program authority map:** `quality/v1-program-authority-map.json`  
**Saudi market research synthesis:**
`BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md`  
**Machine edition promotion gates:** `quality/v1-edition-promotion-gates.json`  
**Role acceptance authority:**
`BUNOOD-V1-ROLE-ACCEPTANCE-MATRIX-2026-09-20.md`  
**Universal product grammar:**
`BUNOOD-V1-UNIVERSAL-PRODUCT-GRAMMAR-2026-09-20.md`  
**Bilingual terminology authority:**
`BUNOOD-V1-BILINGUAL-TERMINOLOGY-GOVERNANCE-2026-09-20.md`  
**User-research and usability authority:**
`BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md`  
**Performance and reliability authority:**
`BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md`  
**Machine performance budget:** `quality/v1-performance-budget.json`  
**Saudi PDPL operations authority:**
`BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine PDPL control register:** `quality/v1-pdpl-control-register.json`  
**Expert finance and close authority:**
`BUNOOD-V1-EXPERT-FINANCE-AND-CLOSE-CONTRACT-2026-09-20.md`  
**Machine finance-close control register:**
`quality/v1-finance-close-control-register.json`  
**Saudi people and payroll authority:**
`BUNOOD-V1-SAUDI-PEOPLE-PAYROLL-CONTRACT-2026-09-20.md`  
**Machine Saudi payroll control register:**
`quality/v1-saudi-payroll-control-register.json`  
**Guided onboarding and migration authority:**
`BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md`  
**Machine onboarding/migration control register:**
`quality/v1-onboarding-migration-control-register.json`  
**Saudi ZATCA and VAT operations authority:**
`BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine ZATCA control register:** `quality/v1-zatca-control-register.json`  
**Cash, bank, payment, and reconciliation authority:**
`BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md`  
**Machine cash/bank/payment control register:**
`quality/v1-cash-bank-payment-control-register.json`  
**Procurement and inventory operations authority:**
`BUNOOD-V1-PROCUREMENT-INVENTORY-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine procurement/inventory control register:**
`quality/v1-procurement-inventory-control-register.json`  
**POS and retail operations authority:**
`BUNOOD-V1-POS-RETAIL-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine POS/retail control register:** `quality/v1-pos-retail-control-register.json`  
**Order-to-cash and customer operations authority:**
`BUNOOD-V1-ORDER-TO-CASH-AND-CUSTOMER-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine order-to-cash control register:**
`quality/v1-order-to-cash-control-register.json`  
**Reporting and decision-support authority:**
`BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md`  
**Machine decision-support control register:**
`quality/v1-decision-support-control-register.json`  
**Integration and connector operations authority:**
`BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md`  
**Machine integration/connector control register:**
`quality/v1-integration-connector-control-register.json`  
**Production operations and support authority:**
`BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md`  
**Machine production-operations control register:**
`quality/v1-production-operations-control-register.json`  
**Executable target manifest:** `quality/v1-acceptance-manifest.json`  
**Complete work-order status register:** `quality/v1-work-order-status.json`  
**Current release authority:**
`BUNOOD-PRODUCTION-MVP-AUTHORITATIVE-HANDOFF-2026-09-19.md`  
**Baseline inspected:** branch `production/theme-v0.46.7`, recorded HEAD `18209bd`,
intentionally dirty release-candidate worktree  
**Purpose:** convert the V1 strategy into evidence-controlled execution without
confusing upstream capability, implemented code, automated coverage, and accepted
product behavior.  
**Exclusion:** artificial-intelligence features are outside V1.

## 1. Status language

Every V1 item uses exactly one of these states:

| State | Meaning |
|---|---|
| **Verified** | Current authoritative evidence proves the stated scope on the named candidate. |
| **Implemented, acceptance incomplete** | Code or configuration exists, but the full role/language/viewport/data/recovery scope is not proven. |
| **Planned** | The approved outcome and gate exist; implementation evidence does not. |
| **External gate** | Completion requires owner, hardware, regulator, licensed partner, or qualified professional evidence. |
| **Blocked** | Work cannot proceed after safe alternatives are exhausted; blocker and owner must be named. |

“ERPNext supports it” is never equivalent to **Verified**. A promoted Bunood
capability needs a user, supported configuration, task-designed route, permissions,
complete journey, reconciled result, recovery path, documentation, and support owner.

## 2. Phase 0 — current MVP release control

The release receipt is the source of truth for the detailed evidence. This summary
prevents post-MVP work from concealing an unfinished release gate.

| ID | Required outcome | Current state | Evidence | Remaining action/owner |
|---|---|---|---|---|
| V1-P0-01 | Active software contract suites pass | **Verified** | Release receipt records JavaScript 220/220 and Python 27/27 | Rerun after any release-candidate change; engineering/QA |
| V1-P0-02 | Native persistent quote-to-cash reconciles | **Verified** | `SAL-QTN-2026-00003` → `SAL-ORD-2026-00005` → `ACC-SINV-2026-00013` → `ACC-PAY-2026-00003`; GL and outstanding verified | Preserve as regression evidence; accounting/QA |
| V1-P0-03 | Managed commercial PDFs are structurally and visually accepted in software | **Verified** | Release receipt records fresh 12/12 bilingual A4/80 mm outputs plus bilingual statements | Rerun after print/template/data changes; print/QA |
| V1-P0-04 | Legal identity, VAT, address, contact, logo, and ZATCA configuration are approved | **External gate** | Receipt identifies placeholder phone/email and unapproved logo | Owner and Saudi compliance owner confirm or replace live values |
| V1-P0-05 | A4 paper output passes at 100% on target printer | **External gate** | No physical-print record | Owner/implementation fills the physical acceptance record |
| V1-P0-06 | 80 mm paper output passes on target thermal printer | **External gate** | No physical-print record | Owner/implementation fills the physical acceptance record |
| V1-P0-07 | Every required paper QR scans on a real device and matches preview/PDF/paper | **External gate** | Software QR checks pass; paper scan absent | Owner/implementation records device, document, and result |
| V1-P0-08 | Candidate is reproducible from a reviewed commit/tag | **Planned** | Worktree is intentionally dirty; receipt forbids release without consolidation | Engineering reviews scope, commits, tags, rebuilds, deploys, reruns final gate after owner/physical evidence |
| V1-P0-09 | Executable readiness gate returns a release decision | **Implemented, acceptance incomplete** | `npm run release:check` exists and previously reported 13 explicit blockers | Current host revalidation stopped at `spawnSync docker ENOENT`; rerun on the configured release host with Docker available |

### Phase 0 promotion rule

Do not mark the MVP production-ready, commit a final receipt, or promote Phase 1
changes into the release candidate until V1-P0-04 through V1-P0-09 are evidenced.
Planning and isolated development may continue, but the release branch must not blur
the two baselines.

## 3. Phase 1 — universal UX foundation baseline

### 3.1 Contract coverage already present

Focused revalidation on 2026-09-20 passed **166/166** Node contract tests across
sales bill, simple forms, sidebar, translation, palette, interaction accessibility,
and visual primitives. The complete locally discoverable JavaScript contract set
then passed **383/383**, including the role fixtures, five POS authority contracts,
six executable-manifest/work-order-catalog contracts, five program-authority-map
contracts, five edition-promotion-gate contracts, six performance-budget/gate
contracts, five Saudi PDPL control-contract checks, five expert-finance/close
control-contract checks, five Saudi people/payroll control-contract checks, five
guided-onboarding/migration control-contract checks, five Saudi ZATCA operations
control-contract checks, five cash/bank/payment/reconciliation control-contract
checks, five procurement/inventory control-contract checks, five POS retail
control-contract checks, five order-to-cash/customer-operations control-contract
checks, five reporting/decision-support control-contract checks, and six focused POS
catalogue contracts, plus five integration/connector control-contract checks and
twelve first-use readiness presentation/authority/work-plan contracts. The V1
production-operations contract adds five more fail-closed checks. The V1 marker and
POS-operator role contracts passed
**10/10** focused
Python tests. The focused migration/readiness policy set passes **24/24**. The broader
environment-independent Python set now passes **134/134**;
two additional
modules could not be collected on this host
because `num2words` and the Frappe runtime are unavailable. `npm run i18n:check`
reported 2,104 source strings with eight explicit exemptions and complete coverage;
`npm run v1:manifest`, SCSS compilation, JavaScript syntax, and `git diff --check`
passed. The Docker-backed smoke and release gates remain unavailable on this host.
These results prove the focused contracts below; they do not replace the full release
gate or broad V1 route matrix.

| Contract | Current evidence | State | V1 expansion needed |
|---|---|---|---|
| Same native document in Simple and Advanced modes | `tests/simple_forms.test.cjs`, `tests/sales_bill.test.cjs`, mapped-invoice live receipt evidence | **Verified** for accepted MVP invoice scope | Extend to every promoted core form and lifecycle state |
| Mode controls are inline; selected is dark green and unselected is neutral | `tests/sales_bill.test.cjs` plus sales-bill SCSS assertions | **Verified** for invoice workbench | Promote to shared component; eliminate route-specific copies |
| Completed invoice row creates one trailing ready row | `tests/sales_bill.test.cjs` executes `ensureEntryRow` behavior | **Verified** for invoice workbench | Extend accepted row-entry behavior to purchase, delivery, receipt, stock, quotation, and order forms where applicable |
| Untouched ready rows do not block save or appear in output | `pruneBlankRows` execution test plus save-path source contract | **Verified** for invoice workbench | Add end-to-end save/print/posting proof for each applicable child table |
| Item name is prominent and code is secondary | Invoice/POS contracts plus the run-owned `npm run v1:item-live` gate. The Item Simple form now places a full-width, stronger `item_name` before the secondary `item_code`, exposes Group/UOM/stock/disabled state, preserves the same native document in Advanced, and exercises native name search plus Stock User write denial and marker-only Owner read denial across English/Arabic, light/dark, and four widths. The latest configured-site run passed all declared cases and cleaned its Item/users; this is not a full V1 persona or downstream print/report receipt. | **Implemented, acceptance incomplete** | Extend the same accepted identity hierarchy to every purchasing, warehouse, list, print, search, and report surface; add remaining declared personas and immutable candidate receipt evidence. |
| Stock Entry uses the native inventory lifecycle without warehouse leakage | `npm run v1:stock-entry-live` creates one run-owned Stock User and marker-only Owner, two run-owned warehouses with one native User Permission boundary, and one run-owned stock item. It verifies new/draft Simple and Advanced presentation across English/Arabic, light/dark and four widths; native warehouse search and a forbidden-warehouse insert denial; native draft, submit and cancel; exact Bin and Stock Ledger quantity movement/reversal; balanced perpetual-inventory GL evidence; Owner denial; and exact teardown. A route-scoped compatibility adapter exposes only the two original Stock Settings values required by ERPNext's own controller after checking native Stock Entry read permission, eliminating ordinary Stock User 403s without granting settings configuration. | **Implemented, acceptance incomplete** | Add buyer/accountant/finance/administrator task evidence, transfer/issue/receipt/count exception cases, serial/batch and valuation cases, report reconciliation, immutable candidate receipts and qualified warehouse/accounting review. |
| Invalid invoice save restores usable controls and focus | `saveDraft` mandatory-check test; missing party/item focus tests | **Verified** for covered invoice validation paths | Exercise server rejection, permission, conflict, offline/network, and integration failures across core forms |
| Save actions state their outcome | Invoice tests cover Save draft, Save and submit, Save and create new | **Verified** for invoice workbench | Define shared state/action matrix for all core documents; use Save and continue only where it has a distinct outcome |
| Preview does not blank the whole page | `tests/sales_bill.test.cjs` scrim/rail contract | **Verified** for invoice rail structure | Add delayed/error/retry browser acceptance with production-like preview latency |
| Bilingual catalogue and RTL contracts | Release receipt records 1,488 MVP strings; current WIP source check records 1,514 strings, eight exemptions, and complete catalogue coverage | **Verified** for MVP scope | Expand per workstream; prohibit mixed static labels on every promoted route/print surface |
| Narrow sidebar/drawer works | Release receipt records live 700 px RTL open/dismiss evidence | **Verified** for MVP candidate | Test shared shell for all role homes, lists, reports, settings, portals, and mobile destinations |
| Neutral-first visual system | Tokens and several targeted palette/visual tests exist | **Implemented, acceptance incomplete** | Add cross-route review for green flood, decorative pills, card soup, geometry, whitespace, field widths, and off-centre grids |
| Performance and reliability gate | `quality/v1-performance-budget.json`, `tools/v1-performance-gate.mjs`, and six focused tests define fail-closed Starter/Standard, bilingual, device/cache, tail-latency, queue, correctness, load/recovery, reliability, and evidence checks | **Implemented, acceptance incomplete** | Collect the immutable production-like receipt; the live command currently and correctly returns `HOLD` without it |
| Saudi PDPL operations contract | `BUNOOD-V1-SAUDI-PDPL-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-pdpl-control-register.json`, and five focused checks preserve six rights, 30-day request/extension limits, the threshold-dependent 72-hour breach ceiling, twelve control/evidence groups, transfer blocks and ledger-safe disposition invariants | **Planned product with validated contract** | Implement the restricted workspace and pass all candidate-bound exercises plus qualified Saudi privacy/legal review; this is not a compliance receipt |
| Expert finance and close contract | `BUNOOD-V1-EXPERT-FINANCE-AND-CLOSE-CONTRACT-2026-09-20.md`, `quality/v1-finance-close-control-register.json`, focused fail-closed checks, and the route-scoped `bnd-journal-workbench` plus `bnd-finance-close` cockpits preserve native-ledger authority, six roles, five dependency levels and eleven reconciliation families. The journal surface adds a bounded permission-filtered queue, distinct draft/unbalanced/submitted/cancelled/reversal/generated states, same-Company template/recurrence evidence, safe document-choice guidance and native accounting handoffs. The close surface adds permission-filtered draft-source attention, bounded period identity, separate Accounting Period/frozen-date/Period Closing Voucher meanings, non-approving evidence stages and native report/document handoffs. Neither surface posts, approves, reconciles or certifies. | **FIN-02 and FIN-08 evidence foundations implemented; finance/close acceptance incomplete** | Complete and accept the task-designed journal/accrual/reversal/prepayment/deferral/allocation/recurrence/approval journeys; implement configured close instances, owners/reviewers, dependencies, reconciliations, soft-close review, governed reopen/relock and immutable packets; then deploy/migrate and pass exact source-to-GL cases plus two consecutive candidate-bound controlled closes under qualified accountant review |
| Saudi people and payroll contract | `BUNOOD-V1-SAUDI-PEOPLE-PAYROLL-CONTRACT-2026-09-20.md`, `quality/v1-saudi-payroll-control-register.json`, and focused fail-closed checks preserve native payroll authority, ten roles, the ten-link employee chain, government/payment state integrity and twelve evidence groups | **Planned product with validated contract** | Implement the people/payroll workspace and pass normal plus exception parallel cycles under qualified Saudi HR/payroll/legal/accounting review and authorised external-interface evidence |
| Guided onboarding and migration contract | `BUNOOD-V1-GUIDED-ONBOARDING-AND-MIGRATION-CONTRACT-2026-09-20.md`, `quality/v1-onboarding-migration-control-register.json`, focused fail-closed contract/implementation checks, `bunood_theme/start_readiness.py`, `bunood_theme/launch_readiness.py`, `bunood_theme/readiness_work.py`, `bunood_theme/readiness_review.py`, `bunood_theme/migration_scope.py`, `bunood_theme/migration_rehearsal.py`, `bunood_theme/migration_reconciliation.py`, and the migration packet/rehearsal/reconciliation DocTypes preserve twelve readiness domains and add candidate-bound migration evidence. Home derives Company → Customer → Item → submitted Sales Invoice → submitted Payment Entry from permission-filtered native records, followed by one twelve-row pre-live map. Native Project/Task records hold onboarding accountability; an append-only review receipt records readiness decisions. The separately permissioned migration packet freezes ordered datasets, source hashes, source site/one-way database identity, mapping versions, owners, material-opening reviewers, control totals, cutover/recovery policy and exact candidate/receipt digests. On a different explicitly opted-in restored clone, a guarded action rechecks current-user and native import permissions, verifies the exact attached-file hash, runs Frappe's native Data Import, and captures a submitted privacy-minimised result receipt. Each Data Import dataset binds approved stable-identity evidence to a duplicate disposition that must match its native import type. Exact retries reuse the existing rehearsal; an exception can create a new packet with predecessor/receipt lineage, and unchanged correction packets cannot be submitted. A submitted exception receipt with failed rows can download Frappe's native errored-row template after renewed isolation, permission, import-identity and file-integrity checks; Bunood does not proxy raw import logs. After all mapped datasets have one successful receipt on the same clone, a guarded reconciliation form binds every rehearsal digest, preloads eleven source-to-native control families, preserves exact decimal text and reproducible report filters, derives exact/variance/exception state, requires owned recovery for non-zero differences and enforces a distinct reviewer for material openings. Only a non-empty wholly successful native run becomes `dry-run-validated`; partial/error/timeout/inconsistent or oversized logs fail closed. The receipts and downloads cannot authorize production load, accounting acceptance, cutover, rollback or migration acceptance. Runtime reads/creates preserve current-user permissions, external areas stay external, queries fail closed, and no real acceptance is inferred. | **WO-10 and bounded WO-11 mapped-packet/isolated-rehearsal/correction/reconciliation-evidence foundations implemented; acceptance incomplete** | Deploy/migrate and pass a fresh-admin bilingual assigned/evidenced/submitted/reopened invoice/payment/print/statement outcome with genuinely qualified reviewers, then execute real-operator/accountant clean/dirty migrations proving correction, source-specific identity/duplicate effectiveness, exact report-backed opening controls, permission isolation, complete restore/approved native rollback and external approvals |
| Saudi ZATCA and VAT operations contract | `BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-zatca-control-register.json`, and five focused fail-closed checks preserve eight roles, twelve readiness states, sixteen document states, standard clearance versus simplified reporting, native/connector authority, credential safety, corrections and twelve evidence groups | **KSA-01..04 implemented foundations; KSA-05 planned product with validated contract** | Pass controlled Sandbox plus authorised Production cycles, exact native/XML/QR/output/tax/stock/payment/GL reconciliation, all recovery and credential cases, physical scans, current official review and qualified Saudi sign-off; structural validation is not ZATCA acceptance |
| Cash, bank, payment and reconciliation contract | `BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md`, `quality/v1-cash-bank-payment-control-register.json`, focused fail-closed checks, and the route-scoped `bnd-banking` cockpit preserve native authority, eight roles, distinct payment/bank/settlement lifecycles, seven money chains, source evidence, permission-filtered summaries, ageing and direct native import/reconciliation handoffs | **WO-12/13/14, OTC-03/04 and FIN-03/04 implemented foundations; bank and payment acceptance incomplete** | Deploy/migrate the banking Page, complete accountable difference/reviewer evidence, and pass normal plus exception controlled periods with duplicate/reimport, match/split/merge/partial/unmatch cases and exact Payment Ledger, AR/AP, cash, provider-clearing, bank and GL reconciliation; structural/UI validation is not reconciliation acceptance |
| Procurement and inventory operations contract | `BUNOOD-V1-PROCUREMENT-INVENTORY-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-procurement-inventory-control-register.json`, and five focused fail-closed checks preserve nine roles, seventeen procurement states, fifteen stock states, the eight-link document chain, eleven reconciliation links, physical/accounting boundaries and twelve evidence groups | **WO-20/21/22 and related OTC/FIN/KSA foundations implemented; acceptance incomplete** | Implement the task-designed purchase/receipt/bill/pay/return and transfer/scan/count/valuation workspaces; pass normal plus exception controlled cycles with exact quantity/value/tax/payable/payment/Stock Ledger/GL reconciliation and qualified cross-functional review |
| POS and retail operations contract | `BUNOOD-V1-POS-RETAIL-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-pos-retail-control-register.json`, and five focused fail-closed checks preserve eight roles, twelve readiness states, sixteen sale states, twelve shift states, the eight-link sale chain, ten reconciliation links, offline-claim boundaries and twelve evidence groups | **WO-23 and related OTC/FIN/KSA foundations implemented; acceptance incomplete** | Complete the task-designed readiness/tender/return/close/reconciliation path and pass real cashier, supervisor and finance normal/exception open-to-close cycles with accepted hardware, physical output, performance and exact stock/tax/ZATCA/payment/closing/GL reconciliation |
| Order-to-cash and customer operations contract | `BUNOOD-V1-ORDER-TO-CASH-AND-CUSTOMER-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-order-to-cash-control-register.json`, and five focused fail-closed checks preserve nine roles, ten customer states, twenty-four commercial states, the ten-link document chain, ten reconciliation links, customer-portal isolation and twelve evidence groups | **OTC-01..04 and WO-12/13 foundations implemented; OTC-05 planned; acceptance incomplete** | Complete the task-designed lead/customer/quote/order/fulfilment/invoice/collection/return and portal paths; pass real-role normal plus exception cycles with exact stock/tax/ZATCA/AR/payment/settlement/GL reconciliation, bilingual output parity and cross-customer security evidence |
| Reporting and decision-support contract | `BUNOOD-V1-REPORTING-AND-DECISION-SUPPORT-CONTRACT-2026-09-20.md`, `quality/v1-decision-support-control-register.json`, and five focused fail-closed checks preserve ten roles, seventeen definition fields, eight definition states, ten result states, the nine-link decision chain, ten reconciliation links and twelve evidence groups | **WO-15 and BI-02..04 foundations implemented; BI-01/05 planned; acceptance incomplete** | Implement definition governance and the task-designed owner/role/report/custom-report paths; pass real-role normal plus exception controlled periods with exact card/report/drill/export/print/schedule parity, permission isolation, bilingual states, performance and qualified review |
| Integration and connector operations contract | `BUNOOD-V1-INTEGRATION-AND-CONNECTOR-OPERATIONS-CONTRACT-2026-09-20.md`, `quality/v1-integration-connector-control-register.json`, and five focused fail-closed checks preserve three categories, eight roles, sixteen connector states, fourteen message states, the ten-link operating chain, ten reconciliation links and twelve evidence groups | **WO-30/31 planned product with validated contract** | Select customer-demanded payment, bank/Open Banking or statement, and ecommerce/order providers; implement the shared framework and pass sandbox plus authorised-production normal/exception cycles with permission/secret/privacy controls, idempotency/recovery, load/upgrade/support and exact external/native/stock/tax/payment/bank/GL reconciliation |
| Production operations and support contract | `BUNOOD-V1-PRODUCTION-OPERATIONS-AND-SUPPORT-CONTRACT-2026-09-20.md`, `quality/v1-production-operations-control-register.json`, and five focused fail-closed checks preserve eight roles, twelve release states, twelve service states, ten incident states, the ten-link operations chain and twelve evidence groups | **WO-00/01 and FND-05 foundations implemented; acceptance incomplete** | Pass two isolated restores, normal/failed deployment, migration/rollback with post-deploy data boundary, monitoring/incident/on-call/customer communication, privileged-access/privacy, measured SLO/RPO/RTO/capacity/support and second-operator runbook evidence on the exact candidate |
| Program authority map | `quality/v1-program-authority-map.json`, `tools/v1-program-authority-map.mjs`, and five focused fail-closed checks bind all 51 work orders to 15 primary authority groups and existing authority documents/machine targets without duplicate ownership | **Planning map validated; no implementation or acceptance claim** | Keep the map synchronized with the mega plan, work-order catalog, detailed orders, status registry, and manifest whenever scope or authority changes |
| Saudi segment and edition promotion gates | `BUNOOD-V1-SAUDI-MARKET-RESEARCH-SYNTHESIS-2026-09-20.md`, `quality/v1-edition-promotion-gates.json`, and five focused fail-closed checks bind all 51 orders once to Start, Operate, Control, or Connect and preserve native truth, prerequisites and 24 promotion-evidence groups | **Desk synthesis and planning gates validated; no product-market-fit or edition-acceptance claim** | Validate the hypotheses with real Saudi users, then execute each candidate-bound promotion group without allowing a later edition to conceal an unfinished earlier core experience |

### 3.2 Phase 1 epics

| Epic | Outcome | Dependencies | Acceptance evidence | State |
|---|---|---|---|---|
| V1-UX-01 Role and permission model | Named roles receive relevant home, navigation, governed least-privilege authority, record scope, density, and help without treating the client as an authorization layer | Current role fixtures; product/accounting/security ownership | Permission matrix plus top-three task completion for cashier, sales, buyer, warehouse, accountant, owner, and admin | **Implemented, acceptance incomplete** |
| V1-UX-02 Canonical shell | One top bar, sidebar/drawer, breadcrumbs, search, mobile navigation, and unsaved-route behavior | Sidebar/topbar living contracts | Route × role × language × viewport shell matrix with no duplicate owner | **Implemented, acceptance incomplete** |
| V1-UX-03 Shared form grammar | Five-zone form anatomy, common state/actions, aligned field grid, progressive disclosure, and recovery behavior | Existing simple forms and invoice workbench | Core-form state matrix in Arabic/English at desktop/tablet/phone | **Implemented, acceptance incomplete** |
| V1-UX-04 Shared data-entry grammar | Name-first search, keyboard entry, ready rows, tables/cards, bulk actions, and transparent identifiers | V1-UX-03 | Sales, purchase, inventory, banking, accounting, and POS task benchmarks | **Implemented, acceptance incomplete** |
| V1-UX-05 Neutral visual refinement | Calm white/neutral workspace; green reserved for brand/current primary/selected/success; ordinary controls instead of pill/card repetition | Shared tokens/components | Cross-route visual acceptance and automated token/contrast/geometry checks | **Implemented, acceptance incomplete** |
| V1-UX-06 State and recovery system | Loading, empty, partial, invalid, permission, setup, conflict, integration delay/rejection, and retry are explicit | `SYSTEM-STATES.md`; integration framework later | State injection fixtures plus task recovery acceptance | **Implemented, acceptance incomplete** |
| V1-UX-07 Role homes and work queues | Today’s actions and exceptions precede KPIs; every non-zero card drills to exact data | V1-UX-01/02; reconciled query definitions | Role-home scenario tests and metric-to-list reconciliation | **Implemented, acceptance incomplete** |
| V1-UX-08 Guided onboarding | Company, tax, accounts, warehouse, pricing, payment, print, users, privacy, ZATCA, backup readiness and a reversible first useful transaction under the validated contract | Phase 0 lessons; compliance owners; existing record-derived first-use spine, twelve-domain permission-filtered pre-live map, and one native Project/Task accountability plan per company with native assignments/evidence and no parallel ledger | Fresh permitted administrator assigns/reviews every applicable domain and reaches the first invoice/payment/print/statement outcome in Arabic and English without developer intervention; Task completion never substitutes for qualified approval | **Implemented, acceptance incomplete** |
| V1-UX-09 Safe migration | Dry-run import, identity/duplicate/error recovery, native dependency order, idempotent retry, opening-data reconciliation, cutover and rollback under the validated contract | V1-UX-08; implemented immutable mapped-scope packet, exact-file isolated native-import receipt, explicit duplicate decision, materially changed correction lineage, guarded native failed-row export and immutable eleven-domain reconciliation evidence with exact decimal controls/owned variances; clean and dirty import fixtures | All applicable customers, suppliers, items, prices, stock, AR/AP, Trial Balance, bank/cash, asset and VAT controls reconcile exactly; isolation and restore/rollback pass | **Implemented, acceptance incomplete** |
| V1-UX-10 Maintainable delivery | Split large UI/test modules behind stable contracts; retain sequential shared-site orchestration | Code-quality audit; test registry | No behavioral change, complete registration, focused suites plus release gate | **Planned** |

### 3.3 Universal grammar and executable coverage declaration

The canonical shell, five-zone form, action hierarchy, name-first data entry, system
state/recovery, neutral visual language, bilingual/RTL, responsive, and accessibility
rules now have one documented authority in
`BUNOOD-V1-UNIVERSAL-PRODUCT-GRAMMAR-2026-09-20.md`.

`quality/v1-acceptance-manifest.json` converts the next-phase representative scope
into **784 declared target combinations** across 11 surfaces, eight personas, both
languages, four production widths, both themes, and each surface's lifecycle states.
Its validator currently records 21 runnable structural/live gates and two explicit
planned gates. The declaration contains no pass claim and cannot promote a surface;
each runnable gate still needs candidate-specific execution evidence. The currently
planned gaps are the Payment Entry live persona journey and the live POS
shift-to-close journey. The run-owned Stock Entry gate covers a scoped warehouse
operator, allowed/forbidden warehouses, native draft/submit/cancel, exact Bin,
Stock Ledger and balanced GL evidence, bilingual responsive presentation, marker-only
Owner denial and exact cleanup; it remains partial evidence rather than acceptance for
every declared persona and inventory exception. The run-owned Item gate covers a native
saved/disabled Item, name-first Simple/Advanced presentation, native name search,
image/UOM/stock state, Stock User write denial and marker-only Owner read denial
across both languages, four widths and both themes; it remains partial V1 evidence,
not acceptance for every declared persona or downstream consumer. The new POS
structural gate proves adaptive non-clipping catalogue cards, name-first identity with
secondary code, neutral micro-image fallbacks, name/code/barcode search copy, rerender
repair, and Arabic catalogue coverage. A separate self-cleaning role-authority gate
probes the effective server permission matrix for a run-owned cashier and rejects
manager shortcuts and high-risk grants. Neither proves a real cashier transaction,
record scope, receipt, return, or shift close.

### 3.4 Current role baseline and target split

The original role-home acceptance fixture intentionally combines `Sales User`,
`Purchase User`, `Accounts User`, and `Stock User` into one generic ERP user. It is
retained as a broad-role regression fixture. A second run-owned V1 fixture family now
defines seven isolated identities for cashier, sales, purchasing, warehouse,
accounting, finance, and owner acceptance. Required native or marker roles are
validated before fixture creation; missing required roles fail explicitly rather
than silently weakening the test.

The cashier identity now separates presentation from authority. `Bunood Cashier`
remains a navigation marker with no DocPerm. Pinned ERPNext 16.34.1 reserves both
Sales Invoice and POS Invoice for Accounts roles, while `Sales User` and `Stock User`
do not make either invoice submittable. `Bunood POS Operator` therefore supplies the
exact cashier contract: read-only POS Profile and Customer access; create/read/write/
delete-draft/submit/print on both supported invoice types; and create/read/write/
submit on opening and closing entries. Invoice and shift grants are creator-only,
matching the pinned closing query's owner/profile filter. Cancel, amend, email, report, import/export,
share, journal, and settings rights are denied. Broad native Sales, Stock, Accounts,
and Manager roles are forbidden on the cashier fixture. Existing administrator
extensions are preserved by the installer but surfaced as acceptance failures. The
live command is `node tools/pos-role-permission-acceptance.mjs`; it is runnable on the
configured Frappe host but could not be executed here because Docker is unavailable.

Client navigation now supplies focused workspace profiles for those seven personas,
plus the existing combined ERP and real-estate profiles. It only filters the
server-provided `allowed_workspaces`, keeps an explicit permitted personal home
visible, and leaves System Manager unrestricted. Focused resolver tests pass for
single-job, normal combined-role, explicit-home, owner/cashier precedence, and
administrator cases. This establishes navigation policy; it does **not** yet prove
the full V1 role homes, permissions, create actions, mobile destinations, or top-task
journeys.

The following is the starting design hypothesis. Candidate ERPNext roles are inputs
to a least-privilege permission workshop, not permission grants to apply blindly.

| Persona | Candidate native role basis | Default home | Top three tasks to accept | Hidden from the default experience |
|---|---|---|---|---|
| Cashier | `Bunood Cashier` marker + managed `Bunood POS Operator` authority + reviewed User/POS Profile scope; no broad native transaction role | POS shift | Open shift; complete/hold/return sale; close and explain tender difference | Journals, chart setup, tax setup, broad reports |
| Sales representative | `Sales User` plus customer access rules | Sales work queue | Find customer; quote/order/invoice; follow overdue follow-up | Purchase, stock valuation, journals, system settings |
| Buyer | `Purchase User` | Purchasing work queue | Request/compare; order; follow receipt/bill/payment status | Sales pipeline, journals, payroll, system settings |
| Warehouse operator | `Stock User` with warehouse/user permissions | Warehouse tasks | Receive/put away; pick/transfer; count/variance handoff | Prices/margins unless allowed, financial statements, configuration |
| Employee | Employee self-service roles for installed HR scope | My work | Expense; time/leave; payslip/documents | Company-wide transactions, other employees’ personal data, ledgers |
| Accountant | `Accounts User` with explicit company/dimension scope | Accounting workbench | Post/review; bank/payment reconcile; close/report preparation | System administration, unrelated operational setup |
| Finance manager | `Accounts Manager` with approval policies | Finance exceptions | Approve; review cash/ageing/tax; close/sign-off | Infrastructure administration unless separately assigned |
| Owner | `Bunood Owner` experience marker plus separately reviewed read/approve permissions | Business pulse | Understand position; inspect exceptions; approve governed decisions | Routine data-entry detail, technical settings, infrastructure health |
| Administrator/implementer | `System Manager` only where genuinely required | Readiness/system health | Configure; migrate/integrate; audit/support | Nothing permitted is hidden from search, but high-risk actions stay explicit |

V1-UX-01 is accepted only after each row has a tested permission set, fixture user,
default workspace, mobile destinations, allowed create actions, top-three journey
timings, Arabic/English copy, denial tests, and confirmation that hiding navigation
never substitutes for server permission. The exact provisional action, scope,
journey, negative-test, and promotion gates are defined in
`BUNOOD-V1-ROLE-ACCEPTANCE-MATRIX-2026-09-20.md`.

### 3.5 Marker and POS-authority security contract

`Bunood Cashier` and `Bunood Owner` are installed idempotently as custom Desk roles.
They are **experience markers only**: installation creates no `DocPerm`,
`Custom DocPerm`, workflow permission, or User Permission record, and it does not
alter an existing marker role. Their presence may select a navigation profile but
can never authorize a document, report, company, warehouse, or approval.

- Cashier authority now combines the managed `Bunood POS Operator` contract, the
  assigned POS Profile, and required company/warehouse User Permissions. The
  run-owned effective-permission gate covers the DocType grants and
  high-risk denials; allowed/forbidden record scope and the live cashier journey
  remain outstanding.
- Owner authority must be designed as explicit read/approve permissions after the
  accounting and security review. Assigning only `Bunood Owner` intentionally grants
  no business-record access. Owner drill-down and approval journeys remain
  outstanding.
- Mixed duties fall back to the broader server-permitted navigation set; the client
  never combines marker roles into new authority.
- The seven run-owned fixture identities are test scaffolding, not a production role
  template. Their exact permissions must be validated on the configured site before
  V1-UX-01 can be promoted.

### 3.6 Complete work-order status register

`quality/v1-work-order-status.json` is the machine-validated status source for all
51 orders defined by the two work-order documents. As of 2026-09-20 it records:

- **34 implemented, acceptance incomplete** orders: meaningful Bunood code,
  configuration, or evidence foundations exist, but the full stated promotion gate
  is not proven;
- **17 planned** orders: bounded outcome and gate exist, but implementation or
  accepted product evidence is absent; and
- **0 verified** V1 orders: no order may be promoted from plan or partial evidence.

The status register names current evidence and the next gate for every ID. It is a
planning control, not a test receipt. Update it only when the execution ledger links
candidate-specific evidence matching the full work-order scope.

## 4. First 90-day execution sequence

Calendar ranges begin only when the assigned team and release baseline are available.
Evidence, not elapsed time, promotes an item.

### Now — protect and close the release baseline

1. Execute WO-00 and WO-01 first; no Phase 1 breadth may weaken this baseline.
2. Obtain V1-P0-04 owner/compliance confirmation.
3. Run and record V1-P0-05 through V1-P0-07 on the target hardware.
4. Consolidate the reviewed candidate, rebuild/deploy it, and rerun the executable
   readiness gate on the configured release host.
5. Sign the MVP release receipt or record exact failed evidence and return only the
   affected work package to development.
6. Branch/freeze the accepted baseline before Phase 1 structural refactoring.

### Next — establish universal product grammar

1. Complete FND-02/V1-UX-01: record-scoped role permissions and live top-task/denial
   evidence over the role matrix already defined.
2. Complete FND-01/FND-03/FND-04 by applying the documented shared shell, form,
   action, state, table, bilingual, accessible, and responsive contracts.
3. Expand the existing 11-surface/784-combination declaration into executable
   route × role × state × language × viewport × theme evidence. Close its two
   currently planned live gates without treating the declaration as a receipt.
4. Apply and accept the grammar on one representative document from each interaction family:
   Sales Invoice, Purchase Invoice, Stock Entry, Payment Entry, Customer, Item, and
   one dense report/list.
5. Execute FND-05 modular test/performance/upgrade work behind unchanged public
   behavior. Meet the named browser/API/database/cache/queue/recovery targets in
   `BUNOOD-V1-PERFORMANCE-RELIABILITY-SLO-2026-09-20.md` on Starter and Standard
   profiles, then validate with cashier, operator, accountant, owner, and
   administrator task tests. The budget declaration must pass
   `npm run v1:performance:plan`; promotion requires
   `npm run v1:performance:gate -- --receipt <immutable-receipt.json>` to pass on
   the exact candidate.

### Then — onboarding and complete daily commerce

1. Ship WO-10/V1-UX-08 readiness onboarding and WO-11/V1-UX-09 safe migration.
2. Execute OTC-01..04, WO-12/13/20..23, FIN-03/04, and KSA-01..04 across
   quotation/order/delivery, collections, payments, purchasing/payables,
   inventory/warehouse, returns, POS, bank reconciliation, VAT, and ZATCA.
3. Begin BI-01 before promoting WO-15/BI-02..04, so every dashboard and report
   metric has a signed definition and controlled-data reconciliation.
4. Reconcile every journey before promoting OTC-05, expert-finance breadth,
   workforce/payroll, connectors, or another industry pack.

## 5. Requirement-to-evidence rule

Every implementation pull request or release receipt must identify:

1. V1 workstream/epic ID;
2. persona and permitted role;
3. supported document lifecycle states;
4. Arabic/English and viewport coverage;
5. authoritative source document and resulting native ledger/stock/report evidence;
6. empty, invalid, permission, setup, failure, and recovery behavior;
7. automated test and any required human/physical evidence;
8. metric affected and support owner; and
9. known exclusions that remain outside the promoted scope.

An item stays **Implemented, acceptance incomplete** when any required evidence is
indirect, missing, stale after a candidate change, or proves only a narrower surface.

## 6. Immediate decision queue

These decisions require named human ownership but do not prevent preparatory work:

| Decision | Needed by | Default if unanswered |
|---|---|---|
| Confirm supported V1 customer segment and design partners | Before promoting Phase 2 | Saudi SME retail/distribution core; other industry packs remain V1.x |
| Name Saudi accountant/compliance reviewer | Before KSA production acceptance | Compliance work remains sandbox/configuration-ready only |
| Name target A4 and thermal hardware | Before MVP release receipt | Release remains HOLD |
| Name implementation/support owner and SLA | Before first live customer | No general-availability promotion |
| Select first licensed payment, banking/statement, and ecommerce partners | Before connector build | Framework only; no unsupported provider promise |
| Approve payroll customer/design partner and official exchange path | Before payroll promotion | Payroll remains controlled parallel-run scope |

## 7. Ledger maintenance

- Update this ledger when evidence changes, not when work merely starts.
- Link exact test output, document IDs, report totals, screenshots/PDFs, hardware
  records, or signed reviews; do not replace evidence with “done.”
- A candidate code/configuration change invalidates only the affected evidence, but
  the owner must explicitly identify that scope.
- The mega plan controls product direction. This ledger controls execution status.
- The MVP release receipt controls the current production decision until signed.
