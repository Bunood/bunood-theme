# Noto Naskh Arabic for documents

Arabic subsets of static, hinted Regular and Bold TTFs from the official release:
https://github.com/notofonts/arabic/releases/tag/NotoNaskhArabic-v2.021

Archive SHA256:
`6c050ab9bd087d69b733c505a7576e60c528c2f33cd7b91005a5bd7da4514032`

Source paths: `NotoNaskhArabic/hinted/ttf/NotoNaskhArabic-{Regular,Bold}.ttf`.
Redistributed under the included SIL Open Font License (`OFL.txt`).

Prepared with `tools/prepare_naskh_fonts.py`: Basic Latin and Latin-1 mappings
are omitted so ASCII labels, numbers and punctuation stay in the same Latin
fallback face. Mixing Noto digit metrics with DejaVu Latin split invoice IDs
and URLs during Qt PDF extraction. Arabic shaping and hinting are retained.
No Reserved Font Name is declared in the upstream license. Rebuild by passing
the extracted release directory to that script; fontTools is a dev dependency.

Print CSS self-hosts the files for browser previews. `_sync_style()` also copies
them into the shared sites fontconfig directory for wkhtmltopdf, including its
isolated header/footer renderer. No operating-system fonts or user's desktop
preferences are modified. This package does not add a runtime CDN dependency.
