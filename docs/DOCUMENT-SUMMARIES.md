# Document summary placement

The summary is a read-only review sheet after the native form controls, not a
replacement for the form or a universal dashboard. It is limited to transactions
where reviewing parties, amounts, quantities and line items together is useful.

| Workflow | Forms with a summary |
| --- | --- |
| Sales | Quotation, Sales Order, Delivery Note, Sales Invoice |
| Purchasing | Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice |
| Accounting | Payment Entry, Journal Entry |
| Inventory | Material Request, Stock Entry, Stock Reconciliation |
| Manufacturing | Work Order, Subcontracting Order, Subcontracting Receipt |

User/profile, Role, User Permission, system/print/theme settings, Company,
Customer, Supplier, Item, Project, Task, logs, and other unlisted forms retain
their native presentation without a duplicate summary. Singleton and child-table
forms are excluded defensively. Unknown/custom DocTypes do not opt in merely
because they have fields, tables, or a Submit button.

Eligible drafts retain live previews of edits before saving; saved transactions
retain their review sheet. Hidden fields, tabs, dependency-controlled fields and
restricted grid columns continue to follow native Frappe visibility. No document
values, permissions or native controls are changed. The existing form-style
opt-out remains respected.

The eligibility list and lifecycle cleanup live next to `summary_data()` in
`bunood_theme/public/js/bunood.js`. Check a new type's review purpose before adding
it there. Excluded forms do not install summary listeners or mutation observers;
any previous summary state is removed if eligibility changes.

Focused regression checks in `tests/smoke.mjs` cover excluded forms, retained
transaction forms, placement after native fields, navigation away/back, live
draft edits, permission/dependency visibility, English/Arabic and mobile layouts.
