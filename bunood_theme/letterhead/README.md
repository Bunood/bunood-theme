# Bunood Letter Head — رأس وتذييل الطباعة

The managed `Bunood` Letter Head follows the native Print Language: English is
LTR; Arabic is RTL. Labels use one language per print, with Latin identifiers
isolated LTR. Company names are stored data, not machine translations.

## Header compositions

Theme Settings → Print Letterhead selects one composition at sync time:

- **Hairline Minimal:** company name, VAT label/value and commercial registration
  label/value on one row, over one green rule. English and Arabic mirror.
  The identity/VAT/CR widths are 30%/34%/36%. Absent registration fields release
  their space; long names may wrap safely within their own cell.
- **Bilingual Split:** the existing name/registration block and opposite logo,
  with the existing accent/brand rules. The option name is retained for settings
  compatibility; labels and displayed name follow Print Language.
- **Centered Mark:** the existing centered company/logo composition.
- **Frappe's own:** no synchronization; an administrator's letterhead is untouched.

The 2026-08-31 redesign changes only Hairline Minimal. Its hierarchy and alignment
follow the conventional company-block/secondary-details pattern illustrated by
[Zoho's Standard layout](https://www.zoho.com/pt-br/invoice/help/pdf-templates/create-template.html)
and the restrained typography in [Stripe's sample invoice](https://stripe.com/files/docs/billing/taxes/example-reverse-charge-customer.pdf).
No third-party branding, assets or invoice data were copied.

The optional logo appears beside the name, on the same reading-start edge. A
40px containing block and 30px maximum image height preserve its proportions.
The block exists only when a logo exists. Long names wrap inside the identity
column; missing registration rows do not leave placeholder labels.

## Source and synchronization

`bunood_letterhead_header.html` contains marked composition blocks;
`printing/install.py::_sync_letterhead` selects one and writes the managed record.
It also resolves palette tokens to concrete light-paper colors and injects the
configured theme raster logo. Do not paste the complete multi-composition source
into the Desk. The installer runs on migration and the existing Theme Settings
save path resynchronizes print branding. Source-only local deployments also need
the managed Letter Head resynchronized before reopening Print.

Styles are deliberately inline: wkhtmltopdf renders repeated headers separately.
Native `frappe/utils/pdf.py` adds the print bundle to that isolated HTML. Its
`img { max-width:100% !important }` means a logo needs a bounded containing block.
The inline image uses a bounded wrapper and `width:auto !important` to override
native `standard.css` forcing `td img` to `width:100%`. These contracts are pinned; real PDF fixtures
check the resulting dimensions and aspect ratios.

## Data sources

| Content | Source |
|---|---|
| English name | `Company.company_name` |
| Arabic name | `company_name_in_arabic`, then `custom_company_name_ar`; falls back to the English name |
| Logo | Theme Settings raster logo, then Company `company_logo`, then `brand_logo` |
| VAT | `Company.tax_id` |
| Commercial registration | `bnd_commercial_registration`, then `registration_details` |
| Footer address | Address linked to Company through Dynamic Link |
| Footer contact | Company `phone_no`, `email`, `website` |
| Optional privacy line | `custom_privacy_policy`, then `custom_privacy_policy_url` |

Absent company/contact data does not render literal `None` or empty footer bands.
Values are HTML-escaped. Footer contact identifiers stay LTR. The PDF server needs
Arabic-capable fonts. The Minimal header, common footer and A4 invoices use
locally bundled Noto Naskh Arabic Regular/Bold subsets, registered with fontconfig
by `_sync_style()` and self-hosted for previews. Latin text and numeric runs keep
DejaVu Sans. See `public/fonts/noto-naskh/README.md` for provenance and rebuilding.
The header contains no QR logic and makes no tax-compliance guarantee.

## Actual-PDF verification

Use the demo site with source records `ACC-PINV-2026-00002` and
`ACC-SINV-2026-00002`, the Bunood A4 formats, Hairline Minimal and no theme logo.
Set `BND_DOCKER`, `BND_BACKEND` and `BND_SITE` for the running stack. Python needs
`pdfplumber` and `lxml`.

```sh
BND_PDF_OUTPUT=/tmp/invoice-pdfs node tools/invoice-pdf-regression.mjs
python tools/verify_invoice_pdfs.py /tmp/invoice-pdfs
python tools/verify_letterhead_pdfs.py /tmp/invoice-pdfs
BND_PDF_OUTPUT=/tmp/header-fixtures node tools/letterhead-fixtures.mjs
python tools/verify_letterhead_fixtures.py /tmp/header-fixtures
```

The first group covers purchase/sales, both languages, five-page documents,
discount/tax and returns. The header check measures hierarchy, alignment and the
green divider on every page. The second group uses unsaved in-memory Company
copies: long names, absent registration, and logos at 1:1, 4:1 and 10:1 ratios.
It checks bounds, reading-start alignment, aspect ratio and separation from the
invoice body. Both generators assert that source company/invoice data is unchanged.
