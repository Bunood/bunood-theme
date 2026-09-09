# Arabic invoice amount wording

The native `money_in_words` prefixes the currency code. Replacing `SAR` with
`ريال سعودي` produced `ريال سعودي ألف و أربعمائة فقط.` in the Arabic invoice.
The print presentation now reads **ألف وأربعمائة ريال سعودي فقط لا غير**.

## Ownership and scope

- `printing/amount_words.py` supplies Arabic SAR grammar, using Frappe's existing
  num2words Arabic converter. It does not calculate totals or store amounts.
- `printing/jinja.py:bunood_amount_in_words` consumes the same selected payable
  value and precision as the numeric total. It normalizes the active native
  number-format separators after `fmt_money`, including formats without decimals.
- A4 sales/purchase invoices and the shared invoice totals macro use it.
  English, foreign-currency and non-invoice macro behavior stays unchanged.
- `print_words=Hide` still hides the section. No invoice, `in_words`, GL, payment
  or stock record is written. Existing rounded-total selection is unchanged.
- Invalid, nonfinite, sub-halala or absolute amounts >= 10^15 omit optional words
  instead of printing an inaccurate amount. Numeric rendering remains native.

## Grammar policy

| Amount | Wording (before the common suffix) |
|---:|---|
| 1 | ريال سعودي واحد |
| 2 | ريالان سعوديان |
| 3 | ثلاثة ريالات سعودية |
| 11 | أحد عشر ريالًا سعوديًا |
| 101 | مائة ريال سعودي وريال واحد |
| 200 | مئتا ريال سعودي |
| 1,400.08 | ألف وأربعمائة ريال سعودي وثماني هللات |

Use nominative standalone phrases, attach the conjunction waw, and append
`فقط لا غير` once. Negative printed amounts have a single `سالب` prefix.

The installed num2words 0.5.14 has additional scale-group grammar bugs. A narrow
decomposition into complete currency phrases avoids these without copying the
numeral engine: e.g. 101,000 is `مائة ألف ريال سعودي وألف ريال سعودي`.
Fresh converter instances prevent cross-language/gender state leakage. The
upstream locale and native number-format dependencies are fingerprinted.

## Verification

After deploying to the local test site, set the usual `BND_DOCKER`, `BND_BACKEND`
and `BND_SITE` values and run `node tools/amount-words-regression.mjs`.
`BND_WORDS_OUTPUT` optionally selects the output directory.

This runs 10 test methods, including every native number format, then renders six
native PDFs and checks source wording, Hide behavior, and unchanged documents.
Inspect the generated PDFs visually as well: HTML assertions alone do not prove
Arabic shaping or page layout. All specimen invoices are in memory only.
