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
                # wkhtmltopdf paints CSS borders as filled thin rectangles.
                rules = [line for line in page.rects if line['height'] <= 1.5 and line['width'] > page.width * .75 and header_bottom <= line['top'] < header_bottom + 20]
                assert rules, (key, 'missing compact full-width divider')
                for line in rules:
                    colour = line.get('non_stroking_color') or ()
                    assert len(colour) == 3 and colour[1] > colour[0] and colour[1] > colour[2], (key, 'divider must be green')
                results[key + ':' + str(page_no)] = {'company_size': round(company['size'], 2), 'id_size': round(vat['size'], 2), 'direction': lang, 'header_height': round(header_bottom - min(company['top'], vat['top']), 2)}
(root / 'letterhead-verification.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'Balanced letterhead: {len(results)} rendered pages passed.')
