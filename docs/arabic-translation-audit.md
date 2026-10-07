# Arabic localization audit — isolated 8100 pilot

Measured 2026-09-28 against the pilot's installed apps using
`node tools/arabic-coverage-audit.mjs`. The generated, itemized snapshot is
`artifacts/arabic-audit/coverage.json` (local-only, not a release artifact).
The counts are extracted source messages without an Arabic runtime answer;
they are **not** a count of visible defects. They include technical identifiers
and dormant screens, and some separately bundled CRM/Helpdesk UI needs its own
front-end audit. The 12 app totals overlap for shared source text.

| Installed app | Unanswered / extracted |
| --- | ---: |
| Frappe framework | 513 / 6,315 |
| ERPNext | 1,745 / 10,212 |
| HRMS | 1,447 / 2,566 |
| Frappe CRM | 1,221 / 1,744 |
| Telephony | 92 / 146 |
| Helpdesk | 608 / 868 |
| Payments | 120 / 157 |
| KSA Compliance | 41 / 352 |
| Bunood Real Estate | 740 / 1,560 |
| Bunood Theme | 83 / 3,043 |
| Bunood Setup | 0 / 30 |
| Bunood Engineering | 81 / 1,440 |

This change fixes the reported All Apps names and Trial Balance **display**.
It also reviews the 119 source strings missed by the theme's own catalog gate:
Home, invoice, reports, POS, and payment-origin terminology now has authored
Arabic in `locale/ar.po`. The theme's own build gate passes for its configured
source set. The 83 remaining theme messages above come mostly from the
fixed-asset workbench source, which is not in that build gate and whose page
currently declares an asset bundle that the pilot build does not register.
That is a separate activation/coverage defect, not evidence that the page has
been translated or tested.

## Accounting-language contract

- Store Account identifiers, company abbreviations, report data, and historical
  links unchanged. Translate only rendered labels in Arabic sessions.
- Use **مدين / دائن** for debit / credit, **الرصيد الافتتاحي / الرصيد الختامي**
  for opening / closing balances, **الذمم المدينة / الدائنة** for receivables /
  payables, and **سند قبض / سند صرف** for receipt / disbursement vouchers.
- Correct misleading inherited names in the display adapter: e.g.
  “Stock In Hand” is **المخزون في المستودعات**, not a machine rendering of
  “stock”; “Write Off” is **شطب الأرصدة**, not “لا تصلح”.
- Do not translate proper names, user-authored account names, fiscal codes,
  DocType keys, or print/export values merely by replacing substrings.

## Remaining work before claiming full Arabic coverage

1. Triage the itemized missing list against actual pilot routes and roles.
   Start with Real Estate and Engineering finance workflows, then ERPNext
   invoicing, banking, journal entries, financial statements, HR, CRM and
   Helpdesk. Capture Arabic and English screenshots, empty/error states, and
   RTL overflow at desktop and phone widths.
2. Author and review translations manually in the owning app's PO catalog
   where possible. The user chose manual translation only. The pilot's
   provider is not configured; no external request or spend occurred.
3. Add the fixed-asset workbench/page to the build and translation source
   inventories when that route is activated; currently the pilot does not
   register its bundle. Translate its workflow language before exposing it.
4. Re-run catalog, browser, accounting-link, print/PDF, export and permission
   tests. Native report export and stored names must remain canonical while
   visible labels follow the user's language.

The original local server was not modified. All implementation and live checks
in this pass target the isolated 8100 pilot.
