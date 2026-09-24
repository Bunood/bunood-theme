# Implementation Roadmap — MVP to V1

> **Superseded for post-MVP/V1 planning:** use
> `docs/BUNOOD-V1-MEGA-PLAN-2026-09-20.md`. This file remains a historical record
> of the original pilot-to-V1 sequence; its applicable requirements were merged into
> the authoritative mega plan.

## Phase 0 — Sellable pilot gate (now through 2026-09-18)

### Product work

- Freeze scope to customer/item setup, quotation, sales invoice, payment, print, and
  the shell needed to reach them.
- Make the invoice table the entry surface: blank first row, direct Item search,
  keyboard movement, Add Line only for subsequent rows, live native totals.
- Add permission-aware Quotation → Sales Invoice conversion through ERPNext's mapper.
- Complete Arabic strings for the launch path.
- Preserve native Payment Entry as the payment-method and accounting workflow.

### Verification and release

- Run focused controller tests, then the full theme test and verification gates.
- Build immutable production assets and deploy them to the local pilot stack.
- Smoke-test desktop Arabic and English; check a narrow viewport for navigation and
  invoice entry.
- Complete one full disposable quote-to-cash scenario, including print/PDF. Cancel or
  delete test records according to native document rules; do not edit ledgers directly.
- Confirm backup/restore ownership and record the deployed commit and asset hashes.

### Exit criteria

All PRD launch criteria pass, there are no P0/P1 defects in the revenue path, and the
first customer is onboarded as a supported pilot with known configuration.

## Phase 1 — First customer week

- Observe real invoice creation and record time-to-complete, mode switches, errors,
  and support requests.
- Add a guided company readiness check for address, currency, chart of accounts,
  warehouse, price list, taxes, print format, and ZATCA state.
- Harden print templates using real customer data and long Arabic names.
- Add route/state smoke coverage for Home, Real Estate, list, new form, saved draft,
  submitted document, and modal/flyout states.
- Triage feedback daily: data/accounting integrity first, blocked work second,
  recurring confusion third, cosmetics last.

## Phase 2 — Weeks 2–4

- Add an optional split invoice preview only after print correctness is stable.
- Simplify returns/credit notes and mapped delivery/order flows with explicit native
  eligibility rules.
- Expand task-focused workbenches based on observed demand: purchasing, expenses,
  stock movement, then real-estate operations.
- Add self-service onboarding progress that is server-persistent and permanently
  dismissible per user/site.
- Add telemetry that records workflow events without invoice content or credentials.

## Phase 3 — V1 hardening

- Complete supported-browser, phone/tablet, RTL/LTR, accessibility, role, and upgrade
  matrices.
- Publish backup, restore, incident, migration, support, and release procedures.
- Establish performance budgets and production monitoring.
- Run a security/permission review and accounting reconciliation against standard
  ERPNext reports.
- Promote from founding-customer pilot to general availability only after multiple
  customers complete a billing period without data-integrity incidents.

## Workstream ownership

| Workstream | Source of truth | Rule |
|---|---|---|
| Shell and navigation | Bunood registry and shared SCSS | One component contract, responsive variants only. |
| Business documents | ERPNext DocTypes/controllers | Extend; never duplicate posting logic. |
| Simple surfaces | Explicit profiles + required fallback | Required writable fields always win. |
| Invoice experience | `sales_bill.js` + native form | Same document in Simple and Advanced. |
| Print/ZATCA | Bunood print and server facade | Configuration is explicit and browser credentials are forbidden. |
| Quality | automated gates + task smoke matrix | Test business outcomes, not only selectors. |

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Rushed pilot exposes accounting defect | Low–medium | Critical | Keep all posting native; reconcile test invoice/payment in ERPNext reports. |
| UI regression at another width/direction | Medium | High | Shared shell primitives plus route × viewport × language smoke matrix. |
| Customer site is misconfigured | High | High | Preflight checklist and explicit readiness states before first live invoice. |
| Scope expands during launch day | High | High | Freeze tomorrow to the PRD revenue path; put requests into Phase 1/2. |
| ZATCA connector/onboarding incomplete | Medium | High | Treat as site gate; do not represent “UI present” as compliance readiness. |
| Pilot support overwhelms development | Medium | Medium | One support channel, severity rules, daily review, limited founding customers. |

## Referenced implementation guidance

- Frappe agent architecture: keep domain ownership clear and native APIs authoritative.
- Frontend design: make the invoice table the visual/task focus and standardize the
  shell rather than creating page-specific variants.
- Verification and quality assurance: use staged gates, negative checks, and evidence
  from tests, build output, and live task flows before release.
