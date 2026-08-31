# Quick bill

## Purpose

The reference supplied on 2026-08-31 suggested a useful order: customer, products,
editable lines, and an always-visible total. Bunood uses that workflow, not its
layout, palette, toolbar, imagery, or code. The result is a focused native dialog
with Bunood panels, green primary actions, a totals rail, and a sticky action bar.

Open **Home → New sales invoice**, or **Quick bill** on an eligible Sales Invoice.
Choose/create a customer, search the existing catalog, add lines, edit quantity and
price, then **Save draft and review**. **Full invoice** retains edits on the same
native document. Ctrl+Enter adds the selected product; Ctrl/Cmd+S saves a draft.
Escape leaves the quick view only when an autocomplete popup is not handling it.

This first version deliberately saves drafts. It does not submit, charge a card,
record payment, or print automatically. Returns, POS documents, debit notes,
amendments, mapped order/delivery lines, and non-editable grids use the full invoice.
Tax templates, discounts, payment allocation, batches/serials, accounting dimensions,
and advanced fields remain available there. This is not a replacement POS terminal.

## Accounting and permissions

* There is exactly one document: the current native `frm.doc`. Nothing is persisted
  in browser storage. No secondary calculation, tax, price, save, or posting API exists.
* Native Link controls and queries select customers/items. Native model triggers
  and `items_add` supply defaults and recalculate prices, taxes, precision and totals.
* Quantity/rate are native bound controls. Positive quantity/nonnegative price are
  early UX checks for ordinary sales; ERPNext server validation remains authoritative.
* Duplicate product selections remain distinct lines. Native grid removal executes
  its before/remove hooks; custom code never splices the child table.
* Form/grid/field editability and add/delete restrictions are checked again at mutation
  time. New-customer creation uses native Quick Entry and rechecks customer writability.
* `frm.save("Save")` must confirm success, produce a persisted name, and leave the
  form clean before the quick view closes. A resolved save promise alone is insufficient.
* Native confirmation dialogs, validation failures, and server errors remain visible.
  Save does not invoke Submit or write GL, stock ledger, or Payment Entry records.

## Interaction safety

Changes run in one queue tied to the same active form/document. Save/close lock
editing and capture pending values before awaiting triggers; clicking a button must
not lose the last input. Row controls survive recalculation, preserving focus.
Numeric typing updates native totals after a short debounce. Pending raw inputs and
invalid values survive other field updates. A correction, removal, or **Revert invalid
edits** clears the relevant error. Removing a row cancels its timers and queued stale
callbacks cannot create an invisible validation error for that row.

The dialog owns only `[data-bnd-part="sales-bill"]`. It does not move, hide or reorder
the underlying generated form. Logical CSS follows the page's LTR/RTL direction.
SAR amounts use the existing official SVG mask, physically left of the number in
both languages. Other currencies retain native formatting. Rounding uses the native
disable-rounded-total flag, including a valid rounded total of zero.

## Reviewed upstream dependencies

The preflight pin set includes native form/control lifecycle and permissions, grid
add/remove hooks, model setters and metadata, Link/Quick Entry/Dialog, request queues,
number formatting, Sales Invoice, transaction, sales-common, and taxes-and-totals.
Seventeen additional source hashes were recorded without changing existing hashes.
The global `form-refresh` event precedes field refresh; the toolbar action waits for
native refresh/requests. Home opens through the native after-load hook.

`build.mjs` concatenates the companion into the immutable desk JS bundle. The i18n
scanner reads it too. Budget ceilings increase to 27,500 bytes for desk CSS and
116,000 for desk JS gzip: this consciously pays for the extra editor and safeguards,
without adding a UI library. Existing website/email/print ceilings are unchanged.

## Validation on the local site

Test target: `verify.bunood.test` at localhost:8080, Frappe 16.31 / ERPNext 16.33.
Measured combined local build: JS `a4c03270`, CSS `d94519d6`.
The local working tree contains earlier user customizations; the isolated Quick bill
commit's regenerated bundles can have different hashes. The deploy above included
those earlier customizations without reverting them.

Observed through the in-app browser:

* Home launch and existing draft launch; new native Customer `QB-TEST-20260831 Customer`.
* Native customer/item search, separate duplicate SKU rows, quantity/rate updates:
  2 × 125 = 250, then immediate Save of quantity 3 produces a 375 draft.
* Invalid quantity blocks saving while the existing total remains intact; correction
  to the previous valid value, invalid-price reversion, and invalid-row removal.
* Editing a duplicate to -4 then removing it before debounce completes leaves one
  valid row and zero invalid inputs; keyboard save succeeds afterward.
* Native date-change confirmation appears during save and is respected.
* Full-invoice handoff retains edits. Saved draft `ACC-SINV-2026-00006` can reopen.
* English and Arabic, light and dark; RTL mirrored layout and official SAR SVG left
  of each number. At 1280×720 the English first row ends at y604.5, before the sticky
  footer begins at y637.1. No horizontal document overflow in the Arabic check.
* Original Arabic/dark preferences were restored.

Five focused Node tests cover eligibility, rounding to zero, grid restrictions,
queue failure/stale work, and false-success save promises. A deliberate broken
eligibility guard is used to confirm the test can fail. Build guards, source parsing,
i18n coverage and the palette contrast gate run separately. No claim is made that
the complete ERPNext regression suite or the standalone Playwright suite ran.

Read-only before/after fingerprints: Sales Invoice 6→7 and Customer 3→4, as expected
for the labeled test fixtures. GL Entry 16, Payment Entry 1, Stock Entry 0, Item 17,
Warehouse 6, Supplier 2 and Purchase Invoice 3 retained identical row hashes.
No test invoice was submitted. The test customer and draft remain for inspection.

Known local environment issue: the existing socket.io Invalid origin error remains;
it predates this feature. Mobile touch, multi-currency, custom tax/pricing rules,
restricted real user roles, and network disconnection need broader acceptance tests
before a production rollout. Their native paths are preserved, not certified here.

## Next product slice

After feedback on this draft entry flow, add a reviewed checkout step with native
submission/payment handling, barcode workflows, customer credit guidance, and explicit
permission/error recovery. Keep payment and issuance visibly separate from saving.
