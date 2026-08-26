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
import re
from functools import lru_cache

import frappe

from bunood_theme import assets
from bunood_theme.email import substitute, tokens

#: Marker-axis key in the compiled sheet -> the Theme Settings field it obeys.
#: The compiled ``print/print.scss`` carries every section pole in a
#: ``/*BND <axis>=<slug>*/ ... /*BND-END*/`` block (sass keeps CSS comments in
#: expanded output — verified); :func:`_assemble` keeps exactly the active
#: ones. The NEUTRAL value has no block: absence is the stand-down.
AXES = {
    "hd": "print_header_style",
    "tb": "print_table_style",
    "tt": "print_totals_style",
    "hg": "print_heading_style",
    "acc": "print_accent",
}

#: The value that means "emit nothing" per axis. `Original` for the section
#: axes; the accent's neutral is `Brand headings` — the sheet as authored.
NEUTRAL = {
    "print_header_style": "Original",
    "print_table_style": "Original",
    "print_totals_style": "Original",
    "print_heading_style": "Original",
    "print_accent": "Brand headings",
}

_BLOCK = re.compile(r"/\*BND (\w+)=([\w-]+)\*/(.*?)/\*BND-END\*/", re.S)


def _slug(value: str) -> str:
    return value.strip().lower().replace(" ", "-")


def _assemble(css: str, settings) -> str:
    """Keep the active pole blocks, drop the rest, refuse the unknown.

    A kept block's opening marker becomes a ``/* bnd-<axis>-<slug> */``
    breadcrumb — greppable by the suite, and self-documenting in the record.
    An axis value that is neither the neutral nor a block that exists RAISES:
    a sheet assembled around a guess would ship a look nobody chose, silently,
    to every printed document. The ``triple()``/``substitute()`` doctrine.
    """
    from bunood_theme.presets import PRINT_DEFAULTS

    known: dict[str, set] = {}
    for axis, slug, _body in _BLOCK.findall(css):
        if axis not in AXES:
            raise KeyError(f"print sheet carries a block for unknown axis {axis!r}")
        known.setdefault(axis, set()).add(slug)

    active: dict[str, str | None] = {}
    for axis, field in AXES.items():
        value = (settings.get(field) if settings else None) or PRINT_DEFAULTS[field]
        if value == NEUTRAL[field]:
            active[axis] = None
            continue
        slug = _slug(value)
        if slug not in known.get(axis, set()):
            raise KeyError(
                f"{field} is {value!r}, and the compiled sheet has no /*BND {axis}={slug}*/ "
                "block — an unoffered value, or a pole whose block was never authored"
            )
        active[axis] = slug

    def one(match):
        axis, slug, body = match.group(1), match.group(2), match.group(3)
        if active.get(axis) == slug:
            return f"/* bnd-{axis}-{slug} */" + body
        return ""

    return _BLOCK.sub(one, css)


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
        # SETTINGS DRIVES BOTH HALVES from the same document: which pole
        # blocks survive (_assemble) and which hexes replace the tokens
        # (substitute) — so a save can never ship one half of a choice.
        if settings is None:
            settings = frappe.get_cached_doc("Theme Settings")
        return substitute(_assemble(css, settings), tokens("light", settings))
    except Exception:
        frappe.log_error(title="bunood_theme: print stylesheet stood down")
        return ""
