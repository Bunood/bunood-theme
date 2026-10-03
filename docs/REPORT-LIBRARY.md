# Report library and shared presentation

Updated 2026-08-31 against `verify.bunood.test` at `http://localhost:8080`.

## Local examples

The catalogue contains all 193 installed reports: 192 enabled across 18 modules,
plus the disabled entry for completeness. Screens were captured from existing
company data, not seeded transactions. Search, module/type/status filters,
native report links, table crops and selected Arabic/dark variants are included.

Open `http://127.0.0.1:8766/` while the local gallery server is running. Files and
capture/build scripts are in the current task workspace:

`C:/Users/abdul/Documents/Codex/2026-08-31/how-x20/outputs/reports`

`C:/Users/abdul/Documents/Codex/2026-08-31/how-x20/work`

To restart the gallery, serve only `outputs/reports` using Python's HTTP server
bound to `127.0.0.1`, port 8766. It contains local company information and must
not be published or served on a public interface without authorization.

Eight PDF examples cover General Ledger, Balance Sheet, Accounts Receivable,
Profit and Loss Statement, Sales Register and Purchase Register. General Ledger
and Balance Sheet also have separate RTL Arabic PDFs. Statements use portrait;
wider reports use landscape. Register examples use the native print column
selector for key invoice fields, including voucher identifiers; the live report
and export still retain every column. These are sample settings, not forced
site-wide defaults. Existing untranslated native labels and master data remain
unchanged; this work does not claim complete Arabic translation coverage.

## Shared implementation

- `_report.scss`: aligned native filter/summary/chart panels, consistent spacing,
  compact wrapping summary cards, accessible status colors and Pinned Slab
  header styling. Native filter behavior and virtual row sizing are preserved.
- `print/print.scss`: compact report filters and tables, mirrored RTL spacing,
  readable green/white headers under Brand Panels, and subtle subtotal washes.
  Existing managed invoice templates are unaffected by these report selectors.
- `printing/reports.py` and `printing/report_assets.py`: override only the native
  report PDF endpoint to canonicalize links to the installed Frappe print
  stylesheet. nginx drops the browser port from Host, so a same-hostname Origin
  may supply it. Exact known bundle paths alone are remapped. Native PDF proxy,
  allowed domains and external-resource restrictions remain unchanged; rendering
  delegates back to Frappe. This fixes the local PDF HTTP 500 caused by the
  browser-origin stylesheet URL being rejected by native PDF resource fetching.
- Four newly inspected native contracts were added to upstream pins without
  updating existing hashes. Print Style was synchronized through `_sync_style`.

## Verification and limits

- All 17 targeted `report:` browser checks pass, including en/ar, light/dark,
  desktop/mobile panel alignment and summary overflow, native selection and
  virtual rows, style previews and focus visibility.
- Four stylesheet-canonicalization unit tests pass locally and inside Frappe.
- Build, payload, 9,576 contrast pairs and the 29-file upstream gate pass.
- Eight PDF examples pass direction, paper orientation, text-boundary, readable
  minimum type, white header text and company/footer checks. All currently fit
  one page; this does not establish arbitrary multi-page export coverage.
- Gallery interaction checks cover search, module filters, preview/table tabs,
  Escape, mobile width, image/PDF files, Arabic PDF link and column disclosure.
- No business records were edited. Temporary language/theme verification changes
  were restored. This is targeted verification, not the full release suite.

Existing native defects are exposed, not disguised as successful examples:
`Review` fails on the removed `tabQuality Action.document_type` SQL column;
`Available Serial No` did not initialize after two attempts. Prepared reports,
required filters, empty company data and country-specific reports have separate
catalogue statuses. Repairing native ERPNext reports is outside this styling pass.

Serving assets: desk `bunood.f506be76.css`, print `bunood-print.d84aeed1.css`,
unchanged JavaScript `bunood.4f98b21b.js`. No commit or push was made.
