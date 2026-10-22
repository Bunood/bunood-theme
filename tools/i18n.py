#!/usr/bin/env python3
"""The app's translatable strings, and which of them ar.po does not cover.

Sources are English and every one carries the context ``Bunood HR``; a string
counted with ``count(n, '…')`` carries ``Bunood HR count:<category>`` and needs
one translation per Arabic plural category (zero, one, two, few, many, other).

``python3 tools/i18n.py`` lists the strings with no Arabic translation.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTEXT = "Bunood HR"
ARABIC_CATEGORIES = ("zero", "one", "two", "few", "many", "other")

JS_STRING = r"""(?P<q>['"])(?P<s>(?:\\.|(?!(?P=q)).)*?)(?P=q)"""
JS_CALL = re.compile(r"(?<![\w.])__\(\s*" + JS_STRING)
JS_COUNT = re.compile(r"(?<![\w.])count\([^,()]+(?:\([^()]*\))?[^,()]*,\s*" + JS_STRING)
COMMENTS = re.compile(r"/\*.*?\*/|<!--.*?-->|(?<![:\"'])//[^\n]*", re.S)
PY_CALL = re.compile(r"_\(\s*" + JS_STRING + r"\s*,\s*context\s*=\s*['\"]" + re.escape(CONTEXT) + r"['\"]")


def _unescape(s: str) -> str:
	return s.replace("\\'", "'").replace('\\"', '"')


def extract() -> set[tuple[str, str]]:
	"""(msgid, msgctxt) pairs the app asks to be translated."""
	found = set()
	for path in (ROOT / "frontend" / "src").rglob("*"):
		if path.suffix not in (".vue", ".js"):
			continue
		# Strings in comments (examples in a docstring) are not shown to anyone.
		text = COMMENTS.sub("", path.read_text(encoding="utf-8"))
		for m in JS_CALL.finditer(text):
			found.add((_unescape(m.group("s")), CONTEXT))
		for m in JS_COUNT.finditer(text):
			for cat in ARABIC_CATEGORIES:
				found.add((_unescape(m.group("s")), f"{CONTEXT} count:{cat}"))
	for path in (ROOT / "bunood_hr").rglob("*.py"):
		for m in PY_CALL.finditer(path.read_text(encoding="utf-8")):
			found.add((_unescape(m.group("s")), CONTEXT))
	# Values the UI passes to __() as data rather than literals: document types.
	for doc in (
		"Passport",
		"Contract",
		"Iqama",
		"Work Permit",
		"National ID",
		"Saudi Council of Engineers",
		"Driving License",
		"Health Insurance",
		"Other",
		"Leave",
		# Today.vue picks the greeting by the hour and passes it on as a variable.
		"Good morning, {0}",
		"Good evening, {0}",
	):
		found.add((doc, CONTEXT))
	return found


def read_po(path: Path) -> dict[tuple[str, str], str]:
	"""A minimal PO reader: msgctxt, msgid and msgstr on single lines."""
	entries, ctx, mid = {}, None, None
	for line in path.read_text(encoding="utf-8").splitlines():
		if line.startswith("msgctxt "):
			ctx = _po(line[8:])
		elif line.startswith("msgid "):
			mid = _po(line[6:])
		elif line.startswith("msgstr ") and mid:
			entries[(mid, ctx or "")] = _po(line[7:])
			ctx = mid = None
	return entries


def _po(quoted: str) -> str:
	return quoted.strip()[1:-1].replace('\\"', '"').replace("\\\\", "\\")


def missing(lang: str = "ar") -> list[tuple[str, str]]:
	po = read_po(ROOT / "bunood_hr" / "locale" / f"{lang}.po")
	return sorted(k for k in extract() if not po.get(k))


if __name__ == "__main__":
	gaps = missing()
	for msgid, ctx in gaps:
		print(f"{ctx}\t{msgid}")
	print(f"i18n: {len(gaps)} missing" if gaps else "i18n: complete")
	sys.exit(1 if gaps else 0)
