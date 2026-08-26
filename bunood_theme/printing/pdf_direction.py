# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Direction-corrected ``pdf_header_html`` / ``pdf_footer_html`` — item 35 (S4).

THE GAP THIS CLOSES, PRECISELY. wkhtmltopdf and the chrome generator render a
document's header and footer as SEPARATE documents, through Frappe's
``pdf_header_html``/``pdf_footer_html`` hooks, whose implementations compute
``layout_direction`` from an ``is_rtl`` bound with ``from ... import`` at
module import time. ``bunood_theme/i18n/rtl_patch.py`` corrects the module
ATTRIBUTE at app load — which reaches those bindings only when the apps load
FIRST, an import-order accident: any app that imports ``frappe.utils.pdf`` at
module level flips the order and silently re-opens the gap (measured in the
item-35 census, 2026-08-26; the suite's ``benchPyHostileImport`` reproduces
exactly that order and these hooks are what keep its checks green).

THE MECHANISM: LAST WINS, SO DELEGATE AND CORRECT. ``prepare_header_footer``
calls ``frappe.get_hooks(...)[-1]`` (``frappe/utils/pdf.py:377``, measured) —
hooks accumulate in installed-app order and ``bunood_theme`` loads after
``frappe``, so registering here takes the slot. Each wrapper calls Frappe's own
implementation (no fork, no re-render, upstream context changes flow through
untouched) and then corrects ONLY the emitted ``dir`` attribute, ONLY in the
one direction that can be wrong: :func:`bunood_theme.setup.is_rtl` is a strict
superset of Frappe's four codes, so Frappe can under-report RTL but never
over-report it — ``ltr`` → ``rtl`` is the only correction that exists.

The regex is anchored to the ``<html`` tag so a ``dir="ltr"`` inside the
letterhead's own content (the bilingual footer isolates phone numbers exactly
that way) is never touched. If upstream ever quotes or reshapes the attribute,
the sub silently stops matching and behaviour falls back to stock — not worse,
and the suite's ``direction:`` checks catch it by measuring the output.
"""

from __future__ import annotations

import re

from frappe.utils.pdf import pdf_footer_html as _frappe_footer
from frappe.utils.pdf import pdf_header_html as _frappe_header

from bunood_theme.setup import is_rtl

#: The template emits ``<html lang={{ lang }} dir={{ layout_direction }}>`` —
#: unquoted (both the wkhtml and the chrome header/footer templates, measured).
#: Anchored to the tag; first occurrence only.
_DIR_LTR = re.compile(r"(<html\b[^>]*?)\bdir=ltr\b")


def _corrected(html: str) -> str:
    if html and is_rtl():
        return _DIR_LTR.sub(r"\1dir=rtl", html, count=1)
    return html


def pdf_header_html(soup, head, content, styles, html_id, css, path=None):
    """Frappe's header render, with the document direction corrected."""
    return _corrected(_frappe_header(soup, head, content, styles, html_id, css, path=path))


def pdf_footer_html(soup, head, content, styles, html_id, css, path=None):
    """Frappe's footer render, with the document direction corrected."""
    return _corrected(_frappe_footer(soup, head, content, styles, html_id, css, path=path))
