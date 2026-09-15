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
            words=page.extract_words(extra_attrs=['size'])
            title=min((w for w in words if w['size']>=15),key=lambda w:w['top'])
            def green(shape):
                colour=shape.get('non_stroking_color') or shape.get('stroking_color') or ()
                return len(colour)==3 and colour[1]>max(colour[0],colour[2])
            # The shipped Wash Card composition is a rounded green panel. A
            # Hairline composition is a green rule. Accept either physical
            # primitive, then prove that it finishes before the document title.
            treatments=[
                shape for shape in [*page.curves,*page.rects]
                if shape['width']>page.width*.75 and green(shape)
                and shape['top']<title['top']
            ]
            assert treatments, (name,'missing green header treatment')
            treatment=min(treatments,key=lambda shape:shape['top'])
            assert treatment['bottom']<title['top']-5, (name,'header collides with invoice title')
            header=[c for c in page.chars if treatment['top']<=c['top'] and c['bottom']<=treatment['bottom']]
            assert header, (name,'company identity is missing from header')
            assert all(treatment['x0']-1<=c['x0'] and c['x1']<=treatment['x1']+1 for c in header), (name,'text escapes header width')
            header_words=[w for w in words if treatment['top']<=w['top'] and w['bottom']<=treatment['bottom']]
            assert header_words, (name,'company name lost')
            company=(min if language=='en' else max)(header_words,key=lambda word:word['x0'])
            if fixture=='long-name':
                # Company and registration occupy disjoint physical regions.
                if language=='en':
                    assert company['x1']<page.width*.56, (name,'name crosses into registration')
                else:
                    assert company['x0']>page.width*.44, (name,'RTL name crosses into registration')
            if fixture.startswith('logo'):
                images=[i for i in page.images if treatment['top']<=i['top'] and i['bottom']<=treatment['bottom']]
                assert len(images)==1 and images[0]['width']<=31 and images[0]['height']<=23, (name,'logo is missing or oversized')
                image=images[0]
                assert all(c['x1']<=image['x0'] or c['x0']>=image['x1'] or c['bottom']<=image['top'] or c['top']>=image['bottom'] for c in header), (name,'inline logo overlaps name')
                ratio={'logo':4,'logo-square':1,'logo-wide':10}[fixture]
                assert abs(images[0]['width']/images[0]['height']-ratio)<.02, (name,'logo is distorted')
                edge='x1' if language=='ar' else 'x0'
                # The Wash Card treatment deliberately gives the identity row
                # an 18px (13.5pt) breathing edge; keep it close to that edge
                # without incorrectly requiring it to touch the panel.
                inset=abs(images[0][edge]-treatment[edge])
                assert 8<=inset<=16, (name,'logo lost reading-start alignment',inset)
            results[name]={'pages':1,'header_bottom':round(treatment['bottom'],2)}
(root/'fixture-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(f'Header edge cases: {len(results)} PDFs passed.')
