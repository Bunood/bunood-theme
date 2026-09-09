# Currency metadata and footer placement

The Sales/Purchase Invoice A4 formats share `templates/bunood_invoice_a4.html`.
Their metadata row contains posting date and due date only. Currency remains on
monetary headings and totals, including the official vector riyal face.

PDFs keep Frappe's native `#footer-html` extraction. Do not position that element
absolutely/fixed inside the body: the PDF engine already renders a separate bottom
band, and an overlay risks covering long tables. `repeat_header_footer` and
`no_letterhead` retain native behavior.

The on-screen preview previously placed the footer immediately after content.
The shared Print Style now uses an explicit `@media screen` flow layout, allowing
the footer to grow into unused paper space. No fixed page/content/footer height
is imposed. Long content and long footers can expand naturally. The paper gutter
scope excludes detached PDF header/footer documents; thermal receipts and previews
without `#footer-html` retain their existing layout.

`tools/print-media.mjs` excludes only explicit screen-only media from the legacy
PDF CSS compatibility check. Bare rules and mixed, all, print or negated media
remain checked. Tests include a Sass-compiled escaped `@media` selector to prevent
it from hiding an unsafe print rule.

## Local verification, 2026-08-31

- Native invoice regression: 10 PDFs, English/Arabic, sales/purchase, return,
  discount/tax, 44-item specimens spanning five pages. Two metadata cells,
  matching values, all item rows retained, riyal vector and left-side placement.
- Report PDF path: eight existing report snapshots re-rendered with current
  stylesheet/letterhead, plus 120-row and no-letterhead specimens.
- Across these 20 PDFs / 31 pages: footer email once per applicable page, within
  the bottom band, no content-table overlap, all 120 synthetic report rows retained.
- Actual browser sales invoice preview in English and Arabic: footer bottom
  aligned to the paper content boundary within 1px, with a clear content gap.
- Additional native renders preserve no-letterhead, repetition disabled, and
  thermal receipt behavior; the thermal PDF remains 80mm wide.
- Five parser regressions run on every build; four report-asset isolation tests pass.
- Native PDF/footer behavior is unchanged. Local formats use wkhtmltopdf; this
  run does not claim Chromium, every custom template, every report data query,
  or physical printer-dialog coverage. No invoices were saved or submitted.

Evidence is in the local task's `outputs/footer-fix/`. After deployment, run
`bunood_theme.printing.install.sync_print_theme` and verify the Print Style CSS
matches `print_css()`; shipping a new asset alone does not update the DB record.
