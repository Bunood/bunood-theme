# Bunood V1 Saudi PDPL Operations Contract

**Document date:** 2026-09-20  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Work-order owner:** KSA-06  
**Machine control register:** `quality/v1-pdpl-control-register.json`  
**Status:** product and operating requirements; not legal advice, certification, or
proof that Bunood or a customer complies with the Saudi Personal Data Protection Law

## 1. Decision

Bunood V1 will provide a privacy operations workspace that helps a customer identify
personal-data processing, assign responsibility, operate data-subject requests,
govern processors and transfers, control retention and disposition, and manage
breaches with evidence. It will not silently choose the customer's legal basis,
decide whether a statutory exception applies, approve a transfer, or display a
generic “PDPL compliant” badge.

The customer's qualified Saudi legal/privacy owner remains accountable for the
configured interpretation. Bunood may act as controller, processor, or neither for
different activities; onboarding records that role per processing activity instead
of assigning one universal role to the whole deployment.

## 2. Authoritative regulatory baseline

The following product requirements are derived from the current official SDAIA
materials reviewed on the document date. Guidance helps implementation but is not a
substitute for the Law and Implementing Regulations.

| Regulatory point | Bunood consequence |
|---|---|
| The Law covers personal-data processing in the Kingdom and processing by entities outside the Kingdom relating to individuals residing in the Kingdom. | Deployment location alone cannot remove the onboarding review. The controller profile records territorial scope and the qualified decision. |
| SDAIA describes rights to be informed, access, obtain a readable and clear copy, correction/completion/update, destruction subject to the Law and Regulations, and withdrawal of consent. | One request case supports all six types without promising that every requested outcome is legally available. |
| Implementing Regulations require handling rights requests within no more than 30 days, with an additional extension of no more than 30 days for stated circumstances and prior notice with reasons. | The case has received, due, extension, notice, completed, and overdue timestamps; the system never labels an extension automatic. |
| A controller must maintain records of personal-data processing activities and make them available when requested by the competent authority. | RoPA is a governed register, not a generated marketing report. It links purpose, people, data, systems, recipients, transfers, retention, safeguards, owner, version, and evidence. |
| Processor selection and agreements require defined processing scope and oversight; the controller periodically assesses processor compliance. | Every processor/subprocessor has an agreement, purpose, data categories, subjects, locations, term, safeguards, breach route, deletion/return, review date, and owner. |
| The controller notifies the competent authority within no more than 72 hours after becoming aware of a breach where the stated harm/rights threshold is met; affected subjects may also require clear notification without undue delay. | A breach clock begins at recorded awareness, but only an authorised privacy/legal owner records the threshold decision and notification. The product escalates; it does not make the legal determination. |
| Impact assessment is part of the Law/Regulations for relevant public products/services and risk conditions. | New modules, integrations, sensitive processing, systematic monitoring, large-scale activity, and material changes pass a privacy-impact triage before promotion. |
| Transfers outside the Kingdom require a recorded purpose and legal basis, minimum necessary data, safeguards or applicable route, and risk assessment in specified cases. | A connector cannot be enabled merely because credentials work. Its locations, recipients, transfer route, risk decision, safeguards, expiry, and evidence must be accepted first. |
| When destruction is required, it must prevent recovery or identification; backups and archives are still personal data, and pseudonymised data remains personal data. | Disposition includes live records, files, replicas, exports, logs, search indexes, queues, backups, processors, and paper. “Hidden” or “archived” is not evidence of destruction. |
| DPO appointment is mandatory in defined circumstances, including specified large-scale public services, systematic monitoring, or core sensitive-data processing; voluntary appointment remains possible. | Readiness records whether the appointment assessment was performed, its decision and reviewer—not a guessed yes/no based on company size. |

## 3. Product boundary and operating roles

| Role | Authority |
|---|---|
| Controller owner | Owns the organisation's purposes, lawful-basis decisions, policies, appointments, exceptions, and final approvals. |
| DPO or privacy owner | Independent oversight, request/breach supervision, impact assessments, records, advice, complaints, and competent-authority contact. |
| Privacy operator | Performs assigned searches, exports, corrections, notices, and documented disposition steps; cannot approve their own legal decision. |
| Data owner | Confirms purpose, necessity, accuracy, retention, recipients, and operational impact for a business domain. |
| Security incident owner | Contains and investigates incidents, preserves evidence, supplies risk facts, and executes approved remediation. |
| Auditor | Read-only access to versioned registers, decisions, evidence, access logs, and exceptions. |

Cashier, sales, buyer, warehouse, and ordinary employee roles receive only the
privacy notices, consent controls, and self-service rights appropriate to their task.
They cannot browse the privacy register, search across people, export subject data,
or operate a breach.

All presentation remains the intersection of these product roles and effective
server permissions. Hidden buttons are not an authorisation boundary.

## 4. Privacy workspace information architecture

The restricted **Privacy and data protection / الخصوصية وحماية البيانات** workspace
uses the same neutral-first Bunood grammar:

1. **Attention:** overdue requests, breach clock, expired processor/transfer review,
   failed disposition, new unassessed processing, and missing owner.
2. **People's requests:** request type, verified identity state, due date, assignee,
   scope, exceptions, response and evidence.
3. **Processing register:** processing activity, purpose, legal basis, people, data,
   source, systems, recipients, transfer, retention, safeguards and owner.
4. **Processors and transfers:** providers, subprocessors, agreements, locations,
   transfer mechanism/risk, review and suspension.
5. **Retention and disposition:** policy, due population, hold, decision, execution,
   verification and downstream propagation.
6. **Impact and incidents:** assessments, risks, mitigations, breaches, notification
   clocks, corrective actions and lessons.
7. **Readiness and evidence:** DPO assessment, privacy notice versions, policy
   approvals, training, exercises, evidence age and qualified sign-off.

The home shows work requiring action, not a “compliance score.” Unknown, stale,
overdue, rejected and not-applicable-with-reason remain distinct.

## 5. Processing inventory and RoPA

The first inventory is a discovery aid, never a claim of completeness. It starts with
the following ERP domains and asks the data owner to confirm fields, files, reports,
exports, integrations and copies:

| Domain | Typical subjects and data | Important handling |
|---|---|---|
| Identity and access | Users, names, email, phone, roles, sessions, login/IP/security logs | Least privilege, retention, privileged-access review, incident correlation |
| CRM and sales | Leads, customer/contact people, addresses, communication, quotations, orders, invoices, returns, payments | Separate person from business entity; immutable commercial evidence may contain personal data |
| Buying | Supplier contacts, addresses, bank/payment data, quotations, invoices and communications | Payment fraud controls, restricted bank fields, statutory record review |
| Workforce | Applicants, employees, dependants, identity, contact, contract, attendance, leave, expense, payroll, bank, health or other sensitive data | Strict self/manager/HR/payroll scopes; sensitive-data and DPO/DPIA assessment |
| Inventory and delivery | Recipient/contact, delivery address, signature, vehicle/driver or shipment references | Route/driver integration recipients and short operational retention where possible |
| Support and communications | Messages, calls, attachments, screenshots, device/browser and problem details | Prevent credentials and excess personal data in tickets/evidence |
| Finance and compliance | Identity/tax/payment evidence, ledgers, ZATCA payloads/responses, bank imports, audit trails | Legal retention and ledger integrity can limit destruction; record the reason and alternative |
| Portals and integrations | Portal profiles, tokens, callbacks, provider payloads, exports and logs | Processor/subprocessor, transfer, secret, revocation and downstream deletion controls |
| Backups and observability | Backups, replicas, logs, metrics, error snapshots and recovery copies | Treat as personal data when applicable; minimise values and govern expiry/restoration |

Each processing-activity record requires:

- controller and DPO/privacy contact;
- named business activity and version;
- specific purpose and qualified legal basis decision;
- categories of data subjects and personal/sensitive data;
- direct/indirect source and collection notice version;
- systems, DocTypes, fields, files, reports, exports, logs and paper copies;
- processors, subprocessors and disclosure recipients;
- countries/locations, transfer route, safeguards and risk assessment;
- retention trigger, period, legal/operational source, hold conditions and final action;
- security/permission controls, impact-assessment decision and residual risk;
- owner, reviewer, approval/next-review dates and immutable evidence references.

Changes create a new version. They do not rewrite the historical record used to
explain earlier processing.

## 6. Purpose, notice and consent

Every promoted collection point links to a processing activity and a bilingual,
versioned notice. The notice names the controller/contact, DPO contact if applicable,
purpose, legal basis as approved, mandatory/optional fields, consequences, sources,
recipients, transfers, retention, rights and request channel as applicable.

Consent is recorded only where the qualified owner chooses consent as the basis. A
consent record contains subject, purpose, notice/version, affirmative action,
language, timestamp, channel, evidence, withdrawal and downstream effect. Bundled,
pre-checked or unrelated consent is prohibited. Withdrawal stops only the processing
that depends on that consent; it does not silently void another valid basis or erase
records subject to a documented retention obligation.

## 7. Data-subject request workflow

Supported types are `informed`, `access`, `copy`, `correction`, `destruction`, and
`withdraw-consent`. One case may contain multiple types but keeps a decision and
evidence for each.

State model:

`Received → Identity verification → Scoping → Searching → Review and redaction →`
`Decision → Fulfilment → Quality check → Responded → Closed`

Alternative states are `Waiting for requester`, `Extension proposed`, `Extended
after notice`, `Partially fulfilled`, `Refused with reason`, `On legal hold`,
`Escalated`, and `Overdue`. “Closed” requires a response and immutable evidence, not
merely an internal status change.

Controls:

- received time and 30-day target are immutable; any extension is no more than the
  configured additional 30 days and requires prior notice, reason and approval;
- identity verification is proportionate and its evidence is restricted; Bunood
  does not request unnecessary official-document copies;
- searches use a case-bound subject identity map and approved connectors, with
  positive and negative tenant/company/person checks;
- exports are readable, clear, encrypted in transit/storage, time-limited, audited,
  and exclude other people's data, secrets and internal security material;
- corrections use native document rules and audit history; posted financial or stock
  truth is corrected through the appropriate native amendment/corrective document;
- every exception or refusal cites the reviewed rule, approver, scope and response;
- reminders escalate before the due date and cannot be dismissed without ownership.

## 8. Retention, holds, destruction and anonymisation

Retention is policy-driven by record class and trigger, not one global number. Every
policy has an approved legal/operational source, owner, review date and precedence.
Examples of triggers are contract end, invoice date, employee separation, consent
withdrawal, resolved support case, inactive account, processor termination, or
superseded backup.

Disposition is a controlled job:

1. identify the subject and all in-scope stores;
2. freeze the candidate set and detect legal, audit, dispute, security or operational
   holds;
3. classify each record as destroy, irreversibly anonymise, restrict/retain, or
   correct through native accounting/stock procedure;
4. obtain separation-of-duty approval;
5. execute idempotently across live data, files, search/index/cache, exports, queues,
   logs, replicas, processors and scheduled backup expiry;
6. reconcile business ledgers and permissions;
7. verify non-recovery/non-identification at the appropriate layer; and
8. retain the decision and minimal disposition evidence without recreating the
   destroyed personal data.

Deletion never removes submitted accounting, tax, payment, payroll, stock, ZATCA or
other evidence when an approved obligation or dispute requires retention. Instead,
the case records the restriction, reason, expiry/review and the least identifying
alternative approved by the privacy and domain owners. Pseudonymisation reduces risk
but remains personal data; it is not reported as destruction.

Backups are not edited in place. The policy limits retention, protects access, and
maintains a restoration re-application queue so approved tombstones/restrictions are
re-applied before restored data returns to service.

## 9. Processor and subprocessor governance

No provider receives production personal data until its register entry records:

- controller/processor role and documented instruction;
- exact service, purpose, subject/data categories and duration;
- systems, locations, countries and authorised personnel;
- technical/organisational safeguards and audit evidence;
- incident notification route and timing sufficient for the controller's clock;
- subprocessors, change notification and approval/objection procedure;
- assistance with rights, impact assessment, complaints and breach investigation;
- return/destruction, backup expiry, termination and verification;
- applicable foreign-law exposure and transfer review;
- contract/version, business owner, privacy approver, expiry and periodic review.

Expired, rejected or unknown providers are blocked from new activation. Revocation
includes credentials, tokens, webhooks, scheduled jobs, exports and downstream data
handling, followed by reconciliation and evidence.

## 10. Transfers outside the Kingdom

The transfer register records sender, recipient, processor role, country, data,
subjects, purpose, legal basis, volume/frequency, minimum-necessary justification,
route/safeguard, risk assessment, security, onward transfers, termination and owner.

The product supports recording adequacy, standard contractual clauses, binding
common rules, accredited certification, or another reviewed regulatory route; it
does not infer that a country/provider is acceptable. Continuous/large-scale
sensitive transfers and other cases identified by the current rules require the
documented risk-assessment path. High residual risk blocks activation until the
qualified owner records the lawful resolution or selects an alternative.

## 11. Privacy impact assessment

Every new public feature, material processing change or integration passes triage.
The full assessment records:

- processing description, purpose, necessity and proportionality;
- people, data, sources, recipients, location, scale, frequency and duration;
- sensitive data, children/incompetent persons and systematic monitoring flags;
- rights, financial, discrimination, reputation, safety and confidentiality impacts;
- threats, likelihood, severity, existing and planned controls;
- alternatives and data minimisation;
- processor/transfer/retention/incident dependencies;
- residual risk, owner, DPO/privacy advice, approval and review trigger.

An assessment is not complete while high residual risk lacks a recorded decision and
mitigation. Product release links to the exact assessment version.

## 12. Personal-data breach workflow

`Suspected → Triage → Confirmed/not a breach → Containment → Assessment →`
`Notification decision → Authority/subject notification where approved → Recovery →`
`Corrective action → Review → Closed`

The immutable awareness timestamp starts the internal 72-hour regulatory clock when
the legal threshold may apply. The case captures discovery, occurrence window,
systems, subjects/data/categories/approximate counts, source, access/exfiltration,
containment, risks and impacts, actions, notification decisions, messages,
submissions, residual risk and recurrence prevention.

The security owner cannot close the privacy decision, and the privacy operator
cannot erase security evidence. If information is incomplete, the clock and current
facts remain visible. The system escalates at configured internal milestones; it
does not wait until hour 72 or claim notification merely because a draft was made.

## 13. Security, isolation and evidence

- tenant, company, role and record scope apply to UI, APIs, exports, reports, search,
  attachments, background jobs and evidence storage;
- sensitive fields are masked by default and accessed through a justified,
  time-bound path where appropriate;
- exports and evidence use encryption, expiry, access logging and download limits;
- personal values are removed from telemetry, screenshots and test fixtures unless
  explicitly required and protected;
- encryption keys, provider secrets and reset links never enter browser bundles or
  general logs;
- privacy actions, views, searches, exports, approvals, notices and failures are
  auditable without recording unnecessary personal content;
- request, disposition, transfer and incident jobs are idempotent and resumable;
- every cross-tenant/company/subject negative test is server-side, not a hidden-menu
  assertion.

## 14. Acceptance evidence

KSA-06 remains **Planned** until all of the following pass on the exact candidate:

1. qualified Saudi privacy/legal review of controller/processor roles, rights,
   notices, legal bases, retention, processors, transfers, DPO assessment, impact
   assessment and breach procedures;
2. complete, versioned RoPA for the supported V1 processing scope, with no orphaned
   collector, field, file, export, processor or transfer found by the agreed scan;
3. Arabic and English request journeys for all six rights, including identity
   verification, other-person redaction, extension notice, partial/refused result,
   overdue escalation and immutable response evidence;
4. destruction/anonymisation/retention/hold exercises across live records, files,
   indexes, logs, processors and restored backup, with native GL, Payment Ledger,
   Stock Ledger, tax/ZATCA and payroll integrity unchanged;
5. positive and negative API/UI/export/background-job tests for every privacy role,
   tenant, company and subject scope;
6. processor activation/change/revocation exercise, including subprocessor and
   downstream deletion/return evidence;
7. domestic and outside-Kingdom connector exercises covering minimum data,
   safeguard/risk decision, onward transfer, failure, expiry and suspension;
8. impact-assessment triage plus one full high-risk assessment and blocked-release
   demonstration;
9. breach exercise proving awareness timestamp, internal escalation, 72-hour clock,
   authorised notification decision, evidence preservation, recovery and corrective
   action without claiming an unsent notification;
10. DPO appointment assessment, current contacts, complaint route, training and
    periodic review evidence;
11. accessibility, RTL/LTR, mobile, empty/loading/error/overdue states and printable
    evidence review; and
12. run-owned, de-identified evidence packet with candidate hashes, data fixture,
    cleanup proof, reviewer, exceptions and expiry.

## 15. Approvals and unresolved decisions

| Decision | Required owner | Default status |
|---|---|---|
| Controller/processor role for each processing activity | Customer legal/privacy owner and Bunood legal owner where applicable | Unknown until signed |
| Lawful basis, exception and notice wording | Qualified Saudi legal/privacy reviewer | Unknown until signed |
| Retention periods and holds by record class | Legal, accounting/tax, HR and security owners | Unknown until signed |
| DPO appointment requirement | Qualified privacy/legal owner | Assessment required |
| Processor and subprocessor acceptance | Controller owner, privacy and security | Blocked until approved |
| Transfer route, safeguard and residual risk | Qualified privacy/legal owner | Blocked until approved |
| Breach threshold and notifications | Authorised privacy/legal owner | Case-specific |
| Destruction versus restriction/anonymisation | Privacy plus domain/legal owner | Case-specific |

## 16. Official sources

- SDAIA, [Personal Data Protection Law](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL)
- SDAIA, [Implementing Regulations](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2)
- SDAIA, [Guide to the Saudi PDPL for Controllers and Processors](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP)
- SDAIA, [Personal Data Processing Activities Records Guideline](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PersonalDataProcessingActivities)
- SDAIA, [Personal Data Breach Notification](https://dgp.sdaia.gov.sa/wps/portal/pdp/services/personaldatabreachnotification/)
- SDAIA, [Personal Data Destruction, Anonymization and Pseudonymization Guideline](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PersonalDataDestruction)
- SDAIA, [Rules for Appointing a Personal Data Protection Officer](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/AppointingPersonalDataProtectionOfficer)
- SDAIA, [Regulation on Personal Data Transfer Outside the Kingdom](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom)
- SDAIA, [Risk Assessment Guideline for Transfers Outside the Kingdom](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RiskAssessmentGuideline%20orTransferringPersonalData)
- SDAIA, [Minimum Personal Data Determination Guideline](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/MinimumPersonalDataDeterminationGuideline)
- SDAIA, [Privacy Policy Development Guideline](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/ElaborationandDevelopingPrivacyPolicyGuideline/)

