#!/usr/bin/env python3
"""The design language's rules, checked over the app's own front-end sources.

Bunood Design Language: "The rules are checked, not remembered … A new app adopts
all of them before its first screen." Each gate below names the rule it holds:

- rtl:      logical properties only; no physical left/right in classes or CSS.
- tokens:   no colour by value (hex, rgb(), hsl(), oklch()) outside comments.
- palette:  no raw Tailwind palette step (`bg-red-500`, `text-white`): it compiles
            to a fixed colour the theme cannot reach.
- status:   the four status hues only on the steps the bridge re-points
            (surface 1-3, ink 6-9, outline 1-3).
- fonts:    no font of our own: no @font-face, no font file, no font CDN.
- theme:    none of the theme's own names (`data-bnd-*`, `.bnd-*`) in our markup;
            `--bnd-*` tokens are read in the bridge (theme.css) and nowhere else.

Run: ``python3 tools/gates.py`` (exit 1 on any finding). ``check(path, text)`` is
the unit the tests drive with planted violations.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
BRIDGE = "theme.css"

PHYSICAL_CLASS = re.compile(
	r"(?<![\w:-])-?(?:[a-z-]+:)*"
	r"(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br"
	r"|scroll-ml|scroll-mr|scroll-pl|scroll-pr|space-x-reverse)-[\w\[\].\/%-]+"
	r"|(?<![\w-])(?:text-left|text-right|float-left|float-right|clear-left|clear-right)(?![\w-])"
)
PHYSICAL_CSS = re.compile(
	r"(?<![\w-])(?:margin-left|margin-right|padding-left|padding-right|border-left|border-right"
	r"|border-top-left|border-top-right|border-bottom-left|border-bottom-right|left|right)\s*:"
	r"|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)"
)
COLOUR_LITERAL = re.compile(r"(?<![&\w])#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(")
PALETTE = re.compile(
	r"(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via|decoration|accent|caret|shadow)-"
	r"(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue"
	r"|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?![\w-])"
)
STATUS_STEP = re.compile(r"(?<![A-Za-z0-9_])(surface|ink|outline)-(blue|green|amber|red)-(\d+)(?![\w-])")
ALLOWED_STEPS = {"surface": range(1, 4), "ink": range(6, 10), "outline": range(1, 4)}
FONT = re.compile(r"@font-face|fonts\.googleapis|fonts\.gstatic", re.I)
THEME_NAMES = re.compile(r"data-bnd-|(?<![\w-])\.?bnd-(?![\w-]*:)")
THEME_TOKEN = re.compile(r"--bnd-")
FONT_FILES = (".woff", ".woff2", ".ttf", ".otf", ".eot")

COMMENTS = re.compile(r"/\*.*?\*/|<!--.*?-->|(?<![:\"'])//[^\n]*", re.S)


def _strip_comments(text: str) -> str:
	# Keep line numbers: replace each comment by as many newlines as it spanned.
	return COMMENTS.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def check(path: str, text: str) -> list[str]:
	findings = []
	name = Path(path).name
	body = _strip_comments(text)
	for lineno, line in enumerate(body.splitlines(), 1):
		where = f"{path}:{lineno}"
		for m in PHYSICAL_CLASS.finditer(line):
			findings.append(
				f"{where}: rtl: physical class `{m.group(0)}`; use the logical one (ms-/me-/ps-/pe-/start-/end-/text-start)"
			)
		if name.endswith((".css", ".vue")):
			for m in PHYSICAL_CSS.finditer(line):
				findings.append(f"{where}: rtl: physical property `{m.group(0)}`; use the logical one")
		for m in COLOUR_LITERAL.finditer(line):
			findings.append(
				f"{where}: tokens: colour by value `{m.group(0)}`; use a semantic class or the bridge"
			)
		for m in PALETTE.finditer(line):
			findings.append(f"{where}: palette: raw palette step `{m.group(0)}`; use a semantic class")
		for m in STATUS_STEP.finditer(line):
			kind, _hue, step = m.group(1), m.group(2), int(m.group(3))
			if step not in ALLOWED_STEPS[kind] and name != BRIDGE:
				findings.append(f"{where}: status: `{m.group(0)}` is not a step the bridge re-points")
		if FONT.search(line):
			findings.append(f"{where}: fonts: the app loads no font of its own; the theme supplies them")
		if THEME_NAMES.search(line) and name != BRIDGE:
			findings.append(f"{where}: theme: the theme's own names are not ours to use")
		if THEME_TOKEN.search(line) and name != BRIDGE:
			findings.append(f"{where}: theme: read `--bnd-*` tokens through the bridge, not in components")
	return findings


def run(root: Path = SRC) -> list[str]:
	findings = []
	for path in sorted(root.rglob("*")):
		if path.suffix in FONT_FILES:
			findings.append(f"{path.relative_to(ROOT)}: fonts: font file in the app")
		if path.suffix in (".vue", ".js", ".css", ".html") and path.is_file():
			findings.extend(check(str(path.relative_to(ROOT)), path.read_text(encoding="utf-8")))
	index = ROOT / "frontend" / "index.html"
	findings.extend(check(str(index.relative_to(ROOT)), index.read_text(encoding="utf-8")))
	return findings


if __name__ == "__main__":
	found = run()
	for f in found:
		print(f)
	print(f"gates: {len(found)} finding(s)" if found else "gates: clean")
	sys.exit(1 if found else 0)
