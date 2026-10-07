# Bunood Production MVP — Release Receipt Draft

**Prepared:** 2026-09-20 (Africa/Cairo)  
**Decision:** **HOLD — software candidate verified; owner and physical gates pending**

## Candidate identity

- Site: `rc20.localhost`
- URL: `http://127.0.0.1:8088`
- Branch: `production/theme-v0.46.7`
- Recorded Git HEAD: `18209bd`
- Bunood package: `0.46.35` from `__version__`, `hooks.app_version`, and
  `bench --site rc20.localhost list-apps` after migration
- Main CSS: `bunood.348dc473.css`
- Print CSS: `bunood-print.6115405a.css`
- Main JavaScript: `bunood.106c9d15.js`
- Deployment: source shipped to backend, workers, scheduler and frontend; cache cleared
- Migration: passed; `bench list-apps` reports `bunood_theme 0.46.35`
- Working tree: intentionally dirty, 129 status entries; final release commit/tag
  remains a launch gate

## Software acceptance

| Gate | Result | Evidence |
| --- | --- | --- |
| Active JavaScript contract suite | PASS | 220/220, including four release-readiness contracts |
| Python payment, print, setup and exact-halala contracts | PASS | 27/27 |
| JavaScript syntax | PASS | Seven production controllers/bundles checked with `node --check` |
| Arabic catalogue coverage | PASS | 1,488 source strings; 8 declared exemptions |
| Production build | PASS | Content-hashed assets above |
| Payload budget | PASS | Main CSS 99 bytes and JavaScript 120 bytes below the documented ceilings |
| Diff hygiene | PASS | `git diff --check` |
| Commercial PDFs | PASS | Fresh 12/12 English/Arabic A4 and 80 mm outputs; source records unchanged; structural verifier passed |
| Customer Statement PDFs | PASS | Fresh English and Arabic live General Ledger output; 6 rows each, structural verifier passed and no browser errors |
| Asset delivery | PASS | Main CSS, print CSS and JavaScript return HTTP 200 |
| Rollback-safe native quote-to-cash | PASS | Details below |
| Persistent owner-authorized quote-to-cash | PASS | `SAL-QTN-2026-00003` → `SAL-ORD-2026-00005` → `ACC-SINV-2026-00013` → `ACC-PAY-2026-00003` |
| Mapped invoice Simple/Advanced UI | PASS | Deployed mapped-row fix; current 111/111 focused checks; live same-document mode switch passed |
| Approved print defaults | PASS | Sales Invoice, Quotation and Payment Entry metadata now resolve to their managed Bunood formats |
| Narrow workspace drawer | PASS | At 700 px RTL, the native drawer opens above content, dismisses through its overlay, and logs no browser errors |
| Restrained geometry and Arabic payment UI | PASS | Deployed badges/statuses use 4 px geometry, English payment pages no longer leak Arabic presentation, and the live browser logged no errors |
| Contrast, icons and i18n | PASS | 9,464 contrast pairs, 53 sprite IDs, and 1,488 source strings with 8 declared exemptions |

### Native quote-to-cash rehearsal

The rehearsal used ERPNext's native document controllers and mappers inside one
database savepoint:

1. Submitted a two-line Quotation with discount `23.00`, VAT `39.00`, total `299.00`.
2. Used `erpnext.selling.doctype.quotation.quotation.make_sales_invoice`.
3. Retained the two mapped lines and added a third line plus one duplicate line.
4. Submitted a four-line Sales Invoice with discount `23.00`, VAT `52.50`, total `402.50`.
5. Used the native Payment Entry mapper and allocated/received `402.50` in full.
6. Reloaded the Sales Invoice and verified outstanding `0.00`.
7. Rolled the savepoint back unconditionally.
8. Verified counts were unchanged: Quotation `3`, Sales Invoice `13`, Payment Entry `3`, GL Entry `54`.

This is reproducible software evidence, not a substitute for the persistent owner-
authorized acceptance transaction.

### Persistent owner-authorized acceptance

The owner explicitly approved the permanent transaction on 2026-09-20. The UI
acceptance used native ERPNext saves, submits, mappers, and accounting entries:

1. Submitted Quotation `SAL-QTN-2026-00003` with two lines, discount `23.00`,
   VAT `23.25`, and grand total `178.25`.
2. Created and submitted native intermediary Sales Order `SAL-ORD-2026-00005`.
3. Created mapped Sales Invoice `ACC-SINV-2026-00013`, retained the mapped
   source references, added a third item, used Duplicate Row, and balanced the
   two mapped duplicate quantities against the source order. The submitted
   invoice has four lines, item total `225.00`, additional discount `23.00`,
   taxable/net total `205.00`, VAT `30.75`, and grand total `235.75`.
4. Submitted Payment Entry `ACC-PAY-2026-00003` in Cash for `235.75`, fully
   allocated to the invoice. The invoice status is Paid and outstanding is
   `0.00`.
5. Verified the GL: Debtors debit `235.75`, Sales credit `205.00`, Output VAT
   credit `30.75`; payment credits Debtors `235.75` and debits Cash `235.75`.
6. Reviewed the submitted mapped invoice in both Simple and Advanced modes.
   Both modes show the same document number and values; switching modes does not
   create or copy a document.
7. Reviewed the Arabic managed A4 preview. It shows all four item names and
   quantities, discount `23.00`, net `205.00`, VAT `30.75`, and total `235.75`.
   ERPNext's native Standard preview shows the tax row's pre-discount amount
   `33.75`; the managed Bunood format deliberately uses the authoritative
   post-discount tax amount `30.75`, matching the document and GL.
8. Reviewed the submitted Payment Entry receipt in the browser, including the
   Cash method, `235.75` paid/allocated, and `0.00` invoice outstanding.
9. Repaired and migration-verified the system-generated DocType print defaults:
   Sales Invoice opens `بنود - فاتورة ضريبية (A4)`, Quotation opens
   `بنود - عرض سعر (A4)`, and Payment Entry opens `بنود - سند قبض-صرف`.

This acceptance is permanent. It was not rolled back and increased the document
and GL counts as expected.

## Owner-data audit

`npm run release:check` is now the executable final gate. It reads the live
Company record, package/assets identity, Git commit/tag state and
`docs/BUNOOD-MVP-RELEASE-ACCEPTANCE.json`; it refuses owner or physical checks
marked complete without evidence. The current candidate correctly returns
`HOLD` with 13 explicit blockers instead of allowing a green build to be
misread as production approval.

Current candidate values requiring the owner's confirmation before release:

| Field | Current value | State |
| --- | --- | --- |
| Legal/company name | `Bunood Development` | Pending confirmation |
| VAT number | `310000000000003` | Pending confirmation |
| Currency/country | `SAR` / `Saudi Arabia` | Pending confirmation |
| Address | `King Fahd Road, Riyadh, Riyadh 12211` | Pending confirmation |
| Phone | Company field currently contains placeholder `0000` | **Blocking** |
| Email | Company field currently contains placeholder `jjj@gma.com` | **Blocking** |
| Company logo | private WhatsApp JPEG | **Blocking until visually/legal approved** |
| Theme smoke-test tagline | removed | PASS; focused 1/1 cleanup check |
| ZATCA environment/configuration | configured on candidate | Pending compliance-owner confirmation |

## Gates that cannot be claimed yet

- [x] Owner explicitly authorizes a persistent test transaction.
- [x] Fresh Quotation is saved/submitted from the UI.
- [x] Native mapped Sales Invoice is reviewed in Simple and Advanced modes.
- [x] Native full Payment Entry is submitted and outstanding reconciles.
- [x] Payment receipt is reviewed in the browser. Physical printing remains pending.
- [ ] One A4 invoice is printed at 100% scale on the intended printer.
- [ ] One 80 mm invoice is printed on the intended thermal printer.
- [ ] Every required printed QR code scans with a real phone/scanner.
- [ ] Browser preview, PDF and paper agree for document identity, customer, items,
      subtotal, discount, VAT, total, status and language.
- [ ] Owner confirms the legal identity, VAT, address, contact, logo and ZATCA data.
- [ ] The intentional dirty working tree is consolidated into a reviewed release
      commit/tag so the candidate is reproducible outside this machine.

## Physical acceptance record

Fill during the owner-run check:

```text
A4 printer/model:
A4 driver/browser:
A4 scale/margins:
A4 document number:
A4 print result:

Thermal printer/model:
Thermal driver/browser:
Thermal width/scale/margins:
Thermal document number:
Thermal print result:

QR scanner/phone:
QR document number:
QR scan result:

Compared preview/PDF/paper:
Observed defects:
Owner acceptance:
```

## Release decision

Do not mark production-ready until every unchecked owner/physical gate above is
completed and the final candidate is committed/tagged. The managed Bunood A4
format matches the posted document and GL. The native ERPNext Standard format's
pre-discount tax-row presentation is not an approved production format for this
discounted invoice.
