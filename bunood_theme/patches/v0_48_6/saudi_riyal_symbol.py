"""SAR's currency mark becomes the Saudi riyal sign, U+20C1 (THE OWNER, 2026-09-28)."""

from bunood_theme.riyal import ensure_riyal_sign


def execute():
    print("bunood_theme riyal sign:", ensure_riyal_sign())
