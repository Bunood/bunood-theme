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
  focus actions with F1/F2/F3/F4/F6/F7/F10/F11 shortcuts and the
  browser-safe Alt+I item shortcut;
* native Customer/Supplier Quick Entry when the current user may create the party;
* a blank, directly editable Item row that is always ready in a draft—there is no
  separate item-search gate or first-line Add Item step;
* native Item Link search inside that row, explicit Add Line for additional rows,
  barcode text entry, and camera scanning where Frappe's scanner is available;
* automatic consolidation when the same item is added again: the existing native
  row quantity increases instead of creating a duplicate line. Lines remain separate
  when UOM, price, discount, warehouse, tax, batch/serial, delivery date, margin, or
  accounting context differs;
* quantity, unit, rate, a currency-amount line discount by default, item tax
  template and warehouse per line; percentage discounts remain available in
  Advanced mode;
* document dates, stock/warehouse, currency, price list, payment terms and customer
  PO or supplier bill details where the DocType exposes them;
* invoice-level discount and tax controls;
* native net, discount, tax, rounding and grand totals, including the official SAR
  vector; and
* native Save, Submit, Print, Delete and Payment Entry mapping, including an explicit
  mixed Cash/Network allocation. Native validation and confirmation dialogs remain
  authoritative.

## Mixed Cash and Network settlement

On a Simple Sales Invoice, choose **Mixed Payment** in **Settlement Method**, then
submit the invoice. Bunood asks for the Cash amount, Network amount, Network reference
number, and reference date before anything is posted. The two amounts must equal the
invoice's current outstanding balance exactly.

Mixed Payment is a workflow choice on the invoice, not a new Mode of Payment. After
explicit confirmation, Bunood delegates to ERPNext's native `get_payment_entry`
mapper and submits two ordinary Payment Entry documents: one with **Cash** and one
with **Network**. The whole request is transactional; a failure does not leave a
partially paid invoice.

The result can be found without a Bunood-only report:

* search **Payment Entry** to open either receipt; both reference the original Sales
  Invoice in their References table;
* open the submitted Sales Invoice and use its native connections/payment history;
* use **General Ledger** to see the Cash account and Network clearing account entries;
* use **Accounts Receivable** or the invoice list to verify the remaining outstanding
  amount; and
* use bank/merchant reconciliation against the Network clearing account when the
  acquirer settles the card proceeds.

POS keeps ERPNext's native Payments child table for split tender. The bill workbench
does not create a `Mixed Payment` master, custom ledger, custom accounting DocType,
or parallel reporting engine.

## Accounting, stock and permission safety

There is exactly one invoice and one calculation path. Native model setters,
transaction triggers, taxes-and-totals, grid hooks and server validation own prices,
taxes, precision, permissions, stock and ledger posting. The workbench adds no
browser store, calculation engine, posting bypass, custom ledger, or custom payment
document. Its mixed-settlement endpoint only validates the allocation and orchestrates
ERPNext's native Payment Entry mapper/controller inside the request transaction.

A draft does not affect accounts or stock. Submit uses `frm.savesubmit()`. Payment
uses ERPNext's reviewed `get_payment_entry` mapping and is available only after
submission. Delete, Print, row add/remove, link queries and Quick Entry all use
Frappe's native APIs and current field/grid permissions.

Submitted Quotations expose **Create Sales Invoice** only when the current user may
create Sales Invoices. It delegates to ERPNext's native Quotation mapping method so
items, taxes, references, permissions, and downstream auditability stay upstream-owned.

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
Automatic consolidation uses native quantity setters and native grid removal, so
ERPNext remains responsible for totals, taxes, pricing, stock, and validation.
Each item row exposes only **Remove**. To increase quantity, edit the quantity field
or add the same item again and let automatic consolidation update the existing row.
On short desktop windows, the document intro remains in normal page flow so it
cannot collide with or appear below the item sheet's sticky column header.
The preferred-payment selector spans otherwise unused grid space and does not add
a separate prose row, keeping the party area compact in Arabic and English.
Desktop item rows use the full available invoice width and expand with the page;
the sheet has no internal horizontal or vertical scrollbar. Customer context and
preview remain available from the toolbar as an on-demand drawer.
White, alternating gray, and focused green row surfaces paint the complete grid
row, including the item, amount, and action columns.

## Build and payload decision

`build.mjs` includes `sales_bill.js` and `simple_forms.js` in the immutable desk
bundle. On 2026-09-01 the desk JS ceiling was deliberately raised from 116,000 to
120,000 gzip bytes for the full-page bill workbench and business-form Simple/Advanced
controllers. No UI dependency was added.
