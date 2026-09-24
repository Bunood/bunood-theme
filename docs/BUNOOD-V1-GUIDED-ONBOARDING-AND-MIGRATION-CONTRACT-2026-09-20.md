# Bunood V1 Guided Onboarding and Migration Contract

**Document date:** 2026-09-20  
**Work orders:** WO-10, WO-11  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Machine control:** `quality/v1-onboarding-migration-control-register.json`  
**Scope:** the first-company journey, business-data migration, opening-data cutover,
and the first reconciled transaction.  
**Exclusion:** this contract does not prove that onboarding or a migration has been
accepted on a release candidate.

## 1. Product promise

Bunood must let a Saudi small-business administrator reach a useful, correct first
invoice without learning ERPNext implementation vocabulary. It must also let an
experienced implementer migrate approved data without obscuring source totals,
duplicates, errors, permissions, or ledger impact.

The experience has two layers over one native data model:

- **Guided:** asks business questions, explains consequences, proposes safe defaults,
  and shows only the next useful decision.
- **Expert:** exposes mappings, native records, controls, reconciliation, evidence,
  and recovery without creating a second system of record.

Both layers write the same authorised ERPNext records. The guided layer may simplify
language and sequence; it may not weaken accounting, tax, stock, permission, privacy,
or audit rules.

## 2. Non-negotiable boundary: three different changes

The word “migration” must never combine these three operations:

1. **Business-data migration** maps legacy customers, suppliers, items, balances,
   and open transactions into native ERPNext records.
2. **Site transfer** moves an existing Frappe site through database and file backup
   and restore.
3. **Software/version upgrade** changes Frappe, ERPNext, Bunood, app schemas, patches,
   assets, translations, and compatibility.

Each has its own scope, owner, rehearsal, evidence, and rollback decision. A successful
site restore does not prove the business data reconciles. A successful data import
does not prove a version upgrade. A successful `bench migrate` does not approve any
opening balance.

The software/version path follows sequential supported upgrades, full database and
file backup, staging restore, custom-code and breaking-change review, schema migration,
representative task tests, rollback rehearsal, and production change control. Major
versions are not skipped merely to shorten the project.

## 3. Native authority and prohibited shortcuts

ERPNext remains authoritative for Company, Chart of Accounts, parties, Items,
Warehouses, prices, invoices, stock, assets, payments, General Ledger, Payment Ledger,
Stock Ledger, and reports.

The following are prohibited:

- a parallel Bunood ledger, stock balance, outstanding balance, or master-data truth;
- editing generated GL, Payment Ledger, or Stock Ledger rows as an import shortcut;
- calling a row imported when its transaction or batch rolled back;
- treating a preview, uploaded file, queued job, or created draft as reconciled;
- silently submitting transactions or overwriting submitted records;
- treating “skip” or “not applicable” as complete without a reason and authorised
  owner;
- importing historical GL rows blindly when an opening-summary strategy was approved;
- using display names alone to match parties or items;
- declaring cutover complete from record counts while value, currency, ageing, stock,
  or control-account totals differ; and
- using production secrets or unrestricted personal data in a staging environment.

## 4. Accountable roles

| Role | Owns | Cannot self-approve |
|---|---|---|
| Business owner/sponsor | Scope, go-live outcome, accepted gaps, cutover decision | Accounting or tax accuracy without the qualified reviewer |
| Implementation lead | Plan, dependency order, run control, handoff | Source-data ownership or final finance sign-off |
| Data owner | Source extraction, meanings, completeness, legacy references | Accounting treatment |
| Finance reviewer | Chart, opening AR/AP, Trial Balance, cash/bank, dimensions | Their own unreviewed transformation exceptions |
| Inventory reviewer | UOM, item identity, warehouse, quantity, valuation, serial/batch | Financial opening without finance review |
| Tax and ZATCA reviewer | VAT identity, tax templates, invoice output and environment readiness | Invented or unapproved legal data |
| Security and privacy reviewer | Access, transfer, staging, retention, deletion, evidence handling | Business totals |
| System administrator | Site, backup/restore, jobs, access implementation | Business acceptance |
| Support/auditor | Evidence completeness, unresolved issues, support handoff | Change production data by reviewing it |

One person may hold several roles in a small organisation, but the run packet records
which role they exercised. Material opening balances require a distinct preparer and
reviewer even when the business is small.

## 5. The first-use journey

### 5.1 Start with the job, not the module tree

The first screen asks what the business needs to do first:

- sell products at a counter;
- issue service or B2B invoices;
- buy and manage stock;
- keep books and collect payments; or
- migrate from another system.

The choice selects a starter sequence. It never removes native capabilities or
commits legal, tax, accounting, or valuation choices.

### 5.2 Twelve readiness domains

The overview groups decisions by consequence rather than ERP terminology:

1. company identity, branch, language, currency, timezone and fiscal year;
2. Chart of Accounts, dimensions, default receivable/payable/income/expense accounts;
3. VAT, ZATCA environment, tax templates and legally approved output identity;
4. warehouses, perpetual inventory, valuation, UOM, serial and batch policy;
5. items, barcodes, price lists, discounts and commercial policy;
6. customers, suppliers, payment terms, credit and party identity;
7. cash, banks, payment methods, clearing accounts, POS profiles and devices;
8. users, roles, company/warehouse scope, approvals and segregation;
9. Arabic/English print, numbering, email and communication delivery;
10. privacy, backups, restore, security, retention, support and audit access;
11. integrations, credentials, environment ownership and failure handling; and
12. first test transaction, print, payment, statement, reversal and handoff.

Every domain reports one of: `not-started`, `ready`, `in-progress`, `needs-review`,
`blocked`, `at-risk`, `complete`, `accepted`, `not-applicable-with-reason`, or
`reopened`.

The overview never shows a reassuring percentage by itself. It shows:

- **Can operate now:** journeys whose blockers have passed;
- **Cannot operate yet:** exact consequence and owner;
- **Needs qualified review:** tax/accounting/legal decisions;
- **Recommended:** non-blocking improvements; and
- **Evidence age:** when the underlying configuration was last checked.

#### Implemented Start slice — candidate evidence, not acceptance

Home now renders one bilingual first-use spine for the native sequence Company →
Customer → Item → submitted Sales Invoice → submitted Payment Entry. The server
derives every milestone from a persisted record visible to the current user, checks
native read/create permission, exposes one current action, explains unavailable or
permission-blocked states, and hides the guide after all five milestones exist. It
does not write business state, create a parallel setup record, display a completion
percentage, or claim tax, ZATCA, print, migration, accounting, or launch readiness.

Directly below that spine, one compact bilingual disclosure maps all twelve contract
readiness domains. It uses narrow, permission-filtered observations from native
Company, Account, Cost Center, Warehouse, Item, Price List, Customer, Supplier, Mode
of Payment, POS Profile, User, tax template, Print Format, Sales Invoice and Payment
Entry records plus the credential-free ZATCA status facade. Privacy, backup, security,
support and integration evidence remains explicitly external rather than inferred
from database presence. Required query failure is a blocking check failure, not an
empty-state success; conditional stock absence requests applicability review; and
accounting, tax/ZATCA, parties, payments, access, output and the first transaction
always require qualified review. The disclosure never computes a percentage or
returns a `launch_ready` pass, and states that it is not tax, ZATCA, accounting or
launch approval.

Each row is now operational rather than merely descriptive: it names the responsible
business role, states the consequence of leaving the finding unresolved, and exposes
`Open setup` only when the server confirms native create/write permission; otherwise
the same safe route is labelled `View details`. These are permission-filtered route
affordances, not authorization shortcuts.

An explicitly started work plan turns the twelve observations into accountable native
work without creating a second ERP ledger. Bunood creates exactly one ERPNext
`Project` per company and one native `Task` per readiness domain. Stable hidden
company/domain identities make repeated or concurrent create requests idempotent.
The task uses native status, due date and priority; `Assign To` remains Frappe's linked
`ToDo`; comments and `File` attachments remain native evidence. Home reads the Project,
Tasks, `_assign` and visible attachments with permission-filtered `get_list` calls and
shows separate setup and work actions. Runtime creation uses the current user's native
Company, Project and Task permissions and never uses `ignore_permissions`.

This boundary is deliberate: completing a Task records operational progress only. It
does not accept tax, ZATCA, accounting, security, migration or launch readiness. The
separate decision layer is now implemented as the narrow, submittable `Bunood
Readiness Review` receipt rather than another work ledger. A user must hold the
explicit `Bunood Readiness Reviewer` permission and, for `Accepted` or `Not
Applicable`, record their authority/qualification basis and an evidence reference.
The server binds the submitted decision to the exact site, Bunood version and asset
hashes, native Project/Task state, visible Task File/Comment references and declared
candidate; SHA-256 candidate and receipt digests preserve that snapshot.

Receipts form one append-only chain per Task. A current `Accepted` or `Not Applicable`
decision must be followed by a submitted `Reopened` receipt before another decision;
submitted receipts cannot be cancelled or edited. Home compares the latest visible
receipt with the current candidate and reports it as current, stale/reopen-required,
or not verifiable to the current viewer. The record is still one qualified domain
decision, not whole-launch approval, and no code path returns `launch_ready`. If
ERPNext Project/Task, the migration-installed identity fields or the review DocType is
unavailable, the relevant action stands down and the observation-only disclosure
continues to work.

Native-source basis checked 2026-09-20: ERPNext documents that a
[Project](https://docs.frappe.io/erpnext/project) is divided into Tasks and supports
assignment; the native [Task](https://docs.frappe.io/erpnext/tasks) lifecycle includes
Open, Working, Pending Review, Overdue, Completed and Cancelled; Frappe
[Assign To](https://docs.frappe.io/framework/assignments-and-todos) creates a linked
ToDo; and [attachments](https://docs.frappe.io/framework/user/en/desk/attachments)
remain attached to the protected document. Those capabilities are reused rather than
reimplemented.

The implementation is guarded by `tests/test_start_readiness.py`,
`tests/test_launch_readiness.py`, `tests/test_readiness_work.py`,
`tests/start-readiness.test.cjs`, `tests/launch-readiness.test.cjs` and
`tests/readiness-work.test.cjs`, `tests/readiness-review.test.cjs` and their Python
policy tests, and is compiled into the candidate assets. It is still an unaccepted
WO-10 implementation slice: a fresh permitted administrator and genuinely qualified
reviewers must assign every applicable Task, attach/review real evidence, submit and
reopen receipts where required, complete the print/statement/reversal outcome, and
produce the Arabic/English candidate receipt without developer intervention.

### 5.3 Step anatomy

Every guided step contains:

1. the business question in plain Arabic or English;
2. why it matters and what changes downstream;
3. the proposed value and its source;
4. the required owner and permission;
5. a preview of affected native records;
6. validation and blocking/warning distinction;
7. Save and continue, Save and exit, and Review later where safe; and
8. help, audit detail, and recovery route.

Progress is stored server-side, survives refresh/device/language changes, and is
derived from the actual protected record whenever possible. A user without change
permission sees the blocker and responsible owner but cannot alter the setting.

### 5.4 Starter profiles

Starter profiles may propose common Saudi retail, service, wholesale, or professional
services settings. A profile must list every proposed native record and classify it:

- operational default, which may be accepted in bulk;
- accounting decision, which requires finance review;
- tax/legal decision, which requires authorised review;
- security/privacy decision, which requires explicit owner; or
- external credential, which Bunood never invents.

Applying a profile is idempotent, produces a diff, and never replaces existing
transactions or approved configuration silently.

### 5.5 First useful outcome

Onboarding is not accepted because a checklist disappeared. A fresh administrator
must, without developer intervention:

1. create or confirm a customer and an Item/service;
2. create a valid draft invoice;
3. submit it when the scenario permits;
4. view the tax and accounting consequence;
5. print Arabic and English outputs;
6. record or simulate the approved payment path;
7. see the customer outstanding/statement effect;
8. reverse or remove test-only data through the documented native path; and
9. know where support, backup and audit evidence live.

## 6. Migration strategy decision before any file is loaded

The implementation record states:

- cutover date and exact time boundary;
- companies, branches, currencies, warehouses and modules in scope;
- source systems and authoritative owner for each dataset;
- **opening-only**, **open-transactions plus opening**, or **approved history** strategy;
- history retained as read-only archive and its access/retention owner;
- source timezone, date convention, decimal/rounding rules and encoding;
- accounting, stock and tax reports that must reconcile;
- late-transaction and delta policy;
- freeze window and production change owner; and
- rollback point and maximum tolerated outage/data loss.

The default is opening master/open transaction data plus an accessible read-only
legacy archive. Full transactional history is imported only when a named business or
legal need outweighs the cost and reconciliation risk.

### 6.1 Implemented mapped-packet slice — scope evidence, not migration acceptance

`Bunood Migration Run` now provides a bilingual, submittable planning surface with
separate Scope, Datasets, Cutover and recovery, and Frozen packet tabs. A draft can be
saved while it is being assembled. Submission requires named business,
implementation, security/privacy and rollback owners; strategy and source
conventions; source freeze and recovery boundaries; duplicate, delta, archive and
retention policies; and at least one dependency-ordered dataset. Each dataset binds a
source entity and row count to a lowercase SHA-256 source snapshot, mapping version,
manifest, profiling evidence, data owner and native load path. Material opening data
also requires approved control totals and a reviewer distinct from the submitter.

Submission freezes a canonical `mapped` snapshot plus scope and receipt SHA-256
digests. Submitted packets cannot be edited or cancelled; a changed source, mapping,
candidate or policy requires a new packet. The snapshot intentionally contains
references and hashes, not uploaded business data, credentials or a shadow staging
ledger. The explicit `Bunood Migration Manager` role authorizes this packet only and
does not grant target-DocType import rights.

For datasets whose approved native path is Frappe Data Import, the submitted packet
can create or reuse an empty native `Data Import` draft. The server rechecks current
read access to the packet and company, create access to `Data Import`, and native
`import` permission on the target DocType. It attaches no file, uses no permission
bypass, and never calls Start Import. The returned state explicitly says that preview,
import, reconciliation and acceptance are false. Frappe then remains responsible for
target validation, file parsing/preview and the separately triggered background
import.

This is a bounded WO-11 foundation, not a promoted migration product. Real-source
duplicate effectiveness, opening-data reconciliation, cutover, restore/rollback and
migration acceptance remain incomplete and require the controlled clean and dirty
rehearsals in sections 10 through 17.

### 6.2 Implemented isolated-rehearsal slice — native result receipt, not production authority

A submitted mapped packet can now start one guarded rehearsal only when the current
site and one-way database-name digest differ from the source identity frozen in that
packet and the restored clone explicitly opts in with the site configuration
`bunood_migration_rehearsal=1`. The guard rechecks the current user's packet,
company, target-DocType import, and native Data Import permissions. It rejects live
Google Sheet sources because their exact bytes cannot be proven, reads the attached
CSV/XLS/XLSX through the permission-checked native File record, recomputes SHA-256,
and refuses to start if it differs from the frozen dataset hash.

The rehearsal deliberately calls Frappe's native `Data Import.start_import()` on the
isolated clone; it does not implement another importer or treat the Data Import
preview as business validation. `Bunood Migration Rehearsal` records the exact
packet, dataset, Data Import, environment identities, candidate, immutable result and
receipt digests, and a privacy-minimised child result for every native import log row.
Capture uses the native permission-checked import status and log APIs. Only a
terminal, non-empty, wholly successful native run can become `dry-run-validated`.
Partial, failed, timed-out, inconsistent, or more-than-5,000-log runs fail closed as
an exception requiring controlled batching.

The submitted receipt stores row number, Success/Failure, Insert/Update, and one-way
message and target-record digests. Raw errors and record names remain in the native
Data Import log; they are not duplicated into the Bunood receipt. Submitted receipts
cannot be edited or cancelled, and manual issue/edit routes are blocked. The receipt
explicitly grants no production import, reconciliation, cutover, rollback, or
migration-acceptance authority.

Each new Data Import dataset must now cite controlled evidence for its stable
business-identity rule and select an explicit duplicate disposition that exactly
matches the native import type: insert rejects existing matches, update changes only
approved matches, and mixed import inserts unmatched rows while updating approved
matches. Display names alone are explicitly insufficient. Starting the exact same
packet/file/import identity returns the existing rehearsal instead of enqueueing a
second job. From an exception receipt, a permitted operator can create a new draft
packet with predecessor, receipt-digest and correction-reason lineage; the predecessor
remains immutable and submission fails unless source hash, mapping, identity rule,
duplicate decision or relevant control evidence materially changes. This implements
duplicate-decision and corrected-retry controls, not proof that a particular source
identity rule found every duplicate. Corrected-row extraction remains in the native
Data Import authority: a submitted exception receipt with failed rows now exposes a
permission-checked download that re-verifies the isolated site/database, packet,
native Data Import, target import permission and unchanged attached-file hash before
delegating to Frappe's native `download_errored_template`. Bunood does not construct
or parse a replacement workbook and does not proxy the sensitive raw import log. The
operator corrects the downloaded source rows, then creates a materially changed
frozen packet on the source site using the exception receipt digest. Real clean/dirty
operator acceptance, duplicate effectiveness and reconciliation remain open.

## 7. Controlled migration lifecycle

The lifecycle is explicit and reversible until acceptance:

1. `scoped` — boundaries, owners, strategy and sign-offs are named;
2. `source-frozen` — source snapshot and late-entry log are controlled;
3. `extracted` — immutable files, row counts, hashes and export parameters recorded;
4. `profiled` — encoding, empties, invalid values, duplicates and distributions known;
5. `mapped` — source-to-native field/value rules versioned;
6. `dry-run-validated` — validation completed without persistent business mutation;
7. `approved-for-load` — named reviewers approve the run version;
8. `importing` — one controlled batch/run identifier is active;
9. `exception` — processing stopped or continued only under the approved batch policy;
10. `imported-unreconciled` — committed records exist but are not yet accepted;
11. `reconciled` — all required control totals and samples match;
12. `accepted` — owners sign the immutable run packet;
13. `rolled-back` — run-owned changes were reversed or the pre-run site restored; or
14. `superseded` — a later approved run replaces the evidence, without deleting it.

No state transition is inferred from elapsed time. The UI always distinguishes
uploaded, validated, queued, committed, reconciled and accepted.

## 8. Dependency-ordered native loading

The approved sequence is:

1. Company, fiscal year, currency, naming and legal identity;
2. Chart of Accounts, accounting dimensions, tax accounts and defaults;
3. UOM, groups, warehouses and operational dimensions;
4. customers, suppliers, addresses, contacts and payment terms;
5. items, variants, barcodes, serial/batch policy and BOM dependencies;
6. price lists, Item Prices and commercial policies;
7. opening stock through native Stock Reconciliation/approved stock documents;
8. opening receivables/payables through the Opening Invoice Creation Tool or an
   explicitly approved native alternative;
9. cash, bank, advances and remaining Trial Balance openings without double-counting
   party control accounts;
10. assets and other approved modules; and
11. users, permissions, integrations and operational queues after their dependencies.

The sequence may be extended, but not reordered without a documented dependency
decision. Run the Trial Balance after each financial opening stage so a difference is
isolated to the current batch.

## 9. Source identity, duplicate decisions and idempotency

Every input row carries:

- source system, source entity and immutable source key;
- source snapshot hash, row hash and mapping-rule version;
- natural identifiers such as VAT/CR, account code, barcode, item code, email or
  phone only where appropriate;
- normalized Arabic/English names as search signals, never sole identity;
- candidate native record and match reason/confidence;
- approved decision: create, update, link, merge, reject or defer;
- resulting native DocType/name and audit reference; and
- run, batch, actor, timestamp and final state.

Rows can be `validated`, `warning`, `blocked`, `duplicate-candidate`,
`skipped-with-reason`, `imported`, `rejected`, `rolled-back`, or `reconciled`.

Retry uses the run identity, row hash, mapping version and resulting native identity.
An identical retry neither creates a duplicate nor silently changes the approved
record. A changed row or mapping produces a new version and explicit diff. When a
batch transaction rolls back, no row in that transaction is reported as imported.

## 10. Dry run and error experience

Dry run performs the same parsing, mapping, permission, reference, type and business
validation as the load path while prohibiting persistent business-state mutation.
Its result includes:

- source and accepted row counts;
- create/update/link/duplicate/reject predictions;
- row and column location with bilingual explanation;
- affected native DocType and protected fields;
- totals by company, currency, party, account, item and warehouse where relevant;
- expected accounting/stock impact;
- downloadable corrected-error workbook without secrets; and
- run expiry when source/configuration changes make the preview stale.

Errors are actionable: what is wrong, why it matters, who can fix it, and whether a
new dry run is required. Valid rows are never labelled imported during preview.

## 11. Reconciliation control matrix

Every comparison uses the same company, currency, sign convention and cutover time.
The source owner signs the source total; the native report and filters are preserved.

| Domain | Source control | Native evidence | Acceptance rule |
|---|---|---|---|
| Customers/suppliers | distinct identity and active/inactive counts | Party lists and samples | counts plus every exception disposed |
| Items/barcodes/UOM | identities and attribute counts | Item/Barcode/UOM records | no unresolved identity or conversion conflict |
| Prices | item, UOM, currency, validity and price-list totals | Item Price list/report | exact row/value scope and dates |
| Opening stock | item/warehouse/batch quantity and value | Stock Ledger and Stock Balance | exact quantity/value by named dimensions |
| Receivables | invoice, party, currency, due date, outstanding and ageing | Accounts Receivable and Payment Ledger | exact totals, counts and ageing buckets |
| Payables | invoice, party, currency, due date, outstanding and ageing | Accounts Payable and Payment Ledger | exact totals, counts and ageing buckets |
| Trial Balance | account/dimension/currency debits and credits | Trial Balance and General Ledger | debit equals credit and every mapped line agrees |
| Cash/bank/advances | account/currency balance and open allocation | GL, bank and advance reports | exact controlled balance, no duplicated control account |
| Assets | asset/cost/depreciation/net book value | Asset records, depreciation and GL | exact approved opening and schedule |
| VAT/tax | approved opening liabilities/receivables and source schedules | tax accounts and reports | exact approved scope; no invented filing state |
| Cross-ledger | source document to party, stock and GL | native document/ledgers | traceable chain with no orphan or direct ledger edit |

Record counts are diagnostic, not financial acceptance. Every non-zero variance has
an owner, cause, action, approval and rerun reference.

### 11.1 Implemented reconciliation-evidence slice — not accounting acceptance

After every native Data Import dataset in a mapped packet has exactly one submitted
successful rehearsal on the same isolated site/database, a permitted operator can
prepare a `Bunood Migration Reconciliation`. It binds the frozen run scope and every
successful rehearsal receipt/result/file digest, then preloads the eleven domains
above as a calm accountant-facing control table. The starter rows are summaries;
the form explicitly requires added rows for relevant company, account, currency,
party, item, warehouse, batch, ageing and accounting-dimension slices.

Each applicable row records an exact decimal source value, matching native value,
unit, protected source reference, native report/document/ledger reference and the
full filters required to reproduce it. Binary floating-point storage is avoided.
The server derives `Exact`, `Variance`, `Pending` or `Not Applicable`; non-zero
variances require owner, cause, corrective action and rerun reference, while every
excluded control requires a reason. All eleven domains must be represented and at
least one control must be applicable. Material opening data requires a submitting
reviewer different from the packet preparer.

Submission produces an immutable candidate/environment/rehearsal/control snapshot
and SHA-256 receipt. A zero-variance receipt is `reconciled`; an owned non-zero
result is an `exception`, not a pass. The receipt never queries around native report
permissions, edits generated ledgers, calculates a parallel ledger, or authorizes
production load, cutover or migration acceptance. Real accountant execution on the
clean and dirty fixtures, report-output retention, exact opening reconciliation and
qualified sign-off remain acceptance evidence—not conclusions inferred from this
structure.

## 12. Cutover, rollback and hypercare

### 12.1 Cutover

The runbook records source freeze, final delta extraction, backup hash, access freeze,
load order, control reports, smoke journeys, decision meeting and communication. The
go/no-go decision occurs before the rollback window expires.

Required smoke journeys include login/role scope, party and Item search, first valid
invoice, tax, stock where applicable, payment/outstanding, print, Trial Balance and
queue/worker health.

### 12.2 Rollback

Before production import, take and verify a database plus public/private files backup.
Rehearse restoration in a non-production environment. Rollback chooses one controlled
method:

- cancel/delete only run-owned native records in reverse dependency order where safe;
- restore the complete pre-run site; or
- post an approved native correction when submitted activity after cutover makes
  restoration unsafe.

Partial deletion, direct ledger repair and mixing old/new production activity are not
acceptable rollback strategies.

### 12.3 Hypercare and handoff

For the declared support window, Bunood tracks rejected jobs, queues, balances,
duplicate attempts, access anomalies, user questions and configuration changes. The
handoff includes owners, service hours, severity routes, known gaps, archive access,
backup/restore procedure, mapping package, reconciliation pack and expiry/renewal of
any external credentials.

## 13. Privacy and security

- Stage only the minimum necessary fields; de-identify test data where possible.
- Never copy production credentials, encryption keys or unrestricted attachments into
  ordinary staging.
- Encrypt transfer and storage; restrict source files, rejected rows and evidence by
  role and company.
- Log downloads and privileged actions without logging secrets or full sensitive
  values.
- Declare retention and verified deletion for raw extracts, working files, failures,
  backups and evidence.
- Test that an implementation user cannot see another company/site and that a normal
  operator cannot run imports, change mappings or accept reconciliation.
- Keep immutable source/run hashes while disposing of unnecessary personal content
  under the approved privacy policy.

## 14. Interaction and visual contract

The onboarding and migration UI follows Bunood’s universal product grammar:

- one calm overview, not a wall of green cards or decorative pills;
- a visible current step and consequences before settings terminology;
- restrained decision cards only when choices are genuinely exclusive;
- tables for mappings and row exceptions; summary plus drill-down for reconciliation;
- names prominent and source/native identifiers secondary but always available;
- Arabic/English parity, correct RTL/LTR ordering and mixed identifier isolation;
- desktop mapping/reconciliation and usable mobile overview/approval, without forcing
  dense spreadsheet editing onto a phone;
- persistent save/resume, visible focus, keyboard flow, 200% zoom/reflow and clear
  loading/error/retry states; and
- no progress animation or success colour before the server truth is known.

## 15. Acceptance gates

The contract is accepted only when all of these pass on the exact candidate:

1. A fresh permitted administrator completes readiness and reaches the first useful
   transaction without developer intervention in Arabic and English.
2. A non-privileged user sees consequences and ownership but cannot change protected
   setup or import data.
3. One clean migration rehearsal and one dirty/error-heavy rehearsal complete on
   production-like, de-identified data.
4. The dirty run proves duplicate decisions, UTF-8 Arabic, leading zeros, long text,
   dates, currencies, UOM, rounding, invalid references and partial/batch rollback.
5. Identical retry is idempotent; changed data/mapping produces a reviewed diff.
6. Opening stock, AR, AP, cash/bank, Trial Balance, assets and VAT reconcile exactly
   for every applicable domain.
7. First invoice/payment/print/statement and reverse/correction paths reconcile after
   cutover.
8. Backup and complete restore/rollback meet the named RPO/RTO on the supported host.
9. Permission, company/site isolation, export, evidence and retention negative tests
   pass.
10. The immutable candidate-bound run packet contains the twelve evidence groups in
    the machine register and all external approvals.

Two structural checks cannot promote this work: a valid JSON contract is not an
onboarding usability receipt, and a successful import job is not migration acceptance.

## 16. Measures

Track by business archetype, language and implementer without exposing customer data:

- median/p90 time to first valid invoice;
- blocker rate, abandonment step and support contacts before first outcome;
- readiness checks reopened within 30 days;
- source rows, first-pass validation rate and corrections per dataset;
- duplicate candidates and disposition time;
- imported/rejected/rolled-back counts with no impossible state combinations;
- reconciliation variance and time to zero;
- idempotent retry and rollback success rate;
- implementation hours and elapsed cutover time;
- first-week user errors, support contacts and unresolved severity; and
- backup/restore duration and evidence completeness.

Targets are baselined in pilots; Bunood must not invent “industry average” thresholds.

## 17. Official implementation anchors

These sources define native capability, not Bunood acceptance:

- [ERPNext Data Import](https://docs.frappe.io/erpnext/data-import) — templates,
  validation, warnings, insert/update and import logs.
- [Chart of Accounts Importer](https://docs.frappe.io/erpnext/chart-of-accounts-importer)
  — preview and the destructive risk of replacing an unused company chart.
- [Opening Invoice Creation Tool](https://docs.frappe.io/erpnext/opening-invoice-creation-tool)
  — outstanding AR/AP rather than historical item/stock detail.
- [Stock Reconciliation](https://docs.frappe.io/erpnext/stock-reconciliation) — native
  opening stock and stock-ledger verification.
- [Opening and Closing During Migration](https://docs.frappe.io/erpnext/opening-and-closing)
  — dependency order, staged Trial Balance checks and accepted-period freeze.
- [Frappe backup](https://docs.frappe.io/framework/user/en/bench/reference/backup),
  [restore](https://docs.frappe.io/framework/user/en/bench/reference/restore), and
  [migrate](https://docs.frappe.io/framework/user/en/bench/reference/migrate) — site
  protection and software/schema operations.

## 18. External approvals before production

The owner and qualified reviewers must approve the company/legal identity; accounting
policy and opening strategy; tax/ZATCA configuration; warehouse/valuation/UOM rules;
party/item identity and duplicate policy; source totals and archive; access and
segregation; privacy/retention/transfer; cutover, rollback, RPO/RTO and support; and
the final reconciliation/run packet.

Until that evidence exists, WO-10 and the bounded WO-11 mapped-packet and isolated-
rehearsal slices remain implemented with acceptance incomplete. This contract
narrows implementation and prevents false completion; it is not a release or
migration receipt.
