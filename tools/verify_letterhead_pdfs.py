"""Measure the one-line identity header and mirrored order in actual PDFs."""
import json
import sys
from pathlib import Path
import pdfplumber

root = Path(sys.argv[1])
results = {}
for lang in ('en', 'ar'):
    for case in ('purchase', 'sales', 'specimen-long', 'specimen-discount-tax', 'specimen-return'):
        key = case + '-' + lang
        with pdfplumber.open(root / (key + '.pdf')) as pdf:
            for page_no, page in enumerate(pdf.pages, 1):
                words = page.extract_words(extra_attrs=['size'])
                company = min((w for w in words if w['text'] == 'Bunood'), key=lambda w: w['top'])
                vat = min((w for w in words if w['text'] == '300000000000003'), key=lambda w: w['top'])
                cr = min((w for w in words if w['text'] == '1010000000'), key=lambda w: w['top'])
                assert company['size'] >= vat['size'] * 1.5, (key, 'company name needs stronger type hierarchy', company['size'], vat['size'])
                centers = [(w['top'] + w['bottom']) / 2 for w in (company,vat,cr)]
                assert max(centers) - min(centers) < 4, (key, 'company/VAT/CR must share one line', centers)
                if lang == 'en':
                    assert company['x1'] < vat['x0'] < cr['x0'], (key, 'unbalanced LTR header')
                else:
                    assert cr['x1'] < vat['x0'] < company['x0'], (key, 'header must mirror in Arabic')
                header_bottom = max(company['bottom'], vat['bottom'], cr['bottom'])
                # A compact identity can sit over either the Hairline divider
                # or the shipped Wash Card header surface. Chromium may merge
                # a rounded panel as a curve rather than a rectangle, so check
                # the physical branded primitive that encloses/follows the
                # identity row instead of assuming one PDF object type.
                rules = [line for line in page.rects if line['height'] <= 1.5 and line['width'] > page.width * .75 and header_bottom <= line['top'] < header_bottom + 20]
                header_top = min(company['top'], vat['top'], cr['top'])
                panels = [panel for panel in page.curves
                          if panel['width'] > page.width * .75
                          and panel['top'] <= header_top
                          and panel['bottom'] >= header_bottom]
                branded = rules or panels
                assert branded, (key, 'missing compact branded header treatment')
                for shape in branded:
                    colour = shape.get('non_stroking_color') or shape.get('stroking_color') or ()
                    assert len(colour) == 3 and colour[1] > colour[0] and colour[1] > colour[2], (key, 'header treatment must be green')
                results[key + ':' + str(page_no)] = {'company_size': round(company['size'], 2), 'id_size': round(vat['size'], 2), 'direction': lang, 'header_height': round(header_bottom - min(company['top'], vat['top']), 2)}
(root / 'letterhead-verification.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'Balanced letterhead: {len(results)} rendered pages passed.')
