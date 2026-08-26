# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The one place this app monkey-patches Frappe core, and why it's safe here.

WHAT
    ``frappe.utils.jinja_globals.is_rtl()`` exact-matches four language codes
    with no parent resolution (see ``bunood_theme/setup.py``'s ``RTL_LANGS``
    and ``docs/upstream/frappe-is-rtl.md`` for the full defect). This module
    replaces the MODULE ATTRIBUTE ``frappe.utils.jinja_globals.is_rtl`` with
    a corrected drop-in — same signature, right answer — once, at app-load
    time.

WHY THIS ONE PATCH IS SAFE WHEN THE OBVIOUS ALTERNATIVES ARE NOT
    Python's ``from X import Y`` binds a NAME at import time; patching
    ``X.Y`` afterward does nothing for code that already did that import.
    That rules out ``frappe/www/desk.py``, ``frappe/www/printview.py`` and
    ``frappe/utils/pdf.py`` — all three do exactly that, and none is
    reachable from here or from any hook Frappe documents (see "What this
    deliberately does not fix" below).

    ``bundled_asset()``, defined in the SAME module as ``is_rtl``, is
    different: it calls ``is_rtl(rtl)`` as a plain name resolved from ITS
    OWN module's namespace on every call — so reassigning the module
    attribute here is picked up immediately, with no import-order race to
    get right. That is the one piece a patch can close safely. The desk's
    own ``dir`` attribute is fixed separately and without any patching at
    all, via ``context.py``'s existing ``update_website_context`` hook; and
    ``templates/base.html``'s Jinja-level ``{{ is_rtl() }}`` via the
    ``jinja.methods`` entry in ``hooks.py`` — both point at
    :func:`is_rtl` below, so there is exactly one corrected function, used
    three ways.

WHAT THIS DOES NOT FIX — AND WHAT NOW FIXES IT (item 35, 2026-08-26)
    ``frappe/www/printview.py`` and ``frappe/utils/pdf.py`` both bind
    ``is_rtl`` at import time. This patch reaches those bindings only when
    the apps load BEFORE those modules — true in the common worker
    lifecycle (they import lazily, on first request), but an ACCIDENT of
    import order: any app importing ``frappe.utils.pdf`` at module level
    flips it and silently restores the broken four-code answer. Measured in
    the item-35 census; the suite's ``benchPyHostileImport`` reproduces the
    hostile order on purpose.

    So item 35 closed both halves STRUCTURALLY, without touching either
    binding: the document's ``layout_direction`` is overwritten in
    ``context.py``'s printview branch (an ordinary context key, set after
    ``get_context`` — and ``frappe.get_print`` renders /printview
    internally, so the PDF body inherits it), and the PDF header/footer
    sub-documents go through ``printing/pdf_direction.py``, which takes the
    last-wins ``pdf_header_html``/``pdf_footer_html`` hook slot, delegates
    to Frappe's implementations and corrects only the emitted ``dir``.
    What remains upstream-only: WeasyPrint (its template hardcodes
    ``lang="en"`` with no ``dir`` at all) and the four-code list itself —
    ``docs/upstream/frappe-is-rtl.md`` is still worth filing.

WHY IT LIVES IN AN __init__.py IMPORT, NOT A DECLARATIVE HOOK
    Frappe has no "run this once at app load" hook for replacing a module
    attribute — only ``frappe.get_hooks("jinja")`` for Jinja-global-level
    overrides (used alongside this in ``hooks.py``). Importing this module
    from ``bunood_theme/__init__.py`` is the earliest point in this app's
    own lifecycle: well before any request-scoped lazy import of
    ``frappe/www/desk.py`` can happen in a fresh worker.
"""

import frappe.utils.jinja_globals as _jinja_globals

from bunood_theme.setup import is_rtl as _is_rtl_lang


def is_rtl(rtl=None):
    """Drop-in replacement for ``frappe.utils.jinja_globals.is_rtl``.

    Same signature and the same "already-know-the-answer" passthrough — a
    caller that already resolved the boolean (``bundled_asset(path, rtl=)``,
    for instance) gets it back unchanged. Only the ``None`` branch differs:
    where Frappe checks four hardcoded codes, this asks
    :func:`bunood_theme.setup.is_rtl` for the current request's language,
    which resolves parents and covers every code in ``RTL_LANGS``.
    """
    if rtl is not None:
        return rtl
    return _is_rtl_lang()


_jinja_globals.is_rtl = is_rtl
