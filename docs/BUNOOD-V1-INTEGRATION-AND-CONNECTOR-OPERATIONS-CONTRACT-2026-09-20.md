# Bunood V1 integration and connector operations contract

**Document date:** 2026-09-20  
**Scope:** WO-30 and WO-31  
**Machine register:** `quality/v1-integration-connector-control-register.json`  
**Status:** approved planning authority; customer selection, implementation and acceptance remain open

> This contract is not provider certification, bank/payment authorization, Saudi Open
> Banking conformance, security approval, or legal/compliance advice. Production use
> requires the customer's authorised provider agreements and qualified business,
> finance, security, privacy and compliance review.

## 1. Decision

V1 will support exactly three customer-selected connector categories before it claims a
connected operating product: one payment provider, one bank/Open Banking or statement
source, and one ecommerce/order source. The connector framework is common; mappings,
authorization, settlement, consent and support remain provider- and customer-specific.

ERPNext/Frappe documents, permissions, workflows, background jobs and ledgers remain
authoritative. External systems may send intent, evidence and status. They do not become
a second customer, item, order, payment, stock, tax or accounting ledger. Direct
database integration is prohibited.

The operating chain is:

`approved purpose → endpoint/auth/consent → versioned mapping → signed ingress or
permissioned egress → validation/idempotency/order decision → queue/retry/quarantine →
native workflow → provider outcome → reconciliation → health/support/revoke/retire`.

## 2. Research translated into product rules

Frappe's REST API authenticates every request as a user and applies that user's roles.
Frappe also supports OAuth and signed webhooks. This provides useful primitives, but it
does not by itself define safe mapping, consent, idempotency, retries, out-of-order
events, reconciliation or operational support; this contract supplies those boundaries.

ERPNext ecommerce guidance explicitly keeps ERPNext as the stock/accounting source,
uses stable external IDs, logs attempts and retries failures. Bunood extends this to a
versioned mapping register, duplicate/out-of-order policy, dead-letter quarantine,
approved replay, provider/native reconciliation and support ownership.

For Saudi banking and payments, connection must use an authorised provider and the
exact applicable SAMA framework. Consent, technical connection, accepted request,
capture, settlement, bank credit and reconciliation are not synonyms. Bunood never
markets generic Open Banking conformance, a bank connection, or payment-provider
approval based only on API code or sandbox success.

Primary sources:

- [Frappe REST API](https://docs.frappe.io/framework/user/en/api/rest)
- [Frappe REST integration guide](https://docs.frappe.io/framework/user/en/guides/integration/rest_api)
- [Frappe OAuth 2](https://docs.frappe.io/framework/user/en/guides/integration/rest_api/oauth-2)
- [Frappe Webhooks](https://docs.frappe.io/framework/v14/user/en/guides/integration/webhooks)
- [ERPNext ecommerce integration guidance](https://docs.frappe.io/erpnext/e-commerce-integrations-for-erpnext)
- [ERPNext integration categories](https://docs.frappe.io/erpnext/erpnext_integration)
- [SAMA Open Banking Framework](https://www.openbanking.sama.gov.sa/index-en.html)
- [SAMA Payments and Payment Services implementing regulations](https://www.rulebook.sama.gov.sa/en/implementing-regulations-payments-and-payment-services-law)
- [SAMA merchant settlement period](https://www.rulebook.sama.gov.sa/en/2135-settlement-period)
- [Saudi PDPL guide](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP/)

## 3. Connector catalogue and lifecycle

Every connector record names the business purpose, customer/data owner, source of
truth per object and field, legal entity, provider, exact product/API, sandbox and
production endpoints, data categories, direction, volume, availability target,
commercial/support owner, reconciliation owner, retention, incident path and exit plan.

The sixteen connector states in the machine register distinguish approval, sandbox,
production, health, rate limit, authentication/consent failure, retry/quarantine,
reconciliation difference, suspension and retirement. “Connected” is never used as a
catch-all state.

Production enablement requires the customer's authorised provider account/agreement,
approved security/privacy/data path, accepted mappings, sandbox evidence, least-
privilege integration identity, secret storage/rotation, monitoring, reconciliation,
support and an emergency disable path. Sandbox success is not production approval.

## 4. Message integrity and idempotency

Every inbound or outbound attempt records connector/version, correlation ID, stable
external ID, idempotency key, event type/version, source time, received/sent time,
attempt, status, native reference, redacted failure category and final outcome.

Authentication/signature, origin, timestamp, nonce/replay, content type, size, schema
and required business fields are validated before side effects. Raw payload retention is
minimized and protected; secrets, tokens and unnecessary personal/payment data never
appear in browser state, ordinary logs, exports or support screenshots.

At-least-once delivery is assumed. Duplicate retry, user refresh and provider replay
cannot create a second order, invoice, delivery, payment, return, refund, stock movement
or ledger effect. Out-of-order, late, unknown-version and conflicting events follow an
approved rule or enter quarantine; they are never guessed into success.

Message state distinguishes received, authenticated, validation failed, mapped,
duplicate, queued, processing, delivered, acknowledged, retrying, dead-letter,
replay-approved and reconciled. “HTTP 200” proves neither business acceptance nor money
settlement.

## 5. Queue, retry, replay and recovery

- Timeouts, rate limits and transient provider errors use bounded exponential backoff
  with jitter and the provider's requirements.
- Permanent authentication, mapping, validation or business errors do not retry forever.
- Dead-letter items expose category, age, owner, native/external references, safe
  context and remediation without exposing secrets.
- Replay/reprocess/remap/manual override requires a permission, reason, expected effect,
  preview where possible and immutable audit history.
- Worker restart, backlog, provider outage and deployment/upgrade preserve idempotency
  and observable state. Emergency suspend prevents new effects while retaining evidence.

## 6. Provider-specific boundaries

### 6.1 Payment provider

Payment request/intention, provider authentication, customer authorization, accepted
request, capture, refund, settlement, fee, clearing, bank credit, Payment Entry,
allocation and bank/GL reconciliation stay distinct. Callbacks are idempotent and tied
to the original request, invoice and customer. An ambiguous timeout never marks an
invoice paid until authoritative provider/native reconciliation resolves it.

### 6.2 Bank, Open Banking or statement source

Authorisation/licensing, user consent, scope, bank account, consent expiry/revocation,
data fetch, statement identity, transaction identity, match, voucher, bank GL and
difference remain distinct. Bank/Open Banking data is evidence; it does not bypass the
native Bank Transaction and reconciliation chain. Split, merge, partial, transfer,
fees, reversals and duplicate files/events are covered.

### 6.3 Ecommerce or order source

The mapping covers catalog/item/variant, UOM, price, currency, tax, stock availability,
customer/address/contact, discounts/shipping, order, fulfilment/tracking, cancellation,
return, credit/refund and native references. Channel availability never overrides the
native Stock Ledger. External “paid” never replaces payment/provider/bank evidence.
Tax/ZATCA and fulfilment are executed through the supported native workflow.

## 7. Permissions, security and privacy

Each connector uses a dedicated least-privilege integration identity; roles and User
Permissions are tested as that identity. API access does not mean unrestricted DocType
CRUD. Whitelisted business endpoints and native submit/cancel/amend paths are preferred
where lifecycle integrity matters. Generated GL, Payment Ledger and Stock Ledger rows
are never written directly.

Secrets are stored server-side with access/audit controls, rotated before expiry,
revoked on exit or incident and never returned to client code. Network allowlists,
signature keys, OAuth scopes, certificate/token lifecycle and provider-specific
controls are reviewed for the chosen connector.

Payloads, mappings, logs, files, queues, dead letters, exports, backups and support tools
use company/tenant isolation, minimization, redaction, retention and incident controls.
Cross-tenant, cross-company, revoked-identity and excessive-scope negative tests are
mandatory.

## 8. Reconciliation and observability

Each message can be traced from provider attempt to native document/workflow and final
external/native outcome. The ten reconciliation links in the register cover catalog,
customer, order, fulfilment, return/refund, payment/settlement, bank, tax/ZATCA, message
history and connector health.

Differences record category, value/currency where applicable, age, owner, due date,
evidence, root cause and resolution. Health shows last success, last error category,
authorization/consent expiry, volume, lag, backlog, retry/dead-letter counts,
quarantine age, reconciliation differences, provider status and support escalation.
No secret or raw sensitive payload is needed to understand operational health.

Alerts cover authentication/consent expiry, signature failure, unusual duplicate or
rejection rate, sustained lag/backlog, dead-letter growth, reconciliation difference,
provider outage and worker failure. Alert ownership and escalation are part of the
connector, not an implementation afterthought.

## 9. Upgrade, marketplace and support boundary

API/app/schema/provider versions and compatibility are recorded and tested before
upgrade. Contract tests use representative normal and exception fixtures without
claiming real provider acceptance. Cutover, rollback, key rotation, data backfill,
provider exit and connector retirement have rehearsed procedures.

A marketplace is not a V1 catalogue of logos. A connector can be described as supported
only for the exact provider, product, version, region, direction, objects, volume,
limitations and support owner proved by evidence. “Certified” or “approved” requires an
authentic provider/regulator grant with the exact scope and expiry.

## 10. Acceptance gate

Structural validation is not integration acceptance. V1 promotion requires all three
customer-selected categories, each with controlled sandbox and authorised production
cycles, normal plus exception events, all twelve evidence groups and exact applicable
external/native/stock/tax/payment/bank/GL reconciliation.

The combined suite covers duplicate, out-of-order, late, conflict, timeout, ambiguous
outcome, rate limit, expired/revoked credentials and consent, invalid signature,
malformed payload, provider/worker outage, dead letter, approved replay, secret rotation,
emergency suspend, restore, upgrade and rollback. Real business, finance, support and
administrator users complete the tasks. Qualified provider/business/security/privacy/
finance reviewers approve the configured scope before any supported-production claim.
