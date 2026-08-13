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

WHAT THIS DELIBERATELY DOES NOT FIX
    ``frappe/www/printview.py`` and ``frappe/utils/pdf.py`` both bind
    ``is_rtl`` at import time, in a module this app doesn't own, and Frappe
    offers no documented hook into either. Reaching them would mean
    reassigning the name INSIDE those specific modules before they are
    first imported in a given worker process — a real but undocumented,
    worker-lifecycle-dependent trick this app has otherwise consistently
    avoided. Print preview and PDF generation for the newly-reachable
    languages therefore stay as they are today: not worse, just not
    improved by this patch.

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
