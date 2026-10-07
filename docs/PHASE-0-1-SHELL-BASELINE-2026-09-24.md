# Phase 0 baseline and Phase 1 form-shell receipt — 2026-09-24

This is an inner-loop receipt for the redesigned Bunood desk, not a production
performance result or an approval to pilot. It records the starting defects,
the Phase 1 shell change, and the local checks that can be repeated without
creating or submitting business documents.

## Scope and environment

- Source: `production/theme-v0.46.7` at `18209bd` plus extensive pre-existing
  uncommitted work. The worktree was not reset, rebased, or pulled for this run.
- Local site: `rc20.localhost` at `http://127.0.0.1:8088`; the backend/frontend
  containers remained local staging, not a production deployment.
- Entry points: `/desk/home`, `/desk/desktop`, new Sales and Purchase Invoices,
  new Quotation and Payment Entry, and representative submitted Sales Invoice
  and Quotation. The extended probe covers the other purpose-built transaction
  forms as well.
- Viewports: 1440×900, 820×900, and 390×844. English/Arabic and role-specific
  access still need separate release acceptance.

## Baseline defects and decisions

| Finding | Before | Phase 1 treatment |
|---|---|---|
| Native form flashes before the redesigned form | First-paint probe saw 2–4 native frames on new Quotation and 5–6 on new Payment Entry. | Route-scoped first-paint guard plus synchronous workbench mount; a six-second fail-open reveal keeps the native form available if enhancement fails. |
| Saved invoice contributes to root overflow | Submitted Sales Invoice produced 62 px of root overflow even after the new-form checks passed. | Anchor its visually hidden line-total label to the line cell; subsequent local probe measured zero. |
| Submitted invoice action clips on a phone | A 390 px capture showed the action row cut off, with 69 px of internal overflow. | Use icon-only Print with an accessible name and reduce the mobile amount margins; final probe measured zero toolbar overflow. |
| Two competing form actions or a gap above the pinned bar | Earlier screenshots showed both behaviors. | Keep the existing single action owner and one `.main-section` scroll viewport; assert one visible form bar and no exposed gap after scroll. |
| Home may open All Applications | Reported intermittently; direct routes were distinct in this local run. | Guard both routes in the regression probe. No routing code was changed without a reproduced redirect. |

The bill and simplified workbenches continue to operate on the live Frappe
`frm.doc`. Advanced mode restores the native form. Save, submit, print, tax,
pricing, and stock behavior remain owned by ERPNext; the Phase 1 changes are
presentation and mount timing only.

## Repeatable acceptance

- `npm run build`: passed; the build-time payload ceiling passed. The current
  main sheet is 50,777 gzip bytes and the main script is 223,425 gzip bytes.
- `node --test tests/form_shell_phase01.test.cjs tests/document_actions.test.cjs tests/simple_forms.test.cjs tests/sales_bill.test.cjs tests/home-entry-regression.test.mjs`:
  167 passed, 0 failed.
- `tools/page-density-acceptance.mjs`: passed on the local site for the existing
  desktop transaction matrix and compact invoice/payment widths.
- `tools/phase01-shell-acceptance.mjs --assert --all-widths --all-forms --saved`:
  passed 51 route/viewport combinations. It checked first-paint native
  visibility, one action bar, toolbar/root/horizontal overflow, content-width
  scroll containers, sticky paint gap once the bar reaches its anchor, and
  Simple/Advanced recovery at desktop width. Material Request is short enough
  that its bar remains in normal flow in this probe; a natural 21 px header
  margin is not counted as an exposed sticky gap.
- 24 viewport screenshots were captured locally under
  `outputs/phase01-shell-2026-09-24` outside the Git repository. Re-run the
  probe with `--screenshots` and `BND_PHASE01_CAPTURE_DIR` to regenerate them.

One-run route-ready timings from this unthrottled local site are diagnostic
only. They do not establish the cold/warm p95 targets in the V1 performance
contract, nor do they cover slower roles, data tiers, or concurrent users.

## Not yet established by this receipt

- Actual save/submit/print latency, duplicate-result safety, and the full
  quotation-to-invoice transaction outcome were not exercised by this
  business-data-read-only shell probe.
- Cold-cache mobile and Arabic browser telemetry, CLS/INP, Standard data-tier
  load, and the V1 p95/p99 service budgets need the separate performance gate.
- Permission-scoped operator navigation and saved-document variants beyond
  Sales Invoice and Quotation need their own live acceptance. The navigation
  fixture suite creates and removes
  named users, so it was not run against this populated local site.
- A clean Git tree and an immutable release candidate are still required before
  this can serve as a production release receipt.
