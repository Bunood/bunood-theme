# Bunood V1 Saudi ZATCA and VAT Operations Contract

**Document date:** 2026-09-20  
**Work orders:** KSA-01 through KSA-05  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Machine control:** `quality/v1-zatca-control-register.json`  
**Runtime authority:** the pinned `ksa_compliance` connector for regulated XML,
signing, counters, hashes, QR and transport; ERPNext for the source invoice, tax,
stock, receivable, payment and ledgers.  
**Scope:** Saudi seller identity, VAT invoice readiness, EGS onboarding, credentials,
standard clearance, simplified reporting, corrections, operations and evidence.

> **Compliance notice:** this is a product and control specification, not legal or tax
> advice, ZATCA certification, provider approval, or evidence that a configured company
> is compliant. Requirements and technical specifications change. Production use
> requires current authoritative verification and review by qualified Saudi tax,
> accounting, compliance and security professionals.

## 1. Proceed only with conditions

Bunood can proceed with a ZATCA operating layer only when these conditions remain
true:

1. no Bunood component reimplements regulated signing, XML, counter/hash or API
   behavior already owned by the reviewed connector;
2. every regulatory outcome is tied to the exact company, EGS, environment, native
   invoice, signed payload hash, request and authentic response;
3. standard clearance and simplified reporting remain different lifecycles;
4. tax/accounting truth comes from the submitted native transaction and native
   ledgers, never a connector status table;
5. sandbox/SDK success is described as technical validation, not approval;
6. legal identity, tax treatment and production activation receive qualified review;
7. credentials remain server-side, least-privilege, rotatable and recoverable; and
8. a delayed, unknown, warning, duplicate or rejected response is never shown as a
   clean success.

## 2. Authoritative regulatory model

ZATCA describes electronic invoicing as structured electronic invoices and notes,
not scans or ordinary PDFs. Phase 1 is generation/storage. Phase 2 adds integration
in notified waves.

For the Integration Phase:

- **Standard documents (normally B2B):** submit for Clearance before providing the
  document to the buyer. ZATCA validates and either clears, clears with warnings, or
  rejects. The buyer-facing document must be the cleared result, including the
  ZATCA-provided clearance stamp/QR behavior required by the specification.
- **Simplified documents (normally B2C):** the onboarded EGS signs/generates the
  document and presents it to the buyer, then reports the XML to FATOORA within the
  current official deadline—documented by ZATCA as 24 hours at this contract date.
  Temporary non-response requires continued controlled retry and attempt evidence.

Invoice type is determined by the approved business/tax rule and document data, not a
user’s desire to avoid clearance or reporting. Self-billing and other special cases are
enabled only under documented agreements and qualified review.

## 3. Native authority and prohibited behavior

The source chain is:

`submitted Sales Invoice / credit or debit note`
→ `native tax, receivable, stock and GL effect`
→ `immutable regulated source snapshot`
→ `signed XML, UUID, counter and previous-invoice hash`
→ `ZATCA request`
→ `authentic response and returned artefacts`
→ `buyer output / archive / operational status`.

The following are prohibited:

- generating a second commercial/tax transaction to satisfy the connector;
- editing generated GL, Payment Ledger or Stock Ledger rows;
- changing a submitted original in place instead of an approved credit/debit note or
  amendment path;
- regenerating an issued signed payload under the same identity after business data
  changed;
- sending a standard document to the buyer before clearance;
- stopping simplified-report retry merely because the sale completed locally;
- storing Production credentials in source control, browser state, logs, screenshots,
  ordinary backups, test fixtures or support tickets;
- sharing one EGS identity/counter chain across an unapproved company, branch, device,
  environment or restored clone;
- switching Sandbox to Production implicitly;
- treating a network acknowledgement, HTTP success, queued job, SDK validation,
  duplicate response, or UI redirect as regulatory acceptance;
- hiding warnings, rejected-rule identifiers, age, last attempt or next action; and
- advertising “ZATCA approved” or “certified” without an exact, current and authorised
  basis. ZATCA’s provider directory is not a blanket certification of every customer
  configuration or invoice.

## 4. Accountable roles

| Role | Owns | Cannot do alone |
|---|---|---|
| Business owner | legal entity, wave notification, production decision, accepted risk | approve tax/accounting interpretation |
| Saudi tax/accounting reviewer | VAT treatment, invoice type, corrections, tax/GL reconciliation | administer Production secrets without security control |
| Compliance manager | readiness, evidence, warnings/rejections, regulatory monitoring | change posted accounting truth |
| Invoice operator | accurate business data, submission and customer handoff | onboard EGS, reveal credentials or override rejection |
| System administrator | apps, jobs, time, backup/restore, availability | invent legal identity or mark regulatory success |
| Credential/security administrator | OTP ceremony, key/CSID custody, rotation/revoke, access | approve invoices or tax treatment |
| Support operator | queue health, safe retry, incident evidence and escalation | read secrets or edit submitted invoices |
| Auditor | trace chain, sample evidence, access and retention review | alter the evidence being reviewed |

Small businesses may combine roles, but Production onboarding, credential custody and
material tax acceptance require a recorded maker/reviewer separation.

## 5. Company, branch and EGS readiness

Each company readiness record states:

- legal Arabic and English seller name as approved;
- VAT registration and other required seller identifiers;
- national address fields and evidence age;
- base currency, timezone and time synchronization owner;
- Phase 1/Phase 2 status, notification/wave evidence and effective date;
- transaction types and special arrangements that are actually supported;
- approved tax templates, categories, exemption/zero-rate reasons and accounts;
- each branch/device/EGS unit, serial identity and responsible owner;
- Sandbox and Production endpoints/configuration kept separate;
- Compliance CSID and Production CSID state without returning secrets;
- certificate/credential issuance, expiry/renewal/revoke state;
- counter/hash continuity and restore/clone restrictions;
- print formats, Arabic content, XML/QR archive and retention; and
- owner, reviewer, last check, next check and exact blocker.

Readiness states are: `out-of-scope`, `phase1-generation`, `phase2-notified`,
`sandbox-configured`, `compliance-csid-issued`, `compliance-checks-passed`,
`production-csid-issued`, `active`, `expiring`, `suspended`, `revoked`, or `error`.

An OTP is a short-lived onboarding/renewal ceremony input obtained from the FATOORA
portal. Bunood does not persist or expose it after the ceremony. A Compliance CSID is
for compliance APIs; a Production CSID authenticates production reporting/clearance.
They are not interchangeable.

## 6. Invoice classification and pre-submit validation

Before native submission, Bunood shows plain-language blockers and warnings for:

- company and EGS readiness;
- approved standard versus simplified classification;
- buyer identity and VAT fields required for the selected type;
- seller identity/address and currency;
- issue date/time and supply/due/reference fields;
- line description, quantity, UOM, price, discounts, allowances/charges and rounding;
- VAT category, rate, exemption reason, taxable amount, tax and totals;
- return/credit/debit-note reason and original-document reference;
- supported Arabic content and output; and
- connector availability/version compatibility.

The UI does not calculate a second tax result. It explains the native ERPNext values
that the regulated connector will transform and signs only after the native document
reaches the required state.

## 7. Document state machine

Every invoice/note has one explicit operational state:

1. `draft` — editable native transaction, no regulatory result;
2. `submitted-native` — ERPNext submitted; regulated payload not yet proven;
3. `generated` — source snapshot/XML created;
4. `local-validation-failed` — SDK/schema/business-rule validation blocked send;
5. `signed` — signature/counter/hash completed under one EGS;
6. `queued` — durable send intent recorded;
7. `submission-in-flight` — one owned attempt is active;
8. `cleared` — authentic standard clearance response bound to payload;
9. `cleared-with-warnings` — standard clearance succeeded but warnings remain owned;
10. `reported` — authentic simplified reporting response bound to payload;
11. `reported-with-warnings` — simplified reporting accepted with warnings;
12. `rejected` — fatal response; original evidence retained;
13. `delayed` — no definitive result; deadline/age and retry remain visible;
14. `duplicate-response` — duplicate outcome awaiting reconciliation to the original
    exact payload/result;
15. `correction-required` — business or regulatory correction is authorised; and
16. `corrected-by-note` — native credit/debit note or approved amendment links the
    original and completes its own regulatory lifecycle.

`duplicate-response` is not promoted to `cleared` or `reported` unless Bunood locates
an earlier authentic success with the same company, environment, EGS, UUID and signed
payload hash. The duplicate attempt remains in the audit trail.

The accounting document state and the ZATCA state are displayed side by side. A
regulatory rejection does not silently cancel or edit the submitted ERPNext invoice;
the user receives the qualified correction path and accounting impact.

## 8. Outcome invariants

- Generated is not signed, queued, sent, acknowledged, cleared or reported.
- SDK-valid means locally conformant to the checked rules; it is not ZATCA approval.
- HTTP/API acknowledgement is not clearance or reporting acceptance.
- Standard documents are buyer-deliverable only after authentic clearance.
- Simplified documents remain due for reporting after local issuance until an
  authentic response is bound to the payload.
- Accepted-with-warnings remains an exception with owner and disposition; it cannot
  be rendered as clean green success.
- Unknown, timeout and temporary non-response remain delayed, not rejected or
  accepted.
- Retry is idempotent and cannot allocate a new invoice UUID, business identity,
  counter or native transaction to the same signed payload.
- A correction supersedes by native linked note/amendment; it never erases original
  XML, request, response, warning or rejection evidence.
- Production and Sandbox artefacts, credentials, counters and results never mix.
- Connector state cannot override native tax, stock, receivable, payment or GL truth.
- Printed/PDF amounts and QR must be derived from the accepted source/result for the
  document type; a placeholder QR is never evidence.

## 9. Credential, key and environment governance

For each EGS and environment, record non-secret metadata: owner, company/branch/device,
CSR/request reference, certificate identifier/fingerprint, issue/expiry, environment,
permissions, last successful authenticated call, renewal status and revoke status.

Controls include:

- server-side encrypted secret storage with access limited to the connector runtime;
- no secret fields in Bunood’s ordinary status API;
- explicit Sandbox/Production activation requiring authorised confirmation;
- access review and machine/service identity rather than shared personal credentials;
- expiry alerts and tested renewal before the deadline;
- immediate revoke/isolate path for compromise, lost device or decommissioning;
- restore/clone runbook that prevents a staging clone from calling Production or
  continuing a Production counter chain; and
- sanitized diagnostics that retain correlation IDs and rule codes, not credentials
  or full unnecessary personal data.

## 10. Queue, idempotency and recovery

One submission key binds company, environment, EGS, native document/version, document
type, UUID and signed-payload hash. A durable attempt record contains request time,
correlation identifier, response code/category, warnings/errors, retry decision,
worker/job identity and evidence checksum.

Safe retry rules:

- only one active attempt per submission key;
- exponential/backoff and rate-limit handling follow the current API contract;
- network ambiguity triggers status/evidence reconciliation before resubmission;
- fatal validation errors never enter blind automatic retry;
- credential/revocation errors stop and escalate;
- delayed simplified reporting exposes time remaining/overdue age and continues under
  the approved policy;
- delayed standard clearance blocks buyer delivery and offers no fake offline success;
- duplicate responses require exact prior-result reconciliation; and
- a dead-letter item retains its evidence and has owner, severity and next action.

## 11. Corrections, returns and notes

After issue, correction uses the supported native commercial and accounting path:

- full/partial return, price/rate/tax correction and cancellation reason are explicit;
- the original UUID/invoice reference, reason and affected lines/amounts are retained;
- paid/part-paid/unpaid and stock/non-stock cases reconcile independently;
- the credit/debit note receives its own UUID, counter/hash, XML, QR, submission and
  response lifecycle;
- payments/refunds, outstanding amount, Payment Ledger, stock and GL reconcile; and
- buyer-facing print and regulatory artefacts identify the correction and original.

Manual editing of the original’s generated XML or a direct Journal Entry used only to
make reports agree is prohibited.

## 12. Reconciliation chain

For each tested scenario, the same boundary reconciles:

1. customer/seller identities and invoice classification;
2. source Sales Invoice or credit/debit note fields;
3. item/net/discount/allowance/tax/gross/rounding totals by currency;
4. signed XML elements and payload hash;
5. UUID, EGS, counter and previous-invoice-hash sequence;
6. request environment/endpoint and authentic response;
7. returned/stored QR, stamp and buyer-facing PDF/thermal output;
8. native tax accounts and VAT reports;
9. receivable, Payment Ledger, payments/refunds and GL;
10. stock ledger where relevant; and
11. original-to-correction linkage.

The regulatory log may describe the request/result but never supplies accounting
totals to financial reports.

## 13. Operations workspace

The workspace is exception-first, calm and bilingual. It shows:

- setup blockers by company/EGS/environment;
- standard documents awaiting clearance and buyer-delivery status;
- simplified documents awaiting reporting with deadline/age;
- warnings needing disposition;
- rejected/delayed/duplicate/correction-required queues;
- credential expiry/revoke and worker/queue health;
- recent attempts and response age;
- exact action, owner and permission; and
- reconciled evidence link.

Green is reserved for a definitive current success. Warnings use a semantic warning
style; delayed is neutral/attention; rejection is error. Badges are not decorative
pills. Operators see plain language; authorised experts can drill into rule codes,
UUID, hashes, correlation and XML without seeing secrets. Arabic/English, RTL/LTR,
keyboard, narrow-width, 200% zoom/reflow and screen-reader status announcements pass.

## 14. Monitoring, incident and continuity

Alert by company/environment on:

- Production readiness lost or credential near expiry/revoked;
- queue age, retry age, dead-letter count and worker outage;
- standard clearance latency/failure and any buyer-delivery control breach;
- simplified reporting approaching/over the official deadline;
- warning/rejection/duplicate rate changes;
- counter/hash continuity anomaly, clock drift or restored-clone activity;
- XML/QR/PDF/native-total mismatch;
- connector/app/version incompatibility; and
- missing or stale evidence retention.

An incident never instructs support to edit generated records. The runbook isolates
credentials/EGS where necessary, preserves evidence, determines affected documents,
maintains the correct standard/simplified behavior, communicates to authorised owners,
and follows current ZATCA guidance under qualified review.

## 15. Compliance risk register

| Risk | Severity | Required mitigation |
|---|---|---|
| Standard invoice delivered before clearance | Critical | hard buyer-delivery gate; authentic response binding; negative test |
| Simplified invoice misses reporting deadline | Critical | durable queue, deadline/age alert, continued retry, attempt evidence and incident route |
| Wrong B2B/B2C or VAT treatment | Critical | approved deterministic classification, pre-submit validation and qualified scenario review |
| Credential/EGS compromise or Sandbox/Production mix | Critical | scoped encrypted secrets, separation, rotate/revoke, clone/restore controls and access review |
| Duplicate/timeout shown as success | High | explicit delayed/duplicate states; reconcile exact prior result before promotion |
| Warning hidden as clean acceptance | High | warning queue, owner, rule detail and disposition evidence |
| Original transaction edited after issue | Critical | native immutable submission plus linked correction documents |
| Counter/hash/clock discontinuity | Critical | one EGS chain, time monitoring, backup/restore/clone test and stop/escalate |
| XML/QR/PDF differs from ERPNext/tax ledgers | Critical | end-to-end reconciliation and physical scan/print evidence |
| SDK pass marketed as ZATCA approval | High | controlled claims, legal/compliance review and explicit disclaimer |
| Connector upgrade changes regulated output | Critical | pinned compatibility, sandbox regression corpus and production change gate |

## 16. Acceptance gates

KSA-01 through KSA-05 cannot be promoted until the exact release candidate proves:

1. current official-specification and qualified Saudi tax/accounting/compliance review;
2. owner-confirmed company/legal/address/VAT/branch identity and Phase 2 scope;
3. credential/EGS Sandbox onboarding, compliance checks, Production ceremony under
   authorised control, expiry/renew/revoke and restore/clone isolation;
4. standard invoice and standard credit/debit-note clearance before buyer delivery;
5. simplified invoice and simplified credit/debit-note local issue plus reporting;
6. accepted, accepted-with-warning, fatal rejection, delayed/non-response,
   duplicate, credential error and corrected/superseded recovery scenarios;
7. idempotent retry and exact request/response/payload binding;
8. native invoice/XML/QR/A4/thermal/tax/stock/receivable/payment/GL reconciliation;
9. Arabic/English desktop/narrow/physical output and real QR scan evidence;
10. role, company, branch, EGS, environment and secret negative tests;
11. monitoring, deadline alert, incident, backup/restore and connector upgrade
    rehearsal; and
12. an immutable evidence packet with no secret leakage.

At least one controlled Sandbox cycle and one authorised Production cycle are required.
Production may be deferred where no authorised taxpayer/company is available; the work
then remains acceptance-incomplete rather than faking a pass.

## 17. Required approvals

| Approver | Why | Status until evidence |
|---|---|---|
| Business owner | entity, wave, branches/EGS, go-live and operational risk | Pending |
| Qualified Saudi tax/accounting reviewer | VAT, classification, fields, corrections, reports/GL | Pending |
| Compliance/legal reviewer | current requirements, claims, retention and evidence | Pending |
| Security/credential owner | CSID/key custody, access, rotation, revoke, environments | Pending |
| Operations/support owner | queue, deadline, incident, continuity and support SLA | Pending |
| Release/QA owner | candidate, connector pin, regression and immutable packet | Pending |

## 18. Official primary sources

- [ZATCA rollout phases](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx)
- [What is e-invoicing?](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/What-is-e-invoicing.aspx)
- [E-invoice specifications and data dictionary](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/E-Invoice-specifications.aspx)
- [Security requirements](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/Security-Requirements.aspx)
- [ZATCA educational and technical library](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx)
- [Detailed technical guideline](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf)
- [Detailed e-invoicing guideline](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf)
- [Compliance and Enablement Toolbox SDK](https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx)
- [E-invoicing laws and regulations](https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Pages/default.aspx)

## 19. Status and review boundary

The existing Bunood facade safely hides credentials, delegates regulated operations to
the connector, exposes several setup/result states, queues idempotently and preserves
native invoice authority. It is an implementation foundation, not evidence that this
whole contract passes.

Until all twelve evidence groups in the machine register and external approvals exist,
KSA-01 through KSA-04 remain implemented with acceptance incomplete and KSA-05 remains
planned. Qualified professionals must review this contract and the configured company
before Production use.
