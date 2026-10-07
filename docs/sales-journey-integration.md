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

## Sales completion gate

Before moving to purchasing, verify quotations and orders through partial
delivery, invoicing and allocation of customer receipts; returns, cancellation
and amendment; discounts, taxes and currencies; native permissions and company
isolation; print/send and navigation in Arabic and English. Expose missing
required functions in the Bunood interfaces without reimplementing native
accounting or modifying ERPNext core. Exercise writes only in isolated test
data, and verify resulting native stock/ledger records.

No production deployment of this sales slice has occurred. This document records
the implementation currently in progress; it was added after the initial edits.
