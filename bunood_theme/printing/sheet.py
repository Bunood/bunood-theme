# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The print sheet, substituted per site — item 35's delivery mechanism.

``scss/print/print.scss`` is authored in ordinary ``var(--bnd-*)`` and compiled
by ``build.mjs`` like every other entry, so it carries every build guard the
legacy hand-written CSS never had. This module turns that compiled file into
what a print engine can actually read: every token substituted for a concrete
hex from ``palette.derive()`` — **the item-34 mechanism, fourth consumer**
(``brand.py`` formats the derivation, ``email.py`` substitutes it into mail,
``tools/contrast_gate.py`` measures it, and this substitutes it onto paper).

The result is written into the Print Style "Bunood" record by
``printing/install.py`` — at install, at migrate, and on every Theme Settings
save — because the census (2026-08-26) established that the Print Style record
is one of only three CSS injection points a print document has, and the only
one that is global, ours, and seed-carriable.

PAPER IS LIGHT-ONLY. ``_print.scss`` (item 8) states the doctrine — dark
backgrounds waste toner and print illegibly — so the substitution always runs
the LIGHT derivation. There is no dark print sheet and none is owed.

THE STAND-DOWN IS TOTAL AND VISIBLE, the ``email.py`` contract inherited
whole: ``substitute`` throws on an unknown token and refuses a half-done job,
:func:`print_css` catches everything, logs, and returns ``""`` — and the SYNC
refuses to write that emptiness over a working record, because a stale good
sheet beats a fresh empty one.
"""

from __future__ import annotations

import os
from functools import lru_cache

import frappe

from bunood_theme import assets
from bunood_theme.email import substitute, tokens


@lru_cache(maxsize=2)
def _sheet(path: str, _stamp: float) -> str:
    """The compiled sheet's text, cached per (path, mtime).

    ``_stamp`` is unused in the body on purpose: it exists so a rebuilt file
    (new mtime) misses the cache — the ``email.py::_sheet`` shape exactly.
    """
    with open(path, encoding="utf-8") as f:
        return f.read()


def sheet_path() -> str:
    """Absolute filesystem path of the compiled print sheet.

    Read off the PACKAGE rather than through ``bundled_asset()`` for the same
    two reasons ``email.py`` gives: no dependence on a CWD-relative existence
    check, and no ``assets.json`` indirection to go stale.
    """
    if not getattr(assets, "PRINT_CSS", None):
        raise FileNotFoundError("assets.PRINT_CSS is unset — run `npm run build`")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "public",
        "dist",
        "css",
        os.path.basename(assets.PRINT_CSS),
    )


def print_css(settings=None) -> str:
    """The fully-substituted print sheet for this site, or ``""``.

    Args:
        settings: an already-loaded Theme Settings, when the caller has one
            (``on_theme_settings_update`` passes the doc it was handed, so the
            sheet reflects the save that triggered it, not a cached read).

    Returns:
        Concrete CSS with no ``var()`` anywhere, ready for the Print Style
        record — or ``""`` when anything fails, so the caller can refuse to
        write and the degradation is total and visible rather than a
        half-substituted sheet shipping to every printed document.
    """
    try:
        path = sheet_path()
        css = _sheet(path, os.path.getmtime(path))
        return substitute(css, tokens("light", settings))
    except Exception:
        frappe.log_error(title="bunood_theme: print stylesheet stood down")
        return ""
