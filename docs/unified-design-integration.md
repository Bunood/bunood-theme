# Unified Bunood interfaces

Owner scope: Sales, Purchase, Stock and Accounting share one navigation and
visual composition, alongside Engineering, Real Estate and CRM. All financial
and inventory writes remain native ERPNext document operations.

Verified team source: `demo1/native-erp-ui` at
`2108af33f12ea53d95f142f68ff02544c98d6d40`. Its invoice, journal and SCSS sources
match `release/2026-10-03-as-is` at `1eaa6a9`.
The supplied `codex/bunood-demo1-shell` branch is absent from the remote.

The previous integration retained invoice/form controllers but omitted supporting
composition partials: editorial pilot, sidebar layout/standard, document fields,
outcomes, field contrast and role home layouts. Controller parity alone did not
establish visual parity. The compact journal also depended on html.bunood, absent
in Original appearance. These are separate concrete defects.

Integration proceeds by porting the owned composition onto maintained tokens,
retaining native permission checks, tax/rounding defaults, returns, amendments and
stage mappings. Do not replace financial controllers with the source snapshot.

Local integration now includes the owned invoice composition, collapsed invoice
details, native Stock Entry/Reconciliation and Warehouse composition, a read-only
Stock Page, and permission-filtered native document associations in Bunood Home.
The Stock Page uses native client queries and native unsaved document creation;
it introduces no inventory engine or balance calculation.

The subsequent team invoice composition port restores the desktop party/date
strip, four-column company/currency/price-list/warehouse context, compact stock
settings, full-width item sheet, active-row surface and quiet total panel from
the source editorial rules. Shared tenant tokens replace source hard-coded colors;
native invoice controllers are unchanged. Final CSS is a4e0703d, 40,165 gzip bytes,
with an explicit 40,300 ceiling for this scoped addition. The 106 focused invoice
checks pass. Mobile retains its single-column adaptation and readable header.

Local verification: 294 interface tests and 14 Home Python tests pass. Build,
payload and Arabic coverage gates pass; 19 assets return HTTP 200. Global JS is
187,708 gzip bytes, Desk CSS 39,895. Browser inspection confirmed the shared
sidebar from Home to Stock to native movement, native stock records, invoice
detail disclosure, a readable tools menu at 320 pixels, and no whole-page
overflow for Purchase Invoice at 320/390 and Stock Reconciliation at 390.
Mobile invoice heading contrast failed before the correction: display:contents
removed its painted background while its title inherited white. It now uses
native ink on mobile while preserving the deep-green desktop header.

Remaining acceptance: complete cross-module navigation including direct links
and report subroutes; browser verification with limited roles; Warehouse screen;
and final full release acceptance. The deployment wrapper caught transient 502s
after restarting the local bench; services were restored and independently
verified with all 19 assets serving. Production has not been updated.
