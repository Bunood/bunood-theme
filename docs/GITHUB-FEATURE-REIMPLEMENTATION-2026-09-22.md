# GitHub feature reimplementation review — 2026-09-22

## Rule for this review

Remote commits are a read-only feature specification. They are not merged,
cherry-picked, rebased, or used to replace the current working tree. Functional
ideas are accepted only when they preserve the current Bunood interface.

Remote head reviewed: `dda9181` (`v0.47.1`).

## Commit decisions

| Commit | Remote change | Decision |
| --- | --- | --- |
| `fbc6fee` | Records a 544/544 verification run and two local Docker/Theme Settings observations. No product code. | Do not implement; documentation-only. |
| `d97d12f` | Corrects Arabic `Standard` to `قياسي`; distinguishes the visual theme named `Ledger` from the accounting ledger through a translation context. | Reimplemented locally with focused tests. No visual change. |
| `ae7d293` | Adds the Report Studio engine, route, Reports workspace shortcut, scoped bundle, Arabic strings, Excel export, printing, periods, KPI deltas, charts, curated tables, entity statement picker, and report-specific composition. | Already present in the local system. Keep the local implementation, which also has gallery search and scoped CSS loading. |
| `cdc1856` | Version and roadmap metadata for `v0.47.0`. | Do not copy; release metadata does not describe the local product state. |
| `c3b7121` | Removes a superseded generated CSS asset and records payload measurements. | Already handled by the local content-hashed build and asset reaper. |
| `ec5a53a` | Restyles Report Studio, corrects invalid border declarations, regenerates its asset manifest, and makes test fixtures choose the busiest invoice month. | Do not copy the styling. The local Studio already has valid ruled borders, current asset paths, separate scoped CSS, and live acceptance coverage. The busiest-month change affects only the remote test fixture. |
| `dda9181` | Version and changelog metadata for `v0.47.1`. | Do not copy. |

## Report Studio capabilities already retained locally

- Selling, Buying, and Accounting catalogues.
- Sales and purchase registers, item-wise registers, gross profit, returns,
  order analysis, procurement tracking, supplier summary, General Ledger,
  receivables, payables, Trial Balance, Profit and Loss, Balance Sheet,
  Statement of Account, and VAT Return.
- Today, week, month, quarter, year, and custom periods.
- Previous-period comparisons and KPI deltas.
- Charts, sparklines, readable tables, tree rows, filtering, printing, classic
  report handoff, and native XLSX generation.
- Customer, supplier, employee, and account statement selection.
- Permission-preserving calls to ERPNext's native query-report engine.
- Local additions: cross-domain report search, explicit no-results feedback,
  route-scoped CSS and JavaScript loading, and links to the Banking, Finance
  Close, and Journal workbenches.

## Files changed by the accepted localization behavior

- `bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js`
- `bunood_theme/translations/ar.csv`
- `bunood_theme/locale/ar.po`
- `bunood_theme/locale/false_friends.json`
- `bunood_theme/locale/inherited.ar.txt`
- `tests/translation-context.test.cjs`

No stylesheet, template, page layout, component structure, or route was changed.
