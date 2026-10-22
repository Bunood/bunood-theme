"""Every string the app shows has its Arabic, in every plural form it needs."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import i18n  # noqa: E402


def test_arabic_covers_every_string():
	assert i18n.missing("ar") == []


def test_counted_strings_need_all_six_arabic_forms():
	wanted = {ctx for msgid, ctx in i18n.extract() if msgid == "{0} employees"}
	assert wanted == {f"Bunood HR count:{c}" for c in i18n.ARABIC_CATEGORIES}


def test_a_dropped_translation_is_reported(tmp_path, monkeypatch):
	po = (i18n.ROOT / "bunood_hr" / "locale" / "ar.po").read_text(encoding="utf-8")
	cut = po.replace('msgstr "بانتظار قرارك"', 'msgstr ""')
	assert cut != po
	(tmp_path / "bunood_hr" / "locale").mkdir(parents=True)
	(tmp_path / "bunood_hr" / "locale" / "ar.po").write_text(cut, encoding="utf-8")
	strings = i18n.extract()  # read from the real sources before ROOT moves
	monkeypatch.setattr(i18n, "ROOT", tmp_path)
	monkeypatch.setattr(i18n, "extract", lambda: strings)
	assert i18n.missing("ar") == [("Waiting for your decision", "Bunood HR")]


def test_javascript_agrees_on_the_arabic_categories():
	import shutil
	import subprocess

	if not shutil.which("node"):
		return
	out = subprocess.run(
		[
			"node",
			"-e",
			"const r=new Intl.PluralRules('ar');console.log([0,1,2,3,10,11,99,100,12.5].map(n=>r.select(n)).join(' '))",
		],
		capture_output=True,
		text=True,
		check=True,
	).stdout.split()
	assert out == ["zero", "one", "two", "few", "few", "many", "many", "other", "other"]
	assert set(out) <= set(i18n.ARABIC_CATEGORIES)
