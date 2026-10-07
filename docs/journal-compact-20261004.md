# Compact Journal Entry source update

This update extends `release/2026-10-03-as-is` without a merge or production
promotion. The app remains on the existing 0.50.0 candidate version; no tag,
database migration, core engine change, or deployment lock update is included.

The Simple-mode page has one compact forest-green action toolbar, a desktop row
for entry type/company/posting date, native totals before the native account
grid, and expandable reference details. Native required dependencies and existing
reference values automatically expand those details. Unexpected required fields
stay visible. Advanced mode restores the original native control nodes/order.
Nonzero native differences are highlighted without recalculating amounts.

Validation on the exact release-branch sources and rebuilt assets:

- 49 targeted Node tests pass (form composition/restoration, required references,
  native action permissions/lifecycle, journal navigation and Arabic labels).
- Clean `npm run build` passes all source, RTL, breakpoint and payload guards.
- `npm run i18n:check` reports complete translation coverage.
- Browser checks pass against these exact branch bundles on the local 8100
  backend: 1600×900 and 1366×768 show context, totals and the first account row
  without scrolling; 768px/390px fit controls without whole-page overflow;
  bank references are required and visible; existing values expand; totals refresh;
  Simple/Advanced preserve values and wrapper identity; submitted entries remain
  read-only. LTR geometry also fits. No JavaScript errors were captured.
- Only unsaved browser documents were modified; no financial posting occurred.

The fresh build changes only the main Desk CSS/JS bundle identities; all other
compiled bundles retain their prior hashes. The small payload increase is
recorded in payload-budget.json with finite limits; no guard is bypassed.

This is targeted page acceptance, not certification of the complete ERP or a
production rollout. Previous release holds and deployment-promotion checks remain.
