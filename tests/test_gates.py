"""The front-end gates: each catches a planted violation, and the sources are clean."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import gates  # noqa: E402


@pytest.mark.parametrize(
	"name, text, rule",
	[
		("A.vue", '<div class="ml-2 flex">', "rtl"),
		("A.vue", '<div class="md:pr-4">', "rtl"),
		("A.vue", '<p class="text-right">', "rtl"),
		("A.vue", '<div class="absolute left-0">', "rtl"),
		("a.css", ".x { margin-left: 4px; }", "rtl"),
		("a.css", ".x { text-align: right; }", "rtl"),
		("A.vue", '<div style="color: #16181d">', "tokens"),
		("a.css", ".x { background: rgb(0 0 0 / 0.4); }", "tokens"),
		("A.vue", '<div class="bg-red-500">', "palette"),
		("A.vue", '<span class="hover:text-white">', "palette"),
		("A.vue", '<span class="bg-surface-red-7">', "status"),
		("A.vue", '<span class="text-ink-green-3">', "status"),
		("a.css", '@font-face { font-family: "X"; }', "fonts"),
		("A.vue", '<link href="https://fonts.googleapis.com/css2?family=Cairo">', "fonts"),
		("A.vue", '<div data-bnd-part="x">', "theme"),
		("A.vue", '<div class="bnd-card">', "theme"),
		("A.vue", "<div :style=\"{ color: 'var(--bnd-ink)' }\">", "theme"),
	],
)
def test_each_gate_catches_its_violation(name, text, rule):
	found = gates.check(name, text)
	assert any(f": {rule}:" in f for f in found), found


@pytest.mark.parametrize(
	"name, text",
	[
		("A.vue", '<span class="lucide-chevron-left size-4 rtl:hidden">'),
		("A.vue", '<div class="ms-2 pe-4 text-start start-0 border-e">'),
		("A.vue", "function left(days) { return days }"),
		("A.vue", '<span class="bg-surface-red-2 text-ink-red-7 border-outline-red-2">'),
		("A.vue", "<span>&#x20C1;</span>"),
		("A.vue", "<!-- #fff in a comment is not a colour -->"),
		("theme.css", "html { --surface-base: var(--bnd-surface); --surface-red-7: x; }"),
	],
)
def test_allowed_forms_pass(name, text):
	assert gates.check(name, text) == []


def test_the_sources_are_clean():
	assert gates.run() == []
