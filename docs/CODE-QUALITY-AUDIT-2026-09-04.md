# Code Quality and Maintainability Audit — 2026-09-04

## Scope and method

This review covered the tracked Python, JavaScript, SCSS, templates, tests, build tooling, generated-asset manifest, and repository hygiene. It combined reference scans, endpoint and stylesheet tracing, bundle-budget checks, live Frappe queries, unit tests, browser regressions, and manual review of dynamic Frappe entry points.

Priority uses `(impact + risk) × (6 - effort)`, where each input is scored from 1 to 5. A high score means the item should be handled sooner. Static “unused” results were not deleted when Frappe can reach them by hook, dotted path, route, DocType convention, or whitelist registration.

## Resolved before commit

### 1. Generated and third-party evidence could enter a release commit — priority 40

- **Why it was unnecessary:** `artifacts/` contained screenshots, archives, and an extracted third-party compliance repository; `work/` contained temporary review output. Neither directory is a runtime input.
- **Removal impact:** Keeping them out of Git prevents repository bloat and avoids accidentally shipping copied source or local evidence. The local files remain available.
- **Deletion risk:** Some files may still be useful as review evidence, so this audit does not delete them.
- **Cleanup applied:** Both root directories are ignored. If durable evidence is needed, promote a deliberately selected file to `docs/` with provenance and licensing notes.

### 2. Dashboard totals performed unbounded row fetches — priority 40

- **Why it was unnecessary:** Cash, older receivables, and payables loaded every matching row and summed in Python even though the database can return one aggregate row.
- **Removal impact:** Replacing those fetches with permission-filtered `SUM` queries reduces database transfer, Python objects, and latency as ledgers grow. The recent-purchase list is now independently limited to five rows.
- **Deletion risk:** Aggregate field syntax and null results needed live verification against the installed Frappe version.
- **Cleanup applied:** The live site returned the same figures after the change. Regression coverage remains part of the full verification gate.

### 3. Stock Entry and Delivery Note duplicated workbench infrastructure — priority 28

- **Why it was unnecessary:** Card construction, metric construction, native-field movement/restoration, and value formatting had parallel implementations.
- **Removal impact:** A shared `SimpleDocumentWorkbench` removes two maintenance paths while leaving document-specific refresh and workflow logic in the subclasses.
- **Deletion risk:** Frappe can remount form controls after refresh, so shared methods must preserve native nodes instead of cloning them.
- **Cleanup applied:** Both workbenches inherit the shared base. Their focused unit and browser journeys are release gates.

### 4. Removed sidebar-preset UI left orphan stylesheet rules — priority 25

- **Why it was unnecessary:** Six preset-card classes and one focus selector no longer had a constructor or runtime reference after the duplicate preset UI was removed.
- **Removal impact:** Removing the rules reduces CSS surface and prevents future engineers from assuming the abandoned UI still exists.
- **Deletion risk:** Dynamic class composition can defeat literal searches. The surrounding active picker and export/import classes were retained.
- **Cleanup applied:** Only the classes proven orphaned were removed.

### 5. Invoice status navigation depended on stale derived labels — priority 40

- **Why it was unnecessary:** The dashboard counted overdue invoices from due date and outstanding balance, while the click target filtered ERPNext's asynchronously maintained `status` label.
- **Removal impact:** Counts and drill-downs now share company, document state, posting scope, outstanding balance, and due-date facts, so the destination cannot disagree with the card.
- **Deletion risk:** Changing the dashboard to trust `status` would reintroduce scheduler timing errors. The primitive filters are now asserted in a live browser regression.
- **Cleanup applied:** A single filter builder owns Paid, Open, and Overdue routes.

### 6. Donut hover and center geometry were coupled to container assumptions — priority 28

- **Why it was unnecessary:** Frappe Charts offsets a hovered donut slice and its rendered ring is not guaranteed to share the wrapper's mathematical center.
- **Removal impact:** The summary label follows the measured SVG ring, realigns on resize, and the dashboard-specific donut disables slice translation while retaining tooltip and opacity feedback.
- **Deletion risk:** Disabling all chart transforms globally would damage other chart types. The rule is scoped to the Home status chart and browser-tested.
- **Cleanup applied:** Exact center and no-motion tolerances are automated.

### 7. Global chrome had several competing geometry and ownership assumptions — priority 40

- **Why it was unnecessary:** Top-bar width, sidebar hit-testing, form-sidebar height, and bottom-bar search width were each derived independently. That produced a top bar wider than the viewport, a compact rail whose click could fall through to the page, a one-pixel form/status overlap, and status items colliding with search at intermediate widths.
- **Removal impact:** Logical start/end insets now balance the top bar in both directions; the top row and rail column have deterministic paint owners; the rail owns a minimum desk height across route and breakpoint transitions; and shared measured bottom-reserve geometry sizes forms and bars.
- **Deletion risk:** These rules compose with Frappe's inline sidebar state and responsive drawer. Removing native behavior or making the rail fixed would regress mobile reachability and scrolling.
- **Cleanup applied:** Desktop, 390px mobile, LTR, RTL, keyboard, hit-target, scroll, and overlap checks cover the shared contract.

### 8. Native-control fallback was inferred from a container instead of tested at the control — priority 32

- **Why it was unnecessary:** Tenant placement assumed a native pane was usable when its container existed, even if the actual search, notification, or profile control was hidden, zero-sized, or covered.
- **Removal impact:** Ownership is released first and the real native control is checked for visibility, geometry, and center-point hit ownership. An unavailable destination now falls back without duplicating controls.
- **Deletion risk:** Presence-only checks are tempting during asynchronous mounts; restoring them would recreate unreachable global actions.
- **Cleanup applied:** The release suite exercises fallback reachability, one-owner invariants, and duplicate-control counts across desktop and mobile layouts.

### 9. Compact navigation lacked complete keyboard semantics — priority 28

- **Why it was unnecessary:** Section icons were visually clickable but inherited non-interactive container semantics.
- **Removal impact:** Compact section targets now expose button roles, names, tab stops, and Enter/Space activation, with teardown removing generated attributes cleanly.
- **Deletion risk:** Adding a second button inside the native row would duplicate interaction and disturb Frappe's navigation handlers, so semantics stay on the existing target.
- **Cleanup applied:** Keyboard, accessible-name, focus-ring, target-size, and exact-control-count checks pass.

### 10. Release tooling inherited mutable tenant state and produced invalid synthetic chart geometry — priority 32

- **Why it was unnecessary:** The fingerprint tool could leave settings or language behind, and test charts appended directly to the flex body could shrink to zero plot width and make Frappe emit negative SVG rectangles.
- **Removal impact:** Fingerprinting snapshots and restores settings plus system/default/user language, reads the same environment variables as the rest of the toolchain, and uses measured off-flow chart hosts. Navigation failures now include viewport and ownership diagnostics.
- **Deletion risk:** Test-state restoration must remain in `finally`; parallelizing these checks would still be unsafe because Theme Settings is a shared Single.
- **Cleanup applied:** Picker shape drift is limited to the intentional Rail default, focused state-leak sequences pass, and the strict console-error budget stays green without a new exception. Language changes now clear the affected user's Frappe cache, while fixture writes retry only the two known MariaDB single-value conflict tables with a strict bound.

## Open technical debt

### 11. Large UI modules concentrate unrelated responsibilities — priority 20

- **Evidence:** `public/js/bunood.js` and the Theme Settings controller each contain several thousand lines spanning shell, navigation, dashboards, charts, settings panels, and lifecycle patches.
- **Why it is a problem:** Ownership boundaries are implicit, so a small shell change can affect unrelated routes and make dead-code analysis unreliable.
- **Estimated impact of removal/refactor:** Lower review cost, smaller regression scope, and clearer lifecycle ownership; runtime bytes need not increase because the existing build can concatenate modules.
- **Risk:** A large rewrite would be more dangerous than the debt. Globals, hook order, route timing, and Frappe remount behavior are observable contracts.
- **Recommended plan:** Extract one behavior at a time behind the current public functions: Home dashboard, global shell, sidebar, palette/inbox, then settings panels. Keep the generated bundle contract and move existing regressions with each extraction.

### 12. Browser regression registrations live in one very large file — priority 16

- **Evidence:** `tests/smoke.mjs` contains the shared mutable-site harness and hundreds of sequential checks in one file.
- **Why it is a problem:** Navigation is slow, merge conflicts are likely, and ownership by product surface is unclear.
- **Estimated impact of refactor:** Easier review and targeted execution without losing the intentionally sequential site orchestration.
- **Risk:** Running suites independently or in parallel could corrupt the shared Frappe fixture state.
- **Recommended plan:** Keep one orchestrator and fixture lifecycle, but move registration functions into domain files (`shell`, `home`, `forms`, `print`, `settings`, `reports`). Preserve order and use the current filter mechanism.

### 13. Console allowlist entries can outlive their upstream cause — priority 24

- **Why it is a problem:** Environment- and upstream-specific exceptions can hide a newly introduced console error if they are broad or undocumented. One nearby asset-retention comment no longer describes the current keep-window behavior.
- **Estimated impact of cleanup:** More trustworthy browser failures and less ambiguity during upgrades.
- **Risk:** Removing entries without reproducing the upstream condition would make CI flaky rather than safer.
- **Recommended plan:** Give every exception an owner, exact message pattern, upstream version, and removal condition. Review the list on every Frappe/ERPNext pin update; correct stale comments in the same change that proves their new behavior.

### 14. A few repository-root screenshots are historical evidence — priority 16

- **Why they appear unnecessary:** They are not runtime assets and do not belong beside package metadata.
- **Estimated impact of removal:** A cleaner root and smaller clone.
- **Risk:** Documentation or release history may rely on them even when literal references are absent.
- **Recommended plan:** Confirm provenance and current references, then move useful evidence under a dated `docs/evidence/` directory or release storage. Delete only after that review.

### 15. Dynamic Frappe entry points create false dead-code positives — priority 15

- **Evidence:** Whitelisted methods, hook callbacks, DocType controllers, report runners, patches, and operational restore utilities often have no ordinary call expression.
- **Why they must not be removed blindly:** Frappe resolves them from metadata, dotted paths, routes, and database records at runtime.
- **Estimated impact of documentation:** Safer future cleanup and more useful static-analysis output.
- **Risk:** Deleting a seemingly single-reference function can break installation, migrations, reports, or administrator recovery paths.
- **Recommended plan:** Maintain a small dynamic-entry-point manifest or annotations consumed by audit tooling, plus one reachability test per category. `restore_currency_symbol_position` and `restore_form_defaults` are intentional recovery utilities and should remain.

### 16. Recent sales still materialize a bounded six-month invoice set — priority 12

- **Why it remains:** The same permission-filtered rows currently feed receivable totals, overdue/open counts, month buckets, and recent activity, keeping those facts internally consistent.
- **Estimated impact of refactor:** On unusually high-volume tenants, grouped aggregates plus a separate limited recent query would reduce transfer further.
- **Risk:** Splitting the query can cause filters or permissions to drift and recreate the count/detail mismatch fixed in this release.
- **Recommended plan:** Add query-count and high-volume fixtures first, then introduce shared filter objects used by aggregate, trend, status, and recent queries. Do this only when measurements justify the extra queries.

## Security and dependency notes

- No committed secret assignment was found by the repository scan.
- Privilege-bypassing writes are confined to installation, migration, administrator tooling, and isolated test-fixture setup; request-facing dashboard reads remain permission-filtered.
- HTML construction remains an area requiring contextual review. Native Frappe-marked search results and fixed SVG fragments are intentional; new user-controlled values should use text nodes or explicit escaping.
- This release adds no runtime dependency. Node packages are development-only and remain pinned through the lockfile.
- A live-registry `npm audit` was attempted twice and timed out in this environment, including once with network escalation. The cached offline audit reported zero vulnerabilities. Treat that as local evidence, not a substitute for a successful network-backed audit in CI.

## Release gate

Commit and push are permitted only after a clean build, syntax/compile checks, unit tests, the complete verification runner against the deployed local site, an explicit local browser inspection, a staged diff review, and a final secret scan.
