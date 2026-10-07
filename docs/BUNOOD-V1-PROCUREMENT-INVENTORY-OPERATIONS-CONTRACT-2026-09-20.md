# Bunood V1 procurement and inventory operations contract

**Date:** 2026-09-20  
**Scope:** WO-20, WO-21, WO-22, OTC-02, FIN-04, KSA-02, KSA-05  
**Status:** target product and acceptance contract; not implemented or accepted evidence  
**Machine register:** `quality/v1-procurement-inventory-control-register.json`

## 1. Product outcome

Bunood must let each role answer its own question without navigating the entire ERP:

- **Requester:** What do we need, by when, and was it approved?
- **Buyer:** What should I source or order, from whom, at what approved terms?
- **Receiver:** What arrived, what was accepted or rejected, and where did it go?
- **Warehouse operator:** What is physically here, reserved, moving, expiring, or
  different from the count?
- **Payables operator:** Does the supplier bill match the order and receipt, what is
  due, and what is blocked?
- **Accountant/reviewer:** Do quantity, value, tax, payable, payment, Stock Ledger,
  Payment Ledger, and General Ledger reconcile?

Simple mode presents the next physical or commercial task in plain language.
Advanced mode exposes policy, valuation, accounts, dimensions, tax, references,
serial/batch detail, and source-to-ledger trace. Both modes edit the same ERPNext
records; neither creates a parallel purchase, stock, valuation, or payable ledger.

## 2. Native ERPNext authority

The current official ERPNext documentation establishes the source model:

- [Material Request](https://docs.frappe.io/erpnext/material-request) records a
  requirement for purchase, transfer, issue, manufacture, subcontracting, or
  customer-provided material. It may originate from demand or reorder logic.
- [Purchase Order](https://docs.frappe.io/erpnext/purchase-order) records the
  supplier commitment and can be created from a Material Request or Supplier
  Quotation. It does not itself receive stock or create a payable.
- [Purchase Receipt](https://docs.frappe.io/erpnext/purchase-receipt) records items
  physically accepted or rejected, usually against a Purchase Order, and supports
  partial receipt and short close.
- [Purchase Invoice](https://docs.frappe.io/erpnext/purchase-invoice) records the
  supplier bill, payable, expense/asset value, and tax. It can reference an order
  or receipt; using the receipt is the normal separated-responsibility route when
  goods and billing arrive at different times.
- [Purchase cycle ledger impact](https://docs.frappe.io/erpnext/purchase-cycle-ledger-impact)
  distinguishes commitment, receipt, bill, and payment. For stock purchases under
  perpetual inventory, receipt normally creates Stock In Hand versus Stock Received
  But Not Billed; the linked invoice clears that temporary balance into payable.
- [Stock Entry](https://docs.frappe.io/erpnext/stock-entry) is the native movement
  record for issue, receipt, transfer, transit, manufacturing and related purposes.
- [Stock Reconciliation](https://docs.frappe.io/erpnext/stock-reconciliation)
  records opening stock or an approved physical quantity/value adjustment. A count
  preview is not a stock change until native submission.
- [Serial and Batch Bundle](https://docs.frappe.io/erpnext/serial-and-batch-bundle)
  is the v15 native integrity model for serial/batch movements; a bundle is not
  reused across separate stock transactions.
- [Inventory Dimension](https://docs.frappe.io/erpnext/inventory_dimension) can add
  native warehouse-adjacent tracking dimensions, subject to its documented
  valuation and Stock Reconciliation limitations.
- [Landed Cost Voucher](https://docs.frappe.io/erpnext/landed-cost-voucher) adds
  eligible additional costs to item valuation through a supported native document.
- [Perpetual Inventory](https://docs.frappe.io/erpnext/perpetual-inventory) connects
  stock movements to inventory accounting. Bunood never “fixes” a Stock Ledger/GL
  difference by editing generated entries.

The implementation must pin the actual supported ERPNext version and behavior.
Documentation for another version does not silently expand V1 scope.

## 3. Permanent outcome boundaries

1. A Purchase Order is a commitment, not physical stock, an expense, tax, payable,
   or payment.
2. A Purchase Receipt is physical receipt, not the supplier bill or proof of
   payment.
3. A Purchase Invoice is the supplier bill and payable, not proof that goods
   physically arrived.
4. A Payment Entry settles payable; it does not purchase or receive the goods again.
5. Stock item, service, fixed-asset, and direct-expense purchase routes remain
   visibly different because their evidence and ledger effects differ.
6. Requested, ordered, received, accepted, rejected, returned, billed, paid, and
   short-closed quantities are never collapsed into one `completed` number.
7. Actual, projected, reserved, and available-to-promise quantities use explicit
   definitions. The UI does not interchange them.
8. Entering a count does not change stock. A reviewed native Stock Reconciliation
   or other supported adjustment does.
9. Serial, batch, expiry, UOM, barcode, negative-stock, and inventory-dimension
   controls follow native rules and the item's approved master configuration.
10. Landed cost changes valuation only through a supported source and allocation;
    it is not a free-form stock value edit.
11. Supplier invoice reference and receipt identity are duplicate-controlled by
    legal company and supplier. A retry or repeated scan cannot create another
    liability or stock movement.
12. Submitted source documents remain immutable. Returns, credit/debit notes, rate
    corrections, cancel/amend and reversal link to and preserve the original.
13. Input-tax recoverability, non-recoverable tax, customs and valuation treatment
    require the configured rule and supporting document; Bunood does not infer
    recoverability from a percentage alone.
14. Backdated stock or accounting changes show their recalculation scope and
    affected later records before the governed action, then re-run reconciliation.
15. No UI summary can override native quantity, value, tax, payable, Payment Ledger,
    Stock Ledger, or General Ledger truth.

## 4. Roles and segregation

| Role | Primary work | Must not silently do |
|---|---|---|
| Requester | Describe need, date, purpose, quantity and destination | choose hidden accounting, approve own controlled request |
| Buyer | Source, compare, prepare order and follow delivery | receive stock or approve own order when segregation applies |
| Purchasing approver | Review need, supplier, commercial terms and policy | alter the proposal without a visible revision |
| Receiving operator | Verify supplier delivery, quantity, warehouse and evidence | accept failed quality or alter supplier bill/accounting |
| Warehouse operator | Move, scan, put away, pick, count and investigate stock | change valuation/accounting policy or approve own material adjustment |
| Quality inspector | Record configured checks and accept/reject evidence | rewrite ordered or billed quantity invisibly |
| Payables operator | Capture supplier bill, references, tax, match and due schedule | certify physical receipt not evidenced by the receiver |
| Inventory accountant | Reconcile valuation, Stock Received But Not Billed and stock/GL | fabricate physical counts or edit generated ledger rows |
| Finance reviewer | Review exceptions, material adjustments, tax/payable and close | mark unresolved differences as reconciled |

Small teams may combine assigned roles only under documented compensating controls.
The event history still states which capacity acted, why, and who independently
reviewed material exceptions.

## 5. One purchase lifecycle without false completion

The header timeline is understandable at a glance:

`Need → Request → Approval → Source/quote → Order → Receive/inspect → Bill → Pay`

Returns/corrections and short close branch from the relevant source rather than
pretending the original disappeared. Each stage shows a quantitative mini-summary:

| Stage | Minimum values |
|---|---|
| Request | requested, approved, remaining-to-order, required date |
| Order | ordered, value, remaining-to-receive, remaining-to-bill |
| Receipt | delivered, accepted, rejected, returned, warehouse/quality state |
| Bill | billed, tax, payable, due, match difference, credit/debit notes |
| Payment | paid, allocated, outstanding, method, settlement/reconciliation |

The word **completed** is qualified: order receipt complete, order billing complete,
invoice paid, stock count submitted, or full chain reconciled. A generic green
“completed” pill is prohibited.

## 6. Task-designed purchase flows

### 6.1 Request and replenish

The requester sees item/service name first, purpose, quantity/UOM, needed-by date,
destination warehouse or cost object, current relevant availability, and reason.
Accounting fields are not dumped into this form. The system may propose needs from
native reorder and demand data, but shows the source and allows governed review.

Duplicate/overlapping demand is visible before submission. Approval shows the
commercial impact and policy reason. Rejection or revision returns a specific reason
without destroying the request history.

### 6.2 Source and order

The buyer workspace groups approved requirements by supplier/category/location and
shows candidate supplier quotations when used. Supplier selection records the
actual basis—price, lead time, quality, contract, availability, or authorized
exception—rather than an unexplained click.

The Purchase Order Simple form prioritizes:

- supplier name and verified commercial/tax identity;
- delivery address/warehouse and required dates;
- item/service name, quantity/UOM, rate, discount and amount;
- tax/charges summary, currency and payment terms;
- linked request/quotation and remaining quantities;
- approval status, primary action, total and expected next step.

Advanced mode exposes pricing rules, dimensions, accounts, incoterm/shipping,
supplier details, per-row warehouse/date and supported specialist fields. Submitting
states clearly: “Order committed; no stock or payable has been created.”

### 6.3 Receive and inspect

The receiving task starts from the open Purchase Order or verified delivery
reference. It is optimized for barcode/touch/keyboard entry and shows item name,
photo where useful, ordered, previously received, remaining, this delivery,
accepted, rejected, UOM, target/rejected warehouse, batch/serial/expiry needs, and
quality state.

Rules:

- partial delivery is ordinary;
- over-receipt follows configured tolerance/approval, never a hidden quantity edit;
- rejected items go to the configured rejected/quarantine path and remain visible;
- required Quality Inspection blocks acceptance until authentic inspection exists;
- serials/batches are unique, complete and valid for the exact movement;
- an untouched ready row never blocks save or enters stock/output;
- submission previews quantity and warehouse impact;
- error restores usable controls, focus, scanned rows and clear remediation;
- successful receipt opens the receipt result, pending inspection/putaway, and
  `received not billed` impact without calling it paid or invoiced.

### 6.4 Enter and match the supplier bill

The bill capture form prioritizes supplier, legal company, **supplier invoice
number and invoice date**, posting/due date, currency, items/services, amounts,
taxes, total, attachment/reference, and source order/receipt. Duplicate search runs
before submission across normalized supplier reference, supplier, company, date,
amount and attachment/source evidence; ambiguous cases require review.

The match view compares at row and total level:

- order quantity/rate/terms;
- received and accepted quantity;
- previously billed and remaining quantity;
- current billed quantity/rate/discount/tax;
- configured quantity, rate and amount tolerances;
- exception cause, owner and approval.

This is a three-way match when an order and receipt exist; a valid two-way or direct
bill path is explicitly configured for services or approved direct purchases. The
UI never fabricates a receipt simply to make the match green.

For stock receipts, the user can trace Stock Received But Not Billed from receipt
through linked invoice. For services/non-stock items, expense recognition follows
the supported source configuration. “Update Stock” on Purchase Invoice is presented
only in the approved direct-receipt workflow, with a warning that it combines
physical and financial responsibility and removes a separate receipt checkpoint.

### 6.5 Pay

Approved payable documents hand off to the cash/bank/payment contract. Payment
selection shows due, overdue, disputed, held, credited and partially paid amounts.
It uses native Payment Entry and Payment Reconciliation; payment never repairs a
quantity, receipt, tax, or valuation mismatch. The full chain links to bank or cash
evidence and outstanding payable.

## 7. Inventory operations

### 7.1 Stock truth card

For a selected item, warehouse, batch/serial/dimension and `as of` time, Bunood
shows independently labeled:

- **Actual:** native quantity physically/book-recorded at the boundary.
- **Reserved:** committed under the supported native reservation model.
- **Projected:** native planning quantity with its formula/source link.
- **Available:** documented operational formula; never guessed from a label.
- **In transit:** issued from source but not completed at destination where the
  native transit flow is used.
- **Expiring/expired/rejected/quarantined:** excluded or warned according to the
  approved policy and native capability.

Every value drills to the same-filter native report or source rows. Cached/stale,
permission-filtered, setup-incomplete, empty, and error states are explicit.

### 7.2 Move stock

The operator chooses an outcome first: transfer, receive, issue, send to transit,
complete transit, or another permitted Stock Entry Type. The form then asks only
for fields relevant to that purpose. Source/destination warehouse permissions are
enforced by the server and cannot be expanded by the client.

The row shows name first, code/barcode second, source, destination, on-hand at
source, quantity/UOM, serial/batch/expiry/dimension requirements, and warnings.
Submitting previews the direction of movement and resulting negative-stock or
controlled-item errors. Completed transit requires the original transit source;
lost/incomplete transit becomes an exception queue, not an invisible balance.

### 7.3 Scan, put away and pick

Scanning is an input method, not a bypass:

- one scan resolves one permitted item/UOM/barcode result or asks for disambiguation;
- repeated scan increments only when policy allows and remains visible;
- wrong warehouse, expired/recalled batch, duplicate serial, excessive quantity and
  permission error stop the row with sound/visual/text feedback;
- offline or lost connection never silently submits; pending scans remain visibly
  local and reconcile before retry;
- name, quantity, unit, source/destination and batch/serial stay readable at narrow
  warehouse-device widths;
- undo last scan and review all rows exist before submit.

Where native putaway, pick, reservation or delivery documents are promoted, Bunood
preserves their authority and exact source links rather than simulating them in a
generic Stock Entry.

### 7.4 Serial, batch, expiry and dimensions

Item setup determines whether serial/batch is mandatory and whether batches are
auto-created. V1 records a separate native bundle per movement and prohibits
negative stock for controlled items where native v15 rules prohibit it. Expiry is
shown before selection and in exception queues; selection policy such as earliest
expiry follows the configured/native behavior and remains reviewable.

Multiple UOM stores the transaction UOM, stock UOM, conversion factor, and resulting
stock quantity. Conversion changes are master-data controls, not per-operator
guesswork. Inventory dimensions are promoted only after their transaction/report
coverage and Stock Reconciliation limitations are accepted.

### 7.5 Physical count

The count workflow separates observation from adjustment:

1. Define company, warehouse/location scope, cutoff, items, counters and blind/non-
   blind policy.
2. Freeze or control movements under the approved operational policy; record late
   movements rather than hiding them.
3. Capture first count with device/source, counter and time.
4. Identify missing, duplicate, invalid, serial/batch and material differences.
5. Require independent recount by threshold/risk.
6. Explain differences and review quantity **and valuation** impact.
7. Submit an approved native Stock Reconciliation or supported correction.
8. Reconcile Stock Ledger, valuation and inventory GL after recalculation.

Empty rows do not count as zero. `Not counted`, `counted zero`, and `not in scope`
are different. The count sheet/export protects book quantity when blind counting is
required and records who could access it.

### 7.6 Replenishment exceptions

The warehouse/buyer home shows actionable exceptions rather than decorative stock
KPIs: below reorder, projected shortage, overdue order, partial receipt, rejected
quality, expiring batch, negative-stock attempt, stuck transit, unbilled receipt,
count difference, and valuation/GL difference. Every row names owner, age, next
action and exact source.

## 8. Valuation and accounting controls

The configured ERPNext valuation model and perpetual-inventory setting are
versioned company policy. Bunood explains but does not recalculate an alternative
valuation ledger.

### 8.1 Stock purchase chain

For each applicable company/warehouse/account/currency/cutoff:

`Purchase Receipt → Stock Ledger quantity/value → inventory GL debit → Stock
Received But Not Billed credit → linked Purchase Invoice → temporary balance
cleared → Accounts Payable → Payment Ledger/Payment Entry → bank/cash`

Quantity, source references and monetary values must reconcile at every link.
Remaining Stock Received But Not Billed is presented as a queue of unbilled/mismatched
receipts, returns, rate/quantity differences or backdated corrections—not a single
unexplained balance.

### 8.2 Service, expense and asset purchases

These do not masquerade as warehouse stock. Service/expense evidence, accounting
dimension and recognition route are explicit. Fixed-asset purchases hand off to the
accepted asset lifecycle; a line is not called capitalized merely because an asset
flag was selected.

### 8.3 Landed cost

The source freight, customs or other eligible charge must be a valid document with
approved account/tax treatment. Allocation basis and every affected receipt/item are
previewed. After submission, source charge, Landed Cost Voucher, changed item
valuation, Stock Ledger and GL reconcile. Cancellation/amendment follows native
rules and revalidates later valuation effects.

### 8.4 Tax

Input VAT and non-recoverable tax follow the approved Saudi configuration and
evidence. The product distinguishes tax in invoice total, recoverable tax asset,
non-recoverable cost/expense, import/customs charge, and valuation charge. It never
labels a supplier document ZATCA-cleared merely because it was entered in Bunood.
Tax report, source invoice/credit/debit note and GL must reconcile under qualified
Saudi tax/accounting review.

## 9. Returns and corrections

The user starts from an eligible original and chooses the real outcome:

- return accepted stock to supplier;
- record rejected delivery under the supported route;
- receive supplier credit;
- record debit/rate/quantity correction where supported;
- return a service/non-stock line without stock movement;
- refund or leave supplier credit on account;
- correct after full or partial payment.

The preview shows stock, batch/serial, tax, Stock Received But Not Billed, payable,
payment/refund and GL effects. Full/partial, paid/unpaid, stock/non-stock and landed-
cost cases retain original references. A submitted original is never deleted or
edited to conceal the correction. Arabic/English corrective outputs use governed
terms and show the required original reference.

## 10. Visual and interaction contract

### 10.1 Shared form anatomy

Every promoted purchasing/stock form uses the universal five-zone grammar:

1. **Identity and state:** clear document name, supplier/warehouse, human status,
   primary owner, original/source reference.
2. **Business context:** company, dates, currency, locations, purpose and approval.
3. **Primary work:** name-first items/services, quantity/UOM, relevant source and
   exception columns.
4. **Totals and validation:** quantity progress, amount/tax/value, warnings and
   accounting/stock preview appropriate to the role.
5. **Actions and history:** one primary outcome, secondary actions, next step,
   source links and audit.

Selected/current/primary and verified success may use dark Bunood green. Ordinary
content, fields, tables and cards remain neutral. Status meaning uses text/icons,
not decorative pills or green flooding. Sections align to one centered content
grid with consistent whitespace; no clipped Arabic glyphs, headings, sidebars,
totals, or mixed-direction identifiers.

### 10.2 Rows and dense data

- item/service **name is prominent**; code/barcode/manufacturer identifiers are
  secondary but searchable and printable where required;
- completing a row may create one trailing ready row; untouched ready rows never
  validate, save, post, print, export or affect totals;
- quantity/UOM and source/target meaning stay visible while horizontally scrolling;
- row detail is progressively disclosed without hiding a mandatory exception;
- bulk actions state selection count and exact outcome;
- desktop supports compact expert tables; phone/warehouse devices use task cards or
  an intentional column subset, not unreadable squeezed grids;
- save/submit errors restore all controls and focus the first actionable issue.

### 10.3 Language, accessibility and devices

All static and dynamic workflow text is complete in Arabic/RTL and English/LTR.
Supplier/item names remain in their source language while surrounding UI follows
the selected language. Codes, decimals, currencies, dates, quantities, barcodes,
serials and mixed Arabic/Latin references use correct direction isolation.

Keyboard, touch, scanner and screen-reader paths must reach the same outcome.
Focus order follows the visual task; error summaries link to rows; color is not the
only state signal; touch targets and scan feedback work on the accepted devices.

## 11. Exception and recovery matrix

Acceptance covers at least:

- missing/duplicate supplier, item, barcode, supplier invoice number or source row;
- draft validation, server, permission, conflict, lost-response and retry behavior;
- request rejected/revised, order approval denied, partial and short close;
- early, late, partial, over-, under-, duplicate and wrong-warehouse receipt;
- quality pending/failed/manual override under permission;
- serial duplicate/missing, invalid batch, expiry, wrong UOM/conversion;
- negative-stock denial, stuck transit, offline scan and reconnect conflict;
- bill before receipt, receipt before bill, service/direct bill, duplicate bill;
- three-way quantity/rate/tax mismatch within/outside tolerance;
- missing tax document, disputed input tax, non-recoverable tax, rounding;
- Stock Received But Not Billed residual and receipt/bill cancellation;
- count not counted versus zero, recount, late movement and rejected adjustment;
- backdated transaction, immutable-ledger recalculation and downstream impact;
- landed-cost source/allocation/cancel error;
- full/partial paid/unpaid return, credit/debit note and refund;
- unauthorized company, warehouse, period, account, valuation, count or export;
- cross-tenant, cross-company and restricted-cost/price leakage.

After every recoverable failure, the screen retains verified input and source
context, does not create duplicate stock/payable/tax/payment effects, re-enables
actions, explains what happened, focuses remediation, and provides safe retry.

## 12. Reconciliation contract

For each controlled scenario and period, Bunood proves:

1. requested = ordered + approved remaining/cancelled under the defined scope;
2. ordered = accepted + rejected/returned + remaining + short-closed as applicable;
3. receipt quantity/value = Stock Ledger and warehouse/batch/serial/UOM dimensions;
4. receipt value = inventory GL plus Stock Received But Not Billed treatment;
5. supplier source bill = Purchase Invoice reference, rows, amount, tax and payable;
6. Purchase Invoice outstanding = allocations/credits/payments in Payment Ledger;
7. input/non-recoverable tax = source documents, tax report and tax/expense/asset GL;
8. landed charges = source bill, allocation, item valuation, Stock Ledger and GL;
9. Stock Balance/valuation = Stock Ledger = inventory GL at the same boundary;
10. physical count = book quantity + approved itemized difference = post-adjustment
    quantity/value and GL;
11. original + return/credit/debit/refund = net stock, tax, payable, payment and GL.

Every difference has source, amount/quantity/value, cause, age, owner, due date,
materiality, action, evidence, reviewer and resolution. A zero total does not permit
offsetting unexplained item/warehouse differences.

## 13. Acceptance evidence

Structural validation of this contract/register proves completeness of the target,
not procurement approval, physical stock existence, valuation accuracy, Saudi tax
treatment, accounting sign-off, or release readiness.

Promotion requires at least two candidate-bound end-to-end cycles: a normal cycle
and an exception-heavy cycle. Evidence covers all twelve machine-register groups:

1. qualified configuration review;
2. service, stock, asset, expense, direct and order-first purchase routes;
3. partial/over/under receipt, quality/rejection, short close and backorder;
4. duplicate reference, match, partial bill, tax, credit and payment;
5. transfer/transit/issue/receipt/putaway/pick/delivery and warehouse permissions;
6. batch/serial/expiry/UOM/barcode/dimension controls;
7. clean/dirty/blind/recount/frozen/late-movement counts and reversal;
8. receipt, Stock Ledger, Stock Received But Not Billed, valuation, tax, payable,
   payment and GL reconciliation;
9. corrective-document/refund reconciliation matrix;
10. negative role/company/warehouse/account/period/tenant tests;
11. Arabic/English, desktop/phone, keyboard/touch/scanner/screen-reader, print/export;
12. candidate/version, fixtures/sources/hashes, monitoring, recovery, retention,
    support and approvals.

Each receipt records exact commit/assets, ERPNext/app versions, company/warehouse/
currency/tax/valuation configuration, fixture hashes, roles, devices/scanners,
scenario inputs, native document IDs, Stock/Payment/GL queries and totals, failures,
open differences, remediation/rerun, preparer, approvers/reviewers and decision.

## 14. Implementation order

1. Approve supplier/item/warehouse/UOM/tax/account/role configuration and fixtures.
2. Build the request/order progress model and simple Purchase Order grammar.
3. Build mobile/scan-ready receipt, rejection and quality flow.
4. Build supplier bill duplicate control and order/receipt/invoice match view.
5. Integrate payable/payment handoff and Stock Received But Not Billed queue.
6. Build transfer/transit/issue/receipt and stock truth workbench.
7. Build serial/batch/expiry/UOM/device controls for the accepted customer scope.
8. Build physical count/recount/adjustment workflow.
9. Build landed cost, valuation and stock-to-GL exception views.
10. Complete return/credit/debit/refund matrices and outputs.
11. Run two controlled cycles and qualified review; only then promote features.

## 15. Owner decisions and disclaimer

Named owners approve supplier verification/change policy; item types and valuation;
warehouse/transit/rejected/negative-stock policy; purchasing/receiving/billing/
payment approvals; Saudi input-tax and import/customs evidence; inventory, Stock
Received But Not Billed, landed-cost and variance accounts; count/recount/cutoff;
opening stock/cutover; devices; retention; monitoring; recovery; and support.

This contract is product and control guidance, not inventory valuation, procurement,
accounting, or Saudi tax advice. Final mappings, tax treatments, physical-count
conclusions, inventory valuations, adjustments, corrective documents, and production
acceptance require the organization's qualified procurement, warehouse, accounting,
Saudi tax/compliance, security, legal, and operational reviewers as applicable.
