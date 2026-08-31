"""Validate language, real PDF column geometry, values and pagination in both layouts."""
import json
import re
import sys
from pathlib import Path
import pdfplumber
from lxml import html

def select(node, cls):
    return node.xpath('descendant-or-self::*[contains(concat(" ", normalize-space(@class), " "), " '+cls+' ")]')

root = Path(sys.argv[1])
results = {}
for lang in ('en', 'ar'):
    rtl = lang == 'ar'
    for case in ('purchase', 'sales', 'specimen-long', 'specimen-discount-tax', 'specimen-return'):
        name = case + '-' + lang
        soup = html.fromstring((root / (name + '.html')).read_text(encoding='utf-8'))
        invoice = select(soup, 'bnd-invoice')[0]
        assert invoice.get('dir') == ('rtl' if rtl else 'ltr') and invoice.get('lang') == lang, (name, 'wrong layout language')
        labels = [x.text_content().strip() for x in select(invoice, 'bnd-inv-label')]
        assert labels and all(bool(re.search('[\u0600-\u06ff]', x)) == rtl for x in labels), (name, 'mixed label languages')
        assert len(invoice.xpath('.//h1')) == 1, (name, 'duplicated title')
        assert len(select(invoice, 'bnd-inv-meta')[0].xpath('.//td')) == 2, (name, 'standalone currency box remains')
        assert 'SAR' not in select(invoice, 'bnd-inv-title')[0].text_content(), (name, 'redundant currency beside title')
        header = select(invoice, 'letter-head')[0].text_content()
        footer = select(invoice, 'letter-head-footer')[0].text_content()
        if rtl:
            assert 'VAT number' not in header and 'Phone' not in footer, name
        else:
            assert 'الرقم الضريبي' not in header and 'هاتف' not in footer, name
        words = select(invoice, 'bnd-inv-words')[0].xpath('.//td')[0]
        assert bool(re.search('[\u0600-\u06ff]', words.text_content())) == rtl, (name, 'amount-in-words language')
        with pdfplumber.open(root / (name + '.pdf')) as pdf:
            texts = [p.extract_text() or '' for p in pdf.pages]
            text = '\n'.join(texts)
            riyals = [c for p in pdf.pages for c in p.chars if 'BunoodRiyal' in c.get('fontname', '')]
            assert len(riyals) >= 3 and all(c['text'] == '\u20c1' for c in riyals), (name, 'official vector riyal font missing or unreadable')
            assert 'SAR' not in text, (name, 'ISO code remains instead of symbol/currency name')
            # Check actual PDF geometry, not just logical text order in HTML.
            grand_symbol = max(riyals, key=lambda c: c['size'])
            beside_symbol = [c for p in pdf.pages for c in p.chars
                             if c['page_number'] == grand_symbol['page_number']
                             and abs(c['top'] - grand_symbol['top']) < grand_symbol['size']
                             and c['x0'] > grand_symbol['x1']
                             and c['x0'] - grand_symbol['x1'] < grand_symbol['size']
                             and c['text'] in '-0123456789']
            assert beside_symbol, (name, 'grand-total symbol is not immediately left of the number')
            arabic = [c for p in pdf.pages for c in p.chars if re.search('[\u0600-\u06ff\ufb50-\ufeff]', c['text'])]
            assert arabic and all('NotoNaskhArabic' in c['fontname'] for c in arabic), (name, 'Arabic font fallback', sorted(set(c['fontname'] for c in arabic)))
            assert all(abs(p.width - 595) < 2 and abs(p.height - 842) < 2 for p in pdf.pages), name
            assert all('Bunood Demo' in t and 'info@bunood.test' in t for t in texts), (name, 'missing repeated header/footer')
            for p in pdf.pages:
                assert all(c['x0'] >= 0 and c['x1'] <= p.width + 1 for c in p.chars), (name, 'text outside page')
                white = [c for c in p.chars if c.get('non_stroking_color') in ((1, 1, 1), (1,))]
                if 'TEST-LINE-' in (p.extract_text() or '') or 'Gallery sample' in (p.extract_text() or ''):
                    assert len(white) >= 30, (name, 'missing or low-contrast table header')
                    arabic_white = [c for c in white if re.search('[\u0600-\u06ff\ufb50-\ufeff]', c['text'])]
                    assert bool(arabic_white) == rtl, (name, 'PDF header glyph language')
            if rtl:
                for forbidden in ('Purchase Invoice', 'Sales Invoice', 'Posting date', 'Grand total', 'Amount in words', 'VAT number', 'Unit price'):
                    assert forbidden not in text, (name, forbidden)
            else:
                assert all(x in text for x in ('Posting date','Grand total','Amount in words','VAT number','Unit price')), name
            tables = [t for p in pdf.pages for t in p.extract_tables()]
            rows = [r for t in tables for r in t]
            if case in ('purchase','sales'):
                assert len(pdf.pages) == 1, name
                purchase = case == 'purchase'
                expected_id = 'ACC-PINV-2026-00002' if purchase else 'ACC-SINV-2026-00002'
                expected_item = 'Gallery sample 1' if purchase else 'Gallery sample 2'
                amount = '70.00' if purchase else '66.00'
                assert expected_id in text and '2026-08-31' in text and '\u20c1 ' + amount in text, name
                matching = [r for r in rows if any(expected_item in (c or '') for c in r)]
                assert len(matching) == 1, (name, 'item row not extractable')
                cells = [c for c in matching[0] if c is not None]
                if rtl:
                    cells.reverse()  # Extraction returns physical left-to-right cells.
                assert len(cells) == 6 and cells[0] == '1' and cells[2] == '1' and cells[4:] == [amount, amount], (name, cells)
                assert expected_item in cells[1] and cells[3], (name, cells)
            elif case == 'specimen-long':
                assert len(pdf.pages) > 1, name
                markers = re.findall(r'TEST-LINE-\d{2}', text)
                assert sorted(markers) == [f'TEST-LINE-{i:02}' for i in range(1,45)], (name, markers)
                assert '\u20c1 3,080.00' in text, name
                xs = [c for p in pdf.pages for c in p.chars if c['text'] == 'X']
                assert len(xs) == 100, (name, 'long code lost')
                long_page = next(p for p in pdf.pages if any(c['text']=='X' for c in p.chars))
                item_row = next((t, i, r) for t in long_page.find_tables() for i,r in enumerate(t.extract()) if any('LONG-CODE-' in (c or '') for c in r))
                t, i, r = item_row
                cell_index = next(j for j,c in enumerate(r) if 'LONG-CODE-' in (c or ''))
                box = t.rows[i].cells[cell_index]
                assert min(c['x0'] for c in xs)>=box[0] and max(c['x1'] for c in xs)<=box[2], (name,'long code overlaps another column')
                for i,t in enumerate(texts):
                    assert f'{i+1} / {len(pdf.pages)}' in t, (name,'page numbering')
            elif case == 'specimen-discount-tax':
                assert len(pdf.pages)==1, name
                for value in ('180.00','27.00','\u20c1 207.00','\u20c1 20.00 (10%)'):
                    assert value in text, (name,value)
            elif case == 'specimen-return':
                assert len(pdf.pages)==1 and '\u20c1 -70.00' in text and 'ACC-PINV-2026-00002' in text, name
                assert select(invoice,'bnd-inv-status'), (name,'draft status missing')
            results[name] = dict(pages=len(pdf.pages), direction=invoice.get('dir'), item_columns='mirrored' if rtl else 'left-to-right')
            (root / (name + '-text.txt')).write_text(text,encoding='utf-8')
(root / 'pdf-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
