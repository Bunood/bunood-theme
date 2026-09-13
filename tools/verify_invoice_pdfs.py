"""Validate language, real PDF column geometry, values and pagination in both layouts."""
import json
import re
import sys
from pathlib import Path
import pdfplumber
from lxml import html

def select(node, cls):
    return node.xpath('descendant-or-self::*[contains(concat(" ", normalize-space(@class), " "), " '+cls+' ")]')

def clean(value):
    return ' '.join((value or '').split())

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
        if rtl:
            for expected in ('الإجمالي قبل الضريبة', 'إجمالي الضرائب والرسوم', 'الإجمالي شامل الضريبة'):
                assert expected in labels, (name, 'non-standard Arabic total label', expected, labels)
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
        expected_id = clean(select(invoice, 'bnd-inv-reference')[0].text_content())
        expected_date = clean(select(invoice, 'bnd-inv-meta')[0].xpath('.//strong')[0].text_content())
        item_cells = [clean(cell.text_content()) for cell in select(invoice, 'bnd-inv-items')[0].xpath('.//tbody/tr[1]/td')]
        assert len(item_cells) == 6, (name, 'HTML item column contract', item_cells)
        assert not rtl or item_cells[3] != 'لا', (name, 'Nos UOM mistranslated as Arabic no')
        grand_text = clean(select(invoice, 'bnd-inv-grand')[0].text_content())
        grand_numbers = re.findall(r'-?[0-9][0-9,]*\.[0-9]+', grand_text)
        assert grand_numbers, (name, 'grand total has no numeric value', grand_text)
        grand_number = grand_numbers[-1]
        with pdfplumber.open(root / (name + '.pdf')) as pdf:
            texts = [p.extract_text() or '' for p in pdf.pages]
            text = '\n'.join(texts)
            riyals = [c for p in pdf.pages for c in p.chars if 'BunoodRiyal' in c.get('fontname', '')]
            assert len(riyals) >= 3 and all(c['text'] == '\u20c1' for c in riyals), (name, 'official vector riyal font missing or unreadable')
            assert 'SAR' not in text, (name, 'ISO code remains instead of symbol/currency name')
            # Check actual PDF geometry, not just logical text order in HTML.
            # Every riyal mark intentionally shares one size. The old verifier
            # chose max(size), which selected the first TABLE-HEADER symbol and
            # then reported a false grand-total failure. Identify the mark by
            # the exact rendered grand-total number on its physical line.
            def right_run(symbol):
                chars = [c for p in pdf.pages for c in p.chars
                         if c['page_number'] == symbol['page_number']
                         and abs(c['top'] - symbol['top']) < symbol['size']
                         and c['x0'] >= symbol['x1'] - 0.5
                         and c['x0'] - symbol['x1'] < 80]
                return ''.join(c['text'] for c in sorted(chars, key=lambda c: c['x0']))
            matching_symbols = [symbol for symbol in riyals if grand_number in right_run(symbol)]
            assert matching_symbols, (name, 'grand-total riyal row not found', grand_number)
            grand_symbol = matching_symbols[-1]
            beside_symbol = [c for p in pdf.pages for c in p.chars
                             if c['page_number'] == grand_symbol['page_number']
                             and abs(c['top'] - grand_symbol['top']) < grand_symbol['size']
                             and c['x0'] > grand_symbol['x1']
                             and c['x0'] - grand_symbol['x1'] < grand_symbol['size']
                             and c['text'] in '-0123456789']
            assert beside_symbol, (name, 'grand-total symbol is not immediately left of the number')
            arabic = [c for p in pdf.pages for c in p.chars if re.search('[\u0600-\u06ff\ufb50-\ufeff]', c['text'])]
            if arabic:
                assert all('Tajawal' in c['fontname'] for c in arabic), (name, 'Arabic did not use Tajawal', sorted(set(c['fontname'] for c in arabic)))
            if rtl:
                assert arabic and any('Tajawal-Bold' in c['fontname'] for c in arabic), (name, 'Tajawal Arabic display face missing')
            # Frappe's Chromium transformer renders A4 at 595.92 x 844.08 pt
            # after merging its isolated header/footer bands. The sub-1 mm
            # height delta is consistent across every page and remains within
            # printer A4 tolerance; reject any larger paper-size drift.
            assert all(abs(p.width - 595) < 3 and abs(p.height - 842) < 3 for p in pdf.pages), name
            assert all('Bunood' in t and 'info@bunood.test' in t for t in texts), (name, 'missing repeated header/footer')
            for p in pdf.pages:
                assert all(c['x0'] >= 0 and c['x1'] <= p.width + 1 for c in p.chars), (name, 'text outside page')
                white = [c for c in p.chars if c.get('non_stroking_color') in ((1, 1, 1), (1,))]
                if 'TEST-LINE-' in (p.extract_text() or '') or case in ('purchase', 'sales'):
                    assert len(white) >= 30, (name, 'missing or low-contrast table header')
                    arabic_white = [c for c in white if re.search('[\u0600-\u06ff\ufb50-\ufeff]', c['text'])]
                    assert bool(arabic_white) == rtl, (name, 'PDF header glyph language')
            if rtl:
                for forbidden in ('Purchase Invoice', 'Sales Invoice', 'Posting date', 'Grand total', 'Amount in words', 'VAT number', 'Unit price'):
                    assert forbidden not in text, (name, forbidden)
            else:
                assert all(x in text for x in ('Posting date','Grand total','Amount in words','VAT number','Unit price')), name
            if case in ('purchase','sales'):
                assert len(pdf.pages) == 1, name
                assert expected_id in text and expected_date in text and grand_number in text, name
                page = pdf.pages[0]
                item_marker = item_cells[1].split()[0]
                item_word = next((w for w in page.extract_words() if item_marker in w['text']), None)
                assert item_word, (name, 'item row not extractable', item_marker)
                row_words = [w for w in page.extract_words() if abs(w['top'] - item_word['top']) < 5]
                row_words.sort(key=lambda word: word['x0'])
                row_text = [word['text'] for word in row_words]
                assert len(row_words) >= 6 and item_marker in ' '.join(row_text), (name, row_text)
                amount_index = next(i for i, word in enumerate(row_words) if word['text'] == item_cells[5])
                rate_matches = [i for i, word in enumerate(row_words) if word['text'] == item_cells[4]]
                rate_index = (max if rtl else min)(rate_matches)
                item_index = next(i for i, word in enumerate(row_words) if item_marker in word['text'])
                if rtl:
                    assert amount_index < rate_index < item_index, (name, 'Arabic columns did not mirror', row_text)
                else:
                    assert item_index < rate_index < amount_index, (name, 'English columns out of order', row_text)
            elif case == 'specimen-long':
                assert len(pdf.pages) > 1, name
                markers = re.findall(r'TEST-LINE-\d{2}', text)
                assert sorted(markers) == [f'TEST-LINE-{i:02}' for i in range(1,45)], (name, markers)
                assert '3,080.00' in text, name
                xs = [c for p in pdf.pages for c in p.chars if c['text'] == 'X']
                assert len(xs) == 100, (name, 'long code lost')
                long_page = next(p for p in pdf.pages if any(c['text']=='X' for c in p.chars))
                item_row = next((t, i, r) for t in long_page.find_tables() for i,r in enumerate(t.extract()) if any('LONG-CODE-' in (c or '') for c in r))
                t, i, r = item_row
                cell_index = next(j for j,c in enumerate(r) if 'LONG-CODE-' in (c or ''))
                box = t.rows[i].cells[cell_index]
                assert min(c['x0'] for c in xs)>=box[0] and max(c['x1'] for c in xs)<=box[2], (name,'long code overlaps another column')
                assert all('Page /' not in t and 'صفحة /' not in t for t in texts), (name, 'broken page-number placeholder')
            elif case == 'specimen-discount-tax':
                assert len(pdf.pages)==1, name
                for value in ('180.00','27.00','207.00','20.00 (10%)'):
                    assert value in text, (name,value)
            elif case == 'specimen-return':
                assert len(pdf.pages)==1 and '-70.00' in text and 'ACC-PINV-2026-00002' in text, name
                assert select(invoice,'bnd-inv-status'), (name,'draft status missing')
            results[name] = dict(pages=len(pdf.pages), direction=invoice.get('dir'), item_columns='mirrored' if rtl else 'left-to-right')
            (root / (name + '-text.txt')).write_text(text,encoding='utf-8')
(root / 'pdf-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
