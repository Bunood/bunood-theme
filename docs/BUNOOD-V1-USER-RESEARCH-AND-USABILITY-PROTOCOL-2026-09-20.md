# Bunood V1 User Research and Usability Protocol

**Document date:** 2026-09-20  
**Authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Applies to:** every promoted V1 persona, master journey, language, and supported
device class  
**Exclusion:** this protocol is a target and research design, not evidence that a
study has run or a release threshold has passed.

## 1. Purpose

Bunood cannot call itself easy because screens look cleaner or automated selectors
exist. V1 must demonstrate that real Saudi-market users can find, complete, verify,
and recover their most important work without hidden administrator help, while the
native accounting, stock, permission, tax, and audit outcome remains correct.

The study answers:

1. Can each persona recognize where to start and what success means?
2. Can Arabic-primary and English-primary users complete the same work with the same
   information, confidence, and recovery options?
3. Does Simple mode contain everything needed for routine work without hiding
   mandatory or consequential information?
4. Can an expert accountant work quickly and trace every number without losing
   controls, density, keyboard access, or source evidence?
5. Do permission, configuration, empty, validation, conflict, integration, and
   system failures look different and lead to a safe next action?
6. Does the visual hierarchy clarify the work without green flooding, decorative
   pills/cards, clipping, inconsistent widths, or competing primary actions?

## 2. Research program

| Stage | Method | Participants | Decision produced |
|---|---|---:|---|
| Discovery | Context interview and current-workflow walkthrough | 5–8 per high-risk workflow family | Jobs, vocabulary, artifacts, workarounds, risks, and current baseline |
| Formative | Moderated think-aloud usability test on one workstream | 5–8 representative users per iteration | Problems and design changes before implementation hardens |
| Information architecture | Open/closed card sort plus navigation finding tasks | 15–30 across operational and finance roles | Stable Arabic/English labels, grouping, and role navigation |
| V1 benchmark | Moderated end-to-end benchmark on the release candidate | At least 40; at least 5 for each of the eight core personas | Comparable completion, time, error, help, confidence, and visual-quality evidence |
| Design-partner validation | Diary/support review over real billing and close cycles | At least 3 Saudi businesses | Operational fit, exception frequency, support burden, and integrity evidence |

The benchmark follows the principle used in the GOV.UK service manual: define the
transaction start and end, measure completion rather than page visits, and record
task success, time, abandonment, false confidence, ease, and confidence. Forty
participants sit inside its 30–60-user recommendation for whole-service usability
benchmarking while guaranteeing representation for every Bunood core persona.

## 3. Recruitment matrix

The research owner maintains a de-identified recruitment register and confirms:

- cashier, sales, buyer, warehouse, accountant, finance manager, owner, and
  administrator/implementer each have at least five benchmark participants;
- at least half of participants are Arabic-primary; English-primary and bilingual
  workers are also represented;
- micro, small, and medium businesses plus single- and multi-branch operations are
  represented inside the supported retail/distribution V1 segment;
- novice, intermediate, and expert accounting/ERP experience is represented;
- desktop/laptop, tablet, phone, barcode, keyboard-heavy, print, and assistive
  technology needs are recruited where the role uses them;
- participants are actual or likely users, not only Bunood staff or implementers;
- no participant is asked to disclose live credentials, customer records, payroll,
  tax secrets, or other unnecessary personal/business data.

Industry packs outside the supported V1 declaration require their own discovery and
benchmark; they cannot borrow retail/distribution evidence.

## 4. Session protocol

Each 60–75 minute moderated session uses the same structure:

1. **Consent and warm-up (5 minutes):** explain recording, confidentiality, right to
   stop, and that the product—not the participant—is being tested.
2. **Context (10 minutes):** role, frequency, devices, existing system, artifacts,
   language preference, current pain, and how the participant knows the job is done.
3. **Unaided tasks (30–40 minutes):** provide realistic intent and fixture data, not
   click instructions. The moderator does not rescue the participant unless the
   support-intervention point is recorded.
4. **Injected recovery (10 minutes):** one role-appropriate permission,
   configuration, validation, conflict, delayed-integration, or recoverable-system
   failure.
5. **Debrief (10 minutes):** 1–5 ease and confidence ratings per task, preference and
   comprehension probes, missing context, and the single most important change.

The fixture and candidate commit, site, company, roles, language, viewport, theme,
starting state, task start/end, expected native records, and reconciliation query are
recorded before the session.

## 5. Persona benchmark tasks

The role matrix remains authoritative for permission and exact scope. The benchmark
selects the three role tasks defined there and includes these non-negotiable outcomes:

- **Cashier:** open assigned shift; find/scan by prominent item name with code
  secondary; accept allowed tender; print; return; close with explainable difference.
- **Sales:** find/create permitted customer; map quotation/order/invoice without
  re-keying; act from the overdue queue.
- **Buyer:** request/RFQ and compare; order through approval; follow receipt/bill/pay
  without accounting privilege.
- **Warehouse:** receive/put away; transfer or pick/dispatch; count and escalate a
  variance without forbidden financial data.
- **Accountant:** post and trace AR/AP; reconcile payment/bank; complete period/tax
  exceptions and produce source-reconciled reports using keyboard-first controls.
- **Finance manager:** review cash/ageing/tax/close exceptions; approve through a
  workflow; sign off only after evidence is complete.
- **Owner:** understand plain-language position; drill every non-zero metric to its
  permitted source; approve without editing underlying accounting.
- **Administrator:** complete readiness; apply a versioned role template; explain
  and recover from a failed prerequisite; audit integration/backup/system health.

## 6. Measures and V1 thresholds

Every task records completion, outcome correctness, time, errors, backtracks, help,
support intervention, mode switch, search terms, ease, confidence, and whether the
participant falsely believed an incomplete/incorrect task had succeeded.

| Measure | V1 release threshold |
|---|---|
| Accounting, stock, tax, payment, permission, and audit correctness | 100% for every completed acceptance journey; any silent divergence blocks release |
| False-success events | 0; local UI success may never conceal failed save, posting, integration, permission, or reconciliation |
| Master journey coverage | Every declared journey completes correctly on the candidate in Arabic and English with its required role and recovery case |
| Unassisted first-attempt top-task completion | At least 90% overall and no core persona below 80%; failures are analyzed, not averaged away |
| Critical daily task completion after role onboarding | At least 95%, with no unresolved severity-1 or severity-2 usability finding |
| Support intervention | At most 10% of routine top-task attempts; compliance approval and intentional workflow hand-off do not count as UI rescue |
| Ease and confidence | Median at least 4/5 for each core persona; any task below 3/5 is reopened |
| Navigation discoverability | At least 90% start the intended top task from their default home in no more than two deliberate navigation choices |
| Language parity | Arabic/English completion differs by no more than 10 percentage points, with no language-specific blocker, clipping, or missing recovery copy |
| Simple-mode escape | Routine tasks do not require Expert mode; every switch caused by a missing essential is a defect until explicitly re-scoped |
| Accessibility | WCAG 2.2 AA for promoted surfaces; keyboard-only completion, visible/unobscured focus, 200% text zoom, 320 CSS-pixel reflow except necessary two-dimensional data, and no drag-only action |
| Touch and scan operation | Product controls used in touch-critical work target at least 44×44 CSS pixels even though WCAG 2.2 AA permits smaller qualified targets |
| Visual acceptance | No clipped Arabic glyphs, mixed owned static language, green flood, decorative-control pills, card soup, inconsistent field tracks, hidden totals, or competing primary actions |

Time is compared with the recorded current-system or previous-candidate baseline per
task. The team may not make users faster by removing required controls, skipping
approval, pre-filling invented data, weakening permissions, or deferring accounting
work to an administrator.

## 7. Severity and decision rules

| Severity | Definition | Decision |
|---|---|---|
| 1 — Integrity/safety | Wrong posting/stock/tax/payment, cross-scope data, duplicate transaction, lost work, false success, or unrecoverable compliance action | Stop promotion; fix and rerun affected and neighboring journeys |
| 2 — Task blocker | Representative user cannot complete a supported task or recovery without unplanned expert intervention | Work order remains acceptance-incomplete |
| 3 — Material friction | Task completes but repeated confusion, backtracking, visual ambiguity, excessive time, or unnecessary mode switching occurs | Prioritize before release unless product owner documents bounded exception and follow-up |
| 4 — Minor | Cosmetic or wording issue with no material task effect | May enter controlled backlog with owner and date |

One successful participant cannot cancel another participant's blocker. Segment,
role, language, device, and experience differences are reported separately before an
overall number is calculated.

## 8. Synthesis and evidence packet

The researcher produces:

1. task-level raw observations and de-identified metrics;
2. journey maps and affinity themes linked to evidence, not invented personas;
3. severity-ranked findings with affected role/language/device/state;
4. impact/effort recommendations linked to the owning work-order ID;
5. before/after clips or screenshots with participant consent;
6. accounting/stock/report reconciliation results from the same fixture run;
7. exclusions, sample limitations, unresolved disagreements, and follow-up study;
8. a signed promotion recommendation from research, product, domain, accessibility,
   security, and QA owners.

The evidence packet is stored under a run-specific artifact directory and referenced
by the execution ledger. Aggregated counts alone are not a release receipt.

## 9. Privacy and research operations

- Obtain informed consent separately for participation, recording, and quote use.
- Use run-owned synthetic or properly anonymized data; never clone production data
  into a research environment by default.
- Collect the minimum participant data, define purpose and retention, restrict
  access, and honor withdrawal within the documented legal boundary.
- Do not place participant recordings or personal details in the source repository.
- Record incentives, moderator, note-taker, conflicts of interest, and any assisted
  digital support used.

## 10. Reference methods

- [GOV.UK: usability benchmarking a whole service](https://www.gov.uk/service-manual/measuring-success/usability-benchmarking-a-website-or-whole-service)
- [GOV.UK: measuring transaction completion](https://www.gov.uk/service-manual/measuring-success/measuring-completion-rate)
- [GOV.UK: measuring user satisfaction](https://www.gov.uk/service-manual/measuring-success/measuring-user-satisfaction)
- [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C guidance for reflow and zoom](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
