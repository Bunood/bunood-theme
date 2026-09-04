"""Build Arabic-only PDF faces from the verified official hinted Noto TTFs.

Usage: python tools/prepare_naskh_fonts.py /path/to/extracted/NotoNaskhArabic-v2.021
Requires fontTools. The app itself has no fontTools runtime dependency.
"""
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

source = Path(sys.argv[1]) / 'NotoNaskhArabic/hinted/ttf'
destination = Path(__file__).resolve().parents[1] / 'bunood_theme/public/fonts/noto-naskh'
for weight in ('Regular', 'Bold'):
    filename = f'NotoNaskhArabic-{weight}.ttf'
    font = TTFont(source / filename)
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    # Noto's ASCII digits/punctuation have different vertical metrics from the
    # Latin fallback. Keep whole Latin runs in one face, even in old Qt PDF.
    keep = [cp for cp in font.getBestCmap() if cp > 0xFF]
    job = subset.Subsetter(options=options)
    job.populate(unicodes=keep)
    job.subset(font)
    font.save(destination / filename)
    assert not any(cp <= 0xFF for cp in font.getBestCmap())
    assert all(cp in font.getBestCmap() for cp in (0x0627, 0x0644, 0x0645))
    print(f'{filename}: {len(font.getBestCmap())} Unicode entries; Latin runs use the existing fallback')
