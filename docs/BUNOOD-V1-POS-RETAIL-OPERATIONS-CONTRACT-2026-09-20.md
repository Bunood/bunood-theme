# Bunood V1 POS and retail operations contract

**Date:** 2026-09-20  
**Scope:** WO-23, OTC-02, OTC-04, FIN-03, KSA-02, KSA-04  
**Status:** target product and acceptance contract; not device, payment, ZATCA,
shift-reconciliation, or release evidence  
**Machine register:** `quality/v1-pos-retail-control-register.json`

## 1. Product outcome

A first-day cashier must be able to open the correct store session, find or scan an
item, understand the product and price, take the permitted payment, give correct
change, issue a readable Saudi receipt, recover from failure, and serve the next
customer without seeing an accounting form.

A supervisor must be able to approve only the exceptions they own, manage return/
refund and handover, count by tender, explain a difference, close the shift, and
know whether posting and ZATCA work are actually complete.

Finance must trace the same sale through invoice, stock, VAT/ZATCA, tender, payment
or clearing, closing/posting, deposit/settlement and GL without rebuilding the day
in a spreadsheet.

These are three views of one native ERPNext chain. Bunood never creates an
independent cart, sale, tender, stock, or shift ledger that can disagree with it.

## 2. Native and Saudi authority

The current official ERPNext documentation establishes:

- [POS setup](https://docs.frappe.io/erpnext/point-of-sale/setup) requires a POS
  Profile, priced items, customers, and a warehouse.
- [POS Profile](https://docs.frappe.io/erpnext/pos-profile) controls company,
  warehouse, users, payment methods/default, currency, price list, taxes, change,
  write-off, permissions, receipt format, and several cashier behaviors.
- [POS workflows](https://docs.frappe.io/erpnext/pos-workflows) uses an Opening
  Entry before sales and a Closing Entry after the session.
- [POS Invoice consolidation](https://docs.frappe.io/erpnext/point-of-sale/pos-invoice-consolidation)
  documents an intermediate POS Invoice and closing/consolidation posting model for
  its described ERPNext versions. Bunood must verify the exact pinned version and
  configuration rather than assuming that save, close, and ledger-posted are the
  same moment.
- [Mode of Payment](https://docs.frappe.io/erpnext/mode_of_payment) maps a cashier-
  meaningful method to a company-specific account; its label alone does not
  determine the ledger.
- [Sales Return](https://docs.frappe.io/erpnext/sales-return) distinguishes return
  stock, customer credit, paid/part-paid treatment, and original linkage. The same
  stock must not be returned through two documents.

The Saudi ZATCA/VAT lifecycle is controlled by
`BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`. Cash, provider settlement,
bank deposit and reconciliation are controlled by
`BUNOOD-V1-CASH-BANK-PAYMENT-RECONCILIATION-CONTRACT-2026-09-20.md`.

SAMA reported that electronic payments represented 79% of retail payments in 2024,
so card/wallet settlement and mixed tender are first-class operations, not one
generic green “network” button:
[SAMA announcement](https://www.sama.gov.sa/en-us/mediacenter/news/pages/news-1083.aspx).

References to mada, cards, wallets, bank transfer or a gateway describe tender and
settlement classes. No provider is marketed as supported without accepted provider-
specific authorization, security, idempotency, settlement and support evidence.

## 3. Permanent state integrity

1. One cashier works in one authorized company/POS Profile/warehouse/session at a
   time. Switching is explicit and governed.
2. Item name, selling price, quantity/UOM, and line/receipt total are primary.
   Item code/barcode remains visible/searchable secondary identity.
3. Cart, held draft, submitted native sale, payment attempt, payment evidence,
   receipt, ZATCA state, provider settlement, shift close and reconciliation are
   different states.
4. A terminal message, browser return, printer result, or provider response cannot
   by itself prove native payment, provider settlement, or bank receipt.
5. Unknown timeout, repeated click, reconnect, duplicate callback or replay cannot
   create a second sale, tender, stock movement, tax document or refund.
6. Every tender posts to an approved company account or clearing path. “Cash,”
   “card,” or “network” labels never substitute for mapping validation.
7. Rate edit, discount, void, write-off, return, refund and cash variance obey
   server permission, threshold and approval. Hiding a button is not authorization.
8. Change due, cash counted, cash handed over, deposit in transit, and bank credit
   remain distinct.
9. Bunood does not claim offline sales unless durable local identity, ordering,
   queue, encryption, conflict, replay, idempotency, stock/customer/price freshness,
   reconnect and end-to-end reconciliation all pass on accepted devices.
10. Returns/credit notes preserve and link the original sale, payment, stock, tax,
    XML/QR/ZATCA and refund evidence.
11. “Shift closed” does not mean Stock/Payment/GL posted until the pinned native
    posting/consolidation path completes and reconciles.
12. Screen, receipt, PDF, XML and QR values come from the same native sale and agree.
13. Every closing difference has tender, category, amount, evidence, owner,
    approval, due date and resolution.
14. Support access cannot bypass company/store/profile/warehouse/customer scope or
    silently take a cashier action.

## 4. Roles

| Role | Primary outcome | Restricted boundary |
|---|---|---|
| Cashier | Open permitted session, sell, take permitted tenders, print, count own shift | no account/tax/profile setup or own high-risk approval |
| Shift supervisor | Approve bounded exceptions, handover, variance, return/refund and close | cannot rewrite submitted sales or hide differences |
| Store manager | Readiness, staffing, store exceptions, local operational review | cannot override finance/security policy merely by role title |
| Returns operator | Find original, inspect return, create permitted correction/refund | no unlinked negative sale or duplicate stock return |
| Inventory operator | Replenish, investigate stock, receive returned goods | no tender/account/tax manipulation |
| Finance reconciler | Tender/clearing/deposit/settlement/closing/GL trace | does not operate the cashier cart as reconciliation shortcut |
| POS administrator | Govern profile, user/device, price, print and method setup | no payment-provider secret access unless separately authorized |
| Support operator | Diagnose versioned device/app events with redacted evidence | no unrestricted customer/financial data or silent impersonation |

## 5. Readiness before the first sale

Opening POS runs a visible preflight, not a blank page followed by errors:

- legal company, branch/store and active POS Profile;
- cashier assignment/effective permission;
- warehouse and stock policy;
- approved walk-in/default customer or customer requirement;
- price list, currency and current prices;
- VAT/tax template/category and rounding;
- payment methods, default, allowed returns, company accounts/clearing;
- change and write-off account/limit;
- opening entry/session and expected opening float;
- receipt format/language, printer and real QR capability;
- ZATCA environment/readiness and delayed-operation policy;
- accepted browser/device/scanner/network and clock;
- sync/queue/worker health where applicable.

The result is one of the twelve machine states. `Ready` means all required checks
for this exact company/profile/device pass. `Degraded online` states the bounded
capability and risk; it is never renamed “offline.” A blocking item gives the owner,
reason and direct setup/remediation link rather than sending a cashier into ERP
settings.

Opening float is counted/confirmed by method and user under policy. Previous open or
unreconciled sessions cannot be silently ignored.

## 6. Cashier sale experience

### 6.1 Layout

On desktop/tablet the screen has four stable zones:

1. **Search/catalog:** one prominent name, code or barcode search; useful category
   filters; neutral item tiles/list.
2. **Cart:** item name first, code secondary, quantity/UOM, unit price, discount,
   tax indicator and line total.
3. **Customer/context:** walk-in/customer identity, loyalty/credit only when
   permitted, profile/store and visible connectivity state.
4. **Checkout:** subtotal, discount, VAT, rounding, total, tender, received/change,
   primary Pay action and exact result.

At narrow widths, these become intentional steps or tabs with a persistent cart
count and total. The product grid never squeezes names beneath oversized placeholder
images. Images use natural/brand media or neutral initials—not bright green blocks.
All text remains fully visible or expands deliberately; critical name/price/total/
stock/tender text is never ellipsized into ambiguity.

### 6.2 Find and add

- Search matches item name, code and barcode, with the label saying so.
- Results lead with full localized/source item name; code is muted metadata.
- A unique barcode can add immediately under configured behavior; ambiguous barcode
  asks rather than picking the first result.
- Scan feedback is immediate, visible, audible where configured, and accessible.
- Repeated scan increments only when allowed and shows the new quantity.
- Item group, price, UOM, stock availability and restriction use real data states,
  not color-only tiles.
- Out-of-stock/expired/restricted items state why and who can resolve them.
- One accidental double click or scan cannot duplicate beyond intended quantity.

### 6.3 Cart and customer

Quantity changes validate UOM, stock and permission. Rate/discount edit controls
show their policy and remaining authorized limit; a supervisor approval records
requester, approver, before/after, reason and time. Removing an unsaved line is not
called refund or return.

Customer selection searches names first and protects restricted data. A walk-in
customer is allowed only by profile policy. Credit sale, loyalty, address, tax
identity or B2B classification appear only when relevant and require the correct
workflow; a cashier cannot turn a consumer sale into a different legal/tax class by
editing a label.

Holding a cart saves one native supported draft/state with owner and time. Resume
shows price/stock/customer changes and requires a clear decision. New Sale obeys
the configured ask/save/discard rule and never destroys work without the stated
outcome.

## 7. Checkout and tender

The checkout panel is large, stable and numeric:

```
Subtotal
- discount
+ VAT/tax
+/- rounding
= amount due

Tender rows
= amount received/authorized
= remaining or change due
```

Each method is a normal button, not a decorative pill. Selected method is dark
green; unselected methods are neutral white. The tender name and recognizable icon
are visible, with account mapping verified behind the scenes.

Supported accepted scenarios include cash, one non-cash method, mixed tender, exact
cash, excess cash/change, partial payment where profile/native behavior allows, and
failed/ambiguous provider payment. Method restrictions on returns are respected.

Rules:

- Pay disables only the duplicate-producing action while preserving visible state;
- validation error re-enables controls and focuses the exact issue;
- client/network timeout shows `Checking result` and queries/reconciles before retry;
- provider callback/terminal result is idempotent and authenticated;
- a browser return is guidance, not payment proof;
- if native submit succeeds but print/ZATCA is delayed, the sale remains submitted
  and receives separate recoverable output/compliance states;
- change due is computed from accepted cash only and cannot be hidden by mixed
  tender rounding;
- payment/reference/device identifiers are retained without exposing secrets.

## 8. Native sale, stock, receipt and ZATCA

After checkout Bunood shows explicit milestones:

1. **Sale submitted:** native document and immutable ID.
2. **Payment recorded:** tender lines and account/clearing outcome.
3. **Stock state:** reserved/pending closing or posted, based on the verified pinned
   POS model—not guessed.
4. **Receipt:** issued/print pending/failed with safe reprint.
5. **ZATCA:** generated/signed/queued/reported/cleared/warning/rejected/delayed as
   applicable under the separate contract.
6. **Settlement/reconciliation:** later finance state, not a cashier blocker unless
   configuration makes it so.

The receipt/PDF/thermal output prioritizes company identity, invoice number/time,
customer where required, item **name**, quantity/UOM, unit price, discount, VAT,
total, tender, change, legal fields and authentic QR. Item code may appear as
secondary identity; it never replaces a configured item name.

Print/reprint does not recreate the invoice, payment, QR, XML, UUID or ZATCA event.
Every reprint is the same authoritative document with an audit trail where policy
requires it. Paper is tested at 100% scale on the actual printer and the QR is
scanned from paper on a real device.

## 9. Returns, refunds and exchanges

Start from the original invoice/receipt or verified lookup. Show returnable quantity,
prior returns, payment methods, stock-controlled items, serial/batch/expiry, tax and
ZATCA status. The operator chooses:

- goods physically returned with customer credit;
- price/value credit without stock return;
- original paid/part-paid/unpaid treatment;
- refund to allowed original/approved method or credit on account;
- exchange as a linked return plus new sale where supported and accepted.

The preview states stock, receivable/payment, refund, tax, ZATCA/corrective document,
and shift tender effect. Refund approval thresholds are server-enforced. The same
goods cannot enter stock through both return Delivery Note and credit note. The
original remains immutable and every corrective output references it.

## 10. Shift, handover and close

### 10.1 Cashier count

The close task shows expected totals by method only after or during count according
to blind-count policy. The cashier enters counted cash denominations/total and any
other physical method evidence. `Not counted`, zero, unavailable evidence and system
expected zero are distinct.

For every method:

`opening + sales - refunds +/- permitted paid-outs/adjustments = expected`

Then compare counted/terminal/provider evidence and show difference. Each difference
has category, explanation, attachment/evidence, cashier, supervisor, materiality,
approval and follow-up owner. Offsetting tender differences remain itemized.

### 10.2 Handover and deposits

Cash handover records from/to custodian, amount, reference, time and evidence. It is
not a bank deposit. Deposit in transit and final bank credit follow the cash/bank
contract. Card/wallet totals hand off to provider settlement, fees, refunds,
chargebacks, clearing and bank reconciliation.

### 10.3 Native closing/posting

Submitting a POS Closing Entry (or exact supported pinned-version equivalent) moves
the shift into `closing submitted`. If the native model performs asynchronous or
consolidated stock/accounting posting, Bunood shows `posting pending` until the
authentic native result exists. Failed/partial posting is an owned exception with
safe retry/recovery; a green closed header cannot conceal it.

The final state sequence is:

`closing submitted → native posting/consolidation completed → finance reconciliation
required → reconciled`

Reopening/correcting a shift uses a governed native path and returns affected
reconciliations to review.

## 11. Degraded and offline operation

Online degradation has explicit boundaries: search cache freshness, payment
availability, ZATCA queue state, printer state and whether new sale submission is
safe. The UI never blanks the screen or silently queues an action.

If offline sales are ever promoted, the acceptance design must prove:

- encrypted durable device storage and user/device authorization;
- collision-safe local sale/payment/tax identity and monotonic ordering where
  required;
- explicit price/tax/customer/stock snapshot age and risk limits;
- which tenders work offline and how authorization evidence is secured;
- immutable queue with per-event states, retry count and operator visibility;
- exactly-once server effect despite repeated reconnect/replay;
- conflict rules for stock, price, customer, session, return and duplicate sale;
- correct ZATCA offline/delayed rules for the exact document type;
- remote revoke/device loss response and sensitive-data wipe policy;
- complete sale/payment/stock/tax/ZATCA/closing/GL reconciliation after reconnect;
- load, battery/network interruption and data-loss recovery tests.

Until all of that passes, Bunood says `online POS with defined degraded states`, not
“offline POS.”

## 12. Visual, bilingual and accessibility contract

- One calm, neutral workspace; green is reserved for current selection, primary
  action, brand and verified success—not every tile, number or heading.
- Header, catalogue, cart and checkout align to one grid with intentional whitespace.
- No decorative pill overload; state badges are compact and meaningful.
- Item cards have enough height for full names, price/UOM and real stock state.
- Totals and Pay are large, high contrast and stable; secondary controls do not
  compete.
- Arabic/RTL and English/LTR are complete, not mixed static labels. Arabic glyphs
  have safe line-height and are never clipped at top/bottom or side navigation.
- Mixed item names, codes, currency, decimals, invoice numbers and timestamps use
  direction isolation and remain copyable/readable.
- Touch targets meet accepted size/spacing; scanner/keyboard focus never jumps to a
  hidden field; screen readers announce item added, cart total, errors, tender and
  result without flooding.
- Focus remains trapped only in real modals; closing preview/receipt rail has a clear
  title, close action, return focus and no full-screen white flash.
- Bottom/mobile navigation has balanced destinations and never covers checkout or
  close actions.
- Loading uses local skeleton/progress; the application shell and cart do not blank.

## 13. Performance contract

The route uses the central V1 performance SLO and adds retail task budgets measured
on accepted devices and production-like data:

- usable POS opening/readiness;
- item name/barcode search p50/p95/p99 and scan-to-cart feedback;
- cart recalculation and quantity edit;
- checkout-to-native-result excluding separately stated provider/ZATCA latency;
- receipt render/print initiation;
- hold/resume and last-sale lookup;
- return original lookup;
- closing load/count/submit/posting queue;
- sustained transactions per store and concurrent open sessions;
- memory growth, duplicate rate, queue age and worker recovery.

Fast-looking client feedback cannot mask a slow or failed server effect. Every test
records server, browser, network, device, printer, data volume, cache state,
concurrency and external-provider simulation/authentic boundary.

## 14. Reconciliation contract

For each shift and accepted cutoff:

1. cart/invoice rows reproduce item, quantity/UOM, price, discount, tax and total;
2. native sale reproduces receivable/income/tax and, under the pinned model,
   stock/COGS effects;
3. tender rows reproduce payment modes, amounts, company accounts/clearing and
   Payment Ledger;
4. opening cash, cash sales/refunds/paid-outs, count, variance, handover, deposit
   and bank credit form one trace;
5. card/wallet capture, refund/chargeback, fee, settlement, clearing, bank and GL
   form one trace;
6. receipt/PDF/XML/QR/ZATCA response reproduce the same invoice values;
7. return/credit note/refund reverses only intended original stock, tax, payment,
   receivable and GL;
8. shift source invoices/tenders/returns/voids reconcile to Closing Entry and any
   consolidated/native posting documents;
9. Stock Ledger, Payment Ledger, VAT/ZATCA operational reports and General Ledger
   agree at the same company/profile/session/time boundary;
10. every closing/settlement difference remains itemized, aged, owned and resolved.

## 15. Acceptance evidence

Structural tests prove only that this target cannot silently shrink. POS promotion
requires two candidate-bound open-to-close cycles—one normal, one exception-heavy—
and all twelve machine evidence groups:

1. approved profile/configuration;
2. readiness/open/degraded/blocked/handover/close;
3. name/code/barcode/UOM/price/stock/customer/cart/hold/resume;
4. rate/discount/void/write-off/supervisor controls;
5. cash/non-cash/mixed/partial/failure/timeout/duplicate/replay tenders;
6. native sale/stock/tax/payment/receipt/PDF/XML/QR/ZATCA reconciliation;
7. return/credit/refund/exchange matrix;
8. opening/tender/refund/variance/handover/deposit/settlement/closing/GL chain;
9. offline/degraded durability/conflict/replay/reconnect exercise for any promoted
   claim;
10. role/company/store/profile/warehouse/customer negative tests;
11. Arabic/English, accepted devices/widths, touch/keyboard/scanner/screen reader,
    actual printer and real paper QR scan;
12. candidate/version, load/soak/latency/error, observability, incident, recovery,
    retention, support and approvals.

Real cashiers, a supervisor and finance reconciler complete their top tasks without
developer rescue. Receipts include exact commit/assets, ERPNext/app/connector
versions, company/profile/warehouse/methods, fixture/hash, device/browser/scanner/
printer/network, scenarios, native IDs, timing, reconciliation queries/totals,
failures/recovery, open issues, named reviewers and decision.

## 16. Implementation order

1. Pin and verify native POS posting/consolidation behavior and accounting fixtures.
2. Build preflight/readiness and strict cashier/profile/warehouse authorization.
3. Complete name-first catalog/cart, responsive layout and scanner controls.
4. Complete checkout/tender state machine and duplicate/ambiguous recovery.
5. Complete receipt/PDF/XML/QR/ZATCA state and physical printer path.
6. Complete original-linked return/refund/exchange.
7. Complete count/handover/close/posting exception workflow.
8. Connect deposit/provider settlement and finance reconciliation.
9. Run device/performance/security/degraded-operation and real-user acceptance.
10. Promote only the exact accepted device/profile/method/provider scope.

## 17. Owner decisions and disclaimer

Named owners approve profile/user/warehouse/price/tax/customer/dimension policy;
tender and clearing accounts; discounts/voids/returns/refunds/write-offs; opening/
count/variance/handover/close; ZATCA and correction setup; device/browser/scanner/
printer/drawer/network matrix; provider commercial/security/settlement terms;
cutover, monitoring, recovery, retention and support.

This contract is product/control guidance, not ZATCA, tax, accounting or payment-
provider advice. Final POS configuration, receipt/legal content, tax treatment,
provider route, shift reconciliation, hardware acceptance and production decision
require qualified accounting, Saudi tax/compliance, payments, security, operations,
legal and support review as applicable.
