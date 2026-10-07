# Editorial pilot — visual direction and acceptance

This branch is a visual trial against an isolated local ERP site. It changes no
accounting rules, document lifecycle, APIs, permissions, or data model. Port
8088 remains the control; port 8100 is the pilot. The standalone 8099 concept is
not a substitute for either real site.

## Research translated into Bunood decisions

- SAP's [worklist](https://experience.sap.com/fiori-design-web/work-list/) and
  [overview page](https://experience.sap.com/fiori-design-web/v1-48/overview-page/)
  distinguish work that needs action from reporting. Bunood Home should lead
  with today's work, keep creation nearby, and put analysis after the worklist.
- SAP's [object page](https://experience.sap.com/fiori-design-web/object-page/)
  and [action placement](https://experience.sap.com/fiori-design-web/action-placement/)
  keep document identity and one important action in a compact persistent
  header, with secondary actions in overflow. Bunood documents should behave
  the same without another oversized hero above the actual form.
- Carbon's [data table](https://carbondesignsystem.com/components/data-table/usage/)
  treats rows and columns as the primary scanning surface, with actions tied
  to the row. Reports and invoice items should read as records, not a mosaic
  of equally weighted tiles.
- The [GOV.UK tag guidance](https://design-system.service.gov.uk/components/tag/)
  reserves conspicuous state treatments for cases where status helps a user
  choose. Bunood's routine draft/paid/unpaid labels use text first; urgency
  receives a restrained semantic cue, never a row of decorative pills.
- The W3C's [bidi guidance](https://www.w3.org/International/articles/inline-bidi-markup/bidi_examples)
  informs Arabic-first layout while invoice IDs, money, and dates retain their
  readable order.

## Design grammar

1. **Quiet frame, active content.** Navigation returns to a pale surface. Green
   marks the next action, while rows, fields, and figures carry the visual
   hierarchy; there are no decorative gradients or oversized heroes.
2. **Type carries hierarchy.** One strong document title, small factual
   metadata, tabular money, and an intentional Arabic measure. Supporting copy
   never competes with the record or the next action.
3. **Density serves the workflow.** On Home, work and creation fit above the
   fold on desktop. On invoices, customer, items, warehouse, totals, and the
   primary submit action are easy to locate. Reports are browsed by name and
   domain, with charts subordinate to the exact values.
4. **One primary action per context.** Save/submit stays most prominent on a
   draft document; search, print, and secondary tools stay accessible without
   a second competing filled button.
5. **Same layout contract in Arabic and English.** Logical CSS properties,
   visible keyboard focus, responsive controls, and no nested vertical page
   scrollbars. A compact viewport must retain the record and its main action.

The current content-first pass puts Home's full-width work queue and workflow
routes before its financial strip, analysis, and setup review. The invoice puts
customer/date in a compact horizontal strip so item
entry, the item sheet, and totals use the entire form width; secondary invoice
fields remain accessible under “تفاصيل الفاتورة” on desktop and phones.
Report Studio places the records table before its chart.
The bundled IBM Plex Arabic files preserve a consistent type voice. No posting
or data contract was changed.

## Pilot review routes

- Home: `/desk/home`
- Sales invoice list: `/desk/sales-invoice`
- New sales invoice: `/desk/sales-invoice/new-sales-invoice-1`
- Quotations: `/desk/quotation`
- Report Studio: `/desk/bnd-report-studio`
- Inventory item list: `/desk/item`

## Functional acceptance

All checks run on the pilot site only, never the 8088 control. Verify navigation,
list filters, invoice customer and item selection, quantity/warehouse changes,
draft save and print preview, quotation-to-invoice conversion, report search and
opening, and narrow RTL/English layouts. Use test records in the pilot clone;
do not assume the UI pass validates finance, tax, or ZATCA compliance.

## Verified pilot paths (2026-09-25)

- Home action opens the real Sales Invoice form; an empty invoice line is focused
  rather than duplicated. Home, invoice, and report catalogue have no horizontal
  overflow at a 390px viewport.
- Home workflow links cover 18 independent transaction steps, four operating
  lanes, queue shortcuts, and both report shortcuts.
- Invoice action bar, preview drawer, warehouse context, mobile sidebar, and
  28px RTL/LTR separation between total and its adjacent action passed.
- A draft invoice with mixed cash/network payment submitted and produced two
  posted Payment Entries with ledger rows. A submitted Quotation then mapped
  into a new Sales Invoice with the expected customer and item. These records
  were created and cleaned up in the pilot database only.
- Report Studio opened all 21 installed reports in Arabic RTL. Search, refresh,
  print, presentation, custom-period controls, XLSX export, and mobile catalogue
  passed.
- Item form read-only permissions and field hierarchy passed in English and
  Arabic, light and dark mode, at 1440/1024/700/430px.

The broad historical smoke suite finished **511/545**, with 34 failures
(`C:\Users\abdul\AppData\Local\Temp\bnd-smoke-1790293985244.log`). It asserts
previous shell appearances and includes data-hygiene prerequisites this cloned
test site does not satisfy (for example a leftover branding test marker and
per-user preferences). The cloned Real Estate route currently renders a
recoverable dashboard-data error, so that route could not be visually approved.
A targeted pass is not a claim that the whole suite, regulatory flows, or a
production release is green.

## Second visual pass (2026-09-25)

The first pilot was too close to production: it mainly removed borders and
badges. The second pass changes the frame and layout above. Targeted acceptance
checks now assert the desktop worklist/figures composition, two-column report
index, and phone invoice title/action-band visibility. Review it on port 8100
beside the unchanged production-style 8088 site. The earlier 511/545 result
belongs to the first pass and is not a claim about this one.

## Content-first revision (2026-09-25)

The dark frame in the second pass was too prominent and the main work still
started too low. This revision removes that frame, reduces the invoice header,
and changes content order on Home and in report viewers. At 1440×900, invoice
item entry starts at y=233 and its 903px work area is over three times the
253px customer column. A 390px phone shows customer/date, the secondary-field
disclosure, and the first item row in the initial viewport. All native invoice
fields remain mounted and the primary save/submit path is unchanged.

Targeted visual acceptance and interaction workflow pass on port 8100, including
mobile disclosure open/close, Home action → invoice, Add line, report table
before chart, and no horizontal overflow on Home, invoice, or Report Studio.
The cloned Real Estate route still reports a dashboard-data error and is not
approved visually. This pilot is not a production-readiness sign-off.

## Full-width work and guest entry (2026-09-25)

The latest pilot removes the invoice's permanent side rail: at 1440×900 the
sales and purchase item tables measure 1168px, the same width as the workbench.
Customer/supplier and posting date stay visible above; company, price-list and
other secondary fields open through “تفاصيل الفاتورة” without leaving the
form. The Home workflow sheet moves from y≈2914 to y≈442, immediately after
the action queue and before the financial figures. Its four lanes and 18 steps remain independent
links; the duplicate queue-highlight cards are gone. At narrower widths the
lanes become two and then one column.

The pilot login now uses an editorial evergreen panel with quiet ledger rules,
a light, high-contrast credential pane, and an integrated bilingual switch.
This restyles the existing Split composition only—Frappe still handles sign-in,
password recovery and email-link actions. Arabic RTL, English LTR, desktop,
phone, light OS and dark OS were checked on port 8100. The guest login has no
WCAG A/AA violations in either language under the targeted axe audit; the
otherwise-unlabeled decorative Frappe mark now has an empty alt attribute.
Login uses no new backend logic, API, or authentication path. Port 8088 remains
the original comparison.

## Ledger-signature revision (2026-09-25)

The content-first composition stays. The visual vocabulary now comes from a
ledger rather than generic cards: deep evergreen identifies a document or a
live work queue; a narrow brass rule marks a transition; pale leaf surfaces
group contextual fields; white remains the main working sheet. IBM Plex Arabic
is retained, with tabular numerals for amounts. There is no new type download,
hero illustration, gradient wash, animation dependency, or duplicated action.

The main-screen hierarchy is deliberately different on each surface:

```
Home:     greeting / create  →  live work queue  →  workflow routes  →  figures / analysis
Invoice:  document identity | actions  →  party strip  →  full-width item sheet  →  total
Forms:    document identity  →  commit / stages  →  primary fields  →  detail / outcome
Reports:  title / search / domain  →  scannable index  →  exact table  →  chart
```

The invoice's title block is a compact dark document seal, while the item grid
and amount due carry the emphasis inside the form. Home places an actionable
queue beside a distinct label area and moves the existing analysis panel ahead
of recent records. Quotation and payment workbenches share the document rhythm;
native form headers and list heads get a restrained version. Report Studio and
report landings retain a table-like catalogue rather than decorative cards.
Phone invoice item entry remains visible below its essential fields; secondary
fields stay in the existing disclosure. Dark-mode text uses a separate ink
token so the evergreen background does not become low-contrast foreground.

The changed bundles remain confined to the pilot deployment on 8100. The CSS
budget rises from 53,000 to 54,000 gzip bytes and desk JS from 224,300 to
224,400, with measured builds and reasons in `payload-budget.json`. These are
pilot measurements, not permission to grow production bundles. The visual
acceptance and invoice action workflow passed; cloned Real Estate data still
errors, and the old broad smoke suite is not a release approval.
