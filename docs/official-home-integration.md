# Official Home integration, 0.51.0

The 0.50.0 integration brought across business forms but deliberately retained the
owner's Home. That did not fulfill the requested team navigation experience. This
change adds `/desk/bnd-home`, a native Page with a lazy, owned dashboard and a
permission-filtered grouped navigator. It does not replace native workspace DOM.

Source comparison: team `1eaa6a9b9263ba870e419d051525cb79f7d1465c`,
`public/js/bunood.js` role/navigation composition at lines124–344 and daily-work
dashboard at14273 onward. The official base is
`218016ec18121a2870bd38042b5e56ed37838917`. Folder names are not provenance: the local team/official paths
can refer to the same checkout; comparisons use immutable Git objects.

| Team capability | Official result |
| --- | --- |
| Welcome, date, company context | Owned Home header and native-permission Company selector. Filter edits are read-only; a separate explicit Save stores only the current user's validated scope. |
| Grouped product navigation | Transactions, Operations, HR, Reports and Setup from native allowed workspaces; custom workspaces remain discoverable. |
| Role-focused navigation | Roles rank permitted workspaces; they never grant permission or remove other permitted destinations. |
| Home reachable from other modules | A native Home Page link is added to existing permitted sidebar payloads without replacing their links. A separate Home sidebar groups only native allowed workspaces. |
| Uncustomized initial landing | Native boot Page selection and preloaded Page document when the default is unset or the generic `workspace`/`desktop` sentinel has no real Page/Workspace. Native user Workspace, Role home, `bnd_home`, valid explicit destinations and earlier app selections survive. No persisted default is overwritten. |
| Frequent actions | Native creation routes for documents with read and create permission. |
| Five role views | Overview, Accountant, Sales, Collections and Cashier are offered by native read capabilities. Role ranking chooses an initial view without granting access. |
| Scope | Five periods, permitted company, all-company comparison and permitted salesperson. Explicit Save writes four registered Home STATE keys, never global defaults, other users or the existing appearance/landing preferences. Stale saved values are revalidated against current permissions. |
| Five operational KPIs | Orders, booked value, invoiced value, outstanding receivables and average order value retain the team definitions and exact native population filters. Company-currency values are labelled; returns and negative balances remain signed. |
| Today's work / attention | Drafts, open quotations, overdue/upcoming balances, stock below reorder and ZATCA exceptions use permission-filtered native reads. Administrators also see permitted failed-job/error counts. Missing or failed sources remain unavailable, distinct from zero. |
| Trends and invoice status | Read-only native invoice populations, visible trend bars, status counts and exact server-provided List filters. Null due dates are retained in the appropriate open population. |
| Collections | Current overdue and due-soon counts, amounts and individual invoice routes, distinct from selected-period sales. |
| Cashier | POS receipts, period sales, today's sales/returns, held drafts and the current user's shift evidence. Each source has native drilldowns; actual POS remains the owning controller. |
| Accountant | Current balances, native document queue, bank transaction evidence and close phases reuse the existing accounting/close readers. No parallel ledger or synthetic reconciliation assertion. |
| Process navigation | The complete four team lanes: Quote to cash, Procure to pay (including RFQ/Supplier Quotation/Purchase Receipt), Stock control and Close/VAT. Native metadata selects Form for singletons and company filters only where the document actually has that field. |
| Report shortcuts and configuration | The five original ERP report shortcuts use the existing Studio/native route adapter and native runnable-report list. Company/Accounts Settings and read-only administrative evidence remain separate from daily work. |
| All existing Theme Pages | Accounting, Journal, Report Studio, Finance Close, Banking, Assets, POS, POS Register, Quick Sale, Inbox and ZATCA use native Page permission gates. |
| Domain workspaces | Prominent Engineering, Real Estate and CRM routes use installed app-owned web permission functions. Legacy CRM uses its distinct pinned `crm.api.check_app_permission`; native CRM uses its own controller. Domain dashboards and business APIs are reused in their owning applications. |
| First-use and launch observations | Five first-use steps and twelve configuration checks reuse the existing pure classifiers over native readable evidence. Unavailable/external checks remain explicit; the UI only opens native records. No readiness work plan, decisions, tenant bootstrap, seeding or launch approval is imported. |
| Native report compatibility | Scoped Report extension, native report/export wrappers and lifecycle synchronization are registered for the separately reviewed report lane. Home source tests do not prove Arabic XLSX/PDF exports; actual report evidence remains pending. |
| Native owner appearance | Existing136 Theme settings, personal appearance, Q7 font, inline logo, print, invoice and journal controllers remain in their original files. Team raw color overrides are mapped to existing mode-aware tokens on the owned Home only. |

## Verification status

Initial navigation tests failed for the missing Home, then passed; regression tests
also caught the unregistered lazy payload ceiling and missing explicit landing
guards. The latest source renderer/navigation/extraction checks pass19 tests and
the site-free boot/domain checks pass12. The full combined business/Home Node
selection passed207 tests before the final additional role-order regression.
The focused19-test rerun verifies that subsequent change. These exercise actual renderer functions,
null versus zero, signed currency values and unchanged backend drilldown filters.
The first runtime candidate passed6 native Home tests and preserved the136-setting,
personal/default/language/custom-sidebar snapshot after migration. It also exposed
the generic-default landing, Dining sidebar association and mobile navigation
ordering issues, which are corrected in source but await the next runtime proof.
Native Home now has7 tests and the dashboard module11; their expanded actual-site
run is pending. Full dashboard/backend acceptance is pending; the initial candidate is not the
completed team-parity result.

The final combined source build exits0: Home CSS `d308da6a`3542/5000 gzip bytes and
Home JS `bc0c2fda`9096/9500. The initial navigation-only5500 JS budget was superseded
by the independently reviewed9500 ceiling for the full required dashboard,
scope persistence and configuration observations; Home CSS stays5000. Global
CSS `7f7c2fbc`39266/39500 remains unchanged, while global
JS `bbb909cc`187797/188000 includes the restored completed Simple forms. The payload
gate passes without raising either global ceiling. Finance Close `e914a5e3` handles
unavailable evidence without displaying null or a false negative. Latest Arabic extraction
covers2755 strings with8 existing exemptions, including
dynamic navigation/KPI/period/attention descriptors. New translations remain
machine proposals marked fuzzy, with all2904 original Arabic rows retained unchanged.

No production access, deployment, tenant seeding or financial write is part of
this change. Source checks do not establish runtime or image acceptance. The
runtime lane captures Arabic/light/dark/mobile evidence and exact original state
before any fixture changes; final receipts must replace this pending status.
