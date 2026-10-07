# Custom sales journey — implementation and acceptance

The owner wants Bunood interfaces over ERPNext's business engine, completed in
this order: sales, purchasing, stock, accounting. Imported team forms are the
starting point; showing a native list or an accounting reader does not complete
the corresponding application.

## First sales slice

`bnd-selling` is an owned Page listing quotations, orders, deliveries, invoices
and customer receipts, filtered by company, status and search. Its bounded GET
reader uses native document and user permissions. It computes no balances and
creates no postings. Record links open the existing Bunood form workbenches.

Quotation → Sales Order, Sales Order → Delivery Note / Sales Invoice and
Delivery Note → Sales Invoice call native registered Create handlers, preserving
native eligibility, dialogs and partial-document mapping. Eligibility and
permissions are checked again when clicked. ERPNext remains responsible for
calculation, validation, submission, inventory and ledger posting.

## Measured checks, 2026-10-07

- Reader: six boundary tests passed. All five document readers and Guest denial
  passed on native ERPNext. Six further native permission checks proved a Sales
  User can see its allowed company quotation, cannot read the other company,
  and cannot read Payment Entry. Transaction rollback left zero owned records.
- Page: stale record actions during search debounce failed before correction;
  all sixteen request-race, permission, refresh and display tests then passed.
  Native currency resolution review found a wrong formatter call; corrected and
  three foreign-currency regression checks passed (nineteen Page checks total).
  Five further Engineering routing checks passed (twenty-four Page checks total).
- Native browser: exact new bundle, five lists, Home discovery, cached return,
  no mobile overflow and no Page errors passed. Desktop/mobile Arabic PNGs
  inspected; missing Arabic empty-state translation then added to the PO.
- Native New actions opened all five unsaved Bunood forms with the selected
  company. Generic Quotation initially redirected into Engineering; corrected
  using Engineering's existing Desk opt-out. Browser acceptance passed again
  with that storage flag deliberately blocked, using the documented `kept`
  fallback. Opening Engineering still clears its tab-wide Desk preference.
- Native engine: eleven checks passed over stock receipt, quotation, order,
  40% delivery and invoicing, balanced invoice GL, payment allocation of 200,
  outstanding balance, credit note, cancellation and amendment draft. Commits
  were forbidden; transaction rollback left zero owned business records.
- Interface selection: 118 checks passed; build, Arabic catalogue coverage and
  all nineteen served assets passed. Global JS gzip 187960/188000 bytes.
- Native stage actions: fourteen new checks and existing parity checks passed;
  native runtime mapping and dialogs remain to be verified.
- Earlier frozen navigation candidate: full 564/564 smoke passed, exit zero;
  136 typed/raw settings and both languages restored, owned session removed.
  This result is not acceptance of the new sales slice.

## Invoice lifecycle slice in validation

Normal cancelled invoices and their amendment drafts now retain the Bunood bill
surface. Return invoices use an owned workbench that relocates the original
native controls, including the negative-quantity item grid and extension fields;
Advanced restores those controls to their native locations. Hidden fields and
native permission states remain authoritative. Draft Save and Submit are separate
native actions; refund delegates the registered native Payment handler.

Return and Amend actions delegate native handlers, rechecking current document,
permissions, native control availability and disabled/hidden state when clicked.
Amend waits for the native already-amended lookup and retains the native handler's
second check. The cancelled Return workbench shares the same adapter.

The current interface selection passes 284 tests, with Arabic coverage and build
passing. Native Page browser acceptance passes against `bunood.6e46a493.js`,
including all five lists and unsaved Bunood forms, cached navigation, blocked
Engineering preference storage and mobile overflow checks.

Seven Arabic native browser lifecycle checks now pass: Return maps an unsaved
credit note; the negative native item Grid survives Advanced/Simple; normal and
Return cancellation both expose native Amend; already-amended normal/Return
documents keep Amend hidden; a credit with its own negative outstanding maps an
unsaved Pay Payment Entry linked to that credit. Desktop/mobile Return PNGs were
inspected, including correction of an unsupported panel shape. Refund visibility
now tracks delayed native toolbar registration without remounting fields.

Runtime checks found and corrected owned CSS concealing native Amend, raw versus
encoded Arabic action labels, and successful native RPC responses without a
message field. Native handlers retain their own final validation. Fixture cleanup
used native cancellation/deletion and ERPNext's ledger-cleanup setting strictly
inside a guarded transaction, restoring its exact raw value before any commit.
Both fixture sets were removed: owned invoices, payments, GL and Payment Ledger
rows are zero; the settings value is restored. Global JS is 187904/188000 gzip
bytes; all nineteen assets return 200.

The full unfiltered release matrix still needs to run against this combined
candidate. The earlier 564/564 result belongs to the earlier frozen navigation
candidate, not this slice.

## Native stage browser acceptance

The current combined sales candidate passes 286 interface tests, Arabic coverage,
9464 contrast pairs and the build. All nineteen local assets return 200; the
current global bundle is `bunood.f00899b2.js`, 187700/188000 gzip bytes.

A native Arabic browser run now passes the actual custom-button path: saved
quotation, submitted Sales Order, partial Delivery Note for four of ten items,
submitted invoice for 4 × 100 = 400, and a submitted Receive Payment Entry of
200. Read-back verifies exact native document/child links, company and currency,
40% delivered/billed, stock movement −4, separately balanced invoice GL 400 and
payment GL 200, exact invoice allocation 200 and outstanding 200. The invoice's
native delivery dialog was closed without sending a message.

This run exposed native action registration completing after the SimpleForm
render. SimpleForm and Return now share a narrow native-toolbar observer that
updates action state without remounting fields. Scoped observer tests and actual
quotation/order/delivery mapping pass. The browser harness uses actual parent
control elements, visible-page scopes and native AJAX settlement to avoid cached
forms and child-grid field ambiguity.

The unique stock fixture was removed through native cancellation/deletion.
Copied opening stock is cleared before creating the explicit owned receipt;
repost processing uses ERPNext's synchronous test mode. Cleanup permits only
verified owned terminal repost records without attachments, forbids internal
commits until exact settings restoration, and verifies zero owned invoices,
payments, GL, Payment Ledger and Stock Ledger entries.

This is a same-currency, tax-free native test-company scenario, not VAT,
serial/batch, restricted-role posting or production acceptance. The combined full
unfiltered matrix remains pending. Its first run was invalidated by operator
interference after restricted process inventory incorrectly hid the live runner;
all owned processes were stopped and 136 typed/raw settings, both languages and
the owned session were independently verified restored.

## Remaining sales completion gate

Before moving to purchasing, verify quotations and orders through partial
delivery, invoicing and allocation of customer receipts; returns, cancellation
and amendment; discounts, taxes and currencies; native permissions and company
isolation; print/send and navigation in Arabic and English. Expose missing
required functions in the Bunood interfaces without reimplementing native
accounting or modifying ERPNext core. Exercise writes only in isolated test
data, and verify resulting native stock/ledger records.

No production deployment of this sales slice has occurred. This document records
the implementation currently in progress; it was added after the initial edits.
