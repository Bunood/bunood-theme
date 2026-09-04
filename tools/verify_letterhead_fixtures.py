"""Check that long names, absent registration and logos fit real native PDFs."""
import json
import sys
from pathlib import Path
import pdfplumber

root=Path(sys.argv[1])
results={}
for language in ('en','ar'):
    for fixture in ('long-name','no-registration','logo','logo-square','logo-wide'):
        name=fixture+'-'+language
        with pdfplumber.open(root/(name+'.pdf')) as pdf:
            assert len(pdf.pages)==1, (name,'unexpected extra page')
            page=pdf.pages[0]
            rules=[line for line in page.rects if line['height']<=1.5 and line['width']>page.width*.75 and len(line.get('non_stroking_color') or ())==3 and line['non_stroking_color'][1]>max(line['non_stroking_color'][0],line['non_stroking_color'][2])]
            assert rules, (name,'missing green divider')
            divider=min(rules,key=lambda line:line['top'])
            heading=next(w for w in page.extract_words() if w['text']=='ACC-PINV-2026-00002')
            assert divider['top']<heading['top']-10, (name,'header collides with invoice title')
            header=[c for c in page.chars if c['top']<divider['top']]
            assert header and max(c['bottom'] for c in header)<divider['top'], (name,'header text crosses divider')
            assert all(divider['x0']-1<=c['x0'] and c['x1']<=divider['x1']+1 for c in header), (name,'text escapes header width')
            identity=[c for c in header if c['size']>=12]
            assert identity, (name,'company name lost')
            if fixture=='long-name':
                # Company and registration occupy disjoint physical regions.
                if language=='en':
                    assert max(c['x1'] for c in identity)<page.width*.56, (name,'name crosses into registration')
                else:
                    assert min(c['x0'] for c in identity)>page.width*.44, (name,'RTL name crosses into registration')
            if fixture.startswith('logo'):
                images=[i for i in page.images if i['top']<divider['top']]
                assert len(images)==1 and images[0]['width']<=31 and images[0]['height']<=23, (name,'logo is missing or oversized')
                image=images[0]
                assert all(c['x1']<=image['x0'] or c['x0']>=image['x1'] or c['bottom']<=image['top'] or c['top']>=image['bottom'] for c in identity), (name,'inline logo overlaps name')
                ratio={'logo':4,'logo-square':1,'logo-wide':10}[fixture]
                assert abs(images[0]['width']/images[0]['height']-ratio)<.02, (name,'logo is distorted')
                edge='x1' if language=='ar' else 'x0'
                # Native print table cells inset the one-row identity by 6px.
                assert abs(images[0][edge]-divider[edge])<=5, (name,'logo lost reading-start alignment')
            results[name]={'pages':1,'header_bottom':round(divider['top'],2)}
(root/'fixture-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(f'Header edge cases: {len(results)} PDFs passed.')
