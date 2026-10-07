# 8100 pilot functional inheritance — execution receipt

**Date:** 2026-09-26
**Branch / base revision:** `design/editorial-pilot` / `65a81e56f2dc83c921ba708dc5018e40fad99c6f`
**Deployment:** 8100 pilot preview only. **Not a production-readiness or complete WO-08 release sign-off.**
**Boundary:** No fetch, pull, merge, rebase or cherry-pick. No operation on the original 8088/8099 stacks. The shared dirty working tree was preserved and no commit was made.

## What changed

- Reports landing now uses the installed route-scoped asset and Frappe's native `Page.is_permitted()` result to avoid linking optional workbenches a user cannot open. The six-card layout, search and visual styling were retained.
- A real two-site synthetic migration rehearsal exposed three narrow functional defects. Frozen scope digests now use the recorded source-site identity after restore; replay of a completed native import returns its existing immutable receipt without enqueuing a second import; and native template warnings close a pending rehearsal as a privacy-minimised exception instead of leaving it running forever. All three have regression tests.
- Added reproducible live acceptance for Reports card permissions/search, Studio-to-native register/VAT parity, real XLSX reopening, read-only finance capability, and the synthetic migration path. Updated stale source-level pilot-layout assertions without changing the pilot's visual source for this work order.
- Rebuilt from the pilot source. The global Desk CSS, POS CSS and login JS hashes on 8100 remain the same as before deployment. Reports landing JS changed from `ca110fbd` to `6602f407`.

## Work-order status

| Order | Result | Evidence / remaining limit |
| --- | --- | --- |
| WO-00 | Complete | Named revision and dirty inventory; verified private DB/files/source backup; desktop/mobile baseline screenshots; exact restore rehearsed on disposable 8101. |
| WO-01 | Complete | Live 8100/8101 Page-permission and asset-card parity; search empty state; simulated absent/forbidden assets in unit tests. |
| WO-02 | Substantial, not complete | 21 Studio routes, custom-period native register/VAT parity, real XLSX reopening, RTL/mobile/actions/export and session recovery pass. Main's entire 31-check suite was not transplanted unchanged; previous-period and asset-failure cases still need a dedicated release-gate pass. |
| WO-03 | Complete | Effective Arabic dictionary: `Standard` → `قياسي`, theme `Ledger` → `دفتر`, accounting `Ledger` → `دفتر الأستاذ`. All 16 manifest assets return HTTP 200; build and scoped Studio checks pass. |
| WO-04 | Complete on disposable data; limited on live pilot | Native POS checkout/hold/replay/return and payment workflow, invoice actions, queues, PDFs and role tests passed on 8101. Read-only 8100 POS shell passes, but its existing shift is stale; no live 8100 sale was forced. |
| WO-05 | Complete for sampled roles and data | Finance/Journal/Banking routes and native APIs pass for Administrator and deny Guest; Stock Entry, reference guidance and Python permission tests pass. |
| WO-06 | Complete for synthetic rehearsal; production-source verification remains separate | Distinct synthetic source site/database and a restored target exercised success, duplicate replay protection, a native failed-row receipt plus downloadable CSV, a template-warning exception with no leaked warning text, and a corrected packet linked to the previous receipt digest. Corrected native import succeeded; reconciliation opened as a draft, never as accepted. A production-source dataset and completed reconciliation sign-off remain out of scope/unverified. The synthetic target was restored to baseline afterward. |
| WO-07 | Partial | Focused live checks for Home, invoice, Real Estate, POS, Reports, Studio, login, RTL/mobile and single scroll owner passed; 471/471 static Node tests and migration Python tests passed. The full legacy UI smoke run is not green (details below). |
| WO-08 | Pilot preview deployed; formal gate open | 8100 serves the reviewed source and asset hash. Fresh pre-deploy private backup, post-deploy live checks and rollback source are recorded. No production promotion or release claim. |

## Verification detail

Passed:

- `node --test tests/*.test.cjs tests/*.test.mjs`: **471/471**.
- `python -m unittest tests.test_migration_scope -q`: **21/21** (including restored-site, replay and template-warning regressions).
- `npm run build` and `git diff --check`.
- 8101 disposable checks: Studio 21/21 routes, Sales/Purchase Register and VAT-to-GL parity for September 2026, one exported XLSX reopened with 31 populated rows, commercial PDFs in Arabic/English A4/thermal, transaction workflow, POS backend/role and Market Tiles checks, finance/stock/reference checks, scroll and pilot visual acceptance.
- 8100 post-deploy read-only checks: Reports permissions/search, Studio/native register/VAT parity, Home/invoice/Real Estate visual acceptance, six login variants plus Arabic switch and A/AA audit, finance routes and Guest API denial, POS desktop/mobile shell, desktop/mobile scroll ownership, and all 16 asset URLs HTTP 200.
- 8100 effective translation dictionary verified at runtime. No synthetic UOM or migration rehearsal mode is present on 8100.

The full `tests/smoke.mjs` run on 8101 was stopped after roughly half an hour because it had already failed multiple pre-pilot visual expectations and intermittent WSL/DB-shell calls, and was only partway through approximately 482 checks. Observed stale checks included the original form-section/footer assumptions; one site-data assertion found the pre-existing `smoke-seed-1790103142112` branding value. A Theme Settings double-save assertion also failed in the resource-constrained run. The disposable site's DB and files were then restored from the verified baseline, rather than relying on an interrupted suite's `finally` cleanup. **Do not report the full smoke suite as passed.** The machine was using all 3 GiB of WSL swap while 8100 and 8101 ran together. The 8101 containers were stopped after acceptance, retaining their volumes and evidence. Its visible `rc20.localhost` site has no synthetic UOM/run and rehearsal mode is off.

## Recovery and release boundary

Private baseline and screenshots: `C:\Users\abdul\Documents\Codex\2026-09-05\loc-2\work\experiments\editorial-pilot\pilot-integration-backup-20260926-1743`. The initial source archive is `source-working-tree-wsl.tgz`. A fresh 8100 **pre-deploy** DB/files/site-config backup is in its `predeploy-8100` subdirectory, prefix `20260926_203908-rc20_localhost`; the three gzip archives passed integrity checks. The database SHA-256 is `D1AC09A4C36B7F74D1DE2F9876A643A03CC8A0A005F12317B6A5B817DE2B0D85`. The final post-integration source/build, including the inherited dirty pilot work, is separately archived as `source-deployed-8100-20260926-2120.tgz` (1,033 entries listed successfully; SHA-256 `86D163603CFE1793B20A5C713A8E6F281B91A3066E8B18383BEE021B2BF6AC3C`). This private archive is a reproducibility artifact, not a Git commit. Earlier preview archives are retained separately.

Rollback should first stop writes to the pilot, restore the archived source and pre-deploy DB/files to **only** the `bunoodpilot` project, then rerun the 8100 focused acceptance. The restore procedure was exercised on the disposable project; it was not executed against 8100 after deployment. Do not put these backups or site configuration into Git.

Before a formal WO-08 sign-off or production promotion: (1) update and run the full UI smoke against the approved pilot presentation on adequately resourced hardware; (2) complete a real-source migration and reconciliation sign-off if migration is in the launch scope; (3) test a current, authorized 8100 POS shift without altering active books for convenience; (4) perform the remaining Studio comparison/error-path gate; (5) review and commit the complete dirty pilot source/build intentionally, or promote the recorded private release artifact through an approved process. Production promotion requires separate approval.
