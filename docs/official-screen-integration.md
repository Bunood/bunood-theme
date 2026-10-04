# Official edition: simplified business screens

The release is based on official 8a6ff1e plus the reviewed integration ancestry 4ef671d. It adds the team business screen controllers, not the team tenant/bootstrap platform. No release version or tag is assigned here.

## Coverage

| Team source | Official destination | Integration |
| --- | --- | --- |
| sales_bill.js / _sales_bill.scss | /desk/sales-invoice/new and /desk/purchase-invoice/new; existing invoice forms | Full native-field composer, items, customer/supplier, totals, native save/submit, payment checkout and delivery controls; Advanced restores native form. |
| simple_forms.js | Native Quotation, Sales Order, Delivery Note, Purchase Order, Purchase Receipt, Material Request forms | Task panels and actions over original native fields, with reversible Advanced mode. |
| simple_forms.js / _journal_compact.scss | /desk/journal-entry/new and /desk/payment-entry/new | Simplified transaction panels retain native posting and document permissions. Customer, Supplier and Item masters receive related task forms. |
| journal_workbench.js + journal_workbench.py | /desk/bnd-journal-workbench | Reviewed integration provides the journal review and draft operations. |
| accounting_desk.py | /desk/bnd-accounting-home | Team read-only accounting queues and bank evidence, wrapped in an explicit company and Accounts role check. Linked from Reports landing and its native Workspace. |
| report_landing.js | /desk/reports | Searchable permission-filtered entry to all custom finance/report Pages. |
| report_studio.js | /desk/bnd-report-studio | Reviewed sales, purchasing and accounting catalogue and custom results; retains newer official permission and null guards. |
| report_workbench.js / _report.scss | Native /desk/query-report routes | Filter scope, numeric presentation and retry recovery, preserving native query execution and export. |
| finance_close.js, banking_workbench.js, asset_workbench.js | /desk/bnd-finance-close, /desk/bnd-banking, /desk/bnd-asset-workbench | Reviewed custom close, bank and asset desks. |
| invoice_delivery.py, zatca/delivery.py | Invoice email/PDF/XML actions | Narrow permission-checked delivery dependencies, using the site's native PDF renderer. |

Bunood Selling and Bunood Buying stage Workspaces are supplied by the setup application; native Selling and Buying remain available. Accounting navigation is owned here.

## Preserved behavior

Owner Q7 font and bounded inline public/private logo handling are restored from 1db2a8d. Existing print layout and site renderer remain intact. Invoice controllers do not force `disable_rounded_total`; no team finance validation hooks, ZATCA enqueue API, tenant seeds, readiness gates, onboarding replacement or Home overwrite are imported. Installation only adds absent invoice settlement/payment-origin metadata and preserves existing definitions. Original real estate, engineering and manufacturing forms do not opt into Simple mode. Original login and public pages are unchanged by this screen import.

## Validation

- Build and payload gate pass: Desk CSS 39,193 gzip bytes, Desk JS 187,526; measured caps 39,500 / 188,000 retain a small explicit margin for the invoice/task/report controllers.
- 148 invoice, simple-form, Reports landing, Report Studio and routing Node tests pass; 21 finance/bank/journal/asset Node tests pass.
- 31 site-free Python tests pass, covering company/role boundaries, source availability, owner logo behavior, Page permission navigation and finance/print regressions.
- Arabic coverage passes: 2,089 source strings, eight existing exemptions.
- Delivery host run: 18 tests and 13 subtests passed, two HTML-preview cases require BeautifulSoup in the Frappe runtime. Root acceptance must rerun these there.
- Full smoke requires the configured live Frappe site; local default smoke stopped before tests at Docker pipe access. Parent release lane owns site migration, browser acceptance and financial scenarios. No claim of runtime acceptance is made by these source checks.
