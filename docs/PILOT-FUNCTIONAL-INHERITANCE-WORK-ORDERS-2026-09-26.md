# 8100 pilot: functional inheritance plan and work orders

**Status:** Implemented on the 8100 pilot as a non-production preview; full release gate remains open (see [execution receipt](PILOT-FUNCTIONAL-INHERITANCE-RECEIPT-2026-09-26.md)).
**Date:** 2026-09-26
**Target:** `design/editorial-pilot`, isolated Bunood pilot on port 8100
**Source evidence:** locally cached `origin/main` at `dda9181` and the eleven `origin/capability/main/*` refs dated 2026-09-24. No fetch was performed.
**Decision:** Inherit behavior selectively; do not merge another branch's presentation layer into the pilot.

## Outcome and non-negotiable boundaries

The 8100 pilot must offer every applicable, permission-safe function represented by the reviewed main and capability commits while retaining its current invoice, POS, dashboard, Reports, login, navigation, and responsive design. A feature is not considered inherited merely because its source file exists: the pilot must load it, enforce the native ERPNext permissions and lifecycle, and pass the acceptance checks below.

- Do not merge, rebase, or cherry-pick `origin/main` or a capability branch wholesale. Port only a demonstrated missing behavior or regression test after comparing the exact source and runtime contract.
- Do not import another branch's SCSS, generated CSS/JS, asset hashes, appearance defaults, page layout, or theme settings solely to obtain functionality. No global style changes are in scope.
- Do not change the original 8088/8099 servers or their databases. Deploy and test only on the pilot project; use a disposable restored pilot for tests that mutate accounting or migration data.
- Preserve the pilot's existing dirty working tree. Its current deployed source includes uncommitted POS and login work; no checkout, reset, clean, or branch switch may discard it.
- Do not treat `__version__ = 0.47.1` or main's payload ledger as a feature. Release metadata must describe the eventual pilot artifact, not be copied from a different source line.
- A separate private data backup remains outside Git. Never commit database dumps, site configuration secrets, customer records, or uploaded files.

## Evidence and adoption decisions

The earlier main-only review in `docs/GITHUB-FEATURE-REIMPLEMENTATION-2026-09-22.md` documents all seven commits unique to main: `fbc6fee`, `d97d12f`, `ae7d293`, `cdc1856`, `c3b7121`, `ec5a53a`, and `dda9181`.

| Commit group | Functional result | Pilot decision |
| --- | --- | --- |
| `fbc6fee` | Records the main bench's 544/544 run; no product-code change. | Do not port; run the pilot's own gates. |
| `d97d12f` | Arabic `Standard` is `قياسي`; the visual theme `Ledger` uses a context distinct from the accounting ledger. | Already present in the pilot translation source; retain and test. |
| `ae7d293` | Report Studio route, engine, native report adapters, periods, statements, print/Excel actions, and scoped asset. | Already present. Retain the pilot's search, loading/recovery, table-first presentation, and scoped assets. Do not replace its UI. |
| `cdc1856`, `c3b7121`, `dda9181` | Version, changelog, generated asset and payload bookkeeping. | Do not copy release identifiers or generated files. Regenerate and measure from the pilot source when releasing. |
| `ec5a53a` | Studio CSS border correction, asset manifest correction, and a busiest-invoice-month test fixture. | The border and asset corrections are already in the pilot. Adapt the fixture strategy and relevant assertions to pilot tests; do not import main's Studio skin. |

The eleven capability branches below are independent slices, not eleven missing pilot features. Nine sampled core source files are byte-identical to pilot `HEAD`; the Report Studio and Reports landing sources differ because the pilot extends them. This is source evidence, **not** a claim that every live workflow has passed. Each slice therefore has a verification work order.

| Capability branch on main base | Representative source comparison | Pilot disposition |
| --- | --- | --- |
| `5bea923` banking | `banking.py` identical | Verify reconciliation access, evidence and native handoff. |
| `e372b27` document-list queues | `list_presets.js` identical | Verify Sales Invoice and Quotation queues. |
| `526fdb5` finance operations | `finance_close.py` identical | Verify close and journal workbenches. |
| `3bdd92c` form actions | `document_actions.js` identical | Verify sticky actions, permissions and one-step save/submit. |
| `367c474` onboarding/migration | `migration_scope.py` identical | Verify rehearsal, reconciliation, roles and audit trail on disposable data. |
| `f8ed219` POS retail | `pos.py` identical at pilot `HEAD`; the working tree has additional POS edits | Verify actual current source and cashier flows without changing its Market Tiles design. |
| `0758a78` commercial print | `printing/install.py` identical | Verify Arabic/English documents, totals, VAT/QR and PDF output. |
| `4cfd542` reference-field guidance | `reference_field_guidance.js` identical | Verify Warehouse/Country guidance retains native constraints. |
| `b974938` Report Studio | Pilot engine extends branch engine | Verify feature parity; retain pilot engine and presentation. |
| `630210a` Reports dashboard | Pilot landing differs | Restore optional capability-card availability handling, without altering visual design. |
| `f60034b` Stock Entry access | `stock_entry_compat.js` identical | Verify operator access to the two permitted setup reads. |

There are matching production-base capability branches. They are alternate-base copies, not an additional set of features to merge. Git author metadata identifies the capability commits as `MrBrokenrightArm`, the same identity as the pilot commits; it does not establish who physically wrote them.

## Work orders

### WO-00 — Freeze an exact, recoverable pilot baseline (P0)

**Dependency:** None. **Owner:** integration lead. **Estimated effort:** 0.5 day.

1. Record pilot Git `HEAD`, `git status --porcelain`, the current asset manifest and build hashes, installed app versions, site name, and running Docker project/container IDs. Keep the dirty source intact; do not silently commit or discard it.
2. Create a dated, private pilot database/files backup before any mutating acceptance run. Verify its checksums and document its restore location outside Git. Do not re-use the older portable backup as proof of today's site state.
3. Capture baseline screenshots at desktop and mobile widths for Home, Sales Invoice (new and saved), POS Market Tiles, Reports landing, Report Studio, login, and the Real Estate dashboard. Record Arabic and English routes where available.
4. Record existing known constraints, especially the current POS opening/shift state. Do not close a shift or post an invoice to make a test pass without an authorized, disposable test environment.

**Acceptance:** A named source revision plus dirty-file inventory, restorable data snapshot, and visual baseline are available. The original servers remain untouched.

### WO-01 — Close the Reports landing availability gap (P1)

**Dependency:** WO-00. **Owner:** frontend integration. **Estimated effort:** 0.5 day.

The capability commit `630210a` hid optional Finance/Journal/Banking cards when their boot assets were unavailable. The pilot's `bunood_theme/public/js/report_landing.js` now maps all cards unconditionally. Keep its current cards, spacing, typography and search; restore a functional availability/permission check so users are not sent to missing or forbidden pages. Check installed Page and boot-asset behavior on 8100 before choosing the predicate. Preserve direct routes for authorized users. Do not hide an installed feature merely because a transient boot key was delayed.

**Acceptance:** Installed and permitted routes remain visible; absent capability routes are not linked; search counts and empty state reflect the filtered set; keyboard navigation and Arabic/English labels work; screenshot difference is limited to removal of invalid cards.

**Tests:** Extend `tests/report_landing.test.cjs`; run `tools/report-studio-acceptance.mjs` and a route test with at least one simulated unavailable capability. Review the resulting screenshots against WO-00.

### WO-02 — Carry over main's Studio verification, not its visual shell (P1)

**Dependency:** WO-00. **Owner:** reporting engineer. **Estimated effort:** 1–2 days.

Use `origin/main:tests/studio.mjs` as a test specification, not as a drop-in script. Adapt its 31 checks to the pilot's route-scoped CSS/JS and UI selectors. Prioritize native-report permission behavior, VAT-to-ledger reconciliation, statements, period filters, previous-period comparisons, print media, real XLSX reopening, busiest-invoice-month fixture selection, and recovery when an asset request fails. Retain the pilot's corrected `filtersForRange` mapping and its table-first layout. Do not copy `origin/main` Studio SCSS or generated bundles.

**Acceptance:** The adapted suite runs against the pilot site, uses deterministic fixture data, restores any changed user language/settings in a `finally` path, and leaves no posted financial records in the live 8100 site. The existing Studio search, accessibility, RTL and responsive checks remain green.

**Tests:** `tests/report_studio.test.cjs`, adapted site-backed Studio suite, `tools/report-studio-acceptance.mjs`, `tools/report-studio-session-recovery.mjs`, print/XLSX verification.

### WO-03 — Preserve translation and asset integrity (P1)

**Dependency:** WO-00. **Owner:** localization/build. **Estimated effort:** 0.5 day.

Check the effective Arabic dictionary—not only CSV entries—for `Standard` and contextual `Ledger`. Confirm `assets.py` references files actually produced by the pilot build and that Studio CSS loads before its catalogue becomes visible. Keep the pilot's existing scoped-loading behavior and valid `var(--bnd-line) solid var(--bnd-border)` rules. Build only from pilot source; do not copy main's hashed asset names, global styling, or version number.

**Acceptance:** Both Arabic meanings resolve correctly, every referenced asset returns successfully, no unstyled Studio flash or oversized intrinsic SVG appears, and the pilot visual baseline remains unchanged.

**Tests:** `tests/translation-context.test.cjs`, `tests/report_studio.test.cjs`, `npm run build`, asset-manifest/path checks, desktop/mobile browser screenshots.

### WO-04 — Verify commerce surfaces without replacing Market Tiles (P1)

**Dependency:** WO-00. **Owner:** commerce/POS engineer. **Estimated effort:** 1–2 days.

Validate the capability slices for POS (`f8ed219`), document queues (`e372b27`), form actions (`3bdd92c`), and commercial print (`0758a78`) against the **current dirty pilot source**, not only `HEAD`. Cover item/barcode search, customer selection, hold/resume, retail and café context, split tender, receipts/returns, stale shift handling, list filters, invoice/quotation save-and-submit permissions, and Arabic/English PDF output. Keep Market Tiles, the dense invoice form and pilot action bar exactly as designed. Any missing behavior must be ported as a narrow handler/backend change with a focused test; do not replace page templates or SCSS.

**Acceptance:** Native ERPNext records remain the accounting authority; failed or duplicate checkout cannot double-post; totals round exactly to halalas; print amounts and VAT/QR are correct; unauthorized actions stay unavailable; new visuals match WO-00 except for an explicitly approved functional affordance.

**Tests:** Existing POS, list, form and print unit tests; `tools/pos-backend-acceptance.py`, `tools/pos-live-acceptance.mjs`, `tools/pos-role-permission-acceptance.mjs`, invoice/quotation and commercial-document PDF regressions. Run financially mutating cases on a disposable restored pilot, not the active 8100 books.

### WO-05 — Verify finance and stock access (P1)

**Dependency:** WO-00. **Owner:** finance/permissions engineer. **Estimated effort:** 1–2 days.

Validate banking (`5bea923`), finance close/journal (`526fdb5`), reference guidance (`4cfd542`), and Stock Entry access (`f60034b`). Confirm read APIs are company- and permission-scoped, period evidence is read-first, and create/post actions route to native ERPNext documents. Confirm the Stock Entry compatibility shim permits only the intended setup reads and delegates other requests untouched. Retain the pilot's Reports visual design and navigation.

**Acceptance:** Authorized users can open and use the workbenches; unauthorized users see no data or misleading action; no second ledger or implicit posting is introduced; Warehouse/Country fields explain rather than bypass constraints; stock operator access works without broadening write permission.

**Tests:** `tests/banking-workbench.test.cjs`, `tests/finance-close.test.cjs`, `tests/journal-workbench.test.cjs`, `tests/reference_field_guidance.test.cjs`, `tests/stock-entry-settings-compat.test.cjs`, corresponding Python permission tests, and pilot browser role checks.

### WO-06 — Verify onboarding and migration on disposable data (P2)

**Dependency:** WO-00. **Owner:** migration engineer. **Estimated effort:** 1–2 days.

Validate `367c474` through a source-identified dataset, rehearsal, reconciliation and correction cycle on a disposable restore. Preserve immutable receipts, duplicate decisions, role boundaries, native Data Import authority, and explicit distinction between planned and verified readiness. Do not make cosmetic changes to pilot onboarding pages as part of this inheritance work.

**Acceptance:** A rehearsal can be traced to its exact file and permissions, failed rows can be recovered without duplicating accounting entries, and every state claim is supported by a native result. The live pilot is unchanged after the test.

**Tests:** Migration-scope and onboarding contract tests, Python role tests, and a disposable-site end-to-end rehearsal/reconciliation.

### WO-07 — Cross-surface design and regression gate (P1)

**Dependency:** WO-01 through WO-06 as applicable. **Owner:** QA/design review. **Estimated effort:** 1 day.

Compare new screenshots with WO-00 for Home, invoices, POS, Reports, login and Real Estate at desktop/tablet/phone widths in Arabic RTL and English LTR. Check one scroll owner per page, sticky bars, dropdown layering, focus order, contrast, layout shifts, and that functional loading states do not flash Frappe's original form. Functional tests must cover negative permission, empty, error, retry, and unavailable-module cases—not only happy paths.

**Acceptance:** No unintended visual changes; no broken links; no new duplicate scrollbars or horizontal overflow; all scoped tests pass. Any deliberate visual affordance requires a separate screenshot and user approval before inclusion.

### WO-08 — Pilot release and rollback gate (P1)

**Dependency:** WO-07. **Owner:** release lead. **Estimated effort:** 0.5 day.

Rebuild and deploy only to the isolated pilot project after a verified private backup. Record Git revision plus dirty-file state (or a dedicated integration commit), generated asset hashes, installed app versions, test results and screenshots. Recheck 8100 without touching 8088/8099. Keep a documented rollback to the pre-work pilot source and private data snapshot. Do not publish the pilot database to Git or promote to production as part of this work order.

**Acceptance:** 8100 serves the exact reviewed source/build; smoke, focused, permission and browser gates pass; rollback is rehearsed or at least verified against the stored snapshot; release notes list any unverified workflow. Production promotion is a separate approval.

## Sequencing, estimates, and evidence rules

1. **Baseline:** WO-00 first. Existing uncommitted work must be explicitly accounted for before changes.
2. **Smallest code change:** WO-01. This is the only source-level functional gap confirmed in the audit.
3. **Parity without design import:** WO-02 and WO-03 in parallel only if files and pilot state are owned separately; otherwise sequentially.
4. **Capability acceptance:** WO-04, WO-05 and WO-06 can be tested independently on disposable pilot restores. Patch only a failed behavior, with its own narrow test.
5. **Cross-surface and release:** WO-07 then WO-08. No release claim from unit tests alone.

Expected engineering effort is approximately **6–10 working days**, contingent on pilot-site access, a current recoverable backup, and whether live acceptance reveals defects. This is an estimate, not a delivery guarantee. A failed capability test creates a new, narrowly scoped repair order with owner, reproduction, source files and retest evidence; it does not authorize a wholesale merge.

The audit's focused Node suites passed **75 checks** (39 reporting/finance/list/access, 34 POS/print/onboarding, 2 translation). These are source-level checks. The full `tests/smoke.mjs` did not run from the Windows shell because `docker` was unavailable (`spawnSync docker ENOENT`); it must be rerun in the configured pilot/WSL environment before WO-08 can pass. Main's historical 544/544 and 31/31 numbers are evidence about main's bench only, not about 8100.

## Final decision record

**Chosen:** selective behavior parity plus pilot-specific regression and live acceptance.
**Rejected:** merging main or a capability branch and then repainting it, because that would entangle generated assets, release metadata and foreign CSS with the approved pilot design.
**Revisit only if:** a capability is genuinely absent from the pilot after runtime validation, or an upstream safety fix cannot be ported narrowly. In that case, write a new repair order before changing source.
