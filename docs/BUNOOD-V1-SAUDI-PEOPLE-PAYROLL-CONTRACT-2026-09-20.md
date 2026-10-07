# Bunood V1 Saudi People and Payroll Contract

**Document date:** 2026-09-20  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Work-order owners:** HR-01 through HR-05  
**Machine control register:** `quality/v1-saudi-payroll-control-register.json`  
**Status:** product and operating requirements; not legal, payroll, tax or social-
insurance advice, not a government-interface approval, and not an acceptance receipt

## 1. Decision

Bunood V1 will provide one explainable Saudi employment-to-payment chain over native
Frappe HR/ERPNext records:

`approved employment terms → effective salary assignment → approved time/leave and`
`other inputs → calculated payslip → reviewed payroll → accounting accrual → bank/WPS`
`output → external acknowledgement/payment → GOSI wage and liabilities → GL and`
`employee balances`.

An employee receives simple self-service. A manager receives only their team's
actions. HR and payroll specialists receive dense validation, variance and batch
tools. Finance receives reconciled accounting results without unnecessary access to
individual salary detail. They all use the same Employee, contract reference,
Salary Structure Assignment, Payroll Entry, Salary Slip and accounting records.

Bunood does not decide the applicable Labour Law treatment, contribution regime,
wage basis, allowance classification, overtime/leave formula, deduction legality,
end-of-service amount or government filing. Those choices are versioned
configuration reviewed by authorised Saudi HR, payroll, legal and accounting owners.

## 2. Current official baseline and product consequences

Official material was reviewed on the document date. Rules and interfaces change;
the release must reverify them before implementation or promotion.

| Official fact | Bunood consequence |
|---|---|
| HRSD's documented-contract guidance says Qiwa sends the contract to the worker, who can approve, reject or propose amendments. The enforceable wage clause identifies basic salary, housing allowance, transportation allowance and other cash allowances. | Bunood stores the external contract/reference, employee decision, wage components, effective dates and evidence. “Sent” is not “accepted,” and internal salary assignment cannot silently diverge from the accepted contract. |
| The same guidance explains that Wage Protection data is used to verify wage payment for the enforceable-contract process. It currently states different elapsed periods for full non-payment and partial payment, plus an objection route. | Contract wage, payroll net, bank/WPS amount, external status and paid amount are a per-employee reconciliation chain. Time-based alerts are versioned regulatory configuration, not hard-coded permanent law or a legal conclusion. |
| The Wage Protection Programme monitors whether private-sector employees, Saudi and non-Saudi, are paid on time and at the agreed value. HRSD also exposes a wage-protection certificate through Qiwa. | File generation is only `generated`. Bunood records submission, acknowledgement, rejection/correction and certificate/evidence separately and never invents government acceptance. |
| GOSI exposes monthly wage update through list or file upload. The current social-insurance landscape includes existing and new-system populations with transition rules and contribution changes. | The rules engine selects an effective-dated reviewed rule pack by employee classification and coverage. One global GOSI percentage is prohibited. Registered/contributory wage, employer share, employee share and liability remain explicit. |
| HRSD published amended Labour Law implementing regulations effective in February 2025 and provides an official end-of-service calculator while warning that the automated result is not the Ministry's responsibility. | End-of-service is a governed final-settlement worksheet with source articles/rule version, dates, reason, wage basis, leave, notice, deductions, reviewer and comparison evidence—not an unconditional “legally correct” result. |
| Frappe HR processes payroll through effective Salary Structure Assignments, draft Salary Slips and Payroll Entry. Submitted slips create salary accrual accounting; creating a bank entry does not itself transfer money. | Bunood orchestrates native documents. It distinguishes calculated, accrued, bank-file generated, externally submitted, accepted, paid and reconciled instead of calling all of them “paid.” |

Primary references:

- [HRSD documented employment contract as an enforceable instrument](https://www.hrsd.gov.sa/sites/default/files/2025-10/aldlyl-ala-rshady-lmbadrt--qd-al-ml-almwthq-sndana-tnfydhyana---en.pdf)
- [HRSD Wage Protection certificate service](https://www.hrsd.gov.sa/en/ministry-services/services/%D8%A3%D8%B5%D8%AF%D8%A7%D8%B1-%D8%B4%D9%87%D8%A7%D8%AF%D8%A9-%D8%AD%D9%85%D8%A7%D9%8A%D8%A9-%D8%A7%D9%84%D8%A3%D8%AC%D9%88%D8%B1)
- [GOSI Wage Protection Programme](https://www.gosi.gov.sa/GOSIOnline/Wages_Protection_Program)
- [GOSI monthly wage update](https://beta.gosi.gov.sa/ar/services/business/Wage_Update_)
- [GOSI new-system awareness journey](https://awareness.gosi.gov.sa/businessJourney.html)
- [HRSD Labour Law implementing-regulation announcement](https://www.hrsd.gov.sa/si/node/5573537)
- [HRSD end-of-service calculator](https://www.hrsd.gov.sa/en/ministry-services/services/end-service-benefit-calculator)
- [Frappe HR Payroll Entry](https://docs.frappe.io/hr/payroll-entry),
  [Salary Structure Assignment](https://docs.frappe.io/hr/salary-structure-assignment),
  [Salary Slip](https://docs.frappe.io/hr/salary-slip) and
  [Attendance](https://docs.frappe.io/hr/attendance)

## 3. Product boundary and roles

| Role | Default experience | Authority boundary |
|---|---|---|
| Employee | Own profile, contract status, leave/time/expense requests, payslips and questions. | Never sees another employee or unrestricted payroll data. |
| Manager | Team requests, missing inputs and approval work. | Only assigned hierarchy/scope; cannot edit payroll formulas or approve their own claims. |
| HR operator | Employee lifecycle, contract metadata, leave, attendance and documents. | Does not approve payroll or government submissions merely through HR access. |
| Time and attendance operator | Device/import exceptions, shift/attendance corrections and source evidence. | Cannot change compensation or finalise payroll. |
| Payroll preparer | Input freeze, calculation, variance, corrections, draft outputs and evidence. | Cannot self-approve a controlled payroll run. |
| Payroll reviewer/approver | Rule-pack, exception, variance, final-settlement and payroll approval. | Cannot bypass server permissions or alter accepted evidence invisibly. |
| Finance accountant | Accrual, liabilities, payment/clearing and GL reconciliation. | Aggregated access by default; individual pay only when authorised. |
| Compliance integration operator | Validates and transmits approved WPS/GOSI/Qiwa-facing payloads through authorised channels. | Technical credentials do not confer payroll or legal approval. |
| Auditor | Read-only source-to-output trace, versions, approvals and exceptions. | Cannot calculate, post, submit, correct or approve. |
| System administrator | Availability, jobs, secrets, backups and technical access. | Administrator is not HR, payroll, legal or finance approver by default. |

All scopes are enforced server-side across records, files, comments, notifications,
exports, reports, API responses, cached data and search. Hiding a field or menu item is
not an authorisation boundary.

## 4. People and payroll workspace

The **People and payroll / الموظفون والرواتب** workspace has seven stable sections:

1. **My work:** employee requests, own documents, leave/time/expense status,
   payslips and clear next actions.
2. **Attention:** missing contracts/assignments/accounts/bank data, overlapping or
   late inputs, invalid attendance, unapproved changes, large variances, rejected
   external files and unreconciled liabilities.
3. **People:** lifecycle, establishment/company/branch, job, manager, dates, contract
   status, documents and privacy controls.
4. **Time and expenses:** shifts, attendance, leave, overtime inputs, claims,
   advances, corrections and approvals.
5. **Payroll:** periods, assignments, input freeze, calculation, salary slips,
   comparison, review, accrual and payment outputs.
6. **Saudi statutory operations:** Qiwa references, Wage Protection, GOSI wage and
   contributions, validation, submission, response, correction and evidence.
7. **Reconciliation and audit:** employee chain, control totals, GL, liabilities,
   external acknowledgements, access history and retained run packets.

The workspace shows action and exceptions before charts. It never displays a single
“compliance percentage” that hides unknown, stale, rejected or not-applicable cases.

## 5. Employee identity, employment and contract bridge

Each employment record is scoped to one legal Company and, where applicable, its
Saudi establishment/branch identifiers. It links the person and user without
assuming that a login is the legal employee identity.

Required governed data includes:

- employee and employment identifiers, nationality/residency classification and
  applicable coverage decision;
- legal employer, establishment, branch, department, designation, manager and cost
  dimensions;
- join, probation, contract start/end/renewal and termination dates/reasons;
- Qiwa contract/reference, status, version, sent/employee-decision/effective dates
  and retained evidence;
- basic, housing, transport and other cash allowance terms plus currency/frequency;
- Salary Structure Assignment and every effective-dated amendment;
- payroll bank identity under restricted permission and change verification;
- GOSI contributor/coverage/rule-pack references and registered wage; and
- notice/consent, retention, access and disposition under the PDPL contract.

An accepted contract amendment creates a new effective assignment/version. It does
not rewrite historical contracts, salary slips, external files or ledgers. If Bunood
cannot determine the external contract state, it shows `unknown`, not `accepted`.

## 6. Time, attendance, leave and expense inputs

Device punches, schedules, attendance, approved leave, timesheets and manual
corrections are distinct sources. Importing a device event does not automatically
approve payable time.

Controls include:

- source, device/import batch, timezone, raw timestamp and transformed work date;
- shift assignment, overnight/cross-midnight handling and holiday calendar;
- missing, duplicate, late, out-of-order and impossible event detection;
- approved leave/absence/half-day interaction and overlapping-input prevention;
- configurable overtime/late/early rules with effective version and reviewer;
- employee explanation, manager/HR correction, reason and before/after evidence;
- payroll cutoff snapshot and late-change impact; and
- parallel comparison against the customer's accepted attendance source before
  attendance affects production payroll.

Expense claims preserve policy/version, receipt, merchant/date/amount/currency,
project/cost centre, duplicate indicators, advance allocation, approver, rejection,
reimbursement status and accounting documents. Approval is not payment; payment and
GL reconciliation remain separate.

## 7. Effective-dated payroll rule packs

Every payroll run records one immutable configuration snapshot containing:

- legal Company, period, frequency, currency and cutoff;
- Salary Structures, components, formulas, accounts and assignment versions;
- working-day, leave-without-pay, overtime and other approved input rules;
- rounding and precision by component/output;
- loans, advances, expenses, arrears, retroactive and off-cycle treatment;
- GOSI population/classification, branches, contributory-wage definition, caps,
  rates, employer/employee shares and effective source;
- WPS/bank output schema/version and establishment/bank identifiers;
- final-settlement/end-of-service rule version where applicable; and
- preparer, reviewers, approvals, effective dates and authoritative references.

Rules are data with versions and approval, not scattered code constants. A changed
rate creates a future-effective rule version. It cannot silently recalculate a
closed run. Unknown classification, missing source or overlapping effective rules
block calculation for the affected employee and explain the remediation.

## 8. Payroll run and state model

The orchestration state is separate from native document status:

`New → Inputs open → Inputs frozen → Calculated → Prepared → Reviewed → Approved →`
`Posted → File generated → Submitted external → Accepted external → Paid →`
`Reconciled → Closed`

Controlled alternatives are `Exception`, `Rejected external`, `Correction required`
and `Reopened`. These meanings are strict:

- **Calculated** means formulas ran, not that values are reviewed.
- **Approved** means the named payroll reviewer approved the frozen population,
  rules, totals, variances and exceptions.
- **Posted** means the native accounting accrual is submitted and reconciled.
- **File generated** means a payload exists; no external transmission is implied.
- **Submitted external** means an authorised channel returned submission evidence;
  it is not acceptance.
- **Accepted external** requires an authentic provider response tied to the exact
  payload/hash.
- **Paid** requires bank/payment evidence, not a draft Journal Entry or button click.
- **Closed** requires employee-chain, statutory-liability and GL reconciliation.

Reopening records scope, reason, impact, requester, approver and changed inputs,
invalidates affected downstream outputs and forces regeneration/review. Old files
remain retained as superseded evidence and cannot be re-submitted accidentally.

## 9. Explainable gross-to-net calculation

For every employee, the payslip shows each earning, employer contribution,
deduction, reimbursement and net result with:

- source and effective rule/assignment version;
- quantity, rate, basis, formula and intermediate value where applicable;
- period, currency, precision and rounding;
- attendance/leave/expense/loan/advance reference;
- whether it affects gross, net, employer cost, contributory wage, WPS amount,
  liability and GL account; and
- exception, override, reason, approver and before/after amount.

Required invariants:

- the employee population is frozen and duplicate employees are prohibited;
- earnings minus employee deductions plus approved net additions equals net pay,
  under the signed formula dictionary;
- employer contributions affect employer cost/liability but never silently change
  employee net pay;
- component totals equal payroll control totals and submitted Salary Slips;
- manual overrides require reason, authority and variance visibility;
- negative/zero/unusually changed net amounts require explicit disposition;
- recalculation is deterministic for the same snapshot; and
- retry is idempotent and cannot create duplicate slips, journals or files.

## 10. Saudi social-insurance and Wage Protection controls

### 10.1 GOSI

The engine never chooses “Saudi = one fixed rate.” It resolves the reviewed rule
pack from coverage, nationality/status, prior contribution history where required,
effective date, branch and other approved classification. The result shows:

- contributory/registered wage and component bridge;
- applicable branch and source version;
- employee and employer share separately;
- ceilings/floors or transition stage where applicable;
- payroll deduction, employer cost and liability accounts;
- GOSI-facing amount/file/transaction status;
- variance against the registered/external wage and prior period; and
- correction, effective date, approval and evidence.

### 10.2 Wage Protection and bank output

The output is generated only from an approved frozen payroll. It carries a unique
run/payload identifier, schema version, establishment, bank/payment account, pay
period/date, employee/payment identifiers, amount/currency, record count, control
total and cryptographic hash where supported.

The exact current authorised format/channel is customer- and provider-specific.
Bunood validates it before activation and records credentials/ownership without
putting secrets in files, logs or support screenshots. It records submission,
acknowledgement, per-row rejection, correction, replacement and final evidence.

No generated CSV, bank file, Journal Entry or UI success toast is described as WPS
compliance or payment. If the external response cannot be fetched, the state is
`unknown/delayed`, and the operator receives a safe retry/reconciliation path.

## 11. Final settlement and end of service

Final settlement is a controlled worksheet, not a single magic number. It records:

- employment and contract versions, start/end dates and termination reason;
- final wage basis and component inclusions/exclusions with source;
- accrued salary, approved overtime/expenses, unused leave and other entitlements;
- notice treatment, approved loans/advances/deductions and legal holds/disputes;
- end-of-service rule/source version, service-period calculation and intermediate
  values;
- comparison with the official HRSD calculator or other approved source where
  appropriate, with differences explained;
- HR/payroll/legal review, employee statement and payment due/actual status; and
- payroll, GOSI, WPS/bank, employee balance and GL consequences.

The system labels the result `estimate` until all required qualified approvals are
complete. A disputed or unknown case is routed for review and never forced to zero
to permit offboarding.

## 12. Accounting and reconciliation contract

The native Payroll Entry, Salary Slips and generated accounting entries remain the
authority. Bunood reconciles at employee and total level:

1. contract wage components to effective Salary Structure Assignment;
2. frozen time/leave/expense/additional inputs to payslip components;
3. payslip components to gross, employer cost, deductions and net;
4. payroll control totals to submitted Salary Slips;
5. gross/expense and employer contributions to their GL accounts/dimensions;
6. employee deductions and employer shares to statutory/other liabilities;
7. net pay to payroll payable, bank/WPS output and payment/clearing entry;
8. loans, advances and expense reimbursements to employee balances and GL;
9. contributory wage and contributions to the GOSI-facing output/response; and
10. paid/external status to bank evidence, outstanding liabilities and final GL.

Finance can verify aggregate accounting without receiving broad access to personal
salary lines. Where detailed access is required, it is explicit, time-bound and
audited. Submitted payroll source or generated ledger rows are never edited to make
a reconciliation pass.

## 13. External-interface state and connector governance

Qiwa, Wage Protection/Mudad, GOSI and bank routes use the common connector contract:

`Draft → Validated → Generated → Approved to send → Submitted → Acknowledged →`
`Accepted`

Alternative states are `Rejected`, `Partially accepted`, `Correction required`,
`Superseded`, `Revoked`, `Delayed` and `Unknown`.

Each transition stores actor, timestamp, environment, endpoint/interface version,
payload hash, external reference, response code/body classification, row results,
retry key and evidence. Retry is idempotent. A response is redacted before ordinary
logs/support access while the restricted evidence remains available to authorised
operators.

Connectors are activated only after official-interface ownership, authorization,
terms, privacy/transfer review, mapping, sandbox/controlled proof, credential
rotation, monitoring, support and disable/revoke procedures are accepted. A manual
upload remains a first-class controlled route where no supported API exists.

## 14. Privacy, security and employee trust

Payroll is high-impact personal and financial processing under the Saudi PDPL
operations contract. Minimum controls include:

- self/manager/HR/payroll/finance/integration/auditor scopes with negative tests;
- field-level protection for identity, bank, compensation, health/leave and files;
- export watermark/owner/purpose/expiry and download audit;
- encryption and secret vaulting; no bank/GOSI/Qiwa secrets in records or logs;
- notification content that does not expose salary or sensitive leave information;
- retention, legal hold, correction, restriction and disposition decisions that do
  not corrupt payroll, GL, statutory or audit truth;
- processor, transfer and breach controls for devices, banks and providers; and
- access reviews, terminated-user revocation and break-glass evidence.

## 15. Interaction and visual contract

- Employee mobile flows use large clear amounts, dates, status and next action.
- Payroll desktop views use aligned, compact tables with frozen identity columns,
  numeric decimal alignment, visible totals and keyboard operation.
- Name is primary and employee/external code is secondary traceability.
- Differences are shown as before/after/source/variance, not unexplained coloured
  badges.
- Green is reserved for current selection, primary action or confirmed success;
  warnings, unknowns, external delay and rejection use distinct semantic states.
- Arabic and English labels, salary components, payslips, dates, currency, signs and
  mixed identifiers remain readable in RTL/LTR at desktop and phone widths.
- Sensitive figures are never hidden by truncation; authorised users can reveal or
  copy them intentionally with audit where needed.
- Loading keeps the shell and context visible; validation, denial, conflict and
  provider failure restore controls/focus with a safe recovery action.

## 16. Acceptance programme

Promotion requires at least **two controlled parallel payroll cycles**: one normal
cycle and one exception cycle containing contract change, attendance correction,
additional pay/deduction, GOSI classification edge, external rejection/correction
and final settlement or off-cycle case.

Required evidence groups:

1. qualified Saudi HR/payroll/legal/accounting rule-pack sign-off;
2. employee/manager/HR/payroll/finance/integration/auditor permission and isolation;
3. employment and Qiwa contract/version/employee-decision bridge;
4. attendance, shift, leave, overtime, expense and cutoff source comparison;
5. deterministic gross-to-net, variance, override and idempotent rerun;
6. GOSI population, wage basis, transition/rate and liability reconciliation;
7. approved payroll to bank/WPS file, submission, row response and paid evidence;
8. native payroll accrual/payment, employee balances, liabilities and GL tie-out;
9. regular, retroactive, off-cycle and final-settlement scenarios;
10. rejection, partial acceptance, delay, correction, supersede and revoke recovery;
11. bilingual, mobile/desktop, accessible and employee-readable outputs; and
12. candidate-bound deidentified run packet, backup/restore and run-owned cleanup.

Every cycle must reproduce the per-employee chain and total controls. Cleanup removes
only run-owned fixtures and proves unrelated employees, balances and ledgers remain
unchanged. Structural validation is not payroll acceptance and an external file is
not government acceptance without authentic response evidence.

## 17. Operating metrics

Track without exposing employee pay to unauthorised viewers:

- payroll duration and on-time approval/payment;
- missing/late inputs and corrections after cutoff;
- employees with contract-to-assignment, payroll-to-WPS or GOSI variances;
- manual overrides, large period variance and negative/zero net pay;
- external rejection, correction, retry and unresolved age;
- unallocated advances/loans/expenses and unpaid liabilities;
- reopened runs and downstream outputs invalidated; and
- payslip delivery/access failures and employee query resolution.

Metrics are operational evidence, not a claim of statutory compliance.

## 18. External decisions and monitoring

Authorised owners must approve:

1. applicable employment populations, contract templates and establishment mapping;
2. working time, attendance, leave, overtime and cutoff rules;
3. salary components, formula dictionary, accounts, dimensions and rounding;
4. GOSI coverage/classification, wage basis, branches, rates and transition tables;
5. WPS/bank schema, channel, establishment/bank identifiers and payment evidence;
6. final-settlement/end-of-service, notice, leave and deduction treatment;
7. maker-checker, material variance, override and reopen authority;
8. privacy, retention, providers, data locations and restricted access; and
9. official-interface authorization, credential owner, support, monitoring and
   revocation.

Product/compliance owners re-check HRSD, Qiwa, Wage Protection/Mudad, GOSI, banking
and Frappe HR behavior before every affected release and at a scheduled regulatory
review. A source change opens an impact assessment; it does not silently mutate
closed payroll history.
