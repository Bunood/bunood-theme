"""ZATCA — Saudi e-invoicing, as far as the theme carries it.

Everything ZATCA-specific lives here rather than under ``printing/`` because it
is a COMPLIANCE concern with its own external dependency (lavaloon's
``ksa_compliance``), not a look: the receipt format, the Phase-1 QR fallback,
and — later — whatever else the tax authority's rules oblige. ``printing/``
stays the generic funnel (style, macros, installer); it reads this package's
format list and calls its helper, never the other way round.

Arrived as item 41 (Hesham's ZATCA Phase-1 work, re-merged from
``studio-zatca`` on 2026-09-02) and moved into its own directory at the user's
direction the same day.

Defensive throughout, like the rest of printing: a site without
``ksa_compliance`` renders a stated warning and an empty QR, never a crash.
This module imports no frappe so tooling can read ``FORMATS`` without a bench.
"""

import os

#: The Phase-1 settings doctype ``ksa_compliance`` installs. Its presence is the
#: guard on every Phase-1 code path here; its absence (the dev site) is the
#: degradation the formats are written for.
PHASE1_DOCTYPE = "ZATCA Phase 1 Business Settings"

#: This package's directory. ``printing/install.py`` reads each spec's ``file``
#: from ``<dir>/formats/``, exactly as it does for its own.
DIR = os.path.dirname(os.path.abspath(__file__))

#: The formats this package ships — the same shape as
#: ``printing.install.FORMATS`` plus ``dir``, so the installer knows where to
#: read from. Managed exactly like the «بونود - …» ones: the file is the truth,
#: and a migrate overwrites desk edits.
FORMATS = [
    {
        "name": "زاتكا - فاتورة مبسطة (حراري 80مم)",
        "doctype": "Sales Invoice",
        "file": "sales_invoice_zatca_thermal.html",
        "dir": DIR,
    },
]
