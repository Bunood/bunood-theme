# Bill workbench

## Product contract

New Sales Invoice and Purchase Invoice documents open in Bunood's full-page
Simple workbench by default. It is part of the form page, not a dialog. **Advanced**
reveals the normal ERPNext form for the same `frm.doc`; switching modes never copies
or converts data.

The supplied reference informed the task order and keyboard emphasis: persistent
actions, party first, fast catalog search, editable rows, document options, and an
always-visible total. Bunood does not copy its layout, palette, component styling,
imagery, code, or information density.

## Simple bill capabilities

The Sales and Purchase profiles share one controller and vary only their native
party, price-list, mapped-source and document-option fields. The workbench includes:

* New, Save draft, party focus, Delete, Print, Payment, Discount, Reload and item
  search actions with F1/F2/F3/F4/F6/F7/F10/F11/F12 shortcuts.
* native Customer/Supplier Quick Entry when the current user may create the party;
* native Item Link search, barcode text entry, and camera scanning where Frappe's
  scanner is available;
* quantity, unit, rate, line discount, item tax template and warehouse per line;
* document dates, stock/warehouse, currency, price list, payment terms and customer
  PO or supplier bill details where the DocType exposes them;
* invoice-level discount and tax controls;
* native net, discount, tax, rounding and grand totals, including the official SAR
  vector; and
* native Save, Submit, Print, Delete and Payment Entry mapping. Native validation
  and confirmation dialogs remain authoritative.

## Accounting, stock and permission safety

There is exactly one document and one calculation path. Native model setters,
transaction triggers, taxes-and-totals, grid hooks and server validation own prices,
taxes, precision, permissions, stock and ledger posting. The workbench adds no
browser store, API endpoint, calculation engine, posting bypass, or payment write.

A draft does not affect accounts or stock. Submit uses `frm.savesubmit()`. Payment
uses ERPNext's reviewed `get_payment_entry` mapping and is available only after
submission. Delete, Print, row add/remove, link queries and Quick Entry all use
Frappe's native APIs and current field/grid permissions.

## Advanced-only cases

Returns, POS invoices, debit/credit notes, amendments, mapped order/delivery/receipt
lines, incompatible permissions, and non-editable item grids open in native Advanced
mode. These cases carry allocation, provenance or reversal semantics that should not
be hidden behind an ordinary bill surface.

## Interaction rules

Changes run through one serial queue tied to the active form. Save and mode switching
flush pending native controls first. Invalid numeric input stays visible and blocks
Save until corrected or reverted. Row controls survive recalculation; removing a row
cancels its pending edits. Reload asks before discarding a dirty document. The
official SAR vector is physically left of the number in both LTR and RTL layouts.

## Build and payload decision

`build.mjs` includes `sales_bill.js` and `simple_forms.js` in the immutable desk
bundle. On 2026-09-01 the desk JS ceiling was deliberately raised from 116,000 to
120,000 gzip bytes for the full-page bill workbench and business-form Simple/Advanced
controllers. No UI dependency was added.
