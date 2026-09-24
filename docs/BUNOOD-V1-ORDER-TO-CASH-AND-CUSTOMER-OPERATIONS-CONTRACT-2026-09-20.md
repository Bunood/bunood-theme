# Bunood V1 order-to-cash and customer operations contract

**Date:** 2026-09-20  
**Scope:** WO-12, WO-13, OTC-01 through OTC-05, KSA-02, KSA-04  
**Status:** target product and acceptance contract; not sales, credit, tax, ZATCA,
portal-security, receivable-reconciliation, or release evidence  
**Machine register:** `quality/v1-order-to-cash-control-register.json`

## 1. Product outcome

Bunood turns customer work into one understandable chain:

`Lead/customer → opportunity → quotation → order → fulfilment → invoice → payment →
collection/correction → customer self-service`

Each role sees its next work and exceptions, not every ERP field:

- sales sees relationship, opportunity, next action, quote and order;
- fulfilment sees what to pick/deliver and what remains;
- billing sees what is billable, tax/ZATCA readiness and what is already billed;
- collections sees outstanding, overdue, promises, disputes and payment allocation;
- the customer sees only their permitted documents, payment actions and files;
- accounting can trace every amount through stock, tax, receivable, Payment Ledger,
  settlement and GL.

Simple and Advanced modes use the same native ERPNext documents. Bunood does not
create a shadow CRM customer, order ledger, receivable balance, or portal database.

## 2. Native authority and source research

The current official ERPNext documentation establishes:

- [Opportunity](https://docs.frappe.io/erpnext/opportunity) is a qualified lead or
  customer sales possibility; it is not a confirmed sale.
- [Quotation](https://docs.frappe.io/erpnext/quotation) is a versioned offer with
  items/services, prices, tax, validity, delivery expectations and terms. Accepted
  offers normally create a Sales Order; lost and expired are distinct outcomes.
- [Sales Order](https://docs.frappe.io/erpnext/sales-order) is the customer
  commitment. It supports partial delivery/billing, hold, close, reopen, update,
  cancel/amend and downstream fulfilment, but normal submission does not itself
  deliver stock or recognize income/receivable.
- [Selling](https://docs.frappe.io/erpnext/selling) describes common standard goods,
  direct stock invoice, service and partial-fulfilment paths. V1 promotes only the
  paths actually accepted for the customer configuration.
- [Close Sales Order](https://docs.frappe.io/erpnext/close-sales-order) ends only the
  outstanding balance and preserves completed delivery/billing/payment. Closing is
  not cancellation or return.
- [Sales Invoice](https://docs.frappe.io/erpnext/sales-invoice) creates receivable,
  income and tax; `Update Stock` also records the direct stock movement and must not
  duplicate an existing Delivery Note.
- [Payment Request](https://docs.frappe.io/erpnext/payment-request) is a request or
  instruction, not proof that money moved or the invoice was settled.
- [Sales Return](https://docs.frappe.io/erpnext/sales-return) preserves the original
  and distinguishes physical return, credit note, paid/part-paid treatment and
  refund/credit outcome.

The cash/payment/settlement chain is controlled by the Bunood cash-bank-payment
contract; Saudi invoice/VAT/QR/XML states by the ZATCA contract; privacy/portal data
by the PDPL contract; and all visual behavior by the universal product grammar.

## 3. Permanent state integrity

1. Lead, opportunity, customer, quote, order, delivery, invoice, payment and return
   are separate native records and states.
2. A quotation is an offer, not a confirmed order, delivery, invoice or payment.
3. A Sales Order is a commitment; it does not itself move stock, recognize income,
   create receivable/tax, or prove payment.
4. A Delivery Note is fulfilment, not billing or payment.
5. A Sales Invoice is billing/receivable, not proof of delivery or payment.
6. A Payment Request asks for payment; it is not money movement.
7. Payment Entry, allocation, provider settlement and bank reconciliation remain
   distinct.
8. A submitted or customer-shared document is revised through native version,
   update, cancel/amend, close/reopen or corrective-document rules. It is not
   silently overwritten.
9. Partial delivery, billing, payment and return preserve exact completed and
   remaining quantity/value. Short close preserves completed work and ends only the
   approved remainder.
10. Duplicate clicks, callbacks, scheduled messages and retries cannot create a
    second order, delivery, invoice, payment or reminder.
11. Customer identity, address/contact, price/tax class, currency, payment terms and
    credit changes are governed and audited.
12. A portal identity can access only explicitly mapped customers and permitted
    records/files; UI filtering is never the authorization boundary.
13. Screen, email, PDF, thermal, portal, XML and QR values reconcile to the same
    source.
14. Simple mode may hide specialist fields, never mandatory commercial, credit,
    stock, tax or accounting context.

## 4. Roles and boundaries

| Role | Main task | Must not silently do |
|---|---|---|
| Sales representative | Own lead/opportunity, prepare quote/order, follow next action | approve own controlled discount/credit, view unrelated customers |
| Sales manager | Review pipeline, margin/discount/order exceptions | bypass finance/tax/customer isolation |
| Customer master steward | Verify/merge identity, contacts, addresses, tax metadata | alter transactions or credit without workflow |
| Credit controller | Review limit, hold/release, dispute and collections exposure | change invoices or hide overdue balances |
| Fulfilment operator | Pick/deliver permitted order quantities and proof | change commercial rates/tax or over-deliver invisibly |
| Billing operator | Bill eligible source quantities/values with tax/ZATCA readiness | fabricate delivery, payment or customer classification |
| Collections operator | Statements, reminders, promises, disputes, receipts/allocation | write off, change tax, or mark provider result settled |
| Customer portal user | See/pay/download only own authorized customer records | discover another customer, internal cost, notes or workflow |
| Accountant reviewer | Reconcile stock/tax/AR/payment/GL and corrections | rewrite submitted source or act as customer |

## 5. Customer identity and onboarding

Customer creation begins with type, legal/display name, identifiers needed for the
approved flow, primary contact/address, language, currency/price list, tax category,
payment terms, territory/team and consent/purpose. It shows why each field is needed.

Duplicate detection uses normalized name, legal/tax identifiers, phone/email and
address signals but never auto-merges ambiguous people/entities. Merge or correction
preserves aliases, source, relationships and audit under permission. Changing VAT/
legal identity, receivable account, currency, credit terms, price/tax class, bank or
portal mapping is a reviewed high-impact change where policy requires.

Customer readiness states clearly distinguish incomplete setup, active, credit
review/hold and disabled. Disabled/held does not erase historic records.

## 6. Lead and opportunity without CRM clutter

The sales home begins with owned next actions and exceptions: new/untouched lead,
follow-up due, quote expiring, quote accepted not ordered, order on hold, overdue
delivery/billing and customer credit issue. Pipeline decoration comes after tasks.

The Simple opportunity form needs customer/lead, need, expected value/currency,
probability/stage, expected close, owner, source and next action. Stage changes record
reason and time. Won requires the accepted commercial path; lost requires a governed
useful reason. Forecasts identify definition, `as of`, filters and native source;
they are never presented as booked revenue or cash.

## 7. Quotation

The quote form prioritizes customer/lead, validity, item/service **name**, quantity/
UOM, unit price, discount, tax, delivery expectation, payment terms and total.
Code/SKU is secondary. Advanced mode exposes price rules, margin, dimensions,
alternate items and specialist terms without changing the record.

Before send/share, preview checks recipient, company identity, version, validity,
currency, items, discount, tax breakup, total, language, terms, attachments and PDF.
Sending records template/version, recipient, channel, time and delivery result; it
does not imply the customer accepted.

Revision preserves the prior submitted/shared offer. Acceptance binds the exact
version and creates or links the Sales Order. Expired and lost remain visible with a
safe duplicate/revise route, not an editable historic offer.

## 8. Sales Order and fulfilment

The order timeline shows independent **delivery**, **billing**, **advance/payment**
and **credit/hold** progress. One generic `completed` badge is insufficient.

Order Simple mode prioritizes customer, promised dates, item/service names,
quantity/UOM, source warehouse where relevant, rate/discount/tax, payment/delivery
terms, total, approval and next action. Submission says: “Order confirmed; no stock,
invoice or payment has been created yet.”

Fulfilment supports accepted paths:

- standard stocked order → pick/Delivery Note → Sales Invoice;
- direct invoice with Update Stock where goods are handed over and no prior Delivery
  Note exists;
- service order/invoice with no fake warehouse movement;
- mixed service/stock with only deliverable rows counted;
- partial delivery/backorder and partial billing;
- proof of delivery/receipt where policy requires;
- hold/resume, update allowed fields, short close/reopen, cancel/amend.

Every delivery row shows ordered, previously delivered, remaining, this delivery,
warehouse, UOM and batch/serial requirements. Over-delivery follows tolerance/
approval. Short close explains the remaining quantity/value being ended and never
creates credit/refund by itself.

## 9. Billing and Saudi invoice operation

Billing starts from eligible order/delivery rows whenever those sources exist. The
form shows source quantity/value, previously billed, current bill and remainder.
Direct service or immediate stock billing is explicit; `Update Stock` cannot be
enabled when a Delivery Note already moved the same stock.

Customer, company, posting/due date, payment terms, currency, price/tax class,
legal identifiers and standard/simplified classification are validated before
submit. Taxes, inclusive/exclusive prices, discounts, charges and rounding show a
large, understandable total block.

After submit, Bunood separates native invoice, stock, tax/GL, payment/outstanding,
print/portal and ZATCA state. Warnings, delayed reporting, rejection and correction
are not hidden behind “invoice created.” Corrections preserve original references
and use the accepted credit/debit-note/return path.

## 10. Payment request, receipt and settlement

From an eligible order/invoice, the user can create a permissioned request with
amount, currency, expiry, customer/recipient, source and method. The UI states:
“Request sent—payment has not yet been received.” Link revocation is immediate and
audited.

Provider/browser callbacks follow idempotent authenticated processing. Timeout or
ambiguous response queries/reconciles before retry. Genuine receipt creates/links
the native Payment Entry; partial/over/under payment remains explicit; allocation
updates native outstanding. Provider capture, settlement, clearing, bank credit and
reconciliation are later distinct states under the cash/bank contract.

## 11. Receivables and collections

The collections workspace answers: who owes us, how much, how late, what is disputed,
what was promised, and what should happen next? Summary values have exact company,
date, currency and inclusion rules and drill to the native rows.

Queues include new overdue, high value/risk, broken promise, unapplied receipt,
credit balance, disputed invoice, statement/reminder delivery failure, expiring
payment link and reconciliation exception. Each has owner, age and next action.

The customer drawer shows outstanding invoices/credits, ageing, recent payments,
unallocated amount, promise/dispute history, statement, contact/language and allowed
actions. It does not expose internal notes/cost or unrelated companies.

Statements/reminders are previewed with exact source totals. Scheduled policy has
step identity and idempotency, preventing duplicate delivery. Delivery success is
not customer receipt or promise. Pause/opt-out/legal-contact rules follow approved
policy. A dispute changes collections status, not the native invoice amount; any
financial change requires the correct document.

## 12. Customer portal

Portal access is deny-by-default and server-authorized for a specific user-to-
customer mapping. Every list, record, attachment, print, API, search, count, URL and
download is permission-filtered. Sequential names and guessed URLs reveal nothing.

Promoted portal tasks:

- view accepted quotations/orders and their status/progress;
- accept/decline quote only under the exact approved mechanism;
- view/download invoice, note, statement and permitted attachments;
- initiate a payment request/link and see truthful receipt state;
- update only explicitly permitted contact/profile fields;
- sign out all sessions/revoke access through supported controls.

Expired/revoked links and disabled users fail safely without confirming whether
another customer record exists. Support impersonation is prohibited unless an
approved, visible, time-bound, audited mechanism exists. Portal files are protected
at storage and delivery, not merely hidden from navigation.

## 13. Visual, bilingual and interaction contract

- Forms follow identity/state, business context, primary work, totals/validation,
  actions/history on one centered grid.
- Names are primary; codes are secondary. Full Arabic/Latin names remain visible.
- One harmless ready row may follow a completed item row; it never validates, saves,
  posts, totals, prints, emails, exports or appears in portal output.
- Selected/current/primary and verified success use dark Bunood green; ordinary
  surfaces stay white/neutral. Status is not decorative pill soup.
- Timeline/progress uses text plus accessible icons and exact quantities/amounts.
- The primary action names the outcome: Save draft, Send quotation, Confirm order,
  Record delivery, Save and submit invoice, Send payment request.
- Validation/server/permission/conflict/integration failure always restores controls,
  retains safe input, gives the exact issue and focuses remediation.
- Preview opens a local rail/modal with skeleton and stable page—not a full-screen
  blank. Close returns focus.
- Arabic/RTL and English/LTR are complete on 1440/1024/700/430 widths; mixed names,
  IDs, currency, dates, phone/email, VAT and invoice references have direction
  isolation; Arabic glyphs are never clipped.
- Keyboard, touch and screen reader reach every task; tables transform intentionally
  on narrow screens rather than squeeze required text.
- Emails, A4, thermal, PDF, XML/QR and portal share governed terminology/content.

## 14. Reconciliation contract

For every controlled cycle and common boundary:

1. lead/opportunity/customer conversion preserves source, owner and identity;
2. accepted quote version equals order item/quantity/price/discount/tax/terms;
3. order equals delivered + remaining/short-closed, with Stock Ledger movement;
4. order/delivery equals billed + remaining, with source references;
5. invoice equals receivable + Payment Ledger allocation/credit/outstanding;
6. payment link/provider event equals Payment Entry, clearing/settlement, bank and GL;
7. statement/ageing/reminders/promises/disputes reproduce native outstanding/history;
8. invoice equals email/PDF/thermal/portal/XML/QR/ZATCA values;
9. original plus return/credit/refund equals net stock/tax/payment/AR/GL;
10. governed sales/AR metrics reproduce these same sources and filters.

No offsetting customer, invoice, item, tax or period differences are hidden because
the total happens to be zero.

## 15. Exception matrix

Acceptance covers duplicate/ambiguous customer; missing consent/contact; quote
revision/send failure/expiry/loss; discount/margin/credit denial; order hold,
partial, backorder, short close/reopen, cancel/amend; wrong/partial/over delivery;
service/stock/direct paths; duplicate billing/stock movement; VAT/ZATCA warning,
delay/reject/correction; payment-link expiry/revoke/timeout/replay; part/over/under/
unallocated payment; statement/reminder duplicate/delivery failure/opt-out; dispute;
full/partial paid/unpaid return/refund; cross-customer portal URL/file/API/search/
count denial; disabled/revoked session; server/network/conflict/retry; export/print/
email/QR failure; and late correction after close.

Every recovery leaves the operator/customer with truthful state, original context,
safe next action, no duplicate business/ledger effect, and an owned exception.

## 16. Acceptance evidence

Structural validation proves target completeness only. Promotion requires two
candidate-bound end-to-end cycles—normal and exception-heavy—and all twelve machine
evidence groups, including real sales, fulfilment, billing, collections, customer
portal and accounting participants.

Receipts bind commit/assets, ERPNext/app/connector versions, company/currency/tax/
price/credit/warehouse/payment/portal configuration, fixture hashes, roles, devices,
scenarios, native IDs, delivery/output evidence, source-to-stock/tax/AR/payment/GL
queries and totals, cross-customer negative probes, performance, failures/recovery,
open differences, named reviewers and decision.

Required review includes commercial/sales policy, accounting, Saudi tax/ZATCA,
privacy/PDPL, portal/application security, payments, operations and support.

## 17. Implementation order

1. Approve customer identity, price/tax, credit, fulfilment, payment, communication
   and portal policy plus controlled fixtures.
2. Build customer duplicate/readiness and sales-owned next-action workspace.
3. Build quotation/version/share/accept path and commercial output.
4. Build Sales Order progress, hold/partial/short-close and fulfilment handoff.
5. Complete delivery/direct-stock and billing source integrity.
6. Complete invoice/VAT/ZATCA/payment/output/correction state model.
7. Complete receivables, statements, reminders, promises and disputes.
8. Complete payment-link/provider/settlement integration under the money contract.
9. Build and security-test the customer portal/document family.
10. Run normal/exception cycles, real-user usability and qualified sign-off.

## 18. Owner decisions and disclaimer

Owners approve customer identity/consent/privacy; price/discount/margin/tax/currency/
terms; credit/hold/dispute/write-off/collections; order/delivery/direct sale/return/
refund; Saudi VAT/ZATCA classification/output; provider; portal mapping/session/file/
support access; cutover/load/monitoring/recovery/retention/support.

This contract is product/control guidance, not sales, credit, accounting, Saudi tax/
ZATCA, privacy or legal advice. Production configuration and claims require the
organization's qualified commercial, finance, Saudi tax/compliance, privacy, legal,
security, payments, operations and support reviewers as applicable.
